-- Base do ZapZap (MySQL 5.7, utf8mb4). Cada módulo cria SUAS tabelas em migracoes/<modulo>.sql (CREATE TABLE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(40) NOT NULL UNIQUE,
  nome VARCHAR(80) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  master TINYINT(1) NOT NULL DEFAULT 0,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  sessao_ver INT UNSIGNED NOT NULL DEFAULT 1,
  trocar_senha TINYINT(1) NOT NULL DEFAULT 0,
  todas_instancias TINYINT(1) NOT NULL DEFAULT 0,
  criado INT UNSIGNED NOT NULL,
  criado_por INT UNSIGNED NULL,
  ultimo_login INT UNSIGNED NULL,
  ultimo_ip VARCHAR(45) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS usuario_permissoes (
  usuario_id INT UNSIGNED NOT NULL,
  chave VARCHAR(60) NOT NULL,
  PRIMARY KEY (usuario_id, chave),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS usuario_instancias (
  usuario_id INT UNSIGNED NOT NULL,
  instancia VARCHAR(40) NOT NULL,
  PRIMARY KEY (usuario_id, instancia),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NULL,
  usuario VARCHAR(40) NULL,
  ip VARCHAR(45) NULL,
  instancia VARCHAR(40) NULL,
  acao VARCHAR(60) NOT NULL,
  ok TINYINT(1) NOT NULL DEFAULT 1,
  detalhe VARCHAR(500) NULL,
  KEY ix_aud_ts (ts), KEY ix_aud_user (usuario_id, ts), KEY ix_aud_acao (acao, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS eventos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts INT UNSIGNED NOT NULL,
  instancia VARCHAR(40) NOT NULL,
  evento VARCHAR(40) NOT NULL,
  msg_id VARCHAR(80) NULL,
  jid VARCHAR(80) NULL,
  from_me TINYINT(1) NULL,
  payload MEDIUMTEXT NULL,
  KEY ix_ev_ts (ts), KEY ix_ev_inst (instancia, evento, ts), KEY ix_ev_msg (instancia, msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS config_kv (
  chave VARCHAR(80) NOT NULL PRIMARY KEY,
  valor MEDIUMTEXT NULL,
  atualizado INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sessoes (
  id CHAR(64) NOT NULL PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  criado INT UNSIGNED NOT NULL,
  expira INT UNSIGNED NOT NULL,
  ip VARCHAR(45) NULL,
  agente VARCHAR(160) NULL,
  KEY ix_sess_user (usuario_id), KEY ix_sess_exp (expira),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
