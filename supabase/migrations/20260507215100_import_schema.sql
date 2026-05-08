CREATE TABLE IF NOT EXISTS public.professionals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.patients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    phone TEXT,
    external_code TEXT,
    birth_date DATE,
    status TEXT,
    primary_professional TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.procedures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    completion_date TIMESTAMP WITH TIME ZONE,
    treatment_code TEXT,
    procedure_code TEXT,
    description TEXT,
    region TEXT,
    face TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Segurança de Nível de Linha)
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

-- Como isso é um painel interno, vamos liberar as policies para anon provisoriamente
-- (Idealmente, o usuário deve logar e usar a role 'authenticated')
CREATE POLICY "Permitir tudo para professionals" ON public.professionals FOR ALL USING (true);
CREATE POLICY "Permitir tudo para patients" ON public.patients FOR ALL USING (true);
CREATE POLICY "Permitir tudo para procedures" ON public.procedures FOR ALL USING (true);
