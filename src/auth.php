<?php
// ZapZap — banco MySQL, migrações, usuários, sessões, permissões, limite de login e auditoria.
// Incluído por lib.php. Dono: núcleo.
declare(strict_types=1);

/* ---------- IP confiável: só aceita CF-Connecting-IP se a conexão veio da Cloudflare ---------- */
function ip_em_cidr(string $ip, string $cidr): bool {
    [$base, $bits] = explode('/', $cidr); $a = @inet_pton($ip); $b = @inet_pton($base);
    if ($a === false || $b === false || strlen($a) !== strlen($b)) return false;
    $bits = (int)$bits; $bytes = intdiv($bits, 8); $resto = $bits % 8;
    if ($bytes && substr($a, 0, $bytes) !== substr($b, 0, $bytes)) return false;
    if ($resto) { $m = chr((0xFF << (8 - $resto)) & 0xFF); if ((ord($a[$bytes]) & ord($m)) !== (ord($b[$bytes]) & ord($m))) return false; }
    return true;
}
function ip(): string {
    static $r = null; if ($r !== null) return $r;
    $rem = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'; $r = $rem;
    $cf = ['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32'];
    $h = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '';
    if ($h !== '' && filter_var($h, FILTER_VALIDATE_IP)) { foreach ($cf as $c) if (ip_em_cidr($rem, $c)) { $r = $h; break; } }
    return $r;
}

/* ---------- Banco MySQL + migrações (src/migracoes/*.sql, em ordem alfabética) ---------- */
function bd(): PDO {
    static $p = null; if ($p) return $p;
    $c = cfg()['db'];
    $p = new PDO("mysql:host={$c['host']};dbname={$c['nome']};charset=utf8mb4", $c['usuario'], $c['senha'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $p->exec("SET time_zone='-03:00'");
    migrar($p);
    return $p;
}
function migrar(PDO $p): void {
    $dir = __DIR__ . '/migracoes'; $arqs = glob($dir . '/*.sql') ?: []; sort($arqs);
    $sig = md5(implode('|', array_map(fn($f) => basename($f) . filemtime($f), $arqs)));
    $marca = ZZ_DIR . '/cache/mig.' . $sig;
    if (is_file($marca)) return;
    $p->exec('CREATE TABLE IF NOT EXISTS migracoes (nome VARCHAR(120) PRIMARY KEY, hash CHAR(32) NOT NULL, aplicado INT UNSIGNED NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $lock = fopen(ZZ_DIR . '/cache/mig.lock', 'c'); flock($lock, LOCK_EX);
    if (!is_file($marca)) {
        foreach ($arqs as $f) {
            $nome = basename($f); $sql = (string)file_get_contents($f); $h = md5($sql);
            $q = $p->prepare('SELECT hash FROM migracoes WHERE nome=?'); $q->execute([$nome]); $ja = $q->fetchColumn();
            if ($ja === $h) continue;
            foreach (preg_split('/;\s*\n/', $sql) as $st) { $st = trim($st); if ($st === '' || str_starts_with($st, '--') && !str_contains($st, "\n")) continue; $p->exec($st); }
            $p->prepare('REPLACE INTO migracoes (nome,hash,aplicado) VALUES (?,?,?)')->execute([$nome, $h, time()]);
        }
        semear($p);
        foreach (glob(ZZ_DIR . '/cache/mig.*') ?: [] as $m) if ($m !== $marca && $m !== ZZ_DIR . '/cache/mig.lock') @unlink($m);
        @touch($marca);
    }
    flock($lock, LOCK_UN); fclose($lock);
}
/** Primeiro usuário master (só é criado se não existir nenhum usuário). Usuário: cfg()['master_usuario'] (padrão "admin").
 *  Senha: cfg()['master_inicial'] ou, se ausente, uma senha ALEATÓRIA gravada em ZZ_DIR/PRIMEIRA_SENHA.txt (apague após o primeiro login). */
function semear(PDO $p): void {
    if ((int)$p->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) return;
    $usr = (string)(cfg()['master_usuario'] ?? 'admin'); $senha = (string)(cfg()['master_inicial'] ?? ''); $troca = 0;
    if ($senha === '') {
        $senha = substr(strtr(base64_encode(random_bytes(12)), '+/=', 'xyz'), 0, 12); $troca = 1;
        @file_put_contents(ZZ_DIR . '/PRIMEIRA_SENHA.txt', "usuario: $usr\nsenha: $senha\n(apague este arquivo depois do primeiro login)\n"); @chmod(ZZ_DIR . '/PRIMEIRA_SENHA.txt', 0600);
    }
    $p->prepare('INSERT INTO usuarios (usuario,nome,senha_hash,master,ativo,todas_instancias,trocar_senha,criado) VALUES (?,?,?,1,1,1,?,?)')
      ->execute([$usr, ucfirst($usr), password_hash($senha, PASSWORD_DEFAULT), $troca, time()]);
}

/* ---------- Sessões (no servidor, revogáveis) ---------- */
function token_cookie(): string { $t = (string)($_COOKIE[ZZ_COOKIE] ?? ''); return preg_match('/^[a-f0-9]{64}$/', $t) ? $t : ''; }
function sessao_criar(int $uid): void {
    $t = bin2hex(random_bytes(32)); $exp = time() + ZZ_DIAS * 86400;
    bd()->prepare('INSERT INTO sessoes (id,usuario_id,criado,expira,ip,agente) VALUES (?,?,?,?,?,?)')
        ->execute([hash('sha256', $t), $uid, time(), $exp, ip(), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 160)]);
    setcookie(ZZ_COOKIE, $t, ['expires' => $exp, 'path' => '/zapzap/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    $_COOKIE[ZZ_COOKIE] = $t;
}
function auth_clear(): void {
    $t = token_cookie(); if ($t !== '') bd()->prepare('DELETE FROM sessoes WHERE id=?')->execute([hash('sha256', $t)]);
    setcookie(ZZ_COOKIE, '', ['expires' => 1, 'path' => '/zapzap/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
    unset($_COOKIE[ZZ_COOKIE]);
}
/** Revoga TODAS as sessões do usuário (opcionalmente poupando a atual). */
function sessoes_revogar(int $uid, bool $manterAtual = false): void {
    $t = token_cookie();
    if ($manterAtual && $t !== '') bd()->prepare('DELETE FROM sessoes WHERE usuario_id=? AND id<>?')->execute([$uid, hash('sha256', $t)]);
    else bd()->prepare('DELETE FROM sessoes WHERE usuario_id=?')->execute([$uid]);
}
/** Usuário logado (array do banco + 'perms' set) ou null. Cacheado por requisição. */
function usuario_atual(): ?array {
    static $u = false; if ($u !== false) return $u;
    $u = null; $t = token_cookie(); if ($t === '') return null;
    $q = bd()->prepare('SELECT u.* FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.id=? AND s.expira>? AND u.ativo=1');
    $q->execute([hash('sha256', $t), time()]); $r = $q->fetch();
    if (!$r) return null;
    $r['master'] = (int)$r['master'] === 1; $r['perms'] = null; $r['inst_perm'] = null;
    return $u = $r;
}
function auth_ok(): bool { return usuario_atual() !== null; }
function uid(): int { return (int)(usuario_atual()['id'] ?? 0); }
function csrf(): string { return substr(hash_hmac('sha256', 'csrf|' . token_cookie(), chave()), 0, 32); }
function csrf_ok(): bool { $t = $_SERVER['HTTP_X_CSRF'] ?? ($_POST['csrf'] ?? ''); return $t !== '' && token_cookie() !== '' && hash_equals(csrf(), (string)$t); }

/* ---------- Permissões e instâncias permitidas ---------- */
/** Carrega UMA vez todos os api/*.php (eles declaram funções; nunca dar require duas vezes). Devolve a lista de arrays retornados. */
function api_carregar(): array {
    static $l = null; if ($l !== null) return $l;
    $l = []; foreach (glob(__DIR__ . '/api/*.php') ?: [] as $f) { $r = require_once $f; if (is_array($r)) $l[] = $r; }
    return $l;
}
function perm_catalogo(): array { // chave => [grupo, rótulo]
    static $c = null; if ($c !== null) return $c;
    $c = require __DIR__ . '/perms.php';
    foreach (api_carregar() as $r) if (isset($r['__catalogo'])) $c = $r['__catalogo'] + $c;
    return $c;
}
function perms_do_usuario(int $uid): array {
    $q = bd()->prepare('SELECT chave FROM usuario_permissoes WHERE usuario_id=?'); $q->execute([$uid]);
    return array_column($q->fetchAll(), 'chave');
}
/** pode('x.y') ou pode(['a.b','c.d']) (qualquer uma). Master pode tudo. */
function pode(string|array $chaves): bool {
    $u = usuario_atual(); if (!$u) return false; if ($u['master']) return true;
    static $set = null; if ($set === null) $set = array_flip(perms_do_usuario((int)$u['id']));
    foreach ((array)$chaves as $c) if (isset($set[$c])) return true;
    return false;
}
function exigir(string|array $chaves): void { if (!pode($chaves)) out(['ok' => false, 'msg' => 'Você não tem permissão para isto.', 'sem_permissao' => true], 403); }
function exigir_master(): void { $u = usuario_atual(); if (!$u || !$u['master']) out(['ok' => false, 'msg' => 'Somente o usuário master pode fazer isto.', 'sem_permissao' => true], 403); }
/** Instâncias que o usuário atual pode usar (nomes). */
function instancias_permitidas(): array {
    $u = usuario_atual(); if (!$u) return [];
    $todas = array_keys(registro());
    if ($u['master'] || (int)$u['todas_instancias'] === 1) return $todas;
    $q = bd()->prepare('SELECT instancia FROM usuario_instancias WHERE usuario_id=?'); $q->execute([(int)$u['id']]);
    return array_values(array_intersect($todas, array_column($q->fetchAll(), 'instancia')));
}

/* ---------- Limite de tentativas de login (registra ANTES de verificar; sem corrida) ---------- */
function login_limite(string $usuario): int { // devolve segundos de bloqueio (0 = pode tentar); já conta esta tentativa
    $h = fopen(ZZ_DIR . '/tentativas.json', 'c+'); flock($h, LOCK_EX);
    $d = json_decode((string)stream_get_contents($h), true) ?: []; $agora = time();
    foreach ($d as $k => $v) { $d[$k] = array_values(array_filter($v, fn($t) => $t > $agora - 3600)); if (!$d[$k]) unset($d[$k]); }
    $kIp = 'ip:' . ip(); $kU = 'u:' . mb_strtolower($usuario);
    $rec = fn($k) => count(array_filter($d[$k] ?? [], fn($t) => $t > $agora - 900));
    $glob = 0; foreach ($d as $v) $glob += count($v);
    $bloq = 0;
    if ($rec($kIp) >= 8) $bloq = max($bloq, min($d[$kIp]) + 900 - $agora);
    if ($rec($kU) >= 10) $bloq = max($bloq, min($d[$kU]) + 900 - $agora);
    if ($glob >= 80) $bloq = max($bloq, 600);
    if ($bloq <= 0) { $d[$kIp][] = $agora; $d[$kU][] = $agora; }
    ftruncate($h, 0); rewind($h); fwrite($h, json_encode($d)); flock($h, LOCK_UN); fclose($h);
    return (int)max(0, $bloq);
}
function login_sucesso(string $usuario): void {
    $h = fopen(ZZ_DIR . '/tentativas.json', 'c+'); flock($h, LOCK_EX);
    $d = json_decode((string)stream_get_contents($h), true) ?: []; unset($d['ip:' . ip()], $d['u:' . mb_strtolower($usuario)]);
    ftruncate($h, 0); rewind($h); fwrite($h, json_encode($d)); flock($h, LOCK_UN); fclose($h);
}

/* ---------- Auditoria ---------- */
function auditar(string $acao, bool $ok = true, ?string $detalhe = null): void {
    try {
        $u = usuario_atual();
        bd()->prepare('INSERT INTO auditoria (ts,usuario_id,usuario,ip,instancia,acao,ok,detalhe) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([time(), $u['id'] ?? null, $u['usuario'] ?? null, ip(), inst(), mb_substr($acao, 0, 60), $ok ? 1 : 0, $detalhe !== null ? mb_substr($detalhe, 0, 500) : null]);
    } catch (Throwable $e) { @error_log('[zapzap] auditoria: ' . $e->getMessage()); }
}
