import pg from "pg";
import { readFile } from "node:fs/promises";
import { config } from "./config.js";

// Datas/horas voltam como texto ISO cru (igual ao PostgREST), sem conversao de fuso no Node.
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1114, (v) => v); // timestamp
pg.types.setTypeParser(1184, (v) => v); // timestamptz

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 10),
  statement_timeout: 30_000,
});

pool.on("error", (err) => console.error("[db] erro no pool:", err.message));

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Prepara o banco no boot: papeis, schema auth e stubs (bootstrap.sql),
 * search_path igual ao Supabase e a senha do papel `authenticator`.
 */
export async function bootstrapDatabase() {
  const sql = await readFile(new URL("../db/bootstrap.sql", import.meta.url), "utf8");
  await pool.query(sql);

  const { rows } = await pool.query("SELECT current_database() AS db");
  const db = pg.escapeIdentifier(rows[0].db);
  await pool.query(`ALTER DATABASE ${db} SET search_path TO "$user", public, extensions`);
  await pool.query(`ALTER ROLE authenticator WITH LOGIN PASSWORD ${pg.escapeLiteral(config.authenticatorPassword)}`);
  console.log("[db] bootstrap ok");
}
