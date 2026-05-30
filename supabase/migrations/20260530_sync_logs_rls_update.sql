-- Migration: Update sync_logs RLS policy to allow super admins to read all sync logs
-- Created at: 2026-05-30

DROP POLICY IF EXISTS "sync_logs_clinica_read" ON public.sync_logs;

CREATE POLICY "sync_logs_clinica_read" ON public.sync_logs
  FOR SELECT USING (
    public.is_caller_super_admin()
    OR clinica_id IN (
      SELECT clinica_id FROM public.perfis WHERE id = auth.uid()
    )
  );
