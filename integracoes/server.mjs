import express from 'express';
import path from 'path';
import { queueManager, queueEvents } from './queue.mjs';

const app = express();
const PORT = 3500;

app.use(express.json());
app.use(express.static(path.resolve('public')));

// ══════════════════════════════════════════════════════════════
// API Endpoints
// ══════════════════════════════════════════════════════════════

// GET /api/credentials - Listar integrações e metadados de credenciais
app.get('/api/credentials', (req, res) => {
  const creds = queueManager.getCredentials();
  const safeCreds = {};
  
  // Omitir senhas nos retornos por segurança
  Object.keys(creds).forEach(key => {
    safeCreds[key] = {
      username: creds[key].username,
      webhookUrl: creds[key].webhookUrl,
      updatedAt: creds[key].updatedAt
    };
  });
  
  res.json(safeCreds);
});

// POST /api/credentials - Configurar/Atualizar credenciais e webhook
app.post('/api/credentials', (req, res) => {
  const { type, username, password, webhookUrl } = req.body;
  
  if (!type || !username || !password || !webhookUrl) {
    return res.status(400).json({ error: 'Parâmetros ausentes. Forneça type, username, password e webhookUrl.' });
  }

  const cleanType = type.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const updated = queueManager.saveCredentials(cleanType, username, password, webhookUrl);
  
  res.json({ success: true, message: `Credenciais configuradas para a integração "${cleanType}".`, data: {
    type: cleanType,
    username: updated.username,
    webhookUrl: updated.webhookUrl
  }});
});

// GET /api/queue - Obter estado atual do processamento e histórico de tarefas
app.get('/api/queue', (req, res) => {
  res.json({
    status: queueManager.getQueueStatus(),
    history: queueManager.getHistory()
  });
});

// POST /api/queue - Adicionar tarefa de integração na fila
app.post('/api/queue', (req, res) => {
  const { type } = req.body;
  
  if (!type) {
    return res.status(400).json({ error: 'Forneça o parâmetro "type" da integração.' });
  }

  const cleanType = type.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  
  // Verificar se existem credenciais configuradas antes de enfileirar
  const creds = queueManager.getCredentials();
  if (!creds[cleanType]) {
    return res.status(400).json({ error: `Nenhuma credencial configurada para a integração "${cleanType}". Configure-a primeiro.` });
  }

  const task = queueManager.enqueue(cleanType);
  res.json({ success: true, message: `Integração "${cleanType}" adicionada à fila com ID ${task.id}.`, task });
});

// ══════════════════════════════════════════════════════════════
// Server-Sent Events (SSE) - Transmitir logs em tempo real para o Frontend
// ══════════════════════════════════════════════════════════════
app.get('/api/logs/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Listener para novos logs
  const onLog = (data) => {
    res.write(`data: ${JSON.stringify({ type: 'log', ...data })}\n\n`);
  };

  // Listener para mudanças de status da fila
  const onStatusChange = (data) => {
    res.write(`data: ${JSON.stringify({ type: 'status', ...data })}\n\n`);
  };

  queueEvents.on('log', onLog);
  queueEvents.on('status', onStatusChange);

  // Manter conexão viva
  const keepAliveInterval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    queueEvents.off('log', onLog);
    queueEvents.off('status', onStatusChange);
  });
});

// ══════════════════════════════════════════════════════════════
// Start
// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('══════════════════════════════════════════════');
  console.log('  DentOS — Integrador Local');
  console.log(`  Painel ativo em: http://localhost:${PORT}`);
  console.log('══════════════════════════════════════════════');
});
