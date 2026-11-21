// WhatsApp oficial via Zernio: configuracao chamada pela tela de Configuracoes.
//
// Corpo: { acao, clinica_id, ...parametros }
//   estado            -> provedor atual, conta ligada, se o servidor tem a chave da Zernio
//   contas            -> contas de WhatsApp conectadas na Zernio (so super admin)
//   vincular          -> { account_id } liga a conta a clinica e passa a enviar pela Zernio (so super admin)
//   usar_evolution    -> volta a clinica para a Evolution (a conta da Zernio fica guardada)
//   campanhas         -> campanhas da clinica com o status do modelo na Meta
//   enviar_modelo     -> { chave, categoria, texto? } cria o modelo na Meta a partir do texto da campanha
//   atualizar_status  -> consulta a Meta e atualiza o status dos modelos da clinica
//
// Acesso: usuario da clinica (perfis.clinica_id) ou super admin, como em evolution-whatsapp.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { criarModelo, listarContasWhatsapp, listarModelos, zernioConfigurado, ZernioError } from "../_shared/zernio.ts";
import { converterTextoParaModelo, nomeDoModelo } from "../_shared/modelos.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const ROTULO_ORIGEM: Record<string, string> = {
  aniversario_dia: "Aniversário (no dia)",
  aniversario_mes: "Aniversário (no mês)",
  massa: "Disparo geral",
};

async function configDaClinica(clinicaId: string) {
  const { data } = await admin
    .from("whatsapp_config")
    .select("id, provider, zernio_account_id, zernio_numero, conectado")
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return data;
}

/** Campanhas da clinica que podem virar modelo: procedimento (por grupo), aniversario e disparo geral. */
async function campanhasDaClinica(clinicaId: string) {
  const [{ data: procs }, { data: configs }, { data: modelos }] = await Promise.all([
    admin.from("campanhas_procedimento").select("group_id, mensagem, procedimentos_nomes, ativo").eq("clinica_id", clinicaId),
    admin.from("campanhas_config").select("chave, mensagem, ativo").eq("clinica_id", clinicaId),
    admin.from("whatsapp_modelos").select("*").eq("clinica_id", clinicaId),
  ]);
  const porChave = new Map((modelos ?? []).map((m: any) => [m.chave, m]));

  const lista: any[] = [];
  const vistos = new Set<string>();
  for (const p of procs ?? []) {
    if (!p.group_id || vistos.has(p.group_id)) continue;
    vistos.add(p.group_id);
    const nomes = (p.procedimentos_nomes ?? []).filter(Boolean);
    lista.push({
      chave: p.group_id,
      titulo: nomes.length ? `Retorno: ${nomes.slice(0, 3).join(", ")}${nomes.length > 3 ? "…" : ""}` : "Campanha por procedimento",
      texto: p.mensagem ?? "",
      ativo: p.ativo !== false,
      categoria_sugerida: "UTILITY",
    });
  }
  for (const c of configs ?? []) {
    if (!c.chave || c.chave.startsWith("procedimento_") || vistos.has(c.chave)) continue;
    vistos.add(c.chave);
    lista.push({
      chave: c.chave,
      titulo: ROTULO_ORIGEM[c.chave] || c.chave,
      texto: c.mensagem ?? "",
      ativo: c.ativo !== false,
      categoria_sugerida: "MARKETING",
    });
  }
  // Disparo geral: o texto e escolhido na hora do disparo; o modelo guarda o ultimo enviado.
  const massa = porChave.get("massa");
  lista.push({
    chave: "massa",
    titulo: ROTULO_ORIGEM.massa,
    texto: massa?.texto_original ?? "",
    ativo: true,
    categoria_sugerida: "MARKETING",
    texto_livre: true,
  });

  return lista.map((c) => {
    const m = porChave.get(c.chave);
    const conv = converterTextoParaModelo(c.texto);
    return {
      ...c,
      modelo: m
        ? {
            nome: m.nome_modelo,
            status: m.status,
            categoria: m.categoria,
            motivo: m.motivo,
            texto_original: m.texto_original,
            atualizado_em: m.updated_at,
            desatualizado: !c.texto_livre && m.texto_original !== c.texto,
          }
        : null,
      previa_modelo: conv.textoModelo,
      avisos: conv.avisos,
    };
  });
}

async function enviarModelo(clinicaId: string, accountId: string, body: any) {
  const chave = String(body?.chave || "").trim();
  const categoria = body?.categoria === "UTILITY" ? "UTILITY" : "MARKETING";
  if (!chave) return json({ error: "Informe a campanha (chave)" }, 400);

  const campanhas = await campanhasDaClinica(clinicaId);
  const campanha = campanhas.find((c) => c.chave === chave);
  if (!campanha) return json({ error: "Campanha não encontrada nesta clínica" }, 404);
  const texto = campanha.texto_livre ? String(body?.texto ?? "") : campanha.texto;
  if (!texto.trim()) return json({ error: "A campanha está sem texto" }, 400);

  const conv = converterTextoParaModelo(texto);
  const nome = nomeDoModelo(chave, conv.textoModelo, categoria);

  // Mesmo texto e categoria ja enviados: nao cria de novo na Meta.
  const { data: atual } = await admin
    .from("whatsapp_modelos")
    .select("nome_modelo, status")
    .eq("clinica_id", clinicaId)
    .eq("chave", chave)
    .maybeSingle();
  if (atual?.nome_modelo === nome && atual.status !== "REJECTED") {
    return json({ ok: true, ja_enviado: true, status: atual.status, nome });
  }

  const criado = await criarModelo({
    accountId,
    nome,
    idioma: "pt_BR",
    categoria,
    texto: conv.textoModelo,
    exemplos: conv.exemplos,
  });

  const { error } = await admin.from("whatsapp_modelos").upsert(
    {
      clinica_id: clinicaId,
      chave,
      nome_modelo: criado.nome,
      idioma: criado.idioma || "pt_BR",
      categoria,
      status: String(criado.status || "PENDING").toUpperCase(),
      motivo: null,
      texto_original: texto,
      texto_modelo: conv.textoModelo,
      variaveis: conv.variaveis,
      zernio_template_id: criado.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clinica_id,chave" },
  );
  if (error) throw error;
  return json({ ok: true, nome: criado.nome, status: criado.status, avisos: conv.avisos });
}

async function atualizarStatus(clinicaId: string, accountId: string) {
  const naMeta = await listarModelos(accountId);
  const { data: meus } = await admin.from("whatsapp_modelos").select("id, nome_modelo, idioma, status").eq("clinica_id", clinicaId);
  let atualizados = 0;
  for (const m of meus ?? []) {
    const remoto = naMeta.find((t) => t.nome === m.nome_modelo && (t.idioma || "pt_BR") === (m.idioma || "pt_BR"));
    const status = remoto ? String(remoto.status || "").toUpperCase() : "NAO_ENCONTRADO";
    if (status && status !== m.status) {
      await admin.from("whatsapp_modelos").update({ status, updated_at: new Date().toISOString() }).eq("id", m.id);
      atualizados++;
    }
  }
  return json({ ok: true, atualizados });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(authHeader.slice(7));
  if (userError || !userData?.user) return json({ error: "Sessão inválida. Faça login novamente." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }
  const acao = String(body?.acao || "");
  const clinicaId = String(body?.clinica_id || "");
  if (!UUID_RE.test(clinicaId)) return json({ error: "clinica_id inválido" }, 400);

  const [{ data: minhaClinica }, { data: superAdmin }] = await Promise.all([
    userClient.rpc("get_user_clinica_id"),
    userClient.rpc("is_caller_super_admin"),
  ]);
  const ehSuper = superAdmin === true;
  if (minhaClinica !== clinicaId && !ehSuper) return json({ error: "Acesso negado a esta clínica" }, 403);

  try {
    const cfg = await configDaClinica(clinicaId);

    if (acao === "estado") {
      return json({
        servidor_configurado: zernioConfigurado(),
        provider: cfg?.provider ?? "evolution",
        zernio_account_id: cfg?.zernio_account_id ?? null,
        zernio_numero: cfg?.zernio_numero ?? null,
        conectado: cfg?.conectado ?? false,
        pode_vincular: ehSuper,
      });
    }

    if (acao === "usar_evolution") {
      if (!cfg) return json({ ok: true });
      await admin.from("whatsapp_config").update({ provider: "evolution", updated_at: new Date().toISOString() }).eq("id", cfg.id);
      return json({ ok: true });
    }

    if (acao === "campanhas") {
      return json({ campanhas: await campanhasDaClinica(clinicaId) });
    }

    if (!zernioConfigurado()) {
      return json({ error: "Zernio não configurada no servidor (ZERNIO_API_KEY)." }, 503);
    }

    if (acao === "contas" || acao === "vincular") {
      if (!ehSuper) return json({ error: "Só o administrador do DentOS pode ligar contas da Zernio." }, 403);
      const contas = await listarContasWhatsapp();
      const { data: usadas } = await admin
        .from("whatsapp_config")
        .select("clinica_id, zernio_account_id")
        .not("zernio_account_id", "is", null);
      const donoDe = new Map((usadas ?? []).map((u: any) => [u.zernio_account_id, u.clinica_id]));

      if (acao === "contas") {
        return json({
          contas: contas.map((c) => ({ ...c, clinica_id: donoDe.get(c.accountId) ?? null })),
        });
      }

      const accountId = String(body?.account_id || "");
      const conta = contas.find((c) => c.accountId === accountId);
      if (!conta) return json({ error: "Conta não encontrada na Zernio" }, 404);
      const dono = donoDe.get(accountId);
      if (dono && dono !== clinicaId) return json({ error: "Esta conta já está ligada a outra clínica" }, 409);

      const dados = {
        provider: "zernio",
        zernio_account_id: conta.accountId,
        zernio_numero: conta.numero,
        numero: conta.numero,
        conectado: true,
        updated_at: new Date().toISOString(),
      };
      if (cfg) await admin.from("whatsapp_config").update(dados).eq("id", cfg.id);
      else await admin.from("whatsapp_config").insert({ clinica_id: clinicaId, ...dados });
      await admin.from("auditoria_logs").insert({
        clinica_id: clinicaId,
        usuario_email: userData.user.email,
        acao: "conectar_whatsapp",
        descricao: `WhatsApp oficial (Zernio) ligado: ${conta.numero ?? conta.accountId}`,
      });
      return json({ ok: true, numero: conta.numero });
    }

    if (acao === "enviar_modelo" || acao === "atualizar_status") {
      if (!cfg?.zernio_account_id) return json({ error: "Ligue a conta da Zernio antes." }, 400);
      return acao === "enviar_modelo"
        ? await enviarModelo(clinicaId, cfg.zernio_account_id, body)
        : await atualizarStatus(clinicaId, cfg.zernio_account_id);
    }

    return json({ error: `Ação desconhecida: ${acao}` }, 400);
  } catch (err: any) {
    console.error(`[zernio-whatsapp] erro na acao ${acao}:`, err);
    if (err instanceof ZernioError) {
      return json({ error: `Zernio: ${err.message}`, code: err.code }, err.status >= 400 && err.status < 500 ? 400 : 502);
    }
    return json({ error: "Falha ao processar a solicitação" }, 500);
  }
});
