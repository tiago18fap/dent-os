import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Clinica {
  id: string;
  nome: string;
  plano: "bronze" | "prata" | "ouro";
  status_pagamento: "ativo" | "inadimplente" | "teste_gratis" | "cancelado";
  limite_mensagens: number;
  limite_procedimentos: number;
  data_fim_teste?: string;
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

      // Constante local de e-mails de super admin
      const SUPER_ADMIN_EMAILS = ["tiago@dentos.com.br", "admin@dentos.com.br", "tiago18fap@gmail.com", "contato@dentos.com.br"];
      const email = session.user?.email?.toLowerCase().trim() ?? "";
      const isSuper = SUPER_ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(email) || 
                      perfilData.role === "super_admin" || 
                      perfilData.role === "admin_master";

      let targetClinicaId = perfilData.clinica_id;
      let targetPerfil = perfilData;

      if (isSuper) {
        const impClinicaId = localStorage.getItem("impersonated_clinica_id");
        if (impClinicaId && impClinicaId.trim() !== "") {
          targetClinicaId = impClinicaId;
          targetPerfil = {
            ...perfilData,
            clinica_id: impClinicaId,
            role: "admin" // Simula o perfil administrativo da clínica visualizada
          };
        }
      }

      setPerfil(targetPerfil as Perfil);

      const { data: clinicaData, error: clinicaError } = await supabase
        .from("clinicas")
        .select("*")
        .eq("id", targetClinicaId)
        .single();

      if (!clinicaError && clinicaData) {
        const c = clinicaData as Clinica;
        if (c.status_pagamento === "teste_gratis" && c.data_fim_teste) {
          const fim = new Date(c.data_fim_teste).getTime();
          if (Date.now() > fim) {
            c.status_pagamento = "inadimplente";
          }
        }
        setClinica(c);
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
