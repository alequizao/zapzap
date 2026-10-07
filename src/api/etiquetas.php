<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Etiquetas e notas (etiquetas coloridas por conversa + notas internas, nunca enviadas ao cliente).

if (!function_exists('et_jid')) {
    define('ET_CORES', ['#2563EB','#0284C7','#0D9488','#16A34A','#4D7C0F','#B45309','#EA580C','#DC2626','#DB2777','#9333EA','#4F46E5','#475569']);
    function et_jid(string $j): string {
        $j = trim($j);
        if (!preg_match('/^[0-9A-Za-z._:-]{3,60}@(s\.whatsapp\.net|g\.us|lid)$/', $j)) out(['ok' => false, 'msg' => 'Conversa inválida.'], 400);
        return $j;
    }
    function et_id($v): int { $i = (int)$v; if ($i <= 0) out(['ok' => false, 'msg' => 'Identificador inválido.'], 400); return $i; }
    function et_contatos(): array {
        $f = cache_arq('contatos.json');
        $d = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        return is_array($d) ? $d : [];
    }
    function et_nome_de(array $cont, string $jid): string {
        $n = trim((string)($cont[$jid]['nome'] ?? ''));
        if ($n !== '') return $n;
        $num = preg_replace('/\D/', '', explode('@', $jid)[0]);
        return str_ends_with($jid, '@g.us') ? 'Grupo' : ($num !== '' && !str_ends_with($jid, '@lid') ? '+' . $num : 'Contato');
    }
    function et_etiqueta(int $id): array {
        $q = bd()->prepare('SELECT id,nome,cor FROM etiquetas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        $e = $q->fetch();
        if (!$e) out(['ok' => false, 'msg' => 'Etiqueta não encontrada.'], 404);
        return $e;
    }
    function et_aplicadas(string $jid): array {
        $q = bd()->prepare('SELECT e.id,e.nome,e.cor FROM etiqueta_conversas c JOIN etiquetas e ON e.id=c.etiqueta_id WHERE c.instancia=? AND c.jid=? AND e.instancia=? ORDER BY e.nome');
        $q->execute([inst(), $jid, inst()]);
        return array_map(fn($r) => ['id' => (int)$r['id'], 'nome' => $r['nome'], 'cor' => $r['cor']], $q->fetchAll());
    }
    function et_nota(array $r): array {
        return ['id' => (int)$r['id'], 'jid' => $r['jid'], 'usuario_id' => $r['usuario_id'] === null ? null : (int)$r['usuario_id'], 'autor' => $r['usuario_nome'],
            'texto' => $r['texto'], 'fixada' => (bool)$r['fixada'], 'criado' => (int)$r['criado'], 'atualizado' => (int)$r['atualizado'],
            'minha' => (int)$r['usuario_id'] === uid(), 'editada' => (int)$r['atualizado'] > (int)$r['criado'] + 1];
    }
}

return [
    '__perms' => [
        'listar_etiquetas' => 'etiquetas.ver', 'ver_etiquetas_conversa' => 'etiquetas.ver', 'listar_conversas_etiqueta' => 'etiquetas.ver',
        'salvar_etiqueta' => 'etiquetas.editar', 'excluir_etiqueta' => 'etiquetas.editar', 'aplicar_etiqueta' => 'etiquetas.editar',
        'listar_notas' => 'notas.ver', 'salvar_nota' => 'notas.editar', 'fixar_nota' => 'notas.editar', 'excluir_nota' => ['notas.ver', 'notas.editar'],
    ],

    'listar_etiquetas' => function () {
        $q = bd()->prepare('SELECT e.id,e.nome,e.cor,e.criado,(SELECT COUNT(*) FROM etiqueta_conversas c WHERE c.etiqueta_id=e.id AND c.instancia=e.instancia) AS total FROM etiquetas e WHERE e.instancia=? ORDER BY e.nome');
        $q->execute([inst()]);
        $it = array_map(fn($r) => ['id' => (int)$r['id'], 'nome' => $r['nome'], 'cor' => $r['cor'], 'criado' => (int)$r['criado'], 'conversas' => (int)$r['total']], $q->fetchAll());
        out(['ok' => true, 'itens' => $it, 'cores' => ET_CORES]);
    },

    'salvar_etiqueta' => function () {
        $d = entrada();
        $nome = trim(preg_replace('/\s+/u', ' ', (string)($d['nome'] ?? '')));
        $cor = strtoupper(trim((string)($d['cor'] ?? '')));
        $len = mb_strlen($nome);
        if ($len < 1 || $len > 40) out(['ok' => false, 'msg' => 'O nome da etiqueta deve ter de 1 a 40 caracteres.'], 400);
        if (!in_array($cor, ET_CORES, true)) out(['ok' => false, 'msg' => 'Escolha uma das cores disponíveis.'], 400);
        $id = (int)($d['id'] ?? 0);
        $q = bd()->prepare('SELECT id FROM etiquetas WHERE instancia=? AND nome=? AND id<>?'); $q->execute([inst(), $nome, $id]);
        if ($q->fetch()) out(['ok' => false, 'msg' => 'Já existe uma etiqueta com esse nome.'], 409);
        if ($id > 0) {
            et_etiqueta($id);
            bd()->prepare('UPDATE etiquetas SET nome=?, cor=? WHERE id=? AND instancia=?')->execute([$nome, $cor, $id, inst()]);
            aud_detalhe('editou a etiqueta ' . $nome);
        } else {
            $n = bd()->prepare('SELECT COUNT(*) FROM etiquetas WHERE instancia=?'); $n->execute([inst()]);
            if ((int)$n->fetchColumn() >= 100) out(['ok' => false, 'msg' => 'Limite de 100 etiquetas por conexão.'], 400);
            bd()->prepare('INSERT INTO etiquetas (instancia,nome,cor,criado) VALUES (?,?,?,?)')->execute([inst(), $nome, $cor, time()]);
            $id = (int)bd()->lastInsertId();
            aud_detalhe('criou a etiqueta ' . $nome);
        }
        out(['ok' => true, 'etiqueta' => ['id' => $id, 'nome' => $nome, 'cor' => $cor]]);
    },

    'excluir_etiqueta' => function () {
        $e = et_etiqueta(et_id(entrada()['id'] ?? 0));
        $pdo = bd(); $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM etiqueta_conversas WHERE etiqueta_id=? AND instancia=?')->execute([$e['id'], inst()]);
        $pdo->prepare('DELETE FROM etiquetas WHERE id=? AND instancia=?')->execute([$e['id'], inst()]);
        $pdo->commit();
        aud_detalhe('excluiu a etiqueta ' . $e['nome']);
        out(['ok' => true]);
    },

    'aplicar_etiqueta' => function () {
        $d = entrada();
        $jid = et_jid((string)($d['jid'] ?? ''));
        $e = et_etiqueta(et_id($d['etiqueta_id'] ?? 0));
        $aplicar = filter_var($d['aplicar'] ?? true, FILTER_VALIDATE_BOOLEAN);
        if ($aplicar) {
            bd()->prepare('INSERT IGNORE INTO etiqueta_conversas (instancia,jid,etiqueta_id,aplicado_por,aplicado_em) VALUES (?,?,?,?,?)')->execute([inst(), $jid, $e['id'], uid() ?: null, time()]);
        } else {
            bd()->prepare('DELETE FROM etiqueta_conversas WHERE instancia=? AND jid=? AND etiqueta_id=?')->execute([inst(), $jid, $e['id']]);
        }
        aud_detalhe(($aplicar ? 'aplicou' : 'removeu') . ' a etiqueta ' . $e['nome']);
        out(['ok' => true, 'etiquetas' => et_aplicadas($jid)]);
    },

    'ver_etiquetas_conversa' => function () {
        $jid = et_jid((string)($_GET['jid'] ?? ''));
        $ap = et_aplicadas($jid);
        $ids = array_column($ap, 'id');
        $q = bd()->prepare('SELECT id,nome,cor FROM etiquetas WHERE instancia=? ORDER BY nome'); $q->execute([inst()]);
        $todas = array_map(fn($r) => ['id' => (int)$r['id'], 'nome' => $r['nome'], 'cor' => $r['cor'], 'aplicada' => in_array((int)$r['id'], $ids, true)], $q->fetchAll());
        out(['ok' => true, 'jid' => $jid, 'etiquetas' => $ap, 'todas' => $todas, 'cores' => ET_CORES]);
    },

    'listar_conversas_etiqueta' => function () {
        $e = et_etiqueta(et_id($_GET['etiqueta_id'] ?? 0));
        $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 30;
        $t = bd()->prepare('SELECT COUNT(*) FROM etiqueta_conversas WHERE etiqueta_id=? AND instancia=?'); $t->execute([$e['id'], inst()]);
        $total = (int)$t->fetchColumn();
        $q = bd()->prepare('SELECT jid,aplicado_em FROM etiqueta_conversas WHERE etiqueta_id=? AND instancia=? ORDER BY aplicado_em DESC, jid LIMIT ' . $por . ' OFFSET ' . (($pag - 1) * $por));
        $q->execute([$e['id'], inst()]);
        $cont = et_contatos();
        $it = array_map(fn($r) => ['jid' => $r['jid'], 'nome' => et_nome_de($cont, $r['jid']), 'foto' => $cont[$r['jid']]['foto'] ?? null, 'grupo' => str_ends_with($r['jid'], '@g.us'), 'aplicado_em' => (int)$r['aplicado_em']], $q->fetchAll());
        out(['ok' => true, 'etiqueta' => ['id' => (int)$e['id'], 'nome' => $e['nome'], 'cor' => $e['cor']], 'total' => $total, 'pag' => $pag, 'paginas' => max(1, (int)ceil($total / $por)), 'itens' => $it]);
    },

    'listar_notas' => function () {
        $cont = et_contatos();
        if (trim((string)($_GET['jid'] ?? '')) === '') { // notas recentes de todas as conversas
            $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 30;
            $t = bd()->prepare('SELECT COUNT(*) FROM notas WHERE instancia=?'); $t->execute([inst()]);
            $total = (int)$t->fetchColumn();
            $q = bd()->prepare('SELECT * FROM notas WHERE instancia=? ORDER BY criado DESC, id DESC LIMIT ' . $por . ' OFFSET ' . (($pag - 1) * $por));
            $q->execute([inst()]);
            $it = array_map(fn($r) => et_nota($r) + ['nome' => et_nome_de($cont, $r['jid'])], $q->fetchAll());
            out(['ok' => true, 'total' => $total, 'pag' => $pag, 'paginas' => max(1, (int)ceil($total / $por)), 'itens' => $it]);
        }
        $jid = et_jid((string)$_GET['jid']);
        $q = bd()->prepare('SELECT * FROM notas WHERE instancia=? AND jid=? ORDER BY fixada DESC, criado DESC, id DESC LIMIT 200');
        $q->execute([inst(), $jid]);
        out(['ok' => true, 'jid' => $jid, 'nome' => et_nome_de($cont, $jid), 'itens' => array_map('et_nota', $q->fetchAll()), 'pode_editar' => pode('notas.editar')]);
    },

    'salvar_nota' => function () {
        $d = entrada();
        $texto = trim(str_replace("\r\n", "\n", (string)($d['texto'] ?? '')));
        $len = mb_strlen($texto);
        if ($len < 1) out(['ok' => false, 'msg' => 'Escreva o texto da nota.'], 400);
        if ($len > 2000) out(['ok' => false, 'msg' => 'A nota pode ter no máximo 2000 caracteres.'], 400);
        $id = (int)($d['id'] ?? 0); $agora = time();
        if ($id > 0) {
            $q = bd()->prepare('SELECT * FROM notas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]); $n = $q->fetch();
            if (!$n) out(['ok' => false, 'msg' => 'Nota não encontrada.'], 404);
            bd()->prepare('UPDATE notas SET texto=?, atualizado=? WHERE id=?')->execute([$texto, $agora, $id]);
            aud_detalhe('editou uma nota interna');
        } else {
            $jid = et_jid((string)($d['jid'] ?? ''));
            $u = usuario_atual();
            bd()->prepare('INSERT INTO notas (instancia,jid,usuario_id,usuario_nome,texto,fixada,criado,atualizado) VALUES (?,?,?,?,?,0,?,?)')
                ->execute([inst(), $jid, uid() ?: null, mb_substr((string)($u['nome'] ?? 'Sistema'), 0, 80), $texto, $agora, $agora]);
            $id = (int)bd()->lastInsertId();
            aud_detalhe('criou uma nota interna');
        }
        $q = bd()->prepare('SELECT * FROM notas WHERE id=?'); $q->execute([$id]);
        out(['ok' => true, 'nota' => et_nota($q->fetch())]);
    },

    'fixar_nota' => function () {
        $d = entrada(); $id = et_id($d['id'] ?? 0);
        $q = bd()->prepare('SELECT id FROM notas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        if (!$q->fetch()) out(['ok' => false, 'msg' => 'Nota não encontrada.'], 404);
        $f = filter_var($d['fixada'] ?? true, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        bd()->prepare('UPDATE notas SET fixada=? WHERE id=?')->execute([$f, $id]);
        aud_detalhe(($f ? 'fixou' : 'desafixou') . ' uma nota interna');
        out(['ok' => true, 'fixada' => (bool)$f]);
    },

    'excluir_nota' => function () {
        $id = et_id(entrada()['id'] ?? 0);
        $q = bd()->prepare('SELECT usuario_id FROM notas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        $n = $q->fetch();
        if (!$n) out(['ok' => false, 'msg' => 'Nota não encontrada.'], 404);
        if (!(uid() > 0 && (int)$n['usuario_id'] === uid()) && !pode('notas.editar')) out(['ok' => false, 'msg' => 'Só o autor da nota pode excluí-la.', 'sem_permissao' => true], 403);
        bd()->prepare('DELETE FROM notas WHERE id=?')->execute([$id]);
        aud_detalhe('excluiu uma nota interna');
        out(['ok' => true]);
    },
];
