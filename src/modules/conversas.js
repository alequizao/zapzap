/* ZapZap — módulo Conversas: lista + chat (celular: telas cheias; desktop: duas colunas). */
(function () {
  'use strict';
  const ZZ = window.ZZ;
  const esc = ZZ.esc;
  const ICONE_TIPO = { imagem: 'fa-image', video: 'fa-video', audio: 'fa-microphone', documento: 'fa-file-lines', figurinha: 'fa-note-sticky', contato: 'fa-address-card', localizacao: 'fa-location-dot', enquete: 'fa-square-poll-vertical', reacao: 'fa-face-smile', outro: 'fa-message' };
  const ROTULO_TIPO = { imagem: 'Foto', video: 'Vídeo', audio: 'Áudio', documento: 'Documento', figurinha: 'Figurinha', contato: 'Contato', localizacao: 'Localização', enquete: 'Enquete', reacao: 'Reação', outro: 'Mensagem' };
  const MIDIA_ROTULO = { imagem: 'foto', video: 'vídeo', audio: 'áudio', documento: 'documento', figurinha: 'figurinha' };
  const LIMITE_ARQ = 25 * 1024 * 1024;
  const ehDesktop = () => matchMedia('(min-width: 881px)').matches;
  const teclaEnterEnvia = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

  let S = null; // estado da página atual

  /* ---------- utilidades ---------- */
  const agora = () => Math.floor(Date.now() / 1000);
  function rotuloDia(ts) {
    const d = ZZ.fmtData(ts);
    if (d === ZZ.fmtData(agora())) return 'Hoje';
    if (d === ZZ.fmtData(agora() - 86400)) return 'Ontem';
    return d;
  }
  function horaLista(ts) {
    const d = ZZ.fmtData(ts);
    if (d === ZZ.fmtData(agora())) return ZZ.fmtHora(ts);
    if (d === ZZ.fmtData(agora() - 86400)) return 'Ontem';
    return d.slice(0, 6) + d.slice(8);
  }
  function numeroDoJid(jid) { return /@s\.whatsapp\.net$/.test(jid || '') ? ZZ.fmtNumero(jid.split('@')[0]) : ''; }
  function corAutor(nome) { let h = 0; for (const c of String(nome || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h},55%,38%)`; }
  function avatarHtml(nome, foto, cls) {
    const ini = esc(ZZ.iniciais(nome));
    return foto ? `<span class="avatar conv-av ${cls || ''}" data-ini="${ini}"><img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
      : `<span class="avatar conv-av ${cls || ''}">${ini}</span>`;
  }
  function tickHtml(status) {
    if (status === 'pend') return '<i class="fa-regular fa-clock conv-tick conv-t-pend" title="Enviando"></i>';
    if (status === 'enviada') return '<i class="fa-solid fa-check conv-tick" title="Enviada"></i>';
    if (status === 'entregue') return '<i class="fa-solid fa-check-double conv-tick" title="Entregue"></i>';
    if (status === 'lida') return '<i class="fa-solid fa-check-double conv-tick conv-t-lida" title="Lida"></i>';
    if (status === 'falha') return '<i class="fa-solid fa-circle-exclamation conv-tick conv-t-falha" title="Falhou"></i>';
    return '';
  }
  const tipoPeloMime = mime => /^image\//.test(mime) ? 'imagem' : /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'documento';
  const tamanho = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

  const pode = k => ZZ.pode ? ZZ.pode(k) : true;
  const nomeUsuario = () => { try { return String(ZZ.eu.usuario.nome || '').replace(/[*_~`\r\n]+/g, ' ').trim(); } catch (e) { return ''; } };
  const assinado = t => { const n = nomeUsuario(); return n ? `*${n}:*\n${t}` : t; };
  const semPerm = j => !!j && (j.sem_permissao || j.erro === 'sem_permissao' || /sem permiss/i.test(j.msg || ''));
  const fmtTexto = t => esc(t).replace(/^\*([^*\n]+)\*(?=\n|$)/, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
  const semPermHtml = (msg) => `<div class="vazio conv-erro"><i class="fa-solid fa-lock"></i>${esc(msg || 'Sem permissão para ver esta área.')}</div>`;

  function lerAuto() { try { return localStorage.getItem('zz.conv.autoLida') !== '0'; } catch (e) { return true; } }
  function gravarAuto(v) { try { localStorage.setItem('zz.conv.autoLida', v ? '1' : '0'); } catch (e) { } }

  /* Marcar como lida: automático (ao abrir, ao chegar nova recebida, ao voltar à aba) ou manual. */
  async function marcarLida(manual) {
    if (!S || !S.jid || !pode('conversas.marcar_lida')) return { ok: false };
    if (!manual && (!S.autoLida || document.hidden || Date.now() - S.ultMarca < 5000)) return { ok: false };
    const eu = S, jid = S.jid; S.ultMarca = Date.now();
    const r = await ZZ.api('marcar_lida', { corpo: { jid }, silencioso: !manual });
    if (S !== eu || !r || !r.ok) return r || { ok: false };
    const ch = S.chats.find(x => x.jid === jid);
    if (ch && ch.nao_lidas) { ch.nao_lidas = 0; renderLista(); const it = ZZ.$(`.conv-item[data-jid="${CSS.escape(jid)}"]`, S.el); if (it) { it.classList.add('conv-lido'); setTimeout(() => it.classList.remove('conv-lido'), 700); } }
    atualizarBadge();
    if (r.whatsapp === false) ZZ.toast('Marcada no painel; o WhatsApp não confirmou', 'info');
    carregarLista(false);
    return r;
  }
  function marcarDebounce() { if (!S) return; clearTimeout(S.tMarca); S.tMarca = setTimeout(() => marcarLida(false), 1500); }
  function atualizarBadge() {
    if (!S || S.q) return;
    const n = typeof S.totalNL === 'number' ? S.totalNL : null;
    ZZ.badge('conversas', S.chats.reduce((a, c) => a + (c.nao_lidas || 0), 0) || (n && !S.chats.length ? n : 0));
  }

  /* ---------- presença (digitando, gravando, online) ---------- */
  const estadoPres = p => !p ? '' : (typeof p === 'string' ? p : (p.estado || ''));
  function enviarPres(tipo, jid) {
    if (!jid || !pode('conversas.enviar')) return;
    try { Promise.resolve(ZZ.api('presenca', { corpo: { para: jid, tipo, ms: tipo === 'paused' ? 1000 : 10000 }, silencioso: true })).catch(() => { }); } catch (e) { }
  }
  function pararDig() {
    if (!S) return;
    clearTimeout(S.tIni); clearTimeout(S.tPaus); clearInterval(S.tRep); S.tIni = S.tPaus = S.tRep = null;
    if (S.dig) { enviarPres('paused', S.digJid); S.dig = false; }
  }
  function aoDigitar(t) {
    if (!S || !S.jid || !pode('conversas.enviar')) return;
    if (!t.value.trim()) { pararDig(); return; }
    S.ultDig = Date.now();
    if (!S.dig && !S.tIni) S.tIni = setTimeout(() => {
      S.tIni = null; if (!S || !S.jid || !t.value.trim()) return;
      S.dig = true; S.digJid = S.jid; enviarPres('composing', S.jid);
      S.tRep = setInterval(() => { if (S && S.dig && Date.now() - S.ultDig < 3000) enviarPres('composing', S.digJid); }, 8000);
    }, 800);
    clearTimeout(S.tPaus); S.tPaus = setTimeout(pararDig, 3000);
  }
  function textoPres() {
    const p = S.pres || {}; const est = p.estado || ''; const quem = Array.isArray(p.quem) ? p.quem : [];
    const n = quem.length;
    if (est === 'digitando') {
      const l = S.grupo && n ? (n === 1 ? `${esc(quem[0].nome || 'Alguém')} está digitando` : `${n} pessoas estão digitando`) : 'digitando';
      return `<span class="conv-pres conv-pres-dig">${l}<span class="conv-pontos"><i></i><i></i><i></i></span></span>`;
    }
    if (est === 'gravando') {
      const l = S.grupo && n ? (n === 1 ? `${esc(quem[0].nome || 'Alguém')} está gravando áudio` : `${n} pessoas estão gravando áudio`) : 'gravando áudio';
      return `<span class="conv-pres conv-pres-rec"><i class="fa-solid fa-microphone"></i> ${l}<span class="conv-pontos"><i></i><i></i><i></i></span></span>`;
    }
    if (est === 'online') return '<span class="conv-pres conv-pres-on">online</span>';
    const v = p.visto_por_ultimo;
    if (v) {
      if (typeof v === 'number' || /^\d+$/.test(String(v))) { const ts = +v; const d = rotuloDia(ts); return `<span class="conv-pres">visto por último ${d === 'Hoje' ? 'hoje' : d === 'Ontem' ? 'ontem' : 'em ' + esc(d)} às ${esc(ZZ.fmtHora(ts))}</span>`; }
      return `<span class="conv-pres">${esc(String(v))}</span>`;
    }
    return '';
  }
  function pintarPres() {
    if (!S || !S.jid) return;
    const el = ZZ.$('#convCabSub', S.el); if (!el) return;
    const h = textoPres();
    const sig = h || (S.grupo ? 'Grupo' : numeroDoJid(S.jid));
    if (S.sigPres === sig) return; S.sigPres = sig;
    if (h) el.innerHTML = h; else el.textContent = sig;
  }
  async function pollPres() {
    if (!S || !S.jid || document.hidden) return;
    const eu = S, jid = S.jid;
    S.pn2 = (S.pn2 || 0) + 1;
    if (S.pn2 % 30 === 0) Promise.resolve(ZZ.api('assinar_presenca', { corpo: { jid }, silencioso: true })).catch(() => { });
    const j = await ZZ.api('ver_presenca', { params: { jid }, silencioso: true });
    if (S !== eu || S.jid !== jid || !j || !j.ok) return;
    S.pres = { estado: j.estado || '', quem: j.quem || [], visto_por_ultimo: j.visto_por_ultimo }; pintarPres();
  }

  /* ---------- gravação de áudio ---------- */
  const mimeAudio = () => { if (!window.MediaRecorder) return ''; return ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || ''; };
  const podeGravar = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) && pode('conversas.enviar') && pode('enviar.midia');
  const cron = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function limparGrav(parar) {
    if (!S || !S.gr) return;
    const g = S.gr; clearInterval(g.tCron); clearInterval(g.tPres);
    try { if (g.rec && g.rec.state !== 'inactive') { g.cancel = true; g.rec.stop(); } } catch (e) { }
    try { g.stream && g.stream.getTracks().forEach(t => t.stop()); } catch (e) { }
    if (g.url) URL.revokeObjectURL(g.url);
    if (parar !== false) enviarPres('paused', g.jid);
    S.gr = null;
    const rb = ZZ.$('#convRec', S.el), ln = ZZ.$('.conv-comp-linha', S.el);
    if (rb) { rb.hidden = true; rb.innerHTML = ''; } if (ln) ln.hidden = false;
  }
  async function iniciarGrav() {
    if (!S || !S.jid || S.gr || !podeGravar()) return;
    const jid = S.jid; let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { ZZ.toast('Não foi possível acessar o microfone. Verifique a permissão do navegador.', 'err'); return; }
    if (!S || S.jid !== jid) { stream.getTracks().forEach(t => t.stop()); return; }
    const mime = mimeAudio(); let rec;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); } catch (e) { stream.getTracks().forEach(t => t.stop()); ZZ.toast('Gravação de áudio não suportada neste navegador.', 'err'); return; }
    const g = S.gr = { rec, stream, jid, partes: [], seg: 0, mime: rec.mimeType || mime || 'audio/webm' };
    rec.ondataavailable = e => { if (e.data && e.data.size) g.partes.push(e.data); };
    rec.onstop = () => { if (g.cancel || !S || S.gr !== g) return; const blob = new Blob(g.partes, { type: g.mime.split(';')[0] }); g.blob = blob; g.url = URL.createObjectURL(blob); stream.getTracks().forEach(t => t.stop()); mostrarPrevia(); };
    rec.start(250);
    pararDig(); enviarPres('recording', jid);
    g.tPres = setInterval(() => enviarPres('recording', jid), 8000);
    g.tCron = setInterval(() => { g.seg++; const c = ZZ.$('#convRecT', S.el); if (c) c.textContent = cron(g.seg); if (g.seg >= 300) pararGrav(); }, 1000);
    const rb = ZZ.$('#convRec', S.el), ln = ZZ.$('.conv-comp-linha', S.el); ln.hidden = true; rb.hidden = false;
    rb.innerHTML = '<button class="conv-rec-x" id="convRecX" aria-label="Cancelar gravação"><i class="fa-solid fa-trash"></i></button><span class="conv-rec-dot"></span><b id="convRecT">0:00</b><span class="conv-onda"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><button class="conv-enviar" id="convRecOk" aria-label="Parar gravação"><i class="fa-solid fa-stop"></i></button>';
    ZZ.$('#convRecX', S.el).onclick = () => { limparGrav(); ZZ.toast('Gravação cancelada', 'info'); };
    ZZ.$('#convRecOk', S.el).onclick = () => pararGrav();
  }
  function pararGrav() {
    if (!S || !S.gr || !S.gr.rec || S.gr.rec.state === 'inactive') return;
    clearInterval(S.gr.tCron); clearInterval(S.gr.tPres); enviarPres('paused', S.gr.jid);
    S.gr.rec.stop();
  }
  function mostrarPrevia() {
    const g = S.gr, rb = ZZ.$('#convRec', S.el); if (!rb) return;
    rb.innerHTML = `<button class="conv-rec-x" id="convRecX" aria-label="Descartar áudio"><i class="fa-solid fa-trash"></i></button><audio controls preload="metadata" src="${esc(g.url)}"></audio><button class="conv-enviar" id="convRecOk" aria-label="Enviar áudio"><i class="fa-solid fa-paper-plane"></i></button>`;
    ZZ.$('#convRecX', S.el).onclick = () => { limparGrav(false); ZZ.toast('Áudio descartado', 'info'); };
    ZZ.$('#convRecOk', S.el).onclick = () => {
      const ext = /ogg/.test(g.mime) ? 'ogg' : /mp4|m4a|aac/.test(g.mime) ? 'm4a' : 'webm';
      const f = new File([g.blob], 'audio-' + agora() + '.' + ext, { type: g.blob.type });
      const jid = g.jid; limparGrav(false);
      if (S.arq && S.arq.thumb) URL.revokeObjectURL(S.arq.thumb);
      S.arq = { file: f, thumb: '' }; enviar();
    };
  }

  /* ---------- lembretes de resposta ---------- */
  const podeLemb = () => !!window.ZZ.lembrete && pode(['conversas.ver', 'filas.atender']);
  async function carregarLembretes() {
    if (!S || !podeLemb()) return;
    const eu = S;
    const j = await ZZ.api('listar_lembretes', { params: { status: 'pendente' }, silencioso: true });
    if (S !== eu || !j || !j.ok) return;
    const m = new Map();
    (j.itens || []).forEach(i => { if (!m.has(i.jid) || i.quando < m.get(i.jid)) m.set(i.jid, i.quando); });
    S.lemb = m; S.sigLista = ''; renderLista(); pintarLemb();
  }
  function pintarLemb() {
    const b = S && ZZ.$('#convLemb', S.el); if (!b || !S.jid) return;
    const q = S.lemb && S.lemb.get(S.jid);
    b.classList.toggle('conv-lemb-on', !!q);
    const hoje = q && ZZ.fmtData(q) === ZZ.fmtData(agora());
    b.innerHTML = q ? `<i class="fa-solid fa-clock"></i> <span>Lembrete ${hoje ? '' : esc(ZZ.fmtData(q).slice(0, 5)) + ' '}às ${esc(ZZ.fmtHora(q))}</span>` : '<i class="fa-regular fa-clock"></i> <span>Lembrar</span>';
  }
  function abrirLembrete() {
    if (!S || !S.jid || !window.ZZ.lembrete) return;
    try { ZZ.lembrete.abrir(S.jid, S.nome || numeroDoJid(S.jid), () => carregarLembretes()); } catch (e) { ZZ.toast('Não foi possível abrir o lembrete', 'err'); }
  }

  /* ---------- página ---------- */
  ZZ.pagina({
    id: 'conversas', titulo: 'Conversas', icone: 'fa-comments', ordem: 2, tab: true,
    render(el, ctx) { iniciar(el, ctx); },
    destroy() { encerrar(); }
  });

  function iniciar(el, ctx) {
    S = {
      lemb: new Map(), el, chats: [], q: '', mais: 0, temMais: false, carregouLista: false, seqLista: 0, sigLista: '', prevMapa: new Map(),
      jid: null, nome: '', foto: '', grupo: false, srv: new Map(), pend: [], temAntigas: true, carregandoAntigas: false,
      sigChat: '', sigStatus: new Map(), novas: 0, midias: new Map(), seqChat: 0, empurrou: false, tmpN: 0, arq: null,
      pollando: false, escutas: [], autoLida: lerAuto(), ultMarca: 0, tMarca: null
    };
    document.body.classList.add('conv-pagina');
    el.innerHTML = `
    <div class="conv-raiz" id="convRaiz">
      <section class="conv-col-lista">
        <div class="conv-busca">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="search" id="convQ" placeholder="Buscar conversa ou número" autocomplete="off" aria-label="Buscar conversa">
          <span class="vivo conv-vivo">ao vivo</span>
        </div>
        <div class="conv-lista" id="convLista">${ZZ.skeleton(7, 'skel-linha conv-skel')}</div>
      </section>
      <section class="conv-col-chat" id="convChat">
        <div class="conv-chat-vazio"><i class="fa-regular fa-comments"></i><p>Selecione uma conversa<br><span class="mut">As mensagens aparecem aqui.</span></p></div>
      </section>
    </div>`;
    const q = ZZ.$('#convQ', el);
    q.addEventListener('input', ZZ.debounce(() => { S.q = q.value.trim(); S.mais = 0; carregarLista(true); }, 350));
    ZZ.$('#convLista', el).addEventListener('click', aoClicarLista);
    el.addEventListener('error', e => { // foto quebrada -> iniciais
      const t = e.target; if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.dataset && t.parentNode.dataset.ini) { t.parentNode.textContent = t.parentNode.dataset.ini; }
    }, true);
    const onPop = () => { if (S && S.jid && S.empurrou) { S.empurrou = false; fecharChat(true); } };
    window.addEventListener('popstate', onPop); S.escutas.push(['popstate', onPop, window]);
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const aj = () => ajustarViewport();
      vv.addEventListener('resize', aj); vv.addEventListener('scroll', aj);
      S.escutas.push(['resize', aj, vv], ['scroll', aj, vv]);
    }
    const onVis = () => { if (!document.hidden && S && S.jid) marcarLida(false); };
    document.addEventListener('visibilitychange', onVis); S.escutas.push(['visibilitychange', onVis, document]);
    const onLb = () => carregarLembretes();
    document.addEventListener('zz:lembretes', onLb); S.escutas.push(['zz:lembretes', onLb, document]);
    carregarLembretes(); ZZ.poll(() => carregarLembretes(), 30000);
    carregarLista(true);
    ZZ.poll(() => carregarLista(false), 8000);
    ZZ.poll(() => pollChat(), 4000);
    ZZ.poll(() => pollPres(), 2000);
    if (ctx && ctx.params && ctx.params.jid) abrirChat(ctx.params.jid);
  }

  function encerrar() {
    if (!S) return;
    S.escutas.forEach(([ev, fn, alvo]) => alvo.removeEventListener(ev, fn));
    clearTimeout(S.tMarca); pararDig(); limparGrav();
    document.body.classList.remove('conv-pagina', 'conv-chat-aberto');
    S.pend.forEach(p => { if (p.thumb) URL.revokeObjectURL(p.thumb); });
    if (S.arq && S.arq.thumb) URL.revokeObjectURL(S.arq.thumb);
    S = null;
  }

  function ajustarViewport() {
    if (!S || !S.jid || ehDesktop()) return;
    const c = ZZ.$('#convChat', S.el); if (!c) return;
    const vv = window.visualViewport;
    c.style.height = vv.height + 'px'; c.style.top = vv.offsetTop + 'px'; c.style.bottom = 'auto';
    const m = ZZ.$('#convMsgs', S.el); if (m && S.noFim) m.scrollTop = m.scrollHeight;
  }

  /* ---------- lista de conversas ---------- */
  async function carregarLista(mostrarEsq) {
    if (!S) return;
    const eu = S, seq = ++S.seqLista;
    const lista = ZZ.$('#convLista', S.el);
    if (mostrarEsq && lista && !S.chats.length) lista.innerHTML = ZZ.skeleton(7, 'skel-linha conv-skel');
    const j = await ZZ.api('chats', { params: { q: S.q, mais: S.mais }, silencioso: true });
    if (S !== eu || seq !== S.seqLista) return;
    if (semPerm(j)) { lista.innerHTML = semPermHtml('Você não tem permissão para ver as conversas.'); return; }
    if (!j.ok) {
      if (!S.carregouLista || mostrarEsq) lista.innerHTML = `<div class="vazio conv-erro"><i class="fa-solid fa-triangle-exclamation"></i>${esc(j.msg || 'Não foi possível carregar as conversas.')}<br><button class="btn-azul btn-sm" id="convRetry" style="margin-top:12px">Tentar de novo</button></div>`;
      const b = ZZ.$('#convRetry', lista); if (b) b.onclick = () => ZZ.busy(b, async () => { await carregarLista(true); return true; });
      return;
    }
    S.carregouLista = true; S.chats = j.chats || []; S.temMais = !!j.tem_mais;
    S.totalNL = typeof j.total_nao_lidas === 'number' ? j.total_nao_lidas : null;
    if (!S.q) ZZ.badge('conversas', S.totalNL !== null ? S.totalNL : S.chats.reduce((a, c) => a + (c.nao_lidas || 0), 0));
    renderLista();
  }

  function itemHtml(c) {
    const u = c.ultima || {};
    let previa = u.texto || (u.tipo && u.tipo !== 'texto' ? ROTULO_TIPO[u.tipo] || '' : '');
    const ic = u.tipo && u.tipo !== 'texto' ? `<i class="fa-solid ${ICONE_TIPO[u.tipo] || 'fa-message'} conv-pic"></i>` : '';
    const tk = u.fromMe ? tickHtml(u.status || 'enviada') : '';
    const nl = c.nao_lidas || 0;
    const pr = estadoPres(c.presenca);
    const previaHtml = pr === 'digitando' ? '<span class="conv-pres-l">digitando<span class="conv-pontos"><i></i><i></i><i></i></span></span>' : pr === 'gravando' ? '<span class="conv-pres-l"><i class="fa-solid fa-microphone"></i> gravando áudio<span class="conv-pontos"><i></i><i></i><i></i></span></span>' : '';
    return `<div class="conv-item${S.jid === c.jid ? ' conv-sel' : ''}${nl ? ' conv-nl' : ''}" data-jid="${esc(c.jid)}" role="button" tabindex="0">
      ${avatarHtml(c.nome, c.foto)}
      <div class="conv-corpo">
        <div class="conv-l1"><span class="conv-nome">${esc(c.nome || numeroDoJid(c.jid) || c.jid)}${c.grupo ? ' <i class="fa-solid fa-user-group conv-grupo" title="Grupo"></i>' : ''}${S.lemb.has(c.jid) ? ' <i class="fa-solid fa-clock conv-lemb-i" title="Lembrete pendente"></i>' : ''}</span><span class="conv-hora">${c.ts ? esc(horaLista(c.ts)) : ''}</span></div>
        <div class="conv-l2"><span class="conv-previa">${previaHtml || (tk + ic + esc(previa))}</span>${nl ? `<span class="conv-badge">${nl > 99 ? '99+' : nl}</span>` : ''}</div>
      </div></div>`;
  }

  function renderLista() {
    const lista = ZZ.$('#convLista', S.el); if (!lista) return;
    const sig = JSON.stringify([S.chats, S.jid, S.temMais, S.q, [...S.lemb.keys()]]);
    if (sig === S.sigLista) return;
    S.sigLista = sig;
    const mudou = new Set();
    if (S.prevMapa.size) S.chats.forEach(c => { const p = S.prevMapa.get(c.jid); const k = c.ts + '|' + (c.nao_lidas || 0); if (!p || p !== k) mudou.add(c.jid); });
    S.prevMapa = new Map(S.chats.map(c => [c.jid, c.ts + '|' + (c.nao_lidas || 0)]));
    const topo = lista.scrollTop;
    if (!S.chats.length) {
      lista.innerHTML = `<div class="vazio"><i class="fa-regular fa-comments"></i>${S.q ? 'Nenhuma conversa encontrada para essa busca.' : 'Nenhuma conversa ainda.'}</div>`;
      return;
    }
    lista.innerHTML = S.chats.map(itemHtml).join('') + (S.temMais ? '<div class="conv-mais"><button class="btn-soft" id="convMais"><i class="fa-solid fa-angles-down"></i> Carregar mais conversas</button></div>' : '');
    lista.scrollTop = topo;
    mudou.forEach(j => { const it = lista.querySelector(`.conv-item[data-jid="${CSS.escape(j)}"]`); if (it) it.classList.add('conv-novo'); });
    setTimeout(() => { ZZ.$$('.conv-novo', lista).forEach(x => x.classList.remove('conv-novo')); }, 2000);
    const bm = ZZ.$('#convMais', lista);
    if (bm) bm.onclick = () => ZZ.busy(bm, async () => { S.mais++; await carregarLista(false); return true; });
  }

  function aoClicarLista(e) {
    const it = e.target.closest('.conv-item'); if (!it) return;
    abrirChat(it.dataset.jid);
  }

  /* ---------- chat ---------- */
  function montarChat() {
    const c = ZZ.$('#convChat', S.el);
    c.innerHTML = `
      <header class="conv-cab">
        <button class="conv-voltar" id="convVoltar" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i></button>
        <span id="convCabAv"></span>
        <div class="conv-cab-info"><b id="convCabNome"></b><span id="convCabSub" class="mut"></span></div>
        <button class="btn-soft btn-sm conv-cab-btn" id="convLida" hidden title="Marcar como lida" aria-label="Marcar como lida"><i class="fa-solid fa-check-double"></i><span>Marcar como lida</span></button>
        <button class="btn-soft btn-sm conv-cab-btn conv-menu-b" id="convMenuB" aria-label="Mais opções" title="Mais opções"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        <button class="btn-soft btn-sm conv-cab-btn" id="convOutro" title="Enviar para outro número" aria-label="Enviar para outro número"><i class="fa-solid fa-paper-plane"></i><span>Enviar para outro número</span></button>
      </header>
      <div class="conv-sub" id="convSub" hidden></div>
      <div class="conv-msgs" id="convMsgs"><div class="conv-sk">${ZZ.skeleton(5, 'skel-linha conv-skel')}</div></div>
      <button class="conv-novas" id="convNovas" hidden><i class="fa-solid fa-arrow-down"></i> <span></span></button>
      <div class="conv-comp">
        <div class="conv-assina" id="convAssina"></div>
        <div class="conv-sug" id="convSug" hidden></div>
        <div class="conv-prev" id="convPrev" hidden></div>
        <div class="conv-rec" id="convRec" hidden></div>
        <div class="conv-comp-linha">
          <button class="conv-clipe" id="convBarra" aria-label="Respostas rápidas" title="Respostas rápidas" hidden><i class="fa-solid fa-bolt"></i></button>
          <button class="conv-clipe" id="convClipe" aria-label="Anexar arquivo" title="Anexar arquivo"><i class="fa-solid fa-paperclip"></i></button>
          <input type="file" id="convArq" hidden accept="image/*,video/mp4,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip">
          <textarea id="convTxt" rows="1" placeholder="Mensagem" aria-label="Mensagem" enterkeyhint="send"></textarea>
          <button class="conv-clipe" id="convMic" aria-label="Gravar áudio" title="Gravar áudio" hidden><i class="fa-solid fa-microphone"></i></button>
          <button class="conv-enviar" id="convEnviar" aria-label="Enviar"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>`;
    const m = ZZ.$('#convMsgs', c);
    m.addEventListener('scroll', aoRolar, { passive: true });
    m.addEventListener('click', aoClicarMsgs);
    ZZ.$('#convVoltar', c).onclick = () => voltar();
    ZZ.$('#convOutro', c).onclick = () => ZZ.ir('enviar');
    const mb = ZZ.$('#convMenuB', c);
    mb.onclick = e => {
      e.stopPropagation();
      const ex = ZZ.$('.conv-menu', c); if (ex) { ex.remove(); return; }
      const mn = document.createElement('div'); mn.className = 'conv-menu';
      mn.innerHTML = `${pode('conversas.marcar_lida') ? '<button class="conv-mi" data-m="lida"><i class="fa-solid fa-check-double"></i> Marcar como lida</button>' : ''}${podeLemb() ? '<button class="conv-mi" data-m="lemb"><i class="fa-regular fa-clock"></i> Lembrar de responder</button>' : ''}<button class="conv-mi" data-m="outro"><i class="fa-solid fa-paper-plane"></i> Enviar para outro número</button>${pode('conversas.marcar_lida') ? `<label class="conv-sw"><input type="checkbox" ${S.autoLida ? 'checked' : ''}><span>Marcar como lida ao abrir</span></label>` : ''}`;
      ZZ.$('.conv-cab', c).appendChild(mn);
      mn.onclick = ev => { const b = ev.target.closest('.conv-mi'); if (!b) return; mn.remove(); if (b.dataset.m === 'lida') ZZ.$('#convLida', c).click(); else if (b.dataset.m === 'lemb') abrirLembrete(); else ZZ.ir('enviar'); };
      const inp = mn.querySelector('input'); if (inp) inp.onchange = ev => { S.autoLida = ev.target.checked; gravarAuto(S.autoLida); ZZ.toast(S.autoLida ? 'Marcação automática ligada' : 'Marcação automática desligada', 'ok'); if (S.autoLida) marcarLida(false); mn.remove(); };
      const fora = ev => { if (!mn.contains(ev.target)) { mn.remove(); document.removeEventListener('click', fora); } };
      setTimeout(() => document.addEventListener('click', fora), 0);
    };
    const bl = ZZ.$('#convLida', c); bl.hidden = !pode('conversas.marcar_lida');
    bl.onclick = () => ZZ.busy(bl, async () => {
      const r = await marcarLida(true);
      if (r && r.ok) ZZ.toast('Conversa marcada como lida', 'ok');
      return r;
    });
    const t = ZZ.$('#convTxt', c);
    t.addEventListener('input', () => { cresce(t); aoDigitar(t); const mc = ZZ.$('#convMic', c); if (mc && podeGravar()) mc.hidden = !!t.value.trim() || !!S.arq; });
    t.addEventListener('focus', () => setTimeout(() => { const cm = ZZ.$('.conv-comp', c); cm && cm.scrollIntoView({ block: 'end' }); if (S.noFim) fundo(); }, 300));
    t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && teclaEnterEnvia() && !e.isComposing) { e.preventDefault(); enviar(); } });
    ZZ.$('#convEnviar', c).onclick = e => { e.preventDefault(); enviar(); };
    ZZ.$('#convClipe', c).onclick = () => ZZ.$('#convArq', c).click();
    ZZ.$('#convArq', c).onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) escolherArquivo(f); };
    ZZ.$('#convNovas', c).onclick = () => { fundo(true); };
    // permissões e assinatura
    const nome = nomeUsuario();
    ZZ.$('#convAssina', c).innerHTML = nome ? `<i class="fa-solid fa-signature"></i> Sai assinada como <b>*${esc(nome)}:*</b>` : '';
    ZZ.$('#convAssina', c).hidden = !nome;
    if (!pode('conversas.enviar')) {
      ZZ.$('.conv-comp', c).innerHTML = '<div class="conv-semperm"><i class="fa-solid fa-lock"></i> Sem permissão para responder nesta conversa.</div>';
    } else {
      if (!(pode('enviar.midia'))) ZZ.$('#convClipe', c).hidden = true;
      const mc = ZZ.$('#convMic', c); if (podeGravar()) { mc.hidden = false; mc.onclick = () => iniciarGrav(); }
      const bb = ZZ.$('#convBarra', c);
      if (window.ZZ.respostasRapidas) {
        bb.hidden = false;
        bb.onclick = () => { try { ZZ.respostasRapidas.abrir({ jid: S.jid, nome: S.nome, aoEscolher: txt => inserirTexto(txt), alvo: t }); } catch (e) { } };
        t.addEventListener('input', () => sugerirAtalho(t));
      }
    }
    montarSub();
  }

  function inserirTexto(txt) {
    const t = ZZ.$('#convTxt', S.el); if (!t || typeof txt !== 'string') return;
    t.value = txt; cresce(t); t.focus();
    const sg = ZZ.$('#convSug', S.el); if (sg) sg.hidden = true;
  }
  async function sugerirAtalho(t) {
    const sg = ZZ.$('#convSug', S.el); if (!sg) return;
    const m = /^\/(\S*)$/.exec(t.value);
    if (!m || !window.ZZ.respostasRapidas || !ZZ.respostasRapidas.sugerir) { sg.hidden = true; return; }
    let itens; try { itens = await ZZ.respostasRapidas.sugerir(m[1], { jid: S.jid, nome: S.nome }); } catch (e) { itens = null; }
    if (!S || !Array.isArray(itens) || !itens.length || !/^\/(\S*)$/.test(t.value)) { sg.hidden = true; return; }
    sg.hidden = false;
    sg.innerHTML = itens.slice(0, 6).map((r, i) => `<button class="conv-sug-i" data-i="${i}"><b>/${esc(r.atalho || '')}</b><span>${esc((r.texto || r.titulo || '').slice(0, 80))}</span></button>`).join('');
    sg.onclick = e => { const b = e.target.closest('.conv-sug-i'); if (b) inserirTexto(itens[+b.dataset.i].texto || ''); };
  }

  /* ---------- etiquetas, notas e atendimento no cabeçalho ---------- */
  async function montarSub() {
    const sub = ZZ.$('#convSub', S.el); if (!sub) return;
    const jid = S.jid, nome = S.nome;
    let h = '';
    const temEt = window.ZZ.etiquetas && pode('etiquetas.ver');
    const temNt = window.ZZ.notas && pode('notas.ver');
    if (temEt) h += '<span class="conv-chips" id="convChips"></span><button class="btn-soft btn-sm conv-sb" id="convEt"><i class="fa-solid fa-tag"></i> Etiquetas</button>';
    if (temNt) h += '<button class="btn-soft btn-sm conv-sb" id="convNt"><i class="fa-regular fa-note-sticky"></i> Notas</button>';
    const temLb = podeLemb();
    if (temLb) h += '<button class="btn-soft btn-sm conv-sb" id="convLemb"></button>';
    h += '<span class="conv-atend" id="convAtend"></span>';
    sub.innerHTML = h; sub.hidden = !(temEt || temNt || temLb);
    if (temLb) { ZZ.$('#convLemb', S.el).onclick = abrirLembrete; pintarLemb(); }
    if (temEt) {
      const pintar = async () => {
        const ch = ZZ.$('#convChips', S.el); if (!ch || S.jid !== jid) return;
        try { const r = await ZZ.etiquetas.chips(jid); if (S.jid !== jid) return; if (typeof r === 'string') ch.innerHTML = r; else if (r instanceof Node) { ch.innerHTML = ''; ch.appendChild(r); } } catch (e) { }
      };
      pintar();
      const be = ZZ.$('#convEt', S.el);
      be.onclick = () => { try { ZZ.etiquetas.abrirSeletor(jid, pintar); } catch (e) { ZZ.toast('Não foi possível abrir as etiquetas', 'err'); } };
    }
    if (temNt) ZZ.$('#convNt', S.el).onclick = () => { try { ZZ.notas.abrir(jid, nome || S.nome); } catch (e) { ZZ.toast('Não foi possível abrir as notas', 'err'); } };
    carregarAtendimento();
  }

  async function carregarAtendimento() {
    if (!S || !S.jid || !pode('filas.ver')) return;
    const jid = S.jid, el = S.el;
    const num = (jid.split('@')[0] || '').replace(/\D/g, '');
    const j = await ZZ.api('listar_atendimentos', { params: { q: num }, silencioso: true });
    if (!S || S.jid !== jid || !j || !j.ok) return;
    const lista = j.itens || j.atendimentos || [];
    const a = lista.find(x => x.jid === jid && !/encerr|finaliz/i.test(x.status || '')) || lista.find(x => !/encerr|finaliz/i.test(x.status || '') && String(x.jid || x.numero || '').replace(/\D/g, '').includes(num));
    S.atend = a || null;
    const box = ZZ.$('#convAtend', el), sub = ZZ.$('#convSub', el); if (!box) return;
    if (!a) { box.innerHTML = ''; return; }
    const fila = a.fila_nome || (a.fila && a.fila.nome) || a.fila || '';
    const at = a.atendente_nome || (a.atendente && a.atendente.nome) || (typeof a.atendente === 'string' ? a.atendente : '');
    const sem = !at;
    let b = `<span class="badge-status ${sem ? 'b-pend' : 'b-ok'}"><i class="fa-solid fa-headset"></i> ${esc(fila || 'Atendimento')}${at ? ' · ' + esc(at) : ' · aguardando'}</span>`;
    if (pode('filas.atender') && (sem || (ZZ.eu && at && at !== ZZ.eu.usuario.nome))) b += '<button class="btn-azul btn-sm conv-sb" data-at="assumir"><i class="fa-solid fa-hand"></i> Assumir</button>';
    if (pode('filas.transferir')) b += '<button class="btn-soft btn-sm conv-sb" data-at="transferir"><i class="fa-solid fa-right-left"></i> Transferir</button><button class="btn-perigo btn-sm conv-sb" data-at="encerrar"><i class="fa-solid fa-flag-checkered"></i> Encerrar</button>';
    box.innerHTML = b; if (sub) sub.hidden = false;
    box.onclick = e => { const bt = e.target.closest('[data-at]'); if (bt) acaoAtendimento(bt, bt.dataset.at); };
  }

  function acaoAtendimento(btn, acao) {
    const a = S.atend; if (!a) return;
    const id = a.id;
    if (acao === 'assumir') return ZZ.busy(btn, async () => { const r = await ZZ.api('assumir_atendimento', { corpo: { id } }); if (r.ok) { ZZ.toast('Você assumiu o atendimento', 'ok'); carregarAtendimento(); } return r; });
    if (acao === 'encerrar') return ZZ.confirmar('Encerrar este atendimento?', 'Encerrar', true).then(ok => ok && ZZ.busy(btn, async () => { const r = await ZZ.api('encerrar_atendimento', { corpo: { id } }); if (r.ok) { ZZ.toast('Atendimento encerrado', 'ok'); carregarAtendimento(); } return r; }));
    return transferir(id);
  }

  async function transferir(id) {
    const m = ZZ.modal('<h3>Transferir atendimento</h3><div id="convTrBox">' + ZZ.skeleton(2) + '</div><div class="acoes"><button class="btn-soft" data-n>Cancelar</button><button class="btn-azul" data-s disabled>Transferir</button></div>');
    m.el.querySelector('[data-n]').onclick = () => m.fechar();
    const r = await ZZ.api('listar_filas', { silencioso: true });
    const box = m.el.querySelector('#convTrBox'); if (!box) return;
    const filas = (r && r.ok && (r.filas || r.itens)) || [];
    if (!filas.length) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-circle-info"></i>Nenhuma fila disponível.</div>'; return; }
    box.innerHTML = '<label for="convTrFila">Enviar para a fila</label><select id="convTrFila">' + filas.map(f => `<option value="${esc(f.id)}">${esc(f.nome || f.id)}</option>`).join('') + '</select>';
    const bs = m.el.querySelector('[data-s]'); bs.disabled = false;
    bs.onclick = () => ZZ.busy(bs, async () => {
      const fila_id = +m.el.querySelector('#convTrFila').value || m.el.querySelector('#convTrFila').value;
      const x = await ZZ.api('transferir_atendimento', { corpo: { id, fila_id } });
      if (x.ok) { ZZ.toast('Atendimento transferido', 'ok'); m.fechar(); carregarAtendimento(); }
      return x;
    });
  }
  const cresce = t => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 130) + 'px'; };

  function pintarCabecalho() {
    const c = S.el; if (!ZZ.$('#convCabNome', c)) return;
    ZZ.$('#convCabNome', c).textContent = S.nome || numeroDoJid(S.jid) || S.jid;
    S.sigPres = null; ZZ.$('#convCabSub', c).textContent = S.grupo ? 'Grupo' : numeroDoJid(S.jid); pintarPres();
    ZZ.$('#convCabAv', c).innerHTML = avatarHtml(S.nome, S.foto);
  }

  function abrirChat(jid) {
    if (!S) return;
    pararDig(); limparGrav();
    const ch = S.chats.find(x => x.jid === jid);
    S.jid = jid; S.nome = ch ? ch.nome : ''; S.foto = ch ? ch.foto : ''; S.grupo = ch ? !!ch.grupo : /@g\.us$/.test(jid);
    S.srv = new Map(); S.pend = S.pend.filter(p => p.jid === jid); S.temAntigas = true; S.sigChat = ''; S.sigStatus = new Map(); S.novas = 0; S.noFim = true; S.arq = null; S.seqChat++;
    S.pres = null; montarChat(); pintarCabecalho();
    Promise.resolve(ZZ.api('assinar_presenca', { corpo: { jid }, silencioso: true })).catch(() => { }); pollPres();
    ZZ.$('#convRaiz', S.el).classList.add('conv-aberto');
    document.body.classList.add('conv-chat-aberto');
    if (!ehDesktop() && !S.empurrou) { try { history.pushState({ convChat: 1 }, '', location.href); S.empurrou = true; } catch (e) { } }
    ajustarViewport();
    renderLista();
    carregarMsgs();
  }

  function voltar() {
    if (S && S.empurrou) { history.back(); return; } // popstate fecha
    fecharChat(true);
  }

  function fecharChat() {
    if (!S) return;
    pararDig(); limparGrav();
    S.jid = null; S.seqChat++;
    document.body.classList.remove('conv-chat-aberto');
    const raiz = ZZ.$('#convRaiz', S.el); if (raiz) raiz.classList.remove('conv-aberto');
    const c = ZZ.$('#convChat', S.el);
    if (c) { c.style.height = ''; c.style.top = ''; c.style.bottom = ''; c.innerHTML = '<div class="conv-chat-vazio"><i class="fa-regular fa-comments"></i><p>Selecione uma conversa<br><span class="mut">As mensagens aparecem aqui.</span></p></div>'; }
    S.pend.forEach(p => { if (p.status === 'falha' && p.thumb) URL.revokeObjectURL(p.thumb); });
    S.pend = []; S.arq = null;
    renderLista(); carregarLista(false);
  }

  async function carregarMsgs() {
    const eu = S, jid = S.jid, seq = S.seqChat;
    const j = await ZZ.api('msgs', { params: { jid }, silencioso: true });
    if (S !== eu || seq !== S.seqChat) return;
    const box = ZZ.$('#convMsgs', S.el); if (!box) return;
    if (semPerm(j)) { box.innerHTML = semPermHtml('Você não tem permissão para ver as mensagens desta conversa.'); return; }
    if (!j.ok) {
      box.innerHTML = `<div class="vazio conv-erro"><i class="fa-solid fa-triangle-exclamation"></i>${esc(j.msg || 'Não foi possível carregar as mensagens.')}<br><button class="btn-azul btn-sm" id="convRetry2" style="margin-top:12px">Tentar de novo</button></div>`;
      const b = ZZ.$('#convRetry2', box); if (b) b.onclick = () => ZZ.busy(b, async () => { box.innerHTML = `<div class="conv-sk">${ZZ.skeleton(5, 'skel-linha conv-skel')}</div>`; await carregarMsgs(); return true; });
      return;
    }
    if (j.nome) S.nome = j.nome; if (typeof j.grupo === 'boolean') S.grupo = j.grupo;
    pintarCabecalho();
    (j.msgs || []).forEach(m => S.srv.set(m.id, m));
    S.temAntigas = (j.msgs || []).length >= 60;
    renderMsgs('fundo');
    marcarLida(false);
  }

  async function pollChat() {
    if (!S || !S.jid || S.pollando) return;
    const eu = S, jid = S.jid, seq = S.seqChat; S.pollando = true;
    try {
      const j = await ZZ.api('msgs', { params: { jid }, silencioso: true });
      if (S !== eu || seq !== S.seqChat || !j.ok) return;
      if (!S.srv.size && !(j.msgs || []).length) { renderMsgs('manter'); return; }
      (j.msgs || []).forEach(m => S.srv.set(m.id, m));
      renderMsgs('auto');
      S.pn = (S.pn || 0) + 1; if (S.pn % 5 === 0) carregarAtendimento();
    } finally { if (S === eu) S.pollando = false; }
  }

  function listaFinal() {
    const srv = [...S.srv.values()];
    const pend = S.pend.filter(p => {
      if (p.msgId && S.srv.has(p.msgId)) { if (p.thumb) URL.revokeObjectURL(p.thumb); return false; }
      if (p.status === 'enviada' && !p.msgId && srv.some(m => m.fromMe && m.ts >= p.ts - 10 && m.tipo === p.tipo && (p.arquivo || (m.texto || '') === (p.texto || '')))) { if (p.thumb) URL.revokeObjectURL(p.thumb); return false; }
      return true;
    });
    S.pend = pend;
    const todas = srv.concat(pend.map(p => ({ id: p.tmp, fromMe: true, ts: p.ts, tipo: p.tipo, texto: p.texto, status: p.status, midia: false, arquivo: p.arquivo ? p.arquivo.name : '', autor: '', citada: null, _p: p })));
    todas.sort((a, b) => a.ts - b.ts || (a._p ? 1 : 0) - (b._p ? 1 : 0));
    return todas;
  }

  function bolhaHtml(m, grupoAutor) {
    const p = m._p;
    let corpo = '';
    if (!p && m.midia) {
      const cache = S.midias.get(S.jid + '|' + m.id);
      corpo += `<div class="conv-midia" data-mid="${esc(m.id)}">${cache ? midiaHtml(cache) : !pode('conversas.midia') ? `<span class="conv-semmidia"><i class="fa-solid fa-lock"></i> Sem permissão para abrir ${MIDIA_ROTULO[m.tipo] || 'mídia'}</span>` : `<button class="btn-soft btn-sm conv-carregar" data-carregar="${esc(m.id)}"><i class="fa-solid ${ICONE_TIPO[m.tipo] || 'fa-download'}"></i> Carregar ${MIDIA_ROTULO[m.tipo] || 'mídia'}${m.arquivo && m.tipo === 'documento' ? ' · ' + esc(m.arquivo) : ''}</button>`}</div>`;
    } else if (p && p.arquivo) {
      corpo += `<div class="conv-midia">${p.thumb && p.tipo === 'imagem' ? `<img src="${esc(p.thumb)}" alt="" class="conv-img">` : `<span class="conv-doc"><i class="fa-solid ${ICONE_TIPO[p.tipo] || 'fa-file'}"></i> ${esc(p.arquivo.name)}</span>`}${p.status === 'pend' ? `<div class="barra-prog conv-prog"><i style="width:${p.prog || 0}%"></i></div>` : ''}</div>`;
    }
    let txt = m.texto || '';
    if (!txt && !corpo) txt = '[' + (ROTULO_TIPO[m.tipo] || 'Mensagem') + ']';
    const cit = m.citada ? `<div class="conv-cit">${m.citada.autor ? `<b>${esc(m.citada.autor)}</b>` : ''}<span>${esc(m.citada.texto || '')}</span></div>` : '';
    const autor = grupoAutor && !m.fromMe && m.autor ? `<div class="conv-autor" style="color:${corAutor(m.autor)}">${esc(m.autor)}</div>` : '';
    const falha = p && p.status === 'falha';
    return `<div class="conv-bolha ${m.fromMe ? 'conv-env' : 'conv-rec'}${falha ? ' conv-falhou' : ''}${p && p.status === 'pend' ? ' conv-enviando' : ''}" data-id="${esc(m.id)}"${falha ? ' data-reenviar="' + esc(m.id) + '" role="button" tabindex="0"' : ''}>
      ${autor}${cit}${corpo}${txt ? `<div class="conv-texto">${fmtTexto(txt)}</div>` : ''}
      <div class="conv-meta"><span>${esc(ZZ.fmtHora(m.ts))}</span>${m.fromMe ? `<span class="conv-tk">${tickHtml(m.status)}</span>` : ''}</div>
      ${falha ? '<div class="conv-reenv"><i class="fa-solid fa-rotate-right"></i> Não enviada — tocar para reenviar</div>' : ''}
    </div>`;
  }

  function midiaHtml(c) {
    const src = esc(c.data_url);
    const mime = c.mime || '';
    if (/^image\//.test(mime)) return `<img class="conv-img" src="${src}" alt="${esc(c.nome || 'imagem')}">`;
    if (/^audio\//.test(mime)) return `<audio controls preload="metadata" src="${src}"></audio>`;
    if (/^video\//.test(mime)) return `<video controls playsinline preload="metadata" src="${src}"></video>`;
    return `<a class="conv-doc" href="${src}" download="${esc(c.nome || 'arquivo')}"><i class="fa-solid fa-download"></i> ${esc(c.nome || 'Baixar arquivo')}</a>`;
  }

  function renderMsgs(modo) {
    const box = ZZ.$('#convMsgs', S.el); if (!box) return;
    const todas = listaFinal();
    const estrutura = todas.map(m => m.id + (m._p ? ':' + m._p.status : '')).join(',') + '|' + S.temAntigas;
    const eraNoFim = noFim(box);
    const idsAntes = new Set([...S.sigStatus.keys()]);
    if (estrutura === S.sigChat) { // só status mudou?
      todas.forEach(m => {
        const ant = S.sigStatus.get(m.id);
        if (ant !== m.status) {
          S.sigStatus.set(m.id, m.status);
          const tk = box.querySelector(`.conv-bolha[data-id="${CSS.escape(m.id)}"] .conv-tk`);
          if (tk) tk.innerHTML = tickHtml(m.status);
        }
      });
      return;
    }
    const novos = todas.filter(m => !idsAntes.has(m.id));
    const primeira = S.sigChat === '';
    if (!primeira && novos.some(m => !m.fromMe)) marcarDebounce();
    S.sigChat = estrutura; S.sigStatus = new Map(todas.map(m => [m.id, m.status]));
    const altAntes = box.scrollHeight, topAntes = box.scrollTop;
    let html = '', dia = '';
    if (S.temAntigas && todas.length) html += '<div class="conv-antigas"><span class="conv-spin"></span> Carregando mensagens anteriores…</div>';
    else if (todas.length) html += '<div class="conv-inicio">Início da conversa</div>';
    for (const m of todas) {
      const d = ZZ.fmtData(m.ts);
      if (d !== dia) { dia = d; html += `<div class="conv-dia"><span>${esc(rotuloDia(m.ts))}</span></div>`; }
      html += bolhaHtml(m, S.grupo);
    }
    if (!todas.length) html = '<div class="vazio"><i class="fa-regular fa-message"></i>Nenhuma mensagem nesta conversa ainda.<br>Escreva abaixo para começar.</div>';
    box.innerHTML = html;
    if (modo === 'prepend') { box.scrollTop = topAntes + (box.scrollHeight - altAntes); return; }
    const propria = novos.some(m => m.fromMe && (m._p));
    if (modo === 'fundo' || primeira || (eraNoFim && modo !== 'manter') || propria) { fundo(); S.novas = 0; atualizarNovas(); }
    else {
      box.scrollTop = topAntes;
      const recebidas = novos.filter(m => !m.fromMe).length;
      if (recebidas && !primeira) { S.novas += recebidas; atualizarNovas(); }
    }
    if (todas.length && !primeira && novos.length) { /* destaque discreto */ novos.slice(-3).forEach(m => { const b = box.querySelector(`.conv-bolha[data-id="${CSS.escape(m.id)}"]`); if (b && !m._p) b.classList.add('conv-nova'); }); }
  }

  const noFim = box => box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  function fundo(suave) {
    const box = ZZ.$('#convMsgs', S.el); if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
    S.noFim = true; S.novas = 0; atualizarNovas();
    if (!suave) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  function atualizarNovas() {
    const b = ZZ.$('#convNovas', S.el); if (!b) return;
    b.hidden = !S.novas; const s = b.querySelector('span'); if (s) s.textContent = S.novas === 1 ? '1 nova' : S.novas + ' novas';
  }

  function aoRolar() {
    const box = ZZ.$('#convMsgs', S.el); if (!box) return;
    S.noFim = noFim(box);
    if (S.noFim && S.novas) { S.novas = 0; atualizarNovas(); }
    if (box.scrollTop < 80 && S.temAntigas && !S.carregandoAntigas && S.srv.size) carregarAntigas();
  }

  async function carregarAntigas() {
    const eu = S, seq = S.seqChat, jid = S.jid;
    S.carregandoAntigas = true;
    try {
      const ts = Math.min(...[...S.srv.values()].map(m => m.ts));
      const j = await ZZ.api('msgs', { params: { jid, antes: ts }, silencioso: true });
      if (S !== eu || seq !== S.seqChat) return;
      if (!j.ok) { ZZ.toast('Não foi possível carregar mensagens anteriores', 'err'); return; }
      const novas = (j.msgs || []).filter(m => !S.srv.has(m.id));
      novas.forEach(m => S.srv.set(m.id, m));
      if (!novas.length || (j.msgs || []).length < 60) S.temAntigas = false;
      renderMsgs('prepend');
    } finally { if (S === eu) S.carregandoAntigas = false; }
  }

  async function aoClicarMsgs(e) {
    const bc = e.target.closest('[data-carregar]');
    if (bc) {
      const id = bc.dataset.carregar, jid = S.jid;
      ZZ.busy(bc, async () => {
        const r = await ZZ.api('midia', { params: { jid, id } });
        if (r.ok && r.data_url) {
          S.midias.set(jid + '|' + id, r);
          const alvo = bc.closest('.conv-midia'); if (alvo) alvo.innerHTML = midiaHtml(r);
          return true;
        }
        return false;
      });
      return;
    }
    const rb = e.target.closest('[data-reenviar]');
    if (rb) { const p = S.pend.find(x => x.tmp === rb.dataset.reenviar); if (p) despachar(p); }
  }

  /* ---------- compositor / envio ---------- */
  function escolherArquivo(f) {
    if (f.size > LIMITE_ARQ) { ZZ.toast('Arquivo muito grande (máximo 25 MB).', 'err'); return; }
    if (S.arq && S.arq.thumb) URL.revokeObjectURL(S.arq.thumb);
    S.arq = { file: f, thumb: /^image\//.test(f.type) ? URL.createObjectURL(f) : '' };
    pintarPrevia();
    ZZ.$('#convTxt', S.el).placeholder = 'Legenda (opcional)';
    ZZ.$('#convTxt', S.el).focus();
  }
  function pintarPrevia() {
    const pv = ZZ.$('#convPrev', S.el); if (!pv) return;
    if (!S.arq) { pv.hidden = true; pv.innerHTML = ''; const t = ZZ.$('#convTxt', S.el); if (t) t.placeholder = 'Mensagem'; return; }
    const f = S.arq.file;
    pv.hidden = false;
    pv.innerHTML = `${S.arq.thumb ? `<img src="${esc(S.arq.thumb)}" alt="">` : `<span class="conv-prev-ic"><i class="fa-solid ${ICONE_TIPO[tipoPeloMime(f.type)] || 'fa-file'}"></i></span>`}<div class="conv-prev-i"><b>${esc(f.name)}</b><span class="mut">${esc(tamanho(f.size))}</span></div><button class="conv-prev-x" aria-label="Remover anexo"><i class="fa-solid fa-xmark"></i></button>`;
    pv.querySelector('.conv-prev-x').onclick = () => { if (S.arq.thumb) URL.revokeObjectURL(S.arq.thumb); S.arq = null; pintarPrevia(); };
  }

  function enviar() {
    if (!S || !S.jid || !pode('conversas.enviar')) return;
    const t = ZZ.$('#convTxt', S.el);
    const texto = t.value.trim();
    if (!S.arq && !texto) { t.focus(); ZZ.vibrar(20); t.classList.add('erro-campo'); setTimeout(() => t.classList.remove('erro-campo'), 700); return; }
    if (!S.arq && texto.length > 4096) { ZZ.toast('Mensagem muito longa (máximo 4096 caracteres).', 'err'); return; }
    const p = { tmp: 'tmp-' + (++S.tmpN), jid: S.jid, ts: agora(), status: 'pend', texto: texto ? assinado(texto) : '', bruto: texto, prog: 0 };
    if (S.arq) { p.arquivo = S.arq.file; p.thumb = S.arq.thumb; p.tipo = tipoPeloMime(S.arq.file.type); S.arq = null; pintarPrevia(); }
    else p.tipo = 'texto';
    t.value = ''; cresce(t); pararDig(); const mc2 = ZZ.$('#convMic', S.el); if (mc2 && podeGravar()) mc2.hidden = false;
    S.pend.push(p);
    renderMsgs('fundo');
    despachar(p);
    t.focus();
  }

  async function despachar(p) {
    const eu = S;
    p.status = 'pend'; p.prog = 0; renderMsgs('manter');
    let r;
    try {
      if (p.arquivo) r = await enviarArquivo(p);
      else r = await ZZ.api('enviar_texto', { corpo: { para: p.jid, texto: p.bruto }, silencioso: true });
    } catch (e) { r = { ok: false, msg: 'Falha ao enviar' }; }
    if (S !== eu) return;
    if (r && r.ok) { p.status = 'enviada'; p.msgId = r.msg_id || ''; ZZ.vibrar(8); }
    else { p.status = 'falha'; if (semPerm(r)) { p.status = 'falha'; ZZ.toast('Sem permissão para enviar nesta conversa.', 'err'); } else ZZ.toast((r && r.msg) || 'Não foi possível enviar a mensagem.', 'err'); }
    renderMsgs('manter');
    setTimeout(() => { pollChat(); carregarLista(false); }, 1200);
  }

  function enviarArquivo(p) {
    return new Promise(res => {
      const fd = new FormData(); fd.append('para', p.jid); fd.append('legenda', p.bruto || ''); fd.append('arquivo', p.arquivo, p.arquivo.name);
      const x = new XMLHttpRequest();
      x.open('POST', 'api.php?a=enviar_midia'); x.setRequestHeader('X-CSRF', ZZ.csrf); x.withCredentials = true;
      x.upload.onprogress = e => {
        if (!e.lengthComputable || !S) return; p.prog = Math.round(e.loaded / e.total * 100);
        const b = S.el.querySelector(`.conv-bolha[data-id="${CSS.escape(p.tmp)}"] .conv-prog i`); if (b) b.style.width = p.prog + '%';
      };
      x.onload = () => { let j; try { j = JSON.parse(x.responseText); } catch (e) { j = { ok: false, msg: 'Resposta inválida do servidor' }; } if (j.login) { location.reload(); return; } res(j); };
      x.onerror = () => res({ ok: false, msg: 'Sem conexão com o servidor' });
      x.ontimeout = () => res({ ok: false, msg: 'Tempo esgotado no envio' });
      x.timeout = 180000;
      x.send(fd);
    });
  }
})();
