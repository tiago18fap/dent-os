import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Clinica {
  id: string;
  nome: string;
  plano: "bronze" | "prata" | "ouro";
  status_pagamento: "ativo" | "inadimplente" | "teste_gratis" | "cancelado";
  limite_mensagens: number;
  limite_procedimentos: number;
}

interface Perfil {
  id: string;
  clinica_id: string;
  role: string;
}

interface ClinicaContextType {
  clinica: Clinica | null;
  perfil: Perfil | null;
  loading: boolean;
  refreshClinica: () => Promise<void>;
}

const ClinicaContext = createContext<ClinicaContextType>({
  clinica: null,
  perfil: null,
  loading: true,
  refreshClinica: async () => {},
});

export const useClinica = () => useContext(ClinicaContext);

export const ClinicaProvider = ({ children }: { children: ReactNode }) => {
  const [clinica, setClinica] = useState<Clinica | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);

  const carregarDados = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setClinica(null);
        setPerfil(null);
        setLoading(false);
        return;
      }

      const { data: perfilData, error: perfilError } = await supabase
        .from("perfis")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (perfilError || !perfilData) {
        setLoading(false);
        return;
      }

      setPerfil(perfilData as Perfil);

      const { data: clinicaData, error: clinicaError } = await supabase
        .from("clinicas")
        .select("*")
        .eq("id", perfilData.clinica_id)
        .single();

      if (!clinicaError && clinicaData) {
        setClinica(clinicaData as Clinica);
      }
    } catch (error) {
      console.error("Erro ao carregar contexto da clínica:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      carregarDados();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <ClinicaContext.Provider value={{ clinica, perfil, loading, refreshClinica: carregarDados }}>
      {children}
    </ClinicaContext.Provider>
  );
};
