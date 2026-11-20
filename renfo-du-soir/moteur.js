// Renfo du soir — le moteur : logique pure, sans DOM ni stockage (testée dans tests/moteur.test.mjs).
//
// - le soir : un « jour » commence à 4 h, une séance finie à 0 h 30 compte pour la veille ;
// - la zone du soir suit le cycle haut → bas → gainage à partir de la dernière séance faite, pas du
//   calendrier : un soir sauté ne fait pas sauter une zone ;
// - la séance : 2 min d'échauffement, un circuit de 5 exercices (3 tours, ou 1 pour la version
//   courte), 2 min de retour au calme ;
// - la progression : un ressenti noté une fois, à la fin (facile / ok / dur), fait monter ou descendre
//   les exercices de 5 s ; un exercice peut être noté à part. Passer à la variante plus dure se
//   propose (`pret`) et ne se fait que sur un « oui » ; redescendre d'une variante reste automatique ;
// - la série : un soir tenu = une séance d'au moins un tour ; un joker par semaine couvre un soir manqué.

import { CYCLE, CIRCUITS, FAMILLES, ECHAUFFEMENT, RETOUR_AU_CALME, ETAPES_FIXES } from './exercices.js';

export const EFFORT = { min: 35, max: 50, pas: 5, depart: 40 };
export const REPOS = 20;          // entre deux exercices
export const REPOS_TOUR = 40;     // entre deux tours
export const FIXE = 30;           // chaque mouvement d'échauffement et de retour au calme
export const PRET = 5;            // compte à rebours avant le premier mouvement
export const TOURS = { complete: 3, courte: 1 };
export const HEURE_DU_JOUR = 4;   // avant 4 h, on est encore « hier soir »
export const CRANS_PAR_VARIANTE = (EFFORT.max - EFFORT.min) / EFFORT.pas + 1;   // 35, 40, 45, 50

// ── Dates ────────────────────────────────────────────────────────────────────

const deux = n => String(n).padStart(2, '0');
const texteJour = d => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
const versDate = jour => { const [a, m, j] = jour.split('-').map(Number); return new Date(a, m - 1, j, 12); };

/** Le soir auquel appartient un instant (heure locale) : avant 4 h, c'est encore la veille. */
export function jourDe(date) {
  return texteJour(new Date(date.getTime() - HEURE_DU_JOUR * 3600e3));
}

export function ajouterJours(jour, n) {
  const d = versDate(jour);
  d.setDate(d.getDate() + n);
  return texteJour(d);
}

/** Le lundi de la semaine d'un jour : la clé du joker hebdomadaire. */
export function lundiDe(jour) {
  const d = versDate(jour);
  return ajouterJours(jour, -((d.getDay() + 6) % 7));
}

// ── Niveaux et progression ───────────────────────────────────────────────────

export function niveauInitial(id) {
  return { v: FAMILLES[id].depart, s: EFFORT.depart, sens: null, n: 0 };
}

export function niveauDe(niveaux, id) {
  return niveaux?.[id] ? { ...niveaux[id] } : niveauInitial(id);
}

/** La place d'un niveau sur l'échelle : un cran par palier de 5 s, 4 crans par variante. */
export function position(niv) {
  return niv.v * CRANS_PAR_VARIANTE + (niv.s - EFFORT.min) / EFFORT.pas;
}

/** Le niveau depuis une place sur l'échelle (inverse de `position`). */
function depuisPosition(p, garde) {
  return { v: Math.floor(p / CRANS_PAR_VARIANTE), s: EFFORT.min + (p % CRANS_PAR_VARIANTE) * EFFORT.pas, ...garde };
}

/**
 * Le niveau après un ressenti. Deux « facile » de suite : +5 s ; à 50 s, la variante suivante est
 * proposée (`pret: true`), jamais imposée — une note unique pour 5 exercices ne suffit pas à juger
 * qu'on est prêt pour des pompes négatives. Deux « dur » de suite : un cran plus bas, variante
 * précédente comprise. « ok » remet le compteur à zéro. Aux deux bouts de l'échelle, on reste.
 */
export function ajuster(niv, ressenti, nbVariantes) {
  if (ressenti !== 'facile' && ressenti !== 'dur') return { ...niv, sens: null, n: 0 };
  const n = niv.sens === ressenti ? niv.n + 1 : 1;
  if (n < 2) return { ...niv, sens: ressenti, n };
  const p = position(niv) + (ressenti === 'facile' ? 1 : -1);
  const max = nbVariantes * CRANS_PAR_VARIANTE - 1;
  if (p < 0 || p > max) return { ...niv, sens: null, n: 0 };
  if (ressenti === 'facile' && niv.s === EFFORT.max) return { ...niv, sens: null, n: 0, pret: true };
  return depuisPosition(p, { sens: null, n: 0 });
}

/** La variante suivante, acceptée : on y entre à 35 s. */
export function passerVariante(niv, nbVariantes) {
  if (niv.v >= nbVariantes - 1) return { ...niv, pret: false };
  return { v: niv.v + 1, s: EFFORT.min, sens: null, n: 0 };
}

/** Où en est un exercice : 'sommet' en haut de l'échelle, 'pied' en bas, sinon null. */
export function bout(niv, nbVariantes) {
  const p = position(niv);
  if (p >= nbVariantes * CRANS_PAR_VARIANTE - 1) return 'sommet';
  if (p <= 0) return 'pied';
  return null;
}

/** Le niveau global : la somme des places de tous les exercices (la courbe de progression). */
export function niveauGlobal(niveaux) {
  return Object.keys(FAMILLES).reduce((s, id) => s + position(niveauDe(niveaux, id)), 0);
}

// ── La séance ────────────────────────────────────────────────────────────────

export function zoneDuSoir(seances) {
  const derniere = [...(seances || [])].reverse().find(s => s.tours > 0);
  if (!derniere) return CYCLE[0];
  return CYCLE[(CYCLE.indexOf(derniere.zone) + 1) % CYCLE.length];
}

/**
 * Les étapes de la séance, dans l'ordre. Chaque étape : { phase, id, secondes, … }.
 * `phase` : 'pret' | 'echauffement' | 'effort' | 'repos' | 'calme'. Rien n'est demandé pendant la
 * séance : le ressenti se donne une fois, à la fin.
 */
export function construireSeance({ zone, format = 'complete', niveaux = {} }) {
  const tours = TOURS[format];
  const circuit = CIRCUITS[zone];
  const etapes = [{ phase: 'pret', secondes: PRET }];
  const echauffement = ECHAUFFEMENT[zone];
  const calme = RETOUR_AU_CALME[zone];
  etapes[0].suivant = echauffement[0];
  echauffement.forEach((id, i) => etapes.push({
    phase: 'echauffement', id, secondes: FIXE, mi: ETAPES_FIXES[id].mi || null,
    suivant: echauffement[i + 1] || circuit[0],
  }));
  for (let tour = 1; tour <= tours; tour++) {
    circuit.forEach((id, i) => {
      const niv = niveauDe(niveaux, id);
      const f = FAMILLES[id];
      etapes.push({
        phase: 'effort', id, tour, tours, rang: i + 1, secondes: niv.s,
        variante: f.variantes[niv.v], mi: f.unilateral ? 'Change de côté' : f.voix,
      });
      const dernierDuTour = i === circuit.length - 1;
      const dernierTour = tour === tours;
      if (dernierDuTour && dernierTour) return;   // le retour au calme enchaîne directement
      etapes.push({
        phase: 'repos', secondes: dernierDuTour ? REPOS_TOUR : REPOS, finDeTour: dernierDuTour ? tour : null,
        suivant: dernierDuTour ? circuit[0] : circuit[i + 1],
      });
    });
  }
  calme.forEach((id, i) => etapes.push({
    phase: 'calme', id, secondes: FIXE, mi: ETAPES_FIXES[id].mi || null,
    suivant: calme[i + 1] || null,
  }));
  return { zone, format, tours, circuit, etapes };
}

export const duree = seance => seance.etapes.reduce((s, e) => s + e.secondes, 0);

/** Les tours entièrement faits quand on s'arrête à l'étape `index` (exclue). */
export function toursFaits(seance, index) {
  return seance.etapes.slice(0, index).filter(e => e.phase === 'effort' && e.rang === seance.circuit.length).length;
}

// ── Enregistrer une séance ───────────────────────────────────────────────────

export function etatVide() {
  return { version: 1, seances: [], niveaux: {} };
}

/** Les ressentis par exercice : la note de la séance, sauf pour les exercices notés à part. */
export function ressentisDe(zone, global = 'ok', aPart = {}) {
  return Object.fromEntries(CIRCUITS[zone].map(id => [id, aPart[id] || global]));
}

/**
 * L'état après une séance. Sans tour complet, rien n'est enregistré : le soir n'est pas tenu.
 * Les ressentis manquants valent « ok ». Une séance complète arrêtée après 1 ou 2 tours compte
 * comme une version courte.
 */
export function enregistrer(etat, { zone, format, tours, ressentis = {}, debut, fin }) {
  if (!tours) return etat;
  const niveaux = { ...etat.niveaux };
  for (const id of CIRCUITS[zone]) {
    niveaux[id] = ajuster(niveauDe(niveaux, id), ressentis[id] || 'ok', FAMILLES[id].variantes.length);
  }
  const seance = {
    jour: jourDe(new Date(fin)), debut, fin, zone,
    format: format === 'complete' && tours >= TOURS.complete ? 'complete' : 'courte',
    tours, ressentis: Object.fromEntries(CIRCUITS[zone].map(id => [id, ressentis[id] || 'ok'])),
    niveauGlobal: niveauGlobal(niveaux),
  };
  return { ...etat, seances: [...etat.seances, seance], niveaux };
}

// ── La série de soirs ────────────────────────────────────────────────────────

/**
 * Les soirs couverts par un joker : dans chaque semaine (lundi → dimanche), le premier soir manqué
 * entre la première séance et hier. Aujourd'hui n'est jamais manqué : la soirée n'est pas finie.
 */
export function jokers(jours, aujourdhui) {
  const faits = new Set(jours);
  const couverts = new Set();
  if (!faits.size) return couverts;
  const premier = [...faits].sort()[0];
  const semainesPrises = new Set();
  for (let j = premier; j < aujourdhui; j = ajouterJours(j, 1)) {
    if (faits.has(j)) continue;
    const semaine = lundiDe(j);
    if (semainesPrises.has(semaine)) continue;
    semainesPrises.add(semaine);
    couverts.add(j);
  }
  return couverts;
}

/** La série en cours : soirs tenus d'affilée (les jokers ne cassent pas la série sans la grossir). */
export function serie(jours, aujourdhui) {
  const faits = new Set(jours);
  const couverts = jokers(jours, aujourdhui);
  const faitAujourdhui = faits.has(aujourdhui);
  let soirs = 0;
  let jokersUtilises = 0;
  for (let j = faitAujourdhui ? aujourdhui : ajouterJours(aujourdhui, -1); ; j = ajouterJours(j, -1)) {
    if (faits.has(j)) soirs++;
    else if (couverts.has(j)) jokersUtilises++;
    else break;
  }
  const semaine = lundiDe(aujourdhui);
  const jokerDispo = ![...couverts].some(j => lundiDe(j) === semaine);
  return { soirs, jokers: jokersUtilises, faitAujourdhui, jokerDispo };
}

// ── Le suivi ─────────────────────────────────────────────────────────────────

/** Le calendrier d'un mois : semaines de lundi à dimanche, chaque case { jour, etat, zone }. */
export function calendrier(annee, mois, seances, aujourdhui) {
  const parJour = new Map(seances.map(s => [s.jour, s]));
  const couverts = jokers([...parJour.keys()], aujourdhui);
  const debut = [...parJour.keys()].sort()[0] || aujourdhui;
  const premier = `${annee}-${deux(mois)}-01`;
  let j = lundiDe(premier);
  const semaines = [];
  do {
    const semaine = [];
    for (let i = 0; i < 7; i++, j = ajouterJours(j, 1)) {
      const s = parJour.get(j);
      const etat = j.slice(0, 7) !== premier.slice(0, 7) ? 'hors'
        : s ? 'fait' : couverts.has(j) ? 'joker' : j > aujourdhui ? 'futur' : j === aujourdhui ? 'ce-soir'
          : j < debut ? 'avant' : 'manque';
      semaine.push({ jour: j, etat, zone: s?.zone || null });
    }
    semaines.push(semaine);
  } while (j.slice(0, 7) === premier.slice(0, 7));
  return semaines;
}

/** Les points de la courbe : le niveau global après chaque séance (un point par soir, le dernier). */
export function courbe(seances) {
  const parJour = new Map();
  for (const s of seances) parJour.set(s.jour, s.niveauGlobal);
  return [...parJour].map(([jour, niveau]) => ({ jour, niveau }));
}

// ── Sauvegarde ───────────────────────────────────────────────────────────────

/** Vérifie un état importé ; renvoie l'état propre, ou lève une erreur lisible. */
export function valider(brut) {
  if (!brut || brut.version !== 1 || !Array.isArray(brut.seances) || typeof brut.niveaux !== 'object') {
    throw new Error('Ce fichier n’est pas une sauvegarde de Renfo du soir.');
  }
  const niveaux = {};
  for (const [id, n] of Object.entries(brut.niveaux || {})) {
    const f = FAMILLES[id];
    if (!f) continue;
    const s = Number(n.s);
    const v = Number(n.v);
    if (!(v >= 0 && v < f.variantes.length && s >= EFFORT.min && s <= EFFORT.max && (s - EFFORT.min) % EFFORT.pas === 0)) {
      throw new Error(`Niveau illisible pour « ${f.nom} ».`);
    }
    niveaux[id] = { v, s, sens: n.sens === 'facile' || n.sens === 'dur' ? n.sens : null, n: Number(n.n) || 0 };
    if (n.pret === true) niveaux[id].pret = true;
  }
  const seances = brut.seances.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s?.jour) && CYCLE.includes(s.zone) && s.tours > 0);
  return { version: 1, seances, niveaux };
}
