/**
 * DentOS — Easy Dental Worker Server
 * 
 * Servidor HTTP profissional que expõe endpoints para:
 * - POST /sync          → Executa sincronização de todas as clínicas
 * - POST /sync/:id      → Executa sincronização de uma clínica específica
 * - GET  /health        → Health check
 * - GET  /status        → Status da última execução
 * 
 * Protegido por token de autenticação via header Authorization.
 */

import http from 'node:http';
import { syncClinica, syncTodasClinicas, getCredentials } from './sync.mjs';

// ══════════════════════════════════════════════════════════════
// Config
// ══════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.PORT || '3000', 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dentos-worker-secret-2026';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dzbeorfkualalocrvobe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Estado
let lastSync = null;
let syncing = false;

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[${ts}] [${level}] ${msg}`);
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function authenticate(req) {
  const auth = req.headers['authorization'] || '';
  return auth === `Bearer ${AUTH_TOKEN}`;
}

// ══════════════════════════════════════════════════════════════
// Routes
// ══════════════════════════════════════════════════════════════

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check (público)
  if (path === '/health' && method === 'GET') {
    return json(res, 200, { 
      status: 'ok', 
      service: 'dentos-easydental-worker',
      uptime: process.uptime(),
      syncing,
    });
  }

  // Status (público)
  if (path === '/status' && method === 'GET') {
    return json(res, 200, { 
      lastSync,
      syncing,
    });
  }

  // Autenticação para endpoints de sync
  if (!authenticate(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  // POST /sync — sincronizar (aceita clinica_id opcional no body)
  if (path === '/sync' && method === 'POST') {
    if (syncing) {
      return json(res, 409, { error: 'Sincronização já em andamento' });
    }

    const body = await parseBody(req);
    const targetClinicaId = body.clinica_id;

    if (targetClinicaId) {
      // Sincronizar clínica específica (síncrono — aguarda resultado)
      syncing = true;
      try {
        const result = await syncClinica(targetClinicaId, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
        lastSync = { finishedAt: new Date().toISOString(), success: true, clinicaId: targetClinicaId, ...result };
        log(`Sincronização clínica ${targetClinicaId} completa`);
        return json(res, 200, { status: 'sucesso', ...result });
      } catch (err) {
        lastSync = { finishedAt: new Date().toISOString(), success: false, clinicaId: targetClinicaId, error: err.message };
        log(`Erro na sincronização clínica ${targetClinicaId}: ${err.message}`, 'ERROR');
        return json(res, 500, { status: 'erro', error: err.message });
      } finally {
        syncing = false;
      }
    }

    // Sem clinica_id: sincronizar todas (assíncrono)
    json(res, 202, { message: 'Sincronização de todas as clínicas iniciada', startedAt: new Date().toISOString() });

    syncing = true;
    try {
      const result = await syncTodasClinicas({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
      lastSync = { 
        finishedAt: new Date().toISOString(), 
        success: true, 
        ...result 
      };
      log(`Sincronização completa: ${JSON.stringify(result)}`);
    } catch (err) {
      lastSync = { 
        finishedAt: new Date().toISOString(), 
        success: false, 
        error: err.message 
      };
      log(`Erro na sincronização: ${err.message}`, 'ERROR');
    } finally {
      syncing = false;
    }
    return;
  }

  // POST /sync/:clinicaId — sincronizar uma clínica específica
  const syncMatch = path.match(/^\/sync\/([a-f0-9-]+)$/);
  if (syncMatch && method === 'POST') {
    const clinicaId = syncMatch[1];

    if (syncing) {
      return json(res, 409, { error: 'Sincronização já em andamento' });
    }

    json(res, 202, { message: `Sincronização da clínica ${clinicaId} iniciada` });

    syncing = true;
    try {
      const result = await syncClinica(clinicaId, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
      lastSync = { finishedAt: new Date().toISOString(), success: true, clinicaId, ...result };
      log(`Sincronização clínica ${clinicaId} completa`);
    } catch (err) {
      lastSync = { finishedAt: new Date().toISOString(), success: false, clinicaId, error: err.message };
      log(`Erro na sincronização clínica ${clinicaId}: ${err.message}`, 'ERROR');
    } finally {
      syncing = false;
    }
    return;
  }

  // 404
  json(res, 404, { error: 'Not found' });
}

// ══════════════════════════════════════════════════════════════
// Agendamento Diário Interno (3:00 AM - Fuso de Brasília/São Paulo)
// ══════════════════════════════════════════════════════════════

let lastDailySyncDate = '';

function startDailyScheduler() {
  log('Agendador diário automático iniciado (executa às 03:00 AM BRT).');
  
  setInterval(async () => {
    try {
      const now = new Date();
      // Obter hora e data no fuso de São Paulo
      const spDateStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); // 'DD/MM/YYYY'
      const spTimeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }); // 'HH:MM:SS'
      const [hour, minute] = spTimeStr.split(':').map(Number);

      // Se for 3 da manhã e ainda não rodou hoje
      if (hour === 3 && minute === 0 && lastDailySyncDate !== spDateStr) {
        if (syncing) {
          log('Ignorando agendamento automático diário: outra sincronização já está ativa.', 'WARN');
          return;
        }
        log(`[SCHEDULER] Iniciando sincronização diária automática (${spDateStr} ${spTimeStr})...`);
        lastDailySyncDate = spDateStr;
        syncing = true;
        try {
          const result = await syncTodasClinicas({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
          lastSync = { 
            finishedAt: new Date().toISOString(), 
            success: true, 
            ...result 
          };
          log(`[SCHEDULER] Sincronização automática concluída com sucesso: ${JSON.stringify(result)}`);
        } catch (err) {
          lastSync = { 
            finishedAt: new Date().toISOString(), 
            success: false, 
            error: err.message 
          };
          log(`[SCHEDULER] Erro na sincronização automática: ${err.message}`, 'ERROR');
        } finally {
          syncing = false;
        }
      }
    } catch (err) {
      log(`Erro no loop do agendador automático: ${err.message}`, 'ERROR');
    }
  }, 60000); // Roda a verificação a cada 60 segundos (1 minuto)
}

// ══════════════════════════════════════════════════════════════
// Start
// ══════════════════════════════════════════════════════════════

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  log('═══════════════════════════════════════════');
  log('  DentOS — Easy Dental Worker');
  log(`  Porta: ${PORT}`);
  log(`  Token: ${AUTH_TOKEN.slice(0, 10)}...`);
  log('═══════════════════════════════════════════');
  
  // Iniciar o agendador
  startDailyScheduler();
});

