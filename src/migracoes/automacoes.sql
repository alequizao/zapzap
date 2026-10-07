-- Automações: regras, registros de execução, deduplicação, fila de envios agendados e marcas (fila/etiqueta) para outros módulos.
CREATE TABLE IF NOT EXISTS automacoes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  ativa TINYINT(1) NOT NULL DEFAULT 0,
  modo ENUM('teste','ao_vivo') NOT NULL DEFAULT 'teste',
  gatilho MEDIUMTEXT NOT NULL,
  condicoes MEDIUMTEXT NOT NULL,
  acoes MEDIUMTEXT NOT NULL,
  limite_hora_contato INT UNSIGNED NOT NULL DEFAULT 3,
  ordem INT NOT NULL DEFAULT 0,
  criado INT UNSIGNED NOT NULL,
  criado_por INT UNSIGNED NULL,
  executada_vezes INT UNSIGNED NOT NULL DEFAULT 0,
  ultima_execucao INT UNSIGNED NULL,
  KEY ix_aut_inst (instancia, ativa, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS automacao_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  automacao_id INT UNSIGNED NOT NULL,
  instancia VARCHAR(40) NOT NULL,
  ts INT UNSIGNED NOT NULL,
  jid VARCHAR(80) NULL,
  msg_id VARCHAR(80) NULL,
  resultado ENUM('executou','ignorou','teste','erro') NOT NULL,
  detalhe VARCHAR(500) NULL,
  KEY ix_aul_a (automacao_id, ts),
  KEY ix_aul_inst (instancia, ts),
  KEY ix_aul_jid (automacao_id, jid, ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS automacao_dedupe (
  automacao_id INT UNSIGNED NOT NULL,
  msg_id VARCHAR(80) NOT NULL,
  ts INT UNSIGNED NOT NULL,
  PRIMARY KEY (automacao_id, msg_id),
  KEY ix_aud_ts (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS automacao_contatos (
  instancia VARCHAR(40) NOT NULL,
  jid VARCHAR(80) NOT NULL,
  primeira_ts INT UNSIGNED NOT NULL,
  PRIMARY KEY (instancia, jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS automacao_envios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  automacao_id INT UNSIGNED NOT NULL,
  instancia VARCHAR(40) NOT NULL,
  inst_envio VARCHAR(40) NULL,
  jid VARCHAR(80) NOT NULL,
  quando INT UNSIGNED NOT NULL,
  status ENUM('pendente','enviando','feito','erro','cancelado') NOT NULL DEFAULT 'pendente',
  KEY ix_aue (status, quando)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS automacao_marcas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  automacao_id INT UNSIGNED NOT NULL,
  jid VARCHAR(80) NOT NULL,
  tipo ENUM('fila','etiqueta') NOT NULL,
  valor VARCHAR(80) NOT NULL,
  ts INT UNSIGNED NOT NULL,
  aplicada TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_aum (instancia, aplicada, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
