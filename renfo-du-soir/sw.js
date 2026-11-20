// Renfo du soir — service worker. Changer CACHE à chaque publication du code de l'app.
const CACHE = 'renfo-du-soir-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './moteur.js', './exercices.js', './schema.js', './voix.js', './manifest.json', './icon.svg'];

self.addEventListener('install', e =>
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  )
);

self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

// Réseau d'abord, revalidé : un module modifié ne reste pas à son ancienne version. Hors-ligne
// (salon sans réseau, mode avion), le cache sert toute l'app.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.includes('/tests/')) return;
  e.respondWith(
    fetch(new Request(e.request.url, { cache: 'no-cache' })).then(res => {
      if (res.ok) {
        const copie = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copie));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
