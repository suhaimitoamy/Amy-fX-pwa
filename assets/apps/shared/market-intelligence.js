(function () {
  if (window.AmyFXIntel) return;

  const contract = window.AmyFXMarketContract;
  if (!contract) {
    console.error('AmyFXMarketContract must load before market-intelligence.js');
    return;
  }

  function sessionInfo(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date).split(':').map(Number);
    const minutes = parts[0] * 60 + parts[1];
    if (minutes >= 6 * 60 && minutes < 14 * 60) return { id: 'ASIA', label: 'ASIA ACTIVE' };
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

  function briefing(state = contract.read()) {
    const quoteFreshness = freshness(state);
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
      const quote = state.quote || {};
      const quoteFreshness = contract.assess('quote', quote);
      const levels = contract.nearestLevels(state);
      const price = contract.bestCurrentPrice(state);
      target.innerHTML = `<div class="amy-command-main"><span>XAU/USD</span><strong>${priceText(price)}</strong></div>`
        + `<div class="amy-command-metric"><small>SESSION</small><b>${sessionInfo().id}</b></div>`
        + `<div class="amy-command-metric"><small>BSL</small><b class="red" title="${levels.bsl?.freshness || 'UNAVAILABLE'}" data-freshness="${levels.bsl?.freshness || 'UNAVAILABLE'}">${levelText(levels.bsl)}</b></div>`
        + `<div class="amy-command-metric"><small>SSL</small><b class="green" title="${levels.ssl?.freshness || 'UNAVAILABLE'}" data-freshness="${levels.ssl?.freshness || 'UNAVAILABLE'}">${levelText(levels.ssl)}</b></div>`
        + `<div class="amy-data-state ${quoteFreshness.className}" data-domain="quote" data-freshness="${quoteFreshness.state}"><i></i>${quoteFreshness.label}</div>`;
    };

    paint();
    window.addEventListener('amyfx:market-update', paint);
    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    window.addEventListener('storage', event => {
      if (event.key === contract.storeKey) {
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
    window.addEventListener('storage', event => {
      if (event.key === contract.storeKey) paint();
    });
    target._amyPaint = paint;
  }

  contract.syncGlobals();
  window.AmyFXIntel = Object.freeze({
    version: '2.0.0',
    read: contract.read,
    write: contract.write,
    syncGlobals: contract.syncGlobals,
    partTimestamp: contract.partTimestamp,
    assessFreshness: contract.assess,
    sessionInfo,
    freshness,
    nearestLevels: contract.nearestLevels,
    bestCurrentPrice: contract.bestCurrentPrice,
    conflicts: contract.conflicts,
    snapshot: contract.snapshot,
    newsRisk,
    briefing,
    mountStrip,
    mountBriefing,
    __amyCanonicalMarketContractV2: true
  });
})();
