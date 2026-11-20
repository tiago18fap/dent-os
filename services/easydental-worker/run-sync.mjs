import { syncTodasClinicas } from './sync.mjs';

// Endereco da API do DentOS (compativel com Supabase) e chave service_role: so por variavel de ambiente.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Defina SUPABASE_URL e SUPABASE_KEY (service_role da API do DentOS).');

async function run() {
  console.log('[CRON] Iniciando sincronização diária de todas as clínicas...');
  try {
    const result = await syncTodasClinicas({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
    console.log('[CRON] Sincronização concluída com sucesso:', JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    console.error('[CRON] Erro na sincronização:', err.message);
    process.exit(1);
  }
}

run();
