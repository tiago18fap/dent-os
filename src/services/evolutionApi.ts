/**
 * Serviço de integração com a Evolution API.
 * Gerencia instâncias WhatsApp por clínica.
 *
 * Cada clínica tem sua própria instância, nomeada como "dentos_{clinica_id_curto}".
 * Fluxo: criar instância → ler QR code → verificar conexão → desconectar/apagar.
 */

const EVOLUTION_API_URL = "https://evolution-evolution-api.qfjowr.easypanel.host";
const EVOLUTION_API_KEY = "429683C4C977415CAAFCCE10F7D57E11";

/**
 * Gera um nome de instância a partir do clinica_id.
 * Usa os primeiros 8 caracteres do UUID para manter curto.
 */
export function getInstanceName(clinicaId: string): string {
  return `dentos_${clinicaId.replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Headers padrão para todas as chamadas à Evolution API.
 */
function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: EVOLUTION_API_KEY,
  };
}

/**
 * Cria uma nova instância WhatsApp e retorna o QR code em base64.
 * Se a instância já existir, tenta conectar para obter um novo QR code.
 */
export async function createInstance(
  clinicaId: string
): Promise<{ qrcode: string | null; instance: string }> {
  const instanceName = getInstanceName(clinicaId);

  // 1. Tentar criar a instância com QR code
  const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  const createData = await createRes.json();

  // Se criou com sucesso e retornou QR code
  if (createRes.ok && createData?.qrcode?.base64) {
    return {
      qrcode: createData.qrcode.base64,
      instance: instanceName,
    };
  }

  // Se a instância já existe (409 ou mensagem de erro), tentar reconectar
  if (!createRes.ok || !createData?.qrcode?.base64) {
    return await connectInstance(clinicaId);
  }

  return { qrcode: null, instance: instanceName };
}

/**
 * Conecta uma instância existente e retorna o QR code.
 */
export async function connectInstance(
  clinicaId: string
): Promise<{ qrcode: string | null; instance: string }> {
  const instanceName = getInstanceName(clinicaId);

  const res = await fetch(
    `${EVOLUTION_API_URL}/instance/connect/${instanceName}`,
    {
      method: "GET",
      headers: headers(),
    }
  );

  const data = await res.json();

  // O QR code pode estar em diferentes campos dependendo da versão
  const base64 =
    data?.base64 ?? data?.qrcode?.base64 ?? data?.code ?? null;

  return { qrcode: base64, instance: instanceName };
}

/**
 * Verifica o estado da conexão de uma instância.
 * Retorna: "open" (conectado), "close" (desconectado), "connecting" (aguardando QR)
 */
export async function getConnectionState(
  clinicaId: string
): Promise<{ state: string; instance: string }> {
  const instanceName = getInstanceName(clinicaId);

  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
      {
        method: "GET",
        headers: headers(),
      }
    );

    if (!res.ok) {
      return { state: "close", instance: instanceName };
    }

    const data = await res.json();
    const state = (data?.instance?.state ?? data?.state ?? "close").toLowerCase();

    return { state, instance: instanceName };
  } catch {
    return { state: "close", instance: instanceName };
  }
}

/**
 * Desconecta e apaga a instância WhatsApp de uma clínica.
 * Faz logout primeiro, depois deleta a instância.
 */
export async function disconnectAndDelete(clinicaId: string): Promise<void> {
  const instanceName = getInstanceName(clinicaId);

  // 1. Logout (fechar sessão)
  try {
    await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
      method: "DELETE",
      headers: headers(),
    });
  } catch {
    // Ignorar erro no logout — pode já estar desconectado
  }

  // 2. Deletar instância
  try {
    await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: headers(),
    });
  } catch {
    // Ignorar erro na deleção — pode já não existir
  }
}

/**
 * Busca informações da instância (número conectado, etc.)
 */
export async function fetchInstanceInfo(
  clinicaId: string
): Promise<{ number: string | null; exists: boolean }> {
  const instanceName = getInstanceName(clinicaId);

  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${instanceName}`,
      {
        method: "GET",
        headers: headers(),
      }
    );

    if (!res.ok) return { number: null, exists: false };

    const data = await res.json();

    // A resposta pode ser um array ou objeto
    const instances = Array.isArray(data) ? data : [data];
    const instance = instances.find(
      (i: any) => i?.instance?.instanceName === instanceName || i?.instanceName === instanceName
    );

    if (!instance) return { number: null, exists: false };

    const rawNumber =
      instance?.instance?.ownerJid ??
      instance?.ownerJid ??
      instance?.instance?.owner ??
      instance?.owner ??
      null;

    const number = rawNumber ? rawNumber.split("@")[0] : null;

    return { number, exists: true };
  } catch {
    return { number: null, exists: false };
  }
}

/**
 * Envia uma mensagem de texto de teste para um número específico.
 */
export async function sendTextMessage(
  clinicaId: string,
  number: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const instanceName = getInstanceName(clinicaId);
  
  // Limpar formatação do número (deixar apenas dígitos)
  const cleanedNumber = number.replace(/\D/g, "");

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanedNumber,
        text,
        options: {
          delay: 1200,
          presence: "composing"
        }
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData?.message || `Erro HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro de rede ao enviar mensagem" };
  }
}

/**
 * Configura ou desativa o webhook da instância na Evolution API.
 */
export async function configureWebhook(
  clinicaId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const instanceName = getInstanceName(clinicaId);
  const webhookUrl = "https://dzbeorfkualalocrvobe.supabase.co/functions/v1/whatsapp-webhook";

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        webhook: {
          enabled,
          url: webhookUrl,
          byEvents: true,
          base64: false,
          events: ["MESSAGES_UPSERT"]
        }
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData?.message || `Erro HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro de rede ao configurar webhook" };
  }
}

/**
 * Tenta reconectar uma instância existente ou recria se necessário.
 * Fluxo:
 *   1. Verifica se a instância existe na Evolution API
 *   2. Se existe e está "close", tenta conectar (connect)
 *   3. Se connect falhar ou instância não existir, deleta e recria
 *   4. Retorna o estado final e se gerou novo QR code
 *
 * Usado quando a conexão WhatsApp cai inesperadamente.
 */
export async function restartInstance(
  clinicaId: string
): Promise<{
  state: string;
  qrcode: string | null;
  reconnected: boolean;
  action: "connected" | "reconnected" | "recreated" | "failed";
}> {
  const instanceName = getInstanceName(clinicaId);

  // 1. Verificar se a instância existe
  const info = await fetchInstanceInfo(clinicaId);

  if (info.exists) {
    // 2. Verificar estado atual
    const conn = await getConnectionState(clinicaId);

    if (conn.state === "open") {
      return { state: "open", qrcode: null, reconnected: false, action: "connected" };
    }

    // 3. Tentar reconectar na instância existente
    try {
      const connectResult = await connectInstance(clinicaId);
      if (connectResult.qrcode) {
        return {
          state: "connecting",
          qrcode: connectResult.qrcode,
          reconnected: true,
          action: "reconnected",
        };
      }

      // Esperar um pouco e verificar se conectou automaticamente
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const recheck = await getConnectionState(clinicaId);
      if (recheck.state === "open") {
        return { state: "open", qrcode: null, reconnected: true, action: "reconnected" };
      }
    } catch (e) {
      console.warn("[restartInstance] Falha ao reconectar, tentando recriar:", e);
    }

    // 4. Se reconectar falhou, deletar e recriar
    try {
      await disconnectAndDelete(clinicaId);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (e) {
      console.warn("[restartInstance] Erro ao deletar instância antiga:", e);
    }
  }

  // 5. Criar nova instância
  try {
    const createResult = await createInstance(clinicaId);
    if (createResult.qrcode) {
      return {
        state: "connecting",
        qrcode: createResult.qrcode,
        reconnected: true,
        action: "recreated",
      };
    }

    // Verificar se criou e conectou automaticamente (sessão cached)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const finalCheck = await getConnectionState(clinicaId);
    if (finalCheck.state === "open") {
      return { state: "open", qrcode: null, reconnected: true, action: "recreated" };
    }

    return {
      state: finalCheck.state,
      qrcode: null,
      reconnected: false,
      action: "failed",
    };
  } catch (e) {
    console.error("[restartInstance] Falha ao recriar instância:", e);
    return { state: "close", qrcode: null, reconnected: false, action: "failed" };
  }
}

/**
 * Verifica a saúde da conexão e tenta reconectar automaticamente.
 * Retorna o estado atualizado e se uma reconexão foi tentada.
 *
 * Usado pelo hook de status e pelo processador de fila para
 * garantir que a conexão esteja ativa antes de enviar mensagens.
 */
export async function checkAndReconnect(
  clinicaId: string
): Promise<{
  state: string;
  wasDisconnected: boolean;
  reconnected: boolean;
  needsQrScan: boolean;
  qrcode: string | null;
}> {
  try {
    const conn = await getConnectionState(clinicaId);

    if (conn.state === "open") {
      return {
        state: "open",
        wasDisconnected: false,
        reconnected: false,
        needsQrScan: false,
        qrcode: null,
      };
    }

    // Conexão caiu — tentar restart
    console.log(`[checkAndReconnect] Instância ${conn.instance} está ${conn.state}, tentando reconectar...`);

    const result = await restartInstance(clinicaId);

    return {
      state: result.state,
      wasDisconnected: true,
      reconnected: result.state === "open",
      needsQrScan: result.state !== "open" && result.qrcode !== null,
      qrcode: result.qrcode,
    };
  } catch (e) {
    console.error("[checkAndReconnect] Erro:", e);
    return {
      state: "close",
      wasDisconnected: true,
      reconnected: false,
      needsQrScan: false,
      qrcode: null,
    };
  }
}

/**
 * Obtém um código de pareamento (pairing code) para conectar sem QR Code.
 * Útil quando o usuário está no celular e não consegue escanear o QR.
 * Requer o número do WhatsApp para gerar o código.
 * O pairing code é um código curto tipo "ABCD-EFGH" de 8 caracteres.
 * 
 * IMPORTANTE: A Evolution API só gera pairing code em instâncias recém-criadas.
 * Se a instância já existe, é necessário deletar e recriar.
 */
export async function getPairingCode(
  clinicaId: string,
  phoneNumber: string
): Promise<{ code: string | null; error?: string }> {
  const instanceName = getInstanceName(clinicaId);
  const cleanNumber = phoneNumber.replace(/\D/g, "");

  if (!cleanNumber || cleanNumber.length < 10) {
    return { code: null, error: "Número de telefone inválido. Use formato: 5511999999999" };
  }

  try {
    // 1. Deletar instância existente (pairing code só funciona com instância nova)
    try {
      await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
        method: "DELETE", headers: headers()
      });
    } catch { /* ignore */ }

    try {
      await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
        method: "DELETE", headers: headers()
      });
    } catch { /* ignore */ }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Criar instância nova sem QR code
    await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: false,
      }),
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. Solicitar pairing code passando o número na URL
    const pairingRes = await fetch(
      `${EVOLUTION_API_URL}/instance/connect/${instanceName}?number=${cleanNumber}`,
      { method: "GET", headers: headers() }
    );

    if (!pairingRes.ok) {
      const errData = await pairingRes.json().catch(() => ({}));
      return { code: null, error: errData?.message || `Erro HTTP ${pairingRes.status}` };
    }

    const data = await pairingRes.json();
    const pairingCode = data?.pairingCode ?? null;
    
    if (pairingCode && typeof pairingCode === "string" && pairingCode.length <= 20) {
      return { code: pairingCode };
    }

    return { code: null, error: "Código não gerado. Verifique se o número está correto com código do país (ex: 5521999999999)." };
  } catch (err: any) {
    return { code: null, error: err.message || "Erro ao obter código de pareamento." };
  }
}

