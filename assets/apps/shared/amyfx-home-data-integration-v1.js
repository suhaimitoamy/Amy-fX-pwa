"use strict";

(function () {
  if (window.__amyFxHomeDataIntegrationV1) return;
  window.__amyFxHomeDataIntegrationV1 = true;

  const DB_NAME = "tradingLibraryManager.files";
  const META_STORE = "metadata";
  const JOURNAL_RECORD = "journals.v2";
  const ITEMS_RECORD = "items.v2";
  const LEGACY_JOURNAL_KEY = "tradingLibraryManager.journals.v1";
  const LEGACY_ITEMS_KEY = "tradingLibraryManager.items.v1";
  let refreshToken = 0;
  let lastFingerprint = "";

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function readLegacyRows(key) {
    try {
      return safeArray(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      return [];
    }
  }

  function mappingCount() {
    try {
      return safeArray(JSON.parse(localStorage.getItem("amy_mapping_analyses") || "[]")).length;
    } catch {
      return 0;
    }
  }

  function legacyJournalCount() {
    return readLegacyRows(LEGACY_JOURNAL_KEY).length;
  }

  function legacyLibraryCount() {
    return readLegacyRows(LEGACY_ITEMS_KEY).length;
  }

  async function databaseExists() {
    if (!window.indexedDB) return false;
    if (typeof indexedDB.databases !== "function") return null;
    try {
      const rows = await indexedDB.databases();
      return rows.some(row => row?.name === DB_NAME);
    } catch {
      return null;
    }
  }

  async function openExistingDatabase() {
    if (!window.indexedDB) return null;
    const exists = await databaseExists();
    if (exists === false) return null;

    return new Promise(resolve => {
      let settled = false;
      const finish = db => {
        if (settled) { db?.close?.(); return; }
        settled = true;
        resolve(db || null);
      };
      let request;
      try {
        request = indexedDB.open(DB_NAME);
      } catch {
        finish(null);
        return;
      }
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onupgradeneeded = () => {
        try { request.transaction?.abort(); } catch {}
        finish(null);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        finish(db);
      };
      window.setTimeout(() => finish(null), 2500);
    });
  }

  async function readMetadataCounts() {
    const fallback = {
      journals: legacyJournalCount(),
      library: legacyLibraryCount()
    };
    const db = await openExistingDatabase();
    if (!db) return fallback;
    if (!db.objectStoreNames.contains(META_STORE)) {
      db.close();
      return fallback;
    }

    return new Promise(resolve => {
      let settled = false;
      const result = { ...fallback };
      const finish = value => {
        if (settled) return;
        settled = true;
        try { db.close(); } catch {}
        resolve(value || result);
      };
      try {
        const tx = db.transaction(META_STORE, "readonly");
        const store = tx.objectStore(META_STORE);
        const requests = [
          [JOURNAL_RECORD, "journals"],
          [ITEMS_RECORD, "library"]
        ];
        let pending = requests.length;
        const done = () => {
          pending -= 1;
          if (pending <= 0) finish(result);
        };
        requests.forEach(([recordId, key]) => {
          const request = store.get(recordId);
          request.onsuccess = () => {
            result[key] = safeArray(request.result?.value).length;
            done();
          };
          request.onerror = done;
        });
        tx.onabort = () => finish(fallback);
        tx.onerror = () => finish(fallback);
        tx.oncomplete = () => finish(result);
      } catch {
        finish(fallback);
      }
      window.setTimeout(() => finish(result), 2500);
    });
  }

  function statValue(label) {
    const card = [...document.querySelectorAll(".stats-grid .stat-card")]
      .find(item => item.querySelector("small")?.textContent?.trim() === label);
    return card?.querySelector("strong") || null;
  }

  function publish(analyses, journals, library) {
    const next = Object.freeze({ analyses, journals, library, updatedAt: new Date().toISOString() });
    const fingerprint = JSON.stringify([analyses, journals, library]);
    window.AmyFXHomeStats = Object.freeze({ analyses, journals, library, updatedAt: next.updatedAt });
    if (fingerprint === lastFingerprint) return window.AmyFXHomeStats;
    lastFingerprint = fingerprint;
    window.dispatchEvent(new CustomEvent("amyfx:home-stats-change", { detail: window.AmyFXHomeStats }));
    return window.AmyFXHomeStats;
  }

  async function refresh() {
    const token = ++refreshToken;
    const analyses = mappingCount();
    const metadata = await readMetadataCounts();
    if (token !== refreshToken) return;

    const journals = Number(metadata.journals) || 0;
    const library = Number(metadata.library) || 0;
    const mappingTarget = statValue("Analisis Mapping");
    const journalTarget = statValue("Catatan Jurnal");
    if (mappingTarget) mappingTarget.textContent = String(analyses);
    if (journalTarget) journalTarget.textContent = String(journals);
    publish(analyses, journals, library);
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const nextFrame = window.requestAnimationFrame || (callback => window.setTimeout(callback, 16));
    nextFrame(() => {
      scheduled = false;
      refresh();
    });
  }

  function boot() {
    schedule();
    const target = document.getElementById("main-content") || document.body;
    if (target) new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
    window.addEventListener("focus", schedule);
    window.addEventListener("storage", event => {
      if (!event.key || ["amy_mapping_analyses", LEGACY_JOURNAL_KEY, LEGACY_ITEMS_KEY].includes(event.key)) schedule();
    });
    [
      "amyfx:journal-state-change",
      "amyfx:library-state-change",
      "amyfx:mapping-state-change",
      "amyfx:integration-change"
    ].forEach(name => window.addEventListener(name, schedule));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
