import { chromium } from 'playwright';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  console.log('[INFO] Iniciando trigger de deploy para o serviço "integracoes" no EasyPanel...');
  
  let context;
  try {
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    console.error('Erro ao abrir browser:', err.message);
    return;
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  try {
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    console.log('[INFO] Clicando no botão "Implantar" (Deploy)...');
    const deployBtn = page.locator('button').filter({ hasText: /Implantar|Deploy/i }).first();
    if (await deployBtn.isVisible()) {
      await deployBtn.click();
      console.log('[INFO] Redeploy do app "integracoes" disparado com sucesso!');
      await sleep(5000);
    } else {
      console.log('[WARN] Botão "Implantar" não foi localizado.');
    }
  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
