// Configuracao central da API. Tudo vem de variaveis de ambiente (EasyPanel).
// Nenhum segredo tem valor padrao: se faltar, a API nao sobe e diz o que falta.

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return v.trim();
}

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: required("DATABASE_URL"),
  // Mesmo segredo usado pelo PostgREST (PGRST_JWT_SECRET). Minimo 32 caracteres.
  jwtSecret: required("JWT_SECRET"),
  // Senha do papel `authenticator` (usado pelo PostgREST para conectar).
  authenticatorPassword: required("AUTHENTICATOR_PASSWORD"),
  // URL publica do site (ex.: https://dentos.com.br). As funcoes usam como SUPABASE_URL.
  publicUrl: (process.env.PUBLIC_URL || "http://localhost:18080").replace(/\/$/, ""),
  // URL interna do PostgREST, usada pelas funcoes e jobs dentro da rede docker.
  restUrl: (process.env.REST_INTERNAL_URL || "http://rest:3000").replace(/\/$/, ""),
  accessTokenTtl: Number(process.env.JWT_EXPIRY_SECONDS || 3600),
  // Cadastro (signUp) liberado, como no Supabase do DentOS (confirmacao automatica).
  disableSignup: process.env.DISABLE_SIGNUP === "true",
  // Liga os agendamentos (processar fila, gerar fila diaria, Easy Dental).
  // Fica DESLIGADO por padrao para que uma copia local nunca dispare WhatsApp real.
  cronEnabled: process.env.CRON_ENABLED === "true",
};

if (config.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET precisa ter pelo menos 32 caracteres");
}
