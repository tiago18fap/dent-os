// Executa as Edge Functions do DentOS (supabase/functions/*/index.ts) dentro do
// Node, no mesmo endereco de antes: POST /functions/v1/<nome>.
//
// O codigo das funcoes nao e alterado. Este modulo:
//   * define `Deno.env` e `EdgeRuntime.waitUntil` no escopo global;
//   * registra os hooks que trocam imports por URL por pacotes npm;
//   * importa cada index.ts e guarda o handler passado para serve();
//   * converte a requisicao Express em Request (Fetch API) e devolve a Response.

import express from "express";
import { register } from "node:module";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { beginLoading, endLoading, getHandler, listHandlers } from "./registry.js";
import { verifyToken, bearer } from "../lib/jwt.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FUNCTIONS_DIR = path.resolve(
  process.env.FUNCTIONS_DIR || path.join(HERE, "..", "..", "supabase", "functions"),
);

// Funcoes que o Supabase expunha sem exigir JWT (config.toml) + webhooks externos.
// A lista vem do supabase/config.toml (espelha o verify_jwt de producao).
const DEFAULT_PUBLIC = [];
const publicFunctions = new Set(DEFAULT_PUBLIC);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function installDenoGlobals() {
  if (!globalThis.Deno) {
    globalThis.Deno = {
      env: {
        get: (k) => process.env[k],
        set: (k, v) => {
          process.env[k] = String(v);
        },
        has: (k) => k in process.env,
        toObject: () => ({ ...process.env }),
      },
    };
  }
  if (!globalThis.EdgeRuntime) {
    globalThis.EdgeRuntime = {
      // No Supabase isto mantinha a funcao viva depois da resposta; no Node o
      // processo ja fica vivo, so precisamos registrar falhas.
      waitUntil: (p) => {
        Promise.resolve(p).catch((err) => console.error("[functions] tarefa em segundo plano falhou:", err));
      },
    };
  }
}

async function readPublicFromConfigToml() {
  try {
    const toml = await readFile(path.join(FUNCTIONS_DIR, "..", "config.toml"), "utf8");
    const re = /\[functions\.([a-z0-9_-]+)\]\s*\n\s*verify_jwt\s*=\s*false/gi;
    let m;
    while ((m = re.exec(toml))) publicFunctions.add(m[1]);
  } catch {
    /* sem config.toml: so os padroes */
  }
  for (const name of (process.env.FUNCTIONS_PUBLIC_EXTRA || "").split(",")) {
    if (name.trim()) publicFunctions.add(name.trim());
  }
}

export async function loadFunctions() {
  installDenoGlobals();
  register("./loader-hooks.js", import.meta.url);
  await readPublicFromConfigToml();

  const entries = await readdir(FUNCTIONS_DIR, { withFileTypes: true });
  const failed = [];
  for (const dir of entries) {
    if (!dir.isDirectory() || dir.name.startsWith("_")) continue;
    const file = path.join(FUNCTIONS_DIR, dir.name, "index.ts");
    try {
      await stat(file);
    } catch {
      continue;
    }
    beginLoading(dir.name);
    try {
      await import(pathToFileURL(file).href);
      if (!getHandler(dir.name)) throw new Error("o arquivo nao chamou serve()");
    } catch (err) {
      failed.push(dir.name);
      console.error(`[functions] falha ao carregar ${dir.name}:`, err);
    } finally {
      endLoading();
    }
  }
  console.log(`[functions] carregadas: ${listHandlers().join(", ")}`);
  if (failed.length) console.error(`[functions] NAO carregadas: ${failed.join(", ")}`);
  return { loaded: listHandlers(), failed, public: [...publicFunctions].sort() };
}

/** Chama uma funcao direto (usado pelos agendamentos), como o pg_net fazia. */
export async function invokeFunction(name, { body = {}, headers = {} } = {}) {
  const handler = getHandler(name);
  if (!handler) throw new Error(`Funcao nao carregada: ${name}`);
  const req = new Request(`http://internal/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  const text = await res.text();
  return { status: res.status, text };
}

function checkJwt(req) {
  const token = bearer(req);
  if (!token) return "Missing authorization header";
  try {
    verifyToken(token);
    return null;
  } catch {
    return "Invalid JWT";
  }
}

export const functionsRouter = express.Router();

functionsRouter.use(express.raw({ type: () => true, limit: "60mb" }));

functionsRouter.all("/:name", async (req, res) => {
  const name = req.params.name;
  const handler = getHandler(name);
  if (!handler) {
    res.set(CORS).status(404).json({ code: "NOT_FOUND", message: "Requested function was not found" });
    return;
  }

  if (req.method !== "OPTIONS" && !publicFunctions.has(name)) {
    const problem = checkJwt(req);
    if (problem) {
      res.set(CORS).status(401).json({ code: 401, message: problem });
      return;
    }
  }

  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = `${proto}://${host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || k === "host" || k === "connection" || k === "content-length") continue;
    headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }
  const hasBody = !["GET", "HEAD"].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;

  try {
    const request = new Request(url, { method: req.method, headers, body: hasBody ? req.body : undefined });
    const response = await handler(request);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error(`[functions] erro em ${name}:`, err);
    res.set(CORS).status(500).json({ error: "Erro interno na funcao", function: name });
  }
});
