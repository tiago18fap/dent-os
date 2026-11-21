-- =====================================================================
-- Migracoes do app aplicadas a cada boot da API (idempotentes).
-- So agem quando as tabelas do schema public ja existem (depois da carga),
-- entao um banco vazio sobe sem erro.
-- =====================================================================

DO $$
BEGIN
  IF to_regclass('public.whatsapp_config') IS NULL THEN
    RETURN;
  END IF;

  -- ---------------------------------------------------------------
  -- Provedor de envio por clinica: Evolution (nao oficial) ou Zernio
  -- (API oficial da Meta com coexistencia).
  -- ---------------------------------------------------------------
  ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution';
  ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS zernio_account_id text;
  ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS zernio_numero text;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_config_provider_check') THEN
    ALTER TABLE public.whatsapp_config
      ADD CONSTRAINT whatsapp_config_provider_check CHECK (provider IN ('evolution', 'zernio'));
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_zernio_account_uidx
    ON public.whatsapp_config (zernio_account_id) WHERE zernio_account_id IS NOT NULL;

  -- ---------------------------------------------------------------
  -- Rastreio do envio na fila (id da mensagem na Meta e motivo de falha)
  -- ---------------------------------------------------------------
  ALTER TABLE public.fila_envios ADD COLUMN IF NOT EXISTS provider_message_id text;
  ALTER TABLE public.fila_envios ADD COLUMN IF NOT EXISTS erro_detalhe text;
  CREATE INDEX IF NOT EXISTS fila_envios_provider_message_idx
    ON public.fila_envios (provider_message_id) WHERE provider_message_id IS NOT NULL;

  -- ---------------------------------------------------------------
  -- Modelos de mensagem aprovados pela Meta, um por campanha da clinica.
  -- chave = campanha_ref (grupo de procedimento) ou origem (aniversario_dia, ...).
  -- texto_original = texto da campanha com {nome}; texto_modelo = com {{1}}.
  -- ---------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.whatsapp_modelos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
    chave text NOT NULL,
    nome_modelo text NOT NULL,
    idioma text NOT NULL DEFAULT 'pt_BR',
    categoria text NOT NULL DEFAULT 'MARKETING',
    status text NOT NULL DEFAULT 'PENDING',
    motivo text,
    texto_original text NOT NULL,
    texto_modelo text NOT NULL,
    variaveis text[] NOT NULL DEFAULT '{}',
    zernio_template_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT whatsapp_modelos_categoria_check CHECK (categoria IN ('MARKETING', 'UTILITY')),
    CONSTRAINT whatsapp_modelos_clinica_chave_key UNIQUE (clinica_id, chave)
  );
  CREATE INDEX IF NOT EXISTS whatsapp_modelos_nome_idx ON public.whatsapp_modelos (nome_modelo);

  ALTER TABLE public.whatsapp_modelos ENABLE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_modelos' AND policyname = 'Acesso por clinica') THEN
    CREATE POLICY "Acesso por clinica" ON public.whatsapp_modelos FOR ALL
      USING (is_caller_super_admin() OR clinica_id = get_user_clinica_id())
      WITH CHECK (is_caller_super_admin() OR clinica_id = get_user_clinica_id());
  END IF;
  GRANT ALL ON public.whatsapp_modelos TO anon, authenticated, service_role;

  -- ---------------------------------------------------------------
  -- Eventos de webhook ja processados (a Zernio pode reenviar o mesmo).
  -- ---------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.zernio_webhook_eventos (
    id text PRIMARY KEY,
    evento text NOT NULL,
    recebido_em timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.zernio_webhook_eventos ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON public.zernio_webhook_eventos TO service_role;

  NOTIFY pgrst, 'reload schema';
END
$$;
