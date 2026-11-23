/**
 * Appolonia — local persistence (localStorage, prefix `appolonia.`, JSON values).
 *
 * No data ever leaves the device. When localStorage is unavailable or throws
 * (private mode, quota, node without a shim), everything transparently falls back
 * to an in-memory Map for the lifetime of the page.
 *
 * Keys used (all prefixed with `appolonia.`):
 *   favorites  string[]
 *   progress   {totalSessions, totalSeconds, streakDays, lastDate, completed}
 *   history    Array<{id, date:ISO, seconds}> (newest last, max 50)
 *   consent    {accepted:true, analytics, date, version:1}
 *   onboarded  bool
 *   premium    bool
 *   settings   {bells, keepAwake, textSize}
 *
 * @module storage
 */

export const PREFIX = 'appolonia.';
/** Minimum seconds for a session to count as completed. */
export const MIN_COMPLETION_SECONDS = 30;
/** Max entries kept in history. */
export const HISTORY_LIMIT = 50;
const DEFAULT_SETTINGS = Object.freeze({ bells: true, keepAwake: false, textSize: 'm' });

const memory = new Map();

/** @returns {Storage|null} the real localStorage if usable right now. */
function ls() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    return s;
  } catch {
    return null;
  }
}

function rawGet(fullKey) {
  const s = ls();
  if (s) {
    try { return s.getItem(fullKey); } catch { /* fall through */ }
  }
  return memory.has(fullKey) ? memory.get(fullKey) : null;
}

function rawSet(fullKey, str) {
  const s = ls();
  if (s) {
    try { s.setItem(fullKey, str); memory.delete(fullKey); return; } catch { /* fall through */ }
  }
  memory.set(fullKey, str);
}

function rawRemove(fullKey) {
  memory.delete(fullKey);
  const s = ls();
  if (s) { try { s.removeItem(fullKey); } catch { /* ignore */ } }
}

/** @returns {string[]} all full keys (with prefix) from localStorage + memory. */
function allPrefixedKeys() {
  const keys = new Set();
  const s = ls();
  if (s) {
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(PREFIX)) keys.add(k);
      }
    } catch { /* ignore */ }
  }
  for (const k of memory.keys()) if (k.startsWith(PREFIX)) keys.add(k);
  return [...keys];
}

/**
 * Generic JSON store. Keys are given WITHOUT the prefix.
 * get() returns `def` when the key is missing or holds invalid JSON.
 */
export const store = {
  /** @param {string} key @param {*} [def=null] @returns {*} */
  get(key, def = null) {
    const raw = rawGet(PREFIX + key);
    if (raw === null || raw === undefined) return def;
    try { return JSON.parse(raw); } catch { return def; }
  },
  /** @param {string} key @param {*} val */
  set(key, val) {
    rawSet(PREFIX + key, JSON.stringify(val));
  },
  /** @param {string} key */
  remove(key) {
    rawRemove(PREFIX + key);
  },
};

// ---------- dates ----------

/**
 * Local calendar day as 'YYYY-MM-DD'.
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' of the local day before the given key. */
function previousDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d - 1));
}

// ---------- favorites ----------

/** @returns {string[]} favorite session ids. */
export function getFavorites() {
  const f = store.get('favorites', []);
  return Array.isArray(f) ? f.filter((x) => typeof x === 'string') : [];
}

/** @param {string} id @returns {boolean} */
export function isFavorite(id) {
  return getFavorites().includes(id);
}

/**
 * Toggle a favorite.
 * @param {string} id
 * @returns {boolean} the new state (true = now favorite).
 */
export function toggleFavorite(id) {
  const favs = getFavorites();
  const i = favs.indexOf(id);
  if (i >= 0) favs.splice(i, 1); else favs.push(id);
  store.set('favorites', favs);
  return i < 0;
}

// ---------- progress ----------

function readProgressRaw() {
  const p = store.get('progress', null) || {};
  return {
    totalSessions: Number(p.totalSessions) || 0,
    totalSeconds: Number(p.totalSeconds) || 0,
    streakDays: Number(p.streakDays) || 0,
    lastDate: typeof p.lastDate === 'string' ? p.lastDate : null,
    completed: p.completed && typeof p.completed === 'object' ? { ...p.completed } : {},
  };
}

/**
 * Record a finished session. Ignored (returns false) when seconds < 30.
 * Streak: consecutive local days with ≥1 completion. Completing on the same day
 * as lastDate keeps the streak; on the following day increments it; after a gap
 * resets to 1. A date earlier than lastDate counts toward totals but does not
 * change the streak.
 * @param {string} sessionId
 * @param {number} seconds effective seconds meditated
 * @param {Date} [date=new Date()]
 * @returns {boolean} true if it was counted.
 */
export function recordCompletion(sessionId, seconds, date = new Date()) {
  const secs = Number(seconds) || 0;
  if (secs < MIN_COMPLETION_SECONDS) return false;
  const p = readProgressRaw();
  const day = localDateKey(date);
  p.totalSessions += 1;
  p.totalSeconds += secs;
  p.completed[sessionId] = (Number(p.completed[sessionId]) || 0) + 1;
  if (!p.lastDate) {
    p.streakDays = 1; p.lastDate = day;
  } else if (day === p.lastDate) {
    if (p.streakDays < 1) p.streakDays = 1;
  } else if (day > p.lastDate) {
    p.streakDays = previousDayKey(day) === p.lastDate ? p.streakDays + 1 : 1;
    p.lastDate = day;
  }
  store.set('progress', p);

  const hist = getHistory();
  hist.push({ id: sessionId, date: date.toISOString(), seconds: secs });
  store.set('history', hist.slice(-HISTORY_LIMIT));
  return true;
}

/**
 * Current progress. streakDays is the *current* streak: the stored streak if the
 * last completion was today or yesterday (local), otherwise 0.
 * @param {Date} [today=new Date()] reference "now" (for tests)
 * @returns {{totalSessions:number, totalMinutes:number, streakDays:number, lastDate:string|null, completed:Object<string,number>}}
 */
export function getProgress(today = new Date()) {
  const p = readProgressRaw();
  const t = localDateKey(today);
  const alive = p.lastDate && (p.lastDate === t || p.lastDate === previousDayKey(t));
  return {
    totalSessions: p.totalSessions,
    totalMinutes: Math.round(p.totalSeconds / 60),
    streakDays: alive ? p.streakDays : 0,
    lastDate: p.lastDate,
    completed: p.completed,
  };
}

/** @returns {Array<{id:string, date:string, seconds:number}>} last ≤50 completions, oldest first. */
export function getHistory() {
  const h = store.get('history', []);
  return Array.isArray(h) ? h : [];
}

// ---------- consent / onboarding / premium / settings ----------

/** @returns {null | {accepted:true, analytics:boolean, date:string, version:1}} */
export function getConsent() {
  const c = store.get('consent', null);
  return c && c.accepted === true ? c : null;
}

/** @param {{analytics?:boolean}} [opts] @returns {{accepted:true, analytics:boolean, date:string, version:1}} */
export function setConsent({ analytics = false } = {}) {
  const c = { accepted: true, analytics: !!analytics, date: new Date().toISOString(), version: 1 };
  store.set('consent', c);
  return c;
}

/** @returns {boolean} */
export function isOnboarded() { return store.get('onboarded', false) === true; }
/** @param {boolean} [v=true] */
export function setOnboarded(v = true) { store.set('onboarded', !!v); }

/** Simulated paywall flag. @returns {boolean} */
export function isPremium() { return store.get('premium', false) === true; }
/** @param {boolean} [v=true] */
export function setPremium(v = true) { store.set('premium', !!v); }

/** @returns {{bells:boolean, keepAwake:boolean, textSize:'s'|'m'|'l'|string}} */
export function getSettings() {
  const s = store.get('settings', null);
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

/** Merge a partial into settings. @param {object} partial @returns {object} the new settings */
export function setSettings(partial = {}) {
  const next = { ...getSettings(), ...(partial || {}) };
  store.set('settings', next);
  return next;
}

// ---------- maintenance ----------

/** Delete every key with the `appolonia.` prefix (other keys untouched). */
export function resetAll() {
  for (const k of allPrefixedKeys()) rawRemove(k);
}

/**
 * Export all app data (for GDPR "download my data").
 * @returns {Object<string,*>} map key-without-prefix → parsed value (raw string if not JSON).
 */
export function exportData() {
  const out = {};
  for (const full of allPrefixedKeys()) {
    const raw = rawGet(full);
    let v;
    try { v = JSON.parse(raw); } catch { v = raw; }
    out[full.slice(PREFIX.length)] = v;
  }
  return out;
}
