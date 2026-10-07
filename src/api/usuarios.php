<?php
// ZapZap — módulo USUÁRIOS (somente master). Ações sem permissão declarada em '__perms' = só master (default-deny).
declare(strict_types=1);

if (!function_exists('usr_rotulo_acao')) {
    /** Rótulo amigável (pt-BR) da ação auditada. Mapa extensível; desconhecida mostra o nome técnico. */
    function usr_rotulo_acao(string $a): string {
        static $m = [
            'login' => 'Entrou', 'sair' => 'Saiu', 'visita' => 'Abriu a tela', 'trocar_senha' => 'Trocou a própria senha',
            'enviar_texto' => 'Enviou mensagem de texto', 'enviar_midia' => 'Enviou arquivo/mídia', 'enviar_enquete' => 'Enviou enquete',
            'enviar_localizacao' => 'Enviou localização', 'enviar_contato' => 'Enviou contato', 'presenca' => 'Mostrou "digitando"',
            'verificar_numero' => 'Verificou número no WhatsApp', 'marcar_lida' => 'Marcou conversa como lida',
            'midia' => 'Abriu uma mídia', 'convite' => 'Copiou link de convite', 'exportar_csv' => 'Exportou histórico (CSV)',
            'agendar_texto' => 'Agendou mensagem de texto', 'agendar_midia' => 'Agendou mídia', 'cancelar_agendada' => 'Cancelou agendamento',
            'reagendar' => 'Reagendou mensagem', 'enviar_agora' => 'Enviou agendada agora',
            'config_salvar' => 'Alterou configurações', 'reiniciar' => 'Reiniciou a conexão', 'perfil_nome' => 'Alterou nome do perfil', 'perfil_status' => 'Alterou recado do perfil',
            'instancia_criar' => 'Criou conexão', 'instancia_qr' => 'Gerou QR Code', 'instancia_apelido' => 'Renomeou conexão',
            'instancia_desconectar' => 'Desconectou conexão', 'instancia_excluir' => 'Excluiu conexão', 'instancia_selecionar' => 'Trocou de conexão',
            'webhook_ligar' => 'Ligou recebimento em tempo real', 'webhook_desligar' => 'Desligou recebimento em tempo real',
            'salvar_usuario' => 'Salvou usuário', 'redefinir_senha' => 'Redefiniu senha de usuário', 'ativar_usuario' => 'Ativou/desativou usuário',
            'encerrar_sessoes' => 'Encerrou sessões de usuário', 'excluir_usuario' => 'Excluiu usuário', 'gerar_senha' => 'Definiu nova senha para usuário', 'gerar_senha_provisoria' => 'Definiu nova senha para usuário', 'exportar_atividade_csv' => 'Exportou atividade (CSV)',
        ];
        return $m[$a] ?? $a;
    }
    function usr_ts(string $s, bool $fim): ?int {
        $s = trim($s); if ($s === '') return null;
        if (ctype_digit($s) && strlen($s) >= 9) return (int)$s;
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null;
        $t = (new DateTimeImmutable($s . ' 00:00:00', new DateTimeZone('America/Maceio')))->getTimestamp();
        return $fim ? $t + 86399 : $t;
    }
    function usr_like(string $q): string { return '%' . addcslashes($q, '\\%_') . '%'; }
    function usr_alvo(): array {
        $id = (int)((entrada()['id'] ?? $_GET['id'] ?? 0));
        $q = bd()->prepare('SELECT * FROM usuarios WHERE id=?'); $q->execute([$id]); $u = $q->fetch();
        if (!$u) out(['ok' => false, 'msg' => 'Usuário não encontrado.'], 404);
        return $u;
    }
    /** Filtro comum da atividade → [where, params] */
    function usr_filtro_atividade(int $id): array {
        $w = ['usuario_id=?']; $p = [$id];
        $tipo = trim((string)($_GET['tipo'] ?? '')); if ($tipo !== '' && preg_match('/^[a-z0-9_]{1,60}$/i', $tipo)) { $w[] = 'acao=?'; $p[] = $tipo; }
        $q = trim((string)($_GET['q'] ?? '')); if ($q !== '') { $q = mb_substr($q, 0, 80); $w[] = '(acao LIKE ? OR detalhe LIKE ? OR ip LIKE ? OR instancia LIKE ?)'; $l = usr_like($q); array_push($p, $l, $l, $l, $l); }
        $de = usr_ts((string)($_GET['de'] ?? ''), false); if ($de !== null) { $w[] = 'ts>=?'; $p[] = $de; }
        $ate = usr_ts((string)($_GET['ate'] ?? ''), true); if ($ate !== null) { $w[] = 'ts<=?'; $p[] = $ate; }
        return [implode(' AND ', $w), $p];
    }
    function usr_csv_cel($v): string { $s = (string)$v; if ($s !== '' && strpbrk($s[0], "=+-@\t\r") !== false) $s = "'" . $s; return '"' . str_replace('"', '""', $s) . '"'; }
    function usr_validar_corpo(array $e, bool $novo): array {
        $usuario = trim((string)($e['usuario'] ?? '')); $nome = trim((string)($e['nome'] ?? '')); $senha = (string)($e['senha'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,40}$/', $usuario)) out(['ok' => false, 'msg' => 'Usuário: 3 a 40 caracteres (letras minúsculas, números, ponto, hífen e sublinhado).', 'campo' => 'usuario'], 400);
        $n = mb_strlen($nome); if ($n < 2 || $n > 80) out(['ok' => false, 'msg' => 'Nome: de 2 a 80 caracteres.', 'campo' => 'nome'], 400);
        if (preg_match('/[\x00-\x1f\x7f]/', $nome)) out(['ok' => false, 'msg' => 'Nome contém caracteres inválidos.', 'campo' => 'nome'], 400);
        if (($novo || $senha !== '') && (strlen($senha) < 6 || strlen($senha) > 200)) out(['ok' => false, 'msg' => 'A senha deve ter pelo menos 6 caracteres.', 'campo' => 'senha'], 400);
        $cat = perm_catalogo(); $perms = [];
        foreach ((array)($e['permissoes'] ?? []) as $c) {
            if (!is_string($c) || !isset($cat[$c]) || str_starts_with($c, 'usuarios.')) out(['ok' => false, 'msg' => 'Permissão inválida: ' . mb_substr((string)(is_scalar($c) ? $c : '?'), 0, 40), 'campo' => 'permissoes'], 400);
            $perms[$c] = true;
        }
        $reg = array_keys(registro()); $inst = [];
        foreach ((array)($e['instancias'] ?? []) as $i) {
            if (!is_string($i) || !in_array($i, $reg, true)) out(['ok' => false, 'msg' => 'Conexão inválida: ' . mb_substr((string)(is_scalar($i) ? $i : '?'), 0, 40), 'campo' => 'instancias'], 400);
            $inst[$i] = true;
        }
        return [$usuario, $nome, $senha, array_keys($perms), array_keys($inst), !empty($e['todas_instancias']), !array_key_exists('ativo', $e) || !empty($e['ativo'])];
    }
}

return [
    'listar_usuarios' => function () {
        $l = bd()->query('SELECT u.id,u.usuario,u.nome,u.master,u.ativo,u.todas_instancias,u.trocar_senha,u.ultimo_login,u.ultimo_ip,u.criado,
            (SELECT COUNT(*) FROM usuario_permissoes p WHERE p.usuario_id=u.id) qp,
            (SELECT COUNT(*) FROM sessoes s WHERE s.usuario_id=u.id AND s.expira>' . time() . ') ss
            FROM usuarios u ORDER BY u.master DESC, u.ativo DESC, u.nome')->fetchAll();
        $o = [];
        foreach ($l as $r) $o[] = ['id' => (int)$r['id'], 'usuario' => $r['usuario'], 'nome' => $r['nome'], 'master' => (int)$r['master'] === 1, 'ativo' => (int)$r['ativo'] === 1,
            'todas_instancias' => (int)$r['todas_instancias'] === 1, 'ultimo_login' => $r['ultimo_login'] !== null ? (int)$r['ultimo_login'] : null, 'ultimo_ip' => $r['ultimo_ip'],
            'trocar_senha' => (int)$r['trocar_senha'] === 1, 'ultima_troca_senha' => null, 'criado' => (int)$r['criado'], 'qtd_permissoes' => (int)$r['qp'], 'sessoes_ativas' => (int)$r['ss']];
        out(['ok' => true, 'usuarios' => $o, 'total' => count($o)]);
    },
    'ver_usuario' => function () {
        $u = usr_alvo(); $id = (int)$u['id'];
        $q = bd()->prepare('SELECT instancia FROM usuario_instancias WHERE usuario_id=? ORDER BY instancia'); $q->execute([$id]);
        out(['ok' => true, 'usuario' => ['id' => $id, 'usuario' => $u['usuario'], 'nome' => $u['nome'], 'master' => (int)$u['master'] === 1, 'ativo' => (int)$u['ativo'] === 1,
            'todas_instancias' => (int)$u['todas_instancias'] === 1, 'ultimo_login' => $u['ultimo_login'] !== null ? (int)$u['ultimo_login'] : null, 'ultimo_ip' => $u['ultimo_ip'], 'criado' => (int)$u['criado'], 'trocar_senha' => (int)$u['trocar_senha'] === 1, 'ultima_troca_senha' => null],
            'permissoes' => perms_do_usuario($id), 'instancias' => array_column($q->fetchAll(), 'instancia'),
            'conexoes' => array_map(fn($k, $v) => ['nome' => $k, 'apelido' => $v['apelido'] ?? $k], array_keys(registro()), array_values(registro()))]);
    },
    'ver_catalogo_permissoes' => function () {
        $g = [];
        foreach (perm_catalogo() as $k => [$grupo, $rot]) { if (str_starts_with($k, 'usuarios.')) continue; $g[$grupo][] = ['chave' => $k, 'rotulo' => $rot]; }
        $o = []; foreach ($g as $n => $it) $o[] = ['grupo' => $n, 'itens' => $it];
        out(['ok' => true, 'grupos' => $o]);
    },
    'salvar_usuario' => function () {
        $e = entrada(); $id = (int)($e['id'] ?? 0); $novo = $id === 0;
        [$usuario, $nome, $senha, $perms, $inst, $todas, $ativo] = usr_validar_corpo($e, $novo);
        $pdo = bd();
        if ($novo) {
            $q = $pdo->prepare('SELECT 1 FROM usuarios WHERE usuario=?'); $q->execute([$usuario]);
            if ($q->fetchColumn()) out(['ok' => false, 'msg' => 'Já existe um usuário com esse login.', 'campo' => 'usuario'], 409);
            $pdo->beginTransaction();
            $pdo->prepare('INSERT INTO usuarios (usuario,nome,senha_hash,master,ativo,todas_instancias,trocar_senha,criado,criado_por) VALUES (?,?,?,0,?,?,?,?,?)')
                ->execute([$usuario, $nome, password_hash($senha, PASSWORD_DEFAULT), $ativo ? 1 : 0, $todas ? 1 : 0, !empty($e['exigir_troca']) ? 1 : 0, time(), uid()]);
            $id = (int)$pdo->lastInsertId();
        } else {
            $q = $pdo->prepare('SELECT * FROM usuarios WHERE id=?'); $q->execute([$id]); $u = $q->fetch();
            if (!$u) out(['ok' => false, 'msg' => 'Usuário não encontrado.'], 404);
            $eu = $id === uid(); $master = (int)$u['master'] === 1;
            if ($usuario !== $u['usuario']) {
                $q = $pdo->prepare('SELECT 1 FROM usuarios WHERE usuario=? AND id<>?'); $q->execute([$usuario, $id]);
                if ($q->fetchColumn()) out(['ok' => false, 'msg' => 'Já existe um usuário com esse login.', 'campo' => 'usuario'], 409);
            }
            if (($master || $eu) && !$ativo) out(['ok' => false, 'msg' => $master ? 'O usuário master não pode ser desativado.' : 'Você não pode desativar a si mesmo.'], 400);
            $pdo->beginTransaction();
            // master: só nome/login/senha (permissões e conexões são sempre totais; nunca rebaixado)
            if ($master) $pdo->prepare('UPDATE usuarios SET usuario=?, nome=? WHERE id=?')->execute([$usuario, $nome, $id]);
            else $pdo->prepare('UPDATE usuarios SET usuario=?, nome=?, ativo=?, todas_instancias=? WHERE id=?')->execute([$usuario, $nome, $ativo ? 1 : 0, $todas ? 1 : 0, $id]);
            if ($senha !== '') $pdo->prepare('UPDATE usuarios SET senha_hash=?, trocar_senha=? WHERE id=?')->execute([password_hash($senha, PASSWORD_DEFAULT), (!$eu && !empty($e['exigir_troca'])) ? 1 : 0, $id]);
            if (!$ativo && (int)$u['ativo'] === 1) sessoes_revogar($id);
            if ($senha !== '' && !$eu) sessoes_revogar($id);
            if ($master) { $perms = []; $inst = []; }
        }
        if (!isset($master) || !$master) {
            $pdo->prepare('DELETE FROM usuario_permissoes WHERE usuario_id=?')->execute([$id]);
            $pdo->prepare('DELETE FROM usuario_instancias WHERE usuario_id=?')->execute([$id]);
            $ip = $pdo->prepare('INSERT INTO usuario_permissoes (usuario_id,chave) VALUES (?,?)'); foreach ($perms as $c) $ip->execute([$id, $c]);
            $ii = $pdo->prepare('INSERT INTO usuario_instancias (usuario_id,instancia) VALUES (?,?)'); foreach ($inst as $c) $ii->execute([$id, $c]);
        }
        $pdo->commit();
        aud_detalhe(($novo ? 'criou' : 'editou') . " usuário $usuario (" . count($perms) . ' permissões, ' . ($todas ? 'todas as conexões' : count($inst) . ' conexões') . ($senha !== '' ? ', senha alterada' : '') . ')');
        out(['ok' => true, 'id' => $id, 'criado' => $novo]);
    },
    'redefinir_senha' => function () {
        $u = usr_alvo(); $nova = (string)(entrada()['nova'] ?? '');
        if (strlen($nova) < 6 || strlen($nova) > 200) out(['ok' => false, 'msg' => 'A nova senha deve ter pelo menos 6 caracteres.', 'campo' => 'nova'], 400);
        $tr = !empty(entrada()['exigir_troca']) ? 1 : 0;
        bd()->prepare('UPDATE usuarios SET senha_hash=?, trocar_senha=? WHERE id=?')->execute([password_hash($nova, PASSWORD_DEFAULT), $tr, $u['id']]);
        if ((int)$u['id'] === uid()) sessoes_revogar((int)$u['id'], true); else sessoes_revogar((int)$u['id']);
        aud_detalhe('redefiniu a senha de ' . $u['usuario']);
        out(['ok' => true]);
    },
    'gerar_senha_provisoria' => function () { $GLOBALS['__usr_gs'](); },
    'gerar_senha' => $GLOBALS['__usr_gs'] = function () {
        $u = usr_alvo(); $al = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $s = '';
        for ($i = 0; $i < 10; $i++) $s .= $al[random_int(0, strlen($al) - 1)];
        bd()->prepare('UPDATE usuarios SET senha_hash=?, trocar_senha=? WHERE id=?')->execute([password_hash($s, PASSWORD_DEFAULT), !empty(entrada()['exigir_troca']) ? 1 : 0, $u['id']]);
        if ((int)$u['id'] === uid()) sessoes_revogar((int)$u['id'], true); else sessoes_revogar((int)$u['id']);
        aud_detalhe('definiu nova senha para @' . $u['usuario']);
        out(['ok' => true, 'senha' => $s, 'usuario' => $u['usuario']]);
    },
    'ativar_usuario' => function () {
        $u = usr_alvo(); $ativo = !empty(entrada()['ativo']);
        if (!$ativo && ((int)$u['master'] === 1 || (int)$u['id'] === uid())) out(['ok' => false, 'msg' => (int)$u['master'] === 1 ? 'O usuário master não pode ser desativado.' : 'Você não pode desativar a si mesmo.'], 400);
        bd()->prepare('UPDATE usuarios SET ativo=? WHERE id=?')->execute([$ativo ? 1 : 0, $u['id']]);
        if (!$ativo) sessoes_revogar((int)$u['id']);
        aud_detalhe(($ativo ? 'ativou ' : 'desativou ') . $u['usuario']);
        out(['ok' => true, 'ativo' => $ativo]);
    },
    'encerrar_sessoes' => function () {
        $u = usr_alvo(); $eu = (int)$u['id'] === uid();
        $q = bd()->prepare('SELECT COUNT(*) FROM sessoes WHERE usuario_id=?'); $q->execute([$u['id']]); $n = (int)$q->fetchColumn();
        sessoes_revogar((int)$u['id'], $eu);
        aud_detalhe('encerrou as sessões de ' . $u['usuario'] . ($eu ? ' (exceto a atual)' : ''));
        out(['ok' => true, 'encerradas' => $eu ? max(0, $n - 1) : $n]);
    },
    'excluir_usuario' => function () {
        $u = usr_alvo();
        if ((int)$u['master'] === 1) out(['ok' => false, 'msg' => 'O usuário master não pode ser excluído.'], 400);
        if ((int)$u['id'] === uid()) out(['ok' => false, 'msg' => 'Você não pode excluir a si mesmo.'], 400);
        bd()->prepare('DELETE FROM usuarios WHERE id=?')->execute([$u['id']]); // permissões, conexões e sessões saem em cascata; auditoria permanece
        aud_detalhe('excluiu o usuário ' . $u['usuario']);
        out(['ok' => true]);
    },
    'listar_sessoes' => function () {
        $u = usr_alvo(); $t = token_cookie(); $atual = $t !== '' ? hash('sha256', $t) : '';
        $q = bd()->prepare('SELECT id,criado,expira,ip,agente FROM sessoes WHERE usuario_id=? AND expira>? ORDER BY criado DESC LIMIT 100'); $q->execute([$u['id'], time()]);
        $o = []; foreach ($q->fetchAll() as $r) $o[] = ['ref' => substr($r['id'], 0, 8), 'criado' => (int)$r['criado'], 'expira' => (int)$r['expira'], 'ip' => $r['ip'], 'agente' => $r['agente'], 'atual' => hash_equals($atual, $r['id'])];
        out(['ok' => true, 'sessoes' => $o]);
    },
    'listar_atividade' => function () {
        $u = usr_alvo(); $id = (int)$u['id']; $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 30;
        [$w, $p] = usr_filtro_atividade($id); $pdo = bd();
        $q = $pdo->prepare("SELECT COUNT(*) FROM auditoria WHERE $w"); $q->execute($p); $total = (int)$q->fetchColumn();
        $q = $pdo->prepare("SELECT ts,acao,ok,detalhe,instancia,ip FROM auditoria WHERE $w ORDER BY ts DESC, id DESC LIMIT $por OFFSET " . (($pag - 1) * $por)); $q->execute($p);
        $itens = []; foreach ($q->fetchAll() as $r) $itens[] = ['ts' => (int)$r['ts'], 'acao' => $r['acao'], 'rotulo' => usr_rotulo_acao($r['acao']), 'ok' => (int)$r['ok'] === 1, 'detalhe' => $r['detalhe'], 'instancia' => $r['instancia'], 'ip' => $r['ip']];
        $r = ['ok' => true, 'total' => $total, 'pag' => $pag, 'paginas' => max(1, (int)ceil($total / $por)), 'itens' => $itens];
        if ($pag === 1) {
            $h0 = strtotime('today'); $q = $pdo->prepare('SELECT SUM(ts>=?) h, SUM(ts>=?) s, COUNT(*) t FROM auditoria WHERE usuario_id=? AND acao<>? AND ts>=?'); $q->execute([$h0, time() - 7 * 86400, $id, 'visita', time() - 7 * 86400]);
            $c = $q->fetch();
            $q = $pdo->prepare("SELECT SUBSTRING(detalhe,8) pg, COUNT(*) n FROM auditoria WHERE usuario_id=? AND acao='visita' AND detalhe LIKE 'abriu: %' GROUP BY pg ORDER BY n DESC LIMIT 5"); $q->execute([$id]);
            $r['resumo'] = ['hoje' => (int)($c['h'] ?? 0), 'sete_dias' => (int)($c['s'] ?? 0), 'ultimo_acesso' => $u['ultimo_login'] !== null ? (int)$u['ultimo_login'] : null, 'ultimo_ip' => $u['ultimo_ip'],
                'paginas' => array_map(fn($x) => ['pagina' => $x['pg'], 'visitas' => (int)$x['n']], $q->fetchAll())];
            $q = $pdo->prepare('SELECT DISTINCT acao FROM auditoria WHERE usuario_id=? ORDER BY acao LIMIT 100'); $q->execute([$id]);
            $r['tipos'] = array_map(fn($a) => ['acao' => $a, 'rotulo' => usr_rotulo_acao($a)], array_column($q->fetchAll(), 'acao'));
        }
        out($r);
    },
    'listar_atividade_csv' => function () { $GLOBALS['__usr_csv'](); },
    'exportar_atividade_csv' => $GLOBALS['__usr_csv'] = function () {
        $u = usr_alvo(); [$w, $p] = usr_filtro_atividade((int)$u['id']);
        $q = bd()->prepare("SELECT ts,acao,ok,detalhe,instancia,ip FROM auditoria WHERE $w ORDER BY ts DESC, id DESC LIMIT 5000"); $q->execute($p);
        auditar('exportar_atividade_csv', true, 'exportou atividade de ' . $u['usuario']);
        header_remove('Content-Type'); header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="zapzap-atividade-' . preg_replace('/[^a-z0-9._-]/', '', $u['usuario']) . '-' . date('Y-m-d') . '.csv"');
        echo "\xEF\xBB\xBF" . implode(';', array_map('usr_csv_cel', ['Data/hora', 'Ação', 'Resultado', 'Detalhe', 'Conexão', 'IP'])) . "\r\n";
        foreach ($q->fetchAll() as $r) echo implode(';', array_map('usr_csv_cel', [date('d/m/Y H:i:s', (int)$r['ts']), usr_rotulo_acao($r['acao']), (int)$r['ok'] ? 'ok' : 'erro', $r['detalhe'], $r['instancia'], $r['ip']])) . "\r\n";
        exit;
    },
    '__perms' => [],
];
