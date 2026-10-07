<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — INTEGRAÇÕES: tokens da API pública e webhooks de saída (permissão api.tokens em tudo).
require_once __DIR__ . '/../hooks/integracoes.php';

if (!function_exists('integ_escopos_validos')) {
    define('INTEG_ESCOPOS', ['enviar_texto', 'enviar_midia', 'consultar_status', 'listar_mensagens']);
    function integ_limpa_nome(string $s): string { return trim(preg_replace('/[*_~`\r\n\t]+/u', ' ', $s)); }
    function integ_token_linha(array $r): array {
        return ['id' => (int)$r['id'], 'nome' => $r['nome'], 'prefixo' => $r['prefixo_visivel'], 'escopos' => json_decode((string)$r['escopos'], true) ?: [], 'assinatura' => $r['assinatura'],
            'limite_min' => (int)$r['limite_min'], 'ativo' => (int)$r['ativo'] === 1, 'criado' => (int)$r['criado'], 'ultimo_uso' => $r['ultimo_uso'] !== null ? (int)$r['ultimo_uso'] : null, 'usos' => (int)$r['usos'], 'dono' => $r['dono'] ?? ''];
    }
    function integ_wh_linha(array $r): array {
        return ['id' => (int)$r['id'], 'nome' => $r['nome'], 'url' => $r['url'], 'eventos' => json_decode((string)$r['eventos'], true) ?: [], 'ativo' => (int)$r['ativo'] === 1,
            'falhas_seguidas' => (int)$r['falhas_seguidas'], 'ultimo_status' => $r['ultimo_status'], 'ultimo_envio' => $r['ultimo_envio'] !== null ? (int)$r['ultimo_envio'] : null, 'desativado_motivo' => $r['desativado_motivo'], 'criado' => (int)$r['criado']];
    }
    function integ_wh_obter(int $id): array {
        $q = bd()->prepare('SELECT * FROM webhooks_saida WHERE id=? AND instancia=?'); $q->execute([$id, inst()]); $w = $q->fetch();
        if (!$w) out(['ok' => false, 'msg' => 'Webhook não encontrado.'], 404);
        return $w;
    }
    function integ_novo_segredo(): string { return 'whsec_' . bin2hex(random_bytes(20)); }
}

return [
    '__catalogo' => [],
    '__perms' => ['listar_tokens' => 'api.tokens', 'criar_token' => 'api.tokens', 'revogar_token' => 'api.tokens', 'excluir_token' => 'api.tokens', 'ver_uso_token' => 'api.tokens',
        'listar_webhooks_saida' => 'api.tokens', 'salvar_webhook_saida' => 'api.tokens', 'excluir_webhook_saida' => 'api.tokens', 'testar_webhook_saida' => 'api.tokens', 'listar_logs_webhook_saida' => 'api.tokens'],

    'listar_tokens' => function () {
        $q = bd()->prepare('SELECT t.*, u.nome AS dono FROM api_tokens t LEFT JOIN usuarios u ON u.id=t.usuario_id WHERE t.instancia=? ORDER BY t.id DESC'); $q->execute([inst()]);
        out(['ok' => true, 'tokens' => array_map('integ_token_linha', $q->fetchAll()), 'escopos' => INTEG_ESCOPOS, 'url_base' => 'https://alequizao.com/zapzap/api_publica.php', 'instancia' => inst()]);
    },
    'criar_token' => function () {
        $e = entrada();
        $nome = integ_limpa_nome((string)($e['nome'] ?? '')); if ($nome === '' || mb_strlen($nome) > 80) out(['ok' => false, 'msg' => 'Informe o nome do token (até 80 caracteres).'], 422);
        $ass = integ_limpa_nome((string)($e['assinatura'] ?? '')); if ($ass === '' || mb_strlen($ass) > 80) out(['ok' => false, 'msg' => 'A assinatura é obrigatória (até 80 caracteres): é o nome que aparece nas mensagens enviadas por este token.'], 422);
        $esc = array_values(array_unique(array_filter((array)($e['escopos'] ?? []), 'is_string')));
        if (!$esc || array_diff($esc, INTEG_ESCOPOS)) out(['ok' => false, 'msg' => 'Escolha ao menos um escopo válido: ' . implode(', ', INTEG_ESCOPOS) . '.'], 422);
        $lim = (int)($e['limite_min'] ?? 30); if ($lim < 1 || $lim > 600) out(['ok' => false, 'msg' => 'O limite por minuto deve ficar entre 1 e 600.'], 422);
        if ((int)bd()->query('SELECT COUNT(*) FROM api_tokens')->fetchColumn() >= 200) out(['ok' => false, 'msg' => 'Limite de tokens atingido. Exclua tokens antigos.'], 422);
        $tok = 'zz_' . bin2hex(random_bytes(20));
        bd()->prepare('INSERT INTO api_tokens (nome,token_hash,prefixo_visivel,instancia,escopos,usuario_id,assinatura,limite_min,ativo,criado) VALUES (?,?,?,?,?,?,?,?,1,?)')
            ->execute([$nome, hash('sha256', $tok), substr($tok, 0, 9), inst(), json_encode($esc), uid(), $ass, $lim, time()]);
        $id = (int)bd()->lastInsertId();
        aud_detalhe('criou o token de API #' . $id . ' (' . $nome . ')');
        out(['ok' => true, 'id' => $id, 'token' => $tok, 'aviso' => 'Copie o token agora: ele não será mostrado de novo.']);
    },
    'revogar_token' => function () {
        $id = (int)(entrada()['id'] ?? 0);
        $q = bd()->prepare('UPDATE api_tokens SET ativo=0 WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        if (!$q->rowCount() && !bd()->query('SELECT 1 FROM api_tokens WHERE id=' . $id . ' AND ativo=0')->fetchColumn()) out(['ok' => false, 'msg' => 'Token não encontrado.'], 404);
        aud_detalhe('revogou o token de API #' . $id); out(['ok' => true]);
    },
    'excluir_token' => function () {
        $id = (int)(entrada()['id'] ?? 0);
        $q = bd()->prepare('DELETE FROM api_tokens WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        if (!$q->rowCount()) out(['ok' => false, 'msg' => 'Token não encontrado.'], 404);
        aud_detalhe('excluiu o token de API #' . $id); out(['ok' => true]);
    },
    'ver_uso_token' => function () {
        $id = (int)($_GET['id'] ?? 0);
        $q = bd()->prepare('SELECT id,nome,limite_min,usos,ultimo_uso FROM api_tokens WHERE id=? AND instancia=?'); $q->execute([$id, inst()]); $t = $q->fetch();
        if (!$t) out(['ok' => false, 'msg' => 'Token não encontrado.'], 404);
        $lim = min(100, max(1, (int)($_GET['limite'] ?? 30)));
        $q = bd()->prepare('SELECT ts,acao,ip,ok,http,detalhe FROM api_usos WHERE token_id=? ORDER BY id DESC LIMIT ' . $lim); $q->execute([$id]);
        $q2 = bd()->prepare('SELECT COUNT(*) FROM api_usos WHERE token_id=? AND ts>?'); $q2->execute([$id, time() - 60]);
        out(['ok' => true, 'token' => ['id' => (int)$t['id'], 'nome' => $t['nome'], 'limite_min' => (int)$t['limite_min'], 'usos' => (int)$t['usos'], 'ultimo_uso' => $t['ultimo_uso'] !== null ? (int)$t['ultimo_uso'] : null],
            'ultimo_minuto' => (int)$q2->fetchColumn(), 'usos' => array_map(fn($r) => ['ts' => (int)$r['ts'], 'acao' => $r['acao'], 'ip' => $r['ip'], 'ok' => (int)$r['ok'] === 1, 'http' => (int)$r['http'], 'detalhe' => $r['detalhe']], $q->fetchAll())]);
    },

    'listar_webhooks_saida' => function () {
        $q = bd()->prepare('SELECT * FROM webhooks_saida WHERE instancia=? ORDER BY id DESC'); $q->execute([inst()]);
        out(['ok' => true, 'webhooks' => array_map('integ_wh_linha', $q->fetchAll()), 'eventos' => WSO_EVENTOS]);
    },
    'salvar_webhook_saida' => function () {
        $e = entrada(); $id = (int)($e['id'] ?? 0);
        $nome = integ_limpa_nome((string)($e['nome'] ?? '')); if ($nome === '' || mb_strlen($nome) > 80) out(['ok' => false, 'msg' => 'Informe o nome do webhook (até 80 caracteres).'], 422);
        $url = trim((string)($e['url'] ?? '')); if (mb_strlen($url) > 500) out(['ok' => false, 'msg' => 'URL muito longa (máximo 500).'], 422);
        [$err] = wso_validar_url($url); if ($err) out(['ok' => false, 'msg' => $err], 422);
        $ev = array_values(array_unique(array_filter((array)($e['eventos'] ?? []), 'is_string')));
        if (!$ev || array_diff($ev, WSO_EVENTOS)) out(['ok' => false, 'msg' => 'Escolha ao menos um evento válido: ' . implode(', ', WSO_EVENTOS) . '.'], 422);
        $ativo = !array_key_exists('ativo', $e) || !empty($e['ativo']) ? 1 : 0; $seg = null;
        if ($id) {
            $w = integ_wh_obter($id);
            $sql = 'UPDATE webhooks_saida SET nome=?,url=?,eventos=?,ativo=?'; $par = [$nome, $url, json_encode($ev), $ativo];
            if ($ativo) $sql .= ',falhas_seguidas=0,desativado_motivo=NULL';
            if (!empty($e['regenerar_segredo'])) { $seg = integ_novo_segredo(); $sql .= ',segredo_cif=?'; $par[] = wso_cifrar($seg); }
            $par[] = $id; bd()->prepare($sql . ' WHERE id=?')->execute($par);
            aud_detalhe('editou o webhook de saída #' . $id);
        } else {
            if ((int)bd()->query("SELECT COUNT(*) FROM webhooks_saida WHERE instancia=" . bd()->quote(inst()))->fetchColumn() >= 20) out(['ok' => false, 'msg' => 'Limite de 20 webhooks por conexão.'], 422);
            $seg = integ_novo_segredo();
            bd()->prepare('INSERT INTO webhooks_saida (instancia,nome,url,segredo_cif,eventos,ativo,criado,criado_por) VALUES (?,?,?,?,?,?,?,?)')->execute([inst(), $nome, $url, wso_cifrar($seg), json_encode($ev), $ativo, time(), uid()]);
            $id = (int)bd()->lastInsertId(); aud_detalhe('criou o webhook de saída #' . $id . ' (' . $nome . ')');
        }
        $r = ['ok' => true, 'id' => $id]; if ($seg !== null) { $r['segredo'] = $seg; $r['aviso'] = 'Guarde o segredo agora: ele não será mostrado de novo.'; }
        out($r);
    },
    'excluir_webhook_saida' => function () {
        $id = (int)(entrada()['id'] ?? 0); integ_wh_obter($id);
        bd()->prepare('DELETE FROM webhooks_saida WHERE id=? AND instancia=?')->execute([$id, inst()]);
        aud_detalhe('excluiu o webhook de saída #' . $id); out(['ok' => true]);
    },
    'testar_webhook_saida' => function () {
        $id = (int)(entrada()['id'] ?? 0); $w = integ_wh_obter($id);
        $r = wso_entregar($w, 'teste', ['mensagem' => 'Evento de teste do ZapZap'], null, true);
        aud_detalhe('testou o webhook de saída #' . $id . ($r['ok'] ? ' (ok)' : ' (falhou)'));
        out(['ok' => (bool)$r['ok'], 'http' => $r['http'], 'ms' => $r['ms'], 'tentativas' => $r['tentativas'], 'msg' => $r['ok'] ? 'Entregue com sucesso (HTTP ' . $r['http'] . ').' : 'Falha na entrega: ' . $r['erro']], $r['ok'] ? 200 : 502);
    },
    'listar_logs_webhook_saida' => function () {
        $id = (int)($_GET['id'] ?? 0); integ_wh_obter($id); $lim = min(100, max(1, (int)($_GET['limite'] ?? 30)));
        $q = bd()->prepare('SELECT ts,evento,ok,http,tentativas,ms,erro FROM webhooks_saida_logs WHERE webhook_id=? ORDER BY id DESC LIMIT ' . $lim); $q->execute([$id]);
        out(['ok' => true, 'logs' => array_map(fn($r) => ['ts' => (int)$r['ts'], 'evento' => $r['evento'], 'ok' => (int)$r['ok'] === 1, 'http' => $r['http'] !== null ? (int)$r['http'] : null, 'tentativas' => (int)$r['tentativas'], 'ms' => $r['ms'] !== null ? (int)$r['ms'] : null, 'erro' => $r['erro']], $q->fetchAll())]);
    },
];
