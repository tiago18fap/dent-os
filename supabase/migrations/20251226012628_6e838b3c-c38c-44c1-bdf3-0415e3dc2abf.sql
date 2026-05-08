-- Permite que usuários autenticados leiam o histórico de importações
ALTER TABLE public.importacoes_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read importacoes_historico"
ON public.importacoes_historico
FOR SELECT
TO authenticated
USING (true);