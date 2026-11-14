// "Relámpago": nombra el máximo de notas del pentagrama en un tiempo fijo.
import { h } from './ui.js';
import { store } from './store.js';
import * as T from './theory.js';
import { createStaff } from './staff.js';
import { blip } from './audio.js';
import { onLeave } from './quiz.js';
import { readSteps } from './questions.js';
import { stepName, pathFrom } from './reading.js';

const SECONDS = 30;

export const sprintBest = (level) => store.pref(`read.sprint.best.${level}`, 0);

export function runSprint(host, { level, onExit }) {
  const lv = Math.min(level, 2); // el relámpago no usa armadura
  const pool = readSteps(lv);
  let timer = 0, running = false, left = SECONDS, correct = 0, wrong = 0, step = 0, shownAt = 0;
  const times = [];
  const misses = new Map();

  const timeText = h('span', { class: 'sprint-time' }, `${SECONDS}`);
  const bar = h('i', { style: 'width:100%' });
  const score = h('span', { class: 'sprint-score' });
  const flash = h('div', { class: 'sprint-flash', 'aria-live': 'polite' });
  const staff = createStaff({ notes: [], minWidth: 230 });
  const buttons = [0, 1, 2, 3, 4, 5, 6].map((l) => h('button', {
    type: 'button', class: 'choice', onclick: () => answer(l),
  }, T.letterName(l), h('small', {}, String(l + 1))));
  const keyboard = h('div', { class: 'choices notes7' }, buttons);
  const stage = h('div', { class: 'sprint-stage' },
    h('div', { class: 'paper' }, staff.el), keyboard, flash);

  function cleanup() {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey);
  }
  onLeave(cleanup);
  const exit = () => { cleanup(); onExit?.(); };

  function onKey(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key >= '1' && ev.key <= '7' && running) { ev.preventDefault(); answer(Number(ev.key) - 1); }
    else if (ev.key === 'Escape') exit();
  }

  function nextNote() {
    let s;
    do { s = Number(store.weightedPick(pool.map((x) => `rd:${x}`)).split(':')[1]); } while (s === step && pool.length > 1);
    step = s;
    staff.update({ notes: [{ step, cls: 'target' }] });
    shownAt = performance.now();
  }

  function answer(l) {
    if (!running) return;
    const ok = l === T.mod(step, 7);
    store.record(`rd:${step}`, ok);
    if (ok) { correct++; times.push((performance.now() - shownAt) / 1000); flash.textContent = ''; flash.className = 'sprint-flash'; }
    else {
      wrong++;
      misses.set(step, (misses.get(step) || 0) + 1);
      blip(false);
      flash.textContent = `Era ${stepName(step)}`;
      flash.className = 'sprint-flash ko';
    }
    score.textContent = `${correct} ✓  ${wrong ? `${wrong} ✗` : ''}`;
    nextNote();
  }

  function tick() {
    left = Math.max(0, left - 0.1);
    timeText.textContent = Math.ceil(left);
    bar.style.width = `${(left / SECONDS) * 100}%`;
    if (left <= 0) finish();
  }

  function start() {
    running = true;
    left = SECONDS; correct = 0; wrong = 0; times.length = 0; misses.clear();
    score.textContent = '0 ✓';
    host.replaceChildren(screen('Relámpago', stage));
    nextNote();
    keyboard.scrollIntoView({ block: 'end' }); // que en móvil los botones queden a la vista, sobre la barra inferior
    timer = setInterval(tick, 100);
  }

  function finish() {
    running = false;
    cleanup();
    const total = correct + wrong;
    const avg = times.length ? times.reduce((a, x) => a + x, 0) / times.length : 0;
    const best = sprintBest(level);
    const record = correct > best;
    if (record) store.setPref(`read.sprint.best.${level}`, correct);
    const worst = [...misses.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    host.replaceChildren(screen('Relámpago', h('div', { class: 'summary' },
      h('p', { class: 'eyebrow' }, 'Tiempo'),
      h('div', { class: 'summary-score' }, h('span', { class: 'big' }, `${correct}`), h('span', {}, ` nota${correct === 1 ? '' : 's'} en ${SECONDS} s`)),
      h('p', { class: 'summary-verdict' }, record && best > 0 ? `¡Récord! Superas tu marca de ${best}.` : record ? 'Primera marca guardada.' : `Tu récord: ${best}.`),
      h('div', { class: 'summary-stats' },
        h('div', {}, h('b', {}, total ? `${Math.round((correct / total) * 100)}%` : '—'), 'aciertos'),
        h('div', {}, h('b', {}, avg ? `${avg.toFixed(1)} s` : '—'), 'por nota acertada')),
      worst.length ? h('div', { class: 'summary-misses' }, h('p', { class: 'eyebrow' }, 'Las que más se te atragantaron'),
        h('ul', {}, worst.map(([s, n]) => h('li', {}, `${stepName(s)} (${n}×) → `, pathFrom(s).text)))) : null,
      h('div', { class: 'summary-actions' },
        h('button', { class: 'btn', type: 'button', onclick: begin }, 'Otra vez'),
        h('button', { class: 'btn-ghost', type: 'button', onclick: exit }, 'Volver')))));
  }

  function screen(title, content) {
    return h('section', { class: 'session sprint' },
      h('header', { class: 'session-head' },
        h('button', { class: 'btn-ghost', type: 'button', onclick: exit }, '← Salir'),
        h('span', { class: 'session-title' }, title), running ? timeText : h('span')),
      running ? h('div', { class: 'timebar', 'aria-hidden': 'true' }, bar) : null,
      running ? score : null,
      content);
  }

  const goBtn = h('button', { class: 'btn btn-lg', type: 'button', onclick: () => start() }, '¡Ya!');
  function begin() {
    cleanup();
    left = SECONDS;
    host.replaceChildren(screen('Relámpago', h('div', { class: 'summary' },
      h('p', { class: 'eyebrow' }, 'Prepárate'),
      h('p', { class: 'summary-verdict' }, `${SECONDS} segundos. Nombra todas las notas que puedas.`),
      h('p', { class: 'muted' }, `En el teclado, las teclas 1 a 7 son ${[0, 1, 2, 3, 4, 5, 6].map((l) => T.letterName(l)).join(' · ')}. Si fallas, te digo cuál era y sigues sin parar.`),
      h('p', { class: 'muted' }, sprintBest(level) ? `Tu récord en este nivel: ${sprintBest(level)}.` : 'Aún no tienes marca en este nivel.'),
      h('div', { class: 'summary-actions' }, goBtn))));
    document.addEventListener('keydown', onKey);
    goBtn.focus();
  }

  begin();
}

