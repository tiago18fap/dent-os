import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_URL = Deno.env.get("EASYDENTAL_WORKER_URL") || "https://easydental-worker.qfjowr.easypanel.host";
const WORKER_SECRET = Deno.env.get("EASYDENTAL_WORKER_SECRET") || "dentos-worker-secret-2026";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Autenticar usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar clinica_id do usuário
    const body = await req.json().catch(() => ({}));
    const clinicaId = body.clinica_id;

    if (!clinicaId) {
      return new Response(
        JSON.stringify({ error: "clinica_id obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[easydental-sync] Sincronização solicitada para clínica ${clinicaId}`);

    // Buscar credenciais
    const { data: config, error: configError } = await supabase
      .from("whatsapp_config")
      .select("easydental_usuario, easydental_senha")
      .eq("clinica_id", clinicaId)
      .maybeSingle();

    if (configError || !config?.easydental_usuario || !config?.easydental_senha) {
      return new Response(
        JSON.stringify({ error: "Credenciais Easy Dental não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Chamar o worker para executar o sync
    console.log(`[easydental-sync] Chamando worker: ${WORKER_URL}/sync`);

    try {
      const workerRes = await fetch(`${WORKER_URL}/sync/${clinicaId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WORKER_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clinica_id: clinicaId }),
        signal: AbortSignal.timeout(120000), // 2 min timeout
      });

      if (workerRes.ok) {
        const result = await workerRes.json();
        console.log(`[easydental-sync] Worker respondeu:`, result);
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Worker falhou — verificar log mais recente
      console.log(`[easydental-sync] Worker respondeu com erro: ${workerRes.status}`);
    } catch (workerErr) {
      console.log(`[easydental-sync] Worker inacessível: ${workerErr}. Verificando último log...`);
    }

    // Fallback: buscar último log (sync pode ter sido executado via cron)
    const { data: lastLog } = await supabase
      .from("sync_logs")
      .select("*")
      .eq("clinica_id", clinicaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLog) {
      // Se o último log é recente (menos de 5 min), retornar como sucesso
      const logAge = Date.now() - new Date(lastLog.created_at).getTime();
      if (logAge < 5 * 60 * 1000) {
        return new Response(
          JSON.stringify({
            status: lastLog.status === 'sucesso' ? 'sucesso' : 'erro',
            pacientes_novos: 0,
            pacientes_atualizados: lastLog.pacientes_importados || 0,
            procedimentos: lastLog.procedimentos_importados || 0,
            duracao: Number(lastLog.duracao_segundos) || 0,
            message: lastLog.erro_mensagem || "Dados do último sync",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        error: "Worker de sincronização indisponível. A sincronização automática será executada às 6h.",
        status: "erro",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[easydental-sync] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno", status: "erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
