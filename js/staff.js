// Pentagrama en clave de sol dibujado en SVG.
import { s } from './ui.js';
import { sigNotes } from './theory.js';

const HALF = 6, BOTTOM_Y = 122, BOTTOM_STEP = 30; // Mi4 en la línea inferior
export const MIN_STEP = 23, MAX_STEP = 44;         // Mi grave al aire … Mi del traste 12
const stepY = (step) => BOTTOM_Y - (step - BOTTOM_STEP) * HALF;
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34];
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];
const GLYPH = { '-2': '𝄫', '-1': '♭', 0: '♮', 1: '♯', 2: '𝄪' };

/**
 * opts: { keySig, notes:[{step, acc?, cls?}], onPick(step), spacing, minWidth }
 * acc: alteración accidental que se dibuja junto a la nota (-1, 0 becuadro, 1) o undefined
 */
export function createStaff(opts = {}) {
  const svg = s('svg', { class: 'staff', role: 'img', 'aria-label': 'Pentagrama' });
  let ghost = null;
  let state = { keySig: 0, notes: [], spacing: 46, minWidth: 250, ...opts };

  function drawNote(g, x, n) {
    const y = stepY(n.step);
    for (let st = 28; st >= n.step; st -= 2) g.append(s('line', { x1: x - 13, x2: x + 13, y1: stepY(st), y2: stepY(st), class: 'st-ledger' }));
    for (let st = 40; st <= n.step; st += 2) g.append(s('line', { x1: x - 13, x2: x + 13, y1: stepY(st), y2: stepY(st), class: 'st-ledger' }));
    const grp = s('g', { class: `st-note ${n.cls || ''}` });
    grp.append(s('ellipse', { cx: x, cy: y, rx: 7.6, ry: 5.5, transform: `rotate(-22 ${x} ${y})` }));
    const up = n.step < 34;
    grp.append(s('line', { x1: up ? x + 7 : x - 7, x2: up ? x + 7 : x - 7, y1: y + (up ? -2 : 2), y2: y + (up ? -38 : 38), class: 'st-stem' }));
    if (n.acc !== undefined && n.acc !== null) grp.append(s('text', { x: x - 19, y: y, class: 'st-acc' }, GLYPH[n.acc]));
    if (n.label) grp.append(s('text', { x, y: 194, class: 'st-label' }, n.label));
    g.append(grp);
  }

  function render() {
    svg.replaceChildren();
    const sig = sigNotes(state.keySig);
    const sigW = sig.length * 12;
    const startX = 78 + sigW;
    const width = Math.max(state.minWidth, startX + Math.max(1, state.notes.length) * state.spacing + 8);
    svg.setAttribute('viewBox', `0 0 ${width} 200`);
    svg.style.maxWidth = `${width * 1.5}px`;
    for (let i = 0; i < 5; i++) svg.append(s('line', { x1: 6, x2: width - 6, y1: stepY(30 + i * 2), y2: stepY(30 + i * 2), class: 'st-line' }));
    svg.append(s('line', { x1: 6, x2: 6, y1: stepY(38), y2: stepY(30), class: 'st-line' }),
      s('line', { x1: width - 6, x2: width - 6, y1: stepY(38), y2: stepY(30), class: 'st-line' }));
    svg.append(s('text', { x: 14, y: stepY(32), class: 'st-clef' }, '𝄞'));
    const steps = state.keySig > 0 ? SHARP_STEPS : FLAT_STEPS;
    sig.forEach((n, i) => svg.append(s('text', { x: 60 + i * 12, y: stepY(steps[i]), class: 'st-acc sig' }, GLYPH[n.a])));
    const g = s('g', {});
    state.notes.forEach((n, i) => drawNote(g, startX + state.spacing * (i + 0.5) - 8, n));
    svg.append(g);

    if (state.onPick) {
      svg.classList.add('pickable');
      const gx = startX + state.spacing * 0.5 - 8;
      ghost = s('g', { class: 'st-ghost', visibility: 'hidden' });
      svg.append(ghost);
      const toStep = (ev) => {
        const r = svg.getBoundingClientRect();
        const y = (ev.clientY - r.top) * (200 / r.height);
        return Math.max(MIN_STEP, Math.min(MAX_STEP, Math.round(BOTTOM_STEP + (BOTTOM_Y - y) / HALF)));
      };
      svg.onpointermove = (ev) => {
        if (ev.pointerType === 'touch') return;
        ghost.replaceChildren();
        drawNote(ghost, gx, { step: toStep(ev) });
        ghost.setAttribute('visibility', 'visible');
      };
      svg.onpointerleave = () => ghost.setAttribute('visibility', 'hidden');
      svg.onclick = (ev) => state.onPick(toStep(ev));
    }
  }
  render();
  return {
    el: svg,
    update(patch) { state = { ...state, ...patch }; render(); },
  };
}
