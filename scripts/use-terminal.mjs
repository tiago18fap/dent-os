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
    console.log('[INFO] Acessando app web...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    // Tirar screenshot para ver a barra de botões no topo direito
    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'web_top_buttons.png') });

    // Procurar por botão de console. Geralmente é um botão com um ícone >_
    // Vamos procurar por botões/links sem texto longo ou que possam ser o console.
    const buttonsInfo = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, a, [role="button"]');
      const list = [];
      btns.forEach((btn, idx) => {
        const text = btn.textContent?.trim() || '';
        const title = btn.getAttribute('title') || '';
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const className = btn.className || '';
        list.push({ idx, text, title, ariaLabel, className });
      });
      return list;
    });
    console.log('--- BOTÕES ENCONTRADOS ---');
    console.log(JSON.stringify(buttonsInfo, null, 2));
    console.log('--------------------------');

    // Em EasyPanel v2, o botão do console pode ter o texto "Console" ou o título "Console" ou "Terminal".
    // Vamos procurar um botão com title="Console" ou contendo "Console" ou "terminal" ou ">_"
    let consoleBtn = null;
    for (const btn of buttonsInfo) {
      if (btn.title.toLowerCase().includes('console') || btn.ariaLabel.toLowerCase().includes('console') || btn.text.toLowerCase().includes('console') || btn.text.includes('>_')) {
        consoleBtn = page.locator('button, a, [role="button"]').nth(btn.idx);
        console.log(`[INFO] Selecionado botão Console no índice ${btn.idx} com título "${btn.title}" e texto "${btn.text}"`);
        break;
      }
    }

    if (!consoleBtn) {
      // Procurar por um botão que tenha SVG com padrão console (como deitar caminhos de terminal)
      console.log('[WARN] Botão do console não identificado por texto/título. Tentando localizar por posição ou ícone...');
      // Costuma estar perto do botão "Implantar"
      // Vamos tentar clicar no botão de console se encontrarmos um seletor apropriado.
    }

    if (consoleBtn) {
      await consoleBtn.click();
      console.log('[INFO] Clicou no botão do console. Aguardando carregar...');
      await sleep(10000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'web_console_loaded.png') });

      // O terminal do EasyPanel costuma usar xterm.js ou uma área de texto.
      // Vamos digitar os comandos e pressionar Enter.
      // Se for xterm.js, podemos focar no terminal e digitar usando o teclado.
      console.log('[INFO] Focando no terminal e executando comandos de diagnóstico...');
      
      // Tentar focar no textarea auxiliar do xterm
      const terminalInput = page.locator('textarea.xterm-helper-textarea').first();
      if (await terminalInput.isVisible()) {
        console.log('[INFO] Focando no textarea auxiliar do terminal...');
        await terminalInput.focus();
        await terminalInput.click({ force: true });
        await sleep(2000);
        
        // Digitar o comando: nslookup dentos-integracoes e dar Enter
        await page.keyboard.type('nslookup dentos-integracoes');
        await page.keyboard.press('Enter');
        await sleep(4000);

        await page.keyboard.type('nslookup dentos_integracoes');
        await page.keyboard.press('Enter');
        await sleep(4000);

        await page.keyboard.type('wget -qO- http://dentos-integracoes:3500/health');
        await page.keyboard.press('Enter');
        await sleep(4000);

        await page.keyboard.type('wget -qO- http://dentos_integracoes:3500/health');
        await page.keyboard.press('Enter');
        await sleep(4000);

        await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'web_console_results.png') });
        
        // Extrair texto do terminal usando JSDOM style or outer text selector
        const termText = await page.evaluate(() => {
          const terminalLines = document.querySelectorAll('.xterm-rows div');
          const lines = [];
          terminalLines.forEach(line => {
            if (line.textContent) lines.push(line.textContent.trim());
          });
          return lines.join('\n');
        });
        
        console.log('--- CONTEÚDO DO TERMINAL ---');
        console.log(termText);
        console.log('----------------------------');
      } else {
        console.log('[WARN] Elemento do terminal xterm não encontrado.');
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
