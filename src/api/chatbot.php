<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Chatbot (API). Motor e hook em hooks/chatbot.php.
require_once dirname(__DIR__) . '/hooks/chatbot.php';

if (!function_exists('cbapi_erro')) {
    function cbapi_erro(string $m): never { out(['ok' => false, 'msg' => $m], 400); }
    function cbapi_id(): int { $id = (int)($_GET['id'] ?? entrada()['id'] ?? 0); if ($id <= 0) cbapi_erro('Fluxo não informado'); return $id; }
    function cbapi_fluxo(int $id): array { $f = cb_fluxo_get($id); if (!$f) out(['ok' => false, 'msg' => 'Fluxo não encontrado'], 404); return $f; }
    function cbapi_fluxo_out(array $f): array {
        return ['id' => (int)$f['id'], 'nome' => $f['nome'], 'ativo' => (bool)$f['ativo'], 'modo' => $f['modo'], 'gatilho' => $f['gatilho'], 'so_fora_horario' => (bool)$f['so_fora_horario'],
            'mensagem_invalida' => $f['mensagem_invalida'], 'tentativas_max' => (int)$f['tentativas_max'], 'ao_exceder' => $f['ao_exceder'], 'expira_minutos' => (int)$f['expira_minutos'],
            'no_inicial_id' => $f['no_inicial_id'] === null ? null : (int)$f['no_inicial_id'], 'criado' => (int)$f['criado'], 'atualizado' => (int)$f['atualizado']];
    }
    function cbapi_nos_out(int $fid): array {
        $r = []; foreach (cb_nos_fluxo($fid) as $n) $r[] = ['id' => $n['id'], 'tipo' => $n['tipo'], 'conteudo' => $n['c'], 'pos_x' => $n['x'] === null ? null : (int)$n['x'], 'pos_y' => $n['y'] === null ? null : (int)$n['y']];
        return $r;
    }
    function cbapi_texto($v, string $campo, bool $obrig, int $max = 1000): string {
        $t = trim((string)($v ?? ''));
        if ($obrig && $t === '') cbapi_erro("Preencha o texto ($campo)");
        if (mb_strlen($t) > $max) cbapi_erro("O texto ($campo) passa de $max caracteres");
        return $t;
    }
    /** Normaliza o conteúdo de um nó; as referências continuam com os ids do cliente (chaves como string). */
    function cbapi_conteudo(string $tipo, $c, string $rot): array {
        $c = is_array($c) ? $c : []; $r = [];
        $ref = fn($x) => ($x === null || $x === '' || $x === 0 || $x === '0') ? null : (string)$x;
        switch ($tipo) {
            case 'mensagem': $r = ['texto' => cbapi_texto($c['texto'] ?? '', $rot, true), 'proximo_no_id' => $ref($c['proximo_no_id'] ?? null)]; break;
            case 'menu':
                $ops = []; foreach (($c['opcoes'] ?? []) as $o) { if (!is_array($o)) continue; $ops[] = ['rotulo' => cbapi_texto($o['rotulo'] ?? '', $rot . ' - opção', true, 60), 'proximo_no_id' => $ref($o['proximo_no_id'] ?? null)]; }
                if (count($ops) < 1 || count($ops) > 12) cbapi_erro("O menu ($rot) precisa ter de 1 a 12 opções");
                $r = ['texto' => cbapi_texto($c['texto'] ?? '', $rot, true), 'opcoes' => $ops]; break;
            case 'pergunta':
                $var = strtolower(trim((string)($c['variavel'] ?? ''))); if ($var !== '' && !preg_match('/^[a-z_][a-z0-9_]{0,29}$/', $var)) cbapi_erro("Nome de variável inválido em $rot (use letras minúsculas, números e _)");
                if (str_starts_with($var, '__')) cbapi_erro("Nome de variável reservado em $rot");
                $r = ['texto' => cbapi_texto($c['texto'] ?? '', $rot, true), 'variavel' => $var, 'proximo_no_id' => $ref($c['proximo_no_id'] ?? null)]; break;
            case 'transferir_fila': $r = ['texto' => cbapi_texto($c['texto'] ?? '', $rot, false), 'fila_id' => !empty($c['fila_id']) ? (int)$c['fila_id'] : null]; break;
            case 'encerrar': $r = ['texto' => cbapi_texto($c['texto'] ?? '', $rot, false)]; break;
            case 'webhook':
                $url = trim((string)($c['url'] ?? '')); if (mb_strlen($url) > 500) cbapi_erro("URL muito longa em $rot");
                $e = cb_url_segura($url); if (is_string($e)) cbapi_erro("Webhook ($rot): $e");
                $var = strtolower(trim((string)($c['variavel'] ?? 'resposta_webhook'))); if (!preg_match('/^[a-z_][a-z0-9_]{0,29}$/', $var) || str_starts_with($var, '__')) cbapi_erro("Nome de variável inválido em $rot");
                $r = ['url' => $url, 'variavel' => $var, 'enviar_resposta' => !empty($c['enviar_resposta']), 'proximo_no_id' => $ref($c['proximo_no_id'] ?? null)]; break;
            default: cbapi_erro('Tipo de nó inválido');
        }
        return $r;
    }
    function cbapi_arestas(array $no): array {
        $c = $no['conteudo']; if ($no['tipo'] === 'menu') return array_values(array_filter(array_map(fn($o) => $o['proximo_no_id'], $c['opcoes'])));
        return !empty($c['proximo_no_id']) ? [$c['proximo_no_id']] : [];
    }
    function cbapi_gatilho($g): array {
        $g = is_array($g) ? $g : []; $tipo = $g['tipo'] ?? 'primeira_mensagem';
        if (!in_array($tipo, ['primeira_mensagem', 'palavra', 'sempre_que_sem_atendimento'], true)) cbapi_erro('Gatilho inválido');
        $termos = []; foreach (($g['termos'] ?? []) as $t) { $t = trim((string)$t); if ($t !== '' && mb_strlen($t) <= 60) $termos[] = $t; }
        $termos = array_slice(array_values(array_unique($termos)), 0, 20);
        if ($tipo === 'palavra' && !$termos) cbapi_erro('Informe ao menos uma palavra-chave para o gatilho');
        $r = ['tipo' => $tipo, 'termos' => $termos];
        if (!empty($g['horario']) && is_array($g['horario'])) {
            $h = $g['horario']; $ini = (string)($h['ini'] ?? '08:00'); $fim = (string)($h['fim'] ?? '18:00');
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $ini) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $fim) || $ini >= $fim) cbapi_erro('Horário comercial inválido');
            $dias = array_values(array_unique(array_filter(array_map('intval', (array)($h['dias'] ?? [1, 2, 3, 4, 5])), fn($d) => $d >= 1 && $d <= 7)));
            $r['horario'] = ['dias' => $dias ?: [1, 2, 3, 4, 5], 'ini' => $ini, 'fim' => $fim];
        }
        return $r;
    }
    /** Valida o grafo: início definido, referências existentes, todos alcançáveis, sem laço de nós que não esperam resposta. */
    function cbapi_validar_grafo(array $nos, ?string $ini): void {
        if (!$nos) cbapi_erro('O fluxo precisa ter ao menos um passo');
        if ($ini === null || !isset($nos[$ini])) cbapi_erro('Defina o passo inicial do fluxo');
        foreach ($nos as $k => $n) foreach (cbapi_arestas($n) as $d) if (!isset($nos[$d])) cbapi_erro('Há uma ligação para um passo que não existe (' . $n['rot'] . ')');
        $vis = [$ini => 1]; $fila = [$ini];
        while ($fila) { $x = array_shift($fila); foreach (cbapi_arestas($nos[$x]) as $d) if (!isset($vis[$d])) { $vis[$d] = 1; $fila[] = $d; } }
        $nao = []; foreach ($nos as $k => $n) if (!isset($vis[$k])) $nao[] = $n['rot'];
        if ($nao) cbapi_erro('Passos que o contato nunca alcança: ' . implode(', ', array_slice($nao, 0, 5)) . (count($nao) > 5 ? '…' : ''));
        $cor = [];
        $dfs = function ($k) use (&$dfs, &$cor, $nos) {
            $cor[$k] = 1;
            foreach (cbapi_arestas($nos[$k]) as $d) {
                if (!in_array($nos[$d]['tipo'], ['mensagem', 'webhook'], true)) continue; // menu/pergunta esperam resposta
                if (($cor[$d] ?? 0) === 1) return $nos[$d]['rot'];
                if (!isset($cor[$d]) && ($r = $dfs($d))) return $r;
            }
            $cor[$k] = 2; return null;
        };
        foreach ($nos as $k => $n) if (in_array($n['tipo'], ['mensagem', 'webhook'], true) && !isset($cor[$k]) && ($r = $dfs($k))) cbapi_erro('Laço infinito de mensagens sem esperar resposta (passo "' . $r . '"). Coloque um menu ou pergunta no meio.');
    }
    function cbapi_simular(array $fl, array $nos, array $entradas): array {
        $conv = []; $s = ['id' => 0, 'jid' => '5500000000000@s.whatsapp.net', 'no_atual' => (int)$fl['no_inicial_id'], 'vars' => ['nome' => 'Contato Teste', 'numero' => '5500000000000', '__pilha' => []], 'tentativas' => 0, 'estado' => 'ativo'];
        $add = function (array $out) use (&$conv) { foreach ($out as $o) { if (in_array($o['t'], ['texto', 'invalida'], true)) $conv[] = ['de' => 'bot', 'texto' => $o['texto'], 'no_id' => $o['no'] ?? null]; elseif ($o['t'] === 'transferir') $conv[] = ['de' => 'sistema', 'texto' => 'Transferido para atendimento humano' . ($o['fila_id'] ? ' (fila ' . $o['fila_id'] . ')' : '') . '.', 'no_id' => $o['no'] ?? null]; elseif ($o['t'] === 'aviso') $conv[] = ['de' => 'sistema', 'texto' => $o['texto'], 'no_id' => $o['no'] ?? null]; } };
        $add(cb_rodar($fl, $nos, $s, null, true));
        foreach ($entradas as $e) {
            if ($s['estado'] !== 'ativo') { $conv[] = ['de' => 'sistema', 'texto' => 'Sessão ' . ($s['estado'] === 'transferido' ? 'transferida' : 'encerrada') . ': as mensagens restantes seriam tratadas fora do chatbot.', 'no_id' => null]; break; }
            $conv[] = ['de' => 'contato', 'texto' => $e, 'no_id' => null]; $add(cb_rodar($fl, $nos, $s, $e, true));
        }
        return ['conversa' => $conv, 'estado' => $s['estado'], 'variaveis' => array_filter($s['vars'], fn($k) => $k[0] !== '_', ARRAY_FILTER_USE_KEY), 'no_atual' => $s['no_atual'] ?: null];
    }
    function cbapi_pag(): array { $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = min(100, max(10, (int)($_GET['por'] ?? 30))); return [$pag, $por, ($pag - 1) * $por]; }
}

return [
    'listar_fluxos' => function () {
        $i = inst(); $bd = bd();
        $q = $bd->prepare('SELECT f.*, (SELECT COUNT(*) FROM chatbot_nos n WHERE n.fluxo_id=f.id) nos, (SELECT COUNT(*) FROM chatbot_sessoes s WHERE s.fluxo_id=f.id AND s.estado=\'ativo\') sessoes_ativas FROM chatbot_fluxos f WHERE f.instancia=? ORDER BY f.id DESC'); $q->execute([$i]);
        $r = []; foreach ($q->fetchAll() as $f) { $f['gatilho'] = json_decode((string)$f['gatilho'], true) ?: ['tipo' => 'primeira_mensagem', 'termos' => []]; $r[] = cbapi_fluxo_out($f) + ['nos' => (int)$f['nos'], 'sessoes_ativas' => (int)$f['sessoes_ativas']]; }
        out(['ok' => true, 'fluxos' => $r, 'webhook_ligado' => webhook_ligado(), 'filas_disponiveis' => cb_atend_cols() !== null]);
    },
    'ver_fluxo' => function () { $f = cbapi_fluxo(cbapi_id()); out(['ok' => true, 'fluxo' => cbapi_fluxo_out($f), 'nos' => cbapi_nos_out((int)$f['id'])]); },
    'salvar_fluxo' => function () {
        $d = entrada(); $bd = bd(); $i = inst(); $id = (int)($d['id'] ?? 0);
        $nome = trim((string)($d['nome'] ?? '')); if ($nome === '' || mb_strlen($nome) > 80) cbapi_erro('Informe o nome do fluxo (até 80 caracteres)');
        $g = cbapi_gatilho($d['gatilho'] ?? []);
        $inval = cbapi_texto($d['mensagem_invalida'] ?? 'Não entendi sua resposta. Por favor, escolha uma das opções.', 'mensagem de opção inválida', true);
        $tent = (int)($d['tentativas_max'] ?? 3); if ($tent < 1 || $tent > 10) cbapi_erro('Tentativas deve ficar entre 1 e 10');
        $exp = (int)($d['expira_minutos'] ?? 30); if ($exp < 1 || $exp > 1440) cbapi_erro('Expiração deve ficar entre 1 e 1440 minutos');
        $exc = (string)($d['ao_exceder'] ?? 'transferir'); if (!in_array($exc, ['transferir', 'encerrar'], true)) cbapi_erro('Ação ao exceder tentativas inválida');
        $brutos = $d['nos'] ?? []; if (!is_array($brutos)) cbapi_erro('Nós inválidos');
        if (count($brutos) > 60) cbapi_erro('O fluxo pode ter no máximo 60 passos');
        $nos = []; $n = 0; $nomesTipo = ['mensagem' => 'Mensagem', 'menu' => 'Menu', 'pergunta' => 'Pergunta', 'transferir_fila' => 'Transferir', 'encerrar' => 'Encerrar', 'webhook' => 'Webhook'];
        foreach ($brutos as $b) {
            if (!is_array($b)) continue; $n++; $k = (string)($b['id'] ?? ''); if ($k === '' || isset($nos[$k])) cbapi_erro('Passos com identificador repetido ou vazio');
            $tipo = (string)($b['tipo'] ?? ''); if (!isset($nomesTipo[$tipo])) cbapi_erro('Tipo de passo inválido');
            $rot = $nomesTipo[$tipo] . ' ' . $n;
            $nos[$k] = ['tipo' => $tipo, 'rot' => $rot, 'conteudo' => cbapi_conteudo($tipo, $b['conteudo'] ?? [], $rot), 'x' => isset($b['pos_x']) ? (int)$b['pos_x'] : null, 'y' => isset($b['pos_y']) ? (int)$b['pos_y'] : null];
        }
        $ini = isset($d['no_inicial']) ? (string)$d['no_inicial'] : (isset($d['no_inicial_id']) ? (string)$d['no_inicial_id'] : null);
        if ($ini === null || $ini === '') $ini = array_key_first($nos);
        cbapi_validar_grafo($nos, $ini);
        $bd->beginTransaction();
        try {
            $now = time();
            if ($id) {
                cbapi_fluxo($id);
                $bd->prepare('UPDATE chatbot_fluxos SET nome=?,gatilho=?,so_fora_horario=?,mensagem_invalida=?,tentativas_max=?,ao_exceder=?,expira_minutos=?,atualizado=? WHERE id=? AND instancia=?')
                   ->execute([$nome, json_encode($g, JSON_UNESCAPED_UNICODE), !empty($d['so_fora_horario']) ? 1 : 0, $inval, $tent, $exc, $exp, $now, $id, $i]);
            } else {
                $bd->prepare('INSERT INTO chatbot_fluxos (instancia,nome,ativo,modo,gatilho,so_fora_horario,mensagem_invalida,tentativas_max,ao_exceder,expira_minutos,criado,atualizado) VALUES (?,?,0,\'teste\',?,?,?,?,?,?,?,?)')
                   ->execute([$i, $nome, json_encode($g, JSON_UNESCAPED_UNICODE), !empty($d['so_fora_horario']) ? 1 : 0, $inval, $tent, $exc, $exp, $now, $now]);
                $id = (int)$bd->lastInsertId();
            }
            $q = $bd->prepare('SELECT id FROM chatbot_nos WHERE fluxo_id=?'); $q->execute([$id]); $exist = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
            $mapa = [];
            foreach ($nos as $k => $no) { // 1ª passada: garante o id real
                if (ctype_digit((string)$k) && in_array((int)$k, $exist, true)) { $mapa[$k] = (int)$k; continue; }
                $bd->prepare('INSERT INTO chatbot_nos (fluxo_id,tipo,conteudo,pos_x,pos_y) VALUES (?,?,NULL,?,?)')->execute([$id, $no['tipo'], $no['x'], $no['y']]); $mapa[$k] = (int)$bd->lastInsertId();
            }
            $fix = fn($x) => $x === null ? null : (int)$mapa[$x];
            foreach ($nos as $k => $no) { // 2ª: grava conteúdo com ids reais
                $c = $no['conteudo'];
                if (isset($c['proximo_no_id'])) $c['proximo_no_id'] = $fix($c['proximo_no_id']);
                if (isset($c['opcoes'])) foreach ($c['opcoes'] as $oi => $o) $c['opcoes'][$oi]['proximo_no_id'] = $fix($o['proximo_no_id']);
                $bd->prepare('UPDATE chatbot_nos SET tipo=?, conteudo=?, pos_x=?, pos_y=? WHERE id=? AND fluxo_id=?')->execute([$no['tipo'], json_encode($c, JSON_UNESCAPED_UNICODE), $no['x'], $no['y'], $mapa[$k], $id]);
            }
            $manter = array_values($mapa); $apagar = array_diff($exist, $manter);
            if ($apagar) {
                $in = implode(',', array_map('intval', $apagar));
                $bd->exec("DELETE FROM chatbot_nos WHERE fluxo_id=$id AND id IN ($in)");
                $bd->exec("UPDATE chatbot_sessoes SET estado='encerrado' WHERE fluxo_id=$id AND estado='ativo' AND no_atual IN ($in)");
            }
            $bd->prepare('UPDATE chatbot_fluxos SET no_inicial_id=? WHERE id=?')->execute([$mapa[$ini], $id]);
            $bd->commit();
        } catch (Throwable $e) { if ($bd->inTransaction()) $bd->rollBack(); @error_log('[zapzap] chatbot salvar: ' . $e->getMessage()); out(['ok' => false, 'msg' => 'Não foi possível salvar o fluxo'], 500); }
        aud_detalhe('salvou o fluxo de chatbot ' . mb_substr($nome, 0, 60));
        $f = cbapi_fluxo($id); out(['ok' => true, 'msg' => 'Fluxo salvo.', 'fluxo' => cbapi_fluxo_out($f), 'nos' => cbapi_nos_out($id), 'mapa_ids' => (object)$mapa]);
    },
    'ativar_fluxo' => function () {
        $d = entrada(); $f = cbapi_fluxo((int)($d['id'] ?? 0)); $ativo = !empty($d['ativo']); $modo = (string)($d['modo'] ?? $f['modo']);
        if (!in_array($modo, ['teste', 'ao_vivo'], true)) cbapi_erro('Modo inválido');
        $aviso = null;
        if ($ativo) {
            $nos = cb_nos_fluxo((int)$f['id']); if (!$f['no_inicial_id'] || !isset($nos[(int)$f['no_inicial_id']])) cbapi_erro('O fluxo ainda não tem passos válidos');
            if (!webhook_ligado()) $aviso = 'O recebimento em tempo real está desligado: o chatbot só reage a mensagens quando ele estiver ligado.';
        }
        bd()->prepare('UPDATE chatbot_fluxos SET ativo=?, modo=?, atualizado=? WHERE id=? AND instancia=?')->execute([$ativo ? 1 : 0, $modo, time(), $f['id'], inst()]);
        if (!$ativo) bd()->prepare("UPDATE chatbot_sessoes SET estado='encerrado', atualizada=? WHERE fluxo_id=? AND estado='ativo'")->execute([time(), $f['id']]);
        aud_detalhe(($ativo ? 'ativou' : 'desativou') . ' o fluxo de chatbot ' . mb_substr($f['nome'], 0, 60) . ' (' . $modo . ')');
        out(['ok' => true, 'msg' => $ativo ? ($modo === 'ao_vivo' ? 'Chatbot ativo e respondendo ao vivo.' : 'Chatbot ativo em modo teste (só registra).') : 'Chatbot desativado.', 'ativo' => $ativo, 'modo' => $modo, 'aviso' => $aviso]);
    },
    'excluir_fluxo' => function () {
        $f = cbapi_fluxo((int)(entrada()['id'] ?? 0)); $bd = bd(); $id = (int)$f['id'];
        $bd->beginTransaction();
        foreach (['chatbot_nos', 'chatbot_sessoes', 'chatbot_logs'] as $t) $bd->prepare("DELETE FROM $t WHERE fluxo_id=?")->execute([$id]);
        $bd->prepare('DELETE FROM chatbot_fluxos WHERE id=? AND instancia=?')->execute([$id, inst()]); $bd->commit();
        aud_detalhe('excluiu o fluxo de chatbot ' . mb_substr($f['nome'], 0, 60)); out(['ok' => true, 'msg' => 'Fluxo excluído.']);
    },
    'duplicar_fluxo' => function () {
        $f = cbapi_fluxo((int)(entrada()['id'] ?? 0)); $bd = bd(); $now = time(); $nos = cb_nos_fluxo((int)$f['id']);
        $bd->beginTransaction();
        try {
            $bd->prepare('INSERT INTO chatbot_fluxos (instancia,nome,ativo,modo,gatilho,so_fora_horario,mensagem_invalida,tentativas_max,ao_exceder,expira_minutos,criado,atualizado) VALUES (?,?,0,\'teste\',?,?,?,?,?,?,?,?)')
               ->execute([inst(), mb_substr($f['nome'], 0, 70) . ' (cópia)', json_encode($f['gatilho'], JSON_UNESCAPED_UNICODE), $f['so_fora_horario'], $f['mensagem_invalida'], $f['tentativas_max'], $f['ao_exceder'], $f['expira_minutos'], $now, $now]);
            $novo = (int)$bd->lastInsertId(); $mapa = [];
            foreach ($nos as $id => $n) { $bd->prepare('INSERT INTO chatbot_nos (fluxo_id,tipo,conteudo,pos_x,pos_y) VALUES (?,?,NULL,?,?)')->execute([$novo, $n['tipo'], $n['x'], $n['y']]); $mapa[$id] = (int)$bd->lastInsertId(); }
            foreach ($nos as $id => $n) {
                $c = $n['c'];
                if (!empty($c['proximo_no_id'])) $c['proximo_no_id'] = $mapa[(int)$c['proximo_no_id']] ?? null;
                if (isset($c['opcoes'])) foreach ($c['opcoes'] as $oi => $o) $c['opcoes'][$oi]['proximo_no_id'] = !empty($o['proximo_no_id']) ? ($mapa[(int)$o['proximo_no_id']] ?? null) : null;
                $bd->prepare('UPDATE chatbot_nos SET conteudo=? WHERE id=?')->execute([json_encode($c, JSON_UNESCAPED_UNICODE), $mapa[$id]]);
            }
            if ($f['no_inicial_id']) $bd->prepare('UPDATE chatbot_fluxos SET no_inicial_id=? WHERE id=?')->execute([$mapa[(int)$f['no_inicial_id']] ?? null, $novo]);
            $bd->commit();
        } catch (Throwable $e) { if ($bd->inTransaction()) $bd->rollBack(); out(['ok' => false, 'msg' => 'Não foi possível duplicar o fluxo'], 500); }
        aud_detalhe('duplicou o fluxo de chatbot ' . mb_substr($f['nome'], 0, 60)); out(['ok' => true, 'msg' => 'Fluxo duplicado (desativado, em modo teste).', 'id' => $novo]);
    },
    'testar_fluxo' => function () {
        $d = entrada(); $f = cbapi_fluxo((int)($d['id'] ?? 0)); $nos = cb_nos_fluxo((int)$f['id']);
        if (!$f['no_inicial_id'] || !isset($nos[(int)$f['no_inicial_id']])) cbapi_erro('O fluxo ainda não tem passos válidos');
        $ent = []; foreach (array_slice((array)($d['entradas'] ?? []), 0, 30) as $e) $ent[] = mb_substr((string)$e, 0, 400);
        out(['ok' => true, 'simulado' => true] + cbapi_simular($f, $nos, $ent));
    },
    'listar_sessoes_chatbot' => function () {
        $bd = bd(); $i = inst(); $bd->prepare("UPDATE chatbot_sessoes s JOIN chatbot_fluxos f ON f.id=s.fluxo_id SET s.estado='encerrado' WHERE s.instancia=? AND s.estado='ativo' AND s.atualizada < ? - f.expira_minutos*60")->execute([$i, time()]);
        $w = ['s.instancia=?']; $p = [$i];
        if (!empty($_GET['estado']) && in_array($_GET['estado'], ['ativo', 'encerrado', 'transferido'], true)) { $w[] = 's.estado=?'; $p[] = $_GET['estado']; }
        if (!empty($_GET['fluxo_id'])) { $w[] = 's.fluxo_id=?'; $p[] = (int)$_GET['fluxo_id']; }
        [$pag, $por, $off] = cbapi_pag();
        $q = $bd->prepare('SELECT COUNT(*) FROM chatbot_sessoes s WHERE ' . implode(' AND ', $w)); $q->execute($p); $tot = (int)$q->fetchColumn();
        $q = $bd->prepare('SELECT s.id,s.fluxo_id,f.nome fluxo,f.modo,s.jid,s.no_atual,s.vars,s.tentativas,s.iniciada,s.atualizada,s.estado FROM chatbot_sessoes s LEFT JOIN chatbot_fluxos f ON f.id=s.fluxo_id WHERE ' . implode(' AND ', $w) . " ORDER BY s.atualizada DESC LIMIT $por OFFSET $off"); $q->execute($p);
        $r = []; foreach ($q->fetchAll() as $s) { $v = json_decode((string)$s['vars'], true) ?: []; $r[] = ['id' => (int)$s['id'], 'fluxo_id' => (int)$s['fluxo_id'], 'fluxo' => $s['fluxo'], 'modo' => $s['modo'], 'jid' => $s['jid'], 'nome' => $v['nome'] ?? '', 'no_atual' => $s['no_atual'] === null ? null : (int)$s['no_atual'], 'variaveis' => array_filter($v, fn($k) => $k[0] !== '_' && $k !== 'nome' && $k !== 'numero', ARRAY_FILTER_USE_KEY), 'tentativas' => (int)$s['tentativas'], 'iniciada' => (int)$s['iniciada'], 'atualizada' => (int)$s['atualizada'], 'estado' => $s['estado']]; }
        out(['ok' => true, 'total' => $tot, 'pag' => $pag, 'paginas' => max(1, (int)ceil($tot / $por)), 'sessoes' => $r]);
    },
    'encerrar_sessao_chatbot' => function () {
        $id = (int)(entrada()['id'] ?? 0); $q = bd()->prepare("UPDATE chatbot_sessoes SET estado='encerrado', atualizada=? WHERE id=? AND instancia=? AND estado='ativo'"); $q->execute([time(), $id, inst()]);
        if (!$q->rowCount()) out(['ok' => false, 'msg' => 'Sessão não encontrada ou já encerrada'], 404);
        cb_log('encerrada', null, $id, null, null, null, 'encerrada manualmente'); aud_detalhe('encerrou uma sessão do chatbot'); out(['ok' => true, 'msg' => 'Sessão encerrada.']);
    },
    'listar_logs_chatbot' => function () {
        $w = ['instancia=?']; $p = [inst()];
        if (!empty($_GET['fluxo_id'])) { $w[] = 'fluxo_id=?'; $p[] = (int)$_GET['fluxo_id']; }
        if (!empty($_GET['sessao_id'])) { $w[] = 'sessao_id=?'; $p[] = (int)$_GET['sessao_id']; }
        if (!empty($_GET['jid'])) { $w[] = 'jid=?'; $p[] = (string)$_GET['jid']; }
        if (!empty($_GET['evento'])) { $w[] = 'evento=?'; $p[] = (string)$_GET['evento']; }
        [$pag, $por, $off] = cbapi_pag();
        $q = bd()->prepare('SELECT COUNT(*) FROM chatbot_logs WHERE ' . implode(' AND ', $w)); $q->execute($p); $tot = (int)$q->fetchColumn();
        $q = bd()->prepare('SELECT id,ts,fluxo_id,sessao_id,jid,evento,no_id,msg_id,texto,simulado FROM chatbot_logs WHERE ' . implode(' AND ', $w) . " ORDER BY id DESC LIMIT $por OFFSET $off"); $q->execute($p);
        $r = array_map(fn($l) => ['id' => (int)$l['id'], 'ts' => (int)$l['ts'], 'fluxo_id' => $l['fluxo_id'] === null ? null : (int)$l['fluxo_id'], 'sessao_id' => $l['sessao_id'] === null ? null : (int)$l['sessao_id'], 'jid' => $l['jid'], 'evento' => $l['evento'], 'no_id' => $l['no_id'] === null ? null : (int)$l['no_id'], 'texto' => $l['texto'], 'simulado' => (bool)$l['simulado']], $q->fetchAll());
        out(['ok' => true, 'total' => $tot, 'pag' => $pag, 'paginas' => max(1, (int)ceil($tot / $por)), 'logs' => $r]);
    },
    'rel_chatbot' => function () {
        $dias = min(365, max(1, (int)($_GET['dias'] ?? 30))); $de = time() - $dias * 86400; $i = inst(); $bd = bd();
        $q = $bd->prepare('SELECT estado, COUNT(*) n FROM chatbot_sessoes WHERE instancia=? AND iniciada>=? GROUP BY estado'); $q->execute([$i, $de]); $est = ['ativo' => 0, 'encerrado' => 0, 'transferido' => 0]; foreach ($q->fetchAll() as $r) $est[$r['estado']] = (int)$r['n'];
        $q = $bd->prepare('SELECT f.id, f.nome, COUNT(s.id) sessoes, SUM(s.estado=\'transferido\') transferidas FROM chatbot_fluxos f LEFT JOIN chatbot_sessoes s ON s.fluxo_id=f.id AND s.iniciada>=? WHERE f.instancia=? GROUP BY f.id,f.nome ORDER BY sessoes DESC'); $q->execute([$de, $i]);
        $fl = array_map(fn($r) => ['id' => (int)$r['id'], 'nome' => $r['nome'], 'sessoes' => (int)$r['sessoes'], 'transferidas' => (int)$r['transferidas']], $q->fetchAll());
        $q = $bd->prepare("SELECT DATE(FROM_UNIXTIME(iniciada)) dia, COUNT(*) n FROM chatbot_sessoes WHERE instancia=? AND iniciada>=? GROUP BY dia ORDER BY dia"); $q->execute([$i, $de]);
        $pd = array_map(fn($r) => ['dia' => $r['dia'], 'sessoes' => (int)$r['n']], $q->fetchAll());
        $q = $bd->prepare("SELECT evento, simulado, COUNT(*) n FROM chatbot_logs WHERE instancia=? AND ts>=? AND evento IN ('recebida','enviada','invalida','transferida','expirada','ignorada','erro') GROUP BY evento, simulado"); $q->execute([$i, $de]); $ev = [];
        foreach ($q->fetchAll() as $r) $ev[$r['evento']][$r['simulado'] ? 'simuladas' : 'reais'] = (int)$r['n'];
        $total = array_sum($est);
        out(['ok' => true, 'dias' => $dias, 'sessoes' => ['total' => $total, 'por_estado' => $est], 'taxa_transferencia' => $total ? round($est['transferido'] * 100 / $total, 1) : 0, 'por_fluxo' => $fl, 'por_dia' => $pd, 'eventos' => (object)$ev]);
    },
    '__perms' => [
        'listar_fluxos' => 'chatbot.ver', 'ver_fluxo' => 'chatbot.ver', 'listar_sessoes_chatbot' => 'chatbot.ver', 'listar_logs_chatbot' => 'chatbot.ver', 'rel_chatbot' => 'chatbot.ver',
        'testar_fluxo' => 'chatbot.ver', 'salvar_fluxo' => 'chatbot.editar', 'ativar_fluxo' => 'chatbot.editar', 'excluir_fluxo' => 'chatbot.editar', 'duplicar_fluxo' => 'chatbot.editar', 'encerrar_sessao_chatbot' => 'chatbot.editar',
    ],
];
