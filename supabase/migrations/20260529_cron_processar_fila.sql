-- Migration: Setup pg_cron schedules for automated queue processing
-- Version: 1.0.22
--
-- Schedule 1: gerar-fila-diaria - Runs at 7:00 AM BRT (10:00 UTC) daily
-- Schedule 2: processar-fila - Runs every 2 minutes during business hours

-- Enable pg_net extension for HTTP calls (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Remove existing schedules if any (idempotent)
SELECT cron.unschedule('gerar-fila-diaria') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'gerar-fila-diaria'
);
SELECT cron.unschedule('processar-fila-envios') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'processar-fila-envios'
);

-- Schedule 1: Generate daily queue at 7:00 AM BRT (10:00 UTC)
-- Runs once per day, generates queue entries for the next 30 days
SELECT cron.schedule(
  'gerar-fila-diaria',
  '0 10 * * *',  -- 10:00 UTC = 07:00 BRT
  $$
  SELECT net.http_post(
    url := 'https://dzbeorfkualalocrvobe.supabase.co/functions/v1/gerar-fila-diaria',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule 2: Process pending messages every 2 minutes
-- Each run sends at most 1 message per clinica, creating ~2 min delay between messages
SELECT cron.schedule(
  'processar-fila-envios',
  '*/2 * * * *',  -- Every 2 minutes
  $$
  SELECT net.http_post(
    url := 'https://dzbeorfkualalocrvobe.supabase.co/functions/v1/processar-fila',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
