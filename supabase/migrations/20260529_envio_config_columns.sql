-- Migration: Add envio queue configuration columns to whatsapp_config
-- Version: 1.0.22

ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS dedup_dias INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS horario_inicio TEXT DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS horario_fim TEXT DEFAULT '20:00';

-- dedup_dias: Number of days to avoid sending to the same person
-- horario_inicio: Start time for allowed sending window (e.g., '08:00')
-- horario_fim: End time for allowed sending window (e.g., '20:00')
