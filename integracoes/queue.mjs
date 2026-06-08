import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';

// Configurar caminhos de dados
const DATA_DIR = path.resolve('data');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const JOBS_DIR = path.resolve('jobs');

// Garantir que diretórios existem
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });

// Carregar dados iniciais de persistência
function loadJSON(filePath, defaultVal = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[ERR] Falha ao carregar JSON de ${filePath}:`, err.message);
  }
  return defaultVal;
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[ERR] Falha ao salvar JSON em ${filePath}:`, err.message);
  }
}

// Estados iniciais
let credentials = loadJSON(CREDENTIALS_FILE, {});
let history = loadJSON(HISTORY_FILE, []);

// Gerenciador de eventos para logs
class QueueEmitter extends EventEmitter {}
export const queueEvents = new QueueEmitter();

// Fila de execução na memória
const taskQueue = [];
let isProcessing = false;
let currentTask = null;

// Função para enviar logs para a console da web
export function logTask(taskId, message, level = 'INFO') {
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const logLine = `[${ts}] [${level}] ${message}`;
  console.log(`[Task-${taskId}] ${logLine}`);
  
  // Atualizar histórico com logs da tarefa
  const task = history.find(t => t.id === taskId);
  if (task) {
    if (!task.logs) task.logs = [];
    task.logs.push(logLine);
    saveJSON(HISTORY_FILE, history);
  }

  // Disparar evento para a web via SSE/WebSocket
  queueEvents.emit('log', { taskId, logLine, level });
}

// Executar a fila
async function processQueue() {
  if (isProcessing || taskQueue.length === 0) return;

  isProcessing = true;
  currentTask = taskQueue.shift();
  currentTask.status = 'rodando';
  currentTask.startedAt = new Date().toISOString();
  saveJSON(HISTORY_FILE, history);
  queueEvents.emit('status', currentTask);

  const { id, type } = currentTask;
  logTask(id, `Iniciando execução da integração: ${type}`);

  try {
    // Importação dinâmica do script de job da pasta jobs/
    const jobPath = `./jobs/${type}.mjs`;
    logTask(id, `Carregando script de automação: ${jobPath}`);
    
    // Importar dinamicamente
    const { run } = await import(jobPath);
    
    // Buscar credenciais configuradas para esta integração
    const creds = credentials[type] || {};
    if (!creds.username) {
      throw new Error(`Credenciais não configuradas para a integração "${type}"`);
    }

    logTask(id, 'Executando script do Playwright...');
    
    // Executar o script passando credenciais, webhook, logger customizado e ID da tarefa
    const result = await run(creds, (msg, lvl) => logTask(id, msg, lvl), id);
    
    // Conclusão com sucesso
    currentTask.status = 'sucesso';
    currentTask.finishedAt = new Date().toISOString();
    currentTask.result = result;
    logTask(id, 'Integração concluída com sucesso!');
    
  } catch (err) {
    // Falha ou erro
    currentTask.status = 'erro';
    currentTask.finishedAt = new Date().toISOString();
    currentTask.error = err.message;
    logTask(id, `Erro durante a execução: ${err.message}`, 'ERROR');
  } finally {
    // Processar e salvar gravação de vídeo se disponível
    const videoUrl = saveTaskVideo(currentTask.id);
    if (videoUrl) {
      currentTask.videoUrl = videoUrl;
    }

    // Verificar e registrar referências para prints (screenshots) se existirem
    const errorScreenshotFile = path.resolve('public', `error_${currentTask.id}.png`);
    if (fs.existsSync(errorScreenshotFile)) {
      currentTask.errorScreenshotUrl = `error_${currentTask.id}.png`;
    }

    const dashboardScreenshotFile = path.resolve('public', `dashboard_${currentTask.id}.png`);
    if (fs.existsSync(dashboardScreenshotFile)) {
      currentTask.dashboardScreenshotUrl = `dashboard_${currentTask.id}.png`;
    }

    saveJSON(HISTORY_FILE, history);
    queueEvents.emit('status', currentTask);
    currentTask = null;
    isProcessing = false;
    
    // Processar o próximo item da fila
    setTimeout(processQueue, 1000);
  }
}

// ══════════════════════════════════════════════════════════════
// Módulos Exportados
// ══════════════════════════════════════════════════════════════

export const queueManager = {
  // Obter credenciais
  getCredentials() {
    return credentials;
  },

  // Salvar credenciais
  saveCredentials(type, username, password, webhookUrl, webhookSecret = '', storeDomain = '') {
    credentials[type] = { username, password, webhookUrl, webhookSecret, storeDomain, updatedAt: new Date().toISOString() };
    saveJSON(CREDENTIALS_FILE, credentials);
    return credentials[type];
  },

  // Adicionar tarefa na fila
  enqueue(type) {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const newTask = {
      id,
      type,
      status: 'pendente',
      queuedAt: new Date().toISOString(),
      logs: []
    };

    history.unshift(newTask);
    // Limitar histórico a 100 itens para não pesar
    if (history.length > 100) history.pop();
    
    saveJSON(HISTORY_FILE, history);
    taskQueue.push(newTask);
    
    // Disparar processamento da fila em background
    processQueue();
    
    return newTask;
  },

  // Obter histórico de execuções
  getHistory() {
    return history;
  },

  // Obter status da fila
  getQueueStatus() {
    return {
      isProcessing,
      queueLength: taskQueue.length,
      currentTask
    };
  }
};

// Helper para salvar e processar o vídeo gravado da tarefa
function saveTaskVideo(taskId) {
  const tempDir = path.resolve(`public/videos/temp/${taskId}`);
  const destDir = path.resolve('public/videos');
  
  if (fs.existsSync(tempDir)) {
    try {
      const files = fs.readdirSync(tempDir);
      const videoFile = files.find(f => f.endsWith('.webm'));
      
      if (videoFile) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        
        const srcPath = path.join(tempDir, videoFile);
        const destPath = path.join(destDir, `${taskId}.webm`);
        
        fs.renameSync(srcPath, destPath);
        return `videos/${taskId}.webm`;
      }
    } catch (err) {
      console.error(`[ERR] Falha ao processar vídeo da tarefa ${taskId}:`, err.message);
    } finally {
      // Limpar diretório temporário
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (rmErr) {
        console.error(`[ERR] Falha ao limpar diretório temporário do vídeo ${taskId}:`, rmErr.message);
      }
    }
  }
  return null;
}
