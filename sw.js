// Network-first: selalu ambil versi terbaru kalau online, pakai cache kalau offline.
const CACHE = 'lrpg-v13';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/api.js', 'js/config.js', 'js/fin.js', 'js/game.js', 'js/sprites.js', 'js/hero.js', 'js/hero-data.js', 'js/train.js', 'js/lock.js', 'assets/hero/atlas.png', 'assets/hero/mask.png', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API & font tidak di-cache di sini
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
