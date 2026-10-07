<?php
// Dispara os lembretes "responder em X tempo" (só avisa se você ainda não respondeu depois de criar o lembrete). Dono: núcleo.
return function (): void {
    $q = bd()->prepare("SELECT * FROM lembretes_resp WHERE status='pendente' AND quando<=? ORDER BY quando ASC LIMIT 20"); $q->execute([time()]);
    foreach ($q->fetchAll() as $r) {
        usar_instancia($r['instancia']);
        $respondeu = false;
        [$c, $j] = evo('POST', '/chat/findMessages/' . rawurlencode($r['instancia']), ['where' => ['key' => ['remoteJid' => $r['jid']]], 'offset' => 5, 'page' => 1], 12);
        if ($c === 200) foreach (($j['messages']['records'] ?? []) as $m) if (!empty($m['key']['fromMe']) && (int)($m['messageTimestamp'] ?? 0) > (int)$r['criado']) { $respondeu = true; break; }
        if ($respondeu) { bd()->prepare("UPDATE lembretes_resp SET status='respondido', disparado_em=? WHERE id=?")->execute([time(), $r['id']]); continue; }
        $nome = $r['nome'] ?: preg_replace('/@.*/', '', $r['jid']);
        notificar('atendimento', 'Lembrete: responder ' . $nome, $r['nota'] ?: 'Você pediu para ser lembrado de responder esta conversa.', ['jid' => $r['jid'], 'rota' => 'conversas?jid=' . rawurlencode($r['jid']), 'ref' => 'lr' . $r['id'], 'usuario_id' => (int)$r['usuario_id'], 'instancia' => $r['instancia']]);
        bd()->prepare("UPDATE lembretes_resp SET status='disparado', disparado_em=? WHERE id=?")->execute([time(), $r['id']]);
    }
};
