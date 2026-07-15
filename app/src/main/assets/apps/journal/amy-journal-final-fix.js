(function () {
  'use strict';

  const JOURNAL_KEY = 'tradingLibraryManager.journals.v1';
  const JOURNAL_DRAFT_KEY = 'amyfx.journal.draft.v2';
  const JOURNAL_EXTRA_KEY = 'amyfx.journal.extras.v2';
  const JOURNAL_FILTER_KEY = 'amyfx.journal.filters.v1';
  const FILTER_RESULTS = new Set(['all', 'Win', 'Loss', 'BE', 'Belum selesai', 'Tidak entry']);
  const ALLOWED_RESULTS = new Set(['Win', 'Loss', 'BE', 'Belum selesai', 'Tidak entry']);
  const MAX_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000;
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  let enhancing = false;
  let enhanceFrame = 0;
  let hooksInstalled = false;
  let draftTimer = 0;

  function safeParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readJson(key, fallback) {
    return safeParse(localStorage.getItem(key), fallback);
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function toNumber(value) {
    const normalized = String(value ?? '')
      .replace(/\s+/g, '')
      .replace(/,/g, '.')
      .replace(/[^0-9.-]/g, '');
    const number = Number.parseFloat(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function dateValue(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function formatAmount(value) {
    const number = Number(value) || 0;
    const sign = number < 0 ? '-' : '';
    return `${sign}${Math.abs(number).toLocaleString('id-ID', { maximumFractionDigits: 2 })}`;
  }

  function todayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function readJournals() {
    const journals = readJson(JOURNAL_KEY, []);
    return Array.isArray(journals) ? journals : [];
  }

  function readExtras() {
    const extras = readJson(JOURNAL_EXTRA_KEY, {});
    return extras && typeof extras === 'object' && !Array.isArray(extras) ? extras : {};
  }

  function readFilters() {
    const saved = readJson(JOURNAL_FILTER_KEY, {});
    return {
      query: String(saved.query || ''),
      result: FILTER_RESULTS.has(saved.result) ? saved.result : 'all',
      market: String(saved.market || 'all'),
      period: ['all', '7', '30', 'month', 'year'].includes(saved.period) ? saved.period : 'all',
      sort: ['newest', 'oldest', 'pl-high', 'pl-low'].includes(saved.sort) ? saved.sort : 'newest'
    };
  }

  function normalizeResult(value) {
    return ALLOWED_RESULTS.has(value) ? value : 'Belum selesai';
  }

  function netForJournal(journal) {
    return Math.max(0, toNumber(journal?.profit)) - Math.max(0, toNumber(journal?.loss));
  }

  function calculateStreak(journals, now = new Date()) {
    const dates = [...new Set(
      journals
        .map(journal => String(journal?.date || '').slice(0, 10))
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )].sort().reverse();
    if (!dates.length) return 0;
    const today = todayKey(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = todayKey(yesterdayDate);
    if (dates[0] !== today && dates[0] !== yesterday) return 0;
    let cursor = new Date(`${dates[0]}T12:00:00`);
    let streak = 0;
    for (const value of dates) {
      if (value !== todayKey(cursor)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function calculateMaxDrawdown(journals) {
    const chronological = [...journals].sort((a, b) => {
      const byDate = dateValue(a?.date || a?.createdAt) - dateValue(b?.date || b?.createdAt);
      return byDate || dateValue(a?.createdAt) - dateValue(b?.createdAt);
    });
    let equity = 0;
    let peak = 0;
    let drawdown = 0;
    chronological.forEach(journal => {
      equity += netForJournal(journal);
      peak = Math.max(peak, equity);
      drawdown = Math.max(drawdown, peak - equity);
    });
    return drawdown;
  }

  function calculateStats(journals) {
    const rows = Array.isArray(journals) ? journals : [];
    const win = rows.filter(journal => journal?.result === 'Win').length;
    const loss = rows.filter(journal => journal?.result === 'Loss').length;
    const be = rows.filter(journal => journal?.result === 'BE').length;
    const finished = win + loss + be;
    const decided = win + loss;
    const totalProfit = rows.reduce((sum, journal) => sum + Math.max(0, toNumber(journal?.profit)), 0);
    const totalLoss = rows.reduce((sum, journal) => sum + Math.max(0, toNumber(journal?.loss)), 0);
    const net = totalProfit - totalLoss;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : (totalProfit > 0 ? Infinity : 0);
    return {
      total: rows.length,
      win,
      loss,
      be,
      finished,
      winRate: decided ? Math.round((win / decided) * 100) : 0,
      totalProfit,
      totalLoss,
      net,
      average: finished ? net / finished : 0,
      profitFactor,
      streak: calculateStreak(rows),
      maxDrawdown: calculateMaxDrawdown(rows)
    };
  }

  function periodMatches(journal, period, now = new Date()) {
    if (period === 'all') return true;
    const rawDate = String(journal?.date || '');
    const stamp = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? new Date(`${rawDate}T12:00:00`).getTime()
      : dateValue(journal?.updatedAt || journal?.createdAt);
    if (!stamp) return false;
    const date = new Date(stamp);
    if (period === '7' || period === '30') {
      const days = Number(period);
      const cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - (days - 1));
      return date.getTime() >= cutoff.getTime();
    }
    if (period === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    if (period === 'year') return date.getFullYear() === now.getFullYear();
    return true;
  }

  function filterJournals(journals, filters, extras = {}) {
    const query = String(filters?.query || '').trim().toLowerCase();
    const result = filters?.result || 'all';
    const market = filters?.market || 'all';
    const period = filters?.period || 'all';
    return (Array.isArray(journals) ? journals : []).filter(journal => {
      if (result !== 'all' && journal?.result !== result) return false;
      if (market !== 'all' && String(journal?.market || '').trim() !== market) return false;
      if (!periodMatches(journal, period)) return false;
      if (!query) return true;
      const extra = extras[journal?.id] || {};
      return [journal?.date, journal?.title, journal?.market, journal?.setup, journal?.result, journal?.evaluation, journal?.mistakes, journal?.lessons, journal?.emotion, extra.direction, extra.session, extra.timeframe, extra.entry, extra.sl, extra.tp, extra.riskPercent].join(' ').toLowerCase().includes(query);
    });
  }

  function sortJournals(journals, sort) {
    const rows = [...journals];
    if (sort === 'oldest') return rows.sort((a, b) => dateValue(a?.date || a?.createdAt) - dateValue(b?.date || b?.createdAt));
    if (sort === 'pl-high') return rows.sort((a, b) => netForJournal(b) - netForJournal(a));
    if (sort === 'pl-low') return rows.sort((a, b) => netForJournal(a) - netForJournal(b));
    return rows.sort((a, b) => dateValue(b?.date || b?.updatedAt || b?.createdAt) - dateValue(a?.date || a?.updatedAt || a?.createdAt));
  }

  function polyfillCssEscape() {
    window.CSS = window.CSS || {};
    if (typeof window.CSS.escape === 'function') return;
    window.CSS.escape = value => String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `);
  }

  function ensureLegacyGlobals() {
    if (typeof window.makeStatCard !== 'function') {
      window.makeStatCard = function makeStatCard(label, value) {
        const card = document.createElement('div');
        card.className = 'stat-card';
        const title = document.createElement('span');
        title.textContent = label;
        const number = document.createElement('strong');
        number.textContent = value;
        card.append(title, number);
        return card;
      };
    }
    if (typeof window.filterGridItems !== 'function') window.filterGridItems = items => Array.isArray(items) ? items : [];
  }

  function updateLibraryControls() {
    const countText = (qs('#libraryCount')?.textContent || '').trim();
    const count = Number((countText.match(/\d+/) || ['0'])[0]);
    const hasCards = !!document.querySelector('.library-card,.item-card,[data-item-id]');
    document.body.classList.toggle('has-library-items', count > 0 || hasCards);
    const query = (qs('#searchInput')?.value || '').trim();
    const hasActive = query || document.querySelector('.pill-button.is-active:not(:first-child), .filter-chip.is-active:not(:first-child)');
    document.body.classList.toggle('has-active-filter', !!hasActive);
  }

  function ensureAiKeyPanel() {
    const view = qs('#assistantView');
    if (!view || qs('#amyAiKeyPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'amyAiKeyPanel'; panel.className = 'amy-ai-key-panel';
    panel.innerHTML = `<h3>API Key AI</h3><label>Provider</label><select id="amyAiProvider"><option value="openai">ChatGPT / OpenAI</option><option value="deepseek">DeepSeek</option><option value="gemini">Gemini</option></select><label>API Key</label><input id="amyAiApiKey" type="password" placeholder="Masukkan API key sesuai provider"><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="amySaveAiKey" type="button">Simpan API Key</button><button id="amyClearAiKey" type="button">Hapus</button></div><div class="amy-ai-status" id="amyAiStatus">Tersimpan lokal di HP.</div>`;
    const first = view.firstElementChild;
    view.insertBefore(panel, first ? first.nextSibling : null);
    const provider = qs('#amyAiProvider'), key = qs('#amyAiApiKey'), status = qs('#amyAiStatus');
    const savedProvider = localStorage.getItem('amy_ai_provider') || 'openai';
    provider.value = savedProvider;
    key.value = localStorage.getItem(`amy_ai_key_${savedProvider}`) || '';
    provider.onchange = () => { key.value = localStorage.getItem(`amy_ai_key_${provider.value}`) || ''; };
    qs('#amySaveAiKey').onclick = () => { localStorage.setItem('amy_ai_provider', provider.value); localStorage.setItem(`amy_ai_key_${provider.value}`, key.value.trim()); status.textContent = `API key ${provider.options[provider.selectedIndex].text} tersimpan.`; };
    qs('#amyClearAiKey').onclick = () => { localStorage.removeItem(`amy_ai_key_${provider.value}`); key.value = ''; status.textContent = 'API key dihapus.'; };
  }

  function createSelect(id, label, options) {
    const wrap = document.createElement('label');
    wrap.className = 'amy-journal-filter';
    wrap.innerHTML = `<span>${label}</span>`;
    const select = document.createElement('select'); select.id = id;
    options.forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); });
    wrap.append(select); return wrap;
  }

  function ensureJournalDashboard() {
    const view = qs('#journalView');
    if (!view || qs('#amyJournalDashboard')) return;
    const dashboard = document.createElement('section');
    dashboard.id = 'amyJournalDashboard'; dashboard.className = 'amy-journal-dashboard'; dashboard.dataset.amyJournalUpgrade = '1';
    dashboard.innerHTML = `<div class="amy-journal-stats" id="amyJournalStats" aria-live="polite"></div><div class="amy-journal-toolbar"><label class="amy-journal-search"><span>Cari jurnal</span><input id="amyJournalSearch" type="search" placeholder="Judul, pair, setup, emosi, kesalahan..."></label><div id="amyJournalFilterSlots" class="amy-journal-filter-slots"></div></div><div class="amy-journal-tools"><span id="amyJournalFilteredCount">0 jurnal</span><span id="amyJournalDraftStatus" class="amy-journal-draft-status">Draft kosong</span><button type="button" id="amyJournalExportCsv">Export CSV</button><button type="button" id="amyJournalExportJson">Export JSON</button><button type="button" id="amyJournalClearDraft">Hapus Draft</button><button type="button" id="amyJournalResetFilters">Reset Filter</button></div>`;
    const slots = qs('#amyJournalFilterSlots', dashboard);
    slots.append(createSelect('amyJournalResultFilter', 'Hasil', [['all','Semua hasil'],['Win','Win'],['Loss','Loss'],['BE','Break Even'],['Belum selesai','Belum selesai'],['Tidak entry','Tidak entry']]), createSelect('amyJournalMarketFilter', 'Market', [['all','Semua market']]), createSelect('amyJournalPeriodFilter', 'Periode', [['all','Semua waktu'],['7','7 hari'],['30','30 hari'],['month','Bulan ini'],['year','Tahun ini']]), createSelect('amyJournalSortFilter', 'Urutkan', [['newest','Terbaru'],['oldest','Terlama'],['pl-high','P/L tertinggi'],['pl-low','P/L terendah']]));
    qs('.section-head', view)?.insertAdjacentElement('afterend', dashboard);
    const saved = readFilters();
    qs('#amyJournalSearch').value = saved.query; qs('#amyJournalResultFilter').value = saved.result; qs('#amyJournalPeriodFilter').value = saved.period; qs('#amyJournalSortFilter').value = saved.sort;
    ['amyJournalSearch','amyJournalResultFilter','amyJournalMarketFilter','amyJournalPeriodFilter','amyJournalSortFilter'].forEach(id => { const el = qs(`#${id}`); el?.addEventListener(id === 'amyJournalSearch' ? 'input' : 'change', () => { saveCurrentFilters(); applyJournalFilters(); }); });
    qs('#amyJournalResetFilters')?.addEventListener('click', resetJournalFilters);
    qs('#amyJournalExportCsv')?.addEventListener('click', exportJournalCsv);
    qs('#amyJournalExportJson')?.addEventListener('click', exportJournalJson);
    qs('#amyJournalClearDraft')?.addEventListener('click', clearJournalDraft);
  }

  function updateMarketOptions(journals) {
    const select = qs('#amyJournalMarketFilter'); if (!select) return;
    const saved = readFilters().market;
    const markets = [...new Set(journals.map(j => String(j?.market || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,'id'));
    const wanted = ['all', ...markets];
    if ([...select.options].map(o => o.value).join('|') !== wanted.join('|')) {
      select.replaceChildren(); wanted.forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = value === 'all' ? 'Semua market' : value; select.append(option); });
    }
    select.value = wanted.includes(saved) ? saved : 'all';
  }

  function statCard(label, value, tone = '') { return `<article class="amy-journal-stat ${tone}"><span>${label}</span><strong>${value}</strong></article>`; }

  function renderJournalStats(journals) {
    const target = qs('#amyJournalStats'); if (!target) return;
    const stats = calculateStats(journals);
    const factor = stats.profitFactor === Infinity ? '∞' : stats.profitFactor ? stats.profitFactor.toFixed(2) : '-';
    target.innerHTML = [statCard('Total Jurnal', stats.total), statCard('Win Rate', `${stats.winRate}%`, stats.winRate >= 50 ? 'is-positive' : stats.finished ? 'is-negative' : ''), statCard('Net P/L', formatAmount(stats.net), stats.net > 0 ? 'is-positive' : stats.net < 0 ? 'is-negative' : ''), statCard('Profit Factor', factor, stats.profitFactor >= 1 ? 'is-positive' : stats.profitFactor > 0 ? 'is-negative' : ''), statCard('Rata-rata Trade', formatAmount(stats.average), stats.average > 0 ? 'is-positive' : stats.average < 0 ? 'is-negative' : ''), statCard('Streak Jurnal', `${stats.streak} hari`), statCard('Max Drawdown', formatAmount(stats.maxDrawdown), stats.maxDrawdown > 0 ? 'is-negative' : '')].join('');
  }

  function saveCurrentFilters() {
    const filters = { query: qs('#amyJournalSearch')?.value || '', result: qs('#amyJournalResultFilter')?.value || 'all', market: qs('#amyJournalMarketFilter')?.value || 'all', period: qs('#amyJournalPeriodFilter')?.value || 'all', sort: qs('#amyJournalSortFilter')?.value || 'newest' };
    writeJson(JOURNAL_FILTER_KEY, filters); return filters;
  }

  function resetJournalFilters() {
    localStorage.removeItem(JOURNAL_FILTER_KEY);
    if (qs('#amyJournalSearch')) qs('#amyJournalSearch').value = '';
    if (qs('#amyJournalResultFilter')) qs('#amyJournalResultFilter').value = 'all';
    if (qs('#amyJournalMarketFilter')) qs('#amyJournalMarketFilter').value = 'all';
    if (qs('#amyJournalPeriodFilter')) qs('#amyJournalPeriodFilter').value = 'all';
    if (qs('#amyJournalSortFilter')) qs('#amyJournalSortFilter').value = 'newest';
    saveCurrentFilters(); applyJournalFilters();
  }

  function applyJournalFilters() {
    const journals = readJournals(), extras = readExtras(), filters = saveCurrentFilters();
    const filtered = sortJournals(filterJournals(journals, filters, extras), filters.sort);
    const visibleIds = new Set(filtered.map(j => String(j.id))), visibleDates = new Set(filtered.map(j => String(j.date || '').slice(0,10)));
    qsa('.journal-card[data-id]', qs('#journalView') || document).forEach(card => { card.hidden = !visibleIds.has(String(card.dataset.id || '')); });
    const groups = qsa('.journal-date-group', qs('#journalView') || document);
    groups.forEach(group => { group.hidden = !visibleDates.has(String(group.dataset.journalDateGroup || '')); });
    const list = qs('#journalList');
    if (list && filters.sort.startsWith('pl-')) {
      const byDate = new Map(); filtered.forEach(j => { const key = String(j.date || '').slice(0,10); byDate.set(key, (byDate.get(key) || 0) + netForJournal(j)); });
      groups.sort((a,b) => { const av = byDate.get(a.dataset.journalDateGroup) || 0, bv = byDate.get(b.dataset.journalDateGroup) || 0; return filters.sort === 'pl-high' ? bv-av : av-bv; }).forEach(group => list.append(group));
    } else if (list) groups.sort((a,b) => { const av = dateValue(a.dataset.journalDateGroup), bv = dateValue(b.dataset.journalDateGroup); return filters.sort === 'oldest' ? av-bv : bv-av; }).forEach(group => list.append(group));
    if (qs('#amyJournalFilteredCount')) qs('#amyJournalFilteredCount').textContent = filtered.length === journals.length ? `${journals.length} jurnal` : `${filtered.length} dari ${journals.length} jurnal`;
    if (qs('#journalCount')) qs('#journalCount').textContent = filtered.length === journals.length ? `${journals.length} jurnal` : `${filtered.length}/${journals.length} jurnal`;
    if (qs('#journalEmpty')) qs('#journalEmpty').hidden = filtered.length > 0;
  }

  function ensureDatalists() {
    const form = qs('#journalForm'); if (!form || qs('#amyJournalMarkets')) return;
    [['amyJournalMarkets',['XAUUSD','BTCUSD','EURUSD','GBPUSD','USDJPY','NAS100','US30']],['amyJournalSetups',['Liquidity Sweep','Sweep → MSS → FVG','Order Block','Fair Value Gap','CHOCH / MSS','Breakout Retest','No Trade']],['amyJournalEmotions',['Tenang','Disiplin','Ragu','Takut','FOMO','Serakah','Overconfidence','Revenge']]].forEach(([id,values]) => { const list = document.createElement('datalist'); list.id=id; values.forEach(value => { const option=document.createElement('option'); option.value=value; list.append(option); }); form.append(list); });
    qs('#journalMarketInput')?.setAttribute('list','amyJournalMarkets'); qs('#journalSetupInput')?.setAttribute('list','amyJournalSetups'); qs('#journalEmotionInput')?.setAttribute('list','amyJournalEmotions');
  }

  function ensureQuickActions() {
    const form = qs('#journalForm'); if (!form || qs('#amyJournalQuickActions')) return;
    const row = document.createElement('div'); row.id='amyJournalQuickActions'; row.className='amy-journal-quick-actions'; row.innerHTML='<span>Input cepat</span><button type="button" data-result="Win">Win</button><button type="button" data-result="Loss">Loss</button><button type="button" data-result="BE">BE</button><button type="button" data-result="Tidak entry">Tidak Entry</button>';
    qs('#journalId',form)?.insertAdjacentElement('afterend',row);
    row.addEventListener('click',event => { const button=event.target.closest('[data-result]'); if(!button)return; if(qs('#journalResultInput'))qs('#journalResultInput').value=button.dataset.result; if(button.dataset.result==='BE'||button.dataset.result==='Tidak entry'){if(qs('#journalProfitInput'))qs('#journalProfitInput').value='';if(qs('#journalLossInput'))qs('#journalLossInput').value='';} captureDraftSoon(); });
  }

  function ensureExtendedFields() {
    const form=qs('#journalForm'); if(!form||qs('#amyJournalExtendedFields'))return;
    const section=document.createElement('section'); section.id='amyJournalExtendedFields'; section.className='amy-journal-extended'; section.dataset.amyJournalUpgrade='1';
    section.innerHTML='<div class="amy-journal-extended-head"><div><span>Trade Plan</span><strong>Detail eksekusi</strong></div><output id="amyJournalRrOutput">RR: -</output></div><div class="amy-journal-extra-grid"><label><span>Arah</span><select id="amyJournalDirection"><option value="">-</option><option value="BUY">BUY</option><option value="SELL">SELL</option><option value="NO TRADE">NO TRADE</option></select></label><label><span>Session</span><select id="amyJournalSession"><option value="">-</option><option value="ASIA">Asia</option><option value="LONDON">London</option><option value="NEW YORK">New York</option><option value="OTHER">Lainnya</option></select></label><label><span>Timeframe</span><select id="amyJournalTimeframe"><option value="">-</option><option>M1</option><option>M5</option><option>M15</option><option>M30</option><option>H1</option><option>H4</option><option>D1</option></select></label><label><span>Risk %</span><input id="amyJournalRiskPercent" type="number" min="0" max="100" step="0.1" inputmode="decimal" placeholder="1"></label><label><span>Entry</span><input id="amyJournalEntry" type="number" step="0.01" inputmode="decimal"></label><label><span>Stop Loss</span><input id="amyJournalSl" type="number" step="0.01" inputmode="decimal"></label><label><span>Take Profit</span><input id="amyJournalTp" type="number" step="0.01" inputmode="decimal"></label></div><div class="amy-journal-checklist"><label><input id="amyJournalCheckSetup" type="checkbox"> Setup sesuai plan</label><label><input id="amyJournalCheckRisk" type="checkbox"> Risk sesuai batas</label><label><input id="amyJournalCheckConfirm" type="checkbox"> Menunggu konfirmasi</label><label><input id="amyJournalCheckNoFomo" type="checkbox"> Tidak FOMO</label></div><p id="amyJournalValidation" class="amy-journal-validation"></p>';
    const fileDrop=qs('label.file-drop',form); if(fileDrop)form.insertBefore(section,fileDrop);else form.append(section);
    qsa('input,select',section).forEach(el=>{el.addEventListener('input',()=>{updateRrOutput();captureDraftSoon();});el.addEventListener('change',()=>{updateRrOutput();captureDraftSoon();});});
  }

  function readExtendedForm() {
    const direction=qs('#amyJournalDirection')?.value||'', entry=toNumber(qs('#amyJournalEntry')?.value), sl=toNumber(qs('#amyJournalSl')?.value), tp=toNumber(qs('#amyJournalTp')?.value);
    let rr=0; if(entry&&sl&&tp&&entry!==sl){const risk=direction==='BUY'?entry-sl:direction==='SELL'?sl-entry:Math.abs(entry-sl);const reward=direction==='BUY'?tp-entry:direction==='SELL'?entry-tp:Math.abs(tp-entry);if(risk>0&&reward>0)rr=reward/risk;}
    const checks={setup:!!qs('#amyJournalCheckSetup')?.checked,risk:!!qs('#amyJournalCheckRisk')?.checked,confirm:!!qs('#amyJournalCheckConfirm')?.checked,noFomo:!!qs('#amyJournalCheckNoFomo')?.checked};
    return {direction,session:qs('#amyJournalSession')?.value||'',timeframe:qs('#amyJournalTimeframe')?.value||'',riskPercent:Math.max(0,toNumber(qs('#amyJournalRiskPercent')?.value)),entry,sl,tp,rr,checks,compliance:Math.round(Object.values(checks).filter(Boolean).length/4*100),updatedAt:new Date().toISOString()};
  }

  function fillExtendedForm(journalId='') {
    const extra=readExtras()[journalId]||{};
    const values={amyJournalDirection:extra.direction||'',amyJournalSession:extra.session||'',amyJournalTimeframe:extra.timeframe||'',amyJournalRiskPercent:extra.riskPercent||'',amyJournalEntry:extra.entry||'',amyJournalSl:extra.sl||'',amyJournalTp:extra.tp||''};
    Object.entries(values).forEach(([id,value])=>{const el=qs(`#${id}`);if(el)el.value=value;}); const checks=extra.checks||{};
    if(qs('#amyJournalCheckSetup'))qs('#amyJournalCheckSetup').checked=!!checks.setup;if(qs('#amyJournalCheckRisk'))qs('#amyJournalCheckRisk').checked=!!checks.risk;if(qs('#amyJournalCheckConfirm'))qs('#amyJournalCheckConfirm').checked=!!checks.confirm;if(qs('#amyJournalCheckNoFomo'))qs('#amyJournalCheckNoFomo').checked=!!checks.noFomo;updateRrOutput();
  }
  function clearExtendedForm(){fillExtendedForm('');}

  function updateRrOutput() {
    const extra=readExtendedForm(); if(qs('#amyJournalRrOutput'))qs('#amyJournalRrOutput').textContent=extra.rr>0?`RR: 1:${extra.rr.toFixed(2)}`:'RR: -';
    const validation=qs('#amyJournalValidation'); if(!validation)return; const result=qs('#journalResultInput')?.value||'',profit=toNumber(qs('#journalProfitInput')?.value),loss=toNumber(qs('#journalLossInput')?.value),messages=[];
    if(extra.direction&&extra.direction!=='NO TRADE'&&extra.entry&&extra.sl&&extra.tp&&!extra.rr)messages.push('Entry, SL, atau TP tidak sesuai arah trade.');if(result==='Win'&&loss>0&&profit<=0)messages.push('Hasil Win tetapi nilai profit kosong.');if(result==='Loss'&&profit>0&&loss<=0)messages.push('Hasil Loss tetapi nilai loss kosong.');if(extra.riskPercent>5)messages.push('Risk di atas 5%. Periksa kembali ukuran risiko.');validation.textContent=messages.join(' ');validation.classList.toggle('has-warning',messages.length>0);
  }

  function ensureDraftListeners() {
    const form=qs('#journalForm');if(!form||form.dataset.amyDraftBound==='1')return;form.dataset.amyDraftBound='1';form.addEventListener('input',captureDraftSoon);form.addEventListener('change',captureDraftSoon);document.addEventListener('click',handleJournalActionCapture,true);form.addEventListener('submit',handleJournalSubmitCapture,true);
  }

  function collectDraft(){const form=qs('#journalForm');if(!form)return null;return{savedAt:Date.now(),editingId:qs('#journalId')?.value||'',date:qs('#journalDateInput')?.value||'',market:qs('#journalMarketInput')?.value||'',title:qs('#journalTitleInput')?.value||'',setup:qs('#journalSetupInput')?.value||'',result:qs('#journalResultInput')?.value||'Belum selesai',profit:qs('#journalProfitInput')?.value||'',loss:qs('#journalLossInput')?.value||'',evaluation:qs('#journalEvaluationInput')?.value||'',mistakes:qs('#journalMistakesInput')?.value||'',lessons:qs('#journalLessonsInput')?.value||'',emotion:qs('#journalEmotionInput')?.value||'',extra:readExtendedForm()};}
  function draftHasContent(draft){if(!draft)return false;return[draft.market,draft.title,draft.setup,draft.profit,draft.loss,draft.evaluation,draft.mistakes,draft.lessons,draft.emotion,draft.extra?.direction,draft.extra?.entry,draft.extra?.sl,draft.extra?.tp].some(value=>String(value||'').trim());}
  function captureDraftSoon(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{const form=qs('#journalForm');if(!form||form.hidden)return;const draft=collectDraft();if(draftHasContent(draft))writeJson(JOURNAL_DRAFT_KEY,draft);updateDraftStatus();},350);}

  function restoreDraftForNewJournal(){const draft=readJson(JOURNAL_DRAFT_KEY,null);if(!draft||draft.editingId||Date.now()-Number(draft.savedAt||0)>MAX_DRAFT_AGE||!draftHasContent(draft))return false;const values={journalDateInput:draft.date||todayKey(),journalMarketInput:draft.market||'',journalTitleInput:draft.title||'',journalSetupInput:draft.setup||'',journalResultInput:normalizeResult(draft.result),journalProfitInput:draft.profit||'',journalLossInput:draft.loss||'',journalEvaluationInput:draft.evaluation||'',journalMistakesInput:draft.mistakes||'',journalLessonsInput:draft.lessons||'',journalEmotionInput:draft.emotion||''};Object.entries(values).forEach(([id,value])=>{const el=qs(`#${id}`);if(el)el.value=value;});if(draft.extra){const temp=readExtras();temp.__draft__=draft.extra;writeJson(JOURNAL_EXTRA_KEY,temp);fillExtendedForm('__draft__');delete temp.__draft__;writeJson(JOURNAL_EXTRA_KEY,temp);}if(qs('#journalMessage'))qs('#journalMessage').textContent='Draft otomatis dipulihkan.';updateRrOutput();return true;}
  function clearJournalDraft(){localStorage.removeItem(JOURNAL_DRAFT_KEY);updateDraftStatus();if(qs('#journalMessage')&&!qs('#journalForm')?.hidden)qs('#journalMessage').textContent='Draft dihapus.';}
  function updateDraftStatus(){const target=qs('#amyJournalDraftStatus');if(!target)return;const draft=readJson(JOURNAL_DRAFT_KEY,null);if(!draft||!draftHasContent(draft)){target.textContent='Draft kosong';target.classList.remove('has-draft');return;}const minutes=Math.max(0,Math.floor((Date.now()-Number(draft.savedAt||0))/60000));target.textContent=minutes<1?'Draft tersimpan':`Draft ${minutes} menit lalu`;target.classList.add('has-draft');}
  function saveExtraForJournal(id,extra){if(!id)return;const extras=readExtras();extras[id]={...extra,updatedAt:new Date().toISOString()};writeJson(JOURNAL_EXTRA_KEY,extras);}

  function handleJournalSubmitCapture(){const snapshot=collectDraft(),knownId=snapshot?.editingId||'',submittedAt=Date.now(),previousIds=new Set(readJournals().map(j=>String(j.id)));[250,700,1500,3000,6000].forEach(delay=>{setTimeout(()=>{const journals=readJournals();let targetId=knownId;if(!targetId){const candidates=journals.filter(j=>{if(previousIds.has(String(j.id)))return false;if(snapshot?.title&&String(j.title||'')!==String(snapshot.title))return false;if(snapshot?.date&&String(j.date||'')!==String(snapshot.date))return false;return dateValue(j.updatedAt||j.createdAt)>=submittedAt-5000;});targetId=candidates.sort((a,b)=>dateValue(b.updatedAt||b.createdAt)-dateValue(a.updatedAt||a.createdAt))[0]?.id||'';}if(!targetId)return;const saved=journals.find(j=>String(j.id)===String(targetId));if(!saved||dateValue(saved.updatedAt||saved.createdAt)<submittedAt-5000)return;saveExtraForJournal(targetId,snapshot.extra||{});localStorage.removeItem(JOURNAL_DRAFT_KEY);updateDraftStatus();scheduleEnhance();},delay);});}

  function handleJournalActionCapture(event){const button=event.target.closest('button');if(!button)return;if(button.id==='newJournalBtn'){setTimeout(()=>{clearExtendedForm();restoreDraftForNewJournal();},80);return;}const card=button.closest('.journal-card[data-id]');if(!card)return;const text=String(button.textContent||'').trim().toLowerCase();if(text==='edit')setTimeout(()=>fillExtendedForm(card.dataset.id||''),80);if(button.dataset.amyDuplicate==='1'){event.preventDefault();event.stopPropagation();duplicateJournal(card.dataset.id||'');}}
  function complianceText(extra){return extra&&Number.isFinite(Number(extra.compliance))?`${Number(extra.compliance)}% disiplin`:'';}

  function applyExtraDetails(){const extras=readExtras();qsa('.journal-card[data-id]',qs('#journalView')||document).forEach(card=>{const id=String(card.dataset.id||''),extra=extras[id]||{},head=qs('.journal-card-head',card);let strip=qs('.amy-journal-extra-strip',card);const badges=[extra.direction,extra.session,extra.timeframe,extra.rr>0?`RR 1:${Number(extra.rr).toFixed(2)}`:'',extra.riskPercent>0?`Risk ${formatAmount(extra.riskPercent)}%`:'',complianceText(extra)].filter(Boolean);if(badges.length){if(!strip){strip=document.createElement('div');strip.className='amy-journal-extra-strip';head?.insertAdjacentElement('afterend',strip);}strip.innerHTML=badges.map(value=>`<span>${String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</span>`).join('');}else strip?.remove();const actions=qs('.journal-actions',card);if(actions&&!qs('[data-amy-duplicate="1"]',actions)){const duplicate=document.createElement('button');duplicate.type='button';duplicate.className='small-button';duplicate.dataset.amyDuplicate='1';duplicate.textContent='Salin';actions.insertBefore(duplicate,actions.lastElementChild||null);}const body=qs('.journal-body',card);let plan=qs('.amy-journal-plan-detail',card);if(!body||body.hidden||!badges.length){plan?.remove();return;}if(!plan){plan=document.createElement('section');plan.className='amy-journal-plan-detail';body.insertBefore(plan,body.firstChild);}const rows=[['Arah',extra.direction],['Session',extra.session],['Timeframe',extra.timeframe],['Entry',extra.entry?formatAmount(extra.entry):''],['SL',extra.sl?formatAmount(extra.sl):''],['TP',extra.tp?formatAmount(extra.tp):''],['RR',extra.rr>0?`1:${Number(extra.rr).toFixed(2)}`:''],['Risk',extra.riskPercent>0?`${formatAmount(extra.riskPercent)}%`:''],['Disiplin',complianceText(extra)]].filter(([,value])=>value);plan.innerHTML=rows.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');});}

  function duplicateJournal(id){const journals=readJournals(),source=journals.find(j=>String(j.id)===String(id));if(!source)return;const now=new Date().toISOString(),cloneId=globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():`journal-copy-${Date.now()}-${Math.random().toString(16).slice(2)}`;const clone={...source,id:cloneId,title:`${source.title||'Jurnal Trading'} (Salinan)`,attachments:[],revisionHistory:[],createdAt:now,updatedAt:now};writeJson(JOURNAL_KEY,[clone,...journals]);const extras=readExtras();if(extras[id]){extras[cloneId]={...extras[id],updatedAt:now};writeJson(JOURNAL_EXTRA_KEY,extras);}sessionStorage.setItem('amyfx.journal.open.after.reload',cloneId);location.reload();}
  function csvCell(value){const text=String(value??'').replace(/\r?\n/g,' ');return `"${text.replace(/"/g,'""')}"`;}
  function downloadText(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportJournalCsv(){const filters=readFilters(),journals=sortJournals(filterJournals(readJournals(),filters,readExtras()),filters.sort),extras=readExtras(),headers=['Tanggal','Judul','Market','Setup','Hasil','Profit','Loss','Net P/L','Emosi','Evaluasi','Kesalahan','Pelajaran','Arah','Session','Timeframe','Entry','SL','TP','RR','Risk %','Disiplin %'];const rows=journals.map(j=>{const e=extras[j.id]||{};return[j.date,j.title,j.market,j.setup,j.result,toNumber(j.profit),toNumber(j.loss),netForJournal(j),j.emotion,j.evaluation,j.mistakes,j.lessons,e.direction,e.session,e.timeframe,e.entry||'',e.sl||'',e.tp||'',e.rr?Number(e.rr).toFixed(2):'',e.riskPercent||'',e.compliance??''].map(csvCell).join(',');});downloadText(`amy-fx-jurnal-${todayKey()}.csv`,`\uFEFF${headers.map(csvCell).join(',')}\n${rows.join('\n')}`,'text/csv;charset=utf-8');}
  function exportJournalJson(){downloadText(`amy-fx-jurnal-${todayKey()}.json`,JSON.stringify({version:2,exportedAt:new Date().toISOString(),journals:readJournals(),extras:readExtras()},null,2),'application/json;charset=utf-8');}

  function reopenCopiedJournal(){const id=sessionStorage.getItem('amyfx.journal.open.after.reload');if(!id)return;sessionStorage.removeItem('amyfx.journal.open.after.reload');setTimeout(()=>{const journal=readJournals().find(row=>String(row.id)===String(id));if(!journal)return;qsa('[data-view="journal"]').find(button=>button.closest('.side-drawer-menu'))?.click();setTimeout(()=>{qs(`[data-journal-date-group="${window.CSS.escape(journal.date||'')}"]`)?.querySelector('.journal-date-head')?.click();},250);},300);}
  function installHooks(){if(hooksInstalled)return;const original=window.renderJournals;if(typeof original!=='function')return;window.renderJournals=function(){const result=original.apply(this,arguments);scheduleEnhance();return result;};window.renderJournals.__amyJournalUpgrade=true;hooksInstalled=true;}
  function scheduleEnhance(){if(enhanceFrame)cancelAnimationFrame(enhanceFrame);enhanceFrame=requestAnimationFrame(()=>{enhanceFrame=0;enhanceJournal();});}
  function enhanceJournal(){if(enhancing)return;enhancing=true;try{polyfillCssEscape();ensureLegacyGlobals();updateLibraryControls();ensureAiKeyPanel();ensureJournalDashboard();ensureDatalists();ensureQuickActions();ensureExtendedFields();ensureDraftListeners();const journals=readJournals();updateMarketOptions(journals);renderJournalStats(journals);updateDraftStatus();applyExtraDetails();applyJournalFilters();updateRrOutput();installHooks();}finally{enhancing=false;}}
  function bootUpgrade(){polyfillCssEscape();ensureLegacyGlobals();scheduleEnhance();reopenCopiedJournal();setTimeout(scheduleEnhance,250);setTimeout(scheduleEnhance,900);}

  polyfillCssEscape();ensureLegacyGlobals();
  window.AmyJournalUpgrade={calculateStats,calculateStreak,filterJournals,sortJournals,netForJournal,exportJournalCsv,exportJournalJson,enhance:scheduleEnhance};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootUpgrade,{once:true});else bootUpgrade();
  document.addEventListener('click',()=>setTimeout(scheduleEnhance,60),true);
  window.addEventListener('storage',event=>{if([JOURNAL_KEY,JOURNAL_EXTRA_KEY,JOURNAL_FILTER_KEY].includes(event.key))scheduleEnhance();});
  window.addEventListener('pageshow',scheduleEnhance);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleEnhance();});
})();

/* AMYFX_NOTIFY_GUARD_START */
(function(){
  if(window.__amyfxNotifyGuardLoaded)return;
  window.__amyfxNotifyGuardLoaded=true;
  const STORE='amyfx.notify.last.sent',COOLDOWN=5*60*1000,RESUME_MUTE=9000,MAX_ITEMS=80;let muteUntil=0;
  function now(){return Date.now()}
  function norm(x){return String(x||'').replace(/\d+([.,]\d+)?/g,'#').replace(/\s+/g,' ').trim().slice(0,180)}
  function kind(t,b){const x=(String(t||'')+' '+String(b||'')).toLowerCase();if(x.includes('scanner terhubung'))return'scanner_connected';if(x.includes('amy fx aktif'))return'scanner_alive';if(x.includes('liquidity sweep'))return'liquidity_sweep';if(x.includes('ssl')||x.includes('bsl'))return'bsl_ssl_touched';return'amyfx_alert'}
  function key(t,b){return kind(t,b)+'|'+norm(t)+'|'+norm(b)}
  function read(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}}
  function write(o){const arr=Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,MAX_ITEMS);localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(arr)))}
  function route(t,b){const k=kind(t,b);if(k==='liquidity_sweep'||k==='bsl_ssl_touched')return'Analyze';if(k==='scanner_connected'||k==='scanner_alive')return'Dashboard';return'Analyze'}
  function openRoute(t,b){const r=route(t,b);try{localStorage.setItem('amyfx.notification.route',r)}catch(e){}try{if(typeof setTab==='function')setTab(r)}catch(e){}try{window.focus()}catch(e){}}
  function allow(t,b){const n=now(),k=key(t,b);if(n<muteUntil&&kind(t,b)!=='scanner_alive')return false;const last=read(),prev=last[k]||0;if(n-prev<COOLDOWN)return false;last[k]=n;write(last);return true}
  document.addEventListener('visibilitychange',function(){if(!document.hidden)muteUntil=now()+RESUME_MUTE});window.addEventListener('pageshow',function(){muteUntil=now()+RESUME_MUTE});
  try{if('Notification'in window&&!window.Notification.__amyfxWrapped){const OriginalNotification=window.Notification;const WrappedNotification=function(title,opts){opts=opts||{};const body=opts.body||'';if(!allow(title,body))return null;const n=new OriginalNotification(title,opts);n.onclick=function(){openRoute(title,body)};return n};Object.getOwnPropertyNames(OriginalNotification).forEach(function(k){try{WrappedNotification[k]=OriginalNotification[k]}catch(e){}});WrappedNotification.prototype=OriginalNotification.prototype;WrappedNotification.__amyfxWrapped=true;window.Notification=WrappedNotification}}catch(e){}
  function wrapBridge(obj){if(!obj||obj.__amyfxNotifyBridgeWrapped)return;Object.keys(obj).forEach(function(k){if(!/notify|notification|alert|push/i.test(k)||typeof obj[k]!=='function')return;const old=obj[k];obj[k]=function(){const args=[].slice.call(arguments),title=args[0]||'Amy FX',body=args[1]||args[0]||'';if(!allow(title,body))return null;try{return old.apply(this,args)}catch(e){return null}}});obj.__amyfxNotifyBridgeWrapped=true}
  function wrapAll(){['Android','AndroidBridge','AmyFX','AmyFx','Native','NotificationBridge','AppBridge'].forEach(function(n){try{wrapBridge(window[n])}catch(e){}})}
  wrapAll();setInterval(wrapAll,1500);window.__amyfxNotifyAllow=allow;window.__amyfxNotifyOpenRoute=openRoute;
})();
/* AMYFX_NOTIFY_GUARD_END */
