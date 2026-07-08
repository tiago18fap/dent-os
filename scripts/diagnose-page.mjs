import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSION_PATH = path.resolve('.chrome-session');
const DOWNLOADS_PATH = path.resolve('downloads');

if (!fs.existsSync(DOWNLOADS_PATH)) {
  fs.mkdirSync(DOWNLOADS_PATH);
}

async function main() {
  console.log('[INFO] Iniciando diagnóstico de página (Headed)...');
  const context = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('[INFO] Acessando projeto dentos...');
  await page.goto('https://qfjowr.easypanel.host/projects/dentos', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  const currentUrl = page.url();
  console.log(`[INFO] URL atual após navegação: ${currentUrl}`);
  
  await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'diagnose_page.png') });
  console.log('[INFO] Print da página salvo em downloads/diagnose_page.png');
  
  const pageText = await page.locator('body').innerText().catch(() => '');
  console.log('--- TEXTO DA PÁGINA ---');
  console.log(pageText.slice(0, 1000));
  console.log('-----------------------');

  await context.close();
}

main().catch(console.error);
