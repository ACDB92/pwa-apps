import { coefficients } from './engine.js';

// Tout ce qui passe par le réseau : prévisions de vent et de mer (Open-Meteo), itinéraires (OSRM),
// prix moyen du carburant (prix-carburants, données ouvertes). Aucune clé, aucun backend.
// Chaque réponse est gardée dans localStorage : sans réseau, l'appli montre la dernière prévision
// reçue, avec son heure.

const CLE_CACHE = 'coup-de-vent:cache:';
const UNE_HEURE = 3600 * 1000;

function lireCache(cle, ageMax) {
  try {
    const brut = localStorage.getItem(CLE_CACHE + cle);
    if (!brut) return null;
    const { quand, valeur } = JSON.parse(brut);
    return { valeur, quand, frais: Date.now() - quand < ageMax };
  } catch { return null; }
}

function ecrireCache(cle, valeur) {
  try { localStorage.setItem(CLE_CACHE + cle, JSON.stringify({ quand: Date.now(), valeur })); } catch { /* quota : tant pis */ }
}

// Réseau d'abord si le cache a vieilli, cache en secours si le réseau échoue.
async function avecCache(cle, ageMax, charger) {
  const c = lireCache(cle, ageMax);
  if (c?.frais) return { ...c, source: 'cache' };
  try {
    const valeur = await charger();
    ecrireCache(cle, valeur);
    return { valeur, quand: Date.now(), frais: true, source: 'réseau' };
  } catch (e) {
    if (c) return { ...c, source: 'cache', erreur: String(e) };
    throw e;
  }
}

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} sur ${new URL(url).host}`);
  return r.json();
}

const coords = spots => ({
  lat: spots.map(s => s.lat.toFixed(3)).join(','),
  lon: spots.map(s => s.lon.toFixed(3)).join(',')
});

// Les modèles dont la médiane fait le verdict, et leur horizon : Météo-France (AROME puis ARPEGE)
// ~4 jours, ICON ~7 jours, ECMWF ~15 jours, GFS 16 jours. Au-delà, il en reste moins, et l'appli le dit.
export const MODELES = { meteofrance_seamless: 'Météo-France', icon_seamless: 'ICON', ecmwf_ifs025: 'ECMWF', gfs_seamless: 'GFS' };
// Point de référence du coefficient de marée (Brest), ajouté à la requête marine.
const BREST = { lat: 48.38, lon: -4.50 };

// Une prévision par spot, au format attendu par le moteur. Trois appels en tout, quel que soit le
// nombre de spots : l'API accepte plusieurs positions à la fois.
export async function chargerPrevisions(spots) {
  const cle = 'prev3:' + spots.map(s => s.id).join(',');
  return avecCache(cle, UNE_HEURE, async () => {
    const { lat, lon } = coords(spots);
    const base = `latitude=${lat}&longitude=${lon}&timezone=Europe%2FParis&forecast_days=16`;
    const baseMer = `latitude=${lat},${BREST.lat}&longitude=${lon},${BREST.lon}&timezone=Europe%2FParis&forecast_days=16`;
    const [vent, mer, modeles] = await Promise.all([
      json(`https://api.open-meteo.com/v1/forecast?${base}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,weather_code&daily=sunrise,sunset&wind_speed_unit=kn`),
      // La mer et les modèles ne sont que des compléments : sans eux, on garde le vent et on dit ce qui manque.
      json(`https://marine-api.open-meteo.com/v1/marine?${baseMer}&hourly=sea_level_height_msl,sea_surface_temperature,wave_height,wave_period`).catch(() => null),
      json(`https://api.open-meteo.com/v1/forecast?${base}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&models=${Object.keys(MODELES).join(',')}&wind_speed_unit=kn`).catch(() => null)
    ]);
    const liste = v => (Array.isArray(v) ? v : [v]);
    const vents = liste(vent), mers = mer ? liste(mer) : [], parModele = modeles ? liste(modeles) : [];
    const sortie = {};
    spots.forEach((s, k) => {
      const v = vents[k], m = mers[k];
      const index = {};
      m?.hourly?.time.forEach((t, i) => { index[t] = i; });
      const deLaMer = champ => v.hourly.time.map(t => (m && index[t] != null ? m.hourly[champ][index[t]] : null));
      const pm = parModele[k]?.hourly;
      const lesModeles = {};
      if (pm && pm.time.length === v.hourly.time.length) {
        Object.entries(MODELES).forEach(([cleModele, nom]) => {
          if (pm['wind_speed_10m_' + cleModele]) lesModeles[nom] = { vent: pm['wind_speed_10m_' + cleModele], rafales: pm['wind_gusts_10m_' + cleModele], dir: pm['wind_direction_10m_' + cleModele] };
        });
      }
      sortie[s.id] = {
        heures: {
          time: v.hourly.time,
          vent: v.hourly.wind_speed_10m,
          rafales: v.hourly.wind_gusts_10m,
          dir: v.hourly.wind_direction_10m,
          temp: v.hourly.temperature_2m,
          niveau: deLaMer('sea_level_height_msl'),
          eau: deLaMer('sea_surface_temperature'),
          vagues: deLaMer('wave_height'),
          periode: deLaMer('wave_period'),
          code: v.hourly.weather_code,
          modeles: lesModeles
        },
        jours: { date: v.daily.time, lever: v.daily.sunrise, coucher: v.daily.sunset }
      };
    });
    // Le dernier point de la requête marine est Brest : son niveau donne le coefficient du jour.
    const brest = mers[spots.length]?.hourly;
    sortie.__coefficients = brest ? coefficientsDeBrest(brest) : {};
    return sortie;
  });
}

function coefficientsDeBrest(h) {
  return coefficients(h.time, h.sea_level_height_msl);
}

// Distance et durée par la route, de la ville de départ à chaque spot, en un appel (service `table`).
// Le serveur de démonstration d'OSRM suffit pour un usage personnel ; s'il ne répond pas, le moteur
// estime à vol d'oiseau.
export async function chargerRoutes(ville, spots) {
  const cle = `route:${ville.lat},${ville.lon}:` + spots.map(s => s.id).join(',');
  return avecCache(cle, 30 * 24 * UNE_HEURE, async () => {
    const points = [[ville.lon, ville.lat], ...spots.map(s => [s.lon, s.lat])].map(p => p.join(',')).join(';');
    const r = await json(`https://router.project-osrm.org/table/v1/driving/${points}?sources=0&annotations=distance,duration`);
    if (r.code !== 'Ok') throw new Error('OSRM : ' + r.code);
    const sortie = {};
    spots.forEach((s, k) => {
      const km = r.distances[0][k + 1], s_ = r.durations[0][k + 1];
      if (km != null && s_ != null) sortie[s.id] = { km: km / 1000, minutes: s_ / 60 * 1.1 };  // +10 % : circulation
    });
    return sortie;
  });
}

// Prix moyen national du jour, en €/L, par carburant.
export async function chargerCarburant() {
  return avecCache('carburant', 12 * UNE_HEURE, async () => {
    const r = await json('https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?select=avg(gazole_prix)%20as%20gazole,avg(sp95_prix)%20as%20sp95,avg(e10_prix)%20as%20e10,avg(sp98_prix)%20as%20sp98&limit=1');
    const p = r.results?.[0];
    if (!p || !p.gazole) throw new Error('prix du carburant illisible');
    return p;
  });
}
