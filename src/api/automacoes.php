<?php
// API de Automações. Motor compartilhado em hooks/automacoes.php. Leituras: listar_/ver_/rel_ (GET); escrita: POST.
require_once __DIR__ . '/../hooks/automacoes.php';

function au_row_json(array $r): array {
    $r = au_carregar($r);
    return ['id' => (int)$r['id'], 'nome' => $r['nome'], 'ativa' => (bool)$r['ativa'], 'modo' => $r['modo'], 'gatilho' => $r['gatilho'], 'condicoes' => $r['condicoes'], 'acoes' => $r['acoes'],
            'limite_hora_contato' => (int)$r['limite_hora_contato'], 'ordem' => (int)$r['ordem'], 'criado' => (int)$r['criado'], 'executada_vezes' => (int)$r['executada_vezes'], 'ultima_execucao' => $r['ultima_execucao'] !== null ? (int)$r['ultima_execucao'] : null];
}
function au_obter(int $id): array {
    $q = bd()->prepare('SELECT * FROM automacoes WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
    $r = $q->fetch(); if (!$r) out(['ok' => false, 'msg' => 'Automação não encontrada.'], 404);
    return $r;
}
function au_id(): int { $id = (int)(entrada()['id'] ?? $_GET['id'] ?? 0); if ($id <= 0) out(['ok' => false, 'msg' => 'Informe a automação.'], 400); return $id; }
function au_descricao_gatilho(array $g): string {
    return match ($g['tipo']) {
        'mensagem_recebida' => 'Mensagem com palavra-chave', 'primeira_mensagem_do_contato' => 'Primeira mensagem do contato', 'primeira_mensagem_do_dia' => 'Primeira mensagem do dia',
        'qualquer_mensagem' => 'Qualquer mensagem', 'agendado' => 'Agendado', 'conexao_desconectada' => 'Conexão desconectada', default => $g['tipo'] };
}

return [
    'listar_automacoes' => function () {
        $q = bd()->prepare('SELECT * FROM automacoes WHERE instancia=? ORDER BY ordem, id'); $q->execute([inst()]);
        $c = bd()->prepare("SELECT automacao_id, resultado, COUNT(*) n FROM automacao_logs WHERE instancia=? AND ts>? GROUP BY automacao_id, resultado"); $c->execute([inst(), time() - 86400]);
        $h = []; foreach ($c->fetchAll() as $x) $h[(int)$x['automacao_id']][$x['resultado']] = (int)$x['n'];
        $itens = array_map(function ($r) use ($h) { $j = au_row_json($r); $j['gatilho_rotulo'] = au_descricao_gatilho($j['gatilho']); $j['ultimas_24h'] = $h[$j['id']] ?? new stdClass(); return $j; }, $q->fetchAll());
        out(['ok' => true, 'itens' => $itens, 'ativas' => count(array_filter($itens, fn($i) => $i['ativa'])), 'webhook_cache' => null]);
    },
    'ver_automacao' => function () { out(['ok' => true, 'automacao' => au_row_json(au_obter(au_id()))]); },
    'salvar_automacao' => function () {
        $in = entrada(); $id = (int)($in['id'] ?? 0);
        [$d, $e] = au_validar($in); if ($e) out(['ok' => false, 'msg' => $e], 422);
        $j = fn($v) => json_encode($v, JSON_UNESCAPED_UNICODE);
        if ($id > 0) {
            au_obter($id);
            bd()->prepare('UPDATE automacoes SET nome=?, gatilho=?, condicoes=?, acoes=?, limite_hora_contato=? WHERE id=? AND instancia=?')->execute([$d['nome'], $j($d['gatilho']), $j($d['condicoes']), $j($d['acoes']), $d['limite_hora_contato'], $id, inst()]);
            aud_detalhe('editou a automação #' . $id);
        } else {
            $q = bd()->prepare('SELECT COUNT(*), COALESCE(MAX(ordem),0) FROM automacoes WHERE instancia=?'); $q->execute([inst()]); [$n, $mx] = $q->fetch(PDO::FETCH_NUM);
            if ((int)$n >= 100) out(['ok' => false, 'msg' => 'Limite de 100 automações por conexão.'], 422);
            // criada SEMPRE desligada e em modo teste
            bd()->prepare('INSERT INTO automacoes (instancia,nome,ativa,modo,gatilho,condicoes,acoes,limite_hora_contato,ordem,criado,criado_por) VALUES (?,?,0,\'teste\',?,?,?,?,?,?,?)')
                ->execute([inst(), $d['nome'], $j($d['gatilho']), $j($d['condicoes']), $j($d['acoes']), $d['limite_hora_contato'], (int)$mx + 1, time(), uid() ?: null]);
            $id = (int)bd()->lastInsertId(); aud_detalhe('criou a automação #' . $id);
        }
        out(['ok' => true, 'id' => $id, 'automacao' => au_row_json(au_obter($id)), 'msg' => 'Automação salva.']);
    },
    'ativar_automacao' => function () {
        $in = entrada(); $id = (int)($in['id'] ?? 0); $r = au_obter($id); $ativa = !empty($in['ativa']);
        $modo = (string)($in['modo'] ?? $r['modo']); if (!in_array($modo, ['teste', 'ao_vivo'], true)) out(['ok' => false, 'msg' => 'Modo inválido.'], 422);
        bd()->prepare('UPDATE automacoes SET ativa=?, modo=? WHERE id=? AND instancia=?')->execute([$ativa ? 1 : 0, $modo, $id, inst()]);
        aud_detalhe(($ativa ? 'ativou' : 'desativou') . " a automação #$id em modo $modo");
        // não liga o webhook sozinho: só informa o estado para a tela oferecer o botão
        $g = au_carregar($r)['gatilho']['tipo']; $precisa = !in_array($g, ['agendado'], true);
        $wh = ($ativa && $precisa) ? webhook_ligado() : null;
        out(['ok' => true, 'ativa' => $ativa, 'modo' => $modo, 'precisa_webhook' => $ativa && $precisa, 'webhook_ligado' => $wh,
             'msg' => !$ativa ? 'Automação desativada.' : ($modo === 'teste' ? 'Ativada em modo teste (nada será enviado, só registrado).' : 'Ativada AO VIVO.') . ($wh === false ? ' Atenção: o recebimento em tempo real está desligado.' : '')]);
    },
    'excluir_automacao' => function () {
        $id = au_id(); au_obter($id);
        bd()->prepare('DELETE FROM automacao_logs WHERE automacao_id=?')->execute([$id]);
        bd()->prepare('DELETE FROM automacao_dedupe WHERE automacao_id=?')->execute([$id]);
        bd()->prepare("UPDATE automacao_envios SET status='cancelado' WHERE automacao_id=? AND status='pendente'")->execute([$id]);
        bd()->prepare('DELETE FROM automacoes WHERE id=? AND instancia=?')->execute([$id, inst()]);
        aud_detalhe('excluiu a automação #' . $id); out(['ok' => true, 'msg' => 'Automação excluída.']);
    },
    'duplicar_automacao' => function () {
        $id = au_id(); $r = au_obter($id);
        $q = bd()->prepare('SELECT COALESCE(MAX(ordem),0)+1 FROM automacoes WHERE instancia=?'); $q->execute([inst()]);
        bd()->prepare('INSERT INTO automacoes (instancia,nome,ativa,modo,gatilho,condicoes,acoes,limite_hora_contato,ordem,criado,criado_por) VALUES (?,?,0,\'teste\',?,?,?,?,?,?,?)')
            ->execute([inst(), mb_substr($r['nome'], 0, 70) . ' (cópia)', $r['gatilho'], $r['condicoes'], $r['acoes'], $r['limite_hora_contato'], (int)$q->fetchColumn(), time(), uid() ?: null]);
        $n = (int)bd()->lastInsertId(); aud_detalhe("duplicou a automação #$id como #$n"); out(['ok' => true, 'id' => $n, 'msg' => 'Cópia criada (desligada, em modo teste).']);
    },
    'ordenar_automacoes' => function () {
        $ids = array_values(array_unique(array_map('intval', (array)(entrada()['ids'] ?? [])))); if (!$ids || count($ids) > 200) out(['ok' => false, 'msg' => 'Lista inválida.'], 422);
        $u = bd()->prepare('UPDATE automacoes SET ordem=? WHERE id=? AND instancia=?');
        foreach ($ids as $i => $id) $u->execute([$i + 1, $id, inst()]);
        aud_detalhe('reordenou as automações'); out(['ok' => true]);
    },
    'testar_automacao' => function () {
        $in = entrada();
        if (!empty($in['rascunho']) && is_array($in['rascunho'])) { [$d, $e] = au_validar($in['rascunho'], true); if ($e) out(['ok' => false, 'msg' => $e], 422); $a = $d + ['id' => 0, 'instancia' => inst(), 'modo' => 'teste']; }
        else { $a = au_carregar(au_obter((int)($in['id'] ?? 0))); }
        $texto = mb_substr((string)($in['texto'] ?? ''), 0, 2000); $grupo = !empty($in['grupo']);
        $jid = trim((string)($in['jid'] ?? '')); if ($jid === '') $jid = $grupo ? '120363000000000000@g.us' : '5582900000000@s.whatsapp.net';
        elseif (!str_contains($jid, '@')) $jid = preg_replace('/\D/', '', $jid) . '@s.whatsapp.net';
        if (!preg_match('/^[0-9A-Za-z._:-]{3,60}@(s\.whatsapp\.net|g\.us|lid)$/', $jid)) out(['ok' => false, 'msg' => 'Contato inválido.'], 422);
        if (str_ends_with($jid, '@g.us')) $grupo = true;
        $tipo = in_array($in['tipo'] ?? 'texto', AU_TIPOS_MSG, true) ? ($in['tipo'] ?? 'texto') : 'texto';
        $m = ['id' => 'TESTE' . bin2hex(random_bytes(4)), 'jid' => $jid, 'de_mim' => !empty($in['de_mim']), 'texto' => $texto, 'tipo' => $tipo, 'ts' => time(), 'nome' => mb_substr((string)($in['nome'] ?? 'Contato Teste'), 0, 60), 'grupo' => $grupo, 'autor' => ''];
        $f = au_flags(inst(), $m);
        if (isset($in['contato_novo']) && $in['contato_novo'] !== '') $f['novo'] = (bool)$in['contato_novo'];
        if (isset($in['primeira_do_dia']) && $in['primeira_do_dia'] !== '') $f['primeira_do_dia'] = (bool)$in['primeira_do_dia'];
        $agora = au_agora(); if (!empty($in['agora'])) { try { $agora = (new DateTimeImmutable((string)$in['agora'], au_tz())); } catch (Throwable $e) {} }
        $passos = [['etapa' => 'Contexto', 'ok' => true, 'detalhe' => ($grupo ? 'Grupo' : 'Conversa individual') . ($m['de_mim'] ? ', enviada por mim' : '') . ', ' . ($f['novo'] ? 'contato novo' : 'contato com histórico') . ', ' . ($f['primeira_do_dia'] ? 'primeira do dia' : 'já falou hoje') . ', agora ' . $agora->format('d/m H:i')]];
        $g = $a['gatilho']; $casou = false; $acoes = [];
        if ($g['tipo'] === 'agendado') {
            $passos[] = ['etapa' => 'Gatilho', 'ok' => true, 'detalhe' => 'Agendado (' . $g['frequencia'] . ($g['frequencia'] === 'intervalo' ? ' a cada ' . $g['minutos'] . ' min' : ' às ' . $g['hora']) . ') para ' . count($g['jids']) . ' destinatário(s), 8–20 s entre mensagens, fuso de Maceió. Não depende de mensagem recebida.'];
            $P = []; au_acoes($a, ['jid' => $g['jids'][0] ?? '', 'msg_id' => '', 'nome' => '', 'texto' => '', 'tipo' => '', 'ts' => time()], false, $P); $passos = array_merge($passos, $P); $casou = true;
        } elseif ($g['tipo'] === 'conexao_desconectada') {
            $passos[] = ['etapa' => 'Gatilho', 'ok' => true, 'detalhe' => 'Dispara quando a conexão fica "close" (no máximo 1 aviso a cada 30 min).'];
            $P = []; au_acoes($a, ['jid' => $g['jids'][0] ?? '', 'msg_id' => '', 'nome' => '', 'texto' => '', 'tipo' => '', 'ts' => time()], false, $P); $passos = array_merge($passos, $P); $casou = true;
        } else {
            $r = au_casa($a, $m, $f, $agora); $passos = array_merge($passos, $r['passos']); $casou = $r['casou'];
            if ($casou) { $P = []; $x = au_acoes($a, ['jid' => $jid, 'msg_id' => $m['id'], 'nome' => $m['nome'], 'texto' => $texto, 'tipo' => $tipo, 'ts' => time()], false, $P); $passos = array_merge($passos, $P); if ($x['parar']) $passos[] = ['etapa' => 'Resultado', 'ok' => true, 'detalhe' => 'Esta regra pararia a avaliação das próximas.']; }
        }
        aud_detalhe('simulou a automação' . (!empty($a['id']) ? ' #' . $a['id'] : ' (rascunho)'));
        out(['ok' => true, 'casou' => $casou, 'enviado' => false, 'passos' => $passos, 'msg' => $casou ? 'A regra dispararia (simulação, nada foi enviado).' : 'A regra NÃO dispararia.']);
    },
    'listar_logs_automacao' => function () {
        $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 30; $id = (int)($_GET['id'] ?? 0); $res = (string)($_GET['resultado'] ?? '');
        $w = 'l.instancia=?'; $p = [inst()];
        if ($id > 0) { $w .= ' AND l.automacao_id=?'; $p[] = $id; }
        if (in_array($res, ['executou', 'ignorou', 'teste', 'erro'], true)) { $w .= ' AND l.resultado=?'; $p[] = $res; }
        $q = bd()->prepare("SELECT COUNT(*) FROM automacao_logs l WHERE $w"); $q->execute($p); $tot = (int)$q->fetchColumn();
        $q = bd()->prepare("SELECT l.id,l.automacao_id,a.nome AS automacao,l.ts,l.jid,l.msg_id,l.resultado,l.detalhe FROM automacao_logs l LEFT JOIN automacoes a ON a.id=l.automacao_id WHERE $w ORDER BY l.id DESC LIMIT $por OFFSET " . (($pag - 1) * $por));
        $q->execute($p);
        $itens = array_map(fn($r) => ['id' => (int)$r['id'], 'automacao_id' => (int)$r['automacao_id'], 'automacao' => $r['automacao'] ?? '(excluída)', 'ts' => (int)$r['ts'], 'jid' => $r['jid'], 'numero' => $r['jid'] ? au_numero($r['jid']) : '', 'msg_id' => $r['msg_id'], 'resultado' => $r['resultado'], 'detalhe' => $r['detalhe']], $q->fetchAll());
        out(['ok' => true, 'total' => $tot, 'pag' => $pag, 'paginas' => max(1, (int)ceil($tot / $por)), 'itens' => $itens]);
    },
    'rel_automacoes' => function () {
        $dias = []; $hoje = au_agora()->setTime(0, 0);
        for ($i = 6; $i >= 0; $i--) $dias[] = $hoje->modify("-$i day")->format('Y-m-d');
        $ini = $hoje->modify('-6 day')->getTimestamp();
        $q = bd()->prepare('SELECT automacao_id, resultado, FLOOR((ts-?)/86400) AS d, COUNT(*) n FROM automacao_logs WHERE instancia=? AND ts>=? GROUP BY automacao_id, resultado, d');
        $q->execute([$ini, inst(), $ini]);
        $reg = []; $tot = array_fill(0, 7, 0); $totRes = ['executou' => 0, 'teste' => 0, 'ignorou' => 0, 'erro' => 0];
        foreach ($q->fetchAll() as $r) {
            $d = (int)$r['d']; if ($d < 0 || $d > 6) continue; $a = (int)$r['automacao_id']; $n = (int)$r['n'];
            $reg[$a] ??= ['por_dia' => array_fill(0, 7, 0), 'por_resultado' => ['executou' => 0, 'teste' => 0, 'ignorou' => 0, 'erro' => 0], 'total' => 0];
            $reg[$a]['por_dia'][$d] += $n; $reg[$a]['por_resultado'][$r['resultado']] += $n; $reg[$a]['total'] += $n; $tot[$d] += $n; $totRes[$r['resultado']] += $n;
        }
        $nomes = bd()->prepare('SELECT id,nome FROM automacoes WHERE instancia=?'); $nomes->execute([inst()]); $nm = array_column($nomes->fetchAll(), 'nome', 'id');
        $regras = []; foreach ($nm as $id => $nome) $regras[] = ['id' => (int)$id, 'nome' => $nome] + ($reg[$id] ?? ['por_dia' => array_fill(0, 7, 0), 'por_resultado' => ['executou' => 0, 'teste' => 0, 'ignorou' => 0, 'erro' => 0], 'total' => 0]);
        usort($regras, fn($a, $b) => $b['total'] <=> $a['total']);
        out(['ok' => true, 'dias' => $dias, 'total_por_dia' => $tot, 'totais' => $totRes, 'regras' => $regras]);
    },
    '__perms' => [
        'listar_automacoes' => 'automacoes.ver', 'ver_automacao' => 'automacoes.ver', 'listar_logs_automacao' => 'automacoes.ver', 'rel_automacoes' => 'automacoes.ver',
        'salvar_automacao' => 'automacoes.editar', 'ativar_automacao' => 'automacoes.editar', 'excluir_automacao' => 'automacoes.editar', 'duplicar_automacao' => 'automacoes.editar',
        'ordenar_automacoes' => 'automacoes.editar', 'testar_automacao' => 'automacoes.editar',
    ],
];
