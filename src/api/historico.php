<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Histórico: lista de envios, status de entrega e exportação CSV.
$hist_nomes = function (): array {
    static $n = null; if ($n !== null) return $n;
    $f = cache_arq('contatos.json');
    $j = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
    $n = [];
    if (is_array($j)) {
        $lista = isset($j['contatos']) && is_array($j['contatos']) ? $j['contatos'] : $j;
        foreach ($lista as $k => $v) { if (is_array($v) && !empty($v['nome'])) $n[is_string($k) ? $k : ($v['jid'] ?? '')] = (string)$v['nome']; }
    }
    return $n;
};
$hist_nome = function (string $jid) use ($hist_nomes): string {
    $n = $hist_nomes();
    if (!empty($n[$jid])) return $n[$jid];
    $num = preg_replace('/\D/', '', explode('@', $jid)[0]);
    if (str_ends_with($jid, '@g.us')) return 'Grupo';
    if (preg_match('/^55(\d\d)(9?\d{4})(\d{4})$/', $num, $m)) return "+55 ($m[1]) $m[2]-$m[3]";
    return $num !== '' ? '+' . $num : $jid;
};
$hist_filtro = function (): array {
    $w = ['instancia = ?']; $p = [inst()];
    $o = (string)($_GET['origem'] ?? '');
    if (in_array($o, ['painel', 'agenda'], true)) { $w[] = 'origem = ?'; $p[] = $o; }
    $ok = (string)($_GET['ok'] ?? '');
    if ($ok === '1' || $ok === '0') { $w[] = 'ok = ?'; $p[] = (int)$ok; }
    $q = trim(mb_substr((string)($_GET['q'] ?? ''), 0, 80));
    if ($q !== '') {
        $esc = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q);
        $w[] = '(resumo LIKE ? OR jid LIKE ? OR tipo LIKE ? OR erro LIKE ? OR usuario LIKE ?)';
        array_push($p, "%$esc%", "%$esc%", "%$esc%", "%$esc%", "%$esc%");
    }
    return ['WHERE ' . implode(' AND ', $w), $p];
};

return [
    'historico' => function () use ($hist_nome, $hist_filtro) {
        [$where, $p] = $hist_filtro();
        $pag = max(1, (int)($_GET['pag'] ?? 1));
        $por = 30;
        $st = bd()->prepare("SELECT COUNT(*) FROM envios $where"); $st->execute($p);
        $total = (int)$st->fetchColumn();
        $paginas = max(1, (int)ceil($total / $por));
        $st = bd()->prepare("SELECT id,quando,origem,jid,tipo,resumo,ok,erro,msg_id,usuario FROM envios $where ORDER BY quando DESC, id DESC LIMIT $por OFFSET " . (($pag - 1) * $por));
        $st->execute($p);
        $itens = [];
        foreach ($st->fetchAll() as $r) {
            $itens[] = ['id' => (int)$r['id'], 'quando' => (int)$r['quando'], 'origem' => $r['origem'], 'jid' => $r['jid'], 'nome' => $hist_nome($r['jid']),
                'tipo' => $r['tipo'], 'resumo' => (string)$r['resumo'], 'ok' => (bool)$r['ok'], 'erro' => (string)$r['erro'], 'msg_id' => (string)$r['msg_id'], 'usuario' => (string)$r['usuario']];
        }
        // Resumo geral (sem filtros) para os contadores do topo.
        $ini = strtotime('today', time());
        $r = bd()->query('SELECT COUNT(*) t, COALESCE(SUM(ok),0) o, COALESCE(SUM(1-ok),0) e, COALESCE(SUM(CASE WHEN quando >= ' . (int)$ini . ' THEN 1 ELSE 0 END),0) h FROM envios WHERE instancia = ' . bd()->quote(inst()))->fetch();
        out(['ok' => true, 'total' => $total, 'pag' => $pag, 'paginas' => $paginas, 'itens' => $itens,
             'resumo' => ['total' => (int)$r['t'], 'sucesso' => (int)$r['o'], 'erro' => (int)$r['e'], 'hoje' => (int)$r['h']]]);
    },

    'status_msg' => function () {
        $id = (int)($_GET['id'] ?? 0);
        $st = bd()->prepare('SELECT jid,msg_id,ok FROM envios WHERE id = ? AND instancia = ?'); $st->execute([$id, inst()]);
        $r = $st->fetch();
        if (!$r) out(['ok' => false, 'msg' => 'Registro não encontrado'], 404);
        if (!$r['ok'] || $r['msg_id'] === '' || $r['msg_id'] === null) out(['ok' => false, 'msg' => 'Este envio não tem mensagem para consultar'], 400);
        [$c, $j] = evo('POST', '/chat/findMessages/' . rawurlencode(inst()), ['where' => ['key' => ['id' => $r['msg_id']]], 'offset' => 5, 'page' => 1], 20);
        if ($c < 200 || $c >= 300) out(['ok' => false, 'msg' => 'Não foi possível consultar o WhatsApp agora'], 502);
        $recs = $j['messages']['records'] ?? (isset($j[0]) ? $j : []);
        $m = null;
        foreach ($recs as $x) { if (($x['key']['id'] ?? '') === $r['msg_id']) { $m = $x; break; } }
        if (!$m) out(['ok' => true, 'status' => 'pend']);
        // Mensagem existe no servidor: no mínimo foi enviada.
        $min = 1;
        $ord = ['PENDING' => 0, 'SERVER_ACK' => 1, 'DELIVERY_ACK' => 2, 'READ' => 3, 'PLAYED' => 3];
        $mx = max($min, isset($m['status']) ? ($ord[$m['status']] ?? 0) : 0);
        foreach ($m['MessageUpdate'] ?? [] as $u) $mx = max($mx, $ord[$u['status'] ?? ''] ?? 0);
        out(['ok' => true, 'status' => ['pend', 'enviada', 'entregue', 'lida'][$mx]]);
    },

    'exportar_csv' => function () use ($hist_nome, $hist_filtro) {
        [$where, $p] = $hist_filtro();
        $st = bd()->prepare("SELECT id,quando,origem,jid,tipo,resumo,ok,erro,msg_id,instancia FROM envios $where ORDER BY quando DESC, id DESC LIMIT 50000");
        $st->execute($p);
        header_remove('Content-Type');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="zapzap-historico-' . date('Y-m-d') . '.csv"');
        $cel = function ($v): string {
            $v = str_replace(["\r\n", "\r", "\n"], ' ', (string)$v);
            if ($v !== '' && strpos("=+-@\t", $v[0]) !== false) $v = "'" . $v;
            return '"' . str_replace('"', '""', $v) . '"';
        };
        echo "\xEF\xBB\xBF";
        echo implode(';', array_map($cel, ['ID', 'Data', 'Hora', 'Origem', 'Destinatário', 'Número/JID', 'Tipo', 'Resumo', 'Resultado', 'Erro', 'ID da mensagem', 'Instância'])) . "\r\n";
        date_default_timezone_set('America/Maceio');
        foreach ($st as $r) {
            echo implode(';', array_map($cel, [$r['id'], date('d/m/Y', (int)$r['quando']), date('H:i:s', (int)$r['quando']), $r['origem'], $hist_nome($r['jid']), $r['jid'], $r['tipo'], $r['resumo'], $r['ok'] ? 'Sucesso' : 'Erro', $r['erro'], $r['msg_id'], $r['instancia']])) . "\r\n";
        }
        exit;
    },
];
