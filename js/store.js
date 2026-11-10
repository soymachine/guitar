// Persistencia en localStorage: ajustes, estadísticas por elemento y actividad diaria.
const KEY = 'mastil.v1';
const defaults = () => ({
  settings: { notation: 'latin', sound: true, goal: 20 },
  items: {},   // clave -> { ok, ko, t }
  days: {},    // 'YYYY-MM-DD' -> { n, ok }
  prefs: {},   // opciones de ejercicios recordadas
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') {
      const d = defaults();
      return { ...d, ...raw, settings: { ...d.settings, ...raw.settings } };
    }
  } catch { /* datos corruptos o localStorage no disponible */ }
  return defaults();
}

const data = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* sin espacio / modo privado */ }
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const store = {
  get settings() { return data.settings; },
  setSetting(k, v) { data.settings[k] = v; save(); },
  pref(k, fallback) { return k in data.prefs ? data.prefs[k] : fallback; },
  setPref(k, v) { data.prefs[k] = v; save(); },

  record(key, ok) {
    const it = data.items[key] || (data.items[key] = { ok: 0, ko: 0 });
    ok ? it.ok++ : it.ko++;
    it.t = Date.now();
    const day = data.days[dayKey()] || (data.days[dayKey()] = { n: 0, ok: 0 });
    day.n++; if (ok) day.ok++;
    save();
  },
  item(key) { return data.items[key]; },
  /** 0..1, o null si nunca se ha practicado. Pondera los pocos intentos. */
  mastery(key) {
    const it = data.items[key];
    if (!it) return null;
    const n = it.ok + it.ko;
    return (it.ok / n) * Math.min(1, n / 3);
  },
  /** Dominio medio sobre un universo de claves (las no vistas cuentan 0) */
  areaMastery(keys) {
    if (!keys.length) return 0;
    return keys.reduce((s, k) => s + (this.mastery(k) || 0), 0) / keys.length;
  },
  /** Elige una clave dando más peso a las que peor se llevan */
  weightedPick(keys) {
    const w = keys.map((k) => { const m = this.mastery(k); return m === null ? 4 : 1 + 4 * (1 - m); });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < keys.length; i++) { r -= w[i]; if (r <= 0) return keys[i]; }
    return keys[keys.length - 1];
  },
  today() { return data.days[dayKey()] || { n: 0, ok: 0 }; },
  day(k) { return data.days[k]; },
  streak() {
    let n = 0;
    const d = new Date();
    if (!data.days[dayKey(d)]) d.setDate(d.getDate() - 1); // hoy aún no cuenta en contra
    while (data.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
  totals() {
    return Object.values(data.days).reduce((a, d) => ({ n: a.n + d.n, ok: a.ok + d.ok }), { n: 0, ok: 0 });
  },
  reset() { Object.assign(data, defaults()); save(); },
};
