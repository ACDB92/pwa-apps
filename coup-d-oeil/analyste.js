// L'analyste : ce qu'il faut demander à Stockfish pour juger un coup, dans quel ordre et à quelle
// profondeur. Relie le moteur (uci.js) au juge (coach.js) et aux explications (explication.js) ;
// l'app et les tests passent par ici.

import { Chess } from './vendor/chess.js';
import { evaluerCoup, ligneDuCoup, fenCoupNul } from './coach.js';
import { expliquer } from './explication.js';

export const PROFONDEUR = 16;         // pré-analyse de la position, pendant que tu réfléchis
export const PROFONDEUR_MIN = 12;     // en deçà, on laisse l'analyse finir avant de juger
export const PROFONDEUR_MENACE = 10;  // « si tu passais ton tour » : la menace, pour le signal et les explications
export const OPTIONS_ANALYSTE = { Threads: 1, Hash: 32, MultiPV: 3 };

// L'adversaire est une autre instance, bridée. Jamais l'analyste : son retour serait faux.
export const ELO = { min: 1320, max: 3190, defaut: 1800 };   // échelle CCRL Blitz, pas celle de chess.com
export const TEMPS_ADVERSAIRE = 1000;                         // ms par coup
export const optionsAdversaire = elo => ({ Threads: 1, Hash: 16, UCI_LimitStrength: true, UCI_Elo: elo });

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
export async function jugerCoup(moteur, { fen, coup, analyse = null, profondeur = PROFONDEUR }) {
  const { lignes } = analyse ?? await moteur.analyser(fen, { depth: profondeur });
  const ligneJouee = ligneDuCoup(lignes, coup)
    ?? (await moteur.analyser(fen, { depth: lignes[0].depth, searchmoves: [coup] })).lignes[0];
  const menace = new Chess(fen).isCheck()
    ? null
    : (await moteur.analyser(fenCoupNul(fen), { depth: PROFONDEUR_MENACE })).lignes[0] ?? null;
  const retour = evaluerCoup({ fen, coup, lignes, ligneJouee, menace });
  try {
    retour.explication = expliquer({ fen, coup, lignes, ligneJouee, menace, retour });
  } catch (erreur) {
    console.error('explication impossible', erreur);   // le verdict reste : l'explication est un plus
    retour.explication = null;
  }
  return retour;
}
