import { h } from './ui.js';
import { leaveView } from './quiz.js';
import { homeView } from './views/home.js';
import { fretboardView } from './views/fretboard-view.js';
import { keysView } from './views/keys-view.js';
import { readingView } from './views/reading-view.js';

const ROUTES = [
  { path: '', label: 'Inicio', view: homeView },
  { path: 'diapason', label: 'Diapasón', view: fretboardView },
  { path: 'tonalidades', label: 'Tonalidades', view: keysView },
  { path: 'lectura', label: 'Lectura', view: readingView },
];

const view = document.getElementById('view');
const nav = document.getElementById('nav');
nav.append(...ROUTES.map((r) => h('a', { href: `#/${r.path}`, 'data-path': r.path }, r.label)));

function route() {
  const path = location.hash.replace(/^#\/?/, '');
  const r = ROUTES.find((x) => x.path === path) || ROUTES[0];
  leaveView();
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.path === r.path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  view.replaceChildren();
  view.className = `view view-${r.path || 'home'}`;
  r.view(view);
  window.scrollTo({ top: 0 });
  document.title = r.path ? `${r.label} · Mástil` : 'Mástil · teoría para guitarristas';
}
window.addEventListener('hashchange', route);
route();
