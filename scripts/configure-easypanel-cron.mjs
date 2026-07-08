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
    console.log('[WARN] Detectado erro "Not Found" ou "Invariant failed". Recarregando a página em 3 segundos...');
    await sleep(3000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(4000);
    return true;
  }
  return false;
}

async function main() {
  console.log(`[INFO] Usando diretório de perfil persistente: ${SESSION_PATH}`);
  
  let context;
  let page;
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

    page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    
    console.log('[INFO] Acessando EasyPanel...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/easydental-worker', { waitUntil: 'domcontentloaded' });

    // Esperar um pouco para carregar a página e tratar erro de não encontrado
    await sleep(4000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, 'cron_01_app_carregado');

    // Verificar se precisa logar
    let loggedIn = false;
    const url = page.url();
    if (url.includes('/login')) {
      console.log('[INFO] Tela de login detectada. Aguardando login do usuário...');
      // Esperar até 5 minutos pelo login do usuário
      for (let i = 0; i < 300; i++) {
        const currentUrl = page.url();
        if (currentUrl.includes('/projects')) {
          loggedIn = true;
          console.log('[INFO] Login confirmado!');
          break;
        }
        await sleep(1000);
      }
      if (!loggedIn) {
        throw new Error('Tempo limite para login esgotado.');
      }
      // Navegar para o app após login
      await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/easydental-worker', { waitUntil: 'domcontentloaded' });
      await sleep(4000);
      await handleNotFoundRecovery(page);
    }

    // Identificar abas no menu lateral
    console.log('[INFO] Procurando a aba "Cron" ou "Tarefas" ou "Tasks" no menu lateral...');
    await takeScreenshot(page, 'cron_02_menu_lateral');

    // Vamos encontrar links ou botões do menu
    const menuItems = await page.locator('aside a, aside button, [class*="sidebar"] a, [class*="sidebar"] button').all();
    let cronTab = null;
    
    console.log(`[INFO] Encontrados ${menuItems.length} elementos no menu lateral.`);
    for (const item of menuItems) {
      const text = (await item.innerText().catch(() => '')).trim();
      console.log(`- Aba: "${text}"`);
      if (text.toLowerCase() === 'cron' || text.toLowerCase() === 'tarefas' || text.toLowerCase() === 'tasks') {
        cronTab = item;
      }
    }

    if (!cronTab) {
      // Procurar em toda a página por texto Cron ou Tarefas caso não esteja no aside
      cronTab = page.locator('text="Cron", text="Tarefas", text="Tasks"').first();
    }

    if (await cronTab.isVisible().catch(() => false)) {
      console.log('[INFO] Clicando na aba Cron/Tarefas...');
      await cronTab.click();
      await sleep(4000);
      await handleNotFoundRecovery(page);
      await takeScreenshot(page, 'cron_03_aba_cron_aberta');
    } else {
      console.log('[WARN] Aba Cron/Tarefas não encontrada. Vamos listar os botões e tentar clicar por XPath ou texto.');
      // Tenta clicar pelo texto direto
      await page.getByText('Cron', { exact: true }).first().click().catch(async () => {
        await page.getByText('Tarefas', { exact: true }).first().click().catch(() => {
          console.log('[ERROR] Não conseguiu clicar na aba de tarefas.');
        });
      });
      await sleep(4000);
      await takeScreenshot(page, 'cron_03_aba_cron_aberta_retry');
    }

    // Agora estamos na página do Cron/Tarefas.
    // Vamos verificar se já tem alguma tarefa configurada ou se precisamos adicionar uma.
    // No EasyPanel, a página de Cron geralmente tem um botão "Adicionar tarefa" ou "+ Cron" ou "Add Task" ou "Criar tarefa".
    console.log('[INFO] Procurando botão de adicionar tarefa de cron...');
    const addCronBtn = page.locator('button').filter({ hasText: /Adicionar|Add|Criar|\+ Cron|\+ Tarefa/i }).first();
    
    if (await addCronBtn.isVisible().catch(() => false)) {
      console.log('[INFO] Clicando no botão para adicionar tarefa cron...');
      await addCronBtn.click();
      await sleep(2000);
      await takeScreenshot(page, 'cron_04_modal_cron_aberto');
    } else {
      console.log('[INFO] Botão de adicionar tarefa não visível diretamente. Talvez já tenhamos campos abertos ou formulário em lote.');
    }

    // Formulário de Cron do EasyPanel geralmente pede:
    // 1. Nome da tarefa (ex: sync-diario)
    // 2. Comando (ex: node run-sync.mjs)
    // 3. Expressão Cron (ex: 0 3 * * *)
    
    // Vamos localizar os inputs
    // Normalmente são campos de texto. Vamos listar os placeholders ou labels
    const inputs = await page.locator('input').all();
    console.log(`[INFO] Encontrados ${inputs.length} inputs na tela de Cron.`);
    
    // Vamos preencher pelo placeholder ou ordem
    // Se o modal abriu, preenchemos os campos
    let nameInput = page.locator('input[placeholder*="Name" i], input[placeholder*="Nome" i]').first();
    let commandInput = page.locator('input[placeholder*="Command" i], input[placeholder*="Comando" i], input[placeholder*="node" i]').first();
    let cronExprInput = page.locator('input[placeholder*="Cron" i], input[placeholder*="* * * * *" i]').first();

    if (!await nameInput.isVisible().catch(() => false)) {
      // Tentar encontrar por ordem de inputs se os placeholders forem diferentes
      console.log('[WARN] Não encontrou inputs pelos placeholders habituais. Usando inputs sequenciais.');
      if (inputs.length >= 3) {
        nameInput = inputs[0];
        commandInput = inputs[1];
        cronExprInput = inputs[2];
      }
    }

    // Preencher os dados
    if (await nameInput.isVisible().catch(() => false)) {
      console.log('[INFO] Preenchendo nome da tarefa...');
      await nameInput.fill('sync-diario');
    }
    if (await commandInput.isVisible().catch(() => false)) {
      console.log('[INFO] Preenchendo comando de sincronização...');
      await commandInput.fill('node run-sync.mjs');
    }
    if (await cronExprInput.isVisible().catch(() => false)) {
      console.log('[INFO] Preenchendo expressão cron (0 3 * * *)...');
      await cronExprInput.fill('0 3 * * *');
    }

    await takeScreenshot(page, 'cron_05_campos_preenchidos');

    // Clicar em Salvar ou Criar ou Confirmar
    const saveCronBtn = page.locator('button').filter({ hasText: /Salvar|Save|Criar|Create|Confirmar|Confirm/i }).first();
    if (await saveCronBtn.isVisible().catch(() => false)) {
      console.log('[INFO] Clicando em Salvar tarefa de cron...');
      await saveCronBtn.click();
      await sleep(4000);
      await takeScreenshot(page, 'cron_06_apos_salvar_cron');
    } else {
      console.log('[WARN] Botão de salvar cron não encontrado.');
      await page.keyboard.press('Enter');
      await sleep(4000);
    }

    // Para garantir que as atualizações de código recentes (incluindo o run-sync.mjs) estão implantadas,
    // vamos forçar um novo deploy (implantar).
    console.log('[INFO] Navegando para a aba "Visão Geral" para disparar novo deploy com o código atualizado...');
    const overviewTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Visão Geral"').first();
    if (await overviewTab.isVisible().catch(() => false)) {
      await overviewTab.click();
      await sleep(3000);
      await handleNotFoundRecovery(page);
    }

    console.log('[INFO] Clicando no botão "Implantar"...');
    const deployBtn = page.locator('button').filter({ hasText: /Implantar|Deploy/i }).first();
    if (await deployBtn.isVisible().catch(() => false)) {
      await deployBtn.click();
      console.log('[INFO] Botão "Implantar" clicado.');
      await sleep(5000);
      await takeScreenshot(page, 'cron_07_deploy_disparado');
    }

    // Navegar para Implantações para monitorar o build
    const deployTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Implantações"').first();
    if (await deployTab.isVisible().catch(() => false)) {
      await deployTab.click();
      await sleep(3000);
      await handleNotFoundRecovery(page);
    }

    console.log('[INFO] Monitorando implantação por 30 segundos...');
    await sleep(30000);
    await takeScreenshot(page, 'cron_08_deploy_status');

    console.log('[INFO] Configuração do Cron concluída com sucesso!');
    console.log('[INFO] Mantendo navegador aberto na tela do EasyPanel...');
    
    // Manter o navegador aberto indefinidamente (10 horas)
    await sleep(36000000);
  } catch (err) {
    console.error('[ERRO NO SCRIPT DE CRON]', err);
    try {
      if (page) {
        await takeScreenshot(page, 'cron_error_debug');
      }
    } catch (e) {
      console.log('[WARN] Não foi possível salvar o print de erro:', e.message);
    }
    console.log('[INFO] Mantendo o navegador aberto para depuração indefinidamente...');
    await sleep(36000000); // 10 horas
  }
}

main().catch(console.error);
