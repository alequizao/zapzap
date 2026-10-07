<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — "corte" de dados de uma conexão (Ocultar dados). O painel não mostra nada anterior ao corte.
/** Timestamp (segundos) do corte da conexão (0 = sem corte). Sem argumento usa a conexão ativa. */
function corte_instancia(?string $inst = null): int {
    static $memo = [];
    $inst = $inst ?? inst();
    if (!isset($memo[$inst])) $memo[$inst] = (int)(registro()[$inst]['corte'] ?? 0);
    return $memo[$inst];
}
/** Momento (segundos) em que a mensagem entrou na Evolution: o `id` do registro é um cuid (c + tempo em base36), então
 *  o histórico baixado depois do corte continua visível mesmo com `messageTimestamp` antigo. Sem cuid usa o horário da mensagem. */
function corte_msg_ts(array $m): int {
    $id = (string)($m['id'] ?? '');
    if (preg_match('/^c([0-9a-z]{8})[0-9a-z]+$/', $id, $x)) { $t = (int)(base_convert($x[1], 36, 10) / 1000); if ($t > 1500000000 && $t < 4000000000) return $t; }
    $ts = $m['messageTimestamp'] ?? 0; return (int)(is_array($ts) ? ($ts['low'] ?? 0) : $ts);
}
/** true se a mensagem deve ficar OCULTA (a conexão tem corte e a mensagem é anterior a ele). */
function corte_msg_oculta(array $m): bool { $c = corte_instancia(); return $c > 0 && corte_msg_ts($m) < $c; }
