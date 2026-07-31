"use strict";

(function () {
  if (window.__amyFxBlueprintHotfixV1) return;
  window.__amyFxBlueprintHotfixV1 = true;

  const VERSION = "2.0.0";
  const SETTINGS_KEY = "amyfx.globalAiSettings.v1";
  const LEGACY_SETTINGS_KEY = "tradingLibraryManager.assistantSettings.v1";
  const TOTAL_AI_TIMEOUT_MS = 45_000;
  const PER_KEY_TIMEOUT_MS = 8_000;
  const CONTEXT_EVENTS = new Set([
    "amyfx:journal-state-change",
    "amyfx:mapping-state-change",
    "amyfx:market-update",
    "amyfx:home-stats-change"
  ]);

  const safeParse = (value, fallback = null) => {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  };
  const cleanText = value => String(value ?? "").trim();
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
  const makeId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

  function installBlueprintListenerDeduper() {
    if (window.__amyFxBlueprintListenerDeduperV2 || typeof window.addEventListener !== "function") return;
    window.__amyFxBlueprintListenerDeduperV2 = true;
    const original = window.addEventListener;
    const seen = new Set();
    let restoreTimer = 0;
    window.addEventListener = function (name, listener, options) {
      let duplicate = false;
      if (CONTEXT_EVENTS.has(name) && typeof listener === "function") {
        let source = "";
        try { source = Function.prototype.toString.call(listener); } catch (_) {}
        if (/refreshMentorContext/.test(source)) {
          const key = `${name}:${source}`;
          duplicate = seen.has(key);
          seen.add(key);
          clearTimeout(restoreTimer);
          restoreTimer = setTimeout(() => {
            if (window.addEventListener !== original) window.addEventListener = original;
          }, 0);
        }
      }
      if (duplicate) return undefined;
      return original.call(this, name, listener, options);
    };
  }

  installBlueprintListenerDeduper();

  function withTimeout(promise, timeoutMs, message) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(message), { category: "timeout" })), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function currentModule() {
    const declared = document.querySelector?.(".amy-os-root")?.dataset?.amyModule;
    if (declared) return declared;
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function installLayoutFixes() {
    if (document.getElementById?.("amyfx-blueprint-hotfix-style")) return;
    const style = document.createElement?.("style");
    if (!style) return;
    style.id = "amyfx-blueprint-hotfix-style";
    style.textContent = `
      .amy-os-panel { bottom: calc(104px + env(safe-area-inset-bottom, 0px)) !important; overscroll-behavior: contain; }
      .amy-os-fab { bottom: calc(104px + env(safe-area-inset-bottom, 0px)) !important; }
      .amy-os-module-status { bottom: calc(148px + env(safe-area-inset-bottom, 0px)) !important; pointer-events: none; }
      .amy-os-command-center, .amy-os-journal-v2 { max-width: calc(100% - 24px); box-sizing: border-box; overflow: hidden; }
      #journalView > .amy-os-journal-v2 { margin-left: 0; margin-right: 0; }
      .amy-os-message > div { overflow-wrap: anywhere; }
      .amy-os-composer textarea:disabled, .amy-os-composer button:disabled { opacity: .62; }
      @media (max-height: 620px) {
        .amy-os-panel { inset: 8px 8px calc(92px + env(safe-area-inset-bottom, 0px)) 8px !important; max-height: none !important; }
      }
    `;
    document.head?.appendChild(style);
  }

  function structuredCloneSafe(value) {
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function nativeRows() {
    try {
      if (!window.AmyNativeAI || typeof window.AmyNativeAI.listSecrets !== "function") return [];
      const rows = safeParse(window.AmyNativeAI.listSecrets(), []);
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function reconcileVaultReferences() {
    const os = window.AmyFXOS;
    if (!os?.getGlobalSettings || !os?.saveGlobalSettings) return false;
    const rows = nativeRows();
    if (!rows.length) return false;
    const settings = os.getGlobalSettings() || {};
    const refs = Array.isArray(settings.key_refs) ? [...settings.key_refs] : [];
    let changed = false;
    for (const row of rows) {
      const id = cleanText(row.id);
      const provider = cleanText(row.provider).toLowerCase();
      if (!id || !provider) continue;
      const next = {
        id,
        alias: cleanText(row.alias) || provider.toUpperCase(),
        provider,
        model: cleanText(row.model),
        masked_tail: cleanText(row.masked_tail).slice(-4),
        priority: Number(row.priority) || refs.length,
        status: cleanText(row.status) || "ready"
      };
      const index = refs.findIndex(ref => ref.id === id);
      if (index < 0) {
        refs.push(next);
        changed = true;
      } else {
        const merged = { ...refs[index], ...next, model: cleanText(refs[index].model) || next.model };
        if (JSON.stringify(merged) !== JSON.stringify(refs[index])) {
          refs[index] = merged;
          changed = true;
        }
      }
    }
    if (changed) os.saveGlobalSettings({ ...settings, key_refs: refs });
    return changed;
  }

  function patchRepositoryFallback() {
    const repository = window.AmyFXOS?.repository;
    if (!repository || repository.__amyHotfixFallbackV2) return;
    repository.__amyHotfixFallbackV2 = true;
    const originalPut = repository.put.bind(repository);
    const originalGet = repository.get.bind(repository);
    const originalAll = repository.all.bind(repository);
    const originalRemove = repository.remove.bind(repository);
    let recentContext = null;

    repository.put = async function (store, value) {
      const row = { ...value, id: value?.id || makeId(store) };
      if (store === "contexts") {
        const fingerprint = JSON.stringify({ source: row.source_module, captured: row.captured_at, payload: row.payload });
        if (recentContext?.fingerprint === fingerprint && Date.now() - recentContext.at < 500) return recentContext.row;
        recentContext = { fingerprint, at: Date.now(), row };
      }
      if (this.memory instanceof Map) this.memory.set(`${store}:${row.id}`, structuredCloneSafe(row));
      return originalPut(store, row);
    };
    repository.get = async function (store, rowId) {
      const result = await originalGet(store, rowId);
      if (result != null) return result;
      return structuredCloneSafe(this.memory instanceof Map ? this.memory.get(`${store}:${rowId}`) || null : null);
    };
    repository.all = async function (store) {
      const rows = await originalAll(store);
      if (Array.isArray(rows) && rows.length) return rows;
      if (!(this.memory instanceof Map)) return Array.isArray(rows) ? rows : [];
      return [...this.memory.entries()]
        .filter(([key]) => key.startsWith(`${store}:`))
        .map(([, value]) => structuredCloneSafe(value));
    };
    repository.remove = async function (store, rowId) {
      if (this.memory instanceof Map) this.memory.delete(`${store}:${rowId}`);
      return originalRemove(store, rowId);
    };
  }

  function marketContract() {
    return window.AmyFXMarketContract || null;
  }

  function domainFreshness(domain, state) {
    const contract = marketContract();
    return contract?.assess?.(domain, state?.[domain] || null) || { state: "EXPIRED", capturedAt: null };
  }

  function canonicalMarketContext() {
    const contract = marketContract();
    if (!contract) return null;
    const state = contract.read();
    const snapshot = contract.snapshot(state);
    return {
      state,
      snapshot,
      timestamps: {
        quote: state.quote?.capturedAt || null,
        mapping: state.mapping?.capturedAt || null,
        liquidity: state.liquidity?.capturedAt || null,
        heatmap: state.heatmap?.capturedAt || null,
        news: state.news?.capturedAt || null
      },
      freshness: {
        quote: domainFreshness("quote", state),
        mapping: domainFreshness("mapping", state),
        liquidity: domainFreshness("liquidity", state),
        heatmap: domainFreshness("heatmap", state),
        news: domainFreshness("news", state)
      }
    };
  }

  function patchCanonicalContext() {
    const os = window.AmyFXOS;
    if (!os?.buildContext || os.__amyCanonicalContextV2 || !marketContract()) return false;
    const originalBuildContext = os.buildContext.bind(os);
    const buildContext = async function (sourceModule, options = {}) {
      const context = await originalBuildContext(sourceModule, options);
      const canonical = canonicalMarketContext();
      if (!canonical || !context || typeof context !== "object") return context;
      const module = cleanText(sourceModule || context.source_module || currentModule());
      const payload = context.payload && typeof context.payload === "object" ? context.payload : {};
      const workspace = payload.workspace && typeof payload.workspace === "object" ? payload.workspace : {};
      const market = workspace.market && typeof workspace.market === "object" ? workspace.market : {};
      payload.workspace = {
        ...workspace,
        market: {
          ...market,
          current_price: canonical.snapshot.currentPrice,
          canonical_snapshot: canonical.snapshot,
          shared_intelligence: canonical.state,
          live_state: window.AmyFXMarketState || null,
          timestamps: canonical.timestamps,
          freshness: canonical.freshness
        }
      };
      context.payload = payload;
      context.market_timestamps = canonical.timestamps;
      context.market_freshness = canonical.freshness;
      context.conflicts = canonical.snapshot.conflicts || [];
      if (module === "mapping") {
        context.captured_at = canonical.timestamps.mapping;
        context.freshness = { ...canonical.freshness.mapping, state: cleanText(canonical.freshness.mapping.state).toLowerCase() };
      } else if (module === "intel" || module === "home") {
        context.captured_at = canonical.timestamps.quote;
        context.freshness = { ...canonical.freshness.quote, state: cleanText(canonical.freshness.quote.state).toLowerCase() };
      }
      context.source_refs = [
        { module: "quote", captured_at: canonical.timestamps.quote },
        { module: "mapping", captured_at: canonical.timestamps.mapping },
        { module: "liquidity", captured_at: canonical.timestamps.liquidity },
        { module: "heatmap", captured_at: canonical.timestamps.heatmap },
        { module: "news", captured_at: canonical.timestamps.news }
      ].filter(item => item.captured_at);
      return context;
    };
    window.AmyFXOS = Object.freeze({ ...os, buildContext, __amyCanonicalContextV2: true });
    window.AmyFXProfessionalBotHandlerLock?.lock?.();
    return true;
  }

  function timeText(value) {
    const time = new Date(value || 0);
    if (Number.isNaN(time.getTime())) return "BELUM ADA DATA";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false
      }).format(time) + " WITA";
    } catch (_) {
      return time.toISOString();
    }
  }

  function repairFreshnessUi() {
    const module = currentModule();
    if (!["home", "mapping", "intel"].includes(module)) return;
    const canonical = canonicalMarketContext();
    if (!canonical) return;
    let statusText = "";
    let state = "expired";
    if (module === "mapping") {
      const freshness = canonical.freshness.mapping;
      state = cleanText(freshness.state || "EXPIRED").toLowerCase();
      statusText = `MAPPING • ${timeText(canonical.timestamps.mapping)} • ${state.toUpperCase()}`;
    } else if (module === "intel") {
      const quote = cleanText(canonical.freshness.quote.state || "EXPIRED").toUpperCase();
      const liquidity = cleanText(canonical.freshness.liquidity.state || "EXPIRED").toUpperCase();
      state = quote.toLowerCase();
      statusText = `INTEL • QUOTE ${quote} • LIQUIDITY ${liquidity}`;
    } else {
      const quote = cleanText(canonical.freshness.quote.state || "EXPIRED").toUpperCase();
      state = quote.toLowerCase();
      statusText = `HOME • QUOTE ${quote} • ${timeText(canonical.timestamps.quote)}`;
    }

    const health = document.querySelector?.("[data-amy-health]");
    if (health) health.textContent = statusText;
    const moduleStatus = document.querySelector?.("[data-amy-module-status]");
    if (moduleStatus) {
      moduleStatus.dataset.freshness = state;
      moduleStatus.textContent = statusText;
    }
    const commandFreshness = document.querySelector?.("[data-cc-freshness]");
    if (commandFreshness && module === "home") {
      commandFreshness.textContent = state.toUpperCase();
      const card = commandFreshness.closest?.("[data-state]");
      if (card) card.dataset.state = state;
    }
  }

  function relocateJournalReview() {
    const card = document.querySelector?.("[data-amy-journal-v2]");
    const journalView = document.getElementById?.("journalView");
    if (!card || !journalView || journalView.contains(card)) return;
    const heading = journalView.querySelector(".section-head");
    if (heading) heading.insertAdjacentElement("afterend", card);
    else journalView.insertAdjacentElement("afterbegin", card);
  }

  function legacyCredentialsAvailable() {
    const saved = safeParse(localStorage.getItem(LEGACY_SETTINGS_KEY), {}) || {};
    const pool = cleanText(saved.apiPoolText);
    const direct = cleanText(saved.apiKey || window.state?.geminiApiKey);
    return Boolean(pool || direct);
  }

  function partsToQuestion(parts) {
    if (typeof parts === "string") return parts;
    if (!Array.isArray(parts)) return cleanText(parts);
    const values = [];
    for (const part of parts) {
      if (typeof part === "string") values.push(part);
      else if (part?.text) values.push(String(part.text));
      else if (part?.inlineData || part?.inline_data) values.push("[Lampiran gambar tersedia di pertanyaan asli]");
    }
    return cleanText(values.join("\n"));
  }

  function patchLegacyJournalAssistant() {
    if (currentModule() !== "journal") return false;
    if (typeof window.callAI !== "function" || window.callAI.__amyNativeVaultBridge) return false;
    const original = window.callAI;
    const bridge = async function (parts, options = {}) {
      const settings = window.AmyFXOS?.getGlobalSettings?.() || safeParse(localStorage.getItem(SETTINGS_KEY), {}) || {};
      const refs = Array.isArray(settings.key_refs) ? settings.key_refs : [];
      if (legacyCredentialsAvailable() || !refs.length || !window.AmyFXOS?.ask) return original.call(this, parts, options);
      const question = partsToQuestion(parts) || "Bantu jawab berdasarkan konteks jurnal aktif.";
      const result = await withTimeout(
        window.AmyFXOS.ask(question, { sourceModule: "journal", timeout: PER_KEY_TIMEOUT_MS, json: Boolean(options.json) }),
        TOTAL_AI_TIMEOUT_MS,
        "Asisten melewati batas waktu total. Coba lagi atau nonaktifkan key yang bermasalah."
      );
      return cleanText(result?.text) || "Tidak ada jawaban.";
    };
    bridge.__amyNativeVaultBridge = true;
    bridge.__amyOriginal = original;
    window.callAI = bridge;
    return true;
  }

  function appendMentorMessage(root, role, body, meta = "") {
    const target = root.querySelector?.("[data-amy-messages]");
    if (!target) return;
    const row = document.createElement("div");
    row.className = `amy-os-message amy-os-message--${role}`;
    row.innerHTML = `<div>${escapeHtml(body)}</div>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}`;
    target.appendChild(row);
    target.scrollTop = target.scrollHeight;
  }

  async function submitMentorSafely(root) {
    if (!root || root.dataset.hotfixBusy === "1") return;
    const input = root.querySelector("[data-amy-input]");
    const send = root.querySelector("[data-amy-send]");
    const question = cleanText(input?.value);
    if (!question || !send) return;
    root.dataset.hotfixBusy = "1";
    input.value = "";
    input.disabled = true;
    send.disabled = true;
    appendMentorMessage(root, "user", question);
    try {
      if (!window.AmyFXOS?.ask) throw new Error("Runtime Amy Mentor belum siap.");
      const result = await withTimeout(
        window.AmyFXOS.ask(question, { sourceModule: currentModule(), timeout: PER_KEY_TIMEOUT_MS }),
        TOTAL_AI_TIMEOUT_MS,
        "Amy berhenti karena melewati batas waktu total 45 detik."
      );
      appendMentorMessage(
        root,
        "amy",
        cleanText(result?.text) || "Tidak ada jawaban.",
        `${cleanText(result?.source) || `Dari ${currentModule()}`} • ${cleanText(result?.provider) || "amy"}${result?.warning ? ` • ${result.warning}` : ""}`
      );
    } catch (error) {
      appendMentorMessage(root, "amy", `Asisten berhenti karena error: ${error?.message || "proses gagal"}`, "Coba lagi setelah koneksi stabil atau hapus key yang gagal.");
    } finally {
      root.dataset.hotfixBusy = "0";
      input.disabled = false;
      send.disabled = false;
      input.focus();
    }
  }

  function bindSafeMentorSubmit() {
    if (document.__amySafeMentorSubmitV2) return;
    document.__amySafeMentorSubmitV2 = true;
    document.addEventListener("click", event => {
      const button = event.target.closest?.(".amy-os-root [data-amy-send]");
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      submitMentorSafely(button.closest(".amy-os-root"));
    }, true);
    document.addEventListener("keydown", event => {
      const input = event.target.closest?.(".amy-os-root [data-amy-input]");
      if (!input || event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      submitMentorSafely(input.closest(".amy-os-root"));
    }, true);
  }

  function repairJournalSummary() {
    document.querySelectorAll?.(".amy-os-message > div").forEach(node => {
      if (node.textContent.includes("belum cukup sampel%.")) node.textContent = node.textContent.replace("belum cukup sampel%.", "belum cukup sampel.");
    });
    if (currentModule() === "journal") {
      const settings = window.AmyFXOS?.getGlobalSettings?.();
      const secureCount = Array.isArray(settings?.key_refs) ? settings.key_refs.length : 0;
      const summary = document.getElementById?.("assistantApiSummary");
      if (summary && secureCount && !legacyCredentialsAvailable()) summary.textContent = `${secureCount} API di secure vault • Rotasi native aktif`;
    }
  }

  let scheduled = false;
  function scheduleRepair() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      installLayoutFixes();
      patchCanonicalContext();
      reconcileVaultReferences();
      repairFreshnessUi();
      relocateJournalReview();
      patchLegacyJournalAssistant();
      repairJournalSummary();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function boot() {
    installLayoutFixes();
    bindSafeMentorSubmit();
    const timer = setInterval(() => {
      if (!window.AmyFXOS) return;
      clearInterval(timer);
      patchRepositoryFallback();
      patchCanonicalContext();
      reconcileVaultReferences();
      scheduleRepair();
      const observerTarget = document.body || document.documentElement;
      if (observerTarget && typeof MutationObserver === "function") new MutationObserver(scheduleRepair).observe(observerTarget, { childList: true, subtree: true });
      window.addEventListener("amyfx:market-update", scheduleRepair);
      window.addEventListener("focus", scheduleRepair);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleRepair(); });
      setInterval(() => { if (!document.hidden) scheduleRepair(); }, 30_000);
    }, 60);
    setTimeout(() => clearInterval(timer), 20_000);
  }

  window.AmyFXBlueprintHotfix = Object.freeze({
    version: VERSION,
    patchCanonicalContext,
    repairFreshnessUi,
    scheduleRepair
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
