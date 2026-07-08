import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SESSION_PATH = path.resolve('.chrome-session');
const DOWNLOADS_PATH = path.resolve('downloads');

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
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
    await sleep(5000);

    // Encontrar todos os botões/links do cabeçalho
    const links = await page.evaluate(() => {
      const els = document.querySelectorAll('button, a, [role="button"]');
      const list = [];
      els.forEach(el => {
        const txt = el.textContent?.trim();
        if (txt && txt.length > 0) {
          list.push(txt);
        }
      });
      return list;
    });
    console.log('[INFO] Elementos clicáveis encontrados:', links);

    // Clicar em "Ações" se existir
    const acoesBtn = page.locator('button, a, [role="button"]').filter({ hasText: /^Ações$/ }).first();
    if (await acoesBtn.isVisible().catch(() => false)) {
      console.log('[INFO] Clicando no menu "Ações"...');
      await acoesBtn.click();
      await sleep(2000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_web_acoes_clicked.png') });
      
      const acoesText = await page.evaluate(() => document.body.textContent || '');
      fs.writeFileSync(path.join(DOWNLOADS_PATH, 'acoes_body.txt'), acoesText);
      console.log('[INFO] Texto após clicar em Ações salvo.');
      
      // Fechar dropdown clicando no body
      await page.locator('body').click({ position: { x: 0, y: 0 } });
      await sleep(1000);
    } else {
      console.log('[WARN] Botão "Ações" não encontrado.');
    }

    // Clicar em "Monitorar" se existir
    const monitorarBtn = page.locator('button, a, [role="button"]').filter({ hasText: /^Monitorar$/ }).first();
    if (await monitorarBtn.isVisible().catch(() => false)) {
      console.log('[INFO] Clicando no menu "Monitorar"...');
      await monitorarBtn.click();
      await sleep(2000);
      await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_web_monitorar_clicked.png') });
      
      const monitorarText = await page.evaluate(() => document.body.textContent || '');
      fs.writeFileSync(path.join(DOWNLOADS_PATH, 'monitorar_body.txt'), monitorarText);
      console.log('[INFO] Texto após clicar em Monitorar salvo.');
    } else {
      console.log('[WARN] Botão "Monitorar" não encontrado.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
