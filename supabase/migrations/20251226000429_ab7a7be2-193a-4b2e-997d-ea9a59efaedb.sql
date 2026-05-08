-- Enum de papéis
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Perfis: o próprio usuário pode ver/atualizar seu perfil
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Tabela de papéis por usuário
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Apenas service role pode gerenciar papéis (via dashboard/backend)
CREATE POLICY "Service role manage user_roles"
ON public.user_roles
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Tabela de farmácias (clínicas)
CREATE TABLE public.farmacias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.farmacias ENABLE ROW LEVEL SECURITY;

-- Apenas service role gerencia farmácias por enquanto
CREATE POLICY "Service role manage farmacias"
ON public.farmacias
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Vínculo de usuários às farmácias (para admins e users)
CREATE TABLE public.user_farmacias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farmacia_id uuid NOT NULL REFERENCES public.farmacias(id) ON DELETE CASCADE,
  UNIQUE (user_id, farmacia_id)
);

ALTER TABLE public.user_farmacias ENABLE ROW LEVEL SECURITY;

-- Apenas service role gerencia vínculos por enquanto
CREATE POLICY "Service role manage user_farmacias"
ON public.user_farmacias
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Função para verificar papel de usuário
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;