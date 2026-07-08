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
  console.log('[INFO] Iniciando inspeção detalhada dos inputs de Script...');
  
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

    // Clicar em "Editar" no script sync-diario
    const editBtn = page.locator('button').filter({ hasText: /^Editar$/ }).first();
    await editBtn.click();
    await sleep(2000);

    // Inspecionar o select
    const select = page.locator('select').first();
    const selectHtml = await select.evaluate(el => el.outerHTML);
    console.log('--- HTML DO SELECT ---');
    console.log(selectHtml);
    
    // Inspecionar o checkbox
    const checkbox = page.locator('input[type="checkbox"]').first();
    const checkboxHtml = await checkbox.evaluate(el => el.outerHTML);
    console.log('--- HTML DO CHECKBOX ---');
    console.log(checkboxHtml);

    // Pegar o texto do pai do checkbox para descobrir a label dele
    const parentText = await checkbox.evaluate(el => el.parentElement.innerText);
    console.log(`Texto do pai do checkbox: "${parentText}"`);

    // Vamos marcar o checkbox para ver se novos inputs aparecem!
    console.log('[INFO] Marcando o checkbox...');
    await checkbox.check();
    await sleep(2000);

    // Tirar screenshot para ver se a interface mudou
    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'diagnose_after_checkbox.png') });
    console.log('[PRINT] Screenshot salvo em downloads/diagnose_after_checkbox.png');

    // Listar inputs pós-checkbox
    const newInputs = await page.locator('input, textarea, select').all();
    console.log(`[INFO] Encontrados ${newInputs.length} elementos de formulário após marcar o checkbox.`);
    for (let i = 0; i < newInputs.length; i++) {
      const tag = await newInputs[i].evaluate(el => el.tagName.toLowerCase());
      const type = await newInputs[i].getAttribute('type') || '';
      const name = await newInputs[i].getAttribute('name') || '';
      const placeholder = await newInputs[i].getAttribute('placeholder') || '';
      const isVisible = await newInputs[i].isVisible();
      console.log(`Input ${i}: Tag=${tag}, Type=${type}, Name=${name}, Placeholder="${placeholder}", Visible=${isVisible}`);
    }

  } catch (err) {
    console.error('[ERRO INSPEÇÃO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
