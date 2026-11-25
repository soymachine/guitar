// Visor del micrófono: espectro en vivo, nivel, nota detectada y diagnóstico de por qué no se oye nada.
import { h } from './ui.js';
import * as T from './theory.js';
import { GATE, midiToFreq, midiLabel, friendlyMicError, listInputs, inClaudeArtifact } from './pitch.js';
import { micSession, micPrefs, GAINS, setMicGain, setMicDevice } from './mic.js';

const FMIN = 60, FMAX = 1200, LR = Math.log(FMAX / FMIN);
const xOf = (f, w) => (Math.log(f / FMIN) / LR) * w;
const DB_MIN = -70;
const gatePct = ((20 * Math.log10(GATE) - DB_MIN) / -DB_MIN) * 100;
const STRING_NAMES = ['Mi', 'La', 'Re', 'Sol', 'Si', 'Mi'];
const OPEN_HZ = [...T.OPEN].reverse().map(midiToFreq); // de la 6ª a la 1ª

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Devuelve { el, start(), fail(err) }. Llama a start() cuando el elemento ya esté en la página;
 * el visor se detiene solo cuando el elemento se quita del documento.
 */
export function createMicMonitor() {
  const canvas = h('canvas', { class: 'mic-canvas', role: 'img', 'aria-label': 'Frecuencias que capta el micrófono' });
  const pill = h('span', { class: 'mic-pill wait' }, 'Conectando…');
  const resumeBtn = h('button', { class: 'btn-ghost', type: 'button', hidden: true, onclick: () => micSession()?.ctx.resume() }, 'Activar audio');
  const meterFill = h('i');
  const meter = h('div', { class: 'mic-meter', role: 'img', 'aria-label': 'Volumen de entrada' },
    meterFill, h('b', { class: 'mic-gate', style: `left:${gatePct}%`, title: 'Por debajo de esta marca no se intenta detectar la nota' }));
  const readout = h('div', { class: 'mic-readout' });
  const gear = h('button', {
    class: 'mic-gear', type: 'button', title: 'Micrófono y sensibilidad', 'aria-label': 'Ajustes del micrófono', 'aria-expanded': 'false',
    onclick: () => { controlsTouched = true; setControls(controls.hidden); },
  }, '⚙');
  const help = h('div', { class: 'mic-help', hidden: true },
    h('b', {}, 'Si no llega sonido, prueba esto:'),
    h('ul', {},
      h('li', {}, 'Mira que el navegador tenga permiso para usar el micrófono (icono del candado junto a la dirección).'),
      h('li', {}, 'Elige abajo otro micrófono: el predeterminado puede ser uno que no usas (cámara, auriculares…).'),
      h('li', {}, 'Comprueba que no esté silenciado en el sistema ni con un interruptor físico.'),
      h('li', {}, 'Con «Señal débil»: toca más cerca o sube la sensibilidad (⚙).'),
      h('li', {}, 'Si usas interfaz de audio o pedalera, revisa que esté seleccionada como entrada.')));
  const deviceSel = h('select', {
    class: 'select', 'aria-label': 'Micrófono',
    onchange: async (ev) => {
      failed = null;
      try { await setMicDevice(ev.target.value || null); } catch (err) { failed = friendlyMicError(err); }
    },
  }, h('option', { value: '' }, 'Predeterminado'));
  const gainSel = h('select', {
    class: 'select', 'aria-label': 'Sensibilidad',
    onchange: (ev) => setMicGain(Number(ev.target.value)),
  }, GAINS.map((g) => h('option', { value: g.value, selected: g.value === micPrefs().gain }, g.label)));
  const controls = h('div', { class: 'mic-controls', hidden: true },
    h('label', {}, h('span', { class: 'field-label' }, 'Micrófono'), deviceSel),
    h('label', {}, h('span', { class: 'field-label' }, 'Sensibilidad'), gainSel));
  const el = h('div', { class: 'mic-monitor' },
    h('div', { class: 'mic-top' }, pill, readout, resumeBtn, gear),
    canvas,
    meter,
    help,
    controls);
  let controlsTouched = false;
  function setControls(open) { controls.hidden = !open; gear.setAttribute('aria-expanded', String(open)); }

  const colors = { amber: css('--amber') || '#f0a23b', teal: css('--teal') || '#6cc2b0', muted: css('--muted') || '#ab9a82', line: css('--line') || '#3d2f23', cream: css('--cream') || '#f3e8d3' };
  const g2 = canvas.getContext('2d');
  let raf = 0, failed = null, seen = false, waiting = 0, lastSession = null, specBuf = null, since = 0, everSignal = false;
  let lastPill = '', lastText = '';

  function setPill(kind, text) {
    if (lastPill === kind + text) return;
    lastPill = kind + text;
    pill.className = `mic-pill ${kind}`;
    pill.textContent = text;
  }
  function setReadout(text) {
    if (text !== lastText) { lastText = text; readout.textContent = text; }
  }

  async function refreshDevices(sess) {
    try {
      const inputs = await listInputs();
      const current = sess.track?.getSettings?.().deviceId || micPrefs().deviceId || '';
      deviceSel.replaceChildren(h('option', { value: '' }, `Predeterminado · ${sess.label}`),
        ...inputs.filter((d) => d.id && d.id !== 'default').map((d) => h('option', { value: d.id, selected: d.id === current && !!micPrefs().deviceId }, d.label)));
    } catch { /* sin lista de dispositivos */ }
  }

  function drawSpectrum(sess, f) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);
    const base = H - 16;
    g2.font = '10px "Instrument Sans", sans-serif';
    g2.textAlign = 'center';
    // Rejilla
    g2.strokeStyle = colors.line; g2.fillStyle = colors.muted; g2.lineWidth = 1;
    for (const hz of [100, 200, 400, 800]) {
      const x = xOf(hz, W);
      g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, base); g2.stroke();
      g2.fillText(`${hz} Hz`, x, 10);
    }
    // Cuerdas al aire
    OPEN_HZ.forEach((hz, i) => {
      const x = xOf(hz, W);
      g2.fillStyle = colors.muted;
      g2.fillRect(x - 0.5, base, 1, 4);
      g2.fillText(STRING_NAMES[i], x, H - 2);
    });
    // Espectro
    if (sess && specBuf && sess.ctx.state === 'running') {
      sess.specNode.getFloatFrequencyData(specBuf);
      const binHz = sess.ctx.sampleRate / sess.specNode.fftSize;
      const grad = g2.createLinearGradient(0, 0, 0, base);
      grad.addColorStop(0, colors.amber); grad.addColorStop(1, 'rgba(240,162,59,.08)');
      g2.fillStyle = grad;
      g2.beginPath(); g2.moveTo(0, base);
      for (let x = 0; x <= W; x += 2) {
        const b0 = Math.max(1, Math.floor((FMIN * Math.exp((LR * x) / W)) / binHz));
        const b1 = Math.max(b0 + 1, Math.ceil((FMIN * Math.exp((LR * (x + 2)) / W)) / binHz));
        let v = -140;
        for (let b = b0; b < b1; b++) if (specBuf[b] > v) v = specBuf[b];
        const k = Math.min(1, Math.max(0, (v - sess.specNode.minDecibels) / (sess.specNode.maxDecibels - sess.specNode.minDecibels)));
        g2.lineTo(x, base - k * (base - 12));
      }
      g2.lineTo(W, base); g2.closePath(); g2.fill();
    }
    // Nota detectada
    const mark = (hz, color, label, dash, labelY) => {
      if (hz < FMIN || hz > FMAX) return;
      const x = xOf(hz, W);
      g2.strokeStyle = color; g2.fillStyle = color; g2.lineWidth = 2;
      g2.setLineDash(dash ? [4, 3] : []);
      g2.beginPath(); g2.moveTo(x, 14); g2.lineTo(x, base); g2.stroke();
      g2.setLineDash([]);
      g2.textAlign = x > W - 60 ? 'right' : 'left';
      g2.fillText(label, x + (x > W - 60 ? -4 : 4), labelY);
    };
    if (f && f.freq > 0) mark(f.freq, colors.cream, midiLabel(f.midi), false, 24);
  }

  function frameLoop() {
    if (!el.isConnected) {
      if (seen) return;                    // lo quitaron de la página: parar
      if (++waiting > 180) return;         // nunca llegó a mostrarse
    } else seen = true;
    const sess = micSession();
    if (sess !== lastSession) {
      lastSession = sess;
      if (sess) { specBuf = new Float32Array(sess.specNode.frequencyBinCount); since = performance.now(); everSignal = false; refreshDevices(sess); }
    }
    const f = sess?.last;
    // Estado
    let kind = 'wait', text = 'Conectando… acepta el permiso';
    if (failed) { kind = 'bad'; text = 'Sin micrófono'; }
    else if (sess && f) {
      if (f.ended) { kind = 'bad'; text = 'Micro desconectado'; }
      else if (f.state !== 'running') { kind = 'bad'; text = 'Audio en pausa'; }
      else if (f.muted) { kind = 'bad'; text = 'Micro silenciado'; }
      else if (f.rms < 1e-5) { kind = 'bad'; text = 'Silencio total'; }
      else if (f.rms < GATE) { kind = 'warn'; text = 'Señal débil'; }
      else if (f.freq <= 0) { kind = 'info'; text = 'Sonido sin nota clara'; }
      else { kind = 'ok'; text = `Oyendo ${midiLabel(f.midi)}`; }
      if (f.rms >= GATE) everSignal = true;
    }
    setPill(kind, text);
    resumeBtn.hidden = !(sess && f && f.state !== 'running');
    // Dentro de un artifact los consejos del navegador no sirven: el mensaje de error ya lo explica
    help.hidden = inClaudeArtifact() || !(failed || (sess && !everSignal && performance.now() - since > 5000));
    if (!help.hidden && !controlsTouched && controls.hidden) setControls(true); // si no llega sonido, ofrece cambiar de micro

    // Nivel
    const db = f ? Math.max(DB_MIN, f.db) : DB_MIN;
    meterFill.style.width = `${((db - DB_MIN) / -DB_MIN) * 100}%`;
    meterFill.className = f && f.rms >= GATE ? 'hot' : '';
    // Texto
    if (failed) setReadout(failed);
    else if (!f) setReadout('');
    else {
      const parts = [`${f.rms < 1e-5 ? '−∞' : Math.round(f.db)} dB`];
      if (f.freq > 0) parts.push(`${midiLabel(f.midi)} · ${f.freq.toFixed(1)} Hz · ${f.cents > 0 ? '+' : ''}${f.cents}¢`);
      setReadout(parts.join(' · '));
    }
    drawSpectrum(sess, f);
    raf = requestAnimationFrame(frameLoop);
  }

  return {
    el,
    start() { cancelAnimationFrame(raf); raf = requestAnimationFrame(frameLoop); },
    fail(err) { failed = friendlyMicError(err); },
  };
}
