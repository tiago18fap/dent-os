// Ponte entre o DentOS e a Evolution API (WhatsApp).
//
// Antes o navegador falava direto com a Evolution usando a chave GLOBAL, que ficava
// visivel no codigo do site. Agora o navegador chama esta funcao (com o login do
// usuario) e so ela conhece a chave, lida das variaveis EVOLUTION_API_URL e
// EVOLUTION_API_KEY do servico `api`.
//
// Corpo da requisicao: { acao, clinica_id, ...parametros }
// Acoes: criar, conectar, estado, info, desconectar, enviar_teste, webhook,
//        reiniciar, verificar_reconectar, codigo_pareamento.
//
// Regra de acesso: o usuario precisa ser da clinica (perfis.clinica_id) ou super admin
// (mesma regra do banco: public.is_caller_super_admin()).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function evolutionUrl(): string {
  return (Deno.env.get("EVOLUTION_API_URL") || "").trim().replace(/\/$/, "");
}

function evolutionKey(): string {
  return (Deno.env.get("EVOLUTION_API_KEY") || "").trim();
}

/** Endereco publico do webhook que a Evolution chama ao receber mensagens. */
function webhookUrl(): string {
  const base = (Deno.env.get("PUBLIC_URL") || "").trim().replace(/\/$/, "");
  return `${base}/functions/v1/whatsapp-webhook`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mesmo nome de instancia usado desde o inicio (o processar-fila usa o mesmo). */
function getInstanceName(clinicaId: string): string {
  return `dentos_${clinicaId.replace(/-/g, "").slice(0, 12)}`;
}

/** Chamada a Evolution. Devolve status e corpo ja convertido (ou null). */
async function evo(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${evolutionUrl()}${path}`, {
    method: init.method || "GET",
    headers: { "Content-Type": "application/json", apikey: evolutionKey() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function evoError(data: any, status: number): string {
  const msg = data?.response?.message ?? data?.message ?? data?.error;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg) return msg;
  return `Erro HTTP ${status}`;
}

// ---------------------------------------------------------------------------
// Operacoes (mesma logica que antes ficava em src/services/evolutionApi.ts)
// ---------------------------------------------------------------------------

async function connectInstance(instance: string) {
  const { data } = await evo(`/instance/connect/${instance}`);
  // O QR code pode estar em campos diferentes dependendo da versao
  const base64 = data?.base64 ?? data?.qrcode?.base64 ?? data?.code ?? null;
  return { qrcode: base64, instance };
}

async function createInstance(instance: string) {
  const created = await evo(`/instance/create`, {
    method: "POST",
    body: { instanceName: instance, qrcode: true, integration: "WHATSAPP-BAILEYS" },
  });
  if (created.ok && created.data?.qrcode?.base64) {
    return { qrcode: created.data.qrcode.base64, instance };
  }
  // Ja existe (ou nao veio QR): tenta conectar para obter um QR novo
  return await connectInstance(instance);
}

async function getConnectionState(instance: string) {
  try {
    const { ok, data } = await evo(`/instance/connectionState/${instance}`);
    if (!ok) return { state: "close", instance };
    const state = String(data?.instance?.state ?? data?.state ?? "close").toLowerCase();
    return { state, instance };
  } catch {
    return { state: "close", instance };
  }
}

async function disconnectAndDelete(instance: string) {
  try {
    await evo(`/instance/logout/${instance}`, { method: "DELETE" });
  } catch {
    // pode ja estar desconectado
  }
  try {
    await evo(`/instance/delete/${instance}`, { method: "DELETE" });
  } catch {
    // pode ja nao existir
  }
}

async function fetchInstanceInfo(instance: string) {
  try {
    const { ok, data } = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`);
    if (!ok) return { number: null, exists: false };
    const list = Array.isArray(data) ? data : [data];
    const found = list.find(
      (i: any) =>
        i?.instance?.instanceName === instance || i?.instanceName === instance || i?.name === instance,
    );
    if (!found) return { number: null, exists: false };
    const raw =
      found?.instance?.ownerJid ?? found?.ownerJid ?? found?.instance?.owner ?? found?.owner ?? null;
    const number = raw ? String(raw).split("@")[0] : null;
    return { number, exists: true };
  } catch {
    return { number: null, exists: false };
  }
}

async function sendTextMessage(instance: string, number: string, text: string) {
  const cleaned = String(number || "").replace(/\D/g, "");
  if (!cleaned || !text) return { success: false, error: "Número e mensagem são obrigatórios." };
  try {
    const r = await evo(`/message/sendText/${instance}`, {
      method: "POST",
      body: { number: cleaned, text, options: { delay: 1200, presence: "composing" } },
    });
    if (!r.ok) return { success: false, error: evoError(r.data, r.status) };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro de rede ao enviar mensagem" };
  }
}

async function configureWebhook(instance: string, enabled: boolean) {
  try {
    const r = await evo(`/webhook/set/${instance}`, {
      method: "POST",
      body: {
        webhook: {
          enabled,
          url: webhookUrl(),
          byEvents: true,
          base64: false,
          events: ["MESSAGES_UPSERT"],
        },
      },
    });
    if (!r.ok) return { success: false, error: evoError(r.data, r.status) };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro de rede ao configurar webhook" };
  }
}

/** Reconecta a instancia existente ou recria se preciso (queda de conexao). */
async function restartInstance(instance: string) {
  const info = await fetchInstanceInfo(instance);

  if (info.exists) {
    const conn = await getConnectionState(instance);
    if (conn.state === "open") {
      return { state: "open", qrcode: null, reconnected: false, action: "connected" };
    }
    try {
      const r = await connectInstance(instance);
      if (r.qrcode) {
        return { state: "connecting", qrcode: r.qrcode, reconnected: true, action: "reconnected" };
      }
      await sleep(3000);
      const recheck = await getConnectionState(instance);
      if (recheck.state === "open") {
        return { state: "open", qrcode: null, reconnected: true, action: "reconnected" };
      }
    } catch (e) {
      console.warn("[evolution-whatsapp] falha ao reconectar, tentando recriar:", e);
    }
    try {
      await disconnectAndDelete(instance);
      await sleep(2000);
    } catch (e) {
      console.warn("[evolution-whatsapp] erro ao apagar instancia antiga:", e);
    }
  }

  try {
    const created = await createInstance(instance);
    if (created.qrcode) {
      return { state: "connecting", qrcode: created.qrcode, reconnected: true, action: "recreated" };
    }
    await sleep(2000);
    const finalCheck = await getConnectionState(instance);
    if (finalCheck.state === "open") {
      return { state: "open", qrcode: null, reconnected: true, action: "recreated" };
    }
    return { state: finalCheck.state, qrcode: null, reconnected: false, action: "failed" };
  } catch (e) {
    console.error("[evolution-whatsapp] falha ao recriar instancia:", e);
    return { state: "close", qrcode: null, reconnected: false, action: "failed" };
  }
}

async function checkAndReconnect(instance: string) {
  try {
    const conn = await getConnectionState(instance);
    if (conn.state === "open") {
      return { state: "open", wasDisconnected: false, reconnected: false, needsQrScan: false, qrcode: null };
    }
    console.log(`[evolution-whatsapp] instancia ${instance} esta ${conn.state}, tentando reconectar...`);
    const r = await restartInstance(instance);
    return {
      state: r.state,
      wasDisconnected: true,
      reconnected: r.state === "open",
      needsQrScan: r.state !== "open" && r.qrcode !== null,
      qrcode: r.qrcode,
    };
  } catch (e) {
    console.error("[evolution-whatsapp] erro em verificar_reconectar:", e);
    return { state: "close", wasDisconnected: true, reconnected: false, needsQrScan: false, qrcode: null };
  }
}

/** Codigo de pareamento (sem QR). So funciona em instancia recem-criada. */
async function getPairingCode(instance: string, phoneNumber: string) {
  const clean = String(phoneNumber || "").replace(/\D/g, "");
  if (!clean || clean.length < 10) {
    return { code: null, error: "Número de telefone inválido. Use formato: 5511999999999" };
  }
  try {
    await disconnectAndDelete(instance);
    await sleep(2000);
    await evo(`/instance/create`, {
      method: "POST",
      body: { instanceName: instance, integration: "WHATSAPP-BAILEYS", qrcode: false },
    });
    await sleep(3000);
    const r = await evo(`/instance/connect/${instance}?number=${clean}`);
    if (!r.ok) return { code: null, error: evoError(r.data, r.status) };
    const code = r.data?.pairingCode ?? null;
    if (code && typeof code === "string" && code.length <= 20) return { code };
    return {
      code: null,
      error: "Código não gerado. Verifique se o número está correto com código do país (ex: 5521999999999).",
    };
  } catch (err: any) {
    return { code: null, error: err?.message || "Erro ao obter código de pareamento." };
  }
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  // 1. Quem esta chamando (precisa ser um usuario logado, nao so a chave anon)
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Não autorizado" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice("Bearer ".length);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ error: "Sessão inválida. Faça login novamente." }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }
  const acao = String(body?.acao || "");
  const clinicaId = String(body?.clinica_id || "");
  if (!UUID_RE.test(clinicaId)) {
    return json({ error: "clinica_id inválido" }, 400);
  }

  // 2. O usuario pertence a essa clinica? (ou e super admin)
  const [{ data: minhaClinica }, { data: superAdmin }] = await Promise.all([
    userClient.rpc("get_user_clinica_id"),
    userClient.rpc("is_caller_super_admin"),
  ]);
  if (minhaClinica !== clinicaId && superAdmin !== true) {
    return json({ error: "Acesso negado a esta clínica" }, 403);
  }

  // 3. Evolution configurada no servidor?
  if (!evolutionUrl() || !evolutionKey()) {
    console.error("[evolution-whatsapp] EVOLUTION_API_URL / EVOLUTION_API_KEY nao configuradas");
    return json({ error: "WhatsApp não configurado no servidor (EVOLUTION_API_URL/EVOLUTION_API_KEY)." }, 503);
  }

  const instance = getInstanceName(clinicaId);

  try {
    switch (acao) {
      case "criar":
        return json(await createInstance(instance));
      case "conectar":
        return json(await connectInstance(instance));
      case "estado":
        return json(await getConnectionState(instance));
      case "info":
        return json(await fetchInstanceInfo(instance));
      case "desconectar":
        await disconnectAndDelete(instance);
        return json({ success: true });
      case "enviar_teste":
        return json(await sendTextMessage(instance, body?.numero, String(body?.texto ?? "")));
      case "webhook":
        return json(await configureWebhook(instance, body?.ativo === true));
      case "reiniciar":
        return json(await restartInstance(instance));
      case "verificar_reconectar":
        return json(await checkAndReconnect(instance));
      case "codigo_pareamento":
        return json(await getPairingCode(instance, body?.numero));
      default:
        return json({ error: `Ação desconhecida: ${acao}` }, 400);
    }
  } catch (err: any) {
    console.error(`[evolution-whatsapp] erro na acao ${acao}:`, err);
    return json({ error: "Falha ao falar com a Evolution API" }, 502);
  }
});
