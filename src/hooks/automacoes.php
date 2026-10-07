<?php
// ZapZap — motor de AUTOMAÇÕES (gatilho + condições + ações). Este arquivo guarda o motor inteiro (funções au_*) e é
// reaproveitado por api/automacoes.php (simulação/validação) e cron.d/automacoes.php (agendadas) via require_once.
// Segurança: modo 'teste' NUNCA envia nada (só registra o que FARIA); anti-loop (de_mim, robôs, limite por contato/hora, dedupe por msg_id).

if (!function_exists('au_tz')) {

define('AU_GATILHOS', ['mensagem_recebida', 'primeira_mensagem_do_contato', 'primeira_mensagem_do_dia', 'qualquer_mensagem', 'agendado', 'conexao_desconectada']);
define('AU_ACOES', ['responder_texto', 'responder_midia', 'esperar', 'marcar_lida', 'chamar_webhook', 'atribuir_fila', 'etiquetar', 'parar']);
define('AU_TIPOS_MSG', ['texto', 'imagem', 'video', 'audio', 'documento', 'figurinha', 'contato', 'localizacao', 'enquete']);
define('AU_MAX_JSON', 60000);

function au_tz(): DateTimeZone { static $z = null; return $z ??= new DateTimeZone('America/Maceio'); }
function au_agora(?int $ts = null): DateTimeImmutable { return (new DateTimeImmutable('@' . ($ts ?? time())))->setTimezone(au_tz()); }

/** Minúsculas e sem acentos (comparação de palavras-chave). */
function au_norm(string $t): string {
    $t = mb_strtolower($t, 'UTF-8');
    return strtr($t, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n']);
}
/** Chave de comparação de número (ignora o 9º dígito brasileiro). */
function au_chave_num(string $x): string {
    $n = preg_replace('/\D/', '', explode('@', $x)[0]);
    if (strlen($n) === 13 && str_starts_with($n, '55') && $n[4] === '9') $n = substr($n, 0, 4) . substr($n, 5);
    return $n;
}
function au_numero(string $jid): string { return preg_replace('/\D/', '', explode('@', $jid)[0]); }

// ---------------------------------------------------------------- Regex seguro
/** Devolve null se o padrão é aceitável, ou a mensagem de erro. */
function au_regex_erro(string $p): ?string {
    if ($p === '' || mb_strlen($p) > 200) return 'Expressão vazia ou maior que 200 caracteres.';
    if (preg_match('/\((?:[^()\\\\]|\\\\.)*[+*](?:[^()\\\\]|\\\\.)*\)\s*(?:[+*]|\{\d)/', $p)) return 'Expressão perigosa (repetição aninhada).';
    if (preg_match('/\\\\[1-9]/', $p)) return 'Referências (\\1) não são permitidas.';
    if (preg_match('/\(\?[<=!>R&P(]/', $p) || str_contains($p, '(?{') ) return 'Recursos avançados de regex não são permitidos.';
    $ant = set_error_handler(fn() => true);
    $r = @preg_match(au_delim($p), 'teste');
    restore_error_handler();
    return $r === false ? 'Expressão regular inválida.' : null;
}
function au_delim(string $p): string { return '~' . str_replace('~', '\~', $p) . '~iu'; }
function au_regex_casa(string $p, string $texto): bool {
    if (au_regex_erro($p) !== null) return false;
    $b = ini_get('pcre.backtrack_limit'); $j = ini_get('pcre.jit');
    ini_set('pcre.backtrack_limit', '20000'); ini_set('pcre.jit', '0');
    $r = @preg_match(au_delim($p), mb_substr($texto, 0, 1000));
    ini_set('pcre.backtrack_limit', (string)$b); ini_set('pcre.jit', (string)$j);
    return $r === 1;
}

// ---------------------------------------------------------------- URL segura (SSRF)
/** Verifica sintaxe; com $resolver=true também resolve o DNS e exige IP público. Devolve [erro|null, host, porta, ips]. */
function au_url_verificar(string $u, bool $resolver): array {
    if (strlen($u) > 500 || preg_match('/[\x00-\x20\x7f]/', $u)) return ['URL inválida.', '', 0, []];
    $p = parse_url($u);
    if (!$p || strtolower($p['scheme'] ?? '') !== 'https' || empty($p['host'])) return ['A URL precisa começar com https://.', '', 0, []];
    if (isset($p['user']) || isset($p['pass'])) return ['URL com usuário/senha não é permitida.', '', 0, []];
    $host = strtolower(trim($p['host'], '[]')); $porta = (int)($p['port'] ?? 443);
    if (!in_array($porta, [443, 8443], true)) return ['Porta não permitida (use 443 ou 8443).', '', 0, []];
    if ($host === 'localhost' || preg_match('/\.(local|localhost|internal|lan|home|corp)$/', $host)) return ['Endereço local não é permitido.', '', 0, []];
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) $ips = [$host];
    elseif ($resolver) {
        foreach (@dns_get_record($host, DNS_A) ?: [] as $r) if (!empty($r['ip'])) $ips[] = $r['ip'];
        foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        if (!$ips) return ['Não foi possível resolver o endereço.', $host, $porta, []];
    } elseif (!preg_match('/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/', $host) || !str_contains($host, '.')) return ['Endereço inválido.', '', 0, []];
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) || stripos($ip, '::ffff:') === 0 || $ip === '::' || str_starts_with($ip, '100.64.') || str_starts_with($ip, '169.254.') || str_starts_with($ip, 'fe80'))
            return ['O endereço aponta para uma rede interna (bloqueado por segurança).', $host, $porta, []];
    }
    return [null, $host, $porta, $ips];
}
/** POST JSON seguro (5 s, sem redirecionar, IP fixado). Devolve [ok, http, erro]. */
function au_http_post(string $url, array $corpo): array {
    [$e, $host, $porta, $ips] = au_url_verificar($url, true);
    if ($e) return [false, 0, $e];
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($corpo, JSON_UNESCAPED_UNICODE), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_RESOLVE => ["$host:$porta:{$ips[0]}"], CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'User-Agent: ZapZap-Automacao/1'],
        CURLOPT_WRITEFUNCTION => fn($c, $d) => strlen($d) > 65536 ? 0 : strlen($d)]);
    @curl_exec($ch); $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    return [$http >= 200 && $http < 300, $http, $http ? ($http >= 300 ? "resposta HTTP $http" : null) : ($err ?: 'sem resposta')];
}

// ---------------------------------------------------------------- Validação (usada pela API)
function au_lista_destinos($v, int $max, string &$erro): array {
    if (is_string($v)) $v = preg_split('/[\s,;]+/', $v, -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($v)) return [];
    $o = [];
    foreach ($v as $x) {
        $x = trim((string)$x); if ($x === '') continue;
        if (str_contains($x, '@')) { if (!preg_match('/^[0-9A-Za-z._:-]{3,60}@(s\.whatsapp\.net|g\.us|lid)$/', $x)) { $erro = 'Destino inválido: ' . mb_substr($x, 0, 30); return []; } $o[$x] = $x; continue; }
        $n = preg_replace('/\D/', '', $x);
        if (strlen($n) < 10 || strlen($n) > 15) { $erro = 'Número inválido: ' . mb_substr($x, 0, 30); return []; }
        $o[$n] = $n;
    }
    if (count($o) > $max) { $erro = "No máximo $max destinatários."; return []; }
    return array_values($o);
}
function au_hhmm($v): ?string { return is_string($v) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : null; }
function au_dias($v): array { $o = []; foreach ((array)$v as $d) { $d = (int)$d; if ($d >= 0 && $d <= 6) $o[$d] = $d; } sort($o); return array_values($o); }

/** Valida e normaliza o corpo de uma automação. Devolve [dados|null, erro|null]. */
function au_validar(array $in, bool $parcial = false): array {
    $nome = trim((string)($in['nome'] ?? ''));
    if (!$parcial && ($nome === '' || mb_strlen($nome) > 80)) return [null, 'Dê um nome à automação (até 80 caracteres).'];
    $g = $in['gatilho'] ?? null; if (!is_array($g)) return [null, 'Gatilho ausente.'];
    $tipo = (string)($g['tipo'] ?? ''); if (!in_array($tipo, AU_GATILHOS, true)) return [null, 'Tipo de gatilho inválido.'];
    $G = ['tipo' => $tipo]; $erro = '';
    if ($tipo === 'mensagem_recebida') {
        $modo = (string)($g['modo'] ?? 'contem'); if (!in_array($modo, ['contem', 'igual', 'comeca', 'regex'], true)) return [null, 'Modo de palavra-chave inválido.'];
        $ter = is_array($g['termos'] ?? null) ? $g['termos'] : (isset($g['termos']) ? preg_split('/\R/', (string)$g['termos']) : []);
        $T = []; foreach ($ter as $t) { $t = trim((string)$t); if ($t === '') continue; if (mb_strlen($t) > 200) return [null, 'Cada termo pode ter no máximo 200 caracteres.']; if ($modo === 'regex' && ($e = au_regex_erro($t))) return [null, $e]; $T[] = $t; }
        if (!$T) return [null, 'Informe ao menos uma palavra-chave.']; if (count($T) > 30) return [null, 'No máximo 30 termos.'];
        $G += ['modo' => $modo, 'termos' => $T, 'combinar' => ($g['combinar'] ?? 'qualquer') === 'todos' ? 'todos' : 'qualquer'];
    } elseif ($tipo === 'agendado') {
        $f = (string)($g['frequencia'] ?? 'diario'); if (!in_array($f, ['diario', 'semanal', 'intervalo'], true)) return [null, 'Frequência inválida.'];
        $G['frequencia'] = $f;
        if ($f === 'intervalo') { $m = (int)($g['minutos'] ?? 0); if ($m < 5 || $m > 1440) return [null, 'O intervalo deve ficar entre 5 e 1440 minutos.']; $G['minutos'] = $m; }
        else { $h = au_hhmm($g['hora'] ?? null); if (!$h) return [null, 'Informe o horário (HH:MM).']; $G['hora'] = $h; }
        if ($f === 'semanal') { $d = au_dias($g['dias'] ?? []); if (!$d) return [null, 'Escolha ao menos um dia da semana.']; $G['dias'] = $d; }
        $j = au_lista_destinos($g['jids'] ?? [], 50, $erro); if ($erro) return [null, $erro]; if (!$j) return [null, 'Informe os destinatários (até 50).'];
        $G['jids'] = $j;
    } elseif ($tipo === 'conexao_desconectada') {
        $j = au_lista_destinos($g['jids'] ?? [], 5, $erro); if ($erro) return [null, $erro]; $G['jids'] = $j;
        $ie = trim((string)($g['instancia_envio'] ?? '')); if ($ie !== '' && (!nome_instancia_ok($ie) || !isset(registro()[$ie]))) return [null, 'Conexão de envio do aviso desconhecida.'];
        $G['instancia_envio'] = $ie;
    }
    // condições
    $c = is_array($in['condicoes'] ?? null) ? $in['condicoes'] : []; $C = [];
    $tc = (string)($c['tipo_chat'] ?? 'individual'); $C['tipo_chat'] = in_array($tc, ['individual', 'grupo', 'ambos'], true) ? $tc : 'individual';
    if (!empty($c['horario']) && is_array($c['horario'])) {
        $h = $c['horario']; $hi = au_hhmm($h['inicio'] ?? null); $hf = au_hhmm($h['fim'] ?? null); if (!$hi || !$hf) return [null, 'Horário de funcionamento inválido.'];
        $C['horario'] = ['modo' => ($h['modo'] ?? 'dentro') === 'fora' ? 'fora' : 'dentro', 'dias' => au_dias($h['dias'] ?? [0, 1, 2, 3, 4, 5, 6]), 'inicio' => $hi, 'fim' => $hf];
    }
    foreach (['incluir', 'excluir'] as $k) { if (!empty($c[$k])) { $l = au_lista_destinos($c[$k], 200, $erro); if ($erro) return [null, $erro]; if ($l) $C[$k] = $l; } }
    if (!empty($c['tipos_mensagem'])) { $t = array_values(array_intersect(AU_TIPOS_MSG, (array)$c['tipos_mensagem'])); if ($t) $C['tipos_mensagem'] = $t; }
    if (isset($c['contato_novo']) && in_array($c['contato_novo'], [true, false, 1, 0, '1', '0'], true) && $c['contato_novo'] !== '') $C['contato_novo'] = (bool)(int)$c['contato_novo'];
    // ações
    $ac = $in['acoes'] ?? null; if (!is_array($ac) || !$ac) return [null, 'Adicione ao menos uma ação.']; if (count($ac) > 20) return [null, 'No máximo 20 ações.'];
    $A = []; $espera = 0; $envia = false;
    foreach (array_values($ac) as $i => $a) {
        if (!is_array($a)) return [null, 'Ação inválida.']; $t = (string)($a['tipo'] ?? ''); $n = $i + 1;
        if (!in_array($t, AU_ACOES, true)) return [null, "Ação $n: tipo não permitido."];
        if (in_array($tipo, ['agendado', 'conexao_desconectada'], true) && $t === 'marcar_lida') return [null, "Ação $n: 'marcar lida' não se aplica a este gatilho."];
        $X = ['tipo' => $t]; $at = max(0, min(30, (int)($a['atraso_s'] ?? 0))); if ($at && in_array($t, ['responder_texto', 'responder_midia', 'chamar_webhook'], true)) { $X['atraso_s'] = $at; $espera += $at; }
        if ($t === 'responder_texto') { $tx = trim((string)($a['texto'] ?? '')); if ($tx === '' || mb_strlen($tx) > 1500) return [null, "Ação $n: texto de 1 a 1500 caracteres."]; $X['texto'] = $tx; $envia = true; }
        elseif ($t === 'responder_midia') {
            $mt = (string)($a['midia_tipo'] ?? 'image'); if (!in_array($mt, ['image', 'video', 'document', 'audio'], true)) return [null, "Ação $n: tipo de mídia inválido."];
            $X['midia_tipo'] = $mt; $url = trim((string)($a['url'] ?? '')); $arq = basename(trim((string)($a['arquivo'] ?? '')));
            if ($url !== '') { [$e] = au_url_verificar($url, false); if ($e) return [null, "Ação $n: $e"]; $X['url'] = $url; }
            elseif ($arq !== '' && preg_match('/^[\w.\- ]{1,120}$/u', $arq)) $X['arquivo'] = $arq;
            else return [null, "Ação $n: informe a URL https ou um arquivo já salvo."];
            $lg = trim((string)($a['legenda'] ?? '')); if (mb_strlen($lg) > 1000) return [null, "Ação $n: legenda longa demais."]; $X['legenda'] = $lg; $envia = true;
        } elseif ($t === 'esperar') { $s = (int)($a['segundos'] ?? 0); if ($s < 1 || $s > 30) return [null, "Ação $n: espera de 1 a 30 segundos."]; $X['segundos'] = $s; $espera += $s; }
        elseif ($t === 'chamar_webhook') { $u = trim((string)($a['url'] ?? '')); [$e] = au_url_verificar($u, false); if ($e) return [null, "Ação $n: $e"]; $X['url'] = $u; $X['incluir_texto'] = !empty($a['incluir_texto']); }
        elseif ($t === 'atribuir_fila') { $v = trim((string)($a['fila'] ?? '')); if ($v === '' || mb_strlen($v) > 80) return [null, "Ação $n: informe a fila."]; $X['fila'] = $v; }
        elseif ($t === 'etiquetar') { $v = trim((string)($a['etiqueta'] ?? '')); if ($v === '' || mb_strlen($v) > 60) return [null, "Ação $n: informe a etiqueta."]; $X['etiqueta'] = $v; }
        $A[] = $X;
    }
    if ($espera > 45) return [null, 'A soma dos atrasos e esperas não pode passar de 45 segundos.'];
    $lim = (int)($in['limite_hora_contato'] ?? 3); if ($lim < 1 || $lim > 60) return [null, 'O limite por contato/hora deve ficar entre 1 e 60.'];
    $r = ['nome' => $nome, 'gatilho' => $G, 'condicoes' => $C, 'acoes' => $A, 'limite_hora_contato' => $lim];
    if (strlen(json_encode($r, JSON_UNESCAPED_UNICODE)) > AU_MAX_JSON) return [null, 'Automação grande demais.'];
    return [$r, null];
}

// ---------------------------------------------------------------- Avaliação
function au_saudacao(DateTimeImmutable $d): string { $h = (int)$d->format('G'); return $h < 12 ? 'bom dia' : ($h < 18 ? 'boa tarde' : 'boa noite'); }
function au_vars(string $t, array $c): string {
    $d = au_agora(); $nome = trim(preg_replace('/[\x00-\x1f*_~`]+/u', ' ', (string)($c['nome'] ?? ''))); $num = au_numero((string)($c['jid'] ?? ''));
    return strtr($t, ['{nome}' => mb_substr($nome !== '' ? $nome : $num, 0, 60), '{numero}' => $num, '{data}' => $d->format('d/m/Y'), '{hora}' => $d->format('H:i'), '{saudacao}' => au_saudacao($d)]);
}
function au_horario_ok(array $h, DateTimeImmutable $agora): bool {
    $dia = (int)$agora->format('w'); $hm = $agora->format('H:i'); $ini = $h['inicio']; $fim = $h['fim'];
    if ($fim >= $ini) $dentro = in_array($dia, $h['dias'], true) && $hm >= $ini && $hm < $fim;
    else { $dentro = ($hm >= $ini && in_array($dia, $h['dias'], true)) || ($hm < $fim && in_array(($dia + 6) % 7, $h['dias'], true)); } // vira a meia-noite
    return ($h['modo'] ?? 'dentro') === 'fora' ? !$dentro : $dentro;
}
function au_lista_tem(array $lista, string $jid): bool {
    $k = au_chave_num($jid); foreach ($lista as $x) if ($x === $jid || au_chave_num((string)$x) === $k) return true; return false;
}
/** Sinalizadores de contexto que dependem do banco. */
function au_flags(string $inst, array $m): array {
    $q = bd()->prepare('SELECT 1 FROM automacao_contatos WHERE instancia=? AND jid=?'); $q->execute([$inst, $m['jid']]); $conhecido = (bool)$q->fetchColumn();
    if (!$conhecido) { $q = bd()->prepare("SELECT 1 FROM eventos WHERE instancia=? AND jid=? AND evento IN ('messages.upsert','send.message') AND (msg_id IS NULL OR msg_id<>?) LIMIT 1"); $q->execute([$inst, $m['jid'], $m['id']]); $conhecido = (bool)$q->fetchColumn(); }
    if (!$conhecido) { $q = bd()->prepare('SELECT 1 FROM envios WHERE jid=? LIMIT 1'); try { $q->execute([$m['jid']]); $conhecido = (bool)$q->fetchColumn(); } catch (Throwable $e) {} }
    $ini = au_agora()->setTime(0, 0)->getTimestamp();
    $q = bd()->prepare("SELECT 1 FROM eventos WHERE instancia=? AND jid=? AND from_me=0 AND evento='messages.upsert' AND ts>=? AND (msg_id IS NULL OR msg_id<>?) LIMIT 1"); $q->execute([$inst, $m['jid'], $ini, $m['id']]);
    return ['novo' => !$conhecido, 'primeira_do_dia' => !$q->fetchColumn()];
}
/**
 * Avalia gatilho + condições de UMA regra contra uma mensagem. Devolve ['casou'=>bool,'motivo'=>texto,'passos'=>[…]].
 * $f = flags ['novo','primeira_do_dia'], $agora = DateTimeImmutable.
 */
function au_casa(array $a, array $m, array $f, DateTimeImmutable $agora): array {
    $g = $a['gatilho']; $c = $a['condicoes']; $P = []; $tx = (string)$m['texto'];
    $falha = function (string $et, string $det) use (&$P) { $P[] = ['etapa' => $et, 'ok' => false, 'detalhe' => $det]; return ['casou' => false, 'motivo' => $det, 'passos' => $P]; };
    $t = $g['tipo'];
    if ($t === 'mensagem_recebida') {
        if ($m['de_mim']) return $falha('Gatilho', 'Mensagem enviada por mim (ignorada).');
        if (trim($tx) === '') return $falha('Gatilho', 'Mensagem sem texto.');
        $nt = au_norm($tx); $achou = []; $modo = $g['modo'];
        foreach ($g['termos'] as $termo) {
            $nterm = au_norm($termo);
            $ok = match ($modo) { 'contem' => $nterm !== '' && str_contains($nt, $nterm), 'igual' => trim($nt) === trim($nterm), 'comeca' => str_starts_with(ltrim($nt), $nterm), 'regex' => au_regex_casa($termo, $tx), default => false };
            if ($ok) $achou[] = $termo;
        }
        $ok = ($g['combinar'] ?? 'qualquer') === 'todos' ? count($achou) === count($g['termos']) : count($achou) > 0;
        if (!$ok) return $falha('Gatilho', 'Nenhuma palavra-chave casou com o texto.');
        $P[] = ['etapa' => 'Gatilho', 'ok' => true, 'detalhe' => 'Palavra-chave casou: ' . mb_substr(implode(', ', $achou), 0, 120)];
    } elseif ($t === 'primeira_mensagem_do_contato') {
        if ($m['de_mim']) return $falha('Gatilho', 'Mensagem enviada por mim (ignorada).');
        if (!$f['novo']) return $falha('Gatilho', 'O contato já tinha histórico.');
        $P[] = ['etapa' => 'Gatilho', 'ok' => true, 'detalhe' => 'Primeira mensagem deste contato.'];
    } elseif ($t === 'primeira_mensagem_do_dia') {
        if ($m['de_mim']) return $falha('Gatilho', 'Mensagem enviada por mim (ignorada).');
        if (!$f['primeira_do_dia']) return $falha('Gatilho', 'O contato já falou hoje.');
        $P[] = ['etapa' => 'Gatilho', 'ok' => true, 'detalhe' => 'Primeira mensagem do contato hoje.'];
    } elseif ($t === 'qualquer_mensagem') {
        if ($m['de_mim']) return $falha('Gatilho', 'Mensagem enviada por mim (ignorada).');
        $P[] = ['etapa' => 'Gatilho', 'ok' => true, 'detalhe' => 'Qualquer mensagem recebida.'];
    } else return $falha('Gatilho', 'Este gatilho não é disparado por mensagem recebida.');
    // condições
    $tc = $c['tipo_chat'] ?? 'individual';
    if ($m['grupo'] ? $tc === 'individual' : $tc === 'grupo') return $falha('Condição: tipo de chat', $m['grupo'] ? 'É um grupo e a regra só vale para conversas individuais.' : 'É conversa individual e a regra só vale para grupos.');
    $P[] = ['etapa' => 'Condição: tipo de chat', 'ok' => true, 'detalhe' => ($m['grupo'] ? 'Grupo' : 'Individual') . " (regra: $tc)"];
    if (!empty($c['horario'])) {
        if (!au_horario_ok($c['horario'], $agora)) return $falha('Condição: horário', 'Fora da janela configurada (agora ' . $agora->format('D H:i') . ').');
        $P[] = ['etapa' => 'Condição: horário', 'ok' => true, 'detalhe' => 'Dentro da regra de horário (' . $agora->format('H:i') . ').'];
    }
    if (!empty($c['incluir']) && !au_lista_tem($c['incluir'], $m['jid'])) return $falha('Condição: contatos', 'O contato não está na lista de contatos permitidos.');
    if (!empty($c['excluir']) && au_lista_tem($c['excluir'], $m['jid'])) return $falha('Condição: exclusão', 'O contato está na lista de exclusão.');
    if (!empty($c['incluir']) || !empty($c['excluir'])) $P[] = ['etapa' => 'Condição: contatos', 'ok' => true, 'detalhe' => 'Contato permitido.'];
    if (!empty($c['tipos_mensagem'])) {
        if (!in_array($m['tipo'], $c['tipos_mensagem'], true)) return $falha('Condição: tipo de mensagem', 'Tipo "' . $m['tipo'] . '" não está entre os aceitos.');
        $P[] = ['etapa' => 'Condição: tipo de mensagem', 'ok' => true, 'detalhe' => 'Tipo ' . $m['tipo'] . ' aceito.'];
    }
    if (isset($c['contato_novo'])) {
        if ((bool)$c['contato_novo'] !== (bool)$f['novo']) return $falha('Condição: contato novo', $c['contato_novo'] ? 'O contato já tem histórico.' : 'O contato é novo (regra pede contato antigo).');
        $P[] = ['etapa' => 'Condição: contato novo', 'ok' => true, 'detalhe' => $c['contato_novo'] ? 'Contato novo.' : 'Contato com histórico.'];
    }
    return ['casou' => true, 'motivo' => 'ok', 'passos' => $P];
}

// ---------------------------------------------------------------- Execução das ações
/** Contexto $c: jid, msg_id, nome, texto, tipo, ts, inst_envio(opcional). Em $vivo=false só descreve. Devolve ['parar'=>bool,'erros'=>int,'enviou'=>int,'resumo'=>string]. */
function au_acoes(array $a, array $c, bool $vivo, array &$P): array {
    $parar = false; $erros = 0; $enviou = 0; $orig = inst(); $res = [];
    if ($vivo && !empty($c['inst_envio'])) usar_instancia($c['inst_envio']);
    $dorme = function (int $s) use ($vivo, &$P) { if ($vivo) { $s = min($s, max(0, (int)($GLOBALS['AU_ORC'] ?? 45))); $GLOBALS['AU_ORC'] = ($GLOBALS['AU_ORC'] ?? 45) - $s; if ($s > 0) sleep($s); } };
    foreach ($a['acoes'] as $x) {
        $t = $x['tipo'];
        if (!empty($x['atraso_s'])) { $P[] = ['etapa' => 'Atraso', 'ok' => true, 'detalhe' => ($vivo ? 'Aguardando ' : 'Aguardaria ') . $x['atraso_s'] . ' s']; $dorme((int)$x['atraso_s']); }
        if ($t === 'responder_texto') {
            $tx = au_vars($x['texto'], $c); $dest = (string)$c['jid'];
            if (!$vivo) { $P[] = ['etapa' => 'Ação: responder texto', 'ok' => true, 'detalhe' => 'FARIA: enviar "' . mb_substr($tx, 0, 200) . '"']; $res[] = 'texto'; continue; }
            [$ok, , $e] = zz_enviar_texto($dest, $tx, ['origem' => 'automacao', 'digitando_ms' => min(3000, mb_strlen($tx) * 40)]);
            $P[] = ['etapa' => 'Ação: responder texto', 'ok' => $ok, 'detalhe' => $ok ? 'Enviado.' : 'Falhou: ' . $e]; $ok ? $enviou++ : $erros++; $res[] = $ok ? 'texto enviado' : 'texto falhou';
        } elseif ($t === 'responder_midia') {
            $dest = (string)$c['jid']; $alvo = $x['url'] ?? ('arquivo ' . ($x['arquivo'] ?? ''));
            if (!$vivo) { $P[] = ['etapa' => 'Ação: responder mídia', 'ok' => true, 'detalhe' => 'FARIA: enviar ' . $x['midia_tipo'] . ' (' . mb_substr($alvo, 0, 120) . ')']; $res[] = 'mídia'; continue; }
            $mime = 'application/octet-stream'; $nome = 'arquivo'; $cont = '';
            if (!empty($x['url'])) { [$e] = au_url_verificar($x['url'], true); if ($e) { $P[] = ['etapa' => 'Ação: responder mídia', 'ok' => false, 'detalhe' => $e]; $erros++; continue; } $cont = $x['url']; $nome = basename((string)parse_url($x['url'], PHP_URL_PATH)) ?: 'arquivo'; }
            else {
                $f = ZZ_DIR . '/anexos/' . basename((string)$x['arquivo']);
                if (!is_file($f) || filesize($f) > 15 * 1048576) { $P[] = ['etapa' => 'Ação: responder mídia', 'ok' => false, 'detalhe' => 'Arquivo não encontrado ou maior que 15 MB.']; $erros++; continue; }
                $cont = base64_encode((string)file_get_contents($f)); $nome = basename($f); $mime = (string)(mime_content_type($f) ?: $mime);
            }
            [$ok, , $e] = zz_enviar_midia($dest, $x['midia_tipo'], $cont, $mime, $nome, au_vars((string)($x['legenda'] ?? ''), $c), 'automacao');
            $P[] = ['etapa' => 'Ação: responder mídia', 'ok' => $ok, 'detalhe' => $ok ? 'Enviado.' : 'Falhou: ' . $e]; $ok ? $enviou++ : $erros++; $res[] = $ok ? 'mídia enviada' : 'mídia falhou';
        } elseif ($t === 'esperar') {
            $P[] = ['etapa' => 'Ação: esperar', 'ok' => true, 'detalhe' => ($vivo ? 'Esperando ' : 'Esperaria ') . $x['segundos'] . ' s']; $dorme((int)$x['segundos']);
        } elseif ($t === 'marcar_lida') {
            if (!$vivo || $c['msg_id'] === '') { $P[] = ['etapa' => 'Ação: marcar como lida', 'ok' => true, 'detalhe' => $vivo ? 'Sem mensagem para marcar.' : 'FARIA: marcar a mensagem como lida']; continue; }
            [$cod] = evo('POST', '/chat/markMessageAsRead/' . rawurlencode(inst()), ['readMessages' => [['remoteJid' => $c['jid'], 'fromMe' => false, 'id' => $c['msg_id']]]], 15);
            $ok = $cod >= 200 && $cod < 300; $P[] = ['etapa' => 'Ação: marcar como lida', 'ok' => $ok, 'detalhe' => $ok ? 'Marcada como lida.' : 'Falhou']; if (!$ok) $erros++;
        } elseif ($t === 'chamar_webhook') {
            [$e, $host] = au_url_verificar($x['url'], !$vivo ? false : true);
            if (!$vivo) { $P[] = ['etapa' => 'Ação: chamar webhook', 'ok' => !$e, 'detalhe' => $e ?: 'FARIA: POST JSON em ' . mb_substr((string)parse_url($x['url'], PHP_URL_HOST), 0, 80) . ' (máx. 5 s)']; continue; }
            $corpo = ['automacao' => (int)($a['id'] ?? 0), 'nome_automacao' => $a['nome'] ?? '', 'instancia' => inst(), 'jid' => $c['jid'], 'numero' => au_numero((string)$c['jid']), 'nome' => $c['nome'] ?? '', 'tipo' => $c['tipo'] ?? '', 'ts' => $c['ts'] ?? time()];
            if (!empty($x['incluir_texto'])) $corpo['texto'] = mb_substr((string)($c['texto'] ?? ''), 0, 2000);
            [$ok, $http, $er] = au_http_post($x['url'], $corpo);
            $P[] = ['etapa' => 'Ação: chamar webhook', 'ok' => $ok, 'detalhe' => $ok ? "HTTP $http" : 'Falhou: ' . $er]; if (!$ok) $erros++;
        } elseif ($t === 'atribuir_fila' || $t === 'etiquetar') {
            $tipo = $t === 'etiquetar' ? 'etiqueta' : 'fila'; $v = (string)($x[$tipo] ?? '');
            if (!$vivo) { $P[] = ['etapa' => 'Ação: ' . ($tipo === 'fila' ? 'atribuir à fila' : 'etiquetar'), 'ok' => true, 'detalhe' => "FARIA: registrar $tipo \"" . mb_substr($v, 0, 60) . '"']; continue; }
            try { bd()->prepare('INSERT INTO automacao_marcas (instancia,automacao_id,jid,tipo,valor,ts) VALUES (?,?,?,?,?,?)')->execute([inst(), (int)($a['id'] ?? 0), $c['jid'], $tipo, mb_substr($v, 0, 80), time()]); $P[] = ['etapa' => 'Ação: ' . $tipo, 'ok' => true, 'detalhe' => "Registrado ($tipo \"" . mb_substr($v, 0, 40) . '"); o módulo correspondente aplica quando disponível.']; }
            catch (Throwable $e) { $P[] = ['etapa' => 'Ação: ' . $tipo, 'ok' => true, 'detalhe' => 'Módulo indisponível; ignorado sem erro.']; }
        } elseif ($t === 'parar') {
            $P[] = ['etapa' => 'Ação: parar', 'ok' => true, 'detalhe' => 'As regras seguintes não serão avaliadas.']; $parar = true; break;
        }
    }
    if ($vivo && !empty($c['inst_envio'])) usar_instancia($orig);
    return ['parar' => $parar, 'erros' => $erros, 'enviou' => $enviou, 'resumo' => implode(', ', array_slice($res, 0, 6))];
}

// ---------------------------------------------------------------- Banco / registros
function au_log(array $a, ?string $jid, ?string $msgId, string $res, string $det): void {
    try { bd()->prepare('INSERT INTO automacao_logs (automacao_id,instancia,ts,jid,msg_id,resultado,detalhe) VALUES (?,?,?,?,?,?,?)')->execute([(int)$a['id'], $a['instancia'], time(), $jid !== null ? mb_substr($jid, 0, 80) : null, $msgId !== null ? mb_substr($msgId, 0, 80) : null, $res, mb_substr($det, 0, 500)]); } catch (Throwable $e) { @error_log('[zapzap] au_log: ' . $e->getMessage()); }
}
function au_marcar_exec(int $id): void { try { bd()->prepare('UPDATE automacoes SET executada_vezes=executada_vezes+1, ultima_execucao=? WHERE id=?')->execute([time(), $id]); } catch (Throwable $e) {} }
function au_carregar(array $r): array {
    $r['gatilho'] = json_decode((string)$r['gatilho'], true) ?: ['tipo' => 'qualquer_mensagem']; $r['condicoes'] = json_decode((string)$r['condicoes'], true) ?: []; $r['acoes'] = json_decode((string)$r['acoes'], true) ?: [];
    return $r;
}
function au_dedupe(int $id, string $chave): bool { // true = primeira vez
    try { $q = bd()->prepare('INSERT IGNORE INTO automacao_dedupe (automacao_id,msg_id,ts) VALUES (?,?,?)'); $q->execute([$id, mb_substr($chave, 0, 80), time()]); return $q->rowCount() === 1; } catch (Throwable $e) { return false; }
}
function au_limite_ok(array $a, string $jid): array {
    $q = bd()->prepare("SELECT COUNT(*) FROM automacao_logs WHERE automacao_id=? AND jid=? AND resultado IN ('executou','teste') AND ts>?"); $q->execute([$a['id'], $jid, time() - 3600]); $n = (int)$q->fetchColumn();
    if ($n >= (int)$a['limite_hora_contato']) return [false, "Limite de {$a['limite_hora_contato']} respostas por contato/hora atingido."];
    if ($a['modo'] === 'ao_vivo') {
        $q = bd()->prepare("SELECT COUNT(*) FROM envios WHERE origem='automacao' AND instancia=? AND jid=? AND quando>? AND ok=1"); try { $q->execute([$a['instancia'], $jid, time() - 3600]); if ((int)$q->fetchColumn() >= 6) return [false, 'Limite global de 6 respostas automáticas por contato/hora atingido.']; } catch (Throwable $e) {}
    }
    return [true, ''];
}

// ---------------------------------------------------------------- Mensagem recebida (webhook)
function au_hook_msg(array $ctx): void {
    $m = $ctx['msg'] ?? null; if (!$m || $m['de_mim'] || $m['id'] === '') return;
    $inst = $ctx['instancia'];
    if (str_ends_with($m['jid'], '@broadcast') || str_contains($m['jid'], 'status@')) return;
    if ($m['ts'] < time() - 600) return; // mensagem antiga (reenvio do histórico)
    if (preg_match('/resposta autom[aá]tica|mensagem autom[aá]tica|auto-?reply|n[aã]o responda (esta|essa) mensagem|\bnoreply\b/iu', $m['texto'])) return; // robôs conhecidos
    try {
        $q = bd()->prepare("SELECT * FROM automacoes WHERE instancia=? AND ativa=1 ORDER BY ordem, id"); $q->execute([$inst]);
        $regras = array_map('au_carregar', $q->fetchAll());
    } catch (Throwable $e) { return; }
    $regras = array_values(array_filter($regras, fn($r) => !in_array($r['gatilho']['tipo'], ['agendado', 'conexao_desconectada'], true)));
    if (!$regras) { au_registrar_contato($inst, $m['jid']); return; }
    $f = au_flags($inst, $m); $agora = au_agora(); $GLOBALS['AU_ORC'] = 45;
    foreach ($regras as $a) {
        $r = au_casa($a, $m, $f, $agora);
        if (!$r['casou']) continue;
        if (!au_dedupe((int)$a['id'], $m['id'])) continue; // já processada
        [$okLim, $motivo] = au_limite_ok($a, $m['jid']);
        if (!$okLim) { au_log($a, $m['jid'], $m['id'], 'ignorou', $motivo); continue; }
        $vivo = $a['modo'] === 'ao_vivo'; $P = [];
        $c = ['jid' => $m['jid'], 'msg_id' => $m['id'], 'nome' => $m['nome'], 'texto' => $m['texto'], 'tipo' => $m['tipo'], 'ts' => $m['ts']];
        $x = au_acoes($a, $c, $vivo, $P);
        $det = implode(' | ', array_map(fn($p) => $p['detalhe'], array_filter($P, fn($p) => str_starts_with($p['etapa'], 'Ação') || $p['etapa'] === 'Atraso')));
        au_marcar_exec((int)$a['id']);
        if (!$vivo) au_log($a, $m['jid'], $m['id'], 'teste', 'MODO TESTE (nada enviado) — ' . $det);
        elseif ($x['erros'] > 0) au_log($a, $m['jid'], $m['id'], 'erro', $det);
        else au_log($a, $m['jid'], $m['id'], 'executou', $det);
        if ($x['parar']) break;
    }
    au_registrar_contato($inst, $m['jid']);
}
function au_registrar_contato(string $inst, string $jid): void { try { bd()->prepare('INSERT IGNORE INTO automacao_contatos (instancia,jid,primeira_ts) VALUES (?,?,?)')->execute([$inst, $jid, time()]); } catch (Throwable $e) {} }

// ---------------------------------------------------------------- Conexão desconectada (webhook)
function au_hook_conexao(array $ctx): void {
    $estado = strtolower((string)($ctx['dados']['state'] ?? ''));
    if ($estado !== 'close') return;
    $inst = $ctx['instancia'];
    $q = bd()->prepare("SELECT * FROM automacoes WHERE instancia=? AND ativa=1 ORDER BY ordem, id"); $q->execute([$inst]);
    foreach ($q->fetchAll() as $r) {
        $a = au_carregar($r); if ($a['gatilho']['tipo'] !== 'conexao_desconectada') continue;
        if (!au_dedupe((int)$a['id'], 'cd:' . intdiv(time(), 1800))) continue; // no máximo 1 aviso a cada 30 min
        au_enfileirar($a, $a['gatilho']['jids'] ?: [''], 'Conexão desconectada', $a['gatilho']['instancia_envio'] ?: null);
    }
}

// ---------------------------------------------------------------- Envios em lote (agendado / aviso): fila com 8–20 s de intervalo
function au_enfileirar(array $a, array $jids, string $motivo, ?string $instEnvio): void {
    $jids = array_slice($jids, 0, 50); if (!$jids) $jids = [''];
    if ($a['modo'] !== 'ao_vivo') {
        foreach ($jids as $j) { $P = []; $c = ['jid' => $j, 'msg_id' => '', 'nome' => '', 'texto' => '', 'tipo' => '', 'ts' => time()]; au_acoes($a, $c, false, $P);
            au_log($a, $j !== '' ? $j : null, null, 'teste', "MODO TESTE (nada enviado) — $motivo — " . mb_substr(implode(' | ', array_map(fn($p) => $p['detalhe'], $P)), 0, 300)); }
        au_marcar_exec((int)$a['id']); return;
    }
    $quando = time();
    $ins = bd()->prepare('INSERT INTO automacao_envios (automacao_id,instancia,inst_envio,jid,quando) VALUES (?,?,?,?,?)');
    foreach ($jids as $k => $j) { if ($k > 0) $quando += random_int(8, 20); $ins->execute([$a['id'], $a['instancia'], $instEnvio, $j, $quando]); }
    au_log($a, null, null, 'executou', "$motivo — " . count($jids) . ' envio(s) na fila (8–20 s entre cada)');
    au_marcar_exec((int)$a['id']);
}
}

return [
    'messages.upsert' => function (array $ctx): void { au_hook_msg($ctx); },
    'connection.update' => function (array $ctx): void { au_hook_conexao($ctx); },
];
