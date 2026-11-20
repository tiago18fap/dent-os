// Encaminha /rest/v1/* para o PostgREST (o mesmo motor de tabelas do Supabase).
// Assim a API funciona como o gateway do Supabase: /rest/v1, /auth/v1 e
// /functions/v1 respondem no mesmo endereco.

import http from "node:http";
import { config } from "./config.js";

const target = new URL(config.restUrl);
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "host"]);

export function restProxy(req, res) {
  // req.url aqui ja vem sem o prefixo /rest/v1 (montado com app.use).
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k)) headers[k] = v;
  }
  // Sem token de usuario, o supabase-js manda a chave anon no Authorization; se
  // nao vier nada, o PostgREST usa o papel anon (PGRST_DB_ANON_ROLE).
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: `${target.pathname.replace(/\/$/, "")}${req.url}`,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    console.error("[rest] PostgREST indisponivel:", err.message);
    if (!res.headersSent) res.status(503).json({ message: "Banco temporariamente indisponivel", code: "PGRST_UNAVAILABLE" });
    else res.end();
  });
  req.pipe(upstream);
}
