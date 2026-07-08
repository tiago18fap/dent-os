import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('[INFO] Iniciando Google Chrome em modo visível...');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
    });
  } catch (err) {
    console.log('[WARN] Falha ao iniciar Chrome. Tentando iniciar Chromium padrão...', err.message);
    browser = await chromium.launch({
      headless: false,
    });
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  
  const page = await context.newPage();
  console.log('[INFO] Acessando EasyPanel...');
  await page.goto('https://qfjowr.easypanel.host/', { waitUntil: 'domcontentloaded' });

  console.log('\n======================================================');
  console.log('[AÇÃO NECESSÁRIA] Por favor, faça login no EasyPanel na janela do navegador que se abriu.');
  console.log('Aguardando detecção do login...');
  console.log('======================================================\n');

  // Aguardar o login
  let loggedIn = false;
  for (let i = 0; i < 300; i++) { // Espera até 5 minutos
    try {
      const isDashboard = await page.locator('text="Projetos"').isVisible().catch(() => false) || 
                          await page.locator('text="+ Novo"').isVisible().catch(() => false) ||
                          page.url().includes('/projects');
      
      if (isDashboard) {
        loggedIn = true;
        console.log('[INFO] Login detectado!');
        break;
      }
    } catch (e) {
      // Ignorar erros temporários de navegação
    }
    await page.waitForTimeout(1000);
  }

  if (!loggedIn) {
    console.error('[ERRO] Tempo limite esgotado aguardando o login.');
    await browser.close();
    process.exit(1);
  }

  // Tirar print do dashboard logado
  if (!fs.existsSync('downloads')) fs.mkdirSync('downloads');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'downloads/easypanel-dashboard.png' });
  console.log('[INFO] Print do dashboard salvo em downloads/easypanel-dashboard.png');

  // Mapear elementos para encontrar como criar o serviço
  console.log('[INFO] Mapeando elementos relevantes da página...');
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a'))
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.innerText?.trim() || '',
        href: el.getAttribute('href') || '',
        className: el.className || '',
      }))
      .filter(item => {
        const text = item.text.toLowerCase();
        const href = item.href.toLowerCase();
        return text.includes('dentos') || text.includes('novo') || text.includes('create') || 
               href.includes('dentos') || href.includes('create') || text.includes('app') || 
               text.includes('service') || text.includes('projeto');
      });
  });

  console.log('[INFO] Elementos relevantes encontrados na página:');
  console.log(JSON.stringify(buttons, null, 2));

  // Manter aberto por mais 5 segundos e fechar
  await page.waitForTimeout(5000);
  await browser.close();
}

main().catch(console.error);
