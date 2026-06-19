-- Migration: 20260619_fila_envios_strict_dedup
-- Descrição: Contrato rígido no banco de dados para evitar envio de mensagens duplicadas.
-- Garante que nenhum telefone receba mais de uma mensagem dentro de um intervalo de 30 dias.

CREATE OR REPLACE FUNCTION public.check_fila_envios_dedup()
RETURNS TRIGGER AS $$
DECLARE
  already_exists INTEGER;
BEGIN
  -- Verificar se já existe uma mensagem pendente ou enviada para o mesmo telefone
  -- dentro de um intervalo de 30 dias (antes ou depois da data programada da nova mensagem)
  SELECT COUNT(*) INTO already_exists
  FROM public.fila_envios
  WHERE clinica_id = NEW.clinica_id
    AND telefone = NEW.telefone
    AND status IN ('pendente', 'enviado')
    AND data_programada >= (NEW.data_programada - INTERVAL '30 days')
    AND data_programada <= (NEW.data_programada + INTERVAL '30 days')
    AND id IS DISTINCT FROM NEW.id;

  IF already_exists > 0 THEN
    -- Altera o status da nova mensagem para 'dedup_ignorado' antes do insert/update.
    -- Isso serve como um contrato inviolável no banco de dados que impede o enfileiramento e o envio.
    NEW.status := 'dedup_ignorado';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criação do trigger BEFORE INSERT ou UPDATE
DROP TRIGGER IF EXISTS trigger_fila_envios_dedup ON public.fila_envios;

CREATE TRIGGER trigger_fila_envios_dedup
  BEFORE INSERT OR UPDATE ON public.fila_envios
  FOR EACH ROW
  WHEN (NEW.status IN ('pendente', 'enviado'))
  EXECUTE FUNCTION public.check_fila_envios_dedup();
