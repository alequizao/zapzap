<?php
// Fila de campanhas: a cada minuto envia 1 a 3 mensagens por campanha respeitando intervalo aleatório, limite diário, janela de horário e conexão.
if (!function_exists('camp_chave')) { require __DIR__ . '/../api/campanhas.php'; }

if (!function_exists('camp_cron_pausar')) {
    function camp_cron_pausar(int $id, string $motivo): void { bd()->prepare("UPDATE campanhas SET status='pausada',pausa_motivo=? WHERE id=? AND status='enviando'")->execute([mb_substr($motivo, 0, 200), $id]); }

    function camp_cron_rodada(array $c, int $limite): void {
        $id = (int)$c['id']; $pdo = bd();
        usar_instancia((string)$c['instancia']);
        if (trim((string)$c['assinatura']) === '') { camp_cron_pausar($id, 'Campanha sem assinatura do autor'); return; }
        $h = camp_hora();
        if ($h < (int)$c['janela_inicio'] || $h >= (int)$c['janela_fim']) return;
        $lim = min((int)$c['limite_dia'], CAMP_LIMITE_DIA_MAX);
        if (camp_enviados_hoje($c['instancia']) >= $lim) return;
        $prox = (int)($c['proximo_envio'] ?? 0);
        if ($prox > time() && $prox > $limite) return;
        [$cs, $r] = evo('GET', '/instance/connectionState/' . rawurlencode($c['instancia']), null, 10);
        if ($cs === 200 && is_array($r) && isset($r['instance']['state']) && $r['instance']['state'] !== 'open') { camp_cron_pausar($id, 'A conexão do WhatsApp caiu'); return; }
        if ($cs !== 200) return; // Evolution fora do ar: tenta no próximo minuto
        $feitos = 0;
        while ($feitos < 3 && time() < $limite) {
            $fresh = $pdo->prepare('SELECT status,proximo_envio,falhas_seguidas FROM campanhas WHERE id=?'); $fresh->execute([$id]); $f = $fresh->fetch();
            if (!$f || $f['status'] !== 'enviando') return;
            if (camp_enviados_hoje($c['instancia']) >= $lim) return;
            $hh = camp_hora(); if ($hh < (int)$c['janela_inicio'] || $hh >= (int)$c['janela_fim']) return;
            $q = $pdo->prepare("SELECT * FROM campanha_envios WHERE campanha_id=? AND status='pendente' ORDER BY id LIMIT 1"); $q->execute([$id]); $e = $q->fetch();
            if (!$e) { camp_cron_concluir($id); return; }
            $prox = (int)($f['proximo_envio'] ?? 0);
            if ($prox > time()) { $esp = $prox - time(); if (time() + $esp > $limite) return; sleep($esp); }
            // contato pode ter pedido para sair depois do início
            $q = $pdo->prepare('SELECT variaveis,optout FROM lista_contatos WHERE lista_id=? AND jid=?'); $q->execute([$c['lista_id'], $e['jid']]); $lc = $q->fetch() ?: ['variaveis' => null, 'optout' => 0];
            $opt = camp_optout_chaves($c['instancia']);
            if ((int)$lc['optout'] === 1 || isset($opt[camp_chave(camp_numero_do_jid($e['jid']))])) {
                $pdo->prepare("UPDATE campanha_envios SET status='ignorado',erro='Pediu para sair' WHERE id=?")->execute([$e['id']]); continue;
            }
            if ((int)$e['tentativas'] >= 1) { // envio interrompido antes: não reenviar para evitar duplicidade
                $pdo->prepare("UPDATE campanha_envios SET status='falha',erro='Envio interrompido (não reenviado)',enviado_em=? WHERE id=?")->execute([time(), $e['id']]); continue;
            }
            $pdo->prepare('UPDATE campanha_envios SET tentativas=tentativas+1 WHERE id=?')->execute([$e['id']]);
            $vars = json_decode((string)$lc['variaveis'], true) ?: [];
            $jid = (string)$e['jid']; $ok = false; $msgId = null; $erro = null;
            if ($c['tipo'] === 'texto') {
                $txt = assinar(camp_render((string)$c['texto'], (string)$e['nome'], $vars), $c['assinatura']);
                [$ok, $msgId, $erro] = zz_enviar_texto($jid, $txt, ['origem' => 'campanha', 'digitando_ms' => random_int(1500, 4000)]);
            } else {
                $p = ZZ_DIR . '/anexos/' . basename((string)$c['arquivo']);
                if (!is_file($p)) { camp_cron_pausar($id, 'Arquivo da campanha não encontrado'); $pdo->prepare('UPDATE campanha_envios SET tentativas=0 WHERE id=?')->execute([$e['id']]); return; }
                $mime = (string)$c['mime']; $g = explode('/', $mime)[0];
                $tipo = $g === 'image' ? 'image' : ($g === 'video' ? 'video' : ($g === 'audio' ? 'audio' : 'document'));
                $leg = assinar(camp_render((string)$c['legenda'], (string)$e['nome'], $vars), $c['assinatura']);
                $b64 = base64_encode((string)file_get_contents($p));
                if ($tipo === 'audio') {
                    [$ok0, , $erro] = zz_enviar_texto($jid, assinatura_linha($c['assinatura']), ['origem' => 'campanha']);
                    if ($ok0) [$ok, $msgId, $erro] = zz_enviar_midia($jid, 'audio', $b64, $mime, (string)$c['nome_arquivo'], '', 'campanha');
                } else {
                    [$ok, $msgId, $erro] = zz_enviar_midia($jid, $tipo, $b64, $mime, (string)$c['nome_arquivo'], $leg, 'campanha');
                }
                unset($b64);
            }
            $feitos++;
            if ($ok) {
                $pdo->prepare("UPDATE campanha_envios SET status='enviado',enviado_em=?,msg_id=?,erro=NULL WHERE id=?")->execute([time(), $msgId, $e['id']]);
                $pdo->prepare('UPDATE campanhas SET enviados=enviados+1,falhas_seguidas=0 WHERE id=?')->execute([$id]);
            } else {
                $pdo->prepare("UPDATE campanha_envios SET status='falha',enviado_em=?,erro=? WHERE id=?")->execute([time(), mb_substr((string)$erro, 0, 300), $e['id']]);
                $pdo->prepare('UPDATE campanhas SET falhas=falhas+1,falhas_seguidas=falhas_seguidas+1 WHERE id=?')->execute([$id]);
                if ((int)$f['falhas_seguidas'] + 1 >= 5) { camp_cron_pausar($id, 'Pausada sozinha: 5 falhas seguidas'); return; }
            }
            $pdo->prepare('UPDATE campanhas SET proximo_envio=? WHERE id=?')->execute([time() + random_int((int)$c['intervalo_min_s'], (int)$c['intervalo_max_s']), $id]);
        }
        $q = $pdo->prepare("SELECT COUNT(*) FROM campanha_envios WHERE campanha_id=? AND status='pendente'"); $q->execute([$id]);
        if ((int)$q->fetchColumn() === 0) camp_cron_concluir($id);
    }
    function camp_cron_concluir(int $id): void {
        bd()->prepare("UPDATE campanhas SET status='concluida',concluida_em=?,pausa_motivo=NULL WHERE id=? AND status='enviando'")->execute([time(), $id]);
    }
}

return function (): void {
    $limite = time() + 34; $pdo = bd();
    // agendadas que chegaram na hora
    $q = $pdo->prepare("SELECT * FROM campanhas WHERE status='agendada' AND agendada_para<=? ORDER BY agendada_para");
    $q->execute([time()]);
    foreach ($q->fetchAll() as $c) {
        if (camp_outra_enviando((string)$c['instancia'], (int)$c['id'])) continue;
        $pdo->prepare("UPDATE campanhas SET status='enviando',iniciada_em=?,proximo_envio=NULL WHERE id=? AND status='agendada'")->execute([time(), $c['id']]);
    }
    $rs = $pdo->query("SELECT * FROM campanhas WHERE status='enviando' ORDER BY id")->fetchAll();
    $vistas = [];
    foreach ($rs as $c) {
        if (time() >= $limite) break;
        if (isset($vistas[$c['instancia']])) continue; // no máximo 1 campanha por conexão
        $vistas[$c['instancia']] = 1;
        try { camp_cron_rodada($c, $limite); } catch (Throwable $e) { @error_log('[zapzap cron campanhas] #' . $c['id'] . ': ' . $e->getMessage()); }
    }
};
