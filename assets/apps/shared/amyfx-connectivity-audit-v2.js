"use strict";

(function () {
  if (window.__amyFxConnectivityAuditV2) return;
  window.__amyFxConnectivityAuditV2 = true;

  const VERSION = "2.1.0";
  const ROUTING_KEY = "amyfx.mentor.routing.v1";
  const SETTINGS_KEY = "amyfx.globalAiSettings.v1";
  const INTEL_KEY = "amyfx.market.intel.v1";
  const JOURNAL_DB = "tradingLibraryManager.files";
  const META_STORE = "metadata";
  const JOURNAL_RECORD = "journals.v2";
  const ITEMS_RECORD = "items.v2";
  const MARKET_MAX_AGE = 5 * 60 * 1000;
  const SCRIPT_URL = document.currentScript?.src || "";
  const ASSET_ROOT = SCRIPT_URL ? new URL("../../", SCRIPT_URL) : new URL("../../", location.href);

  const clean = value => String(value ?? "").trim();
  const lower = value => clean(value).toLowerCase().replace(/\s+/g, " ");
  const safeParse = (value, fallback = null) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function readLocalJson(key, fallback) {
    try { return safeParse(localStorage.getItem(key), fallback) ?? fallback; } catch { return fallback; }
  }

  function recordRoute(route) {
    const stats = readLocalJson(ROUTING_KEY, {}) || {};
    stats.bot = Number(stats.bot) || 0;
    stats.ai = Number(stats.ai) || 0;
    if (route === "ai") stats.ai += 1; else stats.bot += 1;
    stats.last_route = route;
    stats.updated_at = new Date().toISOString();
    try { localStorage.setItem(ROUTING_KEY, JSON.stringify(stats)); } catch {}
    window.dispatchEvent(new CustomEvent("amyfx:mentor-route", { detail: { ...stats, route } }));
    return stats;
  }

  function openExistingDatabase(name, timeoutMs = 1800) {
    return new Promise(async resolve => {
      if (!window.indexedDB) return resolve(null);
      try {
        if (typeof indexedDB.databases === "function") {
          const databases = await indexedDB.databases();
          if (!databases.some(database => database?.name === name)) return resolve(null);
        }
      } catch {}

      let settled = false;
      const finish = value => {
        if (settled) {
          try { value?.close?.(); } catch {}
          return;
        }
        settled = true;
        resolve(value);
      };
      try {
        const request = indexedDB.open(name);
        request.onsuccess = () => finish(request.result);
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
        request.onupgradeneeded = () => {
          try { request.transaction?.abort(); } catch {}
          finish(null);
        };
        window.setTimeout(() => finish(null), timeoutMs);
      } catch {
        finish(null);
      }
    });
  }

  async function readMetadata(recordId, legacyKey) {
    const db = await openExistingDatabase(JOURNAL_DB);
    if (!db) {
      const legacy = readLocalJson(legacyKey, []);
      return Array.isArray(legacy) ? legacy : [];
    }
    if (!db.objectStoreNames.contains(META_STORE)) {
      db.close();
      const legacy = readLocalJson(legacyKey, []);
      return Array.isArray(legacy) ? legacy : [];
    }
    return new Promise(resolve => {
      try {
        const transaction = db.transaction(META_STORE, "readonly");
        const request = transaction.objectStore(META_STORE).get(recordId);
        request.onsuccess = () => {
          const rows = Array.isArray(request.result?.value) ? request.result.value : readLocalJson(legacyKey, []);
          db.close();
          resolve(Array.isArray(rows) ? rows : []);
        };
        request.onerror = () => {
          db.close();
          const legacy = readLocalJson(legacyKey, []);
          resolve(Array.isArray(legacy) ? legacy : []);
        };
        transaction.onabort = () => {
          db.close();
          const legacy = readLocalJson(legacyKey, []);
          resolve(Array.isArray(legacy) ? legacy : []);
        };
      } catch {
        db.close();
        const legacy = readLocalJson(legacyKey, []);
        resolve(Array.isArray(legacy) ? legacy : []);
      }
    });
  }

  function timestampOf(row) {
    const value = row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at || row?.date || 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function newest(rows, limit = 15) {
    return [...rows].sort((left, right) => timestampOf(right) - timestampOf(left)).slice(0, limit);
  }

  function journalSummary(rows) {
    const result = value => lower(value);
    const win = rows.filter(row => result(row.result || row.outcome?.result) === "win").length;
    const loss = rows.filter(row => result(row.result || row.outcome?.result) === "loss").length;
    const be = rows.filter(row => ["be", "break even", "breakeven"].includes(result(row.result || row.outcome?.result))).length;
    const completed = win + loss + be;
    const profit = rows.reduce((total, row) => total + (Number(row.profit ?? row.outcome?.profit) || 0), 0);
    const losses = rows.reduce((total, row) => total + (Number(row.loss ?? row.outcome?.loss) || 0), 0);
    return {
      total: rows.length,
      win,
      loss,
      break_even: be,
      completed,
      win_rate: completed ? Math.round((win / completed) * 1000) / 10 : null,
      total_profit: Math.round(profit * 100) / 100,
      total_loss: Math.round(losses * 100) / 100,
      net_result: Math.round((profit - losses) * 100) / 100
    };
  }

  function libraryCatalog(rows) {
    const byCategory = {};
    const byType = {};
    const byStatus = {};
    rows.forEach(row => {
      const category = clean(row.category || "Tanpa kategori");
      const type = clean(row.type || row.mediaKind || "Lainnya");
      const status = clean(row.status || "Tanpa status");
      byCategory[category] = (byCategory[category] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    return { total: rows.length, by_category: byCategory, by_type: byType, by_status: byStatus };
  }

  function marketCandidate(part, price, timestamp) {
    const numericPrice = Number(price);
    const numericTime = Number(part?.storedAt || 0) || new Date(timestamp || 0).getTime();
    if (!Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isFinite(numericTime) || numericTime <= 86_400_000) return null;
    return { price: numericPrice, time: numericTime, part };
  }

  function marketSnapshot() {
    const shared = window.AmyFXIntel?.read?.() || window.AmyFXIntelState || readLocalJson(INTEL_KEY, {});
    const liveState = window.AmyFXMarketState || window.lastMappingResult || shared.mapping || null;
    const candidates = [
      marketCandidate(shared.mapping, shared.mapping?.price, shared.mapping?.updated || shared.mapping?.capturedAt),
      marketCandidate(shared.liquidity, shared.liquidity?.currentPrice, shared.liquidity?.updated),
      marketCandidate(shared.heatmap, shared.heatmap?.currentPrice, shared.heatmap?.updated),
      marketCandidate(null, liveState?.price, liveState?.capturedAt || liveState?.updatedAt)
    ].filter(Boolean).sort((left, right) => right.time - left.time);
    const latest = candidates[0] || null;
    const ageMs = latest ? Math.max(0, Date.now() - latest.time) : Number.MAX_SAFE_INTEGER;
    const fresh = navigator.onLine !== false && Boolean(latest) && ageMs <= MARKET_MAX_AGE && liveState?.dataStale !== true;
    const capturedAt = latest ? new Date(latest.time).toISOString() : null;
    const setups = readLocalJson("amy_mapping_setups", []);
    const analyses = readLocalJson("amy_mapping_analyses", []);
    return {
      pair: "XAU/USD",
      captured_at: fresh ? capturedAt : null,
      last_captured_at: capturedAt,
      freshness: { state: fresh ? "fresh" : latest ? "stale" : "missing", age_ms: ageMs, max_age_ms: MARKET_MAX_AGE },
      live_state: liveState,
      shared_intelligence: shared,
      current_price: latest?.price || Number(localStorage.getItem("last_price") || 0) || null,
      active_and_recent_setups: Array.isArray(setups) ? newest(setups, 12) : [],
      recent_analyses: Array.isArray(analyses) ? newest(analyses, 10) : []
    };
  }

  function providerSnapshot() {
    const settings = window.AmyFXOS?.getGlobalSettings?.() || readLocalJson(SETTINGS_KEY, {}) || {};
    const refs = Array.isArray(settings.key_refs) ? settings.key_refs.map(ref => ({
      id: clean(ref.id),
      alias: clean(ref.alias),
      provider: clean(ref.provider),
      model: clean(ref.model),
      masked_tail: clean(ref.masked_tail).slice(-4),
      priority: Number(ref.priority) || 0,
      status: clean(ref.status) || "ready"
    })) : [];
    const vaultAvailable = Boolean(window.AmyNativeAI?.send && window.AmyNativeAI?.storeSecret && window.AmyNativeAI?.listSecrets);
    return {
      key_refs: refs,
      providers: refs,
      paid_fallback: Boolean(settings.paid_fallback),
      secure_vault_available: vaultAvailable,
      secure_vault: { available: vaultAvailable }
    };
  }

  async function buildBotWorkspace(question = "") {
    const value = lower(question);
    const needsTrading = /status semua|cek semua|jurnal|journal|library|file|materi|entry|trade|win|loss|profit|rugi|apa yang perlu|langkah sekarang/.test(value);
    const [journals, items] = needsTrading
      ? await Promise.all([
        readMetadata(JOURNAL_RECORD, "tradingLibraryManager.journals.v1"),
        readMetadata(ITEMS_RECORD, "tradingLibraryManager.items.v1")
      ])
      : [[], []];
    const readTopics = readLocalJson("amy_read_topics", []);
    const version = window.AmyFXAppVersion || null;
    const ai = providerSnapshot();
    return {
      schema: "AmyFXBotWorkspaceContext",
      schema_version: 2,
      generated_at: new Date().toISOString(),
      market: marketSnapshot(),
      trading: {
        journal: { summary: journalSummary(journals), recent: newest(journals, 12) },
        library: { catalog: libraryCatalog(items) }
      },
      academy: {
        progress: {
          read_topics: Array.isArray(readTopics) ? readTopics : [],
          read_count: Array.isArray(readTopics) ? readTopics.length : 0,
          total_sections: 36,
          percentage: Array.isArray(readTopics) ? Math.min(100, Math.round((readTopics.length / 36) * 100)) : 0,
          last_title: localStorage.getItem("amy_last_opened_title") || "",
          last_url: localStorage.getItem("amy_last_opened_url") || ""
        }
      },
      system: {
        app_version: version,
        app: { product: "Amy FX Preview", version, active_module: currentModule(), route: location.pathname, online: navigator.onLine },
        ai,
        provider_status: ai,
        secure_vault: { available: ai.secure_vault_available }
      }
    };
  }

  async function buildAiContext(question, options = {}) {
    const market = marketSnapshot();
    let workspace = null;
    try {
      workspace = await window.AmyFXUniversalContext?.collect?.(question);
    } catch {}
    if (!workspace || typeof workspace !== "object") {
      workspace = await buildBotWorkspace(question);
      workspace.schema = "AmyFXUniversalWorkspaceContext";
      workspace.request_query = clean(question);
    }
    workspace.request_query = clean(question);
    workspace.market = { ...(workspace.market || {}), ...market };
    const capturedAt = market.captured_at;
    return {
      id: `ctx-ai-${Date.now()}`,
      schema: "ContextEnvelope",
      schema_version: 1,
      source_module: options.sourceModule || currentModule(),
      captured_at: capturedAt,
      display_time: capturedAt ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(capturedAt)) + " WITA" : "Belum ada data",
      privacy_scope: "all_modules_read_only_no_secrets",
      access_scope: "all_amy_fx_modules",
      freshness: market.freshness,
      source_refs: [{ module: "workspace", scope: "all_modules", captured_at: workspace.generated_at || new Date().toISOString() }],
      payload: { workspace },
      errors: []
    };
  }

  function normalizeMenuInput(question) {
    const value = lower(question).replace(/[.)]/g, "").trim();
    return ({
      "1": "status market",
      "2": "buka mapping",
      "3": "cek statistik jurnal",
      "4": "progres academy",
      "5": "status api",
      "6": "versi aplikasi"
    })[value] || clean(question);
  }

  function journalViewIntent(question) {
    const value = lower(question);
    if (!/(buka|masuk|pergi ke|arahkan|lihat)/.test(value)) return "";
    if (/jurnal|journal/.test(value)) return "journal";
    if (/library|koleksi|file|dokumen/.test(value)) return "library";
    if (/catatan/.test(value)) return "notes";
    if (/asisten/.test(value)) return "assistant";
    if (/statistik|dashboard|dasbor/.test(value)) return "statistics";
    if (/media|gambar|video/.test(value)) return "media";
    return "";
  }

  function navigationIntent(question) {
    const value = lower(question);
    const journalView = journalViewIntent(value);
    if (journalView) return { module: "journal", view: journalView };
    if (!/(buka|masuk|pergi ke|arahkan|lihat)/.test(value)) return null;
    if (/mapping/.test(value)) return { module: "mapping" };
    if (/market intel|intel|berita|news|heatmap|liquidity|likuiditas/.test(value)) return { module: "intel" };
    if (/academy|materi|belajar|kursus/.test(value)) return { module: "academy" };
    if (/beranda|home|profil/.test(value)) return { module: "home" };
    return null;
  }

  function routeUrl(intent) {
    if (!intent) return "";
    const paths = {
      home: "index.html",
      mapping: "apps/mapping/index.html",
      intel: "apps/market-intel/index.html",
      journal: "apps/journal/index.html",
      academy: "apps/academy/index.html"
    };
    const path = paths[intent.module];
    if (!path) return "";
    const url = new URL(path, ASSET_ROOT);
    if (intent.module === "journal" && intent.view) url.hash = intent.view;
    return url.href;
  }

  function navigate(intent) {
    const url = routeUrl(intent);
    if (!url) return false;
    const current = new URL(location.href);
    const target = new URL(url);
    if (current.pathname === target.pathname && intent.module === "journal" && intent.view) {
      location.hash = intent.view;
      applyJournalDeepLink();
      return true;
    }
    window.setTimeout(() => { location.href = url; }, 450);
    return true;
  }

  function navigationAnswer(intent) {
    if (!intent) return "";
    if (intent.module === "mapping") return "Membuka Mapping…";
    if (intent.module === "intel") return "Membuka Market Intel…";
    if (intent.module === "academy") return "Membuka Amy FX Academy…";
    if (intent.module === "home") return "Membuka Beranda…";
    const labels = { journal: "Jurnal Trading", library: "Trading Library", notes: "Catatan Pribadi", assistant: "Asisten Jurnal", statistics: "Dasbor Statistik", media: "Media" };
    return `Membuka ${labels[intent.view] || "Trading Library"}…`;
  }

  function applyJournalDeepLink() {
    if (currentModule() !== "journal") return false;
    const target = lower(location.hash.replace(/^#/, ""));
    if (!target || !["library", "media", "journal", "notes", "assistant", "statistics", "code"].includes(target)) return false;
    const button = document.querySelector(`.side-nav-button[data-view="${target}"], .bottom-nav .nav-button[data-view="${target}"]`);
    if (!button) return false;
    if (!document.querySelector(`#${target}View`)?.classList.contains("is-active")) button.click();
    return true;
  }

  function fallbackAnswer() {
    return "Saya belum menemukan menu yang tepat. Ketik ‘menu’ untuk bantuan cepat, atau awali dengan ‘AI:’ bila pertanyaan memerlukan analisis bebas.";
  }

  function installFinalRouter() {
    const os = window.AmyFXOS;
    const customer = window.AmyFXCustomerService;
    if (!os?.ask || !customer?.answer || !customer?.needsAi || os.__amyConnectivityAuditV2) return Boolean(os?.__amyConnectivityAuditV2);
    const originalAsk = os.ask.bind(os);

    const ask = async function (question, options = {}) {
      const normalized = normalizeMenuInput(question);
      if (customer.needsAi(normalized)) {
        const context = await buildAiContext(normalized, options);
        return originalAsk(normalized, { ...options, context });
      }

      const workspace = await buildBotWorkspace(normalized);
      const context = {
        id: `ctx-bot-${Date.now()}`,
        schema: "ContextEnvelope",
        schema_version: 1,
        source_module: options.sourceModule || currentModule(),
        captured_at: workspace.market.captured_at,
        display_time: workspace.market.captured_at ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(workspace.market.captured_at)) + " WITA" : "Belum ada data",
        privacy_scope: "all_modules_read_only_no_secrets",
        freshness: workspace.market.freshness,
        payload: { workspace },
        errors: []
      };

      const intent = navigationIntent(normalized);
      let answer = "";
      if (intent) {
        navigate(intent);
        answer = navigationAnswer(intent);
      } else {
        answer = customer.answer(normalized, context) || fallbackAnswer();
      }
      recordRoute("bot");
      return { text: answer, provider: "amy-bot", model: "customer-service-connectivity-v2", source: "Bot Amy FX", route: "bot", context };
    };

    window.AmyFXOS = Object.freeze({
      ...os,
      ask,
      connectivityAudit: Object.freeze({ version: VERSION, buildBotWorkspace, buildAiContext, navigate, applyJournalDeepLink }),
      __amyConnectivityAuditV2: true
    });
    window.dispatchEvent(new CustomEvent("amyfx:connectivity-ready", { detail: { version: VERSION } }));
    return true;
  }

  function updateUi() {
    const health = document.querySelector("[data-amy-health]");
    if (health && !health.dataset.amyConnectivityV2) {
      health.dataset.amyConnectivityV2 = "1";
      health.textContent = `${health.textContent} • TERHUBUNG`;
    }
    const input = document.querySelector("[data-amy-input]");
    if (input) input.placeholder = "Pilih bantuan, ketik nomor 1–6, atau AI: untuk analisis";
  }

  function boot() {
    applyJournalDeepLink();
    window.addEventListener("hashchange", applyJournalDeepLink);
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const ready = installFinalRouter();
      applyJournalDeepLink();
      updateUi();
      if ((ready && document.querySelector("[data-amy-input]")) || attempts >= 400) clearInterval(timer);
    }, 75);
    window.setTimeout(() => clearInterval(timer), 35_000);

    const target = document.body || document.documentElement;
    if (target) new MutationObserver(() => {
      installFinalRouter();
      applyJournalDeepLink();
      updateUi();
    }).observe(target, { childList: true, subtree: true });
    window.addEventListener("focus", () => { installFinalRouter(); applyJournalDeepLink(); updateUi(); });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { installFinalRouter(); applyJournalDeepLink(); updateUi(); }
    });
  }

  window.AmyFXConnectivityAudit = Object.freeze({
    version: VERSION,
    buildBotWorkspace,
    buildAiContext,
    normalizeMenuInput,
    navigationIntent,
    navigate,
    applyJournalDeepLink,
    marketSnapshot,
    providerSnapshot
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
