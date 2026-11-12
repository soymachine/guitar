// Teoría musical: notas, escalas, tonalidades y afinación de la guitarra.
import { store } from './store.js';

export const mod = (n, m) => ((n % m) + m) % m;
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const LATIN = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const ANGLO = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACC = { '-2': '♭♭', '-1': '♭', 0: '', 1: '♯', 2: '♯♯' };

// Una nota "deletreada": { l: índice de letra 0-6 (C..B), a: alteración -2..2 }
export const N = (l, a = 0) => ({ l, a });
export const pcOf = (n) => mod(LETTER_PC[n.l] + n.a, 12);
export const sameNote = (x, y) => x.l === y.l && x.a === y.a;
const normAcc = (a) => { a = mod(a, 12); return a > 6 ? a - 12 : a; };

export function letterName(l) {
  return (store.settings.notation === 'anglo' ? ANGLO : LATIN)[l];
}
export function noteName(n) {
  return letterName(n.l) + ACC[n.a];
}
export const accSymbol = (a) => ACC[a];

// Deletreo por defecto de las 12 clases de altura
const PC_SHARP = [N(0), N(0, 1), N(1), N(1, 1), N(2), N(3), N(3, 1), N(4), N(4, 1), N(5), N(5, 1), N(6)];
const PC_FLAT = [N(0), N(1, -1), N(1), N(2, -1), N(2), N(3), N(4, -1), N(4), N(5, -1), N(5), N(6, -1), N(6)];
export const isNaturalPc = (pc) => PC_SHARP[pc].a === 0;
export const spellPc = (pc, flat = false) => (flat ? PC_FLAT : PC_SHARP)[mod(pc, 12)];
export function pcName(pc, flat = false) { return noteName(spellPc(pc, flat)); }
/** Nombre completo: "Fa♯ / Sol♭" para teclas negras */
export function pcLabel(pc) {
  return isNaturalPc(pc) ? pcName(pc) : `${pcName(pc)} / ${pcName(pc, true)}`;
}

// ---------- Guitarra ----------
// Cuerdas 1..6 (índice 0 = 1ª cuerda, la más aguda). MIDI que suena.
export const OPEN = [64, 59, 55, 50, 45, 40];
export const FRETS = 12;
export const midiAt = (s, f) => OPEN[s] + f;
export const STRING_ORD = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª'];
export function positionsOfMidi(midi, maxFret = FRETS) {
  const out = [];
  for (let s = 0; s < 6; s++) {
    const f = midi - OPEN[s];
    if (f >= 0 && f <= maxFret) out.push({ s, f });
  }
  return out;
}
export const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- Pentagrama ----------
// La guitarra se escribe una octava por encima de como suena.
// "step" = posición diatónica: C4 = 28, Mi4 (línea inferior) = 30, Fa5 (línea superior) = 38
export function staffStep(soundingMidi, spelling) {
  const natural = soundingMidi + 12 - spelling.a;
  const octave = Math.floor(natural / 12) - 1;
  return octave * 7 + spelling.l;
}
export function stepToNote(step, a = 0) {
  const l = mod(step, 7), octave = Math.floor(step / 7);
  const written = (octave + 1) * 12 + LETTER_PC[l] + a;
  return { spelling: N(l, a), midi: written - 12 };
}

// ---------- Tonalidades ----------
export function majorTonic(fifths) {
  const l = mod(fifths * 4, 7);
  return N(l, normAcc(mod(fifths * 7, 12) - LETTER_PC[l]));
}
export function minorTonic(fifths) {
  const M = majorTonic(fifths);
  const l = mod(M.l + 5, 7);
  return N(l, normAcc(pcOf(M) + 9 - LETTER_PC[l]));
}
export const keyTonic = (fifths, minor) => (minor ? minorTonic(fifths) : majorTonic(fifths));
export function keyName(fifths, minor) {
  return `${noteName(keyTonic(fifths, minor))} ${minor ? 'menor' : 'mayor'}`;
}
export function sigText(fifths) {
  if (!fifths) return 'sin alteraciones';
  const n = Math.abs(fifths);
  return `${n} ${fifths > 0 ? (n > 1 ? 'sostenidos' : 'sostenido') : (n > 1 ? 'bemoles' : 'bemol')}`;
}
export function sigShort(fifths) {
  return fifths ? `${Math.abs(fifths)} ${fifths > 0 ? '♯' : '♭'}` : '0';
}
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // Fa Do Sol Re La Mi Si
export function sigNotes(fifths) {
  const n = Math.abs(fifths);
  const order = fifths > 0 ? SHARP_ORDER : [...SHARP_ORDER].reverse();
  return order.slice(0, n).map((l) => N(l, fifths > 0 ? 1 : -1));
}
/** Alteración que la armadura aplica a una letra */
export function sigAccFor(fifths, l) {
  const hit = sigNotes(fifths).find((n) => n.l === l);
  return hit ? hit.a : 0;
}

// ---------- Escalas ----------
// steps: [grado, semitonos]. fifthsOffset: armadura relativa a la mayor de la misma tónica.
export const SCALES = {
  major: { name: 'Mayor', family: 'major', off: 0, steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 11]] },
  pentMajor: { name: 'Pentatónica mayor', family: 'major', off: 0, steps: [[1, 0], [2, 2], [3, 4], [5, 7], [6, 9]] },
  lydian: { name: 'Lidia', family: 'major', off: 1, steps: [[1, 0], [2, 2], [3, 4], [4, 6], [5, 7], [6, 9], [7, 11]] },
  mixolydian: { name: 'Mixolidia', family: 'major', off: -1, steps: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 10]] },
  minor: { name: 'Menor natural', family: 'minor', off: -3, steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10]] },
  harmonic: { name: 'Menor armónica', family: 'minor', off: -3, steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 11]] },
  melodic: { name: 'Menor melódica', family: 'minor', off: -3, steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 11]] },
  pentMinor: { name: 'Pentatónica menor', family: 'minor', off: -3, steps: [[1, 0], [3, 3], [4, 5], [5, 7], [7, 10]] },
  blues: { name: 'Blues', family: 'minor', off: -3, steps: [[1, 0], [3, 3], [4, 5], [5, 6], [5, 7], [7, 10]] },
  dorian: { name: 'Dórica', family: 'minor', off: -2, steps: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 10]] },
  phrygian: { name: 'Frigia', family: 'minor', off: -4, steps: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10]] },
};
const MAJOR_REF = [0, 0, 2, 4, 5, 7, 9, 11];
/** Devuelve [{note, deg, semis, degLabel}] */
export function spellScale(tonic, scaleId) {
  const tpc = pcOf(tonic);
  return SCALES[scaleId].steps.map(([deg, semis]) => {
    const l = mod(tonic.l + deg - 1, 7);
    const diff = semis - MAJOR_REF[deg];
    return {
      note: N(l, normAcc(tpc + semis - LETTER_PC[l])),
      deg, semis,
      degLabel: (diff < 0 ? '♭' : diff > 0 ? '♯' : '') + deg,
    };
  });
}
export function stepPattern(scaleId) {
  const s = SCALES[scaleId].steps.map((x) => x[1]).concat(12);
  return s.slice(1).map((v, i) => v - s[i]);
}
export const stepLabel = (n) => ({ 1: 'S', 2: 'T', 3: 'T+S' }[n] || n);

// Acordes diatónicos (tríadas)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export function diatonicChords(tonic, scaleId) {
  const sc = spellScale(tonic, scaleId);
  if (sc.length !== 7) return [];
  return sc.map((d, i) => {
    const third = sc[(i + 2) % 7], fifth = sc[(i + 4) % 7];
    const t = mod(pcOf(third.note) - pcOf(d.note), 12), f = mod(pcOf(fifth.note) - pcOf(d.note), 12);
    const q = t === 4 ? (f === 8 ? 'aug' : 'maj') : (f === 6 ? 'dim' : 'min');
    const suffix = { maj: '', min: 'm', dim: '°', aug: '+' }[q];
    const roman = (q === 'maj' || q === 'aug' ? ROMAN[i] : ROMAN[i].toLowerCase()) + (q === 'dim' ? '°' : q === 'aug' ? '+' : '');
    return { root: d.note, quality: q, name: noteName(d.note) + suffix, roman, pcs: [pcOf(d.note), pcOf(third.note), pcOf(fifth.note)] };
  });
}
export const QUALITY_NAME = { maj: 'mayor', min: 'menor', dim: 'disminuido', aug: 'aumentado' };

// Acordes sueltos: tríada mayor/menor, con séptima (♭7) y/o quinta disminuida (♭5) opcionales
export function chordName(root, { minor, seventh, flat5 }) {
  return noteName(root) + (minor ? 'm' : '') + (seventh ? '7' : '') + (flat5 ? '♭5' : '');
}
/** Devuelve [{note, semis, degLabel, role}] apilando terceras desde la fundamental */
export function spellChord(root, { minor, seventh, flat5 }) {
  const tones = [
    [0, 0, '1', 'fundamental'],
    [2, minor ? 3 : 4, minor ? '♭3' : '3', minor ? '3ª menor' : '3ª mayor'],
    [4, flat5 ? 6 : 7, flat5 ? '♭5' : '5', flat5 ? '5ª disminuida' : '5ª justa'],
  ];
  if (seventh) tones.push([6, 10, '♭7', '7ª menor']);
  const rpc = pcOf(root);
  return tones.map(([dl, semis, degLabel, role]) => {
    const l = mod(root.l + dl, 7);
    return { note: N(l, normAcc(rpc + semis - LETTER_PC[l])), semis, degLabel, role };
  });
}

// Escala que corresponde a un acorde (mismas opciones que spellChord)
export function chordScale(root, { minor, seventh, flat5 }) {
  let semis, name;
  if (minor) {
    // La menor natural ya lleva ♭7; con ♭5 pasa a ser la locria (la del acorde m7♭5)
    semis = flat5 ? [0, 1, 3, 5, 6, 8, 10] : [0, 2, 3, 5, 7, 8, 10];
    name = flat5 ? 'locria' : 'menor natural';
  } else {
    semis = [0, 2, 4, 5, flat5 ? 6 : 7, 9, seventh ? 10 : 11];
    name = (seventh ? 'mixolidia' : 'mayor') + (flat5 ? ' ♭5' : '');
  }
  const rpc = pcOf(root);
  const tones = semis.map((sm, i) => {
    const l = mod(root.l + i, 7), diff = sm - MAJOR_REF[i + 1];
    return { note: N(l, normAcc(rpc + sm - LETTER_PC[l])), semis: sm, deg: i + 1, degLabel: (diff < 0 ? '♭' : diff > 0 ? '♯' : '') + (i + 1) };
  });
  const pattern = semis.concat(12).slice(1).map((v, i) => v - semis[i]);
  return { name, tones, pattern };
}

// Las 12 posiciones del círculo de quintas (quintas de la armadura)
export const CIRCLE = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];

export const rand = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rand(arr.length)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
