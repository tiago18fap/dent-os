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
  console.log(`[INFO] Usando perfil: ${SESSION_PATH}`);
  
  // Limpar travas do Chrome para evitar conflito de processos
  const locks = ['lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const lock of locks) {
    try {
      const lockPath = path.join(SESSION_PATH, lock);
      fs.unlinkSync(lockPath);
    } catch (e) {}
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });
  } catch (err) {
    console.error('Erro ao abrir browser:', err.message);
    return;
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  try {
    console.log('[INFO] Acessando visão geral do app web...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, 'deploy_web_01_loaded');

    console.log('[DEBUG] URL atual:', page.url());

    // Verificar se fomos jogados para a página de login
    const loginBtn = page.locator('button').filter({ hasText: /^Login$/ }).first();
    const isLoginVisible = await loginBtn.isVisible().catch(() => false);

    if (page.url().includes('/login') || isLoginVisible) {
      console.log('[INFO] Sessão do EasyPanel expirada ou ausente no perfil local. Tela de login detectada.');
      
      if (isLoginVisible) {
        console.log('[INFO] Tentando clicar no botão "Login" (campos auto-preenchidos)...');
        await loginBtn.click();
        await sleep(5000);
      }

      // Se ainda não estiver logado, esperar o login manual
      if (page.url().includes('/login')) {
        console.log('[INFO] Login automático não funcionou. POR FAVOR, REALIZE O LOGIN na janela aberta do Chromium para que o deploy prossiga...');
        
        let loggedIn = false;
        for (let i = 0; i < 120; i++) {
          await sleep(1000);
          const currentUrl = page.url();
          if (currentUrl.includes('/projects/dentos')) {
            loggedIn = true;
            console.log('[INFO] Login detectado com sucesso! Redirecionando...');
            await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
            await sleep(5000);
            break;
          }
        }
        
        if (!loggedIn) {
          throw new Error('Tempo limite de login de 120 segundos excedido.');
        }
      } else {
        console.log('[INFO] Login efetuado com sucesso! Redirecionando para a aplicação web...');
        await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
        await sleep(5000);
      }
    }

    // Clicar no botão "Implantar" (Deploy)
    const deployBtn = page.locator('button').filter({ hasText: /^Implantar$|^Deploy$/ }).first();
    if (await deployBtn.isVisible()) {
      console.log('[INFO] Clicando no botão "Implantar" para o app web...');
      await deployBtn.click();
      await sleep(5000);
      await takeScreenshot(page, 'deploy_web_02_dispatched');
    } else {
      console.log('[WARN] Botão "Implantar" não encontrado.');
      await takeScreenshot(page, 'deploy_web_not_found_debug');
    }

    // Ir para a página de implantações
    console.log('[INFO] Navegando para implantações do web...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web/deployments', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await takeScreenshot(page, 'deploy_web_03_deployments_list');

    // Clicar no primeiro botão "Visualizar"
    const viewBtn = page.getByText(/Visualizar|View/i).first();
    if (await viewBtn.isVisible()) {
      console.log('[INFO] Clicando em "Visualizar" da nova implantação...');
      await viewBtn.click();
      await sleep(3000);
      await takeScreenshot(page, 'deploy_web_04_logs_modal');

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
    try {
      if (page) {
        await takeScreenshot(page, 'deploy_web_error_debug');
      }
    } catch (e) {}
  } finally {
    await context.close();
  }
}

main().catch(console.error);
