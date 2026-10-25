// Moteur de coup-de-vent : heures navigables, coût du trajet, classement des spots.
// Module ES pur — aucun accès au DOM ni au réseau. Importé par index.html et par tests/engine.test.mjs.
//
// La règle qui tient tout le reste : on FILTRE d'abord, on CLASSE ensuite. Une heure est navigable si
// tout va en même temps (vent, rafales, direction, marée, jour) ; un spot reste s'il a au moins une
// heure navigable et un trajet dans le temps et le budget. Les spots restants se classent par heures
// navigables, et le coût s'affiche à côté — jamais mélangé au vent dans un score.

export const REGLAGES_DEFAUT = {
  ville: 'paris',
  ventMin: 15,          // nœuds
  ventMax: 30,
  rafalesMax: 35,
  ecartRafalesMax: 12,  // rafale − vent moyen : au-delà, le vent est trop irrégulier pour naviguer
  sessionMin: 2,        // heures d'affilée : une heure isolée ne vaut pas le déplacement
  vaguesMax: 2.5,       // mètres, hauteur significative au large ; ignorée sur un plan d'eau fermé
  niveau: 'confirmé',   // 'tous' | 'intermédiaire' | 'confirmé' : écarte les spots au-dessus
  trajetMaxH: 5,        // aller, en heures
  budgetMax: 250,       // aller-retour, en euros
  planche: 'twin-tip',  // 'twin-tip' | 'directionnelle' (plus de 130 cm : pas de train)
  modes: { voiture: true, train: true, avion: true },
  carburant: 'gazole',
  consoL100: 6.5,
  billetAvion: 160,     // aller-retour
  compagnie: 'transavia',
  pont: 'aucun',        // 'aucun' | 'vendredi' | 'lundi'
  favoris: [],
  spotsPerso: []
};

// Barèmes d'estimation. Aucun n'est un prix relevé : ce sont des ordres de grandeur à recaler, et
// l'appli renvoie toujours au site de réservation pour le vrai prix.
export const BAREMES = {
  routeDetour: 1.3,          // distance routière ≈ vol d'oiseau × 1,3 quand OSRM ne répond pas
  routeKmh: 80,
  peageEurKm: 0.10,          // classe 1, sur la part autoroute
  partAutoroute: 0.75,
  peageDesKm: 80,            // sous cette distance, on suppose qu'on ne prend pas l'autoroute
  railDetour: 1.25,
  trainKmhTgv: 170,
  trainKmhTer: 90,
  trainMinFixe: 30,
  trainEurKmBas: 0.05, trainEurBasMin: 15,     // prix bas : Ouigo, Prem's, réservé tôt
  trainEurKmHaut: 0.17, trainEurHautFixe: 25,   // prix haut : plein tarif de dernière minute
  avionAccesMin: 45,         // Paris → Orly
  avionAvantMin: 60,         // enregistrement du sac de sport, contrôle
  avionApresMin: 25,         // débarquement, bagage hors format
  avionRayonKm: 90,          // un aéroport plus loin du spot n'est pas proposé
  aPiedKm: 1,
  marcheKmh: 4.5,
  taxiPriseEnCharge: 4.5, taxiEurKm: 2.1, taxiMin: 10,
  locationEurJour: 50,
  localKmh: 50
};

// --------------------------------------------------------------------------------------------------
// Géométrie

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Écart entre deux caps, de 0 à 180°.
export function ecartAngle(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// Un secteur [270, 360] doit contenir le nord pile : on ramène les bornes dans [0, 360[ d'abord.
function dansSecteur(dir, [de, a]) {
  const n = x => ((x % 360) + 360) % 360;
  const d = n(dir), b = n(de), e = n(a);
  return b <= e ? d >= b && d <= e : d >= b || d <= e;
}

// Le vent vient de `dir`. Side-on et side-shore sont les bons ; onshore passe mais pousse vers la
// plage ; side-off et offshore éloignent du bord : écartés, quelle que soit la force.
export function lireDirection(spot, dir) {
  if (spot.secteurs) {
    const ok = spot.secteurs.some(s => dansSecteur(dir, s));
    return { ok, type: ok ? 'dans le secteur' : 'hors secteur' };
  }
  const e = ecartAngle(dir, spot.face);
  if (e <= 30) return { ok: true, type: 'onshore' };
  if (e <= 75) return { ok: true, type: 'side-on' };
  if (e <= 100) return { ok: true, type: 'side-shore' };
  if (e <= 140) return { ok: false, type: 'side-off' };
  return { ok: false, type: 'offshore' };
}

export const POINTS_CARDINAUX = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export function cardinal(dir) {
  return POINTS_CARDINAUX[Math.round((((dir % 360) + 360) % 360) / 22.5) % 16];
}

// --------------------------------------------------------------------------------------------------
// Marée — lue sur la série horaire du niveau de la mer : on situe chaque heure entre la basse et la
// pleine mer voisines (fenêtre de ±7 h, une demi-marée faisant environ 6 h 12). `null` si la série
// manque autour de l'heure (au-delà de l'horizon de la prévision marine).

export function phaseMaree(niveaux, i, demiFenetre = 7) {
  if (!niveaux || niveaux[i] == null) return null;
  let bas = Infinity, haut = -Infinity;
  for (let j = i - demiFenetre; j <= i + demiFenetre; j++) {
    if (j < 0 || j >= niveaux.length || niveaux[j] == null) return null;
    bas = Math.min(bas, niveaux[j]);
    haut = Math.max(haut, niveaux[j]);
  }
  if (haut - bas < 0.3) return null;  // marnage trop faible pour situer la phase
  const r = (niveaux[i] - bas) / (haut - bas);
  return r < 1 / 3 ? 'basse' : r > 2 / 3 ? 'haute' : 'mi';
}

// --------------------------------------------------------------------------------------------------
// Calendrier. Les dates sont des chaînes 'AAAA-MM-JJ' locales (fuseau Europe/Paris, celui de l'API) :
// on ne les fait jamais passer par le fuseau de la machine.

export function jourSemaine(date) {  // 0 = dimanche
  const [a, m, j] = date.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay();
}

export function ajouterJours(date, n) {
  const [a, m, j] = date.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

export function joursEntre(de, a) {
  const t = d => { const [x, y, z] = d.split('-').map(Number); return Date.UTC(x, y - 1, z); };
  return Math.round((t(a) - t(de)) / 86400000);
}

// Les samedis dont le samedi est couvert par la prévision.
export function samedisDisponibles(dates) {
  return dates.filter(d => jourSemaine(d) === 6);
}

export function joursDuWeekend(samedi, pont = 'aucun') {
  const jours = [samedi, ajouterJours(samedi, 1)];
  if (pont === 'vendredi') jours.unshift(ajouterJours(samedi, -1));
  if (pont === 'lundi') jours.push(ajouterJours(samedi, 2));
  return jours;
}

// La fiabilité d'une prévision de vent tombe vite : bonne à 2 jours (AROME, 1,5 km), utile à 5,
// indicative au-delà, et presque du hasard après 9 jours.
export function fiabilite(joursAvance) {
  if (joursAvance <= 2) return { niveau: 4, libelle: 'fiable' };
  if (joursAvance <= 5) return { niveau: 3, libelle: 'assez fiable' };
  if (joursAvance <= 9) return { niveau: 2, libelle: 'indicative' };
  return { niveau: 1, libelle: 'très incertaine' };
}

// --------------------------------------------------------------------------------------------------
// Heures navigables

function minutesDuJour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Codes WMO d'orage (95 : orage ; 96 et 99 : orage avec grêle). Une heure d'orage n'est jamais navigable.
export const CODES_ORAGE = [95, 96, 99];
export const CODES_AVERSE = [80, 81, 82];

// prevision : { heures: { time, vent, rafales, dir, temp, niveau, eau, vagues, periode, code, modeles },
//               jours: { date, lever, coucher } }
// `modeles` : { nom: { vent: [], dir: [] } } — les modèles pris un par un, pour mesurer leur accord.
// Renvoie une ligne par heure de jour sur les jours demandés, avec la raison de chaque refus.
export function lireHeures(spot, prevision, jours, reglages) {
  const { heures, jours: j } = prevision;
  const lumiere = {};
  j.date.forEach((d, k) => { lumiere[d] = [minutesDuJour(j.lever[k].slice(11)), minutesDuJour(j.coucher[k].slice(11))]; });
  const voulus = new Set(jours);
  const lignes = [];
  heures.time.forEach((t, i) => {
    const date = t.slice(0, 10);
    if (!voulus.has(date) || !lumiere[date]) return;
    const debut = minutesDuJour(t.slice(11));
    const [lever, coucher] = lumiere[date];
    if (debut < lever - 15 || debut + 60 > coucher + 15) return;
    const { vent, rafale, dir, modeles, parMediane } = ventA(heures, i);
    if (vent == null || dir == null) return;
    const direction = lireDirection(spot, dir);
    const phase = spot.maree ? phaseMaree(heures.niveau, i) : null;
    const raisons = [];
    if (vent < reglages.ventMin) raisons.push('vent faible');
    if (vent > reglages.ventMax) raisons.push('trop fort');
    if (rafale > reglages.rafalesMax) raisons.push('rafales');
    // Le plafond seul laisse passer 19 nœuds rafalant à 35 : c'est l'écart qui fait un vent irrégulier.
    if (rafale - vent > reglages.ecartRafalesMax) raisons.push('rafales irrégulières');
    if (!direction.ok) raisons.push(direction.type);
    // Une marée inconnue (au-delà de l'horizon marine) ne refuse rien : l'heure est marquée, pas jetée.
    if (spot.maree && phase && !spot.maree.includes(phase)) raisons.push('marée ' + phase);
    const code = heures.code?.[i] ?? null;
    if (CODES_ORAGE.includes(code)) raisons.push('orage');
    // La houle est lue au large (maille de 8 km) : sur un étang, elle ne dit rien du plan d'eau.
    const vague = heures.vagues?.[i] ?? null;
    if (!spot.secteurs && vague != null && vague > reglages.vaguesMax) raisons.push('vagues');
    lignes.push({
      t, date, heure: debut / 60, vent, rafale, dir, direction: direction.type,
      temp: heures.temp?.[i] ?? null, eau: heures.eau?.[i] ?? null,
      vague, periode: heures.periode?.[i] ?? null, code, averse: CODES_AVERSE.includes(code),
      modeles, source: parMediane ? `médiane de ${modeles.length} modèles` : 'modèle par défaut', ecartModeles: modeles.length >= 2 ? Math.max(...modeles.map(m => m.vent)) - Math.min(...modeles.map(m => m.vent)) : null,
      phase, mareeInconnue: Boolean(spot.maree) && phase == null,
      ok: raisons.length === 0, raisons
    });
  });
  return appliquerSession(lignes, reglages.sessionMin ?? 1);
}

// Le vent retenu à l'heure i : la médiane des modèles disponibles. Un modèle isolé ne fait pas basculer
// le verdict, et les rafales fortes d'un seul (ECMWF, souvent) ne refusent pas l'heure à elles seules.
// Avec moins de deux modèles, on garde la prévision par défaut d'Open-Meteo. La carte lit la même valeur.
export function ventA(heures, i) {
  const modeles = Object.entries(heures.modeles || {})
    .map(([nom, m]) => ({ nom, vent: m.vent[i], rafale: m.rafales?.[i] ?? null, dir: m.dir[i] }))
    .filter(m => m.vent != null);
  const parMediane = modeles.length >= 2;
  if (!parMediane) return { vent: heures.vent[i], rafale: heures.rafales[i], dir: heures.dir[i], modeles, parMediane };
  const vent = mediane(modeles.map(m => m.vent));
  const avecRafale = modeles.filter(m => m.rafale != null).map(m => m.rafale);
  const rafale = avecRafale.length >= 2 ? Math.max(vent, mediane(avecRafale)) : heures.rafales[i];
  return { vent, rafale, dir: directionMoyenne(modeles.map(m => m.dir).filter(d => d != null)), modeles, parMediane };
}

// Une session, c'est des heures navigables d'affilée le même jour. Les morceaux plus courts que le
// minimum sont refusés, avec leur raison : on ne fait pas 4 h de route pour une heure isolée.
export function appliquerSession(lignes, min) {
  let debut = 0;
  for (let k = 0; k <= lignes.length; k++) {
    const l = lignes[k], prec = lignes[k - 1];
    const suite = l && prec && l.ok && prec.ok && l.date === prec.date && l.heure === prec.heure + 1;
    if (suite) continue;
    // La série [debut, k[ vient de se terminer.
    if (prec?.ok && k - debut < min) {
      for (let j = debut; j < k; j++) { lignes[j].ok = false; lignes[j].raisons.push('session trop courte'); }
    }
    debut = k;
  }
  return lignes;
}

// La plus longue série d'heures navigables d'affilée, en heures.
export function fenetreMax(lignes) {
  let best = 0, cours = 0;
  lignes.forEach((l, k) => {
    const prec = lignes[k - 1];
    cours = l.ok ? (prec && prec.ok && prec.date === l.date && prec.heure + 1 === l.heure ? cours + 1 : 1) : 0;
    best = Math.max(best, cours);
  });
  return best;
}

// L'accord des modèles, mesuré sur les heures qui comptent (les navigables, sinon toutes) : écart moyen
// entre le modèle le plus venté et le moins venté. Plus fiable qu'une fiabilité tirée de la seule échéance.
export function accordModeles(lignes) {
  const base = lignes.some(l => l.ok) ? lignes.filter(l => l.ok) : lignes;
  const ecarts = base.map(l => l.ecartModeles).filter(e => e != null);
  const n = Math.max(0, ...base.map(l => l.modeles?.length ?? 0));
  if (!ecarts.length) return { niveau: 0, libelle: n ? 'un seul modèle' : 'modèles absents', ecart: null, n };
  const ecart = ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
  if (ecart <= 4) return { niveau: 3, libelle: 'modèles d\'accord', ecart, n };
  if (ecart <= 8) return { niveau: 2, libelle: 'léger désaccord', ecart, n };
  return { niveau: 1, libelle: 'modèles en désaccord', ecart, n };
}

// Coefficient de marée estimé d'après le marnage à Brest : 100 correspond à un marnage de 6,10 m
// (deux fois l'unité de hauteur de Brest, 3,05 m). Une valeur par jour, la même pour toute la côte.
export function coefficients(time, niveauBrest) {
  const parJour = {};
  time.forEach((t, i) => {
    const v = niveauBrest?.[i];
    if (v == null) return;
    const d = t.slice(0, 10);
    parJour[d] ??= [];
    parJour[d].push(v);
  });
  const sortie = {};
  Object.entries(parJour).forEach(([d, v]) => {
    if (v.length < 20) return;  // journée incomplète : pas de coefficient
    sortie[d] = Math.round((Math.max(...v) - Math.min(...v)) / 6.10 * 100);
  });
  return sortie;
}

// Du 15 juin au 15 septembre, beaucoup de plages limitent le kite (zones, horaires, bande des 300 m).
export function enSaison(date) {
  const md = date.slice(5);
  return md >= '06-15' && md <= '09-15';
}

export const NIVEAUX = ['tous', 'intermédiaire', 'confirmé'];

// Ce qui a le plus souvent bloqué : c'est la raison qu'on affiche pour un spot écarté.
export function raisonPrincipale(lignes) {
  const compte = {};
  lignes.forEach(l => l.raisons.forEach(r => { const k = r.startsWith('marée') ? 'marée' : r; compte[k] = (compte[k] || 0) + 1; }));
  const [r] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0] || ['pas de prévision'];
  return r;
}

export function resumeHeures(lignes) {
  const ok = lignes.filter(l => l.ok);
  const moy = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
  const parJour = {};
  lignes.forEach(l => { parJour[l.date] ??= 0; if (l.ok) parJour[l.date]++; });
  const eaux = lignes.map(l => l.eau).filter(x => x != null);
  const airs = lignes.map(l => l.temp).filter(x => x != null);
  return {
    navigables: ok.length,
    parJour,
    ventMoyen: moy((ok.length ? ok : lignes).map(l => l.vent)),
    rafaleMax: Math.max(0, ...(ok.length ? ok : lignes).map(l => l.rafale)),
    dirMoyenne: directionMoyenne((ok.length ? ok : lignes).map(l => l.dir)),
    air: moy(airs),
    eau: moy(eaux),
    vagues: moy(lignes.map(l => l.vague).filter(x => x != null)),
    periode: moy(lignes.map(l => l.periode).filter(x => x != null)),
    orage: lignes.some(l => CODES_ORAGE.includes(l.code)),
    averses: lignes.some(l => l.averse),
    fenetre: fenetreMax(lignes),
    accord: accordModeles(lignes),
    mareeInconnue: lignes.some(l => l.mareeInconnue)
  };
}

export function mediane(valeurs) {
  const v = [...valeurs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function directionMoyenne(dirs) {
  if (!dirs.length) return null;
  let x = 0, y = 0;
  dirs.forEach(d => { x += Math.cos(d * Math.PI / 180); y += Math.sin(d * Math.PI / 180); });
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// Épaisseur de combinaison, d'après la température de l'eau — conseil courant des écoles, pas une règle.
export function combi(eau) {
  if (eau == null) return null;
  if (eau >= 22) return 'lycra ou shorty';
  if (eau >= 18) return 'combi 3/2';
  if (eau >= 15) return 'combi 4/3';
  if (eau >= 12) return 'combi 5/4 + chaussons';
  return 'combi 6/5, chaussons, gants, cagoule';
}

// --------------------------------------------------------------------------------------------------
// Trajet

// De la gare ou de l'aéroport au spot : à pied si c'est tout près, sinon le moins cher entre deux
// allers en taxi et une voiture de location pour le week-end. Le bus local n'est pas compté : avec
// 20 à 30 kg de matériel, ce n'est pas un vrai choix.
export function dernierKm(depuis, spot, nbJours, b = BAREMES) {
  const km = distanceKm(depuis, spot) * b.routeDetour;
  if (km <= b.aPiedKm) return { mode: 'à pied', km, minutes: km / b.marcheKmh * 60, cout: 0 };
  const taxi = 2 * Math.max(b.taxiMin, b.taxiPriseEnCharge + b.taxiEurKm * km);
  const location = b.locationEurJour * Math.max(1, nbJours);
  const minutes = km / b.localKmh * 60 + 5;
  return taxi <= location
    ? { mode: 'taxi', km, minutes, cout: taxi }
    : { mode: 'location', km, minutes, cout: location };
}

export function aeroportProche(spot, aeroports, b = BAREMES) {
  let best = null;
  Object.entries(aeroports).forEach(([code, a]) => {
    const d = distanceKm(a, spot);
    if (d <= b.avionRayonKm && (!best || d < best.d)) best = { code, ...a, d };
  });
  return best;
}

// contexte : { ville, gares, aeroports, compagnies, route: { km, minutes } | null, prixCarburant, nbJours }
// Renvoie une option par mode, possible ou non (avec la raison), coûts en aller-retour, durée en aller.
export function optionsTrajet(spot, reglages, contexte, b = BAREMES) {
  const { ville, gares, aeroports, compagnies, route, prixCarburant, nbJours } = contexte;
  const options = [];

  if (reglages.modes.voiture) {
    const estime = !route;
    const km = route ? route.km : distanceKm(ville, spot) * b.routeDetour;
    const minutes = route ? route.minutes : km / b.routeKmh * 60;
    const carburant = 2 * km * reglages.consoL100 / 100 * prixCarburant;
    const peage = km > b.peageDesKm ? 2 * km * b.partAutoroute * b.peageEurKm : 0;
    options.push({
      mode: 'voiture', possible: true, minutes, cout: carburant + peage, coutMin: null, coutMax: null,
      detail: { km, carburant, peage, estime }
    });
  }

  if (reglages.modes.train) {
    const gare = gares[spot.gare];
    if (!gare) {
      options.push({ mode: 'train', possible: false, raison: 'pas de gare de référence' });
    } else if (reglages.planche === 'directionnelle') {
      options.push({ mode: 'train', possible: false, raison: 'planche de plus de 130 cm : refusée en TGV et en OUIGO' });
    } else {
      const railKm = distanceKm(ville, gare) * b.railDetour;
      const depuisParis = contexte.villeId === 'paris' && gare.parisMin;
      const vitesse = gare.tgv && ville.tgv ? b.trainKmhTgv : b.trainKmhTer;
      const minutesTrain = depuisParis ? gare.parisMin : b.trainMinFixe + railKm / vitesse * 60;
      const fin = dernierKm(gare, spot, nbJours, b);
      const bas = 2 * Math.max(b.trainEurBasMin, b.trainEurKmBas * railKm);
      const haut = 2 * (b.trainEurHautFixe + b.trainEurKmHaut * railKm);
      options.push({
        mode: 'train', possible: true, minutes: minutesTrain + fin.minutes,
        cout: (bas + haut) / 2 + fin.cout, coutMin: bas + fin.cout, coutMax: haut + fin.cout,
        detail: { gare: gare.nom, minutesTrain, dureeConnue: Boolean(depuisParis), fin }
      });
    }
  }

  if (reglages.modes.avion) {
    const aero = aeroportProche(spot, aeroports, b);
    if (contexte.villeId !== 'paris') {
      options.push({ mode: 'avion', possible: false, raison: 'proposé seulement au départ de Paris' });
    } else if (!aero) {
      options.push({ mode: 'avion', possible: false, raison: 'aucun aéroport desservi à moins de ' + b.avionRayonKm + ' km' });
    } else {
      const compagnie = compagnies[reglages.compagnie] || { nom: 'Autre', sac: 0 };
      const fin = dernierKm(aero, spot, nbJours, b);
      const sac = 2 * compagnie.sac;
      options.push({
        mode: 'avion', possible: true,
        minutes: b.avionAccesMin + b.avionAvantMin + aero.volMin + b.avionApresMin + fin.minutes,
        cout: reglages.billetAvion + sac + fin.cout, coutMin: null, coutMax: null,
        detail: { aeroport: aero.nom, code: aero.code, billet: reglages.billetAvion, sac, compagnie: compagnie.nom, fin }
      });
    }
  }
  return options;
}

// Le mode retenu : le moins cher parmi ceux qui tiennent dans le temps et le budget.
// S'il n'y en a aucun, la raison dit ce qui coince — le temps d'abord, puis l'argent.
export function choisirMode(options, reglages) {
  const possibles = options.filter(o => o.possible);
  if (!possibles.length) return { mode: null, raison: 'aucun mode de transport' };
  const dansLeTemps = possibles.filter(o => o.minutes <= reglages.trajetMaxH * 60);
  if (!dansLeTemps.length) return { mode: null, raison: 'trop loin' };
  const dansLeBudget = dansLeTemps.filter(o => o.cout <= reglages.budgetMax);
  if (!dansLeBudget.length) return { mode: null, raison: 'trop cher' };
  return { mode: dansLeBudget.reduce((a, o) => (o.cout < a.cout ? o : a)) };
}

// --------------------------------------------------------------------------------------------------
// Classement

// evaluations : [{ spot, lignes, options }] — sort les spots retenus, triés, et les écartés avec leur
// raison. Un favori passe devant à égalité d'heures, jamais devant un spot qui navigue plus.
export function classer(evaluations, reglages) {
  const retenus = [], ecartes = [];
  evaluations.forEach(ev => {
    const resume = resumeHeures(ev.lignes);
    const choix = choisirMode(ev.options, reglages);
    const base = { ...ev, resume, favori: reglages.favoris.includes(ev.spot.id) };
    const requis = NIVEAUX.indexOf(ev.spot.niveau ?? 'tous');
    if (requis > NIVEAUX.indexOf(reglages.niveau ?? 'confirmé')) ecartes.push({ ...base, raison: 'niveau ' + ev.spot.niveau + ' requis' });
    else if (resume.navigables === 0) ecartes.push({ ...base, raison: raisonPrincipale(ev.lignes) });
    else if (!choix.mode) ecartes.push({ ...base, raison: choix.raison });
    else retenus.push({ ...base, trajet: choix.mode });
  });
  retenus.sort((a, b) =>
    b.resume.navigables - a.resume.navigables ||
    (b.favori - a.favori) ||
    a.trajet.cout - b.trajet.cout);
  ecartes.sort((a, b) => b.resume.navigables - a.resume.navigables || a.spot.nom.localeCompare(b.spot.nom));
  return { retenus, ecartes };
}

// « Quand partir sur mon spot ? » : chaque week-end couvert par la prévision, avec sa fiabilité.
export function weekendsPourSpot(spot, prevision, reglages, aujourdhui) {
  return samedisDisponibles(prevision.jours.date).map(samedi => {
    const jours = joursDuWeekend(samedi, reglages.pont);
    const lignes = lireHeures(spot, prevision, jours, reglages);
    return {
      samedi, jours, lignes, resume: resumeHeures(lignes),
      fiabilite: fiabilite(joursEntre(aujourdhui, samedi)),
      complet: jours.every(j => prevision.jours.date.includes(j))
    };
  });
}

// --------------------------------------------------------------------------------------------------
// Liens sortants — la réservation et les vérifications se font ailleurs.

export function liens(spot, option, ville, samedi) {
  const vendredi = samedi ? ajouterJours(samedi, -1) : '';
  const l = {
    windy: `https://www.windy.com/${spot.lat.toFixed(3)}/${spot.lon.toFixed(3)}?wind,${spot.lat.toFixed(3)},${spot.lon.toFixed(3)},11`,
    carte: `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`
  };
  if (spot.maree) l.maree = 'https://maree.shom.fr/';
  if (!option) return l;
  if (option.mode === 'voiture') {
    l.reserver = `https://www.google.com/maps/dir/?api=1&origin=${ville.lat},${ville.lon}&destination=${spot.lat},${spot.lon}&travelmode=driving`;
  } else if (option.mode === 'train') {
    l.reserver = 'https://www.sncf-connect.com/';
  } else if (option.mode === 'avion') {
    l.reserver = 'https://www.google.com/travel/flights?q=' +
      encodeURIComponent(`vols de ORY à ${option.detail.code} le ${vendredi}`);
  }
  return l;
}
