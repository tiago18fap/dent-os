# WhatsApp oficial (Meta) via Zernio — com coexistência

A clínica continua usando o **mesmo número no celular e no WhatsApp Web**, e o DentOS envia os
lembretes e campanhas pela **API oficial da Meta**, por meio da Zernio. A Evolution continua
disponível: o provedor é escolhido **por clínica**.

## Como funciona

| Parte | Onde |
|---|---|
| Provedor por clínica (`evolution` ou `zernio`), conta da Zernio | `whatsapp_config.provider`, `zernio_account_id`, `zernio_numero` |
| Modelos aprovados pela Meta (um por campanha) | tabela `whatsapp_modelos` |
| Envio da fila | `supabase/functions/processar-fila` — clínicas na Zernio enviam **modelo aprovado**; as variáveis (`{nome}`, `{procedimento}`…) são tiradas da mensagem montada na fila |
| Respostas, lido, falha, modelo aprovado/reprovado, desconexão, opt-out (LGPD) | `supabase/functions/zernio-webhook` |
| Tela (Configurações → WhatsApp) | `src/components/configuracoes/WhatsappOficialZernio.tsx` + função `zernio-whatsapp` |
| Regras de modelo / cliente da API / opt-out | `supabase/functions/_shared/` |
| Colunas e tabelas novas | `server/db/app-migrations.sql` (aplicado sozinho no boot da API) |

Regras importantes:
- Enquanto o modelo de uma campanha **não estiver aprovado**, as mensagens dela ficam **pendentes**
  na fila (não gastam saldo nem viram falha). O motivo aparece em `fila_envios.erro_detalhe`.
- Se o texto da campanha for **editado**, o modelo aparece como "Texto mudou: reenviar". As mensagens
  já na fila com o texto antigo falham com aviso claro.
- **Disparo geral** pela Zernio só sai com o mesmo texto do modelo "Disparo geral" aprovado.
- **Utilidade** (lembrete de consulta/retorno do tratamento) custa ≈ R$ 0,035; **Marketing** ≈ R$ 0,32.
- O redirecionamento automático da Evolution não se aplica: com coexistência a clínica responde no próprio celular.

## Ativar em produção

1. **Variáveis no serviço `api` do EasyPanel**
   ```
   ZERNIO_API_KEY=<chave criada no painel da Zernio>
   ZERNIO_WEBHOOK_SECRET=<texto aleatório longo, o mesmo do passo 2>
   ```
   (Gere o segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)
2. **Webhook na Zernio** (painel → Webhooks):
   - URL: `https://dentos.com.br/functions/v1/zernio-webhook`
   - Secret: o mesmo `ZERNIO_WEBHOOK_SECRET`
   - Eventos: `message.received`, `message.delivered`, `message.read`, `message.failed`,
     `whatsapp.template.status_updated`, `account.disconnected`
3. **Conectar o celular da clínica na Zernio** (coexistência): Connections → WhatsApp → + Connect →
   Use my own number → Continue to WhatsApp setup → na janela da Meta, **"Connect existing WhatsApp
   Business app account"** → ler o QR code no WhatsApp Business. Antes: app atualizado e PIN de duas
   etapas desligado. Cadastrar o cartão no WhatsApp Manager da Meta.
4. **No DentOS** (super admin): Configurações → WhatsApp → **Ver números conectados na Zernio** →
   **Usar este número**.
5. Em cada campanha: escolher **Utilidade** ou **Marketing** → **Enviar para aprovação**. A Meta
   costuma aprovar em minutos (até 24 h). O status chega pelo webhook ou pelo botão **Atualizar status**.

Para voltar: **Voltar para a Evolution** na mesma tela (a conta da Zernio fica guardada).

## Teste local (sem enviar nada de verdade)

```bash
ZERNIO_API_KEY=chave-teste node server/scripts/zernio-mock.mjs
# migracao-dados/stack.env: ZERNIO_API_KEY=chave-teste, ZERNIO_API_URL=http://host.docker.internal:18099/api/v1, ZERNIO_WEBHOOK_SECRET=...
docker compose --env-file migracao-dados/stack.env up -d --build api web
cd server && API_URL=http://127.0.0.1:18080 ANON_KEY=... SERVICE_ROLE_KEY=... ZERNIO_WEBHOOK_SECRET=... node scripts/zernio-e2e-local.mjs
```
O teste cobre: ligar a conta, enviar modelo, fila esperando aprovação, envio com variáveis e
Idempotency-Key, assinatura do webhook, lido, evento repetido, opt-out com confirmação, modelo
reprovado e desconexão.
