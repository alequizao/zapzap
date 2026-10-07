<?php
// Central de notificações do painel. Dono: núcleo.
function nt_visivel(array $r): bool {
    if (!empty($r['usuario_id']) && (int)$r['usuario_id'] !== uid()) return false;
    if (!empty($r['perm']) && !pode($r['perm'])) return false;
    return in_array($r['instancia'], instancias_permitidas(), true);
}
function nt_fmt(array $r, array $nomes): array {
    return ['id' => (int)$r['id'], 'ts' => (int)$r['ts'], 'tipo' => $r['tipo'], 'titulo' => $r['titulo'], 'texto' => (string)$r['texto'], 'jid' => $r['jid'], 'rota' => $r['rota'],
            'instancia' => $r['instancia'], 'conexao' => $nomes[$r['instancia']] ?? $r['instancia']];
}
return [
    // Itens novos desde o id informado (polling). desde=0 → só devolve o estado atual (sem "tocar" som no front: `inicial:true`).
    'ver_notificacoes' => function () {
        $u = usuario_atual(); $desde = max(0, (int)($_GET['desde'] ?? 0));
        $perm = instancias_permitidas(); if (!$perm) out(['ok' => true, 'itens' => [], 'ultimo_id' => 0, 'nao_vistas' => 0, 'inicial' => $desde === 0]);
        $in = implode(',', array_fill(0, count($perm), '?'));
        $reg = registro(); $nomes = []; foreach ($reg as $n => $v) $nomes[$n] = $v['apelido'] ?? $n;
        $max = (int)bd()->query('SELECT COALESCE(MAX(id),0) FROM notificacoes')->fetchColumn();
        $q = bd()->prepare("SELECT * FROM notificacoes WHERE instancia IN ($in) AND id > ? ORDER BY id ASC LIMIT 40");
        $q->execute(array_merge($perm, [$desde === 0 ? max(0, $max - 0) : $desde]));
        $itens = array_values(array_map(fn($r) => nt_fmt($r, $nomes), array_filter($q->fetchAll(), 'nt_visivel')));
        $v = bd()->prepare('SELECT ultimo_id FROM notificacoes_vistas WHERE usuario_id=?'); $v->execute([$u['id']]); $visto = (int)($v->fetchColumn() ?: 0);
        $c = bd()->prepare("SELECT * FROM notificacoes WHERE instancia IN ($in) AND id > ? ORDER BY id DESC LIMIT 100"); $c->execute(array_merge($perm, [$visto]));
        $nv = count(array_filter($c->fetchAll(), 'nt_visivel'));
        out(['ok' => true, 'itens' => $itens, 'ultimo_id' => $max, 'nao_vistas' => $nv, 'visto_ate' => $visto, 'inicial' => $desde === 0]);
    },
    // Lista da central (últimas 60 visíveis).
    'ver_central' => function () {
        $perm = instancias_permitidas(); if (!$perm) out(['ok' => true, 'itens' => [], 'visto_ate' => 0]);
        $in = implode(',', array_fill(0, count($perm), '?')); $reg = registro(); $nomes = []; foreach ($reg as $n => $v) $nomes[$n] = $v['apelido'] ?? $n;
        $q = bd()->prepare("SELECT * FROM notificacoes WHERE instancia IN ($in) ORDER BY id DESC LIMIT 120"); $q->execute($perm);
        $itens = array_slice(array_values(array_map(fn($r) => nt_fmt($r, $nomes), array_filter($q->fetchAll(), 'nt_visivel'))), 0, 60);
        $v = bd()->prepare('SELECT ultimo_id FROM notificacoes_vistas WHERE usuario_id=?'); $v->execute([uid()]);
        out(['ok' => true, 'itens' => $itens, 'visto_ate' => (int)($v->fetchColumn() ?: 0)]);
    },
    'marcar_notificacoes_vistas' => function () {
        $ate = max(0, (int)(entrada()['ate_id'] ?? 0));
        bd()->prepare('INSERT INTO notificacoes_vistas (usuario_id,ultimo_id,atualizado) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ultimo_id=GREATEST(ultimo_id,VALUES(ultimo_id)), atualizado=VALUES(atualizado)')->execute([uid(), $ate, time()]);
        out(['ok' => true]);
    },
];
