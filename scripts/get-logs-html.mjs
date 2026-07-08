import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSION_PATH = path.resolve('.chrome-session');
const DOWNLOADS_PATH = path.resolve('downloads');

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
  console.log(`[INFO] Usando perfil: ${SESSION_PATH}`);
  let context = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  try {
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    const logsTab = page.locator('aside, .sidebar, [class*="sidebar"], nav').locator('text="Logs"').first();
    if (await logsTab.isVisible()) {
      await logsTab.click();
      await sleep(10000); // Esperar os logs carregarem
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'logs_view.png') });
      
      const bodyHtml = await page.evaluate(() => document.body.innerHTML);
      fs.writeFileSync(path.join(DOWNLOADS_PATH, 'logs_body.html'), bodyHtml);
      console.log('[INFO] HTML salvo em downloads/logs_body.html');
    } else {
      console.log('[WARN] Aba de logs não encontrada.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
