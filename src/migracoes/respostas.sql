-- Respostas rápidas (atalhos de texto/mídia). escopo: global | instancia | pessoal. chave_escopo garante atalho único por escopo.
CREATE TABLE IF NOT EXISTS respostas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instancia VARCHAR(40) NULL,
  atalho VARCHAR(30) NOT NULL,
  titulo VARCHAR(80) NOT NULL DEFAULT '',
  texto TEXT NOT NULL,
  tipo VARCHAR(10) NOT NULL DEFAULT 'texto',
  arquivo VARCHAR(120) NOT NULL DEFAULT '',
  nome_arquivo VARCHAR(120) NOT NULL DEFAULT '',
  mime VARCHAR(100) NOT NULL DEFAULT '',
  escopo VARCHAR(10) NOT NULL DEFAULT 'global',
  usuario_id INT UNSIGNED NULL,
  chave_escopo VARCHAR(70) NOT NULL,
  usos INT UNSIGNED NOT NULL DEFAULT 0,
  criado INT UNSIGNED NOT NULL,
  atualizado INT UNSIGNED NOT NULL,
  UNIQUE KEY uk_resp_atalho (chave_escopo, atalho),
  KEY k_resp_inst (instancia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
