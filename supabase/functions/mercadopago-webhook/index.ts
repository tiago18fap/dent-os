import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createHmac } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// ═══════════════════════════════════════════════════════════════
// Mercado Pago Webhook — Orders API v1
// Recebe notificações de status de pagamento via Orders API
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    console.log("[mp-webhook] Webhook recebido. Body:", bodyText);

    // Log headers for debugging
    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    console.log("[mp-webhook] x-signature:", xSignature);
    console.log("[mp-webhook] x-request-id:", xRequestId);

    let payload: any = {};
    try {
      payload = JSON.parse(bodyText);
    } catch {
      console.error("[mp-webhook] JSON inválido recebido");
      return new Response("Invalid JSON", { status: 400 });
    }

    // ═══ Extrair dados do payload ═══
    // Orders API: { id, type: "order", action: "order.created"|"order.updated", data: { id: "ORDER_ID" } }
    // Legacy fallback: { type: "payment", data: { id: "PAYMENT_ID" } }
    const type = payload.type || payload.topic;
    const action = payload.action || "";
    const dataId = payload.data?.id || payload.id;

    console.log(`[mp-webhook] type=${type}, action=${action}, data.id=${dataId}`);

    if (!type || !dataId) {
      console.log("[mp-webhook] Payload de teste ou incompleto, ignorando");
      return new Response(JSON.stringify({ message: "Payload de teste ignorado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ═══ Buscar Access Token ═══
    const { data: mpConfig } = await supabaseAdmin
      .from("sistema_pagamento_config")
      .select("mercado_pago_access_token, mercado_pago_client_secret")
      .limit(1)
      .maybeSingle();

    const accessToken = mpConfig?.mercado_pago_access_token || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

    if (!accessToken) {
      console.error("[mp-webhook] Access Token não configurado!");
      return new Response("Access Token missing", { status: 500 });
    }

    // ═══════════════════════════════════════════════════════════
    // PROCESSAMENTO POR TIPO
    // ═══════════════════════════════════════════════════════════

    if (type === "order") {
      // ═══ ORDERS API V1 ═══
      console.log(`[mp-webhook] Processando Order ID: ${dataId}`);

      const orderResponse = await fetch(`https://api.mercadopago.com/v1/orders/${dataId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      if (!orderResponse.ok) {
        const errorText = await orderResponse.text();
        console.error(`[mp-webhook] Erro ao buscar order ${dataId}:`, errorText);
        return new Response("Order not found", { status: 200 });
      }

      const order = await orderResponse.json();
      const orderStatus = order.status; // "paid", "payment_required", "reverted", "expired"
      const externalReference = order.external_reference;
      const totalAmount = order.total_amount;

      console.log(`[mp-webhook] Order ${dataId}: status=${orderStatus}, ref=${externalReference}, amount=${totalAmount}`);

      // Registrar log do webhook
      await supabaseAdmin
        .from("auditoria_logs")
        .insert({
          clinica_id: externalReference || null,
          usuario_email: "Sistema - MP Webhook",
          acao: "mercadopago_webhook_order",
          descricao: `Order ${dataId}: status=${orderStatus}, action=${action}, amount=${totalAmount}`,
        }).catch(() => {});

      if (orderStatus === "paid" && externalReference) {
        await processPaymentApproved(externalReference, totalAmount, dataId, order);
      } else if (orderStatus === "reverted" && externalReference) {
        await processPaymentCancelled(externalReference, dataId, "reverted");
      } else if (orderStatus === "expired" && externalReference) {
        await processPaymentCancelled(externalReference, dataId, "expired");
      }

    } else if (type === "payment") {
      // ═══ FALLBACK: API LEGADA DE PAYMENTS ═══
      console.log(`[mp-webhook] [LEGACY] Processando Payment ID: ${dataId}`);

      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      if (!paymentResponse.ok) {
        console.error(`[mp-webhook] [LEGACY] Erro ao buscar payment ${dataId}`);
        return new Response("Payment not found", { status: 200 });
      }

      const payment = await paymentResponse.json();
      const status = payment.status;
      const clinicaId = payment.external_reference;
      const amount = payment.transaction_amount;

      console.log(`[mp-webhook] [LEGACY] Payment ${dataId}: status=${status}, clinica=${clinicaId}`);

      if (status === "approved" && clinicaId) {
        await processPaymentApproved(clinicaId, amount, String(dataId), payment);
      } else if (status === "refunded" && clinicaId) {
        await processPaymentCancelled(clinicaId, String(dataId), "refunded");
      }

    } else if (type === "subscription" || type === "preapproval" || type === "preapproval_plan") {
      // ═══ FALLBACK: API LEGADA DE ASSINATURAS ═══
      console.log(`[mp-webhook] [LEGACY] Processando Subscription ID: ${dataId}`);

      const subResponse = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      if (!subResponse.ok) {
        console.error(`[mp-webhook] [LEGACY] Erro ao buscar subscription ${dataId}`);
        return new Response("Subscription not found", { status: 200 });
      }

      const preapproval = await subResponse.json();
      const status = preapproval.status;
      const clinicaId = preapproval.external_reference;
      const amount = preapproval.auto_recurring?.transaction_amount || 89.00;
      const reason = preapproval.reason || "";

      console.log(`[mp-webhook] [LEGACY] Subscription ${dataId}: status=${status}, clinica=${clinicaId}`);

      if (status === "authorized" && clinicaId) {
        await processPaymentApproved(clinicaId, amount, `sub_${dataId}`, { reason });
      } else if (status === "cancelled" && clinicaId) {
        await processPaymentCancelled(clinicaId, `sub_${dataId}`, "cancelled");
      }
    } else {
      console.log(`[mp-webhook] Tipo desconhecido: ${type}, ignorando`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[mp-webhook] Exceção geral:", error);
    // Sempre retorna 200 para o MP não ficar reenviando
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES DE PROCESSAMENTO
// ═══════════════════════════════════════════════════════════════

async function processPaymentApproved(
  clinicaId: string,
  amount: number,
  transactionId: string,
  rawData: any
) {
  console.log(`[mp-webhook] ✅ Pagamento APROVADO para clínica ${clinicaId}, valor: ${amount}`);

  // Deduzir plano pelo valor
  let planoId = "bronze";
  const description = rawData?.reason || rawData?.description || rawData?.items?.[0]?.title || "";
  
  if (description.toLowerCase().includes("prata") || amount > 100) {
    planoId = "prata";
  }

  const limiteMsg = planoId === "prata" ? 1000 : 100;
  const limiteProc = planoId === "prata" ? 30 : 10;

  console.log(`[mp-webhook] Ativando clínica ${clinicaId} → Plano ${planoId} (${limiteMsg} msgs)`);

  // 1. Atualizar plano da clínica
  const { error: clinicaError } = await supabaseAdmin
    .from("clinicas")
    .update({
      status_pagamento: "ativo",
      plano: planoId,
      limite_mensagens: limiteMsg,
      limite_procedimentos: limiteProc,
      data_fim_teste: null,
    })
    .eq("id", clinicaId);

  if (clinicaError) {
    console.error("[mp-webhook] Erro ao atualizar clínica:", clinicaError);
  }

  // 2. Resetar saldo da carteira
  const { error: walletError } = await supabaseAdmin
    .from("carteira_envios")
    .upsert(
      { clinica_id: clinicaId, saldo: limiteMsg },
      { onConflict: "clinica_id" }
    );

  if (walletError) {
    console.error("[mp-webhook] Erro ao atualizar carteira:", walletError);
  }

  // 3. Registrar pedido
  const { error: orderError } = await supabaseAdmin
    .from("pedidos_assinaturas")
    .upsert({
      clinica_id: clinicaId,
      plano: planoId,
      valor: amount,
      metodo_pagamento: rawData?.payment_method_id || "mercadopago",
      status: "pago",
      id_transacao_mp: String(transactionId),
      data_pagamento: new Date().toISOString(),
    }, { onConflict: "id_transacao_mp" });

  if (orderError) {
    console.error("[mp-webhook] Erro ao salvar pedido:", orderError);
  }

  // 4. Verificar se há mensagens pendentes atrasadas → reativação
  const { data: pendingPast } = await supabaseAdmin
    .from("fila_envios")
    .select("id")
    .eq("clinica_id", clinicaId)
    .eq("status", "pendente")
    .lt("data_programada", new Date().toISOString())
    .limit(1);

  if (pendingPast && pendingPast.length > 0) {
    await supabaseAdmin
      .from("clinicas")
      .update({ reativacao_pendente: true })
      .eq("id", clinicaId);
  }

  console.log(`[mp-webhook] ✅ Clínica ${clinicaId} ativada com sucesso no plano ${planoId}`);
}

async function processPaymentCancelled(
  clinicaId: string,
  transactionId: string,
  reason: string
) {
  console.log(`[mp-webhook] ❌ Pagamento ${reason} para clínica ${clinicaId}`);

  // Marcar como cancelado
  const { error } = await supabaseAdmin
    .from("clinicas")
    .update({ status_pagamento: "cancelado" })
    .eq("id", clinicaId);

  if (error) {
    console.error("[mp-webhook] Erro ao cancelar clínica:", error);
  }

  // Atualizar pedido se existir
  await supabaseAdmin
    .from("pedidos_assinaturas")
    .update({ status: reason })
    .eq("id_transacao_mp", String(transactionId));

  // Registrar auditoria
  await supabaseAdmin
    .from("auditoria_logs")
    .insert({
      clinica_id: clinicaId,
      usuario_email: "Sistema - MP Webhook",
      acao: "pagamento_cancelado",
      descricao: `Pagamento ${transactionId} ${reason}. Clínica marcada como cancelada.`,
    }).catch(() => {});

  console.log(`[mp-webhook] Clínica ${clinicaId} marcada como cancelada (${reason})`);
}
