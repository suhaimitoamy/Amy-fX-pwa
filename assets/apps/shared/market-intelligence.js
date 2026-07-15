(function () {
  if (window.AmyFXIntel) return;

  const STORE_KEY = 'amyfx.market.intel.v1';
  const MAX_AGE = 5 * 60 * 1000;

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function read() {
    return safeParse(localStorage.getItem(STORE_KEY) || '{}', {});
  }

  function write(part, payload) {
    const state = read();
    state[part] = { ...payload, storedAt: Date.now() };
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('amyfx:market-update', { detail: state }));
    return state;
  }

  function sessionInfo(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date).split(':').map(Number);
    const minutes = parts[0] * 60 + parts[1];
    if (minutes >= 6 * 60 && minutes < 12 * 60) return { id: 'ASIA', label: 'ASIA ACTIVE' };
    if (minutes >= 13 * 60 && minutes < 17 * 60) return { id: 'LONDON', label: 'LONDON ACTIVE' };
    if (minutes >= 19 * 60 + 30 && minutes < 23 * 60) return { id: 'NEW_YORK', label: 'NEW YORK ACTIVE' };
    return { id: 'OFF_SESSION', label: 'OFF-SESSION' };
  }

  function freshness(state) {
    const stamps = ['heatmap', 'liquidity', 'news', 'mapping']
      .map(key => Number(state[key]?.storedAt || 0)).filter(Boolean);
    if (!navigator.onLine) return { label: 'OFFLINE', className: 'offline' };
    if (!stamps.length) return { label: 'WAITING', className: 'stale' };
    const age = Date.now() - Math.max(...stamps);
    if (age > MAX_AGE) return { label: 'STALE', className: 'stale' };
    return { label: 'LIVE', className: 'live' };
  }

  function partIsFresh(part) {
    const storedAt = Number(part?.storedAt || 0);
    return storedAt > 0 && Date.now() - storedAt <= MAX_AGE;
  }

  function priceCandidate(part, value) {
    const price = Number(value);
    const storedAt = Number(part?.storedAt || 0);
    if (!Number.isFinite(price) || price <= 0 || storedAt <= 0) return null;
    return { price, storedAt, fresh: partIsFresh(part) };
  }

  function bestCurrentPrice(state = read()) {
    const candidates = [
      priceCandidate(state.mapping, state.mapping?.price),
      priceCandidate(state.liquidity, state.liquidity?.currentPrice),
      priceCandidate(state.heatmap, state.heatmap?.currentPrice)
    ].filter(Boolean);
    const fresh = candidates.filter(item => item.fresh).sort((a, b) => b.storedAt - a.storedAt);
    const fallback = candidates.sort((a, b) => b.storedAt - a.storedAt);
    return Number((fresh[0] || fallback[0])?.price || 0);
  }

  function normalizeLevel(item, type, currentPrice) {
    const price = Number(item?.price ?? item?.level);
    if (!Number.isFinite(price) || price <= 0) return null;
    const rawDistance = Number(item?.distance ?? item?.distanceFromPrice);
    return {
      ...item,
      type,
      price,
      distance: Number.isFinite(rawDistance) ? rawDistance : price - currentPrice
    };
  }

  function levelIsOnCorrectSide(level, type, currentPrice) {
    if (!level || !Number.isFinite(currentPrice) || currentPrice <= 0) return Boolean(level);
    return type === 'BSL' ? level.price > currentPrice : type === 'SSL' ? level.price < currentPrice : false;
  }

  function levelIsActive(item) {
    const status = String(item?.status || 'ACTIVE').toUpperCase();
    if (status === 'SWEPT_RECLAIMED') return item?.active !== false;
    return item?.active !== false && !/(SWEPT|TOUCHED|INVALID|BROKEN|EXPIRED|HISTORICAL)/.test(status);
  }

  function pickNearest(levels, type, currentPrice, fallbackPrice) {
    const candidates = (Array.isArray(levels) ? levels : [])
      .filter(item => item?.type === type && levelIsActive(item))
      .map(item => normalizeLevel(item, type, currentPrice))
      .filter(item => levelIsOnCorrectSide(item, type, currentPrice))
      .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
    if (candidates[0]) return candidates[0];
    const fallback = normalizeLevel({ price: fallbackPrice }, type, currentPrice);
    return levelIsOnCorrectSide(fallback, type, currentPrice) ? fallback : null;
  }

  function normalizedHeatmapLevels(heatmap, currentPrice) {
    return (Array.isArray(heatmap?.zones) ? heatmap.zones : [])
      .filter(zone => zone?.liquidityType === 'BSL' || zone?.liquidityType === 'SSL')
      .map(zone => ({
        ...zone,
        type: zone.liquidityType,
        level: Number(zone.price),
        distance: Number(zone.price) - currentPrice
      }));
  }

  function nearestLevels(state) {
    const mapping = state.mapping || {};
    const liquidity = state.liquidity || {};
    const heatmap = state.heatmap || {};
    const currentPrice = bestCurrentPrice(state);
    const mappingFresh = partIsFresh(mapping);
    const liquidityFresh = partIsFresh(liquidity);
    const heatmapFresh = partIsFresh(heatmap);

    const mappingBsl = mappingFresh ? pickNearest(mapping.levels, 'BSL', currentPrice, mapping.bsl) : null;
    const mappingSsl = mappingFresh ? pickNearest(mapping.levels, 'SSL', currentPrice, mapping.ssl) : null;
    const liquidityBsl = liquidityFresh ? pickNearest(liquidity.levels, 'BSL', currentPrice, null) : null;
    const liquiditySsl = liquidityFresh ? pickNearest(liquidity.levels, 'SSL', currentPrice, null) : null;
    const heatmapLevels = heatmapFresh ? normalizedHeatmapLevels(heatmap, currentPrice) : [];
    const heatmapBsl = heatmapFresh ? pickNearest(heatmapLevels, 'BSL', currentPrice, heatmap.summary?.nearestBsl?.price) : null;
    const heatmapSsl = heatmapFresh ? pickNearest(heatmapLevels, 'SSL', currentPrice, heatmap.summary?.nearestSsl?.price) : null;

    const sources = [
      { storedAt: Number(mapping.storedAt || 0), bsl: mappingBsl, ssl: mappingSsl },
      { storedAt: Number(liquidity.storedAt || 0), bsl: liquidityBsl, ssl: liquiditySsl },
      { storedAt: Number(heatmap.storedAt || 0), bsl: heatmapBsl, ssl: heatmapSsl }
    ].sort((a, b) => b.storedAt - a.storedAt);

    return {
      bsl: sources.find(source => source.bsl)?.bsl || null,
      ssl: sources.find(source => source.ssl)?.ssl || null
    };
  }

  function newsRisk(state) {
    const items = state.news?.items || [];
    const high = /fomc|powell|cpi|nfp|payroll|interest rate|suku bunga|fed decision|war|tariff/i;
    const medium = /inflation|ppi|pce|yield|treasury|jobless|gdp|geopolitical|sanction/i;
    if (items.some(item => high.test(item.text || ''))) return 'HIGH';
    if (items.some(item => medium.test(item.text || ''))) return 'ELEVATED';
    return items.length ? 'NORMAL' : 'UNKNOWN';
  }

  function briefing(state = read()) {
    const fresh = freshness(state);
    if (fresh.className !== 'live') {
      return { tone: 'wait', title: 'DATA ' + fresh.label, lines: ['Briefing ditahan sampai data market kembali segar.'] };
    }
    const { bsl, ssl } = nearestLevels(state);
    const bslDist = bsl ? Math.abs(Number(bsl.distance)) : Infinity;
    const sslDist = ssl ? Math.abs(Number(ssl.distance)) : Infinity;
    const heatmapPressure = String(state.heatmap?.summary?.pressure || '');
    const pressure = bslDist < sslDist ? 'ABOVE PRICE'
      : sslDist < bslDist ? 'BELOW PRICE'
        : heatmapPressure || 'BALANCED';
    const draw = bslDist < sslDist ? bsl : sslDist < bslDist ? ssl : (bsl || ssl);
    const mapping = state.mapping || {};
    const action = mapping.direction || mapping.status || 'WAIT';
    return {
      tone: String(action).includes('BUY') ? 'buy' : String(action).includes('SELL') ? 'sell' : 'wait',
      title: 'RULE-BASED MARKET BRIEFING',
      lines: [
        `Liquidity pressure: ${pressure}`,
        `Nearest draw: ${draw ? `${draw.type} ${Number(draw.price).toFixed(2)}` : 'WAITING DATA'}`,
        `Mapping: ${mapping.bias || 'WAIT'} · ${action}`,
        `News risk: ${newsRisk(state)} · ${sessionInfo().label}`
      ]
    };
  }

  function mountStrip(target) {
    if (!target) return;
    const paint = () => {
      const state = read();
      const { bsl, ssl } = nearestLevels(state);
      const fresh = freshness(state);
      const price = bestCurrentPrice(state);
      target.innerHTML = `
        <div class="amy-command-main"><span>XAU/USD</span><strong>${price ? price.toFixed(2) : '--'}</strong></div>
        <div class="amy-command-metric"><small>SESSION</small><b>${sessionInfo().id}</b></div>
        <div class="amy-command-metric"><small>BSL</small><b class="red">${bsl ? Number(bsl.price).toFixed(2) : '--'}</b></div>
        <div class="amy-command-metric"><small>SSL</small><b class="green">${ssl ? Number(ssl.price).toFixed(2) : '--'}</b></div>
        <div class="amy-command-metric"><small>NEWS</small><b>${newsRisk(state)}</b></div>
        <div class="amy-data-state ${fresh.className}"><i></i>${fresh.label}</div>`;
    };
    paint();
    window.addEventListener('amyfx:market-update', paint);
    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    target._amyPaint = paint;
  }

  function mountBriefing(target) {
    if (!target) return;
    const paint = () => {
      const data = briefing();
      target.className = `amy-briefing ${data.tone}`;
      target.innerHTML = `<div class="amy-briefing-title">${data.title}</div>${data.lines.map(line => `<div>${line}</div>`).join('')}`;
    };
    paint();
    window.addEventListener('amyfx:market-update', paint);
    target._amyPaint = paint;
  }

  window.AmyFXIntel = {
    read,
    write,
    sessionInfo,
    freshness,
    nearestLevels,
    bestCurrentPrice,
    newsRisk,
    briefing,
    mountStrip,
    mountBriefing
  };
})();
