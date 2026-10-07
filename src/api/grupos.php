<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
// ZapZap — módulo Grupos (SOMENTE LEITURA): lista, detalhe com participantes e link de convite.
if (!function_exists('gz_sem_acento')) {
    function gz_sem_acento(string $s): string {
        $s = mb_strtolower($s, 'UTF-8');
        if (class_exists('Normalizer')) { $n = Normalizer::normalize($s, Normalizer::FORM_D); if ($n !== false) $s = preg_replace('/\p{Mn}+/u', '', $n); }
        else $s = strtr($s, ['á'=>'a','à'=>'a','ã'=>'a','â'=>'a','ä'=>'a','é'=>'e','ê'=>'e','è'=>'e','í'=>'i','ì'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ò'=>'o','ú'=>'u','ù'=>'u','ü'=>'u','ç'=>'c']);
        return $s;
    }
    function gz_jid(): string {
        $j = trim((string)($_GET['jid'] ?? ''));
        if (!preg_match('/^\d+(-\d+)?@g\.us$/', $j)) out(['ok' => false, 'msg' => 'Identificador de grupo inválido.'], 400);
        return $j;
    }
    function gz_contatos(): array {
        $f = cache_arq('contatos.json');
        if (!is_file($f)) return [];
        $d = json_decode((string)@file_get_contents($f), true);
        return is_array($d) ? $d : [];
    }
    function gz_lista(): ?array {
        $f = cache_arq('grupos.json');
        $c = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        if (is_array($c) && isset($c['ts'], $c['grupos']) && $c['ts'] > time() - 120) return $c['grupos'];
        [$code, $r] = evo('GET', '/group/fetchAllGroups/' . rawurlencode(inst()) . '?getParticipants=false', null, 40);
        if ($code !== 200 || !is_array($r) || ($r && !array_is_list($r))) {
            // Evolution fora do ar: usa cache velho, se houver.
            return (is_array($c) && isset($c['grupos'])) ? $c['grupos'] : null;
        }
        $g = [];
        foreach ($r as $x) {
            if (!is_array($x) || !isset($x['id']) || !preg_match('/^\d+(-\d+)?@g\.us$/', (string)$x['id'])) continue;
            $dono = (string)($x['owner'] ?? $x['subjectOwner'] ?? '');
            $g[] = [
                'jid' => $x['id'],
                'nome' => trim((string)($x['subject'] ?? '')) ?: 'Grupo sem nome',
                'descricao' => (string)($x['desc'] ?? ''),
                'tamanho' => (int)($x['size'] ?? 0),
                'foto' => (string)($x['pictureUrl'] ?? ''),
                'criado' => (int)($x['creation'] ?? 0),
                'dono' => preg_replace('/\D/', '', explode('@', $dono)[0]),
            ];
        }
        usort($g, fn($a, $b) => strcmp(gz_sem_acento($a['nome']), gz_sem_acento($b['nome'])));
        $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, json_encode(['ts' => time(), 'grupos' => $g], JSON_UNESCAPED_UNICODE)) !== false) {
            if (!@rename($tmp, $f)) @unlink($tmp);
        }
        return $g;
    }
}

return [
    'grupos' => function () {
        $g = gz_lista();
        if ($g === null) out(['ok' => false, 'msg' => 'Não foi possível carregar os grupos agora. Tente de novo.'], 502);
        $q = gz_sem_acento(trim(mb_substr((string)($_GET['q'] ?? ''), 0, 80)));
        if ($q !== '') $g = array_values(array_filter($g, fn($x) => str_contains(gz_sem_acento($x['nome']), $q) || str_contains(gz_sem_acento($x['descricao']), $q)));
        out(['ok' => true, 'total' => count($g), 'grupos' => $g]);
    },

    'grupo' => function () {
        $jid = gz_jid();
        $base = null;
        foreach (gz_lista() ?? [] as $x) if ($x['jid'] === $jid) { $base = $x; break; }
        if (!$base) out(['ok' => false, 'msg' => 'Grupo não encontrado.'], 404);
        [$code, $r] = evo('GET', '/group/participants/' . rawurlencode(inst()) . '?groupJid=' . rawurlencode($jid), null, 30);
        if ($code !== 200 || !is_array($r)) out(['ok' => false, 'msg' => 'Não foi possível carregar os participantes agora.'], 502);
        $lista = is_array($r['participants'] ?? null) ? $r['participants'] : (array_is_list($r) ? $r : []);
        $cont = gz_contatos();
        $part = [];
        foreach ($lista as $p) {
            if (!is_array($p)) continue;
            $pj = (string)($p['jid'] ?? '');
            $id = (string)($p['id'] ?? '');
            $real = str_ends_with($pj, '@s.whatsapp.net') ? $pj : (str_ends_with($id, '@s.whatsapp.net') ? $id : '');
            $usar = $real ?: ($pj ?: $id);
            if ($usar === '') continue;
            $num = $real ? preg_replace('/\D/', '', explode('@', $real)[0]) : '';
            $nome = '';
            foreach ([$real, $id, $pj] as $k) if ($k !== '' && !empty($cont[$k]['nome'])) { $nome = (string)$cont[$k]['nome']; break; }
            $part[] = ['jid' => $usar, 'numero' => $num, 'nome' => $nome !== '' ? $nome : $num, 'admin' => !empty($p['admin'])];
        }
        usort($part, fn($a, $b) => ($b['admin'] <=> $a['admin']) ?: strcmp(gz_sem_acento($a['nome']), gz_sem_acento($b['nome'])));
        $base['participantes'] = $part;
        $base['tamanho'] = max($base['tamanho'], count($part));
        out(['ok' => true, 'grupo' => $base]);
    },

    'convite' => function () {
        $jid = gz_jid();
        [$code, $r] = evo('GET', '/group/inviteCode/' . rawurlencode(inst()) . '?groupJid=' . rawurlencode($jid), null, 20);
        $link = is_array($r) ? (string)($r['inviteUrl'] ?? '') : '';
        $cod = is_array($r) ? (string)($r['code'] ?? $r['inviteCode'] ?? '') : '';
        if ($link === '' && $cod !== '') $link = 'https://chat.whatsapp.com/' . $cod;
        if ($code === 200 && preg_match('#^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+$#', $link)) out(['ok' => true, 'link' => $link]);
        $msg = $code === 0 ? 'Sem resposta do servidor. Tente de novo.' : 'Não foi possível obter o link: só administradores do grupo podem ver o convite.';
        out(['ok' => false, 'msg' => $msg], $code === 0 ? 502 : 403);
    },
];
