import { chromium } from 'playwright';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');

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
    console.log('[INFO] Acessando app integracoes...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(6000);
    await handleNotFoundRecovery(page);

    // Clicar no botão Console
    const consoleBtn = page.locator('button[aria-label="Console"]').first();
    if (await consoleBtn.isVisible()) {
      console.log('[INFO] Clicando no botão do console...');
      await consoleBtn.click();
      await sleep(6000);

      // Clicar no botão Bash para iniciar o terminal
      const bashBtn = page.locator('button:has-text("Bash"), button:has-text("Sh")').first();
      if (await bashBtn.isVisible()) {
        console.log('[INFO] Clicando no botão "Bash"...');
        await bashBtn.click();
        await sleep(15000); // Wait 15 seconds for container connection
      }

      // Focar no terminal
      const terminalInput = page.locator('textarea.xterm-helper-textarea').first();
      if (await terminalInput.isVisible()) {
        console.log('[INFO] Focando no terminal e digitando comando...');
        await terminalInput.focus();
        await terminalInput.click({ force: true });
        await sleep(2000);
        
        await page.keyboard.type('cat data/credentials.json');
        await page.keyboard.press('Enter');
        await sleep(10000); // Wait 10 seconds for command execution

        const termText = await page.evaluate(() => {
          const lines = document.querySelectorAll('.xterm-rows div');
          const text = [];
          lines.forEach(l => {
            if (l.textContent) text.push(l.textContent.trim());
          });
          return text.join('\n');
        });
        console.log('--- CONTEÚDO DO TERMINAL ---');
        console.log(termText);
        console.log('----------------------------');
      } else {
        console.log('[WARN] Terminal input não encontrado.');
      }
    } else {
      console.log('[WARN] Botão Console não encontrado.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
