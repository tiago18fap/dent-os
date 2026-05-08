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

      const { data, error } = await (supabase as any)
        .from("whatsapp_config")
        .select("id, user_id, numero, conectado, updated_at")
        .eq("user_id", userData.user.id)
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
