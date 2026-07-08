import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');

async function main() {
  console.log('[INFO] Iniciando diagnóstico de inputs da aba Fonte...');
  
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
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(4000);

    // Ir para a aba Fonte
    const fonteTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Fonte"').first();
    await fonteTab.click();
    await sleep(3000);

    // Listar todos os inputs e seus atributos na tela
    const inputs = await page.locator('input').all();
    console.log(`[INFO] Encontrados ${inputs.length} inputs na tela de Fonte.`);
    for (let i = 0; i < inputs.length; i++) {
      const outerHtml = await inputs[i].evaluate(el => el.outerHTML);
      const parentHtml = await inputs[i].evaluate(el => el.parentElement.innerHTML);
      console.log(`Input ${i}:`);
      console.log(`- HTML: ${outerHtml}`);
      console.log(`- Parent InnerHTML: ${parentHtml.slice(0, 300)}`);
      console.log('--------------------------------------------');
    }

  } catch (err) {
    console.error('[ERRO DIAGNÓSTICO GIT]', err);
  } finally {
    await context.close();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
