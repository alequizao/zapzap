<?php
// Conta do próprio usuário: trocar a própria senha (substitui o antigo trocar_senha da senha única). Dono: núcleo.
return [
    'trocar_senha' => function () {
        $e = entrada(); $at = (string)($e['atual'] ?? ''); $nv = (string)($e['nova'] ?? '');
        $u = usuario_atual();
        if (strlen($nv) < 6) out(['ok' => false, 'msg' => 'A nova senha precisa ter pelo menos 6 caracteres.'], 400);
        if ($nv === $at) out(['ok' => false, 'msg' => 'A nova senha precisa ser diferente da atual.'], 400);
        if (($b = login_limite('troca:' . $u['usuario'])) > 0) out(['ok' => false, 'msg' => 'Muitas tentativas. Aguarde ' . max(1, (int)ceil($b / 60)) . ' min.'], 429);
        $q = bd()->prepare('SELECT senha_hash FROM usuarios WHERE id=?'); $q->execute([$u['id']]);
        if (!password_verify($at, (string)$q->fetchColumn())) { aud_detalhe('senha atual incorreta'); out(['ok' => false, 'msg' => 'Senha atual incorreta.'], 403); }
        login_sucesso('troca:' . $u['usuario']);
        bd()->prepare('UPDATE usuarios SET senha_hash=?, trocar_senha=0 WHERE id=?')->execute([password_hash($nv, PASSWORD_DEFAULT), $u['id']]);
        sessoes_revogar((int)$u['id'], true);
        aud_detalhe('trocou a própria senha (outras sessões encerradas)');
        out(['ok' => true]);
    },
];
