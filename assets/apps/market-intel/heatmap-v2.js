(function () {
  const API_BASE = 'https://amy-fx.vercel.app/api';
  const SNAPSHOT_KEY = 'amy_heatmap_dynamic_snapshot_v2';
  const REFRESH_MS = 20 * 1000;
  let controller = null;
  let timer = 0;
  let lastPayload = null;
  let livePaintQueued = false;
  let enginePromise = null;
  let activeFilter = 'all';

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
        schemaVersion: 3,
        currentPrice: payload.currentPrice,
        sourceCandleTime: payload.sourceCandleTime,
        computedAt: payload.computedAt,
        storedAt: new Date().toISOString(),
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
      if (zone.isCurrent) return zone;
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

  function canonicalQuote(payload) {
    const contract = window.AmyFXMarketContract;
    const state = contract?.read?.() || window.AmyFXIntel?.read?.() || {};
    const quote = state.quote || {};
    const freshness = contract?.assess?.('quote', quote) || window.AmyFXIntel?.freshness?.(state) || { state: 'EXPIRED' };
    const officialPrice = number(contract?.bestCurrentPrice?.(state) || window.AmyFXIntel?.bestCurrentPrice?.(state));
    const modelPrice = number(payload?.currentPrice);
    return {
      price: Number.isFinite(officialPrice) && officialPrice > 0 ? officialPrice : modelPrice,
      official: Number.isFinite(officialPrice) && officialPrice > 0,
      state: freshness.state || freshness.label || 'EXPIRED',
      capturedAt: quote.capturedAt || null
    };
  }

  function sourceTimeText(value) {
    if (!value) return 'waktu candle tidak tersedia';
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `candle ${new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(parsed)} WITA`;
    }
    return `candle ${String(value)}`;
  }

  function updatedText(value) {
    const parsed = new Date(value || 0);
    if (Number.isNaN(parsed.getTime())) return 'waktu hitung tidak tersedia';
    const seconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
    if (seconds < 15) return 'baru dihitung';
    if (seconds < 60) return `dihitung ${seconds} detik lalu`;
    return `dihitung ${Math.floor(seconds / 60)} menit lalu`;
  }

  function statusLabel(status) {
    return ({
      ACTIVE: 'AKTIF', PRICE_INSIDE: 'HARGA DI ZONA', POLARITY_FLIP: 'POLARITY FLIP',
      SWEPT_RECLAIMED: 'SWEEP + RECLAIM', BROKEN: 'SUDAH DITEMBUS', HISTORICAL: 'HISTORIS',
      LIVE_PRICE: 'LIVE', STALE_PRICE: 'STALE', EXPIRED_PRICE: 'EXPIRED', OFFLINE_PRICE: 'OFFLINE',
      MODEL_PRICE: 'REFERENSI MODEL'
    })[status] || String(status || 'AKTIF').replaceAll('_', ' ');
  }

  function changeMarkup(zone) {
    if (zone.isCurrent) {
      const state = safeText(zone.change || 'EXPIRED');
      return `<span class="heat-change ${state === 'LIVE' ? 'live' : 'flat'}">${state}</span>`;
    }
    const delta = number(zone.delta);
    const suffix = Number.isFinite(delta) && Math.abs(delta) >= 0.05 ? ` ${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '';
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

  function zoneExplanation(zone) {
    if (zone.isCurrent) return zone.quoteState === 'LIVE'
      ? 'Harga resmi XAU/USD dari quote M1.'
      : `Harga terakhir ditampilkan dengan status ${zone.quoteState}; bukan quote live.`;
    const score = number(zone.score, 0);
    const densityLabel = score >= 7 ? 'Sangat Tebal' : score >= 4 ? 'Sedang' : 'Tipis';
    if (zone.role === 'SUPPORT') return `Area Pembeli (${densityLabel}) · Potensi memantul naik saat diuji.`;
    if (zone.role === 'RESISTANCE') return `Area Penjual (${densityLabel}) · Potensi memantul turun saat diuji.`;
    return 'Zona konsentrasi likuiditas hasil model candle M15.';
  }

  function rowMarkup(zone) {
    const score = number(zone.score, number(zone.totalActivity, 0));
    const levelType = zone.liquidityType ? `${zone.liquidityType} · ` : '';
    const distance = zone.isCurrent ? '' : `${number(zone.distance, 0) >= 0 ? '+' : ''}${p2(zone.distance)}`;
    const statusClass = String(zone.status || '').toLowerCase().replaceAll('_', '-');
    const intensity = intensityPercent(zone);
    const isHot = intensity >= 75 ? 'hot-spot' : intensity >= 40 ? 'medium-spot' : 'low-spot';
    return `<div class="dynamic-heat-row ${roleClass(zone)} status-${statusClass} ${isHot}">
      <div class="dynamic-heat-price"><strong>${p2(zone.price)}</strong>${zone.isCurrent ? '<span>◀</span>' : `<small>${safeText(distance)}</small>`}</div>
      <div class="dynamic-heat-body">
        <div class="dynamic-heat-title"><b>${safeText(levelType + (zone.label || zone.role || 'ZONA'))}</b>${changeMarkup(zone)}</div>
        <div class="dynamic-heat-track"><i style="--heat:${intensity}%"></i></div>
        <div class="dynamic-heat-detail"><span>${safeText(statusLabel(zone.status))} · ${intensity}% KEPADATAN</span>${zone.isCurrent ? `<span>${safeText(zone.quoteState)}</span>` : `<span>Skor ${score.toFixed(1)} · ${Number(zone.recentTouches || 0)}x sentuhan</span>`}</div>
        <div class="dynamic-heat-expanded" style="display:none;margin-top:8px;"><p style="margin:0 0 8px 0;font-size:12px;color:var(--muted);">${safeText(zoneExplanation(zone))}</p>${zone.isCurrent ? '' : `<button class="btn sm heat-alert-btn" data-price="${p2(zone.price)}" data-role="${safeText(zone.role)}">🔔 Pasang Alert Level $${p2(zone.price)}</button>`}</div>
      </div>
    </div>`;
  }

  function ensureSummary(payload, previous, quote) {
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
      <div><small>DRAW MODEL</small><strong>${draw ? `${safeText(draw.type)} ${p2(draw.price)}` : 'Belum ada'}</strong></div>
      <div><small>ZONA AKTIF</small><strong>${Number(summary.activeZones || 0)}</strong></div>
      <div><small>QUOTE</small><strong>${safeText(quote.state)}</strong></div>
    </div>
    <div class="heat-filter-toolbar">
      <button class="heat-filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">Semua Zona</button>
      <button class="heat-filter-btn ${activeFilter === 'hot' ? 'active' : ''}" data-filter="hot">🔴 Hot Spots</button>
      <button class="heat-filter-btn ${activeFilter === 'dynamic' ? 'active' : ''}" data-filter="dynamic">⚡ Reaksi / Sweep</button>
    </div>`;
    target.querySelectorAll('.heat-filter-btn').forEach(btn => {
      btn.onclick = () => {
        activeFilter = btn.dataset.filter;
        if (lastPayload) renderDynamicHeatmap(lastPayload, previous);
      };
    });
  }

  function renderDynamicHeatmap(payload, previous = {}) {
    const canvas = document.getElementById('heatmap-canvas');
    if (!canvas) return;
    const quote = canonicalQuote(payload);
    const price = quote.price;
    const zonesWithoutCurrent = (payload.zones || []).filter(zone => !zone.isCurrent).map(zone => ({
      ...zone,
      distance: number(zone.price) - price
    }));
    const quoteState = quote.official ? quote.state : 'MODEL';
    const current = {
      key: 'CURRENT', isCurrent: true, price, distance: 0, role: 'CURRENT',
      status: quoteState === 'LIVE' ? 'LIVE_PRICE' : quoteState === 'STALE' ? 'STALE_PRICE' : quoteState === 'OFFLINE' ? 'OFFLINE_PRICE' : quoteState === 'MODEL' ? 'MODEL_PRICE' : 'EXPIRED_PRICE',
      label: quoteState === 'LIVE' ? 'HARGA BERJALAN' : quoteState === 'MODEL' ? 'REFERENSI MODEL' : 'HARGA TERAKHIR',
      intensity: 1, score: 0, totalActivity: 0, recentTouches: 0,
      change: quoteState, quoteState
    };
    let filtered = zonesWithoutCurrent;
    if (activeFilter === 'hot') filtered = zonesWithoutCurrent.filter(zone => intensityPercent(zone) >= 40);
    else if (activeFilter === 'dynamic') filtered = zonesWithoutCurrent.filter(zone => ['MENGUAT', 'MELEMAH', 'BARU', 'BERUBAH', 'DITEMBUS'].includes(zone.change) || ['POLARITY_FLIP', 'SWEPT_RECLAIMED'].includes(zone.status));
    const zones = [...filtered, current].sort((left, right) => number(right.price) - number(left.price));
    ensureSummary({ ...payload, currentPrice: price }, previous, quote);
    canvas.classList.add('dynamic-heatmap-canvas');
    canvas.innerHTML = zones.map(rowMarkup).join('');
    const priceNode = document.getElementById('heatmap-price');
    if (priceNode) priceNode.textContent = `XAU/USD ${p2(price)} · ${quoteState}`;
    canvas.querySelectorAll('.dynamic-heat-row').forEach(row => {
      row.onclick = event => {
        if (event.target.closest('.heat-alert-btn')) return;
        const detail = row.querySelector('.dynamic-heat-expanded');
        if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
      };
    });
    canvas.querySelectorAll('.heat-alert-btn').forEach(btn => {
      btn.onclick = event => {
        event.stopPropagation();
        try {
          const alerts = JSON.parse(localStorage.getItem('amy_heatmap_alerts') || '[]');
          alerts.push({ price: btn.dataset.price, role: btn.dataset.role, created: Date.now() });
          localStorage.setItem('amy_heatmap_alerts', JSON.stringify(alerts.slice(-20)));
        } catch (_) {}
      };
    });
  }

  function normalizeProviderCandles(data) {
    return (Array.isArray(data?.values) ? data.values : []).slice().reverse().map(candle => ({
      time: candle.datetime,
      open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close)
    }));
  }

  async function fetchComputedHeatmap(signal) {
    const slot = Math.floor(Date.now() / 15000);
    const response = await fetch(`${API_BASE}/twelvedata?interval=15min&outputsize=240&fresh=${slot}`, { signal, cache: 'no-store' });
    const raw = await response.json();
    if (!response.ok || raw?.status === 'error') throw new Error(raw?.message || `HTTP ${response.status}`);
    const candles = normalizeProviderCandles(raw);
    const { computeDynamicHeatmap } = await loadEngine();
    const result = computeDynamicHeatmap(candles, { swingWindow: 2, maxZonesPerSide: 6 });
    return {
      ...result,
      computedAt: new Date().toISOString(),
      sourceCandleTime: result.meta?.sourceCandleTime || candles.at(-1)?.time || null,
      source: 'CLIENT_DYNAMIC_ENGINE'
    };
  }

  async function loadDynamicHeatmap(silent = false) {
    const status = document.getElementById('heatmap-status');
    if (!status) return;
    if (!silent) status.textContent = 'Memperbarui heatmap dinamis...';
    try {
      controller?.abort();
      controller = new AbortController();
      const data = await fetchComputedHeatmap(controller.signal);
      if (!Array.isArray(data.zones) || !data.zones.length) {
        status.textContent = 'Data candle belum cukup untuk heatmap';
        return;
      }
      const previous = readSnapshot();
      const zones = compareZones(data.zones, previous);
      lastPayload = { ...data, zones };
      renderDynamicHeatmap(lastPayload, previous);
      writeSnapshot(lastPayload);
      status.textContent = `${Number(data.summary?.activeZones || 0)} zona aktif · ${sourceTimeText(data.sourceCandleTime)} · ${updatedText(data.computedAt)}`;
      try { panelLoadedAt.heatmap = Date.now(); } catch (_) {}
      window.AmyFXIntel?.write?.('heatmap', {
        sourceCandleTime: data.sourceCandleTime,
        computedAt: data.computedAt,
        currentPrice: data.currentPrice,
        zones,
        summary: data.summary,
        meta: data.meta,
        source: data.source
      });
      if (typeof hideLoading === 'function') hideLoading();
    } catch (error) {
      if (error?.name === 'AbortError') return;
      status.textContent = 'Gagal memperbarui heatmap';
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

  window.loadHeatmap = loadDynamicHeatmap;
  window.renderHeatmap = function (zones, currentPrice) {
    const previous = readSnapshot();
    const payload = {
      currentPrice,
      zones: compareZones(zones, previous),
      summary: {},
      sourceCandleTime: null,
      computedAt: new Date().toISOString()
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
      if (!document.hidden && document.getElementById('panel-heatmap')?.classList.contains('active')) loadDynamicHeatmap(true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
