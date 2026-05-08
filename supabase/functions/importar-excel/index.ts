import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declaração do EdgeRuntime para uso de tarefas em segundo plano
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

const N8N_WEBHOOK_CLIENTES_URL = "https://n8n.vendii.com.br/webhook/dentalalerta";
const N8N_WEBHOOK_PROCEDIMENTOS_URL = "https://n8n.vendii.com.br/webhook/dentalalerta";

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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const tipo = String(formData.get("tipo") ?? "");
    const origem = String(formData.get("origem") ?? "");
    // Valor automático apenas para compatibilidade com o n8n, não aparece mais na UI
    const mesReferencia = new Date().toISOString().slice(0, 7);

    if (!file) {
      return new Response(JSON.stringify({ error: "Arquivo obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return new Response(JSON.stringify({ error: "Apenas arquivos .xlsx são permitidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tipo || !["clientes", "procedimentos"].includes(tipo)) {
      return new Response(JSON.stringify({ error: "Tipo inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${tipo}/${timestamp}-${file.name}`;

    console.log("[importar-excel] Upload para Storage", { bucket: "importacoes", path, tipo, origem, mesReferencia });

    const { error: uploadError } = await supabase.storage
      .from("importacoes")
      .upload(path, buffer, { contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    if (uploadError) {
      console.error("[importar-excel] Erro ao fazer upload para Storage", uploadError);
      return new Response(JSON.stringify({ error: "Falha ao salvar arquivo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await supabase.from("importacoes_historico").insert({
      tipo,
      origem,
      mes_referencia: mesReferencia,
      file_path: path,
      file_name: file.name,
      status: "enviado",
    });

    if (insertError) {
      console.error("[importar-excel] Erro ao salvar histórico", insertError);
    }

    // Encaminhar para n8n
    const forwardFormData = new FormData();
    forwardFormData.append("file", new File([buffer], file.name, { type: file.type }));
    forwardFormData.append("file_name", file.name);
    forwardFormData.append("tipo_titulo", file.name);
    forwardFormData.append("tipo", tipo);
    forwardFormData.append("mesReferencia", mesReferencia);
    forwardFormData.append("origem", origem || "dentalerta-frontend-via-supabase");

    // Para procedimentos, dispara o processamento em segundo plano para evitar limite de worker
    if (tipo === "procedimentos") {
      try {
        EdgeRuntime.waitUntil(
          (async () => {
            let n8nStatus = 0;
            let n8nOk = false;
            let n8nBodyText = "";
            let n8nParsedBody: unknown = null;

            try {
              console.log("[importar-excel/procedimentos] Chamando n8n", {
                url: N8N_WEBHOOK_PROCEDIMENTOS_URL,
                tipo,
                fileName: file.name,
                origem,
              });

              const n8nResponse = await fetch(N8N_WEBHOOK_PROCEDIMENTOS_URL, {
                method: "POST",
                body: forwardFormData,
              });

              n8nStatus = n8nResponse.status;
              n8nOk = n8nResponse.ok;

              console.log("[importar-excel/procedimentos] Resposta do n8n", {
                ok: n8nResponse.ok,
                status: n8nResponse.status,
                statusText: n8nResponse.statusText,
              });

              n8nBodyText = await n8nResponse.text().catch(() => "");

              if (n8nBodyText) {
                try {
                  n8nParsedBody = JSON.parse(n8nBodyText);
                } catch {
                  n8nParsedBody = null;
                }
              }

              const rawTipoFromN8n =
                n8nParsedBody && typeof n8nParsedBody === "object" && "tipo" in (n8nParsedBody as any)
                  ? (n8nParsedBody as any).tipo
                  : undefined;

              const tipoFromN8n =
                typeof rawTipoFromN8n === "string" && rawTipoFromN8n.trim().length > 0 ? rawTipoFromN8n.trim() : undefined;

              console.log("[importar-excel/procedimentos] Tipo vindo do n8n", {
                tipoOriginal: tipo,
                rawTipoFromN8n,
                tipoFinal: tipoFromN8n ?? tipo,
              });

              const { error: updateError } = await supabase
                .from("importacoes_historico")
                .update({
                  status: n8nResponse.ok ? "processando" : "erro-n8n",
                  n8n_status: `${n8nResponse.status}`,
                  n8n_response: n8nParsedBody ?? (n8nBodyText ? { raw: n8nBodyText } : null),
                  tipo: tipoFromN8n ?? tipo,
                })
                .eq("file_path", path);

              if (updateError) {
                console.error("[importar-excel/procedimentos] Erro ao atualizar histórico com retorno do n8n", updateError);
              }
            } catch (n8nError) {
              console.error("[importar-excel/procedimentos] Erro ao chamar n8n", n8nError);
              const { error: updateError } = await supabase
                .from("importacoes_historico")
                .update({ status: "erro-n8n" })
                .eq("file_path", path);

              if (updateError) {
                console.error("[importar-excel/procedimentos] Erro ao atualizar histórico após falha no n8n", updateError);
              }
            }
          })(),
        );
      } catch (error) {
        console.error("[importar-excel/procedimentos] Erro ao agendar tarefa em segundo plano", error);
      }

      return new Response(
        JSON.stringify({
          success: true,
          storagePath: path,
          message: "Processamento de procedimentos iniciado em segundo plano.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fluxo original para clientes (sincrono, aguarda resposta do n8n)
    let n8nStatus = 0;
    let n8nOk = false;
    let n8nBodyText = "";
    let n8nParsedBody: unknown = null;

    try {
      console.log("[importar-excel/clientes] Chamando n8n", {
        url: N8N_WEBHOOK_CLIENTES_URL,
        tipo,
        fileName: file.name,
        origem,
      });

      const n8nResponse = await fetch(N8N_WEBHOOK_CLIENTES_URL, {
        method: "POST",
        body: forwardFormData,
      });
      n8nStatus = n8nResponse.status;
      n8nOk = n8nResponse.ok;

      console.log("[importar-excel/clientes] Resposta do n8n", {
        ok: n8nResponse.ok,
        status: n8nResponse.status,
        statusText: n8nResponse.statusText,
      });

      n8nBodyText = await n8nResponse.text().catch(() => "");

      if (n8nBodyText) {
        try {
          n8nParsedBody = JSON.parse(n8nBodyText);
        } catch {
          n8nParsedBody = null;
        }
      }

      const rawTipoFromN8n =
        n8nParsedBody && typeof n8nParsedBody === "object" && "tipo" in (n8nParsedBody as any)
          ? (n8nParsedBody as any).tipo
          : undefined;

      const tipoFromN8n =
        typeof rawTipoFromN8n === "string" && rawTipoFromN8n.trim().length > 0 ? rawTipoFromN8n.trim() : undefined;

      console.log("[importar-excel/clientes] Tipo vindo do n8n", {
        tipoOriginal: tipo,
        rawTipoFromN8n,
        tipoFinal: tipoFromN8n ?? tipo,
      });

      const { error: updateError } = await supabase
        .from("importacoes_historico")
        .update({
          status: n8nResponse.ok ? "processando" : "erro-n8n",
          n8n_status: `${n8nResponse.status}`,
          n8n_response: n8nParsedBody ?? (n8nBodyText ? { raw: n8nBodyText } : null),
          tipo: tipoFromN8n ?? tipo,
        })
        .eq("file_path", path);

      if (updateError) {
        console.error("[importar-excel/clientes] Erro ao atualizar histórico com retorno do n8n", updateError);
      }
    } catch (n8nError) {
      console.error("[importar-excel/clientes] Erro ao chamar n8n", n8nError);
      const { error: updateError } = await supabase
        .from("importacoes_historico")
        .update({ status: "erro-n8n" })
        .eq("file_path", path);

      if (updateError) {
        console.error("[importar-excel/clientes] Erro ao atualizar histórico após falha no n8n", updateError);
      }

      return new Response(
        JSON.stringify({
          error: "Falha ao chamar o webhook do n8n em produção",
          detalhes: String(n8nError),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        storagePath: path,
        n8n: { ok: n8nOk, status: n8nStatus, body: n8nParsedBody ?? (n8nBodyText || null) },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[importar-excel] Erro inesperado", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
