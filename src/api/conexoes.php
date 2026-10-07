<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// Conexões: vários WhatsApps (instâncias da Evolution). Dono: núcleo. Usa a chave global (evo_global) só aqui.
function cx_lista(bool $forcar = false): array {
    $f = ZZ_DIR . '/cache/_instancias.json';
    if (!$forcar && is_file($f) && filemtime($f) > time() - 8) { $j = json_decode((string)file_get_contents($f), true); if (is_array($j)) return $j; }
    [$c, $r] = evo_global('GET', '/instance/fetchInstances', null, 15);
    if ($c !== 200 || !is_array($r)) return [];
    $reg = registro(); $mudou = false; $itens = [];
    foreach ($r as $i) {
        $n = $i['name'] ?? ''; if (!nome_instancia_ok($n)) continue;
        if (!isset($reg[$n])) { $reg[$n] = ['token' => $i['token'] ?? '', 'apelido' => $n, 'protegida' => false]; $mudou = true; }
        elseif (($i['token'] ?? '') !== '' && ($reg[$n]['token'] ?? '') !== $i['token']) { $reg[$n]['token'] = $i['token']; $mudou = true; }
        $itens[] = ['nome' => $n, 'apelido' => $reg[$n]['apelido'] ?? $n, 'protegida' => !empty($reg[$n]['protegida']),
            'estado' => $i['connectionStatus'] ?? 'close', 'perfil' => $i['profileName'] ?? '', 'foto' => $i['profilePicUrl'] ?? '',
            'numero' => preg_replace('/\D/', '', explode('@', $i['ownerJid'] ?? '')[0]),
            'msgs' => $i['_count']['Message'] ?? 0, 'contatos' => $i['_count']['Contact'] ?? 0, 'chats' => $i['_count']['Chat'] ?? 0];
    }
    if ($mudou) registro_salvar($reg);
    @file_put_contents($f, json_encode($itens, JSON_UNESCAPED_UNICODE));
    return $itens;
}
function cx_nome(): string { $n = (string)(entrada()['nome'] ?? ''); if (!nome_instancia_ok($n)) out(['ok' => false, 'msg' => 'Nome inválido (use letras, números, - ou _; 2 a 40 caracteres)'], 400); return $n; }
function cx_protegida(string $n, array $reg): bool { return !empty($reg['protegida']) || $n === cfg()['instancia']; }
function cx_existente(string $n): array { $reg = registro(); if (!isset($reg[$n])) { cx_lista(true); $reg = registro(); } if (!isset($reg[$n])) out(['ok' => false, 'msg' => 'Conexão não encontrada'], 404); return $reg[$n]; }

/* ---------- limpeza / corte / sincronização (Fase 2) ---------- */
const CX_LIMITE_MIDIAS = 500 * 1024 * 1024; // 500 MB por conexão
function cx_dir_sync(): string { $d = ZZ_DIR . '/sync'; if (!is_dir($d)) @mkdir($d, 0750, true); return $d; }
function cx_rmdir(string $d): void {
    if (!is_dir($d) || is_link($d)) return;
    foreach (scandir($d) ?: [] as $x) { if ($x === '.' || $x === '..') continue; $f = "$d/$x"; if (is_dir($f) && !is_link($f)) cx_rmdir($f); else @unlink($f); }
    @rmdir($d);
}
function cx_acesso(string $n): void { if (!in_array($n, instancias_permitidas(), true)) out(['ok' => false, 'msg' => 'Você não tem acesso a esta conexão.'], 403); }
function cx_gravar_json(string $f, array $d): void { $t = $f . '.' . bin2hex(random_bytes(3)) . '.tmp'; if (@file_put_contents($t, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)) !== false) { @chmod($t, 0640); if (!@rename($t, $f)) @unlink($t); } }
function cx_sync_ler(string $n): ?array { $f = cx_dir_sync() . "/$n.json"; $j = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null; return is_array($j) ? $j : null; }
function cx_sync_salvar(string $n, array $d): void { cx_gravar_json(cx_dir_sync() . "/$n.json", $d); }
function cx_reg_set(string $n, array $campos, array $remover = []): void {
    $reg = registro(); if (!isset($reg[$n])) return;
    foreach ($campos as $k => $v) $reg[$n][$k] = $v;
    foreach ($remover as $k) unset($reg[$n][$k]);
    registro_salvar($reg); @unlink(ZZ_DIR . '/cache/_instancias.json');
}
/** Liga o download do histórico completo (syncFullHistory) mantendo as demais configurações. Nunca para conexão protegida. */
function cx_ligar_historico(string $n, string $token): bool {
    $reg = registro(); if (cx_protegida($n, $reg[$n] ?? [])) return false;
    [$c, $a] = evo_chave($token, 'GET', "/settings/find/$n", null, 10);
    $s = ($c === 200 && is_array($a)) ? $a : [];
    $corpo = ['rejectCall' => (bool)($s['rejectCall'] ?? false), 'msgCall' => (string)($s['msgCall'] ?? ''), 'groupsIgnore' => false, 'alwaysOnline' => (bool)($s['alwaysOnline'] ?? false),
              'readMessages' => false, 'readStatus' => (bool)($s['readStatus'] ?? false), 'syncFullHistory' => true];
    [$c2] = evo_chave($token, 'POST', "/settings/set/$n", $corpo, 15);
    if ($c2 >= 200 && $c2 < 300) { cx_reg_set($n, ['hist_ok_ts' => time(), 'sync_pendente' => true]); return true; }
    return false;
}
function cx_corpo_criar(string $n): array {
    return ['instanceName' => $n, 'integration' => 'WHATSAPP-BAILEYS', 'qrcode' => true, 'syncFullHistory' => true, 'readMessages' => false, 'groupsIgnore' => false, 'rejectCall' => false];
}
/** Apaga no MySQL (e no SQLite legado) as linhas dessa conexão em todas as tabelas de dados com coluna `instancia`. Mantém usuários, auditoria e migrações. */
function cx_apagar_dados(string $n): array {
    $r = ['tabelas' => 0, 'linhas' => 0];
    try {
        $q = bd()->query("SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'instancia'");
        foreach (array_column($q->fetchAll(), 't') as $t) {
            if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', (string)$t) || preg_match('/^(usuario|auditoria|migracoes)/i', (string)$t)) continue;
            $st = bd()->prepare("DELETE FROM `$t` WHERE instancia = ?"); $st->execute([$n]); $r['tabelas']++; $r['linhas'] += $st->rowCount();
        }
    } catch (Throwable $e) { @error_log('[zapzap conexoes] limpeza MySQL: ' . $e->getMessage()); }
    if (function_exists('db')) try { foreach (['envios', 'agendadas'] as $t) { $st = db()->prepare("DELETE FROM $t WHERE instancia = ?"); $st->execute([$n]); $r['linhas'] += $st->rowCount(); } } catch (Throwable $e) { @error_log('[zapzap conexoes] limpeza SQLite: ' . $e->getMessage()); }
    return $r;
}
function cx_limpar_arquivos(string $n, bool $midias): void {
    cx_rmdir(ZZ_DIR . '/cache/' . $n);
    @unlink(ZZ_DIR . '/sync/' . $n . '.json'); @unlink(ZZ_DIR . '/sync/' . $n . '.fila.json');
    if ($midias) cx_rmdir(ZZ_DIR . '/midias/' . $n);
    @unlink(ZZ_DIR . '/cache/_instancias.json');
}

/** Executa uma etapa registrando andamento real. */
function cx_etapa(string $n, array &$st, string $id, callable $fn): void {
    $st['etapas'][$id]['estado'] = 'rodando'; cx_sync_salvar($n, $st);
    try { $r = $fn(); $st['etapas'][$id] = ['estado' => ($r['pulado'] ?? false) ? 'pulado' : 'ok'] + $r; }
    catch (Throwable $e) { $st['etapas'][$id] = ['estado' => 'erro', 'msg' => 'falhou']; @error_log('[zapzap sync] ' . $id . ': ' . $e->getMessage()); }
    cx_sync_salvar($n, $st);
}
function cx_msgs_total(string $n): int { [$c, $f] = evo('GET', '/instance/fetchInstances?instanceName=' . rawurlencode($n), null, 10); return $c === 200 ? (int)($f[0]['_count']['Message'] ?? 0) : 0; }

/** Sincronização completa da conexão $n (contatos, grupos, conversas, perfil, histórico, fila de mídias). Devolve false se já está rodando. */
function cx_sincronizar(string $n, int $dias = 0): bool {
    $lock = fopen(cx_dir_sync() . "/$n.lock", 'c'); if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return false;
    ignore_user_abort(true); @set_time_limit(170);
    $ant = $GLOBALS['ZZ_INST'] ?? null; usar_instancia($n); api_carregar();
    $ant_m = (cx_sync_ler($n)['midias'] ?? ['ativo' => false]);
    $st = ['inicio' => time(), 'fim' => 0, 'estado' => 'rodando', 'dias' => $dias, 'etapas' => [], 'resumo' => [], 'midias' => $ant_m];
    foreach (['perfil', 'contatos', 'grupos', 'conversas', 'historico', 'midias'] as $e) $st['etapas'][$e] = ['estado' => 'pend'];
    cx_sync_salvar($n, $st);
    try {
        cx_etapa($n, $st, 'perfil', function () use ($n, &$st) {
            [$c, $f] = evo('GET', '/instance/fetchInstances?instanceName=' . rawurlencode($n), null, 12); $f = $c === 200 ? ($f[0] ?? []) : [];
            $num = preg_replace('/\D/', '', explode('@', (string)($f['ownerJid'] ?? ''))[0]); $recado = '';
            if ($num !== '') { [$c2, $p] = evo('POST', '/chat/fetchProfile/' . rawurlencode($n), ['number' => $num], 15); if ($c2 >= 200 && $c2 < 300 && is_array($p)) { $x = $p['status'] ?? ''; $recado = is_array($x) ? (string)($x['status'] ?? '') : (string)$x; } }
            $st['resumo']['perfil'] = ['nome' => (string)($f['profileName'] ?? ''), 'numero' => $num, 'foto' => !empty($f['profilePicUrl']), 'recado' => $recado !== ''];
            return ['n' => ($num !== '' ? 1 : 0)];
        });
        cx_etapa($n, $st, 'contatos', function () use ($n, &$st) {
            [$ok, $erro] = ct_atualizar(); if (!$ok) throw new RuntimeException($erro);
            $d = json_decode((string)@file_get_contents(cache_arq('contatos.json')), true) ?: []; $pess = 0; $fotos = 0;
            foreach ($d as $v) { if (empty($v['grupo'])) $pess++; if (!empty($v['foto'])) $fotos++; }
            $st['resumo']['contatos'] = $pess; $st['resumo']['fotos'] = $fotos; return ['n' => $pess];
        });
        cx_etapa($n, $st, 'grupos', function () use (&$st) {
            @unlink(cache_arq('grupos.json')); $g = gz_lista(); if ($g === null) throw new RuntimeException('grupos');
            $st['resumo']['grupos'] = count($g); return ['n' => count($g)];
        });
        cx_etapa($n, $st, 'conversas', function () use (&$st) {
            foreach (glob(dirname(cache_arq('x')) . '/conversas_chats_*.json') ?: [] as $f) @unlink($f);
            @unlink(cache_arq('dash.json')); $r = cv_lista_chats(3); if (isset($r['erro'])) throw new RuntimeException('conversas');
            $st['resumo']['conversas'] = count($r['chats']); return ['n' => count($r['chats'])];
        });
        cx_etapa($n, $st, 'historico', function () use ($n, &$st) {
            $ult = cx_msgs_total($n); $est = 0; $ini = $ult;
            for ($i = 0; $i < 6 && $est < 2; $i++) { // espera o WhatsApp terminar de enviar o histórico (até ~18 s sem novidade)
                sleep(3); $t = cx_msgs_total($n); $est = $t > $ult ? 0 : $est + 1; $ult = $t;
                $st['etapas']['historico']['n'] = $t; $st['resumo']['mensagens'] = $t; cx_sync_salvar($n, $st);
            }
            $st['resumo']['mensagens'] = $ult; return ['n' => $ult, 'novas' => max(0, $ult - $ini)];
        });
        cx_etapa($n, $st, 'midias', function () use ($n, $dias, &$st) {
            if ($dias < 1) return ['pulado' => true, 'n' => 0];
            $lim = time() - $dias * 86400; $fila = []; $parar = false;
            for ($p = 1; $p <= 15 && !$parar; $p++) {
                [$c, $r] = evo('POST', '/chat/findMessages/' . rawurlencode($n), ['where' => new stdClass(), 'offset' => 200, 'page' => $p], 40);
                $recs = $r['messages']['records'] ?? null; if (($c < 200 || $c >= 300) || !is_array($recs) || !$recs) break;
                foreach ($recs as $m) {
                    $ts = corte_msg_ts($m); $mt = (string)($m['messageType'] ?? '');
                    $pts = (int)(is_array($m['messageTimestamp'] ?? null) ? ($m['messageTimestamp']['low'] ?? 0) : ($m['messageTimestamp'] ?? 0));
                    if ($pts > 0 && $pts < $lim) { $parar = true; continue; }
                    if (corte_msg_oculta($m) || !in_array($mt, ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'documentWithCaptionMessage'], true)) continue;
                    $fila[] = ['id' => (string)($m['key']['id'] ?? ''), 'tp' => $mt, 'ts' => $pts, 'arq' => '', 'ok' => 0];
                    if (count($fila) >= 3000) { $parar = true; break; }
                }
                if ($p >= (int)($r['messages']['pages'] ?? 1)) break;
            }
            cx_gravar_json(cx_dir_sync() . "/$n.fila.json", ['itens' => $fila]);
            $st['midias'] = ['ativo' => count($fila) > 0, 'dias' => $dias, 'total' => count($fila), 'feitas' => 0, 'falhas' => 0, 'bytes' => 0, 'cancelado' => false, 'limite' => false, 'inicio' => time()];
            $st['resumo']['midias_fila'] = count($fila); return ['n' => count($fila)];
        });
        $st['estado'] = 'ok';
    } catch (Throwable $e) { $st['estado'] = 'erro'; @error_log('[zapzap sync] ' . $e->getMessage()); }
    finally {
        $st['fim'] = time(); cx_sync_salvar($n, $st); cx_reg_set($n, ['sync_ts' => $st['fim']], ['sync_pendente']);
        if ($ant !== null) usar_instancia($ant); else unset($GLOBALS['ZZ_INST']);
        flock($lock, LOCK_UN); fclose($lock);
    }
    return true;
}
/** Baixa até $max mídias da fila da conexão $n (chamado pelo cron). Salva em ZZ_DIR/midias/<n>/ com nomes aleatórios. */
function cx_midias_passo(string $n, int $max = 5): void {
    $st = cx_sync_ler($n); if (!$st || empty($st['midias']['ativo']) || !empty($st['midias']['cancelado'])) return;
    $ff = cx_dir_sync() . "/$n.fila.json"; $fila = is_file($ff) ? json_decode((string)@file_get_contents($ff), true) : null; if (!is_array($fila['itens'] ?? null)) return;
    $ant = $GLOBALS['ZZ_INST'] ?? null; usar_instancia($n);
    $dir = ZZ_DIR . '/midias/' . $n; if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'video/mp4' => 'mp4', 'audio/ogg' => 'ogg', 'audio/mpeg' => 'mp3', 'audio/mp4' => 'm4a', 'application/pdf' => 'pdf'];
    $feitos = 0; $m = &$st['midias'];
    foreach ($fila['itens'] as &$it) {
        if ($feitos >= $max) break; if (!empty($it['ok'])) continue;
        if ($m['bytes'] >= CX_LIMITE_MIDIAS) { $m['limite'] = true; $m['ativo'] = false; break; }
        [$c, $r] = evo('POST', '/chat/getBase64FromMediaMessage/' . rawurlencode($n), ['message' => ['key' => ['id' => $it['id']]], 'convertToMp4' => false], 60);
        $b64 = is_array($r) ? (string)($r['base64'] ?? '') : ''; $feitos++;
        if ($c < 200 || $c >= 300 || $b64 === '') { $it['ok'] = -1; $m['falhas']++; continue; }
        $bin = base64_decode(preg_replace('#^data:[^,]*,#', '', $b64), true);
        if ($bin === false || $bin === '') { $it['ok'] = -1; $m['falhas']++; continue; }
        if ($m['bytes'] + strlen($bin) > CX_LIMITE_MIDIAS) { $m['limite'] = true; $m['ativo'] = false; break; }
        $mime = strtolower((string)($r['mimetype'] ?? '')); $e = $ext[explode(';', $mime)[0]] ?? 'bin';
        $nome = bin2hex(random_bytes(12)) . '.' . $e;
        if (@file_put_contents("$dir/$nome", $bin) === false) { $it['ok'] = -1; $m['falhas']++; continue; }
        @chmod("$dir/$nome", 0640); $it['ok'] = 1; $it['arq'] = $nome; $m['feitas']++; $m['bytes'] += strlen($bin);
    }
    unset($it);
    if ($m['feitas'] + $m['falhas'] >= $m['total']) { $m['ativo'] = false; $m['concluido'] = time(); }
    cx_gravar_json($ff, $fila); cx_sync_salvar($n, $st); unset($m);
    if ($ant !== null) usar_instancia($ant); else unset($GLOBALS['ZZ_INST']);
}
require_once __DIR__ . '/../cortes.php';


return [
    // Lista todas as conexões (e sincroniza o registro com a Evolution). `ativa` = a selecionada nesta requisição.
    'instancias' => function () {
        $perm = instancias_permitidas();
        $it = array_values(array_filter(cx_lista(!empty($_GET['atualizar'])), fn($i) => in_array($i['nome'], $perm, true)));
        $reg = registro();
        foreach ($it as &$x) { $x['corte'] = (int)($reg[$x['nome']]['corte'] ?? 0); $sy = cx_sync_ler($x['nome']); $x['sync'] = $sy ? ['estado' => $sy['estado'] ?? '', 'fim' => (int)($sy['fim'] ?? 0), 'inicio' => (int)($sy['inicio'] ?? 0), 'resumo' => $sy['resumo'] ?? new stdClass(), 'midias' => $sy['midias'] ?? new stdClass()] : null; }
        unset($x);
        out(['ok' => true, 'ativa' => inst(), 'itens' => $it]);
    },
    // Seleciona a conexão ativa (grava o cookie zz_inst; o front também manda X-Instancia).
    'instancia_selecionar' => function () {
        $n = cx_nome(); cx_existente($n);
        if (!in_array($n, instancias_permitidas(), true)) out(['ok' => false, 'msg' => 'Você não tem acesso a esta conexão.'], 403);
        setcookie('zz_inst', $n, ['expires' => time() + 365 * 86400, 'path' => '/zapzap/', 'secure' => true, 'httponly' => false, 'samesite' => 'Strict']);
        out(['ok' => true, 'ativa' => $n]);
    },
    // Cria uma nova conexão (WhatsApp) e devolve o QR Code para escanear.
    'instancia_criar' => function () {
        $e = entrada(); $n = cx_nome();
        $ap = trim((string)($e['apelido'] ?? '')); $ap = $ap !== '' ? mb_substr($ap, 0, 40) : $n;
        $reg = registro(); if (isset($reg[$n])) out(['ok' => false, 'msg' => 'Já existe uma conexão com esse nome'], 409);
        [$c, $r] = evo_global('POST', '/instance/create', cx_corpo_criar($n), 40);
        if ($c < 200 || $c >= 300) out(['ok' => false, 'msg' => 'A Evolution recusou criar a conexão: ' . substr(json_encode($r['response']['message'] ?? $r['message'] ?? $r, JSON_UNESCAPED_UNICODE), 0, 160)], 502);
        $tok = $r['hash']['apikey'] ?? ($r['hash'] ?? ($r['instance']['token'] ?? ''));
        if (!is_string($tok) || $tok === '') { cx_lista(true); $tok = registro()[$n]['token'] ?? ''; }
        $reg = registro(); $reg[$n] = ['token' => $tok, 'apelido' => $ap, 'protegida' => false, 'hist_ok_ts' => time(), 'sync_pendente' => true]; registro_salvar($reg);
        @unlink(ZZ_DIR . '/cache/_instancias.json');
        $uu = usuario_atual(); if ($uu && !$uu['master'] && (int)$uu['todas_instancias'] !== 1) bd()->prepare('INSERT IGNORE INTO usuario_instancias (usuario_id,instancia) VALUES (?,?)')->execute([$uu['id'], $n]);
        aud_detalhe('criou a conexão ' . $n);
        out(['ok' => true, 'nome' => $n, 'qr' => $r['qrcode']['base64'] ?? null, 'codigo' => $r['qrcode']['pairingCode'] ?? ($r['qrcode']['code'] ?? null)]);
    },
    // (Re)gera o QR de uma conexão desconectada. Também aceita `numero` para código de pareamento.
    'instancia_qr' => function () {
        $n = cx_nome(); $reg = cx_existente($n);
        [$c, $s] = evo_chave($reg['token'] ?: (cfg()['chave_global'] ?? ''), 'GET', "/instance/connectionState/$n", null, 10);
        if (($s['instance']['state'] ?? '') === 'open') out(['ok' => true, 'estado' => 'open', 'qr' => null, 'codigo' => null]);
        $tk = $reg['token'] ?: (cfg()['chave_global'] ?? '');
        if (!cx_protegida($n, $reg) && (int)($reg['hist_ok_ts'] ?? 0) < time() - 600) cx_ligar_historico($n, $tk); // baixar tudo: histórico completo no pareamento
        $num = preg_replace('/\D/', '', (string)(entrada()['numero'] ?? ''));
        [$c, $r] = evo_chave($reg['token'] ?: (cfg()['chave_global'] ?? ''), 'GET', "/instance/connect/$n" . ($num ? "?number=$num" : ''), null, 30);
        if ($c !== 200) out(['ok' => false, 'msg' => 'Não foi possível gerar o QR agora. Tente de novo em instantes.'], 502);
        out(['ok' => true, 'estado' => 'connecting', 'qr' => $r['base64'] ?? null, 'codigo' => $r['pairingCode'] ?? ($r['code'] ?? null)]);
    },
    'instancia_apelido' => function () {
        $n = cx_nome(); cx_existente($n); $ap = trim((string)(entrada()['apelido'] ?? ''));
        if ($ap === '' || mb_strlen($ap) > 40) out(['ok' => false, 'msg' => 'Apelido de 1 a 40 caracteres'], 400);
        $reg = registro(); $reg[$n]['apelido'] = $ap; registro_salvar($reg); @unlink(ZZ_DIR . '/cache/_instancias.json'); out(['ok' => true]);
    },
    // Desconecta o WhatsApp (logout). `limpeza`: 'manter' (só logout) | 'ocultar' (logout + corte: o painel não mostra o que veio antes; reversível)
    // | 'apagar' (logout + exclui e recria a instância com o mesmo nome + apaga as linhas dela no banco; exige `confirmar` = nome). Protegidas nunca.
    'instancia_desconectar' => function () {
        $n = cx_nome(); $reg = cx_existente($n); cx_acesso($n);
        if (cx_protegida($n, $reg)) out(['ok' => false, 'msg' => 'Esta conexão é protegida e não pode ser desconectada pelo painel'], 403);
        $l = (string)(entrada()['limpeza'] ?? 'manter'); if (!in_array($l, ['manter', 'ocultar', 'apagar'], true)) out(['ok' => false, 'msg' => 'Opção de limpeza inválida'], 400);
        if ($l === 'apagar' && (string)(entrada()['confirmar'] ?? '') !== $n) out(['ok' => false, 'msg' => 'Digite o nome da conexão para confirmar'], 400);
        [$c] = evo_global('DELETE', "/instance/logout/$n", null, 20); $logout = $c >= 200 && $c < 300;
        @unlink(ZZ_DIR . '/cache/_instancias.json');
        if ($l === 'manter') { aud_detalhe("desconectou $n (manteve os dados)"); out(['ok' => $logout, 'limpeza' => $l, 'msg' => $logout ? 'Desconectado. Os dados foram mantidos.' : 'Não foi possível desconectar']); }
        if ($l === 'ocultar') {
            // desconectar já fora (conexão estava fechada) também vale: o corte é o que importa
            cx_limpar_arquivos($n, false); cx_reg_set($n, ['corte' => time()], ['sync_pendente', 'sync_ts']);
            aud_detalhe("desconectou $n e ocultou os dados anteriores");
            out(['ok' => true, 'limpeza' => $l, 'msg' => $logout ? 'Desconectado. Os dados anteriores ficam ocultos.' : 'Dados ocultos (o WhatsApp já estava desconectado).']);
        }
        // apagar: exclui e recria a instância com o mesmo nome (dados da Evolution zerados, novo token)
        [$cd] = evo_global('DELETE', "/instance/delete/$n", null, 40);
        if ($cd < 200 || $cd >= 300) out(['ok' => false, 'msg' => 'A Evolution não conseguiu apagar os dados da conexão. Nada foi recriado.'], 502);
        for ($t = 0; $t < 5; $t++) { [$cc, $r] = evo_global('POST', '/instance/create', cx_corpo_criar($n), 40); if ($cc >= 200 && $cc < 300) break; sleep(2); } // a Evolution pode levar instantes para liberar o nome
        $tok = ($cc >= 200 && $cc < 300) ? ($r['hash']['apikey'] ?? ($r['hash'] ?? ($r['instance']['token'] ?? ''))) : '';
        if (!is_string($tok) || $tok === '') {
            if ($cc >= 200 && $cc < 300) { cx_lista(true); $tok = registro()[$n]['token'] ?? ''; }
            if (!is_string($tok) || $tok === '') { $rg = registro(); unset($rg[$n]); registro_salvar($rg); @unlink(ZZ_DIR . '/cache/_instancias.json'); cx_limpar_arquivos($n, true); cx_apagar_dados($n);
                out(['ok' => false, 'msg' => 'Os dados foram apagados, mas não foi possível recriar a conexão. Crie-a de novo com “Conectar novo WhatsApp”.'], 502); }
        }
        $rg = registro(); $rg[$n] = ['token' => $tok, 'apelido' => $rg[$n]['apelido'] ?? $n, 'protegida' => false, 'hist_ok_ts' => time(), 'sync_pendente' => true]; registro_salvar($rg);
        cx_limpar_arquivos($n, true); $dd = cx_apagar_dados($n);
        aud_detalhe("apagou todos os dados de $n (recriada limpa; {$dd['linhas']} linhas no banco)");
        out(['ok' => true, 'limpeza' => $l, 'msg' => 'Tudo apagado. A conexão está limpa e pronta para um novo número.', 'linhas_apagadas' => $dd['linhas'], 'qr' => $r['qrcode']['base64'] ?? null]);
    },
    // Reverte o "Ocultar dados": o painel volta a mostrar tudo que a Evolution guardou.
    'desfazer_ocultar' => function () {
        $n = cx_nome(); $reg = cx_existente($n); cx_acesso($n);
        if (empty($reg['corte'])) out(['ok' => true, 'msg' => 'Os dados já estavam visíveis']);
        cx_reg_set($n, [], ['corte']); cx_rmdir(ZZ_DIR . '/cache/' . $n); aud_detalhe("mostrou de novo os dados de $n");
        out(['ok' => true, 'msg' => 'Dados visíveis de novo']);
    },
    // Sincronização completa (contatos, grupos, conversas, perfil, histórico e, opcional, mídias dos últimos N dias). Roda nesta chamada; o front acompanha por ver_sincronizacao.
    'sincronizar_conexao' => function () {
        $n = cx_nome(); $reg = cx_existente($n); cx_acesso($n);
        [$c, $s] = evo_chave($reg['token'] ?: (cfg()['chave_global'] ?? ''), 'GET', "/instance/connectionState/$n", null, 10);
        if (($s['instance']['state'] ?? '') !== 'open') out(['ok' => false, 'msg' => 'Conecte o WhatsApp antes de sincronizar.'], 409);
        $d = entrada()['midias_dias'] ?? null; $dias = $d === null ? (int)($reg['sync_midias_dias'] ?? 0) : max(0, min(30, (int)$d));
        if ($d !== null) cx_reg_set($n, ['sync_midias_dias' => $dias]);
        aud_detalhe("sincronizou $n" . ($dias ? " (+mídias de $dias dias)" : ''));
        $ok = cx_sincronizar($n, $dias);
        out(['ok' => true, 'ja_rodando' => !$ok, 'msg' => $ok ? 'Sincronização concluída' : 'Já existe uma sincronização em andamento']);
    },
    'cancelar_midias' => function () {
        $n = cx_nome(); cx_existente($n); cx_acesso($n); $st = cx_sync_ler($n);
        if (!$st || empty($st['midias']['ativo'])) out(['ok' => true, 'msg' => 'Nenhum download em andamento']);
        $st['midias']['ativo'] = false; $st['midias']['cancelado'] = true; cx_sync_salvar($n, $st);
        out(['ok' => true, 'msg' => 'Download de mídias cancelado']);
    },
    // Andamento/resumo da sincronização (etapas, contagens, hora, mídias).
    'ver_sincronizacao' => function () {
        $n = (string)($_GET['nome'] ?? ''); if (!nome_instancia_ok($n)) out(['ok' => false, 'msg' => 'Nome inválido'], 400);
        $reg = cx_existente($n); cx_acesso($n); $st = cx_sync_ler($n);
        if ($st && ($st['estado'] ?? '') === 'rodando' && ($st['inicio'] ?? 0) < time() - 400) { $st['estado'] = 'erro'; }
        out(['ok' => true, 'sync' => $st, 'corte' => (int)($reg['corte'] ?? 0), 'protegida' => cx_protegida($n, $reg), 'midias_dias' => (int)($reg['sync_midias_dias'] ?? 0), 'agora' => time()]);
    },
    // Exclui a conexão da Evolution. Exige redigitar o nome. Protegidas nunca.
    'instancia_excluir' => function () {
        $n = cx_nome(); $reg = cx_existente($n);
        if (cx_protegida($n, $reg)) out(['ok' => false, 'msg' => 'Esta conexão é protegida e não pode ser excluída pelo painel'], 403);
        if ((string)(entrada()['confirmar'] ?? '') !== $n) out(['ok' => false, 'msg' => 'Digite o nome da conexão para confirmar'], 400);
        [$c] = evo_global('DELETE', "/instance/delete/$n", null, 30);
        if ($c < 200 || $c >= 300) out(['ok' => false, 'msg' => 'A Evolution não excluiu a conexão'], 502);
        $reg = registro(); unset($reg[$n]); registro_salvar($reg); cx_limpar_arquivos($n, true);
        out(['ok' => true]);
    },
    '__perms' => ['desfazer_ocultar' => 'conexoes.desconectar', 'sincronizar_conexao' => 'conexoes.qr', 'cancelar_midias' => 'conexoes.qr', 'ver_sincronizacao' => 'conexoes.ver'],
];
