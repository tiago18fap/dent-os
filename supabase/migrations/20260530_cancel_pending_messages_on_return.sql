-- Migration: Cancel pending return messages when a patient completes a new procedure
-- Created at: 2026-05-30

CREATE OR REPLACE FUNCTION public.cancelar_fila_envios_ao_retornar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove da fila de envios qualquer mensagem pendente para este paciente
  -- da mesma clínica, com origem de procedimento, pois ele retornou.
  DELETE FROM public.fila_envios
  WHERE clinica_id = NEW.clinica_id
    AND UPPER(TRIM(paciente_nome)) = UPPER(TRIM(NEW.nome_paciente))
    AND status = 'pendente'
    AND origem = 'procedimento';
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cancelar_fila_envios_ao_retornar ON public.procedimentos;

CREATE TRIGGER trigger_cancelar_fila_envios_ao_retornar
AFTER INSERT ON public.procedimentos
FOR EACH ROW
EXECUTE FUNCTION public.cancelar_fila_envios_ao_retornar();
