<?php
// Versão publicada (sempre sem cache) — o cliente confere e se atualiza sozinho.
require __DIR__ . '/lib.php';
no_cache();
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['versao' => ZZ_VERSAO]);
