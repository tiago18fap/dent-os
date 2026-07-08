import { chromium } from 'playwright';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    console.log('[INFO] Acessando visão geral do app integracoes...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes', { waitUntil: 'domcontentloaded' });
    await sleep(6000);

    // Tirar screenshot para depuração visual
    await page.screenshot({ path: path.join('downloads', 'inspect_integracoes_overview_detailed.png') });

    // Extrair todo o texto dos elementos que possam conter informações de status
    const statusDetails = await page.evaluate(() => {
      const results = [];
      
      // Procurar por textos contendo CPU, Memória, Status, Container
      const divs = document.querySelectorAll('div, span, p, h1, h2, h3');
      divs.forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && text.length < 200) {
          if (text.includes('running') || text.includes('stopped') || text.includes('CPU') || text.includes('Memória') || text.includes('Erro') || text.includes('Error') || text.includes('Offline') || text.includes('Online')) {
            results.push(text);
          }
        }
      });
      return [...new Set(results)];
    });

    console.log('--- DETALHES DE STATUS DETECTADOS ---');
    console.log(statusDetails);
    console.log('--------------------------------------');

    // Acessar a aba "Manutenção" para ver se tem informações de depuração
    const maintenanceTab = page.locator('aside, .sidebar, [class*="sidebar"], nav').locator('text="Manutenção"').first();
    if (await maintenanceTab.isVisible().catch(() => false)) {
      console.log('[INFO] Acessando aba Manutenção...');
      await maintenanceTab.click();
      await sleep(4000);
      await page.screenshot({ path: path.join('downloads', 'inspect_integracoes_maintenance.png') });
      
      const maintenanceText = await page.evaluate(() => document.body.textContent || '');
      console.log('[INFO] Texto da aba Manutenção (trecho):');
      console.log(maintenanceText.substring(0, 1000).replace(/\s+/g, ' '));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
