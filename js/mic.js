// Micrófono compartido: una sola captura abierta que usan los ejercicios, el explorador y el visor.
import { openMic } from './pitch.js';
import { store } from './store.js';

let session = null, starting = null, cancel = false;
const subs = new Set();

export const GAINS = [
  { value: 1, label: 'Normal ×1' },
  { value: 4, label: 'Alta ×4' },
  { value: 10, label: 'Muy alta ×10' },
  { value: 25, label: 'Máxima ×25' },
];
export const micPrefs = () => ({ deviceId: store.pref('mic.device', null), gain: store.pref('mic.gain', 4) });

export const micSession = () => session;

/** Se llama en cada fotograma de audio (de la sesión actual o de la que venga tras reiniciar). */
export function micSubscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

function adopt(s) {
  session = s;
  s.onFrame((f) => subs.forEach((fn) => fn(f)));
  return s;
}

/** Abre el micrófono si hace falta y devuelve la sesión. */
export function micStart() {
  cancel = false;
  if (session) return Promise.resolve(session);
  if (!starting) {
    starting = openMic(micPrefs())
      .then((s) => {
        if (cancel) { s.stop(); throw new Error('Micrófono cerrado antes de abrirse.'); }
        return adopt(s);
      })
      .finally(() => { starting = null; });
  }
  return starting;
}

/** Cierra el micrófono y olvida a los suscriptores (se llama al terminar un ejercicio). */
export function micStop() {
  subs.clear();
  if (session) { session.stop(); session = null; }
  else if (starting) cancel = true;
}

/** Reabre la captura (p. ej. tras cambiar de dispositivo) conservando a los suscriptores. */
export async function micRestart() {
  if (starting) { try { await starting; } catch { /* se reintenta abajo */ } }
  if (session) { session.stop(); session = null; }
  return micStart();
}

export function setMicGain(g) {
  store.setPref('mic.gain', g);
  session?.setGain(g);
}
export function setMicDevice(id) {
  store.setPref('mic.device', id);
  return micRestart();
}
