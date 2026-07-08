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
    console.log('[INFO] Acessando aba Domínios do app integracoes...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes/domains', { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    await handleNotFoundRecovery(page);

    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'inspect_int_domains.png') });
    console.log('[INFO] Print da aba Domínios salvo.');

    // Extrair informações de domínios
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    console.log('[INFO] Texto da página de domínios contem "dentos.com.br"?', bodyText.includes('dentos.com.br'));

    const domains = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr, [class*="domain-row"], ul > li, div > div');
      const list = [];
      rows.forEach(row => {
        const text = row.textContent?.trim();
        if (text && (text.includes('com.br') || text.includes('Porta') || text.includes('Port') || text.includes('http') || text.includes('https'))) {
          list.push(text.replace(/\s+/g, ' '));
        }
      });
      return [...new Set(list)];
    });

    console.log('--- DOMÍNIOS CONFIGURADOS ---');
    console.log(JSON.stringify(domains, null, 2));
    console.log('-----------------------------');

    const inputs = await page.evaluate(() => {
      const els = document.querySelectorAll('input, select, textarea');
      const list = [];
      els.forEach((el, index) => {
        list.push({
          index,
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          value: el.value || '',
          placeholder: el.getAttribute('placeholder') || ''
        });
      });
      return list;
    });
    console.log('--- INPUTS NA PÁGINA ---');
    console.log(JSON.stringify(inputs, null, 2));
    console.log('------------------------');

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
