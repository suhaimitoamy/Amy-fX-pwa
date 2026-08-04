"use strict";

(function () {
  if (window.__amyFxProfessionalMarketSourceRegistryV1) return;
  window.__amyFxProfessionalMarketSourceRegistryV1 = true;

  const VERSION = "2.0.0";
  const REGISTRY_KEY = "amyfx.bot.market.registry.v1";
  const AUDIT_KEY = "amyfx.bot.answer.audit.v1";
  const SESSION_KEY = "amyfx.bot.market.session.v1";
  const MAX_AUDIT = 60;
  const MAX_SKEW_MS = 5 * 60 * 1000;

  const clean = value => String(value ?? "").trim();
  const lower = value => clean(value).toLowerCase().replace(/[^a-z0-9À-ÿ%./+\-\s]/gi, " ").replace(/\s+/g, " ").trim();

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function readJson(storage, key, fallback) {
    try { return safeParse(storage.getItem(key), fallback) ?? fallback; } catch (_) { return fallback; }
  }

  function writeJson(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
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

  function normalizeDirection(value) {
    const raw = clean(value).toUpperCase();
    if (!raw) return "";
    if (/BULL|BUY|UPTREND|UPWARD|NAIK/.test(raw)) return "BULLISH";
    if (/BEAR|SELL|DOWNTREND|DOWNWARD|TURUN/.test(raw)) return "BEARISH";
    if (/NO CLEAR|NEUTRAL|SIDEWAYS|RANGE|WAIT|MIXED|TRANSITION|BELUM JELAS/.test(raw)) return "NO CLEAR DIRECTION";
    return raw;
  }

  function directional(value) {
    const normalized = normalizeDirection(value);
    return normalized === "BULLISH" || normalized === "BEARISH" ? normalized : "";
  }

  function firstDirection(values) {
    for (const value of values) {
      const normalized = normalizeDirection(value);
      if (normalized) return normalized;
    }
    return "";
  }

  function currentModule() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/apps/mapping/")) return "mapping";
    if (path.includes("/apps/market-intel/")) return "intel";
    if (path.includes("/apps/journal/")) return "journal";
    if (path.includes("/apps/academy/")) return "academy";
    return "home";
  }

  function contextMarket(context) {
    return context?.payload?.workspace?.market || {};
  }

  function intelState(context) {
    const fromContext = contextMarket(context)?.shared_intelligence;
    if (fromContext && typeof fromContext === "object" && Object.keys(fromContext).length) return fromContext;
    try {
      const state = window.AmyFXMarketContract?.read?.() || window.AmyFXIntel?.read?.();
      if (state && typeof state === "object") return state;
    } catch (_) {}
    return window.AmyFXIntelState && typeof window.AmyFXIntelState === "object" ? window.AmyFXIntelState : {};
  }

  function liveResult(context) {
    const market = contextMarket(context);
    return market?.live_state?.result || market?.live_state || window.AmyFXMarketState?.result || window.state?.result || window.lastMappingResult || null;
  }

  function canonicalSnapshot(context) {
    const state = intelState(context);
    try {
      const snap = window.AmyFXMarketContract?.snapshot?.(state) || window.AmyFXIntel?.snapshot?.(state);
      if (snap) return { state, snapshot: snap };
    } catch (_) {}
    const price = positiveNumber(window.AmyFXIntel?.bestCurrentPrice?.(state)) || positiveNumber(contextMarket(context)?.current_price);
    const levels = window.AmyFXIntel?.nearestLevels?.(state) || { bsl: null, ssl: null };
    return {
      state,
      snapshot: {
        currentPrice: price,
        nearestLiquidity: levels,
        domains: {
          quote: state.quote || null,
          mapping: state.mapping || null,
          liquidity: state.liquidity || null,
          heatmap: state.heatmap || null,
          news: state.news || null
        },
        conflicts: []
      }
    };
  }

  function mappingTimestamp(state, result) {
    return validTime(state?.mapping?.capturedAt || state?.mapping?.captured_at || result?.capturedAt || result?.captured_at || result?.timestamp);
  }

  function quoteTimestamp(state, snapshot) {
    return validTime(state?.quote?.capturedAt || snapshot?.domains?.quote?.capturedAt);
  }

  function skewConflict(state, snapshot, result) {
    const quoteAt = quoteTimestamp(state, snapshot);
    const mappingAt = mappingTimestamp(state, result);
    if (!quoteAt || !mappingAt) return null;
    const skewMs = Math.abs(quoteAt - mappingAt);
    return skewMs > MAX_SKEW_MS ? { skewMs, quoteAt, mappingAt } : null;
  }

  function mappingDirection(result, mapping) {
    const forecast = result?.validatedMarketContext?.directionForecast || result?.validatedDirectionForecast;
    const dominant = forecast?.active && directional(forecast.direction)
      ? directional(forecast.direction)
      : firstDirection([
        result?.dominantDirection,
        result?.directionDecision?.bias,
        result?.final,
        mapping?.directionForecast,
        mapping?.directionDecision?.bias,
        mapping?.bias,
        mapping?.direction
      ]) || "NO CLEAR DIRECTION";
    const timeframe = firstDirection([
      result?.validatedMarketContext?.marketState?.structureTrend,
      result?.st?.confirmedTrend,
      result?.st?.trend,
      mapping?.timeframeDirection
    ]) || "NO CLEAR DIRECTION";
    return { dominant, timeframe };
  }

  function structureEvent(result) {
    const event = result?.st?.lastEvent || result?.structure?.lastEvent || null;
    if (!event) return null;
    return {
      kind: clean(event.kind || event.type || "STRUCTURE").toUpperCase(),
      direction: normalizeDirection(event.dir || event.direction),
      price: positiveNumber(event.price || event.level)
    };
  }

  function setupState(result, state) {
    const setup = result?.setupExecution || result?.bestSetup || result?.experimentalBestSetup || state?.outlook?.scenarios?.find?.(item => clean(item?.status).toUpperCase() === "ACTIVE") || state?.outlook?.scenarios?.[0] || null;
    if (!setup) return null;
    return {
      active: setup.active !== false && !setup.terminal,
      direction: firstDirection([setup.direction, setup.side, setup.dir]),
      status: clean(setup.status || setup.state || "WAIT").toUpperCase(),
      entryLow: positiveNumber(setup.entryLow ?? setup.zoneLow),
      entryHigh: positiveNumber(setup.entryHigh ?? setup.zoneHigh),
      stopLoss: positiveNumber(setup.stopLoss ?? setup.sl ?? setup.invalidation),
      target1: positiveNumber(setup.target1 ?? setup.tp1 ?? setup.target),
      target2: positiveNumber(setup.target2 ?? setup.tp2),
      reason: clean(setup.reason)
    };
  }

  function newsRisk(state) {
    try { return window.AmyFXIntel?.newsRisk?.(state) || "UNKNOWN"; } catch (_) { return "UNKNOWN"; }
  }

  function sessionInfo() {
    try { return window.AmyFXIntel?.sessionInfo?.() || { id: "UNKNOWN", label: "SESSION UNKNOWN" }; } catch (_) { return { id: "UNKNOWN", label: "SESSION UNKNOWN" }; }
  }

  function marketModel(context) {
    const { state, snapshot } = canonicalSnapshot(context);
    const result = liveResult(context);
    const mapping = state?.mapping || {};
    const liquidity = snapshot?.nearestLiquidity || window.AmyFXIntel?.nearestLevels?.(state) || { bsl: null, ssl: null };
    const price = positiveNumber(snapshot?.currentPrice) || positiveNumber(contextMarket(context)?.current_price);
    const direction = mappingDirection(result, mapping);
    const event = structureEvent(result);
    const setup = setupState(result, state);
    const skew = skewConflict(state, snapshot, result);
    const directionConflict = directional(direction.dominant) && directional(direction.timeframe) && direction.dominant !== direction.timeframe;
    const conflicts = [
      ...(Array.isArray(snapshot?.conflicts) ? snapshot.conflicts : []),
      ...(directionConflict ? [{ code: "DIRECTION_CONFLICT", dominant: direction.dominant, timeframe: direction.timeframe }] : [])
    ];
    return {
      state,
      snapshot,
      result,
      mapping,
      price,
      bsl: liquidity?.bsl || null,
      ssl: liquidity?.ssl || null,
      liquidityFreshness: liquidity?.freshness || null,
      direction,
      event,
      setup,
      conflicts,
      skew,
      directionConflict,
      quoteCapturedAt: isoTime(quoteTimestamp(state, snapshot)),
      mappingCapturedAt: isoTime(mappingTimestamp(state, result)),
      newsRisk: newsRisk(state),
      session: sessionInfo(),
      timeframe: clean(result?.tf || result?.timeframe || mapping?.timeframe || "M15").toUpperCase()
    };
  }

  function sourceLabel(level) {
    const state = clean(level?.freshness || "").toUpperCase();
    if (state === "STRUCTURAL" || state === "STALE" || state === "EXPIRED") return `nearest draw Intel Liquidity berstatus ${state}`;
    return "nearest draw live Intel Liquidity";
  }

  function levelAnswer(type, model) {
    const level = type === "BSL" ? model.bsl : model.ssl;
    if (!level?.price) return `${type} resmi dari Intel Liquidity belum tersedia.`;
    const mappingValue = positiveNumber(model.mapping?.[type.toLowerCase()]);
    const difference = mappingValue && Math.abs(mappingValue - level.price) >= 0.01
      ? ` Snapshot Mapping ${priceText(mappingValue)} hanya level struktural internal, bukan sumber resmi ${type}.`
      : "";
    return `${type} aktif terdekat ${priceText(level.price)} dari ${sourceLabel(level)}.${difference}`;
  }

  function pastAnswer(model) {
    if (!model.event) return "Riwayat struktur market terbaru belum tersedia dari Mapping engine.";
    return `${model.event.kind} ${model.event.direction || ""}${model.event.price ? ` di ${priceText(model.event.price)}` : ""}. Sumber: Mapping engine • ${timeText(model.mappingCapturedAt)}.`;
  }

  function futureAnswer(model) {
    const setup = model.setup;
    const direction = directional(model.direction.dominant) || directional(setup?.direction);
    if (!setup && !direction) return "Skenario masa depan belum tervalidasi; keputusan tetap WAIT.";
    const area = setup?.entryLow && setup?.entryHigh ? ` area ${priceText(setup.entryLow)}–${priceText(setup.entryHigh)}` : "";
    const target = setup?.target1 ? `, target ${priceText(setup.target1)}` : model.bsl?.price && direction === "BULLISH" ? `, target ${priceText(model.bsl.price)}` : model.ssl?.price && direction === "BEARISH" ? `, target ${priceText(model.ssl.price)}` : "";
    const invalidation = setup?.stopLoss ? `, invalidasi ${priceText(setup.stopLoss)}` : "";
    const warning = model.skew ? " Harga quote dan Mapping berasal dari waktu berbeda; skenario tidak boleh dianggap sinkron sampai Mapping diperbarui." : "";
    return `arah skenario ${direction || "WAIT"}${area}${target}${invalidation}.${warning}`;
  }

  function invalidationAnswer(model) {
    const remembered = readJson(sessionStorage, SESSION_KEY, {});
    const value = model.setup?.stopLoss || positiveNumber(remembered?.invalidation);
    if (!value) return "Level invalidasi belum tersedia dari setup Mapping terbaru.";
    return `Invalidasi setup berada di ${priceText(value)}. Jika level ini ditembus valid, skenario sebelumnya tidak berlaku.`;
  }

  function directionAnswer(model) {
    if (!model.price && !directional(model.direction.dominant) && !directional(model.direction.timeframe)) return "Data market belum cukup untuk menentukan arah.";
    if (model.directionConflict) {
      return `Arah dominan engine ${model.direction.dominant}. Arah ${model.timeframe} ${model.direction.timeframe}. Konflik data terdeteksi, sehingga keputusan tetap WAIT.`;
    }
    const skew = model.skew ? ` Harga quote ${timeText(model.quoteCapturedAt)} dan Mapping ${timeText(model.mappingCapturedAt)} tidak sinkron; keputusan tetap WAIT sampai Mapping diperbarui.` : "";
    return `Arah dominan engine ${model.direction.dominant}. Arah ${model.timeframe} ${model.direction.timeframe}.${skew}`;
  }

  function summaryAnswer(model) {
    if (!model.price && !model.bsl?.price && !model.ssl?.price && !model.result) return "Data market belum cukup untuk membuat ringkasan tanpa mengarang level.";
    const pieces = [];
    if (model.event) pieces.push(`Sebelumnya ${model.event.kind} ${model.event.direction || ""}${model.event.price ? ` di ${priceText(model.event.price)}` : ""}.`);
    pieces.push(`Arah dominan ${model.direction.dominant}.`);
    pieces.push(`Arah ${model.timeframe} ${model.direction.timeframe}.`);
    if (model.price) pieces.push(`Harga terakhir ${priceText(model.price)}.`);
    pieces.push(`BSL terdekat ${model.bsl?.price ? priceText(model.bsl.price) : "belum tersedia"}.`);
    pieces.push(`SSL terdekat ${model.ssl?.price ? priceText(model.ssl.price) : "belum tersedia"}.`);
    if (model.setup?.entryLow && model.setup?.entryHigh) pieces.push(`Area skenario ${priceText(model.setup.entryLow)}–${priceText(model.setup.entryHigh)}.`);
    if (model.setup?.target1) pieces.push(`Target ${priceText(model.setup.target1)}.`);
    if (model.setup?.stopLoss) pieces.push(`Invalidasi ${priceText(model.setup.stopLoss)}.`);
    pieces.push(`Risiko news ${model.newsRisk}.`);
    pieces.push(model.session.label + ".");
    if (model.directionConflict) pieces.push("Konflik data arah terdeteksi; keputusan tetap WAIT.");
    if (model.skew) pieces.push(`Timestamp quote dan Mapping berbeda ${Math.round(model.skew.skewMs / 60_000)} menit; jangan gabungkan sebagai satu snapshot.`);
    return pieces.join(" ");
  }

  function priceAnswer(model) {
    if (!model.price) return "Harga resmi XAU/USD belum tersedia dari quote M1.";
    const quoteState = model.snapshot?.domains?.quote?.freshness?.state || model.snapshot?.domains?.quote?.freshness || "UNKNOWN";
    return `Harga resmi XAU/USD ${priceText(model.price)}. Status quote ${clean(quoteState).toUpperCase()} • ${timeText(model.quoteCapturedAt)}.`;
  }

  function setupAnswer(model) {
    if (!model.setup) return "Setup aktif belum tersedia dari Mapping engine terbaru.";
    const area = model.setup.entryLow && model.setup.entryHigh ? `${priceText(model.setup.entryLow)}–${priceText(model.setup.entryHigh)}` : "belum tersedia";
    return `Setup ${model.setup.direction || "WAIT"} berstatus ${model.setup.status}. Area entry ${area}. Target ${model.setup.target1 ? priceText(model.setup.target1) : "belum tersedia"}. Invalidasi ${model.setup.stopLoss ? priceText(model.setup.stopLoss) : "belum tersedia"}.`;
  }

  function classify(question) {
    const value = lower(question);
    if (/\b(bsl|buy side liquidity|buy-side liquidity)\b/.test(value)) return "bsl";
    if (/\b(ssl|sell side liquidity|sell-side liquidity)\b/.test(value)) return "ssl";
    if (/\b(invalidasi(?:nya)?|invalidation|batal|tidak berlaku)\b/.test(value)) return "invalidation";
    if (/\b(sebelum|sebelumnya|masa lalu|past|terjadi)\b/.test(value)) return "past";
    if (/\b(masa depan|future|nanti|skenario|target berikut)\b/.test(value)) return "future";
    if (/\b(setup|entry|sl|tp|stop loss|take profit)\b/.test(value)) return "setup";
    if (/\b(harga|price|xau\/usd|xauusd)\b/.test(value) && !/arah|market|bull|bear/.test(value)) return "price";
    if (/\b(arah|bullish|bearish|bias|trend)\b/.test(value)) return "direction";
    if (/\b(market|pasar|ringkasan|hari ini|sekarang|gimana|bagaimana)\b/.test(value)) return "summary";
    return "";
  }

  function persistModel(model, intent) {
    const registry = {
      schema: "AmyFXBotMarketRegistryV2",
      schemaVersion: 2,
      capturedAt: model.mappingCapturedAt,
      quoteCapturedAt: model.quoteCapturedAt,
      storedAt: new Date().toISOString(),
      price: model.price,
      bsl: model.bsl?.price || null,
      ssl: model.ssl?.price || null,
      dominantDirection: model.direction.dominant,
      timeframeDirection: model.direction.timeframe,
      timeframe: model.timeframe,
      invalidation: model.setup?.stopLoss || null,
      conflicts: clone(model.conflicts)
    };
    writeJson(localStorage, REGISTRY_KEY, registry);
    writeJson(sessionStorage, SESSION_KEY, { ...registry, intent, updatedAt: new Date().toISOString() });
    window.AmyFXBotMarketRegistryState = Object.freeze(registry);
    return registry;
  }

  function audit(intent, question, answerText, model) {
    const rows = readJson(localStorage, AUDIT_KEY, []);
    const next = [{
      at: new Date().toISOString(),
      intent,
      question: clean(question),
      answer: clean(answerText),
      selected: {
        price: model.price || null,
        bsl: model.bsl?.price || null,
        ssl: model.ssl?.price || null,
        invalidation: model.setup?.stopLoss || null,
        quoteCapturedAt: model.quoteCapturedAt,
        mappingCapturedAt: model.mappingCapturedAt
      },
      conflicts: clone(model.conflicts)
    }, ...(Array.isArray(rows) ? rows : [])].slice(0, MAX_AUDIT);
    writeJson(localStorage, AUDIT_KEY, next);
  }

  function answer(question, context = null) {
    const intent = classify(question);
    if (!intent) return null;
    const model = marketModel(context);
    persistModel(model, intent);
    let response = null;
    if (intent === "bsl") response = levelAnswer("BSL", model);
    else if (intent === "ssl") response = levelAnswer("SSL", model);
    else if (intent === "invalidation") response = invalidationAnswer(model);
    else if (intent === "past") response = pastAnswer(model);
    else if (intent === "future") response = futureAnswer(model);
    else if (intent === "direction") response = directionAnswer(model);
    else if (intent === "price") response = priceAnswer(model);
    else if (intent === "setup") response = setupAnswer(model);
    else response = summaryAnswer(model);
    audit(intent, question, response, model);
    return response;
  }

  const registry = Object.freeze({
    version: VERSION,
    classify,
    answer,
    model: marketModel,
    snapshot: canonicalSnapshot,
    registryKey: REGISTRY_KEY,
    auditKey: AUDIT_KEY
  });

  window.AmyFXMarketSourceRegistry = registry;

  const baseBot = window.AmyFXProfessionalBot || window.AmyFXMappingIntentHotfix || null;
  if (baseBot) {
    const wrapped = Object.freeze({
      ...baseBot,
      __amyProfessionalMarketSourceRegistryV1: true,
      version: VERSION,
      async answer(question, context = {}) {
        const grounded = registry.answer(question, context);
        if (clean(grounded)) return grounded;
        return typeof baseBot.answer === "function" ? baseBot.answer(question, context) : "Data untuk pertanyaan itu belum tersedia.";
      }
    });
    window.AmyFXProfessionalBot = wrapped;
    window.AmyFXMappingIntentHotfix = wrapped;
  }

  window.dispatchEvent(new CustomEvent("amyfx:professional-market-source-registry-ready", {
    detail: { version: VERSION, module: currentModule() }
  }));
  window.AmyFXProfessionalBotHandlerLock?.lock?.();
})();
