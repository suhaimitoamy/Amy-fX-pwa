(function () {
  'use strict';

  const PREVIEW_BADGE_ID = 'amyfx-preview-update';
  const PREVIEW_CARD_TEXT = 'AMY FX V1.5 PREVIEW AKTIF';

  function removePreviewBranding(root = document) {
    if (document.title.includes('Preview')) {
      document.title = 'Amy FX · Market Intelligence';
    }

    document.getElementById(PREVIEW_BADGE_ID)?.remove();

    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll('section.card, div').forEach(element => {
      const text = String(element.textContent || '').trim().toUpperCase();
      if (text === PREVIEW_CARD_TEXT || text.includes(PREVIEW_CARD_TEXT)) {
        const card = element.matches('section.card') ? element : element.closest('section.card');
        card?.remove();
      }
    });
  }

  function start() {
    removePreviewBranding();
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) removePreviewBranding(node);
        }
      }
      document.getElementById(PREVIEW_BADGE_ID)?.remove();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
