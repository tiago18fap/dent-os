-- Migration: Add Super Admin Management features and de-associate super admins from clinics
-- Created at: 2026-05-29

-- 1. Helper function to check if caller is super admin
CREATE OR REPLACE FUNCTION public.is_caller_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.perfis 
    WHERE id = auth.uid() AND (role = 'super_admin' OR role = 'admin_master')
  ) OR (
    (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  );
END;
$$;

-- 2. Update existing functions to use is_caller_super_admin()
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
  -- Verificação de segurança de administrador
  IF NOT public.is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem criar usuários.';
  END IF;

  -- Verifica se o e-mail já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = _email) THEN
    RAISE EXCEPTION 'Email já cadastrado';
  END IF;

  new_user_id := gen_random_uuid();
  encrypted_pw := crypt(_password, gen_salt('bf', 10));

  -- Insere na tabela auth.users
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
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    phone_change_token,
    phone_change,
    reauthentication_token,
    is_sso_user,
    is_anonymous
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
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    false
  );

  -- Insere na tabela auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object(
      'sub', new_user_id::text,
      'email', _email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    new_user_id::text,
    now(),
    now(),
    now()
  );

  RETURN new_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_user_password(
  _user_id UUID,
  _new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificação de segurança de administrador
  IF NOT public.is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem redefinir senhas.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = _user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_auth_user(
  _user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificação de segurança de administrador
  IF NOT public.is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem excluir usuários.';
  END IF;

  -- Apagar das tabelas públicas por segurança
  DELETE FROM public.perfis WHERE id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  
  -- Apagar da tabela auth.users
  DELETE FROM auth.users WHERE id = _user_id;

  RETURN TRUE;
END;
$$;

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
  -- Verificação de segurança de administrador
  IF NOT public.is_caller_super_admin() THEN
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

-- 3. Update handle_new_user trigger to support super admins without clinics
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
  
  -- Se foi enviado um clinica_id no metadata do auth, usa ele.
  -- Caso contrário, se for super_admin, deixa clinica_id como null.
  -- Caso contrário (usuário normal sem clinica_id informado), cria uma nova clínica trial.
  IF meta_clinica_id IS NOT NULL AND meta_clinica_id <> '' THEN
    nova_clinica_id := meta_clinica_id::UUID;
  ELSIF meta_role = 'super_admin' OR meta_role = 'admin_master' THEN
    nova_clinica_id := NULL;
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

-- 4. Create get_super_admins RPC function
CREATE OR REPLACE FUNCTION public.get_super_admins()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificação de segurança de administrador
  IF NOT public.is_caller_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem listar administradores.';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    u.email::TEXT,
    p.role,
    p.created_at
  FROM public.perfis p
  JOIN auth.users u ON p.id = u.id
  WHERE p.role = 'super_admin' OR p.role = 'admin_master' OR u.email IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  ORDER BY p.created_at DESC;
END;
$$;

-- 5. Data Correction: Promote Victor and dissociate Super Admins from clinics

-- Ensure Victor has a super admin profile with NULL clinic
INSERT INTO public.perfis (id, clinica_id, role, full_name)
SELECT id, NULL, 'super_admin', COALESCE(raw_user_meta_data->>'full_name', 'Victor')
FROM auth.users
WHERE email = 'victorpconti@gmail.com'
ON CONFLICT (id) DO UPDATE 
SET clinica_id = NULL, role = 'super_admin';

-- Ensure Victor has the super_admin role in user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE email = 'victorpconti@gmail.com'
ON CONFLICT DO NOTHING;

-- Dissociate other super admins from clinics
UPDATE public.perfis
SET clinica_id = NULL, role = 'super_admin'
WHERE id IN (
  SELECT id FROM auth.users 
  WHERE email IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
) OR role = 'super_admin' OR role = 'admin_master';
