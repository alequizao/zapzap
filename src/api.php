<?php
// ZapZap — API JSON do painel (proxy seguro para a Evolution API; a chave nunca vai ao navegador).
// Cada arquivo em api/*.php retorna ['acao' => callable, ..., '__perms' => ['acao' => 'chave'|['a','b']], '__catalogo' => ['chave'=>[grupo,rótulo]]].
// Ação SEM permissão declarada em '__perms' (e fora da lista livre) = somente master.
require __DIR__ . '/lib.php';
no_cache();
header('Content-Type: application/json; charset=utf-8');

$a = $_GET['a'] ?? '';
$LIVRES = ['status', 'eu', 'sair', 'instancias', 'instancia_selecionar', 'visita', 'trocar_senha', 'versao', 'ver_notificacoes', 'ver_central', 'marcar_notificacoes_vistas', 'ver_push_chave', 'ver_push_estado', 'push_assinar', 'push_cancelar', 'push_testar'];

// ---- Login / versão (únicas ações sem sessão) ----
if ($a === 'login') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'msg' => 'Método inválido'], 405);
    $e = entrada(); $usr = trim((string)($e['usuario'] ?? '')); $senha = (string)($e['senha'] ?? '');
    if ($usr === '' || $senha === '' || mb_strlen($usr) > 40 || strlen($senha) > 200) out(['ok' => false, 'msg' => 'Informe usuário e senha'], 400);
    if (($b = login_limite($usr)) > 0) { auditar('login', false, 'bloqueado por tentativas: ' . mb_substr($usr, 0, 40)); out(['ok' => false, 'msg' => 'Muitas tentativas. Aguarde ' . max(1, (int)ceil($b / 60)) . ' min.'], 429); }
    $q = bd()->prepare('SELECT * FROM usuarios WHERE usuario=?'); $q->execute([$usr]); $u = $q->fetch();
    $ok = password_verify($senha, $u['senha_hash'] ?? '$2y$10$q5qeaRIwnjOj7NHvgnv.iOUFR/.8nhKCuUGt2Maol86jc7XWRdcbi');
    if (!$u || !$ok || (int)$u['ativo'] !== 1) {
        usleep(500000); auditar('login', false, 'falha: ' . mb_substr($usr, 0, 40) . ($u && (int)$u['ativo'] !== 1 ? ' (desativado)' : ''));
        out(['ok' => false, 'msg' => ($u && $ok && (int)$u['ativo'] !== 1) ? 'Usuário desativado. Fale com o administrador.' : 'Usuário ou senha incorretos'], 401);
    }
    login_sucesso($usr); sessao_criar((int)$u['id']);
    bd()->prepare('UPDATE usuarios SET ultimo_login=?, ultimo_ip=? WHERE id=?')->execute([time(), ip(), $u['id']]);
    $GLOBALS['__u_login'] = $u; $_COOKIE['zz_dummy'] = 1;
    bd()->prepare('INSERT INTO auditoria (ts,usuario_id,usuario,ip,instancia,acao,ok,detalhe) VALUES (?,?,?,?,NULL,?,1,?)')->execute([time(), $u['id'], $u['usuario'], ip(), 'login', mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200)]);
    out(['ok' => true, 'nome' => $u['nome'], 'trocar_senha' => (int)$u['trocar_senha'] === 1]);
}
if ($a === 'versao') out(['versao' => ZZ_VERSAO]);

if (!auth_ok()) out(['ok' => false, 'msg' => 'Sessão expirada', 'login' => true], 401);
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !csrf_ok()) out(['ok' => false, 'msg' => 'Token inválido, recarregue a página'], 403);

// ---- Instância (WhatsApp) ativa: header X-Instancia > cookie zz_inst > primeira permitida ----
$__perm = instancias_permitidas();
$__i = $_SERVER['HTTP_X_INSTANCIA'] ?? ($_COOKIE['zz_inst'] ?? '');
if ($__i !== '' && nome_instancia_ok($__i) && in_array($__i, $__perm, true)) usar_instancia($__i);
elseif ($__perm) usar_instancia(in_array(cfg()['instancia'], $__perm, true) ? cfg()['instancia'] : $__perm[0]);
else $GLOBALS['ZZ_SEM_INSTANCIA'] = true;

$ROTAS = [
    'sair' => function () { auditar('sair'); auth_clear(); out(['ok' => true]); },
    'eu' => function () {
        $u = usuario_atual();
        $perms = $u['master'] ? array_keys(perm_catalogo()) : perms_do_usuario((int)$u['id']);
        out(['ok' => true, 'usuario' => ['id' => (int)$u['id'], 'usuario' => $u['usuario'], 'nome' => $u['nome'], 'master' => $u['master'], 'trocar_senha' => (int)$u['trocar_senha'] === 1],
             'perms' => array_values($perms), 'instancias' => instancias_permitidas(), 'assinatura' => assinatura_nome()]);
    },
    // Registra que o usuário abriu uma página do painel (histórico de atividade). Silencioso, no máximo 1 por página/30 s.
    'visita' => function () {
        $p = preg_replace('/[^a-z0-9_\-]/i', '', (string)(entrada()['pagina'] ?? '')); if ($p === '') out(['ok' => true]);
        $f = ZZ_DIR . '/cache/visita.' . uid() . '.' . $p; if (is_file($f) && filemtime($f) > time() - 30) out(['ok' => true]); @touch($f);
        aud_detalhe('abriu: ' . $p); out(['ok' => true]);
    },
    'status' => function () {
        if (!empty($GLOBALS['ZZ_SEM_INSTANCIA'])) out(['ok' => true, 'estado' => 'sem_conexao', 'nome' => '', 'foto' => '', 'numero' => '', 'msgs' => 0, 'contatos' => 0, 'chats' => 0]);
        $i = inst();
        [$c1, $e] = evo('GET', "/instance/connectionState/" . rawurlencode($i), null, 10);
        [, $f] = evo('GET', "/instance/fetchInstances?instanceName=" . rawurlencode($i), null, 10);
        $f = $f[0] ?? [];
        out(['ok' => $c1 === 200, 'estado' => $e['instance']['state'] ?? 'desconhecido',
             'nome' => $f['profileName'] ?? '', 'foto' => $f['profilePicUrl'] ?? '',
             'numero' => preg_replace('/\D/', '', explode('@', $f['ownerJid'] ?? '')[0]),
             'msgs' => $f['_count']['Message'] ?? 0, 'contatos' => $f['_count']['Contact'] ?? 0, 'chats' => $f['_count']['Chat'] ?? 0]);
    },
];
$PERMS = [];
foreach (api_carregar() as $r) {
    if (isset($r['__perms'])) $PERMS = $r['__perms'] + $PERMS;
    unset($r['__perms'], $r['__catalogo']);
    $ROTAS = $r + $ROTAS;
}

if (!isset($ROTAS[$a])) out(['ok' => false, 'msg' => 'Ação desconhecida'], 404);

// Ações que alteram estado: só por POST (defesa extra além do CSRF). Convenção: GET só lê.
$SO_LEITURA = ['status', 'eu', 'instancias', 'versoes', 'dash', 'chats', 'msgs', 'midia', 'contatos', 'grupos', 'grupo', 'convite', 'historico', 'status_msg', 'exportar_csv', 'agendadas', 'config_info', 'qr', 'exportar_atividade_csv', 'exportar_auditoria_csv', 'exportar_relatorio_csv'];
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && !in_array($a, $SO_LEITURA, true) && !str_starts_with($a, 'ver_') && !str_starts_with($a, 'listar_') && !str_starts_with($a, 'rel_')) out(['ok' => false, 'msg' => 'Método inválido'], 405);

// Permissão por ação (default-deny: sem declaração = master)
if (!in_array($a, $LIVRES, true)) {
    if (isset($PERMS[$a])) exigir($PERMS[$a]); else exigir_master();
    if (!empty($GLOBALS['ZZ_SEM_INSTANCIA']) && !str_starts_with($a, 'usuario') && !in_array($a, ['auditoria', 'ver_auditoria', 'versoes'], true) && !isset($PERMS['__sem_instancia'][$a])) out(['ok' => false, 'msg' => 'Nenhuma conexão (WhatsApp) liberada para o seu usuário.', 'sem_conexao' => true], 403);
}

// Auditoria automática: toda ação POST e leituras sensíveis ficam no histórico do usuário (sem conteúdo de mensagens)
$AUDITAR_GET = ['midia', 'convite', 'exportar_csv', 'rel_exportar', 'exportar_atividade_csv', 'listar_atividade_csv', 'exportar_auditoria_csv', 'exportar_relatorio_csv'];
if ($_SERVER['REQUEST_METHOD'] === 'POST' || in_array($a, $AUDITAR_GET, true)) {
    register_shutdown_function(function () use ($a) {
        $cod = http_response_code(); $cod = $cod ?: 200;
        auditar($a, $cod < 400, $GLOBALS['ZZ_AUD_DET'] ?? null);
    });
}
try { $ROTAS[$a](); }
catch (Throwable $e) {
    @error_log('[zapzap] ' . $a . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    out(['ok' => false, 'msg' => 'Erro interno. Tente de novo em instantes.'], 500);
}
