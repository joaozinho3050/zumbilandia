// Offline: guarda todos os arquivos do jogo; a versão muda a cada build.
const CACHE = 'zumbilandia-1db2b15223';
const FILES = ["./","game.js","icon-180.png","icon-192.png","icon-512.png","index.html","lib/fonts/AtkinsonHyperlegible-Regular.woff2","lib/fonts/ORIGEM.txt","lib/fonts/PixelifySans-Regular.woff2","lib/three-LICENSE","lib/three.module.min.js","manifest.webmanifest","modelos.js","render.js","sfx.js","sons.html","ui.js"]; // build.sh gera a lista a partir de dist/
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))); });
// a versão nova espera; a página manda 'go' quando está na tela inicial
self.addEventListener('message', (e) => { if (e.data === 'go') self.skipWaiting(); });
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
