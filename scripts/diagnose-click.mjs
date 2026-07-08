import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSION_PATH = path.resolve('.chrome-session');
const DOWNLOADS_PATH = path.resolve('downloads');

if (!fs.existsSync(DOWNLOADS_PATH)) {
  fs.mkdirSync(DOWNLOADS_PATH);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('[INFO] Iniciando diagnóstico de clique...');
  const context = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('[INFO] Acessando projeto dentos...');
  await page.goto('https://qfjowr.easypanel.host/projects/dentos', { waitUntil: 'networkidle' });
  await sleep(5000); // Wait 5s for JS event listeners to attach
  
  // Localizar "+ Serviço"
  const plusServiceBtn = page.locator('button, a').filter({ hasText: 'Serviço' }).first();
  if (await plusServiceBtn.isVisible()) {
    console.log('[INFO] Botão "+ Serviço" visível. Aguardando 2s extras e clicando...');
    await sleep(2000);
    await plusServiceBtn.click();
    console.log('[INFO] Botão "+ Serviço" clicado.');
    await sleep(3000);
    
    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'diagnose_click.png') });
    console.log('[INFO] Print da tela após clique salvo em downloads/diagnose_click.png');
    
    // Dump de todos os elementos na tela
    const elements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.innerText?.trim() || '',
          className: el.className || '',
          id: el.id || ''
        }))
        .filter(item => {
          const t = item.text.toLowerCase();
          return t.includes('app') || t.includes('banco') || t.includes('template') || t.includes('modelo') || t.includes('serviço');
        })
        .slice(0, 100); // Limit results
    });
    
    console.log('--- ELEMENTOS FILTRADOS ---');
    console.log(JSON.stringify(elements, null, 2));
    console.log('---------------------------');
  } else {
    console.log('[WARN] Botão "+ Serviço" não encontrado.');
    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'diagnose_click_fail.png') });
  }

  await context.close();
}

main().catch(console.error);
