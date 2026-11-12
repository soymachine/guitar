import { h, s, segmented, field } from '../ui.js';
import { store } from '../store.js';
import * as T from '../theory.js';
import { createFretboard } from '../fretboard.js';
import { createStaff } from '../staff.js';
import { playMidi, playChord, playSequence } from '../audio.js';
import { runSession } from '../quiz.js';
import { keysQuestion, chordQuestion, chordScaleQuestion, KEY_TYPES, micOff } from '../questions.js';
import { tabs, exerciseCard } from './shared.js';

// ----- Círculo de quintas -----
function wedge(i, r0, r1) {
  const a0 = ((i - 0.5) * 30 - 90) * Math.PI / 180, a1 = ((i + 0.5) * 30 - 90) * Math.PI / 180;
  const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
}
function circle(state, onSelect) {
  const svg = s('svg', { viewBox: '-160 -160 320 320', class: 'circle', role: 'group', 'aria-label': 'Círculo de quintas' });
  T.CIRCLE.forEach((f, i) => {
    const ang = (i * 30 - 90) * Math.PI / 180;
    for (const minor of [false, true]) {
      const [r0, r1] = minor ? [62, 104] : [104, 156];
      const rm = (r0 + r1) / 2;
      const on = state.fifths === f && state.minor === minor;
      const g = s('g', {
        class: `wedge ${minor ? 'minor' : 'major'} ${on ? 'on' : ''} ${state.fifths === f ? 'pair' : ''}`,
        tabindex: 0, role: 'button', 'aria-label': T.keyName(f, minor), 'aria-pressed': String(on),
        onclick: () => onSelect(f, minor),
        onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(f, minor); } },
      },
        s('path', { d: wedge(i, r0, r1) }),
        s('text', { x: rm * Math.cos(ang), y: rm * Math.sin(ang) + 1 }, T.noteName(T.keyTonic(f, minor)) + (minor ? 'm' : '')));
      svg.append(g);
    }
  });
  const f = state.fifths;
  svg.append(
    s('text', { x: 0, y: -8, class: 'circle-num' }, f ? Math.abs(f) : '0'),
    s('text', { x: 0, y: 22, class: 'circle-sub' }, f ? (f > 0 ? '♯ sostenidos' : '♭ bemoles') : 'alteraciones'));
  return svg;
}

// ----- Regla de tonos y semitonos -----
function stepRuler(scale, pattern, activeIdx) {
  const CW = 56, svg = s('svg', { viewBox: `0 0 ${CW * 13 + 8} 96`, class: 'ruler', role: 'img', 'aria-label': 'Distancias entre las notas de la escala' });
  const bySemi = new Map(scale.map((d, i) => [d.semis, { d, i }]));
  bySemi.set(12, { d: scale[0], i: scale.length });
  for (let x = 0; x <= 12; x++) {
    const hit = bySemi.get(x);
    const cx = 4 + x * CW + CW / 2;
    svg.append(s('g', { class: `ruler-cell ${hit ? 'on' : ''} ${hit && hit.i === activeIdx ? 'playing' : ''} ${hit && (x === 0 || x === 12) ? 'tonic' : ''}` },
      s('circle', { cx, cy: 30, r: hit ? 20 : 4 }),
      hit && s('text', { x: cx, y: 31 }, T.noteName(hit.d.note))));
  }
  let pos = 0;
  pattern.forEach((st) => {
    const x0 = 4 + pos * CW + CW / 2, x1 = x0 + st * CW, mid = (x0 + x1) / 2;
    svg.append(
      s('path', { d: `M${x0 + 6} 58 Q${mid} ${66 + st * 7} ${x1 - 6} 58`, class: `ruler-arc s${st}` }),
      s('text', { x: mid, y: 88, class: `ruler-step s${st}` }, T.stepLabel(st)));
    pos += st;
  });
  return svg;
}

function explorer(host) {
  const st = {
    fifths: store.pref('keys.fifths', 0), minor: store.pref('keys.minor', false),
    scale: store.pref('keys.scale', 'major'), labels: store.pref('keys.labels', 'names'), chord: null, playing: -1,
  };
  let cancelPlay = null;
  const fb = createFretboard({ onPick: (sx, f) => playMidi(T.midiAt(sx, f)) });
  const left = h('div', { class: 'circle-wrap' });
  const panel = h('div', { class: 'key-panel' });
  const rulerBox = h('div', { class: 'ruler-scroll' });
  const fbHead = h('div', { class: 'toolbar' });

  const baseMidi = (pc) => 40 + T.mod(pc - 4, 12);

  function select(f, minor) {
    st.fifths = f; st.minor = minor; st.chord = null;
    if (T.SCALES[st.scale].family !== (minor ? 'minor' : 'major')) st.scale = minor ? 'minor' : 'major';
    store.setPref('keys.fifths', f); store.setPref('keys.minor', minor); store.setPref('keys.scale', st.scale);
    playMidi(baseMidi(T.pcOf(T.keyTonic(f, minor))));
    draw();
  }

  function draw() {
    const tonic = T.keyTonic(st.fifths, st.minor);
    const def = T.SCALES[st.scale];
    const scale = T.spellScale(tonic, st.scale);
    const pattern = T.stepPattern(st.scale);
    const chords = T.diatonicChords(tonic, st.scale);
    const sigF = st.fifths + (st.minor ? 3 : 0) + def.off; // armadura real de este modo
    const sigOk = Math.abs(sigF) <= 7;
    const base = baseMidi(T.pcOf(tonic));

    left.replaceChildren(circle(st, select),
      h('p', { class: 'muted center' }, 'Anillo exterior: mayores · interior: sus relativas menores'));

    // Notas en pentagrama (una octava, con la armadura)
    const staffNotes = [...scale, { ...scale[0], semis: 12 }].map((d, i) => {
      const midi = base + d.semis;
      const sigAcc = sigOk ? T.sigAccFor(sigF, d.note.l) : 0;
      return { step: T.staffStep(midi, d.note), acc: d.note.a !== sigAcc ? d.note.a : undefined, label: T.noteName(d.note), cls: i === st.playing ? 'ok' : '' };
    });
    const staff = createStaff({ keySig: sigOk ? sigF : 0, notes: staffNotes, spacing: 44 });

    const family = Object.entries(T.SCALES).filter(([, v]) => v.family === (st.minor ? 'minor' : 'major'));
    const scaleSel = h('select', { class: 'select', 'aria-label': 'Tipo de escala', onchange: (ev) => { st.scale = ev.target.value; st.chord = null; store.setPref('keys.scale', st.scale); draw(); } },
      family.map(([id, v]) => h('option', { value: id, selected: id === st.scale }, v.name)));

    const rel = T.keyName(st.fifths, !st.minor);
    panel.replaceChildren(
      h('div', { class: 'key-title' },
        h('h2', {}, T.noteName(tonic), ' ', h('em', {}, def.name.toLowerCase())),
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => {
            cancelPlay?.();
            const seq = [...scale.map((d) => base + d.semis), base + 12];
            cancelPlay = playSequence(seq, 0.3, (i) => { st.playing = i; drawRuler(); });
            setTimeout(() => { st.playing = -1; drawRuler(); }, seq.length * 300 + 400);
          },
        }, '▶ Escuchar')),
      h('div', { class: 'toolbar' }, field('Escala', scaleSel)),
      h('dl', { class: 'facts' },
        h('div', {}, h('dt', {}, 'Armadura'), h('dd', {}, sigOk ? (sigF ? `${T.sigText(sigF)}: ${T.sigNotes(sigF).map(T.noteName).join(' ')}` : 'Sin alteraciones') : '—')),
        h('div', {}, h('dt', {}, st.minor ? 'Relativo mayor' : 'Relativo menor'),
          h('dd', {}, h('button', { class: 'link', type: 'button', onclick: () => select(st.fifths, !st.minor) }, rel + ' →'))),
        h('div', {}, h('dt', {}, 'Fórmula'), h('dd', {}, pattern.map(T.stepLabel).join(' – ')))),
      h('div', { class: 'paper' }, staff.el),
      chords.length ? h('div', { class: 'chords' },
        h('p', { class: 'eyebrow' }, 'Acordes de la tonalidad · pulsa para oírlos y verlos en el mástil'),
        h('div', { class: 'chord-row' }, chords.map((c, i) => h('button', {
          type: 'button', class: `chord ${c.quality}`, 'aria-pressed': String(st.chord === i),
          onclick: () => {
            st.chord = st.chord === i ? null : i;
            if (st.chord !== null) {
              const root = 45 + T.mod(c.pcs[0] - 9, 12);
              playChord(c.pcs.map((pc) => root + T.mod(pc - c.pcs[0], 12)));
            }
            draw();
          },
        }, h('small', {}, c.roman), c.name)))) : h('p', { class: 'muted' }, 'Las escalas de 5 o 6 notas no forman una tríada sobre cada grado; vuelve a la mayor o menor natural para ver los acordes.'));

    function drawRuler() {
      rulerBox.replaceChildren(stepRuler(scale, pattern, st.playing));
    }
    drawRuler();

    // Mástil
    const chord = st.chord !== null ? chords[st.chord] : null;
    const byPc = new Map(scale.map((d) => [T.pcOf(d.note), d]));
    const marks = [];
    for (let sx = 0; sx < 6; sx++) for (let f = 0; f <= T.FRETS; f++) {
      const d = byPc.get(T.midiAt(sx, f) % 12);
      if (!d) continue;
      const inChord = chord && chord.pcs.includes(T.pcOf(d.note));
      const isRoot = chord ? T.pcOf(d.note) === chord.pcs[0] : d.deg === 1 && d.semis === 0;
      marks.push({ s: sx, f, label: st.labels === 'names' ? T.noteName(d.note) : d.degLabel, cls: isRoot ? 'root' : chord ? (inChord ? 'tone' : 'faint') : 'tone' });
    }
    fb.mark(marks);
    fbHead.replaceChildren(
      h('div', {}, h('p', { class: 'eyebrow' }, 'En el mástil'),
        h('h2', {}, chord ? `${chord.name} dentro de ${T.noteName(tonic)} ${def.name.toLowerCase()}` : `${T.noteName(tonic)} ${def.name.toLowerCase()}`)),
      field('Etiquetas', segmented([{ value: 'names', label: 'Notas' }, { value: 'degrees', label: 'Grados' }], st.labels,
        (v) => { st.labels = v; store.setPref('keys.labels', v); draw(); })));
  }

  host.replaceChildren(
    h('div', { class: 'card keys-top' }, left, panel),
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'La receta de la escala'),
      h('h2', {}, 'Tonos y semitonos, de tónica a tónica'),
      h('p', { class: 'muted' }, 'Cada casilla es un traste sobre una sola cuerda. T = tono (2 trastes), S = semitono (1 traste). La misma receta desde cualquier nota da la misma escala.'),
      rulerBox),
    h('div', { class: 'card' }, fbHead, h('div', { class: 'fb-scroll' }, fb.el)),
  );
  draw();
}

function practice(host, rerender) {
  const opts = { maxAcc: store.pref('keys.maxAcc', 4), mode: store.pref('keys.mode', 'both') };
  const go = (title, types) => () => runSession(host, {
    title, next: () => keysQuestion({ ...opts, types }), onExit: rerender, onCleanup: micOff,
  });
  // Selector compartido: nota, ♯/♭, mayor/menor, séptima y ♭5
  function chordPicker(prefix, describe) {
    const st = {
      letter: store.pref(`${prefix}.letter`, prefix === 'scale' ? 'rand' : 0), acc: store.pref(`${prefix}.acc`, 0),
      minor: store.pref(`${prefix}.minor`, false), seventh: store.pref(`${prefix}.seventh`, false), flat5: store.pref(`${prefix}.flat5`, false),
    };
    const preview = h('div', { class: 'chord-preview', 'aria-live': 'polite' });
    const accSeg = segmented([{ value: -1, label: '♭' }, { value: 0, label: '♮' }, { value: 1, label: '♯' }], st.acc, (v) => set('acc')(v), { label: 'Alteración' });
    function draw() {
      const rnd = st.letter === 'rand';
      preview.textContent = describe(rnd ? null : T.N(st.letter, st.acc), st);
      accSeg.classList.toggle('disabled', rnd);
    }
    function set(k) { return (v) => { st[k] = v; store.setPref(`${prefix}.${k}`, v); draw(); }; }
    const el = h('div', { class: 'ex-controls' },
      field('Nota', h('select', {
        class: 'select', 'aria-label': 'Nota inicial',
        onchange: (ev) => set('letter')(ev.target.value === 'rand' ? 'rand' : Number(ev.target.value)),
      },
        [0, 1, 2, 3, 4, 5, 6].map((l) => h('option', { value: l, selected: st.letter === l }, T.letterName(l))),
        h('option', { value: 'rand', selected: st.letter === 'rand' }, 'Aleatoria'))),
      field('♯ / ♭', accSeg),
      field('Tipo', segmented([{ value: false, label: 'Mayor' }, { value: true, label: 'Menor' }], st.minor, set('minor'))),
      field('Séptima', segmented([{ value: false, label: 'No' }, { value: true, label: '7' }, { value: 'maj7', label: 'maj7' }], st.seventh, set('seventh'))),
      field('Quinta', segmented([{ value: false, label: 'Justa' }, { value: true, label: '♭5' }], st.flat5, set('flat5'))),
      field(prefix === 'scale' ? 'Tu escala' : 'Tu acorde', preview));
    draw();
    return { el, st, root: () => (st.letter === 'rand' ? null : T.N(st.letter, st.acc)) };
  }
  const suffix = (o) => T.chordSuffix(o);

  const sc = chordPicker('scale', (root, o) => {
    const name = T.chordScale(T.N(0), o).name;
    return root ? `${T.chordName(root, o)} → ${T.noteName(root)} ${name}` : `?${suffix(o)} → ${name}`;
  });
  const startBuild = () => {
    const root = sc.root(), o = sc.st;
    const plain = !o.seventh && !o.flat5;
    runSession(host, {
      title: 'Construye la escala', count: root ? 1 : 10,
      // Sin 7 ni ♭5 y con nota aleatoria: tonalidades reales según la dificultad elegida arriba
      next: () => (!root && plain
        ? keysQuestion({ ...opts, mode: o.minor ? 'minor' : 'major', types: ['kb'] })
        : chordScaleQuestion({ root, minor: o.minor, seventh: o.seventh, flat5: o.flat5 })),
      onExit: rerender, onCleanup: micOff,
    });
  };

  const chp = chordPicker('chord', (root, o) => (root ? T.chordName(root, o) : `?${suffix(o) || ' mayor'}`));
  const startChord = () => {
    const root = chp.root(), o = chp.st;
    runSession(host, {
      title: 'Construye el acorde', count: root ? 1 : 10,
      next: () => chordQuestion({ root, minor: o.minor, seventh: o.seventh, flat5: o.flat5 }),
      onExit: rerender, onCleanup: micOff,
    });
  };

  host.replaceChildren(
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Ajusta el terreno'),
      h('div', { class: 'toolbar' },
        field('Dificultad', segmented([
          { value: 2, label: 'Hasta 2 alteraciones' }, { value: 4, label: 'Hasta 4' }, { value: 7, label: 'Todas' },
        ], opts.maxAcc, (v) => { opts.maxAcc = v; store.setPref('keys.maxAcc', v); })),
        field('Modo', segmented([
          { value: 'major', label: 'Mayores' }, { value: 'minor', label: 'Menores' }, { value: 'both', label: 'Ambas' },
        ], opts.mode, (v) => { opts.mode = v; store.setPref('keys.mode', v); }))),
      h('p', { class: 'muted' }, 'Truco: el orden de los sostenidos es Fa-Do-Sol-Re-La-Mi-Si; el de los bemoles, el mismo al revés.')),
    h('div', { class: 'ex-grid' },
      exerciseCard('Armaduras', 'Ves la armadura y dices la tonalidad — y al revés.', 'Empezar', go('Armaduras', ['ks', 'kc'])),
      exerciseCard('Relativos', 'Cada mayor tiene una menor que comparte sus notas. ¿Cuál?', 'Empezar', go('Relativos', ['kr'])),
      exerciseCard('Construye la escala', 'Elige la nota inicial, si lleva ♯ o ♭, mayor o menor, sin séptima, con 7 o con maj7, y con ♭5 o no. Después decides la alteración de cada una de las siete letras.', 'Empezar', startBuild, 'wide', sc.el),
      exerciseCard('Construye el acorde', 'Elige la nota, si lleva ♯ o ♭, mayor o menor, sin séptima, con 7 o con maj7, y con ♭5 o no. Después deletrea sus notas y míralo en el mástil.', 'Empezar', startChord, 'wide', chp.el),
      exerciseCard('Acordes de la tonalidad', '¿Qué acorde es el grado V de La mayor? ¿Y el II?', 'Empezar', go('Acordes de la tonalidad', ['kd'])),
      exerciseCard('Mezcla', 'Un poco de todo, insistiendo en lo que más te cuesta.', 'Empezar', go('Tonalidades · mezcla', KEY_TYPES), 'mix')),
  );
}

export function keysView(view) {
  tabs(view, {
    kicker: '02 · Tonalidades', title: 'Escalas mayores y menores',
    lede: 'Una tonalidad es una receta de distancias. Gira el círculo y mira cómo cambia todo lo demás.',
    prefKey: 'keys.tab', explorer, practice,
  });
}
