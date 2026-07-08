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
  console.log('[INFO] Iniciando diagnóstico do formulário de Adicionar Script...');
  
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

    // Ir para a aba Scripts
    const scriptsTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Scripts"').first();
    await scriptsTab.click();
    await sleep(3000);
    await handleNotFoundRecovery(page);

    // Clicar em "Adicionar Script"
    console.log('[INFO] Clicando em "Adicionar Script"...');
    const addScriptBtn = page.locator('button').filter({ hasText: /Adicionar Script|Add Script/i }).first();
    await addScriptBtn.click();
    await sleep(2000);
    
    await takeScreenshot(page, 'diagnose_add_script_form');

    // Listar inputs e placeholders
    const inputs = await page.locator('input, textarea, select').all();
    console.log(`[INFO] Encontrados ${inputs.length} elementos de formulário na tela.`);
    for (let i = 0; i < inputs.length; i++) {
      const tag = await inputs[i].evaluate(el => el.tagName.toLowerCase());
      const type = await inputs[i].getAttribute('type') || '';
      const name = await inputs[i].getAttribute('name') || '';
      const placeholder = await inputs[i].getAttribute('placeholder') || '';
      const isVisible = await inputs[i].isVisible();
      console.log(`Input ${i}: Tag=${tag}, Type=${type}, Name=${name}, Placeholder="${placeholder}", Visible=${isVisible}`);
    }

    // Listar botões
    const buttons = await page.locator('button').all();
    console.log(`[INFO] Encontrados ${buttons.length} botões na tela.`);
    for (let i = 0; i < buttons.length; i++) {
      const text = (await buttons[i].innerText()).trim();
      const isVisible = await buttons[i].isVisible();
      console.log(`Botão ${i}: Texto="${text}", Visible=${isVisible}`);
    }

  } catch (err) {
    console.error('[ERRO DIAGNÓSTICO FORM]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
