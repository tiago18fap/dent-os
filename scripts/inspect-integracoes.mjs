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
    await page.goto('https://qfjowr.easypanel.host/projects/dentos', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    console.log('[INFO] Clicando no serviço integracoes...');
    const serviceLink = page.locator('a').filter({ hasText: /^integracoes$/ }).first();
    await serviceLink.click();
    await sleep(5000);
    await handleNotFoundRecovery(page);

    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_int_clicked_overview.png') });
    console.log('[INFO] Print da visão geral salvo.');

    // 1. Obter informações de status e informações gerais
    const pageText = await page.evaluate(() => document.body.textContent || '');
    console.log(`[INFO] O texto da página contém "Status"? ${pageText.includes('Status')}`);
    
    // Vamos tentar ler qualquer badge ou status visível na tela
    const badges = await page.evaluate(() => {
      const els = document.querySelectorAll('span, div');
      const list = [];
      els.forEach(el => {
        const txt = el.textContent?.trim();
        if (txt && (txt.includes('running') || txt.includes('failed') || txt.includes('stopped') || txt.includes('error') || txt.includes('offline') || txt.includes('online'))) {
          list.push(txt);
        }
      });
      return [...new Set(list)];
    });
    console.log('[INFO] Badges de status possíveis encontradas:', badges);

    // 2. Acessar a aba de logs
    console.log('[INFO] Acessando aba de logs...');
    const logsTab = page.locator('aside, .sidebar, [class*="sidebar"], nav').locator('text="Logs"').first();
    if (await logsTab.isVisible().catch(() => false)) {
      await logsTab.click();
      await sleep(5000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_int_clicked_logs.png') });

      const logsText = await page.evaluate(() => {
        // Encontrar todos os containers de log
        const selectors = ['.bg-black', 'pre', 'code', '[class*="console"]', '[class*="log"]', '.terminal'];
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          for (const el of els) {
            if (el.textContent && el.textContent.trim().length > 20) {
              return el.textContent;
            }
          }
        }
        return 'Nenhum container de log encontrado';
      });
      
      console.log('--- LOGS DO CONTÊINER ---');
      console.log(logsText.substring(0, 2000)); // print up to 2000 chars
      console.log('-------------------------');
    } else {
      console.log('[WARN] Aba de logs não encontrada.');
    }

    // 3. Acessar a aba de implantações
    console.log('[INFO] Acessando aba de implantações...');
    const deployTab = page.locator('aside, .sidebar, [class*="sidebar"], nav').locator('text="Implantações"').first();
    if (await deployTab.isVisible().catch(() => false)) {
      await deployTab.click();
      await sleep(5000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_int_clicked_deployments.png') });

      const deploymentsInfo = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr, [class*="deployment-row"], ul > li, div > div');
        const list = [];
        rows.forEach(row => {
          const text = row.textContent?.trim();
          if (text && (text.includes('Implantado') || text.includes('Falhou') || text.includes('Deploy') || text.includes('Sucesso') || text.includes('Success') || text.includes('Failed'))) {
            list.push(text.replace(/\s+/g, ' '));
          }
        });
        return [...new Set(list)].slice(0, 10);
      });
      console.log('--- ÚLTIMAS IMPLANTAÇÕES ---');
      deploymentsInfo.forEach((dep, idx) => console.log(`${idx + 1}: ${dep}`));
      console.log('----------------------------');
    }

  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
