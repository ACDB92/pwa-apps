const CACHE = 'coup-de-vent-v3';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './engine.js',
  './meteo.js',
  './carte.js',
  './spots.js',
  './manifest.json',
  './icon.svg'
];

// `cache: 'reload'` : précacher ce que sert le serveur, jamais une copie restée dans le cache HTTP.
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

// Le code de l'app : réseau d'abord et revalidé, pour qu'une mise à jour se voie tout de suite, le
// cache en secours hors-ligne. Les API (Open-Meteo, OSRM, carburant) ne passent jamais par ici :
// l'appli garde elle-même leurs réponses, avec leur heure.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.includes('/tests/')) return;
  e.respondWith(
    fetch(new Request(e.request.url, { cache: 'no-cache' })).then(res => {
      if (res.ok && res.type === 'basic') {
        const copie = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copie));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
