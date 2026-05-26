-- 1. CRIAR FUNÇÃO AUXILIAR PARA OBTER CLINICA_ID DO USUÁRIO ATUAL
CREATE OR REPLACE FUNCTION public.get_user_clinica_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT clinica_id FROM public.perfis WHERE id = auth.uid();
$$;

-- 2. ADICIONAR COLUNA CLINICA_ID NAS TABELAS OPERACIONAIS
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.procedimentos ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.importacoes_historico ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.campanhas_config ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.campanhas_procedimento ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.disparos_massa_historico ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.carteira_envios ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.fila_envios ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE;

-- 3. VINCULAR DADOS EXISTENTES À CLINICA EUFRÁSIO POR PADRÃO (79d7fdc6-c713-4f8e-bbc9-25b23348ae2e)
UPDATE public.clientes SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.procedimentos SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.importacoes_historico SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.campanhas_config SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.campanhas_procedimento SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.disparos_massa_historico SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.carteira_envios SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.fila_envios SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;
UPDATE public.whatsapp_config SET clinica_id = '79d7fdc6-c713-4f8e-bbc9-25b23348ae2e' WHERE clinica_id IS NULL;

-- 4. APLICAR VALOR PADRÃO AUTOMÁTICO PARA FUTUROS INSERTS
ALTER TABLE public.clientes ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.procedimentos ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.importacoes_historico ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.campanhas_config ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.campanhas_procedimento ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.disparos_massa_historico ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.carteira_envios ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.fila_envios ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();
ALTER TABLE public.whatsapp_config ALTER COLUMN clinica_id SET DEFAULT public.get_user_clinica_id();

-- 5. ATUALIZAR RESTRIÇÕES DE UNICIDADE
-- Restrição para Clientes (Paciente único por Clínica)
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_paciente_key;
DROP INDEX IF EXISTS public.clientes_paciente_idx;
DROP INDEX IF EXISTS public.clientes_paciente_key;
ALTER TABLE public.clientes ADD CONSTRAINT clientes_clinica_paciente_unique UNIQUE (clinica_id, paciente);

-- Restrição para Configurações de Campanhas (Chave única por Clínica)
ALTER TABLE public.campanhas_config DROP CONSTRAINT IF EXISTS campanhas_config_chave_key;
DROP INDEX IF EXISTS public.campanhas_config_chave_idx;
DROP INDEX IF EXISTS public.campanhas_config_chave_key;
ALTER TABLE public.campanhas_config ADD CONSTRAINT campanhas_config_clinica_chave_unique UNIQUE (clinica_id, chave);

-- Restrição para Campanhas por Procedimento (Grupo de procedimento único por Clínica)
ALTER TABLE public.campanhas_procedimento DROP CONSTRAINT IF EXISTS campanhas_procedimento_group_id_key;
DROP INDEX IF EXISTS public.campanhas_procedimento_group_id_idx;
DROP INDEX IF EXISTS public.campanhas_procedimento_group_id_key;
ALTER TABLE public.campanhas_procedimento ADD CONSTRAINT campanhas_procedimento_clinica_group_unique UNIQUE (clinica_id, group_id);

-- 6. REMOVER POLÍTICAS DE ACESSO LEGADAS/PÚBLICAS
DROP POLICY IF EXISTS "Public read clientes" ON public.clientes;
DROP POLICY IF EXISTS "Public read procedimentos" ON public.procedimentos;
DROP POLICY IF EXISTS "Authenticated read importacoes_historico" ON public.importacoes_historico;
DROP POLICY IF EXISTS "Public read config" ON public.campanhas_config;
DROP POLICY IF EXISTS "Public read campanhas_procedimento" ON public.campanhas_procedimento;
DROP POLICY IF EXISTS "Public read disparos_massa" ON public.disparos_massa_historico;
DROP POLICY IF EXISTS "Public read carteira" ON public.carteira_envios;
DROP POLICY IF EXISTS "Public read fila" ON public.fila_envios;
DROP POLICY IF EXISTS "Public read whatsapp" ON public.whatsapp_config;

-- 7. HABILITAR RLS E CRIAR POLÍTICAS DE ISOLAMENTO POR CLÍNICA
-- Tabela Clientes
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.clientes;
CREATE POLICY "Acesso por clinica" ON public.clientes FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Procedimentos
ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.procedimentos;
CREATE POLICY "Acesso por clinica" ON public.procedimentos FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Histórico Importações
ALTER TABLE public.importacoes_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.importacoes_historico;
CREATE POLICY "Acesso por clinica" ON public.importacoes_historico FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Configurações de Campanhas
ALTER TABLE public.campanhas_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.campanhas_config;
CREATE POLICY "Acesso por clinica" ON public.campanhas_config FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Campanhas por Procedimento
ALTER TABLE public.campanhas_procedimento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.campanhas_procedimento;
CREATE POLICY "Acesso por clinica" ON public.campanhas_procedimento FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Histórico de Disparos em Massa
ALTER TABLE public.disparos_massa_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.disparos_massa_historico;
CREATE POLICY "Acesso por clinica" ON public.disparos_massa_historico FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Carteira de Envios
ALTER TABLE public.carteira_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.carteira_envios;
CREATE POLICY "Acesso por clinica" ON public.carteira_envios FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Fila de Envios
ALTER TABLE public.fila_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.fila_envios;
CREATE POLICY "Acesso por clinica" ON public.fila_envios FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- Tabela Configurações WhatsApp
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso por clinica" ON public.whatsapp_config;
CREATE POLICY "Acesso por clinica" ON public.whatsapp_config FOR ALL TO authenticated
USING (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
) WITH CHECK (
  (auth.jwt() ->> 'email') IN ('tiago@dentos.com.br', 'admin@dentos.com.br', 'tiago18fap@gmail.com', 'contato@dentos.com.br', 'victorpconti@gmail.com')
  OR clinica_id = public.get_user_clinica_id()
);

-- 8. TRIGGER PARA DELETAR USUÁRIOS DO AUTH.USERS AO DELETAR A CLÍNICA (LIMPEZA EM CASCATA)
CREATE OR REPLACE FUNCTION public.handle_clinica_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Deleta os usuários do auth.users associados à clínica deletada
  DELETE FROM auth.users 
  WHERE id IN (
    SELECT id FROM public.perfis WHERE clinica_id = OLD.id
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_clinica_deleted ON public.clinicas;
CREATE TRIGGER trigger_on_clinica_deleted
BEFORE DELETE ON public.clinicas
FOR EACH ROW
EXECUTE FUNCTION public.handle_clinica_deleted();
