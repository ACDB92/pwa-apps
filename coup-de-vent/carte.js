// La carte : côte de la France en SVG, spots, et un champ de vent animé dessiné dans un canvas.
// Toucher un spot zoome dessus et y dessine l'orientation de la plage : d'où le vent doit venir.
// Le mouvement porte la donnée : chaque particule suit le vent prévu à l'heure choisie, interpolé
// entre les spots (pondération inverse du carré de la distance). Sa vitesse suit la force du vent,
// sa couleur aussi. Avec « réduire les animations », le champ devient une grille de flèches fixes.

import { COTE } from './cote.js';

const BORNES = { ouest: -5.6, est: 9.9, sud: 41.1, nord: 51.4 };
const COS = Math.cos(46.5 * Math.PI / 180);
const NS = 'http://www.w3.org/2000/svg';

export function projeter(lon, lat) {
  return [(lon - BORNES.ouest) * COS * 100, (BORNES.nord - lat) * 100];
}
const LARGEUR = (BORNES.est - BORNES.ouest) * COS * 100;
const HAUTEUR = (BORNES.nord - BORNES.sud) * 100;

const FRANCE = { x: 0, y: 0, w: LARGEUR, h: HAUTEUR };

function chemin(points) {
  return points.map(([lon, lat], i) => (i ? 'L' : 'M') + projeter(lon, lat).map(v => v.toFixed(1)).join(' ')).join('') + 'Z';
}

// Couleur d'un vent, du calme au très fort — la même échelle sur la carte et dans les fiches.
// `fonce` : sur fond clair, les mêmes teintes assombries, sinon les traînées pâles disparaissent.
export function couleurVent(kn, alpha = 1, fonce = false) {
  const pal = [[0, [120, 160, 200]], [10, [90, 190, 230]], [16, [46, 230, 197]], [24, [160, 240, 120]], [30, [255, 196, 87]], [38, [255, 110, 90]]];
  let a = pal[0], b = pal[pal.length - 1];
  for (let i = 0; i < pal.length - 1; i++) if (kn >= pal[i][0] && kn <= pal[i + 1][0]) { a = pal[i]; b = pal[i + 1]; break; }
  if (kn > pal[pal.length - 1][0]) a = b;
  const t = b[0] === a[0] ? 0 : (kn - a[0]) / (b[0] - a[0]);
  const c = a[1].map((v, k) => Math.round((v + (b[1][k] - v) * t) * (fonce ? 0.62 : 1)));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export class Carte {
  constructor(conteneur, { surSpot }) {
    this.conteneur = conteneur;
    this.surSpot = surSpot;
    this.vents = [];          // [{ x, y, u, v, kn }] en coordonnées carte, vecteur = sens où va l'air
    this.spots = [];
    this.calmes = matchMedia('(prefers-reduced-motion: reduce)');

    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${LARGEUR.toFixed(0)} ${HAUTEUR.toFixed(0)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.classList.add('carte-svg');
    this.svg.innerHTML = `
      <defs>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity=".55"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </radialGradient>
        <filter id="lueur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="f"/><feMerge><feMergeNode in="f"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g class="terre">
        <path class="contour-lueur" d="${COTE.map(chemin).join(' ')}"/>
        <path class="contour" d="${COTE.map(chemin).join(' ')}"/>
      </g>
      <g class="itineraire"></g>
      <g class="lieux"></g>
      <g class="rose"></g>
      <g class="spots"></g>`;
    this.groupeSpots = this.svg.querySelector('.spots');
    this.groupeRose = this.svg.querySelector('.rose');
    this.vue = { ...FRANCE };

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'carte-vent';
    this.ctx = this.canvas.getContext('2d');
    conteneur.append(this.canvas, this.svg);

    this.particules = [];
    new ResizeObserver(() => this.redimensionner()).observe(conteneur);
    this.calmes.addEventListener?.('change', () => this.relancer());
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.relancer());
    document.addEventListener('visibilitychange', () => this.relancer());
    this.redimensionner();
  }

  // Le SVG est en « meet » : on recalcule où tombe la carte dans le conteneur pour caler le canvas.
  redimensionner() {
    const r = this.conteneur.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.taille = { l: r.width, h: r.height, dpr };
    this.appliquerVue();
    const n = Math.round(Math.min(1600, (r.width * r.height) / 520));
    this.particules = Array.from({ length: n }, () => this.naitre({}, true));
    this.relancer();
  }

  // La vue est un rectangle en coordonnées carte ; le SVG est en « meet » : on recalcule où il tombe
  // dans le conteneur pour caler le canvas, et l'échelle qui garde spots et rose en pixels d'écran.
  appliquerVue() {
    if (!this.taille) return;
    const { l, h, dpr } = this.taille, v = this.vue;
    this.svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    const echelle = Math.min(l / v.w, h / v.h);
    this.cadre = {
      echelle: echelle * dpr,
      dx: ((l - v.w * echelle) / 2 - v.x * echelle) * dpr,
      dy: ((h - v.h * echelle) / 2 - v.y * echelle) * dpr,
      l: this.canvas.width, h: this.canvas.height, dpr
    };
    this.k = 1 / echelle;
    this.groupeSpots.querySelectorAll('.spot').forEach(n => n.setAttribute('transform', `translate(${n.dataset.xy}) scale(${this.k})`));
    this.svg.querySelectorAll('.lieu').forEach(n => n.setAttribute('transform', `translate(${n.dataset.xy}) scale(${this.k})`));
    if (this.groupeRose.dataset.xy) this.groupeRose.setAttribute('transform', `translate(${this.groupeRose.dataset.xy}) scale(${this.k})`);
  }

  // Zoome sur une liste de points [{ lon, lat }] (le spot, sa gare…), avec une marge ; `null` revient
  // à la France entière. Animé, sauf si le téléphone demande moins de mouvement.
  zoomer(points, margeKm = 18) {
    let cible = { ...FRANCE };
    if (points?.length) {
      const xy = points.map(p => projeter(p.lon, p.lat));
      const m = margeKm / 111 * 100;
      const x0 = Math.min(...xy.map(p => p[0])) - m, x1 = Math.max(...xy.map(p => p[0])) + m;
      const y0 = Math.min(...xy.map(p => p[1])) - m, y1 = Math.max(...xy.map(p => p[1])) + m;
      cible = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    this.zoome = Boolean(points?.length);
    cancelAnimationFrame(this.animZoom);
    const depart = { ...this.vue }, t0 = performance.now(), duree = this.calmes.matches ? 0 : 750;
    const pas = t => {
      const k = duree ? Math.min(1, (t - t0) / duree) : 1;
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      // Interpolation en logarithme de la taille : le zoom paraît régulier, pas brutal à la fin.
      const w = Math.exp(Math.log(depart.w) + (Math.log(cible.w) - Math.log(depart.w)) * e);
      const h = Math.exp(Math.log(depart.h) + (Math.log(cible.h) - Math.log(depart.h)) * e);
      const cx = depart.x + depart.w / 2 + ((cible.x + cible.w / 2) - (depart.x + depart.w / 2)) * e;
      const cy = depart.y + depart.h / 2 + ((cible.y + cible.h / 2) - (depart.y + depart.h / 2)) * e;
      this.vue = { x: cx - w / 2, y: cy - h / 2, w, h };
      this.appliquerVue();
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (k < 1) this.animZoom = requestAnimationFrame(pas);
      else { if (this.derniersSpots) this.poserSpots(this.derniersSpots); if (this.calmes.matches) this.dessinerFige(); }
    };
    this.animZoom = requestAnimationFrame(pas);
  }

  // L'orientation d'un spot, dessinée sur lui : en vert les directions d'où le vent peut venir,
  // en rouge celles qui l'éloignent du bord (side-off, offshore), et la flèche du vent prévu.
  poserOrientation(spot, vent) {
    const g = this.groupeRose;
    if (!spot) { g.innerHTML = ''; delete g.dataset.xy; return; }
    const [x, y] = projeter(spot.lon, spot.lat);
    g.dataset.xy = `${x.toFixed(2)} ${y.toFixed(2)}`;
    g.setAttribute('transform', `translate(${g.dataset.xy}) scale(${this.k ?? 1})`);
    const R = 74;
    const pt = (cap, r) => [Math.sin(cap * Math.PI / 180) * r, -Math.cos(cap * Math.PI / 180) * r];
    const secteur = (de, a, cls) => {
      const ouverture = ((a - de) % 360 + 360) % 360 || 360;
      if (ouverture >= 359.9) return `<circle r="${R}" class="${cls}"/>`;
      const [x1, y1] = pt(de, R), [x2, y2] = pt(a, R);
      return `<path class="${cls}" d="M0 0 L${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${ouverture > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z"/>`;
    };
    let html = `<circle r="${R}" class="rose-non"/>`;
    if (spot.secteurs) html += spot.secteurs.map(([de, a]) => secteur(de, a, 'rose-ok')).join('');
    else {
      html += secteur(spot.face - 100, spot.face + 100, 'rose-ok');
      const [lx, ly] = pt(spot.face, R + 14);
      html += `<line class="rose-large" x1="0" y1="0" x2="${(lx * 0.86).toFixed(1)}" y2="${(ly * 0.86).toFixed(1)}"/>
        <text class="rose-lib" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}">large</text>`;
    }
    if (vent?.dir != null) {
      // Le vent vient de `dir` : la flèche part de ce côté et pointe vers le spot.
      const [ax, ay] = pt(vent.dir, R + 6), [bx, by] = pt(vent.dir, 16);
      html += `<line class="rose-vent" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${couleurVent(vent.kn ?? 0, 1, this.clair)}"/>
        <path class="rose-pointe" fill="${couleurVent(vent.kn ?? 0, 1, this.clair)}" transform="translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${vent.dir + 180})" d="M0 6 L-6 -6 L6 -6 Z"/>`;
    }
    g.innerHTML = html;
  }

  // Les lieux du trajet sur la carte zoomée : gare, aéroport, ville de départ — [{ lon, lat, nom, type }].
  // Un trait pointillé relie chacun au spot : c'est le dernier kilomètre.
  poserLieux(spot, lieux) {
    const g = this.svg.querySelector('.lieux');
    if (!spot || !lieux?.length) { g.innerHTML = ''; return; }
    const [sx, sy] = projeter(spot.lon, spot.lat);
    g.innerHTML = lieux.map(l => {
      const [x, y] = projeter(l.lon, l.lat);
      // La ville de départ a déjà son tracé routier : pas de pointillé par-dessus.
      return `${l.type === 'ville' ? '' : `<line class="liaison" x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${sx.toFixed(2)}" y2="${sy.toFixed(2)}"/>`}
        <g class="lieu ${l.type}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${this.k ?? 1})" data-xy="${x.toFixed(2)} ${y.toFixed(2)}">
          <rect x="-7" y="-7" width="14" height="14" rx="4"/><text y="-12">${l.nom.replace(/[<&]/g, '')}</text></g>`;
    }).join('');
  }

  // L'itinéraire en voiture, [[lon, lat], …], ou rien.
  poserItineraire(points) {
    const g = this.svg.querySelector('.itineraire');
    g.innerHTML = points?.length > 1
      ? `<path class="trace" d="${points.map(([lon, lat], i) => (i ? 'L' : 'M') + projeter(lon, lat).map(v => v.toFixed(2)).join(' ')).join('')}"/>`
      : '';
  }

  naitre(p, ageAleatoire = false) {
    p.x = Math.random() * this.canvas.width;
    p.y = Math.random() * this.canvas.height;
    p.age = ageAleatoire ? Math.random() * 80 : 0;
    p.vie = 50 + Math.random() * 60;
    return p;
  }

  // vents : [{ lon, lat, kn, dir }] — dir est d'où vient le vent, comme en météo.
  poserVents(vents) {
    this.vents = vents.filter(v => v.kn != null && v.dir != null).map(v => {
      const [x, y] = projeter(v.lon, v.lat);
      const va = (v.dir + 180) * Math.PI / 180;  // sens où va l'air
      return { x, y, u: Math.sin(va) * v.kn, v: -Math.cos(va) * v.kn, kn: v.kn };
    });
    if (this.calmes.matches) this.dessinerFige();
  }

  // Vent au point (x, y) de la carte : moyenne pondérée par 1/d², donc très proche d'un spot, c'est
  // le vent du spot.
  ventEn(x, y) {
    let su = 0, sv = 0, sk = 0, sp = 0;
    for (const w of this.vents) {
      const d2 = (w.x - x) ** 2 + (w.y - y) ** 2 + 400;
      const p = 1 / d2;
      su += w.u * p; sv += w.v * p; sk += w.kn * p; sp += p;
    }
    return sp ? { u: su / sp, v: sv / sp, kn: sk / sp } : { u: 0, v: 0, kn: 0 };
  }

  versCarte(px, py) {
    const c = this.cadre;
    return [(px - c.dx) / c.echelle, (py - c.dy) / c.echelle];
  }

  relancer() {
    cancelAnimationFrame(this.boucle);
    if (!this.cadre) return;
    this.clair = getComputedStyle(document.documentElement).getPropertyValue('--mode').trim() === 'clair';
    this.ctx.clearRect(0, 0, this.cadre.l, this.cadre.h);
    if (this.calmes.matches || document.hidden) { this.dessinerFige(); return; }
    const pas = () => { this.anime(); this.boucle = requestAnimationFrame(pas); };
    this.boucle = requestAnimationFrame(pas);
  }

  anime() {
    const { ctx } = this;
    const c = this.cadre;
    // Les traînées s'effacent doucement au lieu d'être repeintes : c'est ce qui donne le fil du vent.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.055)';
    ctx.fillRect(0, 0, c.l, c.h);
    ctx.globalCompositeOperation = 'source-over';
    if (!this.vents.length) return;
    ctx.lineWidth = 1.3 * c.dpr;
    ctx.lineCap = 'round';
    const vitesse = 0.045 * c.dpr;
    for (const p of this.particules) {
      const [mx, my] = this.versCarte(p.x, p.y);
      const w = this.ventEn(mx, my);
      const nx = p.x + w.u * vitesse * 2.4, ny = p.y + w.v * vitesse * 2.4;
      ctx.strokeStyle = couleurVent(w.kn, Math.min(0.9, 0.25 + w.kn / 40), this.clair);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      p.x = nx; p.y = ny; p.age++;
      if (p.age > p.vie || nx < 0 || ny < 0 || nx > c.l || ny > c.h) this.naitre(p);
    }
  }

  // Sans animation : une grille de flèches, même échelle de couleur.
  dessinerFige() {
    const { ctx } = this;
    const c = this.cadre;
    if (!c) return;
    ctx.clearRect(0, 0, c.l, c.h);
    if (!this.vents.length) return;
    const pas = 46 * c.dpr;
    for (let y = pas / 2; y < c.h; y += pas) {
      for (let x = pas / 2; x < c.l; x += pas) {
        const [mx, my] = this.versCarte(x, y);
        const w = this.ventEn(mx, my);
        const n = Math.hypot(w.u, w.v) || 1;
        const lg = (8 + Math.min(14, w.kn / 2)) * c.dpr;
        const ux = w.u / n * lg, uy = w.v / n * lg;
        ctx.strokeStyle = couleurVent(w.kn, 0.6, this.clair);
        ctx.lineWidth = 1.5 * c.dpr;
        ctx.beginPath();
        ctx.moveTo(x - ux / 2, y - uy / 2);
        ctx.lineTo(x + ux / 2, y + uy / 2);
        const a = Math.atan2(uy, ux);
        ctx.lineTo(x + ux / 2 - Math.cos(a - 0.5) * 5 * c.dpr, y + uy / 2 - Math.sin(a - 0.5) * 5 * c.dpr);
        ctx.stroke();
      }
    }
  }

  // spots : [{ id, nom, lon, lat, etat: 'top' | 'ok' | 'ecarte', rang, kn, dir, choisi }]
  poserSpots(spots) {
    this.derniersSpots = spots;
    const g = this.groupeSpots;
    const existants = new Map([...g.children].map(n => [n.dataset.id, n]));
    spots.forEach(s => {
      const [x, y] = projeter(s.lon, s.lat);
      let n = existants.get(s.id);
      if (!n) {
        n = document.createElementNS(NS, 'g');
        n.dataset.id = s.id;
        n.classList.add('spot');
        n.innerHTML = `<circle class="halo" r="26" fill="url(#halo)"/><circle class="pouls" r="7"/>
          <g class="fleche"><path d="M0 -14 L4 -7.5 L-4 -7.5 Z"/></g><circle class="point" r="6"/>
          <text class="nom" y="-17"></text><text class="rang" y="3.5"></text>`;
        n.addEventListener('click', () => this.surSpot(s.id));
        g.append(n);
      }
      existants.delete(s.id);
      n.dataset.xy = `${x.toFixed(1)} ${y.toFixed(1)}`;
      n.setAttribute('transform', `translate(${n.dataset.xy}) scale(${this.k ?? 1})`);
      n.setAttribute('class', `spot ${s.etat}${s.choisi ? ' choisi' : ''}`);
      n.style.setProperty('--c', couleurVent(s.kn ?? 0));
      n.querySelector('.fleche').style.transform = `rotate(${(s.dir ?? 0) + 180}deg)`;
      n.querySelector('.fleche').style.opacity = s.dir == null ? 0 : 1;
      n.querySelector('.nom').textContent = '';
      n.querySelector('.rang').textContent = s.rang && s.rang <= 9 ? s.rang : '';
    });
    existants.forEach(n => n.remove());

    // Les noms : le spot choisi d'abord, puis par rang. Un nom qui tomberait à moins de 40 px d'un
    // nom déjà posé est omis — sur la Côte d'Opale, cinq spots tiennent dans un centimètre.
    const poses = [];
    const ecart = 40 * (this.k ?? 1);
    spots.filter(s => this.zoome || s.etat === 'top' || s.choisi)
      .sort((a, b) => (b.choisi - a.choisi) || ((a.rang ?? 99) - (b.rang ?? 99)))
      .forEach(s => {
        const [x, y] = projeter(s.lon, s.lat);
        if (poses.some(([px, py]) => Math.hypot(px - x, py - y) < ecart)) return;
        poses.push([x, y]);
        g.querySelector(`[data-id="${CSS.escape(s.id)}"] .nom`).textContent = s.nom;
      });
  }
}
