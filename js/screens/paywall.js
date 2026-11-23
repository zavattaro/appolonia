// Appolonia — paywall. Tryby (js/promo.js → paywallMode):
//   promo — „Adwent za darmo”: bez zakupu; live — Paddle (clientToken);
//   sim — symulacja tylko z ?dev=1; soon — wersja publiczna bez Paddle: „premium wkrótce” + kod licencyjny
import { t } from '../i18n.js';
import { isPremium, setPremium } from '../storage.js';
import { getSession } from '../state.js';
import { loadPaymentsConfig, isLiveMode } from '../license.js';
import { openCheckout, claimPurchase, licenseApiUrl, closeCheckout } from '../checkout.js';
import { paywallMode } from '../promo.js';
import { licenseFormHtml, bindLicenseForm, purchaseErrorText } from './activate.js';
import { esc, go, toast, announce } from '../ui.js';

function ctaLabel(plan, live, trialDays) {
  let s;
  if (plan === 'yearly' && trialDays > 0) s = t('paywall.cta_trial', { n: trialDays });
  else if (plan === 'lifetime') s = t('paywall.cta_lifetime');
  else s = t('paywall.cta_subscribe');
  return live ? s : `${s} ${t('paywall.sim_suffix')}`;
}

function checkoutError(reason) {
  switch (reason) {
    case 'offline': return t('paywall.err_offline');
    case 'noprice': return t('paywall.err_noprice');
    default: return t('paywall.err_checkout');
  }
}

export async function renderPaywall(app, r) {
  const next = r.query.next && getSession(r.query.next) ? r.query.next : null;
  const nextSession = next ? getSession(next) : null;
  const cfg = await loadPaymentsConfig();
  const live = isLiveMode(cfg);
  const mode = paywallMode(cfg);
  const canBuy = mode === 'live' || mode === 'sim';
  const dp = cfg.displayPrices || {};
  const trialDays = Number(cfg.trialDays) || 0;
  let plan = 'lifetime';
  let thanks = false;
  let msg = '';
  let confirm = null; // null | 'working' | 'ok' | 'error' (licencja automatyczna)
  let confirmReason = '';
  let txnId = '';
  const afterUnlock = next ? `#/session/${encodeURIComponent(next)}` : '#/library';

  function planBtn(id, { title, price, note, tag, featured }) {
    if (!canBuy) {
      return `<div class="plan static${featured ? ' featured' : ''}" data-plan-info="${id}">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
      <div>${esc(title)}</div>
      ${mode === 'promo' ? `<span class="from">${esc(t('promo.plans_from'))}</span>` : ''}
      <div class="price">${esc(price)}</div>
      <div class="muted small">${esc(note)}</div>
    </div>`;
    }
    return `<button type="button" class="plan${featured ? ' featured' : ''}" data-plan="${id}" aria-pressed="${plan === id}">
      ${tag ? `<span class="tag">${esc(tag)}</span>` : ''}
      <div>${esc(title)}</div>
      <div class="price">${esc(price)}</div>
      <div class="muted small">${esc(note)}</div>
    </button>`;
  }

  function confirmHtml() {
    if (confirm === 'working') return `<div class="notice" role="status" id="pw-confirm"><p><strong>${esc(t('purchase.confirming'))}</strong></p><p class="small">${esc(t('purchase.confirming_hint'))}</p></div>`;
    if (confirm === 'ok') return `<div class="notice" role="status" id="pw-confirm-ok"><p><strong>${esc(t('purchase.ok'))}</strong></p></div>`;
    if (confirm === 'error') return `<div class="notice" role="alert" id="pw-confirm-err"><p><strong>${esc(t('purchase.err_title'))}</strong></p>
      <p class="small">${esc(purchaseErrorText(confirmReason))}</p><p class="small">${esc(t('purchase.err_hint'))}</p>
      ${txnId ? `<p class="small">${esc(t('purchase.txn_is', { txn: txnId }))}</p>` : ''}
      <button type="button" class="btn block" id="pw-retry">${esc(t('purchase.retry'))}</button></div>`;
    return '';
  }

  async function runClaim(txn) {
    txnId = txn; confirm = 'working'; confirmReason = ''; draw();
    announce(t('purchase.confirming'));
    const r = await claimPurchase(txn, cfg);
    if (!app.isConnected) return;
    if (r.ok) {
      confirm = 'ok'; closeCheckout(); draw();
      toast(t('license.toast_ok')); announce(t('purchase.ok'));
    } else {
      confirm = 'error'; confirmReason = r.reason; draw();
      announce(t('purchase.err_title'));
    }
  }

  function onCheckoutEvent(ev) {
    if (!ev || ev.name !== 'checkout.completed') return;
    const txn = ev.data && ev.data.transaction_id;
    if (licenseApiUrl(cfg) && txn) { runClaim(txn); return; }
    thanks = true; msg = ''; draw();
    announce(t('paywall.thanks_title'));
  }

  function draw() {
    const premium = isPremium();
    app.innerHTML = `
      <a class="back" href="${next ? '#/session/' + encodeURIComponent(next) : '#/home'}">← ${esc(t('common.back'))}</a>
      <div class="center" aria-hidden="true" style="font-size:3rem">✨</div>
      <h1 class="center">${esc(t('paywall.title'))}</h1>
      <p class="center muted">${esc(nextSession ? t('paywall.subtitle_session', { title: nextSession.title }) : t('paywall.subtitle'))}</p>
      ${mode === 'promo' ? `<p class="promo-banner" id="pw-promo" role="note">🕯️ ${esc(t('promo.paywall_banner'))}</p>` : ''}
      ${mode === 'sim' ? `<p class="sim" role="note">⚠️ ${esc(t('paywall.simulation'))}</p>` : ''}
      ${mode === 'soon' ? `<p class="notice" id="pw-soon" role="note"><strong>${esc(t('paywall.soon_title'))}</strong><br><span class="small">${esc(t('paywall.soon_text'))}</span></p>` : ''}
      <ul class="benefits">
        <li>${esc(t('paywall.benefit_all'))}</li>
        <li>${esc(t('paywall.benefit_new'))}</li>
        <li>${esc(t('paywall.benefit_offline'))}</li>
        <li>${esc(t('paywall.benefit_support'))}</li>
      </ul>
      ${confirmHtml()}
      ${premium ? `
        <div class="card center"><p><strong>${esc(mode === 'sim' ? t('paywall.already') : t('paywall.already_live'))}</strong></p>
        <a class="btn block" href="${afterUnlock}">${esc(t('paywall.continue'))}</a></div>`
      : `
      ${thanks ? `<div class="notice" role="status" id="pw-thanks"><p><strong>${esc(t('paywall.thanks_title'))}</strong></p><p class="small">${esc(t('paywall.thanks_text'))}</p></div>` : ''}
      <div role="group" aria-label="${esc(t('paywall.choose_plan'))}">
        ${planBtn('lifetime', { title: t('paywall.plan_lifetime'), price: dp.lifetime || '', note: t('paywall.lifetime_note'), tag: t('paywall.lifetime_badge'), featured: true })}
        ${planBtn('yearly', { title: t('paywall.plan_year'), price: t('paywall.per_year', { price: dp.yearly || '' }), note: trialDays > 0 ? t('paywall.yearly_note', { n: trialDays, price: dp.yearly || '' }) : t('paywall.yearly_note_notrial'), tag: trialDays > 0 ? t('paywall.trial_badge_n', { n: trialDays }) : '' })}
        ${planBtn('monthly', { title: t('paywall.plan_month'), price: t('paywall.per_month', { price: dp.monthly || '' }), note: t('paywall.monthly_note') })}
      </div>
      ${canBuy ? `<button type="button" class="btn gold block" id="pw-start">${esc(ctaLabel(plan, live, trialDays))}</button>
      <p class="license-msg err" id="pw-msg" role="status" aria-live="polite">${esc(msg)}</p>` : ''}
      ${mode === 'promo'
        ? `<a class="btn block" id="pw-promo-go" href="${afterUnlock}">${esc(nextSession ? t('promo.go_session') : t('promo.go_library'))}</a>`
        : `<a class="btn ghost block" href="${next ? '#/library' : '#/home'}">${esc(t('paywall.not_now'))}</a>`}
      ${licenseFormHtml({ id: 'pwlic', open: thanks || confirm === 'error' })}
      ${canBuy ? `<p class="muted small center">${esc(t('paywall.renewal', { n: trialDays, price: dp.yearly || '' }))}</p>
      <p class="muted small center">${esc(t('paywall.privacy_note'))}</p>` : `<p class="muted small center">${esc(t('paywall.privacy_note_nobuy'))}</p>`}`}`;
    bindLicenseForm(app, { id: 'pwlic', onSuccess: () => setTimeout(() => go(afterUnlock), 1200) });
  }

  app.onclick = async (e) => {
    const p = e.target.closest('[data-plan]');
    if (p && canBuy) { plan = p.dataset.plan; msg = ''; draw(); app.querySelector(`[data-plan="${plan}"]`)?.focus(); return; }
    if (e.target.closest('#pw-retry')) { if (txnId) runClaim(txnId); return; }
    if (!e.target.closest('#pw-start') || !canBuy) return;
    if (mode === 'sim') {
      setPremium(true);
      toast(t('paywall.activated'));
      go(afterUnlock);
      return;
    }
    const btn = app.querySelector('#pw-start');
    btn.disabled = true;
    const res = await openCheckout(plan, cfg, { onEvent: onCheckoutEvent });
    if (!app.isConnected) return;
    btn.disabled = false;
    msg = res.ok ? '' : checkoutError(res.reason);
    const m = app.querySelector('#pw-msg');
    if (m) m.textContent = msg;
  };

  const onOnline = () => { if (msg === t('paywall.err_offline')) { msg = ''; const m = app.querySelector('#pw-msg'); if (m) m.textContent = ''; } };
  window.addEventListener('online', onOnline);
  draw();
  return () => { app.onclick = null; window.removeEventListener('online', onOnline); };
}
