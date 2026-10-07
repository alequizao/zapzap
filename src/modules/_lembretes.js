/* "Me lembre de responder": componente ZZ.lembrete.abrir(jid, nome) + página "Lembretes". Dono: núcleo. */
(function () {
  'use strict';
  const ZZ = window.ZZ; if (!ZZ) return;
  const fmt = ts => { const d = new Date(ts * 1000), h = new Date(); const mesmo = d.toDateString() === h.toDateString(); const amanha = new Date(h.getTime() + 864e5).toDateString() === d.toDateString();
    return (mesmo ? 'Hoje' : amanha ? 'Amanhã' : ZZ.fmtData(ts)) + ' ' + ZZ.fmtHora(ts); };
  const em = min => Math.floor(Date.now() / 1000) + min * 60;
  const hoje = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return Math.floor(d / 1000); };
  const amanha9 = () => { const d = new Date(Date.now() + 864e5); d.setHours(9, 0, 0, 0); return Math.floor(d / 1000); };
  const PRE = [['15 min', () => em(15)], ['30 min', () => em(30)], ['1 hora', () => em(60)], ['2 horas', () => em(120)], ['4 horas', () => em(240)], ['Hoje 18h', () => hoje(18)], ['Amanhã 9h', amanha9]];

  ZZ.lembrete = {
    /** Abre a folha "Me lembrar de responder". aoCriar(opcional) recebe {id,quando}. */
    abrir(jid, nome, aoCriar) {
      let quando = 0;
      const m = ZZ.modal(`<h3><i class="fa-regular fa-clock"></i> Me lembrar de responder</h3>
        <p class="mut" style="margin:0 0 10px">${ZZ.esc(nome || jid)} — você será avisado com som e vibração, só se ainda não tiver respondido.</p>
        <div class="lb-pres">${PRE.map((p, i) => `<button class="lb-chip" data-i="${i}">${p[0]}</button>`).join('')}<button class="lb-chip" data-p>Escolher…</button></div>
        <div id="lbData" hidden><label for="lbDt">Data e hora</label><input id="lbDt" type="datetime-local"></div>
        <label for="lbNota">Anotação (opcional)</label><input id="lbNota" type="text" maxlength="200" placeholder="Ex.: enviar orçamento">
        <div class="msg-campo" id="lbErro"></div><div class="lb-res" id="lbRes" hidden></div>
        <div class="acoes"><button class="btn-soft" data-f>Cancelar</button><button class="btn-azul" data-ok disabled><i class="fa-solid fa-bell"></i> Criar lembrete</button></div>`);
      const $ = s => m.el.querySelector(s), ok = $('[data-ok]');
      const marca = el => { m.el.querySelectorAll('.lb-chip').forEach(x => x.classList.toggle('sel', x === el)); ok.disabled = !quando; $('#lbRes').hidden = !quando; if (quando) $('#lbRes').innerHTML = `<i class="fa-solid fa-bell"></i> Aviso <b>${fmt(quando)}</b>`; ZZ.vibrar(8); };
      m.el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { quando = PRE[+b.dataset.i][1](); $('#lbData').hidden = true; marca(b); });
      $('[data-p]').onclick = e => { $('#lbData').hidden = false; const d = new Date(Date.now() + 36e5); d.setMinutes(0, 0, 0); const p = n => String(n).padStart(2, '0'); $('#lbDt').value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; quando = Math.floor(d / 1000); marca(e.currentTarget); };
      $('#lbDt').onchange = e => { const t = Math.floor(new Date(e.target.value).getTime() / 1000); quando = isNaN(t) ? 0 : t; marca($('[data-p]')); };
      $('[data-f]').onclick = () => m.fechar();
      ok.onclick = () => ZZ.busy(ok, async () => {
        $('#lbErro').textContent = ''; if (quando < Math.floor(Date.now() / 1000) + 30) { $('#lbErro').textContent = 'Escolha um horário no futuro.'; $('#lbDt').classList.add('erro-campo'); return false; }
        const r = await ZZ.api('criar_lembrete', { corpo: { jid, nome: nome || '', quando, nota: $('#lbNota').value.trim() } });
        if (r.ok) { ZZ.toast('Lembrete criado para ' + fmt(quando), 'ok'); m.fechar(); aoCriar && aoCriar(r); document.dispatchEvent(new CustomEvent('zz:lembretes')); }
        return r;
      });
    },
  };

  ZZ.pagina({ id: 'lembretes', titulo: 'Lembretes', icone: 'fa-bell-concierge', ordem: 2.6, perm: ['conversas.ver', 'filas.ver', 'filas.atender'], render(el) {
    let aba = 'pendente', sig = '';
    el.innerHTML = `<div class="card-soft"><div class="ch"><i class="fa-solid fa-bell-concierge"></i> Meus lembretes <span class="vivo" style="margin-left:auto">ao vivo</span></div>
      <div class="lb-abas"><button class="ativo" data-a="pendente">Pendentes <b id="lbN1"></b></button><button data-a="disparado">Avisados</button><button data-a="respondido">Respondidos</button><button data-a="cancelado">Cancelados</button></div>
      <div id="lbLista">${ZZ.skeleton(3)}</div></div>`;
    el.querySelectorAll('.lb-abas button').forEach(b => b.onclick = () => { el.querySelectorAll('.lb-abas button').forEach(x => x.classList.remove('ativo')); b.classList.add('ativo'); aba = b.dataset.a; sig = ''; carregar(); });
    const carregar = async () => {
      const j = await ZZ.api('listar_lembretes', { params: { status: aba }, silencioso: true }); const box = el.querySelector('#lbLista'); if (!box) return;
      if (!j.ok) { box.innerHTML = '<div class="vazio"><i class="fa-solid fa-triangle-exclamation"></i>Não foi possível carregar.<br><button class="btn-soft btn-sm" id="lbT">Tentar de novo</button></div>'; el.querySelector('#lbT').onclick = e => ZZ.busy(e.currentTarget, carregar); return; }
      el.querySelector('#lbN1').textContent = (j.contagem && j.contagem.pendente) || ''; ZZ.badge('lembretes', (j.contagem && j.contagem.pendente) || 0);
      const s = JSON.stringify(j.itens) + aba; if (s === sig) return; sig = s;
      if (!j.itens.length) { box.innerHTML = '<div class="vazio"><i class="fa-regular fa-bell-slash"></i>Nenhum lembrete aqui.<br><span class="mut">Abra uma conversa e toque em "Lembrar" para criar.</span></div>'; return; }
      box.innerHTML = j.itens.map(i => { const falta = i.quando - j.agora; const atras = i.status === 'pendente' && falta < 0;
        return `<article class="lb-card ${atras ? 'atras' : ''}"><span class="avatar">${ZZ.esc(ZZ.iniciais(i.nome || i.jid))}</span><div class="lb-corpo"><b>${ZZ.esc(i.nome || i.jid.replace(/@.*/, ''))}</b><small>${i.nota ? ZZ.esc(i.nota) : 'Responder esta conversa'}</small><span class="badge-status ${i.status === 'pendente' ? 'b-pend' : i.status === 'disparado' ? 'b-info' : i.status === 'respondido' ? 'b-ok' : 'b-err'}"><i class="fa-regular fa-clock"></i> ${fmt(i.quando)}</span></div>
          <div class="lb-acoes"><button class="btn-soft btn-sm" data-ab="${i.id}" data-j="${ZZ.esc(i.jid)}"><i class="fa-solid fa-comments"></i></button>${i.status === 'pendente' || i.status === 'disparado' ? `<button class="btn-soft btn-sm" data-ad="${i.id}" title="Adiar 1 hora"><i class="fa-solid fa-hourglass-half"></i></button><button class="btn-soft btn-sm" data-ok="${i.id}" title="Já respondi"><i class="fa-solid fa-check"></i></button><button class="btn-perigo btn-sm" data-ca="${i.id}" title="Cancelar"><i class="fa-solid fa-xmark"></i></button>` : ''}</div></article>`; }).join('');
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ab) ZZ.ir('conversas', { jid: b.dataset.j });
      else if (b.dataset.ad) ZZ.busy(b, async () => { const r = await ZZ.api('adiar_lembrete', { corpo: { id: +b.dataset.ad, minutos: 60 } }); if (r.ok) { ZZ.toast('Adiado em 1 hora', 'ok'); sig = ''; carregar(); } return r; });
      else if (b.dataset.ok) ZZ.busy(b, async () => { const r = await ZZ.api('concluir_lembrete', { corpo: { id: +b.dataset.ok } }); if (r.ok) { ZZ.toast('Marcado como respondido', 'ok'); sig = ''; carregar(); } return r; });
      else if (b.dataset.ca) ZZ.confirmar('Cancelar este lembrete?', 'Cancelar lembrete', true).then(s => { if (s) ZZ.busy(b, async () => { const r = await ZZ.api('cancelar_lembrete', { corpo: { id: +b.dataset.ca } }); if (r.ok) { ZZ.toast('Lembrete cancelado', 'ok'); sig = ''; carregar(); } return r; }); });
    });
    ZZ.poll(carregar, 10000); carregar(); document.addEventListener('zz:lembretes', () => { sig = ''; carregar(); });
  } });
})();
