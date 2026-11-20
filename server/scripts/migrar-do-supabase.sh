#!/usr/bin/env bash
# =====================================================================
# Migra o banco do DentOS do Supabase para o Postgres proprio.
#
#   SUPABASE_DB_URL  URI do banco do Supabase (so LEITURA aqui)
#   TARGET_DB_URL    URI do Postgres novo (superusuario postgres)
#   PG_IMAGE         imagem com pg_dump/psql da mesma versao do Supabase (padrao postgres:17-alpine)
#
# Passos:
#   1. backup completo (schemas public + auth) em migracao-dados/backup-<data>/  (nunca apagado)
#   2. restaura o schema public (tabelas, RLS, funcoes, triggers, grants)
#   3. copia auth.users/auth.identities com o MESMO hash de senha
#   4. copia os dados do public com triggers desligados (sem efeitos colaterais)
#   5. relatorio: contagem por tabela Supabase x Postgres novo
#
# Rodar a partir da raiz do repositorio:
#   set -a; . ./.env.migracao; set +a
#   TARGET_DB_URL=postgres://postgres:SENHA@host.docker.internal:55433/postgres \
#     bash server/scripts/migrar-do-supabase.sh
#
# Pode rodar de novo (carga final na virada): o destino e recriado do zero
# (schema public e auth.users), por isso ele pede confirmacao se ja houver dados.
# =====================================================================
set -euo pipefail
export MSYS_NO_PATHCONV=1

# Com o Supabase CLI (sem senha do banco): SUPABASE_CLI_REF=<ref> gera uma credencial
# temporaria nova antes de cada conexao (ela expira em ~1 minuto).
SUPABASE_CLI_REF="${SUPABASE_CLI_REF:-}"
refresh_src() {
  if [ -n "$SUPABASE_CLI_REF" ]; then
    bash "$(dirname "$0")/supabase-cli-conn.sh" "$SUPABASE_CLI_REF" >/dev/null
    set -a; . ./.env.migracao; set +a
  fi
}
refresh_src
: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL (veja .env.migracao.example) ou SUPABASE_CLI_REF}"
: "${TARGET_DB_URL:?defina TARGET_DB_URL}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
# Papel do Supabase CLI (cli_login_postgres) precisa trocar para "postgres" para ler auth.*.
SUPABASE_ROLE="${SUPABASE_ROLE:-}"
ROLE_ARGS=(); SET_ROLE=()
if [ -n "$SUPABASE_ROLE" ]; then ROLE_ARGS=(--role "$SUPABASE_ROLE"); SET_ROLE=(-c "set role $SUPABASE_ROLE"); fi
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="migracao-dados/backup-${STAMP}"
mkdir -p "$OUT"
ABS_OUT="$(cd "$OUT" && pwd -W 2>/dev/null || pwd)"

pg() { docker run --rm -i -v "${ABS_OUT}:/out" "$PG_IMAGE" "$@"; }
dst_sql() { pg psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 -At "$@"; }

echo "== Destino: $(dst_sql -c 'select version()' | cut -c1-60)"

# O destino precisa ter passado pelo bootstrap da API (papeis + schema auth).
if [ "$(dst_sql -c "select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')")" != "4" ]; then
  echo "ERRO: o destino ainda nao tem os papeis do bootstrap. Suba a API apontando para ele primeiro." >&2
  exit 1
fi

EXISTENTES="$(dst_sql -c "select count(*) from auth.users")"
if [ "$EXISTENTES" != "0" ] && [ "${CONFIRMAR_RECARGA:-}" != "sim" ]; then
  echo "ERRO: o destino ja tem $EXISTENTES usuarios. Para recarregar do zero rode com CONFIRMAR_RECARGA=sim." >&2
  exit 1
fi

# So DUAS conexoes com o Supabase: um pg_dump completo e uma sessao psql.
echo "== 1/5 Backup completo do Supabase em $OUT"
refresh_src
pg pg_dump "$SUPABASE_DB_URL" "${ROLE_ARGS[@]}" --schema=public --schema=auth --no-owner -Fc -f /out/supabase-completo.dump
echo "   backup: $(du -h "$OUT/supabase-completo.dump" | cut -f1)"
# Schema e dados do public saem do proprio arquivo de backup (sem nova conexao).
pg pg_restore --schema-only -n public --no-owner -f /out/public-schema.sql /out/supabase-completo.dump
pg pg_restore --data-only -n public --no-owner -f /out/public-dados.sql /out/supabase-completo.dump

# auth.users / identities: so as colunas que existem dos dois lados.
AUTH_COLS="instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_sent_at, recovery_sent_at, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, banned_until, deleted_at, is_sso_user, is_anonymous"
CONTAGEM_SQL="select n.nspname || '.' || c.relname || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r','p') and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname in ('users','identities'))) order by 1"
refresh_src
pg psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -At "${SET_ROLE[@]}"   -c "\copy (select ${AUTH_COLS} from auth.users) to '/out/auth-users.csv' with (format csv, header)"   -c "\copy (select provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id from auth.identities) to '/out/auth-identities.csv' with (format csv, header)"   -c "\o /out/contagens-supabase.txt" -c "$CONTAGEM_SQL"   -c "\o /out/auth-triggers.sql" -c "set search_path = ''" -c "select pg_get_triggerdef(t.oid) || ';' from pg_trigger t where not t.tgisinternal and t.tgrelid in ('auth.users'::regclass, 'auth.identities'::regclass)" -c "reset search_path"   -c "\o /out/cron-jobs.txt" -c "select jobname || ' | ' || schedule || ' | ' || active || ' | ' || command from cron.job order by jobname"
echo "   usuarios exportados: $(($(wc -l < "$OUT/auth-users.csv") - 1))"

echo "== 2/5 Recriando o schema public no destino"
dst_sql -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON SCHEMA public TO postgres;" >/dev/null
dst_sql -c "DELETE FROM auth.identities; DELETE FROM auth.refresh_tokens; DELETE FROM auth.users;" >/dev/null
# Sem ON_ERROR_STOP: GRANTs para papeis internos do Supabase que nao existem aqui sao ignorados.
pg psql "$TARGET_DB_URL" -X -q -f /out/public-schema.sql > "$OUT/restore-schema.log" 2>&1 || true
grep -E "ERROR" "$OUT/restore-schema.log" | grep -vE 'role "[a-z_]+" does not exist|schema "public" already exists' > "$OUT/restore-schema-erros.txt" || true
echo "   erros relevantes no schema: $(wc -l < "$OUT/restore-schema-erros.txt") (detalhes em restore-schema-erros.txt)"
dst_sql -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;" >/dev/null

echo "== 3/5 Usuarios (mesmo hash de senha) e 4/5 dados, com triggers desligados"
{
  echo "SET session_replication_role = replica;"
  echo "\\copy auth.users (${AUTH_COLS}) from '/out/auth-users.csv' with (format csv, header)"
  echo "\\copy auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) from '/out/auth-identities.csv' with (format csv, header)"
  echo "\\i /out/public-dados.sql"
  echo "SET session_replication_role = origin;"
  # Triggers do schema auth (ex.: on_auth_user_created -> public.handle_new_user) nao vem
  # no dump do public; recriados aqui DEPOIS da carga para nao disparar com os dados antigos.
  echo "\i /out/auth-triggers-recriar.sql"
  echo "NOTIFY pgrst, 'reload schema';"
} > "$OUT/carga.psql"
# Para cada "CREATE TRIGGER nome ... ON tabela ...": DROP antes, para a recarga ser idempotente.
sed -nE 's/^CREATE TRIGGER ([^ ]+) .* ON ([^ ]+) .*$/DROP TRIGGER IF EXISTS \1 ON \2;/p' "$OUT/auth-triggers.sql" > "$OUT/auth-triggers-recriar.sql"
grep '^CREATE TRIGGER' "$OUT/auth-triggers.sql" >> "$OUT/auth-triggers-recriar.sql" || true
echo "   triggers do auth: $(grep -c '^CREATE TRIGGER' "$OUT/auth-triggers-recriar.sql")"
pg psql "$TARGET_DB_URL" -X -q -v ON_ERROR_STOP=1 -f /out/carga.psql > "$OUT/carga.log" 2>&1 || {
  echo "ERRO na carga de dados. Veja $OUT/carga.log" >&2
  tail -20 "$OUT/carga.log" >&2
  exit 1
}

echo "== 5/5 Conferencia (Supabase no momento da exportacao x novo)"
RELATORIO="$OUT/conferencia.txt"
dst_sql -c "$CONTAGEM_SQL" > "$OUT/contagens-novo.txt"
printf "%-42s %10s %10s  %s
" "tabela" "supabase" "novo" "ok" | tee "$RELATORIO"
FALHAS=0
while IFS='|' read -r t a; do
  b="$(grep -E "^${t//./\.}\|" "$OUT/contagens-novo.txt" | cut -d'|' -f2)"
  ok="OK"; [ "$a" = "$b" ] || { ok="DIFERENTE"; FALHAS=$((FALHAS + 1)); }
  printf "%-42s %10s %10s  %s
" "$t" "$a" "${b:-faltando}" "$ok" | tee -a "$RELATORIO"
done < "$OUT/contagens-supabase.txt"
echo
if [ "$FALHAS" = "0" ]; then echo "TUDO BATEU. Backup e relatorio em $OUT"; else echo "ATENCAO: $FALHAS tabela(s) diferentes. Veja $RELATORIO"; exit 2; fi
