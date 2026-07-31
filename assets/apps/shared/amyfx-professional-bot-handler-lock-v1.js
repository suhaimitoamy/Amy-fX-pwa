"use strict";

(function () {
  if (window.__amyFxProfessionalBotHandlerLockV1) return;
  window.__amyFxProfessionalBotHandlerLockV1 = true;

  const VERSION = "1.3.0";
  const ASK_MARKER = "__amyProfessionalBotHandlerLockV1";
  const BOT_SIGNATURE_MARKER = "__amyProfessionalBotRuntimeSignatureV1";
  const REGISTRY_FILE = "amyfx-professional-market-source-registry-v1.js";
  const REPAIR_FILE = "amyfx-professional-market-repair-v1.js";
  const CONTEXT_TIMEOUT_MS = 2_500;
  const SCRIPT_URL = document.currentScript?.src || "";
  const clean = value => String(value ?? "").trim();

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function botRuntime() {
    return window.AmyFXProfessionalBot || window.AmyFXMappingIntentHotfix || null;
  }

  function botSignature(bot = botRuntime()) {
    if (bot?.__amyProfessionalMarketSourceRegistryV1) return "market-source-registry-v1";
    if (bot?.__amyProfessionalBotV3) return "professional-bot-v3";
    return clean(bot?.version || bot?.VERSION || "base-bot");
  }

  function isAuthoritative(os = window.AmyFXOS, bot = botRuntime()) {
    return Boolean(os?.ask?.[ASK_MARKER] && os.ask[BOT_SIGNATURE_MARKER] === botSignature(bot));
  }

  function fastMarketAnswer(question, context = null) {
    try {
      const repaired = window.AmyFXProfessionalMarketRepair?.answer?.(question, context);
      if (clean(repaired)) return repaired;
    } catch {}
    try {
      const registry = window.AmyFXMarketSourceRegistry?.answer?.(question, context);
      if (clean(registry)) return registry;
    } catch {}
    return null;
  }

  function officialNumber(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : null;
  }

  function officialArea(area) {
    const low = officialNumber(area?.low);
    const high = officialNumber(area?.high);
    if (low && high) return low === high ? low : `${low}–${high}`;
    return low || high || clean(area?.label) || null;
  }

  function executionPlanAnswer(_question, context = null) {
    const plan = context?.payload?.execution_plan;
    if (
      context?.source_module !== "mapping"
      || context?.payload?.feature !== "execution_plan"
      || !plan
      || plan.feature !== "execution_plan"
    ) return null;

    const decision = ["BUY", "SELL"].includes(clean(plan.decision).toUpperCase())
      ? clean(plan.decision).toUpperCase()
      : "WAIT";
    const focus = ["BUY", "SELL"].includes(clean(plan.focusDirection).toUpperCase())
      ? clean(plan.focusDirection).toUpperCase()
      : "";
    const waiting = Array.isArray(plan.waitingFor) ? plan.waitingFor.filter(Boolean) : [];
    const confirmations = Array.isArray(plan.confirmations) ? plan.confirmations.filter(Boolean) : [];
    const freshness = clean(plan.mappingFreshness).toUpperCase() || "BELUM TERSEDIA";
    const invalidation = clean(plan.invalidation);
    const lifecycle = clean(plan.lifecycleLabel || plan.entryWatchStatus || plan.entryWatchStage);
    const area = officialArea(decision === "WAIT" ? plan.watchArea : plan.entryArea);
    const lines = [];

    if (decision === "WAIT") {
      lines.push(`Keputusan Rencana Eksekusi tetap WAIT${focus ? ` dengan fokus mencari ${focus}` : ""}.`);
      if (plan.terminal) {
        lines.push(`${lifecycle || "Setup sudah terminal"}. Setup ini tidak boleh digunakan untuk entry ulang; tunggu setup baru dari Mapping.`);
      } else if (waiting.length) {
        lines.push(`Syarat berikutnya: ${waiting.join(" ")}`);
      } else {
        lines.push("Setup resmi Mapping belum mengizinkan entry.");
      }
      if (area) lines.push(`Area pantauan resmi: ${area}.`);
      if (invalidation) lines.push(`Invalidasi: ${invalidation}`);
      if (["STALE", "EXPIRED", "OFFLINE"].includes(freshness)) {
        lines.push(`Status data ${freshness}; lakukan analisis ulang dan jangan gunakan level lama.`);
      }
      lines.push("Saya tidak membuat level atau sinyal baru.");
      return lines.join("\n");
    }

    lines.push(`Keputusan Rencana Eksekusi tetap ${decision}; Amy tidak mengubah arah Mapping.`);
    const levels = [
      ["Entry", officialNumber(plan.entry)],
      ["Stop Loss", officialNumber(plan.stopLoss)],
      ["TP1", officialNumber(plan.tp1)],
      ["TP2", officialNumber(plan.tp2)]
    ].filter(([, value]) => value);
    if (levels.length) lines.push(levels.map(([label, value]) => `${label} ${value}`).join(" · "));
    const rr = officialNumber(plan.rr);
    if (rr) lines.push(`RR resmi 1 : ${rr}.`);
    if (confirmations.length) lines.push(`Konfirmasi resmi: ${confirmations.join(" ")}`);
    if (lifecycle) lines.push(`Lifecycle: ${lifecycle}.`);
    if (invalidation) lines.push(`Invalidasi: ${invalidation}`);
    lines.push("Gunakan hanya level yang telah dikunci oleh setup resmi Mapping.");
    return lines.join("\n");
  }

  async function buildContextSafely(buildContext, sourceModule, question) {
    if (!buildContext) return null;
    let timeoutId = 0;
    try {
      return await Promise.race([
        Promise.resolve(buildContext(sourceModule, { question })).catch(() => null),
        new Promise(resolve => {
          timeoutId = window.setTimeout(() => resolve(null), CONTEXT_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timeoutId) window.clearTimeout?.(timeoutId);
    }
  }

  function response(text, context, model) {
    return {
      text: clean(text) || "Data untuk pertanyaan itu belum tersedia.",
      provider: "amy-bot",
      model,
      source: "Amy FX",
      route: "bot",
      mode: "full-bot",
      context: context || null
    };
  }

  function makeAsk(os, bot) {
    const buildContext = typeof os?.buildContext === "function" ? os.buildContext.bind(os) : null;
    const signature = botSignature(bot);
    const ask = async function (question, options = {}) {
      const sourceModule = options.sourceModule || currentModule();
      let context = options.context || null;

      const immediateExecutionPlan = executionPlanAnswer(question, context);
      if (immediateExecutionPlan) {
        return response(immediateExecutionPlan, context, "mapping-execution-plan-read-only-v1");
      }

      const immediate = fastMarketAnswer(question, context);
      if (immediate) return response(immediate, context, "professional-market-fast-path-v1");

      if (!context) context = await buildContextSafely(buildContext, sourceModule, question);

      const groundedExecutionPlan = executionPlanAnswer(question, context);
      if (groundedExecutionPlan) {
        return response(groundedExecutionPlan, context, "mapping-execution-plan-read-only-v1");
      }

      const grounded = fastMarketAnswer(question, context);
      if (grounded) return response(grounded, context, "professional-market-fast-path-v1");

      const text = await bot.answer(question, context || {});
      return response(
        text,
        context,
        bot?.__amyProfessionalMarketSourceRegistryV1 ? "professional-market-source-registry-v1" : "professional-bot-handler-lock-v1"
      );
    };
    Object.defineProperty(ask, ASK_MARKER, { value: true, enumerable: false });
    Object.defineProperty(ask, BOT_SIGNATURE_MARKER, { value: signature, enumerable: false });
    return ask;
  }

  function lock() {
    const os = window.AmyFXOS;
    const bot = botRuntime();
    if (!os?.ask || typeof bot?.answer !== "function") return false;
    if (isAuthoritative(os, bot)) return true;

    const ask = makeAsk(os, bot);
    window.AmyFXOS = Object.freeze({
      ...os,
      ask,
      __amyProfessionalBotV3: true,
      __amyProfessionalBotHandlerLockV1: true,
      __amyProfessionalMarketSourceRegistryV1: Boolean(bot.__amyProfessionalMarketSourceRegistryV1),
      __amyProfessionalMarketRepairV1: Boolean(window.AmyFXProfessionalMarketRepair)
    });
    window.AmyFXBotMode = "full";
    window.dispatchEvent(new CustomEvent("amyfx:professional-bot-handler-locked", {
      detail: { version: VERSION, mode: "full-bot", runtime: botSignature(bot) }
    }));
    return true;
  }

  function runtimeUrl(filename) {
    return SCRIPT_URL ? new URL(filename, SCRIPT_URL).href : filename;
  }

  function loadScriptRuntime(filename, marker, readyFlag, next) {
    if (readyFlag && window[readyFlag]) { next?.(); return; }
    if (!SCRIPT_URL || typeof document.createElement !== "function" || typeof document.querySelector !== "function") { next?.(); return; }
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      if (readyFlag && window[readyFlag]) next?.();
      else {
        existing.addEventListener?.("load", () => next?.(), { once: true });
        existing.addEventListener?.("error", () => next?.(), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = runtimeUrl(filename);
    script.setAttribute(marker, "1");
    script.async = false;
    script.addEventListener("load", () => next?.(), { once: true });
    script.addEventListener("error", () => next?.(), { once: true });
    (document.head || document.documentElement)?.appendChild(script);
  }

  function loadMarketRepairRuntime(next) {
    loadScriptRuntime(REPAIR_FILE, "data-amyfx-professional-market-repair", "__amyFxProfessionalMarketRepairV1", next);
  }

  function loadMarketSourceRegistryRuntime(next) {
    loadScriptRuntime(REGISTRY_FILE, "data-amyfx-professional-market-source-registry", "__amyFxProfessionalMarketSourceRegistryV1", () => loadMarketRepairRuntime(next));
  }

  function interactionNeedsLock(event) {
    const target = event?.target;
    if (!target?.closest) return false;
    return Boolean(target.closest("[data-amy-input], [data-amy-send], [data-starter], .amy-os-panel"));
  }

  function lockBeforeInteraction(event) {
    if (interactionNeedsLock(event)) lock();
  }

  let lockingStarted = false;
  function startLocking() {
    if (lockingStarted) { lock(); return; }
    lockingStarted = true;
    lock();

    [
      "amyfx:safe-rule-chat-ready",
      "amyfx:universal-access-ready",
      "amyfx:professional-bot-ready",
      "amyfx:professional-market-source-registry-ready",
      "amyfx:professional-market-repair-ready",
      "amyfx:open-mentor"
    ].forEach(name => window.addEventListener(name, lock));

    ["pointerdown", "touchstart", "focusin", "input"].forEach(name => {
      document.addEventListener(name, lockBeforeInteraction, true);
    });
    window.addEventListener("focus", lock);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) lock(); });

    let attempts = 0;
    const rapid = window.setInterval(() => {
      attempts += 1;
      lock();
      if (attempts >= 200) window.clearInterval(rapid);
    }, 100);
    window.setTimeout(() => window.clearInterval(rapid), 25_000);

    window.setInterval(() => { if (!document.hidden) lock(); }, 1_500);
    const target = document.body || document.documentElement;
    if (target && typeof MutationObserver === "function") {
      new MutationObserver(lock).observe(target, { childList: true, subtree: true });
    }
  }

  function boot() {
    loadMarketSourceRegistryRuntime(startLocking);
    window.setTimeout(startLocking, 2_500);
  }

  window.AmyFXProfessionalBotHandlerLock = Object.freeze({
    VERSION,
    lock,
    isAuthoritative,
    loadMarketSourceRegistryRuntime,
    loadMarketRepairRuntime,
    botSignature,
    fastMarketAnswer,
    executionPlanAnswer
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
