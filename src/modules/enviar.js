/* Enviar — texto, mídia, enquete, localização e contato (com opção de agendar). Classes CSS: env-* */
(function () {
  const RK = 'zz_env_rascunho';
  const ABAS = [['texto', 'fa-font', 'Texto'], ['midia', 'fa-image', 'Mídia'], ['enquete', 'fa-square-poll-horizontal', 'Enquete'], ['local', 'fa-location-dot', 'Localização'], ['contato', 'fa-address-card', 'Contato']];
  const PERM_ABA = { texto: 'enviar.texto', midia: 'enviar.midia', enquete: 'enviar.enquete', local: 'enviar.localizacao', contato: 'enviar.contato' };
  const abasOk = () => ABAS.filter(a => ZZ.pode(PERM_ABA[a[0]]));
  const nomeAss = () => (ZZ.eu && ZZ.eu.usuario && ZZ.eu.usuario.nome) || '';
  const DICA_ASS = { texto: 'O texto sai com o seu nome na primeira linha.', midia: 'A legenda sai com o seu nome. Em áudios, o nome vai numa mensagem separada antes.', enquete: 'A pergunta da enquete sai com o seu nome.', local: 'O nome do local sai com o seu nome.', contato: 'O seu nome vai numa mensagem separada antes do cartão.' };
  const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.mp4,.mp3,.ogg,.m4a,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,image/*,video/mp4,audio/*';
  const MAX_MB = 25;

  const lerRasc = () => { try { return JSON.parse(localStorage.getItem(RK) || '{}') || {}; } catch (e) { return {}; } };
  const gravarRasc = o => { try { localStorage.setItem(RK, JSON.stringify(o)); } catch (e) { } };
  const limparRasc = () => { try { localStorage.removeItem(RK); } catch (e) { } };

  const mascara = v => {
    let d = String(v).replace(/\D/g, '');
    if (d.startsWith('55') && d.length > 11) return '+55 ' + mascara(d.slice(2));
    d = d.slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  /** Dígitos com DDI 55 quando for número BR sem DDI. */
  const normNum = v => { const d = String(v).replace(/\D/g, ''); return (d.length === 10 || d.length === 11) ? '55' + d : d; };
  const tamanho = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const pad = n => String(n).padStart(2, '0');
  const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  let S, raiz, ctxp, abort;

  function novoEstado(params) {
    const r = lerRasc();
    return { aba: (abasOk()[0] || ['texto'])[0], para: params.para || r.para || '', nome: params.para ? '' : (r.nome || ''), jid: '', verif: null, arquivo: null, agendar: false, quando: '', digitando: false, digMs: 3000, ocupado: false, prog: 0, rasc: r };
  }

  function render(el, ctx) {
    ctxp = ctx; raiz = el; S = novoEstado(ctx.params || {});
    if (S.para && /@/.test(S.para)) { S.jid = S.para; S.nome = ''; }
    if (!abasOk().length) { el.innerHTML = '<div class="vazio"><i class="fa-solid fa-lock"></i>Você não tem permissão para enviar mensagens.<br><span class="mut">Fale com o administrador.</span></div>'; return; }
    el.innerHTML = `<div class="env">
      <div class="env-por" id="envPor"></div>
      <div class="env-ass" id="envAss" role="note"><i class="fa-solid fa-signature"></i><span>Sua mensagem sairá assinada: <b>*${ZZ.esc(nomeAss())}:*</b><small id="envAssDica" class="mut"></small></span></div>
      <div class="card-soft env-card" id="envDest">
        <label for="envPara" class="env-lbl"><i class="fa-solid fa-user"></i> Para quem?</label>
        <div class="env-dest-box">
          <input type="text" id="envPara" inputmode="text" autocomplete="off" placeholder="Nome ou número (ex.: (82) 99999-9999)" aria-describedby="envParaMsg">
          <button class="btn-soft env-limpar" id="envLimpar" hidden aria-label="Limpar destinatário"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="env-sug" id="envSug" hidden></div>
        <div class="msg-campo" id="envParaMsg" hidden></div>
        <div class="env-sel" id="envSel" hidden></div>
        <div class="env-verif" id="envVerif" hidden ${ZZ.pode('enviar.verificar') ? '' : 'data-semperm="1"'}><button class="btn-soft btn-sm" id="envBVerif"><i class="fa-solid fa-circle-check"></i> Verificar número</button><span id="envVerifRes"></span></div>
      </div>
      <div class="env-abas" id="envAbas" role="tablist">${abasOk().map(a => `<button role="tab" data-aba="${a[0]}"><i class="fa-solid ${a[1]}"></i><span>${a[2]}</span></button>`).join('')}</div>
      <div class="card-soft env-card" id="envPainel"></div>
      <div class="card-soft env-card env-agenda" ${ZZ.pode('agenda.criar') ? '' : 'hidden'}>
        <label class="env-switch"><input type="checkbox" id="envAg"><span class="env-trilho"></span><span><b>Agendar</b> <small class="mut">enviar depois, em data e hora marcadas</small></span></label>
        <div id="envAgBox" hidden><label for="envQuando">Data e hora (fuso do seu aparelho)</label><input type="datetime-local" id="envQuando"><div class="msg-campo" id="envQuandoMsg" hidden></div><div class="mut env-peq" id="envQuandoInfo"></div></div>
      </div>
      <div class="env-rodape"><button class="btn-azul env-enviar" id="envBtn"><i class="fa-solid fa-paper-plane"></i> <span>Enviar</span></button></div>
    </div>
    <div class="env-ok" id="envOk" hidden></div>`;
    pintarPor(); ZZ.poll(pintarPor, 3000);
    montarDestino(); montarAbas(); montarAgenda();
    ZZ.$('#envBtn', raiz).onclick = enviar;
    mostrarAba(S.aba);
    if (S.para) {
      const p = ZZ.$('#envPara', raiz);
      if (S.jid) definirDestino({ jid: S.jid, nome: S.nome || '' }, true); else if (S.nome) definirDestino({ numero: S.para, nome: S.nome, jid: '' }, true); else { p.value = mascara(S.para); atualizarVerif(); }
      if (S.jid && !S.nome) resolverNome(S.jid);
    }
  }

  function pintarPor() {
    const b = ZZ.$('#envPor'); if (!b) return;
    const i = (ZZ.instancias || []).find(x => x.nome === ZZ.instancia) || (ZZ.instancias || [])[0];
    const nome = i ? (i.apelido || i.nome) : (ZZ.instancia || '');
    b.hidden = !nome; b.innerHTML = '<i class="fa-brands fa-whatsapp"></i><span>Enviando por: <b>' + ZZ.esc(nome) + '</b>' + (i && i.numero ? ' · ' + ZZ.esc(ZZ.fmtNumero(i.numero)) : '') + '</span>';
  }

  /* ---------- destinatário ---------- */
  function montarDestino() {
    const inp = ZZ.$('#envPara', raiz), sug = ZZ.$('#envSug', raiz);
    const buscar = ZZ.debounce(async q => {
      if (abort) abort.abort(); abort = new AbortController();
      sug.hidden = false; sug.innerHTML = ZZ.skeleton(2, 'skel-linha');
      const j = await ZZ.api('contatos', { params: { q, pag: 1 }, silencioso: true, signal: abort.signal });
      if (j.abortado) return;
      if (!j.ok) { sug.innerHTML = '<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível buscar contatos.</div>'; return; }
      const l = (j.contatos || []).slice(0, 8);
      sug.innerHTML = l.length ? l.map((c, i) => `<button class="env-s" data-i="${i}" type="button">${avatar(c)}<span class="env-s-t"><b>${ZZ.esc(c.nome || ZZ.fmtNumero(c.numero))}</b><small>${ZZ.esc(c.grupo ? 'Grupo' : ZZ.fmtNumero(c.numero))}</small></span></button>`).join('') : '<div class="vazio env-peq">Nenhum contato encontrado. Se for um número, continue digitando.</div>';
      ZZ.$$('.env-s', sug).forEach(b => b.onclick = () => { definirDestino(l[+b.dataset.i]); });
    }, 300);
    inp.addEventListener('input', () => {
      S.jid = ''; S.nome = ''; S.verif = null; limparErro(inp, 'envParaMsg');
      const v = inp.value, soNum = /^[\s+()\-\d]*$/.test(v) && /\d/.test(v);
      if (soNum) { inp.value = mascara(v); S.para = inp.value; sug.hidden = true; if (abort) abort.abort(); }
      else { S.para = v; if (v.trim().length >= 2) buscar(v.trim()); else sug.hidden = true; }
      atualizarVerif(); salvarRasc();
    });
    inp.addEventListener('focus', () => setTimeout(() => inp.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250));
    ZZ.$('#envLimpar', raiz).onclick = () => { S.para = ''; S.jid = ''; S.nome = ''; S.verif = null; inp.value = ''; inp.parentNode.hidden = false; ZZ.$('#envSel', raiz).hidden = true; sug.hidden = true; ZZ.$('#envLimpar', raiz).hidden = true; atualizarVerif(); salvarRasc(); inp.focus(); };
    ZZ.$('#envBVerif', raiz).onclick = e => ZZ.busy(e.currentTarget, verificar);
  }
  function avatar(c) { return c.foto ? `<img class="avatar env-av" src="${ZZ.esc(c.foto)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar env-av',textContent:'${ZZ.esc(ZZ.iniciais(c.nome))}'}))">` : `<span class="avatar env-av">${ZZ.esc(ZZ.iniciais(c.nome || c.numero))}</span>`; }
  function definirDestino(c, silencioso) {
    S.jid = c.jid || ''; S.nome = c.nome || ''; S.para = c.jid || c.numero || '';
    const inp = ZZ.$('#envPara', raiz);
    inp.value = S.nome || ZZ.fmtNumero(c.numero || (c.jid || '').split('@')[0]);
    ZZ.$('#envSug', raiz).hidden = true; limparErro(inp, 'envParaMsg');
    const sel = ZZ.$('#envSel', raiz);
    sel.hidden = false; sel.innerHTML = `${avatar(c)}<span class="env-s-t"><b>${ZZ.esc(S.nome || ZZ.fmtNumero(c.numero || ''))}</b><small>${ZZ.esc(c.grupo ? 'Grupo' : ZZ.fmtNumero(c.numero || (c.jid || '').split('@')[0]))}</small></span>`;
    inp.parentNode.hidden = true; ZZ.$('#envLimpar', raiz).hidden = false;
    sel.onclick = () => { ZZ.$('#envLimpar', raiz).click(); };
    sel.title = 'Toque para trocar';
    atualizarVerif(); salvarRasc();
  }
  async function resolverNome(jid) {
    const num = jid.split('@')[0];
    const j = await ZZ.api('contatos', { params: { q: num, pag: 1 }, silencioso: true });
    const c = ((j && j.contatos) || []).find(x => x.jid === jid);
    if (c && S.jid === jid) definirDestino(c, true);
  }
  function atualizarVerif() {
    const box = ZZ.$('#envVerif', raiz); if (!box) return;
    const d = String(S.para).replace(/\D/g, '');
    const mostra = ZZ.pode('enviar.verificar') && !S.jid && d.length >= 10 && /^[\s+()\-\d]*$/.test(S.para);
    box.hidden = !mostra; ZZ.$('#envVerifRes', raiz).innerHTML = '';
    // nada a mostrar sobre verificação antiga
  }
  async function verificar() {
    const num = normNum(S.para);
    if (num.length < 12) { erroCampo(ZZ.$('#envPara', raiz), 'envParaMsg', 'Número incompleto. Use DDD + número.'); return false; }
    const j = await ZZ.api('verificar_numero', { corpo: { numeros: [num] } });
    const r = ZZ.$('#envVerifRes', raiz);
    if (!j.ok) { r.innerHTML = '<span class="badge-status b-err"><i class="fa-solid fa-triangle-exclamation"></i> Falha ao verificar</span>'; return false; }
    const x = (j.resultados || [])[0];
    if (x && x.existe) { S.verif = true; if (x.jid) S.jid = x.jid; r.innerHTML = `<span class="badge-status b-ok"><i class="fa-solid fa-circle-check"></i> Tem WhatsApp${x.nome ? ' · ' + ZZ.esc(x.nome) : ''}</span>`; return true; }
    S.verif = false; r.innerHTML = '<span class="badge-status b-err"><i class="fa-solid fa-circle-xmark"></i> Sem WhatsApp</span>'; return { ok: false };
  }
  function paraFinal() {
    if (S.jid) return S.jid;
    const v = String(S.para || '').trim();
    if (/@/.test(v)) return v;
    return normNum(v);
  }

  /* ---------- validação ---------- */
  function erroCampo(el, idMsg, msg) {
    if (!el) return;
    el.classList.add('erro-campo');
    const m = idMsg && document.getElementById(idMsg);
    if (m) { m.textContent = msg; m.hidden = false; }
    el.addEventListener('input', () => limparErro(el, idMsg), { once: true });
  }
  function limparErro(el, idMsg) { if (el) el.classList.remove('erro-campo'); const m = idMsg && document.getElementById(idMsg); if (m) m.hidden = true; }
  function foco(el) { if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); try { el.focus({ preventScroll: true }); } catch (e) { } } }

  /* ---------- abas ---------- */
  function montarAbas() { ZZ.$$('#envAbas button', raiz).forEach(b => b.onclick = () => { S.aba = b.dataset.aba; mostrarAba(S.aba); b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }); }
  function mostrarAba(a) {
    ZZ.$$('#envAbas button', raiz).forEach(b => { const on = b.dataset.aba === a; b.classList.toggle('ativo', on); b.setAttribute('aria-selected', on); });
    const p = ZZ.$('#envPainel', raiz); p.innerHTML = ({ texto: htmlTexto, midia: htmlMidia, enquete: htmlEnquete, local: htmlLocal, contato: htmlContato })[a]();
    ({ texto: iniTexto, midia: iniMidia, enquete: iniEnquete, local: iniLocal, contato: iniContato })[a]();
    const ad = ZZ.$('#envAssDica', raiz); if (ad) ad.textContent = ' · ' + DICA_ASS[a];
    ZZ.$('#envBtn span', raiz).textContent = S.agendar ? 'Agendar' : 'Enviar';
  }
  const campo = (id, rot, extra = '') => `<label for="${id}">${rot}</label>${extra}<div class="msg-campo" id="${id}Msg" hidden></div>`;

  /* ---- Texto ---- */
  function htmlTexto() {
    return `<label for="envTexto">Mensagem</label>
      <textarea id="envTexto" rows="5" maxlength="4096" placeholder="Digite sua mensagem…"></textarea>
      <div class="env-linha-info"><div class="msg-campo" id="envTextoMsg" hidden></div><span class="mut env-peq env-cont" id="envCont">0 / 4096</span></div>
      <div class="env-dig" id="envDigBox"><label class="env-switch"><input type="checkbox" id="envDig"><span class="env-trilho"></span><span>Mostrar "digitando…" antes de enviar</span></label>
        <div id="envDigOpc" hidden><select id="envDigMs" aria-label="Tempo digitando"><option value="2000">2 segundos</option><option value="3000" selected>3 segundos</option><option value="5000">5 segundos</option><option value="8000">8 segundos</option></select></div></div>
      <div class="env-previa-t mut env-peq">Pré-visualização</div>
      <div class="env-previa"><div class="env-balao" id="envBalao"><span class="mut">Sua mensagem aparece aqui</span></div></div>`;
  }
  function iniTexto() {
    const t = ZZ.$('#envTexto', raiz), c = ZZ.$('#envCont', raiz), b = ZZ.$('#envBalao', raiz);
    const atual = () => {
      const v = t.value; c.textContent = v.length + ' / 4096'; c.classList.toggle('env-cont-max', v.length > 3900);
      b.innerHTML = v.trim() ? `<b class="env-ass-b">${ZZ.esc(nomeAss())}:</b><br>` + fmtWa(v) + `<span class="env-hora">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} <i class="fa-solid fa-check"></i></span>` : `<b class="env-ass-b">${ZZ.esc(nomeAss())}:</b><br><span class="mut">Sua mensagem aparece aqui</span>`;
      S.rasc.texto = v; salvarRasc();
    };
    t.value = S.rasc.texto || ''; atual();
    t.addEventListener('input', () => { limparErro(t, 'envTextoMsg'); atual(); });
    t.addEventListener('focus', () => setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250));
    const d = ZZ.$('#envDig', raiz), o = ZZ.$('#envDigOpc', raiz), ms = ZZ.$('#envDigMs', raiz);
    d.checked = S.digitando; o.hidden = !S.digitando; ms.value = String(S.digMs);
    d.onchange = () => { S.digitando = d.checked; o.hidden = !d.checked; };
    ms.onchange = () => { S.digMs = +ms.value; };
    ZZ.$('#envDigBox', raiz).hidden = S.agendar;
  }
  /** Formatação estilo WhatsApp (*negrito* _itálico_ ~tachado~), escapando antes. */
  function fmtWa(v) {
    let h = ZZ.esc(v);
    h = h.replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>');
    return h.replace(/\n/g, '<br>');
  }

  /* ---- Mídia ---- */
  function htmlMidia() {
    return `<div class="env-drop" id="envDrop"><div class="env-drop-ic"><i class="fa-solid fa-cloud-arrow-up"></i></div>
      <b>Escolha o arquivo</b><span class="mut env-peq">Imagem, vídeo, áudio, PDF, Word, Excel, TXT ou ZIP · até ${MAX_MB} MB</span>
      <div class="env-botoes"><button type="button" class="btn-soft" id="envEscolher"><i class="fa-solid fa-folder-open"></i> Arquivo</button><button type="button" class="btn-soft" id="envCamera"><i class="fa-solid fa-camera"></i> Câmera</button></div></div>
      <input type="file" id="envFile" accept="${ACCEPT}" hidden><input type="file" id="envFileCam" accept="image/*,video/*" capture="environment" hidden>
      <div class="msg-campo" id="envFileMsg" hidden></div>
      <div class="env-arq" id="envArq" hidden></div>
      <label for="envLegenda">Legenda (opcional)</label><textarea id="envLegenda" rows="2" maxlength="1024" placeholder="Escreva uma legenda…"></textarea>
      <div class="env-prog" id="envProg" hidden><div class="barra-prog"><i id="envProgI"></i></div><div class="env-peq mut" id="envProgT">Enviando…</div></div>`;
  }
  function iniMidia() {
    const f = ZZ.$('#envFile', raiz), fc = ZZ.$('#envFileCam', raiz);
    ZZ.$('#envEscolher', raiz).onclick = () => f.click();
    ZZ.$('#envCamera', raiz).onclick = () => fc.click();
    const pegar = e => { const a = e.target.files[0]; if (a) escolherArquivo(a); e.target.value = ''; };
    f.onchange = pegar; fc.onchange = pegar;
    const d = ZZ.$('#envDrop', raiz);
    ['dragover', 'dragenter'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.add('env-sobre'); }));
    ['dragleave', 'drop'].forEach(ev => d.addEventListener(ev, e => { e.preventDefault(); d.classList.remove('env-sobre'); }));
    d.addEventListener('drop', e => { const a = e.dataTransfer.files[0]; if (a) escolherArquivo(a); });
    if (S.arquivo) mostrarArquivo();
  }
  function escolherArquivo(a) {
    const m = ZZ.$('#envFileMsg', raiz);
    if (a.size > MAX_MB * 1048576) { S.arquivo = null; mostrarArquivo(); erroCampo(ZZ.$('#envDrop', raiz), 'envFileMsg', `Arquivo grande demais (${tamanho(a.size)}). O limite é ${MAX_MB} MB.`); return; }
    if (!a.size) { erroCampo(ZZ.$('#envDrop', raiz), 'envFileMsg', 'O arquivo está vazio.'); return; }
    limparErro(ZZ.$('#envDrop', raiz), 'envFileMsg'); S.arquivo = a; mostrarArquivo();
  }
  function iconeMime(a) {
    const t = a.type || '', n = a.name.toLowerCase();
    if (/pdf$/.test(n)) return 'fa-file-pdf'; if (/\.(docx?)$/.test(n)) return 'fa-file-word'; if (/\.(xlsx?)$/.test(n)) return 'fa-file-excel'; if (/\.zip$/.test(n)) return 'fa-file-zipper';
    if (t.startsWith('audio')) return 'fa-file-audio'; if (t.startsWith('video')) return 'fa-file-video'; return 'fa-file-lines';
  }
  function mostrarArquivo() {
    const box = ZZ.$('#envArq', raiz), a = S.arquivo; if (!box) return;
    if (!a) { box.hidden = true; box.innerHTML = ''; ZZ.$('#envDrop', raiz).hidden = false; return; }
    ZZ.$('#envDrop', raiz).hidden = true; box.hidden = false;
    const img = (a.type || '').startsWith('image/');
    box.innerHTML = `<div class="env-mini">${img ? '' : `<i class="fa-solid ${iconeMime(a)}"></i>`}</div><div class="env-s-t"><b>${ZZ.esc(a.name)}</b><small>${ZZ.esc(tamanho(a.size))}</small></div><button class="btn-soft env-rm" type="button" aria-label="Remover arquivo"><i class="fa-solid fa-xmark"></i></button>`;
    if (img) { const im = new Image(); im.alt = ''; im.src = URL.createObjectURL(a); im.onload = () => URL.revokeObjectURL(im.src); ZZ.$('.env-mini', box).appendChild(im); }
    ZZ.$('.env-rm', box).onclick = () => { S.arquivo = null; mostrarArquivo(); };
  }

  /* ---- Enquete ---- */
  function htmlEnquete() {
    return `${campo('envPerg', 'Pergunta', '<input type="text" id="envPerg" maxlength="255" placeholder="Ex.: Qual horário é melhor?">')}
      <label>Opções <small class="mut">(de 2 a 12)</small></label><div id="envOpcs"></div><div class="msg-campo" id="envOpcsMsg" hidden></div>
      <button class="btn-soft env-add" id="envAddOpc" type="button"><i class="fa-solid fa-plus"></i> Adicionar opção</button>
      <label class="env-switch env-mt"><input type="checkbox" id="envMulti"><span class="env-trilho"></span><span>Permitir várias respostas</span></label>`;
  }
  function iniEnquete() {
    const box = ZZ.$('#envOpcs', raiz), add = ZZ.$('#envAddOpc', raiz);
    const q = S.enq || (S.enq = { perg: '', opcs: ['', ''], multi: false });
    const perg = ZZ.$('#envPerg', raiz), mu = ZZ.$('#envMulti', raiz);
    perg.value = q.perg; mu.checked = q.multi;
    perg.oninput = () => { q.perg = perg.value; limparErro(perg, 'envPergMsg'); }; mu.onchange = () => { q.multi = mu.checked; };
    const desenhar = () => {
      box.innerHTML = q.opcs.map((o, i) => `<div class="env-opc"><span class="env-n">${i + 1}</span><input type="text" maxlength="100" placeholder="Opção ${i + 1}" value="${ZZ.esc(o)}" data-i="${i}"><button type="button" class="btn-soft env-rm" data-r="${i}" aria-label="Remover opção ${i + 1}" ${q.opcs.length <= 2 ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button></div>`).join('');
      add.disabled = q.opcs.length >= 12;
      ZZ.$$('input', box).forEach(inp => inp.oninput = () => { q.opcs[+inp.dataset.i] = inp.value; limparErro(inp); ZZ.$('#envOpcsMsg', raiz).hidden = true; });
      ZZ.$$('[data-r]', box).forEach(b => b.onclick = () => { q.opcs.splice(+b.dataset.r, 1); desenhar(); });
    };
    add.onclick = () => { if (q.opcs.length < 12) { q.opcs.push(''); desenhar(); const i = ZZ.$$('input', box); i[i.length - 1].focus(); } };
    desenhar();
  }

  /* ---- Localização ---- */
  function htmlLocal() {
    return `<button class="btn-soft w100 env-geo" id="envGeo" type="button"><i class="fa-solid fa-crosshairs"></i> Usar minha localização</button>
      <div class="grid2"><div>${campo('envLat', 'Latitude', '<input type="text" id="envLat" inputmode="decimal" placeholder="-9.66599">')}</div><div>${campo('envLng', 'Longitude', '<input type="text" id="envLng" inputmode="decimal" placeholder="-35.73528">')}</div></div>
      ${campo('envLNome', 'Nome do local (opcional)', '<input type="text" id="envLNome" maxlength="100" placeholder="Ex.: Minha casa">')}
      ${campo('envLEnd', 'Endereço (opcional)', '<input type="text" id="envLEnd" maxlength="200" placeholder="Rua, número, bairro">')}
      <a class="env-mapa mut env-peq" id="envMapa" target="_blank" rel="noopener" hidden><i class="fa-solid fa-map"></i> Ver no mapa</a>`;
  }
  function iniLocal() {
    const L = S.loc || (S.loc = { lat: '', lng: '', nome: '', end: '' });
    const m = { lat: '#envLat', lng: '#envLng', nome: '#envLNome', end: '#envLEnd' };
    const mapa = () => { const la = parseFloat(String(L.lat).replace(',', '.')), ln = parseFloat(String(L.lng).replace(',', '.')); const a = ZZ.$('#envMapa', raiz); if (isFinite(la) && isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) { a.href = `https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=16/${la}/${ln}`; a.hidden = false; } else a.hidden = true; };
    Object.keys(m).forEach(k => { const i = ZZ.$(m[k], raiz); i.value = L[k]; i.oninput = () => { L[k] = i.value; limparErro(i, i.id + 'Msg'); mapa(); }; });
    mapa();
    ZZ.$('#envGeo', raiz).onclick = e => ZZ.busy(e.currentTarget, () => new Promise(res => {
      if (!navigator.geolocation) { ZZ.toast('Seu aparelho não oferece localização.', 'err'); return res(false); }
      navigator.geolocation.getCurrentPosition(p => {
        L.lat = p.coords.latitude.toFixed(6); L.lng = p.coords.longitude.toFixed(6);
        ZZ.$('#envLat', raiz).value = L.lat; ZZ.$('#envLng', raiz).value = L.lng; mapa(); ZZ.toast('Localização obtida.', 'ok'); res(true);
      }, er => { ZZ.toast(er.code === 1 ? 'Permissão de localização negada. Libere nas configurações do navegador.' : 'Não foi possível obter sua localização.', 'err'); res(false); }, { enableHighAccuracy: true, timeout: 15000 });
    }));
  }

  /* ---- Contato ---- */
  function htmlContato() {
    return `${campo('envCNome', 'Nome do contato', '<input type="text" id="envCNome" maxlength="100" placeholder="Ex.: Maria Silva" autocomplete="off">')}
      ${campo('envCNum', 'Número do contato', '<input type="tel" id="envCNum" inputmode="tel" placeholder="(82) 99999-9999" autocomplete="off">')}
      <div class="mut env-peq">O contato será enviado como cartão que o destinatário pode salvar.</div>`;
  }
  function iniContato() {
    const C = S.cont || (S.cont = { nome: '', num: '' });
    const n = ZZ.$('#envCNome', raiz), t = ZZ.$('#envCNum', raiz);
    n.value = C.nome; t.value = C.num;
    n.oninput = () => { C.nome = n.value; limparErro(n, 'envCNomeMsg'); };
    t.oninput = () => { t.value = mascara(t.value); C.num = t.value; limparErro(t, 'envCNumMsg'); };
  }

  /* ---------- agendamento ---------- */
  function montarAgenda() {
    const sw = ZZ.$('#envAg', raiz), box = ZZ.$('#envAgBox', raiz), q = ZZ.$('#envQuando', raiz);
    const min = new Date(Date.now() + 120000); q.min = localISO(min);
    sw.onchange = () => {
      S.agendar = sw.checked; box.hidden = !sw.checked;
      if (sw.checked && !q.value) { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); q.value = localISO(d); S.quando = q.value; info(); }
      ZZ.$('#envBtn span', raiz).textContent = S.agendar ? 'Agendar' : 'Enviar';
      ZZ.$('#envBtn i', raiz).className = 'fa-solid ' + (S.agendar ? 'fa-clock' : 'fa-paper-plane');
      const db = ZZ.$('#envDigBox', raiz); if (db) db.hidden = S.agendar;
      if (sw.checked) setTimeout(() => box.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
    };
    const info = () => { const t = tsQuando(); ZZ.$('#envQuandoInfo', raiz).textContent = t ? 'Será enviada em ' + ZZ.fmtDataHora(t) + ' (horário de Maceió)' : ''; };
    q.oninput = () => { S.quando = q.value; limparErro(q, 'envQuandoMsg'); info(); };
  }
  function tsQuando() { const v = ZZ.$('#envQuando', raiz).value; if (!v) return 0; const t = new Date(v).getTime(); return isFinite(t) ? Math.floor(t / 1000) : 0; }

  /* ---------- envio ---------- */
  function validar() {
    const p = ZZ.$('#envPara', raiz); let primeiro = null;
    const falha = (el, id, msg) => { erroCampo(el, id, msg); if (!primeiro) primeiro = el; };
    const d = String(S.para || '').trim();
    if (!d) falha(S.jid ? ZZ.$('#envSel', raiz) : p, 'envParaMsg', 'Escolha um contato ou digite um número.');
    else if (!S.jid && !/@/.test(d) && normNum(d).length < 12) falha(p, 'envParaMsg', 'Número incompleto. Use DDD + número.');
    else if (!S.jid && !/@/.test(d) && normNum(d).length > 15) falha(p, 'envParaMsg', 'Número grande demais.');
    if (primeiro && p.parentNode.hidden) { ZZ.$('#envParaMsg', raiz).hidden = false; }
    const a = S.aba;
    if (a === 'texto') { const t = ZZ.$('#envTexto', raiz); if (!t.value.trim()) falha(t, 'envTextoMsg', 'Escreva a mensagem.'); else if (t.value.length > 4096) falha(t, 'envTextoMsg', 'Máximo de 4096 caracteres.'); }
    if (a === 'midia' && !S.arquivo) falha(ZZ.$('#envDrop', raiz), 'envFileMsg', 'Escolha um arquivo para enviar.');
    if (a === 'enquete') {
      const pg = ZZ.$('#envPerg', raiz); if (!pg.value.trim()) falha(pg, 'envPergMsg', 'Escreva a pergunta.');
      const ins = ZZ.$$('#envOpcs input', raiz), vaz = ins.filter(i => !i.value.trim());
      if (vaz.length) { vaz.forEach(i => i.classList.add('erro-campo')); falha(vaz[0], 'envOpcsMsg', 'Preencha todas as opções (ou remova as vazias).'); }
      else { const v = ins.map(i => i.value.trim().toLowerCase()); if (new Set(v).size !== v.length) falha(ins[0], 'envOpcsMsg', 'Há opções repetidas.'); }
    }
    if (a === 'local') {
      const la = parseFloat(String(ZZ.$('#envLat', raiz).value).replace(',', '.')), ln = parseFloat(String(ZZ.$('#envLng', raiz).value).replace(',', '.'));
      if (!isFinite(la) || Math.abs(la) > 90) falha(ZZ.$('#envLat', raiz), 'envLatMsg', 'Latitude inválida (-90 a 90).');
      if (!isFinite(ln) || Math.abs(ln) > 180) falha(ZZ.$('#envLng', raiz), 'envLngMsg', 'Longitude inválida (-180 a 180).');
    }
    if (a === 'contato') {
      const n = ZZ.$('#envCNome', raiz), t = ZZ.$('#envCNum', raiz);
      if (!n.value.trim()) falha(n, 'envCNomeMsg', 'Informe o nome do contato.');
      const dn = normNum(t.value); if (dn.length < 12 || dn.length > 15) falha(t, 'envCNumMsg', 'Número inválido. Use DDD + número.');
    }
    if (S.agendar) {
      const q = ZZ.$('#envQuando', raiz), t = tsQuando();
      if (!t) falha(q, 'envQuandoMsg', 'Escolha a data e a hora.');
      else if (t < Math.floor(Date.now() / 1000) + 60) falha(q, 'envQuandoMsg', 'Escolha um horário no futuro (pelo menos 1 minuto à frente).');
      if (a !== 'texto' && a !== 'midia') { ZZ.toast('Só é possível agendar mensagens de texto e mídia.', 'err'); if (!primeiro) primeiro = q; }
    }
    if (primeiro) { foco(primeiro); ZZ.vibrar([30, 40, 30]); return false; }
    return true;
  }

  async function enviar() {
    if (!validar()) return;
    const btn = ZZ.$('#envBtn', raiz);
    const r = await ZZ.busy(btn, async () => {
      const para = paraFinal(), a = S.aba;
      let j;
      if (S.agendar) {
        const quando = tsQuando();
        if (a === 'texto') j = await ZZ.api('agendar_texto', { corpo: { para, texto: ZZ.$('#envTexto', raiz).value, quando } });
        else j = await enviarArquivo('agendar_midia', para, quando);
      } else if (a === 'texto') {
        j = await ZZ.api('enviar_texto', { corpo: { para, texto: ZZ.$('#envTexto', raiz).value, ...(S.digitando ? { digitando_ms: S.digMs } : {}) } });
      } else if (a === 'midia') j = await enviarArquivo('enviar_midia', para);
      else if (a === 'enquete') j = await ZZ.api('enviar_enquete', { corpo: { para, pergunta: ZZ.$('#envPerg', raiz).value.trim(), opcoes: ZZ.$$('#envOpcs input', raiz).map(i => i.value.trim()), multipla: ZZ.$('#envMulti', raiz).checked } });
      else if (a === 'local') j = await ZZ.api('enviar_localizacao', { corpo: { para, lat: parseFloat(String(ZZ.$('#envLat', raiz).value).replace(',', '.')), lng: parseFloat(String(ZZ.$('#envLng', raiz).value).replace(',', '.')), nome: ZZ.$('#envLNome', raiz).value.trim(), endereco: ZZ.$('#envLEnd', raiz).value.trim() } });
      else j = await ZZ.api('enviar_contato', { corpo: { para, nome: ZZ.$('#envCNome', raiz).value.trim(), numero: normNum(ZZ.$('#envCNum', raiz).value) } });
      if (j && j.ok) sucesso(j); else if (j && !j.msg) ZZ.toast('Não foi possível enviar. Tente de novo.', 'err');
      return j;
    });
    return r;
  }

  /** Upload real com progresso (XMLHttpRequest). */
  function enviarArquivo(acao, para, quando) {
    return new Promise(res => {
      const fd = new FormData();
      fd.append('para', para); fd.append('legenda', ZZ.$('#envLegenda', raiz).value.trim()); fd.append('arquivo', S.arquivo, S.arquivo.name);
      if (quando) fd.append('quando', String(quando));
      const prog = ZZ.$('#envProg', raiz), pi = ZZ.$('#envProgI', raiz), pt = ZZ.$('#envProgT', raiz);
      prog.hidden = false; pi.style.width = '0'; pt.textContent = 'Enviando arquivo… 0%';
      const x = new XMLHttpRequest();
      x.open('POST', 'api.php?a=' + acao);
      const h = ZZ.cabecalhos(); Object.keys(h).forEach(k => x.setRequestHeader(k, h[k])); x.withCredentials = true;
      x.upload.onprogress = e => { if (e.lengthComputable) { const p = Math.round(e.loaded / e.total * 100); pi.style.width = p + '%'; pt.textContent = p < 100 ? `Enviando arquivo… ${p}% (${tamanho(e.loaded)} de ${tamanho(e.total)})` : 'Processando no servidor…'; } };
      const fim = j => { prog.hidden = true; if (j && j.login) { location.reload(); return res(j); } if (!j.ok && j.msg) ZZ.toast(j.msg, 'err'); res(j); };
      x.onload = () => { let j; try { j = JSON.parse(x.responseText); } catch (e) { j = { ok: false, msg: 'Resposta inválida do servidor' + (x.status === 413 ? ' (arquivo grande demais)' : '') }; } fim(j); };
      x.onerror = () => fim({ ok: false, msg: 'Sem conexão. O arquivo não foi enviado.' });
      x.ontimeout = () => fim({ ok: false, msg: 'Tempo esgotado no envio do arquivo.' });
      x.timeout = 300000;
      x.send(fd);
    });
  }

  /* ---------- sucesso ---------- */
  function sucesso(j) {
    const ag = S.agendar, jid = j.jid || (S.jid || '');
    limparRasc(); S.rasc = {};
    ZZ.toast(ag ? 'Mensagem agendada!' : 'Mensagem enviada!', 'ok');
    const ok = ZZ.$('#envOk', raiz);
    ok.hidden = false;
    ok.innerHTML = `<div class="env-ok-card"><svg class="env-check" viewBox="0 0 52 52" aria-hidden="true"><circle class="env-check-c" cx="26" cy="26" r="24" fill="none"/><path class="env-check-p" fill="none" d="M14 27l8 8 16-17"/></svg>
      <h2>${ag ? 'Agendada!' : 'Enviada!'}</h2><p class="mut">${ag ? 'Será enviada em ' + ZZ.esc(ZZ.fmtDataHora(tsQuando())) + '.' : 'Sua mensagem foi entregue ao WhatsApp.'}</p>
      <div class="env-ok-b"><button class="btn-azul" id="envOutra"><i class="fa-solid fa-rotate-left"></i> Enviar outra</button>
      ${ag ? '<button class="btn-soft" id="envAgenda"><i class="fa-solid fa-clock"></i> Ver agendadas</button>' : (jid ? '<button class="btn-soft" id="envAbrir"><i class="fa-solid fa-comments"></i> Abrir conversa</button>' : '')}</div></div>`;
    ZZ.$('#envOutra', ok).onclick = () => { const para = S.para, jidA = S.jid, nome = S.nome; ok.hidden = true; ok.innerHTML = ''; render(raiz, ctxp); if (jidA || para) { S.para = para; S.jid = jidA; S.nome = nome; definirDestino({ jid: jidA, numero: String(para).replace(/\D/g, ''), nome }, true); } };
    const ab = ZZ.$('#envAbrir', ok); if (ab) ab.onclick = () => ZZ.ir('conversas', { jid });
    const ag2 = ZZ.$('#envAgenda', ok); if (ag2) ag2.onclick = () => ZZ.ir('agenda');
  }

  function salvarRasc() { S.rasc.para = S.jid || S.para; S.rasc.nome = S.nome; gravarRasc(S.rasc); }

  ZZ.pagina({ id: 'enviar', titulo: 'Enviar', icone: 'fa-paper-plane', ordem: 3, fab: true, render, destroy() { if (abort) abort.abort(); abort = null; } });
})();
