-- 1. Habilitar extensões necessárias e garantir colunas da tabela clinicas
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'bronze';
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS status_pagamento TEXT DEFAULT 'teste_gratis';
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS limite_mensagens INTEGER DEFAULT 100;
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS limite_procedimentos INTEGER DEFAULT 5;
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS data_fim_teste TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days');
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Atualizar o trigger de novo usuário para suportar clinica_id pré-definido e role customizada
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nova_clinica_id UUID;
  nome_usuario TEXT;
  meta_clinica_id TEXT;
  meta_role TEXT;
BEGIN
  -- Coleta metadados
  nome_usuario := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Nova Clínica');
  meta_clinica_id := NEW.raw_user_meta_data->>'clinica_id';
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');
  
  -- Se foi enviado um clinica_id no metadata do auth, usa ele. Caso contrário, cria uma nova clínica trial.
  IF meta_clinica_id IS NOT NULL AND meta_clinica_id <> '' THEN
    nova_clinica_id := meta_clinica_id::UUID;
  ELSE
    -- Cria a clinica no trial
    INSERT INTO public.clinicas (nome, plano, status_pagamento, limite_mensagens, limite_procedimentos, data_fim_teste)
    VALUES (nome_usuario, 'bronze', 'teste_gratis', 100, 5, now() + interval '7 days')
    RETURNING id INTO nova_clinica_id;
  END IF;

  -- Cria o perfil
  INSERT INTO public.perfis (id, clinica_id, role, full_name)
  VALUES (NEW.id, nova_clinica_id, meta_role, nome_usuario)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, clinica_id = EXCLUDED.clinica_id, role = EXCLUDED.role;

  -- Mantém a criação no old profiles por compatibilidade
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, nome_usuario)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Insere papel na tabela user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'user_role', 'user')::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. Adicionar políticas de acesso RLS para os Super Admins
-- Habilitar super admins a ler, inserir, atualizar e excluir clínicas diretamente
DROP POLICY IF EXISTS "Super admins gerenciam clinicas" ON public.clinicas;
CREATE POLICY "Super admins gerenciam clinicas" ON public.clinicas
FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
)
WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
);

-- Habilitar super admins a ler, inserir, atualizar e excluir perfis diretamente
DROP POLICY IF EXISTS "Super admins gerenciam perfis" ON public.perfis;
CREATE POLICY "Super admins gerenciam perfis" ON public.perfis
FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
)
WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
);

-- Habilitar super admins a ler, inserir, atualizar e excluir user_roles diretamente
DROP POLICY IF EXISTS "Super admins gerenciam user_roles" ON public.user_roles;
CREATE POLICY "Super admins gerenciam user_roles" ON public.user_roles
FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
)
WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
);


-- 4. Criar funções auxiliares SECURITY DEFINER para administração

-- Função para criar usuário Auth
CREATE OR REPLACE FUNCTION public.create_auth_user(
  _email TEXT,
  _password TEXT,
  _full_name TEXT,
  _clinica_id UUID,
  _role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
  encrypted_pw TEXT;
BEGIN
  -- Verificação de segurança de e-mail de administrador
  IF NOT (
    (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem criar usuários.';
  END IF;

  -- Verifica se o e-mail já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = _email) THEN
    RAISE EXCEPTION 'Email já cadastrado';
  END IF;

  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(_password, gen_salt('bf'));

  -- Insere na tabela auth.users (o trigger handle_new_user cuidará de criar o perfil, profiles e user_roles)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud,
    confirmation_token
  )
  VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    _email,
    encrypted_pw,
    now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object(
      'full_name', _full_name,
      'clinica_id', _clinica_id::text,
      'role', _role,
      'user_role', CASE WHEN _role = 'super_admin' THEN 'super_admin' ELSE 'user' END
    ),
    now(),
    now(),
    'authenticated',
    'authenticated',
    ''
  );

  RETURN new_user_id;
END;
$$;

-- Função para criar clínica com usuário administrador
CREATE OR REPLACE FUNCTION public.create_clinica_with_admin(
  _clinica_nome TEXT,
  _plano TEXT,
  _status_pagamento TEXT,
  _limite_mensagens INTEGER,
  _limite_procedimentos INTEGER,
  _admin_email TEXT,
  _admin_password TEXT,
  _admin_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_clinica_id UUID;
  new_user_id UUID;
BEGIN
  -- Verificação de segurança de e-mail de administrador
  IF NOT (
    (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem criar clínicas.';
  END IF;

  -- Cria a clínica
  INSERT INTO public.clinicas (
    nome,
    plano,
    status_pagamento,
    limite_mensagens,
    limite_procedimentos,
    data_fim_teste
  )
  VALUES (
    _clinica_nome,
    _plano,
    _status_pagamento,
    _limite_mensagens,
    _limite_procedimentos,
    CASE WHEN _plano = 'ilimitado_premium' THEN NULL WHEN _status_pagamento = 'teste_gratis' THEN now() + interval '7 days' ELSE NULL END
  )
  RETURNING id INTO new_clinica_id;

  -- Cria o usuário associado a ela como admin
  new_user_id := public.create_auth_user(
    _admin_email,
    _admin_password,
    _admin_name,
    new_clinica_id,
    'admin'
  );

  RETURN new_clinica_id;
END;
$$;

-- Função para redefinir senha do usuário
CREATE OR REPLACE FUNCTION public.change_user_password(
  _user_id UUID,
  _new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificação de segurança de e-mail de administrador
  IF NOT (
    (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem redefinir senhas.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = _user_id;

  RETURN TRUE;
END;
$$;

-- Função para excluir usuário
CREATE OR REPLACE FUNCTION public.delete_auth_user(
  _user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificação de segurança de e-mail de administrador
  IF NOT (
    (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem excluir usuários.';
  END IF;

  -- Apagar manualmente das tabelas públicas por segurança (embora tenha ON DELETE CASCADE)
  DELETE FROM public.perfis WHERE id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  
  -- Apagar da tabela auth.users
  DELETE FROM auth.users WHERE id = _user_id;

  RETURN TRUE;
END;
$$;
