/* ZapZap — módulo Contatos: busca, lista com rolagem infinita, verificador de número. */
(function () {
  'use strict';
  const ZZ = window.ZZ;
  let ctl = null, obs = null, ro = null;

  const CORES = ['#2563EB', '#7c3aed', '#db2777', '#ea580c', '#0d9488', '#16a34a', '#ca8a04', '#dc2626', '#0891b2', '#4f46e5'];
  const cor = s => { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return CORES[h % CORES.length]; };
  const letra = n => { const c = String(n || '#').trim().charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };

  function avatar(c) {
    const ini = ZZ.esc(ZZ.iniciais(c.nome));
    const fallback = `<span class="avatar ct-av" style="background:${cor(c.jid)};color:#fff">${ini}</span>`;
    if (!c.foto) return fallback;
    return `<span class="ct-avw"><span class="avatar ct-av" style="background:${cor(c.jid)};color:#fff">${ini}</span><img class="avatar ct-av ct-foto" src="${ZZ.esc(c.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
  }

  function cartao(c) {
    const num = c.numero ? ZZ.fmtNumero(c.numero) : '';
    const dest = c.numero || c.jid;
    return `<div class="ct-item" data-jid="${ZZ.esc(c.jid)}">
      ${avatar(c)}
      <div class="ct-info"><div class="ct-nome">${ZZ.esc(c.nome || num || 'Sem nome')}</div><div class="ct-num mut">${ZZ.esc(c.grupo ? 'Grupo' : num)}</div></div>
      <div class="ct-acoes">
        ${ZZ.pode('conversas.ver') ? `<button class="btn-azul btn-sm ct-bt" data-conv="${ZZ.esc(c.jid)}"><i class="fa-solid fa-comments"></i> Conversar</button>` : ''}
        ${ZZ.pode(['enviar.texto', 'enviar.midia', 'enviar.enquete', 'enviar.localizacao', 'enviar.contato']) ? `<button class="btn-soft btn-sm ct-bt" data-env="${ZZ.esc(dest)}"><i class="fa-solid fa-paper-plane"></i> Enviar</button>` : ''}
      </div></div>`;
  }

  ZZ.pagina({
    id: 'contatos', titulo: 'Contatos', icone: 'fa-address-book', ordem: 5, tab: false,
    render(el) {
      el.innerHTML = `
      <div class="ct-busca" id="ctBusca">
        <div class="ct-campo"><i class="fa-solid fa-magnifying-glass"></i>
          <input type="search" id="ctQ" placeholder="Buscar por nome ou número" autocomplete="off" enterkeyhint="search">
          <button class="ct-limpar" id="ctLimpar" aria-label="Limpar busca" hidden><i class="fa-solid fa-xmark"></i></button></div>
        <div class="ct-barra"><span class="ct-total mut" id="ctTotal"><i class="fa-solid fa-address-book"></i> Carregando…</span>
          <button class="btn-soft btn-sm" id="ctAtual"><i class="fa-solid fa-rotate"></i> Atualizar lista</button></div>
      </div>
      <div class="card-soft ct-verif" ${ZZ.pode('enviar.verificar') ? '' : 'hidden'}>
        <div class="ch"><i class="fa-brands fa-whatsapp"></i> Verificar número</div>
        <div class="ct-vlinha"><input type="tel" id="ctNum" placeholder="Ex.: 82 99999-9999" inputmode="tel" autocomplete="off"><button class="btn-azul" id="ctVer"><i class="fa-solid fa-check-double"></i> Verificar</button></div>
        <div id="ctMsgNum"></div><div id="ctRes"></div>
      </div>
      <div class="ct-wrap"><div id="ctLista"></div><div id="ctSentinela" class="ct-sent"></div><nav class="ct-indice" id="ctInd" aria-label="Índice alfabético"></nav></div>`;

      const $ = s => ZZ.$(s, el);
      const lista = $('#ctLista'), q = $('#ctQ');
      let pag = 0, paginas = 1, carregando = false, termo = '', total = 0, letras = new Set(), ultimaLetra = '', erro = false;

      // altura do cabeçalho fixo (sticky abaixo do topo)
      const topo = ZZ.$('.topo');
      const ajustaTopo = () => el.style.setProperty('--ct-topo', (topo ? topo.offsetHeight : 0) + 'px');
      ajustaTopo(); if (window.ResizeObserver && topo) { ro = new ResizeObserver(ajustaTopo); ro.observe(topo); }

      const atualizaTotal = () => {
        $('#ctTotal').innerHTML = `<i class="fa-solid fa-address-book"></i> <b>${total.toLocaleString('pt-BR')}</b> ${total === 1 ? 'contato' : 'contatos'}${termo ? ' encontrados' : ''}`;
      };
      const montaIndice = () => {
        const ind = $('#ctInd');
        if (termo) { ind.innerHTML = ''; return; }
        ind.innerHTML = [...letras].sort().map(l => `<button data-l="${l}" aria-label="Ir para ${l}">${l}</button>`).join('');
      };
      const esqueleto = () => { lista.innerHTML = ZZ.skeleton(6); };
      const mostraErro = (msg, comTentar = true) => {
        erro = true;
        const caixa = document.createElement('div'); caixa.className = 'card-soft vazio ct-erro';
        caixa.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><div>${ZZ.esc(msg || 'Não foi possível carregar os contatos.')}</div>${comTentar ? '<button class="btn-azul" style="margin-top:12px"><i class="fa-solid fa-rotate-right"></i> Tentar de novo</button>' : ''}`;
        const b = ZZ.$('button', caixa); if (b) b.onclick = () => { caixa.remove(); erro = false; if (pag === 0) carrega(true); else carrega(false); };
        lista.appendChild(caixa);
      };

      async function carrega(zerar, atualizar) {
        if (carregando && !zerar) return;
        if (ctl) ctl.abort();
        ctl = new AbortController(); const meu = ctl;
        carregando = true; erro = false;
        if (zerar) { pag = 0; paginas = 1; letras = new Set(); ultimaLetra = ''; esqueleto(); montaIndice(); }
        else lista.insertAdjacentHTML('beforeend', '<div class="ct-mais">' + ZZ.skeleton(2) + '</div>');
        const params = { q: termo, pag: pag + 1, grupos: 0 };
        if (atualizar) params.atualizar = 1;
        const j = await ZZ.api('contatos', { params, signal: meu.signal, silencioso: true });
        if (j.abortado || meu !== ctl) return;
        carregando = false;
        ZZ.$$('.ct-mais', lista).forEach(x => x.remove());
        if (zerar) lista.innerHTML = '';
        if (!j.ok) { mostraErro(j.sem_permissao ? 'Você não tem permissão para ver os contatos.' : j.sem_conexao ? 'Nenhuma conexão (WhatsApp) liberada para o seu usuário.' : j.msg, !j.sem_permissao); return j; }
        pag = j.pag || pag + 1; paginas = j.paginas || 1; total = j.total || 0; atualizaTotal();
        const cs = j.contatos || [];
        if (!cs.length && pag <= 1) {
          lista.innerHTML = `<div class="vazio ct-vazio"><i class="fa-solid fa-user-slash"></i>${termo ? 'Nenhum contato encontrado para “' + ZZ.esc(termo) + '”.<br><span class="mut">Confira a grafia ou use “Verificar número”.</span>' : 'Nenhum contato por aqui ainda.<br><span class="mut">Toque em “Atualizar lista” para buscar do WhatsApp.</span>'}</div>`;
          montaIndice(); return j;
        }
        let html = '';
        for (const c of cs) {
          if (!termo) { const l = letra(c.nome); if (l !== ultimaLetra) { ultimaLetra = l; letras.add(l); html += `<div class="ct-letra" data-letra="${l}" id="ct-l-${l === '#' ? 'num' : l}">${l}</div>`; } }
          html += cartao(c);
        }
        lista.insertAdjacentHTML('beforeend', html);
        montaIndice();
        if (pag >= paginas) lista.insertAdjacentHTML('beforeend', '<div class="ct-fim mut">Fim da lista</div>');
        return j;
      }

      // rolagem infinita
      if ('IntersectionObserver' in window) {
        obs = new IntersectionObserver(es => { if (es[0].isIntersecting && !carregando && !erro && pag > 0 && pag < paginas) carrega(false); }, { rootMargin: '400px' });
        obs.observe($('#ctSentinela'));
      }

      // busca com debounce
      const buscar = ZZ.debounce(() => { termo = q.value.trim(); carrega(true); }, 300);
      q.addEventListener('input', () => { $('#ctLimpar').hidden = !q.value; buscar(); });
      q.addEventListener('focus', () => setTimeout(() => $('#ctBusca').scrollIntoView({ block: 'nearest' }), 250));
      $('#ctLimpar').onclick = () => { q.value = ''; $('#ctLimpar').hidden = true; termo = ''; carrega(true); q.focus(); };

      // atualizar lista
      $('#ctAtual').onclick = e => ZZ.busy(e.currentTarget, async () => {
        const j = await carrega(true, true);
        if (j && j.ok) { ZZ.toast('Lista atualizada: ' + (j.total || 0).toLocaleString('pt-BR') + ' contatos', 'ok'); return true; }
        ZZ.toast((j && j.msg) || 'Não foi possível atualizar a lista', 'err'); return false;
      });

      // ações da lista (delegação)
      lista.addEventListener('click', e => {
        const c = e.target.closest('[data-conv]'), v = e.target.closest('[data-env]');
        if (c) ZZ.ir('conversas', { jid: c.dataset.conv });
        else if (v) ZZ.ir('enviar', { para: v.dataset.env });
      });
      $('#ctInd').addEventListener('click', e => {
        const b = e.target.closest('[data-l]'); if (!b) return;
        const alvo = ZZ.$('[data-letra="' + b.dataset.l + '"]', lista);
        if (alvo) { ZZ.vibrar(8); const y = alvo.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(el).getPropertyValue('--ct-topo')) || 0) - 130; window.scrollTo({ top: y, behavior: 'smooth' }); }
      });

      // verificar número
      const num = $('#ctNum'), msgNum = $('#ctMsgNum'), res = $('#ctRes');
      const erroNum = t => { num.classList.toggle('erro-campo', !!t); msgNum.innerHTML = t ? `<div class="msg-campo">${ZZ.esc(t)}</div>` : ''; if (t) num.focus(); };
      num.addEventListener('input', () => erroNum(''));
      const verifica = btn => ZZ.busy(btn, async () => {
        const d = num.value.replace(/\D/g, '');
        if (d.length < 10) { erroNum('Digite o número com DDD, por exemplo 82 99999-9999.'); return false; }
        const n = (d.length <= 11) ? '55' + d : d;
        erroNum(''); res.innerHTML = '<div class="skel ct-skv"></div>';
        const j = await ZZ.api('verificar_numero', { corpo: { numeros: [n] } });
        if (!j.ok) { res.innerHTML = '<div class="ct-vres ct-nao"><i class="fa-solid fa-triangle-exclamation"></i><div>Não foi possível verificar agora. Tente de novo.</div></div>'; return false; }
        const r = (j.resultados || [])[0];
        if (!r || !r.existe) {
          res.innerHTML = `<div class="ct-vres ct-nao"><i class="fa-solid fa-circle-xmark"></i><div><b>${ZZ.esc(ZZ.fmtNumero(n))}</b><br>Este número não tem WhatsApp.</div></div>`;
          ZZ.toast('Número sem WhatsApp', 'err'); return true;
        }
        const jid = r.jid || n + '@s.whatsapp.net';
        res.innerHTML = `<div class="ct-vres ct-sim"><i class="fa-solid fa-circle-check"></i><div><b>${ZZ.esc(r.nome || ZZ.fmtNumero(r.numero || n))}</b><br><span class="mut">${ZZ.esc(ZZ.fmtNumero(r.numero || n))}</span><br>Tem WhatsApp.</div></div>
          <div class="ct-acoes ct-acoes-v">${ZZ.pode('conversas.ver') ? `<button class="btn-azul ct-bt" data-conv="${ZZ.esc(jid)}"><i class="fa-solid fa-comments"></i> Conversar</button>` : ''}${ZZ.pode(['enviar.texto', 'enviar.midia', 'enviar.enquete', 'enviar.localizacao', 'enviar.contato']) ? `<button class="btn-soft ct-bt" data-env="${ZZ.esc(r.numero || n)}"><i class="fa-solid fa-paper-plane"></i> Enviar</button>` : ''}</div>`;
        ZZ.toast('Este número tem WhatsApp', 'ok'); return true;
      });
      if ($('#ctVer')) { $('#ctVer').onclick = e => verifica(e.currentTarget);
      num.addEventListener('keydown', e => { if (e.key === 'Enter') verifica($('#ctVer')); }); }
      res.addEventListener('click', e => {
        const c = e.target.closest('[data-conv]'), v = e.target.closest('[data-env]');
        if (c) ZZ.ir('conversas', { jid: c.dataset.conv }); else if (v) ZZ.ir('enviar', { para: v.dataset.env });
      });

      carrega(true);
    },
    destroy() { if (ctl) ctl.abort(); ctl = null; if (obs) obs.disconnect(); obs = null; if (ro) ro.disconnect(); ro = null; }
  });
})();
