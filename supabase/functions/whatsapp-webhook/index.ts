import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = "https://evolution-evolution-api.qfjowr.easypanel.host";
const EVOLUTION_API_KEY = "429683C4C977415CAAFCCE10F7D57E11";

/**
 * Algoritmo profissional de detecção de Opt-Out.
 * Usa sistema de pontuação para evitar falsos positivos.
 * Retorna { isOptOut: boolean, confianca: 'alta' | 'media' | 'baixa' | 'none' }
 */
function analyzeOptOutIntent(text: string): { isOptOut: boolean; confianca: 'alta' | 'media' | 'baixa' | 'none' } {
  const normalized = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/g, " ")        // Remove punctuation
    .replace(/\s+/g, " ")            // Normalize spaces
    .trim();

  // Mensagens muito curtas (1-2 palavras) com palavras genéricas = ignorar
  const wordCount = normalized.split(" ").length;

  let score = 0;

  // ═══ NÍVEL 1: Sinais FORTES (alta confiança) — frases que SÓ fazem sentido como opt-out ═══
  const strongPatterns = [
    /nao (quero|desejo) (mais )?receber (mais )?(msg|mensagem|mensagens)/,
    /pare[m]? de (me )?enviar/,
    /deixe[m]? de (me )?enviar/,
    /nao (me )?mande[m]? mais (msg|mensagem|mensagens)/,
    /nao (me )?envie[m]? mais/,
    /me tire[m]? (da|dessa) lista/,
    /me remova[m]? (da|dessa) lista/,
    /me retire[m]? (da|dessa) lista/,
    /me exclua[m]? (da|dessa) lista/,
    /tirar (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /remover (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /retirar (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /excluir (meu )?(numero|telefone|contato) (da|dessa) lista/,
    /nao quero mais (essa[s]? )?mensagen[s]?/,
    /parar de receber (essa[s]? )?(msg|mensagem|mensagens)/,
    /\bdescadastrar\b/,
    /\bdescadastramento\b/,
    /parem com (isso|essas mensagens)/,
    /nao autorizo o envio/,
    /retir(ar|e[m]?) meu (cadastro|contato|numero)/,
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(normalized)) {
      score += 10;
      break; // Um forte já basta
    }
  }

  // ═══ NÍVEL 2: Sinais DEFINITIVOS (palavras que sozinhas indicam opt-out) ═══
  const definitiveWords = [
    /\blgpd\b/,
    /\bspam\b/,
  ];

  for (const pattern of definitiveWords) {
    if (pattern.test(normalized)) {
      score += 10;
    }
  }

  // ═══ NÍVEL 3: Sinais MÉDIOS (precisam de contexto) ═══
  const mediumPatterns = [
    { pattern: /\bsair\b/, contextRequired: /(lista|grupo|mensagen|envio|cadastro)/ },
    { pattern: /\bremover\b/, contextRequired: /(numero|telefone|contato|cadastro|lista)/ },
    { pattern: /\bexcluir\b/, contextRequired: /(numero|telefone|contato|cadastro|lista)/ },
    { pattern: /\bparar\b/, contextRequired: /(mensagen|envio|receber|enviar|mandar)/ },
    { pattern: /\bcancelar\b/, contextRequired: /(mensagen|envio|cadastro|lista)/ },
    { pattern: /\bperturbar\b/, contextRequired: null }, // Sempre conta como opt-out
    { pattern: /\bincomodar\b/, contextRequired: null },
    { pattern: /\bbloquear\b/, contextRequired: /(numero|mensagen|envio)/ },
  ];

  for (const { pattern, contextRequired } of mediumPatterns) {
    if (pattern.test(normalized)) {
      if (contextRequired === null || contextRequired.test(normalized)) {
        score += 5;
      }
    }
  }

  // ═══ NÍVEL 4: Sinais FRACOS (pouco peso, ajudam no contexto) ═══
  const weakSignals = [
    /para(r|m)? (com )?(isso|essas)/,
    /nao (preciso|quero|desejo) (disso|mais)/,
    /chega (disso|dessas)/,
  ];

  for (const pattern of weakSignals) {
    if (pattern.test(normalized)) {
      score += 2;
    }
  }

  // ═══ ANTI-PADRÕES: Indicam que NÃO é opt-out (reduzem score) ═══
  const antiPatterns = [
    /\bconsulta\b/,
    /\bagendamento\b/,
    /\bagenda(r)?\b/,
    /\bhorario\b/,
    /\batendimento\b/,
    /\btratamento\b/,
    /\bdente\b/,
    /\bimplante\b/,
    /\bortodont/,
    /\blimpeza\b/,
    /\bextracao\b/,
    /\braio.?x\b/,
    /\bcanal\b/,
    /\bprotese\b/,
    /\bque horas\b/,
    /\bmarcar\b/,
    /\bdesmarcar\b/,
    /\bremarcar\b/,
    /\bconfirm(ar|o|a)\b/,
    /\bpresente\b/,
    /\baniversario\b/,
    /\bobrigad[oa]\b/,
    /\bvaleu\b/,
    /\bvou (ai|la|ir)\b/,
    /\bchegar\b/,
    /\batrasad[oa]\b/,
  ];

  for (const pattern of antiPatterns) {
    if (pattern.test(normalized)) {
      score -= 8;
    }
  }

  // ═══ Regra especial: mensagem muito curta com palavra genérica ═══
  // "sair", "parar", "cancelar" sozinhas (1-2 palavras) SÃO ambíguas
  if (wordCount <= 2 && score > 0 && score < 10) {
    const ambiguousSingleWords = ["sair", "parar", "cancelar", "remover", "excluir"];
    if (ambiguousSingleWords.includes(normalized.trim())) {
      // Palavra ambígua sozinha — não é certeza de opt-out
      score = 3; // Confiança baixa
    }
  }

  // ═══ Determinar confiança ═══
  if (score >= 10) return { isOptOut: true, confianca: "alta" };
  if (score >= 5) return { isOptOut: true, confianca: "media" };
  if (score >= 3) return { isOptOut: false, confianca: "baixa" }; // Registra mas NÃO desabilita
  return { isOptOut: false, confianca: "none" };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => null);
    
    if (!payload) {
      return new Response("Empty payload", { status: 400 });
    }

    const { event, instance, data } = payload;

    // Verificar se o evento é de nova mensagem e se não foi enviada por nós
    const isMessageUpsert = event === "messages.upsert" || event === "MESSAGES_UPSERT";
    
    if (!isMessageUpsert || !instance || !data) {
      return new Response("Ignored event type or missing parameters", { status: 200 });
    }

    // O Evolution API envia dados em array ou objeto. Vamos normalizar para objeto.
    const messageData = Array.isArray(data) ? data[0] : data;
    
    if (!messageData) {
      return new Response("No message data", { status: 200 });
    }

    const key = messageData.key;
    const fromMe = key?.fromMe ?? false;
    const remoteJid = key?.remoteJid ?? "";

    // Ignorar se a mensagem foi enviada por nós mesmos ou se for um grupo (JID de grupo termina em @g.us)
    if (fromMe || !remoteJid.endsWith("@s.whatsapp.net")) {
      return new Response("Ignored message (sent by self or group)", { status: 200 });
    }

    // Extrair o shortId do nome da instância (dentos_{clinicaId_short})
    const prefix = "dentos_";
    if (!instance.startsWith(prefix)) {
      return new Response("Invalid instance name prefix", { status: 200 });
    }
    const shortId = instance.slice(prefix.length);

    // Executar processamento em background para responder imediatamente o webhook da Evolution API
    // Desta forma, evitamos timeouts e retentativas desnecessárias.
    (async () => {
      try {
        console.log(`[Webhook] Processando mensagem recebida da instância: ${instance}`);
        
        // 1. Buscar todas as configurações de WhatsApp ativas
        const { data: configs, error: configError } = await supabase
          .from("whatsapp_config")
          .select("clinica_id, redirecionar_ativo, redirecionar_numero, redirecionar_mensagem")
          .eq("conectado", true);

        if (configError || !configs) {
          console.error("[Webhook] Erro ao buscar whatsapp_config:", configError);
          return;
        }

        // 2. Encontrar a clínica correspondente
        const config = configs.find(
          (c) => c.clinica_id.replace(/-/g, "").slice(0, 12) === shortId
        );

        if (!config) {
          console.log(`[Webhook] Nenhuma configuração ativa encontrada para shortId: ${shortId}`);
          return;
        }

        // 3. Se o redirecionamento automático não estiver ativo, encerrar
        if (!config.redirecionar_ativo || !config.redirecionar_numero) {
          console.log("[Webhook] Redirecionamento inativo ou sem número configurado.");
          return;
        }

        const clientNumber = remoteJid.split("@")[0];
        const cleanRedirectNumber = config.redirecionar_numero.replace(/\D/g, "");
        
        // 4. Extrair o texto da mensagem enviada pelo cliente
        let clientMessageText = "[Mídia ou mensagem sem texto]";
        const msg = messageData.message;
        if (msg) {
          if (msg.conversation) {
            clientMessageText = msg.conversation;
          } else if (msg.extendedTextMessage?.text) {
            clientMessageText = msg.extendedTextMessage.text;
          } else if (msg.audioMessage) {
            clientMessageText = "[Áudio enviado pelo paciente]";
          } else if (msg.imageMessage) {
            clientMessageText = "[Imagem enviada pelo paciente]";
          } else if (msg.videoMessage) {
            clientMessageText = "[Vídeo enviado pelo paciente]";
          } else if (msg.documentMessage) {
            clientMessageText = "[Documento enviado pelo paciente]";
          }
        }

        // --- Registrar Leitura e Resposta no fila_envios ---
        try {
          // Busca o último envio nos últimos 30 dias para este JID e clínica
          const searchDigits = clientNumber.slice(-8); // últimos 8 dígitos
          const { data: ultimosEnvios, error: fetchErr } = await supabase
            .from("fila_envios")
            .select("id, status, telefone")
            .eq("clinica_id", config.clinica_id)
            .eq("status", "enviado")
            .order("data_programada", { ascending: false })
            .limit(10);

          if (!fetchErr && ultimosEnvios && ultimosEnvios.length > 0) {
            const match = ultimosEnvios.find(u => {
              const uClean = (u.telefone || "").replace(/\D/g, "");
              return uClean.endsWith(searchDigits);
            });

            if (match) {
              console.log(`[Webhook] Marcando envio ${match.id} como LIDO e RESPONDIDO.`);
              await supabase
                .from("fila_envios")
                .update({
                  lida: true,
                  respondida: true,
                  data_leitura: new Date().toISOString(),
                  data_resposta: new Date().toISOString(),
                  mensagem_resposta: clientMessageText
                })
                .eq("id", match.id);
            }
          }
        } catch (err) {
          console.error("[Webhook] Falha ao registrar leitura/resposta da fila:", err);
        }

        // --- Algoritmo de Detecção de Opt-Out (Saída da Lista / LGPD) ---
        const optOutAnalysis = analyzeOptOutIntent(clientMessageText);
        
        // Confiança BAIXA: apenas registrar para revisão, NÃO desabilitar
        if (optOutAnalysis.confianca === "baixa") {
          console.log(`[Webhook] Possível opt-out (confiança BAIXA) de ${clientNumber}: "${clientMessageText}"`);
          const pushName = messageData.pushName || "Paciente Desconhecido";
          await supabase
            .from("solicitacoes_optout")
            .insert({
              clinica_id: config.clinica_id,
              cliente_id: null,
              paciente_nome: pushName,
              telefone: clientNumber,
              mensagem_recebida: clientMessageText,
              confianca: "baixa",
              status: "ativo",
            });
          // NÃO desabilita, NÃO envia confirmação — só registra para revisão manual
        }

        // Confiança ALTA ou MÉDIA: prosseguir com opt-out automático
        if (optOutAnalysis.isOptOut && (optOutAnalysis.confianca === "alta" || optOutAnalysis.confianca === "media")) {
          console.log(`[Webhook] Opt-out detectado (confiança: ${optOutAnalysis.confianca}) para: ${clientNumber}`);
          const pushName = messageData.pushName || "Paciente Desconhecido";

          // Buscar paciente pelo telefone e clinica_id usando RPC
          const { data: clientesEncontrados, error: searchError } = await supabase.rpc(
            "find_cliente_by_telefone",
            { target_clinica_id: config.clinica_id, search_telefone: clientNumber }
          );

          if (searchError) {
            console.error("[Webhook] Erro ao buscar paciente por telefone:", searchError);
          }

          if (clientesEncontrados && clientesEncontrados.length > 0) {
            for (const cliente of clientesEncontrados) {
              console.log(`[Webhook] Desabilitando paciente: ${cliente.paciente} (ID: ${cliente.id})`);
              
              // 1. Atualizar status para "Desabilitado"
              const { error: updateError } = await supabase
                .from("clientes")
                .update({ situacao: "Desabilitado" })
                .eq("id", cliente.id);

              if (updateError) {
                console.error(`[Webhook] Erro ao desabilitar paciente ${cliente.id}:`, updateError);
              }

              // 2. Deletar mensagens agendadas e pendentes na fila de envios
              const { error: deleteError } = await supabase
                .from("fila_envios")
                .delete()
                .eq("clinica_id", config.clinica_id)
                .eq("paciente_id", cliente.id)
                .eq("status", "pendente");

              if (deleteError) {
                console.error(`[Webhook] Erro ao limpar fila pendente para o paciente ${cliente.id}:`, deleteError);
              }

              // 3. Registrar na tabela de solicitações de opt-out COM confiança
              await supabase
                .from("solicitacoes_optout")
                .insert({
                  clinica_id: config.clinica_id,
                  cliente_id: cliente.id,
                  paciente_nome: cliente.paciente,
                  telefone: cliente.telefone || clientNumber,
                  mensagem_recebida: clientMessageText,
                  confianca: optOutAnalysis.confianca,
                  status: "ativo",
                });

              // 4. Registrar auditoria
              await supabase
                .from("auditoria_logs")
                .insert({
                  clinica_id: config.clinica_id,
                  usuario_email: "Sistema - WhatsApp Webhook",
                  acao: "paciente_optout_automatico",
                  descricao: `Paciente '${cliente.paciente}' (+${clientNumber}) solicitou saída da lista (confiança: ${optOutAnalysis.confianca}). Status alterado para Desabilitado. Mensagem recebida: "${clientMessageText}"`
                });

              // 5. Notificar o telefone de atendimento com o nome do paciente cadastrado
              const confiancaEmoji = optOutAnalysis.confianca === "alta" ? "🔴" : "🟡";
              const optoutNotifyText = `🚫 *[DentOS] Paciente Desabilitado (Opt-Out)!*\n\n${confiancaEmoji} Confiança: *${optOutAnalysis.confianca.toUpperCase()}*\n\nO paciente *${cliente.paciente}* (+${clientNumber}) pediu para não receber mais mensagens.\n\n*Mensagem enviada:* "${clientMessageText}"\n\n_O status do paciente foi atualizado para *Desabilitado* e os envios agendados foram cancelados._`;
              await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: EVOLUTION_API_KEY,
                },
                body: JSON.stringify({
                  number: cleanRedirectNumber,
                  text: optoutNotifyText,
                  options: {
                    delay: 1200,
                    presence: "composing",
                  },
                }),
              });
            }
          } else {
            console.log(`[Webhook] Paciente não cadastrado solicitou opt-out. Registrando.`);
            await supabase
              .from("solicitacoes_optout")
              .insert({
                clinica_id: config.clinica_id,
                cliente_id: null,
                paciente_nome: pushName,
                telefone: clientNumber,
                mensagem_recebida: clientMessageText,
                confianca: optOutAnalysis.confianca,
                status: "ativo",
              });

            // Notificar o telefone de atendimento com o pushName
            const optoutNotifyText = `🚫 *[DentOS] Solicitante Desabilitado (Não Cadastrado)!*\n\nO número +${clientNumber} (*${pushName}*) pediu para não receber mais mensagens.\n\n*Mensagem enviada:* "${clientMessageText}"\n\n_Como o número não foi encontrado no cadastro da clínica, o log de opt-out foi registrado para revisão manual._`;
            await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
              },
              body: JSON.stringify({
                number: cleanRedirectNumber,
                text: optoutNotifyText,
                options: {
                  delay: 1200,
                  presence: "composing",
                },
              }),
            });
          }

          // Enviar resposta personalizada de confirmação ao paciente
          const confirmText = "Entendido. Nós removemos seu contato da nossa lista de envios automáticos e você não receberá novas mensagens. Desculpe-nos pelo incômodo! 👍";
          console.log(`[Webhook] Enviando confirmação de exclusão para ${clientNumber}...`);
          await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({
              number: clientNumber,
              text: confirmText,
              options: {
                delay: 1200,
                presence: "composing",
              },
            }),
          });

          return; // Finaliza processamento deste webhook
        }


        // 5. Aguardar delay de 7 a 15 segundos (simular tempo de digitação humana)
        const delayMs = Math.floor(Math.random() * 8000) + 7000;
        console.log(`[Webhook] Aguardando ${delayMs}ms antes de responder...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // 6. Enviar resposta automática ao cliente
        const responseText = config.redirecionar_mensagem || 
          "Olá! Este número é utilizado apenas para envios automáticos e não recebe mensagens ou ligações. 🤖\n\nPara falar com o nosso atendimento, por favor clique no link abaixo:\n{numero_atendimento}";
        
        const cleanRedirectNumber = config.redirecionar_numero.replace(/\D/g, "");
        const finalResponseText = responseText.replace(
          /{numero_atendimento}/g,
          `https://wa.me/${cleanRedirectNumber}`
        );

        console.log(`[Webhook] Enviando resposta automática para ${clientNumber}...`);
        const sendResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: clientNumber,
            text: finalResponseText,
            options: {
              delay: 1200,
              presence: "composing",
            },
          }),
        });

        if (!sendResponse.ok) {
          console.error(`[Webhook] Erro ao responder cliente: ${sendResponse.status}`);
        }

        // 7. Notificar o telefone de atendimento (triangulação)
        const notificationText = `🔔 *[DentOS] Novo contato recebido!*\n\n*Paciente:* +${clientNumber}\n*Mensagem:* _${clientMessageText}_\n\n_(Este paciente já recebeu a mensagem automática de redirecionamento para o seu atendimento)_`;
        
        console.log(`[Webhook] Notificando atendimento em ${cleanRedirectNumber}...`);
        const sendNotification = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: cleanRedirectNumber,
            text: notificationText,
            options: {
              delay: 1200,
              presence: "composing",
            },
          }),
        });

        if (!sendNotification.ok) {
          console.error(`[Webhook] Erro ao notificar atendimento: ${sendNotification.status}`);
        }

        // 8. Se for áudio, encaminhar o arquivo de áudio para o atendimento
        const hasAudio = !!msg?.audioMessage;
        if (hasAudio && messageData.key?.id) {
          console.log(`[Webhook] Mensagem é um áudio. Baixando mídia para encaminhar...`);
          try {
            const downloadRes = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
              },
              body: JSON.stringify({
                message: {
                  key: {
                    id: messageData.key.id
                  }
                },
                convertToMp4: false
              })
            });

            if (downloadRes.ok) {
              const mediaData = await downloadRes.json();
              if (mediaData && mediaData.base64) {
                console.log(`[Webhook] Mídia baixada com sucesso. Encaminhando áudio para ${cleanRedirectNumber}...`);
                
                const sendMediaRes = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instance}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: EVOLUTION_API_KEY,
                  },
                  body: JSON.stringify({
                    number: cleanRedirectNumber,
                    mediatype: "audio",
                    mimetype: mediaData.mimetype || "audio/ogg",
                    caption: `Áudio original de +${clientNumber}`,
                    media: mediaData.base64,
                    fileName: mediaData.fileName || "audio.ogg"
                  })
                });

                if (!sendMediaRes.ok) {
                  console.error(`[Webhook] Erro ao encaminhar áudio: ${sendMediaRes.status}`);
                } else {
                  console.log(`[Webhook] Áudio encaminhado com sucesso!`);
                }
              } else {
                console.error(`[Webhook] Resposta de download inválida ou sem base64.`);
              }
            } else {
              console.error(`[Webhook] Falha ao baixar áudio da Evolution API: ${downloadRes.status}`);
            }
          } catch (downloadErr) {
            console.error(`[Webhook] Exceção ao baixar/encaminhar áudio:`, downloadErr);
          }
        }

      } catch (err) {
        console.error("[Webhook Background Process] Erro:", err);
      }
    })();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Webhook Error] Erro inesperado:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
