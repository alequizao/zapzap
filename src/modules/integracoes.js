/* Integrações — tokens de API, webhooks de saída e exemplos de uso (classes ig-). */
ZZ.pagina({ id: 'integracoes', titulo: 'Integrações', icone: 'fa-plug-circle-bolt', ordem: 8.2, perm: 'api.tokens', render(el, ctx) {
  const E = ZZ.esc;
  const ESCOPOS = [
    ['enviar_texto', 'Enviar texto', 'fa-message', 'Mandar mensagens de texto'],
    ['enviar_midia', 'Enviar mídia', 'fa-image', 'Mandar imagens, áudios, vídeos e documentos'],
    ['consultar_status', 'Ver status', 'fa-signal', 'Consultar se o WhatsApp está conectado'],
    ['listar_mensagens', 'Ler mensagens', 'fa-envelope-open-text', 'Listar mensagens de uma conversa']];
  const EVENTOS = [
    ['mensagem_recebida', 'Mensagem recebida'], ['mensagem_enviada', 'Mensagem enviada'],
    ['conexao', 'Mudança de conexão']];
  const rotEsc = k => (ESCOPOS.find(x => x[0] === k) || [k, k])[1];
  const rotEv = k => (EVENTOS.find(x => x[0] === k) || [k, k])[1];
  const lista = j => Array.isArray(j.itens) ? j.itens : Array.isArray(j.tokens) ? j.tokens : Array.isArray(j.webhooks) ? j.webhooks : Array.isArray(j.logs) ? j.logs : Array.isArray(j.usos) ? j.usos : [];
  const arr = v => Array.isArray(v) ? v : (typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
  let BASE = location.origin + location.pathname.replace(/[^/]*$/, '') + 'api_publica.php';
  let aba = 'tokens', ass = {}, tokens = [], hooks = [], pode = true;

  el.innerHTML = `<div class="ig-tabs" role="tablist">
      <button data-aba="tokens" class="ativo"><i class="fa-solid fa-key"></i> Tokens</button>
      <button data-aba="hooks"><i class="fa-solid fa-satellite-dish"></i> Webhooks</button>
      <button data-aba="uso"><i class="fa-solid fa-book-open"></i> Como usar</button></div>
    <div id="igCorpo"></div>`;
  const corpo = ZZ.$('#igCorpo', el);
  ZZ.$$('.ig-tabs button', el).forEach(b => b.onclick = () => { aba = b.dataset.aba; ZZ.vibrar(8); ZZ.$$('.ig-tabs button', el).forEach(x => x.classList.toggle('ativo', x === b)); ass = {}; desenhar(); });

  const erro = (fn) => `<div class="card-soft vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar.<br><button class="btn-soft btn-sm ig-mt" data-tent>Tentar de novo</button></div>`;
  const ligaTent = (box, fn) => { const b = ZZ.$('[data-tent]', box); if (b) b.onclick = e => ZZ.busy(e.currentTarget, fn); };
  const copiar = async (txt, btn) => {
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
      try { const t = document.createElement('textarea'); t.value = txt; t.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(t); t.focus(); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (x) { }
    }
    ZZ.toast(ok ? 'Copiado!' : 'Não foi possível copiar — selecione e copie manualmente', ok ? 'ok' : 'err');
    if (btn) { const h = btn.innerHTML; btn.innerHTML = ok ? '<i class="fa-solid fa-check"></i> Copiado' : h; btn.classList.add(ok ? 'ok-flash' : 'erro-flash'); setTimeout(() => { btn.innerHTML = h; btn.classList.remove('ok-flash', 'erro-flash'); }, 1400); }
    return ok;
  };
  const mascUrl = u => { try { const x = new URL(u); return x.protocol + '//' + x.host + (x.pathname.length > 1 ? '/•••' : ''); } catch (e) { return String(u).slice(0, 18) + '•••'; } };
  const rel = ts => ts ? 'há ' + ZZ.fmtRel(ts).replace('agora', 'instantes').replace(/^há instantes$/, 'instantes') : 'nunca usado';
  const relTxt = ts => !ts ? 'nunca usado' : (ZZ.fmtRel(ts) === 'agora' ? 'agora mesmo' : 'há ' + ZZ.fmtRel(ts));

  function desenhar() { if (aba === 'tokens') telaTokens(); else if (aba === 'hooks') telaHooks(); else telaUso(); }

  /* ---------------- TOKENS ---------------- */
  async function telaTokens(silencio) {
    if (!silencio && aba === 'tokens') corpo.innerHTML = ZZ.skeleton(3, 'skel-linha ig-skel');
    const j = await ZZ.api('listar_tokens', { silencioso: true });
    if (aba !== 'tokens') return;
    if (!j.ok) { corpo.innerHTML = erro(); ligaTent(corpo, telaTokens); return; }
    tokens = lista(j); if (j.url_base) BASE = j.url_base;
    const a = tokens.map(t => [t.id, t.usos, t.ultimo_uso, t.ativo].join()).join('|'); if (silencio && a === ass.t) return; ass.t = a;
    corpo.innerHTML = `<div class="ig-topo"><div><b>${tokens.length}</b> token(s) <span class="vivo">ao vivo</span></div><button class="btn-azul" id="igNovo"><i class="fa-solid fa-plus"></i> Novo token</button></div>` +
      (tokens.length ? `<div class="ig-lista">${tokens.map(cartaoToken).join('')}</div>` :
        `<div class="card-soft vazio"><i class="fa-solid fa-key"></i>Nenhum token ainda.<br>Crie um para enviar mensagens pelo seu próprio sistema.</div>`);
    ZZ.$('#igNovo', corpo).onclick = abrirNovoToken;
    ZZ.$$('[data-rev]', corpo).forEach(b => b.onclick = () => revogar(b));
    ZZ.$$('[data-uso]', corpo).forEach(b => b.onclick = () => verUso(b.dataset.uso));
  }
  function cartaoToken(t) {
    const ativo = t.ativo === undefined ? !t.revogado : !!+t.ativo;
    const esc = arr(t.escopos);
    return `<article class="card-soft ig-card ${ativo ? '' : 'ig-off'}" data-id="${E(t.id)}">
      <header><span class="ig-ic"><i class="fa-solid fa-key"></i></span><div class="ig-tit"><b>${E(t.nome || 'Sem nome')}</b>
        <small class="mut"><i class="fa-brands fa-whatsapp"></i> ${E(t.conexao || t.instancia_nome || t.instancia || 'Conexão atual')}${t.prefixo ? ' · <code>' + E(t.prefixo) + '…</code>' : ''}</small></div>
        <span class="badge-status ${ativo ? 'b-ok' : 'b-err'}">${ativo ? 'Ativo' : 'Revogado'}</span></header>
      <div class="ig-chips">${esc.length ? esc.map(k => `<span class="ig-chip">${E(rotEsc(k))}</span>`).join('') : '<span class="mut">sem escopos</span>'}</div>
      <dl class="ig-meta">
        <div><dt>Assinatura</dt><dd>${t.assinatura ? '<i>*' + E(t.assinatura) + ':*</i>' : '<span class="mut">—</span>'}</dd></div>
        <div><dt>Limite</dt><dd>${E(t.limite_min ?? t.limite ?? '—')}/min</dd></div>
        <div><dt>Último uso</dt><dd>${E(relTxt(+t.ultimo_uso))}</dd></div>
        <div><dt>Usos</dt><dd>${ZZ.fmtNumero(t.usos || 0) || 0}</dd></div></dl>
      <div class="ig-acoes"><button class="btn-soft btn-sm" data-uso="${E(t.id)}"><i class="fa-solid fa-chart-simple"></i> Uso</button>
        ${ativo ? `<button class="btn-perigo btn-sm" data-rev="${E(t.id)}"><i class="fa-solid fa-ban"></i> Revogar</button>` : ''}</div></article>`;
  }
  async function revogar(b) {
    if (!await ZZ.confirmar('Revogar este token? Quem o usa deixará de conseguir acessar a API imediatamente. Isso não pode ser desfeito.', 'Revogar', true)) return;
    const r = await ZZ.busy(b, () => ZZ.api('revogar_token', { corpo: { id: +b.dataset.rev || b.dataset.rev } }));
    if (r && r.ok) { ZZ.toast('Token revogado', 'ok'); const c = b.closest('.ig-card'); c && c.classList.add('ig-sai'); setTimeout(() => telaTokens(true), 350); }
  }
  async function verUso(id) {
    const m = ZZ.modal(`<h3><i class="fa-solid fa-chart-simple"></i> Uso do token</h3><div id="igUso">${ZZ.skeleton(3)}</div><div class="acoes"><button class="btn-soft" data-f>Fechar</button></div>`);
    ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    const j = await ZZ.api('ver_uso_token', { params: { id }, silencioso: true });
    const box = ZZ.$('#igUso', m.el); if (!box) return;
    const it = lista(j);
    if (!j.ok) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar o uso.</div>'; return; }
    const cab = j.token ? `<div class="ig-dica" style="margin:0 0 10px"><b>${E(j.token.nome)}</b> · ${E(j.ultimo_minuto || 0)} de ${E(j.token.limite_min)} requisições no último minuto</div>` : '';
    if (!it.length) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-inbox"></i>Este token ainda não foi usado.</div>'; return; }
    box.innerHTML = cab + `<div class="ig-logs">${it.map(x => { const ok = !!x.ok; return `<div class="ig-log ${ok ? 'ok' : 'err'}"><span class="badge-status ${ok ? 'b-ok' : 'b-err'}">${E(x.http || (ok ? 'OK' : 'ERRO'))}</span><div><b>${E(x.acao || 'requisição')}</b><small class="mut">${x.ts ? ZZ.fmtDataHora(x.ts) : ''}${x.ip ? ' · ' + E(x.ip) : ''}${x.detalhe ? ' · ' + E(x.detalhe) : ''}</small></div></div>`; }).join('')}</div>`;
  }
  function abrirNovoToken() {
    const insts = (ZZ.instancias || []);
    const m = ZZ.modal(`<h3><i class="fa-solid fa-key"></i> Novo token de API</h3>
      <label>Nome do token</label><input type="text" id="igNome" maxlength="60" placeholder="Ex.: Meu sistema de pedidos">
      <label>Conexão do WhatsApp</label><select id="igInst">${insts.length ? insts.map(i => `<option value="${E(i.nome)}" ${i.nome === ZZ.instancia ? 'selected' : ''}>${E(i.apelido || i.nome)}</option>`).join('') : `<option value="${E(ZZ.instancia)}">Conexão atual</option>`}</select>
      <label>O que este token pode fazer</label>
      <div class="ig-sw-lista">${ESCOPOS.map(([k, n, ic, d]) => `<label class="ig-sw"><span class="ig-sw-t"><i class="fa-solid ${ic}"></i><span><b>${E(n)}</b><small>${E(d)}</small></span></span><input type="checkbox" value="${k}" ${k !== 'listar_mensagens' ? 'checked' : ''}><span class="ig-sw-b"></span></label>`).join('')}</div>
      <label>Limite de requisições por minuto</label><input type="number" id="igLim" min="1" max="600" value="30" inputmode="numeric">
      <label>Assinatura nas mensagens</label><input type="text" id="igAss" maxlength="80" placeholder="Ex.: Loja Central">
      <div class="ig-dica"><i class="fa-solid fa-signature"></i> Toda mensagem enviada por este token sai assinada, ex.: <b>*<span id="igAssV">Loja Central</span>:*</b>. É obrigatória e não dá para desligar.</div>
      <div class="acoes"><button class="btn-soft" data-f>Cancelar</button><button class="btn-azul" id="igCria"><i class="fa-solid fa-plus"></i> Criar token</button></div>`);
    ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    const nome = ZZ.$('#igNome', m.el), assI = ZZ.$('#igAss', m.el); setTimeout(() => nome.focus(), 150);
    assI.oninput = () => { ZZ.$('#igAssV', m.el).textContent = assI.value.trim() || 'Loja Central'; };
    ZZ.$('#igCria', m.el).onclick = async e => {
      ZZ.$$('.erro-campo', m.el).forEach(x => x.classList.remove('erro-campo')); ZZ.$$('.msg-campo', m.el).forEach(x => x.remove());
      const escopos = ZZ.$$('.ig-sw input:checked', m.el).map(x => x.value);
      const bad = (campo, msg) => { campo.classList.add('erro-campo'); campo.insertAdjacentHTML('afterend', `<div class="msg-campo">${msg}</div>`); campo.focus(); ZZ.vibrar([30, 40, 30]); };
      if (nome.value.trim().length < 2) return bad(nome, 'Dê um nome ao token (mín. 2 letras).');
      if (assI.value.trim().length < 2) return bad(assI, 'Informe a assinatura que aparece nas mensagens.');
      if (!escopos.length) return ZZ.toast('Marque ao menos uma permissão', 'err');
      const lim = Math.max(1, Math.min(600, +ZZ.$('#igLim', m.el).value || 30));
      const r = await ZZ.busy(e.currentTarget, () => ZZ.api('criar_token', { corpo: { nome: nome.value.trim(), assinatura: assI.value.trim(), instancia: ZZ.$('#igInst', m.el).value, escopos, limite_min: lim } }));
      if (r && r.ok && (r.token || (r.item && r.item.token))) { m.fechar(); mostrarToken(r.token || r.item.token, nome.value.trim()); telaTokens(true); }
    };
  }
  function mostrarToken(tk, nome) {
    let copiou = false;
    const m = ZZ.modal(`<h3><i class="fa-solid fa-circle-check" style="color:var(--verde)"></i> Token criado</h3>
      <p class="mut">Token <b>${E(nome)}</b> pronto. Copie e guarde em local seguro.</p>
      <div class="ig-aviso"><i class="fa-solid fa-triangle-exclamation"></i><div>Este token aparece <b>só agora</b>. Depois de fechar, não será possível vê-lo de novo.</div></div>
      <div class="ig-token" id="igTk">${E(tk)}</div>
      <button class="btn-azul w100" id="igCopia"><i class="fa-solid fa-copy"></i> Copiar token</button>
      <div class="acoes"><button class="btn-soft" id="igFim">Já guardei, fechar</button></div>`);
    const b = ZZ.$('#igCopia', m.el);
    b.onclick = async () => { if (await copiar(tk, b)) copiou = true; };
    ZZ.$('#igTk', m.el).onclick = () => { const s = getSelection(), r = document.createRange(); r.selectNodeContents(ZZ.$('#igTk', m.el)); s.removeAllRanges(); s.addRange(r); };
    ZZ.$('#igFim', m.el).onclick = async () => {
      if (!copiou && !await ZZ.confirmar('Você ainda não copiou o token e ele não aparecerá de novo. Fechar mesmo assim?', 'Fechar mesmo assim', true)) return;
      m.fechar();
    };
  }

  /* ---------------- WEBHOOKS ---------------- */
  async function telaHooks(silencio) {
    if (!silencio && aba === 'hooks') corpo.innerHTML = ZZ.skeleton(3, 'skel-linha ig-skel');
    const j = await ZZ.api('listar_webhooks_saida', { silencioso: true });
    if (aba !== 'hooks') return;
    if (!j.ok) { corpo.innerHTML = erro(); ligaTent(corpo, telaHooks); return; }
    hooks = lista(j);
    const a = hooks.map(h => [h.id, h.ativo, h.falhas_seguidas ?? h.falhas, h.ultimo_envio].join()).join('|'); if (silencio && a === ass.h) return; ass.h = a;
    corpo.innerHTML = `<div class="ig-topo"><div><b>${hooks.length}</b> webhook(s) <span class="vivo">ao vivo</span></div><button class="btn-azul" id="igNovoH"><i class="fa-solid fa-plus"></i> Novo webhook</button></div>` +
      (hooks.length ? `<div class="ig-lista">${hooks.map(cartaoHook).join('')}</div>` :
        `<div class="card-soft vazio"><i class="fa-solid fa-satellite-dish"></i>Nenhum webhook.<br>Receba um aviso no seu sistema a cada mensagem nova.</div>`);
    ZZ.$('#igNovoH', corpo).onclick = () => formHook();
    ZZ.$$('[data-ed]', corpo).forEach(b => b.onclick = () => formHook(hooks.find(h => String(h.id) === b.dataset.ed)));
    ZZ.$$('[data-ex]', corpo).forEach(b => b.onclick = () => excluirHook(b));
    ZZ.$$('[data-test]', corpo).forEach(b => b.onclick = () => testarHook(b));
    ZZ.$$('[data-logs]', corpo).forEach(b => b.onclick = () => logsHook(b.dataset.logs));
  }
  function cartaoHook(h) {
    const f = +(h.falhas_seguidas ?? h.falhas ?? 0), ativo = h.ativo === undefined ? true : !!+h.ativo;
    const cor = f >= 5 ? 'b-err' : f >= 1 ? 'b-pend' : 'b-ok';
    return `<article class="card-soft ig-card ${ativo ? '' : 'ig-off'}" data-id="${E(h.id)}">
      <header><span class="ig-ic ig-ic2"><i class="fa-solid fa-satellite-dish"></i></span><div class="ig-tit"><b>${E(h.nome || 'Webhook')}</b><small class="mut ig-url">${E(mascUrl(h.url))}</small></div>
        <span class="badge-status ${ativo ? 'b-ok' : 'b-pausa'}">${ativo ? 'Ligado' : 'Pausado'}</span></header>
      <div class="ig-chips">${arr(h.eventos).map(k => `<span class="ig-chip">${E(rotEv(k))}</span>`).join('') || '<span class="mut">todos os eventos</span>'}</div>
      <div class="ig-linha-st"><span class="badge-status ${cor}"><i class="fa-solid ${f ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${f ? f + ' falha(s) seguida(s)' : 'Sem falhas'}</span>
        ${h.ultimo_envio ? `<small class="mut">último envio ${E(relTxt(+h.ultimo_envio))}</small>` : '<small class="mut">nunca disparou</small>'}</div>${h.desativado_motivo ? `<div class="ig-aviso" style="margin:0 0 10px"><i class="fa-solid fa-circle-pause"></i><div>${E(h.desativado_motivo)}</div></div>` : ''}
      <div class="ig-res" id="igRes${E(h.id)}" hidden></div>
      <div class="ig-acoes"><button class="btn-azul btn-sm" data-test="${E(h.id)}"><i class="fa-solid fa-bolt"></i> Testar</button>
        <button class="btn-soft btn-sm" data-logs="${E(h.id)}"><i class="fa-solid fa-list"></i> Logs</button>
        <button class="btn-soft btn-sm" data-ed="${E(h.id)}"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-perigo btn-sm" data-ex="${E(h.id)}" aria-label="Excluir"><i class="fa-solid fa-trash"></i></button></div></article>`;
  }
  async function testarHook(b) {
    const id = b.dataset.test, box = ZZ.$('#igRes' + id); box.hidden = false; box.className = 'ig-res ig-res-p'; box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando teste…';
    const t0 = performance.now();
    const r = await ZZ.busy(b, () => ZZ.api('testar_webhook_saida', { corpo: { id: +id || id }, silencioso: true }));
    let det = '';
    if (r && !r.ok && r.http === undefined) { /* o proxy (Cloudflare) troca respostas 502 por HTML: busca o motivo no estado do webhook */
      const l = await ZZ.api('listar_webhooks_saida', { silencioso: true }); const h = lista(l).find(x => String(x.id) === String(id));
      if (h && h.ultimo_status) { det = h.ultimo_status; const mm = String(det).match(/HTTP (\d{3})/); if (mm) r.http = +mm[1]; }
    }
    const cod = r && (r.http ?? r.codigo), ms = r && (r.ms ?? r.tempo_ms ?? Math.round(performance.now() - t0));
    const ok = !!(r && r.ok);
    box.className = 'ig-res ' + (ok ? 'ig-res-ok' : 'ig-res-err');
    box.innerHTML = `<i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}"></i><div><b>${ok ? 'Entregue com sucesso' : 'Falhou'}</b><small>${cod ? 'HTTP ' + E(cod) + ' · ' : ''}${E(ms)} ms${!ok ? ' · ' + E(det || (r && r.msg) || '') : ''}</small></div>`;
    ZZ.toast(ok ? `Teste entregue (HTTP ${cod || 200}, ${ms} ms)` : det || (r && r.msg) || 'O teste falhou', ok ? 'ok' : 'err');
    return ok;
  }
  async function excluirHook(b) {
    if (!await ZZ.confirmar('Excluir este webhook? Seu sistema deixará de receber os avisos.', 'Excluir', true)) return;
    const r = await ZZ.busy(b, () => ZZ.api('excluir_webhook_saida', { corpo: { id: +b.dataset.ex || b.dataset.ex } }));
    if (r && r.ok) { ZZ.toast('Webhook excluído', 'ok'); const c = b.closest('.ig-card'); c && c.classList.add('ig-sai'); setTimeout(() => telaHooks(true), 350); }
  }
  function formHook(h) {
    h = h || {}; const evs = arr(h.eventos), ed = !!h.id;
    const m = ZZ.modal(`<h3><i class="fa-solid fa-satellite-dish"></i> ${ed ? 'Editar' : 'Novo'} webhook</h3>
      <label>Nome</label><input type="text" id="hNome" maxlength="60" value="${E(h.nome || '')}" placeholder="Ex.: Meu sistema">
      <label>URL que vai receber os avisos (https)</label><input type="text" id="hUrl" inputmode="url" autocapitalize="off" value="${E(h.url || '')}" placeholder="https://seusite.com/webhook">
      <label>Eventos</label><div class="ig-sw-lista">${EVENTOS.map(([k, n]) => `<label class="ig-sw"><span class="ig-sw-t"><span><b>${E(n)}</b></span></span><input type="checkbox" value="${k}" ${!ed || evs.includes(k) ? 'checked' : ''}><span class="ig-sw-b"></span></label>`).join('')}</div>
      <label class="ig-sw"><span class="ig-sw-t"><span><b>Ligado</b><small>Desligue para pausar sem excluir</small></span></span><input type="checkbox" id="hAtivo" ${h.ativo === undefined || +h.ativo ? 'checked' : ''}><span class="ig-sw-b"></span></label>
      ${ed ? `<label class="ig-sw"><span class="ig-sw-t"><span><b>Gerar novo segredo</b><small>O segredo antigo deixa de valer</small></span></span><input type="checkbox" id="hReg"><span class="ig-sw-b"></span></label>` : ''}
      <div class="acoes"><button class="btn-soft" data-f>Cancelar</button><button class="btn-azul" id="hSalva"><i class="fa-solid fa-floppy-disk"></i> Salvar</button></div>`);
    ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    ZZ.$('#hSalva', m.el).onclick = async e => {
      ZZ.$$('.erro-campo', m.el).forEach(x => x.classList.remove('erro-campo')); ZZ.$$('.msg-campo', m.el).forEach(x => x.remove());
      const n = ZZ.$('#hNome', m.el), u = ZZ.$('#hUrl', m.el), eventos = ZZ.$$('.ig-sw-lista input:checked', m.el).map(x => x.value);
      const bad = (c, msg) => { c.classList.add('erro-campo'); c.insertAdjacentHTML('afterend', `<div class="msg-campo">${msg}</div>`); c.focus(); ZZ.vibrar([30, 40, 30]); };
      if (n.value.trim().length < 2) return bad(n, 'Informe um nome.');
      if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(u.value.trim())) return bad(u, 'Informe uma URL válida (https://…).');
      if (!eventos.length) return ZZ.toast('Marque ao menos um evento', 'err');
      const r = await ZZ.busy(e.currentTarget, () => ZZ.api('salvar_webhook_saida', { corpo: { id: h.id, nome: n.value.trim(), url: u.value.trim(), eventos, ativo: ZZ.$('#hAtivo', m.el).checked ? 1 : 0, regenerar_segredo: ed && ZZ.$('#hReg', m.el).checked ? 1 : 0 } }));
      if (r && r.ok) { ZZ.toast('Webhook salvo', 'ok'); m.fechar(); telaHooks(true); if (r.segredo) mostrarSegredo(r.segredo, n.value.trim()); }
    };
  }
  function mostrarSegredo(sg, nome) {
    let c = false;
    const m = ZZ.modal(`<h3><i class="fa-solid fa-shield-halved" style="color:var(--verde)"></i> Segredo do webhook</h3><p class="mut">Use para validar a assinatura (<code>X-ZapZap-Assinatura</code>, HMAC-SHA256 do corpo) de <b>${E(nome)}</b>.</p>
      <div class="ig-aviso"><i class="fa-solid fa-triangle-exclamation"></i><div>Aparece <b>só agora</b>. Guarde em local seguro.</div></div><div class="ig-token">${E(sg)}</div>
      <button class="btn-azul w100" id="sgC"><i class="fa-solid fa-copy"></i> Copiar segredo</button><div class="acoes"><button class="btn-soft" id="sgF">Fechar</button></div>`);
    const b = ZZ.$('#sgC', m.el); b.onclick = async () => { if (await copiar(sg, b)) c = true; };
    ZZ.$('#sgF', m.el).onclick = async () => { if (!c && !await ZZ.confirmar('Você não copiou o segredo e ele não aparecerá de novo. Fechar mesmo assim?', 'Fechar', true)) return; m.fechar(); };
  }
  function logsHook(id) {
    const m = ZZ.modal(`<h3><i class="fa-solid fa-list"></i> Logs do webhook <span class="vivo">ao vivo</span></h3><div id="igLg">${ZZ.skeleton(3)}</div><div class="acoes"><button class="btn-soft" data-f>Fechar</button></div>`);
    let vivo = true; const fechar = m.fechar; m.fechar = () => { vivo = false; fechar(); };
    ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    const ler = async () => {
      if (!vivo) return; const j = await ZZ.api('listar_logs_webhook_saida', { params: { id }, silencioso: true });
      const box = ZZ.$('#igLg', m.el); if (!box || !vivo) return;
      if (!j.ok) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar os logs.</div>'; return; }
      const it = lista(j);
      box.innerHTML = it.length ? `<div class="ig-logs">${it.map(x => { const ok = !!x.ok; return `<div class="ig-log ${ok ? 'ok' : 'err'}"><span class="badge-status ${ok ? 'b-ok' : 'b-err'}">${E(x.http || (ok ? 'OK' : 'ERRO'))}</span><div><b>${E(rotEv(x.evento || '') || 'evento')}</b><small class="mut">${x.ts ? ZZ.fmtDataHora(x.ts) : ''}${x.tentativas > 1 ? ' · ' + E(x.tentativas) + ' tentativas' : ''}${x.ms != null ? ' · ' + E(x.ms) + ' ms' : ''}${x.erro ? ' · ' + E(x.erro) : ''}</small></div></div>`; }).join('')}</div>` : '<div class="vazio"><i class="fa-solid fa-inbox"></i>Nenhum envio registrado ainda.</div>';
    };
    ler(); const t = setInterval(() => document.hidden || ler(), 5000); const o = new MutationObserver(() => { if (!document.body.contains(m.el)) { vivo = false; clearInterval(t); o.disconnect(); } }); o.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------- COMO USAR ---------------- */
  function telaUso() {
    const ex = {
      curl: `curl -X POST "${BASE}?acao=enviar_texto" \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"numero":"5582999999999","texto":"Olá! Pedido confirmado."}'`,
      php: `<?php\n$ch = curl_init("${BASE}?acao=enviar_texto");\ncurl_setopt_array($ch, [\n  CURLOPT_POST => true,\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => [\n    "Authorization: Bearer SEU_TOKEN",\n    "Content-Type: application/json",\n  ],\n  CURLOPT_POSTFIELDS => json_encode([\n    "numero" => "5582999999999",\n    "texto" => "Olá! Pedido confirmado.",\n  ]),\n]);\n$resposta = curl_exec($ch);\ncurl_close($ch);\necho $resposta;`,
      js: `const r = await fetch("${BASE}?acao=enviar_texto", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer SEU_TOKEN",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ numero: "5582999999999", texto: "Olá! Pedido confirmado." }),\n});\nconsole.log(await r.json());`,
      st: `curl "${BASE}?acao=status" \\\n  -H "Authorization: Bearer SEU_TOKEN"`,
      ms: `curl "${BASE}?acao=mensagens&jid=5582999999999" \\\n  -H "Authorization: Bearer SEU_TOKEN"`,
      wh: `{\n  "evento": "mensagem_recebida",\n  "instancia": "minha-conexao",\n  "ts": 1790000000,\n  "teste": false,\n  "dados": { ... }\n}`};
    const bloco = (k, tit, ic) => `<div class="card-soft ig-ex"><div class="ch"><i class="fa-solid ${ic}"></i> ${tit}<button class="btn-soft btn-sm ig-cp" data-cp="${k}"><i class="fa-solid fa-copy"></i> Copiar</button></div><pre class="ig-code"><code>${E(ex[k])}</code></pre></div>`;
    corpo.innerHTML = `<div class="card-soft ig-intro"><div class="ch"><i class="fa-solid fa-circle-info"></i> Como funciona</div>
      <p>Cada requisição precisa do cabeçalho <code>Authorization: Bearer SEU_TOKEN</code>. Crie o token na aba <b>Tokens</b> e troque <code>SEU_TOKEN</code> nos exemplos.</p>
      <div class="ig-aviso ig-aviso-b"><i class="fa-solid fa-signature"></i><div><b>Assinatura obrigatória.</b> Toda mensagem enviada pela API sai com a assinatura do token em negrito na primeira linha, por exemplo <code>*Loja Central:*</code> seguido do texto. Não é possível desativar.</div></div>
      <p class="mut">URL base: <code>${E(BASE)}</code> · <a href="${E(BASE)}?acao=ajuda" target="_blank" rel="noopener">ver ajuda da API</a></p></div>
      ${bloco('curl', 'Enviar texto — cURL', 'fa-terminal')}${bloco('php', 'Enviar texto — PHP', 'fa-brands fa-php')}${bloco('js', 'Enviar texto — JavaScript', 'fa-brands fa-js')}
      ${bloco('st', 'Ver status da conexão', 'fa-signal')}${bloco('ms', 'Listar mensagens de uma conversa', 'fa-envelope-open-text')}
      <div class="card-soft ig-ex"><div class="ch"><i class="fa-solid fa-satellite-dish"></i> Formato dos webhooks recebidos<button class="btn-soft btn-sm ig-cp" data-cp="wh"><i class="fa-solid fa-copy"></i> Copiar</button></div><pre class="ig-code"><code>${E(ex.wh)}</code></pre><small class="mut">Cabeçalhos: <code>X-ZapZap-Evento</code> e <code>X-ZapZap-Assinatura: sha256=…</code> (HMAC-SHA256 do corpo com o segredo do webhook). Responda HTTP 2xx em até 5 segundos; falhas seguidas pausam o webhook.</small></div>`;
    ZZ.$$('.ig-cp', corpo).forEach(b => b.onclick = () => copiar(ex[b.dataset.cp], b));
    ZZ.$$('.ig-ex .ch .fa-brands', corpo).forEach(i => i.classList.add('fa-solid'));
  }

  desenhar();
  ZZ.poll(() => { if (aba === 'tokens') telaTokens(true); else if (aba === 'hooks') telaHooks(true); }, 10000);
} });
