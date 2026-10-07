<?php
// ZapZap — API PÚBLICA para sistemas do dono. https://alequizao.com/zapzap/api_publica.php?acao=…
// Auth: Authorization: Bearer zz_…  | JSON | sem cookie/CSRF | CORS fechado | limite por token (janela deslizante de 60 s).
require __DIR__ . '/lib.php';
require_once __DIR__ . '/hooks/integracoes.php';
no_cache();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function ap_out(array $d, int $code = 200): never {
    if (!empty($GLOBALS['AP_TOK'])) ap_uso($code, $d['msg'] ?? null);
    if ($code === 401) header('WWW-Authenticate: Bearer realm="zapzap"');
    out($d, $code);
}
function ap_uso(int $code, ?string $det = null): void {
    static $feito = false; if ($feito) return; $feito = true; $t = $GLOBALS['AP_TOK'];
    try {
        bd()->prepare('INSERT INTO api_usos (token_id,ts,acao,ip,ok,http,detalhe) VALUES (?,?,?,?,?,?,?)')->execute([$t['id'], time(), $GLOBALS['AP_ACAO'], ip(), $code < 400 ? 1 : 0, $code, $det !== null ? mb_substr($det, 0, 200) : null]);
        bd()->prepare('UPDATE api_tokens SET ultimo_uso=?, usos=usos+1 WHERE id=?')->execute([time(), $t['id']]);
        auditar('api:' . $GLOBALS['AP_ACAO'], $code < 400, 'token #' . $t['id'] . ' (' . mb_substr($t['nome'], 0, 40) . ') HTTP ' . $code . ($GLOBALS['AP_DET'] ?? ''));
        if (mt_rand(1, 100) === 1) bd()->prepare('DELETE FROM api_usos WHERE ts<?')->execute([time() - 30 * 86400]);
    } catch (Throwable $e) { @error_log('[zapzap] api_publica uso: ' . $e->getMessage()); }
}
function ap_jid(string $x): string {
    $d = destino($x);
    if ($d === '') ap_out(['ok' => false, 'msg' => 'Informe o destinatário em "numero".'], 422);
    if (str_contains($d, '@')) {
        if (!preg_match('/^[0-9A-Za-z._:-]{3,60}@(s\.whatsapp\.net|g\.us|lid)$/', $d)) ap_out(['ok' => false, 'msg' => 'Identificador de conversa inválido.'], 422);
        return $d;
    }
    if (!preg_match('/^\d{10,15}$/', $d)) ap_out(['ok' => false, 'msg' => 'Número inválido. Use DDI + DDD + número, ex.: 5582999999999.'], 422);
    return $d;
}

$acao = preg_replace('/[^a-z_]/', '', (string)($_GET['acao'] ?? ''));
$metodo = $_SERVER['REQUEST_METHOD'];
$AJUDA = [
    'ok' => true, 'nome' => 'ZapZap API', 'versao' => 1, 'base' => 'https://alequizao.com/zapzap/api_publica.php?acao=<acao>',
    'autenticacao' => 'Header "X-API-Token: zz_…" (recomendado neste servidor) ou "Authorization: Bearer zz_…" (token criado no painel, em Integrações). O token vale para UMA conexão e só tem os escopos marcados.',
    'limite' => 'Por token, por minuto (janela deslizante de 60 s). Excedeu: HTTP 429 com Retry-After.',
    'assinatura' => 'Toda mensagem sai assinada com o nome configurado no token: "*Assinatura:*" + quebra de linha + texto. Não dá para desligar.',
    'erros' => 'Sempre JSON {"ok":false,"msg":"…"} com HTTP 4xx/5xx.',
    'acoes' => [
        'ajuda' => ['metodo' => 'GET', 'escopo' => '(nenhum, sem token)', 'descricao' => 'Esta documentação.'],
        'status' => ['metodo' => 'GET', 'escopo' => 'consultar_status', 'descricao' => 'Estado da conexão.', 'exemplo' => 'curl -H "X-API-Token: $TOKEN" "https://alequizao.com/zapzap/api_publica.php?acao=status"'],
        'enviar_texto' => ['metodo' => 'POST JSON', 'escopo' => 'enviar_texto', 'corpo' => ['numero' => '5582999999999 (ou JID)', 'texto' => '1 a 4000 caracteres'], 'exemplo' => 'curl -X POST -H "X-API-Token: $TOKEN" -H "Content-Type: application/json" -d \'{"numero":"5582999999999","texto":"Olá!"}\' "https://alequizao.com/zapzap/api_publica.php?acao=enviar_texto"'],
        'enviar_midia' => ['metodo' => 'POST JSON', 'escopo' => 'enviar_midia', 'corpo' => ['numero' => '…', 'url' => 'https público (ou use base64)', 'base64' => 'conteúdo em base64 (até 25 MB)', 'mime' => 'image/png, image/jpeg, image/webp, image/gif, video/mp4, audio/mpeg, audio/ogg, audio/mp4, application/pdf, doc(x), xls(x), text/plain, application/zip', 'nome' => 'arquivo.ext', 'legenda' => 'opcional, até 1000'], 'exemplo' => 'curl -X POST -H "X-API-Token: $TOKEN" -H "Content-Type: application/json" -d \'{"numero":"5582999999999","url":"https://exemplo.com/foto.jpg","mime":"image/jpeg","nome":"foto.jpg","legenda":"Olha só"}\' "https://alequizao.com/zapzap/api_publica.php?acao=enviar_midia"'],
        'mensagens' => ['metodo' => 'GET ou POST', 'escopo' => 'listar_mensagens', 'parametros' => ['jid' => 'número ou JID da conversa', 'limite' => '1 a 50 (padrão 20)'], 'exemplo' => 'curl -H "X-API-Token: $TOKEN" "https://alequizao.com/zapzap/api_publica.php?acao=mensagens&jid=5582999999999&limite=10"'],
    ],
];
if ($acao === 'ajuda') out($AJUDA);
if (!in_array($acao, ['status', 'enviar_texto', 'enviar_midia', 'mensagens'], true)) out(['ok' => false, 'msg' => 'Ação desconhecida. Veja ?acao=ajuda.'], 404);
if (!in_array($metodo, ['GET', 'POST'], true)) out(['ok' => false, 'msg' => 'Método não permitido.'], 405);
if (in_array($acao, ['enviar_texto', 'enviar_midia'], true) && $metodo !== 'POST') out(['ok' => false, 'msg' => 'Use POST com corpo JSON para esta ação.'], 405);

// ---- Autenticação ----
$h = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if ($h === '' && function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = (string)$v;
// Obs.: o servidor web desta VPS não repassa "Authorization" ao PHP; por isso o mesmo token também vale no header X-API-Token.
if ($h === '') $h = 'Bearer ' . trim((string)($_SERVER['HTTP_X_API_TOKEN'] ?? ''));
if (!preg_match('/^Bearer (zz_[a-f0-9]{40})$/', trim($h), $m)) { usleep(300000); out(['ok' => false, 'msg' => 'Token ausente ou inválido. Envie o header X-API-Token: zz_… (ou Authorization: Bearer zz_…)'], 401); }
$q = bd()->prepare('SELECT t.*, u.ativo AS u_ativo FROM api_tokens t JOIN usuarios u ON u.id=t.usuario_id WHERE t.token_hash=?'); $q->execute([hash('sha256', $m[1])]); $tok = $q->fetch();
if (!$tok) { usleep(300000); out(['ok' => false, 'msg' => 'Token ausente ou inválido. Envie o header X-API-Token: zz_… (ou Authorization: Bearer zz_…)'], 401); }
$GLOBALS['AP_ACAO'] = $acao; $GLOBALS['AP_TOK'] = $tok;
if ((int)$tok['ativo'] !== 1 || (int)$tok['u_ativo'] !== 1) ap_out(['ok' => false, 'msg' => 'Este token foi revogado ou o dono está desativado.'], 401);
$esc = json_decode((string)$tok['escopos'], true) ?: [];
$precisa = ['status' => 'consultar_status', 'enviar_texto' => 'enviar_texto', 'enviar_midia' => 'enviar_midia', 'mensagens' => 'listar_mensagens'][$acao];
if (!in_array($precisa, $esc, true)) ap_out(['ok' => false, 'msg' => 'Este token não tem o escopo "' . $precisa . '".'], 403);
if (!isset(registro()[$tok['instancia']])) ap_out(['ok' => false, 'msg' => 'A conexão deste token não existe mais.'], 409);
usar_instancia($tok['instancia']);
// limite: janela deslizante de 60 s (MySQL)
$q = bd()->prepare('SELECT COUNT(*), MIN(ts) FROM api_usos WHERE token_id=? AND ts>? AND http<>429'); $q->execute([$tok['id'], time() - 60]); [$n, $min] = array_map('intval', $q->fetch(PDO::FETCH_NUM));
if ($n >= (int)$tok['limite_min']) { $esp = max(1, 60 - (time() - $min)); header('Retry-After: ' . $esp); ap_out(['ok' => false, 'msg' => 'Limite de ' . (int)$tok['limite_min'] . ' chamadas por minuto excedido. Tente de novo em ' . $esp . ' s.', 'retry_em' => $esp], 429); }

$e = $metodo === 'POST' ? entrada() : $_GET;
if ($metodo === 'POST' && strlen((string)file_get_contents('php://input')) > 40 * 1024 * 1024) ap_out(['ok' => false, 'msg' => 'Corpo grande demais (máximo ≈ 25 MB de arquivo).'], 413);

if ($acao === 'status') {
    [$c, $r] = evo('GET', '/instance/connectionState/' . rawurlencode(inst()), null, 10);
    if ($c !== 200) ap_out(['ok' => false, 'msg' => 'Não foi possível consultar a conexão agora.'], 502);
    ap_out(['ok' => true, 'estado' => $r['instance']['state'] ?? 'desconhecido', 'conectado' => ($r['instance']['state'] ?? '') === 'open']);
}
if ($acao === 'mensagens') {
    $jid = ap_jid((string)($e['jid'] ?? '')); $lim = min(50, max(1, (int)($e['limite'] ?? 20)));
    [$c, $r] = evo('POST', '/chat/findMessages/' . rawurlencode(inst()), ['where' => ['key' => ['remoteJid' => $jid]], 'offset' => $lim, 'page' => 1], 25);
    if ($c < 200 || $c >= 300) ap_out(['ok' => false, 'msg' => 'Não foi possível buscar as mensagens agora.'], 502);
    $lista = [];
    foreach (($r['messages']['records'] ?? []) as $rec) {
        $n = msg_normalizar($rec); if (!$n) continue;
        $lista[] = ['id' => $n['id'], 'de_mim' => $n['de_mim'], 'ts' => $n['ts'], 'tipo' => $n['tipo'], 'texto' => $n['texto'], 'nome' => $n['nome']];
        if (count($lista) >= $lim) break;
    }
    $GLOBALS['AP_DET'] = ' jid ' . substr($jid, 0, 6) . '…';
    ap_out(['ok' => true, 'jid' => $jid, 'mensagens' => array_reverse($lista)]); // cronológica
}

// ---- Envios (sempre assinados) ----
$jid = ap_jid((string)($e['numero'] ?? ''));
$ass = (string)$tok['assinatura'];
$GLOBALS['AP_DET'] = ' para ' . substr($jid, 0, 6) . '…';
function ap_enviado(array $r, string $jid): never {
    [$ok, $id, $erro] = $r;
    if (!$ok) ap_out(['ok' => false, 'msg' => 'O WhatsApp não conseguiu enviar agora (' . ($erro ?: 'falha') . '). Verifique a conexão e o número.'], 502);
    ap_out(['ok' => true, 'msg_id' => $id, 'numero' => $jid]);
}
if ($acao === 'enviar_texto') {
    $t = (string)($e['texto'] ?? '');
    if (trim($t) === '') ap_out(['ok' => false, 'msg' => 'Informe o "texto" da mensagem.'], 422);
    if (mb_strlen($t) > 4000) ap_out(['ok' => false, 'msg' => 'Texto muito longo (máximo 4000 caracteres).'], 422);
    ap_enviado(zz_enviar_texto($jid, assinar($t, $ass), ['origem' => 'api']), $jid);
}
// enviar_midia
$perm = ['image/png' => 'image', 'image/jpeg' => 'image', 'image/webp' => 'image', 'image/gif' => 'image', 'video/mp4' => 'video', 'audio/mpeg' => 'audio', 'audio/ogg' => 'audio', 'audio/mp4' => 'audio',
    'application/pdf' => 'document', 'application/msword' => 'document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'document', 'application/vnd.ms-excel' => 'document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'document', 'text/plain' => 'document', 'application/zip' => 'document'];
$mime = strtolower(trim((string)($e['mime'] ?? '')));
if (!isset($perm[$mime])) ap_out(['ok' => false, 'msg' => 'Informe um "mime" permitido (ex.: image/jpeg, video/mp4, audio/ogg, application/pdf). Veja ?acao=ajuda.'], 422);
$nome = trim(preg_replace('/[^\p{L}\p{N}._ ()-]/u', '_', basename(str_replace('\\', '/', (string)($e['nome'] ?? '')))));
if ($nome === '' || mb_strlen($nome) > 100) ap_out(['ok' => false, 'msg' => 'Informe o "nome" do arquivo (até 100 caracteres), ex.: foto.jpg.'], 422);
$leg = (string)($e['legenda'] ?? ''); if (mb_strlen($leg) > 1000) ap_out(['ok' => false, 'msg' => 'Legenda muito longa (máximo 1000 caracteres).'], 422);
$url = trim((string)($e['url'] ?? '')); $b64 = (string)($e['base64'] ?? '');
if (($url === '') === ($b64 === '')) ap_out(['ok' => false, 'msg' => 'Envie "url" OU "base64" (um dos dois).'], 422);
if ($url !== '') {
    if (strlen($url) > 1000) ap_out(['ok' => false, 'msg' => 'URL muito longa.'], 422);
    [$err] = wso_validar_url($url); if ($err) ap_out(['ok' => false, 'msg' => 'URL do arquivo recusada: ' . $err], 422);
    $conteudo = $url;
} else {
    if (str_starts_with($b64, 'data:')) $b64 = substr($b64, (int)strpos($b64, ',') + 1);
    $bin = base64_decode(preg_replace('/\s+/', '', $b64), true);
    if ($bin === false || $bin === '') ap_out(['ok' => false, 'msg' => 'O "base64" é inválido.'], 422);
    if (strlen($bin) > 25 * 1024 * 1024) ap_out(['ok' => false, 'msg' => 'Arquivo grande demais (máximo 25 MB).'], 422);
    $conteudo = base64_encode($bin); unset($bin);
}
$tipo = $perm[$mime];
if ($tipo === 'audio') { $l = assinatura_linha($ass); if ($l !== '') zz_enviar_texto($jid, $l, ['origem' => 'api']); $legenda = ''; }
else { $legenda = $leg !== '' ? assinar($leg, $ass) : '*' . trim(preg_replace('/[*_~`\r\n]+/', ' ', $ass)) . '*'; }
ap_enviado(zz_enviar_midia($jid, $tipo, $conteudo, $mime, $nome, $legenda, 'api'), $jid);
