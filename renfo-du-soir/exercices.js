// Renfo du soir — le catalogue : zones, exercices, échelles de variantes, consignes et poses des schémas.
// Tapis seul : ni chaise, ni mur, ni marche (un test le garde).
//
// Deux soirs qui alternent (retour de la première séance, 20/11/2026) : « haut du corps + abdos » et
// « bas du corps + abdos ». Chaque séance = 3 exercices de la zone + 2 d'abdos, des exercices
// classiques et dynamiques, connus de tous.
//
// Une famille = un exercice du circuit, avec son échelle de variantes (de la plus facile à la plus dure)
// et `depart` = la variante de départ pour une reprise. Champs :
//   zone     'haut' | 'bas' | 'abdos'            muscles  ce qui travaille (affiché)
//   cible    les segments teintés sur le schéma  voix     la consigne dite à mi-effort
//   erreur   l'erreur à éviter (affichée)        tenu     position tenue (pas de répétitions)
//   unilateral  on change de côté à mi-temps   repere  le repère de rythme (sinon « descends en 2-3 s »)
//
// Poses (dessinées par schema.js) : vue de profil, tournée vers la droite. Angles en degrés :
// 0 = vers la droite, 90 = vers le bas, 180 = vers la gauche, -90 = vers le haut.
//   t    : bassin → épaules          dos  : courbure du dos (+ arrondi, − creusé)
//   tete : écart de la tête par rapport au tronc
//   b    : [près, loin] épaule → coude    ab : coude → main
//   c    : [près, loin] bassin → genou    tb : genou → cheville     p : cheville → orteils (facultatif)
// Le membre « près » est dessiné en plein, le « loin » en clair ; `vue: 'face'` les dessine pareil
// (jumping jacks). Le point le plus bas est posé au sol ; `ancre` garde fixe à l'horizontale le pied,
// la main, le bassin ou l'épaule. Des tests vérifient, image par image, qu'aucun genou ne se plie à
// l'envers et qu'aucune hanche ne sort de ses limites.

export const ZONES = {
  haut: { nom: 'Haut du corps + abdos', court: 'Haut + abdos', couleur: '#F2683C', clair: '#FFE4D8' },
  bas: { nom: 'Bas du corps + abdos', court: 'Bas + abdos', couleur: '#3B6FF5', clair: '#DDE6FF' },
  abdos: { nom: 'Abdos', court: 'Abdos', couleur: '#14A37F', clair: '#D3F3E8' },
};

/** Le cycle des soirs : chaque zone récupère 48 h ; les abdos changent d'exercices un soir sur deux. */
export const CYCLE = ['haut', 'bas'];

// ── Poses de base ────────────────────────────────────────────────────────────

const DEBOUT = { t: -90, b: [90, 90], ab: [90, 90], c: [90, 90], tb: [90, 90] };
const QUATRE_PATTES = { t: -20, b: [90, 90], ab: [90, 90], c: [90, 90], tb: [180, 180] };
const SUR_LE_VENTRE = { t: 0, b: [0, 0], ab: [0, 0], c: [180, 180], tb: [180, 180] };
const PLANCHE_HAUTE = { t: -26, b: [90, 90], ab: [90, 90], c: [154, 154], tb: [154, 154] };
const PLANCHE_COUDES = { t: -13, b: [90, 90], ab: [0, 0], c: [167, 167], tb: [167, 167] };
const PONT_BAS = { t: 180, tete: 0, b: [0, 0], ab: [0, 0], c: [-50, -50], tb: [100, 100] };
const PONT_HAUT = { t: 160, tete: 20, b: [10, 10], ab: [0, 0], c: [-22, -22], tb: [100, 100] };

// ── Les familles du circuit ──────────────────────────────────────────────────

export const FAMILLES = {
  // Haut du corps
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
      { ...PLANCHE_HAUTE },
      { t: -12, b: [170, 170], ab: [55, 55], c: [168, 168], tb: [168, 168] },
    ],
  },
  commando: {
    zone: 'haut', nom: 'Planche commando', muscles: 'triceps, épaules, gainage', cible: ['bras', 'tronc'],
    depart: 0,
    variantes: [
      'Planche commando sur les genoux',
      'Planche commando',
      'Planche commando rapide',
      'Planche commando + une pompe en haut',
    ],
    consignes: ['En planche sur les avant-bras', 'Monte bras tendus, une main après l’autre', 'Redescends sur les avant-bras, et change de main de départ'],
    voix: 'Le bassin ne bouge pas, une main après l’autre.',
    repere: 'Un rythme régulier · arrête-toi si le bassin se balance',
    erreur: 'Le bassin qui se balance de gauche à droite.',
    ancre: 'pied',
    poses: [{ ...PLANCHE_COUDES }, { ...PLANCHE_HAUTE }],
  },
  birddog: {
    zone: 'haut', nom: 'Bird dog en ours', muscles: 'dos, fessiers, gainage', cible: ['tronc', 'fesse'],
    depart: 0,
    variantes: [
      'Bird dog en ours, bras seul',
      'Bird dog en ours, bras et jambe opposés',
      'Bird dog en ours, 2 s tenu en haut',
      'Bird dog en ours lent (3 s pour allonger)',
    ],
    consignes: ['Mains sous les épaules, sur la pointe des pieds, genoux décollés de 3 cm', 'Allonge le bras droit devant et la jambe gauche derrière, tendus', 'Reviens, puis change de côté : le dos reste plat, les genoux ne touchent pas'],
    voix: 'Les genoux décollés, le dos plat.',
    repere: 'Allonge en 2 s, reviens en 2 s · arrête-toi si le bassin bascule ou si un genou touche',
    erreur: 'Le bassin qui tourne ou le dos qui se creuse quand la jambe s’allonge.',
    ancre: 'main',
    // appui sur les mains et la pointe des pieds, genoux décollés ; le bras éloigné et la jambe
    // proche s'allongent (opposés), puis on revient
    poses: [
      { t: 6, b: [90, 90], ab: [90, 90], c: [92, 92], tb: [150, 150] },
      { t: 6, b: [90, -10], ab: [90, -10], c: [-176, 92], tb: [-176, 150] },
    ],
  },

  // Bas du corps
  squat: {
    zone: 'bas', nom: 'Squat', muscles: 'cuisses, fessiers', cible: ['cuisse', 'fesse'],
    depart: 1,
    variantes: [
      'Demi-squat',
      'Squat',
      'Squat avec 2 s de pause en bas',
      'Squat sauté',
      'Squat sauté rapide',
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
    zone: 'bas', nom: 'Fentes arrière', muscles: 'cuisses, fessiers, équilibre', cible: ['cuisse', 'fesse'],
    depart: 0,
    variantes: [
      'Fente arrière alternée',
      'Fente avant alternée',
      'Fente arrière + montée de genou',
      'Fente sautée alternée',
    ],
    consignes: ['Un grand pas en arrière, buste droit', 'Le genou arrière descend vers le sol', 'Pousse sur le pied avant pour revenir, puis change de jambe'],
    voix: 'Buste droit, le genou arrière vers le sol.',
    erreur: 'Le genou avant qui part loin devant les orteils.',
    ancre: 'pied',
    poses: [
      { t: -90, b: [90, 90], ab: [90, 90], c: [48, 123], tb: [57, 132] },
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

  // Abdos : deux par soir, différents d'un soir à l'autre
  crunch: {
    zone: 'abdos', nom: 'Crunch vélo', muscles: 'abdominaux, obliques', cible: ['tronc'],
    depart: 0,
    variantes: [
      'Crunch (épaules décollées, pieds au sol)',
      'Crunch vélo lent',
      'Crunch vélo',
      'Crunch vélo, 1 s tenu de chaque côté',
    ],
    consignes: ['Sur le dos, mains derrière la tête, épaules décollées', 'Le coude va vers le genou opposé, l’autre jambe s’allonge', 'Alterne, sans tirer sur la nuque'],
    voix: 'Les épaules décollées, ne tire pas sur la nuque.',
    repere: 'Lentement, en expirant à chaque coude · arrête-toi si la nuque tire',
    erreur: 'Tirer sur la nuque avec les mains.',
    ancre: 'hanche',
    poses: [
      { t: -166, tete: 10, b: [-100, -100], ab: [165, 165], c: [-122, -12], tb: [-32, -12] },
      { t: -166, tete: 10, b: [-100, -100], ab: [165, 165], c: [-12, -122], tb: [-12, -32] },
    ],
  },
  jambes: {
    zone: 'abdos', nom: 'Relevés de jambes', muscles: 'bas des abdominaux', cible: ['tronc'],
    depart: 0,
    variantes: [
      'Relevés de jambes, genoux pliés',
      'Relevés de jambes',
      'Relevés de jambes lents (3 s pour descendre)',
      'Relevés de jambes, bassin décollé en haut',
    ],
    consignes: ['Sur le dos, bras le long du corps', 'Monte les jambes tendues jusqu’à la verticale', 'Redescends sans poser les talons'],
    voix: 'Le bas du dos collé au sol.',
    repere: 'Monte en 1 s, redescends en 3 s · arrête-toi si le dos se creuse',
    erreur: 'Le bas du dos qui se creuse quand les jambes descendent.',
    ancre: 'hanche',
    poses: [
      { t: 180, tete: 0, b: [0, 0], ab: [0, 0], c: [-12, -12], tb: [-12, -12] },
      { t: 180, tete: 0, b: [0, 0], ab: [0, 0], c: [-88, -88], tb: [-88, -88] },
    ],
  },
  mountain: {
    zone: 'abdos', nom: 'Mountain climbers', muscles: 'abdominaux, épaules, cardio', cible: ['tronc'],
    depart: 0,
    variantes: [
      'Mountain climbers lents',
      'Mountain climbers',
      'Mountain climbers rapides',
      'Mountain climbers croisés (genou vers le coude opposé)',
    ],
    consignes: ['En planche bras tendus, mains sous les épaules', 'Ramène un genou vers la poitrine, puis l’autre', 'Le bassin reste bas, comme en planche'],
    voix: 'Le bassin bas, garde le rythme.',
    repere: 'Un rythme que tu tiens jusqu’au bout · arrête-toi si les fesses montent',
    erreur: 'Les fesses qui montent à mesure que ça fatigue.',
    ancre: 'main',
    poses: [
      { ...PLANCHE_HAUTE, c: [62, 154], tb: [150, 154] },
      { ...PLANCHE_HAUTE, c: [154, 62], tb: [154, 150] },
    ],
  },
  planche: {
    zone: 'abdos', nom: 'Planche', muscles: 'abdominaux, tout le tronc', cible: ['tronc'],
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
    poses: [{ ...PLANCHE_COUDES }],
  },
};

/**
 * Les 5 exercices du circuit de chaque soir, dans l'ordre : on alterne la zone et les abdos, pour que
 * le repos de l'un serve à l'autre. Les épaules travaillées en haut ne refont pas la planche le même
 * soir : elle passe le soir du bas.
 */
export const CIRCUITS = {
  haut: ['pompes', 'crunch', 'commando', 'jambes', 'birddog'],
  bas: ['squat', 'mountain', 'fentes', 'planche', 'pont'],
};

// ── Échauffement et retour au calme : 4 mouvements de 30 s, choisis pour la zone ──

export const ETAPES_FIXES = {
  // échauffement
  'jumping-jacks': {
    nom: 'Jumping jacks', vue: 'face',
    consignes: ['Saute en écartant bras et jambes', 'Puis referme, sur un rythme régulier'], ancre: 'hanche',
    poses: [
      { t: -90, b: [80, 100], ab: [86, 94], c: [86, 94], tb: [90, 90], p: [0, 180] },
      { t: -90, b: [-35, -145], ab: [-50, -130], c: [72, 108], tb: [76, 104], p: [0, 180] },
    ],
  },
  moulinets: {
    nom: 'Moulinets de bras', mi: 'Change de sens',
    consignes: ['Grands cercles, bras tendus', 'Change de sens à mi-temps'], ancre: 'pied',
    poses: [{ ...DEBOUT, b: [-35, -35], ab: [-35, -35] }, { ...DEBOUT, b: [125, 125], ab: [125, 125] }],
  },
  poignets: {
    nom: 'Poignets à quatre pattes',
    consignes: ['Mains à plat, doigts vers l’avant', 'Bascule doucement le poids vers l’avant, puis en arrière'], ancre: 'main',
    poses: [{ ...QUATRE_PATTES }, { ...QUATRE_PATTES, c: [110, 110], b: [110, 110], ab: [100, 100] }],
  },
  'chat-vache': {
    nom: 'Chat-vache',
    consignes: ['À quatre pattes', 'Arrondis le dos en expirant, creuse-le en inspirant'], ancre: 'main',
    poses: [{ ...QUATRE_PATTES, dos: 34, tete: 40 }, { ...QUATRE_PATTES, dos: -30, tete: -40 }],
  },
  genoux: {
    nom: 'Montées de genoux',
    consignes: ['Cours sur place en montant les genoux', 'Commence doucement, accélère un peu'], ancre: 'pied',
    poses: [{ ...DEBOUT, b: [60, 120], ab: [-20, 110] }, { ...DEBOUT, b: [120, 60], ab: [110, -20], c: [90, 0], tb: [90, 90] }],
  },
  balanciers: {
    nom: 'Balanciers de jambe', mi: 'Change de jambe',
    consignes: ['Debout, une jambe se balance d’avant en arrière', 'Grand mouvement, sans forcer'], ancre: 'hanche',
    poses: [{ ...DEBOUT, b: [45, 135], ab: [45, 135], c: [135, 90], tb: [150, 90] }, { ...DEBOUT, b: [45, 135], ab: [45, 135], c: [35, 90], tb: [55, 90] }],
  },
  'squats-lents': {
    nom: 'Squats lents',
    consignes: ['Petite amplitude pour commencer', 'Puis un peu plus bas à chaque fois'], ancre: 'pied',
    poses: [{ ...DEBOUT, b: [0, 0], ab: [0, 0] }, { t: -65, b: [0, 0], ab: [0, 0], c: [30, 30], tb: [115, 115] }],
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
  cobra: {
    nom: 'Cobra',
    consignes: ['Sur le ventre, mains sous les épaules', 'Pousse doucement, le bassin reste au sol'], ancre: 'hanche',
    poses: [{ t: -24, dos: -26, tete: -15, b: [105, 105], ab: [40, 40], c: [180, 180], tb: [180, 180] }],
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
};

export const ECHAUFFEMENT = {
  haut: ['jumping-jacks', 'moulinets', 'poignets', 'chat-vache'],
  bas: ['jumping-jacks', 'genoux', 'balanciers', 'squats-lents'],
};

export const RETOUR_AU_CALME = {
  haut: ['enfant', 'pectoraux', 'triceps', 'cobra'],
  bas: ['quadriceps', 'fente-basse', 'ischios', 'genou-poitrine'],
};
