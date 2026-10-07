<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — Filas e atendimento: biblioteca comum (api/cron também a carregam com require_once) + hook do webhook.
const FILAS_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

if (!function_exists('filas_aberta')) {
    /** Fila aberta no instante $ts (fuso Maceió)? horario vazio/nulo = sempre aberta. Formato: {"seg":[["08:00","12:00"],…],…} */
    function filas_aberta(?string $horarioJson, ?int $ts = null): bool {
        $h = $horarioJson ? json_decode($horarioJson, true) : null;
        if (!is_array($h) || !$h) return true;
        $d = new DateTime('@' . ($ts ?? time())); $d->setTimezone(new DateTimeZone('America/Maceio'));
        $faixas = $h[FILAS_DIAS[(int)$d->format('w')]] ?? [];
        $agora = $d->format('H:i');
        foreach ((array)$faixas as $f) if (is_array($f) && count($f) === 2 && $agora >= $f[0] && $agora < $f[1]) return true;
        return false;
    }
    /** Cor pelo tempo de espera (s) e limites em minutos [verde, amarelo, laranja]. */
    function filas_cor(int $s, array $lim = [5, 15, 30]): string {
        return $s <= $lim[0] * 60 ? 'verde' : ($s <= $lim[1] * 60 ? 'amarelo' : ($s <= $lim[2] * 60 ? 'laranja' : 'vermelho'));
    }
    function filas_limites(?array $f): array { return $f ? [(int)$f['sla_verde_min'], (int)$f['sla_amarelo_min'], (int)$f['sla_laranja_min']] : [5, 15, 30]; }
    function filas_evento(int $atId, string $tipo, string $detalhe = '', ?int $uid = null): void {
        bd()->prepare('INSERT INTO atendimento_eventos (atendimento_id,ts,usuario_id,tipo,detalhe) VALUES (?,?,?,?,?)')
            ->execute([$atId, time(), $uid, $tipo, mb_substr($detalhe, 0, 300)]);
    }
    function filas_numero_fmt(string $jid): string {
        $num = preg_replace('/\D/', '', explode('@', $jid)[0]);
        if (preg_match('/^55(\d\d)(9?\d{4})(\d{4})$/', $num, $m)) return "+55 ($m[1]) $m[2]-$m[3]";
        return $num !== '' ? '+' . $num : $jid;
    }
    function filas_nome_cache(string $jid): string {
        $f = cache_arq('contatos.json'); $j = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        if (!is_array($j)) return '';
        $l = isset($j['contatos']) && is_array($j['contatos']) ? $j['contatos'] : $j;
        $v = $l[$jid] ?? null; if (is_array($v) && !empty($v['nome'])) return (string)$v['nome'];
        foreach ($l as $k => $v) if (is_array($v) && ($v['jid'] ?? $k) === $jid && !empty($v['nome'])) return (string)$v['nome'];
        return '';
    }
    function filas_trecho(array $m): string {
        $t = trim(preg_replace('/\s+/', ' ', (string)$m['texto']));
        if ($t === '') $t = ['imagem' => '📷 Imagem', 'video' => '🎥 Vídeo', 'audio' => '🎤 Áudio', 'documento' => '📄 Documento', 'figurinha' => 'Figurinha', 'contato' => 'Contato', 'localizacao' => '📍 Localização', 'enquete' => 'Enquete'][$m['tipo']] ?? 'Mensagem';
        return mb_substr($t, 0, 120);
    }
}

if (!function_exists('filas_hook_msg')) {
    function filas_hook_msg(array $ctx): void {
        $m = $ctx['msg'] ?? null; if (!$m || $m['grupo'] || $m['id'] === '') return;
        $jid = $m['jid']; if (str_contains($jid, 'broadcast') || str_ends_with($jid, '@newsletter') || !str_contains($jid, '@')) return;
        $inst = $ctx['instancia']; $pdo = bd(); $agora = time(); $trecho = filas_trecho($m);
        $q = $pdo->prepare("SELECT * FROM atendimentos WHERE instancia=? AND jid=? AND status<>'resolvido' ORDER BY id DESC LIMIT 1");
        $q->execute([$inst, $jid]); $at = $q->fetch();

        if ($m['de_mim']) { // enviada por nós (painel/celular/sistema): só atualiza o atendimento aberto
            if (!$at || $at['ultima_msg_id'] === $m['id']) return;
            $auto = $at['auto_msg_id'] !== null && $at['auto_msg_id'] === $m['id'];
            if (!$auto && $at['pend_desde'] !== null) { // resposta ao cliente: guarda o tempo de espera e a cor
                $q = $pdo->prepare('SELECT * FROM filas WHERE id=?'); $q->execute([(int)$at['fila_id']]); $fl = $q->fetch() ?: null;
                $seg = max(0, $agora - (int)$at['pend_desde']);
                $pdo->prepare('INSERT INTO atendimento_eventos (atendimento_id,ts,usuario_id,tipo,detalhe,resposta_s,cor) VALUES (?,?,?,?,?,?,?)')
                    ->execute([$at['id'], $agora, $at['usuario_id'], 'resposta', 'respondido em ' . ($seg >= 60 ? intdiv($seg, 60) . ' min' : $seg . ' s'), $seg, filas_cor($seg, filas_limites($fl))]);
                $pdo->prepare('UPDATE atendimentos SET pend_desde=NULL, sla_notif=0 WHERE id=?')->execute([$at['id']]);
            }
            $pdo->prepare('UPDATE atendimentos SET ultima_msg_ts=?, ultima_msg_texto=?, ultima_msg_id=?, atualizado=?, nao_lidas=IF(?,nao_lidas,0), primeira_resp_em=IF(?, primeira_resp_em, COALESCE(primeira_resp_em, IF(usuario_id IS NULL, NULL, ?))) WHERE id=?')
                ->execute([$m['ts'], $trecho, $m['id'], $agora, $auto ? 1 : 0, $auto ? 1 : 0, $agora, $at['id']]);
            return;
        }
        if ($at && $at['ultima_msg_id'] === $m['id']) return; // dedupe

        $nome = trim($m['nome']); if ($nome === '') $nome = filas_nome_cache($jid);
        $nova = false;
        if ($at) {
            $pdo->prepare('UPDATE atendimentos SET ultima_msg_ts=?, ultima_msg_texto=?, ultima_msg_id=?, atualizado=?, nao_lidas=nao_lidas+1, pend_desde=COALESCE(pend_desde, ?), nome_contato=IF(nome_contato=\'\', ?, nome_contato) WHERE id=?')
                ->execute([$m['ts'], $trecho, $m['id'], $agora, $agora, $nome, $at['id']]);
            return;
        }
        $q = $pdo->prepare("SELECT * FROM atendimentos WHERE instancia=? AND jid=? AND status='resolvido' AND encerrado_em > ? ORDER BY id DESC LIMIT 1");
        $q->execute([$inst, $jid, $agora - 86400]); $rec = $q->fetch();
        if ($rec) { // reabre resolvido recente
            if ($rec['ultima_msg_id'] === $m['id']) return;
            $pdo->prepare("UPDATE atendimentos SET status='aguardando', usuario_id=NULL, encerrado_em=NULL, espera_desde=?, atrasado=0, sla_notif=0, pend_desde=?, ultima_msg_ts=?, ultima_msg_texto=?, ultima_msg_id=?, atualizado=?, nao_lidas=1 WHERE id=?")
                ->execute([$agora, $agora, $m['ts'], $trecho, $m['id'], $agora, $rec['id']]);
            filas_evento((int)$rec['id'], 'reabriu', 'nova mensagem do contato');
            $id = (int)$rec['id']; $filaId = $rec['fila_id']; $enviada = (int)$rec['saudacao_enviada'];
        } else {
            $q = $pdo->prepare('SELECT id FROM filas WHERE instancia=? AND ativa=1 AND padrao=1 ORDER BY ordem, id LIMIT 1'); $q->execute([$inst]);
            $filaId = $q->fetchColumn() ?: null;
            $pdo->prepare("INSERT INTO atendimentos (instancia,jid,nome_contato,fila_id,status,origem,criado,atualizado,espera_desde,pend_desde,ultima_msg_ts,ultima_msg_texto,ultima_msg_id,nao_lidas) VALUES (?,?,?,?,'aguardando','mensagem',?,?,?,?,?,?,?,1)")
                ->execute([$inst, $jid, mb_substr($nome, 0, 120), $filaId, $agora, $agora, $agora, $agora, $m['ts'], $trecho, $m['id']]);
            $id = (int)$pdo->lastInsertId(); $enviada = 0;
            filas_evento($id, 'criou', 'mensagem recebida');
        }
        if (!$filaId) return;
        $q = $pdo->prepare('SELECT * FROM filas WHERE id=? AND ativa=1'); $q->execute([$filaId]); $f = $q->fetch(); if (!$f) return;
        // anti-spam: no máximo 3 respostas automáticas por contato por hora
        $q = $pdo->prepare("SELECT COUNT(*) FROM atendimento_eventos e JOIN atendimentos a ON a.id=e.atendimento_id WHERE a.instancia=? AND a.jid=? AND e.tipo LIKE 'auto\\_%' AND e.ts > ?");
        $q->execute([$inst, $jid, $agora - 3600]); if ((int)$q->fetchColumn() >= 3) return;
        $texto = null; $tipo = '';
        if (!filas_aberta($f['horario'])) {
            $q = $pdo->prepare("SELECT COUNT(*) FROM atendimento_eventos e JOIN atendimentos a ON a.id=e.atendimento_id WHERE a.instancia=? AND a.jid=? AND e.tipo='auto_ausencia' AND e.ts > ?");
            $q->execute([$inst, $jid, $agora - 6 * 3600]);
            if (trim((string)$f['mensagem_ausencia']) !== '' && (int)$q->fetchColumn() === 0) { $texto = (string)$f['mensagem_ausencia']; $tipo = 'auto_ausencia'; }
        } elseif (!$enviada && trim((string)$f['saudacao']) !== '') { $texto = (string)$f['saudacao']; $tipo = 'auto_saudacao'; }
        if ($texto === null) return;
        $pdo->prepare('UPDATE atendimentos SET saudacao_enviada=1 WHERE id=?')->execute([$id]);
        $primeiro = trim(explode(' ', $nome)[0] ?? '');
        $texto = str_replace(['{nome}', '{fila}'], [$primeiro !== '' ? $primeiro : 'tudo bem', (string)$f['nome']], $texto);
        [$ok, $msgId] = zz_enviar_texto($jid, $texto, ['origem' => 'fila', 'digitando_ms' => 1500]);
        if ($ok) {
            if ($msgId) $pdo->prepare('UPDATE atendimentos SET auto_msg_id=? WHERE id=?')->execute([$msgId, $id]);
            filas_evento($id, $tipo, 'fila ' . $f['nome']);
        }
    }
}

return [
    'messages.upsert' => 'filas_hook_msg',
    'send.message' => 'filas_hook_msg',
];
