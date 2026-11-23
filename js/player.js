/**
 * Appolonia — session player (clock-based, no drift).
 *
 * Time is measured with `now()` (ms), not by counting ticks; the interval
 * (every 250 ms) only samples the clock. Pausing freezes time. Overflow time
 * (e.g. a throttled background tab) is carried into the following steps.
 *
 * @module player
 */
import { playBell } from './audio.js';

/** Tick interval in ms. */
export const TICK_MS = 250;

/**
 * Sum of all step seconds of a session (pure).
 * @param {{steps?:Array<{seconds?:number}>}} session
 * @returns {number}
 */
export function sessionTotalSeconds(session) {
  const steps = (session && Array.isArray(session.steps)) ? session.steps : [];
  return steps.reduce((a, s) => a + Math.max(0, Number(s && s.seconds) || 0), 0);
}

/**
 * Create a player for a session.
 *
 * Handlers (all optional):
 *  - onStep(index, step): fired on the first play() for step 0 and on every step change.
 *  - onTick(stepRemainingSec, totalRemainingSec, totalElapsedSec): every tick while
 *    playing, and once after pause/next/prev. Remaining values are Math.ceil'ed,
 *    elapsed is Math.floor'ed (integers). totalElapsedSec is the position in the
 *    session timeline (sum of previous steps + elapsed in current step).
 *  - onFinish(totalSeconds): after the last step ends (or next() on the last step).
 *    totalSeconds = seconds of *effective* play time (wall-clock while playing,
 *    pauses excluded, skipped parts not counted), rounded.
 *  - onStateChange(isPlaying)
 *
 * Options: {bells=true, now=()=>Date.now(), setInterval, clearInterval}
 * Bells (only if bells !== false): first play() → 'soft' (a bell step at index 0 does
 * NOT additionally ring 'single'); entering a later 'bell' step → 'single'; finish → 'triple'.
 *
 * stop() clears timers without calling onFinish; the player is then inert.
 *
 * @param {{steps:Array<{type:string, seconds:number}>}} session
 * @param {object} [handlers]
 * @param {object} [options]
 * @returns {{play():void, pause():void, toggle():void, next():void, prev():void, stop():void,
 *   readonly index:number, readonly isPlaying:boolean, readonly totalSeconds:number,
 *   readonly finished:boolean, readonly elapsed:number}}
 */
export function createPlayer(session, handlers = {}, options = {}) {
  const steps = (session && Array.isArray(session.steps)) ? session.steps : [];
  const h = handlers || {};
  const opts = options || {};
  const bells = opts.bells !== false;
  const now = opts.now || (() => Date.now());
  const setI = opts.setInterval || ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearI = opts.clearInterval || ((id) => globalThis.clearInterval(id));
  const totalSeconds = sessionTotalSeconds(session);

  let index = 0;
  let playing = false;
  let started = false;
  let softPlayed = false;
  let finished = false;
  let stopped = false;
  let timer = null;
  let resumedAt = 0;       // ms, clock when current play segment began
  let stepBaseMs = 0;      // ms elapsed in current step before resumedAt
  let effectiveBaseMs = 0; // ms of effective play before resumedAt

  const call = (fn, ...a) => { if (typeof fn === 'function') { try { fn(...a); } catch (e) { console.error(e); } } };
  const bell = (kind) => { if (bells) { try { playBell(kind); } catch { /* ignore */ } } };
  const stepLen = (i) => Math.max(0, Number(steps[i] && steps[i].seconds) || 0) * 1000;
  const live = () => (playing ? now() - resumedAt : 0);
  const stepElapsedMs = () => stepBaseMs + live();
  const effectiveMs = () => effectiveBaseMs + live();
  const beforeMs = (i) => { let s = 0; for (let k = 0; k < i; k++) s += stepLen(k); return s; };

  function emitTick() {
    if (!steps.length) return;
    const se = Math.min(stepElapsedMs(), stepLen(index));
    const stepRem = Math.max(0, Math.ceil((stepLen(index) - se) / 1000 - 1e-9));
    const pos = beforeMs(index) + se;
    const totRem = Math.max(0, Math.ceil((totalSeconds * 1000 - pos) / 1000 - 1e-9));
    call(h.onTick, stepRem, totRem, Math.floor(pos / 1000 + 1e-9));
  }

  /** Freeze the running segment into the bases (keeps time consistent). */
  function rebase() {
    const t = now();
    if (playing) {
      const d = t - resumedAt;
      stepBaseMs += d;
      effectiveBaseMs += d;
    }
    resumedAt = t;
  }

  function enterStep(i, withBell = true) {
    index = i;
    call(h.onStep, index, steps[index]);
    if (withBell && steps[index] && steps[index].type === 'bell') bell('single');
  }

  function clearTimer() {
    if (timer !== null) { clearI(timer); timer = null; }
  }

  function finish() {
    if (finished) return;
    rebase();
    finished = true;
    const wasPlaying = playing;
    playing = false;
    clearTimer();
    if (wasPlaying) call(h.onStateChange, false);
    emitTick();
    bell('triple');
    call(h.onFinish, Math.round(Math.min(effectiveBaseMs, totalSeconds * 1000) / 1000));
  }

  function tick() {
    if (!playing || finished || stopped) return;
    rebase();
    // carry overflow across steps
    while (stepBaseMs >= stepLen(index)) {
      const over = stepBaseMs - stepLen(index);
      if (index >= steps.length - 1) { finish(); return; }
      stepBaseMs = over;
      enterStep(index + 1);
    }
    emitTick();
  }

  function play() {
    if (playing || finished || stopped) return;
    resumedAt = now();
    playing = true;
    if (!steps.length) { started = true; finish(); return; }
    if (!softPlayed) { softPlayed = true; bell('soft'); }
    if (!started) {
      started = true;
      enterStep(0, false);
    }
    call(h.onStateChange, true);
    clearTimer();
    timer = setI(tick, TICK_MS);
    tick();
  }

  function pause() {
    if (!playing || finished || stopped) return;
    rebase();
    playing = false;
    clearTimer();
    call(h.onStateChange, false);
    emitTick();
  }

  function goTo(i) {
    if (finished || stopped || !steps.length) return;
    rebase();
    if (!started) { started = true; }
    stepBaseMs = 0;
    if (i >= steps.length) { finish(); return; }
    enterStep(Math.max(0, i));
    emitTick();
  }

  return {
    play,
    pause,
    toggle() { if (playing) pause(); else play(); },
    /** Next step (restarts its time); on the last step finishes the session. */
    next() { goTo(index + 1); },
    /** Previous step (restarts its time); on step 0 restarts step 0. */
    prev() { goTo(index - 1); },
    /** Stop and release timers. Does not call onFinish. */
    stop() {
      if (stopped) return;
      const wasPlaying = playing;
      rebase();
      playing = false;
      stopped = true;
      clearTimer();
      if (wasPlaying) call(h.onStateChange, false);
    },
    get index() { return index; },
    get isPlaying() { return playing; },
    get finished() { return finished; },
    /** Effective seconds played so far (float). */
    get elapsed() { return effectiveMs() / 1000; },
    totalSeconds,
  };
}
