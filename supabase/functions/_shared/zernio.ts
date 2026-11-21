// Cliente minimo da API da Zernio (WhatsApp oficial da Meta com coexistencia).
// Docs: https://docs.zernio.com/platforms/whatsapp
//
// Variaveis de ambiente (servico api no EasyPanel):
//   ZERNIO_API_KEY   chave criada no painel da Zernio (Bearer)
//   ZERNIO_API_URL   opcional; padrao https://zernio.com/api/v1 (testes apontam para um mock)

const BASE = (Deno.env.get("ZERNIO_API_URL") || "https://zernio.com/api/v1").trim().replace(/\/$/, "");

export class ZernioError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function zernioConfigurado(): boolean {
  return !!(Deno.env.get("ZERNIO_API_KEY") || "").trim();
}

async function chamar(metodo: string, caminho: string, corpo?: unknown, extraHeaders: Record<string, string> = {}) {
  const key = (Deno.env.get("ZERNIO_API_KEY") || "").trim();
  if (!key) throw new ZernioError("ZERNIO_API_KEY nao configurada no servidor", 500, "NO_API_KEY");

  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const texto = await res.text();
  let dados: any = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = { raw: texto };
  }
  if (!res.ok) {
    const msg = dados?.error?.message || dados?.error || dados?.message || `HTTP ${res.status}`;
    const code = dados?.code || dados?.error?.code || null;
    throw new ZernioError(String(msg).slice(0, 500), res.status, code ? String(code) : null);
  }
  return dados;
}

/** Telefone so com digitos, com DDI 55 (formato participantId da Zernio). */
export function telefoneParaZernio(telefone: string): string {
  let d = (telefone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

export interface ContaWhatsapp {
  accountId: string;
  profileId: string | null;
  numero: string | null;
  nome: string | null;
  ativo: boolean;
}

/** Contas de WhatsApp conectadas na Zernio. */
export async function listarContasWhatsapp(): Promise<ContaWhatsapp[]> {
  const dados = await chamar("GET", "/accounts");
  const contas: any[] = dados?.accounts || dados?.data || [];
  return contas
    .filter((c) => (c.platform || "").toLowerCase() === "whatsapp")
    .map((c) => ({
      accountId: String(c._id || c.id || c.accountId),
      profileId: c.profileId ? String(c.profileId) : null,
      numero: c.username || c.phoneNumber || null,
      nome: c.displayName || null,
      ativo: c.isActive !== false,
    }));
}

/**
 * Envia um modelo aprovado para um telefone (abre ou reaproveita a conversa).
 * Idempotency-Key evita envio duplicado se a requisicao for repetida.
 */
export async function enviarModelo(params: {
  accountId: string;
  telefone: string;
  nomeModelo: string;
  idioma: string;
  variaveis: string[];
  idempotencyKey: string;
}): Promise<{ messageId: string | null; conversationId: string | null }> {
  const dados = await chamar(
    "POST",
    "/inbox/conversations",
    {
      accountId: params.accountId,
      participantId: telefoneParaZernio(params.telefone),
      templateName: params.nomeModelo,
      templateLanguage: params.idioma,
      templateParams: params.variaveis,
    },
    { "Idempotency-Key": params.idempotencyKey },
  );
  return {
    messageId: dados?.data?.messageId ?? dados?.messageId ?? null,
    conversationId: dados?.data?.conversationId ?? dados?.conversationId ?? null,
  };
}

/** Texto livre numa conversa ja aberta (so dentro da janela de 24 h do paciente). */
export async function enviarTexto(params: { accountId: string; conversationId: string; texto: string }) {
  return chamar("POST", `/inbox/conversations/${encodeURIComponent(params.conversationId)}/messages`, {
    accountId: params.accountId,
    message: params.texto,
  });
}

export interface ModeloZernio {
  id: string | null;
  nome: string;
  idioma: string;
  status: string;
  categoria: string | null;
}

export async function criarModelo(params: {
  accountId: string;
  nome: string;
  idioma: string;
  categoria: "MARKETING" | "UTILITY";
  texto: string;
  exemplos: string[];
}): Promise<ModeloZernio> {
  const componente: Record<string, unknown> = { type: "body", text: params.texto };
  if (params.exemplos.length) componente.example = { body_text: [params.exemplos] };
  const dados = await chamar("POST", "/whatsapp/templates", {
    accountId: params.accountId,
    name: params.nome,
    category: params.categoria,
    language: params.idioma,
    components: [componente],
  });
  const t = dados?.template || dados?.data || {};
  return {
    id: t.id ? String(t.id) : null,
    nome: t.name || params.nome,
    idioma: t.language || params.idioma,
    status: t.status || "PENDING",
    categoria: t.category || params.categoria,
  };
}

export async function listarModelos(accountId: string): Promise<ModeloZernio[]> {
  const dados = await chamar("GET", `/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`);
  const lista: any[] = dados?.templates || dados?.data || [];
  return lista.map((t) => ({
    id: t.id ? String(t.id) : null,
    nome: t.name,
    idioma: t.language,
    status: t.status,
    categoria: t.category || null,
  }));
}
