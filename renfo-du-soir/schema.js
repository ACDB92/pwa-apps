// Renfo du soir — les schémas : une silhouette en traits, calculée à partir des angles d'une pose
// (exercices.js). Les longueurs des membres sont fixes : le mouvement entre deux poses se fait en
// interpolant les angles, donc les membres ne s'étirent jamais.
//
// En plus de la silhouette : le dos en deux segments (courbe), les muscles qui travaillent teintés
// (`cible`), et une flèche qui montre le trajet du point qui bouge le plus entre les deux poses.

const L = { tronc: 38, cou: 6, tete: 7.5, bras: 20, avbras: 19, cuisse: 26, tibia: 25, pied: 7 };
export const SOL = 120;
const LARGEUR = 200;
const HAUTEUR = 128;
const TEINTE = '#FFB627';

const rad = a => (a * Math.PI) / 180;
const vers = (p, angle, long) => [p[0] + long * Math.cos(rad(angle)), p[1] + long * Math.sin(rad(angle))];

/** Les articulations d'une pose, bassin à l'origine (fonction pure). */
export function articulations(pose) {
  const h = [0, 0];
  const dos = pose.dos || 0;
  const milieu = vers(h, pose.t - dos / 2, L.tronc / 2);
  const e = vers(milieu, pose.t + dos / 2, L.tronc / 2);
  const dirTete = pose.t + dos / 2 + (pose.tete || 0);
  const centreTete = vers(e, dirTete, L.cou + L.tete);
  const membres = [0, 1].map(i => {
    const coude = vers(e, pose.b[i], L.bras);
    const main = vers(coude, pose.ab[i], L.avbras);
    const genou = vers(h, pose.c[i], L.cuisse);
    const cheville = vers(genou, pose.tb[i], L.tibia);
    const p = pose.p ? pose.p[i] : pose.tb[i] - 90;
    const orteils = vers(cheville, p, L.pied);
    return { coude, main, genou, cheville, orteils };
  });
  return { hanche: h, milieu, epaule: e, centreTete, membres };
}

const normal360 = a => ((a % 360) + 360) % 360;

/**
 * Les angles articulaires d'une pose vue de profil, tournée vers la droite (fonction pure) :
 *   genou : flexion, 0 = jambe tendue, positif = plié vers l'arrière (négatif = genou à l'envers)
 *   hanche : angle tronc-cuisse, 180 = debout ; moins = cuisse vers la poitrine, plus = cuisse en arrière
 */
export function angles(pose) {
  const bas = pose.t - (pose.dos || 0) / 2;
  return [0, 1].map(i => ({
    genou: ecart(pose.c[i], pose.tb[i]),
    hanche: normal360(pose.c[i] - bas),
  }));
}

/**
 * Pose calée : point le plus bas au sol (ou centrée en hauteur pour une vue de dessus), point d'ancre
 * à l'abscisse `x`.
 */
export function caler(pose, ancre, x, vue) {
  const a = articulations(pose);
  const points = [a.hanche, a.milieu, a.epaule, [a.centreTete[0], a.centreTete[1] + L.tete], [a.centreTete[0], a.centreTete[1] - L.tete],
    ...a.membres.flatMap(m => [m.coude, m.main, m.genou, m.cheville, m.orteils])];
  const ys = points.map(p => p[1]);
  const ref = { main: a.membres[0].main, hanche: a.hanche, epaule: a.epaule }[ancre] || a.membres[0].cheville;
  const dx = x - ref[0];
  const dy = vue === 'dessus' ? HAUTEUR / 2 - (Math.max(...ys) + Math.min(...ys)) / 2 : SOL - Math.max(...ys);
  const bouge = p => [p[0] + dx, p[1] + dy];
  return {
    hanche: bouge(a.hanche), milieu: bouge(a.milieu), epaule: bouge(a.epaule), centreTete: bouge(a.centreTete),
    membres: a.membres.map(m => Object.fromEntries(Object.entries(m).map(([k, p]) => [k, bouge(p)]))),
    xs: points.map(p => p[0] + dx),
  };
}

/** L'écart d'angle le plus court de `x` à `y`, entre -180 et 180. */
export function ecart(x, y) {
  return ((((y - x) % 360) + 540) % 360) - 180;
}

/**
 * Interpolation de deux poses (angles), `k` de 0 à 1. Chaque angle tourne par le chemin le plus
 * court : passer de 180° à -172° fait 8°, pas un tour presque complet par l'avant du corps (le bug
 * du superman et du bird dog, signalé après la première séance du 20/11).
 */
export function melanger(a, b, k) {
  const m = (x, y) => x + ecart(x, y) * k;
  const paire = cle => [0, 1].map(i => m(a[cle][i], b[cle][i]));
  const res = {
    t: m(a.t, b.t), dos: m(a.dos || 0, b.dos || 0), tete: m(a.tete || 0, b.tete || 0),
    b: paire('b'), ab: paire('ab'), c: paire('c'), tb: paire('tb'),
  };
  if (a.p || b.p) {
    const pa = a.p || a.tb.map(v => v - 90);
    const pb = b.p || b.tb.map(v => v - 90);
    res.p = [0, 1].map(i => m(pa[i], pb[i]));
  }
  return res;
}

/**
 * Le trajet à montrer : le point qui bouge le plus entre les deux poses (main, pied, genou, coude,
 * épaule, bassin), ou null si rien ne bouge assez pour mériter une flèche.
 */
export function trajet(def, x0) {
  if (def.poses.length < 2) return null;
  const [A, B] = def.poses.map(p => caler(p, def.ancre, x0, def.vue));
  const candidats = ['hanche', 'epaule', ...[0, 1].flatMap(i => ['main', 'cheville', 'genou', 'coude'].map(k => `${i}.${k}`))];
  const point = (c, cle) => (cle.includes('.') ? c.membres[cle[0]][cle.slice(2)] : c[cle]);
  let meilleur = null;
  for (const cle of candidats) {
    const a = point(A, cle);
    const b = point(B, cle);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!meilleur || d > meilleur.d) meilleur = { cle, a, b, d };
  }
  return meilleur.d >= 14 ? meilleur : null;
}

/** Abscisse d'ancre qui centre l'exercice entier (toutes ses poses) dans le cadre. */
function centrage(def) {
  const xs = def.poses.flatMap(p => caler(p, def.ancre, 0, def.vue).xs);
  return LARGEUR / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
}

const NS = 'http://www.w3.org/2000/svg';
const creer = (nom, attrs = {}) => {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const chemin = pts => 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');

/** La flèche du mouvement, décalée du corps, pointes aux deux bouts (aller-retour). */
function fleche(t, centre, couleur) {
  const [a, b] = [t.a, t.b];
  const ux = (b[0] - a[0]) / t.d;
  const uy = (b[1] - a[1]) / t.d;
  let nx = -uy;
  let ny = ux;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  if ((mx - centre[0]) * nx + (my - centre[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const dec = 9;
  const raccourci = Math.min(4, t.d / 4);
  const p1 = [a[0] + nx * dec + ux * raccourci, a[1] + ny * dec + uy * raccourci];
  const p2 = [b[0] + nx * dec - ux * raccourci, b[1] + ny * dec - uy * raccourci];
  const pointe = (p, sx, sy) => {
    const l = 6;
    const g = [p[0] - (sx * l) + (-sy * l * 0.6), p[1] - (sy * l) + (sx * l * 0.6)];
    const d = [p[0] - (sx * l) - (-sy * l * 0.6), p[1] - (sy * l) - (sx * l * 0.6)];
    return chemin([g, p, d]);
  };
  const g = creer('g', { class: 'fleche', stroke: couleur });
  g.append(
    creer('path', { d: chemin([p1, p2]), 'stroke-dasharray': '3 3' }),
    creer('path', { d: pointe(p2, ux, uy) }),
    creer('path', { d: pointe(p1, -ux, -uy) }),
  );
  return g;
}

/**
 * Dessine l'exercice dans `conteneur` et l'anime (va-et-vient entre ses poses).
 * Renvoie une fonction qui arrête l'animation.
 */
export function dessiner(conteneur, def, couleur, { anime = true, teinte = true, avecFleche = true } = {}) {
  const svg = creer('svg', { viewBox: `0 0 ${LARGEUR} ${HAUTEUR}`, class: 'schema', role: 'img', 'aria-label': def.nom || 'Schéma' });
  if (def.vue !== 'dessus') svg.append(creer('line', { x1: 8, y1: SOL + 2.5, x2: LARGEUR - 8, y2: SOL + 2.5, class: 'sol' }));
  const x0 = centrage(def);
  const deFace = def.vue === 'face' || def.vue === 'dessus';
  const cible = creer('g', { class: 'cible', stroke: TEINTE, fill: TEINTE });
  const loin = creer('path', { class: deFace ? 'membre' : 'membre loin', stroke: couleur });
  const corps = creer('path', { class: 'membre tronc', stroke: couleur });
  const cou = creer('path', { class: 'membre', stroke: couleur });
  const pres = creer('path', { class: 'membre', stroke: couleur });
  const tete = creer('circle', { r: L.tete, fill: couleur });
  if (avecFleche) {
    const t = trajet(def, x0);
    if (t) {
      const A = caler(def.poses[0], def.ancre, x0, def.vue);
      svg.append(fleche(t, [(A.hanche[0] + A.epaule[0]) / 2, (A.hanche[1] + A.epaule[1]) / 2], couleur));
    }
  }
  svg.append(cible, loin, cou, corps, tete, pres);
  conteneur.replaceChildren(svg);

  const peindre = pose => {
    const a = caler(pose, def.ancre, x0, def.vue);
    const traits = m => chemin([a.epaule, m.coude, m.main]) + ' ' + chemin([a.hanche, m.genou, m.cheville, m.orteils]);
    loin.setAttribute('d', traits(a.membres[1]));
    pres.setAttribute('d', traits(a.membres[0]));
    corps.setAttribute('d', chemin([a.hanche, a.milieu, a.epaule]));
    cou.setAttribute('d', chemin([a.epaule, a.centreTete]));
    tete.setAttribute('cx', a.centreTete[0].toFixed(1));
    tete.setAttribute('cy', a.centreTete[1].toFixed(1));
    if (teinte && def.cible) {
      const formes = [];
      for (const c of def.cible) {
        if (c === 'tronc') formes.push(creer('path', { d: chemin([a.hanche, a.milieu, a.epaule]) }));
        if (c === 'poitrine') formes.push(creer('path', { d: chemin([a.milieu, a.epaule]) }));
        if (c === 'bras') a.membres.forEach(m => formes.push(creer('path', { d: chemin([a.epaule, m.coude]) })));
        if (c === 'cuisse') a.membres.forEach(m => formes.push(creer('path', { d: chemin([a.hanche, m.genou]) })));
        if (c === 'fesse') formes.push(creer('circle', { cx: a.hanche[0], cy: a.hanche[1], r: 7.5 }));
        if (c === 'epaule') formes.push(creer('circle', { cx: a.epaule[0], cy: a.epaule[1], r: 7.5 }));
      }
      cible.replaceChildren(...formes);
    }
  };

  const [A, B] = def.poses;
  peindre(A);
  const reduit = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!B || !anime || reduit) return () => {};
  let arret = false;
  const cycle = 2600;
  const debut = performance.now();
  const image = maintenant => {
    if (arret || !svg.isConnected) return;
    const phase = ((maintenant - debut) % cycle) / cycle;               // 0 → 1
    const k = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);                 // aller-retour adouci
    peindre(melanger(A, B, k));
    requestAnimationFrame(image);
  };
  requestAnimationFrame(image);
  return () => { arret = true; };
}
