<?php
// ZapZap — biblioteca comum: config, autenticação por cookie assinado, CSRF, limite de tentativas e cliente Evolution.
declare(strict_types=1);
const ZZ_VERSAO = '__V__';
define('ZZ_DIR', getenv('ZAPZAP_DIR') ?: '/www/wwwroot/alequizao.com/_dados/zapzap'); // pasta privada (fora do alcance da web)
const ZZ_COOKIE = 'zz_auth';
const ZZ_DIAS = 30;

function cfg(): array { static $c = null; return $c ??= require ZZ_DIR . '/config.php'; }
function chave(): string { return hash('sha256', cfg()['segredo'], true); }

function no_cache(): void {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
    header('Strict-Transport-Security: max-age=31536000');
}
// Include nunca deve ser executado direto pela web.
if (PHP_SAPI !== 'cli' && in_array(basename($_SERVER['SCRIPT_FILENAME'] ?? ''), ['lib.php', 'agenda_lib.php'], true)) { http_response_code(404); exit; }

// ---- Cliente Evolution API ----
function evo(string $metodo, string $caminho, ?array $corpo = null, int $timeout = 25): array {
    $c = cfg();
    $tok = registro()[inst()]['token'] ?? $c['token'];
    return evo_chave($tok, $metodo, $caminho, $corpo, $timeout);
}
/** Chamada com a chave GLOBAL da Evolution (criar/listar/apagar instâncias). Só usar em api/conexoes.php e no núcleo. */
function evo_global(string $metodo, string $caminho, ?array $corpo = null, int $timeout = 25): array { return evo_chave(cfg()['chave_global'] ?? '', $metodo, $caminho, $corpo, $timeout); }
function evo_chave(string $tok, string $metodo, string $caminho, ?array $corpo, int $timeout): array {
    $c = cfg();
    $ch = curl_init($c['base'] . $caminho);
    $h = ['apikey: ' . $tok];
    $o = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_CUSTOMREQUEST => $metodo];
    if ($corpo !== null) { $h[] = 'Content-Type: application/json'; $o[CURLOPT_POSTFIELDS] = json_encode($corpo, JSON_UNESCAPED_UNICODE); }
    $o[CURLOPT_HTTPHEADER] = $h;
    curl_setopt_array($ch, $o);
    $r = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($r === false) return [0, ['erro' => $err ?: 'sem resposta da Evolution API']];
    $j = json_decode($r, true);
    return [$code, $j ?? ['bruto' => substr($r, 0, 300)]];
}

// ---- Helpers de resposta/entrada ----
function out(array $d, int $code = 200): never { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE); exit; }
function entrada(): array { static $j = null; if ($j !== null) return $j; $r = json_decode((string)file_get_contents('php://input'), true); return $j = is_array($r) ? $r : $_POST; }
/** Instância (WhatsApp) ativa nesta requisição — escolhida pelo painel (header X-Instancia ou cookie zz_inst). */
function inst(): string { return $GLOBALS['ZZ_INST'] ?? cfg()['instancia']; }
function usar_instancia(string $nome): void { $GLOBALS['ZZ_INST'] = $nome; }
/** Arquivo de cache POR instância: cache_arq('contatos.json') → ZZ_DIR/cache/<instancia>/contatos.json (cria a pasta). */
function cache_arq(string $nome): string { $d = ZZ_DIR . '/cache/' . inst(); if (!is_dir($d)) @mkdir($d, 0750, true); return $d . '/' . basename($nome); }
/** Registro das instâncias: nome => [token, apelido, protegida]. Arquivo ZZ_DIR/instancias.json (gravação atômica). */
function registro(): array {
    $f = ZZ_DIR . '/instancias.json';
    $r = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    if (!$r) $r = [cfg()['instancia'] => ['token' => cfg()['token'], 'apelido' => 'Principal', 'protegida' => true]];
    return $r;
}
function registro_salvar(array $r): void { $f = ZZ_DIR . '/instancias.json'; $t = $f . '.' . bin2hex(random_bytes(4)); file_put_contents($t, json_encode($r, JSON_UNESCAPED_UNICODE)); chmod($t, 0640); rename($t, $f); }
function nome_instancia_ok(string $n): bool { return (bool)preg_match('/^[A-Za-z0-9_-]{2,40}$/', $n); }
/** Normaliza destino: aceita JID (…@s.whatsapp.net / @g.us / @lid) ou número; devolve o que a Evolution espera em "number". */
function destino(string $x): string { $x = trim($x); return str_contains($x, '@') ? $x : preg_replace('/\D/', '', $x); }

// ---- Histórico de envios (MySQL) ----
/** Registra um envio no histórico. origem: painel | agenda | automacao | ... Grava o usuário da sessão (se houver). tipo: texto|imagem|video|audio|documento|enquete|localizacao|contato. */
function log_envio(string $origem, string $jid, string $tipo, string $resumo, bool $ok, ?string $erro = null, ?string $msgId = null, ?array $autor = null): void {
    $u = $autor ?? (PHP_SAPI === 'cli' ? null : usuario_atual());
    bd()->prepare('INSERT INTO envios (quando,origem,jid,tipo,resumo,ok,erro,msg_id,instancia,usuario_id,usuario) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([time(), $origem, $jid, $tipo, mb_substr($resumo, 0, 300), $ok ? 1 : 0, $erro, $msgId, inst(), $u ? (int)$u['id'] : null, $u ? mb_substr((string)$u['usuario'], 0, 40) : null]);
}

require __DIR__ . '/auth.php';

// ---- Assinatura obrigatória: toda mensagem enviada por usuário sai com o nome dele ----
/** Nome para assinatura do usuário logado (ou string vazia fora de sessão). */
function assinatura_nome(): string { $n = trim((string)(usuario_atual()['nome'] ?? '')); return $n !== '' ? preg_replace('/[*_~`\r\n]+/', ' ', $n) : ''; }
/** Assina um texto: "*Nome:*\n<texto>". Se $nome vier vazio usa o usuário logado; sem nome nenhum devolve o texto sem alterar. */
function assinar(string $texto, ?string $nome = null): string {
    $n = $nome ?? assinatura_nome(); $n = trim(preg_replace('/[*_~`\r\n]+/', ' ', (string)$n));
    if ($n === '') return $texto;
    return "*{$n}:*\n" . $texto;
}
/** Linha curta de assinatura para tipos que não têm texto (áudio, contato, figurinha): enviar ANTES em mensagem separada. */
function assinatura_linha(?string $nome = null): string { $n = trim(preg_replace('/[*_~`\r\n]+/', ' ', (string)($nome ?? assinatura_nome()))); return $n === '' ? '' : "*{$n}* enviou:"; }
/** Define o detalhe que a auditoria grava para esta requisição (ex.: destinatário e tipo; NUNCA o conteúdo da mensagem). */
function aud_detalhe(string $d): void { $GLOBALS['ZZ_AUD_DET'] = mb_substr($d, 0, 500); }

// ---- Webhook (mensagens em tempo real) ----
function webhook_chave(string $inst): string { return substr(hash_hmac('sha256', 'wh|' . $inst, chave()), 0, 32); }
function url_base(): string { return rtrim((string)(cfg()['url_base'] ?? 'https://alequizao.com/zapzap'), '/'); }
function webhook_url(string $inst): string { return url_base() . '/webhook.php?i=' . rawurlencode($inst) . '&k=' . webhook_chave($inst); }
const ZZ_WEBHOOK_EVENTOS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE', 'CONTACTS_UPSERT', 'GROUPS_UPSERT', 'PRESENCE_UPDATE'];
function webhook_ligado(?string $inst = null): bool {
    $inst = $inst ?? inst(); [$c, $r] = evo('GET', '/webhook/find/' . rawurlencode($inst), null, 10);
    return $c === 200 && is_array($r) && !empty($r['enabled']) && str_contains((string)($r['url'] ?? ''), 'zapzap/webhook.php');
}
function webhook_ligar(?string $inst = null): bool {
    $inst = $inst ?? inst();
    [$c] = evo('POST', '/webhook/set/' . rawurlencode($inst), ['webhook' => ['enabled' => true, 'url' => webhook_url($inst), 'webhookByEvents' => false, 'webhookBase64' => false, 'events' => ZZ_WEBHOOK_EVENTOS]], 15);
    return $c >= 200 && $c < 300;
}
function webhook_desligar(?string $inst = null): bool {
    $inst = $inst ?? inst();
    [$c] = evo('POST', '/webhook/set/' . rawurlencode($inst), ['webhook' => ['enabled' => false, 'url' => webhook_url($inst), 'webhookByEvents' => false, 'webhookBase64' => false, 'events' => ZZ_WEBHOOK_EVENTOS]], 15);
    return $c >= 200 && $c < 300;
}

// ---- Normalização de mensagem (webhook) ----
function msg_normalizar(array $d): ?array {
    $k = $d['key'] ?? null; if (!is_array($k) || empty($k['remoteJid'])) return null;
    $m = $d['message'] ?? []; $t = 'outro'; $tx = '';
    while (isset($m['ephemeralMessage']['message']) || isset($m['viewOnceMessage']['message']) || isset($m['viewOnceMessageV2']['message']) || isset($m['documentWithCaptionMessage']['message'])) $m = $m['ephemeralMessage']['message'] ?? $m['viewOnceMessage']['message'] ?? $m['viewOnceMessageV2']['message'] ?? $m['documentWithCaptionMessage']['message'];
    if (isset($m['conversation'])) { $t = 'texto'; $tx = (string)$m['conversation']; }
    elseif (isset($m['extendedTextMessage'])) { $t = 'texto'; $tx = (string)($m['extendedTextMessage']['text'] ?? ''); }
    elseif (isset($m['imageMessage'])) { $t = 'imagem'; $tx = (string)($m['imageMessage']['caption'] ?? ''); }
    elseif (isset($m['videoMessage'])) { $t = 'video'; $tx = (string)($m['videoMessage']['caption'] ?? ''); }
    elseif (isset($m['audioMessage'])) { $t = 'audio'; }
    elseif (isset($m['documentMessage'])) { $t = 'documento'; $tx = (string)($m['documentMessage']['caption'] ?? ($m['documentMessage']['fileName'] ?? '')); }
    elseif (isset($m['stickerMessage'])) { $t = 'figurinha'; }
    elseif (isset($m['contactMessage']) || isset($m['contactsArrayMessage'])) { $t = 'contato'; }
    elseif (isset($m['locationMessage']) || isset($m['liveLocationMessage'])) { $t = 'localizacao'; }
    elseif (isset($m['pollCreationMessage']) || isset($m['pollCreationMessageV3'])) { $t = 'enquete'; }
    elseif (isset($m['buttonsResponseMessage'])) { $t = 'texto'; $tx = (string)($m['buttonsResponseMessage']['selectedDisplayText'] ?? ''); }
    elseif (isset($m['listResponseMessage'])) { $t = 'texto'; $tx = (string)($m['listResponseMessage']['title'] ?? ''); }
    elseif (isset($m['reactionMessage']) || isset($m['protocolMessage']) || isset($m['senderKeyDistributionMessage'])) return null;
    $jid = (string)$k['remoteJid'];
    return ['id' => (string)($k['id'] ?? ''), 'jid' => $jid, 'de_mim' => !empty($k['fromMe']), 'texto' => $tx, 'tipo' => $t, 'ts' => (int)($d['messageTimestamp'] ?? time()),
            'nome' => (string)($d['pushName'] ?? ''), 'grupo' => str_ends_with($jid, '@g.us'), 'autor' => (string)($k['participant'] ?? ($d['participant'] ?? ''))];
}

// ---- Envio "pelo sistema" (automações, chatbot, filas, campanhas): sem assinatura de usuário ----
/** Envia texto como sistema. $opts: ['origem'=>'automacao|chatbot|fila|campanha|api','digitando_ms'=>int,'citar_id'=>string]. Devolve [ok(bool), msg_id|null, erro|null]. Registra em `envios`. */
function zz_enviar_texto(string $jid, string $texto, array $opts = []): array {
    $origem = (string)($opts['origem'] ?? 'sistema'); $jid = destino($jid);
    if ($jid === '' || trim($texto) === '' || mb_strlen($texto) > 4096) { return [false, null, 'destino ou texto inválido']; }
    $corpo = ['number' => $jid, 'text' => $texto];
    if (!empty($opts['digitando_ms'])) $corpo['delay'] = (int)min(15000, max(0, $opts['digitando_ms']));
    if (!empty($opts['citar_id'])) $corpo['quoted'] = ['key' => ['id' => (string)$opts['citar_id']]];
    [$c, $r] = evo('POST', '/message/sendText/' . rawurlencode(inst()), $corpo, 30);
    $ok = $c >= 200 && $c < 300; $id = $r['key']['id'] ?? null; $real = $r['key']['remoteJid'] ?? $jid;
    log_envio($origem, $real, 'texto', mb_substr($texto, 0, 80), $ok, $ok ? null : 'falha no envio', $id);
    return [$ok, $id, $ok ? null : 'falha no envio'];
}
/** Envia mídia como sistema. $tipo: image|video|document|audio; $conteudo = URL pública https OU base64 puro. */
function zz_enviar_midia(string $jid, string $tipo, string $conteudo, string $mime, string $nome, string $legenda = '', string $origem = 'sistema'): array {
    $jid = destino($jid);
    if ($jid === '' || !in_array($tipo, ['image', 'video', 'document', 'audio'], true)) return [false, null, 'parâmetros inválidos'];
    if ($tipo === 'audio') { [$c, $r] = evo('POST', '/message/sendWhatsAppAudio/' . rawurlencode(inst()), ['number' => $jid, 'audio' => $conteudo], 60); }
    else { [$c, $r] = evo('POST', '/message/sendMedia/' . rawurlencode(inst()), ['number' => $jid, 'mediatype' => $tipo, 'mimetype' => $mime, 'fileName' => $nome, 'caption' => $legenda, 'media' => $conteudo], 60); }
    $ok = $c >= 200 && $c < 300; $id = $r['key']['id'] ?? null;
    log_envio($origem, $r['key']['remoteJid'] ?? $jid, $tipo === 'image' ? 'imagem' : ($tipo === 'document' ? 'documento' : $tipo), $nome, $ok, $ok ? null : 'falha no envio', $id);
    return [$ok, $id, $ok ? null : 'falha no envio'];
}

// ---- Notificações (central + som + vibração + push) ----
/** Cria uma notificação para a conexão atual (ou $o['instancia']). tipo: mensagem|atendimento|agenda|campanha|conexao|automacao|sistema.
 *  $o: jid, rota (ex.: 'conversas?jid=…'), perm (só quem tem a permissão recebe), ref (dedupe por instancia+tipo+ref), instancia, usuario_id (só ESTE usuário recebe). Nunca lança exceção. */
function notificar(string $tipo, string $titulo, string $texto = '', array $o = []): void {
    try {
        $inst = (string)($o['instancia'] ?? inst());
        $q = bd()->prepare('INSERT IGNORE INTO notificacoes (instancia,ts,tipo,titulo,texto,jid,rota,perm,ref,usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
        $q->execute([$inst, time(), mb_substr($tipo, 0, 20), mb_substr($titulo, 0, 120), $texto !== '' ? mb_substr($texto, 0, 300) : null, $o['jid'] ?? null, $o['rota'] ?? null, $o['perm'] ?? null, isset($o['ref']) ? mb_substr((string)$o['ref'], 0, 80) : null, isset($o['usuario_id']) ? (int)$o['usuario_id'] : null]);
        if ($q->rowCount() > 0 && function_exists('push_notificar')) { push_notificar($inst, $tipo, $titulo, $texto, $o); }
        if (mt_rand(1, 100) === 1) bd()->prepare('DELETE FROM notificacoes WHERE ts < ?')->execute([time() - 14 * 86400]);
    } catch (Throwable $e) { @error_log('[zapzap] notificar: ' . $e->getMessage()); }
}
require_once __DIR__ . '/push_lib.php'; // Web Push disponível em qualquer contexto (webhook, cron, API)
