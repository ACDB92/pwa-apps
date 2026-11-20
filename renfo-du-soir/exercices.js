// Renfo du soir — le catalogue : zones, exercices, échelles de variantes, consignes et poses des schémas.
// Tapis seul : ni chaise, ni mur, ni marche (un test le garde).
//
// Une famille = un exercice du circuit, avec son échelle de variantes (de la plus facile à la plus dure)
// et `depart` = la variante de départ pour une reprise. Champs :
//   muscles  ce qui travaille (affiché)          cible  les segments teintés sur le schéma
//   voix     la consigne dite à mi-effort        erreur l'erreur à éviter (affichée)
//   tenu     position tenue (pas de répétitions) unilateral  on change de côté à mi-temps
//
// Équilibre (audit du 20/11/2026) : en haut, autant de tirage que de poussée possible sans barre ; en
// gainage, les trois familles (contre l'extension, l'inclinaison et la rotation) ; en bas, quadriceps,
// fessiers et ischios.
//
// Poses (dessinées par schema.js) : vue de profil, tournée vers la droite. Angles en degrés :
// 0 = vers la droite, 90 = vers le bas, 180 = vers la gauche, -90 = vers le haut.
//   t    : bassin → épaules          dos  : courbure du dos (+ arrondi, − creusé)
//   tete : écart de la tête par rapport au tronc
//   b    : [près, loin] épaule → coude    ab : coude → main
//   c    : [près, loin] bassin → genou    tb : genou → cheville     p : cheville → orteils (facultatif)
// Le membre « près » est dessiné en plein, le « loin » en clair ; `vue: 'face'` les dessine pareil
// (planche latérale, relevés), `vue: 'dessus'` aussi, sans sol (Y-T vu de dessus). Le point le plus bas est posé au sol ; `ancre` garde fixe à
// l'horizontale le pied, la main, le bassin ou l'épaule pendant le mouvement.

export const ZONES = {
  haut: { nom: 'Haut du corps', court: 'Haut', couleur: '#F2683C', clair: '#FFE4D8' },
  bas: { nom: 'Bas du corps', court: 'Bas', couleur: '#3B6FF5', clair: '#DDE6FF' },
  gainage: { nom: 'Gainage', court: 'Gainage', couleur: '#14A37F', clair: '#D3F3E8' },
};

/** Le cycle des soirs : chaque zone récupère 48 h avant de retravailler. */
export const CYCLE = ['haut', 'bas', 'gainage'];

// ── Poses de base ────────────────────────────────────────────────────────────

const DEBOUT = { t: -90, b: [90, 90], ab: [90, 90], c: [90, 90], tb: [90, 90] };
const QUATRE_PATTES = { t: -20, b: [90, 90], ab: [90, 90], c: [90, 90], tb: [180, 180] };
const SUR_LE_VENTRE = { t: 0, b: [0, 0], ab: [0, 0], c: [180, 180], tb: [180, 180] };
const PONT_BAS = { t: 180, tete: 0, b: [0, 0], ab: [0, 0], c: [-50, -50], tb: [100, 100] };
const PONT_HAUT = { t: 160, tete: 20, b: [10, 10], ab: [0, 0], c: [-22, -22], tb: [100, 100] };

// ── Les familles du circuit ──────────────────────────────────────────────────

export const FAMILLES = {
  // Haut du corps : deux poussées, trois pour le dos
  pompes: {
    zone: 'haut', nom: 'Pompes', muscles: 'pectoraux, triceps, épaules', cible: ['poitrine', 'bras'],
    depart: 0,
    variantes: [
      'Pompes sur les genoux',
      'Pompes négatives (descends en 3 s, remonte sur les genoux)',
      'Pompes',
      'Pompes lentes (3 s pour descendre)',
      'Pompes diamant (mains rapprochées)',
    ],
    consignes: ['Mains sous les épaules, un peu plus larges', 'Le corps en planche, de la tête aux pieds', 'La poitrine descend jusqu’à frôler le sol'],
    voix: 'Gaine le ventre, descends lentement.',
    erreur: 'Les fesses qui pointent ou le bas du dos qui creuse.',
    ancre: 'pied',
    poses: [
      { t: -26, b: [90, 90], ab: [90, 90], c: [154, 154], tb: [154, 154] },
      { t: -12, b: [170, 170], ab: [55, 55], c: [168, 168], tb: [168, 168] },
    ],
  },
  tirage: {
    zone: 'haut', nom: 'Tirage en W allongé', muscles: 'dos, arrière des épaules', cible: ['poitrine', 'bras'],
    depart: 0,
    variantes: [
      'Tirage en W allongé',
      'Tirage en W, 2 s serré en bas',
      'Tirage en W, poitrine décollée tout du long',
      'Tirage en W lent (3 s pour tirer, 3 s pour tendre)',
    ],
    consignes: ['Sur le ventre, bras tendus devant, décollés du sol', 'Tire les coudes vers les côtes, les mains font un W', 'Serre les omoplates en bas, puis retends'],
    voix: 'Coudes vers les côtes, serre les omoplates.',
    erreur: 'Hausser les épaules vers les oreilles.',
    ancre: 'hanche',
    poses: [
      { t: -8, tete: 5, b: [-12, -12], ab: [-12, -12], c: [180, 180], tb: [180, 180] },
      { t: -10, tete: 5, b: [172, 172], ab: [-40, -40], c: [180, 180], tb: [180, 180] },
    ],
  },
  pike: {
    zone: 'haut', nom: 'Pompes piquées', muscles: 'épaules, triceps', cible: ['epaule', 'bras'],
    depart: 0,
    variantes: [
      'Pike tenu, fesses hautes',
      'Pompes piquées',
      'Pompes piquées, mains plus proches des pieds',
      'Pompes piquées lentes (3 s pour descendre)',
    ],
    consignes: ['Fesses hautes, le corps en V à l’envers', 'Le sommet du crâne descend entre les mains', 'Les coudes partent vers l’arrière, pas sur les côtés'],
    voix: 'Fesses hautes, le crâne vers le sol.',
    erreur: 'Descendre le menton au lieu du sommet de la tête.',
    ancre: 'pied',
    poses: [
      { t: 25, tete: 10, b: [50, 50], ab: [50, 50], c: [116, 116], tb: [116, 116] },
      { t: 45, tete: 0, b: [25, 25], ab: [34, 34], c: [116, 116], tb: [116, 116] },
    ],
  },
  yt: {
    zone: 'haut', nom: 'Y-T allongé', muscles: 'haut du dos, posture', cible: ['epaule', 'poitrine'],
    depart: 0, vue: 'dessus',
    variantes: [
      'Y-T allongé',
      'Y-T-W allongé',
      'Y-T-W, 2 s tenu à chaque lettre',
    ],
    consignes: ['Sur le ventre, front au sol (vu de dessus)', 'Bras en Y, pouces vers le ciel : décolle-les', 'Puis en T : serre les omoplates'],
    voix: 'Pouces vers le ciel, serre les omoplates.',
    erreur: 'Tirer avec les lombaires : seuls les bras et la poitrine bougent.',
    ancre: 'hanche',
    poses: [
      { t: -90, b: [-60, -120], ab: [-60, -120], c: [96, 84], tb: [90, 90] },
      { t: -90, b: [0, 180], ab: [0, 180], c: [96, 84], tb: [90, 90] },
    ],
  },
  superman: {
    zone: 'haut', nom: 'Superman', muscles: 'dos, lombaires', cible: ['tronc'],
    depart: 0,
    variantes: [
      'Superman alterné (bras et jambe opposés)',
      'Superman, bras et jambes ensemble',
      'Superman tenu 3 s en haut',
      'Nageur (bras et jambes battent en l’air)',
    ],
    consignes: ['Allongé sur le ventre, bras tendus devant', 'Décolle bras, poitrine et jambes ensemble', 'Le regard vers le sol, la nuque longue'],
    voix: 'Le regard vers le sol, la nuque longue.',
    erreur: 'Lever la tête pour regarder devant : la nuque se casse.',
    ancre: 'hanche',
    poses: [
      { ...SUR_LE_VENTRE },
      { t: -10, dos: -12, tete: 5, b: [-14, -14], ab: [-14, -14], c: [-172, -172], tb: [-172, -172] },
    ],
  },

  // Bas du corps : debout d'abord, au sol ensuite
  squat: {
    zone: 'bas', nom: 'Squat', muscles: 'cuisses, fessiers', cible: ['cuisse', 'fesse'],
    depart: 1,
    variantes: [
      'Demi-squat',
      'Squat',
      'Squat avec 2 s de pause en bas',
      'Squat lent (3 s pour descendre, 3 s pour monter)',
      'Squat sauté',
    ],
    consignes: ['Pieds largeur d’épaules', 'Les fesses partent en arrière, comme pour s’asseoir', 'Les genoux suivent la pointe des pieds'],
    voix: 'Les talons au sol, les genoux suivent les pieds.',
    erreur: 'Les talons qui décollent ou les genoux qui rentrent.',
    ancre: 'pied',
    poses: [
      { ...DEBOUT, b: [0, 0], ab: [0, 0] },
      { t: -55, b: [0, 0], ab: [0, 0], c: [5, 5], tb: [110, 110] },
    ],
  },
  fentes: {
    zone: 'bas', nom: 'Fentes', muscles: 'cuisses, fessiers, équilibre', cible: ['cuisse', 'fesse'],
    depart: 0, unilateral: true,
    variantes: [
      'Fente statique',
      'Fente arrière alternée',
      'Fente avant alternée',
      'Fente sautée alternée',
    ],
    consignes: ['Un grand pas, buste droit', 'Le genou arrière descend vers le sol', 'Le genou avant reste au-dessus de la cheville'],
    voix: 'Buste droit, le genou arrière vers le sol.',
    erreur: 'Le genou avant qui dépasse loin devant les orteils.',
    ancre: 'pied',
    poses: [
      { t: -90, b: [90, 90], ab: [90, 90], c: [25, 128], tb: [82, 141] },
      { t: -90, b: [90, 90], ab: [90, 90], c: [5, 120], tb: [92, 168] },
    ],
  },
  pont: {
    zone: 'bas', nom: 'Pont fessier', muscles: 'fessiers, ischios', cible: ['fesse'],
    depart: 0,
    variantes: [
      'Pont fessier',
      'Pont fessier, 2 s de pause en haut',
      'Pont sur une jambe',
      'Pont sur une jambe, 2 s de pause en haut',
    ],
    consignes: ['Sur le dos, pieds à plat près des fesses', 'Pousse dans les talons, monte le bassin', 'En haut, serre les fessiers'],
    voix: 'Pousse dans les talons, serre les fessiers.',
    erreur: 'Cambrer le bas du dos au lieu de serrer les fessiers.',
    ancre: 'pied',
    poses: [PONT_BAS, PONT_HAUT],
  },
  releves: {
    zone: 'bas', nom: 'Relevés de jambe sur le côté', muscles: 'fessiers, hanches', cible: ['fesse'],
    depart: 0, unilateral: true, vue: 'face',
    variantes: [
      'Relevés de jambe sur le côté',
      'Relevés lents (3 s pour descendre)',
      'Relevés, 2 s tenu en haut',
      'Petits cercles, jambe tendue en l’air',
    ],
    consignes: ['Allongé sur le côté, la tête sur le bras, la jambe du dessous pliée', 'Monte la jambe du dessus, tendue, pointe vers l’avant', 'Change de côté à mi-temps'],
    voix: 'La pointe du pied vers l’avant, le bassin ne bascule pas.',
    erreur: 'Basculer le bassin vers l’arrière pour monter plus haut.',
    ancre: 'hanche',
    poses: [
      { t: 180, tete: -12, b: [10, 168], ab: [10, -30], c: [-3, 25], tb: [-3, -30] },
      { t: 180, tete: -12, b: [10, 168], ab: [10, -30], c: [-38, 25], tb: [-38, -30] },
    ],
  },
  marche: {
    zone: 'bas', nom: 'Marche des talons en pont', muscles: 'ischios, fessiers', cible: ['cuisse', 'fesse'],
    depart: 0,
    variantes: [
      'Pont tenu, pieds un peu plus loin',
      'Marche des talons (2 petits pas aller, 2 retour)',
      'Marche des talons, jusqu’aux jambes presque tendues',
      'Marche des talons lente (2 s par pas)',
    ],
    consignes: ['Monte en pont, bassin haut', 'Éloigne les talons à petits pas, sans laisser tomber le bassin', 'Reviens de la même façon'],
    voix: 'Le bassin reste haut, petits pas.',
    erreur: 'Le bassin qui s’affaisse à mesure que les pieds s’éloignent.',
    ancre: 'epaule',
    poses: [
      { ...PONT_HAUT },
      { t: 158, tete: 18, b: [10, 10], ab: [0, 0], c: [-12, -12], tb: [50, 50] },
    ],
  },

  // Gainage : contre l'extension, l'inclinaison et la rotation
  planche: {
    zone: 'gainage', nom: 'Planche', muscles: 'abdominaux, tout le tronc', cible: ['tronc'],
    depart: 1, tenu: true,
    variantes: [
      'Planche sur les genoux',
      'Planche',
      'Planche, un pied levé à mi-temps',
      'Planche longue (coudes avancés de 10 cm)',
    ],
    consignes: ['Coudes sous les épaules', 'Le corps droit comme une planche', 'Serre les fessiers et le ventre'],
    voix: 'Serre les fessiers, respire.',
    erreur: 'Les fesses trop hautes, ou le dos qui s’affaisse.',
    ancre: 'pied',
    poses: [{ t: -13, b: [90, 90], ab: [0, 0], c: [167, 167], tb: [167, 167] }],
  },
  deadbug: {
    zone: 'gainage', nom: 'Dead bug', muscles: 'abdominaux profonds', cible: ['tronc'],
    depart: 0,
    variantes: [
      'Dead bug, seulement les jambes',
      'Dead bug, bras et jambe opposés',
      'Dead bug lent (3 s par mouvement)',
    ],
    consignes: ['Sur le dos, bras vers le plafond, genoux à 90°', 'Allonge un bras et la jambe opposée', 'Le bas du dos reste collé au sol'],
    voix: 'Le bas du dos collé au sol.',
    erreur: 'Le bas du dos qui décolle : réduis l’amplitude.',
    ancre: 'hanche',
    poses: [
      { t: 180, tete: 0, b: [-90, -90], ab: [-90, -90], c: [-90, -90], tb: [0, 0] },
      { t: 180, tete: 0, b: [-170, -90], ab: [-170, -90], c: [-90, -8], tb: [0, -8] },
    ],
  },
  laterale: {
    zone: 'gainage', nom: 'Planche latérale', muscles: 'obliques, épaules', cible: ['tronc'],
    depart: 0, tenu: true, unilateral: true, vue: 'face',
    variantes: [
      'Planche latérale sur le genou',
      'Planche latérale',
      'Planche latérale, jambe du dessus levée',
    ],
    consignes: ['De côté, sur l’avant-bras, coude sous l’épaule', 'Le bassin haut, l’autre main vers le plafond', 'Change de côté à mi-temps'],
    voix: 'Le bassin haut, pousse le sol avec l’avant-bras.',
    erreur: 'Laisser le bassin tomber vers le sol.',
    ancre: 'pied',
    poses: [{ t: -16, b: [90, -90], ab: [0, -90], c: [164, 158], tb: [164, 164] }],
  },
  ours: {
    zone: 'gainage', nom: 'L’ours, toucher d’épaule', muscles: 'abdominaux, épaules, rotation', cible: ['tronc', 'epaule'],
    depart: 0,
    variantes: [
      'Ours tenu (genoux à 2 cm du sol)',
      'Ours, toucher d’épaule alterné',
      'Ours, toucher d’épaule lent (2 s par main)',
      'Planche bras tendus, toucher d’épaule',
    ],
    consignes: ['À quatre pattes, décolle les genoux de 2 cm', 'Une main vient toucher l’épaule opposée, puis l’autre', 'Le bassin ne tourne pas'],
    voix: 'Le bassin immobile, comme un verre d’eau posé dessus.',
    erreur: 'Le bassin qui se balance à chaque main levée.',
    ancre: 'main',
    poses: [
      { t: -12, b: [90, 90], ab: [90, 90], c: [95, 95], tb: [175, 175] },
      { t: -12, b: [90, 125], ab: [90, -50], c: [95, 95], tb: [175, 175] },
    ],
  },
  birddog: {
    zone: 'gainage', nom: 'Bird dog', muscles: 'lombaires, fessiers, équilibre', cible: ['tronc', 'fesse'],
    depart: 0,
    variantes: [
      'Bird dog, bras ou jambe seul',
      'Bird dog, bras et jambe opposés',
      'Bird dog, 2 s tenu en haut',
      'Bird dog, coude et genou se touchent',
    ],
    consignes: ['À quatre pattes, dos plat', 'Allonge un bras devant et la jambe opposée derrière', 'Le bassin ne bascule pas'],
    voix: 'Allonge-toi, ne monte pas.',
    erreur: 'Lever la jambe trop haut : le dos se creuse.',
    ancre: 'main',
    poses: [
      { ...QUATRE_PATTES },
      { ...QUATRE_PATTES, b: [90, -12], ab: [90, -12], c: [90, -168], tb: [180, -168] },
    ],
  },
};

/** Les 5 exercices du circuit de chaque zone, dans l'ordre de la séance. */
export const CIRCUITS = {
  haut: ['pompes', 'tirage', 'pike', 'yt', 'superman'],
  bas: ['squat', 'fentes', 'pont', 'releves', 'marche'],
  gainage: ['planche', 'deadbug', 'laterale', 'ours', 'birddog'],
};

// ── Échauffement et retour au calme : 4 mouvements de 30 s, choisis pour la zone ──

export const ETAPES_FIXES = {
  // échauffement
  moulinets: {
    nom: 'Moulinets de bras', mi: 'Change de sens',
    consignes: ['Grands cercles, bras tendus', 'Change de sens à mi-temps'], ancre: 'pied',
    poses: [{ ...DEBOUT, b: [-35, -35], ab: [-35, -35] }, { ...DEBOUT, b: [125, 125], ab: [125, 125] }],
  },
  poignets: {
    nom: 'Poignets à quatre pattes',
    consignes: ['Mains à plat, doigts vers l’avant', 'Bascule doucement le poids vers l’avant, puis en arrière'], ancre: 'main',
    poses: [{ ...QUATRE_PATTES }, { ...QUATRE_PATTES, t: -26, b: [70, 70], ab: [70, 70] }],
  },
  scapulaires: {
    nom: 'Pompes d’omoplates',
    consignes: ['En planche bras tendus', 'Rapproche puis écarte les omoplates, bras toujours tendus'], ancre: 'pied',
    poses: [{ t: -26, b: [90, 90], ab: [90, 90], c: [154, 154], tb: [154, 154] }, { t: -23, dos: -8, b: [87, 87], ab: [87, 87], c: [154, 154], tb: [154, 154] }],
  },
  genoux: {
    nom: 'Montées de genoux lentes',
    consignes: ['Monte un genou à hauteur de hanche', 'Alterne, sans sauter'], ancre: 'pied',
    poses: [{ ...DEBOUT }, { ...DEBOUT, b: [120, 60], ab: [110, -20], c: [90, 0], tb: [90, 90] }],
  },
  balanciers: {
    nom: 'Balanciers de jambe', mi: 'Change de jambe',
    consignes: ['Debout, une jambe se balance d’avant en arrière', 'Grand mouvement, sans forcer'], ancre: 'hanche',
    poses: [{ ...DEBOUT, b: [45, 135], ab: [45, 135], c: [135, 90], tb: [120, 90] }, { ...DEBOUT, b: [45, 135], ab: [45, 135], c: [35, 90], tb: [55, 90] }],
  },
  'squats-lents': {
    nom: 'Squats lents',
    consignes: ['Petite amplitude pour commencer', 'Puis un peu plus bas à chaque fois'], ancre: 'pied',
    poses: [{ ...DEBOUT, b: [0, 0], ab: [0, 0] }, { t: -65, b: [0, 0], ab: [0, 0], c: [30, 30], tb: [115, 115] }],
  },
  'ponts-lents': {
    nom: 'Ponts lents',
    consignes: ['Monte le bassin vertèbre par vertèbre', 'Redescends de la même façon'], ancre: 'pied',
    poses: [PONT_BAS, PONT_HAUT],
  },
  'chat-vache': {
    nom: 'Chat-vache',
    consignes: ['À quatre pattes', 'Arrondis le dos en expirant, creuse-le en inspirant'], ancre: 'main',
    poses: [{ ...QUATRE_PATTES, dos: 34, tete: 40 }, { ...QUATRE_PATTES, dos: -30, tete: -40 }],
  },
  // retour au calme
  enfant: {
    nom: 'Posture de l’enfant',
    consignes: ['Assis sur les talons, front vers le sol', 'Bras allongés devant, respire lentement'], ancre: 'pied',
    poses: [{ t: 12, dos: 30, tete: 10, b: [8, 8], ab: [0, 0], c: [20, 20], tb: [180, 180] }],
  },
  pectoraux: {
    nom: 'Étirement des pectoraux',
    consignes: ['Debout, doigts croisés derrière le dos', 'Tends les bras et ouvre la poitrine'], ancre: 'pied',
    poses: [{ ...DEBOUT, t: -94, dos: -6, tete: -8, b: [150, 150], ab: [160, 160] }],
  },
  triceps: {
    nom: 'Étirement des triceps', mi: 'Change de bras',
    consignes: ['Une main dans le dos, par-dessus l’épaule', 'L’autre main pousse doucement le coude'], ancre: 'pied',
    poses: [{ ...DEBOUT, b: [-105, -70], ab: [100, 175] }],
  },
  'poignets-etirement': {
    nom: 'Étirement des poignets',
    consignes: ['À genoux, mains à plat, doigts vers toi', 'Recule doucement les fesses vers les talons'], ancre: 'pied',
    poses: [{ t: -62, b: [80, 80], ab: [95, 95], c: [30, 30], tb: [180, 180] }],
  },
  quadriceps: {
    nom: 'Étirement des quadriceps', mi: 'Change de jambe',
    consignes: ['Debout sur une jambe, attrape la cheville derrière toi', 'Genoux côte à côte, pousse le bassin vers l’avant', 'L’autre bras tendu pour l’équilibre'], ancre: 'pied',
    poses: [{ t: -88, b: [112, -20], ab: [112, -20], c: [105, 90], tb: [-110, 90] }],
  },
  'fente-basse': {
    nom: 'Fente basse', mi: 'Change de jambe',
    consignes: ['Un genou au sol, l’autre pied devant', 'Avance le bassin : l’avant de la hanche s’étire'], ancre: 'hanche',
    poses: [{ t: -92, b: [90, 90], ab: [90, 90], c: [0, 128], tb: [92, 178] }],
  },
  ischios: {
    nom: 'Étirement de l’arrière des cuisses',
    consignes: ['Assis, jambes tendues devant toi', 'Penche-toi vers tes pieds, dos long'], ancre: 'hanche',
    poses: [{ t: -38, dos: 10, tete: 15, b: [28, 28], ab: [20, 20], c: [0, 0], tb: [0, 0] }],
  },
  'genou-poitrine': {
    nom: 'Genou à la poitrine', mi: 'Change de jambe',
    consignes: ['Sur le dos, ramène un genou contre toi', 'Change de jambe à mi-temps'], ancre: 'hanche',
    poses: [{ t: 180, tete: 0, b: [-40, -40], ab: [-5, -5], c: [-130, 0], tb: [-20, 0] }],
  },
  cobra: {
    nom: 'Cobra',
    consignes: ['Sur le ventre, mains sous les épaules', 'Pousse doucement, le bassin reste au sol'], ancre: 'hanche',
    poses: [{ t: -24, dos: -26, tete: -15, b: [105, 105], ab: [40, 40], c: [180, 180], tb: [180, 180] }],
  },
  torsion: {
    nom: 'Torsion allongée', mi: 'Change de côté',
    consignes: ['Sur le dos, bras en croix', 'Laisse tomber les genoux pliés d’un côté, épaules au sol'], ancre: 'hanche',
    poses: [{ t: 180, tete: 0, b: [-90, -90], ab: [-90, -90], c: [-35, -45], tb: [60, 50] }],
  },
};

export const ECHAUFFEMENT = {
  haut: ['moulinets', 'poignets', 'chat-vache', 'scapulaires'],
  bas: ['genoux', 'balanciers', 'squats-lents', 'ponts-lents'],
  gainage: ['genoux', 'moulinets', 'squats-lents', 'chat-vache'],
};

export const RETOUR_AU_CALME = {
  haut: ['enfant', 'pectoraux', 'triceps', 'poignets-etirement'],
  bas: ['quadriceps', 'fente-basse', 'ischios', 'genou-poitrine'],
  gainage: ['enfant', 'cobra', 'genou-poitrine', 'torsion'],
};
