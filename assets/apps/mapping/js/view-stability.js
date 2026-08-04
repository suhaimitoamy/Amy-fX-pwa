(function () {
  'use strict';

  if (window.__amyFxStaticViewStabilityInstalled) return;
  window.__amyFxStaticViewStabilityInstalled = true;

  // Analyze intentionally keeps the browser's native scroll position.
  // No observer, anchor restoration, auto-scroll, or synthetic scroll correction
  // is installed here. Panel stability is handled by static DOM order and
  // closed-candle signature deduplication in the Mapping UI modules.
  window.AmyFXViewStability = Object.freeze({
    version: '2.0.0',
    mode: 'STATIC_NATIVE_SCROLL',
    autoScroll: false,
    restorePosition: false,
    observeNestedDom: false
  });
})();
