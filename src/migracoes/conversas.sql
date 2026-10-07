-- Conversas: marca de "lido até" por conversa (por conexão). Define o contador de não lidas.
CREATE TABLE IF NOT EXISTS conversas_lidas (
  instancia VARCHAR(40) NOT NULL,
  jid VARCHAR(80) NOT NULL,
  lido_ts INT UNSIGNED NOT NULL,
  atualizado INT UNSIGNED NOT NULL,
  PRIMARY KEY (instancia, jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
