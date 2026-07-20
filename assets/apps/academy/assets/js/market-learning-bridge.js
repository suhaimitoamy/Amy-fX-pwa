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
    { id: 'trading_basics', pattern: /(apa-itu-trading|pengertian-trading|definisi-trading|realita-trading|cara-belajar-trading)/ },
    { id: 'backtest', pattern: /(backtest|backtesting|forward-test|jurnal|journal|sample-size|expectancy|win-rate)/ },
    { id: 'psychology', pattern: /(psikologi|psychology|fomo|revenge|disiplin|emosi|sabar|overtrading|mindset)/ },
    { id: 'news', pattern: /(news|fundamental|nfp|cpi|fomc|suku-bunga|inflasi|employment|cot-report)/ },
    { id: 'trade_management', pattern: /(trade-management|partial|break-even|breakeven|trailing|scale-out|exit-plan|manage-position|mengelola-hasil)/ },
    { id: 'risk', pattern: /(stop-loss|take-profit|risk|reward|leverage|margin|equity|balance|drawdown|position-sizing|ukuran-posisi|daily-loss|maximum-loss)/ },
    { id: 'session', pattern: /(session|killzone|london|new-york|asia|true-day-open|midnight-open|nymo|opening-gap|ndog|nwog|macro-time|algorithmic-time)/ },
    { id: 'timeframe', pattern: /(timeframe|multi-timeframe|top-down|topdown|higher-timeframe|lower-timeframe|daily-bias)/ },
    { id: 'liquidity', pattern: /(liquidity|likuiditas|sweep|grab|bsl|ssl|inducement|stop-hunt|turtle-soup|draw-on-liquidity)/ },
    { id: 'imbalance', pattern: /(fair-value-gap|fvg|imbalance|balanced-price-range|bpr|ifvg|liquidity-void|volume-imbalance|consequent-encroachment)/ },
    { id: 'order_block', pattern: /(order-block|breaker-block|mitigation-block|rejection-block|propulsion-block)/ },
    { id: 'premium_discount', pattern: /(premium|discount|equilibrium|ote|fibonacci|dealing-range|optimal-trade-entry)/ },
    { id: 'support_resistance', pattern: /(support|resistance|supply|demand|level-kunci|horizontal-level)/ },
    { id: 'volatility', pattern: /(atr|volatility|volatilitas|range-harian|adr|standard-deviation|stdv)/ },
    { id: 'momentum', pattern: /(rsi|momentum|divergence|smt|moving-average|ema|sma|macd|stochastic)/ },
    { id: 'candle', pattern: /(candlestick|candle|ohlc|doji|engulf|pin-bar|wick|body-candle)/ },
    { id: 'trend', pattern: /(trend|market-structure|struktur-market|bos|choch|mss|cisd|displacement|break-of-structure|change-of-character|mmxm|power-of-three|weekly-cycle|monthly-cycle|ipda)/ },
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
      trading_basics: `Contoh latihan **${label}**: trader tidak perlu menebak hasil berikutnya. Susun skenario, tentukan batas risiko, lalu terima bahwa satu transaksi hanya bagian kecil dari rangkaian probabilitas.`,
      instruments: `Contoh latihan **${label}**: Gold, Forex, indeks, dan crypto memiliki volatilitas serta biaya transaksi berbeda. Aturan lot dan jarak stop harus disesuaikan dengan karakter instrumennya.`,
      order_math: `Contoh latihan **${label}**: perubahan harga baru menjadi profit atau loss setelah dihitung bersama arah Buy/Sell, ukuran lot, spread, komisi, dan nilai pip atau point.`,
      risk: `Contoh latihan **${label}**: tentukan titik invalidasi lebih dahulu, hitung jarak stop, lalu kecilkan atau besarkan lot agar nominal risiko tetap sesuai rencana.`,
      candle: `Contoh latihan **${label}**: baca open, high, low, close, ukuran body, dan wick sebagai satu kesatuan. Satu bentuk candle tidak cukup tanpa lokasi dan konteks struktur.`,
      timeframe: `Contoh latihan **${label}**: gunakan timeframe besar untuk konteks arah dan timeframe kecil untuk eksekusi. Konflik antartimeframe adalah alasan menunggu, bukan alasan menebak.`,
      trend: `Contoh latihan **${label}**: tandai rangkaian high dan low terlebih dahulu. Break level baru bermakna jika didukung penutupan candle, displacement, dan konteks struktur.`,
      support_resistance: `Contoh latihan **${label}**: perlakukan support dan resistance sebagai area reaksi, bukan garis yang pasti memantulkan harga. Tunggu respons candle sebelum mengambil keputusan.`,
      liquidity: `Contoh latihan **${label}**: high dan low yang jelas dapat menjadi pool likuiditas. Sweep baru lebih bermakna ketika harga mengambil level lalu kembali menutup ke dalam range.`,
      imbalance: `Contoh latihan **${label}**: FVG atau imbalance menunjukkan delivery harga yang tidak seimbang. Zona tetap harus dinilai bersama struktur, likuiditas, dan status mitigasinya.`,
      order_block: `Contoh latihan **${label}**: Order Block bukan sekadar candle terakhir sebelum bergerak. Candle asal harus terhubung dengan displacement dan break struktur yang dapat dibuktikan.`,
      session: `Contoh latihan **${label}**: bandingkan perilaku Asia, London, dan New York. Volatilitas serta pola pengambilan likuiditas dapat berubah menurut sesi.`,
      volatility: `Contoh latihan **${label}**: gunakan ATR atau range rata-rata untuk menilai apakah stop dan target masuk akal. Jangan mengejar harga ketika sebagian besar range harian sudah terpakai.`,
      momentum: `Contoh latihan **${label}**: momentum lebih kuat saat pergerakan harga dan struktur mendukung indikator. Hindari memakai oscillator sebagai sinyal tunggal.`,
      premium_discount: `Contoh latihan **${label}**: tentukan dealing range, cari titik tengahnya, lalu nilai apakah harga berada di premium atau discount relatif terhadap range tersebut.`,
      news: `Contoh latihan **${label}**: pisahkan perkiraan, hasil aktual, dan reaksi harga. Candle besar saat news tidak otomatis memberi arah lanjutan yang aman.`,
      psychology: `Contoh latihan **${label}**: tidak entry juga merupakan keputusan valid. Gunakan checklist agar FOMO, revenge trade, dan rasa ingin membalas kerugian tidak mengambil alih.`,
      backtest: `Contoh latihan **${label}**: catat setup, sesi, timeframe, kondisi struktur, risiko, dan hasil secara konsisten. Win rate tanpa konteks dan jumlah sampel mudah menyesatkan.`,
      trade_management: `Contoh latihan **${label}**: aturan partial, break-even, trailing, dan exit harus ditentukan sebelum entry agar keputusan tidak berubah karena takut atau serakah.`,
      structural_fallback: `Contoh latihan **${label}**: mulai dari struktur, lokasi harga, likuiditas, dan invalidasi. Jangan menggunakan satu konsep struktural secara terpisah dari konteks market.`,
      management_fallback: `Contoh latihan **${label}**: ubah materi ini menjadi checklist yang dapat diperiksa sebelum, saat, dan setelah transaksi agar keputusan tetap konsisten.`,
      basics_fallback: `Contoh latihan **${label}**: pahami definisi, tujuan, risiko, dan contoh penerapannya terlebih dahulu sebelum menggunakannya pada chart nyata.`
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

  async function boot() {
    const registry = await loadRegistry();
    if (!registry?.lessons) return;

    const lessonConfig = registry.lessons[getCurrentPath()];
    if (!lessonConfig?.enabled || !lessonConfig.topic || lessonConfig.topic === 'index') return;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => injectExample(lessonConfig), { once: true });
    } else {
      injectExample(lessonConfig);
    }
  }

  return {
    boot,
    buildOfflineExample,
    fetchLiveExample,
    getCurrentPath,
    renderMessage
  };
});