/* ZapZap — módulo Usuários (somente master): lista, criar/editar, permissões, atividade, sessões. Classes us-. */
(function () {
  'use strict';
  const ZZ = window.ZZ, esc = ZZ.esc, $ = ZZ.$;
  let raiz = null, ctxId = null, vivoLista = null, overlays = [], dadosLista = [], catalogoCache = null;
  const bool = v => v === true || v === 1 || v === '1';
  const num = v => Array.isArray(v) ? v.length : (parseInt(v, 10) || 0);
  const euId = () => String((ZZ.eu && ZZ.eu.usuario && (ZZ.eu.usuario.id ?? '')) ?? '');
  const ehEu = u => !!ZZ.eu && ((u.id != null && String(u.id) === euId() && euId() !== '') || (u.usuario && u.usuario === ZZ.eu.usuario.usuario));
  const ts = v => { if (!v) return 0; if (typeof v === 'number' || /^\d+$/.test(String(v))) return +v; const d = Date.parse(String(v).replace(' ', 'T')); return d ? Math.floor(d / 1000) : 0; };
  const relativo = t => { t = ts(t); return t ? (ZZ.fmtRel(t) === 'agora' ? 'agora' : 'há ' + ZZ.fmtRel(t)) : 'nunca acessou'; };

  const normU = u => ({
    id: u.id, nome: u.nome || '', usuario: u.usuario || '', master: bool(u.master), trocar: bool(u.trocar_senha),
    ativo: u.ativo === undefined ? true : bool(u.ativo),
    ultimo: ts(u.ultimo_acesso ?? u.ultimo_login ?? u.ultimo ?? u.ultimo_acesso_ts),
    nperms: num(u.qtd_permissoes ?? u.n_perms ?? u.nperms ?? u.perms_n ?? u.total_permissoes ?? u.permissoes ?? u.perms),
    sessoes: num(u.sessoes_ativas ?? u.sessoes ?? u.n_sessoes),
    perms: Array.isArray(u.perms) ? u.perms : (Array.isArray(u.permissoes) ? u.permissoes : []),
    instancias: u.instancias, todas: u.todas_instancias ?? u.todas
  });
  const comDetalhe = j => { const u = normU(j.usuario || j.item || {}); u.perms = j.permissoes || u.perms || []; u.instancias = j.instancias || []; return u; };
  const todasConexoes = u => u.todas === true || u.instancias == null || u.instancias === '*' || (Array.isArray(u.instancias) && (u.instancias.includes('*')));

  /* ---------- catálogo ---------- */
  async function catalogo() {
    if (catalogoCache) return catalogoCache;
    const j = await ZZ.api('ver_catalogo_permissoes');
    if (!j.ok) return null;
    let c = j.catalogo || j.permissoes || j.grupos || {}, grupos = [];
    if (Array.isArray(c)) {
      grupos = c.map(g => ({ grupo: g.grupo || g.nome, itens: (g.itens || g.permissoes || []).map(i => ({ k: i.chave || i.k, r: i.rotulo || i.r || i.chave })) }));
    } else {
      const m = {};
      Object.keys(c).forEach(k => { const v = c[k]; const g = Array.isArray(v) ? v[0] : (v.grupo || 'Outros'), r = Array.isArray(v) ? v[1] : (v.rotulo || k); (m[g] = m[g] || []).push({ k, r }); });
      grupos = Object.keys(m).map(g => ({ grupo: g, itens: m[g] }));
    }
    grupos = grupos.map(g => ({ grupo: g.grupo, itens: g.itens.filter(i => i.k && !/^usuarios\./.test(i.k)) })).filter(g => g.itens.length);
    catalogoCache = grupos; return grupos;
  }

  /* ---------- helpers de UI ---------- */
  const erroCartao = (fn, msg) => { const d = document.createElement('div'); d.className = 'card-soft vazio'; d.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>${esc(msg || 'Não foi possível carregar.')}<br><button class="btn-azul" style="margin-top:12px">Tentar de novo</button>`; d.querySelector('button').onclick = fn; return d; };
  const copiar = async (txt, ok) => {
    try { await navigator.clipboard.writeText(txt); } catch (e) { const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (x) { } t.remove(); }
    ZZ.vibrar(10); ZZ.toast(ok || 'Copiado', 'ok'); return true;
  };
  const seloTroca = u => u.trocar ? '<span class="badge-status b-pend"><i class="fa-solid fa-key"></i> Troca de senha pendente</span>' : '';
  const seloU = u => u.master ? '<span class="badge-status b-pausa"><i class="fa-solid fa-crown"></i> Master</span>' : (u.ativo ? '<span class="badge-status b-ok">Ativo</span>' : '<span class="badge-status b-err">Desativado</span>');
  const avatar = (u, g) => `<span class="avatar us-av ${g ? 'us-av-g' : ''} ${u.ativo ? '' : 'us-off'} ${u.master ? 'us-av-m' : ''}">${esc(ZZ.iniciais(u.nome || u.usuario))}</span>`;
  function sucessoAnim(txt) {
    const d = document.createElement('div'); d.className = 'us-sucesso'; d.innerHTML = `<div><i class="fa-solid fa-circle-check"></i><b>${esc(txt)}</b></div>`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 1100);
  }
  function abrirOverlay(html, aoFechar) {
    const ov = document.createElement('div'); ov.className = 'us-sheet'; ov.innerHTML = `<div class="us-sheet-in">${html}</div>`;
    document.body.appendChild(ov); document.body.classList.add('us-trava'); ZZ.modalAberto = (ZZ.modalAberto || 0) + 1;
    requestAnimationFrame(() => ov.classList.add('on'));
    let fechado = false;
    const fechar = () => { if (fechado) return; fechado = true; ov.classList.remove('on'); ZZ.modalAberto = Math.max(0, (ZZ.modalAberto || 1) - 1); overlays = overlays.filter(x => x !== o); if (!overlays.length) document.body.classList.remove('us-trava'); setTimeout(() => ov.remove(), 220); aoFechar && aoFechar(); };
    const o = { el: ov, fechar }; overlays.push(o); return o;
  }
  const forca = s => { let p = 0; if (s.length >= 6) p++; if (s.length >= 10) p++; if (/[a-z]/.test(s) && /[A-Z]/.test(s)) p++; if (/\d/.test(s)) p++; if (/[^A-Za-z0-9]/.test(s)) p++; return s ? Math.min(4, Math.max(1, p - (s.length < 6 ? 1 : 0))) : 0; };
  const FORCA = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
  const campoSenha = (id, ph) => `<div class="pw"><input type="password" id="${id}" placeholder="${esc(ph || '')}" autocomplete="new-password"><button type="button" class="us-olho" data-olho="${id}" aria-label="Mostrar senha"><i class="fa-solid fa-eye"></i></button></div><div class="us-forca" data-forca-de="${id}"><i></i><i></i><i></i><i></i><span></span></div>`;
  function ligarSenha(el, id) {
    const inp = $('#' + id, el), f = $(`[data-forca-de="${id}"]`, el);
    $(`[data-olho="${id}"]`, el).onclick = e => { inp.type = inp.type === 'password' ? 'text' : 'password'; e.currentTarget.innerHTML = `<i class="fa-solid ${inp.type === 'password' ? 'fa-eye' : 'fa-eye-slash'}"></i>`; };
    inp.addEventListener('input', () => { const n = forca(inp.value); f.dataset.n = n; $('span', f).textContent = n ? FORCA[n] : ''; });
  }
  function invalido(inp, msg) {
    inp.classList.add('erro-campo'); let m = inp.parentNode.querySelector('.msg-campo'); if (!m) { m = document.createElement('div'); m.className = 'msg-campo'; inp.parentNode.appendChild(m); }
    m.textContent = msg; inp.focus(); inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
    inp.addEventListener('input', () => { inp.classList.remove('erro-campo'); m.remove(); }, { once: true });
  }

  /* =====================================================================
     LISTA
  ===================================================================== */
  async function telaLista(el) {
    ctxId = null;
    el.innerHTML = `<div class="us-topo"><div class="us-busca"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="usQ" placeholder="Buscar por nome ou usuário" autocomplete="off"></div><button class="btn-azul" id="usNovo"><i class="fa-solid fa-plus"></i> Novo usuário</button></div>
    <div class="us-sub"><span class="mut" id="usCont"></span><span class="vivo">ao vivo</span></div><div id="usLista">${ZZ.skeleton(4, 'skel-linha us-skel')}</div>`;
    $('#usNovo', el).onclick = () => abrirEditor(null);
    let q = '';
    $('#usQ', el).addEventListener('input', ZZ.debounce(e => { q = e.target.value.trim().toLowerCase(); pintar(); }, 150));
    let anterior = {}, primeira = true, assinatura = '';
    const pintar = () => {
      const box = $('#usLista', el); if (!box) return;
      const itens = dadosLista.filter(u => !q || (u.nome + ' ' + u.usuario).toLowerCase().includes(q));
      $('#usCont', el).textContent = dadosLista.length + (dadosLista.length === 1 ? ' usuário' : ' usuários');
      if (!itens.length) { box.innerHTML = `<div class="vazio card-soft"><i class="fa-solid fa-user-slash"></i>${q ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}</div>`; return; }
      box.innerHTML = itens.map(u => `<button class="us-card ${u.ativo ? '' : 'us-card-off'} ${u._novo ? 'us-novo' : ''}" data-id="${esc(u.id)}">
        ${avatar(u)}<span class="us-info"><b>${esc(u.nome || u.usuario)}</b><small class="us-login">Login: <b>@${esc(u.usuario)}</b> <span class="us-cp" role="button" tabindex="0" data-cp="${esc(u.usuario)}" aria-label="Copiar login"><i class="fa-regular fa-copy"></i></span></small>${u.trocar ? '<span>' + seloTroca(u) + '</span>' : ''}
        <span class="us-meta"><span><i class="fa-regular fa-clock"></i> ${esc(relativo(u.ultimo))}</span><span><i class="fa-solid fa-key"></i> ${u.master ? 'todas' : u.nperms} perm.</span><span class="${u.sessoes ? 'us-ok' : ''}"><i class="fa-solid fa-mobile-screen"></i> ${u.sessoes} ${u.sessoes === 1 ? 'sessão' : 'sessões'}</span></span></span>
        <span class="us-lado">${seloU(u)}<i class="fa-solid fa-chevron-right"></i></span></button>`).join('');
      $$cards(box);
      ZZ.$$('[data-cp]', box).forEach(b => b.onclick = e => { e.stopPropagation(); copiar(b.dataset.cp, 'Login copiado'); });
    };
    const $$cards = box => ZZ.$$('.us-card', box).forEach(b => b.onclick = () => ZZ.ir('usuarios', { id: b.dataset.id }));
    const carregar = async (silencioso) => {
      const j = await ZZ.api('listar_usuarios', { silencioso });
      const box = $('#usLista', el); if (!box) return;
      if (!j.ok) { if (!silencioso || primeira) { box.innerHTML = ''; box.appendChild(erroCartao(() => { box.innerHTML = ZZ.skeleton(4, 'skel-linha us-skel'); carregar(false); }, j.msg)); } return; }
      const nova = (j.itens || j.usuarios || []).map(normU);
      const sig = JSON.stringify(nova); if (sig === assinatura && !primeira) return; assinatura = sig;
      nova.forEach(u => { const a = anterior[u.id]; u._novo = !primeira && (!a || a !== JSON.stringify(u)); });
      anterior = {}; nova.forEach(u => anterior[u.id] = JSON.stringify({ ...u, _novo: undefined }));
      dadosLista = nova; primeira = false; pintar();
    };
    vivoLista = ZZ.poll(() => carregar(true), 15000);
    carregar(false);
    ZZ.usuariosRecarregar = () => carregar(true);
  }

  /* =====================================================================
     EDITOR (tela cheia)
  ===================================================================== */
  const PERFIS = [
    { n: 'Atendente', i: 'fa-headset', d: 'Conversas, respostas e filas', f: ks => ks.filter(k => /^(painel\.ver|conversas\.(ver|enviar|midia|marcar_lida)|enviar\.(texto|midia|verificar)|contatos\.ver|respostas\.ver|filas\.(ver|atender|transferir)|etiquetas\.(ver|editar)|notas\.(ver|editar))$/.test(k)) },
    { n: 'Somente leitura', i: 'fa-eye', d: 'Só visualiza', f: ks => ks.filter(k => /\.ver$/.test(k) && !/^(api|auditoria|config|conexoes)\./.test(k)) },
    { n: 'Gerente', i: 'fa-user-tie', d: 'Quase tudo, sem conexões e API', f: ks => ks.filter(k => !/^(conexoes\.(excluir|desconectar|criar)|api\.|config\.reiniciar)/.test(k)) }
  ];

  async function abrirEditor(id, aposSalvar) {
    const ov0 = abrirOverlay(`<div class="us-sheet-top"><button class="us-x" data-x aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button><h3>${id ? 'Editar usuário' : 'Novo usuário'}</h3></div><div class="us-sheet-corpo">${ZZ.skeleton(5, 'skel-linha us-skel')}</div>`);
    $('[data-x]', ov0.el).onclick = ov0.fechar;
    const [cat, det] = await Promise.all([catalogo(), id ? ZZ.api('ver_usuario', { params: { id } }) : Promise.resolve({ ok: true, usuario: { ativo: true, perms: [], instancias: ['*'] } })]);
    if (!cat || !det.ok) { const c = $('.us-sheet-corpo', ov0.el); c.innerHTML = ''; c.appendChild(erroCartao(() => { ov0.fechar(); abrirEditor(id, aposSalvar); }, det.msg || 'Não foi possível carregar o editor.')); return; }
    const u = comDetalhe(det);
    const raw = { todas: u.todas, instancias: u.instancias };
    const instList = (ZZ.instancias || []).map(i => ({ nome: i.nome, rot: i.apelido || i.nome, num: i.numero }));
    const sel = new Set(u.perms), master = u.master;
    const eu = !!id && ehEu(u);
    const st = { nome: u.nome, usuario: u.usuario, ativo: u.ativo, todas: id ? todasConexoes(raw) : true, inst: new Set(Array.isArray(raw.instancias) ? raw.instancias.filter(x => x !== '*') : []) };
    const snap = () => JSON.stringify([st.nome, st.usuario, st.ativo, st.todas, [...st.inst].sort(), [...sel].sort(), st.troca, $('#usSenha', ov0.el) ? $('#usSenha', ov0.el).value : '']);
    const todasChaves = cat.flatMap(g => g.itens.map(i => i.k));

    const corpo = `
    <form id="usForm" autocomplete="off" novalidate>
    <section class="us-sec"><h4><i class="fa-solid fa-id-card"></i> Dados</h4>
      <label for="usNome">Nome (aparece nas mensagens enviadas)</label><input type="text" id="usNome" maxlength="60" value="${esc(u.nome)}" autocomplete="off">
      <label for="usUser">Usuário (login)</label><input type="text" id="usUser" maxlength="30" value="${esc(u.usuario)}" autocapitalize="none" autocorrect="off" autocomplete="off" ${id && master ? 'readonly' : ''}>
      <label for="usSenha">${id ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</label>${campoSenha('usSenha', id ? 'Sem alterar' : 'Mínimo 6 caracteres')}
    </section>
    ${master ? `<section class="us-sec"><div class="us-aviso"><i class="fa-solid fa-crown"></i> Este usuário é <b>master</b>: tem acesso total a tudo e a todas as conexões. Não há permissões para ajustar.</div></section>` : `
    <section class="us-sec"><h4><i class="fa-solid fa-key"></i> Permissões <span class="us-cont" id="usCnt"></span></h4>
      <div class="us-perfis" id="usPerfis">${PERFIS.map((p, i) => `<button type="button" class="us-perfil" data-p="${i}"><i class="fa-solid ${p.i}"></i><b>${p.n}</b><small>${p.d}</small></button>`).join('')}</div>
      <div class="us-linha-acoes"><button type="button" class="btn-soft btn-sm" id="usTudo"><i class="fa-solid fa-check-double"></i> Marcar tudo</button><button type="button" class="btn-soft btn-sm" id="usNada"><i class="fa-solid fa-eraser"></i> Limpar</button></div>
      <div id="usGrupos">${cat.map((g, gi) => `<div class="us-grupo" data-g="${gi}"><div class="us-grupo-h"><b>${esc(g.grupo)}</b><span class="us-grupo-n"></span><button type="button" class="us-mini" data-gt="${gi}">Marcar tudo</button><button type="button" class="us-mini" data-gl="${gi}">Limpar</button></div>${g.itens.map(i => `<label class="us-perm"><span class="us-perm-t">${esc(i.r)}</span><input type="checkbox" class="us-sw" data-k="${esc(i.k)}" ${sel.has(i.k) ? 'checked' : ''}><i class="us-sw-v"></i></label>`).join('')}</div>`).join('')}</div>
    </section>
    <section class="us-sec"><h4><i class="fa-brands fa-whatsapp"></i> Conexões liberadas</h4>
      <label class="us-perm us-perm-todas"><span class="us-perm-t"><b>Todas as conexões</b><small>Inclusive as que forem criadas depois</small></span><input type="checkbox" class="us-sw" id="usTodas" ${st.todas ? 'checked' : ''}><i class="us-sw-v"></i></label>
      <div id="usInst" ${st.todas ? 'hidden' : ''}>${instList.length ? instList.map(i => `<label class="us-perm"><span class="us-perm-t">${esc(i.rot)}<small>${i.num ? esc(ZZ.fmtNumero(i.num)) : esc(i.nome)}</small></span><input type="checkbox" class="us-sw" data-i="${esc(i.nome)}" ${st.inst.has(i.nome) ? 'checked' : ''}><i class="us-sw-v"></i></label>`).join('') : '<div class="vazio">Nenhuma conexão cadastrada.</div>'}</div>
    </section>`}
    ${!eu ? `<section class="us-sec"><label class="us-perm"><span class="us-perm-t"><b>Exigir troca de senha</b><small>Exigir que a pessoa troque a senha no primeiro acesso</small></span><input type="checkbox" class="us-sw" id="usTroca"><i class="us-sw-v"></i></label></section>` : ''}
    ${id && !eu ? `<section class="us-sec"><label class="us-perm"><span class="us-perm-t"><b>Usuário ativo</b><small>Desativado não consegue entrar</small></span><input type="checkbox" class="us-sw" id="usAtivo" ${st.ativo ? 'checked' : ''}><i class="us-sw-v"></i></label></section>` : ''}
    </form>`;
    $('.us-sheet-corpo', ov0.el).innerHTML = corpo;
    const rod = document.createElement('div'); rod.className = 'us-sheet-rod'; rod.innerHTML = `<span class="us-dirty" id="usDirty">Sem alterações</span><button class="btn-soft" data-x>Cancelar</button><button class="btn-azul" id="usSalvar" disabled><i class="fa-solid fa-floppy-disk"></i> Salvar</button>`;
    ov0.el.firstChild.appendChild(rod);
    ZZ.$$('[data-x]', ov0.el).forEach(b => b.onclick = async () => { if ($('#usSalvar', ov0.el).disabled || await ZZ.confirmar('Descartar as alterações feitas?', 'Descartar', true)) ov0.fechar(); });
    ligarSenha(ov0.el, 'usSenha');
    const base = snap();
    const atualizar = () => {
      const n = sel.size; const c = $('#usCnt', ov0.el); if (c) { c.textContent = n + (n === 1 ? ' permissão liberada' : ' permissões liberadas'); c.classList.remove('us-pulso'); void c.offsetWidth; c.classList.add('us-pulso'); }
      ZZ.$$('.us-grupo', ov0.el).forEach(g => { const ks = cat[g.dataset.g].itens; const a = ks.filter(i => sel.has(i.k)).length; $('.us-grupo-n', g).textContent = a + '/' + ks.length; g.classList.toggle('us-grupo-on', a > 0); });
      const sujo = snap() !== base; $('#usSalvar', ov0.el).disabled = !sujo; const d = $('#usDirty', ov0.el); d.textContent = sujo ? 'Alterações não salvas' : 'Sem alterações'; d.classList.toggle('on', sujo);
    };
    const marcar = ks => { ZZ.$$('[data-k]', ov0.el).forEach(c => { c.checked = ks.includes(c.dataset.k); }); sel.clear(); ks.forEach(k => sel.add(k)); atualizar(); };
    ov0.el.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k) { t.checked ? sel.add(t.dataset.k) : sel.delete(t.dataset.k); }
      else if (t.dataset.i) { t.checked ? st.inst.add(t.dataset.i) : st.inst.delete(t.dataset.i); }
      else if (t.id === 'usTodas') { st.todas = t.checked; $('#usInst', ov0.el).hidden = t.checked; }
      else if (t.id === 'usAtivo') st.ativo = t.checked; else if (t.id === 'usTroca') st.troca = t.checked;
      else if (t.id === 'usNome') st.nome = t.value; else if (t.id === 'usUser') st.usuario = t.value;
      atualizar();
    });
    if (!master) {
      $('#usTudo', ov0.el).onclick = () => { marcar(todasChaves); ZZ.vibrar(8); };
      $('#usNada', ov0.el).onclick = () => { marcar([]); ZZ.vibrar(8); };
      ZZ.$$('[data-gt]', ov0.el).forEach(b => b.onclick = () => { cat[b.dataset.gt].itens.forEach(i => sel.add(i.k)); marcar([...sel]); });
      ZZ.$$('[data-gl]', ov0.el).forEach(b => b.onclick = () => { cat[b.dataset.gl].itens.forEach(i => sel.delete(i.k)); marcar([...sel]); });
      ZZ.$$('.us-perfil', ov0.el).forEach(b => b.onclick = () => { const p = PERFIS[b.dataset.p]; marcar(p.f(todasChaves)); ZZ.toast(`Perfil "${p.n}" aplicado: ${sel.size} permissões`, 'ok'); });
    }
    atualizar();
    $('#usForm', ov0.el).onsubmit = e => e.preventDefault();
    $('#usSalvar', ov0.el).onclick = async ev => {
      const nome = $('#usNome', ov0.el), user = $('#usUser', ov0.el), senha = $('#usSenha', ov0.el);
      if (nome.value.trim().length < 2) return invalido(nome, 'Informe o nome (mín. 2 letras).');
      if (!/^[a-z0-9._-]{3,30}$/i.test(user.value.trim())) return invalido(user, 'Usuário: 3 a 30 letras, números, ponto, traço ou _.');
      if ((!id || senha.value) && senha.value.length < 6) return invalido(senha, 'A senha precisa ter pelo menos 6 caracteres.');
      if (!master && !st.todas && !st.inst.size) { ZZ.toast('Escolha ao menos uma conexão (ou marque "Todas").', 'err'); return; }
      const corpo = { id: id || undefined, nome: nome.value.trim(), usuario: user.value.trim().toLowerCase(), ativo: id && !eu ? st.ativo : true };
      if (senha.value) { corpo.senha = senha.value; if (st.troca) corpo.exigir_troca = true; }
      if (!master) { corpo.perms = [...sel]; corpo.permissoes = [...sel]; corpo.todas_instancias = st.todas; corpo.instancias = st.todas ? [] : [...st.inst]; }
      const r = await ZZ.busy(ev.currentTarget, () => ZZ.api('salvar_usuario', { corpo }));
      if (r && !r.ok && r.campo) { const alvo = { nome, usuario: user, senha }[r.campo]; if (alvo) invalido(alvo, r.msg); }
      if (r && r.ok) {
        sucessoAnim(id ? 'Usuário atualizado' : 'Usuário criado'); ZZ.toast(id ? 'Alterações salvas' : 'Usuário criado com sucesso', 'ok');
        ov0.fechar(); const novoId = id || (r.id ?? (r.usuario && r.usuario.id));
        aposSalvar ? aposSalvar(novoId) : (novoId && !id ? ZZ.ir('usuarios', { id: novoId }) : ZZ.usuariosRecarregar && ZZ.usuariosRecarregar());
      }
    };
  }

  /* =====================================================================
     DETALHE
  ===================================================================== */
  const TIPOS = {
    mensagem: { ic: 'fa-paper-plane', c: '#2563EB', bg: '#e7f0ff', r: 'Mensagens' },
    acesso: { ic: 'fa-right-to-bracket', c: '#1e9e57', bg: '#e6f7ee', r: 'Acessos' },
    alteracao: { ic: 'fa-pen', c: '#c47f12', bg: '#fff4e0', r: 'Alterações' },
    exclusao: { ic: 'fa-trash', c: '#d9433a', bg: '#fdecec', r: 'Exclusões' },
    leitura: { ic: 'fa-eye', c: '#6a4cff', bg: '#f0eefe', r: 'Consultas' },
    erro: { ic: 'fa-circle-exclamation', c: '#d9433a', bg: '#fdecec', r: 'Erros' }
  };
  const ACOES = { login: 'Entrou no sistema', sair: 'Saiu do sistema', logout: 'Saiu do sistema', enviar_texto: 'Enviou uma mensagem de texto', enviar_midia: 'Enviou um arquivo', enviar_enquete: 'Enviou uma enquete', enviar_localizacao: 'Enviou uma localização', enviar_contato: 'Enviou um contato', presenca: 'Mostrou digitando…', agendar_texto: 'Agendou uma mensagem', agendar_midia: 'Agendou um arquivo', cancelar_agendada: 'Cancelou um agendamento', reagendar: 'Reagendou uma mensagem', enviar_agora: 'Enviou um agendamento agora', marcar_lida: 'Marcou uma conversa como lida', trocar_senha: 'Trocou a própria senha', visita: 'Abriu uma tela', midia: 'Abriu uma mídia', exportar_csv: 'Exportou um CSV', convite: 'Copiou convite de grupo', config_salvar: 'Alterou configurações', reiniciar: 'Reiniciou a conexão' };
  const humaniza = a => ACOES[a] || (a ? a.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Ação');
  const tipoDe = it => {
    const a = String(it.acao || '').toLowerCase();
    if (it.ok === false || it.ok === 0 || it.ok === '0') return 'erro';
    if (/login|sair|logout|entrar|visita/.test(a)) return 'acesso';
    if (/enviar|agendar|presenca|campanha|resposta|iniciar|transferir|atender/.test(a)) return 'mensagem';
    if (/excluir|apagar|cancelar|remover|desconectar|encerrar/.test(a)) return 'exclusao';
    if (/^(ver|listar|rel|exportar|midia|convite|qr)/.test(a)) return 'leitura';
    return 'alteracao';
  };

  async function telaDetalhe(el, id) {
    ctxId = id;
    el.innerHTML = `<div class="us-voltar"><button class="btn-soft" id="usVolta"><i class="fa-solid fa-arrow-left"></i> Usuários</button></div><div id="usDet">${ZZ.skeleton(3, 'skel-linha us-skel')}</div>`;
    $('#usVolta', el).onclick = () => ZZ.ir('usuarios');
    const det = $('#usDet', el);
    const j = await ZZ.api('ver_usuario', { params: { id } });
    if (!$('#usDet', el)) return;
    if (!j.ok) { det.innerHTML = ''; det.appendChild(erroCartao(() => telaDetalhe(el, id), j.msg)); return; }
    const u = comDetalhe(j); const eu = ehEu(u);
    const sessoesN = u.sessoes;
    det.innerHTML = `<div class="card-soft us-head">${avatar(u, true)}<div class="us-head-t"><h2>${esc(u.nome || u.usuario)}</h2><div class="us-loginbox"><span>Login: <b>@${esc(u.usuario)}</b>${eu ? ' · você' : ''}</span><button class="btn-soft btn-sm" id="aCpL"><i class="fa-regular fa-copy"></i> Copiar</button></div><div class="us-head-s">${seloU(u)}${seloTroca(u)}<span class="mut"><i class="fa-regular fa-clock"></i> ${esc(relativo(u.ultimo))}</span></div></div></div>
      <div class="us-acoes"><button class="btn-soft" id="aEd"><i class="fa-solid fa-pen"></i> Editar</button><button class="btn-soft" id="aSenha"><i class="fa-solid fa-key"></i> Redefinir senha</button>${!eu ? '<button class="btn-azul" id="aProv"><i class="fa-solid fa-wand-magic-sparkles"></i> Gerar nova senha</button>' : ''}${!eu && !u.master ? `<button class="btn-soft" id="aAtv"><i class="fa-solid ${u.ativo ? 'fa-user-slash' : 'fa-user-check'}"></i> ${u.ativo ? 'Desativar' : 'Ativar'}</button>` : ''}${!eu ? '<button class="btn-perigo" id="aExc"><i class="fa-solid fa-trash"></i> Excluir</button>' : ''}</div>
      <div class="us-ajuda"><i class="fa-solid fa-shield-halved"></i> Por segurança as senhas são criptografadas e ninguém — nem o administrador — consegue ler a senha de outro usuário; use “Gerar nova senha” ou “Redefinir senha”.</div>
      <div class="us-abas" role="tablist"><button class="on" data-aba="ativ"><i class="fa-solid fa-timeline"></i> Atividade</button><button data-aba="sess"><i class="fa-solid fa-mobile-screen"></i> Sessões <span class="us-bolinha" id="usNSess" ${sessoesN ? '' : 'hidden'}>${sessoesN}</span></button><button data-aba="perm"><i class="fa-solid fa-key"></i> Permissões</button></div>
      <div id="usAba"></div>`;
    $('#aEd', det).onclick = () => abrirEditor(id, () => telaDetalhe(el, id));
    $('#aSenha', det).onclick = () => redefinirSenha(u);
    $('#aCpL', det).onclick = () => copiar(u.usuario, 'Login copiado');
    if ($('#aProv', det)) $('#aProv', det).onclick = async e => { const btn = e.currentTarget;
      if (!await ZZ.confirmar(`Gerar uma nova senha para ${u.nome || u.usuario}? A senha atual deixa de funcionar e as sessões abertas serão encerradas.`, 'Gerar senha', true)) return;
      const r = await ZZ.busy(btn, () => ZZ.api('gerar_senha', { corpo: { id: u.id } }));
      if (r && r.ok && r.senha) { ZZ.vibrar(15); mostrarSenha(u, r.senha, () => telaDetalhe(el, id)); }
    };
    if ($('#aAtv', det)) $('#aAtv', det).onclick = async e => { const btn = e.currentTarget;
      if (u.ativo && !await ZZ.confirmar(`Desativar ${u.nome || u.usuario}? As sessões abertas serão encerradas e ele não conseguirá entrar.`, 'Desativar', true)) return;
      const r = await ZZ.busy(btn, () => ZZ.api('ativar_usuario', { corpo: { id, ativo: !u.ativo } }));
      if (r && r.ok) { ZZ.toast(u.ativo ? 'Usuário desativado' : 'Usuário ativado', 'ok'); sucessoAnim(u.ativo ? 'Desativado' : 'Ativado'); telaDetalhe(el, id); }
    };
    if ($('#aExc', det)) $('#aExc', det).onclick = () => excluir(u);
    const mudarAba = a => {
      ZZ.$$('.us-abas button', det).forEach(b => b.classList.toggle('on', b.dataset.aba === a));
      limparPollAba(); ({ ativ: abaAtividade, sess: abaSessoes, perm: abaPermissoes })[a]($('#usAba', det), id, u);
    };
    ZZ.$$('.us-abas button', det).forEach(b => b.onclick = () => mudarAba(b.dataset.aba));
    mudarAba('ativ');
  }
  let pollAba = null; const limparPollAba = () => { pollAba = null; };

  async function redefinirSenha(u) {
    const m = ZZ.modal(`<h3><i class="fa-solid fa-key"></i> Redefinir senha</h3><p class="mut">Nova senha para <b>${esc(u.nome || u.usuario)}</b>. As sessões abertas dele serão encerradas.</p><label for="usNova">Nova senha</label>${campoSenha('usNova', 'Mínimo 6 caracteres')}<label class="us-perm"><span class="us-perm-t">Exigir que a pessoa troque a senha no primeiro acesso</span><input type="checkbox" class="us-sw" id="usNTroca"><i class="us-sw-v"></i></label><div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s>Redefinir</button></div>`);
    ligarSenha(m.el, 'usNova'); const inp = $('#usNova', m.el); setTimeout(() => inp.focus(), 80);
    $('[data-n]', m.el).onclick = () => m.fechar();
    $('[data-s]', m.el).onclick = async e => {
      if (inp.value.length < 6) return invalido(inp, 'A senha precisa ter pelo menos 6 caracteres.');
      const r = await ZZ.busy(e.currentTarget, () => ZZ.api('redefinir_senha', { corpo: { id: u.id, senha: inp.value, nova: inp.value, exigir_troca: $('#usNTroca', m.el).checked } }));
      if (r && r.ok) { m.fechar(); sucessoAnim('Senha redefinida'); ZZ.toast('Senha redefinida. Informe a nova senha ao usuário.', 'ok'); }
    };
  }

  function mostrarSenha(u, senha, aoFim) {
    let copiou = false;
    const m = ZZ.modal(`<h3><i class="fa-solid fa-key"></i> Nova senha de @${esc(u.usuario)}</h3><div class="us-prov"><small>Login</small><b class="us-prov-l">@${esc(u.usuario)}</b><small>Nova senha</small><code class="us-prov-s" id="usPS">${esc(senha)}</code></div>
      <div class="us-prov-b"><button class="btn-azul" data-cs><i class="fa-regular fa-copy"></i> Copiar senha</button><button class="btn-soft" data-cl><i class="fa-solid fa-clipboard-user"></i> Copiar login + senha</button></div>
      <div class="us-aviso" style="margin-top:12px"><i class="fa-solid fa-triangle-exclamation"></i><span>Esta senha aparece <b>só agora</b>; guarde ou repasse com segurança — a pessoa pode alterá-la depois em Configurações.</span></div>
      <div class="acoes"><button class="btn-soft" data-f>Fechar</button></div>`);
    const sai = () => { m.fechar(); aoFim && aoFim(); };
    $('[data-cs]', m.el).onclick = async () => { await copiar(senha, 'Senha copiada'); copiou = true; };
    $('[data-cl]', m.el).onclick = async () => { await copiar(`Usuário: ${u.usuario} / Senha: ${senha}`, 'Login e senha copiados'); copiou = true; };
    $('[data-f]', m.el).onclick = async () => { if (!copiou && !await ZZ.confirmar('Você ainda não copiou a senha e ela não poderá ser vista de novo. Fechar mesmo assim?', 'Fechar', true)) return; sai(); };
  }

  function excluir(u) {
    const m = ZZ.modal(`<h3 style="color:var(--verm)"><i class="fa-solid fa-triangle-exclamation"></i> Excluir usuário</h3><p>Isto apaga <b>${esc(u.nome || u.usuario)}</b> e encerra suas sessões. O histórico de atividade pode ser mantido para auditoria.</p><label for="usConf">Para confirmar, digite <b>@${esc(u.usuario)}</b></label><input type="text" id="usConf" autocomplete="off" autocapitalize="none" placeholder="@${esc(u.usuario)}"><div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-perigo" data-s disabled>Excluir definitivamente</button></div>`);
    const inp = $('#usConf', m.el), bt = $('[data-s]', m.el);
    inp.addEventListener('input', () => { bt.disabled = inp.value.trim().replace(/^@/, '').toLowerCase() !== u.usuario.toLowerCase(); });
    $('[data-n]', m.el).onclick = () => m.fechar();
    bt.onclick = async () => {
      if (!await ZZ.confirmar(`Última chance: excluir @${u.usuario} agora?`, 'Sim, excluir', true)) return;
      const r = await ZZ.busy(bt, () => ZZ.api('excluir_usuario', { corpo: { id: u.id } }));
      if (r && r.ok) { m.fechar(); ZZ.toast('Usuário excluído', 'ok'); ZZ.ir('usuarios'); }
    };
  }

  /* ---------- aba Permissões ---------- */
  async function abaPermissoes(box, id, u) {
    box.innerHTML = ZZ.skeleton(3, 'skel-linha us-skel');
    if (u.master) { box.innerHTML = '<div class="card-soft us-aviso"><i class="fa-solid fa-crown"></i> Usuário <b>master</b>: acesso total a todas as telas e conexões.</div>'; return; }
    const cat = await catalogo(); if (!cat) { box.innerHTML = ''; box.appendChild(erroCartao(() => abaPermissoes(box, id, u))); return; }
    const sel = new Set(u.perms); const todas = todasConexoes({ todas: u.todas, instancias: u.instancias });
    const instRot = n => { const i = (ZZ.instancias || []).find(x => x.nome === n); return i ? (i.apelido || i.nome) : n; };
    box.innerHTML = `<div class="card-soft"><div class="ch"><i class="fa-brands fa-whatsapp"></i> Conexões liberadas</div><div class="us-chips">${todas ? '<span class="badge-status b-ok">Todas as conexões</span>' : ((Array.isArray(u.instancias) ? u.instancias : []).map(n => `<span class="badge-status b-info">${esc(instRot(n))}</span>`).join('') || '<span class="mut">Nenhuma</span>')}</div></div>
      <div class="card-soft" style="margin-top:12px"><div class="ch"><i class="fa-solid fa-key"></i> ${sel.size} ${sel.size === 1 ? 'permissão liberada' : 'permissões liberadas'}</div>${cat.map(g => { const a = g.itens.filter(i => sel.has(i.k)); return `<div class="us-pv"><b>${esc(g.grupo)}</b> <span class="mut">${a.length}/${g.itens.length}</span><div class="us-chips">${g.itens.map(i => `<span class="us-chip ${sel.has(i.k) ? 'on' : ''}"><i class="fa-solid ${sel.has(i.k) ? 'fa-check' : 'fa-xmark'}"></i> ${esc(i.r)}</span>`).join('')}</div></div>`; }).join('')}</div>`;
  }

  /* ---------- aba Sessões ---------- */
  async function abaSessoes(box, id, u) {
    box.innerHTML = ZZ.skeleton(3, 'skel-linha us-skel');
    const j = await ZZ.api('listar_sessoes', { params: { id } });
    if (!$('#usAba')) return;
    if (!j.ok) { box.innerHTML = ''; box.appendChild(erroCartao(() => abaSessoes(box, id, u), j.msg)); return; }
    const it = j.sessoes || j.itens || [];
    const nb = $('#usNSess'); if (nb) { nb.hidden = !it.length; nb.textContent = it.length; }
    const disp = s => { const a = String(s.agente || s.dispositivo || s.user_agent || s.ua || ''); const m = /iPhone|iPad|Android|Windows|Macintosh|Linux/.exec(a); const nav = /Edg/.test(a) ? 'Edge' : /Chrome/.test(a) ? 'Chrome' : /Firefox/.test(a) ? 'Firefox' : /Safari/.test(a) ? 'Safari' : ''; return s.dispositivo && !/Mozilla/.test(a) ? a : ((m ? m[0] : 'Dispositivo') + (nav ? ' · ' + nav : '')); };
    box.innerHTML = `<div class="us-sub"><span class="mut">${it.length} ${it.length === 1 ? 'sessão ativa' : 'sessões ativas'}</span>${it.length ? '<button class="btn-perigo btn-sm" id="usEnc"><i class="fa-solid fa-power-off"></i> Encerrar todas</button>' : ''}</div>` +
      (it.length ? it.map(s => { const t = 0, c = ts(s.criado ?? s.criada ?? s.inicio); const mob = /iPhone|Android|iPad/.test(String(s.agente || s.dispositivo || s.user_agent || s.ua || '')); return `<div class="card-soft us-sess"><span class="us-sess-i"><i class="fa-solid ${mob ? 'fa-mobile-screen' : 'fa-computer'}"></i></span><div class="us-sess-t"><b>${esc(disp(s))}</b><small>IP ${esc(s.ip || '—')}${c ? ' · entrou ' + esc(ZZ.fmtDataHora(c)) : ''}</small><small>${t ? 'Última atividade ' + esc(relativo(t)) : ''}${bool(s.atual) ? ' · <span class="us-ok">sessão atual</span>' : ''}</small></div></div>`; }).join('') : '<div class="card-soft vazio"><i class="fa-solid fa-plug-circle-xmark"></i>Nenhuma sessão ativa.</div>');
    if ($('#usEnc', box)) $('#usEnc', box).onclick = async e => { const btn = e.currentTarget;
      if (!await ZZ.confirmar('Encerrar todas as sessões? O usuário precisará entrar de novo.', 'Encerrar todas', true)) return;
      const r = await ZZ.busy(btn, () => ZZ.api('encerrar_sessoes', { corpo: { id } }));
      if (r && r.ok) { ZZ.toast('Sessões encerradas', 'ok'); sucessoAnim('Sessões encerradas'); abaSessoes(box, id, u); }
    };
  }

  /* ---------- aba Atividade ---------- */
  function abaAtividade(box, id, u) {
    const f = { q: '', tipo: '', de: '', ate: '', periodo: '' };
    let pag = 1, itens = [], temMais = false, resumo = null, carregando = false, primeiraId = null;
    const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const dia = n => new Date(Date.now() - 3 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
    box.innerHTML = `<div class="us-cards" id="usRes"></div><div class="us-pgs" id="usPgs"></div>
      <div class="card-soft us-filtros"><div class="us-busca"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="fQ" placeholder="Buscar na atividade" autocomplete="off"></div>
      <div class="us-fil-l"><select id="fPer"><option value="">Todo o período</option><option value="hoje">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="x">Escolher datas…</option></select><select id="fTipo"><option value="">Todos os tipos</option></select></div>
      <div class="us-fil-l" id="fDatas" hidden><input type="date" id="fDe"><input type="date" id="fAte"></div>
      <div class="us-sub"><span class="vivo">ao vivo</span><button class="btn-soft btn-sm" id="fCsv"><i class="fa-solid fa-file-csv"></i> Exportar CSV</button></div></div>
      <div id="usTl"></div><div id="usMais" style="text-align:center;margin:12px 0"></div>`;
    const tl = $('#usTl', box);
    const params = p => { const o = { id, pag: p }; if (f.q) o.q = f.q; if (f.tipo) o.tipo = f.tipo; if (f.de) o.de = f.de; if (f.ate) o.ate = f.ate; return o; };
    const periodo = v => { f.periodo = v; $('#fDatas', box).hidden = v !== 'x'; if (v === 'hoje') { f.de = hoje(); f.ate = hoje(); } else if (v === '7') { f.de = dia(6); f.ate = hoje(); } else if (v === '30') { f.de = dia(29); f.ate = hoje(); } else if (v === '') { f.de = f.ate = ''; } };
    const cartoes = () => {
      const r = resumo || {};
      const defs = [['hoje', 'Hoje', 'fa-sun', r.hoje, TIPOS.mensagem], ['7', '7 dias', 'fa-calendar-week', r.sete_dias, TIPOS.alteracao], ['login', 'Último acesso', 'fa-right-to-bracket', r.ultimo_acesso ? relativo(r.ultimo_acesso) : '—', TIPOS.acesso]];
      const ativo = k => (k === 'login' ? f.tipo === 'login' : k === f.periodo);
      $('#usRes', box).innerHTML = defs.map(d => `<button class="us-res ${ativo(d[0]) ? 'on' : ''}" data-t="${d[0]}" style="--c:${d[4].c};--bg:${d[4].bg}"><i class="fa-solid ${d[2]}"></i><b>${d[3] == null ? '—' : esc(d[3])}</b><small>${d[1]}</small></button>`).join('');
      $('#usPgs', box).innerHTML = (r.paginas || []).length ? `<small>Telas mais abertas</small>${r.paginas.map(p => `<button class="us-chip on" data-pg="${esc(p.pagina)}">${esc(p.pagina)} · ${p.visitas}</button>`).join('')}` : '';
      ZZ.$$('.us-res', box).forEach(b => b.onclick = () => {
        const k = b.dataset.t;
        if (k === 'login') { f.tipo = f.tipo === 'login' ? '' : 'login'; $('#fTipo', box).value = f.tipo; }
        else { const v = f.periodo === k ? '' : k; $('#fPer', box).value = v; periodo(v); }
        recarregar();
      });
      ZZ.$$('[data-pg]', box).forEach(b => b.onclick = () => { f.tipo = 'visita'; f.q = 'abriu: ' + b.dataset.pg; $('#fTipo', box).value = 'visita'; $('#fQ', box).value = f.q; recarregar(); });
    };
    const preencherTipos = tp => { const sel = $('#fTipo', box); if (!tp || sel.dataset.ok) return; sel.dataset.ok = 1; sel.innerHTML = '<option value="">Todos os tipos</option>' + tp.map(t => `<option value="${esc(t.acao)}">${esc(t.rotulo)}</option>`).join(''); sel.value = f.tipo; };
    const linha = (it, novo) => {
      const tp = tipoDe(it), T = TIPOS[tp]; const t = ts(it.ts ?? it.quando ?? it.data);
      const txt = it.rotulo || it.texto || humaniza(it.acao); const det = it.detalhe || it.detalhes || '';
      const cx = it.instancia || it.conexao || '';
      return `<div class="us-ev ${novo ? 'us-novo' : ''}" style="--c:${T.c};--bg:${T.bg}"><span class="us-ev-i"><i class="fa-solid ${T.ic}"></i></span><div class="us-ev-c"><div class="us-ev-t">${esc(txt)}${tp === 'erro' ? ' <span class="badge-status b-err">falhou</span>' : ''}</div>${det ? `<div class="us-ev-d">${esc(det)}</div>` : ''}<div class="us-ev-m">${t ? `<span><i class="fa-regular fa-clock"></i> ${esc(ZZ.fmtDataHora(t))}</span>` : ''}${cx ? `<span><i class="fa-brands fa-whatsapp"></i> ${esc(((ZZ.instancias || []).find(x => x.nome === cx) || {}).apelido || cx)}</span>` : ''}${it.ip ? `<span><i class="fa-solid fa-location-dot"></i> ${esc(it.ip)}</span>` : ''}</div></div></div>`;
    };
    const pintar = (novosDesde) => {
      if (!itens.length) { tl.innerHTML = '<div class="card-soft vazio"><i class="fa-solid fa-timeline"></i>Nenhuma atividade encontrada com esses filtros.</div>'; }
      else {
        let ult = '', h = '';
        itens.forEach(it => { const t = ts(it.ts ?? it.quando ?? it.data); const d = t ? ZZ.fmtData(t) : ''; if (d !== ult) { ult = d; h += `<div class="us-dia">${esc(d === ZZ.fmtData(Date.now() / 1000) ? 'Hoje' : d)}</div>`; } h += linha(it, novosDesde && it._n); });
        tl.innerHTML = '<div class="us-tl">' + h + '</div>';
      }
      $('#usMais', box).innerHTML = temMais ? '<button class="btn-soft" id="bMais"><i class="fa-solid fa-chevron-down"></i> Carregar mais</button>' : (itens.length ? '<span class="mut">Fim da atividade</span>' : '');
      if ($('#bMais', box)) $('#bMais', box).onclick = e => ZZ.busy(e.currentTarget, () => buscar(pag + 1));
    };
    const buscar = async (p, silencioso) => {
      const j = await ZZ.api('listar_atividade', { params: params(p), silencioso });
      if (!$('#usTl')) return false;
      if (!j.ok) { if (!silencioso) { tl.innerHTML = ''; tl.appendChild(erroCartao(recarregar, j.msg)); } return false; }
      const novos = (j.itens || j.atividade || []);
      if (j.resumo) resumo = j.resumo; preencherTipos(j.tipos);
      if (p === 1 && silencioso) {
        const ids = new Set(itens.map(i => i.id)); const fresh = novos.filter(i => i.id != null ? !ids.has(i.id) : false);
        if (!fresh.length) { cartoes(); return true; }
        fresh.forEach(i => i._n = true); itens = fresh.concat(itens); cartoes(); pintar(true); return true;
      }
      pag = p; itens = p === 1 ? novos : itens.concat(novos);
      temMais = j.paginas ? p < j.paginas : novos.length >= 30;
      cartoes(); pintar(false); return true;
    };
    const recarregar = () => { tl.innerHTML = ZZ.skeleton(5, 'skel-linha us-skel'); $('#usMais', box).innerHTML = ''; resumo = resumo; return buscar(1); };
    $('#fQ', box).addEventListener('input', ZZ.debounce(e => { f.q = e.target.value.trim(); recarregar(); }, 350));
    $('#fPer', box).onchange = e => { periodo(e.target.value); if (e.target.value !== 'x') recarregar(); };
    $('#fTipo', box).onchange = e => { f.tipo = e.target.value; recarregar(); };
    $('#fDe', box).onchange = e => { f.de = e.target.value; recarregar(); }; $('#fAte', box).onchange = e => { f.ate = e.target.value; recarregar(); };
    $('#fCsv', box).onclick = e => ZZ.busy(e.currentTarget, async () => {
      const q = new URLSearchParams({ a: 'exportar_atividade_csv', ...params(1) }); q.delete('pag');
      try {
        const r = await fetch('api.php?' + q, { headers: ZZ.cabecalhos(), credentials: 'same-origin' });
        if (!r.ok || /json/.test(r.headers.get('content-type') || '')) { const j = await r.json().catch(() => ({})); ZZ.toast(j.msg || 'Não foi possível exportar.', 'err'); return false; }
        const b = await r.blob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `zapzap-atividade-${u.usuario}-${hoje()}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        ZZ.toast('CSV exportado', 'ok'); return true;
      } catch (x) { ZZ.toast('Sem conexão com o servidor', 'err'); return false; }
    });
    cartoes(); tl.innerHTML = ZZ.skeleton(5, 'skel-linha us-skel'); buscar(1);
    ZZ.poll(() => { if ($('#usTl') && pag === 1 && !carregando) buscar(1, true); }, 15000);
  }

  /* =====================================================================
     página
  ===================================================================== */
  ZZ.pagina({
    id: 'usuarios', titulo: 'Usuários', icone: 'fa-user-gear', ordem: 8.5, perm: 'usuarios.ver',
    render(el, ctx) {
      raiz = el; el.classList.add('us-raiz');
      if (!ZZ.eu || !ZZ.eu.usuario.master) { el.innerHTML = '<div class="card-soft vazio"><i class="fa-solid fa-lock"></i>Somente o administrador (master) pode gerir usuários.</div>'; return; }
      (ctx.params && ctx.params.id) ? telaDetalhe(el, ctx.params.id) : telaLista(el);
    },
    destroy() { overlays.slice().forEach(o => o.el.remove()); overlays = []; document.body.classList.remove('us-trava'); ZZ.usuariosRecarregar = null; raiz = null; }
  });
})();
