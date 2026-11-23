// Appolonia — drobne pomocniki interfejsu
import { t } from './i18n.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtMinutes(min) {
  return t('common.minutes_short', { n: min });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return '—';
  try {
    return new Date(y, m - 1, d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

let toastTimer = null;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

export function announce(msg) {
  const live = document.getElementById('live');
  if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }
}

export function stepKindLabel(type) {
  switch (type) {
    case 'bell': return t('step.bell');
    case 'text': return t('step.text');
    case 'prayer': return t('step.prayer');
    case 'scripture': return t('step.scripture');
    case 'silence': return t('step.silence');
    default: return '';
  }
}

export function sessionCard(s, { locked = false, catIcon = '' } = {}) {
  const lock = locked ? `<span class="lock" role="img" aria-label="${esc(t('library.locked'))}">🔒</span>` : '';
  return `<a class="card session-card" href="#/session/${encodeURIComponent(s.id)}">
    <span class="emoji" aria-hidden="true">${esc(catIcon || '✝️')}</span>
    <span class="body">
      <h3>${esc(s.title)}</h3>
      <span class="meta">${esc(fmtMinutes(s.durationMin))}${s.subtitle ? ' · ' + esc(s.subtitle) : ''}</span>
    </span>
    ${lock}
  </a>`;
}
