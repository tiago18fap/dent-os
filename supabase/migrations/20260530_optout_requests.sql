-- Helper function to find a client in a specific clinic by phone number digits
CREATE OR REPLACE FUNCTION public.find_cliente_by_telefone(target_clinica_id UUID, search_telefone TEXT)
RETURNS TABLE (
  id UUID,
  paciente TEXT,
  telefone TEXT,
  situacao TEXT
) AS $$
DECLARE
  clean_search TEXT;
BEGIN
  -- Strip all non-digits
  clean_search := REGEXP_REPLACE(search_telefone, '\D', '', 'g');
  
  -- Strip country code '55' if present and search_telefone is longer than a local number
  IF clean_search LIKE '55%' AND LENGTH(clean_search) >= 12 THEN
    clean_search := SUBSTRING(clean_search FROM 3);
  END IF;

  RETURN QUERY
  SELECT c.id, c.paciente, c.telefone, c.situacao
  FROM public.clientes c
  WHERE c.clinica_id = target_clinica_id
    AND (
      REGEXP_REPLACE(c.telefone, '\D', '', 'g') = clean_search
      OR REGEXP_REPLACE(c.telefone, '\D', '', 'g') = '55' || clean_search
      OR RIGHT(REGEXP_REPLACE(c.telefone, '\D', '', 'g'), 9) = RIGHT(clean_search, 9)
      OR RIGHT(REGEXP_REPLACE(c.telefone, '\D', '', 'g'), 8) = RIGHT(clean_search, 8)
    )
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create solicitacoes_optout table
CREATE TABLE IF NOT EXISTS public.solicitacoes_optout (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    paciente_nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    mensagem_recebida TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.solicitacoes_optout ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Clínicas podem ver seus próprios logs de opt-out" ON public.solicitacoes_optout;
DROP POLICY IF EXISTS "Super admins podem ver tudo" ON public.solicitacoes_optout;

-- Create RLS Policies
CREATE POLICY "Clínicas podem ver seus próprios logs de opt-out" 
ON public.solicitacoes_optout
FOR ALL
USING (clinica_id = (SELECT p.clinica_id FROM public.perfis p WHERE p.id = auth.uid()));

CREATE POLICY "Super admins podem ver tudo"
ON public.solicitacoes_optout
FOR ALL
USING (public.is_caller_super_admin());
