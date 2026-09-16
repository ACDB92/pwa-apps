// L'analyste : ce qu'il faut demander à Stockfish pour juger un coup, dans quel ordre et à quelle
// profondeur. Relie le moteur (uci.js) au juge (coach.js) et aux explications (explication.js) ;
// l'app et les tests passent par ici.

import { Chess } from './vendor/chess.js';
import { evaluerCoup, ligneDuCoup, lignesJouables, fenCoupNul } from './coach.js';
import { expliquer } from './explication.js';

export const PROFONDEUR = 16;         // pré-analyse de la position, pendant que tu réfléchis
export const PROFONDEUR_MIN = 12;     // en deçà, on laisse l'analyse finir avant de juger
export const PROFONDEUR_MENACE = 10;  // « si tu passais ton tour » : la menace, pour le signal et les explications
export const OPTIONS_ANALYSTE = { Threads: 1, Hash: 32, MultiPV: 3 };

// L'adversaire est une autre instance, bridée. Jamais l'analyste : son retour serait faux.
// De 1320 à 3190 : Stockfish 18 et son UCI_Elo (échelle CCRL Blitz, pas celle de chess.com), 1 s par coup.
// Sous 1320, le plus bas niveau de Stockfish ne suffit plus : Fairy-Stockfish, la variante des bots
// Lichess, dont les Skill Level négatifs se trompent exprès. Son Elo n'est pas donné, il est mesuré par
// des parties contre Stockfish 1320 réglé comme ici (tests/mesure-niveaux.mjs). Il y jouait à profondeur 5,
// et la recherche change la force : on le fait donc jouer comme on l'a mesuré.
export const TEMPS_ADVERSAIRE = 1000;   // ms par coup
export const STOCKFISH_ELO = { min: 1320, max: 3190 };
// Mesurés le 15 septembre 2026 (tests/mesure-niveaux.json : 6 600 parties d'échelle, 135 de pont). Seuls
// les niveaux séparés d'au moins 60 Elo sont proposés. Du plus fort au plus faible, Elo arrondi à 10 : la
// grille du curseur.
export const NIVEAUX_FAIRY = [
  { skill: -1, elo: 1130 },
  { skill: -2, elo: 1040 },
  { skill: -3, elo: 940 },
  { skill: -4, elo: 720 },
  { skill: -5, elo: 530 },
  { skill: -9, elo: 380 },
  { skill: -20, elo: 260 },   // le plancher
];
export const ELO = { min: NIVEAUX_FAIRY.at(-1).elo, max: STOCKFISH_ELO.max, defaut: 1800 };
export const OPTIONS_ADVERSAIRE = { Threads: 1, Hash: 16 };
export const OPTIONS_FAIRY = { Threads: 1, Hash: 16, 'Use NNUE': false };

// Les bots Lichess 1 à 3 : Fairy-Stockfish à Skill Level −9, −5 et −1, profondeur 5. Un repère connu.
export const NIVEAUX_LICHESS = { [-9]: 1, [-5]: 2, [-1]: 3 };

// Le niveau joué pour une valeur du curseur : Stockfish 18 dès 1320, sinon le niveau de Fairy-Stockfish
// le plus proche. `elo` est celui du niveau retenu : le curseur s'y cale.
export function niveau(elo) {
  const fairy = NIVEAUX_FAIRY.reduce((a, b) => (Math.abs(b.elo - elo) < Math.abs(a.elo - elo) ? b : a));
  if (elo >= STOCKFISH_ELO.min || STOCKFISH_ELO.min - elo < Math.abs(fairy.elo - elo)) {
    const e = Math.min(Math.max(elo, STOCKFISH_ELO.min), STOCKFISH_ELO.max);
    return {
      moteur: 'stockfish', elo: e, nom: `Stockfish ${e}`,
      options: { UCI_LimitStrength: true, UCI_Elo: e }, go: { movetime: TEMPS_ADVERSAIRE }, pause: 300,
    };
  }
  const lichess = NIVEAUX_LICHESS[fairy.skill];
  return {
    moteur: 'fairy', elo: fairy.elo, nom: `Fairy-Stockfish −${-fairy.skill}${lichess ? ` (Lichess niveau ${lichess})` : ''}`,
    options: { 'Skill Level': fairy.skill }, go: { depth: 5 }, pause: TEMPS_ADVERSAIRE,
  };
}

// ≈ classement chess.com rapide d'un niveau Stockfish. Une estimation, pas une mesure : personne n'a
// mesuré Stockfish bridé face aux joueurs de chess.com. Deux étapes, chacune sourcée :
//   1. moteur → humain : l'échelle des moteurs (CCRL) sous-estime leur force face aux humains ; on
//      reprend la correction usuelle FIDE ≈ 2800 − (2800 − Elo moteur) × 0,7 (TalkChess) ;
//   2. FIDE → chess.com rapide : enquête ChessGoals (juillet 2026, près de 20 000 joueurs), interpolée.
// Arrondi à 50 : la précision n'est de toute façon pas meilleure.
const FIDE_VERS_RAPIDE = [[1740, 1655], [1965, 1995], [2245, 2260], [2485, 2430]];

export function eloChessCom(eloMoteur) {
  const fide = 2800 - (2800 - eloMoteur) * 0.7;
  let i = FIDE_VERS_RAPIDE.findIndex(([f]) => f >= fide);
  if (i === -1) i = FIDE_VERS_RAPIDE.length - 1;
  i = Math.max(1, i);
  const [[f0, r0], [f1, r1]] = [FIDE_VERS_RAPIDE[i - 1], FIDE_VERS_RAPIDE[i]];
  return Math.round((r0 + ((fide - f0) * (r1 - r0)) / (f1 - f0)) / 50) * 50;
}

/**
 * Juge `coup` joué dans `fen`. `analyse` est le résultat de la pré-analyse de `fen` s'il existe
 * déjà ; sinon on la lance. Le coup joué est évalué sur la même position de départ et à la même
 * profondeur que les meilleures lignes : sans quoi la comparaison n'est pas honnête.
 */
// Les lignes du moteur pour cette position, débarrassées de celles qui viennent d'ailleurs. S'il ne
// reste rien, on relance la recherche : juger sur la ligne d'une autre position fausserait le verdict.
async function lignesPour(moteur, fen, limites, analyse = null) {
  const lignes = lignesJouables(fen, (analyse ?? await moteur.analyser(fen, limites)).lignes);
  return lignes.length ? lignes : lignesJouables(fen, (await moteur.analyser(fen, limites)).lignes);
}

export async function jugerCoup(moteur, { fen, coup, analyse = null, profondeur = PROFONDEUR }) {
  const lignes = await lignesPour(moteur, fen, { depth: profondeur }, analyse);
  const ligneJouee = ligneDuCoup(lignes, coup)
    ?? (await lignesPour(moteur, fen, { depth: lignes[0]?.depth ?? profondeur, searchmoves: [coup] }))[0];
  const menace = new Chess(fen).isCheck()
    ? null
    : (await lignesPour(moteur, fenCoupNul(fen), { depth: PROFONDEUR_MENACE }))[0] ?? null;
  const retour = evaluerCoup({ fen, coup, lignes, ligneJouee, menace });
  try {
    retour.explication = expliquer({ fen, coup, lignes, ligneJouee, menace, retour });
  } catch (erreur) {
    console.error('explication impossible', erreur);   // le verdict reste : l'explication est un plus
    retour.explication = null;
  }
  return retour;
}

export const PROFONDEUR_RAPIDE = 12;   // passe de repérage sur tous tes coups d'une partie relue
export const PERTE_A_REVOIR = 3;       // en deçà, le coup est sain : la passe rapide suffit

// Juge sans chercher la menace ni rédiger : on ne veut que la perte, pour savoir quoi regarder de près.
async function jugerVite(moteur, { fen, coup, profondeur }) {
  const lignes = await lignesPour(moteur, fen, { depth: profondeur });
  const ligneJouee = ligneDuCoup(lignes, coup)
    ?? (await lignesPour(moteur, fen, { depth: lignes[0]?.depth ?? profondeur, searchmoves: [coup] }))[0];
  return evaluerCoup({ fen, coup, lignes, ligneJouee, menace: null });
}

/**
 * Relit une partie déjà jouée et juge **tes** coups. Deux passes : une rapide sur tous, puis l'analyse
 * complète — même profondeur qu'en jeu — sur ceux qui perdent quelque chose, en général deux à cinq par
 * partie. Une partie entière à pleine profondeur demanderait des minutes ; là, des dizaines de secondes.
 * Les coups sains gardent leur verdict de passe rapide, marqué `rapide`, sans explication détaillée.
 * Rend des retours de la même forme que ceux d'une partie jouée ici.
 *
 * `arrete` est consulté avant chaque coup : l'analyste est partagé avec la partie en cours, une relecture
 * abandonnée doit le rendre tout de suite plutôt que de finir dans le vide.
 */
export async function analyserPartie(moteur, { pgn, couleur, profondeur = PROFONDEUR, surAvancement = null, arrete = null }) {
  const lecture = new Chess();
  lecture.loadPgn(pgn);
  const partie = new Chess();
  const aJuger = [];
  for (const joue of lecture.history({ verbose: true })) {
    const fenAvant = partie.fen();
    partie.move(joue.san);
    if (joue.color === couleur) {
      aJuger.push({ fenAvant, coup: joue.from + joue.to + (joue.promotion ?? ''), demiCoup: partie.history().length });
    }
  }

  const retours = [];
  for (const [i, { fenAvant, coup, demiCoup }] of aJuger.entries()) {
    if (arrete?.()) return retours;
    surAvancement?.({ fait: i, total: aJuger.length });
    const vite = await jugerVite(moteur, { fen: fenAvant, coup, profondeur: PROFONDEUR_RAPIDE });
    const complet = vite.perte >= PERTE_A_REVOIR ? await jugerCoup(moteur, { fen: fenAvant, coup, profondeur }) : null;
    retours.push({ ...(complet ?? vite), demiCoup, fenAvant, interceptee: null, rapide: !complet });
  }
  surAvancement?.({ fait: aJuger.length, total: aJuger.length });
  return retours;
}
