// Affichage de L'IA du jour. Les données viennent de textes publiés par d'autres sur Internet :
// tout est inséré en texte (textContent), jamais en HTML, et un lien n'est affiché que s'il est en http(s).
import {
  USAGES, dateFr, aParis, fraicheur, chercher, lienSur, minutesDeLecture, normaliser,
  voisins, lireAncre, ancre, compter, resumeCompteur, THEMES, lierTermes, estSemaine,
} from './lecture.js';

const $ = id => document.getElementById(id);
const etat = { index: null, mois: new Map(), toutCharge: false, affiche: null, q: '', pour: '', usage: '' };
const CLE_COMPTEUR = 'ia-du-jour:compteur';

// Pictogrammes en trait fin, de la couleur de l'étiquette (dessinés à la main, 24 × 24).
const PICTOS = {
  'data-bi': 'M4 20h16M7 17v-5M12 17V7M17 17v-8',
  entretien: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 9.5h8M8 12.5h5',
  outil: 'M14.7 6.3a4 4 0 0 0-5.2 5.2L4.3 16.7a1.4 1.4 0 0 0 0 2l1 1a1.4 1.4 0 0 0 2 0l5.2-5.2a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.3-.6-.6-2.3z',
  general: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h16M12 4c2.4 2.2 3.4 5 3.4 8s-1 5.8-3.4 8c-2.4-2.2-3.4-5-3.4-8s1-5.8 3.4-8z',
  quotidien: 'M4 11.5 12 5l8 6.5M6.5 10v9.5h11V10M10 19.5v-5h4v5',
  banque: 'M3.5 9 12 4.5 20.5 9zM5.5 9v8M9.8 9v8M14.2 9v8M18.5 9v8M3.5 20h17',
};

function picto(usage, classe = 'picto') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', PICTOS[usage] || PICTOS.general);
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) p.setAttribute(k, v);
  svg.append(p);
  return svg;
}

function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else n.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null) n.append(e);
  return n;
}

/** Le texte, avec les mots cherchés surlignés (nœuds <mark>, jamais de HTML injecté). */
function surligne(texte, mots) {
  if (!mots.length) return [texte];
  const norm = normaliser(texte);   // même longueur que le texte : NFD retire seulement les accents combinants
  if (norm.length !== texte.length) return [texte];
  const morceaux = [];
  let i = 0;
  while (i < texte.length) {
    let prochain = -1, long = 0;
    for (const m of mots) {
      const p = norm.indexOf(m, i);
      if (p !== -1 && (prochain === -1 || p < prochain)) { prochain = p; long = m.length; }
    }
    if (prochain === -1) { morceaux.push(texte.slice(i)); break; }
    if (prochain > i) morceaux.push(texte.slice(i, prochain));
    morceaux.push(el('mark', {}, texte.slice(prochain, prochain + long)));
    i = prochain + long;
  }
  return morceaux;
}

// ── Compteur local et petits retours ────────────────────────────────────────

function lireCompteur() {
  try { return JSON.parse(localStorage.getItem(CLE_COMPTEUR)); } catch { return null; }
}

function noter(evenement) {
  const c = compter(lireCompteur(), aParis(new Date()).jour, evenement);
  try { localStorage.setItem(CLE_COMPTEUR, JSON.stringify(c)); } catch { /* navigation privée : on ne compte pas */ }
  $('compteur').textContent = resumeCompteur(c);
}

let minuteur;
function toast(texte) {
  const t = $('toast');
  t.textContent = texte;
  t.hidden = false;
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { t.hidden = true; }, 2200);
}

async function partager(date, numero, sujet) {
  const url = new URL(ancre(date, numero), location.href).href;
  const donnees = { title: `L’IA du jour · ${sujet.titre}`, text: sujet.titre, url };
  try {
    if (navigator.share) { await navigator.share(donnees); return; }
    await navigator.clipboard.writeText(`${sujet.titre}\n${url}`);
    toast('Lien copié');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Partage impossible sur cet appareil');
  }
}

// ── Une carte de sujet ──────────────────────────────────────────────────────

/** Texte d'un sujet : mots cherchés surlignés (archive), ou termes du lexique du jour touchables (édition). */
function texte(contenu, mots, termes) {
  if (mots.length || !termes.length) return surligne(contenu, mots);
  return lierTermes(contenu, termes).map(m => {
    if (!m.terme) return m.texte;
    const b = el('button', { class: 'mot', type: 'button', title: 'Voir dans le lexique du jour' }, m.texte);
    b.addEventListener('click', () => ouvrirTerme(m.terme));
    return b;
  });
}

function carte(sujet, { date, numero = null, une = false, avecDate = false, mots = [], termes = [], semaine = false } = {}) {
  const u = USAGES[sujet.usage] || { libelle: sujet.usage };
  const pour = sujet.pour === 'Vous deux' ? 'vous deux' : sujet.pour;
  const lien = lienSur(sujet.lien);
  const couleur = `color:var(--u-${sujet.usage})`;
  const a = lien ? el('a', { class: 'lire', href: lien, target: '_blank', rel: 'noopener noreferrer' },
    `Lire l’article${sujet.source ? ' · ' + sujet.source : ''} →`) : null;
  a?.addEventListener('click', () => noter('article'));
  const bouton = el('button', { class: 'partager', type: 'button' }, 'Partager');
  bouton.addEventListener('click', () => partager(date, numero, sujet));
  return el('article', { class: `sujet${une ? ' une' : ''}`, id: numero ? `s-${date}-${numero}` : null },
    une ? el('div', { class: 'surtitre' }, semaine ? 'À la une de la semaine' : 'À la une') : null,
    el('div', { class: 'haut' },
      avecDate ? el('span', { class: 'quand' }, dateFr(date)) : null,
      sujet.repris_du ? el('span', { class: 'quand' }, `paru ${dateFr(sujet.repris_du)}`) : null,
      el('span', { style: couleur, class: 'etiquette-bloc' }, picto(sujet.usage)),
      el('span', { class: 'etiquette', style: couleur }, u.libelle),
      el('span', { class: 'pour' }, `pour ${pour}`)),
    el(une ? 'h2' : 'h3', {}, numero && !une ? el('span', { class: 'n' }, `${numero}. `) : null, surligne(sujet.titre, mots)),
    el('p', {}, texte(sujet.fait, mots, termes)),
    el('div', { class: 'concret' }, el('b', {}, 'Concrètement'), texte(sujet.concretement, mots, termes)),
    el('div', { class: 'actions' }, a, bouton));
}

// ── Données ─────────────────────────────────────────────────────────────────

async function lireJson(chemin) {
  const r = await fetch(chemin, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
  return r.json();
}

async function chargerMois(mois) {
  if (!etat.mois.has(mois)) etat.mois.set(mois, (await lireJson(`./editions/${mois}.json`)).editions || []);
  return etat.mois.get(mois);
}

async function toutesLesEditions() {
  if (!etat.toutCharge) {
    await Promise.all(etat.index.mois.map(chargerMois));
    etat.toutCharge = true;
  }
  return [...etat.mois.values()].flat();
}

async function edition(date) {
  return (await chargerMois(date.slice(0, 7))).find(e => e.date === date) || null;
}

// ── Lexique du jour ─────────────────────────────────────────────────────────

const CLE_LEXIQUE = 'ia-du-jour:lexique-ouvert';

function afficherLexique(ed) {
  const zone = $('lexique');
  const termes = ed.lexique || [];
  zone.hidden = !termes.length;
  if (!termes.length) return;
  $('termes').replaceChildren(...termes.map((t, i) => el('div', { class: 'terme', id: `t-${i}`, 'data-terme': t.terme },
    el('div', { class: 'theme' }, THEMES[t.theme] || t.theme),
    el('div', { class: 'nom' }, t.terme),
    el('p', {}, t.definition),
    el('p', { class: 'ex' }, el('b', {}, 'Exemple : '), t.exemple))));
  try { zone.open = localStorage.getItem(CLE_LEXIQUE) === '1'; } catch { zone.open = false; }
}

function ouvrirTerme(terme) {
  const zone = $('lexique');
  zone.open = true;
  const carteTerme = [...$('termes').children].find(c => c.dataset.terme === terme);
  if (!carteTerme) return;
  for (const c of $('termes').children) c.classList.remove('cible');
  carteTerme.classList.add('cible');
  carteTerme.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ── Vue Édition ─────────────────────────────────────────────────────────────

function afficherBandeau() {
  const b = $('bandeau');
  const f = fraicheur(etat.index.derniere, new Date());
  b.hidden = f === 'a-jour';
  b.className = `bandeau ${f}`;
  if (f === 'attendue') b.textContent = 'L’édition de ce matin arrive vers 7 h 30. En attendant, voici celle d’hier.';
  if (f === 'manquante') b.textContent = `Pas d’édition ce matin : la publication a peut-être échoué. Dernière parue : ${dateFr(etat.index.derniere)}.`;
}

async function afficherEdition(date, sujetCible = null) {
  let ed = await edition(date);
  if (!ed) { date = etat.index.derniere; ed = await edition(date); sujetCible = null; }
  etat.affiche = date;
  const n = ed.sujets.length;
  const semaine = estSemaine(ed);
  $('meta').replaceChildren(el('b', {}, semaine ? `La semaine en 5 · ${dateFr(date)}` : dateFr(date)),
    n ? `${n} sujet${n > 1 ? 's' : ''} · ${minutesDeLecture(ed)} min de lecture` : 'Rien de notable');
  afficherLexique(ed);
  const termes = (ed.lexique || []).map(t => t.terme);
  $('retour').hidden = date === etat.index.derniere;
  const { avant, apres } = voisins((await toutesLesEditions()).map(e => e.date), date);
  $('avant').disabled = !avant;
  $('apres').disabled = !apres;
  $('avant').dataset.date = avant || '';
  $('apres').dataset.date = apres || '';
  const cartes = ed.sujets.map((s, i) => carte(s, { date, numero: i + 1, une: i === 0, termes, semaine }));
  if (cartes.length > 1) cartes.splice(1, 0, el('div', { class: 'suite' }, semaine ? 'Aussi cette semaine' : 'Aussi ce jour-là'));
  $('sujets').replaceChildren(...(n ? cartes
    : [el('div', { class: 'vide' }, 'Rien de notable ce jour-là : aucune nouvelle ne valait vos trois minutes.')]));
  if (sujetCible) {
    const c = $(`s-${date}-${sujetCible}`);
    if (c) { c.classList.add('cible'); c.scrollIntoView({ block: 'start' }); }
  }
}

// ── Vue Archive ─────────────────────────────────────────────────────────────

function puces(conteneur, options, cle) {
  conteneur.replaceChildren(...options.map(([valeur, libelle, usage]) => {
    const b = el('button', { class: 'puce', type: 'button', 'aria-pressed': String(etat[cle] === valeur) },
      usage ? el('span', { style: `color:var(--u-${usage});display:inline-flex` }, picto(usage, '')) : null, libelle);
    b.addEventListener('click', () => { etat[cle] = etat[cle] === valeur ? '' : valeur; afficherArchive().catch(erreur); });
    return b;
  }));
}

async function afficherArchive() {
  puces($('puces-pour'), [['', 'Tout le monde'], ['Côme', 'Pour Côme'], ['Alix', 'Pour Alix']], 'pour');
  puces($('puces-usage'), [['', 'Toutes les étiquettes'], ...Object.entries(USAGES).map(([k, u]) => [k, u.libelle, k])], 'usage');
  const editions = await toutesLesEditions();
  const res = $('resultats');
  if (etat.q.trim() || etat.pour || etat.usage) {
    const trouves = chercher(editions, etat);
    const mots = normaliser(etat.q).split(/\s+/).filter(Boolean);
    $('compte').textContent = `${trouves.length} sujet${trouves.length > 1 ? 's' : ''} trouvé${trouves.length > 1 ? 's' : ''}`;
    const numero = (date, s) => editions.find(e => e.date === date).sujets.indexOf(s) + 1;
    res.replaceChildren(...(trouves.length
      ? trouves.map(t => carte(t.sujet, { date: t.date, numero: numero(t.date, t.sujet), avecDate: true, mots }))
      : [el('div', { class: 'vide' }, 'Aucun sujet ne correspond. Essayez un autre mot, ou retirez un filtre.')]));
    return;
  }
  const tri = [...editions].sort((a, b) => b.date.localeCompare(a.date));
  $('compte').textContent = `${tri.length} édition${tri.length > 1 ? 's' : ''}`;
  res.replaceChildren(...tri.map(e => {
    const titres = (estSemaine(e) ? 'La semaine en 5 — ' : '') + (e.sujets.length ? e.sujets.map(s => s.titre).join(' · ') : 'Rien de notable');
    const d = el('details', { class: 'jour' },
      el('summary', {}, el('span', { class: 'j' }, dateFr(e.date)), el('span', { class: 't' }, titres)));
    const contenu = el('div', { class: 'contenu' });
    d.append(contenu);
    d.addEventListener('toggle', () => {
      if (d.open && !contenu.childElementCount) {
        contenu.append(...(e.sujets.length ? e.sujets.map((s, i) => carte(s, { date: e.date, numero: i + 1 }))
          : [el('div', { class: 'vide' }, 'Rien de notable ce jour-là.')]));
      }
    });
    return d;
  }));
}

// ── Notifications de l'app (Web Push) ───────────────────────────────────────
// Pas de serveur pour recevoir les abonnements : chaque téléphone donne sa « clé » (l'abonnement),
// copiée une fois dans les réglages de la routine. La clé publique VAPID ci-dessous est publique ;
// sa jumelle privée vit dans l'environnement de la routine, jamais dans le dépôt.
const CLE_VAPID = 'BCQ4DD5DKNmSP8HGtor_1tMe7dhvU4wcw7DfqJYqrlgJY8Jia6mFS4rKnpKjMWIVz3JOwnBInhx0sMGzzeoG-bI';

function octets(b64url) {
  const b = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64url.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

const iPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installee = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

async function etatNotifications() {
  if (!('serviceWorker' in navigator) || !isSecureContext) return 'impossible';
  if (iPhone() && !installee()) return 'installer';
  if (!('PushManager' in window) || !('Notification' in window)) return 'impossible';
  if (Notification.permission === 'denied') return 'refusees';
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? 'actives' : 'proposer';
}

async function transmettre(personne) {
  const reg = await navigator.serviceWorker.ready;
  const abo = await reg.pushManager.getSubscription();
  if (!abo) return afficherNotifications();
  const texte = `PUSH_ABONNEMENT_${personne.toUpperCase()}=${JSON.stringify(abo.toJSON())}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Clé de notification — L’IA du jour', text: texte });
    else { await navigator.clipboard.writeText(texte); toast('Clé copiée'); }
  } catch (e) {
    if (e?.name !== 'AbortError') { await navigator.clipboard.writeText(texte).catch(() => {}); toast('Clé copiée'); }
  }
}

async function activer() {
  if (await Notification.requestPermission() !== 'granted') return afficherNotifications();
  const reg = await navigator.serviceWorker.ready;
  await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octets(CLE_VAPID) });
  await afficherNotifications(true);
}

function bouton(texte, action, classe = 'partager') {
  const b = el('button', { class: classe, type: 'button' }, texte);
  b.addEventListener('click', () => action().catch(e => { console.error(e); toast('Impossible sur cet appareil'); }));
  return b;
}

async function afficherNotifications(vientDActiver = false) {
  const zone = $('notifs');
  const e = await etatNotifications();
  zone.hidden = e === 'impossible';
  zone.className = 'notifs';
  if (e === 'installer') {
    zone.replaceChildren(el('h2', {}, '🔔 Une notification chaque matin'),
      el('p', {}, 'Sur iPhone, les notifications ne marchent que depuis l’écran d’accueil : touchez Partager, puis « Sur l’écran d’accueil », et ouvrez l’app depuis son icône.'));
  } else if (e === 'refusees') {
    zone.replaceChildren(el('p', {}, '🔕 Notifications refusées sur ce téléphone : les réactiver dans les réglages du téléphone, à « L’IA du jour ».'));
  } else if (e === 'proposer') {
    zone.replaceChildren(el('h2', {}, '🔔 Une notification chaque matin'),
      el('p', {}, 'Le titre de la une, dès que l’édition est en ligne. Aucune appli à installer.'),
      el('div', { class: 'boutons' }, bouton('Activer les notifications', activer, 'lire')));
  } else if (e === 'actives') {
    if (vientDActiver) {
      zone.replaceChildren(el('h2', {}, '🔔 Activées. Dernière étape'),
        el('p', {}, 'Envoyez la clé de ce téléphone à Côme, qui la colle une fois dans les réglages de la routine. À qui est ce téléphone ?'),
        el('div', { class: 'boutons' }, bouton('Téléphone de Côme', () => transmettre('Come'), 'lire'),
          bouton('Téléphone d’Alix', () => transmettre('Alix'), 'lire')));
    } else {
      zone.className = 'notifs discret';
      const lien = bouton('Renvoyer la clé', async () => afficherNotifications(true), 'lien');
      zone.replaceChildren(el('p', {}, '🔔 Notifications activées sur ce téléphone · ', lien));
    }
  }
}

// ── Navigation ──────────────────────────────────────────────────────────────

function montrer(vue) {
  const archive = vue === 'archive';
  $('onglet-edition').setAttribute('aria-selected', String(!archive));
  $('onglet-archive').setAttribute('aria-selected', String(archive));
  $('vue-edition').hidden = archive;
  $('vue-archive').hidden = !archive;
}

/** L'adresse dit ce qu'on regarde : « #archive », « #AAAA-MM-JJ », « #AAAA-MM-JJ/2 » (un sujet partagé). */
async function suivreAncre() {
  const a = lireAncre(location.hash);
  if (a?.vue === 'archive') { montrer('archive'); await afficherArchive(); return; }
  montrer('edition');
  await afficherEdition(a?.date || etat.index.derniere, a?.sujet || null);
}

/** Change l'adresse (le bouton retour du téléphone suit), puis affiche ce qu'elle désigne.
 *  `hash` vide = la dernière édition. */
function aller(hash) {
  if (hash && location.hash !== hash) { location.hash = hash; return; }   // hashchange prend le relais
  if (!hash && location.hash) history.pushState(null, '', location.pathname + location.search);
  suivreAncre().catch(erreur);
}

function erreur(e) {
  console.error(e);
  $('sujets').replaceChildren(el('div', { class: 'vide' }, 'Les éditions n’ont pas pu être chargées. Vérifiez la connexion, puis rechargez la page.'));
}

async function demarrer() {
  $('date-du-jour').textContent = dateFr(aParis(new Date()).jour);
  $('onglet-edition').addEventListener('click', () => aller(etat.affiche && etat.affiche !== etat.index.derniere ? `#${etat.affiche}` : ''));
  $('onglet-archive').addEventListener('click', () => aller('#archive'));
  $('avant').addEventListener('click', e => e.currentTarget.dataset.date && aller(`#${e.currentTarget.dataset.date}`));
  $('apres').addEventListener('click', e => e.currentTarget.dataset.date && aller(`#${e.currentTarget.dataset.date}`));
  $('retour').addEventListener('click', () => aller(''));
  let attente;
  $('recherche').addEventListener('input', ev => {
    clearTimeout(attente);
    attente = setTimeout(() => { etat.q = ev.target.value; afficherArchive().catch(erreur); }, 150);
  });
  window.addEventListener('hashchange', () => suivreAncre().catch(erreur));
  $('lexique').addEventListener('toggle', e => {
    try { localStorage.setItem(CLE_LEXIQUE, e.currentTarget.open ? '1' : '0'); } catch { /* navigation privée */ }
  });
  noter('ouverture');
  etat.index = await lireJson('./editions/index.json');
  afficherBandeau();
  await suivreAncre();
}

demarrer().catch(erreur);
if ('serviceWorker' in navigator && isSecureContext) {
  navigator.serviceWorker.register('./sw.js').then(() => afficherNotifications()).catch(console.error);
}
