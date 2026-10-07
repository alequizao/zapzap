/* ZapZap — módulo Chatbot (front). Consome: listar_fluxos, ver_fluxo, salvar_fluxo, ativar_fluxo, excluir_fluxo, duplicar_fluxo, testar_fluxo,
   listar_sessoes_chatbot, encerrar_sessao_chatbot, listar_logs_chatbot, ver_webhook/webhook_ligar/webhook_desligar (e listar_filas, opcional). */
(function () {
  'use strict';
  const ZZ = window.ZZ;
  const esc = ZZ.esc;

  const TIPOS = {
    mensagem: { ic: 'fa-message', nome: 'Mensagem', cor: 'azul' },
    menu: { ic: 'fa-list-ol', nome: 'Menu', cor: 'roxo' },
    pergunta: { ic: 'fa-circle-question', nome: 'Pergunta', cor: 'amar' },
    transferir_fila: { ic: 'fa-headset', nome: 'Transferir', cor: 'verde' },
    encerrar: { ic: 'fa-flag-checkered', nome: 'Encerrar', cor: 'cinza' },
    webhook: { ic: 'fa-plug', nome: 'Webhook', cor: 'cinza' }
  };
  const TERMINAIS = ['transferir_fila', 'encerrar'];
  const GATILHOS = { primeira_mensagem: 'Primeira mensagem do contato', palavra: 'Palavras-chave', sempre_que_sem_atendimento: 'Toda mensagem sem atendimento' };
  const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];
  const CFG_PADRAO = { so_fora_horario: false, mensagem_invalida: 'Não entendi sua resposta. Por favor, escolha uma das opções.', tentativas_max: 3, ao_exceder: 'transferir', expira_minutos: 30 };

  /* ---------- modelos prontos ---------- */
  const MODELOS = {
    atendimento: {
      nome: 'Menu de atendimento', ic: 'fa-headset', desc: 'Saudação com menu: Comercial, Suporte e Horário.',
      fluxo: () => ({
        nome: 'Menu de atendimento', gatilho: { tipo: 'primeira_mensagem', termos: [] },
        nos: [
          { id: 'n1', tipo: 'menu', texto: 'Olá! Seja bem-vindo(a). Como podemos ajudar?\nEscolha uma opção:', opcoes: [{ texto: 'Comercial', proximo: 'n2' }, { texto: 'Suporte', proximo: 'n3' }, { texto: 'Horário de funcionamento', proximo: 'n4' }] },
          { id: 'n2', tipo: 'transferir_fila', texto: 'Certo! Vou chamar um atendente do comercial. Aguarde um instante.', fila: '' },
          { id: 'n3', tipo: 'transferir_fila', texto: 'Certo! Vou chamar um atendente do suporte. Aguarde um instante.', fila: '' },
          { id: 'n4', tipo: 'mensagem', texto: 'Atendemos de segunda a sexta, das 8h às 18h, e aos sábados, das 8h às 12h.', proximo: 'n5' },
          { id: 'n5', tipo: 'encerrar', texto: 'Obrigado pelo contato! Se precisar, é só chamar.' }
        ]
      })
    },
    horario: {
      nome: 'Horário e endereço', ic: 'fa-location-dot', desc: 'Responde horário e endereço quando perguntam.',
      fluxo: () => ({
        nome: 'Horário e endereço', gatilho: { tipo: 'palavra', termos: ['horário', 'horario', 'endereço', 'endereco', 'onde fica'] },
        nos: [
          { id: 'n1', tipo: 'mensagem', texto: 'Estamos na Rua Exemplo, 123 — Centro.\nAtendemos de segunda a sexta, das 8h às 18h.', proximo: 'n2' },
          { id: 'n2', tipo: 'encerrar', texto: 'Qualquer outra dúvida, é só chamar!' }
        ]
      })
    },
    orcamento: {
      nome: 'Orçamento', ic: 'fa-file-invoice-dollar', desc: 'Pergunta nome e pedido e passa para o comercial.',
      fluxo: () => ({
        nome: 'Orçamento', gatilho: { tipo: 'palavra', termos: ['orçamento', 'orcamento', 'preço', 'preco', 'valor'] },
        nos: [
          { id: 'n1', tipo: 'mensagem', texto: 'Vamos preparar o seu orçamento. Preciso de duas informações rápidas.', proximo: 'n2' },
          { id: 'n2', tipo: 'pergunta', texto: 'Qual é o seu nome?', variavel: 'nome', proximo: 'n3' },
          { id: 'n3', tipo: 'pergunta', texto: 'Prazer, {{nome}}! O que você gostaria de orçar?', variavel: 'pedido', proximo: 'n4' },
          { id: 'n4', tipo: 'mensagem', texto: 'Obrigado, {{nome}}! Já anotei: {{pedido}}. Vou chamar um atendente.', proximo: 'n5' },
          { id: 'n5', tipo: 'transferir_fila', texto: '', fila: '' }
        ]
      })
    }
  };

  /* ---------- normalização (aceita pequenas variações do back-end) ---------- */
  const lista = v => Array.isArray(v) ? v : [];
  function normGatilho(g) {
    g = g && typeof g === 'object' ? g : {};
    const t = GATILHOS[g.tipo] ? g.tipo : 'primeira_mensagem';
    return { tipo: t, termos: lista(g.termos).map(String), horario: g.horario && typeof g.horario === 'object' ? { dias: lista(g.horario.dias).map(Number), ini: g.horario.ini || '08:00', fim: g.horario.fim || '18:00' } : null };
  }
  const sid = v => (v === null || v === undefined || v === '' || v === 0 || v === '0') ? '' : String(v);
  const completo = n => ({ id: String(n.id), tipo: TIPOS[n.tipo] ? n.tipo : 'mensagem', texto: n.texto || '', opcoes: lista(n.opcoes).map(o => ({ texto: o.texto || '', proximo: sid(o.proximo) })), proximo: sid(n.proximo), variavel: n.variavel || '', fila: sid(n.fila), url: n.url || '', enviar_resposta: !!n.enviar_resposta, pos_x: n.pos_x ?? null, pos_y: n.pos_y ?? null });
  function normNo(n) {
    const c = n.conteudo || {};
    return completo({ id: n.id, tipo: n.tipo, texto: c.texto, opcoes: lista(c.opcoes).map(o => ({ texto: o.rotulo, proximo: o.proximo_no_id })), proximo: c.proximo_no_id, variavel: c.variavel, fila: c.fila_id, url: c.url, enviar_resposta: c.enviar_resposta, pos_x: n.pos_x, pos_y: n.pos_y });
  }
  function normFluxo(f, nos) {
    const ini = sid(f.no_inicial_id); let ns = lista(nos).map(normNo);
    ns = ns.filter(n => n.id === ini).concat(ns.filter(n => n.id !== ini));
    return { id: f.id || 0, nome: f.nome || '', gatilho: normGatilho(f.gatilho), ativo: !!f.ativo, modo: f.modo === 'ao_vivo' ? 'vivo' : 'teste',
      cfg: { so_fora_horario: !!f.so_fora_horario, mensagem_invalida: f.mensagem_invalida || CFG_PADRAO.mensagem_invalida, tentativas_max: +f.tentativas_max || 3, ao_exceder: f.ao_exceder === 'encerrar' ? 'encerrar' : 'transferir', expira_minutos: +f.expira_minutos || 30 }, nos: ns };
  }
  const gatilhoTxt = g => { g = normGatilho(g); return g.tipo === 'palavra' ? (g.termos.length ? 'Palavras: ' + g.termos.slice(0, 4).join(', ') + (g.termos.length > 4 ? '…' : '') : 'Palavras-chave') : GATILHOS[g.tipo]; };
  const modoApi = m => m === 'vivo' ? 'ao_vivo' : 'teste';
  const num = v => +v || 0;

  /* ---------- validação e mapa ---------- */
  const destinos = n => n.tipo === 'menu' ? n.opcoes.map(o => o.proximo).filter(Boolean) : (TERMINAIS.includes(n.tipo) ? [] : (n.proximo ? [n.proximo] : []));
  function alcancaveis(nos) {
    const vis = new Set(); if (!nos.length) return vis;
    const mapa = Object.fromEntries(nos.map(n => [n.id, n])); const fila = [nos[0].id];
    while (fila.length) { const id = fila.pop(); if (vis.has(id) || !mapa[id]) continue; vis.add(id); destinos(mapa[id]).forEach(d => fila.push(d)); }
    return vis;
  }
  function semSaida(n, ids) {
    if (TERMINAIS.includes(n.tipo)) return false;
    if (n.tipo === 'menu') return !n.opcoes.length || n.opcoes.some(o => !o.proximo || !ids.has(o.proximo));
    return !n.proximo || !ids.has(n.proximo);
  }
  function validar(D) {
    const ids = new Set(D.nos.map(n => n.id)), al = alcancaveis(D.nos);
    const inalc = D.nos.filter(n => !al.has(n.id)).map(n => n.id), sem = D.nos.filter(n => semSaida(n, ids)).map(n => n.id);
    return { ids, al, inalc, sem };
  }
  const resumo = n => { const t = String(n.texto || '').replace(/\s+/g, ' ').trim(); return t ? (t.length > 60 ? t.slice(0, 60) + '…' : t) : (n.tipo === 'webhook' ? (n.url || 'Sem endereço') : 'Sem texto ainda'); };
  const rotuloNo = (D, id) => { const i = D.nos.findIndex(n => n.id === id); return i < 0 ? '' : `${i + 1} · ${TIPOS[D.nos[i].tipo].nome}`; };
  const proxId = D => { let m = 0; D.nos.forEach(n => { const k = +String(n.id).replace(/\D/g, ''); if (k > m) m = k; }); return 'n' + (m + 1); };

  /* ---------- estado ---------- */
  let S = null;
  const novoS = () => ({ raiz: null, vivo: true, aba: 'fluxos', fluxos: null, sessoes: null, logs: null, wh: null, filas: [], sig: {}, ed: null });

  /* ======================================================================
     LISTA (banner + abas)
     ====================================================================== */
  function renderLista() {
    const el = S.raiz; S.ed = null;
    const edit = ZZ.pode('chatbot.editar');
    el.innerHTML = `<div class="cb">
      <div class="cb-banner" id="cbBanner">${ZZ.skeleton(1, 'skel-linha')}</div>
      <div class="cb-abas" role="tablist">
        <button data-aba="fluxos" class="${S.aba === 'fluxos' ? 'ativa' : ''}"><i class="fa-solid fa-diagram-project"></i> Fluxos</button>
        <button data-aba="sessoes" class="${S.aba === 'sessoes' ? 'ativa' : ''}"><i class="fa-solid fa-comments"></i> Sessões <span class="cb-n" id="cbNSes" hidden></span></button>
        <button data-aba="logs" class="${S.aba === 'logs' ? 'ativa' : ''}"><i class="fa-solid fa-list-ul"></i> Registros</button>
      </div>
      <div id="cbCorpo"></div></div>`;
    el.querySelectorAll('.cb-abas button').forEach(b => b.onclick = () => { S.aba = b.dataset.aba; el.querySelectorAll('.cb-abas button').forEach(x => x.classList.toggle('ativa', x === b)); pintarCorpo(true); carregarAba(); });
    pintarBanner(); pintarCorpo(true); carregarTudo();
    ZZ.poll(() => { carregarWebhook(true); carregarAba(true); if (S.aba !== 'sessoes') carregarSessoes(true); }, 6000);
  }

  async function carregarTudo() { await Promise.all([carregarWebhook(), carregarFluxos(), carregarSessoes(true)]); if (S.aba === 'logs') carregarLogs(); }
  const carregarAba = silencioso => S.aba === 'fluxos' ? carregarFluxos(silencioso) : S.aba === 'sessoes' ? carregarSessoes(silencioso) : carregarLogs(silencioso);

  async function carregarWebhook(sil) {
    const j = await ZZ.api('ver_webhook', { silencioso: true });
    const ant = S.wh; S.wh = j.ok ? { ligado: !!j.ligado } : { erro: true };
    if (!sil || JSON.stringify(ant) !== JSON.stringify(S.wh)) pintarBanner();
  }
  function pintarBanner() {
    const b = ZZ.$('#cbBanner'); if (!b) return; const w = S.wh, edit = ZZ.pode('chatbot.editar');
    if (!w) { b.innerHTML = ZZ.skeleton(1); return; }
    if (w.erro) { b.className = 'cb-banner cb-b-off'; b.innerHTML = '<div class="cb-b-txt"><b><i class="fa-solid fa-triangle-exclamation"></i> Não foi possível ver o recebimento em tempo real</b></div><button class="btn-soft btn-sm" data-ac="wh-tentar"><i class="fa-solid fa-rotate"></i> Tentar de novo</button>'; }
    else b.className = 'cb-banner ' + (w.ligado ? 'cb-b-on' : 'cb-b-off');
    if (!w.erro) b.innerHTML = `<div class="cb-b-txt"><b>${w.ligado ? '<span class="vivo">Recebimento em tempo real ligado</span>' : '<i class="fa-solid fa-plug-circle-xmark"></i> Recebimento em tempo real desligado'}</b>
      <small>${w.ligado ? 'O chatbot responde as mensagens assim que chegam.' : 'Sem ele o chatbot não recebe as mensagens dos clientes. Ligue para os fluxos ativos funcionarem.'}</small></div>
      ${edit ? `<button class="${w.ligado ? 'btn-soft' : 'btn-azul'} btn-sm" data-ac="wh-alt"><i class="fa-solid ${w.ligado ? 'fa-power-off' : 'fa-bolt'}"></i> ${w.ligado ? 'Desligar' : 'Ligar recebimento'}</button>` : ''}`;
    b.onclick = async e => {
      const bt = e.target.closest('button'); if (!bt) return;
      if (bt.dataset.ac === 'wh-tentar') return ZZ.busy(bt, async () => { await carregarWebhook(); return true; });
      if (bt.dataset.ac !== 'wh-alt') return;
      const lig = S.wh.ligado;
      if (!await ZZ.confirmar(lig ? 'Desligar o recebimento em tempo real? Os fluxos deixam de responder até você ligar de novo.' : 'Ligar o recebimento em tempo real nesta conexão? As mensagens recebidas passam a ser enviadas ao painel.', lig ? 'Desligar' : 'Ligar', lig)) return;
      const r = await ZZ.busy(bt, () => ZZ.api(lig ? 'webhook_desligar' : 'webhook_ligar', { corpo: {} }));
      if (r && r.ok) { ZZ.toast(r.msg || (lig ? 'Recebimento desligado' : 'Recebimento ligado'), 'ok'); S.wh = { ligado: !lig }; pintarBanner(); }
    };
  }

  /* ---------- corpo da lista ---------- */
  function pintarCorpo(esqueleto) {
    const c = ZZ.$('#cbCorpo'); if (!c) return;
    if (S.aba === 'fluxos') pintarFluxos(esqueleto); else if (S.aba === 'sessoes') pintarSessoes(esqueleto); else pintarLogs(esqueleto);
  }
  function erroCard(msg, ac) { return `<div class="card-soft vazio"><i class="fa-solid fa-triangle-exclamation"></i>${esc(msg)}<br><button class="btn-azul btn-sm" data-ac="${ac}" style="margin-top:12px"><i class="fa-solid fa-rotate"></i> Tentar de novo</button></div>`; }
  function ligarRecarga(c) { c.querySelectorAll('[data-ac=recarregar]').forEach(b => b.onclick = () => ZZ.busy(b, async () => { await carregarAba(); return true; })); }

  async function carregarFluxos(sil) {
    const j = await ZZ.api('listar_fluxos', { silencioso: true });
    if (!S.raiz || S.ed) return;
    const novo = j.ok ? lista(j.fluxos).map(f => ({ id: f.id, nome: f.nome, gatilho: f.gatilho, ativo: !!f.ativo, modo: f.modo === 'ao_vivo' ? 'vivo' : 'teste', nos: num(f.nos), sessoes: num(f.sessoes_ativas) })) : null;
    const sig = JSON.stringify(novo);
    if (sig === S.sig.fluxos && S.fluxos !== null && sil) return;
    const ant = S.fluxos; S.sig.fluxos = sig; S.fluxos = novo || false;
    S.mudou = new Set(); if (ant && novo) novo.forEach(f => { const a = ant.find(x => x.id === f.id); if (a && JSON.stringify(a) !== JSON.stringify(f)) S.mudou.add(f.id); });
    if (S.aba === 'fluxos') pintarFluxos();
  }
  function pintarFluxos(esqueleto) {
    const c = ZZ.$('#cbCorpo'); if (!c) return; const edit = ZZ.pode('chatbot.editar');
    if (S.fluxos === null || (esqueleto && S.fluxos === null)) { c.innerHTML = ZZ.skeleton(3, 'skel-linha cb-skel'); return; }
    if (S.fluxos === false) { c.innerHTML = erroCard('Não foi possível carregar os fluxos.', 'recarregar'); ligarRecarga(c); return; }
    const modelos = Object.entries(MODELOS).map(([k, m]) => `<button class="cb-modelo" data-modelo="${k}" ${edit ? '' : 'disabled'}><span class="cb-mi"><i class="fa-solid ${m.ic}"></i></span><span><b>${esc(m.nome)}</b><small>${esc(m.desc)}</small></span><i class="fa-solid fa-plus cb-mp"></i></button>`).join('');
    let h = '';
    if (!S.fluxos.length) h = `<div class="card-soft cb-vazio"><i class="fa-solid fa-robot"></i><h3>Nenhum fluxo ainda</h3><p class="mut">Comece por um modelo pronto — você pode editar tudo depois.</p><div class="cb-modelos">${modelos}</div>${edit ? '<button class="btn-soft" data-ac="novo"><i class="fa-solid fa-plus"></i> Começar do zero</button>' : ''}</div>`;
    else {
      h = `<div class="cb-topo"><div class="mut">${S.fluxos.length} fluxo${S.fluxos.length > 1 ? 's' : ''} <span class="vivo">ao vivo</span></div>${edit ? '<button class="btn-azul" data-ac="novo"><i class="fa-solid fa-plus"></i> Novo fluxo</button>' : ''}</div>
      <div class="cb-cards">${S.fluxos.map(cardFluxo).join('')}</div>
      ${edit ? `<details class="cb-det"><summary><i class="fa-solid fa-wand-magic-sparkles"></i> Criar a partir de um modelo</summary><div class="cb-modelos">${modelos}</div></details>` : ''}`;
    }
    c.innerHTML = h; ligarFluxos(c);
    if (S.mudou) S.mudou.forEach(id => { const e = c.querySelector(`[data-fid="${id}"]`); if (e) e.classList.add('cb-novo'); }); S.mudou = null;
  }
  function cardFluxo(f) {
    const edit = ZZ.pode('chatbot.editar'), vivo = f.modo === 'vivo';
    return `<div class="card-soft cb-card ${f.ativo ? 'cb-on' : ''}" data-fid="${f.id}">
      <div class="cb-c-topo" data-ac="abrir"><span class="cb-c-ic"><i class="fa-solid fa-robot"></i></span>
        <div class="cb-c-txt"><b>${esc(f.nome || 'Sem nome')}</b><small><i class="fa-solid fa-bolt"></i> ${esc(gatilhoTxt(f.gatilho))}</small></div>
        <label class="cb-sw" title="${f.ativo ? 'Ativo' : 'Inativo'}" data-sw><input type="checkbox" ${f.ativo ? 'checked' : ''} ${edit ? '' : 'disabled'} aria-label="Ativar fluxo"><span></span></label></div>
      <div class="cb-c-info"><span class="badge-status ${vivo ? 'b-err cb-vivo' : 'b-pend'}" title="${vivo ? 'Responde clientes de verdade' : 'Modo teste: só registra, não envia respostas'}"><i class="fa-solid ${vivo ? 'fa-tower-broadcast' : 'fa-flask'}"></i> ${vivo ? 'AO VIVO' : 'TESTE'}</span>
        <span class="badge-status b-info"><i class="fa-solid fa-diagram-project"></i> ${f.nos} nó${f.nos === 1 ? '' : 's'}</span>
        <span class="badge-status ${f.sessoes ? 'b-ok' : 'b-pausa'}"><i class="fa-solid fa-comments"></i> ${f.sessoes} em andamento</span></div>
      <div class="cb-c-acoes"><button class="btn-soft btn-sm" data-ac="abrir"><i class="fa-solid fa-pen"></i> ${edit ? 'Editar' : 'Ver'}</button>
        ${edit ? `<button class="btn-soft btn-sm" data-ac="modo">${vivo ? '<i class="fa-solid fa-flask"></i> Voltar p/ teste' : '<i class="fa-solid fa-tower-broadcast"></i> Pôr AO VIVO'}</button>
        <button class="btn-soft btn-sm" data-ac="dup" aria-label="Duplicar"><i class="fa-regular fa-copy"></i></button>
        <button class="btn-perigo btn-sm" data-ac="exc" aria-label="Excluir"><i class="fa-solid fa-trash"></i></button>` : ''}</div></div>`;
  }
  function ligarFluxos(c) {
    c.querySelectorAll('[data-modelo]').forEach(b => b.onclick = () => criarModelo(b.dataset.modelo, b));
    c.querySelectorAll('[data-ac=novo]').forEach(b => b.onclick = () => abrirEditor(0, { novo: true }));
    ligarRecarga(c);
    c.querySelectorAll('.cb-card').forEach(card => {
      const id = +card.dataset.fid, f = S.fluxos.find(x => x.id === id); if (!f) return;
      const sw = card.querySelector('[data-sw] input');
      sw.onchange = async () => {
        const quer = sw.checked; sw.disabled = true; card.classList.add('cb-ocupado');
        const r = await ZZ.api('ativar_fluxo', { corpo: { id, ativo: quer, modo: modoApi(f.modo) } });
        card.classList.remove('cb-ocupado'); sw.disabled = false;
        if (r.ok) { f.ativo = quer; card.classList.toggle('cb-on', quer); ZZ.toast(r.msg || (quer ? 'Fluxo ativado' : 'Fluxo desativado'), 'ok'); card.classList.add('ok-flash'); setTimeout(() => card.classList.remove('ok-flash'), 900); if (r.aviso) ZZ.toast(r.aviso, 'err'); S.sig.fluxos = ''; }
        else { sw.checked = !quer; card.classList.add('erro-flash'); setTimeout(() => card.classList.remove('erro-flash'), 600); }
      };
      card.querySelector('[data-sw]').onclick = e => e.stopPropagation();
      card.onclick = async e => {
        const b = e.target.closest('[data-ac]'); if (!b) return; const ac = b.dataset.ac;
        if (ac === 'abrir') return abrirEditor(id);
        if (ac === 'dup') { const r = await ZZ.busy(b, () => ZZ.api('duplicar_fluxo', { corpo: { id } })); if (r && r.ok) { ZZ.toast('Fluxo duplicado (inativo, em teste)', 'ok'); S.sig.fluxos = ''; carregarFluxos(); } }
        if (ac === 'exc') {
          if (!await ZZ.confirmar(`Excluir o fluxo "${f.nome}"? As sessões em andamento serão encerradas. Isso não pode ser desfeito.`, 'Excluir', true)) return;
          const r = await ZZ.busy(b, () => ZZ.api('excluir_fluxo', { corpo: { id } })); if (r && r.ok) { ZZ.toast('Fluxo excluído', 'ok'); card.classList.add('cb-sai'); setTimeout(() => { S.sig.fluxos = ''; carregarFluxos(); }, 250); }
        }
        if (ac === 'modo') {
          if (f.modo === 'vivo') { if (!await ZZ.confirmar('Voltar este fluxo para o modo TESTE?', 'Voltar para teste')) return; }
          else {
            if (!await ZZ.confirmar(`Colocar "${f.nome}" AO VIVO? Clientes reais passarão a receber as respostas do robô.`, 'Continuar')) return;
            if (!await ZZ.confirmar('Tem certeza? Confirme que você já simulou a conversa e revisou todos os textos.', 'Sim, pôr AO VIVO', true)) return;
          }
          const novo = f.modo === 'vivo' ? 'teste' : 'vivo';
          const r = await ZZ.busy(b, () => ZZ.api('ativar_fluxo', { corpo: { id, ativo: f.ativo, modo: modoApi(novo) } }));
          if (r && r.ok) { f.modo = novo; ZZ.toast(novo === 'vivo' ? 'Fluxo AO VIVO' : 'Fluxo em modo teste', 'ok'); S.sig.fluxos = ''; pintarFluxos(); const n = ZZ.$(`[data-fid="${id}"]`); n && n.classList.add('cb-novo'); }
        }
      };
    });
  }
  async function criarModelo(k, btn) {
    const m = MODELOS[k]; if (!m) return; const f = m.fluxo();
    const D = { id: 0, nome: f.nome, gatilho: normGatilho(f.gatilho), cfg: { ...CFG_PADRAO }, nos: f.nos.map(completo) };
    const r = await ZZ.busy(btn, () => ZZ.api('salvar_fluxo', { corpo: paraServidor(D) }));
    if (r && r.ok) { ZZ.toast(`Modelo "${m.nome}" criado. Revise os textos e simule!`, 'ok'); S.sig.fluxos = ''; r.fluxo && r.fluxo.id ? ZZ.ir('chatbot', { fluxo: r.fluxo.id }) : carregarFluxos(); }
  }

  /* ---------- sessões ---------- */
  async function carregarSessoes(sil) {
    const j = await ZZ.api('listar_sessoes_chatbot', { params: { estado: 'ativo', por: 100 }, silencioso: true });
    if (!S.raiz) return;
    const novo = j.ok ? lista(j.sessoes) : null; const sig = JSON.stringify(novo);
    const n = ZZ.$('#cbNSes'); if (n) { const q = novo ? novo.length : 0; n.hidden = !q; n.textContent = q; }
    if (sig === S.sig.sessoes && S.sessoes !== null && sil) return;
    S.sig.sessoes = sig; S.sessoes = novo || false; if (S.aba === 'sessoes' && !S.ed) pintarSessoes();
  }
  function pintarSessoes() {
    const c = ZZ.$('#cbCorpo'); if (!c) return;
    if (S.sessoes === null) { c.innerHTML = ZZ.skeleton(3, 'skel-linha cb-skel'); return; }
    if (S.sessoes === false) { c.innerHTML = erroCard('Não foi possível carregar as sessões.', 'recarregar'); ligarRecarga(c); return; }
    if (!S.sessoes.length) { c.innerHTML = '<div class="card-soft vazio"><i class="fa-solid fa-comments"></i>Nenhuma conversa em andamento com o chatbot.<br><small>Quando um cliente cair em um fluxo ativo, ele aparece aqui.</small></div>'; return; }
    const edit = ZZ.pode('chatbot.editar');
    c.innerHTML = `<div class="cb-topo"><div class="mut">${S.sessoes.length} em andamento <span class="vivo">ao vivo</span></div></div><div class="cb-cards">` + S.sessoes.map(s => {
      const nome = (s.nome && s.nome !== 'Contato Teste' ? s.nome : '') || ZZ.fmtNumero(String(s.jid || '').split('@')[0]) || 'Contato', ts = num(s.atualizada || s.atualizado || s.ultima || s.iniciada || s.inicio);
      return `<div class="card-soft cb-ses" data-sid="${esc(s.id)}"><span class="avatar">${esc(ZZ.iniciais(nome))}</span>
        <div class="cb-c-txt"><b>${esc(nome)}</b><small>${esc(s.fluxo || 'Fluxo')}${s.modo === 'teste' ? ' · teste' : ''}${ts ? ' · há ' + ZZ.fmtRel(ts) : ''}</small></div>
        ${s.jid ? '<button class="btn-soft btn-sm" data-ac="chat" aria-label="Abrir conversa"><i class="fa-solid fa-comment"></i></button>' : ''}
        ${edit ? '<button class="btn-perigo btn-sm" data-ac="enc"><i class="fa-solid fa-circle-stop"></i> Encerrar</button>' : ''}</div>`;
    }).join('') + '</div>';
    c.querySelectorAll('.cb-ses').forEach(card => {
      const s = S.sessoes.find(x => String(x.id) === card.dataset.sid);
      const bc = card.querySelector('[data-ac=chat]'); if (bc) bc.onclick = () => ZZ.ir('conversas', { jid: s.jid });
      const be = card.querySelector('[data-ac=enc]'); if (be) be.onclick = async () => {
        if (!await ZZ.confirmar('Encerrar esta sessão? O cliente deixa de ser atendido pelo robô nesta conversa.', 'Encerrar', true)) return;
        const r = await ZZ.busy(be, () => ZZ.api('encerrar_sessao_chatbot', { corpo: { id: s.id } }));
        if (r && r.ok) { ZZ.toast('Sessão encerrada', 'ok'); card.classList.add('cb-sai'); setTimeout(() => { S.sig.sessoes = ''; carregarSessoes(); }, 250); }
      };
    });
  }

  /* ---------- registros ao vivo ---------- */
  async function carregarLogs(sil) {
    const j = await ZZ.api('listar_logs_chatbot', { silencioso: true });
    if (!S.raiz || S.ed) return;
    const novo = j.ok ? lista(j.logs) : null; const sig = JSON.stringify(novo);
    if (sig === S.sig.logs && S.logs !== null && sil) return;
    const ant = new Set((S.logs || []).map(l => JSON.stringify(l))); S.novosLogs = novo ? novo.filter(l => S.logs && !ant.has(JSON.stringify(l))).map(l => JSON.stringify(l)) : [];
    S.sig.logs = sig; S.logs = novo || false; if (S.aba === 'logs') pintarLogs();
  }
  const LOG_IC = { recebida: ['fa-arrow-right-to-bracket', 'cb-l-in', 'Recebida'], enviada: ['fa-arrow-right-from-bracket', 'cb-l-out', 'Enviada'], invalida: ['fa-circle-question', 'cb-l-err', 'Resposta inválida'], erro: ['fa-circle-exclamation', 'cb-l-err', 'Erro'], transferida: ['fa-headset', 'cb-l-tr', 'Transferida'], encerrada: ['fa-flag-checkered', 'cb-l-tr', 'Encerrada'], expirada: ['fa-hourglass-end', 'cb-l-tr', 'Expirada'], ignorada: ['fa-ban', 'cb-l-tr', 'Ignorada'], iniciada: ['fa-play', 'cb-l-tr', 'Iniciada'] };
  function pintarLogs() {
    const c = ZZ.$('#cbCorpo'); if (!c) return;
    if (S.logs === null) { c.innerHTML = ZZ.skeleton(5, 'skel-linha cb-skel-s'); return; }
    if (S.logs === false) { c.innerHTML = erroCard('Não foi possível carregar os registros.', 'recarregar'); ligarRecarga(c); return; }
    if (!S.logs.length) { c.innerHTML = '<div class="card-soft vazio"><i class="fa-solid fa-list-ul"></i>Nenhum registro ainda.<br><small>Cada passo do robô aparece aqui em tempo real.</small></div>'; return; }
    const novos = new Set(S.novosLogs || []);
    c.innerHTML = `<div class="cb-topo"><div class="mut">Últimos registros <span class="vivo">ao vivo</span></div></div><div class="card-soft cb-logs">` + S.logs.map(l => {
      const tp = String(l.evento || 'info').toLowerCase(), [ic, cl, rot] = LOG_IC[tp] || ['fa-circle-info', 'cb-l-in', tp];
      const nome = ZZ.fmtNumero(String(l.jid || '').split('@')[0]), ts = num(l.ts);
      return `<div class="cb-log ${novos.has(JSON.stringify(l)) ? 'cb-novo' : ''}"><span class="cb-l-ic ${cl}"><i class="fa-solid ${ic}"></i></span><div class="cb-log-t"><div><b>${esc(rot)}</b>${l.simulado ? ' <span class="badge-status b-pausa">simulação</span>' : ''}${l.texto ? ' — ' + esc(l.texto) : ''}</div><small>${esc(nome)}${ts ? ' · ' + ZZ.fmtHora(ts) : ''}</small></div></div>`;
    }).join('') + '</div>';
  }

  /* ======================================================================
     EDITOR
     ====================================================================== */
  const abrirEditor = (id, o = {}) => ZZ.ir('chatbot', { fluxo: id || 'novo' });
  async function entrarEditor(param) {
    const el = S.raiz; const novo = param === 'novo';
    S.ed = { id: novo ? 0 : +param, aberto: new Set(), dirty: false, aba: 'fluxo', sim: { entradas: [], msgs: [], bots: 0, estado: 'ativo' }, D: null, novo };
    el.innerHTML = `<div class="cb"><div class="cb-ed-topo"><button class="btn-soft" data-ac="voltar"><i class="fa-solid fa-arrow-left"></i> Fluxos</button></div>${ZZ.skeleton(4, 'skel-linha cb-skel')}</div>`;
    el.querySelector('[data-ac=voltar]').onclick = () => ZZ.ir('chatbot');
    carregarFilas();
    if (novo) { S.ed.D = { id: 0, nome: '', gatilho: { tipo: 'primeira_mensagem', termos: [], horario: null }, ativo: false, modo: 'teste', cfg: { ...CFG_PADRAO }, nos: [completo({ id: 'n1', tipo: 'menu', texto: 'Olá! Como posso ajudar?\nEscolha uma opção:', opcoes: [{ texto: '', proximo: '' }] })] }; S.ed.dirty = true; return pintarEditor(); }
    const j = await ZZ.api('ver_fluxo', { params: { id: S.ed.id }, silencioso: true });
    if (!S || !S.ed) return;
    if (!j.ok || !j.fluxo) { el.innerHTML = `<div class="cb"><div class="cb-ed-topo"><button class="btn-soft" data-ac="voltar"><i class="fa-solid fa-arrow-left"></i> Fluxos</button></div>${erroCard(j.msg || 'Não foi possível abrir o fluxo.', 'tentar')}</div>`; el.querySelector('[data-ac=voltar]').onclick = () => ZZ.ir('chatbot'); el.querySelector('[data-ac=tentar]').onclick = () => entrarEditor(param); return; }
    S.ed.D = normFluxo(j.fluxo, j.nos); pintarEditor();
    if (S.ed.D.nos.length) iniciarSim();
  }
  async function carregarFilas() {
    if (S.filas.length) return; const j = await ZZ.api('listar_filas', { silencioso: true });
    if (j && j.ok && S) S.filas = lista(j.filas || j.itens).filter(f => f && f.id && f.nome).map(f => ({ id: String(f.id), nome: f.nome }));
  }

  function pintarEditor() {
    const E = S.ed, D = E.D, el = S.raiz, edit = ZZ.pode('chatbot.editar');
    el.innerHTML = `<div class="cb"><fieldset class="cb-fs" ${edit ? '' : 'disabled'}>
      <div class="cb-ed-topo"><button type="button" class="btn-soft" data-ac="voltar"><i class="fa-solid fa-arrow-left"></i> Fluxos</button>
        <span class="cb-sujo" id="cbSujo" hidden><i class="fa-solid fa-circle"></i> não salvo</span></div>
      <div class="card-soft cb-cab">
        <label for="cbNome">Nome do fluxo</label><input type="text" id="cbNome" maxlength="80" placeholder="Ex.: Menu de atendimento" value="${esc(D.nome)}">
        <div class="cb-g2"><div><label for="cbGat">Quando começa</label><select id="cbGat">${Object.entries(GATILHOS).map(([k, v]) => `<option value="${k}" ${D.gatilho.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div id="cbPalW" ${D.gatilho.tipo === 'palavra' ? '' : 'hidden'}><label for="cbPal">Palavras (separadas por vírgula)</label><input type="text" id="cbPal" placeholder="oi, menu, orçamento" value="${esc(D.gatilho.termos.join(', '))}"></div></div>
        <details class="cb-det cb-adv"><summary><i class="fa-solid fa-sliders"></i> Ajustes avançados</summary>
          <label class="cb-chk"><input type="checkbox" id="cbFora" ${D.cfg.so_fora_horario ? 'checked' : ''}> Só responder fora do horário comercial</label>
          <div id="cbHor" ${D.cfg.so_fora_horario || D.gatilho.horario ? '' : 'hidden'}><div class="cb-g2"><div><label for="cbIni">Horário comercial: início</label><input type="time" id="cbIni" value="${esc(D.gatilho.horario ? D.gatilho.horario.ini : '08:00')}"></div><div><label for="cbFim">Fim</label><input type="time" id="cbFim" value="${esc(D.gatilho.horario ? D.gatilho.horario.fim : '18:00')}"></div></div>
            <div class="cb-dias">${DIAS.map(([n, r]) => `<label class="cb-dia"><input type="checkbox" data-dia="${n}" ${(D.gatilho.horario ? D.gatilho.horario.dias : [1, 2, 3, 4, 5]).includes(n) ? 'checked' : ''}><span>${r}</span></label>`).join('')}</div></div>
          <label for="cbInv">Mensagem quando o cliente responde algo inválido</label><textarea id="cbInv" rows="2" maxlength="1000">${esc(D.cfg.mensagem_invalida)}</textarea>
          <div class="cb-g2"><div><label for="cbTent">Tentativas inválidas permitidas</label><input type="number" id="cbTent" min="1" max="10" value="${D.cfg.tentativas_max}"></div><div><label for="cbExc">Ao exceder as tentativas</label><select id="cbExc"><option value="transferir" ${D.cfg.ao_exceder === 'transferir' ? 'selected' : ''}>Transferir para atendente</option><option value="encerrar" ${D.cfg.ao_exceder === 'encerrar' ? 'selected' : ''}>Encerrar a conversa</option></select></div></div>
          <label for="cbExp">Expirar a sessão após (minutos sem resposta)</label><input type="number" id="cbExp" min="1" max="1440" value="${D.cfg.expira_minutos}">
        </details>
      </div>
      <div class="cb-abas cb-abas-ed"><button type="button" data-ea="fluxo"><i class="fa-solid fa-list"></i> Fluxo</button><button type="button" data-ea="mapa"><i class="fa-solid fa-sitemap"></i> Mapa</button><button type="button" data-ea="sim"><i class="fa-brands fa-whatsapp"></i> Simulador</button></div>
      <div class="cb-ed" data-aba="${E.aba}">
        <section class="cb-pane cb-pane-fluxo"><div id="cbValid"></div><div id="cbNos"></div>
          <div class="cb-add"><span class="mut">Adicionar</span><div class="cb-add-b">${['mensagem', 'menu', 'pergunta', 'transferir_fila', 'encerrar', 'webhook'].map(t => `<button type="button" class="btn-soft btn-sm" data-add="${t}"><i class="fa-solid fa-plus"></i> ${t === 'transferir_fila' ? 'Transferir' : TIPOS[t].nome}</button>`).join('')}</div></div></section>
        <section class="cb-pane cb-pane-mapa"><div class="card-soft"><div class="ch"><i class="fa-solid fa-sitemap"></i> Visão geral</div><div id="cbMapa"></div></div></section>
        <section class="cb-pane cb-pane-sim"><div class="card-soft cb-simbox"><div class="ch"><i class="fa-brands fa-whatsapp"></i> Simulador <button type="button" class="btn-soft btn-sm cb-reiniciar" data-ac="reiniciar"><i class="fa-solid fa-rotate-left"></i> Reiniciar</button></div>
          <div class="cb-chat" id="cbChat"></div>
          <form class="cb-simf" id="cbSimF"><input type="text" id="cbSimI" placeholder="Digite como o cliente…" autocomplete="off" aria-label="Mensagem do cliente"><button class="btn-azul" aria-label="Enviar"><i class="fa-solid fa-paper-plane"></i></button></form>
          <div id="cbSimAv"></div><small class="mut">Simulação interna: nada é enviado a ninguém.</small></div></section>
      </div>
      <div class="cb-salvar"><span class="mut" id="cbRes"></span>${edit ? '<button type="button" class="btn-azul" id="cbSalvar"><i class="fa-solid fa-floppy-disk"></i> Salvar fluxo</button>' : '<span class="badge-status b-pausa">Somente leitura</span>'}</div></fieldset></div>`;
    ligarEditor(); renderNos(); pintarChat(); marcarAba();
  }
  const marcarSujo = () => { S.ed.dirty = true; const s = ZZ.$('#cbSujo'); if (s) s.hidden = false; avisoSim(); };
  function marcarAba() {
    const a = S.ed.aba, ed = ZZ.$('.cb-ed'); if (ed) ed.dataset.aba = a;
    S.raiz.querySelectorAll('[data-ea]').forEach(b => b.classList.toggle('ativa', b.dataset.ea === a));
  }

  function ligarEditor() {
    const E = S.ed, D = E.D, el = S.raiz;
    el.querySelector('[data-ac=voltar]').onclick = async () => { if (E.dirty && ZZ.pode('chatbot.editar') && !await ZZ.confirmar('Há alterações não salvas. Sair mesmo assim?', 'Sair sem salvar', true)) return; ZZ.ir('chatbot'); };
    el.querySelectorAll('[data-ea]').forEach(b => b.onclick = () => { E.aba = b.dataset.ea; marcarAba(); if (E.aba === 'mapa') pintarMapa(); if (E.aba === 'sim') setTimeout(() => ZZ.$('#cbSimI') && ZZ.$('#cbSimI').focus({ preventScroll: true }), 50); });
    const nome = ZZ.$('#cbNome'); nome.oninput = () => { D.nome = nome.value; nome.classList.remove('erro-campo'); marcarSujo(); };
    const gat = ZZ.$('#cbGat'), pal = ZZ.$('#cbPal');
    gat.onchange = () => { D.gatilho.tipo = gat.value; ZZ.$('#cbPalW').hidden = gat.value !== 'palavra'; marcarSujo(); };
    pal.oninput = () => { D.gatilho.termos = pal.value.split(',').map(s => s.trim()).filter(Boolean); pal.classList.remove('erro-campo'); marcarSujo(); };
    const lerAv = () => {
      D.cfg.so_fora_horario = ZZ.$('#cbFora').checked; ZZ.$('#cbHor').hidden = !D.cfg.so_fora_horario && !D.gatilho.horario;
      const dias = ZZ.$$('[data-dia]').filter(x => x.checked).map(x => +x.dataset.dia);
      D.gatilho.horario = D.cfg.so_fora_horario ? { ini: ZZ.$('#cbIni').value || '08:00', fim: ZZ.$('#cbFim').value || '18:00', dias } : (D.gatilho.horario ? { ini: ZZ.$('#cbIni').value || '08:00', fim: ZZ.$('#cbFim').value || '18:00', dias } : null);
      D.cfg.mensagem_invalida = ZZ.$('#cbInv').value; D.cfg.tentativas_max = +ZZ.$('#cbTent').value || 3; D.cfg.ao_exceder = ZZ.$('#cbExc').value; D.cfg.expira_minutos = +ZZ.$('#cbExp').value || 30; marcarSujo();
    };
    ZZ.$$('.cb-adv input,.cb-adv textarea,.cb-adv select').forEach(x => x.addEventListener('input', lerAv));
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => adicionarNo(b.dataset.add));
    ZZ.$('#cbSimF').onsubmit = e => { e.preventDefault(); const i = ZZ.$('#cbSimI'), t = i.value.trim(); if (!t) return; i.value = ''; simular(t); };
    ZZ.$('[data-ac=reiniciar]').onclick = async () => { E.sim = { entradas: [], msgs: [], bots: 0, estado: 'ativo' }; await iniciarSim(true); ZZ.toast('Conversa reiniciada', 'ok'); const i = ZZ.$('#cbSimI'); i && i.focus({ preventScroll: true }); };
    const sv = ZZ.$('#cbSalvar'); if (sv) sv.onclick = () => salvar(sv);
  }

  /* ---------- nós ---------- */
  function adicionarNo(tipo) {
    const E = S.ed, D = E.D, id = proxId(D);
    const n = { id, tipo, texto: '', opcoes: tipo === 'menu' ? [{ texto: '', proximo: '' }] : [], proximo: '', variavel: tipo === 'pergunta' ? 'resposta' : '', fila: '', url: '' };
    D.nos.push(n); E.aberto.add(id); marcarSujo(); renderNos(); pintarMapa();
    const c = ZZ.$(`[data-nid="${id}"]`); if (c) { c.classList.add('cb-novo'); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { const t = c.querySelector('textarea,input'); t && t.focus({ preventScroll: true }); }, 350); }
    ZZ.vibrar(10);
  }
  const optsDestino = (D, sel, self) => `<option value="">— escolher destino —</option>` + D.nos.filter(n => n.id !== self).map((n, i) => { const k = D.nos.indexOf(n) + 1; return `<option value="${esc(n.id)}" ${sel === n.id ? 'selected' : ''}>${k} · ${esc(TIPOS[n.tipo].nome)} — ${esc(resumo(n).slice(0, 32))}</option>`; }).join('');

  function renderNos() {
    const E = S.ed, D = E.D, box = ZZ.$('#cbNos'); if (!box) return; const V = validar(D), edit = ZZ.pode('chatbot.editar');
    const avisos = [];
    if (V.sem.length) avisos.push(`<div class="cb-av cb-av-v"><i class="fa-solid fa-circle-xmark"></i> ${V.sem.length} etapa${V.sem.length > 1 ? 's' : ''} sem saída: ${V.sem.map(id => `<a href="#" data-goto="${esc(id)}">${D.nos.findIndex(n => n.id === id) + 1}</a>`).join(', ')}</div>`);
    if (V.inalc.length) avisos.push(`<div class="cb-av cb-av-a"><i class="fa-solid fa-triangle-exclamation"></i> ${V.inalc.length} etapa${V.inalc.length > 1 ? 's' : ''} inalcançáve${V.inalc.length > 1 ? 'is' : 'l'}: ${V.inalc.map(id => `<a href="#" data-goto="${esc(id)}">${D.nos.findIndex(n => n.id === id) + 1}</a>`).join(', ')}</div>`);
    if (!avisos.length && D.nos.length) avisos.push('<div class="cb-av cb-av-ok"><i class="fa-solid fa-circle-check"></i> Fluxo completo: todas as etapas têm saída e são alcançáveis.</div>');
    ZZ.$('#cbValid').innerHTML = avisos.join('');
    const res = ZZ.$('#cbRes'); if (res) res.textContent = `${D.nos.length} etapa${D.nos.length === 1 ? '' : 's'}`;
    if (!D.nos.length) { box.innerHTML = '<div class="card-soft vazio"><i class="fa-solid fa-diagram-project"></i>Fluxo vazio. Adicione a primeira etapa abaixo.</div>'; return; }
    box.innerHTML = D.nos.map((n, i) => {
      const T = TIPOS[n.tipo], aberto = E.aberto.has(n.id), sem = V.sem.includes(n.id), inalc = V.inalc.includes(n.id);
      const dest = destinos(n).filter(d => V.ids.has(d));
      const conector = i < D.nos.length - 1 || dest.length ? `<div class="cb-con"><i class="fa-solid fa-arrow-down"></i><span>${n.tipo === 'menu' ? (dest.length ? 'segue para ' + [...new Set(dest)].map(d => '<b>' + (D.nos.findIndex(x => x.id === d) + 1) + '</b>').join(', ') : 'sem destinos') : TERMINAIS.includes(n.tipo) ? 'fim do caminho' : (dest.length ? 'segue para <b>' + (D.nos.findIndex(x => x.id === dest[0]) + 1) + '</b>' : 'sem próxima etapa')}</span></div>` : '';
      return `<div class="cb-no-w"><div class="card-soft cb-no cb-t-${T.cor} ${aberto ? 'cb-aberto' : ''} ${sem ? 'cb-sem' : ''} ${inalc ? 'cb-inalc' : ''}" data-nid="${esc(n.id)}">
        <button type="button" class="cb-no-h" data-ac="abre" aria-expanded="${aberto}"><span class="cb-no-n">${i + 1}</span><span class="cb-no-ic"><i class="fa-solid ${T.ic}"></i></span>
          <span class="cb-no-t"><b>${T.nome}${i === 0 ? ' <em class="cb-ini">início</em>' : ''}</b><small data-resumo>${esc(resumo(n))}</small></span>
          ${sem ? '<span class="cb-flag cb-f-v" title="Sem saída"><i class="fa-solid fa-circle-xmark"></i></span>' : ''}${inalc ? '<span class="cb-flag cb-f-a" title="Inalcançável"><i class="fa-solid fa-triangle-exclamation"></i></span>' : ''}<i class="fa-solid fa-chevron-down cb-chev"></i></button>
        <div class="cb-no-c" ${aberto ? '' : 'hidden'}>${corpoNo(D, n, i, edit)}</div></div>${conector}</div>`;
    }).join('');
    ligarNos(box);
  }
  function corpoNo(D, n, i, edit) {
    let h = '';
    const lblTexto = { menu: 'Texto do menu', pergunta: 'Pergunta ao cliente', transferir_fila: 'Mensagem antes de transferir', encerrar: 'Mensagem de despedida', mensagem: 'Texto da mensagem', webhook: 'Mensagem (opcional)' }[n.tipo];
    if (n.tipo !== 'webhook') h += `<label>${lblTexto}</label><textarea data-f="texto" maxlength="4000" rows="3" placeholder="${n.tipo === 'pergunta' ? 'Ex.: Qual é o seu nome?' : 'Escreva aqui…'}">${esc(n.texto)}</textarea>`;
    if (n.tipo === 'menu') {
      h += '<label>Opções (o cliente responde com o número)</label><div class="cb-ops">' + n.opcoes.map((o, k) => `<div class="cb-op" data-k="${k}"><span class="cb-op-n">${k + 1}</span><input type="text" data-of="texto" maxlength="80" placeholder="Nome da opção" value="${esc(o.texto)}"><span class="cb-seta"><i class="fa-solid fa-arrow-right"></i></span><select data-of="proximo" aria-label="Destino da opção ${k + 1}">${optsDestino(D, o.proximo, n.id)}</select><button type="button" class="btn-perigo btn-sm" data-ac="rm-op" aria-label="Remover opção"><i class="fa-solid fa-xmark"></i></button></div>`).join('') + '</div>';
      h += n.opcoes.length < 12 ? '<button type="button" class="btn-soft btn-sm" data-ac="add-op"><i class="fa-solid fa-plus"></i> Opção</button>' : '<small class="mut">Máximo de 12 opções.</small>';
    }
    if (n.tipo === 'pergunta') h += '<label>Guardar a resposta na variável (opcional)</label><input type="text" data-f="variavel" maxlength="30" placeholder="nome" value="' + esc(n.variavel) + '"><small class="mut">Use {{' + esc(n.variavel || 'nome') + '}} nos textos seguintes. Só letras minúsculas, números e _.</small>';
    if (n.tipo === 'transferir_fila') h += S.filas.length ? `<label>Fila de atendimento</label><select data-f="fila"><option value="">— qualquer fila —</option>${S.filas.map(f => `<option value="${esc(f.id)}" ${n.fila === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select>` : '<small class="mut"><i class="fa-solid fa-circle-info"></i> Crie filas no módulo Filas para escolher o destino da transferência.</small>';
    if (n.tipo === 'webhook') h += `<label>Endereço (URL) chamado nesta etapa</label><input type="text" data-f="url" maxlength="500" placeholder="https://…" value="${esc(n.url)}"><label>Guardar a resposta na variável</label><input type="text" data-f="variavel" maxlength="30" placeholder="resposta_webhook" value="${esc(n.variavel)}"><label class="cb-chk"><input type="checkbox" data-f="enviar_resposta" ${n.enviar_resposta ? 'checked' : ''}> Enviar a resposta do webhook ao cliente</label>`;
    if (!TERMINAIS.includes(n.tipo) && n.tipo !== 'menu') h += `<label>Depois disso, ir para</label><select data-f="proximo">${optsDestino(D, n.proximo, n.id)}</select>`;
    h += `<div class="cb-no-acoes"><button type="button" class="btn-soft btn-sm" data-ac="sobe" ${i === 0 ? 'disabled' : ''} aria-label="Mover para cima"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="btn-soft btn-sm" data-ac="desce" ${i === D.nos.length - 1 ? 'disabled' : ''} aria-label="Mover para baixo"><i class="fa-solid fa-arrow-down"></i></button><span class="cb-esp"></span><button type="button" class="btn-perigo btn-sm" data-ac="rm"><i class="fa-solid fa-trash"></i> Excluir etapa</button></div>`;
    return h;
  }
  function ligarNos(box) {
    const E = S.ed, D = E.D;
    box.querySelectorAll('.cb-no').forEach(card => {
      const id = card.dataset.nid, n = D.nos.find(x => x.id === id); if (!n) return;
      card.addEventListener('click', async e => {
        const b = e.target.closest('[data-ac]'); if (!b) return; const ac = b.dataset.ac;
        if (ac === 'abre') { const ab = !E.aberto.has(id); ab ? E.aberto.add(id) : E.aberto.delete(id); card.classList.toggle('cb-aberto', ab); card.querySelector('.cb-no-c').hidden = !ab; b.setAttribute('aria-expanded', ab); return; }
        if (ac === 'add-op') { n.opcoes.push({ texto: '', proximo: '' }); marcarSujo(); renderNos(); pintarMapa(); const ins = ZZ.$$(`[data-nid="${id}"] .cb-op input`); ins.length && ins[ins.length - 1].focus(); }
        if (ac === 'rm-op') { n.opcoes.splice(+b.closest('.cb-op').dataset.k, 1); marcarSujo(); renderNos(); pintarMapa(); }
        if (ac === 'sobe' || ac === 'desce') { const i = D.nos.indexOf(n), j = ac === 'sobe' ? i - 1 : i + 1; if (j < 0 || j >= D.nos.length) return; [D.nos[i], D.nos[j]] = [D.nos[j], D.nos[i]]; marcarSujo(); renderNos(); pintarMapa(); const c = ZZ.$(`[data-nid="${id}"]`); c && (c.classList.add('cb-novo'), c.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }
        if (ac === 'rm') {
          const refs = D.nos.filter(x => x.id !== id && destinos(x).includes(id)).length;
          if (!await ZZ.confirmar(`Excluir esta etapa?${refs ? ' ' + refs + ' etapa(s) apontam para ela e ficarão sem destino.' : ''}`, 'Excluir', true)) return;
          D.nos = D.nos.filter(x => x.id !== id); D.nos.forEach(x => { if (x.proximo === id) x.proximo = ''; x.opcoes.forEach(o => { if (o.proximo === id) o.proximo = ''; }); });
          E.aberto.delete(id); marcarSujo(); renderNos(); pintarMapa(); ZZ.toast('Etapa excluída', 'ok');
        }
      });
      card.addEventListener('input', e => {
        const t = e.target; if (t.dataset.f && t.tagName !== 'SELECT' && t.type !== 'checkbox') { n[t.dataset.f] = t.value; t.classList.remove('erro-campo'); const r = card.querySelector('[data-resumo]'); if (r && (t.dataset.f === 'texto' || t.dataset.f === 'url')) r.textContent = resumo(n); marcarSujo(); }
        if (t.dataset.of === 'texto') { n.opcoes[+t.closest('.cb-op').dataset.k].texto = t.value; marcarSujo(); }
      });
      card.addEventListener('change', e => {
        const t = e.target; if (t.type === 'checkbox' && t.dataset.f) { n[t.dataset.f] = t.checked; marcarSujo(); return; } if (t.tagName !== 'SELECT') return;
        if (t.dataset.of) n.opcoes[+t.closest('.cb-op').dataset.k][t.dataset.of] = t.value; else n[t.dataset.f] = t.value;
        marcarSujo(); renderNos(); pintarMapa();
      });
    });
    ZZ.$$('#cbValid [data-goto]').forEach(a => a.onclick = e => { e.preventDefault(); const id = a.dataset.goto; E.aberto.add(id); renderNos(); const c = ZZ.$(`[data-nid="${id}"]`); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('cb-novo'); } });
  }

  /* ---------- mapa (árvore indentada) ---------- */
  function pintarMapa() {
    const m = ZZ.$('#cbMapa'); if (!m || !S.ed) return; const D = S.ed.D;
    if (!D.nos.length) { m.innerHTML = '<div class="vazio"><i class="fa-solid fa-sitemap"></i>Sem etapas.</div>'; return; }
    const mapa = Object.fromEntries(D.nos.map(n => [n.id, n])), vis = new Set(), V = validar(D);
    const item = (n, nivel, rotulo, repetido) => {
      const k = D.nos.indexOf(n) + 1, T = TIPOS[n.tipo];
      return `<li style="--nv:${nivel}"><button type="button" class="cb-mp-i cb-t-${T.cor} ${V.sem.includes(n.id) ? 'cb-sem' : ''} ${repetido ? 'cb-rep' : ''}" data-goto="${esc(n.id)}">${rotulo ? `<span class="cb-mp-r">${esc(rotulo)}</span>` : ''}<span class="cb-no-n">${k}</span><i class="fa-solid ${repetido ? 'fa-rotate-left' : T.ic}"></i><span class="cb-mp-t">${esc(resumo(n))}</span>${V.sem.includes(n.id) ? '<i class="fa-solid fa-circle-xmark cb-f-v"></i>' : ''}</button></li>`;
    };
    let h = '';
    const desce = (n, nivel, rotulo) => {
      if (vis.has(n.id)) { h += item(n, nivel, rotulo, true); return; }
      vis.add(n.id); h += item(n, nivel, rotulo, false);
      if (n.tipo === 'menu') n.opcoes.forEach((o, k) => { if (o.proximo && mapa[o.proximo]) desce(mapa[o.proximo], nivel + 1, `${k + 1} – ${o.texto || 'opção'}`); else h += `<li style="--nv:${nivel + 1}"><span class="cb-mp-vz"><i class="fa-solid fa-circle-xmark"></i> ${k + 1} – ${esc(o.texto || 'opção')} → sem destino</span></li>`; });
      else if (!TERMINAIS.includes(n.tipo)) { if (n.proximo && mapa[n.proximo]) desce(mapa[n.proximo], nivel + 1, ''); else h += `<li style="--nv:${nivel + 1}"><span class="cb-mp-vz"><i class="fa-solid fa-circle-xmark"></i> sem próxima etapa</span></li>`; }
    };
    desce(D.nos[0], 0, '');
    const solto = D.nos.filter(n => !vis.has(n.id));
    if (solto.length) { h += '<li class="cb-mp-tit"><i class="fa-solid fa-triangle-exclamation"></i> Inalcançáveis</li>'; solto.forEach(n => { desce(n, 0, ''); }); }
    m.innerHTML = '<ul class="cb-arvore">' + h + '</ul>';
    m.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { S.ed.aba = 'fluxo'; marcarAba(); S.ed.aberto.add(b.dataset.goto); renderNos(); const c = ZZ.$(`[data-nid="${b.dataset.goto}"]`); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('cb-novo'); } });
  }

  /* ---------- salvar ---------- */
  function paraServidor(D) {
    const g = { tipo: D.gatilho.tipo, termos: D.gatilho.tipo === 'palavra' ? D.gatilho.termos : [] };
    if (D.gatilho.horario && (D.cfg.so_fora_horario || D.gatilho.horario)) g.horario = { dias: D.gatilho.horario.dias, ini: D.gatilho.horario.ini, fim: D.gatilho.horario.fim };
    return { id: D.id || undefined, nome: D.nome.trim(), gatilho: g, so_fora_horario: !!D.cfg.so_fora_horario, mensagem_invalida: D.cfg.mensagem_invalida, tentativas_max: D.cfg.tentativas_max, ao_exceder: D.cfg.ao_exceder, expira_minutos: D.cfg.expira_minutos,
      no_inicial: D.nos[0] ? D.nos[0].id : '',
      nos: D.nos.map(n => {
        const c = { texto: n.texto };
        if (n.tipo === 'menu') c.opcoes = n.opcoes.map(o => ({ rotulo: o.texto, proximo_no_id: o.proximo || null }));
        else if (n.tipo === 'transferir_fila') c.fila_id = n.fila ? +n.fila : null;
        else if (n.tipo === 'webhook') { delete c.texto; c.url = n.url; c.variavel = n.variavel || 'resposta_webhook'; c.enviar_resposta = !!n.enviar_resposta; c.proximo_no_id = n.proximo || null; }
        else if (n.tipo !== 'encerrar') { c.proximo_no_id = n.proximo || null; if (n.tipo === 'pergunta') c.variavel = n.variavel; }
        return { id: n.id, tipo: n.tipo, conteudo: c, pos_x: n.pos_x, pos_y: n.pos_y };
      }) };
  }
  const VAR_OK = v => v === '' || /^[a-z_][a-z0-9_]{0,29}$/.test(v);
  /** Lista de problemas que impedem salvar: [{no?, sel?, campo, idx?}] */
  function problemas(D) {
    const p = [];
    if (!D.nome.trim()) p.push({ sel: '#cbNome' });
    if (D.gatilho.tipo === 'palavra' && !D.gatilho.termos.length) p.push({ sel: '#cbPal' });
    D.nos.forEach(n => {
      if (['mensagem', 'menu', 'pergunta'].includes(n.tipo) && !n.texto.trim()) p.push({ no: n.id, campo: 'texto' });
      if (n.tipo === 'menu') { if (!n.opcoes.length) p.push({ no: n.id, campo: 'texto' }); n.opcoes.forEach((o, k) => { if (!o.texto.trim()) p.push({ no: n.id, campo: 'op', idx: k }); }); }
      if ((n.tipo === 'pergunta' || n.tipo === 'webhook') && !VAR_OK(n.variavel)) p.push({ no: n.id, campo: 'variavel' });
      if (n.tipo === 'webhook' && !/^https?:\/\//i.test(n.url)) p.push({ no: n.id, campo: 'url' });
    });
    return p;
  }
  function checar() {
    const D = S.ed.D, P = problemas(D);
    if (!D.nos.length) { ZZ.toast('Adicione pelo menos uma etapa', 'err'); return false; }
    if (!P.length) return true;
    P.forEach(x => { if (x.no) S.ed.aberto.add(x.no); }); renderNos();
    P.forEach(x => {
      let e = null;
      if (x.sel) e = ZZ.$(x.sel); else { const c = ZZ.$(`[data-nid="${x.no}"]`); if (c) e = x.campo === 'op' ? c.querySelectorAll('.cb-op input')[x.idx] : c.querySelector(`[data-f=${x.campo}]`); }
      if (e) e.classList.add('erro-campo');
    });
    const p = ZZ.$('.erro-campo'); if (p) { p.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => p.focus({ preventScroll: true }), 300); }
    ZZ.toast('Preencha os campos marcados em vermelho', 'err'); return false;
  }
  async function salvar(btn) {
    const E = S.ed, D = E.D; if (!checar()) { btn.classList.add('erro-flash'); setTimeout(() => btn.classList.remove('erro-flash'), 600); return; }
    const V0 = validar(D); if (V0.inalc.length) { ZZ.toast('Há etapas inalcançáveis (em âmbar). Ligue-as ao fluxo ou exclua-as antes de salvar.', 'err'); btn.classList.add('erro-flash'); setTimeout(() => btn.classList.remove('erro-flash'), 600); return; }
    const r = await ZZ.busy(btn, () => ZZ.api('salvar_fluxo', { corpo: paraServidor(D) }));
    if (r && r.ok) {
      const eraNovo = !D.id, mapa = r.mapa_ids || {}, aberto = new Set([...E.aberto].map(x => mapa[x] !== undefined ? String(mapa[x]) : x));
      const nd = normFluxo(r.fluxo, r.nos); nd.ativo = r.fluxo.ativo; D.id = nd.id; D.nos = nd.nos; E.id = nd.id; E.aberto = aberto; E.dirty = false;
      const s = ZZ.$('#cbSujo'); if (s) s.hidden = true; renderNos(); pintarMapa(); avisoSim();
      const V = validar(D), av = V.sem.length;
      ZZ.toast(av ? `Fluxo salvo — ${av} etapa${av > 1 ? 's' : ''} sem saída (a conversa termina ali).` : 'Fluxo salvo', 'ok'); S.sig.fluxos = '';
      if (eraNovo && D.id) { try { history.replaceState(null, '', '#/chatbot?fluxo=' + D.id); } catch (e) { } }
      E.sim = { entradas: [], msgs: [], bots: 0, estado: 'ativo' }; iniciarSim();
    }
  }

  /* ---------- simulador (usa o fluxo SALVO; o servidor reexecuta a conversa inteira a cada chamada) ---------- */
  function avisoSim() {
    const a = ZZ.$('#cbSimAv'); if (!a || !S.ed) return; const E = S.ed, edit = ZZ.pode('chatbot.editar');
    const precisa = E.dirty || !E.D.id;
    const f = ZZ.$('#cbSimF'); if (f) f.classList.toggle('cb-off', precisa || E.sim.estado !== 'ativo');
    if (precisa) a.innerHTML = `<div class="cb-av cb-av-a"><i class="fa-solid fa-floppy-disk"></i> O simulador usa o fluxo salvo. ${edit ? 'Salve para testar as alterações.' : ''} ${edit ? '<button type="button" class="btn-azul btn-sm" data-ac="salvar-sim">Salvar e simular</button>' : ''}</div>`;
    else if (E.sim.estado !== 'ativo') a.innerHTML = `<div class="cb-av cb-av-ok"><i class="fa-solid fa-flag-checkered"></i> ${E.sim.estado === 'transferido' ? 'Conversa transferida para atendimento.' : 'Conversa encerrada.'} Toque em Reiniciar para testar de novo.</div>`;
    else a.innerHTML = '';
    const b = a.querySelector('[data-ac=salvar-sim]'); if (b) b.onclick = () => salvar(ZZ.$('#cbSalvar'));
  }
  const mapaDe = { bot: 'bot', contato: 'cli', sistema: 'sis' };
  function pintarChat() {
    const c = ZZ.$('#cbChat'); if (!c) return; const E = S.ed, M = E.sim.msgs; avisoSim();
    if (!M.length) { c.innerHTML = E.sim.carregando ? '<div class="cb-chat-vz"><i class="fa-solid fa-spinner fa-spin"></i>Iniciando a conversa…</div>' : '<div class="cb-chat-vz"><i class="fa-solid fa-comment-dots"></i>' + (E.D.id && !E.dirty ? 'Sem mensagens ainda.' : 'Salve o fluxo para conversar com o robô aqui.') + '</div>'; return; }
    c.innerHTML = M.map(m => m.de === 'sis' ? `<div class="cb-sis">${esc(m.texto)}</div>` : `<div class="cb-bal ${m.de === 'cli' ? 'cb-cli' : 'cb-bot'} ${m.digitando ? 'cb-dig' : ''}">${m.digitando ? '<i></i><i></i><i></i>' : esc(m.texto).replace(/\n/g, '<br>')}${m.digitando ? '' : '<small>' + (m.hora || '') + '</small>'}</div>`).join('');
    c.scrollTop = c.scrollHeight;
  }
  /** Pede a conversa ao servidor e mostra as mensagens novas com efeito de digitação. */
  async function rodarSim(entradas, antes) {
    const E = S.ed, sim = E.sim, D = E.D; if (!D.id || sim.ocupado) return false;
    sim.ocupado = true; const hora = () => ZZ.fmtHora(Math.floor(Date.now() / 1000));
    const dig = { de: 'bot', digitando: true }; sim.msgs.push(dig); pintarChat();
    const r = await ZZ.api('testar_fluxo', { corpo: { id: D.id, entradas }, silencioso: true });
    if (!S || S.ed !== E) return false;
    sim.msgs.splice(sim.msgs.indexOf(dig), 1);
    if (!r.ok) { sim.ocupado = false; sim.msgs.push({ de: 'sis', texto: r.msg || 'Não foi possível simular.' }); pintarChat(); ZZ.toast(r.msg || 'Erro no simulador', 'err'); return false; }
    const conv = lista(r.conversa); sim.estado = r.estado || 'ativo';
    const novos = conv.slice(antes);
    for (const m of novos) {
      const de = mapaDe[m.de] || 'sis'; if (de === 'cli') continue;
      if (de === 'bot') { const d = { de: 'bot', digitando: true }; sim.msgs.push(d); pintarChat(); await new Promise(res => setTimeout(res, 380)); if (!S || S.ed !== E) return false; sim.msgs.splice(sim.msgs.indexOf(d), 1); }
      sim.msgs.push({ de, texto: m.texto, hora: hora() }); pintarChat();
    }
    sim.total = conv.length; sim.ocupado = false; pintarChat();
    if (!novos.some(m => m.de !== 'contato') && entradas.length) { sim.msgs.push({ de: 'sis', texto: 'O robô não respondeu.' }); pintarChat(); }
    return true;
  }
  async function iniciarSim(forcar) {
    const E = S && S.ed; if (!E || !E.D.id || E.dirty) { pintarChat(); return; }
    if (!forcar && E.sim.msgs.length) return; E.sim.carregando = true; E.sim.total = 0; E.sim.ocupado = false; pintarChat();
    await rodarSim([], 0); if (S && S.ed === E) { E.sim.carregando = false; pintarChat(); }
  }
  async function simular(texto) {
    const E = S.ed, sim = E.sim; if (sim.ocupado) return;
    if (E.dirty || !E.D.id) { avisoSim(); return ZZ.toast('Salve o fluxo para simular as alterações', 'err'); }
    if (sim.estado !== 'ativo') return ZZ.toast('A conversa terminou. Toque em Reiniciar.', 'err');
    if (!sim.msgs.length) await iniciarSim();
    const hora = ZZ.fmtHora(Math.floor(Date.now() / 1000));
    const antes = sim.total || 0; sim.entradas.push(texto); sim.msgs.push({ de: 'cli', texto, hora });
    const ok = await rodarSim(sim.entradas, antes + 1); if (!ok) sim.entradas.pop();
  }

  /* ======================================================================
     página
     ====================================================================== */
  ZZ.pagina({
    id: 'chatbot', titulo: 'Chatbot', icone: 'fa-robot', ordem: 4.6, perm: 'chatbot.ver',
    render(el, ctx) {
      S = novoS(); S.raiz = el;
      if (ctx.params && ctx.params.fluxo) entrarEditor(ctx.params.fluxo); else renderLista();
    },
    destroy() { S = null; }
  });
})();
