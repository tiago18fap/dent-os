// Cliente da API do DentOS.
//
// O DentOS saiu do Supabase, mas a API propria responde nos mesmos caminhos
// (/rest/v1, /auth/v1, /functions/v1), entao o supabase-js continua sendo o cliente.
// Endereco e chave anon vem do build (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY);
// sem endereco, usa o proprio dominio do site (nginx encaminha para a API).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
export const SUPABASE_URL = (envUrl || window.location.origin).replace(/\/$/, "");
export const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || "";

if (!SUPABASE_PUBLISHABLE_KEY) {
  console.error("[DentOS] VITE_SUPABASE_PUBLISHABLE_KEY nao definida no build: as chamadas a API vao falhar.");
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

/** Endereco publico de uma funcao (ex-Edge Function), para webhooks e chamadas diretas. */
export function functionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}
