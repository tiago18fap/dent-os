// Gera os segredos da API propria e as chaves anon/service_role derivadas.
//
//   node server/scripts/gerar-chaves.mjs            -> gera um JWT_SECRET novo e as chaves
//   JWT_SECRET=... node server/scripts/gerar-chaves.mjs -> so recalcula as chaves
//
// Saida no formato .env. Guarde no EasyPanel (nunca no git).
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET || crypto.randomBytes(48).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const tenYears = 10 * 365 * 24 * 3600;
const key = (role) =>
  jwt.sign({ iss: "dentos", role, iat: now, exp: now + tenYears }, secret, { algorithm: "HS256", noTimestamp: true });

const out = {
  JWT_SECRET: secret,
  AUTHENTICATOR_PASSWORD: process.env.AUTHENTICATOR_PASSWORD || crypto.randomBytes(24).toString("base64url"),
  DB_PASSWORD: process.env.DB_PASSWORD || crypto.randomBytes(24).toString("base64url"),
  ANON_KEY: key("anon"),
  SERVICE_ROLE_KEY: key("service_role"),
};

for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
console.error(
  "\nANON_KEY vai no build do frontend (VITE_SUPABASE_PUBLISHABLE_KEY).\n" +
    "SERVICE_ROLE_KEY da acesso total: so no servidor (worker Easy Dental), nunca no frontend.",
);
