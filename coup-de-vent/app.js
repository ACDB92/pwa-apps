// L'interface : état, rendu, gestes et animations. Le calcul vit dans engine.js, le réseau dans
// meteo.js, la carte dans carte.js — ici on ne fait que les relier.

import {
  REGLAGES_DEFAUT, lireHeures, resumeHeures, optionsTrajet, classer, weekendsPourSpot, samedisDisponibles,
  joursDuWeekend, fiabilite, joursEntre, combi, cardinal, liens, distanceKm, choisirMode
} from './engine.js';
import { SPOTS, GARES, AEROPORTS, COMPAGNIES, VILLES, SOURCE_SPOTS } from './spots.js';
import { chargerPrevisions, chargerRoutes, chargerCarburant } from './meteo.js';
import { Carte, couleurVent } from './carte.js';

const $ = s => document.querySelector(s);
const CLE_REGLAGES = 'coup-de-vent:reglages';
const PRIX_CARBURANT_SECOURS = { gazole: 1.85, e10: 1.80, sp95: 1.85, sp98: 1.95 };
const calme = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------------------------------------
// État

function chargerReglages() {
  try {
    const r = JSON.parse(localStorage.getItem(CLE_REGLAGES) || '{}');
    return { ...REGLAGES_DEFAUT, ...r, modes: { ...REGLAGES_DEFAUT.modes, ...(r.modes || {}) } };
  } catch { return structuredClone(REGLAGES_DEFAUT); }
}
function sauverReglages() {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(etat.r)); } catch { /* navigation privée */ }
}

const etat = {
  r: chargerReglages(),
  vue: 'ou',
  samedi: null,
  instants: [],
  idx: 0,
  ouvert: null,        // id du spot dont la fiche est ouverte
  spotQuand: null,
  prev: null, prevQuand: null, prevErreur: null,
  routes: {}, carburant: null,
  resultat: null,
  lecture: null
};

const tousLesSpots = () => [...SPOTS, ...etat.r.spotsPerso];
const spotParId = id => tousLesSpots().find(s => s.id === id);
const aujourdhui = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
const prixCarburant = () => etat.carburant?.[etat.r.carburant] ?? PRIX_CARBURANT_SECOURS[etat.r.carburant];

// ------------------------------------------------------------------------------------------------
// Mise en forme

const ICONES = {
  voiture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V11l2-5h10l2 5v5M3 16h18v3h-3M6 19H3"/><circle cx="7.5" cy="16" r="1.6"/><circle cx="16.5" cy="16" r="1.6"/><path d="M5 11h14"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9.5" cy="14" r=".6" fill="currentColor"/><circle cx="14.5" cy="14" r=".6" fill="currentColor"/></svg>',
  avion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 13.5 3 11l1-2 8 1 4.5-5.5c1-1 2.6-1.3 3-.9.4.4.1 2-.9 3L13 11l1 8-2 1-2.5-7.5"/></svg>',
  etoile: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  etoileVide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  retour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  lecture: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  fermer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};
const NOM_MODE = { voiture: 'Voiture', train: 'Train', avion: 'Avion' };

function duree(min) {
  const m = Math.round(min / 5) * 5;
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ' ' + String(r).padStart(2, '0') : ''}` : `${r} min`;
}
const euros = x => Math.round(x / 5) * 5 + ' €';
const nd = x => (x == null ? '—' : Math.round(x));
function dateCourte(d, avecJour = true) {
  const [a, m, j] = d.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...(avecJour ? { weekday: 'short' } : {}), day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(a, m - 1, j)));
}
function plageDates(jours) {
  return `${dateCourte(jours[0], false)} – ${dateCourte(jours[jours.length - 1], false)}`;
}
const pointsFiab = n => `<span class="points-fiab" title="Fiabilité de la prévision">${[1, 2, 3, 4].map(k => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const echapper = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Un chiffre qui défile jusqu'à sa valeur : on voit qu'il a changé.
function compter(el, vers, decimales = 0) {
  const depuis = parseFloat(el.dataset.v ?? 0) || 0;
  el.dataset.v = vers;
  if (calme() || depuis === vers) { el.textContent = vers.toFixed(decimales); return; }
  const t0 = performance.now(), d = 700;
  const pas = t => {
    const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (depuis + (vers - depuis) * e).toFixed(decimales);
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}
function animerChiffres(racine) {
  racine.querySelectorAll('[data-compte]').forEach(el => compter(el, parseFloat(el.dataset.compte), +(el.dataset.dec || 0)));
}

// FLIP : on mesure où étaient les cartes, on rend, puis on les fait glisser depuis leur ancienne
// place. Quand un réglage change, on voit qui monte et qui descend.
function rendreAvecFlip(conteneur, html) {
  const avant = new Map();
  conteneur.querySelectorAll('[data-cle]').forEach(n => avant.set(n.dataset.cle, n.getBoundingClientRect().top));
  conteneur.innerHTML = html;
  if (calme()) return;
  let neuf = 0;
  conteneur.querySelectorAll('[data-cle]').forEach(n => {
    const ancien = avant.get(n.dataset.cle);
    if (ancien == null) {
      n.animate([{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, delay: Math.min(neuf++, 10) * 40, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'backwards' });
      return;
    }
    const dy = ancien - n.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) n.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.2,.9,.2,1)' });
  });
}

function toast(texte) {
  const t = $('#toast');
  t.textContent = texte;
  t.classList.add('visible');
  clearTimeout(toast.minuteur);
  toast.minuteur = setTimeout(() => t.classList.remove('visible'), 3800);
}

// ------------------------------------------------------------------------------------------------
// Calcul

function contexte(nbJours) {
  return {
    villeId: etat.r.ville, ville: VILLES[etat.r.ville], gares: GARES, aeroports: AEROPORTS, compagnies: COMPAGNIES,
    prixCarburant: prixCarburant(), nbJours, route: null
  };
}

function evaluer(spot, jours) {
  const prev = etat.prev?.[spot.id];
  const lignes = prev ? lireHeures(spot, prev, jours, etat.r) : [];
  const options = optionsTrajet(spot, etat.r, { ...contexte(jours.length), route: etat.routes[spot.id] || null });
  return { spot, lignes, options };
}

function calculer() {
  if (!etat.prev) return;
  const premier = Object.values(etat.prev)[0];
  const samedis = samedisDisponibles(premier.jours.date);
  if (!samedis.includes(etat.samedi)) etat.samedi = samedis[0];
  const jours = joursDuWeekend(etat.samedi, etat.r.pont);
  etat.jours = jours;
  etat.resultat = classer(tousLesSpots().map(s => evaluer(s, jours)), etat.r);

  // Les instants du curseur : les heures de jour du week-end, de 8 h à 19 h.
  const ancien = etat.instants[etat.idx]?.t;
  etat.instants = premier.heures.time
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => jours.includes(t.slice(0, 10)) && +t.slice(11, 13) >= 8 && +t.slice(11, 13) <= 19);
  const garde = etat.instants.findIndex(x => x.t === ancien);
  if (garde >= 0) etat.idx = garde;
  else {
    // Par défaut : la première bonne heure du meilleur spot, sinon samedi 14 h.
    const meilleur = etat.resultat.retenus[0];
    const bonne = meilleur?.lignes.find(l => l.ok)?.t;
    const i = etat.instants.findIndex(x => x.t === bonne);
    etat.idx = i >= 0 ? i : Math.max(0, etat.instants.findIndex(x => x.t.endsWith('14:00')));
  }
}

// ------------------------------------------------------------------------------------------------
// Carte et curseur

let carte;

function majCarte() {
  if (!etat.prev || !etat.resultat) return;
  const instant = etat.instants[etat.idx];
  const vents = [], points = [];
  const rang = new Map(etat.resultat.retenus.map((r, k) => [r.spot.id, k + 1]));
  tousLesSpots().forEach(s => {
    const p = etat.prev[s.id];
    const i = instant ? p?.heures.time.indexOf(instant.t) : -1;
    const kn = i >= 0 ? p.heures.vent[i] : null, dir = i >= 0 ? p.heures.dir[i] : null;
    vents.push({ lon: s.lon, lat: s.lat, kn, dir });
    const k = rang.get(s.id);
    const choisi = etat.vue === 'quand' ? s.id === etat.spotQuand : s.id === etat.ouvert;
    points.push({ id: s.id, nom: s.nom, lon: s.lon, lat: s.lat, kn, dir, rang: etat.vue === 'ou' ? k : null, choisi,
      etat: etat.vue === 'quand' ? (choisi ? 'top' : 'ok') : k ? (k <= 3 ? 'top' : 'ok') : 'ecarte' });
  });
  carte.poserVents(vents);
  carte.poserSpots(points);
  $('#lib-heure').textContent = instant
    ? `${dateCourte(instant.t.slice(0, 10)).replace('.', '')} ${+instant.t.slice(11, 13)} h` : '—';
}

function majCurseur() {
  const c = $('#curseur-heure');
  c.max = Math.max(0, etat.instants.length - 1);
  c.value = etat.idx;
}

function basculerLecture(forcer) {
  const marche = forcer ?? !etat.lecture;
  clearInterval(etat.lecture);
  etat.lecture = null;
  if (marche) {
    etat.lecture = setInterval(() => {
      etat.idx = (etat.idx + 1) % Math.max(1, etat.instants.length);
      majCurseur(); majCarte();
    }, 900);
  }
  $('#lecture').innerHTML = etat.lecture ? ICONES.pause : ICONES.lecture;
}

function rendreWeekends() {
  const premier = etat.prev && Object.values(etat.prev)[0];
  if (!premier) return;
  const auj = aujourdhui();
  $('#weekends').innerHTML = samedisDisponibles(premier.jours.date).map(s => {
    const f = fiabilite(joursEntre(auj, s));
    const jours = joursDuWeekend(s, etat.r.pont);
    return `<button class="puce verre" data-samedi="${s}" aria-pressed="${s === etat.samedi}">${plageDates(jours)} ${pointsFiab(f.niveau)}</button>`;
  }).join('');
}

// ------------------------------------------------------------------------------------------------
// Rendu : « Où ? »

function miniBarres(lignes) {
  let html = '', jour = null, k = 0;
  lignes.forEach(l => {
    if (jour && l.date !== jour) html += '<i class="sep"></i>';
    jour = l.date;
    const h = Math.max(8, Math.min(100, (l.vent / 40) * 100));
    html += `<i class="${l.ok ? 'ok' : ''}" style="height:${h}%;--k:${k++}" title="${echapper(dateCourte(l.date))} ${l.heure} h : ${Math.round(l.vent)} nœuds"></i>`;
  });
  return `<div class="mini">${html}</div>`;
}

function libelleTrajet(t) {
  return `${ICONES[t.mode]} ${duree(t.minutes)} · ~${euros(t.cout)}`;
}

function rendreOu() {
  const { retenus, ecartes } = etat.resultat;
  const auj = aujourdhui();
  const f = fiabilite(joursEntre(auj, etat.samedi));
  const tag = `<span class="badge ${f.niveau >= 3 ? '' : f.niveau === 2 ? 'ambre' : 'corail'}">${pointsFiab(f.niveau)} prévision ${f.libelle}</span>`;
  const quand = joursEntre(auj, etat.samedi) <= 6 ? 'Ce week-end' : `Le week-end du ${dateCourte(etat.samedi, false)}`;

  if (retenus.length) {
    const b = retenus[0];
    $('#heros').innerHTML = `
      <div class="heros apparait">
        <div class="sur">${quand}, c'est</div>
        <h2>${echapper(b.spot.nom)}</h2>
        <div class="ligne">
          <span><b class="gros" data-compte="${b.resume.navigables}">0</b> h navigables</span>
          <span><b data-compte="${Math.round(b.resume.ventMoyen)}">0</b> nœuds <span class="fleche-dir" style="transform:rotate(${(b.resume.dirMoyenne ?? 0) + 180}deg)">↑</span> ${cardinal(b.resume.dirMoyenne ?? 0)}</span>
          <span>${libelleTrajet(b.trajet)}</span>
        </div>
        <div class="ligne">${tag}</div>
      </div>`;
  } else {
    const raisons = {};
    ecartes.forEach(e => { raisons[e.raison] = (raisons[e.raison] || 0) + 1; });
    const principale = Object.entries(raisons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    $('#heros').innerHTML = `
      <div class="heros apparait">
        <div class="sur">${quand}</div>
        <h2>Pas de bon plan</h2>
        <div class="ligne">Aucun spot ne réunit vent, direction, marée et trajet. Le plus souvent : <b>${echapper(principale)}</b>.</div>
        <div class="ligne">${tag}</div>
      </div>`;
  }
  animerChiffres($('#heros'));

  const cartes = retenus.map((r, k) => `
    <button class="carte-spot" data-cle="${r.spot.id}" data-spot="${r.spot.id}">
      <span class="num">${k + 1}</span>
      <span class="nomspot"><span>${echapper(r.spot.nom)}</span>${r.favori ? `<span class="etoile">${ICONES.etoile}</span>` : ''}</span>
      <span class="droite"><span class="h" data-compte="${r.resume.navigables}">0</span><span class="h"><small> h</small></span>
        <div class="trajet">${libelleTrajet(r.trajet)}</div></span>
      <span class="zone">${echapper(r.spot.zone || r.spot.lieu || '')} · ${Math.round(r.resume.ventMoyen)} nœuds ${cardinal(r.resume.dirMoyenne ?? 0)}${r.resume.mareeInconnue ? ' · marée inconnue' : ''}</span>
      <span class="barres">${miniBarres(r.lignes)}</span>
    </button>`).join('');

  const entete = retenus.length
    ? `<div class="titre-section">${retenus.length} spot${retenus.length > 1 ? 's' : ''} retenu${retenus.length > 1 ? 's' : ''} · classés par heures navigables</div>` : '';
  const ouvert = $('#corps details.ecartes')?.open;
  const bas = `
    ${ecartes.length ? `<details class="ecartes" ${ouvert || !retenus.length ? 'open' : ''}>
      <summary class="titre-section">Écartés · ${ecartes.length}</summary>
      ${ecartes.map(e => `<button class="ligne-ecart" data-spot="${e.spot.id}"><span>${echapper(e.spot.nom)}</span><span>${echapper(e.raison)}${e.resume.navigables ? ` · ${e.resume.navigables} h` : ''}</span></button>`).join('')}
    </details>` : ''}
    <p class="note">Le vent vient d'Open-Meteo (CC-BY 4.0) ; les trajets sont des estimations, le vrai prix se lit sur le site de réservation. ${echapper(SOURCE_SPOTS)}</p>`;

  const corps = $('#corps');
  // Même vue : on garde la liste en place pour que les cartes glissent vers leur nouveau rang.
  if (!corps.querySelector('#liste')) corps.innerHTML = '<div id="entete-liste"></div><div id="liste"></div><div id="bas-liste"></div>';
  corps.querySelector('#entete-liste').innerHTML = entete;
  rendreAvecFlip(corps.querySelector('#liste'), cartes);
  corps.querySelector('#bas-liste').innerHTML = bas;
  animerChiffres(corps);
}

// ------------------------------------------------------------------------------------------------
// Rendu : fiche d'un spot

function graphJour(lignes, r) {
  const n = lignes.length;
  if (!n) return '';
  const L = 320, H = 120, bas = 96, max = Math.max(40, ...lignes.map(l => l.rafale || 0));
  const lw = L / n, y = kn => bas - (kn / max) * (bas - 8);
  const barres = lignes.map((l, k) => {
    const x = k * lw + 2, w = lw - 4;
    const c = l.ok ? 'url(#gok)' : 'var(--barre-non)';
    return `<rect class="b" style="--k:${k}" x="${x}" y="${y(l.vent)}" width="${w}" height="${bas - y(l.vent)}" rx="3" fill="${c}"><title>${l.heure} h : ${Math.round(l.vent)} nœuds, rafales ${Math.round(l.rafale)}${l.raisons.length ? ' — ' + l.raisons.join(', ') : ''}</title></rect>
      <line x1="${x}" x2="${x + w}" y1="${y(l.rafale)}" y2="${y(l.rafale)}" stroke="${couleurVent(l.rafale)}" stroke-width="2" stroke-linecap="round"/>
      <text class="lg" x="${x + w / 2}" y="${bas + 12}" text-anchor="middle">${l.heure % 2 ? '' : l.heure}</text>
      <g transform="translate(${x + w / 2} ${bas + 22}) rotate(${l.dir + 180})"><path d="M0 -5 L3 3 L0 1.5 L-3 3 Z" fill="${l.ok || !l.raisons.some(z => /off/.test(z)) ? 'var(--doux)' : 'var(--corail)'}"/></g>
      ${l.phase ? `<rect x="${x}" y="${H - 2}" width="${w}" height="3" rx="1" fill="${l.phase === 'haute' ? 'var(--bleu)' : l.phase === 'mi' ? 'color-mix(in srgb, var(--bleu) 55%, transparent)' : 'color-mix(in srgb, var(--bleu) 22%, transparent)'}"><title>marée ${l.phase}</title></rect>` : ''}`;
  }).join('');
  return `<svg viewBox="0 -4 ${L} ${H + 4}" role="img" aria-label="Vent heure par heure">
    <defs><linearGradient id="gok" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DF7E0"/><stop offset="1" stop-color="#0FA594"/></linearGradient></defs>
    <line class="plage" x1="0" x2="${L}" y1="${y(r.ventMin)}" y2="${y(r.ventMin)}"/><line class="plage" x1="0" x2="${L}" y1="${y(r.ventMax)}" y2="${y(r.ventMax)}"/>
    <text class="lg" x="${L}" y="${y(r.ventMax) - 3}" text-anchor="end">${r.ventMax} nd</text><text class="lg" x="${L}" y="${y(r.ventMin) - 3}" text-anchor="end">${r.ventMin} nd</text>
    ${barres}</svg>`;
}

function blocOption(o, retenu) {
  if (!o.possible) {
    return `<div class="option impossible"><span class="rond-mode">${ICONES[o.mode]}</span><span class="t">${NOM_MODE[o.mode]}</span><span></span><span class="d">${echapper(o.raison)}</span></div>`;
  }
  const d = o.detail;
  let detail = '', prix = `~${euros(o.cout)}<small>aller-retour</small>`;
  if (o.mode === 'voiture') {
    detail = `${Math.round(d.km)} km${d.estime ? ' (estimés à vol d\'oiseau)' : ''} · carburant ${euros(d.carburant)}${d.peage ? ` · péages ~${euros(d.peage)}` : ''}`;
  } else if (o.mode === 'train') {
    prix = `${euros(o.coutMin)} – ${euros(o.coutMax)}<small>aller-retour</small>`;
    detail = `Jusqu'à ${echapper(d.gare)} (${duree(d.minutesTrain)}${d.dureeConnue ? '' : ', estimé'}), puis ${d.fin.mode}${d.fin.mode === 'à pied' ? '' : ` ${Math.round(d.fin.km)} km, ~${euros(d.fin.cout)}`}`;
  } else {
    detail = `Orly → ${echapper(d.aeroport)} · billet ${euros(d.billet)} · sac ${echapper(d.compagnie)} ${d.sac ? euros(d.sac) : 'inclus'} · puis ${d.fin.mode} ${Math.round(d.fin.km)} km${d.fin.cout ? `, ~${euros(d.fin.cout)}` : ''}`;
  }
  const spot = spotParId(etat.ouvert);
  const l = liens(spot, o, VILLES[etat.r.ville], etat.samedi);
  const dehors = o.minutes > etat.r.trajetMaxH * 60 ? 'au-delà de ton temps max' : o.cout > etat.r.budgetMax ? 'au-delà de ton budget' : '';
  return `<div class="option ${retenu ? 'retenu' : ''}">
    <span class="rond-mode">${ICONES[o.mode]}</span>
    <span class="t">${NOM_MODE[o.mode]} · ${duree(o.minutes)}${retenu ? ' <span class="badge">retenu</span>' : dehors ? ` <span class="badge gris">${dehors}</span>` : ''}</span>
    <span class="prix">${prix}</span>
    <span class="d">${detail}</span>
    ${l.reserver ? `<a href="${l.reserver}" target="_blank" rel="noopener">${o.mode === 'voiture' ? 'Itinéraire' : 'Voir les vrais prix'} ↗</a>` : ''}
  </div>`;
}

function rendreFiche(id) {
  const spot = spotParId(id);
  const ev = evaluer(spot, etat.jours);
  const resume = resumeHeures(ev.lignes);
  const choix = choisirMode(ev.options, etat.r).mode;
  const favori = etat.r.favoris.includes(id);
  const f = fiabilite(joursEntre(aujourdhui(), etat.samedi));
  const eau = resume.eau, air = resume.air;
  const typeDir = ev.lignes.length ? ev.lignes.find(l => l.ok)?.direction || ev.lignes[0].direction : '—';

  $('#heros').innerHTML = `
    <div class="fiche-tete apparait">
      <button class="rond" data-action="retour" aria-label="Retour">${ICONES.retour}</button>
      <div class="grow"></div>
      <button class="rond etoile" data-action="favori" aria-label="${favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${favori ? ICONES.etoile : ICONES.etoileVide}</button>
    </div>
    <div class="heros apparait" style="--k:1">
      <div class="sur">${echapper(spot.lieu || '')} · ${echapper(spot.zone || '')}</div>
      <h2>${echapper(spot.nom)}</h2>
      <div class="ligne"><span class="badge ${f.niveau >= 3 ? '' : f.niveau === 2 ? 'ambre' : 'corail'}">${pointsFiab(f.niveau)} ${plageDates(etat.jours)} · ${f.libelle}</span></div>
    </div>`;

  const parJour = etat.jours.map(j => {
    const lj = ev.lignes.filter(l => l.date === j);
    if (!lj.length) return `<div class="graph"><div class="jour">${dateCourte(j)}<span>hors prévision</span></div></div>`;
    return `<div class="graph apparait"><div class="jour">${dateCourte(j)}<span>${lj.filter(l => l.ok).length} h navigables</span></div>${graphJour(lj, etat.r)}</div>`;
  }).join('');

  const options = ev.options.map(o => blocOption(o, choix && o.mode === choix.mode)).join('');
  const l = liens(spot, null);
  const weekends = etat.prev[id] ? weekendsPourSpot(spot, etat.prev[id], etat.r, aujourdhui()) : [];

  $('#corps').innerHTML = `
    <div class="fiche">
    <div class="chips">
      <div class="chip apparait" style="--k:1"><div class="k">Heures navigables</div><div class="v"><span data-compte="${resume.navigables}">0</span><small>h</small></div></div>
      <div class="chip apparait" style="--k:2"><div class="k">Vent moyen</div><div class="v"><span data-compte="${Math.round(resume.ventMoyen ?? 0)}">0</span><small>nœuds</small>
        <span class="fleche-dir" style="transform:rotate(${(resume.dirMoyenne ?? 0) + 180}deg)">↑</span><small>${cardinal(resume.dirMoyenne ?? 0)}</small></div></div>
      <div class="chip apparait" style="--k:3"><div class="k">Rafales max</div><div class="v"><span data-compte="${Math.round(resume.rafaleMax)}">0</span><small>nœuds</small></div></div>
      <div class="chip apparait" style="--k:4"><div class="k">Direction</div><div class="v" style="font-size:17px">${echapper(typeDir)}</div></div>
      <div class="chip apparait" style="--k:5"><div class="k">Eau · air</div><div class="v">${nd(eau)}°<small>· ${nd(air)}°</small></div></div>
      <div class="chip apparait" style="--k:6"><div class="k">Combi conseillée</div><div class="v" style="font-size:15px">${echapper(combi(eau) || '—')}</div></div>
    </div>
    ${spot.maree
      ? `<p class="note">Marée : le spot marche à marée ${spot.maree.join(', ')}.${resume.mareeInconnue ? ' La prévision marine s\'arrête à 8 jours : au-delà, la marée n\'est pas filtrée.' : ''} Niveau lu sur Open-Meteo Marine, maille de 8 km : à recouper.</p>`
      : '<p class="note">Méditerranée : marée négligeable, pas de filtre.</p>'}
    <div class="titre-section">Heure par heure</div>
    ${parJour}
    <div class="legende"><span><i style="background:#2EE6C5"></i>navigable</span><span><i style="background:var(--barre-non)"></i>hors critères</span><span>— rafales</span><span>↑ sens du vent</span>${spot.maree ? '<span><i style="background:var(--bleu)"></i>marée haute</span>' : ''}</div>
    <div class="titre-section">Y aller</div>
    ${options}
    <div class="titre-section">Quand partir ?</div>
    ${weekends.map(w => blocWeekend(w)).join('')}
    <div class="titre-section">Vérifier ailleurs</div>
    <div class="liens"><a class="lien" href="${l.windy}" target="_blank" rel="noopener">Windy ↗</a><a class="lien" href="${l.carte}" target="_blank" rel="noopener">Carte ↗</a>${l.maree ? `<a class="lien" href="${l.maree}" target="_blank" rel="noopener">Marées SHOM ↗</a>` : ''}</div>
    <p class="note">${spot.face != null ? `Plage orientée ${cardinal(spot.face)} (${spot.face}°) : un vent de ${cardinal(spot.face + 180)} y est offshore. ` : 'Plan d\'eau fermé : directions acceptées fixées par secteurs. '}${spot.perso ? 'Spot ajouté par toi.' : echapper(SOURCE_SPOTS)}</p>
    </div>`;
  $('#corps').scrollTop = 0;
  animerChiffres($('#heros'));
  animerChiffres($('#corps'));
}

function blocWeekend(w) {
  return `<div class="we apparait">
    <div class="haut"><span class="dates">${plageDates(w.jours)}</span>
      <span class="badge ${w.fiabilite.niveau >= 3 ? '' : w.fiabilite.niveau === 2 ? 'ambre' : 'corail'}">${pointsFiab(w.fiabilite.niveau)} ${w.fiabilite.libelle}</span></div>
    <div class="haut"><span><b class="gros" data-compte="${w.resume.navigables}">0</b> h navigables${w.complet ? '' : ' <span class="badge gris">prévision partielle</span>'}</span>
      <span style="color:var(--doux);font-size:13px">${w.lignes.length ? `${Math.round(w.resume.ventMoyen)} nœuds ${cardinal(w.resume.dirMoyenne ?? 0)}` : ''}</span></div>
    ${miniBarres(w.lignes)}
  </div>`;
}

// ------------------------------------------------------------------------------------------------
// Rendu : « Quand ? »

function rendreQuand() {
  const spots = [...tousLesSpots()].sort((a, b) => (etat.r.favoris.includes(b.id) - etat.r.favoris.includes(a.id)) || a.nom.localeCompare(b.nom));
  if (!etat.spotQuand || !spotParId(etat.spotQuand)) etat.spotQuand = (etat.r.favoris[0] && spotParId(etat.r.favoris[0])) ? etat.r.favoris[0] : etat.resultat?.retenus[0]?.spot.id || spots[0].id;
  const spot = spotParId(etat.spotQuand);
  const weekends = etat.prev?.[spot.id] ? weekendsPourSpot(spot, etat.prev[spot.id], etat.r, aujourdhui()) : [];
  const meilleur = weekends.reduce((a, w) => (!a || w.resume.navigables > a.resume.navigables ? w : a), null);

  $('#heros').innerHTML = `
    <div class="heros apparait">
      <div class="sur">Quand partir à</div>
      <h2>${echapper(spot.nom)}</h2>
      <div class="ligne">${meilleur && meilleur.resume.navigables
        ? `<span>Le mieux : <b>${plageDates(meilleur.jours)}</b>, <b data-compte="${meilleur.resume.navigables}">0</b> h navigables</span>`
        : '<span>Aucun créneau navigable sur les week-ends prévus.</span>'}</div>
    </div>`;
  $('#corps').innerHTML = `
    <div class="choix-spot">${spots.map(s => `<button class="puce verre" data-quand="${s.id}" aria-pressed="${s.id === spot.id}">${etat.r.favoris.includes(s.id) ? '★ ' : ''}${echapper(s.nom)}</button>`).join('')}</div>
    <div class="titre-section">Les week-ends à venir</div>
    ${weekends.map(blocWeekend).join('')}
    <p class="note">La prévision couvre 16 jours, mais sa fiabilité tombe vite : au-delà d'une semaine, c'est une tendance, pas une promesse. La marée n'est connue qu'à 8 jours.</p>
    <button class="bouton discret" data-spot="${spot.id}" style="width:100%">Ouvrir la fiche</button>`;
  animerChiffres($('#heros'));
  animerChiffres($('#corps'));
  $('#corps').querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ------------------------------------------------------------------------------------------------
// Rendu général

function chargement() {
  $('#heros').innerHTML = '<div class="heros"><div class="sur">Lecture du vent…</div><h2>Coup de vent</h2><div class="ligne">Prévisions de 29 spots, routes et carburant.</div></div>';
  $('#corps').innerHTML = '<div class="squelette"></div><div class="squelette"></div><div class="squelette"></div>';
}

function rendre() {
  if (!etat.prev) {
    if (etat.prevErreur) {
      $('#heros').innerHTML = `<div class="heros"><div class="sur">Hors ligne</div><h2>Pas de prévision</h2><div class="ligne">${echapper(etat.prevErreur)}. Réessaie avec du réseau.</div></div>`;
      $('#corps').innerHTML = '<button class="bouton" data-action="recharger" style="width:100%">Réessayer</button>';
    }
    return;
  }
  calculer();
  rendreWeekends();
  majCurseur();
  if (etat.vue === 'quand') rendreQuand();
  else if (etat.ouvert) rendreFiche(etat.ouvert);
  else rendreOu();
  majCarte();
  majSegment();
}

function majSegment() {
  const seg = $('.segment');
  const actif = seg.querySelector(`[data-vue="${etat.vue}"]`);
  seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === actif)));
  const c = seg.querySelector('.curseur');
  c.style.left = actif.offsetLeft + 'px';
  c.style.width = actif.offsetWidth + 'px';
}

// ------------------------------------------------------------------------------------------------
// Feuille : trois crans sur téléphone (aperçu, moitié, plein écran), tirée au doigt.

const feuille = $('#feuille');
const grandEcran = () => matchMedia('(min-width: 900px)').matches;
let cran = 'bas';

function positions() {
  const h = feuille.offsetHeight;
  return { bas: Math.max(0, h - 200), milieu: Math.round(h * 0.42), haut: 0 };
}
function poserCran(c) {
  cran = c;
  feuille.style.setProperty('--y', positions()[c] + 'px');
}

(function gestes() {
  const tete = $('#tete');
  let y0 = null, depart = 0, t0 = 0, bouge = false;
  tete.addEventListener('pointerdown', e => {
    if (grandEcran() || e.target.closest('button, a')) return;
    y0 = e.clientY; depart = positions()[cran]; t0 = performance.now(); bouge = false;
    feuille.classList.add('glisse');
    tete.setPointerCapture(e.pointerId);
  });
  tete.addEventListener('pointermove', e => {
    if (y0 == null) return;
    const dy = e.clientY - y0;
    if (Math.abs(dy) > 4) bouge = true;
    const y = Math.max(0, depart + dy);
    feuille.style.setProperty('--y', y + 'px');
  });
  const fin = e => {
    if (y0 == null) return;
    feuille.classList.remove('glisse');
    const dy = e.clientY - y0, v = dy / Math.max(1, performance.now() - t0);
    y0 = null;
    if (!bouge) { poserCran(cran === 'bas' ? 'milieu' : cran === 'milieu' ? 'haut' : 'bas'); return; }
    const p = positions(), y = Math.max(0, depart + dy);
    // Un geste rapide va au cran suivant ; sinon, le cran le plus proche.
    let c = Object.entries(p).sort((a, b) => Math.abs(a[1] - y) - Math.abs(b[1] - y))[0][0];
    if (Math.abs(v) > 0.6) c = v > 0 ? (cran === 'haut' ? 'milieu' : 'bas') : (cran === 'bas' ? 'milieu' : 'haut');
    poserCran(c);
  };
  tete.addEventListener('pointerup', fin);
  tete.addEventListener('pointercancel', fin);
  addEventListener('resize', () => poserCran(cran));
})();

// ------------------------------------------------------------------------------------------------
// Réglages

function rendreReglages() {
  const r = etat.r;
  const champNum = (cle, lib, min, max, pas, unite, aide = '') => `
    <div class="champ"><label for="r-${cle}">${lib} <b id="v-${cle}">${r[cle]} ${unite}</b></label>
      <input type="range" id="r-${cle}" data-reglage="${cle}" min="${min}" max="${max}" step="${pas}" value="${r[cle]}" data-unite="${unite}">
      ${aide ? `<div class="aide">${aide}</div>` : ''}</div>`;
  const bascule = (groupe, valeur, lib, actif) => `<button class="bascule" data-groupe="${groupe}" data-valeur="${valeur}" aria-pressed="${actif}">${lib}</button>`;
  const prix = etat.carburant?.[r.carburant];
  const theme = document.documentElement.dataset.theme || 'auto';
  $('#reglages .panneau').innerHTML = `
    <div class="fiche-tete"><h3 class="grow" style="margin-left:6px">Réglages</h3><button class="rond" data-action="fermer-reglages" aria-label="Fermer">${ICONES.fermer}</button></div>
    <div class="champ"><label for="r-ville">Départ</label>
      <select id="r-ville" data-reglage="ville">${Object.entries(VILLES).map(([k, v]) => `<option value="${k}" ${k === r.ville ? 'selected' : ''}>${v.nom}</option>`).join('')}</select>
      <div class="aide">L'avion n'est proposé qu'au départ de Paris.</div></div>
    ${champNum('ventMin', 'Vent minimum', 8, 25, 1, 'nœuds')}
    ${champNum('ventMax', 'Vent maximum', 18, 45, 1, 'nœuds')}
    ${champNum('rafalesMax', 'Rafales maximum', 20, 55, 1, 'nœuds')}
    ${champNum('trajetMaxH', 'Trajet maximum (aller)', 1, 9, 0.5, 'h')}
    ${champNum('budgetMax', 'Budget trajet (aller-retour)', 40, 600, 10, '€', 'Logement non compté.')}
    <div class="champ"><span class="lab">Week-end</span><div class="bascules">
      ${bascule('pont', 'aucun', 'Samedi-dimanche', r.pont === 'aucun')}${bascule('pont', 'vendredi', '+ vendredi', r.pont === 'vendredi')}${bascule('pont', 'lundi', '+ lundi', r.pont === 'lundi')}</div></div>
    <div class="champ"><span class="lab">Modes de transport</span><div class="bascules">
      ${['voiture', 'train', 'avion'].map(m => bascule('mode', m, NOM_MODE[m], r.modes[m])).join('')}</div></div>
    <div class="champ"><span class="lab">Planche</span><div class="bascules">
      ${bascule('planche', 'twin-tip', 'Twin-tip', r.planche === 'twin-tip')}${bascule('planche', 'directionnelle', 'Directionnelle (> 130 cm)', r.planche === 'directionnelle')}</div>
      <div class="aide">TGV et Intercités acceptent une housse de 130 × 90 cm au plus, sans supplément ; OUIGO facture 5 € en ligne.</div></div>
    <div class="champ"><span class="lab">Voiture</span><div class="grille2">
      <select data-reglage="carburant">${['gazole', 'e10', 'sp95', 'sp98'].map(c => `<option value="${c}" ${c === r.carburant ? 'selected' : ''}>${c === 'e10' ? 'SP95-E10' : c.toUpperCase().replace('GAZOLE', 'Gazole')}</option>`).join('')}</select>
      <input type="number" data-reglage="consoL100" min="3" max="15" step="0.1" value="${r.consoL100}" aria-label="Consommation en litres aux 100 km"></div>
      <div class="aide">Consommation en L/100 km. Prix : ${prix ? `${prix.toFixed(2)} €/L, moyenne nationale du jour (prix-carburants.gouv.fr)` : `${PRIX_CARBURANT_SECOURS[r.carburant]} €/L, valeur de secours (prix du jour indisponible)`}. Péages estimés à 0,10 €/km d'autoroute.</div></div>
    <div class="champ"><span class="lab">Avion</span><div class="grille2">
      <input type="number" data-reglage="billetAvion" min="30" max="900" step="10" value="${r.billetAvion}" aria-label="Billet aller-retour en euros">
      <select data-reglage="compagnie">${Object.entries(COMPAGNIES).map(([k, c]) => `<option value="${k}" ${k === r.compagnie ? 'selected' : ''}>${c.nom} — sac ${c.sac ? c.sac + ' €' : 'inclus'}</option>`).join('')}</select></div>
      <div class="aide">Billet aller-retour estimé. ${echapper(COMPAGNIES[r.compagnie]?.note || '')}</div></div>
    <div class="champ"><span class="lab">Thème</span><div class="bascules">
      ${bascule('theme', 'auto', 'Auto', theme === 'auto')}${bascule('theme', 'light', 'Clair', theme === 'light')}${bascule('theme', 'dark', 'Sombre', theme === 'dark')}</div></div>
    <div class="champ"><span class="lab">Favoris</span><div class="bascules">
      ${tousLesSpots().map(s => `<button class="bascule" data-groupe="favori" data-valeur="${s.id}" aria-pressed="${r.favoris.includes(s.id)}">${echapper(s.nom)}</button>`).join('')}</div></div>
    <div class="champ"><span class="lab">Ajouter un spot</span>
      <input type="text" id="n-nom" placeholder="Nom du spot">
      <div class="grille2"><input type="number" id="n-lat" step="0.001" placeholder="Latitude (ex. 47.52)"><input type="number" id="n-lon" step="0.001" placeholder="Longitude (ex. -3.14)"></div>
      <div class="grille2"><input type="number" id="n-face" min="0" max="359" placeholder="Orientation vers le large (°)">
        <select id="n-maree"><option value="toutes">Toutes marées</option><option value="mi,haute">Mi-marée à haute</option><option value="haute">Marée haute</option><option value="basse,mi">Basse à mi-marée</option><option value="aucune">Sans marée (Méditerranée)</option></select></div>
      <div class="aide">Orientation : le cap de la plage vers la mer (une plage face à l'ouest = 270°). La gare la plus proche à moins de 70 km est choisie toute seule.</div>
      <button class="bouton" data-action="ajouter-spot">Ajouter</button>
      ${r.spotsPerso.map(s => `<button class="ligne-ecart" data-action="retirer-spot" data-id="${s.id}"><span>${echapper(s.nom)}</span><span>Retirer</span></button>`).join('')}</div>
    <p class="note">Sources : Open-Meteo (vent, mer — CC-BY 4.0), OSRM / OpenStreetMap (routes, ODbL), prix-carburants.gouv.fr (Licence Ouverte). Prix du train, de l'avion, des péages, du taxi et de la location : barèmes estimés. ${echapper(SOURCE_SPOTS)}</p>`;
}

function ouvrirReglages(ouvrir) {
  const fond = $('#reglages');
  if (ouvrir) rendreReglages();
  fond.classList.toggle('ouvert', ouvrir);
  fond.setAttribute('aria-hidden', String(!ouvrir));
}

let recalcul;
function reglageChange(recharger = false) {
  sauverReglages();
  clearTimeout(recalcul);
  recalcul = setTimeout(async () => {
    if (recharger) await chargerTout(false);
    else rendre();
  }, 120);
}

function appliquerTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('coup-de-vent:theme', t); } catch { /* rien */ }
  carte?.relancer();
}

function ajouterSpot() {
  const nom = $('#n-nom').value.trim(), lat = parseFloat($('#n-lat').value), lon = parseFloat($('#n-lon').value), face = parseFloat($('#n-face').value);
  if (!nom || !(lat > 41 && lat < 51.5) || !(lon > -5.5 && lon < 9.7) || !(face >= 0 && face < 360)) {
    toast('Il faut un nom, une position en France et une orientation entre 0 et 359°.');
    return;
  }
  const m = $('#n-maree').value;
  const maree = m === 'aucune' ? null : m === 'toutes' ? ['basse', 'mi', 'haute'] : m.split(',');
  let gare = null, d = 70;
  Object.entries(GARES).forEach(([k, g]) => { const x = distanceKm(g, { lat, lon }); if (x < d) { d = x; gare = k; } });
  etat.r.spotsPerso.push({ id: 'perso-' + Date.now().toString(36), nom, lieu: 'Ajouté', zone: 'Mes spots', lat, lon, face, maree, gare, perso: true });
  toast(`${nom} ajouté${gare ? ` (gare : ${GARES[gare].nom})` : ', sans gare à moins de 70 km'}.`);
  rendreReglages();
  reglageChange(true);
}

// ------------------------------------------------------------------------------------------------
// Événements

document.addEventListener('click', e => {
  const el = e.target.closest('[data-spot], [data-samedi], [data-vue], [data-quand], [data-action], [data-groupe]');
  if (!el) return;
  if (el.dataset.vue) {
    etat.vue = el.dataset.vue; etat.ouvert = null;
    rendre();
    if (!grandEcran() && cran === 'bas') poserCran('milieu');
  } else if (el.dataset.samedi) {
    etat.samedi = el.dataset.samedi;
    rendre();
  } else if (el.dataset.quand) {
    etat.spotQuand = el.dataset.quand;
    rendreQuand(); majCarte();
  } else if (el.dataset.spot) {
    ouvrirSpot(el.dataset.spot);
  } else if (el.dataset.groupe) {
    const { groupe, valeur } = el.dataset;
    if (groupe === 'pont') etat.r.pont = valeur;
    if (groupe === 'planche') etat.r.planche = valeur;
    if (groupe === 'mode') etat.r.modes[valeur] = !etat.r.modes[valeur];
    if (groupe === 'favori') etat.r.favoris = etat.r.favoris.includes(valeur) ? etat.r.favoris.filter(x => x !== valeur) : [...etat.r.favoris, valeur];
    if (groupe === 'theme') appliquerTheme(valeur);
    rendreReglages();
    if (groupe !== 'theme') reglageChange();
  } else {
    const a = el.dataset.action;
    if (a === 'retour') { etat.ouvert = null; $('#corps').innerHTML = ''; rendre(); }
    if (a === 'favori') {
      const id = etat.ouvert;
      etat.r.favoris = etat.r.favoris.includes(id) ? etat.r.favoris.filter(x => x !== id) : [...etat.r.favoris, id];
      sauverReglages(); rendre();
      if (!calme()) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-12deg)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.2,.9,.2,1)' });
    }
    if (a === 'fermer-reglages') ouvrirReglages(false);
    if (a === 'ajouter-spot') ajouterSpot();
    if (a === 'retirer-spot') { etat.r.spotsPerso = etat.r.spotsPerso.filter(s => s.id !== el.dataset.id); rendreReglages(); reglageChange(true); }
    if (a === 'recharger') chargerTout(true);
  }
});

function ouvrirSpot(id) {
  if (etat.vue === 'quand') etat.vue = 'ou';
  etat.ouvert = id;
  rendre();
  if (!grandEcran() && cran !== 'haut') poserCran('milieu');
}

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'curseur-heure') { etat.idx = +el.value; basculerLecture(false); majCarte(); return; }
  const cle = el.dataset.reglage;
  if (!cle) return;
  const v = el.type === 'range' || el.type === 'number' ? parseFloat(el.value) : el.value;
  if (el.type === 'number' && !Number.isFinite(v)) return;
  etat.r[cle] = v;
  // Les deux bornes du vent ne se croisent pas.
  if (cle === 'ventMin' && etat.r.ventMax <= v) etat.r.ventMax = v + 1;
  if (cle === 'ventMax' && etat.r.ventMin >= v) etat.r.ventMin = v - 1;
  const lab = document.getElementById('v-' + cle);
  if (lab) lab.textContent = `${v} ${el.dataset.unite}`;
  if (cle === 'compagnie' || cle === 'carburant') rendreReglages();
  reglageChange(cle === 'ville');
});

$('#ouvrir-reglages').addEventListener('click', () => ouvrirReglages(true));
$('#reglages').addEventListener('click', e => { if (e.target.id === 'reglages') ouvrirReglages(false); });
$('#lecture').addEventListener('click', () => basculerLecture());
addEventListener('keydown', e => { if (e.key === 'Escape') ouvrirReglages(false); });

// ------------------------------------------------------------------------------------------------
// Démarrage

async function chargerTout(premiere) {
  const spots = tousLesSpots();
  const ville = VILLES[etat.r.ville];
  const [prev, routes, carbu] = await Promise.allSettled([chargerPrevisions(spots), chargerRoutes(ville, spots), chargerCarburant()]);
  if (prev.status === 'fulfilled') {
    etat.prev = prev.value.valeur;
    etat.prevQuand = prev.value.quand;
    if (prev.value.erreur) toast('Hors ligne : prévision du ' + new Date(prev.value.quand).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }));
  } else {
    etat.prevErreur = String(prev.reason?.message || prev.reason);
  }
  etat.routes = routes.status === 'fulfilled' ? routes.value.valeur : {};
  if (routes.status !== 'fulfilled' && !premiere) toast('Routes indisponibles : distances estimées à vol d\'oiseau.');
  etat.carburant = carbu.status === 'fulfilled' ? carbu.value.valeur : null;
  rendre();
}

try { const t = localStorage.getItem('coup-de-vent:theme'); if (t && t !== 'auto') document.documentElement.dataset.theme = t; } catch { /* rien */ }
carte = new Carte($('#carte'), { surSpot: id => (etat.vue === 'quand' ? (etat.spotQuand = id, rendreQuand(), majCarte()) : ouvrirSpot(id)) });
$('#lecture').innerHTML = ICONES.lecture;
chargement();
poserCran('bas');
majSegment();
chargerTout(true);
