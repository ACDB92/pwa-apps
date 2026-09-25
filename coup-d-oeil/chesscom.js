// Tes parties chess.com, par son API publique (api.chess.com/pub) : pas de clé, pas de compte à relier,
// pas de serveur — l'API autorise les appels depuis n'importe quelle origine, le navigateur s'en charge.
// Elle ne publie que des parties **terminées**, ce qui est exactement la limite qu'on veut.
// ⚠️ Fair play : on relit des parties finies, jamais à côté d'une partie en cours.
//
// Tout est pur et testable sans réseau, `chargerParties` comprise : elle reçoit son `recuperer`.

const RACINE = 'https://api.chess.com/pub/player';
const DEPART = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

export const MOIS_LUS = 3;        // archives mensuelles remontées
export const PARTIES_MAX = 20;    // parties proposées, de la plus récente à la plus ancienne

export const normaliserPseudo = pseudo => pseudo.trim().replace(/^@/, '').toLowerCase();

const CADENCES = { bullet: 'éclair', blitz: 'blitz', rapid: 'rapide', daily: 'par jour' };
const NULLES = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);
const CAUSES = {
  checkmated: 'mat', resigned: 'abandon', timeout: 'au temps', abandoned: 'partie quittée',
  agreed: 'par accord', repetition: 'par répétition', stalemate: 'pat',
  insufficient: 'matériel insuffisant', '50move': 'règle des 50 coups', timevsinsufficient: 'temps contre matériel',
};

// Une partie de l'API → ce que l'app sait relire. null quand on ne sait pas : variante, échiquier de
// départ inhabituel, ou partie où le pseudo ne joue pas.
export function partieJouable(partie, pseudo) {
  const toi = normaliserPseudo(pseudo);
  if (partie?.rules !== 'chess' || !partie.pgn) return null;
  if (partie.initial_setup && !partie.initial_setup.startsWith(DEPART)) return null;
  const couleur = partie.white?.username?.toLowerCase() === toi ? 'w' : partie.black?.username?.toLowerCase() === toi ? 'b' : null;
  if (!couleur) return null;
  const [moi, lui] = couleur === 'w' ? [partie.white, partie.black] : [partie.black, partie.white];
  return {
    uuid: partie.uuid, url: partie.url, pgn: partie.pgn, couleur,
    fin: new Date((partie.end_time ?? 0) * 1000),
    cadence: CADENCES[partie.time_class] ?? partie.time_class,
    adversaire: lui.username, sonElo: lui.rating, tonElo: moi.rating,
    tonIssue: moi.result,
    score: partie.white.result === 'win' ? '1-0' : partie.black.result === 'win' ? '0-1' : '1/2-1/2',
  };
}

export function issueFr({ tonIssue }) {
  const cause = CAUSES[tonIssue];
  if (tonIssue === 'win') return 'gagné';
  if (NULLES.has(tonIssue)) return cause ? `nulle, ${cause}` : 'nulle';
  return cause ? `perdu, ${cause}` : 'perdu';
}

export function resumeFr(partie) {
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(partie.fin);
  return `${date} · ${partie.cadence} · contre ${partie.adversaire} (${partie.sonElo}) · ${issueFr(partie)}`;
}

export const trier = parties => [...parties].sort((a, b) => b.fin - a.fin);

// Les dernières parties jouables de `pseudo`, `max` au plus : la liste de « Mes parties ».
export async function chargerParties(pseudo, { mois = MOIS_LUS, max = PARTIES_MAX, recuperer = (...a) => fetch(...a) } = {}) {
  return trier(await lireParties(pseudo, { mois, recuperer, assez: parties => parties.length >= max })).slice(0, max);
}

/**
 * Les parties à dépouiller pour les exercices : celles des `mois` derniers mois qui ne sont pas encore
 * dans `deja` (leurs uuid), de la plus récente à la plus ancienne, `max` au plus — les suivantes
 * attendront la prochaine mise à jour. `mois: Infinity` remonte toutes les archives.
 */
export async function partiesAAnalyser(pseudo, { deja = new Set(), mois = 2, max = Infinity, recuperer = (...a) => fetch(...a) } = {}) {
  const nouvelles = parties => parties.filter(p => !deja.has(p.uuid));
  const parties = await lireParties(pseudo, { mois, recuperer, assez: parties => nouvelles(parties).length >= max });
  return trier(nouvelles(parties)).slice(0, max);
}

// Deux requêtes au moins : la liste des archives, puis un fichier par mois, du plus récent au plus
// ancien — en série, parce que l'API demande de ne pas paralléliser. `assez` arrête la remontée.
async function lireParties(pseudo, { mois, recuperer, assez }) {
  const toi = normaliserPseudo(pseudo);
  const lire = async url => {
    let reponse;
    try {
      reponse = await recuperer(url);
    } catch {
      throw new Error('chess.com est injoignable : vérifie ta connexion.');
    }
    if (reponse.status === 404) throw new Error(`Pseudo inconnu sur chess.com : ${pseudo}`);
    if (!reponse.ok) throw new Error(`chess.com ne répond pas (${reponse.status}).`);
    try {
      return await reponse.json();
    } catch {
      throw new Error('chess.com a répondu quelque chose d’illisible.');
    }
  };
  const { archives = [] } = await lire(`${RACINE}/${encodeURIComponent(toi)}/games/archives`);
  const parties = [];
  for (const url of (mois === Infinity ? archives : archives.slice(-mois)).reverse()) {
    const { games = [] } = await lire(url);
    parties.push(...games.map(g => partieJouable(g, toi)).filter(Boolean));
    if (assez(parties)) break;
  }
  return parties;
}
