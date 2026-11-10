// Detección de tono por micrófono (autocorrelación) para practicar con la guitarra real.
import { audioCtx } from './audio.js';

/** Devuelve la frecuencia fundamental en Hz, o -1 si no hay señal clara. */
export function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return -1;

  const minLag = Math.floor(sampleRate / 1400);          // por encima del Mi agudo del traste 24
  const maxLag = Math.min(Math.floor(sampleRate / 70), n >> 1); // por debajo del Mi grave
  const size = n - maxLag;
  const corr = new Float32Array(maxLag + 2);
  let c0 = 0;
  for (let i = 0; i < size; i++) c0 += buf[i] * buf[i];
  if (c0 <= 0) return -1;
  let best = 0;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i < size; i++) s += buf[i] * buf[i + lag];
    corr[lag] = s / c0;
    if (corr[lag] > best) best = corr[lag];
  }
  if (best < 0.5) return -1;
  // Primer máximo local cercano al mejor: evita saltar a la octava inferior
  const thresh = best * 0.9;
  let lag = -1;
  for (let l = minLag + 1; l <= maxLag; l++) {
    if (corr[l] > thresh && corr[l] >= corr[l - 1] && corr[l] >= corr[l + 1]) { lag = l; break; }
  }
  if (lag < 0) return -1;
  // Interpolación parabólica
  const a = corr[lag - 1], b = corr[lag], c = corr[lag + 1];
  const denom = a - 2 * b + c;
  const shift = denom ? 0.5 * (a - c) / denom : 0;
  return sampleRate / (lag + shift);
}

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

/**
 * Escucha el micrófono. onNote(midi, cents) se llama en cada fotograma con nota estable; onNote(null) al hacerse el silencio.
 * Devuelve una promesa con la función stop().
 */
export async function listen(onNote) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar el micrófono.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ac = audioCtx();
  const srcNode = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  srcNode.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let raf = 0, lastMidi = null, run = 0, reported = undefined, silence = 0, stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);
    const f = detectPitch(buf, ac.sampleRate);
    if (f > 0) {
      const exact = freqToMidi(f), m = Math.round(exact);
      silence = 0;
      if (m === lastMidi) run++; else { lastMidi = m; run = 1; }
      if (run >= 4) { reported = m; onNote(m, Math.round((exact - m) * 100)); }
    } else if (++silence > 12) {
      lastMidi = null; run = 0;
      if (reported !== null) { reported = null; onNote(null, 0); }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    srcNode.disconnect();
    stream.getTracks().forEach((t) => t.stop());
  };
}
