<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo CAMPANHAS E LISTAS (fila de envio com limites anti-bloqueio).
// Tabelas em migracoes/campanhas.sql. Cron: cron.d/campanhas.php. Descadastro (SAIR/PARAR): hooks/campanhas.php.

const CAMP_LIMITE_DIA_MAX = 1000;
const CAMP_LISTA_MAX = 20000;
const CAMP_IMPORTA_MAX = 5000;
const CAMP_ARQ_MAX = 16 * 1024 * 1024;

if (!function_exists('camp_chave')) {
    function camp_agora(): DateTimeImmutable { return new DateTimeImmutable('now', new DateTimeZone('America/Maceio')); }
    function camp_inicio_dia(): int { return camp_agora()->setTime(0, 0, 0)->getTimestamp(); }
    function camp_hora(): int { return (int)camp_agora()->format('G'); }
    function camp_exigir_post(): void { if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'msg' => 'Método inválido'], 405); }
    function camp_erro(string $m, int $c = 422): never { out(['ok' => false, 'msg' => $m], $c); }

    /** Normaliza um telefone digitado. Devolve [numero|null, motivo|null]. BR: 55+DDD+número (celular ganha o 9º dígito). */
    function camp_normalizar(string $bruto): array {
        $d = preg_replace('/\D/', '', $bruto);
        if ($d === '') return [null, 'sem número'];
        $d = ltrim($d, '0');
        if (strlen($d) === 10 || strlen($d) === 11) $d = '55' . $d;
        if (!str_starts_with($d, '55')) return [null, 'só números do Brasil (55 + DDD) são aceitos'];
        if (!in_array(strlen($d), [12, 13], true)) return [null, 'quantidade de dígitos inválida'];
        $ddd = (int)substr($d, 2, 2);
        if ($ddd < 11 || $ddd > 99 || $ddd % 10 === 0) return [null, 'DDD inválido'];
        $resto = substr($d, 4);
        if (strlen($resto) === 8) {
            if ($resto[0] >= '6') { $d = substr($d, 0, 4) . '9' . $resto; }
            else return [null, 'telefone fixo (sem WhatsApp)'];
        } elseif ($resto[0] !== '9') return [null, 'celular deve começar com 9'];
        return [$d, null];
    }
    /** Chave de comparação (ignora o 9º dígito): 55+DDD+últimos 8. */
    function camp_chave(string $numero): string {
        $d = preg_replace('/\D/', '', $numero);
        if (str_starts_with($d, '55') && in_array(strlen($d), [12, 13], true)) return substr($d, 0, 4) . substr($d, -8);
        return $d;
    }
    /** Os JIDs possíveis (com e sem o 9) para uma chave. */
    function camp_jids_da_chave(string $chave): array {
        $r = [$chave . '@s.whatsapp.net'];
        if (str_starts_with($chave, '55') && strlen($chave) === 12) $r[] = substr($chave, 0, 4) . '9' . substr($chave, 4) . '@s.whatsapp.net';
        return $r;
    }
    function camp_numero_do_jid(string $jid): string { return preg_replace('/\D/', '', explode('@', $jid)[0]); }
    function camp_jid_valido(string $jid): bool { return (bool)preg_match('/^\d{10,15}@s\.whatsapp\.net$/', $jid); }
    function camp_norm_texto(string $s): string {
        $s = mb_strtolower(trim($s), 'UTF-8');
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        $s = ($t !== false && $t !== '') ? $t : $s;
        return trim(preg_replace('/\s+/', ' ', preg_replace('/[^a-z0-9 ]+/', '', $s)));
    }
    function camp_chave_var(string $k): string {
        $k = camp_norm_texto($k); $k = preg_replace('/\s+/', '_', $k);
        return substr($k, 0, 30);
    }
    /** Troca {nome}, {primeiro_nome} e variáveis personalizadas. Variável sem valor vira vazio. */
    function camp_render(string $tpl, string $nome, array $vars): string {
        $v = array_change_key_case($vars, CASE_LOWER);
        $v['nome'] = $nome; $v['primeiro_nome'] = trim(explode(' ', trim($nome))[0] ?? '');
        return preg_replace_callback('/\{([a-zA-Z0-9_]{1,30})\}/', fn($m) => (string)($v[strtolower($m[1])] ?? ''), $tpl);
    }
    function camp_vars_do_texto(string $t): array { preg_match_all('/\{([a-zA-Z0-9_]{1,30})\}/', $t, $m); return array_values(array_unique(array_map('strtolower', $m[1]))); }

    function camp_lista_obter(int $id): array {
        $q = bd()->prepare('SELECT * FROM listas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        return $q->fetch() ?: camp_erro('Lista não encontrada.', 404);
    }
    function camp_obter(int $id): array {
        $q = bd()->prepare('SELECT * FROM campanhas WHERE id=? AND instancia=?'); $q->execute([$id, inst()]);
        return $q->fetch() ?: camp_erro('Campanha não encontrada.', 404);
    }
    function camp_outra_enviando(string $instancia, int $exceto = 0): ?array {
        $q = bd()->prepare("SELECT id,nome FROM campanhas WHERE instancia=? AND status='enviando' AND id<>? LIMIT 1"); $q->execute([$instancia, $exceto]);
        return $q->fetch() ?: null;
    }
    function camp_enviados_hoje(string $instancia): int {
        $q = bd()->prepare("SELECT COUNT(*) FROM campanha_envios e JOIN campanhas c ON c.id=e.campanha_id WHERE c.instancia=? AND e.status IN ('enviado','falha') AND e.enviado_em>=?");
        $q->execute([$instancia, camp_inicio_dia()]);
        return (int)$q->fetchColumn();
    }
    function camp_optout_chaves(string $instancia): array {
        $q = bd()->prepare('SELECT chave FROM campanha_optouts WHERE instancia=?'); $q->execute([$instancia]);
        return array_flip($q->fetchAll(PDO::FETCH_COLUMN));
    }
    function camp_apagar_arquivo(?string $arq): void {
        if ($arq && basename($arq) === $arq && is_file(ZZ_DIR . '/anexos/' . $arq)) @unlink(ZZ_DIR . '/anexos/' . $arq);
    }
    function camp_webhook_ligado(): bool {
        $f = cache_arq('camp_webhook.json');
        if (is_file($f) && filemtime($f) > time() - 60) return trim((string)file_get_contents($f)) === '1';
        $r = webhook_ligado(); @file_put_contents($f, $r ? '1' : '0');
        return $r;
    }

    /** Estimativa de duração. */
    function camp_estimativa(array $c, int $pend): array {
        $med = max(1, ($c['intervalo_min_s'] + $c['intervalo_max_s']) / 2);
        $porMin = min(3.0, 60 / $med);
        $horas = max(1, (int)$c['janela_fim'] - (int)$c['janela_inicio']);
        $capDia = max(1, (int)min((int)$c['limite_dia'], floor($porMin * 60 * $horas)));
        $dias = (int)ceil($pend / $capDia);
        $seg = (int)round($pend / max(0.01, $porMin) * 60);
        $h = intdiv($seg, 3600); $m = intdiv($seg % 3600, 60);
        $txt = ($seg < 60 ? "menos de 1 min" : ($h > 0 ? "{$h} h " : "") . "{$m} min") . " de envio" . ($dias > 1 ? " ({$dias} dias por causa do limite diário e da janela de horário)" : "");
        return ['segundos_envio' => $seg, 'dias' => $dias, 'por_dia' => $capDia, 'texto' => $pend > 0 ? $txt : 'nada a enviar'];
    }

    /** Avisos de risco de bloqueio. nivel: alto | medio | info. */
    function camp_avisos(array $c, int $total, int $optout = 0, ?bool $webhook = null): array {
        $a = []; $add = function (string $n, string $cod, string $m) use (&$a) { $a[] = ['nivel' => $n, 'codigo' => $cod, 'msg' => $m]; };
        $min = (int)$c['intervalo_min_s']; $max = (int)$c['intervalo_max_s']; $lim = (int)$c['limite_dia'];
        $txt = $c['tipo'] === 'texto' ? (string)$c['texto'] : (string)$c['legenda'];
        if ($min < 8) $add('alto', 'intervalo_curto', 'Intervalo mínimo menor que 8 segundos: risco ALTO de bloqueio do número.');
        elseif ($min < 12) $add('medio', 'intervalo_curto', 'Intervalo mínimo abaixo de 12 segundos aumenta o risco de bloqueio.');
        if ($max - $min < 5) $add('medio', 'intervalo_fixo', 'Intervalos quase iguais parecem robô. Use uma diferença maior entre mínimo e máximo.');
        if ($lim > 500) $add('alto', 'limite_alto', "Limite de {$lim} mensagens por dia é muito alto. Número novo ou pouco usado costuma ser bloqueado acima de 200.");
        elseif ($lim > 300) $add('medio', 'limite_alto', "Limite de {$lim} por dia é alto. O recomendado é até 200.");
        if ($total > 500) $add('medio', 'lista_grande', "Lista grande ({$total} contatos). Quanto mais gente que não te conhece, maior a chance de denúncias.");
        if ((int)$c['janela_fim'] - (int)$c['janela_inicio'] > 12) $add('medio', 'janela_longa', 'Janela de horário muito longa. Prefira enviar só em horário comercial.');
        if ((int)$c['janela_fim'] > 21 || (int)$c['janela_inicio'] < 7) $add('medio', 'janela_noite', 'Enviar de madrugada ou à noite gera mais denúncias.');
        if ($txt !== '' && !camp_vars_do_texto($txt)) $add('medio', 'sem_variavel', 'Todas as mensagens serão idênticas. Use {nome} para personalizar e reduzir o risco.');
        if (preg_match('~https?://|www\.~i', $txt)) $add('medio', 'link', 'Mensagens com link têm mais chance de serem marcadas como spam.');
        if ($txt !== '' && !preg_match('/\bsair\b/i', $txt)) $add('medio', 'sem_sair', 'Inclua no texto algo como "Responda SAIR para não receber mais". Quem pedir para sair nunca mais recebe.');
        if ($webhook === false) $add('alto', 'webhook_off', 'O recebimento em tempo real está desligado: pedidos de SAIR não serão registrados. Ligue antes de iniciar.');
        if ($optout > 0) $add('info', 'optout', "{$optout} contato(s) pediram para sair e não receberão.");
        if ($total > $lim && $lim > 0) $add('info', 'varios_dias', 'A campanha levará ' . (int)ceil($total / $lim) . ' dias por causa do limite diário.');
        if (trim((string)$c['assinatura']) === '') $add('alto', 'sem_assinatura', 'Campanha sem assinatura do autor.');
        return $a;
    }

    function camp_contagens(int $id): array {
        $q = bd()->prepare('SELECT status, COUNT(*) n FROM campanha_envios WHERE campanha_id=? GROUP BY status'); $q->execute([$id]);
        $r = ['pendente' => 0, 'enviado' => 0, 'falha' => 0, 'ignorado' => 0];
        foreach ($q->fetchAll() as $x) $r[$x['status']] = (int)$x['n'];
        return $r;
    }
    function camp_fmt(array $c, ?string $listaNome = null): array {
        return [
            'id' => (int)$c['id'], 'nome' => $c['nome'], 'status' => $c['status'], 'lista_id' => $c['lista_id'] === null ? null : (int)$c['lista_id'], 'lista_nome' => $listaNome,
            'tipo' => $c['tipo'], 'texto' => (string)$c['texto'], 'legenda' => (string)$c['legenda'], 'nome_arquivo' => (string)$c['nome_arquivo'], 'mime' => (string)$c['mime'], 'tem_arquivo' => $c['arquivo'] !== null && $c['arquivo'] !== '',
            'agendada_para' => $c['agendada_para'] === null ? null : (int)$c['agendada_para'],
            'intervalo_min_s' => (int)$c['intervalo_min_s'], 'intervalo_max_s' => (int)$c['intervalo_max_s'], 'limite_dia' => (int)$c['limite_dia'],
            'janela_inicio' => (int)$c['janela_inicio'], 'janela_fim' => (int)$c['janela_fim'], 'assinatura' => $c['assinatura'],
            'criado' => (int)$c['criado'], 'criado_por' => $c['criado_por'] === null ? null : (int)$c['criado_por'],
            'iniciada_em' => $c['iniciada_em'] === null ? null : (int)$c['iniciada_em'], 'concluida_em' => $c['concluida_em'] === null ? null : (int)$c['concluida_em'],
            'total' => (int)$c['total'], 'enviados' => (int)$c['enviados'], 'falhas' => (int)$c['falhas'],
            'proximo_envio' => $c['proximo_envio'] === null ? null : (int)$c['proximo_envio'], 'pausa_motivo' => $c['pausa_motivo'],
        ];
    }

    /** Lê/valida o arquivo enviado (multipart). Devolve [arquivo, mime, nome] ou null se não veio arquivo. */
    function camp_receber_arquivo(): ?array {
        $f = $_FILES['arquivo'] ?? null;
        if (!$f || !is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
        if (is_array($f['name'] ?? null)) camp_erro('Arquivo inválido.');
        if ($f['error'] !== UPLOAD_ERR_OK) camp_erro(in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'Arquivo grande demais (máximo 16 MB).' : 'Falha no envio do arquivo. Tente de novo.');
        if (!is_uploaded_file($f['tmp_name'])) camp_erro('Upload inválido.');
        $tam = (int)$f['size'];
        if ($tam <= 0) camp_erro('O arquivo está vazio.');
        if ($tam > CAMP_ARQ_MAX) camp_erro('Arquivo grande demais (máximo 16 MB).');
        $perm = [
            'png' => ['image/png', 'imagem'], 'jpg' => ['image/jpeg', 'imagem'], 'jpeg' => ['image/jpeg', 'imagem'], 'webp' => ['image/webp', 'imagem'], 'gif' => ['image/gif', 'imagem'],
            'mp4' => ['video/mp4', 'video'], 'mp3' => ['audio/mpeg', 'audio'], 'ogg' => ['audio/ogg', 'audio'], 'm4a' => ['audio/mp4', 'audio'],
            'pdf' => ['application/pdf', 'documento'], 'doc' => ['application/msword', 'documento'],
            'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'documento'],
            'xls' => ['application/vnd.ms-excel', 'documento'], 'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'documento'],
            'txt' => ['text/plain', 'documento'], 'zip' => ['application/zip', 'documento'],
        ];
        $nome = preg_replace('/[^\p{L}\p{N}._ ()-]/u', '_', basename(str_replace('\\', '/', (string)$f['name'])));
        $nome = mb_substr($nome, -100);
        $ext = strtolower(pathinfo($nome, PATHINFO_EXTENSION));
        if (!isset($perm[$ext])) camp_erro('Tipo de arquivo não permitido. Aceitos: png, jpg, webp, gif, mp4, mp3, ogg, m4a, pdf, doc(x), xls(x), txt, zip.');
        [$mime, $tipo] = $perm[$ext];
        $real = (string)(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']); $g = explode('/', $real)[0];
        $ok = match ($tipo) {
            'imagem' => $g === 'image',
            'video' => $g === 'video' || $real === 'application/octet-stream',
            'audio' => $g === 'audio' || in_array($real, ['video/ogg', 'application/ogg', 'video/mp4', 'application/octet-stream'], true),
            default => $ext !== 'pdf' || $real === 'application/pdf',
        };
        if (!$ok) camp_erro('O conteúdo do arquivo não corresponde à extensão .' . $ext . '.');
        if (!is_dir(ZZ_DIR . '/anexos')) @mkdir(ZZ_DIR . '/anexos', 0750, true);
        $arq = 'camp_' . bin2hex(random_bytes(14)) . '.' . $ext;
        if (!move_uploaded_file($f['tmp_name'], ZZ_DIR . '/anexos/' . $arq)) camp_erro('Não foi possível salvar o arquivo.', 500);
        @chmod(ZZ_DIR . '/anexos/' . $arq, 0640);
        return [$arq, $mime, $nome];
    }

    /** Lê "nome;numero" / CSV com ou sem cabeçalho. Devolve linhas [['linha'=>n,'nome'=>..,'numero_bruto'=>..,'vars'=>[..]]]. */
    function camp_parse_texto(string $texto): array {
        $linhas = preg_split('/\r\n|\r|\n/', $texto); $r = []; $hdr = null; $n = 0;
        foreach ($linhas as $i => $l) {
            if (trim($l) === '') continue;
            $n++;
            $sep = str_contains($l, ';') ? ';' : (str_contains($l, "\t") ? "\t" : ',');
            $cols = array_map(fn($c) => trim((string)$c), str_getcsv($l, $sep, '"', ''));
            if ($n === 1) {
                $low = array_map('camp_norm_texto', $cols);
                $temNum = array_intersect($low, ['numero', 'telefone', 'celular', 'whatsapp', 'fone', 'tel']);
                if ($temNum && !preg_match('/\d{8,}/', preg_replace('/\D/', '', $l))) { $hdr = $low; continue; }
            }
            $nome = ''; $numIdx = null; $vars = [];
            if ($hdr !== null) {
                foreach ($hdr as $k => $h) {
                    $v = $cols[$k] ?? '';
                    if ($numIdx === null && in_array($h, ['numero', 'telefone', 'celular', 'whatsapp', 'fone', 'tel'], true)) { $numIdx = $k; continue; }
                    if ($h === 'nome' && $nome === '') { $nome = $v; continue; }
                    if ($h !== '' && $v !== '') $vars[camp_chave_var($h)] = mb_substr($v, 0, 200);
                }
            } else {
                foreach ($cols as $k => $v) if ($numIdx === null && preg_match('/^[\d\s().+\-]{8,}$/', $v)) { $numIdx = $k; }
                $outros = []; foreach ($cols as $k => $v) if ($k !== $numIdx && $v !== '') $outros[] = $v;
                $nome = $outros[0] ?? ''; foreach (array_slice($outros, 1) as $j => $v) $vars['var' . ($j + 1)] = mb_substr($v, 0, 200);
            }
            $r[] = ['linha' => $i + 1, 'nome' => mb_substr($nome, 0, 120), 'numero_bruto' => $numIdx === null ? '' : $cols[$numIdx], 'vars' => $vars, 'original' => mb_substr($l, 0, 60)];
            if (count($r) > CAMP_IMPORTA_MAX) camp_erro('Muitos contatos de uma vez (máximo ' . CAMP_IMPORTA_MAX . ' por importação).');
        }
        return $r;
    }
    function camp_lista_total(int $id): int { $q = bd()->prepare('SELECT COUNT(*) FROM lista_contatos WHERE lista_id=?'); $q->execute([$id]); return (int)$q->fetchColumn(); }
    function camp_validar_numeros(array $c): array { // parâmetros numéricos comuns
        $min = (int)$c['intervalo_min_s']; $max = (int)$c['intervalo_max_s']; $lim = (int)$c['limite_dia']; $ji = (int)$c['janela_inicio']; $jf = (int)$c['janela_fim'];
        if ($min < 5) camp_erro('O intervalo mínimo deve ser de pelo menos 5 segundos.');
        if ($max < $min) camp_erro('O intervalo máximo não pode ser menor que o mínimo.');
        if ($max > 900) camp_erro('O intervalo máximo é de 900 segundos.');
        if ($lim < 1 || $lim > CAMP_LIMITE_DIA_MAX) camp_erro('O limite por dia deve ficar entre 1 e ' . CAMP_LIMITE_DIA_MAX . '.');
        if ($ji < 0 || $ji > 23 || $jf < 1 || $jf > 24 || $ji >= $jf) camp_erro('Janela de horário inválida (início entre 0 e 23; fim entre 1 e 24, depois do início).');
        return [$min, $max, $lim, $ji, $jf];
    }
}

return [
    // ============ LISTAS ============
    'listar_listas' => function () {
        $q = bd()->prepare('SELECT l.id,l.nome,l.criado,l.criado_por,
            (SELECT COUNT(*) FROM lista_contatos c WHERE c.lista_id=l.id) total,
            (SELECT COUNT(*) FROM lista_contatos c WHERE c.lista_id=l.id AND c.optout=1) optout,
            (SELECT COUNT(*) FROM campanhas k WHERE k.lista_id=l.id) campanhas
            FROM listas l WHERE l.instancia=? ORDER BY l.id DESC LIMIT 500');
        $q->execute([inst()]);
        $l = array_map(fn($r) => ['id' => (int)$r['id'], 'nome' => $r['nome'], 'criado' => (int)$r['criado'], 'total' => (int)$r['total'], 'optout' => (int)$r['optout'], 'validos' => (int)$r['total'] - (int)$r['optout'], 'campanhas' => (int)$r['campanhas']], $q->fetchAll());
        out(['ok' => true, 'listas' => $l]);
    },
    'salvar_lista' => function () {
        camp_exigir_post(); $e = entrada();
        $nome = trim((string)($e['nome'] ?? ''));
        if ($nome === '' || mb_strlen($nome) > 80) camp_erro('Dê um nome à lista (até 80 caracteres).');
        $id = (int)($e['id'] ?? 0);
        if ($id > 0) {
            camp_lista_obter($id);
            bd()->prepare('UPDATE listas SET nome=? WHERE id=? AND instancia=?')->execute([$nome, $id, inst()]);
            aud_detalhe('renomeou a lista #' . $id);
        } else {
            $q = bd()->prepare('SELECT COUNT(*) FROM listas WHERE instancia=?'); $q->execute([inst()]);
            if ((int)$q->fetchColumn() >= 200) camp_erro('Limite de 200 listas por conexão.');
            bd()->prepare('INSERT INTO listas (instancia,nome,criado,criado_por) VALUES (?,?,?,?)')->execute([inst(), $nome, time(), uid()]);
            $id = (int)bd()->lastInsertId();
            aud_detalhe('criou a lista #' . $id);
        }
        out(['ok' => true, 'id' => $id]);
    },
    'excluir_lista' => function () {
        camp_exigir_post(); $id = (int)(entrada()['id'] ?? 0); camp_lista_obter($id);
        $q = bd()->prepare("SELECT nome FROM campanhas WHERE lista_id=? AND status IN ('agendada','enviando','pausada') LIMIT 1"); $q->execute([$id]);
        if ($n = $q->fetchColumn()) camp_erro('A lista está em uso pela campanha "' . $n . '". Cancele ou conclua a campanha antes.', 409);
        $pdo = bd(); $pdo->beginTransaction();
        $pdo->prepare('UPDATE campanhas SET lista_id=NULL WHERE lista_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM lista_contatos WHERE lista_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM listas WHERE id=? AND instancia=?')->execute([$id, inst()]);
        $pdo->commit();
        aud_detalhe('excluiu a lista #' . $id);
        out(['ok' => true]);
    },
    'ver_lista' => function () {
        $id = (int)($_GET['id'] ?? 0); $l = camp_lista_obter($id);
        $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 50; $busca = trim((string)($_GET['q'] ?? ''));
        $w = 'lista_id=?'; $p = [$id];
        if ($busca !== '') { $w .= ' AND (nome LIKE ? OR jid LIKE ?)'; $b = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $busca) . '%'; $p[] = $b; $p[] = $b; }
        $q = bd()->prepare("SELECT COUNT(*) FROM lista_contatos WHERE $w"); $q->execute($p); $tot = (int)$q->fetchColumn();
        $q = bd()->prepare("SELECT jid,nome,variaveis,optout FROM lista_contatos WHERE $w ORDER BY nome, jid LIMIT $por OFFSET " . (($pag - 1) * $por)); $q->execute($p);
        $cs = array_map(fn($r) => ['jid' => $r['jid'], 'numero' => camp_numero_do_jid($r['jid']), 'nome' => $r['nome'], 'variaveis' => json_decode((string)$r['variaveis'], true) ?: new stdClass, 'optout' => (int)$r['optout'] === 1], $q->fetchAll());
        $q = bd()->prepare('SELECT COUNT(*) total, COALESCE(SUM(optout),0) optout FROM lista_contatos WHERE lista_id=?'); $q->execute([$id]); $t = $q->fetch();
        out(['ok' => true, 'lista' => ['id' => (int)$l['id'], 'nome' => $l['nome'], 'criado' => (int)$l['criado']], 'totais' => ['total' => (int)$t['total'], 'optout' => (int)$t['optout'], 'validos' => (int)$t['total'] - (int)$t['optout']],
             'total' => $tot, 'pag' => $pag, 'paginas' => max(1, (int)ceil($tot / $por)), 'contatos' => $cs]);
    },
    // Contatos do cache para o seletor (somente pessoas, não grupos).
    'listar_contatos_disponiveis' => function () {
        $f = cache_arq('contatos.json'); $m = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
        $q = camp_norm_texto((string)($_GET['q'] ?? '')); $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 50; $r = [];
        foreach ($m as $jid => $x) {
            if (!is_array($x) || !empty($x['grupo']) || !camp_jid_valido((string)$jid)) continue;
            $nome = (string)($x['nome'] ?? ''); $num = camp_numero_do_jid((string)$jid);
            if ($q !== '' && !str_contains(camp_norm_texto($nome), $q) && !str_contains($num, preg_replace('/\D/', '', $q) ?: "\0")) continue;
            $r[] = ['jid' => (string)$jid, 'nome' => $nome, 'numero' => $num];
        }
        $tot = count($r);
        out(['ok' => true, 'total' => $tot, 'pag' => $pag, 'paginas' => max(1, (int)ceil($tot / $por)), 'contatos' => array_slice($r, ($pag - 1) * $por, $por)]);
    },
    // {lista_id, texto?:"nome;numero\n…", jids?:[…do cache…]}
    'importar_contatos_lista' => function () {
        camp_exigir_post(); $e = entrada(); $id = (int)($e['lista_id'] ?? 0); camp_lista_obter($id);
        $texto = (string)($e['texto'] ?? ''); $jids = is_array($e['jids'] ?? null) ? $e['jids'] : [];
        if (trim($texto) === '' && !$jids) camp_erro('Cole os contatos ou escolha pelo menos um.');
        if (strlen($texto) > 1500000) camp_erro('Texto grande demais.');
        $atual = camp_lista_total($id); $opt = camp_optout_chaves(inst());
        $q = bd()->prepare('SELECT jid FROM lista_contatos WHERE lista_id=?'); $q->execute([$id]);
        $chaves = []; foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $j) $chaves[camp_chave(camp_numero_do_jid($j))] = 1;
        $novos = []; $invalidos = []; $dup = 0;
        $tentar = function (string $jid, string $nome, array $vars, string $ref, int $linha) use (&$novos, &$invalidos, &$dup, &$chaves) {
            $ch = camp_chave(camp_numero_do_jid($jid));
            if (isset($chaves[$ch])) { $dup++; return; }
            $chaves[$ch] = 1; $novos[] = [$jid, $nome, $vars];
        };
        foreach (camp_parse_texto($texto) as $x) {
            [$num, $motivo] = camp_normalizar($x['numero_bruto']);
            if ($num === null) { $invalidos[] = ['linha' => $x['linha'], 'valor' => $x['numero_bruto'] !== '' ? mb_substr($x['numero_bruto'], 0, 30) : $x['original'], 'motivo' => $motivo]; continue; }
            $tentar($num . '@s.whatsapp.net', $x['nome'], $x['vars'], $x['numero_bruto'], $x['linha']);
        }
        if ($jids) {
            $f = cache_arq('contatos.json'); $m = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
            foreach (array_slice($jids, 0, CAMP_IMPORTA_MAX) as $j) {
                $j = (string)$j;
                if (!camp_jid_valido($j) || !isset($m[$j]) || !empty($m[$j]['grupo'])) { $invalidos[] = ['linha' => 0, 'valor' => mb_substr($j, 0, 30), 'motivo' => 'contato não encontrado nos contatos da conexão']; continue; }
                $tentar($j, mb_substr((string)($m[$j]['nome'] ?? ''), 0, 120), [], $j, 0);
            }
        }
        if ($atual + count($novos) > CAMP_LISTA_MAX) camp_erro('Uma lista aceita no máximo ' . CAMP_LISTA_MAX . ' contatos.');
        $pdo = bd(); $pdo->beginTransaction(); $nOpt = 0;
        $ins = $pdo->prepare('INSERT IGNORE INTO lista_contatos (lista_id,jid,nome,variaveis,optout) VALUES (?,?,?,?,?)');
        foreach ($novos as [$jid, $nome, $vars]) {
            $o = isset($opt[camp_chave(camp_numero_do_jid($jid))]) ? 1 : 0; $nOpt += $o;
            $ins->execute([$id, $jid, $nome, $vars ? json_encode($vars, JSON_UNESCAPED_UNICODE) : null, $o]);
        }
        $pdo->commit();
        aud_detalhe('importou ' . count($novos) . ' contato(s) na lista #' . $id);
        out(['ok' => true, 'adicionados' => count($novos), 'duplicados' => $dup, 'optout' => $nOpt, 'invalidos_total' => count($invalidos), 'invalidos' => array_slice($invalidos, 0, 50), 'total_lista' => $atual + count($novos)]);
    },
    'remover_contato_lista' => function () {
        camp_exigir_post(); $e = entrada(); $id = (int)($e['lista_id'] ?? 0); camp_lista_obter($id);
        $jid = (string)($e['jid'] ?? ''); if (!camp_jid_valido($jid)) camp_erro('Contato inválido.');
        $q = bd()->prepare("SELECT 1 FROM campanhas WHERE lista_id=? AND status IN ('agendada','enviando','pausada') LIMIT 1"); $q->execute([$id]);
        if ($q->fetchColumn()) camp_erro('Há uma campanha ativa usando esta lista. Pause ou cancele antes de remover contatos.', 409);
        $q = bd()->prepare('DELETE FROM lista_contatos WHERE lista_id=? AND jid=?'); $q->execute([$id, $jid]);
        out(['ok' => true, 'removido' => $q->rowCount() > 0]);
    },

    // ============ CAMPANHAS ============
    'listar_campanhas' => function () {
        $st = (string)($_GET['status'] ?? ''); $p = [inst()]; $w = 'c.instancia=?';
        if ($st !== '') { if (!in_array($st, ['rascunho', 'agendada', 'enviando', 'pausada', 'concluida', 'cancelada'], true)) camp_erro('Status inválido.'); $w .= ' AND c.status=?'; $p[] = $st; }
        $q = bd()->prepare("SELECT c.*, l.nome lista_nome FROM campanhas c LEFT JOIN listas l ON l.id=c.lista_id WHERE $w ORDER BY FIELD(c.status,'enviando','pausada','agendada','rascunho','concluida','cancelada'), c.id DESC LIMIT 300");
        $q->execute($p); $r = [];
        foreach ($q->fetchAll() as $c) {
            $f = camp_fmt($c, $c['lista_nome']); $f['pendentes'] = max(0, $f['total'] - $f['enviados'] - $f['falhas']);
            $f['pct'] = $f['total'] > 0 ? (int)floor(($f['enviados'] + $f['falhas']) * 100 / $f['total']) : 0;
            $r[] = $f;
        }
        $q = bd()->prepare("SELECT status, COUNT(*) n FROM campanhas WHERE instancia=? GROUP BY status"); $q->execute([inst()]);
        out(['ok' => true, 'campanhas' => $r, 'por_status' => array_map('intval', array_column($q->fetchAll(), 'n', 'status')), 'hoje_enviados' => camp_enviados_hoje(inst()), 'teto_dia' => CAMP_LIMITE_DIA_MAX]);
    },
    'ver_campanha' => function () {
        $c = camp_obter((int)($_GET['id'] ?? 0)); $id = (int)$c['id'];
        $lista = null;
        if ($c['lista_id'] !== null) { $q = bd()->prepare('SELECT * FROM listas WHERE id=? AND instancia=?'); $q->execute([$c['lista_id'], inst()]); $lista = $q->fetch() ?: null; }
        $f = camp_fmt($c, $lista['nome'] ?? null);
        $rasc = in_array($c['status'], ['rascunho', 'agendada'], true);
        $ct = camp_contagens($id); $optout = 0; $ex = null;
        if ($rasc && $lista) {
            $q = bd()->prepare('SELECT COUNT(*) total, COALESCE(SUM(optout),0) opt FROM lista_contatos WHERE lista_id=?'); $q->execute([$lista['id']]); $t = $q->fetch();
            $optout = (int)$t['opt']; $totalPrev = (int)$t['total'] - $optout;
            if ($c['status'] === 'rascunho') $f['total'] = $totalPrev;
            $q = bd()->prepare('SELECT nome,variaveis FROM lista_contatos WHERE lista_id=? AND optout=0 ORDER BY nome LIMIT 1'); $q->execute([$lista['id']]); $p1 = $q->fetch();
            if ($p1) { $tpl = $c['tipo'] === 'texto' ? (string)$c['texto'] : (string)$c['legenda']; $ex = assinar(camp_render($tpl, (string)$p1['nome'], json_decode((string)$p1['variaveis'], true) ?: []), $c['assinatura']); }
        }
        $pend = $c['status'] === 'rascunho' ? $f['total'] : $ct['pendente'];
        $q = bd()->prepare('SELECT id,jid,nome,status,tentativas,enviado_em,erro FROM campanha_envios WHERE campanha_id=? AND status<>\'pendente\' ORDER BY id DESC LIMIT 10'); $q->execute([$id]);
        $am = array_map(fn($x) => ['id' => (int)$x['id'], 'jid' => $x['jid'], 'numero' => camp_numero_do_jid($x['jid']), 'nome' => $x['nome'], 'status' => $x['status'], 'enviado_em' => $x['enviado_em'] === null ? null : (int)$x['enviado_em'], 'erro' => $x['erro']], $q->fetchAll());
        $wh = in_array($c['status'], ['rascunho', 'agendada', 'enviando', 'pausada'], true) ? camp_webhook_ligado() : null;
        $feitos = $ct['enviado'] + $ct['falha'] + $ct['ignorado'];
        $f['progresso'] = ['pendentes' => $ct['pendente'], 'enviados' => $ct['enviado'], 'falhas' => $ct['falha'], 'ignorados' => $ct['ignorado'],
            'pct' => $f['total'] > 0 ? (int)floor($feitos * 100 / $f['total']) : 0];
        out(['ok' => true, 'campanha' => $f, 'progresso' => $f['progresso'], 'amostra' => $am, 'exemplo' => $ex, 'optout_na_lista' => $optout,
             'estimativa' => camp_estimativa($c, $pend), 'hoje_enviados' => camp_enviados_hoje(inst()), 'avisos' => camp_avisos($c, $f['total'], $optout, $wh),
             'webhook_ligado' => $wh, 'outra_enviando' => camp_outra_enviando(inst(), $id)]);
    },
    // JSON ou multipart (campo "arquivo" para mídia). {id?, nome, lista_id, tipo, texto, legenda, agendada_para, intervalo_min_s, intervalo_max_s, limite_dia, janela_inicio, janela_fim}
    'salvar_campanha' => function () {
        camp_exigir_post(); $e = entrada(); $id = (int)($e['id'] ?? 0);
        $atual = $id > 0 ? camp_obter($id) : null;
        $autor = assinatura_nome();
        if ($autor === '') camp_erro('Não foi possível identificar o seu nome para a assinatura.');
        if ($atual && !in_array($atual['status'], ['rascunho', 'pausada'], true)) camp_erro('Só é possível editar campanhas em rascunho ou pausadas.', 409);
        $d = $atual ?: ['tipo' => 'texto', 'texto' => '', 'legenda' => '', 'arquivo' => null, 'mime' => null, 'nome_arquivo' => null, 'lista_id' => null, 'agendada_para' => null,
                        'intervalo_min_s' => 12, 'intervalo_max_s' => 25, 'limite_dia' => 200, 'janela_inicio' => 8, 'janela_fim' => 20, 'nome' => '', 'assinatura' => $autor];
        $num = fn(string $k) => array_key_exists($k, $e) && $e[$k] !== '' && $e[$k] !== null ? (int)$e[$k] : (int)$d[$k];
        $d['intervalo_min_s'] = $num('intervalo_min_s'); $d['intervalo_max_s'] = $num('intervalo_max_s'); $d['limite_dia'] = $num('limite_dia');
        $d['janela_inicio'] = $num('janela_inicio'); $d['janela_fim'] = $num('janela_fim');
        camp_validar_numeros($d);
        if ($atual && $atual['status'] === 'pausada') { // pausada: só limites e janela
            bd()->prepare('UPDATE campanhas SET intervalo_min_s=?,intervalo_max_s=?,limite_dia=?,janela_inicio=?,janela_fim=? WHERE id=?')
                ->execute([$d['intervalo_min_s'], $d['intervalo_max_s'], $d['limite_dia'], $d['janela_inicio'], $d['janela_fim'], $id]);
            aud_detalhe('ajustou limites da campanha #' . $id);
            out(['ok' => true, 'id' => $id, 'avisos' => camp_avisos(array_merge($atual, $d), (int)$atual['total'])]);
        }
        $nome = trim((string)($e['nome'] ?? $d['nome']));
        if ($nome === '' || mb_strlen($nome) > 80) camp_erro('Dê um nome à campanha (até 80 caracteres).');
        $tipo = (string)($e['tipo'] ?? $d['tipo']); if (!in_array($tipo, ['texto', 'midia'], true)) camp_erro('Tipo inválido (texto ou mídia).');
        $listaId = array_key_exists('lista_id', $e) ? (int)$e['lista_id'] : (int)($d['lista_id'] ?? 0);
        if ($listaId > 0) camp_lista_obter($listaId); else $listaId = 0;
        $texto = (string)($e['texto'] ?? $d['texto']); $legenda = (string)($e['legenda'] ?? $d['legenda']);
        $arq = $d['arquivo']; $mime = $d['mime']; $narq = $d['nome_arquivo']; $novoArq = null;
        if ($tipo === 'texto') {
            if (trim($texto) === '') camp_erro('Escreva a mensagem da campanha.');
            if (mb_strlen($texto) > 3500) camp_erro('Mensagem muito longa (máximo 3500 caracteres).');
            $legenda = '';
        } else {
            if (mb_strlen($legenda) > 900) camp_erro('Legenda muito longa (máximo 900 caracteres).');
            if ($up = camp_receber_arquivo()) { [$arq, $mime, $narq] = $up; $novoArq = $arq; }
            if (!$arq) camp_erro('Anexe o arquivo da campanha.');
            $texto = '';
        }
        $ag = $e['agendada_para'] ?? null; $ag = ($ag === null || $ag === '' || (int)$ag === 0) ? null : (int)$ag;
        if ($ag !== null && ($ag < time() - 60 || $ag > time() + 90 * 86400)) { if ($novoArq) camp_apagar_arquivo($novoArq); camp_erro('A data de agendamento deve estar no futuro (até 90 dias).'); }
        if ($atual) {
            bd()->prepare('UPDATE campanhas SET nome=?,lista_id=?,tipo=?,texto=?,arquivo=?,mime=?,nome_arquivo=?,legenda=?,agendada_para=?,intervalo_min_s=?,intervalo_max_s=?,limite_dia=?,janela_inicio=?,janela_fim=?,assinatura=? WHERE id=? AND instancia=?')
                ->execute([$nome, $listaId ?: null, $tipo, $texto, $arq, $mime, $narq, $legenda, $ag, $d['intervalo_min_s'], $d['intervalo_max_s'], $d['limite_dia'], $d['janela_inicio'], $d['janela_fim'], $autor, $id, inst()]);
            if ($novoArq && $atual['arquivo'] && $atual['arquivo'] !== $novoArq) camp_apagar_arquivo($atual['arquivo']);
            if ($tipo === 'texto' && $atual['arquivo']) { camp_apagar_arquivo($atual['arquivo']); bd()->prepare('UPDATE campanhas SET arquivo=NULL,mime=NULL,nome_arquivo=NULL WHERE id=?')->execute([$id]); }
            aud_detalhe('editou a campanha #' . $id);
        } else {
            $q = bd()->prepare('SELECT COUNT(*) FROM campanhas WHERE instancia=?'); $q->execute([inst()]);
            if ((int)$q->fetchColumn() >= 500) { if ($novoArq) camp_apagar_arquivo($novoArq); camp_erro('Limite de 500 campanhas por conexão. Exclua as antigas.'); }
            bd()->prepare("INSERT INTO campanhas (instancia,nome,status,lista_id,tipo,texto,arquivo,mime,nome_arquivo,legenda,agendada_para,intervalo_min_s,intervalo_max_s,limite_dia,janela_inicio,janela_fim,assinatura,criado,criado_por) VALUES (?,?,'rascunho',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
                ->execute([inst(), $nome, $listaId ?: null, $tipo, $texto, $tipo === 'midia' ? $arq : null, $tipo === 'midia' ? $mime : null, $tipo === 'midia' ? $narq : null, $legenda, $ag, $d['intervalo_min_s'], $d['intervalo_max_s'], $d['limite_dia'], $d['janela_inicio'], $d['janela_fim'], $autor, time(), uid()]);
            $id = (int)bd()->lastInsertId();
            aud_detalhe('criou a campanha #' . $id);
        }
        $c = camp_obter($id); $tot = 0; $opt = 0;
        if ($c['lista_id'] !== null) { $q = bd()->prepare('SELECT COUNT(*), COALESCE(SUM(optout),0) FROM lista_contatos WHERE lista_id=?'); $q->execute([$c['lista_id']]); [$t, $opt] = array_map('intval', $q->fetch(PDO::FETCH_NUM)); $tot = $t - $opt; }
        out(['ok' => true, 'id' => $id, 'total' => $tot, 'estimativa' => camp_estimativa($c, $tot), 'avisos' => camp_avisos($c, $tot, $opt)]);
    },
    // {id, confirmo:true, total_esperado:N}
    'iniciar_campanha' => function () {
        camp_exigir_post(); $e = entrada(); $c = camp_obter((int)($e['id'] ?? 0)); $id = (int)$c['id'];
        if ($c['status'] !== 'rascunho') camp_erro('Só é possível iniciar uma campanha em rascunho.', 409);
        if (($e['confirmo'] ?? null) !== true) camp_erro('Confirmação explícita obrigatória para iniciar (confirmo: true).');
        if ($c['lista_id'] === null) camp_erro('Escolha a lista de contatos da campanha.');
        camp_lista_obter((int)$c['lista_id']);
        if (trim((string)$c['assinatura']) === '') camp_erro('Campanha sem assinatura do autor.');
        camp_validar_numeros($c);
        if ((int)$c['limite_dia'] > CAMP_LIMITE_DIA_MAX) camp_erro('Limite por dia acima do permitido.');
        if ($c['tipo'] === 'texto' ? trim((string)$c['texto']) === '' : !$c['arquivo']) camp_erro('A campanha está sem conteúdo.');
        $q = bd()->prepare('SELECT COUNT(*) FROM lista_contatos WHERE lista_id=? AND optout=0'); $q->execute([$c['lista_id']]); $total = (int)$q->fetchColumn();
        if ($total < 1) camp_erro('A lista não tem contatos válidos para receber.');
        if ((int)($e['total_esperado'] ?? -1) !== $total) camp_erro("O total de destinatários mudou (agora são {$total}). Revise e confirme novamente.", 409);
        $agendada = $c['agendada_para'] !== null && (int)$c['agendada_para'] > time() + 30;
        if (!$agendada) {
            if ($o = camp_outra_enviando(inst(), $id)) camp_erro('Já existe uma campanha enviando nesta conexão ("' . $o['nome'] . '"). Aguarde terminar ou pause-a.', 409);
            [$cs, $r] = evo('GET', '/instance/connectionState/' . rawurlencode(inst()), null, 10);
            if (($r['instance']['state'] ?? '') !== 'open') camp_erro('O WhatsApp desta conexão não está conectado.', 409);
        }
        $pdo = bd(); $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM campanha_envios WHERE campanha_id=?')->execute([$id]);
        $pdo->prepare("INSERT INTO campanha_envios (campanha_id,jid,nome,status) SELECT ?,jid,nome,'pendente' FROM lista_contatos WHERE lista_id=? AND optout=0 ORDER BY RAND()")->execute([$id, $c['lista_id']]);
        $st = $agendada ? 'agendada' : 'enviando';
        $pdo->prepare('UPDATE campanhas SET status=?,total=?,enviados=0,falhas=0,falhas_seguidas=0,pausa_motivo=NULL,proximo_envio=NULL,iniciada_em=?,concluida_em=NULL WHERE id=?')->execute([$st, $total, $agendada ? null : time(), $id]);
        $pdo->commit();
        aud_detalhe(($agendada ? 'agendou' : 'iniciou') . ' a campanha #' . $id . ' (' . $total . ' contatos)');
        out(['ok' => true, 'status' => $st, 'total' => $total]);
    },
    'pausar_campanha' => function () {
        camp_exigir_post(); $c = camp_obter((int)(entrada()['id'] ?? 0));
        if ($c['status'] !== 'enviando') camp_erro('Só dá para pausar uma campanha que está enviando.', 409);
        bd()->prepare("UPDATE campanhas SET status='pausada',pausa_motivo='Pausada manualmente' WHERE id=?")->execute([$c['id']]);
        aud_detalhe('pausou a campanha #' . $c['id']); out(['ok' => true, 'status' => 'pausada']);
    },
    'retomar_campanha' => function () {
        camp_exigir_post(); $c = camp_obter((int)(entrada()['id'] ?? 0));
        if ($c['status'] !== 'pausada') camp_erro('Só dá para retomar uma campanha pausada.', 409);
        if ($o = camp_outra_enviando(inst(), (int)$c['id'])) camp_erro('Já existe uma campanha enviando nesta conexão ("' . $o['nome'] . '").', 409);
        [, $r] = evo('GET', '/instance/connectionState/' . rawurlencode(inst()), null, 10);
        if (($r['instance']['state'] ?? '') !== 'open') camp_erro('O WhatsApp desta conexão não está conectado.', 409);
        bd()->prepare("UPDATE campanhas SET status='enviando',pausa_motivo=NULL,falhas_seguidas=0,proximo_envio=NULL WHERE id=?")->execute([$c['id']]);
        aud_detalhe('retomou a campanha #' . $c['id']); out(['ok' => true, 'status' => 'enviando']);
    },
    'cancelar_campanha' => function () {
        camp_exigir_post(); $c = camp_obter((int)(entrada()['id'] ?? 0));
        if (!in_array($c['status'], ['agendada', 'enviando', 'pausada'], true)) camp_erro('Esta campanha não pode ser cancelada agora.', 409);
        $pdo = bd(); $pdo->beginTransaction();
        $pdo->prepare("UPDATE campanha_envios SET status='ignorado',erro='Campanha cancelada' WHERE campanha_id=? AND status='pendente'")->execute([$c['id']]);
        $pdo->prepare("UPDATE campanhas SET status='cancelada',concluida_em=?,pausa_motivo=NULL WHERE id=?")->execute([time(), $c['id']]);
        $pdo->commit();
        aud_detalhe('cancelou a campanha #' . $c['id']); out(['ok' => true, 'status' => 'cancelada']);
    },
    'excluir_campanha' => function () {
        camp_exigir_post(); $c = camp_obter((int)(entrada()['id'] ?? 0));
        if (!in_array($c['status'], ['rascunho', 'concluida', 'cancelada'], true)) camp_erro('Só é possível excluir campanhas em rascunho, concluídas ou canceladas.', 409);
        $pdo = bd(); $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM campanha_envios WHERE campanha_id=?')->execute([$c['id']]);
        $pdo->prepare('DELETE FROM campanhas WHERE id=? AND instancia=?')->execute([$c['id'], inst()]);
        $pdo->commit();
        camp_apagar_arquivo($c['arquivo']);
        aud_detalhe('excluiu a campanha #' . $c['id']); out(['ok' => true]);
    },
    'listar_envios_campanha' => function () {
        $c = camp_obter((int)($_GET['id'] ?? 0)); $st = (string)($_GET['status'] ?? ''); $pag = max(1, (int)($_GET['pag'] ?? 1)); $por = 50;
        $w = 'campanha_id=?'; $p = [$c['id']];
        if ($st !== '') { if (!in_array($st, ['pendente', 'enviado', 'falha', 'ignorado'], true)) camp_erro('Status inválido.'); $w .= ' AND status=?'; $p[] = $st; }
        $q = bd()->prepare("SELECT COUNT(*) FROM campanha_envios WHERE $w"); $q->execute($p); $tot = (int)$q->fetchColumn();
        $q = bd()->prepare("SELECT id,jid,nome,status,tentativas,enviado_em,erro,msg_id FROM campanha_envios WHERE $w ORDER BY (status='pendente'), COALESCE(enviado_em,0) DESC, id DESC LIMIT $por OFFSET " . (($pag - 1) * $por)); $q->execute($p);
        $it = array_map(fn($x) => ['id' => (int)$x['id'], 'jid' => $x['jid'], 'numero' => camp_numero_do_jid($x['jid']), 'nome' => $x['nome'], 'status' => $x['status'], 'tentativas' => (int)$x['tentativas'],
            'enviado_em' => $x['enviado_em'] === null ? null : (int)$x['enviado_em'], 'erro' => $x['erro'], 'msg_id' => $x['msg_id']], $q->fetchAll());
        out(['ok' => true, 'total' => $tot, 'pag' => $pag, 'paginas' => max(1, (int)ceil($tot / $por)), 'itens' => $it]);
    },
    'rel_campanhas' => function () {
        $i = inst();
        $q = bd()->prepare('SELECT status, COUNT(*) n FROM campanhas WHERE instancia=? GROUP BY status'); $q->execute([$i]); $ps = array_map('intval', array_column($q->fetchAll(), 'n', 'status'));
        $q = bd()->prepare("SELECT e.status, COUNT(*) n FROM campanha_envios e JOIN campanhas c ON c.id=e.campanha_id WHERE c.instancia=? GROUP BY e.status"); $q->execute([$i]); $pe = array_map('intval', array_column($q->fetchAll(), 'n', 'status'));
        $ini = camp_inicio_dia() - 13 * 86400;
        $q = bd()->prepare("SELECT FROM_UNIXTIME(e.enviado_em,'%Y-%m-%d') dia, SUM(e.status='enviado') ok, SUM(e.status='falha') falha FROM campanha_envios e JOIN campanhas c ON c.id=e.campanha_id WHERE c.instancia=? AND e.enviado_em>=? GROUP BY dia");
        $q->execute([$i, $ini]); $m = array_column($q->fetchAll(), null, 'dia'); $dias = [];
        for ($k = 13; $k >= 0; $k--) { $d = date('Y-m-d', camp_inicio_dia() - $k * 86400 + 3600); $dias[] = ['dia' => $d, 'enviados' => (int)($m[$d]['ok'] ?? 0), 'falhas' => (int)($m[$d]['falha'] ?? 0)]; }
        $q = bd()->prepare("SELECT id,nome,status,total,enviados,falhas,iniciada_em,concluida_em FROM campanhas WHERE instancia=? AND status<>'rascunho' ORDER BY id DESC LIMIT 10"); $q->execute([$i]);
        $rec = array_map(fn($c) => ['id' => (int)$c['id'], 'nome' => $c['nome'], 'status' => $c['status'], 'total' => (int)$c['total'], 'enviados' => (int)$c['enviados'], 'falhas' => (int)$c['falhas'], 'iniciada_em' => $c['iniciada_em'] === null ? null : (int)$c['iniciada_em'], 'concluida_em' => $c['concluida_em'] === null ? null : (int)$c['concluida_em']], $q->fetchAll());
        $q = bd()->prepare('SELECT COUNT(*) FROM campanha_optouts WHERE instancia=?'); $q->execute([$i]);
        $env = ($pe['enviado'] ?? 0); $fal = ($pe['falha'] ?? 0);
        out(['ok' => true, 'campanhas_por_status' => $ps, 'envios_por_status' => $pe, 'enviados_total' => $env, 'falhas_total' => $fal, 'taxa_falha' => ($env + $fal) > 0 ? round($fal * 100 / ($env + $fal), 1) : 0,
             'hoje_enviados' => camp_enviados_hoje($i), 'teto_dia' => CAMP_LIMITE_DIA_MAX, 'optouts' => (int)$q->fetchColumn(), 'por_dia' => $dias, 'recentes' => $rec]);
    },

    '__perms' => [
        'listar_listas' => 'campanhas.ver', 'ver_lista' => 'campanhas.ver', 'listar_campanhas' => 'campanhas.ver', 'ver_campanha' => 'campanhas.ver',
        'listar_envios_campanha' => 'campanhas.ver', 'rel_campanhas' => 'campanhas.ver', 'listar_contatos_disponiveis' => 'campanhas.criar',
        'salvar_lista' => 'campanhas.criar', 'excluir_lista' => 'campanhas.criar', 'importar_contatos_lista' => 'campanhas.criar',
        'remover_contato_lista' => 'campanhas.criar', 'salvar_campanha' => 'campanhas.criar', 'excluir_campanha' => 'campanhas.criar',
        'iniciar_campanha' => 'campanhas.iniciar', 'pausar_campanha' => 'campanhas.iniciar', 'retomar_campanha' => 'campanhas.iniciar', 'cancelar_campanha' => 'campanhas.iniciar',
    ],
];
