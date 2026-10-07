<?php
// Grava a presença (digitando/gravando/online) recebida do evento presence.update da Evolution.
// Payload (Baileys): {id: jid do chat, presences: {<jid do participante>: {lastKnownPresence, lastSeen?}}}
return [
    'presence.update' => function (array $ctx) {
        $d = $ctx['dados'] ?? [];
        $chat = (string)($d['id'] ?? '');
        if (!preg_match('/^[0-9A-Za-z._\-]{1,60}@(s\.whatsapp\.net|g\.us|lid|c\.us)$/', $chat) || !is_array($d['presences'] ?? null)) return;
        $ok = ['composing', 'recording', 'available', 'unavailable', 'paused'];
        $q = bd()->prepare('INSERT INTO presenca (instancia, jid, participante, estado, atualizado, visto) VALUES (?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE estado = VALUES(estado), atualizado = VALUES(atualizado), visto = COALESCE(VALUES(visto), visto)');
        $n = 0;
        foreach ($d['presences'] as $part => $p) {
            $part = (string)$part; $est = (string)($p['lastKnownPresence'] ?? '');
            if (!in_array($est, $ok, true) || strlen($part) > 80 || !preg_match('/^[0-9A-Za-z._:\-]{1,60}@[a-z.]{1,20}$/', $part)) continue;
            $ls = isset($p['lastSeen']) && is_numeric($p['lastSeen']) && (int)$p['lastSeen'] > 0 ? (int)$p['lastSeen'] : null;
            $q->execute([$ctx['instancia'], $chat, $part, $est, time(), $ls]);
            if (++$n >= 50) break;
        }
        if (mt_rand(1, 100) === 1) bd()->prepare('DELETE FROM presenca WHERE atualizado < ?')->execute([time() - 86400]);
    },
];
