/**
 * DentOS — Easy Dental Sync Module
 * 
 * Módulo de sincronização que:
 * 1. Faz login no Easy Dental Cloud
 * 2. Navega até a seção de relatórios
 * 3. Baixa os arquivos de clientes e procedimentos
 * 4. Importa os dados no Supabase
 * 
 * Protegido e isolado por clinica_id.
 */

import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const EASYDENTAL_URL = 'https://app.easydentalcloud.com.br/';
const TIMEOUT = 45000;

function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[${ts}] [${level}] ${msg}`);
}

// ══════════════════════════════════════════════════════════════
// Supabase helpers
// ══════════════════════════════════════════════════════════════

export async function getCredentials(clinicaId, opts = {}) {
  const { supabaseUrl, supabaseKey } = opts;
  let url = `${supabaseUrl}/rest/v1/whatsapp_config?select=clinica_id,easydental_usuario,easydental_senha,redirecionar_numero,ultima_sync_sucesso,alerta_sync_enviado&easydental_usuario=not.is.null&easydental_senha=not.is.null`;
  
  if (clinicaId) {
    url += `&clinica_id=eq.${clinicaId}`;
  }

  const res = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });

  if (!res.ok) throw new Error(`Supabase error fetching credentials: ${res.status}`);
  return (await res.json()).filter(d => d.easydental_usuario && d.easydental_senha);
}

async function supabaseRequest(path, method = 'GET', body = null, opts = {}) {
  const { supabaseUrl, supabaseKey } = opts;
  const requestOpts = {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : undefined,
    },
  };
  if (body) requestOpts.body = JSON.stringify(body);
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, requestOpts);
  if (!res.ok && method !== 'DELETE') {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${text}`);
  }
  if (method === 'GET') return res.json();
  return res;
}

async function fetchAll(path, opts = {}) {
  const { supabaseUrl, supabaseKey } = opts;
  const PAGE_SIZE = 1000;
  let allData = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}${path.includes('?') ? '&' : '?'}limit=${PAGE_SIZE}&offset=${offset}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FetchAll ${path}: ${res.status} ${text}`);
    }
    const data = await res.json();
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allData;
}

async function salvarLogSync(clinicaId, status, pacientesCount, procedimentosCount, erroMsg, duracaoSeg, opts = {}) {
  try {
    await supabaseRequest('sync_logs', 'POST', {
      clinica_id: clinicaId,
      tipo: 'easydental',
      status,
      pacientes_importados: pacientesCount,
      procedimentos_importados: procedimentosCount,
      erro_mensagem: erroMsg || null,
      duracao_segundos: duracaoSeg,
    }, opts);
    log(`  📝 Log de sync salvo (status: ${status})`);
  } catch (err) {
    log(`  ⚠️ Falha ao salvar log de sync: ${err.message}`, 'WARN');
  }
}

async function atualizarUltimaSyncSucesso(clinicaId, opts = {}) {
  try {
    await supabaseRequest(
      `whatsapp_config?clinica_id=eq.${clinicaId}`,
      'PATCH',
      { ultima_sync_sucesso: new Date().toISOString(), alerta_sync_enviado: false },
      opts
    );
    log(`  🕐 ultima_sync_sucesso atualizada`);
  } catch (err) {
    log(`  ⚠️ Falha ao atualizar ultima_sync_sucesso: ${err.message}`, 'WARN');
  }
}

async function upsertBatch(table, batch, onConflict, opts = {}) {
  const { supabaseUrl, supabaseKey } = opts;
  const url = onConflict
    ? `${supabaseUrl}/rest/v1/${table}?on_conflict=${onConflict}`
    : `${supabaseUrl}/rest/v1/${table}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=headers-only,resolution=merge-duplicates',
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upsert ${table}: ${res.status} ${text}`);
  }
  return res;
}

// ══════════════════════════════════════════════════════════════
// Playwright — Login + Download
// ══════════════════════════════════════════════════════════════

async function loginEasyDental(page, email, senha) {
  log(`Acessando ${EASYDENTAL_URL}...`);
  await page.goto(EASYDENTAL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  const loginField = page.locator('input[name="tx_login"]');
  await loginField.waitFor({ state: 'visible', timeout: 15000 });
  await loginField.fill(email);

  const senhaField = page.locator('input[name="tx_senha"]');
  await senhaField.waitFor({ state: 'visible', timeout: 5000 });
  await senhaField.fill(senha);

  const loginBtn = page.locator('a.easy_login_btn_login').first();
  await loginBtn.click();
  log('Login enviado. Aguardando...');
  await page.waitForTimeout(6000);

  log(`URL pós-login: ${page.url()}`);
  return true;
}

async function exportarCategoria(page, nomeCategoria, filePath) {
  log(`Exportando: ${nomeCategoria}...`);

  await page.locator(`.x-grid-cell-inner:has-text("${nomeCategoria}")`).first().click();
  await page.waitForTimeout(2000);

  const headerCheck = page.locator('.x-column-header-checkbox, .x-grid-hd-checker').first();
  if (await headerCheck.isVisible().catch(() => false)) {
    await headerCheck.click();
    await page.waitForTimeout(500);
  }

  await page.getByText('Visualizar', { exact: true }).first().click();
  await page.waitForTimeout(8000);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }).catch(() => null),
    page.getByText('Exportar', { exact: true }).first().click(),
  ]);

  if (download) {
    await download.saveAs(filePath);
    const wb = XLSX.readFile(filePath);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    log(`  ✅ ${nomeCategoria}: ${data.length} registros baixados`);
    return data;
  }

  log(`  ❌ Download não capturado para ${nomeCategoria}`, 'WARN');
  return null;
}

async function downloadFromEasyDental(email, senha) {
  log('Iniciando Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptDownloads: true,
  });

  const page = await context.newPage();
  const results = { pacientes: null, procedimentos: null };

  try {
    await loginEasyDental(page, email, senha);

    // Abrir Exportação de dados
    await page.locator('#pnFerramentas').click();
    await page.waitForTimeout(2000);
    await page.locator('#miExportarDados-itemEl').click();
    await page.waitForTimeout(4000);

    // Exportar Pacientes
    results.pacientes = await exportarCategoria(page, 'Pacientes - Dados completos', '/tmp/pacientes.xlsx');

    // Exportar Procedimentos  
    results.procedimentos = await exportarCategoria(page, 'Procedimentos finalizados', '/tmp/procedimentos.xlsx');

  } finally {
    await browser.close();
  }

  return results;
}

// ══════════════════════════════════════════════════════════════
// Mapeamento Easy Dental → Supabase
// ══════════════════════════════════════════════════════════════

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split(' ')[0].split('/');
  if (parts.length === 3) {
    const [dia, mes, ano] = parts;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return null;
}

function normalizarTelefone(tel, dddPadrao = '11') {
  if (!tel) return null;
  let n = String(tel).replace(/\D/g, '');

  if (n.length >= 10 && n.startsWith('0')) {
    n = n.substring(1);
  }

  if (n.startsWith('55') && (n.length === 13 || n.length === 12)) {
    return n;
  }

  if (n.length === 11 && /^\d{2}9/.test(n)) {
    return '55' + n;
  }

  if (n.length === 10 && /^\d{2}[2-8]/.test(n)) {
    return '55' + n;
  }

  if (n.length === 9 && n.startsWith('9')) {
    return '55' + dddPadrao + n;
  }

  if (n.length === 8) {
    return '55' + dddPadrao + n;
  }

  return null;
}

function mapearPacientes(rawData, clinicaId) {
  return rawData.map(row => {
    const telRaw = row['Telefone cel - Completo'] || row['Telefone fixo - Completo'] || null;
    return {
      paciente: (row['Nome do paciente'] || '').trim().toUpperCase(),
      telefone: normalizarTelefone(telRaw),
      codigo: row['Código formatado'] || String(row['Código'] || '').padStart(6, '0'),
      nascimento: parseDate(row['Data de nascimento']),
      situacao: row['Situação'] || 'Ativo',
      prestador: row['Profissional responsável'] || null,
      clinica_id: clinicaId,
    };
  }).filter(p => p.paciente);
}

function mapearProcedimentos(rawData, clinicaId) {
  return rawData.map(row => ({
    procedimento: (row['Nome do procedimento'] || '').trim().toUpperCase(),
    data_finalizacao: row['Dt finalização'] || null,
    data_completa: row['Data/hora de criação'] ? `${row['Data/hora de criação']} - ${row['Usuário que criou'] || ''}` : null,
    codigo_atendimento: row['Cód do tratamento'] || null,
    codigo_procedimento_ref: row['Cód do procedimento'] || null,
    regiao: row['Região'] || null,
    face: null,
    nome_paciente: (row['Nome do paciente'] || '').trim().toUpperCase(),
    idchave: row['Cód do paciente'] || null,
    prestador: row['Nome do executante'] || null,
    clinica_id: clinicaId,
  })).filter(p => p.procedimento);
}

async function importarDados(clinicaId, pacientes, procedimentos, opts = {}) {
  log(`Importando dados no banco para clínica ${clinicaId}...`);
  const result = { pacientesNovos: 0, pacientesAtualizados: 0, procedimentos: 0 };

  if (pacientes && pacientes.length > 0) {
    const existentesRes = await fetchAll(`clientes?clinica_id=eq.${clinicaId}&select=codigo`, opts);
    const codigosExistentes = new Set(existentesRes.map(c => c.codigo));

    log(`  Clientes existentes: ${codigosExistentes.size}`);
    log(`  Clientes novos/atualizações recebidas: ${pacientes.length}`);

    for (let i = 0; i < pacientes.length; i += 500) {
      const batch = pacientes.slice(i, i + 500);
      await upsertBatch('clientes', batch, 'clinica_id,codigo', opts);
      log(`    Lote ${Math.floor(i / 500) + 1}: ${batch.length} clientes processados`);
    }

    const novos = pacientes.filter(p => !codigosExistentes.has(p.codigo));
    result.pacientesNovos = novos.length;
    result.pacientesAtualizados = pacientes.length - novos.length;
  }

  if (procedimentos && procedimentos.length > 0) {
    const seen = new Set();
    const procUnicos = procedimentos.filter(p => {
      const key = `${p.nome_paciente}|${p.procedimento}|${p.data_finalizacao}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    log(`  Removendo procedimentos antigos da clínica ${clinicaId}...`);
    await supabaseRequest(`procedimentos?clinica_id=eq.${clinicaId}`, 'DELETE', null, opts);

    log(`  Inserindo ${procUnicos.length} procedimentos únicos...`);
    for (let i = 0; i < procUnicos.length; i += 500) {
      const batch = procUnicos.slice(i, i + 500);
      await supabaseRequest('procedimentos', 'POST', batch, opts);
      log(`    Lote ${Math.floor(i / 500) + 1}: ${batch.length} procedimentos inseridos`);
    }
    result.procedimentos = procUnicos.length;
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// Sync — Uma clínica (Executado pelo worker)
// ══════════════════════════════════════════════════════════════

export async function syncClinica(clinicaId, opts = {}) {
  const credenciais = await getCredentials(clinicaId, opts);

  if (credenciais.length === 0) {
    throw new Error(`Nenhuma credencial Easy Dental configurada para a clínica ${clinicaId}`);
  }

  const cred = credenciais[0];
  const { easydental_usuario, easydental_senha } = cred;
  
  log(`Sincronização iniciada para a clínica ${clinicaId} (${easydental_usuario})`);
  const inicio = Date.now();
  
  let pacientesCount = 0;
  let procedimentosCount = 0;
  let syncStatus = 'erro';
  let erroMsg = null;
  let importResult = { pacientesNovos: 0, pacientesAtualizados: 0, procedimentos: 0 };

  try {
    // 1. Download do Easy Dental
    const { pacientes: rawPac, procedimentos: rawProc } = await downloadFromEasyDental(easydental_usuario, easydental_senha);

    // 2. Mapeamento dos dados
    const pacientesMapped = rawPac ? mapearPacientes(rawPac, clinicaId) : [];
    const procedimentosMapped = rawProc ? mapearProcedimentos(rawProc, clinicaId) : [];

    pacientesCount = pacientesMapped.length;
    procedimentosCount = procedimentosMapped.length;

    // 3. Importação no Supabase
    importResult = await importarDados(clinicaId, pacientesMapped, procedimentosMapped, opts);

    if ((!rawPac || pacientesCount === 0) && procedimentosCount > 0) {
      syncStatus = 'parcial';
      erroMsg = 'Pacientes não foram importados';
    } else if (pacientesCount > 0 && (!rawProc || procedimentosCount === 0)) {
      syncStatus = 'parcial';
      erroMsg = 'Procedimentos não foram importados';
    } else if (pacientesCount === 0 && procedimentosCount === 0) {
      syncStatus = 'parcial';
      erroMsg = 'Nenhum dado importado do Easy Dental';
    } else {
      syncStatus = 'sucesso';
    }

    log(`✅ Clínica ${clinicaId} sincronizada com sucesso!`);
  } catch (err) {
    syncStatus = 'erro';
    erroMsg = err.message;
    log(`❌ Erro ao sincronizar clínica ${clinicaId}: ${err.message}`, 'ERROR');
  }

  const duracaoSeg = Math.round((Date.now() - inicio) / 1000);

  // Salvar registro de log
  await salvarLogSync(clinicaId, syncStatus, importResult.pacientesNovos, importResult.procedimentos, erroMsg, duracaoSeg, opts).catch(() => {});

  if (syncStatus === 'sucesso') {
    await atualizarUltimaSyncSucesso(clinicaId, opts).catch(() => {});
  }

  if (syncStatus === 'erro') {
    throw new Error(erroMsg || 'Erro desconhecido na sincronização');
  }

  return {
    status: 'sucesso',
    pacientes_novos: importResult.pacientesNovos,
    pacientes_atualizados: importResult.pacientesAtualizados,
    procedimentos: importResult.procedimentos,
    duracao: duracaoSeg
  };
}

// ══════════════════════════════════════════════════════════════
// Sync — Todas as clínicas (Executado pelo cron diário)
// ══════════════════════════════════════════════════════════════

export async function syncTodasClinicas(opts = {}) {
  const credenciais = await getCredentials(null, opts);
  log(`${credenciais.length} clínica(s) identificada(s) para sincronização automática`);

  const resultados = [];

  for (const cred of credenciais) {
    try {
      const result = await syncClinica(cred.clinica_id, opts);
      resultados.push({ clinicaId: cred.clinica_id, status: 'sucesso', ...result });
    } catch (err) {
      resultados.push({ clinicaId: cred.clinica_id, status: 'erro', error: err.message });
    }
  }

  return { total: credenciais.length, resultados };
}
