import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getConnectionState, fetchInstanceInfo } from "@/services/evolutionApi";

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

      // Verificar estado real na Evolution API
      let realConectado = data ? (data as WhatsappConfig).conectado : false;
      let realNumero = data ? (data as WhatsappConfig).numero : null;
      let checkSuccess = false;
      
      try {
        const conn = await getConnectionState(targetClinicaId);
        realConectado = (conn.state === "open");
        checkSuccess = true;
        
        if (realConectado) {
          const info = await fetchInstanceInfo(targetClinicaId);
          realNumero = info.number;
        } else {
          realNumero = null;
        }
      } catch (e) {
        console.error("Erro ao verificar status na Evolution API:", e);
      }

      // Sincronizar banco de dados se houver divergência e a consulta na API funcionou
      if (checkSuccess) {
        if (!data) {
          if (realConectado) {
            try {
              await (supabase as any)
                .from("whatsapp_config")
                .insert({
                  clinica_id: targetClinicaId,
                  conectado: true,
                  numero: realNumero,
                  updated_at: new Date().toISOString()
                });
            } catch (insertErr) {
              console.error("Erro ao inserir status sincronizado:", insertErr);
            }
          }
        } else {
          const cfg = data as WhatsappConfig;
          if (cfg.conectado !== realConectado || cfg.numero !== realNumero) {
            try {
              await (supabase as any)
                .from("whatsapp_config")
                .update({
                  conectado: realConectado,
                  numero: realNumero,
                  updated_at: new Date().toISOString()
                })
                .eq("clinica_id", targetClinicaId);
            } catch (updateErr) {
              console.error("Erro ao atualizar status sincronizado:", updateErr);
            }
          }
        }
      }

      // Retornar os dados mais atualizados
      return {
        conectado: realConectado,
        numero: realNumero,
        updated_at: data ? (data as WhatsappConfig).updated_at : new Date().toISOString(),
      };
    },
  });
};
