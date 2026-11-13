// Logique pure de l'app : dates, fraîcheur de la dernière édition, recherche et filtres.
// Aucune dépendance au DOM : testée par `node --test tests/*.test.mjs`.

export const USAGES = {
  'data-bi':   { libelle: 'Data & BI',            emoji: '📊' },
  entretien:   { libelle: 'À citer en entretien', emoji: '🎯' },
  outil:       { libelle: 'À essayer',            emoji: '🧰' },
  general:     { libelle: 'IA en général',        emoji: '🌍' },
  quotidien:   { libelle: 'Au quotidien',         emoji: '🏠' },
  banque:      { libelle: 'Banque & conseil',     emoji: '🏦' },
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

const HEURE_DE_PARUTION = 7.5;   // la routine tourne à 7 h 30, heure de Paris
const MARGE_HEURES = 1;          // au-delà de 8 h 30 sans édition du jour : on le signale

/** « 2026-11-08 » → « dimanche 8 novembre » (la date est un jour, sans fuseau). */
export function dateFr(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return `${JOURS[d.getUTCDay()]} ${j} ${MOIS[m - 1]}`;
}

/** Date et heure à Paris d'un instant : { jour: 'AAAA-MM-JJ', heure: 7.5 }. */
export function aParis(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(p => [p.type, p.value]));
  return { jour: `${parts.year}-${parts.month}-${parts.day}`, heure: Number(parts.hour) + Number(parts.minute) / 60 };
}

function veille(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10);
}

/** L'édition du jour est-elle là ? « a-jour », « attendue » (avant 8 h 30, la veille est là)
 *  ou « manquante » : un matin sans édition, c'est que la routine a échoué. */
export function fraicheur(derniere, instant) {
  const { jour, heure } = aParis(instant);
  if (derniere === jour) return 'a-jour';
  if (derniere === veille(jour) && heure < HEURE_DE_PARUTION + MARGE_HEURES) return 'attendue';
  return 'manquante';
}

/** Minuscules, sans accents : « Côme » et « come » se retrouvent. */
export function normaliser(texte) {
  return (texte || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Un sujet est-il « pour » cette personne ? « Vous deux » vaut pour chacun. */
export function estPour(sujet, personne) {
  return !personne || sujet.pour === personne || sujet.pour === 'Vous deux';
}

/** Les sujets de toutes les éditions qui passent la recherche et les filtres, du plus récent au
 *  plus ancien : [{ date, sujet }]. Tous les mots cherchés doivent être présents. */
export function chercher(editions, { q = '', pour = '', usage = '' } = {}) {
  const mots = normaliser(q).split(/\s+/).filter(Boolean);
  const res = [];
  // la semaine en 5 reprend des sujets déjà parus : on ne les compte qu'une fois, à leur date d'origine
  for (const e of [...editions].filter(e => e.type !== 'semaine').sort((a, b) => b.date.localeCompare(a.date))) {
    for (const s of e.sujets || []) {
      if (!estPour(s, pour) || (usage && s.usage !== usage)) continue;
      const texte = normaliser([s.titre, s.fait, s.concretement, s.source].join(' '));
      if (mots.every(m => texte.includes(m))) res.push({ date: e.date, sujet: s });
    }
  }
  return res;
}

/** Un lien n'est affiché que s'il est en http(s) : la page est publique, et ses données viennent
 *  de textes écrits par n'importe qui sur Internet. */
export function lienSur(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Temps de lecture d'une édition, en minutes (200 mots par minute, 1 au moins). */
export function minutesDeLecture(edition) {
  const mots = (edition.sujets || []).reduce((n, s) => n + `${s.fait} ${s.concretement}`.split(/\s+/).length, 0);
  return Math.max(1, Math.round(mots / 200));
}

/** Pour ◀ ▶ : l'édition parue juste avant et juste après une date (null en bout de liste). */
export function voisins(dates, date) {
  const tri = [...new Set(dates)].sort();
  const i = tri.indexOf(date);
  if (i === -1) return { avant: null, apres: null };
  return { avant: tri[i - 1] ?? null, apres: tri[i + 1] ?? null };
}

/** Ancre d'un sujet partagé : « #2026-11-13/2 » ouvre le 2e sujet du 13 novembre.
 *  « #2026-11-13 » ouvre l'édition, « #archive » l'archive ; tout le reste est ignoré. */
export function lireAncre(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (h === 'archive') return { vue: 'archive' };
  const m = /^(\d{4}-\d{2}-\d{2})(?:\/([1-9]\d?))?$/.exec(h);
  return m ? { vue: 'edition', date: m[1], sujet: m[2] ? Number(m[2]) : null } : null;
}

export function ancre(date, numero) {
  return `#${date}/${numero}`;
}

/** Compteur local (le juge du point à deux semaines) : ouvertures, jours d'ouverture, articles lus.
 *  Rien ne sort du téléphone. */
export function compter(compteur, jour, evenement) {
  const c = { depuis: jour, ouvertures: 0, jours: [], articles: 0, ...(compteur || {}) };
  if (evenement === 'ouverture') {
    c.ouvertures += 1;
    if (!c.jours.includes(jour)) c.jours = [...c.jours, jour];
  }
  if (evenement === 'article') c.articles += 1;
  return c;
}

export function resumeCompteur(c) {
  if (!c || !c.ouvertures) return '';
  const j = c.jours.length;
  return `Sur ce téléphone depuis le ${dateFr(c.depuis).replace(/^\S+ /, '')} : ouverte ${c.ouvertures} fois, `
    + `${j} jour${j > 1 ? 's' : ''} différent${j > 1 ? 's' : ''}, ${c.articles} article${c.articles > 1 ? 's' : ''} ouvert${c.articles > 1 ? 's' : ''}.`;
}

// ── Lexique et semaine en 5 ─────────────────────────────────────────────────

export const THEMES = {
  ia:        'Les bases de l’IA',
  'data-bi': 'Data & BI',
  banque:    'Banque & conseil',
  quotidien: 'Numérique du quotidien',
};

/** Découpe un texte pour rendre touchables les termes du lexique du jour :
 *  [{ texte }, { texte, terme }, …]. Mot entier, sans tenir compte de la casse ni des accents ;
 *  chaque terme n'est lié qu'à sa première apparition. */
export function lierTermes(texte, termes) {
  const norm = normaliser(texte);
  if (norm.length !== texte.length || !termes.length) return [{ texte }];
  const restants = new Map(termes.map(t => [normaliser(t), t]));
  const morceaux = [];
  let i = 0;
  const lettre = c => c && /[\p{L}\p{N}]/u.test(c);
  while (i < texte.length && restants.size) {
    let meilleur = null;
    for (const [cle, terme] of restants) {
      let p = norm.indexOf(cle, i);
      while (p !== -1 && (lettre(norm[p - 1]) || lettre(norm[p + cle.length]))) p = norm.indexOf(cle, p + 1);
      if (p !== -1 && (!meilleur || p < meilleur.p || (p === meilleur.p && cle.length > meilleur.cle.length))) meilleur = { p, cle, terme };
    }
    if (!meilleur) break;
    if (meilleur.p > i) morceaux.push({ texte: texte.slice(i, meilleur.p) });
    morceaux.push({ texte: texte.slice(meilleur.p, meilleur.p + meilleur.cle.length), terme: meilleur.terme });
    restants.delete(meilleur.cle);
    i = meilleur.p + meilleur.cle.length;
  }
  if (i < texte.length) morceaux.push({ texte: texte.slice(i) });
  return morceaux;
}

export const estSemaine = edition => edition?.type === 'semaine';
