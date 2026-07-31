import {
  buildAmyExecutionContext,
  buildExecutionPlanViewModel,
  determineExecutionDisplayStatus,
  executionPlanFingerprint,
  formatExecutionReason,
  formatLifecycleLabel
} from './execution-plan-core.js';

export {
  buildAmyExecutionContext,
  buildExecutionPlanViewModel,
  determineExecutionDisplayStatus,
  executionPlanFingerprint,
  formatExecutionReason,
  formatLifecycleLabel
};

const CARD_SELECTOR = '[data-execution-plan-card]';
const DISPLAY_TIME_ZONE = 'Asia/Makassar';

function clean(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function price(value) {
  const number = finite(value);
  return number == null ? null : number.toFixed(2);
}

function areaText(area) {
  const low = price(area?.low);
  const high = price(area?.high);
  if (low && high) return low === high ? low : `${low} – ${high}`;
  return low || high || clean(area?.label) || 'Belum tersedia — menunggu setup resmi.';
}

function entryAreaText(vm) {
  const low = price(vm?.entryLow);
  const high = price(vm?.entryHigh);
  if (low && high) return low === high ? low : `${low} – ${high}`;
  return 'Belum tersedia — menunggu setup resmi.';
}

function levelText(value, fallback) {
  return price(value) || fallback;
}

function rrText(value) {
  const number = finite(value);
  return number == null ? 'Belum tersedia dari setup resmi' : `1 : ${number.toFixed(2)}`;
}

function structuralTargetText(target) {
  const parts = [clean(target?.type), clean(target?.subtype)].filter(Boolean);
  const level = price(target?.level);
  if (level) parts.push(level);
  return parts.length ? parts.join(' · ') : 'Belum tersedia — menunggu target struktural resmi.';
}

function contextText(vm) {
  return [
    `HTF ${clean(vm.higherTimeframeBias) || 'BELUM TERSEDIA'}`,
    `struktur lokal ${clean(vm.localStructure) || 'BELUM TERSEDIA'}`,
    `kondisi ${clean(vm.marketCondition) || 'BELUM TERSEDIA'}`,
    `dealing location ${clean(vm.dealingLocation) || 'BELUM TERSEDIA'}`
  ].join(' · ');
}

function tone(decision) {
  return decision === 'BUY' ? 'buy' : decision === 'SELL' ? 'sell' : 'wait';
}

function amyButtonLabel(vm) {
  if (vm.terminal || vm.targetOneSecured) return 'Tanya Amy Kenapa Setup Selesai';
  if (vm.marketCondition === 'CONFLICT') return 'Tanya Amy Jelaskan Conflict';
  if (vm.decision === 'BUY' || vm.decision === 'SELL') return 'Tanya Amy Jelaskan Entry Ini';
  if (vm.focusDirection === 'BUY') return 'Tanya Amy Apa Syarat BUY';
  if (vm.focusDirection === 'SELL') return 'Tanya Amy Apa Syarat SELL';
  return 'Tanya Amy Kenapa Masih WAIT';
}

function planQuestion(vm) {
  if (vm.decision === 'BUY' || vm.decision === 'SELL') {
    return `Jelaskan alasan setup ${vm.decision} ini berdasarkan data Mapping. Gunakan hanya entry, SL, TP, target, dan lifecycle resmi. Jangan mengubah keputusan.`;
  }
  if (vm.terminal || vm.targetOneSecured) {
    return 'Berdasarkan Rencana Eksekusi Mapping saat ini, jelaskan kenapa setup sudah selesai atau tidak boleh dieksekusi lagi. Gunakan hanya lifecycle dan hasil resmi. Jangan membuat level atau sinyal baru.';
  }
  return 'Berdasarkan Rencana Eksekusi Mapping saat ini, jelaskan kenapa status masih WAIT, apa syarat berikutnya, dan kapan setup menjadi valid. Jangan membuat level atau sinyal baru.';
}

function renderList(items, emptyText, className = '') {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) return `<p class="execution-empty">${escapeHtml(emptyText)}</p>`;
  return `<ul class="${escapeHtml(className)}">${rows.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function directionFromText(value) {
  const text = clean(value).toUpperCase();
  if (text.includes('BULL')) return 'BUY';
  if (text.includes('BEAR')) return 'SELL';
  return null;
}

function numericLevel(...values) {
  for (const value of values) {
    const number = finite(value?.price ?? value?.level ?? value);
    if (number != null && number > 0) return number;
  }
  return null;
}

function uniqueRows(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
}

function refineExecutionViewModel(viewModel, input = {}) {
  const vm = viewModel || {};
  if (vm.decision !== 'WAIT' || vm.terminal || vm.targetOneSecured) return vm;
  if (['EXPIRED', 'OFFLINE', 'STALE', 'STRUCTURAL', 'UNAVAILABLE'].includes(clean(vm.mappingFreshness).toUpperCase())) {
    return vm;
  }

  const result = input?.result
    || input?.marketState?.result
    || (typeof window !== 'undefined' ? window.state?.result : null)
    || null;
  const snapshot = result?.mappingSnapshot || input?.mappingSnapshot || {};
  const structure = snapshot?.facts?.structure || result?.st || {};
  const scenario = result?.entryMap?.scenario || snapshot?.scenario || {};
  const liquidity = snapshot?.facts?.liquidity || {};
  const inferredFromStructure = directionFromText(vm.localStructure)
    || directionFromText(structure?.localTrend)
    || directionFromText(structure?.confirmedTrend)
    || directionFromText(structure?.trend);
  const focusDirection = vm.focusDirection
    || inferredFromStructure
    || directionFromText(vm.higherTimeframeBias);

  if (!focusDirection) return vm;

  const side = focusDirection === 'BUY' ? 'SSL' : 'BSL';
  const structureWord = focusDirection === 'BUY' ? 'bullish' : 'bearish';
  const protectedLevel = focusDirection === 'BUY'
    ? numericLevel(
        structure?.protectedLow,
        result?.st?.protectedLow,
        snapshot?.facts?.structure?.protectedLow,
        scenario?.protectedLevel
      )
    : numericLevel(
        structure?.protectedHigh,
        result?.st?.protectedHigh,
        snapshot?.facts?.structure?.protectedHigh,
        scenario?.protectedLevel
      );
  const watchLevel = focusDirection === 'BUY'
    ? numericLevel(result?.ssl, liquidity?.ssl, result?.levels?.ssl)
    : numericLevel(result?.bsl, liquidity?.bsl, result?.levels?.bsl);

  const existingWaiting = uniqueRows(vm.waitingFor).filter(item =>
    !/direction forecast|forecast tidak aktif|menetapkan arah/i.test(item)
  );
  if (!existingWaiting.some(item => /sweep|disapu|liquidity/i.test(item))) {
    existingWaiting.unshift(`Menunggu ${side} disapu dan reaksi sweep dikonfirmasi Mapping.`);
  }
  if (!existingWaiting.some(item => /MSS/i.test(item))) {
    const sweepIndex = existingWaiting.findIndex(item => /sweep|disapu|liquidity/i.test(item));
    existingWaiting.splice(
      sweepIndex >= 0 ? sweepIndex + 1 : 0,
      0,
      `Menunggu displaced MSS ${structureWord} ${clean(vm.timeframe) || 'timeframe aktif'} dari candle yang sudah close.`
    );
  }
  existingWaiting.push('Direction Forecast belum aktif; arah ini hanya fokus pantauan dan belum menjadi izin entry.');

  const hasWatchArea = numericLevel(vm.area?.low, vm.area?.high, vm.area?.level) != null;
  const area = hasWatchArea || watchLevel == null
    ? vm.area
    : {
        kind: 'WATCH',
        low: watchLevel,
        high: watchLevel,
        level: watchLevel,
        source: 'OFFICIAL_LIQUIDITY_LEVEL',
        label: `${side} aktif`
      };

  const invalidation = protectedLevel != null
    ? `Fokus ${focusDirection} batal jika candle ${clean(vm.timeframe) || 'aktif'} close ${focusDirection === 'BUY' ? 'di bawah' : 'di atas'} protected ${focusDirection === 'BUY' ? 'low' : 'high'} ${price(protectedLevel)}. Setup juga batal jika struktur berbalik valid atau data kedaluwarsa.`
    : `Fokus ${focusDirection} batal jika struktur ${clean(vm.timeframe) || 'aktif'} berubah ${focusDirection === 'BUY' ? 'bearish' : 'bullish'} melalui break valid, atau data Mapping kedaluwarsa.`;

  const reasons = uniqueRows([
    inferredFromStructure
      ? `Struktur lokal memberi fokus pantauan ${focusDirection}; ini belum menjadi sinyal entry.`
      : `Mapping memberi fokus pantauan ${focusDirection}; ini belum menjadi sinyal entry.`,
    ...uniqueRows(vm.reasons).filter(item =>
      !/direction forecast resmi|forecast tidak aktif|belum ada arah valid/i.test(item)
    ),
    'Entry, Stop Loss, dan target tetap menunggu setup resmi terkunci.'
  ]);

  const refined = {
    ...vm,
    headline: `WAIT — PANTAU ${focusDirection}`,
    focusDirection,
    focusLabel: `Cari peluang ${focusDirection}`,
    area,
    waitingFor: uniqueRows(existingWaiting),
    reasons,
    invalidation,
    lifecycleLabel: /forecast/i.test(clean(vm.lifecycleLabel))
      ? `Pantau ${focusDirection} · entry belum valid`
      : vm.lifecycleLabel,
    conclusion: `Fokus ${focusDirection}, tetapi belum entry. ${existingWaiting[0] || 'Tunggu trigger resmi Mapping.'}`
  };
  refined.fingerprint = executionPlanFingerprint(refined);
  return Object.freeze(refined);
}

function inputFromBrowser(result, runtimeState) {
  const contract = typeof window !== 'undefined' ? window.AmyFXMarketContract : null;
  const contractState = contract?.read?.() || window.AmyFXIntel?.read?.() || {};
  const mapping = contractState?.mapping || {};
  const hasMappingTime = Boolean(
    mapping?.capturedAt
    || mapping?.captured_at
    || mapping?.sourceCandleTime
    || mapping?.sourceCandleAt
  );
  const mappingFreshness = hasMappingTime
    ? contract?.assess?.('mapping', mapping)
    : result?.mappingSnapshot?.freshness || null;
  const marketState = window.AmyFXMarketState || {};
  const contractSnapshot = contract?.snapshot?.(contractState) || window.AmyFXIntel?.snapshot?.(contractState) || {};
  return {
    result: result || runtimeState?.result || marketState?.result || null,
    runtimeState: runtimeState || window.state || null,
    marketState,
    mappingFreshness,
    mappingSnapshot: result?.mappingSnapshot || marketState?.result?.mappingSnapshot || null,
    conflicts: marketState?.conflicts || contractSnapshot?.conflicts || []
  };
}

export function executionPlanRuntimeInput(result = null, runtimeState = null) {
  if (typeof window === 'undefined') {
    return { result, runtimeState, mappingFreshness: result?.mappingSnapshot?.freshness || null };
  }
  return inputFromBrowser(result, runtimeState);
}

function asViewModel(input) {
  const vm = input?.source === 'AMY_MAPPING_EXECUTION_PLAN_READ_ONLY' && input?.fingerprint
    ? input
    : buildExecutionPlanViewModel(input || {});
  return refineExecutionViewModel(vm, input || {});
}

export function renderExecutionPlanCompact(input = {}) {
  const vm = asViewModel(input);
  const statusTone = tone(vm.decision);
  const areaLabel = vm.decision === 'WAIT' ? 'Area pantauan' : 'Area entry';
  const waiting = vm.decision === 'WAIT'
    ? vm.waitingFor[0] || vm.lifecycleLabel
    : vm.confirmations[0] || vm.lifecycleLabel;
  const levelGrid = vm.decision === 'WAIT' ? '' : `
    <div class="execution-level-grid execution-level-grid--compact">
      <div><small>Entry</small><strong>${escapeHtml(levelText(vm.entry, 'Belum tersedia'))}</strong></div>
      <div><small>Stop Loss</small><strong>${escapeHtml(levelText(vm.stopLoss, 'Belum tersedia'))}</strong></div>
      <div><small>TP1</small><strong>${escapeHtml(levelText(vm.tp1, 'Belum tersedia'))}</strong></div>
      <div><small>TP2</small><strong>${escapeHtml(levelText(vm.tp2, 'Belum tersedia'))}</strong></div>
    </div>`;
  return `<section id="amy-execution-plan-compact" class="card execution-plan execution-plan--compact execution-plan--${statusTone}" data-execution-plan-card="compact" data-execution-plan-fingerprint="${escapeHtml(vm.fingerprint)}">
    <div class="execution-plan__head">
      <div><div class="kicker">RENCANA EKSEKUSI</div><h2>${escapeHtml(vm.headline)}</h2></div>
      <span class="execution-badge execution-badge--${statusTone}">${escapeHtml(vm.decision)}</span>
    </div>
    <div class="execution-summary">
      <div><span>Fokus</span><strong>${escapeHtml(vm.focusLabel)}</strong></div>
      <div><span>${escapeHtml(areaLabel)}</span><strong>${escapeHtml(vm.decision === 'WAIT' ? areaText(vm.area) : entryAreaText(vm))}</strong></div>
      <div><span>${vm.decision === 'WAIT' ? 'Sedang menunggu' : 'Konfirmasi'}</span><strong>${escapeHtml(waiting)}</strong></div>
      <div><span>Status Entry Watch</span><strong>${escapeHtml(vm.lifecycleLabel)}</strong></div>
      <div><span>Invalidasi</span><strong>${escapeHtml(vm.invalidation)}</strong></div>
    </div>
    ${levelGrid}
    <div class="execution-freshness execution-freshness--${escapeHtml(clean(vm.dataStatus).toLowerCase())}">
      Data ${escapeHtml(vm.dataStatus)} · ${escapeHtml(vm.analysisTimeWita)}
    </div>
    <div class="execution-actions">
      <button type="button" class="action execution-action" data-execution-plan-action="detail">Lihat Rencana Lengkap</button>
      <button type="button" class="action execution-action execution-action--amy" data-execution-plan-action="ask-amy">${escapeHtml(amyButtonLabel(vm))}</button>
    </div>
  </section>`;
}

export function renderExecutionPlanDetail(input = {}) {
  const vm = asViewModel(input);
  const statusTone = tone(vm.decision);
  const triggerTitle = vm.decision === 'WAIT'
    ? 'Trigger yang harus ditunggu'
    : 'Trigger yang sudah terjadi';
  const triggerRows = vm.decision === 'WAIT' ? vm.waitingFor : vm.confirmations;
  const reasonsTitle = vm.decision === 'WAIT' ? 'Alasan masih WAIT' : 'Alasan keputusan';
  return `<section id="amy-execution-plan-detail" class="card execution-plan execution-plan--detail execution-plan--${statusTone}" data-execution-plan-card="detail" data-execution-plan-fingerprint="${escapeHtml(vm.fingerprint)}">
    <div class="execution-plan__head">
      <div><div class="kicker">RENCANA EKSEKUSI</div><h2>${escapeHtml(vm.headline)}</h2></div>
      <span class="execution-badge execution-badge--${statusTone}">${escapeHtml(vm.decision)}</span>
    </div>
    <div class="execution-detail-grid">
      <div><small>Arah yang diprioritaskan</small><strong>${escapeHtml(vm.focusLabel)}</strong></div>
      <div><small>Harga saat ini</small><strong>${escapeHtml(levelText(vm.currentPrice, 'Belum tersedia'))}</strong></div>
      <div class="execution-detail-grid__wide"><small>Konteks</small><strong>${escapeHtml(contextText(vm))}</strong></div>
      <div class="execution-detail-grid__wide"><small>${vm.decision === 'WAIT' ? 'Area pantauan' : 'Area entry'}</small><strong>${escapeHtml(vm.decision === 'WAIT' ? areaText(vm.area) : entryAreaText(vm))}</strong><span>${escapeHtml(vm.area?.label || '')}</span></div>
    </div>
    <div class="execution-block">
      <h3>${escapeHtml(triggerTitle)}</h3>
      ${renderList(triggerRows, vm.decision === 'WAIT' ? 'Menunggu setup resmi Mapping.' : 'Konfirmasi resmi tersedia pada lifecycle Mapping.', 'execution-trigger-list')}
    </div>
    <div class="execution-level-grid">
      <div><small>Entry</small><strong>${escapeHtml(levelText(vm.entry, 'Belum tersedia'))}</strong></div>
      <div><small>Stop Loss</small><strong>${escapeHtml(levelText(vm.stopLoss, 'Belum dikunci oleh Mapping'))}</strong></div>
      <div><small>TP1</small><strong>${escapeHtml(levelText(vm.tp1, 'Belum tersedia'))}</strong></div>
      <div><small>TP2</small><strong>${escapeHtml(levelText(vm.tp2, 'Belum tersedia'))}</strong></div>
      <div><small>RR</small><strong>${escapeHtml(rrText(vm.rr))}</strong></div>
      <div><small>Target struktural</small><strong>${escapeHtml(structuralTargetText(vm.structuralTarget))}</strong></div>
    </div>
    <div class="execution-block execution-block--invalidation">
      <h3>Invalidasi</h3>
      <p>${escapeHtml(vm.invalidation)}</p>
    </div>
    <div class="execution-block">
      <h3>${escapeHtml(reasonsTitle)}</h3>
      ${renderList(vm.reasons, 'Mapping belum menyediakan alasan tambahan.', 'execution-reason-list')}
    </div>
    <div class="execution-conclusion">
      <small>Kesimpulan sederhana</small>
      <strong>${escapeHtml(vm.conclusion)}</strong>
    </div>
    <div class="execution-meta">
      <div><span>Status Entry Watch</span><strong>${escapeHtml(vm.lifecycleLabel)}</strong><small>${escapeHtml(vm.entryWatchStage)} · ${escapeHtml(vm.entryWatchStatus)}</small></div>
      <div><span>Status data</span><strong>${escapeHtml(vm.dataStatus)}</strong><small>${escapeHtml(vm.analysisTimeWita)}</small></div>
    </div>
    <div class="execution-actions execution-actions--detail">
      <button type="button" class="action execution-action execution-action--amy" data-execution-plan-action="ask-amy">${escapeHtml(amyButtonLabel(vm))}</button>
    </div>
  </section>`;
}

export function buildExecutionContextEnvelope(viewModel) {
  const vm = asViewModel(viewModel);
  const executionContext = buildAmyExecutionContext(vm);
  return Object.freeze({
    id: `execution-plan:${vm.fingerprint}`,
    schema: 'ContextEnvelope',
    schema_version: 1,
    source_module: 'mapping',
    captured_at: vm.sourceCandleTime || vm.analysisTime || null,
    display_time: vm.analysisTimeWita,
    timezone: DISPLAY_TIME_ZONE,
    privacy_scope: 'execution_plan_read_only_no_secrets',
    freshness: {
      state: clean(vm.mappingFreshness).toLowerCase(),
      label: vm.dataStatus
    },
    source_refs: [{
      module: 'mapping',
      feature: 'execution_plan',
      authority: vm.authoritySource,
      captured_at: vm.sourceCandleTime || vm.analysisTime || null
    }],
    payload: {
      feature: 'execution_plan',
      execution_plan: executionContext
    },
    errors: []
  });
}

function currentViewModel() {
  return asViewModel(executionPlanRuntimeInput(
    window.state?.result || null,
    window.state || null
  ));
}

function askAmy(viewModel) {
  const vm = viewModel || currentViewModel();
  const question = planQuestion(vm);
  const context = buildExecutionContextEnvelope(vm);
  if (typeof window.AmyFXOS?.openMentor === 'function') window.AmyFXOS.openMentor();
  else window.dispatchEvent(new CustomEvent('amyfx:open-mentor'));

  if (typeof window.AmyFXUniversalContext?.submit === 'function') {
    window.AmyFXUniversalContext.submit(question, {
      sourceModule: 'mapping',
      context
    });
    return;
  }

  const input = document.querySelector('[data-amy-input]');
  if (input) {
    input.value = question;
    input.focus();
  }
  window.dispatchEvent(new CustomEvent('amyfx:execution-plan-question', {
    detail: { question, context }
  }));
}

function replaceCard(card, html, fingerprint) {
  if (!card || card.dataset.executionPlanFingerprint === fingerprint) return false;
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const next = template.content.firstElementChild;
  if (!next) return false;
  const scroller = document.scrollingElement;
  const scrollTop = scroller?.scrollTop || 0;
  card.className = next.className;
  card.innerHTML = next.innerHTML;
  card.dataset.executionPlanFingerprint = fingerprint;
  if (scroller && scroller.scrollTop !== scrollTop) scroller.scrollTop = scrollTop;
  return true;
}

export function syncExecutionPlanCards() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const cards = [...document.querySelectorAll(CARD_SELECTOR)];
  if (!cards.length) return false;
  const vm = currentViewModel();
  cards.forEach(card => {
    const kind = card.dataset.executionPlanCard;
    const html = kind === 'detail'
      ? renderExecutionPlanDetail(vm)
      : renderExecutionPlanCompact(vm);
    replaceCard(card, html, vm.fingerprint);
  });
  return true;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-execution-plan-action]');
    if (!button) return;
    const action = button.dataset.executionPlanAction;
    if (action === 'detail') {
      window.setTab?.('Analyze');
      document.getElementById('amy-execution-plan-detail')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (action === 'ask-amy') askAmy(currentViewModel());
  });

  [
    'amyfx:mapping-state-change',
    'amyfx:entry-watch-updated',
    'amyfx:candles-updated',
    'amyfx:market-update'
  ].forEach(name => window.addEventListener(name, syncExecutionPlanCards));
}
