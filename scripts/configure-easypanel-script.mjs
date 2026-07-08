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
  console.log('[INFO] Iniciando criação do script no EasyPanel...');
  
  let context;
  try {
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: false,
      channel: 'chrome',
      viewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  try {
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/easydental-worker', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await handleNotFoundRecovery(page);

    // Ir para a aba Scripts
    const scriptsTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Scripts"').first();
    await scriptsTab.click();
    await sleep(3000);
    await handleNotFoundRecovery(page);

    // Verificar se já existe "sync-diario"
    const hasScript = await page.getByText('sync-diario').first().isVisible().catch(() => false);
    if (hasScript) {
      console.log('[INFO] O script "sync-diario" já existe na lista.');
    } else {
      console.log('[INFO] Clicando em "Adicionar Script"...');
      const addScriptBtn = page.locator('button').filter({ hasText: /Adicionar Script|Add Script/i }).first();
      await addScriptBtn.click();
      await sleep(2000);

      // Preencher formulário
      console.log('[INFO] Preenchendo campos...');
      await page.locator('input[name="name"]').fill('sync-diario');
      await page.locator('textarea[name="script"]').fill('node run-sync.mjs');
      await takeScreenshot(page, 'script_preenchido');

      // Clicar em Criar
      console.log('[INFO] Clicando em Criar...');
      const createBtn = page.locator('button').filter({ hasText: /^Criar$/ }).first();
      await createBtn.click();
      await sleep(4000);
      await takeScreenshot(page, 'script_criado');
    }

    // Agora vamos analisar a lista de scripts para ver se podemos configurar o cron.
    // Vamos listar os textos dos elementos na tabela/lista de scripts.
    const bodyText = await page.locator('main').innerText();
    console.log('--- CONTEÚDO DA TELA APÓS CRIAÇÃO DO SCRIPT ---');
    console.log(bodyText);
    console.log('-----------------------------------------------');

    // Em muitas versões do EasyPanel, os scripts têm opções à direita como "Executar", "Cron", ou um ícone de engrenagem.
    // Vamos listar os inputs e botões disponíveis no container do script "sync-diario"
    // Normalmente as linhas de script têm um container ou div correspondente.
    // Vamos procurar por botões ou links que possam abrir configurações de agendamento.
    const buttons = await page.locator('button').all();
    console.log(`[INFO] Encontrados ${buttons.length} botões na tela.`);
    for (let i = 0; i < buttons.length; i++) {
      const text = (await buttons[i].innerText()).trim();
      const isVisible = await buttons[i].isVisible();
      console.log(`Botão ${i}: Texto="${text}", Visible=${isVisible}`);
    }

    // Vamos clicar no próprio texto do script "sync-diario" ou em botões próximos a ele.
    // Procurar se existe algum input de cron
    const cronInputs = await page.locator('input[placeholder*="* * * * *"], input[placeholder*="cron" i]').all();
    console.log(`[INFO] Encontrados ${cronInputs.length} inputs de cron na tela.`);
    for (let i = 0; i < cronInputs.length; i++) {
      console.log(`Input Cron ${i}: Visible=${await cronInputs[i].isVisible()}`);
    }

  } catch (err) {
    console.error('[ERRO SCRIPT CREATION]', err);
  } finally {
    await context.close();
  }
}

main().catch(console.error);
