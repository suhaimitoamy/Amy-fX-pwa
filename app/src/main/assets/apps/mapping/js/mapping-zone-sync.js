import { state, p2 } from './main.js';
import {
  conceptZoneLiveStatus,
  detectMarketConcepts
} from './engine/concept-engine.js';

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4'];
const cache = new Map();
let patching = false;
let timer = 0;
let observer = null;

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function candleSignature(candles) {
  const list = Array.isArray(candles) ? candles : [];
  const last = list.at(-1);
  return `${list.length}:${last?.time || 0}:${last?.close || 0}`;
}

function conceptSignature(tf) {
  return [
    tf,
    candleSignature(state.candles?.[tf]),
    candleSignature(state.candles?.H4),
    candleSignature(state.candles?.D1),
    Number(state.price || 0).toFixed(4)
  ].join('|');
}

function conceptsFor(tf) {
  const signature = conceptSignature(tf);
  const cached = cache.get(tf);
  if (cached?.signature === signature) return cached.value;
  const value = detectMarketConcepts(state.candles?.[tf] || [], {
    tf,
    currentPrice: Number(state.price || 0),
    htfCandles: {
      H4: state.candles?.H4,
      D1: state.candles?.D1,
      W1: state.candles?.W1
    },
    htfBias: tf === state.result?.tf ? state.result?.htfNarrative?.htfBias : 'NEUTRAL'
  });
  cache.set(tf, { signature, value });
  if (tf === state.result?.tf) {
    state.result.marketConcepts = value;
    state.result.mappingZones = value.mappingZones;
  }
  return value;
}

function distanceText(zone) {
  if (!Number.isFinite(zone?.distance)) return '';
  if (zone.distance === 0) return 'Harga berada di dalam zona';
  return `Jarak ${p2(zone.distance)}`;
}

function zoneLabel(zone) {
  if (zone?.kind === 'BREAKER_OB') return 'Breaker OB';
  if (zone?.kind === 'ORDER_BLOCK') return 'OB';
  if (zone?.kind === 'IFVG') return 'IFVG';
  return 'FVG';
}

function zoneItem(zone) {
  const status = conceptZoneLiveStatus(zone, state.price);
  const rawStatus = String(zone.status || 'DETECTED');
  const statusClass = rawStatus === 'INVALID' ? 'invalid'
    : rawStatus.includes('TESTING') ? 'testing'
      : rawStatus.includes('CONFIRMED') ? 'confirmed'
        : zone.converted ? 'breaker' : 'waiting';
  return `<div class="indicator-zone-item ${String(zone.direction).toLowerCase()} ${statusClass}">
    <div class="indicator-zone-main">
      <b>${safeText(zone.direction)} ${safeText(zoneLabel(zone))} · ${p2(zone.bottom)}–${p2(zone.top)}</b>
      <span>${safeText(rawStatus.replaceAll('_', ' '))} · ${safeText(status)}</span>
    </div>
    <small>${safeText(distanceText(zone))}</small>
  </div>`;
}

function zoneListMarkup(kind, zones) {
  const title = kind === 'ORDER_BLOCK' ? 'Order Block / Breaker' : 'FVG / IFVG';
  if (!zones.length) {
    return `<div class="indicator-zone-group empty"><small>${title}</small><p>Belum ada zona yang lolos filter konfirmasi Amy Concept Engine.</p></div>`;
  }
  return `<div class="indicator-zone-group"><small>${title} terdekat</small>${zones.map(zoneItem).join('')}</div>`;
}

function patchIntegrityRow(row) {
  const tf = row.querySelector('.integrity-row-head .tf, :scope > .tf')?.textContent?.trim();
  if (!TIMEFRAMES.includes(tf)) return;
  const target = row.querySelector('.integrity-zone-grid');
  if (!target) return;
  const zones = conceptsFor(tf).mappingZones;
  const signature = JSON.stringify({
    price: Number(state.price || 0).toFixed(2),
    ob: zones.nearestOrderBlocks.map(item => [item.kind, item.direction, item.bottom, item.top, item.status]),
    fvg: zones.nearestFairValueGaps.map(item => [item.kind, item.direction, item.bottom, item.top, item.status])
  });
  if (target.dataset.conceptZoneSignature === signature) return;
  target.dataset.conceptZoneSignature = signature;
  target.classList.add('indicator-zone-grid');
  target.innerHTML = `${zoneListMarkup('ORDER_BLOCK', zones.nearestOrderBlocks)}${zoneListMarkup('FVG', zones.nearestFairValueGaps)}`;
}

function compactZone(zone) {
  if (!zone) return 'Belum ada zona terkonfirmasi';
  return `${zone.direction} ${zoneLabel(zone)} ${p2(zone.bottom)}–${p2(zone.top)} · ${conceptZoneLiveStatus(zone, state.price)}`;
}

function patchLegacyTable() {
  document.querySelectorAll('.map-table tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    const tf = cells[0]?.textContent?.trim();
    if (!TIMEFRAMES.includes(tf) || cells.length < 6) return;
    const zones = conceptsFor(tf).mappingZones;
    const obText = zones.nearestOrderBlocks.map(compactZone).join('<br>') || 'Belum ada zona terkonfirmasi';
    const fvgText = zones.nearestFairValueGaps.map(compactZone).join('<br>') || 'Belum ada zona terkonfirmasi';
    if (cells[4].dataset.conceptZoneText !== obText) {
      cells[4].dataset.conceptZoneText = obText;
      cells[4].innerHTML = obText;
    }
    if (cells[5].dataset.conceptZoneText !== fvgText) {
      cells[5].dataset.conceptZoneText = fvgText;
      cells[5].innerHTML = fvgText;
    }
  });
}

function patchExplanation() {
  const result = state.result;
  if (!result) return;
  const concepts = conceptsFor(result.tf || state.tf || 'M15');
  const target = [...document.querySelectorAll('.integrity-explanation-body p')]
    .find(item => item.textContent.trim().startsWith('4. Likuiditas dan zona'));
  if (!target) return;

  const draw = concepts.liquidityHierarchy.drawTarget;
  const sweep = concepts.latestConfirmedSweep;
  const liquidity = draw
    ? `${draw.type} ${p2(draw.level)} adalah target liquidity aktif terdekat, bukan sinyal arah.`
    : 'Belum ada target BSL/SSL aktif yang belum tersapu.';
  const sweepText = sweep
    ? `${sweep.type || sweep.concept} ${p2(sweep.level)} telah terkonfirmasi dengan reclaim ${p2(sweep.reclaimDepthAtr)} ATR.`
    : 'Belum ada sweep dengan reclaim minimal 0,4 ATR.';
  const ob = concepts.nearestOrderBlocks.map(compactZone).join('<br>') || 'Belum ada OB/Breaker tervalidasi.';
  const fvg = concepts.nearestFairValueGaps.map(compactZone).join('<br>') || 'Belum ada FVG/IFVG tervalidasi.';
  const html = `<b>4. Likuiditas dan zona</b><br>${safeText(liquidity)}<br>${safeText(sweepText)}<br><b>OB / Breaker:</b><br>${ob}<br><b>FVG / IFVG:</b><br>${fvg}`;
  if (target.dataset.conceptZoneExplanation === html) return;
  target.dataset.conceptZoneExplanation = html;
  target.innerHTML = html;
}

function patchAll() {
  if (patching || state.tab !== 'Analyze') return;
  patching = true;
  try {
    document.querySelectorAll('.integrity-map-row').forEach(patchIntegrityRow);
    patchLegacyTable();
    patchExplanation();
  } finally {
    patching = false;
  }
}

function boot() {
  patchAll();
  clearInterval(timer);
  timer = setInterval(patchAll, 1500);
  const app = document.getElementById('app');
  if (app) {
    observer?.disconnect();
    observer = new MutationObserver(() => queueMicrotask(patchAll));
    observer.observe(app, { childList: true, subtree: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) patchAll();
  });
}

window.AmyIndicatorZones = {
  detect: tf => conceptsFor(tf || state.tf).mappingZones,
  concepts: tf => conceptsFor(tf || state.tf),
  refresh: patchAll,
  source: 'AMY_CONCEPT_ENGINE_V2'
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
