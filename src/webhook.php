<?php
// ZapZap — recebe eventos da Evolution API (mensagens em tempo real) e despacha para os módulos (src/hooks/*.php).
// URL: /zapzap/webhook.php?i=<instancia>&k=<hmac>. Responde 200 rápido; processa depois (fastcgi_finish_request).
require __DIR__ . '/lib.php';
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
$i = (string)($_GET['i'] ?? ''); $k = (string)($_GET['k'] ?? '');
if (!nome_instancia_ok($i) || !isset(registro()[$i]) || !hash_equals(webhook_chave($i), $k)) { http_response_code(403); echo '{"ok":false}'; exit; }
$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 8 * 1024 * 1024) { http_response_code(413); echo '{"ok":false}'; exit; }
$j = json_decode($raw, true);
if (!is_array($j)) { http_response_code(400); echo '{"ok":false}'; exit; }
echo '{"ok":true}';
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
ignore_user_abort(true); set_time_limit(60);
usar_instancia($i);
$evento = strtolower(str_replace('_', '.', (string)($j['event'] ?? '')));
$dados = $j['data'] ?? [];
$msg = null;
if (in_array($evento, ['messages.upsert', 'send.message'], true)) {
    $d = isset($dados['key']) ? $dados : ($dados['messages'][0] ?? $dados);
    $msg = msg_normalizar($d);
}
if ($evento !== 'presence.update') try {
    $q = bd()->prepare('INSERT INTO eventos (ts,instancia,evento,msg_id,jid,from_me,payload) VALUES (?,?,?,?,?,?,?)');
    $q->execute([time(), $i, mb_substr($evento, 0, 40), $msg['id'] ?? null, $msg['jid'] ?? null, $msg ? (int)$msg['de_mim'] : null, in_array($evento, ['messages.upsert', 'send.message', 'messages.update', 'connection.update'], true) ? mb_substr($raw, 0, 60000) : null]);
    if (mt_rand(1, 200) === 1) bd()->prepare('DELETE FROM eventos WHERE ts < ?')->execute([time() - 14 * 86400]); // retenção 14 dias
} catch (Throwable $e) { @error_log('[zapzap] webhook evento: ' . $e->getMessage()); }
$ctx = ['instancia' => $i, 'evento' => $evento, 'dados' => $dados, 'msg' => $msg];
foreach (glob(__DIR__ . '/hooks/*.php') ?: [] as $f) {
    $h = require $f; if (!is_array($h)) continue;
    foreach ([$evento, '*'] as $ev) if (isset($h[$ev]) && is_callable($h[$ev])) {
        try { usar_instancia($i); $h[$ev]($ctx); } catch (Throwable $e) { @error_log('[zapzap] hook ' . basename($f) . ' ' . $ev . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine()); }
    }
}
