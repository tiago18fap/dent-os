-- Fix overly restrictive RLS on importacoes_historico
-- 1) Drop the blocking restrictive policy
DROP POLICY IF EXISTS "Nenhum acesso direto" ON public.importacoes_historico;

-- 2) Allow Supabase service role full access (used by Edge Functions)
CREATE POLICY "Service role full access"
ON public.importacoes_historico
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
