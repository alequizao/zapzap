/* Relatórios — KPIs clicáveis, gráfico por dia, origem, rankings, heatmap dia×hora e exportação CSV. */
(function () {
  'use strict';
  const CHART_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  const CHAVE_PER = 'zz_rel_periodo', CHAVE_DE = 'zz_rel_de', CHAVE_ATE = 'zz_rel_ate';
  const CORES = ['#2563EB', '#25D366', '#6a4cff', '#c47f12', '#d9433a', '#0ea5e9', '#8b5cf6', '#64748b'];
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ROTULOS = { enviadas: 'Enviadas', recebidas: 'Recebidas', total: 'Mensagens', mensagens: 'Mensagens', conversas: 'Conversas', contatos: 'Contatos', atendimentos: 'Atendimentos', agendadas: 'Agendadas', erros: 'Erros de envio', campanhas: 'Campanhas', automacoes: 'Automações', chatbot: 'Chatbot', novos_contatos: 'Novos contatos' };
  const ICONES = { resolvidos: ['fa-circle-check', '#e6f7ee', '#1e9e57'], campanhas: ['fa-bullhorn', '#f0eefe', '#6a4cff'], resposta: ['fa-stopwatch', '#fff4e0', '#c47f12'], enviadas: ['fa-arrow-up', '#e7f0ff', '#2563EB'], recebidas: ['fa-arrow-down', '#e6f7ee', '#1e9e57'], conversas: ['fa-comments', '#f0eefe', '#6a4cff'], contatos: ['fa-address-book', '#fff4e0', '#c47f12'], atendimentos: ['fa-headset', '#e7f0ff', '#2563EB'], agendadas: ['fa-clock', '#fff4e0', '#c47f12'], erros: ['fa-triangle-exclamation', '#fdecec', '#d9433a'] };
  const INVERSO = { erros: 1 }; // aumento é ruim

  let raiz = null, chartPromessa = null, graf = null, rosca = null, reqId = 0, vivo = false, assin = '';
  let per = 'sete', de = '', ate = '', tipoGraf = 'bar', dados = null, modalGraf = null;

  const num = n => Number(n || 0).toLocaleString('pt-BR');
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  const ler = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const carregarChart = () => {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (!chartPromessa) chartPromessa = new Promise((ok, falha) => {
      const s = document.createElement('script'); s.src = CHART_URL; s.async = true;
      s.onload = () => ok(window.Chart); s.onerror = () => { chartPromessa = null; falha(new Error('chart')); };
      document.head.appendChild(s);
    });
    return chartPromessa;
  };
  const iso = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Maceio' }).format(d);
  const hojeIso = () => iso(new Date());
  const somar = (s, n) => { const p = s.split('-'); const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.toISOString().slice(0, 10); };
  const br = s => { const p = String(s).split('-'); return p[2] + '/' + p[1]; };
  function intervalo() {
    const h = hojeIso();
    if (per === 'hoje') return [h, h];
    if (per === 'sete') return [somar(h, -6), h];
    if (per === 'trinta') return [somar(h, -29), h];
    if (per === 'mes') return [h.slice(0, 8) + '01', h];
    let a = de || h, b = ate || h; if (a > b) [a, b] = [b, a]; return [a, b];
  }
  const arr = (j, ...ks) => { for (const k of ks) if (j && Array.isArray(j[k])) return j[k]; return []; };

  /* ---------- normalização tolerante das respostas ---------- */
  const dur = s => { s = Math.round(+s || 0); if (s < 60) return s + ' s'; if (s < 3600) return Math.round(s / 60) + ' min'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h + ' h' + (m ? ' ' + m + ' min' : ''); };
  const caminho = (o, c) => c.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const DEFS = [
    { id: 'enviadas', rotulo: 'Mensagens enviadas', p: 'mensagens.enviadas', v: 'mensagens_enviadas', serie: 'enviadas' },
    { id: 'recebidas', rotulo: 'Mensagens recebidas', p: 'mensagens.recebidas', v: 'mensagens_recebidas', serie: 'recebidas' },
    { id: 'atendimentos', rotulo: 'Atendimentos', p: 'atendimentos.total', v: 'atendimentos', serie: 'atendimentos', ex: 'atendimentos' },
    { id: 'resolvidos', rotulo: 'Atend. resolvidos', p: 'atendimentos.resolvidos', v: 'atendimentos_resolvidos', ex: 'atendimentos' },
    { id: 'erros', rotulo: 'Falhas de envio', p: 'envios.falha', v: 'enviados_falha', ex: 'envios' },
    { id: 'campanhas', rotulo: 'Campanhas enviadas', p: 'campanhas.enviadas', v: 'campanhas_enviadas', ex: 'campanhas' },
    { id: 'resposta', rotulo: '1ª resposta (média)', p: 'atendimentos.tempo_1a_resposta_s', fmt: dur, ex: 'atendimentos' }
  ];
  function normalizarCards(j) {
    const at = j.atual || {}, an = (j.anterior && j.anterior.dados) || {}, va = j.variacao || {};
    return DEFS.filter(d => { const v = caminho(at, d.p); return v != null && (caminho(at, d.p.split('.')[0] + '.disponivel') !== false); }).map(d => {
      const v = +caminho(at, d.p) || 0, a = caminho(an, d.p), pv = d.v ? va[d.v] : null;
      return { id: d.id, rotulo: d.rotulo, valor: v, anterior: a == null ? null : +a, variacao: pv == null ? null : +pv, serie: d.serie, fmt: d.fmt, grupo: d.ex ? at[d.ex] : null, novo: pv == null && v > 0 && (a == null || +a === 0) };
    });
  }
  const valorItem = x => { for (const k of ['total', 'valor', 'enviadas', 'mensagens', 'atendimentos', 'qtd']) if (x[k] != null) return +x[k] || 0; return 0; };
  const nomeItem = x => String(x.nome || x.usuario || x.fila || x.origem || x.rotulo || '—');
  function normalizarOrigem(r) {
    let o = r && (r.por_origem || r.origens); if (!o) return [];
    if (!Array.isArray(o)) o = Object.keys(o).map(k => ({ origem: k, total: o[k] }));
    const nomes = { painel: 'Painel', agenda: 'Agendadas', automacao: 'Automações', chatbot: 'Chatbot', fila: 'Filas', campanha: 'Campanhas', api: 'API' };
    return o.map(x => ({ nome: nomes[nomeItem(x)] || nomeItem(x), valor: valorItem(x) })).filter(x => x.valor > 0);
  }
  function normalizarMatriz(j) {
    const m = Array.from({ length: 7 }, () => Array(24).fill(0));
    const mat = j.matriz || j.mapa || j.dados;
    if (Array.isArray(mat) && Array.isArray(mat[0])) mat.slice(0, 7).forEach((l, d) => l.slice(0, 24).forEach((v, h) => { m[d][h] = +v || 0; }));
    else arr(j, 'celulas', 'itens').forEach(c => { const d = +(c.dia_semana ?? c.dia), h = +c.hora; if (d >= 0 && d < 7 && h >= 0 && h < 24) m[d][h] = +(c.total ?? c.valor ?? 0) || 0; });
    return m;
  }

  /* ---------- casca ---------- */
  function pilulas() {
    const P = [['hoje', 'Hoje'], ['sete', '7 dias'], ['trinta', '30 dias'], ['mes', 'Mês'], ['custom', 'Personalizado']];
    return `<div class="rl-pils" role="tablist" aria-label="Período">${P.map(p => `<button class="rl-pil${per === p[0] ? ' ativo' : ''}" role="tab" aria-selected="${per === p[0]}" data-p="${p[0]}">${p[1]}</button>`).join('')}</div>
      <div class="rl-datas" id="rlDatas" ${per === 'custom' ? '' : 'hidden'}><label>De<input type="date" id="rlDe" value="${ZZ.esc(de || hojeIso())}"></label><label>Até<input type="date" id="rlAte" value="${ZZ.esc(ate || hojeIso())}"></label></div>`;
  }
  function casca() {
    return `<div class="rl-topo">${pilulas()}</div>
    <div class="rl-barra"><span class="rl-per mut" id="rlPer"></span><span class="vivo" id="rlVivo" hidden>ao vivo</span>${ZZ.pode('relatorios.exportar') ? '<button class="btn-soft btn-sm rl-exp" id="rlExp"><i class="fa-solid fa-file-csv"></i> Exportar CSV</button>' : ''}</div>
    <div class="rl-kpis" id="rlKpis">${ZZ.skeleton(4, 'skel rl-sk-kpi')}</div>
    <section class="card-soft rl-bloco" aria-labelledby="rlGT">
      <div class="ch rl-ch"><span id="rlGT"><i class="fa-solid fa-chart-column"></i> Mensagens por dia</span>
        <span class="rl-alt" role="group" aria-label="Tipo de gráfico"><button data-t="bar" class="${tipoGraf === 'bar' ? 'ativo' : ''}" aria-label="Barras"><i class="fa-solid fa-chart-column"></i></button><button data-t="line" class="${tipoGraf === 'line' ? 'ativo' : ''}" aria-label="Linhas"><i class="fa-solid fa-chart-line"></i></button></span></div>
      <div class="rl-leg"><span><i class="rl-pt" style="background:#2563EB"></i>Enviadas</span><span><i class="rl-pt" style="background:#25D366"></i>Recebidas</span></div>
      <div class="rl-graf" id="rlGrafBox"><canvas id="rlGraf" role="img" aria-label="Gráfico de mensagens enviadas e recebidas por dia; valores na tabela abaixo"></canvas></div>
      <div class="rl-graf-erro mut" id="rlGrafErro" hidden>Não foi possível carregar o gráfico. Os valores estão na tabela abaixo.</div>
      <div class="rolar-x"><table class="tabela rl-tab" id="rlTab"></table></div>
    </section>
    <section class="card-soft rl-bloco" aria-labelledby="rlOT"><div class="ch"><span id="rlOT"><i class="fa-solid fa-chart-pie"></i> Origem dos envios</span></div><div id="rlOrigem"></div></section>
    <section class="card-soft rl-bloco" aria-labelledby="rlUT"><div class="ch"><span id="rlUT"><i class="fa-solid fa-user-group"></i> Ranking por usuário</span></div><div id="rlUsr">${ZZ.skeleton(3)}</div></section>
    <section class="card-soft rl-bloco" aria-labelledby="rlFT"><div class="ch"><span id="rlFT"><i class="fa-solid fa-layer-group"></i> Ranking por fila</span></div><div id="rlFila">${ZZ.skeleton(3)}</div></section>
    <section class="card-soft rl-bloco" aria-labelledby="rlHT"><div class="ch"><span id="rlHT"><i class="fa-solid fa-table-cells"></i> Horários de pico</span></div><div id="rlHeat">${ZZ.skeleton(3)}</div></section>`;
  }

  /* ---------- KPIs ---------- */
  function seta(c) {
    if (c.variacao == null) return c.novo ? '<span class="rl-var rl-bom"><i class="fa-solid fa-arrow-trend-up"></i> novo<small> vs. anterior</small></span>' : '<span class="rl-var rl-neu mut">sem comparação</span>';
    const v = c.variacao, ruim = INVERSO[c.id] ? v > 0 : v < 0, zero = Math.abs(v) < 0.05;
    const cls = zero ? 'rl-neu' : (ruim ? 'rl-ruim' : 'rl-bom');
    return `<span class="rl-var ${cls}"><i class="fa-solid ${zero ? 'fa-minus' : v > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i> ${zero ? '0' : (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%<small> vs. anterior</small></span>`;
  }
  function animar(n, a, b) {
    const t0 = performance.now(), dur = 700;
    const passo = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); n.textContent = num(Math.round(a + (b - a) * e)); if (p < 1 && n.isConnected) requestAnimationFrame(passo); else n.textContent = num(b); };
    requestAnimationFrame(passo);
  }
  function pintarKpis(cards) {
    const el = ZZ.$('#rlKpis', raiz);
    if (!cards.length) { el.innerHTML = '<div class="vazio rl-vz"><i class="fa-solid fa-chart-simple"></i>Sem dados neste período</div>'; return; }
    const mesmo = el.children.length === cards.length && cards.every((c, i) => el.children[i].dataset.k === String(c.id));
    if (mesmo) {
      cards.forEach((c, i) => {
        const b = el.children[i], n = ZZ.$('.num', b), ant = +n.dataset.v;
        if (ant !== c.valor) { if (c.fmt) n.textContent = c.fmt(c.valor); else animar(n, ant, c.valor); n.dataset.v = c.valor; b.classList.remove('rl-pisca'); void b.offsetWidth; b.classList.add('rl-pisca'); }
        ZZ.$('.rl-vw', b).innerHTML = seta(c);
      });
      return;
    }
    el.innerHTML = cards.map(c => {
      const ic = ICONES[c.id] || ['fa-chart-simple', '#e7f0ff', '#2563EB'];
      return `<button class="card-soft rl-kpi" data-k="${ZZ.esc(c.id)}" aria-label="${ZZ.esc(c.rotulo)}: ${c.fmt ? c.fmt(c.valor) : num(c.valor)}. Ver detalhes"><span class="rl-kic" style="background:${ic[1]};color:${ic[2]}"><i class="fa-solid ${ic[0]}"></i></span>
        <span class="num" data-v="${c.valor}" ${c.fmt ? 'data-f="1"' : ''}>0</span><span class="lbl">${ZZ.esc(c.rotulo)}</span><span class="rl-vw">${seta(c)}</span><i class="fa-solid fa-chevron-right rl-go" aria-hidden="true"></i></button>`;
    }).join('');
    ZZ.$$('.rl-kpi', el).forEach((b, i) => cards[i].fmt ? (ZZ.$('.num', b).textContent = cards[i].fmt(cards[i].valor)) : animar(ZZ.$('.num', b), 0, cards[i].valor));
  }

  /* ---------- gráfico principal ---------- */
  const optsBase = () => ({ responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { padding: 12, titleFont: { size: 14, family: 'Inter' }, bodyFont: { size: 14, family: 'Inter' }, boxPadding: 6, caretSize: 8, cornerRadius: 10 } },
    scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { family: 'Inter', size: 11 } } }, y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Inter', size: 11 } }, grid: { color: '#ECECEC' } } } });
  const dsDia = (dias, tipo) => [['enviadas', 'Enviadas', '#2563EB'], ['recebidas', 'Recebidas', '#25D366']].map(s => ({ label: s[1], data: dias.map(x => +x[s[0]] || 0), backgroundColor: tipo === 'bar' ? s[2] : s[2] + '22', borderColor: s[2], borderWidth: 2, borderRadius: 6, maxBarThickness: 22, tension: .3, fill: tipo === 'line', pointRadius: 3, pointHitRadius: 18 }));
  function pintarTabela(dias) {
    const t = ZZ.$('#rlTab', raiz);
    if (!dias.length) { t.innerHTML = ''; return; }
    t.innerHTML = '<caption class="rl-cap">Mensagens por dia</caption><thead><tr><th scope="col">Dia</th><th scope="col">Enviadas</th><th scope="col">Recebidas</th></tr></thead><tbody>'
      + dias.map(x => `<tr><th scope="row">${ZZ.esc(br(x.dia))}</th><td>${num(x.enviadas)}</td><td>${num(x.recebidas)}</td></tr>`).join('') + '</tbody>';
  }
  async function pintarGrafico(dias, recriar) {
    const box = ZZ.$('#rlGrafBox', raiz), er = ZZ.$('#rlGrafErro', raiz);
    if (!dias.length) { box.hidden = true; er.hidden = true; if (graf) { graf.destroy(); graf = null; } return; }
    const lab = dias.map(x => br(x.dia));
    try {
      const C = await carregarChart(); if (!raiz || !raiz.isConnected) return;
      box.hidden = false; er.hidden = true;
      if (graf && !recriar) { graf.data.labels = lab; dsDia(dias, tipoGraf).forEach((d, i) => { graf.data.datasets[i].data = d.data; }); graf.update(); return; }
      if (graf) graf.destroy();
      graf = new C(ZZ.$('#rlGraf', raiz), { type: tipoGraf, data: { labels: lab, datasets: dsDia(dias, tipoGraf) }, options: optsBase() });
    } catch (e) { box.hidden = true; er.hidden = false; }
  }
  async function pintarOrigem(lista) {
    const el = ZZ.$('#rlOrigem', raiz);
    if (!lista.length) { if (rosca) { rosca.destroy(); rosca = null; } el.innerHTML = '<div class="vazio"><i class="fa-solid fa-chart-pie"></i>Sem dados neste período</div>'; return; }
    const tot = lista.reduce((s, x) => s + x.valor, 0);
    if (!ZZ.$('#rlRosca', el)) el.innerHTML = '<div class="rl-rosca"><div class="rl-rosca-c"><canvas id="rlRosca" role="img" aria-label="Rosca com a origem dos envios; valores na legenda"></canvas></div><ul class="rl-rleg" id="rlRLeg"></ul></div>';
    ZZ.$('#rlRLeg', el).innerHTML = lista.map((x, i) => `<li><i class="rl-pt" style="background:${CORES[i % CORES.length]}"></i><span>${ZZ.esc(x.nome)}</span><b>${num(x.valor)}</b><small class="mut">${Math.round(x.valor / tot * 100)}%</small></li>`).join('');
    try {
      const C = await carregarChart(); if (!raiz || !raiz.isConnected) return;
      const data = { labels: lista.map(x => x.nome), datasets: [{ data: lista.map(x => x.valor), backgroundColor: lista.map((x, i) => CORES[i % CORES.length]), borderWidth: 2, borderColor: '#fff' }] };
      if (rosca) { rosca.data = data; rosca.update(); return; }
      rosca = new C(ZZ.$('#rlRosca', el), { type: 'doughnut', data, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', animation: { duration: 500 }, plugins: { legend: { display: false }, tooltip: { padding: 12, titleFont: { size: 14 }, bodyFont: { size: 14 } } } } });
    } catch (e) { }
  }

  /* ---------- rankings ---------- */
  function ranking(sel, itens, vazioMsg) {
    const el = ZZ.$(sel, raiz);
    itens = itens.slice().sort((a, b) => b.valor - a.valor);
    if (!itens.length || !itens.some(x => x.valor)) { el.innerHTML = `<div class="vazio"><i class="fa-solid fa-ranking-star"></i>${vazioMsg}</div>`; return; }
    const max = Math.max(...itens.map(x => x.valor), 1);
    el.innerHTML = '<ol class="rl-rank">' + itens.slice(0, 15).map((x, i) => `<li><div class="rl-rk-t"><span class="rl-rk-n">${i + 1}. ${ZZ.esc(x.nome)}</span><b>${num(x.valor)}</b></div><div class="rl-rk-b" role="presentation"><i style="width:${Math.max(2, Math.round(x.valor / max * 100))}%"></i></div>${x.extra ? `<small class="mut">${ZZ.esc(x.extra)}</small>` : ''}</li>`).join('') + '</ol>';
  }
  const itensUsuario = (u, r) => {
    const at = arr(u, 'atendentes').filter(x => +x.total > 0);
    if (at.length) return at.map(x => ({ nome: nomeItem(x), valor: +x.total, extra: `${num(x.resolvidos)} resolvidos${x.tempo_1a_resposta_s != null ? ' · 1ª resposta ' + dur(x.tempo_1a_resposta_s) : ''}` }));
    return arr(u, 'usuarios').map(x => ({ nome: nomeItem(x), valor: +x.acoes || 0, extra: `${num(x.envios)} envios · ${num(x.agendamentos)} agendados${x.erros ? ' · ' + num(x.erros) + ' erros' : ''}` }));
  };
  const itensFila = f => arr(f, 'filas').map(x => ({ nome: nomeItem(x), valor: +x.total || 0, extra: `${num(x.resolvidos)} resolvidos · ${num(x.em_andamento)} em andamento${x.tempo_1a_resposta_s != null ? ' · 1ª resposta ' + dur(x.tempo_1a_resposta_s) : ''}` }));

  /* ---------- heatmap ---------- */
  function heatmap(m) {
    const el = ZZ.$('#rlHeat', raiz), max = Math.max(...m.flat(), 0);
    if (!max) { el.innerHTML = '<div class="vazio"><i class="fa-solid fa-table-cells"></i>Sem dados neste período</div>'; return; }
    let h = '<div class="rl-hm" role="group" aria-label="Mapa de calor de mensagens por dia da semana e hora"><div class="rl-hm-eixo"><span></span>' + Array.from({ length: 24 }, (_, i) => `<span>${i % 6 === 0 ? i + 'h' : ''}</span>`).join('') + '</div>';
    m.forEach((l, d) => { h += `<div class="rl-hm-l"><span class="rl-hm-d">${DIAS[d]}</span>` + l.map((v, hr) => `<button class="rl-c" style="--i:${v ? (0.14 + 0.86 * v / max).toFixed(2) : 0}" data-d="${d}" data-h="${hr}" data-v="${v}" aria-label="${DIAS[d]}, ${hr}h: ${v} mensagens"></button>`).join('') + '</div>'; });
    h += '</div><div class="rl-hm-info mut" id="rlHmInfo" aria-live="polite">Toque numa célula para ver o valor.</div><div class="rl-hm-esc mut"><span>menos</span><i></i><span>mais</span></div>';
    el.innerHTML = h;
  }

  /* ---------- carga ---------- */
  function erroTela(msg) {
    raiz.innerHTML = `<div class="rl-topo">${pilulas()}</div><div class="card-soft rl-erro" role="alert"><i class="fa-solid fa-triangle-exclamation"></i><b>Não foi possível carregar os relatórios</b><span class="mut">${ZZ.esc(msg || 'Verifique a conexão e tente de novo.')}</span><button class="btn-azul" id="rlTentar"><i class="fa-solid fa-rotate"></i> Tentar de novo</button></div>`;
    ZZ.$('#rlTentar', raiz).onclick = e => ZZ.busy(e.currentTarget, async () => { vivo = false; raiz.innerHTML = '<div class="rl-sk">' + ZZ.skeleton(4, 'skel rl-sk-kpi') + '</div>'; const r = await carregar(true); return r.ok; });
    vivo = false; assin = ''; graf = null; rosca = null;
  }
  async function carregar(forcar) {
    const meu = ++reqId, [a, b] = intervalo(), p = { de: a, ate: b };
    const q = n => ZZ.api(n, { params: p, silencioso: true });
    const [r, d, u, f, h] = await Promise.all([q('rel_resumo'), q('rel_por_dia'), q('rel_por_usuario'), q('rel_por_fila'), q('rel_horarios')]);
    if (meu !== reqId || !raiz || !raiz.isConnected) return { ok: false };
    if (!r || r.ok === false) {
      if (r && r.sem_permissao) { raiz.innerHTML = '<div class="vazio"><i class="fa-solid fa-lock"></i>Você não tem permissão para ver os relatórios.</div>'; return { ok: false }; }
      if (!vivo || forcar) erroTela(r && r.msg); else ZZ.$('#rlVivo', raiz).hidden = true;
      return { ok: false };
    }
    if (!vivo || forcar) { raiz.innerHTML = casca(); graf = null; rosca = null; assin = ''; vivo = true; }
    const dias = arr(d, 'dias', 'por_dia', 'itens'), cards = normalizarCards(r);
    dados = { r, dias, cards };
    ZZ.$('#rlPer', raiz).textContent = a === b ? br(a) + '/' + a.slice(0, 4) : br(a) + ' a ' + br(b) + '/' + b.slice(0, 4);
    pintarKpis(cards);
    const s = JSON.stringify([dias, normalizarOrigem((r.atual || {}).envios), u, f, h]);
    if (s !== assin) {
      assin = s;
      pintarTabela(dias); pintarGrafico(dias); pintarOrigem(normalizarOrigem((r.atual || {}).envios));
      ranking('#rlUsr', itensUsuario(u), 'Sem dados neste período');
      ranking('#rlFila', itensFila(f), 'Sem dados neste período');
      heatmap(normalizarMatriz(h || {}));
    }
    const v = ZZ.$('#rlVivo', raiz); if (v) v.hidden = false;
    return { ok: true };
  }
  async function trocarPeriodo() {
    vivo = true; assin = '';
    ZZ.$('#rlKpis', raiz).innerHTML = ZZ.skeleton(4, 'skel rl-sk-kpi');
    ZZ.$$('.rl-pil', raiz).forEach(b => { const a = b.dataset.p === per; b.classList.toggle('ativo', a); b.setAttribute('aria-selected', a); });
    ZZ.$('#rlDatas', raiz).hidden = per !== 'custom';
    await carregar();
  }

  /* ---------- detalhe do KPI ---------- */
  async function detalhe(id) {
    const c = dados && dados.cards.find(x => String(x.id) === id); if (!c) return;
    const dias = dados.dias, temSerie = !!c.serie && dias.some(x => x[c.serie] != null), g = c.grupo || {};
    const campo = c.serie || id, f = c.fmt || num;
    const extras = [];
    if (id === 'erros' || id === 'enviadas') { const e = (dados.r.atual || {}).envios || {}; extras.push(['Envios com sucesso', num(e.ok)], ['Envios com falha', num(e.falha)]); Object.entries(e.por_tipo || {}).forEach(([k, v]) => extras.push(['Tipo: ' + k, num(v)])); }
    if (c.grupo && g.total != null && g.abertos != null) extras.push(['Abertos', num(g.abertos)], ['Em andamento', num(g.em_andamento)], ['Resolvidos', num(g.resolvidos)], ['1ª resposta (média)', g.tempo_1a_resposta_s != null ? dur(g.tempo_1a_resposta_s) : '—'], ['Resolução (média)', g.tempo_resolucao_s != null ? dur(g.tempo_resolucao_s) : '—']);
    if (id === 'campanhas') extras.push(['Falhas', num(g.falhas)], ['Campanhas criadas', num(g.criadas)]);
    const exH = extras.length ? `<div class="rolar-x rl-det-t"><table class="tabela rl-tab"><caption class="rl-cap">Detalhes</caption><tbody>${extras.map(x => `<tr><th scope="row">${ZZ.esc(x[0])}</th><td>${ZZ.esc(x[1])}</td></tr>`).join('')}</tbody></table></div>` : '';
    const m = ZZ.modal(`<h3>${ZZ.esc(c.rotulo)}</h3><div class="rl-det-n"><b>${f(c.valor)}</b> ${seta(c)}</div>${c.anterior != null ? `<p class="mut rl-det-a">Período anterior: ${f(c.anterior)}</p>` : ''}
      ${temSerie ? `<div class="rl-graf rl-graf-m"><canvas id="rlDetG" role="img" aria-label="Gráfico diário de ${ZZ.esc(c.rotulo)}; valores na tabela"></canvas></div>
      <div class="rolar-x rl-det-t"><table class="tabela rl-tab"><caption class="rl-cap">${ZZ.esc(c.rotulo)} por dia</caption><thead><tr><th scope="col">Dia</th><th scope="col">${ZZ.esc(c.rotulo)}</th></tr></thead><tbody>${dias.map(x => `<tr><th scope="row">${ZZ.esc(br(x.dia))}</th><td>${num(x[campo])}</td></tr>`).join('')}</tbody></table></div>`
        : ''}${exH}${!temSerie && !extras.length ? '<div class="vazio"><i class="fa-solid fa-chart-simple"></i>Sem detalhamento adicional para este indicador.</div>' : ''}
      <div class="acoes"><button class="btn-soft" data-fecha>Fechar</button></div>`, () => { if (modalGraf) { modalGraf.destroy(); modalGraf = null; } });
    m.el.querySelector('[data-fecha]').onclick = () => m.fechar();
    if (!temSerie) return;
    try {
      const C = await carregarChart(); const cv = m.el.querySelector('#rlDetG'); if (!cv) return;
      const cor = (ICONES[id] || [0, 0, '#2563EB'])[2];
      modalGraf = new C(cv, { type: 'bar', data: { labels: dias.map(x => br(x.dia)), datasets: [{ label: c.rotulo, data: dias.map(x => +x[campo] || 0), backgroundColor: cor, borderRadius: 6, maxBarThickness: 24 }] }, options: optsBase() });
    } catch (e) { const b = m.el.querySelector('.rl-graf'); if (b) b.outerHTML = '<p class="mut">Gráfico indisponível; veja a tabela.</p>'; }
  }

  /* ---------- exportar ---------- */
  function exportar() {
    const [a, b] = intervalo();
    const T = [['envios', 'Envios (lista completa)', 'fa-paper-plane'], ['por_dia', 'Mensagens por dia', 'fa-calendar-day'], ['por_usuario', 'Por usuário', 'fa-user'], ['por_fila', 'Por fila', 'fa-layer-group'], ['horarios', 'Horários de pico', 'fa-table-cells'], ['atendimentos', 'Atendimentos', 'fa-headset']];
    const m = ZZ.modal(`<h3><i class="fa-solid fa-file-csv"></i> Exportar CSV</h3><p class="mut">Período: ${ZZ.esc(br(a))} a ${ZZ.esc(br(b))}. Escolha o relatório:</p><div class="rl-exp-l">${T.map(t => `<button class="btn-soft rl-exp-i" data-t="${t[0]}"><i class="fa-solid ${t[2]}"></i> ${t[1]}</button>`).join('')}</div><div class="acoes"><button class="btn-soft" data-fecha>Cancelar</button></div>`);
    m.el.querySelector('[data-fecha]').onclick = () => m.fechar();
    m.el.querySelectorAll('.rl-exp-i').forEach(bt => bt.onclick = () => ZZ.busy(bt, async () => {
      try {
        const q = new URLSearchParams({ a: 'rel_exportar', tipo: bt.dataset.t, de: a, ate: b });
        const r = await fetch('api.php?' + q, { headers: ZZ.cabecalhos(), credentials: 'same-origin' });
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.includes('json')) { const j = await r.json().catch(() => ({})); ZZ.toast(j.msg || 'Não foi possível exportar', 'err'); return false; }
        const blob = await r.blob(), url = URL.createObjectURL(blob), l = document.createElement('a');
        l.href = url; l.download = `zapzap-relatorio-${bt.dataset.t}-${a}_${b}.csv`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
        ZZ.toast('Arquivo CSV gerado', 'ok'); m.fechar(); return true;
      } catch (e) { ZZ.toast('Falha ao exportar. Tente de novo.', 'err'); return false; }
    }));
  }

  ZZ.pagina({
    id: 'relatorios', titulo: 'Relatórios', icone: 'fa-chart-column', ordem: 7.2, perm: 'relatorios.ver',
    render(el) {
      per = ler(CHAVE_PER) || 'sete'; if (!['hoje', 'sete', 'trinta', 'mes', 'custom'].includes(per)) per = 'sete';
      de = ler(CHAVE_DE); ate = ler(CHAVE_ATE); vivo = false; assin = ''; graf = null; rosca = null; dados = null;
      raiz = document.createElement('div'); raiz.className = 'rl'; el.appendChild(raiz);
      raiz.innerHTML = '<div class="rl-sk">' + ZZ.skeleton(4, 'skel rl-sk-kpi') + '</div>';
      raiz.addEventListener('click', e => {
        const p = e.target.closest('.rl-pil'); if (p) { per = p.dataset.p; guardar(CHAVE_PER, per); if (per !== 'custom') { trocarPeriodo(); } else { if (vivo) { ZZ.$$('.rl-pil', raiz).forEach(b => b.classList.toggle('ativo', b.dataset.p === 'custom')); ZZ.$('#rlDatas', raiz).hidden = false; trocarPeriodo(); } } return; }
        const k = e.target.closest('.rl-kpi'); if (k) { detalhe(k.dataset.k); return; }
        const t = e.target.closest('.rl-alt button'); if (t) { tipoGraf = t.dataset.t; ZZ.$$('.rl-alt button', raiz).forEach(b => b.classList.toggle('ativo', b === t)); if (dados) pintarGrafico(dados.dias, true); return; }
        if (e.target.closest('#rlExp')) { exportar(); return; }
        const c = e.target.closest('.rl-c'); if (c) { ZZ.$$('.rl-c.sel', raiz).forEach(x => x.classList.remove('sel')); c.classList.add('sel'); ZZ.vibrar(8); const n = +c.dataset.v; ZZ.$('#rlHmInfo', raiz).innerHTML = `<b>${DIAS[+c.dataset.d]}, ${c.dataset.h}h</b>: ${num(n)} ${n === 1 ? 'mensagem' : 'mensagens'}`; }
      });
      raiz.addEventListener('change', e => {
        if (e.target.id === 'rlDe' || e.target.id === 'rlAte') { de = ZZ.$('#rlDe', raiz).value; ate = ZZ.$('#rlAte', raiz).value; guardar(CHAVE_DE, de); guardar(CHAVE_ATE, ate); if (de && ate) trocarPeriodo(); }
      });
      carregar(); ZZ.poll(() => carregar(), 30000);
    },
    destroy() { reqId++; [graf, rosca, modalGraf].forEach(g => { if (g) { try { g.destroy(); } catch (e) { } } }); graf = rosca = modalGraf = null; raiz = null; vivo = false; }
  });
})();
