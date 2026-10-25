// Base de coup-de-vent : spots, gares, aéroports, villes de départ, compagnies.
// Écrite à la main le 25 octobre 2026. Rien ici n'est mesuré : les coordonnées, les orientations et les
// créneaux de marée sont des estimations à vérifier sur place ou auprès d'un club, et l'appli le dit.
//
// Orientation d'un spot (`face`) : le cap, en degrés, de la plage vers le large. Un vent qui vient de ce
// cap est onshore ; à 90° il est side-shore ; à 180° il est offshore, donc dangereux. Un plan d'eau
// fermé (étang) n'a pas de large : il porte à la place `secteurs`, les directions de vent qui marchent.
//
// Marée (`maree`) : les phases où le spot fonctionne, parmi 'basse', 'mi', 'haute'. `null` en
// Méditerranée, où la marée ne compte pas.
//
// Windguru (`windguru`) : identifiant du spot Windguru le plus proche (≤ 4 km), pour le lien de la fiche.
// Relevés le 25/10/2026 ; le Pilou renvoie vers Palavas-les-Flots (2,9 km), seul spot Windguru voisin.
//
// Sécurité (`niveau`, `dangers`) : le niveau conseillé ('tous', 'intermédiaire', 'confirmé') et les
// dangers connus du spot. Indications générales, pas un avis de club : à vérifier sur place, comme les
// restrictions de pratique, qui changent d'une saison et d'une commune à l'autre.

export const SOURCE_SPOTS =
  'Base écrite à la main le 25/10/2026 : positions, orientations, créneaux de marée, niveaux et dangers estimés, à vérifier auprès d\'un club.';

export const SPOTS = [
  // Côte d'Opale et Somme
  { id: 'dunkerque', nom: 'Malo-les-Bains', lieu: 'Dunkerque', zone: 'Côte d\'Opale', lat: 51.054, lon: 2.405, face: 345, maree: ['basse', 'mi', 'haute'], gare: 'dunkerque', niveau: 'tous', dangers: ["Digues et brise-lames à l'est, vers le port"], windguru: 85184 },
  { id: 'wissant', nom: 'Wissant', lieu: 'Baie de Wissant', zone: 'Côte d\'Opale', lat: 50.887, lon: 1.660, face: 315, maree: ['basse', 'mi', 'haute'], gare: 'calais', niveau: 'intermédiaire', dangers: ["Pratique réglementée en saison (zone dédiée)", "Courants de marée au large du cap"], windguru: 110 },
  { id: 'hardelot', nom: 'Hardelot', lieu: 'Neufchâtel-Hardelot', zone: 'Côte d\'Opale', lat: 50.635, lon: 1.578, face: 275, maree: ['basse', 'mi', 'haute'], gare: 'boulogne', niveau: 'tous', dangers: [], windguru: 1906 },
  { id: 'touquet', nom: 'Le Touquet', lieu: 'Le Touquet-Paris-Plage', zone: 'Côte d\'Opale', lat: 50.525, lon: 1.582, face: 280, maree: ['basse', 'mi', 'haute'], gare: 'etaples', niveau: 'intermédiaire', dangers: ["Courants à l'embouchure de la Canche, au nord"], windguru: 48359 },
  { id: 'berck', nom: 'Berck', lieu: 'Berck-sur-Mer', zone: 'Côte d\'Opale', lat: 50.405, lon: 1.560, face: 270, maree: ['basse', 'mi', 'haute'], gare: 'rang', niveau: 'tous', dangers: ["Courants à l'embouchure de l'Authie, au sud"], windguru: 1061 },
  { id: 'crotoy', nom: 'Le Crotoy', lieu: 'Baie de Somme', zone: 'Picardie', lat: 50.216, lon: 1.625, face: 220, maree: ['haute'], gare: 'noyelles', niveau: 'intermédiaire', dangers: ["Baie : courant de marée fort au flot", "Bancs de sable et vasières à marée basse"], windguru: 162 },
  { id: 'cayeux', nom: 'Cayeux-sur-Mer', lieu: 'Baie de Somme', zone: 'Picardie', lat: 50.182, lon: 1.493, face: 280, maree: ['mi', 'haute'], gare: 'noyelles', niveau: 'intermédiaire', dangers: ["Plage de galets et épis"], windguru: 87904 },
  // Normandie
  { id: 'ouistreham', nom: 'Riva-Bella', lieu: 'Ouistreham', zone: 'Normandie', lat: 49.290, lon: -0.256, face: 0, maree: ['mi', 'haute'], gare: 'caen', niveau: 'tous', dangers: ["Chenal du port à proximité : navigation interdite dedans"], windguru: 163 },
  { id: 'agon', nom: 'Agon-Coutainville', lieu: 'Cotentin', zone: 'Normandie', lat: 49.043, lon: -1.598, face: 265, maree: ['mi', 'haute'], gare: 'coutances', niveau: 'intermédiaire', dangers: ["Courant fort à la pointe d'Agon (havre de Regnéville)"], windguru: 48404 },
  { id: 'siouville', nom: 'Siouville', lieu: 'La Hague', zone: 'Normandie', lat: 49.560, lon: -1.845, face: 270, maree: ['basse', 'mi', 'haute'], gare: 'cherbourg', niveau: 'confirmé', dangers: ["Shorebreak et vagues par vent d'ouest", "Rochers aux extrémités de la plage"], windguru: 186 },
  // Bretagne
  { id: 'saint-lunaire', nom: 'Longchamp', lieu: 'Saint-Lunaire', zone: 'Bretagne nord', lat: 48.636, lon: -2.120, face: 340, maree: ['mi'], gare: 'saint-malo', niveau: 'intermédiaire', dangers: ["Rochers", "Plage étroite à marée haute"], windguru: 48410 },
  { id: 'sables-dor', nom: 'Sables-d\'Or-les-Pins', lieu: 'Fréhel', zone: 'Bretagne nord', lat: 48.640, lon: -2.405, face: 0, maree: ['mi', 'haute'], gare: 'lamballe', niveau: 'intermédiaire', dangers: [], windguru: 48414 },
  { id: 'santec', nom: 'Le Dossen', lieu: 'Santec', zone: 'Bretagne nord', lat: 48.705, lon: -4.040, face: 330, maree: ['basse', 'mi', 'haute'], gare: 'morlaix', niveau: 'intermédiaire', dangers: ["Rochers", "Courants dans le chenal de l'île de Sieck"], windguru: 9417 },
  { id: 'blancs-sablons', nom: 'Les Blancs Sablons', lieu: 'Le Conquet', zone: 'Finistère', lat: 48.370, lon: -4.760, face: 290, maree: ['basse', 'mi', 'haute'], gare: 'brest', niveau: 'intermédiaire', dangers: ["Rochers aux extrémités"], windguru: 48445 },
  { id: 'la-torche', nom: 'La Torche', lieu: 'Plomeur', zone: 'Finistère', lat: 47.840, lon: -4.350, face: 255, maree: ['basse', 'mi', 'haute'], gare: 'quimper', niveau: 'confirmé', dangers: ["Vagues puissantes", "Rochers de la pointe", "Courants"], windguru: 218 },
  { id: 'penthievre', nom: 'Penthièvre', lieu: 'Presqu\'île de Quiberon', zone: 'Bretagne sud', lat: 47.545, lon: -3.130, face: 245, maree: ['basse', 'mi', 'haute'], gare: 'auray', niveau: 'confirmé', dangers: ["Shorebreak", "Baïnes et courants de baïne côté océan"], windguru: 48484 },
  { id: 'la-baule', nom: 'La Baule', lieu: 'Baie de La Baule', zone: 'Loire-Atlantique', lat: 47.281, lon: -2.392, face: 185, maree: ['mi', 'haute'], gare: 'la-baule', niveau: 'tous', dangers: ["Pratique restreinte en saison : plage très fréquentée"], windguru: 579 },
  { id: 'saint-brevin', nom: 'Saint-Brevin', lieu: 'Saint-Brevin-les-Pins', zone: 'Loire-Atlantique', lat: 47.240, lon: -2.172, face: 255, maree: ['mi', 'haute'], gare: 'saint-nazaire', niveau: 'intermédiaire', dangers: ["Courants de l'estuaire de la Loire", "Trafic maritime dans le chenal"], windguru: 198 },
  // Atlantique
  { id: 'saint-jean-de-monts', nom: 'Saint-Jean-de-Monts', lieu: 'Vendée', zone: 'Vendée', lat: 46.785, lon: -2.090, face: 250, maree: ['basse', 'mi', 'haute'], gare: 'challans', niveau: 'tous', dangers: [], windguru: 190 },
  { id: 'la-tranche', nom: 'La Tranche-sur-Mer', lieu: 'Vendée', zone: 'Vendée', lat: 46.343, lon: -1.430, face: 200, maree: ['basse', 'mi', 'haute'], gare: 'la-rochelle', niveau: 'intermédiaire', dangers: ["Vagues par vent d'ouest"], windguru: 721 },
  { id: 'chatelaillon', nom: 'Châtelaillon-Plage', lieu: 'Charente-Maritime', zone: 'Charente-Maritime', lat: 46.073, lon: -1.093, face: 270, maree: ['mi', 'haute'], gare: 'chatelaillon', niveau: 'tous', dangers: ["Vase à marée basse"], windguru: 48530 },
  { id: 'oleron', nom: 'Vert-Bois', lieu: 'Île d\'Oléron', zone: 'Charente-Maritime', lat: 45.855, lon: -1.250, face: 250, maree: ['basse', 'mi', 'haute'], gare: 'rochefort', niveau: 'confirmé', dangers: ["Baïnes", "Shorebreak"], windguru: 1018251 },
  { id: 'lacanau', nom: 'Lacanau-Océan', lieu: 'Gironde', zone: 'Gironde', lat: 45.000, lon: -1.204, face: 275, maree: ['basse', 'mi', 'haute'], gare: 'bordeaux', niveau: 'confirmé', dangers: ["Baïnes", "Shorebreak"], windguru: 48561 },
  // Méditerranée
  { id: 'leucate', nom: 'Leucate — étang', lieu: 'La Franqui', zone: 'Languedoc', lat: 42.905, lon: 3.020, secteurs: [[270, 360], [90, 180]], maree: null, gare: 'leucate', niveau: 'tous', dangers: ["Tramontane rafaleuse, souvent au-delà de 30 nœuds"], windguru: 500987 },
  { id: 'gruissan', nom: 'Gruissan', lieu: 'Étang et plage du Chalet', zone: 'Languedoc', lat: 43.100, lon: 3.105, secteurs: [[270, 360], [90, 180]], maree: null, gare: 'narbonne', niveau: 'tous', dangers: [], windguru: 500975 },
  { id: 'pilou', nom: 'Le Pilou', lieu: 'Villeneuve-lès-Maguelone', zone: 'Languedoc', lat: 43.515, lon: 3.900, face: 160, maree: null, gare: 'montpellier', niveau: 'intermédiaire', dangers: [], windguru: 48598 },
  { id: 'espiguette', nom: 'L\'Espiguette', lieu: 'Le Grau-du-Roi', zone: 'Camargue', lat: 43.485, lon: 4.140, face: 200, maree: null, gare: 'grau-du-roi', niveau: 'intermédiaire', dangers: ["Plage immense : secours éloignés"], windguru: 48604 },
  { id: 'beauduc', nom: 'Beauduc', lieu: 'Camargue', zone: 'Camargue', lat: 43.370, lon: 4.580, face: 190, maree: null, gare: 'arles', niveau: 'confirmé', dangers: ["Site isolé, accès par piste", "Secours éloignés"], windguru: 230 },
  { id: 'almanarre', nom: 'L\'Almanarre', lieu: 'Hyères', zone: 'Var', lat: 43.060, lon: 6.130, face: 235, maree: null, gare: 'hyeres', niveau: 'intermédiaire', dangers: ["Zone de pratique balisée, restreinte l'été", "Mistral rafaleux"], windguru: 48627 }
];

// `parisMin` : durée habituelle depuis Paris, en minutes, au jugé d'après les horaires usuels — elle
// remplace le modèle quand on part de Paris. `tgv` : desservie par un TGV, ce qui change la vitesse
// du modèle pour une autre ville de départ.
export const GARES = {
  'dunkerque': { nom: 'Dunkerque', lat: 51.031, lon: 2.369, tgv: true, parisMin: 115 },
  'calais': { nom: 'Calais-Fréthun', lat: 50.901, lon: 1.811, tgv: true, parisMin: 110 },
  'boulogne': { nom: 'Boulogne-sur-Mer', lat: 50.716, lon: 1.611, tgv: true, parisMin: 140 },
  'etaples': { nom: 'Étaples – Le Touquet', lat: 50.514, lon: 1.640, tgv: true, parisMin: 150 },
  'rang': { nom: 'Rang-du-Fliers – Verton', lat: 50.418, lon: 1.646, tgv: true, parisMin: 150 },
  'noyelles': { nom: 'Noyelles-sur-Mer', lat: 50.185, lon: 1.708, tgv: false, parisMin: 140 },
  'caen': { nom: 'Caen', lat: 49.176, lon: -0.348, tgv: false, parisMin: 130 },
  'coutances': { nom: 'Coutances', lat: 49.047, lon: -1.437, tgv: false, parisMin: 190 },
  'cherbourg': { nom: 'Cherbourg', lat: 49.634, lon: -1.623, tgv: false, parisMin: 190 },
  'saint-malo': { nom: 'Saint-Malo', lat: 48.647, lon: -2.006, tgv: true, parisMin: 150 },
  'lamballe': { nom: 'Lamballe', lat: 48.468, lon: -2.517, tgv: true, parisMin: 150 },
  'morlaix': { nom: 'Morlaix', lat: 48.578, lon: -3.832, tgv: true, parisMin: 205 },
  'brest': { nom: 'Brest', lat: 48.388, lon: -4.479, tgv: true, parisMin: 215 },
  'quimper': { nom: 'Quimper', lat: 47.995, lon: -4.095, tgv: true, parisMin: 220 },
  'auray': { nom: 'Auray', lat: 47.680, lon: -2.999, tgv: true, parisMin: 175 },
  'la-baule': { nom: 'La Baule-Escoublac', lat: 47.287, lon: -2.390, tgv: true, parisMin: 175 },
  'saint-nazaire': { nom: 'Saint-Nazaire', lat: 47.286, lon: -2.212, tgv: true, parisMin: 160 },
  'challans': { nom: 'Challans', lat: 46.846, lon: -1.877, tgv: false, parisMin: 200 },
  'la-rochelle': { nom: 'La Rochelle', lat: 46.153, lon: -1.145, tgv: true, parisMin: 175 },
  'chatelaillon': { nom: 'Châtelaillon-Plage', lat: 46.075, lon: -1.088, tgv: false, parisMin: 190 },
  'rochefort': { nom: 'Rochefort', lat: 45.946, lon: -0.962, tgv: false, parisMin: 195 },
  'bordeaux': { nom: 'Bordeaux Saint-Jean', lat: 44.826, lon: -0.556, tgv: true, parisMin: 125 },
  'leucate': { nom: 'Leucate – La Franqui', lat: 42.915, lon: 3.031, tgv: false, parisMin: 300 },
  'narbonne': { nom: 'Narbonne', lat: 43.190, lon: 3.006, tgv: true, parisMin: 265 },
  'montpellier': { nom: 'Montpellier Saint-Roch', lat: 43.605, lon: 3.880, tgv: true, parisMin: 200 },
  'grau-du-roi': { nom: 'Le Grau-du-Roi', lat: 43.538, lon: 4.137, tgv: false, parisMin: 250 },
  'arles': { nom: 'Arles', lat: 43.684, lon: 4.632, tgv: false, parisMin: 240 },
  'hyeres': { nom: 'Hyères', lat: 43.117, lon: 6.124, tgv: true, parisMin: 270 }
};

// Aéroports desservis depuis Paris-Orly en vol intérieur. `volMin` : durée du vol seul. L'avion n'est
// proposé que si l'on part de Paris : depuis une autre ville, les liaisons intérieures sont trop rares
// pour être devinées.
export const AEROPORTS = {
  BES: { nom: 'Brest Bretagne', lat: 48.447, lon: -4.418, volMin: 70 },
  BOD: { nom: 'Bordeaux-Mérignac', lat: 44.828, lon: -0.715, volMin: 70 },
  PGF: { nom: 'Perpignan', lat: 42.741, lon: 2.870, volMin: 85 },
  MPL: { nom: 'Montpellier', lat: 43.576, lon: 3.963, volMin: 75 },
  MRS: { nom: 'Marseille Provence', lat: 43.439, lon: 5.221, volMin: 80 },
  TLN: { nom: 'Toulon-Hyères', lat: 43.097, lon: 6.146, volMin: 85 }
};

// Supplément pour un sac de kite (ailes + planche), par trajet. Relevé le 25/10/2026 ; plusieurs
// montants sont incertains, d'où la source de chacun — la compagnie se choisit dans les réglages.
export const COMPAGNIES = {
  'air-france': { nom: 'Air France', sac: 0, note: 'Gratuit s\'il est le seul bagage en soute, sauf en tarif Light ou Basic. Au-delà de 107 cm, accord du service client 48 h avant.' },
  'transavia': { nom: 'Transavia', sac: 60, note: 'Sac de 32 kg et 3,60 m au maximum. La page française dit 60 €, l\'anglaise 52 €.' },
  'volotea': { nom: 'Volotea', sac: 60, note: '60 € en ligne, 80 € à l\'aéroport (grille citée, non lue directement).' },
  'easyjet': { nom: 'easyJet', sac: 52, note: 'Environ 45 £ en ligne (source tierce, page officielle illisible).' }
};

export const VILLES = {
  paris: { nom: 'Paris', lat: 48.853, lon: 2.348, tgv: true },
  lille: { nom: 'Lille', lat: 50.637, lon: 3.071, tgv: true },
  rouen: { nom: 'Rouen', lat: 49.449, lon: 1.094, tgv: false },
  rennes: { nom: 'Rennes', lat: 48.103, lon: -1.672, tgv: true },
  nantes: { nom: 'Nantes', lat: 47.217, lon: -1.542, tgv: true },
  tours: { nom: 'Tours', lat: 47.389, lon: 0.694, tgv: true },
  bordeaux: { nom: 'Bordeaux', lat: 44.826, lon: -0.556, tgv: true },
  toulouse: { nom: 'Toulouse', lat: 43.611, lon: 1.454, tgv: true },
  montpellier: { nom: 'Montpellier', lat: 43.605, lon: 3.880, tgv: true },
  marseille: { nom: 'Marseille', lat: 43.303, lon: 5.380, tgv: true },
  nice: { nom: 'Nice', lat: 43.704, lon: 7.262, tgv: true },
  lyon: { nom: 'Lyon', lat: 45.760, lon: 4.859, tgv: true },
  grenoble: { nom: 'Grenoble', lat: 45.191, lon: 5.715, tgv: true },
  strasbourg: { nom: 'Strasbourg', lat: 48.585, lon: 7.734, tgv: true }
};

// Contour simplifié de la France métropolitaine, [lon, lat], tracé à la main : il sert de décor à la
// carte, pas de référence géographique. La Corse à part.
export const CONTOUR_FRANCE = [
  [2.37, 51.05], [2.55, 51.09], [2.9, 50.70], [3.2, 50.72], [3.7, 50.32], [4.2, 50.28], [4.85, 50.15],
  [4.83, 49.95], [5.4, 49.62], [5.82, 49.55], [6.36, 49.47], [7.05, 49.12], [7.63, 49.05], [8.22, 48.97],
  [7.80, 48.50], [7.55, 47.95], [7.59, 47.58], [7.0, 47.45], [6.9, 47.35], [6.45, 47.0], [6.1, 46.6],
  [6.12, 46.23], [6.8, 46.40], [6.86, 45.83], [7.15, 45.25], [6.62, 45.10], [7.0, 44.85], [6.85, 44.50],
  [7.0, 44.20], [7.50, 43.78], [7.25, 43.68], [7.0, 43.55], [6.65, 43.27], [6.2, 43.10], [5.9, 43.08],
  [5.4, 43.20], [5.0, 43.33], [4.85, 43.35], [4.55, 43.37], [4.2, 43.47], [3.9, 43.52], [3.5, 43.28],
  [3.2, 43.18], [3.05, 42.95], [3.04, 42.75], [3.17, 42.43], [2.7, 42.40], [1.75, 42.50], [0.7, 42.85],
  [0.0, 42.70], [-0.75, 42.95], [-1.45, 43.05], [-1.78, 43.37], [-1.55, 43.50], [-1.43, 43.85],
  [-1.25, 44.50], [-1.25, 44.65], [-1.15, 45.55], [-1.25, 45.75], [-1.15, 46.0], [-1.15, 46.16],
  [-1.45, 46.35], [-1.80, 46.50], [-2.15, 46.85], [-2.0, 47.05], [-2.2, 47.15], [-2.55, 47.30],
  [-2.85, 47.50], [-3.10, 47.50], [-3.50, 47.70], [-3.90, 47.85], [-4.37, 47.80], [-4.55, 48.0],
  [-4.73, 48.04], [-4.30, 48.10], [-4.55, 48.25], [-4.78, 48.35], [-4.75, 48.55], [-4.55, 48.63],
  [-4.0, 48.72], [-3.45, 48.82], [-3.0, 48.80], [-2.75, 48.55], [-2.32, 48.68], [-2.0, 48.65],
  [-1.51, 48.64], [-1.57, 48.85], [-1.60, 49.20], [-1.85, 49.65], [-1.94, 49.72], [-1.60, 49.65],
  [-1.27, 49.68], [-1.15, 49.35], [-0.60, 49.35], [-0.25, 49.30], [0.23, 49.42], [0.10, 49.50],
  [0.20, 49.70], [0.65, 49.87], [1.10, 49.93], [1.40, 50.07], [1.55, 50.25], [1.60, 50.50],
  [1.58, 50.72], [1.60, 50.87], [1.85, 50.95]
];

export const CONTOUR_CORSE = [
  [9.40, 43.0], [9.55, 42.70], [9.40, 42.0], [9.25, 41.40], [8.85, 41.60], [8.60, 42.0], [8.60, 42.40], [9.10, 42.70]
];
