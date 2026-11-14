import { h, segmented, field } from '../ui.js';
import { store } from '../store.js';
import * as T from '../theory.js';
import { createFretboard } from '../fretboard.js';
import { createStaff } from '../staff.js';
import { playMidi } from '../audio.js';
import { listen } from '../pitch.js';
import { runSession, onLeave } from '../quiz.js';
import { readName, readFind, readFromAnchor, readPhrase, micOff } from '../questions.js';
import { placeText } from '../reading.js';
import { runSprint, sprintBest } from '../sprint.js';
import { tricksTab } from './tricks.js';
import { tabs, exerciseCard } from './shared.js';

const LOW = 40, HIGH = 76;

function explorer(host) {
  let acc = 0, sel = null, stopMic = null; // sel: { midi, spelling }
  const staff = createStaff({ notes: [], minWidth: 260, onPick: (step) => pickStep(step) });
  const fb = createFretboard({
    onPick: (s, f) => { const midi = T.midiAt(s, f); setSel(midi, T.spellPc(midi % 12, acc < 0), true); },
  });
  const info = h('div', { class: 'info-panel' });
  const micBtn = h('button', { class: 'btn-ghost', type: 'button', onclick: toggleMic }, '🎙 Escuchar mi guitarra');

  function pickStep(step) {
    let { midi, spelling } = T.stepToNote(step, acc);
    if (midi < LOW || midi > HIGH) ({ midi, spelling } = T.stepToNote(step, 0));
    setSel(midi, spelling, true);
  }
  function setSel(midi, spelling, sound) {
    sel = { midi, spelling };
    if (sound) playMidi(midi);
    draw();
  }
  function draw() {
    if (!sel) {
      staff.update({ notes: [] });
      fb.clear();
      info.replaceChildren(h('p', { class: 'muted' }, 'Pulsa una línea o un espacio del pentagrama — o un punto del mástil — y mira cómo se corresponden.'));
      return;
    }
    const { midi, spelling } = sel;
    const step = T.staffStep(midi, spelling);
    staff.update({ notes: [{ step, acc: spelling.a || undefined, cls: 'ok' }] });
    const pos = T.positionsOfMidi(midi);
    fb.mark(pos.map((p) => ({ ...p, label: T.noteName(spelling), cls: 'root' })));
    info.replaceChildren(h('div', { class: 'info-main' },
      h('div', { class: 'info-note' }, T.noteName(spelling)),
      h('p', {}, `Se escribe ${placeText(step)}.`),
      h('p', {}, `En la guitarra: ${pos.map((p) => `${T.STRING_ORD[p.s]} cuerda ${p.f === 0 ? 'al aire' : 'tr. ' + p.f}`).join(' · ')}`)));
  }
  async function toggleMic() {
    if (stopMic) { stopMic(); stopMic = null; micBtn.textContent = '🎙 Escuchar mi guitarra'; micBtn.classList.remove('live'); return; }
    try {
      stopMic = await listen((m) => {
        if (m === null || m < LOW || m > HIGH || (sel && sel.midi === m)) return;
        setSel(m, T.spellPc(m % 12, acc < 0), false);
      });
      micBtn.textContent = '■ Dejar de escuchar'; micBtn.classList.add('live');
    } catch (err) {
      info.replaceChildren(h('p', { class: 'muted' }, `No he podido abrir el micrófono (${err.message || err.name}).`));
    }
  }
  onLeave(() => { stopMic?.(); stopMic = null; });

  const openStaff = createStaff({
    notes: [[23, '6ª'], [26, '5ª'], [29, '4ª'], [32, '3ª'], [34, '2ª'], [37, '1ª']].map(([step, n]) => ({ step, label: `${T.letterName(T.mod(step, 7))} ${n}` })),
    spacing: 56,
  });

  host.replaceChildren(
    h('div', { class: 'card' },
      h('div', { class: 'toolbar' },
        field('Alteración al pulsar', segmented([{ value: -1, label: '♭' }, { value: 0, label: '♮' }, { value: 1, label: '♯' }], acc, (v) => { acc = v; })),
        micBtn),
      h('div', { class: 'read-top' }, h('div', { class: 'paper' }, staff.el), info),
      h('div', { class: 'fb-scroll' }, fb.el)),
    h('div', { class: 'split' },
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow' }, 'Puntos de anclaje'), h('h2', {}, 'Las seis cuerdas al aire'),
        h('div', { class: 'paper' }, openStaff.el),
        h('p', { class: 'muted' }, 'Si sitúas estas seis, cualquier otra nota queda a un par de pasos de una conocida.')),
      h('div', { class: 'card tips' },
        h('p', { class: 'eyebrow' }, 'Para no perderse'), h('h2', {}, 'Tres ideas'),
        h('ol', {},
          h('li', {}, h('b', {}, 'Líneas, de abajo arriba: '), [2, 4, 6, 1, 3].map(T.letterName).join(' – '), '. ', h('b', {}, 'Espacios: '), [3, 5, 0, 2].map(T.letterName).join(' – '), '.'),
          h('li', {}, h('b', {}, 'La clave de sol señala el Sol: '), 'su espiral abraza la 2ª línea. Es la 3ª cuerda al aire.'),
          h('li', {}, h('b', {}, 'La guitarra suena una octava más grave de lo escrito. '), 'Por eso el Do central se escribe con una línea adicional y lo tocas en la 5ª cuerda, traste 3.')))),
  );
  draw();
}

function practice(host, rerender) {
  let level = store.pref('read.level', 1);
  const go = (title, make) => () => runSession(host, { title, next: make, onExit: rerender, onCleanup: micOff });
  const best = () => sprintBest(Math.min(level, 2));
  host.replaceChildren(
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Ajusta el terreno'),
      h('div', { class: 'toolbar' },
        field('Nivel', segmented([
          { value: 0, label: 'Solo anclas' }, { value: 1, label: 'Primera posición' }, { value: 2, label: 'Hasta el traste 12' }, { value: 3, label: 'Con armadura' },
        ], level, (v) => { level = v; store.setPref('read.level', v); }))),
      h('p', { class: 'muted' }, '«Solo anclas» practica únicamente las cuerdas al aire y tres notas de referencia: el mejor primer paso. «Con armadura» solo afecta a «Nombra la nota». Si necesitas ayuda, cada pregunta tiene su botón de pista (esas respuestas no suman a tu dominio).')),
    h('div', { class: 'ex-grid' },
      exerciseCard('Relámpago · 30 s', `Nombra todas las notas que puedas en 30 segundos. Con el teclado (1–7) vas mucho más rápido. ${best() ? `Récord actual: ${best()}.` : ''}`, 'Empezar', () => runSprint(host, { level, onExit: rerender }), 'mix'),
      exerciseCard('Desde el ancla', 'Te doy una nota conocida y otra al lado. Cuenta los pasos para saber cuál es.', 'Empezar', go('Desde el ancla', () => readFromAnchor({ level }))),
      exerciseCard('Frases cortas', 'Cuatro notas seguidas en el pentagrama. Lee los saltos y tócalas en el mástil, una tras otra.', 'Empezar', go('Frases cortas', () => readPhrase({ level }))),
      exerciseCard('Nombra la nota', 'Aparece una nota en el pentagrama. Tú dices cuál es.', 'Empezar', go('Lectura · nombra la nota', () => readName({ level }))),
      exerciseCard('Del papel al mástil', 'Lee la nota y púlsala en el diapasón, en la octava correcta.', 'Empezar', go('Del papel al mástil', () => readFind({ level }))),
      exerciseCard('Lee y toca', 'Lee la nota y tócala en tu guitarra: el micrófono comprueba la altura.', 'Usar micrófono', go('Lee y toca', () => readFind({ level, mic: true })), 'mic')),
  );
}

export function readingView(view) {
  tabs(view, {
    kicker: '03 · Lectura', title: 'Del pentagrama al mástil',
    lede: 'Leer es reconocer un punto en el papel y saber dónde vive en tu guitarra.',
    prefKey: 'read.tab', explorer, practice,
    extra: { id: 'tricks', label: 'Trucos', render: tricksTab },
  });
}
