import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Diretório da sessão do Chrome para manter cookies e login salvos
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
    await page.goto('https://qfjowr.easypanel.host/', { waitUntil: 'domcontentloaded' });

    // 1. Verificar se precisa logar
    console.log('[INFO] Verificando estado do login...');
    let loggedIn = false;
    
    await sleep(3000);
    await takeScreenshot(page, 'login_status');

    // Esperar até 20 minutos (1200 segundos) pelo login
    for (let i = 0; i < 1200; i++) {
      try {
        const url = page.url();
        const hasProjectsInUrl = url.includes('/projects');
        const hasDashboardIndicators = await page.locator('text="Projects"').isVisible().catch(() => false) || 
                                       await page.locator('text="Projetos"').isVisible().catch(() => false) ||
                                       await page.locator('text="dentos"').isVisible().catch(() => false) ||
                                       await page.locator('text="Log out"').isVisible().catch(() => false);
        
        if (hasProjectsInUrl || hasDashboardIndicators) {
          loggedIn = true;
          console.log('[INFO] Login confirmado!');
          break;
        }

        // Tentar login automático se o Chrome já preencheu os campos salvos
        const emailInput = page.locator('input[type="email"], input[name="email"]').first();
        const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
        const loginBtn = page.locator('button:has-text("Login"), button[type="submit"]').first();

        if (await emailInput.isVisible().catch(() => false) && 
            await passwordInput.isVisible().catch(() => false) && 
            await loginBtn.isVisible().catch(() => false)) {
          const emailVal = await emailInput.inputValue().catch(() => '');
          const passVal = await passwordInput.inputValue().catch(() => '');
          
          if (emailVal.includes('@') && passVal.length > 0) {
            console.log('[INFO] Detectados campos de login preenchidos automaticamente. Tentando realizar login automático...');
            const rememberCheckbox = page.locator('input[type="checkbox"], label:has-text("Remember") >> xpath=../..//input').first();
            if (await rememberCheckbox.isVisible().catch(() => false)) {
              const isChecked = await rememberCheckbox.isChecked().catch(() => false);
              if (!isChecked) {
                await rememberCheckbox.check().catch(() => {});
                console.log('[INFO] Marcou a caixa "Remember Me".');
              }
            }
            await loginBtn.click();
            await sleep(3000);
          }
        }
        
        if (i % 30 === 0) {
          console.log(`[AGUARDANDO LOGIN] URL atual: ${url}. Aguardando login... (Tentativa ${i}/1200)`);
          await takeScreenshot(page, 'login_status');
        }
      } catch (e) {
        if (e.message.includes('closed') || e.message.includes('target')) {
          console.error('[ERRO] O navegador foi fechado.');
          throw e;
        }
      }
      await sleep(1000);
    }

    if (!loggedIn) {
      throw new Error('Tempo limite para login esgotado.');
    }

    await sleep(2000);

    // Navegar para o projeto dentos
    console.log('[INFO] Indo para a lista do projeto dentos...');
    await page.goto('https://qfjowr.easypanel.host/projects/dentos', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, '02_projeto_dentos_carregado');

    // Verificar se o serviço "easydental-worker" está na barra lateral ou na tela ou se já estamos nele
    console.log('[INFO] Verificando se "easydental-worker" existe...');
    const isAlreadyOnAppPage = page.url().includes('/app/easydental-worker');
    const serviceExists = isAlreadyOnAppPage || await page.getByText('easydental-worker').first().isVisible().catch(() => false);

    if (serviceExists) {
      console.log('[INFO] O serviço "easydental-worker" já existe. Selecionando ele...');
      const sidebarService = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="easydental-worker"').first();
      if (await sidebarService.isVisible().catch(() => false)) {
        await sidebarService.click().catch(() => {});
      } else {
        await page.locator('text="easydental-worker"').first().click().catch(() => {});
      }
      await sleep(3000);
      await handleNotFoundRecovery(page);
    } else {
      console.log('[INFO] O serviço "easydental-worker" não existe. Criando um novo...');
      
      // Clicar em "+ Serviço"
      const plusServiceBtn = page.locator('button, a').filter({ hasText: 'Serviço' }).first();
      await plusServiceBtn.waitFor({ state: 'visible', timeout: 10000 });
      await plusServiceBtn.click();
      console.log('[INFO] Clicou em "+ Serviço"');
      await sleep(3000);

      // Clicar na opção "App" ou "Aplicativo" na página
      console.log('[INFO] Procurando a opção "App" / "Aplicativo"...');
      await takeScreenshot(page, '03_apos_clicar_criar_servico');
      
      // Encontra todos os elementos clicáveis na tela
      const clickableElements = await page.locator('button, a, [role="button"], li, div h3, div').all();
      let clickedApp = false;
      
      for (const el of clickableElements) {
        const text = (await el.innerText().catch(() => '')).trim();
        if (text === 'Aplicativo' || text === 'App') {
          const isVisible = await el.isVisible().catch(() => false);
          if (isVisible) {
            console.log(`[INFO] Clicando na opção App/Aplicativo encontrada: "${text}"`);
            await el.click();
            clickedApp = true;
            await sleep(3000);
            break;
          }
        }
      }

      if (!clickedApp) {
        throw new Error('Não foi possível localizar a opção "App" ou "Aplicativo" no menu.');
      }

      await takeScreenshot(page, '04_apos_clicar_aplicativo');

      // Se por algum motivo o modal não abriu (o input de nome não está visível), tenta clicar de novo
      const nameInput = page.locator('input[type="text"], input:not([type="checkbox"]):not([type="radio"])').first();
      const isInputVisible = await nameInput.isVisible().catch(() => false);
      if (!isInputVisible) {
        console.log('[WARN] Modal de nome do aplicativo não apareceu. Tentando clicar na opção Aplicativo novamente...');
        const retryApp = page.locator('button, a, [role="button"], div').filter({ hasText: /^Aplicativo$|^App$/ }).first();
        if (await retryApp.isVisible().catch(() => false)) {
          await retryApp.click().catch(() => {});
          await sleep(3000);
          await takeScreenshot(page, '04_apos_clicar_aplicativo_retry');
        }
      }

      // Inserir nome "easydental-worker"
      await nameInput.waitFor({ state: 'visible', timeout: 10000 });
      await nameInput.fill('easydental-worker');
      console.log('[INFO] Digitou o nome do serviço: easydental-worker');
      
      // Enviar formulário (Criar)
      const submitBtn = page.locator('button').filter({ hasText: /Criar|Create|Salvar|Save/i }).first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }
      console.log('[INFO] Formulário de criação enviado. Aguardando processamento...');
      await sleep(4000);

      // Autoreparação: Verificar se deu erro de "already exists" ou "já existe"
      const alreadyExists = await page.getByText(/already exists|já existe/i).first().isVisible().catch(() => false);
      if (alreadyExists) {
        console.log('[INFO] O serviço "easydental-worker" já existe no EasyPanel (erro do modal). Fechando modal...');
        const closeBtn = page.locator('button:has-text("X"), button:has-text("x"), button[aria-label*="close" i], button[class*="close" i]').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click().catch(() => {});
        }
        await page.goto('https://qfjowr.easypanel.host/projects/dentos', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(4000);
        const sidebarService = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="easydental-worker"').first();
        if (await sidebarService.isVisible().catch(() => false)) {
          await sidebarService.click().catch(() => {});
        } else {
          await page.locator('text="easydental-worker"').first().click().catch(() => {});
        }
        await sleep(3000);
        await handleNotFoundRecovery(page);
      }
    }

    await takeScreenshot(page, '05_servico_aberto');

    // 3. Configurar Fonte
    // Caso 3a: Verificar se já está na tela de configuração do repositório Git
    const gitSubTab = page.locator('button, a').filter({ hasText: /^Git$/ }).first();
    const repoInputTest = page.locator('input[placeholder*="git" i], input[placeholder*="repo" i], input[placeholder*="url" i]').first();
    let isGitTabOrInputVisible = await gitSubTab.isVisible().catch(() => false) || await repoInputTest.isVisible().catch(() => false);

    // Se não estiver visível e não for o passo de Construção, tenta clicar em Fonte no menu lateral
    const isBuildStepInitial = await page.getByText('Construção').first().isVisible().catch(() => false) ||
                               await page.getByText('Nixpacks').first().isVisible().catch(() => false);

    if (!isGitTabOrInputVisible && !isBuildStepInitial) {
      console.log('[INFO] Aba Fonte/Git não está visível. Procurando aba "Fonte" no menu lateral...');
      const fonteTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Fonte"').first();
      if (await fonteTab.isVisible().catch(() => false)) {
        await fonteTab.click();
        console.log('[INFO] Clicou na aba Fonte do menu lateral. Aguardando sub-abas...');
        await sleep(3000);
        await handleNotFoundRecovery(page);
      }
    }

    // Se a aba Git estiver visível agora, configure o repositório
    const gitSubTabBtn = page.locator('button, a').filter({ hasText: /^Git$/ }).first();
    const repoInput = page.locator('input[placeholder*="bitbucket" i], input[placeholder*="git" i], input[placeholder*="repo" i], input[placeholder*="url" i]').first();
    
    if (await gitSubTabBtn.isVisible().catch(() => false) || await repoInput.isVisible().catch(() => false)) {
      if (await gitSubTabBtn.isVisible().catch(() => false)) {
        console.log('[INFO] Clicando na sub-aba "Git"...');
        await gitSubTabBtn.click();
        await sleep(3000);
      }
      await takeScreenshot(page, '06_aba_fonte_git_selecionada');

      await repoInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      console.log('[INFO] Preenchendo repositório...');
      await repoInput.fill('https://github.com/tiago18fap/dent-os');

      // Ramo/Branch - Corrigido para evitar seletores xpath complexos
      const branchInput = page.locator('input[placeholder*="main" i], input[placeholder*="branch" i]').first();
      if (await branchInput.isVisible()) {
        console.log('[INFO] Preenchendo Ramo/Branch...');
        await branchInput.fill('main');
      }

      // Caminho de Build (com barra no início!) - Corrigido para evitar seletores xpath complexos
      const buildPathInput = page.locator('input[placeholder="/"]').first();
      if (await buildPathInput.isVisible()) {
        console.log('[INFO] Preenchendo Caminho de Build...');
        await buildPathInput.fill('/services/easydental-worker');
      }

      // Salvar Fonte
      const saveSourceBtn = page.locator('button').filter({ hasText: /Salvar|Save/i }).first();
      if (await saveSourceBtn.isVisible()) {
        await saveSourceBtn.click();
        console.log('[INFO] Clicou em Salvar na aba Fonte (Initial Git Setup).');
        await sleep(5000);
      }

      await takeScreenshot(page, '07_aba_fonte_pos_salvar');
    }

    // Caso 3b: Verificar se entrou no passo "Construção" do assistente
    let isBuildStep = await page.getByText('Construção').first().isVisible().catch(() => false) ||
                      await page.getByText('Nixpacks').first().isVisible().catch(() => false);
                      
    if (isBuildStep) {
      console.log('[INFO] Detectado passo de Construção no assistente. Selecionando Dockerfile...');
      // Clicar especificamente na opção Dockerfile
      const dockerfileOption = page.locator('text="Dockerfile"').first();
      await dockerfileOption.click();
      await sleep(2000);
      await takeScreenshot(page, '07_construcao_dockerfile_selecionado');
      
      const saveBtn = page.locator('button').filter({ hasText: /Salvar|Save|Confirmar|Confirm|Avançar|Next/i }).first();
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        console.log('[INFO] Clicou em Salvar/Avançar no passo de Construção.');
        await sleep(5000);
      }
    }

    // Garantir que a aba "Fonte" do menu lateral está carregada para verificar se apareceu a opção do método de build
    console.log('[INFO] Navegando de volta para a aba "Fonte" no menu lateral para verificar Método de Build...');
    const fonteSidebarTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Fonte"').first();
    
    let hasFonteSidebarTab = await fonteSidebarTab.isVisible().catch(() => false);
    if (!hasFonteSidebarTab) {
      console.log('[WARN] Aba Fonte no menu lateral não está visível ainda. Aguardando mais 10s...');
      await sleep(10000);
      hasFonteSidebarTab = await fonteSidebarTab.isVisible().catch(() => false);
    }
    
    if (hasFonteSidebarTab) {
      await fonteSidebarTab.click();
      await sleep(3000);
      await handleNotFoundRecovery(page);
    }

    // Tentar configurar o Build Method como Dockerfile se a opção estiver disponível
    const buildMethodSelect = page.locator('select').first();
    if (await buildMethodSelect.isVisible().catch(() => false)) {
      console.log('[INFO] Configurando Método de Build como Dockerfile...');
      await buildMethodSelect.selectOption({ label: 'Dockerfile' }).catch(async () => {
        await buildMethodSelect.selectOption({ value: 'dockerfile' }).catch(() => {});
      });
      await sleep(2000);

      // Dockerfile Path - Corrigido para evitar erros de XPath de sintaxe com vírgulas
      const dockerfilePathInput = page.locator('input[placeholder*="Dockerfile" i]').first();
      if (await dockerfilePathInput.isVisible()) {
        console.log('[INFO] Preenchendo Caminho do Dockerfile...');
        await dockerfilePathInput.fill('Dockerfile');
      }

      // Salvar novamente se necessário
      const saveSourceBtn2 = page.locator('button').filter({ hasText: /Salvar|Save/i }).first();
      if (await saveSourceBtn2.isVisible()) {
        await saveSourceBtn2.click();
        console.log('[INFO] Salvou configurações do método de build.');
        await sleep(4000);
      }
    }

    // 4. Ir para aba "Ambiente"
    console.log('[INFO] Clicando na aba "Ambiente" no menu lateral...');
    const ambienteTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Ambiente"').first();
    await ambienteTab.waitFor({ state: 'visible', timeout: 10000 });
    await ambienteTab.click();
    console.log('[INFO] Clicou na aba Ambiente. Aguardando formulário...');
    await sleep(3000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, '08_aba_ambiente_carregada');
    
    const envContainer = page.locator('main, body');
    const bulkEditorBtn = envContainer.locator('button').filter({ hasText: /Bulk|lote/i }).first();
    
    let hasBulk = await bulkEditorBtn.isVisible().catch(() => false);
    if (hasBulk) {
      await bulkEditorBtn.click();
    }

    const envVars = {
      'SUPABASE_URL': 'https://dzbeorfkualalocrvobe.supabase.co',
      'SUPABASE_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6YmVvcmZrdWFsYWxvY3J2b2JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjYyMjIxNSwiZXhwIjoyMDgyMTk4MjE1fQ.EtxdNtddWDFNu_k2pvcmqn72UB8YWAyIKcvLNkcEHog',
      'AUTH_TOKEN': 'dentos-worker-secret-2026'
    };

    if (hasBulk) {
      await sleep(1000);
      const textarea = envContainer.locator('textarea').first();
      if (await textarea.isVisible()) {
        const envString = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join('\n');
        await textarea.fill(envString);
        console.log('[INFO] Preencheu as variáveis de ambiente.');
        
        const saveEnvBtn = envContainer.locator('button').filter({ hasText: /Confirmar|Salvar|Save/i }).first();
        if (await saveEnvBtn.isVisible()) {
          await saveEnvBtn.click();
          console.log('[INFO] Clicou em Salvar no Bulk Editor.');
        }
        await sleep(3000);
      }
    } else {
      console.log('[INFO] Adicionando variáveis manualmente...');
      for (const [key, value] of Object.entries(envVars)) {
        const keyInputs = await envContainer.locator('input[placeholder*="key"], input[placeholder*="Chave"]').all();
        const valInputs = await envContainer.locator('input[placeholder*="value"], input[placeholder*="Valor"]').all();
        if (keyInputs.length > 0 && valInputs.length > 0) {
          await keyInputs[keyInputs.length - 1].fill(key);
          await valInputs[valInputs.length - 1].fill(value);
          const addBtn = envContainer.locator('button').filter({ hasText: /Salvar|Save/i }).first();
          if (await addBtn.isVisible()) {
            await addBtn.click();
            await sleep(1500);
          }
        }
      }
    }

    // 5. Ir para aba "Visão Geral"
    console.log('[INFO] Voltando para a aba "Visão Geral" no menu lateral...');
    const overviewTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Visão Geral"').first();
    await overviewTab.waitFor({ state: 'visible', timeout: 10000 });
    await overviewTab.click();
    await sleep(3000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, '10_visao_geral_pronto');

    // Clicar em Implantar
    console.log('[INFO] Clicando no botão "Implantar"...');
    const deployBtn = page.locator('button').filter({ hasText: /Implantar|Deploy/i }).first();
    await deployBtn.waitFor({ state: 'visible', timeout: 5000 });
    await deployBtn.click();
    console.log('[INFO] Botão "Implantar" clicado.');
    await sleep(5000);
    await takeScreenshot(page, '11_apos_deploy_disparado');

    // 6. Ir para aba "Implantações" para monitorar
    console.log('[INFO] Acessando a aba "Implantações" no menu lateral para monitorar o build...');
    const deployTab = page.locator('aside, .sidebar, [class*="sidebar"]').locator('text="Implantações"').first();
    await deployTab.waitFor({ state: 'visible', timeout: 10000 });
    await deployTab.click();
    await sleep(5000);
    await handleNotFoundRecovery(page);
    await takeScreenshot(page, '12_aba_implantaçoes');

    console.log('[INFO] Concluído com sucesso! O navegador continuará aberto indefinidamente...');
    // Esperar 10 horas para manter o navegador aberto no final
    await sleep(36000000);
  } catch (err) {
    console.error('[ERRO NO SCRIPT]', err);
    try {
      if (page) {
        await takeScreenshot(page, 'error_debug');
      }
    } catch (e) {
      console.log('[WARN] Não foi possível salvar o print de erro:', e.message);
    }
    console.log('[INFO] Mantendo o navegador aberto para depuração indefinidamente...');
    await sleep(36000000); // 10 horas
  }
}

main().catch(console.error);
