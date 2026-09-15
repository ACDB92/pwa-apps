// Stockfish dans un Web Worker : envoyer des commandes UCI, lire ce qu'il répond.
//
// Deux étages :
//   1. des fonctions pures (lire une ligne `info` ou `bestmove`, écrire un `go`), testées sans moteur ;
//   2. `Moteur`, qui fait passer les commandes une par une.
//
// La règle qui compte : une seule recherche à la fois par Worker. Après `stop`, on attend
// `bestmove` avant d'envoyer la position suivante — sinon les lignes `info` de deux recherches se
// mélangent et le retour est calculé sur la mauvaise position. D'où la file.

// Lit une ligne `info` porteuse d'un score ; null pour tout le reste (`info string`, `currmove`…).
// Le score est du point de vue du camp au trait, tel que Stockfish l'envoie.
export function lireInfo(ligne) {
  const t = ligne.trim().split(/\s+/);
  if (t[0] !== 'info') return null;
  const info = { depth: null, multipv: 1, score: null, borne: null, nodes: null, time: null, pv: [] };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'string': return null;
      case 'depth': info.depth = Number(t[++i]); break;
      case 'multipv': info.multipv = Number(t[++i]); break;
      case 'score': info.score = { type: t[i + 1], value: Number(t[i + 2]) }; i += 2; break;
      case 'lowerbound': info.borne = 'basse'; break;
      case 'upperbound': info.borne = 'haute'; break;
      case 'nodes': info.nodes = Number(t[++i]); break;
      case 'time': info.time = Number(t[++i]); break;
      case 'wdl': i += 3; break;
      case 'pv': info.pv = t.slice(i + 1); i = t.length; break;
      case 'seldepth': case 'nps': case 'hashfull': case 'tbhits': case 'currmove': case 'currmovenumber': i++; break;
    }
  }
  return info.depth === null || info.score === null ? null : info;
}

// Lit `bestmove e2e4 ponder e7e5`. `coup` vaut null pour `bestmove (none)` : mat ou pat.
export function lireBestmove(ligne) {
  const t = ligne.trim().split(/\s+/);
  if (t[0] !== 'bestmove') return null;
  return { coup: t[1] && t[1] !== '(none)' ? t[1] : null, ponder: t[2] === 'ponder' ? t[3] : null };
}

// Écrit la commande `go`. `searchmoves` toujours en dernier : Stockfish prend tout ce qui suit pour
// des coups. Pas de recherche sans limite : elle ne rendrait jamais la main.
export function commandeGo({ depth, movetime, nodes, searchmoves } = {}) {
  const c = ['go'];
  if (depth) c.push('depth', depth);
  if (movetime) c.push('movetime', movetime);
  if (nodes) c.push('nodes', nodes);
  if (c.length === 1) throw new Error('commandeGo : il faut au moins depth, movetime ou nodes');
  if (searchmoves?.length) c.push('searchmoves', ...searchmoves);
  return c.join(' ');
}

export class Moteur {
  // `worker` : un Worker déjà créé, ou tout objet { postMessage, onmessage, onerror } — les tests
  // en fournissent un faux et répondent à la main.
  constructor(worker) {
    this.worker = worker;
    this.ecouteurs = new Set();   // appelés pour chaque ligne reçue
    this.enAttente = new Set();   // rejets des attentes en cours, si le Worker tombe en panne
    this.file = Promise.resolve();
    this.enCours = false;
    worker.onmessage = e => {
      for (const ligne of String(e.data).split('\n')) {
        if (ligne.trim()) for (const f of [...this.ecouteurs]) f(ligne.trim());
      }
    };
    worker.onerror = e => {
      const erreur = new Error(`Moteur en panne : ${e?.message ?? e}`);
      this.enCours = false;
      this.ecouteurs.clear();
      for (const rejeter of [...this.enAttente]) rejeter(erreur);
      this.enAttente.clear();
    };
  }

  envoyer(commande) {
    this.worker.postMessage(commande);
  }

  attendre(predicat) {
    return new Promise((resoudre, rejeter) => {
      const f = ligne => {
        if (!predicat(ligne)) return;
        this.ecouteurs.delete(f);
        this.enAttente.delete(rejeter);
        resoudre(ligne);
      };
      this.ecouteurs.add(f);
      this.enAttente.add(rejeter);
    });
  }

  // Chaque opération attend la fin de la précédente ; une opération qui échoue ne bloque pas la suivante.
  enFile(operation) {
    const p = this.file.then(operation);
    this.file = p.catch(() => {});
    return p;
  }

  async pret() {
    const ok = this.attendre(l => l === 'readyok');
    this.envoyer('isready');
    await ok;
  }

  demarrer(options = {}) {
    return this.enFile(async () => {
      const ok = this.attendre(l => l === 'uciok');
      this.envoyer('uci');
      await ok;
      for (const [nom, valeur] of Object.entries(options)) this.envoyer(`setoption name ${nom} value ${valeur}`);
      await this.pret();
    });
  }

  regler(options) {
    return this.enFile(async () => {
      for (const [nom, valeur] of Object.entries(options)) this.envoyer(`setoption name ${nom} value ${valeur}`);
      await this.pret();
    });
  }

  nouvellePartie() {
    return this.enFile(async () => {
      this.envoyer('ucinewgame');
      await this.pret();
    });
  }

  // Lance une recherche ; rend { coup, lignes } à réception de `bestmove`. `lignes` garde la dernière
  // ligne exacte de chaque multipv, triées — les lignes `lowerbound`/`upperbound` sont provisoires.
  // `surInfo(info)` est appelé à chaque ligne exacte : c'est là qu'on suit la profondeur atteinte.
  analyser(fen, limites, { surInfo } = {}) {
    const go = commandeGo(limites);
    return this.enFile(() => new Promise((resoudre, rejeter) => {
      const lignes = new Map();
      const f = ligne => {
        const info = lireInfo(ligne);
        if (info) {
          if (!info.borne) {
            lignes.set(info.multipv, info);
            surInfo?.(info);
          }
          return;
        }
        const fin = lireBestmove(ligne);
        if (!fin) return;
        this.ecouteurs.delete(f);
        this.enAttente.delete(rejeter);
        this.enCours = false;
        resoudre({ coup: fin.coup, lignes: [...lignes.values()].sort((a, b) => a.multipv - b.multipv) });
      };
      this.ecouteurs.add(f);
      this.enAttente.add(rejeter);
      this.enCours = true;
      this.envoyer(`position fen ${fen}`);
      this.envoyer(go);
    }));
  }

  // Écourte la recherche en cours. La file attend quand même son `bestmove` avant la suite.
  arreter() {
    if (this.enCours) this.envoyer('stop');
  }

  terminer() {
    this.worker.terminate?.();
  }
}
