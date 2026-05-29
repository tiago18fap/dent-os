import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    console.log("[mercadopago-webhook] Webhook recebido:", bodyText);

    let payload: any = {};
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const type = payload.type || payload.topic;
    const dataId = payload.data?.id || payload.id;

    if (!type || !dataId) {
      console.log("[mercadopago-webhook] Payload incompleto ou de teste");
      return new Response(JSON.stringify({ message: "Payload de teste ignorado" }), { status: 200 });
    }

    // 1. Fetch Mercado Pago Access Token from database
    const { data: mpConfig } = await supabaseAdmin
      .from("sistema_pagamento_config")
      .select("mercado_pago_access_token")
      .limit(1)
      .maybeSingle();

    const accessToken = mpConfig?.mercado_pago_access_token || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

    if (!accessToken) {
      console.error("[mercadopago-webhook] Mercado Pago Access Token não configurado.");
      return new Response("Access Token missing", { status: 500 });
    }

    // 2. Process based on webhook type
    if (type === "payment") {
      console.log(`[mercadopago-webhook] Processando pagamento avulso ID ${dataId}`);
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      if (!mpResponse.ok) {
        console.error(`[mercadopago-webhook] Erro ao buscar pagamento no MP: ${await mpResponse.text()}`);
        return new Response("Payment not found on MP", { status: 200 }); // Retorna 200 para evitar que o MP tente reenviar
      }

      const payment = await mpResponse.json();
      const status = payment.status;
      const clinicaId = payment.external_reference;
      const transactionAmount = payment.transaction_amount;
      const paymentMethod = payment.payment_method_id;
      const description = payment.description || "";

      console.log(`[mercadopago-webhook] Pagamento ${dataId} status: ${status}, clinica: ${clinicaId}`);

      if (status === "approved" && clinicaId) {
        // Deduzir plano a partir dos detalhes ou valor
        let planoId = "bronze";
        if (description.toLowerCase().includes("prata") || transactionAmount > 100) {
          planoId = "prata";
        }

        const limiteMsg = planoId === "prata" ? 1000 : 100;
        const limiteProc = planoId === "prata" ? 30 : 10;

        console.log(`[mercadopago-webhook] Ativando clínica ${clinicaId} no plano ${planoId}`);

        // Atualizar plano da clínica
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
          console.error("[mercadopago-webhook] Erro ao atualizar clínica:", clinicaError);
        }

        // Resetar o saldo da carteira de envios correspondente
        const { error: walletError } = await supabaseAdmin
          .from("carteira_envios")
          .upsert(
            { clinica_id: clinicaId, saldo: limiteMsg },
            { onConflict: "clinica_id" }
          );

        if (walletError) {
          console.error("[mercadopago-webhook] Erro ao atualizar carteira:", walletError);
        }

        // Registrar pedido
        const { error: orderError } = await supabaseAdmin
          .from("pedidos_assinaturas")
          .upsert({
            clinica_id: clinicaId,
            plano: planoId,
            valor: transactionAmount,
            metodo_pagamento: paymentMethod,
            status: "pago",
            id_transacao_mp: String(dataId),
            data_pagamento: new Date().toISOString(),
          }, { onConflict: "id_transacao_mp" });

        if (orderError) {
          console.error("[mercadopago-webhook] Erro ao salvar pedido:", orderError);
        }
      }
    } 
    else if (type === "subscription" || type === "preapproval" || type === "preapproval_plan") {
      console.log(`[mercadopago-webhook] Processando assinatura/pré-autorização ID ${dataId}`);
      const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });

      if (!mpResponse.ok) {
        console.error(`[mercadopago-webhook] Erro ao buscar preapproval no MP: ${await mpResponse.text()}`);
        return new Response("Subscription not found on MP", { status: 200 });
      }

      const preapproval = await mpResponse.json();
      const status = preapproval.status;
      const clinicaId = preapproval.external_reference;
      const reason = preapproval.reason || "";
      const transactionAmount = preapproval.auto_recurring?.transaction_amount || 89.00;

      console.log(`[mercadopago-webhook] Assinatura ${dataId} status: ${status}, clinica: ${clinicaId}`);

      if (status === "authorized" && clinicaId) {
        let planoId = "bronze";
        if (reason.toLowerCase().includes("prata") || transactionAmount > 100) {
          planoId = "prata";
        }

        const limiteMsg = planoId === "prata" ? 1000 : 100;
        const limiteProc = planoId === "prata" ? 30 : 10;

        console.log(`[mercadopago-webhook] Ativando assinatura da clínica ${clinicaId} no plano ${planoId}`);

        // Atualizar clínica
        await supabaseAdmin
          .from("clinicas")
          .update({
            status_pagamento: "ativo",
            plano: planoId,
            limite_mensagens: limiteMsg,
            limite_procedimentos: limiteProc,
            data_fim_teste: null,
          })
          .eq("id", clinicaId);

        // Atualizar saldo da carteira
        await supabaseAdmin
          .from("carteira_envios")
          .upsert(
            { clinica_id: clinicaId, saldo: limiteMsg },
            { onConflict: "clinica_id" }
          );

        // Registrar pedido (usa chave baseada em data para não duplicar no mesmo dia)
        const dayKey = new Date().toISOString().slice(0, 10);
        await supabaseAdmin
          .from("pedidos_assinaturas")
          .upsert({
            clinica_id: clinicaId,
            plano: planoId,
            valor: transactionAmount,
            metodo_pagamento: "cartao",
            status: "pago",
            id_transacao_mp: `sub_${dataId}_${dayKey}`,
            id_assinatura_mp: String(dataId),
            data_pagamento: new Date().toISOString(),
          }, { onConflict: "id_transacao_mp" });
      } else if (status === "cancelled") {
        // Se a assinatura foi cancelada, marca a clínica correspondente
        await supabaseAdmin
          .from("clinicas")
          .update({ status_pagamento: "cancelado" })
          .eq("id", clinicaId);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[mercadopago-webhook] Exceção geral:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
