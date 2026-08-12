# Plano: Edição de SAC por Vendas e Notificação de Edição

Implementar a permissão para o cargo "Vendas" editar o campo de Nota Fiscal em solicitações SAC, registrando logs automáticos e enviando notificações por e-mail para a gerência.

## Alterações Técnicas

### 1. Banco de Dados (Supabase)
- Criar migração para permitir que usuários com role `vendas` atualizem apenas o campo `order_number` da tabela `sac_requests`.
- Atualizar a política de RLS `Staff can update SAC requests` para incluir o cargo `vendas` especificamente para atualizações.

### 2. Frontend (React)
- Modificar `src/pages/AdminDashboard.tsx`:
    - Ajustar a lógica da variável `readOnly` para permitir edição se o usuário for `vendas`.
    - Garantir que apenas o campo de Nota Fiscal seja editável para este cargo.
    - Criar uma função específica de notificação para edições, similar à de tickets internos.

### 3. Backend (Edge Functions)
- Criar uma nova Edge Function `notify-sac-edit`:
    - Receber os dados da edição (quem editou, protocolo, empresa, data/hora).
    - Enviar e-mail formatado para `gerente@digitaletextil.com.br` e `renato@digitaletextil.com.br` (conforme as configurações de e-mail existentes).

## Detalhes de Segurança e Auditoria
- As edições feitas por `vendas` gerarão automaticamente um ticket interno de log na solicitação, mantendo o histórico de quem alterou o quê.
- A notificação por e-mail servirá como camada extra de monitoramento para a gerência.

---
**Padrão Utilizado:** RBAC Granular & Audit Logging
