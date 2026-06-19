import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "https://evolution-evolution-api.qfjowr.easypanel.host";
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
 * Parses a date in "dd/MM/yyyy" format (used in procedimentos.data_finalizacao).
 */
function parseDateBR(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d;
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

      // ═══ Verificação de saúde da conexão antes de enviar ═══
      // Valida se a instância realmente está conectada na Evolution API
      const instanceName = `dentos_${clinicaId.replace(/-/g, "").slice(0, 12)}`;
      let connectionOk = false;

      try {
        const connCheckRes = await fetch(
          `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              apikey: EVOLUTION_API_KEY,
            },
          }
        );

        if (connCheckRes.ok) {
          const connData = await connCheckRes.json();
          const connState = (connData?.instance?.state ?? connData?.state ?? "close").toLowerCase();

          if (connState === "open") {
            connectionOk = true;
            console.log(`[processar-fila] Clínica ${clinicaId}: conexão ativa (open)`);
          } else {
            console.warn(`[processar-fila] Clínica ${clinicaId}: estado=${connState}. Tentando reconectar...`);

            // Tentar reconectar na instância existente
            try {
              const reconnRes = await fetch(
                `${EVOLUTION_API_URL}/instance/connect/${instanceName}`,
                { method: "GET", headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY } }
              );

              if (reconnRes.ok) {
                // Esperar 5 segundos para a reconexão automática (sessão cached)
                await new Promise(resolve => setTimeout(resolve, 5000));

                // Verificar novamente
                const recheckRes = await fetch(
                  `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
                  { method: "GET", headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY } }
                );

                if (recheckRes.ok) {
                  const recheckData = await recheckRes.json();
                  const recheckState = (recheckData?.instance?.state ?? recheckData?.state ?? "close").toLowerCase();

                  if (recheckState === "open") {
                    connectionOk = true;
                    console.log(`[processar-fila] Clínica ${clinicaId}: reconexão automática bem-sucedida!`);
                  } else {
                    console.warn(`[processar-fila] Clínica ${clinicaId}: reconexão retornou estado=${recheckState}. Tentando recriar instância...`);

                    // Última tentativa: deletar e recriar a instância
                    try {
                      // Logout
                      await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
                        method: "DELETE", headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY }
                      }).catch(() => {});

                      // Deletar
                      await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
                        method: "DELETE", headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY }
                      }).catch(() => {});

                      await new Promise(resolve => setTimeout(resolve, 2000));

                      // Recriar
                      const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                        body: JSON.stringify({
                          instanceName,
                          qrcode: true,
                          integration: "WHATSAPP-BAILEYS",
                        }),
                      });

                      if (createRes.ok) {
                        // Esperar e verificar se conectou com sessão cached
                        await new Promise(resolve => setTimeout(resolve, 5000));

                        const finalCheckRes = await fetch(
                          `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
                          { method: "GET", headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY } }
                        );

                        if (finalCheckRes.ok) {
                          const finalData = await finalCheckRes.json();
                          const finalState = (finalData?.instance?.state ?? finalData?.state ?? "close").toLowerCase();

                          if (finalState === "open") {
                            connectionOk = true;
                            console.log(`[processar-fila] Clínica ${clinicaId}: instância recriada e reconectada automaticamente!`);
                          } else {
                            console.error(`[processar-fila] Clínica ${clinicaId}: recriação não reconectou (${finalState}). Precisa escanear QR code.`);
                          }
                        }
                      }
                    } catch (recreateErr) {
                      console.error(`[processar-fila] Clínica ${clinicaId}: erro ao recriar instância:`, recreateErr);
                    }
                  }
                }
              }
            } catch (reconnErr) {
              console.error(`[processar-fila] Clínica ${clinicaId}: erro ao reconectar:`, reconnErr);
            }
          }
        } else {
          console.warn(`[processar-fila] Clínica ${clinicaId}: instância não encontrada (HTTP ${connCheckRes.status}). Tentando recriar...`);

          // Instância não existe — tentar recriar
          try {
            const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
              body: JSON.stringify({
                instanceName,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS",
              }),
            });

            if (createRes.ok) {
              await new Promise(resolve => setTimeout(resolve, 5000));

              const verifyRes = await fetch(
                `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
                { method: "GET", headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY } }
              );

              if (verifyRes.ok) {
                const verifyData = await verifyRes.json();
                const verifyState = (verifyData?.instance?.state ?? verifyData?.state ?? "close").toLowerCase();

                if (verifyState === "open") {
                  connectionOk = true;
                  console.log(`[processar-fila] Clínica ${clinicaId}: instância criada e conectada automaticamente!`);
                }
              }
            }
          } catch (createErr) {
            console.error(`[processar-fila] Clínica ${clinicaId}: erro ao criar instância:`, createErr);
          }
        }
      } catch (healthErr) {
        console.error(`[processar-fila] Clínica ${clinicaId}: erro no health check:`, healthErr);
      }

      // Se a conexão não está ativa, atualizar whatsapp_config e pular esta clínica
      if (!connectionOk) {
        console.error(`[processar-fila] Clínica ${clinicaId}: CONEXÃO INDISPONÍVEL. Atualizando banco e pulando envios.`);

        try {
          await supabase
            .from("whatsapp_config")
            .update({
              conectado: false,
              updated_at: new Date().toISOString(),
            })
            .eq("clinica_id", clinicaId);
        } catch (dbErr) {
          console.error(`[processar-fila] Erro ao atualizar whatsapp_config:`, dbErr);
        }

        summary.push({ clinica_id: clinicaId, status: "desconectado", detail: "Instância desconectada — reconexão falhou" });
        continue;
      }

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

      // ═══ LOCK: Marcar como 'processando' ANTES de enviar para evitar duplicatas ═══
      const msgIds = mensagens.map((m: any) => m.id);
      const { error: lockError } = await supabase
        .from("fila_envios")
        .update({ status: "processando", updated_at: new Date().toISOString() })
        .in("id", msgIds)
        .eq("status", "pendente"); // Só atualiza se ainda estiver pendente (atomic guard)

      if (lockError) {
        console.error(`[processar-fila] Erro ao marcar como processando:`, lockError);
      }

      // Re-fetch only the ones we successfully locked
      const { data: mensagensLocked } = await supabase
        .from("fila_envios")
        .select("*")
        .in("id", msgIds)
        .eq("status", "processando");

      if (!mensagensLocked || mensagensLocked.length === 0) {
        console.log(`[processar-fila] Clínica ${clinicaId}: mensagens já foram processadas por outra instância`);
        summary.push({ clinica_id: clinicaId, status: "locked_by_other" });
        continue;
      }

      // Track phones sent in this batch to avoid sending twice to same number
      const phonesSentThisBatch = new Set<string>();

      // Process each locked message for this clinic
      for (const msg of mensagensLocked) {
        console.log(`[processar-fila] Mensagem ${msg.id} para ${msg.paciente_nome} (${msg.telefone})`);

        // ═══ Dedup intra-batch: não enviar 2x para o mesmo telefone no mesmo lote ═══
        if (phonesSentThisBatch.has(msg.telefone)) {
          console.log(`[processar-fila] Telefone ${msg.telefone} já recebeu neste lote, pulando`);
          await supabase.from("fila_envios").update({ status: "pendente", updated_at: new Date().toISOString() }).eq("id", msg.id);
          continue;
        }

        // ═══ Dedup global: verificar se já enviamos para este telefone HOJE ═══
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const { count: sentTodayCount } = await supabase
          .from("fila_envios")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", clinicaId)
          .eq("telefone", msg.telefone)
          .eq("status", "enviado")
          .gte("updated_at", todayStart.toISOString());

        if ((sentTodayCount ?? 0) >= 2) {
          console.log(`[processar-fila] Telefone ${msg.telefone} já recebeu ${sentTodayCount} msgs hoje, cancelando`);
          await supabase.from("fila_envios").update({ status: "dedup_ignorado", updated_at: new Date().toISOString() }).eq("id", msg.id);
          summary.push({ clinica_id: clinicaId, status: "dedup_dia", detail: `${msg.telefone} já recebeu ${sentTodayCount} msgs hoje` });
          continue;
        }

        // ═══ PROTEÇÃO OPT-OUT: Verificar se paciente ainda está Ativo ═══
        if (msg.paciente_id) {
          const { data: paciente } = await supabase
            .from("clientes")
            .select("situacao")
            .eq("id", msg.paciente_id)
            .single();

          const situacao = (paciente?.situacao ?? "").toLowerCase();
          if (situacao === "desabilitado" || situacao === "inativo") {
            console.warn(`[processar-fila] Paciente ${msg.paciente_nome} está ${situacao}. Cancelando msg ${msg.id}.`);
            await supabase.from("fila_envios").update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("id", msg.id);
            summary.push({ clinica_id: clinicaId, status: "optout_cancelado", detail: `${msg.paciente_nome} está ${situacao}` });
            continue;
          }
        }

        // Regra de Retorno de Paciente: se o paciente realizou o procedimento mais recentemente, cancela o envio.
        if (msg.origem === "procedimento" && msg.campanha_ref) {
          try {
            const { data: campanha, error: campanhaError } = await supabase
              .from("campanhas_procedimento")
              .select("procedimentos_nomes, dias_entre_envios")
              .eq("group_id", msg.campanha_ref)
              .eq("clinica_id", clinicaId)
              .maybeSingle();

            if (campanha && !campanhaError) {
              const nomesProc: string[] = campanha.procedimentos_nomes ?? [];
              const diasEntreEnvios = campanha.dias_entre_envios ?? 30;

              if (nomesProc.length > 0 && diasEntreEnvios > 0) {
                // Determinar a data do procedimento que disparou este envio
                const dataProg = new Date(msg.data_programada);
                const dataOriginal = new Date(dataProg.getTime());
                dataOriginal.setDate(dataOriginal.getDate() - diasEntreEnvios);
                const timeOriginal = new Date(dataOriginal.getFullYear(), dataOriginal.getMonth(), dataOriginal.getDate()).getTime();

                // Buscar todos os procedimentos do paciente
                const { data: procs, error: procsError } = await supabase
                  .from("procedimentos")
                  .select("data_finalizacao, procedimento")
                  .eq("clinica_id", clinicaId)
                  .ilike("nome_paciente", msg.paciente_nome);

                if (procs && !procsError) {
                  const nomesProcLower = nomesProc.map((n) => n.toLowerCase());
                  const temMaisRecente = procs.some((proc: any) => {
                    const pNome = (proc.procedimento ?? "").toLowerCase();
                    if (!nomesProcLower.includes(pNome)) return false;

                    const procDate = parseDateBR(proc.data_finalizacao);
                    if (!procDate) return false;

                    const timeProc = new Date(procDate.getFullYear(), procDate.getMonth(), procDate.getDate()).getTime();
                    return timeProc > timeOriginal;
                  });

                  if (temMaisRecente) {
                    console.log(`[processar-fila] Mensagem ${msg.id} cancelada: o paciente ${msg.paciente_nome} realizou o procedimento de ${nomesProc.join(", ")} mais recentemente`);
                    
                    const { error: cancelError } = await supabase
                      .from("fila_envios")
                      .update({ status: "cancelado", updated_at: new Date().toISOString() })
                      .eq("id", msg.id);

                    if (cancelError) {
                      console.error(`[processar-fila] Erro ao marcar mensagem como cancelada:`, cancelError);
                    }

                    summary.push({ clinica_id: clinicaId, status: "cancelado", detail: `msg ${msg.id} (paciente retornou)` });
                    continue;
                  }
                }
              }
            }
          } catch (checkErr) {
            console.error(`[processar-fila] Erro na verificação de retorno de paciente para msg ${msg.id}:`, checkErr);
          }
        }

        // 2c. Dedup check: has this paciente_id OR this telefone been sent in the last dedup_dias?
        const dedupCutoff = new Date();
        dedupCutoff.setDate(dedupCutoff.getDate() - dedupDias);

        let hasDuplicate = false;
        let dedupReason = "";

        if (msg.paciente_id) {
          const { count: dedupCount, error: dedupError } = await supabase
            .from("fila_envios")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("paciente_id", msg.paciente_id)
            .eq("status", "enviado")
            .gte("updated_at", dedupCutoff.toISOString())
            .neq("id", msg.id);

          if (dedupError) {
            console.error(`[processar-fila] Erro na verificação de dedup por paciente_id:`, dedupError);
          }
          if ((dedupCount ?? 0) > 0) {
            hasDuplicate = true;
            dedupReason = `paciente ${msg.paciente_id} enviado nos últimos ${dedupDias} dias`;
          }
        }

        if (!hasDuplicate && msg.telefone) {
          const { count: dedupPhoneCount, error: dedupPhoneError } = await supabase
            .from("fila_envios")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("telefone", msg.telefone)
            .eq("status", "enviado")
            .gte("updated_at", dedupCutoff.toISOString())
            .neq("id", msg.id);

          if (dedupPhoneError) {
            console.error(`[processar-fila] Erro na verificação de dedup por telefone:`, dedupPhoneError);
          }
          if ((dedupPhoneCount ?? 0) > 0) {
            hasDuplicate = true;
            dedupReason = `telefone ${msg.telefone} enviado nos últimos ${dedupDias} dias`;
          }
        }

        if (hasDuplicate) {
          console.log(`[processar-fila] Mensagem ${msg.id} ignorada por dedup: ${dedupReason}`);
          
          const { error: dedupUpdateError } = await supabase
            .from("fila_envios")
            .update({ status: "dedup_ignorado", updated_at: new Date().toISOString() })
            .eq("id", msg.id);

          if (dedupUpdateError) {
            console.error(`[processar-fila] Erro ao marcar dedup_ignorado:`, dedupUpdateError);
          }

          summary.push({ clinica_id: clinicaId, status: "dedup_ignorado", detail: `msg ${msg.id} (duplicado: ${dedupReason})` });
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

        // ══════════════════════════════════════════════════════════════════
        // CAMADA FINAL DE PROTEÇÃO — Verificação pré-envio
        // ══════════════════════════════════════════════════════════════════

        // PROTEÇÃO 1: Re-verificar que esta mensagem AINDA está como 'processando'
        // Se outra instância já processou, o status terá mudado
        const { data: msgCheck, error: checkError } = await supabase
          .from("fila_envios")
          .select("status")
          .eq("id", msg.id)
          .single();

        if (checkError || !msgCheck || msgCheck.status !== "processando") {
          console.warn(`[processar-fila] PROTEÇÃO: msg ${msg.id} status=${msgCheck?.status ?? 'desconhecido'} (esperado: processando). ABORTANDO envio.`);
          continue;
        }

        // PROTEÇÃO 2: Verificar se este TELEFONE já recebeu msg enviada hoje (última barreira)
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        const { count: jaEnviadoHoje } = await supabase
          .from("fila_envios")
          .select("id", { count: "exact", head: true })
          .eq("clinica_id", clinicaId)
          .eq("telefone", msg.telefone)
          .eq("status", "enviado")
          .gte("updated_at", todayUTC.toISOString());

        if ((jaEnviadoHoje ?? 0) > 0) {
          console.warn(`[processar-fila] PROTEÇÃO FINAL: telefone ${msg.telefone} JÁ tem ${jaEnviadoHoje} envio(s) hoje. Cancelando msg ${msg.id}.`);
          await supabase.from("fila_envios").update({ status: "dedup_ignorado", updated_at: new Date().toISOString() }).eq("id", msg.id);
          summary.push({ clinica_id: clinicaId, status: "dedup_final", detail: `${msg.telefone} já enviado hoje` });
          continue;
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
          // Atualizar status para 'enviado'
          const { error: updateError } = await supabase
            .from("fila_envios")
            .update({ status: "enviado", updated_at: new Date().toISOString() })
            .eq("id", msg.id);

          if (updateError) {
            console.error(`[processar-fila] ⛔ CRÍTICO: Erro ao atualizar status para enviado:`, updateError);
            // PROTEÇÃO 3: Se não conseguiu atualizar status, PARAR TUDO para esta clínica
            // Isso evita enviar mais mensagens sem conseguir rastrear
            summary.push({ clinica_id: clinicaId, status: "erro_critico", detail: `Falha ao atualizar status msg ${msg.id} — processamento interrompido` });
            break;
          }

          // PROTEÇÃO 4: Verificar se o update realmente funcionou
          const { data: verificacao } = await supabase
            .from("fila_envios")
            .select("status")
            .eq("id", msg.id)
            .single();

          if (!verificacao || verificacao.status !== "enviado") {
            console.error(`[processar-fila] ⛔ CRÍTICO: Status não mudou para 'enviado' após update! status=${verificacao?.status}. PARANDO.`);
            summary.push({ clinica_id: clinicaId, status: "erro_critico", detail: `Verificação pós-update falhou para msg ${msg.id}` });
            break;
          }

          // Track this phone as sent
          phonesSentThisBatch.add(msg.telefone);

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
        if (mensagensLocked.indexOf(msg) < mensagensLocked.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } // end for-of mensagensLocked
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
