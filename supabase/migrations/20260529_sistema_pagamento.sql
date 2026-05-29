-- Migration: sistema_pagamento
-- Criar tabelas para Mercado Pago config e Histórico de Pedidos/Assinaturas

-- 1. Tabela: sistema_pagamento_config
CREATE TABLE IF NOT EXISTS public.sistema_pagamento_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mercado_pago_public_key TEXT,
  mercado_pago_access_token TEXT,
  mercado_pago_client_id TEXT,
  mercado_pago_client_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS em sistema_pagamento_config
ALTER TABLE public.sistema_pagamento_config ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para sistema_pagamento_config (apenas Super Admins podem ler, inserir, atualizar e excluir)
DROP POLICY IF EXISTS "Super admins gerenciam pagamentos config" ON public.sistema_pagamento_config;
CREATE POLICY "Super admins gerenciam pagamentos config" ON public.sistema_pagamento_config
FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
)
WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
);

-- Inserir registro inicial vazio se não houver nenhum
INSERT INTO public.sistema_pagamento_config (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.sistema_pagamento_config);


-- 2. Tabela: pedidos_assinaturas
CREATE TABLE IF NOT EXISTS public.pedidos_assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  plano TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  metodo_pagamento TEXT, -- 'pix', 'cartao', etc.
  status TEXT NOT NULL, -- 'pendente', 'pago', 'cancelado', 'rejeitado'
  id_transacao_mp TEXT UNIQUE, -- ID do pagamento no Mercado Pago
  id_assinatura_mp TEXT, -- ID do preapproval no Mercado Pago (se for assinatura)
  data_pagamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS em pedidos_assinaturas
ALTER TABLE public.pedidos_assinaturas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para pedidos_assinaturas
-- Super admins gerenciam todos os pedidos
DROP POLICY IF EXISTS "Super admins gerenciam todos os pedidos" ON public.pedidos_assinaturas;
CREATE POLICY "Super admins gerenciam todos os pedidos" ON public.pedidos_assinaturas
FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
)
WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
);

-- Clínicas leem e inserem seus próprios pedidos
DROP POLICY IF EXISTS "Clinicas leem seus proprios pedidos" ON public.pedidos_assinaturas;
CREATE POLICY "Clinicas leem seus proprios pedidos" ON public.pedidos_assinaturas
FOR SELECT TO authenticated
USING (
  clinica_id = public.get_user_clinica_id()
);

DROP POLICY IF EXISTS "Clinicas inserem seus proprios pedidos" ON public.pedidos_assinaturas;
CREATE POLICY "Clinicas inserem seus proprios pedidos" ON public.pedidos_assinaturas
FOR INSERT TO authenticated
WITH CHECK (
  clinica_id = public.get_user_clinica_id()
);
