// Appolonia — Start, Biblioteka, szczegóły sesji, Ulubione, Postępy
import { t } from '../i18n.js';
import * as storage from '../storage.js';
const { getFavorites, isFavorite, toggleFavorite, getProgress } = storage;
import { unlockAudio } from '../audio.js';
import { hasPremiumAccess, isPromoActive, promoLabelKey } from '../promo.js';
import { state, getSession, getCategory } from '../state.js';
import { esc, go, sessionCard, fmtMinutes, fmtDate, stepKindLabel, toast, announce } from '../ui.js';

const DAY_MYSTERY = {
  0: 'rozaniec-chwalebne', // niedziela
  1: 'rozaniec-radosne',   // poniedziałek
  2: 'rozaniec-bolesne',   // wtorek
  3: 'rozaniec-chwalebne', // środa
  4: 'rozaniec-swietla',   // czwartek
  5: 'rozaniec-bolesne',   // piątek
  6: 'rozaniec-radosne',   // sobota
};

/** Sesja z polem "date" równym dzisiejszej dacie lokalnej (np. seria adwentowa "adwent-2026-MM-DD"). */
export function datedSessionFor(date = new Date()) {
  const key = storage.localDateKey(date);
  return state.sessions.find((s) => s && s.date === key) || null;
}

export function sessionOfDay(date = new Date()) {
  return datedSessionFor(date) || getSession(DAY_MYSTERY[date.getDay()]) || state.sessions[0] || null;
}

export function isLocked(s) { return !!(s && s.premium && !hasPremiumAccess()); }

function catIcon(s) { const c = getCategory(s.category); return c ? c.icon : ''; }
function catTitle(c) { return c ? t(c.titleKey || ('cat.' + c.id)) : ''; }
function card(s) { return sessionCard(s, { locked: isLocked(s), catIcon: catIcon(s) }); }

function weekdayName(date) {
  switch (date.getDay()) {
    case 0: return t('day.sun');
    case 1: return t('day.mon');
    case 2: return t('day.tue');
    case 3: return t('day.wed');
    case 4: return t('day.thu');
    case 5: return t('day.fri');
    default: return t('day.sat');
  }
}

function statsBlock(p) {
  return `<div class="stats">
    <div class="stat"><span class="n">${p.totalSessions || 0}</span><span class="l">${esc(t('progress.sessions'))}</span></div>
    <div class="stat"><span class="n">${p.totalMinutes || 0}</span><span class="l">${esc(t('progress.minutes'))}</span></div>
    <div class="stat"><span class="n">${p.streakDays || 0}</span><span class="l">${esc(t('progress.streak'))}</span></div>
  </div>`;
}

export function renderHome(app) {
  const now = new Date();
  const h = now.getHours();
  const greeting = h >= 18 || h < 4 ? t('home.greeting_evening') : t('home.greeting_morning');
  const sod = sessionOfDay(now);
  const p = getProgress();

  app.innerHTML = `
    <header>
      <h1 class="greeting">${esc(greeting)}</h1>
      <p class="tagline">${esc(t(state.brand?.tagline_key || 'app.tagline'))}</p>
      ${isPromoActive(now) ? `<p class="promo-pill" id="promo-badge"><span aria-hidden="true">🕯️</span> <strong>${esc(t(promoLabelKey()))}</strong> · ${esc(t('promo.badge'))}</p>` : ''}
    </header>
    ${sod ? `
    <section class="hero" aria-labelledby="sod-title">
      <div class="eyebrow">${esc(t('home.session_of_day'))} · ${esc(weekdayName(now))}</div>
      <h2 id="sod-title">${esc(sod.title)}</h2>
      <p>${esc(sod.subtitle || '')} · ${esc(fmtMinutes(sod.durationMin))}</p>
      <a class="btn" href="#/session/${encodeURIComponent(sod.id)}">${esc(t('home.open_session'))}${isLocked(sod) ? ' 🔒' : ''}</a>
    </section>` : ''}
    <section aria-labelledby="cats-h">
      <h2 id="cats-h">${esc(t('home.categories'))}</h2>
      <div class="cat-grid">
        ${state.categories.map((c) => `<a class="cat-tile" href="#/library?cat=${encodeURIComponent(c.id)}"><span class="e" aria-hidden="true">${esc(c.icon || '')}</span>${esc(catTitle(c))}</a>`).join('')}
      </div>
    </section>
    <section aria-labelledby="prog-h">
      <h2 id="prog-h">${esc(t('home.your_progress'))}</h2>
      ${statsBlock(p)}
      ${p.totalSessions ? '' : `<p class="muted small">${esc(t('home.progress_empty'))}</p>`}
      <p><a href="#/progress">${esc(t('home.see_progress'))}</a></p>
    </section>`;
}

export function renderLibrary(app, r) {
  let cat = r.query.cat && getCategory(r.query.cat) ? r.query.cat : 'all';

  function draw() {
    const list = cat === 'all' ? state.sessions : state.sessions.filter((s) => s.category === cat);
    app.innerHTML = `
      <h1>${esc(t('library.title'))}</h1>
      <div class="chips" role="group" aria-label="${esc(t('library.filter'))}">
        <button type="button" class="chip" data-cat="all" aria-pressed="${cat === 'all'}">${esc(t('library.all'))}</button>
        ${state.categories.map((c) => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="${cat === c.id}">${esc(c.icon || '')} ${esc(catTitle(c))}</button>`).join('')}
      </div>
      <p class="muted small" aria-live="polite">${esc(t('library.count', { n: list.length }))}</p>
      <div>${list.map(card).join('') || `<p class="empty">${esc(t('library.empty'))}</p>`}</div>`;
  }
  app.onclick = (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    cat = b.dataset.cat;
    history.replaceState(null, '', cat === 'all' ? '#/library' : `#/library?cat=${encodeURIComponent(cat)}`);
    draw();
    const again = app.querySelector(`[data-cat="${CSS.escape(cat)}"]`);
    if (again) again.focus();
  };
  draw();
  return () => { app.onclick = null; };
}

export function renderSession(app, r) {
  const s = getSession(r.param);
  if (!s) {
    app.innerHTML = `<div class="empty"><span class="e" aria-hidden="true">🕊️</span><h1>${esc(t('session.not_found'))}</h1><a class="btn" href="#/library">${esc(t('nav.library'))}</a></div>`;
    return;
  }
  const c = getCategory(s.category);
  const locked = isLocked(s);
  const steps = (s.steps || []).map((st) => {
    const label = st.title || stepKindLabel(st.type);
    return `<li><span class="t">${esc(label)}${st.ref ? ` <span class="muted small">(${esc(st.ref)})</span>` : ''}</span><span class="s">${label === stepKindLabel(st.type) ? '' : esc(stepKindLabel(st.type)) + ' · '}${Math.round(st.seconds || 0)} s</span></li>`;
  }).join('');

  app.innerHTML = `
    <a class="back" href="#/library${c ? '?cat=' + encodeURIComponent(c.id) : ''}">← ${esc(t('common.back'))}</a>
    <div class="detail-head">
      <div>
        <h1>${esc(s.title)}</h1>
        ${s.subtitle ? `<p class="muted">${esc(s.subtitle)}</p>` : ''}
      </div>
      <button type="button" class="icon-btn fav" id="fav" aria-pressed="${isFavorite(s.id)}" aria-label="${esc(t('session.favorite'))}">♥</button>
    </div>
    <div class="badges">
      ${c ? `<span class="badge">${esc(c.icon || '')} ${esc(catTitle(c))}</span>` : ''}
      <span class="badge">⏱ ${esc(fmtMinutes(s.durationMin))}</span>
      ${s.premium ? `<span class="badge gold">${locked ? '🔒 ' : '★ '}${esc(t('session.premium'))}</span>` : `<span class="badge">${esc(t('session.free'))}</span>`}
    </div>
    ${s.description ? `<p>${esc(s.description)}</p>` : ''}
    <div class="btn-row">
      <button type="button" class="btn block" id="start">${esc(locked ? t('session.unlock') : t('session.start'))}</button>
    </div>
    <section class="card" aria-labelledby="steps-h">
      <h2 id="steps-h" style="margin-top:0">${esc(t('session.steps'))}</h2>
      <ol class="steps">${steps}</ol>
    </section>
    ${s.source ? `<p class="source">${esc(t('session.source'))}: ${esc(s.source)}</p>` : ''}`;

  app.querySelector('#fav').addEventListener('click', (e) => {
    const on = toggleFavorite(s.id);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    const msg = on ? t('session.fav_added') : t('session.fav_removed');
    toast(msg); announce(msg);
  });
  app.querySelector('#start').addEventListener('click', () => {
    if (isLocked(s)) { go(`#/paywall?next=${encodeURIComponent(s.id)}`); return; }
    try { unlockAudio(); } catch (e) { console.warn(e); }
    go(`#/player/${encodeURIComponent(s.id)}`);
  });
}

export function renderFavorites(app) {
  const favs = getFavorites().map(getSession).filter(Boolean);
  app.innerHTML = `
    <h1>${esc(t('favorites.title'))}</h1>
    ${favs.length ? favs.map(card).join('') : `
      <div class="empty"><span class="e" aria-hidden="true">♡</span>
        <p>${esc(t('favorites.empty'))}</p>
        <a class="btn secondary" href="#/library">${esc(t('favorites.browse'))}</a>
      </div>`}`;
}

export function renderProgress(app) {
  const p = getProgress();
  // Historia (jeśli storage ją udostępnia) — najnowsze na górze; w przeciwnym razie liczniki ukończeń
  const hist = typeof storage.getHistory === 'function' ? storage.getHistory() : [];
  let recentHtml = '';
  if (hist.length) {
    const items = hist.slice(-10).reverse()
      .map((x) => ({ s: getSession(x.id), x }))
      .filter((o) => o.s);
    recentHtml = items.map(({ s, x }) =>
      `<li><a class="t" href="#/session/${encodeURIComponent(s.id)}">${esc(s.title)}</a><span class="s">${esc(fmtDate(x.date))} · ${esc(fmtMinutes(Math.max(1, Math.round((x.seconds || 0) / 60))))}</span></li>`).join('');
  } else {
    recentHtml = Object.entries(p.completed || {})
      .map(([id, n]) => ({ s: getSession(id), n }))
      .filter((o) => o.s)
      .sort((a, b) => b.n - a.n)
      .map((o) => `<li><a class="t" href="#/session/${encodeURIComponent(o.s.id)}">${esc(o.s.title)}</a><span class="s">${esc(t('progress.times', { n: o.n }))}</span></li>`).join('');
  }
  app.innerHTML = `
    <h1>${esc(t('progress.title'))}</h1>
    ${statsBlock(p)}
    <p class="muted small">${esc(t('progress.last_date'))}: ${esc(fmtDate(p.lastDate))}</p>
    <h2>${esc(t('progress.recent'))}</h2>
    ${recentHtml ? `<div class="card"><ol class="steps">${recentHtml}</ol></div>`
    : `<div class="empty"><span class="e" aria-hidden="true">🕯️</span><p>${esc(t('progress.empty'))}</p><a class="btn secondary" href="#/home">${esc(t('common.back_home'))}</a></div>`}
    <p class="muted small">${esc(t('progress.local_note'))}</p>`;
}
