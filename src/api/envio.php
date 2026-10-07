<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo ENVIO (texto, mídia, enquete, localização, contato, presença, verificação de número).
// Usa só inst()/evo()/log_envio() do núcleo (instância ativa); nada de nome de instância fixo.

if (!function_exists('envio_falha')) {
    function envio_jid_ou_erro(string $bruto): string {
        $bruto = trim($bruto);
        if ($bruto === '') out(['ok' => false, 'msg' => 'Informe o destinatário (número ou conversa).'], 422);
        $d = destino($bruto);
        if (str_contains($d, '@')) {
            if (!preg_match('/^[0-9A-Za-z._:-]{3,60}@(s\.whatsapp\.net|g\.us|lid)$/', $d)) out(['ok' => false, 'msg' => 'Identificador de conversa inválido.'], 422);
            return $d;
        }
        if (!preg_match('/^\d{10,15}$/', $d)) out(['ok' => false, 'msg' => 'Número inválido. Use DDI + DDD + número, ex.: 5582999999999.'], 422);
        return $d;
    }
    function envio_resumo(string $s): string {
        $s = trim(preg_replace('/\s+/u', ' ', $s));
        return mb_strlen($s) > 120 ? mb_substr($s, 0, 117) . '...' : $s;
    }
    /** Traduz erro da Evolution para pt-BR. */
    function envio_erro_evo(int $code, array $r): string {
        if ($code === 0) return 'Sem resposta do servidor do WhatsApp. Tente de novo em instantes.';
        $txt = json_encode($r, JSON_UNESCAPED_UNICODE);
        if (stripos($txt, '"exists":false') !== false)
            return 'Este número não tem WhatsApp.';
        if (stripos($txt, 'Connection Closed') !== false || stripos($txt, 'not connected') !== false || stripos($txt, 'does not exist') !== false)
            return 'O WhatsApp está desconectado. Verifique a conexão em Configurações.';
        if ($code === 401 || $code === 403) return 'A API recusou o acesso (chave inválida).';
        if ($code === 404) return 'Instância do WhatsApp não encontrada.';
        if ($code === 400) return 'O WhatsApp recusou os dados enviados (' . ($r['response']['message'][0] ?? $r['message'] ?? 'requisição inválida') . ').';
        if ($code >= 500) return 'O WhatsApp não conseguiu enviar agora. Tente novamente.';
        return 'Falha ao enviar (código ' . $code . ').';
    }
    /** Envia, registra no histórico e responde. */
    function envio_executar(string $jid, string $tipo, string $resumo, string $caminho, array $corpo, int $timeout = 40): never {
        [$code, $r] = evo('POST', $caminho . '/' . rawurlencode(inst()), $corpo, $timeout);
        $id = $r['key']['id'] ?? null;
        aud_detalhe('enviou ' . $tipo . ' para ' . $jid);
        if ($code >= 200 && $code < 300 && $id) {
            $real = $r['key']['remoteJid'] ?? $jid;
            log_envio('painel', $real, $tipo, envio_resumo($resumo), true, null, $id);
            out(['ok' => true, 'msg_id' => $id, 'jid' => $real]);
        }
        $msg = envio_erro_evo($code, is_array($r) ? $r : []);
        log_envio('painel', $jid, $tipo, envio_resumo($resumo), false, mb_substr($msg, 0, 200), null);
        out(['ok' => false, 'msg' => $msg], $code >= 400 && $code < 500 ? 422 : 502);
    }

    /** Executa um comando (sem shell) com timeout; devolve [código, stdout] ou [-1, ''] se estourar. */
    function envio_rodar(array $cmd, int $timeout): array {
        if (!function_exists('proc_open')) return [-1, '']; // desativada no PHP-FPM deste servidor
        $p = @proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        if (!is_resource($p)) return [-1, ''];
        stream_set_blocking($pipes[1], false);
        $saida = ''; $fim = microtime(true) + $timeout;
        while (true) {
            $st = proc_get_status($p);
            $saida .= (string)stream_get_contents($pipes[1]);
            if (!$st['running']) { $cod = $st['exitcode']; break; }
            if (microtime(true) > $fim) { proc_terminate($p, 9); $cod = -1; break; }
            usleep(50000);
        }
        $saida .= (string)stream_get_contents($pipes[1]);
        fclose($pipes[1]); proc_close($p);
        return [$cod, $saida];
    }
    /** ffprobe: [streams de áudio, streams de vídeo, codec do 1º áudio, duração s] ou null se ilegível. */
    function envio_sondar(string $arq): ?array {
        if (!function_exists('proc_open')) { // sem ffprobe: confere só a assinatura do arquivo (EBML = webm, ftyp = mp4/m4a, OggS, ID3/MPEG, ADTS)
            $h = (string)file_get_contents($arq, false, null, 0, 12);
            $okMagia = str_starts_with($h, "\x1A\x45\xDF\xA3") || substr($h, 4, 4) === 'ftyp' || str_starts_with($h, 'OggS')
                || str_starts_with($h, 'ID3') || (strlen($h) > 1 && (ord($h[0]) === 0xFF && (ord($h[1]) & 0xE0) === 0xE0));
            return $okMagia ? [1, 0, str_starts_with($h, 'OggS') ? 'opus' : '', 0.0] : null;
        }
        [$c, $o] = envio_rodar(['/usr/bin/ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name:format=duration', '-of', 'json', $arq], 15);
        $j = $c === 0 ? json_decode($o, true) : null;
        if (!is_array($j) || empty($j['streams'])) return null;
        $a = 0; $v = 0; $cod = '';
        foreach ($j['streams'] as $s) {
            if (($s['codec_type'] ?? '') === 'audio') { $a++; $cod = $cod ?: (string)($s['codec_name'] ?? ''); }
            elseif (($s['codec_type'] ?? '') === 'video') $v++;
        }
        return [$a, $v, $cod, (float)($j['format']['duration'] ?? 0)];
    }
    /** Converte áudio para ogg/opus mono; devolve o caminho temporário (quem chama apaga) ou null. */
    function envio_converter_audio(string $entrada, string $saida): bool {
        [$c] = envio_rodar(['/usr/bin/ffmpeg', '-nostdin', '-y', '-i', $entrada, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', $saida], 30);
        return $c === 0 && is_file($saida) && filesize($saida) > 0 && filesize($saida) <= 25 * 1024 * 1024;
    }
    /** Assinatura em mensagem separada (áudio/contato): "*Nome* enviou:". */
    function envio_linha_assinatura(string $jid): void {
        $l = assinatura_linha();
        if ($l !== '') evo('POST', '/message/sendText/' . rawurlencode(inst()), ['number' => $jid, 'text' => $l], 30);
    }
    function envio_exigir_post(): void {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'msg' => 'Método inválido'], 405);
    }
    function envio_registrar_erro_validacao(string $jid, string $tipo, string $resumo, string $msg): never {
        log_envio('painel', $jid, $tipo, envio_resumo($resumo), false, $msg, null);
        out(['ok' => false, 'msg' => $msg], 422);
    }
}

return [
    'enviar_texto' => function () {
        envio_exigir_post();
        $e = entrada();
        $jid = envio_jid_ou_erro((string)($e['para'] ?? ''));
        $texto = (string)($e['texto'] ?? '');
        if (trim($texto) === '') out(['ok' => false, 'msg' => 'Escreva a mensagem.'], 422);
        if (mb_strlen($texto) > 4096) out(['ok' => false, 'msg' => 'Mensagem muito longa (máximo 4096 caracteres).'], 422);
        $corpo = ['number' => $jid, 'text' => assinar($texto)];
        $dig = (int)($e['digitando_ms'] ?? 0);
        if ($dig > 0) $corpo['delay'] = min($dig, 10000);
        $citar = (string)($e['citar_id'] ?? '');
        if ($citar !== '') {
            if (!preg_match('/^[0-9A-Za-z_.-]{5,64}$/', $citar)) out(['ok' => false, 'msg' => 'Mensagem citada inválida.'], 422);
            $corpo['quoted'] = ['key' => ['id' => $citar]];
        }
        envio_executar($jid, 'texto', $texto, '/message/sendText', $corpo);
    },

    'enviar_midia' => function () {
        envio_exigir_post();
        $jid = envio_jid_ou_erro((string)($_POST['para'] ?? ''));
        $legenda = (string)($_POST['legenda'] ?? '');
        if (mb_strlen($legenda) > 1024) out(['ok' => false, 'msg' => 'Legenda muito longa (máximo 1024 caracteres).'], 422);
        $f = $_FILES['arquivo'] ?? null;
        if (!$f || !is_array($f) || is_array($f['name'] ?? null)) out(['ok' => false, 'msg' => 'Selecione um arquivo para enviar.'], 422);
        if ($f['error'] !== UPLOAD_ERR_OK) {
            $m = in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'Arquivo grande demais (máximo 25 MB).' : 'Falha no envio do arquivo. Tente de novo.';
            out(['ok' => false, 'msg' => $m], 422);
        }
        if (!is_uploaded_file($f['tmp_name'])) out(['ok' => false, 'msg' => 'Upload inválido.'], 422);
        $tam = (int)$f['size'];
        if ($tam <= 0) out(['ok' => false, 'msg' => 'O arquivo está vazio.'], 422);
        if ($tam > 25 * 1024 * 1024) out(['ok' => false, 'msg' => 'Arquivo grande demais (máximo 25 MB).'], 422);

        // whitelist: extensão => [mime, tipo]
        $perm = [
            'png' => ['image/png', 'imagem'], 'jpg' => ['image/jpeg', 'imagem'], 'jpeg' => ['image/jpeg', 'imagem'],
            'webp' => ['image/webp', 'imagem'], 'gif' => ['image/gif', 'imagem'],
            'mp4' => ['video/mp4', 'video'],
            'mp3' => ['audio/mpeg', 'audio'], 'ogg' => ['audio/ogg', 'audio'], 'oga' => ['audio/ogg', 'audio'], 'opus' => ['audio/ogg', 'audio'],
            'm4a' => ['audio/mp4', 'audio'], 'aac' => ['audio/aac', 'audio'], 'webm' => ['audio/webm', 'audio'],
            'pdf' => ['application/pdf', 'documento'], 'doc' => ['application/msword', 'documento'],
            'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'documento'],
            'xls' => ['application/vnd.ms-excel', 'documento'],
            'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'documento'],
            'txt' => ['text/plain', 'documento'], 'zip' => ['application/zip', 'documento'],
        ];
        $nome = basename(str_replace('\\', '/', (string)$f['name']));
        $nome = preg_replace('/[^\p{L}\p{N}._ ()-]/u', '_', $nome);
        $nome = mb_substr($nome, -100);
        $ext = strtolower(pathinfo($nome, PATHINFO_EXTENSION));
        if (!isset($perm[$ext])) envio_registrar_erro_validacao($jid, 'documento', $nome, 'Tipo de arquivo não permitido. Aceitos: png, jpg, webp, gif, mp4, mp3, ogg, m4a, aac, webm (áudio), pdf, doc(x), xls(x), txt, zip.');
        [$mime, $tipo] = $perm[$ext];
        $sonda = null;
        if ($ext === 'mp4' && str_starts_with((string)($f['type'] ?? ''), 'audio/')) { // Safari grava áudio como audio/mp4
            $sonda = envio_sondar($f['tmp_name']);
            if ($sonda && $sonda[0] > 0 && $sonda[1] === 0) { $mime = 'audio/mp4'; $tipo = 'audio'; }
        }

        // confere o conteúdo real contra a extensão (imagens/vídeo/pdf/áudio)
        $fi = new finfo(FILEINFO_MIME_TYPE);
        $real = (string)$fi->file($f['tmp_name']);
        $grupoReal = explode('/', $real)[0];
        if ($tipo === 'audio') { // webm/mp4 de áudio podem aparecer como video/*; confirma pelo ffprobe
            $sonda ??= envio_sondar($f['tmp_name']);
            if (!$sonda || $sonda[0] < 1 || $sonda[1] > 0) envio_registrar_erro_validacao($jid, 'audio', $nome, 'Não foi possível ler o áudio. Grave ou escolha outro arquivo.');
            if ($sonda[3] > 600) envio_registrar_erro_validacao($jid, 'audio', $nome, 'Áudio muito longo (máximo 10 minutos).');
            $real = 'audio/ok'; $grupoReal = 'audio';
        }
        $ok = match ($tipo) {
            'imagem' => $grupoReal === 'image',
            'video' => in_array($grupoReal, ['video'], true) || $real === 'application/octet-stream',
            'audio' => $grupoReal === 'audio' || in_array($real, ['video/ogg', 'application/ogg', 'video/mp4', 'application/octet-stream'], true),
            default => $ext !== 'pdf' || $real === 'application/pdf',
        };
        if (!$ok) envio_registrar_erro_validacao($jid, $tipo, $nome, 'O conteúdo do arquivo não corresponde à extensão .' . $ext . '.');

        $tmpAudio = null;
        $origem = $f['tmp_name'];
        if ($tipo === 'audio' && function_exists('proc_open') && !($sonda[2] === 'opus' && in_array($ext, ['ogg', 'oga', 'opus'], true))) {
            $dir = ZZ_DIR . '/cache/tmp';
            if (!is_dir($dir)) @mkdir($dir, 0700, true);
            $tmpAudio = $dir . '/a' . bin2hex(random_bytes(10)) . '.ogg';
            try { $conv = envio_converter_audio($f['tmp_name'], $tmpAudio); }
            catch (Throwable $t) { $conv = false; }
            if (!$conv) { @unlink($tmpAudio); envio_registrar_erro_validacao($jid, 'audio', $nome, 'Não foi possível converter o áudio.'); }
            $origem = $tmpAudio;
        }
        $bin = file_get_contents($origem);
        if ($tmpAudio) @unlink($tmpAudio);
        if ($bin === false) out(['ok' => false, 'msg' => 'Não foi possível ler o arquivo.'], 500);
        $b64 = base64_encode($bin);
        unset($bin);
        $resumo = $nome . ($legenda !== '' ? ' — ' . $legenda : '');

        if ($tipo === 'audio') {
            envio_linha_assinatura($jid);
            envio_executar($jid, 'audio', $resumo, '/message/sendWhatsAppAudio', ['number' => $jid, 'audio' => $b64, 'encoding' => true], 90);
        }
        $mt = ['imagem' => 'image', 'video' => 'video', 'documento' => 'document'][$tipo];
        $corpo = ['number' => $jid, 'mediatype' => $mt, 'mimetype' => $mime, 'fileName' => $nome, 'media' => $b64];
        $corpo['caption'] = assinar($legenda);
        envio_executar($jid, $tipo, $resumo, '/message/sendMedia', $corpo, 90);
    },

    'enviar_enquete' => function () {
        envio_exigir_post();
        $e = entrada();
        $jid = envio_jid_ou_erro((string)($e['para'] ?? ''));
        $perg = trim((string)($e['pergunta'] ?? ''));
        if ($perg === '') out(['ok' => false, 'msg' => 'Escreva a pergunta da enquete.'], 422);
        if (mb_strlen($perg) > 255) out(['ok' => false, 'msg' => 'Pergunta muito longa (máximo 255 caracteres).'], 422);
        $ops = [];
        foreach ((array)($e['opcoes'] ?? []) as $o) {
            $o = trim((string)$o);
            if ($o === '') continue;
            if (mb_strlen($o) > 100) out(['ok' => false, 'msg' => 'Cada opção pode ter no máximo 100 caracteres.'], 422);
            $ops[] = $o;
        }
        if (count($ops) !== count(array_unique($ops))) out(['ok' => false, 'msg' => 'As opções da enquete não podem se repetir.'], 422);
        if (count($ops) < 2) out(['ok' => false, 'msg' => 'A enquete precisa de pelo menos 2 opções.'], 422);
        if (count($ops) > 12) out(['ok' => false, 'msg' => 'A enquete aceita no máximo 12 opções.'], 422);
        $multi = !empty($e['multipla']);
        envio_executar($jid, 'enquete', 'Enquete: ' . $perg, '/message/sendPoll',
            ['number' => $jid, 'name' => assinar($perg), 'selectableCount' => $multi ? count($ops) : 1, 'values' => array_values($ops)]);
    },

    'enviar_localizacao' => function () {
        envio_exigir_post();
        $e = entrada();
        $jid = envio_jid_ou_erro((string)($e['para'] ?? ''));
        $lat = $e['lat'] ?? null; $lng = $e['lng'] ?? null;
        if (!is_numeric($lat) || !is_numeric($lng)) out(['ok' => false, 'msg' => 'Informe latitude e longitude válidas.'], 422);
        $lat = (float)$lat; $lng = (float)$lng;
        if ($lat < -90 || $lat > 90) out(['ok' => false, 'msg' => 'Latitude deve estar entre -90 e 90.'], 422);
        if ($lng < -180 || $lng > 180) out(['ok' => false, 'msg' => 'Longitude deve estar entre -180 e 180.'], 422);
        $nome = trim((string)($e['nome'] ?? '')); $end = trim((string)($e['endereco'] ?? ''));
        if (mb_strlen($nome) > 100 || mb_strlen($end) > 255) out(['ok' => false, 'msg' => 'Nome (até 100) ou endereço (até 255) muito longo.'], 422);
        envio_executar($jid, 'localizacao', 'Local: ' . ($nome !== '' ? $nome : "$lat,$lng"), '/message/sendLocation',
            ['number' => $jid, 'name' => assinar($nome !== '' ? $nome : 'Localização'), 'address' => $end !== '' ? $end : "$lat, $lng", 'latitude' => $lat, 'longitude' => $lng]);
    },

    'enviar_contato' => function () {
        envio_exigir_post();
        $e = entrada();
        $jid = envio_jid_ou_erro((string)($e['para'] ?? ''));
        $nome = trim((string)($e['nome'] ?? ''));
        if ($nome === '' || mb_strlen($nome) > 100) out(['ok' => false, 'msg' => 'Informe o nome do contato (até 100 caracteres).'], 422);
        $num = preg_replace('/\D/', '', (string)($e['numero'] ?? ''));
        if (!preg_match('/^\d{10,15}$/', $num)) out(['ok' => false, 'msg' => 'Número do contato inválido. Use DDI + DDD + número.'], 422);
        envio_linha_assinatura($jid);
        envio_executar($jid, 'contato', 'Contato: ' . $nome, '/message/sendContact',
            ['number' => $jid, 'contact' => [['fullName' => $nome, 'wuid' => $num, 'phoneNumber' => '+' . $num]]]);
    },

    'presenca' => function () {
        envio_exigir_post();
        $e = entrada();
        $jid = envio_jid_ou_erro((string)($e['para'] ?? ''));
        $tipo = (string)($e['tipo'] ?? 'composing');
        if (!in_array($tipo, ['composing', 'recording', 'paused'], true)) out(['ok' => false, 'msg' => 'Tipo de presença inválido.'], 422);
        $ms = max(500, min(15000, (int)($e['ms'] ?? 3000)));
        [$code, $r] = evo('POST', '/chat/sendPresence/' . rawurlencode(inst()), ['number' => $jid, 'presence' => $tipo, 'delay' => $ms], 25);
        if ($code >= 200 && $code < 300) out(['ok' => true, 'jid' => $jid]);
        out(['ok' => false, 'msg' => envio_erro_evo($code, is_array($r) ? $r : [])], 502);
    },

    'verificar_numero' => function () {
        envio_exigir_post();
        $e = entrada();
        $lista = [];
        foreach ((array)($e['numeros'] ?? []) as $n) {
            $d = preg_replace('/\D/', '', (string)$n);
            if ($d !== '' && !in_array($d, $lista, true)) $lista[] = $d;
        }
        if (!$lista) out(['ok' => false, 'msg' => 'Informe ao menos um número.'], 422);
        if (count($lista) > 50) out(['ok' => false, 'msg' => 'Verifique no máximo 50 números por vez.'], 422);
        foreach ($lista as $d) if (!preg_match('/^\d{8,15}$/', $d)) out(['ok' => false, 'msg' => "Número inválido: $d"], 422);
        [$code, $r] = evo('POST', '/chat/whatsappNumbers/' . rawurlencode(inst()), ['numbers' => $lista], 30);
        if ($code < 200 || $code >= 300 || !is_array($r)) out(['ok' => false, 'msg' => envio_erro_evo($code, is_array($r) ? $r : [])], 502);
        $por = [];
        foreach ($r as $it) {
            if (!is_array($it)) continue;
            $por[preg_replace('/\D/', '', (string)($it['number'] ?? ''))] = $it;
        }
        $res = [];
        foreach ($lista as $d) {
            $it = $por[$d] ?? null;
            if (!$it) { // a Evolution pode devolver o número sem o 9º dígito
                foreach ($por as $k => $v) if ($k !== '' && (str_starts_with($d, $k) || str_starts_with($k, $d))) { $it = $v; break; }
            }
            $res[] = ['numero' => $d, 'existe' => !empty($it['exists']), 'jid' => !empty($it['exists']) ? (string)($it['jid'] ?? '') : '', 'nome' => (string)($it['name'] ?? '')];
        }
        out(['ok' => true, 'resultados' => $res]);
    },
];
