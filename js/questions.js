// Generadores de preguntas para cada área.
import { h, segmented } from './ui.js';
import { store } from './store.js';
import * as T from './theory.js';
import { createFretboard } from './fretboard.js';
import { createStaff } from './staff.js';
import { listen } from './pitch.js';
import { playMidi } from './audio.js';

// ---------- Micrófono compartido durante la sesión ----------
let micStop = null, micHandler = null, micStarting = null;
export async function micOn(handler) {
  micHandler = handler;
  if (micStop) return;
  if (!micStarting) {
    micStarting = listen((m, c) => micHandler?.(m, c))
      .then((stop) => { micStop = stop; })
      .finally(() => { micStarting = null; });
  }
  return micStarting;
}
export function micOff() {
  micHandler = null;
  if (micStop) { micStop(); micStop = null; }
  else if (micStarting) micStarting.then(() => micOff(), () => {});
}

/** Monta la zona "toca la nota en tu guitarra". */
function micAnswer(body, targetMidi, answer, explain, onResolved) {
  const heard = h('span', { class: 'mic-heard' }, '…');
  const status = h('div', { class: 'mic-box' },
    h('span', { class: 'mic-dot' }), h('span', {}, 'Toca la nota en tu guitarra · suena: '), heard);
  const giveUp = h('button', { class: 'btn-ghost', type: 'button', onclick: () => finish(false) }, 'No lo sé');
  body.append(h('div', { class: 'mic-row' }, status, giveUp));
  const t0 = performance.now();
  let done = false;
  function finish(ok) {
    if (done) return;
    done = true; micHandler = null;
    status.classList.add('off'); giveUp.disabled = true;
    onResolved?.(ok);
    answer(ok, explain);
  }
  micOn((m) => {
    if (done) return;
    heard.textContent = m === null ? '…' : T.pcLabel(T.mod(m, 12));
    if (m === targetMidi && performance.now() - t0 > 700) finish(true);
  }).catch((err) => {
    status.replaceChildren(h('span', {}, `No he podido abrir el micrófono (${err.message || err.name}). Revisa el permiso del navegador.`));
    status.classList.add('off');
  });
}

// ---------- Utilidades ----------
function choiceGrid(body, options, correct, answer, explain, cls = '') {
  const grid = h('div', { class: `choices ${cls}` });
  const btns = options.map((o) => h('button', {
    type: 'button', class: 'choice' + (o.cls ? ' ' + o.cls : ''),
    onclick: () => {
      btns.forEach((b, i) => { b.disabled = true; if (options[i].value === correct) b.classList.add('ok'); });
      const ok = o.value === correct;
      if (!ok) btns[options.indexOf(o)].classList.add('ko');
      answer(ok, explain, o.value);
    },
  }, o.label, o.sub ? h('small', {}, o.sub) : null));
  grid.append(...btns);
  body.append(grid);
  return grid;
}
const fbWrap = (fb) => h('div', { class: 'fb-scroll' }, fb.el);
const posText = (s, f) => `${T.STRING_ORD[s]} cuerda, ${f === 0 ? 'al aire' : 'traste ' + f}`;
const b = (t) => `<b>${t}</b>`;

// ---------- Diapasón ----------
export const FB_UNIVERSE = [];
for (let s = 0; s < 6; s++) for (let f = 0; f <= T.FRETS; f++) FB_UNIVERSE.push(`fb:${s}:${f}`);

function fbPool({ strings, maxFret, naturals }) {
  const keys = [];
  for (const s of strings) for (let f = 0; f <= maxFret; f++) {
    if (naturals && !T.isNaturalPc(T.midiAt(s, f) % 12)) continue;
    keys.push(`fb:${s}:${f}`);
  }
  return keys;
}
let lastKey = null;
function pickKey(pool) {
  let k = store.weightedPick(pool);
  for (let i = 0; i < 4 && k === lastKey && pool.length > 1; i++) k = store.weightedPick(pool);
  return (lastKey = k);
}
function pcButtons(naturals) {
  const pcs = naturals ? [0, 2, 4, 5, 7, 9, 11] : [...Array(12).keys()];
  return pcs.map((pc) => T.isNaturalPc(pc)
    ? { value: pc, label: T.pcName(pc) }
    : { value: pc, label: T.pcName(pc), sub: T.pcName(pc, true), cls: 'black' });
}

export function fbName(opts) {
  const key = pickKey(fbPool(opts));
  const [, s, f] = key.split(':').map(Number);
  const midi = T.midiAt(s, f), pc = midi % 12;
  return {
    key, midi,
    prompt: `¿Qué nota es? <span class="q-hint">${posText(s, f)}</span>`,
    mount(body, answer) {
      const fb = createFretboard();
      const mark = fb.add({ s, f, label: '?', cls: 'target' });
      body.append(fbWrap(fb));
      choiceGrid(body, pcButtons(opts.naturals), pc, (ok, ex) => {
        mark.remove();
        fb.add({ s, f, label: T.pcName(pc), cls: ok ? 'ok' : 'ko' });
        answer(ok, ex);
      }, `${posText(s, f)} → ${b(T.pcLabel(pc))}`, opts.naturals ? 'notes7' : 'notes12');
    },
  };
}

export function fbFind(opts) {
  const key = pickKey(fbPool(opts));
  const [, s, f] = key.split(':').map(Number);
  const midi = T.midiAt(s, f), pc = midi % 12;
  const name = T.pcName(pc, Math.random() < 0.5);
  const explain = `${b(name)} en la ${T.STRING_ORD[s]} cuerda está en ${f === 0 || f === 12 ? 'al aire y en el traste 12' : 'el traste ' + f}.`;
  return {
    key, midi: opts.mic ? null : midi,
    prompt: `Encuentra ${b(name)} en la ${b(T.STRING_ORD[s] + ' cuerda')}`,
    mount(body, answer) {
      const reveal = (ok) => {
        for (let ff = 0; ff <= T.FRETS; ff++) if (T.midiAt(s, ff) % 12 === pc) fb.add({ s, f: ff, label: T.pcName(pc, name.includes('♭')), cls: ok ? 'ok' : 'tone' });
      };
      let done = false;
      const fb = createFretboard({
        onPick: opts.mic ? null : (s2, f2) => {
          if (done || s2 !== s) return;
          done = true;
          const ok = T.midiAt(s2, f2) % 12 === pc;
          if (!ok) fb.add({ s: s2, f: f2, label: T.pcName(T.midiAt(s2, f2) % 12), cls: 'ko' });
          reveal(ok);
          answer(ok, explain);
        },
      });
      fb.activeStrings(new Set([s]));
      body.append(fbWrap(fb));
      if (opts.mic) micAnswer(body, midi, answer, explain, reveal);
    },
  };
}

// ---------- Lectura ----------
const READ_MAX = { 1: 39, 2: 44, 3: 44 }; // 1: primera posición (hasta Sol de la 1ª, traste 3)
const readSteps = (level) => Array.from({ length: READ_MAX[level] - 23 + 1 }, (_, i) => 23 + i);
export const READ_UNIVERSE = [...readSteps(2).map((s) => `rd:${s}`), ...readSteps(2).map((s) => `rf:${s}`)];

export function readName({ level }) {
  const withSig = level === 3;
  const step = Number(pickKey(readSteps(level).map((s) => `rd:${s}`)).split(':')[1]);
  const fifths = withSig ? T.pick([-4, -3, -2, -1, 1, 2, 3, 4]) : 0;
  const l = T.mod(step, 7);
  const a = T.sigAccFor(fifths, l);
  const { midi } = T.stepToNote(step, a);
  const note = T.N(l, a);
  const key = withSig ? `rk:${fifths}:${l}` : `rd:${step}`;
  const opt = (ll, aa) => ({ value: `${ll}:${aa}`, label: T.noteName(T.N(ll, aa)), cls: aa ? 'black' : '' });
  const order = [0, 1, 2, 3, 4, 5, 6];
  const options = order.map((ll) => opt(ll, 0));
  if (withSig) options.push(...order.map((ll) => opt(ll, fifths > 0 ? 1 : -1)));
  let explain = `Es ${b(T.noteName(note))}.`;
  if (withSig) {
    explain += a
      ? ` La armadura (${T.sigNotes(fifths).map(T.noteName).join(', ')}) altera todos los ${T.letterName(l)}.`
      : ` La armadura (${T.sigNotes(fifths).map(T.noteName).join(', ')}) no afecta a esta nota.`;
  } else {
    const pos = T.positionsOfMidi(midi).sort((x, y) => x.f - y.f)[0];
    explain += ` En la guitarra: ${posText(pos.s, pos.f)}.`;
  }
  return {
    key, midi,
    prompt: withSig ? '¿Qué nota es? <span class="q-hint">ojo con la armadura</span>' : '¿Qué nota es?',
    mount(body, answer) {
      const staff = createStaff({ keySig: fifths, notes: [{ step, cls: 'target' }], minWidth: 230 });
      body.append(h('div', { class: 'paper' }, staff.el));
      choiceGrid(body, options, `${l}:${a}`, (ok, ex) => {
        staff.update({ notes: [{ step, cls: ok ? 'ok' : 'ko', label: T.noteName(note) }] });
        answer(ok, ex);
      }, explain, 'notes7');
    },
  };
}

export function readFind({ level, mic }) {
  const lv = Math.min(level, 2);
  const key = pickKey(readSteps(lv).map((s) => `rf:${s}`));
  const step = Number(key.split(':')[1]);
  const { midi, spelling } = T.stepToNote(step, 0);
  const positions = T.positionsOfMidi(midi);
  const name = T.noteName(spelling);
  const explain = `Es ${b(name)}: ${positions.map((p) => posText(p.s, p.f)).join(' · ')}.`;
  return {
    key, midi: mic ? null : midi,
    prompt: mic ? 'Toca esta nota en tu guitarra' : 'Pulsa esta nota en el diapasón <span class="q-hint">vale cualquier posición con la misma altura</span>',
    mount(body, answer) {
      const staff = createStaff({ notes: [{ step, cls: 'target' }], minWidth: 230 });
      let done = false;
      const reveal = (ok) => {
        positions.forEach((p) => fb.add({ ...p, label: name, cls: ok ? 'ok' : 'tone' }));
        staff.update({ notes: [{ step, cls: ok ? 'ok' : 'ko', label: name }] });
      };
      const fb = createFretboard({
        onPick: mic ? null : (s, f) => {
          if (done) return;
          done = true;
          const m = T.midiAt(s, f), ok = m === midi;
          if (!ok) {
            const oct = m % 12 === midi % 12;
            fb.add({ s, f, label: T.pcName(m % 12), cls: 'ko' });
            reveal(false);
            return answer(false, explain + (oct ? ' Has dado con la nota, pero en otra octava.' : ''));
          }
          reveal(true);
          answer(true, explain);
        },
      });
      body.append(h('div', { class: 'paper' }, staff.el), fbWrap(fb));
      if (mic) micAnswer(body, midi, answer, explain, reveal);
    },
  };
}

// ---------- Tonalidades ----------
export const KEY_TYPES = ['ks', 'kc', 'kr', 'kb', 'kd'];
export const KEYS_UNIVERSE = [];
for (let f = -7; f <= 7; f++) for (const m of ['M', 'm']) for (const t of KEY_TYPES) KEYS_UNIVERSE.push(`${t}:${f}:${m}`);

function keysPool({ maxAcc, mode, types }) {
  const out = [];
  for (let f = -maxAcc; f <= maxAcc; f++) for (const m of ['M', 'm']) {
    if ((mode === 'major' && m === 'm') || (mode === 'minor' && m === 'M')) continue;
    for (const t of types) out.push(`${t}:${f}:${m}`);
  }
  return out;
}
function otherFifths(f, maxAcc, n = 3) {
  const range = Math.max(maxAcc, 3);
  const all = [];
  for (let x = -range; x <= range; x++) if (x !== f) all.push(x);
  return T.shuffle(all).slice(0, n);
}

export function keysQuestion(opts) {
  // opts.fixed = { f, minor } fuerza una tonalidad concreta (solo para "construye la escala")
  const key = opts.fixed ? `kb:${opts.fixed.f}:${opts.fixed.minor ? 'm' : 'M'}` : pickKey(keysPool(opts));
  const [type, fs, m] = key.split(':');
  const f = Number(fs), minor = m === 'm';
  const name = T.keyName(f, minor);
  const sigList = T.sigNotes(f).map(T.noteName).join(', ');
  const sigExplain = f ? `${b(name)} tiene ${T.sigText(f)}: ${sigList}.` : `${b(name)} no tiene alteraciones.`;
  const tonicMidi = 45 + T.mod(T.pcOf(T.keyTonic(f, minor)) - 9, 12);

  if (type === 'ks') {
    const opts4 = T.shuffle([f, ...otherFifths(f, opts.maxAcc)]).map((x) => ({ value: x, label: T.keyName(x, minor) }));
    return {
      key, midi: tonicMidi,
      prompt: `¿Qué tonalidad ${b(minor ? 'menor' : 'mayor')} tiene esta armadura?`,
      mount(body, answer) {
        body.append(h('div', { class: 'paper' }, createStaff({ keySig: f, notes: [], minWidth: 210 }).el));
        choiceGrid(body, opts4, f, answer, sigExplain, 'wide');
      },
    };
  }
  if (type === 'kc') {
    const opts4 = [f, ...otherFifths(f, opts.maxAcc)].sort((x, y) => x - y)
      .map((x) => ({ value: x, label: T.sigShort(x), sub: x ? (x > 0 ? 'sostenidos' : 'bemoles') : 'sin alteraciones' }));
    return {
      key, midi: tonicMidi,
      prompt: `¿Qué armadura lleva ${b(name)}?`,
      mount(body, answer) { choiceGrid(body, opts4, f, answer, sigExplain, 'wide'); },
    };
  }
  if (type === 'kr') {
    const rel = T.keyName(f, !minor);
    const opts4 = T.shuffle([f, ...otherFifths(f, opts.maxAcc)]).map((x) => ({ value: x, label: T.keyName(x, !minor) }));
    return {
      key, midi: tonicMidi,
      prompt: `¿Cuál es el relativo ${b(minor ? 'mayor' : 'menor')} de ${b(name)}?`,
      mount(body, answer) {
        choiceGrid(body, opts4, f, answer,
          `${b(name)} y ${b(rel)} comparten armadura (${T.sigShort(f)}). El relativo menor nace en el VI grado de la mayor: tres semitonos por debajo.`, 'wide');
      },
    };
  }
  if (type === 'kd') {
    const scaleId = minor ? 'minor' : 'major';
    const chords = T.diatonicChords(T.keyTonic(f, minor), scaleId);
    const i = T.rand(7), ch = chords[i];
    const suffix = { maj: '', min: 'm', dim: '°' };
    const rootName = T.noteName(ch.root);
    const cands = new Set([ch.name]);
    for (const q of T.shuffle(['maj', 'min', 'dim'])) { if (cands.size < 2) cands.add(rootName + suffix[q]); }
    for (const c of T.shuffle(chords)) { if (cands.size < 4) cands.add(c.name); }
    const romanAll = chords.map((c) => `${c.roman} ${c.name}`).join(' · ');
    return {
      key, midi: null,
      prompt: `En ${b(name)}, ¿qué acorde es el grado ${b(ch.roman.replace(/[°+]/, '').toUpperCase())}?`,
      mount(body, answer) {
        choiceGrid(body, T.shuffle([...cands]).map((c) => ({ value: c, label: c })), ch.name, answer,
          `El grado ${ch.roman} de ${name} es ${b(ch.name)} (${T.QUALITY_NAME[ch.quality]}). <span class="q-hint">${romanAll}</span>`, 'wide');
      },
    };
  }
  // kb: construir la escala
  const scaleId = minor ? 'minor' : 'major';
  const scale = T.spellScale(T.keyTonic(f, minor), scaleId);
  const pattern = T.stepPattern(scaleId).map(T.stepLabel).join(' – ');
  return {
    key, midi: null,
    prompt: `Construye la escala de ${b(name)} <span class="q-hint">cada letra aparece una vez: decide su alteración</span>`,
    mount(body, answer) {
      const flat = f < 0;
      const chosen = scale.map((d, i) => (i === 0 ? d.note.a : 0));
      const cols = scale.map((d, i) => {
        const label = h('div', { class: 'build-note' }, T.noteName(T.N(d.note.l, chosen[i])));
        const seg = i === 0 ? h('div', { class: 'build-fixed' }, 'tónica')
          : segmented([{ value: -1, label: '♭' }, { value: 0, label: '♮' }, { value: 1, label: '♯' }], 0, (v) => {
            chosen[i] = v; label.textContent = T.noteName(T.N(d.note.l, v));
          }, { label: `Alteración de ${T.letterName(d.note.l)}` });
        return h('div', { class: 'build-col' }, h('div', { class: 'build-deg' }, d.deg), label, seg);
      });
      const check = h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          check.disabled = true;
          let ok = true;
          scale.forEach((d, i) => {
            const good = chosen[i] === d.note.a;
            if (!good) ok = false;
            cols[i].classList.add(good ? 'ok' : 'ko');
            cols[i].querySelectorAll('button').forEach((x) => (x.disabled = true));
          });
          const base = 45 + T.mod(T.pcOf(scale[0].note) - 9, 12);
          [...scale.map((d) => d.semis), 12].forEach((sm, i) => playMidi(base + sm, 0.25 + i * 0.2, 0.8));
          answer(ok, `${b(name)}: ${scale.map((d) => T.noteName(d.note)).join(' ')}. Fórmula: ${pattern}${flat || f > 0 ? ` (${T.sigText(f)})` : ''}.`);
        },
      }, 'Comprobar');
      body.append(h('div', { class: 'build' }, cols), h('div', { class: 'build-actions' }, check));
    },
  };
}

// ---------- Construir un acorde ----------
const COMMON_ROOTS = [T.N(0), T.N(1, -1), T.N(1), T.N(2, -1), T.N(2), T.N(3), T.N(3, 1), T.N(4), T.N(4, -1), T.N(5), T.N(6, -1), T.N(6)];
/** opts: { root: {l,a} | null (aleatoria), minor, seventh, flat5 } */
export function chordQuestion(opts) {
  const root = opts.root || T.pick(COMMON_ROOTS);
  const tones = T.spellChord(root, opts);
  const name = T.chordName(root, opts);
  const formula = tones.map((d) => d.degLabel).join(' – ');
  const base = 45 + T.mod(T.pcOf(root) - 9, 12);
  return {
    key: `ch:${opts.minor ? 'm' : 'M'}${opts.seventh === 'maj7' ? 'maj7' : opts.seventh ? '7' : ''}${opts.flat5 ? 'b5' : ''}`, midi: null, hold: true,
    prompt: `Construye el acorde ${b(name)} <span class="q-hint">las letras van por terceras: sube o baja cada una con ♯ y ♭</span>`,
    mount(body, answer) {
      const chosen = tones.map((d, i) => (i === 0 ? d.note.a : 0));
      const cols = tones.map((d, i) => {
        const label = h('div', { class: 'build-note' }, T.noteName(T.N(d.note.l, chosen[i])));
        const step = (delta) => () => {
          chosen[i] = Math.max(-2, Math.min(2, chosen[i] + delta));
          label.textContent = T.noteName(T.N(d.note.l, chosen[i]));
        };
        const ctrl = i === 0 ? h('div', { class: 'build-fixed' }, 'fundamental')
          : h('div', { class: 'stepper' },
            h('button', { type: 'button', class: 'step-btn', 'aria-label': `Bajar ${T.letterName(d.note.l)} un semitono`, onclick: step(-1) }, '♭'),
            h('button', { type: 'button', class: 'step-btn', 'aria-label': `Subir ${T.letterName(d.note.l)} un semitono`, onclick: step(1) }, '♯'));
        return h('div', { class: 'build-col' }, h('div', { class: 'build-deg' }, ['1', '3ª', '5ª', '7ª'][i]), label, ctrl);
      });
      const fb = createFretboard({ onPick: (s, f) => playMidi(T.midiAt(s, f)) });
      const fbBox = h('div', { class: 'fb-scroll', hidden: true }, fb.el);
      const check = h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          check.disabled = true;
          let ok = true;
          tones.forEach((d, i) => {
            const good = chosen[i] === d.note.a;
            if (!good) ok = false;
            cols[i].classList.add(good ? 'ok' : 'ko');
            cols[i].querySelectorAll('button').forEach((x) => (x.disabled = true));
            cols[i].querySelector('.build-deg').textContent = d.degLabel;
          });
          const byPc = new Map(tones.map((d) => [T.pcOf(d.note), d]));
          const marks = [];
          for (let s = 0; s < 6; s++) for (let f = 0; f <= T.FRETS; f++) {
            const d = byPc.get(T.midiAt(s, f) % 12);
            if (d) marks.push({ s, f, label: T.noteName(d.note), cls: d.semis === 0 ? 'root' : 'tone' });
          }
          fb.mark(marks);
          fbBox.hidden = false;
          tones.forEach((d, i) => playMidi(base + d.semis, 0.25 + i * 0.16, 0.8));
          tones.forEach((d, i) => playMidi(base + d.semis, 1.1 + i * 0.03, 0.6));
          answer(ok, `${b(name)}: ${tones.map((d) => T.noteName(d.note)).join(' ')}. Fórmula: ${formula} <span class="q-hint">${tones.slice(1).map((d) => d.role).join(' · ')}</span>`);
        },
      }, 'Comprobar');
      body.append(h('div', { class: `build chord-build n${tones.length}` }, cols), h('div', { class: 'build-actions' }, check), fbBox);
    },
  };
}

// ---------- Construir la escala de un acorde ----------
/** opts: { root: {l,a} | null (aleatoria), minor, seventh, flat5 } */
export function chordScaleQuestion(opts) {
  const root = opts.root || T.pick(COMMON_ROOTS);
  const { name, tones, pattern } = T.chordScale(root, opts);
  const chord = T.chordName(root, opts);
  const chordPcs = new Set(T.spellChord(root, opts).map((d) => T.pcOf(d.note)));
  const title = `${T.noteName(root)} ${name}`;
  const base = 45 + T.mod(T.pcOf(root) - 9, 12);
  return {
    key: `cs:${opts.minor ? 'm' : 'M'}${opts.seventh === 'maj7' ? 'maj7' : opts.seventh ? '7' : ''}${opts.flat5 ? 'b5' : ''}`, midi: null, hold: true,
    prompt: `Construye la escala de ${b(title)} <span class="q-hint">la escala del acorde ${chord} · cada letra aparece una vez: súbela o bájala con ♯ y ♭</span>`,
    mount(body, answer) {
      const chosen = tones.map((d, i) => (i === 0 ? d.note.a : 0));
      const cols = tones.map((d, i) => {
        const label = h('div', { class: 'build-note' }, T.noteName(T.N(d.note.l, chosen[i])));
        const step = (delta) => () => {
          chosen[i] = Math.max(-2, Math.min(2, chosen[i] + delta));
          label.textContent = T.noteName(T.N(d.note.l, chosen[i]));
        };
        const ctrl = i === 0 ? h('div', { class: 'build-fixed' }, 'tónica')
          : h('div', { class: 'stepper' },
            h('button', { type: 'button', class: 'step-btn', 'aria-label': `Bajar ${T.letterName(d.note.l)} un semitono`, onclick: step(-1) }, '♭'),
            h('button', { type: 'button', class: 'step-btn', 'aria-label': `Subir ${T.letterName(d.note.l)} un semitono`, onclick: step(1) }, '♯'));
        return h('div', { class: 'build-col' }, h('div', { class: 'build-deg' }, d.deg), label, ctrl);
      });
      const fb = createFretboard({ onPick: (s, f) => playMidi(T.midiAt(s, f)) });
      const fbBox = h('div', { class: 'fb-scroll', hidden: true }, fb.el);
      const check = h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          check.disabled = true;
          let ok = true;
          tones.forEach((d, i) => {
            const good = chosen[i] === d.note.a;
            if (!good) ok = false;
            cols[i].classList.add(good ? 'ok' : 'ko');
            cols[i].querySelectorAll('button').forEach((x) => (x.disabled = true));
            cols[i].querySelector('.build-deg').textContent = d.degLabel;
          });
          const byPc = new Map(tones.map((d) => [T.pcOf(d.note), d]));
          const marks = [];
          for (let s = 0; s < 6; s++) for (let f = 0; f <= T.FRETS; f++) {
            const d = byPc.get(T.midiAt(s, f) % 12);
            if (d) marks.push({ s, f, label: T.noteName(d.note), cls: d.semis === 0 ? 'root' : chordPcs.has(T.pcOf(d.note)) ? 'tone' : 'tone alt' });
          }
          fb.mark(marks);
          fbBox.hidden = false;
          [...tones.map((d) => d.semis), 12].forEach((sm, i) => playMidi(base + sm, 0.25 + i * 0.2, 0.8));
          answer(ok, `${b(title)}: ${tones.map((d) => T.noteName(d.note)).join(' ')}. Fórmula: ${pattern.map(T.stepLabel).join(' – ')} <span class="q-hint">Grados ${tones.map((d) => d.degLabel).join(' ')} · en claro, las notas del acorde ${chord}</span>`);
        },
      }, 'Comprobar');
      body.append(h('div', { class: 'build scale-build' }, cols), h('div', { class: 'build-actions' }, check), fbBox);
    },
  };
}

// ---------- Sesión mixta ----------
export function mixedQuestion() {
  const fb = { strings: [0, 1, 2, 3, 4, 5], maxFret: 12, naturals: false };
  const keys = { maxAcc: store.pref('keys.maxAcc', 4), mode: 'both', types: KEY_TYPES };
  return T.pick([
    () => fbName(fb), () => fbFind(fb), () => fbName(fb),
    () => readName({ level: 2 }), () => readFind({ level: 2 }), () => readName({ level: 3 }),
    () => keysQuestion(keys), () => keysQuestion(keys), () => keysQuestion(keys),
  ])();
}
