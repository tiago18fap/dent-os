-- Migration: Add get_clinica_users RPC to list clinic users with email (Super Admin only)
-- Created at: 2026-05-30

CREATE OR REPLACE FUNCTION public.get_clinica_users(target_clinica_id UUID)
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
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem listar usuários das clínicas.';
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
  WHERE p.clinica_id = target_clinica_id
  ORDER BY p.created_at DESC;
END;
$$;
