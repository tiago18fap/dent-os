import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

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
 * Parses a date in "YYYY-MM-DD" format (used in clientes.nascimento).
 */
function parseDateISO(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Replaces template variables like {nome}, {procedimento} in a message string.
 */
function substituirVariaveis(
  mensagem: string,
  vars: Record<string, string | null | undefined>
): string {
  let result = mensagem;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{${key}\\}`, "gi");
    result = result.replace(regex, value ?? "");
  }
  return result;
}

/**
 * Capitalizes the first letter and lowercases the rest.
 */
function capitalizeName(name: string): string {
  const first = name.split(" ")[0] ?? "";
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Returns today's date in Brazil timezone as a Date object (date-only, no time).
 */
function getBrazilToday(): Date {
  const now = new Date();
  const brFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = brFormatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "2026", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "1", 10);
  return new Date(year, month, day);
}

/**
 * Formats a Date + time string ("HH:MM") into an ISO timestamp.
 */
function dateWithTime(date: Date, timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h || 0, m || 0, 0);
  // Convert from BRT (UTC-3) to UTC for storage
  d.setHours(d.getHours() + 3);
  return d.toISOString();
}

/**
 * Detects whether the campanha_ref column exists in fila_envios.
 */
async function hasCampanhaRef(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("fila_envios")
      .select("campanha_ref")
      .limit(0);
    return !error;
  } catch {
    return false;
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[gerar-fila-diaria] Início da geração de fila");

    const hoje = getBrazilToday();
    const temCampanhaRef = await hasCampanhaRef();

    console.log(`[gerar-fila-diaria] Data de referência (BRT): ${hoje.toISOString().slice(0, 10)}`);
    console.log(`[gerar-fila-diaria] Coluna campanha_ref: ${temCampanhaRef ? "SIM" : "NÃO"}`);

    // 1. Query all clinicas with conectado = true
    const { data: configs, error: configError } = await supabase
      .from("whatsapp_config")
      .select("clinica_id, dedup_dias, horario_inicio")
      .eq("conectado", true);

    if (configError) {
      console.error("[gerar-fila-diaria] Erro ao buscar whatsapp_config:", configError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar configurações", detail: configError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!configs || configs.length === 0) {
      console.log("[gerar-fila-diaria] Nenhuma clínica conectada encontrada");
      return new Response(
        JSON.stringify({ message: "Nenhuma clínica conectada", total: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[gerar-fila-diaria] ${configs.length} clínica(s) conectada(s)`);

    // Define the 30-day future window
    const fim30 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30);

    const clinicaSummaries: Array<{
      clinica_id: string;
      procedimentos: number;
      aniversario_dia: number;
      aniversario_mes: number;
      erros: string[];
    }> = [];

    // 2. Process each clinica
    for (const config of configs) {
      const clinicaId = config.clinica_id;
      const dedupDias = config.dedup_dias ?? 30;
      const horarioInicio = config.horario_inicio ?? "08:00";

      console.log(`[gerar-fila-diaria] ═══ Clínica ${clinicaId} ═══`);

      const clinicaResult = {
        clinica_id: clinicaId,
        procedimentos: 0,
        aniversario_dia: 0,
        aniversario_mes: 0,
        erros: [] as string[],
      };

      // ═══════════════════════════════════════════════════════════════
      // ETAPA A: Campanhas por Procedimento
      // ═══════════════════════════════════════════════════════════════
      try {
        const { data: campanhas, error: erroCampanhas } = await supabase
          .from("campanhas_procedimento")
          .select("*")
          .eq("clinica_id", clinicaId)
          .eq("ativo", true);

        if (erroCampanhas) {
          clinicaResult.erros.push(`Erro ao buscar campanhas: ${erroCampanhas.message}`);
        }

        if (campanhas && campanhas.length > 0) {
          console.log(`[gerar-fila-diaria] ${campanhas.length} campanha(s) de procedimento ativa(s)`);

          for (const campanha of campanhas) {
            try {
              const nomesProc: string[] = campanha.procedimentos_nomes ?? [];
              const diasEntreEnvios: number = campanha.dias_entre_envios ?? 30;
              const mensagemTemplate: string = campanha.mensagem ?? "";
              const groupId: string = campanha.group_id;

              if (nomesProc.length === 0 || !mensagemTemplate.trim() || diasEntreEnvios <= 0) continue;

              // Fetch matching procedures for this clinica
              const { data: procs, error: erroProcs } = await supabase
                .from("procedimentos")
                .select("nome_paciente, data_finalizacao, procedimento")
                .eq("clinica_id", clinicaId)
                .in("procedimento", nomesProc);

              if (erroProcs || !procs || procs.length === 0) continue;

              console.log(`[gerar-fila-diaria] Campanha ${groupId}: ${procs.length} procedimentos encontrados`);

              // Build a map of candidates: pacienteName -> { procedimento, dataEnvio }
              const candidatos = new Map<
                string,
                Array<{ procedimento: string; dataEnvio: Date }>
              >();

              for (const proc of procs) {
                const nome = (proc.nome_paciente ?? "").trim();
                if (!nome) continue;

                const dataFin = parseDateBR(proc.data_finalizacao);
                if (!dataFin) continue;

                // Calculate send date = data_finalizacao + dias_entre_envios
                const dataEnvio = new Date(dataFin.getFullYear(), dataFin.getMonth(), dataFin.getDate());
                dataEnvio.setDate(dataEnvio.getDate() + diasEntreEnvios);

                // Only consider if within [hoje, hoje+30]
                if (dataEnvio >= hoje && dataEnvio <= fim30) {
                  if (!candidatos.has(nome)) {
                    candidatos.set(nome, []);
                  }
                  candidatos.get(nome)!.push({
                    procedimento: proc.procedimento,
                    dataEnvio,
                  });
                }
              }

              if (candidatos.size === 0) continue;

              // Fetch matching clients
              const nomesPacientes = Array.from(candidatos.keys());

              // Process in batches to avoid too-long IN queries
              const BATCH_SIZE = 100;
              for (let i = 0; i < nomesPacientes.length; i += BATCH_SIZE) {
                const batch = nomesPacientes.slice(i, i + BATCH_SIZE);

                const { data: clientes, error: erroClientes } = await supabase
                  .from("clientes")
                  .select("id, paciente, telefone")
                  .eq("clinica_id", clinicaId)
                  .ilike("situacao", "Ativo")
                  .in("paciente", batch);

                if (erroClientes || !clientes || clientes.length === 0) continue;

                for (const cliente of clientes) {
                  const nomePaciente = (cliente.paciente ?? "").trim();
                  const telefone = (cliente.telefone ?? "").trim();
                  if (!telefone) continue;

                  const envios = candidatos.get(nomePaciente);
                  if (!envios) continue;

                  for (const envio of envios) {
                    // Dedup check: has this paciente been sent/queued in the last dedup_dias?
                    const dedupCutoff = new Date();
                    dedupCutoff.setDate(dedupCutoff.getDate() - dedupDias);

                    const { count: dedupCount } = await supabase
                      .from("fila_envios")
                      .select("id", { count: "exact", head: true })
                      .eq("clinica_id", clinicaId)
                      .eq("paciente_id", cliente.id)
                      .in("status", ["pendente", "enviado"])
                      .gte("data_programada", dedupCutoff.toISOString());

                    if ((dedupCount ?? 0) > 0) continue;

                    // Duplicate entry check: exact same paciente + campanha + date
                    const dataProgramada = dateWithTime(envio.dataEnvio, horarioInicio);
                    const dataEnvioStart = dateWithTime(envio.dataEnvio, "00:00");
                    const dataEnvioEnd = new Date(envio.dataEnvio.getFullYear(), envio.dataEnvio.getMonth(), envio.dataEnvio.getDate(), 23, 59, 59);
                    dataEnvioEnd.setHours(dataEnvioEnd.getHours() + 3); // BRT to UTC

                    let dupQuery = supabase
                      .from("fila_envios")
                      .select("id", { count: "exact", head: true })
                      .eq("clinica_id", clinicaId)
                      .eq("paciente_id", cliente.id)
                      .eq("origem", "procedimento")
                      .gte("data_programada", dataEnvioStart)
                      .lte("data_programada", dataEnvioEnd.toISOString());

                    if (temCampanhaRef) {
                      dupQuery = dupQuery.eq("campanha_ref", groupId);
                    }

                    const { count: dupCount } = await dupQuery;
                    if ((dupCount ?? 0) > 0) continue;

                    // Build message with variable substitution
                    const nomeFormatado = capitalizeName(nomePaciente);
                    const mensagemFinal = substituirVariaveis(mensagemTemplate, {
                      nome: nomeFormatado,
                      procedimento: envio.procedimento,
                    });

                    // Insert into fila_envios
                    const insertObj: Record<string, any> = {
                      clinica_id: clinicaId,
                      paciente_id: cliente.id,
                      paciente_nome: nomePaciente,
                      telefone: telefone,
                      mensagem: mensagemFinal,
                      data_programada: dataProgramada,
                      status: "pendente",
                      custo: 1,
                      origem: "procedimento",
                    };
                    if (temCampanhaRef) {
                      insertObj.campanha_ref = groupId;
                    }

                    const { error: erroInsert } = await supabase
                      .from("fila_envios")
                      .insert(insertObj);

                    if (!erroInsert) {
                      clinicaResult.procedimentos++;
                    } else {
                      clinicaResult.erros.push(`Insert proc erro: ${erroInsert.message}`);
                    }
                  }
                }
              }
            } catch (err) {
              clinicaResult.erros.push(`Erro campanha ${campanha.group_id}: ${String(err)}`);
            }
          }
        }
      } catch (err) {
        clinicaResult.erros.push(`Erro geral procedimentos: ${String(err)}`);
      }

      // ═══════════════════════════════════════════════════════════════
      // ETAPA B: Campanhas de Aniversário (Dia)
      //
      // For each of the next 30 days, find clients whose birthday
      // (day+month) matches that date.
      // ═══════════════════════════════════════════════════════════════
      try {
        const { data: configDia } = await supabase
          .from("campanhas_config")
          .select("mensagem, ativo")
          .eq("clinica_id", clinicaId)
          .eq("chave", "aniversario_dia")
          .maybeSingle();

        if (configDia?.ativo && configDia.mensagem) {
          console.log(`[gerar-fila-diaria] Campanha aniversário_dia ativa para ${clinicaId}`);

          // Fetch all active clients with birthday and phone
          const { data: clientesAtivos } = await supabase
            .from("clientes")
            .select("id, paciente, telefone, nascimento")
            .eq("clinica_id", clinicaId)
            .ilike("situacao", "Ativo")
            .not("nascimento", "is", null)
            .not("telefone", "is", null);

          if (clientesAtivos && clientesAtivos.length > 0) {
            // Build a lookup: "DD-MM" → clients
            const birthdayMap = new Map<string, typeof clientesAtivos>();
            for (const c of clientesAtivos) {
              if (!c.nascimento || !c.telefone) continue;
              const nasc = parseDateISO(c.nascimento);
              if (!nasc) continue;
              const key = `${String(nasc.getDate()).padStart(2, "0")}-${String(nasc.getMonth() + 1).padStart(2, "0")}`;
              if (!birthdayMap.has(key)) birthdayMap.set(key, []);
              birthdayMap.get(key)!.push(c);
            }

            // For each day in the next 30 days
            for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
              const targetDate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dayOffset);
              const targetKey = `${String(targetDate.getDate()).padStart(2, "0")}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;

              const aniversariantes = birthdayMap.get(targetKey);
              if (!aniversariantes || aniversariantes.length === 0) continue;

              const dataProgramada = dateWithTime(targetDate, horarioInicio);
              const dataStart = dateWithTime(targetDate, "00:00");
              const dataEndDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);
              dataEndDate.setHours(dataEndDate.getHours() + 3);

              for (const cliente of aniversariantes) {
                // Dedup: check existing entries for this day + patient + origin
                let dupQuery = supabase
                  .from("fila_envios")
                  .select("id", { count: "exact", head: true })
                  .eq("clinica_id", clinicaId)
                  .eq("paciente_id", cliente.id)
                  .eq("origem", "aniversario_dia")
                  .gte("data_programada", dataStart)
                  .lte("data_programada", dataEndDate.toISOString());

                const { count: dup } = await dupQuery;
                if ((dup ?? 0) > 0) continue;

                // Global dedup check
                const dedupCutoff = new Date();
                dedupCutoff.setDate(dedupCutoff.getDate() - dedupDias);

                const { count: dedupGlobal } = await supabase
                  .from("fila_envios")
                  .select("id", { count: "exact", head: true })
                  .eq("clinica_id", clinicaId)
                  .eq("paciente_id", cliente.id)
                  .in("status", ["pendente", "enviado"])
                  .gte("data_programada", dedupCutoff.toISOString());

                if ((dedupGlobal ?? 0) > 0) continue;

                const nomeFormatado = capitalizeName(cliente.paciente ?? "");
                const mensagemFinal = substituirVariaveis(configDia.mensagem, {
                  nome: nomeFormatado,
                });

                const insertObj: Record<string, any> = {
                  clinica_id: clinicaId,
                  paciente_id: cliente.id,
                  paciente_nome: cliente.paciente,
                  telefone: cliente.telefone,
                  mensagem: mensagemFinal,
                  data_programada: dataProgramada,
                  status: "pendente",
                  custo: 1,
                  origem: "aniversario_dia",
                };
                if (temCampanhaRef) {
                  insertObj.campanha_ref = "aniversario_dia";
                }

                const { error: erroInsert } = await supabase
                  .from("fila_envios")
                  .insert(insertObj);

                if (!erroInsert) {
                  clinicaResult.aniversario_dia++;
                } else {
                  clinicaResult.erros.push(`Insert aniv_dia erro: ${erroInsert.message}`);
                }
              }
            }
          }
        }
      } catch (err) {
        clinicaResult.erros.push(`Erro aniversário dia: ${String(err)}`);
      }

      // ═══════════════════════════════════════════════════════════════
      // ETAPA C: Campanhas de Aniversário (Mês)
      //
      // Regra: No dia 1 de cada mês, enviar mensagem para TODOS os
      // aniversariantes daquele mês. Gera fila com 30 dias de
      // antecedência (mês atual + próximo mês).
      // data_programada = dia 01 do mês de aniversário às horario_inicio
      // ═══════════════════════════════════════════════════════════════
      try {
        const { data: configMes } = await supabase
          .from("campanhas_config")
          .select("mensagem, ativo")
          .eq("clinica_id", clinicaId)
          .eq("chave", "aniversario_mes")
          .maybeSingle();

        // Verificar se campanha aniversario_dia está ativa (para evitar overlap)
        const { data: configDiaCheck } = await supabase
          .from("campanhas_config")
          .select("ativo")
          .eq("clinica_id", clinicaId)
          .eq("chave", "aniversario_dia")
          .maybeSingle();
        const diaAtivoCheck = configDiaCheck?.ativo === true;

        if (configMes?.ativo && configMes.mensagem) {
          console.log(`[gerar-fila-diaria] Campanha aniversário_mes ativa para ${clinicaId}`);

          const mesAtual = hoje.getMonth() + 1; // 1-12
          const proxMes = mesAtual === 12 ? 1 : mesAtual + 1;
          const anoProxMes = mesAtual === 12 ? hoje.getFullYear() + 1 : hoje.getFullYear();

          // Meses a processar: atual + próximo (janela de 30 dias)
          const mesesParaProcessar = [
            { mes: mesAtual, ano: hoje.getFullYear() },
            { mes: proxMes, ano: anoProxMes },
          ];

          const { data: clientesAtivos } = await supabase
            .from("clientes")
            .select("id, paciente, telefone, nascimento")
            .eq("clinica_id", clinicaId)
            .ilike("situacao", "Ativo")
            .not("nascimento", "is", null)
            .not("telefone", "is", null);

          if (clientesAtivos && clientesAtivos.length > 0) {
            for (const { mes, ano } of mesesParaProcessar) {
              // Filtrar aniversariantes deste mês
              const aniversariantes = clientesAtivos.filter((c: any) => {
                if (!c.nascimento || !c.telefone) return false;
                const nasc = parseDateISO(c.nascimento);
                if (!nasc) return false;
                const nascMes = nasc.getMonth() + 1;
                // Se campanha de dia está ativa, excluir overlap do dia
                // Se não está ativa, incluir TODOS do mês
                if (diaAtivoCheck && nascMes === mesAtual && nasc.getDate() === hoje.getDate()) {
                  return false;
                }
                return nascMes === mes;
              });

              if (aniversariantes.length === 0) continue;

              // data_programada = dia 01 do mês de aniversário
              const dia1 = new Date(ano, mes - 1, 1);
              const dataProgramada = dateWithTime(dia1, horarioInicio);

              // Boundaries para dedup do mês
              const inicioMes = new Date(ano, mes - 1, 1);
              inicioMes.setHours(inicioMes.getHours() + 3);
              const fimMes = new Date(ano, mes, 0, 23, 59, 59);
              fimMes.setHours(fimMes.getHours() + 3);

              console.log(`[gerar-fila-diaria] Mês ${mes}/${ano}: ${aniversariantes.length} aniversariantes`);

              for (const cliente of aniversariantes) {
                // Dedup: já inserido para este mês?
                const { count: dup } = await supabase
                  .from("fila_envios")
                  .select("id", { count: "exact", head: true })
                  .eq("clinica_id", clinicaId)
                  .eq("paciente_id", cliente.id)
                  .eq("origem", "aniversario_mes")
                  .gte("data_programada", inicioMes.toISOString())
                  .lte("data_programada", fimMes.toISOString());

                if ((dup ?? 0) > 0) continue;

                const nomeFormatado = capitalizeName(cliente.paciente ?? "");
                const mensagemFinal = substituirVariaveis(configMes.mensagem, {
                  nome: nomeFormatado,
                });

                const insertObj: Record<string, any> = {
                  clinica_id: clinicaId,
                  paciente_id: cliente.id,
                  paciente_nome: cliente.paciente,
                  telefone: cliente.telefone,
                  mensagem: mensagemFinal,
                  data_programada: dataProgramada,
                  status: "pendente",
                  custo: 1,
                  origem: "aniversario_mes",
                };
                if (temCampanhaRef) {
                  insertObj.campanha_ref = "aniversario_mes";
                }

                const { error: erroInsert } = await supabase
                  .from("fila_envios")
                  .insert(insertObj);

                if (!erroInsert) {
                  clinicaResult.aniversario_mes++;
                } else {
                  clinicaResult.erros.push(`Insert aniv_mes erro: ${erroInsert.message}`);
                }
              }
            }
          }
        }
      } catch (err) {
        clinicaResult.erros.push(`Erro aniversário mês: ${String(err)}`);
      }

      const totalClinica =
        clinicaResult.procedimentos + clinicaResult.aniversario_dia + clinicaResult.aniversario_mes;
      console.log(
        `[gerar-fila-diaria] Clínica ${clinicaId}: ${totalClinica} mensagens geradas ` +
          `(proc: ${clinicaResult.procedimentos}, aniv_dia: ${clinicaResult.aniversario_dia}, aniv_mes: ${clinicaResult.aniversario_mes})`
      );
      if (clinicaResult.erros.length > 0) {
        console.warn(`[gerar-fila-diaria] Erros: ${clinicaResult.erros.join("; ")}`);
      }

      clinicaSummaries.push(clinicaResult);
    }

    // Build final summary
    const totalGeral = clinicaSummaries.reduce(
      (acc, c) => acc + c.procedimentos + c.aniversario_dia + c.aniversario_mes,
      0
    );

    console.log(`[gerar-fila-diaria] ═══ Concluído: ${totalGeral} mensagens geradas para ${configs.length} clínica(s) ═══`);

    return new Response(
      JSON.stringify({
        success: true,
        data_referencia: hoje.toISOString().slice(0, 10),
        total_clinicas: configs.length,
        total_mensagens: totalGeral,
        clinicas: clinicaSummaries,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[gerar-fila-diaria] Erro inesperado:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
