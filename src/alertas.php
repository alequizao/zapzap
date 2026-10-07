<?php
// Alertas por e-mail (SMTP direto, sem bibliotecas) e monitor de conexões. Dono: núcleo.
// A configuração fica em ZZ_DIR/config.php (chaves 'smtp' e 'email_dev'); nunca em arquivos versionados.
require_once __DIR__ . '/lib.php';

/** Envia e-mail HTML (com versão texto) por SMTP SSL. Devolve true/false; nunca lança exceção. */
function enviar_email(string $para, string $assunto, string $html, string $texto = ''): bool {
    $c = cfg()['smtp'] ?? null; if (!$c || !filter_var($para, FILTER_VALIDATE_EMAIL)) return false;
    try {
        $f = @stream_socket_client('ssl://' . $c['host'] . ':' . $c['porta'], $en, $es, 12, STREAM_CLIENT_CONNECT);
        if (!$f) return false; stream_set_timeout($f, 12);
        $lê = function () use ($f) { $r = ''; while (($l = fgets($f, 515)) !== false) { $r .= $l; if (isset($l[3]) && $l[3] === ' ') break; } return $r; };
        $cmd = function (string $x, string $esp) use ($f, $lê) { fwrite($f, $x . "\r\n"); $r = $lê(); return str_starts_with($r, $esp); };
        $lê();
        if (!$cmd('EHLO alequizao.com', '250') || !$cmd('AUTH LOGIN', '334') || !$cmd(base64_encode($c['usuario']), '334') || !$cmd(base64_encode($c['senha']), '235')) { fclose($f); return false; }
        if (!$cmd('MAIL FROM:<' . $c['de'] . '>', '250') || !$cmd('RCPT TO:<' . $para . '>', '25') || !$cmd('DATA', '354')) { fclose($f); return false; }
        $b = 'zz' . bin2hex(random_bytes(8)); $enc = fn($t) => chunk_split(base64_encode($t));
        $msg = "From: =?UTF-8?B?" . base64_encode($c['nome']) . "?= <{$c['de']}>\r\nTo: <$para>\r\nSubject: =?UTF-8?B?" . base64_encode($assunto) . "?=\r\nDate: " . date('r') . "\r\nMessage-ID: <" . bin2hex(random_bytes(8)) . "@alequizao.com>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"$b\"\r\n\r\n"
             . "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $enc($texto !== '' ? $texto : trim(strip_tags(preg_replace('/<br\s*\/?>|<\/p>/i', "\n", $html)))) 
             . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $enc($html) . "--$b--\r\n";
        fwrite($f, str_replace("\r\n.", "\r\n..", $msg) . "\r\n.\r\n"); $ok = str_starts_with($lê(), '250'); $cmd('QUIT', '221'); fclose($f); return $ok;
    } catch (Throwable $e) { @error_log('[zapzap] email: ' . $e->getMessage()); return false; }
}
function kv_get(string $k): ?string { $q = bd()->prepare('SELECT valor FROM config_kv WHERE chave=?'); $q->execute([$k]); $v = $q->fetchColumn(); return $v === false ? null : (string)$v; }
function kv_set(string $k, string $v): void { bd()->prepare('INSERT INTO config_kv (chave,valor,atualizado) VALUES (?,?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor), atualizado=VALUES(atualizado)')->execute([$k, $v, time()]); }

/** Modelo do e-mail de alerta (identidade visual do painel). */
function email_modelo(string $titulo, string $cor, string $corpo, string $botao = '', string $url = ''): string {
    $b = $botao !== '' ? "<p style=\"margin:22px 0 0\"><a href=\"" . htmlspecialchars($url) . "\" style=\"background:#2563EB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block\">" . htmlspecialchars($botao) . "</a></p>" : '';
    return "<div style=\"background:#F5F5F5;padding:24px 12px;font-family:Inter,Arial,sans-serif\"><div style=\"max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(20,30,60,.08)\"><div style=\"background:$cor;color:#fff;padding:18px 22px;font-size:18px;font-weight:700\">" . htmlspecialchars($titulo) . "</div><div style=\"padding:22px;color:#333;font-size:15px;line-height:1.55\">$corpo$b</div><div style=\"padding:14px 22px;background:#fafafa;color:#888;font-size:12px\">ZapZap — Painel de WhatsApp do Alequizão · enviado automaticamente</div></div></div>";
}

/** Avisa por e-mail (e na central) quando uma conexão cai ou volta. $estado: open|close|connecting. Evita repetição (30 min) e oscilação. */
function conexao_alertar(string $inst, string $estado, string $origem = 'monitor'): void {
    $ant = kv_get('cx_estado_' . $inst) ?? 'open'; $aberta = $estado === 'open'; $antAberta = $ant === 'open';
    if ($aberta === $antAberta) { if ($aberta) kv_set('cx_estado_' . $inst, 'open'); return; }
    $apelido = registro()[$inst]['apelido'] ?? $inst; $hora = date('d/m/Y H:i'); $dev = cfg()['email_dev'] ?? ''; if ($dev === '') return;
    $url = url_base() . '/#/conexoes';
    if (!$aberta) {
        $ult = (int)(kv_get('cx_email_' . $inst) ?? 0);
        if (time() - $ult < 1800) { kv_set('cx_estado_' . $inst, $estado); return; }
        kv_set('cx_estado_' . $inst, $estado); kv_set('cx_email_' . $inst, (string)time());
        notificar('conexao', 'WhatsApp desconectado: ' . $apelido, 'A conexão caiu. Toque para reconectar.', ['rota' => 'conexoes', 'ref' => 'desc' . intdiv(time(), 600), 'instancia' => $inst]);
        enviar_email($dev, '⚠️ WhatsApp desconectado — ' . $apelido, email_modelo('WhatsApp desconectado', '#d9433a',
            "<p>A conexão <b>" . htmlspecialchars($apelido) . "</b> (<code>" . htmlspecialchars($inst) . "</code>) foi desconectada em <b>$hora</b> (horário de Maceió).</p><p>Enquanto estiver fora, as mensagens não chegam ao painel e os envios (agendados, campanhas, automações e chatbot) falham.</p><p style=\"color:#777\">Origem da detecção: $origem. Se a desconexão foi feita por você no painel, pode ignorar este aviso.</p>", 'Reconectar agora', $url));
    } else {
        kv_set('cx_estado_' . $inst, 'open');
        notificar('conexao', 'WhatsApp reconectado: ' . $apelido, 'A conexão foi restabelecida.', ['rota' => 'conexoes', 'ref' => 'ok' . intdiv(time(), 600), 'instancia' => $inst]);
        if ((int)(kv_get('cx_email_' . $inst) ?? 0) > 0) enviar_email($dev, '✅ WhatsApp reconectado — ' . $apelido, email_modelo('WhatsApp reconectado', '#1e9e57', "<p>A conexão <b>" . htmlspecialchars($apelido) . "</b> voltou a funcionar em <b>$hora</b>.</p>", 'Abrir o painel', $url));
    }
}
