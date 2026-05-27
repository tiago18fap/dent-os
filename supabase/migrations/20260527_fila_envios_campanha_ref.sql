-- Migration: Adiciona coluna campanha_ref e índices para fila_envios
-- Aplicar via Supabase Dashboard (SQL Editor) ou supabase db push

-- 1. Coluna para rastrear qual campanha gerou a mensagem (evitar duplicatas)
ALTER TABLE public.fila_envios ADD COLUMN IF NOT EXISTS campanha_ref text;

-- 2. Índice para busca eficiente de duplicatas na geração diária
CREATE INDEX IF NOT EXISTS idx_fila_envios_dedup 
  ON public.fila_envios (clinica_id, paciente_id, origem, campanha_ref, status);

-- 3. Índice para filtros por data na página de fila
CREATE INDEX IF NOT EXISTS idx_fila_envios_data 
  ON public.fila_envios (clinica_id, data_programada DESC);

-- 4. Índice para contagem de envios por paciente/campanha (limite_envios)
CREATE INDEX IF NOT EXISTS idx_fila_envios_contagem
  ON public.fila_envios (clinica_id, paciente_id, campanha_ref);
