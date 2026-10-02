import { buildMappingContextAggregate } from './engine/mapping-context-aggregator.js';
import { classifyXauDxySmt } from './engine/smt-selector.js';

const DXY_ENDPOINT = 'https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/smt-dxy-candles';
const DXY_CACHE_MS = 5 * 60 * 1000;
let dxyCache = { at: 0, rows: [], state: null };
let dxyRequest = null;
let scheduled = false;
let applying = false;
let lastRenderSignature = '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function price(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '-';
}

function badgeClass(value) {
  const state = String(value || '').toUpperCase();
  if (state.includes('BULL') || state === 'BUY' || state.includes('ACCEPTANCE')) return 'buy';
  if (state.includes('BEAR') || state === 'SELL') return 'sell';
  return 'wait';
}

function stateResult() {
  return window.state?.result || null;
}

function xauM15() {
  return (window.state?.candles?.M15 || []).filter(row => row?.isClosed !== false && row?.is_closed !== false && row?.amyfxSyntheticCurrent !== true);
}

async function readDxyM15() {
  if (Date.now() - dxyCache.at < DXY_CACHE_MS) return dxyCache.rows;
  if (dxyRequest) return dxyRequest;
  dxyRequest = (async () => {
    try {
      const response = await fetch(`${DXY_ENDPOINT}?outputsize=160`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.status !== 'ok' || !Array.isArray(payload?.values)) {
        dxyCache = { at: Date.now(), rows: [], state: { reason: payload?.message || `DXY HTTP ${response.status}` } };
        return [];
      }
      const rows = payload.values.map(value => {
        const rawTime = String(value.datetime || '').trim();
        const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(rawTime) ? rawTime.replace(' ', 'T') : `${rawTime.replace(' ', 'T')}Z`;
        const openTime = Date.parse(normalized) / 1000;
        return {
          open_time: openTime,
          close_time: openTime + 900,
          open: Number(value.open), high: Number(value.high), low: Number(value.low), close: Number(value.close), is_closed: true
        };
      }).filter(row => Number.isFinite(row.open_time) && [row.open, row.high, row.low, row.close].every(Number.isFinite));
      dxyCache = { at: Date.now(), rows: rows.reverse(), state: { source: payload.source || 'DXY_PROVIDER' } };
      return dxyCache.rows;
    } catch (error) {
      dxyCache = { at: Date.now(), rows: [], state: { reason: String(error?.message || error) } };
      return [];
    } finally {
      dxyRequest = null;
    }
  })();
  return dxyRequest;
}

function currentSmt(rows = dxyCache.rows) {
  const smt = classifyXauDxySmt({ xauM15: xauM15(), dxyM15: rows });
  if (smt.state === 'UNAVAILABLE' && dxyCache.state?.reason) {
    return { ...smt, reason: `DXY unavailable: ${dxyCache.state.reason}. Engine lain tetap berjalan normal.` };
  }
  return smt;
}

function patchResult(result, smt) {
  if (!result?.amySmcD?.ready) return null;
  const aggregate = buildMappingContextAggregate(result, { smt });
  result.mappingContextAggregate = aggregate;
  result.marketContext = aggregate.context;
  result.marketState = aggregate.marketState;
  result.eventState = aggregate.events;
  result.locationState = aggregate.locations;
  result.forecast = aggregate.predictive;
  result.outlookNarrative = aggregate.outlook;
  result.entryReadiness = aggregate.entryReadiness;
  result.facts = aggregate.facts;
  result.evidence = aggregate.evidence;
  result.hypothesis = result.validatedMarketContext?.directionForecast || aggregate.predictive;
  if (result.validatedMarketContext && !result.validatedMarketContext.facts) {
    result.validatedMarketContext.facts = aggregate.facts;
  }
  return aggregate;
}

function line(label, value, detail = '') {
  return `<div class="num"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${detail ? `<span class="muted">${escapeHtml(detail)}</span>` : ''}</div>`;
}

function eventLine(label, event) {
  const status = event?.fresh ? event?.summary : `${event?.status || 'NO_FRESH_EVENT'} · ${event?.summary || 'Context tetap aktif.'}`;
  return `<div class="reason"><b>${escapeHtml(label)}</b><br><span class="muted">${escapeHtml(status)}</span></div>`;
}

function renderSignature(aggregate) {
  return JSON.stringify({
    facts: aggregate?.facts,
    marketState: aggregate?.marketState,
    events: Object.fromEntries(Object.entries(aggregate?.events || {}).map(([key, value]) => [key, [value?.status || value?.state, value?.summary]])),
    locations: aggregate?.locations,
    predictive: {
      finalBias: aggregate?.predictive?.finalBias,
      nextMoveSignal: aggregate?.predictive?.nextMoveSignal,
      sweepContinuation: aggregate?.predictive?.sweepContinuation?.direction,
      smt: aggregate?.predictive?.smt?.state
    },
    entry: aggregate?.entryReadiness,
    outlook: aggregate?.outlook
  });
}

function renderAggregate(aggregate) {
  if (!aggregate || window.state?.tab !== 'Analyze') return;
  const app = document.getElementById('app');
  if (!app) return;
  const signature = renderSignature(aggregate);
  let card = document.getElementById('amy-mapping-context-aggregate-v1');
  if (card && signature === lastRenderSignature) return;
  if (!card) {
    card = document.createElement('details');
    card.id = 'amy-mapping-context-aggregate-v1';
    card.className = 'card disclosure';
    card.dataset.stabilityKey = 'mapping-context-aggregate-v1';
    const anchor = app.querySelector('[data-stability-key="market-context"]') || app.firstElementChild;
    if (anchor?.nextSibling) anchor.parentNode.insertBefore(card, anchor.nextSibling);
    else app.prepend(card);
  }

  const c = aggregate.context;
  const e = aggregate.events;
  const p = aggregate.predictive;
  const sw = c.strongWeak || {};
  const pd = c.previousDay || {};
  const pm = c.previousMonth || {};
  const eq = c.adaptiveEqualHighLow || {};
  const smt = p.smt || {};
  const entry = aggregate.entryReadiness;
  const outlook = aggregate.outlook;
  const fvg = aggregate.locations.fvg;
  const ob = aggregate.locations.orderBlock;
  const state = aggregate.marketState;

  card.innerHTML = `
    <summary class="amy-level-summary"><span class="amy-level-summary-title"><i>◇</i><b>Mapping Context Terpadu</b></span><span class="amy-level-summary-status ${badgeClass(state.direction)}">${escapeHtml(state.label)}</span></summary>
    <div class="amy-trade-scenario-panel" data-amy-level-panel="true">
      <div class="kicker">MARKET CONTEXT · CONTINUOUS</div>
      <div class="num-grid">
        ${line('HTF Swing', c.htfSwing)}
        ${line('Swing Structure', c.swingStructure)}
        ${line('Internal Structure', c.internalStructure)}
        ${line('Dealing Range', c.dealingRange)}
        ${line('Final Bias', c.finalBias)}
        ${line('BSL / SSL', `${price(c.liquidity.bsl)} / ${price(c.liquidity.ssl)}`)}
      </div>
      <div class="reason"><b>Strong / Weak Structure</b><br><span class="muted">${escapeHtml(sw.summary || 'Protected/weak structure belum lengkap.')}</span></div>
      <div class="reason"><b>Reference Liquidity</b><br><span class="muted">PDH ${price(pd.pdh)} · PDL ${price(pd.pdl)} · PWH ${price(pd.pwh)} · PWL ${price(pd.pwl)} · PMH ${price(pm.pmh)} · PML ${price(pm.pml)}</span></div>
      <div class="reason"><b>EQH / EQL</b><br><span class="muted">${escapeHtml(`${Array.isArray(eq.eqh) ? eq.eqh.length : 0} EQH · ${Array.isArray(eq.eql) ? eq.eql.length : 0} EQL · advisory context`)}</span></div>
      <div class="reason"><b>Midnight Open</b><br><span class="muted">${escapeHtml(c.midnightOpen?.summary || 'Belum tersedia.')}</span></div>

      <div class="kicker" style="margin-top:14px">STRUCTURE & EVENT ENGINES</div>
      ${eventLine('Sweep vs Acceptance', { fresh: e.sweepAcceptance.state !== 'WAITING_LEVEL_REACTION', status: e.sweepAcceptance.state, summary: e.sweepAcceptance.summary })}
      ${eventLine('Raw Valid Break', e.rawValidBreak)}
      ${eventLine('Qualified Valid Break', e.qualifiedValidBreak)}
      ${eventLine('Qualified CHoCH', e.qualifiedChoch)}
      ${eventLine('Qualified BOS', e.qualifiedBos)}
      ${eventLine('Raw Pattern', e.rawPattern)}
      ${eventLine('Qualified Pattern', e.qualifiedPattern)}

      <div class="kicker" style="margin-top:14px">LOCATION / POI</div>
      <div class="num-grid">
        ${line('FVG terdekat', fvg.summary)}
        ${line('Order Block terdekat', ob.summary)}
      </div>

      <div class="kicker" style="margin-top:14px">PREDICTIVE ENGINES</div>
      <div class="num-grid">
        ${line('Final Bias', p.finalBias)}
        ${line('Next Move', p.nextMoveSignal)}
        ${line('Sweep Continuation', p.sweepContinuation?.active ? p.sweepContinuation.direction : 'NO FRESH EVENT')}
        ${line('SMT XAU–DXY', smt.state, smt.direction || smt.reason || '')}
      </div>
      <p class="professional-note">SMT = evidence-only. Tidak boleh membalik Final Bias/Next Move, membatalkan Valid Break/BOS/CHoCH, atau memblokir Entry Map/Scalper lain.</p>

      <div class="kicker" style="margin-top:14px">MARKET STATE & OUTLOOK</div>
      <div class="reason"><b>${escapeHtml(state.label)}</b><br>${escapeHtml(outlook.primary)}</div>
      <div class="reason"><b>Skenario alternatif</b><br><span class="muted">${escapeHtml(outlook.alternative)}</span></div>
      <div class="reason"><b>Invalidasi konteks</b><br><span class="muted">${escapeHtml(outlook.invalidation)}</span></div>

      <div class="kicker" style="margin-top:14px">ENTRY READINESS</div>
      <div class="setup-card ${entry.ready ? 'ready' : 'wait'}"><div class="setup-head"><div><div class="setup-title">${escapeHtml(entry.action)}</div><div class="muted">${escapeHtml(entry.status)}</div></div><span class="badge ${badgeClass(entry.action)}">${escapeHtml(entry.action)}</span></div><div class="reason"><b>Alasan:</b><br>${escapeHtml(entry.reason)}</div></div>
    </div>`;
  lastRenderSignature = signature;
}

function apply(smt = currentSmt()) {
  const result = stateResult();
  if (!result?.amySmcD?.ready) return;
  const aggregate = patchResult(result, smt);
  renderAggregate(aggregate);
  window.AmyFXMappingContextAggregate = aggregate;
  window.dispatchEvent(new CustomEvent('amyfx:mapping-context-aggregated', { detail: aggregate }));
}

async function refreshSmt() {
  const rows = await readDxyM15();
  apply(currentSmt(rows));
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (applying) return;
    applying = true;
    try { apply(); } finally { applying = false; }
    if (Date.now() - dxyCache.at >= DXY_CACHE_MS) refreshSmt();
  });
}

function boot() {
  window.addEventListener('amyfx:mapping-ui-rendered', schedule);
  window.addEventListener('amyfx:candles-updated', schedule);
  window.addEventListener('amyfx:entry-watch-updated', schedule);
  window.addEventListener('focus', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  const app = document.getElementById('app');
  if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();

window.AmyFXMappingContextOrchestrator = Object.freeze({ version: '1.0.0', refresh: schedule });
