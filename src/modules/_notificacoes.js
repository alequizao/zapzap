/* Centro de notificações — sino, banners, som, vibração, não perturbe, notificação do navegador. Dono: núcleo.
   API pública: ZZ.notif.mostrar({tipo,titulo,texto,rota,jid,instancia}), ZZ.notif.testar(), ZZ.notif.abrirCentral(), ZZ.notif.abrirPreferencias(). */
(function () {
  'use strict';
  const ZZ = window.ZZ; if (!ZZ) return;
  const N = ZZ.notif = {};
  const TIPOS = {
    mensagem: { nome: 'Mensagens', icone: 'fa-comment-dots', cor: '#25D366', bg: '#e6f7ee', tom: null, vib: [60, 40, 60] },
    atendimento: { nome: 'Atendimento', icone: 'fa-headset', cor: '#2563EB', bg: '#e7f0ff', tom: 'sino', vib: [90, 50, 90, 50, 140] },
    agenda: { nome: 'Agendamentos', icone: 'fa-clock', cor: '#c47f12', bg: '#fff4e0', tom: 'suave', vib: [50] },
    campanha: { nome: 'Campanhas', icone: 'fa-bullhorn', cor: '#6a4cff', bg: '#f0eefe', tom: 'suave', vib: [50, 40, 50] },
    conexao: { nome: 'Conexão', icone: 'fa-plug-circle-exclamation', cor: '#d9433a', bg: '#fdecec', tom: 'alerta', vib: [220, 100, 220, 100, 220] },
    automacao: { nome: 'Automações', icone: 'fa-wand-magic-sparkles', cor: '#0ea5a4', bg: '#e0f7f7', tom: 'gota', vib: [40] },
    sistema: { nome: 'Sistema', icone: 'fa-circle-info', cor: '#64748b', bg: '#f1f5f9', tom: 'suave', vib: [40] },
  };
  const TONS = { sino: 'Sino', gota: 'Gota', suave: 'Suave', pulso: 'Pulso', alerta: 'Alerta' };
  const PADRAO = { som: true, volume: 0.7, tom: 'sino', vibrar: true, desktop: false, nao_perturbe: false, dnd_ini: '22:00', dnd_fim: '07:00', tipos: { mensagem: true, atendimento: true, agenda: true, campanha: true, conexao: true, automacao: true, sistema: true } };
  let prefs = JSON.parse(JSON.stringify(PADRAO));
  try { const s = JSON.parse(localStorage.getItem('zz_notif_prefs') || 'null'); if (s) { prefs = Object.assign(prefs, s); prefs.tipos = Object.assign({}, PADRAO.tipos, s.tipos || {}); } } catch (e) { }
  const salvar = () => { try { localStorage.setItem('zz_notif_prefs', JSON.stringify(prefs)); } catch (e) { } };
  N.prefs = () => prefs;

  /* ---------- som (WebAudio, sem arquivos) ---------- */
  let ac = null;
  const audio = () => { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } return ac; };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => audio(), { once: true, passive: true }));
  const nota = (c, freq, ini, dur, tipo, vol) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = tipo; o.frequency.setValueAtTime(freq, c.currentTime + ini);
    g.gain.setValueAtTime(0.0001, c.currentTime + ini); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), c.currentTime + ini + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ini + dur); o.connect(g); g.connect(c.destination); o.start(c.currentTime + ini); o.stop(c.currentTime + ini + dur + 0.03);
  };
  N.tocar = (tom, vol) => {
    const c = audio(); if (!c) return; const v = (vol == null ? prefs.volume : vol) * 0.5;
    switch (tom) {
      case 'gota': nota(c, 740, 0, 0.18, 'sine', v); nota(c, 988, 0.05, 0.22, 'sine', v * 0.6); break;
      case 'suave': nota(c, 523, 0, 0.35, 'triangle', v); nota(c, 659, 0.08, 0.35, 'triangle', v * 0.8); nota(c, 784, 0.16, 0.45, 'triangle', v * 0.6); break;
      case 'pulso': nota(c, 600, 0, 0.12, 'square', v * 0.35); nota(c, 600, 0.18, 0.12, 'square', v * 0.35); break;
      case 'alerta': nota(c, 440, 0, 0.16, 'sawtooth', v * 0.4); nota(c, 330, 0.2, 0.16, 'sawtooth', v * 0.4); nota(c, 440, 0.4, 0.24, 'sawtooth', v * 0.4); break;
      default: nota(c, 880, 0, 0.28, 'sine', v); nota(c, 1318, 0.12, 0.5, 'sine', v * 0.8); // sino
    }
  };
  const vibrar = p => { if (prefs.vibrar) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } } };

  /* ---------- não perturbe ---------- */
  const emDnd = () => {
    if (!prefs.nao_perturbe) return false;
    const agora = new Date(), m = agora.getHours() * 60 + agora.getMinutes();
    const mm = s => { const [h, mi] = String(s).split(':').map(Number); return (h || 0) * 60 + (mi || 0); };
    const a = mm(prefs.dnd_ini), b = mm(prefs.dnd_fim);
    return a <= b ? (m >= a && m < b) : (m >= a || m < b);
  };

  /* ---------- banners ---------- */
  const caixa = () => { let c = document.getElementById('nbBanners'); if (!c) { c = document.createElement('div'); c.id = 'nbBanners'; c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); } return c; };
  const ir = it => {
    const go = () => { if (it.rota) location.hash = '#/' + it.rota; };
    if (it.instancia && ZZ.instancia && it.instancia !== ZZ.instancia && ZZ.trocarInstancia) { ZZ.trocarInstancia(it.instancia); setTimeout(go, 80); } else go();
  };
  N.mostrar = (it, silencioso) => {
    const t = TIPOS[it.tipo] || TIPOS.sistema;
    if (prefs.tipos[it.tipo] === false) return;
    const dnd = emDnd();
    if (!silencioso && !dnd) { if (prefs.som) N.tocar(t.tom || prefs.tom); vibrar(t.vib); }
    if (!dnd && prefs.desktop && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { const n = new Notification(it.titulo, { body: it.texto || '', tag: 'zz-' + (it.id || Date.now()), icon: 'icon-192.png?v=' + ZZ.v }); n.onclick = () => { window.focus(); ir(it); n.close(); }; } catch (e) { }
    }
    if (document.hidden) return;
    const c = caixa(); while (c.children.length >= 3) c.firstChild.remove();
    const el = document.createElement('div'); el.className = 'nb-card'; el.style.setProperty('--nb-cor', t.cor); el.style.setProperty('--nb-bg', t.bg);
    el.innerHTML = `<span class="nb-ic"><i class="fa-solid ${t.icone}"></i></span><span class="nb-txt"><b>${ZZ.esc(it.titulo)}</b><small>${ZZ.esc(it.texto || '')}</small></span><span class="nb-t">agora</span><button class="nb-x" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button><i class="nb-prog"></i>`;
    const fechar = () => { el.classList.add('saindo'); setTimeout(() => el.remove(), 220); };
    el.querySelector('.nb-x').onclick = e => { e.stopPropagation(); fechar(); };
    el.onclick = () => { fechar(); ir(it); };
    let x0 = null; // deslizar para dispensar
    el.addEventListener('pointerdown', e => { x0 = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (x0 !== null) { const d = e.clientX - x0; el.style.transform = `translateX(${d}px)`; el.style.opacity = String(1 - Math.min(1, Math.abs(d) / 220)); } });
    el.addEventListener('pointerup', e => { if (x0 === null) return; const d = e.clientX - x0; x0 = null; if (Math.abs(d) > 90) { el.style.transform = `translateX(${d > 0 ? 400 : -400}px)`; setTimeout(() => el.remove(), 180); } else { el.style.transform = ''; el.style.opacity = ''; } });
    c.appendChild(el); setTimeout(() => { if (el.isConnected) fechar(); }, 6500);
  };
  N.testar = () => { N.mostrar({ id: 'teste' + Date.now(), tipo: 'mensagem', titulo: 'Maria (exemplo)', texto: 'Olá! Esta é uma notificação de teste do ZapZap.', rota: 'painel' }); };

  /* ---------- sino, título e selo do app ---------- */
  let naoVistas = 0, ultimoId = 0, visto = 0, titulo0 = '';
  const aplicarTitulo = () => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, ''); titulo0 = base; const novo = (naoVistas > 0 ? `(${naoVistas > 99 ? '99+' : naoVistas}) ` : '') + base;
    if (document.title !== novo) document.title = novo;
  };
  const setBadge = n => {
    naoVistas = n; const b = document.getElementById('sinoN');
    if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); if (n) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } }
    const s = document.getElementById('sino'); if (s) s.classList.toggle('toca', n > 0);
    aplicarTitulo(); try { if (navigator.setAppBadge) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) { }
  };
  try { new MutationObserver(() => aplicarTitulo()).observe(document.querySelector('title'), { childList: true }); } catch (e) { }

  /* ---------- polling ---------- */
  let primeira = true, timer = null;
  const buscar = async () => {
    const j = await ZZ.api('ver_notificacoes', { params: { desde: String(ultimoId) }, silencioso: true });
    if (!j.ok) return;
    visto = j.visto_ate || 0;
    if (j.inicial || primeira) { primeira = false; ultimoId = j.ultimo_id || 0; setBadge(j.nao_vistas || 0); return; }
    if (j.itens && j.itens.length) {
      const hash = location.hash;
      j.itens.forEach(it => {
        const p = new URLSearchParams((hash.split('?')[1] || '')); const nessaConversa = hash.startsWith('#/conversas') && it.jid && p.get('jid') === it.jid && !document.hidden;
        N.mostrar(it, nessaConversa);
      });
      ultimoId = j.itens[j.itens.length - 1].id > ultimoId ? j.itens[j.itens.length - 1].id : ultimoId;
      ZZ.vibrar && 0;
    }
    ultimoId = Math.max(ultimoId, j.ultimo_id || 0); setBadge(j.nao_vistas || 0);
    document.dispatchEvent(new CustomEvent('zz:notificacoes', { detail: j }));
  };
  const agendar = () => { clearTimeout(timer); timer = setTimeout(async () => { try { await buscar(); } catch (e) { } agendar(); }, document.hidden ? 20000 : 4000); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { buscar(); agendar(); } });

  /* ---------- central ---------- */
  N.abrirCentral = async () => {
    const m = ZZ.modal(`<div class="nc-cab"><h3><i class="fa-regular fa-bell"></i> Notificações</h3><button class="btn-soft btn-sm" data-pref aria-label="Preferências"><i class="fa-solid fa-sliders"></i></button></div>
      <div class="nc-abas"><button class="ativo" data-f="">Todas</button><button data-f="mensagem">Mensagens</button><button data-f="alertas">Alertas</button></div>
      <div class="nc-lista" id="ncLista">${ZZ.skeleton(4)}</div>
      <div class="acoes"><button class="btn-soft" data-fecha>Fechar</button><button class="btn-azul" data-vistas><i class="fa-solid fa-check-double"></i> Marcar tudo como visto</button></div>`);
    m.el.querySelector('[data-fecha]').onclick = () => m.fechar();
    m.el.querySelector('[data-pref]').onclick = () => { m.fechar(); N.abrirPreferencias(); };
    let itens = [], filtro = '';
    const pintar = () => {
      const l = m.el.querySelector('#ncLista'); const f = itens.filter(i => !filtro || (filtro === 'alertas' ? !['mensagem'].includes(i.tipo) : i.tipo === filtro));
      if (!f.length) { l.innerHTML = '<div class="vazio"><i class="fa-regular fa-bell-slash"></i>Nada por aqui ainda.</div>'; return; }
      const multi = (ZZ.instancias || []).length > 1;
      l.innerHTML = f.map(i => { const t = TIPOS[i.tipo] || TIPOS.sistema; const nova = i.id > visto;
        return `<button class="nc-item ${nova ? 'nova' : ''}" data-i="${i.id}"><span class="nb-ic" style="--nb-cor:${t.cor};--nb-bg:${t.bg}"><i class="fa-solid ${t.icone}"></i></span><span class="nb-txt"><b>${ZZ.esc(i.titulo)}</b><small>${ZZ.esc(i.texto || '')}</small>${multi ? `<em>${ZZ.esc(i.conexao)}</em>` : ''}</span><span class="nc-t">${ZZ.fmtRel(i.ts)}</span>${nova ? '<i class="nc-dot"></i>' : ''}</button>`; }).join('');
      l.querySelectorAll('.nc-item').forEach(b => b.onclick = () => { const it = itens.find(x => x.id == b.dataset.i); m.fechar(); if (it) ir(it); });
    };
    m.el.querySelectorAll('.nc-abas button').forEach(b => b.onclick = () => { m.el.querySelectorAll('.nc-abas button').forEach(x => x.classList.remove('ativo')); b.classList.add('ativo'); filtro = b.dataset.f; pintar(); });
    m.el.querySelector('[data-vistas]').onclick = e => ZZ.busy(e.currentTarget, async () => { const r = await ZZ.api('marcar_notificacoes_vistas', { corpo: { ate_id: ultimoId } }); if (r.ok) { visto = ultimoId; setBadge(0); pintar(); ZZ.toast('Tudo marcado como visto', 'ok'); } return r; });
    const j = await ZZ.api('ver_central', { silencioso: true });
    itens = j.ok ? j.itens : []; visto = j.visto_ate || visto; pintar();
    if (j.ok && itens.length) { ZZ.api('marcar_notificacoes_vistas', { corpo: { ate_id: ultimoId } }, true).then(() => { }); setTimeout(() => { setBadge(0); }, 1200); }
  };

  /* ---------- preferências ---------- */
  N.abrirPreferencias = () => {
    const sw = (id, rot, on) => `<label class="np-sw"><span>${rot}</span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label>`;
    const m = ZZ.modal(`<h3><i class="fa-solid fa-sliders"></i> Preferências de notificação</h3>
      ${sw('npSom', 'Efeito sonoro', prefs.som)}
      <div class="np-linha"><span>Volume</span><input type="range" id="npVol" min="0" max="1" step="0.05" value="${prefs.volume}"></div>
      <div class="np-tons">${Object.entries(TONS).map(([k, v]) => `<button class="np-tom ${prefs.tom === k ? 'sel' : ''}" data-t="${k}"><i class="fa-solid fa-play"></i> ${v}</button>`).join('')}</div>
      ${sw('npVib', 'Vibração (celulares compatíveis)', prefs.vibrar)}
      ${'Notification' in window ? sw('npDesk', 'Notificação do navegador (com a aba em segundo plano)', prefs.desktop && Notification.permission === 'granted') : ''}
      ${sw('npDnd', 'Não perturbe', prefs.nao_perturbe)}
      <div class="np-linha" id="npDndH" ${prefs.nao_perturbe ? '' : 'hidden'}><span>Das</span><input type="time" id="npIni" value="${prefs.dnd_ini}"><span>até</span><input type="time" id="npFim" value="${prefs.dnd_fim}"></div>
      <h4>Avisar sobre</h4><div class="np-tipos">${Object.entries(TIPOS).map(([k, t]) => `<label class="np-chip"><input type="checkbox" data-tp="${k}" ${prefs.tipos[k] !== false ? 'checked' : ''}><span><i class="fa-solid ${t.icone}" style="color:${t.cor}"></i> ${t.nome}</span></label>`).join('')}</div>
      <p class="mut np-nota">Dica: no iPhone a vibração não é liberada pelo navegador; o som segue a chave de silencioso do aparelho.</p>
      <div class="acoes"><button class="btn-soft" data-teste><i class="fa-solid fa-bell"></i> Testar</button><button class="btn-azul" data-ok>Pronto</button></div>`);
    const $ = s => m.el.querySelector(s);
    $('#npSom').onchange = e => { prefs.som = e.target.checked; salvar(); };
    $('#npVol').oninput = e => { prefs.volume = +e.target.value; salvar(); };
    $('#npVol').onchange = () => N.tocar(prefs.tom);
    m.el.querySelectorAll('.np-tom').forEach(b => b.onclick = () => { prefs.tom = b.dataset.t; salvar(); m.el.querySelectorAll('.np-tom').forEach(x => x.classList.toggle('sel', x === b)); N.tocar(prefs.tom); });
    $('#npVib').onchange = e => { prefs.vibrar = e.target.checked; salvar(); if (prefs.vibrar) vibrar([60, 40, 60]); };
    if ($('#npDesk')) $('#npDesk').onchange = async e => {
      if (e.target.checked) { const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); prefs.desktop = p === 'granted'; e.target.checked = prefs.desktop; if (!prefs.desktop) ZZ.toast('O navegador bloqueou as notificações. Libere nas configurações do site.', 'err'); else ZZ.toast('Notificações do navegador ativadas', 'ok'); }
      else prefs.desktop = false; salvar();
    };
    $('#npDnd').onchange = e => { prefs.nao_perturbe = e.target.checked; $('#npDndH').hidden = !e.target.checked; salvar(); };
    $('#npIni').onchange = e => { prefs.dnd_ini = e.target.value; salvar(); }; $('#npFim').onchange = e => { prefs.dnd_fim = e.target.value; salvar(); };
    m.el.querySelectorAll('[data-tp]').forEach(c => c.onchange = () => { prefs.tipos[c.dataset.tp] = c.checked; salvar(); });
    $('[data-teste]').onclick = () => N.testar(); $('[data-ok]').onclick = () => m.fechar();
    document.dispatchEvent(new CustomEvent('zz:notif-prefs', { detail: { el: m.el, prefs, salvar } })); // gancho: o módulo de push encaixa aqui o botão "Ativar no aparelho"
  };

  /* ---------- montagem: sino no topo ---------- */
  (ZZ.hooksMontar = ZZ.hooksMontar || []).push(() => {
    const topo = document.querySelector('.topo'); if (!topo || document.getElementById('sino')) return;
    const b = document.createElement('button'); b.id = 'sino'; b.className = 'sino'; b.setAttribute('aria-label', 'Notificações');
    b.innerHTML = '<i class="fa-regular fa-bell"></i><span class="sino-n" id="sinoN" hidden></span>';
    const ref = document.getElementById('cxSel'); topo.insertBefore(b, ref || document.getElementById('conexao'));
    b.onclick = () => { ZZ.vibrar(8); N.abrirCentral(); };
    buscar().then(agendar);
  });
})();
