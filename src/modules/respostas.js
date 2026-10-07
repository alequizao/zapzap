/* ZapZap — Respostas rápidas (página + componente reutilizável).
 *
 * COMPONENTE PARA OUTRAS TELAS (Conversas/Atendimento) — disponível em window.ZZ.respostasRapidas assim que este módulo carrega:
 *
 *   ZZ.respostasRapidas.abrir(callback, {nome, numero, jid})
 *       Abre uma bottom-sheet com busca; ao tocar numa resposta chama callback(texto, resposta) já com as variáveis
 *       {nome} {numero} {saudacao} {atendente} resolvidas e conta +1 uso. `resposta` = {id, atalho, titulo, tipo, midia:null|{id,nome,mime}}.
 *       Se a resposta tiver anexo, `resposta.midia` traz o arquivo; baixe-o com ZZ.respostasRapidas.arquivo(resposta.midia.id) (Promise<Blob>).
 *       Retorna {fechar}. Exige permissão respostas.ver (sem ela mostra aviso).
 *
 *   ZZ.respostasRapidas.sugerir(prefixo)
 *       Promise<Array> das respostas cujo atalho começa com o que foi digitado depois da "/" (ex.: usuário digitou "/pre" →
 *       sugerir('pre')). Aceita também com a barra ('/pre'). Cada item: {id, atalho, titulo, texto (bruto, para prévia), tipo, escopo, usos}.
 *       Lista em cache por 30 s (invalidado ao salvar/usar). Prefixo vazio devolve as mais usadas (máx. 8).
 *
 *   ZZ.respostasRapidas.usar(id, {nome, numero, jid})
 *       Promise<{texto, tipo, midia, atalho}|null> — resolve uma resposta específica (use ao escolher uma sugestão).
 *
 *   ZZ.respostasRapidas.arquivo(id) → Promise<Blob|null> do anexo.
 */
(function () {
  const ESC = { global: ['fa-globe', 'Global', 'b-info'], instancia: ['fa-mobile-screen', 'Esta conexão', 'b-pausa'], pessoal: ['fa-user', 'Pessoal', 'b-ok'] };
  const VARS = [['{nome}', 'Nome do contato'], ['{numero}', 'Número'], ['{saudacao}', 'Bom dia/tarde/noite'], ['{atendente}', 'Seu nome']];
  const EXEMPLOS = [['Saudação', '/oi', '{saudacao}, {nome}! Aqui é {atendente}. Como posso ajudar?'], ['Horário de funcionamento', '/horario', 'Atendemos de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h.'], ['Pix', '/pix', 'Nossa chave Pix é o CNPJ 00.000.000/0001-00. Pode enviar o comprovante por aqui, {nome}.']];
  const MAX = 5 * 1024 * 1024;

  /* ---------- núcleo compartilhado ---------- */
  let cache = null, cacheTs = 0, cacheInst = '';
  const pode = () => ZZ.pode('respostas.ver');
  async function lista(forcar) {
    if (!forcar && cache && Date.now() - cacheTs < 30000 && cacheInst === ZZ.instancia) return cache;
    const j = await ZZ.api('listar_respostas', { silencioso: true });
    if (!j.ok) return cache || [];
    cache = j.itens; cacheTs = Date.now(); cacheInst = ZZ.instancia; return cache;
  }
  const invalidar = () => { cache = null; };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  async function sugerir(pref) {
    const p = norm(String(pref || '').replace(/^\//, ''));
    const l = await lista();
    const r = l.filter(x => norm(x.atalho).startsWith(p));
    return p ? r : r.slice(0, 8);
  }
  async function usar(id, ctx = {}) {
    const j = await ZZ.api('usar_resposta', { corpo: { id, contato_nome: ctx.nome || '', contato_numero: ctx.numero || '', contato_jid: ctx.jid || '' } });
    if (!j.ok) return null;
    invalidar(); return j;
  }
  async function arquivo(id) {
    try { const r = await fetch('api.php?a=ver_resposta_arquivo&id=' + encodeURIComponent(id), { headers: ZZ.cabecalhos(), credentials: 'same-origin' }); return r.ok ? await r.blob() : null; } catch (e) { return null; }
  }
  const previa = t => String(t || '').replace(/\s+/g, ' ').trim();
  const iconeArq = m => /^image\//.test(m) ? 'fa-image' : m === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-lines';

  /** Balão de prévia com variáveis de exemplo. */
  function exemplo(t) {
    const h = new Date().toLocaleString('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Maceio' }) * 1;
    const s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    return String(t || '').replace(/\{nome\}/g, 'Maria').replace(/\{numero\}/g, '+55 (82) 99999-0000').replace(/\{saudacao\}/g, s).replace(/\{atendente\}/g, (ZZ.eu && ZZ.eu.usuario && ZZ.eu.usuario.nome) || 'Atendimento');
  }
  const escMarca = t => ZZ.esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>');

  /* ---------- componente: bottom-sheet de seleção ---------- */
  function abrir(cb, ctx = {}) {
    if (!pode()) { ZZ.toast('Você não tem permissão para usar respostas rápidas.', 'err'); return { fechar() { } }; }
    const m = ZZ.modal(`<div class="rr-sheet"><div class="rr-pega"></div><h3><i class="fa-solid fa-bolt"></i> Respostas rápidas</h3>
      <input type="search" class="rr-busca" placeholder="Buscar atalho ou texto…" autocomplete="off" aria-label="Buscar resposta">
      <div class="rr-sel-lista">${ZZ.skeleton(3, 'rr-skel')}</div>
      <div class="acoes"><button class="btn-soft" data-f>Fechar</button></div></div>`);
    const box = m.el, L = ZZ.$('.rr-sel-lista', box), B = ZZ.$('.rr-busca', box);
    ZZ.$('[data-f]', box).onclick = () => m.fechar();
    let todos = [];
    const desenhar = () => {
      const q = norm(B.value.replace(/^\//, ''));
      const r = todos.filter(x => !q || norm(x.atalho).includes(q) || norm(x.titulo).includes(q) || norm(x.texto).includes(q));
      if (!todos.length) { L.innerHTML = '<div class="vazio"><i class="fa-solid fa-bolt"></i>Nenhuma resposta rápida ainda.<br><small>Crie na página "Respostas rápidas".</small></div>'; return; }
      if (!r.length) { L.innerHTML = '<div class="vazio"><i class="fa-solid fa-magnifying-glass"></i>Nada encontrado para "' + ZZ.esc(B.value) + '"</div>'; return; }
      L.innerHTML = r.map(x => `<button class="rr-sel-item" data-id="${x.id}"><span class="rr-chip">/${ZZ.esc(x.atalho)}</span><span class="rr-sel-txt"><b>${ZZ.esc(x.titulo)}</b><small>${x.tipo === 'midia' ? '<i class="fa-solid fa-paperclip"></i> ' : ''}${ZZ.esc(previa(x.texto) || x.nome_arquivo)}</small></span></button>`).join('');
    };
    lista(true).then(l => { todos = l; desenhar(); });
    B.addEventListener('input', desenhar); setTimeout(() => B.focus(), 150);
    L.addEventListener('click', async e => {
      const b = e.target.closest('.rr-sel-item'); if (!b || b.disabled) return;
      b.disabled = true; b.classList.add('rr-sel-carregando');
      const j = await usar(+b.dataset.id, ctx);
      if (!j) { b.disabled = false; b.classList.remove('rr-sel-carregando'); return; }
      ZZ.vibrar(10); m.fechar();
      try { cb && cb(j.texto, { id: +b.dataset.id, atalho: j.atalho, titulo: (todos.find(x => x.id === +b.dataset.id) || {}).titulo || '', tipo: j.tipo, midia: j.midia }); } catch (er) { console.error(er); }
    });
    return m;
  }
  ZZ.respostasRapidas = { abrir, sugerir, usar, arquivo };

  /* ---------- página ---------- */
  let S = null;

  function card(x, novo) {
    const e = ESC[x.escopo] || ESC.global;
    return `<article class="rr-card${novo ? ' rr-novo' : ''}" data-id="${x.id}">
      <div class="rr-topo"><span class="rr-chip">/${ZZ.esc(x.atalho)}</span><span class="badge-status ${e[2]}"><i class="fa-solid ${e[0]}"></i> ${e[1]}</span><span class="rr-usos" title="Vezes usada"><i class="fa-solid fa-bolt"></i> <span class="rr-n">${x.usos}</span></span></div>
      <div class="rr-tit">${ZZ.esc(x.titulo)}</div>
      <div class="rr-prev">${x.texto ? ZZ.esc(previa(x.texto)) : '<span class="mut">(só anexo)</span>'}</div>
      ${x.tipo === 'midia' ? `<div class="rr-anexo"><i class="fa-solid ${iconeArq(x.mime)}"></i> ${ZZ.esc(x.nome_arquivo)}</div>` : ''}
      <div class="rr-acoes"><button class="btn-soft btn-sm" data-copiar="${x.id}"><i class="fa-regular fa-copy"></i> Copiar</button>
      ${x.editavel ? `<button class="btn-soft btn-sm" data-editar="${x.id}"><i class="fa-solid fa-pen"></i> Editar</button><button class="btn-perigo btn-sm" data-excluir="${x.id}" aria-label="Excluir"><i class="fa-solid fa-trash"></i></button>` : ''}</div>
    </article>`;
  }

  function vazio() {
    return `<div class="rr-vazio"><div class="vazio"><i class="fa-solid fa-bolt"></i>Nenhuma resposta rápida por aqui.<br><small>Atalhos para mensagens que você repete todo dia. Comece com um exemplo:</small></div>
      <div class="rr-ex">${EXEMPLOS.map((x, i) => `<button class="rr-ex-item" data-ex="${i}"><span class="rr-chip">${ZZ.esc(x[1])}</span><span><b>${ZZ.esc(x[0])}</b><small>${ZZ.esc(x[2])}</small></span><i class="fa-solid fa-plus"></i></button>`).join('')}</div></div>`;
  }

  function desenhar(novoId) {
    const q = norm(S.q.replace(/^\//, ''));
    const r = S.itens.filter(x => (!S.escopo || x.escopo === S.escopo) && (!q || norm(x.atalho).includes(q) || norm(x.titulo).includes(q) || norm(x.texto).includes(q)));
    const cont = ZZ.$('.rr-grade', S.el);
    if (!S.itens.length) { cont.innerHTML = vazio(); return; }
    if (!r.length) { cont.innerHTML = '<div class="vazio"><i class="fa-solid fa-magnifying-glass"></i>Nenhuma resposta encontrada.</div>'; return; }
    cont.innerHTML = r.map(x => card(x, x.id === novoId)).join('');
    ZZ.$('.rr-cont', S.el).textContent = r.length + (r.length === 1 ? ' resposta' : ' respostas');
  }

  async function carregar(novoId) {
    const j = await ZZ.api('listar_respostas', { silencioso: true });
    if (!S) return;
    if (!j.ok) {
      ZZ.$('.rr-grade', S.el).innerHTML = `<div class="card-soft rr-erro"><i class="fa-solid fa-triangle-exclamation"></i> ${ZZ.esc(j.msg || 'Não foi possível carregar.')}<br><button class="btn-azul" data-retry style="margin-top:10px"><i class="fa-solid fa-rotate"></i> Tentar de novo</button></div>`;
      return;
    }
    S.itens = j.itens; cache = j.itens; cacheTs = Date.now(); cacheInst = ZZ.instancia; desenhar(novoId);
  }

  function editor(x, pre) {
    x = x || pre || {};
    const novo = !x.id;
    const podeGlobal = ZZ.pode('respostas.editar');
    const escopos = (podeGlobal ? [['pessoal', 'Pessoal (só eu)'], ['instancia', 'Esta conexão'], ['global', 'Global (todas)']] : [['pessoal', 'Pessoal (só eu)']]);
    let arquivoNovo = null, removerArq = false;
    const m = ZZ.modal(`<div class="rr-sheet"><div class="rr-pega"></div><h3><i class="fa-solid fa-bolt"></i> ${novo ? 'Nova resposta rápida' : 'Editar resposta'}</h3>
      <label>Atalho</label>
      <div class="rr-atalho-campo"><span>/</span><input type="text" data-atalho maxlength="30" placeholder="preco" autocapitalize="none" autocomplete="off" value="${ZZ.esc(x.atalho || '')}"></div>
      <div class="msg-campo" data-m-atalho hidden></div>
      <label>Título</label><input type="text" data-titulo maxlength="80" placeholder="Ex.: Tabela de preços" value="${ZZ.esc(x.titulo || '')}">
      <label>Texto</label>
      <div class="rr-vars">${VARS.map(v => `<button type="button" class="rr-var" data-v="${v[0]}" title="${ZZ.esc(v[1])}">${v[0]}</button>`).join('')}</div>
      <textarea data-texto rows="5" maxlength="4000" placeholder="Escreva a mensagem…">${ZZ.esc(x.texto || '')}</textarea>
      <div class="msg-campo" data-m-texto hidden></div>
      <label>Anexo (opcional)</label>
      <div class="rr-arq"><div class="rr-arq-info" data-arq>${x.nome_arquivo ? `<i class="fa-solid ${iconeArq(x.mime)}"></i> ${ZZ.esc(x.nome_arquivo)}` : '<span class="mut">Nenhum arquivo</span>'}</div>
        <button type="button" class="btn-soft btn-sm" data-esc><i class="fa-solid fa-paperclip"></i> Escolher</button><button type="button" class="btn-soft btn-sm" data-rem hidden><i class="fa-solid fa-xmark"></i></button>
        <input type="file" data-arqin hidden accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt"></div>
      <small class="mut">Imagem ou documento, até 5 MB.</small>
      <label>Quem pode usar</label>
      <select data-escopo ${novo || podeGlobal ? '' : 'disabled'}>${escopos.map(e => `<option value="${e[0]}"${(x.escopo || 'pessoal') === e[0] ? ' selected' : ''}>${e[1]}</option>`).join('')}</select>
      <label>Prévia</label>
      <div class="rr-bal-fundo"><div class="rr-bal"><div class="rr-bal-img" data-pimg hidden><i class="fa-solid fa-image"></i></div><div data-prev></div><time>${ZZ.fmtHora(Math.floor(Date.now() / 1000))} <i class="fa-solid fa-check-double"></i></time></div></div>
      <div class="barra-prog" data-prog hidden><i></i></div>
      <div class="acoes"><button class="btn-soft" data-c>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-floppy-disk"></i> Salvar</button></div></div>`);
    const E = m.el, $ = s => ZZ.$(s, E);
    const T = $('[data-texto]'), A = $('[data-atalho]');
    const atualizarPrev = () => {
      const t = T.value.trim();
      $('[data-prev]').innerHTML = t ? escMarca(exemplo(t)) : '<span class="mut">A mensagem aparece aqui…</span>';
      $('[data-pimg]').hidden = !(arquivoNovo || (x.nome_arquivo && !removerArq));
    };
    const arqUi = () => {
      const nome = arquivoNovo ? arquivoNovo.name : (!removerArq && x.nome_arquivo) || '';
      $('[data-arq]').innerHTML = nome ? `<i class="fa-solid fa-paperclip"></i> ${ZZ.esc(nome)}` : '<span class="mut">Nenhum arquivo</span>';
      $('[data-rem]').hidden = !nome; atualizarPrev();
    };
    T.addEventListener('input', atualizarPrev); arqUi();
    A.addEventListener('input', () => { A.value = A.value.replace(/^\/+/, '').replace(/[^\p{L}\p{N}_-]/gu, '').toLowerCase(); A.classList.remove('erro-campo'); $('[data-m-atalho]').hidden = true; });
    ZZ.$$('.rr-var', E).forEach(b => b.onclick = () => {
      const i = T.selectionStart ?? T.value.length, f = T.selectionEnd ?? i;
      T.value = T.value.slice(0, i) + b.dataset.v + T.value.slice(f); T.focus(); T.selectionStart = T.selectionEnd = i + b.dataset.v.length; atualizarPrev(); ZZ.vibrar(8);
    });
    $('[data-esc]').onclick = () => $('[data-arqin]').click();
    $('[data-arqin]').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > MAX) { ZZ.toast('Arquivo grande demais (máximo 5 MB).', 'err'); e.target.value = ''; return; }
      arquivoNovo = f; removerArq = false; arqUi();
    };
    $('[data-rem]').onclick = () => { arquivoNovo = null; removerArq = true; $('[data-arqin]').value = ''; arqUi(); };
    $('[data-c]').onclick = () => m.fechar();
    const erroCampo = (el, msgEl, msg) => { el.classList.add('erro-campo', 'erro-flash'); msgEl.textContent = msg; msgEl.hidden = false; el.focus(); setTimeout(() => el.classList.remove('erro-flash'), 600); };
    $('[data-s]').onclick = ev => ZZ.busy(ev.currentTarget, async () => {
      const atalho = A.value.trim(), texto = T.value.trim();
      if (!atalho) { erroCampo(A, $('[data-m-atalho]'), 'Informe o atalho.'); return false; }
      if (!texto && !arquivoNovo && (removerArq || !x.nome_arquivo)) { erroCampo(T, $('[data-m-texto]'), 'Escreva o texto ou anexe um arquivo.'); return false; }
      const fd = new FormData();
      if (x.id) fd.append('id', x.id);
      fd.append('atalho', atalho); fd.append('titulo', $('[data-titulo]').value.trim()); fd.append('texto', texto); fd.append('escopo', $('[data-escopo]').value);
      if (arquivoNovo) fd.append('arquivo', arquivoNovo); if (removerArq) fd.append('remover_arquivo', '1');
      const p = $('[data-prog]'); if (arquivoNovo) { p.hidden = false; p.firstChild.style.width = '60%'; }
      const j = await ZZ.api('salvar_resposta', { corpo: fd, silencioso: true });
      p.hidden = true;
      if (!j.ok) {
        ZZ.toast(j.msg || 'Não foi possível salvar.', 'err');
        if (j.campo === 'atalho') erroCampo(A, $('[data-m-atalho]'), j.msg); else if (j.campo === 'texto') erroCampo(T, $('[data-m-texto]'), j.msg);
        return false;
      }
      ZZ.toast(novo ? 'Resposta criada: /' + atalho : 'Resposta salva', 'ok');
      setTimeout(() => m.fechar(), 250); invalidar();
      if (S) carregar(j.id); return true;
    });
    setTimeout(() => (novo && !pre ? A : T).focus(), 200);
  }

  async function copiar(x) {
    const j = await ZZ.api('usar_resposta', { corpo: { id: x.id, contato_nome: '' } });
    if (!j.ok) return;
    try { await navigator.clipboard.writeText(j.texto); ZZ.toast('Texto copiado', 'ok'); } catch (e) { ZZ.toast('Não foi possível copiar', 'err'); }
    x.usos++; const c = ZZ.$(`.rr-card[data-id="${x.id}"] .rr-n`, S.el); if (c) c.textContent = x.usos;
  }

  ZZ.pagina({
    id: 'respostas', titulo: 'Respostas rápidas', icone: 'fa-bolt', ordem: 5.5, perm: 'respostas.ver',
    render(el) {
      S = { el, itens: [], q: '', escopo: '' };
      el.innerHTML = `<div class="rr-barra"><input type="search" class="rr-q" placeholder="Buscar respostas…" aria-label="Buscar respostas"><button class="btn-azul rr-nova"><i class="fa-solid fa-plus"></i> Nova</button></div>
        <div class="rr-filtros">${[['', 'Todas'], ['pessoal', 'Pessoais'], ['instancia', 'Conexão'], ['global', 'Globais']].map(f => `<button class="rr-f${f[0] === '' ? ' ativo' : ''}" data-e="${f[0]}">${f[1]}</button>`).join('')}<span class="rr-cont mut"></span></div>
        <div class="rr-grade">${ZZ.skeleton(4, 'rr-skel')}</div>`;
      ZZ.$('.rr-q', el).addEventListener('input', ZZ.debounce(e => { S.q = e.target.value; desenhar(); }, 150));
      ZZ.$('.rr-nova', el).onclick = () => editor();
      el.addEventListener('click', async e => {
        const f = e.target.closest('.rr-f'); if (f) { S.escopo = f.dataset.e; ZZ.$$('.rr-f', el).forEach(b => b.classList.toggle('ativo', b === f)); desenhar(); return; }
        if (e.target.closest('[data-retry]')) { ZZ.$('.rr-grade', el).innerHTML = ZZ.skeleton(4, 'rr-skel'); carregar(); return; }
        const ex = e.target.closest('[data-ex]'); if (ex) { const d = EXEMPLOS[+ex.dataset.ex]; editor(null, { atalho: d[1].slice(1), titulo: d[0], texto: d[2], escopo: 'pessoal' }); return; }
        const ed = e.target.closest('[data-editar]'); if (ed) { editor(S.itens.find(x => x.id === +ed.dataset.editar)); return; }
        const cp = e.target.closest('[data-copiar]'); if (cp) { ZZ.busy(cp, async () => { await copiar(S.itens.find(x => x.id === +cp.dataset.copiar)); return true; }); return; }
        const ex2 = e.target.closest('[data-excluir]');
        if (ex2) {
          const x = S.itens.find(i => i.id === +ex2.dataset.excluir);
          if (!await ZZ.confirmar('Excluir a resposta /' + x.atalho + '?', 'Excluir', true)) return;
          ZZ.busy(ex2, async () => {
            const j = await ZZ.api('excluir_resposta', { corpo: { id: x.id } });
            if (j.ok) { ZZ.toast('Resposta excluída', 'ok'); invalidar(); const c = ZZ.$(`.rr-card[data-id="${x.id}"]`, el); if (c) c.classList.add('rr-sai'); setTimeout(() => carregar(), 250); }
            return j;
          });
        }
      });
      carregar();
    },
    destroy() { S = null; }
  });
})();
