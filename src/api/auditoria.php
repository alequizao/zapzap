<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Auditoria: linha do tempo de atividades, resumo e exportação CSV.
// Master vê tudo; os demais veem somente as PRÓPRIAS ações.

/** Mapa extensível: ação técnica => [rótulo amigável, categoria]. Ação desconhecida cai em regras por prefixo e, por fim, no nome técnico. */
function aud_mapa(): array {
    return [
        'login' => ['Entrou no painel', 'login'], 'sair' => ['Saiu do painel', 'login'], 'trocar_senha' => ['Trocou a senha', 'login'],
        'visita' => ['Abriu uma página', 'nav'],
        'enviar_texto' => ['Enviou texto', 'envio'], 'enviar_midia' => ['Enviou mídia', 'envio'], 'enviar_enquete' => ['Enviou enquete', 'envio'],
        'enviar_localizacao' => ['Enviou localização', 'envio'], 'enviar_contato' => ['Enviou contato', 'envio'], 'presenca' => ['Mostrou presença (digitando)', 'envio'],
        'agendar_texto' => ['Agendou texto', 'envio'], 'agendar_midia' => ['Agendou mídia', 'envio'], 'cancelar_agendada' => ['Cancelou mensagem agendada', 'envio'],
        'reagendar' => ['Reagendou mensagem', 'envio'], 'enviar_agora' => ['Enviou agendada agora', 'envio'], 'marcar_lida' => ['Marcou conversa como lida', 'envio'],
        'midia' => ['Baixou mídia de conversa', 'envio'], 'exportar_csv' => ['Exportou histórico (CSV)', 'envio'], 'verificar_numero' => ['Verificou número', 'envio'],
        'convite' => ['Consultou link de convite', 'envio'],
        'config_salvar' => ['Alterou configurações', 'config'], 'reiniciar' => ['Reiniciou a conexão', 'conexao'], 'qr' => ['Gerou QR code', 'conexao'],
        'perfil_nome' => ['Alterou o nome do perfil', 'config'], 'perfil_status' => ['Alterou o recado do perfil', 'config'],
        'webhook_ligar' => ['Ligou o tempo real', 'config'], 'webhook_desligar' => ['Desligou o tempo real', 'config'],
        'instancia_criar' => ['Criou conexão', 'conexao'], 'instancia_qr' => ['Gerou QR code da conexão', 'conexao'], 'instancia_apelido' => ['Renomeou conexão', 'conexao'],
        'instancia_desconectar' => ['Desconectou conexão', 'conexao'], 'instancia_excluir' => ['Excluiu conexão', 'conexao'],
        'exportar_auditoria_csv' => ['Exportou auditoria (CSV)', 'config'], 'rel_auditoria_csv' => ['Exportou auditoria (CSV)', 'config'], 'rel_exportar' => ['Exportou relatório', 'config'],
    ];
}
/** Verbo técnico -> passado amigável (usado no fallback de ações sem rótulo no mapa). */
function aud_frase(string $acao): string {
    $v = ['salvar' => 'Salvou', 'excluir' => 'Excluiu', 'criar' => 'Criou', 'ativar' => 'Ativou', 'desativar' => 'Desativou', 'testar' => 'Testou', 'marcar' => 'Marcou', 'iniciar' => 'Iniciou', 'pausar' => 'Pausou', 'atender' => 'Atendeu', 'transferir' => 'Transferiu', 'encerrar' => 'Encerrou', 'importar' => 'Importou', 'gerar' => 'Gerou', 'revogar' => 'Revogou', 'editar' => 'Editou'];
    $p = explode('_', $acao); $x = array_shift($p);
    return isset($v[$x]) ? $v[$x] . ' ' . implode(' ', $p) : ucfirst(str_replace('_', ' ', $acao));
}
/** [rótulo, categoria] de uma ação. */
function aud_info(string $acao): array {
    $m = aud_mapa();
    if (isset($m[$acao])) return $m[$acao];
    if (preg_match('/usuario|senha_usuario|permiss/', $acao)) return [aud_frase($acao), 'usuarios'];
    if (preg_match('/^(instancia|conexao)/', $acao)) return [aud_frase($acao), 'conexao'];
    if (preg_match('/^(enviar|agendar|campanha|iniciar_campanha|atender|transferir|marcar)/', $acao)) return [aud_frase($acao), 'envio'];
    if (preg_match('/^(salvar|excluir|ativar|desativar|criar|editar|testar|config|importar|gerar|revogar)/', $acao)) return [aud_frase($acao), 'config'];
    return [aud_frase($acao), 'outros'];
}
function aud_cats(): array {
    return ['login' => 'Acessos', 'envio' => 'Envios', 'config' => 'Configuração', 'usuarios' => 'Usuários', 'conexao' => 'Conexões', 'nav' => 'Navegação', 'outros' => 'Outros'];
}
function aud_dia(string $s, bool $fim): ?int {
    $s = trim($s); if ($s === '') return null;
    if (ctype_digit($s) && strlen($s) >= 9) return (int)$s;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null;
    try { $d = new DateTime($s . ($fim ? ' 23:59:59' : ' 00:00:00'), new DateTimeZone('America/Maceio')); return $d->getTimestamp(); } catch (Throwable $e) { return null; }
}
/** Monta WHERE a partir dos filtros GET. Master = tudo; outros = só as próprias ações. */
function aud_where(array $o = []): array {
    $w = ['1=1']; $p = [];
    if (!usuario_atual()['master']) { $w[] = 'a.usuario_id = ?'; $p[] = uid(); }
    elseif (($u = (int)($_GET['usuario_id'] ?? 0)) > 0) { $w[] = 'a.usuario_id = ?'; $p[] = $u; }
    $ac = trim((string)($_GET['acao'] ?? ''));
    if ($ac !== '') {
        if (str_starts_with($ac, 'cat:')) {
            $cat = substr($ac, 4); $lst = [];
            foreach (bd()->query('SELECT DISTINCT acao FROM auditoria')->fetchAll(PDO::FETCH_COLUMN) as $x) if (aud_info((string)$x)[1] === $cat) $lst[] = (string)$x;
            foreach (aud_mapa() as $k => $v) if ($v[1] === $cat) $lst[] = $k;
            $lst = array_values(array_unique($lst));
            if (!$lst) $lst = ['__nenhuma__'];
            $w[] = 'a.acao IN (' . implode(',', array_fill(0, count($lst), '?')) . ')'; array_push($p, ...$lst);
        } elseif (preg_match('/^[a-z0-9_]{1,60}$/i', $ac)) { $w[] = 'a.acao = ?'; $p[] = $ac; }
    } elseif (empty($o['com_nav']) && ($_GET['nav'] ?? '') !== '1') { $w[] = "a.acao <> 'visita'"; }
    $ok = (string)($_GET['ok'] ?? '');
    if ($ok === '0' || $ok === '1') { $w[] = 'a.ok = ?'; $p[] = (int)$ok; }
    $in = trim((string)($_GET['instancia'] ?? ''));
    if ($in !== '' && preg_match('/^[A-Za-z0-9_\-]{1,40}$/', $in)) { $w[] = 'a.instancia = ?'; $p[] = $in; }
    elseif (!usuario_atual()['master']) {
        $perm = instancias_permitidas();
        if ($perm) { $w[] = '(a.instancia IS NULL OR a.instancia IN (' . implode(',', array_fill(0, count($perm), '?')) . '))'; array_push($p, ...$perm); }
    }
    if (($t = aud_dia((string)($_GET['de'] ?? ''), false)) !== null) { $w[] = 'a.ts >= ?'; $p[] = $t; }
    if (($t = aud_dia((string)($_GET['ate'] ?? ''), true)) !== null) { $w[] = 'a.ts <= ?'; $p[] = $t; }
    $q = trim(mb_substr((string)($_GET['q'] ?? ''), 0, 80));
    if ($q !== '') {
        $e = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $w[] = "(a.detalhe LIKE ? ESCAPE '\\\\' OR a.usuario LIKE ? ESCAPE '\\\\' OR a.ip LIKE ? ESCAPE '\\\\' OR a.acao LIKE ? ESCAPE '\\\\' OR u.nome LIKE ? ESCAPE '\\\\')";
        array_push($p, $e, $e, $e, $e, $e);
    }
    return ['WHERE ' . implode(' AND ', $w), $p];
}
function aud_linha(array $r): array {
    [$rot, $cat] = aud_info((string)$r['acao']);
    $det = (string)($r['detalhe'] ?? '');
    if ($r['acao'] === 'login' && (int)$r['ok'] === 1) $det = $det !== '' ? 'Navegador: ' . mb_substr($det, 0, 90) : '';
    return ['id' => (int)$r['id'], 'ts' => (int)$r['ts'], 'usuario_id' => $r['usuario_id'] !== null ? (int)$r['usuario_id'] : null,
        'usuario' => (string)($r['usuario'] ?? ''), 'nome' => (string)($r['nome'] ?? $r['usuario'] ?? ''), 'ip' => (string)($r['ip'] ?? ''),
        'instancia' => (string)($r['instancia'] ?? ''), 'acao' => $r['acao'], 'rotulo' => $rot, 'cat' => $cat, 'ok' => (int)$r['ok'] === 1, 'detalhe' => $det];
}
/** Neutraliza fórmulas de planilha (CSV injection). */
function aud_csv_cel($v): string {
    $s = str_replace(["\r", "\n"], ' ', (string)$v);
    if ($s !== '' && preg_match('/^[=+\-@\t]/', $s)) $s = "'" . $s;
    return '"' . str_replace('"', '""', $s) . '"';
}
function aud_csv(): never {
    [$where, $p] = aud_where();
    $st = bd()->prepare("SELECT a.*, u.nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id $where ORDER BY a.ts DESC, a.id DESC LIMIT 20000");
    $st->execute($p);
    auditar('exportar_auditoria_csv', true, 'exportou o registro de atividades');
    header_remove('Content-Type');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="zapzap-auditoria-' . (new DateTime('now', new DateTimeZone('America/Maceio')))->format('Y-m-d') . '.csv"');
    echo "\xEF\xBB\xBF" . implode(';', array_map('aud_csv_cel', ['Data/hora', 'Usuário', 'Nome', 'Ação', 'Ação (técnica)', 'Categoria', 'Resultado', 'Conexão', 'IP', 'Detalhe'])) . "\r\n";
    $tz = new DateTimeZone('America/Maceio'); $cats = aud_cats();
    foreach ($st->fetchAll() as $r) {
        $l = aud_linha($r); $d = (new DateTime('@' . $l['ts']))->setTimezone($tz)->format('d/m/Y H:i:s');
        echo implode(';', array_map('aud_csv_cel', [$d, $l['usuario'], $l['nome'], $l['rotulo'], $l['acao'], $cats[$l['cat']] ?? $l['cat'], $l['ok'] ? 'OK' : 'Falha', $l['instancia'], $l['ip'], $l['detalhe']])) . "\r\n";
    }
    exit;
}

return [
    '__perms' => ['listar_auditoria' => 'auditoria.ver', 'rel_auditoria_resumo' => 'auditoria.ver', 'exportar_auditoria_csv' => 'auditoria.ver', 'rel_auditoria_csv' => 'auditoria.ver'],

    'listar_auditoria' => function () {
        [$where, $p] = aud_where();
        $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 50;
        $st = bd()->prepare("SELECT COUNT(*) FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id $where"); $st->execute($p);
        $total = (int)$st->fetchColumn();
        $st = bd()->prepare("SELECT a.*, u.nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id $where ORDER BY a.ts DESC, a.id DESC LIMIT $por OFFSET " . (($pag - 1) * $por));
        $st->execute($p);
        $itens = array_map('aud_linha', $st->fetchAll());
        // Alerta: falhas de login na última hora (por IP), no escopo do usuário (master vê todas).
        $al = bd()->prepare("SELECT ip, COUNT(*) n, MAX(ts) ult FROM auditoria WHERE acao='login' AND ok=0 AND ts >= ? " . (usuario_atual()['master'] ? '' : 'AND usuario_id = ' . (int)uid()) . ' GROUP BY ip HAVING n >= 3 ORDER BY n DESC LIMIT 5');
        $al->execute([time() - 3600]);
        $alerta = array_map(fn($r) => ['ip' => (string)$r['ip'], 'n' => (int)$r['n'], 'ultima' => (int)$r['ult']], $al->fetchAll());
        out(['ok' => true, 'total' => $total, 'pag' => $pag, 'paginas' => max(1, (int)ceil($total / $por)), 'tem_mais' => $pag * $por < $total,
             'itens' => $itens, 'alerta_login' => $alerta, 'master' => (bool)usuario_atual()['master'], 'agora' => time(),
             'categorias' => aud_cats()]);
    },

    'rel_auditoria_resumo' => function () {
        $_GET['acao'] = ''; // o resumo ignora o filtro de ação (para os chips mostrarem todas as categorias)
        [$where, $p] = aud_where(['com_nav' => false]);
        $cats = []; $usr = []; $ac = [];
        $st = bd()->prepare("SELECT a.acao, a.usuario_id, COALESCE(u.nome, a.usuario, '—') nome, COUNT(*) n, SUM(a.ok=0) f FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id $where GROUP BY a.acao, a.usuario_id, nome");
        $st->execute($p);
        $total = 0; $falhas = 0;
        foreach ($st->fetchAll() as $r) {
            $n = (int)$r['n']; $f = (int)$r['f']; $total += $n; $falhas += $f;
            [$rot, $cat] = aud_info((string)$r['acao']);
            $cats[$cat] = ($cats[$cat] ?? 0) + $n;
            $k = (string)$r['usuario_id'] . '|' . $r['nome']; $usr[$k] = ['usuario_id' => $r['usuario_id'] !== null ? (int)$r['usuario_id'] : null, 'nome' => $r['nome'], 'n' => ($usr[$k]['n'] ?? 0) + $n, 'falhas' => ($usr[$k]['falhas'] ?? 0) + $f];
            $ac[$r['acao']] = ['acao' => $r['acao'], 'rotulo' => $rot, 'n' => ($ac[$r['acao']]['n'] ?? 0) + $n];
        }
        $nomes = aud_cats(); $porTipo = [];
        foreach ($cats as $c => $n) $porTipo[] = ['cat' => $c, 'rotulo' => $nomes[$c] ?? $c, 'n' => $n];
        usort($porTipo, fn($a, $b) => $b['n'] <=> $a['n']);
        $usr = array_values($usr); usort($usr, fn($a, $b) => $b['n'] <=> $a['n']);
        $ac = array_values($ac); usort($ac, fn($a, $b) => $b['n'] <=> $a['n']);
        // Falhas de login por IP
        $w2 = str_replace('1=1', "a.acao='login' AND a.ok=0", $where);
        $st = bd()->prepare("SELECT a.ip, COUNT(*) n, MAX(a.ts) ult FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id $w2 GROUP BY a.ip ORDER BY n DESC LIMIT 5");
        $st->execute($p);
        $fl = array_map(fn($r) => ['ip' => (string)$r['ip'], 'n' => (int)$r['n'], 'ultima' => (int)$r['ult']], $st->fetchAll());
        $totLogin = 0; foreach ($fl as $x) $totLogin += $x['n'];
        // Picos: atividade por hora do dia (fuso Maceió, -3 h) e dia mais movimentado
        $st = bd()->prepare("SELECT FROM_UNIXTIME(a.ts - 10800, '%H') h, COUNT(*) n FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id $where GROUP BY h");
        $st->execute($p); $horas = array_fill(0, 24, 0);
        foreach ($st->fetchAll() as $r) $horas[(int)$r['h']] = (int)$r['n'];
        $st = bd()->prepare("SELECT FROM_UNIXTIME(a.ts - 10800, '%Y-%m-%d') d, COUNT(*) n FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id $where GROUP BY d ORDER BY n DESC LIMIT 1");
        $st->execute($p); $dp = $st->fetch();
        $hp = array_keys($horas, max($horas));
        out(['ok' => true, 'total' => $total, 'falhas' => $falhas, 'por_usuario' => array_slice($usr, 0, 10), 'por_tipo' => $porTipo, 'por_acao' => array_slice($ac, 0, 8),
             'falhas_login' => ['total' => $totLogin, 'por_ip' => $fl], 'picos' => ['por_hora' => $horas, 'hora_pico' => max($horas) > 0 ? (int)$hp[0] : null, 'dia_pico' => $dp ? ['dia' => $dp['d'], 'n' => (int)$dp['n']] : null]]);
    },

    'exportar_auditoria_csv' => function () { aud_csv(); },
    // Alias liberado para GET pelo prefixo rel_ (o api.php só aceita GET em ver_/listar_/rel_ ou lista fixa).
    'rel_auditoria_csv' => function () { aud_csv(); },
];
