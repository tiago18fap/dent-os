import { supabase } from "@/integrations/supabase/client";

export const gravarLogAuditoria = async (clinicaId: string | undefined, acao: string, descricao: string) => {
  if (!clinicaId) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("auditoria_logs")
      .insert({
        clinica_id: clinicaId,
        perfil_id: user.id,
        usuario_email: user.email,
        acao,
        descricao
      });
  } catch (err) {
    console.error("Erro ao gravar log de auditoria:", err);
  }
};
