-- Módulo Etiquetas e notas
CREATE TABLE IF NOT EXISTS etiquetas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  nome VARCHAR(40) NOT NULL,
  cor CHAR(7) NOT NULL DEFAULT '#2563EB',
  criado INT UNSIGNED NOT NULL,
  KEY ix_et_inst (instancia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS etiqueta_conversas (
  instancia VARCHAR(40) NOT NULL,
  jid VARCHAR(80) NOT NULL,
  etiqueta_id INT UNSIGNED NOT NULL,
  aplicado_por INT UNSIGNED NULL,
  aplicado_em INT UNSIGNED NOT NULL,
  PRIMARY KEY (instancia, jid, etiqueta_id),
  KEY ix_etc_et (etiqueta_id, aplicado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NOT NULL,
  jid VARCHAR(80) NOT NULL,
  usuario_id INT UNSIGNED NULL,
  usuario_nome VARCHAR(80) NOT NULL,
  texto TEXT NOT NULL,
  fixada TINYINT(1) NOT NULL DEFAULT 0,
  criado INT UNSIGNED NOT NULL,
  atualizado INT UNSIGNED NOT NULL,
  KEY ix_nt_jid (instancia, jid, criado),
  KEY ix_nt_rec (instancia, criado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
