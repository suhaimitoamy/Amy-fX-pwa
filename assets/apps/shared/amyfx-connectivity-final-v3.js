"use strict";

(function () {
  if (window.__amyFxConnectivityFinalV3) return;
  window.__amyFxConnectivityFinalV3 = true;

  const VERSION = "3.0.0";
  const SCRIPT_URL = document.currentScript?.src || "";
  const ASSET_ROOT = SCRIPT_URL ? new URL("../../", SCRIPT_URL) : new URL("../../", location.href);
  const INTENT_KEY = "amyfx.navigation.intent.v3";
  const REGISTRY_KEY = "amyfx.module.registry.v3";
  const INTEL_KEY = "amyfx.market.intel.v1";
  const ROUTING_KEY = "amyfx.mentor.routing.v1";
  const MAX_INTENT_AGE = 60_000;
  const ROUTES = Object.freeze({
    home: "index.html",
    mapping: "apps/mapping/index.html",
    intel: "apps/market-intel/index.html",
    journal: "apps/journal/index.html",
    academy: "apps/academy/index.html"
  });

  const clean = value => String(value ?? "").trim();
  const lower = value => clean(value).toLowerCase().replace(/\s+/g, " ");
  const safeParse = (value, fallback = null) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const selectorValue = value => clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function capabilities(module) {
    return ({
      home: ["profile", "projects", "collections", "update"],
      mapping: ["dashboard", "analysis", "setups", "history", "settings"],
      intel: ["news", "heatmap", "liquidity"],
      journal: ["library", "media", "journal", "notes", "assistant", "statistics"],
      academy: ["catalog", "lessons", "progress", "quiz", "mentor"]
    })[module] || [];
  }

  function readRegistry() {
    try { return safeParse(localStorage.getItem(REGISTRY_KEY), {}) || {}; } catch { return {}; }
  }

  function registerModule() {
    const module = currentModule();
    const registry = readRegistry();
    registry[module] = {
      module,
      route: location.pathname,
      ready_at: new Date().toISOString(),
      capabilities: capabilities(module)
    };
    try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry)); } catch {}
    window.AmyFXModuleRegistry = registry;
    window.dispatchEvent(new CustomEvent("amyfx:module-ready", { detail: registry[module] }));
    return registry[module];
  }

  function version() {
    const value = window.AmyFXAppVersion || {};
    const name = clean(value.name || value.version || value.versionName);
    const code = Number(value.code || value.versionCode || 0);
    return { name: name || "belum diketahui", code: code || null };
  }

  function loadInstalledVersion() {
    if (window.AmyFXAppVersion?.name) return Promise.resolve(version());
    const existing = document.querySelector("script[data-amyfx-app-version='v3']");
    if (existing) {
      return new Promise(resolve => {
        const timer = setInterval(() => {
          if (window.AmyFXAppVersion?.name) { clearInterval(timer); resolve(version()); }
        }, 50);
        setTimeout(() => { clearInterval(timer); resolve(version()); }, 4_000);
      });
    }
    return new Promise(resolve => {
      const script = document.createElement("script");
      script.src = new URL("app-version.js", ASSET_ROOT).href;
      script.dataset.amyfxAppVersion = "v3";
      script.async = false;
      script.onload = () => {
        const detail = version();
        window.dispatchEvent(new CustomEvent("amyfx:app-version-ready", { detail }));
        resolve(detail);
      };
      script.onerror = () => resolve(version());
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function syncIntelGlobals() {
    let state = {};
    try { state = safeParse(localStorage.getItem(INTEL_KEY), {}) || {}; } catch {}
    if (window.AmyFXIntel?.syncGlobals) return window.AmyFXIntel.syncGlobals(state);
    const timestamps = Object.values(state).map(part => {
      const value = Number(part?.storedAt || 0) || new Date(part?.updated || part?.capturedAt || part?.captured_at || part?.analyzedAt || 0).getTime();
      return Number.isFinite(value) && value > 86_400_000 ? value : 0;
    }).filter(Boolean);
    window.AmyFXIntelState = { ...state, updatedAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null };
    if (state.heatmap) window.AmyFXHeatmapState = { ...state.heatmap, sourceMethod: state.heatmap.sourceMethod || state.heatmap.source || "OHLC-derived/modelled liquidity" };
    return state;
  }

  function makeIntent(module, view = "", extra = {}) {
    return { module, view: clean(view), extra, source: currentModule(), created_at: Date.now() };
  }

  function writeIntent(intent) {
    try { localStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch {}
  }

  function clearIntent() {
    try { localStorage.removeItem(INTENT_KEY); } catch {}
  }

  function readIntent() {
    try {
      const intent = safeParse(localStorage.getItem(INTENT_KEY), null);
      if (!intent || Date.now() - Number(intent.created_at || 0) > MAX_INTENT_AGE) {
        clearIntent();
        return null;
      }
      return intent;
    } catch { return null; }
  }

  function click(selector) {
    const target = document.querySelector(selector);
    if (!target) return false;
    target.click();
    return true;
  }

  function consumeIntent() {
    const intent = readIntent();
    const module = currentModule();
    if (!intent || intent.module !== module) return false;
    let applied = false;

    if (module === "journal") {
      const view = selectorValue(intent.view || "journal");
      applied = click(`.side-nav-button[data-view="${view}"], .bottom-nav [data-view="${view}"]`);
    } else if (module === "intel") {
      const tab = selectorValue(intent.view || "news");
      applied = click(`.intel-tab[data-tab="${tab}"]`);
    } else if (module === "mapping") {
      const tab = selectorValue(intent.view || "Dashboard");
      try { localStorage.setItem("amy_mapping_tab", tab); } catch {}
      applied = click(`.nav [data-tab="${tab}"]`);
    } else if (module === "home") {
      const tab = selectorValue(intent.view || "beranda");
      applied = click(`.nav-btn[data-target="${tab}"]`);
    } else if (module === "academy") {
      applied = true;
    }

    if (applied) {
      clearIntent();
      window.dispatchEvent(new CustomEvent("amyfx:navigation-applied", { detail: intent }));
    }
    return applied;
  }

  function navigate(module, view = "", extra = {}) {
    const path = ROUTES[module];
    if (!path) return false;
    const intent = makeIntent(module, view, extra);
    writeIntent(intent);
    if (module === currentModule() && consumeIntent()) return true;
    const target = new URL(path, ASSET_ROOT);
    if (module === "journal" && view) target.hash = view;
    if (module === "intel" && view) target.hash = `tab=${encodeURIComponent(view)}`;
    location.href = target.href;
    return true;
  }

  function navigationIntent(question) {
    const value = lower(question);
    if (!/(buka|masuk|pergi ke|arahkan|lihat|tampilkan)/.test(value)) return null;

    if (/heatmap/.test(value)) return { module: "intel", view: "heatmap", answer: "Membuka Liquidity Heatmap…" };
    if (/liquidity|likuiditas/.test(value)) return { module: "intel", view: "liquidity", answer: "Membuka Liquidity…" };
    if (/market intel|intel|berita|news/.test(value)) return { module: "intel", view: "news", answer: "Membuka Market Intel…" };

    if (/statistik|dashboard jurnal|dasbor jurnal/.test(value)) return { module: "journal", view: "statistics", answer: "Membuka Dasbor Statistik…" };
    if (/asisten jurnal|assistant jurnal/.test(value)) return { module: "journal", view: "assistant", answer: "Membuka Asisten Jurnal…" };
    if (/catatan|notes/.test(value)) return { module: "journal", view: "notes", answer: "Membuka Catatan Pribadi…" };
    if (/media|gambar|video/.test(value) && /jurnal|library|koleksi/.test(value)) return { module: "journal", view: "media", answer: "Membuka Media…" };
    if (/library|koleksi file|dokumen/.test(value)) return { module: "journal", view: "library", answer: "Membuka Trading Library…" };
    if (/jurnal|journal/.test(value)) return { module: "journal", view: "journal", answer: "Membuka Jurnal Trading…" };

    if (/mapping/.test(value)) {
      const view = /analisis/.test(value) ? "Analyze" : /setup|skenario/.test(value) ? "Setups" : /riwayat|history/.test(value) ? "History" : /pengaturan|settings/.test(value) ? "Settings" : "Dashboard";
      return { module: "mapping", view, answer: `Membuka Mapping ${view === "Dashboard" ? "" : view}…`.replace(/\s+…/, "…") };
    }
    if (/academy|materi|belajar|kursus/.test(value)) return { module: "academy", answer: "Membuka Amy FX Academy…" };
    if (/profil/.test(value)) return { module: "home", view: "profil", answer: "Membuka Profil…" };
    if (/beranda|home/.test(value)) return { module: "home", view: "beranda", answer: "Membuka Beranda…" };
    return null;
  }

  function recordBotRoute() {
    const stats = safeParse(localStorage.getItem(ROUTING_KEY), {}) || {};
    stats.bot = Number(stats.bot) || 0;
    stats.ai = Number(stats.ai) || 0;
    stats.bot += 1;
    stats.last_route = "bot";
    stats.updated_at = new Date().toISOString();
    try { localStorage.setItem(ROUTING_KEY, JSON.stringify(stats)); } catch {}
    window.dispatchEvent(new CustomEvent("amyfx:mentor-route", { detail: { ...stats, route: "bot" } }));
  }

  function installFinalRouter() {
    const os = window.AmyFXOS;
    if (!os?.ask || !os.__amyConnectivityAuditV2 || os.__amyConnectivityFinalV3) return Boolean(os?.__amyConnectivityFinalV3);
    const originalAsk = os.ask.bind(os);
    const ask = async function (question, options = {}) {
      await loadInstalledVersion();
      const intent = navigationIntent(question);
      if (intent) {
        navigate(intent.module, intent.view || "");
        recordBotRoute();
        return {
          text: intent.answer,
          provider: "amy-bot",
          model: "connectivity-final-v3",
          source: "Bot Amy FX",
          route: "bot",
          context: options.context || null
        };
      }
      return originalAsk(question, options);
    };

    window.AmyFXOS = Object.freeze({
      ...os,
      ask,
      connectivityFinal: Object.freeze({ version: VERSION, navigate, consumeIntent, registry: readRegistry }),
      __amyConnectivityFinalV3: true
    });
    window.dispatchEvent(new CustomEvent("amyfx:connectivity-final-ready", { detail: { version: VERSION } }));
    return true;
  }

  function clearEphemeralCache() {
    const keys = [
      "amy_mapping_tmp", "amy_test_cache", "amy_debug_log", "amy_mapping_logs",
      "amy_recent_projects", "amyfx.notify.last.sent", "amyfx.os.notifications.v1"
    ];
    keys.forEach(key => {
      try { localStorage.removeItem(key); } catch {}
    });
    window.dispatchEvent(new CustomEvent("amyfx:cache-cleared", {
      detail: { preserved: ["journal", "library", "api_keys", "license", "mapping_history", "academy_session"] }
    }));
  }

  function refreshHomeUi() {
    if (currentModule() !== "home") return;
    const installed = version();
    document.querySelectorAll("[data-koleksi='update'] small").forEach(node => {
      node.textContent = installed.code ? `Amy FX Preview ${installed.name} (${installed.code})` : "Periksa pembaruan aplikasi";
    });
  }

  function installHomeActions() {
    if (document.documentElement.dataset.amyConnectivityFinalHome === "1") return;
    document.documentElement.dataset.amyConnectivityFinalHome = "1";
    document.addEventListener("click", event => {
      const update = event.target.closest?.("[data-koleksi='update']");
      if (update) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.AmyFXUpdate?.checkNow) window.AmyFXUpdate.checkNow({ announce: true });
        else {
          window.showToast?.("Pemeriksa update sedang dimuat.");
          setTimeout(() => window.AmyFXUpdate?.checkNow?.({ announce: true }), 800);
        }
        return;
      }

      const clear = event.target.closest?.("[data-profile-action='clear']");
      if (!clear) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!window.confirm("Bersihkan cache sementara? Jurnal, Library, riwayat Mapping, lisensi, dan API key tidak akan dihapus.")) return;
      clearEphemeralCache();
      window.showToast?.("Cache sementara sudah dibersihkan. Data utama tetap aman.");
    }, true);
  }

  function updateUi() {
    const health = document.querySelector("[data-amy-health]");
    if (health && !health.dataset.amyConnectivityFinal) {
      health.dataset.amyConnectivityFinal = "1";
      health.textContent = `${health.textContent} • SYNC V3`;
    }
    refreshHomeUi();
  }

  function boot() {
    syncIntelGlobals();
    registerModule();
    loadInstalledVersion().finally(updateUi);
    installHomeActions();
    consumeIntent();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const ready = installFinalRouter();
      consumeIntent();
      updateUi();
      if ((ready && document.querySelector("[data-amy-input]")) || attempts >= 400) clearInterval(timer);
    }, 75);
    setTimeout(() => clearInterval(timer), 35_000);

    window.addEventListener("storage", event => {
      if (event.key === INTENT_KEY) consumeIntent();
      if (event.key === INTEL_KEY) {
        syncIntelGlobals();
        window.dispatchEvent(new CustomEvent("amyfx:market-update", { detail: window.AmyFXIntelState || {} }));
      }
    });
    window.addEventListener("amyfx:market-update", syncIntelGlobals);
    window.addEventListener("focus", () => { installFinalRouter(); consumeIntent(); syncIntelGlobals(); updateUi(); });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { installFinalRouter(); consumeIntent(); syncIntelGlobals(); updateUi(); }
    });

    const target = document.body || document.documentElement;
    if (target) new MutationObserver(() => { installFinalRouter(); consumeIntent(); updateUi(); }).observe(target, { childList: true, subtree: true });
  }

  window.AmyFXConnectivity = Object.freeze({
    version: VERSION,
    currentModule,
    capabilities,
    registry: readRegistry,
    registerModule,
    navigationIntent,
    navigate,
    consumeIntent,
    appVersion: version,
    loadInstalledVersion,
    syncIntelGlobals,
    clearEphemeralCache
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
