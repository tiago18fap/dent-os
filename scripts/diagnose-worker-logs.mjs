import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');
const DOWNLOADS_PATH = path.resolve('downloads');

if (!fs.existsSync(DOWNLOADS_PATH)) {
  fs.mkdirSync(DOWNLOADS_PATH);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  const screenshotPath = path.join(DOWNLOADS_PATH, `${name}.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(`[PRINT] Screenshot salvo em: downloads/${name}.png`);
}

async function handleNotFoundRecovery(page) {
  const hasNotFound = await page.getByText(/Not Found|Invariant failed/i).first().isVisible().catch(() => false);
  if (hasNotFound) {
    console.log('[WARN] Detectado erro "Not Found" ou "Invariant failed". Recarregando...');
    await sleep(3000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(4000);
    return true;
  }
  return false;
}

async function main() {
  console.log('[INFO] Iniciando verificação final dos logs do Worker...');
  
  let context;
  try {
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  try {
    // Acessar a página de Visão Geral do worker
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/easydental-worker', { waitUntil: 'domcontentloaded' });
    await sleep(6000); // Dar tempo para os logs em tempo real carregarem
    await handleNotFoundRecovery(page);
    
    // Clicar em "Atualizar" ou recarregar logs se necessário
    // No print anterior, havia um ícone de recarregar logs no canto superior direito do console de logs.
    // Vamos tirar o print para análise
    await takeScreenshot(page, 'diagnose_worker_new_logs');

    const logsContainer = page.locator('.bg-black, pre, code, [class*="console"], [class*="log"]').first();
    if (await logsContainer.isVisible().catch(() => false)) {
      const logsText = await logsContainer.innerText();
      console.log('--- LOGS DO WORKER EM EXECUÇÃO ---');
      console.log(logsText);
      console.log('----------------------------------');
      
      if (logsText.includes('Agendador diário') || logsText.includes('agendador')) {
        console.log('[SUCCESS] Confirmado! O agendador diário interno está ativo e rodando no container!');
      } else {
        console.log('[WARN] Log do agendador não foi detectado no console de logs inicial.');
      }
    } else {
      console.log('[WARN] Container de logs não detectado ou invisível.');
    }

    console.log('[INFO] Mantendo o navegador aberto na tela de Visão Geral por 10 horas...');
    await sleep(36000000); // 10 horas

  } catch (err) {
    console.error('[ERRO LOGS DIAGNÓSTICO]', err);
    try {
      if (page) {
        await takeScreenshot(page, 'logs_error_debug');
      }
    } catch (e) {
      console.log('[WARN] Não foi possível salvar o print de erro:', e.message);
    }
    console.log('[INFO] Mantendo o navegador aberto para depuração indefinidamente...');
    await sleep(36000000); // 10 horas
  }
}

main().catch(console.error);
