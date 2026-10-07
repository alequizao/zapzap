<?php
// Liga/desliga o recebimento de mensagens em tempo real (webhook) da conexão ativa. Dono: núcleo.
return [
    'ver_webhook' => function () { out(['ok' => true, 'ligado' => webhook_ligado()]); },
    'webhook_ligar' => function () { $ok = webhook_ligar(); aud_detalhe('ligou o recebimento em tempo real'); out(['ok' => $ok, 'ligado' => $ok, 'msg' => $ok ? 'Recebimento em tempo real ligado.' : 'A Evolution não aceitou ligar o recebimento.']); },
    'webhook_desligar' => function () { $ok = webhook_desligar(); aud_detalhe('desligou o recebimento em tempo real'); out(['ok' => $ok, 'ligado' => false, 'msg' => $ok ? 'Recebimento desligado.' : 'Não foi possível desligar.']); },
    '__perms' => ['ver_webhook' => ['automacoes.ver', 'filas.ver', 'chatbot.ver', 'config.ver'], 'webhook_ligar' => ['automacoes.editar', 'filas.gerir', 'chatbot.editar', 'config.editar'], 'webhook_desligar' => ['automacoes.editar', 'filas.gerir', 'chatbot.editar', 'config.editar']],
];
