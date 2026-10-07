<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — Web Push sem Composer: VAPID (RFC 8292), criptografia aes128gcm (RFC 8291) e envio (RFC 8030).
// Segredos (chave privada VAPID, chaves p256dh/auth) nunca vão para logs nem respostas.

if (!function_exists('push_notificar')) {
    define('PUSH_SUB', 'mailto:' . ((string)(cfg()['email_dev'] ?? '') ?: 'admin@example.com'));
    function push_b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
    function push_b64u_dec(string $s): string|false { return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true); }
    function push_chave_kv(): string { return hash_hmac('sha256', 'push|vapid', chave(), true); }
    function push_kv_cifrar(string $s): string { $iv = random_bytes(12); $tag = ''; $ct = openssl_encrypt($s, 'aes-256-gcm', push_chave_kv(), OPENSSL_RAW_DATA, $iv, $tag); return base64_encode($iv . $tag . $ct); }
    function push_kv_decifrar(string $b): string { $r = base64_decode($b, true); if ($r === false || strlen($r) < 29) return ''; $o = openssl_decrypt(substr($r, 28), 'aes-256-gcm', push_chave_kv(), OPENSSL_RAW_DATA, substr($r, 0, 12), substr($r, 12, 16)); return $o === false ? '' : $o; }
    /** Ponto público P-256 não comprimido (65 bytes) de uma chave openssl. */
    function push_ponto_publico($pkey): string { $d = openssl_pkey_get_details($pkey)['ec']; return "\x04" . str_pad($d['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['y'], 32, "\0", STR_PAD_LEFT); }
    /** Chaves VAPID: gera uma vez (sob trava) e guarda em config_kv; a privada vai criptografada. Devolve ['pub'=>base64url, 'priv'=>PEM]. */
    function push_vapid(): array {
        static $c = null; if ($c) return $c;
        $ler = function () { $r = []; foreach (bd()->query("SELECT chave,valor FROM config_kv WHERE chave IN ('vapid_pub','vapid_priv')")->fetchAll() as $x) $r[$x['chave']] = $x['valor']; return $r; };
        $r = $ler();
        if (empty($r['vapid_pub']) || empty($r['vapid_priv'])) {
            $l = fopen(ZZ_DIR . '/cache/push.lock', 'c'); flock($l, LOCK_EX);
            $r = $ler();
            if (empty($r['vapid_pub']) || empty($r['vapid_priv'])) {
                $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
                if (!$k) throw new RuntimeException('falha ao gerar chaves VAPID');
                openssl_pkey_export($k, $pem);
                $st = bd()->prepare('REPLACE INTO config_kv (chave,valor,atualizado) VALUES (?,?,?)');
                $st->execute(['vapid_priv', push_kv_cifrar($pem), time()]); $st->execute(['vapid_pub', push_b64u(push_ponto_publico($k)), time()]);
                $r = $ler();
            }
            flock($l, LOCK_UN); fclose($l);
        }
        return $c = ['pub' => $r['vapid_pub'], 'priv' => push_kv_decifrar($r['vapid_priv'])];
    }
    function push_der_para_raw(string $der): string { // ECDSA DER -> R||S (64 bytes)
        $o = 3; $lr = ord($der[$o]); $r = substr($der, $o + 1, $lr); $o += 1 + $lr + 1; $ls = ord($der[$o]); $s = substr($der, $o + 1, $ls);
        return str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT) . str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);
    }
    /** Cabeçalho Authorization VAPID para o endpoint (aud = origem; exp ≤ 12 h). */
    function push_vapid_auth(string $endpoint): string {
        $v = push_vapid(); $p = parse_url($endpoint); $aud = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
        $in = push_b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256'])) . '.' . push_b64u(json_encode(['aud' => $aud, 'exp' => time() + 11 * 3600, 'sub' => PUSH_SUB]));
        openssl_sign($in, $der, openssl_pkey_get_private($v['priv']), OPENSSL_ALGO_SHA256);
        return 'vapid t=' . $in . '.' . push_b64u(push_der_para_raw($der)) . ', k=' . $v['pub'];
    }
    /** Criptografia RFC 8291 (aes128gcm, um registro). $asPriv/$salt só para testes com vetores. */
    function push_cifrar(string $texto, string $p256dh_b64u, string $auth_b64u, $asPriv = null, ?string $salt = null): string {
        $ua = push_b64u_dec($p256dh_b64u); $auth = push_b64u_dec($auth_b64u);
        if ($ua === false || strlen($ua) !== 65 || $ua[0] !== "\x04" || $auth === false || strlen($auth) !== 16) throw new InvalidArgumentException('chaves da assinatura inválidas');
        $as = $asPriv ?: openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $asPub = push_ponto_publico($as);
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $ua), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $ecdh = openssl_pkey_derive(openssl_pkey_get_public($pem), $as, 32);
        if ($ecdh === false) throw new RuntimeException('falha no ECDH');
        $salt = $salt ?? random_bytes(16);
        $ikm = hash_hkdf('sha256', $ecdh, 32, "WebPush: info\0" . $ua . $asPub, $auth);
        $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
        $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
        $tag = ''; $ct = openssl_encrypt($texto . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
        return $salt . pack('N', 4096) . chr(65) . $asPub . $ct . $tag;
    }
    function push_endpoint_ok(string $e): bool {
        if (strlen($e) > 500) return false; $p = parse_url($e);
        if (!$p || strtolower((string)($p['scheme'] ?? '')) !== 'https' || empty($p['host']) || isset($p['user']) || (isset($p['port']) && (int)$p['port'] !== 443)) return false;
        $h = strtolower($p['host']);
        foreach (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'android.googleapis.com'] as $d) if ($h === $d) return true;
        if (preg_match('/^jmt\d{1,3}\.google\.com$/', $h)) return true;
        foreach (['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com'] as $suf) if (str_ends_with($h, $suf) && strlen($h) > strlen($suf)) return true;
        return false;
    }
    /** Envia $payload (array) a várias assinaturas (linhas de push_assinaturas) em paralelo. Trata 404/410 e falhas seguidas. Devolve [enviados, falhas]. */
    function push_enviar(array $subs, array $payload, string $urgency = 'normal', int $ttl = 3600): array {
        if (!$subs) return [0, 0];
        $corpo = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        $mh = curl_multi_init(); $hs = [];
        foreach ($subs as $s) {
            try {
                $dados = push_cifrar($corpo, $s['p256dh'], $s['auth']);
                $ch = curl_init($s['endpoint']);
                curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $dados, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                    CURLOPT_HTTPHEADER => ['Content-Type: application/octet-stream', 'Content-Encoding: aes128gcm', 'TTL: ' . $ttl, 'Urgency: ' . $urgency, 'Authorization: ' . push_vapid_auth($s['endpoint'])]]);
                curl_multi_add_handle($mh, $ch); $hs[(int)$s['id']] = $ch;
            } catch (Throwable $e) { push_resultado((int)$s['id'], 0); }
        }
        do { $st = curl_multi_exec($mh, $ativo); if ($ativo) curl_multi_select($mh, 1.0); } while ($ativo && $st === CURLM_OK);
        $ok = 0; $ruim = 0;
        foreach ($hs as $id => $ch) {
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_multi_remove_handle($mh, $ch); curl_close($ch);
            push_resultado($id, $code) ? $ok++ : $ruim++;
        }
        curl_multi_close($mh);
        return [$ok, $ruim];
    }
    function push_resultado(int $id, int $code): bool {
        if ($code >= 200 && $code < 300) { bd()->prepare('UPDATE push_assinaturas SET ultimo_ok=?, falhas=0 WHERE id=?')->execute([time(), $id]); return true; }
        if ($code === 404 || $code === 410) { bd()->prepare('DELETE FROM push_assinaturas WHERE id=?')->execute([$id]); return false; }
        bd()->prepare('UPDATE push_assinaturas SET falhas=falhas+1 WHERE id=?')->execute([$id]);
        bd()->prepare('DELETE FROM push_assinaturas WHERE id=? AND falhas>=5')->execute([$id]);
        return false;
    }
    function push_em_nao_perturbe(array $pf): bool {
        if (empty($pf['nao_perturbe']) && empty($pf['dnd'])) return false;
        $i = (string)($pf['dnd_ini'] ?? '22:00'); $f = (string)($pf['dnd_fim'] ?? '07:00');
        if (!preg_match('/^\d\d:\d\d$/', $i) || !preg_match('/^\d\d:\d\d$/', $f)) return false;
        $n = (new DateTimeImmutable('now', new DateTimeZone('America/Maceio')))->format('H:i');
        return $i <= $f ? ($n >= $i && $n < $f) : ($n >= $i || $n < $f);
    }
    /** Assinaturas de quem PODE ver: usuário-alvo, ou todos com a permissão `perm` e acesso à `instancia` (master vê tudo). */
    function push_destinatarios(string $inst, string $tipo, array $o): array {
        $sql = 'SELECT s.*, u.master, u.todas_instancias FROM push_assinaturas s JOIN usuarios u ON u.id=s.usuario_id WHERE u.ativo=1';
        $par = [];
        if (!empty($o['usuario_id'])) { $sql .= ' AND u.id=?'; $par[] = (int)$o['usuario_id']; }
        $q = bd()->prepare($sql); $q->execute($par); $res = [];
        $perm = (string)($o['perm'] ?? '');
        foreach ($q->fetchAll() as $s) {
            $uid = (int)$s['usuario_id'];
            if (!(int)$s['master']) {
                if ($perm !== '') { $p = bd()->prepare('SELECT 1 FROM usuario_permissoes WHERE usuario_id=? AND chave=?'); $p->execute([$uid, $perm]); if (!$p->fetchColumn()) continue; }
                if (!(int)$s['todas_instancias']) { $p = bd()->prepare('SELECT 1 FROM usuario_instancias WHERE usuario_id=? AND instancia=?'); $p->execute([$uid, $inst]); if (!$p->fetchColumn()) continue; }
            }
            $pf = json_decode((string)$s['prefs'], true) ?: [];
            if (isset($pf['tipos'][$tipo]) && !$pf['tipos'][$tipo]) continue;
            if (push_em_nao_perturbe($pf)) continue;
            $res[] = $s;
        }
        return $res;
    }
    /** Gancho chamado por notificar(). Nunca lança exceção. */
    function push_notificar(string $inst, string $tipo, string $titulo, string $texto, array $o): void {
        try {
            $subs = push_destinatarios($inst, $tipo, $o); if (!$subs) return;
            $rota = (string)($o['rota'] ?? '');
            $tag = mb_substr($tipo . ':' . ($o['jid'] ?? ($o['ref'] ?? ($rota ?: $titulo))), 0, 80);
            push_enviar($subs, ['titulo' => mb_substr($titulo, 0, 80), 'texto' => mb_substr($texto, 0, 140), 'rota' => mb_substr($rota, 0, 160), 'tag' => $tag, 'instancia' => $inst, 'tipo' => $tipo],
                in_array($tipo, ['mensagem', 'atendimento', 'conexao'], true) ? 'high' : 'normal');
        } catch (Throwable $e) { @error_log('[zapzap] push_notificar: ' . $e->getMessage()); }
    }
}
