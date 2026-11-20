// Renfo du soir — la voix, les bips et l'écran allumé : le guidage sans toucher le téléphone.

let reglages = { voix: true, bips: true };
let audio = null;
let verrou = null;
let voixFr = null;

export function regler(r) { reglages = { ...reglages, ...r }; }

function choisirVoix() {
  if (!('speechSynthesis' in window)) return;
  const toutes = speechSynthesis.getVoices();
  voixFr = toutes.find(v => v.lang === 'fr-FR' && v.localService) || toutes.find(v => v.lang?.startsWith('fr')) || null;
}
if ('speechSynthesis' in window) {
  choisirVoix();
  speechSynthesis.addEventListener?.('voiceschanged', choisirVoix);
}

/** À appeler sur un toucher : le navigateur n'accepte le son qu'après un geste de l'utilisateur. */
export function deverrouiller() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
  if ('speechSynthesis' in window) {
    // une phrase vide « réveille » la synthèse sur Android
    const u = new SpeechSynthesisUtterance('');
    speechSynthesis.speak(u);
  }
}

export function parler(texte, { couper = true } = {}) {
  if (!reglages.voix || !('speechSynthesis' in window) || !texte) return;
  if (couper) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texte);
  u.lang = 'fr-FR';
  if (voixFr) u.voice = voixFr;
  u.rate = 1.02;
  speechSynthesis.speak(u);
}

export function taire() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** 'court' : les 3 dernières secondes ; 'long' : le départ d'un effort ; 'fin' : la fin de séance. */
export function bip(type = 'court') {
  if (!reglages.bips || !audio) return;
  const notes = { court: [[880, 0.12]], long: [[660, 0.12], [990, 0.3]], fin: [[660, 0.15], [880, 0.15], [1320, 0.4]] }[type];
  let t = audio.currentTime + 0.02;
  for (const [freq, dureeNote] of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dureeNote);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dureeNote + 0.02);
    t += dureeNote + 0.04;
  }
}

/** Garde l'écran allumé pendant la séance : écran éteint, la voix et le minuteur s'arrêtent. */
export async function garderEcranAllume(oui) {
  try {
    if (oui && 'wakeLock' in navigator && !verrou) {
      verrou = await navigator.wakeLock.request('screen');
      verrou.addEventListener('release', () => { verrou = null; });
    } else if (!oui && verrou) {
      await verrou.release();
      verrou = null;
    }
  } catch { verrou = null; }
}

export const ecranGarde = () => Boolean(verrou);
