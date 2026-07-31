import {
  reconcileScalperPayload,
  scalperFreshness,
  scalperPayloadSignature
} from './scalper-shadow-state.js';

const CARD_ID = 'amy-scalper-entry-watch';
const ENDPOINT = 'https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/scalper-setups?limit=8';
const ACTIVE = new Set(['WAITING_NEXT_OPEN', 'ACTIVE', 'BE_ACTIVE']);

let signature = '';
let lastValidPayload = null;
let requestSequence = 0;
let requestController = null;
let timer = 0;
let started = false;
let lastFocusedHash = '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const price = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '-';
const resultR = value => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}R` : '-';
const model = value => value === 'IFVG_SCALPER' ? 'IFVG SCALPER' : 'FVG BUY HIGH QUALITY';
const status = value => ({
  WAITING_NEXT_OPEN:'MENUNGGU OPEN BERIKUTNYA', ACTIVE:'ENTRY READY', BE_ACTIVE:'BE AKTIF',
  TP_HIT:'TP 2R HIT', SL_HIT:'SL HIT', BE_HIT:'BREAKEVEN', TIME_EXIT:'TIME EXIT',
  INVALIDATED:'INVALIDATED', CANCELLED:'CANCELLED'
})[value] || String(value || 'MENUNGGU SETUP').replaceAll('_', ' ');
const recommendation = value => ({
  VALID:'VALID', RISK_LIMIT:'RISK LIMIT', DUPLICATE_CLUSTER:'DUPLICATE CLUSTER',
  PENDING:'PENDING', CLOSED:'CLOSED', INVALID:'INVALID'
})[value] || String(value || 'PENDING');
const remaining = setup => Math.max(0, Number(setup?.maxBars || 4) - Number(setup?.barsElapsed || 0));
const tone = setup => !setup ? 'wait' : setup.status === 'TP_HIT' || setup.direction === 'BUY' ? 'buy' : setup.status === 'SL_HIT' || setup.direction === 'SELL' ? 'sell' : 'wait';

function instruction(setup) {
  if (!setup) return 'Engine memindai IFVG searah H1 dan FVG BUY High Quality dari candle yang sudah close.';
  if (setup.recommendationStatus === 'RISK_LIMIT') return 'Setup tetap dipantau, tetapi dua rekomendasi aktif sudah terisi.';
  if (setup.recommendationStatus === 'DUPLICATE_CLUSTER') return 'Setup tetap berdiri sendiri, tetapi tidak dihitung sebagai rekomendasi baru karena berada dalam cluster searah.';
  if (setup.status === 'WAITING_NEXT_OPEN') return 'Menunggu open live berikutnya untuk mengunci entry, SL, BE, dan TP.';
  if (setup.status === 'ACTIVE') return setup.model === 'IFVG_SCALPER'
    ? 'Pantau 1R untuk instruksi pindahkan SL ke breakeven. Maksimum empat candle M15.'
    : 'FVG BUY High Quality aktif. Target 2R dan maksimum empat candle M15.';
  if (setup.status === 'BE_ACTIVE') return '1R tercapai. Pindahkan SL broker secara manual ke harga entry.';
  if (setup.status === 'TIME_EXIT') return `Empat candle selesai. Hasil simulasi ${resultR(setup.resultR)}.`;
  if (setup.status === 'TP_HIT') return 'Target 2R tercapai pada simulasi engine.';
  if (setup.status === 'SL_HIT') return 'Setup simulasi selesai terkena Stop Loss.';
  if (setup.status === 'BE_HIT') return 'Setup simulasi selesai di breakeven.';
  return status(setup.status);
}

function mini(setup) {
  return `<article class="scalper-mini scalper-mini--${tone(setup)}" data-scalper-setup-id="${esc(setup.id)}">
    <div class="scalper-mini__head"><div><b>${esc(model(setup.model))} · ${esc(setup.direction)}</b><small>${esc(status(setup.status))}</small></div><span>${esc(recommendation(setup.recommendationStatus))}</span></div>
    <div class="scalper-mini__levels"><small>Entry <b>${price(setup.entry)}</b></small><small>SL <b>${price(setup.stopLoss)}</b></small><small>TP <b>${price(setup.target)}</b></small><small>${ACTIVE.has(setup.status) ? `Sisa ${remaining(setup)} candle` : resultR(setup.resultR)}</small></div>
  </article>`;
}

function card(payload, availability, error = '') {
  const active = Array.isArray(payload?.active) ? payload.active : [];
  const recent = Array.isArray(payload?.recent) ? payload.recent.slice(0, 3) : [];
  const setup = payload?.primary || active[0] || recent[0] || null;
  const others = active.filter(item => item.id !== setup?.id);
  const availabilityLabel = availability === 'LIVE' ? '' : availability;
  const title = setup ? `${model(setup.model)} — ${setup.direction}` : availability === 'DATA BELUM TERSEDIA' ? 'DATA BELUM TERSEDIA' : 'MENUNGGU SETUP';
  const badge = availabilityLabel || (setup ? status(setup.status) : 'MENUNGGU SETUP');
  const levels = setup?.entry != null ? `<div class="scalper-level-grid"><div><small>Entry</small><strong>${price(setup.entry)}</strong></div><div><small>Stop Loss</small><strong>${price(setup.stopLoss)}</strong></div><div><small>BE 1R</small><strong>${price(setup.breakEvenTrigger)}</strong></div><div><small>TP 2R</small><strong>${price(setup.target)}</strong></div></div>` : '';
  const stopBasis = setup?.stopBasis ? `<div class="scalper-stop-basis"><small>Dasar SL</small><strong>${esc(setup.stopBasis)}</strong></div>` : '';
  const availabilityNote = availability === 'LIVE'
    ? ''
    : `<p class="scalper-watch__availability">${esc(availability === 'STALE' ? 'Data engine stale. Data terakhir yang valid tetap ditampilkan.' : `Data terakhir yang valid tetap ditampilkan.${error ? ` ${error}` : ''}`)}</p>`;
  return `<section id="${CARD_ID}" class="card scalper-watch scalper-watch--${tone(setup)}" data-scalper-mode="shadow" data-scalper-availability="${esc(availability)}">
    <div class="scalper-watch__head"><div><div class="kicker">SCALPER ENGINE · SHADOW MODE</div><h2>${esc(title)}</h2></div><span class="scalper-watch__badge">${esc(badge)}</span></div>
    <div class="scalper-watch__notice">SIMULASI — belum mengeksekusi atau memindahkan order broker otomatis.</div>
    ${availabilityNote}
    ${setup ? `<div class="scalper-summary"><div><span>Model</span><strong>${esc(model(setup.model))}</strong></div><div><span>HTF Bias</span><strong>${esc(setup.htfBias || 'WAIT')}</strong></div><div><span>Rekomendasi</span><strong>${esc(recommendation(setup.recommendationStatus))}</strong></div><div><span>Lifecycle</span><strong>${esc(status(setup.status))}${ACTIVE.has(setup.status) ? ` · sisa ${remaining(setup)} candle` : ''}</strong></div></div>${levels}${stopBasis}<p class="scalper-watch__instruction">${esc(instruction(setup))}</p>` : `<p class="scalper-watch__instruction">${esc(instruction(null))}</p>`}
    ${others.length ? `<div class="scalper-watch__section"><h3>Setup aktif lainnya</h3>${others.map(mini).join('')}</div>` : ''}
    ${recent.length ? `<details class="scalper-watch__recent"><summary>Lifecycle terbaru</summary>${recent.map(mini).join('')}</details>` : ''}
    <div class="scalper-watch__foot"><span>Engine ${esc(payload?.engine?.status || (availability === 'DATA BELUM TERSEDIA' ? 'OFFLINE' : 'READY'))}</span><span>Maksimum rekomendasi 2 setup · semua sinyal tetap dicatat</span></div>
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

function focusHash() {
  const hash = String(location.hash || '');
  if (!hash || hash === lastFocusedHash) return;
  const match = hash.match(/scalper=([^&]+)/);
  if (!match) return;
  lastFocusedHash = hash;
  const id = decodeURIComponent(match[1]);
  const target = [...document.querySelectorAll('[data-scalper-setup-id]')].find(node => node.dataset.scalperSetupId === id)
    || document.getElementById(CARD_ID);
  if (!target) return;
  target.classList.add('scalper-focus');
  target.scrollIntoView({ block: 'center' });
  setTimeout(() => target.classList.remove('scalper-focus'), 3500);
}

function render(payload, availability, error = '') {
  const existing = ensureCard();
  if (!existing) return false;
  const nextSignature = scalperPayloadSignature(payload, availability);
  if (nextSignature === signature) return false;

  const template = document.createElement('template');
  template.innerHTML = card(payload, availability, error).trim();
  const next = template.content.firstElementChild;
  if (!next) return false;
  window.AmyFXDomStableRender?.patch?.(existing, next);
  signature = nextSignature;
  window.AmyFXScalperState = Object.freeze({
    payload,
    error,
    availability,
    updatedAt: Date.now()
  });
  window.dispatchEvent(new CustomEvent('amyfx:scalper-state-change', { detail: window.AmyFXScalperState }));
  return true;
}

async function sync() {
  const sequence = ++requestSequence;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  try {
    const response = await fetch(ENDPOINT, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
    if (sequence !== requestSequence || controller.signal.aborted) return false;
    lastValidPayload = reconcileScalperPayload(lastValidPayload, payload);
    return render(lastValidPayload, scalperFreshness(lastValidPayload));
  } catch (error) {
    if (controller.signal.aborted || sequence !== requestSequence || error?.name === 'AbortError') return false;
    const message = `Backend scalper belum dapat dibaca: ${error?.message || error}`;
    return render(lastValidPayload, scalperFreshness(lastValidPayload, message), message);
  } finally {
    if (requestController === controller) requestController = null;
  }
}

function start() {
  if (started) return;
  started = true;
  ensureCard();
  sync();
  clearInterval(timer);
  timer = setInterval(sync, 30_000);
  window.addEventListener('hashchange', focusHash);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  focusHash();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { sync as syncScalperEntryWatch };
