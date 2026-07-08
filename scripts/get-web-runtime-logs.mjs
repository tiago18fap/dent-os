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
    console.log('[INFO] Acessando app web...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    console.log('[INFO] Acessando aba de logs...');
    const logsTab = page.locator('aside, .sidebar, [class*="sidebar"], nav').locator('text="Logs"').first();
    if (await logsTab.isVisible().catch(() => false)) {
      await logsTab.click();
      console.log('[INFO] Clicou na aba Logs, aguardando...');
      await sleep(10000); // Wait 10 seconds for logs stream
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'web_runtime_logs_page.png') });

      const logsText = await page.evaluate(() => {
        // Encontrar todos os containers de log
        const selectors = ['.bg-black', 'pre', 'code', '[class*="console"]', '[class*="log"]', '.terminal'];
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (el.textContent && el.textContent.trim().length > 20) {
              return el.textContent;
            }
          }
        }
        return 'Nenhum container de log encontrado';
      });
      
      console.log('--- LOGS DO CONTÊINER WEB ---');
      console.log(logsText.substring(0, 4000));
      console.log('-----------------------------');
      
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
