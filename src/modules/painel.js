/* Painel — página inicial: perfil, estatísticas, gráfico de 7 dias, atividade recente e atalhos. */
(function () {
  'use strict';
  const CHART_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  let grafico = null, chartPromessa = null, raiz = null, vivo = false, ultimoJson = '', anterior = {}, reqId = 0;

  const carregarChart = () => {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (!chartPromessa) chartPromessa = new Promise((ok, falha) => {
      const s = document.createElement('script'); s.src = CHART_URL; s.async = true;
      s.onload = () => ok(window.Chart); s.onerror = () => { chartPromessa = null; falha(new Error('chart')); };
      document.head.appendChild(s);
    });
    return chartPromessa;
  };

  const TIPOS = { imagem: ['fa-image', 'Imagem'], video: ['fa-video', 'Vídeo'], audio: ['fa-microphone', 'Áudio'], documento: ['fa-file', 'Documento'], figurinha: ['fa-note-sticky', 'Figurinha'], contato: ['fa-address-card', 'Contato'], localizacao: ['fa-location-dot', 'Localização'], enquete: ['fa-square-poll-vertical', 'Enquete'], reacao: ['fa-face-smile', 'Reação'] };
  const nomeDia = d => { const p = String(d).split('-'); const dt = new Date(+p[0], +p[1] - 1, +p[2]); return dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') + ' ' + p[2] + '/' + p[1]; };
  const curto = d => { const p = String(d).split('-'); return p[2] + '/' + p[1]; };
  const num = n => Number(n || 0).toLocaleString('pt-BR');

  function esqueleto() {
    return `<div class="painel-sk"><div class="skel painel-sk-perfil"></div>
      <div class="painel-stats">${ZZ.skeleton(4, 'skel painel-sk-stat')}</div>
      <div class="skel painel-sk-graf"></div>${ZZ.skeleton(4)}</div>`;
  }

  const podeGraf = () => ZZ.pode('conversas.ver');
  const podeRec = () => ZZ.pode('conversas.ver');
  const atalhosOk = () => [['enviar', 'fa-paper-plane', 'Enviar mensagem', ['enviar.texto', 'enviar.midia', 'enviar.enquete', 'enviar.localizacao', 'enviar.contato']], ['conversas', 'fa-comments', 'Conversas', 'conversas.ver'], ['agenda', 'fa-clock', 'Agendar', 'agenda.criar']].filter(a => ZZ.pode(a[3]));
  /* cartões de estatística: chave, permissão exigida e destino ao tocar */
  const CARTOES = { env: ['historico.ver', 'historico', { ok: '1', hoje: '1' }, 'Ver envios com sucesso de hoje no Histórico'], rec: ['conversas.ver', 'conversas', null, 'Abrir as conversas'], agd: ['agenda.ver', 'agenda', { status: 'pendente' }, 'Ver as agendadas pendentes'], pnl: ['historico.ver', 'historico', { origem: 'painel' }, 'Ver os envios do painel no Histórico'] };
  const chavesVisiveis = () => Object.keys(CARTOES).filter(k => ZZ.pode(CARTOES[k][0]));

  function casca() {
    const sem = !chavesVisiveis().length && !podeGraf() && !atalhosOk().length;
    return `
    <section class="card-soft painel-perfil" id="painelPerfil" aria-label="Perfil conectado"></section>
    ${sem ? '<div class="vazio painel-semperm"><i class="fa-solid fa-lock"></i>Seu usuário ainda não tem nada liberado no painel.<br><span class="mut">Fale com o administrador para liberar o que você precisa.</span></div>' : ''}
    <div class="painel-stats" id="painelStats" ${chavesVisiveis().length ? '' : 'hidden'}></div>
    ${podeGraf() ? `<section class="card-soft painel-bloco" aria-labelledby="pnGrafT">
      <div class="ch painel-ch"><span id="pnGrafT"><i class="fa-solid fa-chart-column"></i> Últimos 7 dias</span><span class="vivo" id="painelVivo" hidden>ao vivo</span></div>
      <div class="painel-legenda"><span><i class="painel-pt" style="background:#2563EB"></i>Enviadas</span><span><i class="painel-pt" style="background:#25D366"></i>Recebidas</span></div>
      <div class="painel-graf" id="painelGrafBox"><canvas id="painelGraf" role="img" aria-label="Gráfico de barras de mensagens enviadas e recebidas nos últimos 7 dias; valores na tabela abaixo"></canvas></div>
      <div class="painel-graf-erro" id="painelGrafErro" hidden>Não foi possível carregar o gráfico. Os valores estão na tabela abaixo.</div>
      <div class="rolar-x"><table class="tabela painel-tab" id="painelTab"></table></div>
    </section>` : ''}
    ${podeRec() ? `<section class="card-soft painel-bloco" aria-labelledby="pnRecT">
      <div class="ch painel-ch"><span id="pnRecT"><i class="fa-solid fa-bolt"></i> Atividade recente</span></div>
      <div id="painelRec"></div>
    </section>` : ''}
    ${atalhosOk().length ? `<section class="painel-atalhos" aria-label="Atalhos rápidos">${atalhosOk().map(a => `<button class="painel-atalho" data-ir="${a[0]}"><i class="fa-solid ${a[1]}"></i><span>${a[2]}</span></button>`).join('')}</section>` : ''}`;
  }

  function pintarPerfil(d) {
    const on = d.estado === 'open';
    const foto = d.foto ? `<img class="avatar painel-foto" src="${ZZ.esc(d.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar painel-foto',textContent:this.dataset.i}))" data-i="${ZZ.esc(ZZ.iniciais(d.nome))}">` : `<div class="avatar painel-foto">${ZZ.esc(ZZ.iniciais(d.nome))}</div>`;
    const rot = on ? '<span class="badge-status b-ok"><i class="fa-solid fa-circle"></i> Conectado</span>' : `<span class="badge-status b-err"><i class="fa-solid fa-circle-xmark"></i> ${d.estado === 'connecting' ? 'Conectando' : 'Desconectado'}</span>`;
    const t = d.totais || {};
    ZZ.$('#painelPerfil', raiz).innerHTML = `${foto}<div class="painel-perfil-i"><b class="painel-nome">${ZZ.esc(d.nome || 'WhatsApp')}</b><span class="mut painel-numero">${ZZ.esc(ZZ.fmtNumero(d.numero))}</span>
      ${podeGraf() ? `<span class="painel-tot mut">${num(t.contatos)} contatos · ${num(t.chats)} conversas · ${num(t.msgs)} mensagens</span>` : ''}</div>${rot}`;
  }

  function stat(id, ic, cor, lbl, valor, extra) {
    return `<div class="card-soft stat painel-stat painel-clic" data-k="${id}" role="button" tabindex="0" aria-label="${ZZ.esc(lbl)}: ${num(valor)}. ${ZZ.esc(CARTOES[id][3])}"><span class="ic" style="background:${cor[0]};color:${cor[1]}"><i class="fa-solid ${ic}"></i></span>
      <div class="num" data-v="${valor}">${num(valor)}</div><div class="lbl">${lbl}</div>${extra || ''}</div>`;
  }

  const subInner = (ok, er) => `<span class="badge-status b-ok painel-sub-b" data-fs="ok">${num(ok)} ok</span> <span class="badge-status ${er ? 'b-err' : 'b-info'} painel-sub-b" data-fs="erro">${num(er)} erro</span>`;
  const subHtml = (ok, er) => `<div class="painel-sub">${subInner(ok, er)}</div>`;

  function pintarStats(d) {
    const h = d.hoje || {};
    const ok = +h.painel_ok || 0, er = +h.painel_erro || 0;
    const el = ZZ.$('#painelStats', raiz);
    const html = stat('env', 'fa-arrow-up', ['#e7f0ff', '#2563EB'], 'Enviadas hoje', +h.enviadas || 0)
      + stat('rec', 'fa-arrow-down', ['#e6f7ee', '#1e9e57'], 'Recebidas hoje', +h.recebidas || 0)
      + stat('agd', 'fa-clock', ['#fff4e0', '#c47f12'], 'Agendadas pendentes', +d.agendadas_pendentes || 0)
      + stat('pnl', 'fa-paper-plane', ['#f0eefe', '#6a4cff'], 'Envios do painel', ok, `${subHtml(ok, er)}`);
    const vis = chavesVisiveis();
    const htmlV = [...(new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body.children)].filter(c => vis.includes(c.dataset.k)).map(c => c.outerHTML).join('');
    // atualiza só os números quando a estrutura já existe (anima mudanças)
    if (el.children.length && [...el.children].map(c => c.dataset.k).join() === vis.join()) {
      const vals = { env: +h.enviadas || 0, rec: +h.recebidas || 0, agd: +d.agendadas_pendentes || 0, pnl: ok };
      ZZ.$$('.painel-stat', el).forEach(c => {
        const k = c.dataset.k, n = ZZ.$('.num', c), v = vals[k], ant = +n.dataset.v;
        if (v !== ant) { animar(n, ant, v); n.dataset.v = v; c.classList.remove('painel-pisca'); void c.offsetWidth; c.classList.add('painel-pisca'); }
      });
      const sub = ZZ.$('.painel-sub', el);
      if (sub) sub.innerHTML = subInner(ok, er);
    } else el.innerHTML = htmlV;
  }

  function animar(n, de, para) {
    const t0 = performance.now(), dur = 600;
    const passo = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); n.textContent = num(Math.round(de + (para - de) * e)); if (p < 1 && n.isConnected) requestAnimationFrame(passo); else n.textContent = num(para); };
    requestAnimationFrame(passo);
  }

  function pintarTabela(dias) {
    if (!ZZ.$('#painelTab', raiz)) return;
    ZZ.$('#painelTab', raiz).innerHTML = '<caption class="painel-cap">Mensagens por dia</caption><thead><tr><th scope="col">Dia</th><th scope="col">Enviadas</th><th scope="col">Recebidas</th></tr></thead><tbody>'
      + dias.map(x => `<tr><th scope="row">${ZZ.esc(nomeDia(x.dia))}</th><td>${num(x.enviadas)}</td><td>${num(x.recebidas)}</td></tr>`).join('') + '</tbody>';
  }

  async function pintarGrafico(dias) {
    if (!ZZ.$('#painelGrafBox', raiz)) return;
    const box = ZZ.$('#painelGrafBox', raiz), er = ZZ.$('#painelGrafErro', raiz);
    const lab = dias.map(x => curto(x.dia)), env = dias.map(x => +x.enviadas || 0), rec = dias.map(x => +x.recebidas || 0);
    if (grafico) { grafico.data.labels = lab; grafico.data.datasets[0].data = env; grafico.data.datasets[1].data = rec; grafico.update(); return; }
    try {
      const C = await carregarChart();
      if (!raiz || !raiz.isConnected) return;
      er.hidden = true; box.hidden = false;
      grafico = new C(ZZ.$('#painelGraf', raiz), {
        type: 'bar',
        data: { labels: lab, datasets: [{ label: 'Enviadas', data: env, backgroundColor: '#2563EB', borderRadius: 6, maxBarThickness: 22 }, { label: 'Recebidas', data: rec, backgroundColor: '#25D366', borderRadius: 6, maxBarThickness: 22 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } }, y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Inter', size: 11 } }, grid: { color: '#ECECEC' } } } }
      });
    } catch (e) { box.hidden = true; er.hidden = false; }
  }

  function textoPrevia(m) {
    const t = TIPOS[m.tipo];
    const txt = String(m.texto || '').replace(/\s+/g, ' ').trim();
    if (t && !txt) return `<i class="fa-solid ${t[0]}"></i> ${t[1]}`;
    return (t ? `<i class="fa-solid ${t[0]}"></i> ` : '') + ZZ.esc(txt || 'Mensagem');
  }

  function pintarRecentes(lista) {
    const el = ZZ.$('#painelRec', raiz); if (!el) return;
    if (!lista || !lista.length) { el.innerHTML = '<div class="vazio"><i class="fa-regular fa-comment-dots"></i>Nenhuma atividade recente ainda.</div>'; return; }
    const antes = anterior.rec || {};
    el.innerHTML = lista.map(m => {
      const chave = m.jid + '|' + m.ts, novo = anterior.rec && !antes[chave];
      return `<button class="painel-item${novo ? ' painel-novo' : ''}" data-jid="${ZZ.esc(m.jid)}" aria-label="Abrir conversa com ${ZZ.esc(m.nome || m.jid)}">
        <span class="avatar">${ZZ.esc(ZZ.iniciais(m.nome))}</span>
        <span class="painel-item-c"><b>${ZZ.esc(m.nome || ZZ.fmtNumero(String(m.jid).split('@')[0]))}</b>
        <span class="mut painel-prev">${m.fromMe ? '<i class="fa-solid fa-check painel-eu"></i> ' : ''}${textoPrevia(m)}</span></span>
        <span class="mut painel-hora" title="${ZZ.esc(ZZ.fmtDataHora(m.ts))}">${ZZ.esc(ZZ.fmtRel(m.ts))}</span></button>`;
    }).join('');
    anterior.rec = Object.fromEntries(lista.map(m => [m.jid + '|' + m.ts, 1]));
  }

  function erro(msg) {
    raiz.innerHTML = `<div class="card-soft painel-erro" role="alert"><i class="fa-solid fa-triangle-exclamation"></i><b>Não foi possível carregar o painel</b><span class="mut">${ZZ.esc(msg || 'Verifique a conexão e tente de novo.')}</span><button class="btn-azul" id="painelTentar"><i class="fa-solid fa-rotate"></i> Tentar de novo</button></div>`;
    ZZ.$('#painelTentar', raiz).onclick = e => ZZ.busy(e.currentTarget, async () => { const r = await carregar(true); return r; });
    grafico = null; vivo = false; ultimoJson = ''; anterior = {};
  }

  async function carregar(forcarCasca) {
    const meu = ++reqId;
    const j = await ZZ.api('dash', { silencioso: true });
    if (meu !== reqId || !raiz || !raiz.isConnected) return { ok: false };
    if (!j || !j.ok) { if (!vivo || forcarCasca) erro(j && (j.sem_permissao ? 'Você não tem permissão para ver o painel.' : j.sem_conexao ? 'Nenhuma conexão (WhatsApp) liberada para o seu usuário.' : j.msg)); else { const vv = ZZ.$('#painelVivo', raiz); if (vv) vv.hidden = true; } return { ok: false }; }
    if (!vivo || forcarCasca || !ZZ.$('#painelPerfil', raiz)) { raiz.innerHTML = casca(); grafico = null; anterior = {}; ultimoJson = ''; vivo = true; }
    const assinatura = JSON.stringify([j.estado, j.nome, j.foto, j.numero, j.totais, j.por_dia, j.recentes]);
    pintarStats(j);
    if (assinatura !== ultimoJson) {
      ultimoJson = assinatura;
      pintarPerfil(j); pintarTabela(j.por_dia || []); pintarRecentes(j.recentes); pintarGrafico(j.por_dia || []);
    } else ZZ.$$('.painel-hora', raiz).forEach((h, i) => { const m = (j.recentes || [])[i]; if (m) h.textContent = ZZ.fmtRel(m.ts); });
    const v = ZZ.$('#painelVivo', raiz); if (v) v.hidden = false;
    return { ok: true };
  }

  function abrirCartao(c, badge) {
    const def = CARTOES[c.dataset.k]; if (!def) return;
    let params = def[2] ? { ...def[2] } : null;
    if (c.dataset.k === 'pnl' && badge) params = { origem: 'painel', ok: badge.dataset.fs === 'ok' ? '1' : '0' };
    c.classList.add('painel-toque'); ZZ.vibrar(10);
    setTimeout(() => { c.classList.remove('painel-toque'); ZZ.ir(def[1], params); }, 140);
  }

  ZZ.pagina({
    id: 'painel', titulo: 'Painel', icone: 'fa-gauge', ordem: 1, tab: true,
    render(el) {
      raiz = document.createElement('div'); raiz.className = 'painel'; el.appendChild(raiz);
      vivo = false; ultimoJson = ''; anterior = {}; grafico = null;
      raiz.innerHTML = esqueleto();
      raiz.addEventListener('click', e => {
        const it = e.target.closest('.painel-item'); if (it) { ZZ.ir('conversas', { jid: it.dataset.jid }); return; }
        const at = e.target.closest('.painel-atalho'); if (at) { ZZ.ir(at.dataset.ir); return; }
        const cs = e.target.closest('.painel-clic'); if (cs) abrirCartao(cs, e.target.closest('.painel-sub-b'));
      });
      raiz.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('painel-clic')) { e.preventDefault(); abrirCartao(e.target); }
      });
      carregar(); ZZ.poll(carregar, 8000);
    },
    destroy() { reqId++; if (grafico) { try { grafico.destroy(); } catch (e) { } } grafico = null; raiz = null; vivo = false; }
  });
})();
