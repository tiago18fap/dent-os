-- Criar tabela clinicas (se não existir)
CREATE TABLE IF NOT EXISTS public.clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    plano TEXT DEFAULT 'bronze',
    status_pagamento TEXT DEFAULT 'teste_gratis',
    limite_mensagens INTEGER DEFAULT 100,
    limite_procedimentos INTEGER DEFAULT 5,
    data_fim_teste TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
    stripe_customer_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.clinicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura clinicas autenticados" ON public.clinicas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir update clinicas autenticados" ON public.clinicas FOR UPDATE TO authenticated USING (true);

-- Criar tabela perfis (se não existir)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'admin',
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura perfis autenticados" ON public.perfis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir update perfis autenticados" ON public.perfis FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Atualiza trigger de novo usuário para criar clínica em teste
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nova_clinica_id UUID;
  nome_usuario TEXT;
BEGIN
  -- Coleta nome
  nome_usuario := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Nova Clínica');
  
  -- Cria a clinica no trial
  INSERT INTO public.clinicas (nome, plano, status_pagamento, limite_mensagens, limite_procedimentos, data_fim_teste)
  VALUES (nome_usuario, 'bronze', 'teste_gratis', 100, 5, now() + interval '7 days')
  RETURNING id INTO nova_clinica_id;

  -- Cria o perfil
  INSERT INTO public.perfis (id, clinica_id, role, full_name)
  VALUES (NEW.id, nova_clinica_id, 'admin', nome_usuario)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Mantém a criação no old profiles por compatibilidade
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, nome_usuario)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
