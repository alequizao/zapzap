<?php
// Filas e atendimento: SLA (marca atrasado) e aviso quando o tempo de espera passa do limite laranja (vermelho).
require_once __DIR__ . '/../hooks/filas.php';
return function (): void {
    $pdo = bd(); $agora = time();
    $q = $pdo->prepare("SELECT a.id FROM atendimentos a JOIN filas f ON f.id=a.fila_id WHERE a.status='aguardando' AND a.atrasado=0 AND f.sla_min>0 AND (? - a.espera_desde) > f.sla_min*60 LIMIT 200");
    $q->execute([$agora]);
    foreach ($q->fetchAll() as $r) {
        $pdo->prepare("UPDATE atendimentos SET atrasado=1 WHERE id=? AND status='aguardando'")->execute([$r['id']]);
        filas_evento((int)$r['id'], 'atrasado', 'passou do tempo limite (SLA) da fila');
    }
    $pdo->exec("UPDATE atendimentos SET atrasado=0 WHERE atrasado=1 AND status<>'aguardando'");
    // vermelho: espera acima do limite laranja (padrão 30 min sem fila) — avisa uma vez por espera
    $q = $pdo->prepare("SELECT a.id, a.instancia, a.jid, a.nome_contato, a.usuario_id FROM atendimentos a LEFT JOIN filas f ON f.id=a.fila_id
        WHERE a.status<>'resolvido' AND a.pend_desde IS NOT NULL AND a.sla_notif=0 AND (? - a.pend_desde) > COALESCE(f.sla_laranja_min, 30)*60 LIMIT 100");
    $q->execute([$agora]);
    foreach ($q->fetchAll() as $r) {
        $u = $pdo->prepare('UPDATE atendimentos SET sla_notif=1 WHERE id=? AND sla_notif=0'); $u->execute([$r['id']]); if (!$u->rowCount()) continue;
        $nome = $r['nome_contato'] !== '' ? $r['nome_contato'] : filas_numero_fmt($r['jid']);
        $o = ['jid' => $r['jid'], 'rota' => 'filas', 'ref' => 'sla' . $r['id'], 'instancia' => $r['instancia']];
        if ($r['usuario_id']) $o['usuario_id'] = (int)$r['usuario_id']; else $o['perm'] = 'filas.atender';
        notificar('atendimento', 'Atendimento atrasado', $nome, $o);
    }
};
