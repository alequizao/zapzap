/* ZapZap — módulo Etiquetas e notas.
 *
 * COMPONENTES REUTILIZÁVEIS (para a tela Conversas/Atendimento) — carregados junto com este módulo:
 *
 *   ZZ.etiquetas.abrirSeletor(jid, aoMudar)
 *       Bottom-sheet para marcar/desmarcar etiquetas da conversa `jid` (com contador e animação).
 *       `aoMudar(listaAplicadas)` é chamado a cada alteração; recebe [{id,nome,cor}].
 *       Exige permissão etiquetas.ver (marcar/criar exige etiquetas.editar; sem ela o sheet fica só leitura).
 *   ZZ.etiquetas.chips(jid) → Promise<string HTML>
 *       HTML (já escapado) com os chips coloridos da conversa (`<span class="et-chip">`), ou '' se não houver/sem permissão.
 *       Para mostrar o chip em listas use também ZZ.etiquetas.chipHtml({nome,cor}).
 *
 *   ZZ.notas.abrir(jid, nomeContato)
 *       Bottom-sheet com as notas INTERNAS da conversa (autor, hora, fixar, excluir) e campo para nova nota.
 *       As notas ficam só no painel: NUNCA são enviadas ao cliente pelo WhatsApp.
 *       Exige notas.ver (escrever/fixar exige notas.editar; excluir: autor ou notas.editar).
 *
 * Página: #/etiquetas — gestão das etiquetas (cards, contagem clicável, 12 cores, renomear, excluir) e aba "Notas recentes".
 */
(function () {
  const ZZ = window.ZZ;
  const COR_PAD = ['#2563EB', '#0284C7', '#0D9488', '#16A34A', '#4D7C0F', '#B45309', '#EA580C', '#DC2626', '#DB2777', '#9333EA', '#4F46E5', '#475569'];
  const corOk = c => (/^#[0-9A-Fa-f]{6}$/.test(String(c)) ? c : '#475569');
  const chipHtml = e => `<span class="et-chip" style="--et-c:${corOk(e.cor)}">${ZZ.esc(e.nome)}</span>`;

  /* ---------- API pública ---------- */
  const E = ZZ.etiquetas = {
    chipHtml,
    async chips(jid) {
      if (!ZZ.pode('etiquetas.ver')) return '';
      const j = await ZZ.api('ver_etiquetas_conversa', { params: { jid }, silencioso: true });
      if (!j.ok || !(j.etiquetas || []).length) return '';
      return `<span class="et-chips">${j.etiquetas.map(chipHtml).join('')}</span>`;
    },
    async abrirSeletor(jid, aoMudar) {
      if (!ZZ.pode('etiquetas.ver')) { ZZ.toast('Você não tem permissão para ver etiquetas.', 'err'); return; }
      const podeEd = ZZ.pode('etiquetas.editar');
      let fechou = false, todas = [], cores = COR_PAD, corNova = COR_PAD[0];
      const m = ZZ.modal(`<h3><i class="fa-solid fa-tags"></i> Etiquetas da conversa <span class="et-cont" id="etCont"></span></h3><div id="etSel">${ZZ.skeleton(4, 'et-skel')}</div>`, () => { fechou = true; });
      const box = ZZ.$('#etSel', m.el), cont = ZZ.$('#etCont', m.el);
      const notificar = () => { if (aoMudar) { try { aoMudar(todas.filter(t => t.aplicada).map(t => ({ id: t.id, nome: t.nome, cor: t.cor }))); } catch (e) { } } };
      const desenhar = () => {
        const n = todas.filter(t => t.aplicada).length;
        cont.textContent = n ? n + (n === 1 ? ' marcada' : ' marcadas') : '';
        cont.classList.toggle('et-pop', !!n);
        const lista = todas.map(t => `<button type="button" class="et-opt ${t.aplicada ? 'on' : ''}" data-id="${t.id}" ${podeEd ? '' : 'disabled'} style="--et-c:${corOk(t.cor)}"><span class="et-ponto"></span><span class="et-onome">${ZZ.esc(t.nome)}</span><i class="fa-solid fa-circle-check et-ck"></i></button>`).join('');
        box.innerHTML = (lista ? `<div class="et-opts">${lista}</div>` : `<div class="vazio"><i class="fa-solid fa-tags"></i>Nenhuma etiqueta criada ainda.${podeEd ? '' : ' Peça a um administrador para criar.'}</div>`)
          + (podeEd ? `<div class="et-nova"><input type="text" id="etNn" maxlength="40" placeholder="Nova etiqueta…" autocomplete="off"><button type="button" class="btn-azul" id="etNb"><i class="fa-solid fa-plus"></i> Criar</button></div><div class="et-cores et-cores-sm" id="etNc">${cores.map(c => `<button type="button" class="et-cor ${c === corNova ? 'sel' : ''}" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>` : '')
          + `<div class="acoes"><button class="btn-acao" data-f>Pronto</button></div>`;
        ZZ.$('[data-f]', box).onclick = () => m.fechar();
        ZZ.$$('.et-opt', box).forEach(b => b.onclick = () => alternar(b));
        if (podeEd) {
          ZZ.$$('#etNc .et-cor', box).forEach(b => b.onclick = () => { corNova = b.dataset.c; ZZ.$$('#etNc .et-cor', box).forEach(x => x.classList.toggle('sel', x === b)); });
          const nn = ZZ.$('#etNn', box), nb = ZZ.$('#etNb', box);
          const criar = () => {
            const nome = nn.value.trim();
            if (!nome) { nn.classList.add('erro-campo'); nn.focus(); ZZ.toast('Digite o nome da etiqueta.', 'err'); return; }
            nn.classList.remove('erro-campo');
            ZZ.busy(nb, async () => {
              const r = await ZZ.api('salvar_etiqueta', { corpo: { nome, cor: corNova } });
              if (!r.ok) return r;
              const a = await ZZ.api('aplicar_etiqueta', { corpo: { jid, etiqueta_id: r.etiqueta.id, aplicar: true } });
              todas.push({ ...r.etiqueta, aplicada: !!a.ok }); todas.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
              if (!fechou) { desenhar(); const el = ZZ.$(`.et-opt[data-id="${r.etiqueta.id}"]`, box); el && el.classList.add('et-aplic'); }
              ZZ.toast('Etiqueta criada e aplicada.', 'ok'); notificar(); return r;
            });
          };
          nb.onclick = criar; nn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); criar(); } });
        }
      };
      const alternar = async b => {
        const t = todas.find(x => x.id === Number(b.dataset.id)); if (!t || b.classList.contains('et-ocupado')) return;
        const novo = !t.aplicada;
        t.aplicada = novo; b.classList.toggle('on', novo); b.classList.add('et-ocupado'); ZZ.vibrar(10);
        if (novo) { b.classList.remove('et-aplic'); void b.offsetWidth; b.classList.add('et-aplic'); }
        cont.textContent = (n => n ? n + (n === 1 ? ' marcada' : ' marcadas') : '')(todas.filter(x => x.aplicada).length);
        const r = await ZZ.api('aplicar_etiqueta', { corpo: { jid, etiqueta_id: t.id, aplicar: novo } });
        b.classList.remove('et-ocupado');
        if (!r.ok) { t.aplicada = !novo; b.classList.toggle('on', !novo); b.classList.add('erro-flash'); setTimeout(() => b.classList.remove('erro-flash'), 500); cont.textContent = (n => n ? n + (n === 1 ? ' marcada' : ' marcadas') : '')(todas.filter(x => x.aplicada).length); return; }
        notificar();
      };
      const j = await ZZ.api('ver_etiquetas_conversa', { params: { jid } });
      if (fechou) return;
      if (!j.ok) { box.innerHTML = `<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar as etiquetas.<br><button class="btn-azul" data-f>Fechar</button></div>`; ZZ.$('[data-f]', box).onclick = () => m.fechar(); return; }
      todas = j.todas || []; cores = j.cores || COR_PAD; corNova = cores[Math.floor(Math.random() * cores.length)];
      desenhar();
    },
  };

  const tempoNota = ts => { const hoje = ZZ.fmtData(Math.floor(Date.now() / 1000)); return (ZZ.fmtData(ts) === hoje ? 'hoje ' : ZZ.fmtData(ts) + ' ') + ZZ.fmtHora(ts); };

  ZZ.notas = {
    async abrir(jid, nomeContato) {
      if (!ZZ.pode('notas.ver')) { ZZ.toast('Você não tem permissão para ver notas.', 'err'); return; }
      const podeEd = ZZ.pode('notas.editar');
      let notas = [], fechou = false;
      const m = ZZ.modal(`<h3><i class="fa-solid fa-note-sticky"></i> Notas internas${nomeContato ? ' <span class="et-sub">· ' + ZZ.esc(nomeContato) + '</span>' : ''}</h3>
        <div class="et-aviso"><i class="fa-solid fa-lock"></i><span>Só a equipe vê. Estas notas <b>nunca</b> são enviadas ao cliente.</span></div>
        <div id="ntLista" class="et-notas">${ZZ.skeleton(3, 'et-skel')}</div>
        ${podeEd ? `<div class="et-nnota"><textarea id="ntTxt" maxlength="2000" rows="3" placeholder="Escreva uma nota interna…"></textarea><div class="et-nrod"><small class="mut" id="ntCnt">0/2000</small><button class="btn-azul" id="ntAdd"><i class="fa-solid fa-plus"></i> Adicionar nota</button></div></div>` : ''}
        <div class="acoes"><button class="btn-soft" data-f>Fechar</button></div>`, () => { fechou = true; });
      const lista = ZZ.$('#ntLista', m.el);
      ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
      const ordenar = () => notas.sort((a, b) => (b.fixada - a.fixada) || (b.criado - a.criado) || (b.id - a.id));
      const desenhar = (novoId) => {
        ordenar();
        lista.innerHTML = notas.length ? notas.map(n => `<div class="et-nota ${n.fixada ? 'fix' : ''} ${n.id === novoId ? 'et-novo' : ''}" data-id="${n.id}">
          <div class="et-nhead"><b>${ZZ.esc(n.autor)}</b><span class="mut">${tempoNota(n.criado)}${n.editada ? ' · editada' : ''}</span>${n.fixada ? '<span class="et-pin"><i class="fa-solid fa-thumbtack"></i> fixada</span>' : ''}</div>
          <div class="et-ntxt">${ZZ.esc(n.texto)}</div>
          <div class="et-nacoes">${podeEd ? `<button class="btn-soft btn-sm" data-fix><i class="fa-solid fa-thumbtack"></i> ${n.fixada ? 'Desafixar' : 'Fixar'}</button>` : ''}${n.minha || podeEd ? `<button class="btn-perigo btn-sm" data-del><i class="fa-solid fa-trash"></i> Excluir</button>` : ''}</div></div>`).join('')
          : '<div class="vazio"><i class="fa-regular fa-note-sticky"></i>Nenhuma nota nesta conversa ainda.</div>';
        ZZ.$$('.et-nota', lista).forEach(card => {
          const id = Number(card.dataset.id), n = notas.find(x => x.id === id);
          const f = ZZ.$('[data-fix]', card), d = ZZ.$('[data-del]', card);
          if (f) f.onclick = () => ZZ.busy(f, async () => {
            const r = await ZZ.api('fixar_nota', { corpo: { id, fixada: !n.fixada } });
            if (r.ok) { n.fixada = r.fixada; ZZ.toast(n.fixada ? 'Nota fixada no topo.' : 'Nota desafixada.', 'ok'); desenhar(id); }
            return r;
          });
          if (d) d.onclick = async () => {
            if (!(await ZZ.confirmar('Excluir esta nota? Isso não pode ser desfeito.', 'Excluir', true))) return;
            card.classList.add('et-sai');
            const r = await ZZ.api('excluir_nota', { corpo: { id } });
            if (r.ok) { notas = notas.filter(x => x.id !== id); setTimeout(() => desenhar(), 220); ZZ.toast('Nota excluída.', 'ok'); } else card.classList.remove('et-sai');
          };
        });
      };
      const carregar = async () => {
        const j = await ZZ.api('listar_notas', { params: { jid } });
        if (fechou) return;
        if (!j.ok) { lista.innerHTML = '<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar as notas.<br><button class="btn-azul" data-r>Tentar de novo</button></div>'; ZZ.$('[data-r]', lista).onclick = () => { lista.innerHTML = ZZ.skeleton(3, 'et-skel'); carregar(); }; return; }
        notas = j.itens || []; desenhar();
      };
      if (podeEd) {
        const t = ZZ.$('#ntTxt', m.el), c = ZZ.$('#ntCnt', m.el), b = ZZ.$('#ntAdd', m.el);
        t.oninput = () => { c.textContent = t.value.length + '/2000'; c.classList.toggle('et-lim', t.value.length > 1900); t.classList.remove('erro-campo'); };
        t.onfocus = () => setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
        b.onclick = () => {
          const texto = t.value.trim();
          if (!texto) { t.classList.add('erro-campo'); t.focus(); ZZ.toast('Escreva o texto da nota.', 'err'); return; }
          ZZ.busy(b, async () => {
            const r = await ZZ.api('salvar_nota', { corpo: { jid, texto } });
            if (r.ok) { notas.unshift(r.nota); t.value = ''; c.textContent = '0/2000'; desenhar(r.nota.id); lista.scrollTop = 0; ZZ.toast('Nota adicionada.', 'ok'); }
            return r;
          });
        };
      }
      carregar();
    },
  };

  /* ---------- página ---------- */
  let el = null, aba = 'etiquetas', vivo = false;

  const erroHtml = (msg, ac) => `<div class="card-soft et-erro"><i class="fa-solid fa-triangle-exclamation"></i><p>${ZZ.esc(msg)}</p><button class="btn-azul" data-${ac}>Tentar de novo</button></div>`;

  function abrirEditor(e, cores, depois) {
    let cor = e ? corOk(e.cor) : cores[Math.floor(Math.random() * cores.length)];
    const m = ZZ.modal(`<h3><i class="fa-solid fa-tag"></i> ${e ? 'Editar etiqueta' : 'Nova etiqueta'}</h3>
      <label for="etNome">Nome</label><input type="text" id="etNome" maxlength="40" placeholder="Ex.: Cliente VIP" autocomplete="off" value="${ZZ.esc(e ? e.nome : '')}">
      <div class="msg-campo" id="etErr" hidden></div>
      <label>Cor</label><div class="et-cores">${cores.map(c => `<button type="button" class="et-cor ${c === cor ? 'sel' : ''}" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>
      <label>Prévia</label><div id="etPrev"></div>
      <div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-check"></i> Salvar</button></div>`);
    const inp = ZZ.$('#etNome', m.el), prev = ZZ.$('#etPrev', m.el), err = ZZ.$('#etErr', m.el);
    const pinta = () => { prev.innerHTML = chipHtml({ nome: inp.value.trim() || 'Nome da etiqueta', cor }); };
    pinta(); inp.oninput = () => { inp.classList.remove('erro-campo'); err.hidden = true; pinta(); };
    ZZ.$$('.et-cor', m.el).forEach(b => b.onclick = () => { cor = b.dataset.c; ZZ.$$('.et-cor', m.el).forEach(x => x.classList.toggle('sel', x === b)); pinta(); ZZ.vibrar(8); });
    ZZ.$('[data-n]', m.el).onclick = () => m.fechar();
    const s = ZZ.$('[data-s]', m.el);
    const salvar = () => {
      const nome = inp.value.trim();
      if (!nome) { inp.classList.add('erro-campo'); err.textContent = 'Informe o nome da etiqueta.'; err.hidden = false; inp.focus(); return; }
      ZZ.busy(s, async () => {
        const r = await ZZ.api('salvar_etiqueta', { corpo: { id: e ? e.id : 0, nome, cor } });
        if (r.ok) { m.fechar(); ZZ.toast(e ? 'Etiqueta atualizada.' : 'Etiqueta criada.', 'ok'); depois(r.etiqueta.id); }
        else if (r.msg) { inp.classList.add('erro-campo'); err.textContent = r.msg; err.hidden = false; }
        return r;
      });
    };
    s.onclick = salvar; inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') salvar(); });
    setTimeout(() => inp.focus(), 120);
  }

  function abrirConversas(e) {
    let pag = 1, itens = [], total = 0, paginas = 1;
    const m = ZZ.modal(`<h3><span class="et-ponto" style="--et-c:${corOk(e.cor)}"></span> ${ZZ.esc(e.nome)} <span class="et-sub" id="etTot"></span></h3><div id="etLc" class="et-lc">${ZZ.skeleton(4, 'et-skel')}</div><div class="acoes"><button class="btn-soft" data-f>Fechar</button></div>`);
    ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    const box = ZZ.$('#etLc', m.el);
    const desenhar = () => {
      ZZ.$('#etTot', m.el).textContent = `· ${total} ${total === 1 ? 'conversa' : 'conversas'}`;
      box.innerHTML = itens.length ? itens.map((c, i) => `<button type="button" class="et-lc-item" data-i="${i}">
        ${c.foto ? `<img class="avatar" src="${ZZ.esc(c.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="avatar">${ZZ.esc(ZZ.iniciais(c.nome))}</span>`}
        <span class="et-lc-t"><b>${ZZ.esc(c.nome)}</b><small class="mut">${c.grupo ? 'Grupo · ' : ''}marcada ${ZZ.fmtRel(c.aplicado_em)}${ZZ.fmtRel(c.aplicado_em) === 'agora' ? '' : ' atrás'}</small></span><i class="fa-solid fa-chevron-right mut"></i></button>`).join('')
        + (pag < paginas ? '<button class="btn-soft w100" data-mais style="margin-top:8px">Carregar mais</button>' : '')
        : '<div class="vazio"><i class="fa-regular fa-comments"></i>Nenhuma conversa com esta etiqueta.</div>';
      ZZ.$$('.et-lc-item', box).forEach(b => b.onclick = () => { const c = itens[Number(b.dataset.i)]; m.fechar(); ZZ.ir('conversas', { jid: c.jid }); });
      const mais = ZZ.$('[data-mais]', box); if (mais) mais.onclick = () => ZZ.busy(mais, async () => { pag++; return carrega(); });
    };
    const carrega = async () => {
      const j = await ZZ.api('listar_conversas_etiqueta', { params: { etiqueta_id: e.id, pag } });
      if (!j.ok) { if (pag > 1) pag--; else box.innerHTML = erroHtml('Não foi possível carregar as conversas.', 'r'), ZZ.$('[data-r]', box).onclick = () => { box.innerHTML = ZZ.skeleton(4, 'et-skel'); carrega(); }; return j; }
      itens = pag === 1 ? j.itens : itens.concat(j.itens); total = j.total; paginas = j.paginas; desenhar(); return j;
    };
    carrega();
  }

  async function telaEtiquetas(alvo, destaque) {
    const box = ZZ.$('#etCorpo', el); if (!box) return;
    const j = await ZZ.api('listar_etiquetas', { silencioso: true });
    if (!vivo || aba !== 'etiquetas') return;
    if (!j.ok) { box.innerHTML = erroHtml(j.msg || 'Não foi possível carregar as etiquetas.', 'r'); ZZ.$('[data-r]', box).onclick = () => { box.innerHTML = ZZ.skeleton(4); telaEtiquetas(); }; return; }
    const podeEd = ZZ.pode('etiquetas.editar'), cores = j.cores || COR_PAD, itens = j.itens;
    const totalConv = itens.reduce((a, x) => a + x.conversas, 0);
    box.innerHTML = `<div class="et-topo"><div class="mut et-resumo">${itens.length} ${itens.length === 1 ? 'etiqueta' : 'etiquetas'} · ${totalConv} ${totalConv === 1 ? 'marcação' : 'marcações'} <span class="vivo">ao vivo</span></div>${podeEd ? '<button class="btn-azul" id="etNova"><i class="fa-solid fa-plus"></i> Nova etiqueta</button>' : ''}</div>`
      + (itens.length ? `<div class="et-grade">${itens.map(x => `<div class="et-card card-soft ${x.id === destaque ? 'et-novo' : ''}" data-id="${x.id}" style="--et-c:${corOk(x.cor)}">
        <div class="et-cab">${chipHtml(x)}</div>
        <button type="button" class="et-cont-btn" data-conv ${x.conversas ? '' : 'disabled'}><b class="et-n">${x.conversas}</b><span>${x.conversas === 1 ? 'conversa' : 'conversas'}</span><i class="fa-solid fa-chevron-right"></i></button>
        ${podeEd ? '<div class="et-ac"><button class="btn-soft btn-sm" data-ed><i class="fa-solid fa-pen"></i> Editar</button><button class="btn-perigo btn-sm" data-ex><i class="fa-solid fa-trash"></i> Excluir</button></div>' : ''}</div>`).join('')}</div>`
        : `<div class="vazio card-soft"><i class="fa-solid fa-tags"></i>Nenhuma etiqueta ainda.<br>${podeEd ? 'Crie a primeira para organizar suas conversas.' : 'Peça a um administrador para criar.'}</div>`);
    const nova = ZZ.$('#etNova', box); if (nova) nova.onclick = () => abrirEditor(null, cores, id => telaEtiquetas(null, id));
    ZZ.$$('.et-card', box).forEach(c => {
      const x = itens.find(i => i.id === Number(c.dataset.id));
      ZZ.$('[data-conv]', c).onclick = () => abrirConversas(x);
      const ed = ZZ.$('[data-ed]', c), ex = ZZ.$('[data-ex]', c);
      if (ed) ed.onclick = () => abrirEditor(x, cores, id => telaEtiquetas(null, id));
      if (ex) ex.onclick = async () => {
        const msg = x.conversas ? `Excluir a etiqueta "${x.nome}"? Ela será removida de ${x.conversas} ${x.conversas === 1 ? 'conversa' : 'conversas'}.` : `Excluir a etiqueta "${x.nome}"?`;
        if (!(await ZZ.confirmar(msg, 'Excluir', true))) return;
        const r = await ZZ.api('excluir_etiqueta', { corpo: { id: x.id } });
        if (r.ok) { c.classList.add('et-sai'); ZZ.toast('Etiqueta excluída.', 'ok'); setTimeout(() => telaEtiquetas(), 250); }
      };
    });
  }

  async function telaNotas(mais) {
    const box = ZZ.$('#etCorpo', el); if (!box) return;
    if (!ZZ.pode('notas.ver')) { box.innerHTML = '<div class="vazio card-soft"><i class="fa-solid fa-lock"></i>Você não tem permissão para ver as notas.</div>'; return; }
    const j = await ZZ.api('listar_notas', { silencioso: true });
    if (!vivo || aba !== 'notas') return;
    if (!j.ok) { box.innerHTML = erroHtml(j.msg || 'Não foi possível carregar as notas.', 'r'); ZZ.$('[data-r]', box).onclick = () => { box.innerHTML = ZZ.skeleton(4); telaNotas(); }; return; }
    box.innerHTML = `<div class="et-topo"><div class="mut et-resumo">${j.total} ${j.total === 1 ? 'nota' : 'notas'} no total <span class="vivo">ao vivo</span></div></div><div class="et-aviso"><i class="fa-solid fa-lock"></i><span>Notas internas: nunca são enviadas ao cliente.</span></div>`
      + (j.itens.length ? `<div class="et-rec">${j.itens.map((n, i) => `<button type="button" class="et-rec-item card-soft" data-i="${i}"><div class="et-nhead"><b>${ZZ.esc(n.nome)}</b><span class="mut">${tempoNota(n.criado)}</span>${n.fixada ? '<span class="et-pin"><i class="fa-solid fa-thumbtack"></i></span>' : ''}</div><div class="et-rtxt">${ZZ.esc(n.texto)}</div><small class="mut"><i class="fa-regular fa-user"></i> ${ZZ.esc(n.autor)}</small></button>`).join('')}</div>`
        : '<div class="vazio card-soft"><i class="fa-regular fa-note-sticky"></i>Nenhuma nota ainda.<br>Abra uma conversa e use "Notas" para registrar observações internas.</div>');
    ZZ.$$('.et-rec-item', box).forEach(b => b.onclick = () => { const n = j.itens[Number(b.dataset.i)]; ZZ.notas.abrir(n.jid, n.nome); });
  }

  function trocar(a) {
    aba = a;
    ZZ.$$('.et-aba', el).forEach(b => b.classList.toggle('ativo', b.dataset.a === a));
    ZZ.$('#etCorpo', el).innerHTML = ZZ.skeleton(4);
    a === 'etiquetas' ? telaEtiquetas() : telaNotas();
  }

  ZZ.pagina({
    id: 'etiquetas', titulo: 'Etiquetas e notas', icone: 'fa-tags', ordem: 5.6, perm: 'etiquetas.ver',
    render(alvo, ctx) {
      el = alvo; vivo = true; aba = (ctx.params && ctx.params.aba === 'notas') ? 'notas' : 'etiquetas';
      el.innerHTML = `<div class="et-abas"><button class="et-aba" data-a="etiquetas"><i class="fa-solid fa-tags"></i> Etiquetas</button><button class="et-aba" data-a="notas"><i class="fa-solid fa-note-sticky"></i> Notas recentes</button></div><div id="etCorpo"></div>`;
      ZZ.$$('.et-aba', el).forEach(b => b.onclick = () => trocar(b.dataset.a));
      trocar(aba);
      ZZ.poll(() => { if (aba === 'etiquetas') telaEtiquetas(); else telaNotas(); }, 30000);
    },
    destroy() { vivo = false; el = null; },
  });
})();
