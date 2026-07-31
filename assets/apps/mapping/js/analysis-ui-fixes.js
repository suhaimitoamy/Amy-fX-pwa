(function () {
  'use strict';

  if (window.__amyFxFiveIssuesUiInstalled) return;
  window.__amyFxFiveIssuesUiInstalled = true;

  const DISCLOSURE_STATE_KEY = 'amyfx.analysis.disclosures.v3';
  const MARKET_CONTEXT_KEY = 'market-context';
  const BACKTEST = Object.freeze({
    status: 'FINAL_AUDITED',
    period: '2022–2025',
    samples: 25223,
    trackerSuccess: 42.78,
    closeDirectionAccuracy: 35.30,
    baselineM15: 36.43,
    targetHitRate: 28.85,
    invalidationRate: 23.38,
    outOfSample2025: Object.freeze({
      samples: 6473,
      closeDirectionAccuracy: 37.03,
      baselineM15: 38.10
    }),
    horizons: Object.freeze({
      '1–4 Jam': 35.36,
      'Sesi Berjalan': 34.15,
      '24 Jam': 38.44
    })
  });

  let scheduled = false;
  let applying = false;

  function readDisclosureState() {
    try {
      const value = JSON.parse(localStorage.getItem(DISCLOSURE_STATE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeDisclosureState(key, open) {
    if (!key) return;
    const state = readDisclosureState();
    state[key] = Boolean(open);
    try { localStorage.setItem(DISCLOSURE_STATE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function bindDisclosure(details, defaultOpen = false) {
    if (!details || details.dataset.amyDisclosureBound === 'true') return;
    const key = details.dataset.stabilityKey;
    const saved = readDisclosureState();
    details.open = Object.prototype.hasOwnProperty.call(saved, key)
      ? Boolean(saved[key])
      : Boolean(defaultOpen);
    details.dataset.amyDisclosureBound = 'true';
    details.addEventListener('toggle', () => writeDisclosureState(key, details.open));
  }

  function currentTab() {
    return window.state?.tab || localStorage.getItem('amy_mapping_tab') || '';
  }

  function removeDashboardDuplicates() {
    if (currentTab() !== 'Dashboard') return;
    document.querySelector('.mapping-hero')?.remove();
    document.querySelectorAll('#app > section.card').forEach(section => {
      const text = section.textContent || '';
      if (text.includes('AMY FX v1.5 PREVIEW AKTIF')) section.remove();
    });
  }

  function qualityState(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value.state || value.status || value.label || '');
  }

  function isM15Stale() {
    const result = window.state?.result;
    if (result?.dataStale) return true;
    const connection = String(document.getElementById('conn')?.textContent || '').toUpperCase();
    if (connection.includes('STALE') || connection.includes('DATA USANG')) return true;
    const quality = window.AmyMappingIntegrity?.qualityByInterval || {};
    const m15 = quality['15min'] || quality.M15 || quality.m15;
    const state = qualityState(m15).toUpperCase();
    return state.includes('STALE') || state.includes('USANG');
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function updateAnalysisBadge(card) {
    const badge = card?.querySelector('.regime-badge');
    if (!badge) return;
    const stale = isM15Stale();
    setText(badge, stale ? 'M15 STALE' : 'M15 LIVE');
    badge.classList.toggle('stale', stale);
    badge.classList.toggle('live', !stale);
    badge.setAttribute('aria-label', stale ? 'Data candle M15 sedang usang' : 'Data candle M15 aktif');
  }

  function ensureReliabilityDisclosure(card) {
    if (!card) return;
    let details = card.querySelector('.amy-reliability-disclosure');
    if (!details) {
      const title = [...card.querySelectorAll('.market-health-title')]
        .find(element => element.querySelector('span')?.textContent?.trim() === 'RELIABILITAS HISTORIS');
      const grid = title?.nextElementSibling;
      if (!title || !grid?.classList.contains('reliability-grid')) return;
      details = document.createElement('details');
      details.className = 'amy-reliability-disclosure';
      details.dataset.stabilityKey = 'historical-reliability';
      details.innerHTML = '<summary><span>Reliabilitas Historis</span><small>Definisi fitur berbeda · bukan sinyal live</small></summary>';
      title.replaceWith(details);
      details.appendChild(grid);
    }
    if (!details.querySelector('.amy-reliability-audit-note')) {
      const note = document.createElement('p');
      note.className = 'professional-note amy-reliability-audit-note';
      note.textContent = `Audit Market Outlook ${BACKTEST.period}: akurasi arah close ${BACKTEST.closeDirectionAccuracy.toFixed(2)}%. Angka kartu lain memakai definisi klaim berbeda dan tidak boleh dibaca sebagai akurasi sinyal saat ini.`;
      details.appendChild(note);
    }
    bindDisclosure(details, false);
  }

  function ensureMarketContextDisclosure(card) {
    if (!card || currentTab() !== 'Analyze') return;
    const currentParent = card.parentElement;
    if (currentParent?.classList.contains('amy-analysis-section')) {
      updateAnalysisBadge(card);
      bindDisclosure(currentParent, false);
      return;
    }
    const details = document.createElement('details');
    details.className = 'card amy-analysis-section';
    details.dataset.stabilityKey = MARKET_CONTEXT_KEY;
    details.innerHTML = '<summary><span>Ringkasan Market</span><small>Struktur, arah, reliabilitas, dan skenario</small></summary>';
    card.before(details);
    details.appendChild(card);
    bindDisclosure(details, false);
    updateAnalysisBadge(card);
  }

  function stableKeyForSummary(text) {
    const value = String(text || '').trim();
    if (value.startsWith('Amy Market Outlook')) return 'market-outlook';
    if (value.startsWith('Valid Break')) return 'valid-break';
    if (value.startsWith('Mapping M1–H4')) return 'mapping-m1-h4';
    if (value.startsWith('Penjelasan Mapping')) return 'mapping-explanation';
    if (value.startsWith('Setup Aktif')) return 'active-setup';
    return '';
  }

  function bindTopLevelDisclosures() {
    if (currentTab() !== 'Analyze') return;
    document.querySelectorAll('#app > details').forEach(details => {
      if (!details.dataset.stabilityKey) {
        const key = stableKeyForSummary(details.querySelector(':scope > summary')?.textContent);
        if (key) details.dataset.stabilityKey = key;
      }
      if (details.dataset.stabilityKey) bindDisclosure(details, false);
    });
  }

  function formatBacktestNote() {
    return `Audit engine produksi ${BACKTEST.period}: tracker success ${BACKTEST.trackerSuccess.toFixed(2)}%, tetapi akurasi arah close hanya ${BACKTEST.closeDirectionAccuracy.toFixed(2)}% dari ${BACKTEST.samples.toLocaleString('id-ID')} proyeksi. Baseline candle M15 ${BACKTEST.baselineM15.toFixed(2)}%. Target hit ${BACKTEST.targetHitRate.toFixed(2)}%, invalidasi ${BACKTEST.invalidationRate.toFixed(2)}%. Skor skenario bukan probabilitas kemenangan.`;
  }

  function scoreText(element) {
    const raw = String(element?.textContent || '').trim();
    if (!raw.endsWith('%')) return;
    element.textContent = `${raw.slice(0, -1)}/100`;
  }

  function fixMarketOutlook() {
    const panel = document.querySelector('.market-outlook-panel');
    if (!panel) return;

    panel.querySelectorAll('.outlook-confidence').forEach(confidence => {
      const label = confidence.querySelector('small');
      if (label?.textContent.trim() === 'Probabilitas model') setText(label, 'Skor skenario rule-based');
      if (label?.textContent.trim() === 'Skor skenario rule-based') scoreText(confidence.querySelector('strong'));
    });

    panel.querySelectorAll('.outlook-probabilities > div').forEach((row, index) => {
      const label = row.querySelector('span');
      if (label) setText(label, index === 0 ? 'Skor skenario utama' : index === 1 ? 'Skor alternatif' : 'Skor risiko invalidasi');
      scoreText(row.querySelector('b'));
    });

    panel.querySelectorAll('.outlook-calibrated').forEach(element => {
      const match = element.textContent.match(/[\d.,]+%/);
      setText(element, match ? `Keberhasilan tracker historis ${match[0]}` : 'Keberhasilan tracker historis');
    });
    const trackerLabel = panel.querySelector('.outlook-tracker-main span');
    if (trackerLabel && trackerLabel.textContent.includes('Akurasi arah historis')) {
      setText(trackerLabel, 'Keberhasilan tracker historis · target-first termasuk berhasil');
    }
    const trackerNote = panel.querySelector('.outlook-tracker-note');
    if (trackerNote) {
      setText(trackerNote, 'Tracker produksi menilai target-first, invalidasi, dan arah saat expiry. Nilai tracker bukan akurasi arah close dan baru ditampilkan setelah minimal 20 outlook selesai.');
    }

    let note = panel.querySelector('.amy-outlook-backtest-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'amy-outlook-backtest-note';
      const disclaimer = panel.querySelector('.outlook-disclaimer');
      if (disclaimer) disclaimer.insertAdjacentElement('afterend', note);
      else panel.prepend(note);
    }
    setText(note, formatBacktestNote());

    panel.querySelectorAll('.outlook-card').forEach(card => {
      const label = card.querySelector('.outlook-card-head h3')?.textContent?.trim();
      const accuracy = BACKTEST.horizons[label];
      const confidence = card.querySelector('.outlook-confidence');
      if (!confidence || !Number.isFinite(accuracy)) return;
      let historical = confidence.querySelector('.amy-outlook-historical-rate');
      if (!historical) {
        historical = document.createElement('span');
        historical.className = 'amy-outlook-historical-rate';
        confidence.appendChild(historical);
      }
      setText(historical, `Akurasi arah close historis ${accuracy.toFixed(2)}%`);
    });
  }

  function applyFixes() {
    scheduled = false;
    if (applying) return;
    applying = true;
    try {
      removeDashboardDuplicates();
      if (currentTab() === 'Analyze') {
        const card = document.getElementById('amy-regime-router-v3');
        if (card) {
          ensureReliabilityDisclosure(card);
          ensureMarketContextDisclosure(card);
          updateAnalysisBadge(card);
        }
        bindTopLevelDisclosures();
        fixMarketOutlook();
      }
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyFixes);
  }

  function start() {
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    window.addEventListener('amyfx:candles-updated', schedule);
    window.addEventListener('amyfx:entry-watch-updated', schedule);
    schedule();
  }

  window.AmyFXBacktestReference = BACKTEST;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
