// Sonido de cuerda pulsada (síntesis Karplus-Strong) con Web Audio.
import { store } from './store.js';
import { midiFreq } from './theory.js';

let ctx = null;
let master = null;
const cache = new Map();

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Genera las muestras de una cuerda pulsada. Exportado para poder probar el detector de tono. */
export function pluckSamples(freq, sampleRate, seconds = 2.4) {
  const period = Math.max(2, Math.round(sampleRate / freq - 0.5));
  const len = Math.floor(sampleRate * seconds);
  const out = new Float32Array(len);
  const ring = new Float32Array(period);
  let last = 0;
  for (let i = 0; i < period; i++) { // ruido filtrado: púa más suave
    const white = Math.random() * 2 - 1;
    last = ring[i] = 0.55 * white + 0.45 * last;
  }
  const decay = freq < 200 ? 0.9965 : 0.995;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx], nxt = ring[(idx + 1) % period];
    out[i] = cur;
    ring[idx] = (cur + nxt) * 0.5 * decay;
    idx = (idx + 1) % period;
  }
  return { samples: out, trueFreq: sampleRate / (period + 0.5) };
}

export function playMidi(midi, when = 0, gain = 1) {
  if (!store.settings.sound) return;
  const ac = audioCtx();
  if (!ac) return;
  let entry = cache.get(midi);
  if (!entry) {
    const freq = midiFreq(midi);
    const { samples, trueFreq } = pluckSamples(freq, ac.sampleRate);
    const buf = ac.createBuffer(1, samples.length, ac.sampleRate);
    buf.getChannelData(0).set(samples);
    entry = { buf, rate: freq / trueFreq }; // corrige la afinación del periodo entero
    cache.set(midi, entry);
  }
  const src = ac.createBufferSource();
  src.buffer = entry.buf;
  src.playbackRate.value = entry.rate;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start(ac.currentTime + when);
}

/** Toca una secuencia; devuelve los timeouts para poder animar/cancelar. */
export function playSequence(midis, gap = 0.32, onNote) {
  const timers = [];
  midis.forEach((m, i) => {
    playMidi(m, i * gap);
    if (onNote) timers.push(setTimeout(() => onNote(i, m), i * gap * 1000));
  });
  return () => timers.forEach(clearTimeout);
}

export function playChord(midis) {
  midis.forEach((m, i) => playMidi(m, i * 0.035, 0.7));
}

/** Pequeño aviso sonoro de acierto / fallo */
export function blip(ok) {
  if (!store.settings.sound) return;
  const ac = audioCtx();
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  const t = ac.currentTime;
  if (ok) { o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.08); }
  else { o.frequency.setValueAtTime(196, t); o.frequency.linearRampToValueAtTime(147, t + 0.18); }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.26);
}
