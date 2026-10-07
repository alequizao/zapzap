<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Relatórios (somente leitura). Ações GET `rel_*`: rel_resumo, rel_por_dia, rel_por_usuario, rel_por_fila, rel_horarios, rel_exportar.
//
// Decisões:
//  - Tudo filtrado por instancia = inst() quando a tabela tem a coluna; fuso America/Maceio (-03:00, sem horário de verão).
//  - Tabelas opcionais (atendimentos, filas, campanhas…) são verificadas em runtime (information_schema); se faltarem, devolve zeros + disponivel:false.
//  - `envios`/`agendadas` ainda podem estar no SQLite legado: a fonte é escolhida automaticamente (MySQL se existir, senão SQLite).
//  - PRIVACIDADE: totais da conexão (envios, atendimentos, mensagens, heatmap) valem para todos com relatorios.ver. Dados POR USUÁRIO
//    (ações, envios por usuário, telas mais usadas) -> master vê todos; usuário comum vê SÓ o próprio (relatorios.exportar NÃO amplia isso).
//  - Cache de 30 s por parâmetros (cache_arq), período máximo 366 dias, linhas limitadas.

const REL_ORIGENS = ['painel', 'agenda', 'automacao', 'chatbot', 'fila', 'campanha', 'api'];
const REL_ACOES_ENVIO = ['enviar_texto', 'enviar_midia', 'enviar_enquete', 'enviar_localizacao', 'enviar_contato'];
const REL_LIMITE_CSV = 50000;

/** Fonte de uma tabela: MySQL se existir; senão SQLite legado (só envios/agendadas). null = não existe. */
function rel_t(string $t): ?array {
    static $m = [];
    if (array_key_exists($t, $m)) return $m[$t];
    $r = null;
    try {
        $q = bd()->prepare('SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?');
        $q->execute([$t]); $cols = array_column($q->fetchAll(), 'column_name');
        if ($cols) $r = ['pdo' => bd(), 'd' => 'm', 'cols' => array_map('strtolower', $cols), 't' => $t];
    } catch (Throwable $e) {}
    if (!$r && in_array($t, ['envios', 'agendadas'], true)) {
        try { $p = db(); $cols = array_column($p->query("PRAGMA table_info($t)")->fetchAll(), 'name'); if ($cols) $r = ['pdo' => $p, 'd' => 's', 'cols' => $cols, 't' => $t]; } catch (Throwable $e) {}
    }
    return $m[$t] = $r;
}
/** Primeira coluna existente entre as candidatas (ou null). */
function rel_col(?array $f, array $cand): ?string { if (!$f) return null; foreach ($cand as $c) if (in_array($c, $f['cols'], true)) return $c; return null; }
/** Expressões de data no fuso de Maceió, por dialeto. $k: dia | hora | dow (0=domingo). */
function rel_dt(array $f, string $k, string $col): string {
    if ($f['d'] === 'm') return match ($k) { 'dia' => "DATE_FORMAT(FROM_UNIXTIME($col),'%Y-%m-%d')", 'hora' => "HOUR(FROM_UNIXTIME($col))", default => "(DAYOFWEEK(FROM_UNIXTIME($col))-1)" };
    return match ($k) { 'dia' => "strftime('%Y-%m-%d',$col-10800,'unixepoch')", 'hora' => "CAST(strftime('%H',$col-10800,'unixepoch') AS INTEGER)", default => "CAST(strftime('%w',$col-10800,'unixepoch') AS INTEGER)" };
}
function rel_sql(array $f, string $sql, array $p = []): array { $q = $f['pdo']->prepare($sql); $q->execute($p); return $q->fetchAll(); }
/** Condição de instância (se a tabela tem a coluna). Devolve [sql, params]. */
function rel_inst(array $f, string $alias = ''): array { return in_array('instancia', $f['cols'], true) ? [($alias ? "$alias." : '') . 'instancia=?', [inst()]] : ['1=1', []]; }

/** Período a partir de ?de&ate (YYYY-MM-DD). Padrão: últimos 7 dias (hoje incluso). Máx. 366 dias. */
function rel_periodo(): array {
    $tz = new DateTimeZone('America/Maceio'); $hoje = new DateTime('today', $tz);
    $ok = function ($s) use ($tz) { $s = (string)$s; if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null; [$y, $m, $d] = array_map('intval', explode('-', $s)); return checkdate($m, $d, $y) ? new DateTime($s . ' 00:00:00', $tz) : null; };
    $ate = isset($_GET['ate']) && $_GET['ate'] !== '' ? $ok($_GET['ate']) : clone $hoje;
    $de = isset($_GET['de']) && $_GET['de'] !== '' ? $ok($_GET['de']) : (clone $ate)->modify('-6 day');
    if (!$ate || !$de) out(['ok' => false, 'msg' => 'Datas inválidas. Use o formato AAAA-MM-DD.'], 400);
    if ($de > $ate) [$de, $ate] = [$ate, $de];
    $n = (int)round(($ate->getTimestamp() - $de->getTimestamp()) / 86400) + 1;
    if ($n > 366) out(['ok' => false, 'msg' => 'O período máximo é de 366 dias.'], 400);
    $a = $de->getTimestamp(); $b = (clone $ate)->modify('+1 day')->getTimestamp();
    $dias = []; $c = clone $de; for ($i = 0; $i < $n; $i++) { $dias[] = $c->format('Y-m-d'); $c->modify('+1 day'); }
    $pa = (clone $de)->modify("-$n day")->getTimestamp();
    return ['de' => $de->format('Y-m-d'), 'ate' => $ate->format('Y-m-d'), 'a' => $a, 'b' => $b, 'n' => $n, 'dias' => $dias, 'pa' => $pa, 'pb' => $a];
}
function rel_var($cur, $ant): ?float { $cur = (float)$cur; $ant = (float)$ant; if ($ant == 0.0) return $cur == 0.0 ? 0.0 : null; return round(($cur - $ant) / $ant * 100, 1); }
/** Escopo de dados por usuário: master = todos (null); demais = só o próprio id. */
function rel_escopo(): ?int { $u = usuario_atual(); return ($u && $u['master']) ? null : uid(); }

/** Cache de 30 s por ação+parâmetros+escopo. */
function rel_cache(string $acao, callable $fn): never {
    $chave = md5(inst() . '|' . $acao . '|' . (rel_escopo() ?? 'm') . '|' . json_encode([$_GET['de'] ?? '', $_GET['ate'] ?? '', $_GET['serie'] ?? '', $_GET['direcao'] ?? '']));
    $f = cache_arq('rel_' . $chave . '.json');
    if (is_file($f) && filemtime($f) > time() - 30) { $j = @file_get_contents($f); if ($j !== false && $j !== '') { header('Content-Type: application/json; charset=utf-8'); http_response_code(200); echo $j; exit; } }
    $r = $fn(); $r['ok'] = true; $r['gerado'] = time();
    $j = json_encode($r, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($j !== false) { $t = $f . '.' . bin2hex(random_bytes(3)); @file_put_contents($t, $j); @rename($t, $f); }
    if (random_int(1, 50) === 1) foreach (glob(dirname($f) . '/rel_*.json') ?: [] as $x) if (@filemtime($x) < time() - 600) @unlink($x);
    out($r);
}

/** Envios (painel/agenda/automação…) no intervalo [a,b). */
function rel_envios(int $a, int $b): array {
    $r = ['total' => 0, 'ok' => 0, 'falha' => 0, 'por_origem' => array_fill_keys(REL_ORIGENS, 0), 'por_tipo' => [], 'disponivel' => false];
    $f = rel_t('envios'); if (!$f) return $r;
    $r['disponivel'] = true; [$ci, $pi] = rel_inst($f);
    foreach (rel_sql($f, "SELECT origem,tipo,ok,COUNT(*) c FROM envios WHERE $ci AND quando>=? AND quando<? GROUP BY origem,tipo,ok", array_merge($pi, [$a, $b])) as $x) {
        $c = (int)$x['c']; $r['total'] += $c; $x['ok'] ? $r['ok'] += $c : $r['falha'] += $c;
        $r['por_origem'][$x['origem']] = ($r['por_origem'][$x['origem']] ?? 0) + $c;
        $r['por_tipo'][$x['tipo']] = ($r['por_tipo'][$x['tipo']] ?? 0) + $c;
    }
    arsort($r['por_tipo']);
    return $r;
}
/** Lista de dias (YYYY-MM-DD, Maceió) em [a,b). */
function rel_dias(int $a, int $b): array { $l = []; $c = (new DateTime('@' . $a))->setTimezone(new DateTimeZone('America/Maceio')); while ($c->getTimestamp() < $b) { $l[] = $c->format('Y-m-d'); $c->modify('+1 day'); } return $l; }
/** Mensagens enviadas/recebidas por dia (eventos do webhook; fallback: tabela envios). */
function rel_msgs_dia(?array $p, int $a, int $b): array {
    $dias = []; foreach (rel_dias($a, $b) as $d) $dias[$d] = ['enviadas' => 0, 'recebidas' => 0];
    $fonte = 'nenhuma'; $fe = rel_t('eventos');
    if ($fe) {
        $dia = rel_dt($fe, 'dia', 'ts');
        $rows = rel_sql($fe, "SELECT $dia d, from_me, COUNT(DISTINCT msg_id) c FROM eventos WHERE instancia=? AND ts>=? AND ts<? AND evento IN ('MESSAGES_UPSERT','SEND_MESSAGE') AND msg_id IS NOT NULL GROUP BY d, from_me", [inst(), $a, $b]);
        foreach ($rows as $x) if (isset($dias[$x['d']])) $dias[$x['d']][$x['from_me'] ? 'enviadas' : 'recebidas'] += (int)$x['c'];
        if ($rows) $fonte = 'eventos';
    }
    if ($fonte === 'nenhuma' && ($fv = rel_t('envios'))) { // fallback: só dá para saber o que o sistema enviou
        [$ci, $pi] = rel_inst($fv); $dia = rel_dt($fv, 'dia', 'quando');
        foreach (rel_sql($fv, "SELECT $dia d, COUNT(*) c FROM envios WHERE $ci AND ok=1 AND quando>=? AND quando<? GROUP BY d", array_merge($pi, [$a, $b])) as $x) if (isset($dias[$x['d']])) $dias[$x['d']]['enviadas'] += (int)$x['c'];
        $fonte = 'envios';
    }
    return [$dias, $fonte];
}
/** Atendimentos (tabela opcional). $agrupar: null | 'fila' | 'atendente' | 'dia'. Tolerante a nomes de colunas. */
function rel_atend(int $a, int $b, ?string $agrupar = null): array {
    $vazio = ['disponivel' => false, 'abertos' => 0, 'resolvidos' => 0, 'total' => 0, 'tempo_1a_resposta_s' => null, 'tempo_resolucao_s' => null, 'em_andamento' => 0];
    $f = rel_t('atendimentos'); if (!$f) return $vazio;
    $cri = rel_col($f, ['criado', 'aberto_em', 'criado_em', 'inicio', 'ts']); if (!$cri) return $vazio;
    $res = rel_col($f, ['resolvido_em', 'finalizado_em', 'fechado_em', 'encerrado_em']);
    $pri = rel_col($f, ['primeira_resp_em', 'primeira_resposta', 'primeira_resposta_em', 'primeira_resp', 'respondido_em']);
    $st = rel_col($f, ['status']); $fil = rel_col($f, ['fila_id', 'fila']); $atd = rel_col($f, ['atendente_id', 'usuario_id', 'atendente']);
    [$ci, $pi] = rel_inst($f);
    $selRes = $res ? "SUM(CASE WHEN $res IS NOT NULL AND $res>0 THEN 1 ELSE 0 END)" : '0';
    $selAnd = $st ? "SUM(CASE WHEN $st IN ('aberto','em_atendimento','andamento','aguardando') THEN 1 ELSE 0 END)" : '0';
    $selPri = $pri ? "AVG(CASE WHEN $pri IS NOT NULL AND $pri>=$cri THEN $pri-$cri END)" : 'NULL';
    $selTr = $res ? "AVG(CASE WHEN $res IS NOT NULL AND $res>=$cri THEN $res-$cri END)" : 'NULL';
    $sel = "COUNT(*) total, $selRes resolvidos, $selAnd andamento, $selPri t1, $selTr tr";
    $fmt = fn($x) => ['total' => (int)$x['total'], 'abertos' => (int)$x['total'], 'resolvidos' => (int)$x['resolvidos'], 'em_andamento' => (int)$x['andamento'],
        'tempo_1a_resposta_s' => $x['t1'] !== null ? (int)round((float)$x['t1']) : null, 'tempo_resolucao_s' => $x['tr'] !== null ? (int)round((float)$x['tr']) : null];
    $w = "$ci AND $cri>=? AND $cri<?"; $pr = array_merge($pi, [$a, $b]);
    if ($agrupar === null) { $x = rel_sql($f, "SELECT $sel FROM atendimentos WHERE $w", $pr)[0] ?? null; return ['disponivel' => true] + ($x ? $fmt($x) : $vazio); }
    if ($agrupar === 'dia') {
        $out = []; foreach (rel_sql($f, 'SELECT ' . rel_dt($f, 'dia', $cri) . " d, COUNT(*) c FROM atendimentos WHERE $w GROUP BY d", $pr) as $x) $out[$x['d']] = (int)$x['c'];
        return ['disponivel' => true, 'dias' => $out];
    }
    $g = $agrupar === 'fila' ? $fil : $atd; if (!$g) return ['disponivel' => true, 'grupos' => []];
    $l = [];
    foreach (rel_sql($f, "SELECT $g k, $sel FROM atendimentos WHERE $w GROUP BY $g ORDER BY total DESC LIMIT 200", $pr) as $x) $l[] = ['k' => $x['k']] + $fmt($x);
    return ['disponivel' => true, 'grupos' => $l];
}
/** Mapa id -> nome (filas ou usuários). */
function rel_nomes(string $tabela): array {
    $f = rel_t($tabela); if (!$f || !in_array('nome', $f['cols'], true) || !in_array('id', $f['cols'], true)) return [];
    [$ci, $pi] = rel_inst($f); $m = [];
    try { foreach (rel_sql($f, "SELECT id,nome FROM $tabela WHERE $ci LIMIT 2000", $pi) as $x) $m[(string)$x['id']] = (string)$x['nome']; } catch (Throwable $e) {}
    return $m;
}
/** Atividade por usuário a partir de `auditoria` (respeita escopo). */
function rel_usuarios(int $a, int $b): array {
    $f = rel_t('auditoria'); if (!$f) return [];
    $esc = rel_escopo(); $w = 'a.instancia=? AND a.ts>=? AND a.ts<? AND a.usuario_id IS NOT NULL'; $p = [inst(), $a, $b];
    if ($esc !== null) { $w .= ' AND a.usuario_id=?'; $p[] = $esc; }
    $in = implode(',', array_map(fn($x) => "'$x'", REL_ACOES_ENVIO)); $ag = "'agendar_texto','agendar_midia'";
    $sql = "SELECT a.usuario_id id, MAX(a.usuario) usuario, MAX(u.nome) nome,
        SUM(CASE WHEN a.acao<>'visita' THEN 1 ELSE 0 END) acoes, SUM(CASE WHEN a.acao<>'visita' AND a.ok=0 THEN 1 ELSE 0 END) erros,
        SUM(CASE WHEN a.acao IN ($in) AND a.ok=1 THEN 1 ELSE 0 END) envios, SUM(CASE WHEN a.acao IN ($ag) AND a.ok=1 THEN 1 ELSE 0 END) agendamentos,
        SUM(CASE WHEN a.acao='visita' THEN 1 ELSE 0 END) telas, MAX(a.ts) ultima
        FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE $w GROUP BY a.usuario_id ORDER BY acoes DESC LIMIT 200";
    $l = [];
    foreach (rel_sql($f, $sql, $p) as $x) $l[] = ['id' => (int)$x['id'], 'usuario' => (string)$x['usuario'], 'nome' => (string)($x['nome'] ?: $x['usuario']), 'acoes' => (int)$x['acoes'], 'erros' => (int)$x['erros'],
        'envios' => (int)$x['envios'], 'agendamentos' => (int)$x['agendamentos'], 'telas' => (int)$x['telas'], 'ultima_ts' => (int)$x['ultima']];
    return $l;
}
/** Telas mais abertas (auditoria acao='visita', detalhe 'abriu: x'). */
function rel_telas(int $a, int $b): array {
    $f = rel_t('auditoria'); if (!$f) return [];
    $esc = rel_escopo(); $w = "instancia=? AND acao='visita' AND ts>=? AND ts<?"; $p = [inst(), $a, $b];
    if ($esc !== null) { $w .= ' AND usuario_id=?'; $p[] = $esc; }
    $l = [];
    foreach (rel_sql($f, "SELECT detalhe d, COUNT(*) c FROM auditoria WHERE $w GROUP BY detalhe ORDER BY c DESC LIMIT 10", $p) as $x) $l[] = ['tela' => trim(preg_replace('/^abriu:\s*/', '', (string)$x['d'])), 'aberturas' => (int)$x['c']];
    return $l;
}
/** Matriz 7 (dom..sáb) x 24 de mensagens (eventos; fallback envios). */
function rel_matriz(int $a, int $b, string $dir): array {
    $m = array_fill(0, 7, array_fill(0, 24, 0)); $fonte = 'nenhuma'; $fe = rel_t('eventos');
    if ($fe) {
        $cond = $dir === 'enviadas' ? 'AND from_me=1' : ($dir === 'recebidas' ? 'AND from_me=0' : '');
        $rows = rel_sql($fe, 'SELECT ' . rel_dt($fe, 'dow', 'ts') . ' w,' . rel_dt($fe, 'hora', 'ts') . " h, COUNT(DISTINCT msg_id) c FROM eventos WHERE instancia=? AND ts>=? AND ts<? AND evento IN ('MESSAGES_UPSERT','SEND_MESSAGE') AND msg_id IS NOT NULL $cond GROUP BY w,h", [inst(), $a, $b]);
        foreach ($rows as $x) $m[(int)$x['w']][(int)$x['h']] += (int)$x['c'];
        if ($rows) $fonte = 'eventos';
    }
    if ($fonte === 'nenhuma' && $dir !== 'recebidas' && ($fv = rel_t('envios'))) {
        [$ci, $pi] = rel_inst($fv);
        foreach (rel_sql($fv, 'SELECT ' . rel_dt($fv, 'dow', 'quando') . ' w,' . rel_dt($fv, 'hora', 'quando') . " h, COUNT(*) c FROM envios WHERE $ci AND ok=1 AND quando>=? AND quando<? GROUP BY w,h", array_merge($pi, [$a, $b])) as $x) $m[(int)$x['w']][(int)$x['h']] += (int)$x['c'];
        $fonte = 'envios';
    }
    return [$m, $fonte];
}
function rel_dir(): string { $d = (string)($_GET['direcao'] ?? 'todas'); return in_array($d, ['todas', 'enviadas', 'recebidas'], true) ? $d : 'todas'; }

/** Monta o resumo de um período (usado no atual e no anterior). */
function rel_bloco(array $p, int $a, int $b, bool $completo): array {
    $env = rel_envios($a, $b); $at = rel_atend($a, $b);
    $camp = ['disponivel' => $env['disponivel'], 'enviadas' => $env['por_origem']['campanha'] ?? 0, 'falhas' => 0, 'criadas' => 0];
    if ($env['disponivel']) {
        $f = rel_t('envios'); [$ci, $pi] = rel_inst($f);
        $camp['falhas'] = (int)(rel_sql($f, "SELECT COUNT(*) c FROM envios WHERE $ci AND origem='campanha' AND ok=0 AND quando>=? AND quando<?", array_merge($pi, [$a, $b]))[0]['c'] ?? 0);
        $camp['enviadas'] = max(0, $camp['enviadas'] - $camp['falhas']);
    }
    if ($fc = rel_t('campanhas')) { if ($cc = rel_col($fc, ['criado', 'criada_em', 'criado_em'])) { [$ci, $pi] = rel_inst($fc); $camp['criadas'] = (int)(rel_sql($fc, "SELECT COUNT(*) c FROM campanhas WHERE $ci AND $cc>=? AND $cc<?", array_merge($pi, [$a, $b]))[0]['c'] ?? 0); } }
    [$dias, $fonte] = rel_msgs_dia(null, $a, $b);
    $enviadas = array_sum(array_column($dias, 'enviadas')); $recebidas = array_sum(array_column($dias, 'recebidas'));
    return ['envios' => $env, 'atendimentos' => $at, 'campanhas' => $camp, 'mensagens' => ['enviadas' => $enviadas, 'recebidas' => $recebidas, 'fonte' => $fonte]];
}

/** Escapa célula de CSV (neutraliza fórmulas). */
function rel_cel($v): string {
    $v = str_replace(["\r\n", "\r", "\n"], ' ', (string)$v);
    if ($v !== '' && strpos("=+-@\t", $v[0]) !== false) $v = "'" . $v;
    return '"' . str_replace('"', '""', $v) . '"';
}
function rel_dow_nome(int $i): string { return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][$i] ?? ''; }

return [
    'rel_resumo' => function () {
        $p = rel_periodo();
        rel_cache('resumo', function () use ($p) {
            $cur = rel_bloco($p, $p['a'], $p['b'], true); $ant = rel_bloco($p, $p['pa'], $p['pb'], false);
            $var = [
                'enviados_total' => rel_var($cur['envios']['total'], $ant['envios']['total']),
                'enviados_falha' => rel_var($cur['envios']['falha'], $ant['envios']['falha']),
                'mensagens_enviadas' => rel_var($cur['mensagens']['enviadas'], $ant['mensagens']['enviadas']),
                'mensagens_recebidas' => rel_var($cur['mensagens']['recebidas'], $ant['mensagens']['recebidas']),
                'atendimentos' => rel_var($cur['atendimentos']['total'], $ant['atendimentos']['total']),
                'atendimentos_resolvidos' => rel_var($cur['atendimentos']['resolvidos'], $ant['atendimentos']['resolvidos']),
                'campanhas_enviadas' => rel_var($cur['campanhas']['enviadas'], $ant['campanhas']['enviadas']),
                'campanhas_falhas' => rel_var($cur['campanhas']['falhas'], $ant['campanhas']['falhas']),
            ];
            $usu = rel_usuarios($p['a'], $p['b']);
            $nomesF = rel_nomes('filas'); $porFila = rel_atend($p['a'], $p['b'], 'fila');
            foreach ($porFila['grupos'] ?? [] as &$g) $g['nome'] = $nomesF[(string)$g['k']] ?? ($g['k'] === null ? 'Sem fila' : 'Fila ' . $g['k']); unset($g);
            $porAt = rel_atend($p['a'], $p['b'], 'atendente'); $nomesU = rel_nomes('usuarios');
            foreach ($porAt['grupos'] ?? [] as &$g) $g['nome'] = $nomesU[(string)$g['k']] ?? ($g['k'] === null ? 'Sem atendente' : 'Usuário ' . $g['k']); unset($g);
            return ['periodo' => ['de' => $p['de'], 'ate' => $p['ate'], 'dias' => $p['n']],
                'anterior' => ['de' => rel_dias($p['pa'], $p['pb'])[0], 'ate' => rel_dias($p['pa'], $p['pb'])[$p['n'] - 1], 'dados' => $ant],
                'atual' => $cur, 'variacao' => $var,
                'por_fila' => $porFila['grupos'] ?? [], 'por_atendente' => $porAt['grupos'] ?? [],
                'atividade' => ['escopo' => rel_escopo() === null ? 'todos' : 'proprio', 'usuarios' => $usu, 'top_telas' => rel_telas($p['a'], $p['b'])]];
        });
    },
    'rel_por_dia' => function () {
        $p = rel_periodo(); $serie = (string)($_GET['serie'] ?? 'todas'); if (!in_array($serie, ['todas', 'enviadas', 'recebidas', 'atendimentos'], true)) $serie = 'todas';
        rel_cache('por_dia', function () use ($p, $serie) {
            [$dias, $fonte] = rel_msgs_dia($p, $p['a'], $p['b']); $at = rel_atend($p['a'], $p['b'], 'dia')['dias'] ?? [];
            $l = [];
            foreach ($p['dias'] as $d) {
                $x = ['dia' => $d];
                if ($serie === 'todas' || $serie === 'enviadas') $x['enviadas'] = $dias[$d]['enviadas'];
                if ($serie === 'todas' || $serie === 'recebidas') $x['recebidas'] = $dias[$d]['recebidas'];
                if ($serie === 'todas' || $serie === 'atendimentos') $x['atendimentos'] = $at[$d] ?? 0;
                $l[] = $x;
            }
            return ['periodo' => ['de' => $p['de'], 'ate' => $p['ate'], 'dias' => $p['n']], 'serie' => $serie, 'fonte' => $fonte, 'atendimentos_disponivel' => rel_t('atendimentos') !== null, 'dias' => $l];
        });
    },
    'rel_por_usuario' => function () {
        $p = rel_periodo();
        rel_cache('por_usuario', fn() => ['periodo' => ['de' => $p['de'], 'ate' => $p['ate'], 'dias' => $p['n']], 'escopo' => rel_escopo() === null ? 'todos' : 'proprio',
            'usuarios' => rel_usuarios($p['a'], $p['b']), 'top_telas' => rel_telas($p['a'], $p['b']), 'atendentes' => (function () use ($p) {
                $g = rel_atend($p['a'], $p['b'], 'atendente'); $n = rel_nomes('usuarios'); $e = rel_escopo(); $l = [];
                foreach ($g['grupos'] ?? [] as $x) { if ($e !== null && (string)$x['k'] !== (string)$e) continue; $x['nome'] = $n[(string)$x['k']] ?? ($x['k'] === null ? 'Sem atendente' : 'Usuário ' . $x['k']); $l[] = $x; }
                return $l; })()]);
    },
    'rel_por_fila' => function () {
        $p = rel_periodo();
        rel_cache('por_fila', function () use ($p) {
            $g = rel_atend($p['a'], $p['b'], 'fila'); $n = rel_nomes('filas'); $l = [];
            foreach ($g['grupos'] ?? [] as $x) { $x['nome'] = $n[(string)$x['k']] ?? ($x['k'] === null ? 'Sem fila' : 'Fila ' . $x['k']); $l[] = $x; }
            return ['periodo' => ['de' => $p['de'], 'ate' => $p['ate'], 'dias' => $p['n']], 'disponivel' => $g['disponivel'], 'filas' => $l];
        });
    },
    'rel_horarios' => function () {
        $p = rel_periodo(); $dir = rel_dir();
        rel_cache('horarios', function () use ($p, $dir) {
            [$m, $fonte] = rel_matriz($p['a'], $p['b'], $dir); $max = 0; foreach ($m as $r) $max = max($max, max($r));
            $porHora = array_fill(0, 24, 0); foreach ($m as $r) foreach ($r as $h => $c) $porHora[$h] += $c;
            return ['periodo' => ['de' => $p['de'], 'ate' => $p['ate'], 'dias' => $p['n']], 'direcao' => $dir, 'fonte' => $fonte, 'dias_semana' => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
                'matriz' => $m, 'max' => $max, 'por_hora' => $porHora, 'total' => array_sum($porHora)];
        });
    },
    // CSV (BOM, ';', fórmulas neutralizadas). tipo: envios | por_dia | por_usuario | por_fila | horarios | atendimentos
    'rel_exportar' => function () {
        $p = rel_periodo(); $tipo = (string)($_GET['tipo'] ?? 'envios');
        if (!in_array($tipo, ['envios', 'por_dia', 'por_usuario', 'por_fila', 'horarios', 'atendimentos'], true)) out(['ok' => false, 'msg' => 'Tipo de relatório inválido.'], 400);
        $cab = []; $linhas = [];
        $dt = fn($ts) => [date('d/m/Y', (int)$ts), date('H:i:s', (int)$ts)];
        date_default_timezone_set('America/Maceio');
        if ($tipo === 'envios') {
            $cab = ['ID', 'Data', 'Hora', 'Origem', 'Tipo', 'Destino (JID)', 'Resultado', 'Erro'];
            if ($f = rel_t('envios')) { [$ci, $pi] = rel_inst($f);
                foreach (rel_sql($f, "SELECT id,quando,origem,tipo,jid,ok,erro FROM envios WHERE $ci AND quando>=? AND quando<? ORDER BY quando DESC, id DESC LIMIT " . REL_LIMITE_CSV, array_merge($pi, [$p['a'], $p['b']])) as $x)
                    $linhas[] = array_merge([$x['id']], $dt($x['quando']), [$x['origem'], $x['tipo'], $x['jid'], $x['ok'] ? 'Sucesso' : 'Erro', $x['erro']]); }
        } elseif ($tipo === 'por_dia') {
            $cab = ['Dia', 'Mensagens enviadas', 'Mensagens recebidas', 'Atendimentos'];
            [$dias] = rel_msgs_dia($p, $p['a'], $p['b']); $at = rel_atend($p['a'], $p['b'], 'dia')['dias'] ?? [];
            foreach ($p['dias'] as $d) $linhas[] = [date('d/m/Y', strtotime($d)), $dias[$d]['enviadas'], $dias[$d]['recebidas'], $at[$d] ?? 0];
        } elseif ($tipo === 'por_usuario') {
            $cab = ['Usuário', 'Nome', 'Ações', 'Erros', 'Envios', 'Agendamentos', 'Telas abertas', 'Última atividade'];
            foreach (rel_usuarios($p['a'], $p['b']) as $u) $linhas[] = [$u['usuario'], $u['nome'], $u['acoes'], $u['erros'], $u['envios'], $u['agendamentos'], $u['telas'], date('d/m/Y H:i', $u['ultima_ts'])];
        } elseif ($tipo === 'por_fila' || $tipo === 'atendimentos') {
            $cab = ['Fila', 'Atendimentos', 'Resolvidos', 'Em andamento', '1ª resposta (s)', 'Resolução (s)'];
            $n = rel_nomes('filas');
            foreach (rel_atend($p['a'], $p['b'], 'fila')['grupos'] ?? [] as $x) $linhas[] = [$n[(string)$x['k']] ?? ($x['k'] === null ? 'Sem fila' : 'Fila ' . $x['k']), $x['total'], $x['resolvidos'], $x['em_andamento'], $x['tempo_1a_resposta_s'] ?? '', $x['tempo_resolucao_s'] ?? ''];
        } else {
            $cab = array_merge(['Dia da semana'], array_map(fn($h) => sprintf('%02dh', $h), range(0, 23)));
            [$m] = rel_matriz($p['a'], $p['b'], rel_dir());
            foreach ($m as $i => $r) $linhas[] = array_merge([rel_dow_nome($i)], $r);
        }
        aud_detalhe("exportou $tipo {$p['de']}..{$p['ate']} (" . count($linhas) . ' linhas)');
        header_remove('Content-Type');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="zapzap-relatorio-' . $tipo . '-' . $p['de'] . '_' . $p['ate'] . '.csv"');
        echo "\xEF\xBB\xBF" . implode(';', array_map('rel_cel', $cab)) . "\r\n";
        foreach ($linhas as $l) echo implode(';', array_map('rel_cel', $l)) . "\r\n";
        exit;
    },
    '__perms' => [
        'rel_resumo' => 'relatorios.ver', 'rel_por_dia' => 'relatorios.ver', 'rel_por_usuario' => 'relatorios.ver',
        'rel_por_fila' => 'relatorios.ver', 'rel_horarios' => 'relatorios.ver', 'rel_exportar' => 'relatorios.exportar',
    ],
];
