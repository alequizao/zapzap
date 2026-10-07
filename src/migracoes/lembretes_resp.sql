CREATE TABLE IF NOT EXISTS lembretes_resp (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  jid VARCHAR(80) NOT NULL,
  nome VARCHAR(120) NULL,
  nota VARCHAR(200) NULL,
  quando INT UNSIGNED NOT NULL,
  status ENUM('pendente','disparado','cancelado','respondido') NOT NULL DEFAULT 'pendente',
  criado INT UNSIGNED NOT NULL,
  disparado_em INT UNSIGNED NULL,
  KEY ix_lr_fila (status, quando), KEY ix_lr_user (usuario_id, status, quando)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
