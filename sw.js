// Cache-first with background refresh: the app opens instantly from the phone's cache,
// and a new version (new CACHE name) is downloaded in the background and applied on the next open.
const CACHE = 'lrpg-v20';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/api.js', 'js/config.js', 'js/fin.js', 'js/game.js', 'js/sprites.js', 'js/hero.js', 'js/hero-data.js', 'js/train.js', 'js/lock.js', 'js/scenes.js', 'assets/goals.png', 'assets/hero/atlas.png', 'assets/hero/mask.png', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API & fonts go straight to the network
  const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: e.request.mode === 'navigate' });
    const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
