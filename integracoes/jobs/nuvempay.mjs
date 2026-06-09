import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Script de Automação do NuvemPay (Job Playwright)
 * 
 * @param {Object} credentials - Credenciais de login (username, password, webhookUrl, webhookSecret)
 * @param {Function} log - Função para logar mensagens no console web da fila
 */
/**
 * Helper para verificar se a página já está logada
 */
async function checkIsLogged(page) {
  try {
    const urlStr = page.url();
    const urlObj = new URL(urlStr);
    const pathLower = urlObj.pathname.toLowerCase();
    
    const hasLoggedPath = (pathLower.includes('/admin') || pathLower.includes('/home') || pathLower.includes('/dashboard') || pathLower.includes('/nuvempago')) && 
                          (!pathLower.includes('/login') || pathLower.includes('/nuvempago')) && 
                          (!pathLower.includes('/auth') || pathLower.includes('/nuvempago'));
    
    const hasSidebar = await page.locator('[data-testid="sidebar"], .nav-sidebar, #admin-menu, #nuvempago-admin, .nuvempago-dashboard').first().isVisible().catch(() => false);
    const hasNuvemPagoElements = await page.locator('text=Saldo disponível, text=Lançamentos futuros, th:has-text("Cliente")').first().isVisible().catch(() => false);
    
    return hasLoggedPath || hasSidebar || hasNuvemPagoElements;
  } catch (e) {
    return false;
  }
}

/**
 * Helper para aguardar a presença de seletores em qualquer frame da página
 */
async function waitForSelectorInAnyFrame(page, selectors, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const frame of page.frames()) {
      for (const selector of selectors) {
        try {
          const el = frame.locator(selector).first();
          if (await el.isVisible()) {
            return frame;
          }
        } catch (e) {}
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

export async function run(credentials, log, taskId = 'unknown', controller = {}) {
  const { username, password, webhookUrl, webhookSecret, storeDomain } = credentials;
  
  const sessionPath = path.resolve('data/sessions/nuvempay');
  
  // Limpar processos órfãos do Chromium/Chrome no container para evitar conflitos de trava
  if (process.platform !== 'win32') {
    try {
      log('Limpando processos órfãos do Chromium/Chrome no container...');
      execSync('pkill -9 -f chromium || true');
      execSync('pkill -9 -f chrome || true');
      await sleep(1000);
    } catch (err) {
      log('Aviso ao limpar processos órfãos: ' + err.message, 'WARN');
    }
  }

  // Limpar travas/locks de sessões anteriores que possam impedir a inicialização (tratando links quebrados)
  const locks = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const lock of locks) {
    try {
      const lockPath = path.join(sessionPath, lock);
      // Usamos unlinkSync diretamente pois fs.existsSync retorna false para links simbólicos quebrados
      fs.unlinkSync(lockPath);
      log(`Limpando trava ${lock} de execução anterior...`);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        log(`Aviso ao remover ${lock}: ` + e.message, 'WARN');
      }
    }
  }

  log(`Iniciando navegador Chromium com perfil persistente em: ${sessionPath}...`);
  
  const context = await chromium.launchPersistentContext(sessionPath, {
    headless: false, // Abre a janela física para permitir resolver Captcha/MFA
    viewport: { width: 1280, height: 800 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check'
    ],
    recordVideo: {
      dir: path.resolve(`data/media/temp/${taskId}`),
      size: { width: 1280, height: 800 }
    }
  });

  // Registrar callback para cancelamento manual pelo usuário
  controller.cancel = async () => {
    log('Cancelamento solicitado pelo usuário. Encerrando execução do navegador...', 'WARN');
    await context.close().catch(() => {});
  };

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  let success = false;
  let dataScraped = {};

  let storeUrl = 'https://admin.nuvemshop.com.br/login';
  if (storeDomain) {
    let domain = storeDomain.trim();
    if (!domain.includes('.')) {
      domain = `${domain}.lojavirtualnuvem.com.br`;
    }
    if (!domain.startsWith('http')) {
      domain = `https://${domain}`;
    }
    // Se a URL já contém "/admin", usamos ela diretamente, senão apontamos para /admin/login
    storeUrl = domain.includes('/admin') ? domain : `${domain}/admin/login`;
  }

  try {
    log(`Acessando painel administrativo da Nuvemshop (${storeUrl})...`);
    await page.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(2000);

    // Verificar se já entrou direto por causa da sessão persistente com polling loop (redirecionamento)
    let isAlreadyLogged = false;
    log('Verificando se a sessão já está autenticada (aguardando possíveis redirecionamentos)...');
    
    for (let i = 0; i < 15; i++) {
      if (await checkIsLogged(page)) {
        isAlreadyLogged = true;
        break;
      }
      
      // Se form de login estiver visível, paramos de esperar mais cedo (após 5 segs)
      if (i >= 5) {
        const emailInputVisible = await page.locator('#user-mail, input[name="user-mail"], input[type="email"], #email').first().isVisible().catch(() => false);
        const emailBtnVisible = await page.locator('#email-login-btn, button:has-text("Entrar com e-mail"), a:has-text("Entrar com e-mail")').first().isVisible().catch(() => false);
        if (emailInputVisible || emailBtnVisible) {
          log('Tela de login/SSO detectada. Prosseguindo para autenticação.');
          break;
        }
      }
      await sleep(1000);
    }
    
    if (isAlreadyLogged) {
      log('Sessão persistente ativa detectada! Login efetuado automaticamente.');
      success = true;
    } else {
      if (await checkIsLogged(page)) {
        log('Acesso autenticado detectado. Pulando fluxo de login.');
        success = true;
      } else {
        // Se a tela inicial de SSO (Google/Apple/Email) estiver ativa, clicar em "Entrar com e-mail"
        const emailLoginBtn = page.locator('#email-login-btn, button:has-text("Entrar com e-mail"), a:has-text("Entrar com e-mail")').first();
        if (await emailLoginBtn.isVisible().catch(() => false)) {
          log('Tela de login com SSO ativa. Clicando em "Entrar com e-mail"...');
          await emailLoginBtn.click().catch(() => {});
          await sleep(1500);
        }
      }

      if (!success && await checkIsLogged(page)) {
        log('Acesso autenticado detectado. Pulando fluxo de login.');
        success = true;
      }

      let formVisible = true;

      if (!success) {
        log(`Preenchendo e-mail de login: ${username}`);
        const emailInput = page.locator('#user-mail, input[name="user-mail"], input[type="email"], #email').first();
        await emailInput.fill(username, { timeout: 5000 }).catch(async () => {
          if (await checkIsLogged(page)) {
            log('Acesso autenticado detectado durante preenchimento de e-mail.');
            success = true;
          } else {
            log('Aviso: Campo de e-mail não localizado automaticamente.', 'WARN');
            formVisible = false;
          }
        });
      }
      
      if (!success && formVisible) {
        log('Preenchendo senha...');
        const passwordInput = page.locator('#pass, input[name="pass"], input[type="password"], #password').first();
        await passwordInput.fill(password, { timeout: 5000 }).catch(async () => {
          if (await checkIsLogged(page)) {
            log('Acesso autenticado detectado durante preenchimento de senha.');
            success = true;
          } else {
            log('Aviso: Campo de senha não localizado automaticamente.', 'WARN');
            formVisible = false;
          }
        });
      }
      
      if (!success && formVisible) {
        await sleep(1000);
        log('Clicando no botão de entrar...');
        let clicked = false;
        try {
          const loginButton = page.locator('#login-submit-btn').first();
          await loginButton.click({ force: true, timeout: 5000 });
          clicked = true;
          log('Botão de entrar clicado com sucesso (Playwright force).');
        } catch (err) {
          log('Aviso ao clicar via Playwright: ' + err.message + '. Tentando via JavaScript...', 'WARN');
          try {
            clicked = await page.evaluate(() => {
              const btn = document.getElementById('login-submit-btn') || 
                          document.querySelector('button[type="submit"]') || 
                          document.querySelector('.v2-submit-btn');
              if (btn) {
                btn.click();
                return true;
              }
              return false;
            });
            if (clicked) {
              log('Clique no botão de entrar executado via JavaScript.');
            }
          } catch (jsErr) {
            log('Erro ao clicar via JS: ' + jsErr.message, 'ERROR');
          }
        }

        if (!clicked) {
          log('Aviso: Botão de entrar não foi clicado. Tentando enviar formulário pressionando Enter...', 'WARN');
          const passwordInput = page.locator('#pass, input[name="pass"], input[type="password"], #password').first();
          await passwordInput.press('Enter', { timeout: 2000 }).catch(() => {});
        }
      }

      log('Aguardando tela de dois fatores (2FA) ou sucesso no login...');
      let isMfaRequired = false;
      let mfaInput = null;

      // Aguardar até 15 segundos para ver se a tela de 2FA aparece ou se loga
      const mfaSelectors = [
        'input[name="code"]',
        'input[name="otp"]',
        'input[name="two_factor_code"]',
        'input[placeholder*="código" i]',
        'input[placeholder*="code" i]'
      ];

      for (let i = 0; i < 15; i++) {
        if (await checkIsLogged(page)) {
          log('Login efetuado com sucesso!');
          success = true;
          break;
        }

        for (const sel of mfaSelectors) {
          const input = page.locator(sel).first();
          if (await input.isVisible().catch(() => false)) {
            // Verificar se a URL ou o texto da página confirma fluxo de 2FA/MFA/Verificação
            const u = page.url().toLowerCase();
            const pageText = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '');
            const isMfaUrl = u.includes('/login') || u.includes('/auth') || u.includes('/mfa') || u.includes('/verification');
            const hasMfaText = pageText.includes('autenticador') || pageText.includes('google authenticator') || 
                               pageText.includes('verificacao') || pageText.includes('verificação') || 
                               pageText.includes('2fa') || pageText.includes('duas etapas') || 
                               pageText.includes('codigo de seguranca') || pageText.includes('código de segurança') ||
                               pageText.includes('authenticator') || pageText.includes('dois fatores') || 
                               pageText.includes('two-factor');
            
            if (isMfaUrl || hasMfaText) {
              isMfaRequired = true;
              mfaInput = input;
              break;
            }
          }
        }

        if (isMfaRequired) break;
        await sleep(1000);
      }

      if (isMfaRequired && mfaInput) {
        log('[MFA_REQUIRED] Autenticação de dois fatores (2FA/Google Authenticator) solicitada!');
        log('Por favor, digite o código de 6 dígitos no painel de controle das integrações.');

        const mfaFile = path.resolve('data', `mfa_${taskId}.txt`);
        let mfaCode = '';

        // Esperar até 120 segundos pelo código inserido pelo usuário no painel
        for (let i = 0; i < 60; i++) {
          if (fs.existsSync(mfaFile)) {
            mfaCode = fs.readFileSync(mfaFile, 'utf-8').trim();
            try {
              fs.unlinkSync(mfaFile);
            } catch (e) {}
            break;
          }
          await sleep(2000);
        }

        if (mfaCode) {
          log(`Código 2FA recebido: ${mfaCode}. Preenchendo...`);
          await mfaInput.fill(mfaCode);

          // Tentar marcar caixa de "Lembrar dispositivo por 30 dias"
          const rememberCheckbox = page.locator('input[type="checkbox"], label:has-text("Confiar"), label:has-text("30 dias"), span:has-text("Confiar")').first();
          if (await rememberCheckbox.isVisible().catch(() => false)) {
            log('Marcando opção de lembrar dispositivo / confiar por 30 dias...');
            await rememberCheckbox.click().catch(() => {});
          }

          // Confirmar
          const submitMfaBtn = page.locator('button[type="submit"], button:has-text("Enviar"), button:has-text("Confirmar"), button:has-text("Validar"), button:has-text("Acessar loja"), button[class*="submit" i]').first();
          await submitMfaBtn.click({ force: true, timeout: 5000 }).catch(async () => {
            log('Aviso: Botão de confirmar MFA não foi clicado automaticamente. Tentando Enter no campo...', 'WARN');
            await mfaInput.press('Enter').catch(() => {});
          });
          
          log('Aguardando conclusão do login pós-2FA...');
          for (let i = 0; i < 20; i++) {
            if (await checkIsLogged(page)) {
              log('Login efetuado com sucesso após 2FA!');
              success = true;
              break;
            }
            await sleep(1000);
          }
        } else {
          throw new Error('Tempo limite excedido aguardando o código 2FA.');
        }
      }
    }

    if (success) {
      // Determinar a URL administrativa limpa e segura
      let baseAdminUrl = storeUrl.split('/admin')[0];
      const currentUrlStr = page.url();
      log(`URL atual da página pós-login: ${currentUrlStr}`);
      
      if (baseAdminUrl.includes('nuvemshop.com.br/login') || baseAdminUrl.includes('nuvemshop.com.br/auth')) {
        try {
          const currentUrlObj = new URL(currentUrlStr);
          if (currentUrlObj.hostname.includes('lojavirtualnuvem.com.br') || 
              (currentUrlObj.hostname.includes('nuvemshop.com.br') && !currentUrlObj.hostname.includes('www.nuvemshop.com.br'))) {
            baseAdminUrl = currentUrlObj.origin;
            log(`Origem da loja extraída da URL atual: ${baseAdminUrl}`);
          }
        } catch (e) {
          log(`Erro ao extrair origem da URL atual: ${e.message}`, 'WARN');
        }
      }
      
      if (baseAdminUrl.includes('nuvemshop.com.br/login') || baseAdminUrl.includes('nuvemshop.com.br/auth')) {
        try {
          const urlObj = new URL(storeUrl);
          const loginTo = urlObj.searchParams.get('login_to');
          if (loginTo) {
            const loginToObj = new URL(loginTo);
            baseAdminUrl = loginToObj.origin;
            log(`Origem da loja extraída do parâmetro login_to: ${baseAdminUrl}`);
          }
        } catch (e) {
          log(`Erro ao extrair origem do login_to: ${e.message}`, 'WARN');
        }
      }

      const nuvempagoUrl = baseAdminUrl + '/admin/nuvempago/#/statement/available';
      log(`Navegando para o painel do Nuvem Pago...`);

      let loaded = false;

      log(`Navegando via URL direta para: ${nuvempagoUrl}`);
      await page.goto(nuvempagoUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => {
        log('Aviso ao navegar para a URL direta: ' + e.message, 'WARN');
      });

      // Aguardar carregar elementos em qualquer frame (iframe)
      log('Aguardando elementos principais do painel em qualquer frame...');
      const targetFrame = await waitForSelectorInAnyFrame(page, [
        'text="Saldo disponível"',
        'text="Lançamentos futuros"'
      ], 30000);

      if (targetFrame) {
        log(`Painel identificado no frame: ${targetFrame.url() || 'Main Frame'}`);
      } else {
        log('Aviso: Elementos do painel não foram identificados após o carregamento.', 'WARN');
      }

      await sleep(5000); // 5 segundos de segurança para renderização final dos dados

      // Salvar screenshot do painel
      const dashScreenshot = path.resolve('data/media', `dashboard_${taskId}.png`);
      await page.screenshot({ path: dashScreenshot }).catch(() => {});
      log(`Print do painel NuvemPago salvo para visualização em: dashboard_${taskId}.png`);

      // Extrair textos de todos os frames para análise
      let combinedText = '';
      for (const frame of page.frames()) {
        try {
          const txt = await frame.evaluate(() => document.body.textContent || '');
          combinedText += `\n--- Frame [${frame.url()}] ---\n${txt}\n`;
        } catch (e) {}
      }
      fs.writeFileSync(path.resolve('data/media', `dashboard_text_${taskId}.txt`), combinedText, 'utf-8');
      log(`Textos de todos os frames salvos para análise em: dashboard_text_${taskId}.txt`);

      log('Extraindo saldo e histórico de transações do NuvemPay...');
      
      let balance = 0.00;
      let entries = [];
      let balanceText = null;
      let rawRows = [];

      // Varre todos os frames para extrair os dados
      for (const frame of page.frames()) {
        const frameUrl = frame.url();
        try {
          // Extrair Saldo Disponível neste frame
          const foundBalance = await frame.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*'));
            for (const el of elements) {
              if (el.children.length > 3) continue; 
              const text = el.textContent || el.innerText || '';
              if (/saldo\s+dispon[íi]vel/i.test(text)) {
                let current = el;
                for (let depth = 0; depth < 4; depth++) {
                  if (!current) break;
                  const currentText = current.textContent || current.innerText || '';
                  const match = currentText.match(/R\$\s*(-?[\d.,]+)/i);
                  if (match) {
                    return match[0];
                  }
                  current = current.parentElement;
                }
              }
            }

            // Fallback por linha do texto total do corpo
            const bodyText = document.body.innerText || document.body.textContent || '';
            const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              if (/saldo\s+dispon[íi]vel/i.test(lines[i])) {
                for (let j = i; j < Math.min(lines.length, i + 6); j++) {
                  const match = lines[j].match(/R\$\s*(-?[\d.,]+)/i);
                  if (match) return match[0];
                }
              }
            }
            return null;
          });

          if (foundBalance) {
            log(`Saldo de R$ localizado no frame [${frameUrl || 'Main'}]: ${foundBalance}`);
            if (!balanceText) {
              balanceText = foundBalance;
            }
          }

          // Extrair transações neste frame
          const foundRows = await frame.evaluate(() => {
            const dateRegex = /^\d{1,2}\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i;
            const valueRegex = /([\+\-])\s*R\$\s*([\d\.,]+)/;
            
            // 1. Encontrar todos os elementos de data
            const dateElements = [];
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const text = (el.textContent || '').trim();
              if (dateRegex.test(text)) {
                // Garante que é o menor elemento com essa data (sem filhos com a mesma data)
                let hasChildDate = false;
                for (const child of el.children) {
                  if (dateRegex.test((child.textContent || '').trim())) {
                    hasChildDate = true;
                    break;
                  }
                }
                if (!hasChildDate) {
                  dateElements.push(el);
                }
              }
            }
            
            // 2. Encontrar todos os nós de valor
            const valueNodes = [];
            for (const el of allElements) {
              if (el.children.length > 5) continue;
              const text = (el.textContent || '').trim();
              if (valueRegex.test(text)) {
                let childMatches = false;
                for (const child of el.children) {
                  if (valueRegex.test((child.textContent || '').trim())) {
                    childMatches = true;
                    break;
                  }
                }
                if (!childMatches) {
                  valueNodes.push(el);
                }
              }
            }
            
            // 3. Para cada nó de valor, subir até o container da linha
            const rows = [];
            for (const valNode of valueNodes) {
              let rowNode = valNode;
              for (let i = 0; i < 4; i++) {
                if (rowNode.parentElement) {
                  const parentText = (rowNode.parentElement.textContent || '').trim();
                  const ownText = (rowNode.textContent || '').trim();
                  if (parentText.length > ownText.length + 3) {
                    rowNode = rowNode.parentElement;
                    break;
                  }
                  rowNode = rowNode.parentElement;
                }
              }
              
              // Coleta textos internos
              const childTexts = [];
              function collectText(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                  const t = node.textContent.trim();
                  if (t) childTexts.push(t);
                } else {
                  for (const child of node.childNodes) {
                    collectText(child);
                  }
                }
              }
              collectText(rowNode);
              
              const cleanTexts = childTexts.filter(t => t && t !== '>' && t !== '<');
              const valIdx = cleanTexts.findIndex(t => valueRegex.test(t));
              let valText = '';
              let description = '';
              let subDescription = '';
              
              if (valIdx !== -1) {
                valText = cleanTexts[valIdx];
                const otherTexts = cleanTexts.filter((_, idx) => idx !== valIdx);
                description = otherTexts[0] || 'Transação';
                subDescription = otherTexts[1] || '';
              } else {
                valText = valNode.textContent;
                description = cleanTexts[0] || 'Transação';
                subDescription = cleanTexts[1] || '';
              }
              
              // Posição vertical absoluta
              const rect = rowNode.getBoundingClientRect();
              const top = rect.top + window.scrollY;
              
              rows.push({
                type: 'row',
                top,
                description,
                subDescription,
                valText
              });
            }
            
            // 4. Mapear elementos de data para itens ordenáveis
            const dates = dateElements.map(el => {
              const rect = el.getBoundingClientRect();
              const top = rect.top + window.scrollY;
              return {
                type: 'date',
                top,
                dateText: el.textContent.trim()
              };
            });
            
            // 5. Unificar e ordenar por top (posição vertical)
            const unified = [...dates, ...rows].sort((a, b) => a.top - b.top);
            
            // 6. Associar datas às linhas
            let currentDate = '';
            const parsedEntries = [];
            
            for (const item of unified) {
              if (item.type === 'date') {
                currentDate = item.dateText;
              } else if (item.type === 'row') {
                parsedEntries.push({
                  date: currentDate,
                  description: item.description,
                  subDescription: item.subDescription,
                  valText: item.valText
                });
              }
            }
            
            return parsedEntries;
          });

          if (foundRows && foundRows.length > 0) {
            log(`Localizadas ${foundRows.length} linhas brutas no frame [${frameUrl || 'Main'}]`);
            rawRows = foundRows;
          }
        } catch (e) {
          log(`Aviso ao inspecionar frame [${frameUrl}]: ${e.message}`, 'WARN');
        }
      }

      try {
        if (balanceText) {
          log(`Texto de saldo localizado final: ${balanceText}`);
          const isNegative = balanceText.includes('-');
          const clean = balanceText.replace(/[-\sR$]/g, '').trim();
          const normalized = clean.replace(/\./g, '').replace(',', '.');
          balance = parseFloat(normalized) || 0.00;
          if (isNegative) balance = -balance;
        } else {
          log('Aviso: Não foi possível localizar o texto do Saldo disponível em nenhum frame. Usando 0.00.', 'WARN');
        }

        log(`Total de linhas brutas localizadas para extração final: ${rawRows.length}`);

        const parseBRLAmount = (valStr) => {
          if (!valStr) return 0;
          const isNegative = valStr.includes('-');
          const clean = valStr.replace(/[-\+\sR$]/g, '').trim();
          const num = parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
          return isNegative ? -num : num;
        };

        const parsePTBRDate = (dateStr) => {
          if (!dateStr) return new Date().toISOString();
          const months = {
            jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
            jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
            janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
            julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11
          };
          const clean = dateStr.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const cleanNoDe = clean.replace(/\bde\b/g, '').replace(/\s+/g, ' ').trim();
          
          const slashMatch = cleanNoDe.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
          if (slashMatch) {
            const day = parseInt(slashMatch[1], 10);
            const month = parseInt(slashMatch[2], 10) - 1;
            let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : new Date().getFullYear();
            if (slashMatch[3] && slashMatch[3].length === 2) {
              year += 2000;
            }
            if (!isNaN(day) && !isNaN(month)) {
              return new Date(year, month, day, 12, 0, 0).toISOString();
            }
          }

          const parts = cleanNoDe.split(/\s+/);
          if (parts.length >= 2) {
            const day = parseInt(parts[0], 10);
            const monthAbbr = parts[1].slice(0, 3);
            const month = months[monthAbbr];
            if (!isNaN(day) && month !== undefined) {
              const now = new Date();
              let year = now.getFullYear();
              if (parts[2] && /^\d{4}$/.test(parts[2])) {
                year = parseInt(parts[2], 10);
              }
              const parsedDate = new Date(year, month, day);
              if (!parts[2] && parsedDate > now) {
                year -= 1;
              }
              return new Date(year, month, day, 12, 0, 0).toISOString();
            }
          }
          return new Date().toISOString();
        };

        for (const r of rawRows) {
          const amount = parseBRLAmount(r.valText);
          const posted_at = parsePTBRDate(r.date);
          
          let source_ref = 'nuvem-ref-' + Math.floor(100000 + Math.random() * 900000);
          if (r.description && r.description.includes('#')) {
            const num = r.description.split('#')[1];
            if (num) {
              source_ref = `nuvem-venda-${num}`;
            }
          }

          const fullDescription = r.subDescription ? `${r.description} - ${r.subDescription}` : r.description;
          const counterparty = r.description.includes('Venda') ? 'Cliente NuvemPay' : r.description;
          const category = r.subDescription && r.subDescription.toLowerCase().includes('transfer') ? 'transferencia' : 'venda';

          entries.push({
            posted_at,
            description: fullDescription,
            amount,
            counterparty,
            source_ref,
            balance_after: balance,
            category,
            source: 'nuvempay'
          });
        }

        log(`Total de transações extraídas: ${entries.length}`);

      } catch (err) {
        log(`Erro ao realizar extração de dados: ${err.message}`, 'WARN');
      }

      dataScraped = {
        saldo: balance,
        entries: entries
      };
    } else {
      throw new Error('Não foi possível autenticar na plataforma Nuvemshop/NuvemPay.');
    }

    log('================ DADOS COLETADOS ================');
    log(`Saldo Disponível: R$ ${dataScraped.saldo}`);
    log(`Quantidade de Vendas Aprovadas: ${dataScraped.entries.length}`);
    log(`Registros:\n${JSON.stringify(dataScraped.entries, null, 2)}`);
    log('=================================================');

    log('Dados formatados com sucesso no modelo NuvemPay! Enviando para o webhook...');
    log(`Enviando POST para: ${webhookUrl}`);

    // Fazer o envio para o Webhook de destino com cabeçalho de segurança
    const headers = { 'Content-Type': 'application/json' };
    if (webhookSecret) {
      headers['Authorization'] = `Bearer ${webhookSecret}`;
      headers['X-Webhook-Secret'] = webhookSecret;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(dataScraped)
    }).catch(err => {
      throw new Error(`Falha ao conectar com o Webhook: ${err.message}`);
    });

    const respText = await response.text().catch(() => '');
    if (response && response.ok) {
      log('Webhook entregue com sucesso! Status HTTP: ' + response.status);
      log(`Resposta do Webhook: ${respText}`);
    } else if (response) {
      log(`Aviso: O webhook retornou erro HTTP ${response.status}`, 'WARN');
      log(`Resposta de erro do Webhook: ${respText}`, 'WARN');
    }

    return {
      success: true,
      dataScraped,
      webhook: {
        url: webhookUrl,
        sentPayload: dataScraped,
        status: response ? response.status : null,
        statusText: response ? response.statusText : null,
        responseBody: respText || null,
        error: null
      },
      error: null
    };

  } catch (err) {
    log(`Erro na automação do NuvemPay: ${err.message}`, 'ERROR');
    try {
      const screenshotPath = path.resolve('data/media', `error_${taskId}.png`);
      await page.screenshot({ path: screenshotPath });
      log(`Print do erro salvo para visualização em: error_${taskId}.png`);
    } catch (e) {
      log(`Não foi possível tirar print do erro: ${e.message}`, 'WARN');
    }

    return {
      success: false,
      dataScraped: (dataScraped && Object.keys(dataScraped).length > 0) ? dataScraped : null,
      webhook: {
        url: webhookUrl,
        sentPayload: (dataScraped && Object.keys(dataScraped).length > 0) ? dataScraped : null,
        status: null,
        statusText: null,
        responseBody: null,
        error: err.message
      },
      error: err.message
    };
  } finally {
    log('Fechando navegador em 3 segundos...');
    await sleep(3000);
    try {
      await Promise.race([
        context.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao fechar navegador')), 5000))
      ]);
    } catch (e) {
      log('Aviso ao fechar navegador: ' + e.message, 'WARN');
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
