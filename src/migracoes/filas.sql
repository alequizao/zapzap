-- Filas e atendimento (central de atendimento)
CREATE TABLE IF NOT EXISTS filas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  nome VARCHAR(60) NOT NULL,
  cor VARCHAR(9) NOT NULL DEFAULT '#2563EB',
  ordem INT NOT NULL DEFAULT 0,
  saudacao TEXT NULL,
  mensagem_ausencia TEXT NULL,
  horario JSON NULL,
  sla_min INT UNSIGNED NOT NULL DEFAULT 0,
  padrao TINYINT(1) NOT NULL DEFAULT 0,
  ativa TINYINT(1) NOT NULL DEFAULT 1,
  criado INT UNSIGNED NOT NULL,
  KEY ix_filas_inst (instancia, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS fila_usuarios (
  fila_id INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (fila_id, usuario_id),
  FOREIGN KEY (fila_id) REFERENCES filas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS atendimentos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  jid VARCHAR(80) NOT NULL,
  nome_contato VARCHAR(120) NOT NULL DEFAULT '',
  fila_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  status ENUM('aguardando','em_atendimento','resolvido') NOT NULL DEFAULT 'aguardando',
  origem VARCHAR(12) NOT NULL DEFAULT 'mensagem',
  criado INT UNSIGNED NOT NULL,
  atualizado INT UNSIGNED NOT NULL,
  assumido_em INT UNSIGNED NULL,
  encerrado_em INT UNSIGNED NULL,
  espera_desde INT UNSIGNED NOT NULL,
  primeira_resp_em INT UNSIGNED NULL,
  ultima_msg_ts INT UNSIGNED NOT NULL DEFAULT 0,
  ultima_msg_texto VARCHAR(120) NOT NULL DEFAULT '',
  ultima_msg_id VARCHAR(80) NULL,
  auto_msg_id VARCHAR(80) NULL,
  nao_lidas INT UNSIGNED NOT NULL DEFAULT 0,
  saudacao_enviada TINYINT(1) NOT NULL DEFAULT 0,
  atrasado TINYINT(1) NOT NULL DEFAULT 0,
  resumo_encerramento VARCHAR(200) NULL,
  KEY ix_at_jid (instancia, jid, status),
  KEY ix_at_status (instancia, status, ultima_msg_ts),
  KEY ix_at_fila (fila_id),
  KEY ix_at_usuario (usuario_id),
  FOREIGN KEY (fila_id) REFERENCES filas(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS atendimento_eventos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  atendimento_id INT UNSIGNED NOT NULL,
  ts INT UNSIGNED NOT NULL,
  usuario_id INT UNSIGNED NULL,
  tipo VARCHAR(20) NOT NULL,
  detalhe VARCHAR(300) NOT NULL DEFAULT '',
  KEY ix_ev_at (atendimento_id, ts),
  KEY ix_ev_tipo (tipo, ts),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
