<?php
// ZapZap — cron da Agenda (somente linha de comando, usuário www, a cada minuto).
if (php_sapi_name() !== 'cli') { http_response_code(403); exit('Acesso negado'); }
require __DIR__ . '/lib.php';
require __DIR__ . '/agenda_lib.php';
date_default_timezone_set('America/Maceio');

$lock = fopen(ZZ_DIR . '/cron.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0); // já há uma rodada em andamento

$pdo = bd();
// Presos em "enviando" há mais de 10 min voltam a erro (enviado_em guarda o início do envio)
$pdo->prepare("UPDATE agendadas SET status='erro', erro='Envio interrompido (tempo esgotado)', enviado_em=NULL WHERE status='enviando' AND enviado_em IS NOT NULL AND enviado_em < ?")
    ->execute([time() - 600]);

$q = $pdo->prepare("SELECT id FROM agendadas WHERE status='pendente' AND quando<=? ORDER BY quando, id LIMIT 5");
$q->execute([time()]);
$ids = $q->fetchAll(PDO::FETCH_COLUMN);
foreach ($ids as $n => $id) {
    if ($n > 0) sleep(3);
    $r = ag_processar((int)$id, ['pendente']);
    echo date('Y-m-d H:i:s'), " agenda #$id: ", $r['ok'] ? 'enviada' : 'erro (' . $r['erro'] . ')', "\n";
}
flock($lock, LOCK_UN);
