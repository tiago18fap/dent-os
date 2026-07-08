import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSION_PATH = path.resolve('.chrome-session');
const DOWNLOADS_PATH = path.resolve('downloads');

if (!fs.existsSync(DOWNLOADS_PATH)) {
  fs.mkdirSync(DOWNLOADS_PATH);
}

async function main() {
  console.log('[INFO] Iniciando diagnóstico de dropdown...');
  const context = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('[INFO] Acessando projeto dentos...');
  await page.goto('https://qfjowr.easypanel.host/projects/dentos', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  
  // Localizar e clicar no botão "+ Serviço"
  const plusServiceBtn = page.locator('button, a').filter({ hasText: 'Serviço' }).first();
  if (await plusServiceBtn.isVisible()) {
    console.log('[INFO] Encontrado "+ Serviço". Clicando...');
    await plusServiceBtn.click();
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'diagnose_dropdown.png') });
    console.log('[INFO] Print do dropdown salvo em downloads/diagnose_dropdown.png');
    
    // Dump de todos os botões e links visíveis
    const elements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a, div[role="button"], li, span'))
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.innerText?.trim() || '',
          role: el.getAttribute('role') || '',
          className: el.className || ''
        }))
        .filter(item => item.text.length > 0 && item.text.length < 50);
    });
    
    console.log('--- ELEMENTOS VISÍVEIS ---');
    console.log(JSON.stringify(elements, null, 2));
    console.log('--------------------------');
  } else {
    console.log('[WARN] Botão "+ Serviço" não encontrado.');
  }

  await context.close();
}

main().catch(console.error);
