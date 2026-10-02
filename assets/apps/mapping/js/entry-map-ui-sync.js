import { state, p2, nowTime, sessions } from './main.js';
import { entryMapDisplayState } from './ui/entry-map-status.js';

let lastSignature = '';
let syncQueued = false;
let syncing = false;
let observer = null;

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function valueBlock(label, value) {
  return `<div><small>${label}</small><strong>${value}</strong></div>`;
}

function renderScenarioBar(setup) {
  if (!setup || !setup.entry || !setup.sl || !setup.tp2) return '';
  const dir = String(setup.dir || '').includes('SELL') ? 'SELL' : 'BUY';
  const entry = Number(setup.entry);
  const sl = Number(setup.sl);
  const tp1 = Number(setup.tp1 || setup.entry);
  const tp2 = Number(setup.tp2);

  const isBuy = dir === 'BUY';
  const minVal = isBuy ? sl : tp2;
  const maxVal = isBuy ? tp2 : sl;
  const range = (maxVal - minVal) || 1;

  const getPct = (val) => Math.max(5, Math.min(95, ((val - minVal) / range) * 100));

  const slPos = getPct(sl);
  const entryPos = getPct(entry);
  const tp1Pos = getPct(tp1);
  const tp2Pos = getPct(tp2);

  return `
    <div class="visual-scenario-bar" style="margin:12px 0;padding:12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:var(--gold,#d4a832);margin-bottom:8px;">
        <span>PROYEKSI VISUAL RENCANA SETUP (${dir})</span>
        <span>RR: 1:${Number(setup.rr || 1.75).toFixed(2)}</span>
      </div>
      <div style="position:relative;height:12px;background:rgba(255,255,255,0.1);border-radius:6px;margin:16px 0 24px 0;">
        <!-- SL Dot -->
        <div style="position:absolute;left:${slPos}%;top:50%;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;background:#ff4c4c;box-shadow:0 0 8px #ff4c4c;"></div>
        <div style="position:absolute;left:${slPos}%;top:18px;transform:translateX(-50%);font-size:10px;color:#ff4c4c;white-space:nowrap;font-weight:700;">SL ${p2(sl)}</div>
        <!-- Entry Dot -->
        <div style="position:absolute;left:${entryPos}%;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#d4a832;box-shadow:0 0 10px #d4a832;"></div>
        <div style="position:absolute;left:${entryPos}%;bottom:18px;transform:translateX(-50%);font-size:10px;color:#d4a832;white-space:nowrap;font-weight:700;">Entry ${p2(entry)}</div>
        <!-- TP1 Dot -->
        <div style="position:absolute;left:${tp1Pos}%;top:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#00d97e;opacity:0.8;"></div>
        <div style="position:absolute;left:${tp1Pos}%;top:18px;transform:translateX(-50%);font-size:10px;color:#00d97e;white-space:nowrap;">TP1 ${p2(tp1)}</div>
        <!-- TP2 Dot -->
        <div style="position:absolute;left:${tp2Pos}%;top:50%;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;background:#00d97e;box-shadow:0 0 8px #00d97e;"></div>
        <div style="position:absolute;left:${tp2Pos}%;bottom:18px;transform:translateX(-50%);font-size:10px;color:#00d97e;white-space:nowrap;font-weight:700;">TP2 ${p2(tp2)}</div>
      </div>
    </div>
  `;
}

function cardMarkup(setup, display) {
  if (!setup) {
    return `<section class="card entry-map-state-card"><div class="kicker">M15 ENTRY MAP</div><h2>Belum ada setup aktif</h2><p class="muted">${display.note}</p></section>`;
  }
  const direction = String(setup.dir || '').includes('SELL') ? 'SELL' : 'BUY';
  const stateClass = display.terminal ? 'wait' : direction === 'BUY' ? 'buy' : 'sell';
  return `<section class="card entry-map-state-card">
    <div class="section-row"><div><div class="kicker">M15 ENTRY MAP</div><h2>${direction} · ${display.status}</h2></div><span class="badge ${stateClass}">${display.terminal ? 'SELESAI' : 'AKTIF'}</span></div>
    <div class="setup-summary">
      ${valueBlock('Entry MSS', p2(setup.entry))}
      ${valueBlock('Stop Loss', p2(setup.sl))}
      ${valueBlock('TP1 · 0,35R', p2(setup.tp1))}
      ${valueBlock('TP2 · 1,75R', p2(setup.tp2))}
    </div>
    ${renderScenarioBar(setup)}
    <p class="summary-note">${display.note}</p>
    <div class="ai-map-note"><b>Lifecycle candle:</b> ${setup.lifecycle?.barsElapsed || 0}/${setup.expiryBars || 36} candle M15 · Sweep ${setup.sweepType || '-'} · MSS ${setup.direction || '-'}</div>
  </section>`;
}

function patchClockLabels() {
  const current = nowTime();
  const top = document.getElementById('top-wib') || document.getElementById('top-wita');
  if (top) {
    setText(top, '');
    top.style.display = 'none';
    top.setAttribute('aria-hidden', 'true');
  }
  setText(document.getElementById('kz-wib'), `WITA ${current}`);

  const focusSessions = sessions().filter(item =>
    item.name.includes('London Open') || item.name.includes('New York Open')
  );
  document.querySelectorAll('.session-focus small').forEach((element, index) => {
    const range = focusSessions[index]?.wita || focusSessions[index]?.wib;
    if (range) setText(element, `${range} WITA`);
  });
}

function patchDecision(setup, display) {
  document.querySelectorAll('.decision-box').forEach(box => {
    const labelElement = box.querySelector('small');
    const label = labelElement?.textContent?.trim();
    const value = box.querySelector('strong');
    if (!value) return;
    if (label === 'Status') setText(value, display.status);
    if (label === 'Area Rencana') {
      setText(labelElement, 'Entry MSS');
      setText(value, setup ? p2(setup.entry) : '-');
    }
    if (label === 'Batas Salah') {
      setText(labelElement, 'Stop Loss');
      setText(value, setup ? p2(setup.sl) : '-');
    }
    if (label === 'Tingkat Keyakinan') {
      setText(labelElement, 'Mode Eksekusi');
      setText(value, setup ? 'RULE-BASED' : '-');
    }
    if (label === 'Target Terdekat' && setup) {
      setText(labelElement, 'TP1 / TP2');
      setText(value, `${p2(setup.tp1)} / ${p2(setup.tp2)}`);
    }
  });
  const reason = document.querySelector('.decision-reason');
  const reasonHtml = setup ? `<b>Penjelasan:</b><br>${display.note}` : '';
  if (reason && setup && reason.innerHTML !== reasonHtml) reason.innerHTML = reasonHtml;
}

function patchFocusCard(focus, setup, display) {
  setText(focus.querySelector('.summary-note'), display.note);
  setText(focus.querySelector('h2'), setup ? 'M15 ENTRY MAP' : 'Belum ada Entry Map aktif');

  focus.querySelectorAll('.setup-summary > div').forEach(box => {
    const label = box.querySelector('small');
    const value = box.querySelector('strong');
    const text = label?.textContent?.trim();
    if (!label || !value) return;
    if (text === 'Entry Area') {
      setText(label, 'Entry MSS');
      setText(value, setup ? p2(setup.entry) : '-');
    } else if (text === 'Invalidasi') {
      setText(label, 'Stop Loss');
      setText(value, setup ? p2(setup.sl) : '-');
    } else if (text === 'Target') {
      setText(label, 'TP1 / TP2');
      setText(value, setup ? `${p2(setup.tp1)} / ${p2(setup.tp2)}` : '-');
    } else if (text === 'Score') {
      setText(label, 'Mode');
      setText(value, setup ? 'RULE-BASED' : '-');
    }
  });
}

function patchExisting(setup, display) {
  patchClockLabels();
  const focus = document.querySelector('.setup-focus');
  if (focus && state.tf === 'M15') patchFocusCard(focus, setup, display);
  patchDecision(setup, display);

  document.querySelectorAll('.setup-card').forEach(card => {
    const title = card.querySelector('.setup-title')?.textContent || '';
    if (!title.includes('M15 ENTRY MAP')) return;
    setText(card.querySelector('.setup-head .muted'), `Timeframe: M15 • Status: ${display.status}`);
    const reason = card.querySelector('.reason');
    const reasonHtml = `<b>Lifecycle:</b><br>${display.note}`;
    if (reason && reason.innerHTML !== reasonHtml) reason.innerHTML = reasonHtml;
    card.querySelectorAll('.num').forEach(box => {
      const label = box.querySelector('small');
      const value = box.querySelector('strong');
      const text = label?.textContent?.trim();
      if (!label || !value) return;
      if (text === 'Score') {
        setText(label, 'Mode');
        setText(value, 'RULE-BASED');
      } else if (text === 'Entry Area') {
        setText(label, 'Entry MSS');
        setText(value, setup ? p2(setup.entry) : '-');
      }
    });
    const precision = card.querySelector('.precision-plan');
    const precisionHtml = '<b>M15 ENTRY MAP</b><span>TP1 0,35R · SL → Break-even</span><span>TP2 1,75R · Expiry 36 candle M15</span>';
    if (precision && precision.innerHTML !== precisionHtml) precision.innerHTML = precisionHtml;
  });
}

function sync() {
  if (syncing) return;
  syncing = true;
  try {
    const result = state.result;
    patchClockLabels();
    if (!result || state.tf !== 'M15' || !result.entryMap) {
      document.querySelector('.entry-map-state-card')?.remove();
      lastSignature = '';
      return;
    }
    const setup = result.entryMap.setup;
    const display = entryMapDisplayState(setup);
    const signature = JSON.stringify([
      state.tab,
      state.conn,
      setup?.id,
      display.status,
      setup?.sl,
      setup?.lifecycle?.barsElapsed,
      document.getElementById('app')?.childElementCount
    ]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    patchExisting(setup, display);

    const app = document.getElementById('app');
    if (!app || !['Dashboard', 'Analyze', 'Setups'].includes(state.tab)) return;
    let card = app.querySelector('.entry-map-state-card');
    const markup = cardMarkup(setup, display);
    if (!card) {
      const host = document.createElement('div');
      host.className = 'entry-map-state-card-host';
      const anchor = app.querySelector('.setup-focus') || app.firstElementChild;
      if (anchor?.nextSibling) app.insertBefore(host, anchor.nextSibling);
      else app.appendChild(host);
      host.outerHTML = markup;
    } else if (card.outerHTML !== markup) {
      card.outerHTML = markup;
    }
  } finally {
    syncing = false;
  }
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    sync();
  });
}

function boot() {
  const app = document.getElementById('app');
  if (app) {
    observer?.disconnect();
    observer = new MutationObserver(queueSync);
    observer.observe(app, { childList: true });
  }
  window.addEventListener('amyfx:mapping-updated', queueSync);
  window.addEventListener('focus', queueSync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) queueSync();
  });
  queueSync();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
