import { h, s, segmented } from '../ui.js';
import { store, dayKey } from '../store.js';
import { runSession } from '../quiz.js';
import { mixedQuestion, micOff, FB_UNIVERSE, READ_UNIVERSE, KEYS_UNIVERSE } from '../questions.js';
import { createFretboard } from '../fretboard.js';

function ring(value, goal) {
  const r = 52, c = 2 * Math.PI * r, p = Math.min(1, value / goal);
  return s('svg', { viewBox: '0 0 130 130', class: 'ring' },
    s('circle', { cx: 65, cy: 65, r, class: 'ring-bg' }),
    s('circle', { cx: 65, cy: 65, r, class: 'ring-fg', 'stroke-dasharray': `${c * p} ${c}`, transform: 'rotate(-90 65 65)' }),
    s('text', { x: 65, y: 62, class: 'ring-num' }, value),
    s('text', { x: 65, y: 84, class: 'ring-sub' }, `de ${goal} hoy`));
}

function areaCard(href, kicker, title, text, mastery) {
  const pct = Math.round(mastery * 100);
  return h('a', { class: 'area-card', href },
    h('span', { class: 'eyebrow' }, kicker),
    h('h3', {}, title),
    h('p', {}, text),
    h('div', { class: 'meter', role: 'img', 'aria-label': `Dominio ${pct}%` }, h('i', { style: `width:${pct}%` })),
    h('span', { class: 'meter-label' }, pct ? `${pct}% dominado` : 'Sin empezar'));
}

export function homeView(view) {
  function render() {
    const today = store.today(), streak = store.streak(), totals = store.totals();
    const goal = store.settings.goal;

    // Mapa de calor del mástil
    const heat = createFretboard({ numbers: true });
    heat.mark(FB_UNIVERSE.map((k) => {
      const [, st, f] = k.split(':').map(Number);
      const m = store.mastery(k);
      const cls = m === null ? 'h0' : m < 0.34 ? 'h1' : m < 0.67 ? 'h2' : m < 0.9 ? 'h3' : 'h4';
      return { s: st, f, cls: `heat ${cls}` };
    }));

    // Últimos 14 días
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ d, v: store.day(dayKey(d)) }); }
    const maxN = Math.max(goal, ...days.map((x) => x.v?.n || 0));
    const bars = h('div', { class: 'daybars' }, days.map(({ d, v }) =>
      h('div', { class: 'daybar', title: `${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })}: ${v?.n || 0} respuestas` },
        h('i', { class: v && v.n >= goal ? 'full' : '', style: `height:${((v?.n || 0) / maxN) * 100}%` }),
        h('span', {}, d.toLocaleDateString('es', { weekday: 'narrow' })))));

    const start = () => runSession(view, {
      title: 'Sesión de hoy', count: 12, next: mixedQuestion, onExit: render, onCleanup: micOff,
    });

    view.replaceChildren(
      h('section', { class: 'hero' },
        h('div', { class: 'hero-text' },
          h('p', { class: 'eyebrow' }, 'Cuaderno de teoría para guitarristas'),
          h('h1', {}, 'Las manos ya saben.', h('br'), h('em', {}, 'Ahora, la cabeza.')),
          h('p', { class: 'lede' }, 'Notas del mástil, tonalidades y lectura en pentagrama, en sesiones cortas que insisten justo donde más fallas.'),
          h('div', { class: 'hero-actions' },
            h('button', { class: 'btn btn-lg', type: 'button', onclick: start }, today.n ? 'Otra sesión mixta' : 'Empezar la sesión de hoy'),
            h('span', { class: 'hero-note' }, '12 preguntas · unos 3 minutos'))),
        h('div', { class: 'hero-stats' },
          ring(today.n, goal),
          h('div', { class: 'stat' }, h('b', {}, streak), streak === 1 ? 'día seguido' : 'días seguidos'),
          h('div', { class: 'stat' }, h('b', {}, totals.n ? `${Math.round((totals.ok / totals.n) * 100)}%` : '—'), 'aciertos totales'))),

      h('section', { class: 'areas' },
        areaCard('#/diapason', '01 · Diapasón', 'Cada nota, en cada traste', 'Explora el mástil, nombra posiciones y encuentra notas — con ratón o tocando tu guitarra.', store.areaMastery(FB_UNIVERSE)),
        areaCard('#/tonalidades', '02 · Tonalidades', 'Escalas mayores y menores', 'Círculo de quintas interactivo, armaduras, relativos y los acordes de cada tonalidad.', store.areaMastery(KEYS_UNIVERSE)),
        areaCard('#/lectura', '03 · Lectura', 'Del pentagrama al mástil', 'Lee notas en clave de sol y llévalas a la guitarra, de la primera posición al traste 12.', store.areaMastery(READ_UNIVERSE))),

      h('section', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', {}, h('p', { class: 'eyebrow' }, 'Tu mapa del mástil'), h('h2', {}, 'Dónde pisas seguro y dónde no')),
          h('div', { class: 'legend' }, h('i', { class: 'h0' }), 'sin practicar', h('i', { class: 'h1' }), 'flojo', h('i', { class: 'h2' }), h('i', { class: 'h3' }), h('i', { class: 'h4' }), 'dominado')),
        h('div', { class: 'fb-scroll' }, heat.el)),

      h('section', { class: 'split' },
        h('div', { class: 'card' },
          h('p', { class: 'eyebrow' }, 'Últimas dos semanas'), h('h2', {}, 'Constancia'), bars),
        h('div', { class: 'card settings' },
          h('p', { class: 'eyebrow' }, 'Ajustes'), h('h2', {}, 'A tu manera'),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombres de las notas'),
            segmented([{ value: 'latin', label: 'Do Re Mi' }, { value: 'anglo', label: 'C D E' }], store.settings.notation,
              (v) => { store.setSetting('notation', v); render(); })),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sonido'),
            segmented([{ value: true, label: 'Activado' }, { value: false, label: 'Silencio' }], store.settings.sound,
              (v) => store.setSetting('sound', v))),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Objetivo diario'),
            segmented([10, 20, 40].map((n) => ({ value: n, label: `${n} resp.` })), goal,
              (v) => { store.setSetting('goal', v); render(); })),
          h('button', {
            class: 'btn-ghost danger', type: 'button',
            onclick: () => { if (confirm('¿Borrar todo tu progreso? No se puede deshacer.')) { store.reset(); render(); } },
          }, 'Borrar mi progreso'))),
    );
  }
  render();
}
