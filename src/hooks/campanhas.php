<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// Descadastro: quem responder SAIR/PARAR a uma campanha fica optout e nunca mais recebe (em nenhuma lista da conexão).
if (!function_exists('camp_chave')) { require __DIR__ . '/../api/campanhas.php'; }

return [
    'messages.upsert' => function (array $ctx): void {
        try {
            $m = $ctx['msg'] ?? null;
            if (!$m || !empty($m['de_mim']) || !empty($m['grupo']) || ($m['tipo'] ?? '') !== 'texto') return;
            $t = camp_norm_texto((string)$m['texto']);
            if ($t === '' || mb_strlen($t) > 30 || !in_array($t, ['sair', 'parar', 'pare', 'stop', 'descadastrar', 'sair da lista', 'parar de receber', 'quero sair'], true)) return;
            $inst = (string)$ctx['instancia']; $jid = (string)$m['jid'];
            $k = $ctx['dados']['key'] ?? [];
            foreach ([$k['senderPn'] ?? '', $k['remoteJidAlt'] ?? '', $jid] as $cand) { if (is_string($cand) && camp_jid_valido($cand)) { $jid = $cand; break; } }
            if (!camp_jid_valido($jid)) return; // @lid sem número real: não dá para identificar
            $chave = camp_chave(camp_numero_do_jid($jid)); $jids = camp_jids_da_chave($chave);
            $in = implode(',', array_fill(0, count($jids), '?'));
            $pdo = bd();
            $q = $pdo->prepare("SELECT 1 FROM lista_contatos lc JOIN listas l ON l.id=lc.lista_id WHERE l.instancia=? AND lc.jid IN ($in) LIMIT 1"); $q->execute(array_merge([$inst], $jids));
            $conhecido = (bool)$q->fetchColumn();
            if (!$conhecido) { $q = $pdo->prepare("SELECT 1 FROM campanha_envios e JOIN campanhas c ON c.id=e.campanha_id WHERE c.instancia=? AND e.jid IN ($in) LIMIT 1"); $q->execute(array_merge([$inst], $jids)); $conhecido = (bool)$q->fetchColumn(); }
            if (!$conhecido) return;
            $pdo->prepare('INSERT IGNORE INTO campanha_optouts (instancia,chave,jid,quando) VALUES (?,?,?,?)')->execute([$inst, $chave, $jid, time()]);
            $pdo->prepare("UPDATE lista_contatos lc JOIN listas l ON l.id=lc.lista_id SET lc.optout=1 WHERE l.instancia=? AND lc.jid IN ($in)")->execute(array_merge([$inst], $jids));
            $pdo->prepare("UPDATE campanha_envios e JOIN campanhas c ON c.id=e.campanha_id SET e.status='ignorado', e.erro='Pediu para sair' WHERE c.instancia=? AND e.status='pendente' AND e.jid IN ($in)")->execute(array_merge([$inst], $jids));
        } catch (Throwable $e) { @error_log('[zapzap hook campanhas] ' . $e->getMessage()); }
    },
];
