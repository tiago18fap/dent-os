import jwt from "jsonwebtoken";
import { config } from "./config.js";

// Os tokens seguem o formato do Supabase: o PostgREST le `role` para trocar de
// papel no Postgres e as politicas RLS leem `sub` via auth.uid().

export function signAccessToken(user, sessionId) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + config.accessTokenTtl;
  const token = jwt.sign(
    {
      aud: "authenticated",
      exp,
      iat: now,
      iss: `${config.publicUrl}/auth/v1`,
      sub: user.id,
      email: user.email,
      phone: "",
      app_metadata: user.raw_app_meta_data || { provider: "email", providers: ["email"] },
      user_metadata: user.raw_user_meta_data || {},
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: now }],
      session_id: sessionId,
      is_anonymous: false,
    },
    config.jwtSecret,
    { algorithm: "HS256", noTimestamp: true },
  );
  return { token, exp };
}

/** Chave fixa de um papel (anon ou service_role), como as chaves do painel do Supabase. */
export function signRoleKey(role, years = 10) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: "dentos", role, iat: now, exp: now + years * 365 * 24 * 3600 },
    config.jwtSecret,
    { algorithm: "HS256", noTimestamp: true },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
}

export function bearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
