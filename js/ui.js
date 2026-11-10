// Utilidades de DOM
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}
function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

/** Control segmentado. options: [{value,label}] */
export function segmented(options, value, onChange, { label } = {}) {
  const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const btns = options.map((o) => h('button', {
    type: 'button', class: 'seg-btn', 'aria-pressed': String(o.value === value),
    onclick: () => { set(o.value); onChange(o.value); },
  }, o.label));
  function set(v) { btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v))); }
  wrap.append(...btns);
  wrap.set = set;
  return wrap;
}

/** Fila de "chips" de selección múltiple. */
export function multiChips(options, selected, onChange, { label, min = 1 } = {}) {
  const sel = new Set(selected);
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  options.forEach((o) => {
    const b = h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(sel.has(o.value)),
      onclick: () => {
        if (sel.has(o.value)) { if (sel.size <= min) return; sel.delete(o.value); } else sel.add(o.value);
        b.setAttribute('aria-pressed', String(sel.has(o.value)));
        onChange([...sel]);
      },
    }, o.label);
    wrap.append(b);
  });
  return wrap;
}

export function field(label, control) {
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}
