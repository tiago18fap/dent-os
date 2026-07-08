import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

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
    console.log('[WARN] Detectado erro "Not Found" ou "Invariant failed". Recarregando a página em 3 segundos...');
    await sleep(3000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(4000);
    return true;
  }
  return false;
}

async function main() {
  console.log(`[INFO] Usando perfil persistente: ${SESSION_PATH}`);
  
  let context;
  try {
    try {
      context = await chromium.launchPersistentContext(SESSION_PATH, {
        headless: false,
        channel: 'chrome',
        viewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch (err) {
      console.log('[WARN] Falha ao iniciar Chrome do sistema. Tentando Chromium...', err.message);
      context = await chromium.launchPersistentContext(SESSION_PATH, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    
    console.log('[INFO] Acessando EasyPanel...');
    await page.goto('https://qfjowr.easypanel.host/', { waitUntil: 'domcontentloaded' });

    // Verificar login
    console.log('[INFO] Verificando login...');
    let loggedIn = false;
    for (let i = 0; i < 300; i++) {
      const url = page.url();
      const isDashboard = url.includes('/projects') || 
                          await page.locator('text="Projects"').isVisible().catch(() => false) ||
                          await page.locator('text="Projetos"').isVisible().catch(() => false) ||
                          await page.locator('text="Log out"').isVisible().catch(() => false);
      
      if (isDashboard) {
        loggedIn = true;
        console.log('[INFO] Login confirmado!');
        break;
      }
      
      if (i % 10 === 0) {
        console.log(`[AGUARDANDO LOGIN] Por favor, realize o login no navegador se necessário. URL atual: ${url}`);
      }
      await sleep(1000);
    }

    if (!loggedIn) {
      console.error('[ERRO] Tempo limite para login excedido.');
      throw new Error('Tempo limite para login excedido.');
    }

    // Navegar para implantações
    console.log('[INFO] Navegando para a página de implantações...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/easydental-worker/deployments', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await handleNotFoundRecovery(page);
    
    // Localizar o botão "Visualizar"
    const viewBtn = page.getByText(/Visualizar|View/i).first();
    
    try {
      console.log('[INFO] Aguardando botão "Visualizar" ficar visível...');
      await viewBtn.waitFor({ state: 'visible', timeout: 15000 });
      console.log('[INFO] Encontrado botão "Visualizar". Clicando...');
      await viewBtn.click();
      await sleep(4000);
      
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'check_build_logs.png') });
      console.log('[INFO] Print dos logs salvo em downloads/check_build_logs.png');
      
      // Extrair o conteúdo do elemento <pre> ou do terminal de logs
      const logElements = await page.locator('pre, code, .terminal, .xterm-rows').all();
      if (logElements.length > 0) {
        console.log('--- CONTEÚDO DOS LOGS DE BUILD ---');
        for (const el of logElements) {
          const text = await el.innerText().catch(() => '');
          if (text.trim()) {
            console.log(text);
          }
        }
        console.log('----------------------------------');
      } else {
        console.log('[WARN] Nenhum elemento de log (<pre>, <code>, etc.) visível.');
      }
    } catch (err) {
      console.log('[WARN] Botão "Visualizar" não encontrado ou não ficou visível.', err.message);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'check_build_error.png') });
    }

    console.log('[INFO] Concluído! Mantendo o navegador aberto indefinidamente...');
    await sleep(36000000); // 10 horas
  } catch (err) {
    console.error('[ERRO NO SCRIPT]', err);
    console.log('[INFO] Mantendo o navegador aberto para depuração indefinidamente...');
    await sleep(36000000); // 10 horas
  }
}

main().catch(console.error);
