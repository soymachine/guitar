import { h, segmented, multiChips, field } from '../ui.js';
import { store } from '../store.js';
import * as T from '../theory.js';
import { createFretboard } from '../fretboard.js';
import { createStaff } from '../staff.js';
import { playMidi } from '../audio.js';
import { runSession } from '../quiz.js';
import { fbName, fbFind, micOff } from '../questions.js';
import { tabs, exerciseCard } from './shared.js';

function explorer(host) {
  let mode = store.pref('fb.mode', 'none'), focusPc = 0, sel = null;
  const fb = createFretboard({ onPick: (s, f) => { sel = { s, f }; playMidi(T.midiAt(s, f)); draw(); } });
  const info = h('div', { class: 'info-panel' });
  const pcRow = h('div', { class: 'pc-row' });

  function draw() {
    const marks = new Map();
    const put = (s, f, label, cls) => marks.set(`${s}:${f}`, { s, f, label, cls });
    for (let s = 0; s < 6; s++) for (let f = 0; f <= T.FRETS; f++) {
      const pc = T.midiAt(s, f) % 12;
      if (mode === 'all' || (mode === 'nat' && T.isNaturalPc(pc))) put(s, f, T.pcName(pc), T.isNaturalPc(pc) ? 'tone' : 'tone alt');
      if (mode === 'one' && pc === focusPc) put(s, f, T.pcName(pc), 'tone');
    }
    if (sel) {
      const midi = T.midiAt(sel.s, sel.f), pc = midi % 12;
      for (let s = 0; s < 6; s++) for (let f = 0; f <= T.FRETS; f++) {
        const m = T.midiAt(s, f);
        if (m % 12 !== pc) continue;
        put(s, f, T.pcName(pc), m === midi ? 'same' : 'oct');
      }
      put(sel.s, sel.f, T.pcName(pc), 'root');
    }
    fb.mark([...marks.values()]);
    pcRow.hidden = mode !== 'one';
    drawInfo();
  }

  function drawInfo() {
    if (!sel) {
      info.replaceChildren(h('p', { class: 'muted' }, 'Pulsa cualquier punto del mástil: oirás la nota y verás dónde más vive.'));
      return;
    }
    const midi = T.midiAt(sel.s, sel.f), pc = midi % 12;
    const sp = T.spellPc(pc);
    const others = T.positionsOfMidi(midi).filter((p) => !(p.s === sel.s && p.f === sel.f));
    const staff = createStaff({ notes: [{ step: T.staffStep(midi, sp), acc: sp.a || undefined }], minWidth: 170 });
    info.replaceChildren(
      h('div', { class: 'info-main' },
        h('div', { class: 'info-note' }, T.pcName(pc), !T.isNaturalPc(pc) && h('small', {}, ` = ${T.pcName(pc, true)}`)),
        h('p', {}, `${T.STRING_ORD[sel.s]} cuerda · ${sel.f === 0 ? 'al aire' : 'traste ' + sel.f}`),
        h('ul', { class: 'legend-list' },
          h('li', {}, h('i', { class: 'dot same' }), others.length
            ? `Misma altura: ${others.map((p) => `${T.STRING_ORD[p.s]} tr. ${p.f}`).join(', ')}`
            : 'Esta altura solo existe aquí'),
          h('li', {}, h('i', { class: 'dot oct' }), 'La misma nota en otras octavas'))),
      h('div', { class: 'paper small' }, staff.el));
  }

  const pcs = [...Array(12).keys()];
  pcRow.append(...pcs.map((pc) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(pc === focusPc),
    onclick: (ev) => {
      focusPc = pc; sel = null;
      pcRow.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      ev.currentTarget.setAttribute('aria-pressed', 'true');
      draw();
    },
  }, T.pcName(pc))));

  host.replaceChildren(
    h('div', { class: 'card' },
      h('div', { class: 'toolbar' },
        field('Mostrar', segmented([
          { value: 'none', label: 'Nada' }, { value: 'nat', label: 'Naturales' },
          { value: 'all', label: 'Todas' }, { value: 'one', label: 'Una nota' },
        ], mode, (v) => { mode = v; sel = null; store.setPref('fb.mode', v); draw(); })),
        sel !== undefined && h('button', { class: 'btn-ghost', type: 'button', onclick: () => { sel = null; draw(); } }, 'Limpiar selección')),
      pcRow,
      h('div', { class: 'fb-scroll' }, fb.el),
      info),
    h('div', { class: 'card tips' },
      h('p', { class: 'eyebrow' }, 'Atajos para orientarte'),
      h('h2', {}, 'No hay que memorizar 78 casillas'),
      h('ol', {},
        h('li', {}, h('b', {}, 'Mi–Fa y Si–Do van pegadas. '), 'Entre el resto de notas naturales hay siempre un traste de por medio.'),
        h('li', {}, h('b', {}, 'El traste 12 repite la cuerda al aire, '), 'una octava más aguda. A partir de ahí todo se repite.'),
        h('li', {}, h('b', {}, 'El traste 5 es la cuerda siguiente al aire '), '(salvo de la 3ª a la 2ª, que es el traste 4). Así se afinaba de oído.'),
        h('li', {}, h('b', {}, 'Octavas en diagonal: '), 'dos cuerdas más agudas y dos trastes arriba (tres trastes si cruzas la 2ª cuerda). Pulsa una nota y fíjate en los puntos azules.'),
        h('li', {}, h('b', {}, 'La 6ª y la 1ª son la misma cuerda: '), 'las dos son Mi. Apréndete una y tienes dos.'))),
  );
  draw();
}

function practice(host, rerender) {
  const opts = {
    strings: store.pref('fb.strings', [0, 1, 2, 3, 4, 5]),
    maxFret: store.pref('fb.maxFret', 12),
    naturals: store.pref('fb.naturals', false),
  };
  const session = (title, make) => () => runSession(host, { title, next: make, onExit: rerender, onCleanup: micOff });
  host.replaceChildren(
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Ajusta el terreno'),
      h('div', { class: 'toolbar' },
        field('Cuerdas', multiChips([5, 4, 3, 2, 1, 0].map((s) => ({ value: s, label: T.STRING_ORD[s] })), opts.strings,
          (v) => { opts.strings = v; store.setPref('fb.strings', v); }, { label: 'Cuerdas' })),
        field('Trastes', segmented([{ value: 5, label: '0–5' }, { value: 7, label: '0–7' }, { value: 12, label: '0–12' }], opts.maxFret,
          (v) => { opts.maxFret = v; store.setPref('fb.maxFret', v); })),
        field('Notas', segmented([{ value: true, label: 'Solo naturales' }, { value: false, label: 'Todas' }], opts.naturals,
          (v) => { opts.naturals = v; store.setPref('fb.naturals', v); }))),
      h('p', { class: 'muted' }, 'Consejo: empieza por la 6ª y la 5ª cuerda con notas naturales. Son la base de cejillas y acordes.')),
    h('div', { class: 'ex-grid' },
      exerciseCard('Nombra la nota', 'Se ilumina un punto del mástil. Tú dices qué nota es.', 'Empezar', session('Nombra la nota', () => fbName(opts))),
      exerciseCard('Encuentra la nota', 'Te doy una nota y una cuerda. Tú señalas el traste.', 'Empezar', session('Encuentra la nota', () => fbFind(opts))),
      exerciseCard('Con tu guitarra', 'Igual que el anterior, pero respondes tocando: el micrófono escucha la nota.', 'Usar micrófono', session('Encuentra la nota · con guitarra', () => fbFind({ ...opts, mic: true })), 'mic')),
  );
}

export function fretboardView(view) {
  tabs(view, {
    kicker: '01 · Diapasón', title: 'Cada nota, en cada traste',
    lede: 'El mástil deja de ser un mapa mudo cuando ves los patrones que se repiten.',
    prefKey: 'fb.tab', explorer, practice,
  });
}
