<?php
// Executor de tarefas periódicas dos módulos (a cada minuto, usuário www). Cada módulo cria src/cron.d/<modulo>.php
// retornando function(): void  (rápida: no máximo ~40 s; respeite limites/intervalos; seja idempotente).
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/lib.php';
$lock = fopen(ZZ_DIR . '/cache/cron_tick.lock', 'c'); if (!flock($lock, LOCK_EX | LOCK_NB)) exit;
set_time_limit(55);
foreach (glob(__DIR__ . '/cron.d/*.php') ?: [] as $f) {
    try { $fn = require $f; if (is_callable($fn)) $fn(); } catch (Throwable $e) { @error_log('[zapzap cron] ' . basename($f) . ': ' . $e->getMessage() . ' @ ' . $e->getLine()); }
}
