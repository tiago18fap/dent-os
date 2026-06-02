import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════════════════════════════
// Mercado Pago Checkout — Orders API v1
// Cria uma order e retorna a URL de pagamento (Checkout Pro)
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // Autenticação
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    // Buscar clinica_id
    const { data: perfilData, error: perfilError } = await supabaseClient
      .from("perfis")
      .select("clinica_id")
      .eq("id", user.id)
      .single();

    if (perfilError || !perfilData?.clinica_id) {
      throw new Error("Clínica não encontrada para o usuário logado.");
    }

    const clinicaId = perfilData.clinica_id;

    // Parâmetros do request
    const { planoId } = await req.json(); // planoId: 'bronze' | 'prata'

    if (!planoId) {
      throw new Error("Parâmetro inválido: planoId é obrigatório.");
    }

    // Buscar credenciais do MP
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

    if (!accessToken) {
      console.warn("[mp-checkout] Mercado Pago não configurado. Usando modo simulado.");
      const origin = req.headers.get("origin") || "https://dentos.com.br";
      const mockUrl = `${origin}/assinatura?success=true&plano_checkout=${planoId}`;
      return new Response(JSON.stringify({ url: mockUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ═══ Configuração do plano ═══
    const price = planoId === "prata" ? 139.00 : 89.00;
    const planName = planoId === "prata" ? "Prata" : "Bronze";
    const origin = req.headers.get("origin") || "https://dentos.com.br";
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`;

    // ═══ Criar Order via Orders API v1 ═══
    const idempotencyKey = crypto.randomUUID();

    const orderBody = {
      type: "online",
      processing_mode: "automatic",
      total_amount: price,
      external_reference: clinicaId,
      payer: {
        email: user.email,
      },
      items: [
        {
          id: planoId,
          title: `DentOS - Plano ${planName} (Mensal)`,
          unit_price: price,
          quantity: 1,
          category_id: "services",
        },
      ],
      notification_url: webhookUrl,
      back_urls: {
        success: `${origin}/assinatura?success=true&plano_checkout=${planoId}`,
        failure: `${origin}/assinatura?failure=true`,
        pending: `${origin}/assinatura?pending=true`,
      },
      auto_return: "approved",
    };

    console.log("[mp-checkout] Criando order:", JSON.stringify(orderBody));

    const mpResponse = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(orderBody),
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("[mp-checkout] Erro do MP:", JSON.stringify(data));
      throw new Error(data.message || `Erro no Mercado Pago: ${JSON.stringify(data)}`);
    }

    console.log("[mp-checkout] Order criada:", data.id, "Status:", data.status);

    // Extrair URL de pagamento
    // Orders API retorna checkout_url ou init_point dependendo da config
    const checkoutUrl = data.checkout_url || data.init_point || data.sandbox_init_point;

    if (!checkoutUrl) {
      console.error("[mp-checkout] Resposta sem URL de checkout:", JSON.stringify(data));
      throw new Error("Mercado Pago não retornou URL de pagamento. Verifique as credenciais.");
    }

    // Registrar auditoria
    await supabaseAdmin
      .from("auditoria_logs")
      .insert({
        clinica_id: clinicaId,
        usuario_email: user.email || "Sistema",
        acao: "checkout_iniciado",
        descricao: `Order ${data.id} criada para Plano ${planName} (R$${price}). URL: ${checkoutUrl}`,
      }).catch(() => {});

    return new Response(JSON.stringify({ url: checkoutUrl, orderId: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[mp-checkout] Erro:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
