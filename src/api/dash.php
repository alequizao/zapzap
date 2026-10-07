<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
require_once __DIR__ . '/../cortes.php';
// ZapZap — módulo Painel: ação `dash` (resumo geral). Resiliente: se a Evolution falhar, devolve ok:true zerado com `aviso`.

/** Texto e tipo resumidos de uma mensagem da Evolution. */
function dash_resumo_msg(array $m): array {
    $t = (string)($m['messageType'] ?? '');
    $c = is_array($m['message'] ?? null) ? $m['message'] : [];
    $tipos = [
        'imageMessage' => 'imagem', 'videoMessage' => 'video', 'audioMessage' => 'audio', 'documentMessage' => 'documento',
        'documentWithCaptionMessage' => 'documento', 'stickerMessage' => 'figurinha', 'contactMessage' => 'contato',
        'contactsArrayMessage' => 'contato', 'locationMessage' => 'localizacao', 'liveLocationMessage' => 'localizacao',
        'pollCreationMessage' => 'enquete', 'pollCreationMessageV3' => 'enquete', 'reactionMessage' => 'reacao',
    ];
    $tipo = in_array($t, ['conversation', 'extendedTextMessage'], true) ? 'texto' : ($tipos[$t] ?? 'outro');
    $texto = $c['conversation'] ?? $c['extendedTextMessage']['text'] ?? $c['imageMessage']['caption'] ?? $c['videoMessage']['caption']
        ?? $c['documentMessage']['caption'] ?? $c['documentWithCaptionMessage']['message']['documentMessage']['caption'] ?? '';
    if (!is_string($texto)) $texto = '';
    if ($texto === '') {
        $rot = ['imagem' => 'Foto', 'video' => 'Vídeo', 'audio' => 'Áudio', 'documento' => 'Documento', 'figurinha' => 'Figurinha',
                'contato' => 'Contato', 'localizacao' => 'Localização', 'enquete' => 'Enquete', 'reacao' => 'Reação'];
        $texto = $rot[$tipo] ?? 'Mensagem';
    }
    return [$tipo, mb_substr($texto, 0, 120)];
}

/** Mapa jid => nome a partir do cache de contatos (formato tolerante). */
function dash_nomes(): array {
    $f = cache_arq('contatos.json');
    if (!is_file($f)) return [];
    $d = json_decode((string)@file_get_contents($f), true);
    if (!is_array($d)) return [];
    $d = $d['contatos'] ?? $d['mapa'] ?? $d;
    $r = [];
    foreach ($d as $k => $v) {
        if (is_array($v) && isset($v['jid'])) { $n = $v['nome'] ?? ''; if ($n !== '') $r[$v['jid']] = (string)$n; }
        elseif (is_array($v)) { $n = $v['nome'] ?? ''; if (is_string($k) && is_string($n) && $n !== '') $r[$k] = $n; }
        elseif (is_string($v) && is_string($k) && $v !== '') $r[$k] = $v;
    }
    return $r;
}

/** Parte que depende da Evolution (cacheada 20 s). */
function dash_evolution(): array {
    $tz = new DateTimeZone('America/Maceio');
    $dias = [];
    for ($i = 6; $i >= 0; $i--) $dias[(new DateTime("-$i day", $tz))->format('Y-m-d')] = ['enviadas' => 0, 'recebidas' => 0];
    $hojeK = (new DateTime('now', $tz))->format('Y-m-d');
    $inicio = (new DateTime(array_key_first($dias) . ' 00:00:00', $tz))->getTimestamp();
    $d = [
        'estado' => 'desconhecido', 'nome' => '', 'foto' => '', 'numero' => '',
        'totais' => ['msgs' => 0, 'contatos' => 0, 'chats' => 0],
        'hoje' => ['enviadas' => 0, 'recebidas' => 0],
        'por_dia' => [], 'recentes' => [],
    ];
    $falhas = 0;
    $i = inst();

    [$c1, $e] = evo('GET', "/instance/connectionState/$i", null, 6);
    if ($c1 === 200) $d['estado'] = $e['instance']['state'] ?? 'desconhecido'; else $falhas++;
    [$c2, $f] = evo('GET', "/instance/fetchInstances?instanceName=$i", null, 8);
    if ($c2 === 200 && is_array($f)) {
        $f = $f[0] ?? [];
        $d['nome'] = (string)($f['profileName'] ?? '');
        $d['foto'] = (string)($f['profilePicUrl'] ?? '');
        $d['numero'] = preg_replace('/\D/', '', explode('@', (string)($f['ownerJid'] ?? ''))[0]);
        $d['totais'] = ['msgs' => (int)($f['_count']['Message'] ?? 0), 'contatos' => (int)($f['_count']['Contact'] ?? 0), 'chats' => (int)($f['_count']['Chat'] ?? 0)];
    } else $falhas++;

    $nomes = dash_nomes();
    $recentes = [];
    for ($p = 1; $p <= 6; $p++) {
        [$c, $r] = evo('POST', "/chat/findMessages/$i", ['where' => new stdClass(), 'offset' => 200, 'page' => $p], 15);
        $recs = $r['messages']['records'] ?? null;
        if ($c !== 200 && $c !== 201 || !is_array($recs)) { if ($p === 1) $falhas++; break; }
        $maisAntigo = PHP_INT_MAX;
        foreach ($recs as $m) {
            $ts = (int)($m['messageTimestamp'] ?? 0);
            if (is_array($m['messageTimestamp'] ?? null)) $ts = (int)($m['messageTimestamp']['low'] ?? 0);
            if ($ts <= 0 || corte_msg_oculta($m)) continue; // dados ocultos (Conexões)
            $maisAntigo = min($maisAntigo, $ts);
            $k = (new DateTime('@' . $ts))->setTimezone($tz)->format('Y-m-d');
            $fromMe = !empty($m['key']['fromMe']);
            if ($ts >= $inicio && isset($dias[$k])) $dias[$k][$fromMe ? 'enviadas' : 'recebidas']++;
            if (count($recentes) < 8) {
                [$tipo, $texto] = dash_resumo_msg($m);
                $jid = (string)($m['key']['remoteJid'] ?? '');
                $nome = $nomes[$jid] ?? '';
                if ($nome === '' && !$fromMe) $nome = (string)($m['pushName'] ?? '');
                if ($nome === '') $nome = preg_replace('/\D/', '', explode('@', $jid)[0]) ?: $jid;
                $recentes[] = ['jid' => $jid, 'nome' => $nome, 'fromMe' => $fromMe, 'texto' => $texto, 'tipo' => $tipo, 'ts' => $ts];
            }
        }
        $paginas = (int)($r['messages']['pages'] ?? 1);
        if ($maisAntigo < $inicio || $p >= $paginas || !$recs) break;
    }
    usort($recentes, fn($a, $b) => $b['ts'] <=> $a['ts']);
    $d['recentes'] = array_slice($recentes, 0, 8);
    foreach ($dias as $k => $v) $d['por_dia'][] = ['dia' => $k, 'enviadas' => $v['enviadas'], 'recebidas' => $v['recebidas']];
    $d['hoje'] = $dias[$hojeK];
    if ($falhas >= 3) $d['aviso'] = 'Não foi possível consultar a Evolution API agora.';
    elseif ($falhas > 0) $d['aviso'] = 'Alguns dados podem estar incompletos (Evolution API instável).';
    return $d;
}

return [
    'dash' => function () {
        $arq = cache_arq('dash.json');
        $d = null;
        if (is_file($arq) && time() - filemtime($arq) < 20) $d = json_decode((string)@file_get_contents($arq), true);
        if (!is_array($d)) {
            try { $d = dash_evolution(); }
            catch (Throwable $e) {
                $d = ['estado' => 'desconhecido', 'nome' => '', 'foto' => '', 'numero' => '', 'totais' => ['msgs' => 0, 'contatos' => 0, 'chats' => 0],
                      'hoje' => ['enviadas' => 0, 'recebidas' => 0], 'por_dia' => [], 'recentes' => [], 'aviso' => 'Não foi possível consultar a Evolution API agora.'];
            }
            // só guarda em cache respostas completas (sem aviso)
            if (!isset($d['aviso'])) @file_put_contents($arq, json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
        }
        // partes locais (sempre frescas)
        $ini = (new DateTime('today', new DateTimeZone('America/Maceio')))->getTimestamp();
        $pOk = 0; $pErr = 0; $pend = 0;
        try {
            $db = bd();
            $s = $db->prepare("SELECT ok, COUNT(*) n FROM envios WHERE instancia = ? AND origem IN ('painel','agenda') AND quando >= ? AND quando < ? GROUP BY ok");
            $s->execute([inst(), $ini, $ini + 86400]);
            foreach ($s->fetchAll() as $r) { if ((int)$r['ok'] === 1) $pOk = (int)$r['n']; else $pErr = (int)$r['n']; }
            $q = $db->prepare("SELECT COUNT(*) FROM agendadas WHERE status='pendente' AND instancia = ?"); $q->execute([inst()]); $pend = (int)$q->fetchColumn();
        } catch (Throwable $e) {}
        $d['hoje']['painel_ok'] = $pOk;
        $d['hoje']['painel_erro'] = $pErr;
        $d['agendadas_pendentes'] = $pend;
        out(['ok' => true] + $d);
    },
];
