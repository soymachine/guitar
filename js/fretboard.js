// Diapasón interactivo en SVG. Cuerda 1 (aguda) arriba, como en una tablatura.
import { s } from './ui.js';
import { FRETS } from './theory.js';

const W = 1000, NUT = 62, RIGHT = 990, TOP = 30, GAP = 34;
const fretX = (i) => NUT + (RIGHT - NUT) * (1 - Math.pow(2, -i / 30)) / (1 - Math.pow(2, -FRETS / 30));
export const cellX = (f) => (f === 0 ? NUT - 30 : (fretX(f - 1) + fretX(f)) / 2);
export const stringY = (st) => TOP + st * GAP;
const INLAYS = [3, 5, 7, 9];

export function createFretboard({ onPick, numbers = true } = {}) {
  const H = TOP + 5 * GAP + (numbers ? 58 : 30);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fretboard', role: 'img', 'aria-label': 'Diapasón de guitarra' });
  const bottom = stringY(5);

  svg.append(
    s('defs', {},
      s('linearGradient', { id: 'fb-wood', x1: 0, y1: 0, x2: 0, y2: 1 },
        s('stop', { offset: 0, 'stop-color': '#3b2619' }), s('stop', { offset: 0.5, 'stop-color': '#2c1b11' }), s('stop', { offset: 1, 'stop-color': '#3a2417' })),
      s('linearGradient', { id: 'fb-fret', x1: 0, y1: 0, x2: 1, y2: 0 },
        s('stop', { offset: 0, 'stop-color': '#8d7a55' }), s('stop', { offset: 0.5, 'stop-color': '#e9dcb6' }), s('stop', { offset: 1, 'stop-color': '#7d6c4b' }))),
    s('rect', { x: NUT, y: TOP - 15, width: RIGHT - NUT, height: 5 * GAP + 30, rx: 4, fill: 'url(#fb-wood)' }),
  );
  // Marcas de nácar
  const midY = (TOP + bottom) / 2;
  INLAYS.forEach((f) => svg.append(s('circle', { cx: cellX(f), cy: midY, r: 8, class: 'fb-inlay' })));
  svg.append(s('circle', { cx: cellX(12), cy: stringY(1) + GAP / 2 - GAP, r: 8, class: 'fb-inlay' }),
    s('circle', { cx: cellX(12), cy: stringY(4) + GAP / 2, r: 8, class: 'fb-inlay' }));
  // Cejuela y trastes
  svg.append(s('rect', { x: NUT - 7, y: TOP - 15, width: 9, height: 5 * GAP + 30, rx: 2, class: 'fb-nut' }));
  for (let f = 1; f <= FRETS; f++) {
    svg.append(s('rect', { x: fretX(f) - 2.2, y: TOP - 15, width: 4.4, height: 5 * GAP + 30, fill: 'url(#fb-fret)' }));
  }
  // Cuerdas
  const stringEls = [];
  for (let st = 0; st < 6; st++) {
    const line = s('line', { x1: 8, x2: RIGHT, y1: stringY(st), y2: stringY(st), class: 'fb-string' + (st >= 3 ? ' wound' : ''), 'stroke-width': 1.3 + st * 0.55 });
    stringEls.push(line);
    svg.append(line);
  }
  if (numbers) {
    for (let f = 1; f <= FRETS; f++) {
      const strong = INLAYS.includes(f) || f === 12;
      svg.append(s('text', { x: cellX(f), y: bottom + 46, class: 'fb-num' + (strong ? ' strong' : '') }, f));
    }
  }
  const markers = s('g', { class: 'fb-markers' });
  svg.append(markers);

  // Zonas pulsables
  if (onPick) {
    const hits = s('g', {});
    for (let st = 0; st < 6; st++) {
      for (let f = 0; f <= FRETS; f++) {
        const x0 = f === 0 ? 0 : fretX(f - 1), x1 = f === 0 ? NUT - 4 : fretX(f);
        hits.append(s('rect', {
          x: x0, y: stringY(st) - GAP / 2, width: x1 - x0, height: GAP, class: 'fb-hit',
          'data-s': st, 'data-f': f,
          onclick: () => onPick(st, f),
        }));
      }
    }
    svg.append(hits);
    svg.classList.add('pickable');
  }

  return {
    el: svg,
    /** list: [{s, f, label, cls}] */
    mark(list) {
      markers.replaceChildren();
      list.forEach((m) => this.add(m));
    },
    add({ s: st, f, label = '', cls = '' }) {
      const g = s('g', { class: `fb-mark ${cls}`, transform: `translate(${cellX(f)} ${stringY(st)})` },
        s('circle', { r: 13.5 }),
        label !== '' && s('text', { y: 0.5, class: String(label).length > 3 ? 'small' : '' }, label));
      markers.append(g);
      return g;
    },
    clear() { markers.replaceChildren(); },
    /** Atenúa las cuerdas que no están activas */
    activeStrings(set) {
      stringEls.forEach((el, i) => el.classList.toggle('dim', !!set && !set.has(i)));
    },
  };
}
