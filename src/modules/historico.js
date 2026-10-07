/* ZapZap — Histórico de envios (linha do tempo, filtros, status de entrega, exportação CSV). */
(function () {
  const TIPOS = {
    texto: ['fa-message', 'Texto', 'azul'], imagem: ['fa-image', 'Imagem', 'verde'], video: ['fa-video', 'Vídeo', 'roxo'],
    audio: ['fa-microphone', 'Áudio', 'amar'], documento: ['fa-file-lines', 'Documento', 'cinza'], enquete: ['fa-square-poll-vertical', 'Enquete', 'rosa'],
    localizacao: ['fa-location-dot', 'Localização', 'verm'], contato: ['fa-address-card', 'Contato', 'ciano']
  };
  const STATUS = {
    pend: ['fa-clock', 'Enviando…', 'pend'], enviada: ['fa-check', 'Enviada', 'info'],
    entregue: ['fa-check-double', 'Entregue', 'info'], lida: ['fa-check-double', 'Lida', 'lida']
  };
  const ORIGENS = [['', 'Todos'], ['painel', 'Painel'], ['agenda', 'Agenda']];
  const RESULT = [['', 'Todos'], ['1', 'Sucesso'], ['0', 'Erro']];
  const PERIODO = [['', 'Todo o período'], ['1', 'Só hoje']];
  const inicioHoje = () => { const p = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Maceio' }).split('-'); return Math.floor(Date.parse(p[0] + '-' + p[1] + '-' + p[2] + 'T00:00:00-03:00') / 1000); };

  let S = null; // estado da página atual

  function filtros(f) {
    const p = {};
    if (f.origem) p.origem = f.origem;
    if (f.ok !== '') p.ok = f.ok;
    if (f.q) p.q = f.q;
    return p;
  }

  function cartao(it, novo) {
    const t = TIPOS[it.tipo] || ['fa-paper-plane', it.tipo || 'Envio', 'cinza'];
    const orig = it.origem === 'agenda' ? '<i class="fa-solid fa-clock"></i> Agenda' : '<i class="fa-solid fa-desktop"></i> Painel';
    return `<article class="hist-card${novo ? ' hist-novo' : ''}${it.ok ? '' : ' hist-falha'}" data-id="${it.id}">
      <div class="hist-ico hist-c-${t[2]}" title="${ZZ.esc(t[1])}"><i class="fa-solid ${t[0]}"></i></div>
      <div class="hist-corpo">
        <div class="hist-l1"><b class="hist-dest">${ZZ.esc(it.nome)}</b><time class="hist-hora" title="${ZZ.esc(ZZ.fmtDataHora(it.quando))}">${ZZ.esc(ZZ.fmtHora(it.quando))}</time></div>
        <div class="hist-prev">${it.resumo ? ZZ.esc(it.resumo) : '<span class="mut">(sem texto)</span>'}</div>
        <div class="hist-meta">
          <span class="badge-status ${it.ok ? 'b-ok' : 'b-err'}"><i class="fa-solid ${it.ok ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${it.ok ? 'Sucesso' : 'Erro'}</span>
          <span class="hist-tag">${ZZ.esc(t[1])}</span><span class="hist-tag">${orig}</span>
          ${it.ok && it.msg_id ? `<button class="btn-soft btn-sm hist-ver" data-id="${it.id}"><i class="fa-solid fa-check-double"></i> Ver status</button>` : ''}
        </div>
        ${!it.ok && it.erro ? `<div class="hist-erro"><i class="fa-solid fa-triangle-exclamation"></i> ${ZZ.esc(it.erro)}</div>` : ''}
        <div class="hist-st" data-st="${it.id}" hidden></div>
      </div></article>`;
  }

  function rotuloDia(ts) {
    const h = ZZ.fmtData(Math.floor(Date.now() / 1000)), d = ZZ.fmtData(ts), o = ZZ.fmtData(Math.floor(Date.now() / 1000) - 86400);
    return d === h ? 'Hoje' : d === o ? 'Ontem' : d;
  }

  function desenharLista() {
    const l = S.el.querySelector('.hist-lista');
    let dia = '', html = '';
    S.itens.forEach(it => {
      const d = ZZ.fmtData(it.quando);
      if (d !== dia) { dia = d; html += `<div class="hist-dia">${ZZ.esc(rotuloDia(it.quando))}</div>`; }
      html += cartao(it, S.novos.has(it.id));
    });
    l.innerHTML = html;
    S.novos.clear();
    const mais = S.el.querySelector('.hist-mais');
    mais.hidden = S.pag >= S.paginas;
    mais.querySelector('span').textContent = `Carregar mais (${S.itens.length} de ${S.total})`;
    S.el.querySelector('.hist-qtd').textContent = S.total === 1 ? '1 envio' : ZZ.fmtNumero ? S.total + ' envios' : '';
    // reaplica status já consultados
    Object.entries(S.stat).forEach(([id, st]) => marcarStatus(id, st));
  }

  function marcarStatus(id, st) {
    const el = S.el.querySelector(`[data-st="${id}"]`); if (!el) return;
    const s = STATUS[st] || STATUS.pend;
    el.hidden = false; el.className = 'hist-st hist-st-' + s[2];
    el.innerHTML = `<i class="fa-solid ${s[0]}"></i> ${s[1]}`;
  }

  function resumo(r) {
    if (!r) return;
    const set = (k, v) => { const e = S.el.querySelector(`[data-n="${k}"]`); if (e && e.textContent !== String(v)) { e.textContent = v; e.classList.remove('hist-pulo'); void e.offsetWidth; e.classList.add('hist-pulo'); } };
    set('total', r.total); set('sucesso', r.sucesso); set('erro', r.erro); set('hoje', r.hoje);
  }

  function erroCartao(msg) {
    const l = S.el.querySelector('.hist-lista');
    l.innerHTML = `<div class="card-soft hist-erro-box"><i class="fa-solid fa-plug-circle-xmark"></i><p>${ZZ.esc(msg || 'Não foi possível carregar o histórico.')}</p><button class="btn-azul" data-tentar><i class="fa-solid fa-rotate-right"></i> Tentar de novo</button></div>`;
    l.querySelector('[data-tentar]').onclick = e => ZZ.busy(e.currentTarget, () => carregar(true));
    S.el.querySelector('.hist-mais').hidden = true;
  }

  async function carregar(zero) {
    const meu = ++S.req;
    const pag = zero ? 1 : S.pag + 1;
    if (zero) S.el.querySelector('.hist-lista').innerHTML = ZZ.skeleton(5, 'skel-linha hist-skel');
    const j = await ZZ.api('historico', { params: { pag, ...filtros(S.f) }, silencioso: true });
    if (meu !== S.req || !S.el.isConnected) return { ok: true };
    if (!j.ok) { if (zero || !S.itens.length) erroCartao(j.sem_permissao ? 'Você não tem permissão para ver o histórico.' : j.sem_conexao ? 'Nenhuma conexão (WhatsApp) liberada para o seu usuário.' : j.msg); else ZZ.toast(j.msg || 'Falha ao carregar mais', 'err'); return j; }
    let novosIt = j.itens || [];
    if (S.f.hoje) { const ini = inicioHoje(), acabou = novosIt.some(i => i.quando < ini); novosIt = novosIt.filter(i => i.quando >= ini); if (acabou) j.paginas = j.pag; }
    S.pag = j.pag; S.paginas = j.paginas; S.total = j.total;
    S.itens = zero ? novosIt : S.itens.concat(novosIt.filter(i => !S.itens.some(x => x.id === i.id)));
    if (S.f.hoje && j.pag >= j.paginas) S.total = S.itens.length;
    if (S.f.hoje && j.pag < j.paginas && !novosIt.length) return carregar(false);
    resumo(j.resumo);
    if (!S.itens.length) {
      S.el.querySelector('.hist-lista').innerHTML = `<div class="vazio"><i class="fa-regular fa-folder-open"></i>${S.f.q || S.f.origem || S.f.ok !== '' || S.f.hoje ? 'Nenhum envio encontrado com esses filtros.' : 'Nenhum envio registrado ainda. Suas mensagens enviadas aparecem aqui.'}</div>`;
      S.el.querySelector('.hist-mais').hidden = true; S.el.querySelector('.hist-qtd').textContent = '0 envios';
    } else desenharLista();
    atualizarCsv();
    return j;
  }

  // Polling silencioso: só traz o que for novo no topo, sem redesenhar tudo.
  async function atualizar() {
    if (!S || !S.itens.length && S.req === 0) return;
    const meu = S.req;
    const j = await ZZ.api('historico', { params: { pag: 1, ...filtros(S.f) }, silencioso: true });
    if (!j.ok || meu !== S.req || !S.el.isConnected) return;
    resumo(j.resumo);
    const ini0 = S.f.hoje ? inicioHoje() : 0;
    const novos = j.itens.filter(i => i.quando >= ini0 && !S.itens.some(x => x.id === i.id));
    if (!novos.length) { S.total = j.total; return; }
    novos.forEach(n => S.novos.add(n.id));
    S.itens = novos.concat(S.itens).sort((a, b) => b.quando - a.quando || b.id - a.id);
    S.total = j.total; S.paginas = Math.max(S.paginas, j.paginas);
    desenharLista();
  }

  function atualizarCsv() {
    const a = S.el.querySelector('.hist-csv'); if (!a) return;
    a.href = 'api.php?' + new URLSearchParams({ a: 'exportar_csv', ...filtros(S.f) });
  }

  function pilulas(nome, lista, atual) {
    return lista.map(([v, r]) => `<button type="button" class="hist-pil${v === atual ? ' ativa' : ''}" data-${nome}="${v}">${r}</button>`).join('');
  }

  ZZ.pagina({
    id: 'historico', titulo: 'Histórico', icone: 'fa-clock-rotate-left', ordem: 7,
    render(el, ctx) {
      const pr = (ctx && ctx.params) || {};
      S = { el, f: { origem: ['painel', 'agenda'].includes(pr.origem) ? pr.origem : '', ok: ['0', '1'].includes(pr.ok) ? pr.ok : '', q: '', hoje: pr.hoje === '1' ? '1' : '' }, itens: [], pag: 0, paginas: 1, total: 0, req: 0, stat: {}, novos: new Set() };
      el.innerHTML = `<div class="hist">
        <div class="stats hist-stats">
          <div class="card-soft stat"><span class="ic"><i class="fa-solid fa-paper-plane"></i></span><div class="num" data-n="total">–</div><div class="lbl">Envios</div></div>
          <div class="card-soft stat"><span class="ic hist-ic-ok"><i class="fa-solid fa-circle-check"></i></span><div class="num" data-n="sucesso">–</div><div class="lbl">Com sucesso</div></div>
          <div class="card-soft stat"><span class="ic hist-ic-err"><i class="fa-solid fa-circle-xmark"></i></span><div class="num" data-n="erro">–</div><div class="lbl">Com erro</div></div>
          <div class="card-soft stat"><span class="ic"><i class="fa-solid fa-calendar-day"></i></span><div class="num" data-n="hoje">–</div><div class="lbl">Hoje</div></div>
        </div>
        <div class="card-soft hist-filtros">
          <div class="hist-busca"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="hist-q" placeholder="Buscar por texto, número ou erro" aria-label="Buscar no histórico" autocomplete="off"></div>
          <div class="hist-grupo" role="group" aria-label="Origem"><span class="hist-gl">Origem</span><div class="hist-pils">${pilulas('origem', ORIGENS, S.f.origem)}</div></div>
          <div class="hist-grupo" role="group" aria-label="Resultado"><span class="hist-gl">Resultado</span><div class="hist-pils">${pilulas('ok', RESULT, S.f.ok)}</div></div>
          <div class="hist-grupo" role="group" aria-label="Período"><span class="hist-gl">Período</span><div class="hist-pils">${pilulas('hoje', PERIODO, S.f.hoje)}</div></div>
        </div>
        <div class="hist-barra"><span class="hist-qtd mut"></span><span class="vivo">ao vivo</span><span class="espaco"></span>
          ${ZZ.pode('historico.exportar') ? '<a class="btn-soft btn-sm hist-csv" href="#" download><i class="fa-solid fa-file-csv"></i> Exportar CSV</a>' : '<span class="btn-soft btn-sm hist-csv-bloq" title="Sem permissão" aria-disabled="true" style="opacity:.5"><i class="fa-solid fa-lock"></i> Exportar CSV (sem permissão)</span>'}</div>
        <div class="hist-lista"></div>
        <button class="btn-soft w100 hist-mais" hidden><i class="fa-solid fa-angles-down"></i> <span>Carregar mais</span></button>
      </div>`;
      atualizarCsv();
      el.querySelectorAll('.hist-pil').forEach(b => b.onclick = () => {
        const k = b.dataset.origem !== undefined ? 'origem' : b.dataset.hoje !== undefined ? 'hoje' : 'ok';
        S.f[k] = b.dataset[k];
        b.parentNode.querySelectorAll('.hist-pil').forEach(x => x.classList.toggle('ativa', x === b));
        ZZ.vibrar(8); carregar(true);
      });
      el.querySelector('.hist-q').addEventListener('input', ZZ.debounce(e => { S.f.q = e.target.value.trim(); carregar(true); }, 350));
      el.querySelector('.hist-mais').onclick = e => ZZ.busy(e.currentTarget, () => carregar(false));
      el.querySelector('.hist-lista').addEventListener('click', e => {
        const b = e.target.closest('.hist-ver'); if (!b) return;
        ZZ.busy(b, async () => {
          const j = await ZZ.api('status_msg', { params: { id: b.dataset.id } });
          if (j.ok) { S.stat[b.dataset.id] = j.status; marcarStatus(b.dataset.id, j.status); ZZ.toast('Status: ' + (STATUS[j.status] || STATUS.pend)[1], 'ok'); }
          return j;
        });
      });
      carregar(true);
      ZZ.poll(atualizar, 10000);
    },
    destroy() { if (S) S.req++; S = null; }
  });
})();
