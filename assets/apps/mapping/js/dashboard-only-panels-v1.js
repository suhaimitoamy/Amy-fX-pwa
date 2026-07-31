(function () {
  'use strict';

  if (window.__amyFxDashboardOnlyPanelsV1Installed) return;
  window.__amyFxDashboardOnlyPanelsV1Installed = true;

  const LEGACY_PANEL_IDS = Object.freeze([
    'amy-entry-watch-card'
  ]);

  const DASHBOARD_ORDER = Object.freeze([
    '.tf-card',
    '.session-card',
    '#amy-regime-router-v3',
    '.setup-focus',
    '#amy-scalper-entry-watch',
    '[data-execution-plan-card="compact"]'
  ]);

  const ANALYZE_ORDER = Object.freeze([
    { selector: '.mapping-hero' },
    { selector: '[data-stability-key="market-outlook"]' },
    { id: 'amy-regime-router-v3' },
    { selector: '[data-execution-plan-card="detail"]' },
    { summary: 'Penjelasan Mapping' },
    { selector: '[data-asia-range-analyze]' },
    { summary: 'Valid Break' },
    { summary: 'Mapping Semua Timeframe' },
    { summary: 'Setup Aktif' },
    { id: 'amy-scalper-entry-watch' }
  ]);

  const nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  let cleanupScheduled = false;
  let blockedInsertions = 0;
  let removedLegacyPanels = 0;
  let reorderedDashboard = 0;
  let reorderedAnalyze = 0;
  let observer = null;
  let started = false;

  function currentView() {
    return String(window.state?.tab || localStorage.getItem('amy_mapping_tab') || 'Dashboard');
  }

  function isLegacyMarkup(markup) {
    const html = String(markup || '');
    return LEGACY_PANEL_IDS.some(id => html.includes(`id="${id}"`) || html.includes(`id='${id}'`));
  }

  function topLevelNode(node, app) {
    let current = node;
    while (current && current.parentElement && current.parentElement !== app) {
      current = current.parentElement;
    }
    return current?.parentElement === app ? current : null;
  }

  function disclosureBySummary(app, label) {
    const details = [...app.querySelectorAll('details.disclosure, details.amy-analysis-section')]
      .find(node => String(node.querySelector(':scope > summary')?.textContent || '').trim().startsWith(label));
    return topLevelNode(details, app);
  }

  function resolveAnalyzeNode(app, descriptor) {
    if (descriptor.id) return topLevelNode(document.getElementById(descriptor.id), app);
    if (descriptor.summary) return disclosureBySummary(app, descriptor.summary);
    if (descriptor.selector) return topLevelNode(app.querySelector(descriptor.selector), app);
    return null;
  }

  function reorderSelected(app, orderedNodes) {
    const ordered = [...new Set(orderedNodes.filter(Boolean))];
    if (ordered.length < 2) return false;

    const selected = new Set(ordered);
    const children = [...app.children];
    const currentSelected = children.filter(node => selected.has(node));
    if (currentSelected.length === ordered.length && currentSelected.every((node, index) => node === ordered[index])) {
      return false;
    }

    const positions = ordered.map(node => children.indexOf(node)).filter(index => index >= 0);
    if (!positions.length) return false;
    const firstIndex = Math.min(...positions);
    const anchor = children.slice(firstIndex).find(node => !selected.has(node)) || null;
    const fragment = document.createDocumentFragment();
    ordered.forEach(node => fragment.appendChild(node));
    app.insertBefore(fragment, anchor);
    return true;
  }

  function removeLegacyPanel(node) {
    if (!node) return;
    const wrapper = node.closest('details.amy-analysis-section');
    if (wrapper && wrapper.contains(node)) wrapper.remove();
    else node.remove();
    removedLegacyPanels += 1;
  }

  function reorderDashboardPanels(app) {
    const ordered = DASHBOARD_ORDER
      .map(selector => topLevelNode(app.querySelector(`:scope > ${selector}`) || app.querySelector(selector), app));
    if (reorderSelected(app, ordered)) reorderedDashboard += 1;
  }

  function reorderAnalyzePanels(app) {
    const ordered = ANALYZE_ORDER.map(descriptor => resolveAnalyzeNode(app, descriptor));
    if (reorderSelected(app, ordered)) reorderedAnalyze += 1;
  }

  function syncCurrentView() {
    cleanupScheduled = false;
    const app = document.getElementById('app');
    if (!app) return;

    LEGACY_PANEL_IDS.forEach(id => removeLegacyPanel(document.getElementById(id)));

    if (currentView() === 'Dashboard') {
      reorderDashboardPanels(app);
      return;
    }

    if (currentView() === 'Analyze') {
      reorderAnalyzePanels(app);
    }
  }

  function scheduleCleanup() {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    requestAnimationFrame(syncCurrentView);
  }

  function needsCleanup(records, app) {
    return records.some(record => {
      if (record.target === app) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (
          node.parentElement === app
          || node.matches?.('#amy-scalper-entry-watch, #amy-regime-router-v3, [data-execution-plan-card]')
        )
      );
    });
  }

  Element.prototype.insertAdjacentHTML = function (position, markup) {
    if (isLegacyMarkup(markup)) {
      blockedInsertions += 1;
      scheduleCleanup();
      return;
    }
    const result = nativeInsertAdjacentHTML.call(this, position, markup);
    scheduleCleanup();
    return result;
  };

  function start() {
    if (started) return;
    started = true;
    const app = document.getElementById('app');
    if (app && !observer) {
      observer = new MutationObserver(records => {
        if (needsCleanup(records, app)) scheduleCleanup();
      });
      observer.observe(app, {
        childList: true,
        subtree: true
      });
    }

    document.addEventListener('click', scheduleCleanup, true);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleCleanup();
    });
    window.addEventListener('amyfx:market-update', scheduleCleanup);
    window.addEventListener('amyfx:entry-watch-updated', scheduleCleanup);
    window.addEventListener('amyfx:scalper-state-change', scheduleCleanup);
    window.addEventListener('amyfx:mapping-state-change', scheduleCleanup);
    scheduleCleanup();
  }

  window.AmyFXDashboardOnlyPanels = Object.freeze({
    version: '1.2.0',
    stats: () => ({
      blockedInsertions,
      removedLegacyPanels,
      reorderedDashboard,
      reorderedAnalyze,
      view: currentView()
    })
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
