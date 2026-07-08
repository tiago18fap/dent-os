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
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes/storage', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    const addVolumeBtn = page.getByText(/Adicionar Montagem de Volume/i).first();
    if (await addVolumeBtn.isVisible()) {
      console.log('[INFO] Clicando em "Adicionar Montagem de Volume"...');
      await addVolumeBtn.click();
      await sleep(3000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'add_volume_form.png') });

      // Dump inputs and their labels
      const inputs = await page.evaluate(() => {
        const els = document.querySelectorAll('input, select, textarea');
        const list = [];
        els.forEach((el, index) => {
          let label = '';
          const parentLabel = el.closest('label');
          if (parentLabel) label = parentLabel.textContent?.trim() || '';
          else {
            const id = el.getAttribute('id');
            if (id) {
              const lbl = document.querySelector(`label[for="${id}"]`);
              if (lbl) label = lbl.textContent?.trim() || '';
            }
          }
          if (!label && el.previousElementSibling) {
            label = el.previousElementSibling.textContent?.trim() || '';
          }
          
          list.push({
            index,
            tag: el.tagName,
            type: el.getAttribute('type') || '',
            value: el.value || '',
            placeholder: el.getAttribute('placeholder') || '',
            label: label.replace(/\s+/g, ' ').substring(0, 100)
          });
        });
        return list;
      });

      console.log('--- CAMPOS DO FORMULÁRIO DE VOLUME ---');
      console.log(JSON.stringify(inputs, null, 2));
      console.log('---------------------------------------');
    } else {
      console.log('[WARN] Botão "Adicionar Montagem de Volume" não encontrado.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
