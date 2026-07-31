(function () {
  'use strict';

  if (window.__amyFxStableAnalysisUiV4Installed) return;
  window.__amyFxStableAnalysisUiV4Installed = true;

  const DISCLOSURE_STATE_KEY = 'amyfx.analysis.disclosures.v4';
  const MARKET_CONTEXT_KEY = 'market-context';

  let scheduled = false;
  let applying = false;

  function currentTab() {
    return window.state?.tab || localStorage.getItem('amy_mapping_tab') || '';
  }

  function readDisclosureState() {
    try {
      const value = JSON.parse(localStorage.getItem(DISCLOSURE_STATE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeDisclosureState(key, open) {
    if (!key) return;
    const state = readDisclosureState();
    state[key] = Boolean(open);
    try { localStorage.setItem(DISCLOSURE_STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function bindDisclosure(details, defaultOpen = false) {
    if (!details || details.dataset.amyDisclosureBound === 'true') return;
    const key = details.dataset.stabilityKey;
    const saved = readDisclosureState();
    details.open = Object.prototype.hasOwnProperty.call(saved, key)
      ? Boolean(saved[key])
      : Boolean(defaultOpen);
    details.dataset.amyDisclosureBound = 'true';
    details.addEventListener('toggle', () => writeDisclosureState(key, details.open));
  }

  function removeDashboardDuplicates() {
    if (currentTab() !== 'Dashboard') return;
    document.querySelector('.mapping-hero')?.remove();
    document.querySelectorAll('#app > section.card').forEach(section => {
      if ((section.textContent || '').includes('AMY FX v1.5 PREVIEW AKTIF')) section.remove();
    });
  }

  function qualityState(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value.state || value.status || value.label || '');
  }

  function isM15Stale() {
    const result = window.state?.result;
    if (result?.dataStale) return true;
    const connection = document.getElementById('conn');
    const freshness = String(connection?.dataset?.analysisFreshness || '').toUpperCase();
    if (freshness === 'STALE' || freshness === 'EXPIRED') return true;
    const quality = window.AmyMappingIntegrity?.qualityByInterval || {};
    const m15 = quality['15min'] || quality.M15 || quality.m15;
    const status = qualityState(m15).toUpperCase();
    return status.includes('STALE') || status.includes('USANG');
  }

  function updateAnalysisBadge(card) {
    const badge = card?.querySelector('.regime-badge');
    if (!badge) return;
    const stale = isM15Stale();
    const text = stale ? 'M15 STALE' : 'M15 LIVE';
    if (badge.textContent !== text) badge.textContent = text;
    badge.classList.toggle('stale', stale);
    badge.classList.toggle('live', !stale);
    badge.setAttribute('aria-label', stale ? 'Data candle M15 sedang usang' : 'Data candle M15 aktif');
  }

  function removeHistoricalReliability(card) {
    if (!card) return;

    card.querySelectorAll('.amy-reliability-disclosure').forEach(node => node.remove());

    [...card.querySelectorAll('.market-health-title')].forEach(title => {
      if (title.querySelector('span')?.textContent?.trim() !== 'RELIABILITAS HISTORIS') return;
      const grid = title.nextElementSibling;
      if (grid?.classList.contains('reliability-grid')) grid.remove();
      title.remove();
    });

    card.querySelectorAll('details.professional-disclosure').forEach(details => {
      const summary = details.querySelector(':scope > summary')?.textContent || '';
      if (summary.includes('Performa Historis Model')) details.remove();
    });
  }

  function ensureMarketContextDisclosure(card) {
    if (!card || currentTab() !== 'Analyze') return;
    const currentParent = card.parentElement;
    if (currentParent?.classList.contains('amy-analysis-section')) {
      currentParent.dataset.stabilityKey = MARKET_CONTEXT_KEY;
      bindDisclosure(currentParent, false);
      updateAnalysisBadge(card);
      return;
    }

    const details = document.createElement('details');
    details.className = 'card amy-analysis-section';
    details.dataset.stabilityKey = MARKET_CONTEXT_KEY;
    details.innerHTML = '<summary><span>Ringkasan Market</span><small>Struktur, arah, dan skenario</small></summary>';
    card.before(details);
    details.appendChild(card);
    bindDisclosure(details, false);
    updateAnalysisBadge(card);
  }

  function stableKeyForSummary(text) {
    const value = String(text || '').trim();
    if (value.startsWith('Market Outlook') || value.startsWith('Amy Market Outlook')) return 'market-outlook';
    if (value.startsWith('Valid Break')) return 'valid-break';
    if (value.startsWith('Mapping Semua Timeframe') || value.startsWith('Mapping M1–H4')) return 'mapping-all-timeframes';
    if (value.startsWith('Penjelasan Mapping')) return 'mapping-explanation';
    if (value.startsWith('Setup Aktif')) return 'active-setup';
    return '';
  }

  function bindTopLevelDisclosures() {
    if (currentTab() !== 'Analyze') return;
    document.querySelectorAll('#app > details').forEach(details => {
      if (!details.dataset.stabilityKey) {
        const key = stableKeyForSummary(details.querySelector(':scope > summary')?.textContent);
        if (key) details.dataset.stabilityKey = key;
      }
      if (details.dataset.stabilityKey) bindDisclosure(details, false);
    });
  }

  function removeHistoricalOutlookStats() {
    document.querySelectorAll('.amy-outlook-backtest-note, .amy-outlook-historical-rate').forEach(node => node.remove());
  }

  function applyFixes() {
    scheduled = false;
    if (applying) return;
    applying = true;
    try {
      removeDashboardDuplicates();
      if (currentTab() === 'Analyze') {
        const card = document.getElementById('amy-regime-router-v3');
        if (card) {
          removeHistoricalReliability(card);
          ensureMarketContextDisclosure(card);
          updateAnalysisBadge(card);
        }
        bindTopLevelDisclosures();
        removeHistoricalOutlookStats();
      }
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyFixes);
  }

  function start() {
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(() => {
      if (!applying) schedule();
    }).observe(app, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
