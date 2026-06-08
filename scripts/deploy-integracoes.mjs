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
  console.log('[INFO] Iniciando deploy do app de integrações e atualização do proxy reverso no EasyPanel...');
  
  // Limpar travas do Chrome para evitar conflito de processos
  const locks = ['lockfile', 'SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const lock of locks) {
    try {
      const lockPath = path.join(SESSION_PATH, lock);
      fs.unlinkSync(lockPath);
    } catch (e) {}
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: true,
      channel: 'chrome',
      viewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-process-singleton',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });
  } catch (err) {
    console.log('[WARN] Falha ao iniciar Chrome local com perfil. Tentando sem canal do Chrome...', err.message);
    context = await chromium.launchPersistentContext(SESSION_PATH, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-process-singleton',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  try {
    // 1. Acessar o EasyPanel
    await page.goto('https://qfjowr.easypanel.host/projects/dentos', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, 'deploy_int_01_dentos_list');

    // 2. Verificar se o serviço "integracoes" já existe
    const hasIntegracoesService = await page.getByText('integracoes').first().isVisible().catch(() => false);
    
    if (hasIntegracoesService) {
      console.log('[INFO] O serviço "integracoes" já existe. Acessando...');
      const sidebarService = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="integracoes"').first();
      if (await sidebarService.isVisible().catch(() => false)) {
        await sidebarService.click();
      } else {
        await page.locator('text="integracoes"').first().click();
      }
      await sleep(3000);
      await handleNotFoundRecovery(page);
    } else {
      console.log('[INFO] O serviço "integracoes" não existe. Criando novo...');
      
      // Clicar em "+ Serviço"
      const plusServiceBtn = page.locator('button, a').filter({ hasText: 'Serviço' }).first();
      await plusServiceBtn.click();
      await sleep(3000);
      
      // Clicar na opção "App" ou "Aplicativo"
      const appOption = page.locator('button, a, [role="button"], div').filter({ hasText: /^Aplicativo$|^App$/ }).first();
      await appOption.click();
      await sleep(3000);

      // Digitar nome do app: integracoes
      const nameInput = page.locator('input[type="text"], input:not([type="checkbox"]):not([type="radio"])').first();
      await nameInput.fill('integracoes');
      console.log('[INFO] Nome digitado: integracoes');
      
      // Enviar
      const submitBtn = page.locator('button').filter({ hasText: /Criar|Create|Salvar|Save/i }).first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await sleep(5000);
      await handleNotFoundRecovery(page);
      await takeScreenshot(page, 'deploy_int_02_created');
    }

    // 3. Configurar Fonte do app integracoes
    console.log('[INFO] Acessando aba "Fonte" para o app "integracoes"...');
    const fonteTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Fonte"').first();
    await fonteTab.click();
    await sleep(3000);
    await handleNotFoundRecovery(page);

    const gitSubTab = page.locator('button, a').filter({ hasText: /^Git$/ }).first();
    const repoInput = page.locator('input[placeholder*="git" i], input[placeholder*="repo" i], input[placeholder*="url" i]').first();
    
    if (await gitSubTab.isVisible().catch(() => false) || await repoInput.isVisible().catch(() => false)) {
      if (await gitSubTab.isVisible().catch(() => false)) {
        await gitSubTab.click();
        await sleep(2000);
      }

      console.log('[INFO] Localizando todos os inputs de texto da sub-aba Git...');
      const textInputs = await page.locator('input[type="text"], input:not([type="checkbox"]):not([type="radio"]):not([type="file"])').all();
      
      console.log(`[INFO] Encontrados ${textInputs.length} inputs de texto.`);
      if (textInputs.length >= 3) {
        console.log('[INFO] Preenchendo campos pelo índice sequencial...');
        await textInputs[0].fill('https://github.com/tiago18fap/dent-os');
        await textInputs[1].fill('main');
        await textInputs[2].fill('/integracoes');
      } else {
        console.log('[WARN] Poucos inputs encontrados. Usando seletores de fallback...');
        await page.locator('input').nth(0).fill('https://github.com/tiago18fap/dent-os');
        await page.locator('input').nth(1).fill('main');
        await page.locator('input').nth(2).fill('/integracoes');
      }

      // Salvar
      const saveSourceBtn = page.locator('button').filter({ hasText: /Salvar|Save/i }).first();
      await saveSourceBtn.click();
      console.log('[INFO] Salvou configurações de fonte iniciais.');
      await sleep(5000);
    }

    // Tratar assistente do passo de Construção (se aparecer)
    const isBuildStep = await page.getByText('Construção').first().isVisible().catch(() => false) ||
                        await page.getByText('Nixpacks').first().isVisible().catch(() => false);
                        
    if (isBuildStep) {
      console.log('[INFO] Assistente de Construção detectado. Selecionando Dockerfile...');
      const dockerfileOption = page.locator('text="Dockerfile"').first();
      await dockerfileOption.click();
      await sleep(2000);
      
      const saveBtn = page.locator('button').filter({ hasText: /Salvar|Save|Confirmar|Confirm|Avançar|Next/i }).first();
      await saveBtn.click();
      await sleep(5000);
      await handleNotFoundRecovery(page);
    }

    // Configurar método de build como Dockerfile na aba principal se necessário
    const isStillOnSourcePage = page.url().includes('/source') || page.url().includes('/fonte') || await page.locator('text="Método de Build"').first().isVisible().catch(() => false);
    
    if (isStillOnSourcePage) {
      try {
        const buildMethodSelect = page.locator('select').first();
        const dockerfilePathInput = page.locator('input[placeholder*="Dockerfile" i]').first();
        
        if (await buildMethodSelect.isVisible().catch(() => false) && await dockerfilePathInput.isVisible().catch(() => false)) {
          console.log('[INFO] Configurando método de build como Dockerfile na página principal de Fonte...');
          await buildMethodSelect.selectOption({ label: 'Dockerfile' }).catch(async () => {
            await buildMethodSelect.selectOption({ value: 'dockerfile' }).catch(() => {});
          });
          await sleep(2000);

          await dockerfilePathInput.fill('Dockerfile');

          const saveSourceBtn2 = page.locator('button').filter({ hasText: /Salvar|Save/i }).first();
          if (await saveSourceBtn2.isVisible()) {
            await saveSourceBtn2.click();
            console.log('[INFO] Salvou método de build Dockerfile.');
            await sleep(4000);
          }
        }
      } catch (selectErr) {
        console.log('[WARN] Falha ao configurar seletor secundário de Dockerfile (provavelmente já salvo):', selectErr.message);
      }
    }

    await takeScreenshot(page, 'deploy_int_03_source_configured');

    // 4. Ir para a aba Visão Geral e disparar o deploy do app integracoes
    console.log('[INFO] Disparando deploy do app integracoes...');
    const overviewTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Visão Geral"').first();
    await overviewTab.click();
    await sleep(3000);
    await handleNotFoundRecovery(page);

    const deployBtn = page.locator('button').filter({ hasText: /Implantar|Deploy/i }).first();
    await deployBtn.click();
    console.log('[INFO] Botão Implantar clicado para o app integracoes.');
    await sleep(5000);

    // 5. Ir para a aba "web" principal para disparar o redeploy com as novas rotas do Nginx
    console.log('[INFO] Navegando para o app "web" para aplicar as novas regras do Nginx...');
    
    // Selecionar o serviço "web" na barra lateral esquerda (sob "SERVIÇOS")
    // O menu lateral tem a lista de serviços. Vamos procurar pelo link/botão "web"
    const webServiceLink = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="web"').first();
    if (await webServiceLink.isVisible()) {
      await webServiceLink.click();
      await sleep(4000);
      await handleNotFoundRecovery(page);
    } else {
      // Tentar via URL direta
      await page.goto('https://qfjowr.easypanel.host/projects/dentos/app/web', { waitUntil: 'domcontentloaded' });
      await sleep(4000);
      await handleNotFoundRecovery(page);
    }

    await takeScreenshot(page, 'deploy_int_04_web_overview');

    // Clicar em "Implantar" na aplicação "web"
    console.log('[INFO] Disparando deploy da aplicação "web" para atualizar o Nginx...');
    const webDeployBtn = page.locator('button').filter({ hasText: /Implantar|Deploy/i }).first();
    await webDeployBtn.click();
    console.log('[INFO] Botão Implantar clicado para a aplicação "web".');
    await sleep(5000);
    await takeScreenshot(page, 'deploy_int_05_web_deployed');

    // Ir para a aba Implantações da "web" para monitorar
    const webDeployTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Implantações"').first();
    await webDeployTab.click();
    await sleep(4000);
    await takeScreenshot(page, 'deploy_int_06_web_monitor');

    console.log('[INFO] Deploy de ambas as aplicações disparados e configurados!');
    console.log('[INFO] Aguardando 15 segundos para confirmar estabilidade...');
    await sleep(15000);

  } catch (err) {
    console.error('[ERRO DEPLOY INTEGRACOES]', err);
    try {
      if (page) {
        await takeScreenshot(page, 'deploy_int_error_debug');
      }
    } catch (e) {
      console.log('[WARN] Não foi possível salvar o print de erro:', e.message);
    }
  } finally {
    if (context) {
      console.log('[INFO] Fechando navegador...');
      await context.close().catch(() => {});
    }
  }
}

main().catch(console.error);
