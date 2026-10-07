<?php
// Monitor: confere o estado de todas as conexões a cada minuto e avisa por e-mail quando uma cair/voltar. Dono: núcleo.
return function (): void {
    require_once __DIR__ . '/../alertas.php';
    [$c, $r] = evo_global('GET', '/instance/fetchInstances', null, 15);
    if ($c !== 200 || !is_array($r)) return;
    foreach ($r as $i) {
        $n = $i['name'] ?? ''; if (!nome_instancia_ok($n)) continue;
        $est = (string)($i['connectionStatus'] ?? 'close');
        // só considera "caiu" depois de 2 verificações seguidas (evita falso alarme em reconexões rápidas)
        $k = 'cx_visto_' . $n; $ant = kv_get($k); kv_set($k, $est);
        if ($est === 'open' || $ant === $est) { usar_instancia($n); conexao_alertar($n, $est === 'open' ? 'open' : 'close', 'monitor a cada minuto'); }
    }
};
