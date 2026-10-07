<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — INTEGRAÇÕES: biblioteca de webhooks de saída (SSRF seguro, assinatura HMAC) + hook dos eventos.
// Também é incluída (require_once) por api/integracoes.php e api_publica.php. Segredos nunca vão para logs/respostas.

if (!function_exists('wso_ip_publico')) {
    define('WSO_EVENTOS', ['mensagem_recebida', 'mensagem_enviada', 'conexao']);
    function wso_ip_publico(string $ip): bool {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
        foreach (['100.64.0.0/10', '192.0.0.0/24', '198.18.0.0/15', '0.0.0.0/8', '127.0.0.0/8', '169.254.0.0/16', '::1/128', '::/128', 'fc00::/7', 'fe80::/10', '::ffff:0:0/96', '64:ff9b::/96', '2001:db8::/32'] as $c) if (ip_em_cidr($ip, $c)) return false;
        return true;
    }
    /** Valida URL https e resolve DNS recusando IPs privados. Devolve [erro|null, host, porta, [ips]]. */
    function wso_validar_url(string $url): array {
        $p = parse_url($url);
        if (!$p || strtolower((string)($p['scheme'] ?? '')) !== 'https' || empty($p['host'])) return ['A URL precisa ser https:// válida.', '', 0, []];
        if (isset($p['user']) || isset($p['pass'])) return ['A URL não pode conter usuário/senha.', '', 0, []];
        $host = strtolower(trim((string)$p['host'], '[]')); $porta = (int)($p['port'] ?? 443);
        if ($porta < 1 || $porta > 65535) return ['Porta inválida.', '', 0, []];
        if ($host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.internal') || str_ends_with($host, '.localhost')) return ['Endereço interno não é permitido.', '', 0, []];
        $ips = [];
        if (filter_var($host, FILTER_VALIDATE_IP)) $ips[] = $host;
        else {
            foreach (@dns_get_record($host, DNS_A) ?: [] as $r) if (!empty($r['ip'])) $ips[] = $r['ip'];
            foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        }
        if (!$ips) return ['Não foi possível resolver o endereço (DNS).', '', 0, []];
        foreach ($ips as $ip) if (!wso_ip_publico($ip)) return ['Endereço bloqueado: aponta para rede interna/privada.', '', 0, []];
        return [null, $host, $porta, $ips];
    }
    function wso_chave_seg(): string { return hash_hmac('sha256', 'integracoes|segredo-webhook', chave(), true); }
    function wso_cifrar(string $s): string { $iv = random_bytes(12); $tag = ''; $ct = openssl_encrypt($s, 'aes-256-gcm', wso_chave_seg(), OPENSSL_RAW_DATA, $iv, $tag); return base64_encode($iv . $tag . $ct); }
    function wso_decifrar(string $b): string { $r = base64_decode($b, true); if ($r === false || strlen($r) < 29) return ''; $o = openssl_decrypt(substr($r, 28), 'aes-256-gcm', wso_chave_seg(), OPENSSL_RAW_DATA, substr($r, 0, 12), substr($r, 12, 16)); return $o === false ? '' : $o; }
    /** POST assinado. Devolve ['ok'=>bool,'http'=>int|null,'ms'=>int,'tentativas'=>int,'erro'=>string|null]. 5 s por tentativa, 2 tentativas. */
    function wso_post(string $url, string $segredo, string $evento, string $corpo): array {
        [$e, $host, $porta, $ips] = wso_validar_url($url);
        if ($e) return ['ok' => false, 'http' => null, 'ms' => 0, 'tentativas' => 0, 'erro' => $e];
        $ip = $ips[0]; $ipc = str_contains($ip, ':') ? "[$ip]" : $ip;
        $ass = 'sha256=' . hash_hmac('sha256', $corpo, $segredo);
        $r = ['ok' => false, 'http' => null, 'ms' => 0, 'tentativas' => 0, 'erro' => null];
        for ($t = 1; $t <= 2; $t++) {
            $r['tentativas'] = $t; $ini = microtime(true);
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $corpo, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 4,
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_RESOLVE => ["$host:$porta:$ipc"], CURLOPT_MAXFILESIZE => 1048576,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8', 'X-ZapZap-Evento: ' . $evento, 'X-ZapZap-Assinatura: ' . $ass, 'X-ZapZap-Entrega: ' . bin2hex(random_bytes(8)), 'User-Agent: ZapZap-Webhook/1.0']]);
            $resp = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $cerr = curl_errno($ch); curl_close($ch);
            $r['ms'] = (int)round((microtime(true) - $ini) * 1000); $r['http'] = $code ?: null;
            if ($resp !== false && $code >= 200 && $code < 300) { $r['ok'] = true; $r['erro'] = null; return $r; }
            $r['erro'] = $resp === false ? ($cerr === 28 ? 'Tempo esgotado (5 s)' : 'Falha de conexão') : 'Resposta HTTP ' . $code;
            if ($t < 2) usleep(800000);
        }
        return $r;
    }
    /** Entrega um evento a UM webhook, registra log e controla falhas seguidas (desativa após 10). $teste não conta falhas. */
    function wso_entregar(array $w, string $evento, array $payload, ?string $dedupe = null, bool $teste = false): array {
        $logId = 0;
        if ($dedupe !== null) { // idempotência: a Evolution pode repetir o evento
            try { bd()->prepare('INSERT INTO webhooks_saida_logs (webhook_id,ts,evento,dedupe,ok,tentativas) VALUES (?,?,?,?,0,0)')->execute([$w['id'], time(), $evento, sha1($dedupe)]); $logId = (int)bd()->lastInsertId(); }
            catch (PDOException $e) { return ['ok' => true, 'duplicado' => true]; }
        }
        $corpo = json_encode(['evento' => $evento, 'instancia' => $w['instancia'], 'ts' => time(), 'teste' => $teste, 'dados' => $payload], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        $r = wso_post((string)$w['url'], wso_decifrar((string)$w['segredo_cif']), $evento, $corpo);
        $erro = $r['erro'] !== null ? mb_substr($r['erro'], 0, 190) : null;
        if ($logId) bd()->prepare('UPDATE webhooks_saida_logs SET ok=?,http=?,tentativas=?,ms=?,erro=? WHERE id=?')->execute([(int)$r['ok'], $r['http'], $r['tentativas'], $r['ms'], $erro, $logId]);
        else bd()->prepare('INSERT INTO webhooks_saida_logs (webhook_id,ts,evento,ok,http,tentativas,ms,erro) VALUES (?,?,?,?,?,?,?,?)')->execute([$w['id'], time(), $evento, (int)$r['ok'], $r['http'], $r['tentativas'], $r['ms'], $erro]);
        $st = $r['ok'] ? 'ok (' . $r['http'] . ')' : mb_substr('falha: ' . $erro, 0, 40);
        if ($r['ok']) bd()->prepare('UPDATE webhooks_saida SET falhas_seguidas=0, ultimo_status=?, ultimo_envio=? WHERE id=?')->execute([$st, time(), $w['id']]);
        elseif ($teste) bd()->prepare('UPDATE webhooks_saida SET ultimo_status=?, ultimo_envio=? WHERE id=?')->execute([$st, time(), $w['id']]);
        else {
            bd()->prepare('UPDATE webhooks_saida SET falhas_seguidas=falhas_seguidas+1, ultimo_status=?, ultimo_envio=? WHERE id=?')->execute([$st, time(), $w['id']]);
            bd()->prepare("UPDATE webhooks_saida SET ativo=0, desativado_motivo='Desativado após 10 falhas seguidas' WHERE id=? AND falhas_seguidas>=10")->execute([$w['id']]);
        }
        if (mt_rand(1, 100) === 1) bd()->prepare('DELETE FROM webhooks_saida_logs WHERE ts<?')->execute([time() - 14 * 86400]);
        return $r;
    }
    function wso_disparar(string $instancia, string $evento, array $payload, ?string $dedupe): void {
        $q = bd()->prepare('SELECT * FROM webhooks_saida WHERE instancia=? AND ativo=1'); $q->execute([$instancia]);
        foreach ($q->fetchAll() as $w) {
            if (!in_array($evento, json_decode((string)$w['eventos'], true) ?: [], true)) continue;
            wso_entregar($w, $evento, $payload, $dedupe !== null ? $w['id'] . '|' . $dedupe : null);
        }
    }
    function wso_msg_payload(array $m): array { return ['id' => $m['id'], 'jid' => $m['jid'], 'de_mim' => $m['de_mim'], 'tipo' => $m['tipo'], 'texto' => mb_substr($m['texto'], 0, 4096), 'ts' => $m['ts'], 'nome' => $m['nome'], 'grupo' => $m['grupo'], 'autor' => $m['autor']]; }
}

return [
    'messages.upsert' => function (array $ctx): void {
        $m = $ctx['msg'] ?? null; if (!$m || $m['id'] === '') return;
        wso_disparar($ctx['instancia'], $m['de_mim'] ? 'mensagem_enviada' : 'mensagem_recebida', wso_msg_payload($m), ($m['de_mim'] ? 'env|' : 'rec|') . $m['id']);
    },
    'send.message' => function (array $ctx): void {
        $m = $ctx['msg'] ?? null; if (!$m || $m['id'] === '') return;
        wso_disparar($ctx['instancia'], 'mensagem_enviada', wso_msg_payload($m), 'env|' . $m['id']);
    },
    'connection.update' => function (array $ctx): void {
        $d = $ctx['dados'] ?? []; $est = (string)($d['state'] ?? ''); if ($est === '') return;
        wso_disparar($ctx['instancia'], 'conexao', ['estado' => mb_substr($est, 0, 30)], 'con|' . $est . '|' . intdiv(time(), 30));
    },
];
