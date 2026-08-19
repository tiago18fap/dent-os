import { syncTodasClinicas } from './sync.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dzbeorfkualalocrvobe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6YmVvcmZrdWFsYWxvY3J2b2JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjYyMjIxNSwiZXhwIjoyMDgyMTk4MjE1fQ.EtxdNtddWDFNu_k2pvcmqn72UB8YWAyIKcvLNkcEHog';

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
