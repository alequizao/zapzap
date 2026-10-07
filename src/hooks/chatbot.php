<?php
// ZapZap — Chatbot (fluxos de menu): motor + hook de messages.upsert. Também é carregado por api/chatbot.php (funções cb_*).
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }

if (!function_exists('cb_norm')) {
    function cb_norm(string $s): string {
        $s = mb_strtolower(trim($s), 'UTF-8');
        $s = strtr($s, ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','í'=>'i','ì'=>'i','î'=>'i','ï'=>'i','ó'=>'o','ò'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c']);
        return trim(preg_replace('/\s+/u', ' ', preg_replace('/[^\p{L}\p{N} ]+/u', '', $s)));
    }
    function cb_interpolar(string $t, array $vars): string {
        return preg_replace_callback('/\{([a-z_][a-z0-9_]{0,29})\}/i', function ($m) use ($vars) {
            $k = strtolower($m[1]); return isset($vars[$k]) && is_scalar($vars[$k]) ? (string)$vars[$k] : '';
        }, $t);
    }
    function cb_log(string $evento, ?int $fluxo, ?int $sessao, ?string $jid, ?int $no, ?string $msgId, ?string $texto, bool $sim = false): void {
        try {
            bd()->prepare('INSERT INTO chatbot_logs (ts,instancia,fluxo_id,sessao_id,jid,evento,no_id,msg_id,texto,simulado) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([time(), inst(), $fluxo, $sessao, $jid, $evento, $no, $msgId, $texto === null ? null : mb_substr($texto, 0, 600), (int)$sim]);
        } catch (Throwable $e) { @error_log('[zapzap] chatbot log: ' . $e->getMessage()); }
    }
    function cb_fluxo_get(int $id): ?array {
        $q = bd()->prepare('SELECT * FROM chatbot_fluxos WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        $f = $q->fetch(); if (!$f) return null;
        $f['gatilho'] = json_decode((string)$f['gatilho'], true) ?: ['tipo' => 'primeira_mensagem', 'termos' => []];
        return $f;
    }
    /** Mapa id => ['id','tipo','c'=>conteudo(array),'x','y'] */
    function cb_nos_fluxo(int $fid): array {
        $q = bd()->prepare('SELECT * FROM chatbot_nos WHERE fluxo_id=? ORDER BY id'); $q->execute([$fid]); $m = [];
        foreach ($q->fetchAll() as $r) $m[(int)$r['id']] = ['id' => (int)$r['id'], 'tipo' => $r['tipo'], 'c' => json_decode((string)$r['conteudo'], true) ?: [], 'x' => $r['pos_x'], 'y' => $r['pos_y']];
        return $m;
    }
    function cb_atend_cols(): ?array {
        static $c = false; if ($c !== false) return $c;
        try {
            $q = bd()->prepare("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='atendimentos'"); $q->execute();
            $r = $q->fetchAll(PDO::FETCH_COLUMN); $c = $r ?: null;
        } catch (Throwable $e) { $c = null; }
        return $c;
    }
    /** Há atendimento humano em aberto para o contato? (tolerante à ausência do módulo Filas) */
    function cb_humano_ativo(string $jid): bool {
        $cols = cb_atend_cols(); if (!$cols || !in_array('jid', $cols, true)) return false;
        try {
            $sql = 'SELECT 1 FROM atendimentos WHERE jid=?'; $p = [$jid];
            if (in_array('instancia', $cols, true)) { $sql .= ' AND instancia=?'; $p[] = inst(); }
            if (in_array('status', $cols, true)) $sql .= " AND status NOT IN ('encerrado','encerrada','finalizado','finalizada','fechado','resolvido','concluido','cancelado')";
            $q = bd()->prepare($sql . ' LIMIT 1'); $q->execute($p); return (bool)$q->fetchColumn();
        } catch (Throwable $e) { return false; }
    }
    /** Grava o pedido de atendimento na tabela do módulo Filas, se existir. Devolve true se gravou. */
    function cb_registrar_transferencia(string $jid, ?int $filaId, string $nome): bool {
        $cols = cb_atend_cols(); if (!$cols || !in_array('jid', $cols, true)) return false;
        $v = ['instancia' => inst(), 'jid' => $jid, 'fila_id' => $filaId, 'status' => 'aguardando', 'origem' => 'chatbot', 'nome' => $nome, 'criado' => time(), 'atualizado' => time()];
        $ins = []; foreach ($v as $k => $x) if (in_array($k, $cols, true)) $ins[$k] = $x;
        try {
            bd()->prepare('INSERT INTO atendimentos (' . implode(',', array_keys($ins)) . ') VALUES (' . implode(',', array_fill(0, count($ins), '?')) . ')')->execute(array_values($ins));
            return true;
        } catch (Throwable $e) { @error_log('[zapzap] chatbot transferir: ' . $e->getMessage()); return false; }
    }
    function cb_ip_publico(string $ip): bool { return (bool)filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE); }
    /** Valida URL https externa (SSRF). Devolve [host, ips[], porta] ou string de erro. */
    function cb_url_segura(string $url) {
        $p = parse_url($url);
        if (!$p || strtolower($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || isset($p['pass'])) return 'A URL precisa ser https:// válida';
        $porta = (int)($p['port'] ?? 443); if ($porta !== 443 && $porta !== 8443) return 'Porta não permitida (use 443)';
        $host = $p['host'];
        if (filter_var(trim($host, '[]'), FILTER_VALIDATE_IP)) $ips = [trim($host, '[]')];
        else {
            $ips = gethostbynamel($host) ?: [];
            foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        }
        if (!$ips) return 'Não foi possível resolver o endereço';
        foreach ($ips as $ip) if (!cb_ip_publico($ip)) return 'Endereço bloqueado (rede privada ou reservada)';
        return [$host, $ips, $porta];
    }
    /** Chama o webhook externo. Devolve [ok, texto]. */
    function cb_chamar_webhook(string $url, array $payload): array {
        $r = cb_url_segura($url); if (is_string($r)) return [false, $r];
        [$host, $ips, $porta] = $r;
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE), CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'User-Agent: ZapZap-Chatbot'],
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_RESOLVE => [$host . ':' . $porta . ':' . $ips[0]], CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_WRITEFUNCTION => function ($c, $d) { static $n = 0; $GLOBALS['__cb_wh'] = ($GLOBALS['__cb_wh'] ?? '') . $d; return strlen($d); }]);
        $GLOBALS['__cb_wh'] = ''; curl_exec($ch); $cod = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
        $corpo = mb_substr((string)$GLOBALS['__cb_wh'], 0, 4000); unset($GLOBALS['__cb_wh']);
        if ($cod < 200 || $cod >= 300) return [false, 'HTTP ' . $cod];
        $j = json_decode($corpo, true);
        if (is_array($j)) foreach (['resposta', 'texto', 'text', 'message'] as $k) if (isset($j[$k]) && is_scalar($j[$k])) return [true, mb_substr((string)$j[$k], 0, 500)];
        return [true, mb_substr(trim($corpo), 0, 500)];
    }
    /** Dentro do horário comercial? gatilho.horario = {dias:[1..7],ini:'08:00',fim:'18:00'} (padrão seg–sex 08–18). */
    function cb_em_horario(array $g): bool {
        $h = $g['horario'] ?? []; $dias = $h['dias'] ?? [1, 2, 3, 4, 5]; $ini = $h['ini'] ?? '08:00'; $fim = $h['fim'] ?? '18:00';
        $d = new DateTime('now', new DateTimeZone('America/Maceio'));
        return in_array((int)$d->format('N'), array_map('intval', $dias), true) && $d->format('H:i') >= $ini && $d->format('H:i') < $fim;
    }

    function cb_menu_texto(array $c, array $v): string {
        $t = cb_interpolar((string)($c['texto'] ?? ''), $v); $l = [];
        foreach (($c['opcoes'] ?? []) as $i => $o) $l[] = ($i + 1) . ' - ' . cb_interpolar((string)($o['rotulo'] ?? ''), $v);
        $t = rtrim($t) . "\n\n" . implode("\n", $l);
        if (!empty($v['__pilha'])) $t .= "\n\n0 - Voltar";
        return $t;
    }
    /** Executa nós a partir de $id até esperar resposta ou terminar. Altera $s. Devolve saídas. */
    function cb_avancar(array $fl, array $nos, array &$s, int $id, bool $sim, array $out = []): array {
        for ($i = 0; $i < 25; $i++) {
            $no = $nos[$id] ?? null; if (!$no) { $s['estado'] = 'encerrado'; return $out; }
            $c = $no['c']; $s['no_atual'] = $id; $txt = cb_interpolar((string)($c['texto'] ?? ''), $s['vars']);
            switch ($no['tipo']) {
                case 'mensagem':
                    if ($txt !== '') $out[] = ['t' => 'texto', 'texto' => $txt, 'no' => $id];
                    $nx = (int)($c['proximo_no_id'] ?? 0); if (!$nx) { $s['estado'] = 'encerrado'; return $out; }
                    $id = $nx; break;
                case 'menu':
                    $out[] = ['t' => 'texto', 'texto' => cb_menu_texto($c, $s['vars']), 'no' => $id]; return $out;
                case 'pergunta':
                    if ($txt !== '') $out[] = ['t' => 'texto', 'texto' => $txt, 'no' => $id]; return $out;
                case 'transferir_fila':
                    $out[] = ['t' => 'texto', 'texto' => $txt !== '' ? $txt : 'Certo! Vou te transferir para um atendente. Aguarde um momento.', 'no' => $id];
                    $out[] = ['t' => 'transferir', 'fila_id' => isset($c['fila_id']) ? (int)$c['fila_id'] : null, 'no' => $id];
                    $s['estado'] = 'transferido'; return $out;
                case 'encerrar':
                    if ($txt !== '') $out[] = ['t' => 'texto', 'texto' => $txt, 'no' => $id];
                    $s['estado'] = 'encerrado'; return $out;
                case 'webhook':
                    $var = (string)($c['variavel'] ?? 'resposta_webhook'); if ($var === '') $var = 'resposta_webhook';
                    if ($sim) { $ok = true; $res = '[simulado]'; $out[] = ['t' => 'aviso', 'texto' => 'Webhook simulado (não chamado): ' . mb_substr((string)($c['url'] ?? ''), 0, 120), 'no' => $id]; }
                    else {
                        [$ok, $res] = cb_chamar_webhook((string)($c['url'] ?? ''), ['instancia' => inst(), 'jid' => $s['jid'] ?? '', 'numero' => preg_replace('/\D/', '', explode('@', (string)($s['jid'] ?? ''))[0]), 'nome' => $s['vars']['nome'] ?? '', 'variaveis' => array_filter($s['vars'], fn($k) => $k[0] !== '_', ARRAY_FILTER_USE_KEY)]);
                        $out[] = ['t' => 'aviso', 'texto' => $ok ? 'Webhook respondeu OK' : 'Webhook falhou: ' . $res, 'no' => $id];
                        if (!$ok) $res = '';
                    }
                    $s['vars'][$var] = $res;
                    if ($ok && !empty($c['enviar_resposta']) && trim($res) !== '' && $res !== '[simulado]') $out[] = ['t' => 'texto', 'texto' => $res, 'no' => $id];
                    $nx = (int)($c['proximo_no_id'] ?? 0); if (!$nx) { $s['estado'] = 'encerrado'; return $out; }
                    $id = $nx; break;
                default: $s['estado'] = 'encerrado'; return $out;
            }
        }
        $s['estado'] = 'encerrado'; return $out; // proteção contra laço
    }
    /** Processa uma entrada. $texto===null = início da sessão. Altera $s (no_atual, vars, tentativas, estado). */
    function cb_rodar(array $fl, array $nos, array &$s, ?string $texto, bool $sim): array {
        $out = [];
        if ($texto === null) { $s['tentativas'] = 0; $s['vars']['__pilha'] = []; return cb_avancar($fl, $nos, $s, (int)$fl['no_inicial_id'], $sim, $out); }
        $no = $nos[(int)$s['no_atual']] ?? null;
        if (!$no || !in_array($no['tipo'], ['menu', 'pergunta'], true)) { $s['estado'] = 'encerrado'; return $out; }
        $t = trim($texto); $n = cb_norm($t); $v = &$s['vars'];
        if (in_array($n, ['sair', 'encerrar', 'cancelar'], true)) { $s['estado'] = 'encerrado'; return [['t' => 'texto', 'texto' => 'Atendimento encerrado. Quando precisar, é só chamar!', 'no' => (int)$no['id']]]; }
        $invalido = function () use (&$s, $fl, $no, &$v) {
            $s['tentativas']++;
            if ($s['tentativas'] >= max(1, (int)$fl['tentativas_max'])) {
                if (($fl['ao_exceder'] ?? 'transferir') === 'transferir') { $s['estado'] = 'transferido'; return [['t' => 'texto', 'texto' => 'Não consegui entender. Vou chamar um atendente para te ajudar. Aguarde um momento.', 'no' => (int)$no['id']], ['t' => 'transferir', 'fila_id' => null, 'no' => (int)$no['id'], 'motivo' => 'tentativas']]; }
                $s['estado'] = 'encerrado'; return [['t' => 'texto', 'texto' => 'Não consegui entender sua resposta. Atendimento encerrado. Quando precisar, é só chamar!', 'no' => (int)$no['id']]];
            }
            $o = [['t' => 'invalida', 'texto' => (string)$fl['mensagem_invalida'], 'no' => (int)$no['id']]];
            if ($no['tipo'] === 'menu') $o[] = ['t' => 'texto', 'texto' => cb_menu_texto($no['c'], $v), 'no' => (int)$no['id']];
            elseif (trim((string)($no['c']['texto'] ?? '')) !== '') $o[] = ['t' => 'texto', 'texto' => cb_interpolar((string)$no['c']['texto'], $v), 'no' => (int)$no['id']];
            return $o;
        };
        if ($no['tipo'] === 'menu') {
            if ($n === 'menu' || $n === 'inicio') { $v['__pilha'] = []; return cb_avancar($fl, $nos, $s, (int)$fl['no_inicial_id'], $sim); }
            if ($n === '0' || $n === 'voltar') {
                $pil = $v['__pilha'] ?? [];
                if ($pil) { $id = (int)array_pop($pil); $v['__pilha'] = $pil; $s['tentativas'] = 0; return cb_avancar($fl, $nos, $s, $id, $sim); }
                return [['t' => 'texto', 'texto' => cb_menu_texto($no['c'], $v), 'no' => (int)$no['id']]];
            }
            $ops = $no['c']['opcoes'] ?? []; $esc = null;
            if (preg_match('/^\d{1,2}$/', $n) && isset($ops[(int)$n - 1])) $esc = $ops[(int)$n - 1];
            else foreach ($ops as $o) if ($n !== '' && cb_norm((string)($o['rotulo'] ?? '')) === $n) { $esc = $o; break; }
            if (!$esc) return $invalido();
            $s['tentativas'] = 0; $pil = $v['__pilha'] ?? []; $pil[] = (int)$no['id']; $v['__pilha'] = array_slice($pil, -20);
            $nx = (int)($esc['proximo_no_id'] ?? 0); if (!$nx) { $s['estado'] = 'encerrado'; return []; }
            return cb_avancar($fl, $nos, $s, $nx, $sim);
        }
        // pergunta
        if ($t === '') return $invalido();
        $var = (string)($no['c']['variavel'] ?? ''); if ($var !== '') $v[strtolower($var)] = mb_substr($t, 0, 300);
        $s['tentativas'] = 0; $nx = (int)($no['c']['proximo_no_id'] ?? 0); if (!$nx) { $s['estado'] = 'encerrado'; return []; }
        return cb_avancar($fl, $nos, $s, $nx, $sim);
    }

    function cb_salvar_sessao(array $s): void {
        bd()->prepare('UPDATE chatbot_sessoes SET no_atual=?, vars=?, tentativas=?, atualizada=?, estado=? WHERE id=?')
            ->execute([$s['no_atual'] ?: null, json_encode($s['vars'], JSON_UNESCAPED_UNICODE), (int)$s['tentativas'], time(), $s['estado'], (int)$s['id']]);
    }
    /** Entrega as saídas (envia se ao_vivo; senão só registra). */
    function cb_entregar(array $fl, array $s, array $saidas, string $jid, ?string $msgId): void {
        $vivo = ($fl['modo'] ?? 'teste') === 'ao_vivo'; $fid = (int)$fl['id']; $sid = (int)$s['id']; $primeira = true;
        foreach ($saidas as $o) {
            if ($o['t'] === 'texto' || $o['t'] === 'invalida') {
                $texto = mb_substr($o['texto'], 0, 4000);
                if (!$vivo) { cb_log('enviada', $fid, $sid, $jid, $o['no'] ?? null, null, $texto, true); continue; }
                $q = bd()->prepare("SELECT COUNT(*) FROM chatbot_logs WHERE instancia=? AND jid=? AND evento='enviada' AND simulado=0 AND ts>=?"); $q->execute([inst(), $jid, time() - 60]);
                if ((int)$q->fetchColumn() >= 15) { cb_log('ignorada', $fid, $sid, $jid, null, null, 'limite de envios por minuto (anti-loop)'); return; }
                [$ok, $id, $erro] = zz_enviar_texto($jid, $texto, ['origem' => 'chatbot', 'digitando_ms' => min(3000, 700 + mb_strlen($texto) * 12)]);
                cb_log($ok ? 'enviada' : 'erro', $fid, $sid, $jid, $o['no'] ?? null, $id, $ok ? $texto : ('falha no envio: ' . $erro));
            } elseif ($o['t'] === 'transferir') {
                $gravou = $vivo ? cb_registrar_transferencia($jid, $o['fila_id'], (string)($s['vars']['nome'] ?? '')) : false;
                cb_log('transferida', $fid, $sid, $jid, $o['no'] ?? null, null, ($vivo ? ($gravou ? 'pedido gravado nas Filas' : 'módulo Filas indisponível: apenas registrado') : 'simulado') . (!empty($o['motivo']) ? ' (limite de tentativas)' : '') . ($o['fila_id'] ? ' fila ' . $o['fila_id'] : ''), !$vivo);
            } elseif ($o['t'] === 'aviso') cb_log('webhook', $fid, $sid, $jid, $o['no'] ?? null, null, $o['texto'], !$vivo);
        }
        if ($s['estado'] === 'encerrado') cb_log('encerrada', $fid, $sid, $jid, null, null, null, !$vivo);
    }
    function cb_gatilho_casa(array $fl, array $m, string $jid): bool {
        $g = $fl['gatilho']; $tipo = $g['tipo'] ?? 'primeira_mensagem';
        if (!empty($fl['so_fora_horario']) && cb_em_horario($g)) return false;
        if ($tipo === 'sempre_que_sem_atendimento') return true;
        if ($tipo === 'palavra') {
            $n = ' ' . cb_norm((string)$m['texto']) . ' ';
            foreach (($g['termos'] ?? []) as $t) { $t = cb_norm((string)$t); if ($t !== '' && str_contains($n, ' ' . $t . ' ')) return true; }
            return false;
        }
        // primeira_mensagem: nunca houve conversa registrada com o contato (eventos, 14 dias) nem sessão anterior
        $q = bd()->prepare('SELECT COUNT(*) FROM eventos WHERE instancia=? AND jid=? AND (msg_id IS NULL OR msg_id<>?)'); $q->execute([inst(), $jid, $m['id']]);
        if ((int)$q->fetchColumn() > 0) return false;
        $q = bd()->prepare('SELECT COUNT(*) FROM chatbot_sessoes WHERE instancia=? AND jid=? AND fluxo_id=?'); $q->execute([inst(), $jid, $fl['id']]);
        return (int)$q->fetchColumn() === 0;
    }
    function cb_hook(array $ctx): void {
        $m = $ctx['msg'] ?? null;
        if (!$m || $m['de_mim'] || $m['grupo'] || $m['id'] === '') return;
        $jid = $m['jid']; if (!preg_match('/^[\w.\-]+@(s\.whatsapp\.net|lid)$/', $jid)) return;
        if ($m['ts'] < time() - 600) return;
        $i = inst(); $bd = bd();
        $q = $bd->prepare('SELECT * FROM chatbot_fluxos WHERE instancia=? AND ativo=1 ORDER BY id'); $q->execute([$i]);
        $fluxos = $q->fetchAll(); if (!$fluxos) return;
        $ins = $bd->prepare('INSERT IGNORE INTO chatbot_vistas (instancia,msg_id,ts) VALUES (?,?,?)'); $ins->execute([$i, $m['id'], time()]);
        if ($ins->rowCount() === 0) return; // dedupe
        if (mt_rand(1, 100) === 1) $bd->prepare('DELETE FROM chatbot_vistas WHERE ts<?')->execute([time() - 86400]);
        $lk = 'cb:' . md5($i . $jid); $st = $bd->prepare('SELECT GET_LOCK(?,5)'); $st->execute([$lk]); $st->fetchAll();
        try { cb_hook_locked($ctx, $m, $jid, $fluxos); } finally { try { $st = $bd->prepare('SELECT RELEASE_LOCK(?)'); $st->execute([$lk]); $st->fetchAll(); } catch (Throwable $e) {} }
    }
    function cb_hook_locked(array $ctx, array $m, string $jid, array $fluxos): void {
        $i = inst(); $bd = bd(); $now = time();
        $porId = []; foreach ($fluxos as $f) { $f['gatilho'] = json_decode((string)$f['gatilho'], true) ?: ['tipo' => 'primeira_mensagem']; $porId[(int)$f['id']] = $f; }
        // anti-loop de recebidas
        $q = $bd->prepare("SELECT COUNT(*) FROM chatbot_logs WHERE instancia=? AND jid=? AND evento='recebida' AND ts>=?"); $q->execute([$i, $jid, $now - 60]);
        $rec = (int)$q->fetchColumn();
        if ($rec >= 12) { if ($rec === 12) cb_log('ignorada', null, null, $jid, null, $m['id'], 'muitas mensagens por minuto (anti-loop)'); cb_log('recebida', null, null, $jid, null, $m['id'], null); return; }
        // sessão ativa (expira as velhas)
        $q = $bd->prepare("SELECT * FROM chatbot_sessoes WHERE instancia=? AND jid=? AND estado='ativo' ORDER BY id DESC LIMIT 1"); $q->execute([$i, $jid]);
        $s = $q->fetch();
        if ($s) {
            $fl = $porId[(int)$s['fluxo_id']] ?? null;
            if (!$fl || $now - (int)$s['atualizada'] > (int)$fl['expira_minutos'] * 60) { $bd->prepare("UPDATE chatbot_sessoes SET estado='encerrado' WHERE id=?")->execute([$s['id']]); cb_log('expirada', (int)$s['fluxo_id'], (int)$s['id'], $jid, null, null, null); $s = false; }
        }
        if (cb_humano_ativo($jid)) { cb_log('ignorada', null, null, $jid, null, $m['id'], 'atendimento humano em andamento'); return; }
        cb_log('recebida', $s ? (int)$s['fluxo_id'] : null, $s ? (int)$s['id'] : null, $jid, null, $m['id'], $m['texto']);
        if ($s) {
            $fl = $porId[(int)$s['fluxo_id']]; $nos = cb_nos_fluxo((int)$fl['id']);
            $s['vars'] = json_decode((string)$s['vars'], true) ?: []; $s['jid'] = $jid;
            $out = cb_rodar($fl, $nos, $s, $m['tipo'] === 'texto' ? (string)$m['texto'] : '', ($fl['modo'] ?? 'teste') !== 'ao_vivo');
            cb_salvar_sessao($s); cb_entregar($fl, $s, $out, $jid, $m['id']); return;
        }
        foreach ($porId as $fl) {
            if (!$fl['no_inicial_id'] || !cb_gatilho_casa($fl, $m, $jid)) continue;
            // intervalo de descanso depois de encerrar/transferir
            $q = $bd->prepare("SELECT estado, atualizada FROM chatbot_sessoes WHERE instancia=? AND jid=? AND fluxo_id=? ORDER BY id DESC LIMIT 1"); $q->execute([$i, $jid, $fl['id']]); $ult = $q->fetch();
            if ($ult && $now - (int)$ult['atualizada'] < ($ult['estado'] === 'transferido' ? 1800 : 120) && $ult['estado'] !== 'ativo') continue;
            $nos = cb_nos_fluxo((int)$fl['id']); if (!isset($nos[(int)$fl['no_inicial_id']])) continue;
            $vars = ['nome' => trim((string)$m['nome']) !== '' ? mb_substr(trim((string)$m['nome']), 0, 60) : '', 'numero' => preg_replace('/\D/', '', explode('@', $jid)[0]), '__pilha' => []];
            $bd->prepare('INSERT INTO chatbot_sessoes (instancia,fluxo_id,jid,no_atual,vars,tentativas,iniciada,atualizada,estado) VALUES (?,?,?,?,?,0,?,?,?)')
               ->execute([$i, $fl['id'], $jid, $fl['no_inicial_id'], json_encode($vars, JSON_UNESCAPED_UNICODE), $now, $now, 'ativo']);
            $s = ['id' => (int)$bd->lastInsertId(), 'jid' => $jid, 'no_atual' => (int)$fl['no_inicial_id'], 'vars' => $vars, 'tentativas' => 0, 'estado' => 'ativo'];
            cb_log('inicio', (int)$fl['id'], $s['id'], $jid, null, $m['id'], 'gatilho: ' . ($fl['gatilho']['tipo'] ?? ''), ($fl['modo'] ?? 'teste') !== 'ao_vivo');
            $out = cb_rodar($fl, $nos, $s, null, ($fl['modo'] ?? 'teste') !== 'ao_vivo');
            cb_salvar_sessao($s); cb_entregar($fl, $s, $out, $jid, $m['id']); return;
        }
    }
}

return ['messages.upsert' => function (array $ctx): void { cb_hook($ctx); }];
