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
