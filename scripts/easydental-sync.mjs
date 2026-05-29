/**
 * DentOS — Importação automática Easy Dental → Supabase
 * 
 * Faz download do Easy Dental e importa nas tabelas:
 * - clientes (paciente, telefone, codigo, nascimento, situacao, prestador, clinica_id)
 * - procedimentos (procedimento, data_finalizacao, data_completa, codigo_atendimento, 
 *                   codigo_procedimento_ref, regiao, face, nome_paciente, idchave, prestador, clinica_id)
 * 
 * ISOLAMENTO: Tudo é filtrado pelo clinica_id do usuário que tem credenciais configuradas.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Tentar carregar xlsx de diferentes locais
let XLSX;
try { XLSX = require('xlsx'); } catch {
  try { XLSX = require('c:/Users/tiago/Documents/DentOS/node_modules/xlsx'); } catch {
    console.error('xlsx não encontrado. Instale com: npm install xlsx');
    process.exit(1);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dzbeorfkualalocrvobe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6YmVvcmZrdWFsYWxvY3J2b2JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjYyMjIxNSwiZXhwIjoyMDgyMTk4MjE1fQ.EtxdNtddWDFNu_k2pvcmqn72UB8YWAyIKcvLNkcEHog';

function log(msg, level = 'INFO') {
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[${ts}] [${level}] ${msg}`);
}

// ══════════════════════════════════════════════════════════════
// Supabase helpers
// ══════════════════════════════════════════════════════════════

async function supabaseRequest(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=minimal,resolution=merge-duplicates' : undefined,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok && method !== 'DELETE') {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${text}`);
  }
  if (method === 'GET') return res.json();
  return res;
}

async function getCredentials() {
  // Busca credenciais + campos necessários para alertas de sync
  return supabaseRequest('whatsapp_config?select=clinica_id,easydental_usuario,easydental_senha,redirecionar_numero,ultima_sync_sucesso,alerta_sync_enviado&easydental_usuario=not.is.null&easydental_senha=not.is.null');
}

// ══════════════════════════════════════════════════════════════
// Logging e Alertas de Sincronização
// ══════════════════════════════════════════════════════════════

/**
 * Salva um registro de log da sincronização na tabela sync_logs
 */
async function salvarLogSync(clinicaId, status, pacientesCount, procedimentosCount, erroMsg, duracaoSeg) {
  try {
    await supabaseRequest('sync_logs', 'POST', {
      clinica_id: clinicaId,
      tipo: 'easydental',
      status,
      pacientes_importados: pacientesCount,
      procedimentos_importados: procedimentosCount,
      erro_mensagem: erroMsg || null,
      duracao_segundos: duracaoSeg,
    });
    log(`  📝 Log de sync salvo (status: ${status})`);
  } catch (err) {
    log(`  ⚠️ Falha ao salvar log de sync: ${err.message}`, 'WARN');
  }
}

/**
 * Atualiza ultima_sync_sucesso e reseta alerta quando sync é bem-sucedida
 */
async function atualizarUltimaSyncSucesso(clinicaId) {
  try {
    await supabaseRequest(
      `whatsapp_config?clinica_id=eq.${clinicaId}`,
      'PATCH',
      { ultima_sync_sucesso: new Date().toISOString(), alerta_sync_enviado: false }
    );
    log(`  🕐 ultima_sync_sucesso atualizada`);
  } catch (err) {
    log(`  ⚠️ Falha ao atualizar ultima_sync_sucesso: ${err.message}`, 'WARN');
  }
}

/**
 * Envia mensagem WhatsApp via Evolution API
 */
async function enviarWhatsApp(clinicaId, telefone, mensagem) {
  const EVO_URL = process.env.EVO_URL || 'https://evo.dentos.app.br';
  const EVO_KEY = process.env.EVO_KEY || 'B0A415B7C60E-4332-B6B3-11BB1B060735';

  // Limpar telefone — remover caracteres não-numéricos
  const numeroLimpo = String(telefone).replace(/\D/g, '');
  const numeroCompleto = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`;

  const res = await fetch(`${EVO_URL}/message/sendText/${clinicaId}`, {
    method: 'POST',
    headers: {
      'apikey': EVO_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number: numeroCompleto,
      text: mensagem,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Evolution API ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Verifica se a sync está parada há 7+ dias e envia alerta WhatsApp
 */
async function verificarEEnviarAlertaSync(cred) {
  const { clinica_id, redirecionar_numero, ultima_sync_sucesso, alerta_sync_enviado } = cred;

  // Se o alerta já foi enviado, não repetir
  if (alerta_sync_enviado) {
    log(`  ℹ️ Alerta de sync já enviado anteriormente para clínica ${clinica_id}`);
    return;
  }

  // Se não tem número de atendimento configurado, não enviar
  if (!redirecionar_numero) {
    log(`  ℹ️ Sem redirecionar_numero configurado para clínica ${clinica_id}`);
    return;
  }

  // Calcular dias sem sync com sucesso
  let diasSemSync = null;
  if (!ultima_sync_sucesso) {
    diasSemSync = 999; // Nunca sincronizou
  } else {
    const ultimaSync = new Date(ultima_sync_sucesso);
    const agora = new Date();
    diasSemSync = Math.floor((agora - ultimaSync) / (1000 * 60 * 60 * 24));
  }

  // Verificar se passou 7+ dias
  if (diasSemSync >= 7) {
    log(`  🔴 Sync parada há ${diasSemSync === 999 ? 'muito tempo (nunca sincronizou)' : diasSemSync + ' dias'} — enviando alerta...`);

    const diasTexto = diasSemSync === 999 ? 'muito tempo' : `${diasSemSync} dias`;
    const mensagem = `🔴 *Alerta DentOS*\n\nA integração com o Easy Dental está parada há ${diasTexto}.\n\nPor favor, verifique as credenciais de acesso em Configurações → Sistema.\n\nSe a clínica está em férias ou obras, desconsidere este aviso.`;

    try {
      await enviarWhatsApp(clinica_id, redirecionar_numero, mensagem);
      log(`  ✅ Alerta WhatsApp enviado para ${redirecionar_numero}`);

      // Marcar alerta como enviado para não repetir
      await supabaseRequest(
        `whatsapp_config?clinica_id=eq.${clinica_id}`,
        'PATCH',
        { alerta_sync_enviado: true }
      );
    } catch (err) {
      log(`  ⚠️ Falha ao enviar alerta WhatsApp: ${err.message}`, 'WARN');
    }
  } else {
    log(`  ✅ Última sync com sucesso há ${diasSemSync} dia(s) — sem necessidade de alerta`);
  }
}

// ══════════════════════════════════════════════════════════════
// Easy Dental — Login + Download
// ══════════════════════════════════════════════════════════════

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
    // Login
    log('Fazendo login no Easy Dental...');
    await page.goto('https://app.easydentalcloud.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('input[name="tx_login"]').waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('input[name="tx_login"]').fill(email);
    await page.locator('input[name="tx_senha"]').fill(senha);
    await page.locator('a.easy_login_btn_login').first().click();
    await page.waitForTimeout(6000);
    log('Login OK!');

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

async function exportarCategoria(page, nomeCategoria, filePath) {
  log(`Exportando: ${nomeCategoria}...`);

  // Selecionar categoria
  await page.locator(`.x-grid-cell-inner:has-text("${nomeCategoria}")`).first().click();
  await page.waitForTimeout(2000);

  // Selecionar todos os campos (header checkbox)
  const headerCheck = page.locator('.x-column-header-checkbox, .x-grid-hd-checker').first();
  if (await headerCheck.isVisible().catch(() => false)) {
    await headerCheck.click();
    await page.waitForTimeout(500);
  }

  // Visualizar
  await page.getByText('Visualizar', { exact: true }).first().click();
  await page.waitForTimeout(8000);

  // Exportar
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

// ══════════════════════════════════════════════════════════════
// Mapeamento Easy Dental → Supabase
// ══════════════════════════════════════════════════════════════

function parseDate(dateStr) {
  if (!dateStr) return null;
  // Formato: "dd/mm/yyyy" ou "dd/mm/yyyy HH:MM"
  const parts = String(dateStr).split(' ')[0].split('/');
  if (parts.length === 3) {
    const [dia, mes, ano] = parts;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return null;
}

function mapearPacientes(rawData, clinicaId) {
  return rawData.map(row => ({
    paciente: (row['Nome do paciente'] || '').trim().toUpperCase(),
    telefone: row['Telefone cel - Completo'] || row['Telefone fixo - Completo'] || null,
    codigo: row['Código formatado'] || String(row['Código'] || '').padStart(6, '0'),
    nascimento: parseDate(row['Data de nascimento']),
    situacao: row['Situação'] || 'Ativo',
    prestador: row['Profissional responsável'] || null,
    clinica_id: clinicaId,
  })).filter(p => p.paciente); // Remove linhas sem nome
}

function mapearProcedimentos(rawData, clinicaId) {
  return rawData.map(row => ({
    procedimento: (row['Nome do procedimento'] || '').trim().toUpperCase(),
    data_finalizacao: row['Dt finalização'] || null,
    data_completa: row['Data/hora de criação'] ? `${row['Data/hora de criação']} - ${row['Usuário que criou'] || ''}` : null,
    codigo_atendimento: row['Cód do tratamento'] || null,
    codigo_procedimento_ref: row['Cód do procedimento'] || null,
    regiao: row['Região'] || null,
    face: null, // Easy Dental não exporta face separada
    nome_paciente: (row['Nome do paciente'] || '').trim().toUpperCase(),
    idchave: row['Cód do paciente'] || null,
    prestador: row['Nome do executante'] || null,
    clinica_id: clinicaId,
  })).filter(p => p.procedimento); // Remove linhas sem procedimento
}

// ══════════════════════════════════════════════════════════════
// Importação no Supabase (com limpeza prévia por clinica_id)
// ══════════════════════════════════════════════════════════════

async function importarDados(clinicaId, pacientes, procedimentos) {
  log(`\nImportando dados para clínica ${clinicaId}...`);

  // 1. CLIENTES — Limpar existentes desta clínica e inserir novos
  if (pacientes && pacientes.length > 0) {
    log(`  Removendo clientes antigos da clínica ${clinicaId}...`);
    await supabaseRequest(`clientes?clinica_id=eq.${clinicaId}`, 'DELETE');

    log(`  Inserindo ${pacientes.length} pacientes...`);
    // Inserir em lotes de 500
    for (let i = 0; i < pacientes.length; i += 500) {
      const batch = pacientes.slice(i, i + 500);
      await supabaseRequest('clientes', 'POST', batch);
      log(`    Lote ${Math.floor(i / 500) + 1}: ${batch.length} inseridos`);
    }
    log(`  ✅ ${pacientes.length} pacientes importados`);
  }

  // 2. PROCEDIMENTOS — Limpar e inserir
  if (procedimentos && procedimentos.length > 0) {
    log(`  Removendo procedimentos antigos da clínica ${clinicaId}...`);
    await supabaseRequest(`procedimentos?clinica_id=eq.${clinicaId}`, 'DELETE');

    log(`  Inserindo ${procedimentos.length} procedimentos...`);
    for (let i = 0; i < procedimentos.length; i += 500) {
      const batch = procedimentos.slice(i, i + 500);
      await supabaseRequest('procedimentos', 'POST', batch);
      log(`    Lote ${Math.floor(i / 500) + 1}: ${batch.length} inseridos`);
    }
    log(`  ✅ ${procedimentos.length} procedimentos importados`);
  }
}

// ══════════════════════════════════════════════════════════════
// Main — Sincronização completa
// ══════════════════════════════════════════════════════════════

async function main() {
  log('═══════════════════════════════════════════════');
  log('  DentOS — Sincronização Easy Dental → Supabase');
  log('═══════════════════════════════════════════════');

  // 1. Buscar credenciais
  const credenciais = await getCredentials();
  if (credenciais.length === 0) {
    log('Nenhuma clínica com credenciais Easy Dental configuradas.', 'WARN');
    return;
  }
  log(`${credenciais.length} clínica(s) com credenciais configuradas.`);

  // 2. Processar cada clínica (ISOLAMENTO por clinica_id)
  for (const cred of credenciais) {
    const { clinica_id, easydental_usuario, easydental_senha } = cred;
    log(`\n════ Clínica: ${clinica_id} (${easydental_usuario}) ════`);

    // Controle de tempo e contagem para logging
    const inicio = Date.now();
    let pacientesCount = 0;
    let procedimentosCount = 0;
    let syncStatus = 'erro';
    let erroMsg = null;

    try {
      // 3. Download do Easy Dental
      const { pacientes: rawPac, procedimentos: rawProc } = await downloadFromEasyDental(easydental_usuario, easydental_senha);

      // 4. Mapear dados
      const pacientesMapped = rawPac ? mapearPacientes(rawPac, clinica_id) : [];
      const procedimentosMapped = rawProc ? mapearProcedimentos(rawProc, clinica_id) : [];

      pacientesCount = pacientesMapped.length;
      procedimentosCount = procedimentosMapped.length;

      log(`\nMapeamento concluído:`);
      log(`  Pacientes: ${pacientesCount}`);
      log(`  Procedimentos: ${procedimentosCount}`);

      // 5. Importar no Supabase (SOMENTE para esta clinica_id)
      await importarDados(clinica_id, pacientesMapped, procedimentosMapped);

      // Definir status: 'parcial' se faltou uma das categorias, 'sucesso' se ambas OK
      if ((!rawPac || pacientesCount === 0) && procedimentosCount > 0) {
        syncStatus = 'parcial';
        erroMsg = 'Pacientes não foram importados';
      } else if (pacientesCount > 0 && (!rawProc || procedimentosCount === 0)) {
        syncStatus = 'parcial';
        erroMsg = 'Procedimentos não foram importados';
      } else if (pacientesCount === 0 && procedimentosCount === 0) {
        syncStatus = 'parcial';
        erroMsg = 'Nenhum dado importado';
      } else {
        syncStatus = 'sucesso';
      }

      log(`\n✅ Clínica ${clinica_id} sincronizada com sucesso!`);
    } catch (err) {
      syncStatus = 'erro';
      erroMsg = err.message;
      log(`❌ Erro na clínica ${clinica_id}: ${err.message}`, 'ERROR');
    }

    // Calcular duração em segundos
    const duracaoSeg = Math.round((Date.now() - inicio) / 1000);

    // 6. Salvar log da sincronização
    await salvarLogSync(clinica_id, syncStatus, pacientesCount, procedimentosCount, erroMsg, duracaoSeg);

    // 7. Se sync foi sucesso ou parcial, atualizar ultima_sync_sucesso
    if (syncStatus === 'sucesso') {
      await atualizarUltimaSyncSucesso(clinica_id);
      // Atualizar o objeto cred com o novo valor para a verificação de alerta
      cred.ultima_sync_sucesso = new Date().toISOString();
      cred.alerta_sync_enviado = false;
    }

    // 8. Verificar se precisa enviar alerta de sync parada
    await verificarEEnviarAlertaSync(cred);
  }

  log('\n═══════════════════════════════════════════════');
  log('  Sincronização completa!');
  log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
