<?php
// Gera notificações a partir dos eventos do webhook. Dono: núcleo.
$rot = ['imagem' => '📷 Foto', 'video' => '🎬 Vídeo', 'audio' => '🎤 Áudio', 'documento' => '📄 Documento', 'figurinha' => 'Figurinha', 'contato' => '👤 Contato', 'localizacao' => '📍 Localização', 'enquete' => '📊 Enquete'];
return [
    'messages.upsert' => function (array $ctx) use ($rot) {
        $m = $ctx['msg'] ?? null; if (!$m || $m['de_mim'] || $m['grupo'] || str_ends_with($m['jid'], '@broadcast') || str_ends_with($m['jid'], '@newsletter') || $m['jid'] === 'status@broadcast') return;
        $nome = trim($m['nome']) !== '' ? $m['nome'] : preg_replace('/@.*/', '', $m['jid']);
        $txt = trim($m['texto']) !== '' ? $m['texto'] : ($rot[$m['tipo']] ?? 'Nova mensagem');
        notificar('mensagem', $nome, $txt, ['jid' => $m['jid'], 'rota' => 'conversas?jid=' . rawurlencode($m['jid']), 'perm' => 'conversas.ver', 'ref' => $m['id'] ?: null, 'instancia' => $ctx['instancia']]);
    },
    'connection.update' => function (array $ctx) {
        $st = (string)($ctx['dados']['state'] ?? ''); if (!in_array($st, ['open', 'close'], true)) return;
        require_once __DIR__ . '/../alertas.php'; conexao_alertar($ctx['instancia'], $st, 'webhook em tempo real'); return;
        notificar('conexao', $st === 'open' ? 'WhatsApp conectado' : 'WhatsApp desconectado', $st === 'open' ? 'A conexão foi restabelecida.' : 'A conexão caiu. Verifique em Conexões.', ['rota' => 'conexoes', 'ref' => $st . ':' . intdiv(time(), 120), 'instancia' => $ctx['instancia']]);
    },
];
