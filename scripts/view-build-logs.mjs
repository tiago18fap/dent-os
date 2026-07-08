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
    console.log('[INFO] Acessando aba de implantações...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes/deployments', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'build_logs_deployments_list.png') });
    
    // Encontrar e clicar no primeiro botão "Visualizar"
    const viewBtn = page.getByText(/Visualizar|View/i).first();
    if (await viewBtn.isVisible()) {
      console.log('[INFO] Clicando no primeiro botão "Visualizar"...');
      await viewBtn.click();
      await sleep(5000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'build_logs_modal.png') });
      console.log('[INFO] Print dos logs de build salvo.');

      // Tentar pegar os logs de build da tela
      const buildLogs = await page.evaluate(() => {
        const selectors = ['pre', 'code', '.bg-black', '[class*="console"]', '[class*="log"]', '.terminal'];
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (el.textContent && el.textContent.trim().length > 20) {
              return el.textContent;
            }
          }
        }
        return 'Não foi possível ler os logs do modal';
      });

      console.log('--- LOGS DE BUILD DO DEPLOY ---');
      console.log(buildLogs.substring(0, 4000));
      console.log('--------------------------------');
    } else {
      console.log('[WARN] Botão "Visualizar" não encontrado na página.');
    }

  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
