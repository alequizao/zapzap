<?php
// ZapZap — biblioteca da Agenda: envio de texto/mídia via Evolution (usada por api/agenda.php e cron.php).
declare(strict_types=1);
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }

const ZZ_AG_MAX_BYTES = 25 * 1024 * 1024;
const ZZ_AG_EXT = [
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif',
    'mp4' => 'video/mp4', 'mp3' => 'audio/mpeg', 'ogg' => 'audio/ogg', 'm4a' => 'audio/mp4',
    'pdf' => 'application/pdf', 'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt' => 'text/plain', 'zip' => 'application/zip',
];

/** Tipo do painel (imagem|video|audio|documento) a partir da extensão. */
function ag_tipo_por_ext(string $ext): string {
    $m = ZZ_AG_EXT[$ext] ?? '';
    if (str_starts_with($m, 'image/')) return 'imagem';
    if (str_starts_with($m, 'video/')) return 'video';
    if (str_starts_with($m, 'audio/')) return 'audio';
    return 'documento';
}

/** Caminho seguro do anexo (só dentro de ZZ_DIR/anexos). */
function ag_caminho_anexo(?string $arquivo): ?string {
    if (!$arquivo || basename($arquivo) !== $arquivo) return null;
    return ZZ_DIR . '/anexos/' . $arquivo;
}

function ag_apagar_anexo(?string $arquivo): void {
    $p = ag_caminho_anexo($arquivo);
    if ($p && is_file($p)) @unlink($p);
}

/**
 * Envia um agendamento (linha da tabela agendadas). Não altera o banco.
 * @return array{ok:bool,msg_id:?string,jid:string,erro:?string}
 */
function ag_enviar(array $r): array {
    $i = inst();
    $jid = (string)$r['jid'];
    $falha = fn(string $e) => ['ok' => false, 'msg_id' => null, 'jid' => $jid, 'erro' => $e];
    $tipo = (string)$r['tipo'];
    if ($tipo === 'texto') {
        [$c, $j] = evo('POST', "/message/sendText/$i", ['number' => destino($jid), 'text' => assinar((string)$r['texto'], $r['assinatura'] ?? null)], 30);
    } else {
        $p = ag_caminho_anexo($r['arquivo'] ?? null);
        if (!$p || !is_file($p)) return $falha('Arquivo anexo não encontrado');
        $b64 = base64_encode((string)file_get_contents($p));
        $nome = (string)($r['nome'] ?: 'arquivo');
        $mime = (string)($r['mime'] ?: 'application/octet-stream');
        if ($tipo === 'audio') {
            $linha = assinatura_linha($r['assinatura'] ?? null);
            if ($linha !== '') evo('POST', "/message/sendText/$i", ['number' => destino($jid), 'text' => $linha], 30);
            [$c, $j] = evo('POST', "/message/sendWhatsAppAudio/$i", ['number' => destino($jid), 'audio' => $b64], 120);
        } else {
            $mt = ['imagem' => 'image', 'video' => 'video'][$tipo] ?? 'document';
            [$c, $j] = evo('POST', "/message/sendMedia/$i", [
                'number' => destino($jid), 'mediatype' => $mt, 'mimetype' => $mime,
                'caption' => assinar((string)($r['texto'] ?? ''), $r['assinatura'] ?? null), 'media' => $b64, 'fileName' => $nome,
            ], 120);
        }
    }
    if ($c < 200 || $c >= 300) {
        $e = $j['response']['message'] ?? $j['message'] ?? $j['erro'] ?? $j['error'] ?? ('HTTP ' . $c);
        if (is_array($e)) $e = json_encode($e, JSON_UNESCAPED_UNICODE);
        return $falha(mb_substr((string)$e, 0, 300));
    }
    return ['ok' => true, 'msg_id' => $j['key']['id'] ?? null, 'jid' => $j['key']['remoteJid'] ?? $jid, 'erro' => null];
}

/** Resumo para o histórico. */
function ag_resumo(array $r): string {
    if ($r['tipo'] === 'texto') return (string)$r['texto'];
    return '[' . $r['tipo'] . '] ' . ($r['nome'] ?? '') . (($r['texto'] ?? '') !== '' ? ' — ' . $r['texto'] : '');
}

/**
 * Tenta "reservar" o agendamento (pendente/erro -> enviando) de forma atômica; envia e grava o resultado.
 * @return array{ok:bool,erro:?string,msg_id:?string,jid?:string}
 */
function ag_processar(int $id, array $statusPermitidos = ['pendente']): array {
    $pdo = bd();
    $in = implode(',', array_fill(0, count($statusPermitidos), '?'));
    $st = $pdo->prepare("UPDATE agendadas SET status='enviando', erro=NULL, enviado_em=? WHERE id=? AND status IN ($in)");
    $st->execute(array_merge([time(), $id], $statusPermitidos));
    if ($st->rowCount() !== 1) return ['ok' => false, 'erro' => 'Agendamento não está disponível para envio', 'msg_id' => null];
    $q = $pdo->prepare('SELECT * FROM agendadas WHERE id=?'); $q->execute([$id]); $r = $q->fetch();
    $ins = (string)($r['instancia'] ?? cfg()['instancia']);
    if (!isset(registro()[$ins])) $res = ['ok' => false, 'msg_id' => null, 'jid' => $r['jid'], 'erro' => "A instância \"$ins\" não existe mais"];
    else try { usar_instancia($ins); $res = ag_enviar($r); }
    catch (Throwable $e) { $res = ['ok' => false, 'msg_id' => null, 'jid' => $r['jid'], 'erro' => 'Falha interna ao enviar']; }
    if ($res['ok']) {
        $pdo->prepare("UPDATE agendadas SET status='enviada', enviado_em=?, msg_id=?, erro=NULL WHERE id=?")->execute([time(), $res['msg_id'], $id]);
        ag_apagar_anexo($r['arquivo'] ?? null);
    } else {
        $pdo->prepare("UPDATE agendadas SET status='erro', erro=?, enviado_em=NULL WHERE id=?")->execute([$res['erro'], $id]);
    }
    $autor = !empty($r['usuario_id']) ? ['id' => (int)$r['usuario_id'], 'usuario' => (string)$r['usuario']] : null;
    log_envio('agenda', $res['jid'], $r['tipo'], ag_resumo($r), $res['ok'], $res['erro'], $res['msg_id'], $autor);
    return $res;
}
