-- Migration: Update handle_new_user trigger to save CNPJ and handle trial plan properly
-- Created at: 2026-05-31

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
  plano_final TEXT;
  status_final TEXT;
BEGIN
  -- Coleta metadados
  nome_usuario := COALESCE(NEW.raw_user_meta_data->>'full_name', 'Nova Clínica');
  meta_clinica_id := NEW.raw_user_meta_data->>'clinica_id';
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'admin');
  meta_clinica_nome := NEW.raw_user_meta_data->>'clinica_nome';
  meta_plano := COALESCE(NEW.raw_user_meta_data->>'plano_pretendido', 'bronze');
  meta_cnpj := NEW.raw_user_meta_data->>'cnpj';
  
  -- Se foi enviado um clinica_id no metadata do auth, usa ele.
  -- Caso contrário, se for super_admin, deixa clinica_id como null.
  -- Caso contrário (usuário normal sem clinica_id informado), cria uma nova clínica.
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

    -- Todos novos cadastros começam como teste_gratis
    -- O plano define os limites, o status será atualizado após pagamento
    plano_final := meta_plano;
    status_final := 'teste_gratis';

    -- Cria a clinica com CNPJ, nome e plano
    INSERT INTO public.clinicas (
      nome, 
      plano, 
      status_pagamento, 
      limite_mensagens, 
      limite_procedimentos, 
      data_fim_teste,
      cnpj
    )
    VALUES (
      COALESCE(meta_clinica_nome, nome_usuario), 
      plano_final, 
      status_final, 
      limite_msg, 
      limite_proc, 
      now() + interval '7 days',
      meta_cnpj
    )
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
