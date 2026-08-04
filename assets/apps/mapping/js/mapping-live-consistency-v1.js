"use strict";

import { state, nowTime } from "./main.js";
import { isCandleStale } from "./api/market-data.js";

(function () {
  if (window.__amyFxMappingLiveConsistencyV2) return;
  window.__amyFxMappingLiveConsistencyV2 = true;

  const REFRESH_COOLDOWN_MS = 30 * 1000;
  let refreshInFlight = false;
  let lastRefreshAttemptAt = 0;
  let syncScheduled = false;
  let lifecycleController = null;

  function canonical() {
    const contract = window.AmyFXMarketContract;
    const intel = window.AmyFXIntel;
    const shared = contract?.read?.() || intel?.read?.() || {};
    const quote = shared.quote || {};
    const mapping = shared.mapping || {};
    const quoteFreshness = contract?.assess?.("quote", quote)
      || intel?.freshness?.(shared)
      || { state: "EXPIRED", label: "EXPIRED" };
    const mappingFreshness = contract?.assess?.("mapping", mapping)
      || { state: mapping?.dataStale ? "EXPIRED" : "STALE" };
    return { shared, quote, mapping, quoteFreshness, mappingFreshness };
  }

  function mappingIsFresh(mapping = canonical().mapping) {
    const contract = window.AmyFXMarketContract;
    const fresh = contract?.assess?.("mapping", mapping) || { state: "STALE" };
    const sameTimeframe = !mapping?.timeframe
      || String(mapping.timeframe).toUpperCase() === String(state.tf).toUpperCase();
    return Boolean(sameTimeframe && fresh.state === "FRESH" && !mapping?.dataStale);
  }

  function ensureStyles() {
    if (document.getElementById("amy-mapping-live-consistency-style-v2")) return;
    const style = document.createElement("style");
    style.id = "amy-mapping-live-consistency-style-v2";
    style.textContent = `
      #conn {
        display:inline-flex !important;
        align-items:center;
        justify-content:center;
        width:18px;
        min-width:18px;
        max-width:18px;
        flex:0 0 18px;
        height:18px;
        padding:0 !important;
        margin-left:auto;
        overflow:hidden;
        font-size:18px !important;
        line-height:1 !important;
        letter-spacing:0 !important;
        white-space:nowrap;
      }
      #top-wib,
      #top-wita {
        display:none !important;
      }
      #conn[data-quote-freshness="LIVE"][data-analysis-freshness="FRESH"] { color:#4ade80 !important; }
      #conn[data-analysis-freshness="LOADING"],
      #conn[data-analysis-freshness="STALE"],
      #conn[data-quote-freshness="STALE"] { color:#fbbf24 !important; }
      #conn[data-analysis-freshness="EXPIRED"],
      #conn[data-quote-freshness="EXPIRED"],
      #conn[data-quote-freshness="OFFLINE"] { color:#fb7185 !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function syncConnectionLabel() {
    ensureStyles();
    const { quoteFreshness, mappingFreshness } = canonical();
    const conn = document.getElementById("conn");
    const quoteState = quoteFreshness.state || quoteFreshness.label || "EXPIRED";
    const mappingState = refreshInFlight ? "LOADING" : mappingFreshness.state || "EXPIRED";
    const connected = state.conn === "Connected" && quoteState === "LIVE";

    if (conn) {
      const accessibleStatus = refreshInFlight && quoteState === "LIVE"
        ? `Harga live, Mapping ${state.tf} sedang menunggu candle terbaru`
        : quoteState === "LIVE" && mappingState === "FRESH"
          ? `Harga dan Mapping ${state.tf} fresh`
          : quoteState === "LIVE"
            ? `Harga live, Mapping ${state.tf} ${mappingState}`
            : `Harga ${quoteState}, Mapping ${state.tf} ${mappingState}`;
      conn.textContent = "●";
      conn.dataset.quoteFreshness = quoteState;
      conn.dataset.analysisFreshness = mappingState;
      conn.className = connected ? "status on" : "status";
      conn.setAttribute("aria-label", accessibleStatus);
      conn.title = accessibleStatus;
    }

    const topTime = document.getElementById("top-wib") || document.getElementById("top-wita");
    if (topTime) {
      topTime.textContent = "";
      topTime.style.display = "none";
      topTime.setAttribute("aria-hidden", "true");
    }

    const killzoneTime = document.getElementById("kz-wib") || document.getElementById("kz-wita");
    if (killzoneTime) {
      killzoneTime.id = "kz-wita";
      killzoneTime.textContent = `WITA ${nowTime()}`;
    }

    document.querySelectorAll(".session-focus small").forEach(node => {
      node.textContent = String(node.textContent || "").replace(/\bWIB\b/g, "WITA");
    });
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    window.setTimeout(() => {
      syncScheduled = false;
      syncConnectionLabel();
    }, 0);
  }

  function analysisNeedsRefresh() {
    if (document.hidden || state.conn !== "Connected") return false;
    const { quoteFreshness, mappingFreshness } = canonical();
    return quoteFreshness.state === "LIVE"
      && (mappingFreshness.state !== "FRESH" || isCandleStale(state.tf));
  }

  function requestClosedCandleRefresh(reason = "mapping-expired") {
    if (!analysisNeedsRefresh() || refreshInFlight) return false;
    if (Date.now() - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) return false;
    lastRefreshAttemptAt = Date.now();
    refreshInFlight = true;
    scheduleSync();

    window.dispatchEvent(new CustomEvent("amyfx:candle-refresh-request", {
      detail: {
        reason,
        timeframe: state.tf,
        requestedAt: Date.now(),
        source: "MAPPING_CONSISTENCY_EVENT_DRIVEN"
      }
    }));

    window.setTimeout(() => {
      refreshInFlight = false;
      scheduleSync();
    }, 1500);
    return true;
  }

  function reconcile(reason, { refresh = false } = {}) {
    scheduleSync();
    window.AmyFXMappingRuntimeRepair?.publishFreshMappingClock?.();
    if (refresh) requestClosedCandleRefresh(reason);
  }

  function stop() {
    lifecycleController?.abort();
    lifecycleController = null;
    refreshInFlight = false;
    syncScheduled = false;
  }

  function start() {
    if (lifecycleController) return;
    lifecycleController = new AbortController();
    const signal = lifecycleController.signal;

    window.addEventListener("amyfx:live-price-display", scheduleSync, { signal });
    window.addEventListener("amyfx:market-update", scheduleSync, { signal });
    window.addEventListener("amyfx:mapping-state-change", scheduleSync, { signal });
    window.addEventListener("amyfx:candles-updated", scheduleSync, { signal });
    window.addEventListener("online", () => reconcile("online", { refresh: true }), { signal });
    window.addEventListener("offline", scheduleSync, { signal });
    window.addEventListener("focus", () => reconcile("focus", { refresh: true }), { signal });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) reconcile("visible", { refresh: true });
    }, { signal });
    document.querySelector(".nav")?.addEventListener("click", scheduleSync, { signal });
    window.addEventListener("pagehide", stop, { once: true, signal });
    reconcile("startup", { refresh: true });
  }

  window.addEventListener("pageshow", event => {
    if (event.persisted) start();
  });

  window.AmyFXMappingConsistency = Object.freeze({
    version: "3.0.0",
    mappingIsFresh,
    refresh: requestClosedCandleRefresh,
    sync: syncConnectionLabel,
    start,
    stop
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
