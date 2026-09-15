const CACHE = 'coup-d-oeil-v5';
// Tout est précaché, moteur compris (.wasm, 7 Mo) : sans lui l'app ne joue ni n'analyse hors-ligne.
const ASSETS = [
  './',
  './index.html',
  './coach.js',
  './explication.js',
  './motifs.js',
  './uci.js',
  './analyste.js',
  './manifest.json',
  './icon.svg',
  './vendor/chess.js',
  './vendor/stockfish/stockfish-18-lite-single.js',
  './vendor/stockfish/stockfish-18-lite-single.wasm',
  './vendor/cm-chessboard/src/Chessboard.js',
  './vendor/cm-chessboard/src/lib/Svg.js',
  './vendor/cm-chessboard/src/lib/Utils.js',
  './vendor/cm-chessboard/src/model/ChessboardState.js',
  './vendor/cm-chessboard/src/model/Extension.js',
  './vendor/cm-chessboard/src/model/Position.js',
  './vendor/cm-chessboard/src/view/ChessboardView.js',
  './vendor/cm-chessboard/src/view/PositionAnimationsQueue.js',
  './vendor/cm-chessboard/src/view/VisualMoveInput.js',
  './vendor/cm-chessboard/src/extensions/arrows/Arrows.js',
  './vendor/cm-chessboard/src/extensions/markers/Markers.js',
  './vendor/cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js',
  './vendor/cm-chessboard/assets/chessboard.css',
  './vendor/cm-chessboard/assets/pieces/staunty.svg',
  './vendor/cm-chessboard/assets/extensions/arrows/arrows.css',
  './vendor/cm-chessboard/assets/extensions/arrows/arrows.svg',
  './vendor/cm-chessboard/assets/extensions/markers/markers.css',
  './vendor/cm-chessboard/assets/extensions/markers/markers.svg',
  './vendor/cm-chessboard/assets/extensions/promotion-dialog/promotion-dialog.css'
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

// `fraiche` : revalider auprès du serveur plutôt que se fier au cache HTTP — sinon un module modifié
// peut rester à son ancienne version, alors que la page, elle, est neuve.
function chercherEtGarder(requete, fraiche = false) {
  return fetch(fraiche ? new Request(requete.url, { cache: 'no-cache' }) : requete).then(res => {
    if (res.ok && res.type === 'basic') {
      const copie = res.clone();
      caches.open(CACHE).then(c => c.put(requete, copie));
    }
    return res;
  });
}

// Deux régimes. `vendor/` ne change qu'avec sa version : cache d'abord, pour ne pas retélécharger
// 7 Mo de moteur à chaque ouverture. Le code de l'app : réseau d'abord, pour qu'une mise à jour se
// voie tout de suite, et le cache en secours hors-ligne. Les tests ne passent jamais par le cache.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.includes('/tests/')) return;
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(e.request).then(r => r || chercherEtGarder(e.request)));
    return;
  }
  // Hors-ligne, une page retombe sur index.html ; un fichier absent du cache échoue franchement,
  // plutôt que de recevoir du HTML à la place d'un script.
  e.respondWith(
    chercherEtGarder(e.request, true).catch(() =>
      caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
    )
  );
});
