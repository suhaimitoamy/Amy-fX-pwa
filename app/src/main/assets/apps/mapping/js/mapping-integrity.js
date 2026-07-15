import { state, TF, p2 } from './main.js';
import { analyze } from './engine/ict-core.js';
import { sendTargetsToNative } from './bridge/android-bridge.js';
import {
  applyLiveLiquidity,
  candleFreshness,
  classifyBreak,
  deriveBiasView,
  executionGuidance,
  filterActionableSetups,
  sanitizeCandleValues,
  timeframeRole,
  zoneLiveStatus
} from './integrity/mapping-integrity-core.js';

const TWELVE_DATA_PATH = '/api/twelvedata';
const qualityByInterval = {};
const originalFetch = window.fetch.bind(window);
let trackedResult = null;
let liveHigh = 0;
let liveLow = 0;
let lastIntegritySignature = '';
let lastUiSignature = '';
let patchTimer = 0;
let reconcileBusy = false;

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function interceptCandleFeed() {
  if (window.__amyMappingCandleIntegrityFetch) return;
  window.__amyMappingCandleIntegrityFetch = true;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const rawUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const url = new URL(rawUrl, location.href);
      const outputSize = Number(url.searchParams.get('outputsize') || 0);
      if (!url.pathname.endsWith(TWELVE_DATA_PATH) || outputSize <= 1 || !response.ok) return response;

      const payload = await response.clone().json();
      if (!Array.isArray(payload?.values)) return response;
      const interval = url.searchParams.get('interval') || payload.meta?.interval || '15min';
      const cleaned = sanitizeCandleValues(payload.values, interval);
      qualityByInterval[interval] = cleaned.quality;
      state.candleMeta = { ...(state.candleMeta || {}), [interval]: cleaned.quality };

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({
        ...payload,
        values: cleaned.values,
        amy_quality: cleaned.quality
      }), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };
}

function resultSignature(result) {
  const targets = (result?.activeLiquidityTargets || [])
    .map(item => `${item.type}:${Number(item.level).toFixed(2)}`)
    .join('|');
  return [
    result?.tf,
    result?.bsl,
    result?.ssl,
    result?.bestSetup?.type,
    result?.bestSetup?.status,
    result?.setups?.length,
    result?.st?.last?.breakType,
    targets
  ].join('~');
}

function setupHistorySource(result) {
  if (!Array.isArray(result.allSetups)) {
    result.allSetups = Array.isArray(result.setups) ? [...result.setups] : [];
  }
  return result.allSetups;
}

function reconcileResult(force = false) {
  if (reconcileBusy || !state.result) return;
  reconcileBusy = true;
  try {
    const result = state.result;
    const price = Number(state.price || result.price || 0);
    const isNewResult = trackedResult !== result;
    if (isNewResult) {
      trackedResult = result;
      liveHigh = price;
      liveLow = price;
    } else if (price > 0) {
      liveHigh = Math.max(liveHigh || price, price);
      liveLow = Math.min(liveLow || price, price);
    }

    applyLiveLiquidity(result, { price, high: liveHigh, low: liveLow });
    const allSetups = setupHistorySource(result);
    const actionable = filterActionableSetups(allSetups, Date.now(), price);
    result.setups = actionable;
    result.bestSetup = actionable.find(item => item === result.bestSetup)
      || actionable.sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0]
      || null;
    result.signal = result.bestSetup?.dir || 'WAIT';
    result.mappingIntegrity = {
      version: '1.3.7',
      localStructure: result.st?.trend || 'NEUTRAL',
      htfBias: result.htfNarrative?.htfBias || 'NEUTRAL',
      actionableCount: actionable.length,
      checkedAt: Date.now()
    };

    const signature = resultSignature(result);
    const changed = signature !== lastIntegritySignature;
    lastIntegritySignature = signature;

    if (isNewResult || changed || force) {
      if (typeof window.render === 'function') window.render();
      publishCorrectedSnapshot(result);
      try { sendTargetsToNative(); } catch (_) {}
    }
    scheduleUiPatch();
  } finally {
    reconcileBusy = false;
  }
}

function publishCorrectedSnapshot(result) {
  const intel = window.AmyFXIntel;
  if (!intel?.write) return;
  intel.write('mapping', {
    price: Number(state.price || result.price || 0),
    bsl: Number(result.bsl || 0),
    ssl: Number(result.ssl || 0),
    levels: result.activeLiquidityTargets || [],
    timeframe: result.tf || state.tf,
    bias: result.final || 'WAIT',
    localStructure: result.st?.trend || 'NEUTRAL',
    htfBias: result.htfNarrative?.htfBias || 'NEUTRAL',
    direction: result.bestSetup?.dir || 'WAIT',
    status: result.bestSetup?.status || 'WAIT',
    analyzedAt: Date.now()
  });
}

function findDisclosure(label) {
  return [...document.querySelectorAll('details.disclosure')]
    .find(details => details.querySelector(':scope > summary')?.textContent.trim().startsWith(label));
}

function breakMarkup(result) {
  const info = result?.st?.last;
  const classification = classifyBreak(info, result?.st?.trend || 'NEUTRAL');
  if (!info) {
    return `<section class="card integrity-break"><div class="kicker">VALID BREAK INFO</div><h2>${classification.title}</h2><div class="break-reason">${classification.explanation}</div></section>`;
  }
  const displacement = info.hasDisplacement
    ? classification.isConfirmed ? 'KUAT + TERKONFIRMASI' : 'KUAT, TETAPI BREAK BELUM SAH'
    : 'TIDAK CUKUP KUAT';
  const attemptLabel = classification.state === 'SWEEP'
    ? `${classification.attempt} ATTEMPT / LIQUIDITY SWEEP`
    : `${info.kind || 'STRUCTURE'} ${classification.attempt}`;
  return `<section class="card integrity-break ${classification.state.toLowerCase()}">
    <div class="kicker">VALID BREAK INFO</div>
    <h2>${safeText(classification.title)}</h2>
    <div class="integrity-break-grid">
      <div><small>Level yang diuji</small><strong>${p2(info.price)}</strong></div>
      <div><small>High / Low candle</small><strong>${p2(info.candleHigh)} / ${p2(info.candleLow)}</strong></div>
      <div><small>Candle close</small><strong>${p2(info.candleClose)}</strong></div>
      <div><small>Harga live</small><strong>${p2(state.price)}</strong></div>
      <div><small>Percobaan struktur</small><strong>${safeText(attemptLabel)}</strong></div>
      <div><small>Struktur terkonfirmasi</small><strong>${safeText(classification.confirmedTrend)}</strong></div>
      <div class="wide"><small>Displacement</small><strong>${safeText(displacement)} · body ratio ${p2(info.bodyRatio)}</strong></div>
    </div>
    <div class="break-reason"><b>Kesimpulan:</b><br>${safeText(classification.explanation)}</div>
  </section>`;
}

function parseZone(concept, fallbackName) {
  const detail = concept?.[2] || '';
  const match = String(detail).match(/(BULLISH|BEARISH)\s+([0-9.]+)\s*-\s*([0-9.]+)/i);
  if (!match) return null;
  return {
    name: fallbackName,
    type: match[1].toUpperCase(),
    bottom: Number(match[2]),
    top: Number(match[3]),
    status: concept?.[1] === 'ACTIVE' ? 'ACTIVE' : concept?.[1] || 'ACTIVE'
  };
}

function concept(result, name) {
  return (result?.concepts || []).find(item => item[0] === name) || null;
}

function miniAnalysis(tf) {
  const candles = state.candles?.[tf] || [];
  if (candles.length < 30) return null;
  try {
    const result = analyze(candles, tf, {}, Number(state.price || 0), {
      H4: state.candles?.H4,
      D1: state.candles?.D1,
      W1: state.candles?.W1
    });
    applyLiveLiquidity(result, { price: state.price, high: liveHigh, low: liveLow });
    result.allSetups = result.setups || [];
    result.setups = filterActionableSetups(result.allSetups, Date.now(), state.price);
    result.bestSetup = result.setups[0] || null;
    return result;
  } catch (_) {
    return null;
  }
}

function roleAction(tf, result) {
  const role = timeframeRole(tf);
  if (!result) return { role, action: 'DATA BELUM CUKUP' };
  if (tf !== 'M15') return { role, action: 'KONTEKS SAJA' };
  const setup = result.bestSetup;
  return { role, action: setup ? `${setup.type} · ${setup.status}` : 'TUNGGU KONFIRMASI M15' };
}

function zoneMarkup(zone, price) {
  if (!zone) return '<span class="muted">Tidak ada zona aktif di harga sekarang</span>';
  return `<span class="zone ${zone.type.toLowerCase()}">${zone.type} ${p2(zone.bottom)}–${p2(zone.top)}</span><small>${zoneLiveStatus(zone, price)}</small>`;
}

function mappingMarkup() {
  const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4'];
  const rows = timeframes.map(tf => {
    const result = miniAnalysis(tf);
    if (!result) {
      return `<article class="integrity-map-row"><div class="tf">${tf}</div><div class="empty">Data belum cukup</div></article>`;
    }
    const bias = deriveBiasView(result);
    const action = roleAction(tf, result);
    const ob = parseZone(concept(result, 'OB'), 'OB');
    const fvg = parseZone(concept(result, 'FVG'), 'FVG');
    const freshness = candleFreshness(qualityByInterval[TF[tf]] || state.candleMeta?.[TF[tf]], tf);
    return `<article class="integrity-map-row ${tf === 'M15' ? 'execution' : ''}">
      <div class="integrity-row-head"><strong class="tf">${tf}</strong><span class="role">${action.role}</span><span class="fresh ${freshness.state.toLowerCase()}">${freshness.label}</span></div>
      <div class="integrity-bias-grid">
        <div><small>Struktur lokal</small><strong class="${bias.local.toLowerCase()}">${bias.local}</strong></div>
        <div><small>Bias HTF</small><strong class="${bias.htf.toLowerCase()}">${bias.htf}</strong></div>
        <div><small>Keselarasan</small><strong>${bias.alignment}</strong></div>
        <div><small>Peran</small><strong>${action.action}</strong></div>
      </div>
      <div class="integrity-level-grid"><div><small>BSL aktif</small><strong>${result.bsl ? p2(result.bsl) : 'SUDAH TERSAPU / BELUM ADA'}</strong></div><div><small>SSL aktif</small><strong>${result.ssl ? p2(result.ssl) : 'SUDAH TERSAPU / BELUM ADA'}</strong></div></div>
      <div class="integrity-zone-grid"><div><small>Order Block</small>${zoneMarkup(ob, state.price)}</div><div><small>Fair Value Gap</small>${zoneMarkup(fvg, state.price)}</div></div>
    </article>`;
  }).join('');

  const m15Quality = qualityByInterval[TF.M15] || state.candleMeta?.[TF.M15];
  const qualityNote = m15Quality
    ? `M15: ${m15Quality.cleanCount}/${m15Quality.rawCount} candle dipakai${m15Quality.frozenRemoved ? ` · ${m15Quality.frozenRemoved} candle beku dibuang` : ''}${m15Quality.duplicates ? ` · ${m15Quality.duplicates} duplikat dibuang` : ''}.`
    : 'Metadata kualitas candle belum tersedia; mapping memakai cache saat ini.';

  return `<section class="card integrity-mapping"><div class="kicker">M1–H4 MAPPING</div><h2>Struktur Lokal · Bias HTF · Status Live</h2><p class="integrity-quality-note">${safeText(qualityNote)}</p><div class="integrity-map-list">${rows}</div></section>`;
}

function explanationMarkup(result) {
  const bias = deriveBiasView(result);
  const breakState = classifyBreak(result?.st?.last, bias.local);
  const active = filterActionableSetups(result?.allSetups || result?.setups || [], Date.now(), state.price);
  const guidance = executionGuidance(bias.htf, result?.premiumDiscountZone || result?.zone, active.length > 0);
  const target = result?.liquidityHierarchy?.drawTarget;
  const ob = parseZone(concept(result, 'OB'), 'OB');
  const fvg = parseZone(concept(result, 'FVG'), 'FVG');
  const location = result?.premiumDiscountZone || result?.zone || 'EQUILIBRIUM';
  const setupText = active.length
    ? `Ada ${active.length} setup M15 actionable. Setup utama: ${active[0].type}, area ${p2(active[0].entryLow)}–${p2(active[0].entryHigh)}, invalidasi ${p2(active[0].sl)}.`
    : 'Tidak ada setup M15 actionable. Setup WAIT, INVALID, context-only, atau RR di bawah 1:2 tidak dihitung aktif.';
  const targetText = target
    ? `${target.type} ${p2(target.level)} masih aktif dan berada pada sisi harga yang benar.`
    : 'Tidak ada target BSL/SSL aktif yang masih valid pada sisi harga sekarang.';

  return `<section class="card integrity-explanation"><div class="kicker">PENJELASAN MAPPING</div><h2>Apa yang Sedang Terjadi?</h2><div class="integrity-explanation-body">
    <p><b>1. Konteks besar</b><br>Bias HTF: <b>${bias.htf}</b>. Struktur lokal ${result.tf}: <b>${bias.local}</b>. Hasil gabungan mesin: <b>${bias.composite}</b>, dengan kondisi <b>${bias.alignment}</b>.</p>
    <p><b>2. Lokasi harga</b><br>Harga ${p2(state.price)} berada di <b>${location}</b>. Bias tidak sama dengan perintah entry. ${safeText(guidance)}</p>
    <p><b>3. Konfirmasi struktur</b><br><b>${safeText(breakState.title)}</b>. ${safeText(breakState.explanation)}</p>
    <p><b>4. Likuiditas dan zona</b><br>${safeText(targetText)}<br>OB: ${ob ? `${ob.type} ${p2(ob.bottom)}–${p2(ob.top)} · ${zoneLiveStatus(ob, state.price)}` : 'tidak ada zona aktif di harga sekarang'}.<br>FVG: ${fvg ? `${fvg.type} ${p2(fvg.bottom)}–${p2(fvg.top)} · ${zoneLiveStatus(fvg, state.price)}` : 'tidak ada zona aktif di harga sekarang'}.</p>
    <p><b>5. Tindakan sekarang</b><br>${safeText(setupText)}</p>
    <p class="integrity-conclusion"><b>Kesimpulan</b><br>${active.length ? '<b>PANTAU SETUP M15</b> — tunggu harga masuk area dan hormati invalidasi.' : '<b>TUNGGU</b> — belum ada alasan yang cukup aman untuk entry.'}</p>
  </div></section>`;
}

function patchDisclosure(details, markup) {
  if (!details) return;
  const summary = details.querySelector(':scope > summary');
  const existing = [...details.children].filter(child => child !== summary);
  existing.forEach(child => child.remove());
  summary.insertAdjacentHTML('afterend', markup);
}

function patchHeaderFreshness() {
  const connection = document.getElementById('conn');
  if (!connection) return;
  const freshness = candleFreshness(qualityByInterval[TF.M15] || state.candleMeta?.[TF.M15], 'M15');
  const base = state.conn === 'Connected' ? 'Connected' : state.conn;
  connection.textContent = state.conn === 'Connected' ? `${base} · ${freshness.state === 'STALE' ? 'M15 Stale' : 'M15 Fresh'}` : base;
  connection.classList.toggle('stale', freshness.state === 'STALE');
}

function uiSignature() {
  const result = state.result;
  return [
    resultSignature(result),
    Number(state.price || 0).toFixed(2),
    state.tab,
    document.querySelectorAll('details.disclosure').length,
    JSON.stringify(qualityByInterval)
  ].join('::');
}

function patchUi(force = false) {
  const result = state.result;
  patchHeaderFreshness();
  if (!result || state.tab !== 'Analyze') return;
  const signature = uiSignature();
  if (!force && signature === lastUiSignature) return;
  lastUiSignature = signature;

  patchDisclosure(findDisclosure('Valid Break'), breakMarkup(result));
  patchDisclosure(findDisclosure('Mapping M1–H4'), mappingMarkup());
  patchDisclosure(findDisclosure('Penjelasan Mapping'), explanationMarkup(result));
  const activeDetails = findDisclosure('Setup Aktif');
  const summary = activeDetails?.querySelector(':scope > summary');
  if (summary) summary.textContent = `Setup Aktif (${result.setups?.length || 0})`;
}

function scheduleUiPatch() {
  clearTimeout(patchTimer);
  patchTimer = setTimeout(() => patchUi(), 30);
}

function boot() {
  reconcileResult(true);
  patchUi(true);
  setInterval(() => {
    reconcileResult();
    patchUi();
  }, 750);
  document.addEventListener('click', () => setTimeout(() => patchUi(true), 20), true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      reconcileResult(true);
      patchUi(true);
    }
  });
}

interceptCandleFeed();
window.AmyMappingIntegrity = {
  qualityByInterval,
  reconcile: () => reconcileResult(true),
  patch: () => patchUi(true)
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
