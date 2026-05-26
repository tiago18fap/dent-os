import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WhatsappConfig {
  id: string;
  clinica_id: string;
  numero: string | null;
  conectado: boolean;
  updated_at: string;
}

export const useWhatsappStatus = () => {
  return useQuery({
    queryKey: ["whatsapp_status"],
    queryFn: async (): Promise<{ conectado: boolean; numero: string | null; updated_at: string | null } | null> => {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData?.user) {
        return null;
      }

      // Busca o perfil do usuário ativo para obter seu clinica_id
      const { data: perfilData, error: perfilError } = await supabase
        .from("perfis")
        .select("clinica_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (perfilError || !perfilData) {
        return null;
      }

      let targetClinicaId = perfilData.clinica_id;

      // Se for super admin, verifica se está impersonando alguma clínica
      const SUPER_ADMIN_EMAILS = ["tiago@dentos.com.br", "admin@dentos.com.br", "tiago18fap@gmail.com", "contato@dentos.com.br", "victorpconti@gmail.com"];
      const lowerEmail = userData.user.email?.toLowerCase().trim() ?? "";
      const isSuper = SUPER_ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(lowerEmail);

      if (isSuper) {
        const impClinicaId = localStorage.getItem("impersonated_clinica_id");
        if (impClinicaId && impClinicaId.trim() !== "") {
          targetClinicaId = impClinicaId;
        }
      }

      const { data, error } = await (supabase as any)
        .from("whatsapp_config")
        .select("id, clinica_id, numero, conectado, updated_at")
        .eq("clinica_id", targetClinicaId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar status do WhatsApp", error.message ?? error);
        return null;
      }

      if (!data) return null;

      const cfg = data as WhatsappConfig;

      return {
        conectado: cfg.conectado,
        numero: cfg.numero,
        updated_at: cfg.updated_at ?? null,
      };
    },
  });
};
