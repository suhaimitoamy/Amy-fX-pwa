/* ===== DYNAMIC LIVE EXAMPLE INJECTOR ===== */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AmyFXLiveExample = api;
  if (root.document) api.boot();
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const REGISTRY_URL = '../assets/data/market-learning-map.json';
  const DEFAULT_API_URL = 'https://amy-fx.vercel.app/api/learning-live-example';
  const API_ATTEMPT_TIMEOUT_MS = 6000;

  const OFFLINE_RULES = Object.freeze([
    { id: 'bpr', pattern: /(balanced-price-range|bpr)/ },
    { id: 'ifvg', pattern: /(ifvg|inversion-fvg|inversion-model)/ },
    { id: 'breaker_block', pattern: /(breaker-block|mitigation-block)/ },
    { id: 'turtle_soup', pattern: /(turtle-soup|smart-money-reversal)/ },
    { id: 'silver_bullet', pattern: /(silver-bullet)/ },
    { id: 'smt_divergence', pattern: /(smt-divergence|smart-money-tool)/ },
    { id: 'ipda_ranges', pattern: /(ipda-data-ranges|ipda)/ },
    { id: 'power_of_three', pattern: /(power-of-three|amd-model|po3)/ },
    { id: 'nwog_ndog', pattern: /(nwog-dan-ndog|opening-gap)/ },
    { id: 'standard_deviation', pattern: /(standard-deviation-projections|stdv)/ },
    { id: 'prop_firm', pattern: /(prop-firm)/ },
    { id: 'playbook_xau', pattern: /(xauusd-advanced-playbook|xauusd-playbook)/ },

    { id: 'trading_basics', pattern: /(apa-itu-trading|pengertian-trading|definisi-trading|realita-trading|cara-belajar-trading)/ },
    { id: 'backtest', pattern: /(backtest|backtesting|forward-test|jurnal|journal|sample-size|expectancy|win-rate)/ },
    { id: 'psychology', pattern: /(psikologi|psychology|fomo|revenge|disiplin|emosi|sabar|overtrading|mindset)/ },
    { id: 'news', pattern: /(news|fundamental|nfp|cpi|fomc|suku-bunga|inflasi|employment|cot-report)/ },
    { id: 'trade_management', pattern: /(trade-management|partial|break-even|breakeven|trailing|scale-out|exit-plan|manage-position|mengelola-hasil)/ },
    { id: 'risk', pattern: /(stop-loss|take-profit|risk|reward|leverage|margin|equity|balance|drawdown|position-sizing|ukuran-posisi|daily-loss|maximum-loss)/ },
    { id: 'session', pattern: /(session|killzone|london|new-york|asia|true-day-open|midnight-open|nymo|macro-time|algorithmic-time)/ },
    { id: 'timeframe', pattern: /(timeframe|multi-timeframe|top-down|topdown|higher-timeframe|lower-timeframe|daily-bias)/ },
    { id: 'liquidity', pattern: /(liquidity|likuiditas|sweep|grab|bsl|ssl|inducement|stop-hunt|draw-on-liquidity)/ },
    { id: 'imbalance', pattern: /(fair-value-gap|fvg|imbalance|liquidity-void|volume-imbalance|consequent-encroachment)/ },
    { id: 'order_block', pattern: /(order-block|rejection-block|propulsion-block)/ },
    { id: 'premium_discount', pattern: /(premium|discount|equilibrium|ote|fibonacci|dealing-range|optimal-trade-entry)/ },
    { id: 'support_resistance', pattern: /(support|resistance|supply|demand|level-kunci|horizontal-level)/ },
    { id: 'volatility', pattern: /(atr|volatility|volatilitas|range-harian|adr)/ },
    { id: 'momentum', pattern: /(rsi|momentum|divergence|moving-average|ema|sma|macd|stochastic)/ },
    { id: 'candle', pattern: /(candlestick|candle|ohlc|doji|engulf|pin-bar|wick|body-candle)/ },
    { id: 'trend', pattern: /(trend|market-structure|struktur-market|bos|choch|mss|cisd|displacement|break-of-structure|change-of-character|mmxm|weekly-cycle|monthly-cycle)/ },
    { id: 'order_math', pattern: /(buy|sell|profit|loss|lot|pip|point|spread|long|short|bid|ask)/ },
    { id: 'instruments', pattern: /(market-forex|forex|gold|xauusd|komoditas|indeks|crypto|instrumen|pair)/ }
  ]);

  function getCurrentPath() {
    const path = String(root.location?.pathname || '').replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return '';
    const last = parts.at(-1);
    if (last && last.includes('.')) {
      return parts.length >= 2 ? `${parts.at(-2)}/${last}` : last;
    }
    return `${last}/index.html`;
  }

  async function loadRegistry() {
    try {
      const response = await root.fetch(REGISTRY_URL, { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function renderMessage(value) {
    return escapeHtml(value).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  function topicLabel(topic) {
    return String(topic || 'materi')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function classifyOfflineTopic(category, topic) {
    const normalizedTopic = String(topic || '').trim().toLowerCase();
    const matched = OFFLINE_RULES.find(rule => rule.pattern.test(normalizedTopic));
    if (matched) return matched.id;
    if (category === 'structural') return 'structural_fallback';
    if (category === 'management') return 'management_fallback';
    return 'basics_fallback';
  }

  function offlineMessage(group, topic) {
    const label = topicLabel(topic);
    const messages = {
      bpr: `[Data Skenario BPR Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: FVG Bullish & FVG Bearish tumpang tindih (Zero-gap rebalance).\n• Rujukan Skenario: Menghidangkan area tumpang tindih FVG M15 sebagai zona penetralan harga.`,
      ifvg: `[Data Skenario Inversion FVG Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: FVG yang jebol close break berbalik fungsi secara permanen.\n• Rujukan Skenario: Menghidangkan zona FVG terbalik (Inversion Support/Resistance).`,
      breaker_block: `[Data Skenario Breaker Block Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: Order Block didahului liquidity sweep sebelum pergantian MSS.\n• Rujukan Skenario: Menghidangkan zona Breaker Block dengan bobot dorongan institusional.`,
      turtle_soup: `[Data Skenario Turtle Soup Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: Wick sweep pada Key High/Low disusul reclaim penutupan body.\n• Rujukan Skenario: Menghidangkan koordinat titik sweep & reclaim untuk konfirmasi M5 MSS.`,
      silver_bullet: `[Data Skenario Silver Bullet Di-Hidangkan]\n• Topik: **${label}**\n• Jendela Waktu: 10:00–11:00 AM NY (15–20 pips target FVG).\n• Rujukan Skenario: Menghidangkan FVG M1/M5 pertama pasca penyapuan likuiditas sesi.`,
      smt_divergence: `[Data Skenario SMT Divergence Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: Divergence struktural antarinstrumen berkorelasi (XAUUSD vs DXY).\n• Rujukan Skenario: Menghidangkan akumulasi tersembunyi saat satu instrumen gagal ikuti High/Low.`,
      ipda_ranges: `[Data Skenario IPDA Lookback Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: Lookback Data Range 20, 40, dan 60 hari.\n• Rujukan Skenario: Menghidangkan rentang harga IPDA harian untuk penentuan bias HTF.`,
      power_of_three: `[Data Skenario PO3 / AMD Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: Siklus Accumulation (Asia), Manipulation (London), Distribution (NY).\n• Rujukan Skenario: Menghidangkan tahapan AMD harian untuk eksekusi pasca-manipulasi.`,
      nwog_ndog: `[Data Skenario Opening Gap Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: NWOG (New Week Gap) & NDOG (New Day Gap) antara penutupan & pembukaan.\n• Rujukan Skenario: Menghidangkan celah opening gap sebagai magnet likuiditas.`,
      standard_deviation: `[Data Skenario Proyeksi STDV Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: Proyeksi Fibonacci STDV (-2.0, -2.5, -4.0) dari manipulation leg.\n• Rujukan Skenario: Menghidangkan level target Take Profit objektif pada -2.0 & -2.5.`,
      prop_firm: `[Data Skenario Riset Prop Firm Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: Limit rugi harian max 4–5%, max drawdown 8–10%, risk per trade 0.5%–1%.\n• Rujukan Skenario: Menghidangkan toleransi nominal lot & SL terukur.`,
      playbook_xau: `[Data Skenario Playbook Gold Di-Hidangkan]\n• Topik: **${label}**\n• Karakteristik: ATR harian XAU/USD dengan buffer SL 30–50 pips.\n• Rujukan Skenario: Menghidangkan parameter volatilitas khas Gold pada sesi London/NY.`,

      trading_basics: `[Data Skenario Dasar Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan kalkulasi rasio risiko dan probabilitas.`,
      instruments: `[Data Skenario Instrumen Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan spesifikasi spread, lot, dan volatilitas instrumen.`,
      order_math: `[Data Skenario Orde Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan kalkulasi nilai pips, margin, dan profit/loss.`,
      risk: `[Data Skenario Risiko Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan penentuan jarak Stop Loss (invalidasi) berbasis struktur & ATR.`,
      candle: `[Data Skenario OHLC Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan bentuk pembacaan 4 harga (Open, High, Low, Close).`,
      timeframe: `[Data Skenario Timeframe Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan perbandingan arah timeframe besar vs kecil.`,
      trend: `[Data Skenario Struktur Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan konfirmasi Swing High/Low dan Body Displacement.`,
      support_resistance: `[Data Skenario Level Kunci Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan koordinat Support & Resistance terdekat.`,
      liquidity: `[Data Skenario Likuiditas Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan posisi BSL (High) dan SSL (Low) terdekat.`,
      imbalance: `[Data Skenario Imbalance Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan batas atas dan bawah Fair Value Gap (FVG).`,
      order_block: `[Data Skenario Order Block Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan batas rentang Order Block aktif.`,
      session: `[Data Skenario Sesi Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan jadwal killzone sesi Asia, London, dan New York.`,
      volatility: `[Data Skenario Volatilitas Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan perhitungan ATR dan pemakaian range harian.`,
      momentum: `[Data Skenario Momentum Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan persentase perubahan harga M15 vs H1.`,
      premium_discount: `[Data Skenario Premium/Discount Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan posisi harga relatif terhadap Equilibrium 50%.`,
      news: `[Data Skenario Berita Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan besaran fluktuasi candle saat rilis berita.`,
      psychology: `[Data Skenario Psikologi Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan checklist keputusan objektif bebas emosi.`,
      backtest: `[Data Skenario Backtest Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan template pencatatan variabel sampel backtest.`,
      trade_management: `[Data Skenario Manajemen Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan aturan eksekusi partial dan break-even.`,
      structural_fallback: `[Data Skenario Struktur Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan parameter struktural dasar.`,
      management_fallback: `[Data Skenario Manajemen Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan parameter manajemen risiko.`,
      basics_fallback: `[Data Skenario Dasar Di-Hidangkan]\n• Topik: **${label}**\n• Rujukan Skenario: Menghidangkan parameter dasar materi.`
    };
    return messages[group] || messages.basics_fallback;
  }

  function buildOfflineExample(category, topic) {
    const group = classifyOfflineTopic(category, topic);
    return {
      status: 'offline',
      mode: 'offline',
      topic: String(topic || ''),
      category: String(category || 'basics'),
      route: { group },
      content: {
        title: 'Contoh Materi',
        message: offlineMessage(group, topic),
        disclaimer: 'Mode latihan lokal tanpa data market live. Bukan sinyal Buy/Sell dan bukan keluaran AI.'
      }
    };
  }

  function apiUrls() {
    const configured = String(root.AMY_FX_LEARNING_API_URL || '').trim();
    return [...new Set([
      ...(configured ? [configured] : []),
      DEFAULT_API_URL
    ])];
  }

  async function requestLiveExample(url, params) {
    const controller = typeof root.AbortController === 'function'
      ? new root.AbortController()
      : null;
    const timeout = controller
      ? root.setTimeout(() => controller.abort(), API_ATTEMPT_TIMEOUT_MS)
      : null;

    try {
      const response = await root.fetch(`${url}?${params.toString()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        ...(controller ? { signal: controller.signal } : {})
      });
      const contentType = String(response.headers?.get?.('content-type') || '');
      if (!response.ok || (contentType && !contentType.includes('application/json'))) {
        throw new Error(`Learning API HTTP ${response.status}`);
      }
      const data = await response.json().catch(() => null);
      if (data?.status !== 'ok' || !data?.content?.message) {
        throw new Error(data?.message || 'Learning API response tidak valid');
      }
      return data;
    } finally {
      if (timeout) root.clearTimeout(timeout);
    }
  }

  async function fetchLiveExample(category, topic) {
    if (typeof root.fetch !== 'function') return buildOfflineExample(category, topic);

    const params = new URLSearchParams({
      category: String(category || 'basics'),
      topic: String(topic || '')
    });

    for (const url of apiUrls()) {
      try {
        return await requestLiveExample(url, params);
      } catch (_) {
        // API belum tersedia, koneksi gagal, timeout, atau respons bukan JSON.
        // Lanjutkan ke URL berikutnya lalu gunakan fallback lokal yang jujur.
      }
    }

    return buildOfflineExample(category, topic);
  }

  function generateUI(category, topic) {
    const box = document.createElement('div');
    box.className = 'live-example-box glass-panel';
    box.style.margin = '2rem 0';
    box.style.padding = '1.5rem';
    box.style.borderLeft = '4px solid var(--accent, #b8860b)';
    box.style.borderRadius = '8px';
    box.style.background = 'rgba(20, 20, 20, 0.4)';
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    box.dataset.category = String(category || '');
    box.dataset.topic = String(topic || '');
    box.dataset.liveState = 'loading';

    const title = document.createElement('h3');
    title.style.marginTop = '0';
    title.style.display = 'flex';
    title.style.alignItems = 'center';
    title.style.gap = '8px';
    title.style.color = 'var(--text-primary, #fff)';

    const titleText = document.createElement('span');
    titleText.dataset.liveExampleTitle = 'true';
    titleText.textContent = 'Live Market Example';
    title.appendChild(document.createTextNode('📊 '));
    title.appendChild(titleText);

    const pulse = document.createElement('span');
    pulse.dataset.liveExamplePulse = 'true';
    pulse.style.display = 'inline-block';
    pulse.style.width = '8px';
    pulse.style.height = '8px';
    pulse.style.borderRadius = '50%';
    pulse.style.background = '#ff3b30';
    pulse.style.boxShadow = '0 0 8px #ff3b30';
    pulse.style.animation = 'pulse 2s infinite';
    title.appendChild(pulse);

    const desc = document.createElement('p');
    desc.dataset.liveExampleDescription = 'true';
    desc.style.marginBottom = '0';
    desc.style.lineHeight = '1.6';
    desc.style.color = 'var(--text-secondary, #ddd)';
    desc.innerHTML = `<em>Memuat data market untuk topik <strong>${escapeHtml(topicLabel(topic))}</strong>...</em>`;

    box.appendChild(title);
    box.appendChild(desc);

    if (!document.getElementById('amy-live-pulse-css')) {
      const style = document.createElement('style');
      style.id = 'amy-live-pulse-css';
      style.textContent = '@keyframes pulse { 0% { transform: scale(0.95); opacity: 0.8; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.8; } }';
      document.head.appendChild(style);
    }

    return box;
  }

  function applyOfflineState(box, data) {
    box.dataset.liveState = 'offline';
    const titleText = box.querySelector('[data-live-example-title="true"]');
    if (titleText) titleText.textContent = data.content.title || 'Contoh Materi';

    const pulse = box.querySelector('[data-live-example-pulse="true"]');
    if (pulse) {
      pulse.style.background = '#b8860b';
      pulse.style.boxShadow = '0 0 6px rgba(184, 134, 11, 0.55)';
      pulse.style.animation = 'none';
    }
  }

  async function hydrateUI(box, lessonConfig) {
    const desc = box.querySelector('[data-live-example-description="true"]');
    if (!desc) return;

    const data = await fetchLiveExample(lessonConfig.category, lessonConfig.topic);
    const disclaimer = data.content?.disclaimer
      ? `<br><small>${escapeHtml(data.content.disclaimer)}</small>`
      : '';
    desc.innerHTML = `${renderMessage(data.content?.message || '')}${disclaimer}`;
    box.dataset.routeGroup = String(data.route?.group || '');

    if (data.status === 'ok') {
      box.dataset.liveState = 'live';
      box.dataset.marketGeneratedAt = String(data.market?.generatedAt || '');
    } else {
      applyOfflineState(box, data);
    }
  }

  function injectExample(lessonConfig) {
    if (document.querySelector('.live-example-box[data-topic]')) return;

    const target = document.querySelector('.article .glass-panel') || document.querySelector('.article');
    if (!target) return;

    const paragraphs = target.querySelectorAll('p');
    const injectionPoint = paragraphs.length > 2 ? paragraphs[1] : paragraphs[paragraphs.length - 1];
    if (!injectionPoint?.parentNode) return;

    const ui = generateUI(lessonConfig.category, lessonConfig.topic);
    injectionPoint.parentNode.insertBefore(ui, injectionPoint.nextSibling);
    hydrateUI(ui, lessonConfig);
  }

  function cleanTitle(path) {
    if (!path) return '';
    const filename = path.split('/').pop().replace(/\.html$/, '');
    return topicLabel(filename);
  }

  function markLessonCompleted(currentPath) {
    try {
      const readSet = JSON.parse(localStorage.getItem('amy_read_topics') || '[]');
      const folderMatch = currentPath.match(/bagian-\d+[^/]+/);
      if (folderMatch && readSet.indexOf(folderMatch[0]) === -1) {
        readSet.push(folderMatch[0]);
        localStorage.setItem('amy_read_topics', JSON.stringify(readSet));
      }
    } catch (_) {}
  }

  function injectChapterNavigation(registry) {
    if (document.querySelector('.chapter-nav-box')) return;

    const currentPath = getCurrentPath();
    if (!currentPath || currentPath.endsWith('/index.html')) return;

    const lessonKeys = Object.keys(registry?.lessons || {}).filter(k => {
      const cfg = registry.lessons[k];
      return cfg && cfg.enabled && cfg.topic !== 'index' && !k.endsWith('/index.html');
    });

    const currentIndex = lessonKeys.indexOf(currentPath);
    if (currentIndex === -1) return;

    const prevPath = currentIndex > 0 ? lessonKeys[currentIndex - 1] : null;
    const nextPath = currentIndex < lessonKeys.length - 1 ? lessonKeys[currentIndex + 1] : null;

    const nav = document.createElement('nav');
    nav.className = 'chapter-nav-box glass-panel';
    nav.setAttribute('aria-label', 'Navigasi Bab');

    if (prevPath) {
      const prevBtn = document.createElement('a');
      prevBtn.className = 'chapter-nav-btn prev-btn';
      prevBtn.href = `../${prevPath}`;
      prevBtn.innerHTML = `<span class="nav-dir">← Materi Sebelumnya</span><span class="nav-title">${escapeHtml(cleanTitle(prevPath))}</span>`;
      nav.appendChild(prevBtn);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'chapter-nav-placeholder';
      nav.appendChild(placeholder);
    }

    const catalogBtn = document.createElement('a');
    catalogBtn.className = 'chapter-nav-btn catalog-btn';
    catalogBtn.href = '../daftar-materi.html';
    catalogBtn.innerHTML = `<span class="nav-icon">📚</span><span class="nav-title">Daftar Materi</span>`;
    nav.appendChild(catalogBtn);

    if (nextPath) {
      const nextBtn = document.createElement('a');
      nextBtn.className = 'chapter-nav-btn next-btn';
      nextBtn.href = `../${nextPath}`;
      nextBtn.id = 'btn-next-chapter';
      nextBtn.innerHTML = `<span class="nav-dir">Materi Berikutnya →</span><span class="nav-title">${escapeHtml(cleanTitle(nextPath))}</span>`;
      if (typeof nextBtn.addEventListener === 'function') {
        nextBtn.addEventListener('click', () => {
          markLessonCompleted(currentPath);
        });
      }
      nav.appendChild(nextBtn);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'chapter-nav-placeholder';
      nav.appendChild(placeholder);
    }

    const target = document.querySelector('.article-layout .article, .article');
    if (target) {
      target.appendChild(nav);
    }
  }

  async function boot() {
    const registry = await loadRegistry();
    if (!registry?.lessons) return;

    const lessonConfig = registry.lessons[getCurrentPath()];

    const runInjections = () => {
      injectChapterNavigation(registry);
      if (lessonConfig?.enabled && lessonConfig.topic && lessonConfig.topic !== 'index') {
        injectExample(lessonConfig);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runInjections, { once: true });
    } else {
      runInjections();
    }
  }

  return {
    boot,
    buildOfflineExample,
    fetchLiveExample,
    getCurrentPath,
    renderMessage,
    injectChapterNavigation
  };
});
