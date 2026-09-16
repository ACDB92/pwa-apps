// Juger un coup. Logique pure, sans DOM ni moteur : on lui passe ce que l'analyste a trouvé, il
// rend un retour — verdict, coups aussi bons, réfutation, et surtout le mécanisme de l'erreur.
//
// Il ne sait pas qu'une partie est en cours : il juge une position et un coup, rien de plus. Le
// même code servira à relire des parties importées.
//
// Convention de signe : un score est toujours du point de vue du camp au trait dans la position
// analysée — c'est ce que Stockfish envoie. Sur la position d'avant ton coup, c'est donc le tien.

import { Chess } from './vendor/chess.js';

// ── Réglages ─────────────────────────────────────────────────────────────────────────────────

// Perte de Win% (en points sur 100) → verdict. Bandes de la Game Review de chess.com, pour
// retrouver ses étiquettes ; le mode entraînement de Lichess est plus sévère (2,5 / 6 / 14).
export const SEUILS = [
  [2, 'excellent'],
  [5, 'bon'],
  [10, 'imprecision'],
  [20, 'erreur'],
  [Infinity, 'gaffe'],
];

export const AUSSI_BON = 5;          // une ligne à moins de 5 points du meilleur coup est « aussi bonne »
export const ECART_CP_VISION = 200;  // sous cet écart, perdre du matériel est un sacrifice correct
export const MATERIEL_MIN = 2;       // points de matériel à partir desquels on parle de perte ou de gain
export const DEMI_COUPS_MAX = 8;     // longueur de variante rejouée pour le bilan matériel
export const VALEURS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const LIBELLES = {
  meilleur: 'Meilleur', excellent: 'Excellent', bon: 'Bon',
  imprecision: 'Imprécision', erreur: 'Erreur', gaffe: 'Gaffe',
};

export const NOMS_SIGNAUX = {
  menace: 'Menace non parée', 'mat-concede': 'Mat concédé', 'mat-manque': 'Mat manqué',
  materiel: 'Matériel en prise', 'gain-manque': 'Gain manqué',
};

const NOMS_PIECES = { p: 'le pion', n: 'le cavalier', b: 'le fou', r: 'la tour', q: 'la dame', k: 'le roi' };
const LETTRES_FR = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };

// ── Échelle ──────────────────────────────────────────────────────────────────────────────────

const depuisCp = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

// Chances de gain du camp au trait, de 0 à 100. Formule Lichess, calibrée sur des parties réelles.
// cp borné à ±1000 ; mat en n ramené à ±(21 − min(10, |n|)) × 100 cp, donc un mat vaut plus que tout cp.
export function winPct(score) {
  if (score.type === 'mate') {
    if (score.value === 0) return 0;   // `mate 0` : le camp au trait est déjà mat
    const cp = (21 - Math.min(10, Math.abs(score.value))) * 100;
    return depuisCp(score.value > 0 ? cp : -cp);
  }
  return depuisCp(Math.max(-1000, Math.min(1000, score.value)));
}

// Centipions sans borne, pour les seuils « vision » : bornée à ±1000, une tour lâchée à +15 ne se
// verrait pas. Un mat écrase n'importe quelle évaluation, et un mat rapide vaut plus qu'un lent.
export function cpBrut(score) {
  if (score.type !== 'mate') return score.value;
  if (score.value === 0) return -100000;
  return Math.sign(score.value) * (100000 - Math.abs(score.value));
}

export function verdictPour(perte) {
  return SEUILS.find(([borne]) => perte < borne)[1];
}

// ── Notation et variantes ────────────────────────────────────────────────────────────────────

export const sanFr = san => san.replace(/[NBRQK]/g, lettre => LETTRES_FR[lettre]);
export const uciDe = coup => coup.from + coup.to + (coup.promotion ?? '');
const versObjet = uci => (uci.length > 4
  ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
  : { from: uci.slice(0, 2), to: uci.slice(2, 4) });
const prefixe = coup => (coup.color === 'b' ? '…' : '');
const signe = n => (n > 0 ? `+${n}` : `−${-n}`);

export const ligneDuCoup = (lignes, coup) => lignes.find(l => l.pv[0] === coup) ?? null;

// Rejoue une variante UCI. S'arrête au premier coup illégal et garde ce qui a pu être joué.
// Rend les coups chess.js et la FEN après chacun.
export function rejouer(fen, pv) {
  const chess = new Chess(fen);
  const coups = [];
  const fens = [];
  for (const uci of pv) {
    let coup = null;
    try { coup = chess.move(versObjet(uci)); } catch { /* coup illégal : la variante s'arrête là */ }
    if (!coup) break;
    coups.push(coup);
    fens.push(chess.fen());
  }
  return { chess, coups, fens };
}

// Variante lisible : chaque coup en notation française, avec la position qui le suit.
export function varianteFr(fen, pv, max = Infinity) {
  const { coups, fens } = rejouer(fen, pv.slice(0, max));
  return coups.map((c, i) => ({ uci: uciDe(c), san: sanFr(c.san), couleur: c.color, fen: fens[i] }));
}

export function materiel(chess, couleur) {
  let total = 0;
  for (const rangee of chess.board()) {
    for (const piece of rangee) if (piece) total += (piece.color === couleur ? 1 : -1) * VALEURS[piece.type];
  }
  return total;
}

// Bilan matériel d'une variante pour `couleur` : matériel à l'arrivée moins matériel au départ.
// Au plus DEMI_COUPS_MAX demi-coups, prolongés tant que le suivant est une prise (4 de plus au
// maximum), pour ne pas s'arrêter au milieu d'un échange.
export function bilanVariante(fen, pv, couleur, max = DEMI_COUPS_MAX) {
  const chess = new Chess(fen);
  const depart = materiel(chess, couleur);
  const coups = [];
  for (const uci of pv) {
    if (coups.length >= max + 4) break;
    let coup = null;
    try { coup = chess.move(versObjet(uci)); } catch { /* coup illégal */ }
    if (!coup) break;
    if (coups.length >= max && !coup.captured) {
      chess.undo();
      break;
    }
    coups.push(coup);
  }
  return { bilan: materiel(chess, couleur) - depart, coups };
}

// La position « si tu passais ton tour » : même placement, trait à l'adversaire, pas de prise en
// passant. L'analyste y trouve ce que l'adversaire menace. À ne pas utiliser si tu es en échec.
export function fenCoupNul(fen) {
  const champs = fen.split(' ');
  champs[1] = champs[1] === 'w' ? 'b' : 'w';
  champs[3] = '-';
  return champs.join(' ');
}

// ── Le retour sur un coup ────────────────────────────────────────────────────────────────────

/**
 * @param fen        position avant ton coup (tu as le trait)
 * @param coup       ton coup en UCI (« e2e4 », « e7e8q »)
 * @param lignes     top 3 de l'analyste sur `fen`, triées par multipv
 * @param ligneJouee la ligne de ton coup (pv[0] === coup), à la même profondeur
 * @param menace     meilleure ligne de l'adversaire sur fenCoupNul(fen) — facultative, cherchée
 *                   seulement quand le coup est une Erreur ou une Gaffe
 */
export function evaluerCoup({ fen, coup, lignes, ligneJouee, menace = null }) {
  const position = new Chess(fen);
  const couleur = position.turn();
  const force = position.moves().length === 1;
  const joue = position.move(versObjet(coup));   // lève si le coup est illégal : erreur d'appel

  const retour = {
    coup, san: sanFr(joue.san), couleur, force,
    verdict: null, perte: 0, scoreMeilleur: null, scoreJoue: null, winMeilleur: null, winJoue: null,
    alternatives: [], coupUnique: false, refutation: [], signaux: [],
  };
  if (force) return retour;   // un seul coup légal : rien à juger
  if (ligneJouee.pv[0] !== coup) throw new Error(`evaluerCoup : la ligne jouée commence par ${ligneJouee.pv[0]}, pas par ${coup}`);

  const meilleure = lignes[0];
  retour.scoreMeilleur = meilleure.score;
  retour.scoreJoue = ligneJouee.score;
  retour.winMeilleur = winPct(meilleure.score);
  retour.winJoue = winPct(ligneJouee.score);
  retour.perte = Math.max(0, retour.winMeilleur - retour.winJoue);
  retour.verdict = coup === meilleure.pv[0] ? 'meilleur' : verdictPour(retour.perte);

  // Une recherche écourtée peut rendre une ligne dont le premier coup est illégal ici — elle vient
  // d'une position précédente. Sans variante rejouable il n'y a rien à montrer : ce n'est pas une
  // alternative, et la garder ferait planter l'affichage du retour.
  retour.alternatives = lignes
    .filter(l => l.pv.length && winPct(l.score) > retour.winMeilleur - AUSSI_BON)
    .map(l => ({ uci: l.pv[0], score: l.score, win: winPct(l.score), variante: varianteFr(fen, l.pv, 6) }))
    .filter(l => l.variante.length);
  retour.coupUnique = lignes.length > 1 && retour.alternatives.length === 1;
  retour.refutation = varianteFr(fen, ligneJouee.pv, 9).slice(1);
  retour.signaux = signauxVision({ fen, couleur, meilleure, ligneJouee, menace, verdict: retour.verdict });
  return retour;
}

// Nommer le mécanisme : menace non parée, mat, matériel en prise, gain manqué.
function signauxVision({ fen, couleur, meilleure, ligneJouee, menace, verdict }) {
  const adverse = couleur === 'w' ? 'b' : 'w';
  const matPour = s => s.type === 'mate' && s.value > 0;
  const matContre = s => s.type === 'mate' && s.value < 0;
  const [, reponse] = rejouer(fen, ligneJouee.pv.slice(0, 2)).coups;   // la réponse adverse à ton coup
  const signaux = [];

  // 1. Une menace qui existait déjà, et que la réfutation de ton coup exploite — sur un coup qui
  //    coûte vraiment : un bon coup peut laisser prendre ce qui était menacé, en échange d'autre chose.
  let menaceExploitee = null;
  if (menace?.pv?.length && reponse && !['meilleur', 'excellent', 'bon'].includes(verdict)) {
    const fenNul = fenCoupNul(fen);
    const [coupMenace] = rejouer(fenNul, menace.pv.slice(0, 1)).coups;
    const menaceMat = matPour(menace.score);
    const reelle = menaceMat || bilanVariante(fenNul, menace.pv, adverse).bilan >= MATERIEL_MIN;
    const exploitee = coupMenace && (
      uciDe(reponse) === uciDe(coupMenace)
      || (Boolean(reponse.captured) && Boolean(coupMenace.captured) && reponse.to === coupMenace.to)
      || (menaceMat && matContre(ligneJouee.score))
    );
    if (reelle && exploitee) {
      const texteCoup = prefixe(coupMenace) + sanFr(coupMenace.san);
      menaceExploitee = {
        type: 'menace',
        mat: menaceMat,
        texte: menaceMat
          ? `L’adversaire menaçait mat (${texteCoup}) et ton coup ne l’empêche pas.`
          : `L’adversaire menaçait ${texteCoup}${coupMenace.captured ? `, qui prend ${NOMS_PIECES[coupMenace.captured]} ${coupMenace.to}` : ''}, et ton coup ne l’empêche pas.`,
        cases: [coupMenace.from, coupMenace.to],
      };
      signaux.push(menaceExploitee);
    }
  }

  // 2. Les mats priment sur le matériel.
  if (matContre(ligneJouee.score) && !matContre(meilleure.score) && !menaceExploitee?.mat) {
    signaux.push({
      type: 'mat-concede',
      texte: `Ce coup permet un mat en ${-ligneJouee.score.value}.`,
      cases: reponse ? [reponse.from, reponse.to] : [],
    });
  }
  if (matPour(meilleure.score) && !matPour(ligneJouee.score)) {
    const [coupMat] = rejouer(fen, meilleure.pv.slice(0, 1)).coups;
    signaux.push({ type: 'mat-manque', texte: `Mat en ${meilleure.score.value} manqué : ${sanFr(coupMat.san)}.`, cases: [coupMat.from, coupMat.to] });
  }
  if (signaux.some(s => s.mat || s.type.startsWith('mat-'))) return signaux;

  // 3. Le matériel, seulement si l'écart d'évaluation est réel : un sacrifice correct n'est pas une gaffe.
  if (cpBrut(meilleure.score) - cpBrut(ligneJouee.score) < ECART_CP_VISION) return signaux;
  const suite = ['meilleur', 'excellent', 'bon'].includes(verdict) ? ', sans conséquence ici.' : '.';
  const joue = bilanVariante(fen, ligneJouee.pv, couleur);
  const meilleur = bilanVariante(fen, meilleure.pv, couleur);
  if (!menaceExploitee && joue.bilan <= -MATERIEL_MIN && joue.bilan <= meilleur.bilan - MATERIEL_MIN) {
    const prise = joue.coups.find((c, i) => i > 0 && c.color === adverse && c.captured);
    signaux.push({
      type: 'materiel',
      texte: `Tu laisses du matériel${prise ? ` : ${prefixe(prise)}${sanFr(prise.san)} prend ${NOMS_PIECES[prise.captured]} ${prise.to}` : ''} (${signe(joue.bilan)})${suite}`,
      cases: prise ? [prise.to] : [],
    });
  }
  if (meilleur.bilan >= MATERIEL_MIN && joue.bilan <= meilleur.bilan - MATERIEL_MIN) {
    const [premier] = meilleur.coups;
    signaux.push({
      type: 'gain-manque',
      texte: `${sanFr(premier.san)} gagnait du matériel (${signe(meilleur.bilan)})${suite}`,
      cases: [premier.from, premier.to],
    });
  }
  return signaux;
}

// ── Garde-fou ────────────────────────────────────────────────────────────────────────────────

// Une gaffe n'est interceptée qu'une fois par coup : le second essai est joué quoi qu'il arrive.
export function doitIntercepter(retour, { gardeFou, dejaIntercepte }) {
  return Boolean(gardeFou) && !dejaIntercepte && retour.verdict === 'gaffe';
}

// Ce que dit le garde-fou : la catégorie de l'erreur, jamais le coup.
export function indiceGardeFou(retour) {
  const types = new Set(retour.signaux.map(s => s.type));
  if (types.has('menace')) return 'Une menace adverse n’est pas parée.';
  if (types.has('mat-concede')) return 'Ce coup permet un mat.';
  if (types.has('materiel')) return 'Du matériel reste en prise.';
  if (types.has('mat-manque')) return 'Tu as un mat.';
  if (types.has('gain-manque')) return 'Il y a du matériel à gagner.';
  return 'Ce coup abîme nettement ta position.';
}
