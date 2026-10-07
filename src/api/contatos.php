<?php
if (!defined('ZZ_DIR')) { http_response_code(404); exit; }
require_once __DIR__ . '/../cortes.php';
// ZapZap — módulo Contatos: lista/busca de contatos com cache em ZZ_DIR/cache/contatos.json
// Formato do cache (lido também pelo módulo Conversas): {"<jid>":{"nome":"…","foto":"…|null","grupo":bool}}
// O arquivo é gravado já ORDENADO por nome (sem acento), então a busca não precisa reordenar.

if (!function_exists('ct_norm')) {
    /** minúsculas e sem acento */
    function ct_norm(string $s): string {
        $s = mb_strtolower($s, 'UTF-8');
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        $t = ($t !== false && $t !== '') ? $t : $s;
        return trim(preg_replace('/[^a-z0-9 ]+/', '', $t));
    }
    function ct_arquivo(): string { return cache_arq('contatos.json'); }

    /** Busca na Evolution e regrava o cache atomicamente. Devolve [ok, msgErro]. */
    function ct_atualizar(): array {
        // trava para evitar várias atualizações simultâneas
        $lock = @fopen(cache_arq('contatos.lock'), 'c');
        if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return [false, 'Atualização já em andamento']; }
        try {
            [$c, $r] = evo('POST', '/chat/findContacts/' . rawurlencode(inst()), [], 30);
            if ($c < 200 || $c >= 300 || !is_array($r) || !array_is_list($r)) {
                return [false, 'A Evolution API não respondeu a lista de contatos (HTTP ' . $c . ')'];
            }
            $itens = [];
            $nomesComNumero = []; // nomes que já existem com número real (para descartar duplicata @lid)
            foreach ($r as $x) {
                if (!is_array($x)) continue;
                $jid = trim((string)($x['remoteJid'] ?? ''));
                if ($jid === '' || !str_contains($jid, '@')) continue;
                if (($zzCorte = corte_instancia()) && !str_ends_with($jid, '@g.us') && ($zzU = strtotime((string)($x['updatedAt'] ?? ''))) && $zzU < $zzCorte) continue; // dados ocultos (Conexões)
                if (str_ends_with($jid, '@broadcast') || str_starts_with($jid, 'status@')) continue;
                $grupo = !empty($x['isGroup']) || str_ends_with($jid, '@g.us');
                $lid = str_ends_with($jid, '@lid');
                $nome = trim((string)($x['pushName'] ?? ''));
                if ($lid && $nome === '') continue;
                if ($nome === '' && !$grupo) $nome = preg_replace('/\D/', '', explode('@', $jid)[0]);
                if ($nome === '') $nome = 'Grupo sem nome';
                $foto = trim((string)($x['profilePicUrl'] ?? ''));
                $foto = ($foto !== '' && preg_match('#^https?://#i', $foto)) ? $foto : null;
                if (isset($itens[$jid])) { // duplicata do mesmo JID: fica o que tem mais informação
                    if ($foto && !$itens[$jid]['foto']) $itens[$jid]['foto'] = $foto;
                    if (ctype_digit($itens[$jid]['nome']) && !ctype_digit($nome)) $itens[$jid]['nome'] = $nome;
                    continue;
                }
                $itens[$jid] = ['nome' => $nome, 'foto' => $foto, 'grupo' => $grupo];
                if (!$lid && !$grupo) $nomesComNumero[ct_norm($nome)] = true;
            }
            // @lid com o mesmo nome de um contato com número: duplicata
            foreach ($itens as $jid => $v) {
                if (str_ends_with($jid, '@lid') && isset($nomesComNumero[ct_norm($v['nome'])])) unset($itens[$jid]);
            }
            // ordena por nome (sem acento) e grava já ordenado
            $chaves = [];
            foreach ($itens as $jid => $v) $chaves[$jid] = ct_norm($v['nome']) . '|' . $jid;
            asort($chaves, SORT_STRING);
            $ord = [];
            foreach (array_keys($chaves) as $jid) $ord[$jid] = $itens[$jid];

            $tmp = ct_arquivo() . '.' . bin2hex(random_bytes(4)) . '.tmp';
            $json = json_encode($ord, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
            if ($json === false || file_put_contents($tmp, $json) === false) { @unlink($tmp); return [false, 'Não foi possível gravar o cache de contatos']; }
            @chmod($tmp, 0640);
            if (!rename($tmp, ct_arquivo())) { @unlink($tmp); return [false, 'Não foi possível gravar o cache de contatos']; }
            return [true, ''];
        } finally {
            if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
        }
    }
}

return [
    'contatos' => function () {
        $q = trim((string)($_GET['q'] ?? ''));
        if (mb_strlen($q) > 100) $q = mb_substr($q, 0, 100);
        $pag = max(1, (int)($_GET['pag'] ?? 1));
        $grupos = (string)($_GET['grupos'] ?? '1') !== '0';
        $forcar = (string)($_GET['atualizar'] ?? '') === '1';
        $arq = ct_arquivo();
        $existe = is_file($arq);
        $idade = $existe ? time() - (int)filemtime($arq) : PHP_INT_MAX;
        $aviso = null;

        if ($forcar || !$existe || $idade > 600) {
            [$ok, $erro] = ct_atualizar();
            if (!$ok) {
                if (!is_file($arq)) out(['ok' => false, 'msg' => $erro ?: 'Não foi possível carregar os contatos'], 502);
                $aviso = 'Mostrando contatos salvos antes: ' . $erro;
                // evita martelar a Evolution quando ela está fora: renova o prazo do cache antigo por 60 s
                if (!$forcar) @touch($arq, time() - 540);
            }
        }

        $todos = json_decode((string)@file_get_contents($arq), true);
        if (!is_array($todos)) {
            @unlink($arq);
            out(['ok' => false, 'msg' => 'Cache de contatos corrompido; tente de novo'], 500);
        }

        $qn = ct_norm($q);
        $qd = preg_replace('/\D/', '', $q);
        $achados = [];
        foreach ($todos as $jid => $v) {
            $grupo = !empty($v['grupo']);
            if (!$grupos && $grupo) continue;
            $lid = str_ends_with($jid, '@lid');
            $num = $lid ? '' : preg_replace('/\D/', '', explode('@', $jid)[0]);
            if ($q !== '') {
                $casa = $qn !== '' && str_contains(ct_norm((string)($v['nome'] ?? '')), $qn);
                if (!$casa && $qd !== '' && strlen($qd) >= 3 && $num !== '' && str_contains($num, $qd)) $casa = true;
                if (!$casa) continue;
            }
            $achados[] = ['jid' => $jid, 'nome' => (string)($v['nome'] ?? ''), 'numero' => $grupo ? '' : $num, 'foto' => $v['foto'] ?? null, 'grupo' => $grupo];
        }
        $total = count($achados);
        $paginas = max(1, (int)ceil($total / 50));
        if ($pag > $paginas) $pag = $paginas;
        $resp = ['ok' => true, 'total' => $total, 'pag' => $pag, 'paginas' => $paginas,
                 'contatos' => array_slice($achados, ($pag - 1) * 50, 50), 'atualizado_em' => (int)filemtime($arq)];
        if ($aviso) $resp['aviso'] = $aviso;
        out($resp);
    },
];
