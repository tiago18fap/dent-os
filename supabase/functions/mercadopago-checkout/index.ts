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

    // Fetch client_reference_id (clinica_id)
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
    const { planoId, tipo } = await req.json(); // planoId: 'bronze' | 'prata', tipo: 'assinatura' | 'avulso'

    if (!planoId || !tipo) {
      throw new Error("Parâmetros inválidos: planoId e tipo são obrigatórios.");
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

    if (!accessToken) {
      throw new Error("Mercado Pago não está configurado. Token de Acesso ausente.");
    }

    const price = planoId === "prata" ? 139.00 : 89.00;
    const planName = planoId === "prata" ? "Prata" : "Bronze";
    const origin = req.headers.get("origin") || "http://localhost:5173";

    let initUrl = "";

    if (tipo === "assinatura") {
      // 1. Criar Assinatura (Preapproval)
      const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payer_email: user.email,
          back_url: `${origin}/assinatura?success=true`,
          reason: `DentOS - Assinatura Plano ${planName}`,
          external_reference: clinicaId,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: price,
            currency_id: "BRL",
          },
          status: "pending",
        }),
      });

      const data = await mpResponse.json();
      if (!mpResponse.ok) {
        throw new Error(data.message || `Erro no Mercado Pago: ${JSON.stringify(data)}`);
      }
      initUrl = data.init_point;
    } else {
      // 2. Criar Pagamento Avulso (Preference)
      const mpResponse = await fetch("https://api.mercadopago.com/v1/checkouts/preferences", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              id: planoId,
              title: `DentOS - Plano ${planName} (Mensal)`,
              quantity: 1,
              currency_id: "BRL",
              unit_price: price,
            },
          ],
          payer: {
            email: user.email,
          },
          back_urls: {
            success: `${origin}/assinatura?success=true`,
            failure: `${origin}/assinatura?failure=true`,
            pending: `${origin}/assinatura?pending=true`,
          },
          auto_return: "approved",
          external_reference: clinicaId,
        }),
      });

      const data = await mpResponse.json();
      if (!mpResponse.ok) {
        throw new Error(data.message || `Erro no Mercado Pago: ${JSON.stringify(data)}`);
      }
      initUrl = data.init_point;
    }

    return new Response(JSON.stringify({ url: initUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Erro no checkout Mercado Pago:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
