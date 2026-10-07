<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Agenda (mensagens agendadas). Envio real em agenda_lib.php / cron.php.
require_once dirname(__DIR__) . '/agenda_lib.php';

function ag_validar_quando($q): int {
    if (!is_numeric($q)) out(['ok' => false, 'msg' => 'Informe a data e hora do envio'], 400);
    $q = (int)$q;
    if ($q > 99999999999) $q = intdiv($q, 1000); // veio em milissegundos
    if ($q < time() + 30) out(['ok' => false, 'msg' => 'A data/hora precisa estar pelo menos 30 segundos no futuro'], 400);
    if ($q > time() + 366 * 86400) out(['ok' => false, 'msg' => 'No máximo 1 ano à frente'], 400);
    return $q;
}
function ag_validar_para($p): string {
    $p = destino((string)$p);
    if ($p === '') out(['ok' => false, 'msg' => 'Informe o destinatário'], 400);
    if (str_contains($p, '@')) {
        if (strlen($p) > 80 || !preg_match('/^[\w.\-]+@(s\.whatsapp\.net|g\.us|lid)$/', $p)) out(['ok' => false, 'msg' => 'Destinatário inválido'], 400);
    } elseif (!preg_match('/^\d{10,15}$/', $p)) {
        out(['ok' => false, 'msg' => 'Número inválido (use DDI+DDD+número)'], 400);
    }
    return $p;
}
function ag_limite_pendentes(): void {
    if ((int)bd()->query("SELECT COUNT(*) FROM agendadas WHERE status='pendente' AND instancia=" . bd()->quote(inst()))->fetchColumn() >= 200)
        out(['ok' => false, 'msg' => 'Limite de 200 agendamentos pendentes atingido'], 400);
}
function ag_nomes(): array {
    $f = cache_arq('contatos.json');
    $m = [];
    if (is_file($f)) {
        $c = json_decode((string)@file_get_contents($f), true);
        if (is_array($c)) {
            $c = $c['contatos'] ?? $c['map'] ?? $c;
            foreach ($c as $k => $v) {
                if (is_array($v) && isset($v['jid'])) { $m[$v['jid']] = $v['nome'] ?? ''; }
                elseif (is_array($v)) { $m[$k] = $v['nome'] ?? ''; }
                elseif (is_string($v)) { $m[$k] = $v; }
            }
        }
    }
    return $m;
}
function ag_autor(): ?string { $u = usuario_atual(); return $u ? mb_substr((string)$u['usuario'], 0, 40) : null; }
function ag_buscar(int $id): array {
    $q = bd()->prepare('SELECT * FROM agendadas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
    $r = $q->fetch();
    if (!$r) out(['ok' => false, 'msg' => 'Agendamento não encontrado'], 404);
    return $r;
}

return [
    'agendar_texto' => function () {
        $e = entrada();
        $para = ag_validar_para($e['para'] ?? '');
        $texto = trim((string)($e['texto'] ?? ''));
        $len = mb_strlen($texto);
        if ($len < 1 || $len > 4096) out(['ok' => false, 'msg' => 'O texto deve ter de 1 a 4096 caracteres'], 400);
        $quando = ag_validar_quando($e['quando'] ?? null);
        ag_limite_pendentes();
        $pdo = bd();
        $pdo->prepare("INSERT INTO agendadas (jid,tipo,texto,quando,status,criado,instancia,usuario_id,usuario,assinatura) VALUES (?,?,?,?, 'pendente', ?, ?, ?, ?, ?)")
            ->execute([$para, 'texto', $texto, $quando, time(), inst(), uid() ?: null, ag_autor(), assinatura_nome() ?: null]);
        aud_detalhe('agendou texto para ' . $para);
        out(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    },

    'agendar_midia' => function () {
        $para = ag_validar_para($_POST['para'] ?? '');
        $legenda = trim((string)($_POST['legenda'] ?? ''));
        if (mb_strlen($legenda) > 1024) out(['ok' => false, 'msg' => 'Legenda muito longa (máx. 1024)'], 400);
        $quando = ag_validar_quando($_POST['quando'] ?? null);
        $f = $_FILES['arquivo'] ?? null;
        if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) out(['ok' => false, 'msg' => 'Selecione um arquivo'], 400);
        if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) out(['ok' => false, 'msg' => 'Arquivo maior que 25 MB'], 400);
        if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) out(['ok' => false, 'msg' => 'Falha no envio do arquivo'], 400);
        if ($f['size'] > ZZ_AG_MAX_BYTES) out(['ok' => false, 'msg' => 'Arquivo maior que 25 MB'], 400);
        $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
        if (!isset(ZZ_AG_EXT[$ext])) out(['ok' => false, 'msg' => 'Tipo de arquivo não permitido (use ' . implode(', ', array_keys(ZZ_AG_EXT)) . ')'], 400);
        if (is_array($f['name'] ?? null)) out(['ok' => false, 'msg' => 'Arquivo inválido'], 400);
        $real = (string)(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
        $gr = explode('/', $real)[0];
        $tp = ag_tipo_por_ext($ext);
        $okc = match ($tp) {
            'imagem' => $gr === 'image',
            'video' => $gr === 'video' || $real === 'application/octet-stream',
            'audio' => $gr === 'audio' || in_array($real, ['video/ogg', 'application/ogg', 'video/mp4', 'application/octet-stream'], true),
            default => $ext !== 'pdf' || $real === 'application/pdf',
        };
        if (!$okc) out(['ok' => false, 'msg' => 'O conteúdo do arquivo não corresponde à extensão .' . $ext], 400);
        ag_limite_pendentes();
        if (!is_dir(ZZ_DIR . '/anexos')) @mkdir(ZZ_DIR . '/anexos', 0750, true);
        $arq = bin2hex(random_bytes(16)) . '.' . $ext;
        if (!move_uploaded_file($f['tmp_name'], ZZ_DIR . '/anexos/' . $arq)) out(['ok' => false, 'msg' => 'Não foi possível salvar o arquivo'], 500);
        @chmod(ZZ_DIR . '/anexos/' . $arq, 0640);
        $nome = mb_substr(preg_replace('/[^\p{L}\p{N}._ \-()]/u', '_', basename((string)$f['name'])), 0, 120);
        $pdo = bd();
        $pdo->prepare("INSERT INTO agendadas (jid,tipo,texto,arquivo,mime,nome,quando,status,criado,instancia,usuario_id,usuario,assinatura) VALUES (?,?,?,?,?,?,?, 'pendente', ?, ?, ?, ?, ?)")
            ->execute([$para, ag_tipo_por_ext($ext), $legenda, $arq, ZZ_AG_EXT[$ext], $nome, $quando, time(), inst(), uid() ?: null, ag_autor(), assinatura_nome() ?: null]);
        aud_detalhe('agendou ' . ag_tipo_por_ext($ext) . ' para ' . $para);
        out(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
    },

    'agendadas' => function () {
        $st = (string)($_GET['status'] ?? '');
        $pdo = bd();
        if ($st !== '' && !in_array($st, ['pendente', 'enviando', 'enviada', 'erro', 'cancelada'], true)) out(['ok' => false, 'msg' => 'Status inválido'], 400);
        $sql = 'SELECT id,jid,tipo,texto,nome,quando,status,erro,criado,enviado_em FROM agendadas WHERE instancia=?' . ($st !== '' ? ' AND status=?' : '')
             . " ORDER BY CASE WHEN status IN ('pendente','enviando') THEN 0 ELSE 1 END, CASE WHEN status IN ('pendente','enviando') THEN quando END ASC, id DESC LIMIT 300";
        $q = $pdo->prepare($sql); $q->execute($st !== '' ? [inst(), $st] : [inst()]);
        $nomes = ag_nomes();
        $itens = [];
        foreach ($q->fetchAll() as $r) {
            $itens[] = [
                'id' => (int)$r['id'], 'jid' => $r['jid'], 'nome' => $nomes[$r['jid']] ?? '',
                'tipo' => $r['tipo'], 'texto' => (string)$r['texto'], 'nome_arquivo' => (string)($r['nome'] ?? ''),
                'quando' => (int)$r['quando'], 'status' => $r['status'], 'erro' => $r['erro'],
                'criado' => (int)$r['criado'], 'enviado_em' => $r['status'] === 'enviada' && $r['enviado_em'] ? (int)$r['enviado_em'] : null,
            ];
        }
        $pq = $pdo->prepare("SELECT COUNT(*) FROM agendadas WHERE status='pendente' AND instancia=?"); $pq->execute([inst()]); $pend = (int)$pq->fetchColumn();
        out(['ok' => true, 'itens' => $itens, 'pendentes' => $pend]);
    },

    'cancelar_agendada' => function () {
        $id = (int)(entrada()['id'] ?? 0);
        $r = ag_buscar($id);
        $s = bd()->prepare("UPDATE agendadas SET status='cancelada' WHERE id=? AND status IN ('pendente','erro')");
        $s->execute([$id]);
        if ($s->rowCount() !== 1) out(['ok' => false, 'msg' => 'Só é possível cancelar agendamentos pendentes ou com erro'], 409);
        ag_apagar_anexo($r['arquivo'] ?? null);
        out(['ok' => true]);
    },

    'reagendar' => function () {
        $e = entrada();
        $id = (int)($e['id'] ?? 0);
        $r = ag_buscar($id);
        $quando = ag_validar_quando($e['quando'] ?? null);
        if (!in_array($r['status'], ['pendente', 'erro'], true)) out(['ok' => false, 'msg' => 'Só é possível reagendar itens pendentes ou com erro'], 409);
        if ($r['tipo'] !== 'texto') {
            $p = ag_caminho_anexo($r['arquivo'] ?? null);
            if (!$p || !is_file($p)) out(['ok' => false, 'msg' => 'O arquivo anexo não existe mais; crie um novo agendamento'], 409);
        }
        if ($r['status'] === 'erro') ag_limite_pendentes();
        $s = bd()->prepare("UPDATE agendadas SET quando=?, status='pendente', erro=NULL, enviado_em=NULL WHERE id=? AND status IN ('pendente','erro')");
        $s->execute([$quando, $id]);
        out(['ok' => true]);
    },

    'enviar_agora' => function () {
        $id = (int)(entrada()['id'] ?? 0);
        ag_buscar($id);
        $r = ag_processar($id, ['pendente', 'erro']);
        if (!$r['ok']) out(['ok' => false, 'msg' => $r['erro'] ?: 'Falha no envio'], 502);
        out(['ok' => true, 'msg_id' => $r['msg_id'], 'jid' => $r['jid'] ?? null]);
    },
];
