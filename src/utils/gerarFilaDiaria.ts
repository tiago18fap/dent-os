import { supabase } from "@/integrations/supabase/client";

interface GeracaoResultado {
  procedimentos: number;
  aniversarios: number;
  total: number;
  erros: string[];
}

/**
 * Faz o parse de uma data no formato "dd/MM/yyyy" para um objeto Date.
 * Retorna null se o parse falhar.
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
 * Substitui variáveis na mensagem ({nome}, {procedimento}, etc.)
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
 * Retorna o início e fim do dia de hoje em ISO string.
 */
function hojeRange(): { inicio: string; fim: string } {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/**
 * Detecta se a coluna campanha_ref existe na tabela fila_envios.
 */
async function hasCampanhaRef(): Promise<boolean> {
  try {
    const { error } = await (supabase as any)
      .from("fila_envios")
      .select("campanha_ref")
      .limit(0);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Gera a fila diária de mensagens para uma clínica específica.
 *
 * Regra para procedimentos:
 *   data_envio = data_finalizacao + dias_entre_envios
 *   Se data_envio == HOJE → 1 mensagem por procedimento
 *
 * Regra para aniversários:
 *   Se nascimento == hoje (dia) → mensagem de aniversário
 *   Se nascimento no mês atual (mês) → mensagem mensal
 */
export async function gerarFilaDiaria(clinicaId: string): Promise<GeracaoResultado> {
  const resultado: GeracaoResultado = {
    procedimentos: 0,
    aniversarios: 0,
    total: 0,
    erros: [],
  };

  const hoje = new Date();
  const { inicio: hojeInicio, fim: hojeFim } = hojeRange();
  
  // Detectar se a coluna campanha_ref existe
  const temCampanhaRef = await hasCampanhaRef();

  // Buscar config de dedup (dedup_dias)
  let dedupDias = 30;
  try {
    const { data: config } = await (supabase as any)
      .from("envio_config")
      .select("dedup_dias")
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    if (config && config.dedup_dias !== undefined && config.dedup_dias !== null) {
      dedupDias = config.dedup_dias;
    }
  } catch (err) {
    console.error("Erro ao buscar dedup_dias config:", err);
  }

  // ═══════════════════════════════════════════════════════════════
  // ETAPA A: Campanhas por Procedimento
  //
  // Regra simples:
  //   data_envio = data_finalizacao + dias_entre_envios
  //   Se data_envio == HOJE → 1 mensagem para este procedimento
  //
  //   Exemplo: procedimento em 30/06, dias_entre_envios=30
  //   → 30/07 → envia ✅ (1 única mensagem)
  // ═══════════════════════════════════════════════════════════════
  try {
    // Data de hoje normalizada (sem horas) para comparação
    const hojeNorm = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    // 1. Buscar campanhas de procedimento ativas
    const { data: campanhas, error: erroCampanhas } = await (supabase as any)
      .from("campanhas_procedimento")
      .select("*")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true);

    if (erroCampanhas) {
      resultado.erros.push(`Erro ao buscar campanhas: ${erroCampanhas.message}`);
    }

    if (campanhas && campanhas.length > 0) {
      for (const campanha of campanhas) {
        try {
          const nomesProc: string[] = campanha.procedimentos_nomes ?? [];
          const diasEntreEnvios: number = campanha.dias_entre_envios ?? 30;
          const mensagemTemplate: string = campanha.mensagem ?? "";
          const groupId: string = campanha.group_id;

          if (nomesProc.length === 0 || !mensagemTemplate.trim() || diasEntreEnvios <= 0) continue;

          // 2. Buscar todos os procedimentos que casem com os nomes da campanha
          const { data: procs, error: erroProcs } = await (supabase as any)
            .from("procedimentos")
            .select("nome_paciente, data_finalizacao, procedimento")
            .eq("clinica_id", clinicaId)
            .in("procedimento", nomesProc);

          if (erroProcs || !procs || procs.length === 0) continue;

          // 3. Para cada procedimento, verificar se HOJE é dia de envio
          const pacientesParaEnviar = new Map<
            string,
            { procedimento: string; dataFinalizacao: Date }
          >();

          for (const proc of procs) {
            const nome = (proc.nome_paciente ?? "").trim();
            if (!nome) continue;

            const dataFin = parseDateBR(proc.data_finalizacao);
            if (!dataFin) continue;

            // Calcular data de envio = data_finalizacao + dias_entre_envios
            const dataEnvio = new Date(dataFin.getFullYear(), dataFin.getMonth(), dataFin.getDate());
            dataEnvio.setDate(dataEnvio.getDate() + diasEntreEnvios);

            // Se a data de envio é HOJE → candidato para fila
            if (dataEnvio.getTime() === hojeNorm.getTime()) {
              // VERIFICAÇÃO: Existe outro procedimento mais recente deste mesmo paciente para esta campanha?
              const temMaisRecente = procs.some((other) => {
                if ((other.nome_paciente ?? "").trim().toLowerCase() !== nome.toLowerCase()) return false;
                if (!nomesProc.map(n => n.toLowerCase()).includes((other.procedimento ?? "").toLowerCase())) return false;
                 
                const otherDate = parseDateBR(other.data_finalizacao);
                if (!otherDate) return false;
                return otherDate.getTime() > dataFin.getTime();
              });

              if (temMaisRecente) {
                // Pula este procedimento pois o paciente já retornou mais recentemente para fazer um procedimento desta campanha!
                continue;
              }

              if (!pacientesParaEnviar.has(nome)) {
                pacientesParaEnviar.set(nome, {
                  procedimento: proc.procedimento,
                  dataFinalizacao: dataFin,
                });
              }
            }
          }

          if (pacientesParaEnviar.size === 0) continue;

          // 4. Buscar clientes correspondentes
          const nomesPacientes = Array.from(pacientesParaEnviar.keys());
          const { data: clientes, error: erroClientes } = await (supabase as any)
            .from("clientes")
            .select("id, paciente, telefone")
            .eq("clinica_id", clinicaId)
            .ilike("situacao", "Ativo")
            .in("paciente", nomesPacientes);

          if (erroClientes || !clientes || clientes.length === 0) continue;

          // 5. Para cada cliente elegível, verificar duplicatas e inserir
          for (const cliente of clientes) {
            const nomePaciente = (cliente.paciente ?? "").trim();
            const telefone = (cliente.telefone ?? "").trim();
            if (!telefone) continue;

            const dadosEnvio = pacientesParaEnviar.get(nomePaciente);
            if (!dadosEnvio) continue;

            // Verificar duplicata global de 30 dias por paciente_id ou telefone
            const dedupCutoff = new Date();
            dedupCutoff.setDate(dedupCutoff.getDate() - dedupDias);

            let jaExisteFila = false;
            const { count: dedupCount } = await (supabase as any)
              .from("fila_envios")
              .select("id", { count: "exact", head: true })
              .eq("clinica_id", clinicaId)
              .eq("paciente_id", cliente.id)
              .in("status", ["pendente", "enviado"])
              .gte("data_programada", dedupCutoff.toISOString());

            if ((dedupCount ?? 0) > 0) {
              jaExisteFila = true;
            }

            if (!jaExisteFila && telefone) {
              const { count: dedupPhoneCount } = await (supabase as any)
                .from("fila_envios")
                .select("id", { count: "exact", head: true })
                .eq("clinica_id", clinicaId)
                .eq("telefone", telefone)
                .in("status", ["pendente", "enviado"])
                .gte("data_programada", dedupCutoff.toISOString());

              if ((dedupPhoneCount ?? 0) > 0) {
                jaExisteFila = true;
              }
            }

            if (jaExisteFila) continue;

            // Verificar duplicata: já existe na fila hoje com mesma origem+paciente?
            let dupQuery = (supabase as any)
              .from("fila_envios")
              .select("id", { count: "exact", head: true })
              .eq("clinica_id", clinicaId)
              .eq("paciente_id", cliente.id)
              .eq("origem", "procedimento")
              .gte("data_programada", hojeInicio)
              .lte("data_programada", hojeFim);

            if (temCampanhaRef) {
              dupQuery = dupQuery.eq("campanha_ref", groupId);
            }

            const { count: duplicatas } = await dupQuery;
            if ((duplicatas ?? 0) > 0) continue;

            // Substituir variáveis na mensagem
            const primeiroNome = nomePaciente.split(" ")[0];
            const nomeFormatado =
              primeiroNome.charAt(0).toUpperCase() +
              primeiroNome.slice(1).toLowerCase();

            const mensagemFinal = substituirVariaveis(mensagemTemplate, {
              nome: nomeFormatado,
              procedimento: dadosEnvio.procedimento,
            });

            // Montar objeto de insert
            const insertObj: Record<string, any> = {
              paciente_id: cliente.id,
              paciente_nome: nomePaciente,
              telefone: telefone,
              mensagem: mensagemFinal,
              data_programada: new Date().toISOString(),
              status: "pendente",
              custo: 1,
              origem: "procedimento",
              clinica_id: clinicaId,
            };
            if (temCampanhaRef) {
              insertObj.campanha_ref = groupId;
            }

            const { error: erroInsert } = await (supabase as any)
              .from("fila_envios")
              .insert(insertObj);

            if (!erroInsert) {
              resultado.procedimentos++;
            } else {
              resultado.erros.push(`Insert erro (proc): ${erroInsert.message}`);
            }
          }
        } catch (err) {
          resultado.erros.push(`Erro na campanha ${campanha.group_id}: ${String(err)}`);
        }
      }
    }
  } catch (err) {
    resultado.erros.push(`Erro geral procedimentos: ${String(err)}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // ETAPA B: Campanhas de Aniversário (Dia)
  // ═══════════════════════════════════════════════════════════════
  try {
    const { data: configDia } = await (supabase as any)
      .from("campanhas_config")
      .select("mensagem, ativo")
      .eq("clinica_id", clinicaId)
      .eq("chave", "aniversario_dia")
      .maybeSingle();

    if (configDia?.ativo && configDia.mensagem) {
      const diaAtual = hoje.getDate();
      const mesAtual = hoje.getMonth() + 1;

      const { data: clientesAtivos } = await (supabase as any)
        .from("clientes")
        .select("id, paciente, telefone, nascimento")
        .eq("clinica_id", clinicaId)
        .ilike("situacao", "Ativo")
        .not("nascimento", "is", null)
        .not("telefone", "is", null);

      if (clientesAtivos && clientesAtivos.length > 0) {
        const aniversariantes = clientesAtivos.filter((c: any) => {
          if (!c.nascimento || !c.telefone) return false;
          const nasc = new Date(c.nascimento + "T00:00:00");
          return nasc.getDate() === diaAtual && nasc.getMonth() + 1 === mesAtual;
        });

        for (const cliente of aniversariantes) {
          // Verificar duplicata global de 30 dias por paciente_id ou telefone
          const dedupCutoff = new Date();
          dedupCutoff.setDate(dedupCutoff.getDate() - dedupDias);

          let jaExisteGlobal = false;
          const { count: dedupGlobal } = await (supabase as any)
            .from("fila_envios")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("paciente_id", cliente.id)
            .in("status", ["pendente", "enviado"])
            .gte("data_programada", dedupCutoff.toISOString());

          if ((dedupGlobal ?? 0) > 0) {
            jaExisteGlobal = true;
          }

          if (!jaExisteGlobal && cliente.telefone) {
            const { count: dedupGlobalPhone } = await (supabase as any)
              .from("fila_envios")
              .select("id", { count: "exact", head: true })
              .eq("clinica_id", clinicaId)
              .eq("telefone", cliente.telefone)
              .in("status", ["pendente", "enviado"])
              .gte("data_programada", dedupCutoff.toISOString());

            if ((dedupGlobalPhone ?? 0) > 0) {
              jaExisteGlobal = true;
            }
          }

          if (jaExisteGlobal) continue;

          // Verificar duplicata hoje
          const { count: dup } = await (supabase as any)
            .from("fila_envios")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("paciente_id", cliente.id)
            .eq("origem", "aniversario_dia")
            .gte("data_programada", hojeInicio)
            .lte("data_programada", hojeFim);

          if ((dup ?? 0) > 0) continue;

          const primeiroNome = (cliente.paciente ?? "").split(" ")[0];
          const nomeFormatado =
            primeiroNome.charAt(0).toUpperCase() +
            primeiroNome.slice(1).toLowerCase();

          const mensagemFinal = substituirVariaveis(configDia.mensagem, {
            nome: nomeFormatado,
          });

          const insertObj: Record<string, any> = {
            paciente_id: cliente.id,
            paciente_nome: cliente.paciente,
            telefone: cliente.telefone,
            mensagem: mensagemFinal,
            data_programada: new Date().toISOString(),
            status: "pendente",
            custo: 1,
            origem: "aniversario_dia",
            clinica_id: clinicaId,
          };
          if (temCampanhaRef) {
            insertObj.campanha_ref = "aniversario_dia";
          }

          const { error: erroInsert } = await (supabase as any)
            .from("fila_envios")
            .insert(insertObj);

          if (!erroInsert) {
            resultado.aniversarios++;
          }
        }
      }
    }
  } catch (err) {
    resultado.erros.push(`Erro aniversário dia: ${String(err)}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // ETAPA C: Campanhas de Aniversário (Mês)
  // ═══════════════════════════════════════════════════════════════
  try {
    const { data: configMes } = await (supabase as any)
      .from("campanhas_config")
      .select("mensagem, ativo")
      .eq("clinica_id", clinicaId)
      .eq("chave", "aniversario_mes")
      .maybeSingle();

    if (configMes?.ativo && configMes.mensagem) {
      const mesAtual = hoje.getMonth() + 1;
      const diaAtual = hoje.getDate();

      // Início e fim do mês
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

      const { data: clientesAtivos } = await (supabase as any)
        .from("clientes")
        .select("id, paciente, telefone, nascimento")
        .eq("clinica_id", clinicaId)
        .ilike("situacao", "Ativo")
        .not("nascimento", "is", null)
        .not("telefone", "is", null);

      if (clientesAtivos && clientesAtivos.length > 0) {
        const aniversariantesMes = clientesAtivos.filter((c: any) => {
          if (!c.nascimento || !c.telefone) return false;
          const nasc = new Date(c.nascimento + "T00:00:00");
          return nasc.getMonth() + 1 === mesAtual && nasc.getDate() !== diaAtual;
        });

        for (const cliente of aniversariantesMes) {
          // Verificar se já foi enviado neste mês (por paciente_id ou telefone)
          let jaExisteAnivMes = false;
          const { count: dup } = await (supabase as any)
            .from("fila_envios")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("paciente_id", cliente.id)
            .eq("origem", "aniversario_mes")
            .gte("data_programada", inicioMes)
            .lte("data_programada", fimMes);

          if ((dup ?? 0) > 0) {
            jaExisteAnivMes = true;
          }

          if (!jaExisteAnivMes && cliente.telefone) {
            const { count: dupPhone } = await (supabase as any)
              .from("fila_envios")
              .select("id", { count: "exact", head: true })
              .eq("clinica_id", clinicaId)
              .eq("telefone", cliente.telefone)
              .eq("origem", "aniversario_mes")
              .gte("data_programada", inicioMes)
              .lte("data_programada", fimMes);

            if ((dupPhone ?? 0) > 0) {
              jaExisteAnivMes = true;
            }
          }

          if (jaExisteAnivMes) continue;

          // Verificar duplicata global de 30 dias por paciente_id ou telefone
          const dedupCutoff = new Date();
          dedupCutoff.setDate(dedupCutoff.getDate() - dedupDias);

          let jaExisteGlobal = false;
          const { count: dedupGlobal } = await (supabase as any)
            .from("fila_envios")
            .select("id", { count: "exact", head: true })
            .eq("clinica_id", clinicaId)
            .eq("paciente_id", cliente.id)
            .in("status", ["pendente", "enviado"])
            .gte("data_programada", dedupCutoff.toISOString());

          if ((dedupGlobal ?? 0) > 0) {
            jaExisteGlobal = true;
          }

          if (!jaExisteGlobal && cliente.telefone) {
            const { count: dedupGlobalPhone } = await (supabase as any)
              .from("fila_envios")
              .select("id", { count: "exact", head: true })
              .eq("clinica_id", clinicaId)
              .eq("telefone", cliente.telefone)
              .in("status", ["pendente", "enviado"])
              .gte("data_programada", dedupCutoff.toISOString());

            if ((dedupGlobalPhone ?? 0) > 0) {
              jaExisteGlobal = true;
            }
          }

          if (jaExisteGlobal) continue;

          const primeiroNome = (cliente.paciente ?? "").split(" ")[0];
          const nomeFormatado =
            primeiroNome.charAt(0).toUpperCase() +
            primeiroNome.slice(1).toLowerCase();

          const mensagemFinal = substituirVariaveis(configMes.mensagem, {
            nome: nomeFormatado,
          });

          const insertObj: Record<string, any> = {
            paciente_id: cliente.id,
            paciente_nome: cliente.paciente,
            telefone: cliente.telefone,
            mensagem: mensagemFinal,
            data_programada: new Date().toISOString(),
            status: "pendente",
            custo: 1,
            origem: "aniversario_mes",
            clinica_id: clinicaId,
          };
          if (temCampanhaRef) {
            insertObj.campanha_ref = "aniversario_mes";
          }

          const { error: erroInsert } = await (supabase as any)
            .from("fila_envios")
            .insert(insertObj);

          if (!erroInsert) {
            resultado.aniversarios++;
          }
        }
      }
    }
  } catch (err) {
    resultado.erros.push(`Erro aniversário mês: ${String(err)}`);
  }

  resultado.total = resultado.procedimentos + resultado.aniversarios;
  return resultado;
}
