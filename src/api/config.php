<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Configurações (back-end): perfil, settings da instância, QR, reinício e troca de senha.
// Nunca devolve token nem hash.

if (!function_exists('cfgx_estado')) {
    /** Estado da conexão da instância (open|close|connecting|desconhecido). */
    function cfgx_estado(): string {
        [, $e] = evo('GET', '/instance/connectionState/' . inst(), null, 10);
        return (string)($e['instance']['state'] ?? 'desconhecido');
    }

    /** Settings atuais da instância, normalizados (só os campos do contrato). */
    function cfgx_settings(): ?array {
        [$c, $s] = evo('GET', '/settings/find/' . inst(), null, 10);
        if ($c !== 200 || !is_array($s) || !array_key_exists('rejectCall', $s)) return null;
        return [
            'rejectCall' => (bool)$s['rejectCall'], 'msgCall' => (string)($s['msgCall'] ?? ''),
            'groupsIgnore' => (bool)($s['groupsIgnore'] ?? false), 'alwaysOnline' => (bool)($s['alwaysOnline'] ?? false),
            'readMessages' => (bool)($s['readMessages'] ?? false), 'readStatus' => (bool)($s['readStatus'] ?? false),
            'syncFullHistory' => (bool)($s['syncFullHistory'] ?? false),
        ];
    }

    /** Mensagem de erro amigável a partir da resposta da Evolution. */
    function cfgx_erro(int $c, array $r, string $padrao): string {
        $m = $r['response']['message'] ?? ($r['message'] ?? ($r['erro'] ?? ''));
        if (is_array($m)) $m = implode('; ', array_map(fn($x) => is_scalar($x) ? (string)$x : '', $m));
        $m = trim((string)$m);
        return $c === 0 ? 'Evolution API sem resposta. Tente de novo.' : ($padrao . ($m !== '' ? ': ' . mb_substr($m, 0, 160) : ''));
    }
}

return [
    'config_info' => function () {
        $i = inst();
        $estado = cfgx_estado();
        [, $f] = evo('GET', "/instance/fetchInstances?instanceName=$i", null, 10);
        $f = $f[0] ?? [];
        $numero = preg_replace('/\D/', '', explode('@', (string)($f['ownerJid'] ?? ''))[0]);
        $status = '';
        if ($numero !== '') {
            [$c, $p] = evo('POST', "/chat/fetchProfile/$i", ['number' => $numero], 12);
            if ($c === 200) {
                $s = $p['status'] ?? '';
                $status = trim((string)(is_array($s) ? ($s['status'] ?? '') : $s));
            }
        }
        [, $v] = evo('GET', '/', null, 6);
        out(['ok' => true, 'estado' => $estado,
             'perfil' => ['nome' => (string)($f['profileName'] ?? ''), 'status' => $status, 'foto' => (string)($f['profilePicUrl'] ?? ''), 'numero' => $numero],
             'settings' => cfgx_settings(),
             'servidor' => ['versao_evolution' => (string)($v['version'] ?? ''), 'versao_painel' => ZZ_VERSAO]]);
    },

    'config_salvar' => function () {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'msg' => 'Método inválido'], 405);
        $novo = entrada()['settings'] ?? null;
        if (!is_array($novo)) out(['ok' => false, 'msg' => 'Configurações ausentes'], 400);
        $atual = cfgx_settings();
        if (!$atual) out(['ok' => false, 'msg' => 'Não foi possível ler as configurações atuais da instância'], 502);
        $final = $atual;
        foreach ($atual as $k => $_) {
            if (!array_key_exists($k, $novo)) continue;
            if ($k === 'msgCall') {
                if (!is_string($novo[$k])) out(['ok' => false, 'msg' => 'Mensagem de chamada inválida'], 400);
                $m = trim($novo[$k]);
                if (mb_strlen($m) > 300) out(['ok' => false, 'msg' => 'A mensagem de chamada pode ter no máximo 300 caracteres'], 400);
                $final[$k] = $m;
            } else {
                $b = filter_var($novo[$k], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($b === null) out(['ok' => false, 'msg' => "Valor inválido para $k"], 400);
                $final[$k] = $b;
            }
        }
        if ($final === $atual) out(['ok' => true, 'settings' => $final, 'alterado' => false]);
        // a Evolution exige o conjunto completo; preserva o token wavoip existente
        [, $raw] = evo('GET', '/settings/find/' . inst(), null, 10);
        $corpo = $final + ['wavoipToken' => (string)($raw['wavoipToken'] ?? '')];
        [$c, $r] = evo('POST', '/settings/set/' . inst(), $corpo, 15);
        if ($c < 200 || $c >= 300) out(['ok' => false, 'msg' => cfgx_erro($c, $r, 'Não foi possível salvar')], 502);
        out(['ok' => true, 'settings' => cfgx_settings() ?: $final, 'alterado' => true]);
    },

    'qr' => function () {
        $estado = cfgx_estado();
        if ($estado === 'open') out(['ok' => true, 'estado' => $estado, 'base64' => null, 'codigo' => null]);
        [$c, $r] = evo('GET', '/instance/connect/' . inst(), null, 25);
        if ($c < 200 || $c >= 300) out(['ok' => false, 'estado' => $estado, 'msg' => cfgx_erro($c, $r, 'Não foi possível gerar o QR code')], 502);
        $b64 = $r['base64'] ?? null;
        $cod = $r['code'] ?? ($r['pairingCode'] ?? null);
        out(['ok' => true, 'estado' => $estado, 'base64' => is_string($b64) && $b64 !== '' ? $b64 : null, 'codigo' => is_string($cod) && $cod !== '' ? $cod : null]);
    },

    'reiniciar' => function () {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'msg' => 'Método inválido'], 405);
        $i = inst();
        [$c, $r] = evo('POST', "/instance/restart/$i", null, 30);
        if ($c === 404 && str_contains(json_encode($r), 'Cannot POST')) [$c, $r] = evo('PUT', "/instance/restart/$i", null, 30); // versões antigas
        if ($c < 200 || $c >= 300) out(['ok' => false, 'msg' => cfgx_erro($c, $r, 'Não foi possível reiniciar')], 502);
        out(['ok' => true, 'estado' => (string)($r['instance']['state'] ?? cfgx_estado())]);
    },

    'perfil_nome' => function () {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'msg' => 'Método inválido'], 405);
        $n = trim((string)(entrada()['nome'] ?? ''));
        if ($n === '' || mb_strlen($n) > 25) out(['ok' => false, 'msg' => 'O nome deve ter de 1 a 25 caracteres'], 400);
        [$c, $r] = evo('POST', '/chat/updateProfileName/' . inst(), ['name' => $n], 20);
        if ($c < 200 || $c >= 300) out(['ok' => false, 'msg' => cfgx_erro($c, $r, 'Não foi possível alterar o nome')], 502);
        out(['ok' => true, 'nome' => $n]);
    },

    'perfil_status' => function () {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'msg' => 'Método inválido'], 405);
        $s = trim((string)(entrada()['status'] ?? ''));
        if ($s === '' || mb_strlen($s) > 139) out(['ok' => false, 'msg' => 'O recado deve ter de 1 a 139 caracteres'], 400);
        [$c, $r] = evo('POST', '/chat/updateProfileStatus/' . inst(), ['status' => $s], 20);
        if ($c < 200 || $c >= 300) out(['ok' => false, 'msg' => cfgx_erro($c, $r, 'Não foi possível alterar o recado')], 502);
        out(['ok' => true, 'status' => $s]);
    },
];
