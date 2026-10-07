<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// Histórico de versões (changelog.json é gerado pelo deploy.sh). Dono: núcleo.
return [
    'versoes' => function () {
        exigir_master(); // só administradores veem o histórico de versões
        $f = __DIR__ . '/../changelog.json';
        $l = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
        out(['ok' => true, 'atual' => ZZ_VERSAO, 'itens' => $l]);
    },
];
