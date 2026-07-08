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
    console.log('[INFO] Acessando projeto dentos...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    console.log('[INFO] Acessando aba de logs...');
    const logsTab = page.locator('aside, .sidebar, [class*="sidebar"], nav').locator('text="Logs"').first();
    if (await logsTab.isVisible().catch(() => false)) {
      await logsTab.click();
      console.log('[INFO] Clicou na aba Logs, aguardando...');
      await sleep(10000); // Wait 10 seconds for logs stream
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'runtime_logs_page.png') });

      // Dump all text elements on page to see if we can find logs
      const elementsText = await page.evaluate(() => {
        const results = [];
        // Get all divs, pre, code, span
        const els = document.querySelectorAll('div, pre, code, span, section');
        els.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 50 && text.length < 5000 && !text.includes('easydental-worker') && !text.includes('Modelos')) {
            results.push({
              tag: el.tagName,
              class: el.className,
              text: text.replace(/\s+/g, ' ').substring(0, 500)
            });
          }
        });
        return results;
      });

      console.log('--- ELEMENTOS DE TEXTO DETECTADOS NA TELA DE LOGS ---');
      console.log(JSON.stringify(elementsText.slice(0, 20), null, 2));
      console.log('----------------------------------------------------');
      
      // Let's also grab raw HTML of the main area
      const mainHtml = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? main.outerHTML : 'Main element not found';
      });
      fs.writeFileSync(path.join(DOWNLOADS_PATH, 'runtime_logs_main.html'), mainHtml);
      console.log('[INFO] HTML da area principal salvo em downloads/runtime_logs_main.html');
      
    } else {
      console.log('[WARN] Aba de logs não encontrada.');
    }

  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
