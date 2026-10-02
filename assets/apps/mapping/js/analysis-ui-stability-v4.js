(function () {
  'use strict';

  if (window.__amyFxStableAnalysisUiV4Installed) return;
  window.__amyFxStableAnalysisUiV4Installed = true;

  const MARKET_CONTEXT_KEY = 'market-context';
  let scheduled = false;
  let applying = false;
  let observer = null;
  let lifecycleController = null;

  function currentTab() {
    return window.state?.tab || localStorage.getItem('amy_mapping_tab') || '';
  }

  function installStaticStyle() {
    if (document.getElementById('amyfx-static-analysis-layout')) return;
    const style = document.createElement('style');
    style.id = 'amyfx-static-analysis-layout';
    style.textContent = `
      #app[data-analysis-static="true"] > details,
      #app[data-analysis-static="true"] details.amy-analysis-section,
      #app[data-analysis-static="true"] details.disclosure {
        display: block;
      }
      #app[data-analysis-static="true"] details > summary {
        cursor: default;
        user-select: text;
        pointer-events: none;
      }
      #app[data-analysis-static="true"] details > summary::-webkit-details-marker {
        display: none;
      }
      #app[data-analysis-static="true"] details > summary::marker {
        content: '';
      }
      #app[data-analysis-static="true"] details > summary::after {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function forceStaticDisclosure(details) {
    if (!details) return;
    details.removeAttribute('name');
    details.open = true;
    details.dataset.amyStaticAnalysis = 'true';

    const summary = details.querySelector(':scope > summary');
    if (summary) {
      summary.setAttribute('aria-disabled', 'true');
      summary.setAttribute('tabindex', '-1');
    }

    if (details.dataset.amyStaticBound === 'true') return;
    details.dataset.amyStaticBound = 'true';

    details.addEventListener('toggle', () => {
      if (!details.open) details.open = true;
    });
    summary?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      details.open = true;
    }, true);
  }

  function isInteractiveMappingDisclosure(details) {
    return Boolean(details?.matches?.('.professional-disclosure'));
  }

  function latestClosedCandle() {
    const candles = window.state?.candles || {};
    for (const timeframe of ['M15', 'M5', 'M1', 'M30', 'H1']) {
      const list = Array.isArray(candles[timeframe]) ? candles[timeframe] : [];
      const closed = [...list].reverse().find(candle => candle?.isClosed !== false);
      if (closed) return { timeframe, candle: closed };
    }
    return null;
  }

  function updateAnalysisBadge(card) {
    const badge = card?.querySelector('.regime-badge');
    if (!badge) return;
    const source = latestClosedCandle();
    const freshness = window.state?.result?.executionFreshness || {};
    const available = Boolean(source);
    const providerDelayed = Boolean(available && freshness.providerDelayed);
    const text = providerDelayed
      ? `${source.timeframe} CACHE · PROVIDER TERTUNDA`
      : available
        ? `${source.timeframe} CANDLE TERTUTUP`
        : 'MENUNGGU DATA';
    if (badge.textContent !== text) badge.textContent = text;
    badge.classList.toggle('stale', providerDelayed);
    badge.classList.toggle('live', available && !providerDelayed);
    badge.classList.toggle('waiting', !available || providerDelayed);
    badge.setAttribute('aria-label', providerDelayed
      ? `Analisis memakai candle ${source.timeframe} terakhir; entry diblokir sampai provider diperbarui`
      : available
        ? `Analisis memakai candle ${source.timeframe} terakhir yang sudah close`
        : 'Belum ada candle tertutup yang dapat dianalisis');
  }

  function ensureMarketContextDisclosure(card) {
    if (!card || currentTab() !== 'Analyze') return;
    const currentParent = card.parentElement;
    if (currentParent?.classList.contains('amy-analysis-section')) {
      currentParent.dataset.stabilityKey = MARKET_CONTEXT_KEY;
      forceStaticDisclosure(currentParent);
      updateAnalysisBadge(card);
      return;
    }

    const details = document.createElement('details');
    details.className = 'card amy-analysis-section';
    details.dataset.stabilityKey = MARKET_CONTEXT_KEY;
    details.open = true;
    details.innerHTML = '<summary><span>Ringkasan Market</span><small>Struktur, arah, dan skenario</small></summary>';
    card.before(details);
    details.appendChild(card);
    forceStaticDisclosure(details);
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

  function makeAnalyzeStatic(app) {
    if (!app || currentTab() !== 'Analyze') return;
    app.dataset.analysisStatic = 'true';
    app.querySelectorAll('details').forEach(details => {
      if (isInteractiveMappingDisclosure(details)) return;
      if (!details.dataset.stabilityKey) {
        const key = stableKeyForSummary(details.querySelector(':scope > summary')?.textContent);
        if (key) details.dataset.stabilityKey = key;
      }
      forceStaticDisclosure(details);
    });
  }

  function applyFixes() {
    scheduled = false;
    if (applying) return;
    applying = true;
    try {
      installStaticStyle();
      const app = document.getElementById('app');
      if (!app) return;

      if (currentTab() === 'Analyze') {
        const card = document.getElementById('amy-regime-router-v3');
        if (card) ensureMarketContextDisclosure(card);
        makeAnalyzeStatic(app);
      } else {
        delete app.dataset.analysisStatic;
      }
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(applyFixes);
    else setTimeout(applyFixes, 0);
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    lifecycleController?.abort();
    lifecycleController = null;
    scheduled = false;
  }

  function start() {
    const app = document.getElementById('app');
    if (!app || lifecycleController) return;
    lifecycleController = new AbortController();
    const signal = lifecycleController.signal;

    observer = new MutationObserver(records => {
      if (applying) return;
      if (records.some(record => record.target === app)) schedule();
    });
    observer.observe(app, { childList: true, subtree: false });

    [
      'amyfx:mapping-state-change',
      'amyfx:mapping-ui-rendered',
      'amyfx:market-intent-rendered',
      'amyfx:entry-watch-updated'
    ].forEach(name => window.addEventListener(name, schedule, { signal }));
    window.addEventListener('pagehide', stop, { once: true, signal });
    schedule();
  }

  window.addEventListener('pageshow', event => {
    if (event.persisted) start();
  });

  window.AmyFXAnalysisUiStability = Object.freeze({
    version: '6.0.0',
    start,
    stop,
    schedule
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
