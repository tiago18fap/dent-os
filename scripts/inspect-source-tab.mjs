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
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes/source', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_int_source.png') });
    console.log('[INFO] Print da aba de fonte salvo.');

    // Dump all inputs and selectors
    const config = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      const results = [];
      inputs.forEach((el, index) => {
        let label = '';
        // Find label for this input
        const parentLabel = el.closest('label');
        if (parentLabel) {
          label = parentLabel.textContent?.trim() || '';
        } else {
          // look for label element with matching 'for' attribute
          const id = el.getAttribute('id');
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) label = lbl.textContent?.trim() || '';
          }
        }
        
        // If still no label, try finding preceding sibling text
        if (!label && el.previousElementSibling) {
          label = el.previousElementSibling.textContent?.trim() || '';
        }

        results.push({
          index,
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          placeholder: el.getAttribute('placeholder') || '',
          value: el.value || '',
          label: label.replace(/\s+/g, ' ').substring(0, 100)
        });
      });
      return results;
    });

    console.log('--- CONFIGURAÇÃO DE FONTE DETECTADA ---');
    console.log(JSON.stringify(config, null, 2));
    console.log('---------------------------------------');

  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
