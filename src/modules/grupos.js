/* ZapZap — módulo Grupos (somente leitura): lista, detalhes, participantes, link de convite. */
(function () {
  const ZZ = window.ZZ;
  let el = null, vivo = false, q = '', grupos = [], total = 0, carregou = false, reqSeq = 0;

  const tsSeg = v => { if (!v) return 0; if (typeof v === 'number' || /^\d+$/.test(String(v))) { v = Number(v); return v > 1e11 ? Math.floor(v / 1000) : v; } const d = Date.parse(v); return d ? Math.floor(d / 1000) : 0; };
  const curta = (t, n = 90) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const avatar = (foto, nome, cls = '') => foto
    ? `<img class="avatar ${cls}" src="${ZZ.esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;avatar ${cls}&quot;>${ZZ.esc(ZZ.iniciais(nome))}</span>'">`
    : `<span class="avatar ${cls}">${ZZ.esc(ZZ.iniciais(nome))}</span>`;
  const plural = (n, a, b) => `${ZZ.fmtNumero ? n : n} ${n === 1 ? a : b}`;

  function esqueleto() { return ZZ.skeleton(5, 'skel-linha'); }

  function erroHtml(msg) {
    return `<div class="card-soft gp-erro"><i class="fa-solid fa-triangle-exclamation"></i><p>${ZZ.esc(msg || 'Não foi possível carregar os grupos.')}</p><button class="btn-azul" data-gp-retry><i class="fa-solid fa-rotate-right"></i> Tentar de novo</button></div>`;
  }

  function cardHtml(g, i) {
    const t = tsSeg(g.criado);
    const n = Number(g.tamanho) || 0;
    return `<button class="gp-card" data-i="${i}" type="button">
      ${avatar(g.foto, g.nome)}
      <span class="gp-info">
        <b class="gp-nome">${ZZ.esc(g.nome || 'Grupo sem nome')}</b>
        <span class="gp-meta"><i class="fa-solid fa-user-group"></i> ${n} ${n === 1 ? 'participante' : 'participantes'}${t ? ` · <i class="fa-regular fa-calendar"></i> ${ZZ.fmtData(t)}` : ''}</span>
        ${g.descricao ? `<span class="gp-desc">${ZZ.esc(curta(g.descricao))}</span>` : ''}
      </span>
      <i class="fa-solid fa-chevron-right gp-seta"></i>
    </button>`;
  }

  function desenhar(destaque) {
    const lista = ZZ.$('#gpLista', el), cont = ZZ.$('#gpCont', el);
    if (!lista) return;
    cont.textContent = total === 1 ? '1 grupo' : total + ' grupos';
    if (!grupos.length) {
      lista.innerHTML = `<div class="vazio"><i class="fa-solid fa-users-slash"></i>${q ? 'Nenhum grupo encontrado para essa busca.' : 'Você ainda não participa de nenhum grupo.'}</div>`;
      return;
    }
    const antes = new Set(destaque ? [...lista.querySelectorAll('.gp-card')].map(b => b.dataset.jid) : []);
    lista.innerHTML = grupos.map(cardHtml).join('');
    lista.querySelectorAll('.gp-card').forEach(b => {
      const g = grupos[+b.dataset.i]; b.dataset.jid = g.jid;
      if (destaque && antes.size && !antes.has(g.jid)) b.classList.add('gp-novo');
    });
  }

  async function carregar(silencioso) {
    const meu = ++reqSeq;
    const lista = ZZ.$('#gpLista', el); if (!lista) return;
    if (!silencioso || !carregou) lista.innerHTML = esqueleto();
    const j = await ZZ.api('grupos', { params: { q }, silencioso: true });
    if (meu !== reqSeq || !el) return;
    if (!j.ok) {
      if (silencioso && carregou) return; // polling falhou: mantém a lista atual
      lista.innerHTML = erroHtml(j.sem_permissao ? 'Você não tem permissão para ver os grupos.' : j.sem_conexao ? 'Nenhuma conexão (WhatsApp) liberada para o seu usuário.' : j.msg);
      if (j.sem_permissao) { const b = ZZ.$('[data-gp-retry]', lista); if (b) b.remove(); return; }
      ZZ.$('[data-gp-retry]', lista).onclick = e => ZZ.busy(e.currentTarget, async () => { await carregar(false); return true; });
      return;
    }
    grupos = j.grupos || [];
    if (!q) total = grupos.length;
    else total = grupos.length;
    carregou = true;
    desenhar(silencioso);
  }

  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
    return new Promise((ok, err) => {
      const t = document.createElement('textarea'); t.value = texto; t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      document.body.appendChild(t); t.focus(); t.select(); t.setSelectionRange(0, texto.length);
      let r = false; try { r = document.execCommand('copy'); } catch (e) { }
      t.remove(); r ? ok() : err(new Error('copy'));
    });
  }

  function abrir(g) {
    const t = tsSeg(g.criado);
    const n = Number(g.tamanho) || 0;
    const m = ZZ.modal(`
      <div class="gp-det">
        <div class="gp-cab">${avatar(g.foto, g.nome, 'gp-grande')}
          <div><h3>${ZZ.esc(g.nome || 'Grupo sem nome')}</h3>
          <div class="mut gp-sub">${n} ${n === 1 ? 'participante' : 'participantes'}${t ? ' · criado em ' + ZZ.fmtData(t) : ''}</div></div>
        </div>
        <div class="gp-sec"><b><i class="fa-solid fa-align-left"></i> Descrição</b>
          <p class="gp-descfull">${g.descricao ? ZZ.esc(g.descricao) : '<span class="mut">Sem descrição.</span>'}</p></div>
        <div class="gp-botoes">
          ${ZZ.pode('conversas.ver') ? '<button class="btn-azul" data-conv><i class="fa-solid fa-comments"></i> Conversar</button>' : ''}
          ${ZZ.pode(['enviar.texto', 'enviar.midia', 'enviar.enquete', 'enviar.localizacao', 'enviar.contato']) ? '<button class="btn-soft" data-env><i class="fa-solid fa-paper-plane"></i> Enviar mensagem</button>' : ''}
          ${ZZ.pode('grupos.convite') ? '<button class="btn-soft gp-largo" data-link><i class="fa-solid fa-link"></i> Copiar link de convite</button>' : '<span class="mut gp-largo" style="font-size:.82rem" title="Sem permissão"><i class="fa-solid fa-lock"></i> Link de convite: sem permissão</span>'}
        </div>
        <div class="gp-sec"><b><i class="fa-solid fa-users"></i> Participantes <span class="mut" id="gpQtd"></span></b>
          <input type="search" id="gpBuscaP" placeholder="Buscar participante…" autocomplete="off" hidden>
          <div id="gpPart" class="gp-part">${ZZ.skeleton(4, 'skel-linha')}</div>
        </div>
        <div class="acoes"><button class="btn-soft" data-fechar>Fechar</button></div>
      </div>`);
    const $ = s => ZZ.$(s, m.el);
    $('[data-fechar]').onclick = () => m.fechar();
    if ($('[data-conv]')) $('[data-conv]').onclick = () => { m.fechar(); ZZ.ir('conversas', { jid: g.jid }); };
    if ($('[data-env]')) $('[data-env]').onclick = () => { m.fechar(); ZZ.ir('enviar', { para: g.jid }); };
    if ($('[data-link]')) $('[data-link]').onclick = e => ZZ.busy(e.currentTarget, async () => {
      const j = await ZZ.api('convite', { params: { jid: g.jid }, silencioso: true });
      if (!j.ok || !j.link) { ZZ.toast(j.msg || 'Não foi possível obter o link de convite. Talvez você não seja admin do grupo.', 'err'); return false; }
      try { await copiar(j.link); ZZ.toast('Link de convite copiado!', 'ok'); return true; }
      catch (x) { ZZ.toast('Não consegui copiar automaticamente. Tente de novo.', 'err'); return false; }
    });

    let parts = [];
    const pintar = () => {
      const f = ($('#gpBuscaP').value || '').trim().toLowerCase(), fd = f.replace(/\D/g, '');
      const lst = !f ? parts : parts.filter(p => (p.nome || '').toLowerCase().includes(f) || (fd && String(p.numero || '').includes(fd)));
      $('#gpPart').innerHTML = lst.length ? lst.map(p => {
        const nome = p.nome || ZZ.fmtNumero(p.numero) || 'Sem nome';
        return `<div class="gp-p">${avatar(p.foto, nome)}<div class="gp-pinfo"><b>${ZZ.esc(nome)}</b>${p.numero ? `<span class="mut">${ZZ.esc(ZZ.fmtNumero(p.numero))}</span>` : ''}</div>${p.admin ? '<span class="badge-status b-info gp-admin"><i class="fa-solid fa-shield-halved"></i> admin</span>' : ''}</div>`;
      }).join('') : `<div class="vazio"><i class="fa-solid fa-user-slash"></i>Nenhum participante encontrado.</div>`;
    };
    const carregarP = async () => {
      $('#gpPart').innerHTML = ZZ.skeleton(4, 'skel-linha');
      const j = await ZZ.api('grupo', { params: { jid: g.jid }, silencioso: true });
      if (!m.el.isConnected) return;
      if (!j.ok) {
        $('#gpPart').innerHTML = `<div class="gp-erro"><i class="fa-solid fa-triangle-exclamation"></i><p>${ZZ.esc(j.msg || 'Não foi possível carregar os participantes.')}</p><button class="btn-azul btn-sm" data-r><i class="fa-solid fa-rotate-right"></i> Tentar de novo</button></div>`;
        $('[data-r]').onclick = () => carregarP(); return;
      }
      const gr = j.grupo || {};
      parts = (gr.participantes || []).slice().sort((a, b) => (b.admin ? 1 : 0) - (a.admin ? 1 : 0) || String(a.nome || a.numero).localeCompare(String(b.nome || b.numero), 'pt-BR'));
      $('#gpQtd').textContent = '(' + parts.length + ')';
      $('#gpBuscaP').hidden = parts.length < 8;
      if (gr.descricao && !g.descricao) { $('.gp-descfull').textContent = gr.descricao; }
      pintar();
    };
    $('#gpBuscaP').addEventListener('input', ZZ.debounce(pintar, 150));
    carregarP();
  }

  ZZ.pagina({
    id: 'grupos', titulo: 'Grupos', icone: 'fa-users', ordem: 6, tab: false,
    render(raiz) {
      el = raiz; q = ''; grupos = []; total = 0; carregou = false; vivo = true;
      raiz.innerHTML = `<div class="gp-topo">
          <div class="gp-busca"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="gpQ" placeholder="Buscar grupo por nome…" autocomplete="off" aria-label="Buscar grupo"></div>
          <div class="gp-linha"><span class="gp-total"><i class="fa-solid fa-users"></i> <b id="gpCont">…</b></span><span class="vivo">ao vivo</span></div>
        </div>
        <div id="gpLista" class="gp-lista"></div>`;
      ZZ.$('#gpQ', raiz).addEventListener('input', ZZ.debounce(e => { q = e.target.value.trim(); carregar(false); }, 350));
      ZZ.$('#gpLista', raiz).addEventListener('click', e => {
        const b = e.target.closest('.gp-card'); if (b && grupos[+b.dataset.i]) abrir(grupos[+b.dataset.i]);
      });
      carregar(false);
      ZZ.poll(() => carregar(true), 60000);
    },
    destroy() { vivo = false; el = null; reqSeq++; }
  });
})();
