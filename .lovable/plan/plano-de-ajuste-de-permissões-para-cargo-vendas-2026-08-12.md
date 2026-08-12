# Plano de Ajuste de Permissões para Cargo Vendas

Este plano detalha as alterações necessárias para ajustar as permissões do cargo **Vendas** no sistema SAC, conforme as novas diretrizes de segurança e operacionalidade.

## Alterações de Regras de Negócio
- **Vendas NÃO pode editar:** Nota Fiscal, Nome da Empresa, E-mail ou Telefone.
- **Vendas PODE editar:** Tipo de Reclamação, Mensagem Enviada e Anexos (incluindo Laudos).
- **Vendas NÃO pode:** Alterar Status, Alterar Procedência ou Comentar em Tickets Internos.
- **Auditoria:** Toda edição realizada por Vendas deve gerar um log interno e notificar a gerência via e-mail.

## Detalhes Técnicos

### 1. Frontend (`src/pages/AdminDashboard.tsx`)
- Ajustar lógica de `readOnly` e permissões específicas.
- Criar funções para atualizar a Mensagem (`message`) e garantir que o Tipo de Reclamação (`complaint_type`) esteja aberto para edição pelo Vendedor.
- Bloquear campos de contato e identificação para o cargo Vendas.
- Integrar gatilhos de notificação (`notify-sac-edit`) para as novas edições permitidas.

### 2. Tickets Internos (`src/components/admin/TicketSystem.tsx`)
- Impedir que usuários com cargo **Vendas** enviem mensagens ou vejam o campo de entrada em tickets internos.

### 3. Anexos e Laudos (`src/components/admin/LaudosUpload.tsx`)
- Garantir que o componente de upload esteja funcional para Vendas, mesmo quando o restante do dashboard estiver em modo de visualização restrita para esse cargo.

### 4. Notificações (`supabase/functions/notify-sac-edit/index.ts`)
- Atualizar a Edge Function para suportar múltiplos tipos de alteração (não apenas Nota Fiscal) e descrever corretamente o que foi alterado no corpo do e-mail enviado à gerência.

### 5. Banco de Dados (Migração SQL)
- Ajustar políticas de RLS para permitir que o cargo `vendas` atualize os campos `message` e `complaint_type` na tabela `sac_requests`.

---

### 📊 Relatório de Execução (Prévia)

**Padrão utilizado:** Feature Update / RBAC Adjustment

**Sub-agentes ativados:**
- 🎨 **UI Architect** — Ajustes de visibilidade e bloqueio de inputs.
- 🗄️ **Supabase Engineer** — Atualização de políticas RLS.
- 🔌 **API Integrator** — Melhoria na Edge Function de notificação.
