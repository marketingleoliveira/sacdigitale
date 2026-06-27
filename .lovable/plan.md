## Objetivo
Implementar sincronização IMAP da Locaweb para receber respostas dos clientes no e-mail `qualidade@digitaletextil.com.br` e vinculá-las automaticamente à solicitação SAC correspondente via protocolo no assunto.

## Observação de segurança importante
A senha foi enviada em texto puro no chat. Recomendo **trocá-la na Locaweb** após o setup e cadastrar a nova via formulário seguro. Por ora, vou salvar os 4 valores como secrets do backend (nunca ficam no código nem no .env do frontend).

Também notei um provável erro de digitação: `imap_digitaletextil.com.br` provavelmente é `imap.digitaletextil.com.br` (ponto, não underline). Vou confirmar isso antes de salvar.

## Etapas

### 1. Salvar credenciais como secrets
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD` via `add_secret` (formulário seguro).

### 2. Edge Function `imap-poll-inbox`
- Conecta via IMAP TLS (porta 993) usando lib Deno (`jsr:@workingdevshero/deno-imap` ou similar).
- Lista mensagens UNSEEN na INBOX.
- Para cada mensagem:
  - Extrai assunto, remetente, corpo (text/plain preferencial; fallback HTML → texto).
  - Faz regex `/SAC\d{8}-[A-Z0-9]+/i` no assunto.
  - Se encontrar protocolo válido → busca `sac_requests` por `protocol`.
  - Insere em `email_communications` com `direction='inbound'`, `status='received'`, `raw_payload` com headers básicos.
  - Marca mensagem como `\Seen` no IMAP para não reprocessar.
- Retorna contagem de processadas/vinculadas/ignoradas.
- `verify_jwt = false` (será chamada por cron) com proteção via header secret `CRON_SECRET`.

### 3. Agendamento automático (pg_cron)
- Job rodando a cada 2 minutos chamando a edge function via `net.http_post` com o `CRON_SECRET`.
- Habilita extensions `pg_cron` e `pg_net` se ainda não estiverem.

### 4. Botão manual de sincronização
- Na aba **Comunicação Externa** de cada solicitação, adicionar botão "Sincronizar agora" (visível para staff) que invoca a função sob demanda — útil para testes e quando o cliente acaba de responder.

### 5. Limpeza
- Remover/desativar a função `resend-inbound-webhook` (não será mais usada, já que MX continua na Locaweb).

## Proteção do protocolo no assunto
Já está implementada no envio (`send-customer-email` força `[SACxxxx]` no subject). Para garantir que respostas mantenham o token: o cliente normalmente responde com `Re: [SACxxxx] ...`, e o regex captura mesmo se ele alterar o texto ao redor. Se o cliente apagar o protocolo, a mensagem entra em `email_communications` sem vínculo? **Decisão necessária:** ignorar silenciosamente OU registrar em uma fila de "não vinculados" para revisão manual.

## Perguntas antes de implementar
1. O host correto é `imap.digitaletextil.com.br` (com ponto)?
2. E-mails sem protocolo no assunto: **ignorar** ou **registrar em fila de não-vinculados** para revisão manual no painel?
3. Frequência do polling: **2 min** (responsivo, ~720 execuções/dia) ou **5 min** (mais econômico)?
