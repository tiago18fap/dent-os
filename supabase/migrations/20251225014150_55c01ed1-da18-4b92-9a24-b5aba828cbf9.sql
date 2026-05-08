-- Create clientes table
CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  paciente text NOT NULL,
  telefone text,
  codigo text,
  nascimento date,
  situacao text,
  prestador text
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Public read access for clientes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clientes'
      AND policyname = 'Public read clientes'
  ) THEN
    CREATE POLICY "Public read clientes"
      ON public.clientes
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Service role full access for clientes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clientes'
      AND policyname = 'Service role full access clientes'
  ) THEN
    CREATE POLICY "Service role full access clientes"
      ON public.clientes
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Create procedimentos table
CREATE TABLE IF NOT EXISTS public.procedimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  procedimento text NOT NULL,
  mensagem text,
  tempo_disparo_minutos integer
);

ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;

-- Public read access for procedimentos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'procedimentos'
      AND policyname = 'Public read procedimentos'
  ) THEN
    CREATE POLICY "Public read procedimentos"
      ON public.procedimentos
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Service role full access for procedimentos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'procedimentos'
      AND policyname = 'Service role full access procedimentos'
  ) THEN
    CREATE POLICY "Service role full access procedimentos"
      ON public.procedimentos
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Insert fake data for clientes
INSERT INTO public.clientes (paciente, telefone, codigo, nascimento, situacao, prestador)
VALUES
  ('Maria Silva', '(11) 99999-0001', 'CL001', '1990-05-12', 'Ativo', 'Dr. João'),
  ('João Pereira', '(11) 98888-0002', 'CL002', '1985-09-23', 'Ativo', 'Dra. Ana'),
  ('Carlos Souza', '(11) 97777-0003', 'CL003', '1978-02-01', 'Inativo', 'Dr. Pedro')
ON CONFLICT DO NOTHING;

-- Insert fake data for procedimentos
INSERT INTO public.procedimentos (procedimento, mensagem, tempo_disparo_minutos)
VALUES
  ('Limpeza', 'Lembrete de retorno para limpeza preventiva.', 1440),
  ('Canal', 'Acompanhamento pós-tratamento de canal.', 720),
  ('Implante', 'Lembrete de revisão do implante.', 2880)
ON CONFLICT DO NOTHING;