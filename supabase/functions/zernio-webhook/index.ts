// Webhook da Zernio (WhatsApp oficial da Meta). Configure na Zernio:
//   URL:     https://dentos.com.br/functions/v1/zernio-webhook
//   Segredo: o mesmo valor de ZERNIO_WEBHOOK_SECRET do servico api
//   Eventos: message.received, message.delivered, message.read, message.failed,
//            whatsapp.template.status_updated, account.disconnected
//
// Trata:
//   - resposta do paciente -> marca o envio como lido/respondido + regra de opt-out (LGPD)
//   - entregue/lido/falhou -> atualiza fila_envios pelo id da mensagem na Meta
//   - modelo aprovado/reprovado -> atualiza whatsapp_modelos
//   - conta desconectada -> marca a clinica como desconectada
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { analyzeOptOutIntent } from "../_shared/optout.ts";
import { enviarTexto } from "../_shared/zernio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = (Deno.env.get("ZERNIO_WEBHOOK_SECRET") || "").trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CONFIRMACAO_OPTOUT =
  "Entendido. Nós removemos seu contato da nossa lista de envios automáticos e você não receberá novas mensagens. Desculpe-nos pelo incômodo! 👍";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function assinaturaValida(corpo: string, assinatura: string | null): boolean {
  if (!WEBHOOK_SECRET || !assinatura) return false;
  const esperado = createHmac("sha256", WEBHOOK_SECRET).update(corpo, "utf8").digest("hex");
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(assinatura.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Clinica dona da conta da Zernio que recebeu o evento. */
async function clinicaDaConta(accountId: string | null | undefined) {
  if (!accountId) return null;
  const { data } = await supabase
    .from("whatsapp_config")
    .select("clinica_id, provider")
    .eq("zernio_account_id", accountId)
    .maybeSingle();
  return data?.clinica_id ? data : null;
}

/** Ultimo envio para este telefone (compara os 8 ultimos digitos, como o webhook da Evolution). */
async function ultimoEnvio(clinicaId: string, telefone: string) {
  const ultimos8 = telefone.replace(/\D/g, "").slice(-8);
  if (ultimos8.length < 8) return null;
  const { data } = await supabase
    .from("fila_envios")
    .select("id, telefone")
    .eq("clinica_id", clinicaId)
    .eq("status", "enviado")
    .order("data_programada", { ascending: false })
    .limit(20);
  return (data ?? []).find((u) => (u.telefone || "").replace(/\D/g, "").endsWith(ultimos8)) ?? null;
}

async function tratarMensagemRecebida(evento: any) {
  const m = evento?.message ?? {};
  if ((m.direction || "incoming") !== "incoming") return "ignorado: nao e mensagem recebida";
  const conta = await clinicaDaConta(evento?.account?.accountId);
  if (!conta) return "ignorado: conta da Zernio nao ligada a nenhuma clinica";
  const clinicaId = conta.clinica_id;

  const telefone = String(m.sender?.phoneNumber || m.sender?.id || "").replace(/\D/g, "");
  const nomeContato = m.sender?.name || "Paciente Desconhecido";
  const texto: string =
    (m.text && String(m.text)) ||
    (Array.isArray(m.attachments) && m.attachments.length ? "[Mídia enviada pelo paciente]" : "[Mensagem sem texto]");

  // 1. Registrar leitura/resposta no ultimo envio para este telefone
  const envio = telefone ? await ultimoEnvio(clinicaId, telefone) : null;
  if (envio) {
    const agora = new Date().toISOString();
    await supabase
      .from("fila_envios")
      .update({ lida: true, respondida: true, data_leitura: agora, data_resposta: agora, mensagem_resposta: texto })
      .eq("id", envio.id);
  }

  // 2. Opt-out (mesma regra do webhook da Evolution)
  const analise = analyzeOptOutIntent(texto);

  if (analise.confianca === "baixa") {
    await supabase.from("solicitacoes_optout").insert({
      clinica_id: clinicaId,
      cliente_id: null,
      paciente_nome: nomeContato,
      telefone,
      mensagem_recebida: texto,
      confianca: "baixa",
      status: "ativo",
    });
    return "resposta registrada (possivel opt-out, confianca baixa)";
  }

  if (!(analise.isOptOut && (analise.confianca === "alta" || analise.confianca === "media"))) {
    return envio ? "resposta registrada" : "mensagem recebida (sem envio recente)";
  }

  const { data: encontrados } = await supabase.rpc("find_cliente_by_telefone", {
    target_clinica_id: clinicaId,
    search_telefone: telefone,
  });

  if (encontrados && encontrados.length > 0) {
    for (const cliente of encontrados) {
      await supabase.from("clientes").update({ situacao: "Desabilitado" }).eq("id", cliente.id);
      await supabase
        .from("fila_envios")
        .delete()
        .eq("clinica_id", clinicaId)
        .eq("paciente_id", cliente.id)
        .eq("status", "pendente");
      await supabase.from("solicitacoes_optout").insert({
        clinica_id: clinicaId,
        cliente_id: cliente.id,
        paciente_nome: cliente.paciente,
        telefone: cliente.telefone || telefone,
        mensagem_recebida: texto,
        confianca: analise.confianca,
        status: "ativo",
      });
      await supabase.from("auditoria_logs").insert({
        clinica_id: clinicaId,
        usuario_email: "Sistema - WhatsApp (Zernio)",
        acao: "paciente_optout_automatico",
        descricao: `Paciente '${cliente.paciente}' (+${telefone}) solicitou saída da lista (confiança: ${analise.confianca}). Status alterado para Desabilitado. Mensagem recebida: "${texto}"`,
      });
    }
  } else {
    await supabase.from("solicitacoes_optout").insert({
      clinica_id: clinicaId,
      cliente_id: null,
      paciente_nome: nomeContato,
      telefone,
      mensagem_recebida: texto,
      confianca: analise.confianca,
      status: "ativo",
    });
  }

  // Confirmacao ao paciente: ele acabou de escrever, entao a janela de 24 h esta aberta.
  if (m.conversationId && evento?.account?.accountId) {
    try {
      await enviarTexto({ accountId: evento.account.accountId, conversationId: m.conversationId, texto: CONFIRMACAO_OPTOUT });
    } catch (err) {
      console.error("[zernio-webhook] Falha ao enviar confirmacao de opt-out:", err);
    }
  }
  return `opt-out aplicado (confianca ${analise.confianca})`;
}

async function tratarStatusMensagem(evento: any, tipo: string) {
  const m = evento?.message ?? {};
  const wamid = m.platformMessageId || m.messageId || m.id;
  if (!wamid) return "ignorado: sem id da mensagem";
  const agora = new Date().toISOString();
  let mudanca: Record<string, unknown> = {};
  if (tipo === "message.read") mudanca = { lida: true, data_leitura: agora };
  else if (tipo === "message.failed") {
    const erro = evento?.error || m.error || {};
    mudanca = {
      status: "falha",
      erro_detalhe: `Meta${erro.code ? ` [${erro.code}]` : ""}: ${erro.message || erro.title || "mensagem não entregue"}`.slice(0, 1000),
      updated_at: agora,
    };
  } else return "entregue (nada a gravar)";

  const { data } = await supabase.from("fila_envios").update(mudanca).eq("provider_message_id", wamid).select("id");
  return data?.length ? `${tipo} aplicado em ${data.length} envio(s)` : "ignorado: envio nao encontrado";
}

async function tratarStatusModelo(evento: any) {
  const t = evento?.template ?? {};
  const conta = await clinicaDaConta(evento?.account?.accountId);
  if (!conta || !t.name) return "ignorado: modelo ou clinica nao encontrados";
  const idioma = String(t.language || "pt_BR");
  const { data } = await supabase
    .from("whatsapp_modelos")
    .update({
      status: String(t.status || "").toUpperCase() || "PENDING",
      motivo: t.reason && t.reason !== "NONE" ? String(t.reason) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("clinica_id", conta.clinica_id)
    .eq("nome_modelo", t.name)
    .eq("idioma", idioma)
    .select("id");
  return data?.length ? `modelo ${t.name} -> ${t.status}` : "ignorado: modelo nao cadastrado no DentOS";
}

async function tratarDesconexao(evento: any) {
  const conta = await clinicaDaConta(evento?.account?.accountId);
  if (!conta) return "ignorado: conta nao ligada a clinica";
  await supabase
    .from("whatsapp_config")
    .update({ conectado: false, updated_at: new Date().toISOString() })
    .eq("clinica_id", conta.clinica_id);
  await supabase.from("auditoria_logs").insert({
    clinica_id: conta.clinica_id,
    usuario_email: "Sistema - WhatsApp (Zernio)",
    acao: "desconectar_whatsapp",
    descricao: `WhatsApp oficial desconectado: ${evento?.account?.reason || evento?.account?.disconnectionType || "motivo não informado"}`,
  });
  return "clinica marcada como desconectada";
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  if (!WEBHOOK_SECRET) return json(503, { error: "ZERNIO_WEBHOOK_SECRET nao configurado no servidor" });

  const corpo = await req.text();
  if (!assinaturaValida(corpo, req.headers.get("x-zernio-signature") || req.headers.get("x-late-signature"))) {
    return json(401, { error: "Assinatura invalida" });
  }

  let evento: any;
  try {
    evento = JSON.parse(corpo);
  } catch {
    return json(400, { error: "JSON invalido" });
  }
  const tipo: string = evento?.event || req.headers.get("x-zernio-event") || "";
  const idEvento: string = evento?.id || req.headers.get("x-zernio-event-id") || "";
  if (evento?.test) return json(200, { ok: true, teste: true });

  // A Zernio pode reenviar o mesmo evento: processa cada id uma vez.
  if (idEvento) {
    const { error: dup } = await supabase.from("zernio_webhook_eventos").insert({ id: idEvento, evento: tipo });
    if (dup) {
      if (String(dup.code) === "23505") return json(200, { ok: true, duplicado: true });
      console.error("[zernio-webhook] Falha ao registrar evento:", dup);
    }
  }

  try {
    let resultado: string;
    switch (tipo) {
      case "message.received":
        resultado = await tratarMensagemRecebida(evento);
        break;
      case "message.delivered":
      case "message.read":
      case "message.failed":
        resultado = await tratarStatusMensagem(evento, tipo);
        break;
      case "whatsapp.template.status_updated":
        resultado = await tratarStatusModelo(evento);
        break;
      case "account.disconnected":
        resultado = await tratarDesconexao(evento);
        break;
      default:
        resultado = `ignorado: evento ${tipo || "sem nome"}`;
    }
    console.log(`[zernio-webhook] ${tipo}: ${resultado}`);
    return json(200, { ok: true, resultado });
  } catch (err: any) {
    // Libera o id para a Zernio tentar de novo.
    if (idEvento) await supabase.from("zernio_webhook_eventos").delete().eq("id", idEvento);
    console.error(`[zernio-webhook] Erro em ${tipo}:`, err);
    return json(500, { error: "Erro ao processar evento" });
  }
});
