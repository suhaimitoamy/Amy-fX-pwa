import { state, p2 } from './main.js';
import { analyze } from './engine/ict-core.js';
import { SUPPORTED_MAPPING_TIMEFRAMES } from './engine/mapping-timeframes.js';
import { buildDirectionDecision, buildSetupExecution } from './api/market-data.js';
import { calculateAsiaRange } from './session/asia-range.js';

const ASIA_WINDOW = '06:00–14:00 WITA';
const SCALPER_AUTHORITY_TFS = Object.freeze(['M15', 'M5', 'M1', 'M30', 'H1']);
const SCALPER_WEIGHTS = Object.freeze({ M15: 45, M5: 25, M1: 20, M30: 5, H1: 5 });
let queued = false;
let busy = false;
let tfCacheKey = '';
let tfCache = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const num = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const positiveNum = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const dir = value => {
  const text = String(value || '').toUpperCase();
  if (text.includes('BUY') || text.includes('BULL')) return 'BUY';
  if (text.includes('SELL') || text.includes('BEAR')) return 'SELL';
  return 'WAIT';
};

const structuralDir = value => {
  const direction = dir(value);
  if (direction === 'BUY') return 'BULLISH';
  if (direction === 'SELL') return 'BEARISH';
  return 'NEUTRAL';
};

const closed = timeframe => (state.candles?.[timeframe] || [])
  .filter(candle => candle?.isClosed !== false);

function wita(value) {
  const raw = Number(value);
  if (!(raw > 0)) return '—';
  const milliseconds = raw > 1e11 ? raw : raw * 1000;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(milliseconds)).replace('.', ':');
}

function baseStructure(result) {
  const market = result?.validatedMarketContext?.marketState || result?.validatedMarketState || {};
  const direction = structuralDir(
    market.direction || market.primaryDirection || result?.st?.confirmedTrend || result?.st?.trend
  );
  const label = String(
    market.state || (
      direction === 'BULLISH' ? 'UPTREND CONFIRMED'
        : direction === 'BEARISH' ? 'DOWNTREND CONFIRMED'
          : 'RANGE / TRANSITION'
    )
  ).replaceAll('_', ' ');
  const phase = String(
    market.phase || (
      /PULLBACK/i.test(label) ? 'PULLBACK'
        : /RANGE|TRANSITION/i.test(label) ? 'TRANSITION'
          : direction === 'NEUTRAL' ? 'RANGE'
            : 'CONTINUATION'
    )
  ).replaceAll('_', ' ');
  const protectedLow = positiveNum(
    market.protectedLow,
    result?.marketConcepts?.structureSnapshot?.protectedLow,
    result?.st?.protectedLow,
    result?.mappingSnapshot?.protectedLow
  );
  const protectedHigh = positiveNum(
    market.protectedHigh,
    result?.marketConcepts?.structureSnapshot?.protectedHigh,
    result?.st?.protectedHigh,
    result?.mappingSnapshot?.protectedHigh
  );
  const invalidation = direction === 'BULLISH' ? protectedLow : direction === 'BEARISH' ? protectedHigh : null;
  const timeframe = result?.tf || state.tf;
  const rule = invalidation == null
    ? 'Belum tersedia dari protected structure.'
    : direction === 'BULLISH'
      ? `Batal bila candle ${timeframe} close di bawah ${p2(invalidation)}.`
      : `Batal bila candle ${timeframe} close di atas ${p2(invalidation)}.`;
  return { direction, label, phase, invalidation, rule, timeframe };
}

function analyzeTimeframe(timeframe) {
  const candles = closed(timeframe);
  if (candles.length < 30) return { tf: timeframe, missing: true };
  try {
    const result = analyze(candles, timeframe, {}, candles.at(-1)?.close, { ...state.candles });
    result.tf = timeframe;
    result.directionDecision ||= buildDirectionDecision(result);
    result.setupExecution ||= buildSetupExecution(result, { persist: false });
    return {
      tf: timeframe,
      result,
      s: baseStructure(result),
      f: forecast(result),
      e: permission(result),
      sourceTime: candles.at(-1)?.time || 0
    };
  } catch (error) {
    return { tf: timeframe, missing: true, error: error?.message || 'Analisis gagal.' };
  }
}

function allTfRows() {
  const key = SUPPORTED_MAPPING_TIMEFRAMES.map(timeframe => {
    const candles = closed(timeframe);
    const last = candles.at(-1);
    return `${timeframe}:${candles.length}:${last?.time || 0}:${last?.close || 0}`;
  }).join('|');
  if (key === tfCacheKey) return tfCache;
  tfCacheKey = key;
  tfCache = SUPPORTED_MAPPING_TIMEFRAMES.map(analyzeTimeframe);
  return tfCache;
}

function matchingRows(rows, direction) {
  return SCALPER_AUTHORITY_TFS
    .map(timeframe => rows.find(row => row.tf === timeframe && !row.missing && row.s?.direction === direction))
    .filter(Boolean);
}

function chooseScalperDirection(rows = allTfRows()) {
  const available = rows.filter(row => SCALPER_AUTHORITY_TFS.includes(row.tf) && !row.missing);
  const byTf = Object.fromEntries(available.map(row => [row.tf, row]));
  const directional = row => row && ['BULLISH', 'BEARISH'].includes(row.s?.direction);
  const sameAs = (row, direction) => directional(row) && row.s.direction === direction;

  let direction = 'NEUTRAL';
  let reason = 'M15, M5, dan M1 belum memberi arah scalping yang cukup jelas.';

  if (directional(byTf.M15)) {
    direction = byTf.M15.s.direction;
    reason = `M15 menjadi arah utama scalping (${direction}).`;
  } else if (directional(byTf.M5)) {
    const candidate = byTf.M5.s.direction;
    const confirmed = [byTf.M1, byTf.M30, byTf.H1].some(row => sameAs(row, candidate));
    if (confirmed) {
      direction = candidate;
      reason = `M15 belum tersedia; M5 dikonfirmasi timeframe scalping/intraday lain (${direction}).`;
    }
  }

  if (direction === 'NEUTRAL') {
    const bullishSupport = available.filter(row => row.s?.direction === 'BULLISH');
    const bearishSupport = available.filter(row => row.s?.direction === 'BEARISH');
    const bullishScore = bullishSupport.reduce((total, row) => total + (SCALPER_WEIGHTS[row.tf] || 0), 0);
    const bearishScore = bearishSupport.reduce((total, row) => total + (SCALPER_WEIGHTS[row.tf] || 0), 0);

    if (bullishSupport.length >= 2 && bullishScore >= bearishScore + 10) {
      direction = 'BULLISH';
      reason = `Arah scalping bullish dikonfirmasi ${bullishSupport.map(row => row.tf).join(' + ')}.`;
    } else if (bearishSupport.length >= 2 && bearishScore >= bullishScore + 10) {
      direction = 'BEARISH';
      reason = `Arah scalping bearish dikonfirmasi ${bearishSupport.map(row => row.tf).join(' + ')}.`;
    }
  }

  if (direction === 'NEUTRAL') {
    return {
      direction,
      label: 'SCALPING DIRECTION BELUM JELAS',
      phase: 'TRANSITION',
      invalidation: null,
      rule: 'Tunggu M15/M5/M1 memberi struktur yang jelas.',
      reason,
      sources: []
    };
  }

  const supporting = matchingRows(rows, direction);
  const anchor = supporting[0];
  const oppositeLower = ['M5', 'M1']
    .map(timeframe => byTf[timeframe])
    .filter(row => directional(row) && row.s.direction !== direction)
    .map(row => row.tf);
  const conflictText = oppositeLower.length ? ` · konflik ${oppositeLower.join(' + ')}` : '';

  return {
    direction,
    label: `${direction} SCALPING${conflictText}`,
    phase: anchor?.s?.phase || 'CONTINUATION',
    invalidation: anchor?.s?.invalidation ?? null,
    rule: anchor?.s?.rule || 'Invalidasi protected structure belum tersedia.',
    reason,
    sources: supporting.map(row => row.tf),
    anchorTimeframe: anchor?.tf || null,
    sourceTime: anchor?.sourceTime || 0
  };
}

function structure(result = state.result, { useScalperAuthority = true } = {}) {
  const base = baseStructure(result);
  if (!useScalperAuthority || result !== state.result) return base;
  const authority = chooseScalperDirection();
  if (authority.direction === 'NEUTRAL') return { ...base, authority };
  return {
    ...base,
    direction: authority.direction,
    label: authority.label,
    phase: authority.phase,
    invalidation: authority.invalidation,
    rule: authority.rule,
    authority
  };
}

function forecast(result = state.result) {
  const data = result?.validatedMarketContext?.directionForecast || result?.validatedDirectionForecast || {};
  const direction = data.active === true ? dir(data.direction) : 'WAIT';
  return {
    active: data.active === true && direction !== 'WAIT',
    direction,
    horizon: data.horizonText || data.horizon || '—'
  };
}

function permission(result = state.result) {
  const execution = result?.setupExecution || result?.entryWatch?.executionPlan || null;
  const direction = dir(execution?.direction || result?.entryWatch?.direction);
  const valid = Boolean(
    execution
    && execution.active !== false
    && execution.terminal !== true
    && result?.entryWatch?.terminal !== true
    && result?.entryWatch?.entryAllowed !== false
    && execution.alignedWithForecast !== false
    && positiveNum(execution.entryLow, execution.entry) != null
    && positiveNum(execution.stopLoss, execution.sl, execution.initialStopLoss) != null
    && positiveNum(execution.target1, execution.tp1) != null
    && direction !== 'WAIT'
  );
  return {
    value: valid ? direction : 'WAIT',
    active: valid,
    execution,
    reason: valid
      ? `Execution plan ${direction} aktif.`
      : execution?.invalidationReason
        || result?.entryMap?.scenario?.reason
        || 'Menunggu area → sweep → MSS → candle close.'
  };
}

function asia() {
  const candles = closed('M15');
  const last = candles.at(-1);
  const now = last?.time
    ? (Number(last.time) > 1e11 ? Number(last.time) : Number(last.time) * 1000) + 15 * 60000
    : Date.now();
  return calculateAsiaRange(candles, positiveNum(last?.close), now);
}

function asiaDraw(value) {
  if (!value?.valid) return value?.note || 'Asia Range belum lengkap.';
  if (value.active) return 'Asia Range masih berkembang.';
  const highTaken = ['TERSAPU WICK', 'CLOSE BREAK', 'LEWAT LIVE'].includes(value.highStatus);
  const lowTaken = ['TERSAPU WICK', 'CLOSE BREAK', 'LEWAT LIVE'].includes(value.lowStatus);
  if (highTaken && !lowTaken) return `Asia Low ${p2(value.low)} masih utuh.`;
  if (lowTaken && !highTaken) return `Asia High ${p2(value.high)} masih utuh.`;
  if (highTaken && lowTaken) return 'Kedua sisi Asia Range sudah diambil.';
  return 'Asia High dan Asia Low masih utuh.';
}

function target(result = state.result) {
  const execution = permission(result).execution;
  const targetPrice = positiveNum(execution?.target2, execution?.tp2, execution?.target1, execution?.tp1);
  if (targetPrice != null) return `Target execution ${p2(targetPrice)}`;
  const drawTarget = result?.liquidityHierarchy?.drawTarget || result?.drawTarget;
  const drawLevel = positiveNum(drawTarget?.level, drawTarget?.price);
  if (drawLevel != null) return `${drawTarget?.type || drawTarget?.label || 'Liquidity'} ${p2(drawLevel)}`;
  const info = structure(result);
  const bsl = positiveNum(result?.bsl);
  const ssl = positiveNum(result?.ssl);
  if (info.direction === 'BULLISH' && bsl != null) return `BSL ${p2(bsl)}`;
  if (info.direction === 'BEARISH' && ssl != null) return `SSL ${p2(ssl)}`;
  return 'Belum ada target struktural aktif.';
}

function sourceTime(result = state.result) {
  const authorityTime = structure(result).authority?.sourceTime;
  if (authorityTime) return authorityTime;
  return closed(result?.tf || state.tf).at(-1)?.time || 0;
}

function patch(node, signature, html) {
  if (!node || node.dataset.claritySignature === signature) return;
  node.dataset.claritySignature = signature;
  node.innerHTML = html;
}

function installStyle() {
  if (document.getElementById('amy-mapping-clarity-style')) return;
  const style = document.createElement('style');
  style.id = 'amy-mapping-clarity-style';
  style.textContent = `details[data-stability-key="active-setup"]{display:none!important}.clarity-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:10px 0}.clarity-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.clarity-cell{padding:11px;border:1px solid rgba(148,163,184,.18);border-radius:11px;background:rgba(15,23,42,.58)}.clarity-cell small{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;margin-bottom:4px}.clarity-cell strong{display:block;color:#f8fafc;font-size:13px;line-height:1.35}.clarity-cell span{display:block;color:#cbd5e1;font-size:11px;line-height:1.45;margin-top:4px}.clarity-buy strong,.clarity-bullish strong{color:#4ade80}.clarity-sell strong,.clarity-bearish strong{color:#f87171}.clarity-wait strong{color:#fbbf24}.clarity-note{padding:10px 11px;border-radius:9px;background:rgba(30,41,59,.66);color:#cbd5e1;font-size:12px;line-height:1.55;margin:9px 0}.clarity-event{border-left:3px solid #38bdf8;background:rgba(14,116,144,.10)}.clarity-table-wrap{overflow:auto}.clarity-table{width:100%;min-width:900px;border-collapse:collapse;font-size:11px}.clarity-table th,.clarity-table td{padding:8px;border-bottom:1px solid rgba(148,163,184,.14);text-align:left;vertical-align:top}.clarity-table th{color:#94a3b8;font-size:10px;text-transform:uppercase}.clarity-evidence{font-size:10px;color:#94a3b8;line-height:1.45}.clarity-glossary{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.clarity-glossary span{padding:8px;background:rgba(30,41,59,.58);border-radius:8px;font-size:10px;color:#cbd5e1}@media(max-width:640px){.clarity-grid,.clarity-grid.two,.clarity-glossary{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function authorityNote(structureInfo) {
  const authority = structureInfo.authority;
  if (!authority || authority.direction === 'NEUTRAL') return authority?.reason || 'Arah scalping belum jelas.';
  return `${authority.reason} H4/D1 tidak ikut menentukan arah scalping.`;
}

function renderOutlook() {
  const result = state.result;
  const details = document.querySelector('details[data-stability-key="market-outlook"],details.outlook-disclosure');
  if (!result || !details) return;
  const structureInfo = structure(result);
  const forecastInfo = forecast(result);
  const entryPermission = permission(result);
  const asiaInfo = asia();
  const scenarios = (result.marketOutlook?.scenarios || [])
    .filter(item => item?.setupType !== 'ASIA_ENTRY');

  if (result.marketOutlook) {
    result.marketOutlook.scenarios = scenarios;
    result.marketOutlook.canonicalAsia = {
      window: ASIA_WINDOW,
      high: asiaInfo?.high,
      low: asiaInfo?.low,
      highStatus: asiaInfo?.highStatus,
      lowStatus: asiaInfo?.lowStatus
    };
    result.marketOutlook.status = scenarios.length ? 'ACTIVE' : 'WAITING_EVENT';
  }

  const eventText = scenarios.length
    ? `${scenarios.length} event konteks aktif: ${scenarios.map(item => item.setupType).join(', ')}`
    : `Belum ada event khusus — struktur tetap ${structureInfo.direction}`;
  const badge = details.querySelector('.amy-level-summary-status');
  if (badge) badge.textContent = `${structureInfo.direction} · ${entryPermission.active ? entryPermission.value : 'WAIT ENTRY'}`;

  let panel = details.querySelector('.amy-trade-scenario-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'amy-trade-scenario-panel';
    details.appendChild(panel);
  }

  const signature = JSON.stringify([
    sourceTime(result), structureInfo, forecastInfo, entryPermission.value,
    asiaInfo?.high, asiaInfo?.low, asiaInfo?.highStatus, asiaInfo?.lowStatus,
    scenarios.map(item => [item.setupType, item.side, item.target])
  ]);

  patch(panel, signature, `<section class="amy-level-panel ${entryPermission.active ? '' : 'waiting'}">
    <p class="amy-level-intro">Arah scalping memakai M15 → M5 → M1. M30/H1 hanya fallback; H4/D1 tidak ikut voting.</p>
    <div class="clarity-grid">
      <div class="clarity-cell clarity-${structureInfo.direction.toLowerCase()}"><small>Arah Scalping</small><strong>${esc(structureInfo.label)}</strong><span>${esc(authorityNote(structureInfo))}</span></div>
      <div class="clarity-cell clarity-${forecastInfo.direction.toLowerCase()}"><small>Forecast</small><strong>${forecastInfo.active ? esc(forecastInfo.direction) : 'BELUM AKTIF'}</strong><span>${forecastInfo.active ? `Horizon ${esc(forecastInfo.horizon)}` : 'Tidak menghapus arah scalping.'}</span></div>
      <div class="clarity-cell clarity-${entryPermission.value.toLowerCase()}"><small>Entry Permission</small><strong>${esc(entryPermission.value)}</strong><span>${esc(entryPermission.reason)}</span></div>
    </div>
    <div class="clarity-note clarity-event"><b>Status event:</b> ${esc(eventText)}.</div>
    <div class="clarity-grid two">
      <div class="clarity-cell"><small>Invalidasi Struktur</small><strong>${structureInfo.invalidation == null ? 'BELUM TERSEDIA' : p2(structureInfo.invalidation)}</strong><span>${esc(structureInfo.rule)}</span></div>
      <div class="clarity-cell"><small>Target Struktural</small><strong>${esc(target(result))}</strong></div>
    </div>
    <div class="clarity-note"><b>Asia Session Context · ${ASIA_WINDOW}</b><br>${asiaInfo?.valid ? `High ${p2(asiaInfo.high)} (${esc(asiaInfo.highStatus)}) · Low ${p2(asiaInfo.low)} (${esc(asiaInfo.lowStatus)}). ${esc(asiaDraw(asiaInfo))}` : esc(asiaInfo?.note || 'Belum tersedia.')}</div>
    <p class="amy-level-disclaimer">WAIT berarti belum ada izin entry, bukan market netral.</p>
  </section>`);
}

function renderSummary() {
  const result = state.result;
  const card = document.getElementById('amy-regime-router-v3');
  if (!result || !card) return;
  const structureInfo = structure(result);
  const forecastInfo = forecast(result);
  const entryPermission = permission(result);
  const source = sourceTime(result);

  card.querySelectorAll('.validated-context-strip,.reliability-grid').forEach(node => {
    if (!node.classList.contains('clarity-summary')) node.style.display = 'none';
  });
  card.querySelectorAll('.professional-disclosure').forEach(node => {
    if (/Performa Historis Model/i.test(node.textContent || '')) node.style.display = 'none';
  });

  let host = card.querySelector('.clarity-summary');
  if (!host) {
    host = document.createElement('div');
    host.className = 'clarity-summary';
    (card.querySelector('.regime-header') || card.firstElementChild)?.insertAdjacentElement('afterend', host);
  }

  patch(host, JSON.stringify([source, structureInfo, forecastInfo, entryPermission.value, target(result)]), `<div class="market-health-title"><span>RINGKASAN MARKET</span><small>Arah scalping, forecast, izin entry, dan batas salah</small></div>
    <div class="clarity-grid two">
      <div class="clarity-cell clarity-${structureInfo.direction.toLowerCase()}"><small>Arah Scalping</small><strong>${esc(structureInfo.label)}</strong><span>${esc(authorityNote(structureInfo))}</span></div>
      <div class="clarity-cell clarity-${forecastInfo.direction.toLowerCase()}"><small>Forecast</small><strong>${forecastInfo.active ? esc(forecastInfo.direction) : 'BELUM AKTIF'}</strong><span>${forecastInfo.active ? esc(forecastInfo.horizon) : 'Tidak menghapus arah scalping.'}</span></div>
      <div class="clarity-cell clarity-${entryPermission.value.toLowerCase()}"><small>Entry Permission</small><strong>${esc(entryPermission.value)}</strong><span>${esc(entryPermission.reason)}</span></div>
      <div class="clarity-cell"><small>Invalidasi Struktur</small><strong>${structureInfo.invalidation == null ? 'BELUM TERSEDIA' : p2(structureInfo.invalidation)}</strong><span>${esc(structureInfo.rule)}</span></div>
      <div class="clarity-cell"><small>Target Likuiditas</small><strong>${esc(target(result))}</strong></div>
      <div class="clarity-cell"><small>Sumber Analisis</small><strong>${esc(wita(source))} WITA</strong><span>Candle sudah close.</span></div>
    </div>`);
}

function renderExplanation() {
  const result = state.result;
  const details = document.querySelector('details[data-stability-key="mapping-explanation"]');
  if (!result || !details) return;
  const structureInfo = structure(result);
  const forecastInfo = forecast(result);
  const entryPermission = permission(result);
  const asiaInfo = asia();
  const source = sourceTime(result);
  let host = details.querySelector('.clarity-explanation');
  if (!host) {
    [...details.children].forEach(child => {
      if (child.tagName !== 'SUMMARY') child.remove();
    });
    host = document.createElement('section');
    host.className = 'card clarity-explanation';
    details.appendChild(host);
  }

  patch(host, JSON.stringify([source, structureInfo, forecastInfo, entryPermission.value, asiaInfo?.high, asiaInfo?.low]), `<div class="kicker">PENJELASAN MAPPING</div><h2>Apa yang Sedang Terjadi?</h2>
    <div class="clarity-note"><b>1. Arah scalping:</b> ${esc(structureInfo.label)}. ${esc(authorityNote(structureInfo))}</div>
    <div class="clarity-note"><b>2. Forecast:</b> ${forecastInfo.active ? `${esc(forecastInfo.direction)} · ${esc(forecastInfo.horizon)}` : 'Belum aktif; arah scalping tetap berlaku.'}</div>
    <div class="clarity-note"><b>3. Entry Permission:</b> ${esc(entryPermission.value)} — ${esc(entryPermission.reason)}</div>
    <div class="clarity-note"><b>4. Invalidasi:</b> ${esc(structureInfo.rule)}</div>
    <div class="clarity-note"><b>5. Target:</b> ${esc(target(result))}</div>
    <div class="clarity-note"><b>6. Asia ${ASIA_WINDOW}:</b> ${asiaInfo?.valid ? `High ${p2(asiaInfo.high)} (${esc(asiaInfo.highStatus)}), Low ${p2(asiaInfo.low)} (${esc(asiaInfo.lowStatus)}). ${esc(asiaDraw(asiaInfo))}` : esc(asiaInfo?.note || 'Belum tersedia.')}</div>
    <div class="clarity-note clarity-event"><b>Kesimpulan:</b> ${entryPermission.active ? `Izin ${entryPermission.value} aktif.` : `Arah ${structureInfo.direction}; entry masih WAIT.`}</div>
    <p class="clarity-evidence">Sumber ${esc(wita(source))} WITA.</p>`);
}

function renderAllTf() {
  const details = document.querySelector('details[data-stability-key="mapping-all-timeframes"]');
  if (!details) return;
  const rows = allTfRows();
  let host = details.querySelector('.clarity-all-tf');
  if (!host) {
    [...details.children].forEach(child => {
      if (child.tagName !== 'SUMMARY') child.remove();
    });
    host = document.createElement('section');
    host.className = 'card clarity-all-tf';
    details.appendChild(host);
  }

  const body = rows.map(row => row.missing
    ? `<tr><td><b>${esc(row.tf)}</b></td><td colspan="6">${esc(row.error || 'Belum dimuat')}</td></tr>`
    : `<tr><td><b>${esc(row.tf)}</b></td><td><b>${esc(row.s.direction)}</b><br>${esc(row.s.label)}</td><td>${esc(row.s.phase)}</td><td>${row.s.invalidation == null ? '—' : p2(row.s.invalidation)}<br><small>${esc(row.s.rule)}</small></td><td>${row.f.active ? esc(row.f.direction) : 'BELUM AKTIF'}<br><small>${row.f.active ? esc(row.f.horizon) : 'Struktur tetap berlaku'}</small></td><td><b>${esc(row.e.value)}</b></td><td>${esc(row.e.reason)}</td></tr>`
  ).join('');

  const authority = chooseScalperDirection(rows);
  patch(host, JSON.stringify([rows, authority]), `<div class="kicker">ALL-TIMEFRAME MAPPING</div><h2>Struktur • Forecast • Entry Permission</h2>
    <p class="clarity-note"><b>Arah scalping:</b> ${esc(authority.label)} — ${esc(authority.reason)} H4/D1 hanya informasi tambahan dan tidak ikut voting.</p>
    <p class="clarity-note">WAIT pada Forecast atau Entry Permission tidak menghapus struktur bullish/bearish.</p>
    <div class="clarity-table-wrap"><table class="clarity-table"><thead><tr><th>TF</th><th>Struktur Saat Ini</th><th>Fase</th><th>Invalidasi</th><th>Forecast</th><th>Entry Permission</th><th>Alasan</th></tr></thead><tbody>${body}</tbody></table></div>`);
}

function cleanup() {
  document.querySelectorAll('details[data-stability-key="active-setup"]').forEach(node => node.remove());
  document.querySelectorAll('#app details').forEach(node => {
    if (String(node.querySelector(':scope>summary')?.textContent || '').trim().startsWith('Setup Aktif')) node.remove();
  });
  document.querySelectorAll('[data-asia-range-analyze] .asia-strip-head span')
    .forEach(node => { node.textContent = 'ASIA SESSION CONTEXT'; });
  document.querySelectorAll('[data-asia-range-analyze],[data-asia-range-dashboard]')
    .forEach(node => { node.dataset.canonicalAsiaWindow = ASIA_WINDOW; });
  const section = document.querySelector('details[data-stability-key="valid-break"] section');
  if (section && !section.querySelector('.clarity-glossary')) {
    const box = document.createElement('div');
    box.className = 'clarity-glossary';
    box.innerHTML = '<span><b>INTERNAL:</b> transisi awal.</span><span><b>MAJOR:</b> struktur utama confirmed.</span><span><b>AT RISK:</b> break terancam gagal.</span><span><b>FAILED:</b> close kembali melewati level.</span>';
    section.appendChild(box);
  }
}

function sync() {
  queued = false;
  if (busy) return;
  busy = true;
  try {
    installStyle();
    cleanup();
    renderOutlook();
    renderSummary();
    renderExplanation();
    renderAllTf();
  } finally {
    busy = false;
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sync);
}

function boot() {
  installStyle();
  const app = document.getElementById('app');
  if (app) {
    new MutationObserver(records => {
      if (records.some(record => record.target === app)) schedule();
    }).observe(app, { childList: true, subtree: false });
  }
  [
    'amyfx:candles-updated',
    'amyfx:mapping-state-change',
    'amyfx:entry-watch-updated',
    'amyfx:execution-authority-updated'
  ].forEach(name => window.addEventListener(name, schedule));
  schedule();
}

window.AmyFXMappingClarity = Object.freeze({
  version: '1.2.0',
  canonicalAsiaWindow: ASIA_WINDOW,
  scalperAuthorityTimeframes: SCALPER_AUTHORITY_TFS,
  refresh: schedule,
  snapshot: () => ({
    structure: structure(),
    forecast: forecast(),
    entryPermission: permission().value,
    asia: asia(),
    scalperAuthority: chooseScalperDirection()
  })
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
