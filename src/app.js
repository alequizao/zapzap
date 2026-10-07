/* ZapZap — núcleo do front: login, roteador, helpers, atualização forçada. Módulos em modules/*.js usam ZZ.pagina(). */
(function () {
  'use strict';
  const ZZ = window.ZZ;
  const paginas = [];
  /* ---------- várias conexões (WhatsApps) ---------- */
  try { ZZ.instancia = localStorage.getItem('zz_inst') || ''; } catch (e) { ZZ.instancia = ''; }
  const gravarInst = n => { ZZ.instancia = n; try { localStorage.setItem('zz_inst', n); } catch (e) { } document.cookie = 'zz_inst=' + encodeURIComponent(n) + ';path=/zapzap/;max-age=31536000;SameSite=Strict;Secure'; };
  ZZ.cabecalhos = (h = {}) => { h['X-CSRF'] = ZZ.csrf; if (ZZ.instancia) h['X-Instancia'] = ZZ.instancia; return h; };
  let atual = null, timers = [];

  /* ---------- helpers ---------- */
  ZZ.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  ZZ.$ = (sel, el) => (el || document).querySelector(sel);
  ZZ.$$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  ZZ.fmtHora = ts => new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Maceio' });
  ZZ.fmtData = ts => new Date(ts * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Maceio' });
  ZZ.fmtDataHora = ts => ZZ.fmtData(ts) + ' ' + ZZ.fmtHora(ts);
  ZZ.fmtRel = ts => { const d = Math.floor(Date.now() / 1000) - ts; if (d < 60) return 'agora'; if (d < 3600) return Math.floor(d / 60) + ' min'; if (d < 86400) return Math.floor(d / 3600) + ' h'; return Math.floor(d / 86400) + ' d'; };
  ZZ.fmtNumero = n => { n = String(n || '').replace(/\D/g, ''); const m = n.match(/^55(\d\d)(9?\d{4})(\d{4})$/); return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : (n ? '+' + n : ''); };
  ZZ.iniciais = n => (String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('') || '?').toUpperCase();
  ZZ.debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- usuário e permissões ---------- */
  ZZ.eu = null; ZZ.perms = new Set();
  /** ZZ.pode('chave') ou ZZ.pode(['a','b']) (qualquer uma). Master pode tudo. Use para esconder botões/telas; o servidor sempre revalida. */
  ZZ.pode = k => !!ZZ.eu && (ZZ.eu.usuario.master || (Array.isArray(k) ? k : [k]).some(x => ZZ.perms.has(x)));
  const PERM_PAGINA = { painel: 'painel.ver', conversas: 'conversas.ver', enviar: ['enviar.texto', 'enviar.midia', 'enviar.enquete', 'enviar.localizacao', 'enviar.contato'], agenda: 'agenda.ver', contatos: 'contatos.ver', grupos: 'grupos.ver', historico: 'historico.ver', conexoes: 'conexoes.ver', config: 'config.ver', versoes: 'versoes.ver' };
  const paginaPermitida = p => { if (p.id === 'versoes' || p.soMaster) return !!(ZZ.eu && ZZ.eu.usuario.master); const k = p.perm || PERM_PAGINA[p.id]; return k ? ZZ.pode(k) : true; };

  /** Vibração curta no celular (feedback tátil). */
  ZZ.vibrar = (p = 15) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
  /** Esqueletos de carregamento: ZZ.skeleton(4) → HTML. */
  ZZ.skeleton = (n = 4, cls = 'skel-linha') => Array.from({ length: n }, () => `<div class="skel ${cls}"></div>`).join('');
  /** Feedback em botão: ZZ.busy(btn, async () => {...}) desabilita, mostra spinner e, ao fim, pisca verde (ok) ou balança (erro). A função devolve o JSON da API (ou true/false). */
  ZZ.busy = async (btn, fn) => {
    if (!btn || btn.disabled) return;
    btn.disabled = true; btn.classList.add('btn-carregando');
    let r;
    try { r = await fn(); } catch (e) { r = { ok: false }; }
    btn.classList.remove('btn-carregando'); btn.disabled = false;
    const bom = r === true || (r && r.ok !== false);
    btn.classList.add(bom ? 'ok-flash' : 'erro-flash'); ZZ.vibrar(bom ? 12 : [30, 40, 30]);
    setTimeout(() => btn.classList.remove('ok-flash', 'erro-flash'), 900);
    return r;
  };
  ZZ.toast = (msg, tipo) => {
    ZZ.vibrar(tipo === 'err' ? [30, 40, 30] : 10);
    const el = document.createElement('div'); el.className = 'toast ' + (tipo || '');
    el.innerHTML = '<i class="fa-solid ' + (tipo === 'err' ? 'fa-circle-exclamation' : tipo === 'ok' ? 'fa-circle-check' : 'fa-circle-info') + '"></i>'; el.appendChild(document.createTextNode(msg));
    document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), tipo === 'err' ? 6000 : 3500);
  };

  /** Chamada à API. ZZ.api('acao', {params:{}, corpo:{} | FormData}) → JSON. Em erro mostra toast (a menos que silencioso). */
  ZZ.api = async (acao, o = {}) => {
    const q = new URLSearchParams({ a: acao, ...(o.params || {}) });
    const init = { headers: ZZ.cabecalhos(), credentials: 'same-origin', signal: o.signal };
    if (o.corpo) {
      init.method = 'POST';
      if (o.corpo instanceof FormData) init.body = o.corpo;
      else { init.body = JSON.stringify(o.corpo); init.headers['Content-Type'] = 'application/json'; }
    }
    try {
      const r = await fetch('api.php?' + q, init);
      const j = await r.json().catch(() => ({ ok: false, msg: 'Resposta inválida do servidor' }));
      if (j.login) { location.reload(); return j; }
      if (!j.ok && !o.silencioso && j.msg) ZZ.toast(j.msg, 'err');
      return j;
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, abortado: true };
      if (!o.silencioso) ZZ.toast('Sem conexão com o servidor', 'err');
      return { ok: false, msg: 'Sem conexão' };
    }
  };

  ZZ.modal = (html, aoFechar) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    const fechar = () => { bg.remove(); aoFechar && aoFechar(); };
    bg.addEventListener('mousedown', e => { if (e.target === bg) fechar(); });
    document.body.appendChild(bg); ZZ.modalAberto = (ZZ.modalAberto || 0) + 1;
    const f2 = fechar; return { el: bg.firstChild, fechar: () => { ZZ.modalAberto--; f2(); } };
  };
  ZZ.confirmar = (msg, rotulo = 'Confirmar', perigo = false) => new Promise(res => {
    const m = ZZ.modal(`<h3>Confirmar</h3><p>${ZZ.esc(msg)}</p><div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="${perigo ? 'btn-perigo' : 'btn-acao'}" data-s>${ZZ.esc(rotulo)}</button></div>`, () => res(false));
    m.el.querySelector('[data-n]').onclick = () => { m.fechar(); };
    m.el.querySelector('[data-s]').onclick = () => { res(true); m.fechar = m.fechar; m.el.closest('.modal-bg').remove(); ZZ.modalAberto--; };
  });

  /** Polling atrelado à página atual: pausa com aba oculta, atualiza ao voltar, nunca com modal aberto. */
  ZZ.poll = (fn, ms) => {
    const rodar = () => { if (document.hidden || ZZ.modalAberto > 0) return; try { fn(); } catch (e) { } };
    const t = setInterval(rodar, ms); timers.push(t);
    const vis = () => { if (!document.hidden) rodar(); };
    document.addEventListener('visibilitychange', vis);
    timers.push({ limpar: () => document.removeEventListener('visibilitychange', vis) });
    return rodar;
  };
  const limparTimers = () => { timers.forEach(t => t.limpar ? t.limpar() : clearInterval(t)); timers = []; };

  /* ---------- páginas ---------- */
  /** ZZ.pagina({id,titulo,icone,ordem,tab:true|false,fab:false,render(el,ctx),destroy()}) */
  ZZ.pagina = p => { paginas.push(p); paginas.sort((a, b) => (a.ordem || 99) - (b.ordem || 99)); };
  ZZ.ir = (id, params) => { location.hash = '#/' + id + (params ? '?' + new URLSearchParams(params) : ''); };
  const rota = () => { const h = location.hash.replace(/^#\/?/, ''); const [id, q] = h.split('?'); return { id: id || (paginas[0] && paginas[0].id), params: Object.fromEntries(new URLSearchParams(q || '')) }; };

  function montarApp() {
    const app = document.getElementById('app');
    app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="logo"><img src="icon.svg?v=${ZZ.v}" alt="" width="36" height="36"><b>ZapZap</b></div>
      <nav class="menu" id="menu"></nav>
      <div class="side-rodape">
        <button id="bInstalar" hidden><i class="fa-solid fa-download"></i> Instalar aplicativo</button>
        <div class="usr-chip"><span class="avatar">${ZZ.esc(ZZ.iniciais(ZZ.eu.usuario.nome))}</span><span class="usr-txt"><b>${ZZ.esc(ZZ.eu.usuario.nome)}</b><small>${ZZ.eu.usuario.master ? 'Administrador (master)' : '@' + ZZ.esc(ZZ.eu.usuario.usuario)}</small></span></div>
        <button id="bSair"><i class="fa-solid fa-right-from-bracket"></i> Sair</button>
        <div style="margin-top:8px">${ZZ.eu.usuario.master ? `<a href="#/versoes" style="color:inherit">Versão: ${ZZ.v}</a>` : `Versão: ${ZZ.v}`}</div>
        <div>Desenvolvido por <a href="https://instagram.com/alequizao" target="_blank" rel="noopener">Alequizão</a></div>
      </div>
    </aside>
    <div class="backdrop" id="backdrop"></div>
    <div class="conteudo">
      <header class="topo"><button id="menuBtn" aria-label="Menu"><i class="fa-solid fa-bars"></i></button><h1 id="titulo"></h1><span class="espaco"></span>
        <button class="cx-seletor" id="cxSel" aria-label="Trocar conexão do WhatsApp"><span class="cx-ponto" id="cxPonto"></span><span id="cxNome">…</span><i class="fa-solid fa-chevron-down"></i></button><span class="estado-conexao" id="conexao"></span></header>
      <main class="pagina" id="pagina"></main>
    </div>
    <nav class="tabbar" id="tabbar"></nav>`;
    const menu = ZZ.$('#menu');
    menu.innerHTML = paginas.map(p => `<a href="#/${p.id}" data-id="${p.id}"><i class="fa-solid ${p.icone}"></i><span>${ZZ.esc(p.titulo)}</span><span class="badge-n" id="bn-${p.id}" hidden></span></a>`).join('');
    const tabs = paginas.filter(p => p.tab);
    const metade = Math.ceil(tabs.length / 2);
    const tabHtml = p => `<a href="#/${p.id}" data-id="${p.id}"><i class="fa-solid ${p.icone}"></i>${ZZ.esc(p.titulo)}</a>`;
    const fab = paginas.find(p => p.fab);
    ZZ.$('#tabbar').innerHTML = tabs.slice(0, metade).map(tabHtml).join('') + (fab ? `<a class="fab" href="#/${fab.id}" aria-label="${ZZ.esc(fab.titulo)}"><i class="fa-solid fa-plus"></i></a>` : '') + tabs.slice(metade).map(tabHtml).join('') + '<button id="tbMenu"><i class="fa-solid fa-bars"></i>Menu</button>';
    const abrir = v => { ZZ.$('#sidebar').classList.toggle('aberta', v); ZZ.$('#backdrop').classList.toggle('aberta', v); };
    ZZ.$('#menuBtn').onclick = () => abrir(true); ZZ.$('#tbMenu').onclick = () => abrir(true); ZZ.$('#backdrop').onclick = () => abrir(false);
    menu.addEventListener('click', () => abrir(false));
    ZZ.$('#bSair').onclick = async () => { await ZZ.api('sair', { corpo: {} }); location.reload(); };
    ZZ.badge = (id, n) => { const b = document.getElementById('bn-' + id); if (b) { b.hidden = !n; b.textContent = n; } };
    // instalar PWA
    let evt; const bi = ZZ.$('#bInstalar');
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
    if (ios) bi.hidden = false;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evt = e; bi.hidden = false; });
    bi.onclick = () => evt ? evt.prompt() : ZZ.modal('<h3>Instalar no iPhone</h3><p>Toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p><div class="acoes"><button class="btn-acao" onclick="this.closest(\'.modal-bg\').remove()">Entendi</button></div>');
    ZZ.$('#cxSel').onclick = abrirSeletor;
    (function zzGestoMenu() { // deslizar: da borda esquerda abre; para a esquerda fecha; a gaveta acompanha o dedo
      const sb = ZZ.$('#sidebar'), bd = ZZ.$('#backdrop'); let x0 = null, y0 = 0, aberta0 = false, modo = '', larg = 270, t0 = 0;
      const mob = () => window.matchMedia('(max-width:880px)').matches;
      const aplicar = p => { sb.style.transition = 'none'; sb.style.transform = `translateX(${(-100 + p * 100)}%)`; bd.style.transition = 'none'; bd.style.opacity = String(p); bd.style.pointerEvents = p > 0.02 ? 'auto' : 'none'; };
      const soltar = abrir => { sb.style.transition = ''; bd.style.transition = ''; sb.style.transform = ''; bd.style.opacity = ''; bd.style.pointerEvents = ''; sb.classList.toggle('aberta', abrir); bd.classList.toggle('aberta', abrir); if (abrir !== aberta0) ZZ.vibrar(8); };
      document.addEventListener('touchstart', e => {
        if (!mob() || e.touches.length !== 1 || ZZ.modalAberto > 0 || document.body.classList.contains('conv-chat-aberto')) { x0 = null; return; }
        const t = e.touches[0]; aberta0 = sb.classList.contains('aberta');
        if (!aberta0 && t.clientX > 28) { x0 = null; return; }            // só começa na borda esquerda
        x0 = t.clientX; y0 = t.clientY; modo = ''; larg = sb.offsetWidth || 270; t0 = Date.now();
      }, { passive: true });
      document.addEventListener('touchmove', e => {
        if (x0 === null) return; const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
        if (!modo) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; modo = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'; if (modo === 'v') { x0 = null; return; } }
        let p = aberta0 ? 1 + dx / larg : dx / larg; p = Math.max(0, Math.min(1, p)); aplicar(p); if (e.cancelable) e.preventDefault();
      }, { passive: false });
      document.addEventListener('touchend', e => {
        if (x0 === null || modo !== 'h') { x0 = null; return; }
        const dx = (e.changedTouches[0].clientX - x0), v = Math.abs(dx) / Math.max(1, Date.now() - t0);
        const p = aberta0 ? 1 + dx / larg : dx / larg; x0 = null;
        soltar(v > 0.45 ? dx > 0 : p > 0.5);
      }, { passive: true });
    })();
    (ZZ.hooksMontar || []).forEach(f => { try { f(); } catch (e) { } });
    window.addEventListener('hashchange', navegar);
    carregarInstancias().then(() => { navegar(); estadoConexao(); ZZ.poll(estadoConexao, 20000); });
  }

  async function carregarInstancias() {
    const j = await ZZ.api('instancias', { silencioso: true });
    if (j.ok) {
      ZZ.instancias = j.itens;
      const ok = j.itens.find(i => i.nome === ZZ.instancia);
      if (!ok) gravarInst(j.ativa || (j.itens[0] && j.itens[0].nome) || '');
    }
    pintarSeletor();
  }
  function pintarSeletor() {
    const i = (ZZ.instancias || []).find(x => x.nome === ZZ.instancia); const n = ZZ.$('#cxNome'); if (!n) return;
    n.textContent = i ? (i.apelido || i.nome) : 'Conexão';
    ZZ.$('#cxPonto').className = 'cx-ponto ' + (i && i.estado === 'open' ? 'on' : 'off');
  }
  ZZ.recarregarInstancias = carregarInstancias;
  ZZ.trocarInstancia = n => { gravarInst(n); pintarSeletor(); ZZ.vibrar(12); navegar(); estadoConexao(); ZZ.toast('Conexão: ' + ((ZZ.instancias.find(x => x.nome === n) || {}).apelido || n), 'ok'); };
  function abrirSeletor() {
    carregarInstancias().then(() => {
      const lista = (ZZ.instancias || []).map(i => `<button class="cx-item ${i.nome === ZZ.instancia ? 'sel' : ''}" data-n="${ZZ.esc(i.nome)}"><span class="cx-ponto ${i.estado === 'open' ? 'on' : 'off'}"></span><span class="cx-txt"><b>${ZZ.esc(i.apelido || i.nome)}</b><small>${i.numero ? ZZ.esc(ZZ.fmtNumero(i.numero)) : (i.estado === 'open' ? 'conectado' : 'desconectado')}</small></span>${i.nome === ZZ.instancia ? '<i class="fa-solid fa-check"></i>' : ''}</button>`).join('');
      const m = ZZ.modal(`<h3><i class="fa-brands fa-whatsapp"></i> Seus WhatsApps</h3><div class="cx-lista">${lista || '<div class="vazio">Nenhuma conexão</div>'}</div><div class="acoes"><button class="btn-soft" data-fecha>Fechar</button><button class="btn-azul" data-nova><i class="fa-solid fa-plus"></i> Conectar outro</button></div>`);
      m.el.querySelector('[data-fecha]').onclick = () => m.fechar();
      m.el.querySelector('[data-nova]').onclick = () => { m.fechar(); ZZ.ir('conexoes'); };
      m.el.querySelectorAll('.cx-item').forEach(b => b.onclick = () => { m.fechar(); if (b.dataset.n !== ZZ.instancia) ZZ.trocarInstancia(b.dataset.n); });
    });
  }

  function navegar() {
    const { id, params } = rota();
    const p = paginas.find(x => x.id === id) || paginas[0];
    if (!p) return;
    if (atual && atual.destroy) { try { atual.destroy(); } catch (e) { } }
    limparTimers(); ZZ.poll(estadoConexao, 20000);
    atual = p; ZZ.modalAberto = 0;
    ZZ.$$('#menu a, #tabbar a').forEach(a => a.classList.toggle('ativo', a.dataset.id === p.id));
    ZZ.$('#titulo').textContent = p.titulo;
    try { ZZ.api('visita', { corpo: { pagina: p.id }, silencioso: true }); } catch (e) { }
    document.title = p.titulo + ' — ZapZap';
    const el = ZZ.$('#pagina'); el.innerHTML = '';
    p.render(el, { params });
  }

  async function estadoConexao() {
    const j = await ZZ.api('status', { silencioso: true });
    const el = document.getElementById('conexao'); if (!el) return;
    const ok = j.estado === 'open';
    el.innerHTML = ok ? '<span class="badge-status b-ok"><i class="fa-solid fa-circle"></i> WhatsApp conectado</span>' : `<span class="badge-status b-err"><i class="fa-solid fa-circle-xmark"></i> ${j.ok === false && !j.estado ? 'Sem resposta' : 'Desconectado'}</span>`;
    ZZ.status = j;
  }

  /* ---------- login ---------- */
  function iniciarLogin() {
    const f = document.getElementById('fLogin'); if (!f) return;
    document.getElementById('ver').onclick = () => { const i = document.getElementById('senha'); i.type = i.type === 'password' ? 'text' : 'password'; };
    f.onsubmit = async e => {
      e.preventDefault(); const b = document.getElementById('bLogin'), er = document.getElementById('erro'); b.disabled = true; er.textContent = '';
      try {
        const r = await fetch('api.php?a=login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: document.getElementById('usuario').value.trim(), senha: document.getElementById('senha').value }) });
        const j = await r.json();
        if (j.ok) { b.innerHTML = '<i class="fa-solid fa-check"></i> Entrando…'; location.reload(); return; }
        er.textContent = j.msg || 'Erro ao entrar';
      } catch (x) { er.textContent = 'Sem conexão com o servidor'; }
      b.disabled = false; er.classList.add('erro-flash'); setTimeout(() => er.classList.remove('erro-flash'), 500); document.getElementById('senha').select();
    };
  }

  /* ---------- atualização forçada (estilo AJAX) ---------- */
  function iniciarAtualizacao() {
    let recarregando = false;
    const forcar = async () => {
      if (recarregando) return; recarregando = true;
      const av = document.createElement('div'); av.className = 'atualizando'; av.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Atualizando…'; document.body.appendChild(av);
      try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.update())); } catch (e) { }
      setTimeout(() => location.reload(), 600);
    };
    const checar = async () => {
      if (document.hidden && !checar.primeira) return;
      try { const r = await fetch('versao.php?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j.versao && j.versao !== ZZ.v) forcar(); } catch (e) { }
    };
    setInterval(checar, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checar(); });
    window.addEventListener('focus', checar);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.php?v=' + ZZ.v, { updateViaCache: 'none' }).then(reg => {
        reg.update(); setInterval(() => reg.update(), 300000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); });
      }).catch(() => { });
      let tinha = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinha) forcar(); tinha = true; });
    }
  }

  /** Senha provisória: bloqueia o painel até o usuário definir uma senha própria. */
  function trocaObrigatoria() {
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.style.zIndex = 99;
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3><i class="fa-solid fa-key"></i> Defina a sua senha</h3><p class="mut" style="margin-top:0">Você entrou com uma senha provisória. Crie uma senha só sua para continuar.</p>
      <label for="tsA">Senha provisória (a que você usou para entrar)</label><input id="tsA" type="password" autocomplete="current-password">
      <label for="tsN">Nova senha (mínimo 6 caracteres)</label><input id="tsN" type="password" autocomplete="new-password">
      <label for="tsR">Repita a nova senha</label><input id="tsR" type="password" autocomplete="new-password">
      <div class="msg-campo" id="tsE"></div>
      <div class="acoes"><button class="btn-soft" id="tsS">Sair</button><button class="btn-azul" id="tsOk"><i class="fa-solid fa-check"></i> Salvar nova senha</button></div></div>`;
    document.body.appendChild(bg); ZZ.modalAberto = (ZZ.modalAberto || 0) + 1;
    const $ = s => bg.querySelector(s);
    $('#tsS').onclick = async () => { await ZZ.api('sair', { corpo: {} }); location.reload(); };
    $('#tsOk').onclick = () => ZZ.busy($('#tsOk'), async () => {
      const e = $('#tsE'); e.textContent = ''; ['#tsA', '#tsN', '#tsR'].forEach(s => $(s).classList.remove('erro-campo'));
      if (!$('#tsA').value) { e.textContent = 'Informe a senha provisória.'; $('#tsA').classList.add('erro-campo'); return false; }
      if ($('#tsN').value.length < 6) { e.textContent = 'A nova senha precisa ter pelo menos 6 caracteres.'; $('#tsN').classList.add('erro-campo'); return false; }
      if ($('#tsN').value !== $('#tsR').value) { e.textContent = 'As senhas não conferem.'; $('#tsR').classList.add('erro-campo'); return false; }
      const r = await ZZ.api('trocar_senha', { corpo: { atual: $('#tsA').value, nova: $('#tsN').value } });
      if (r.ok) { ZZ.toast('Senha definida. Bem-vindo!', 'ok'); ZZ.modalAberto--; bg.remove(); ZZ.eu.usuario.trocar_senha = false; }
      else e.textContent = r.msg || 'Não foi possível trocar a senha.';
      return r;
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    iniciarAtualizacao();
    if (!ZZ.logado) { iniciarLogin(); return; }
    ZZ.api('eu', { silencioso: true }).then(r => {
      if (!r.ok) { document.getElementById('app').innerHTML = '<div class="vazio" style="padding:60px 20px"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar o seu usuário.<br><button class="btn-azul" onclick="location.reload()">Tentar de novo</button></div>'; return; }
      ZZ.eu = r; ZZ.perms = new Set(r.perms || []);
      const ok = paginas.filter(paginaPermitida); paginas.length = 0; paginas.push(...ok);
      montarApp();
      if (r.usuario.trocar_senha) trocaObrigatoria();
    });
  });
})();
