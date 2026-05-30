-- Migration: Add message history read/reply/return tracking columns to public.fila_envios
-- Created at: 2026-05-30

ALTER TABLE public.fila_envios 
ADD COLUMN IF NOT EXISTS lida BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS respondida BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS teve_retorno BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_leitura TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS data_resposta TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS data_retorno TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS mensagem_resposta TEXT;

-- Update the existing trigger function to mark matching sent messages as teve_retorno = TRUE and update return date
CREATE OR REPLACE FUNCTION public.cancelar_fila_envios_ao_retornar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Remove da fila de envios qualquer mensagem pendente para este paciente
  -- da mesma clínica, com origem de procedimento, pois ele retornou.
  DELETE FROM public.fila_envios
  WHERE clinica_id = NEW.clinica_id
    AND UPPER(TRIM(paciente_nome)) = UPPER(TRIM(NEW.nome_paciente))
    AND status = 'pendente'
    AND origem = 'procedimento';

  -- 2. Atualiza as mensagens enviadas recentemente para marcar como teve_retorno = TRUE
  -- Consideramos mensagens enviadas nos últimos 60 dias para esta clínica e paciente.
  UPDATE public.fila_envios
  SET teve_retorno = TRUE,
      data_retorno = NOW()
  WHERE clinica_id = NEW.clinica_id
    AND UPPER(TRIM(paciente_nome)) = UPPER(TRIM(NEW.nome_paciente))
    AND status = 'enviado'
    AND teve_retorno = FALSE
    AND data_programada >= NOW() - INTERVAL '60 days';
  
  RETURN NEW;
END;
$$;
