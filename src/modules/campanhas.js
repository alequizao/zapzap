/* ZapZap — Campanhas e Listas (prefixo cp-). Mobile-first. Envio em massa com confirmação forte anti-bloqueio. */
(function () {
  'use strict';
  const ZZ = window.ZZ;
  const h = ZZ.esc;
  const PADRAO = { intervalo_min_s: 20, intervalo_max_s: 60, limite_dia: 200, janela_inicio: 8, janela_fim: 20 };
  const ST = {
    rascunho: ['Rascunho', 'fa-pen', 'b-info'], pronta: ['Pronta', 'fa-circle-check', 'b-info'], agendada: ['Agendada', 'fa-clock', 'b-pend'],
    rodando: ['Enviando', 'fa-paper-plane', 'b-ok'], enviando: ['Enviando', 'fa-paper-plane', 'b-ok'], pausada: ['Pausada', 'fa-pause', 'b-pausa'],
    espera: ['Fora do horário', 'fa-moon', 'b-pend'], concluida: ['Concluída', 'fa-check-double', 'b-ok'], cancelada: ['Cancelada', 'fa-ban', 'b-err'], erro: ['Com erro', 'fa-triangle-exclamation', 'b-err']
  };
  const normC = (c, j) => { const p = (j && j.progresso) || {}; return { ...c, pulados: p.ignorados != null ? p.ignorados : num(c.pulados), pendentes: c.status === 'rascunho' ? num(c.total) : (p.pendentes != null ? p.pendentes : c.pendentes), estimativa: j && j.estimativa, avisos: j && j.avisos }; };
  const stInfo = s => ST[s] || [s || '—', 'fa-circle', 'b-info'];
  const envSt = s => ({ enviada: 'enviado', enviado: 'enviado', ok: 'enviado', ignorado: 'pulado', erro: 'falha', falha: 'falha', falhou: 'falha', pulado: 'pulado', pulada: 'pulado', optout: 'pulado', pendente: 'pendente', fila: 'pendente' }[s] || s || 'pendente');
  const ENV_ROT = { enviado: ['Enviado', 'b-ok', 'fa-check'], falha: ['Falhou', 'b-err', 'fa-xmark'], pendente: ['Na fila', 'b-pend', 'fa-hourglass-half'], pulado: ['Pulado', 'b-pausa', 'fa-forward'] };
  const num = n => Number(n || 0);
  const fmtN = n => num(n).toLocaleString('pt-BR');
  const fmtDur = s => { s = Math.max(0, Math.round(s)); if (s < 60) return s + ' s'; const m = Math.round(s / 60); if (m < 60) return m + ' min'; const hh = Math.floor(m / 60), mm = m % 60; return hh + ' h' + (mm ? ' ' + mm + ' min' : ''); };
  const nomeUsuario = () => (ZZ.eu && ZZ.eu.usuario && ZZ.eu.usuario.nome) || 'Seu Nome';
  const pct = c => { const t = num(c.total); return t ? Math.min(100, Math.round((num(c.enviados) + num(c.falhas) + num(c.pulados)) / t * 100)) : 0; };
  const pendentes = c => c.pendentes != null ? num(c.pendentes) : Math.max(0, num(c.total) - num(c.enviados) - num(c.falhas) - num(c.pulados));
  const eta = c => {
    if (!['rodando', 'enviando', 'espera'].includes(c.status)) return '';
    const p = pendentes(c); if (!p) return '';
    const s = c.eta != null ? num(c.eta) : p * ((num(c.intervalo_min_s) + num(c.intervalo_max_s)) / 2 || 40);
    return 'faltam ~' + fmtDur(s);
  };
  const balao = txt => h(txt).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>');
  const erroCartao = (msg, fn) => { const d = document.createElement('div'); d.className = 'card-soft vazio'; d.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><div>${h(msg)}</div><button class="btn-azul" style="margin-top:12px"><i class="fa-solid fa-rotate-right"></i> Tentar de novo</button>`; ZZ.$('button', d).onclick = fn; return d; };
  const cont = (el, to) => { // contador animado
    to = num(to); const de = num(el.dataset.v || 0); if (de === to) { el.textContent = fmtN(to); return; }
    el.dataset.v = to; const t0 = performance.now(); el.classList.add('cp-pulso'); setTimeout(() => el.classList.remove('cp-pulso'), 700);
    const passo = t => { const k = Math.min(1, (t - t0) / 450); el.textContent = fmtN(Math.round(de + (to - de) * k)); if (k < 1) requestAnimationFrame(passo); }; requestAnimationFrame(passo);
  };
  const campoErro = (inp, msg) => {
    inp.classList.add('erro-campo'); const m = document.createElement('div'); m.className = 'msg-campo'; m.textContent = msg;
    (inp.closest('.cp-cmp') || inp).after(m); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); try { inp.focus({ preventScroll: true }); } catch (e) { }
    const lim = () => { inp.classList.remove('erro-campo'); m.remove(); inp.removeEventListener('input', lim); }; inp.addEventListener('input', lim);
  };
  const limpaErros = raiz => { ZZ.$$('.msg-campo', raiz).forEach(x => x.remove()); ZZ.$$('.erro-campo', raiz).forEach(x => x.classList.remove('erro-campo')); };

  /* ---------- número / importação ---------- */
  const normNum = s => { let d = String(s || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return (d.length >= 12 && d.length <= 15) ? d : ''; };
  function analisar(texto, existentes) {
    const vistos = new Set(existentes || []); const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const itens = []; let ini = 0, cabecalho = '';
    if (linhas.length && !/\d{8}/.test(linhas[0].replace(/\D/g, '')) && /nome|name|telefone|n[uú]mero|numero|phone|celular|whatsapp/i.test(linhas[0])) { ini = 1; cabecalho = linhas[0]; }
    for (let i = ini; i < linhas.length; i++) {
      const l = linhas[i]; const partes = l.split(/[;\t,|]/).map(p => p.trim()).filter(Boolean);
      let numero = '', nome = '', bruto = '';
      for (const p of partes) { if (!bruto && /^[\d\s().+-]{8,}$/.test(p)) { bruto = p; numero = normNum(p); } else if (!nome && /[a-zA-ZÀ-ÿ]/.test(p)) nome = p; }
      if (!bruto) { const m = l.match(/\+?\d[\d\s().-]{7,}\d/); if (m) { bruto = m[0]; numero = normNum(m[0]); nome = l.replace(m[0], '').replace(/[;,|\t]/g, ' ').trim(); } }
      let st = 'ok';
      if (!numero) st = 'invalido'; else if (vistos.has(numero)) st = 'duplicado'; else vistos.add(numero);
      itens.push({ linha: i + 1, bruto: bruto || l, original: l, numero, nome: nome.slice(0, 80), st, incluir: st === 'ok' });
    }
    return { itens, cabecalho };
  }

  /* ---------- upload com progresso (XHR) ---------- */
  function enviarForm(acao, fd, aoProgresso) {
    return new Promise(res => {
      const x = new XMLHttpRequest(); x.open('POST', 'api.php?a=' + encodeURIComponent(acao));
      const cab = ZZ.cabecalhos(); Object.keys(cab).forEach(k => x.setRequestHeader(k, cab[k]));
      x.upload.onprogress = e => { if (e.lengthComputable && aoProgresso) aoProgresso(e.loaded / e.total); };
      x.onload = () => { let j; try { j = JSON.parse(x.responseText); } catch (e) { j = { ok: false, msg: 'Resposta inválida do servidor' }; } if (!j.ok && j.msg) ZZ.toast(j.msg, 'err'); res(j); };
      x.onerror = () => { ZZ.toast('Sem conexão com o servidor', 'err'); res({ ok: false, msg: 'Sem conexão' }); };
      x.send(fd);
    });
  }

  /* =====================================================================
     Página
  ===================================================================== */
  let limpeza = [];
  const limpa = () => { limpeza.forEach(f => { try { f(); } catch (e) { } }); limpeza = []; };

  ZZ.pagina({
    id: 'campanhas', titulo: 'Campanhas', icone: 'fa-bullhorn', ordem: 4.7, tab: false, perm: 'campanhas.ver',
    destroy: limpa,
    render(el, ctx) {
      limpa();
      const podeCriar = ZZ.pode('campanhas.criar'), podeIniciar = ZZ.pode('campanhas.iniciar');
      const P = ctx.params || {};
      let aba = P.aba === 'listas' ? 'listas' : 'campanhas';
      if (P.c) return detalhe(el, P.c, P.f || '', podeCriar, podeIniciar);

      el.innerHTML = `
      <div class="cp-topo">
        <div class="cp-abas" role="tablist"><button data-a="campanhas" role="tab"><i class="fa-solid fa-bullhorn"></i> Campanhas</button><button data-a="listas" role="tab"><i class="fa-solid fa-list-ul"></i> Listas</button></div>
        ${podeCriar ? '<button class="btn-azul cp-novo" id="cpNovo"><i class="fa-solid fa-plus"></i> <span id="cpNovoT"></span></button>' : ''}
      </div>
      <div id="cpCorpo"></div>`;
      const corpo = ZZ.$('#cpCorpo', el);
      const pinta = () => {
        limpa();
        ZZ.$$('.cp-abas button', el).forEach(b => b.classList.toggle('ativo', b.dataset.a === aba));
        const t = ZZ.$('#cpNovoT', el); if (t) t.textContent = aba === 'campanhas' ? 'Nova campanha' : 'Nova lista';
        if (aba === 'campanhas') telaCampanhas(corpo, podeCriar, podeIniciar); else telaListas(corpo, podeCriar);
      };
      ZZ.$$('.cp-abas button', el).forEach(b => b.onclick = () => { if (aba !== b.dataset.a) { aba = b.dataset.a; pinta(); } });
      const nv = ZZ.$('#cpNovo', el);
      if (nv) nv.onclick = () => aba === 'campanhas' ? assistente(null, () => pinta()) : editorLista(null, () => pinta());
      pinta();
    }
  });

  /* ---------- Campanhas: lista de cards ---------- */
  function cartaoCampanha(c, podeCriar, podeIniciar) {
    const [rot, ic, cls] = stInfo(c.status); const p = pct(c); const t = num(c.total);
    const rodando = ['rodando', 'enviando'].includes(c.status);
    const acoes = [];
    if (podeIniciar) {
      if (['rascunho', 'pronta', 'agendada'].includes(c.status)) acoes.push(`<button class="btn-azul btn-sm" data-ac="iniciar"><i class="fa-solid fa-play"></i> Iniciar</button>`);
      if (rodando) acoes.push(`<button class="btn-soft btn-sm" data-ac="pausar"><i class="fa-solid fa-pause"></i> Pausar</button>`);
      if (c.status === 'pausada') acoes.push(`<button class="btn-azul btn-sm" data-ac="retomar"><i class="fa-solid fa-play"></i> Retomar</button>`);
      if (['rodando', 'enviando', 'pausada', 'espera', 'agendada'].includes(c.status)) acoes.push(`<button class="btn-perigo btn-sm" data-ac="cancelar"><i class="fa-solid fa-ban"></i> Cancelar</button>`);
    }
    if (podeCriar && ['rascunho', 'pronta'].includes(c.status)) acoes.push(`<button class="btn-soft btn-sm" data-ac="editar"><i class="fa-solid fa-pen"></i> Editar</button>`);
    if (podeCriar && ['rascunho', 'concluida', 'cancelada'].includes(c.status)) acoes.push(`<button class="btn-perigo btn-sm" data-ac="excluir" aria-label="Excluir"><i class="fa-solid fa-trash"></i></button>`);
    const e = eta(c);
    return `<div class="cp-card cp-s-${h(c.status)}" data-id="${h(c.id)}">
      <div class="cp-card-topo" data-ac="abrir"><div class="cp-card-tit"><b>${h(c.nome || 'Sem nome')}</b><small class="mut"><i class="fa-solid fa-list-ul"></i> ${h(c.lista_nome || 'Lista')} · ${c.tipo === 'midia' ? 'mídia' : 'texto'}</small></div><span class="badge-status ${cls} ${rodando ? 'cp-anim' : ''}"><i class="fa-solid ${ic}"></i> ${h(rot)}</span></div>
      ${c.status === 'rascunho' ? `<div class="cp-rasc" data-ac="abrir"><i class="fa-solid fa-pen-ruler"></i> Rascunho — revise e inicie quando estiver pronto.</div>` : `<div class="cp-prog" data-ac="abrir"><div class="cp-barra ${rodando ? 'cp-rod' : ''}"><i class="cp-b-ok" style="width:${t ? Math.min(100, num(c.enviados) / t * 100) : 0}%"></i><i class="cp-b-err" style="width:${t ? Math.min(100, num(c.falhas) / t * 100) : 0}%"></i></div>
        <div class="cp-prog-txt"><span><b>${fmtN(num(c.enviados))}</b> / ${fmtN(t)} enviados · ${p}%</span><span class="mut">${h(e || (c.status === 'pausada' && c.pausa_motivo ? c.pausa_motivo : ''))}</span></div></div>`}
      ${c.status === 'agendada' && c.agendada_para ? `<div class="cp-rasc"><i class="fa-solid fa-clock"></i> Começa em ${h(ZZ.fmtDataHora(c.agendada_para))}</div>` : ''}
      ${c.status === 'rascunho' ? '' : `<div class="cp-cont">
        <button data-f="enviado"><b>${fmtN(c.enviados)}</b><small>enviados</small></button>
        <button data-f="falha" class="${num(c.falhas) ? 'cp-c-err' : ''}"><b>${fmtN(c.falhas)}</b><small>falhas</small></button>
        <button data-f="pendente"><b>${fmtN(pendentes(c))}</b><small>na fila</small></button>
        ${num(c.pulados) ? `<button data-f="pulado"><b>${fmtN(c.pulados)}</b><small>pulados</small></button>` : ''}
      </div>`}
      ${acoes.length ? `<div class="cp-acoes">${acoes.join('')}</div>` : ''}</div>`;
  }

  async function acaoCampanha(ac, c, btn, aoFim) {
    const MAP = { pausar: ['pausar_campanha', 'Campanha pausada.'], retomar: ['retomar_campanha', 'Campanha retomada.'], cancelar: ['cancelar_campanha', 'Campanha cancelada.'], excluir: ['excluir_campanha', 'Campanha excluída.'] };
    if (ac === 'iniciar') {
      const v = await ZZ.busy(btn, () => ZZ.api('ver_campanha', { params: { id: c.id } }));
      if (!v || !v.ok) return; const cc = normC(v.campanha, v);
      if (await confirmarInicio(cc, cc.total, v.avisos)) aoFim && aoFim(); return;
    }
    if (ac === 'cancelar' && !(await ZZ.confirmar('Cancelar esta campanha? As mensagens que ainda não foram enviadas NÃO serão mais enviadas e isso não pode ser desfeito.', 'Cancelar campanha', true))) return;
    if (ac === 'excluir' && !(await ZZ.confirmar('Excluir esta campanha e o histórico dos envios dela?', 'Excluir', true))) return;
    const [a, ok] = MAP[ac];
    const r = await ZZ.busy(btn, () => ZZ.api(a, { corpo: { id: c.id } }));
    if (r && r.ok) { ZZ.toast(ok, 'ok'); aoFim && aoFim(r); }
  }

  function telaCampanhas(corpo, podeCriar, podeIniciar) {
    corpo.innerHTML = ZZ.skeleton(3, 'skel-linha cp-skel');
    let ultimo = '', vazioMsg = false, vivo = false;
    const carregar = async (silencioso) => {
      const j = await ZZ.api('listar_campanhas', { silencioso: !!silencioso });
      if (!j.ok) { if (!silencioso) { corpo.innerHTML = ''; corpo.appendChild(erroCartao(j.msg || 'Não foi possível carregar as campanhas.', () => { corpo.innerHTML = ZZ.skeleton(3, 'skel-linha cp-skel'); carregar(); })); } return; }
      const itens = (j.campanhas || []).map(c => normC(c)); const sig = JSON.stringify(itens);
      if (sig === ultimo) return; const primeira = !ultimo; ultimo = sig;
      vivo = itens.some(c => ['rodando', 'enviando', 'espera'].includes(c.status));
      if (!itens.length) { corpo.innerHTML = `<div class="card-soft vazio"><i class="fa-solid fa-bullhorn"></i><div><b>Nenhuma campanha ainda</b></div><div>Crie uma lista de contatos e envie uma mensagem para todos, com segurança.</div>${podeCriar ? '<button class="btn-azul" id="cpVazioNova" style="margin-top:14px"><i class="fa-solid fa-plus"></i> Criar a primeira campanha</button>' : ''}</div>`; const b = ZZ.$('#cpVazioNova', corpo); if (b) b.onclick = () => assistente(null, () => { ultimo = ''; carregar(); }); return; }
      corpo.innerHTML = `${vivo ? '<div class="cp-vivo"><span class="vivo">ao vivo</span></div>' : ''}<div class="cp-grade">${itens.map(c => cartaoCampanha(c, podeCriar, podeIniciar)).join('')}</div>`;
      if (primeira) ZZ.$$('.cp-card', corpo).forEach((x, i) => x.style.animationDelay = (i * 40) + 'ms');
      else ZZ.$$('.cp-card', corpo).forEach(x => x.style.animation = 'none');
      const mapa = Object.fromEntries(itens.map(c => [String(c.id), c]));
      ZZ.$$('.cp-card', corpo).forEach(card => {
        const c = mapa[card.dataset.id];
        ZZ.$$('[data-ac="abrir"]', card).forEach(x => x.onclick = () => ZZ.ir('campanhas', { c: c.id }));
        ZZ.$$('.cp-cont button', card).forEach(b => b.onclick = () => ZZ.ir('campanhas', { c: c.id, f: b.dataset.f }));
        ZZ.$$('.cp-acoes [data-ac]', card).forEach(b => b.onclick = () => {
          if (b.dataset.ac === 'editar') return assistente(c.id, () => { ultimo = ''; carregar(); });
          acaoCampanha(b.dataset.ac, c, b, () => { ultimo = ''; carregar(true); });
        });
      });
    };
    carregar();
    ZZ.poll(() => carregar(true), 3000);
  }

  /* ---------- Confirmação forte de início ---------- */
  function confirmarInicio(c, totalEsperado, avisos) {
    const total = totalEsperado != null ? num(totalEsperado) : num(c.total);
    return new Promise(res => {
      let feito = false;
      const m = ZZ.modal(`<h3><i class="fa-solid fa-triangle-exclamation" style="color:var(--verm)"></i> Confirmar envio em massa</h3>
        <div class="cp-aviso"><b>Atenção:</b> enviar para muitas pessoas de uma vez pode fazer o WhatsApp <b>bloquear o seu número</b>. Envie apenas para quem espera receber sua mensagem e use os limites seguros.</div>
        ${(avisos || []).map(a => `<div class="cp-aviso ${a.nivel === 'info' ? 'cp-aviso-azul' : ''}"><i class="fa-solid ${a.nivel === 'alto' ? 'fa-circle-exclamation' : 'fa-circle-info'}"></i> ${h(a.msg)}</div>`).join('')}
        <p>Campanha <b>${h(c.nome || '')}</b> vai enviar para <b class="cp-grande">${fmtN(total)}</b> ${total === 1 ? 'pessoa' : 'pessoas'}.</p>
        <label for="cpConf">Para liberar, digite o número total de destinatários: <b>${fmtN(total)}</b></label>
        <input type="text" id="cpConf" inputmode="numeric" autocomplete="off" placeholder="Digite ${total}" aria-describedby="cpConfMsg">
        <div class="msg-campo" id="cpConfMsg" hidden></div>
        <div class="acoes"><button class="btn-soft" data-n>Voltar</button><button class="btn-azul" data-s disabled><i class="fa-solid fa-play"></i> Iniciar envio</button></div>`, () => { if (!feito) res(false); });
      const inp = ZZ.$('#cpConf', m.el), bs = ZZ.$('[data-s]', m.el), msg = ZZ.$('#cpConfMsg', m.el);
      inp.oninput = () => { const v = inp.value.replace(/\D/g, ''); const ok = v !== '' && Number(v) === total; bs.disabled = !ok; inp.classList.toggle('erro-campo', v !== '' && !ok); msg.hidden = !(v !== '' && !ok); msg.textContent = 'O número não confere.'; inp.classList.toggle('cp-confok', ok); };
      ZZ.$('[data-n]', m.el).onclick = () => m.fechar();
      bs.onclick = async () => {
        const r = await ZZ.busy(bs, () => ZZ.api('iniciar_campanha', { corpo: { id: c.id, confirmo: true, total_esperado: total } }));
        if (r && r.ok) { feito = true; ZZ.toast('Campanha iniciada! Acompanhe o envio ao vivo.', 'ok'); m.fechar(); res(true); }
        
      };
      setTimeout(() => inp.focus(), 150);
    });
  }

  /* ---------- Detalhe da campanha ---------- */
  function detalhe(el, id, filtro0, podeCriar, podeIniciar) {
    let filtro = filtro0 || '', npag = 1, c = null, ult = '', temMais = false, parado = false;
    el.innerHTML = `<div class="cp-voltar"><button class="btn-soft btn-sm" id="cpVolta"><i class="fa-solid fa-arrow-left"></i> Campanhas</button><span class="vivo" id="cpVivo" hidden>ao vivo</span></div><div id="cpDet">${ZZ.skeleton(3, 'skel-linha cp-skel')}</div>`;
    ZZ.$('#cpVolta', el).onclick = () => ZZ.ir('campanhas');
    const det = ZZ.$('#cpDet', el);
    limpeza.push(() => { parado = true; });

    const montar = () => {
      const [rot, ic, cls] = stInfo(c.status); const rodando = ['rodando', 'enviando'].includes(c.status);
      det.innerHTML = `<div class="cp-card cp-s-${h(c.status)} cp-det-card"><div class="cp-card-topo"><div class="cp-card-tit"><b id="dNome"></b><small class="mut" id="dSub"></small></div><span class="badge-status" id="dBadge"></span></div>
        <div class="cp-prog"><div class="cp-barra" id="dBarra"><i class="cp-b-ok"></i><i class="cp-b-err"></i></div><div class="cp-prog-txt"><span id="dPct"></span><span class="mut" id="dEta"></span></div></div>
        <div class="cp-cont" id="dCont">
          <button data-f=""><b data-k="total">0</b><small>total</small></button><button data-f="enviado"><b data-k="enviados">0</b><small>enviados</small></button>
          <button data-f="falha"><b data-k="falhas">0</b><small>falhas</small></button><button data-f="pendente"><b data-k="pend">0</b><small>na fila</small></button><button data-f="pulado"><b data-k="pulados">0</b><small>pulados</small></button></div>
        <div class="cp-acoes" id="dAcoes"></div></div>
        <div class="card-soft cp-msgbox"><div class="ch"><i class="fa-regular fa-message"></i> Mensagem</div><div class="cp-wa"><div class="cp-bal" id="dMsg"></div></div><div class="cp-limites mut" id="dLim"></div></div>
        <div class="card-soft"><div class="ch"><i class="fa-solid fa-list-check"></i> Envios <span class="cp-filtro-rot" id="dFRot"></span></div>
          <div class="cp-chips" id="dChips"></div><div id="dEnv"></div><div id="dMais" class="cp-mais" hidden><button class="btn-soft">Ver mais</button></div></div>`;
      ZZ.$$('#dCont button', det).forEach(b => b.onclick = () => { filtro = b.dataset.f; npag = 1; ult = ''; pintaFiltro(); carregaEnvios(true); });
      ZZ.$('#dChips', det).innerHTML = [['', 'Todos'], ['enviado', 'Enviados'], ['falha', 'Falhas'], ['pendente', 'Na fila'], ['pulado', 'Pulados']].map(([k, r]) => `<button class="cp-chip" data-f="${k}">${r}</button>`).join('');
      ZZ.$$('#dChips button', det).forEach(b => b.onclick = () => { filtro = b.dataset.f; npag = 1; ult = ''; pintaFiltro(); carregaEnvios(true); });
      ZZ.$('#dMais button', det).onclick = e => { npag++; ult = ''; ZZ.busy(e.currentTarget, () => carregaEnvios(false)); };
      ZZ.$('#dEnv', det).innerHTML = ZZ.skeleton(4);
      pintaFiltro();
    };
    const pintaFiltro = () => {
      ZZ.$$('#dChips button', det).forEach(b => b.classList.toggle('ativo', b.dataset.f === filtro));
      ZZ.$$('#dCont button', det).forEach(b => b.classList.toggle('ativo', b.dataset.f === filtro && filtro !== ''));
    };
    const preenche = () => {
      const [rot, ic, cls] = stInfo(c.status); const rodando = ['rodando', 'enviando'].includes(c.status); const t = num(c.total);
      ZZ.$('#dNome', det).textContent = c.nome || 'Campanha'; ZZ.$('#dSub', det).textContent = (c.lista_nome || 'Lista') + ' · ' + (c.tipo === 'midia' ? 'mídia' : 'texto');
      const b = ZZ.$('#dBadge', det); b.className = 'badge-status ' + cls + (rodando ? ' cp-anim' : ''); b.innerHTML = `<i class="fa-solid ${ic}"></i> ${h(rot)}`;
      const barra = ZZ.$('#dBarra', det); barra.classList.toggle('cp-rod', rodando);
      barra.children[0].style.width = (t ? Math.min(100, num(c.enviados) / t * 100) : 0) + '%'; barra.children[1].style.width = (t ? Math.min(100, num(c.falhas) / t * 100) : 0) + '%';
      ZZ.$('#dPct', det).innerHTML = `<b>${fmtN(c.enviados)}</b> / ${fmtN(t)} enviados · ${pct(c)}%` + (num(c.falhas) ? ` · <span style="color:var(--verm)">${fmtN(c.falhas)} falhas</span>` : '');
      ZZ.$('#dEta', det).textContent = eta(c) || (c.status === 'pausada' && c.pausa_motivo ? c.pausa_motivo : '');
      const vals = { total: t, enviados: c.enviados, falhas: c.falhas, pend: pendentes(c), pulados: c.pulados };
      ZZ.$$('#dCont [data-k]', det).forEach(x => cont(x, vals[x.dataset.k]));
      ZZ.$('#dCont [data-k="pulados"]', det).closest('button').hidden = !num(c.pulados);
      const a = [];
      if (podeIniciar) {
        if (['rascunho', 'pronta', 'agendada'].includes(c.status)) a.push('<button class="btn-azul" data-ac="iniciar"><i class="fa-solid fa-play"></i> Iniciar</button>');
        if (rodando) a.push('<button class="btn-soft" data-ac="pausar"><i class="fa-solid fa-pause"></i> Pausar</button>');
        if (c.status === 'pausada') a.push('<button class="btn-azul" data-ac="retomar"><i class="fa-solid fa-play"></i> Retomar</button>');
        if (['rodando', 'enviando', 'pausada', 'espera', 'agendada'].includes(c.status)) a.push('<button class="btn-perigo" data-ac="cancelar"><i class="fa-solid fa-ban"></i> Cancelar</button>');
      }
      if (podeCriar && ['rascunho', 'concluida', 'cancelada'].includes(c.status)) a.push('<button class="btn-perigo" data-ac="excluir"><i class="fa-solid fa-trash"></i></button>');
      const ac = ZZ.$('#dAcoes', det); const sig = a.join('');
      if (ac.dataset.s !== sig) { ac.dataset.s = sig; ac.innerHTML = sig; ZZ.$$('[data-ac]', ac).forEach(bt => bt.onclick = () => acaoCampanha(bt.dataset.ac, c, bt, r => { if (bt.dataset.ac === 'excluir') ZZ.ir('campanhas'); else { ult = ''; atualiza(); } })); }
      ZZ.$('#dMsg', det).innerHTML = c.tipo === 'midia' ? `<div class="cp-midia"><i class="fa-solid fa-paperclip"></i> ${h(c.nome_arquivo || 'arquivo')}</div>` + (c.legenda ? balao('*' + (c.assinatura || nomeUsuario()) + ':*\n' + c.legenda) : balao('*' + (c.assinatura || nomeUsuario()) + ':*')) : balao('*' + (c.assinatura || nomeUsuario()) + ':*\n' + (c.texto || ''));
      ZZ.$('#dLim', det).innerHTML = `<i class="fa-solid fa-shield-halved"></i> Intervalo ${num(c.intervalo_min_s)}–${num(c.intervalo_max_s)} s · até ${fmtN(c.limite_dia)}/dia · das ${num(c.janela_inicio)}h às ${num(c.janela_fim)}h`;
      ZZ.$('#cpVivo', el).hidden = !(rodando || c.status === 'espera');
    };
    const linhaEnvio = e => {
      const s = envSt(e.status); const r = ENV_ROT[s] || [s, 'b-info', 'fa-circle'];
      return `<div class="cp-env"><span class="avatar cp-env-av">${h(ZZ.iniciais(e.nome || e.numero))}</span><div class="cp-env-info"><b>${h(e.nome || ZZ.fmtNumero(e.numero) || '—')}</b><small class="mut">${h(e.nome ? ZZ.fmtNumero(e.numero) : '')}${e.enviado_em ? ' · ' + h(ZZ.fmtDataHora(e.enviado_em)) : ''}</small>${e.erro && s === 'falha' ? `<div class="cp-erro-m"><i class="fa-solid fa-circle-exclamation"></i> ${h(e.erro)}</div>` : ''}</div><span class="badge-status ${r[1]}"><i class="fa-solid ${r[2]}"></i> ${h(r[0])}</span></div>`;
    };
    async function carregaEnvios(esq) {
      const box = ZZ.$('#dEnv', det); if (!box) return; if (esq) box.innerHTML = ZZ.skeleton(4);
      ZZ.$('#dFRot', det).textContent = filtro ? '· ' + ((ENV_ROT[filtro] || [filtro])[0]) : '';
      const pags = []; for (let i = 1; i <= npag; i++) pags.push(ZZ.api('listar_envios_campanha', { params: { id, status: filtro === 'pulado' ? 'ignorado' : filtro, pag: i }, silencioso: true }));
      const rs = await Promise.all(pags); if (parado) return; const r0 = rs[0];
      if (!r0.ok) { if (esq || !box.children.length) { box.innerHTML = ''; box.appendChild(erroCartao(r0.msg || 'Não foi possível carregar os envios.', () => carregaEnvios(true))); } return; }
      const itens = rs.flatMap(r => r.itens || r.envios || []); const sig = filtro + '|' + JSON.stringify(itens); if (sig === ult) return; ult = sig;
      const ultR = rs[rs.length - 1]; temMais = ultR.paginas ? npag < ultR.paginas : (ultR.itens || ultR.envios || []).length >= 50;
      box.innerHTML = itens.length ? itens.map(linhaEnvio).join('') : `<div class="vazio"><i class="fa-regular fa-face-smile"></i>${filtro ? 'Nenhum envio com esse filtro.' : 'Nenhum envio ainda.'}</div>`;
      ZZ.$('#dMais', det).hidden = !temMais;
    }
    async function atualiza(primeira) {
      const j = await ZZ.api('ver_campanha', { params: { id }, silencioso: !primeira });
      if (parado) return;
      if (!j.ok) { if (primeira) { det.innerHTML = ''; det.appendChild(erroCartao(j.msg || 'Campanha não encontrada.', () => { det.innerHTML = ZZ.skeleton(3, 'skel-linha cp-skel'); atualiza(true); })); } return; }
      const nova = normC(j.campanha, j); const prim = !c; c = nova; if (prim) montar();
      preenche(); if (prim) carregaEnvios(true); else carregaEnvios(false);
    }
    atualiza(true);
    ZZ.poll(() => atualiza(false), 3000);
  }

  /* =====================================================================
     Assistente de criação (4 passos)
  ===================================================================== */
  async function assistente(editId, aoFim) {
    const ov = document.createElement('div'); ov.className = 'cp-wiz'; document.body.appendChild(ov); document.body.classList.add('cp-sem-rolar');
    limpeza.push(() => fecha());
    const S = { id: editId || null, nome: '', lista_id: '', tipo: 'texto', texto: '', arquivo: null, arquivo_atual: '', ...PADRAO };
    let passo = 1, listas = [], fechado = false;
    function fecha() { if (fechado) return; fechado = true; ov.remove(); document.body.classList.remove('cp-sem-rolar'); }
    ov.innerHTML = `<div class="cp-wiz-in"><div class="cp-wiz-topo"><button class="cp-x" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button><b id="wT"></b></div><div class="cp-wiz-corpo">${ZZ.skeleton(4)}</div></div>`;
    ZZ.$('.cp-x', ov).onclick = async () => { if (!S.nome && !S.lista_id || await ZZ.confirmar('Sair do assistente? O que você preencheu será perdido.', 'Sair', true)) fecha(); };
    const [jl, jc] = await Promise.all([ZZ.api('listar_listas'), editId ? ZZ.api('ver_campanha', { params: { id: editId } }) : Promise.resolve(null)]);
    if (fechado) return;
    listas = (jl.ok && (jl.listas || jl.itens)) || [];
    if (jc && jc.ok) { const c = jc.campanha || jc; Object.assign(S, { nome: c.nome || '', lista_id: c.lista_id || '', tipo: c.tipo === 'midia' ? 'midia' : 'texto', texto: (c.tipo === 'midia' ? c.legenda : c.texto) || '', arquivo_atual: c.nome_arquivo || (c.tem_arquivo ? 'arquivo' : ''), intervalo_min_s: num(c.intervalo_min_s) || PADRAO.intervalo_min_s, intervalo_max_s: num(c.intervalo_max_s) || PADRAO.intervalo_max_s, limite_dia: num(c.limite_dia) || PADRAO.limite_dia, janela_inicio: c.janela_inicio != null ? num(c.janela_inicio) : PADRAO.janela_inicio, janela_fim: num(c.janela_fim) || PADRAO.janela_fim }); }
    const lista = () => listas.find(l => String(l.id) === String(S.lista_id));
    const ativos = l => l ? (l.validos != null ? num(l.validos) : Math.max(0, num(l.total) - num(l.optout))) : 0;
    const TIT = ['', 'Escolha a lista', 'Escreva a mensagem', 'Limites anti-bloqueio', 'Revisar e iniciar'];

    function pinta() {
      ZZ.$('#wT', ov).textContent = (S.id ? 'Editar campanha' : 'Nova campanha') + ' · ' + TIT[passo];
      const pontos = [1, 2, 3, 4].map(n => `<span class="cp-ponto ${n < passo ? 'feito' : n === passo ? 'ativo' : ''}"><i>${n < passo ? '<i class="fa-solid fa-check"></i>' : n}</i></span>`).join('<span class="cp-lin"></span>');
      const corpo = ZZ.$('.cp-wiz-corpo', ov);
      corpo.innerHTML = `<div class="cp-pontos">${pontos}</div><div class="cp-passo" id="wP"></div>`;
      [p1, p2, p3, p4][passo - 1](ZZ.$('#wP', ov));
      ov.scrollTop = 0; corpo.scrollTop = 0;
      const rod = document.createElement('div'); rod.className = 'cp-wiz-rod';
      rod.innerHTML = `<button class="btn-soft" id="wV" ${passo === 1 ? 'hidden' : ''}><i class="fa-solid fa-arrow-left"></i> Voltar</button><span class="espaco"></span>${passo < 4 ? '<button class="btn-azul" id="wN">Continuar <i class="fa-solid fa-arrow-right"></i></button>' : ''}`;
      corpo.appendChild(rod);
      ZZ.$('#wV', ov).onclick = () => { passo--; pinta(); };
      const n = ZZ.$('#wN', ov); if (n) n.onclick = () => { if (valida(passo)) { passo++; pinta(); } };
    }
    function valida(p) {
      const r = ZZ.$('#wP', ov); limpaErros(r);
      if (p === 1) { if (!S.lista_id) { ZZ.toast('Escolha uma lista de contatos.', 'err'); ZZ.$('.cp-listas', r).classList.add('erro-flash'); return false; } if (!ativos(lista())) { ZZ.toast('Essa lista não tem contatos disponíveis para envio.', 'err'); return false; } }
      if (p === 2) {
        const nome = ZZ.$('#wNome', r); if (!S.nome.trim()) { campoErro(nome, 'Dê um nome para a campanha.'); return false; }
        if (S.tipo === 'texto' && !S.texto.trim()) { campoErro(ZZ.$('#wTxt', r), 'Escreva a mensagem.'); return false; }
        if (S.tipo === 'texto' && S.texto.length > 3500) { campoErro(ZZ.$('#wTxt', r), 'Mensagem muito longa (máx. 3500).'); return false; }
        if (S.tipo === 'midia' && !S.arquivo && !S.arquivo_atual) { ZZ.toast('Escolha o arquivo que será enviado.', 'err'); ZZ.$('.cp-up', r).classList.add('erro-flash'); return false; }
      }
      if (p === 3) {
        const a = ZZ.$('#wImin', r), b = ZZ.$('#wImax', r), d = ZZ.$('#wLim', r);
        if (S.intervalo_min_s < 5) { campoErro(a, 'Mínimo de 5 segundos entre mensagens.'); return false; }
        if (S.intervalo_max_s < S.intervalo_min_s) { campoErro(b, 'O máximo precisa ser maior que o mínimo.'); return false; }
        if (S.limite_dia < 1 || S.limite_dia > 1000) { campoErro(d, 'Use entre 1 e 1000 por dia.'); return false; }
        if (S.janela_inicio >= S.janela_fim) { campoErro(ZZ.$('#wJf', r), 'O fim precisa ser depois do início.'); return false; }
      }
      return true;
    }

    /* passo 1 */
    function p1(r) {
      r.innerHTML = `<p class="mut">Para quem vai a mensagem? Contatos que pediram para não receber mensagens (opt-out) são pulados automaticamente.</p><div class="cp-listas">${listas.length ? listas.map(l => `<button class="cp-lista-op ${String(l.id) === String(S.lista_id) ? 'sel' : ''}" data-id="${h(l.id)}"><span class="cp-ic"><i class="fa-solid fa-list-ul"></i></span><span class="cp-lt"><b>${h(l.nome)}</b><small class="mut">${fmtN(l.total)} contatos${num(l.optout) ? ' · ' + fmtN(l.optout) + ' não receberão (opt-out)' : ''}</small></span><i class="fa-solid fa-circle-check cp-ck"></i></button>`).join('') : `<div class="vazio"><i class="fa-solid fa-list-ul"></i>Você ainda não tem listas.${ZZ.pode('campanhas.criar') ? '<br><button class="btn-azul" id="wNL" style="margin-top:12px"><i class="fa-solid fa-plus"></i> Criar uma lista</button>' : ''}</div>`}</div>`;
      ZZ.$$('.cp-lista-op', r).forEach(b => b.onclick = () => { S.lista_id = b.dataset.id; ZZ.vibrar(10); ZZ.$$('.cp-lista-op', r).forEach(x => x.classList.toggle('sel', x === b)); });
      const nl = ZZ.$('#wNL', r); if (nl) nl.onclick = () => editorLista(null, async id => { const j = await ZZ.api('listar_listas'); listas = (j.listas || j.itens || []); if (id) S.lista_id = id; pinta(); });
    }
    /* passo 2 */
    function p2(r) {
      r.innerHTML = `<div class="cp-cmp"><label for="wNome">Nome da campanha (só você vê)</label><input type="text" id="wNome" maxlength="80" placeholder="Ex.: Promoção de outubro" value="${h(S.nome)}"></div>
        <div class="cp-tipos"><button data-t="texto" class="${S.tipo === 'texto' ? 'sel' : ''}"><i class="fa-solid fa-font"></i> Texto</button><button data-t="midia" class="${S.tipo === 'midia' ? 'sel' : ''}"><i class="fa-solid fa-paperclip"></i> Mídia</button></div>
        <div id="wUp" ${S.tipo === 'midia' ? '' : 'hidden'}><label>Arquivo (imagem, vídeo, PDF… até 16 MB)</label><label class="cp-up" for="wArq"><i class="fa-solid fa-cloud-arrow-up"></i><span id="wArqT">${S.arquivo ? h(S.arquivo.name) : S.arquivo_atual ? h(S.arquivo_atual) + ' (atual)' : 'Toque para escolher o arquivo'}</span></label><input type="file" id="wArq" hidden accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.mp3,.ogg,.m4a,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,image/*,video/*,audio/*"></div>
        <div class="cp-cmp"><label for="wTxt" id="wTxtL">${S.tipo === 'midia' ? 'Legenda (opcional)' : 'Mensagem'}</label><textarea id="wTxt" rows="6" maxlength="3500" placeholder="Olá {primeiro_nome}, tudo bem?">${h(S.texto)}</textarea></div>
        <div class="cp-vars"><span class="mut">Variáveis:</span><button data-v="{nome}">{nome}</button><button data-v="{primeiro_nome}">{primeiro_nome}</button></div>
        <div class="cp-prev"><div class="cp-prev-t"><i class="fa-brands fa-whatsapp"></i> Como a pessoa vai ver</div><div class="cp-wa"><div class="cp-bal" id="wBal"></div></div><small class="mut"><i class="fa-solid fa-lock"></i> A assinatura <b>*${h(nomeUsuario())}:*</b> é obrigatória e vai sempre no início.</small></div>`;
      const nome = ZZ.$('#wNome', r), txt = ZZ.$('#wTxt', r), bal = ZZ.$('#wBal', r);
      const prev = () => {
        const t = S.texto.replace(/\{primeiro_nome\}/g, 'Maria').replace(/\{nome\}/g, 'Maria Silva');
        bal.innerHTML = (S.tipo === 'midia' ? `<div class="cp-midia"><i class="fa-solid ${S.arquivo && /^image/.test(S.arquivo.type) ? 'fa-image' : 'fa-paperclip'}"></i> ${h(S.arquivo ? S.arquivo.name : S.arquivo_atual || 'arquivo')}</div>` : '') + balao('*' + nomeUsuario() + ':*\n' + t) + `<span class="cp-hora">${ZZ.fmtHora(Date.now() / 1000)} <i class="fa-solid fa-check-double"></i></span>`;
      };
      nome.oninput = () => S.nome = nome.value; txt.oninput = () => { S.texto = txt.value; prev(); };
      ZZ.$$('.cp-tipos button', r).forEach(b => b.onclick = () => { S.tipo = b.dataset.t; ZZ.$$('.cp-tipos button', r).forEach(x => x.classList.toggle('sel', x === b)); ZZ.$('#wUp', r).hidden = S.tipo !== 'midia'; ZZ.$('#wTxtL', r).textContent = S.tipo === 'midia' ? 'Legenda (opcional)' : 'Mensagem'; prev(); });
      ZZ.$$('.cp-vars button', r).forEach(b => b.onclick = () => { const a = txt.selectionStart ?? txt.value.length; txt.setRangeText(b.dataset.v, a, txt.selectionEnd ?? a, 'end'); S.texto = txt.value; txt.focus(); prev(); });
      ZZ.$('#wArq', r).onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 16 * 1024 * 1024) { ZZ.toast('Arquivo maior que 16 MB.', 'err'); e.target.value = ''; return; } S.arquivo = f; ZZ.$('#wArqT', r).textContent = f.name + ' · ' + (f.size / 1048576).toFixed(1) + ' MB'; ZZ.$('.cp-up', r).classList.add('ok'); prev(); };
      prev();
    }
    /* passo 3 */
    function p3(r) {
      const atu = () => (S.intervalo_min_s === 20 && S.intervalo_max_s === 60 && S.limite_dia === 200) ? 'seg' : (S.intervalo_min_s === 10 && S.intervalo_max_s === 30 && S.limite_dia === 400) ? 'mod' : (S.intervalo_min_s === 5 && S.intervalo_max_s === 15 && S.limite_dia === 1000) ? 'rap' : '';
      r.innerHTML = `<div class="cp-aviso cp-aviso-azul"><i class="fa-solid fa-shield-halved"></i> O WhatsApp bloqueia números que mandam muitas mensagens iguais, rápido demais. Estes limites imitam um envio humano e protegem o seu número.</div>
        <div class="cp-pres"><button data-p="seg"><b>Seguro</b><small>20–60 s · 200/dia</small><em>Recomendado</em></button><button data-p="mod"><b>Moderado</b><small>10–30 s · 400/dia</small></button><button data-p="rap"><b>Rápido</b><small>5–15 s · 1000/dia</small><em class="risco">Arriscado</em></button></div>
        <div class="cp-cmp"><label>Intervalo entre mensagens (segundos)</label><div class="cp-par"><div class="cp-cmp"><input type="number" id="wImin" min="5" max="600" inputmode="numeric" value="${S.intervalo_min_s}" aria-label="Mínimo"></div><span>até</span><div class="cp-cmp"><input type="number" id="wImax" min="5" max="900" inputmode="numeric" value="${S.intervalo_max_s}" aria-label="Máximo"></div></div><small class="mut">Esperamos um tempo aleatório entre o mínimo e o máximo antes de cada envio, como uma pessoa faria.</small></div>
        <div class="cp-cmp"><label for="wLim">Limite por dia (mensagens)</label><input type="number" id="wLim" min="1" max="1000" inputmode="numeric" value="${S.limite_dia}"><small class="mut">Passou do limite, o envio pausa e continua no dia seguinte. Números novos devem começar com poucas mensagens.</small></div>
        <div class="cp-cmp"><label>Janela de horário</label><div class="cp-par"><div class="cp-cmp"><select id="wJi" aria-label="Início">${[...Array(24).keys()].map(i => i + 0).map(x => `<option value="${x}" ${x === S.janela_inicio ? 'selected' : ''}>${String(x).padStart(2, '0')}h</option>`).join('')}</select></div><span>às</span><div class="cp-cmp"><select id="wJf" aria-label="Fim">${[...Array(24).keys()].map(i => i + 1).map(x => `<option value="${x}" ${x === S.janela_fim ? 'selected' : ''}>${String(x).padStart(2, '0')}h</option>`).join('')}</select></div></div><small class="mut">Só enviamos dentro deste horário (de Maceió). Fora dele a campanha espera. Evite madrugada.</small></div>
        <div class="cp-est" id="wEst"></div>`;
      const marca = () => ZZ.$$('.cp-pres button', r).forEach(b => b.classList.toggle('sel', b.dataset.p === atu()));
      const est = () => { const p = ativos(lista()); const media = (S.intervalo_min_s + S.intervalo_max_s) / 2 || 1; const t = p * media; const dias = Math.ceil(p / Math.max(1, S.limite_dia)); ZZ.$('#wEst', r).innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Para <b>${fmtN(p)}</b> contatos: cerca de <b>${fmtDur(t)}</b> de envio${dias > 1 ? ` em <b>${dias} dias</b> (limite diário)` : ''}.`; };
      const le = () => { S.intervalo_min_s = num(ZZ.$('#wImin', r).value); S.intervalo_max_s = num(ZZ.$('#wImax', r).value); S.limite_dia = num(ZZ.$('#wLim', r).value); S.janela_inicio = num(ZZ.$('#wJi', r).value); S.janela_fim = num(ZZ.$('#wJf', r).value); marca(); est(); };
      ZZ.$$('#wImin,#wImax,#wLim,#wJi,#wJf', r).forEach(i => { i.oninput = le; i.onchange = le; });
      ZZ.$$('.cp-pres button', r).forEach(b => b.onclick = async () => {
        const P = { seg: [20, 60, 200], mod: [10, 30, 400], rap: [5, 15, 1000] }[b.dataset.p];
        if (b.dataset.p === 'rap' && !(await ZZ.confirmar('O modo Rápido aumenta bastante o risco de o WhatsApp bloquear seu número. Usar mesmo assim?', 'Usar Rápido', true))) return;
        [S.intervalo_min_s, S.intervalo_max_s, S.limite_dia] = P; ZZ.$('#wImin', r).value = P[0]; ZZ.$('#wImax', r).value = P[1]; ZZ.$('#wLim', r).value = P[2]; le();
      });
      marca(); est();
    }
    /* passo 4 */
    function p4(r) {
      const l = lista(); const total = ativos(l); const podeIni = ZZ.pode('campanhas.iniciar');
      r.innerHTML = `<div class="cp-resumo"><div><small class="mut">Campanha</small><b>${h(S.nome)}</b></div><div><small class="mut">Lista</small><b>${h(l ? l.nome : '—')}</b> · ${fmtN(total)} destinatários</div><div><small class="mut">Tipo</small><b>${S.tipo === 'midia' ? 'Mídia: ' + h(S.arquivo ? S.arquivo.name : S.arquivo_atual) : 'Texto'}</b></div><div><small class="mut">Limites</small>${S.intervalo_min_s}–${S.intervalo_max_s} s · ${fmtN(S.limite_dia)}/dia · ${S.janela_inicio}h às ${S.janela_fim}h</div></div>
        <div class="cp-wa"><div class="cp-bal">${balao('*' + nomeUsuario() + ':*\n' + S.texto.replace(/\{primeiro_nome\}/g, 'Maria').replace(/\{nome\}/g, 'Maria Silva'))}</div></div>
        <div class="cp-aviso"><i class="fa-solid fa-triangle-exclamation"></i> <b>Risco de bloqueio:</b> enviar mensagens em massa pode fazer o WhatsApp banir o número. Envie só para quem espera receber e respeite os limites.</div>
        <div id="wProg" hidden><div class="barra-prog"><i id="wProgB"></i></div><small class="mut" id="wProgT"></small></div>
        <div class="cp-fim"><button class="btn-soft" id="wRasc"><i class="fa-regular fa-floppy-disk"></i> Salvar rascunho</button>${podeIni ? `<button class="btn-azul" id="wIni"><i class="fa-solid fa-play"></i> Revisar e iniciar…</button>` : '<small class="mut">Você não tem permissão para iniciar campanhas; salve como rascunho.</small>'}</div>`;
      const salvar = async () => {
        const dados = { nome: S.nome.trim(), lista_id: S.lista_id, tipo: S.tipo, texto: S.tipo === 'texto' ? S.texto : '', legenda: S.tipo === 'midia' ? S.texto : '', intervalo_min_s: S.intervalo_min_s, intervalo_max_s: S.intervalo_max_s, limite_dia: S.limite_dia, janela_inicio: S.janela_inicio, janela_fim: S.janela_fim };
        if (S.id) dados.id = S.id;
        let j;
        if (S.tipo === 'midia' && S.arquivo) {
          const fd = new FormData(); Object.keys(dados).forEach(k => fd.append(k, dados[k])); fd.append('arquivo', S.arquivo);
          const pr = ZZ.$('#wProg', r), pb = ZZ.$('#wProgB', r), pt = ZZ.$('#wProgT', r); pr.hidden = false;
          j = await enviarForm('salvar_campanha', fd, f => { pb.style.width = Math.round(f * 100) + '%'; pt.textContent = f < 1 ? 'Enviando arquivo… ' + Math.round(f * 100) + '%' : 'Processando…'; });
          pr.hidden = true;
        } else j = await ZZ.api('salvar_campanha', { corpo: dados });
        if (j && j.ok) { S.id = j.id || (j.campanha && j.campanha.id) || S.id; S.arquivo = null; if (S.tipo === 'midia' && !S.arquivo_atual) S.arquivo_atual = 'arquivo'; }
        return j;
      };
      ZZ.$('#wRasc', r).onclick = async e => { const j = await ZZ.busy(e.currentTarget, salvar); if (j && j.ok) { ZZ.toast('Rascunho salvo.', 'ok'); fecha(); aoFim && aoFim(); } };
      const bi = ZZ.$('#wIni', r);
      if (bi) bi.onclick = async () => {
        const j = await ZZ.busy(bi, salvar); if (!j || !j.ok) return;
        let tot = total; const v = await ZZ.api('ver_campanha', { params: { id: S.id }, silencioso: true });
        if (v.ok) { const cc = v.campanha || v; if (cc.total != null) tot = num(cc.total); }
        const iniciou = await confirmarInicio({ id: S.id, nome: S.nome }, tot, v.ok ? v.avisos : []);
        if (iniciou) { fecha(); ZZ.ir('campanhas', { c: S.id }); } else { ZZ.toast('Campanha salva como rascunho. Inicie quando estiver pronto.', 'ok'); }
      };
    }
    pinta();
  }

  /* =====================================================================
     Listas
  ===================================================================== */
  function telaListas(corpo, podeCriar) {
    corpo.innerHTML = ZZ.skeleton(3);
    const carregar = async () => {
      const j = await ZZ.api('listar_listas');
      if (!j.ok) { corpo.innerHTML = ''; corpo.appendChild(erroCartao(j.msg || 'Não foi possível carregar as listas.', () => { corpo.innerHTML = ZZ.skeleton(3); carregar(); })); return; }
      const itens = j.listas || [];
      if (!itens.length) { corpo.innerHTML = `<div class="card-soft vazio"><i class="fa-solid fa-list-ul"></i><div><b>Nenhuma lista ainda</b></div><div>Listas reúnem os contatos que vão receber uma campanha.</div>${podeCriar ? '<button class="btn-azul" id="cpVL" style="margin-top:14px"><i class="fa-solid fa-plus"></i> Criar lista</button>' : ''}</div>`; const b = ZZ.$('#cpVL', corpo); if (b) b.onclick = () => editorLista(null, carregar); return; }
      corpo.innerHTML = `<div class="cp-grade">${itens.map(l => `<button class="cp-lista" data-id="${h(l.id)}"><span class="cp-ic"><i class="fa-solid fa-list-ul"></i></span><span class="cp-lt"><b>${h(l.nome)}</b><span class="cp-lm"><i class="fa-solid fa-user"></i> ${fmtN(l.total)} ${num(l.optout) ? `<span class="cp-opt"><i class="fa-solid fa-user-slash"></i> ${fmtN(l.optout)} opt-out</span>` : ''}${num(l.campanhas) ? ` · ${fmtN(l.campanhas)} ${num(l.campanhas) === 1 ? 'campanha' : 'campanhas'}` : ''}</span></span><i class="fa-solid fa-chevron-right mut"></i></button>`).join('')}</div>`;
      ZZ.$$('.cp-lista', corpo).forEach((b, i) => { b.style.animationDelay = i * 35 + 'ms'; b.onclick = () => verLista(b.dataset.id, podeCriar, carregar); });
    };
    carregar();
  }

  function editorLista(id, aoFim, nome0) {
    const m = ZZ.modal(`<h3>${id ? 'Renomear lista' : 'Nova lista'}</h3><div class="cp-cmp"><label for="lNome">Nome da lista</label><input type="text" id="lNome" maxlength="80" placeholder="Ex.: Clientes de Maceió" value="${h(nome0 || '')}"></div><div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s><i class="fa-solid fa-check"></i> Salvar</button></div>`);
    const nome = ZZ.$('#lNome', m.el); setTimeout(() => nome.focus(), 150);
    const salvar = async btn => {
      limpaErros(m.el); if (!nome.value.trim()) { campoErro(nome, 'Dê um nome para a lista.'); return; }
      const r = await ZZ.busy(btn, () => ZZ.api('salvar_lista', { corpo: { id: id || undefined, nome: nome.value.trim() } }));
      if (r && r.ok) { ZZ.toast('Lista salva.', 'ok'); m.fechar(); aoFim && aoFim(r.id); }
    };
    nome.onkeydown = e => { if (e.key === 'Enter') salvar(ZZ.$('[data-s]', m.el)); };
    ZZ.$('[data-n]', m.el).onclick = () => m.fechar();
    ZZ.$('[data-s]', m.el).onclick = e => salvar(e.currentTarget);
  }

  async function verLista(id, podeCriar, aoMudar) {
    const m = ZZ.modal(`<div class="cp-lh"><h3 id="vlT">Lista</h3><button class="cp-x" data-f aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div><div id="vlC">${ZZ.skeleton(4)}</div>`);
    m.el.classList.add('cp-modal-g'); ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    const caixa = ZZ.$('#vlC', m.el);
    let lista = null, tot = null, contatos = [], termo = '', pag = 1, paginas = 1, req = 0;
    const base = async (zerar) => {
      const meu = ++req; if (zerar) pag = 1;
      const j = await ZZ.api('ver_lista', { params: { id, q: termo, pag }, silencioso: true });
      if (meu !== req) return null; return j;
    };
    const linhas = () => {
      const L = ZZ.$('#vlL', m.el); if (!L) return;
      L.innerHTML = contatos.length ? contatos.map(c => `<div class="cp-ctt ${c.optout ? 'opt' : ''}"><span class="avatar cp-env-av">${h(ZZ.iniciais(c.nome || c.numero))}</span><div class="cp-env-info"><b>${h(c.nome || ZZ.fmtNumero(c.numero))}</b><small class="mut">${c.nome ? h(ZZ.fmtNumero(c.numero)) : ''}</small></div>${c.optout ? '<span class="badge-status b-err"><i class="fa-solid fa-user-slash"></i> opt-out</span>' : ''}${podeCriar ? `<button class="cp-rm" data-j="${h(c.jid)}" aria-label="Remover"><i class="fa-solid fa-xmark"></i></button>` : ''}</div>`).join('') + (pag < paginas ? '<div class="cp-mais-b"><button class="btn-soft btn-sm" id="vlMais">Carregar mais</button></div>' : '') : `<div class="vazio"><i class="fa-regular fa-user"></i>${termo ? 'Ninguém encontrado.' : 'Lista vazia. Adicione contatos.'}</div>`;
      const mb = ZZ.$('#vlMais', m.el); if (mb) mb.onclick = () => ZZ.busy(mb, async () => { pag++; const j = await base(false); if (j && j.ok) { contatos = contatos.concat(j.contatos || []); paginas = j.paginas; linhas(); } return j; });
      ZZ.$$('.cp-rm', m.el).forEach(b => b.onclick = async () => {
        const r = await ZZ.busy(b, () => ZZ.api('remover_contato_lista', { corpo: { lista_id: id, jid: b.dataset.j } }));
        if (r && r.ok) { b.closest('.cp-ctt').classList.add('saindo'); ZZ.toast('Contato removido.', 'ok'); setTimeout(() => { contatos = contatos.filter(c => c.jid !== b.dataset.j); if (tot) tot.total = Math.max(0, tot.total - 1); cab(); linhas(); aoMudar && aoMudar(); }, 250); }
      });
    };
    const cab = () => { const c = ZZ.$('#vlRes', m.el); if (c) c.innerHTML = `<span><b>${fmtN(tot.total)}</b> contatos</span>${num(tot.optout) ? `<span class="cp-opt"><i class="fa-solid fa-user-slash"></i> <b>${fmtN(tot.optout)}</b> opt-out (não recebem)</span>` : ''}`; };
    const j = await base(true);
    if (!j || !j.ok) { caixa.innerHTML = ''; caixa.appendChild(erroCartao((j && j.msg) || 'Não foi possível abrir a lista.', () => { m.fechar(); verLista(id, podeCriar, aoMudar); })); return; }
    lista = j.lista; tot = j.totais; contatos = j.contatos || []; paginas = j.paginas;
    ZZ.$('#vlT', m.el).textContent = lista.nome;
    caixa.innerHTML = `<div class="cp-resumo-l" id="vlRes"></div>
      ${podeCriar ? '<div class="cp-lacoes"><button class="btn-azul btn-sm" id="vlImp"><i class="fa-solid fa-file-import"></i> Adicionar contatos</button><button class="btn-soft btn-sm" id="vlEd"><i class="fa-solid fa-pen"></i> Renomear</button><button class="btn-perigo btn-sm" id="vlEx"><i class="fa-solid fa-trash"></i> Excluir</button></div>' : ''}
      <input type="search" id="vlQ" placeholder="Buscar nesta lista" autocomplete="off"><div class="cp-ctts" id="vlL"></div>`;
    cab(); linhas();
    const rec = () => { m.fechar(); aoMudar && aoMudar(); verLista(id, podeCriar, aoMudar); };
    ZZ.$('#vlQ', m.el).oninput = ZZ.debounce(async e => { termo = e.target.value.trim(); ZZ.$('#vlL', m.el).innerHTML = ZZ.skeleton(3); const r = await base(true); if (r && r.ok) { contatos = r.contatos || []; paginas = r.paginas; linhas(); } }, 300);
    const bi = ZZ.$('#vlImp', m.el); if (bi) bi.onclick = () => importador(id, rec);
    const be = ZZ.$('#vlEd', m.el); if (be) be.onclick = () => { m.fechar(); editorLista(id, () => { aoMudar && aoMudar(); verLista(id, podeCriar, aoMudar); }, lista.nome); };
    const bx = ZZ.$('#vlEx', m.el); if (bx) bx.onclick = async () => { if (!(await ZZ.confirmar('Excluir a lista "' + lista.nome + '"? Campanhas já feitas não são afetadas.', 'Excluir', true))) return; const r = await ZZ.busy(bx, () => ZZ.api('excluir_lista', { corpo: { id } })); if (r && r.ok) { ZZ.toast('Lista excluída.', 'ok'); m.fechar(); aoMudar && aoMudar(); } };
  }

  /* ---------- Importador (colar / escolher contatos) ---------- */
  function importador(listaId, aoFim) {
    const m = ZZ.modal(`<div class="cp-lh"><h3>Adicionar contatos</h3><button class="cp-x" data-f aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="cp-abas cp-abas-m"><button data-a="colar" class="ativo"><i class="fa-solid fa-paste"></i> Colar lista</button><button data-a="contatos"><i class="fa-solid fa-address-book"></i> Meus contatos</button></div><div id="imC"></div>`);
    m.el.classList.add('cp-modal-g'); ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    const C = ZZ.$('#imC', m.el);
    const envia = async (btn, corpo) => {
      const r = await ZZ.busy(btn, () => ZZ.api('importar_contatos_lista', { corpo: { lista_id: listaId, ...corpo } }));
      if (r && r.ok) { ZZ.toast(`${fmtN(r.adicionados)} adicionados${r.duplicados ? ' · ' + r.duplicados + ' já estavam' : ''}${r.invalidos_total ? ' · ' + r.invalidos_total + ' inválidos' : ''}${r.optout ? ' · ' + r.optout + ' opt-out' : ''}.`, 'ok'); m.fechar(); aoFim && aoFim(); }
    };
    const colar = () => {
      let itens = [], cabecalho = '';
      C.innerHTML = `<p class="mut">Cole um contato por linha: <code>número</code> ou <code>nome; número</code>. Aceita CSV com cabeçalho <code>nome;numero;outras colunas</code> (viram variáveis, ex.: <code>{cidade}</code>).</p><textarea id="imT" rows="6" placeholder="Maria; 82999990000&#10;82988887777"></textarea><div class="cp-lacoes"><label class="btn-soft btn-sm cp-arqcsv" for="imF"><i class="fa-solid fa-file-csv"></i> Abrir arquivo CSV/TXT</label><input type="file" id="imF" accept=".csv,.txt,text/csv,text/plain" hidden></div><div id="imR"></div>`;
      const t = ZZ.$('#imT', C), R = ZZ.$('#imR', C);
      const pinta = () => {
        if (!itens.length) { R.innerHTML = ''; return; }
        const ok = itens.filter(i => i.st === 'ok').length, inv = itens.filter(i => i.st === 'invalido').length, dup = itens.filter(i => i.st === 'duplicado').length, sel = itens.filter(i => i.incluir).length;
        R.innerHTML = `<div class="cp-validos"><span class="v-ok"><b>${ok}</b> válidos</span><span class="v-inv"><b>${inv}</b> inválidos</span><span class="v-dup"><b>${dup}</b> duplicados</span></div><p class="mut" style="font-size:.84rem;margin:4px 0">Revise abaixo e desmarque o que não quiser. Duplicados e inválidos ficam de fora.</p>
          <div class="cp-rev">${itens.map((i, k) => `<label class="cp-rev-l ${i.st}"><input type="checkbox" data-k="${k}" ${i.incluir ? 'checked' : ''} ${i.st !== 'ok' ? 'disabled' : ''}><span class="cp-rev-t"><b>${h(i.nome || (i.numero ? ZZ.fmtNumero(i.numero) : i.bruto))}</b><small>${i.numero ? h(ZZ.fmtNumero(i.numero)) : 'número inválido (use DDD + número)'}</small></span><span class="badge-status ${i.st === 'ok' ? 'b-ok' : i.st === 'duplicado' ? 'b-pend' : 'b-err'}">${i.st === 'ok' ? 'válido' : i.st}</span></label>`).join('')}</div>
          <div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s ${sel ? '' : 'disabled'}><i class="fa-solid fa-check"></i> Adicionar ${sel} ${sel === 1 ? 'contato' : 'contatos'}</button></div>`;
        ZZ.$$('input[data-k]', R).forEach(c => c.onchange = () => { itens[c.dataset.k].incluir = c.checked; const s = itens.filter(i => i.incluir).length; const b = ZZ.$('[data-s]', R); b.disabled = !s; b.innerHTML = `<i class="fa-solid fa-check"></i> Adicionar ${s} ${s === 1 ? 'contato' : 'contatos'}`; });
        ZZ.$('[data-n]', R).onclick = () => m.fechar();
        ZZ.$('[data-s]', R).onclick = e => { const linhas = itens.filter(i => i.incluir).map(i => i.original); envia(e.currentTarget, { texto: (cabecalho ? cabecalho + '\n' : '') + linhas.join('\n') }); };
      };
      const roda = () => { const r = analisar(t.value, []); itens = r.itens; cabecalho = r.cabecalho; pinta(); };
      t.oninput = ZZ.debounce(roda, 350);
      ZZ.$('#imF', C).onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 2 * 1024 * 1024) return ZZ.toast('Arquivo grande demais (máx. 2 MB).', 'err'); const rd = new FileReader(); rd.onload = () => { t.value = String(rd.result); roda(); ZZ.toast('Arquivo lido. Revise antes de salvar.', 'ok'); }; rd.readAsText(f); };
    };
    const escolher = () => {
      const sel = new Set();
      C.innerHTML = `<input type="search" id="imQ" placeholder="Buscar contato por nome ou número" autocomplete="off"><div class="cp-ctts cp-ctts-s" id="imL"></div><div class="acoes cp-fixo"><span class="mut" id="imSel">0 selecionados</span><button class="btn-azul" data-s disabled><i class="fa-solid fa-check"></i> Adicionar</button></div>`;
      const L = ZZ.$('#imL', C), bs = ZZ.$('[data-s]', C); let pag = 1, paginas = 1, q = '', carregando = false;
      const atu = () => { ZZ.$('#imSel', C).textContent = sel.size + (sel.size === 1 ? ' selecionado' : ' selecionados'); bs.disabled = !sel.size; };
      const carrega = async zerar => {
        if (carregando) return; carregando = true; if (zerar) { pag = 1; L.innerHTML = ZZ.skeleton(5); }
        const j = await ZZ.api('listar_contatos_disponiveis', { params: { q, pag }, silencioso: true }); carregando = false;
        if (zerar) L.innerHTML = '';
        const mb0 = L.querySelector('.cp-mais-b'); if (mb0) mb0.remove();
        if (!j.ok) { L.appendChild(erroCartao(j.msg || 'Erro ao buscar contatos.', () => carrega(true))); return; }
        paginas = j.paginas || 1; const novos = j.contatos || [];
        if (zerar && !novos.length) { L.innerHTML = '<div class="vazio"><i class="fa-regular fa-user"></i>Nenhum contato encontrado.</div>'; return; }
        L.insertAdjacentHTML('beforeend', novos.map(c => `<label class="cp-rev-l"><input type="checkbox" data-j="${h(c.jid)}" ${sel.has(c.jid) ? 'checked' : ''}><span class="cp-rev-t"><b>${h(c.nome || ZZ.fmtNumero(c.numero))}</b><small>${h(ZZ.fmtNumero(c.numero))}</small></span></label>`).join(''));
        if (pag < paginas) L.insertAdjacentHTML('beforeend', '<div class="cp-mais-b"><button class="btn-soft btn-sm">Carregar mais</button></div>');
        const mb = L.querySelector('.cp-mais-b button'); if (mb) mb.onclick = () => { pag++; carrega(false); };
      };
      L.addEventListener('change', e => { const c = e.target; if (c.dataset && c.dataset.j) { if (c.checked) sel.add(c.dataset.j); else sel.delete(c.dataset.j); atu(); } });
      ZZ.$('#imQ', C).oninput = ZZ.debounce(e => { q = e.target.value.trim(); carrega(true); }, 350);
      bs.onclick = e => envia(e.currentTarget, { jids: [...sel] });
      carrega(true);
    };
    ZZ.$$('.cp-abas-m button', m.el).forEach(b => b.onclick = () => { ZZ.$$('.cp-abas-m button', m.el).forEach(x => x.classList.toggle('ativo', x === b)); b.dataset.a === 'colar' ? colar() : escolher(); });
    colar();
  }
})();
