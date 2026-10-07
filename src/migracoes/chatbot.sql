-- Chatbot (fluxos de menu) — ZapZap
CREATE TABLE IF NOT EXISTS chatbot_fluxos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 0,
  modo VARCHAR(10) NOT NULL DEFAULT 'teste',
  gatilho TEXT NULL,
  so_fora_horario TINYINT(1) NOT NULL DEFAULT 0,
  mensagem_invalida VARCHAR(1000) NOT NULL DEFAULT 'Não entendi sua resposta. Por favor, escolha uma das opções.',
  tentativas_max TINYINT UNSIGNED NOT NULL DEFAULT 3,
  ao_exceder VARCHAR(12) NOT NULL DEFAULT 'transferir',
  expira_minutos INT UNSIGNED NOT NULL DEFAULT 30,
  no_inicial_id INT UNSIGNED NULL,
  criado INT UNSIGNED NOT NULL,
  atualizado INT UNSIGNED NOT NULL,
  KEY k_inst (instancia, ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS chatbot_nos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fluxo_id INT UNSIGNED NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  conteudo MEDIUMTEXT NULL,
  pos_x INT NULL,
  pos_y INT NULL,
  KEY k_fluxo (fluxo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS chatbot_sessoes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  fluxo_id INT UNSIGNED NOT NULL,
  jid VARCHAR(80) NOT NULL,
  no_atual INT UNSIGNED NULL,
  vars TEXT NULL,
  tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  iniciada INT UNSIGNED NOT NULL,
  atualizada INT UNSIGNED NOT NULL,
  estado VARCHAR(12) NOT NULL DEFAULT 'ativo',
  KEY k_jid (instancia, jid, estado),
  KEY k_fluxo (fluxo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS chatbot_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ts INT UNSIGNED NOT NULL,
  instancia VARCHAR(40) NOT NULL,
  fluxo_id INT UNSIGNED NULL,
  sessao_id BIGINT UNSIGNED NULL,
  jid VARCHAR(80) NULL,
  evento VARCHAR(20) NOT NULL,
  no_id INT UNSIGNED NULL,
  msg_id VARCHAR(80) NULL,
  texto VARCHAR(600) NULL,
  simulado TINYINT(1) NOT NULL DEFAULT 0,
  KEY k_inst (instancia, ts),
  KEY k_jid (instancia, jid, ts),
  KEY k_fluxo (fluxo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS chatbot_vistas (
  instancia VARCHAR(40) NOT NULL,
  msg_id VARCHAR(80) NOT NULL,
  ts INT UNSIGNED NOT NULL,
  PRIMARY KEY (instancia, msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
