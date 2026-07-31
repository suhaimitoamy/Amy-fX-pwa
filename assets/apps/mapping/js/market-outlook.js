import { state, p2 } from './main.js';
import { buildAmyMarketContextOutlook } from './outlook/amy-market-context-final-core.js';

const OPEN_KEY = 'amy_mapping_outlook_open';
const SUMMARY_TITLE = 'Market Outlook';
let lastSignature = '';
let lastResult = null;
let lastPublishSignature = '';
let timer = 0;

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function priceText(value) {
  return Number.isFinite(Number(value)) ? p2(value) : '—';
}

function currentTab() {
  return state?.tab || localStorage.getItem('amy_mapping_tab') || '';
}

function qualityState(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.state || value.status || value.label || '');
}

function intervalStale(key, aliases = []) {
  const quality = window.AmyMappingIntegrity?.qualityByInterval || {};
  const item = quality[key] || aliases.map(alias => quality[alias]).find(Boolean);
  const status = qualityState(item).toUpperCase();
  return status.includes('STALE') || status.includes('USANG');
}

function isOutlookStale() {
  if (state?.result?.dataStale) return true;
  const freshness = String(document.getElementById('conn')?.dataset?.analysisFreshness || '').toUpperCase();
  if (freshness === 'STALE' || freshness === 'EXPIRED') return true;
  return intervalStale('5min', ['M5', 'm5']) || intervalStale('15min', ['M15', 'm15']);
}

function expiryText(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(Number(timestamp)));
}

function statusText(scenario) {
  return scenario?.status === 'ACTIVE' ? 'AKTIF' : 'WAIT';
}

function scenarioTitle(scenario) {
  return ({
    FVG_REVISIT: 'FVG Revisit',
    OB_REVISIT: 'Order Block Revisit',
    DOL: 'Draw on Liquidity',
    ASIA_ENTRY: 'Asia Entry'
  })[scenario?.setupType] || 'Context Event';
}

function invalidationText(scenario) {
  if (Number.isFinite(Number(scenario?.invalidation))) return priceText(scenario.invalidation);
  return `timeout ${expiryText(scenario?.expiresAt)} WITA atau zona tidak lagi fresh`;
}

function scenarioCopyText(scenario) {
  const rows = [
    scenarioTitle(scenario),
    `Arah ${scenario.side}`,
    `Status ${statusText(scenario)}`,
    `Harga acuan ${priceText(scenario.referencePrice)}`,
    `Target ${priceText(scenario.target)}`,
    `Invalidasi ${invalidationText(scenario)}`,
    `Berlaku sampai ${expiryText(scenario.expiresAt)} WITA`,
    `Alasan: ${scenario.reason}`
  ];
  if (Number.isFinite(Number(scenario.zoneLow)) && Number.isFinite(Number(scenario.zoneHigh))) {
    rows.splice(4, 0, `Zona ${priceText(scenario.zoneLow)} - ${priceText(scenario.zoneHigh)}`);
  }
  return rows.join('\n');
}

function scenarioCard(scenario) {
  const buy = scenario.side === 'BUY';
  const zone = Number.isFinite(Number(scenario.zoneLow)) && Number.isFinite(Number(scenario.zoneHigh));
  return `<article class="amy-level-card ${buy ? 'buy' : 'sell'}">
    <h3><span>${buy ? '↗' : '↘'}</span>${safeText(scenarioTitle(scenario))}</h3>
    <div class="amy-level-grid">
      <span>Arah Outlook</span><strong>${safeText(scenario.side)}</strong>
      <span>Status</span><strong>${safeText(statusText(scenario))}</strong>
      <span>Timeframe</span><strong>${safeText(scenario.timeframe || 'M5 + M15')}</strong>
      <span>Harga acuan</span><strong>${priceText(scenario.referencePrice)}</strong>
      ${zone ? `<span>Zona konteks</span><strong>${priceText(scenario.zoneLow)}–${priceText(scenario.zoneHigh)}</strong>` : ''}
      <span>Target</span><strong class="profit">${priceText(scenario.target)}</strong>
      <span>Invalidasi</span><strong class="loss">${safeText(invalidationText(scenario))}</strong>
      <span>Berlaku sampai</span><strong>${safeText(expiryText(scenario.expiresAt))} WITA</strong>
    </div>
    <p><b>Alasan:</b> ${safeText(scenario.reason)}</p>
    <button type="button" class="amy-copy-level" data-copy-levels="${safeText(scenarioCopyText(scenario))}"><span>▣</span> Salin outlook</button>
  </article>`;
}

function contextMarkup(result) {
  const context = result.context || {};
  return `<div class="amy-level-waiting">
    <b>M15 Structure:</b> ${safeText(context.bias || 'NEUTRAL')} ·
    <b>Invalidasi:</b> ${priceText(context.invalidation)} ·
    <b>BSL:</b> ${priceText(context.bsl)} ·
    <b>SSL:</b> ${priceText(context.ssl)} ·
    <b>EMA 5/15 MTF:</b> ${safeText(context.mtfDirection || 'MIXED')}
  </div>`;
}

function waitingMarkup({ stale, result }) {
  const message = stale
    ? 'Data M5 atau M15 sedang usang. Market Outlook ditahan sampai candle live kembali tersedia.'
    : result.message || 'Tidak ada qualified context event. Outlook tetap WAIT.';
  return `<section class="amy-level-panel waiting">
    <p class="amy-level-intro">AMY Market Context Final: struktur M15 + trigger M5 untuk FVG revisit, OB revisit, DOL, dan Asia entry.</p>
    ${result.context ? contextMarkup(result) : ''}
    <div class="amy-level-waiting">${safeText(message)}</div>
  </section>`;
}

function panelMarkup(result) {
  return `<section class="amy-level-panel">
    <p class="amy-level-intro">AMY Market Context Final hanya mengaktifkan outlook ketika event yang memenuhi threshold terkunci terdeteksi.</p>
    ${contextMarkup(result)}
    <div class="amy-level-cards">${result.scenarios.map(scenarioCard).join('')}</div>
    <p class="amy-level-disclaimer">Market Outlook adalah konteks berbasis aturan, bukan jaminan hasil. Jika event bertentangan, Outlook tetap WAIT.</p>
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
    details.addEventListener('toggle', () => localStorage.setItem(OPEN_KEY, String(details.open)));
    const ringkasan = app.querySelector('.amy-analysis-section') || app.querySelector('#amy-regime-router-v3');
    const validBreak = [...app.querySelectorAll('details.disclosure')].find(item => item.querySelector(':scope > summary')?.textContent.trim().startsWith('Valid Break'));
    if (ringkasan) app.insertBefore(details, ringkasan);
    else if (validBreak) app.insertBefore(details, validBreak);
    else app.appendChild(details);
  }
  details.dataset.stabilityKey = 'market-outlook';
  let summary = details.querySelector(':scope > summary');
  if (!summary) {
    summary = document.createElement('summary');
    details.prepend(summary);
  }
  summary.className = 'amy-level-summary';
  if (!summary.querySelector('.amy-level-summary-title')) summary.innerHTML = summaryMarkup();
  let panel = details.querySelector('.amy-trade-scenario-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'amy-trade-scenario-panel';
    details.appendChild(panel);
  }
  panel.dataset.amyLevelPanel = 'true';
  return { details, summary, panel };
}

function setSummaryState(summary, { stale, result }) {
  if (!summary) return;
  const badge = summary.querySelector('.amy-level-summary-status');
  if (!badge) return;
  const active = result.status === 'ACTIVE';
  const mixed = result.status === 'MIXED';
  const text = stale ? 'DATA USANG' : active ? result.primaryDirection : mixed ? 'KONFLIK · WAIT' : 'WAIT';
  if (badge.textContent !== text) badge.textContent = text;
  badge.classList.toggle('stale', stale);
  badge.classList.toggle('ready', active && !stale);
  badge.classList.toggle('waiting', (!active || mixed) && !stale);
}

function signature(result, stale) {
  return JSON.stringify({
    tab: currentTab(),
    stale,
    status: result.status,
    sourceTime: result.sourceTime,
    direction: result.primaryDirection,
    context: result.context ? {
      bias: result.context.bias,
      invalidation: Number(result.context.invalidation || 0).toFixed(2),
      bsl: Number(result.context.bsl || 0).toFixed(2),
      ssl: Number(result.context.ssl || 0).toFixed(2)
    } : null,
    scenarios: (result.scenarios || []).map(item => ({
      side: item.side,
      type: item.setupType,
      target: Number(item.target || 0).toFixed(2),
      invalidation: Number(item.invalidation || 0).toFixed(2),
      expiresAt: item.expiresAt
    }))
  });
}

function publish(result, stale) {
  if (state.result) {
    state.result.marketOutlook = {
      ...result,
      status: stale ? 'DATA_STALE' : result.status,
      mode: 'AMY_MARKET_CONTEXT_FINAL'
    };
    state.result.tradeScenarios = result;
  }
  if (window.AmyFXIntel?.write) {
    const payload = {
      mode: 'AMY_MARKET_CONTEXT_FINAL',
      generatedAt: result.generatedAt,
      price: result.referencePrice,
      status: stale ? 'DATA_STALE' : result.status,
      direction: stale ? 'WAIT' : result.primaryDirection,
      context: result.context || null,
      scenarios: stale ? [] : result.scenarios || []
    };
    const nextPublishSignature = JSON.stringify(payload);
    if (nextPublishSignature !== lastPublishSignature) {
      lastPublishSignature = nextPublishSignature;
      window.AmyFXIntel.write('outlook', payload);
    }
  }
}

function refresh(force = false) {
  const target = ensureDisclosure();
  if (!target || currentTab() !== 'Analyze') return;
  const stale = isOutlookStale();
  const result = buildAmyMarketContextOutlook({
    M1: state.candles?.M1 || [],
    M5: state.candles?.M5 || [],
    M15: state.candles?.M15 || [],
    H1: state.candles?.H1 || [],
    H4: state.candles?.H4 || [],
    D1: state.candles?.D1 || [],
    price: state.price,
    now: Date.now()
  });
  setSummaryState(target.summary, { stale, result });
  const nextSignature = signature(result, stale);
  if (!force && nextSignature === lastSignature) return;
  lastSignature = nextSignature;
  lastResult = result;
  target.panel.innerHTML = stale || !result.scenarios?.length
    ? waitingMarkup({ stale, result })
    : panelMarkup(result);
  publish(result, stale);
}

function boot() {
  refresh(true);
  clearInterval(timer);
  timer = setInterval(() => refresh(), 2500);
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-levels]');
    if (!button) {
      setTimeout(() => refresh(), 30);
      return;
    }
    try {
      await navigator.clipboard.writeText(button.dataset.copyLevels || '');
      const original = button.innerHTML;
      button.innerHTML = '<span>✓</span> Tersalin';
      setTimeout(() => { button.innerHTML = original; }, 1200);
    } catch (_) {}
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('amyfx:candles-updated', () => refresh());
}

window.AmyMarketOutlook = {
  refresh: () => refresh(true),
  history: () => [],
  stats: () => ({ mode: 'AMY_MARKET_CONTEXT_FINAL', current: lastResult })
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
