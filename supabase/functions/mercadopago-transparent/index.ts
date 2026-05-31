import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // Fetch user details
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) throw new Error("Não autenticado");

    // Fetch clinica_id from perfis
    const { data: perfilData, error: perfilError } = await supabaseClient
      .from("perfis")
      .select("clinica_id")
      .eq("id", user.id)
      .single();

    if (perfilError || !perfilData?.clinica_id) {
      throw new Error("Clínica não encontrada para o usuário logado.");
    }

    const clinicaId = perfilData.clinica_id;

    // Get body parameters
    const { planoId, tipo, token, paymentMethodId } = await req.json(); // planoId: 'bronze' | 'prata', tipo: 'assinatura' | 'avulso', token: card token, paymentMethodId: string

    if (!planoId || !tipo || !token) {
      throw new Error("Parâmetros inválidos: planoId, tipo e token são obrigatórios.");
    }

    // Fetch Mercado Pago credentials from database using service role client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: mpConfig } = await supabaseAdmin
      .from("sistema_pagamento_config")
      .select("mercado_pago_access_token")
      .limit(1)
      .maybeSingle();

    const accessToken = mpConfig?.mercado_pago_access_token || Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

    const price = planoId === "prata" ? 139.00 : 89.00;
    const planName = planoId === "prata" ? "Prata" : "Bronze";

    // Se o token for mock ou se a API do MP não estiver configurada, usamos simulação
    if (!accessToken || token.startsWith("mock_token")) {
      console.warn("Mercado Pago não está configurado ou token simulado. Ativando plano fictício.");
      
      // Atualiza a clínica para ativo
      const { error: errorClinica } = await supabaseAdmin
        .from("clinicas")
        .update({
          status_pagamento: "ativo",
          plano: planoId,
          limite_mensagens: planoId === "prata" ? 1000 : 100,
          limite_procedimentos: planoId === "prata" ? 30 : 10,
          data_fim_teste: null
        })
        .eq("id", clinicaId);

      if (errorClinica) throw errorClinica;

      // Cria registro de pedido
      const { error: errorPedido } = await supabaseAdmin
        .from("pedidos_assinaturas")
        .insert({
          clinica_id: clinicaId,
          plano: planoId,
          valor: price,
          metodo_pagamento: "cartao",
          status: "pago",
          id_transacao_mp: `mock_trans_${Date.now()}`
        });

      if (errorPedido) throw errorPedido;

      // Atualizar carteira de envios
      await supabaseAdmin
        .from("carteira_envios")
        .upsert({
          clinica_id: clinicaId,
          saldo: planoId === "prata" ? 1000 : 100
        });

      // Check if there are past-due pending messages → trigger reactivation screen
      const { data: pendingPastMock } = await supabaseAdmin
        .from("fila_envios")
        .select("id")
        .eq("clinica_id", clinicaId)
        .eq("status", "pendente")
        .lt("data_programada", new Date().toISOString())
        .limit(1);

      if (pendingPastMock && pendingPastMock.length > 0) {
        await supabaseAdmin
          .from("clinicas")
          .update({ reativacao_pendente: true })
          .eq("id", clinicaId);
      }

      return new Response(JSON.stringify({ success: true, simulated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Processamento real do pagamento transparente com a API do Mercado Pago
    if (tipo === "assinatura") {
      // 1. Criar Assinatura (Preapproval) com token do cartão
      const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payer_email: user.email,
          card_token_id: token,
          reason: `DentOS - Assinatura Plano ${planName}`,
          external_reference: clinicaId,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: price,
            currency_id: "BRL",
          },
          status: "authorized",
        }),
      });

      const data = await mpResponse.json();
      if (!mpResponse.ok) {
        throw new Error(data.message || `Erro no Mercado Pago: ${JSON.stringify(data)}`);
      }

      // Atualiza a clínica para ativa
      await supabaseAdmin
        .from("clinicas")
        .update({
          status_pagamento: "ativo",
          plano: planoId,
          limite_mensagens: planoId === "prata" ? 1000 : 100,
          limite_procedimentos: planoId === "prata" ? 30 : 10,
          data_fim_teste: null
        })
        .eq("id", clinicaId);

      // Salva o log de assinatura
      await supabaseAdmin
        .from("pedidos_assinaturas")
        .insert({
          clinica_id: clinicaId,
          plano: planoId,
          valor: price,
          metodo_pagamento: "cartao",
          status: "pago",
          id_assinatura_mp: data.id,
          id_transacao_mp: `sub_trans_${Date.now()}`
        });

      // Atualizar carteira
      await supabaseAdmin
        .from("carteira_envios")
        .upsert({
          clinica_id: clinicaId,
          saldo: planoId === "prata" ? 1000 : 100
        });

      // Check if there are past-due pending messages → trigger reactivation screen
      const { data: pendingPastSub } = await supabaseAdmin
        .from("fila_envios")
        .select("id")
        .eq("clinica_id", clinicaId)
        .eq("status", "pendente")
        .lt("data_programada", new Date().toISOString())
        .limit(1);

      if (pendingPastSub && pendingPastSub.length > 0) {
        await supabaseAdmin
          .from("clinicas")
          .update({ reativacao_pendente: true })
          .eq("id", clinicaId);
      }

      return new Response(JSON.stringify({ success: true, id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else {
      // 2. Criar Pagamento Avulso (Payments V1)
      const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction_amount: price,
          token: token,
          description: `DentOS - Plano ${planName} (Mensal)`,
          installments: 1,
          payment_method_id: paymentMethodId || "visa",
          payer: {
            email: user.email,
          },
          external_reference: clinicaId,
        }),
      });

      const data = await mpResponse.json();
      if (!mpResponse.ok) {
        throw new Error(data.message || `Erro no Mercado Pago: ${JSON.stringify(data)}`);
      }

      if (data.status === "approved") {
        // Atualiza a clínica para ativa
        await supabaseAdmin
          .from("clinicas")
          .update({
            status_pagamento: "ativo",
            plano: planoId,
            limite_mensagens: planoId === "prata" ? 1000 : 100,
            limite_procedimentos: planoId === "prata" ? 30 : 10,
            data_fim_teste: null
          })
          .eq("id", clinicaId);

        // Salva o log de pagamento
        await supabaseAdmin
          .from("pedidos_assinaturas")
          .insert({
            clinica_id: clinicaId,
            plano: planoId,
            valor: price,
            metodo_pagamento: "cartao",
            status: "pago",
            id_transacao_mp: String(data.id)
          });

        // Atualizar carteira
        await supabaseAdmin
          .from("carteira_envios")
          .upsert({
            clinica_id: clinicaId,
            saldo: planoId === "prata" ? 1000 : 100
          });

        // Check if there are past-due pending messages → trigger reactivation screen
        const { data: pendingPastAvulso } = await supabaseAdmin
          .from("fila_envios")
          .select("id")
          .eq("clinica_id", clinicaId)
          .eq("status", "pendente")
          .lt("data_programada", new Date().toISOString())
          .limit(1);

        if (pendingPastAvulso && pendingPastAvulso.length > 0) {
          await supabaseAdmin
            .from("clinicas")
            .update({ reativacao_pendente: true })
            .eq("id", clinicaId);
        }

        return new Response(JSON.stringify({ success: true, id: data.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        throw new Error(`Pagamento não aprovado. Status: ${data.status_detail}`);
      }
    }
  } catch (error: any) {
    console.error("Erro no pagamento transparente:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
