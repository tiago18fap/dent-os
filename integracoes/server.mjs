import express from 'express';
import path from 'path';
import fs from 'fs';
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
  
  // Omitir senhas e segredos nos retornos por segurança
  Object.keys(creds).forEach(key => {
    safeCreds[key] = {
      username: creds[key].username,
      webhookUrl: creds[key].webhookUrl,
      hasSecret: !!creds[key].webhookSecret,
      storeDomain: creds[key].storeDomain,
      updatedAt: creds[key].updatedAt
    };
  });
  
  res.json(safeCreds);
});

// POST /api/credentials - Configurar/Atualizar credenciais e webhook
app.post('/api/credentials', (req, res) => {
  const { type, username, password, webhookUrl, webhookSecret, storeDomain } = req.body;
  
  if (!type || !username || !password || !webhookUrl) {
    return res.status(400).json({ error: 'Parâmetros ausentes. Forneça type, username, password e webhookUrl.' });
  }

  const cleanType = type.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const updated = queueManager.saveCredentials(cleanType, username, password, webhookUrl, webhookSecret || '', storeDomain || '');
  
  res.json({ success: true, message: `Credenciais configuradas para a integração "${cleanType}".`, data: {
    type: cleanType,
    username: updated.username,
    webhookUrl: updated.webhookUrl,
    hasSecret: !!updated.webhookSecret,
    storeDomain: updated.storeDomain
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

// POST /api/queue/mfa - Enviar código 2FA/MFA para uma tarefa ativa
app.post('/api/queue/mfa', (req, res) => {
  const { taskId, code } = req.body;
  if (!taskId || !code) {
    return res.status(400).json({ error: 'Forneça taskId e o código code.' });
  }
  
  const cleanTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanCode = code.replace(/[^0-9]/g, '');
  
  if (cleanCode.length !== 6) {
    return res.status(400).json({ error: 'O código de autenticação deve ter 6 dígitos.' });
  }

  const mfaFile = path.resolve('data', `mfa_${cleanTaskId}.txt`);
  try {
    fs.writeFileSync(mfaFile, cleanCode, 'utf-8');
    res.json({ success: true, message: 'Código MFA recebido com sucesso no servidor.' });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao processar código no servidor: ' + err.message });
  }
});

// POST /api/queue/cancel - Cancelar uma tarefa ativa (em execução ou pendente)
app.post('/api/queue/cancel', (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Forneça o taskId da tarefa a ser cancelada.' });
  }
  
  const cleanTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '');
  const result = queueManager.cancel(cleanTaskId);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// DELETE /api/queue/task/:id - Excluir uma tarefa do histórico
app.delete('/api/queue/task/:id', (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Forneça o ID da tarefa.' });
  }
  
  const cleanTaskId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const result = queueManager.delete(cleanTaskId);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
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
