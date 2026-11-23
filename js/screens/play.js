// Appolonia — ekran odtwarzacza sesji
import { t } from '../i18n.js';
import { recordCompletion, getSettings } from '../storage.js';
import { hasPremiumAccess } from '../promo.js';
import { unlockAudio } from '../audio.js';
import { createPlayer } from '../player.js';
import { getSession } from '../state.js';
import { esc, go, fmtClock, stepKindLabel, announce } from '../ui.js';

export function renderPlayer(app, r) {
  const s = getSession(r.param);
  if (!s) { go('#/library'); return; }
  if (s.premium && !hasPremiumAccess()) { location.replace(`#/paywall?next=${encodeURIComponent(s.id)}`); return; }

  const settings = getSettings();
  const total = (s.steps || []).reduce((a, st) => a + (Number(st.seconds) || 0), 0);
  let audioUnlocked = false;
  let finished = false;
  let leaving = false;
  let wakeLock = null;

  app.innerHTML = `
    <section class="player" aria-labelledby="pl-title">
      <div class="player-top">
        <button type="button" class="icon-btn" id="pl-close" aria-label="${esc(t('player.close'))}">✕︎</button>
        <div class="ttl" id="pl-title">${esc(s.title)}</div>
        <span style="width:48px" aria-hidden="true"></span>
      </div>
      <div class="player-stage" aria-live="polite">
        <div class="step-kind" id="pl-kind"></div>
        <div id="pl-bell" class="bell-visual" aria-hidden="true" hidden>🔔</div>
        <h1 class="step-title" id="pl-step-title"></h1>
        <p class="step-text" id="pl-text"></p>
        <p class="step-ref" id="pl-ref" hidden></p>
      </div>
      <div>
        <div class="progress" role="progressbar" aria-label="${esc(t('player.progress'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="pl-bar"><span></span></div>
        <div class="time-row">
          <span id="pl-step-count"></span>
          <span><span class="sr-only">${esc(t('player.remaining'))}: </span><span id="pl-remaining">${fmtClock(total)}</span></span>
        </div>
        <div class="controls">
          <button type="button" class="icon-btn" id="pl-prev" aria-label="${esc(t('player.prev'))}">⏮︎</button>
          <button type="button" class="icon-btn big" id="pl-toggle" aria-label="${esc(t('player.play'))}">⏯︎</button>
          <button type="button" class="icon-btn" id="pl-next" aria-label="${esc(t('player.next'))}">⏭︎</button>
        </div>
      </div>
    </section>`;

  const el = (id) => app.querySelector('#' + id);
  const bar = el('pl-bar');
  const toggleBtn = el('pl-toggle');
  const stepCount = (s.steps || []).length;

  async function requestWake() {
    if (!settings.keepAwake || !('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  function releaseWake() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  function onVisibility() {
    if (document.visibilityState === 'visible' && player && player.isPlaying) requestWake();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function showDone(seconds) {
    const mins = Math.max(1, Math.round((seconds || total) / 60));
    app.innerHTML = `
      <section class="done" aria-labelledby="done-h">
        <div class="cross" aria-hidden="true">✝</div>
        <h1 id="done-h">${esc(t('player.done_title'))}</h1>
        <p class="serif" style="font-size:1.2rem">${esc(t('player.done_subtitle'))}</p>
        <p class="muted">${esc(t('player.done_text', { n: mins }))}</p>
        <div class="btn-row">
          <a class="btn" href="#/home">${esc(t('common.back_home'))}</a>
          <a class="btn secondary" href="#/progress">${esc(t('nav.progress'))}</a>
        </div>
      </section>`;
    const h = app.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }

  const player = createPlayer(s, {
    onStep(index, step) {
      const isBell = step.type === 'bell';
      const kind = stepKindLabel(step.type);
      const title = step.title || (isBell ? t('player.bell_title') : '');
      el('pl-kind').textContent = kind && kind !== title ? kind : '';
      el('pl-bell').hidden = !isBell;
      el('pl-step-title').textContent = title;
      el('pl-text').textContent = step.text || (isBell ? t('player.bell_text') : '');
      const ref = el('pl-ref');
      ref.hidden = !step.ref;
      ref.textContent = step.ref ? `— ${step.ref}` : '';
      el('pl-step-count').textContent = t('player.step_of', { n: index + 1, total: stepCount });
      el('pl-prev').disabled = index === 0;
    },
    onTick(stepRemaining, totalRemaining, totalElapsed) {
      const denom = (totalElapsed + totalRemaining) || total || 1;
      const pct = Math.min(100, Math.max(0, Math.round((totalElapsed / denom) * 100)));
      bar.firstElementChild.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', String(pct));
      el('pl-remaining').textContent = fmtClock(totalRemaining);
    },
    onStateChange(isPlaying) {
      toggleBtn.setAttribute('aria-label', isPlaying ? t('player.pause') : t('player.play'));
      toggleBtn.setAttribute('aria-pressed', String(isPlaying));
      toggleBtn.textContent = isPlaying ? '⏸\uFE0E' : '▶\uFE0E';
      if (isPlaying) requestWake(); else releaseWake();
    },
    onFinish(totalSeconds) {
      if (finished || leaving) return;
      finished = true;
      releaseWake();
      try { recordCompletion(s.id, Math.round(totalSeconds || total)); } catch (e) { console.error(e); }
      announce(t('player.done_title'));
      showDone(totalSeconds);
    },
  }, { bells: settings.bells !== false });

  function unlockOnce() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try { unlockAudio(); } catch (e) { console.warn(e); }
  }

  app.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    unlockOnce();
    switch (b.id) {
      case 'pl-toggle': player.toggle(); break;
      case 'pl-next': player.next(); break;
      case 'pl-prev': player.prev(); break;
      case 'pl-close':
        leaving = true;
        player.stop();
        go(`#/session/${encodeURIComponent(s.id)}`);
        break;
    }
  };

  function onKey(e) {
    if (finished || e.target.closest('input, textarea')) return;
    if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); unlockOnce(); player.toggle(); }
    else if (e.key === 'ArrowRight') player.next();
    else if (e.key === 'ArrowLeft') player.prev();
  }
  document.addEventListener('keydown', onKey);

  player.play();

  return () => {
    leaving = true;
    app.onclick = null;
    try { if (!finished) player.stop(); } catch (e) { /* ignoruj */ }
    releaseWake();
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
  };
}
