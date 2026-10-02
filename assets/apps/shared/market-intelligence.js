(function () {
  if (window.AmyFXIntel) return;

  const contract = window.AmyFXMarketContract;
  if (!contract) {
    console.error('AmyFXMarketContract must load before market-intelligence.js');
    return;
  }

  const LIVE_DISPLAY_TTL_MS = 180_000;
  const ASIA_SESSION_ZONE = 'America/New_York';
  const ASIA_SESSION_START_HOUR = 18;
  const ASIA_SESSION_END_HOUR = 2;

  function zonedClock(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23'
    }).formatToParts(date);
    const read = type => Number(parts.find(item => item.type === type)?.value || 0);
    return { hour: read('hour'), minute: read('minute') };
  }

  function sessionInfo(date = new Date()) {
    const newYork = zonedClock(date, ASIA_SESSION_ZONE);
    if (newYork.hour >= ASIA_SESSION_START_HOUR || newYork.hour < ASIA_SESSION_END_HOUR) {
      return { id: 'ASIA', label: 'ASIA ACTIVE' };
    }

    const makassar = zonedClock(date, 'Asia/Makassar');
    const minutes = makassar.hour * 60 + makassar.minute;
    if (minutes >= 14 * 60 && minutes < 18 * 60) return { id: 'LONDON', label: 'LONDON ACTIVE' };
    if (minutes >= 19 * 60 + 30 || minutes < 4 * 60) return { id: 'NEW_YORK', label: 'NEW YORK ACTIVE' };
    return { id: 'OFF_SESSION', label: 'OFF-SESSION' };
  }

  function newsText(item) {
    return [item?.text, item?.textOriginal, item?.title, item?.headline, item?.summary, item?.description]
      .filter(Boolean).join(' ');
  }

  function newsRisk(state = contract.read()) {
    const items = state.news?.items || [];
    const high = /fomc|powell|cpi|nfp|payroll|interest rate|suku bunga|fed decision|war|tariff/i;
    const medium = /inflation|ppi|pce|yield|treasury|jobless|gdp|geopolitical|sanction/i;
    if (items.some(item => high.test(newsText(item)))) return 'HIGH';
    if (items.some(item => medium.test(newsText(item)))) return 'ELEVATED';
    return items.length ? 'NORMAL' : 'UNKNOWN';
  }

  function priceText(value) {
    const price = Number(value);
    return Number.isFinite(price) && price > 0 ? price.toFixed(2) : '--';
  }

  function levelText(level) {
    if (!level) return '--';
    return priceText(level.price);
  }

  function freshness(state = contract.read()) {
    return contract.freshness(state);
  }

  function runtimeLiveQuote() {
    let storedTickAt = 0;
    let storedPrice = 0;
    try {
      storedTickAt = Number(localStorage.getItem('last_ws_tick_at') || 0);
      storedPrice = Number(localStorage.getItem('last_price') || 0);
    } catch (_) {}

    const capturedAt = Math.max(
      Number(window.__amyFxDisplayLastTickAt || 0),
      storedTickAt
    );
    const runtimePrice = Number(window.state?.price || storedPrice || 0);
    const ageMs = capturedAt ? Date.now() - capturedAt : Number.POSITIVE_INFINITY;
    if (
      !Number.isFinite(runtimePrice)
      || runtimePrice <= 0
      || !capturedAt
      || ageMs < -60_000
      || ageMs > LIVE_DISPLAY_TTL_MS
    ) return null;

    return {
      pair: 'XAU/USD',
      price: runtimePrice,
      capturedAt: new Date(capturedAt).toISOString(),
      providerCapturedAt: new Date(capturedAt).toISOString(),
      source: 'TWELVE_DATA_WEBSOCKET_DISPLAY',
      connection: 'Connected',
      dataStale: false
    };
  }

  function displayQuote(state = contract.read()) {
    return runtimeLiveQuote() || state.quote || {};
  }

  function briefing(state = contract.read()) {
    const quoteFreshness = contract.assess('quote', displayQuote(state));
    const levels = contract.nearestLevels(state);
    const mapping = state.mapping || {};
    const conflicts = contract.conflicts(state);

    if (quoteFreshness.state !== 'LIVE') {
      const lines = [`Quote XAU/USD ${quoteFreshness.label}.`];
      if (levels.bsl || levels.ssl) lines.push(`Level Intel masih berstatus ${levels.freshness.state}.`);
      if (conflicts.length) lines.push('Snapshot market memiliki perbedaan waktu atau sumber yang harus diperhatikan.');
      return { tone: 'wait', title: `DATA ${quoteFreshness.label}`, lines };
    }

    const bslDist = levels.bsl ? Math.abs(Number(levels.bsl.distance)) : Infinity;
    const sslDist = levels.ssl ? Math.abs(Number(levels.ssl.distance)) : Infinity;
    const pressure = bslDist < sslDist ? 'ABOVE PRICE' : sslDist < bslDist ? 'BELOW PRICE' : 'BALANCED';
    const draw = bslDist < sslDist ? levels.bsl : sslDist < bslDist ? levels.ssl : (levels.bsl || levels.ssl);
    const action = mapping.direction || mapping.status || 'WAIT';
    return {
      tone: String(action).includes('BUY') ? 'buy' : String(action).includes('SELL') ? 'sell' : 'wait',
      title: 'RULE-BASED MARKET BRIEFING',
      lines: [
        `Liquidity pressure: ${pressure}`,
        `Nearest draw: ${draw ? `${draw.type} ${priceText(draw.price)}` : 'WAITING INTEL LIQUIDITY'}`,
        `Mapping: ${mapping.bias || 'WAIT'} · ${action}`,
        `News risk: ${newsRisk(state)} · ${sessionInfo().label}`,
        ...(conflicts.length ? ['Catatan: terdapat perbedaan sumber/timestamp; keputusan tetap WAIT sampai selaras.'] : [])
      ]
    };
  }

  function mountStrip(target) {
    if (!target || target._amyCanonicalStripMounted) return;
    target._amyCanonicalStripMounted = true;

    const paint = () => {
      const state = contract.read();
      const quote = displayQuote(state);
      const quoteFreshness = contract.assess('quote', quote);
      const levels = contract.nearestLevels(state);
      const price = Number(quote?.price || contract.bestCurrentPrice(state) || 0);
      target.innerHTML = `<div class="amy-command-main"><span>XAU/USD</span><strong data-live-price>${priceText(price)}</strong></div>`
        + `<div class="amy-command-metric"><small>SESSION</small><b>${sessionInfo().id}</b></div>`
        + `<div class="amy-command-metric"><small>BSL</small><b class="red" title="${levels.bsl?.freshness || 'UNAVAILABLE'}" data-freshness="${levels.bsl?.freshness || 'UNAVAILABLE'}">${levelText(levels.bsl)}</b></div>`
        + `<div class="amy-command-metric"><small>SSL</small><b class="green" title="${levels.ssl?.freshness || 'UNAVAILABLE'}" data-freshness="${levels.ssl?.freshness || 'UNAVAILABLE'}">${levelText(levels.ssl)}</b></div>`
        + `<div class="amy-data-state ${quoteFreshness.className}" data-live-freshness data-domain="quote" data-freshness="${quoteFreshness.state}"><i></i>${quoteFreshness.label}</div>`;
    };

    paint();
    window.addEventListener('amyfx:market-update', paint);
    window.addEventListener('amyfx:live-price-display', paint);
    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    window.addEventListener('storage', event => {
      if (event.key === contract.storeKey || event.key === 'last_price' || event.key === 'last_ws_tick_at') {
        contract.syncGlobals();
        paint();
      }
    });
    target._amyPaint = paint;
  }

  function mountBriefing(target) {
    if (!target || target._amyCanonicalBriefingMounted) return;
    target._amyCanonicalBriefingMounted = true;
    const paint = () => {
      const data = briefing();
      target.className = `amy-briefing ${data.tone}`;
      target.innerHTML = `<div class="amy-briefing-title">${data.title}</div>${data.lines.map(line => `<div>${line}</div>`).join('')}`;
    };
    paint();
    window.addEventListener('amyfx:market-update', paint);
    window.addEventListener('amyfx:live-price-display', paint);
    window.addEventListener('storage', event => {
      if (event.key === contract.storeKey || event.key === 'last_price' || event.key === 'last_ws_tick_at') paint();
    });
    target._amyPaint = paint;
  }

  contract.syncGlobals();
  window.AmyFXIntel = Object.freeze({
    version: '2.1.0',
    read: contract.read,
    write: contract.write,
    syncGlobals: contract.syncGlobals,
    partTimestamp: contract.partTimestamp,
    assessFreshness: contract.assess,
    sessionInfo,
    freshness,
    nearestLevels: contract.nearestLevels,
    bestCurrentPrice: contract.bestCurrentPrice,
    displayQuote,
    runtimeLiveQuote,
    conflicts: contract.conflicts,
    snapshot: contract.snapshot,
    newsRisk,
    briefing,
    mountStrip,
    mountBriefing,
    __amyCanonicalMarketContractV2: true
  });
})();