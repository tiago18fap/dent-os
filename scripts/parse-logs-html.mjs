import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const filePath = 'file:///' + path.resolve('downloads/logs_body.html').replace(/\\/g, '/');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('[INFO] Lendo arquivo HTML local:', filePath);
    await page.goto(filePath);

    // Procurar por pre, code, console, log
    const selectors = ['pre', 'code', '.bg-black', '[class*="console"]', '[class*="log"]', '.terminal'];
    let found = false;

    for (const sel of selectors) {
      const els = await page.locator(sel).all();
      console.log(`Selector "${sel}": found ${els.length} elements`);
      for (let i = 0; i < els.length; i++) {
        const text = await els[i].textContent().catch(() => '');
        if (text && text.trim().length > 20) {
          console.log(`\n--- Match ${i + 1} for ${sel} (length ${text.trim().length}) ---`);
          console.log(text.trim().substring(0, 1500));
          found = true;
        }
      }
    }

    if (!found) {
      console.log('\nNo matching logs text found. Printing general text on the page:');
      const text = await page.locator('body').textContent();
      console.log(text?.trim().replace(/\s+/g, ' ').substring(0, 2000));
    }

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
