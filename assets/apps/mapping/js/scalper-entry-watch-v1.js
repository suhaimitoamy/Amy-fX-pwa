import { reconcileScalperPayload, scalperFreshness, scalperPayloadSignature } from './scalper-shadow-state.js';

const CARD_ID = 'amy-scalper-entry-watch';
const ENDPOINT = 'https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/scalper-setups';
const HISTORY_STORAGE_KEY = 'amyfx.preview.scalper.permanent-history.v1';
let signature = '';
let lastValidPayload = null;
let requestSequence = 0;
let requestController = null;
let started = false;
let displaySelectedSetupId = '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const price = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(2) : '-';
};
const resultR = value => Number.isFinite(Number(value))
  ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}R`
  : '-';
const driver = setup => setup?.driverName
  || (setup?.model === 'IFVG_SCALPER' ? 'IFVG LEGACY' : String(setup?.model || 'SCALPER ENGINE').replaceAll('_', ' '));
const timeframe = setup => setup?.timeframe || 'M15';
const status = value => ({
  WAITING_TRIGGER: 'MENUNGGU TRIGGER',
  WAITING_NEXT_OPEN: 'MENUNGGU OPEN BERIKUTNYA',
  ENTRY_READY: 'ENTRY READY',
  ACTIVE: 'AKTIF',
  BE_ACTIVE: 'BE AKTIF',
  TP_HIT: 'TP HIT',
  SL_HIT: 'SL HIT',
  BE_HIT: 'BREAKEVEN',
  TIME_EXIT: 'EXPIRED',
  INVALIDATED: 'INVALIDATED',
  CANCELLED: 'CANCELLED'
})[value] || String(value || 'MENUNGGU SETUP').replaceAll('_', ' ');
const recommendation = value => ({
  VALID: 'VALID', DUPLICATE_CLUSTER: 'CLUSTER', PENDING: 'PENDING', CLOSED: 'CLOSED',
  INVALID: 'INVALID', RISK_LIMIT: 'LEGACY LIMIT'
})[value] || String(value || 'PENDING');
const tone = setup => !setup
  ? 'wait'
  : setup.status === 'TP_HIT' || setup.direction === 'BUY'
    ? 'buy'
    : setup.status === 'SL_HIT' || setup.direction === 'SELL'
      ? 'sell'
      : 'wait';

function witaTime(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Makassar',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(number > 10_000_000_000 ? number : number * 1000));
  } catch (_) {
    return '-';
  }
}

function instruction(setup) {
  if (!setup) return '';
  if (setup.status === 'WAITING_TRIGGER') return 'Menunggu syarat trigger driver terpenuhi pada candle yang sudah close.';
  if (setup.status === 'WAITING_NEXT_OPEN' || setup.status === 'ENTRY_READY') return 'Menunggu open live berikutnya untuk mengunci entry, Stop Loss, TP1, dan TP2.';
  if (setup.status === 'ACTIVE' && setup.tp1Hit === true) return `${driver(setup)} ${timeframe(setup)} sudah mencapai TP1 +10 poin. Stop Loss tetap pada level awal; menunggu TP2 +20 poin.`;
  if (setup.status === 'ACTIVE') return `${driver(setup)} ${timeframe(setup)} aktif dalam simulasi Preview. Target tetap TP1 +10 dan TP2 +20 poin; tanpa perpindahan breakeven otomatis.`;
  if (setup.status === 'BE_ACTIVE') return 'Status breakeven ini berasal dari lifecycle engine lama dan hanya ditampilkan sebagai riwayat.';
  if (setup.status === 'TIME_EXIT') return `Batas waktu setup selesai. Hasil simulasi ${resultR(setup.resultR)}.`;
  if (setup.status === 'TP_HIT') return 'TP2 tercapai pada simulasi Scalper Engine.';
  if (setup.status === 'SL_HIT') return 'Setup simulasi selesai terkena Stop Loss.';
  if (setup.status === 'BE_HIT') return 'Setup simulasi selesai di breakeven.';
  if (setup.status === 'INVALIDATED') return setup.invalidationReason || 'Setup batal karena kondisi invalidasi driver terpenuhi.';
  return status(setup.status);
}

function setupIdFromLocation() {
  const hash = String(location.hash || '').replace(/^#/, '');
  if (!hash.startsWith('scalper')) return '';
  const encoded = hash.includes('=') ? hash.slice(hash.indexOf('=') + 1) : '';
  try { return decodeURIComponent(encoded || ''); } catch (_) { return encoded || ''; }
}

function storedPayload() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '{}');
    const history = Array.isArray(parsed?.history) ? parsed.history : [];
    if (!history.length) return null;
    return {
      ok: true,
      mode: 'preview_simulation',
      generatedAt: parsed.generatedAt || new Date(0).toISOString(),
      primary: null,
      selected: null,
      active: [],
      history,
      recent: history,
      historyCount: history.length,
      engine: null,
      persisted: true
    };
  } catch (_) {
    return null;
  }
}

function persistPayload(payload) {
  const history = Array.isArray(payload?.history) ? payload.history : Array.isArray(payload?.recent) ? payload.recent : [];
  if (!history.length) return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({
      generatedAt: payload.generatedAt || new Date().toISOString(),
      history
    }));
  } catch (_) {}
}

function mini(setup, primaryId, displayId) {
  const labels = [];
  if (setup.id === primaryId) labels.push('UTAMA');
  if (setup.id === displayId) labels.push('DITAMPILKAN');
  if (setup.direction && setup.id !== primaryId) labels.push(setup.direction);
  return `<button type="button" class="scalper-mini scalper-mini--${tone(setup)}${setup.id === displayId ? ' is-selected' : ''}" data-scalper-select-id="${esc(setup.id)}">
    <span class="scalper-mini__head"><span><b>${esc(driver(setup))} · ${esc(timeframe(setup))} · ${esc(setup.direction)}</b><small>${esc(status(setup.status))} · ${esc(witaTime(setup.signalCandleCloseTime))} WITA</small></span><span>${esc(labels.join(' · ') || recommendation(setup.recommendationStatus))}</span></span>
    <span class="scalper-mini__levels"><small>Entry <b>${price(setup.entry)}</b></small><small>SL <b>${price(setup.stopLoss)}</b></small><small>TP1 <b>${price(setup.tp1 ?? setup.breakEvenTrigger)}</b></small><small>TP2 <b>${price(setup.tp2 ?? setup.target)}</b></small></span>
  </button>`;
}

function resolveDisplay(payload) {
  const all = [
    ...(payload?.active || []),
    ...(payload?.history || payload?.recent || []),
    payload?.selected
  ].filter(Boolean);
  const selected = displaySelectedSetupId
    ? all.find(item => String(item.id) === String(displaySelectedSetupId))
    : null;
  if (selected) return selected;
  if (displaySelectedSetupId) return payload?.selected || null;
  return payload?.primary || payload?.active?.[0] || null;
}

function card(payload, availability, error = '') {
  const active = Array.isArray(payload?.active) ? payload.active : [];
  const history = Array.isArray(payload?.history)
    ? payload.history
    : Array.isArray(payload?.recent)
      ? payload.recent
      : [];
  const primary = payload?.primary || active[0] || null;
  const setup = resolveDisplay(payload);
  const others = active.filter(item => item.id !== setup?.id);
  const availabilityLabel = availability === 'LIVE' ? '' : availability;
  const title = setup
    ? `${driver(setup)} ${timeframe(setup)} — ${setup.direction}`
    : availability === 'DATA BELUM TERSEDIA'
      ? 'DATA BELUM TERSEDIA'
      : 'MENUNGGU SETUP';
  const badge = availabilityLabel || (setup ? status(setup.status) : 'MENUNGGU SETUP');
  const levels = setup?.entry != null
    ? `<div class="scalper-level-grid"><div><small>Entry</small><strong>${price(setup.entry)}</strong></div><div><small>Stop Loss</small><strong>${price(setup.stopLoss)}</strong></div><div><small>TP1 +10</small><strong>${price(setup.tp1 ?? setup.breakEvenTrigger)}</strong></div><div><small>TP2 +20</small><strong>${price(setup.tp2 ?? setup.target)}</strong></div></div>`
    : '';
  const stopBasis = setup?.stopBasis
    ? `<div class="scalper-stop-basis"><small>Dasar SL</small><strong>${esc(setup.stopBasis)}</strong></div>`
    : '';
  const reason = setup?.reason
    ? `<div class="scalper-stop-basis"><small>Alasan driver</small><strong>${esc(setup.reason)}</strong></div>`
    : '';
  const availabilityNote = availability === 'LIVE'
    ? ''
    : `<p class="scalper-watch__availability">${esc(
      availability === 'STALE'
        ? 'Data engine stale. Riwayat permanen terakhir tetap ditampilkan.'
        : availability === 'STORED'
          ? 'Backend belum dapat dibaca. Riwayat permanen di perangkat tetap ditampilkan.'
          : `Riwayat permanen terakhir tetap ditampilkan.${error ? ` ${error}` : ''}`
    )}</p>`;
  const reset = setup && primary && setup.id !== primary.id
    ? '<button type="button" class="scalper-return-primary" data-scalper-return-primary="true">Kembali ke setup utama</button>'
    : '';

  return `<section id="${CARD_ID}" class="card scalper-watch scalper-watch--${tone(setup)}" data-scalper-mode="shadow" data-scalper-availability="${esc(availability)}">
    <div class="scalper-watch__head"><div><div class="kicker">SCALPER ENGINE · SHADOW MODE</div><h2>${esc(title)}</h2></div><span class="scalper-watch__badge">${esc(badge)}</span></div>
    <div class="scalper-watch__notice">SIMULASI — tidak mengeksekusi, memindahkan, atau menutup order broker otomatis.</div>
    ${availabilityNote}
    ${setup ? `<div class="scalper-summary"><div><span>Driver</span><strong>${esc(driver(setup))}</strong></div><div><span>Timeframe</span><strong>${esc(timeframe(setup))}</strong></div><div><span>HTF Bias</span><strong>${esc(setup.htfBias || 'WAIT')}</strong></div><div><span>Lifecycle</span><strong>${esc(status(setup.status))}</strong></div></div>${levels}${stopBasis}${reason}<p class="scalper-watch__instruction">${esc(instruction(setup))}</p>${reset}` : '<p class="scalper-watch__instruction"></p>'}
    ${others.length ? `<div class="scalper-watch__section"><h3>Setup aktif lainnya (${others.length})</h3><div class="scalper-active-list">${others.map(item => mini(item, primary?.id, setup?.id)).join('')}</div></div>` : ''}
    ${history.length ? `<details class="scalper-watch__recent"${displaySelectedSetupId ? ' open' : ''}><summary>Riwayat setup permanen (${history.length})</summary>${history.map(item => mini(item, primary?.id, setup?.id)).join('')}</details>` : ''}
  </section>`;
}

function anchor() {
  return document.querySelector('[data-execution-plan-card="compact"]')
    || document.querySelector('[data-execution-plan-card="detail"]')
    || document.querySelector('#app > .card');
}

function ensureCard() {
  let existing = document.getElementById(CARD_ID);
  if (existing) return existing;
  const host = anchor();
  if (!host) return null;
  existing = document.createElement('section');
  existing.id = CARD_ID;
  existing.className = 'card scalper-watch scalper-watch--wait';
  existing.dataset.scalperMode = 'shadow';
  existing.dataset.domPersistent = 'true';
  existing.dataset.stabilityKey = 'scalper-shadow';
  host.insertAdjacentElement('afterend', existing);
  return existing;
}

function bindInteractions(node) {
  node.addEventListener('click', event => {
    const select = event.target.closest('[data-scalper-select-id]');
    if (select) {
      displaySelectedSetupId = select.dataset.scalperSelectId || '';
      signature = '';
      render(lastValidPayload, scalperFreshness(lastValidPayload));
      return;
    }
    if (event.target.closest('[data-scalper-return-primary]')) {
      displaySelectedSetupId = '';
      signature = '';
      render(lastValidPayload, scalperFreshness(lastValidPayload));
    }
  });
}

function render(payload, availability, error = '') {
  const existing = ensureCard();
  if (!existing) return false;
  const nextSignature = `${scalperPayloadSignature(payload, availability)}:${displaySelectedSetupId}`;
  if (nextSignature === signature) return false;
  const template = document.createElement('template');
  template.innerHTML = card(payload, availability, error).trim();
  const next = template.content.firstElementChild;
  if (!next) return false;
  if (window.AmyFXDomStableRender?.patch) window.AmyFXDomStableRender.patch(existing, next);
  else {
    existing.className = next.className;
    existing.dataset.scalperAvailability = next.dataset.scalperAvailability;
    existing.innerHTML = next.innerHTML;
  }
  signature = nextSignature;
  window.AmyFXScalperState = Object.freeze({
    payload,
    error,
    availability,
    displaySelectedSetupId,
    updatedAt: Date.now()
  });
  window.dispatchEvent(new CustomEvent('amyfx:scalper-state-change', { detail: window.AmyFXScalperState }));
  return true;
}

function endpointUrl() {
  const params = new URLSearchParams({ limit: '50', history: 'all', history_limit: '2000' });
  if (displaySelectedSetupId) params.set('setup_id', displaySelectedSetupId);
  return `${ENDPOINT}?${params.toString()}`;
}

async function sync() {
  const sequence = ++requestSequence;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  try {
    const response = await fetch(endpointUrl(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
    if (sequence !== requestSequence || controller.signal.aborted) return false;
    lastValidPayload = reconcileScalperPayload(lastValidPayload, payload);
    persistPayload(lastValidPayload);
    return render(lastValidPayload, scalperFreshness(lastValidPayload));
  } catch (error) {
    if (controller.signal.aborted || sequence !== requestSequence || error?.name === 'AbortError') return false;
    const message = `Backend scalper belum dapat dibaca: ${error?.message || error}`;
    return render(lastValidPayload, scalperFreshness(lastValidPayload, message), message);
  } finally {
    if (requestController === controller) requestController = null;
  }
}

function consumeNotificationSelection() {
  const selectedId = setupIdFromLocation();
  if (selectedId) displaySelectedSetupId = selectedId;
  signature = '';
  if (lastValidPayload) render(lastValidPayload, scalperFreshness(lastValidPayload));
  return sync();
}

function start() {
  if (started) return;
  started = true;
  displaySelectedSetupId = setupIdFromLocation();
  lastValidPayload = storedPayload();
  const cardNode = ensureCard();
  if (cardNode) bindInteractions(cardNode);
  if (lastValidPayload) render(lastValidPayload, 'STORED');
  sync();
  window.addEventListener('hashchange', consumeNotificationSelection);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { sync as syncScalperEntryWatch };
