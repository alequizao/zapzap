-- Filas: limites de cor por tempo de espera (minutos) e controle de resposta
ALTER TABLE filas ADD COLUMN sla_verde_min INT NOT NULL DEFAULT 5;
ALTER TABLE filas ADD COLUMN sla_amarelo_min INT NOT NULL DEFAULT 15;
ALTER TABLE filas ADD COLUMN sla_laranja_min INT NOT NULL DEFAULT 30;
ALTER TABLE atendimentos ADD COLUMN pend_desde INT UNSIGNED NULL;
ALTER TABLE atendimentos ADD COLUMN sla_notif TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE atendimento_eventos ADD COLUMN resposta_s INT UNSIGNED NULL;
ALTER TABLE atendimento_eventos ADD COLUMN cor VARCHAR(8) NULL;
UPDATE atendimentos SET pend_desde=espera_desde WHERE status<>'resolvido' AND pend_desde IS NULL AND nao_lidas>0
