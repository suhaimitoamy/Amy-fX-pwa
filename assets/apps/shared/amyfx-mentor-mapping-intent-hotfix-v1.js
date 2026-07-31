"use strict";

(function () {
  if (window.__amyFxMentorMappingIntentHotfixV1) return;
  window.__amyFxMentorMappingIntentHotfixV1 = true;

  const VERSION = "3.0.0";
  const SESSION_KEY = "amyfx.mentor.professionalBot.v1";
  const SNAPSHOT_KEY = "amyfx.mapping.snapshot.v2";
  const JOURNAL_DB = "tradingLibraryManager.files";
  const JOURNAL_STORE = "metadata";
  const JOURNAL_RECORD = "journals.v2";
  const LEGACY_JOURNAL_KEY = "tradingLibraryManager.journals.v1";
  const TTL_MS = Object.freeze({ M1: 300_000, M5: 900_000, M15: 1_800_000, H1: 10_800_000, H4: 43_200_000, D1: 259_200_000 });
  const INACTIVE_STATUS = /(SWEPT|CONSUMED|TOUCHED|TAKEN|MITIGATED|FILLED|INVALID|BROKEN|EXPIRED|HISTORICAL|INACTIVE|REPLACED)/i;

  const clean = value => String(value ?? "").trim();
  const lower = value => clean(value).toLowerCase().replace(/[^a-z0-9À-ÿ%./+\-\s]/gi, " ").replace(/\s+/g, " ").trim();

  function normalizeQuestion(value) {
    return lower(value)
      .replace(/\b(mapp?ing|maping)\b/g, "mapping")
      .replace(/\b(jurn+l|jurnel|journal)\b/g, "jurnal")
      .replace(/\b(academy|akademi)\b/g, "academy")
      .replace(/\b(brta|brita|newss)\b/g, "berita")
      .replace(/\b(updet|updte)\b/g, "update")
      .replace(/\b(winrate|wr)\b/g, "win rate")
      .replace(/\b(kemna|kemana)\b/g, "ke mana")
      .replace(/\b(dimana)\b/g, "di mana")
      .replace(/\b(trde)\b/g, "trade")
      .replace(/\s+/g, " ")
      .trim();
  }

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
  }

  function readJson(key, fallback) {
    try { return safeParse(localStorage.getItem(key), fallback) ?? fallback; } catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  function readSession() {
    try { return safeParse(sessionStorage.getItem(SESSION_KEY), {}) || {}; } catch { return {}; }
  }

  function writeSession(patch) {
    const next = { ...readSession(), ...patch, updatedAt: new Date().toISOString() };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    if (path.includes("/apps/indikator/")) return "indicators";
    return "home";
  }

  function validTime(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) && time > 86_400_000 ? time : 0;
  }

  function firstTime(values) {
    const rows = values.map(validTime).filter(Boolean);
    return rows.length ? new Date(Math.max(...rows)).toISOString() : null;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positiveNumber(value) {
    const parsed = number(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  function numberText(value, digits = 2) {
    const parsed = number(value);
    return parsed === null ? "—" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(parsed);
  }

  function priceText(value) {
    const parsed = positiveNumber(value);
    return parsed ? new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(parsed) : "—";
  }

  function percentText(value) {
    const parsed = number(value);
    return parsed === null ? "—" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(parsed)}%`;
  }

  function rangeText(row) {
    if (!row) return "—";
    if (positiveNumber(row.low) && positiveNumber(row.high) && Math.abs(row.high - row.low) > 0.0001) return `${priceText(row.low)}–${priceText(row.high)}`;
    return priceText(row.price || row.low || row.high);
  }

  function pathValue(source, path) {
    return path.split(".").reduce((value, key) => value?.[key], source);
  }

  function valuesAt(sources, paths) {
    const values = [];
    sources.forEach(source => paths.forEach(path => {
      const value = pathValue(source, path);
      if (value !== undefined && value !== null) values.push(value);
    }));
    return values;
  }

  function arraysAt(sources, paths) {
    return valuesAt(sources, paths).filter(Array.isArray).flat();
  }

  function firstValue(sources, paths) {
    return valuesAt(sources, paths).find(value => value !== undefined && value !== null);
  }

  function normalizeStatus(item, kind) {
    if (item?.invalid === true || item?.broken === true) return "INVALID";
    if (item?.swept === true || item?.consumed === true || item?.touched === true || item?.taken === true) return "CONSUMED";
    if (item?.mitigated === true || item?.filled === true) return kind === "BSL" || kind === "SSL" ? "CONSUMED" : "MITIGATED";
    const raw = clean(item?.status || item?.state || item?.lifecycle || item?.validity || "ACTIVE").toUpperCase();
    if (/SWEPT|CONSUMED|TOUCHED|TAKEN/.test(raw)) return "CONSUMED";
    if (/MITIGATED|FILLED/.test(raw)) return kind === "BSL" || kind === "SSL" ? "CONSUMED" : "MITIGATED";
    if (/INVALID|BROKEN|EXPIRED|HISTORICAL|INACTIVE/.test(raw)) return "INVALID";
    if (/REPLACED/.test(raw)) return "REPLACED";
    return item?.active === false ? "INACTIVE" : "ACTIVE";
  }

  function statusWeight(status) {
    return ({ ACTIVE: 1, REPLACED: 2, INACTIVE: 3, MITIGATED: 4, CONSUMED: 5, INVALID: 6 })[status] || 1;
  }

  function normalizeLevel(item, typeHint = "") {
    const type = clean(item?.type || item?.liquidityType || item?.kind || typeHint).toUpperCase();
    if (!/^(BSL|SSL)$/.test(type)) return null;
    const price = positiveNumber(item?.price ?? item?.level ?? item?.value ?? item?.y);
    if (!price) return null;
    const status = normalizeStatus(item, type);
    return {
      kind: type,
      type,
      price,
      low: price,
      high: price,
      status,
      active: status === "ACTIVE" && item?.active !== false,
      strength: number(item?.strength ?? item?.score),
      updatedAt: firstTime([item?.updatedAt, item?.updated_at, item?.capturedAt, item?.timestamp]),
      source: clean(item?.source || "mapping")
    };
  }

  function normalizeZone(item, kind) {
    let low = positiveNumber(item?.low ?? item?.bottom ?? item?.min ?? item?.zoneLow ?? item?.priceLow ?? item?.from);
    let high = positiveNumber(item?.high ?? item?.top ?? item?.max ?? item?.zoneHigh ?? item?.priceHigh ?? item?.to);
    const price = positiveNumber(item?.price ?? item?.level ?? item?.midpoint ?? item?.mid ?? item?.value);
    if (!low && price) low = price;
    if (!high && price) high = price;
    if (!low || !high) return null;
    if (low > high) [low, high] = [high, low];
    const status = normalizeStatus(item, kind);
    return {
      kind,
      type: clean(item?.type || item?.zoneType || kind).toUpperCase(),
      low,
      high,
      price: price || (low + high) / 2,
      status,
      active: status === "ACTIVE" && item?.active !== false,
      side: clean(item?.side || item?.direction || item?.bias).toUpperCase(),
      timeframe: clean(item?.timeframe || item?.tf).toUpperCase(),
      updatedAt: firstTime([item?.updatedAt, item?.updated_at, item?.capturedAt, item?.timestamp]),
      source: clean(item?.source || "mapping")
    };
  }

  function dedupe(rows) {
    const map = new Map();
    rows.filter(Boolean).forEach(row => {
      const key = row.kind === "BSL" || row.kind === "SSL"
        ? `${row.kind}:${row.price.toFixed(3)}`
        : `${row.kind}:${row.low.toFixed(3)}:${row.high.toFixed(3)}`;
      const previous = map.get(key);
      if (!previous) { map.set(key, row); return; }
      const previousTime = validTime(previous.updatedAt);
      const nextTime = validTime(row.updatedAt);
      if (nextTime > previousTime + 1000 || (nextTime === previousTime && statusWeight(row.status) >= statusWeight(previous.status))) map.set(key, row);
    });
    return [...map.values()];
  }

  function normalizeDirection(value) {
    const raw = clean(value).toUpperCase();
    if (!raw) return "";
    if (/BULL|BUY|UPTREND|UPWARD|NAIK/.test(raw)) return "BULLISH";
    if (/BEAR|SELL|DOWNTREND|DOWNWARD|TURUN/.test(raw)) return "BEARISH";
    if (/NO CLEAR|NEUTRAL|SIDEWAYS|RANGE|WAIT|MIXED/.test(raw)) return "NO CLEAR DIRECTION";
    return raw;
  }

  function sourcesFrom(context) {
    const workspace = context?.payload?.workspace || {};
    const market = workspace.market || {};
    const intel = market.shared_intelligence || window.AmyFXIntel?.read?.() || window.AmyFXIntelState || readJson("amyfx.market.intel.v1", {});
    const shared = intel?.mapping || {};
    const live = market.live_state || window.AmyFXMarketState || window.lastMappingResult || {};
    const result = live?.result || window.AmyFXMarketState?.result || window.lastMappingResult || {};
    const persisted = readJson(SNAPSHOT_KEY, {});
    const analyses = Array.isArray(market.recent_analyses) ? market.recent_analyses : readJson("amy_mapping_analyses", []);
    const latestAnalysis = Array.isArray(analyses) ? analyses[0] || analyses.at?.(-1) || {} : {};
    const embedded = market.mapping_snapshot || market.mapping || null;
    return [shared, latestAnalysis, result, live, context?.payload || {}, embedded, persisted]
      .filter(value => value && typeof value === "object");
  }

  function collectLevels(sources) {
    const paths = [
      "levels", "liquidityLevels", "liquidity.levels", "validatedMarketContext.liquidityLevels",
      "result.levels", "result.liquidityLevels", "result.liquidity.levels", "result.validatedMarketContext.liquidityLevels",
      "components.liquidity", "mapping.levels"
    ];
    const rows = arraysAt(sources, paths).map(item => normalizeLevel(item));
    sources.forEach(source => {
      ["BSL", "SSL"].forEach(type => {
        const direct = positiveNumber(source?.[type.toLowerCase()] ?? source?.[`active${type}`] ?? source?.[`next${type}`]);
        if (direct) rows.push(normalizeLevel({ type, price: direct, status: "ACTIVE", source: "direct" }, type));
      });
    });
    return dedupe(rows);
  }

  function collectZones(sources, kind) {
    const paths = kind === "OB"
      ? ["orderBlocks", "order_blocks", "obs", "obZones", "zones.orderBlocks", "zones.OB", "validatedMarketContext.orderBlocks", "result.orderBlocks", "components.orderBlocks", "components.ob"]
      : kind === "FVG"
        ? ["fairValueGaps", "fair_value_gaps", "fvgs", "fvgZones", "zones.fvg", "zones.FVG", "validatedMarketContext.fairValueGaps", "result.fvgs", "components.fvgs", "components.fvg"]
        : ["supplyDemandZones", "supply_demand_zones", "supplyDemand", "sndZones", "zones.supplyDemand", "zones.SND", "validatedMarketContext.supplyDemandZones", "result.supplyDemandZones", "components.supplyDemand", "components.snd"];
    return dedupe(arraysAt(sources, paths).map(item => normalizeZone(item, kind)));
  }

  function activeLevel(rows, type, price) {
    const active = rows.filter(row => row.kind === type && row.active && !INACTIVE_STATUS.test(row.status));
    const directional = price ? active.filter(row => type === "BSL" ? row.price > price : row.price < price) : active;
    const candidates = price ? directional : active;
    return candidates.sort((left, right) => {
      if (!price) return type === "BSL" ? left.price - right.price : right.price - left.price;
      return Math.abs(left.price - price) - Math.abs(right.price - price);
    })[0] || null;
  }

  function inactiveLevel(rows, type, active, price) {
    const inactive = rows.filter(row => row.kind === type && (!row.active || INACTIVE_STATUS.test(row.status)));
    const relevant = inactive.filter(row => {
      if (!active || !price) return true;
      return type === "BSL" ? row.price > price && row.price < active.price : row.price < price && row.price > active.price;
    });
    return (relevant.length ? relevant : inactive).sort((left, right) => {
      const timeDiff = validTime(right.updatedAt) - validTime(left.updatedAt);
      return timeDiff || (price ? Math.abs(left.price - price) - Math.abs(right.price - price) : 0);
    })[0] || null;
  }

  function activeZone(rows, price) {
    return rows.filter(row => row.active && !INACTIVE_STATUS.test(row.status)).sort((left, right) => {
      if (!price) return validTime(right.updatedAt) - validTime(left.updatedAt);
      return Math.abs(left.price - price) - Math.abs(right.price - price);
    })[0] || null;
  }

  function inactiveZone(rows, price) {
    return rows.filter(row => !row.active || INACTIVE_STATUS.test(row.status)).sort((left, right) => {
      const timeDiff = validTime(right.updatedAt) - validTime(left.updatedAt);
      return timeDiff || (price ? Math.abs(left.price - price) - Math.abs(right.price - price) : 0);
    })[0] || null;
  }

  function firstDirection(sources, paths) {
    for (const value of valuesAt(sources, paths)) {
      const normalized = normalizeDirection(value);
      if (normalized) return normalized;
    }
    return "";
  }

  function firstObject(sources, paths) {
    return valuesAt(sources, paths).find(value => value && typeof value === "object") || null;
  }

  function compactSnapshot(snapshot) {
    return {
      schema: "AmyFXMappingSnapshotV2",
      schemaVersion: 2,
      pair: snapshot.pair,
      timeframe: snapshot.timeframe,
      capturedAt: snapshot.capturedAt,
      storedAt: new Date().toISOString(),
      price: snapshot.price,
      quoteFresh: snapshot.quoteFresh,
      structuralValid: snapshot.structuralValid,
      direction: snapshot.direction,
      higherTimeframeDirection: snapshot.higherTimeframeDirection,
      structure: snapshot.structure,
      setup: clone(snapshot.setup),
      invalidation: clone(snapshot.invalidation),
      targets: clone(snapshot.targets),
      levels: clone(snapshot.levels.slice(0, 100)),
      zones: {
        OB: clone(snapshot.zones.OB.slice(0, 30)),
        FVG: clone(snapshot.zones.FVG.slice(0, 30)),
        SND: clone(snapshot.zones.SND.slice(0, 30))
      }
    };
  }

  function mappingSnapshot(context, options = {}) {
    const sources = sourcesFrom(context);
    const price = valuesAt(sources, ["price", "current_price", "currentPrice", "marketPrice", "close"]).map(positiveNumber).find(Boolean)
      || positiveNumber(localStorage.getItem("last_price"));
    const timeframe = clean(valuesAt(sources, ["timeframe", "tf", "mapping.timeframe"])[0] || "M15").toUpperCase();
    const capturedAt = firstTime(valuesAt(sources, ["capturedAt", "captured_at", "updatedAt", "updated", "timestamp"]));
    const levels = collectLevels(sources);
    const zones = { OB: collectZones(sources, "OB"), FVG: collectZones(sources, "FVG"), SND: collectZones(sources, "SND") };
    const direction = firstDirection(sources, [
      "directionDecision.signal", "directionDecision.bias", "direction", "bias", "hypothesis.direction", "hypothesis.bias",
      "validatedMarketContext.directionForecast.signal", "validatedMarketContext.directionForecast.bias", "result.directionDecision.signal"
    ]);
    const higherTimeframeDirection = firstDirection(sources, [
      "higherTimeframeDirection", "higherTimeframeBias", "htfDirection", "htfBias", "topDownBias",
      "multiTimeframe.H4.bias", "multiTimeframe.H1.bias", "mtf.H4.bias", "mtf.H1.bias",
      "validatedMarketContext.higherTimeframeBias", "directionDecision.higherTimeframeBias"
    ]);
    const setup = firstObject(sources, ["setup", "bestSetup", "setupExecution", "experimentalBestSetup", "entryMap.setup"]);
    const structure = firstValue(sources, ["structure", "marketStructure", "validatedMarketContext.structure", "facts.structure"]);
    const invalidation = firstValue(sources, ["invalidation", "setup.invalidation", "bestSetup.invalidation", "setupExecution.invalidation", "invalidLevel"]);
    const targets = firstValue(sources, ["targets", "target", "setup.targets", "bestSetup.targets", "setupExecution.targets"]);
    const age = capturedAt ? Math.max(0, Date.now() - validTime(capturedAt)) : Number.MAX_SAFE_INTEGER;
    const quoteFresh = Boolean(capturedAt) && age <= (TTL_MS[timeframe] || TTL_MS.M15);
    const structuralValid = Boolean(levels.some(row => row.active) || zones.OB.some(row => row.active) || zones.FVG.some(row => row.active) || zones.SND.some(row => row.active) || direction || higherTimeframeDirection || setup);
    const snapshot = {
      pair: "XAU/USD",
      timeframe,
      capturedAt,
      price,
      quoteFresh,
      structuralValid,
      direction: direction || "NO CLEAR DIRECTION",
      higherTimeframeDirection: higherTimeframeDirection || "",
      structure,
      setup,
      invalidation,
      targets,
      levels,
      zones
    };
    snapshot.bsl = activeLevel(levels, "BSL", price);
    snapshot.ssl = activeLevel(levels, "SSL", price);
    snapshot.previousBsl = inactiveLevel(levels, "BSL", snapshot.bsl, price);
    snapshot.previousSsl = inactiveLevel(levels, "SSL", snapshot.ssl, price);
    snapshot.activeOb = activeZone(zones.OB, price);
    snapshot.previousOb = inactiveZone(zones.OB, price);
    snapshot.activeFvg = activeZone(zones.FVG, price);
    snapshot.previousFvg = inactiveZone(zones.FVG, price);
    snapshot.activeSnd = activeZone(zones.SND, price);
    snapshot.previousSnd = inactiveZone(zones.SND, price);

    const shouldPersist = options.persist !== false && structuralValid && (currentModule() === "mapping" || Boolean(window.AmyFXMarketState?.capturedAt));
    if (shouldPersist) {
      const stored = compactSnapshot(snapshot);
      writeJson(SNAPSHOT_KEY, stored);
      window.AmyFXMappingSnapshotV2 = Object.freeze(stored);
    }
    return snapshot;
  }

  function inactivePhrase(row, liquidity = false) {
    if (!row) return "";
    if (/CONSUMED/.test(row.status)) return liquidity ? "sudah tersapu" : "sudah digunakan";
    if (/MITIGATED/.test(row.status)) return "sudah termitigasi";
    if (/REPLACED/.test(row.status)) return "sudah digantikan";
    return "sudah invalid";
  }

  function levelReply(type, snapshot) {
    const active = type === "BSL" ? snapshot.bsl : snapshot.ssl;
    const previous = type === "BSL" ? snapshot.previousBsl : snapshot.previousSsl;
    if (active && previous) return `${type} ${priceText(previous.price)} ${inactivePhrase(previous, true)} dan tidak lagi menjadi acuan. ${type} aktif berikutnya berada di ${priceText(active.price)}.`;
    if (active) return `${type} aktif terdekat berada di ${priceText(active.price)}.`;
    if (previous) return `${type} terakhir ${priceText(previous.price)} ${inactivePhrase(previous, true)}. ${type} aktif berikutnya belum ditemukan.`;
    return `${type} aktif belum ditemukan pada data Mapping terakhir.`;
  }

  function zoneReply(kind, label, snapshot) {
    const active = kind === "OB" ? snapshot.activeOb : kind === "FVG" ? snapshot.activeFvg : snapshot.activeSnd;
    const previous = kind === "OB" ? snapshot.previousOb : kind === "FVG" ? snapshot.previousFvg : snapshot.previousSnd;
    if (active && previous) return `${label} ${rangeText(previous)} ${inactivePhrase(previous)} dan tidak lagi menjadi acuan. ${label} aktif berikutnya berada di area ${rangeText(active)}.`;
    if (active) return `${label} aktif terdekat berada di area ${rangeText(active)}.`;
    if (previous) return `${label} terakhir ${rangeText(previous)} ${inactivePhrase(previous)}. ${label} aktif berikutnya belum ditemukan.`;
    return `${label} aktif belum ditemukan pada data Mapping terakhir.`;
  }

  function mappingTopic(value) {
    const hasBsl = /\bbsl\b|buy[ -]?side liquidity|likuiditas atas/.test(value);
    const hasSsl = /\bssl\b|sell[ -]?side liquidity|likuiditas bawah/.test(value);
    if (hasBsl && hasSsl) return "both";
    if (hasBsl) return "bsl";
    if (hasSsl) return "ssl";
    if (/\b(order block|ob)\b/.test(value)) return "ob";
    if (/\b(fvg|fair value gap)\b/.test(value)) return "fvg";
    if (/\b(snd|supply demand)\b/.test(value)) return "snd";
    if (/arah market (besar|besarnya)|arah besar|bias besar|htf|higher timeframe|timeframe besar/.test(value)) return "direction-large";
    if (/arah|bias|direction|bullish|bearish|ke mana/.test(value)) return "direction";
    if (/struktur|structure|mss|bos|choch/.test(value)) return "structure";
    if (/invalidasi|invalidation/.test(value)) return "invalidation";
    if (/target|tp|draw on liquidity|dol/.test(value)) return "target";
    if (/setup|entry map|skenario/.test(value)) return "setup";
    if (/harga|price/.test(value)) return "price";
    if (/fresh|expired|stale|status data|data mapping/.test(value)) return "freshness";
    if (/rangkum|ringkas|hasil mapping|kondisi market|status market|market sekarang/.test(value)) return "summary";
    return "";
  }

  function invalidationText(value) {
    if (typeof value === "number") return priceText(value);
    if (positiveNumber(value?.price ?? value?.level ?? value?.value)) return priceText(value.price ?? value.level ?? value.value);
    const raw = clean(value);
    return raw && raw !== "[object Object]" ? raw : "";
  }

  function targetList(value) {
    const rows = Array.isArray(value) ? value : value == null ? [] : [value];
    return rows.map(item => {
      if (typeof item === "number") return priceText(item);
      const parsed = positiveNumber(item?.price ?? item?.level ?? item?.value);
      return parsed ? priceText(parsed) : clean(item?.label || item?.name || item);
    }).filter(item => item && item !== "—" && item !== "[object Object]");
  }

  function directionReply(snapshot) {
    const intraday = snapshot.direction || "NO CLEAR DIRECTION";
    const large = snapshot.higherTimeframeDirection;
    const effective = intraday !== "NO CLEAR DIRECTION" ? intraday : large;
    const opening = intraday === "NO CLEAR DIRECTION" && large
      ? `Arah ${snapshot.timeframe} saat ini belum jelas, tetapi arah market besarnya masih ${large}.`
      : `Arah Mapping ${snapshot.timeframe} saat ini ${intraday || "belum terbaca"}.`;
    const area = snapshot.activeOb ? `OB ${rangeText(snapshot.activeOb)}`
      : snapshot.activeFvg ? `FVG ${rangeText(snapshot.activeFvg)}`
        : snapshot.activeSnd ? `SND ${rangeText(snapshot.activeSnd)}` : "";
    const liquidity = effective === "BULLISH" ? (snapshot.bsl ? `BSL ${priceText(snapshot.bsl.price)}` : "")
      : effective === "BEARISH" ? (snapshot.ssl ? `SSL ${priceText(snapshot.ssl.price)}` : "")
        : [snapshot.bsl ? `BSL ${priceText(snapshot.bsl.price)}` : "", snapshot.ssl ? `SSL ${priceText(snapshot.ssl.price)}` : ""].filter(Boolean).join(" dan ");
    const invalidation = invalidationText(snapshot.invalidation);
    const details = [];
    if (area) details.push(`area penting terdekat ${area}`);
    if (liquidity) details.push(`target likuiditas ${liquidity}`);
    if (invalidation) details.push(`invalidasi ${invalidation}`);
    return details.length ? `${opening} ${details.join(", ")}.` : opening;
  }

  function mappingSummary(snapshot) {
    const direction = directionReply(snapshot);
    const liquidity = `BSL ${snapshot.bsl ? priceText(snapshot.bsl.price) : "belum ada"} dan SSL ${snapshot.ssl ? priceText(snapshot.ssl.price) : "belum ada"}.`;
    return `${direction} ${liquidity}`;
  }

  function answerMapping(topic, context) {
    const snapshot = mappingSnapshot(context);
    if (topic === "menu") return "Di Mapping kamu bisa cek arah market, BSL, SSL, OB, FVG, SND, struktur, setup, invalidasi, target, harga, atau status data.";
    if (topic === "bsl") return levelReply("BSL", snapshot);
    if (topic === "ssl") return levelReply("SSL", snapshot);
    if (topic === "both") return `${levelReply("BSL", snapshot)} ${levelReply("SSL", snapshot)}`;
    if (topic === "ob") return zoneReply("OB", "OB", snapshot);
    if (topic === "fvg") return zoneReply("FVG", "FVG", snapshot);
    if (topic === "snd") return zoneReply("SND", "SND", snapshot);
    if (topic === "direction-large") {
      if (snapshot.higherTimeframeDirection) return `Arah market besarnya saat ini ${snapshot.higherTimeframeDirection}. Arah ${snapshot.timeframe} ${snapshot.direction}.`;
      return `Arah timeframe besar belum tersedia. Arah ${snapshot.timeframe} terakhir ${snapshot.direction}.`;
    }
    if (topic === "direction") return directionReply(snapshot);
    if (topic === "structure") {
      const structure = typeof snapshot.structure === "string" ? snapshot.structure : snapshot.structure?.state || snapshot.structure?.trend || snapshot.structure?.label;
      return structure ? `Struktur market saat ini ${clean(structure)}.` : "Struktur market belum tersedia pada data Mapping terakhir.";
    }
    if (topic === "setup") {
      const state = clean(snapshot.setup?.state || snapshot.setup?.status || snapshot.setup?.signal || "WAIT").toUpperCase();
      const entry = positiveNumber(snapshot.setup?.entry ?? snapshot.setup?.entryPrice ?? snapshot.setup?.price);
      return `Status setup Mapping ${snapshot.timeframe} saat ini ${state}${entry ? ` dengan area entry ${priceText(entry)}` : ""}.`;
    }
    if (topic === "invalidation") {
      const invalidation = invalidationText(snapshot.invalidation);
      return invalidation ? `Invalidasi setup saat ini berada di ${invalidation}.` : "Invalidasi setup belum tersedia pada data Mapping terakhir.";
    }
    if (topic === "target") {
      const targets = targetList(snapshot.targets);
      if (targets.length) return `Target Mapping saat ini ${targets.join(", ")}.`;
      const directional = snapshot.direction === "BEARISH" ? snapshot.ssl : snapshot.bsl;
      return directional ? `Target likuiditas terdekat berada di ${directional.kind} ${priceText(directional.price)}.` : "Target Mapping belum tersedia pada data terakhir.";
    }
    if (topic === "price") return snapshot.price ? `Harga XAU/USD terakhir ${priceText(snapshot.price)}${snapshot.quoteFresh ? "." : ". Harga live perlu diperbarui."}` : "Harga XAU/USD belum tersedia.";
    if (topic === "freshness") return snapshot.quoteFresh
      ? `Harga live ${snapshot.timeframe} masih fresh. Level Mapping tetap berlaku sampai tersapu, termitigasi, digantikan, atau invalid.`
      : `Harga live ${snapshot.timeframe} perlu diperbarui, tetapi level Mapping tidak otomatis expired. Level tetap berlaku sampai tersapu, termitigasi, digantikan, atau invalid.`;
    return mappingSummary(snapshot);
  }

  function workspaceFrom(context) {
    return context?.payload?.workspace || {};
  }

  function journalData(context) {
    const workspace = workspaceFrom(context);
    const source = workspace.trading?.journal || {};
    const summary = source.summary || context?.payload?.summary || {};
    const recent = Array.isArray(source.recent) ? source.recent : [];
    const relevant = Array.isArray(source.relevant) ? source.relevant : [];
    return {
      summary: {
        total: number(summary.total) ?? 0,
        win: number(summary.win) ?? 0,
        loss: number(summary.loss) ?? 0,
        be: number(summary.break_even ?? summary.be) ?? 0,
        completed: number(summary.completed),
        winRate: number(summary.win_rate ?? summary.winRate),
        totalProfit: number(summary.total_profit ?? summary.totalProfit),
        totalLoss: number(summary.total_loss ?? summary.totalLoss),
        net: number(summary.net_result ?? summary.netResult)
      },
      recent,
      relevant
    };
  }

  function journalTopic(value) {
    if (/win rate|akurasi jurnal/.test(value)) return "win-rate";
    if (/berapa.*win|jumlah win|trade win|menang/.test(value)) return "win";
    if (/berapa.*loss|jumlah loss|trade loss|kalah/.test(value)) return "loss";
    if (/break even|breakeven|\bbe\b/.test(value)) return "be";
    if (/profit|untung|rugi|net|hasil bersih/.test(value)) return "profit";
    if (/terakhir|terbaru|entry terakhir|trade terakhir/.test(value)) return "latest";
    if (/kesalahan|mistake|error|disiplin|evaluasi|pola buruk/.test(value)) return "mistakes";
    if (/berapa|jumlah|total|ringkas|status|progres/.test(value)) return "summary";
    return "menu";
  }

  function journalResult(row) {
    return clean(row?.result || row?.outcome?.result || row?.status).toUpperCase() || "BELUM DINILAI";
  }

  function journalLabel(row) {
    return clean(row?.title || row?.market || row?.pair || row?.symbol || row?.setup || "Trade terakhir");
  }

  function mistakeText(rows) {
    const counts = new Map();
    rows.forEach(row => {
      const raw = row?.mistakes ?? row?.mistake ?? row?.errors ?? row?.evaluation?.mistakes ?? row?.lessons;
      const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
      values.forEach(value => {
        const text = clean(typeof value === "string" ? value : value?.label || value?.text || value?.name);
        if (!text) return;
        const key = text.toLowerCase();
        counts.set(key, { text, count: (counts.get(key)?.count || 0) + 1 });
      });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  }

  function answerJournal(topic, context) {
    const { summary, recent, relevant } = journalData(context);
    if (topic === "win-rate") return summary.winRate === null ? "Win rate jurnal belum bisa dihitung karena belum ada trade selesai." : `Win rate jurnal saat ini ${percentText(summary.winRate)} dari ${summary.completed ?? (summary.win + summary.loss + summary.be)} trade selesai.`;
    if (topic === "win") return `Jumlah trade win saat ini ${summary.win}.`;
    if (topic === "loss") return `Jumlah trade loss saat ini ${summary.loss}.`;
    if (topic === "be") return `Jumlah trade break-even saat ini ${summary.be}.`;
    if (topic === "profit") {
      const parts = [];
      if (summary.totalProfit !== null) parts.push(`profit tercatat ${numberText(summary.totalProfit)}`);
      if (summary.totalLoss !== null) parts.push(`loss tercatat ${numberText(summary.totalLoss)}`);
      if (summary.net !== null) parts.push(`hasil bersih ${numberText(summary.net)}`);
      return parts.length ? `Ringkasan hasil jurnal: ${parts.join(", ")}.` : "Nilai profit dan loss belum tersedia pada jurnal.";
    }
    if (topic === "latest") {
      const row = recent[0] || relevant[0];
      if (!row) return "Belum ada jurnal tersimpan.";
      const date = clean(row.date || row.createdAt || row.created_at || row.updatedAt || row.updated_at);
      return `Jurnal terakhir: ${journalLabel(row)}, hasil ${journalResult(row)}${date ? `, tercatat ${date}` : ""}.`;
    }
    if (topic === "mistakes") {
      const mistakes = mistakeText([...recent, ...relevant]);
      return mistakes.length ? `Kesalahan yang paling sering tercatat: ${mistakes.map(item => `${item.text}${item.count > 1 ? ` (${item.count}x)` : ""}`).join(", ")}.` : "Belum ada catatan kesalahan yang cukup untuk diringkas.";
    }
    if (topic === "menu") return "Di Jurnal kamu bisa cek jumlah entry, win, loss, break-even, win rate, hasil bersih, trade terakhir, atau pola kesalahan.";
    return summary.total
      ? `Saat ini ada ${summary.total} jurnal: ${summary.win} win, ${summary.loss} loss, dan ${summary.be} break-even${summary.winRate === null ? "" : `. Win rate ${percentText(summary.winRate)}`}.`
      : "Belum ada jurnal tersimpan.";
  }

  function academyData(context) {
    const academy = workspaceFrom(context).academy || {};
    return {
      progress: academy.progress || {},
      catalog: Array.isArray(academy.catalog) ? academy.catalog : [],
      relevant: Array.isArray(academy.relevant_lessons) ? academy.relevant_lessons : [],
      current: academy.current_page || null
    };
  }

  function academyTopic(value) {
    if (/sampai mana|progres|progress|sudah belajar/.test(value)) return "progress";
    if (/terakhir|materi terakhir|pelajaran terakhir/.test(value)) return "last";
    if (/berikutnya|selanjutnya|lanjut belajar|materi selanjutnya/.test(value)) return "next";
    if (/cari|tentang|jelaskan|ringkas|apa itu|materi/.test(value)) return "search";
    return "menu";
  }

  function firstSentence(value, limit = 260) {
    const text = clean(value).replace(/\s+/g, " ");
    if (!text) return "";
    const sentence = text.match(/^.{1,260}?(?:[.!?](?:\s|$)|$)/)?.[0] || text.slice(0, limit);
    return sentence.length > limit ? `${sentence.slice(0, limit)}…` : sentence;
  }

  function answerAcademy(topic, context) {
    const { progress, catalog, relevant, current } = academyData(context);
    const readCount = number(progress.read_count) ?? (Array.isArray(progress.read_topics) ? progress.read_topics.length : 0);
    const total = number(progress.total_sections) ?? (catalog.length || 36);
    const percentage = number(progress.percentage) ?? (total ? Math.round((readCount / total) * 100) : 0);
    const lastTitle = clean(progress.last_title);
    if (topic === "progress") return `Progres Academy saat ini ${readCount} dari ${total} bagian (${percentText(percentage)})${lastTitle ? `. Materi terakhir: ${lastTitle}` : ""}.`;
    if (topic === "last") return lastTitle ? `Materi terakhir yang dibuka adalah ${lastTitle}.` : current?.title ? `Materi yang sedang dibuka adalah ${clean(current.title)}.` : "Materi terakhir belum tercatat.";
    if (topic === "next") {
      let next = null;
      if (lastTitle) {
        const index = catalog.findIndex(row => clean(row.title).toLowerCase() === lastTitle.toLowerCase());
        if (index >= 0) next = catalog[index + 1] || null;
      }
      next ||= catalog.find(row => !Array.isArray(progress.read_topics) || !progress.read_topics.includes(row.href) && !progress.read_topics.includes(row.title));
      return next ? `Materi berikutnya yang bisa dipelajari: ${clean(next.title)}${next.description ? ` — ${firstSentence(next.description, 180)}` : ""}.` : "Belum ada materi berikutnya yang terdeteksi.";
    }
    if (topic === "search") {
      const lesson = relevant[0];
      if (lesson) {
        const title = clean(lesson.matched_topic || lesson.title);
        const passage = firstSentence(lesson.matched_topic_passage || lesson.passage || lesson.description);
        return `${title || "Materi ditemukan"}${passage ? `: ${passage}` : "."}`;
      }
      if (current?.title) return `Materi aktif: ${clean(current.title)}${current.passage ? `. ${firstSentence(current.passage)}` : ""}`;
      return "Materi yang cocok belum ditemukan. Sebutkan topiknya, misalnya bias, likuiditas, FVG, OB, risk, atau psikologi trading.";
    }
    return "Di Academy kamu bisa cek progres, materi terakhir, materi berikutnya, atau mencari topik belajar tertentu.";
  }

  function intelData(context) {
    const workspace = workspaceFrom(context);
    const market = workspace.market || {};
    const shared = market.shared_intelligence || {};
    const news = shared.news || market.news || context?.payload?.news || {};
    const items = [
      ...(Array.isArray(news.items) ? news.items : []),
      ...(Array.isArray(news.events) ? news.events : []),
      ...(Array.isArray(news.calendar) ? news.calendar : []),
      ...(Array.isArray(market.news_items) ? market.news_items : [])
    ];
    const selected = market.published_news || context?.payload?.published_news || news.selected || items[0] || null;
    return {
      market,
      shared,
      news,
      items,
      selected,
      scheduled: market.scheduled_event || context?.payload?.scheduled_event || news.next_event || null,
      heatmap: shared.heatmap || market.heatmap || window.AmyFXHeatmapState || null,
      liquidity: shared.liquidity || market.liquidity || null
    };
  }

  function eventName(event) {
    return clean(event?.title || event?.name || event?.event || event?.indicator || event?.headline || "News ekonomi");
  }

  function eventValue(event, keys) {
    for (const key of keys) {
      const value = event?.[key];
      if (value !== undefined && value !== null && clean(value) !== "") return clean(value);
    }
    return "";
  }

  function usdBias(event) {
    const name = eventName(event).toLowerCase();
    const actual = number(String(eventValue(event, ["actual", "value", "released"])).replace(/[^0-9.\-]/g, ""));
    const forecast = number(String(eventValue(event, ["forecast", "consensus", "expected"])).replace(/[^0-9.\-]/g, ""));
    const previous = number(String(eventValue(event, ["previous", "prev"])).replace(/[^0-9.\-]/g, ""));
    const left = actual !== null ? actual : forecast;
    const right = actual !== null ? forecast : previous;
    if (left === null || right === null || left === right) return "netral untuk USD";
    const higher = left > right;
    const inverse = /jobless|unemployment|pengangguran|klaim|claims|layoff/.test(name);
    const positive = inverse ? !higher : higher;
    return positive ? "cenderung positif untuk USD dan menekan XAU/USD" : "cenderung negatif untuk USD dan mendukung XAU/USD";
  }

  function eventReply(event, prefix = "News terbaru") {
    if (!event) return "Belum ada data news yang tersedia.";
    const actual = eventValue(event, ["actual", "value", "released"]);
    const forecast = eventValue(event, ["forecast", "consensus", "expected"]);
    const previous = eventValue(event, ["previous", "prev"]);
    const time = eventValue(event, ["time", "displayTime", "scheduled_at", "date", "published_at"]);
    const values = [actual ? `actual ${actual}` : "", forecast ? `forecast ${forecast}` : "", previous ? `previous ${previous}` : ""].filter(Boolean).join(", ");
    return `${prefix}: ${eventName(event)}${time ? ` pada ${time}` : ""}${values ? ` — ${values}` : ""}. Bias awal ${usdBias(event)}.`;
  }

  function clusterRows(value) {
    const candidates = [value?.clusters, value?.levels, value?.liquidityLevels, value?.zones, value?.items].filter(Array.isArray).flat();
    return candidates.map(row => ({
      price: positiveNumber(row?.price ?? row?.level ?? row?.value),
      low: positiveNumber(row?.low ?? row?.bottom),
      high: positiveNumber(row?.high ?? row?.top),
      side: clean(row?.side || row?.type || row?.direction).toUpperCase(),
      strength: number(row?.strength ?? row?.score ?? row?.intensity)
    })).filter(row => row.price || row.low || row.high);
  }

  function intelTopic(value) {
    if (/heatmap/.test(value)) return "heatmap";
    if (/likuiditas|liquidity/.test(value)) return "liquidity";
    if (/berikutnya|selanjutnya|jadwal|malam ini|hari ini|kapan/.test(value)) return "schedule";
    if (/terbaru|terakhir|hasil|actual|forecast|previous|dampak|bias/.test(value)) return "latest";
    return "menu";
  }

  function answerIntel(topic, context) {
    const data = intelData(context);
    if (topic === "latest") return eventReply(data.selected || data.items[0]);
    if (topic === "schedule") {
      const rows = [data.scheduled, ...data.items].filter(Boolean).slice(0, 3);
      return rows.length ? rows.map((event, index) => eventReply(event, index === 0 ? "News berikutnya" : `News ${index + 1}`)).join(" ") : "Belum ada jadwal news yang tersedia.";
    }
    if (topic === "heatmap") {
      const rows = clusterRows(data.heatmap);
      const price = positiveNumber(data.heatmap?.currentPrice ?? data.market?.current_price ?? data.liquidity?.currentPrice);
      if (!rows.length) return price ? `Heatmap tersedia dengan harga terakhir ${priceText(price)}, tetapi cluster aktif belum terbaca.` : "Data Heatmap belum tersedia.";
      const nearest = [...rows].sort((a, b) => price ? Math.abs((a.price || (a.low + a.high) / 2) - price) - Math.abs((b.price || (b.low + b.high) / 2) - price) : (b.strength || 0) - (a.strength || 0))[0];
      const zone = nearest.low && nearest.high ? `${priceText(nearest.low)}–${priceText(nearest.high)}` : priceText(nearest.price);
      return `Cluster Heatmap terdekat berada di ${zone}${nearest.side ? ` (${nearest.side})` : ""}${nearest.strength !== null ? ` dengan kekuatan ${numberText(nearest.strength)}` : ""}.`;
    }
    if (topic === "liquidity") {
      const snapshot = mappingSnapshot(context, { persist: false });
      if (snapshot.bsl || snapshot.ssl) return `Likuiditas aktif terdekat: BSL ${snapshot.bsl ? priceText(snapshot.bsl.price) : "belum ada"} dan SSL ${snapshot.ssl ? priceText(snapshot.ssl.price) : "belum ada"}.`;
      const rows = clusterRows(data.liquidity);
      return rows.length ? `Terdapat ${rows.length} level likuiditas pada data terakhir.` : "Data likuiditas belum tersedia.";
    }
    return "Di Berita dan Heatmap kamu bisa cek news terbaru, jadwal berikutnya, dampak ke USD/XAU, cluster Heatmap, atau level likuiditas.";
  }

  function libraryData(context) {
    const workspace = workspaceFrom(context);
    return {
      library: workspace.trading?.library || {},
      indicators: workspace.indicators || {}
    };
  }

  function answerLibrary(value, context) {
    const { library } = libraryData(context);
    const catalog = library.catalog || {};
    const relevant = Array.isArray(library.relevant) ? library.relevant : [];
    const notes = Array.isArray(library.personal_notes) ? library.personal_notes : [];
    if (/catatan|note/.test(value)) return notes.length ? `Catatan pribadi yang cocok: ${notes.slice(0, 5).map(row => clean(row.title || row.content).slice(0, 80)).join(", ")}.` : "Belum ada catatan pribadi yang cocok.";
    if (/cari|mana|tentang|judul|daftar/.test(value)) {
      const rows = relevant.length ? relevant : Array.isArray(catalog.titles) ? catalog.titles : [];
      return rows.length ? `Item Library yang ditemukan: ${rows.slice(0, 6).map(row => clean(row.title || row.name)).filter(Boolean).join(", ")}.` : "Item Library yang cocok belum ditemukan.";
    }
    return `Library saat ini berisi ${number(catalog.total) ?? 0} item.`;
  }

  function answerIndicators(value, context) {
    const { indicators } = libraryData(context);
    const catalog = Array.isArray(indicators.catalog) ? indicators.catalog : [];
    const relevant = Array.isArray(indicators.relevant) ? indicators.relevant : [];
    if (/cari|mana|tentang|daftar|nama/.test(value)) {
      const rows = relevant.length ? relevant : catalog;
      return rows.length ? `Indikator yang ditemukan: ${rows.slice(0, 8).map(row => clean(row.name || row.title)).filter(Boolean).join(", ")}.` : "Indikator yang cocok belum ditemukan.";
    }
    return `Library Indikator TradingView saat ini berisi ${number(indicators.total) ?? catalog.length} indikator.`;
  }

  function systemData(context) {
    return workspaceFrom(context).system || {};
  }

  function answerSystem(value, context) {
    const system = systemData(context);
    const app = system.app || {};
    const ai = system.ai || {};
    const update = app.update || {};
    if (/api|gemini|openrouter|deepseek|provider|key/.test(value)) {
      const count = Array.isArray(ai.providers) ? ai.providers.length : number(ai.native_secret_count) ?? 0;
      return `Amy sedang memakai mode full bot lokal. API provider tidak dipakai untuk menjawab${count ? `; ${count} key yang tersimpan tetap dibiarkan aman dan tidak digunakan` : ""}.`;
    }
    if (/update|rilis|release/.test(value)) {
      const version = clean(update.version || update.latestVersion || update.versionName);
      const code = clean(update.versionCode || update.code);
      return version ? `Update Preview terbaru ${version}${code ? ` (version code ${code})` : ""}${update.enabled === false ? " dan kanal update sedang nonaktif" : " dan kanal update aktif"}.` : "Status update belum tersedia pada data aplikasi.";
    }
    if (/versi|version/.test(value)) {
      const version = clean(app.version?.version || app.version?.versionName || app.version || window.AmyFXAppVersion?.version || window.AmyFXAppVersion?.versionName);
      return version ? `Versi Amy FX Preview yang terbaca ${version}.` : "Versi aplikasi belum terbaca.";
    }
    if (/status|kesehatan|sistem|online|offline/.test(value)) {
      return `Status sistem: mode FULL BOT aktif, modul ${clean(app.active_module || currentModule()).toUpperCase()}, koneksi ${app.online === false ? "offline" : "online"}.`;
    }
    return "Amy FX memakai full bot lokal untuk membaca seluruh modul tanpa mengirim pertanyaan ke provider AI.";
  }

  function isGreeting(value) {
    return /^(halo|hai|hello|pagi|siang|sore|malam|tes|test|permisi)$/.test(value);
  }

  function greeting() {
    let hour = new Date().getHours();
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", hour12: false }).formatToParts(new Date());
      hour = Number(parts.find(part => part.type === "hour")?.value || hour);
    } catch {}
    const period = hour < 11 ? "pagi" : hour < 15 ? "siang" : hour < 19 ? "sore" : "malam";
    return `Hai, selamat ${period}. Aku Amy, asisten Anda. Ada yang bisa kubantu?`;
  }

  function classify(question) {
    const value = normalizeQuestion(question);
    const session = readSession();
    if (isGreeting(value)) return { area: "general", topic: "greeting", value };
    if (/siapa kamu|kamu siapa|mode apa|ai atau bot/.test(value)) return { area: "system", topic: "identity", value };
    if (/bisa apa|fitur kamu|bantuan|help|menu utama|semua modul/.test(value)) return { area: "general", topic: "capabilities", value };

    const mapping = mappingTopic(value);
    if (mapping || /\bmapping\b|market sekarang|kondisi market|xau|gold/.test(value)) return { area: "mapping", topic: mapping || "menu", value };
    if (/jurnal|trade|entry|win rate|profit|rugi|loss|menang|break even|evaluasi|disiplin|kesalahan/.test(value)) return { area: "journal", topic: journalTopic(value), value };
    if (/academy|belajar|materi|pelajaran|topik|kurikulum/.test(value)) return { area: "academy", topic: academyTopic(value), value };
    if (/berita|news|heatmap|kalender ekonomi|actual|forecast|previous|pmi|cpi|nfp|jobless|likuiditas/.test(value)) return { area: "intel", topic: intelTopic(value), value };
    if (/indikator|tradingview|pine script/.test(value)) return { area: "indicators", topic: "answer", value };
    if (/library|koleksi|file|dokumen|catatan tersimpan/.test(value)) return { area: "library", topic: "answer", value };
    if (/versi|version|update|rilis|release|api|gemini|openrouter|deepseek|provider|key|status sistem|profil|online|offline/.test(value)) return { area: "system", topic: "answer", value };

    if (/^(yang )?(berikutnya|selanjutnya|terakhir|terdekat|berapa|lanjut|ringkas|statusnya|dimana|di mana)$/.test(value) && session.lastArea) {
      if (session.lastArea === "mapping") return { area: "mapping", topic: session.lastTopic || "summary", value };
      if (session.lastArea === "journal") return { area: "journal", topic: /terakhir/.test(value) ? "latest" : session.lastTopic || "summary", value };
      if (session.lastArea === "academy") return { area: "academy", topic: /berikutnya|selanjutnya|lanjut/.test(value) ? "next" : session.lastTopic || "progress", value };
      if (session.lastArea === "intel") return { area: "intel", topic: /berikutnya|selanjutnya/.test(value) ? "schedule" : session.lastTopic || "latest", value };
    }

    return { area: "general", topic: "fallback", value };
  }

  function answer(question, context) {
    const route = classify(question);
    writeSession({ lastArea: route.area, lastTopic: route.topic, lastQuestion: clean(question) });
    if (route.topic === "greeting") return greeting();
    if (route.topic === "capabilities") return "Saya bisa membaca Mapping, Jurnal, Academy, Berita dan Heatmap, Library, Indikator, serta status aplikasi. Semua dijawab dengan bot lokal berdasarkan data Amy FX.";
    if (route.area === "mapping") return answerMapping(route.topic, context);
    if (route.area === "journal") return answerJournal(route.topic, context);
    if (route.area === "academy") return answerAcademy(route.topic, context);
    if (route.area === "intel") return answerIntel(route.topic, context);
    if (route.area === "library") return answerLibrary(route.value, context);
    if (route.area === "indicators") return answerIndicators(route.value, context);
    if (route.area === "system") {
      if (route.topic === "identity") return "Saya Amy, full bot lokal Amy FX. Saya tidak memakai provider AI untuk menjawab.";
      return answerSystem(route.value, context);
    }
    return "Pertanyaan itu belum memiliki pola jawaban. Saya bisa membaca Mapping, Jurnal, Academy, Berita/Heatmap, Library, Indikator, dan status aplikasi. Sebutkan objeknya, misalnya ‘win rate jurnal’ atau ‘news terbaru’.";
  }

  function enrichContext(context) {
    const snapshot = compactSnapshot(mappingSnapshot(context));
    const base = context && typeof context === "object" ? context : {};
    const workspace = base?.payload?.workspace || {};
    return {
      ...base,
      payload: {
        ...(base.payload || {}),
        workspace: {
          ...workspace,
          market: { ...(workspace.market || {}), mapping_snapshot: snapshot, mapping: snapshot }
        }
      }
    };
  }

  function install() {
    const os = window.AmyFXOS;
    if (!os?.ask || os.__amyProfessionalBotV3) return Boolean(os?.__amyProfessionalBotV3);
    const originalBuild = typeof os.buildContext === "function" ? os.buildContext.bind(os) : null;

    const buildContext = async function (sourceModule = currentModule(), options = {}) {
      const base = originalBuild ? await originalBuild(sourceModule, options) : {};
      return enrichContext(base);
    };

    const ask = async function (question, options = {}) {
      const sourceModule = options.sourceModule || currentModule();
      const context = enrichContext(options.context || (originalBuild ? await originalBuild(sourceModule, { question }) : {}));
      return {
        text: answer(question, context),
        provider: "amy-bot",
        model: "professional-bot-v3",
        source: "Amy FX",
        route: "bot",
        mode: "full-bot",
        context
      };
    };

    window.AmyFXOS = Object.freeze({
      ...os,
      buildContext,
      ask,
      mappingIntent: Object.freeze({ version: VERSION, answer: answerMapping, snapshot: mappingSnapshot }),
      professionalBot: Object.freeze({ version: VERSION, answer, classify }),
      __amyMappingIntentHotfixV1: true,
      __amyMappingLifecycleV2: true,
      __amyProfessionalBotV3: true
    });
    window.AmyFXBotMode = "full";
    window.dispatchEvent(new CustomEvent("amyfx:professional-bot-ready", { detail: { version: VERSION, mode: "full-bot" } }));
    return true;
  }

  function repairWelcome() {
    const expected = greeting();
    const marked = document.querySelector("[data-amy-safe-welcome] > div");
    if (marked && marked.textContent !== expected) marked.textContent = expected;
    document.querySelectorAll(".amy-os-message--amy > div").forEach(node => {
      if (/Kamu bisa langsung menulis seperti sedang chat dengan customer service/i.test(node.textContent || "") && node.textContent !== expected) node.textContent = expected;
    });
  }

  function repairBotUi() {
    const root = document.querySelector(".amy-os-root");
    if (!root) return;
    root.dataset.amyBotMode = "full";
    const title = root.querySelector(".amy-os-panel__header strong");
    if (title) title.textContent = "Amy Assistant";
    const subtitle = root.querySelector(".amy-os-panel__header small");
    if (subtitle) subtitle.textContent = "Full bot • semua modul";
    const fab = root.querySelector(".amy-os-fab small");
    if (fab) fab.textContent = "Bot";
    const settingsButton = root.querySelector("[data-amy-settings]");
    if (settingsButton) settingsButton.hidden = true;
    const settingsPanel = root.querySelector("[data-amy-settings-panel]");
    if (settingsPanel) settingsPanel.hidden = true;
    const input = root.querySelector("[data-amy-input]");
    if (input) input.placeholder = "Tanya seluruh data Amy FX";
    const contexts = root.querySelector("[data-amy-contexts]");
    if (contexts && !contexts.querySelector("[data-amy-full-bot]")) {
      const chip = document.createElement("span");
      chip.className = "amy-os-chip";
      chip.dataset.amyFullBot = "1";
      chip.textContent = "FULL BOT";
      contexts.appendChild(chip);
    }
  }

  function isProfileVisible() {
    const list = document.querySelector("#main-content .profile-list");
    const active = document.querySelector(".nav-btn[data-target='profil'].active");
    return Boolean(list && active);
  }

  function storedSnapshot() {
    return readJson(SNAPSHOT_KEY, {});
  }

  let journalPromise = null;
  function journalRows() {
    if (journalPromise) return journalPromise;
    journalPromise = new Promise(resolve => {
      const fallback = readJson(LEGACY_JOURNAL_KEY, []);
      if (!window.indexedDB) { resolve(Array.isArray(fallback) ? fallback : []); return; }
      let request;
      try { request = indexedDB.open(JOURNAL_DB); } catch { resolve(Array.isArray(fallback) ? fallback : []); return; }
      const finish = rows => resolve(Array.isArray(rows) ? rows : Array.isArray(fallback) ? fallback : []);
      request.onerror = () => finish(fallback);
      request.onupgradeneeded = () => { try { request.transaction?.abort(); } catch {} finish(fallback); };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(JOURNAL_STORE)) { db.close(); finish(fallback); return; }
        try {
          const tx = db.transaction(JOURNAL_STORE, "readonly");
          const get = tx.objectStore(JOURNAL_STORE).get(JOURNAL_RECORD);
          get.onsuccess = () => { const rows = get.result?.value; db.close(); finish(rows); };
          get.onerror = () => { db.close(); finish(fallback); };
        } catch { db.close(); finish(fallback); }
      };
      setTimeout(() => finish(fallback), 2500);
    });
    return journalPromise;
  }

  function journalMetrics(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const result = item => lower(item?.result);
    const win = list.filter(item => result(item) === "win").length;
    const loss = list.filter(item => result(item) === "loss").length;
    const be = list.filter(item => /^(be|break even|breakeven)$/.test(result(item))).length;
    const completed = win + loss + be;
    return { total: list.length, winRate: completed ? Math.round((win / completed) * 1000) / 10 : null };
  }

  async function repairCommandCenter() {
    const section = document.querySelector("[data-amy-command-center]");
    if (!section) return;
    const profile = isProfileVisible();
    section.hidden = !profile;
    if (!profile) return;
    const list = document.querySelector("#main-content .profile-list");
    if (list && section.nextElementSibling !== list) list.insertAdjacentElement("beforebegin", section);

    const snapshot = storedSnapshot();
    const hasMapping = Boolean(snapshot?.structuralValid || snapshot?.levels?.some?.(row => row.active) || snapshot?.direction);
    const time = section.querySelector("[data-cc-time]");
    if (time) time.textContent = snapshot?.capturedAt ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(snapshot.capturedAt)) + " WITA" : "Belum ada data";
    const freshnessLabel = section.querySelector("[data-cc-freshness]")?.previousElementSibling;
    if (freshnessLabel) freshnessLabel.textContent = "Data Mapping";
    const freshness = section.querySelector("[data-cc-freshness]");
    if (freshness) {
      freshness.textContent = hasMapping ? (snapshot.quoteFresh ? "DATA LIVE TERSEDIA" : "LEVEL AKTIF TERSEDIA") : "BELUM ADA DATA";
      const card = freshness.closest("[data-state]");
      if (card) card.dataset.state = hasMapping ? (snapshot.quoteFresh ? "fresh" : "stale") : "missing";
    }

    const rows = await journalRows();
    const journal = journalMetrics(rows);
    const journalLabel = section.querySelector("[data-cc-journal]")?.previousElementSibling;
    if (journalLabel) journalLabel.textContent = "Jurnal Trading";
    const journalNode = section.querySelector("[data-cc-journal]");
    if (journalNode) journalNode.textContent = journal.total ? `${journal.total} trade${journal.winRate == null ? "" : ` • ${journal.winRate}% WR`}` : "Belum ada jurnal";

    const mentor = section.querySelector("[data-cc-mentor]");
    if (mentor) mentor.textContent = "Bot lokal aktif";
    const migrationLabel = section.querySelector("[data-cc-migration]")?.previousElementSibling;
    if (migrationLabel) migrationLabel.textContent = "Mode asisten";
    const migration = section.querySelector("[data-cc-migration]");
    if (migration) migration.textContent = "FULL BOT • TANPA API";
  }

  function repairHealth() {
    const snapshot = storedSnapshot();
    const health = document.querySelector("[data-amy-health]");
    if (!health) return;
    const module = currentModule().toUpperCase();
    const hasMapping = Boolean(snapshot?.structuralValid || snapshot?.levels?.some?.(row => row.active));
    const dataState = hasMapping ? "DATA MAPPING TERSEDIA" : "BELUM ADA DATA MARKET";
    health.textContent = `${module} • ${dataState} • FULL BOT`;
  }

  let scheduled = false;
  function scheduleUiRepair() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      repairWelcome();
      repairBotUi();
      repairHealth();
      repairCommandCenter();
      if (currentModule() === "mapping") mappingSnapshot(null, { persist: true });
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run); else setTimeout(run, 0);
  }

  function boot() {
    const installed = install();
    scheduleUiRepair();
    let attempts = 0;
    const timer = installed ? 0 : window.setInterval(() => {
      attempts += 1;
      const ready = install();
      scheduleUiRepair();
      if (ready || attempts >= 240) window.clearInterval(timer);
    }, 50);
    if (timer) window.setTimeout(() => window.clearInterval(timer), 15_000);
    ["amyfx:safe-rule-chat-ready", "amyfx:universal-access-ready"].forEach(name => window.addEventListener(name, install, { once: true }));
    ["amyfx:mapping-state-change", "amyfx:market-update", "amyfx:home-stats-change", "amyfx:open-mentor", "focus"]
      .forEach(name => window.addEventListener(name, scheduleUiRepair));
    window.addEventListener("amyfx:journal-state-change", () => {
      journalPromise = null;
      scheduleUiRepair();
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleUiRepair(); });
    const target = document.body || document.documentElement;
    if (target && typeof MutationObserver === "function") new MutationObserver(scheduleUiRepair).observe(target, { childList: true, subtree: true });
    window.setInterval(() => { if (!document.hidden) scheduleUiRepair(); }, 30_000);
  }

  window.AmyFXMappingIntentHotfix = Object.freeze({ version: VERSION, answer, snapshot: mappingSnapshot, install, greeting, scheduleUiRepair, classify });
  window.AmyFXProfessionalBot = window.AmyFXMappingIntentHotfix;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
