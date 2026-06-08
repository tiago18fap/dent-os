import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

/**
 * Script de Automação do NuvemPay (Job Playwright)
 * 
 * @param {Object} credentials - Credenciais de login (username, password, webhookUrl, webhookSecret)
 * @param {Function} log - Função para logar mensagens no console web da fila
 */
export async function run(credentials, log, taskId = 'unknown') {
  const { username, password, webhookUrl, webhookSecret, storeDomain } = credentials;
  
  const sessionPath = path.resolve('data/sessions/nuvempay');
  log(`Iniciando navegador Chromium com perfil persistente em: ${sessionPath}...`);
  
  const context = await chromium.launchPersistentContext(sessionPath, {
    headless: false, // Abre a janela física para permitir resolver Captcha/MFA
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    recordVideo: {
      dir: path.resolve(`public/videos/temp/${taskId}`),
      size: { width: 1280, height: 800 }
    }
  });

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

    // Verificar se já entrou direto por causa da sessão persistente
    const currentUrl = page.url().toLowerCase();
    const isAlreadyLogged = ((currentUrl.includes('/admin') || currentUrl.includes('/home') || currentUrl.includes('/dashboard')) && !currentUrl.includes('/login') && !currentUrl.includes('/auth')) ||
                            await page.locator('[data-testid="sidebar"], .nav-sidebar, #admin-menu').first().isVisible().catch(() => false);
    
    if (isAlreadyLogged) {
      log('Sessão persistente ativa detectada! Login efetuado automaticamente.');
      success = true;
    } else {
      // Se a tela inicial de SSO (Google/Apple/Email) estiver ativa, clicar em "Entrar com e-mail"
      const emailLoginBtn = page.locator('#email-login-btn, button:has-text("Entrar com e-mail"), a:has-text("Entrar com e-mail")').first();
      if (await emailLoginBtn.isVisible().catch(() => false)) {
        log('Tela de login com SSO ativa. Clicando em "Entrar com e-mail"...');
        await emailLoginBtn.click().catch(() => {});
        await sleep(1500);
      }

      log(`Preenchendo e-mail de login: ${username}`);
      const emailInput = page.locator('#user-mail, input[name="user-mail"], input[type="email"], #email').first();
      await emailInput.fill(username).catch(() => {
        log('Aviso: Campo de e-mail não localizado automaticamente, por favor digite-o no navegador.', 'WARN');
      });
      
      log('Preenchendo senha...');
      const passwordInput = page.locator('#pass, input[name="pass"], input[type="password"], #password').first();
      await passwordInput.fill(password).catch(() => {
        log('Aviso: Campo de senha não localizado automaticamente, por favor digite-o no navegador.', 'WARN');
      });
      
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
        await passwordInput.press('Enter').catch(() => {});
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
        const u = page.url().toLowerCase();
        const logged = ((u.includes('/admin') || u.includes('/home') || u.includes('/dashboard')) && !u.includes('/login') && !u.includes('/auth')) || 
                       await page.locator('[data-testid="sidebar"], .nav-sidebar, #admin-menu').first().isVisible().catch(() => false);
        
        if (logged) {
          log('Login efetuado com sucesso!');
          success = true;
          break;
        }

        for (const sel of mfaSelectors) {
          const input = page.locator(sel).first();
          if (await input.isVisible().catch(() => false)) {
            isMfaRequired = true;
            mfaInput = input;
            break;
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
          const submitMfaBtn = page.locator('button[type="submit"], button:has-text("Enviar"), button:has-text("Confirmar"), button:has-text("Validar")').first();
          await submitMfaBtn.click().catch(() => {});
          
          log('Aguardando conclusão do login pós-2FA...');
          for (let i = 0; i < 20; i++) {
            const u = page.url().toLowerCase();
            const logged = ((u.includes('/admin') || u.includes('/home') || u.includes('/dashboard')) && !u.includes('/login') && !u.includes('/auth')) || 
                           await page.locator('[data-testid="sidebar"], .nav-sidebar, #admin-menu').first().isVisible().catch(() => false);
            if (logged) {
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
      const nuvempagoUrl = storeUrl.split('/admin')[0] + '/admin/nuvempago#/dashboard/';
      log(`Navegando para o painel do NuvemPago (${nuvempagoUrl})...`);
      await page.goto(nuvempagoUrl, { waitUntil: 'networkidle', timeout: 40000 }).catch((e) => {
        log('Aviso ao navegar para o painel do NuvemPago: ' + e.message, 'WARN');
      });
      await sleep(10000); // Dar tempo para os componentes React/Angular carregarem na tela

      // Salvar screenshot do painel para podermos inspecionar a estrutura real dos elementos
      const dashScreenshot = path.resolve('public', `dashboard_${taskId}.png`);
      await page.screenshot({ path: dashScreenshot }).catch(() => {});
      log(`Print do painel NuvemPago salvo para análise em: dashboard_${taskId}.png`);

      // Extrair textos da página para analisar o saldo e extrato reais
      const pageText = await page.evaluate(() => document.body.textContent || '');
      fs.writeFileSync(path.resolve('public', `dashboard_text_${taskId}.txt`), pageText, 'utf-8');
      log(`Texto do painel salvo para análise em: dashboard_text_${taskId}.txt`);

      log('Extraindo saldo e histórico de transações do NuvemPay...');
      
      let balance = 0.00;
      let entries = [];
      
      try {
        // Aguarda carregar elementos do dashboard
        await page.waitForSelector('text=Saldo disponível, text=Lançamentos futuros, th:has-text("Cliente")', { timeout: 30000 }).catch(() => {
          log('Aviso: Elementos do dashboard demoraram para carregar.', 'WARN');
        });

        // 1. Extração do Saldo Disponível
        const balanceText = await page.evaluate(() => {
          const xpathResult = document.evaluate("//*[contains(text(), 'Saldo disponível')]", document, null, XPathResult.ANY_TYPE, null);
          let node = xpathResult.iterateNext();
          while (node) {
            const parent = node.closest('div');
            if (parent) {
              const text = parent.innerText || parent.textContent || '';
              const match = text.match(/R\$\s*([\d.,]+)/);
              if (match) return match[0];
            }
            node = xpathResult.iterateNext();
          }

          // Fallback
          const bodyText = document.body.innerText || '';
          const lines = bodyText.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Saldo disponível')) {
              for (let j = i; j < Math.min(lines.length, i + 5); j++) {
                const match = lines[j].match(/R\$\s*([\d.,]+)/);
                if (match) return match[0];
              }
            }
          }
          return null;
        });

        if (balanceText) {
          log(`Texto de saldo localizado: ${balanceText}`);
          const clean = balanceText.replace(/R\$\s*/i, '').trim();
          const normalized = clean.replace(/\./g, '').replace(',', '.');
          balance = parseFloat(normalized) || 0.00;
        } else {
          log('Aviso: Não foi possível localizar o texto do Saldo disponível na página. Usando 0.00.', 'WARN');
        }

        // 2. Extração das transações (filtrando por Aprovado)
        const rawRows = await page.evaluate(() => {
          const parsed = [];
          
          // Tentar encontrar tabela padrão
          const tables = Array.from(document.querySelectorAll('table'));
          for (const table of tables) {
            const ths = Array.from(table.querySelectorAll('th, td[class*="header" i]')).map(el => el.textContent.trim().toLowerCase());
            const hasRequired = ths.some(h => h.includes('cliente') || h.includes('valor') || h.includes('estado'));
            if (!hasRequired) continue;

            const trs = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
            for (const tr of trs) {
              const tds = Array.from(tr.querySelectorAll('td'));
              if (tds.length >= 4) {
                parsed.push({
                  source: 'table',
                  headers: ths,
                  cells: tds.map(td => td.textContent.trim())
                });
              }
            }
            if (parsed.length > 0) return parsed;
          }

          // Fallback para grid baseada em divs
          const allElements = Array.from(document.querySelectorAll('div, tr, li'));
          for (const el of allElements) {
            if (el.children.length < 3 || el.children.length > 10) continue;
            if (el.querySelectorAll('div').length > 6) continue;
            
            const text = el.textContent || '';
            const hasStatus = text.includes('Aprovado') || text.includes('Recusado') || text.includes('Pendente') || text.includes('Cancelado');
            const hasValue = text.match(/R\$\s*[\d.,]+/);
            
            if (hasStatus && hasValue) {
              const cells = Array.from(el.children).map(c => c.textContent.trim()).filter(Boolean);
              if (cells.length >= 4) {
                parsed.push({
                  source: 'div-row',
                  cells
                });
              }
            }
          }
          return parsed;
        });

        log(`Total de linhas brutas localizadas na tabela: ${rawRows.length}`);

        const parseBRLAmount = (valStr) => {
          if (!valStr) return 0;
          const clean = valStr.replace(/R\$\s*/i, '').trim();
          return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
        };

        const parsePTBRDate = (dateStr) => {
          if (!dateStr) return new Date().toISOString();
          const months = {
            jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
            jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11
          };
          const clean = dateStr.trim().toLowerCase();
          const parts = clean.split(/\s+/);
          if (parts.length >= 2) {
            const day = parseInt(parts[0], 10);
            const monthAbbr = parts[1].slice(0, 3);
            const month = months[monthAbbr];
            if (!isNaN(day) && month !== undefined) {
              const now = new Date();
              let year = now.getFullYear();
              const parsedDate = new Date(year, month, day);
              if (parsedDate > now) {
                year -= 1; // Ano anterior
              }
              return new Date(year, month, day, 12, 0, 0).toISOString();
            }
          }
          return new Date().toISOString();
        };

        for (const r of rawRows) {
          let tipo = '';
          let data = '';
          let cliente = '';
          let forma = '';
          let valor = '';
          let estado = '';

          if (r.source === 'table' && r.headers.length >= 4) {
            const idxTipo = r.headers.findIndex(h => h.includes('tipo'));
            const idxData = r.headers.findIndex(h => h.includes('data'));
            const idxCliente = r.headers.findIndex(h => h.includes('cliente'));
            const idxForma = r.headers.findIndex(h => h.includes('forma') || h.includes('pagamento'));
            const idxValor = r.headers.findIndex(h => h.includes('valor'));
            const idxEstado = r.headers.findIndex(h => h.includes('estado') || h.includes('status'));

            tipo = idxTipo !== -1 ? r.cells[idxTipo] : r.cells[0];
            data = idxData !== -1 ? r.cells[idxData] : r.cells[1];
            cliente = idxCliente !== -1 ? r.cells[idxCliente] : r.cells[2];
            forma = idxForma !== -1 ? r.cells[idxForma] : r.cells[3];
            valor = idxValor !== -1 ? r.cells[idxValor] : r.cells[4];
            estado = idxEstado !== -1 ? r.cells[idxEstado] : r.cells[5];
          } else {
            tipo = r.cells[0] || '';
            data = r.cells[1] || '';
            cliente = r.cells[2] || '';
            forma = r.cells[3] || '';
            valor = r.cells[4] || '';
            estado = r.cells[5] || '';
          }

          // Filtrar estritamente por estado "Aprovado"
          if (estado && estado.toLowerCase().includes('aprovado')) {
            const amount = parseBRLAmount(valor);
            const posted_at = parsePTBRDate(data);
            
            let source_ref = 'nuvem-ref-' + Math.floor(100000 + Math.random() * 900000);
            if (tipo && tipo.includes('#')) {
              const num = tipo.split('#')[1];
              if (num) {
                source_ref = `nuvem-venda-${num}`;
              }
            }

            const description = tipo !== '---' ? `${tipo} - ${forma}` : `Venda - ${forma}`;

            entries.push({
              posted_at,
              description,
              amount,
              counterparty: cliente || 'Cliente NuvemPay',
              source_ref,
              balance_after: balance,
              category: 'venda',
              source: 'nuvempay' // Define a fonte para satisfazer a constraint de banco de dados
            });
          }
        }

        log(`Total de vendas aprovadas extraídas: ${entries.length}`);

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

  } catch (err) {
    log(`Erro na automação do NuvemPay: ${err.message}`, 'ERROR');
    try {
      const screenshotPath = path.resolve('public', `error_${taskId}.png`);
      await page.screenshot({ path: screenshotPath });
      log(`Print do erro salvo para visualização em: error_${taskId}.png`);
    } catch (e) {
      log(`Não foi possível tirar print do erro: ${e.message}`, 'WARN');
    }
    throw err;
  } finally {
    log('Fechando navegador em 3 segundos...');
    await sleep(3000);
    await context.close().catch(() => {});
  }

  return dataScraped;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
