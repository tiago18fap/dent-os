# Migração do DentOS: Supabase → Postgres próprio

## Como ficou

O DentOS deixa de depender do Supabase, mas a API nova responde **nos mesmos caminhos**.
Por isso o frontend continua usando o `supabase-js`; só muda o endereço.

| Caminho | Antes (Supabase) | Agora (EasyPanel `dentos`) |
|---|---|---|
| `/rest/v1/*` | PostgREST do Supabase | serviço `rest` (PostgREST v12, mesmo motor) |
| `/auth/v1/*` | GoTrue | `server/auth/gotrue.js` (login, cadastro, refresh, troca de senha) |
| `/functions/v1/*` | Edge Functions (Deno) | `server/functions/runtime.js` roda os **mesmos arquivos** de `supabase/functions` no Node |
| pg_cron + pg_net | 4 agendamentos no banco | `server/jobs/scheduler.js` (mesmos horários, em UTC) |
| Banco | Postgres do Supabase | serviço `db` (Postgres próprio), com as mesmas tabelas, RLS, funções e triggers |

- As regras de acesso por clínica (RLS) continuam no banco. O PostgREST troca para o papel
  `authenticated`/`anon`/`service_role` conforme o token, igual ao Supabase.
- As senhas são migradas com o **mesmo hash bcrypt**, então ninguém precisa trocar a senha.
  Como o segredo dos tokens é novo, cada usuário faz login uma vez depois da virada.
- O cadastro confirma o e-mail automaticamente (não há servidor de e-mail).

## Serviços no EasyPanel (projeto `dentos`)

| Serviço | Origem | Variáveis |
|---|---|---|
| `db` | Postgres 17 (mesma versão principal do Supabase, ver passo 1) | `POSTGRES_PASSWORD` |
| `api` | este repo, `server/Dockerfile` (contexto: raiz) | ver abaixo |
| `rest` | imagem `postgrest/postgrest:v12.2.3` | `PGRST_DB_URI=postgres://authenticator:<AUTHENTICATOR_PASSWORD>@dentos_db:5432/postgres`, `PGRST_DB_SCHEMAS=public`, `PGRST_DB_ANON_ROLE=anon`, `PGRST_JWT_SECRET=<JWT_SECRET>`, `PGRST_DB_MAX_ROWS=1000`, `PGRST_DB_CHANNEL_ENABLED=true`, `PGRST_OPENAPI_MODE=disabled` |
| `app` (frontend) | `Dockerfile` da raiz | build args `VITE_SUPABASE_URL=` (vazio) e `VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>`; env `API_UPSTREAM=dentos_api:3001` |
| `easydental-worker` | já existe | `SUPABASE_URL=http://dentos_api:3001`, `SUPABASE_KEY=<SERVICE_ROLE_KEY>` |

Variáveis do serviço `api`:

```
DATABASE_URL=postgres://postgres:<DB_PASSWORD>@dentos_db:5432/postgres
JWT_SECRET=...                 # gerado por server/scripts/gerar-chaves.mjs
AUTHENTICATOR_PASSWORD=...
PUBLIC_URL=https://dentos.com.br
REST_INTERNAL_URL=http://dentos_rest:3000
CRON_ENABLED=true              # só em produção, depois da carga final
APP_VERSION=<versão do package.json>
EVOLUTION_API_URL / EVOLUTION_API_KEY   # obrigatórias: só o servidor fala com a Evolution
MERCADOPAGO_ACCESS_TOKEN / MERCADOPAGO_PUBLIC_KEY
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_BRONZE / STRIPE_PRICE_PRATA
EASYDENTAL_WORKER_URL / EASYDENTAL_WORKER_SECRET
```

Gere os segredos com:

```bash
node server/scripts/gerar-chaves.mjs
```

> Os nomes internos (`dentos_db`, `dentos_api`, `dentos_rest`) seguem o padrão `<projeto>_<serviço>`
> do EasyPanel. Confira na aba do serviço antes de colar.

## O que a exportação de 20/11/2026 mostrou sobre a produção

- Projeto **Dentalarta** (`dzbeorfkualalocrvobe`), conta tiago18fap@gmail.com, Postgres 17.6, instância Nano, status "Unhealthy".
- Conferência local: **27/27 tabelas iguais** (9 usuários com o mesmo hash de senha, 1.930 clientes, 2.288 procedimentos).
- O Supabase **não tem segredos próprios** (só os `SUPABASE_*` padrão): as funções usam os valores que já estão no código.
- Funções publicadas = código do repositório (sem diferença), com duas exceções:
  - `whatsapp-webhook` tinha `cleanRedirectNumber` declarado duas vezes (erro de sintaxe). Em produção ele não roda desde 01/06/2026. Corrigido aqui.
  - `processar-disparos-massa` (só publicada, 5 linhas soltas, sem `serve()`) era chamada a cada minuto e falhava sempre. Não foi migrada; a cópia está em `migracao-dados/funcoes-publicadas/`.
- Crons ativos em produção que valem a pena: `processar-fila` (*/2), `gerar-fila-diaria` (10:00 UTC), `easydental-daily-sync` (09:00 UTC, chama o worker `/sync`) e `reset-mensal-saldo-carteira` (dia 1). Todos estão em `server/jobs/scheduler.js`.
- O trigger `on_auth_user_created` (cadastro → `handle_new_user`) fica no schema `auth` e é recriado pelo script de migração.
- `verify_jwt` de cada função espelha produção em `supabase/config.toml`.

## Como exportar sem a senha do banco

```bash
npx supabase@latest login               # uma vez; autoriza no navegador da conta dona do projeto
CONFIRMAR_RECARGA=sim SUPABASE_CLI_REF=dzbeorfkualalocrvobe SUPABASE_ROLE=postgres \
  TARGET_DB_URL=postgres://postgres:<DB_PASSWORD>@<host>:<porta>/postgres \
  bash server/scripts/migrar-do-supabase.sh
```

O script pede ao Supabase CLI uma credencial temporária (expira em ~1 minuto) antes de cada uma das
duas conexões que faz.

## Roteiro da virada

1. **Backup e teste local** (não mexe em produção):
   coloque a URI do banco do Supabase em `.env.migracao`, suba a pilha local
   (`docker compose --env-file migracao-dados/stack.env up -d --build`) e rode
   `bash server/scripts/migrar-do-supabase.sh` apontando `TARGET_DB_URL` para o banco local.
   O relatório `conferencia.txt` precisa sair com todas as tabelas `OK`.
2. **QA local** em `http://localhost:18080`: login com usuário real, painel, clientes,
   procedimentos, campanhas, fila, configurações, checkout em modo teste.
3. **Criar `db`, `rest` e `api` no EasyPanel** (com `CRON_ENABLED=false`) e conferir `GET /api/health`.
4. **Janela de virada** (avisar as clínicas):
   1. no Supabase, desligar os crons: `select cron.unschedule(jobname) from cron.job;`
   2. rodar `migrar-do-supabase.sh` contra o `db` de produção (carga final) e conferir o relatório;
   3. publicar o frontend novo e o worker com as variáveis novas;
   4. `CRON_ENABLED=true` na `api`;
   5. trocar os webhooks para `https://dentos.com.br/functions/v1/...`:
      Mercado Pago (`mercadopago-webhook`), Stripe (`stripe-webhook`) e, em cada instância da
      Evolution, o webhook `whatsapp-webhook` (a tela de Configurações já usa o endereço novo
      ao reconfigurar).
5. **Trocar a chave da Evolution** (só com o ok do dono; fazer logo depois da virada):
   a chave GLOBAL antiga ficou exposta no site (estava escrita em `src/services/evolutionApi.ts`
   e ainda está no histórico do git). Agora o site fala com a Evolution só pela função
   `evolution-whatsapp` do servidor, então a chave pode ser trocada sem mexer no frontend.
   1. **Antes** de publicar esta versão da `api`, cadastrar no serviço `api` do EasyPanel:
      `EVOLUTION_API_URL=https://evolution-evolution-api.qfjowr.easypanel.host` e
      `EVOLUTION_API_KEY=<chave atual>`. Sem elas o WhatsApp para (as funções não têm mais
      chave escrita no código: `evolution-whatsapp`, `processar-fila`, `whatsapp-webhook`,
      `diagnostico-envios`).
   2. Publicar `api` e frontend; conferir em Configurações que o status do WhatsApp aparece.
   3. Conferir no site publicado que a chave sumiu: abrir o `.js` principal e procurar a chave
      antiga (não pode aparecer).
   4. No projeto `evolution` do EasyPanel, gerar uma chave nova e trocar
      `AUTHENTICATION_API_KEY` no serviço da Evolution; reiniciar.
   5. Colocar a chave nova em `EVOLUTION_API_KEY` do serviço `api` do DentOS e reiniciar.
   6. **Outros projetos que usam a mesma Evolution** (o servidor é compartilhado) também usam
      a chave global antiga: atualizar cada um no mesmo momento, senão eles param.
   7. Testar: status em Configurações, "Enviar mensagem de teste" e uma resposta de paciente
      chegando no `whatsapp-webhook`.
6. **Plano de volta**: o Supabase fica intacto por 30 dias. Para voltar, publique o commit
   anterior do frontend e religue os crons no Supabase.

## Teste rápido da API

```bash
cd server && API_URL=http://127.0.0.1:18080 ANON_KEY=... npm run smoke
```

O teste usa a tabela `public._smoke` (criar antes, com RLS por `auth.uid()`) e usuários `*@teste.local`.
