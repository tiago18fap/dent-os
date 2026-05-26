import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WhatsappConfig {
  id: string;
  user_id: string;
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

      let targetUserId = userData.user.id;

      // Se for super admin, verifica se está impersonando alguma clínica
      const SUPER_ADMIN_EMAILS = ["tiago@dentos.com.br", "admin@dentos.com.br", "tiago18fap@gmail.com", "contato@dentos.com.br"];
      const lowerEmail = userData.user.email?.toLowerCase().trim() ?? "";
      const isSuper = SUPER_ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(lowerEmail);

      if (isSuper) {
        const impClinicaId = localStorage.getItem("impersonated_clinica_id");
        if (impClinicaId && impClinicaId.trim() !== "") {
          // Busca o primeiro perfil dessa clínica para obter o user_id correspondente
          const { data: perfilData } = await supabase
            .from("perfis")
            .select("id")
            .eq("clinica_id", impClinicaId)
            .limit(1)
            .maybeSingle();

          if (perfilData) {
            targetUserId = perfilData.id;
          }
        }
      }

      const { data, error } = await (supabase as any)
        .from("whatsapp_config")
        .select("id, user_id, numero, conectado, updated_at")
        .eq("user_id", targetUserId)
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
