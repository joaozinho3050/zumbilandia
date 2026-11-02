// Service worker só do jogo do avião (escopo aviao/): tem prioridade sobre o do Zumbilândia aqui dentro.
// Rede primeiro: sempre pega a versão nova; sem internet usa a última cópia guardada.
const CACHE = 'ceu-aberto';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || Response.error())));
});
