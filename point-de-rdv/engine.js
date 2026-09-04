// Moteur du point de RDV : graphe du réseau, temps de trajet, classement des lieux.
// Module ES pur — aucun accès au DOM, aucune dépendance. Importé par index.html et par
// tests/engine.test.mjs (`node --test`).
//
// Le point clé du modèle : le coût d'une correspondance dépend de la ligne sur laquelle on
// arrive. Un Dijkstra sur les stations seules ne sait pas représenter ça, donc chaque station
// est dédoublée en un état par ligne desservante, plus un état « à pied dans la rue ».

export const WALK = '__walk';

// Constantes de temps. Le générateur (build/fetch_data.py) les recopie dans data.meta.model,
// qui fait autorité quand il est présent ; celles-ci ne servent que de repli.
export const DEFAULT_MODEL = {
  transferMin: 4.0,        // correspondance quai à quai, hors attente
  entryMin: 2.5,           // rue -> quai
  exitMin: 2.0,            // quai -> rue
  bigStationFactor: 1.8,   // les gares labyrinthes coûtent plus cher
  bigStations: ['chatelet', 'chatelet les halles', 'les halles', 'montparnasse bienvenue',
                'saint lazare', 'gare du nord', 'republique', 'gare de lyon'],
  walkKmh: 4.5,
  accessRadiusM: 900,      // rayon de rabattement à pied depuis une adresse
  defaultHeadway: 5.0
};

// Somme entrée + sortie > correspondance directe : sans ça, ressortir dans la rue pour
// changer de ligne dans la même station deviendrait le chemin le moins cher, ce qui est faux.

export function normalise(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’\-–]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function haversineM(lat1, lon1, lat2, lon2) {
  const r = 6371000, rad = Math.PI / 180;
  const p1 = lat1 * rad, p2 = lat2 * rad;
  const dp = p2 - p1, dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function walkMinutes(meters, model = DEFAULT_MODEL) {
  return (meters / 1000) / model.walkKmh * 60;
}

// --------------------------------------------------------------------------------------
// Construction du graphe
// --------------------------------------------------------------------------------------

export function buildGraph(data) {
  const model = Object.assign({}, DEFAULT_MODEL, (data.meta && data.meta.model) || {});
  const lines = new Map((data.lines || []).map(l => [l.id, l]));
  const nStations = data.stations.length;

  const states = [];                                   // { station, line }
  const adj = [];                                      // [{ to, cost, kind, line }]
  const byStation = Array.from({ length: nStations }, () => []);
  const index = new Map();

  const state = (station, line) => {
    const key = station + '|' + line;
    let i = index.get(key);
    if (i === undefined) {
      i = states.length;
      index.set(key, i);
      states.push({ station, line });
      adj.push([]);
      byStation[station].push(i);
    }
    return i;
  };
  const link = (a, b, cost, kind, line) => { adj[a].push({ to: b, cost, kind, line }); };

  // Tout le monde a un état « dans la rue », y compris les stations sans arête.
  for (const s of data.stations) state(s.id, WALK);

  for (const [a, b, minutes, lineId] of data.edges) {
    if (lineId === null) {                             // correspondance à pied entre stations
      const u = state(a, WALK), v = state(b, WALK);
      link(u, v, minutes, 'walk', null);
      link(v, u, minutes, 'walk', null);
    } else {
      const u = state(a, lineId), v = state(b, lineId);
      link(u, v, minutes, 'ride', lineId);
      link(v, u, minutes, 'ride', lineId);
    }
  }

  const bigFactor = station => {
    const n = normalise(data.stations[station].n);
    return model.bigStations.some(b => n.includes(b)) ? model.bigStationFactor : 1;
  };
  const wait = lineId => {
    const line = lines.get(lineId);
    return (line && line.headway ? line.headway : model.defaultHeadway) / 2;
  };

  for (let sid = 0; sid < nStations; sid++) {
    const f = bigFactor(sid);
    for (const from of byStation[sid]) {
      for (const to of byStation[sid]) {
        if (from === to) continue;
        const a = states[from].line, b = states[to].line;
        if (a === WALK) link(from, to, model.entryMin * f + wait(b), 'board', b);
        else if (b === WALK) link(from, to, model.exitMin * f, 'alight', a);
        else link(from, to, model.transferMin * f + wait(b), 'transfer', b);
      }
    }
  }

  return { data, model, lines, states, adj, byStation, bigFactor, wait };
}

// --------------------------------------------------------------------------------------
// Dijkstra
// --------------------------------------------------------------------------------------

class Heap {                                           // tas binaire minimal (clé, valeur)
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    this.k.push(key); this.v.push(val);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      this.swap(p, i); i = p;
    }
  }
  pop() {
    const top = this.v[0], lastK = this.k.pop(), lastV = this.v.pop();
    if (this.k.length) {
      this.k[0] = lastK; this.v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] < this.k[m]) m = l;
        if (r < this.k.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        this.swap(m, i); i = m;
      }
    }
    return top;
  }
  swap(a, b) {
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
    [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
}

/**
 * Temps de trajet depuis un point de départ vers toutes les stations.
 * `origin` : { station } ou { lat, lon }. Une origine géographique démarre à pied depuis
 * toutes les stations à portée, avec le temps de marche comme coût initial.
 */
export function travelTimes(graph, origin) {
  const n = graph.states.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const via = new Array(n).fill(null);
  const heap = new Heap();

  for (const seed of seedsFor(graph, origin)) {
    const s = graph.byStation[seed.station].find(i => graph.states[i].line === WALK);
    if (s !== undefined && seed.minutes < dist[s]) {
      dist[s] = seed.minutes;
      heap.push(seed.minutes, s);
    }
  }

  const done = new Uint8Array(n);
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    for (const e of graph.adj[u]) {
      const alt = dist[u] + e.cost;
      if (alt < dist[e.to]) {
        dist[e.to] = alt;
        prev[e.to] = u;
        via[e.to] = e;
        heap.push(alt, e.to);
      }
    }
  }

  // Temps d'arrivée par station = meilleur de ses états (on ne facture pas la sortie).
  const nStations = graph.data.stations.length;
  const arrival = new Float64Array(nStations).fill(Infinity);
  const arrivalState = new Int32Array(nStations).fill(-1);
  for (let sid = 0; sid < nStations; sid++) {
    for (const st of graph.byStation[sid]) {
      if (dist[st] < arrival[sid]) { arrival[sid] = dist[st]; arrivalState[sid] = st; }
    }
  }
  return { dist, prev, via, arrival, arrivalState, origin };
}

function seedsFor(graph, origin) {
  if (origin.station !== undefined && origin.station !== null) {
    return [{ station: origin.station, minutes: 0 }];
  }
  return nearestStations(graph.data, origin.lat, origin.lon,
                         graph.model.accessRadiusM, graph.model);
}

/** Stations à portée de marche d'un point, temps de marche compris. */
export function nearestStations(data, lat, lon, radiusM = DEFAULT_MODEL.accessRadiusM,
                                model = DEFAULT_MODEL) {
  const out = [];
  for (const s of data.stations) {
    const m = haversineM(lat, lon, s.lat, s.lon);
    if (m <= radiusM) out.push({ station: s.id, meters: m, minutes: walkMinutes(m, model) });
  }
  out.sort((a, b) => a.meters - b.meters);
  return out;
}

// --------------------------------------------------------------------------------------
// Itinéraire
// --------------------------------------------------------------------------------------

/**
 * Itinéraire résumé jusqu'à une station : suite de tronçons (une ligne prise, ou une marche).
 * Les correspondances et les temps d'attente n'apparaissent pas comme tronçons — ils sont
 * comptés dans `changes`, qui est ce qu'on lit avant de choisir.
 */
export function legsFor(graph, times, stationId) {
  let cur = times.arrivalState[stationId];
  if (cur === undefined || cur < 0 || !isFinite(times.dist[cur])) return null;
  const steps = [];
  while (times.prev[cur] >= 0) {
    steps.push({ edge: times.via[cur], from: times.prev[cur], to: cur });
    cur = times.prev[cur];
  }
  steps.reverse();

  // Chaque tronçon garde la suite des stations traversées, pas seulement ses extrémités :
  // un plan qui relierait Nation à Étoile en droite couperait à travers Paris au lieu de
  // suivre la ligne 1.
  const legs = [];
  for (const { edge, from, to } of steps) {
    const a = graph.states[from].station, b = graph.states[to].station;
    const last = legs[legs.length - 1];
    if (edge.kind === 'ride') {
      if (last && last.kind === 'ride' && last.line === edge.line) {
        last.to = b; last.stops += 1; last.minutes += edge.cost; last.stations.push(b);
      } else {
        legs.push({ kind: 'ride', line: edge.line, from: a, to: b, stops: 1,
                    minutes: edge.cost, stations: [a, b] });
      }
    } else if (edge.kind === 'walk') {
      legs.push({ kind: 'walk', from: a, to: b, stops: 0, minutes: edge.cost, stations: [a, b] });
    } else if (last) {
      last.minutes += edge.cost;                        // attente et couloirs : sur le tronçon
    }
  }
  const rides = legs.filter(l => l.kind === 'ride').length;
  // Suite continue de stations, du départ à l'arrivée, sans répéter les raccords.
  const path = [];
  for (const l of legs) for (const sid of l.stations) if (path[path.length - 1] !== sid) path.push(sid);
  return { legs, path,
           changes: Math.max(0, rides - 1) + legs.filter(l => l.kind === 'walk').length };
}

// --------------------------------------------------------------------------------------
// Classement
// --------------------------------------------------------------------------------------

// Le score porte sur le QUARTIER, pas sur la station : c'est le quartier qui a des bars.
export const PROFILES = {
  verre:  { label: 'Boire un verre', score: q => q.sBar,                counts: ['bar'] },
  manger: { label: 'Manger',         score: q => q.sEat,                counts: ['eat'] },
  both:   { label: 'Les deux',       score: q => (q.sBar + q.sEat) / 2, counts: ['bar', 'eat'] }
};

/**
 * Quartier d'une station. Si `data.quartiers` manque — un data.js d'avant le regroupement —
 * chaque station forme son propre quartier : le classement retrouve son comportement
 * d'origine au lieu de casser.
 */
export function quartierIndex(data) {
  const byId = new Map((data.quartiers || []).map(q => [q.id, q]));
  return s => byId.get(s.q) || {
    id: 's' + s.id, n: s.n, s: [s.id], lat: s.lat, lon: s.lon,
    bar: s.bar, eat: s.eat, sBar: s.sBar || 0, sEat: s.sEat || 0
  };
}

/**
 * Une réponse par quartier : on garde la station qui sert le mieux la personne la plus
 * loin. Sans cela, Châtelet, Châtelet - Les Halles et Les Halles — 395 m d'un bout à
 * l'autre, les mêmes bars — occuperaient trois places du classement.
 */
function bestPerQuartier(rows) {
  const best = new Map();
  for (const r of rows) {
    const cur = best.get(r.quartier.id);
    if (!cur || r.tmax < cur.tmax || (r.tmax === cur.tmax && r.total < cur.total)) {
      best.set(r.quartier.id, r);
    }
  }
  return [...best.values()];
}

/**
 * Filtre d'abord, trie ensuite — jamais un score unique qui mélangerait des minutes et des
 * bars. On écarte les stations où quelqu'un dépasserait le budget de trajet, puis on classe
 * ce qui reste par densité de lieux.
 *
 * `people` : [{ name, origin }]. `opts` : { profile, toleranceMin, maxChanges, limit }.
 */
export function rank(graph, people, opts = {}) {
  const profile = PROFILES[opts.profile] || PROFILES.both;
  const tolerance = opts.toleranceMin != null ? opts.toleranceMin : 8;
  const limit = opts.limit || 6;
  const times = people.map(p => travelTimes(graph, p.origin));
  const quartierOf = quartierIndex(graph.data);

  const rows = [];
  for (const s of graph.data.stations) {
    if (!s.z) continue;                                 // hors zone : jamais un lieu de RDV
    const per = times.map(t => t.arrival[s.id]);
    if (per.some(v => !isFinite(v))) continue;
    const tmax = Math.max(...per), tmin = Math.min(...per);
    const quartier = quartierOf(s);
    rows.push({
      station: s, quartier, times: per, tmax, tmin, spread: tmax - tmin,
      total: per.reduce((a, b) => a + b, 0), animation: profile.score(quartier)
    });
  }
  if (!rows.length) return { candidates: [], fairest: null, floor: null, tolerance, profile, times };

  const floor = Math.min(...rows.map(r => r.tmax));     // le mieux qu'on puisse faire
  // Calculé sur toutes les lignes, pas seulement les éligibles : le plus équitable reste
  // affiché même si la contrainte de correspondances l'a écarté du classement.
  const fairest = bestPerQuartier(rows).reduce((a, b) =>
    (b.tmax < a.tmax || (b.tmax === a.tmax && b.animation > a.animation)) ? b : a);

  let eligible = rows.filter(r => r.tmax <= floor + tolerance);
  for (const r of eligible) {
    r.routes = times.map(t => legsFor(graph, t, r.station.id));
    r.changes = Math.max(...r.routes.map(x => (x ? x.changes : 99)));
    r.cost = r.tmax - floor;                            // minutes payées pour l'animation
  }
  if (opts.maxChanges != null) {
    const kept = eligible.filter(r => r.changes <= opts.maxChanges);
    if (kept.length) eligible = kept;                   // contrainte ignorée si elle vide tout
  }
  // Regroupement APRÈS le filtre : on ne veut pas qu'un quartier soit représenté par une
  // station que le budget de trajet ou les correspondances auraient écartée.
  const grouped = bestPerQuartier(eligible);
  grouped.sort((a, b) => b.animation - a.animation || a.tmax - b.tmax);

  if (!fairest.routes) {
    fairest.routes = times.map(t => legsFor(graph, t, fairest.station.id));
    fairest.changes = Math.max(...fairest.routes.map(x => (x ? x.changes : 99)));
    fairest.cost = 0;
  }
  return { candidates: grouped.slice(0, limit), fairest, floor, tolerance, profile, times };
}

// --------------------------------------------------------------------------------------
// Recherche de station
// --------------------------------------------------------------------------------------

export function searchStations(data, query, limit = 8) {
  const q = normalise(query);
  if (!q) return [];
  const scored = [];
  for (const s of data.stations) {
    const n = normalise(s.n);
    const i = n.indexOf(q);
    if (i < 0) continue;
    scored.push({ station: s, rank: i === 0 ? 0 : 1, len: n.length });
  }
  scored.sort((a, b) => a.rank - b.rank || a.len - b.len);
  return scored.slice(0, limit).map(x => x.station);
}
