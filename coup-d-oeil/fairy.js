// Fairy-Stockfish dans la page, pour les niveaux sous 1320. C'est la variante de Stockfish qui fait
// jouer les bots de Lichess ; elle descend jusqu'à Skill Level −20. Elle est compilée multi-fil : il lui
// faut SharedArrayBuffer, donc une page isolée (en-têtes COOP et COEP). GitHub Pages ne les envoie pas :
// sw.js les ajoute, et index.html recharge une fois une page ouverte avant lui.
//
// Rend un objet { postMessage, onmessage, onerror, terminate } : uci.js le pilote comme un Worker.
// Sous Node, les tests passent par tests/fairy-uci.cjs.

const DOSSIER = new URL('./vendor/fairy-stockfish/', import.meta.url);

function chargerScript(src) {
  return new Promise((resoudre, rejeter) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resoudre;
    script.onerror = () => rejeter(new Error(`${src} ne se charge pas`));
    document.head.append(script);
  });
}

export async function creerFairy() {
  if (!globalThis.crossOriginIsolated) {
    throw new Error('Fairy-Stockfish ne démarre pas : la page n’est pas isolée. Recharge-la ; si rien ne change, ce navigateur n’offre pas les niveaux sous 1320.');
  }
  const src = new URL('stockfish.js', DOSSIER).href;
  if (!globalThis.Stockfish) await chargerScript(src);
  const worker = { onmessage: null, onerror: null };
  const moteur = await globalThis.Stockfish({
    locateFile: fichier => new URL(fichier, DOSSIER).href,
    mainScriptUrlOrBlob: src,
    onAbort: raison => worker.onerror?.(new Error(`Fairy-Stockfish s’est arrêté : ${raison}`)),
  });
  moteur.addMessageListener(ligne => worker.onmessage?.({ data: ligne }));
  worker.postMessage = commande => moteur.postMessage(commande);
  worker.terminate = () => moteur.terminate();
  return worker;
}
