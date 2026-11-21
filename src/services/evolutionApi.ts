/**
 * Integração com o WhatsApp (Evolution API).
 *
 * O navegador NÃO fala mais direto com a Evolution: todas as chamadas passam pela
 * função `evolution-whatsapp` do backend (supabase/functions/evolution-whatsapp),
 * que guarda a chave da Evolution e confere se o usuário é da clínica.
 *
 * Cada clínica tem sua própria instância, nomeada como "dentos_{clinica_id_curto}".
 * Fluxo: criar instância → ler QR code → verificar conexão → desconectar/apagar.
 */

import { supabase } from "@/integrations/supabase/client";

const FUNCAO = "evolution-whatsapp";

/**
 * Gera um nome de instância a partir do clinica_id (o backend usa o mesmo).
 */
export function getInstanceName(clinicaId: string): string {
  return `dentos_${clinicaId.replace(/-/g, "").slice(0, 12)}`;
}

/** Chama o backend. Lança erro se a função falhar (rede, login, permissão, servidor). */
async function chamar<T>(acao: string, clinicaId: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FUNCAO, {
    body: { acao, clinica_id: clinicaId, ...extra },
  });

  if (error) {
    let message = error.message || "Erro ao falar com o servidor do WhatsApp";
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      /* mantém a mensagem padrão */
    }
    throw new Error(message);
  }

  return data as T;
}

/**
 * Cria uma nova instância WhatsApp e retorna o QR code em base64.
 * Se a instância já existir, tenta conectar para obter um novo QR code.
 */
export async function createInstance(
  clinicaId: string
): Promise<{ qrcode: string | null; instance: string }> {
  return chamar("criar", clinicaId);
}

/**
 * Conecta uma instância existente e retorna o QR code.
 */
export async function connectInstance(
  clinicaId: string
): Promise<{ qrcode: string | null; instance: string }> {
  return chamar("conectar", clinicaId);
}

/**
 * Verifica o estado da conexão de uma instância.
 * Retorna: "open" (conectado), "close" (desconectado), "connecting" (aguardando QR).
 * Lança erro se o servidor não responder (assim ninguém marca a clínica como
 * desconectada só porque o servidor falhou).
 */
export async function getConnectionState(
  clinicaId: string
): Promise<{ state: string; instance: string }> {
  return chamar("estado", clinicaId);
}

/**
 * Desconecta e apaga a instância WhatsApp de uma clínica.
 */
export async function disconnectAndDelete(clinicaId: string): Promise<void> {
  await chamar("desconectar", clinicaId);
}

/**
 * Busca informações da instância (número conectado, etc.)
 */
export async function fetchInstanceInfo(
  clinicaId: string
): Promise<{ number: string | null; exists: boolean }> {
  try {
    return await chamar("info", clinicaId);
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
  try {
    return await chamar("enviar_teste", clinicaId, { numero: number, texto: text });
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro de rede ao enviar mensagem" };
  }
}

/**
 * Configura ou desativa o webhook da instância na Evolution API.
 * O endereço do webhook é definido pelo servidor.
 */
export async function configureWebhook(
  clinicaId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    return await chamar("webhook", clinicaId, { ativo: enabled });
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro de rede ao configurar webhook" };
  }
}

/**
 * Tenta reconectar uma instância existente ou recria se necessário.
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
  return chamar("reiniciar", clinicaId);
}

/**
 * Verifica a saúde da conexão e tenta reconectar automaticamente.
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
    return await chamar("verificar_reconectar", clinicaId);
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
 * Requer o número do WhatsApp (com código do país).
 */
export async function getPairingCode(
  clinicaId: string,
  phoneNumber: string
): Promise<{ code: string | null; error?: string }> {
  const cleanNumber = phoneNumber.replace(/\D/g, "");
  if (!cleanNumber || cleanNumber.length < 10) {
    return { code: null, error: "Número de telefone inválido. Use formato: 5511999999999" };
  }
  try {
    return await chamar("codigo_pareamento", clinicaId, { numero: cleanNumber });
  } catch (err: any) {
    return { code: null, error: err?.message || "Erro ao obter código de pareamento." };
  }
}
