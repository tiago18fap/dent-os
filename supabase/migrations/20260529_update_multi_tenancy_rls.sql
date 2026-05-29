-- Migration: Update Multi-Tenancy RLS policies to use dynamic public.is_caller_super_admin() check
-- Created at: 2026-05-29

-- 1. Clientes
DROP POLICY IF EXISTS "Acesso por clinica" ON public.clientes;
CREATE POLICY "Acesso por clinica" ON public.clientes FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 2. Procedimentos
DROP POLICY IF EXISTS "Acesso por clinica" ON public.procedimentos;
CREATE POLICY "Acesso por clinica" ON public.procedimentos FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 3. Importacoes Historico
DROP POLICY IF EXISTS "Acesso por clinica" ON public.importacoes_historico;
CREATE POLICY "Acesso por clinica" ON public.importacoes_historico FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 4. Campanhas Config
DROP POLICY IF EXISTS "Acesso por clinica" ON public.campanhas_config;
CREATE POLICY "Acesso por clinica" ON public.campanhas_config FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 5. Campanhas Procedimento
DROP POLICY IF EXISTS "Acesso por clinica" ON public.campanhas_procedimento;
CREATE POLICY "Acesso por clinica" ON public.campanhas_procedimento FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 6. Disparos Massa Historico
DROP POLICY IF EXISTS "Acesso por clinica" ON public.disparos_massa_historico;
CREATE POLICY "Acesso por clinica" ON public.disparos_massa_historico FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 7. Carteira Envios
DROP POLICY IF EXISTS "Acesso por clinica" ON public.carteira_envios;
CREATE POLICY "Acesso por clinica" ON public.carteira_envios FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 8. Fila Envios
DROP POLICY IF EXISTS "Acesso por clinica" ON public.fila_envios;
CREATE POLICY "Acesso por clinica" ON public.fila_envios FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);

-- 9. Whatsapp Config
DROP POLICY IF EXISTS "Acesso por clinica" ON public.whatsapp_config;
CREATE POLICY "Acesso por clinica" ON public.whatsapp_config FOR ALL TO authenticated
USING (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  public.is_caller_super_admin()
  OR clinica_id = public.get_user_clinica_id()
);
