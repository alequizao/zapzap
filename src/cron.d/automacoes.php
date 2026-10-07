<?php
// Automações agendadas: dispara as regras "agendado" no horário de Maceió e processa a fila de envios (8–20 s entre mensagens).
require_once __DIR__ . '/../hooks/automacoes.php';

return function (): void {
    $ini = time(); $db = bd();
    if (mt_rand(1, 60) === 1) { $db->prepare('DELETE FROM automacao_dedupe WHERE ts<?')->execute([time() - 3 * 86400]); $db->prepare("DELETE FROM automacao_envios WHERE status<>'pendente' AND quando<?")->execute([time() - 7 * 86400]); $db->prepare('DELETE FROM automacao_logs WHERE ts<?')->execute([time() - 60 * 86400]); }
    $reg = registro();
    // 1) disparos agendados que venceram
    $agora = au_agora();
    foreach ($db->query("SELECT * FROM automacoes WHERE ativa=1")->fetchAll() as $r) {
        $a = au_carregar($r); $g = $a['gatilho'];
        if (($g['tipo'] ?? '') !== 'agendado' || !isset($reg[$a['instancia']])) continue;
        $slot = null;
        if ($g['frequencia'] === 'intervalo') { $s = (int)$g['minutos'] * 60; $slot = 'ag:i' . intdiv($ini, $s); }
        else {
            if ($g['frequencia'] === 'semanal' && !in_array((int)$agora->format('w'), $g['dias'], true)) continue;
            $alvo = $agora->setTime((int)substr($g['hora'], 0, 2), (int)substr($g['hora'], 3, 2))->getTimestamp();
            if ($ini < $alvo || $ini - $alvo > 600) continue; // janela de 10 min após o horário
            $slot = 'ag:' . $agora->format('Ymd');
        }
        if (!au_dedupe((int)$a['id'], $slot)) continue;
        usar_instancia($a['instancia']);
        try { au_enfileirar($a, $g['jids'], 'Disparo agendado', null); } catch (Throwable $e) { au_log($a, null, null, 'erro', 'Falha ao agendar: ' . mb_substr($e->getMessage(), 0, 200)); }
    }
    // 2) fila de envios vencidos (respeita o orçamento de ~38 s por rodada)
    $GLOBALS['AU_ORC'] = 10;
    while (time() - $ini < 38) {
        $q = $db->prepare("SELECT * FROM automacao_envios WHERE status='pendente' AND quando<=? ORDER BY quando, id LIMIT 1"); $q->execute([time() + 5]);
        $e = $q->fetch();
        if (!$e) break;
        if ((int)$e['quando'] > time()) { $espera = (int)$e['quando'] - time(); if (time() - $ini + $espera > 38) break; sleep($espera); }
        $u = $db->prepare("UPDATE automacao_envios SET status='enviando' WHERE id=? AND status='pendente'"); $u->execute([$e['id']]);
        if ($u->rowCount() !== 1) continue;
        $s = $db->prepare('SELECT * FROM automacoes WHERE id=?'); $s->execute([$e['automacao_id']]); $row = $s->fetch();
        $fim = fn(string $st) => $db->prepare('UPDATE automacao_envios SET status=? WHERE id=?')->execute([$st, $e['id']]);
        if (!$row) { $fim('cancelado'); continue; }
        $a = au_carregar($row);
        if (!$a['ativa'] || $a['modo'] !== 'ao_vivo' || !isset($reg[$a['instancia']])) { au_log($a, $e['jid'] ?: null, null, 'ignorou', 'Automação desativada ou em modo teste antes do envio; cancelado.'); $fim('cancelado'); continue; }
        usar_instancia($a['instancia']);
        $P = []; $c = ['jid' => (string)$e['jid'], 'msg_id' => '', 'nome' => '', 'texto' => '', 'tipo' => '', 'ts' => time(), 'inst_envio' => ($e['inst_envio'] && isset($reg[$e['inst_envio']])) ? $e['inst_envio'] : null];
        if ($c['jid'] === '') $a['acoes'] = array_values(array_filter($a['acoes'], fn($x) => !in_array($x['tipo'], ['responder_texto', 'responder_midia'], true)));
        try { $x = au_acoes($a, $c, true, $P); } catch (Throwable $ex) { $x = ['erros' => 1, 'enviou' => 0]; $P[] = ['etapa' => 'Ação', 'ok' => false, 'detalhe' => 'Exceção: ' . mb_substr($ex->getMessage(), 0, 150)]; }
        $det = implode(' | ', array_map(fn($p) => $p['detalhe'], array_filter($P, fn($p) => str_starts_with($p['etapa'], 'Ação'))));
        au_log($a, $e['jid'] ?: null, null, $x['erros'] > 0 ? 'erro' : 'executou', $det); $fim($x['erros'] > 0 ? 'erro' : 'feito');
        usar_instancia($a['instancia']);
    }
};
