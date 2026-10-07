-- Presença em tempo real (digitando, gravando áudio, online) vinda do evento presence.update. Estados expiram por consulta.
CREATE TABLE IF NOT EXISTS presenca (
  instancia VARCHAR(40) NOT NULL,
  jid VARCHAR(80) NOT NULL,
  participante VARCHAR(80) NOT NULL,
  estado VARCHAR(20) NOT NULL,
  atualizado INT UNSIGNED NOT NULL,
  visto INT UNSIGNED NULL,
  PRIMARY KEY (instancia, jid, participante)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
