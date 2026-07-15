(function () {
  const API_BASE = 'https://amy-fx.vercel.app/api';
  const SNAPSHOT_KEY = 'amy_heatmap_dynamic_snapshot_v2';
  const REFRESH_MS = 20 * 1000;
  let controller = null;
  let timer = 0;
  let lastPayload = null;
  let livePaintQueued = false;
  let enginePromise = null;

  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function number(value, fallback = NaN) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function p2(value) {
    const parsed = number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : '--';
  }

  function loadEngine() {
    if (!enginePromise) enginePromise = import('./heatmap-core.mjs');
    return enginePromise;
  }

  function readSnapshot() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function zoneKey(zone) {
    return String(zone?.key || `${zone?.role || zone?.liquidityType || 'ZONE'}:${p2(zone?.price)}`);
  }

  function writeSnapshot(payload) {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
        currentPrice: payload.currentPrice,
        updated: payload.updated,
        zones: (payload.zones || []).filter(zone => !zone.isCurrent).map(zone => ({
          key: zoneKey(zone),
          score: number(zone.score, number(zone.totalActivity, 0)),
          active: zone.active !== false,
          status: zone.status,
          role: zone.role,
          price: zone.price
        }))
      }));
    } catch (_) {}
  }

  function compareZones(zones, previous) {
    const oldMap = new Map((previous?.zones || []).map(zone => [zone.key, zone]));
    return (zones || []).map(zone => {
      if (zone.isCurrent) return { ...zone, change: 'LIVE', delta: 0 };
      const old = oldMap.get(zoneKey(zone));
      if (!old) return { ...zone, change: 'BARU', delta: null };
      const score = number(zone.score, number(zone.totalActivity, 0));
      const delta = score - number(old.score, 0);
      let change = 'STABIL';
      if (old.active && zone.active === false) change = 'DITEMBUS';
      else if (old.status !== zone.status || old.role !== zone.role) change = 'BERUBAH';
      else if (delta >= 0.35) change = 'MENGUAT';
      else if (delta <= -0.35) change = 'MELEMAH';
      return { ...zone, change, delta };
    });
  }

  function bestStoredPrice() {
    try {
      const state = window.AmyFXIntel?.read?.() || {};
      if (window.AmyFXIntel?.bestCurrentPrice) return number(window.AmyFXIntel.bestCurrentPrice(state));
      const candidates = [
        [state.mapping?.storedAt, state.mapping?.price],
        [state.liquidity?.storedAt, state.liquidity?.currentPrice],
        [state.heatmap?.storedAt, state.heatmap?.currentPrice]
      ]
        .map(([storedAt, price]) => ({ storedAt: number(storedAt, 0), price: number(price) }))
        .filter(item => item.storedAt > 0 && Number.isFinite(item.price))
        .sort((a, b) => b.storedAt - a.storedAt);
      return candidates[0]?.price;
    } catch (_) {
      return NaN;
    }
  }

  function sourceTimeText(value) {
    if (!value) return 'waktu candle tidak tersedia';
    const text = String(value);
    const timePart = text.includes(' ') ? text.split(' ').at(-1) : '';
    if (/^\d{2}:\d{2}/.test(timePart)) return `candle ${timePart.slice(0, 5)}`;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `candle ${new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(parsed)} WIB`;
    }
    return `candle ${text}`;
  }

  function updatedText(value) {
    const parsed = new Date(value || Date.now());
    if (Number.isNaN(parsed.getTime())) return 'baru saja';
    const seconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
    if (seconds < 15) return 'baru saja';
    if (seconds < 60) return `${seconds} detik lalu`;
    return `${Math.floor(seconds / 60)} menit lalu`;
  }

  function statusLabel(status) {
    return ({
      ACTIVE: 'AKTIF',
      PRICE_INSIDE: 'HARGA DI ZONA',
      POLARITY_FLIP: 'POLARITY FLIP',
      SWEPT_RECLAIMED: 'SWEEP + RECLAIM',
      BROKEN: 'SUDAH DITEMBUS',
      HISTORICAL: 'HISTORIS',
      LIVE_PRICE: 'LIVE'
    })[status] || String(status || 'AKTIF').replaceAll('_', ' ');
  }

  function changeMarkup(zone) {
    if (zone.isCurrent) return '<span class="heat-change live">LIVE</span>';
    const delta = number(zone.delta);
    const suffix = Number.isFinite(delta) && Math.abs(delta) >= 0.05
      ? ` ${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '';
    const className = zone.change === 'MENGUAT' || zone.change === 'BARU' ? 'up'
      : zone.change === 'MELEMAH' || zone.change === 'DITEMBUS' ? 'down'
        : zone.change === 'BERUBAH' ? 'shift' : 'flat';
    return `<span class="heat-change ${className}">${safeText(zone.change || 'STABIL')}${safeText(suffix)}</span>`;
  }

  function roleClass(zone) {
    if (zone.isCurrent) return 'current';
    if (zone.role === 'SUPPORT') return 'support';
    if (zone.role === 'RESISTANCE') return 'resistance';
    return 'mixed';
  }

  function intensityPercent(zone) {
    if (zone.isCurrent) return 100;
    return Math.max(7, Math.min(100, Math.round(number(zone.intensity, 0.08) * 100)));
  }

  function rowMarkup(zone) {
    const score = number(zone.score, number(zone.totalActivity, 0));
    const levelType = zone.liquidityType ? `${zone.liquidityType} · ` : '';
    const distance = zone.isCurrent ? '' : `${number(zone.distance, 0) >= 0 ? '+' : ''}${p2(zone.distance)}`;
    const statusClass = String(zone.status || '').toLowerCase().replaceAll('_', '-');
    return `<div class="dynamic-heat-row ${roleClass(zone)} status-${statusClass}">
      <div class="dynamic-heat-price">
        <strong>${p2(zone.price)}</strong>
        ${zone.isCurrent ? '<span>◀</span>' : `<small>${safeText(distance)}</small>`}
      </div>
      <div class="dynamic-heat-body">
        <div class="dynamic-heat-title">
          <b>${safeText(levelType + (zone.label || zone.role || 'ZONA'))}</b>
          ${changeMarkup(zone)}
        </div>
        <div class="dynamic-heat-track"><i style="--heat:${intensityPercent(zone)}%"></i></div>
        <div class="dynamic-heat-detail">
          <span>${safeText(statusLabel(zone.status))}</span>
          ${zone.isCurrent ? '<span>Harga berjalan</span>' : `<span>Skor ${score.toFixed(1)} · ${Number(zone.recentTouches || 0)} sentuhan baru</span>`}
        </div>
      </div>
    </div>`;
  }

  function movementText(currentPrice, previousPrice) {
    const movement = number(currentPrice) - number(previousPrice);
    if (!Number.isFinite(movement) || !Number.isFinite(number(previousPrice))) return 'Belum ada pembanding';
    if (Math.abs(movement) < 0.01) return 'Harga relatif tetap';
    return `${movement > 0 ? 'Naik' : 'Turun'} ${Math.abs(movement).toFixed(2)} sejak refresh sebelumnya`;
  }

  function ensureSummary(payload, previous) {
    const canvas = document.getElementById('heatmap-canvas');
    if (!canvas) return;
    let target = document.getElementById('dynamic-heat-summary');
    if (!target) {
      target = document.createElement('div');
      target.id = 'dynamic-heat-summary';
      canvas.parentNode.insertBefore(target, canvas);
    }
    const summary = payload.summary || {};
    const draw = summary.nearestDraw;
    target.innerHTML = `<div class="dynamic-heat-summary">
      <div><small>TEKANAN</small><strong>${safeText(summary.pressure || 'BALANCED')}</strong></div>
      <div><small>DRAW TERDEKAT</small><strong>${draw ? `${safeText(draw.type)} ${p2(draw.price)}` : 'Belum ada'}</strong></div>
      <div><small>ZONA AKTIF</small><strong>${Number(summary.activeZones || 0)}</strong></div>
      <div><small>PERGERAKAN</small><strong>${safeText(movementText(payload.currentPrice, previous.currentPrice))}</strong></div>
    </div>`;
  }

  function renderDynamicHeatmap(payload, previous = {}) {
    const canvas = document.getElementById('heatmap-canvas');
    if (!canvas) return;
    const storedPrice = bestStoredPrice();
    const livePrice = Number.isFinite(storedPrice) ? storedPrice : number(payload.currentPrice);
    const zonesWithoutCurrent = (payload.zones || []).filter(zone => !zone.isCurrent).map(zone => ({
      ...zone,
      distance: number(zone.price) - livePrice
    }));
    const current = {
      key: 'CURRENT', isCurrent: true, price: livePrice, distance: 0,
      role: 'CURRENT', status: 'LIVE_PRICE', label: 'HARGA BERJALAN', intensity: 1,
      score: 0, totalActivity: 0, recentTouches: 0, change: 'LIVE'
    };
    const zones = [...zonesWithoutCurrent, current].sort((a, b) => number(b.price) - number(a.price));

    ensureSummary({ ...payload, currentPrice: livePrice }, previous);
    canvas.classList.add('dynamic-heatmap-canvas');
    canvas.innerHTML = zones.map(rowMarkup).join('');
    const price = document.getElementById('heatmap-price');
    if (price) price.textContent = `💰 XAU/USD ${p2(livePrice)}`;
  }

  function normalizeProviderCandles(data) {
    return (Array.isArray(data?.values) ? data.values : [])
      .slice()
      .reverse()
      .map(candle => ({
        time: candle.datetime,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      }));
  }

  async function fetchComputedHeatmap(signal) {
    const slot = Math.floor(Date.now() / 15000);
    const response = await fetch(`${API_BASE}/twelvedata?interval=15min&outputsize=240&fresh=${slot}`, {
      signal,
      cache: 'no-store'
    });
    const raw = await response.json();
    if (!response.ok || raw?.status === 'error') throw new Error(raw?.message || `HTTP ${response.status}`);
    const candles = normalizeProviderCandles(raw);
    const { computeDynamicHeatmap } = await loadEngine();
    const result = computeDynamicHeatmap(candles, { swingWindow: 2, maxZonesPerSide: 6 });
    return {
      ...result,
      updated: new Date().toISOString(),
      sourceCandleTime: result.meta?.sourceCandleTime || candles.at(-1)?.time || null,
      source: 'CLIENT_DYNAMIC_ENGINE'
    };
  }

  async function loadDynamicHeatmap(silent = false) {
    const status = document.getElementById('heatmap-status');
    if (!status) return;
    if (!silent) status.textContent = '🔄 Memperbarui heatmap dinamis...';

    try {
      controller?.abort();
      controller = new AbortController();
      const data = await fetchComputedHeatmap(controller.signal);
      if (!Array.isArray(data.zones) || !data.zones.length) {
        status.textContent = '⚠️ Data candle belum cukup untuk heatmap';
        return;
      }

      const previous = readSnapshot();
      const zones = compareZones(data.zones, previous);
      lastPayload = { ...data, zones };
      renderDynamicHeatmap(lastPayload, previous);
      writeSnapshot(lastPayload);

      status.textContent = `🔥 ${Number(data.summary?.activeZones || 0)} zona aktif · ${Number(data.summary?.transitionZones || 0)} transisi · ${sourceTimeText(data.sourceCandleTime)} · ${updatedText(data.updated)}`;
      try { panelLoadedAt.heatmap = Date.now(); } catch (_) {}
      window.AmyFXIntel?.write?.('heatmap', {
        updated: data.updated,
        sourceCandleTime: data.sourceCandleTime,
        currentPrice: data.currentPrice,
        zones,
        summary: data.summary,
        meta: data.meta,
        source: data.source
      });
      if (typeof hideLoading === 'function') hideLoading();
    } catch (error) {
      if (error?.name === 'AbortError') return;
      status.textContent = '⚠️ Gagal memperbarui heatmap';
      console.error('Dynamic heatmap failed', error);
    }
  }

  function repaintFromSharedPrice() {
    if (!lastPayload || livePaintQueued) return;
    livePaintQueued = true;
    requestAnimationFrame(() => {
      livePaintQueued = false;
      renderDynamicHeatmap(lastPayload, readSnapshot());
    });
  }

  // Override fungsi lama sebelum DOMContentLoaded menjalankan loader pertama.
  window.loadHeatmap = loadDynamicHeatmap;
  window.renderHeatmap = function (zones, currentPrice) {
    const previous = readSnapshot();
    const payload = {
      currentPrice,
      zones: compareZones(zones, previous),
      summary: {},
      updated: new Date().toISOString()
    };
    lastPayload = payload;
    renderDynamicHeatmap(payload, previous);
  };

  function boot() {
    clearInterval(timer);
    timer = setInterval(() => {
      const panel = document.getElementById('panel-heatmap');
      if (!document.hidden && panel?.classList.contains('active')) loadDynamicHeatmap(true);
    }, REFRESH_MS);
    window.addEventListener('amyfx:market-update', repaintFromSharedPrice);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && document.getElementById('panel-heatmap')?.classList.contains('active')) {
        loadDynamicHeatmap(true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
