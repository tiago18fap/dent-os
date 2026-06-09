import { execSync } from 'child_process';

export async function run(credentials, log, taskId = 'unknown', controller = {}) {
  log('Iniciando script para ler restrição de banco de dados...');
  
  try {
    log('Instalando pacote pg...');
    execSync('npm install pg');
    log('Pacote pg instalado com sucesso.');
    
    const { default: pkg } = await import('pg');
    const { Client } = pkg;
    
    const connectionString = 'postgresql://postgres:%40Tito1803%40%21@[2600:1f13:838:6e16:a389:50ce:4846:847b]:5432/postgres';
    
    log('Conectando ao banco de dados...');
    const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
    await client.connect();
    log('Conectado com sucesso!');
    
    const res = await client.query(`
      SELECT pg_get_constraintdef(oid) AS constraint_def
      FROM pg_constraint
      WHERE conname = 'bank_statement_entries_source_check';
    `);
    
    const def = res.rows[0] ? res.rows[0].constraint_def : 'Restrição não encontrada';
    log('Restrição encontrada: ' + def);
    
    const distinctSources = await client.query(`
      SELECT DISTINCT source FROM public.bank_statement_entries;
    `).catch(() => ({ rows: [] }));
    log('Valores distintos de source: ' + JSON.stringify(distinctSources.rows.map(r => r.source)));
    
    await client.end();
    
    return {
      constraint: def,
      distinctSources: distinctSources.rows.map(r => r.source)
    };
  } catch (err) {
    log('Erro ao ler restrição: ' + err.message, 'ERROR');
    throw err;
  }
}
