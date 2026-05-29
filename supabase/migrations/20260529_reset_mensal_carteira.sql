-- Migration: reset_mensal_carteira
-- 1. Ensure unique wallets per clinic
-- 2. Auto-provision wallet on clinic creation
-- 3. Monthly reset for ilimitado_premium clinics (1000 credits)

-- Enforce unique constraint on clinica_id in carteira_envios
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'carteira_envios_clinica_id_unique'
  ) THEN
    ALTER TABLE public.carteira_envios ADD CONSTRAINT carteira_envios_clinica_id_unique UNIQUE (clinica_id);
  END IF;
END $$;

-- Trigger function to auto-provision wallets
CREATE OR REPLACE FUNCTION public.handle_new_clinica_carteira()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.carteira_envios (clinica_id, saldo)
  VALUES (
    NEW.id, 
    CASE WHEN NEW.plano = 'ilimitado_premium' THEN 1000 ELSE NEW.limite_mensagens END
  )
  ON CONFLICT (clinica_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create the trigger on public.clinicas
DROP TRIGGER IF EXISTS trigger_on_clinica_created ON public.clinicas;
CREATE TRIGGER trigger_on_clinica_created
AFTER INSERT ON public.clinicas
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_clinica_carteira();

-- Function to reset balances monthly and backfill wallets
CREATE OR REPLACE FUNCTION public.reset_mensal_saldo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Backfill wallets for any existing clinics
  INSERT INTO public.carteira_envios (clinica_id, saldo)
  SELECT id, CASE WHEN plano = 'ilimitado_premium' THEN 1000 ELSE limite_mensagens END
  FROM public.clinicas
  ON CONFLICT (clinica_id) DO NOTHING;

  -- 2. Reset balance for 'ilimitado_premium' clinics to 1000 credits
  UPDATE public.carteira_envios ce
  SET saldo = 1000
  FROM public.clinicas c
  WHERE ce.clinica_id = c.id AND c.plano = 'ilimitado_premium';
END;
$$;

-- Schedule the monthly reset using pg_cron (runs at 00:00 on the 1st of every month)
SELECT cron.unschedule('reset-mensal-saldo-carteira') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reset-mensal-saldo-carteira'
);

SELECT cron.schedule(
  'reset-mensal-saldo-carteira',
  '0 0 1 * *',
  $$ SELECT public.reset_mensal_saldo(); $$
);

-- Execute immediately to apply the initial credits and setup existing wallets
SELECT public.reset_mensal_saldo();
