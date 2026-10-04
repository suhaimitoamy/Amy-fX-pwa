document.addEventListener('DOMContentLoaded', () => {
  const mainContent = document.getElementById('main-content');
  const navBtns = document.querySelectorAll('.nav-btn');

  const projects = [
    { id: 'mapping', title: 'Mapping', badge: 'Mapping', icon: 'mapping', desc: '', target: 'apps/mapping/index.html' },
    { id: 'intel', title: 'Berita', badge: 'News', icon: 'intel', desc: '', target: 'apps/market-intel/index.html' },
    { id: 'jurnal', title: 'Jurnal Trading', badge: 'Jurnal', icon: 'journal', desc: '', target: 'apps/journal/index.html' },
    { id: 'academy', title: 'Tutorial Trading', badge: 'Learning', icon: 'academy', desc: '', target: 'apps/academy/index.html' },
  ];

  const practiceItems = [
    {
      id: 'fractal-advisor',
      title: 'Fractal Advisor & Laya AI',
      badge: 'System 1',
      icon: 'indicator',
      desc: 'Pencocokan fraktal 187k candle & audit gerbang AI Laya sebelum entry.',
      target: 'apps/fractal-advisor/index.html'
    },
    {
      id: 'chart-analysis',
      title: 'Chart Analysis',
      badge: 'Praktik',
      icon: 'indicator',
      desc: 'Analisis chart, gambar level, dan impor data historis candle.',
      target: 'apps/academy/trading-practice/chart-analysis.html'
    },
    {
      id: 'candle-replay',
      title: 'Candle Replay',
      badge: 'Replay',
      icon: 'mapping',
      desc: 'Latihan membaca candle satu per satu dan catat keputusan trading.',
      target: 'apps/academy/trading-practice/candle-replay.html'
    },
    {
      id: 'guided-practice',
      title: 'Guided Practice',
      badge: 'Latihan',
      icon: 'academy',
      desc: '60 soal acak ICT dengan chart ilustratif & evaluasi terpandu.',
      target: 'apps/academy/trading-practice/guided-practice.html'
    },
    {
      id: 'backtest-history',
      title: 'Riwayat Backtest Lokal',
      badge: 'Riwayat',
      icon: 'journal',
      desc: 'Tinjau setup manual, hasil forward candle, dan jurnal latihan.',
      target: 'apps/academy/trading-practice/backtest-history.html'
    }
  ];

  function showLoadingOverlay() {
    if (window.AmyFXLoading?.start) {
      window.AmyFXLoading.start({
        delay: 350,
        message: 'Memuat modul…',
        timeout: 12000,
        retry: () => location.reload()
      });
      return;
    }
    document.documentElement.classList.add('is-loading');
  }

  let indicators = [
    { name: 'Memuat data...', category: 'Loading', desc: 'Mengambil indikator lokal...', code: 'Loading...' }
  ];

  let selectedIndicator = indicators[0];
  const fallbackIndicatorsEmbedded = [{"name": "Amy Breakout Retest Rejection Assistant", "category": "Pine Script", "desc": "File sumber lokal: AMY_Breakout_Retest_Rejection_Assistant.pine.txt", "url": "apps/indikator/files/AMY_Breakout_Retest_Rejection_Assistant.pine.txt", "code": ""}, {"name": "Amy Kronos Filter Bot Signal", "category": "Pine Script", "desc": "File sumber lokal: AMY_Kronos_Filter_Bot_Signal.pine.txt", "url": "apps/indikator/files/AMY_Kronos_Filter_Bot_Signal.pine.txt", "code": ""}, {"name": "Amy Neo Wave Structure Entry Map", "category": "Pine Script", "desc": "File sumber lokal: AMY_Neo_Wave_Structure_Entry_Map.pine.txt", "url": "apps/indikator/files/AMY_Neo_Wave_Structure_Entry_Map.pine.txt", "code": ""}, {"name": "Amy Pro Clean Sd Snr Fibo Scalping Engine Nowarning", "category": "Pine Script", "desc": "File sumber lokal: AMY_PRO_Clean_SD_SNR_Fibo_Scalping_Engine_NoWarning.pine.txt", "url": "apps/indikator/files/AMY_PRO_Clean_SD_SNR_Fibo_Scalping_Engine_NoWarning.pine.txt", "code": ""}, {"name": "Amy Pro Sd Snr Fibo Scalping Engine", "category": "Pine Script", "desc": "File sumber lokal: AMY_PRO_SD_SNR_Fibo_Scalping_Engine.pine.txt", "url": "apps/indikator/files/AMY_PRO_SD_SNR_Fibo_Scalping_Engine.pine.txt", "code": ""}, {"name": "Amy Supply Demand Snr Fibo Entry Calculator", "category": "Pine Script", "desc": "File sumber lokal: AMY_Supply_Demand_SNR_Fibo_Entry_Calculator.pine.txt", "url": "apps/indikator/files/AMY_Supply_Demand_SNR_Fibo_Entry_Calculator.pine.txt", "code": ""}, {"name": "Amy Ultimate Professional Suite", "category": "Pine Script", "desc": "File sumber lokal: AMY_Ultimate_Professional_Suite.pine", "url": "apps/indikator/files/AMY_Ultimate_Professional_Suite.pine", "code": ""}, {"name": "Gcx Entry Only V1", "category": "Pine Script", "desc": "File sumber lokal: GCX-Entry-Only-V1.pine", "url": "apps/indikator/files/GCX-Entry-Only-V1.pine", "code": ""}, {"name": "Gcx Matrix V12", "category": "Pine Script", "desc": "File sumber lokal: GCX-Matrix-V12.pine", "url": "apps/indikator/files/GCX-Matrix-V12.pine", "code": ""}, {"name": "Ict Yang Di Sempurnakan Edited", "category": "Pine Script", "desc": "File sumber lokal: ICT yang di sempurnakan edited.pine", "url": "apps/indikator/files/ICT yang di sempurnakan edited.pine", "code": ""}, {"name": "Ict Amy Entry Assistant V3 Break Retest Rejection", "category": "Pine Script", "desc": "File sumber lokal: ICT_AMY_Entry_Assistant_V3_Break_Retest_Rejection.pine.txt", "url": "apps/indikator/files/ICT_AMY_Entry_Assistant_V3_Break_Retest_Rejection.pine.txt", "code": ""}, {"name": "Ict Amy Entry Assistant V3 Mathzone Stable Nowarning", "category": "Pine Script", "desc": "File sumber lokal: ICT_AMY_Entry_Assistant_V3_MathZone_Stable_NoWarning.pine.txt", "url": "apps/indikator/files/ICT_AMY_Entry_Assistant_V3_MathZone_Stable_NoWarning.pine.txt", "code": ""}, {"name": "Ict Concepts Amygmgo Fixed Ready", "category": "Pine Script", "desc": "File sumber lokal: ICT_Concepts_amygmgo_FIXED_READY.pine", "url": "apps/indikator/files/ICT_Concepts_amygmgo_FIXED_READY.pine", "code": ""}, {"name": "Ict Validated Smc V1 Clean", "category": "Pine Script", "desc": "File sumber lokal: ICT_Validated_SMC_v1_clean.pine", "url": "apps/indikator/files/ICT_Validated_SMC_v1_clean.pine", "code": ""}, {"name": "Smc", "category": "Pine Script", "desc": "File sumber lokal: Smc.pine", "url": "apps/indikator/files/Smc.pine", "code": ""}, {"name": "Indikator Baru", "category": "Pine Script", "desc": "File sumber lokal: indikator-baru.pine", "url": "apps/indikator/files/indikator-baru.pine", "code": ""}, {"name": "Indikator V1", "category": "Pine Script", "desc": "File sumber lokal: indikator-v1.pine", "url": "apps/indikator/files/indikator-v1.pine", "code": ""}, {"name": "Indikator V10", "category": "Pine Script", "desc": "File sumber lokal: indikator-v10.pine", "url": "apps/indikator/files/indikator-v10.pine", "code": ""}, {"name": "Indikator V2", "category": "Pine Script", "desc": "File sumber lokal: indikator-v2.pine", "url": "apps/indikator/files/indikator-v2.pine", "code": ""}, {"name": "Indikator V3", "category": "Pine Script", "desc": "File sumber lokal: indikator-v3.pine", "url": "apps/indikator/files/indikator-v3.pine", "code": ""}, {"name": "Indikator V3 V4", "category": "Pine Script", "desc": "File sumber lokal: indikator-v3_v4.pine", "url": "apps/indikator/files/indikator-v3_v4.pine", "code": ""}];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;' }[ch]));
  }

  function readJsonSafe(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null || raw === '') return fallback;
      return JSON.parse(raw);
    } catch (_) {
      try { localStorage.removeItem(key); } catch (_) {}
      return fallback;
    }
  }

  function readJsonArray(key) {
    const value = readJsonSafe(key, []);
    return Array.isArray(value) ? value : [];
  }

  function deleteIndexedDatabase(name) {
    return new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(false);
      let settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      try {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => finish(true);
        request.onerror = () => finish(false);
        request.onblocked = () => finish(false);
        setTimeout(() => finish(false), 2500);
      } catch (_) { finish(false); }
    });
  }

  async function clearPersonalLocalData() {
    const keys = [
      'amy_mapping_logs', 'amy_mapping_analyses', 'amy_mapping_setups',
      'amy_mapping_lifecycle_v4', 'amy_mapping_active_pointer_v4',
      'amy_entry_watch_state_v3', 'amy_recent_projects', 'amy_saved_code',
      'amy_journal_entries', 'amy_mapping_notified'
    ];
    keys.forEach(key => { try { localStorage.removeItem(key); } catch (_) {} });
    return deleteIndexedDatabase('tradingLibraryManager.files');
  }

  async function loadRepoIndicators() {
    async function readLocalManifest() {
      const paths = [
        'apps/indikator/manifest.json',
        './apps/indikator/manifest.json',
        'file:///android_asset/apps/indikator/manifest.json'
      ];
      for (const p of paths) {
        try {
          const res = await fetch(p, { cache: 'no-store' });
          if (res && res.ok) return await res.json();
        } catch (e) {}
      }
      for (const p of paths) {
        try {
          const text = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', p, true);
            xhr.onload = () => (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) ? resolve(xhr.responseText) : reject(new Error('xhr status ' + xhr.status));
            xhr.onerror = reject;
            xhr.send();
          });
          return JSON.parse(text);
        } catch (e) {}
      }
      return fallbackIndicatorsEmbedded || [];
    }
    try {
      const repoIndicators = await readLocalManifest();
      if (Array.isArray(repoIndicators) && repoIndicators.length > 0) {
        indicators = repoIndicators.map((x, idx) => ({
          name: x.name || ('Indikator ' + (idx + 1)),
          category: x.category || 'Library',
          desc: x.desc || x.description || 'Pine Script lokal',
          code: x.code || '',
          url: x.url || x.path || ''
        }));
        selectedIndicator = indicators[0];
      } else {
        indicators = [{ name: 'Kosong', category: 'Empty', desc: 'Tidak ada indikator di manifest lokal.', code: 'Belum ada kode.' }];
        selectedIndicator = indicators[0];
      }
    } catch (err) {
      console.error(err);
      indicators = (fallbackIndicatorsEmbedded || []).length ? fallbackIndicatorsEmbedded : [{ name: 'Error', category: 'Error', desc: 'Manifest lokal tidak terbaca.', code: 'Gagal membaca manifest lokal.' }];
      selectedIndicator = indicators[0];
    }
    if (document.getElementById('indicator-list')) renderIndikator();
  }

  loadRepoIndicators();

  const svgs = {
    mapping: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>`,
    intel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v14H4z"></path><path d="M8 9h8M8 13h5M8 17h8"></path></svg>`,
    journal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg>`,
    academy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-5 9 5-9 5z"></path><path d="M7 12.5V17c2.7 2 7.3 2 10 0v-4.5M21 10v6"></path></svg>`,
    indicator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path><path d="m3 12 6-5 6 4 6-7"></path></svg>`,
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
  };

  const badgeSvgs = {
    Library: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
    Jurnal: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    Learning: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
    Mapping: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    News: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg>`,
    Praktik: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path></svg>`,
    Replay: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    Latihan: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>`,
    Riwayat: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 15 15"></polyline></svg>`,
    'System 1': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    'Jalur 03': `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
  };

  function icon(type) {
    return `<span class="app-icon ${type}">${svgs[type] || ''}</span>`;
  }

  let disposeHomeChart=null;
  function setActive(target) {
    disposeHomeChart?.();disposeHomeChart=null;
    const isVideo = t => t === 'video' || t === 'media';
    navBtns.forEach(btn => {
      const match = btn.dataset.target === target || (isVideo(target) && isVideo(btn.dataset.target));
      btn.classList.toggle('active', Boolean(match));
    });
    try { localStorage.setItem('amy_root_tab', target); } catch (_) {}
  }

  function projectCard(item) {
    const badgeIcon = badgeSvgs[item.badge] || '';
    const descMarkup = item.desc ? `<p>${item.desc}</p>` : '';
    return `<button class="card project-card" data-open="${item.id}" data-module="${item.id}">${icon(item.icon)}<span class="card-content"><h3>${item.title}</h3>${descMarkup}<span class="badge">${badgeIcon} ${item.badge}</span></span><span class="chevron" aria-hidden="true">›</span></button>`;
  }

  function quickCard(item, wide = false) {
    const badgeIcon = badgeSvgs[item.badge] || '';
    const descMarkup = item.desc ? `<small>${item.desc}</small>` : '';
    return `<button class="quick-card${wide ? ' quick-card--wide' : ''}" data-open="${item.id}" data-module="${item.id}">${icon(item.icon)}<span><strong>${item.title}</strong>${descMarkup}</span><span class="chevron" aria-hidden="true">›</span></button>`;
  }

  function renderHome() {
    setActive('beranda');
    mainContent.innerHTML = `<section class="home-price-panel" aria-label="Peta harga XAU/USD">
      <div class="section-heading"><h2>Peta harga · XAU/USD</h2><strong id="home-chart-price">—</strong></div>
      <div class="home-chart-controls"><label>Timeframe <select id="home-chart-tf"><option value="M15">M15</option><option value="M5">M5</option></select></label><button type="button" id="home-chart-refresh">Perbarui</button></div>
      <p id="home-chart-source" role="status">Memuat candle tertutup…</p><p id="home-chart-error" role="alert"></p>
      <div id="home-price-chart" aria-label="Chart candlestick XAU/USD dengan level model ICT"></div>
      <p id="home-chart-note"></p>
    </section><div class="section-heading"><h2>Menu Utama</h2></div><div class="quick-grid slide-up">${projects.map(item => quickCard(item)).join('')}</div>`;
    if(window.AmyHomeChart)disposeHomeChart=window.AmyHomeChart.mount(mainContent.querySelector('.home-price-panel'));
  }

  function renderProjectList(title) {
    setActive('proyek');
    mainContent.innerHTML = `<div class="page-header"><div><span class="section-kicker">JALUR 03</span><h2>${title || 'Backtest'}</h2></div></div><div class="project-grid slide-up">${practiceItems.map(projectCard).join('')}</div>`;
  }

  // ─── AMY FX PRO ROOT MEDIA HUB & VAULT ──────────────────────────────
  const MEDIA_DB_NAME = 'tradingLibraryManager.files';
  const MEDIA_DB_VERSION = 2;
  const MEDIA_FILE_STORE = 'files';
  const MEDIA_META_STORE = 'metadata';
  const MEDIA_ITEMS_META_RECORD = 'items.v2';
  const MEDIA_LEGACY_KEY = 'tradingLibraryManager.items.v1';

  let mediaDbPromise = null;
  function openMediaDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB tidak tersedia'));
    if (mediaDbPromise) return mediaDbPromise;
    mediaDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MEDIA_FILE_STORE)) db.createObjectStore(MEDIA_FILE_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(MEDIA_META_STORE)) db.createObjectStore(MEDIA_META_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return mediaDbPromise;
  }

  async function getMediaMetadataRecord(recordId) {
    try {
      const db = await openMediaDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_META_STORE, 'readonly');
        const req = tx.objectStore(MEDIA_META_STORE).get(recordId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (_) { return null; }
  }

  async function putMediaMetadataRecord(record) {
    try {
      const db = await openMediaDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_META_STORE, 'readwrite');
        const req = tx.objectStore(MEDIA_META_STORE).put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (_) { return false; }
  }

  async function getMediaFileRecord(fileId) {
    if (!fileId) return null;
    try {
      const db = await openMediaDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_FILE_STORE, 'readonly');
        const req = tx.objectStore(MEDIA_FILE_STORE).get(fileId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (_) { return null; }
  }

  async function putMediaFileRecord(record) {
    try {
      const db = await openMediaDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_FILE_STORE, 'readwrite');
        const req = tx.objectStore(MEDIA_FILE_STORE).put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (_) { return false; }
  }

  async function deleteMediaFileRecord(fileId) {
    if (!fileId) return;
    try {
      const db = await openMediaDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MEDIA_FILE_STORE, 'readwrite');
        const req = tx.objectStore(MEDIA_FILE_STORE).delete(fileId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (_) {}
  }

  async function loadAllMediaItems() {
    let items = [];
    try {
      const rec = await getMediaMetadataRecord(MEDIA_ITEMS_META_RECORD);
      if (Array.isArray(rec?.value)) items = rec.value;
    } catch (_) {}
    if (!items.length) {
      try {
        const legacy = JSON.parse(localStorage.getItem(MEDIA_LEGACY_KEY) || '[]');
        if (Array.isArray(legacy) && legacy.length) items = legacy;
      } catch (_) {}
    }
    return items;
  }

  async function saveAllMediaItems(items) {
    const cleaned = items.map(it => {
      const { data, file, blob, objectUrl, textPreview, ...meta } = it;
      return meta;
    });
    await putMediaMetadataRecord({ id: MEDIA_ITEMS_META_RECORD, value: cleaned, updatedAt: new Date().toISOString() });
    try { localStorage.setItem(MEDIA_LEGACY_KEY, JSON.stringify(cleaned)); } catch (_) {}
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  let currentMediaFilter = 'Semua';

  async function renderMedia() {
    setActive('video');
    const allItems = await loadAllMediaItems();
    const hasSavedCode = Boolean(localStorage.getItem('amy_saved_code'));
    const favoriteIndicators = readJsonArray('amy_indicator_favorites');

    const isMediaItem = item => {
      return item.mediaKind === 'image' || item.mediaKind === 'video' || item.mediaKind === 'audio' ||
             item.type === 'Gambar Chart' || item.type === 'Video Pembelajaran' ||
             item.collection === 'Media' || Boolean(item.fileId && item.mediaName);
    };

    const isDocItem = item => {
      return item.mediaKind === 'document' || item.type === 'Dokumen' || Boolean(item.documentType);
    };

    let filteredItems = [];
    if (currentMediaFilter === 'Video') {
      filteredItems = allItems.filter(it => it.mediaKind === 'video' || it.type === 'Video Pembelajaran' || (it.mediaType && it.mediaType.startsWith('video/')));
    } else if (currentMediaFilter === 'Gambar') {
      filteredItems = allItems.filter(it => it.mediaKind === 'image' || it.type === 'Gambar Chart' || (it.mediaType && it.mediaType.startsWith('image/')));
    } else if (currentMediaFilter === 'Dokumen') {
      filteredItems = allItems.filter(isDocItem);
    } else if (currentMediaFilter === 'Kode') {
      filteredItems = [];
    } else {
      // 'Semua'
      filteredItems = allItems.filter(it => isMediaItem(it) || isDocItem(it));
    }

    const totalMediaCount = allItems.filter(it => isMediaItem(it) || isDocItem(it)).length;
    const countLabel = totalMediaCount > 0 ? `${totalMediaCount} video &amp; media tersimpan` : 'Belum ada video tersimpan';

    const pillsHTML = [
      { id: 'Semua', label: `Semua (${totalMediaCount})` },
      { id: 'Video', label: 'Video Replay' },
      { id: 'Gambar', label: 'Gambar & Chart' },
      { id: 'Dokumen', label: 'Dokumen PDF' },
      { id: 'Kode', label: 'Kode Tersimpan' }
    ].map(p => `
      <button class="pill ${currentMediaFilter === p.id ? 'active' : ''}" data-media-filter="${p.id}" type="button">${p.label}</button>
    `).join('');

    let contentHTML = '';

    if (currentMediaFilter === 'Kode') {
      const codeItems = [];
      if (hasSavedCode) {
        codeItems.push(`<button class="collection-item" data-koleksi="kode"><span class="app-icon code">${svgs.code}</span><span><strong>Kode indikator tersimpan</strong><small>Buka kembali Pine Script yang disimpan di perangkat ini.</small></span><span class="chevron" aria-hidden="true">›</span></button>`);
      }
      if (favoriteIndicators.length) {
        codeItems.push(`<button class="collection-item" data-open="indikator"><span class="app-icon indicator">${svgs.indicator}</span><span><strong>${favoriteIndicators.length} indikator favorit</strong><small>Favorit aktual dari library indikator perangkat ini.</small></span><span class="chevron" aria-hidden="true">›</span></button>`);
      }
      contentHTML = codeItems.length
        ? `<div class="collection-list slide-up">${codeItems.join('')}</div>`
        : `<div class="empty-state-card slide-up"><div style="font-size:32px; margin-bottom:8px;">💻</div><strong>Belum ada item tersimpan</strong><span>Simpan kode Pine Script dari menu Indikator agar muncul di sini.</span></div>`;
    } else if (filteredItems.length === 0) {
      contentHTML = `
        <div class="empty-state-card slide-up" style="text-align:center; padding:36px 20px; border-radius:20px; background:var(--surface-color); border:1px solid var(--border-color); margin-top:10px;">
          <div style="font-size:42px; margin-bottom:12px;">🎬</div>
          <strong style="display:block; font-size:16px; margin-bottom:6px; color:var(--text-main);">Belum Ada Video di Kategori Ini</strong>
          <span style="display:block; font-size:13px; color:var(--text-muted); max-width:340px; margin:0 auto 18px;">Simpan rekaman video replay setup XAU/USD, video materi, screenshot chart, atau dokumen trading Anda.</span>
          <button type="button" id="rootEmptyUploadMediaBtn" class="media-upload-btn" style="padding:10px 20px; font-size:13px;">+ Upload Video Pertama</button>
        </div>
      `;
    } else {
      const cardsHTML = filteredItems.map(item => {
        const isVid = item.mediaKind === 'video' || item.type === 'Video Pembelajaran' || (item.mediaType && item.mediaType.startsWith('video/'));
        const isDoc = isDocItem(item);
        const itemSize = formatBytes(item.mediaSize || item.fileSize || 0);

        let thumbMarkup = '';
        if (isVid) {
          thumbMarkup = `
            <div class="media-play-overlay" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="8 5 19 12 8 19 8 5"></polygon></svg></div>
            <span class="media-video-badge">▶ Video</span>
            <video class="media-thumb-video" data-media-video="${item.fileId || ''}" preload="metadata"></video>
          `;
        } else if (isDoc) {
          const docLabel = (item.documentType || (item.mediaName ? item.mediaName.split('.').pop() : 'DOC')).toUpperCase();
          thumbMarkup = `
            <div class="media-doc-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <strong style="font-size:11px; letter-spacing:0.05em;">${escapeHtml(docLabel)}</strong>
            </div>
          `;
        } else {
          thumbMarkup = `<img class="media-thumb-img" data-media-thumb="${item.fileId || ''}" alt="${escapeHtml(item.title)}" loading="lazy" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 10'%3E%3Crect width='16' height='10' fill='%230b1020'/%3E%3C/svg%3E">`;
        }

        return `
          <article class="media-card slide-up" data-item-id="${escapeHtml(item.id)}">
            <div class="media-thumb-box" data-view-media="${escapeHtml(item.id)}">
              ${thumbMarkup}
            </div>
            <div class="media-card-body">
              <div class="media-card-meta">
                <span class="media-card-badge">${escapeHtml(item.category || item.type || 'Media')}</span>
                <span>${itemSize}</span>
              </div>
              <strong class="media-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
              <div class="media-card-actions">
                <button type="button" class="media-card-btn" data-view-media="${escapeHtml(item.id)}">
                  <span>Lihat Full</span>
                </button>
                <button type="button" class="media-card-btn danger-btn" data-delete-media="${escapeHtml(item.id)}" title="Hapus Media">
                  <span>🗑️</span>
                </button>
              </div>
            </div>
          </article>
        `;
      }).join('');

      contentHTML = `<div class="media-grid">${cardsHTML}</div>`;
    }

    mainContent.innerHTML = `
      <div class="media-section-head">
        <div class="page-title-group">
          <span class="section-kicker">GALERI &amp; VIDEO TRADING</span>
          <h2>Video</h2>
          <small style="color:var(--text-muted); font-size:12px; font-weight:600;">${countLabel}</small>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="file" id="rootMediaFileInput" multiple accept="video/*,image/*,.mp4,.mkv,.webm,.ogg,.mov,.m4v,.png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.txt" style="display:none;">
          <button type="button" id="rootUploadMediaBtn" class="media-upload-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span>+ Upload Video</span>
          </button>
        </div>
      </div>

      <div class="media-filter-pills">${pillsHTML}</div>

      ${contentHTML}

      <a href="apps/journal/index.html" class="media-journal-shortcut" style="margin-top:18px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:18px;">📖</span>
          <div>
            <strong style="display:block; color:var(--text-main); font-size:13px;">Buka Jurnal Trading &amp; Habits Lengkap</strong>
            <small style="color:var(--text-muted); font-size:11px;">Analisis performa, win rate, dan catatan disiplin trading harian</small>
          </div>
        </div>
        <span class="chevron" aria-hidden="true">›</span>
      </a>
    `;

    // Asynchronously load actual blob contents for image and video cards
    const thumbImgs = mainContent.querySelectorAll('[data-media-thumb]');
    thumbImgs.forEach(async img => {
      const fileId = img.dataset.mediaThumb;
      if (!fileId) return;
      const fileRec = await getMediaFileRecord(fileId);
      if (fileRec?.blob) {
        img.src = URL.createObjectURL(fileRec.blob);
      }
    });

    const thumbVids = mainContent.querySelectorAll('[data-media-video]');
    thumbVids.forEach(async vid => {
      const fileId = vid.dataset.mediaVideo;
      if (!fileId) return;
      const fileRec = await getMediaFileRecord(fileId);
      if (fileRec?.blob) {
        vid.src = URL.createObjectURL(fileRec.blob);
      }
    });

    // Bind file input handler
    const fileInput = document.getElementById('rootMediaFileInput');
    fileInput?.addEventListener('change', handleRootMediaUpload);
  }

  async function showMediaFullscreen(item) {
    let dialog = document.getElementById('rootMediaViewerDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'rootMediaViewerDialog';
      dialog.className = 'media-fullscreen-dialog';
      document.body.appendChild(dialog);
    }
    const fileRec = item.fileId ? await getMediaFileRecord(item.fileId) : null;
    let blobUrl = fileRec?.blob ? URL.createObjectURL(fileRec.blob) : (item.mediaUrl || '');

    const isVid = item.mediaKind === 'video' || item.type === 'Video Pembelajaran' || (item.mediaType && item.mediaType.startsWith('video/')) || (fileRec?.blob?.type || '').startsWith('video/');
    const isDoc = item.mediaKind === 'document' || item.type === 'Dokumen';

    let stageContent = '';
    if (isVid) {
      stageContent = `<video src="${blobUrl}" controls autoplay playsinline style="max-width:100%; max-height:80vh; border-radius:12px;"></video>`;
    } else if (isDoc) {
      stageContent = `
        <div style="text-align:center; padding:32px 20px; background:var(--surface-color); border-radius:20px; border:1px solid var(--border-color); max-width:400px; margin:auto;">
          <div style="font-size:52px; margin-bottom:12px;">📄</div>
          <h3 style="color:#fff; margin-bottom:8px; font-size:16px;">${escapeHtml(item.title)}</h3>
          <p style="color:var(--text-muted); font-size:12px; margin-bottom:20px;">${escapeHtml(item.mediaName || item.title)} • ${formatBytes(item.mediaSize || fileRec?.size)}</p>
          ${blobUrl ? `<a href="${blobUrl}" download="${escapeHtml(item.mediaName || item.title)}" class="media-upload-btn" style="text-decoration:none; display:inline-flex;">💾 Unduh / Buka Dokumen</a>` : ''}
        </div>
      `;
    } else {
      stageContent = `<img src="${blobUrl}" alt="${escapeHtml(item.title)}" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:12px;">`;
    }

    dialog.innerHTML = `
      <div class="media-fullscreen-bar">
        <div class="media-fullscreen-title-box">
          <small>${escapeHtml(item.category || item.type || 'Media')} • ${formatBytes(item.mediaSize || fileRec?.size)}</small>
          <h3>${escapeHtml(item.title)}</h3>
        </div>
        <div class="media-fullscreen-actions">
          ${blobUrl ? `<a href="${blobUrl}" download="${escapeHtml(item.mediaName || item.title)}" class="media-fullscreen-close-btn" style="text-decoration:none;" title="Unduh File">💾</a>` : ''}
          <button type="button" class="media-fullscreen-close-btn" id="closeMediaViewerBtn" title="Tutup">×</button>
        </div>
      </div>
      <div class="media-fullscreen-stage">${stageContent}</div>
    `;

    dialog.showModal();
    const closeBtn = dialog.querySelector('#closeMediaViewerBtn');
    const closeDialog = () => {
      dialog.close();
      const vid = dialog.querySelector('video');
      if (vid) { vid.pause(); vid.src = ''; }
    };
    closeBtn?.addEventListener('click', closeDialog);
    dialog.addEventListener('click', e => {
      if (e.target === dialog) closeDialog();
    });
  }

  async function handleRootMediaUpload(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    showToast('Memproses upload media...');
    let uploadedCount = 0;
    const now = new Date().toISOString();

    for (const file of files) {
      if (file.size > 200 * 1024 * 1024) {
        showToast(`File "${file.name}" terlalu besar (>200MB).`);
        continue;
      }
      let kind = 'document';
      let itemType = 'Dokumen';
      if (file.type.startsWith('image/')) {
        kind = 'image';
        itemType = 'Gambar Chart';
      } else if (file.type.startsWith('video/')) {
        kind = 'video';
        itemType = 'Video Pembelajaran';
      } else if (file.type.startsWith('audio/')) {
        kind = 'audio';
        itemType = 'Audio';
      }

      const id = 'media_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      const item = {
        id,
        title,
        type: itemType,
        category: 'Setup XAU',
        status: 'Selesai dibaca',
        collection: 'Media',
        tags: [itemType.toLowerCase(), 'media'],
        notes: `File ${file.name} diupload ke Media Utama.`,
        checklist: [],
        code: '',
        mediaUrl: '',
        fileId,
        mediaKind: kind,
        mediaName: file.name,
        mediaType: file.type,
        mediaSize: file.size,
        documentType: kind === 'document' ? (file.name.split('.').pop() || 'doc').toUpperCase() : '',
        documentText: '',
        favorite: false,
        archived: false,
        revisionHistory: [],
        uploadedAt: now,
        createdAt: now,
        updatedAt: now
      };

      await putMediaFileRecord({
        id: fileId,
        itemId: id,
        blob: file,
        name: file.name,
        type: file.type,
        size: file.size,
        kind,
        uploadedAt: now
      });

      const currentItems = await loadAllMediaItems();
      await saveAllMediaItems([item, ...currentItems]);
      uploadedCount++;
    }

    if (uploadedCount > 0) {
      showToast(`${uploadedCount} media berhasil ditambahkan!`);
      renderMedia();
    }
  }

  async function handleRootMediaDelete(itemId) {
    const allItems = await loadAllMediaItems();
    const item = allItems.find(it => it.id === itemId);
    if (!item) return;
    if (!window.confirm(`Hapus media "${item.title}" dari perangkat?`)) return;

    if (item.fileId) {
      await deleteMediaFileRecord(item.fileId);
    }
    const updated = allItems.filter(it => it.id !== itemId);
    await saveAllMediaItems(updated);
    showToast(`Media "${item.title}" berhasil dihapus.`);
    renderMedia();
  }

  function renderKoleksi() {
    renderMedia();
  }

  function renderProfile() {
    setActive('profil');
    const userBalance = localStorage.getItem('amy_default_balance') || '5000';
    const userRisk = localStorage.getItem('amy_default_risk') || '1.5';
    const reminderConfig = window.AmyLearningReminder ? window.AmyLearningReminder.getConfig() : {
      enabled: localStorage.getItem('amy_learning_reminder_enabled') !== 'false',
      time: localStorage.getItem('amy_learning_reminder_time') || '20:00',
      lastTitle: localStorage.getItem('amy_last_opened_title') || 'Fondasi ICT & Market Structure Dasar',
      lastTimeText: 'Belum ada riwayat belajar'
    };

    const GLASS_PRESETS = [
      { id: 'obsidian', name: 'Obsidian Glass', bg: '#070b14', accent: '#F5C451' },
      { id: 'gold', name: 'Gold Terminal', bg: '#0c0f18', accent: '#F5C451' },
      { id: 'cyber', name: 'Cyber Blue', bg: '#070e20', accent: '#3B82F6' },
      { id: 'emerald', name: 'Emerald Risk', bg: '#05130e', accent: '#22C55E' },
      { id: 'amethyst', name: 'Amethyst Flow', bg: '#0d0718', accent: '#C084FC' }
    ];

    const activeGlassPreset = window.AmyFXTheme?.colors?.preset || 'obsidian';
    const presetsHTML = GLASS_PRESETS.map(p => `
      <button type="button" class="glass-preset-btn ${p.id === activeGlassPreset ? 'is-active' : ''}" data-glass-preset="${p.id}">
        <span class="preset-dot" style="background:${p.accent}; box-shadow:0 0 8px ${p.accent};"></span>
        <span>${p.name}</span>
      </button>
    `).join('');

    const customBgData = window.AmyFXTheme?.customBg;
    const hasCustomBg = Boolean(customBgData && customBgData.image);
    const customBgDim = customBgData?.dim ?? 50;
    const customBgBlur = customBgData?.blur ?? 20;


    mainContent.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Profil &amp; Pengaturan</h2>
        </div>
      </div>

      <!-- Trading Environment Customization -->
      <div class="profile-section-title" style="margin-top:8px;">Trading Environment Customization</div>
      <section class="profile-glass-panel slide-up" data-amyfx-color-settings="true">
        <div class="glass-group-label">Mode Tampilan</div>
        <div class="theme-selector">
          <button class="theme-choice" type="button" data-amyfx-theme-choice="system">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg>
            <span>Sistem</span>
          </button>
          <button class="theme-choice" type="button" data-amyfx-theme-choice="light">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
            <span>Terang</span>
          </button>
          <button class="theme-choice" type="button" data-amyfx-theme-choice="dark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2z"></path></svg>
            <span>Gelap</span>
          </button>
        </div>

        <div class="glass-group-label" style="margin-top:16px;">Preset Kaca &amp; Nuansa Trading</div>
        <div class="presets-row">
          ${presetsHTML}
        </div>

        <div class="glass-group-label" style="margin-top:18px; display:flex; justify-content:space-between; align-items:center;">
          <span>Wallpaper &amp; Latar Belakang</span>
          <span id="customBgBadge" class="bg-status-badge ${hasCustomBg ? 'active' : ''}">${hasCustomBg ? '● Foto Kustom Aktif' : 'Default Gradien'}</span>
        </div>
        <div class="wallpaper-controls-wrap">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="file" id="customBgFileInput" accept="image/*" style="display:none;">
            <button type="button" id="uploadCustomBgBtn" class="glass-preset-btn">
              <span>🖼️</span>
              <span>Pilih Foto Sendiri</span>
            </button>
            <button type="button" id="removeCustomBgBtn" class="glass-preset-btn danger-preset-btn" style="${hasCustomBg ? '' : 'display:none;'}">
              <span>🗑️</span>
              <span>Hapus Wallpaper</span>
            </button>
          </div>

          <div id="customBgControls" class="wallpaper-sliders-card" style="${hasCustomBg ? '' : 'display:none;'}">
            <div style="margin-bottom:12px;">
              <div class="slider-header">
                <span>Kecerahan / Dimming Latar</span>
                <span id="customBgDimVal">${customBgDim}%</span>
              </div>
              <input type="range" id="customBgDimSlider" min="0" max="100" value="${customBgDim}" class="trading-slider">
            </div>
            <div>
              <div class="slider-header">
                <span>Efek Frosted Blur (Kaca Buram)</span>
                <span id="customBgBlurVal">${customBgBlur}px</span>
              </div>
              <input type="range" id="customBgBlurSlider" min="0" max="25" value="${customBgBlur}" class="trading-slider">
            </div>
          </div>
        </div>
      </section>

      <!-- Panel 2: Parameter Risiko Trading XAU/USD -->
      <div class="profile-section-title" style="margin-top:20px; font-size:0.75rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Parameter Trading &amp; Risiko (XAU/USD)</div>
      <section style="padding:16px; border-radius:16px; background:var(--surface-color); border:1px solid var(--border-color); box-shadow:0 4px 16px rgba(0,0,0,0.05); margin-top:8px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <span style="display:block; font-size:11px; font-weight:750; color:var(--text-muted); margin-bottom:4px;">Saldo Default ($)</span>
            <input type="number" id="profileBalance" value="${escapeHtml(userBalance)}" style="width:100%; border:1px solid var(--border-color); background:var(--surface-soft); color:var(--text-main); border-radius:10px; padding:10px; font-size:14px; font-weight:700; font-family:monospace; box-sizing:border-box;">
          </div>
          <div>
            <span style="display:block; font-size:11px; font-weight:750; color:var(--text-muted); margin-bottom:4px;">Batas Risiko / Trade (%)</span>
            <input type="number" step="0.5" id="profileRisk" value="${escapeHtml(userRisk)}" style="width:100%; border:1px solid var(--border-color); background:var(--surface-soft); color:var(--text-main); border-radius:10px; padding:10px; font-size:14px; font-weight:700; font-family:monospace; box-sizing:border-box;">
          </div>
        </div>
        <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
          <small style="color:var(--text-muted); font-size:11px; font-weight:600;">Aturan baku: Jangan ambil trade jika SL &gt; 2% modal.</small>
          <button type="button" id="saveTradingParamsBtn" style="padding:8px 16px; background:linear-gradient(135deg, #d4af37, #aa8524); color:#000; font-weight:800; border-radius:10px; border:none; font-size:12px; cursor:pointer;">Simpan Parameter</button>
        </div>
      </section>

      <!-- Panel 2.5: Pengingat Belajar & Peningkatan Skill (Academy) -->
      <div class="profile-section-title" style="margin-top:20px; font-size:0.75rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Pengingat Belajar &amp; Skill (Academy)</div>
      <section style="padding:16px; border-radius:16px; background:var(--surface-color); border:1px solid var(--border-color); box-shadow:0 4px 16px rgba(0,0,0,0.05); margin-top:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div>
            <strong style="display:block; font-size:13px; font-weight:750; color:var(--text-main);">Notifikasi Pengingat Belajar</strong>
            <small style="color:var(--text-muted); font-size:11px;">Mengingatkan materi terakhir untuk terus mengasah skill trading ICT-mu.</small>
          </div>
          <input type="checkbox" id="learningReminderEnabled" ${reminderConfig.enabled ? 'checked' : ''} style="width:20px; height:20px; accent-color:#38bdf8; cursor:pointer;">
        </div>

        <div id="learningReminderSettingsWrap" style="margin-top:14px; ${reminderConfig.enabled ? '' : 'display:none;'}">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--border-color);">
            <div>
              <span style="display:block; font-size:12px; font-weight:750; color:var(--text-main);">Waktu Notifikasi</span>
              <small style="color:var(--text-muted); font-size:11px;">Pilih jam pengingat muncul setiap hari</small>
            </div>
            <input type="time" id="learningReminderTimeInput" value="${escapeHtml(reminderConfig.time)}" style="border:1px solid var(--border-color); background:var(--surface-soft); color:var(--text-main); border-radius:8px; padding:6px 12px; font-size:14px; font-weight:700; font-family:monospace; outline:none;">
          </div>

          <div style="margin-top:10px; padding:10px 12px; background:var(--surface-soft); border-radius:10px; border:1px solid var(--border-color);">
            <span style="display:block; font-size:10px; font-weight:750; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Materi Terakhir yang Kamu Pelajari</span>
            <div id="learningReminderLastTitle" style="font-size:13px; font-weight:700; margin-top:3px; color:var(--accent,#38bdf8);">${escapeHtml(reminderConfig.lastTitle)}</div>
            <small id="learningReminderLastTime" style="color:var(--text-muted); font-size:11px;">${escapeHtml(reminderConfig.lastTimeText)}</small>
          </div>

          <div style="margin-top:12px; display:flex; gap:8px;">
            <button type="button" id="saveLearningReminderBtn" style="flex:1; padding:9px 14px; background:linear-gradient(135deg, #38bdf8, #0284c7); color:#000; font-weight:800; border-radius:10px; border:none; font-size:12px; cursor:pointer;">Simpan Jadwal Pengingat</button>
            <button type="button" id="testLearningReminderBtn" style="padding:9px 14px; background:var(--surface-soft); border:1px solid var(--border-color); color:var(--text-main); font-weight:700; border-radius:10px; font-size:12px; cursor:pointer;">🔔 Uji Notifikasi</button>
          </div>
        </div>
      </section>

      <!-- Panel 3: Manajemen Data & Keamanan -->
      <div class="profile-section-title" style="margin-top:20px; font-size:0.75rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em;">Manajemen Data &amp; Reset</div>
      <section class="profile-list" style="margin-top:8px;">
        <button class="profile-row" id="profileExportBtn" type="button">
          <span class="tool-icon">💾</span>
          <span><strong>Cadangkan / Ekspor Data</strong><small>Unduh file JSON berisi semua jurnal, rutinitas, dan catatan lokal.</small></span>
          <span class="chevron">›</span>
        </button>
        <button class="profile-row danger-row" data-profile-action="clear" type="button">
          <span class="tool-icon">×</span>
          <span><strong>Bersihkan Data Lokal</strong><small>Menghapus riwayat, jurnal, dan koleksi lokal secara aman.</small></span>
          <span class="chevron">›</span>
        </button>
      </section>
    `;

    // Event bindings for new profile features
    document.getElementById('editTraderNameBtn')?.addEventListener('click', () => {
      const current = localStorage.getItem('amy_trader_name') || 'Trader';
      const updated = window.prompt('Masukkan Nama Trader Anda:', current);
      if (updated && updated.trim()) {
        localStorage.setItem('amy_trader_name', updated.trim());
        const titleEl = document.getElementById('traderNameTitle');
        if (titleEl) titleEl.textContent = updated.trim();
        showToast('Nama profil trader berhasil diperbarui.');
      }
    });

    document.getElementById('saveTradingParamsBtn')?.addEventListener('click', () => {
      const bal = document.getElementById('profileBalance')?.value || '5000';
      const r = document.getElementById('profileRisk')?.value || '1.5';
      localStorage.setItem('amy_default_balance', bal);
      localStorage.setItem('amy_default_risk', r);
      showToast('Parameter risiko trading XAU/USD berhasil disimpan.');
    });

    // Learning Reminder event bindings
    const reminderToggle = document.getElementById('learningReminderEnabled');
    const reminderSettingsWrap = document.getElementById('learningReminderSettingsWrap');
    reminderToggle?.addEventListener('change', () => {
      const isChecked = reminderToggle.checked;
      if (reminderSettingsWrap) reminderSettingsWrap.style.display = isChecked ? 'block' : 'none';
      const timeVal = document.getElementById('learningReminderTimeInput')?.value || '20:00';
      if (window.AmyLearningReminder) {
        window.AmyLearningReminder.saveConfig(isChecked, timeVal);
      } else {
        localStorage.setItem('amy_learning_reminder_enabled', isChecked ? 'true' : 'false');
        localStorage.setItem('amy_learning_reminder_time', timeVal);
      }
      showToast(isChecked ? 'Pengingat belajar diaktifkan.' : 'Pengingat belajar dinonaktifkan.');
    });

    document.getElementById('saveLearningReminderBtn')?.addEventListener('click', () => {
      const isChecked = document.getElementById('learningReminderEnabled')?.checked ?? true;
      const timeVal = document.getElementById('learningReminderTimeInput')?.value || '20:00';
      if (window.AmyLearningReminder) {
        window.AmyLearningReminder.saveConfig(isChecked, timeVal);
      } else {
        localStorage.setItem('amy_learning_reminder_enabled', isChecked ? 'true' : 'false');
        localStorage.setItem('amy_learning_reminder_time', timeVal);
      }
      showToast(`Jadwal pengingat disimpan: Setiap hari jam ${timeVal}`);
    });

    document.getElementById('testLearningReminderBtn')?.addEventListener('click', () => {
      if (window.AmyLearningReminder) {
        window.AmyLearningReminder.triggerReminderNotification();
      } else if (window.Android?.triggerLearningReminderNotification) {
        window.Android.triggerLearningReminderNotification();
      }
      showToast('Notifikasi pengingat belajar dikirim!');
    });

    document.getElementById('profileExportBtn')?.addEventListener('click', () => {
      const backupData = {
        app: 'Amy FX Pro',
        exportedAt: new Date().toISOString(),
        traderName: localStorage.getItem('amy_trader_name') || 'Trader',
        balance: localStorage.getItem('amy_default_balance') || '5000',
        risk: localStorage.getItem('amy_default_risk') || '1.5',
        habits: readJsonSafe('amy_habits_v2', []),
        completedHabits: readJsonSafe('amy_completed_dates_v2', {}),
        journals: readJsonArray('amy_journal_entries')
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `amyfx-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('File backup profil & data berhasil diunduh.');
    });

    // Preset color buttons
    document.querySelectorAll('[data-glass-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetId = btn.dataset.glassPreset;
        const preset = GLASS_PRESETS.find(p => p.id === presetId);
        if (preset) {
          window.AmyFXTheme?.setPreset?.(presetId);
          document.querySelectorAll('[data-glass-preset]').forEach(b => {
            b.classList.toggle('is-active', b.dataset.glassPreset === presetId);
          });
          showToast(`Tema kaca "${preset.name}" diterapkan.`);
        }
      });
    });

    // Custom Background Photo Handlers
    const fileInput = document.getElementById('customBgFileInput');
    const uploadBtn = document.getElementById('uploadCustomBgBtn');
    const removeBtn = document.getElementById('removeCustomBgBtn');
    const controls = document.getElementById('customBgControls');
    const badge = document.getElementById('customBgBadge');
    const dimSlider = document.getElementById('customBgDimSlider');
    const blurSlider = document.getElementById('customBgBlurSlider');
    const dimVal = document.getElementById('customBgDimVal');
    const blurVal = document.getElementById('customBgBlurVal');

    uploadBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Pilih file gambar (JPG, PNG, WebP).');
        return;
      }
      showToast('Memproses foto latar...');
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

          const currentDim = dimSlider ? Number(dimSlider.value) : 50;
          const currentBlur = blurSlider ? Number(blurSlider.value) : 20;
          window.AmyFXTheme?.setCustomBg?.({
            image: dataUrl,
            dim: currentDim,
            blur: currentBlur
          });

          if (controls) controls.style.display = 'block';
          if (removeBtn) removeBtn.style.display = 'inline-flex';
          if (badge) {
            badge.textContent = '● Foto Kustom Aktif';
            badge.style.color = '#10b981';
          }
          showToast('Wallpaper kustom berhasil dipasang!');
        };
        img.onerror = () => showToast('Gagal memuat gambar.');
        img.src = e.target.result;
      };
      reader.onerror = () => showToast('Gagal membaca file gambar.');
      reader.readAsDataURL(file);
    });

    dimSlider?.addEventListener('input', e => {
      const val = Number(e.target.value);
      if (dimVal) dimVal.textContent = `${val}%`;
      const overlay = document.getElementById('amyfx-custom-bg-overlay');
      if (overlay) {
        overlay.style.backgroundColor = `rgba(7, 11, 20, ${(val / 100).toFixed(2)})`;
      }
      const current = window.AmyFXTheme?.customBg;
      if (current) {
        window.AmyFXTheme?.setCustomBg?.({ ...current, dim: val });
      }
    });

    blurSlider?.addEventListener('input', e => {
      const val = Number(e.target.value);
      if (blurVal) blurVal.textContent = `${val}px`;
      document.documentElement.style.setProperty('--glass-blur', `${val}px`);
      const current = window.AmyFXTheme?.customBg;
      if (current) {
        window.AmyFXTheme?.setCustomBg?.({ ...current, blur: val });
      }
    });

    removeBtn?.addEventListener('click', () => {
      window.AmyFXTheme?.removeCustomBg?.();
      if (controls) controls.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'none';
      if (badge) {
        badge.textContent = 'Default Gradien';
        badge.style.color = 'var(--text-muted)';
      }
      if (fileInput) fileInput.value = '';
      showToast('Wallpaper kustom dihapus.');
    });

    const activePref = window.AmyFXTheme?.preference || 'system';
    document.querySelectorAll('[data-amyfx-theme-choice]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.amyfxThemeChoice === activePref);
    });

    window.AmyFXTheme?.apply?.();
  }

  function handleKoleksi(action) {
    if (action === 'kode') {
      const savedCode = localStorage.getItem('amy_saved_code');
      mainContent.innerHTML = `<div class="page-header row"><button class="back-btn" data-nav="koleksi">‹</button><h2>Kode Tersimpan</h2></div><section class="code-panel"><pre id="code-display"></pre><div class="actions"><button class="action-btn primary" data-copy-koleksi>Salin Kode</button></div></section>`;
      const savedDisplay = document.getElementById('code-display');
      if (savedDisplay) savedDisplay.textContent = savedCode || 'Belum ada kode tersimpan.';
    } else if (action === 'favorit' || action === 'riwayat') {
      showToast('Fitur ini akan segera hadir pada update berikutnya.');
    } else if (action === 'update') {
      window.AmyFXUpdate?.checkNow?.({ announce: true });
    }
  }

  function renderIndicatorList(category = 'Semua', query = '') {
    const list = document.getElementById('indicator-list');
    if (!list) return;
    const q = String(query || '').toLowerCase();
    const filtered = indicators.filter(item => (category === 'Semua' || String(item.category || '') === category) && (String(item.name || '').toLowerCase().includes(q) || String(item.desc || '').toLowerCase().includes(q)));
    list.innerHTML = filtered.map(item => {
      const originalIndex = indicators.indexOf(item);
      return `<button class="indicator-item" data-select-indicator="${originalIndex}">${icon('code')}<span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.desc)}</small></span><span class="chevron">›</span></button>`;
    }).join('') || '<div class="empty">Indikator tidak ditemukan.</div>';
  }

  async function renderIndikator() {
    setActive('proyek');
    const categoryOptions = ['Semua', ...new Set(indicators.map(i => i.category))];
    const pillsHTML = categoryOptions.map(cat => `<button class="pill ${cat === 'Semua' ? 'active' : ''}" data-filter="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('');

    mainContent.innerHTML = `<div class="page-header row"><button class="back-btn" data-nav="proyek">‹</button><h2>Indikator TradingView</h2></div><input id="indicator-search" class="search-input" placeholder="Cari indikator..."><div class="pill-row">${pillsHTML}</div><div id="indicator-list" class="indicator-list slide-up"></div><section class="code-panel"><span class="badge">Terpilih</span><h3>${escapeHtml((selectedIndicator||{}).name)}</h3><p>${escapeHtml((selectedIndicator||{}).desc)}</p><pre id="code-display"></pre><div class="actions"><button class="action-btn" data-save-code>Simpan Kode</button><button class="action-btn primary" data-copy-code>Salin Kode</button></div></section>`;
    const codeDisplay = document.getElementById('code-display');
    if (codeDisplay) codeDisplay.textContent = (selectedIndicator||{}).code || 'Mengambil source code...';
    
    renderIndicatorList();

    if (selectedIndicator && !selectedIndicator.code && selectedIndicator.url) {
       try {
         const res = await fetch(selectedIndicator.url);
         const text = await res.text();
         selectedIndicator.code = text;
         const codeDisplay = document.getElementById('code-display');
         if (codeDisplay) codeDisplay.textContent = text;
       } catch (err) {
         const codeDisplay = document.getElementById('code-display');
         if (codeDisplay) codeDisplay.textContent = 'Gagal memuat kode lokal.';
       }
    }
  }

  function openProject(id) {
    const project = [...projects, ...practiceItems].find(item => item.id === id);
    if (!project) return;
    const recent = readJsonArray('amy_recent_projects').filter(item => item !== id);
    localStorage.setItem('amy_recent_projects', JSON.stringify([id, ...recent].slice(0, 8)));
    if (project.target === 'internal') {
      renderIndikator();
    } else {
      showLoadingOverlay();
      setTimeout(() => location.assign(project.target), 100);
    }
  }

  function navigate(target) {
    if (target === 'beranda') renderHome();
    if (target === 'proyek' || target === 'backtest') renderProjectList('Backtest');
    if (target === 'video' || target === 'media' || target === 'koleksi') renderMedia();
    if (target === 'profil') renderProfile();
  }


  async function copyTextSafe(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  document.addEventListener('click', async event => {
    const openBtn = event.target.closest('[data-open]');
    const navBtn = event.target.closest('[data-nav]');
    const indicatorBtn = event.target.closest('[data-select-indicator]');
    const filterBtn = event.target.closest('[data-filter]');
    const copyBtn = event.target.closest('[data-copy-code]');
    const saveBtn = event.target.closest('[data-save-code]');
    const koleksiBtn = event.target.closest('[data-koleksi]');
    const copyKoleksiBtn = event.target.closest('[data-copy-koleksi]');
    const profileBtn = event.target.closest('[data-profile-action]');
    const mediaFilterBtn = event.target.closest('[data-media-filter]');
    const viewMediaBtn = event.target.closest('[data-view-media]');
    const deleteMediaBtn = event.target.closest('[data-delete-media]');
    const uploadMediaBtn = event.target.closest('#rootUploadMediaBtn, #rootEmptyUploadMediaBtn');

    if (openBtn) openProject(openBtn.dataset.open);
    if (navBtn) navigate(navBtn.dataset.nav);
    if (indicatorBtn) { selectedIndicator = indicators[Number(indicatorBtn.dataset.selectIndicator)]; renderIndikator(); }
    if (filterBtn) { document.querySelectorAll('.pill').forEach(item => item.classList.remove('active')); filterBtn.classList.add('active'); renderIndicatorList(filterBtn.dataset.filter, document.getElementById('indicator-search')?.value || ''); }
    if (copyBtn) {
      const ok = await copyTextSafe(selectedIndicator.code || '');
      copyBtn.textContent = ok ? 'Tersalin' : 'Gagal Salin';
      if (!ok) showToast('Gagal menyalin kode. Pilih teks lalu salin manual.');
    }
    if (saveBtn) { localStorage.setItem('amy_saved_code', selectedIndicator.code || ''); saveBtn.textContent = 'Tersimpan'; }
    if (koleksiBtn) handleKoleksi(koleksiBtn.dataset.koleksi);
    if (mediaFilterBtn) {
      currentMediaFilter = mediaFilterBtn.dataset.mediaFilter;
      renderMedia();
    }
    if (viewMediaBtn) {
      const itemId = viewMediaBtn.dataset.viewMedia;
      const all = await loadAllMediaItems();
      const targetItem = all.find(it => it.id === itemId);
      if (targetItem) showMediaFullscreen(targetItem);
    }
    if (deleteMediaBtn) {
      event.stopPropagation();
      await handleRootMediaDelete(deleteMediaBtn.dataset.deleteMedia);
    }
    if (uploadMediaBtn) {
      document.getElementById('rootMediaFileInput')?.click();
    }
    if (profileBtn && profileBtn.dataset.profileAction === 'clear') {
      if (window.confirm('Hapus riwayat analisis, jurnal, library, dan koleksi lokal? API key tidak ikut dihapus.')) {
        await clearPersonalLocalData();
        showToast('Data lokal sudah dibersihkan. API key tetap tersimpan.');
        renderProfile();
      }
    }
    if (copyKoleksiBtn) {
      const ok = await copyTextSafe(localStorage.getItem('amy_saved_code') || '');
      copyKoleksiBtn.textContent = ok ? 'Tersalin' : 'Gagal Salin';
      if (!ok) showToast('Gagal menyalin kode tersimpan.');
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'indicator-search') {
      const activeFilter = document.querySelector('.pill.active')?.dataset.filter || 'Semua';
      renderIndicatorList(activeFilter, event.target.value);
    }
  });

  navBtns.forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.target)));
  let initialTab = 'beranda';
  try { initialTab = localStorage.getItem('amy_root_tab') || initialTab; } catch (_) {}
  if (initialTab === 'koleksi' || initialTab === 'media') initialTab = 'video';
  navigate(['beranda', 'proyek', 'video', 'media', 'profil'].includes(initialTab) ? initialTab : 'beranda');
});


// GLOBAL AMY FX JS SYSTEM
window.showToast = function(msg) {
  // Use native Android Toast instead of Web Toast
  if (window.Android && window.Android.showAppToast) {
    // Strip HTML tags if any, because Android Toast doesn't support HTML easily
    const plainMsg = msg.replace(/<[^>]*>?/gm, '');
    window.Android.showAppToast(plainMsg);
  } else {
    console.log("Toast:", msg);
  }
};

window.triggerHaptic = function(pattern) {
  // Use native Android Haptic Vibration
  if (window.Android && window.Android.triggerHaptic) {
    window.Android.triggerHaptic(pattern || 20);
  } else if ('vibrate' in navigator) {
    navigator.vibrate(pattern || 20);
  }
};

if (!window.amyHapticListenerAdded) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, a, .clickable, .nav-btn, .action-btn, .card');
      if (btn) window.triggerHaptic(20);
    });
    window.amyHapticListenerAdded = true;
}


/* AMYFX_NOTIFY_GUARD_START */
(function(){
  if(window.__amyfxNotifyGuardLoaded)return;
  window.__amyfxNotifyGuardLoaded=true;

  const STORE='amyfx.notify.last.sent';
  const COOLDOWN=5*60*1000;
  const RESUME_MUTE=9000;
  const MAX_ITEMS=80;
  let muteUntil=0;

  function now(){return Date.now()}
  function norm(x){
    return String(x||'')
      .replace(/\d+([.,]\d+)?/g,'#')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,180);
  }
  function kind(t,b){
    const x=(String(t||'')+' '+String(b||'')).toLowerCase();
    if(x.includes('scanner terhubung'))return 'scanner_connected';
    if(x.includes('amy fx aktif'))return 'scanner_alive';
    if(x.includes('liquidity sweep'))return 'liquidity_sweep';
    if(x.includes('ssl')||x.includes('bsl'))return 'bsl_ssl_touched';
    return 'amyfx_alert';
  }
  function key(t,b){
    return kind(t,b)+'|'+norm(t)+'|'+norm(b);
  }
  function read(){
    try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return{}}
  }
  function write(o){
    const arr=Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,MAX_ITEMS);
    localStorage.setItem(STORE,JSON.stringify(Object.fromEntries(arr)));
  }
  function route(t,b){
    const k=kind(t,b);
    if(k==='liquidity_sweep')return 'Analyze';
    if(k==='bsl_ssl_touched')return 'Analyze';
    if(k==='scanner_connected'||k==='scanner_alive')return 'Dashboard';
    return 'Analyze';
  }
  function openRoute(t,b){
    const r=route(t,b);
    try{localStorage.setItem('amyfx.notification.route',r)}catch(e){}
    try{if(typeof setTab==='function')setTab(r)}catch(e){}
    try{window.focus()}catch(e){}
  }
  function allow(t,b){
    const n=now();
    const k=key(t,b);

    if(n<muteUntil && kind(t,b)!=='scanner_alive')return false;

    const last=read();
    const prev=last[k]||0;
    if(n-prev<COOLDOWN)return false;

    last[k]=n;
    write(last);
    return true;
  }

  document.addEventListener('visibilitychange',function(){
    if(!document.hidden){
      muteUntil=now()+RESUME_MUTE;
    }
  });

  window.addEventListener('pageshow',function(){
    muteUntil=now()+RESUME_MUTE;
  });

  try{
    if('Notification' in window && !window.Notification.__amyfxWrapped){
      const OriginalNotification=window.Notification;
      const WrappedNotification=function(title,opts){
        opts=opts||{};
        const body=opts.body||'';
        if(!allow(title,body))return null;
        const n=new OriginalNotification(title,opts);
        n.onclick=function(){openRoute(title,body)};
        return n;
      };
      Object.getOwnPropertyNames(OriginalNotification).forEach(function(k){
        try{WrappedNotification[k]=OriginalNotification[k]}catch(e){}
      });
      WrappedNotification.prototype=OriginalNotification.prototype;
      WrappedNotification.__amyfxWrapped=true;
      window.Notification=WrappedNotification;
    }
  }catch(e){}

  function wrapBridge(obj){
    if(!obj||obj.__amyfxNotifyBridgeWrapped)return;
    Object.keys(obj).forEach(function(k){
      if(!/notify|notification|alert|push/i.test(k))return;
      if(typeof obj[k]!=='function')return;
      const old=obj[k];
      obj[k]=function(){
        const args=[].slice.call(arguments);
        const title=args[0]||'Amy FX';
        const body=args[1]||args[0]||'';
        if(!allow(title,body))return null;
        try{return old.apply(this,args)}catch(e){return null}
      };
    });
    obj.__amyfxNotifyBridgeWrapped=true;
  }

  function wrapAll(){
    ['Android','AndroidBridge','AmyFX','AmyFx','Native','NotificationBridge','AppBridge'].forEach(function(n){
      try{wrapBridge(window[n])}catch(e){}
    });
  }

  wrapAll();
  setInterval(wrapAll,1500);

  window.__amyfxNotifyAllow=allow;
  window.__amyfxNotifyOpenRoute=openRoute;
})();
/* AMYFX_NOTIFY_GUARD_END */
