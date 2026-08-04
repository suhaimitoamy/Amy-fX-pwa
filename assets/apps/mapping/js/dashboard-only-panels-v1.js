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

  const nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  let cleanupScheduled = false;
  let blockedInsertions = 0;
  let removedLegacyPanels = 0;
  let reorderedDashboard = 0;
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

  function syncCurrentView() {
    cleanupScheduled = false;
    const app = document.getElementById('app');
    if (!app) return;

    LEGACY_PANEL_IDS.forEach(id => removeLegacyPanel(document.getElementById(id)));

    // Analyze is intentionally never reordered. Its DOM order is authoritative and static.
    if (currentView() === 'Dashboard') reorderDashboardPanels(app);
  }

  function scheduleCleanup() {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    requestAnimationFrame(syncCurrentView);
  }

  Element.prototype.insertAdjacentHTML = function (position, markup) {
    if (isLegacyMarkup(markup)) {
      blockedInsertions += 1;
      scheduleCleanup();
      return;
    }
    return nativeInsertAdjacentHTML.call(this, position, markup);
  };

  function start() {
    if (started) return;
    started = true;
    const app = document.getElementById('app');
    if (app && !observer) {
      observer = new MutationObserver(records => {
        if (currentView() !== 'Dashboard') return;
        if (records.some(record => record.target === app)) scheduleCleanup();
      });
      observer.observe(app, { childList: true, subtree: false });
    }
    scheduleCleanup();
  }

  window.AmyFXDashboardOnlyPanels = Object.freeze({
    version: '1.3.0',
    stats: () => ({
      blockedInsertions,
      removedLegacyPanels,
      reorderedDashboard,
      reorderedAnalyze: 0,
      view: currentView()
    })
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
