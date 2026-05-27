/**
 * Serviço de integração com a Evolution API.
 * Gerencia instâncias WhatsApp por clínica.
 *
 * Cada clínica tem sua própria instância, nomeada como "dentos_{clinica_id_curto}".
 * Fluxo: criar instância → ler QR code → verificar conexão → desconectar/apagar.
 */

const EVOLUTION_API_URL = "https://evolution-evolution-api.qfjowr.easypanel.host";
const EVOLUTION_API_KEY = "0FD55DB5F85B-4A0A-938E-2FFC0B35EA74";

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

    const number =
      instance?.instance?.owner ??
      instance?.owner ??
      null;

    return { number, exists: true };
  } catch {
    return { number: null, exists: false };
  }
}
