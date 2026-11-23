// Detección de tono por micrófono (autocorrelación) para practicar con la guitarra real.
import { audioCtx } from './audio.js';

/** Nivel mínimo (rms, ya con la sensibilidad aplicada) para intentar detectar una nota. */
export const GATE = 0.01;
const MIN_CLARITY = 0.45;

/**
 * Analiza un bloque de audio. Devuelve:
 *  rms: volumen · freq: Hz o -1 · clarity: 0..1 · reason: 'ok' | 'silent' | 'weak' | 'noisy'
 */
export function analyzePitch(buf, sampleRate, gate = GATE) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < gate) return { rms, freq: -1, clarity: 0, reason: rms < 1e-5 ? 'silent' : 'weak' };

  const minLag = Math.floor(sampleRate / 1400);          // por encima del Mi agudo del traste 24
  const maxLag = Math.min(Math.floor(sampleRate / 70), n >> 1); // por debajo del Mi grave
  const size = n - maxLag;
  const corr = new Float32Array(maxLag + 2);
  let c0 = 0;
  for (let i = 0; i < size; i++) c0 += buf[i] * buf[i];
  if (c0 <= 0) return { rms, freq: -1, clarity: 0, reason: 'silent' };
  let best = 0;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i < size; i++) s += buf[i] * buf[i + lag];
    corr[lag] = s / c0;
    if (corr[lag] > best) best = corr[lag];
  }
  if (best < MIN_CLARITY) return { rms, freq: -1, clarity: best, reason: 'noisy' };
  // Primer máximo local cercano al mejor: evita saltar a la octava inferior
  const thresh = best * 0.9;
  let lag = -1;
  for (let l = minLag + 1; l <= maxLag; l++) {
    if (corr[l] > thresh && corr[l] >= corr[l - 1] && corr[l] >= corr[l + 1]) { lag = l; break; }
  }
  if (lag < 0) return { rms, freq: -1, clarity: best, reason: 'noisy' };
  // Interpolación parabólica
  const a = corr[lag - 1], b = corr[lag], c = corr[lag + 1];
  const denom = a - 2 * b + c;
  const shift = denom ? 0.5 * (a - c) / denom : 0;
  return { rms, freq: sampleRate / (lag + shift), clarity: best, reason: 'ok' };
}

/** Devuelve la frecuencia fundamental en Hz, o -1 si no hay señal clara. */
export function detectPitch(buf, sampleRate) {
  return analyzePitch(buf, sampleRate).freq;
}

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const midiLabel = (m) => `${['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'][((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** Mensaje comprensible para los errores típicos al abrir el micrófono. */
export function friendlyMicError(err) {
  const name = err?.name || '';
  if (!window.isSecureContext) return 'El navegador solo permite el micrófono en páginas seguras (https).';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permiso denegado. Pulsa el icono del candado junto a la dirección, permite el micrófono para este sitio y recarga.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No encuentro ningún micrófono. Conecta uno o elige otro en la lista.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'No puedo usar el micrófono: puede que otra aplicación lo tenga ocupado.';
  return err?.message || 'No he podido abrir el micrófono.';
}

/** Lista de entradas de audio (las etiquetas solo aparecen cuando ya hay permiso). */
export async function listInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Micrófono ${i + 1}` }));
}

/**
 * Abre el micrófono y empieza a analizarlo en cada fotograma.
 * Devuelve una "sesión": { ctx, label, track, specNode, last, onFrame(fn), setGain(g), stop() }.
 * Cada fotograma ({ rms, db, freq, clarity, reason, midi, cents, note, ... }) llega a los suscriptores;
 * `note` es la nota MIDI estable (sostenida varios fotogramas) o null.
 */
export async function openMic({ deviceId = null, gain = 4 } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar el micrófono.');
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio });
  } catch (err) {
    if (deviceId && err?.name === 'OverconstrainedError') stream = await navigator.mediaDevices.getUserMedia({ audio }); // el dispositivo guardado ya no existe
    else throw err;
  }
  const ac = audioCtx();
  try { await ac.resume(); } catch { /* se mostrará "audio en pausa" con un botón */ }
  const track = stream.getAudioTracks()[0];
  const src = ac.createMediaStreamSource(stream);
  const gainNode = ac.createGain();
  gainNode.gain.value = gain;
  const pitchNode = ac.createAnalyser();
  pitchNode.fftSize = 4096;
  const specNode = ac.createAnalyser();
  specNode.fftSize = 8192;
  specNode.smoothingTimeConstant = 0.7;
  specNode.minDecibels = -100;
  specNode.maxDecibels = -20;
  // Salida a volumen 0: asegura que el navegador procese el grafo sin que se oiga el micro (evita acoples)
  const mute = ac.createGain();
  mute.gain.value = 0;
  src.connect(gainNode);
  gainNode.connect(pitchNode);
  gainNode.connect(specNode);
  gainNode.connect(mute).connect(ac.destination);

  const subs = new Set();
  const buf = new Float32Array(pitchNode.fftSize);
  let raf = 0, lastMidi = null, run = 0, silence = 0, stopped = false;
  const session = {
    ctx: ac, track, specNode, last: null, gain,
    label: track?.label || 'Micrófono',
    onFrame(fn) { subs.add(fn); return () => subs.delete(fn); },
    setGain(g) { session.gain = g; gainNode.gain.value = g; },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      subs.clear();
      try { src.disconnect(); gainNode.disconnect(); } catch { /* ya desconectado */ }
      stream.getTracks().forEach((t) => t.stop());
    },
  };

  const tick = () => {
    if (stopped) return;
    pitchNode.getFloatTimeDomainData(buf);
    const a = analyzePitch(buf, ac.sampleRate);
    let midi = null, cents = 0, note = null;
    if (a.freq > 0) {
      const exact = freqToMidi(a.freq);
      midi = Math.round(exact);
      cents = Math.round((exact - midi) * 100);
      silence = 0;
      if (midi === lastMidi) run++; else { lastMidi = midi; run = 1; }
      if (run >= 4) note = midi;
    } else if (++silence > 8) { lastMidi = null; run = 0; }
    const frame = {
      rms: a.rms, db: a.rms > 0 ? 20 * Math.log10(a.rms) : -120, freq: a.freq, clarity: a.clarity, reason: a.reason,
      midi, cents, note, state: ac.state, muted: !!track?.muted, ended: track?.readyState === 'ended', t: performance.now(),
    };
    session.last = frame;
    subs.forEach((fn) => fn(frame));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return session;
}
