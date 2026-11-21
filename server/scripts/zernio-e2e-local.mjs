// Teste de ponta a ponta da integracao Zernio na pilha LOCAL (com a Zernio falsa).
// Pre-requisitos: docker compose local de pe com ZERNIO_API_URL apontando para
// node server/scripts/zernio-mock.mjs (porta 18099).
//   cd server && API_URL=http://127.0.0.1:18080 ANON_KEY=... SERVICE_ROLE_KEY=... \
//     ZERNIO_WEBHOOK_SECRET=... node scripts/zernio-e2e-local.mjs
// Cria um usuario e um paciente de teste (*@teste.local / PACIENTE TESTE ZERNIO).
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const API = process.env.API_URL || "http://127.0.0.1:18080";
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:18099";
const ANON = process.env.ANON_KEY;
const SR = process.env.SERVICE_ROLE_KEY;
const SEGREDO = process.env.ZERNIO_WEBHOOK_SECRET;
const CLINICA_NOME = process.env.CLINICA_NOME || "Clinica Eufrasio";
const TELEFONE = "5511900009999";

const admin = createClient(API, SR, { auth: { persistSession: false } });
let falhas = 0;
const ok = (cond, rotulo, extra = "") => {
  console.log(`${cond ? "OK  " : "FALHOU"} ${rotulo}${extra ? `  (${extra})` : ""}`);
  if (!cond) falhas++;
};
const mockLog = async () => (await fetch(`${MOCK}/__log`)).json();

async function webhook(evento, { assinar = true } = {}) {
  const corpo = JSON.stringify(evento);
  const assinatura = crypto.createHmac("sha256", assinar ? SEGREDO : "errado").update(corpo).digest("hex");
  const r = await fetch(`${API}/functions/v1/zernio-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Zernio-Signature": assinatura, "X-Zernio-Event": evento.event },
    body: corpo,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

// 1. Clinica e usuario super admin de teste
const { data: clinica } = await admin.from("clinicas").select("id").eq("nome", CLINICA_NOME).single();
const email = `qa.zernio.${Date.now()}@teste.local`;
const senha = crypto.randomBytes(9).toString("base64url");
const user = createClient(API, ANON, { auth: { persistSession: false } });
const su = await user.auth.signUp({ email, password: senha, options: { data: { full_name: "QA Zernio", clinica_nome: "QA Zernio" } } });
ok(!su.error, "cadastro do usuario de teste", su.error?.message);
const uid = su.data.user.id;
await admin.from("user_roles").insert({ user_id: uid, role: "super_admin" });
await admin.from("perfis").update({ clinica_id: clinica.id, role: "super_admin" }).eq("id", uid);
await user.auth.signInWithPassword({ email, password: senha }); // token novo com o perfil atualizado

const chamar = async (acao, extra = {}) => {
  const { data, error } = await user.functions.invoke("zernio-whatsapp", { body: { acao, clinica_id: clinica.id, ...extra } });
  if (error) {
    const corpo = await error.context?.json?.().catch(() => null);
    return { erro: corpo?.error || error.message };
  }
  return data;
};

// 2. Ligar a conta da Zernio
const est = await chamar("estado");
ok(est.servidor_configurado === true && est.pode_vincular === true, "estado: servidor configurado e super admin", JSON.stringify(est));
const contas = await chamar("contas");
ok(contas.contas?.length === 1 && contas.contas[0].accountId === "acc_teste_1", "lista so contas de WhatsApp da Zernio");
const vinc = await chamar("vincular", { account_id: "acc_teste_1" });
ok(vinc.ok === true, "vincular conta a clinica", JSON.stringify(vinc));
const { data: cfg } = await admin.from("whatsapp_config").select("provider, zernio_account_id, conectado").eq("clinica_id", clinica.id).single();
ok(cfg.provider === "zernio" && cfg.zernio_account_id === "acc_teste_1" && cfg.conectado, "whatsapp_config passou para zernio");

// 3. Modelo da campanha de procedimento
const camp = await chamar("campanhas");
const procs = camp.campanhas.filter((c) => !c.texto_livre && /\{nome\}/i.test(c.texto));
ok(procs.length > 0, "campanhas da clinica listadas", `${camp.campanhas.length} campanhas`);
const alvo = procs[0];
const env = await chamar("enviar_modelo", { chave: alvo.chave, categoria: "UTILITY" });
ok(env.ok && env.status === "PENDING", "modelo enviado para aprovacao", env.nome || env.erro);
const de_novo = await chamar("enviar_modelo", { chave: alvo.chave, categoria: "UTILITY" });
ok(de_novo.ja_enviado === true, "reenviar o mesmo texto nao cria outro modelo");
let log = await mockLog();
const criado = log.modelos.at(-1);
ok(criado?.components?.[0]?.text?.includes("{{1}}") && !criado.components[0].text.includes("{nome}"), "texto convertido para {{1}}", criado?.components?.[0]?.text?.slice(0, 60));

// 4. Mensagem na fila enquanto o modelo nao esta aprovado -> fica esperando
const { data: cliente } = await admin
  .from("clientes")
  .insert({ clinica_id: clinica.id, paciente: "PACIENTE TESTE ZERNIO", telefone: TELEFONE, situacao: "Ativo", codigo: `TZ${Date.now()}` })
  .select("id")
  .single();
await admin.from("whatsapp_config").update({ horario_inicio: "00:00", horario_fim: "23:59" }).eq("clinica_id", clinica.id);
await admin.from("carteira_envios").update({ saldo: 100 }).eq("clinica_id", clinica.id);
const mensagem = alvo.texto.replace(/\{nome\}/gi, "Teste").replace(/\{procedimento\}/gi, "Limpeza").replace(/\{data_procedimento\}/gi, "01/01/2026");
const { data: fila } = await admin
  .from("fila_envios")
  .insert({
    clinica_id: clinica.id, paciente_id: cliente.id, paciente_nome: "PACIENTE TESTE ZERNIO", telefone: TELEFONE,
    mensagem, status: "pendente", custo: 1, origem: "procedimento", campanha_ref: alvo.chave,
    data_programada: new Date(Date.now() - 60_000).toISOString(),
  })
  .select("id")
  .single();

const rodarFila = async () => (await fetch(`${API}/functions/v1/processar-fila`, { method: "POST", headers: { Authorization: `Bearer ${SR}` } })).json();
let r = await rodarFila();
let { data: f1 } = await admin.from("fila_envios").select("status, erro_detalhe").eq("id", fila.id).single();
ok(f1.status === "pendente" && /não aprovado/.test(f1.erro_detalhe || ""), "sem aprovacao: mensagem continua pendente", f1.erro_detalhe);

// 5. Meta aprova -> status atualizado -> envio sai com as variaveis certas
await fetch(`${MOCK}/__aprovar`, { method: "POST" });
const at = await chamar("atualizar_status");
ok(at.atualizados >= 1, "atualizar status trouxe APPROVED", JSON.stringify(at));
r = await rodarFila();
({ data: f1 } = await admin.from("fila_envios").select("status, provider_message_id, erro_detalhe").eq("id", fila.id).single());
ok(f1.status === "enviado" && /^wamid\./.test(f1.provider_message_id || ""), "mensagem enviada e id da Meta gravado", JSON.stringify(f1));
log = await mockLog();
const envio = log.chamadas.filter((c) => c.caminho === "/api/v1/inbox/conversations").at(-1);
ok(envio?.corpo?.participantId === TELEFONE && envio.corpo.templateName === criado.name && envio.corpo.templateLanguage === "pt_BR", "envio pelo modelo certo e telefone certo");
ok(envio?.corpo?.templateParams?.[0] === "Teste", "variavel {nome} extraida da mensagem", JSON.stringify(envio?.corpo?.templateParams));
ok(envio?.idem === `fila-${fila.id}`, "Idempotency-Key = id da fila");

// 6. Webhook: assinatura, leitura, duplicado, opt-out, status do modelo, desconexao
const ruim = await webhook({ id: "evt_x", event: "message.read", message: {} }, { assinar: false });
ok(ruim.status === 401, "assinatura errada e recusada");
const lido = await webhook({ id: `evt_read_${fila.id}`, event: "message.read", message: { platformMessageId: f1.provider_message_id }, account: { accountId: "acc_teste_1" } });
({ data: f1 } = await admin.from("fila_envios").select("lida").eq("id", fila.id).single());
ok(lido.status === 200 && f1.lida === true, "message.read marca como lida", lido.body?.resultado);
const dup = await webhook({ id: `evt_read_${fila.id}`, event: "message.read", message: { platformMessageId: f1.provider_message_id } });
ok(dup.body?.duplicado === true, "evento repetido e ignorado");

const resp = await webhook({
  id: `evt_in_${fila.id}`, event: "message.received", account: { accountId: "acc_teste_1" },
  message: { direction: "incoming", text: "Por favor não quero mais receber mensagens, me tira da lista", conversationId: `conv_${TELEFONE}`, sender: { id: TELEFONE, phoneNumber: `+${TELEFONE}`, name: "Paciente Teste" } },
});
const { data: cli } = await admin.from("clientes").select("situacao").eq("id", cliente.id).single();
const { data: f2 } = await admin.from("fila_envios").select("respondida, mensagem_resposta").eq("id", fila.id).single();
ok(f2.respondida === true, "resposta do paciente registrada no envio");
ok(cli.situacao === "Desabilitado", "opt-out desabilita o paciente", resp.body?.resultado);
log = await mockLog();
ok(log.chamadas.some((c) => c.caminho === `/api/v1/inbox/conversations/conv_${TELEFONE}/messages`), "confirmacao de opt-out enviada ao paciente");

const st = await webhook({ id: `evt_tpl_${fila.id}`, event: "whatsapp.template.status_updated", account: { accountId: "acc_teste_1" }, template: { name: criado.name, language: "pt_BR", status: "REJECTED", reason: "INVALID_FORMAT" } });
const { data: mod } = await admin.from("whatsapp_modelos").select("status, motivo").eq("clinica_id", clinica.id).eq("chave", alvo.chave).single();
ok(mod.status === "REJECTED" && mod.motivo === "INVALID_FORMAT", "status do modelo atualizado pelo webhook", st.body?.resultado);

const desc = await webhook({ id: `evt_disc_${fila.id}`, event: "account.disconnected", account: { accountId: "acc_teste_1", disconnectionType: "unintentional", reason: "PRIMARY_INACTIVITY" } });
const { data: cfg2 } = await admin.from("whatsapp_config").select("conectado").eq("clinica_id", clinica.id).single();
ok(cfg2.conectado === false, "desconexao marca a clinica como desconectada", desc.body?.resultado);

// 7. Limpeza dos dados de teste
await admin.from("fila_envios").delete().eq("id", fila.id);
await admin.from("solicitacoes_optout").delete().eq("telefone", TELEFONE);
await admin.from("clientes").delete().eq("id", cliente.id);
await admin.from("whatsapp_modelos").delete().eq("clinica_id", clinica.id);
await admin.from("whatsapp_config").update({ provider: "evolution", zernio_account_id: null, zernio_numero: null }).eq("clinica_id", clinica.id);

console.log(falhas ? `\n${falhas} verificacao(oes) falharam` : "\nTUDO OK");
process.exit(falhas ? 1 : 0);
