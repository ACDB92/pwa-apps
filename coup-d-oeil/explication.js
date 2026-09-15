// Expliquer un coup en clair : la raison principale d'abord, puis ce que le meilleur coup fait de
// différent du tien. Chaque phrase part d'un fait vérifié — sur l'échiquier (motifs.js) ou dans les
// variantes de Stockfish —, jamais d'une phrase inventée.
//
// Un fait : { cle, signe, poids, texte, predicat, contraste, detail, fen, fleches, cases }
//   signe      +1 bon pour qui joue le coup, −1 mauvais, 0 simple description
//   predicat   le fait avec le coup pour sujet (« quitte ton roque : … ») : de quoi composer une phrase
//   contraste  pour un défaut, ce qu'en dit l'autre coup (« garde ta paire de fous ; Fxc6 la rend »)
//   detail     ce qui distingue deux faits de même clé (la menace parée, le montant du gain)
// Seuls les faits qui distinguent ton coup du meilleur l'expliquent : un défaut partagé n'explique rien.
//
// Une phrase est une suite de morceaux : du texte, et les coups cités, qui gardent de quoi être
// montrés sur l'échiquier — la position juste avant eux et la suite de leur ligne.

import { Chess } from './vendor/chess.js';
import { VALEURS, sanFr, rejouer, bilanVariante, fenCoupNul, winPct, cpBrut } from './coach.js';
import {
  adverse, entre, piecesDe, attaquants, enPrise, fourchette, clouages, decouvertes, matDuCouloir,
  bouclierQuitte, ligneOuverteVersRoi, caseDuCavalierPrise, paireDeFous, pionsDoubles, pionsIsoles,
  piecesNonDeveloppees, centreVise, defensesNouvelles, positionApresEchange, sequenceForcee,
} from './motifs.js';

const NOMS = { p: ['pion', 'm'], n: ['cavalier', 'm'], b: ['fou', 'm'], r: ['tour', 'f'], q: ['dame', 'f'], k: ['roi', 'm'] };
const BONS = ['meilleur', 'excellent', 'bon'];
const EGALITE = 1;   // points de Win% : en deçà, Stockfish tient deux coups pour équivalents
const DESCRIPTIFS = ['echange', 'sacrifice', 'developpement', 'roquer'];   // ce que le coup « est » : dit en premier
const TITRES = {
  meilleur: 'Pourquoi c’est le meilleur coup', excellent: 'Pourquoi c’est bon', bon: 'Pourquoi c’est bon',
  imprecision: 'Pourquoi c’est imprécis', erreur: 'Pourquoi c’est une erreur', gaffe: 'Pourquoi c’est une gaffe',
};

// ── Désigner ─────────────────────────────────────────────────────────────────────────────────

const feminin = type => NOMS[type][1] === 'f';

// « ton cavalier c3 », « sa dame h5 » — ou « le fou b7 » sans point de vue.
export function nommer(piece, sq, joueur = null) {
  const f = feminin(piece.type);
  const determinant = joueur === null ? (f ? 'la' : 'le') : piece.color === joueur ? (f ? 'ta' : 'ton') : (f ? 'sa' : 'son');
  return `${determinant} ${NOMS[piece.type][0]} ${sq}`;
}

export const enumerer = mots => (mots.length < 2 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots.at(-1)}`);

// Une évaluation lisible, du point de vue de celui qui joue : « +0,3 », « mat en 2 ».
export function formaterScore(score) {
  if (!score) return '';
  if (score.type === 'mate') return score.value > 0 ? `mat en ${score.value}` : `mat contre toi en ${-score.value}`;
  const pions = score.value / 100;
  const signe = pions >= 0.05 ? '+' : pions <= -0.05 ? '−' : '';
  return signe + Math.abs(pions).toFixed(1).replace('.', ',');
}

export const formaterChances = score => `${Math.round(winPct(score))} %`;

const majuscule = texte => texte.charAt(0).toUpperCase() + texte.slice(1);
const accorde = (type, mot) => mot + (feminin(type) ? 'e' : '');
const pronomObjet = type => (feminin(type) ? 'la' : 'le');
const pronomSujet = type => (feminin(type) ? 'elle' : 'il');
const possessif = (type, mien) => (mien ? (feminin(type) ? 'ta' : 'ton') : (feminin(type) ? 'sa' : 'son'));
const sanDe = coup => (coup.color === 'b' ? '…' : '') + sanFr(coup.san);
const uciDe = coup => coup.from + coup.to + (coup.promotion ?? '');
const casePrise = coup => (coup.flags.includes('e') ? coup.to[0] + coup.from[1] : coup.to);
const points = n => `${n} point${n > 1 ? 's' : ''}`;
const fois = n => (n === 1 ? 'une fois' : n === 2 ? 'deux fois' : `${n} fois`);
const fleche = (de, vers, type) => ({ de, vers, type });
const versObjet = uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });

// ── Phrases et coups cités ───────────────────────────────────────────────────────────────────

// Gabarit de phrase : `p\`…${coupCite}…\`` rend des morceaux — le texte fusionné, les coups gardés
// tels quels, les tableaux de morceaux aplatis.
function p(chaines, ...valeurs) {
  const morceaux = [];
  const pousser = v => {
    if (Array.isArray(v)) v.forEach(pousser);
    else if (v && typeof v === 'object') morceaux.push(v);
    else if (v != null && v !== false && v !== '') {
      if (typeof morceaux.at(-1) === 'string') morceaux[morceaux.length - 1] += String(v);
      else morceaux.push(String(v));
    }
  };
  chaines.forEach((chaine, i) => {
    pousser(chaine);
    if (i < valeurs.length) pousser(valeurs[i]);
  });
  return morceaux;
}

export const lire = morceaux => morceaux.map(m => (typeof m === 'string' ? m : m.san)).join('');
const entrecouper = refs => refs.filter(Boolean).flatMap((r, i) => (i ? [' ', r] : [r]));

// Le coup n° `index` d'une ligne, cité : la position juste avant lui et la suite, pour le montrer.
// `role` : joue (ton coup), propose (un coup à jouer), punit (ce que fait l'adversaire), suite.
function citer(fen, pv, index, role) {
  const { coups, fens } = rejouer(fen, pv.slice(0, index + 8));
  const coup = coups[index];
  if (!coup) return null;
  return {
    san: sanDe(coup), role,
    fen: index === 0 ? fen : fens[index - 1],
    variante: coups.slice(index).map((c, i) => ({ uci: uciDe(c), san: sanFr(c.san), couleur: c.color, fen: fens[index + i] })),
  };
}

const constat = (morceaux, fen = null, fleches = [], cases = []) => ({ texte: lire(morceaux), morceaux, fen, fleches, cases });
const constatDe = (fait, morceaux) => constat(morceaux, fait?.fen ?? null, fait?.fleches ?? [], fait?.cases ?? []);

// ── Les faits d'un coup ──────────────────────────────────────────────────────────────────────

// `genre` : joue (le coup joué) ou meilleur (un coup à proposer) — il décide du rôle des coups cités.
// `sacrificeCorrect` : Stockfish juge ce coup aussi bon que le meilleur, donc le matériel qu'il donne
// dans la variante est un sacrifice, pas une perte.
function faitsDuCoup({ fen, uci, ligne, menace, genre, sacrificeCorrect }) {
  const avant = new Chess(fen);
  const joueur = avant.turn();
  const apres = new Chess(fen);
  const coup = apres.move(versObjet(uci));
  const roque = coup.flags.includes('k') || coup.flags.includes('q');
  const joue = genre === 'joue';
  const role = i => (i === 0 ? (joue ? 'joue' : 'propose') : i % 2 === 0 ? (joue ? 'suite' : 'propose') : (joue ? 'punit' : 'suite'));
  const citerLigne = i => citer(fen, ligne.pv, i, role(i));
  const sujet = { san: sanDe(coup), ref: citerLigne(0), pronom: pronomSujet(coup.piece) };
  const { coups, fens } = rejouer(fen, ligne.pv.slice(0, 12));
  const sequence = sequenceForcee(fen, ligne.pv);
  const ctx = { fen, avant, apres, coup, joueur, sujet, ligne, coups, fens, menace, sequence, citer: citerLigne };
  const faits = [];
  const ajouter = fait => {
    if (!fait) return;
    faits.push({
      signe: 0, poids: 1, detail: '', fen: apres.fen(), fleches: [fleche(coup.from, coup.to, 'coup')], cases: [],
      ...fait,
      texte: fait.texte ?? p`${sujet.ref} ${fait.predicat}.`,
    });
  };

  const mat = faitMat(ctx);
  ajouter(mat);
  const net = mat ? 0 : sequence.bilan;
  if (net < 0 && sacrificeCorrect) {
    ajouter({ cle: 'sacrifice', predicat: p`sacrifie ${points(-net)} de matériel : Stockfish juge le sacrifice correct` });
  } else if (net < 0) {
    ajouter(faitPerte({ ...ctx, net }));
    ajouter(faitDefenseRetiree(ctx));
  } else if (net > 0) {
    ajouter(faitGain({ ...ctx, net }));
  } else if (!mat && coup.captured) {
    ajouter({ cle: 'echange', predicat: echange(coup), cases: [coup.to] });
  }
  const parade = faitParade(ctx);
  ajouter(parade);
  const menaceCreee = faitMenaceCreee(ctx);
  ajouter(menaceCreee);
  if (roque) ajouter({ cle: 'roquer', signe: 1, poids: 3, predicat: p`met ton roi à l’abri` });
  const actif = Boolean(mat || net || coup.captured || parade || menaceCreee || coup.san.includes('+'));
  for (const fait of faitsDePosition({ ...ctx, actif })) ajouter(fait);
  return { sujet, faits };
}

// Le mat que donne ce coup, ou celui qu'il permet.
function faitMat({ ligne, coups, fens, citer: citerLigne }) {
  if (ligne.score.type !== 'mate' || ligne.score.value === 0) return null;
  const iMat = fens.findIndex(f => new Chess(f).isCheckmate());
  if (iMat < 0) return null;
  const n = Math.abs(ligne.score.value);
  const couloir = matDuCouloir(new Chess(fens[iMat]));
  const dernier = coups[iMat];
  const suite = de => entrecouper(coups.slice(de, iMat + 1).map((_, k) => citerLigne(de + k)));
  const base = { cle: 'mat', poids: 100, fen: fens[iMat], fleches: [fleche(dernier.from, dernier.to, 'attaque')], cases: couloir ? [couloir.roi.case, ...couloir.pions] : [] };
  if (ligne.score.value > 0) {
    const son = couloir ? `son roi ${couloir.roi.case} est enfermé par ses pions ${enumerer(couloir.pions)}` : '';
    return {
      ...base, signe: 1,
      predicat: iMat === 0 ? p`fait mat${couloir ? ` : ${son}` : ''}` : p`force le mat en ${n} : ${suite(0)}${couloir ? ` — ${son}` : ''}`,
    };
  }
  const ton = couloir ? `ton roi ${couloir.roi.case} est enfermé par tes pions ${enumerer(couloir.pions)}` : '';
  return {
    ...base, signe: -1,
    texte: iMat === 1 ? p`${suite(1)} fait mat${couloir ? ` : ${ton}` : ''}.` : p`Ton coup permet un mat en ${n} : ${suite(1)}${couloir ? ` — ${ton}` : ''}.`,
  };
}

// La pièce que ton coup laisse prendre, et pourquoi elle tombe.
function faitPerte({ fen, coup, joueur, sequence: { coups, fens }, net, citer: citerLigne }) {
  const adv = adverse(joueur);
  const base = { cle: 'materiel', signe: -1, poids: 10 * -net, detail: String(net) };
  const iPrise = coups.findIndex((c, i) => i > 0 && c.color === adv && c.captured);
  if (iPrise < 0) return { ...base, texte: p`Ton coup perd ${points(-net)} de matériel.`, fen: fens.at(-1) };
  const prise = coups[iPrise];
  const sq = casePrise(prise);
  const piece = { type: prise.captured, color: joueur };
  const nom = majuscule(nommer(piece, sq));
  const le = pronomObjet(piece.type);
  const preneur = citerLigne(iPrise);
  const motif = motifQuiPrepare({ coups, fens, jusqua: iPrise, cible: sq, joueur, citerLigne });
  if (motif) return { ...base, texte: p`${motif.texte} : ${nommer(piece, sq)} tombe.`, fen: motif.fen, fleches: motif.fleches, cases: [sq] };

  const avantPrise = new Chess(fens[iPrise - 1]);
  const att = attaquants(avantPrise, sq, adv);
  const def = attaquants(avantPrise, sq, joueur);
  const fleches = [...att.map(a => fleche(a.case, sq, 'attaque')), ...def.map(d => fleche(d.case, sq, 'defense'))];
  const vue = { ...base, fen: fens[iPrise - 1], fleches, cases: [sq] };
  if (coup.from !== sq && coup.to !== sq && enPrise(new Chess(fenCoupNul(fen)), sq)) {
    return { ...vue, texte: p`${nom} était ${accorde(piece.type, 'attaqué')} et le reste : ${preneur} ${le} prend.` };
  }
  if (!def.length) return { ...vue, texte: p`${nom} tombe : ${preneur} ${le} prend, rien ne ${le} défend.` };
  if (VALEURS[prise.piece] < VALEURS[piece.type]) return { ...vue, texte: p`${nom} tombe : ${preneur} ${le} prend.` };
  return { ...vue, texte: p`${nom} tombe : ${accorde(piece.type, 'attaqué')} ${fois(att.length)}, ${accorde(piece.type, 'défendu')} ${fois(def.length)}.` };
}

// Le motif adverse qui prépare la prise en `cible` : fourchette, clouage ou attaque à la découverte.
function motifQuiPrepare({ coups, fens, jusqua, cible, joueur, citerLigne }) {
  for (let i = 1; i < jusqua; i += 2) {
    const c = coups[i];
    const ref = citerLigne(i);
    const pos = new Chess(fens[i]);
    const f = fourchette(pos, c.to);
    if (f && f.cibles.some(x => x.case === cible)) {
      return { texte: p`${ref} attaque à la fois ${enumerer(f.cibles.map(x => nommer(x.piece, x.case, joueur)))}`, fen: fens[i], fleches: f.cibles.map(x => fleche(c.to, x.case, 'attaque')) };
    }
    const cl = clouages(pos, c.to).find(x => x.cloue.case === cible || x.derriere.case === cible);
    if (cl) {
      return { texte: p`${ref} cloue ${nommer(cl.cloue.piece, cl.cloue.case, joueur)} sur ${nommer(cl.derriere.piece, cl.derriere.case, joueur)}`, fen: fens[i], fleches: [fleche(c.to, cl.cloue.case, 'attaque'), fleche(cl.cloue.case, cl.derriere.case, 'coup')] };
    }
    const d = decouvertes(pos, c.from, c.to).find(x => x.cible.case === cible || x.cible.piece.type === 'k');
    if (d) {
      return { texte: p`${ref} découvre l’attaque de ${nommer(d.ouvreur.piece, d.ouvreur.case, joueur)} sur ${nommer(d.cible.piece, d.cible.case, joueur)}`, fen: fens[i], fleches: [fleche(d.ouvreur.case, d.cible.case, 'attaque'), fleche(c.from, c.to, 'coup')] };
    }
  }
  return null;
}

// Ce que ton coup a changé pour permettre la prise : un défenseur parti, une ligne ouverte.
function faitDefenseRetiree({ fen, avant, coup, joueur, sequence: { coups, fens } }) {
  const prise = coups.find((c, i) => i > 0 && c.color === adverse(joueur) && c.captured);
  if (!prise || prise.to === coup.to) return null;
  const base = { cle: 'defense-retiree', signe: -1, poids: 4, cases: [prise.to] };
  const cible = avant.get(prise.to);
  if (cible?.color === joueur && avant.attackers(prise.to, joueur).includes(coup.from) && !new Chess(fens[0]).attackers(prise.to, joueur).includes(coup.to)) {
    return { ...base, predicat: p`abandonne la défense de ${prise.to}`, fen, fleches: [fleche(coup.from, prise.to, 'defense')] };
  }
  if (['b', 'r', 'q'].includes(prise.piece) && entre(prise.from, prise.to).includes(coup.from)) {
    return { ...base, predicat: p`ouvre la ligne de ${nommer({ type: prise.piece, color: adverse(joueur) }, prise.from, joueur)} vers ${prise.to}`, fen: fens[0], fleches: [fleche(prise.from, prise.to, 'attaque')] };
  }
  return null;
}

// Le matériel que gagne ce coup : par un motif qu'il crée, ou en prenant.
function faitGain({ avant, apres, coup, joueur, sequence: { coups }, net }) {
  const adv = adverse(joueur);
  const base = { cle: 'materiel', signe: 1, poids: 10 * net, detail: String(net) };
  const plusTard = coups.filter((c, i) => i > 0 && i % 2 === 0 && c.captured).map(casePrise);
  const tombe = sq => `${nommer({ type: coups.find(c => casePrise(c) === sq && c.color === joueur).captured, color: adv }, sq)} tombe`;
  if (!enPrise(apres, coup.to)) {
    const f = fourchette(apres, coup.to);
    const cibleF = f?.cibles.find(x => plusTard.includes(x.case));
    if (cibleF) return { ...base, predicat: p`attaque à la fois ${enumerer(f.cibles.map(x => nommer(x.piece, x.case, joueur)))} : ${tombe(cibleF.case)}`, fleches: f.cibles.map(x => fleche(coup.to, x.case, 'attaque')), cases: [coup.to] };
    const cl = clouages(apres, coup.to).find(x => plusTard.includes(x.cloue.case) || plusTard.includes(x.derriere.case));
    if (cl) return { ...base, predicat: p`cloue ${nommer(cl.cloue.piece, cl.cloue.case, joueur)} sur ${nommer(cl.derriere.piece, cl.derriere.case, joueur)}`, fleches: [fleche(coup.to, cl.cloue.case, 'attaque'), fleche(cl.cloue.case, cl.derriere.case, 'coup')], cases: [cl.cloue.case] };
    const d = decouvertes(apres, coup.from, coup.to).find(x => plusTard.includes(x.cible.case));
    if (d) return { ...base, predicat: p`découvre l’attaque de ${nommer(d.ouvreur.piece, d.ouvreur.case, joueur)} sur ${nommer(d.cible.piece, d.cible.case, joueur)} : ${tombe(d.cible.case)}`, fleches: [fleche(d.ouvreur.case, d.cible.case, 'attaque'), fleche(coup.from, coup.to, 'coup')], cases: [d.cible.case] };
  }
  if (coup.captured) {
    const sq = casePrise(coup);
    const nom = nommer({ type: coup.captured, color: adv }, sq, joueur);
    const predicat = !avant.attackers(sq, adv).length ? p`prend ${nom}, que rien ne défend`
      : VALEURS[coup.piece] < VALEURS[coup.captured] ? p`prend ${nom} avec une pièce qui vaut moins`
        : p`gagne ${points(net)} à l’échange en ${sq}`;
    return { ...base, predicat, fen: avant.fen(), cases: [sq] };
  }
  return null;   // un gain qui ne vient ni d'une prise ni d'un motif de ce coup : rien à lui attribuer
}

// « échange ton fou contre son cavalier », « échange les dames ».
function echange(coup) {
  if (coup.piece === coup.captured) return p`échange les ${NOMS[coup.piece][0]}s`;
  return p`échange ${possessif(coup.piece, true)} ${NOMS[coup.piece][0]} contre ${possessif(coup.captured, false)} ${NOMS[coup.captured][0]}`;
}

// La menace qui pesait avant ton coup (« si tu passais »), et comment ce coup la pare.
function faitParade({ fen, apres, coup, joueur, menace }) {
  if (!menace?.pv?.length) return null;
  const adv = adverse(joueur);
  const fenNul = fenCoupNul(fen);
  const [t] = rejouer(fenNul, menace.pv.slice(0, 1)).coups;
  if (!t) return null;
  const menaceMat = menace.score.type === 'mate' && menace.score.value > 0;
  const gain = menaceMat ? 0 : bilanVariante(fenNul, menace.pv, adv).bilan;
  if (!menaceMat && gain < 1) return null;

  const refT = citer(fenNul, menace.pv, 0, 'punit');
  const menacant = nommer({ type: t.piece, color: adv }, t.from, joueur);
  let predicat = null;
  if (coup.to === t.from) predicat = p`prend ${menacant}, qui menaçait ${refT}`;
  else if (t.captured && coup.from === casePrise(t)) predicat = p`met ${nommer({ type: coup.piece, color: joueur }, coup.from, joueur)} à l’abri de ${refT}`;
  else if (entre(t.from, t.to).includes(coup.to)) predicat = p`bloque ${refT}`;
  else if (t.captured && VALEURS[t.piece] >= VALEURS[t.captured] && apres.attackers(t.to, joueur).includes(coup.to)) {
    predicat = p`défend ${nommer({ type: t.captured, color: joueur }, t.to, joueur)} contre ${refT}`;
  }
  if (!predicat && menaceMat) {
    const encore = apres.moves({ verbose: true }).find(x => x.from === t.from && x.to === t.to && x.promotion === t.promotion);
    let toujoursMat = false;
    if (encore) {
      apres.move(encore);
      toujoursMat = apres.isCheckmate();
      apres.undo();
    }
    if (!toujoursMat) {
      const roi = piecesDe(apres, joueur).find(x => x.piece.type === 'k').case;
      const fuite = coup.piece === 'p' && Math.abs(coup.from.charCodeAt(0) - roi.charCodeAt(0)) <= 1 && Math.abs(Number(coup.from[1]) - Number(roi[1])) === 1;
      predicat = fuite ? p`donne une case de fuite à ton roi (${coup.from}) contre ${refT}` : p`empêche ${refT}`;
    }
  }
  if (!predicat) return null;
  return {
    cle: 'menace', signe: 1, poids: menaceMat ? 60 : 8 * gain, detail: t.from + t.to, predicat,
    fen, fleches: [fleche(t.from, t.to, 'attaque'), fleche(coup.from, coup.to, 'coup')], cases: [t.to],
  };
}

// La menace que ce coup crée : un mat, ou une pièce attaquée qui doit bouger.
function faitMenaceCreee({ apres, coup, joueur }) {
  if (enPrise(apres, coup.to) || apres.isCheck()) return null;
  const nul = new Chess(fenCoupNul(apres.fen()));
  const mat = nul.moves({ verbose: true }).find(x => {
    nul.move(x);
    const matant = nul.isCheckmate();
    nul.undo();
    return matant;
  });
  if (mat) {
    const refMat = citer(nul.fen(), [uciDe(mat)], 0, 'propose');
    return { cle: 'menace-mat', signe: 1, poids: 12, predicat: p`menace ${refMat}`, fleches: [fleche(mat.from, mat.to, 'attaque')], cases: [mat.to] };
  }
  const f = fourchette(apres, coup.to);
  if (f) return { cle: 'fourchette', signe: 1, poids: 8, predicat: p`attaque à la fois ${enumerer(f.cibles.map(c => nommer(c.piece, c.case, joueur)))}`, fleches: f.cibles.map(c => fleche(coup.to, c.case, 'attaque')), cases: [coup.to] };
  const menacees = piecesDe(apres, adverse(joueur))
    .filter(c => c.piece.type !== 'p' && c.piece.type !== 'k' && apres.attackers(c.case, joueur).includes(coup.to) && enPrise(nul, c.case));
  if (!menacees.length) return null;
  return {
    cle: 'attaque', signe: 1, poids: 3, detail: menacees.map(c => c.case).join(),
    predicat: p`attaque ${enumerer(menacees.map(c => nommer(c.piece, c.case, joueur)))}, qui ${menacees.length > 1 ? 'doivent' : 'doit'} bouger`,
    fleches: menacees.map(c => fleche(coup.to, c.case, 'attaque')), cases: menacees.map(c => c.case),
  };
}

const nouveaux = (avant, apres) => apres.filter(x => !avant.includes(x));

// Les critères de position : roi, pions, pièces, centre, temps.
function faitsDePosition({ fen, avant, apres, coup, joueur, ligne, actif }) {
  const adv = adverse(joueur);
  const faits = [];
  const dameAdverse = piecesDe(apres, adv).some(x => x.piece.type === 'q');

  const bouclier = dameAdverse ? bouclierQuitte(avant, coup) : null;
  if (bouclier) {
    faits.push({ cle: 'roque', signe: -1, poids: 5, predicat: p`quitte ton roque : ton roi ${bouclier.roi} perd un pion protecteur`, contraste: s => p`garde ton roque intact ; ${s} l’affaiblit`, cases: [bouclier.roi] });
  }
  const ligneRoi = ligneOuverteVersRoi(avant, apres, coup);
  if (ligneRoi) {
    const nomLigne = `la ${ligneRoi.type} ${ligneRoi.fin}–${ligneRoi.roi}`;
    faits.push({
      cle: 'ligne-roi', signe: -1, poids: 5,
      predicat: p`ouvre ${nomLigne} vers ton roi`,
      contraste: s => p`garde ton roi à couvert ; ${s} ouvre ${nomLigne}`,
      fleches: [fleche(ligneRoi.fin, ligneRoi.roi, 'attaque')], cases: [ligneRoi.roi],
    });
  }
  const cavalier = caseDuCavalierPrise(avant, coup);
  if (cavalier) faits.push({ cle: 'case-cavalier', signe: -1, poids: 2, predicat: p`prend la case ${coup.to} à ton cavalier ${cavalier.cavalier}`, cases: [coup.to] });

  const fin = positionApresEchange(fen, ligne.pv);
  const vueFin = { fen: fin.fen(), fleches: [] };
  if (paireDeFous(avant, joueur) && !paireDeFous(fin, joueur) && paireDeFous(fin, adv)) {
    faits.push({ ...vueFin, cle: 'paire-fous', signe: -1, poids: 3, predicat: p`rend la paire de fous`, contraste: s => p`garde ta paire de fous ; ${s} la rend` });
  }
  if (paireDeFous(avant, adv) && !paireDeFous(fin, adv) && paireDeFous(fin, joueur)) {
    faits.push({ ...vueFin, cle: 'paire-fous', signe: 1, poids: 3, predicat: p`prend la paire de fous à l’adversaire` });
  }
  const doublesAdv = nouveaux(pionsDoubles(avant, adv), pionsDoubles(fin, adv));
  if (doublesAdv.length) faits.push({ ...vueFin, cle: 'pions-adverses', signe: 1, poids: 2, detail: doublesAdv.join(), predicat: p`double ses pions ${enumerer(doublesAdv)}` });
  const doubles = nouveaux(pionsDoubles(avant, joueur), pionsDoubles(fin, joueur));
  if (doubles.length) faits.push({ ...vueFin, cle: 'pions', signe: -1, poids: 2, detail: doubles.join(), predicat: p`double tes pions ${enumerer(doubles)}`, contraste: s => p`garde tes pions en ordre ; ${s} double tes pions ${enumerer(doubles)}` });
  const colonnesIsolees = chess => [...new Set(pionsIsoles(chess, joueur).map(sq => sq[0]))];
  const isoles = nouveaux(colonnesIsolees(avant), colonnesIsolees(fin));
  if (isoles.length) {
    const cases = pionsIsoles(fin, joueur).filter(sq => isoles.includes(sq[0]));
    faits.push({ ...vueFin, cle: 'pions', signe: -1, poids: 2, detail: `isole ${isoles.join()}`, predicat: p`isole ${cases.length > 1 ? 'tes pions' : 'ton pion'} ${enumerer(cases)}`, cases });
  }

  const ouverture = Number(fen.split(' ')[5]) <= 12;
  const aLaMaison = piecesNonDeveloppees(avant, joueur).map(x => x.case);
  if (ouverture && aLaMaison.includes(coup.from)) {
    faits.push({ cle: 'developpement', signe: 1, poids: 2, predicat: p`se développe` });
  } else if (Number(fen.split(' ')[5]) <= 10 && !actif) {
    const restent = piecesNonDeveloppees(apres, joueur);
    const lent = coup.piece === 'p' ? 'abgh'.includes(coup.from[0]) : coup.piece !== 'k' && !aLaMaison.includes(coup.from);
    if (lent && restent.length >= 2) {
      faits.push({ cle: 'lent', signe: -1, poids: 2, predicat: p`ne développe rien : ${enumerer(restent.map(x => nommer(x.piece, x.case, joueur)))} sont encore chez eux`, cases: restent.map(x => x.case) });
    }
  }

  if (['p', 'n', 'b'].includes(coup.piece) && !coup.captured) {
    const avantCoup = centreVise(avant, coup.from);
    const gagnees = centreVise(apres, coup.to).filter(c => !avantCoup.includes(c) && apres.get(c)?.color !== joueur);
    if (gagnees.length) {
      faits.push({ cle: 'centre', signe: 1, poids: 1, detail: gagnees.join(), predicat: gagnees.length > 1 ? p`contrôle les cases ${enumerer(gagnees)}` : p`contrôle la case ${gagnees[0]}`, fleches: gagnees.map(c => fleche(coup.to, c, 'coup')), cases: gagnees });
    }
  }
  const defendues = defensesNouvelles(avant, apres, coup);
  if (defendues.length) {
    faits.push({
      cle: 'defense', signe: 1, poids: 3, detail: defendues.map(x => x.case).join(),
      predicat: p`défend ${enumerer(defendues.map(x => (x.piece.type === 'p' ? x.case : nommer(x.piece, x.case, joueur))))}`,
      fleches: defendues.map(x => fleche(coup.to, x.case, 'defense')), cases: defendues.map(x => x.case),
    });
  }
  return faits;
}

// ── Choisir et composer ──────────────────────────────────────────────────────────────────────

const trier = faits => [...faits].sort((a, b) => b.poids - a.poids);
const partage = (fait, autres) => autres.some(g => g.cle === fait.cle && g.signe === fait.signe && g.detail === fait.detail);
const simple = predicat => predicat && !lire(predicat).includes(':');

// Une ou deux phrases à partir des faits les plus lourds. Deux prédicats simples se fondent en une
// phrase, ce que le coup « est » en premier (« se développe et défend e5 ») ; sinon la seconde
// phrase reprend le coup par un pronom (« Et il quitte ton roque »), si elle pèse assez.
function composer(sujet, faits, utilises) {
  let [a, b] = faits;
  if (!a) return [];
  utilises.add(a);
  if (b && simple(a.predicat) && simple(b.predicat)) {
    utilises.add(b);
    if (DESCRIPTIFS.includes(b.cle) && !DESCRIPTIFS.includes(a.cle)) [a, b] = [b, a];
    return [constat(p`${sujet.ref} ${a.predicat} et ${b.predicat}.`, a.fen ?? b.fen, [...a.fleches, ...b.fleches], [...a.cases, ...b.cases])];
  }
  const phrases = [constatDe(a, a.texte)];
  if (b && b.poids >= 3) {
    utilises.add(b);
    phrases.push(constatDe(b, b.predicat ? p`Et ${sujet.pronom} ${b.predicat}.` : b.texte));
  }
  return phrases;
}

/**
 * L'explication d'un coup déjà jugé par coach.js :
 *   { titre, raisons, alternative: { san, reference, titre, raisons } | null, details }
 * Chaque raison : { texte, morceaux, fen, fleches: [{ de, vers, type }], cases } — `fen` est la
 * position où la montrer (null : rien à montrer) ; type de flèche : attaque, defense, coup. Les
 * coups des `morceaux` (et `reference`) : { san, role, fen, variante }.
 */
export function expliquer({ fen, coup, lignes, ligneJouee, menace = null, retour }) {
  if (retour.force || !retour.verdict) return null;
  const meilleure = lignes[0];
  const estMeilleur = coup === meilleure.pv[0];
  const bon = BONS.includes(retour.verdict);
  const ecart = cpBrut(meilleure.score) - cpBrut(ligneJouee.score);
  const joue = faitsDuCoup({ fen, uci: coup, ligne: ligneJouee, menace, genre: 'joue', sacrificeCorrect: ecart < 50 });

  // Parmi les coups que Stockfish met à égalité avec le meilleur, on explique celui qui se lit le mieux :
  // le plus de faits favorables qui le distinguent de ton coup.
  let autre = null;
  let ligneAutre = meilleure;
  if (!estMeilleur) {
    const seuil = winPct(meilleure.score) - EGALITE;
    for (const l of lignes.filter(x => x.pv.length && x.pv[0] !== coup && winPct(x.score) >= seuil)) {
      const candidat = faitsDuCoup({ fen, uci: l.pv[0], ligne: l, menace, genre: 'meilleur', sacrificeCorrect: true });
      const lisible = candidat.faits.filter(f => !partage(f, joue.faits)).reduce((total, f) => total + f.signe * f.poids, 0);
      if (!autre || lisible > autre.lisible) {
        autre = { ...candidat, lisible };
        ligneAutre = l;
      }
    }
  }
  const propresJoue = autre ? joue.faits.filter(f => !partage(f, autre.faits)) : joue.faits;
  const propresAutre = autre ? autre.faits.filter(f => !partage(f, joue.faits)) : [];
  const utilises = new Set();
  const nous = joue.sujet.ref;

  let raisons;
  if (bon) {
    const communs = autre ? joue.faits.filter(f => f.signe > 0 && partage(f, autre.faits)) : [];
    raisons = composer(joue.sujet, [...trier(propresJoue.filter(f => f.signe >= 0)), ...trier(communs)], utilises);
    if (!raisons.length) raisons = [constat(estMeilleur ? p`${nous} est le choix de Stockfish, sans critère simple à citer.` : p`${nous} ne perd rien.`)];
  } else {
    raisons = composer(joue.sujet, trier(propresJoue.filter(f => f.signe < 0)), utilises);
    if (!raisons.length) {
      raisons = [constat(propresAutre.some(f => f.signe > 0)
        ? p`${nous} ne perd rien, mais ${joue.sujet.pronom} laisse passer ${autre.sujet.ref}.`
        : p`Rien ne se voit en un coup : l’écart tient à la suite, que Stockfish calcule plus loin.`)];
    }
  }

  let alternative = null;
  if (autre) {
    const lui = autre.sujet.ref;
    const san = autre.sujet.san;
    const titre = !bon ? `Ce qu’il fallait : ${san}` : retour.perte < 1 ? `Aussi bon : ${san}` : `Pourquoi ${san} est un peu mieux`;
    const positifs = trier(propresAutre.filter(f => f.signe > 0));
    let phrases = [];
    if (!bon) {
      const perdait = propresJoue.some(f => f.signe < 0 && f.cle === 'materiel');   // devant un mat, « ne lâche rien » ne veut rien dire
      if (perdait && !propresAutre.some(f => f.signe < 0)) {
        const [top] = positifs;
        if (top) utilises.add(top);
        phrases.push(constatDe(top, simple(top?.predicat) ? p`${lui} ne lâche rien et ${top.predicat}.` : p`${lui} ne lâche rien.`));
        if (top && !simple(top.predicat)) phrases.push(constatDe(top, top.texte));
      } else {
        phrases = composer(autre.sujet, positifs, utilises);
      }
    } else {
      const defaut = retour.perte >= 1 ? trier(propresJoue.filter(f => f.signe < 0 && f.contraste))[0] : null;
      if (defaut) {
        utilises.add(defaut);
        phrases.push(constatDe(defaut, p`${lui} ${defaut.contraste(nous)}.`));
      }
      phrases.push(...composer(autre.sujet, positifs, utilises));
    }
    if (!phrases.length) {
      phrases = [constat(bon
        ? p`Stockfish préfère ${lui} de peu, sans critère simple qui les départage.`
        : p`${lui} tient mieux, sans que la raison se lise en un coup : regarde la suite de Stockfish.`)];
    }
    alternative = { san, reference: lui, titre, raisons: phrases.slice(0, 2) };
  }

  // Détails : le reste de ce qui distingue les deux coups — sans les petits défauts du meilleur.
  const reste = trier([...propresJoue.filter(f => f.signe !== 0), ...propresAutre.filter(f => f.signe > 0)].filter(f => !utilises.has(f)));
  const details = reste.slice(0, 4).map(f => constatDe(f, f.texte));
  if (autre) details.push(constat(p`Évaluation : ${formaterScore(ligneAutre.score)} après ${autre.sujet.ref}, ${formaterScore(ligneJouee.score)} après ${nous}.`));
  return { titre: TITRES[retour.verdict], raisons, alternative, details };
}
