// ══════════════════════════════════════════════════════════════
// DentOS Integrations — App Logic (Vanilla JS)
// ══════════════════════════════════════════════════════════════

let activeTaskId = null; // ID da tarefa selecionada para ver logs
let historyData = []; // Armazena histórico local de tarefas
let queueState = {}; // Armazena estado da fila
let cachedCredentials = {}; // Cache de credenciais configuradas

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  loadCredentials();
  loadQueue();
  setupEventSource();

  // Bind de eventos
  document.getElementById('credentials-form').addEventListener('submit', handleSaveCredentials);
  document.getElementById('integration-type').addEventListener('change', handleIntegrationTypeChange);
  document.getElementById('btn-trigger').addEventListener('click', handleTriggerJob);
  document.getElementById('btn-clear-console').addEventListener('click', clearConsole);
  document.getElementById('btn-close-modal').addEventListener('click', closeVideoModal);
});

// 1. Carregar Credenciais
async function loadCredentials() {
  try {
    const res = await fetch('api/credentials');
    const creds = await res.json();
    cachedCredentials = creds;
    
    const configuredList = document.getElementById('configured-integrations-list');
    const triggerSelect = document.getElementById('trigger-type');
    const configSelect = document.getElementById('integration-type');
    
    configuredList.innerHTML = '';
    
    // Limpar opções dinâmicas dos selects mantendo a primeira (placeholder)
    while (triggerSelect.options.length > 1) triggerSelect.remove(1);
    
    const keys = Object.keys(creds);
    if (keys.length === 0) {
      configuredList.innerHTML = '<li class="empty-state">Nenhuma integração configurada ainda.</li>';
      return;
    }

    keys.forEach(key => {
      // Inserir na lista de configuradas
      const li = document.createElement('li');
      li.className = 'config-item';
      li.innerHTML = `
        <div class="config-item-info">
          <strong>${formatName(key)}</strong>
          <span>Usuário: ${creds[key].username}</span>
        </div>
        <span class="badge badge-sucesso">Configurado</span>
      `;
      configuredList.appendChild(li);

      // Inserir nos selects de disparo
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = formatName(key);
      triggerSelect.appendChild(opt);
    });

  } catch (err) {
    console.error('Erro ao carregar credenciais:', err);
  }
}

// Helper para formatar nome
function formatName(key) {
  return key
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// 2. Salvar Credenciais
async function handleSaveCredentials(e) {
  e.preventDefault();
  
  const type = document.getElementById('integration-type').value;
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const webhookUrl = document.getElementById('webhook-url').value;
  const webhookSecret = document.getElementById('webhook-secret').value;

  try {
    const res = await fetch('api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, username, password, webhookUrl, webhookSecret })
    });
    
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      document.getElementById('credentials-form').reset();
      // Resetar placeholders
      document.getElementById('password').placeholder = '••••••••';
      document.getElementById('webhook-secret').placeholder = 'Token de segurança ou chave';
      loadCredentials();
    } else {
      alert(`Erro: ${data.error}`);
    }
  } catch (err) {
    alert('Erro de conexão ao salvar credenciais.');
  }
}

// Pre-fill form fields when selecting an integration type
function handleIntegrationTypeChange() {
  const type = document.getElementById('integration-type').value;
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const webhookUrlInput = document.getElementById('webhook-url');
  const webhookSecretInput = document.getElementById('webhook-secret');

  if (cachedCredentials[type]) {
    usernameInput.value = cachedCredentials[type].username || '';
    webhookUrlInput.value = cachedCredentials[type].webhookUrl || '';
    
    // Opcionais/Segurança
    passwordInput.value = '';
    passwordInput.placeholder = '•••••••• (Re-digite para salvar)';
    
    if (cachedCredentials[type].hasSecret) {
      webhookSecretInput.value = '';
      webhookSecretInput.placeholder = '•••••••• (Re-digite para atualizar)';
    } else {
      webhookSecretInput.value = '';
      webhookSecretInput.placeholder = 'Token de segurança ou chave';
    }
  } else {
    usernameInput.value = '';
    webhookUrlInput.value = '';
    passwordInput.value = '';
    passwordInput.placeholder = '••••••••';
    webhookSecretInput.value = '';
    webhookSecretInput.placeholder = 'Token de segurança ou chave';
  }
}

// 3. Carregar Estado da Fila e Histórico
async function loadQueue() {
  try {
    const res = await fetch('api/queue');
    const data = await res.json();
    
    historyData = data.history;
    queueState = data.status;
    
    updateQueueUI();
  } catch (err) {
    console.error('Erro ao carregar fila:', err);
  }
}

// Atualizar Interface da Fila
function updateQueueUI() {
  const banner = document.getElementById('queue-banner');
  const bannerText = document.getElementById('queue-banner-text');
  const queueList = document.getElementById('queue-list');
  
  // 1. Atualizar banner de status
  if (queueState.isProcessing && queueState.currentTask) {
    banner.className = 'queue-status-banner processing';
    bannerText.textContent = `Executando: ${formatName(queueState.currentTask.type)} (${queueState.currentTask.id})`;
    
    // Se a tarefa ativa não foi selecionada manualmente, auto-seleciona para exibir logs ao vivo
    if (!activeTaskId) {
      selectTask(queueState.currentTask.id);
    }
  } else {
    banner.className = 'queue-status-banner';
    bannerText.textContent = queueState.queueLength > 0 ? `${queueState.queueLength} na fila` : 'Fila Ociosa';
  }

  // 2. Renderizar Histórico/Fila
  queueList.innerHTML = '';
  if (historyData.length === 0) {
    queueList.innerHTML = '<div class="empty-state">Nenhuma tarefa no histórico.</div>';
    return;
  }

  historyData.forEach(task => {
    const item = document.createElement('div');
    item.className = `queue-item ${task.id === activeTaskId ? 'active-selection' : ''}`;
    item.onclick = () => selectTask(task.id);
    
    const time = task.startedAt 
      ? new Date(task.startedAt).toLocaleTimeString('pt-BR') 
      : new Date(task.queuedAt).toLocaleTimeString('pt-BR');

    let videoButtonHtml = '';
    if (task.videoUrl) {
      videoButtonHtml = `
        <button class="btn-watch-video" onclick="event.stopPropagation(); watchVideo('${task.videoUrl}')">
          🎥 Assistir Gravação
        </button>
      `;
    }

    item.innerHTML = `
      <div class="queue-item-left">
        <strong>${formatName(task.type)}</strong>
        <span>ID: ${task.id} • ${time}</span>
        ${videoButtonHtml}
      </div>
      <span class="badge badge-${task.status}">${task.status}</span>
    `;
    queueList.appendChild(item);
  });
}

// Selecionar Tarefa para ver logs
function selectTask(taskId) {
  activeTaskId = taskId;
  
  // Atualizar seleções visuais na lista
  const items = document.querySelectorAll('.queue-item');
  items.forEach(item => item.classList.remove('active-selection'));
  
  const task = historyData.find(t => t.id === taskId);
  if (task) {
    document.getElementById('current-task-name').textContent = `Tarefa: ${formatName(task.type)} (${task.id})`;
    
    // Renderizar logs existentes
    const consoleLogs = document.getElementById('terminal-logs');
    consoleLogs.innerHTML = '';
    
    if (task.logs && task.logs.length > 0) {
      task.logs.forEach(logLine => appendLogLine(logLine));
    } else {
      consoleLogs.innerHTML = '<span class="term-line system-line">[SISTEMA] Aguardando início dos logs da tarefa...</span>';
    }

    // Verificar se exibe alerta de captcha/interação para tarefa ativa rodando
    if (task.status === 'rodando' && task.logs && task.logs.some(l => l.includes('CAPTCHA') || l.includes('MFA') || l.includes('interação'))) {
      document.getElementById('captcha-alert').style.display = 'flex';
    } else {
      document.getElementById('captcha-alert').style.display = 'none';
    }
  }

  updateQueueUI();
}

// 4. Disparar Tarefa (Adicionar à Fila)
async function handleTriggerJob() {
  const type = document.getElementById('trigger-type').value;
  if (!type) {
    alert('Selecione uma integração para rodar.');
    return;
  }

  try {
    const res = await fetch('api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    
    const data = await res.json();
    if (data.success) {
      // Auto-selecionar logs da nova tarefa
      activeTaskId = data.task.id;
      loadQueue();
    } else {
      alert(`Erro: ${data.error}`);
    }
  } catch (err) {
    alert('Erro de conexão ao disparar integração.');
  }
}

// 5. Configurar Server-Sent Events (SSE) para logs em tempo real
function setupEventSource() {
  const eventSource = new EventSource('api/logs/live');

  eventSource.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'log') {
      // Se for a tarefa ativa no console, insere em tempo real
      if (msg.taskId === activeTaskId) {
        appendLogLine(msg.logLine);
        
        // Tratar alertas de captcha e interação humana
        const captchaAlert = document.getElementById('captcha-alert');
        if (msg.logLine.includes('CAPTCHA') || msg.logLine.includes('MFA') || msg.logLine.includes('interação')) {
          captchaAlert.style.display = 'flex';
        } else if (msg.logLine.includes('sucesso') || msg.logLine.includes('Erro')) {
          captchaAlert.style.display = 'none';
        }
      }
      
      // Atualizar logs na memória do histórico local
      const task = historyData.find(t => t.id === msg.taskId);
      if (task) {
        if (!task.logs) task.logs = [];
        task.logs.push(msg.logLine);
      }
    } 
    
    else if (msg.type === 'status') {
      // Atualizar tarefa do histórico local
      const idx = historyData.findIndex(t => t.id === msg.id);
      if (idx !== -1) {
        historyData[idx].status = msg.status;
        historyData[idx].finishedAt = msg.finishedAt;
        if (msg.error) historyData[idx].error = msg.error;
        if (msg.result) historyData[idx].result = msg.result;
      } else {
        // Nova tarefa adicionada à fila
        historyData.unshift(msg);
      }

      // Atualizar estado da fila
      loadQueue();
    }
  };

  eventSource.onerror = (err) => {
    console.error('Erro na conexão EventSource (logs live):', err);
    eventSource.close();
    // Reconectar após 5 segundos
    setTimeout(setupEventSource, 5000);
  };
}

// Helper para formatar e renderizar linha de log
function appendLogLine(line) {
  const container = document.getElementById('terminal-logs');
  const termLine = document.createElement('span');
  
  // Definir cor com base na classificação
  if (line.includes('[ERROR]')) termLine.className = 'term-line error-line';
  else if (line.includes('[WARN]')) termLine.className = 'term-line warn-line';
  else if (line.includes('sucesso') || line.includes('sucesso!') || line.includes('concluída')) termLine.className = 'term-line success-line';
  else if (line.includes('[SISTEMA]') || line.includes('[SCHEDULER]')) termLine.className = 'term-line system-line';
  else termLine.className = 'term-line info-line';
  
  termLine.textContent = line;
  container.appendChild(termLine);
  
  // Rolar para o final do terminal
  container.scrollTop = container.scrollHeight;
}

// Limpar console visual
function clearConsole() {
  document.getElementById('terminal-logs').innerHTML = '<span class="term-line system-line">[CONSOLE LIMPO] Logs em tempo real continuarão aparecendo abaixo...</span>';
  document.getElementById('captcha-alert').style.display = 'none';
}

// Modal de Vídeo
function watchVideo(videoUrl) {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('modal-video-player');
  player.src = videoUrl;
  modal.style.display = 'flex';
  player.play().catch(() => {});
}

function closeVideoModal() {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('modal-video-player');
  player.pause();
  player.src = '';
  modal.style.display = 'none';
}
