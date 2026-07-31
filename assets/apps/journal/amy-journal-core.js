(function () {
  'use strict';
  if (window.__amyJournalFixLoader159) return;
  window.__amyJournalFixLoader159 = true;

  function loadScript(source, onload) {
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    if (onload) script.addEventListener('load', onload, { once: true });
    document.head.appendChild(script);
  }

  loadScript('./amy-journal-final-fix-legacy.js?v=20260725-v159', function () {
    loadScript('./amy-journal-ai-runtime-fix.js?v=20260725-v159');
  });
})();
