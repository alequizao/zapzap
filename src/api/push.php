<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — Web Push: chave pública, assinatura do aparelho, estado e teste. Vale para o usuário logado.
require_once __DIR__ . '/../push_lib.php';

if (!function_exists('push_host_curto')) {
    function push_host_curto(string $e): string { return (string)parse_url($e, PHP_URL_HOST); }
    function push_prefs_limpa($p): ?string {
        if (!is_array($p)) return null; $t = [];
        foreach ((array)($p['tipos'] ?? []) as $k => $v) if (preg_match('/^[a-z]{3,20}$/', (string)$k)) $t[$k] = (bool)$v;
        $h = fn($x, $d) => preg_match('/^\d\d:\d\d$/', (string)$x) ? (string)$x : $d;
        return json_encode(['tipos' => $t, 'nao_perturbe' => !empty($p['nao_perturbe']), 'dnd_ini' => $h($p['dnd_ini'] ?? '', '22:00'), 'dnd_fim' => $h($p['dnd_fim'] ?? '', '07:00')]);
    }
}
return [
    '__catalogo' => [],
    // Qualquer usuário logado com acesso ao painel pode ativar o push no PRÓPRIO aparelho (o servidor sempre filtra por permissão/conexão ao enviar).
    '__perms' => ['ver_push_chave' => 'painel.ver', 'ver_push_estado' => 'painel.ver', 'push_assinar' => 'painel.ver', 'push_cancelar' => 'painel.ver', 'push_testar' => 'painel.ver'],

    'ver_push_chave' => function () { out(['ok' => true, 'chave' => push_vapid()['pub']]); },
    'ver_push_estado' => function () {
        $h = preg_match('/^[a-f0-9]{64}$/', (string)($_GET['h'] ?? '')) ? $_GET['h'] : '';
        $q = bd()->prepare('SELECT id,endpoint_hash,agente,criado,ultimo_ok,falhas FROM push_assinaturas WHERE usuario_id=? ORDER BY id DESC'); $q->execute([uid()]);
        $l = array_map(fn($r) => ['id' => (int)$r['id'], 'agente' => $r['agente'], 'criado' => (int)$r['criado'], 'ultimo_ok' => $r['ultimo_ok'] !== null ? (int)$r['ultimo_ok'] : null, 'falhas' => (int)$r['falhas'], 'este' => $h !== '' && $r['endpoint_hash'] === $h], $q->fetchAll());
        out(['ok' => true, 'aparelhos' => $l, 'este_registrado' => (bool)array_filter($l, fn($x) => $x['este'])]);
    },
    'push_assinar' => function () {
        $e = entrada(); $ep = trim((string)($e['endpoint'] ?? '')); $k = (array)($e['keys'] ?? []);
        if (!push_endpoint_ok($ep)) out(['ok' => false, 'msg' => 'Este navegador usa um serviço de notificação não suportado.'], 422);
        $p = push_b64u_dec((string)($k['p256dh'] ?? '')); $a = push_b64u_dec((string)($k['auth'] ?? ''));
        if ($p === false || strlen($p) !== 65 || $p[0] !== "\x04" || $a === false || strlen($a) !== 16) out(['ok' => false, 'msg' => 'Chaves da assinatura inválidas.'], 422);
        $hash = hash('sha256', $ep); $ag = mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 160); $pf = push_prefs_limpa($e['prefs'] ?? null);
        bd()->prepare('INSERT INTO push_assinaturas (usuario_id,endpoint_hash,endpoint,p256dh,auth,agente,prefs,criado,falhas) VALUES (?,?,?,?,?,?,?,?,0)
            ON DUPLICATE KEY UPDATE usuario_id=VALUES(usuario_id), p256dh=VALUES(p256dh), auth=VALUES(auth), agente=VALUES(agente), prefs=COALESCE(VALUES(prefs),prefs), falhas=0')
            ->execute([uid(), $hash, $ep, (string)$k['p256dh'], (string)$k['auth'], $ag, $pf, time()]);
        // no máximo 10 aparelhos por usuário (descarta os mais antigos)
        bd()->prepare('DELETE FROM push_assinaturas WHERE usuario_id=? AND id NOT IN (SELECT id FROM (SELECT id FROM push_assinaturas WHERE usuario_id=? ORDER BY id DESC LIMIT 10) t)')->execute([uid(), uid()]);
        aud_detalhe('ativou notificações no aparelho (' . push_host_curto($ep) . ')');
        out(['ok' => true, 'h' => $hash]);
    },
    'push_cancelar' => function () {
        $ep = trim((string)(entrada()['endpoint'] ?? '')); if ($ep === '') out(['ok' => false, 'msg' => 'Informe o aparelho.'], 422);
        bd()->prepare('DELETE FROM push_assinaturas WHERE usuario_id=? AND endpoint_hash=?')->execute([uid(), hash('sha256', $ep)]);
        aud_detalhe('desativou notificações no aparelho'); out(['ok' => true]);
    },
    'push_testar' => function () {
        $q = bd()->prepare('SELECT * FROM push_assinaturas WHERE usuario_id=?'); $q->execute([uid()]); $subs = $q->fetchAll();
        if (!$subs) out(['ok' => false, 'msg' => 'Nenhum aparelho ativado. Ative as notificações primeiro.'], 422);
        [$ok, $ruim] = push_enviar($subs, ['titulo' => 'ZapZap', 'texto' => 'Teste: as notificações no aparelho estão funcionando.', 'rota' => '', 'tag' => 'teste', 'instancia' => inst(), 'tipo' => 'mensagem'], 'high', 600);
        aud_detalhe("teste de push: $ok ok, $ruim falha(s)");
        out(['ok' => $ok > 0, 'enviados' => $ok, 'falhas' => $ruim, 'msg' => $ok > 0 ? "Teste enviado a $ok aparelho(s)." : 'Não foi possível entregar o teste. Reative as notificações.'], $ok > 0 ? 200 : 502);
    },
];
