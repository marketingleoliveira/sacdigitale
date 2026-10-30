SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;


/* =========================================================
   CONTROLE DE MIGRACOES
   ========================================================= */

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  migration_name VARCHAR(255) NOT NULL,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migration_name (migration_name)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   USUARIOS LOCAIS
   substitui auth.users do Supabase
   ========================================================= */

CREATE TABLE IF NOT EXISTS app_users (
  id CHAR(36) NOT NULL,

  email VARCHAR(320) NOT NULL,

  password_hash VARCHAR(255) NULL,

  email_confirmed_at DATETIME(6) NULL,
  last_sign_in_at DATETIME(6) NULL,

  is_active TINYINT(1) NOT NULL DEFAULT 1,

  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  updated_at DATETIME(6) NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  UNIQUE KEY uq_app_users_email (email),

  KEY idx_app_users_active (is_active)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   SESSOES DE LOGIN
   ========================================================= */

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) NOT NULL,

  user_id CHAR(36) NOT NULL,

  token_hash CHAR(64) NOT NULL,

  expires_at DATETIME(6) NOT NULL,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  revoked_at DATETIME(6) NULL,

  PRIMARY KEY (id),

  UNIQUE KEY uq_auth_session_token (token_hash),

  KEY idx_auth_sessions_user (user_id),
  KEY idx_auth_sessions_expires (expires_at),

  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id)
    REFERENCES app_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   RESET DE SENHA
   ========================================================= */

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id CHAR(36) NOT NULL,

  user_id CHAR(36) NOT NULL,

  token_hash CHAR(64) NOT NULL,

  expires_at DATETIME(6) NOT NULL,

  used_at DATETIME(6) NULL,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  UNIQUE KEY uq_password_reset_token (token_hash),

  KEY idx_password_reset_user (user_id),

  CONSTRAINT fk_password_reset_user
    FOREIGN KEY (user_id)
    REFERENCES app_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   CARGOS / PERMISSOES
   ========================================================= */

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) NOT NULL,

  user_id CHAR(36) NOT NULL,

  role ENUM(
    'admin',
    'user',
    'desenvolvedor',
    'qualidade',
    'gerencia',
    'vendas'
  ) NOT NULL,

  display_name VARCHAR(255) NULL,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  UNIQUE KEY uq_user_role (
    user_id,
    role
  ),

  KEY idx_user_roles_role (role),

  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id)
    REFERENCES app_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   TIPOS DE RECLAMACAO
   ========================================================= */

CREATE TABLE IF NOT EXISTS complaint_types (
  id CHAR(36) NOT NULL,

  name VARCHAR(255) NOT NULL,

  active TINYINT(1)
    NOT NULL
    DEFAULT 1,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  updated_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  UNIQUE KEY uq_complaint_types_name (name),

  KEY idx_complaint_types_active (active)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   SOLICITACOES SAC
   ========================================================= */

CREATE TABLE IF NOT EXISTS sac_requests (
  id CHAR(36) NOT NULL,

  contact_type ENUM(
    'reclamacao',
    'sugestao',
    'elogio',
    'duvida'
  ) NOT NULL,

  complaint_type VARCHAR(255) NULL,

  name VARCHAR(255) NOT NULL,

  email VARCHAR(320) NOT NULL,

  phone VARCHAR(100) NULL,

  order_number VARCHAR(255) NULL,

  subject VARCHAR(500) NULL,

  message LONGTEXT NOT NULL,

  /*
   * Arrays PostgreSQL/Supabase passam
   * a ser JSON no MySQL.
   */
  attachments JSON NULL,

  laudos JSON NULL,

  procedencia VARCHAR(255) NULL,

  protocol VARCHAR(100) NOT NULL,

  status VARCHAR(100)
    NOT NULL
    DEFAULT 'pendente',

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  UNIQUE KEY uq_sac_protocol (protocol),

  KEY idx_sac_email (email),
  KEY idx_sac_protocol (protocol),
  KEY idx_sac_status (status),
  KEY idx_sac_contact_type (contact_type),
  KEY idx_sac_created_at (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   TICKETS INTERNOS
   ========================================================= */

CREATE TABLE IF NOT EXISTS tickets (
  id CHAR(36) NOT NULL,

  sac_request_id CHAR(36) NOT NULL,

  /*
   * Mantidos como UUID textual.
   * Não recebem FK para facilitar
   * importação fiel do Supabase.
   */
  created_by CHAR(36) NOT NULL,

  assigned_to CHAR(36) NULL,

  author_email VARCHAR(320) NULL,

  author_name VARCHAR(255) NULL,

  message LONGTEXT NOT NULL,

  is_internal TINYINT(1)
    NOT NULL
    DEFAULT 1,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  updated_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  KEY idx_tickets_sac (sac_request_id),
  KEY idx_tickets_created (created_at),
  KEY idx_tickets_assigned (assigned_to),

  CONSTRAINT fk_tickets_sac
    FOREIGN KEY (sac_request_id)
    REFERENCES sac_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   COMUNICACOES EXTERNAS POR EMAIL
   ========================================================= */

CREATE TABLE IF NOT EXISTS email_communications (
  id CHAR(36) NOT NULL,

  sac_request_id CHAR(36) NULL,

  direction ENUM(
    'outbound',
    'inbound'
  ) NOT NULL,

  from_email VARCHAR(320) NOT NULL,

  to_email VARCHAR(320) NOT NULL,

  bcc_email VARCHAR(320) NULL,

  subject VARCHAR(1000) NULL,

  body LONGTEXT NOT NULL,

  email_body LONGTEXT NULL,

  resend_id VARCHAR(500) NULL,

  sent_by CHAR(36) NULL,

  sent_by_email VARCHAR(320) NULL,

  status VARCHAR(100)
    NOT NULL
    DEFAULT 'sent',

  error_message LONGTEXT NULL,

  raw_payload JSON NULL,

  attachments JSON NULL,

  read_at DATETIME(6) NULL,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  KEY idx_email_comm_sac (
    sac_request_id,
    created_at
  ),

  KEY idx_email_direction (
    direction
  ),

  KEY idx_email_unread (
    direction,
    read_at
  ),

  KEY idx_email_resend (
    resend_id
  ),

  CONSTRAINT fk_email_communication_sac
    FOREIGN KEY (sac_request_id)
    REFERENCES sac_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   CONFIGURACOES DE EMAIL
   ========================================================= */

CREATE TABLE IF NOT EXISTS email_settings (
  id CHAR(36) NOT NULL,

  bcc_enabled TINYINT(1)
    NOT NULL
    DEFAULT 1,

  bcc_email VARCHAR(320)
    NOT NULL
    DEFAULT 'gerente@digitaletextil.com.br',

  emails_enabled TINYINT(1)
    NOT NULL
    DEFAULT 1,

  self_copy_enabled TINYINT(1)
    NOT NULL
    DEFAULT 1,

  internal_notifications_enabled TINYINT(1)
    NOT NULL
    DEFAULT 0,

  internal_notification_emails TEXT NULL,

  updated_by CHAR(36) NULL,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  updated_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   LOGS DE TICKETS INTERNOS
   ========================================================= */

CREATE TABLE IF NOT EXISTS internal_ticket_logs (
  id CHAR(36) NOT NULL,

  ticket_id CHAR(36) NOT NULL,

  status ENUM(
    'success',
    'failure'
  ) NOT NULL,

  error_message LONGTEXT NULL,

  recipient_email VARCHAR(320) NOT NULL,

  email_body LONGTEXT NULL,

  subject VARCHAR(1000) NULL,

  created_at DATETIME(6)
    NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  KEY idx_internal_ticket_logs_ticket (
    ticket_id
  ),

  KEY idx_internal_ticket_logs_status (
    status
  ),

  CONSTRAINT fk_internal_ticket_logs_ticket
    FOREIGN KEY (ticket_id)
    REFERENCES tickets(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   AUDITORIA DE EDICAO SAC
   ========================================================= */

CREATE TABLE IF NOT EXISTS sac_edit_logs (
  id CHAR(36) NOT NULL,

  sac_request_id CHAR(36) NULL,

  edited_by CHAR(36) NULL,

  edited_by_email VARCHAR(320) NULL,

  field_edited VARCHAR(255)
    NULL
    DEFAULT 'order_number',

  old_value LONGTEXT NULL,

  new_value LONGTEXT NULL,

  created_at DATETIME(6)
    NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  KEY idx_sac_edit_logs_request (
    sac_request_id
  ),

  KEY idx_sac_edit_logs_date (
    created_at
  ),

  CONSTRAINT fk_sac_edit_logs_request
    FOREIGN KEY (sac_request_id)
    REFERENCES sac_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   ATUALIZACOES / MENSAGENS DO SAC
   ========================================================= */

CREATE TABLE IF NOT EXISTS sac_updates (
  id CHAR(36) NOT NULL,

  sac_request_id CHAR(36) NOT NULL,

  message LONGTEXT NOT NULL,

  created_by CHAR(36) NULL,

  author_email VARCHAR(320) NULL,

  created_at DATETIME(6)
    NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  KEY idx_sac_updates_request_id (
    sac_request_id
  ),

  KEY idx_sac_updates_created_at (
    created_at
  ),

  CONSTRAINT fk_sac_updates_request
    FOREIGN KEY (sac_request_id)
    REFERENCES sac_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   STORAGE LOCAL
   ========================================================= */

CREATE TABLE IF NOT EXISTS storage_objects (
  id CHAR(36) NOT NULL,

  bucket VARCHAR(100) NOT NULL,

  object_path VARCHAR(1000) NOT NULL,

  original_name VARCHAR(1000) NULL,

  mime_type VARCHAR(255) NULL,

  size_bytes BIGINT UNSIGNED NULL,

  uploaded_by CHAR(36) NULL,

  created_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  UNIQUE KEY uq_storage_object (
    bucket,
    object_path
  ),

  KEY idx_storage_bucket (bucket)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


/* =========================================================
   ESTADO DO PROCESSAMENTO IMAP
   ========================================================= */

CREATE TABLE IF NOT EXISTS imap_processing_log (
  id BIGINT UNSIGNED
    NOT NULL
    AUTO_INCREMENT,

  mailbox VARCHAR(255)
    NOT NULL
    DEFAULT 'INBOX',

  message_uid BIGINT UNSIGNED NOT NULL,

  message_id VARCHAR(1000) NULL,

  status VARCHAR(50) NOT NULL,

  error_message LONGTEXT NULL,

  processed_at DATETIME(6)
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),

  UNIQUE KEY uq_imap_mailbox_uid (
    mailbox,
    message_uid
  ),

  KEY idx_imap_message_id (
    message_id(191)
  )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


SET FOREIGN_KEY_CHECKS=1;


/* =========================================================
   DADOS INICIAIS
   ========================================================= */

INSERT IGNORE INTO complaint_types (
  id,
  name,
  active
)
VALUES
  (UUID(), 'Produto com defeito', 1),
  (UUID(), 'Atraso na entrega', 1),
  (UUID(), 'Cobrança indevida', 1),
  (UUID(), 'Atendimento', 1),
  (UUID(), 'Outros', 1);


INSERT INTO email_settings (
  id,
  bcc_enabled,
  bcc_email,
  emails_enabled,
  self_copy_enabled,
  internal_notifications_enabled,
  internal_notification_emails
)
SELECT
  UUID(),
  1,
  'gerente@digitaletextil.com.br',
  1,
  1,
  0,
  'gerente@digitaletextil.com.br, renato@digitaletextil.com.br'
WHERE NOT EXISTS (
  SELECT 1
  FROM email_settings
);


INSERT IGNORE INTO schema_migrations (
  migration_name
)
VALUES (
  '001_mysql_schema'
);
