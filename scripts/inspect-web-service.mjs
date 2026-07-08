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

    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_web_overview.png') });
    console.log('[INFO] Print da visão geral do web salvo.');

    // 1. Obter informações de status
    const statusText = await page.locator('div:has-text("Status") + div, span:has-text("Status") + span, [class*="status"]').first().textContent().catch(() => 'Não encontrado');
    console.log(`[STATUS WEB] Status: ${statusText?.trim()}`);

    // 2. Acessar a aba de implantações do web
    console.log('[INFO] Acessando aba de implantações...');
    const deployTab = page.locator('aside, .sidebar, [class*="sidebar"], nav').locator('text="Implantações"').first();
    if (await deployTab.isVisible().catch(() => false)) {
      await deployTab.click();
      await sleep(5000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_web_deployments.png') });

      const deploymentsInfo = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr, [class*="deployment-row"], ul > li, div > div');
        const list = [];
        rows.forEach(row => {
          const text = row.textContent?.trim();
          if (text && (text.includes('Implantado') || text.includes('Falhou') || text.includes('Deploy') || text.includes('Sucesso') || text.includes('Success') || text.includes('Failed'))) {
            list.push(text.replace(/\s+/g, ' '));
          }
        });
        return [...new Set(list)].slice(0, 10);
      });
      console.log('--- ÚLTIMAS IMPLANTAÇÕES WEB ---');
      deploymentsInfo.forEach((dep, idx) => console.log(`${idx + 1}: ${dep}`));
      console.log('--------------------------------');

      // Visualizar logs do primeiro build
      const viewBtn = page.getByText(/Visualizar|View/i).first();
      if (await viewBtn.isVisible()) {
        console.log('[INFO] Clicando em "Visualizar" da última implantação web...');
        await viewBtn.click();
        await sleep(5000);
        await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_web_build_logs.png') });
        
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
          return 'Não foi possível ler os logs';
        });
        console.log('--- LOGS DE BUILD WEB ---');
        console.log(buildLogs.substring(0, 2000));
        console.log('-------------------------');
      }
    }

  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
