import { syncTodasClinicas } from './sync.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dzbeorfkualalocrvobe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

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
