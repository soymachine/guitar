// Motor de sesiones de ejercicios: progreso, corrección, registro y resumen.
import { h } from './ui.js';
import { store } from './store.js';
import { blip, playMidi } from './audio.js';

let active = null;
/** Cierra la sesión en curso (p. ej. al cambiar de sección). */
export function endActiveSession() {
  if (active) { active(); active = null; }
}

const leaveFns = [];
/** Registra una limpieza para cuando se abandone la vista actual. */
export function onLeave(fn) { leaveFns.push(fn); }
export function leaveView() {
  endActiveSession();
  leaveFns.splice(0).forEach((fn) => fn());
}

/**
 * opts: { title, next: () => pregunta, count, onExit, onCleanup }
 * pregunta: { key, prompt, midi?, mount(body, answer(ok, explain)), cleanup? }
 */
export function runSession(host, opts) {
  endActiveSession();
  const count = opts.count || 10;
  const results = [];
  let index = 0, current = null, startedAt = 0, advance = null, timer = 0;

  const pips = h('div', { class: 'pips', 'aria-hidden': 'true' }, Array.from({ length: count }, () => h('i')));
  const counter = h('span', { class: 'session-count' });
  const prompt = h('div', { class: 'q-prompt' });
  const body = h('div', { class: 'q-body' });
  const feedback = h('div', { class: 'q-feedback', 'aria-live': 'polite' });
  const root = h('section', { class: 'session' },
    h('header', { class: 'session-head' },
      h('button', { class: 'btn-ghost', type: 'button', onclick: () => exit() }, '← Salir'),
      h('span', { class: 'session-title' }, opts.title), counter),
    pips, prompt, body, feedback);

  const onKey = (ev) => { if (ev.key === 'Enter' && advance) { ev.preventDefault(); advance(); } };
  document.addEventListener('keydown', onKey);

  function teardown() {
    clearTimeout(timer);
    current?.cleanup?.();
    current = null;
    document.removeEventListener('keydown', onKey);
    opts.onCleanup?.();
  }
  function exit() { teardown(); active = null; opts.onExit?.(); }
  active = teardown;

  function show() {
    current?.cleanup?.();
    advance = null;
    feedback.replaceChildren();
    feedback.className = 'q-feedback';
    if (index >= count) return summary();
    counter.textContent = `${index + 1} / ${count}`;
    current = opts.next(index);
    prompt.replaceChildren();
    typeof current.prompt === 'string' ? (prompt.innerHTML = current.prompt) : prompt.append(current.prompt);
    body.replaceChildren();
    let answered = false;
    const q = current;
    q.mount(body, (ok, explain) => {
      if (answered) return;
      answered = true;
      const secs = (performance.now() - startedAt) / 1000;
      store.record(q.key, ok, !!q.assisted);
      results.push({ ok, secs, explain });
      pips.children[index].className = ok ? 'ok' : 'ko';
      blip(ok);
      if (q.midi != null) setTimeout(() => playMidi(q.midi), 160);
      feedback.classList.add(ok ? 'ok' : 'ko');
      const go = () => { advance = null; clearTimeout(timer); index++; show(); };
      advance = go;
      feedback.append(
        h('div', { class: 'fb-text' },
          h('strong', {}, ok ? '¡Bien!' : 'No del todo.'), ' ',
          h('span', { html: explain || '' }),
          q.assisted ? h('span', { class: 'q-hint' }, 'Con pista: esta respuesta no suma a tu dominio de la nota.') : null),
        h('button', { class: 'btn', type: 'button', onclick: go }, index + 1 >= count ? 'Ver resumen' : 'Siguiente →'));
      if (ok && !q.hold) timer = setTimeout(go, 1300); // hold: deja la respuesta en pantalla
    });
    startedAt = performance.now();
  }

  function summary() {
    current = null;
    opts.onCleanup?.();
    const okN = results.filter((r) => r.ok).length;
    const avg = results.reduce((a, r) => a + r.secs, 0) / results.length;
    const pct = Math.round((okN / results.length) * 100);
    const verdict = pct === 100 ? 'Redondo. Ni un fallo.' : pct >= 80 ? 'Muy sólido.' : pct >= 50 ? 'Vas por buen camino.' : 'Esto pide otra vuelta — así se aprende.';
    const misses = results.filter((r) => !r.ok && r.explain);
    prompt.replaceChildren();
    counter.textContent = '';
    body.replaceChildren(h('div', { class: 'summary' },
      h('p', { class: 'eyebrow' }, 'Resumen de la ronda'),
      h('div', { class: 'summary-score' }, h('span', { class: 'big' }, `${okN}`), h('span', {}, ` / ${results.length}`)),
      h('p', { class: 'summary-verdict' }, verdict),
      h('div', { class: 'summary-stats' },
        h('div', {}, h('b', {}, `${pct}%`), 'aciertos'),
        h('div', {}, h('b', {}, `${avg.toFixed(1)} s`), 'por respuesta')),
      misses.length ? h('div', { class: 'summary-misses' }, h('p', { class: 'eyebrow' }, 'Para repasar'),
        h('ul', {}, misses.map((m) => h('li', { html: m.explain })))) : null,
      h('div', { class: 'summary-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { runSession(host, opts); } }, count === 1 ? 'Repetir' : 'Otra ronda'),
        h('button', { class: 'btn-ghost', type: 'button', onclick: exit }, 'Volver'))));
  }

  host.replaceChildren(root);
  window.scrollTo({ top: 0 });
  show();
}
