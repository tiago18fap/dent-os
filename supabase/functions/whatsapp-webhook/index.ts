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

function checkOptOutRequest(text: string): boolean {
  const normalized = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove accents

  const optOutPatterns = [
    /\bsair\b/,
    /\bremover\b/,
    /\bexcluir\b/,
    /\bparar\b/,
    /\bcancelar\b/,
    /\blgpd\b/,
    /\bspam\b/,
    /\bperturbar\b/,
    /\bincomodar\b/,
    /nao (quero|desejo) (mais|receber)/,
    /nao me envie/,
    /nao mande mais/,
    /parar de receber/,
    /retirar (meu )?(numero|nome|cadastro|contato|lista)/,
    /remover (meu )?(numero|nome|cadastro|contato|lista)/,
    /excluir (meu )?(numero|nome|cadastro|contato|lista)/,
    /descadastrar/,
    /deixe de enviar/,
    /pare de enviar/
  ];

  return optOutPatterns.some(pattern => pattern.test(normalized));
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
        const isOptOut = checkOptOutRequest(clientMessageText);
        if (isOptOut) {
          console.log(`[Webhook] Opt-out detectado para o número: ${clientNumber}`);
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

              // 3. Registrar na tabela de solicitações de opt-out
              await supabase
                .from("solicitacoes_optout")
                .insert({
                  clinica_id: config.clinica_id,
                  cliente_id: cliente.id,
                  paciente_nome: cliente.paciente,
                  telefone: cliente.telefone || clientNumber,
                  mensagem_recebida: clientMessageText
                });

              // 4. Registrar auditoria
              await supabase
                .from("auditoria_logs")
                .insert({
                  clinica_id: config.clinica_id,
                  usuario_email: "Sistema - WhatsApp Webhook",
                  acao: "paciente_optout_automatico",
                  descricao: `Paciente '${cliente.paciente}' (+${clientNumber}) solicitou saída da lista. Status alterado para Desabilitado. Mensagem recebida: "${clientMessageText}"`
                });

              // 5. Notificar o telefone de atendimento com o nome do paciente cadastrado
              const optoutNotifyText = `🚫 *[DentOS] Paciente Desabilitado (Opt-Out)!*\n\nO paciente *${cliente.paciente}* (+${clientNumber}) pediu para não receber mais mensagens.\n\n*Mensagem enviada:* "${clientMessageText}"\n\n_O status do paciente foi atualizado para *Desabilitado* e os envios agendados foram cancelados._`;
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
                mensagem_recebida: clientMessageText
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
