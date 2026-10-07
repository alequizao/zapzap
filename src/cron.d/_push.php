<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// Carrega o Web Push no cron (notificações de agenda/campanha/conexão também chegam com o app fechado).
require_once __DIR__ . '/../push_lib.php';
return null;
