// Pestaña "Trucos" de Lectura: atajos mentales, cada uno con su parte interactiva.
import { h, segmented } from '../ui.js';
import * as T from '../theory.js';
import { createStaff } from '../staff.js';
import { createFretboard } from '../fretboard.js';
import { playMidi, playSequence } from '../audio.js';
import { onLeave } from '../quiz.js';
import { ANCHORS, anchorWhere, placeText, pathFrom, intervalLabel, makePhrase, stepName } from '../reading.js';
import { sprintBest } from '../sprint.js';

const soundOf = (step) => T.stepToNote(step, 0).midi;
const firstPos = (midi) => T.positionsOfMidi(midi).sort((a, b) => a.f - b.f);
const posText = (p) => `${T.STRING_ORD[p.s]} cuerda, ${p.f === 0 ? 'al aire' : 'traste ' + p.f}`;

function trick(n, title, lead, ...body) {
  return h('article', { class: 'card trick' },
    h('div', { class: 'trick-head' },
      h('span', { class: 'trick-n', 'aria-hidden': 'true' }, n),
      h('div', {}, h('h2', {}, title), h('p', { class: 'muted' }, lead))),
    ...body);
}

// ---- 1. Las anclas ----
function anchorsTrick() {
  const open = ANCHORS.filter((a) => a.kind === 'open').sort((x, y) => x.step - y.step);
  const extra = ANCHORS.filter((a) => a.kind === 'extra' && a.step !== 42);
  const staff = createStaff({ notes: [], minWidth: 190 });
  const fb = createFretboard({ onPick: (s, f) => playMidi(T.midiAt(s, f)) });
  const info = h('div', { class: 'info-main' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Anclas' });
  const btns = new Map();

  function select(a, silent = false) {
    const midi = soundOf(a.step);
    if (!silent) playMidi(midi);
    btns.forEach((b, step) => b.setAttribute('aria-pressed', String(step === a.step)));
    staff.update({ notes: [{ step: a.step, cls: 'anchor', label: stepName(a.step) }] });
    fb.mark(firstPos(midi).map((p) => ({ ...p, label: stepName(a.step), cls: p.f === 0 ? 'root' : 'tone' })));
    info.replaceChildren(
      h('div', { class: 'info-note' }, stepName(a.step)),
      h('p', {}, `Se escribe ${placeText(a.step)}.`),
      h('p', {}, a.kind === 'open' ? `Es tu ${T.STRING_ORD[a.string]} cuerda al aire: ya la tienes en los dedos.` : `En la guitarra: ${firstPos(midi).slice(0, 2).map(posText).join(' · ')}.`));
  }
  [...open, ...extra].forEach((a) => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => select(a) },
      a.kind === 'open' ? `${stepName(a.step)} · ${T.STRING_ORD[a.string]}` : a.tag);
    btns.set(a.step, b); chips.append(b);
  });
  select(open[3], true);

  return trick('1', 'Tus cuerdas al aire son las anclas',
    'No memorices 22 notas: memoriza 6 que ya tocas a diario. Del resto, solo necesitas contar.',
    chips,
    h('div', { class: 'read-top' }, h('div', { class: 'paper' }, staff.el), info),
    h('div', { class: 'fb-scroll' }, fb.el),
    h('p', { class: 'muted' }, 'Con las seis cuerdas al aire más el Do central, el Do del tercer espacio y el Fa de la línea superior, cualquier nota del pentagrama queda a dos pasos o menos de una que ya conoces.'));
}

// ---- 2. Líneas y espacios ----
function linesTrick() {
  const lines = [30, 32, 34, 36, 38], spaces = [31, 33, 35, 37];
  const staff = createStaff({ notes: [], minWidth: 250, spacing: 44 });
  let mode = 'all', stop = null;
  const shown = () => (mode === 'lines' ? lines : mode === 'spaces' ? spaces : [...lines, ...spaces].sort((a, b) => a - b));
  function draw() {
    staff.update({ notes: shown().map((s) => ({ step: s, cls: s % 2 === 0 ? 'target' : 'ok', label: stepName(s) })) });
  }
  const play = h('button', {
    class: 'btn', type: 'button',
    onclick: () => { stop?.(); stop = playSequence(shown().map(soundOf), 0.32); },
  }, '▶ Escuchar');
  onLeave(() => stop?.());
  draw();
  return trick('2', 'Primero: ¿línea o espacio?',
    'Antes de buscar el nombre, mira solo si la nota se apoya en una línea o flota en un espacio. Recorta las opciones a la mitad.',
    h('div', { class: 'toolbar' },
      segmented([{ value: 'all', label: 'Todas' }, { value: 'lines', label: 'Líneas' }, { value: 'spaces', label: 'Espacios' }], mode,
        (v) => { mode = v; draw(); }, { label: 'Qué notas ver' }), play),
    h('div', { class: 'paper' }, staff.el),
    h('div', { class: 'lines-legend' },
      h('p', {}, h('i', { class: 'dot', style: 'background:#c56a00' }), h('b', {}, 'Líneas, de abajo arriba: '), lines.map(stepName).join(' – '), '.'),
      h('p', {}, h('i', { class: 'dot', style: 'background:#1d7d6b' }), h('b', {}, 'Espacios: '), spaces.map(stepName).join(' – '), '.')),
    h('p', { class: 'muted' }, 'Inventa una frase con las iniciales de cada serie: la que se te ocurra a ti, aunque sea absurda, se recuerda mejor que cualquiera prestada. Y repítela en voz alta mirando una partitura real.'));
}

// ---- 3. Cuenta desde el ancla ----
function counterTrick() {
  const staff = createStaff({ notes: [], minWidth: 240, spacing: 60, onPick: (step) => set(step) });
  const fb = createFretboard({ onPick: (s, f) => playMidi(T.midiAt(s, f)) });
  const out = h('div', { class: 'info-main' }, h('p', { class: 'muted' }, 'Pulsa en el pentagrama: una línea, un espacio, donde quieras.'));
  function set(step) {
    const p = pathFrom(step), midi = soundOf(step);
    playMidi(midi);
    staff.update({
      notes: p.delta === 0 ? [{ step, cls: 'anchor', label: p.name }]
        : [{ step: p.anchor.step, cls: 'anchor', label: p.anchorName }, { step, cls: 'target', label: p.name }],
    });
    fb.mark(firstPos(midi).map((q) => ({ ...q, label: p.name, cls: 'root' })));
    out.replaceChildren(
      h('div', { class: 'info-note' }, p.name),
      h('p', {}, `Está ${placeText(step)}.`),
      h('p', {}, p.text),
      h('p', { class: 'muted' }, `En la guitarra: ${firstPos(midi).slice(0, 3).map(posText).join(' · ')}.`));
  }
  return trick('3', 'No adivines: cuenta desde el ancla',
    'Busca el ancla más cercana y avanza uno o dos pasos. Uno = la nota vecina (de línea a espacio). Dos = te saltas una letra.',
    h('div', { class: 'read-top' }, h('div', { class: 'paper' }, staff.el), out),
    h('div', { class: 'fb-scroll' }, fb.el));
}

// ---- 4. Una cuerda, una escalera ----
function ladderTrick() {
  let s = 5, stop = null;
  const staff = createStaff({ notes: [], minWidth: 300, spacing: 50 });
  const fb = createFretboard({ onPick: (ss, f) => playMidi(T.midiAt(ss, f)) });
  const gaps = h('p', { class: 'ladder-gaps' });
  const sel = segmented([5, 4, 3, 2, 1, 0].map((x) => ({ value: x, label: `${T.STRING_ORD[x]} cuerda` })), s, (v) => { s = v; draw(); }, { label: 'Cuerda' });
  const play = h('button', { class: 'btn-ghost', type: 'button', onclick: () => { stop?.(); stop = playSequence(naturals().map((f) => T.midiAt(s, f)), 0.28); } }, '▶ Escuchar la escalera');
  onLeave(() => stop?.());
  const naturals = () => Array.from({ length: T.FRETS + 1 }, (_, f) => f).filter((f) => T.isNaturalPc(T.midiAt(s, f) % 12));
  function draw() {
    const frets = naturals();
    staff.update({
      notes: frets.map((f) => {
        const midi = T.midiAt(s, f);
        return { step: T.staffStep(midi, T.spellPc(midi % 12)), label: String(f), cls: f === 0 ? 'anchor' : '' };
      }),
    });
    fb.mark(frets.map((f) => ({ s, f, label: T.pcName(T.midiAt(s, f) % 12), cls: f === 0 ? 'root' : 'tone' })));
    fb.activeStrings(new Set([s]));
    const diffs = frets.slice(1).map((f, i) => f - frets[i]);
    gaps.replaceChildren(
      'Distancias entre notas naturales: ',
      ...diffs.flatMap((d, i) => [h('b', { class: d === 1 ? 'semi' : '' }, d === 1 ? 'S' : 'T'), i < diffs.length - 1 ? ' · ' : '']),
      '  (T = 2 trastes, S = 1 traste)');
  }
  draw();
  return trick('4', 'Una cuerda, una escalera',
    'En cada cuerda, las notas naturales suben de dos en dos trastes… salvo entre Mi–Fa y Si–Do, que van pegadas. Es la única regla que necesitas para pasar del pentagrama al traste.',
    h('div', { class: 'toolbar' }, sel, play),
    h('div', { class: 'paper' }, staff.el),
    gaps,
    h('div', { class: 'fb-scroll' }, fb.el),
    h('p', { class: 'muted' }, 'Los números bajo cada nota del pentagrama son los trastes. Verás que, sea cual sea la cuerda, el dibujo sube escalón a escalón: cada paso en el papel es un tono o un semitono en el mástil.'));
}

// ---- 5. Lee saltos, no nombres ----
function intervalsTrick() {
  let steps = [], stop = null;
  const staff = createStaff({ notes: [], minWidth: 280, spacing: 62 });
  const fb = createFretboard({ onPick: (s, f) => playMidi(T.midiAt(s, f)) });
  const txt = h('p', { class: 'muted' });
  function draw() {
    staff.update({ notes: steps.map((s, i) => ({ step: s, cls: i === 0 ? 'anchor' : '', label: i === 0 ? stepName(s) : intervalLabel(steps[i - 1], s) })) });
    fb.mark(steps.map((s, i) => ({ ...firstPos(soundOf(s))[0], label: String(i + 1), cls: i === 0 ? 'root' : 'tone' })));
    txt.textContent = `Empieza en ${stepName(steps[0])} y lee: ${steps.slice(1).map((s, i) => intervalLabel(steps[i], s)).join(', ')}. Eso es todo lo que tu ojo necesita.`;
  }
  function again() { steps = makePhrase({ len: 5, lo: 26, hi: 39 }); draw(); }
  const play = h('button', { class: 'btn', type: 'button', onclick: () => { stop?.(); stop = playSequence(steps.map(soundOf), 0.4); } }, '▶ Escuchar');
  onLeave(() => stop?.());
  again();
  return trick('5', 'Lee saltos, no nombres',
    'Un lector ágil no nombra cada nota: reconoce el dibujo. Dado un punto de partida, la melodía es una serie de pasos (vecinas) y saltos de tercera (de línea a línea, o de espacio a espacio).',
    h('div', { class: 'toolbar' }, h('button', { class: 'btn-ghost', type: 'button', onclick: again }, '↻ Otra frase'), play),
    h('div', { class: 'paper' }, staff.el),
    txt,
    h('div', { class: 'fb-scroll' }, fb.el),
    h('p', { class: 'muted' }, 'Los números del mástil siguen el orden de la frase. En la primera posición, un paso suele ser un dedo más (o la cuerda de al lado) y una tercera, un dedo salteado.'));
}

// ---- 6. Rutina y hábitos ----
function routineTrick(go) {
  const best = sprintBest(1);
  return trick('6', 'Cinco minutos al día, sin saltarte ninguno',
    'La lectura se entrena con repeticiones cortas y frecuentes: el ojo aprende más en 5 minutos diarios que en una hora el domingo.',
    h('ol', { class: 'routine' },
      h('li', {}, h('b', {}, '1 min · Anclas. '), 'Repasa los seis puntos del truco 1 sin mirar: ¿dónde se escribe cada cuerda al aire?'),
      h('li', {}, h('b', {}, '2 min · Relámpago. '), `Dos rondas de 30 segundos. ${best ? `Tu récord en primera posición: ${best}.` : 'Aún no tienes marca: ponla hoy.'}`),
      h('li', {}, h('b', {}, '2 min · Frases. '), 'Una o dos frases con el mástil: lee los saltos, no los nombres.')),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', onclick: () => go('practice') }, 'Ir a practicar →')),
    h('div', { class: 'habits' },
      h('p', { class: 'eyebrow' }, 'Hábitos que aceleran'),
      h('ul', {},
        h('li', {}, h('b', {}, 'Mira un compás por delante. '), 'Tu ojo debe ir siempre adelantado respecto a la mano.'),
        h('li', {}, h('b', {}, 'Primero el dibujo, luego el nombre. '), '¿Sube o baja? ¿Pasos o saltos? Con eso casi lees sin nombrar.'),
        h('li', {}, h('b', {}, 'Lento y sin parar. '), 'Mejor un tempo con el que no te detengas que uno rápido con tropiezos: no corrijas hacia atrás.'),
        h('li', {}, h('b', {}, 'Lee en voz alta. '), 'Decir los nombres mientras tocas fija la conexión entre papel, nombre y traste.'),
        h('li', {}, h('b', {}, 'Lee en posiciones. '), 'En primera posición cada dedo tiene su traste: dedo 1 = traste 1, y así hasta el 4. Menos buscar, más leer.'),
        h('li', {}, h('b', {}, 'Cuida la octava. '), 'La guitarra suena una octava más grave de lo escrito; si una nota te cuadra pero suena rara, comprueba la octava.'),
        h('li', {}, h('b', {}, 'Tapa la tablatura. '), 'Si la usas, cúbrela una pasada de cada dos: la cabeza se pondrá a leer el pentagrama.'))));
}

export function tricksTab(host, go) {
  host.replaceChildren(
    anchorsTrick(), linesTrick(), counterTrick(), ladderTrick(), intervalsTrick(), routineTrick(go));
}
