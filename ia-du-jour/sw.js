// L'IA du jour — service worker. Changer CACHE à chaque publication du code de l'app.
const CACHE = 'ia-du-jour-v3';
const ASSETS = ['./', './index.html', './app.js', './lecture.js', './manifest.json', './icon.svg'];

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

// Réseau d'abord, revalidé : l'édition du matin doit se voir tout de suite. Le cache ne sert que
// hors-ligne, pour relire les éditions déjà ouvertes.
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

// Notifications de l'app : la routine envoie { title, body, url } chaque matin.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* message illisible : notification générique */ }
  e.waitUntil(self.registration.showNotification(d.title || "L'IA du jour", {
    body: d.body || "L'édition du jour est en ligne.",
    icon: './icon.svg', badge: './icon.svg', tag: 'ia-du-jour', lang: 'fr',
    data: { url: d.url || self.registration.scope },
  }));
});

// Un toucher ouvre l'édition : dans l'app déjà ouverte s'il y en a une, sinon dans une nouvelle.
// Seules les adresses de l'app sont acceptées.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const voulue = e.notification.data?.url || '';
  const url = voulue.startsWith(self.registration.scope) ? voulue : self.registration.scope;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenetres => {
    const ouverte = fenetres.find(f => f.url.startsWith(self.registration.scope));
    if (ouverte) return ouverte.navigate(url).then(f => (f || ouverte).focus());
    return clients.openWindow(url);
  }));
});
