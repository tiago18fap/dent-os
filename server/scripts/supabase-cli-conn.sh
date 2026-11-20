#!/usr/bin/env bash
# Gera .env.migracao com uma credencial TEMPORARIA do Supabase CLI (papel cli_login_postgres),
# sem precisar da senha do banco. Requer `npx supabase login` feito antes.
# A credencial expira em poucos minutos: rode logo antes do migrar-do-supabase.sh.
#   bash server/scripts/supabase-cli-conn.sh [project_ref]
set -euo pipefail
REF="${1:-dzbeorfkualalocrvobe}"
mkdir -p migracao-dados; DRYRUN_FILE="migracao-dados/.dryrun.$$"
trap 'rm -f "$DRYRUN_FILE"' EXIT
npx -y supabase@latest db dump --remote="$REF" --dry-run > "$DRYRUN_FILE" 2>/dev/null || true  # o dry-run sai com codigo != 0 mesmo dando certo
node -e '
const fs = require("fs");
const t = fs.readFileSync(process.argv[1], "utf8");
const g = (k) => (t.match(new RegExp("export " + k + "=\"([^\"]*)\"")) || [])[1];
if (!g("PGPASSWORD")) { console.error("Nao achei a credencial no dry-run do CLI (fez o supabase login?)"); process.exit(1); }
const url = `postgresql://${encodeURIComponent(g("PGUSER"))}:${encodeURIComponent(g("PGPASSWORD"))}@${g("PGHOST")}:${g("PGPORT")}/${g("PGDATABASE")}`;
fs.writeFileSync(".env.migracao", "# Gerado pelo Supabase CLI (papel temporario). Nao vai para o git.\nSUPABASE_DB_URL=" + url + "\nSUPABASE_ROLE=postgres\n");
console.log("credencial temporaria gravada em .env.migracao (host " + g("PGHOST") + ")");
' "$DRYRUN_FILE"
