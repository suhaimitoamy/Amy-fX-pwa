"use strict";

(function () {
  if (window.__amyFxProfessionalMarketRepairV1) return;
  window.__amyFxProfessionalMarketRepairV1 = true;

  const VERSION = "2.0.0";
  const ZONE_KEY = "amyfx.bot.mapping.zones.v1";
  const INACTIVE = /(SWEPT|CONSUMED|TOUCHED|TAKEN|MITIGATED|FILLED|INVALID|BROKEN|EXPIRED|HISTORICAL|INACTIVE|REPLACED)/i;

  const clean = value => String(value ?? "").trim();
  const lower = value => clean(value).toLowerCase().replace(/[^a-z0-9À-ÿ%./+\-\s]/gi, " ").replace(/\s+/g, " ").trim();

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function readJson(key, fallback) {
    try { return safeParse(localStorage.getItem(key), fallback) ?? fallback; } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positiveNumber(value) {
    const parsed = number(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  function validTime(value) {
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) && numeric > 86_400_000 ? numeric : new Date(value || 0).getTime();
    return Number.isFinite(parsed) && parsed > 86_400_000 ? parsed : 0;
  }

  function isoTime(value) {
    const parsed = validTime(value);
    return parsed ? new Date(parsed).toISOString() : null;
  }

  function priceText(value) {
    const parsed = positiveNumber(value);
    return parsed ? new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(parsed) : "—";
  }

  function timeText(value) {
    const parsed = validTime(value);
    if (!parsed) return "waktu sumber belum tersedia";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false
      }).format(new Date(parsed)) + " WITA";
    } catch (_) {
      return new Date(parsed).toISOString();
    }
  }

  function intelState() {
    try {
      const state = window.AmyFXMarketContract?.read?.() || window.AmyFXIntel?.read?.();
      if (state && typeof state === "object") return state;
    } catch (_) {}
    return window.AmyFXIntelState && typeof window.AmyFXIntelState === "object" ? window.AmyFXIntelState : {};
  }

  function currentPrice(state = intelState()) {
    try {
      const price = positiveNumber(window.AmyFXMarketContract?.bestCurrentPrice?.(state) || window.AmyFXIntel?.bestCurrentPrice?.(state));
      if (price) return price;
    } catch (_) {}
    return positiveNumber(state?.quote?.price);
  }

  function levelActive(item) {
    const status = clean(item?.status || item?.state || "ACTIVE").toUpperCase();
    return item?.active !== false && !INACTIVE.test(status);
  }

  function normalizeLevel(item, type, price) {
    const level = positiveNumber(item?.price ?? item?.level ?? item?.value);
    if (!level || !levelActive(item)) return null;
    if (type === "BSL" && price && level <= price) return null;
    if (type === "SSL" && price && level >= price) return null;
    return {
      ...item,
      type,
      kind: type,
      price: level,
      distance: number(item?.distance ?? item?.distanceFromPrice) ?? (price ? level - price : 0),
      active: true,
      status: clean(item?.status || "ACTIVE").toUpperCase(),
      source: "Intel Liquidity nearest draw"
    };
  }

  function canonicalNearestLevels(state = intelState()) {
    try {
      const canonical = window.AmyFXMarketContract?.nearestLevels?.(state);
      if (canonical) return canonical;
    } catch (_) {}

    const price = currentPrice(state) || positiveNumber(state?.liquidity?.currentPrice);
    const liquidity = state?.liquidity || {};
    const rows = Array.isArray(liquidity.levels) ? liquidity.levels : [];
    const select = type => rows
      .filter(item => clean(item?.type || item?.liquidityType).toUpperCase() === type)
      .map(item => normalizeLevel(item, type, price))
      .filter(Boolean)
      .sort((left, right) => Math.abs(left.distance) - Math.abs(right.distance))[0] || null;
    return {
      bsl: select("BSL"),
      ssl: select("SSL"),
      source: "INTEL_LIQUIDITY_ONLY",
      unavailable: !state?.liquidity
    };
  }

  function patchIntel() {
    const intel = window.AmyFXIntel;
    if (!intel || intel.__amyCanonicalLiquidityRepairV2) return Boolean(intel);
    window.AmyFXIntel = Object.freeze({
      ...intel,
      nearestLevels: canonicalNearestLevels,
      __amyCanonicalLiquidityRepairV2: true
    });
    return true;
  }

  function liveResult() {
    return window.AmyFXMarketState?.result || window.state?.result || window.lastMappingResult || null;
  }

  function normalizeZone(item, kind) {
    if (!item || typeof item !== "object") return null;
    let low = positiveNumber(item.bottom ?? item.low ?? item.min ?? item.zoneLow ?? item.priceLow ?? item.from);
    let high = positiveNumber(item.top ?? item.high ?? item.max ?? item.zoneHigh ?? item.priceHigh ?? item.to);
    const midpoint = positiveNumber(item.price ?? item.midpoint ?? item.mid ?? item.level ?? item.value);
    if (!low && midpoint) low = midpoint;
    if (!high && midpoint) high = midpoint;
    if (!low || !high) return null;
    if (low > high) [low, high] = [high, low];
    const status = clean(item.status || item.state || item.lifecycle || "ACTIVE").toUpperCase();
    if (item.active === false || INACTIVE.test(status)) return null;
    return {
      kind,
      type: clean(item.kind || item.type || item.zoneType || kind).toUpperCase(),
      low,
      high,
      midpoint: (low + high) / 2,
      direction: clean(item.direction || item.side || item.bias).toUpperCase(),
      timeframe: clean(item.timeframe || item.tf || "M15").toUpperCase(),
      status: status || "ACTIVE",
      source: clean(item.source || "Mapping engine"),
      capturedAt: isoTime(item.capturedAt || item.updatedAt || item.updated || item.timestamp)
    };
  }

  function flatten(values) {
    return values.flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
  }

  function dedupeZones(rows) {
    const map = new Map();
    rows.filter(Boolean).forEach(row => {
      const key = `${row.kind}:${row.low.toFixed(3)}:${row.high.toFixed(3)}`;
      if (!map.has(key)) map.set(key, row);
    });
    return [...map.values()];
  }

  function zonesFromResult(result, kind) {
    const concepts = result?.marketConcepts || {};
    const mappingZones = result?.mappingZones || concepts?.mappingZones || {};
    const values = kind === "FVG" ? [
      concepts.nearestFairValueGaps, concepts.fairValueGaps,
      mappingZones.nearestFairValueGaps, mappingZones.allFairValueGaps,
      result?.nearestFairValueGaps, result?.fairValueGaps, result?.fvgs, result?.nearFvg, result?.nearFVG
    ] : [
      concepts.nearestOrderBlocks, concepts.orderBlocks,
      mappingZones.nearestOrderBlocks, mappingZones.allOrderBlocks,
      result?.nearestOrderBlocks, result?.orderBlocks, result?.obs, result?.nearOb, result?.nearOB
    ];
    return dedupeZones(flatten(values).map(item => normalizeZone(item, kind)));
  }

  function distanceToZone(zone, price) {
    if (!price) return 0;
    if (price >= zone.low && price <= zone.high) return 0;
    return Math.min(Math.abs(price - zone.low), Math.abs(price - zone.high));
  }

  function nearestZone(rows, price) {
    return [...rows].sort((left, right) => distanceToZone(left, price) - distanceToZone(right, price))[0] || null;
  }

  function mappingCapturedAt(result) {
    const contractState = intelState();
    return isoTime(
      result?.capturedAt || result?.captured_at || result?.sourceCandleAt || result?.timestamp
      || contractState?.mapping?.capturedAt
    );
  }

  function publishZones() {
    const result = liveResult();
    if (!result || typeof result !== "object") return readJson(ZONE_KEY, {});
    const capturedAt = mappingCapturedAt(result);
    if (!capturedAt) return readJson(ZONE_KEY, {});
    const price = currentPrice();
    const fvgRows = zonesFromResult(result, "FVG");
    const obRows = zonesFromResult(result, "OB");
    if (!fvgRows.length && !obRows.length) return readJson(ZONE_KEY, {});
    const snapshot = {
      schema: "AmyFXBotMappingZonesV2",
      schemaVersion: 2,
      capturedAt,
      storedAt: new Date().toISOString(),
      freshness: window.AmyFXMarketContract?.assess?.("mapping", { capturedAt, timeframe: result?.tf || result?.timeframe })?.state || "STRUCTURAL",
      price,
      fvg: nearestZone(fvgRows, price),
      ob: nearestZone(obRows, price),
      zones: { FVG: fvgRows.slice(0, 20), OB: obRows.slice(0, 20) }
    };
    writeJson(ZONE_KEY, snapshot);
    window.AmyFXBotMappingZoneState = Object.freeze(snapshot);
    return snapshot;
  }

  function zoneSnapshot() {
    const live = publishZones();
    return live?.schema ? live : readJson(ZONE_KEY, {});
  }

  function zoneAnswer(kind) {
    const snapshot = zoneSnapshot();
    const zone = kind === "FVG" ? snapshot?.fvg : snapshot?.ob;
    const label = kind === "FVG" ? "FVG" : "Order Block";
    if (!zone) return `${label} aktif belum ditemukan pada output Mapping engine terbaru.`;
    const freshness = snapshot?.freshness && snapshot.freshness !== "FRESH" ? ` Status ${snapshot.freshness}.` : "";
    const direction = zone.direction && !/NEUTRAL|WAIT/.test(zone.direction) ? ` ${zone.direction}` : "";
    return `${label} aktif terdekat berada di area ${priceText(zone.low)}–${priceText(zone.high)}${direction}. Sumber: Mapping engine · ${zone.source || kind} • ${timeText(snapshot.capturedAt)}.${freshness}`;
  }

  function classify(question) {
    const value = lower(question);
    if (/\b(fvg|fair value gap)\b/.test(value)) return "FVG";
    if (/\b(order block|orderblock|ob)\b/.test(value)) return "OB";
    return "";
  }

  function answer(question) {
    const kind = classify(question);
    return kind ? zoneAnswer(kind) : null;
  }

  function syncCommandStrips() {
    return false;
  }

  function boot() {
    patchIntel();
    publishZones();
    ["amyfx:mapping-state-change", "amyfx:market-update", "amyfx:candles-updated", "focus"].forEach(name => {
      window.addEventListener(name, () => publishZones());
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) publishZones();
    });
  }

  window.AmyFXProfessionalMarketRepair = Object.freeze({
    version: VERSION,
    answer,
    classify,
    zones: zoneSnapshot,
    publishZones,
    nearestLevels: canonicalNearestLevels,
    patchIntel,
    syncCommandStrips,
    zoneKey: ZONE_KEY
  });

  window.dispatchEvent(new CustomEvent("amyfx:professional-market-repair-ready", { detail: { version: VERSION } }));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
