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
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    // Clicar no botão de Console (índice 53 ou aria-label="Console")
    const consoleBtn = page.locator('button[aria-label="Console"]').first();
    if (await consoleBtn.isVisible()) {
      console.log('[INFO] Clicando no botão do console...');
      await consoleBtn.click();
      await sleep(10000); // Dar tempo para conectar o terminal
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'console_open.png') });

      // Pegar o HTML do portal/dialog
      const dialogHtml = await page.evaluate(() => {
        // Procurar por dialogs radix ou portais
        const portals = document.querySelectorAll('[data-slot="dialog-portal"], [id*="dialog"], .bg-black');
        let htmlContent = '';
        portals.forEach((p, idx) => {
          htmlContent += `\n--- Portal ${idx + 1} (${p.tagName}.${p.className}) ---\n${p.outerHTML}\n`;
        });
        return htmlContent || document.body.innerHTML;
      });

      fs.writeFileSync(path.join(DOWNLOADS_PATH, 'console_dialog.html'), dialogHtml);
      console.log('[INFO] HTML do dialog salvo em downloads/console_dialog.html');
    } else {
      console.log('[WARN] Botão do console não encontrado.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
