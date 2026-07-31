"use strict";

(function () {
  if (window.__amyFxProviderDetectionV1) return;
  window.__amyFxProviderDetectionV1 = true;

  const SETTINGS_KEY = "amyfx.globalAiSettings.v1";
  const PROVIDERS = new Set(["gemini", "openrouter", "deepseek"]);
  const LABELS = Object.freeze({ gemini: "GEMINI", openrouter: "OPENROUTER", deepseek: "DEEPSEEK" });
  const DEFAULT_MODELS = Object.freeze({ gemini: "gemini-2.0-flash", openrouter: "google/gemini-2.0-flash-001", deepseek: "deepseek-chat" });
  const PROVIDER_SCRIPT_URL = document.currentScript?.src || "";
  const clean = value => String(value ?? "").trim();
  const safeParse = (value, fallback = null) => { try { return JSON.parse(value); } catch { return fallback; } };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

  function normalizeProvider(value) {
    const provider = clean(value).toLowerCase().replace("google", "gemini").replace("open_router", "openrouter");
    return PROVIDERS.has(provider) ? provider : "";
  }

  function defaultModel(provider) { return DEFAULT_MODELS[normalizeProvider(provider)] || ""; }

  function inferProviderFromKey(value) {
    const key = clean(value).replace(/^Bearer\s+/i, "");
    if (/^AIza[0-9A-Za-z_-]+$/.test(key)) return "gemini";
    if (/^sk-or-v1-/i.test(key)) return "openrouter";
    if (/^sk-/i.test(key)) return "deepseek";
    return "";
  }

  function hasExplicitProvider(value) {
    const line = clean(value);
    if (/^(gemini|google|openrouter|open_router|deepseek)\s*:/i.test(line)) return true;
    if (line.includes("|")) return Boolean(normalizeProvider(line.split("|", 1)[0]));
    return false;
  }

  function normalizePool(raw, selectedProvider = "auto") {
    const selected = normalizeProvider(selectedProvider);
    return String(raw || "").split(/\r?\n/).map(line => {
      const value = clean(line);
      if (!value || value.startsWith("#") || hasExplicitProvider(value)) return line;
      const provider = selected || inferProviderFromKey(value);
      return provider ? `${provider}:${value}` : line;
    }).join("\n");
  }

  function readSettings() {
    return window.AmyFXOS?.getGlobalSettings?.() || safeParse(localStorage.getItem(SETTINGS_KEY), {}) || {};
  }

  function writeSettings(settings) {
    if (window.AmyFXOS?.saveGlobalSettings) return window.AmyFXOS.saveGlobalSettings(settings);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
    return settings;
  }

  function nativeRepairRows() {
    try {
      if (typeof window.AmyNativeAIRepair?.repairProviders !== "function") return [];
      const rows = safeParse(window.AmyNativeAIRepair.repairProviders(), []);
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  function autoAlias(alias) {
    return !clean(alias) || /^(GEMINI|OPENROUTER|DEEPSEEK)(?:\s+\d+)?$/i.test(clean(alias));
  }

  function reconcileRows(rows) {
    if (!rows.length) return readSettings();
    const settings = readSettings();
    const refs = Array.isArray(settings.key_refs) ? settings.key_refs.map(ref => ({ ...ref })) : [];
    let changed = false;
    rows.forEach((row, rowIndex) => {
      const id = clean(row?.id);
      const provider = normalizeProvider(row?.provider);
      if (!id || !provider) return;
      const index = refs.findIndex(ref => clean(ref.id) === id);
      const nativeAlias = clean(row.alias);
      const maskedTail = clean(row.masked_tail).slice(-4);
      if (index < 0) {
        refs.push({ id, alias: nativeAlias || `${LABELS[provider]} ${rowIndex + 1}`, provider, model: defaultModel(provider), masked_tail: maskedTail, priority: refs.length, status: clean(row.status) || "ready" });
        changed = true;
        return;
      }
      const current = refs[index];
      const providerChanged = normalizeProvider(current.provider) !== provider;
      const alias = providerChanged && autoAlias(current.alias) ? `${LABELS[provider]} ${index + 1}` : clean(current.alias) || nativeAlias || `${LABELS[provider]} ${index + 1}`;
      const merged = { ...current, alias, provider, model: providerChanged ? defaultModel(provider) : clean(current.model) || defaultModel(provider), masked_tail: maskedTail || clean(current.masked_tail).slice(-4), status: clean(row.status) || clean(current.status) || "ready" };
      if (JSON.stringify(merged) !== JSON.stringify(current)) { refs[index] = merged; changed = true; }
    });
    return changed ? writeSettings({ ...settings, key_refs: refs }) : settings;
  }

  function installProviderPicker() {
    const textarea = document.querySelector("[data-amy-key-pool]");
    if (!textarea || document.querySelector("[data-amy-provider-picker]")) return;
    const label = textarea.closest("label");
    const pickerLabel = document.createElement("label");
    pickerLabel.dataset.amyProviderPicker = "1";
    pickerLabel.innerHTML = `<span>Provider untuk key tanpa awalan</span><select data-amy-provider-select><option value="auto">Deteksi otomatis</option><option value="gemini">Gemini</option><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option></select><small>Gemini (AIza), OpenRouter (sk-or-v1-), dan DeepSeek (sk-) dideteksi otomatis.</small>`;
    label?.insertAdjacentElement("afterend", pickerLabel);
  }

  function normalizeBeforeSave() {
    const textarea = document.querySelector("[data-amy-key-pool]");
    if (!textarea) return;
    textarea.value = normalizePool(textarea.value, document.querySelector("[data-amy-provider-select]")?.value || "auto");
  }

  function renderRows() {
    const list = document.querySelector("[data-amy-key-list]");
    if (!list) return;
    const settings = readSettings();
    const refs = Array.isArray(settings.key_refs) ? settings.key_refs : [];
    const html = refs.length ? refs.map((ref, index) => {
      const provider = normalizeProvider(ref.provider) || "unknown";
      const label = clean(ref.alias) || `${LABELS[provider] || provider.toUpperCase()} ${index + 1}`;
      return `<div class="amy-os-key-row"><span>${escapeHtml(label)} • ${escapeHtml(provider)} ••••${escapeHtml(clean(ref.masked_tail).slice(-4))}</span><button type="button" data-remove-key="${escapeHtml(ref.id)}">Hapus</button></div>`;
    }).join("") : "<small>Belum ada key.</small>";
    if (list.innerHTML !== html) list.innerHTML = html;
    const hasDeepSeek = refs.some(ref => normalizeProvider(ref.provider) === "deepseek");
    let warning = document.getElementById("amy-deepseek-paid-warning");
    if (hasDeepSeek && !settings.paid_fallback) {
      if (!warning) {
        warning = document.createElement("small");
        warning.id = "amy-deepseek-paid-warning";
        warning.style.cssText = "display:block;margin:8px 0;color:#f0bd4f";
        list.insertAdjacentElement("afterend", warning);
      }
      if (warning.textContent !== "DeepSeek dikenali, tetapi belum dipakai sampai fallback berbayar diaktifkan.") warning.textContent = "DeepSeek dikenali, tetapi belum dipakai sampai fallback berbayar diaktifkan.";
    } else warning?.remove();
  }

  function repairNow() {
    installProviderPicker();
    reconcileRows(nativeRepairRows());
    renderRows();
  }

  function runtimeUrl(filename) {
    return PROVIDER_SCRIPT_URL ? new URL(filename, PROVIDER_SCRIPT_URL).href : filename;
  }

  function loadScriptOnce(filename, marker, readyFlag, next) {
    if (readyFlag && window[readyFlag]) { next?.(); return; }
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      if (readyFlag && window[readyFlag]) next?.();
      else {
        existing.addEventListener("load", () => next?.(), { once: true });
        existing.addEventListener("error", () => next?.(), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = runtimeUrl(filename);
    script.setAttribute(marker, "1");
    script.async = false;
    script.addEventListener("load", () => next?.(), { once: true });
    script.addEventListener("error", () => next?.(), { once: true });
    (document.head || document.documentElement).appendChild(script);
  }

  function loadProfessionalBotHandlerLockRuntime() {
    loadScriptOnce("amyfx-professional-bot-handler-lock-v1.js", "data-amyfx-professional-bot-handler-lock", "__amyFxProfessionalBotHandlerLockV1");
  }

  function loadMappingIntentHotfixRuntime() {
    loadScriptOnce("amyfx-mentor-mapping-intent-hotfix-v1.js", "data-amyfx-mentor-mapping-intent", "__amyFxMentorMappingIntentHotfixV1", loadProfessionalBotHandlerLockRuntime);
  }

  function loadSafeRuleChatRuntime() {
    loadScriptOnce("amyfx-mentor-rule-chat-safe-v3.js", "data-amyfx-rule-chat-safe", "__amyFxMentorRuleChatSafeV3", loadMappingIntentHotfixRuntime);
  }

  function loadUniversalAccessRuntime() {
    loadScriptOnce("amyfx-mentor-universal-access-v1.js", "data-amyfx-mentor-universal", "__amyFxMentorUniversalAccessV1", loadSafeRuleChatRuntime);
  }

  function loadCustomerServiceRuntime() { loadUniversalAccessRuntime(); }
  function loadConnectivityRuntime() { loadSafeRuleChatRuntime(); }
  function loadFinalConnectivityRuntime() { loadSafeRuleChatRuntime(); }
  function loadRuleChatFinalRuntime() { loadSafeRuleChatRuntime(); }

  function loadMentorConversationRuntime() {
    if (!PROVIDER_SCRIPT_URL) return;
    loadScriptOnce("amyfx-mentor-conversation-v1.js", "data-amyfx-mentor-conversation", "__amyFxMentorConversationV1", loadCustomerServiceRuntime);
  }

  let repairScheduled = false;
  function scheduleRepair() {
    if (repairScheduled) return;
    repairScheduled = true;
    const run = () => { repairScheduled = false; repairNow(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else setTimeout(run, 0);
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("[data-amy-save-keys]")) { normalizeBeforeSave(); setTimeout(scheduleRepair, 80); }
    if (event.target.closest?.("[data-amy-settings]")) setTimeout(scheduleRepair, 0);
  }, true);

  document.addEventListener("change", event => {
    if (event.target.matches?.("[data-amy-provider-select]")) normalizeBeforeSave();
    if (event.target.matches?.("[data-amy-paid-fallback]")) setTimeout(scheduleRepair, 0);
  }, true);

  function boot() {
    loadMentorConversationRuntime();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.AmyFXOS) {
        clearInterval(timer);
        scheduleRepair();
      } else if (attempts >= 160) clearInterval(timer);
    }, 100);
    window.addEventListener("focus", scheduleRepair);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleRepair(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  window.AmyFXProviderDetection = Object.freeze({
    inferProviderFromKey,
    normalizePool,
    repairNow,
    loadCustomerServiceRuntime,
    loadUniversalAccessRuntime,
    loadConnectivityRuntime,
    loadFinalConnectivityRuntime,
    loadRuleChatFinalRuntime,
    loadSafeRuleChatRuntime,
    loadMappingIntentHotfixRuntime,
    loadProfessionalBotHandlerLockRuntime
  });
})();
