// Servico de login compativel com o GoTrue (o "Auth" do Supabase), no subconjunto
// que o supabase-js do DentOS usa: login por senha, cadastro, refresh, getUser,
// troca de senha, logout e a listagem administrativa de usuarios.
//
// Os usuarios continuam em auth.users com o MESMO hash bcrypt exportado do
// Supabase, entao ninguem precisa trocar de senha na migracao.

import express from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { query, withTransaction } from "../lib/db.js";
import { signAccessToken, verifyToken, bearer } from "../lib/jwt.js";
import { config } from "../lib/config.js";

const API_VERSION = "2024-01-01";
const REFRESH_REUSE_SECONDS = 10;
const MIN_PASSWORD = 6;

export const authRouter = express.Router();
authRouter.use(express.json({ limit: "1mb" }));
authRouter.use((_req, res, next) => {
  res.setHeader("X-Supabase-Api-Version", API_VERSION);
  next();
});

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => fail(res, 429, "over_request_rate_limit", "Request rate limit reached"),
});

function fail(res, status, code, msg) {
  return res.status(status).json({ code, error_code: code, msg });
}

const USER_COLUMNS = `id, aud, role, email, encrypted_password, email_confirmed_at, phone, confirmed_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, banned_until, deleted_at, is_anonymous`;

function iso(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

export function toUserJson(u) {
  return {
    id: u.id,
    aud: u.aud || "authenticated",
    role: u.role || "authenticated",
    email: u.email,
    email_confirmed_at: iso(u.email_confirmed_at),
    phone: u.phone || "",
    confirmed_at: iso(u.confirmed_at || u.email_confirmed_at),
    last_sign_in_at: iso(u.last_sign_in_at),
    app_metadata: u.raw_app_meta_data || { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data || {},
    identities: [
      {
        identity_id: u.id,
        id: u.id,
        user_id: u.id,
        identity_data: { email: u.email, email_verified: !!u.email_confirmed_at, sub: u.id },
        provider: "email",
        created_at: iso(u.created_at),
        updated_at: iso(u.updated_at),
        email: u.email,
      },
    ],
    created_at: iso(u.created_at),
    updated_at: iso(u.updated_at),
    is_anonymous: !!u.is_anonymous,
  };
}

async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM auth.users WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM auth.users WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
}

function isBlocked(u) {
  return !!u.deleted_at || (u.banned_until && new Date(u.banned_until) > new Date());
}

async function issueSession(user, { sessionId = crypto.randomUUID(), parent = null, client } = {}) {
  const refresh = crypto.randomBytes(24).toString("base64url");
  const run = client ? client.query.bind(client) : query;
  await run(
    `INSERT INTO auth.refresh_tokens (token, user_id, session_id, parent) VALUES ($1, $2, $3, $4)`,
    [refresh, user.id, sessionId, parent],
  );
  const { token, exp } = signAccessToken(user, sessionId);
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: config.accessTokenTtl,
    expires_at: exp,
    refresh_token: refresh,
    user: toUserJson(user),
  };
}

/** Le e valida o Bearer de usuario (nao aceita a chave anon/service_role). */
async function requireUser(req, res) {
  const token = bearer(req);
  if (!token) {
    fail(res, 401, "no_authorization", "This endpoint requires a valid Bearer token");
    return null;
  }
  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    fail(res, 403, "bad_jwt", "invalid JWT: unable to parse or verify signature, token is expired");
    return null;
  }
  if (!claims.sub) {
    fail(res, 403, "bad_jwt", "invalid claim: missing sub claim");
    return null;
  }
  if (claims.session_id) {
    const { rows } = await query(
      `SELECT 1 FROM auth.refresh_tokens WHERE session_id = $1 AND revoked = false LIMIT 1`,
      [claims.session_id],
    );
    if (!rows.length) {
      fail(res, 403, "session_not_found", "Session from session_id claim in JWT does not exist");
      return null;
    }
  }
  const user = await findUserById(claims.sub);
  if (!user || isBlocked(user)) {
    fail(res, 403, "user_not_found", "User from sub claim in JWT does not exist");
    return null;
  }
  return { user, claims };
}

function requireServiceRole(req, res) {
  const token = bearer(req);
  try {
    const claims = token && verifyToken(token);
    if (claims && claims.role === "service_role") return true;
  } catch {
    /* cai no erro abaixo */
  }
  fail(res, 403, "not_admin", "User not allowed");
  return false;
}

// ------------------------------------------------------------------ rotas

authRouter.get("/health", (_req, res) => {
  res.json({ version: "dentos-auth", name: "GoTrue", description: "DentOS auth (compativel com GoTrue)" });
});

authRouter.get("/settings", (_req, res) => {
  res.json({
    external: { email: true, phone: false },
    disable_signup: config.disableSignup,
    mailer_autoconfirm: true,
    phone_autoconfirm: false,
    sms_provider: "",
    saml_enabled: false,
  });
});

authRouter.post("/token", loginLimiter, async (req, res, next) => {
  try {
    const grant = req.query.grant_type;
    if (grant === "password") {
      const email = String(req.body?.email || "").trim();
      const password = String(req.body?.password || "");
      if (!email || !password) return fail(res, 400, "validation_failed", "missing email or phone");

      const user = await findUserByEmail(email);
      const ok = user && user.encrypted_password && (await bcrypt.compare(password, user.encrypted_password));
      if (!ok || isBlocked(user)) return fail(res, 400, "invalid_credentials", "Invalid login credentials");

      await query(`UPDATE auth.users SET last_sign_in_at = now(), updated_at = now() WHERE id = $1`, [user.id]);
      user.last_sign_in_at = new Date();
      return res.json(await issueSession(user));
    }

    if (grant === "refresh_token") {
      const token = String(req.body?.refresh_token || "");
      if (!token) return fail(res, 400, "validation_failed", "refresh_token required");

      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT id, user_id, session_id, revoked, updated_at FROM auth.refresh_tokens WHERE token = $1 FOR UPDATE`,
          [token],
        );
        const row = rows[0];
        if (!row) return { error: [400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found"] };

        if (row.revoked) {
          // Duas abas pedindo refresh ao mesmo tempo: aceita reuso por alguns segundos.
          const age = (Date.now() - new Date(row.updated_at).getTime()) / 1000;
          const { rows: active } = await client.query(
            `SELECT 1 FROM auth.refresh_tokens WHERE session_id = $1 AND revoked = false LIMIT 1`,
            [row.session_id],
          );
          if (age > REFRESH_REUSE_SECONDS || !active.length) {
            return { error: [400, "refresh_token_already_used", "Invalid Refresh Token: Already Used"] };
          }
        } else {
          await client.query(`UPDATE auth.refresh_tokens SET revoked = true, updated_at = now() WHERE id = $1`, [row.id]);
        }

        const { rows: urows } = await client.query(`SELECT ${USER_COLUMNS} FROM auth.users WHERE id = $1`, [row.user_id]);
        const user = urows[0];
        if (!user || isBlocked(user)) return { error: [400, "user_not_found", "User not found"] };
        return { session: await issueSession(user, { sessionId: row.session_id, parent: token, client }) };
      });

      if (result.error) return fail(res, ...result.error);
      return res.json(result.session);
    }

    return fail(res, 400, "unsupported_grant_type", "unsupported_grant_type");
  } catch (err) {
    next(err);
  }
});

authRouter.post("/signup", loginLimiter, async (req, res, next) => {
  try {
    if (config.disableSignup) return fail(res, 422, "signup_disabled", "Signups not allowed for this instance");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const data = req.body?.data && typeof req.body.data === "object" ? req.body.data : {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail(res, 400, "email_address_invalid", `Email address "${email}" is invalid`);
    }
    if (password.length < MIN_PASSWORD) {
      return res.status(422).json({
        code: "weak_password",
        error_code: "weak_password",
        msg: `Password should be at least ${MIN_PASSWORD} characters.`,
        weak_password: { reasons: ["length"] },
      });
    }
    if (await findUserByEmail(email)) return fail(res, 422, "user_already_exists", "User already registered");

    const hash = await bcrypt.hash(password, 10);
    // O INSERT em auth.users dispara os triggers do schema public (cria clinica,
    // perfil, carteira...), exatamente como acontecia no Supabase.
    const session = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
         VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           $1, $2, now(), '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb, now(), now(), now())
         RETURNING ${USER_COLUMNS}`,
        [email, hash, JSON.stringify(data)],
      );
      const user = rows[0];
      await client.query(
        `INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
         VALUES ($1::text, $2::uuid, $3::jsonb, 'email', now(), now(), now())`,
        [user.id, user.id, JSON.stringify({ sub: user.id, email, email_verified: true })],
      );
      return issueSession(user, { client });
    });
    return res.json(session);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/user", async (req, res, next) => {
  try {
    const auth = await requireUser(req, res);
    if (auth) res.json(toUserJson(auth.user));
  } catch (err) {
    next(err);
  }
});

authRouter.put("/user", async (req, res, next) => {
  try {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { password, data, email } = req.body || {};
    if (email && email.toLowerCase() !== auth.user.email.toLowerCase()) {
      return fail(res, 422, "email_change_not_supported", "Troca de email nao suportada; peça ao administrador.");
    }
    if (password !== undefined) {
      if (String(password).length < MIN_PASSWORD) {
        return res.status(422).json({
          code: "weak_password", error_code: "weak_password",
          msg: `Password should be at least ${MIN_PASSWORD} characters.`, weak_password: { reasons: ["length"] },
        });
      }
      const hash = await bcrypt.hash(String(password), 10);
      await query(`UPDATE auth.users SET encrypted_password = $2, updated_at = now() WHERE id = $1`, [auth.user.id, hash]);
    }
    if (data && typeof data === "object") {
      await query(
        `UPDATE auth.users SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $1`,
        [auth.user.id, JSON.stringify(data)],
      );
    }
    res.json(toUserJson(await findUserById(auth.user.id)));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = bearer(req);
    let claims = null;
    try {
      claims = token && verifyToken(token);
    } catch {
      /* token vencido: logout local ja basta */
    }
    if (claims?.sub) {
      const scope = req.query.scope || "global";
      if (scope === "local" && claims.session_id) {
        await query(`UPDATE auth.refresh_tokens SET revoked = true, updated_at = now() WHERE session_id = $1`, [claims.session_id]);
      } else if (scope === "others" && claims.session_id) {
        await query(
          `UPDATE auth.refresh_tokens SET revoked = true, updated_at = now() WHERE user_id = $1 AND session_id <> $2`,
          [claims.sub, claims.session_id],
        );
      } else {
        await query(`UPDATE auth.refresh_tokens SET revoked = true, updated_at = now() WHERE user_id = $1`, [claims.sub]);
      }
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------- admin (service_role)

authRouter.get("/admin/users", async (req, res, next) => {
  try {
    if (!requireServiceRole(req, res)) return;
    const perPage = Math.min(Math.max(Number(req.query.per_page) || 50, 1), 1000);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const { rows } = await query(
      `SELECT ${USER_COLUMNS} FROM auth.users WHERE deleted_at IS NULL ORDER BY created_at LIMIT $1 OFFSET $2`,
      [perPage, (page - 1) * perPage],
    );
    const { rows: c } = await query(`SELECT count(*)::int AS n FROM auth.users WHERE deleted_at IS NULL`);
    res.setHeader("x-total-count", String(c[0].n));
    res.json({ users: rows.map(toUserJson), aud: "authenticated" });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/admin/users/:id", async (req, res, next) => {
  try {
    if (!requireServiceRole(req, res)) return;
    const user = await findUserById(req.params.id);
    if (!user) return fail(res, 404, "user_not_found", "User not found");
    res.json(toUserJson(user));
  } catch (err) {
    next(err);
  }
});

authRouter.delete("/admin/users/:id", async (req, res, next) => {
  try {
    if (!requireServiceRole(req, res)) return;
    await query(`DELETE FROM auth.users WHERE id = $1`, [req.params.id]);
    res.json({});
  } catch (err) {
    next(err);
  }
});

authRouter.use((err, _req, res, _next) => {
  console.error("[auth] erro:", err);
  fail(res, 500, "unexpected_failure", "Erro interno no servico de login");
});
