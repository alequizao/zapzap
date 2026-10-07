/* Notificações no aparelho (Web Push) — seção dentro das preferências de notificação. Dono: módulo Push. */
(function () {
  'use strict';
  const ZZ = window.ZZ; if (!ZZ) return;
  const suportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const b64uParaBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  const bytesParaB64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const prefsAtuais = () => { const p = (ZZ.notif && ZZ.notif.prefs && ZZ.notif.prefs()) || {}; return { tipos: p.tipos || {}, nao_perturbe: !!p.nao_perturbe, dnd_ini: p.dnd_ini, dnd_fim: p.dnd_fim }; };

  const flag = (v) => { try { if (v === undefined) return localStorage.getItem('zz_push_on') === '1'; v ? localStorage.setItem('zz_push_on', '1') : localStorage.removeItem('zz_push_on'); } catch (e) { return false; } };
  async function registro() { return navigator.serviceWorker.getRegistration('/zapzap/') || navigator.serviceWorker.ready; }
  async function assinaturaAtual() { const r = await registro(); return r ? r.pushManager.getSubscription() : null; }
  async function enviarAoServidor(sub) {
    const j = sub.toJSON();
    return ZZ.api('push_assinar', { corpo: { endpoint: j.endpoint, keys: j.keys, prefs: prefsAtuais() }, silencioso: true });
  }
  async function ativar() {
    if (Notification.permission === 'denied') throw new Error('As notificações estão bloqueadas neste navegador. Libere nas configurações do site.');
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permissão negada. Sem ela não dá para avisar com o app fechado.');
    const r = await registro(); if (!r) throw new Error('O app ainda está preparando o serviço de notificações. Tente de novo em instantes.');
    const k = await ZZ.api('ver_push_chave', { silencioso: true }); if (!k.ok) throw new Error(k.msg || 'Falha ao obter a chave.');
    let sub = await r.pushManager.getSubscription();
    if (sub) { // chave do servidor mudou? reassina
      const atual = sub.options && sub.options.applicationServerKey ? bytesParaB64u(sub.options.applicationServerKey) : k.chave;
      if (atual !== k.chave) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uParaBytes(k.chave) });
    const s = await enviarAoServidor(sub); if (!s.ok) throw new Error(s.msg || 'O servidor recusou a assinatura.');
    flag(true);
  }
  async function desativar() {
    const sub = await assinaturaAtual();
    flag(false);
    if (sub) { try { await ZZ.api('push_cancelar', { corpo: { endpoint: sub.endpoint }, silencioso: true }); } catch (e) { } await sub.unsubscribe(); }
  }
  async function estado() { // 'nao_suportado' | 'ios_instalar' | 'bloqueado' | 'ativo' | 'inativo'
    if (!suportado) return ios && !instalado ? 'ios_instalar' : 'nao_suportado';
    if (Notification.permission === 'denied') return 'bloqueado';
    const sub = await assinaturaAtual(); if (!sub || Notification.permission !== 'granted') return 'inativo';
    try { const r = await ZZ.api('ver_push_estado', { params: { h: await sha256(sub.endpoint) }, silencioso: true }); return r.ok && r.este_registrado ? 'ativo' : 'inativo'; } catch (e) { return 'ativo'; }
  }

  /* ---------- seção no modal de preferências ---------- */
  document.addEventListener('zz:notif-prefs', ev => {
    const { el, salvar } = ev.detail; if (!el || el.querySelector('.push-sec')) return;
    const sec = document.createElement('div'); sec.className = 'push-sec';
    sec.innerHTML = '<div class="push-tit"><i class="fa-solid fa-mobile-screen-button"></i> Notificações no aparelho</div><div class="push-corpo"><div class="push-est mut">Verificando…</div></div>';
    const ref = el.querySelector('[data-ok]'); const linha = ref && ref.parentNode; if (linha && linha.parentNode) linha.parentNode.insertBefore(sec, linha); else el.appendChild(sec);
    const corpo = sec.querySelector('.push-corpo'), E = ZZ.esc;
    const pintar = async () => {
      const st = await estado(); let h = '';
      const badge = (c, t) => `<div class="push-est"><span class="badge-status ${c}">${t}</span></div>`;
      if (st === 'nao_suportado') { h = badge('b-pausa', 'Não suportado') + '<p class="mut push-dica">Este navegador não permite notificações com o app fechado.</p>'; }
      else if (st === 'ios_instalar') { h = badge('b-pausa', 'Instale o app') + '<p class="mut push-dica">No iPhone/iPad (iOS 16.4 ou mais novo) as notificações só funcionam com o ZapZap instalado: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>; abra pelo ícone e volte aqui.</p>'; }
      else if (st === 'bloqueado') { h = badge('b-err', 'Bloqueado pelo navegador') + '<p class="mut push-dica">Libere as notificações deste site nas configurações do navegador (cadeado ao lado do endereço) e volte aqui.</p>'; }
      else if (st === 'ativo') { h = badge('b-ok', 'Ativado neste aparelho') + '<div class="push-bts"><button class="btn-acao btn-azul" data-pt><i class="fa-solid fa-bell"></i> Enviar teste</button><button class="btn-acao btn-soft" data-pd>Desativar</button></div>'; }
      else { h = badge('b-pend', 'Desativado neste aparelho') + '<button class="btn-acao btn-azul push-full" data-pa><i class="fa-solid fa-bell"></i> Ativar notificações no aparelho</button><p class="mut push-dica">Receba mensagens e avisos com som e vibração mesmo com o app fechado.</p>'; }
      corpo.innerHTML = h;
      const a = corpo.querySelector('[data-pa]'), d = corpo.querySelector('[data-pd]'), t = corpo.querySelector('[data-pt]');
      if (a) a.onclick = () => ZZ.busy(a, async () => { try { await ativar(); ZZ.toast('Notificações ativadas neste aparelho', 'ok'); } catch (e) { ZZ.toast(e.message || 'Falha ao ativar', 'err'); throw e; } finally { pintar(); } });
      if (d) d.onclick = () => ZZ.busy(d, async () => { await desativar(); ZZ.toast('Notificações desativadas neste aparelho', 'ok'); pintar(); });
      if (t) t.onclick = () => ZZ.busy(t, async () => { const r = await ZZ.api('push_testar', { corpo: {}, silencioso: true }); ZZ.toast(r.msg || (r.ok ? 'Teste enviado' : 'Falha no teste'), r.ok ? 'ok' : 'err'); if (!r.ok) throw new Error(r.msg); });
    };
    pintar();
    // quando o usuário muda tipos/não perturbe, o servidor precisa saber (ele filtra o push)
    const sync = ZZ.debounce(async () => { const s = await assinaturaAtual(); if (s && Notification.permission === 'granted') enviarAoServidor(s).catch(() => { }); }, 800);
    el.addEventListener('change', sync);
  });

  /* ---------- clique na notificação / assinatura trocada ---------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', async ev => {
    const d = ev.data || {};
    if (d.zz === 'ir' && typeof d.hash === 'string' && /^#\/[\w?=&%.@:+-]+$/.test(d.hash)) { if (d.instancia && ZZ.instancia && d.instancia !== ZZ.instancia && ZZ.instanciaSelecionar) { try { await ZZ.instanciaSelecionar(d.instancia); } catch (e) { } } location.hash = d.hash; }
    if (d.zz === 'push-renovar') renovar();
  });
  async function renovar() { // só para quem ativou antes: reassina em silêncio se o navegador trocou a assinatura ou o servidor a perdeu
    try {
      if (!suportado || !flag() || Notification.permission !== 'granted') return;
      const sub = await assinaturaAtual(); if (!sub) return void await ativar();
      const r = await ZZ.api('ver_push_estado', { params: { h: await sha256(sub.endpoint) }, silencioso: true });
      if (r.ok && !r.este_registrado) await enviarAoServidor(sub);
    } catch (e) { }
  }
  (ZZ.hooksMontar = ZZ.hooksMontar || []).push(() => { setTimeout(renovar, 4000); });
})();
