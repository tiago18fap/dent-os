-- Migration: Fix pg_cron schedules for queue processing
-- Problem: current_setting('supabase.service_role_key', true) may return NULL in pg_cron context
-- Solution: Store the key in a config table and reference it directly

-- 1. Create a config table to store the service role key (if not exists)
CREATE TABLE IF NOT EXISTS public.system_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow service role full access
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write
CREATE POLICY "Service role full access" ON public.system_config
  FOR ALL USING (auth.role() = 'service_role');

-- 2. Store the service role key (will be set via SQL editor in Supabase dashboard)
-- Run this in the Supabase SQL editor AFTER deploying:
-- INSERT INTO public.system_config (chave, valor) VALUES ('service_role_key', 'YOUR_SERVICE_ROLE_KEY_HERE')
-- ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

-- 3. Create helper function to get the service role key
CREATE OR REPLACE FUNCTION public.get_service_role_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  key_val TEXT;
BEGIN
  -- Try vault first (Supabase recommended)
  BEGIN
    SELECT decrypted_secret INTO key_val
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    key_val := NULL;
  END;

  -- Fallback: config table
  IF key_val IS NULL THEN
    SELECT valor INTO key_val
    FROM public.system_config
    WHERE chave = 'service_role_key';
  END IF;

  -- Last fallback: current_setting (works in some contexts)
  IF key_val IS NULL THEN
    key_val := current_setting('supabase.service_role_key', true);
  END IF;

  RETURN key_val;
END;
$$;

-- 4. Create the wrapper function that pg_cron will call
CREATE OR REPLACE FUNCTION public.invoke_processar_fila()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_key TEXT;
  result_status INT;
BEGIN
  service_key := public.get_service_role_key();

  IF service_key IS NULL OR service_key = '' THEN
    RAISE WARNING '[invoke_processar_fila] Service role key not found! Cron cannot call edge function.';
    RETURN;
  END IF;

  -- Call the edge function via pg_net
  PERFORM net.http_post(
    url := 'https://dzbeorfkualalocrvobe.supabase.co/functions/v1/processar-fila',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );

  RAISE LOG '[invoke_processar_fila] Edge function called successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[invoke_processar_fila] Error calling edge function: %', SQLERRM;
END;
$$;

-- 5. Create the wrapper function for gerar-fila-diaria
CREATE OR REPLACE FUNCTION public.invoke_gerar_fila_diaria()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_key TEXT;
BEGIN
  service_key := public.get_service_role_key();

  IF service_key IS NULL OR service_key = '' THEN
    RAISE WARNING '[invoke_gerar_fila_diaria] Service role key not found!';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://dzbeorfkualalocrvobe.supabase.co/functions/v1/gerar-fila-diaria',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );

  RAISE LOG '[invoke_gerar_fila_diaria] Edge function called successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[invoke_gerar_fila_diaria] Error: %', SQLERRM;
END;
$$;

-- 6. Remove old cron schedules
SELECT cron.unschedule('gerar-fila-diaria') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'gerar-fila-diaria'
);
SELECT cron.unschedule('processar-fila-envios') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'processar-fila-envios'
);

-- 7. Create new cron schedules using the wrapper functions
-- Schedule 1: Generate daily queue at 7:00 AM BRT (10:00 UTC)
SELECT cron.schedule(
  'gerar-fila-diaria',
  '0 10 * * *',
  $$ SELECT public.invoke_gerar_fila_diaria(); $$
);

-- Schedule 2: Process pending messages every 2 minutes
SELECT cron.schedule(
  'processar-fila-envios',
  '*/2 * * * *',
  $$ SELECT public.invoke_processar_fila(); $$
);

-- 8. Create a safety net: a second cron that checks for stale pending messages
-- If messages have been pending for more than 30 minutes, try processing again
SELECT cron.unschedule('processar-fila-fallback') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'processar-fila-fallback'
);

SELECT cron.schedule(
  'processar-fila-fallback',
  '*/15 * * * *',
  $$
  -- Only trigger if there are stale pending messages (older than 30 min)
  DO $$
  DECLARE
    stale_count INT;
  BEGIN
    SELECT COUNT(*) INTO stale_count
    FROM public.fila_envios
    WHERE status = 'pendente'
    AND data_programada <= NOW()
    AND data_programada >= NOW() - INTERVAL '24 hours';

    IF stale_count > 0 THEN
      RAISE LOG '[processar-fila-fallback] Found % stale pending messages, triggering processing', stale_count;
      PERFORM public.invoke_processar_fila();
    END IF;
  END $$;
  $$
);
