import { chromium } from 'playwright';
import path from 'path';

const SESSION_PATH = path.resolve('.chrome-session');

async function main() {
  let context = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  try {
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/integracoes/source', { waitUntil: 'domcontentloaded' });
    await Promise.race([
      page.waitForSelector('input[type="radio"]'),
      new Promise(r => setTimeout(r, 5000))
    ]);

    const radios = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="radio"]');
      const list = [];
      inputs.forEach(el => {
        const labelEl = el.closest('label') || el.nextElementSibling;
        list.push({
          value: el.value,
          checked: el.checked,
          labelText: labelEl ? labelEl.textContent?.trim() : ''
        });
      });
      return list;
    });

    console.log('--- BUILD METHODS STATUS ---');
    console.log(JSON.stringify(radios, null, 2));
    console.log('----------------------------');

  } catch (err) {
    console.error(err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
