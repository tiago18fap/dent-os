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
  let context = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  try {
    console.log('[INFO] Acessando aba Armazenamento do app integracoes...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes/storage', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    const addVolumeBtn = page.getByText(/Adicionar Montagem de Volume/i).first();
    if (await addVolumeBtn.isVisible()) {
      console.log('[INFO] Clicando em "Adicionar Montagem de Volume"...');
      await addVolumeBtn.click();
      await sleep(3000);

      console.log('[INFO] Preenchendo campos de Volume...');
      await page.getByLabel('Nome*').fill('data');
      await sleep(1000);
      await page.getByLabel('Caminho de Montagem*').fill('/app/data');
      await sleep(1000);

      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'volume_form_filled.png') });
      console.log('[INFO] Campos preenchidos.');

      // Clicar no botão de salvar/salvar volume
      // Normalmente o botão de salvar está no formulário/modal aberto
      const saveBtn = page.locator('[role="dialog"] button, [data-slot="dialog-content"] button, form button').filter({ hasText: /Salvar|Save|Criar|Create|Confirmar|Confirm/i }).first();
      await saveBtn.click();
      console.log('[INFO] Clicou em salvar volume.');
      await sleep(5000);

      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'volume_created.png') });
      console.log('[INFO] Montagem de volume salva!');
      
    } else {
      console.log('[WARN] Botão não encontrado.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
