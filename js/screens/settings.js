// Appolonia — Ustawienia (dzwonki, ekran, tekst, premium, dane RODO)
import { t } from '../i18n.js';
import { getSettings, setSettings, isPremium, setPremium, getConsent, setConsent, resetAll } from '../storage.js';
import { APP_VERSION, applyTextSize } from '../state.js';
import { esc, go, toast, fmtDate } from '../ui.js';
import { loadPaymentsConfig, isLiveMode, licenseStatus, removeLicense } from '../license.js';
import { paywallMode } from '../promo.js';
import { licenseFormHtml, bindLicenseForm, planName, restoreFormHtml, bindRestoreForm } from './activate.js';
import { licenseApiUrl } from '../checkout.js';

export function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('appolonia.')) continue;
    const v = localStorage.getItem(k);
    try { data[k] = JSON.parse(v); } catch { data[k] = v; }
  }
  const payload = { app: 'Appolonia', version: APP_VERSION, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appolonia-moje-dane-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return payload;
}

export async function renderSettings(app) {
  let confirming = false;
  const cfg = await loadPaymentsConfig();
  const live = isLiveMode(cfg);

  function draw() {
    const st = getSettings();
    const premium = isPremium();
    const consent = getConsent();
    const size = st.textSize || 'm';
    const lic = licenseStatus();
    const mode = paywallMode(cfg);
    let premiumText;
    if (premium && lic.active) {
      premiumText = lic.expires
        ? t('settings.license_until', { plan: planName(lic.plan), date: fmtDate(lic.expires) })
        : t('settings.license_forever', { plan: planName(lic.plan) });
    } else if (premium) {
      premiumText = live ? t('settings.premium_active_live') : t('settings.premium_active');
    } else {
      premiumText = lic.expired ? t('settings.license_expired', { date: fmtDate(lic.expires) }) : t('settings.premium_inactive');
      if (mode === 'promo' && !lic.expired) premiumText = t('settings.premium_promo');
    }
    app.innerHTML = `
      <h1>${esc(t('settings.title'))}</h1>

      <h2>${esc(t('settings.session_h'))}</h2>
      <div class="card">
        <div class="setting">
          <label for="s-bells">${esc(t('settings.bells'))}<br><span class="muted small">${esc(t('settings.bells_hint'))}</span></label>
          <input type="checkbox" role="switch" class="switch" id="s-bells" ${st.bells !== false ? 'checked' : ''}>
        </div>
        <div class="setting">
          <label for="s-awake">${esc(t('settings.keep_awake'))}<br><span class="muted small">${esc(t('settings.keep_awake_hint'))}</span></label>
          <input type="checkbox" role="switch" class="switch" id="s-awake" ${st.keepAwake ? 'checked' : ''}>
        </div>
        <div class="setting">
          <span class="lbl" id="s-size-l">${esc(t('settings.text_size'))}</span>
          <div class="seg" role="group" aria-labelledby="s-size-l">
            <button type="button" data-size="s" aria-pressed="${size === 's'}" aria-label="${esc(t('settings.size_s_label'))}">${esc(t('settings.size_s'))}</button>
            <button type="button" data-size="m" aria-pressed="${size === 'm'}" aria-label="${esc(t('settings.size_m_label'))}">${esc(t('settings.size_m'))}</button>
            <button type="button" data-size="l" aria-pressed="${size === 'l'}" aria-label="${esc(t('settings.size_l_label'))}">${esc(t('settings.size_l'))}</button>
          </div>
        </div>
      </div>

      <h2>${esc(t('settings.premium_h'))}</h2>
      <div class="card">
        <p><strong>${esc(premiumText)}</strong></p>
        ${premium && lic.active && lic.code ? `
          <details class="license-code"><summary>${esc(t('settings.license_show'))}</summary>
            <p class="muted small">${esc(t('settings.license_code_hint'))}</p>
            <code class="code-box">${esc(lic.code)}</code>
          </details>` : ''}
        ${premium
          ? `<button type="button" class="btn secondary block" id="s-free">${esc(lic.active ? t('settings.license_remove') : t('settings.restore_free'))}</button>`
          : `<a class="btn gold block" href="#/paywall">${esc(t('settings.see_premium'))}</a>`}
        ${licenseFormHtml({ id: 'slic' })}
        ${licenseApiUrl(cfg) && !(premium && lic.active) ? restoreFormHtml({ id: 'srst' }) : ''}
        ${mode === 'sim' ? `<p class="muted small">${esc(t('paywall.simulation'))}</p>` : ''}
      </div>

      <h2>${esc(t('settings.privacy_h'))}</h2>
      <div class="card">
        <div class="setting">
          <label for="s-analytics">${esc(t('settings.analytics'))}<br><span class="muted small">${esc(t('settings.analytics_hint'))}</span></label>
          <input type="checkbox" role="switch" class="switch" id="s-analytics" ${consent && consent.analytics ? 'checked' : ''}>
        </div>
        <p class="muted small">${esc(t('settings.consent_date', { date: fmtDate(consent && consent.date) }))}</p>
        <div class="link-list">
          <a href="legal/privacy.html">${esc(t('settings.privacy_policy'))} →</a>
          <a href="legal/terms.html">${esc(t('settings.terms'))} →</a>
          <a href="legal/refund.html">${esc(t('settings.refund_policy'))} →</a>
        </div>
        <p class="muted small" lang="en">English: <a href="legal/en/terms.html">Terms</a> · <a href="legal/en/privacy.html">Privacy</a> · <a href="legal/en/refund.html">Refunds</a></p>
      </div>

      <h2>${esc(t('settings.data_h'))}</h2>
      <div class="card">
        <p class="small muted">${esc(t('settings.data_local'))}</p>
        <button type="button" class="btn secondary block" id="s-export">${esc(t('settings.export'))}</button>
        <div style="height:12px"></div>
        ${confirming ? `
          <div class="notice" role="alertdialog" aria-labelledby="del-h" aria-describedby="del-d">
            <p id="del-h"><strong>${esc(t('settings.delete_confirm_title'))}</strong></p>
            <p id="del-d" class="small">${esc(t('settings.delete_confirm_text'))}</p>
            <div class="btn-row">
              <button type="button" class="btn secondary" id="s-del-cancel">${esc(t('common.cancel'))}</button>
              <button type="button" class="btn danger" id="s-del-yes">${esc(t('settings.delete_confirm_yes'))}</button>
            </div>
          </div>`
        : `<button type="button" class="btn danger block" id="s-delete">${esc(t('settings.delete_all'))}</button>`}
      </div>

      <p class="center muted small" style="margin-top:24px">${esc(t('settings.medical_notice'))}</p>
      <p class="center muted small">${esc(t('settings.version', { v: APP_VERSION }))}</p>`;
    bindLicenseForm(app, { id: 'slic', onSuccess: () => setTimeout(draw, 1500) });
    bindRestoreForm(app, { id: 'srst', cfg, onSuccess: () => setTimeout(draw, 1500) });
  }

  app.onchange = (e) => {
    const id = e.target.id;
    if (id === 's-bells') { setSettings({ bells: e.target.checked }); toast(t('settings.saved')); }
    else if (id === 's-awake') { setSettings({ keepAwake: e.target.checked }); toast(t('settings.saved')); }
    else if (id === 's-analytics') { setConsent({ analytics: e.target.checked }); toast(t('settings.saved')); }
  };

  app.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.size) {
      setSettings({ textSize: b.dataset.size });
      applyTextSize(b.dataset.size);
      draw();
      const again = app.querySelector(`[data-size="${b.dataset.size}"]`);
      if (again) again.focus();
      return;
    }
    switch (b.id) {
      case 's-free':
        if (licenseStatus().active && !window.confirm(t('settings.license_remove_confirm'))) break;
        removeLicense(); setPremium(false); toast(t('settings.free_restored')); draw(); break;
      case 's-export':
        exportData(); toast(t('settings.exported')); break;
      case 's-delete':
        confirming = true; draw(); app.querySelector('#s-del-cancel')?.focus(); break;
      case 's-del-cancel':
        confirming = false; draw(); app.querySelector('#s-delete')?.focus(); break;
      case 's-del-yes':
        resetAll();
        applyTextSize('m');
        go('#/onboarding');
        break;
    }
  };

  draw();
  return () => { app.onclick = null; app.onchange = null; };
}
