// API do DentOS fora do Supabase.
//
// Responde nos mesmos caminhos que o Supabase, para o frontend (supabase-js)
// continuar funcionando so trocando a URL:
//   /rest/v1/*       -> PostgREST (tabelas e RPCs, com as mesmas regras RLS)
//   /auth/v1/*       -> login compativel com GoTrue (server/auth/gotrue.js)
//   /functions/v1/*  -> as Edge Functions originais rodando no Node
//   /api/health      -> estado da API, banco, PostgREST, funcoes e agendamentos

import express from "express";
import { config } from "./lib/config.js";
import { pool, bootstrapDatabase } from "./lib/db.js";
import { restProxy } from "./lib/restProxy.js";
import { authRouter } from "./auth/gotrue.js";
import { functionsRouter, loadFunctions } from "./functions/runtime.js";
import { startScheduler, schedulerStatus } from "./jobs/scheduler.js";
import { signRoleKey } from "./lib/jwt.js";

const VERSION = process.env.APP_VERSION || "dev";

async function main() {
  await bootstrapDatabase();

  // As funcoes leem estas variaveis exatamente como liam no Supabase.
  process.env.SUPABASE_URL = `http://127.0.0.1:${config.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= signRoleKey("service_role");
  process.env.SUPABASE_ANON_KEY ||= signRoleKey("anon");
  const functions = await loadFunctions();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-supabase-api-version, x-region",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "content-range, x-total-count, x-supabase-api-version");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  app.use("/rest/v1", restProxy);
  app.use("/auth/v1", authRouter);
  app.use("/functions/v1", functionsRouter);

  app.get(["/api/health", "/health"], async (_req, res) => {
    const out = { version: VERSION, ok: true, db: null, rest: null, functions, cron: schedulerStatus(config.cronEnabled) };
    const t0 = Date.now();
    try {
      await pool.query("SELECT 1");
      out.db = { ok: true, ms: Date.now() - t0 };
    } catch (err) {
      out.ok = false;
      out.db = { ok: false, erro: err.message };
    }
    const t1 = Date.now();
    try {
      const r = await fetch(`${config.restUrl}/`, { signal: AbortSignal.timeout(5000) });
      out.rest = { ok: r.status < 500, status: r.status, ms: Date.now() - t1 };
      if (!out.rest.ok) out.ok = false;
    } catch (err) {
      out.ok = false;
      out.rest = { ok: false, erro: err.message };
    }
    if (functions.failed.length) out.ok = false;
    res.status(out.ok ? 200 : 503).json(out);
  });

  app.use((_req, res) => res.status(404).json({ message: "Not found" }));

  app.listen(config.port, () => {
    console.log(`[api] DentOS API ${VERSION} ouvindo na porta ${config.port}`);
    if (config.cronEnabled) startScheduler();
    else console.log("[cron] DESLIGADO (CRON_ENABLED != true). Nenhuma fila sera processada automaticamente.");
  });
}

main().catch((err) => {
  console.error("[api] falha ao iniciar:", err);
  process.exit(1);
});
