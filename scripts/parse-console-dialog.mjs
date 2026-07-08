import { chromium } from 'playwright';
import path from 'path';

const filePath = 'file:///' + path.resolve('downloads/console_dialog.html').replace(/\\/g, '/');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('[INFO] Lendo arquivo HTML local:', filePath);
    await page.goto(filePath);

    // Listar todos os elementos dentro de dialogs ou bg-black
    const elements = await page.evaluate(() => {
      const results = [];
      const all = document.querySelectorAll('*');
      all.forEach((el, idx) => {
        const tag = el.tagName;
        const className = String(el.className || '');
        const id = el.id || '';
        const text = el.textContent?.trim() || '';
        const type = el.getAttribute('type') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        
        // Salvar apenas elementos interessantes como inputs, textareas, ou com classes relacionadas a terminal/xterm
        if (tag === 'INPUT' || tag === 'TEXTAREA' || className.includes('terminal') || className.includes('xterm') || className.includes('bg-black') || className.includes('dialog')) {
          results.push({
            idx,
            tag,
            id,
            class: className,
            type,
            placeholder,
            textSnippet: text.substring(0, 100)
          });
        }
      });
      return results;
    });

    console.log('--- ELEMENTOS ENCONTRADOS ---');
    console.log(JSON.stringify(elements, null, 2));
    console.log('-----------------------------');

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
