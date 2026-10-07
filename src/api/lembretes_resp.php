<?php
// "Me lembre de responder em X tempo": lembretes pessoais por conversa, com aviso (som+vibração) no horário. Dono: núcleo.
const LR_PERM = ['conversas.ver', 'filas.ver', 'filas.atender'];
function lr_jid(string $j): string { if (!preg_match('/^[0-9A-Za-z._:-]{3,64}@(s\.whatsapp\.net|g\.us|lid)$/', $j)) out(['ok' => false, 'msg' => 'Conversa inválida.'], 400); return $j; }
function lr_quando(array $e): int {
    $agora = time();
    $q = isset($e['minutos']) ? $agora + (int)round((float)$e['minutos'] * 60) : (int)($e['quando'] ?? 0);
    if ($q < $agora + 30) out(['ok' => false, 'msg' => 'Escolha um horário no futuro (pelo menos 30 segundos).'], 400);
    if ($q > $agora + 90 * 86400) out(['ok' => false, 'msg' => 'O lembrete pode ser de no máximo 90 dias.'], 400);
    return $q;
}
function lr_meu(int $id): array { $q = bd()->prepare('SELECT * FROM lembretes_resp WHERE id=? AND usuario_id=? AND instancia=?'); $q->execute([$id, uid(), inst()]); $r = $q->fetch(); if (!$r) out(['ok' => false, 'msg' => 'Lembrete não encontrado.'], 404); return $r; }
return [
    'listar_lembretes' => function () {
        $st = (string)($_GET['status'] ?? 'pendente'); $st = in_array($st, ['pendente', 'disparado', 'cancelado', 'respondido', 'todos'], true) ? $st : 'pendente';
        $sql = 'SELECT id,jid,nome,nota,quando,status,criado,disparado_em FROM lembretes_resp WHERE usuario_id=? AND instancia=?' . ($st === 'todos' ? '' : ' AND status=?') . ' ORDER BY quando ' . ($st === 'pendente' ? 'ASC' : 'DESC') . ' LIMIT 100';
        $q = bd()->prepare($sql); $q->execute($st === 'todos' ? [uid(), inst()] : [uid(), inst(), $st]);
        $c = bd()->prepare("SELECT status, COUNT(*) n FROM lembretes_resp WHERE usuario_id=? AND instancia=? GROUP BY status"); $c->execute([uid(), inst()]);
        out(['ok' => true, 'itens' => $q->fetchAll(), 'contagem' => array_column($c->fetchAll(), 'n', 'status'), 'agora' => time()]);
    },
    'criar_lembrete' => function () {
        $e = entrada(); $jid = lr_jid((string)($e['jid'] ?? '')); $quando = lr_quando($e);
        $n = bd()->prepare("SELECT COUNT(*) FROM lembretes_resp WHERE usuario_id=? AND status='pendente'"); $n->execute([uid()]);
        if ((int)$n->fetchColumn() >= 100) out(['ok' => false, 'msg' => 'Você já tem 100 lembretes pendentes.'], 429);
        $nome = mb_substr(trim((string)($e['nome'] ?? '')), 0, 120); $nota = mb_substr(trim((string)($e['nota'] ?? '')), 0, 200);
        bd()->prepare('INSERT INTO lembretes_resp (instancia,usuario_id,jid,nome,nota,quando,criado) VALUES (?,?,?,?,?,?,?)')->execute([inst(), uid(), $jid, $nome ?: null, $nota ?: null, $quando, time()]);
        aud_detalhe('criou lembrete para ' . preg_replace('/@.*/', '', $jid));
        out(['ok' => true, 'id' => (int)bd()->lastInsertId(), 'quando' => $quando]);
    },
    'adiar_lembrete' => function () {
        $e = entrada(); $r = lr_meu((int)($e['id'] ?? 0)); $quando = lr_quando($e);
        bd()->prepare("UPDATE lembretes_resp SET quando=?, status='pendente', disparado_em=NULL WHERE id=?")->execute([$quando, $r['id']]);
        aud_detalhe('adiou lembrete'); out(['ok' => true, 'quando' => $quando]);
    },
    'cancelar_lembrete' => function () { $r = lr_meu((int)(entrada()['id'] ?? 0)); bd()->prepare("UPDATE lembretes_resp SET status='cancelado' WHERE id=?")->execute([$r['id']]); aud_detalhe('cancelou lembrete'); out(['ok' => true]); },
    'concluir_lembrete' => function () { $r = lr_meu((int)(entrada()['id'] ?? 0)); bd()->prepare("UPDATE lembretes_resp SET status='respondido' WHERE id=?")->execute([$r['id']]); aud_detalhe('concluiu lembrete'); out(['ok' => true]); },
    '__perms' => ['listar_lembretes' => LR_PERM, 'criar_lembrete' => LR_PERM, 'adiar_lembrete' => LR_PERM, 'cancelar_lembrete' => LR_PERM, 'concluir_lembrete' => LR_PERM],
];
