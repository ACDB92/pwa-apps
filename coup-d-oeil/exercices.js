// Les exercices : tes propres gaffes, reprises en positions à résoudre, et revues à intervalles
// croissants. Logique pure, sans DOM ni moteur : on lui passe les retours de l'analyste (une partie
// jouée ici, relue depuis chess.com, ou analysée hors de l'app par outils/exercices.mjs), il rend
// des exercices ; on lui passe une réponse, il dit si elle est juste et quand revoir la position.
//
// Pourquoi ces exercices-là : sur 225 parties relues (septembre 2026), deux tiers des gaffes sont
// défensives — une pièce laissée en prise, une menace ignorée, un mat — et la prise qui punit
// arrive en diagonale une fois sur deux. Les puzzles habituels entraînent à trouver *son* coup
// gagnant ; ici on entraîne à voir *la réponse adverse*. D'où l'exercice principal, « punition » :
// tu viens de jouer ton coup, trouve ce que l'adversaire joue. Un exercice sur quatre environ est
// un coup sûr — la réponse est alors « rien à craindre » —, sinon il y aurait toujours un piège.
//
// Une collection a vocation à grandir : de nouvelles parties ajoutent des positions, de nouveaux
// types d'exercice s'ajoutent à TYPES. Rien ne sort jamais de la rotation : une position maîtrisée
// revient à long intervalle, et se rejoue à volonté.

import { Chess } from './vendor/chess.js';
import { winPct, sanFr, AUSSI_BON } from './coach.js';

export const VERSION = 1;

export const TYPES = {
  punition: 'Qu’est-ce qui te punit ?',
  cadeau: 'Encaisse le cadeau',
};

// Familles, dans l'ordre d'affichage : ce qui t'a coûté des parties d'abord.
export const FAMILLES = {
  materiel: 'Pièce en prise',
  menace: 'Menace non parée',
  mat: 'Mat subi',
  sur: 'Coup sûr',
  gain: 'Gain manqué',
  'mat-manque': 'Mat manqué',
};

export const TRAJECTOIRES = { diagonale: 'en diagonale', saut: 'en saut de cavalier', ligne: 'en ligne droite', pion: 'par un pion', roi: 'par le roi' };

const BONS = ['meilleur', 'excellent', 'bon'];
const FAUTES = ['erreur', 'gaffe'];
const VALEURS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const versObjet = uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
const numero = demiCoup => `${Math.ceil(demiCoup / 2)}${demiCoup % 2 ? '.' : '…'}`;

// ── Construire les exercices d'une partie ────────────────────────────────────────────────────

// Comment arrive le coup : la trajectoire de la pièce qui le joue.
export function trajectoire(fen, uci) {
  const piece = new Chess(fen).get(uci.slice(0, 2));
  if (!piece) return null;
  if (piece.type === 'n') return 'saut';
  if (piece.type === 'p') return 'pion';
  if (piece.type === 'k') return 'roi';
  const df = Math.abs(uci.charCodeAt(2) - uci.charCodeAt(0));
  const dr = Math.abs(Number(uci[3]) - Number(uci[1]));
  return df === dr ? 'diagonale' : 'ligne';
}

// Le mécanisme d'une faute. coach.js le nomme quand il le peut ; sinon l'explication le dit souvent
// (« tombe », « était attaqué et le reste »). Null : rien de concret à faire trouver.
export function familleDe(retour) {
  const types = new Set(retour.signaux.map(s => s.type));
  const menace = retour.signaux.find(s => s.type === 'menace');
  const raisons = (retour.explication?.raisons ?? []).map(r => r.texte ?? '').join(' ');
  if (types.has('mat-concede') || menace?.mat || /permet un mat|fait mat/.test(raisons)) return 'mat';
  if (menace || /était attaquée? et l[ea] reste/.test(raisons)) return 'menace';
  if (types.has('materiel') || /tombe :/.test(raisons)) return 'materiel';
  if (types.has('mat-manque')) return 'mat-manque';
  if (types.has('gain-manque')) return 'gain';
  return null;
}

// Combien de fois la case d'arrivée de ton coup est attaquée et défendue, juste après lui.
function surete(fenAvant, uci) {
  const pos = new Chess(fenAvant);
  const coup = pos.move(versObjet(uci));
  return { attaques: pos.attackers(coup.to, pos.turn()).length, defenses: pos.attackers(coup.to, coup.color).length, fen: pos.fen() };
}

// Un exercice est une position et un coup, pas une partie : la même gaffe refaite dans une autre partie
// (ou relue une seconde fois) ne fait pas un second exercice. Les compteurs de coups ne comptent pas.
export const idDe = (fenAvant, coup, gardeFou = false) => `${fenAvant.split(' ').slice(0, 4).join(' ')}|${coup}${gardeFou ? '|garde-fou' : ''}`;

const explicationDe = r => ({
  raisons: (r.explication?.raisons ?? []).map(c => c.texte).filter(Boolean),
  alternative: r.explication?.alternative
    ? { titre: r.explication.alternative.titre, raisons: r.explication.alternative.raisons.map(c => c.texte).filter(Boolean) }
    : null,
});

/**
 * Les exercices tirés des retours d'une partie. `partie` identifie la partie (uuid chess.com, ou
 * identifiant local) ; `pgn`, s'il est fourni, donne le coup adverse qui précède chaque position.
 * Tes erreurs et gaffes deviennent des exercices ; un coup sûr posé sur une case attaquée — au plus un
 * par partie, le plus inquiétant en apparence — sert de contrôle. Les gaffes rattrapées par le garde-fou
 * (`interceptee`) comptent aussi : ce sont celles que tu allais jouer.
 */
export function exercicesDePartie({ partie, origine, url = null, fin = null, adversaire = null, couleur, retours, pgn = null }) {
  const historique = [];
  if (pgn) {
    const lecture = new Chess();
    lecture.loadPgn(pgn);
    historique.push(...lecture.history({ verbose: true }));
  }
  const precedent = demiCoup => {
    const c = historique[demiCoup - 2];
    return c ? { uci: c.from + c.to + (c.promotion ?? ''), san: sanFr(c.san), numero: numero(demiCoup - 1) } : null;
  };
  const source = { origine, partie, url, fin, adversaire };
  const exercices = [];
  const surs = [];

  const juges = retours.flatMap(r => [r, r.interceptee ? { ...r.interceptee, fenAvant: r.fenAvant, demiCoup: r.demiCoup, gardeFou: true } : null]).filter(Boolean);
  for (const r of juges) {
    if (r.force || !r.verdict || !r.fenAvant) continue;
    const base = {
      id: idDe(r.fenAvant, r.coup, r.gardeFou),
      couleur, verdict: r.verdict, fenAvant: r.fenAvant, coup: r.coup, san: r.san, numero: numero(r.demiCoup),
      precedent: precedent(r.demiCoup), winAvant: r.winMeilleur, winApres: r.winJoue,
      signaux: r.signaux.map(sig => sig.texte),   // le mécanisme nommé par coach.js, dit en premier
      meilleur: r.alternatives?.[0]?.uci ?? null, source: { ...source, gardeFou: Boolean(r.gardeFou) },
    };

    if (FAUTES.includes(r.verdict)) {
      const famille = familleDe(r);
      const reponse = r.refutation?.[0];
      if (['materiel', 'menace', 'mat'].includes(famille) && reponse) {
        const apres = surete(r.fenAvant, r.coup).fen;
        exercices.push({
          ...base, type: 'punition', famille, fen: apres, attendus: [reponse.uci],
          suite: r.refutation.slice(0, 6).map(c => c.uci), trajectoire: trajectoire(apres, reponse.uci), ...explicationDe(r),
        });
      } else if (['gain', 'mat-manque'].includes(famille) && base.meilleur) {
        const bonne = r.alternatives[0].variante ?? [];
        exercices.push({
          ...base, type: 'cadeau', famille, fen: r.fenAvant, attendus: r.alternatives.map(a => a.uci),
          suite: bonne.slice(0, 6).map(c => c.uci), trajectoire: trajectoire(r.fenAvant, base.meilleur), ...explicationDe(r),
        });
      }
    } else if (BONS.includes(r.verdict) && !r.gardeFou) {
      const { attaques, defenses, fen } = surete(r.fenAvant, r.coup);
      if (attaques > 0) surs.push({ r, base, attaques, defenses, fen });
    }
  }

  // Le contrôle : le coup sûr qui a l'air le plus risqué — le plus d'attaquants par rapport aux défenseurs.
  const [sur] = surs.sort((a, b) => (b.attaques - b.defenses) - (a.attaques - a.defenses) || a.r.demiCoup - b.r.demiCoup);
  if (sur) {
    exercices.push({
      ...sur.base, type: 'punition', famille: 'sur', fen: sur.fen, attendus: [],
      suite: (sur.r.refutation ?? []).slice(0, 6).map(c => c.uci), trajectoire: null,
      surete: { attaques: sur.attaques, defenses: sur.defenses }, ...explicationDe(sur.r),
    });
  }
  return exercices;
}

// Ce qu'on garde d'une partie pour suivre les progrès : ses gaffes et erreurs, à ton compte.
export function resumePartie({ retours, fin = null, origine, cadence = null }) {
  const compte = v => retours.filter(r => r.verdict === v).length;
  return { fin, origine, cadence, coups: retours.filter(r => r.verdict).length, gaffes: compte('gaffe'), erreurs: compte('erreur') };
}

// ── La collection ────────────────────────────────────────────────────────────────────────────

export const collectionVide = () => ({ version: VERSION, exercices: {}, parties: {} });

const suiviVide = () => ({ boite: 0, prochaine: null, essais: [] });

// Ajoute des exercices. Un exercice déjà là prend le contenu de la dernière analyse — une explication
// enrichie, un champ nouveau — mais garde son suivi : ton calendrier n'est jamais touché. Rend le
// nombre de positions vraiment nouvelles.
export function ajouter(collection, exercices, maintenant) {
  let n = 0;
  for (const ex of exercices) {
    const existant = collection.exercices[ex.id];
    collection.exercices[ex.id] = { ...ex, cree: existant?.cree ?? maintenant, suivi: existant?.suivi ?? suiviVide() };
    if (!existant) n++;
  }
  return n;
}

// Une partie déjà dépouillée ne l'est pas deux fois : son résumé la marque.
export function marquerPartie(collection, partie, resume) {
  collection.parties[partie] ??= resume;
}

// Fusionne un paquet venu d'ailleurs (le fichier généré hors de l'app). Ton suivi local l'emporte.
export function fusionner(collection, paquet, maintenant) {
  const ajoutes = ajouter(collection, paquet.exercices ?? [], maintenant);
  for (const [partie, resume] of Object.entries(paquet.parties ?? {})) marquerPartie(collection, partie, resume);
  return ajoutes;
}

// ── Revoir à intervalles croissants ──────────────────────────────────────────────────────────
//
// Boîtes de Leitner. Juste : boîte suivante, intervalle plus long. Faux : retour en boîte 1, demain.
// Maîtrisé dès la boîte 4 — trois réussites espacées sur au moins onze jours —, mais jamais retiré :
// une position maîtrisée revient tous les 35 puis 60 jours, et se rejoue à volonté.

export const JOUR = 86_400_000;
export const INTERVALLES = [0, 1, 3, 7, 16, 35, 60];   // jours, par boîte
export const BOITE_MAITRISE = 4;
export const TAILLE_SEANCE = 10;

// Le début du jour, n jours plus tard : une position due « demain » l'est dès minuit.
function jourPlus(maintenant, n) {
  const d = new Date(maintenant);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function etatDe(ex) {
  if (!ex.suivi.essais.length) return 'nouveau';
  return ex.suivi.boite >= BOITE_MAITRISE ? 'maitrise' : 'en-cours';
}

/**
 * Le suivi après une réponse. `libre` : hors calendrier — une révision choisie, ou la seconde chance en
 * fin de séance. Une réussite libre ne fait pas avancer (sinon on raccourcirait le chemin vers
 * « maîtrisé » en rejouant la même position dix fois) ; un échec, si : si tu ne la vois plus, elle revient.
 */
export function noter(suivi, { ok, ms = null, maintenant, libre = false }) {
  const essais = [...suivi.essais, { t: maintenant, ok, ms, ...(libre ? { libre: true } : {}) }];
  if (!ok) return { boite: 1, prochaine: jourPlus(maintenant, INTERVALLES[1]), essais };
  if (libre && suivi.boite > 0) return { ...suivi, essais };
  const boite = Math.min(suivi.boite + 1, INTERVALLES.length - 1);
  return { boite, prochaine: jourPlus(maintenant, INTERVALLES[boite]), essais };
}

const dernierEssai = ex => ex.suivi.essais.at(-1)?.t ?? 0;
const ORDRE_TRAJECTOIRE = { diagonale: 0, saut: 1 };

// L'ordre des nouveautés : les gaffes avant les erreurs, puis ce qui arrive en diagonale — ton angle
// mort —, puis en saut de cavalier, puis les plus récentes.
function priorite(a, b) {
  return (a.verdict === 'gaffe' ? 0 : 1) - (b.verdict === 'gaffe' ? 0 : 1)
    || (ORDRE_TRAJECTOIRE[a.trajectoire] ?? 2) - (ORDRE_TRAJECTOIRE[b.trajectoire] ?? 2)
    || (b.source.fin ?? 0) - (a.source.fin ?? 0);
}

function melanger(liste, hasard) {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

export const aRevoir = (collection, maintenant) => Object.values(collection.exercices)
  .filter(ex => ex.suivi.prochaine !== null && ex.suivi.prochaine <= maintenant)
  .sort((a, b) => a.suivi.prochaine - b.suivi.prochaine);

/**
 * La séance du jour : ce qui est dû d'abord, le plus en retard en tête, puis des nouveautés pour
 * compléter — environ une sur quatre est un coup sûr. Mélangée, pour que l'ordre ne trahisse rien.
 */
export function seance(collection, { maintenant, taille = TAILLE_SEANCE, hasard = Math.random } = {}) {
  const dus = aRevoir(collection, maintenant).slice(0, taille);
  const nouveaux = Object.values(collection.exercices).filter(ex => etatDe(ex) === 'nouveau');
  const place = taille - dus.length;
  const surs = nouveaux.filter(ex => ex.famille === 'sur').sort((a, b) => (b.source.fin ?? 0) - (a.source.fin ?? 0));
  const autres = nouveaux.filter(ex => ex.famille !== 'sur').sort(priorite);
  const nbSurs = Math.min(surs.length, Math.round(place / 4));
  const choisis = [...autres.slice(0, place - nbSurs), ...surs.slice(0, nbSurs)];
  const complement = choisis.length < place ? surs.slice(nbSurs, nbSurs + place - choisis.length) : [];
  return melanger([...dus, ...choisis, ...complement], hasard);
}

/**
 * Une révision choisie, hors calendrier : parmi `filtre`, ce que tu as vu il y a le plus longtemps.
 * C'est par là que les positions maîtrisées se rejouent à volonté.
 */
export function revisionLibre(collection, { filtre = () => true, taille = TAILLE_SEANCE, hasard = Math.random } = {}) {
  const choix = Object.values(collection.exercices).filter(filtre).sort((a, b) => dernierEssai(a) - dernierEssai(b));
  return melanger(choix.slice(0, taille), hasard);
}

// ── Vérifier une réponse ─────────────────────────────────────────────────────────────────────

/**
 * `reponse` : 'rien', ou un coup UCI joué depuis `ex.fen`. Rend { ok } quand la réponse est connue,
 * { ok: null } quand il faut demander au moteur — un autre coup peut punir aussi bien.
 */
export function verifier(ex, reponse) {
  if (ex.famille === 'sur') return { ok: reponse === 'rien' };
  if (reponse === 'rien') return { ok: false };
  if (ex.attendus.includes(reponse)) return { ok: true };
  return { ok: null };
}

/**
 * Le moteur a évalué un autre coup, `score` du point de vue du camp au trait dans `ex.fen`.
 * Punition : le coup adverse doit te coûter au moins 60 % de ce qu'a coûté ta faute — une réponse
 * qui gagne moins que la vraie punition ne l'a pas trouvée. Cadeau : ton coup doit valoir, à
 * AUSSI_BON près, le meilleur.
 */
export function accepteParMoteur(ex, score) {
  if (ex.type === 'punition') {
    const toi = 100 - winPct(score);
    return ex.winAvant - toi >= 0.6 * (ex.winAvant - ex.winApres);
  }
  return winPct(score) >= ex.winAvant - AUSSI_BON;
}

// ── Lire un exercice ─────────────────────────────────────────────────────────────────────────

// Une suite UCI en coups lisibles, avec la position après chacun : de quoi la dérouler sur l'échiquier.
export function derouler(fen, ucis) {
  const pos = new Chess(fen);
  const coups = [];
  for (const uci of ucis) {
    let c = null;
    try { c = pos.move(versObjet(uci)); } catch { /* coup illégal : la suite s'arrête là */ }
    if (!c) break;
    coups.push({ uci, san: (c.color === 'b' ? '…' : '') + sanFr(c.san), fen: pos.fen(), couleur: c.color });
  }
  return coups;
}

export const sanDe = (fen, uci) => derouler(fen, [uci])[0]?.san ?? uci;

// La phrase d'un coup sûr : la pièce posée sur une case attaquée, et pourquoi elle ne tombe pas —
// quand le compte suffit à le dire. Sinon la raison est plus loin, et la phrase renvoie à la suite.
export function phraseSurete(ex) {
  const { attaques, defenses } = ex.surete;
  const fois = n => (n === 1 ? 'une fois' : n === 2 ? 'deux fois' : `${n} fois`);
  const pos = new Chess(ex.fen);
  const cible = ex.coup.slice(2, 4);
  const piece = pos.get(cible);
  const nom = { p: 'Ton pion', n: 'Ton cavalier', b: 'Ton fou', r: 'Ta tour', q: 'Ta dame' }[piece.type];
  const e = ['r', 'q'].includes(piece.type) ? 'e' : '';
  const moinsCher = pos.attackers(cible, pos.turn()).some(sq => VALEURS[pos.get(sq).type] < VALEURS[piece.type]);
  const suffit = defenses >= attaques && !moinsCher;
  return `${nom} ${cible} est attaqué${e} ${fois(attaques)}, ${defenses ? `défendu${e} ${fois(defenses)}` : 'sans défense'}`
    + (suffit ? ' : le prendre ne rapporte rien.' : ' : Stockfish le juge pourtant sûr, regarde la suite.');
}

// ── Suivre les progrès ───────────────────────────────────────────────────────────────────────

// Le lundi de la semaine d'un instant, à minuit.
function lundi(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// Gaffes par partie, semaine par semaine : l'indicateur qui compte, avant le classement.
export function progresParSemaine(collection) {
  const semaines = new Map();
  for (const p of Object.values(collection.parties)) {
    if (!p.fin) continue;
    const s = lundi(p.fin);
    const acc = semaines.get(s) ?? { semaine: s, parties: 0, gaffes: 0, erreurs: 0 };
    acc.parties++;
    acc.gaffes += p.gaffes;
    acc.erreurs += p.erreurs;
    semaines.set(s, acc);
  }
  return [...semaines.values()].sort((a, b) => a.semaine - b.semaine).map(s => ({ ...s, parPartie: s.gaffes / s.parties }));
}

// Le tableau de la collection : par famille, combien de nouveaux, en cours, maîtrisés.
export function tableau(collection) {
  const lignes = Object.fromEntries(Object.keys(FAMILLES).map(f => [f, { famille: f, total: 0, nouveau: 0, 'en-cours': 0, maitrise: 0 }]));
  for (const ex of Object.values(collection.exercices)) {
    const l = lignes[ex.famille];
    if (!l) continue;
    l.total++;
    l[etatDe(ex)]++;
  }
  return Object.values(lignes).filter(l => l.total);
}
