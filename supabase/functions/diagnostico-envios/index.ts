import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVOLUTION_API_URL = "https://evolution-evolution-api.qfjowr.easypanel.host";
const EVOLUTION_API_KEY = "429683C4C977415CAAFCCE10F7D57E11";
const INSTANCE = "dentos_79d7fdc6c713";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  }

  try {
    // Buscar todos os telefones da fila de hoje
    const { data: filaHoje } = await supabase
      .from("fila_envios")
      .select("telefone, paciente_nome")
      .gte("data_programada", "2026-06-01T00:00:00Z")
      .lt("data_programada", "2026-06-02T00:00:00Z");

    if (!filaHoje || filaHoje.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma msg na fila de hoje" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Deduplicar telefones
    const phoneMap = new Map<string, string>();
    for (const f of filaHoje) {
      if (f.telefone && !phoneMap.has(f.telefone)) {
        phoneMap.set(f.telefone, f.paciente_nome || f.telefone);
      }
    }

    const results: Array<{ phone: string; nome: string; msgs_enviadas_hoje: number }> = [];

    // Timestamp de hoje 00:00 UTC
    const todayStart = Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000);

    for (const [phone, nome] of phoneMap) {
      const jid = `${phone}@s.whatsapp.net`;

      try {
        const msgsRes = await fetch(`${EVOLUTION_API_URL}/chat/findMessages/${INSTANCE}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({
            where: { key: { remoteJid: jid, fromMe: true } },
            limit: 200,
          }),
        });

        if (msgsRes.ok) {
          const raw = await msgsRes.json();
          const msgs = Array.isArray(raw) ? raw : raw?.messages?.records || raw?.messages || [];
          const msgsArray = Array.isArray(msgs) ? msgs : [];

          // Contar mensagens enviadas hoje
          let countToday = 0;
          for (const m of msgsArray) {
            const ts = m.messageTimestamp || 0;
            if (ts >= todayStart) countToday++;
          }

          if (countToday > 0) {
            results.push({ phone, nome, msgs_enviadas_hoje: countToday });
          }
        }
      } catch {
        // skip errors
      }
    }

    // Ordenar por mais mensagens
    results.sort((a, b) => b.msgs_enviadas_hoje - a.msgs_enviadas_hoje);

    const totalMsgsEnviadas = results.reduce((sum, r) => sum + r.msgs_enviadas_hoje, 0);

    return new Response(JSON.stringify({
      resumo: {
        total_contatos_na_fila: phoneMap.size,
        contatos_que_receberam: results.length,
        total_msgs_enviadas: totalMsgsEnviadas,
        media_por_contato: results.length > 0 ? (totalMsgsEnviadas / results.length).toFixed(1) : 0,
      },
      contatos: results,
    }, null, 2), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
