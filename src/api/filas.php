<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Filas e atendimento (central de atendimento). Biblioteca comum em hooks/filas.php.
require_once __DIR__ . '/../hooks/filas.php';

/** Condição SQL de visibilidade (alias a.): gerir/master vê tudo; os demais veem as suas filas, os sem fila e os seus. */
function filas_vis(): array {
    if (pode('filas.gerir')) return ['1=1', []];
    return ['(a.fila_id IS NULL OR a.usuario_id = ? OR a.fila_id IN (SELECT fila_id FROM fila_usuarios WHERE usuario_id = ?))', [uid(), uid()]];
}
function filas_fila_visivel_ids(): ?array { // null = todas
    if (pode('filas.gerir')) return null;
    $q = bd()->prepare('SELECT fila_id FROM fila_usuarios WHERE usuario_id=?'); $q->execute([uid()]); return array_map('intval', array_column($q->fetchAll(), 'fila_id'));
}
function filas_at_carregar(int $id, bool $exigirVis = true): array {
    [$v, $vp] = $exigirVis ? filas_vis() : ['1=1', []];
    $q = bd()->prepare("SELECT a.* FROM atendimentos a WHERE a.id=? AND a.instancia=? AND $v"); $q->execute(array_merge([$id, inst()], $vp));
    $a = $q->fetch(); if (!$a) out(['ok' => false, 'msg' => 'Atendimento não encontrado.'], 404);
    return $a;
}
function filas_id(): int { $i = (int)(entrada()['id'] ?? 0); if ($i <= 0) out(['ok' => false, 'msg' => 'Informe o atendimento.'], 400); return $i; }
function filas_espera(array $a): int { return $a['status'] !== 'resolvido' && $a['pend_desde'] !== null ? max(0, time() - (int)$a['pend_desde']) : 0; }
function filas_lim_row(array $a): array { return [(int)($a['sla_verde_min'] ?? 5), (int)($a['sla_amarelo_min'] ?? 15), (int)($a['sla_laranja_min'] ?? 30)]; }
function filas_atrasado(array $a, ?int $sla): bool { return $a['status'] === 'aguardando' && $sla && (time() - (int)$a['espera_desde']) > $sla * 60; }
/** Formata uma linha de atendimento (com colunas fila_nome, fila_cor, sla_min, usuario_nome do JOIN). */
function filas_fmt(array $a): array {
    $nome = $a['nome_contato'] !== '' ? $a['nome_contato'] : filas_numero_fmt($a['jid']);
    return ['id' => (int)$a['id'], 'jid' => $a['jid'], 'numero' => filas_numero_fmt($a['jid']), 'nome' => $nome,
        'fila_id' => $a['fila_id'] !== null ? (int)$a['fila_id'] : null, 'fila_nome' => $a['fila_nome'] ?? null, 'fila_cor' => $a['fila_cor'] ?? null,
        'usuario_id' => $a['usuario_id'] !== null ? (int)$a['usuario_id'] : null, 'usuario_nome' => $a['usuario_nome'] ?? null,
        'status' => $a['status'], 'origem' => $a['origem'], 'criado' => (int)$a['criado'], 'atualizado' => (int)$a['atualizado'],
        'assumido_em' => $a['assumido_em'] !== null ? (int)$a['assumido_em'] : null, 'encerrado_em' => $a['encerrado_em'] !== null ? (int)$a['encerrado_em'] : null,
        'espera_desde' => (int)$a['espera_desde'], 'ultima_msg_ts' => (int)$a['ultima_msg_ts'], 'ultima_msg_texto' => $a['ultima_msg_texto'],
        'nao_lidas' => (int)$a['nao_lidas'], 'resumo_encerramento' => $a['resumo_encerramento'],
        'espera_s' => filas_espera($a), 'cor_sla' => $a['status'] === 'resolvido' ? null : filas_cor(filas_espera($a), filas_lim_row($a)),
        'atrasado' => filas_atrasado($a, isset($a['sla_min']) ? (int)$a['sla_min'] : null) || ((int)$a['atrasado'] === 1 && $a['status'] === 'aguardando')];
}
const FILAS_SEL = 'SELECT a.*, f.nome AS fila_nome, f.cor AS fila_cor, f.sla_min AS sla_min, f.sla_verde_min, f.sla_amarelo_min, f.sla_laranja_min, u.nome AS usuario_nome FROM atendimentos a LEFT JOIN filas f ON f.id=a.fila_id LEFT JOIN usuarios u ON u.id=a.usuario_id';
function filas_um(int $id): array { $q = bd()->prepare(FILAS_SEL . ' WHERE a.id=?'); $q->execute([$id]); return filas_fmt($q->fetch()); }
/** Usuário pode atender nesta conexão? */
function filas_usuario_atende(int $uid): ?array {
    $q = bd()->prepare("SELECT * FROM usuarios WHERE id=? AND ativo=1"); $q->execute([$uid]); $u = $q->fetch(); if (!$u) return null;
    if ((int)$u['master'] !== 1) {
        $q = bd()->prepare("SELECT 1 FROM usuario_permissoes WHERE usuario_id=? AND chave IN ('filas.atender','filas.transferir','filas.gerir') LIMIT 1"); $q->execute([$uid]); if (!$q->fetchColumn()) return null;
        if ((int)$u['todas_instancias'] !== 1) { $q = bd()->prepare('SELECT 1 FROM usuario_instancias WHERE usuario_id=? AND instancia=?'); $q->execute([$uid, inst()]); if (!$q->fetchColumn()) return null; }
    }
    return $u;
}
function filas_horario_validar($h): ?string {
    if ($h === null || $h === '' || $h === []) return null;
    if (is_string($h)) $h = json_decode($h, true);
    if (!is_array($h)) out(['ok' => false, 'msg' => 'Horário de funcionamento inválido.'], 400);
    $r = [];
    foreach (FILAS_DIAS as $d) {
        $fx = $h[$d] ?? []; if (!is_array($fx)) out(['ok' => false, 'msg' => 'Horário inválido em ' . $d . '.'], 400);
        $lista = [];
        foreach (array_slice($fx, 0, 4) as $f) {
            if (!is_array($f) || count($f) !== 2 || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$f[0]) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$f[1]) || $f[0] >= $f[1])
                out(['ok' => false, 'msg' => 'Faixa de horário inválida em ' . $d . ' (use HH:MM, início antes do fim).'], 400);
            $lista[] = [$f[0], $f[1]];
        }
        $r[$d] = $lista;
    }
    return json_encode($r, JSON_UNESCAPED_UNICODE);
}
function filas_abertos(int $filaId): int { $q = bd()->prepare("SELECT COUNT(*) FROM atendimentos WHERE fila_id=? AND status<>'resolvido'"); $q->execute([$filaId]); return (int)$q->fetchColumn(); }

/** Métricas de um atendente no período [$de,$ate] (timestamps). */
function filas_metricas(int $uid, int $de, int $ate): array {
    $pdo = bd(); $agora = time(); $i = inst();
    $q = $pdo->prepare(FILAS_SEL . " WHERE a.instancia=? AND a.usuario_id=? AND a.status<>'resolvido'"); $q->execute([$i, $uid]);
    $cores = ['verde' => 0, 'amarelo' => 0, 'laranja' => 0, 'vermelho' => 0]; $maior = 0; $n = 0;
    foreach ($q->fetchAll() as $a) { $s = filas_espera($a); $cores[filas_cor($s, filas_lim_row($a))]++; $maior = max($maior, $s); $n++; }
    $q = $pdo->prepare('SELECT AVG(r) FROM (SELECT MIN(e.resposta_s) r FROM atendimento_eventos e JOIN atendimentos a ON a.id=e.atendimento_id WHERE a.instancia=? AND a.usuario_id=? AND e.tipo=\'resposta\' AND e.ts BETWEEN ? AND ? GROUP BY a.id) t');
    $q->execute([$i, $uid, $de, $ate]); $t1 = $q->fetchColumn();
    $q = $pdo->prepare("SELECT AVG(encerrado_em-criado), COUNT(*) FROM atendimentos WHERE instancia=? AND usuario_id=? AND status='resolvido' AND encerrado_em BETWEEN ? AND ?"); $q->execute([$i, $uid, $de, $ate]); [$tr, $enc] = $q->fetch(PDO::FETCH_NUM);
    $q = $pdo->prepare('SELECT COUNT(*) FROM atendimentos WHERE instancia=? AND usuario_id=? AND assumido_em BETWEEN ? AND ?'); $q->execute([$i, $uid, $de, $ate]); $atd = (int)$q->fetchColumn();
    $q = $pdo->prepare("SELECT COUNT(*), SUM(e.cor='verde') FROM atendimento_eventos e JOIN atendimentos a ON a.id=e.atendimento_id WHERE a.instancia=? AND a.usuario_id=? AND e.tipo='resposta' AND e.ts BETWEEN ? AND ?"); $q->execute([$i, $uid, $de, $ate]); [$tot, $vd] = $q->fetch(PDO::FETCH_NUM);
    return ['abertos' => $n, 'abertos_por_cor' => $cores, 'maior_espera_s' => $maior,
        'tempo_medio_primeira_resposta' => $t1 !== null && $t1 !== false ? (int)round((float)$t1) : null, 'tempo_medio_resolucao' => $tr !== null ? (int)round((float)$tr) : null,
        'atendidos' => $atd, 'encerrados' => (int)$enc, 'respostas' => (int)$tot, 'pct_verde' => (int)$tot > 0 ? (int)round(100 * (int)$vd / (int)$tot) : null];
}
function filas_periodo(): array {
    $f = function ($v, $fim) { if ($v === null || $v === '') return null; if (ctype_digit((string)$v)) return (int)$v; $t = strtotime((string)$v . ' 00:00:00 America/Maceio'); return $t ? $t + ($fim ? 86399 : 0) : null; };
    $ate = $f($_GET['ate'] ?? null, true) ?? time(); $de = $f($_GET['de'] ?? null, false) ?? ($ate - 7 * 86400);
    if ($de > $ate) out(['ok' => false, 'msg' => 'Período inválido.'], 400);
    return [$de, $ate];
}

return [
    '__perms' => [
        'listar_filas' => 'filas.ver', 'listar_atendimentos' => 'filas.ver', 'ver_atendimento' => 'filas.ver', 'rel_filas' => 'filas.ver', 'rel_atendente' => 'filas.ver',
        'assumir_atendimento' => 'filas.atender', 'criar_atendimento' => 'filas.atender', 'marcar_atendimento_lido' => 'filas.atender', 'anotar_atendimento' => 'filas.atender',
        'transferir_atendimento' => 'filas.transferir', 'encerrar_atendimento' => 'filas.transferir', 'reabrir_atendimento' => 'filas.transferir',
        'salvar_fila' => 'filas.gerir', 'excluir_fila' => 'filas.gerir', 'ordenar_filas' => 'filas.gerir',
    ],

    'listar_filas' => function () {
        $q = bd()->prepare('SELECT * FROM filas WHERE instancia=? ORDER BY ordem, id'); $q->execute([inst()]); $filas = $q->fetchAll();
        $vis = filas_fila_visivel_ids(); $meus = $vis ?? [];
        $q = bd()->prepare('SELECT fu.fila_id, u.id, u.nome FROM fila_usuarios fu JOIN usuarios u ON u.id=fu.usuario_id JOIN filas f ON f.id=fu.fila_id WHERE f.instancia=? ORDER BY u.nome');
        $q->execute([inst()]); $us = [];
        foreach ($q->fetchAll() as $r) $us[$r['fila_id']][] = ['id' => (int)$r['id'], 'nome' => $r['nome']];
        $q = bd()->prepare("SELECT fila_id, status, COUNT(*) n FROM atendimentos WHERE instancia=? AND status<>'resolvido' GROUP BY fila_id, status"); $q->execute([inst()]); $cont = [];
        foreach ($q->fetchAll() as $r) $cont[(int)$r['fila_id']][$r['status']] = (int)$r['n'];
        $mem = [];
        $q = bd()->prepare('SELECT fila_id FROM fila_usuarios WHERE usuario_id=?'); $q->execute([uid()]); $mem = array_map('intval', array_column($q->fetchAll(), 'fila_id'));
        $itens = array_map(fn($f) => [
            'id' => (int)$f['id'], 'nome' => $f['nome'], 'cor' => $f['cor'], 'ordem' => (int)$f['ordem'], 'saudacao' => (string)$f['saudacao'],
            'mensagem_ausencia' => (string)$f['mensagem_ausencia'], 'horario' => $f['horario'] ? json_decode($f['horario'], true) : null,
            'sla_min' => (int)$f['sla_min'], 'sla_verde_min' => (int)$f['sla_verde_min'], 'sla_amarelo_min' => (int)$f['sla_amarelo_min'], 'sla_laranja_min' => (int)$f['sla_laranja_min'], 'padrao' => (int)$f['padrao'] === 1, 'ativa' => (int)$f['ativa'] === 1,
            'aberta_agora' => filas_aberta($f['horario']), 'usuarios' => $us[$f['id']] ?? [], 'membro' => in_array((int)$f['id'], $mem, true),
            'aguardando' => $cont[(int)$f['id']]['aguardando'] ?? 0, 'em_atendimento' => $cont[(int)$f['id']]['em_atendimento'] ?? 0,
        ], $filas);
        $q = bd()->query("SELECT id, nome, master, todas_instancias FROM usuarios WHERE ativo=1 ORDER BY nome"); $atend = [];
        foreach ($q->fetchAll() as $u) if (filas_usuario_atende((int)$u['id'])) $atend[] = ['id' => (int)$u['id'], 'nome' => $u['nome']];
        out(['ok' => true, 'filas' => $itens, 'atendentes' => $atend, 'sem_fila' => ['aguardando' => $cont[0]['aguardando'] ?? 0, 'em_atendimento' => $cont[0]['em_atendimento'] ?? 0]]);
    },

    'salvar_fila' => function () {
        $e = entrada(); $id = (int)($e['id'] ?? 0);
        $nome = trim((string)($e['nome'] ?? '')); if ($nome === '' || mb_strlen($nome) > 60) out(['ok' => false, 'msg' => 'Informe o nome da fila (até 60 caracteres).'], 400);
        $cor = (string)($e['cor'] ?? '#2563EB'); if (!preg_match('/^#[0-9a-fA-F]{6}$/', $cor)) out(['ok' => false, 'msg' => 'Cor inválida (use #RRGGBB).'], 400);
        $sau = trim((string)($e['saudacao'] ?? '')); $aus = trim((string)($e['mensagem_ausencia'] ?? ''));
        if (mb_strlen($sau) > 1000 || mb_strlen($aus) > 1000) out(['ok' => false, 'msg' => 'Saudação e mensagem de ausência: até 1000 caracteres.'], 400);
        $hor = filas_horario_validar($e['horario'] ?? null);
        $sla = max(0, min(10080, (int)($e['sla_min'] ?? 0))); $ativa = !isset($e['ativa']) || $e['ativa'] ? 1 : 0; $padrao = !empty($e['padrao']) ? 1 : 0;
        $lv = (int)($e['sla_verde_min'] ?? 5); $la = (int)($e['sla_amarelo_min'] ?? 15); $ll = (int)($e['sla_laranja_min'] ?? 30);
        if (!(0 < $lv && $lv < $la && $la < $ll && $ll <= 1440)) out(['ok' => false, 'msg' => 'Limites de cor inválidos: use 0 < verde < amarelo < laranja ≤ 1440 minutos.'], 400);
        $usr = array_values(array_unique(array_map('intval', (array)($e['usuarios'] ?? [])))); if (count($usr) > 200) out(['ok' => false, 'msg' => 'Usuários demais.'], 400);
        $pdo = bd();
        $q = $pdo->prepare('SELECT id FROM filas WHERE instancia=? AND nome=? AND id<>?'); $q->execute([inst(), $nome, $id]); if ($q->fetchColumn()) out(['ok' => false, 'msg' => 'Já existe uma fila com esse nome.'], 409);
        foreach ($usr as $uid) if (!filas_usuario_atende($uid)) out(['ok' => false, 'msg' => 'Há usuário na lista que não pode atender nesta conexão (sem permissão ou inativo).'], 400);
        $pdo->beginTransaction();
        try {
            if ($id) {
                $q = $pdo->prepare('SELECT id FROM filas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]); if (!$q->fetchColumn()) { $pdo->rollBack(); out(['ok' => false, 'msg' => 'Fila não encontrada.'], 404); }
                $pdo->prepare('UPDATE filas SET nome=?, cor=?, saudacao=?, mensagem_ausencia=?, horario=?, sla_min=?, sla_verde_min=?, sla_amarelo_min=?, sla_laranja_min=?, padrao=?, ativa=? WHERE id=?')->execute([$nome, $cor, $sau, $aus, $hor, $sla, $lv, $la, $ll, $padrao, $ativa, $id]);
            } else {
                $q = $pdo->prepare('SELECT COALESCE(MAX(ordem),0)+1 FROM filas WHERE instancia=?'); $q->execute([inst()]);
                $pdo->prepare('INSERT INTO filas (instancia,nome,cor,ordem,saudacao,mensagem_ausencia,horario,sla_min,sla_verde_min,sla_amarelo_min,sla_laranja_min,padrao,ativa,criado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([inst(), $nome, $cor, (int)$q->fetchColumn(), $sau, $aus, $hor, $sla, $lv, $la, $ll, $padrao, $ativa, time()]);
                $id = (int)$pdo->lastInsertId();
            }
            if ($padrao) $pdo->prepare('UPDATE filas SET padrao=0 WHERE instancia=? AND id<>?')->execute([inst(), $id]);
            $pdo->prepare('DELETE FROM fila_usuarios WHERE fila_id=?')->execute([$id]);
            $ins = $pdo->prepare('INSERT INTO fila_usuarios (fila_id,usuario_id) VALUES (?,?)'); foreach ($usr as $u) $ins->execute([$id, $u]);
            $pdo->commit();
        } catch (Throwable $ex) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $ex; }
        aud_detalhe(($e['id'] ?? 0 ? 'editou' : 'criou') . ' a fila ' . $nome);
        out(['ok' => true, 'id' => $id]);
    },

    'excluir_fila' => function () {
        $id = filas_id(); $q = bd()->prepare('SELECT nome FROM filas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]); $n = $q->fetchColumn();
        if ($n === false) out(['ok' => false, 'msg' => 'Fila não encontrada.'], 404);
        $ab = filas_abertos($id); if ($ab > 0) out(['ok' => false, 'msg' => "Esta fila tem $ab atendimento(s) aberto(s). Transfira ou encerre antes de excluir."], 409);
        bd()->prepare('DELETE FROM filas WHERE id=?')->execute([$id]);
        aud_detalhe('excluiu a fila ' . $n); out(['ok' => true]);
    },

    'ordenar_filas' => function () {
        $ids = array_values(array_unique(array_map('intval', (array)(entrada()['ids'] ?? [])))); if (!$ids || count($ids) > 200) out(['ok' => false, 'msg' => 'Lista de filas inválida.'], 400);
        $pdo = bd(); $pdo->beginTransaction(); $up = $pdo->prepare('UPDATE filas SET ordem=? WHERE id=? AND instancia=?');
        foreach ($ids as $i => $id) $up->execute([$i + 1, $id, inst()]);
        $pdo->commit(); aud_detalhe('reordenou as filas'); out(['ok' => true]);
    },

    'listar_atendimentos' => function () {
        [$v, $vp] = filas_vis(); $w = ['a.instancia=?', $v]; $p = array_merge([inst()], $vp);
        $base = $w; $basep = $p; // para contagens (sem filtro de status)
        $st = (string)($_GET['status'] ?? ''); $fila = $_GET['fila_id'] ?? ''; $us = $_GET['usuario_id'] ?? ''; $q = trim(mb_substr((string)($_GET['q'] ?? ''), 0, 80));
        if ($fila !== '') { if ((int)$fila === 0) $w[] = 'a.fila_id IS NULL'; else { $w[] = 'a.fila_id=?'; $p[] = (int)$fila; } }
        if ($us !== '') { if ((int)$us === 0) $w[] = 'a.usuario_id IS NULL'; else { $w[] = 'a.usuario_id=?'; $p[] = (int)$us; } }
        if ($q !== '') { $esc = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q); $w[] = "(a.nome_contato LIKE ? OR a.jid LIKE ? OR a.ultima_msg_texto LIKE ?)"; array_push($p, "%$esc%", "%$esc%", "%$esc%"); }
        $cw = $w; $cp = $p;
        if ($st === 'atrasado') { $w[] = "a.status='aguardando' AND f.sla_min>0 AND a.espera_desde < ?"; $p[] = time(); $w[] = '(? - a.espera_desde) > f.sla_min*60'; $p[] = time(); }
        elseif (in_array($st, ['aguardando', 'em_atendimento', 'resolvido'], true)) { $w[] = 'a.status=?'; $p[] = $st; }
        elseif ($st === 'abertos') $w[] = "a.status<>'resolvido'";
        $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 30;
        $pdo = bd(); $j = ' FROM atendimentos a LEFT JOIN filas f ON f.id=a.fila_id LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE ';
        $c = $pdo->prepare('SELECT COUNT(*)' . $j . implode(' AND ', $w)); $c->execute($p); $total = (int)$c->fetchColumn();
        $ord = $st === 'aguardando' || $st === 'atrasado' ? 'a.espera_desde ASC' : 'a.ultima_msg_ts DESC';
        $l = $pdo->prepare('SELECT a.*, f.nome AS fila_nome, f.cor AS fila_cor, f.sla_min AS sla_min, f.sla_verde_min, f.sla_amarelo_min, f.sla_laranja_min, u.nome AS usuario_nome' . $j . implode(' AND ', $w) . " ORDER BY $ord, a.id DESC LIMIT $por OFFSET " . (($pag - 1) * $por));
        $l->execute($p);
        $k = $pdo->prepare('SELECT a.status, COUNT(*) n, SUM(a.status=\'aguardando\' AND f.sla_min>0 AND (? - a.espera_desde) > f.sla_min*60) atr FROM atendimentos a LEFT JOIN filas f ON f.id=a.fila_id WHERE ' . implode(' AND ', $cw) . ' GROUP BY a.status');
        $k->execute(array_merge([time()], $cp)); $cont = ['aguardando' => 0, 'em_atendimento' => 0, 'resolvido' => 0, 'atrasados' => 0];
        foreach ($k->fetchAll() as $r) { $cont[$r['status']] = (int)$r['n']; if ($r['status'] === 'aguardando') $cont['atrasados'] = (int)$r['atr']; }
        out(['ok' => true, 'total' => $total, 'pag' => $pag, 'paginas' => max(1, (int)ceil($total / $por)), 'contagem' => $cont, 'itens' => array_map('filas_fmt', $l->fetchAll())]);
    },

    'ver_atendimento' => function () {
        $id = (int)($_GET['id'] ?? 0); $a = filas_at_carregar($id);
        $q = bd()->prepare('SELECT e.id, e.ts, e.usuario_id, u.nome AS usuario_nome, e.tipo, e.detalhe, e.resposta_s, e.cor FROM atendimento_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE e.atendimento_id=? ORDER BY e.ts, e.id'); $q->execute([$id]);
        $ev = array_map(fn($r) => ['id' => (int)$r['id'], 'ts' => (int)$r['ts'], 'usuario_id' => $r['usuario_id'] !== null ? (int)$r['usuario_id'] : null, 'usuario_nome' => $r['usuario_nome'], 'tipo' => $r['tipo'], 'detalhe' => $r['detalhe'], 'resposta_s' => $r['resposta_s'] !== null ? (int)$r['resposta_s'] : null, 'cor' => $r['cor']], $q->fetchAll());
        out(['ok' => true, 'atendimento' => filas_um($id), 'eventos' => $ev]);
    },

    'assumir_atendimento' => function () {
        $id = filas_id(); $a = filas_at_carregar($id); $agora = time(); $eu = uid();
        if ($a['status'] === 'resolvido') out(['ok' => false, 'msg' => 'Atendimento já encerrado. Reabra para assumir.'], 409);
        if ($a['status'] === 'em_atendimento' && (int)$a['usuario_id'] === $eu) out(['ok' => true, 'atendimento' => filas_um($id)]);
        if ($a['status'] === 'em_atendimento' && !pode('filas.gerir')) out(['ok' => false, 'msg' => 'Este atendimento já está com outro atendente.'], 409);
        $q = bd()->prepare("UPDATE atendimentos SET status='em_atendimento', usuario_id=?, assumido_em=?, atualizado=?, atrasado=0 WHERE id=? AND (status='aguardando' OR ?)");
        $q->execute([$eu, $agora, $agora, $id, pode('filas.gerir') ? 1 : 0]);
        if (!$q->rowCount()) out(['ok' => false, 'msg' => 'Outro atendente assumiu agora mesmo.'], 409);
        filas_evento($id, 'assumiu', $a['status'] === 'em_atendimento' ? 'assumiu de outro atendente' : '', $eu);
        aud_detalhe('assumiu o atendimento #' . $id); out(['ok' => true, 'atendimento' => filas_um($id)]);
    },

    'transferir_atendimento' => function () {
        $e = entrada(); $id = filas_id(); $a = filas_at_carregar($id); $agora = time(); $eu = uid();
        if ($a['status'] === 'resolvido') out(['ok' => false, 'msg' => 'Atendimento encerrado. Reabra antes de transferir.'], 409);
        $temF = array_key_exists('fila_id', $e) && $e['fila_id'] !== null && $e['fila_id'] !== ''; $temU = !empty($e['usuario_id']);
        if (!$temF && !$temU) out(['ok' => false, 'msg' => 'Escolha a fila ou o atendente de destino.'], 400);
        $motivo = trim((string)($e['motivo'] ?? '')); if (mb_strlen($motivo) > 200) out(['ok' => false, 'msg' => 'Motivo: até 200 caracteres.'], 400);
        $filaId = $a['fila_id'] !== null ? (int)$a['fila_id'] : null; $dest = [];
        if ($temF) {
            $fid = (int)$e['fila_id'];
            if ($fid > 0) { $q = bd()->prepare('SELECT id,nome FROM filas WHERE id=? AND instancia=? AND ativa=1'); $q->execute([$fid, inst()]); $f = $q->fetch(); if (!$f) out(['ok' => false, 'msg' => 'Fila de destino inválida.'], 400); $filaId = $fid; $dest[] = 'fila ' . $f['nome']; }
            else { $filaId = null; $dest[] = 'sem fila'; }
        }
        $uid = null;
        if ($temU) {
            $uid = (int)$e['usuario_id']; $u = filas_usuario_atende($uid); if (!$u) out(['ok' => false, 'msg' => 'Esse usuário não pode atender nesta conexão.'], 400);
            $dest[] = 'atendente ' . $u['nome'];
        }
        $pdo = bd();
        if ($uid) $pdo->prepare("UPDATE atendimentos SET fila_id=?, usuario_id=?, status='em_atendimento', assumido_em=?, atualizado=?, atrasado=0 WHERE id=?")->execute([$filaId, $uid, $agora, $agora, $id]);
        else $pdo->prepare("UPDATE atendimentos SET fila_id=?, usuario_id=NULL, status='aguardando', espera_desde=?, atualizado=?, atrasado=0 WHERE id=?")->execute([$filaId, $agora, $agora, $id]);
        filas_evento($id, 'transferiu', 'para ' . implode(' / ', $dest) . ($motivo !== '' ? ' — ' . $motivo : ''), $eu);
        aud_detalhe('transferiu o atendimento #' . $id . ' para ' . implode(' / ', $dest)); out(['ok' => true, 'atendimento' => filas_um($id)]);
    },

    'encerrar_atendimento' => function () {
        $e = entrada(); $id = filas_id(); $a = filas_at_carregar($id); $agora = time();
        if ($a['status'] === 'resolvido') out(['ok' => true, 'atendimento' => filas_um($id)]);
        $res = trim((string)($e['resumo'] ?? '')); if (mb_strlen($res) > 200) out(['ok' => false, 'msg' => 'Resumo: até 200 caracteres.'], 400);
        bd()->prepare("UPDATE atendimentos SET status='resolvido', encerrado_em=?, atualizado=?, nao_lidas=0, atrasado=0, pend_desde=NULL, sla_notif=0, resumo_encerramento=? WHERE id=?")->execute([$agora, $agora, $res !== '' ? $res : null, $id]);
        filas_evento($id, 'encerrou', $res, uid()); aud_detalhe('encerrou o atendimento #' . $id); out(['ok' => true, 'atendimento' => filas_um($id)]);
    },

    'reabrir_atendimento' => function () {
        $id = filas_id(); $a = filas_at_carregar($id); $agora = time();
        if ($a['status'] !== 'resolvido') out(['ok' => false, 'msg' => 'Este atendimento já está aberto.'], 409);
        $q = bd()->prepare("SELECT id FROM atendimentos WHERE instancia=? AND jid=? AND status<>'resolvido' LIMIT 1"); $q->execute([inst(), $a['jid']]);
        if ($q->fetchColumn()) out(['ok' => false, 'msg' => 'Este contato já tem outro atendimento aberto.'], 409);
        bd()->prepare("UPDATE atendimentos SET status='aguardando', usuario_id=NULL, encerrado_em=NULL, espera_desde=?, pend_desde=?, sla_notif=0, atualizado=?, atrasado=0 WHERE id=?")->execute([$agora, $agora, $agora, $id]);
        filas_evento($id, 'reabriu', 'reaberto manualmente', uid()); aud_detalhe('reabriu o atendimento #' . $id); out(['ok' => true, 'atendimento' => filas_um($id)]);
    },

    'criar_atendimento' => function () {
        $e = entrada(); $jid = destino((string)($e['jid'] ?? ''));
        if (!preg_match('/^(\d{8,16}|[\w.\-]{5,40}@(s\.whatsapp\.net|lid))$/', $jid)) out(['ok' => false, 'msg' => 'Informe um contato ou número válido (grupos não têm atendimento).'], 400);
        if (!str_contains($jid, '@')) $jid .= '@s.whatsapp.net';
        $pdo = bd(); $q = $pdo->prepare("SELECT id FROM atendimentos WHERE instancia=? AND jid=? AND status<>'resolvido' LIMIT 1"); $q->execute([inst(), $jid]); $ex = $q->fetchColumn();
        if ($ex) out(['ok' => true, 'ja_existia' => true, 'atendimento' => filas_um((int)$ex)]);
        $filaId = null;
        if (!empty($e['fila_id'])) { $q = $pdo->prepare('SELECT id FROM filas WHERE id=? AND instancia=? AND ativa=1'); $q->execute([(int)$e['fila_id'], inst()]); $filaId = $q->fetchColumn() ?: null; if (!$filaId) out(['ok' => false, 'msg' => 'Fila inválida.'], 400); }
        $nome = mb_substr(trim((string)($e['nome'] ?? '')) ?: filas_nome_cache($jid), 0, 120); $agora = time();
        $pdo->prepare("INSERT INTO atendimentos (instancia,jid,nome_contato,fila_id,usuario_id,status,origem,criado,atualizado,assumido_em,espera_desde,ultima_msg_ts) VALUES (?,?,?,?,?,'em_atendimento','manual',?,?,?,?,?)")
            ->execute([inst(), $jid, $nome, $filaId, uid(), $agora, $agora, $agora, $agora, $agora]);
        $id = (int)$pdo->lastInsertId(); filas_evento($id, 'criou', 'criado manualmente', uid()); filas_evento($id, 'assumiu', '', uid());
        aud_detalhe('criou o atendimento #' . $id); out(['ok' => true, 'atendimento' => filas_um($id)]);
    },

    'marcar_atendimento_lido' => function () {
        $id = filas_id(); filas_at_carregar($id); bd()->prepare('UPDATE atendimentos SET nao_lidas=0 WHERE id=?')->execute([$id]); out(['ok' => true]);
    },

    'anotar_atendimento' => function () {
        $e = entrada(); $id = filas_id(); filas_at_carregar($id); $t = trim((string)($e['texto'] ?? ''));
        if ($t === '' || mb_strlen($t) > 300) out(['ok' => false, 'msg' => 'Escreva a nota (até 300 caracteres).'], 400);
        filas_evento($id, 'nota', $t, uid()); aud_detalhe('anotou no atendimento #' . $id); out(['ok' => true]);
    },

    'rel_atendente' => function () {
        $uid = isset($_GET['usuario_id']) && $_GET['usuario_id'] !== '' ? (int)$_GET['usuario_id'] : uid();
        if ($uid !== uid() && !pode('filas.gerir')) out(['ok' => false, 'msg' => 'Você só pode consultar as suas próprias métricas.', 'sem_permissao' => true], 403);
        $q = bd()->prepare('SELECT id,nome FROM usuarios WHERE id=?'); $q->execute([$uid]); $u = $q->fetch(); if (!$u) out(['ok' => false, 'msg' => 'Usuário não encontrado.'], 404);
        [$de, $ate] = filas_periodo();
        out(['ok' => true, 'usuario' => ['id' => $uid, 'nome' => $u['nome']], 'de' => $de, 'ate' => $ate] + filas_metricas($uid, $de, $ate));
    },

    'rel_filas' => function () {
        [$v, $vp] = filas_vis(); $inst = inst(); $agora = time(); $de = $agora - 7 * 86400; $pdo = bd();
        $W = "a.instancia=? AND $v"; $P = array_merge([$inst], $vp);
        $q = $pdo->prepare("SELECT a.status, COUNT(*) n FROM atendimentos a WHERE $W AND (a.status<>'resolvido' OR a.encerrado_em>=?) GROUP BY a.status"); $q->execute(array_merge($P, [$de]));
        $tot = ['aguardando' => 0, 'em_atendimento' => 0, 'resolvido' => 0]; foreach ($q->fetchAll() as $r) $tot[$r['status']] = (int)$r['n'];
        $q = $pdo->prepare("SELECT COUNT(*) FROM atendimentos a JOIN filas f ON f.id=a.fila_id WHERE $W AND a.status='aguardando' AND f.sla_min>0 AND (? - a.espera_desde) > f.sla_min*60"); $q->execute(array_merge($P, [$agora])); $tot['atrasados'] = (int)$q->fetchColumn();
        $q = $pdo->prepare("SELECT f.id fila_id, COALESCE(f.nome,'Sem fila') nome, f.cor, SUM(a.status='aguardando') aguardando, SUM(a.status='em_atendimento') em_atendimento, SUM(a.status='resolvido' AND a.encerrado_em>=?) resolvidos
            FROM atendimentos a LEFT JOIN filas f ON f.id=a.fila_id WHERE $W AND (a.status<>'resolvido' OR a.encerrado_em>=?) GROUP BY f.id, f.nome, f.cor ORDER BY f.ordem"); $q->execute(array_merge([$de], $P, [$de]));
        $porFila = array_map(fn($r) => ['fila_id' => $r['fila_id'] !== null ? (int)$r['fila_id'] : null, 'nome' => $r['nome'], 'cor' => $r['cor'], 'aguardando' => (int)$r['aguardando'], 'em_atendimento' => (int)$r['em_atendimento'], 'resolvidos' => (int)$r['resolvidos']], $q->fetchAll());
        $q = $pdo->prepare("SELECT u.id usuario_id, u.nome, SUM(a.status='em_atendimento') em_atendimento, SUM(a.status='resolvido' AND a.encerrado_em>=?) resolvidos, AVG(IF(a.status='resolvido' AND a.encerrado_em>=? AND a.assumido_em IS NOT NULL, a.encerrado_em-a.assumido_em, NULL)) tempo_medio
            FROM atendimentos a JOIN usuarios u ON u.id=a.usuario_id WHERE $W AND (a.status<>'resolvido' OR a.encerrado_em>=?) GROUP BY u.id, u.nome ORDER BY u.nome"); $q->execute(array_merge([$de, $de], $P, [$de]));
        $porUsr = array_map(fn($r) => ['usuario_id' => (int)$r['usuario_id'], 'nome' => $r['nome'], 'em_atendimento' => (int)$r['em_atendimento'], 'resolvidos' => (int)$r['resolvidos'], 'tempo_medio_atendimento' => $r['tempo_medio'] !== null ? (int)round($r['tempo_medio']) : null], $q->fetchAll());
        $q = $pdo->prepare("SELECT AVG(COALESCE(a.primeira_resp_em, a.assumido_em) - a.criado) FROM atendimentos a WHERE $W AND a.criado>=? AND COALESCE(a.primeira_resp_em, a.assumido_em) IS NOT NULL AND a.origem='mensagem' AND COALESCE(a.primeira_resp_em, a.assumido_em) >= a.criado"); $q->execute(array_merge($P, [$de])); $t1 = $q->fetchColumn();
        $q = $pdo->prepare("SELECT AVG(a.encerrado_em - a.assumido_em) FROM atendimentos a WHERE $W AND a.status='resolvido' AND a.encerrado_em>=? AND a.assumido_em IS NOT NULL"); $q->execute(array_merge($P, [$de])); $t2 = $q->fetchColumn();
        $q = $pdo->prepare("SELECT DATE(FROM_UNIXTIME(a.criado)) dia, COUNT(*) n FROM atendimentos a WHERE $W AND a.criado>=? GROUP BY dia"); $q->execute(array_merge($P, [$de])); $cr = array_column($q->fetchAll(), 'n', 'dia');
        $q = $pdo->prepare("SELECT DATE(FROM_UNIXTIME(a.encerrado_em)) dia, COUNT(*) n FROM atendimentos a WHERE $W AND a.status='resolvido' AND a.encerrado_em>=? GROUP BY dia"); $q->execute(array_merge($P, [$de])); $rs = array_column($q->fetchAll(), 'n', 'dia');
        $dias = []; for ($i = 6; $i >= 0; $i--) { $d = date('Y-m-d', $agora - $i * 86400); $dias[] = ['dia' => $d, 'criados' => (int)($cr[$d] ?? 0), 'resolvidos' => (int)($rs[$d] ?? 0)]; }
        $atend = [];
        foreach ($porUsr as $pu) if (pode('filas.gerir') || $pu['usuario_id'] === uid()) $atend[] = ['usuario_id' => $pu['usuario_id'], 'nome' => $pu['nome']] + filas_metricas($pu['usuario_id'], $de, $agora);
        out(['ok' => true, 'periodo_dias' => 7, 'atendentes' => $atend, 'totais' => $tot, 'por_fila' => $porFila, 'por_usuario' => $porUsr, 'por_dia' => $dias,
             'tempo_medio_primeira_resposta' => $t1 !== null && $t1 !== false ? (int)round((float)$t1) : null, 'tempo_medio_atendimento' => $t2 !== null && $t2 !== false ? (int)round((float)$t2) : null]);
    },
];
