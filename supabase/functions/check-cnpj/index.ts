import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { cnpj } = await req.json().catch(() => ({ cnpj: "" }));

    if (!cnpj || typeof cnpj !== "string") {
      return new Response(JSON.stringify({ error: "CNPJ obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove formatting, keep only digits
    const cleanCnpj = cnpj.replace(/\D/g, "");

    if (cleanCnpj.length !== 14) {
      return new Response(JSON.stringify({ error: "CNPJ deve ter 14 dígitos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if CNPJ already exists in clinicas table
    const { data, error } = await supabase
      .from("clinicas")
      .select("id, nome")
      .eq("cnpj", cleanCnpj)
      .limit(1);

    if (error) {
      console.error("[check-cnpj] Erro ao consultar clínicas", error);
      return new Response(JSON.stringify({ error: "Erro ao verificar CNPJ" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exists = Array.isArray(data) && data.length > 0;
    const clinicaNome = exists ? data[0].nome : null;

    return new Response(JSON.stringify({ exists, clinicaNome }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[check-cnpj] Erro inesperado", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
