/* Automações — front. Fala o formato do back-end (api/automacoes.php): gatilho.tipo = mensagem_recebida|primeira_mensagem_do_contato|primeira_mensagem_do_dia|
   qualquer_mensagem|agendado|conexao_desconectada; modo 'teste'|'ao_vivo'; dias 0=dom..6=sáb. Internamente o editor usa um modelo "plano" (norm) e
   converte com paraServidor() ao salvar. Automação nova nasce desligada em TESTE; ligar/modo vão por ativar_automacao depois de salvar. */
ZZ.pagina({ id: 'automacoes', titulo: 'Automações', icone: 'fa-wand-magic-sparkles', ordem: 4.5, perm: 'automacoes.ver', render(el) {
  const esc = ZZ.esc, editar = ZZ.pode('automacoes.editar');
  const S = { itens: null, erro: false, aba: 'lista', wh: null, logs: null, filtro: '', ed: null, tick: 0, vistos: new Set(), sig: '' };
  let morto = false;

  /* ---------- catálogos ---------- */
  const GAT = [
    { id: 'mensagem_recebida', ic: 'fa-comment-dots', t: 'Mensagem recebida', d: 'Quando o contato escrever certas palavras' },
    { id: 'primeira_mensagem_do_contato', ic: 'fa-hand', t: 'Primeira mensagem do contato', d: 'Só na primeira vez que a pessoa fala com você' },
    { id: 'primeira_mensagem_do_dia', ic: 'fa-sun', t: 'Primeira mensagem do dia', d: 'Na primeira mensagem de cada pessoa em cada dia' },
    { id: 'qualquer_mensagem', ic: 'fa-asterisk', t: 'Qualquer mensagem', d: 'Toda mensagem recebida' },
    { id: 'agendado', ic: 'fa-clock', t: 'Agendado', d: 'Em dias e horários marcados' },
    { id: 'conexao_desconectada', ic: 'fa-plug-circle-xmark', t: 'Conexão desconectada', d: 'Quando o WhatsApp cair' }];
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
  const TIPOS_MSG = [['texto', 'Texto'], ['imagem', 'Imagem'], ['audio', 'Áudio'], ['video', 'Vídeo'], ['documento', 'Documento'], ['figurinha', 'Figurinha'], ['contato', 'Contato'], ['localizacao', 'Localização'], ['enquete', 'Enquete']];
  const ACOES = {
    responder_texto: { ic: 'fa-reply', t: 'Responder com texto', novo: () => ({ tipo: 'responder_texto', texto: '', atraso_s: 2 }) },
    responder_midia: { ic: 'fa-image', t: 'Responder com mídia', novo: () => ({ tipo: 'responder_midia', midia_tipo: 'image', url: '', legenda: '' }) },
    esperar: { ic: 'fa-hourglass-half', t: 'Esperar', novo: () => ({ tipo: 'esperar', segundos: 3 }) },
    marcar_lida: { ic: 'fa-check-double', t: 'Marcar como lida', novo: () => ({ tipo: 'marcar_lida' }) },
    chamar_webhook: { ic: 'fa-link', t: 'Chamar um webhook', novo: () => ({ tipo: 'chamar_webhook', url: '', incluir_texto: false }) },
    atribuir_fila: { ic: 'fa-headset', t: 'Enviar para uma fila', novo: () => ({ tipo: 'atribuir_fila', fila: '' }) },
    etiquetar: { ic: 'fa-tag', t: 'Colocar etiqueta', novo: () => ({ tipo: 'etiquetar', etiqueta: '' }) },
    parar: { ic: 'fa-hand', t: 'Parar aqui', novo: () => ({ tipo: 'parar' }) }
  };
  const VARS = ['{nome}', '{numero}', '{data}', '{hora}', '{saudacao}'];
  const MODELOS = [
    { id: 'ausencia', ic: 'fa-moon', t: 'Resposta de ausência', d: 'Avisa quem escreve fora do horário de funcionamento', a: {
      nome: 'Resposta de ausência', gatilho: { tipo: 'qualquer_mensagem' },
      condicoes: { tipo_chat: 'individual', horario: { modo: 'fora', inicio: '08:00', fim: '18:00', dias: [1, 2, 3, 4, 5] } },
      acoes: [{ tipo: 'responder_texto', texto: '{saudacao}, {nome}! No momento estamos fora do horário de atendimento (seg a sex, 08:00 às 18:00). Recebemos sua mensagem e responderemos assim que voltarmos.', atraso_s: 2 }] } },
    { id: 'boasvindas', ic: 'fa-hand-sparkles', t: 'Boas-vindas', d: 'Recebe quem fala com você pela primeira vez', a: {
      nome: 'Boas-vindas', gatilho: { tipo: 'primeira_mensagem_do_contato' }, condicoes: { tipo_chat: 'individual' },
      acoes: [{ tipo: 'responder_texto', texto: '{saudacao}, {nome}! Seja bem-vindo(a). Em que podemos ajudar?', atraso_s: 2 }] } },
    { id: 'preco', ic: 'fa-tags', t: 'Preço', d: 'Responde quando perguntarem valores', a: {
      nome: 'Pergunta de preço', gatilho: { tipo: 'mensagem_recebida', termos: ['preço', 'valor', 'quanto custa'], modo: 'contem' }, condicoes: { tipo_chat: 'individual' },
      acoes: [{ tipo: 'responder_texto', texto: '{saudacao}, {nome}! Nossos valores começam em R$ 0,00. Me diga o que você procura que envio o orçamento certinho.', atraso_s: 3 }] } }
  ];

  const vazio = () => ({ id: 0, nome: '', ativa: false, modo: 'teste', limite_hora_contato: 3, _orig: { ativa: false, modo: 'teste' },
    gatilho: { tipo: 'mensagem_recebida', modo: 'contem', termos: [], combinar: 'qualquer', frequencia: 'diario', hora: '09:00', dias: [1, 2, 3, 4, 5], minutos: 60, jids: [] },
    condicoes: { tipo_chat: 'individual', horario: { modo: 'qualquer', inicio: '08:00', fim: '18:00', dias: [1, 2, 3, 4, 5] }, incluir: [], excluir: [], tipos_mensagem: [], novo: 'qualquer' },
    acoes: [] });
  /** Aceita o JSON do servidor (ou um modelo parcial) e devolve o modelo do editor. */
  const norm = (a = {}) => {
    const v = vazio(), g = a.gatilho || {}, c = a.condicoes || {};
    const hr = c.horario && c.horario.modo ? c.horario : null;
    return { ...v, id: a.id || 0, nome: a.nome || '', ativa: !!a.ativa, modo: a.modo === 'ao_vivo' ? 'ao_vivo' : 'teste', limite_hora_contato: a.limite_hora_contato || 3,
      execucoes: a.executada_vezes || 0, ultima_execucao: a.ultima_execucao || null, h24: a.ultimas_24h || {}, _orig: { ativa: !!a.ativa, modo: a.modo === 'ao_vivo' ? 'ao_vivo' : 'teste' },
      gatilho: { ...v.gatilho, ...g, termos: g.termos || [], jids: g.jids || [] },
      condicoes: { ...v.condicoes, tipo_chat: c.tipo_chat || 'individual', horario: hr ? { ...v.condicoes.horario, ...hr } : v.condicoes.horario, incluir: c.incluir || [], excluir: c.excluir || [], tipos_mensagem: c.tipos_mensagem || [],
        novo: c.contato_novo === true ? 'novo' : c.contato_novo === false ? 'existente' : 'qualquer' },
      acoes: Array.isArray(a.acoes) ? clone(a.acoes) : [] };
  };
  /** Modelo do editor → corpo de salvar_automacao / rascunho do simulador. */
  const paraServidor = a => {
    const g = a.gatilho, c = a.condicoes, G = { tipo: g.tipo }, C = { tipo_chat: c.tipo_chat };
    if (g.tipo === 'mensagem_recebida') Object.assign(G, { modo: g.modo, termos: g.termos, combinar: g.combinar });
    if (g.tipo === 'agendado') { G.frequencia = g.frequencia; if (g.frequencia === 'intervalo') G.minutos = +g.minutos; else G.hora = g.hora; if (g.frequencia === 'semanal') G.dias = g.dias; G.jids = lista2(g.jids); }
    if (g.tipo === 'conexao_desconectada') G.jids = lista2(g.jids);
    if (c.horario.modo !== 'qualquer') C.horario = { modo: c.horario.modo, inicio: c.horario.inicio, fim: c.horario.fim, dias: c.horario.dias };
    if (lista2(c.incluir).length) C.incluir = lista2(c.incluir); if (lista2(c.excluir).length) C.excluir = lista2(c.excluir);
    if (c.tipos_mensagem.length) C.tipos_mensagem = c.tipos_mensagem;
    if (c.novo !== 'qualquer') C.contato_novo = c.novo === 'novo';
    return { id: a.id || 0, nome: a.nome.trim(), gatilho: G, condicoes: C, acoes: a.acoes, limite_hora_contato: +a.limite_hora_contato || 3 };
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const lista = j => j.itens || j.automacoes || [];

  /* ---------- textos legíveis ---------- */
  const lista2 = a => (Array.isArray(a) ? a : String(a || '').split(/[\s,;]+/)).map(s => String(s).trim()).filter(Boolean);
  const diasTxt = d => { d = (d || []).slice().sort(); if (d.length === 7) return 'todos os dias'; if (d.join() === '1,2,3,4,5') return 'de seg a sex'; return d.map(x => DIAS[x]).join(', '); };
  const MODO_TXT = { contem: 'contém', igual: 'é igual a', comeca: 'começa com', regex: 'casa com' };
  function quando(a) {
    const g = a.gatilho;
    switch (g.tipo) {
      case 'mensagem_recebida': return `a mensagem ${MODO_TXT[g.modo] || 'contém'} ${(g.termos || []).map(p => '«' + p + '»').join(g.combinar === 'todos' ? ' e ' : ' ou ') || 'uma palavra-chave'}`;
      case 'primeira_mensagem_do_contato': return 'o contato enviar a primeira mensagem';
      case 'primeira_mensagem_do_dia': return 'o contato enviar a primeira mensagem do dia';
      case 'qualquer_mensagem': return 'receber qualquer mensagem';
      case 'agendado': return g.frequencia === 'intervalo' ? `a cada ${g.minutos || 60} min` : g.frequencia === 'semanal' ? `toda ${diasTxt(g.dias)} às ${g.hora}` : `todo dia às ${g.hora}`;
      case 'conexao_desconectada': return 'a conexão desconectar';
    }
    return '…';
  }
  const semMsg = a => ['agendado', 'conexao_desconectada'].includes(a.gatilho.tipo);
  function condTxt(a) {
    const c = a.condicoes, o = [], h = c.horario;
    if (semMsg(a)) return '';
    if (c.tipo_chat === 'individual') o.push('for conversa privada'); if (c.tipo_chat === 'grupo') o.push('for em grupo');
    if (h.modo !== 'qualquer') o.push(`${h.modo === 'fora' ? 'fora' : 'dentro'} do horário (${h.inicio}–${h.fim}, ${diasTxt(h.dias)})`);
    if (c.novo === 'novo') o.push('o contato for novo'); if (c.novo === 'existente') o.push('o contato já conversou antes');
    if ((c.tipos_mensagem || []).length) o.push('for ' + c.tipos_mensagem.join('/'));
    if (lista2(c.incluir).length) o.push('estiver na lista de incluídos'); if (lista2(c.excluir).length) o.push('não estiver na lista de excluídos');
    return o.join(' e ');
  }
  const acaoTxt = x => ({ responder_texto: () => `responde «${(x.texto || '…').slice(0, 40)}${(x.texto || '').length > 40 ? '…' : ''}»`, responder_midia: () => 'envia uma mídia', esperar: () => `espera ${x.segundos || 0} s`, marcar_lida: () => 'marca como lida', chamar_webhook: () => 'chama um webhook', atribuir_fila: () => `envia para a fila ${x.fila || ''}`, etiquetar: () => `etiqueta «${x.etiqueta || ''}»`, parar: () => 'para' }[x.tipo] || (() => x.tipo))();
  const resumoHtml = a => { const c = condTxt(a); return `<div><b>Quando</b> ${esc(quando(a))}${c ? ' <span class="mut">e ' + esc(c) + '</span>' : ''}</div><div><b>→ Então</b> ${esc(a.acoes.map(acaoTxt).join(', ') || 'nada ainda')}</div>`; };

  /* variáveis de exemplo para pré-visualização */
  const saud = () => { const h = +new Date().toLocaleString('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Maceio' }); return h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite'; };
  const previa = t => String(t || '').replace(/\{nome\}/g, 'Maria').replace(/\{numero\}/g, '+55 (82) 99999-0000').replace(/\{data\}/g, ZZ.fmtData(Date.now() / 1000)).replace(/\{hora\}/g, ZZ.fmtHora(Date.now() / 1000)).replace(/\{saudacao\}/g, saud());

  /* ---------- casca da página ---------- */
  el.innerHTML = `<div class="au-wrap"><div id="auBanner"></div>
    <div class="au-tabs" role="tablist"><button data-aba="lista" class="on"><i class="fa-solid fa-list-check"></i> Automações</button><button data-aba="logs"><i class="fa-solid fa-clock-rotate-left"></i> Registros</button></div>
    <div id="auCorpo"></div></div>`;
  const corpo = () => ZZ.$('#auCorpo', el);
  ZZ.$$('.au-tabs button', el).forEach(b => b.onclick = () => { S.aba = b.dataset.aba; S.sig = ''; ZZ.$$('.au-tabs button', el).forEach(x => x.classList.toggle('on', x === b)); pintar(); if (S.aba === 'logs') carregarLogs(); });

  /* ---------- banner de recebimento ---------- */
  async function carregarWh() {
    const j = await ZZ.api('ver_webhook', { silencioso: true });
    S.wh = j.ok ? !!j.ligado : null; pintarBanner();
  }
  function pintarBanner() {
    const b = ZZ.$('#auBanner', el); if (!b) return;
    if (S.wh === null) { b.innerHTML = `<div class="au-banner au-b-cinza"><div class="skel" style="height:44px;width:100%"></div></div>`; return; }
    const on = S.wh;
    b.innerHTML = `<div class="au-banner ${on ? 'au-b-on' : 'au-b-off'}"><div class="au-b-ic"><i class="fa-solid ${on ? 'fa-satellite-dish' : 'fa-plug-circle-xmark'}"></i></div>
      <div class="au-b-txt"><b>${on ? 'Recebimento em tempo real ligado' : 'Recebimento em tempo real desligado'}</b><small>${on ? 'A conexão avisa o painel a cada mensagem nova; as automações podem responder.' : 'Sem isso, as automações por mensagem não disparam.'}</small></div>
      ${on ? '<span class="vivo">ao vivo</span>' : ''}
      ${editar ? `<button class="${on ? 'btn-soft' : 'btn-azul'} btn-sm au-b-btn" id="auWh"><i class="fa-solid ${on ? 'fa-power-off' : 'fa-bolt'}"></i> ${on ? 'Desligar recebimento' : 'Ligar recebimento'}</button>` : ''}</div>`;
    const bt = ZZ.$('#auWh', b); if (!bt) return;
    bt.onclick = async () => {
      const ok = await ZZ.confirmar(on
        ? 'Ao desligar, a conexão deixa de avisar o painel sobre mensagens novas e NENHUMA automação por mensagem (nem chatbot ou filas) vai disparar nesta conexão. Desligar?'
        : 'Ao ligar, a conexão do WhatsApp passa a NOTIFICAR este painel a cada mensagem recebida ou enviada, em tempo real. É isso que permite as automações responderem. Você pode desligar quando quiser. Ligar agora?', on ? 'Desligar' : 'Ligar recebimento', on);
      if (!ok) return;
      const bt2 = ZZ.$('#auWh', el);
      await ZZ.busy(bt2, async () => { const j = await ZZ.api(on ? 'webhook_desligar' : 'webhook_ligar', { corpo: {} }); if (j.ok) { S.wh = !!j.ligado; ZZ.toast(j.msg || (S.wh ? 'Recebimento ligado' : 'Recebimento desligado'), 'ok'); pintarBanner(); } return j; });
    };
  }

  /* ---------- lista ---------- */
  async function carregar(forcar) {
    const j = await ZZ.api('listar_automacoes', { silencioso: true });
    if (!j.ok) { if (S.itens === null || forcar) { S.erro = true; S.itens = S.itens || []; S.itens.erro = true; } pintar(); return; }
    S.erro = false; const novo = lista(j).map(norm);
    const sig = JSON.stringify(novo); if (sig === S.sig && !forcar) return; S.sig = sig;
    S.itens = novo; pintar();
  }
  function pintar() {
    const c = corpo(); if (!c) return;
    if (S.aba === 'logs') return pintarLogs();
    if (S.itens === null) { c.innerHTML = ZZ.skeleton(4, 'skel-linha au-skel'); return; }
    if (S.erro && !S.itens.length) { c.innerHTML = '<div class="card-soft vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar as automações.<br><button class="btn-soft btn-sm" id="auTent" style="margin-top:10px">Tentar de novo</button></div>'; ZZ.$('#auTent', c).onclick = e => ZZ.busy(e.currentTarget, async () => { await carregar(true); return !S.erro; }); return; }
    const barra = editar ? `<div class="au-barra"><button class="btn-azul" id="auNova"><i class="fa-solid fa-plus"></i> Nova automação</button><button class="btn-soft" id="auModelos"><i class="fa-solid fa-lightbulb"></i> Modelos</button></div>` : '';
    if (!S.itens.length) {
      c.innerHTML = barra + `<div class="card-soft au-vazio"><div class="vazio"><i class="fa-solid fa-wand-magic-sparkles"></i><b>Nenhuma automação ainda</b><br>Automatize respostas, boas-vindas e avisos. Comece por um exemplo pronto:</div>
        <div class="au-modelos">${modelosHtml()}</div></div>`;
    } else {
      c.innerHTML = barra + `<div class="au-lista">${S.itens.map((a, i) => cardHtml(a, i)).join('')}</div><p class="mut au-dica"><i class="fa-solid fa-circle-info"></i> A ordem importa: as automações são avaliadas de cima para baixo. Use "Parar aqui" para impedir que as de baixo também respondam.</p>`;
    }
    ligarLista(c);
  }
  const modelosHtml = () => MODELOS.map(m => `<button class="au-modelo" data-modelo="${m.id}"><i class="fa-solid ${m.ic}"></i><span><b>${esc(m.t)}</b><small>${esc(m.d)}</small></span><i class="fa-solid fa-chevron-right au-seta"></i></button>`).join('');
  function cardHtml(a, i) {
    const vivo = a.modo === 'ao_vivo';
    return `<article class="au-card ${a.ativa ? '' : 'au-off'}" data-id="${a.id}" data-i="${i}">
      <header><div class="au-nome"><b>${esc(a.nome || 'Sem nome')}</b>
        <div class="au-selos"><button class="au-selo ${vivo ? 'au-vivo' : 'au-teste'}" data-modo title="${editar ? 'Tocar para trocar' : ''}"><i class="fa-solid ${vivo ? 'fa-tower-broadcast' : 'fa-flask'}"></i> ${vivo ? 'AO VIVO' : 'TESTE'}</button>${a.ativa ? '' : '<span class="au-selo au-pausada"><i class="fa-solid fa-pause"></i> desligada</span>'}</div></div>
        <label class="au-sw" aria-label="Ativar"><input type="checkbox" data-ativa ${a.ativa ? 'checked' : ''} ${editar ? '' : 'disabled'}><span></span></label></header>
      <div class="au-resumo">${resumoHtml(a)}</div>
      <div class="au-meta"><span><i class="fa-solid fa-bolt"></i> ${a.execucoes || 0} execuç${(a.execucoes || 0) === 1 ? 'ão' : 'ões'}</span><span><i class="fa-regular fa-clock"></i> ${a.ultima_execucao ? 'última ' + ZZ.fmtRel(a.ultima_execucao) + ' atrás' : 'nunca executou'}</span></div>
      ${editar ? `<footer><button class="btn-soft btn-sm" data-sobe ${i === 0 ? 'disabled' : ''} aria-label="Subir"><i class="fa-solid fa-arrow-up"></i></button><button class="btn-soft btn-sm" data-desce ${i === S.itens.length - 1 ? 'disabled' : ''} aria-label="Descer"><i class="fa-solid fa-arrow-down"></i></button>
        <button class="btn-soft btn-sm au-f1" data-edita><i class="fa-solid fa-pen"></i> Editar</button><button class="btn-soft btn-sm" data-dup aria-label="Duplicar"><i class="fa-solid fa-copy"></i></button><button class="btn-perigo btn-sm" data-del aria-label="Excluir"><i class="fa-solid fa-trash"></i></button></footer>` : ''}
    </article>`;
  }
  /** Confirmação dupla para ir ao ar. */
  async function confirmarVivo() {
    if (!await ZZ.confirmar('Esta automação vai responder PESSOAS DE VERDADE no seu WhatsApp. Tem certeza que quer colocá-la AO VIVO?', 'Continuar', true)) return false;
    return ZZ.confirmar('Última confirmação: depois disso, quem escrever e casar com a regra receberá a resposta automática. Colocar AO VIVO agora?', 'Sim, colocar AO VIVO', true);
  }
  function ligarLista(c) {
    ZZ.$$('[data-modelo]', c).forEach(b => b.onclick = () => abrirEditor(norm(MODELOS.find(m => m.id === b.dataset.modelo).a)));
    const n = ZZ.$('#auNova', c); if (n) n.onclick = () => abrirEditor(vazio());
    const m = ZZ.$('#auModelos', c); if (m) m.onclick = () => { const md = ZZ.modal(`<h3><i class="fa-solid fa-lightbulb"></i> Modelos prontos</h3><p class="mut">Escolha um para preencher o editor. Você ajusta tudo antes de salvar.</p><div class="au-modelos">${modelosHtml()}</div><div class="acoes"><button class="btn-soft" data-f>Fechar</button></div>`); ZZ.$('[data-f]', md.el).onclick = () => md.fechar(); ZZ.$$('[data-modelo]', md.el).forEach(b => b.onclick = () => { md.fechar(); abrirEditor(norm(MODELOS.find(x => x.id === b.dataset.modelo).a)); }); };
    ZZ.$$('.au-card', c).forEach(card => {
      const i = +card.dataset.i, a = S.itens[i];
      const sw = ZZ.$('[data-ativa]', card);
      sw.onchange = async () => {
        const quer = sw.checked;
        if (quer && a.modo === 'ao_vivo' && !await ZZ.confirmar('Esta automação está AO VIVO: ao ligar, vai responder pessoas de verdade. Ligar?', 'Ligar', true)) { sw.checked = false; return; }
        card.classList.add('au-salvando'); sw.disabled = true;
        const j = await ZZ.api('ativar_automacao', { corpo: { id: a.id, ativa: quer, modo: a.modo } });
        sw.disabled = false; card.classList.remove('au-salvando');
        if (j.ok) { a.ativa = quer; S.sig = ''; card.classList.toggle('au-off', !quer); ZZ.toast(j.msg || (quer ? 'Automação ligada' : 'Automação desligada'), j.webhook_ligado === false ? 'err' : 'ok'); card.classList.add('au-piscou'); carregar(true); } else sw.checked = !quer;
      };
      ZZ.$('[data-modo]', card).onclick = async e => {
        if (!editar) return;
        const novo = a.modo === 'ao_vivo' ? 'teste' : 'ao_vivo';
        if (novo === 'ao_vivo' && !await confirmarVivo()) return;
        await ZZ.busy(e.currentTarget, async () => { const j = await ZZ.api('ativar_automacao', { corpo: { id: a.id, ativa: a.ativa, modo: novo } }); if (j.ok) { ZZ.toast(novo === 'ao_vivo' ? 'Agora está AO VIVO' : 'Voltou para o modo TESTE', 'ok'); await carregar(true); } return j; });
      };
      if (!editar) return;
      const mover = async d => { const j = i + d; if (j < 0 || j >= S.itens.length) return; [S.itens[i], S.itens[j]] = [S.itens[j], S.itens[i]]; pintar(); ZZ.$$('.au-card', corpo())[j].classList.add('au-piscou');
        const r = await ZZ.api('ordenar_automacoes', { corpo: { ids: S.itens.map(x => x.id) } }); if (r.ok) { S.sig = ''; ZZ.toast('Ordem salva', 'ok'); } else carregar(true); };
      ZZ.$('[data-sobe]', card).onclick = () => mover(-1); ZZ.$('[data-desce]', card).onclick = () => mover(1);
      ZZ.$('[data-edita]', card).onclick = e => ZZ.busy(e.currentTarget, async () => { const j = await ZZ.api('ver_automacao', { params: { id: a.id } }); abrirEditor(j.ok && j.automacao ? norm(j.automacao) : a); return j.ok !== false; });
      ZZ.$('[data-dup]', card).onclick = e => ZZ.busy(e.currentTarget, async () => { const j = await ZZ.api('duplicar_automacao', { corpo: { id: a.id } }); if (j.ok) { ZZ.toast('Automação duplicada (começa desligada, em TESTE)', 'ok'); await carregar(true); } return j; });
      ZZ.$('[data-del]', card).onclick = async e => { if (!await ZZ.confirmar(`Excluir a automação "${a.nome}"? Os registros dela também somem.`, 'Excluir', true)) return;
        const btn = e.currentTarget; await ZZ.busy(btn, async () => { const j = await ZZ.api('excluir_automacao', { corpo: { id: a.id } }); if (j.ok) { card.classList.add('au-sai'); ZZ.toast('Automação excluída', 'ok'); setTimeout(() => carregar(true), 250); } return j; }); };
    });
  }

  /* ---------- registros ---------- */
  const RES = { executou: ['fa-circle-check', 'au-r-ok', 'Executou'], ignorou: ['fa-circle-minus', 'au-r-ign', 'Ignorou'], erro: ['fa-circle-xmark', 'au-r-err', 'Erro'], teste: ['fa-flask', 'au-r-tes', 'Teste'] };
  async function carregarLogs(mais) {
    if (mais) S.pag = (S.pag || 1) + 1; else if (!S.pag) S.pag = 1;
    const j = await ZZ.api('listar_logs_automacao', { params: { resultado: S.filtro, pag: mais ? S.pag : 1 }, silencioso: true });
    if (!j.ok) { if (mais) S.pag--; if (!S.logs) S.logs = Object.assign([], { erro: true }); }
    else if (mais) { const ids = new Set(S.logs.map(l => l.id)); S.logs = S.logs.concat((j.itens || []).filter(l => !ids.has(l.id))); S.total = j.total; }
    else { const ids = new Set((j.itens || []).map(l => l.id)); S.logs = (j.itens || []).concat((S.logs || []).filter(l => !ids.has(l.id) && l.id < Math.min(...(j.itens || [{ id: 0 }]).map(x => x.id)))); S.total = j.total; }
    if (S.aba === 'logs') pintarLogs();
  }
  function pintarLogs() {
    const c = corpo(); if (!c) return;
    const filtros = [['', 'Todos'], ['executou', 'Executou'], ['ignorou', 'Ignorou'], ['erro', 'Erro'], ['teste', 'Teste']];
    const topo = `<div class="au-filtros"><span class="vivo au-vivo-logs">ao vivo</span>${filtros.map(f => `<button class="${S.filtro === f[0] ? 'on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join('')}</div>`;
    let corpoL;
    if (S.logs === null) corpoL = ZZ.skeleton(5, 'skel-linha au-skel');
    else if (S.logs.erro) corpoL = '<div class="card-soft vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar os registros.<br><button class="btn-soft btn-sm" id="auLTent" style="margin-top:10px">Tentar de novo</button></div>';
    else if (!S.logs.length) corpoL = `<div class="card-soft vazio"><i class="fa-solid fa-clock-rotate-left"></i>${S.filtro ? 'Nenhum registro com esse resultado.' : 'Nenhuma execução registrada ainda. Use o simulador no editor para testar sem enviar nada.'}</div>`;
    else corpoL = '<div class="au-logs">' + S.logs.map(l => { const d = RES[l.resultado] || RES.ignorou, novo = S.vistos.size && !S.vistos.has(l.id);
      return `<div class="au-log ${d[1]} ${novo ? 'au-novo' : ''}"><i class="fa-solid ${d[0]} au-log-ic"></i><div class="au-log-t"><b>${esc(l.automacao || 'Automação')}</b><span class="au-log-r">${d[2]}</span><small>${esc(l.numero ? ZZ.fmtNumero(l.numero) : '')}${l.detalhe ? ' · ' + esc(l.detalhe) : ''}</small></div><time>${ZZ.fmtRel(l.ts || 0)}<br><small>${ZZ.fmtHora(l.ts || 0)}</small></time></div>`; }).join('') + '</div>'
      + (S.total > S.logs.length ? `<button class="btn-soft au-add" id="auMais" style="margin-top:12px">Carregar mais (${S.total - S.logs.length})</button>` : '');
    c.innerHTML = topo + corpoL;
    if (Array.isArray(S.logs)) S.logs.forEach(l => S.vistos.add(l.id));
    ZZ.$$('[data-f]', c).forEach(b => b.onclick = () => { S.filtro = b.dataset.f; S.logs = null; S.pag = 1; S.vistos = new Set(); pintarLogs(); carregarLogs(); });
    const t = ZZ.$('#auLTent', c); if (t) t.onclick = e => ZZ.busy(e.currentTarget, async () => { S.logs = null; await carregarLogs(); return !(S.logs && S.logs.erro); });
    const m = ZZ.$('#auMais', c); if (m) m.onclick = e => ZZ.busy(e.currentTarget, async () => { await carregarLogs(true); return true; });
  }

  /* ================== EDITOR (assistente em tela cheia) ================== */
  const ref = { filas: null, etiquetas: null };
  async function refLista(acao, chave) {
    const j = await ZZ.api(acao, { silencioso: true });
    ref[chave] = j.ok ? (j.itens || j.filas || j.etiquetas || []).map(x => ({ id: x.id, nome: x.nome || x.titulo || String(x.id) })) : [];
  }
  function abrirEditor(a) {
    if (S.ed) return;
    const E = S.ed = { a: clone(a), passo: 0, snap: '', ov: null };
    E.snap = JSON.stringify(E.a);
    if (ref.filas === null) refLista('listar_filas', 'filas').then(() => E.ov && E.passo === 2 && corpoEd());
    if (ref.etiquetas === null) refLista('listar_etiquetas', 'etiquetas').then(() => E.ov && E.passo === 2 && corpoEd());
    const ov = E.ov = document.createElement('div'); ov.className = 'au-editor';
    ov.innerHTML = `<header class="au-eh"><button class="au-x" id="edX" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button><div class="au-eh-t"><b id="edTit"></b><small id="edSub"></small></div></header>
      <div class="au-passos" id="edPassos"></div><div class="au-ec" id="edCorpo"></div>
      <footer class="au-ef"><button class="btn-soft" id="edVolta"></button><button class="btn-azul" id="edProx"></button></footer>`;
    document.body.appendChild(ov); document.body.classList.add('au-trava');
    ZZ.$('#edX', ov).onclick = fecharEd;
    ZZ.$('#edVolta', ov).onclick = () => { if (E.passo === 0) fecharEd(); else irPasso(E.passo - 1); };
    ZZ.$('#edProx', ov).onclick = async e => { if (E.passo < 3) { if (valida(E.passo)) irPasso(E.passo + 1); } else salvar(e.currentTarget); };
    // eventos delegados do corpo
    const cc = ZZ.$('#edCorpo', ov);
    const aoMudar = ev => { const t = ev.target.closest('[data-k]'); if (!t) return; let v = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.t === 'num') v = v === '' ? '' : +v; if (t.dataset.t === 'lista') v = lista2(v); if (t.dataset.t === 'bool') v = v === 'true'; setP(t.dataset.k, v);
      t.classList.remove('erro-campo'); const mc = t.nextElementSibling; if (mc && mc.classList.contains('msg-campo')) mc.remove();
      const pv = t.dataset.prev && ZZ.$(`[data-pv="${t.dataset.prev}"]`, cc); if (pv) pv.innerHTML = previaHtml(v); };
    cc.addEventListener('input', aoMudar); cc.addEventListener('change', ev => { aoMudar(ev); if (ev.target.dataset.re) corpoEd(); });
    cc.addEventListener('click', aoClicar);
    cc.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'edPal') { ev.preventDefault(); addPalavra(); } });
    cc.addEventListener('focusin', ev => { if (/INPUT|TEXTAREA/.test(ev.target.tagName)) setTimeout(() => { try { ev.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } }, 300); });
    irPasso(0);
  }
  const getP = (p, o = S.ed.a) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const setP = (p, v) => { const ks = p.split('.'), u = ks.pop(); const o = ks.reduce((x, k) => x[k], S.ed.a); o[u] = v; };
  const previaHtml = t => t ? esc(previa(t)).replace(/\n/g, '<br>') : '<span class="mut">Digite a mensagem para ver a prévia…</span>';
  function fecharEd(forcar) {
    const E = S.ed; if (!E) return;
    const sair = () => { E.ov.remove(); document.body.classList.remove('au-trava'); S.ed = null; S.sig = ''; carregar(true); };
    if (forcar === true || JSON.stringify(E.a) === E.snap) return sair();
    ZZ.confirmar('Descartar as alterações desta automação?', 'Descartar', true).then(ok => ok && sair());
  }
  function irPasso(n) {
    const E = S.ed; E.passo = n;
    const tit = ['Gatilho', 'Condições', 'Ações', 'Revisar e testar'], sub = ['Quando a automação começa', 'Em que casos ela vale (opcional)', 'O que ela faz, em ordem', 'Confira, simule e salve'];
    ZZ.$('#edTit', E.ov).textContent = `${n + 1}. ${tit[n]}`; ZZ.$('#edSub', E.ov).textContent = sub[n];
    ZZ.$('#edPassos', E.ov).innerHTML = tit.map((t, i) => `<button class="${i === n ? 'on' : i < n ? 'ok' : ''}" data-p="${i}" ${i > n ? 'disabled' : ''}><span>${i < n ? '<i class="fa-solid fa-check"></i>' : i + 1}</span><em>${t}</em></button>`).join('');
    ZZ.$$('#edPassos button', E.ov).forEach(b => b.onclick = () => irPasso(+b.dataset.p));
    ZZ.$('#edVolta', E.ov).innerHTML = n === 0 ? 'Cancelar' : '<i class="fa-solid fa-arrow-left"></i> Voltar';
    ZZ.$('#edProx', E.ov).innerHTML = n < 3 ? 'Avançar <i class="fa-solid fa-arrow-right"></i>' : '<i class="fa-solid fa-floppy-disk"></i> Salvar automação';
    corpoEd(true);
  }
  /* validação por passo: marca o campo e foca no primeiro inválido */
  function erroCampo(sel, msg) { const c = ZZ.$('#edCorpo', S.ed.ov); const t = ZZ.$(sel, c); if (!t) { ZZ.toast(msg, 'err'); return false; }
    t.classList.add('erro-campo'); if (!(t.nextElementSibling && t.nextElementSibling.classList.contains('msg-campo'))) t.insertAdjacentHTML('afterend', `<div class="msg-campo">${esc(msg)}</div>`);
    t.focus(); try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } ZZ.vibrar([30, 40, 30]); return false; }
  function valida(p) {
    const a = S.ed.a, g = a.gatilho;
    if (p === 0) {
      if (!a.nome.trim()) return erroCampo('[data-k="nome"]', 'Dê um nome para a automação.');
      if (g.tipo === 'mensagem_recebida') {
        if (!(g.termos || []).length) return erroCampo('#edPal', g.modo === 'regex' ? 'Adicione pelo menos um padrão (regex).' : 'Adicione pelo menos uma palavra-chave.');
        if (g.modo === 'regex') for (const t of g.termos) { try { new RegExp(t, 'i'); } catch (e) { return erroCampo('#edPal', 'Regex inválida: ' + t); } }
      }
      if (g.tipo === 'agendado') {
        if (g.frequencia === 'intervalo') { if (!(+g.minutos >= 5 && +g.minutos <= 1440)) return erroCampo('[data-k="gatilho.minutos"]', 'Entre 5 e 1440 minutos.'); }
        else if (!/^\d\d:\d\d$/.test(g.hora || '')) return erroCampo('[data-k="gatilho.hora"]', 'Informe o horário.');
        if (g.frequencia === 'semanal' && !g.dias.length) { ZZ.toast('Escolha ao menos um dia da semana.', 'err'); return false; }
        if (!lista2(g.jids).length) return erroCampo('[data-k="gatilho.jids"]', 'Informe ao menos um número que vai receber.');
        if (lista2(g.jids).some(x => !x.includes('@') && !/^\d{10,15}$/.test(x.replace(/\D/g, '')))) return erroCampo('[data-k="gatilho.jids"]', 'Há um número inválido (use DDI+DDD, ex.: 5582999999999).');
      }
    }
    if (p === 1 && !semMsg(a) && a.condicoes.horario.modo !== 'qualquer' && !a.condicoes.horario.dias.length) { ZZ.toast('Escolha ao menos um dia de funcionamento.', 'err'); return false; }
    if (p === 2) {
      if (!a.acoes.length) { ZZ.toast('Adicione pelo menos uma ação.', 'err'); return false; }
      let tempo = 0;
      for (let i = 0; i < a.acoes.length; i++) { const x = a.acoes[i]; tempo += (+x.atraso_s || 0) + (x.tipo === 'esperar' ? +x.segundos || 0 : 0);
        if (x.tipo === 'responder_texto' && !String(x.texto || '').trim()) return erroCampo(`[data-k="acoes.${i}.texto"]`, 'Escreva o texto da resposta.');
        if (x.tipo === 'responder_midia' && !/^https:\/\//i.test(x.url || '')) return erroCampo(`[data-k="acoes.${i}.url"]`, 'Informe o link https:// do arquivo.');
        if (x.tipo === 'chamar_webhook' && !/^https:\/\//i.test(x.url || '')) return erroCampo(`[data-k="acoes.${i}.url"]`, 'Informe a URL https://…');
        if (x.tipo === 'esperar' && !(x.segundos >= 1 && x.segundos <= 30)) return erroCampo(`[data-k="acoes.${i}.segundos"]`, 'Entre 1 e 30 segundos.');
        if (x.tipo === 'atribuir_fila' && !String(x.fila || '').trim()) return erroCampo(`[data-k="acoes.${i}.fila"]`, 'Escolha a fila.');
        if (x.tipo === 'etiquetar' && !String(x.etiqueta || '').trim()) return erroCampo(`[data-k="acoes.${i}.etiqueta"]`, 'Escolha a etiqueta.'); }
      if (tempo > 45) { ZZ.toast(`Esperas e atrasos somam ${tempo} s; o máximo é 45 s.`, 'err'); return false; }
    }
    return true;
  }
  const seg = (path, ops) => `<div class="au-seg">${ops.map(o => `<button type="button" data-set="${path}" data-v="${o[0]}" class="${getP(path) === o[0] ? 'on' : ''}">${o[2] ? `<i class="fa-solid ${o[2]}"></i> ` : ''}${o[1]}</button>`).join('')}</div>`;
  const diasChips = path => `<div class="au-chips">${ORDEM_DIAS.map(d => `<button type="button" data-tog="${path}" data-v="${d}" class="${(getP(path) || []).includes(d) ? 'on' : ''}">${DIAS[d]}</button>`).join('')}</div>`;

  function corpoEd(topo) {
    const E = S.ed, cc = ZZ.$('#edCorpo', E.ov), y = cc.scrollTop, a = E.a, g = a.gatilho; let h = '';
    if (E.passo === 0) {
      h = `<label>Nome da automação</label><input type="text" data-k="nome" value="${esc(a.nome)}" maxlength="80" placeholder="Ex.: Resposta de ausência">
        <label>Quando ela deve começar?</label><div class="au-opcoes">${GAT.map(t => `<button type="button" class="au-op ${g.tipo === t.id ? 'on' : ''}" data-set="gatilho.tipo" data-v="${t.id}"><i class="fa-solid ${t.ic}"></i><span><b>${t.t}</b><small>${t.d}</small></span><i class="fa-solid fa-circle-check au-ok"></i></button>`).join('')}</div>`;
      if (g.tipo === 'mensagem_recebida') { const rx = g.modo === 'regex';
        h += `<div class="au-bloco"><label>Como comparar?</label>${seg('gatilho.modo', [['contem', 'Contém'], ['igual', 'Igual a'], ['comeca', 'Começa com'], ['regex', 'Regex']])}
        <label>${rx ? 'Padrões (regex)' : 'Palavras-chave'} <small class="mut">${rx ? '(ex.: pre[cç]o)' : '(ignora maiúsculas e acentos)'}</small></label><div class="au-pal"><input type="text" id="edPal" placeholder="${rx ? 'pre[cç]o|valor' : 'Digite e toque em adicionar'}" enterkeyhint="done" autocapitalize="off" autocomplete="off"><button type="button" class="btn-azul" data-addpal>Adicionar</button></div>
        <div class="au-chips au-pals">${(g.termos || []).map((p, i) => `<span class="au-chip">${esc(p)}<button type="button" data-rmpal="${i}" aria-label="Remover"><i class="fa-solid fa-xmark"></i></button></span>`).join('') || '<span class="mut">Nenhum ainda.</span>'}</div>
        ${(g.termos || []).length > 1 ? `<label>Quando houver vários</label>${seg('gatilho.combinar', [['qualquer', 'Basta um casar'], ['todos', 'Todos precisam casar']])}` : ''}</div>`; }
      if (g.tipo === 'agendado') h += `<div class="au-bloco"><label>Repetir</label>${seg('gatilho.frequencia', [['diario', 'Todo dia'], ['semanal', 'Dias da semana'], ['intervalo', 'A cada X min']])}
        ${g.frequencia === 'intervalo' ? `<label>Intervalo em minutos <small class="mut">(5 a 1440)</small></label><input type="number" inputmode="numeric" data-t="num" data-k="gatilho.minutos" min="5" max="1440" value="${esc(g.minutos)}">` : `<label>Horário</label><input type="time" data-k="gatilho.hora" value="${esc(g.hora)}">`}
        ${g.frequencia === 'semanal' ? `<label>Dias</label>${diasChips('gatilho.dias')}` : ''}
        <label>Enviar para <small class="mut">(números com DDI+DDD, um por linha; até 50)</small></label><textarea data-k="gatilho.jids" data-t="lista" rows="3" placeholder="5582999999999">${esc(lista2(g.jids).join('\n'))}</textarea></div>`;
      if (g.tipo === 'conexao_desconectada') h += `<div class="au-bloco"><label>Avisar estes números <small class="mut">(opcional, um por linha; até 5)</small></label><textarea data-k="gatilho.jids" data-t="lista" rows="3" placeholder="5582999999999">${esc(lista2(g.jids).join('\n'))}</textarea></div><div class="au-nota"><i class="fa-solid fa-circle-info"></i> Dispara quando esta conexão cair (no máximo 1 aviso a cada 30 min). Se a conexão caiu, o aviso é enviado pela conexão de envio configurada.</div>`;
      h += `<label>Limite de respostas por contato/hora</label><input type="number" inputmode="numeric" data-t="num" data-k="limite_hora_contato" min="1" max="60" value="${esc(a.limite_hora_contato)}"><small class="mut">Proteção contra loop: depois disso a automação ignora aquele contato até a próxima hora.</small>`;
    } else if (E.passo === 1) {
      const c = a.condicoes, hr = c.horario;
      if (semMsg(a)) h = '<div class="au-nota"><i class="fa-solid fa-circle-info"></i> Este gatilho não usa condições de mensagem. Pode avançar.</div>';
      else h = `<p class="mut au-intro">Tudo é opcional: sem condições, vale para todas as mensagens que casarem com o gatilho.</p>
        <label>Tipo de conversa</label>${seg('condicoes.tipo_chat', [['individual', 'Privada', 'fa-user'], ['grupo', 'Grupos', 'fa-users'], ['ambos', 'As duas', 'fa-comments']])}
        <label>Horário de funcionamento</label>${seg('condicoes.horario.modo', [['qualquer', 'Qualquer hora'], ['dentro', 'Dentro do horário'], ['fora', 'Fora do horário']])}
        ${hr.modo !== 'qualquer' ? `<div class="au-bloco"><div class="grid2"><div><label>Abre às</label><input type="time" data-k="condicoes.horario.inicio" value="${esc(hr.inicio)}"></div><div><label>Fecha às</label><input type="time" data-k="condicoes.horario.fim" value="${esc(hr.fim)}"></div></div><label>Dias de funcionamento</label>${diasChips('condicoes.horario.dias')}</div>` : ''}
        <label>Contato</label>${seg('condicoes.novo', [['qualquer', 'Qualquer um'], ['novo', 'Só contato novo'], ['existente', 'Só quem já falou']])}
        <label>Tipo de mensagem <small class="mut">(nenhum marcado = todos)</small></label><div class="au-chips">${TIPOS_MSG.map(t => `<button type="button" data-tog="condicoes.tipos_mensagem" data-v="${t[0]}" class="${(c.tipos_mensagem || []).includes(t[0]) ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
        <label>Só estes contatos <small class="mut">(um número por linha; vazio = todos)</small></label><textarea data-k="condicoes.incluir" data-t="lista" rows="3" placeholder="5582999999999">${esc(lista2(c.incluir).join('\n'))}</textarea>
        <label>Nunca para estes contatos <small class="mut">(um número por linha)</small></label><textarea data-k="condicoes.excluir" data-t="lista" rows="3" placeholder="5582988888888">${esc(lista2(c.excluir).join('\n'))}</textarea>`;
    } else if (E.passo === 2) {
      h = `<p class="mut au-intro">As ações rodam de cima para baixo (esperas e atrasos somam no máximo 45 s). Use as setas para reordenar.</p><div class="au-acoes">${a.acoes.map((x, i) => acaoHtml(x, i)).join('') || '<div class="vazio au-vz"><i class="fa-solid fa-diagram-project"></i>Nenhuma ação ainda. Adicione abaixo.</div>'}</div>
        <button type="button" class="btn-azul au-add" data-addacao><i class="fa-solid fa-plus"></i> Adicionar ação</button>`;
    } else {
      const sim = E.sim || (E.sim = { texto: '', grupo: false, novo: false, fora: false, res: null });
      const temHor = !semMsg(a) && a.condicoes.horario.modo !== 'qualquer';
      h = `<div class="au-rev"><div class="au-rev-t"><i class="fa-solid fa-list-check"></i> Resumo</div><div class="au-resumo">${resumoHtml(a)}</div></div>
        <div class="au-sim"><div class="au-rev-t"><i class="fa-solid fa-flask-vial"></i> Simulador <small class="mut">nada é enviado</small></div>
        ${semMsg(a) ? '<p class="mut">Este gatilho não depende de mensagem: o simulador mostra o que seria feito.</p>' : `<label>Se o contato enviar:</label><textarea id="simTxt" rows="2" placeholder="Ex.: Oi, qual o preço?">${esc(sim.texto)}</textarea>
        <div class="au-chips"><button type="button" data-sim="grupo" class="${sim.grupo ? 'on' : ''}"><i class="fa-solid fa-users"></i> Grupo</button><button type="button" data-sim="novo" class="${sim.novo ? 'on' : ''}"><i class="fa-solid fa-user-plus"></i> Contato novo</button>${temHor ? `<button type="button" data-sim="fora" class="${sim.fora ? 'on' : ''}"><i class="fa-solid fa-moon"></i> Fora do horário</button>` : ''}</div>`}
        <button type="button" class="btn-soft au-add" id="simGo"><i class="fa-solid fa-play"></i> Simular</button><div id="simRes">${sim.res ? simHtml(sim.res) : ''}</div></div>
        <label>Modo</label><div class="au-opcoes"><button type="button" class="au-op ${a.modo !== 'ao_vivo' ? 'on' : ''}" data-modo-ed="teste"><i class="fa-solid fa-flask"></i><span><b>TESTE</b><small>Avalia e registra, mas NÃO envia nada</small></span><i class="fa-solid fa-circle-check au-ok"></i></button>
        <button type="button" class="au-op au-op-vivo ${a.modo === 'ao_vivo' ? 'on' : ''}" data-modo-ed="ao_vivo"><i class="fa-solid fa-tower-broadcast"></i><span><b>AO VIVO</b><small>Responde pessoas de verdade</small></span><i class="fa-solid fa-circle-check au-ok"></i></button></div>
        <label class="au-check"><input type="checkbox" data-k="ativa" ${a.ativa ? 'checked' : ''}> <span>Ligar a automação ao salvar</span></label>`;
    }
    cc.innerHTML = h; cc.scrollTop = topo ? 0 : y;
  }
  function acaoHtml(x, i) {
    const d = ACOES[x.tipo] || { ic: 'fa-gear', t: x.tipo }, n = S.ed.a.acoes.length; let b = '';
    const k = c => `acoes.${i}.${c}`;
    const atraso = `<label>Atraso antes desta ação</label><select data-k="${k('atraso_s')}" data-t="num">${[[0, 'Nenhum'], [2, '2 s'], [5, '5 s'], [10, '10 s'], [20, '20 s']].concat([0, 2, 5, 10, 20].includes(+x.atraso_s || 0) ? [] : [[+x.atraso_s, x.atraso_s + ' s']]).map(o => `<option value="${o[0]}" ${+x.atraso_s === o[0] || (!x.atraso_s && !o[0]) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
    if (x.tipo === 'responder_texto') b = `<textarea data-k="${k('texto')}" data-prev="${i}" rows="4" placeholder="Escreva a resposta…" maxlength="1500">${esc(x.texto)}</textarea>
      <div class="au-chips au-vars">${VARS.map(v => `<button type="button" data-var="${i}" data-v="${v}">${v}</button>`).join('')}</div>${atraso}
      <div class="au-prev"><small class="mut">Prévia (com dados de exemplo)</small><div class="au-bolha" data-pv="${i}">${previaHtml(x.texto)}</div></div>`;
    else if (x.tipo === 'responder_midia') b = `<label>Tipo</label><select data-k="${k('midia_tipo')}">${[['image', 'Imagem'], ['video', 'Vídeo'], ['audio', 'Áudio'], ['document', 'Documento / PDF']].map(o => `<option value="${o[0]}" ${x.midia_tipo === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      <label>Link do arquivo (https://…)</label><input type="text" data-k="${k('url')}" value="${esc(x.url || '')}" placeholder="https://…" autocapitalize="off"><label>Legenda (opcional)</label><textarea data-k="${k('legenda')}" rows="2" maxlength="1000">${esc(x.legenda || '')}</textarea><div class="au-chips au-vars">${VARS.map(v => `<button type="button" data-var="${i}" data-campo="legenda" data-v="${v}">${v}</button>`).join('')}</div>${atraso}`;
    else if (x.tipo === 'esperar') b = `<label>Segundos de espera <small class="mut">(1 a 30)</small></label><input type="number" inputmode="numeric" data-t="num" data-k="${k('segundos')}" min="1" max="30" value="${esc(x.segundos)}">`;
    else if (x.tipo === 'chamar_webhook') b = `<label>URL (https://…)</label><input type="text" data-k="${k('url')}" value="${esc(x.url || '')}" placeholder="https://…" autocapitalize="off">${atraso}<label class="au-check"><input type="checkbox" data-k="${k('incluir_texto')}" ${x.incluir_texto ? 'checked' : ''}> <span>Enviar também o texto da mensagem</span></label><small class="mut">Envia um POST em JSON com dados do contato (espera no máx. 5 s).</small>`;
    else if (x.tipo === 'atribuir_fila' || x.tipo === 'etiquetar') {
      const f = x.tipo === 'atribuir_fila', arr = f ? ref.filas : ref.etiquetas, c = f ? 'fila' : 'etiqueta';
      b = `<label>${f ? 'Fila' : 'Etiqueta'}</label>` + (arr && arr.length ? `<select data-k="${k(c)}"><option value="">Escolher…</option>${arr.map(o => `<option value="${esc(o.nome)}" ${String(x[c]) === String(o.nome) ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}</select>`
        : `<input type="text" data-k="${k(c)}" value="${esc(x[c] || '')}" maxlength="60" placeholder="${f ? 'Nome da fila' : 'Nome da etiqueta'}">${arr === null ? '<small class="mut">Carregando lista…</small>' : '<small class="mut">Nenhum cadastro encontrado — digite o nome.</small>'}`);
    } else if (x.tipo === 'marcar_lida') b = '<p class="mut">Marca a mensagem recebida como lida (✓✓ azul). Não vale para gatilhos agendados ou de conexão.</p>';
    else if (x.tipo === 'parar') b = '<p class="mut">Interrompe aqui: as ações seguintes e as outras automações abaixo não rodam para esta mensagem.</p>';
    return `<div class="au-acao" data-i="${i}"><div class="au-acao-h"><span class="au-num">${i + 1}</span><i class="fa-solid ${d.ic}"></i><b>${d.t}</b>
      <span class="au-acao-b"><button type="button" data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir"><i class="fa-solid fa-arrow-up"></i></button><button type="button" data-mv="1" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer"><i class="fa-solid fa-arrow-down"></i></button><button type="button" data-rm="${i}" class="au-rm" aria-label="Remover"><i class="fa-solid fa-trash"></i></button></span></div>${b ? `<div class="au-acao-c">${b}</div>` : ''}</div>`;
  }
  function addPalavra() {
    const i = ZZ.$('#edPal', S.ed.ov); if (!i) return; const v = i.value.trim();
    if (!v) { return erroCampo('#edPal', 'Digite algo antes de adicionar.'); }
    if (S.ed.a.gatilho.modo === 'regex') { try { new RegExp(v, 'i'); } catch (e) { return erroCampo('#edPal', 'Regex inválida.'); } }
    const l = S.ed.a.gatilho.termos; if (l.length >= 30) return erroCampo('#edPal', 'No máximo 30.'); if (!l.some(p => p.toLowerCase() === v.toLowerCase())) l.push(v);
    corpoEd(); const n = ZZ.$('#edPal', S.ed.ov); if (n) n.focus();
  }
  async function aoClicar(ev) {
    const E = S.ed, t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.set) { setP(t.dataset.set, t.dataset.v); return corpoEd(); }
    if (t.dataset.tog) { const l = getP(t.dataset.tog) || []; const v = /^\d+$/.test(t.dataset.v) ? +t.dataset.v : t.dataset.v; const ix = l.indexOf(v); if (ix >= 0) l.splice(ix, 1); else l.push(v); l.sort(); setP(t.dataset.tog, l); t.classList.toggle('on'); return; }
    if (t.hasAttribute('data-addpal')) return addPalavra();
    if (t.dataset.rmpal !== undefined) { E.a.gatilho.termos.splice(+t.dataset.rmpal, 1); return corpoEd(); }
    if (t.hasAttribute('data-addacao')) return escolherAcao();
    if (t.dataset.mv) { const i = +t.dataset.i, j = i + +t.dataset.mv, l = E.a.acoes; [l[i], l[j]] = [l[j], l[i]]; corpoEd(); const el2 = ZZ.$(`.au-acao[data-i="${j}"]`, E.ov); if (el2) { el2.classList.add('au-piscou'); el2.scrollIntoView({ block: 'center', behavior: 'smooth' }); } return; }
    if (t.dataset.rm !== undefined) { if (!await ZZ.confirmar('Remover esta ação?', 'Remover', true)) return; E.a.acoes.splice(+t.dataset.rm, 1); return corpoEd(); }
    if (t.dataset.var !== undefined) { const i = +t.dataset.var, campo = t.dataset.campo || 'texto', ta = ZZ.$(`[data-k="acoes.${i}.${campo}"]`, E.ov), p = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, p) + t.dataset.v + ta.value.slice(ta.selectionEnd ?? p); setP(`acoes.${i}.${campo}`, ta.value); ta.focus(); ta.setSelectionRange(p + t.dataset.v.length, p + t.dataset.v.length);
      const pv = ZZ.$(`[data-pv="${i}"]`, E.ov); if (pv && campo === 'texto') pv.innerHTML = previaHtml(ta.value); return; }
    if (t.dataset.sim) { E.sim[t.dataset.sim] = !E.sim[t.dataset.sim]; t.classList.toggle('on'); return; }
    if (t.dataset.modoEd) { const v = t.dataset.modoEd; if (v === 'ao_vivo' && E.a.modo !== 'ao_vivo') { if (!await confirmarVivo()) return; } E.a.modo = v; return corpoEd(); }
    if (t.id === 'simGo') { const tx = ZZ.$('#simTxt', E.ov); if (tx) E.sim.texto = tx.value; return ZZ.busy(t, () => simular()); }
  }
  function escolherAcao() {
    const m = ZZ.modal(`<h3><i class="fa-solid fa-plus"></i> Adicionar ação</h3><div class="au-opcoes">${Object.entries(ACOES).map(([k, d]) => `<button type="button" class="au-op" data-n="${k}"><i class="fa-solid ${d.ic}"></i><span><b>${d.t}</b></span></button>`).join('')}</div><div class="acoes"><button class="btn-soft" data-f>Cancelar</button></div>`);
    ZZ.$('[data-f]', m.el).onclick = () => m.fechar();
    ZZ.$$('[data-n]', m.el).forEach(b => b.onclick = () => { m.fechar(); S.ed.a.acoes.push(ACOES[b.dataset.n].novo()); corpoEd(); const l = ZZ.$$('.au-acao', S.ed.ov).pop(); if (l) { l.classList.add('au-piscou'); l.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
  }

  /* ---------- simulador (chama testar_automacao; nada é enviado) ---------- */
  /** Gera um "agora" (hora de Maceió) que esteja dentro ou fora do horário configurado, para o chip "Fora do horário". */
  function agoraSim(h, fora) {
    const base = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Maceio' })), p2 = n => String(n).padStart(2, '0');
    const dentro = (d, hm) => { const dia = d.getDay(); if (h.fim >= h.inicio) return h.dias.includes(dia) && hm >= h.inicio && hm < h.fim; return (hm >= h.inicio && h.dias.includes(dia)) || (hm < h.fim && h.dias.includes((dia + 6) % 7)); };
    for (let d = 0; d < 9; d++) { const dt = new Date(base); dt.setDate(base.getDate() + d);
      for (const hm of [h.inicio, '12:00', h.fim, '03:00', '23:30', '00:00']) { if (dentro(dt, hm) === !fora) return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} ${hm}`; } }
    return null;
  }
  async function simular() {
    const E = S.ed, s = E.sim, a = E.a;
    if (!valida(0) || !valida(1) || !valida(2)) { s.res = { erro: 'Complete os passos anteriores para simular.' }; const d0 = ZZ.$('#simRes', E.ov); if (d0) d0.innerHTML = simHtml(s.res); return false; }
    const corpoT = { rascunho: paraServidor(a), texto: s.texto, grupo: s.grupo, contato_novo: s.novo };
    if (!semMsg(a) && a.condicoes.horario.modo !== 'qualquer') { const ag = agoraSim({ ...a.condicoes.horario }, s.fora); if (ag) corpoT.agora = ag; }
    const j = await ZZ.api('testar_automacao', { silencioso: true, corpo: corpoT });
    s.res = j.ok ? { casou: j.casou !== false, passos: (j.passos || []).map(pn), msg: j.msg } : { erro: j.msg || 'Não foi possível simular.' };
    const d = ZZ.$('#simRes', E.ov); if (d) { d.innerHTML = simHtml(s.res); d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    return j.ok === true;
  }
  const pn = x => ({ st: x.ok === false ? 'no' : /^Ação|^Atraso/i.test(x.etapa || '') ? 'acao' : x.ok === true ? 'ok' : 'info', t: (x.etapa ? x.etapa + ': ' : '') + (x.detalhe || '') });
  const simHtml = r => r.erro ? `<div class="au-simres au-nao"><div class="au-simres-h"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(r.erro)}</div></div>`
    : `<div class="au-simres ${r.casou ? 'au-casou' : 'au-nao'}"><div class="au-simres-h"><i class="fa-solid ${r.casou ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${r.casou ? 'A automação dispararia' : 'A automação não dispararia'}</div>
    <ol>${r.passos.map(p => `<li class="au-p-${p.st}"><i class="fa-solid ${{ ok: 'fa-check', no: 'fa-xmark', acao: 'fa-arrow-right', info: 'fa-circle-info' }[p.st] || 'fa-circle-info'}"></i><span>${esc(p.t).replace(/\n/g, '<br>')}</span></li>`).join('')}</ol><small class="mut">Simulação: nada foi enviado.</small></div>`;

  async function salvar(btn) {
    const E = S.ed; for (const p of [0, 1, 2]) if (!valida(p)) { irPasso(p); setTimeout(() => valida(p), 80); return; }
    await ZZ.busy(btn, async () => {
      const j = await ZZ.api('salvar_automacao', { corpo: paraServidor(E.a) });
      if (!j.ok) return j;
      let aviso = '';
      if (E.a.ativa !== E.a._orig.ativa || E.a.modo !== E.a._orig.modo) {
        const r = await ZZ.api('ativar_automacao', { corpo: { id: j.id, ativa: E.a.ativa, modo: E.a.modo } });
        if (!r.ok) { ZZ.toast('Salvou, mas não conseguiu ligar/mudar o modo. Ajuste na lista.', 'err'); } else if (r.webhook_ligado === false) aviso = ' O recebimento em tempo real está desligado.';
      }
      ZZ.toast('Automação salva.' + aviso, aviso ? 'err' : 'ok'); fecharEd(true); return j;
    });
  }

  /* ---------- ciclo ---------- */
  carregarWh(); carregar();
  ZZ.poll(() => {
    S.tick++; if (S.ed) return;
    if (S.aba === 'logs') carregarLogs();
    else if (S.tick % 3 === 0) { carregar(); carregarWh(); }
  }, 5000);
  el._auDestroy = () => { morto = true; if (S.ed) { S.ed.ov.remove(); document.body.classList.remove('au-trava'); S.ed = null; } };
  window.__auDestroy = el._auDestroy;
}, destroy() { if (window.__auDestroy) { window.__auDestroy(); window.__auDestroy = null; } } });
