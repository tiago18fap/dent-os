// Zernio falsa para testes locais: imita as rotas que o DentOS usa e guarda
// tudo o que recebe. Nenhuma mensagem real e enviada.
//   node server/scripts/zernio-mock.mjs            (porta 18099)
//   GET  /__log      -> chamadas recebidas
//   POST /__aprovar  -> marca todos os modelos como APPROVED
import http from "node:http";

const PORT = Number(process.env.PORT || 18099);
const chamadas = [];
const modelos = [];
let seq = 0;

const contas = [
  { _id: "acc_teste_1", platform: "whatsapp", profileId: "prof_1", username: "+55 11 90000-0001", displayName: "Clínica Teste", isActive: true },
  { _id: "acc_insta", platform: "instagram", profileId: "prof_1", username: "clinica", displayName: "Insta", isActive: true },
];

function responder(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const json = corpo ? JSON.parse(corpo) : null;
      const caminho = url.pathname.replace(/^\/api\/v1/, "");
      if (caminho === "/__log") return responder(res, 200, { chamadas, modelos });
      if (caminho === "/__aprovar") {
        modelos.forEach((m) => (m.status = "APPROVED"));
        return responder(res, 200, { ok: true, modelos: modelos.length });
      }

      chamadas.push({ metodo: req.method, caminho: url.pathname + url.search, auth: req.headers.authorization, idem: req.headers["idempotency-key"], corpo: json });
      if (req.headers.authorization !== `Bearer ${process.env.ZERNIO_API_KEY || "chave-teste"}`) {
        return responder(res, 401, { error: "Invalid API key" });
      }

      if (req.method === "GET" && caminho === "/accounts") return responder(res, 200, { accounts: contas });
      if (req.method === "POST" && caminho === "/whatsapp/templates") {
        const t = { id: String(1000 + modelos.length), name: json.name, status: "PENDING", category: json.category, language: json.language, components: json.components };
        modelos.push(t);
        return responder(res, 200, { success: true, template: t });
      }
      if (req.method === "GET" && caminho === "/whatsapp/templates") return responder(res, 200, { success: true, templates: modelos });
      if (req.method === "POST" && caminho === "/inbox/conversations") {
        if (!modelos.find((m) => m.name === json.templateName && m.status === "APPROVED")) {
          return responder(res, 400, { error: "Template not found", code: "132001" });
        }
        seq += 1;
        return responder(res, 201, { success: true, data: { messageId: `wamid.TESTE${seq}`, conversationId: `conv_${json.participantId}`, participantId: json.participantId } });
      }
      const m = caminho.match(/^\/inbox\/conversations\/([^/]+)\/messages$/);
      if (req.method === "POST" && m) return responder(res, 201, { success: true, data: { messageId: `wamid.TEXTO${++seq}` } });
      return responder(res, 404, { error: `rota nao simulada: ${req.method} ${caminho}` });
    });
  })
  .listen(PORT, () => console.log(`[zernio-mock] ouvindo na porta ${PORT}`));
