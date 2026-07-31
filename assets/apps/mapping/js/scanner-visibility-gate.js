(function () {
  'use strict';

  if (window.__amyFxLegacyScannerDisabled) return;
  window.__amyFxLegacyScannerDisabled = true;

  let stopped = false;

  function stopLegacyScanner() {
    if (stopped) return;
    stopped = true;
    window.Android?.stopBackgroundScanner?.();
  }

  // The local Mapping scanner is retired. Backend push notifications are the
  // only active notification source, so no lifecycle event may start it again.
  [
    'amyfx:entry-watch-updated',
    'amyfx:mapping-state-change',
    'amyfx:market-update',
    'pageshow',
    'pagehide'
  ].forEach(name => window.addEventListener(name, stopLegacyScanner));

  document.addEventListener('visibilitychange', stopLegacyScanner);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', stopLegacyScanner, { once: true });
  } else {
    stopLegacyScanner();
  }
})();
