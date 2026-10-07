/* ZapZap — módulo Agendadas (front). Consome: agendadas, cancelar_agendada, reagendar, enviar_agora. */
(function () {
  'use strict';
  const ZZ = window.ZZ;
  const FILTROS = [
    ['pendente', 'Pendentes', 'fa-hourglass-half'], ['enviada', 'Enviadas', 'fa-check'],
    ['erro', 'Com erro', 'fa-triangle-exclamation'], ['cancelada', 'Canceladas', 'fa-ban'], ['', 'Todas', 'fa-list']
  ];
  const ST = {
    pendente: ['b-pend', 'fa-clock', 'Pendente'], enviando: ['b-info', 'fa-spinner fa-spin', 'Enviando'],
    enviada: ['b-ok', 'fa-check', 'Enviada'], erro: ['b-err', 'fa-circle-xmark', 'Com erro'], cancelada: ['b-pausa', 'fa-ban', 'Cancelada']
  };
  const ICO_TIPO = { texto: 'fa-message', imagem: 'fa-image', video: 'fa-video', audio: 'fa-microphone', documento: 'fa-file-lines' };
  let S = null;

  const diaChave = ts => ZZ.fmtData(ts);
  function rotuloQuando(ts) {
    const agora = Math.floor(Date.now() / 1000), h = ZZ.fmtHora(ts), d = diaChave(ts);
    if (d === diaChave(agora)) return ['Hoje', h];
    if (d === diaChave(agora + 86400)) return ['Amanhã', h];
    if (d === diaChave(agora - 86400)) return ['Ontem', h];
    return [d.slice(0, 5), h];
  }
  function contagem(ts) {
    let d = ts - Math.floor(Date.now() / 1000);
    if (d <= 0) return 'enviando em instantes…';
    const dd = Math.floor(d / 86400), hh = Math.floor(d % 86400 / 3600), mm = Math.floor(d % 3600 / 60), ss = d % 60;
    if (dd) return `em ${dd} d ${hh} h`;
    if (hh) return `em ${hh} h ${mm} min`;
    if (mm) return `em ${mm} min ${String(ss).padStart(2, '0')} s`;
    return `em ${ss} s`;
  }
  function previa(it) {
    if (it.tipo && it.tipo !== 'texto' && it.nome_arquivo) {
      const leg = it.texto ? ' — ' + ZZ.esc(it.texto) : '';
      return `<i class="fa-solid ${ICO_TIPO[it.tipo] || 'fa-paperclip'}"></i> ${ZZ.esc(it.nome_arquivo)}${leg}`;
    }
    return ZZ.esc(it.texto || '(sem texto)');
  }

  function card(it) {
    const st = ST[it.status] || ST.pendente, [dia, hora] = rotuloQuando(it.quando);
    const nome = it.nome || ZZ.fmtNumero(String(it.jid).split('@')[0]);
    const pend = it.status === 'pendente';
    let acoes = '';
    const pc = ZZ.pode('agenda.cancelar');
    if (!pc) acoes = '';
    else if (pend) acoes = `<button class="btn-azul btn-sm" data-ac="agora"><i class="fa-solid fa-paper-plane"></i> Enviar agora</button><button class="btn-soft btn-sm" data-ac="reag"><i class="fa-regular fa-calendar"></i> Reagendar</button><button class="btn-perigo btn-sm" data-ac="canc"><i class="fa-solid fa-xmark"></i> Cancelar</button>`;
    else if (it.status === 'erro') acoes = `<button class="btn-azul btn-sm" data-ac="agora"><i class="fa-solid fa-rotate-right"></i> Tentar enviar</button><button class="btn-soft btn-sm" data-ac="reag"><i class="fa-regular fa-calendar"></i> Reagendar</button><button class="btn-perigo btn-sm" data-ac="canc"><i class="fa-solid fa-xmark"></i> Cancelar</button>`;
    else if (it.status === 'cancelada') acoes = `<button class="btn-soft btn-sm" data-ac="reag"><i class="fa-regular fa-calendar"></i> Reagendar</button>`;
    const ass = it.assinatura || it.autor || '';
    const assHtml = ass ? `<div class="ag-ass" title="Nome do autor gravado neste agendamento"><i class="fa-solid fa-signature"></i> Sai assinada: <b>${ZZ.esc(ass)}:</b></div>` : '';
    const cls = 'ag-card ag-s-' + it.status + (S.novos.has(it.id) ? ' ag-novo' : '');
    return `<div class="${cls}" data-id="${it.id}">
      <div class="ag-topo"><span class="avatar ag-av">${ZZ.esc(ZZ.iniciais(nome))}</span>
        <div class="ag-quem"><b>${ZZ.esc(nome)}</b><span class="mut ag-num">${ZZ.esc(ZZ.fmtNumero(String(it.jid).split('@')[0]))}</span></div>
        <span class="badge-status ${st[0]}"><i class="fa-solid ${st[1]}"></i> ${st[2]}</span></div>
      <div class="ag-previa">${previa(it)}</div>${assHtml}
      <div class="ag-quando"><span class="ag-dia">${dia}</span><span class="ag-hora">${hora}</span>
        ${pend ? `<span class="ag-conta" data-q="${it.quando}"><i class="fa-regular fa-clock"></i> <span>${contagem(it.quando)}</span></span>` : (it.status === 'enviada' && it.enviado_em ? `<span class="ag-conta mut">enviada às ${ZZ.fmtHora(it.enviado_em)}</span>` : '')}</div>
      ${it.status === 'erro' && it.erro ? `<div class="ag-erro"><i class="fa-solid fa-circle-exclamation"></i> ${ZZ.esc(it.erro)}</div>` : ''}
      ${acoes ? `<div class="ag-acoes">${acoes}</div>` : ''}</div>`;
  }

  function contadores() {
    const c = { '': S.itens.length };
    S.itens.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; });
    c.pendente = (c.pendente || 0) + (c.enviando || 0);
    return c;
  }
  function desenharFiltros() {
    const c = contadores();
    S.elF.innerHTML = FILTROS.map(f => `<button class="ag-pill${S.filtro === f[0] ? ' ativo' : ''}" data-f="${f[0]}"><i class="fa-solid ${f[2]}"></i> ${f[1]} <span class="ag-cnt">${c[f[0]] || 0}</span></button>`).join('');
  }
  function desenharLista() {
    const lista = S.itens.filter(i => !S.filtro || i.status === S.filtro || (S.filtro === 'pendente' && i.status === 'enviando'));
    lista.sort((a, b) => S.filtro === 'pendente' ? a.quando - b.quando : b.quando - a.quando);
    S.elL.innerHTML = lista.length ? lista.map(card).join('') :
      `<div class="vazio ag-vazio"><i class="fa-regular fa-calendar-check"></i>${S.filtro === 'pendente' || !S.filtro ? 'Nenhuma mensagem agendada.<br>Que tal programar uma agora?' : 'Nada por aqui neste filtro.'}<br>${ZZ.pode('agenda.criar') ? '<button class="btn-azul ag-vz-btn" data-ac="novo"><i class="fa-solid fa-plus"></i> Agendar mensagem</button>' : ''}</div>`;
    S.vazioSig = lista.length;
  }

  async function carregar(primeira) {
    if (!S) return;
    const j = await ZZ.api('agendadas', { params: { status: '' }, silencioso: true });
    if (!S) return;
    if (!j.ok) {
      if (j.sem_permissao || j.sem_conexao) { S.elL.innerHTML = '<div class="vazio"><i class="fa-solid fa-lock"></i>' + ZZ.esc(j.sem_conexao ? 'Nenhuma conexão (WhatsApp) liberada para o seu usuário.' : 'Sem permissão para ver as agendadas.') + '</div>'; return; }
      if (primeira || !S.itens.length) S.elL.innerHTML = `<div class="vazio ag-erro-box"><i class="fa-solid fa-cloud-bolt"></i>${ZZ.esc(j.msg || 'Não foi possível carregar as agendadas.')}<br><button class="btn-azul ag-vz-btn" data-ac="retry"><i class="fa-solid fa-rotate-right"></i> Tentar de novo</button></div>`;
      return;
    }
    const itens = j.itens || [];
    const novos = new Set();
    if (S.prev) itens.forEach(i => { const p = S.prev[i.id]; if (p && (p === 'pendente' || p === 'enviando') && i.status === 'enviada') novos.add(i.id); });
    const sig = JSON.stringify(itens.map(i => [i.id, i.status, i.quando, i.erro, i.texto, i.nome]));
    S.prev = Object.fromEntries(itens.map(i => [i.id, i.status]));
    ZZ.badge('agenda', j.pendentes || 0);
    if (novos.size) {
      novos.forEach(id => S.novos.add(id)); setTimeout(() => { novos.forEach(id => S.novos.delete(id)); const e = S.elL && S.elL.querySelector(`[data-id="${id}"]`); e && e.classList.remove('ag-novo'); }, 2500);
      ZZ.toast(novos.size === 1 ? 'Uma mensagem agendada foi enviada!' : novos.size + ' mensagens agendadas foram enviadas!', 'ok');
    }
    if (sig === S.sig && !primeira) return;
    S.sig = sig; S.itens = itens;
    desenharFiltros(); desenharLista();
  }

  function abrirReagendar(it) {
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const minimo = new Date(Date.now() + 60000);
    const base = it.quando * 1000 > minimo.getTime() ? new Date(it.quando * 1000) : new Date(Date.now() + 600000);
    const m = ZZ.modal(`<h3><i class="fa-regular fa-calendar"></i> Reagendar</h3>
      <p class="mut ag-m-p">Para ${ZZ.esc(it.nome || ZZ.fmtNumero(String(it.jid).split('@')[0]))}</p>
      <div class="ag-faixa"><i class="fa-solid fa-signature"></i><span>A mensagem sairá assinada: <b>${ZZ.esc((it.assinatura || it.autor || (ZZ.eu && ZZ.eu.usuario.nome) || '') + ':')}</b></span></div>
      <label for="agDt">Nova data e hora</label><input type="datetime-local" id="agDt" value="${fmt(base)}" min="${fmt(minimo)}">
      <div class="msg-campo" id="agMsg" hidden></div>
      <div class="ag-atalhos"><button class="btn-soft btn-sm" data-m="30">+30 min</button><button class="btn-soft btn-sm" data-m="60">+1 h</button><button class="btn-soft btn-sm" data-m="amanha">Amanhã 9h</button></div>
      <div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-check"></i> Reagendar</button></div>`);
    const dt = m.el.querySelector('#agDt'), msg = m.el.querySelector('#agMsg');
    m.el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const v = b.dataset.m; let d;
      if (v === 'amanha') { d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); } else d = new Date(Date.now() + Number(v) * 60000);
      dt.value = fmt(d); dt.classList.remove('erro-campo'); msg.hidden = true;
    });
    m.el.querySelector('[data-n]').onclick = () => m.fechar();
    const ok = m.el.querySelector('[data-s]');
    ok.onclick = () => {
      const ts = Math.floor(new Date(dt.value).getTime() / 1000);
      if (!dt.value || isNaN(ts) || ts <= Math.floor(Date.now() / 1000) + 30) {
        dt.classList.add('erro-campo'); msg.textContent = 'Escolha uma data e hora no futuro.'; msg.hidden = false; dt.focus(); return;
      }
      ZZ.busy(ok, async () => {
        const r = await ZZ.api('reagendar', { corpo: { id: it.id, quando: ts } });
        if (r.ok) { ZZ.toast('Mensagem reagendada para ' + rotuloQuando(ts).join(' às '), 'ok'); m.fechar(); carregar(false); }
        return r;
      });
    };
    setTimeout(() => dt.focus(), 50);
  }

  async function acao(ac, btn) {
    const el = btn.closest('.ag-card'), id = el && Number(el.dataset.id);
    const it = id && S.itens.find(i => i.id === id);
    if (!it) return;
    if (ac === 'reag') return abrirReagendar(it);
    if (ac === 'canc') {
      if (!await ZZ.confirmar('Cancelar este agendamento? A mensagem não será enviada.', 'Cancelar agendamento', true)) return;
      return ZZ.busy(btn, async () => {
        const r = await ZZ.api('cancelar_agendada', { corpo: { id } });
        if (r.ok) { ZZ.toast('Agendamento cancelado', 'ok'); carregar(false); }
        return r;
      });
    }
    if (ac === 'agora') {
      return ZZ.busy(btn, async () => {
        const r = await ZZ.api('enviar_agora', { corpo: { id } });
        if (r.ok) { ZZ.toast('Mensagem enviada!', 'ok'); carregar(false); }
        return r;
      });
    }
  }

  ZZ.pagina({
    id: 'agenda', titulo: 'Agendadas', icone: 'fa-clock', ordem: 4, tab: false,
    render(el, ctx) {
      const pf = ctx && ctx.params && ctx.params.status;
      S = { filtro: FILTROS.some(f => f[0] === pf) ? pf : 'pendente', itens: [], sig: null, prev: null, novos: new Set() };
      el.innerHTML = `<div class="ag-cab"><span class="vivo">ao vivo</span>${ZZ.pode('agenda.criar') ? '<button class="btn-azul ag-novo-btn" data-ac="novo"><i class="fa-solid fa-plus"></i> Agendar</button>' : '<span class="mut ag-semperm"><i class="fa-solid fa-lock"></i> Sem permissão para agendar</span>'}</div>
        <div class="ag-filtros" id="agF"></div><div class="ag-lista" id="agL">${ZZ.skeleton(4, 'skel-linha ag-skel')}</div>`;
      S.elF = el.querySelector('#agF'); S.elL = el.querySelector('#agL');
      desenharFiltros();
      el.addEventListener('click', e => {
        if (!S || !S.elL || !el.contains(S.elL)) return;
        const f = e.target.closest('[data-f]');
        if (f) { S.filtro = f.dataset.f; desenharFiltros(); desenharLista(); return; }
        const b = e.target.closest('[data-ac]'); if (!b) return;
        if (b.dataset.ac === 'novo') return ZZ.ir('enviar');
        if (b.dataset.ac === 'retry') { S.elL.innerHTML = ZZ.skeleton(4, 'skel-linha ag-skel'); return carregar(true); }
        acao(b.dataset.ac, b);
      });
      carregar(true);
      ZZ.poll(() => carregar(false), 10000);
      S.tick = setInterval(() => {
        if (!S || !S.elL) return;
        S.elL.querySelectorAll('[data-q]').forEach(c => { const t = contagem(Number(c.dataset.q)), s = c.lastElementChild; if (s && s.textContent !== t) s.textContent = t; });
      }, 1000);
    },
    destroy() { if (S && S.tick) clearInterval(S.tick); S = null; }
  });
})();
