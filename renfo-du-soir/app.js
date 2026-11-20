// Renfo du soir — l'interface : ce soir, la séance guidée, la fin de séance, le suivi, les réglages.
import { ZONES, CYCLE, CIRCUITS, FAMILLES, ETAPES_FIXES } from './exercices.js';
import {
  jourDe, zoneDuSoir, construireSeance, duree, toursFaits, enregistrer, ressentisDe, etatVide, serie, calendrier, courbe,
  valider, niveauDe, position, CRANS_PAR_VARIANTE, bout, passerVariante,
} from './moteur.js';
import { dessiner } from './schema.js';
import * as voix from './voix.js';

// ── Petits outils ────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) n.style.setProperty(p.startsWith('--') ? p : p.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), x);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...enfants.flat(Infinity).filter(e => e !== null && e !== undefined && e !== false));
  return n;
}
let minuteurToast;
function toast(texte) {
  const t = $('toast');
  t.textContent = texte;
  t.hidden = false;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => { t.hidden = true; }, 2600);
}
const minutes = s => { const t = Math.ceil(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const aujourdhui = () => jourDe(new Date());
const nomEtape = id => FAMILLES[id]?.nom || ETAPES_FIXES[id]?.nom || '';
const defEtape = id => FAMILLES[id] || ETAPES_FIXES[id];

function appliquerZone(noeud, zone) {
  noeud.style.setProperty('--zone', ZONES[zone].couleur);
  noeud.style.setProperty('--zone-clair', ZONES[zone].clair);
}

// ── Stockage : tout reste sur le téléphone ───────────────────────────────────

const CLE = 'renfo-du-soir';
const CLE_REGLAGES = 'renfo-du-soir:reglages';

function lire(cle, defaut) {
  try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); return true; } catch { return false; }
}

let etat = (() => { try { return valider(lire(CLE, etatVide())); } catch { return etatVide(); } })();
let reglages = { voix: true, bips: true, ...lire(CLE_REGLAGES, {}) };
voix.regler(reglages);

function sauver() {
  if (!ecrire(CLE, etat)) toast('Impossible d’enregistrer sur ce téléphone');
}

// ── Navigation ───────────────────────────────────────────────────────────────

let vue = 'soir';
let zoneChoisie = null;   // une autre zone choisie pour ce soir (pas enregistrée)

function montrer(nom) {
  vue = nom;
  for (const v of ['soir', 'suivi', 'reglages']) $(`vue-${v}`).hidden = v !== nom;
  document.querySelectorAll('.onglets button').forEach(b => b.toggleAttribute('aria-current', b.dataset.vue === nom));
  if (nom === 'soir') rendreSoir();
  if (nom === 'suivi') rendreSuivi();
  if (nom === 'reglages') rendreReglages();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.onglets button').forEach(b => b.addEventListener('click', () => montrer(b.dataset.vue)));

function rendreSerie() {
  const s = serie(etat.seances.map(x => x.jour), aujourdhui());
  $('serie').replaceChildren(s.soirs
    ? el('span', {}, `🔥 ${pluriel(s.soirs, 'soir')}`, s.jokers ? el('small', {}, ` · ${pluriel(s.jokers, 'joker')}`) : null)
    : el('span', {}, '🌙 Premier soir'));
}

// ── Ce soir ──────────────────────────────────────────────────────────────────

function zoneDuJour() { return zoneChoisie || zoneDuSoir(etat.seances); }

function rendreSoir() {
  rendreSerie();
  const zone = zoneDuJour();
  const prevue = zoneDuSoir(etat.seances);
  const fait = etat.seances.some(s => s.jour === aujourdhui());
  const vueSoir = $('vue-soir');
  appliquerZone(vueSoir, zone);
  const complete = construireSeance({ zone, format: 'complete', niveaux: etat.niveaux });
  const courte = construireSeance({ zone, format: 'courte', niveaux: etat.niveaux });

  const liste = el('ul', { class: 'circuit' }, CIRCUITS[zone].map(id => {
    const n = niveauDe(etat.niveaux, id);
    const mini = el('div', { class: 'mini' });
    dessiner(mini, FAMILLES[id], ZONES[FAMILLES[id].zone].couleur, { anime: false });
    return el('li', {}, mini,
      el('div', {}, el('div', { class: 'nom' }, FAMILLES[id].nom), el('div', { class: 'var' }, FAMILLES[id].variantes[n.v]),
        el('div', { class: 'muscles-liste' }, FAMILLES[id].muscles)),
      el('span', { class: 'sec' }, `${n.s} s`));
  }));

  vueSoir.replaceChildren(
    el('div', { class: 'soir-carte' },
      el('div', { class: 'surtitre' }, 'Ce soir'),
      el('h2', {}, ZONES[zone].nom),
      el('div', {}, `5 exercices · ${CIRCUITS[zone].map(id => FAMILLES[id].nom.toLowerCase()).slice(0, 3).join(', ')}…`),
      fait ? el('span', { class: 'fait' }, '✓ Soirée tenue — tu peux en refaire une') : null),
    el('div', { class: 'zones', role: 'group', 'aria-label': 'Zone de ce soir' },
      CYCLE.map(z => el('button', {
        type: 'button', 'aria-pressed': String(z === zone),
        onclick: () => { zoneChoisie = z === prevue ? null : z; rendreSoir(); },
      }, el('span', { class: 'pastille', style: { background: ZONES[z].couleur } }), ZONES[z].court, z === prevue ? ' · prévue' : ''))),
    el('div', { class: 'lancer' },
      el('button', { type: 'button', class: 'bouton', onclick: () => demarrer('complete') },
        'Séance', el('small', {}, `3 tours · ${Math.round(duree(complete) / 60)} min`)),
      el('button', { type: 'button', class: 'bouton second', onclick: () => demarrer('courte') },
        'Version courte', el('small', {}, `1 tour · ${Math.round(duree(courte) / 60)} min`))),
    el('div', { class: 'carte' }, el('h3', {}, 'Le circuit'), liste,
      el('p', { class: 'doux petit' }, '2 min d’échauffement avant, 2 min de retour au calme après. À la fin, un seul geste : facile, ok ou dur. Il règle la séance suivante.')),
  );
}

// ── La séance guidée ─────────────────────────────────────────────────────────

let run = null;
let minuteur = null;

function demarrer(format) {
  voix.deverrouiller();
  voix.garderEcranAllume(true);
  const zone = zoneDuJour();
  const seance = construireSeance({ zone, format, niveaux: etat.niveaux });
  run = { seance, i: 0, t0: 0, pauseA: null, debut: new Date().toISOString(), dits: new Set(), total: duree(seance) };
  appliquerZone($('seance'), zone);
  $('seance').hidden = false;
  document.body.style.overflow = 'hidden';
  entrerEtape();
  minuteur = setInterval(tic, 200);
}

const etapeCourante = () => run.seance.etapes[run.i];

/** La prochaine étape où l'on bouge (on saute les repos). */
function prochaineActive(depuis) {
  return run.seance.etapes.slice(depuis + 1).find(e => e.phase !== 'repos' && e.phase !== 'pret');
}
function texteEtape(e) {
  if (!e) return '';
  return e.phase === 'effort' ? e.variante : nomEtape(e.id);
}

function entrerEtape() {
  const e = etapeCourante();
  run.t0 = performance.now();
  run.dits = new Set();
  const seanceEl = $('seance');
  seanceEl.classList.toggle('effort', e.phase === 'effort');

  // ce qu'on montre : l'exercice en cours, ou pendant un repos, celui qui vient
  const montre = e.phase === 'repos' || e.phase === 'pret' ? prochaineActive(run.i) : e;
  // la couleur suit l'exercice : vert pour les abdos, la couleur du soir pour le reste
  const zone = FAMILLES[montre.id]?.zone || run.seance.zone;
  appliquerZone(seanceEl, zone);
  const couleur = e.phase === 'effort' ? '#FFFFFF' : ZONES[zone].couleur;
  const def = defEtape(montre.id);
  const fixes = run.seance.etapes.filter(x => x.phase === e.phase);
  const etiquette = {
    pret: 'Prêt ?',
    echauffement: `Échauffement · ${fixes.indexOf(e) + 1}/${fixes.length}`,
    effort: `Tour ${e.tour}/${e.tours} · ${e.rang}/${run.seance.circuit.length}`,
    repos: e.finDeTour ? `Fin du tour ${e.finDeTour} · repos` : 'Repos · ensuite',
    calme: `Retour au calme · ${fixes.indexOf(e) + 1}/${fixes.length}`,
  }[e.phase];
  $('etiquette').textContent = etiquette;
  $('nom-exercice').textContent = def.nom;
  $('variante').textContent = montre.phase === 'effort' ? montre.variante : '';
  $('phase').textContent = { pret: 'Échauffement', echauffement: 'Échauffement', effort: 'Circuit', repos: 'Circuit', calme: 'Retour au calme' }[e.phase];
  dessiner($('schema-seance'), def, couleur);
  $('consignes').replaceChildren(...(def.consignes || []).map(c => el('li', {}, c)));
  // l'exercice du circuit (en cours ou à venir) : muscles, repère de technique, erreur à éviter
  const famille = FAMILLES[montre.id];
  $('muscles').textContent = famille ? famille.muscles : '';
  $('repere').textContent = !famille ? ''
    : famille.repere ? famille.repere
    : famille.tenu ? 'Respire calmement · arrête-toi si la position casse'
      : 'Descends en 2-3 s · arrête-toi si la technique casse';
  $('erreur').textContent = famille?.erreur ? `À éviter : ${famille.erreur}` : '';

  const suite = prochaineActive(run.i);
  $('ensuite').textContent = e.phase === 'repos' || e.phase === 'pret' || !suite ? '' : `Ensuite : ${texteEtape(suite)}`;

  annoncer(e);
  tic();
}

function annoncer(e) {
  const precedente = run.seance.etapes[run.i - 1];
  const suite = prochaineActive(run.i);
  const premiereDuCalme = e.phase === 'calme' && precedente?.phase !== 'calme';
  let phrase = '';
  if (e.phase === 'pret') phrase = `Prêt ? On commence par l’échauffement : ${nomEtape(suite.id)}.`;
  else if (e.phase === 'echauffement') phrase = precedente?.phase === 'pret' ? '' : nomEtape(e.id);
  else if (e.phase === 'effort') { voix.bip('long'); phrase = precedente?.phase === 'repos' ? 'C’est parti !' : `${e.variante}. C’est parti !`; }
  else if (e.phase === 'repos') {
    const ensuite = suite?.phase === 'effort' ? ` Ensuite : ${suite.variante}.` : '';
    phrase = (e.finDeTour ? `Fin du tour ${e.finDeTour}. ${REPOS_TOUR_TEXTE}` : 'Repos.') + ensuite;
  } else if (premiereDuCalme) phrase = `Bravo, le circuit est fini. Retour au calme : ${nomEtape(e.id)}.`;
  else if (e.phase === 'calme') phrase = nomEtape(e.id);
  voix.parler(phrase);
}
const REPOS_TOUR_TEXTE = 'Quarante secondes de repos.';

function tic() {
  if (!run || run.pauseA !== null) return;
  const e = etapeCourante();
  const ecoule = (performance.now() - run.t0) / 1000;
  const reste = Math.max(0, Math.ceil(e.secondes - ecoule));
  $('chrono').textContent = reste;
  const passe = run.seance.etapes.slice(0, run.i).reduce((s, x) => s + x.secondes, 0) + Math.min(ecoule, e.secondes);
  $('barre-remplie').style.width = `${(100 * passe) / run.total}%`;
  $('reste-total').textContent = `${minutes(Math.max(0, run.total - passe))} restantes`;

  const une = cle => { if (run.dits.has(cle)) return false; run.dits.add(cle); return true; };
  if (e.mi && e.secondes >= 30 && reste === Math.floor(e.secondes / 2) && une('mi')) voix.parler(e.mi);
  if (reste <= 3 && reste >= 1 && une(`bip${reste}`)) voix.bip('court');
  if (ecoule >= e.secondes) suivant();
}

function suivant() {
  run.i++;
  if (run.i >= run.seance.etapes.length) return terminer(true);
  entrerEtape();
}

function basculerPause() {
  if (!run) return;
  if (run.pauseA === null) {
    run.pauseA = performance.now();
    voix.taire();
    $('b-pause').textContent = '▶';
    $('b-pause').setAttribute('aria-label', 'Reprendre');
    $('seance').classList.add('pause');
  } else {
    run.t0 += performance.now() - run.pauseA;
    run.pauseA = null;
    $('b-pause').textContent = '⏸';
    $('b-pause').setAttribute('aria-label', 'Pause');
    $('seance').classList.remove('pause');
    tic();
  }
}

function arreter() {
  if (!run) return;
  const tours = toursFaits(run.seance, run.i);
  const message = tours
    ? `Arrêter ici ? ${pluriel(tours, 'tour')} ${tours > 1 ? 'sont faits' : 'est fait'} : la soirée compte.`
    : 'Arrêter ici ? Aucun tour n’est fini : rien ne sera enregistré.';
  if (run.pauseA === null) basculerPause();
  if (!confirm(message)) return basculerPause();
  terminer(false);
}

function quitterSeance() {
  clearInterval(minuteur);
  voix.garderEcranAllume(false);
  $('seance').hidden = true;
  $('seance').classList.remove('pause', 'effort');
  $('b-pause').textContent = '⏸';
  document.body.style.overflow = '';
}

function terminer(complet) {
  const tours = complet ? run.seance.tours : toursFaits(run.seance, run.i);
  quitterSeance();
  if (complet) { voix.bip('fin'); voix.parler('Séance terminée. Bravo !'); } else voix.taire();
  afficherFin({ ...run, tours, fin: new Date().toISOString() });
  run = null;
}

$('b-pause').addEventListener('click', basculerPause);
$('b-passer').addEventListener('click', () => { if (run) { if (run.pauseA !== null) basculerPause(); suivant(); } });
$('b-arreter').addEventListener('click', arreter);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run) voix.garderEcranAllume(true);
});

// ── Fin de séance ────────────────────────────────────────────────────────────

function afficherFin(r) {
  const zone = r.seance.zone;
  const fin = $('fin');
  appliquerZone(fin, zone);
  let global = null;
  const aPart = {};
  const fermer = () => { fin.hidden = true; document.body.style.overflow = ''; montrer('soir'); };

  if (!r.tours) {
    fin.replaceChildren(el('div', {},
      el('div', { class: 'bravo' }, el('div', { class: 'grand-emoji' }, '🌙'), el('h2', {}, 'Séance arrêtée'),
        el('p', { class: 'doux' }, 'Aucun tour n’était fini : rien n’est enregistré ce soir. La version courte prend 10 minutes.')),
      el('button', { type: 'button', class: 'bouton', onclick: fermer }, 'Retour')));
    fin.hidden = false;
    return;
  }

  const EMOJI = { facile: '😌 Facile', ok: '🙂 Ok', dur: '😮‍💨 Dur' };
  const choix = (valeur, choisir) => {
    const boutons = ['facile', 'ok', 'dur'].map(v => el('button', {
      type: 'button', 'aria-pressed': String(valeur === v),
      onclick: () => { choisir(v); boutons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); },
      'data-v': v,
    }, EMOJI[v]));
    return boutons;
  };
  const boutonEnregistrer = el('button', { type: 'button', class: 'bouton', disabled: true, onclick: () => enregistrerSoiree() }, 'Enregistrer la soirée');
  const note = el('div', { class: 'note-globale' }, choix(null, v => { global = v; boutonEnregistrer.disabled = false; }));
  const details = el('details', { class: 'a-part' },
    el('summary', {}, 'Un exercice était différent ?'),
    el('p', { class: 'doux petit' }, 'Note-le à part : les autres gardent la note de la séance.'),
    r.seance.circuit.map(id => el('div', {}, el('strong', {}, FAMILLES[id].nom),
      el('div', { class: 'choix-ressenti' }, choix(null, v => { aPart[id] = v; })))));

  const enregistrerSoiree = () => {
    const avant = etat.niveaux;
    etat = enregistrer(etat, { zone, format: r.seance.format, tours: r.tours, ressentis: ressentisDe(zone, global || 'ok', aPart), debut: r.debut, fin: r.fin });
    zoneChoisie = null;
    sauver();
    fin.replaceChildren(el('div', {}, bilan(avant, zone), el('button', { type: 'button', class: 'bouton', onclick: fermer }, 'Terminé')));
    fin.scrollTo(0, 0);
  };

  const partielle = r.tours < r.seance.tours;
  fin.replaceChildren(el('div', {},
    el('div', { class: 'bravo' }, el('div', { class: 'grand-emoji' }, partielle ? '👍' : '🎉'),
      el('h2', {}, partielle ? 'Soirée tenue' : 'Bravo !'),
      el('p', { class: 'doux' }, `${ZONES[zone].nom} · ${pluriel(r.tours, 'tour')}${partielle ? ' : ça compte comme une version courte' : ''}`)),
    el('div', { class: 'carte' }, el('h3', {}, 'La séance, c’était… ?'),
      el('p', { class: 'doux petit' }, 'Deux « facile » de suite font monter les exercices d’un cran, deux « dur » les font redescendre.'),
      note, details),
    boutonEnregistrer));
  fin.hidden = false;
  fin.scrollTo(0, 0);
}

function bilan(avant, zone) {
  const s = serie(etat.seances.map(x => x.jour), aujourdhui());
  const changements = CIRCUITS[zone].map(id => {
    const a = niveauDe(avant, id);
    const b = niveauDe(etat.niveaux, id);
    const f = FAMILLES[id];
    if (position(b) > position(a)) {
      return el('li', {}, el('span', { class: 'monte' }, '▲ '), `${f.nom} : ${a.s} → ${b.s} s`);
    }
    if (position(b) < position(a)) {
      return el('li', {}, el('span', { class: 'descend' }, '▼ '), b.v < a.v ? `${f.nom} : on revient à ${f.variantes[b.v]}, ${b.s} s` : `${f.nom} : ${a.s} → ${b.s} s`);
    }
    if (b.n === 1) return el('li', { class: 'doux', 'data-attente': b.sens }, `${f.nom} : ${b.sens === 'facile' ? 'encore un « facile » pour monter' : 'encore un « dur » pour redescendre'}`);
    if (bout(b, f.variantes.length) === 'sommet') return el('li', { class: 'doux' }, `${f.nom} : au sommet de l’échelle`);
    return null;
  }).filter(Boolean);
  // tous en attente dans le même sens (une seule note pour la séance) : une seule ligne
  const sens = changements[0]?.dataset.attente;
  if (changements.length === CIRCUITS[zone].length && sens && changements.every(c => c.dataset.attente === sens)) {
    changements.splice(0, changements.length, el('li', { class: 'doux' },
      sens === 'facile' ? 'Encore une séance « facile » et tous les exercices montent d’un cran.' : 'Encore une séance « dur » et tous les exercices redescendent d’un cran.'));
  }
  // la variante plus dure se propose, exercice par exercice ; sans réponse, la question revient
  const prets = CIRCUITS[zone].filter(id => etat.niveaux[id]?.pret);
  const propositions = prets.length ? el('div', { class: 'carte' }, el('h3', {}, 'Prêt pour la suite ?'),
    el('p', { class: 'doux petit' }, 'Ces exercices sont faciles à 50 s depuis deux séances. La variante suivante repart à 35 s.'),
    prets.map(id => {
      const f = FAMILLES[id];
      const n = etat.niveaux[id];
      const ligne = el('div', { class: 'proposition' });
      const repondre = oui => {
        etat = { ...etat, niveaux: { ...etat.niveaux, [id]: oui ? passerVariante(n, f.variantes.length) : { ...n, pret: false } } };
        sauver();
        ligne.replaceChildren(el('p', {}, oui ? `✓ ${f.nom} : ce sera « ${f.variantes[n.v + 1]} », 35 s.` : `${f.nom} : on reste sur « ${f.variantes[n.v]} ».`));
      };
      ligne.append(el('p', {}, el('strong', {}, f.nom), ` : passer à « ${f.variantes[n.v + 1]} » ?`),
        el('div', { class: 'rangee' },
          el('button', { type: 'button', class: 'petit-bouton oui', onclick: () => repondre(true) }, 'Oui'),
          el('button', { type: 'button', class: 'petit-bouton', onclick: () => repondre(false) }, 'Pas encore')));
      return ligne;
    })) : null;
  return el('div', {},
    el('div', { class: 'bravo' }, el('div', { class: 'grand-emoji' }, '🔥'), el('h2', {}, pluriel(s.soirs, 'soir')),
      el('p', { class: 'doux' }, s.soirs > 1 ? 'd’affilée. À demain soir !' : 'C’est parti. À demain soir !')),
    propositions,
    el('div', { class: 'carte' }, el('h3', {}, 'La prochaine fois'),
      changements.length ? el('ul', { class: 'changements' }, changements)
        : el('p', { class: 'doux' }, prets.length ? 'Les autres exercices ne changent pas.' : 'Rien ne change : mêmes exercices, mêmes temps.')));
}

// ── Suivi ────────────────────────────────────────────────────────────────────

let moisAffiche = null;

function rendreSuivi() {
  rendreSerie();
  const auj = aujourdhui();
  const jours = etat.seances.map(x => x.jour);
  const s = serie(jours, auj);
  const [a, m] = moisAffiche || auj.split('-').map(Number);
  moisAffiche = [a, m];
  const premierMois = (etat.seances[0]?.jour || auj).slice(0, 7);
  const cle = `${a}-${String(m).padStart(2, '0')}`;
  const changerMois = d => { const n = new Date(a, m - 1 + d, 1); moisAffiche = [n.getFullYear(), n.getMonth() + 1]; rendreSuivi(); };
  const titre = new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const cal = el('div', { class: 'cal' }, ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(j => el('div', { class: 'jsem' }, j)),
    calendrier(a, m, etat.seances, auj).flat().map(c => el('div', {
      class: `case ${c.etat}`, style: c.etat === 'fait' ? { background: ZONES[c.zone]?.couleur || ZONES.abdos.couleur } : null,
      title: c.etat === 'joker' ? 'Joker de la semaine' : ZONES[c.zone]?.nom || '',
    }, String(Number(c.jour.slice(8))))));

  const vueSuivi = $('vue-suivi');
  vueSuivi.replaceChildren(
    el('div', { class: 'carte' }, el('div', { class: 'chiffres' },
      el('div', {}, el('strong', {}, String(s.soirs)), el('span', {}, 'soirs d’affilée')),
      el('div', {}, el('strong', {}, String(etat.seances.length)), el('span', {}, 'séances en tout')),
      el('div', {}, el('strong', {}, s.jokerDispo ? '1' : '0'), el('span', {}, 'joker cette semaine')))),
    el('div', { class: 'carte' },
      el('div', { class: 'mois-tete' },
        el('button', { type: 'button', 'aria-label': 'Mois précédent', disabled: cle <= premierMois, onclick: () => changerMois(-1) }, '‹'),
        el('h3', {}, titre[0].toUpperCase() + titre.slice(1)),
        el('button', { type: 'button', 'aria-label': 'Mois suivant', disabled: cle >= auj.slice(0, 7), onclick: () => changerMois(1) }, '›')),
      cal,
      el('div', { class: 'legende' }, CYCLE.map(z => el('span', {}, el('i', { style: { background: ZONES[z].couleur } }), ZONES[z].court)),
        el('span', {}, el('i', { style: { background: '#FFF1C9' } }), 'Joker'))),
    el('div', { class: 'carte courbe' }, el('h3', {}, 'Ta progression'), dessinerCourbe()),
    el('div', { class: 'carte niveaux' }, el('h3', {}, 'Où tu en es'), [['haut', 'Haut du corps'], ['bas', 'Bas du corps'], ['abdos', 'Abdos']].map(([g, titre]) => [
      el('h4', {}, el('span', { class: 'pastille', style: { background: ZONES[g].couleur, width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' } }), titre),
      Object.keys(FAMILLES).filter(id => FAMILLES[id].zone === g).map(id => ligneNiveau(id, g)),
    ])),
  );
}

function ligneNiveau(id, zone) {
  const f = FAMILLES[id];
  const n = niveauDe(etat.niveaux, id);
  const p = position(n);
  const crans = [];
  for (let i = 0; i < f.variantes.length * CRANS_PAR_VARIANTE; i++) {
    crans.push(el('span', { class: `${i <= p ? 'plein' : ''} ${i % CRANS_PAR_VARIANTE === 0 && i ? 'debut-var' : ''}` }));
  }
  return el('div', { class: 'niveau' },
    el('div', { class: 'niveau-ligne' }, el('span', {}, f.variantes[n.v]), el('strong', {}, `${n.s} s`)),
    el('div', { class: 'echelle', style: { '--z': ZONES[zone].couleur }, title: `Variante ${n.v + 1} sur ${f.variantes.length}` }, crans));
}

function dessinerCourbe() {
  const points = courbe(etat.seances);
  if (points.length < 2) return el('p', { class: 'doux' }, 'La courbe apparaît après deux soirs : elle suit ton niveau, exercice par exercice, additionné.');
  const L = 320, H = 150, g = 30, d = 8, h = 10, b = 24;
  const ys = points.map(p => p.niveau);
  const min = Math.min(...ys) - 1;
  const max = Math.max(...ys) + 1;
  const x = i => g + (i * (L - g - d)) / (points.length - 1);
  const y = v => h + ((max - v) * (H - h - b)) / (max - min);
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, texte) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (texte) n.textContent = texte; return n; };
  const svg = s('svg', { viewBox: `0 0 ${L} ${H}`, role: 'img', 'aria-label': `Niveau de ${ys[0]} à ${ys.at(-1)}` });
  svg.append(
    s('line', { x1: g, y1: H - b, x2: L - d, y2: H - b, class: 'axe' }),
    s('text', { x: g - 6, y: y(Math.max(...ys)) + 4, 'text-anchor': 'end' }, String(Math.max(...ys))),
    s('text', { x: g - 6, y: y(Math.min(...ys)) + 4, 'text-anchor': 'end' }, String(Math.min(...ys))),
    s('path', { d: 'M' + points.map((p, i) => `${x(i).toFixed(1)} ${y(p.niveau).toFixed(1)}`).join(' L'), class: 'trait' }),
  );
  const date = j => new Date(`${j}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  svg.append(s('text', { x: g, y: H - 6 }, date(points[0].jour)), s('text', { x: L - d, y: H - 6, 'text-anchor': 'end' }, date(points.at(-1).jour)));
  const dernier = points.at(-1);
  svg.append(s('circle', { cx: x(points.length - 1), cy: y(dernier.niveau), r: 4.5, fill: ZONES[zoneDuSoir(etat.seances)].couleur }));
  return el('div', {}, svg, el('p', { class: 'doux petit' }, 'Un cran = 5 s d’effort de plus sur un exercice, ou une variante plus dure.'));
}

// ── Réglages ─────────────────────────────────────────────────────────────────

function rendreReglages() {
  rendreSerie();
  const interrupteur = (cle, libelle, aide) => el('label', { class: 'reglage' },
    el('div', {}, el('strong', {}, libelle), aide ? el('div', { class: 'doux petit' }, aide) : null),
    el('input', {
      type: 'checkbox', class: 'interrupteur', checked: reglages[cle],
      onchange: ev => { reglages[cle] = ev.target.checked; ecrire(CLE_REGLAGES, reglages); voix.regler(reglages); },
    }));
  const fichier = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importer });
  $('vue-reglages').replaceChildren(
    el('div', { class: 'carte' }, el('h3', {}, 'Guidage'),
      interrupteur('voix', 'Voix', 'Annonce les exercices, les repos et la mi-temps.'),
      interrupteur('bips', 'Bips', 'Les 3 dernières secondes et le départ de chaque effort.'),
      el('div', { class: 'rangee' }, el('button', {
        type: 'button', class: 'petit-bouton',
        onclick: () => { voix.deverrouiller(); voix.bip('long'); voix.parler('Pompes sur les genoux. C’est parti !'); },
      }, '🔊 Essayer'))),
    el('div', { class: 'carte' }, el('h3', {}, 'Sauvegarde'),
      el('p', { class: 'doux petit' }, 'Tes séances restent sur ce téléphone, rien n’est envoyé. Exporte-les de temps en temps : vider le cache du navigateur les effacerait.'),
      el('div', { class: 'rangee' },
        el('button', { type: 'button', class: 'petit-bouton', onclick: exporter }, '⬇️ Exporter'),
        el('button', { type: 'button', class: 'petit-bouton', onclick: () => fichier.click() }, '⬆️ Importer'), fichier)),
    el('p', { class: 'doux petit', style: { textAlign: 'center' } }, 'Renfo du soir · au poids du corps, tous les soirs'),
  );
}

function exporter() {
  const blob = new Blob([JSON.stringify(etat, null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `renfo-du-soir-${aujourdhui()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importer(ev) {
  const f = ev.target.files?.[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const nouvel = valider(JSON.parse(await f.text()));
    if (!confirm(`Remplacer tes données par cette sauvegarde (${pluriel(nouvel.seances.length, 'séance')}) ?`)) return;
    etat = nouvel;
    sauver();
    toast('Sauvegarde importée');
    rendreReglages();
  } catch (e) {
    toast(e instanceof SyntaxError ? 'Fichier illisible' : e.message);
  }
}

// ── Démarrage ────────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker :', e));
}
montrer('soir');
