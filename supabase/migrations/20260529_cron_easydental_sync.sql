-- Migration: Setup pg_cron for automatic Easy Dental sync
-- Runs daily at 06:00 BRT (09:00 UTC), before the queue generation at 07:00 BRT
--
-- This cron iterates over all clinics with easydental_usuario configured
-- and calls the easydental-sync Edge Function for each one.

-- Remove existing schedule if any (safe idempotent syntax)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'easydental-sync-diario') THEN
    PERFORM cron.unschedule('easydental-sync-diario');
  END IF;
END $$;

-- Schedule: 06:00 BRT (09:00 UTC) daily
SELECT cron.schedule(
  'easydental-sync-diario',
  '0 9 * * *',
  $$
  -- For each clinic with Easy Dental credentials, trigger sync
  DO $sync$
  DECLARE
    rec RECORD;
    result INT;
  BEGIN
    FOR rec IN 
      SELECT clinica_id 
      FROM public.whatsapp_config 
      WHERE easydental_usuario IS NOT NULL 
        AND easydental_senha IS NOT NULL
    LOOP
      SELECT net.http_post(
        url := 'https://dzbeorfkualalocrvobe.supabase.co/functions/v1/easydental-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
        ),
        body := jsonb_build_object('clinica_id', rec.clinica_id)
      ) INTO result;
      
      -- Small delay between clinics to avoid overloading the worker
      PERFORM pg_sleep(5);
    END LOOP;
  END $sync$;
  $$
);

-- Also fix the existing cron unschedule syntax in case it failed before
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gerar-fila-diaria' AND schedule != '0 10 * * *') THEN
    PERFORM cron.unschedule('gerar-fila-diaria');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'processar-fila-envios' AND schedule != '*/2 * * * *') THEN
    PERFORM cron.unschedule('processar-fila-envios');
  END IF;
END $$;
