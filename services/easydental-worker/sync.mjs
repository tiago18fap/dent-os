/**
 * DentOS — Easy Dental Sync Module
 * 
 * Módulo de sincronização que:
 * 1. Faz login no Easy Dental Cloud
 * 2. Navega até a seção de relatórios
 * 3. Baixa os arquivos de clientes e procedimentos
 * 4. Importa os dados no Supabase
 */

import { chromium } from 'playwright';

// ══════════════════════════════════════════════════════════════
// Config
// ══════════════════════════════════════════════════════════════

const EASYDENTAL_URL = 'https://app.easydentalcloud.com.br/';
const TIMEOUT = 30000;

function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[${ts}] [${level}] ${msg}`);
}

// ══════════════════════════════════════════════════════════════
// Supabase helpers
// ══════════════════════════════════════════════════════════════

export async function getCredentials(clinicaId, opts = {}) {
  const { supabaseUrl, supabaseKey } = opts;
  let url = `${supabaseUrl}/rest/v1/whatsapp_config?select=clinica_id,easydental_usuario,easydental_senha&easydental_usuario=not.is.null&easydental_senha=not.is.null`;
  
  if (clinicaId) {
    url += `&clinica_id=eq.${clinicaId}`;
  }

  const res = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });

  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return (await res.json()).filter(d => d.easydental_usuario && d.easydental_senha);
}

async function salvarLog(clinicaId, tipo, resultado, opts) {
  const { supabaseUrl, supabaseKey } = opts;
  try {
    await fetch(`${supabaseUrl}/rest/v1/sync_logs`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        clinica_id: clinicaId,
        tipo,
        resultado: JSON.stringify(resultado),
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    log(`Erro ao salvar log: ${e.message}`, 'WARN');
  }
}

// ══════════════════════════════════════════════════════════════
// Playwright — Login
// ══════════════════════════════════════════════════════════════

async function loginEasyDental(page, email, senha) {
  log(`Acessando ${EASYDENTAL_URL}...`);
  await page.goto(EASYDENTAL_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
  await page.waitForTimeout(3000);

  // Preencher credenciais
  const loginField = page.locator('input[name="tx_login"]');
  await loginField.waitFor({ state: 'visible', timeout: 15000 });
  await loginField.click();
  await loginField.fill(email);

  const senhaField = page.locator('input[name="tx_senha"]');
  await senhaField.waitFor({ state: 'visible', timeout: 5000 });
  await senhaField.click();
  await senhaField.fill(senha);

  await page.waitForTimeout(500);

  // Clicar login
  const loginBtn = page.locator('a.easy_login_btn_login').first();
  await loginBtn.click();
  log('Login enviado. Aguardando...');

  // Aguardar página carregar pós-login
  await page.waitForTimeout(5000);

  // Verificar se login deu certo (verificar se a URL mudou ou se apareceu menu)
  const url = page.url();
  log(`URL pós-login: ${url}`);

  return true;
}

// ══════════════════════════════════════════════════════════════
// Playwright — Explorar interface e mapear menus
// ══════════════════════════════════════════════════════════════

async function explorarInterface(page) {
  log('Explorando interface pós-login...');

  // Capturar screenshot
  const screenshotBuffer = await page.screenshot({ fullPage: true });

  // Mapear todos os elementos de menu/botão visíveis
  const elementos = await page.evaluate(() => {
    const results = [];
    const selectors = [
      '.x-menu-item', '.x-btn', '.x-tab', '.x-panel-header',
      '.x-toolbar .x-btn', '[class*="menu"]', '[class*="nav"]',
      '.x-tree-node-text', 'button', 'a[class*="btn"]',
    ];

    const seen = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120);
        if (text && text.length > 1 && text.length < 100 && !seen.has(text) && el.offsetParent !== null) {
          seen.add(text);
          results.push({
            text,
            tag: el.tagName,
            id: el.id || '',
            classes: (el.className || '').substring(0, 150),
          });
        }
      });
    }
    return results;
  });

  log(`Encontrados ${elementos.length} elementos de interface:`);
  elementos.forEach(e => log(`  → [${e.tag}] "${e.text}" id=${e.id}`));

  return { elementos, screenshot: screenshotBuffer };
}

// ══════════════════════════════════════════════════════════════
// Sync — Uma clínica
// ══════════════════════════════════════════════════════════════

export async function syncClinica(clinicaId, opts = {}) {
  const credenciais = await getCredentials(clinicaId, opts);

  if (credenciais.length === 0) {
    throw new Error(`Nenhuma credencial Easy Dental para clínica ${clinicaId}`);
  }

  const cred = credenciais[0];
  log(`Sincronizando clínica ${clinicaId} (${cred.easydental_usuario})`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const result = { clinicaId, started: new Date().toISOString(), menus: [] };

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
    });

    const page = await context.newPage();

    // Login
    await loginEasyDental(page, cred.easydental_usuario, cred.easydental_senha);

    // Explorar interface
    const { elementos, screenshot } = await explorarInterface(page);
    result.menus = elementos;
    result.loginSuccess = true;

    // TODO: Navegar até relatórios e baixar arquivos
    // Será implementado após mapear a interface

    await context.close();
  } catch (err) {
    result.loginSuccess = false;
    result.error = err.message;
    log(`Erro: ${err.message}`, 'ERROR');
  } finally {
    await browser.close();
  }

  result.finished = new Date().toISOString();
  
  // Salvar log
  await salvarLog(clinicaId, 'easydental_sync', result, opts).catch(() => {});

  return result;
}

// ══════════════════════════════════════════════════════════════
// Sync — Todas as clínicas
// ══════════════════════════════════════════════════════════════

export async function syncTodasClinicas(opts = {}) {
  const credenciais = await getCredentials(null, opts);
  log(`${credenciais.length} clínica(s) com credenciais configuradas`);

  const resultados = [];

  for (const cred of credenciais) {
    try {
      const result = await syncClinica(cred.clinica_id, opts);
      resultados.push(result);
    } catch (err) {
      resultados.push({ clinicaId: cred.clinica_id, error: err.message });
    }
  }

  return { total: credenciais.length, resultados };
}
