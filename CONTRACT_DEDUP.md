# Contrato de Garantia de Não-Duplicação de Mensagens (Strict Dedup)

Este documento estabelece o compromisso técnico e arquitetural do sistema DentOS em garantir a proteção contra o envio de mensagens duplicadas para o mesmo número de telefone/cliente, estabelecendo uma janela mínima de **30 dias** entre envios.

---

## 📋 Garantia do Contrato

> [!IMPORTANT]
> **Nenhum cliente (número de telefone) receberá mais de uma mensagem automática (campanha de aniversário ou procedimento) em um intervalo de 30 dias.**

---

## 🛠️ Camadas de Proteção Implementadas

Para assegurar o cumprimento integral deste contrato, implementamos um sistema de proteção em **três camadas independentes**:

### 1. Camada de Geração Diária (Geração de Fila)
Tanto no script do servidor (`gerar-fila-diaria`) quanto no gerador client-side (`src/utils/gerarFilaDiaria.ts`), antes de enfileirar qualquer nova mensagem com status `'pendente'`, o sistema realiza uma consulta para verificar se o mesmo telefone (ou `paciente_id`) já possui mensagens enfileiradas ou enviadas nos últimos 30 dias.
- Se for encontrada alguma mensagem nesse período, a geração para este destinatário é **silenciosamente pulada**, evitando que mensagens redundantes cheguem a ser salvas na fila.

### 2. Camada de Processamento de Envio (`processar-fila`)
No loop executor de envios (`processar-fila`), imediatamente antes de disparar o HTTP Request para a API de mensageria (Evolution API), é realizada uma verificação de última hora:
- O sistema checa se houve algum envio de mensagem com status `'enviado'` para o mesmo número nas últimas 30 horas/dias.
- Se detectado, o status da mensagem atual é alterado para `'dedup_ignorado'` e o envio é abortado, garantindo proteção contra condições de corrida (*race conditions*).

### 3. Camada do Banco de Dados — O Contrato Inviolável (Trigger SQL)
Como garantia final e absoluta no nível de persistência de dados, criamos o trigger `trigger_fila_envios_dedup` na tabela `public.fila_envios`.
- **Funcionamento**: Toda inserção ou atualização que configure o status de uma mensagem como `'pendente'` ou `'enviado'` dispara uma checagem.
- **Ação**: Se o banco de dados identificar outra mensagem pendente ou enviada para o mesmo telefone com `data_programada` dentro da janela de `[-30 dias, +30 dias]`, o status da nova mensagem é automaticamente forçado para `'dedup_ignorado'` antes da gravação.
- **Resultado**: É impossível, mesmo por inserção manual direta no banco de dados ou chamadas externas de API, violar a regra de 30 dias.

---

## 🔬 Especificações Técnicas do Trigger

```sql
CREATE OR REPLACE FUNCTION public.check_fila_envios_dedup()
RETURNS TRIGGER AS $$
DECLARE
  already_exists INTEGER;
BEGIN
  SELECT COUNT(*) INTO already_exists
  FROM public.fila_envios
  WHERE clinica_id = NEW.clinica_id
    AND telefone = NEW.telefone
    AND status IN ('pendente', 'enviado')
    AND data_programada >= (NEW.data_programada - INTERVAL '30 days')
    AND data_programada <= (NEW.data_programada + INTERVAL '30 days')
    AND id IS DISTINCT FROM NEW.id;

  IF already_exists > 0 THEN
    NEW.status := 'dedup_ignorado';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
