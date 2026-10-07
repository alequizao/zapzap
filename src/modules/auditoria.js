/* Auditoria — linha do tempo de atividades (classes ad-). */
ZZ.pagina({ id: 'auditoria', titulo: 'Auditoria', icone: 'fa-shield-halved', ordem: 9.5, perm: 'auditoria.ver', render(el) {
  const CAT = {
    login: { ic: 'fa-right-to-bracket', cor: 'azul', nome: 'Acessos' }, envio: { ic: 'fa-paper-plane', cor: 'verde', nome: 'Envios' },
    config: { ic: 'fa-sliders', cor: 'amar', nome: 'Configuração' }, usuarios: { ic: 'fa-user-gear', cor: 'roxo', nome: 'Usuários' },
    conexao: { ic: 'fa-plug', cor: 'ciano', nome: 'Conexões' }, nav: { ic: 'fa-compass', cor: 'cinza', nome: 'Navegação' }, outros: { ic: 'fa-circle-dot', cor: 'cinza', nome: 'Outros' }
  };
  const PILULAS = [['', 'Tudo'], ['cat:login', 'Acessos'], ['cat:envio', 'Envios'], ['cat:config', 'Configuração'], ['cat:usuarios', 'Usuários'], ['cat:conexao', 'Conexões'], ['cat:nav', 'Navegação']];
  const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const dias = n => new Date(Date.now() - 3 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);
  const F = { q: '', acao: '', ok: '', usuario_id: '', de: '', ate: '', per: '' };
  let itens = [], pag = 1, temMais = false, total = 0, vistos = new Set(), seq = 0, master = false, resumo = null, ciclo = 0, carregando = false;

  el.innerHTML = `<div class="ad">
    <div class="card-soft ad-topo"><div class="ch"><i class="fa-solid fa-shield-halved"></i> Auditoria <span class="vivo" style="margin-left:auto">ao vivo</span></div>
      <p class="mut ad-sub" id="adSub">Quem fez o quê, quando e de onde.</p></div>
    <div id="adAlerta"></div>
    <div class="ad-chips" id="adChips">${ZZ.skeleton(1, 'skel-linha ad-skel-chips')}</div>
    <div class="card-soft ad-filtros">
      <div class="ad-busca"><i class="fa-solid fa-magnifying-glass"></i><input id="adQ" type="search" placeholder="Buscar por usuário, IP ou detalhe" autocomplete="off"></div>
      <div class="ad-pils" id="adPilCat"></div>
      <div class="ad-pils" id="adPilPer"></div>
      <div class="ad-datas" id="adDatas"><label>De <input type="date" id="adDe"></label><label>Até <input type="date" id="adAte"></label></div>
      <div class="ad-linha-btn"><span class="mut" id="adTotal"></span><span class="espaco"></span>
        <button class="btn-soft btn-sm" id="adLimpar" hidden><i class="fa-solid fa-xmark"></i> Limpar filtros</button>
        <button class="btn-soft btn-sm" id="adCsv"><i class="fa-solid fa-file-csv"></i> Exportar CSV</button></div>
    </div>
    <div id="adLista">${ZZ.skeleton(6, 'skel-linha ad-skel')}</div>
    <div class="ad-mais" id="adMais"></div></div>`;
  const $ = s => ZZ.$(s, el);

  const params = () => { const p = { pag }; for (const k in F) if (F[k] !== '' && k !== 'per') p[k] = F[k]; return p; };
  const nomeHora = h => String(h).padStart(2, '0') + 'h';
  const diaTxt = ts => {
    const d = new Date((ts - 10800) * 1000).toISOString().slice(0, 10);
    if (d === hoje()) return 'Hoje'; if (d === dias(1)) return 'Ontem';
    return new Date(ts * 1000).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'America/Maceio' });
  };
  const diaChave = ts => new Date((ts - 10800) * 1000).toISOString().slice(0, 10);

  function pilulas() {
    $('#adPilCat').innerHTML = PILULAS.map(([v, n]) => `<button class="ad-pil ${F.acao === v && F.ok === '' ? 'ativa' : ''}" data-cat="${v}">${n}</button>`).join('') +
      `<button class="ad-pil ad-pil-falha ${F.ok === '0' ? 'ativa' : ''}" data-falha="1"><i class="fa-solid fa-triangle-exclamation"></i> Falhas</button>` +
      (master && resumo && resumo.por_usuario.length > 1 ? `<select class="ad-sel" id="adUsr" aria-label="Filtrar por usuário"><option value="">Todos os usuários</option>${resumo.por_usuario.filter(u => u.usuario_id).map(u => `<option value="${u.usuario_id}" ${String(u.usuario_id) === String(F.usuario_id) ? 'selected' : ''}>${ZZ.esc(u.nome)}</option>`).join('')}</select>` : '');
    $('#adPilPer').innerHTML = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['', 'Tudo'], ['pers', 'Período…']].map(([v, n]) => `<button class="ad-pil ad-pil-p ${F.per === v ? 'ativa' : ''}" data-per="${v}">${n}</button>`).join('');
    $('#adDatas').classList.toggle('ad-aberto', F.per === 'pers');
    const f = !!(F.q || F.acao || F.ok || F.usuario_id || (F.per && F.per !== '7'));
    $('#adLimpar').hidden = !f;
  }
  function chips() {
    const box = $('#adChips'); if (!resumo) return;
    const c = resumo.por_tipo.filter(t => t.cat !== 'nav');
    const mk = (cls, ic, num, lbl, attr, ativo) => `<button class="ad-chip ${cls} ${ativo ? 'ativa' : ''}" ${attr}><i class="fa-solid ${ic}"></i><b>${ZZ.fmtNumero ? num.toLocaleString('pt-BR') : num}</b><span>${ZZ.esc(lbl)}</span></button>`;
    box.innerHTML = mk('ad-ch-tot', 'fa-list', resumo.total, 'ações', 'data-cat=""', !F.acao && F.ok === '') +
      mk('ad-ch-falha', 'fa-triangle-exclamation', resumo.falhas, 'falhas', 'data-falha="1"', F.ok === '0') +
      c.map(t => { const m = CAT[t.cat] || CAT.outros; return mk('ad-c-' + m.cor, m.ic, t.n, t.rotulo, `data-cat="cat:${t.cat}"`, F.acao === 'cat:' + t.cat); }).join('') +
      (resumo.falhas_login.total ? mk('ad-ch-falha', 'fa-user-lock', resumo.falhas_login.total, 'falhas de login', 'data-cat="login-falha"', F.acao === 'login' && F.ok === '0') : '') +
      (resumo.picos.hora_pico !== null ? `<div class="ad-chip ad-ch-info"><i class="fa-solid fa-chart-simple"></i><b>${nomeHora(resumo.picos.hora_pico)}</b><span>horário de pico</span></div>` : '') +
      (resumo.picos.dia_pico ? `<div class="ad-chip ad-ch-info"><i class="fa-solid fa-calendar-day"></i><b>${resumo.picos.dia_pico.dia.slice(8, 10)}/${resumo.picos.dia_pico.dia.slice(5, 7)}</b><span>dia mais movimentado</span></div>` : '') +
      (master ? resumo.por_usuario.filter(u => u.usuario_id).slice(0, 4).map(u => `<button class="ad-chip ad-ch-usr ${String(F.usuario_id) === String(u.usuario_id) ? 'ativa' : ''}" data-usr="${u.usuario_id}"><i class="fa-solid fa-user"></i><b>${u.n}</b><span>${ZZ.esc(u.nome)}</span></button>`).join('') : '');
  }
  function alerta(lista) {
    const b = $('#adAlerta');
    if (!lista || !lista.length) { b.innerHTML = ''; return; }
    b.innerHTML = `<div class="ad-alerta" role="alert"><i class="fa-solid fa-triangle-exclamation"></i><div><b>Atenção: falhas de login repetidas</b>
      <div>${lista.map(a => `${ZZ.esc(a.n)} tentativas falhas na última hora do IP <code>${ZZ.esc(a.ip)}</code> (última ${ZZ.fmtRel(a.ultima)})`).join('<br>')}</div>
      <button class="ad-ver-falhas" data-cat="login-falha">Ver tentativas</button></div></div>`;
  }
  function linha(r, novo) {
    const m = CAT[r.cat] || CAT.outros;
    const cor = r.ok ? m.cor : 'verm';
    return `<article class="ad-item ${r.ok ? '' : 'ad-falha'} ${novo ? 'ad-novo' : ''}" data-id="${r.id}">
      <div class="ad-ico ad-c-${cor}"><i class="fa-solid ${r.ok ? m.ic : 'fa-triangle-exclamation'}"></i></div>
      <div class="ad-corpo"><div class="ad-l1"><b class="ad-tit">${ZZ.esc(r.rotulo)}</b><span class="ad-hora">${ZZ.fmtHora(r.ts)}</span></div>
        <div class="ad-quem"><i class="fa-regular fa-user"></i> ${ZZ.esc(r.nome || r.usuario || 'Sistema')}${r.ip ? ` · <span class="ad-ip">${ZZ.esc(r.ip)}</span>` : ''}${r.instancia ? ` · <span class="ad-inst"><i class="fa-solid fa-plug"></i> ${ZZ.esc(r.instancia)}</span>` : ''}</div>
        ${r.detalhe ? `<div class="ad-det">${ZZ.esc(r.detalhe)}</div>` : ''}
        ${r.ok ? '' : '<span class="badge-status b-err ad-bf">Falhou</span>'}</div></article>`;
  }
  function desenhar(novos) {
    const box = $('#adLista');
    $('#adTotal').textContent = total ? total.toLocaleString('pt-BR') + (total === 1 ? ' registro' : ' registros') : '';
    if (!itens.length) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-clipboard-list"></i>Nenhuma atividade encontrada com estes filtros.</div>'; $('#adMais').innerHTML = ''; return; }
    let h = '', dia = '';
    for (const r of itens) { const d = diaChave(r.ts); if (d !== dia) { dia = d; h += `<div class="ad-dia">${ZZ.esc(diaTxt(r.ts))}</div>`; } h += linha(r, novos && novos.has(r.id)); }
    box.innerHTML = h;
    $('#adMais').innerHTML = temMais ? '<button class="btn-soft ad-btn-mais" id="adMaisBtn"><i class="fa-solid fa-angles-down"></i> Carregar mais</button>' : '<div class="mut ad-fim">Fim do registro</div>';
  }
  const erro = msg => { $('#adLista').innerHTML = `<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>${ZZ.esc(msg || 'Não foi possível carregar a auditoria.')}<br><button class="btn-soft btn-sm" id="adTent"><i class="fa-solid fa-rotate"></i> Tentar de novo</button></div>`; $('#adMais').innerHTML = ''; };

  async function carregarResumo() {
    const p = {}; if (F.de) p.de = F.de; if (F.ate) p.ate = F.ate; if (F.usuario_id && false) p.usuario_id = F.usuario_id;
    const j = await ZZ.api('rel_auditoria_resumo', { params: p, silencioso: true });
    if (!j.ok) { if (j.sem_permissao) return; if (!resumo) $('#adChips').innerHTML = ''; return; }
    resumo = j; chips(); pilulas();
  }
  async function carregar(reset) {
    const meu = ++seq;
    if (reset) { pag = 1; itens = []; vistos = new Set(); $('#adLista').innerHTML = ZZ.skeleton(6, 'skel-linha ad-skel'); $('#adMais').innerHTML = ''; }
    const j = await ZZ.api('listar_auditoria', { params: params(), silencioso: true });
    if (meu !== seq) return;
    if (!j.ok) { if (j.sem_permissao) { el.innerHTML = '<div class="vazio"><i class="fa-solid fa-lock"></i>Você não tem permissão para ver a auditoria.</div>'; return; } if (reset || !itens.length) erro(j.msg); return; }
    master = j.master; total = j.total; temMais = j.tem_mais;
    $('#adSub').textContent = master ? 'Quem fez o quê, quando e de onde (todos os usuários).' : 'Suas atividades no painel.';
    itens = j.itens; j.itens.forEach(r => vistos.add(r.id)); alerta(j.alerta_login);
    desenhar(); pilulas();
  }
  // atualização ao vivo: só a primeira página, destacando eventos novos
  async function vivo() {
    if (carregando || pag > 1 && itens.length > 50 && false) return;
    const meu = seq;
    const p = params(); p.pag = 1;
    const j = await ZZ.api('listar_auditoria', { params: p, silencioso: true });
    if (!j.ok || meu !== seq || carregando) return;
    const novos = j.itens.filter(r => !vistos.has(r.id));
    alerta(j.alerta_login);
    if (++ciclo % 4 === 0) carregarResumo();
    if (!novos.length) return;
    novos.forEach(r => vistos.add(r.id));
    itens = novos.concat(itens); total = j.total;
    const ids = new Set(novos.map(r => r.id));
    desenhar(ids);
    if (novos.some(r => !r.ok)) ZZ.vibrar(20);
    carregarResumo();
  }
  const aplicar = () => { pilulas(); carregar(true); chips(); };
  const periodo = v => {
    F.per = v;
    if (v === 'hoje') { F.de = hoje(); F.ate = ''; } else if (v === '7') { F.de = dias(6); F.ate = ''; } else if (v === '30') { F.de = dias(29); F.ate = ''; } else if (v === '') { F.de = ''; F.ate = ''; }
    $('#adDe').value = F.de; $('#adAte').value = F.ate;
  };
  const filtroCat = c => {
    if (c === 'login-falha') { F.acao = 'login'; F.ok = '0'; } else { F.acao = c; F.ok = ''; }
  };

  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-cat],[data-falha],[data-per],[data-usr],#adMaisBtn,#adTent,#adLimpar,#adCsv'); if (!t) return;
    ZZ.vibrar(8);
    if (t.id === 'adMaisBtn') { await ZZ.busy(t, async () => { carregando = true; pag++; const j = await ZZ.api('listar_auditoria', { params: params() }); carregando = false; if (!j.ok) { pag--; return j; } const ids = new Set(); j.itens.forEach(r => { if (!vistos.has(r.id)) { vistos.add(r.id); itens.push(r); } }); temMais = j.tem_mais; total = j.total; desenhar(); return j; }); return; }
    if (t.id === 'adTent') { carregar(true); carregarResumo(); return; }
    if (t.id === 'adLimpar') { Object.assign(F, { q: '', acao: '', ok: '', usuario_id: '', de: '', ate: '', per: '' }); $('#adQ').value = ''; $('#adDe').value = ''; $('#adAte').value = ''; aplicar(); carregarResumo(); ZZ.toast('Filtros limpos', 'ok'); return; }
    if (t.id === 'adCsv') { await ZZ.busy(t, async () => { const p = new URLSearchParams({ a: 'rel_auditoria_csv' }); for (const k in F) if (F[k] !== '' && k !== 'per') p.set(k, F[k]); try { const r = await fetch('api.php?' + p, { headers: ZZ.cabecalhos(), credentials: 'same-origin' }); if (!r.ok) { let m = 'Não foi possível exportar'; try { m = (await r.json()).msg || m; } catch (x) { } ZZ.toast(m, 'err'); return false; } const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'zapzap-auditoria-' + hoje() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); ZZ.toast('CSV exportado', 'ok'); return true; } catch (x) { ZZ.toast('Sem conexão com o servidor', 'err'); return false; } }); return; }
    if (t.dataset.usr !== undefined) { F.usuario_id = String(F.usuario_id) === t.dataset.usr ? '' : t.dataset.usr; aplicar(); return; }
    if (t.dataset.per !== undefined) { periodo(t.dataset.per); if (t.dataset.per !== 'pers') { aplicar(); carregarResumo(); } else pilulas(); return; }
    if (t.dataset.falha) { if (F.ok === '0' && !F.acao) { F.ok = ''; } else { F.ok = '0'; F.acao = ''; } aplicar(); return; }
    if (t.dataset.cat !== undefined) { const c = t.dataset.cat; if (c === 'login-falha' && F.acao === 'login' && F.ok === '0') filtroCat(''); else filtroCat(c); aplicar(); if (c === 'login-falha') window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  el.addEventListener('change', e => {
    if (e.target.id === 'adUsr') { F.usuario_id = e.target.value; aplicar(); }
    if (e.target.id === 'adDe' || e.target.id === 'adAte') { F.per = 'pers'; F.de = $('#adDe').value; F.ate = $('#adAte').value; pilulas(); carregar(true); carregarResumo(); }
  });
  $('#adQ').addEventListener('input', ZZ.debounce(e => { F.q = e.target.value.trim(); aplicar(); }, 350));

  periodo('7');
  pilulas(); carregar(true); carregarResumo();
  ZZ.poll(vivo, 8000);
} });
