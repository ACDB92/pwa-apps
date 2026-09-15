// Lire l'échiquier : géométrie, motifs tactiques, critères de position. Logique pure — chaque
// fonction répond à une question précise sur une position chess.js, sans rien rédiger ;
// explication.js en tire les phrases.

import { Chess } from './vendor/chess.js';
import { VALEURS, materiel } from './coach.js';

const COLONNES = 'abcdefgh';
export const DIRECTIONS = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
};
DIRECTIONS.q = [...DIRECTIONS.r, ...DIRECTIONS.b];
export const CENTRE = ['d4', 'e4', 'd5', 'e5'];

export const coord = c => [COLONNES.indexOf(c[0]), Number(c[1]) - 1];
export const caseDe = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? COLONNES[f] + (r + 1) : null);
export const adverse = couleur => (couleur === 'w' ? 'b' : 'w');
export const couleurCase = sq => (coord(sq).reduce((a, b) => a + b) % 2 === 0 ? 'foncee' : 'claire');
const versObjet = uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });

// ── Géométrie ────────────────────────────────────────────────────────────────────────────────

// Pas unitaire de `de` vers `vers` s'ils sont alignés (colonne, rangée, diagonale), sinon null.
export function pas(de, vers) {
  const [f1, r1] = coord(de);
  const [f2, r2] = coord(vers);
  if (de === vers) return null;
  if (f1 !== f2 && r1 !== r2 && Math.abs(f2 - f1) !== Math.abs(r2 - r1)) return null;
  return [Math.sign(f2 - f1), Math.sign(r2 - r1)];
}

// Les cases strictement entre deux cases alignées ; [] si elles ne le sont pas.
export function entre(de, vers) {
  const d = pas(de, vers);
  if (!d) return [];
  const cases = [];
  let [f, r] = coord(de);
  for (;;) {
    f += d[0];
    r += d[1];
    const sq = caseDe(f, r);
    if (!sq || sq === vers) return cases;
    cases.push(sq);
  }
}

// Les cases dans la direction `d` depuis `sq`, jusqu'à la première pièce comprise ou le bord.
export function rayon(chess, sq, d) {
  const cases = [];
  let [f, r] = coord(sq);
  for (;;) {
    f += d[0];
    r += d[1];
    const s = caseDe(f, r);
    if (!s) return cases;
    cases.push(s);
    if (chess.get(s)) return cases;
  }
}

export const glisseDans = (type, d) => (DIRECTIONS[type] ?? []).some(([a, b]) => a === d[0] && b === d[1]);

export function piecesDe(chess, couleur) {
  const res = [];
  for (const rangee of chess.board()) {
    for (const p of rangee) if (p && p.color === couleur) res.push({ case: p.square, piece: p });
  }
  return res;
}

export const roiDe = (chess, couleur) => piecesDe(chess, couleur).find(p => p.piece.type === 'k')?.case ?? null;

// Les pièces de `couleur` qui attaquent `sq` — ou le défendent, si la pièce en `sq` est des leurs.
// chess.js compte aussi les pièces clouées.
export const attaquants = (chess, sq, couleur) => chess.attackers(sq, couleur).map(s => ({ case: s, piece: chess.get(s) }));

// ── Motifs tactiques ─────────────────────────────────────────────────────────────────────────

// En prise : l'adversaire, au trait, peut la prendre sans perdre au change — aucune défense, ou un
// preneur de moindre valeur. Les prises sont des coups légaux : une pièce clouée ne prend pas.
export function enPrise(chess, sq) {
  const piece = chess.get(sq);
  if (!piece || piece.type === 'k' || chess.turn() === piece.color) return false;
  const prises = chess.moves({ verbose: true }).filter(m => m.to === sq);
  if (!prises.length) return false;
  if (!chess.attackers(sq, piece.color).length) return true;
  return prises.some(m => m.piece !== 'k' && VALEURS[m.piece] < VALEURS[piece.type]);
}

// Une cible qui compte pour une pièce qui attaque : le roi, une pièce plus précieuse, ou une pièce
// que rien ne défend.
function cibleSerieuse(chess, attaquant, cible) {
  return cible.piece.type === 'k'
    || VALEURS[cible.piece.type] > VALEURS[attaquant.type]
    || !chess.attackers(cible.case, cible.piece.color).length;
}

// Fourchette : la pièce en `sq` attaque au moins deux cibles sérieuses.
export function fourchette(chess, sq) {
  const attaquant = chess.get(sq);
  if (!attaquant) return null;
  const cibles = piecesDe(chess, adverse(attaquant.color))
    .filter(c => chess.attackers(c.case, attaquant.color).includes(sq) && cibleSerieuse(chess, attaquant, c));
  cibles.sort((a, b) => (b.piece.type === 'k') - (a.piece.type === 'k') || VALEURS[b.piece.type] - VALEURS[a.piece.type]);   // le roi d'abord
  return cibles.length >= 2 ? { attaquant: { case: sq, piece: attaquant }, cibles } : null;
}

// Clouage : sur une ligne de la pièce en `sq`, une pièce adverse, et juste derrière elle le roi, ou
// une pièce plus précieuse qu'elle et que la pièce qui cloue (sinon, perdre l'arrière ne coûte rien).
export function clouages(chess, sq) {
  const cloueur = chess.get(sq);
  if (!cloueur || !DIRECTIONS[cloueur.type]) return [];
  const res = [];
  for (const d of DIRECTIONS[cloueur.type]) {
    const rencontres = [];
    let [f, r] = coord(sq);
    while (rencontres.length < 2) {
      f += d[0];
      r += d[1];
      const s = caseDe(f, r);
      if (!s) break;
      const p = chess.get(s);
      if (p) rencontres.push({ case: s, piece: p });
    }
    const [cloue, derriere] = rencontres;
    if (cloue && derriere && cloue.piece.color !== cloueur.color && derriere.piece.color !== cloueur.color
      && (derriere.piece.type === 'k'
        || (VALEURS[derriere.piece.type] > VALEURS[cloue.piece.type] && VALEURS[derriere.piece.type] > VALEURS[cloueur.type]))) {
      res.push({ cloueur: { case: sq, piece: cloueur }, cloue, derriere });
    }
  }
  return res;
}

// Attaque à la découverte : la pièce partie de `de` pour `vers` ouvre la ligne d'une autre pièce de
// son camp vers une cible sérieuse.
export function decouvertes(chess, de, vers) {
  const joueur = chess.get(vers)?.color;
  if (!joueur) return [];
  const res = [];
  for (const cible of piecesDe(chess, adverse(joueur))) {
    for (const a of chess.attackers(cible.case, joueur)) {
      if (a === vers) continue;
      const ouvreur = chess.get(a);
      const d = pas(a, cible.case);
      if (d && glisseDans(ouvreur.type, d) && entre(a, cible.case).includes(de) && cibleSerieuse(chess, ouvreur, cible)) {
        res.push({ ouvreur: { case: a, piece: ouvreur }, cible });
      }
    }
  }
  return res;
}

// Mat du couloir : roi mat sur sa première rangée, par une tour ou une dame sur cette rangée,
// enfermé par au moins deux de ses propres pions.
export function matDuCouloir(chess) {
  if (!chess.isCheckmate()) return null;
  const perdant = chess.turn();
  const premiere = perdant === 'w' ? 0 : 7;
  const devant = perdant === 'w' ? 1 : -1;
  const roi = roiDe(chess, perdant);
  const [f, r] = coord(roi);
  if (r !== premiere) return null;
  const matant = attaquants(chess, roi, adverse(perdant))
    .find(a => (a.piece.type === 'r' || a.piece.type === 'q') && coord(a.case)[1] === premiere);
  if (!matant) return null;
  const pions = [-1, 0, 1].map(df => caseDe(f + df, r + devant)).filter(Boolean).filter(s => {
    const p = chess.get(s);
    return p && p.color === perdant && p.type === 'p';
  });
  return pions.length >= 2 ? { roi: { case: roi }, matant, pions } : null;
}

// ── Critères de position ─────────────────────────────────────────────────────────────────────
// Chacun compare la position avant et après un coup (`coup` : l'objet rendu par chess.js).

// Roque affaibli : un pion qui protégeait un roi posté sur une aile (colonnes a-c ou f-h de sa
// première rangée) quitte sa place — une ou deux rangées devant le roi, sur sa colonne ou à côté.
export function bouclierQuitte(avant, coup) {
  if (coup.piece !== 'p') return null;
  const roi = roiDe(avant, coup.color);
  const [fr, rr] = coord(roi);
  if (rr !== (coup.color === 'w' ? 0 : 7) || fr === 3 || fr === 4) return null;
  const [fp, rp] = coord(coup.from);
  const devant = coup.color === 'w' ? 1 : -1;
  return Math.abs(fp - fr) <= 1 && (rp === rr + devant || rp === rr + 2 * devant) ? { roi } : null;
}

// Ligne ouverte vers le roi : la pièce jouée était la première à couvrir le roi sur une diagonale,
// une colonne ou une rangée ; après le coup la ligne est libre sur deux cases au moins, et
// l'adversaire a une pièce qui peut l'emprunter. (Si elle était déjà sur la ligne, la pièce jouée
// aurait été clouée : le coup serait illégal.)
export function ligneOuverteVersRoi(avant, apres, coup) {
  if (coup.piece === 'k') return null;
  const joueur = coup.color;
  const adv = adverse(joueur);
  const roi = roiDe(apres, joueur);
  for (const d of DIRECTIONS.q) {
    if (rayon(avant, roi, d).at(-1) !== coup.from) continue;
    const ligne = rayon(apres, roi, d);
    if (ligne.includes(coup.to)) continue;   // la pièce jouée couvre toujours la ligne
    const vides = ligne.filter(s => !apres.get(s));
    if (vides.length < 2) continue;
    const diagonale = d[0] !== 0 && d[1] !== 0;
    const empruntable = piecesDe(apres, adv).some(p => p.piece.type === 'q'
      || (p.piece.type === (diagonale ? 'b' : 'r') && (!diagonale || couleurCase(p.case) === couleurCase(vides[0]))));
    if (!empruntable) continue;
    return { roi, fin: vides.at(-1), type: diagonale ? 'diagonale' : d[0] === 0 ? 'colonne' : 'rangée' };
  }
  return null;
}

// Un pion poussé sur la case naturelle du cavalier de l'aile roi (f3, f6), cavalier encore chez lui.
export function caseDuCavalierPrise(avant, coup) {
  if (coup.piece !== 'p' || coup.captured) return null;
  const [origine, naturelle] = coup.color === 'w' ? ['g1', 'f3'] : ['g8', 'f6'];
  const cavalier = avant.get(origine);
  return coup.to === naturelle && cavalier?.type === 'n' && cavalier.color === coup.color ? { cavalier: origine } : null;
}

// Deux fous, sur des cases de couleurs différentes.
export function paireDeFous(chess, couleur) {
  const fous = piecesDe(chess, couleur).filter(p => p.piece.type === 'b');
  return new Set(fous.map(p => couleurCase(p.case))).size === 2;
}

const pionsParColonne = (chess, couleur) => {
  const colonnes = new Map();
  for (const p of piecesDe(chess, couleur)) {
    if (p.piece.type === 'p') colonnes.set(p.case[0], [...(colonnes.get(p.case[0]) ?? []), p.case]);
  }
  return colonnes;
};

// Les colonnes où `couleur` a au moins deux pions.
export const pionsDoubles = (chess, couleur) => [...pionsParColonne(chess, couleur)].filter(([, cases]) => cases.length > 1).map(([col]) => col).sort();

// Les pions de `couleur` sans pion de leur camp sur les colonnes voisines.
export function pionsIsoles(chess, couleur) {
  const colonnes = pionsParColonne(chess, couleur);
  const voisin = col => [-1, 1].some(dc => colonnes.has(COLONNES[COLONNES.indexOf(col) + dc]));
  return piecesDe(chess, couleur).filter(p => p.piece.type === 'p' && !voisin(p.case[0])).map(p => p.case);
}

// Cavaliers et fous encore sur leur case de départ.
export function piecesNonDeveloppees(chess, couleur) {
  const r = couleur === 'w' ? '1' : '8';
  const depart = { [`b${r}`]: 'n', [`g${r}`]: 'n', [`c${r}`]: 'b', [`f${r}`]: 'b' };
  return piecesDe(chess, couleur).filter(p => depart[p.case] === p.piece.type);
}

// Les cases centrales que la pièce en `sq` attaque (ou défend).
export const centreVise = (chess, sq) => CENTRE.filter(c => chess.attackers(c, chess.get(sq).color).includes(sq));

// Les pièces du joueur attaquées et moins défendues qu'attaquées avant le coup, que la pièce jouée
// défend désormais.
export function defensesNouvelles(avant, apres, coup) {
  const adv = adverse(coup.color);
  return piecesDe(apres, coup.color).filter(p => {
    if (p.case === coup.to || p.piece.type === 'k') return false;
    const attaques = apres.attackers(p.case, adv).length;
    return attaques > 0
      && apres.attackers(p.case, coup.color).includes(coup.to)
      && avant.attackers(p.case, coup.color).length < attaques;
  });
}

// La position après le coup — et, si c'est une prise, après les reprises qui suivent sur la même
// case dans la variante : c'est là que se lit la structure qu'il laisse.
export function positionApresEchange(fen, pv) {
  const chess = new Chess(fen);
  const premier = chess.move(versObjet(pv[0]));
  if (!premier.captured) return chess;
  for (const uci of pv.slice(1, 4)) {
    if (uci.slice(2, 4) !== premier.to) break;
    let reprise = null;
    try { reprise = chess.move(versObjet(uci)); } catch { /* coup illégal */ }
    if (!reprise) break;
    if (!reprise.captured) {
      chess.undo();
      break;
    }
  }
  return chess;
}

// La séquence forcée que lance le premier coup de la variante : on suit les prises et les réponses
// aux échecs, et l'on s'arrête au premier coup calme. `bilan` : le matériel gagné (+) ou perdu (−)
// par le camp qui joue ce premier coup. Au-delà, la variante ne dit plus rien de ce coup-là.
export function sequenceForcee(fen, pv, max = 10) {
  const chess = new Chess(fen);
  const joueur = chess.turn();
  const depart = materiel(chess, joueur);
  const coups = [];
  const fens = [];
  for (const uci of pv.slice(0, max)) {
    const echec = chess.isCheck();
    let coup = null;
    try { coup = chess.move(versObjet(uci)); } catch { /* coup illégal */ }
    if (!coup) break;
    if (coups.length > 0 && !coup.captured && !echec) {
      chess.undo();
      break;
    }
    coups.push(coup);
    fens.push(chess.fen());
  }
  return { bilan: materiel(chess, joueur) - depart, coups, fens };
}
