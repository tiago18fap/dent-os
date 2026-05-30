/**
 * Download REAL do Easy Dental Cloud
 * 1. Pacientes - Dados completos  
 * 2. Procedimentos finalizados (últimos 5 anos)
 */
import { chromium } from 'playwright';
import fs from 'fs';

const SUPABASE_URL = 'https://dzbeorfkualalocrvobe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6YmVvcmZrdWFsYWxvY3J2b2JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjYyMjIxNSwiZXhwIjoyMDgyMTk4MjE1fQ.EtxdNtddWDFNu_k2pvcmqn72UB8YWAyIKcvLNkcEHog';

function log(msg) {
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`[${ts}] ${msg}`);
}

async function exportarCategoria(page, context, nomeCategoria, nomeArquivo) {
  log(`\n═══ Exportando: ${nomeCategoria} ═══`);
  
  // Clicar na categoria na lista da esquerda
  const row = page.locator(`.x-grid-cell-inner:has-text("${nomeCategoria}")`).first();
  if (!(await row.isVisible().catch(() => false))) {
    // Tentar scroll
    const grid = page.locator('.x-grid-view').first();
    await grid.evaluate(el => el.scrollTop = 0);
    await page.waitForTimeout(500);
  }
  await row.click();
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: `downloads/${nomeArquivo}-selecionado.png`, fullPage: true });

  // Verificar campos disponíveis à direita e selecionar todos
  log('  Selecionando todos os campos...');
  
  // Tentar clicar no header checkbox (selecionar todos)
  const headerCheck = page.locator('.x-column-header-checkbox, .x-grid-hd-checker').first();
  if (await headerCheck.isVisible().catch(() => false)) {
    await headerCheck.click();
    await page.waitForTimeout(500);
    log('  ✓ Header checkbox marcado');
  } else {
    // Selecionar todos via checkboxes individuais na grid da direita
    // Em ExtJS, os checkboxes da grid estão nas cells
    const checks = page.locator('.x-grid-checkcolumn');
    const count = await checks.count();
    if (count > 0) {
      log(`  Marcando ${count} campos...`);
      for (let i = 0; i < count; i++) {
        const c = checks.nth(i);
        if (await c.isVisible().catch(() => false)) {
          const isChecked = await c.evaluate(el => el.classList.contains('x-grid-checkcolumn-checked'));
          if (!isChecked) {
            await c.click();
            await page.waitForTimeout(50);
          }
        }
      }
    } else {
      log('  Nenhum checkbox encontrado - usando campos padrão');
    }
  }
  
  await page.waitForTimeout(1000);

  // Clicar em "Visualizar" 
  log('  Clicando Visualizar...');
  const vizBtn = page.getByText('Visualizar', { exact: true }).first();
  await vizBtn.click();
  await page.waitForTimeout(8000);
  
  // Checar total de registros
  const totalLabel = await page.locator('label:has-text("Total de registros")').first().textContent().catch(() => 'N/A');
  log(`  ${totalLabel}`);
  
  await page.screenshot({ path: `downloads/${nomeArquivo}-visualizado.png`, fullPage: true });

  // Clicar em "Exportar"
  log('  Clicando Exportar...');
  const expBtn = page.getByText('Exportar', { exact: true }).first();
  
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }).catch(e => {
      log(`  ⚠ Download event timeout: ${e.message}`);
      return null;
    }),
    expBtn.click(),
  ]);

  if (download) {
    const filePath = `downloads/${nomeArquivo}-${new Date().toISOString().slice(0,10)}.csv`;
    await download.saveAs(filePath);
    const stats = fs.statSync(filePath);
    log(`  ✅ Arquivo baixado: ${filePath} (${(stats.size / 1024).toFixed(1)} KB)`);
    
    // Mostrar primeiras linhas
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    log(`  Linhas: ${lines.length}`);
    log(`  Header: ${lines[0].substring(0, 200)}`);
    if (lines.length > 1) log(`  Linha 1: ${lines[1].substring(0, 200)}`);
    return filePath;
  } else {
    // Verificar se abriu dialog/popup
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `downloads/${nomeArquivo}-pos-exportar.png`, fullPage: true });
    
    // Pode ser que gerou um dialog de formato
    const dialog = page.locator('.x-window:visible, .x-message-box:visible').first();
    if (await dialog.isVisible().catch(() => false)) {
      const dialogText = await dialog.textContent().catch(() => '');
      log(`  Dialog detectado: ${dialogText.substring(0, 200)}`);
      await page.screenshot({ path: `downloads/${nomeArquivo}-dialog.png`, fullPage: true });
      
      // Tentar clicar OK/Sim no dialog
      const okBtn = dialog.locator('text=OK, text=Sim, text=Exportar, text=CSV').first();
      if (await okBtn.isVisible().catch(() => false)) {
        const [download2] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
          okBtn.click(),
        ]);
        if (download2) {
          const filePath = `downloads/${nomeArquivo}-${new Date().toISOString().slice(0,10)}.csv`;
          await download2.saveAs(filePath);
          log(`  ✅ Arquivo baixado (após dialog): ${filePath}`);
          return filePath;
        }
      }
    }
    
    log('  ❌ Não conseguiu capturar o download');
    return null;
  }
}

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/whatsapp_config?select=easydental_usuario,easydental_senha&easydental_usuario=not.is.null&easydental_senha=not.is.null&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const [cred] = await res.json();
  if (!fs.existsSync('downloads')) fs.mkdirSync('downloads');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    // Login
    log('Fazendo login...');
    await page.goto('https://app.easydentalcloud.com.br/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('input[name="tx_login"]').waitFor({ state: 'visible', timeout: 45000 });
    await page.locator('input[name="tx_login"]').fill(cred.easydental_usuario);
    await page.locator('input[name="tx_senha"]').fill(cred.easydental_senha);
    await page.locator('a.easy_login_btn_login').first().click();
    await page.waitForTimeout(6000);
    log('Login OK!\n');

    // Abrir Exportação de dados
    await page.locator('#pnFerramentas').click();
    await page.waitForTimeout(2000);
    await page.locator('#miExportarDados-itemEl').click();
    await page.waitForTimeout(4000);

    // 1. EXPORTAR PACIENTES
    const f1 = await exportarCategoria(page, context, 'Pacientes - Dados completos', 'pacientes');
    
    // 2. EXPORTAR PROCEDIMENTOS
    const f2 = await exportarCategoria(page, context, 'Procedimentos finalizados', 'procedimentos');

    log('\n═══════════════════════════════════════');
    log(`  Pacientes: ${f1 || 'FALHOU'}`);
    log(`  Procedimentos: ${f2 || 'FALHOU'}`);
    log('═══════════════════════════════════════');

  } catch (err) {
    log(`ERRO FATAL: ${err.message}`);
    await page.screenshot({ path: 'downloads/erro-final.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
