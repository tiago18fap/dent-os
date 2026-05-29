import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "https://api.dentos.cloud";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "429683C4C977415CAAFCCE10F7D57E11";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Returns the current date/time in America/Sao_Paulo timezone
 * as { hours, minutes } for sending-window checks.
 */
function getBrazilTime(): { hours: number; minutes: number; isoString: string } {
  const now = new Date();
  const brFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = brFormatter.formatToParts(now);
  const hours = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minutes = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return { hours, minutes, isoString: now.toISOString() };
}

/**
 * Parses a time string like "08:00" into { hours, minutes }.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

/**
 * Checks if the current Brazil time is within the sending window.
 */
function isWithinWindow(
  currentHours: number,
  currentMinutes: number,
  inicioStr: string,
  fimStr: string
): boolean {
  const inicio = parseTime(inicioStr);
  const fim = parseTime(fimStr);
  const currentTotal = currentHours * 60 + currentMinutes;
  const inicioTotal = inicio.hours * 60 + inicio.minutes;
  const fimTotal = fim.hours * 60 + fim.minutes;
  return currentTotal >= inicioTotal && currentTotal < fimTotal;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[processar-fila] Início do processamento");

    const brazilTime = getBrazilTime();
    console.log(`[processar-fila] Hora atual em São Paulo: ${brazilTime.hours}:${String(brazilTime.minutes).padStart(2, "0")}`);

    // 1. Query all clinicas with conectado = true
    const { data: configs, error: configError } = await supabase
      .from("whatsapp_config")
      .select("clinica_id, horario_inicio, horario_fim, dedup_dias")
      .eq("conectado", true);

    if (configError) {
      console.error("[processar-fila] Erro ao buscar whatsapp_config:", configError);
      return new Response(JSON.stringify({ error: "Erro ao buscar configurações", detail: configError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!configs || configs.length === 0) {
      console.log("[processar-fila] Nenhuma clínica conectada encontrada");
      return new Response(JSON.stringify({ message: "Nenhuma clínica conectada", processados: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[processar-fila] ${configs.length} clínica(s) conectada(s) encontrada(s)`);

    const summary: Array<{
      clinica_id: string;
      status: string;
      detail?: string;
    }> = [];

    // 2. Process each connected clinica
    for (const config of configs) {
      const clinicaId = config.clinica_id;
      const horarioInicio = config.horario_inicio ?? "08:00";
      const horarioFim = config.horario_fim ?? "20:00";
      const dedupDias = config.dedup_dias ?? 30;

      console.log(`[processar-fila] Processando clínica ${clinicaId}`);

      // 2a. Check sending window
      if (!isWithinWindow(brazilTime.hours, brazilTime.minutes, horarioInicio, horarioFim)) {
        console.log(`[processar-fila] Clínica ${clinicaId}: fora do horário de envio (${horarioInicio}-${horarioFim})`);
        summary.push({ clinica_id: clinicaId, status: "fora_horario", detail: `${horarioInicio}-${horarioFim}` });
        continue;
      }

      // 2b. Pick the oldest 5 pending messages
      const { data: mensagens, error: msgError } = await supabase
        .from("fila_envios")
        .select("*")
        .eq("clinica_id", clinicaId)
        .eq("status", "pendente")
        .lte("data_programada", brazilTime.isoString)
        .order("data_programada", { ascending: true })
        .limit(5);

      if (msgError) {
        console.error(`[processar-fila] Erro ao buscar mensagens para ${clinicaId}:`, msgError);
        summary.push({ clinica_id: clinicaId, status: "erro", detail: msgError.message });
        continue;
      }

      if (!mensagens || mensagens.length === 0) {
        console.log(`[processar-fila] Clínica ${clinicaId}: sem mensagens pendentes`);
        summary.push({ clinica_id: clinicaId, status: "sem_pendentes" });
        continue;
      }

      // Process each pending message for this clinic
      for (const msg of mensagens) {
        console.log(`[processar-fila] Mensagem ${msg.id} para ${msg.paciente_nome} (${msg.telefone})`);

        // 2c. Dedup check: has this paciente_id been sent in the last dedup_dias?
        const dedupCutoff = new Date();
        dedupCutoff.setDate(dedupCutoff.getDate() - dedupDias);

        const { count: dedupCount, error: dedupError } = await supabase
          .from("fila_envios")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", clinicaId)
          .eq("paciente_id", msg.paciente_id)
          .eq("status", "enviado")
          .gte("updated_at", dedupCutoff.toISOString())
          .neq("id", msg.id);

        if (dedupError) {
          console.error(`[processar-fila] Erro na verificação de dedup:`, dedupError);
        }

        if ((dedupCount ?? 0) > 0) {
          console.log(`[processar-fila] Mensagem ${msg.id} ignorada por dedup (paciente ${msg.paciente_id} enviado nos últimos ${dedupDias} dias)`);
          
          const { error: dedupUpdateError } = await supabase
            .from("fila_envios")
            .update({ status: "dedup_ignorado", updated_at: new Date().toISOString() })
            .eq("id", msg.id);

          if (dedupUpdateError) {
            console.error(`[processar-fila] Erro ao marcar dedup_ignorado:`, dedupUpdateError);
          }

          summary.push({ clinica_id: clinicaId, status: "dedup_ignorado", detail: `msg ${msg.id}` });
          continue;
        }

        // 2d. Check credit balance before sending (atomic read)
        const { data: carteira, error: carteiraError } = await supabase
          .from("carteira_envios")
          .select("id, saldo")
          .eq("clinica_id", clinicaId)
          .single();

        if (carteiraError || !carteira) {
          console.error(`[processar-fila] Erro ao buscar carteira para ${clinicaId}:`, carteiraError);
          summary.push({ clinica_id: clinicaId, status: "erro", detail: "Carteira não encontrada" });
          break; // stop processing this clinic
        }

        if (carteira.saldo <= 0) {
          console.log(`[processar-fila] Clínica ${clinicaId}: saldo insuficiente (${carteira.saldo})`);
          summary.push({ clinica_id: clinicaId, status: "sem_saldo", detail: `Saldo: ${carteira.saldo}` });
          break; // stop processing this clinic
        }

        // 2e. Send message via Evolution API
        const instanceName = `dentos_${clinicaId.replace(/-/g, "").slice(0, 12)}`;
        const sendUrl = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;

        console.log(`[processar-fila] Enviando para ${msg.telefone} via instância ${instanceName}`);

        let sendSuccess = false;
        let sendErrorDetail = "";

        try {
          const sendResponse = await fetch(sendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              number: msg.telefone,
              text: msg.mensagem,
            }),
          });

          if (sendResponse.ok) {
            sendSuccess = true;
            console.log(`[processar-fila] Mensagem ${msg.id} enviada com sucesso`);
          } else {
            const errorBody = await sendResponse.text().catch(() => "");
            sendErrorDetail = `HTTP ${sendResponse.status}: ${errorBody.slice(0, 500)}`;
            console.error(`[processar-fila] Falha ao enviar mensagem ${msg.id}: ${sendErrorDetail}`);
          }
        } catch (fetchError: any) {
          sendErrorDetail = `Fetch error: ${fetchError.message || String(fetchError)}`;
          console.error(`[processar-fila] Exceção ao enviar mensagem ${msg.id}:`, fetchError);
        }

        // 2f. Update message status
        if (sendSuccess) {
          const { error: updateError } = await supabase
            .from("fila_envios")
            .update({ status: "enviado", updated_at: new Date().toISOString() })
            .eq("id", msg.id);

          if (updateError) {
            console.error(`[processar-fila] Erro ao atualizar status para enviado:`, updateError);
          }

          // 2g. Atomic saldo decrement using RPC-style update
          const { error: saldoError } = await supabase.rpc('decrementar_saldo', {
            p_clinica_id: clinicaId,
            p_quantidade: 1,
          });

          if (saldoError) {
            // Fallback: try non-atomic update if RPC doesn't exist yet
            console.warn(`[processar-fila] RPC decrementar_saldo falhou, usando fallback:`, saldoError);
            await supabase
              .from("carteira_envios")
              .update({ saldo: carteira.saldo - 1 })
              .eq("id", carteira.id);
          }

          summary.push({ clinica_id: clinicaId, status: "enviado", detail: `msg ${msg.id} → ${msg.telefone}` });
        } else {
          const { error: falhaError } = await supabase
            .from("fila_envios")
            .update({
              status: "falha",
              updated_at: new Date().toISOString(),
            })
            .eq("id", msg.id);

          if (falhaError) {
            console.error(`[processar-fila] Erro ao atualizar status para falha:`, falhaError);
          }

          summary.push({ clinica_id: clinicaId, status: "falha", detail: sendErrorDetail.slice(0, 200) });
        }

        // Small delay between messages to avoid WhatsApp rate limits (2 seconds)
        if (mensagens.indexOf(msg) < mensagens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } // end for-of mensagens
    }

    const enviados = summary.filter((s) => s.status === "enviado").length;
    const falhas = summary.filter((s) => s.status === "falha").length;
    const dedup = summary.filter((s) => s.status === "dedup_ignorado").length;

    console.log(`[processar-fila] Concluído: ${enviados} enviados, ${falhas} falhas, ${dedup} dedup`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: brazilTime.isoString,
        total_clinicas: configs.length,
        enviados,
        falhas,
        dedup_ignorados: dedup,
        detalhes: summary,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[processar-fila] Erro inesperado:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
