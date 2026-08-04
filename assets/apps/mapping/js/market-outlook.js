import { state, p2 } from './main.js';
import { buildAmyMarketContextOutlook } from './outlook/amy-market-context-final-core.js';

const OPEN_KEY = 'amy_mapping_outlook_open';
const SUMMARY_TITLE = 'Market Outlook';
let lastSourceSignature = '';
let lastSemanticSignature = '';
let lastPublishSignature = '';
let lastResult = null;
let copyListenerInstalled = false;

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceText(value) {
  return number(value) == null ? '—' : p2(value);
}

function normalizedDirection(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('BUY') || text.includes('BULL')) return 'BUY';
  if (text.includes('SELL') || text.includes('BEAR')) return 'SELL';
  return 'WAIT';
}

function timestampMs(value) {
  const numeric = number(value);
  if (numeric == null || numeric <= 0) return 0;
  return numeric > 100000000000 ? numeric : numeric * 1000;
}

function formatWita(value) {
  const timestamp = timestampMs(value);
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function currentTab() {
  return state?.tab || localStorage.getItem('amy_mapping_tab') || '';
}

function closedCandles(tf) {
  return (Array.isArray(state.candles?.[tf]) ? state.candles[tf] : [])
    .filter(candle => candle?.isClosed !== false);
}

function candleFingerprint(tf) {
  const values = closedCandles(tf);
  const candle = values.at(-1);
  return [
    tf,
    values.length,
    timestampMs(candle?.time),
    number(candle?.open),
    number(candle?.high),
    number(candle?.low),
    number(candle?.close)
  ];
}

function sourceSignature() {
  return JSON.stringify({
    symbol: state?.result?.symbol || 'XAUUSD',
    tf: state.tf,
    candles: ['M1', 'M5', 'M15', 'H1', 'H4', 'D1']
      .map(candleFingerprint)
  });
}

function officialExecution() {
  const result = state.result || {};
  const execution = result.setupExecution || result.entryWatch?.executionPlan || null;
  const watch = result.entryWatch || {};
  const direction = normalizedDirection(execution?.direction || watch?.direction);
  const geometryValid = execution?.geometryValid !== false
    && number(execution?.entryLow ?? execution?.entry) != null
    && number(execution?.stopLoss ?? execution?.sl) != null
    && number(execution?.target1 ?? execution?.tp1) != null;
  const entryAllowed = watch.entryAllowed === true
    || (execution?.active === true && watch.entryAllowed !== false);
  const active = Boolean(
    execution
    && execution.active !== false
    && execution.terminal !== true
    && watch.terminal !== true
    && entryAllowed
    && geometryValid
    && ['BUY', 'SELL'].includes(direction)
    && execution.alignedWithForecast !== false
  );
  return { execution, watch, direction, geometryValid, entryAllowed, active };
}

function forecastDirection(result = state.result) {
  const forecast = result?.validatedMarketContext?.directionForecast
    || result?.validatedDirectionForecast;
  return forecast?.active ? normalizedDirection(forecast.direction) : 'WAIT';
}

function marketStateDirection(result = state.result) {
  return normalizedDirection(
    result?.validatedMarketContext?.marketState?.direction
    || result?.validatedMarketState?.direction
    || result?.st?.confirmedTrend
    || result?.st?.trend
  );
}

function marketCondition(result = state.result) {
  const stateText = result?.validatedMarketContext?.marketState?.state
    || result?.validatedMarketState?.state
    || result?.st?.confirmedTrend
    || result?.st?.trend
    || 'RANGE / TRANSITION';
  return String(stateText).replaceAll('_', ' ');
}

function mappingVsScalperConflict(result = state.result) {
  const mappingDecision = result?.mappingContextBeforeScalper?.directionDecision
    || result?.directionDecision;
  const mappingDirection = normalizedDirection(mappingDecision?.signal || mappingDecision?.bias);
  const scalperDirection = normalizedDirection(
    result?.scalperExecutionAuthority?.setupExecution?.direction
    || result?.executionDirectionDecision?.signal
  );
  const conflict = ['BUY', 'SELL'].includes(mappingDirection)
    && ['BUY', 'SELL'].includes(scalperDirection)
    && mappingDirection !== scalperDirection;
  return { conflict, mappingDirection, scalperDirection };
}

function zoneRange(zone) {
  if (!zone) return null;
  const low = number(zone.bottom ?? zone.low ?? zone.zoneLow);
  const high = number(zone.top ?? zone.high ?? zone.zoneHigh);
  if (low == null || high == null) return null;
  return `${priceText(Math.min(low, high))}–${priceText(Math.max(low, high))}`;
}

function nearestArea(result = state.result, generated = lastResult) {
  const execution = officialExecution().execution;
  const entryLow = number(execution?.entryLow ?? execution?.entry);
  const entryHigh = number(execution?.entryHigh ?? execution?.entry);
  if (entryLow != null && entryHigh != null) {
    return `Area entry resmi ${priceText(Math.min(entryLow, entryHigh))}–${priceText(Math.max(entryLow, entryHigh))}`;
  }

  const zones = [
    ...(result?.mappingZones?.nearestOrderBlocks || []),
    ...(result?.mappingZones?.nearestFairValueGaps || []),
    ...(result?.marketConcepts?.nearestOrderBlocks || []),
    ...(result?.marketConcepts?.nearestFairValueGaps || [])
  ];
  const zone = zones.find(item => zoneRange(item));
  if (zone) return `${zone.kind || 'Zona Mapping'} ${zoneRange(zone)}`;

  const scenario = generated?.scenarios?.find(item => zoneRange(item));
  if (scenario) return `${scenario.setupType || 'Zona konteks'} ${zoneRange(scenario)}`;
  return 'Belum ada zona resmi yang cukup dekat.';
}

function positionText(result = state.result) {
  const location = result?.entryMap?.scenario?.location
    || result?.entryMap?.location
    || result?.dealingLocation;
  const entryZone = location?.entryLocation?.zone;
  const poiZone = location?.poiLocation?.zone;
  const sweepZone = location?.sweepLocation?.zone || location?.zone;
  if (entryZone) return `Lokasi entry: ${String(entryZone).replaceAll('_', ' ')}.`;
  if (poiZone) return `Lokasi POI: ${String(poiZone).replaceAll('_', ' ')}.`;
  if (sweepZone) return `Lokasi sweep: ${String(sweepZone).replaceAll('_', ' ')}; entry belum dianggap valid hanya dari sweep.`;
  return 'Lokasi entry belum lengkap; Mapping masih menunggu struktur causal.';
}

function waitingText(result = state.result) {
  const scenario = result?.entryMap?.scenario || result?.entryWatch?.scenario || {};
  const missing = Array.isArray(scenario.missing) ? scenario.missing.filter(Boolean) : [];
  if (missing.length) return `Menunggu: ${missing.join(', ')}.`;
  if (scenario.reason) return scenario.reason;
  if (scenario.status) return `Tahap sekarang: ${String(scenario.status).replaceAll('_', ' ')}.`;
  return 'Menunggu area, sweep, MSS, dan candle close sesuai urutan resmi.';
}

function confirmationText(result = state.result) {
  const scenario = result?.entryMap?.scenario || result?.entryWatch?.scenario || {};
  const failed = (scenario.requirements || []).filter(item => item?.passed === false);
  if (failed.length) {
    return failed.slice(0, 3).map(item => `${item.label}: ${item.detail || 'belum terpenuhi'}`).join(' · ');
  }
  if (officialExecution().active) return 'Seluruh syarat entry resmi telah lengkap dan execution plan terkunci.';
  return 'Opposing liquidity sweep → displaced MSS → trigger candle close → filter konteks lengkap.';
}

function invalidationText(result = state.result, generated = lastResult) {
  const execution = officialExecution().execution;
  const stop = number(execution?.stopLoss ?? execution?.sl ?? execution?.initialStopLoss);
  if (stop != null) return priceText(stop);
  const scenarioInvalidation = generated?.scenarios?.map(item => number(item.invalidation)).find(value => value != null);
  if (scenarioInvalidation != null) return priceText(scenarioInvalidation);
  const contextInvalidation = number(generated?.context?.invalidation ?? result?.entryMap?.scenario?.protectedLevel);
  return contextInvalidation == null ? 'Belum tersedia dari struktur resmi.' : priceText(contextInvalidation);
}

function targetText(result = state.result, generated = lastResult) {
  const execution = officialExecution().execution;
  const target = number(execution?.target2 ?? execution?.tp2 ?? execution?.target1 ?? execution?.tp1);
  if (target != null) return priceText(target);
  const draw = number(result?.liquidityHierarchy?.drawTarget?.level || result?.drawTarget?.level);
  if (draw != null) return priceText(draw);
  const scenarioTarget = generated?.scenarios?.map(item => number(item.target)).find(value => value != null);
  return scenarioTarget == null ? 'Belum ada target struktural aktif.' : priceText(scenarioTarget);
}

function sourceTime(result = state.result, generated = lastResult) {
  const tf = result?.tf || state.tf;
  const candle = closedCandles(tf).at(-1);
  return generated?.sourceTime || candle?.time || 0;
}

function focusText(result = state.result) {
  const forecast = forecastDirection(result);
  const structure = marketStateDirection(result);
  const conflict = mappingVsScalperConflict(result);
  if (conflict.conflict) {
    return `WAIT: Mapping ${conflict.mappingDirection}, Scalper ${conflict.scalperDirection}.`;
  }
  if (['BUY', 'SELL'].includes(forecast)) return `Fokus ${forecast}, tetapi entry tetap menunggu syarat resmi.`;
  if (['BUY', 'SELL'].includes(structure)) return `Struktur ${structure}; Direction Forecast belum memberi izin entry.`;
  return 'WAIT sampai arah dan urutan entry menjadi jelas.';
}

function practicalModel(generated) {
  const result = state.result || {};
  const execution = officialExecution();
  const conflict = mappingVsScalperConflict(result);
  const action = execution.active && !conflict.conflict ? execution.direction : 'WAIT';
  const source = sourceTime(result, generated);
  return {
    action,
    condition: marketCondition(result),
    focus: focusText(result),
    position: positionText(result),
    area: nearestArea(result, generated),
    waiting: execution.active ? 'Setup entry resmi sudah aktif.' : waitingText(result),
    confirmation: confirmationText(result),
    invalidation: invalidationText(result, generated),
    target: targetText(result, generated),
    sourceTime: source,
    sourceTimeText: formatWita(source),
    conflict
  };
}

function scenarioTitle(scenario) {
  return ({
    FVG_REVISIT: 'Kunjungan FVG',
    OB_REVISIT: 'Kunjungan Order Block',
    DOL: 'Draw on Liquidity',
    ASIA_ENTRY: 'Target Asia'
  })[scenario?.setupType] || 'Skenario konteks';
}

function scenarioCard(scenario) {
  const range = zoneRange(scenario);
  return `<article class="amy-level-card wait" data-stability-key="outlook-scenario-${safeText(scenario.setupType || 'context')}">
    <h3><span>◎</span>${safeText(scenarioTitle(scenario))}</h3>
    <div class="amy-level-grid">
      <span>Jenis informasi</span><strong>KUNJUNGAN / KONTEKS</strong>
      <span>Arah perjalanan</span><strong>${safeText(scenario.side || 'WAIT')}</strong>
      <span>Timeframe</span><strong>${safeText(scenario.timeframe || 'M5 + M15')}</strong>
      ${range ? `<span>Zona pantauan</span><strong>${range}</strong>` : ''}
      <span>Target konteks</span><strong>${priceText(scenario.target)}</strong>
      <span>Invalidasi</span><strong>${priceText(scenario.invalidation)}</strong>
    </div>
    <p><b>Makna:</b> ${safeText(scenario.reason || 'Skenario area, bukan izin entry.')}</p>
    <p class="amy-level-disclaimer">Arah perjalanan menuju zona bukan perintah BUY/SELL.</p>
  </article>`;
}

function practicalMarkup(model, generated) {
  const conflictText = model.conflict.conflict
    ? `<div class="amy-level-waiting"><b>Konflik:</b> Mapping ${safeText(model.conflict.mappingDirection)} sedangkan Scalper ${safeText(model.conflict.scalperDirection)}. Tindakan tetap WAIT sampai selaras.</div>`
    : '';
  const scenarios = (generated?.scenarios || []).length
    ? `<div class="amy-level-cards">${generated.scenarios.map(scenarioCard).join('')}</div>`
    : '<div class="amy-level-waiting">Belum ada kunjungan zona khusus. Analisis struktur terakhir tetap berlaku.</div>';

  return `<section class="amy-level-panel ${model.action === 'WAIT' ? 'waiting' : ''}" data-stability-key="outlook-practical">
    <p class="amy-level-intro">Ringkasan praktis dari candle terakhir yang sudah close.</p>
    <div class="amy-level-grid">
      <span>Kondisi market</span><strong>${safeText(model.condition)}</strong>
      <span>Status sekarang</span><strong>${safeText(model.action)}</strong>
      <span>Fokus</span><strong>${safeText(model.focus)}</strong>
      <span>Posisi harga</span><strong>${safeText(model.position)}</strong>
      <span>Area pantauan</span><strong>${safeText(model.area)}</strong>
      <span>Yang ditunggu</span><strong>${safeText(model.waiting)}</strong>
      <span>Konfirmasi</span><strong>${safeText(model.confirmation)}</strong>
      <span>Invalidasi</span><strong>${safeText(model.invalidation)}</strong>
      <span>Target</span><strong>${safeText(model.target)}</strong>
      <span>Sumber analisis</span><strong>${safeText(model.sourceTimeText)} WITA</strong>
    </div>
    ${conflictText}
    ${scenarios}
    <p class="amy-level-disclaimer">Harga live bergerak terpisah. Mapping berubah hanya setelah candle baru sudah close atau refresh manual.</p>
  </section>`;
}

function summaryMarkup() {
  return `<span class="amy-level-summary-title"><i>◎</i><b>${SUMMARY_TITLE}</b></span><span class="amy-level-summary-status">WAIT</span>`;
}

function ensureDisclosure() {
  const app = document.getElementById('app');
  if (!app || currentTab() !== 'Analyze' || !state.result) return null;
  let details = app.querySelector('.outlook-disclosure');
  if (!details) {
    details = document.createElement('details');
    details.className = 'card disclosure outlook-disclosure';
    details.dataset.stabilityKey = 'market-outlook';
    details.open = localStorage.getItem(OPEN_KEY) !== 'false';
    details.innerHTML = `<summary class="amy-level-summary">${summaryMarkup()}</summary><div class="amy-trade-scenario-panel" data-amy-level-panel="true"></div>`;
    const ringkasan = app.querySelector('.amy-analysis-section') || app.querySelector('#amy-regime-router-v3');
    if (ringkasan) app.insertBefore(details, ringkasan);
    else app.appendChild(details);
  }
  if (!details.dataset.outlookToggleBound) {
    details.dataset.outlookToggleBound = 'true';
    details.addEventListener('toggle', () => localStorage.setItem(OPEN_KEY, String(details.open)));
  }
  let summary = details.querySelector(':scope > summary');
  if (!summary) {
    summary = document.createElement('summary');
    summary.className = 'amy-level-summary';
    summary.innerHTML = summaryMarkup();
    details.prepend(summary);
  }
  let panel = details.querySelector('.amy-trade-scenario-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'amy-trade-scenario-panel';
    panel.dataset.amyLevelPanel = 'true';
    details.appendChild(panel);
  }
  return { details, summary, panel };
}

function setSummaryState(summary, model) {
  const badge = summary?.querySelector('.amy-level-summary-status');
  if (!badge) return;
  if (badge.textContent !== model.action) badge.textContent = model.action;
  badge.classList.remove('stale');
  badge.classList.toggle('ready', model.action !== 'WAIT');
  badge.classList.toggle('waiting', model.action === 'WAIT');
}

function patchPanel(panel, markup) {
  const template = document.createElement('template');
  template.innerHTML = `<div class="amy-trade-scenario-panel" data-amy-level-panel="true">${markup}</div>`;
  const next = template.content.firstElementChild;
  if (window.AmyFXDomStableRender?.patch) {
    window.AmyFXDomStableRender.patch(panel, next);
    return;
  }
  panel.replaceChildren(...[...next.childNodes].map(node => node.cloneNode(true)));
}

function publish(generated, model) {
  if (state.result) {
    state.result.marketOutlook = {
      ...generated,
      status: model.action,
      mode: 'AMY_MARKET_CONTEXT_PRACTICAL_V2',
      practical: model,
      dataStale: false
    };
    state.result.tradeScenarios = generated;
  }
  if (!window.AmyFXIntel?.write) return;
  const payload = {
    mode: 'AMY_MARKET_CONTEXT_PRACTICAL_V2',
    generatedAt: generated.generatedAt,
    sourceTime: model.sourceTime,
    price: generated.referencePrice,
    status: model.action,
    direction: model.action === 'WAIT' ? normalizedDirection(forecastDirection()) : model.action,
    context: generated.context || null,
    scenarios: generated.scenarios || [],
    practical: model
  };
  const signature = JSON.stringify(payload);
  if (signature === lastPublishSignature) return;
  lastPublishSignature = signature;
  window.AmyFXIntel.write('outlook', payload);
}

function semanticSignature(generated, model) {
  return JSON.stringify({
    source: sourceSignature(),
    action: model.action,
    condition: model.condition,
    focus: model.focus,
    position: model.position,
    area: model.area,
    waiting: model.waiting,
    confirmation: model.confirmation,
    invalidation: model.invalidation,
    target: model.target,
    setupId: state.result?.setupExecution?.setupId || state.result?.entryMap?.setup?.id || null,
    lifecycle: state.result?.setupExecution?.lifecycleStage || state.result?.entryWatch?.lifecycleStage || null,
    scenarios: (generated.scenarios || []).map(item => [item.setupType, item.side, item.target, item.zoneLow, item.zoneHigh])
  });
}

function buildResult() {
  return buildAmyMarketContextOutlook({
    M1: closedCandles('M1'),
    M5: closedCandles('M5'),
    M15: closedCandles('M15'),
    H1: closedCandles('H1'),
    H4: closedCandles('H4'),
    D1: closedCandles('D1'),
    price: state.result?.price || closedCandles(state.tf).at(-1)?.close || state.price,
    now: Date.now()
  });
}

function refresh(force = false) {
  const target = ensureDisclosure();
  if (!target || currentTab() !== 'Analyze') return false;

  const nextSourceSignature = sourceSignature();
  const generated = buildResult();
  const usableResult = generated.status === 'WAITING_DATA' && lastResult
    ? { ...lastResult, generatedAt: generated.generatedAt }
    : generated;
  const model = practicalModel(usableResult);
  const nextSemanticSignature = semanticSignature(usableResult, model);
  if (!force && nextSourceSignature === lastSourceSignature && nextSemanticSignature === lastSemanticSignature) {
    return false;
  }

  lastSourceSignature = nextSourceSignature;
  lastSemanticSignature = nextSemanticSignature;
  if (generated.status !== 'WAITING_DATA' || !lastResult) lastResult = usableResult;
  setSummaryState(target.summary, model);
  patchPanel(target.panel, practicalMarkup(model, usableResult));
  publish(usableResult, model);
  return true;
}

function installCopyListener() {
  if (copyListenerInstalled) return;
  copyListenerInstalled = true;
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-levels]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copyLevels || '');
    } catch (_) {}
  }, true);
}

function boot() {
  installCopyListener();
  refresh(true);
  ['amyfx:candles-updated', 'amyfx:mapping-state-change', 'amyfx:entry-watch-updated', 'amyfx:execution-authority-updated']
    .forEach(name => window.addEventListener(name, () => refresh(false)));
}

window.AmyMarketOutlook = {
  refresh: () => refresh(true),
  history: () => [],
  stats: () => ({
    mode: 'AMY_MARKET_CONTEXT_PRACTICAL_V2',
    current: lastResult,
    sourceSignature: lastSourceSignature,
    semanticSignature: lastSemanticSignature
  })
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
