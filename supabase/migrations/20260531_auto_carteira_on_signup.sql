-- Migration: Update handle_new_user to auto-create carteira_envios on signup
-- Also ensure all existing clinicas have a carteira_envios record
-- Created at: 2026-05-31

-- 1. Ensure all existing clinicas have carteira_envios
INSERT INTO public.carteira_envios (clinica_id, saldo)
SELECT c.id, c.limite_mensagens
FROM public.clinicas c
WHERE NOT EXISTS (
  SELECT 1 FROM public.carteira_envios ce WHERE ce.clinica_id = c.id
)
ON CONFLICT (clinica_id) DO NOTHING;

-- 2. Update trigger to auto-create carteira_envios
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
  meta_clinica_nome TEXT;
  meta_plano TEXT;
  meta_cnpj TEXT;
  limite_msg INTEGER;
  limite_proc INTEGER;
BEGIN
  -- Coleta metadados
  nome_usuario := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Nova Clínica');
  meta_clinica_id := NEW.raw_user_meta_data->>'clinica_id';
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');
  meta_clinica_nome := NEW.raw_user_meta_data->>'clinica_nome';
  meta_plano := COALESCE(NEW.raw_user_meta_data->>'plano_pretendido', 'bronze');
  meta_cnpj := NEW.raw_user_meta_data->>'cnpj';
  
  IF meta_clinica_id IS NOT NULL AND meta_clinica_id <> '' THEN
    nova_clinica_id := meta_clinica_id::UUID;
  ELSIF meta_role = 'super_admin' OR meta_role = 'admin_master' THEN
    nova_clinica_id := NULL;
  ELSE
    -- Define limites com base no plano pretendido
    IF meta_plano = 'prata' THEN
      limite_msg := 1000;
      limite_proc := 30;
    ELSIF meta_plano = 'ouro' THEN
      limite_msg := 5000;
      limite_proc := 999;
    ELSIF meta_plano = 'ilimitado_premium' THEN
      limite_msg := 999999;
      limite_proc := 999999;
    ELSE -- bronze ou trial
      limite_msg := 100;
      limite_proc := 10;
    END IF;

    -- Cria a clinica com todos os dados
    INSERT INTO public.clinicas (
      nome, plano, status_pagamento, limite_mensagens, 
      limite_procedimentos, data_fim_teste, cnpj
    )
    VALUES (
      COALESCE(meta_clinica_nome, nome_usuario), 
      meta_plano, 'teste_gratis', limite_msg, 
      limite_proc, now() + interval '7 days', meta_cnpj
    )
    RETURNING id INTO nova_clinica_id;

    -- Auto-criar carteira de envios com saldo inicial do plano
    INSERT INTO public.carteira_envios (clinica_id, saldo)
    VALUES (nova_clinica_id, limite_msg)
    ON CONFLICT (clinica_id) DO UPDATE SET saldo = EXCLUDED.saldo;
  END IF;

  -- Cria o perfil
  INSERT INTO public.perfis (id, clinica_id, role, full_name)
  VALUES (NEW.id, nova_clinica_id, meta_role, nome_usuario)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, clinica_id = EXCLUDED.clinica_id, role = EXCLUDED.role;

  -- Mantém profiles por compatibilidade
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
