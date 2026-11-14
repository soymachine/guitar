// Lógica de los trucos de lectura: anclas, "cuenta desde el ancla" y frases.
// Todos los "step" son posiciones en el pentagrama (ver staff.js): Mi de la 1ª línea = 30.
import * as T from './theory.js';

const nm = (step) => T.letterName(T.mod(step, 7));
export const stepName = nm;

/**
 * Anclas: las seis cuerdas al aire (escritas una octava por encima de como suenan)
 * más unos pocos refuerzos. Desde cualquiera de ellas, toda nota queda a 2 pasos o menos.
 */
export const ANCHORS = [
  { step: 23, kind: 'open', string: 5 },
  { step: 26, kind: 'open', string: 4 },
  { step: 29, kind: 'open', string: 3 },
  { step: 32, kind: 'open', string: 2 },
  { step: 34, kind: 'open', string: 1 },
  { step: 37, kind: 'open', string: 0 },
  { step: 28, kind: 'extra', tag: 'Do central' },
  { step: 35, kind: 'extra', tag: 'Do' },
  { step: 38, kind: 'extra', tag: 'Fa' },
  { step: 42, kind: 'extra', tag: 'Do agudo' },
];
export const ANCHOR_STEPS = ANCHORS.map((a) => a.step).sort((x, y) => x - y);

const LINE = ['1ª', '2ª', '3ª', '4ª', '5ª'];
const SPACE = ['1er', '2º', '3er', '4º'];
/** Dónde se escribe una nota, con su preposición: "en la 3ª línea", "en el 2º espacio"… */
export function placeText(step) {
  if (step >= 30 && step <= 38) {
    return step % 2 === 0 ? `en la ${LINE[(step - 30) / 2]} línea` : `en el ${SPACE[(step - 31) / 2]} espacio`;
  }
  if (step < 30) {
    if (step === 29) return 'justo debajo de la 1ª línea';
    if (step % 2 === 0) return `en la ${(30 - step) / 2}ª línea adicional inferior`;
    if (step === 23) return 'debajo de la 3ª línea adicional inferior';
    return `entre las líneas adicionales inferiores ${(29 - step) / 2}ª y ${(31 - step) / 2}ª`;
  }
  if (step === 39) return 'justo encima de la 5ª línea';
  if (step % 2 === 0) return `en la ${(step - 38) / 2}ª línea adicional superior`;
  return `entre las líneas adicionales superiores ${(step - 39) / 2}ª y ${(step - 37) / 2}ª`;
}

export function anchorWhere(a) {
  return a.kind === 'open' ? `${T.STRING_ORD[a.string]} cuerda al aire` : placeText(a.step);
}

/** Ancla más cercana: gana la menor distancia, luego las cuerdas al aire y luego la más grave. */
export function nearestAnchor(step) {
  return [...ANCHORS].sort((a, b) =>
    Math.abs(a.step - step) - Math.abs(b.step - step)
    || (a.kind === 'open' ? 0 : 1) - (b.kind === 'open' ? 0 : 1)
    || a.step - b.step)[0];
}

/** "Cuenta desde el ancla": de dónde parto y cuántos pasos hay hasta la nota. */
export function pathFrom(step) {
  const anchor = nearestAnchor(step);
  const delta = step - anchor.step;
  const name = nm(step), anchorName = nm(anchor.step);
  const where = anchorWhere(anchor);
  let text;
  if (delta === 0) text = `${name} es una de tus anclas (${where}).`;
  else {
    const n = Math.abs(delta);
    const dir = delta > 0 ? 'sube' : 'baja';
    text = `Parte de ${anchorName} (${where}) y ${dir} ${n === 1 ? 'un paso' : `${n} pasos`} → ${name}.`
      + (n === 2 ? ' Dos pasos: te saltas una letra.' : '');
  }
  return { anchor, delta, name, anchorName, where, text };
}

/** Intervalo entre dos notas consecutivas del pentagrama, en pasos de letra. */
export function intervalLabel(from, to) {
  const d = to - from;
  if (d === 0) return '= igual';
  const n = Math.abs(d);
  const word = { 1: 'paso', 2: '3ª', 3: '4ª', 4: '5ª', 5: '6ª', 6: '7ª', 7: '8ª' }[n] || `${n + 1}ª`;
  return `${d > 0 ? '↑' : '↓'} ${word}`;
}

/** Frase corta de notas naturales, que empieza en un ancla y avanza por pasos (y terceras si thirds). */
export function makePhrase({ len = 4, lo = 26, hi = 39, thirds = true } = {}) {
  const starts = ANCHOR_STEPS.filter((s) => s >= lo && s <= hi);
  const moves = thirds ? [-2, -1, -1, 1, 1, 2] : [-1, 1];
  for (;;) {
    const out = [T.pick(starts)];
    let guard = 0;
    while (out.length < len && guard++ < 50) {
      const d = T.pick(moves);
      let n = out[out.length - 1] + d;
      if (n < lo || n > hi) n = out[out.length - 1] - d;
      if (n < lo || n > hi || n === out[out.length - 2]) continue; // sin ir y volver a la misma nota
      out.push(n);
    }
    if (out.length === len && new Set(out).size > 1) return out;
  }
}
