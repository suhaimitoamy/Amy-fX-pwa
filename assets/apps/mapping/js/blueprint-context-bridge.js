"use strict";

(function () {
  if (window.__amyFxMappingContextBridgeV2) return;
  window.__amyFxMappingContextBridgeV2 = true;

  let lastFingerprint = "";

  function text(value) {
    return String(value ?? "").trim();
  }

  function setupFrom(result) {
    return result?.setupExecution || result?.experimentalBestSetup || result?.bestSetup || result?.entryMap?.setup || null;
  }

  function canonicalState() {
    const contract = window.AmyFXMarketContract;
    const state = contract?.read?.() || window.AmyFXIntel?.read?.() || {};
    const snapshot = contract?.snapshot?.(state) || window.AmyFXIntel?.snapshot?.(state) || null;
    return { contract, state, snapshot };
  }

  function publish(force = false) {
    const mappingRuntime = window.state;
    if (!mappingRuntime || typeof mappingRuntime !== "object" || !("tf" in mappingRuntime)) return false;

    const result = mappingRuntime.result || null;
    const { contract, state, snapshot } = canonicalState();
    const mapping = state.mapping || {};
    const quote = state.quote || {};
    const liquidity = state.liquidity || {};
    const heatmap = state.heatmap || {};
    const mappingFreshness = contract?.assess?.("mapping", mapping) || { state: mapping?.dataStale ? "EXPIRED" : "STALE" };
    const quoteFreshness = contract?.assess?.("quote", quote) || { state: "EXPIRED" };
    const setup = setupFrom(result) || mapping.setupExecution || null;
    const direction = result?.directionDecision || mapping.directionDecision || null;
    const price = Number(quote.price || snapshot?.currentPrice || 0);
    const timeframe = text(result?.tf || mapping.timeframe || mappingRuntime.tf || "M15").toUpperCase();

    const fingerprint = JSON.stringify([
      timeframe,
      price,
      quote.capturedAt || null,
      mapping.capturedAt || null,
      liquidity.capturedAt || null,
      heatmap.capturedAt || null,
      mappingFreshness.state,
      setup?.setupId || setup?.id || setup?.status || setup?.state || "",
      direction?.bias || direction?.signal || "",
      mappingRuntime.conn || ""
    ]);
    if (!force && fingerprint === lastFingerprint) return true;
    lastFingerprint = fingerprint;

    const marketState = {
      pair: "XAU/USD",
      symbol: "XAU/USD",
      timeframe,
      capturedAt: mapping.capturedAt || null,
      updatedAt: mapping.computedAt || mapping.capturedAt || null,
      quoteCapturedAt: quote.capturedAt || null,
      mappingCapturedAt: mapping.capturedAt || null,
      liquidityCapturedAt: liquidity.capturedAt || null,
      heatmapCapturedAt: heatmap.capturedAt || null,
      price: Number.isFinite(price) && price > 0 ? price : null,
      connection: text(mappingRuntime.conn || "Offline"),
      quoteFreshness: quoteFreshness.state,
      mappingFreshness: mappingFreshness.state,
      facts: result?.facts || result?.validatedMarketContext?.facts || {},
      hypothesis: result?.hypothesis || result?.validatedMarketContext?.directionForecast || null,
      setup,
      bestSetup: setup,
      evidence: result?.evidence || [],
      conflicts: snapshot?.conflicts || [],
      directionDecision: direction,
      dataStale: mappingFreshness.state === "STALE" || mappingFreshness.state === "EXPIRED",
      result
    };

    window.AmyFXMarketState = marketState;
    window.lastMappingResult = {
      ...(result || {}),
      symbol: "XAU/USD",
      pair: "XAU/USD",
      timeframe,
      tf: timeframe,
      capturedAt: marketState.mappingCapturedAt,
      timestamp: marketState.mappingCapturedAt,
      quoteCapturedAt: marketState.quoteCapturedAt,
      price: marketState.price,
      setup,
      bestSetup: setup,
      dataStale: marketState.dataStale,
      conflicts: marketState.conflicts
    };
    window.dispatchEvent(new CustomEvent("amyfx:mapping-state-change", { detail: marketState }));
    return true;
  }

  function boot() {
    publish(true);
    window.addEventListener("amyfx:candles-updated", () => publish(true));
    window.addEventListener("amyfx:mapping-ui-rendered", () => publish());
    window.addEventListener("amyfx:entry-watch-updated", () => publish());
    window.addEventListener("amyfx:execution-authority-updated", () => publish());
    window.addEventListener("focus", () => publish(true));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) publish(true);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  window.AmyFXMappingContextBridge = Object.freeze({ version: "2.0.0", publish });
})();
