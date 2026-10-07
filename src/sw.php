<?php
// Service worker servido por PHP para nunca ficar em cache (nginx não lê .htaccess).
require __DIR__ . '/lib.php';
no_cache();
header('Content-Type: application/javascript; charset=utf-8');
header('Service-Worker-Allowed: /zapzap/');
?>
const VERSAO = '<?= ZZ_VERSAO ?>';
const CACHE = 'zapzap-' + VERSAO;
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith('/zapzap/')) return;
  // PHP/API/versão: sempre rede. Só estáticos versionados (?v=) usam cache.
  if (!/\.(css|js|svg|png|webmanifest)$/.test(u.pathname) || !u.search.includes('v=')) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => { if (n.ok) c.put(e.request, n.clone()); return n; }))));
});

/* ---------- Web Push (notificações com o app fechado) ---------- */
const PUSH_VIB = { mensagem: [60, 40, 60], atendimento: [90, 50, 90, 50, 140], conexao: [220, 100, 220, 100, 220], agenda: [50], campanha: [50, 40, 50], automacao: [40], sistema: [40] };
const rotaOk = r => typeof r === 'string' && /^[a-z0-9_-]+(\?[\w%=&.@:+-]*)?$/i.test(r);
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: 'ZapZap', texto: e.data ? String(e.data.text()).slice(0, 140) : '' }; }
  const tipo = PUSH_VIB[d.tipo] ? d.tipo : 'sistema';
  e.waitUntil((async () => {
    // Se o app está aberto, visível e em foco, o banner interno já avisa (sem notificação duplicada).
    const js = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (js.some(c => c.visibilityState === 'visible' && c.focused) && d.tag !== 'teste') return;
    await self.registration.showNotification(String(d.titulo || 'ZapZap').slice(0, 80), {
      body: String(d.texto || '').slice(0, 140), icon: '/zapzap/icon-192.png', badge: '/zapzap/icon-192.png',
      tag: String(d.tag || tipo).slice(0, 80), renotify: true, vibrate: PUSH_VIB[tipo], timestamp: Date.now(),
      requireInteraction: tipo === 'conexao', data: { rota: rotaOk(d.rota) ? d.rota : '', instancia: d.instancia || '' }
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const rota = (e.notification.data && e.notification.data.rota) || ''; const hash = '#/' + (rota || 'painel');
  e.waitUntil((async () => {
    const js = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = js.find(x => new URL(x.url).pathname.startsWith('/zapzap/'));
    if (c) { try { await c.focus(); } catch (x) { } c.postMessage({ zz: 'ir', hash, instancia: (e.notification.data || {}).instancia || '' }); return; }
    await self.clients.openWindow('/zapzap/' + hash);
  })());
});
// A assinatura expirou/foi trocada pelo navegador: avisa o app (que reassina ao abrir) — o servidor remove a antiga ao receber 404/410.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(js => js.forEach(c => c.postMessage({ zz: 'push-renovar' }))));
});
