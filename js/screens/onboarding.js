// Appolonia — wprowadzenie (3 ekrany) i zgoda RODO
import { t } from '../i18n.js';
import { setOnboarded, setConsent } from '../storage.js';
import { esc, go } from '../ui.js';

export function renderOnboarding(app) {
  let i = 0;
  const pages = [
    () => `
      <div class="art" aria-hidden="true">🕊️</div>
      <h1>${esc(t('onb.welcome_title'))}</h1>
      <p class="muted">${esc(t('onb.welcome_text'))}</p>`,
    () => `
      <div class="art" aria-hidden="true">📿</div>
      <h1>${esc(t('onb.how_title'))}</h1>
      <ul>
        <li><span class="e" aria-hidden="true">📖</span>${esc(t('onb.how_text'))}</li>
        <li><span class="e" aria-hidden="true">🔔</span>${esc(t('onb.how_bells'))}</li>
        <li><span class="e" aria-hidden="true">✈️</span>${esc(t('onb.how_offline'))}</li>
      </ul>`,
    () => `
      <div class="art" aria-hidden="true">🤍</div>
      <h1>${esc(t('onb.notice_title'))}</h1>
      <p class="notice">${esc(t('onb.medical_notice'))}</p>
      <p class="muted small">${esc(t('onb.notice_text'))}</p>`,
  ];

  function draw() {
    const last = i === pages.length - 1;
    app.innerHTML = `
      <section class="onb" aria-roledescription="carousel">
        <p class="sr-only">${esc(t('onb.step_of', { n: i + 1, total: pages.length }))}</p>
        ${pages[i]()}
        <div class="dots" aria-hidden="true">${pages.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
        <div class="btn-row">
          ${i > 0 ? `<button type="button" class="btn secondary" data-act="back">${esc(t('common.back'))}</button>` : ''}
          <button type="button" class="btn" data-act="next">${esc(last ? t('onb.start') : t('common.next'))}</button>
        </div>
        ${!last ? `<button type="button" class="btn ghost" data-act="skip">${esc(t('onb.skip'))}</button>` : ''}
      </section>`;
    const h1 = app.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }

  app.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'next') {
      if (i < pages.length - 1) { i++; draw(); }
      else { setOnboarded(true); go('#/privacy-consent'); }
    } else if (act === 'back' && i > 0) { i--; draw(); }
    else if (act === 'skip') { i = pages.length - 1; draw(); }
  };
  draw();
  return () => { app.onclick = null; };
}

export function renderConsent(app) {
  app.innerHTML = `
    <section>
      <div class="center" aria-hidden="true" style="font-size:3rem">🔒</div>
      <h1 class="center">${esc(t('consent.title'))}</h1>
      <p>${esc(t('consent.intro'))}</p>
      <div class="card">
        <p><strong>${esc(t('consent.local_title'))}</strong></p>
        <p class="small">${esc(t('consent.local_text'))}</p>
      </div>
      <form id="consent-form" novalidate>
        <label class="check">
          <input type="checkbox" id="c-required" required aria-describedby="c-req-hint">
          <span>${esc(t('consent.accept_prefix'))} <a href="legal/privacy.html">${esc(t('consent.privacy_link'))}</a> ${esc(t('consent.and'))} <a href="legal/terms.html">${esc(t('consent.terms_link'))}</a> <span class="muted small" id="c-req-hint">(${esc(t('consent.required'))})</span></span>
        </label>
        <label class="check">
          <input type="checkbox" id="c-analytics">
          <span>${esc(t('consent.analytics'))} <span class="muted small">(${esc(t('consent.optional'))})</span><br><span class="muted small">${esc(t('consent.analytics_hint'))}</span></span>
        </label>
        <p class="small muted">${esc(t('consent.withdraw'))}</p>
        <button type="submit" class="btn block" id="c-submit" aria-disabled="true">${esc(t('consent.continue'))}</button>
        <p class="small center" id="c-error" role="alert" style="color:var(--danger)"></p>
      </form>
    </section>`;

  const req = app.querySelector('#c-required');
  const btn = app.querySelector('#c-submit');
  const err = app.querySelector('#c-error');
  const sync = () => { btn.setAttribute('aria-disabled', req.checked ? 'false' : 'true'); if (req.checked) err.textContent = ''; };
  req.addEventListener('change', sync);
  app.querySelector('#consent-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!req.checked) { err.textContent = t('consent.must_accept'); req.focus(); return; }
    setConsent({ analytics: app.querySelector('#c-analytics').checked });
    go('#/home');
  });
}
