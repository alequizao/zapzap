<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — Respostas rápidas. Visíveis: globais + da conexão ativa + pessoais do usuário.
// Variáveis no texto: {nome} {numero} {saudacao} {atendente}. Anexo opcional guardado FORA do alcance web (ZZ_DIR/anexos/respostas).

if (!function_exists('rr_dir')) {
    function rr_dir(): string { $d = ZZ_DIR . '/anexos/respostas'; if (!is_dir($d)) @mkdir($d, 0750, true); return $d; }
    function rr_atalho_ok(string $a): string {
        $a = mb_strtolower(ltrim(trim($a), '/'), 'UTF-8');
        $a = preg_replace('/[^\p{L}\p{N}_-]/u', '', $a);
        return mb_substr($a, 0, 30);
    }
    /** a resposta é visível ao usuário atual na conexão atual? */
    function rr_visivel(array $r): bool {
        return $r['escopo'] === 'global' || ($r['escopo'] === 'instancia' && $r['instancia'] === inst()) || ($r['escopo'] === 'pessoal' && (int)$r['usuario_id'] === uid());
    }
    function rr_editavel(array $r): bool {
        if (!rr_visivel($r)) return false;
        if ($r['escopo'] === 'pessoal') return true;
        return pode('respostas.editar');
    }
    function rr_buscar(int $id): ?array {
        $q = bd()->prepare('SELECT * FROM respostas WHERE id=?'); $q->execute([$id]); $r = $q->fetch();
        return $r ?: null;
    }
    function rr_saudacao(): string {
        $h = (int)(new DateTime('now', new DateTimeZone('America/Maceio')))->format('G');
        return $h < 12 ? 'Bom dia' : ($h < 18 ? 'Boa tarde' : 'Boa noite');
    }
    function rr_resolver(string $t, string $nome, string $numero): string {
        $nome = trim($nome); $num = preg_replace('/\D/', '', $numero);
        if ($num !== '' && preg_match('/^55(\d\d)(9?\d{4})(\d{4})$/', $num, $m)) $num = "+55 ({$m[1]}) {$m[2]}-{$m[3]}"; elseif ($num !== '') $num = '+' . $num;
        $atend = assinatura_nome();
        return strtr($t, ['{nome}' => $nome !== '' ? $nome : 'cliente', '{numero}' => $num, '{saudacao}' => rr_saudacao(), '{atendente}' => $atend !== '' ? $atend : 'Atendimento']);
    }
    function rr_apagar_arquivo(string $a): void { if ($a !== '' && preg_match('/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/', $a)) @unlink(rr_dir() . '/' . $a); }
    function rr_publica(array $r): array {
        return [
            'id' => (int)$r['id'], 'atalho' => $r['atalho'], 'titulo' => $r['titulo'], 'texto' => $r['texto'], 'tipo' => $r['tipo'],
            'nome_arquivo' => $r['nome_arquivo'], 'mime' => $r['mime'], 'escopo' => $r['escopo'], 'usos' => (int)$r['usos'],
            'criado' => (int)$r['criado'], 'atualizado' => (int)$r['atualizado'], 'editavel' => rr_editavel($r),
            'dono' => $r['escopo'] === 'pessoal' && (int)$r['usuario_id'] === uid(),
        ];
    }
}

return [
    '__perms' => [
        'listar_respostas' => 'respostas.ver', 'usar_resposta' => 'respostas.ver', 'ver_resposta_arquivo' => 'respostas.ver',
        'salvar_resposta' => ['respostas.ver', 'respostas.editar'], 'excluir_resposta' => ['respostas.ver', 'respostas.editar'],
    ],

    'listar_respostas' => function () {
        $q = trim((string)($_GET['q'] ?? ''));
        $sql = "SELECT * FROM respostas WHERE (escopo='global' OR (escopo='instancia' AND instancia=?) OR (escopo='pessoal' AND usuario_id=?))";
        $p = [inst(), uid()];
        if ($q !== '') {
            $qq = ltrim($q, '/'); $like = '%' . addcslashes($qq, '%_\\') . '%';
            $sql .= ' AND (atalho LIKE ? OR titulo LIKE ? OR texto LIKE ?)'; array_push($p, $like, $like, $like);
        }
        $sql .= ' ORDER BY usos DESC, atalho ASC LIMIT 500';
        $st = bd()->prepare($sql); $st->execute($p);
        $itens = array_map('rr_publica', $st->fetchAll());
        out(['ok' => true, 'itens' => $itens, 'pode_editar' => pode('respostas.editar'), 'instancia' => inst()]);
    },

    'salvar_resposta' => function () {
        $d = entrada();
        $id = (int)($d['id'] ?? 0);
        $atual = $id ? rr_buscar($id) : null;
        if ($id && (!$atual || !rr_editavel($atual))) out(['ok' => false, 'msg' => $atual ? 'Você não pode editar esta resposta.' : 'Resposta não encontrada.'], $atual ? 403 : 404);

        $escopo = (string)($d['escopo'] ?? ($atual['escopo'] ?? 'pessoal'));
        if (!in_array($escopo, ['global', 'instancia', 'pessoal'], true)) out(['ok' => false, 'msg' => 'Escopo inválido.'], 422);
        if ($atual && $atual['escopo'] !== $escopo && !($atual['escopo'] === 'pessoal' ? true : pode('respostas.editar'))) out(['ok' => false, 'msg' => 'Sem permissão.'], 403);
        if ($escopo === 'pessoal' && !pode('respostas.ver')) out(['ok' => false, 'msg' => 'Sem permissão.', 'sem_permissao' => true], 403);
        if ($escopo !== 'pessoal' && !pode('respostas.editar')) out(['ok' => false, 'msg' => 'Você só pode criar respostas pessoais.', 'sem_permissao' => true], 403);

        $atalho = rr_atalho_ok((string)($d['atalho'] ?? ''));
        if ($atalho === '') out(['ok' => false, 'msg' => 'Informe o atalho (letras, números, - ou _).', 'campo' => 'atalho'], 422);
        $titulo = trim(mb_substr((string)($d['titulo'] ?? ''), 0, 80));
        $texto = trim((string)($d['texto'] ?? ''));
        if (mb_strlen($texto) > 4000) out(['ok' => false, 'msg' => 'Texto muito longo (máximo 4000 caracteres).', 'campo' => 'texto'], 422);

        // anexo
        $arq = $atual['arquivo'] ?? ''; $nomeArq = $atual['nome_arquivo'] ?? ''; $mime = $atual['mime'] ?? ''; $antigo = '';
        if (!empty($d['remover_arquivo']) && $arq !== '') { $antigo = $arq; $arq = $nomeArq = $mime = ''; }
        $f = $_FILES['arquivo'] ?? null;
        if ($f && !is_array($f['name'] ?? null) && ($f['error'] ?? 4) !== UPLOAD_ERR_NO_FILE) {
            if ($f['error'] !== UPLOAD_ERR_OK) out(['ok' => false, 'msg' => in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'Arquivo grande demais (máximo 5 MB).' : 'Falha no envio do arquivo.'], 422);
            if (!is_uploaded_file($f['tmp_name'])) out(['ok' => false, 'msg' => 'Upload inválido.'], 422);
            if ((int)$f['size'] <= 0) out(['ok' => false, 'msg' => 'O arquivo está vazio.'], 422);
            if ((int)$f['size'] > 5 * 1024 * 1024) out(['ok' => false, 'msg' => 'Arquivo grande demais (máximo 5 MB).'], 422);
            $perm = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf', 'doc' => 'application/msword',
                'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'xls' => 'application/vnd.ms-excel',
                'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'txt' => 'text/plain'];
            $nome = preg_replace('/[^\p{L}\p{N}._ ()-]/u', '_', basename(str_replace('\\', '/', (string)$f['name'])));
            $nome = mb_substr($nome, -100);
            $ext = strtolower(pathinfo($nome, PATHINFO_EXTENSION));
            if (!isset($perm[$ext])) out(['ok' => false, 'msg' => 'Tipo não permitido. Aceitos: png, jpg, webp, gif, pdf, doc(x), xls(x), txt.'], 422);
            $real = (string)(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
            if (str_starts_with($perm[$ext], 'image/') && !str_starts_with($real, 'image/')) out(['ok' => false, 'msg' => 'O conteúdo não corresponde à extensão .' . $ext . '.'], 422);
            if ($ext === 'pdf' && $real !== 'application/pdf') out(['ok' => false, 'msg' => 'O conteúdo não corresponde à extensão .pdf.'], 422);
            $novo = bin2hex(random_bytes(16)) . '.' . $ext;
            if (!move_uploaded_file($f['tmp_name'], rr_dir() . '/' . $novo)) out(['ok' => false, 'msg' => 'Não foi possível salvar o arquivo.'], 500);
            @chmod(rr_dir() . '/' . $novo, 0640);
            if ($arq !== '') $antigo = $arq;
            $arq = $novo; $nomeArq = $nome; $mime = $perm[$ext];
        }
        $tipo = $arq !== '' ? 'midia' : 'texto';
        if ($texto === '' && $arq === '') out(['ok' => false, 'msg' => 'Escreva o texto da resposta ou anexe um arquivo.', 'campo' => 'texto'], 422);
        if ($titulo === '') $titulo = mb_substr($texto !== '' ? preg_replace('/\s+/', ' ', $texto) : $nomeArq, 0, 40);

        $uidDono = $escopo === 'pessoal' ? ($atual && $atual['escopo'] === 'pessoal' ? (int)$atual['usuario_id'] : uid()) : null;
        $instRow = $escopo === 'instancia' ? ($atual && $atual['escopo'] === 'instancia' ? $atual['instancia'] : inst()) : null;
        $chave = $escopo === 'global' ? 'g' : ($escopo === 'instancia' ? 'i:' . $instRow : 'p:' . $uidDono);
        $dup = bd()->prepare('SELECT id FROM respostas WHERE chave_escopo=? AND atalho=? AND id<>?'); $dup->execute([$chave, $atalho, $id]);
        if ($dup->fetchColumn()) { if ($f && $arq !== ($atual['arquivo'] ?? '')) rr_apagar_arquivo($arq); out(['ok' => false, 'msg' => 'Já existe uma resposta com o atalho /' . $atalho . ' neste escopo.', 'campo' => 'atalho'], 409); }

        $agora = time();
        if ($id) {
            bd()->prepare('UPDATE respostas SET instancia=?,atalho=?,titulo=?,texto=?,tipo=?,arquivo=?,nome_arquivo=?,mime=?,escopo=?,usuario_id=?,chave_escopo=?,atualizado=? WHERE id=?')
                ->execute([$instRow, $atalho, $titulo, $texto, $tipo, $arq, $nomeArq, $mime, $escopo, $uidDono, $chave, $agora, $id]);
        } else {
            bd()->prepare('INSERT INTO respostas (instancia,atalho,titulo,texto,tipo,arquivo,nome_arquivo,mime,escopo,usuario_id,chave_escopo,usos,criado,atualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)')
                ->execute([$instRow, $atalho, $titulo, $texto, $tipo, $arq, $nomeArq, $mime, $escopo, $uidDono, $chave, $agora, $agora]);
            $id = (int)bd()->lastInsertId();
        }
        if ($antigo !== '' && $antigo !== $arq) rr_apagar_arquivo($antigo);
        aud_detalhe(($atual ? 'editou' : 'criou') . ' a resposta rápida /' . $atalho . ' (' . $escopo . ')');
        out(['ok' => true, 'id' => $id, 'resposta' => rr_publica(rr_buscar($id))]);
    },

    'excluir_resposta' => function () {
        $id = (int)(entrada()['id'] ?? 0);
        $r = $id ? rr_buscar($id) : null;
        if (!$r) out(['ok' => false, 'msg' => 'Resposta não encontrada.'], 404);
        if (!rr_editavel($r)) out(['ok' => false, 'msg' => 'Você não pode excluir esta resposta.'], 403);
        bd()->prepare('DELETE FROM respostas WHERE id=?')->execute([$id]);
        rr_apagar_arquivo($r['arquivo']);
        aud_detalhe('excluiu a resposta rápida /' . $r['atalho']);
        out(['ok' => true]);
    },

    // Devolve o texto com variáveis resolvidas e incrementa o contador de usos.
    'usar_resposta' => function () {
        $d = entrada();
        $r = rr_buscar((int)($d['id'] ?? 0));
        if (!$r || !rr_visivel($r)) out(['ok' => false, 'msg' => 'Resposta não encontrada.'], 404);
        $num = (string)($d['contato_numero'] ?? '');
        if ($num === '' && !empty($d['contato_jid'])) $num = explode('@', (string)$d['contato_jid'])[0];
        if (str_contains((string)($d['contato_jid'] ?? ''), '@lid') || str_contains((string)($d['contato_jid'] ?? ''), '@g.us')) $num = '';
        $texto = rr_resolver($r['texto'], mb_substr((string)($d['contato_nome'] ?? ''), 0, 80), $num);
        bd()->prepare('UPDATE respostas SET usos=usos+1 WHERE id=?')->execute([$r['id']]);
        $midia = $r['arquivo'] !== '' ? ['id' => (int)$r['id'], 'nome' => $r['nome_arquivo'], 'mime' => $r['mime']] : null;
        out(['ok' => true, 'texto' => $texto, 'tipo' => $r['tipo'], 'midia' => $midia, 'atalho' => $r['atalho']]);
    },

    // Entrega o anexo (binário) para prévia/envio.
    'ver_resposta_arquivo' => function () {
        $r = rr_buscar((int)($_GET['id'] ?? 0));
        if (!$r || !rr_visivel($r) || $r['arquivo'] === '' || !preg_match('/^[a-f0-9]{32}\.[a-z0-9]{2,5}$/', $r['arquivo'])) out(['ok' => false, 'msg' => 'Arquivo não encontrado.'], 404);
        $c = rr_dir() . '/' . $r['arquivo'];
        if (!is_file($c)) out(['ok' => false, 'msg' => 'Arquivo não encontrado.'], 404);
        header_remove('Content-Type');
        header('Content-Type: ' . $r['mime']);
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline; filename="' . rawurlencode($r['nome_arquivo']) . '"');
        header('Content-Length: ' . filesize($c)); header('Cache-Control: private, max-age=300');
        readfile($c); exit;
    },
];
