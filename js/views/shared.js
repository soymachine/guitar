import { h, segmented } from '../ui.js';
import { store } from '../store.js';
import { leaveView } from '../quiz.js';

/** Cabecera de sección + pestañas Explorar / Practicar */
export function tabs(view, { kicker, title, lede, prefKey, explorer, practice }) {
  let tab = store.pref(prefKey, 'explore');
  const host = h('div', { class: 'tab-host' });
  function render() {
    view.replaceChildren(
      h('header', { class: 'page-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, kicker), h('h1', {}, title), h('p', { class: 'lede' }, lede)),
        segmented([{ value: 'explore', label: 'Explorar' }, { value: 'practice', label: 'Practicar' }], tab,
          (v) => { tab = v; store.setPref(prefKey, v); fill(); }, { label: 'Modo' })),
      host);
    fill();
  }
  function fill() {
    leaveView();
    host.replaceChildren();
    tab === 'explore' ? explorer(host) : practice(host, render);
  }
  render();
}

export function exerciseCard(title, text, cta, onStart, cls = '') {
  return h('article', { class: `ex-card ${cls}` },
    h('h3', {}, title), h('p', {}, text),
    h('button', { class: 'btn', type: 'button', onclick: onStart }, cta));
}
