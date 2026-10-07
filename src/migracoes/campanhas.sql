-- Campanhas e listas (fila de envio com limites anti-bloqueio)
CREATE TABLE IF NOT EXISTS listas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  criado INT UNSIGNED NOT NULL,
  criado_por INT UNSIGNED NULL,
  KEY ix_listas_inst (instancia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS lista_contatos (
  lista_id INT UNSIGNED NOT NULL,
  jid VARCHAR(60) NOT NULL,
  nome VARCHAR(120) NOT NULL DEFAULT '',
  variaveis TEXT NULL,
  optout TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (lista_id, jid),
  KEY ix_lc_jid (jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS campanhas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  status ENUM('rascunho','agendada','enviando','pausada','concluida','cancelada') NOT NULL DEFAULT 'rascunho',
  lista_id INT UNSIGNED NULL,
  tipo ENUM('texto','midia') NOT NULL DEFAULT 'texto',
  texto TEXT NULL,
  arquivo VARCHAR(80) NULL,
  mime VARCHAR(100) NULL,
  nome_arquivo VARCHAR(120) NULL,
  legenda TEXT NULL,
  agendada_para INT UNSIGNED NULL,
  intervalo_min_s INT UNSIGNED NOT NULL DEFAULT 12,
  intervalo_max_s INT UNSIGNED NOT NULL DEFAULT 25,
  limite_dia INT UNSIGNED NOT NULL DEFAULT 200,
  janela_inicio TINYINT UNSIGNED NOT NULL DEFAULT 8,
  janela_fim TINYINT UNSIGNED NOT NULL DEFAULT 20,
  assinatura VARCHAR(80) NOT NULL DEFAULT '',
  criado INT UNSIGNED NOT NULL,
  criado_por INT UNSIGNED NULL,
  iniciada_em INT UNSIGNED NULL,
  concluida_em INT UNSIGNED NULL,
  total INT UNSIGNED NOT NULL DEFAULT 0,
  enviados INT UNSIGNED NOT NULL DEFAULT 0,
  falhas INT UNSIGNED NOT NULL DEFAULT 0,
  proximo_envio INT UNSIGNED NULL,
  falhas_seguidas INT UNSIGNED NOT NULL DEFAULT 0,
  pausa_motivo VARCHAR(200) NULL,
  KEY ix_camp_inst (instancia, status),
  KEY ix_camp_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS campanha_envios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campanha_id INT UNSIGNED NOT NULL,
  jid VARCHAR(60) NOT NULL,
  nome VARCHAR(120) NOT NULL DEFAULT '',
  status ENUM('pendente','enviado','falha','ignorado') NOT NULL DEFAULT 'pendente',
  tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  enviado_em INT UNSIGNED NULL,
  erro VARCHAR(300) NULL,
  msg_id VARCHAR(80) NULL,
  KEY ix_ce_camp (campanha_id, status, id),
  KEY ix_ce_dia (enviado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS campanha_optouts (
  instancia VARCHAR(40) NOT NULL,
  chave VARCHAR(24) NOT NULL,
  jid VARCHAR(60) NOT NULL,
  quando INT UNSIGNED NOT NULL,
  PRIMARY KEY (instancia, chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
