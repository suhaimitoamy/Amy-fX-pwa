"use strict";

import { state, nowTime } from "./main.js";
import { runAnalysis, isCandleStale } from "./api/market-data.js";

(function () {
  if (window.__amyFxMappingLiveConsistencyV2) return;
  window.__amyFxMappingLiveConsistencyV2 = true;

  const REFRESH_COOLDOWN_MS = 30 * 1000;
  let refreshInFlight = false;
  let lastRefreshAttemptAt = 0;
  let syncScheduled = false;

  function canonical() {
    const contract = window.AmyFXMarketContract;
    const intel = window.AmyFXIntel;
    const shared = contract?.read?.() || intel?.read?.() || {};
    const quote = shared.quote || {};
    const mapping = shared.mapping || {};
    const quoteFreshness = contract?.assess?.("quote", quote) || intel?.freshness?.(shared) || { state: "EXPIRED", label: "EXPIRED" };
    const mappingFreshness = contract?.assess?.("mapping", mapping) || { state: mapping?.dataStale ? "EXPIRED" : "STALE" };
    return { shared, quote, mapping, quoteFreshness, mappingFreshness };
  }

  function mappingIsFresh(mapping = canonical().mapping) {
    const contract = window.AmyFXMarketContract;
    const fresh = contract?.assess?.("mapping", mapping) || { state: "STALE" };
    const sameTimeframe = !mapping?.timeframe || String(mapping.timeframe).toUpperCase() === String(state.tf).toUpperCase();
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
        ? `Harga live, Mapping ${state.tf} sedang diperbarui`
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
    return quoteFreshness.state === "LIVE" && (mappingFreshness.state !== "FRESH" || isCandleStale(state.tf));
  }

  async function refreshExpiredAnalysis(reason = "mapping-expired") {
    if (!analysisNeedsRefresh() || refreshInFlight) return;
    if (Date.now() - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) return;
    lastRefreshAttemptAt = Date.now();
    refreshInFlight = true;
    scheduleSync();
    try {
      await runAnalysis(state.tf);
      window.dispatchEvent(new CustomEvent("amyfx:mapping-consistency-refresh", {
        detail: { reason, timeframe: state.tf, refreshedAt: Date.now() }
      }));
    } finally {
      refreshInFlight = false;
      scheduleSync();
    }
  }

  function reconcile(reason) {
    scheduleSync();
    window.setTimeout(() => refreshExpiredAnalysis(reason), 50);
  }

  function boot() {
    reconcile("startup");
    window.addEventListener("amyfx:market-update", () => reconcile("market-update"));
    window.addEventListener("online", () => reconcile("online"));
    window.addEventListener("offline", scheduleSync);
    window.addEventListener("focus", () => reconcile("focus"));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) reconcile("visible");
    });
    document.querySelector(".nav")?.addEventListener("click", scheduleSync);
    window.setInterval(() => {
      if (!document.hidden) reconcile("periodic-check");
    }, 60_000);
  }

  window.AmyFXMappingConsistency = Object.freeze({
    version: "2.0.0",
    mappingIsFresh,
    refresh: refreshExpiredAnalysis,
    sync: syncConnectionLabel
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
