import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');
const DOWNLOADS_PATH = path.resolve('downloads');

if (!fs.existsSync(DOWNLOADS_PATH)) {
  fs.mkdirSync(DOWNLOADS_PATH);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  const screenshotPath = path.join(DOWNLOADS_PATH, `${name}.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(`[PRINT] Screenshot salvo em: downloads/${name}.png`);
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
  console.log('[INFO] Iniciando diagnóstico de abas do EasyPanel...');
  
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
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/easydental-worker', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await handleNotFoundRecovery(page);

    // 1. Diagnosticar aba "Scripts"
    console.log('[INFO] Procurando aba "Scripts" no menu lateral...');
    const scriptsTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Scripts"').first();
    if (await scriptsTab.isVisible()) {
      console.log('[INFO] Clicando na aba "Scripts"...');
      await scriptsTab.click();
      await sleep(4000);
      await handleNotFoundRecovery(page);
      await takeScreenshot(page, 'diagnose_scripts');
      
      const bodyText = await page.locator('main, body').innerText();
      console.log('--- CONTEÚDO DA ABA SCRIPTS ---');
      console.log(bodyText);
      console.log('-------------------------------');
    } else {
      console.log('[WARN] Aba "Scripts" não visível.');
    }

    // 2. Diagnosticar aba "Avançado"
    console.log('[INFO] Procurando aba "Avançado" no menu lateral...');
    const advancedTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Avançado"').first();
    if (await advancedTab.isVisible()) {
      console.log('[INFO] Clicando na aba "Avançado"...');
      await advancedTab.click();
      await sleep(4000);
      await handleNotFoundRecovery(page);
      await takeScreenshot(page, 'diagnose_advanced');
      
      const bodyText = await page.locator('main, body').innerText();
      console.log('--- CONTEÚDO DA ABA AVANÇADO ---');
      console.log(bodyText);
      console.log('--------------------------------');
    } else {
      console.log('[WARN] Aba "Avançado" não visível.');
    }

  } catch (err) {
    console.error('[ERRO DIAGNÓSTICO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
