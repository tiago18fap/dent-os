import { chromium } from 'playwright';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    console.log('[INFO] Acessando visão geral do app integracoes...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(5000);

    // Clicar no botão "Implantar" (Deploy)
    const deployBtn = page.locator('button').filter({ hasText: /^Implantar$|^Deploy$/ }).first();
    if (await deployBtn.isVisible()) {
      console.log('[INFO] Clicando no botão "Implantar"...');
      await deployBtn.click();
      await sleep(5000);
    } else {
      console.log('[WARN] Botão "Implantar" não encontrado na página.');
    }

    // Ir para a página de implantações
    console.log('[INFO] Navegando para implantações...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes/deployments', { waitUntil: 'domcontentloaded' });
    await sleep(4000);

    // Clicar no primeiro botão "Visualizar" para acompanhar o build
    const viewBtn = page.getByText(/Visualizar|View/i).first();
    if (await viewBtn.isVisible()) {
      console.log('[INFO] Clicando em "Visualizar" da nova implantação...');
      await viewBtn.click();
      await sleep(3000);

      // Polling para acompanhar os logs por até 5 minutos ou até ver sucesso/erro
      console.log('[INFO] Acompanhando logs de build (máx 5 minutos)...');
      let previousLogText = '';
      const startTime = Date.now();
      
      while (Date.now() - startTime < 300000) { // 5 minutes
        const currentLogText = await page.evaluate(() => {
          const selectors = ['pre', 'code', '.bg-black', '[class*="console"]', '[class*="log"]', '.terminal'];
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              if (el.textContent && el.textContent.trim().length > 20) {
                return el.textContent;
              }
            }
          }
          return '';
        });

        if (currentLogText && currentLogText !== previousLogText) {
          // Print only the new lines
          const newLines = currentLogText.substring(previousLogText.length);
          process.stdout.write(newLines);
          previousLogText = currentLogText;
        }

        if (currentLogText.includes('Success') || currentLogText.includes('Failed') || currentLogText.includes('Sucesso') || currentLogText.includes('Falhou')) {
          console.log('\n[INFO] Fim da implantação detectado.');
          break;
        }

        await sleep(5000);
      }
    } else {
      console.log('[WARN] Não foi possível visualizar a implantação.');
    }

  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
