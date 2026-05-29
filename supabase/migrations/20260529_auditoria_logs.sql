-- Migration: auditoria_logs
-- Tabela para auditoria e logs de ações dos usuários

CREATE TABLE IF NOT EXISTS public.auditoria_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE,
  perfil_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  usuario_email TEXT,
  acao TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- Super admins leem todos os logs
DROP POLICY IF EXISTS "Super admins leem todos os logs de auditoria" ON public.auditoria_logs;
CREATE POLICY "Super admins leem todos os logs de auditoria" ON public.auditoria_logs
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
);

-- Clínicas leem seus próprios logs
DROP POLICY IF EXISTS "Clinicas leem seus proprios logs de auditoria" ON public.auditoria_logs;
CREATE POLICY "Clinicas leem seus proprios logs de auditoria" ON public.auditoria_logs
FOR SELECT TO authenticated
USING (
  clinica_id = public.get_user_clinica_id()
);

-- Todos inserem logs
DROP POLICY IF EXISTS "Todos inserem logs de auditoria" ON public.auditoria_logs;
CREATE POLICY "Todos inserem logs de auditoria" ON public.auditoria_logs
FOR INSERT TO authenticated
WITH CHECK (true);
