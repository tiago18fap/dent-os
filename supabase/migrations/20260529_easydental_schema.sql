-- Migration: Ensure Easy Dental integration schema exists
-- Creates sync_logs table and ensures whatsapp_config columns exist

-- ══════════════════════════════════════════════════════════════
-- Table: sync_logs — Logs de sincronização Easy Dental
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'easydental_sync',
  status TEXT DEFAULT 'pendente',
  resultado JSONB,
  pacientes_importados INTEGER DEFAULT 0,
  procedimentos_importados INTEGER DEFAULT 0,
  erro_mensagem TEXT,
  duracao_segundos NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by clinica
CREATE INDEX IF NOT EXISTS idx_sync_logs_clinica_created 
  ON public.sync_logs(clinica_id, created_at DESC);

-- RLS
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_logs_clinica_read" ON public.sync_logs
  FOR SELECT USING (
    clinica_id IN (
      SELECT clinica_id FROM public.perfis WHERE id = auth.uid()
    )
  );

CREATE POLICY "sync_logs_service_insert" ON public.sync_logs
  FOR INSERT WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- Columns: whatsapp_config — Easy Dental fields
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'whatsapp_config' AND column_name = 'easydental_url'
  ) THEN
    ALTER TABLE public.whatsapp_config ADD COLUMN easydental_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'whatsapp_config' AND column_name = 'easydental_usuario'
  ) THEN
    ALTER TABLE public.whatsapp_config ADD COLUMN easydental_usuario TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'whatsapp_config' AND column_name = 'easydental_senha'
  ) THEN
    ALTER TABLE public.whatsapp_config ADD COLUMN easydental_senha TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'whatsapp_config' AND column_name = 'ultima_sync_sucesso'
  ) THEN
    ALTER TABLE public.whatsapp_config ADD COLUMN ultima_sync_sucesso TIMESTAMPTZ;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- Function: decrementar_saldo — Atomic saldo decrement
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decrementar_saldo(
  p_clinica_id UUID,
  p_quantidade INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.carteira_envios
  SET saldo = GREATEST(saldo - p_quantidade, 0)
  WHERE clinica_id = p_clinica_id;
END;
$$;
