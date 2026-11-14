import { h, segmented } from '../ui.js';
import { store } from '../store.js';
import { leaveView } from '../quiz.js';

/** Cabecera de sección + pestañas Explorar / Practicar */
export function tabs(view, { kicker, title, lede, prefKey, explorer, practice, extra }) {
  let tab = store.pref(prefKey, 'explore');
  if (!['explore', 'practice', extra?.id].includes(tab)) tab = 'explore';
  const host = h('div', { class: 'tab-host' });
  function render() {
    view.replaceChildren(
      h('header', { class: 'page-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, kicker), h('h1', {}, title), h('p', { class: 'lede' }, lede)),
        segmented([{ value: 'explore', label: 'Explorar' }, ...(extra ? [{ value: extra.id, label: extra.label }] : []), { value: 'practice', label: 'Practicar' }], tab,
          (v) => { tab = v; store.setPref(prefKey, v); fill(); }, { label: 'Modo' })),
      host);
    fill();
  }
  function fill() {
    leaveView();
    host.replaceChildren();
    if (tab === 'explore') explorer(host);
    else if (extra && tab === extra.id) extra.render(host, go);
    else practice(host, render);
  }
  /** Salta a otra pestaña desde dentro de una (p. ej. de Trucos a Practicar) */
  function go(id) { tab = id; store.setPref(prefKey, id); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  render();
}

export function exerciseCard(title, text, cta, onStart, cls = '', controls = null) {
  return h('article', { class: `ex-card ${cls}` },
    h('h3', {}, title), h('p', {}, text), controls,
    h('button', { class: 'btn', type: 'button', onclick: onStart }, cta));
}
