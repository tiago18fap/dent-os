import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://postgres.gykzvglfqzebexpczwvr:%40Tito1803%40%21@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';

async function main() {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    console.log('[SUCCESS] Connected via direct IPv6!');
    
    const res = await client.query(`
      SELECT pg_get_constraintdef(oid) AS constraint_def
      FROM pg_constraint
      WHERE conname = 'bank_statement_entries_source_check';
    `);
    console.log('--- CONSTRAINT DEFINITION ---');
    console.log(res.rows[0] ? res.rows[0].constraint_def : 'Constraint not found');
    console.log('-----------------------------');
    
    // Also let's query the distinct source values in bank_statement_entries
    const distinctSources = await client.query(`
      SELECT DISTINCT source FROM public.bank_statement_entries;
    `).catch(() => ({ rows: [] }));
    console.log('--- DISTINCT SOURCES IN TABLE ---');
    console.log(distinctSources.rows.map(r => r.source));
    
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
