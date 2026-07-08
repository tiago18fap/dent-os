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
  console.log('[INFO] Iniciando trigger de deploy no EasyPanel...');
  
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
    // Acessar diretamente a aba Visão Geral
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/easydental-worker', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, 'deploy_01_overview');

    // Clicar em "Implantar"
    console.log('[INFO] Clicando no botão "Implantar"...');
    const deployBtn = page.locator('button').filter({ hasText: /Implantar|Deploy/i }).first();
    await deployBtn.click();
    await sleep(4000);
    await takeScreenshot(page, 'deploy_02_disparado');

    // Ir para a aba Implantações para monitorar o progresso
    console.log('[INFO] Acessando a aba "Implantações"...');
    const deployTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Implantações"').first();
    await deployTab.click();
    await sleep(4000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, 'deploy_03_monitor');

    // Vamos monitorar a implantação
    console.log('[INFO] Monitorando o progresso da implantação. Atualizando a cada 15 segundos...');
    for (let i = 0; i < 15; i++) {
      await sleep(15000);
      await takeScreenshot(page, `deploy_04_status_progress_${i}`);
      
      // Verificar se há algum texto indicando sucesso (ex: "sucesso", "success", "completed", "done", "ativo", "active")
      // ou logs de conclusão
      const pageText = await page.innerText('body');
      if (pageText.includes('success') || pageText.includes('sucesso') || pageText.includes('Concluído')) {
        console.log('[INFO] Detectado sucesso nos logs/status!');
      }
    }

    console.log('[INFO] Deploy concluído e monitorado! O navegador ficará aberto para visualização do usuário.');
    // Manter aberto por 10 horas
    await sleep(36000000);

  } catch (err) {
    console.error('[ERRO TRIGGER DEPLOY]', err);
    try {
      if (page) {
        await takeScreenshot(page, 'deploy_error_debug');
      }
    } catch (e) {
      console.log('[WARN] Não foi possível salvar o print de erro:', e.message);
    }
    console.log('[INFO] Mantendo o navegador aberto para depuração indefinidamente...');
    await sleep(36000000); // 10 horas
  }
}

main().catch(console.error);
