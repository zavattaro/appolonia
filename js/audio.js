/**
 * Appolonia — synthesized bells (Web Audio, no files).
 *
 * Singing-bowl timbre: several inharmonic sine partials with a short attack and
 * exponential decay. Without an AudioContext (node, old browsers) every function
 * is a silent no-op and never throws.
 *
 * @module audio
 */

/** Partial ratios and relative gains (singing bowl–like, inharmonic). */
const PARTIALS = [
  { r: 1, g: 1.0, d: 1.0 },
  { r: 2.76, g: 0.5, d: 0.8 },
  { r: 5.4, g: 0.25, d: 0.6 },
  { r: 8.93, g: 0.12, d: 0.45 },
];

let ctx = null;
let master = null;

function getCtor() {
  try {
    return globalThis.AudioContext || globalThis.webkitAudioContext || null;
  } catch {
    return null;
  }
}

function ensureCtx() {
  if (ctx) return ctx;
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  } catch {
    ctx = null; master = null;
  }
  return ctx;
}

/**
 * Create/resume the AudioContext. Call from a user gesture (tap/click) so that
 * browsers allow sound. Safe to call many times; no-op without Web Audio.
 * @returns {boolean} true if an AudioContext exists.
 */
export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return false;
  try {
    if (c.state === 'suspended' && c.resume) c.resume().catch(() => {});
  } catch { /* ignore */ }
  return true;
}

/**
 * Schedule one bowl strike.
 * @param {number} t0 start time (ctx.currentTime based)
 * @param {number} f0 fundamental Hz
 * @param {number} vol peak gain (0..1)
 * @param {number} decay seconds for the fundamental to fade (~-60 dB)
 */
function strike(t0, f0, vol, decay) {
  for (const p of PARTIALS) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    // tiny detune gives the bowl its slow beating
    osc.frequency.setValueAtTime(f0 * p.r * (1 + (Math.random() - 0.5) * 0.002), t0);
    const peak = Math.max(0.0002, vol * p.g);
    const d = decay * p.d;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  }
}

/**
 * Play a bell.
 *  - 'single': one strike (~330 Hz, ~5 s decay)
 *  - 'triple': three strikes ~1.8 s apart
 *  - 'soft'  : lower and quieter strike (~220 Hz)
 * No-op (never throws) without Web Audio.
 * @param {'single'|'triple'|'soft'} [kind='single']
 * @returns {boolean} true if sound was scheduled.
 */
export function playBell(kind = 'single') {
  try {
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended' && c.resume) c.resume().catch(() => {});
    const t = c.currentTime + 0.03;
    if (kind === 'triple') {
      for (let i = 0; i < 3; i++) strike(t + i * 1.8, 330, 0.32, 5);
    } else if (kind === 'soft') {
      strike(t, 220, 0.18, 6);
    } else {
      strike(t, 330, 0.32, 5);
    }
    return true;
  } catch {
    return false;
  }
}
