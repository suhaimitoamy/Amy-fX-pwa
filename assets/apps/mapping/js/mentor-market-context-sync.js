import { state } from './main.js';

(function () {
  if (window.__amyFxMentorMarketContextSyncV1) return;
  window.__amyFxMentorMarketContextSyncV1 = true;

  let scheduled = false;
  let lastSignature = '';

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function activeStatus(watch) {
    if (!watch) return 'INACTIVE';
    return watch.active && !watch.terminal ? 'ACTIVE' : String(watch.status || 'INACTIVE');
  }

  function watchZone(watch) {
    const kind = String(watch?.sourceKind || '').toUpperCase();
    if (!['FVG', 'IFVG', 'ORDER_BLOCK', 'BREAKER_BLOCK'].includes(kind)) return null;
    const low = finite(watch.bottom ?? watch.level);
    const high = finite(watch.top ?? watch.level);
    if (low === null || high === null) return null;
    return {
      id: watch.id || watch.watchId || '',
      kind,
      type: kind,
      low: Math.min(low, high),
      high: Math.max(low, high),
      bottom: Math.min(low, high),
      top: Math.max(low, high),
      price: finite(watch.level) ?? (low + high) / 2,
      status: activeStatus(watch),
      active: Boolean(watch.active && !watch.terminal),
      timeframe: String(watch.sourceTf || state.tf || 'M15').toUpperCase(),
      source: 'ENTRY_WATCH',
      updatedAt: Number(watch.updatedAt || Date.now())
    };
  }

  function sourceCandleTime(result, watch) {
    const tf = String(watch?.sourceTf || result?.tf || state.tf || 'M15').toUpperCase();
    const candleTime = Number(state.candles?.[tf]?.at(-1)?.time || 0);
    return candleTime > 0 ? candleTime * 1000 : null;
  }

  function sync() {
    const intel = window.AmyFXIntel;
    const result = state.result;
    if (!intel?.write || !result) return;

    const previous = intel.read?.()?.mapping || {};
    const concepts = result.marketConcepts || {};
    const watch = result.entryWatch || null;
    const synthetic = watchZone(watch);
    const fairValueGaps = [
      ...(Array.isArray(concepts.nearestFairValueGaps) ? concepts.nearestFairValueGaps : []),
      ...(synthetic && /FVG/.test(synthetic.kind) ? [synthetic] : [])
    ];
    const orderBlocks = [
      ...(Array.isArray(concepts.nearestOrderBlocks) ? concepts.nearestOrderBlocks : []),
      ...(synthetic && /BLOCK/.test(synthetic.kind) ? [synthetic] : [])
    ];

    const nextZones = {
      ...(previous.zones || {}),
      FVG: fairValueGaps.length ? fairValueGaps : (previous.zones?.FVG || []),
      OB: orderBlocks.length ? orderBlocks : (previous.zones?.OB || [])
    };
    const signature = JSON.stringify({
      tf: result.tf || state.tf,
      watch: watch ? [watch.id || watch.watchId, watch.sourceTf, watch.sourceKind, watch.bottom, watch.top, watch.level, watch.status, watch.active, watch.terminal] : null,
      fvg: nextZones.FVG.map(item => [item.id, item.bottom ?? item.low, item.top ?? item.high, item.status, item.active]),
      ob: nextZones.OB.map(item => [item.id, item.bottom ?? item.low, item.top ?? item.high, item.status, item.active])
    });
    if (signature === lastSignature) return;
    lastSignature = signature;

    intel.write('mapping', {
      ...previous,
      timeframe: result.tf || previous.timeframe || state.tf,
      entryWatch: watch,
      marketConcepts: concepts,
      zones: nextZones,
      sourceCandleTime: sourceCandleTime(result, watch) || previous.sourceCandleTime,
      contextSyncVersion: 'MENTOR_MARKET_CONTEXT_V1'
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      sync();
    }, 0);
  }

  window.addEventListener('amyfx:entry-watch-updated', schedule);
  window.addEventListener('amyfx:candles-updated', schedule);
  window.addEventListener('amyfx:mapping-state-change', schedule);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
})();
