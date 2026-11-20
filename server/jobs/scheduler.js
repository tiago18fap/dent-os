// Agendamentos que antes rodavam no pg_cron do Supabase. Espelham os crons ATIVOS
// de producao (cron.job exportado em 20/11/2026), nao os das migracoes do repo:
//   processar-fila-envios        */2 * * * *   -> funcao processar-fila
//   gerar-fila-diaria            0 10 * * *    -> funcao gerar-fila-diaria
//   easydental-daily-sync        0 9 * * *     -> public.trigger_easydental_sync() = POST <worker>/sync
//   reset-mensal-saldo-carteira  0 0 1 * *     -> SELECT public.reset_mensal_saldo()
// Ficaram de fora, porque falhavam em producao:
//   easydental-sync-diario  (chamava a funcao sem clinica_id -> 400 todo dia)
//   processar-disparos-massa-* (a funcao publicada tinha 5 linhas soltas, sem serve())
//
// So liga com CRON_ENABLED=true, para uma copia local nunca disparar WhatsApp real.

import cron from "node-cron";
import { invokeFunction } from "../functions/runtime.js";
import { query } from "../lib/db.js";
import { signRoleKey } from "../lib/jwt.js";

const running = new Set();
const lastRuns = new Map();

function serviceHeaders() {
  return { Authorization: `Bearer ${signRoleKey("service_role", 1)}` };
}

async function runOnce(name, fn) {
  if (running.has(name)) {
    console.log(`[cron] ${name} ainda rodando; pulando esta vez`);
    return;
  }
  running.add(name);
  const started = Date.now();
  try {
    const detail = await fn();
    lastRuns.set(name, { at: new Date().toISOString(), ok: true, ms: Date.now() - started, detail });
  } catch (err) {
    console.error(`[cron] ${name} falhou:`, err);
    lastRuns.set(name, { at: new Date().toISOString(), ok: false, ms: Date.now() - started, erro: String(err?.message || err) });
  } finally {
    running.delete(name);
  }
}

async function callFunction(name, body = {}) {
  const r = await invokeFunction(name, { body, headers: serviceHeaders() });
  if (r.status >= 400) throw new Error(`${name} respondeu ${r.status}: ${r.text.slice(0, 300)}`);
  return { status: r.status };
}

const JOBS = [
  {
    name: "processar-fila-envios",
    schedule: "*/2 * * * *",
    run: () => callFunction("processar-fila"),
  },
  {
    name: "gerar-fila-diaria",
    schedule: "0 10 * * *",
    run: () => callFunction("gerar-fila-diaria"),
  },
  {
    // Mesmo que public.trigger_easydental_sync(): pede ao worker sincronizar todas as clinicas.
    name: "easydental-daily-sync",
    schedule: "0 9 * * *",
    run: async () => {
      const url = process.env.EASYDENTAL_WORKER_URL;
      const secret = process.env.EASYDENTAL_WORKER_SECRET;
      if (!url || !secret) return { pulado: "EASYDENTAL_WORKER_URL/SECRET nao definidos" };
      const r = await fetch(`${url.replace(/\/$/, "")}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`worker respondeu ${r.status}`);
      return { status: r.status };
    },
  },
  {
    name: "reset-mensal-saldo-carteira",
    schedule: "0 0 1 * *",
    run: async () => {
      await query("SELECT public.reset_mensal_saldo()");
      return { ok: true };
    },
  },
];

export function startScheduler() {
  for (const job of JOBS) {
    cron.schedule(job.schedule, () => runOnce(job.name, job.run), { timezone: "UTC" });
  }
  console.log(`[cron] ligado: ${JOBS.map((j) => `${j.name} (${j.schedule} UTC)`).join(", ")}`);
}

export function schedulerStatus(enabled) {
  return {
    ligado: enabled,
    jobs: JOBS.map((j) => ({
      nome: j.name,
      horario_utc: j.schedule,
      rodando: running.has(j.name),
      ultima: lastRuns.get(j.name) || null,
    })),
  };
}
