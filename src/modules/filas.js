/* ZapZap — Filas e atendimento (front). Classes fl-. Back-end: api/filas.php */
(function () {
  'use strict';
  const ZZ = window.ZZ, E = ZZ.esc;
  const ST = { aguardando: 'aguardando', em: 'em_atendimento', res: 'resolvido' };
  const ABAS = [
    { k: 'aguardando', t: 'Aguardando', ic: 'fa-hourglass-half', cor: 'am' },
    { k: 'em', t: 'Em atendimento', ic: 'fa-headset', cor: 'az' },
    { k: 'res', t: 'Resolvidos', ic: 'fa-circle-check', cor: 've' }
  ];
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'], DK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const CORES = ['#2563EB', '#1e9e57', '#c47f12', '#d9433a', '#6a4cff', '#0ea5a4', '#e0457b', '#64748b'];
  const agora = () => Math.floor(Date.now() / 1000);
  const LIM0 = { verde_min: 5, amarelo_min: 15, laranja_min: 30 };
  const CS = ['verde', 'amarelo', 'laranja', 'vermelho'], CS_T = { verde: 'No prazo', amarelo: 'Atenção', laranja: 'Urgente', vermelho: 'Atrasado' }, CS_HEX = { verde: '#1e9e57', amarelo: '#e0a100', laranja: '#ea6a12', vermelho: '#d9433a' };
  const normLim = x => { x = x || {}; const g = k => +x[k] > 0 ? +x[k] : LIM0[k]; return { verde_min: g('verde_min'), amarelo_min: g('amarelo_min'), laranja_min: g('laranja_min') }; };
  const corPor = (seg, l) => seg <= l.verde_min * 60 ? 'verde' : seg <= l.amarelo_min * 60 ? 'amarelo' : seg <= l.laranja_min * 60 ? 'laranja' : 'vermelho';
  const corAt = a => a.ref ? corPor(Math.max(0, agora() - a.ref), a.lim) : '';
  const ALERTADOS = new Set();
  const normSt = s => { s = String(s || '').toLowerCase(); if (/aguard|esper|fila|pend/.test(s)) return 'aguardando'; if (/resol|encerr|fech|final/.test(s)) return 'res'; return 'em'; };
  const dur = s => { s = Math.max(0, s | 0); if (s < 60) return 'agora'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h ' + Math.floor(s % 3600 / 60) + ' min'; return Math.floor(s / 86400) + ' d'; };
  const getSom = () => { try { return localStorage.getItem('zz_fl_som') !== '0'; } catch (e) { return true; } };
  const setSom = v => { try { localStorage.setItem('zz_fl_som', v ? '1' : '0'); } catch (e) { } };
  let ctxAudio = null;
  const bipe = () => { try { ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)(); const o = ctxAudio.createOscillator(), g = ctxAudio.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(.18, ctxAudio.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctxAudio.currentTime + .4); o.connect(g); g.connect(ctxAudio.destination); o.start(); o.stop(ctxAudio.currentTime + .4); } catch (e) { } };

  /* ---------- normalização tolerante do que o servidor devolve ---------- */
  const normFila = f => {
    const mem = (f.membros || f.usuarios || []).map(m => typeof m === 'object' ? { id: +m.id, nome: m.nome || m.usuario || ('#' + m.id) } : { id: +m, nome: '' });
    const h = f.horario && typeof f.horario === 'object' ? f.horario : null; const hor = {};
    for (let d = 0; d < 7; d++) { const fx = h && Array.isArray(h[DK[d]]) ? h[DK[d]] : []; hor[d] = fx.map(x => ({ de: x[0], ate: x[1] })); }
    return { id: +f.id, nome: f.nome || 'Fila', cor: f.cor || CORES[0], membros: mem, saudacao: f.saudacao || '', ausencia: f.mensagem_ausencia || '', horario: hor, horario_ativo: !!h, padrao: !!f.padrao, ativa: f.ativa !== false, aberta: f.aberta_agora, sla_min: +(f.sla_min || f.sla || 0), sla_limites: normLim(f.sla_limites || { verde_min: f.sla_verde_min, amarelo_min: f.sla_amarelo_min, laranja_min: f.sla_laranja_min }), aguardando: +(f.aguardando || 0), em_atendimento: +(f.em_atendimento || f.atendendo || 0), ordem: f.ordem };
  };
  const normAt = (a, filasMap) => {
    const f = filasMap[a.fila_id] || (a.fila && typeof a.fila === 'object' ? a.fila : {}) || {};
    const u = a.ultima || a.ultima_mensagem || {};
    const jid = a.jid || a.contato_jid || '';
    const r = {
      id: a.id, jid, status: normSt(a.status), foto: a.foto || '', lim: normLim(a.sla_limites || (a.sla_verde_min ? { verde_min: a.sla_verde_min, amarelo_min: a.sla_amarelo_min, laranja_min: a.sla_laranja_min } : f.sla_limites)), ref: 0,
      nome: a.nome || ZZ.fmtNumero(jid.split('@')[0]) || 'Contato',
      numero: a.numero || ZZ.fmtNumero(jid.split('@')[0]),
      fila_id: a.fila_id, fila_nome: a.fila_nome || f.nome || '', fila_cor: a.fila_cor || f.cor || '#94a3b8', sla: +(a.sla_min || f.sla_min || 0),
      usuario_id: a.usuario_id || a.atendente_id || null, usuario_nome: a.usuario_nome || a.atendente_nome || a.atendente || '',
      previa: a.ultima_msg_texto || '', previa_me: false, atrasado: !!a.atrasado,
      nao_lidas: +(a.nao_lidas || 0),
      desde: +((a.status === 'aguardando' ? a.espera_desde : (a.ultima_msg_ts || a.atualizado)) || a.criado || 0), criado: +(a.criado || 0), resumo: a.resumo_encerramento || ''
    };
    const st = r.status;
    r.ref = st === 'res' ? 0 : ('espera_s' in a ? (a.espera_s === null ? 0 : agora() - (+a.espera_s || 0)) : (st === 'aguardando' ? (+a.espera_desde || r.desde) : (r.nao_lidas > 0 ? (+a.ultima_msg_ts || 0) : 0)));
    return r;
  };
  const avatar = (n, foto) => foto ? `<img class="avatar fl-av" src="${E(foto)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;avatar fl-av&quot;>${E(ZZ.iniciais(n))}</span>'">` : `<span class="avatar fl-av">${E(ZZ.iniciais(n))}</span>`;
  const slaCls = (seg, sla) => { if (!sla) return seg > 1800 ? 'fl-sla-r' : seg > 600 ? 'fl-sla-a' : 'fl-sla-v'; const p = seg / (sla * 60); return p >= 1 ? 'fl-sla-r' : p >= .5 ? 'fl-sla-a' : 'fl-sla-v'; };

  /* badge global (menu), mesmo fora da página */
  let tBadge = null;
  const badgeGlobal = async () => {
    if (document.hidden || !ZZ.eu || !ZZ.pode('filas.ver') || !ZZ.badge || document.getElementById('fl-raiz')) return;
    const j = await ZZ.api('listar_atendimentos', { params: { status: ST.aguardando, pag: 1 }, silencioso: true });
    if (j && j.ok) { const c = j.contagem || {}; ZZ.badge('filas', +(c.aguardando ?? 0) || ''); }
  };
  tBadge = setInterval(badgeGlobal, 30000); setTimeout(badgeGlobal, 4000);

  ZZ.pagina({
    id: 'filas', titulo: 'Atendimento', icone: 'fa-headset', ordem: 2.5, tab: true, perm: 'filas.ver',
    render(el, ctx) {
      const S = { lembr: {}, cor: '', urg: (() => { try { return localStorage.getItem('zz_fl_urg') === '1'; } catch (e) { return false; } })(), aba: 'aguardando', fila: '', meus: false, q: '', itens: [], cont: { aguardando: 0, em: 0, res: 0 }, filas: [], fmap: {}, usuarios: [], pag: 1, paginas: 1, vistos: null, ultimaAss: '', det: null, rt: null, carregando: false };
      const P = ctx.params || {};
      if (P.aba && ST[P.aba]) S.aba = P.aba;
      el.innerHTML = `<div id="fl-raiz" class="fl">
        <div id="fl-rt"></div>
        <div class="fl-abas" id="fl-abas"></div>
        <div class="fl-barra">
          <div class="fl-busca"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="fl-q" placeholder="Buscar" autocomplete="off"></div>
          <button class="btn-soft fl-ib" id="fl-meus" title="Só os meus atendimentos" aria-pressed="false"><i class="fa-solid fa-user-check"></i><span>Meus</span></button>
          <button class="btn-soft fl-ib" id="fl-som" title="Som de novo atendimento"><i class="fa-solid"></i></button>
          <button class="btn-azul fl-ib" id="fl-novo" title="Novo atendimento" hidden><i class="fa-solid fa-plus"></i><span>Novo</span></button>
          <button class="btn-soft fl-ib" id="fl-gerir" title="Gerir filas" hidden><i class="fa-solid fa-sliders"></i><span>Filas</span></button>
        </div>
        <div class="fl-pilulas" id="fl-pil"></div>
        <div id="fl-meus-f" class="fl-meusf" ></div>
        <div class="fl-leg" id="fl-leg"></div>
        <div class="fl-topo2"><span class="vivo">ao vivo</span><span class="mut fl-n" id="fl-info"></span></div>
        <div id="fl-lista">${ZZ.skeleton(5, 'skel-linha fl-skel')}</div>
        <div id="fl-mais" class="fl-mais" hidden><button class="btn-soft">Carregar mais</button></div>
        
      </div>`;
      const $ = s => el.querySelector(s);
      $('#fl-gerir').hidden = !ZZ.pode('filas.gerir'); $('#fl-novo').hidden = !ZZ.pode('filas.atender'); $('#fl-meus-f').hidden = !ZZ.pode('filas.atender');
      const pintaSom = () => { const on = getSom(); $('#fl-som i').className = 'fa-solid ' + (on ? 'fa-bell' : 'fa-bell-slash'); $('#fl-som').classList.toggle('fl-off', !on); };
      pintaSom();
      $('#fl-som').onclick = () => { const v = !getSom(); setSom(v); pintaSom(); if (v) bipe(); ZZ.toast(v ? 'Som de novo atendimento ligado' : 'Som desligado', 'ok'); };
      $('#fl-meus').onclick = () => { S.meus = !S.meus; $('#fl-meus').classList.toggle('fl-on', S.meus); $('#fl-meus').setAttribute('aria-pressed', S.meus); carregar(true); };
      $('#fl-q').oninput = ZZ.debounce(e => { S.q = e.target.value.trim(); carregar(true); }, 350);
      $('#fl-gerir').onclick = () => gerirFilas();
      $('#fl-novo').onclick = () => novoAtendimento();
      $('#fl-mais button').onclick = e => ZZ.busy(e.currentTarget, () => carregar(false, true));

      /* ----- abas / contadores clicáveis ----- */
      function pintaAbas() {
        $('#fl-abas').innerHTML = ABAS.map(a => `<button class="fl-aba fl-${a.cor} ${S.aba === a.k ? 'fl-sel' : ''}" data-k="${a.k}" aria-pressed="${S.aba === a.k}"><i class="fa-solid ${a.ic}"></i><b class="fl-num" data-n="${S.cont[a.k]}">${S.cont[a.k]}</b><span>${a.t}</span></button>`).join('');
        $('#fl-abas').querySelectorAll('.fl-aba').forEach(b => b.onclick = () => { if (S.aba !== b.dataset.k) { S.aba = b.dataset.k; S.vistos = null; pintaAbas(); carregar(true); } ZZ.vibrar(8); });
      }
      function pintaPilulas() {
        const tot = S.filas.length; $('#fl-pil').hidden = !tot;
        $('#fl-pil').innerHTML = `<button class="fl-pil ${S.fila === '' ? 'fl-sel' : ''}" data-f="">Todas</button>` + S.filas.map(f => `<button class="fl-pil ${String(S.fila) === String(f.id) ? 'fl-sel' : ''}" data-f="${f.id}" style="--c:${E(f.cor)}"><i></i>${E(f.nome)}${f.aguardando ? `<em>${f.aguardando}</em>` : ''}</button>`).join('');
        $('#fl-pil').querySelectorAll('.fl-pil').forEach(b => b.onclick = () => { S.fila = b.dataset.f; pintaPilulas(); carregar(true); ZZ.vibrar(8); });
      }

      /* ----- lista ----- */
      function tempoHtml(a) {
        if (a.status === 'res') return `<span class="fl-tempo fl-sla-n"><i class="fa-regular fa-clock"></i> <u>${a.desde ? ZZ.fmtRel(a.desde) : ''}</u></span>`;
        const c = corAt(a);
        if (!c) return '<span class="fl-tempo fl-sla-n"><i class="fa-solid fa-check"></i> <u>respondido</u></span>';
        return `<span class="fl-tempo fl-t-${c}" data-ref="${a.ref}" data-lim="${a.lim.verde_min},${a.lim.amarelo_min},${a.lim.laranja_min}"><i class="fa-regular fa-clock"></i> <u>${dur(agora() - a.ref)}</u></span>`;
      }
      function card(a) {
        const c = corAt(a);
        return `<button class="fl-card ${c ? 'fl-cs-' + c : ''} ${S.novos && S.novos.has(String(a.id)) ? 'fl-novo' : ''}" data-id="${a.id}" data-ref="${a.ref || ''}" data-lim="${a.lim.verde_min},${a.lim.amarelo_min},${a.lim.laranja_min}" style="--c:${E(a.fila_cor)}">
          ${avatar(a.nome, a.foto)}
          <div class="fl-cc"><div class="fl-l1"><b>${E(a.nome)}</b>${tempoHtml(a)}</div>
            <div class="fl-l2 ${a.nao_lidas ? 'fl-nl' : ''}">${E(a.previa || 'Sem mensagens')}</div>
            <div class="fl-l3">${S.lembr[a.jid] ? `<span class="fl-lbc" title="Lembrete às ${ZZ.fmtHora(S.lembr[a.jid])}"><i class="fa-regular fa-clock"></i> ${ZZ.fmtHora(S.lembr[a.jid])}</span>` : ''}${a.fila_nome ? `<span class="fl-tag"><i></i>${E(a.fila_nome)}</span>` : ''}${a.usuario_nome ? `<span class="fl-aten"><i class="fa-solid fa-user"></i> atendido por <b>${E(a.usuario_nome)}</b></span>` : (a.status === 'aguardando' ? '<span class="fl-aten fl-sem">sem atendente</span>' : '')}</div></div>
          ${a.nao_lidas ? `<span class="fl-bd">${a.nao_lidas > 99 ? '99+' : a.nao_lidas}</span>` : ''}</button>`;
      }
      const visiveis = () => { let l = S.itens.filter(a => !S.cor || corAt(a) === S.cor); if (S.urg) l = l.slice().sort((x, y) => (x.ref || 1e12) - (y.ref || 1e12)); return l; };
      function pintaLegenda() {
        const n = { verde: 0, amarelo: 0, laranja: 0, vermelho: 0 }; S.itens.forEach(a => { const c = corAt(a); if (c) n[c]++; });
        $('#fl-leg').innerHTML = CS.map(c => `<button class="fl-lg fl-lg-${c} ${S.cor === c ? 'fl-sel' : ''}" data-c="${c}" aria-pressed="${S.cor === c}"><i></i>${CS_T[c]}<em>${n[c]}</em></button>`).join('') + `<button class="fl-lg fl-urg ${S.urg ? 'fl-sel' : ''}" id="fl-urg" aria-pressed="${!!S.urg}"><i class="fa-solid fa-arrow-up-wide-short"></i>Urgentes primeiro</button>`;
        $('#fl-leg').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.cor = S.cor === b.dataset.c ? '' : b.dataset.c; ZZ.vibrar(8); pintaLegenda(); pintaLista(); });
        $('#fl-urg').onclick = () => { S.urg = !S.urg; try { localStorage.setItem('zz_fl_urg', S.urg ? '1' : '0'); } catch (e) { } pintaLegenda(); pintaLista(); };
      }
      function pintaLista() {
        const box = $('#fl-lista');
        const vis = visiveis(); pintaLegenda();
        if (!vis.length) {
          const msg = { aguardando: ['fa-mug-hot', 'Ninguém na fila agora', 'Quando um cliente chamar, o atendimento aparece aqui.'], em: ['fa-headset', 'Nenhum atendimento em andamento', 'Assuma um da fila de espera para começar.'], res: ['fa-box-archive', 'Nenhum atendimento resolvido', 'Os atendimentos encerrados ficam aqui.'] }[S.aba];
          box.innerHTML = `<div class="vazio fl-vazio"><i class="fa-solid ${msg[0]}"></i><b>${S.q || S.fila || S.meus || S.cor ? 'Nada encontrado com esse filtro' : msg[1]}</b><div>${S.q || S.fila || S.meus || S.cor ? 'Tente limpar a busca ou escolher outra fila.' : msg[2]}</div></div>`;
        } else box.innerHTML = vis.map(card).join('');
        box.querySelectorAll('.fl-card').forEach(b => b.onclick = () => abrirDet(b.dataset.id));
        $('#fl-mais').hidden = S.pag >= S.paginas;
        $('#fl-info').textContent = vis.length ? vis.length + (vis.length === 1 ? ' atendimento' : ' atendimentos') : '';
        setTimeout(() => box.querySelectorAll('.fl-novo').forEach(c => c.classList.remove('fl-novo')), 2200);
      }
      function pintaMeus() {
        const box = $('#fl-meus-f'); if (!box) return; const L = S.meusAll || [];
        const n = { verde: 0, amarelo: 0, laranja: 0, vermelho: 0 }; let maior = 0, maiorC = '';
        L.forEach(a => { const c = corAt(a); if (c) { n[c]++; const w = agora() - a.ref; if (w > maior) { maior = w; maiorC = c; } } });
        const r = S.resumo || {}; const tm = r.tempo_medio_primeira_resposta ?? null; if (r.maior_espera_s > maior && !L.length) { }
        const maiorTxt = L.length ? (maior ? dur(maior) : 'ninguém esperando') : '—';
        const sig = JSON.stringify([n, L.length, tm, maiorTxt, S.cor, S.meus]); if (sig === S.sigMeus) return; S.sigMeus = sig;
        box.innerHTML = `<div class="fl-mt"><b><i class="fa-solid fa-user-check"></i> Meus atendimentos</b><span class="mut">${L.length} em aberto</span></div>
          <div class="fl-mc">${CS.map(c => `<button class="fl-mch fl-lg-${c} ${S.meus && S.cor === c ? 'fl-sel' : ''}" data-c="${c}" ${n[c] ? '' : 'data-zero'}><b>${n[c]}</b><span>${CS_T[c]}</span></button>`).join('')}</div>
          <div class="fl-ms"><span><i class="fa-solid fa-stopwatch"></i> Resposta média hoje: <b>${tm != null ? dur(tm) : '—'}</b></span><span><i class="fa-solid fa-hourglass-half"></i> Maior espera: <b class="${maiorC ? 'fl-t-' + maiorC : ''} fl-mb">${maiorTxt}</b></span></div>`;
        box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const c = b.dataset.c; if (S.meus && S.cor === c) { S.cor = ''; } else { S.meus = true; S.cor = c; S.aba = 'em'; S.vistos = null; } $('#fl-meus').classList.toggle('fl-on', S.meus); pintaAbas(); S.sigMeus = ''; pintaMeus(); ZZ.vibrar(8); carregar(true); });
      }
      function alertar(a) {
        if (ALERTADOS.has(a.id)) return; ALERTADOS.add(a.id);
        if (getSom()) bipe(); ZZ.vibrar([60, 60, 60]);
        try { if (ZZ.notif && ZZ.notif.mostrar) ZZ.notif.mostrar({ tipo: 'atendimento', titulo: 'Atendimento atrasado', texto: a.nome, rota: 'filas' }); else ZZ.toast('Atendimento atrasado: ' + a.nome, 'err'); } catch (e) { }
      }
      function tictac() {
        el.querySelectorAll('.fl-card[data-ref]').forEach(cd => {
          const ref = +cd.dataset.ref; if (!ref) return; const l = cd.dataset.lim.split(',').map(Number); const seg = Math.max(0, agora() - ref); const c = corPor(seg, { verde_min: l[0], amarelo_min: l[1], laranja_min: l[2] });
          const u = cd.querySelector('.fl-tempo u'); if (u) u.textContent = dur(seg);
          const t = cd.querySelector('.fl-tempo'); if (t && !t.classList.contains('fl-t-' + c)) { t.className = 'fl-tempo fl-t-' + c; }
          if (!cd.classList.contains('fl-cs-' + c)) { CS.forEach(x => cd.classList.remove('fl-cs-' + x)); cd.classList.add('fl-cs-' + c); S.legSig = ''; }
        });
        el.querySelectorAll('.fl-leg-sig').forEach(() => { });
        if (document.querySelector('.fl-live')) document.querySelectorAll('.fl-live').forEach(t => { const ref = +t.dataset.ref; const l = t.dataset.lim.split(',').map(Number); const seg = Math.max(0, agora() - ref); t.textContent = dur(seg); t.className = 'fl-live fl-t-' + corPor(seg, { verde_min: l[0], amarelo_min: l[1], laranja_min: l[2] }); });
        const eu = ZZ.eu && ZZ.eu.usuario.id; (S.meusAll || []).forEach(a => { if (a.status === 'em' && +a.usuario_id === +eu && corAt(a) === 'vermelho') alertar(a); else ALERTADOS.delete(a.id); });
        if (S.cor || true) { const sig = S.itens.map(a => corAt(a)).join(','); if (sig !== S.legSig) { S.legSig = sig; pintaLegenda(); } }
        pintaMeus();
      }
      async function carregarLembr() {
        if (!ZZ.lembrete || !ZZ.pode('filas.atender')) return;
        const j = await ZZ.api('listar_lembretes', { params: { status: 'pendente' }, silencioso: true }); if (!j || !j.ok) return;
        const m = {}; (j.itens || []).forEach(i => { if (!m[i.jid] || i.quando < m[i.jid]) m[i.jid] = +i.quando; });
        if (JSON.stringify(m) === JSON.stringify(S.lembr)) return; S.lembr = m; S.ultimaAss = ''; carregar(false); if (S.det && S.det.dados) { S.det.assin = ''; pintaDet(); }
      }
      if (window._flLb) document.removeEventListener('zz:lembretes', window._flLb); window._flLb = () => carregarLembr(); document.addEventListener('zz:lembretes', window._flLb);
      async function carregarMeus() {
        if (!ZZ.pode('filas.atender') || !ZZ.eu) return;
        const j = await ZZ.api('listar_atendimentos', { params: { status: 'abertos', usuario_id: ZZ.eu.usuario.id, pag: 1 }, silencioso: true });
        if (j && j.ok) { S.meusAll = (j.itens || []).map(a => normAt(a, S.fmap)); pintaMeus(); }
        if (S.resumoOk !== false && (!S.resumoT || Date.now() - S.resumoT > 30000)) {
          S.resumoT = Date.now(); const r = await ZZ.api('rel_atendente', { silencioso: true });
          if (r && r.ok) { S.resumo = r; S.resumoOk = true; S.sigMeus = ''; pintaMeus(); } else if (S.resumoOk === undefined) S.resumoOk = false;
        }
      }

      function erroLista(msg) { $('#fl-lista').innerHTML = `<div class="vazio fl-vazio"><i class="fa-solid fa-cloud-bolt"></i><b>${E(msg || 'Não foi possível carregar')}</b><div><button class="btn-azul" id="fl-re">Tentar de novo</button></div></div>`; $('#fl-re').onclick = () => { $('#fl-lista').innerHTML = ZZ.skeleton(4, 'skel-linha fl-skel'); carregar(true); }; $('#fl-mais').hidden = true; }

      async function carregarFilas() {
        const j = await ZZ.api('listar_filas', { silencioso: true });
        if (j && j.ok) {
          S.filas = (j.filas || j.itens || []).map(normFila); S.fmap = {}; S.filas.forEach(f => S.fmap[f.id] = f);
          const us = j.atendentes || []; if (us.length) S.usuarios = us.map(u => ({ id: +u.id, nome: u.nome || u.usuario }));
          pintaPilulas();
        }
        return j;
      }
      let reqN = 0;
      async function carregar(reset, mais) {
        if (S.carregando && !mais) { if (!reset) return; }
        const n = ++reqN; S.carregando = true;
        const pag = mais ? S.pag + 1 : 1;
        if (reset && !S.itens.length) $('#fl-lista').innerHTML = ZZ.skeleton(5, 'skel-linha fl-skel');
        const params = { status: ST[S.aba], pag };
        if (S.fila) params.fila_id = S.fila; if (S.meus && ZZ.eu) params.usuario_id = ZZ.eu.usuario.id; if (S.q) params.q = S.q;
        const j = await ZZ.api('listar_atendimentos', { params, silencioso: true });
        if (n !== reqN) return;
        S.carregando = false;
        if (!j || !j.ok) { if (!S.itens.length || reset) erroLista(j && j.msg); return j; }
        const novos = (j.itens || []).map(a => normAt(a, S.fmap));
        const c = j.contagem || {};
        const velho = S.cont.aguardando;
        S.cont = { aguardando: +(c.aguardando ?? S.cont.aguardando), em: +(c.em_atendimento ?? c.atendendo ?? c.em ?? S.cont.em), res: +(c.resolvido ?? c.resolvidos ?? c.res ?? S.cont.res) };
        S.paginas = +(j.paginas || 1); S.pag = pag;
        const lista = mais ? S.itens.concat(novos) : novos;
        // destaque + som para atendimentos novos na aba
        const ids = new Set(lista.map(a => String(a.id)));
        S.novos = new Set();
        if (S.vistos && !mais) { lista.forEach(a => { if (!S.vistos.has(String(a.id))) S.novos.add(String(a.id)); }); }
        if (S.vistos && S.aba === 'aguardando' && S.novos.size && getSom()) { bipe(); ZZ.vibrar([40, 60, 40]); }
        else if (S.vistos && S.cont.aguardando > velho && getSom() && S.aba !== 'aguardando') { bipe(); }
        S.vistos = mais && S.vistos ? new Set([...S.vistos, ...ids]) : ids;
        const assin = JSON.stringify([S.lembr, lista.map(a => [a.id, a.status, a.nao_lidas, a.previa, a.usuario_id, a.fila_id]), S.cont, S.paginas]);
        pintaAbas(); ZZ.badge('filas', S.cont.aguardando || '');
        if (assin !== S.ultimaAss || reset || mais) { S.itens = lista; S.ultimaAss = assin; pintaLista(); }
        if (S.det) recarregarDet(true);
        return j;
      }
      async function carregarRt() {
        const j = await ZZ.api('ver_webhook', { silencioso: true }); if (!j || !j.ok) { $('#fl-rt').innerHTML = ''; return; }
        S.rt = !!j.ligado; const pode = ZZ.pode('filas.gerir');
        if (!S.rt) $('#fl-rt').innerHTML = `<div class="fl-rt fl-rt-off"><i class="fa-solid fa-satellite-dish"></i><div><b>Recebimento em tempo real desligado</b><span>Sem ele, novos atendimentos não entram na fila sozinhos.</span></div>${pode ? '<button class="btn-azul btn-sm" id="fl-lig">Ligar</button>' : ''}</div>`;
        else $('#fl-rt').innerHTML = `<div class="fl-rt fl-rt-on"><i class="fa-solid fa-circle-check"></i><div><b>Recebimento em tempo real ativo</b></div>${pode ? '<button class="btn-soft btn-sm" id="fl-des">Desligar</button>' : ''}</div>`;
        const l = $('#fl-lig'), d = $('#fl-des');
        if (l) l.onclick = async () => { if (!await ZZ.confirmar('Ligar o recebimento em tempo real nesta conexão? O WhatsApp passará a avisar o painel de cada mensagem nova.', 'Ligar')) return; await ZZ.busy(l, async () => { const r = await ZZ.api('webhook_ligar', { corpo: {} }); if (r.ok) ZZ.toast(r.msg || 'Recebimento ligado', 'ok'); carregarRt(); return r; }); };
        if (d) d.onclick = async () => { if (!await ZZ.confirmar('Desligar o recebimento em tempo real? Atendimentos novos deixarão de entrar sozinhos (e Automações/Chatbot também param).', 'Desligar', true)) return; await ZZ.busy(d, async () => { const r = await ZZ.api('webhook_desligar', { corpo: {} }); if (r.ok) ZZ.toast(r.msg || 'Recebimento desligado', 'ok'); carregarRt(); return r; }); };
      }

      /* ----- detalhe em tela cheia ----- */
      let ov = null;
      function fecharDet() { if (ov) { ov.classList.add('fl-sai'); const o = ov; setTimeout(() => o.remove(), 180); ov = null; } S.det = null; document.body.classList.remove('fl-trava'); if (location.hash.indexOf('at=') > -1) { } }
      async function abrirDet(id) {
        S.det = { id }; S.det.dados = null;
        if (ov) ov.remove();
        ov = document.createElement('div'); ov.className = 'fl-ov'; document.body.appendChild(ov); document.body.classList.add('fl-trava');
        ov.innerHTML = `<div class="fl-det"><div class="fl-dh"><button class="fl-volta" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i></button><b>Atendimento</b></div><div class="fl-db">${ZZ.skeleton(4, 'skel-linha fl-skel')}</div></div>`;
        ov.querySelector('.fl-volta').onclick = fecharDet;
        ov.addEventListener('mousedown', e => { if (e.target === ov) fecharDet(); });
        await recarregarDet(false);
      }
      async function recarregarDet(silencioso) {
        if (!S.det || !ov) return; const id = S.det.id;
        const j = await ZZ.api('ver_atendimento', { params: { id }, silencioso: true });
        if (!S.det || S.det.id !== id || !ov) return;
        if (!j || !j.ok) { if (!silencioso) ov.querySelector('.fl-db').innerHTML = `<div class="vazio fl-vazio"><i class="fa-solid fa-cloud-bolt"></i><b>${E((j && j.msg) || 'Não foi possível abrir')}</b><div><button class="btn-azul" id="fl-d-re">Tentar de novo</button></div></div>`, ov.querySelector('#fl-d-re').onclick = () => recarregarDet(false); return; }
        const a = normAt(j.atendimento, S.fmap);
        if (!a.id) a.id = id;
                const evs = j.eventos || [];
        const assin = JSON.stringify([{ ...a, ref: !!a.ref }, evs]); const primeira = !S.det.dados;
        if (S.det.assin === assin) return;
        S.det.assin = assin; S.det.dados = a; S.det.eventos = evs;
        if (primeira && a.nao_lidas) ZZ.api('marcar_atendimento_lido', { corpo: { id: a.id }, silencioso: true });
        pintaDet();
      }
      const EVT = { criou: ['fa-flag', 'Atendimento criado'], assumiu: ['fa-hand', 'Assumido'], transferiu: ['fa-right-left', 'Transferido'], encerrou: ['fa-circle-check', 'Encerrado'], reabriu: ['fa-rotate-left', 'Reaberto'], nota: ['fa-note-sticky', 'Nota'], saudacao: ['fa-hand-sparkles', 'Saudação enviada'], ausencia: ['fa-moon', 'Mensagem de ausência enviada'], atrasou: ['fa-triangle-exclamation', 'SLA estourado'] };
      function pintaDet() {
        const a = S.det.dados, evs = S.det.eventos || [];
        const pa = ZZ.pode('filas.atender'), pt = ZZ.pode('filas.transferir');
        const meu = ZZ.eu && a.usuario_id && +a.usuario_id === +ZZ.eu.usuario.id;
        const seg = a.ref ? agora() - a.ref : 0;
        const stb = { aguardando: ['b-pend', 'Aguardando'], em: ['b-info', 'Em atendimento'], res: ['b-ok', 'Resolvido'] }[a.status];
        let btns = '';
        if (a.status === 'aguardando' && pa) btns += '<button class="btn-azul" data-ac="assumir"><i class="fa-solid fa-hand"></i> Assumir</button>';
        if (false) btns += '<button class="btn-azul" data-ac="assumir"><i class="fa-solid fa-hand"></i> Assumir</button>';
        if (a.status !== 'res' && pt) btns += '<button class="btn-soft" data-ac="transferir"><i class="fa-solid fa-right-left"></i> Transferir</button><button class="btn-soft fl-bt-enc" data-ac="encerrar"><i class="fa-solid fa-circle-check"></i> Encerrar</button>';
        if (a.status === 'res' && pa) btns += '<button class="btn-soft" data-ac="reabrir"><i class="fa-solid fa-rotate-left"></i> Reabrir</button>';
        if (a.status !== 'res' && pa && ZZ.lembrete) btns += `<button class="btn-soft fl-bt-lb" data-ac="lembrar"><i class="fa-regular fa-bell"></i> Lembrar de responder</button>`;
        const lbq = S.lembr[a.jid];
        ov.querySelector('.fl-det').innerHTML = `<div class="fl-dh"><button class="fl-volta" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i></button>${avatar(a.nome, a.foto)}<div class="fl-dt"><b>${E(a.nome)}</b><small>${E(a.numero)}</small></div><span class="badge-status ${stb[0]}">${stb[1]}</span></div>
          <div class="fl-db">
            <div class="fl-info-g">
              <div><small>Fila</small><span class="fl-tag" style="--c:${E(a.fila_cor)}"><i></i>${E(a.fila_nome || 'Sem fila')}</span></div>
              <div><small>Atendente</small><b>${E(a.usuario_nome || '—')}</b></div>
              <div><small>${a.status === 'res' ? 'Encerrado' : 'Sem resposta há'}</small>${a.status === 'res' ? `<b>${a.desde ? ZZ.fmtRel(a.desde) : '—'}</b>` : (a.ref ? `<b class="fl-live fl-t-${corAt(a)}" data-ref="${a.ref}" data-lim="${a.lim.verde_min},${a.lim.amarelo_min},${a.lim.laranja_min}">${dur(seg)}</b>` : '<b class="fl-t-verde">em dia</b>')}</div>
              <div><small>Cores (min)</small><b class="fl-lims"><i class="fl-t-verde">&lt;${a.lim.verde_min}</i> <i class="fl-t-amarelo">&lt;${a.lim.amarelo_min}</i> <i class="fl-t-laranja">&lt;${a.lim.laranja_min}</i> <i class="fl-t-vermelho">+</i></b></div>
            </div>
            ${a.status === 'res' && a.resumo ? `<div class="fl-resumo"><small>Resumo do encerramento</small>${E(a.resumo)}</div>` : ''}
            ${(() => { const nm = a.usuario_nome; if (a.status === 'res') return nm ? `<div class="fl-selo fl-selo-res">${avatar(nm)}<span>Atendido por <b>${E(nm)}</b></span></div>` : ''; if (!nm) return `<div class="fl-selo fl-selo-esp"><span class="avatar fl-av"><i class="fa-solid fa-hourglass-half"></i></span><span>Aguardando um atendente</span></div>${S.det.aviso ? `<div class="fl-aviso">${E(S.det.aviso)}</div>` : ''}`; return `<div class="fl-selo ${meu ? 'fl-selo-meu' : 'fl-selo-out'} ${S.det.assumiuAgora ? 'fl-pop' : ''}">${avatar(nm)}<span>${meu ? 'Em atendimento por <b>você</b> (' + E(nm) + ')' : 'Em atendimento por <b>' + E(nm) + '</b>'}</span><i class="fa-solid fa-circle-check"></i></div>${S.det.aviso && !meu ? `<div class="fl-aviso">${E(S.det.aviso)}</div>` : ''}`; })()}
            ${lbq ? `<div class="fl-lbselo"><i class="fa-regular fa-clock"></i> Lembrete às <b>${ZZ.fmtHora(lbq)}</b>${new Date(lbq * 1000).toDateString() !== new Date().toDateString() ? ' (' + ZZ.fmtData(lbq) + ')' : ''}</div>` : ''}
            <button class="btn-azul w100 fl-conv" data-ac="conversa"><i class="fa-brands fa-whatsapp"></i> Abrir conversa</button>
            <div class="fl-acoes">${btns}</div>
            <p class="mut fl-dica">As respostas saem assinadas com o seu nome.</p>
            <h4 class="fl-h4">Linha do tempo</h4>
            <div class="fl-tl">${evs.length ? evs.map(ev => { const t = String(ev.tipo || '').toLowerCase(); const m = EVT[t] || ['fa-circle-dot', ev.tipo || 'Evento']; const ts = ev.ts || 0; const quem = ev.usuario_nome || ''; const det = ev.detalhe || ''; let rs = ev.resposta_s != null ? +ev.resposta_s : null; if (rs === null && t === 'assumiu' && a.criado && !evs.some(x => x.tipo === 'assumiu' && x.ts < ts)) rs = Math.max(0, ts - a.criado);
          const rc = rs !== null ? corPor(rs, a.lim) : ''; const resp = rc ? `<div class="fl-resp fl-t-${rc}"><i></i>${t === 'assumiu' ? 'assumido' : 'respondido'} em ${dur(rs)} — ${rc}</div>` : '';
          return `<div class="fl-ev"><span class="fl-evi"><i class="fa-solid ${m[0]}"></i></span><div><b>${E(m[1])}</b>${quem ? ` <span class="mut">por ${E(quem)}</span>` : ''}${det ? `<div class="fl-evt">${E(det)}</div>` : ''}${resp}<small class="mut">${ts ? ZZ.fmtDataHora(ts) : ''}</small></div></div>`; }).join('') : '<div class="vazio"><i class="fa-regular fa-clock"></i>Sem eventos ainda.</div>'}</div>
          </div>`;
        const r = ov.querySelector('.fl-det');
        r.querySelector('.fl-volta').onclick = fecharDet;
        r.querySelectorAll('[data-ac]').forEach(b => b.onclick = () => acao(b.dataset.ac, b, a));
      }
      async function acao(ac, btn, a) {
        if (ac === 'conversa') { fecharDet(); ZZ.ir('conversas', { jid: a.jid }); return; }
        if (ac === 'assumir') { await ZZ.busy(btn, async () => {
          const r = await ZZ.api('assumir_atendimento', { corpo: { id: a.id } });
          if (r.ok) { ZZ.toast('Você assumiu o atendimento', 'ok'); ZZ.vibrar([20, 40, 20]); S.det.assumiuAgora = true; S.det.assin = ''; S.aba = 'em'; S.vistos = null; pintaAbas(); await recarregarDet(true); carregar(true); }
          else { S.det.assin = ''; await recarregarDet(true); const d = S.det && S.det.dados; if (d && d.usuario_nome && !(ZZ.eu && +d.usuario_id === +ZZ.eu.usuario.id)) { S.det.aviso = 'Já assumido por ' + d.usuario_nome; pintaDet(); ZZ.toast('Já assumido por ' + d.usuario_nome, 'err'); } carregar(true); }
          return r; }); return; }
        if (ac === 'lembrar') { ZZ.lembrete.abrir(a.jid, a.nome, () => carregarLembr()); return; }
        if (ac === 'transferir') return modalTransferir(a);
        if (ac === 'encerrar') return modalEncerrar(a);
        if (ac === 'reabrir') { if (!await ZZ.confirmar('Reabrir este atendimento? Ele volta para a fila de espera.', 'Reabrir')) return; await ZZ.busy(btn, async () => { const r = await ZZ.api('reabrir_atendimento', { corpo: { id: a.id } }); if (r.ok) { ZZ.toast('Atendimento reaberto', 'ok'); S.det.assin = ''; await recarregarDet(true); carregar(true); } return r; }); }
      }
      function modalTransferir(a) {
        const filas = S.filas;
        const m = ZZ.modal(`<h3><i class="fa-solid fa-right-left"></i> Transferir atendimento</h3>
          <label>Para a fila</label><select id="t-fila"><option value="">Manter a fila atual</option>${filas.map(f => `<option value="${f.id}" ${+f.id === +a.fila_id ? 'disabled' : ''}>${E(f.nome)}</option>`).join('')}</select>
          <label>Para o atendente</label><select id="t-usr"></select>
          <label>Motivo (opcional)</label><textarea id="t-mot" maxlength="200" rows="3" placeholder="Ex.: assunto financeiro"></textarea>
          <div class="msg-campo" id="t-err" hidden>Escolha uma fila ou um atendente.</div>
          <div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-right-left"></i> Transferir</button></div>`);
        const sel = m.el.querySelector('#t-usr');
        const pinta = () => { const fid = +m.el.querySelector('#t-fila').value || +a.fila_id; const f = S.fmap[fid]; let us = f && f.membros.length ? f.membros.map(x => ({ id: x.id, nome: x.nome || (S.usuarios.find(u => u.id === x.id) || {}).nome || '#' + x.id })) : S.usuarios; sel.innerHTML = '<option value="">Deixar na fila (sem atendente)</option>' + us.map(u => `<option value="${u.id}">${E(u.nome)}</option>`).join(''); };
        pinta(); m.el.querySelector('#t-fila').onchange = pinta;
        m.el.querySelector('[data-n]').onclick = () => m.fechar();
        const bs = m.el.querySelector('[data-s]');
        bs.onclick = () => {
          const fila = m.el.querySelector('#t-fila').value, usr = sel.value;
          if (!fila && !usr) { m.el.querySelector('#t-err').hidden = false; sel.classList.add('erro-campo'); m.el.querySelector('#t-fila').classList.add('erro-campo'); ZZ.vibrar([30, 40, 30]); return; }
          ZZ.busy(bs, async () => { const r = await ZZ.api('transferir_atendimento', { corpo: { id: a.id, fila_id: fila ? +fila : null, usuario_id: usr ? +usr : null, motivo: m.el.querySelector('#t-mot').value.trim() } }); if (r.ok) { ZZ.toast('Atendimento transferido', 'ok'); m.fechar(); S.det && (S.det.assin = ''); await recarregarDet(true); carregar(true); } return r; });
        };
      }
      function modalEncerrar(a) {
        const m = ZZ.modal(`<h3><i class="fa-solid fa-circle-check"></i> Encerrar atendimento</h3><p class="mut">Registre um resumo do que foi resolvido (opcional).</p>
          <textarea id="e-res" maxlength="200" rows="4" placeholder="Resumo do atendimento"></textarea>
          <div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-circle-check"></i> Encerrar</button></div>`);
        m.el.querySelector('[data-n]').onclick = () => m.fechar();
        const bs = m.el.querySelector('[data-s]');
        bs.onclick = () => ZZ.busy(bs, async () => { const r = await ZZ.api('encerrar_atendimento', { corpo: { id: a.id, resumo: m.el.querySelector('#e-res').value.trim() } }); if (r.ok) { ZZ.toast('Atendimento encerrado', 'ok'); m.fechar(); S.det && (S.det.assin = ''); await recarregarDet(true); carregar(true); } return r; });
      }

      /* ----- novo atendimento ----- */
      function novoAtendimento() {
        const m = ZZ.modal(`<h3><i class="fa-solid fa-plus"></i> Novo atendimento</h3>
          <label>Contato</label><input type="search" id="n-q" placeholder="Buscar contato por nome ou número" autocomplete="off">
          <div class="fl-ctl" id="n-lista"><div class="vazio"><i class="fa-solid fa-address-book"></i>Digite para buscar.</div></div>
          <div id="n-esc" class="fl-esc" hidden></div>
          <label>Fila</label><select id="n-fila">${S.filas.map(f => `<option value="${f.id}">${E(f.nome)}</option>`).join('') || '<option value="">Sem filas</option>'}</select>
          <div class="msg-campo" id="n-err" hidden></div>
          <div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-plus"></i> Criar</button></div>`);
        let esc = null; const lista = m.el.querySelector('#n-lista');
        const busca = async () => {
          const q = m.el.querySelector('#n-q').value.trim(); lista.innerHTML = ZZ.skeleton(3, 'skel-linha fl-skel2');
          const j = await ZZ.api('contatos', { params: { q, pag: 1 }, silencioso: true });
          if (!j.ok) { lista.innerHTML = '<div class="vazio"><i class="fa-solid fa-cloud-bolt"></i>Não foi possível buscar contatos.</div>'; return; }
          const cs = (j.contatos || []).slice(0, 30);
          lista.innerHTML = cs.length ? cs.map(c => `<button class="fl-ct" data-j="${E(c.jid)}" data-n="${E(c.nome || c.numero)}">${avatar(c.nome || c.numero, c.foto)}<span><b>${E(c.nome || ZZ.fmtNumero(c.numero))}</b><small>${E(ZZ.fmtNumero(c.numero))}</small></span></button>`).join('') : '<div class="vazio"><i class="fa-solid fa-user-slash"></i>Nenhum contato encontrado.</div>';
          lista.querySelectorAll('.fl-ct').forEach(b => b.onclick = () => { esc = { jid: b.dataset.j, nome: b.dataset.n }; lista.querySelectorAll('.fl-ct').forEach(x => x.classList.toggle('fl-sel', x === b)); const e = m.el.querySelector('#n-esc'); e.hidden = false; e.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${E(esc.nome)}`; m.el.querySelector('#n-err').hidden = true; ZZ.vibrar(8); });
        };
        m.el.querySelector('#n-q').oninput = ZZ.debounce(busca, 350); busca();
        m.el.querySelector('[data-n]').onclick = () => m.fechar();
        const bs = m.el.querySelector('[data-s]');
        bs.onclick = () => {
          const er = m.el.querySelector('#n-err'); const fila = m.el.querySelector('#n-fila').value;
          if (!esc) { er.hidden = false; er.textContent = 'Escolha um contato da lista.'; lista.classList.add('erro-campo'); ZZ.vibrar([30, 40, 30]); return; }
          if (!fila) { er.hidden = false; er.textContent = 'Crie uma fila antes de iniciar um atendimento.'; return; }
          ZZ.busy(bs, async () => { const r = await ZZ.api('criar_atendimento', { corpo: { jid: esc.jid, fila_id: +fila } }); if (r.ok) { ZZ.toast(r.ja_existia ? 'Este contato já tinha um atendimento aberto' : 'Atendimento criado e assumido por você', 'ok'); m.fechar(); S.aba = 'em'; S.vistos = null; pintaAbas(); carregar(true); const nid = r.atendimento && r.atendimento.id; if (nid) abrirDet(nid); } return r; });
        };
      }

      /* ----- gestão das filas ----- */
      function gerirFilas() {
        const m = ZZ.modal(`<h3><i class="fa-solid fa-sliders"></i> Gerir filas</h3><div id="g-lista">${ZZ.skeleton(3, 'skel-linha fl-skel2')}</div><div class="acoes"><button class="btn-soft" data-f>Fechar</button><button class="btn-azul" data-nova><i class="fa-solid fa-plus"></i> Nova fila</button></div>`);
        m.el.classList.add('fl-gm');
        m.el.querySelector('[data-f]').onclick = () => m.fechar();
        m.el.querySelector('[data-nova]').onclick = () => { m.fechar(); editorFila(null); };
        (async () => {
          await carregarFilas(); const box = m.el.querySelector('#g-lista');
          if (!S.filas.length) { box.innerHTML = '<div class="vazio fl-vazio"><i class="fa-solid fa-layer-group"></i><b>Nenhuma fila criada</b><div>Crie a primeira fila para organizar os atendimentos.</div></div>'; return; }
          const pinta = () => {
            box.innerHTML = S.filas.map((f, i) => `<div class="fl-gf" style="--c:${E(f.cor)}" data-id="${f.id}"><span class="fl-gcor"></span><div class="fl-gt"><b>${E(f.nome)}</b><small>${f.membros.length} atendente(s)${f.sla_min ? ' · SLA ' + f.sla_min + ' min' : ''}</small></div><button class="btn-soft btn-sm" data-up ${i === 0 ? 'disabled' : ''} aria-label="Subir"><i class="fa-solid fa-arrow-up"></i></button><button class="btn-soft btn-sm" data-dn ${i === S.filas.length - 1 ? 'disabled' : ''} aria-label="Descer"><i class="fa-solid fa-arrow-down"></i></button><button class="btn-soft btn-sm" data-ed aria-label="Editar"><i class="fa-solid fa-pen"></i></button><button class="btn-perigo btn-sm" data-ex aria-label="Excluir"><i class="fa-solid fa-trash"></i></button></div>`).join('');
            box.querySelectorAll('.fl-gf').forEach(r => {
              const f = S.fmap[r.dataset.id], i = S.filas.indexOf(f);
              const mover = d => b => ZZ.busy(b, async () => { const a = S.filas.slice(); [a[i], a[i + d]] = [a[i + d], a[i]]; const j = await ZZ.api('ordenar_filas', { corpo: { ids: a.map(x => x.id) } }); if (j.ok) { S.filas = a; pinta(); pintaPilulas(); } return j; });
              r.querySelector('[data-up]').onclick = e => mover(-1)(e.currentTarget); r.querySelector('[data-dn]').onclick = e => mover(1)(e.currentTarget);
              r.querySelector('[data-ed]').onclick = () => { m.fechar(); editorFila(f); };
              r.querySelector('[data-ex]').onclick = async e => { const b = e.currentTarget; if (!await ZZ.confirmar(`Excluir a fila "${f.nome}"? Atendimentos dela podem ficar sem fila.`, 'Excluir', true)) return; ZZ.busy(b, async () => { const j = await ZZ.api('excluir_fila', { corpo: { id: f.id } }); if (j.ok) { ZZ.toast('Fila excluída', 'ok'); await carregarFilas(); pinta(); carregar(true); } return j; }); };
            });
          }; pinta();
        })();
      }
      async function editorFila(f) {
        f = f || { id: 0, nome: '', cor: CORES[0], membros: [], saudacao: '', ausencia: '', horario: {}, horario_ativo: false, sla_min: 0, sla_limites: { ...LIM0 } };
        let us = S.usuarios.slice(); // atendentes que o servidor aceita (com permissão e nesta conexão)
        f.membros.forEach(x => { if (!us.find(u => u.id === x.id)) us.push({ id: x.id, nome: x.nome || '#' + x.id }); });
        const mem = new Set(f.membros.map(x => x.id)); const hor = {}; for (let d = 0; d < 7; d++) hor[d] = (f.horario[d] || []).map(x => ({ ...x }));
        const m = ZZ.modal(`<h3><i class="fa-solid fa-layer-group"></i> ${f.id ? 'Editar fila' : 'Nova fila'}</h3>
          <label>Nome</label><input type="text" id="f-nome" maxlength="40" value="${E(f.nome)}" placeholder="Ex.: Suporte">
          <label>Cor</label><div class="fl-cores" id="f-cores">${CORES.map(c => `<button type="button" class="fl-cor ${c.toLowerCase() === f.cor.toLowerCase() ? 'fl-sel' : ''}" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}<input type="color" id="f-cor" value="${E(/^#[0-9a-f]{6}$/i.test(f.cor) ? f.cor : CORES[0])}" aria-label="Outra cor"></div>
          <label>Atendentes da fila</label><div class="fl-mem" id="f-mem">${us.length ? us.map(u => `<label class="fl-chk"><input type="checkbox" value="${u.id}" ${mem.has(u.id) ? 'checked' : ''}><span>${E(u.nome)}</span></label>`).join('') : '<div class="mut">Nenhum usuário disponível para listar.</div>'}</div>
          <label>Mensagem de saudação</label><textarea id="f-sau" maxlength="1000" rows="3" placeholder="Enviada quando o cliente entra na fila">${E(f.saudacao)}</textarea>
          <label>Mensagem de ausência (fora do horário)</label><textarea id="f-aus" maxlength="1000" rows="3" placeholder="Enviada fora do horário de atendimento">${E(f.ausencia)}</textarea>
          <label>SLA — tempo máximo de espera (minutos, 0 = sem SLA)</label><input type="number" id="f-sla" min="0" max="1440" inputmode="numeric" value="${f.sla_min || 0}">
          <label>Cores pelo tempo sem resposta (minutos)</label>
          <div class="fl-lim"><label><i class="fl-t-verde"></i>Verde até<input type="number" id="f-l1" min="1" max="1440" inputmode="numeric" value="${(f.sla_limites || LIM0).verde_min}"></label><label><i class="fl-t-amarelo"></i>Amarelo até<input type="number" id="f-l2" min="1" max="1440" inputmode="numeric" value="${(f.sla_limites || LIM0).amarelo_min}"></label><label><i class="fl-t-laranja"></i>Laranja até<input type="number" id="f-l3" min="1" max="1440" inputmode="numeric" value="${(f.sla_limites || LIM0).laranja_min}"></label></div>
          <div class="fl-prev" id="f-prev"></div><small class="mut">Depois do último limite o atendimento fica vermelho e pulsa. Padrão: 5 / 15 / 30.</small>
          <label class="fl-chk fl-hh"><input type="checkbox" id="f-pad" ${f.padrao ? 'checked' : ''}><span>Fila padrão (recebe quem não escolheu fila)</span></label>
          <label class="fl-chk fl-hh"><input type="checkbox" id="f-hat" ${f.horario_ativo ? 'checked' : ''}><span>Usar horário de atendimento</span></label>
          <div id="f-hor" class="fl-hor"></div>
          <div class="msg-campo" id="f-err" hidden></div>
          <div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-floppy-disk"></i> Salvar</button></div>`);
        m.el.classList.add('fl-gm');
        let cor = f.cor; const q = s => m.el.querySelector(s);
        m.el.querySelectorAll('.fl-cor').forEach(b => b.onclick = () => { cor = b.dataset.c; m.el.querySelectorAll('.fl-cor').forEach(x => x.classList.toggle('fl-sel', x === b)); q('#f-cor').value = cor; });
        q('#f-cor').oninput = e => { cor = e.target.value; m.el.querySelectorAll('.fl-cor').forEach(x => x.classList.remove('fl-sel')); };
        const pintaHor = () => {
          const box = q('#f-hor'); box.hidden = !q('#f-hat').checked;
          box.innerHTML = DIAS.map((n, d) => `<div class="fl-dia"><div class="fl-dn"><b>${n}</b>${hor[d].length ? '' : '<span class="mut">fechado</span>'}<button type="button" class="btn-soft btn-sm" data-add="${d}" ${hor[d].length >= 4 ? 'disabled' : ''}><i class="fa-solid fa-plus"></i> Faixa</button></div>${hor[d].map((x, i) => `<div class="fl-fx"><input type="time" value="${E(x.de)}" data-d="${d}" data-i="${i}" data-k="de"><span>às</span><input type="time" value="${E(x.ate)}" data-d="${d}" data-i="${i}" data-k="ate"><button type="button" class="btn-perigo btn-sm" data-rm="${d}:${i}" aria-label="Remover faixa"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}</div>`).join('');
          box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { hor[b.dataset.add].push({ de: '08:00', ate: '18:00' }); pintaHor(); });
          box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const [d, i] = b.dataset.rm.split(':'); hor[d].splice(+i, 1); pintaHor(); });
          box.querySelectorAll('input[type=time]').forEach(i => i.onchange = () => { hor[i.dataset.d][i.dataset.i][i.dataset.k] = i.value; i.classList.remove('erro-campo'); });
        };
        const lims = () => [1, 2, 3].map(i => Math.max(0, +q('#f-l' + i).value || 0));
        const prev = () => { const l = lims(); const t = l[2] * 1.4 || 1; const seg = [[l[0], 'verde'], [l[1] - l[0], 'amarelo'], [l[2] - l[1], 'laranja'], [Math.max(1, l[2] * .4), 'vermelho']]; q('#f-prev').innerHTML = seg.map(x => `<span style="flex:${Math.max(.2, x[0])};background:${CS_HEX[x[1]]}">${x[1] === 'vermelho' ? '+' + l[2] : (x[1] === 'verde' ? l[0] : l[CS.indexOf(x[1])])}</span>`).join(''); };
        [1, 2, 3].forEach(i => q('#f-l' + i).oninput = prev); prev();
        pintaHor(); q('#f-hat').onchange = pintaHor;
        q('[data-n]').onclick = () => m.fechar();
        const bs = q('[data-s]');
        bs.onclick = () => {
          const er = q('#f-err'); er.hidden = true; q('#f-nome').classList.remove('erro-campo');
          const nome = q('#f-nome').value.trim();
          if (!nome) { q('#f-nome').classList.add('erro-campo'); er.hidden = false; er.textContent = 'Informe o nome da fila.'; q('#f-nome').focus(); ZZ.vibrar([30, 40, 30]); return; }
          const lm = lims(); if (!(lm[0] >= 1 && lm[0] < lm[1] && lm[1] < lm[2])) { er.hidden = false; er.textContent = 'Os limites das cores devem ser crescentes (ex.: 5, 15, 30).'; [1, 2, 3].forEach(i => q('#f-l' + i).classList.add('erro-campo')); ZZ.vibrar([30, 40, 30]); return; }
          const usar = q('#f-hat').checked; const horOut = {};
          for (let d = 0; d < 7; d++) { horOut[DK[d]] = []; for (const x of hor[d]) { if (!x.de || !x.ate || x.de >= x.ate) { if (usar) { er.hidden = false; er.textContent = `Horário inválido em ${DIAS[d]}: o início deve ser antes do fim.`; ZZ.vibrar([30, 40, 30]); return; } continue; } horOut[DK[d]].push([x.de, x.ate]); } }
          const body = { id: f.id || undefined, ativa: f.ativa, padrao: q('#f-pad').checked, nome, cor, usuarios: [...q('#f-mem').querySelectorAll('input:checked')].map(i => +i.value), saudacao: q('#f-sau').value.trim(), sla_verde_min: lm[0], sla_amarelo_min: lm[1], sla_laranja_min: lm[2], mensagem_ausencia: q('#f-aus').value.trim(), sla_min: Math.max(0, +q('#f-sla').value || 0), horario: usar ? horOut : null };
          ZZ.busy(bs, async () => { const r = await ZZ.api('salvar_fila', { corpo: body }); if (r.ok) { ZZ.toast('Fila salva', 'ok'); m.fechar(); await carregarFilas(); carregar(true); } return r; });
        };
      }

      /* ----- partida ----- */
      pintaAbas();
      (async () => { await carregarFilas(); await carregar(true); carregarRt(); S.vistos = S.vistos || new Set(S.itens.map(a => String(a.id))); if (P.id) abrirDet(P.id); })();
      if (window._flTic) clearInterval(window._flTic); window._flTic = setInterval(() => { if (document.getElementById('fl-raiz')) tictac(); }, 1000);
      let n4 = 0; ZZ.poll(() => { if (++n4 % 4 === 0) { carregarFilas(); carregarLembr(); } carregar(false); carregarMeus(); }, 4000);
      setTimeout(carregarMeus, 700); carregarLembr();
    },
    destroy() {
      if (window._flLb) { document.removeEventListener('zz:lembretes', window._flLb); window._flLb = null; }
      if (window._flTic) { clearInterval(window._flTic); window._flTic = null; }
      const o = document.querySelector('.fl-ov'); if (o) o.remove(); document.body.classList.remove('fl-trava');
    }
  });
})();
