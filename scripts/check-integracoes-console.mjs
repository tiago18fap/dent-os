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
    console.log('[INFO] Acessando app integracoes...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    // Clicar no botão Console
    const consoleBtn = page.locator('button[aria-label="Console"]').first();
    if (await consoleBtn.isVisible()) {
      console.log('[INFO] Clicando no botão do console...');
      await consoleBtn.click();
      await sleep(5000);

      // Clicar no botão Bash para iniciar o terminal
      const bashBtn = page.locator('button:has-text("Bash"), button:has-text("Sh")').first();
      if (await bashBtn.isVisible()) {
        console.log('[INFO] Clicando no botão "Bash"...');
        await bashBtn.click();
        await sleep(5000);
      } else {
        console.log('[WARN] Botão "Bash" ou "Sh" não encontrado.');
      }

      // Verificar se o terminal carregou ou se deu erro de conexão
      const bodyText = await page.evaluate(() => document.body.textContent || '');
      console.log('[INFO] O texto do modal contém "disconnected" ou "error"?', 
        bodyText.includes('disconnected') || bodyText.includes('error') || bodyText.includes('Falha'));

      const termText = await page.evaluate(() => {
        const lines = document.querySelectorAll('.xterm-rows div');
        const text = [];
        lines.forEach(l => {
          if (l.textContent) text.push(l.textContent.trim());
        });
        return text.join('\n');
      });
      console.log('--- CONTEÚDO DO TERMINAL INTEGRAÇÕES ---');
      console.log(termText);
      console.log('----------------------------------------');

      // Tentar digitar "ps aux" no console
      const terminalInput = page.locator('textarea.xterm-helper-textarea').first();
      if (await terminalInput.isVisible()) {
        console.log('[INFO] Focando no terminal e digitando commands...');
        await terminalInput.focus();
        await terminalInput.click({ force: true });
        await sleep(1000);
        await page.keyboard.type('wget --spider --timeout=10 https://lojasherwinwilliams.lojavirtualnuvem.com.br/admin/login');
        await page.keyboard.press('Enter');
        await sleep(5000);
        await page.keyboard.type('wget --spider --timeout=10 https://lojasherwinwilliams.lojavirtualnuvem.com.br/admin/nuvempago');
        await page.keyboard.press('Enter');
        await sleep(5000);
        await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'integracoes_console_results.png') });

        const updatedTermText = await page.evaluate(() => {
          const lines = document.querySelectorAll('.xterm-rows div');
          const text = [];
          lines.forEach(l => {
            if (l.textContent) text.push(l.textContent.trim());
          });
          return text.join('\n');
        });
        console.log('--- CONTEÚDO DO TERMINAL INTEGRAÇÕES (APÓS COMANDOS) ---');
        console.log(updatedTermText);
        console.log('---------------------------------------------------------');
      } else {
        console.log('[WARN] Textarea de input do terminal não visível.');
      }
    } else {
      console.log('[WARN] Botão Console do app integracoes não encontrado.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
