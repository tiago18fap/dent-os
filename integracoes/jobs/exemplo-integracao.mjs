import { chromium } from 'playwright';
import path from 'path';

/**
 * Script de Automação de Demonstração (Job Playwright)
 * 
 * @param {Object} credentials - Credenciais de login (username, password, webhookUrl)
 * @param {Function} log - Função para logar mensagens no console web da fila
 */
export async function run(credentials, log, taskId = 'unknown') {
  const { username, password, webhookUrl, webhookSecret } = credentials;
  
  log('Iniciando navegador Chromium visível (headed mode)...');
  
  const browser = await chromium.launch({
    headless: false, // Abre a janela física na tela do usuário
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: path.resolve(`public/videos/temp/${taskId}`),
      size: { width: 1280, height: 800 }
    }
  });
  
  const page = await context.newPage();
  let success = false;
  let dataScraped = {};

  try {
    log('Acessando página de login de testes (GitHub)...');
    await page.goto('https://github.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    log(`Preenchendo nome de usuário: ${username}`);
    await page.fill('input[name="login"]', username);
    
    log('Preenchendo senha...');
    await page.fill('input[name="password"]', password);
    
    log('Clicando no botão de login...');
    await page.click('input[type="submit"]');

    log('[WARN] INTERAÇÃO REQUERIDA: Caso o GitHub solicite verificação de CAPTCHA, liberação por E-mail ou código MFA/2FA, digite ou confirme diretamente na janela do navegador aberta na sua tela!');
    log('Aguardando até 120 segundos pela autenticação completa do usuário...');
    
    // Espera ativa: aguarda que o usuário confirme o login e chegue na dashboard do GitHub (URL raiz ou que tenha um elemento logado)
    // O seletor "a.Header-link" ou o menu de usuário ".Header-item" do github geralmente aparecem quando está logado.
    // Também podemos checar se a URL mudou para a home logada (github.com/)
    try {
      await page.waitForURL((url) => {
        return url.pathname === '/' || url.pathname === '/dashboard' || url.pathname.includes('session');
      }, { timeout: 120000 });
      
      log('Autenticação de login detectada com sucesso!');
      success = true;
    } catch (timeoutErr) {
      // Se estourar o tempo de 2 minutos, verifica se mesmo assim logou ou se lança o erro de falha
      const isLogged = await page.locator('.Header-item, [aria-label="User navigation"]').first().isVisible().catch(() => false);
      if (isLogged) {
        log('Aviso: Login detectado por presença de elementos de navegação logada.');
        success = true;
      } else {
        throw new Error('Falha no login: Tempo esgotado para login manual/MFA.');
      }
    }

    log('Coletando dados simulados da página...');
    // Simula coleta de dados do perfil logado
    const currentUrl = page.url();
    const pageTitle = await page.title();
    
    dataScraped = {
      timestamp: new Date().toISOString(),
      status: 'sucesso',
      usuario_coletado: username,
      url_final: currentUrl,
      titulo_pagina: pageTitle,
      detalhes: {
        plataforma: 'GitHub Demo',
        mensagem: 'Dados simulados coletados com sucesso após autenticação.'
      }
    };

    log('Dados coletados com sucesso! Enviando para o webhook...');
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

    if (response && response.ok) {
      log('Webhook entregue com sucesso! Status HTTP: ' + response.status);
    } else if (response) {
      log(`Aviso: O webhook retornou erro HTTP ${response.status}`, 'WARN');
    }

  } catch (err) {
    log(`Erro na automação: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    log('Fechando navegador em 3 segundos...');
    await sleep(3000);
    await browser.close().catch(() => {});
  }

  return dataScraped;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
