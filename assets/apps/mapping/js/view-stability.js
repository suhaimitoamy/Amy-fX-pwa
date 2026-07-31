(function () {
  'use strict';

  const APP_ID = 'app';
  const ANALYZE_TAB = 'Analyze';
  const MIN_RESTORE_Y = 90;
  const MAX_RESTORE_DELAY = 140;
  const USER_ACTIVITY_WINDOW_MS = 120000;

  let lastStableY = 0;
  let lastUserScrollAt = 0;
  let navigationLockUntil = 0;
  let restoreTimer = 0;
  let mutationQueued = false;
  let anchorKey = '';
  let anchorOffset = 0;
  let restoring = false;

  function currentTab() {
    return window.state?.tab || localStorage.getItem('amy_mapping_tab') || '';
  }

  function stabilityNodes() {
    return [...document.querySelectorAll('#app > [data-stability-key]')];
  }

  function findAnchor() {
    const nodes = stabilityNodes();
    if (!nodes.length) return null;

    const viewportTop = 58;
    const visible = nodes
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
      .filter(item => item.rect.bottom > viewportTop && item.rect.top < window.innerHeight)
      .sort((a, b) => Math.abs(a.rect.top - viewportTop) - Math.abs(b.rect.top - viewportTop));

    return visible[0] || null;
  }

  function rememberScroll() {
    if (restoring || currentTab() !== ANALYZE_TAB) return;
    lastStableY = window.scrollY || 0;
    lastUserScrollAt = Date.now();
    const anchor = findAnchor();
    if (anchor) {
      anchorKey = anchor.node.dataset.stabilityKey || '';
      anchorOffset = anchor.rect.top;
    }
  }

  function markNavigation() {
    navigationLockUntil = Date.now() + 1000;
    anchorKey = '';
  }

  function shouldRestore() {
    if (currentTab() !== ANALYZE_TAB) return false;
    if (Date.now() < navigationLockUntil) return false;
    if (lastStableY < MIN_RESTORE_Y) return false;
    return Date.now() - lastUserScrollAt < USER_ACTIVITY_WINDOW_MS;
  }

  function restoreFromAnchor() {
    if (!anchorKey) return false;
    const node = [...document.querySelectorAll('#app > [data-stability-key]')]
      .find(element => element.dataset.stabilityKey === anchorKey);
    if (!node) return false;
    const delta = node.getBoundingClientRect().top - anchorOffset;
    if (Math.abs(delta) < 2) return true;
    window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
    return true;
  }

  function restorePosition() {
    mutationQueued = false;
    if (!shouldRestore()) return;

    restoring = true;
    try {
      if (restoreFromAnchor()) return;
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const target = Math.min(lastStableY, maxY);
      if (Math.abs((window.scrollY || 0) - target) < 12) return;
      window.scrollTo({ top: target, left: 0, behavior: 'auto' });
    } finally {
      requestAnimationFrame(() => { restoring = false; });
    }
  }

  function queueRestore() {
    if (mutationQueued || !shouldRestore()) return;
    mutationQueued = true;
    clearTimeout(restoreTimer);
    requestAnimationFrame(() => {
      restoreTimer = window.setTimeout(restorePosition, MAX_RESTORE_DELAY);
    });
  }

  function installObserver() {
    const app = document.getElementById(APP_ID);
    if (!app) return;
    new MutationObserver(queueRestore).observe(app, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open']
    });
  }

  window.addEventListener('scroll', rememberScroll, { passive: true });
  document.addEventListener('touchmove', rememberScroll, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.nav, .tf-grid, [data-tab], button[onclick*="runAnalysis"]')) {
      markNavigation();
    } else {
      rememberScroll();
    }
  }, true);

  document.addEventListener('toggle', event => {
    if (event.target?.matches?.('#app details[data-stability-key]')) {
      rememberScroll();
      queueRestore();
    }
  }, true);

  window.addEventListener('hashchange', markNavigation);
  window.addEventListener('popstate', markNavigation);
  window.addEventListener('amyfx:entry-watch-updated', queueRestore);
  window.addEventListener('amyfx:candles-updated', queueRestore);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installObserver, { once: true });
  } else {
    installObserver();
  }
})();
