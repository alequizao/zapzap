/* Conexões — gestão de vários WhatsApps (instâncias da Evolution). Classes cn-. Dono: módulo Conexões. */
ZZ.pagina({ id: 'conexoes', titulo: 'Conexões', icone: 'fa-plug', ordem: 7.5, tab: false, render(el) {
  const E = ZZ.esc;
  let vivo = true, assinatura = '', itens = null, sheetAtual = null;
  const REGEX_NOME = /^[A-Za-z0-9_-]{2,40}$/;

  el.innerHTML = `<div class="cn-raiz">
    <div class="cn-topo"><button class="btn-azul cn-novo" id="cnNovo" ${ZZ.pode('conexoes.criar') ? '' : 'hidden'}><i class="fa-solid fa-plus"></i> Conectar novo WhatsApp</button><span class="vivo cn-vivo">ao vivo</span></div>
    <div class="cn-aviso"><i class="fa-solid fa-circle-info"></i><span>Cada conexão é um WhatsApp separado (uma instância própria). O histórico, a agenda e os contatos mostrados no painel dependem da <b>conexão ativa</b>.</span></div>
    <div id="cnLista" class="cn-lista">${ZZ.skeleton(3, 'skel-linha cn-sk')}</div></div>`;
  const lista = ZZ.$('#cnLista', el);
  ZZ.$('#cnNovo', el).onclick = () => abrirNovo();

  /* ---------- utilidades ---------- */
  const fixMA = () => { if (!document.querySelector('.modal-bg')) ZZ.modalAberto = 0; };
  const confirmar = async (...a) => { const r = await ZZ.confirmar(...a); fixMA(); return r; };
  /** Bottom sheet próprio (não pausa o polling da página). */
  function sheet(html, cls = '') {
    const bg = document.createElement('div'); bg.className = 'modal-bg cn-bg';
    bg.innerHTML = `<div class="modal cn-sheet ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(bg);
    const s = { el: bg.firstChild, bg, aoFechar: null, fechar() { if (!bg.isConnected) return; bg.remove(); if (sheetAtual === s) sheetAtual = null; s.aoFechar && s.aoFechar(); } };
    return s;
  }
  const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const imgQr = q => !q ? '' : (/^data:/.test(q) ? q : 'data:image/png;base64,' + q);
  const estadoInfo = e => e === 'open' ? ['b-ok', 'Conectado', 'fa-circle-check'] : e === 'connecting' ? ['b-pend', 'Conectando', 'fa-spinner fa-spin'] : ['b-err', 'Desconectado', 'fa-circle-xmark'];
  const nomeBonito = i => i.apelido || i.nome;

  /* ---------- lista ---------- */
  async function carregar(forcar) {
    const j = await ZZ.api('instancias', { params: forcar ? { atualizar: 1 } : {}, silencioso: true });
    if (!vivo) return;
    if (!j || !j.ok) {
      if (itens) return; // já há dados na tela: mantém, tenta no próximo ciclo
      lista.innerHTML = `<div class="card-soft cn-erro"><i class="fa-solid fa-triangle-exclamation"></i><p>${E((j && j.msg) || 'Não foi possível carregar as conexões.')}</p><button class="btn-azul" id="cnTentar"><i class="fa-solid fa-rotate"></i> Tentar de novo</button></div>`;
      ZZ.$('#cnTentar', lista).onclick = e => ZZ.busy(e.currentTarget, async () => { lista.innerHTML = ZZ.skeleton(3, 'skel-linha cn-sk'); await carregar(true); return !!itens; });
      assinatura = '';
      return;
    }
    itens = j.itens || [];
    const ass = JSON.stringify([itens, ZZ.instancia]);
    if (ass === assinatura) return;
    assinatura = ass; desenhar();
  }

  function cartao(i) {
    const [cls, rot, ic] = estadoInfo(i.estado);
    const ativa = i.nome === ZZ.instancia;
    const foto = i.foto ? `<img class="cn-foto" src="${E(i.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'cn-foto cn-ini',textContent:this.dataset.i}))" data-i="${E(ZZ.iniciais(nomeBonito(i)))}">` : `<span class="cn-foto cn-ini">${E(ZZ.iniciais(nomeBonito(i)))}</span>`;
    const desc = i.estado !== 'open';
    return `<article class="card-soft cn-card ${ativa ? 'cn-ativa' : ''}" data-n="${E(i.nome)}">
      <div class="cn-cab">${foto}<div class="cn-id">
        <div class="cn-nome"><b>${E(nomeBonito(i))}</b>${i.protegida ? '<i class="fa-solid fa-lock cn-cad" title="Conexão protegida"></i>' : ''}${ativa ? '<span class="cn-selo-ativa"><i class="fa-solid fa-star"></i> Ativa</span>' : ''}</div>
        <div class="cn-sub">${i.numero ? E(ZZ.fmtNumero(i.numero)) : 'Sem número vinculado'}</div>
        <div class="cn-tec">${E(i.nome)}${i.perfil ? ' · ' + E(i.perfil) : ''}</div></div>
        <span class="badge-status ${cls} cn-estado"><i class="fa-solid ${ic}"></i> ${rot}</span></div>
      ${i.corte ? `<div class="cn-oculto"><i class="fa-solid fa-eye-slash"></i><span><b>Dados ocultos</b> desde ${E(ZZ.fmtDataHora(i.corte))}. O painel só mostra o que chegar depois.</span>${ZZ.pode('conexoes.desconectar') ? '<button class="btn-soft btn-sm" data-a="mostrar"><i class="fa-solid fa-eye"></i> Mostrar dados de novo</button>' : ''}</div>` : `<div class="cn-cont"><div><b>${Number(i.msgs || 0).toLocaleString("pt-BR")}</b><span>mensagens</span></div><div><b>${Number(i.contatos || 0).toLocaleString('pt-BR')}</b><span>contatos</span></div><div><b>${Number(i.chats || 0).toLocaleString('pt-BR')}</b><span>conversas</span></div></div>`}
      ${resumoSync(i)}
      ${i.protegida ? '<div class="cn-prot"><i class="fa-solid fa-lock"></i> Conexão protegida: sem desconectar/excluir pelo painel.</div>' : ''}
      <div class="cn-botoes">
        ${ativa ? '' : '<button class="btn-azul" data-a="usar"><i class="fa-solid fa-check"></i> Usar esta</button>'}
        ${desc && ZZ.pode('conexoes.qr') ? '<button class="btn-acao" data-a="qr"><i class="fa-solid fa-qrcode"></i> Conectar / Gerar QR</button>' : ''}
        <button class="btn-soft" data-a="renomear"><i class="fa-solid fa-pen"></i> Renomear</button>
        ${i.estado === 'open' && ZZ.pode('conexoes.qr') ? '<button class="btn-acao" data-a="sincronizar"><i class="fa-solid fa-cloud-arrow-down"></i> Sincronizar agora</button>' : ''}
        ${!i.protegida && i.estado === 'open' && ZZ.pode('conexoes.desconectar') ? '<button class="btn-soft cn-desc" data-a="desconectar"><i class="fa-solid fa-link-slash"></i> Desconectar</button>' : ''}
        ${!i.protegida && i.estado !== 'open' && !i.corte && ZZ.pode('conexoes.desconectar') ? '<button class="btn-soft cn-desc" data-a="desconectar"><i class="fa-solid fa-broom"></i> Limpar dados</button>' : ''}
        ${!i.protegida && ZZ.pode('conexoes.excluir') ? '<button class="btn-perigo btn-sm" data-a="excluir"><i class="fa-solid fa-trash"></i> Excluir</button>' : ''}
      </div></article>`;
  }

  function desenhar() {
    if (!itens.length) {
      lista.innerHTML = '<div class="vazio"><i class="fa-brands fa-whatsapp"></i>Nenhum WhatsApp conectado ainda.<br>Toque em “Conectar novo WhatsApp” para começar.</div>'; return;
    }
    lista.innerHTML = itens.map(cartao).join('');
  }

  lista.addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const n = b.closest('.cn-card').dataset.n; const i = (itens || []).find(x => x.nome === n); if (!i) return;
    const a = b.dataset.a;
    if (a === 'usar') { ZZ.trocarInstancia(n); assinatura = ''; carregar(); }
    else if (a === 'qr') abrirQr(i);
    else if (a === 'renomear') renomear(i);
    else if (a === 'desconectar') desconectar(i, b);
    else if (a === 'mostrar') mostrarDados(i, b);
    else if (a === 'sincronizar') sincronizarAgora(i);
    else if (a === 'cancelarmid') cancelarMidias(i, b);
    else if (a === 'excluir') excluir(i);
  });

  /* ---------- renomear ---------- */
  function renomear(i) {
    const s = sheet(`<h3><i class="fa-solid fa-pen"></i> Renomear conexão</h3>
      <label class="cn-lbl" for="cnAp">Apelido</label><input id="cnAp" maxlength="40" value="${E(nomeBonito(i))}" autocomplete="off"><div class="msg-campo" id="cnApM" hidden></div>
      <div class="acoes"><button class="btn-soft" data-f>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-check"></i> Salvar</button></div>`);
    const inp = ZZ.$('#cnAp', s.el), msg = ZZ.$('#cnApM', s.el); inp.focus(); inp.select();
    s.el.querySelector('[data-f]').onclick = () => s.fechar();
    const salvar = () => ZZ.busy(s.el.querySelector('[data-s]'), async () => {
      const ap = inp.value.trim();
      if (!ap) { inp.classList.add('erro-campo'); msg.hidden = false; msg.textContent = 'Digite um apelido (até 40 caracteres).'; inp.focus(); return false; }
      const j = await ZZ.api('instancia_apelido', { corpo: { nome: i.nome, apelido: ap } });
      if (j.ok) { ZZ.toast('Apelido salvo', 'ok'); s.fechar(); await ZZ.recarregarInstancias(); await carregar(true); }
      return j;
    });
    s.el.querySelector('[data-s]').onclick = salvar; inp.onkeydown = e => { if (e.key === 'Enter') salvar(); };
    inp.oninput = () => { inp.classList.remove('erro-campo'); msg.hidden = true; };
  }

  /* ---------- desconectar / limpar dados ---------- */
  function desconectar(i) {
    const aberto = i.estado === 'open';
    const s = sheet(`<h3><i class="fa-solid ${aberto ? 'fa-link-slash' : 'fa-broom'}"></i> ${aberto ? 'Desconectar' : 'Limpar dados de'} “${E(nomeBonito(i))}”</h3>
      <p class="cn-dica cn-dica0">O que fazer com os dados deste número no painel?</p>
      ${aberto ? `<label class="cn-op"><input type="radio" name="cnL" value="manter"><span><b>Manter dados</b><small>Só desconecta o WhatsApp. Mensagens, contatos e grupos continuam aparecendo.</small></span></label>` : ''}
      <label class="cn-op cn-op-rec"><input type="radio" name="cnL" value="ocultar" checked><span><b>Ocultar dados <em>recomendado para trocar de número</em></b><small>${aberto ? 'Desconecta e ' : ''}o painel deixa de mostrar o que veio antes, ficando limpo para um novo número. Nada é apagado do servidor e dá para desfazer em “Mostrar dados de novo”.</small></span></label>
      <label class="cn-op cn-op-perigo"><input type="radio" name="cnL" value="apagar"><span><b>Apagar tudo</b><small>${aberto ? 'Desconecta, ' : ''}apaga mensagens, contatos e registros desta conexão no servidor e recria a conexão zerada com o mesmo nome. Não dá para desfazer.</small></span></label>
      <div id="cnApBox" hidden><label class="cn-lbl" for="cnApConf">Para apagar tudo, digite o nome: <b>${E(i.nome)}</b></label><input id="cnApConf" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${E(i.nome)}"><div class="msg-campo" id="cnApConfM">Digite exatamente o nome acima.</div></div>
      <div class="acoes"><button class="btn-soft" data-f>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-check"></i> Confirmar</button></div>`);
    const radios = ZZ.$$('input[name="cnL"]', s.el), box = ZZ.$('#cnApBox', s.el), inp = ZZ.$('#cnApConf', s.el), msg = ZZ.$('#cnApConfM', s.el), bt = s.el.querySelector('[data-s]');
    const modo = () => (radios.find(r => r.checked) || {}).value || 'ocultar';
    const atualiza = () => {
      const m = modo(); box.hidden = m !== 'apagar';
      bt.className = m === 'apagar' ? 'btn-perigo' : 'btn-azul';
      bt.innerHTML = m === 'apagar' ? '<i class="fa-solid fa-trash"></i> Apagar tudo' : m === 'ocultar' ? '<i class="fa-solid fa-eye-slash"></i> Ocultar dados' : '<i class="fa-solid fa-link-slash"></i> Desconectar';
      bt.disabled = m === 'apagar' && inp.value.trim() !== i.nome;
      ZZ.$$('.cn-op', s.el).forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
    };
    radios.forEach(r => r.onchange = () => { atualiza(); if (modo() === 'apagar') inp.focus(); });
    inp.oninput = () => { const ok = inp.value.trim() === i.nome; inp.classList.toggle('erro-campo', !ok && inp.value !== ''); msg.textContent = ok ? 'Nome confere.' : 'Digite exatamente o nome acima.'; msg.classList.toggle('cn-ok', ok); atualiza(); };
    s.el.querySelector('[data-f]').onclick = () => s.fechar();
    atualiza();
    bt.onclick = async () => {
      const m = modo();
      const texto = m === 'manter' ? `Desconectar “${nomeBonito(i)}” mantendo os dados?` : m === 'ocultar' ? `Ocultar os dados de “${nomeBonito(i)}”${aberto ? ' e desconectar' : ''}? Dá para mostrar de novo depois.` : `APAGAR TUDO de “${nomeBonito(i)}”? Mensagens, contatos e registros serão apagados do servidor. Não dá para desfazer.`;
      if (!await confirmar(texto, m === 'apagar' ? 'Sim, apagar tudo' : 'Confirmar', m === 'apagar')) return;
      const r = await ZZ.busy(bt, async () => ZZ.api('instancia_desconectar', { corpo: { nome: i.nome, limpeza: m, confirmar: m === 'apagar' ? inp.value.trim() : undefined } }));
      if (r && r.ok) {
        ZZ.toast(r.msg || 'Pronto', 'ok'); s.fechar(); assinatura = ''; await ZZ.recarregarInstancias(); await carregar(true);
        if (m === 'apagar') abrirQr(i, r.qr);
      }
    };
  }
  async function mostrarDados(i, btn) {
    if (!await confirmar(`Mostrar de novo os dados de “${nomeBonito(i)}”? Mensagens e contatos anteriores voltam a aparecer no painel.`, 'Mostrar dados', false)) return;
    const r = await ZZ.busy(btn, async () => ZZ.api('desfazer_ocultar', { corpo: { nome: i.nome } }));
    if (r && r.ok) { ZZ.toast(r.msg || 'Dados visíveis de novo', 'ok'); assinatura = ''; await carregar(true); }
  }

  /* ---------- sincronização: "Baixando seus dados…" ---------- */
  let asParar = null;
  const ETAPAS = [['perfil', 'Perfil e recado', 'fa-user'], ['contatos', 'Contatos e fotos', 'fa-address-book'], ['grupos', 'Grupos', 'fa-users'], ['conversas', 'Conversas', 'fa-comments'], ['historico', 'Histórico de mensagens', 'fa-clock-rotate-left'], ['midias', 'Mídias', 'fa-photo-film']];
  const fmtMB = b => (b / 1048576).toFixed(b > 10485760 ? 0 : 1).replace('.', ',') + ' MB';
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  function resumoSync(i) {
    const y = i.sync; if (!y) return '';
    let h = '';
    if (y.estado === 'rodando') h = `<div class="cn-sync"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Sincronizando os dados deste número…</span></div>`;
    else if (y.fim) { const r = y.resumo || {}; h = `<div class="cn-sync"><i class="fa-solid fa-cloud-arrow-down"></i><span><b>Última sincronização:</b> ${E(ZZ.fmtDataHora(y.fim))} · ${num(r.contatos)} contatos · ${num(r.grupos)} grupos · ${num(r.conversas)} conversas · ${num(r.mensagens)} mensagens${y.estado === 'erro' ? ' (com falhas)' : ''}</span></div>`; }
    const m = y.midias || {};
    if (m.ativo) h += `<div class="cn-sync cn-sync-mid"><i class="fa-solid fa-photo-film"></i><span>Baixando mídias: ${num(m.feitas)} de ${num(m.total)} (${fmtMB(m.bytes || 0)})<div class="barra-prog"><i style="width:${m.total ? Math.min(100, (m.feitas + m.falhas) / m.total * 100) : 0}%"></i></div></span>${ZZ.pode('conexoes.qr') ? '<button class="btn-soft btn-sm" data-a="cancelarmid">Cancelar</button>' : ''}</div>`;
    else if (m.total && m.feitas) h += `<div class="cn-sync"><i class="fa-solid fa-photo-film"></i><span>${num(m.feitas)} mídias baixadas (${fmtMB(m.bytes || 0)})${m.cancelado ? ' · cancelado' : ''}${m.limite ? ' · limite de 500 MB atingido' : ''}</span></div>`;
    return h;
  }
  async function cancelarMidias(i, btn) {
    if (!await confirmar('Cancelar o download das mídias? As já baixadas continuam salvas.', 'Cancelar download', true)) return;
    const r = await ZZ.busy(btn, async () => ZZ.api('cancelar_midias', { corpo: { nome: i.nome } }));
    if (r && r.ok) { ZZ.toast(r.msg || 'Cancelado', 'ok'); assinatura = ''; carregar(true); }
  }
  /** Desenha e acompanha a sincronização dentro de `corpo` (dispara a sincronização se `iniciar`). Devolve função de parada. */
  function assistente(corpo, inst, { iniciar = true, dias = null, aoFim = null } = {}) {
    if (asParar) asParar();
    let parar = false, base = 0, ultimo = null, cheio = false, erroRede = 0, timer = 0, terminouUmaVez = false;
    corpo.innerHTML = `<div class="cn-as"><div class="cn-as-topo"><span class="cn-as-ic"><i class="fa-solid fa-cloud-arrow-down"></i></span><div><h3>Baixando seus dados…</h3><p id="cnAsSub">Preparando…</p></div></div>
      <div class="barra-prog cn-as-barra"><i id="cnAsBarra" style="width:2%"></i></div><ol class="cn-etapas" id="cnEtapas"></ol><div id="cnAsFim"></div></div>`;
    const sub = ZZ.$('#cnAsSub', corpo), barra = ZZ.$('#cnAsBarra', corpo), ol = ZZ.$('#cnEtapas', corpo), fim = ZZ.$('#cnAsFim', corpo);
    function pintar(st) {
      const et = (st && st.etapas) || {}; let feitas = 0, rodando = '';
      ol.innerHTML = ETAPAS.map(([id, rot, ic]) => {
        const e = et[id] || { estado: 'pend' }; const est = e.estado;
        if (est === 'ok' || est === 'pulado' || est === 'erro') feitas++; if (est === 'rodando') rodando = rot;
        const icone = est === 'ok' ? 'fa-circle-check' : est === 'erro' ? 'fa-circle-xmark' : est === 'rodando' ? 'fa-circle-notch fa-spin' : est === 'pulado' ? 'fa-circle-minus' : 'fa-circle';
        let det = '';
        if (est === 'ok') det = id === 'midias' ? `${num(e.n)} na fila` : id === 'historico' ? `${num(e.n)} mensagens` : `${num(e.n)}`;
        else if (est === 'rodando' && id === 'historico' && e.n) det = `${num(e.n)} mensagens chegando…`;
        else if (est === 'rodando') det = 'baixando…'; else if (est === 'pulado') det = 'não solicitado'; else if (est === 'erro') det = 'falhou';
        return `<li class="cn-et cn-et-${est}"><i class="fa-solid ${ic} cn-et-ic"></i><span>${E(rot)}</span><small>${E(det)}</small><i class="fa-solid ${icone} cn-et-st"></i></li>`;
      }).join('');
      const pct = st && st.estado !== 'rodando' && st.fim ? 100 : Math.max(3, Math.round((feitas + (rodando ? .4 : 0)) / ETAPAS.length * 100));
      barra.style.width = pct + '%';
      sub.textContent = !st ? 'Preparando…' : st.estado === 'rodando' ? (rodando ? rodando + '… ' + pct + '%' : pct + '%') : st.estado === 'ok' ? 'Tudo pronto!' : 'Terminou com algumas falhas.';
    }
    function pintarFim(j) {
      const st = j.sync || {}, r = st.resumo || {}, m = st.midias || {}, p = r.perfil || {};
      const mid = m.ativo ? `<div class="cn-as-mid"><div class="cn-as-midt"><b><i class="fa-solid fa-photo-film"></i> Baixando mídias em segundo plano</b><span>${num(m.feitas)} de ${num(m.total)} · ${fmtMB(m.bytes || 0)}</span></div><div class="barra-prog"><i style="width:${m.total ? Math.min(100, (m.feitas + m.falhas) / m.total * 100) : 0}%"></i></div>
        <button class="btn-soft btn-sm" data-cm>Cancelar download</button></div>` : '';
      const opc = (!m.ativo && ZZ.pode('conexoes.qr') && (st.estado === 'ok' || st.estado === 'erro')) ? `<div class="cn-as-opc"><label for="cnAsDias"><b>Baixar também as mídias</b><small>Fotos, vídeos, áudios e documentos recentes (até 500 MB). Roda em segundo plano.</small></label><div class="cn-as-linha"><select id="cnAsDias"><option value="7">últimos 7 dias</option><option value="15">últimos 15 dias</option><option value="30">últimos 30 dias</option></select><button class="btn-acao" data-md><i class="fa-solid fa-download"></i> Baixar</button></div></div>` : '';
      fim.innerHTML = `${st.estado === 'rodando' ? '' : `<div class="cn-as-res"><div><b>${num(r.contatos)}</b><span>contatos</span></div><div><b>${num(r.grupos)}</b><span>grupos</span></div><div><b>${num(r.conversas)}</b><span>conversas</span></div><div><b>${num(r.mensagens)}</b><span>mensagens</span></div></div>
        ${p.nome || p.numero ? `<p class="cn-as-perfil"><i class="fa-solid fa-user-check"></i> ${E(p.nome || '')} ${p.numero ? '· ' + E(ZZ.fmtNumero(p.numero)) : ''}${p.foto ? ' · foto ✓' : ''}${p.recado ? ' · recado ✓' : ''}</p>` : ''}`}${mid}${opc}`;
      const cm = fim.querySelector('[data-cm]'); if (cm) cm.onclick = () => cancelarMidias(inst, cm).then(() => { ultimo = null; });
      const md = fim.querySelector('[data-md]'); if (md) md.onclick = () => { const d = Number(ZZ.$('#cnAsDias', fim).value); ZZ.toast('Baixando mídias dos últimos ' + d + ' dias…', 'ok'); parar = true; clearTimeout(timer); assistente(corpo, inst, { iniciar: true, dias: d, aoFim }); };
    }
    async function ciclo() {
      if (parar) return;
      const j = await ZZ.api('ver_sincronizacao', { params: { nome: inst.nome }, silencioso: true });
      if (parar) return;
      if (!j || !j.ok) { if (++erroRede > 5) { sub.textContent = 'Sem conexão com o servidor. Tentando de novo…'; } timer = setTimeout(ciclo, 3000); return; }
      erroRede = 0; const st = j.sync;
      const valido = st && (cheio || (st.inicio || 0) >= base);
      pintar(valido ? st : null); if (valido) { ultimo = j; pintarFim(j); }
      const m = valido && st.midias || {};
      if (valido && st.estado !== 'rodando') {
        if (!terminouUmaVez) { terminouUmaVez = true; ZZ.vibrar(15); assinatura = ''; carregar(true); if (aoFim) aoFim(j); }
        if (!m.ativo) return; // nada mais a acompanhar
        timer = setTimeout(ciclo, 3000); return;
      }
      timer = setTimeout(ciclo, 1500);
    }
    (async () => {
      const j0 = await ZZ.api('ver_sincronizacao', { params: { nome: inst.nome }, silencioso: true });
      base = (j0 && j0.agora ? j0.agora : Math.floor(Date.now() / 1000)) - 1;
      if (iniciar) {
        ZZ.api('sincronizar_conexao', { corpo: Object.assign({ nome: inst.nome }, dias === null ? {} : { midias_dias: dias }), silencioso: true }).then(j => {
          if (parar) return;
          if (j && j.ok && j.ja_rodando) cheio = true;
          else if (!j || !j.ok) { sub.textContent = (j && j.msg) || 'Não foi possível sincronizar agora.'; barra.style.background = 'var(--verm)'; fim.innerHTML = `<div class="cn-err"><i class="fa-solid fa-triangle-exclamation"></i> ${E((j && j.msg) || 'Falha ao sincronizar.')}</div>`; parar = true; }
        });
      } else cheio = true;
      ciclo();
    })();
    asParar = () => { parar = true; clearTimeout(timer); };
    return () => asParar && asParar();
  }
  function sincronizarAgora(i) {
    if (sheetAtual) sheetAtual.fechar();
    const s = sheet(`<div class="cn-qr-topo"><h3><i class="fa-solid fa-cloud-arrow-down"></i> ${E(nomeBonito(i))}</h3><button class="btn-soft cn-x" data-f aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><div id="cnAsCorpo"></div>`, 'cn-cheia');
    sheetAtual = s; const parar = assistente(ZZ.$('#cnAsCorpo', s.el), i);
    s.aoFechar = () => parar(); s.el.querySelector('[data-f]').onclick = () => s.fechar();
  }

  /* ---------- excluir (digitar o nome) ---------- */
  function excluir(i) {
    const s = sheet(`<h3 class="cn-vermelho"><i class="fa-solid fa-trash"></i> Excluir conexão</h3>
      <p>Isto apaga a conexão <b>${E(nomeBonito(i))}</b> (<code>${E(i.nome)}</code>) do servidor, com o histórico guardado nela. Não dá para desfazer.</p>
      <label class="cn-lbl" for="cnConf">Para confirmar, digite o nome: <b>${E(i.nome)}</b></label>
      <input id="cnConf" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${E(i.nome)}"><div class="msg-campo" id="cnConfM">Digite exatamente o nome acima.</div>
      <div class="acoes"><button class="btn-soft" data-f>Cancelar</button><button class="btn-perigo" data-s disabled><i class="fa-solid fa-trash"></i> Excluir</button></div>`);
    const inp = ZZ.$('#cnConf', s.el), msg = ZZ.$('#cnConfM', s.el), bt = s.el.querySelector('[data-s]');
    s.el.querySelector('[data-f]').onclick = () => s.fechar();
    inp.oninput = () => {
      const ok = inp.value.trim() === i.nome; bt.disabled = !ok;
      inp.classList.toggle('erro-campo', !ok && inp.value !== ''); msg.textContent = ok ? 'Nome confere.' : 'Digite exatamente o nome acima.'; msg.classList.toggle('cn-ok', ok);
    };
    bt.onclick = async () => {
      if (!await confirmar(`Excluir DEFINITIVAMENTE a conexão “${nomeBonito(i)}”?`, 'Excluir para sempre', true)) return;
      const r = await ZZ.busy(bt, async () => ZZ.api('instancia_excluir', { corpo: { nome: i.nome, confirmar: inp.value.trim() } }));
      if (r && r.ok) {
        ZZ.toast('Conexão excluída', 'ok'); s.fechar();
        const eraAtiva = i.nome === ZZ.instancia;
        await ZZ.recarregarInstancias();
        if (eraAtiva && ZZ.instancias && ZZ.instancias[0]) ZZ.trocarInstancia(ZZ.instancias[0].nome); else await carregar(true);
      }
    };
  }

  /* ---------- novo WhatsApp ---------- */
  function abrirNovo() {
    const s = sheet(`<h3><i class="fa-brands fa-whatsapp"></i> Conectar novo WhatsApp</h3>
      <label class="cn-lbl" for="cnApN">Apelido</label><input id="cnApN" maxlength="40" placeholder="Ex.: WhatsApp da loja" autocomplete="off"><div class="msg-campo" id="cnApNM" hidden></div>
      <label class="cn-lbl" for="cnNm">Nome técnico <small>(gerado do apelido; pode editar)</small></label><input id="cnNm" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="whatsapp-da-loja"><div class="msg-campo" id="cnNmM" hidden></div>
      <p class="cn-dica">Só letras, números, “-” e “_” (2 a 40). Depois de criar, você lerá um QR Code com o celular.</p>
      <div class="acoes"><button class="btn-soft" data-f>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-qrcode"></i> Criar e gerar QR</button></div>`);
    const ap = ZZ.$('#cnApN', s.el), nm = ZZ.$('#cnNm', s.el), apM = ZZ.$('#cnApNM', s.el), nmM = ZZ.$('#cnNmM', s.el);
    let editouNome = false; ap.focus();
    const erro = (c, m, t) => { c.classList.add('erro-campo'); m.hidden = false; m.textContent = t; };
    const limpa = (c, m) => { c.classList.remove('erro-campo'); m.hidden = true; };
    const validarNome = () => {
      const v = nm.value;
      if (!REGEX_NOME.test(v)) { erro(nm, nmM, v.length < 2 ? 'Informe ao menos 2 caracteres (letras, números, - ou _).' : 'Use apenas letras, números, - ou _ (2 a 40 caracteres).'); return false; }
      if ((ZZ.instancias || []).some(x => x.nome.toLowerCase() === v.toLowerCase())) { erro(nm, nmM, 'Já existe uma conexão com esse nome técnico.'); return false; }
      limpa(nm, nmM); return true;
    };
    ap.oninput = () => { limpa(ap, apM); if (!editouNome) { nm.value = slug(ap.value); if (nm.value) validarNome(); else limpa(nm, nmM); } };
    nm.oninput = () => { editouNome = true; if (nm.value) validarNome(); else limpa(nm, nmM); };
    s.el.querySelector('[data-f]').onclick = () => s.fechar();
    const criar = () => ZZ.busy(s.el.querySelector('[data-s]'), async () => {
      if (!ap.value.trim()) { erro(ap, apM, 'Dê um apelido para reconhecer este WhatsApp.'); ap.focus(); return false; }
      if (!nm.value) nm.value = slug(ap.value);
      if (!validarNome()) { nm.focus(); return false; }
      const j = await ZZ.api('instancia_criar', { corpo: { nome: nm.value, apelido: ap.value.trim() } });
      if (!j.ok) return j;
      ZZ.toast('Conexão criada. Leia o QR Code.', 'ok'); s.fechar();
      await ZZ.recarregarInstancias(); assinatura = ''; carregar(true);
      abrirQr({ nome: j.nome, apelido: ap.value.trim() }, j.qr, j.codigo);
      return j;
    });
    s.el.querySelector('[data-s]').onclick = criar;
    [ap, nm].forEach(x => x.onkeydown = e => { if (e.key === 'Enter') criar(); });
  }

  /* ---------- QR em tela cheia com autoatualização ---------- */
  const QR_VALE = 25, COD_VALE = 50;
  function abrirQr(inst, qrIni, codIni) {
    if (sheetAtual) sheetAtual.fechar();
    const s = sheet(`<div class="cn-qr-topo"><h3><i class="fa-brands fa-whatsapp"></i> ${E(nomeBonito(inst))}</h3><button class="btn-soft cn-x" data-f aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="cn-qr-corpo" id="cnQrCorpo"></div>`, 'cn-cheia');
    sheetAtual = s;
    const corpo = ZZ.$('#cnQrCorpo', s.el);
    let modo = 'qr', qr = qrIni || '', codigo = codIni || '', gerouEm = Date.now(), ocupado = false, tick = 0, terminou = false, erroMsg = '', gerando = !qrIni;
    const t = setInterval(passo, 1000);
    s.aoFechar = () => { terminou = true; clearInterval(t); };
    s.el.querySelector('[data-f]').onclick = () => s.fechar();

    function vale() { return modo === 'codigo' ? COD_VALE : QR_VALE; }
    function pintar() {
      if (terminou) return;
      const resta = Math.max(0, vale() - Math.floor((Date.now() - gerouEm) / 1000));
      const barra = `<div class="cn-tempo"><div class="barra-prog"><i id="cnBarra" style="width:${(resta / vale()) * 100}%"></i></div><small id="cnRelogio">${gerando ? 'Gerando novo código…' : 'Atualiza em ' + resta + ' s'}</small></div>`;
      const passos = `<ol class="cn-passos"><li>Abra o <b>WhatsApp</b> no celular</li><li>Toque em <b>Configurações › Aparelhos conectados</b></li><li>Toque em <b>Conectar um aparelho</b></li><li>${modo === 'qr' ? 'Aponte a câmera para este QR Code' : 'Escolha “Conectar com número de telefone” e digite o código abaixo'}</li></ol>`;
      let centro;
      if (modo === 'qr') centro = qr ? `<img class="cn-qr-img ${gerando ? 'cn-vel' : ''}" src="${E(imgQr(qr))}" alt="QR Code para conectar o WhatsApp">` : `<div class="skel cn-qr-sk"></div>`;
      else centro = codigo ? `<div class="cn-cod ${gerando ? 'cn-vel' : ''}">${E(String(codigo).replace(/^(.{4})(.+)$/, '$1-$2'))}</div>` : `<div class="skel cn-cod-sk"></div>`;
      corpo.innerHTML = `<div class="cn-abas"><button class="${modo === 'qr' ? 'on' : ''}" data-m="qr"><i class="fa-solid fa-qrcode"></i> QR Code</button><button class="${modo === 'codigo' ? 'on' : ''}" data-m="codigo"><i class="fa-solid fa-hashtag"></i> Por código</button></div>
        ${modo === 'codigo' ? `<div class="cn-num"><input id="cnNum" inputmode="tel" placeholder="DDI+DDD+número, ex.: 5582999999999" autocomplete="off" value="${E(numero)}"><button class="btn-azul" id="cnNumBt">Gerar código</button></div><div class="msg-campo" id="cnNumM" hidden></div>` : ''}
        <div class="cn-centro">${centro}</div>
        ${erroMsg ? `<div class="cn-err"><i class="fa-solid fa-triangle-exclamation"></i> ${E(erroMsg)} <button class="btn-soft btn-sm" id="cnRe">Tentar de novo</button></div>` : ''}
        ${modo === 'qr' || codigo ? barra : ''}
        <div class="cn-aguarda"><i class="fa-solid fa-circle-notch fa-spin"></i> Aguardando a leitura… esta tela atualiza sozinha.</div>${passos}`;
      ZZ.$$('[data-m]', corpo).forEach(b => b.onclick = () => { modo = b.dataset.m; erroMsg = ''; if (modo === 'qr') { qr = ''; gerar(); } pintar(); });
      const nb = ZZ.$('#cnNumBt', corpo); if (nb) { nb.onclick = () => gerar(true); ZZ.$('#cnNum', corpo).onkeydown = e => { if (e.key === 'Enter') gerar(true); }; ZZ.$('#cnNum', corpo).oninput = e => { numero = e.target.value; }; }
      const re = ZZ.$('#cnRe', corpo); if (re) re.onclick = () => { erroMsg = ''; gerar(modo === 'codigo'); };
    }
    let numero = '';
    function atualizarRelogio() {
      const resta = Math.max(0, vale() - Math.floor((Date.now() - gerouEm) / 1000));
      const b = ZZ.$('#cnBarra', corpo), r = ZZ.$('#cnRelogio', corpo);
      if (b) b.style.width = (resta / vale() * 100) + '%'; if (r) r.textContent = gerando ? 'Gerando novo código…' : 'Atualiza em ' + resta + ' s';
    }
    async function gerar(manual) {
      if (ocupado || terminou) return;
      const corpoReq = { nome: inst.nome };
      if (modo === 'codigo') {
        const n = numero.replace(/\D/g, ''); const m = ZZ.$('#cnNumM', corpo);
        if (n.length < 10) { if (m) { m.hidden = false; m.textContent = 'Digite o número completo com DDI e DDD (ex.: 5582999999999).'; ZZ.$('#cnNum', corpo).classList.add('erro-campo'); ZZ.$('#cnNum', corpo).focus(); } return; }
        corpoReq.numero = n;
      }
      ocupado = true; gerando = true; atualizarRelogio();
      const j = await ZZ.api('instancia_qr', { corpo: corpoReq, silencioso: true });
      ocupado = false; gerando = false; if (terminou) return;
      if (j && j.ok && j.estado === 'open') { conectou(); return; }
      if (j && j.ok) { if (modo === 'qr') { if (j.qr) qr = j.qr; } else { codigo = j.codigo || codigo; if (j.qr) qr = j.qr; } gerouEm = Date.now(); erroMsg = (modo === 'codigo' ? !j.codigo : !j.qr) ? 'O servidor ainda não devolveu o código. Tentando de novo…' : ''; if (erroMsg) gerouEm = Date.now() - (vale() - 4) * 1000; if (manual) ZZ.toast(modo === 'codigo' ? 'Código gerado' : 'QR atualizado', 'ok'); }
      else erroMsg = (j && j.msg) || 'Não foi possível gerar agora.';
      pintar();
    }
    async function passo() {
      if (terminou) return;
      tick++; atualizarRelogio();
      const idade = (Date.now() - gerouEm) / 1000;
      if (!ocupado && !erroMsg && idade >= vale() && (modo === 'qr' || codigo)) gerar();
      if (tick % 3 === 0 && !ocupado) {
        const j = await ZZ.api('instancias', { params: { atualizar: 1 }, silencioso: true });
        if (terminou || !j || !j.ok) return;
        const x = j.itens.find(i => i.nome === inst.nome);
        if (!x) { s.fechar(); return; }
        if (x.estado === 'open') conectou(x);
      }
    }
    function conectou(x) {
      if (terminou) return; terminou = true; clearInterval(t); ZZ.vibrar([20, 40, 20]);
      ZZ.toast('WhatsApp conectado com sucesso!', 'ok');
      ZZ.recarregarInstancias(); assinatura = ''; carregar(true);
      corpo.innerHTML = `<div class="cn-sucesso cn-sucesso-mini"><div class="cn-check"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none"/><path fill="none" d="M14 27l8 8 16-17"/></svg></div>
        <h3>Conectado!</h3><p>${E(nomeBonito(inst))}${x && x.numero ? ' · ' + E(ZZ.fmtNumero(x.numero)) : ''}</p></div><div id="cnAsCorpo"></div>
        <div class="acoes cn-acoes"><button class="btn-soft" data-d>Fechar</button><button class="btn-azul" data-u><i class="fa-solid fa-check"></i> Usar esta conexão</button></div>`;
      const pararAs = assistente(ZZ.$('#cnAsCorpo', corpo), inst, { iniciar: ZZ.pode('conexoes.qr') });
      const antes = s.aoFechar; s.aoFechar = () => { pararAs(); antes && antes(); };
      s.el.querySelector('[data-d]').onclick = () => s.fechar();
      s.el.querySelector('[data-u]').onclick = () => { s.fechar(); ZZ.trocarInstancia(inst.nome); };
    }
    pintar();
    if (!qr) gerar();
  }

  /* ---------- início ---------- */
  carregar(true);
  ZZ.poll(() => carregar(false), 6000);
  this.destroy = () => { vivo = false; if (asParar) asParar(); if (sheetAtual) sheetAtual.fechar(); };
}, destroy() { } });
