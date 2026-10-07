<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// Carrega o Web Push cedo (o "_" ordena antes dos outros hooks) para que notificar() chame push_notificar() no webhook.
require_once __DIR__ . '/../push_lib.php';
return [];
