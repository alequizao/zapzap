<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
require_once __DIR__ . '/../cortes.php';
// ZapZap — módulo CONVERSAS: lista de conversas, mensagens, mídia e marcar como lida.
// Retorna ['acao' => callable]. Nunca expõe o token da Evolution.

if (!function_exists('cv_jid_ok')) {
    function cv_jid_ok(string $j): bool { return (bool)preg_match('/^[0-9A-Za-z._\-]{1,60}@(s\.whatsapp\.net|g\.us|lid|c\.us)$/', $j); }

    function cv_cache_dir(): string { return dirname(cache_arq('x')); } // cache por instância

    /** Cache de contatos jid => {nome, foto}; aceita ausência. */
    function cv_contatos(): array {
        static $c = null; if ($c !== null) return $c;
        $f = cache_arq('contatos.json');
        $c = [];
        if (is_file($f)) {
            $j = json_decode((string)@file_get_contents($f), true);
            if (is_array($j)) {
                // aceita {"jid":{...}} ou {"contatos":{"jid":{...}}}
                if (isset($j['contatos']) && is_array($j['contatos'])) $j = $j['contatos'];
                $c = $j;
            }
        }
        return $c;
    }

    function cv_numero_fmt(string $jid): string {
        $n = explode('@', $jid)[0];
        if (!ctype_digit($n)) return $n;
        if (str_ends_with($jid, '@lid')) return 'Contato ' . substr($n, -4);
        if (str_starts_with($n, '55') && strlen($n) >= 12) {
            $ddd = substr($n, 2, 2); $r = substr($n, 4);
            return '+55 (' . $ddd . ') ' . substr($r, 0, -4) . '-' . substr($r, -4);
        }
        return '+' . $n;
    }

    function cv_status(array $m): string {
        $ord = ['PENDING' => 0, 'SERVER_ACK' => 1, 'DELIVERY_ACK' => 2, 'READ' => 3, 'PLAYED' => 3];
        $mx = -1;
        foreach (($m['MessageUpdate'] ?? []) as $u) {
            $s = strtoupper((string)($u['status'] ?? ''));
            if (isset($ord[$s]) && $ord[$s] > $mx) $mx = $ord[$s];
        }
        if ($mx < 0) { $s = strtoupper((string)($m['status'] ?? '')); $mx = $ord[$s] ?? 1; }
        return ['pend', 'enviada', 'entregue', 'lida'][$mx];
    }

    /** Desembrulha mensagens efêmeras/view-once etc. */
    function cv_conteudo(array $msg): array {
        for ($i = 0; $i < 4; $i++) {
            foreach (['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage', 'editedMessage'] as $w) {
                if (isset($msg[$w]['message']) && is_array($msg[$w]['message'])) { $msg = $msg[$w]['message']; continue 2; }
            }
            break;
        }
        return $msg;
    }

    /** Normaliza → [tipo, texto, arquivo, midia, contextInfo] ou null (ignorar). */
    function cv_normaliza(array $m): ?array {
        $msg = cv_conteudo(is_array($m['message'] ?? null) ? $m['message'] : []);
        $mt = (string)($m['messageType'] ?? '');
        if ($mt === 'reactionMessage' || isset($msg['reactionMessage'])) return null;
        if ($mt === 'protocolMessage' || isset($msg['protocolMessage'])) return null;
        if ($mt === 'senderKeyDistributionMessage' && count($msg) <= 2) return null;
        $ctx = null; $arq = ''; $midia = false; $tipo = 'outro'; $txt = '';
        if (isset($msg['conversation'])) { $tipo = 'texto'; $txt = (string)$msg['conversation']; }
        elseif (isset($msg['extendedTextMessage'])) { $tipo = 'texto'; $txt = (string)($msg['extendedTextMessage']['text'] ?? ''); $ctx = $msg['extendedTextMessage']['contextInfo'] ?? null; }
        elseif (isset($msg['imageMessage'])) { $tipo = 'imagem'; $txt = (string)($msg['imageMessage']['caption'] ?? ''); $midia = true; $ctx = $msg['imageMessage']['contextInfo'] ?? null; }
        elseif (isset($msg['videoMessage'])) { $tipo = 'video'; $txt = (string)($msg['videoMessage']['caption'] ?? ''); $midia = true; $ctx = $msg['videoMessage']['contextInfo'] ?? null; }
        elseif (isset($msg['documentMessage'])) { $tipo = 'documento'; $arq = (string)($msg['documentMessage']['fileName'] ?? 'documento'); $txt = (string)($msg['documentMessage']['caption'] ?? ''); $midia = true; $ctx = $msg['documentMessage']['contextInfo'] ?? null; }
        elseif (isset($msg['audioMessage'])) { $tipo = 'audio'; $midia = true; $ctx = $msg['audioMessage']['contextInfo'] ?? null; }
        elseif (isset($msg['stickerMessage'])) { $tipo = 'figurinha'; $midia = true; }
        elseif (isset($msg['contactMessage'])) { $tipo = 'contato'; $txt = (string)($msg['contactMessage']['displayName'] ?? ''); }
        elseif (isset($msg['contactsArrayMessage'])) { $tipo = 'contato'; $txt = (string)($msg['contactsArrayMessage']['displayName'] ?? ''); }
        elseif (isset($msg['locationMessage']) || isset($msg['liveLocationMessage'])) { $l = $msg['locationMessage'] ?? $msg['liveLocationMessage']; $tipo = 'localizacao'; $txt = trim((string)($l['name'] ?? '') . ' ' . (string)($l['address'] ?? '')); }
        elseif (isset($msg['pollCreationMessage']) || isset($msg['pollCreationMessageV2']) || isset($msg['pollCreationMessageV3'])) { $p = $msg['pollCreationMessage'] ?? $msg['pollCreationMessageV2'] ?? $msg['pollCreationMessageV3']; $tipo = 'enquete'; $txt = (string)($p['name'] ?? ''); }
        elseif (isset($msg['pollUpdateMessage']) || isset($msg['albumMessage'])) return null;
        elseif (isset($msg['templateMessage'])) { $t = $msg['templateMessage']; $tipo = 'texto'; $txt = (string)($t['hydratedTemplate']['hydratedContentText'] ?? $t['hydratedFourRowTemplate']['hydratedContentText'] ?? $t['interactiveMessageTemplate']['body']['text'] ?? ''); }
        elseif (isset($msg['buttonsResponseMessage'])) { $tipo = 'texto'; $txt = (string)($msg['buttonsResponseMessage']['selectedDisplayText'] ?? ''); }
        elseif (isset($msg['listResponseMessage'])) { $tipo = 'texto'; $txt = (string)($msg['listResponseMessage']['title'] ?? ''); }
        elseif (!$msg && !in_array($mt, ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'], true)) return null;
        else {
            // tipos conhecidos só pelo messageType (mídia sem corpo)
            $mp = ['imageMessage' => 'imagem', 'videoMessage' => 'video', 'audioMessage' => 'audio', 'documentMessage' => 'documento', 'stickerMessage' => 'figurinha'];
            if (isset($mp[$mt])) { $tipo = $mp[$mt]; $midia = true; }
        }
        if ($ctx === null) {
            foreach ($msg as $v) { if (is_array($v) && isset($v['contextInfo'])) { $ctx = $v['contextInfo']; break; } }
        }
        return [$tipo, mb_substr($txt, 0, 4096), mb_substr($arq, 0, 200), $midia, is_array($ctx) ? $ctx : null];
    }

    function cv_citada(?array $ctx, string $grupoJid): ?array {
        if (!$ctx || !is_array($ctx['quotedMessage'] ?? null)) return null;
        $q = cv_normaliza(['message' => $ctx['quotedMessage'], 'messageType' => '']);
        $texto = $q ? ($q[1] !== '' ? $q[1] : ($q[2] !== '' ? $q[2] : '[' . $q[0] . ']')) : '';
        $p = (string)($ctx['participant'] ?? '');
        $nome = '';
        if ($p !== '') { $c = cv_contatos()[$p] ?? null; $nome = is_array($c) ? (string)($c['nome'] ?? '') : ''; if ($nome === '') $nome = cv_numero_fmt($p); }
        return ['texto' => mb_substr($texto, 0, 200), 'autor' => $nome];
    }

    /** Resumo curto (texto) de uma mensagem normalizada para a lista de conversas. */
    function cv_resumo(array $n): string {
        if ($n[1] !== '') return mb_substr($n[1], 0, 140);
        if ($n[2] !== '') return $n[2];
        return ['imagem' => 'Foto', 'video' => 'Vídeo', 'audio' => 'Áudio', 'figurinha' => 'Figurinha', 'contato' => 'Contato', 'localizacao' => 'Localização', 'enquete' => 'Enquete', 'documento' => 'Documento'][$n[0]] ?? 'Mensagem';
    }

    /** Busca uma página de findMessages. Devolve [records, pages] ou null em erro. */
    function cv_pagina(array $where, int $pag, int $tam): ?array {
        [$c, $r] = evo('POST', '/chat/findMessages/' . rawurlencode(inst()), ['where' => $where ?: new stdClass(), 'offset' => $tam, 'page' => $pag], 30);
        if ($c < 200 || $c >= 300 || !is_array($r['messages']['records'] ?? null)) return null;
        return [$r['messages']['records'], (int)($r['messages']['pages'] ?? 1)];
    }

    function cv_lista_chats(int $mais): array {
        $arq = cache_arq('conversas_chats_' . $mais . '.json');
        if (is_file($arq) && time() - filemtime($arq) <= 3) {
            $j = json_decode((string)@file_get_contents($arq), true);
            if (is_array($j)) return $j;
        }
        $grupos = []; $temMais = false; $falhou = false;
        for ($p = 1; $p <= 1 + $mais; $p++) {
            $r = cv_pagina([], $p, 400);
            if ($r === null) { $falhou = true; break; }
            foreach ($r[0] as $m) {
                $jid = (string)($m['key']['remoteJid'] ?? '');
                if ($jid === '' || $jid === 'status@broadcast' || str_ends_with($jid, '@broadcast') || str_ends_with($jid, '@newsletter') || !cv_jid_ok($jid)) continue;
                $n = cv_normaliza($m); if ($n === null) continue;
                $fm = !empty($m['key']['fromMe']);
                $ts = (int)($m['messageTimestamp'] ?? 0);
                if (is_array($m['messageTimestamp'] ?? null)) $ts = (int)($m['messageTimestamp']['low'] ?? 0);
                if (corte_msg_oculta($m)) continue; // dados ocultos (Conexões)
                $g = &$grupos[$jid];
                if ($g === null) { // primeira = mais recente (ordem decrescente)
                    $g = ['jid' => $jid, 'ts' => $ts, 'ultima' => ['texto' => cv_resumo($n), 'tipo' => $n[0], 'fromMe' => $fm, 'ts' => $ts, 'status' => $fm ? cv_status($m) : ''],
                          'push' => '', 'nl' => 0, 'achouEnviada' => false, 'rts' => []];
                }
                // Aproximação documentada: não lidas = mensagens recebidas (fromMe=false) mais novas
                // que a última enviada por você neste chat (a Evolution não expõe contador real). Máx. 99.
                if (!$g['achouEnviada']) {
                    if ($fm) $g['achouEnviada'] = true;
                    elseif ($g['nl'] < 99) $g['nl']++;
                }
                if (!$fm && count($g['rts']) < 100) $g['rts'][] = $ts; // recebidas (para contar não lidas pelo lido_ts)
                if (!$fm && $g['push'] === '' && !str_ends_with($jid, '@g.us') && !empty($m['pushName'])) $g['push'] = (string)$m['pushName'];
                unset($g);
            }
            if ($r[1] > $p) $temMais = true; else { $temMais = false; break; }
        }
        if ($falhou && !$grupos) return ['erro' => true];
        $cont = cv_contatos(); $chats = [];
        foreach ($grupos as $g) {
            $c = $cont[$g['jid']] ?? null; $c = is_array($c) ? $c : [];
            $grupo = str_ends_with($g['jid'], '@g.us');
            $nome = trim((string)($c['nome'] ?? ''));
            if ($nome === '') $nome = $grupo ? 'Grupo ' . substr(explode('@', $g['jid'])[0], -4) : ($g['push'] !== '' ? $g['push'] : cv_numero_fmt($g['jid']));
            $chats[] = ['jid' => $g['jid'], 'nome' => $nome, 'foto' => (string)($c['foto'] ?? ''), 'grupo' => $grupo,
                        'ultima' => $g['ultima'], 'ts' => $g['ts'], 'nao_lidas' => $g['nl'], 'rts' => $g['rts']];
        }
        usort($chats, fn($a, $b) => $b['ts'] <=> $a['ts']);
        $res = ['chats' => $chats, 'tem_mais' => $temMais];
        if (!$falhou) @file_put_contents($arq, json_encode($res, JSON_UNESCAPED_UNICODE), LOCK_EX);
        return $res;
    }
}

return [
    '__perms' => ['ver_presenca' => 'conversas.ver', 'assinar_presenca' => 'conversas.ver'],

    // Presença de um chat: digitando/gravando (8 s), online (até 5 min sem atualização) ou offline.
    'ver_presenca' => function () {
        $jid = (string)($_GET['jid'] ?? '');
        if (!cv_jid_ok($jid)) out(['ok' => false, 'msg' => 'Conversa inválida.'], 400);
        $st = bd()->prepare('SELECT participante, estado, atualizado, visto FROM presenca WHERE instancia = ? AND jid = ? AND atualizado >= ? ORDER BY atualizado DESC LIMIT 50');
        $st->execute([inst(), $jid, time() - 300]);
        $agora = time(); $cont = cv_contatos(); $grupo = str_ends_with($jid, '@g.us');
        $dig = []; $gra = []; $on = null; $off = null; $desde = 0; $visto = null;
        foreach ($st->fetchAll() as $l) {
            $e = $l['estado']; $t = (int)$l['atualizado'];
            $c = $cont[$l['participante']] ?? null;
            $nome = is_array($c) && trim((string)($c['nome'] ?? '')) !== '' ? trim($c['nome']) : cv_numero_fmt($l['participante']);
            if ($e === 'composing' && $agora - $t <= 8) { $dig[] = ['nome' => $nome]; $desde = max($desde, $t); }
            elseif ($e === 'recording' && $agora - $t <= 8) { $gra[] = ['nome' => $nome]; $desde = max($desde, $t); }
            elseif (in_array($e, ['available', 'paused'], true)) { $on = $on ?? $t; }
            elseif ($e === 'unavailable') { $off = $off ?? $t; if ($l['visto']) $visto = (int)$l['visto']; }
            if ($l['visto'] && $visto === null) $visto = (int)$l['visto'];
        }
        $estado = ''; $quem = [];
        if ($gra) { $estado = 'gravando'; $quem = $gra; }
        elseif ($dig) { $estado = 'digitando'; $quem = $dig; }
        elseif (!$grupo && $on !== null && ($off === null || $on >= $off)) { $estado = 'online'; $desde = $on; }
        elseif (!$grupo && $off !== null) { $estado = 'offline'; $desde = $off; }
        $r = ['ok' => true, 'estado' => $estado, 'desde' => $desde, 'quem' => $quem];
        if ($visto) $r['visto_por_ultimo'] = $visto;
        out($r);
    },

    // Assina a presença do contato (Baileys presenceSubscribe) ao abrir o chat. Usa /chat/sendPresence com 'paused' (não mostra nada ao contato).
    'assinar_presenca' => function () {
        $jid = (string)(entrada()['jid'] ?? '');
        if (!cv_jid_ok($jid)) out(['ok' => false, 'msg' => 'Conversa inválida.'], 400);
        if (str_ends_with($jid, '@lid')) out(['ok' => true, 'assinou' => false]);
        $f = cache_arq('ps_' . md5($jid) . '.flag');
        if (is_file($f) && time() - filemtime($f) < 60) out(['ok' => true, 'assinou' => false]);
        @touch($f);
        $num = str_ends_with($jid, '@g.us') ? $jid : explode('@', $jid)[0];
        [$c] = evo('POST', '/chat/sendPresence/' . rawurlencode(inst()), ['number' => $num, 'presence' => 'paused', 'delay' => 1], 12);
        out(['ok' => true, 'assinou' => $c >= 200 && $c < 300]);
    },

    'chats' => function () {
        $mais = max(0, min(10, (int)($_GET['mais'] ?? 0)));
        $q = trim((string)($_GET['q'] ?? ''));
        $r = cv_lista_chats($mais);
        if (isset($r['erro'])) out(['ok' => false, 'msg' => 'Não foi possível carregar as conversas agora. Tente de novo.'], 502);
        $chats = $r['chats'];
        // Não lidas: recebidas com ts > lido_ts do chat (tabela conversas_lidas); sem marca, vale a regra antiga já calculada.
        $lidos = [];
        try { $st = bd()->prepare('SELECT jid, lido_ts FROM conversas_lidas WHERE instancia = ?'); $st->execute([inst()]); foreach ($st->fetchAll() as $l) $lidos[$l['jid']] = (int)$l['lido_ts']; } catch (Throwable $e) {}
        $pres = [];
        try { // presença ativa (digitando/gravando valem 8 s)
            $st = bd()->prepare("SELECT jid, estado FROM presenca WHERE instancia = ? AND atualizado >= ? AND estado IN ('composing','recording')"); $st->execute([inst(), time() - 8]);
            foreach ($st->fetchAll() as $l) { if (($pres[$l['jid']] ?? '') !== 'gravando') $pres[$l['jid']] = $l['estado'] === 'recording' ? 'gravando' : 'digitando'; }
        } catch (Throwable $e) {}
        $total = 0;
        foreach ($chats as &$c) {
            if (isset($pres[$c['jid']])) $c['presenca'] = $pres[$c['jid']];
            if (isset($lidos[$c['jid']])) { $lt = $lidos[$c['jid']]; $c['nao_lidas'] = min(99, count(array_filter($c['rts'] ?? [], fn($t) => $t > $lt))); }
            unset($c['rts']);
            $total += $c['nao_lidas'];
        }
        unset($c);
        if ($q !== '') {
            $qd = preg_replace('/\D/', '', $q);
            $chats = array_values(array_filter($chats, function ($c) use ($q, $qd) {
                if (mb_stripos($c['nome'], $q) !== false) return true;
                return $qd !== '' && str_contains(explode('@', $c['jid'])[0], $qd);
            }));
        }
        out(['ok' => true, 'chats' => $chats, 'tem_mais' => $r['tem_mais'], 'total_nao_lidas' => $total]);
    },

    'msgs' => function () {
        $jid = (string)($_GET['jid'] ?? '');
        if (!cv_jid_ok($jid)) out(['ok' => false, 'msg' => 'Conversa inválida.'], 400);
        $antes = (int)($_GET['antes'] ?? 0);
        $grupo = str_ends_with($jid, '@g.us');
        $out = []; $pushNome = '';
        for ($p = 1; $p <= 8 && count($out) < 60; $p++) {
            $r = cv_pagina(['key' => ['remoteJid' => $jid]], $p, 100);
            if ($r === null) {
                if ($p === 1) out(['ok' => false, 'msg' => 'Não foi possível carregar as mensagens agora. Tente de novo.'], 502);
                break;
            }
            foreach ($r[0] as $m) { // decrescente
                $ts = (int)($m['messageTimestamp'] ?? 0);
                if (is_array($m['messageTimestamp'] ?? null)) $ts = (int)($m['messageTimestamp']['low'] ?? 0);
                if (corte_msg_oculta($m)) continue; // dados ocultos (Conexões)
                $fm = !empty($m['key']['fromMe']);
                if (!$fm && !$grupo && $pushNome === '' && !empty($m['pushName'])) $pushNome = (string)$m['pushName'];
                if ($antes > 0 && $ts >= $antes) continue;
                $n = cv_normaliza($m); if ($n === null) continue;
                $autor = '';
                if ($grupo && !$fm) {
                    $part = (string)($m['key']['participant'] ?? $m['participant'] ?? '');
                    $c = $part !== '' ? (cv_contatos()[$part] ?? null) : null;
                    $autor = is_array($c) ? trim((string)($c['nome'] ?? '')) : '';
                    if ($autor === '') $autor = trim((string)($m['pushName'] ?? ''));
                    if ($autor === '' && $part !== '') $autor = cv_numero_fmt($part);
                }
                $out[] = ['id' => (string)($m['key']['id'] ?? ''), 'fromMe' => $fm, 'ts' => $ts, 'tipo' => $n[0], 'texto' => $n[1],
                          'status' => $fm ? cv_status($m) : 'lida', 'midia' => $n[3], 'arquivo' => $n[2], 'autor' => $autor,
                          'citada' => cv_citada($n[4], $jid)];
                if (count($out) >= 60) break;
            }
            if ($r[1] <= $p) break;
        }
        $out = array_reverse($out);
        $c = cv_contatos()[$jid] ?? null; $c = is_array($c) ? $c : [];
        $nome = trim((string)($c['nome'] ?? ''));
        if ($nome === '') $nome = $grupo ? 'Grupo ' . substr(explode('@', $jid)[0], -4) : ($pushNome !== '' ? $pushNome : cv_numero_fmt($jid));
        out(['ok' => true, 'jid' => $jid, 'nome' => $nome, 'grupo' => $grupo, 'msgs' => $out]);
    },

    'midia' => function () {
        $jid = (string)($_GET['jid'] ?? ''); $id = (string)($_GET['id'] ?? '');
        if (!cv_jid_ok($jid) || !preg_match('/^[0-9A-Za-z_\-.]{4,80}$/', $id)) out(['ok' => false, 'msg' => 'Mídia inválida.'], 400);
        [$c, $r] = evo('POST', '/chat/getBase64FromMediaMessage/' . rawurlencode(inst()), ['message' => ['key' => ['id' => $id]], 'convertToMp4' => false], 60);
        $b64 = is_array($r) ? ($r['base64'] ?? '') : '';
        if ($c < 200 || $c >= 300 || !is_string($b64) || $b64 === '') out(['ok' => false, 'msg' => 'Não foi possível baixar esta mídia (pode ter expirado).'], 502);
        if (str_starts_with($b64, 'data:') && ($p = strpos($b64, ',')) !== false) $b64 = substr($b64, $p + 1);
        if (strlen($b64) * 3 / 4 > 15 * 1024 * 1024) out(['ok' => false, 'msg' => 'Arquivo grande demais para visualizar aqui (limite de 15 MB).'], 413);
        $mime = preg_match('#^[\w.+-]+/[\w.+-]+#', (string)($r['mimetype'] ?? ''), $mm) ? $mm[0] : 'application/octet-stream';
        $nome = basename(str_replace('\\', '/', (string)($r['fileName'] ?? '')));
        out(['ok' => true, 'mime' => $mime, 'nome' => mb_substr($nome, 0, 200), 'data_url' => 'data:' . $mime . ';base64,' . $b64]);
    },

    'marcar_lida' => function () {
        $jid = (string)(entrada()['jid'] ?? '');
        if (!cv_jid_ok($jid)) out(['ok' => false, 'msg' => 'Conversa inválida.'], 400);
        $r = cv_pagina(['key' => ['remoteJid' => $jid]], 1, 50);
        if ($r === null) out(['ok' => false, 'msg' => 'Não foi possível consultar a conversa agora.'], 502);
        $lista = []; $maxTs = 0;
        foreach ($r[0] as $m) { // até 50 mais recentes
            $ts = (int)($m['messageTimestamp'] ?? 0);
            if (is_array($m['messageTimestamp'] ?? null)) $ts = (int)($m['messageTimestamp']['low'] ?? 0);
            if ($ts > $maxTs) $maxTs = $ts;
            if (!empty($m['key']['fromMe']) || empty($m['key']['id'])) continue;
            $lida = false;
            foreach (($m['MessageUpdate'] ?? []) as $u) if (in_array(strtoupper((string)($u['status'] ?? '')), ['READ', 'PLAYED'], true)) $lida = true;
            if ($lida) continue;
            $lista[] = ['remoteJid' => $jid, 'fromMe' => false, 'id' => (string)$m['key']['id']];
        }
        $wa = true;
        if ($lista) {
            [$c] = evo('POST', '/chat/markMessageAsRead/' . rawurlencode(inst()), ['readMessages' => $lista], 25);
            $wa = $c >= 200 && $c < 300;
        }
        if ($maxTs > 0) {
            bd()->prepare('INSERT INTO conversas_lidas (instancia, jid, lido_ts, atualizado) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE lido_ts = GREATEST(lido_ts, VALUES(lido_ts)), atualizado = VALUES(atualizado)')
                ->execute([inst(), $jid, $maxTs, time()]);
        }
        foreach (glob(cv_cache_dir() . '/conversas_chats_*.json') ?: [] as $f) @unlink($f);
        aud_detalhe('marcou como lida');
        out(['ok' => true, 'marcadas' => count($lista), 'whatsapp' => $wa]);
    },
];
