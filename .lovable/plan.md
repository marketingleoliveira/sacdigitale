# Plano de Implementação: Atualizações de Mensagens no SAC

Bloquear a edição da mensagem original do SAC e permitir a adição de atualizações em um campo separado, mantendo o histórico de mensagens abaixo da original.

## Alterações de Backend

### Banco de Dados (Supabase)
- Criar tabela `sac_updates` para armazenar as atualizações adicionais.
  - `id`: UUID (PK)
  - `sac_request_id`: UUID (FK para `sac_requests`, CASCADE)
  - `message`: TEXT (Conteúdo da atualização)
  - `created_by`: UUID (FK para `auth.users`)
  - `author_email`: TEXT (Email do autor para exibição rápida)
  - `created_at`: TIMESTAMPTZ
- Habilitar RLS e criar políticas:
  - `SELECT`: Usuários autenticados (conforme cargo)
  - `INSERT`: Usuários autenticados (com permissão de edição)
- Conceder permissões (`GRANT`) para as roles necessárias.

## Alterações de Frontend

### AdminDashboard.tsx
- Modificar o modal de detalhes do SAC (`Dialog`).
- Transformar o campo de "Mensagem" original em apenas leitura (`readOnly`).
- Adicionar uma nova seção "Atualizações da Solicitação" abaixo da mensagem original.
- Implementar lista de atualizações existentes (buscadas da nova tabela).
- Adicionar um novo campo de texto (`Textarea`) chamado "Adicionar atualizações".
- Criar função `addSacUpdate` para salvar novas mensagens na tabela `sac_updates`.
- Atualizar a lógica de notificação para incluir o conteúdo das novas atualizações no email para gerência.

### EditLogs.tsx (Opcional)
- Garantir que adições de atualizações também sejam registradas nos logs de edição para auditoria completa.

## Detalhes Técnicos
- Utilizar TanStack Query para gerenciar o estado das atualizações e garantir re-fetch automático após inserção.
- Manter o estilo visual atual (shadcn/ui, Tailwind).
- Idioma: Português (Brasil).
