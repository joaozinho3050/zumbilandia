// Offline: guarda todos os arquivos do jogo; a versão muda a cada build.
const CACHE = 'zumbilandia-779415fbe9';
const FILES = ['./', 'index.html', 'game.js', 'ui.js', 'sfx.js', 'render.js', 'modelos.js', 'lib/three.module.min.js', 'lib/fonts/AtkinsonHyperlegible-Regular.woff2', 'lib/fonts/PixelifySans-Regular.woff2', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then((res) => {
    if (res.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
    return res;
  })));
});
