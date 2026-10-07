<?php
// Conexões: (1) sincronização completa pendente após conectar; (2) download de mídias em fundo (5 itens por minuto, limite 500 MB por conexão).
return function (): void {
    api_carregar();
    foreach (registro() as $n => $r) {
        if (!nome_instancia_ok((string)$n) || !empty($r['protegida'])) continue;
        $st = cx_sync_ler($n);
        if (!empty($r['sync_pendente'])) {
            [$c, $s] = evo_chave($r['token'] ?: (cfg()['chave_global'] ?? ''), 'GET', "/instance/connectionState/$n", null, 8);
            if (($s['instance']['state'] ?? '') === 'open' && (!$st || ($st['estado'] ?? '') !== 'rodando')) { cx_sincronizar($n, (int)($r['sync_midias_dias'] ?? 0)); continue; }
        }
        if (!empty($st['midias']['ativo']) && empty($st['midias']['cancelado'])) cx_midias_passo($n, 5);
    }
};
