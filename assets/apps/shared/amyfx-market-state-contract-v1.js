"use strict";

(function () {
  if (window.AmyFXMarketContract) return;

  const VERSION = "2.0.0";
  const STORE_KEY = "amyfx.market.intel.v1";
  const MIGRATION_KEY = "amyfx.market.contract.migration.v2";
  const SCHEMA_VERSION = 2;
  const INACTIVE = /(SWEPT|CONSUMED|TOUCHED|TAKEN|MITIGATED|FILLED|INVALID|BROKEN|EXPIRED|HISTORICAL|INACTIVE|REPLACED)/i;
  const TTL = Object.freeze({
    quote: { soft: 30_000, hard: 120_000 },
    mapping: { soft: 15 * 60_000, hard: 30 * 60_000 },
    liquidity: { soft: 5 * 60_000, hard: 15 * 60_000 },
    heatmap: { soft: 15 * 60_000, hard: 30 * 60_000 },
    news: { soft: 15 * 60_000, hard: 60 * 60_000 },
    outlook: { soft: 15 * 60_000, hard: 60 * 60_000 }
  });

  let memoryState = { schemaVersion: SCHEMA_VERSION };

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function clone(value) {
    return safeParse(JSON.stringify(value), value);
  }

  function timestamp(value) {
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) && numeric > 86_400_000
      ? numeric
      : new Date(value || 0).getTime();
    return Number.isFinite(parsed) && parsed > 86_400_000 ? parsed : 0;
  }

  function iso(value) {
    const parsed = timestamp(value);
    return parsed ? new Date(parsed).toISOString() : null;
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce((result, key) => {
      if (["price", "currentPrice", "updated", "updatedAt", "capturedAt", "captured_at", "analyzedAt", "computedAt", "receivedAt", "storedAt", "freshness", "ageMs"].includes(key)) return result;
      result[key] = stable(value[key]);
      return result;
    }, {});
  }

  function fingerprint(value) {
    try { return JSON.stringify(stable(value)); } catch (_) { return ""; }
  }

  function readRaw() {
    try {
      const parsed = safeParse(localStorage.getItem(STORE_KEY) || "{}", {});
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length) memoryState = parsed;
      return parsed && typeof parsed === "object" ? parsed : memoryState;
    } catch (_) {
      return memoryState;
    }
  }

  function sourceTime(domain, payload) {
    if (!payload || typeof payload !== "object") return 0;
    const candidates = domain === "heatmap"
      ? [payload.sourceCandleTime, payload.sourceCandleAt, payload.capturedAt, payload.captured_at]
      : domain === "mapping"
        ? [payload.sourceCandleTime, payload.sourceCandleAt, payload.capturedAt, payload.captured_at]
        : domain === "quote"
          ? [payload.providerCapturedAt, payload.capturedAt, payload.captured_at]
          : [payload.capturedAt, payload.captured_at, payload.updated, payload.generatedAt];
    return Math.max(...candidates.map(timestamp), 0);
  }

  function policy(domain, value) {
    if (domain !== "mapping") return TTL[domain] || TTL.quote;
    const tf = String(value?.timeframe || value?.tf || "M15").toUpperCase();
    if (tf === "M1") return { soft: 2 * 60_000, hard: 5 * 60_000 };
    if (tf === "M5") return { soft: 6 * 60_000, hard: 15 * 60_000 };
    if (tf === "H1") return { soft: 75 * 60_000, hard: 180 * 60_000 };
    if (tf === "H4") return { soft: 5 * 60 * 60_000, hard: 12 * 60 * 60_000 };
    return TTL.mapping;
  }

  function explicitlyInvalid(value) {
    const status = String(value?.status || value?.statusText || value?.marketState || "").toUpperCase();
    return Boolean(value?.dataStale) || /DATA USANG|INVALID/.test(status);
  }

  function assess(domain, value, options = {}) {
    if (typeof navigator !== "undefined" && navigator.onLine === false && domain === "quote") {
      return { state: "OFFLINE", label: "OFFLINE", className: "offline", ageMs: Number.MAX_SAFE_INTEGER, capturedAt: iso(value?.capturedAt), domain };
    }
    const capturedAt = timestamp(value?.capturedAt || value?.captured_at || value?.sourceCandleTime || value?.sourceCandleAt);
    const ageMs = capturedAt ? Math.max(0, Date.now() - capturedAt) : Number.MAX_SAFE_INTEGER;
    const ttl = policy(domain, value);
    let state = ageMs > ttl.hard ? "EXPIRED" : ageMs > ttl.soft ? "STALE" : domain === "quote" ? "LIVE" : "FRESH";
    if (explicitlyInvalid(value)) state = "EXPIRED";
    if (options.structural && state !== "FRESH" && state !== "LIVE" && capturedAt) state = "STRUCTURAL";
    return {
      state,
      label: state,
      className: state === "LIVE" || state === "FRESH" ? "live" : state === "OFFLINE" ? "offline" : "stale",
      ageMs,
      capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
      domain,
      ...ttl
    };
  }

  function normalizeLegacyPart(domain, part) {
    if (!part || typeof part !== "object") return part;
    const capturedAt = sourceTime(domain, part);
    const normalized = {
      ...part,
      capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
      computedAt: iso(part.computedAt || part.updated || part.generatedAt),
      receivedAt: iso(part.receivedAt),
      storedAt: timestamp(part.storedAt) || Date.now()
    };
    if (!capturedAt) {
      normalized.dataStale = true;
      normalized.contractStatus = "EXPIRED";
    }
    return normalized;
  }

  function migrate() {
    const raw = readRaw();
    if (Number(raw.schemaVersion) >= SCHEMA_VERSION) return raw;
    const next = { ...raw, schemaVersion: SCHEMA_VERSION, migratedAt: new Date().toISOString() };
    ["quote", "mapping", "liquidity", "heatmap", "news", "outlook"].forEach(domain => {
      if (raw[domain]) next[domain] = normalizeLegacyPart(domain, raw[domain]);
    });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      localStorage.setItem(MIGRATION_KEY, JSON.stringify({ version: SCHEMA_VERSION, migratedAt: next.migratedAt }));
    } catch (_) {}
    memoryState = next;
    return next;
  }

  function save(state) {
    memoryState = state;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function mappingCandleTime(payload) {
    const timeframe = String(payload?.timeframe || payload?.tf || window.state?.tf || "M15").toUpperCase();
    const candles = window.state?.candles?.[timeframe];
    const last = Array.isArray(candles) ? candles[candles.length - 1] : null;
    const candleTime = Number(last?.time);
    const normalizedCandleTime = Number.isFinite(candleTime) && candleTime > 0
      ? (candleTime < 10_000_000_000 ? candleTime * 1000 : candleTime)
      : 0;
    return timestamp(payload?.sourceCandleAt)
      || timestamp(payload?.sourceCandleTime)
      || normalizedCandleTime;
  }

  function mappingFingerprint(payload) {
    return fingerprint({
      timeframe: payload?.timeframe || payload?.tf,
      bias: payload?.bias,
      direction: payload?.direction,
      directionDecision: payload?.directionDecision ? {
        bias: payload.directionDecision.bias,
        signal: payload.directionDecision.signal,
        source: payload.directionDecision.source,
        invalidated: payload.directionDecision.invalidated,
        invalidationReason: payload.directionDecision.invalidationReason
      } : null,
      marketState: payload?.marketState,
      directionForecast: payload?.directionForecast,
      regime: payload?.regime,
      strategy: payload?.strategy,
      shiftRisk: payload?.shiftRisk,
      levels: (Array.isArray(payload?.levels) ? payload.levels : []).map(item => ({
        type: item?.type || item?.liquidityType || null,
        level: Number(item?.price ?? item?.level) || null,
        status: item?.status || null,
        active: item?.active !== false,
        strength: item?.strength ?? item?.score ?? null,
        source: item?.source || null,
        timeframe: item?.timeframe || item?.tf || null
      })),
      bsl: payload?.bsl,
      ssl: payload?.ssl
    });
  }

  function quoteFromMapping(payload, previousQuote) {
    const price = Number(payload?.price || payload?.currentPrice || 0);
    if (!Number.isFinite(price) || price <= 0) return previousQuote || null;
    const tickAt = timestamp(payload?.quoteCapturedAt)
      || timestamp(payload?.providerCapturedAt)
      || timestamp(localStorage.getItem("last_ws_tick_at"));
    if (!tickAt) return previousQuote || null;
    return {
      ...(previousQuote || {}),
      pair: "XAU/USD",
      price,
      capturedAt: new Date(tickAt).toISOString(),
      receivedAt: new Date().toISOString(),
      storedAt: Date.now(),
      connection: payload?.connection || "Connected",
      source: "M1_QUOTE",
      schemaVersion: SCHEMA_VERSION
    };
  }

  function normalizeWrite(domain, payload, previous) {
    const now = Date.now();
    if (domain === "quote") {
      const capturedAt = sourceTime(domain, payload);
      return {
        ...(previous || {}), ...payload,
        capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
        receivedAt: new Date(now).toISOString(), storedAt: now,
        source: payload?.source || "M1_QUOTE", schemaVersion: SCHEMA_VERSION,
        dataStale: !capturedAt || Boolean(payload?.dataStale)
      };
    }

    if (domain === "mapping") {
      const structuralFingerprint = mappingFingerprint(payload);
      const candleTime = mappingCandleTime(payload);
      const previousTime = timestamp(previous?.capturedAt);
      const changed = !previous
        || previous.structuralFingerprint !== structuralFingerprint
        || (candleTime && candleTime > previousTime);
      const candidateTime = candleTime || sourceTime(domain, payload);
      const capturedAt = changed
        ? (candidateTime || previousTime || 0)
        : (previousTime || candidateTime || 0);
      const next = {
        ...(previous || {}), ...payload,
        capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
        analyzedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
        computedAt: changed ? new Date(now).toISOString() : (previous?.computedAt || null),
        receivedAt: new Date(now).toISOString(), storedAt: now,
        structuralFingerprint, schemaVersion: SCHEMA_VERSION,
        dataStale: !capturedAt || Boolean(payload?.dataStale)
      };
      delete next.updated;
      return next;
    }

    const capturedAt = sourceTime(domain, payload);
    const computedAt = timestamp(payload?.computedAt || payload?.updated || payload?.generatedAt) || now;
    return {
      ...(previous || {}), ...payload,
      capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
      computedAt: new Date(computedAt).toISOString(),
      receivedAt: new Date(now).toISOString(), storedAt: now,
      schemaVersion: SCHEMA_VERSION,
      dataStale: !capturedAt || Boolean(payload?.dataStale)
    };
  }

  function syncGlobals(state = read()) {
    const snapshotValue = snapshot(state);
    window.AmyFXIntelState = { ...state, updatedAt: snapshotValue.updatedAt, contractVersion: VERSION };
    window.AmyFXHeatmapState = state.heatmap ? { ...state.heatmap, freshness: assess("heatmap", state.heatmap) } : null;
    window.AmyFXCanonicalMarketState = snapshotValue;
    return state;
  }

  function write(domain, payload = {}) {
    const state = { ...migrate() };
    if (domain === "mapping") {
      const quote = quoteFromMapping(payload, state.quote);
      if (quote) state.quote = quote;
    }
    state[domain] = normalizeWrite(domain, payload, state[domain]);
    state.schemaVersion = SCHEMA_VERSION;
    state.updatedAt = new Date().toISOString();
    save(state);
    syncGlobals(state);
    window.dispatchEvent(new CustomEvent("amyfx:market-update", {
      detail: { domain, part: domain, value: clone(state[domain]), state: clone(state), snapshot: snapshot(state) }
    }));
    return state;
  }

  function read() {
    const state = migrate();
    return state && typeof state === "object" ? state : { schemaVersion: SCHEMA_VERSION };
  }

  function levelActive(item) {
    const status = String(item?.status || item?.state || "ACTIVE").toUpperCase();
    return item?.active !== false && !INACTIVE.test(status);
  }

  function normalizeLevel(item, type, currentPrice) {
    const price = Number(item?.price ?? item?.level ?? item?.value);
    if (!Number.isFinite(price) || price <= 0 || !levelActive(item)) return null;
    if (currentPrice > 0 && type === "BSL" && price <= currentPrice) return null;
    if (currentPrice > 0 && type === "SSL" && price >= currentPrice) return null;
    const rawDistance = Number(item?.distance ?? item?.distanceFromPrice);
    return {
      ...item,
      type,
      kind: type,
      price,
      distance: Number.isFinite(rawDistance) ? rawDistance : currentPrice > 0 ? price - currentPrice : 0,
      source: "Intel Liquidity nearest draw"
    };
  }

  function bestCurrentPrice(state = read()) {
    const price = Number(state?.quote?.price);
    return Number.isFinite(price) && price > 0 ? price : 0;
  }

  function nearestLevels(state = read()) {
    const liquidity = state?.liquidity || null;
    const currentPrice = bestCurrentPrice(state) || Number(liquidity?.currentPrice || 0);
    const rows = Array.isArray(liquidity?.levels) ? liquidity.levels : [];
    const select = type => rows
      .filter(item => String(item?.type || item?.liquidityType || "").toUpperCase() === type)
      .map(item => normalizeLevel(item, type, currentPrice))
      .filter(Boolean)
      .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))[0] || null;
    const levelFreshness = assess("liquidity", liquidity, { structural: true });
    const decorate = level => level ? { ...level, freshness: levelFreshness.state, capturedAt: liquidity?.capturedAt || null } : null;
    return {
      bsl: decorate(select("BSL")),
      ssl: decorate(select("SSL")),
      source: "INTEL_LIQUIDITY_ONLY",
      freshness: levelFreshness,
      unavailable: !liquidity
    };
  }

  function conflicts(state = read()) {
    return [];
  }

  function snapshot(state = read()) {
    const domains = {};
    ["quote", "mapping", "liquidity", "heatmap", "news", "outlook"].forEach(domain => {
      if (state?.[domain]) domains[domain] = { ...clone(state[domain]), freshness: assess(domain, state[domain]) };
    });
    const times = Object.values(domains).map(part => timestamp(part?.capturedAt)).filter(Boolean);
    return {
      schema: "AmyFXCanonicalMarketSnapshotV2",
      schemaVersion: SCHEMA_VERSION,
      contractVersion: VERSION,
      pair: "XAU/USD",
      updatedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
      currentPrice: bestCurrentPrice(state) || null,
      nearestLiquidity: nearestLevels(state),
      domains,
      conflicts: conflicts(state)
    };
  }

  function freshness(state = read()) {
    const result = assess("quote", state?.quote || null);
    return { ...result, source: state?.quote?.source || null };
  }

  function purgeLegacyMarketCaches() {
    const state = read();
    ["amyfx.bot.market.registry.v1", "amy_heatmap_dynamic_snapshot_v2"].forEach(key => {
      try {
        const value = safeParse(localStorage.getItem(key) || "{}", {});
        if (value && typeof value === "object" && !sourceTime("heatmap", value) && !timestamp(value.capturedAt)) localStorage.removeItem(key);
      } catch (_) {}
    });
    return state;
  }

  migrate();
  purgeLegacyMarketCaches();
  syncGlobals();

  window.AmyFXMarketContract = Object.freeze({
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    storeKey: STORE_KEY,
    read,
    write,
    assess,
    freshness,
    bestCurrentPrice,
    nearestLevels,
    conflicts,
    snapshot,
    partTimestamp(part) { return timestamp(part?.capturedAt || part?.captured_at || part?.sourceCandleTime || part?.sourceCandleAt); },
    syncGlobals,
    purgeLegacyMarketCaches
  });
})();
