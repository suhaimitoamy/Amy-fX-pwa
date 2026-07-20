const TOPIC_MAX_LENGTH = 120;

const GROUP_INTERVALS = Object.freeze({
  trading_basics: ['1min', '1day'],
  instruments: ['1min', '1day'],
  order_math: ['1min', '1day'],
  risk: ['1min', '1day'],
  candle: ['15min', '1day'],
  timeframe: ['15min', '1h', '1day'],
  trend: ['15min', '1h', '1day'],
  support_resistance: ['15min', '1h', '1day'],
  liquidity: ['15min', '1h', '1day'],
  imbalance: ['15min', '1h', '1day'],
  order_block: ['15min', '1h', '1day'],
  session: ['1min', '15min', '1day'],
  volatility: ['15min', '1day'],
  momentum: ['15min', '1h', '1day'],
  premium_discount: ['15min', '1h', '1day'],
  news: ['1min', '15min', '1day'],
  psychology: ['1min', '1day'],
  backtest: ['15min', '1h', '1day'],
  trade_management: ['1min', '15min', '1day'],
  structural_fallback: ['15min', '1h', '1day'],
  management_fallback: ['1min', '15min', '1day'],
  basics_fallback: ['1min', '1day']
});

const TOPIC_RULES = Object.freeze([
  { id: 'trading_basics', pattern: /(apa-itu-trading|pengertian-trading|definisi-trading|realita-trading)/ },
  { id: 'instruments', pattern: /(market-forex|forex|gold|xauusd|komoditas|indeks|crypto|instrumen|pair)/ },
  { id: 'order_math', pattern: /(buy|sell|profit|loss|lot|pip|point|spread|long|short|bid|ask)/ },
  { id: 'risk', pattern: /(stop-loss|take-profit|risk|reward|rr-|risk-reward|leverage|margin|equity|balance|drawdown|position-sizing|ukuran-posisi)/ },
  { id: 'candle', pattern: /(candlestick|candle|ohlc|doji|engulf|pin-bar|wick|body-candle)/ },
  { id: 'timeframe', pattern: /(timeframe|multi-timeframe|top-down|topdown|higher-timeframe|lower-timeframe)/ },
  { id: 'support_resistance', pattern: /(support|resistance|supply|demand|level-kunci|horizontal-level)/ },
  { id: 'liquidity', pattern: /(liquidity|likuiditas|sweep|grab|bsl|ssl|inducement|stop-hunt|turtle-soup|draw-on-liquidity)/ },
  { id: 'imbalance', pattern: /(fair-value-gap|fvg|imbalance|balanced-price-range|bpr|ifvg|liquidity-void|volume-imbalance)/ },
  { id: 'order_block', pattern: /(order-block|breaker-block|mitigation-block|rejection-block|propulsion-block|block-advanced)/ },
  { id: 'session', pattern: /(session|killzone|london|new-york|asia|true-day-open|midnight-open|nymo|opening-gap|ndog|nwog|macro-time)/ },
  { id: 'volatility', pattern: /(atr|volatility|volatilitas|range-harian|adr|standard-deviation)/ },
  { id: 'momentum', pattern: /(rsi|momentum|divergence|smt|moving-average|ema|sma|macd|stochastic)/ },
  { id: 'premium_discount', pattern: /(premium|discount|equilibrium|ote|fibonacci|dealing-range|optimal-trade-entry)/ },
  { id: 'news', pattern: /(news|fundamental|nfp|cpi|fomc|interest-rate|suku-bunga|inflasi|employment)/ },
  { id: 'psychology', pattern: /(psikologi|psychology|fomo|revenge|disiplin|emosi|sabar|overtrading|mindset)/ },
  { id: 'backtest', pattern: /(backtest|backtesting|forward-test|jurnal|journal|sample-size|expectancy|win-rate)/ },
  { id: 'trade_management', pattern: /(trade-management|partial|break-even|breakeven|trailing|scale-out|pyramiding|exit-plan|manage-position)/ },
  { id: 'trend', pattern: /(trend|market-structure|struktur-market|bos|choch|mss|cisd|displacement|break-of-structure|change-of-character|mmxm|amd|power-of-three)/ }
]);

export function normalizeTopic(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.html?$/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, TOPIC_MAX_LENGTH);
}

export function humanizeTopic(value) {
  const topic = normalizeTopic(value);
  if (!topic || topic === 'index') return 'ringkasan materi';
  return topic
    .split('-')
    .filter(Boolean)
    .map(word => word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function classifyLearningTopic(topicValue, categoryValue = '') {
  const topic = normalizeTopic(topicValue);
  const category = normalizeTopic(categoryValue);
  const matched = TOPIC_RULES.find(rule => rule.pattern.test(topic));
  const group = matched?.id || (
    category === 'structural' ? 'structural_fallback'
      : category === 'management' ? 'management_fallback'
        : 'basics_fallback'
  );

  return Object.freeze({
    topic,
    category: category || 'basics',
    group,
    intervals: [...GROUP_INTERVALS[group]]
  });
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function price(value) {
  return number(value).toFixed(2);
}

function percent(value) {
  const parsed = number(value);
  const sign = parsed > 0 ? '+' : '';
  return `${sign}${parsed.toFixed(2)}%`;
}

function directionLabel(value) {
  if (value === 'bullish') return 'bullish';
  if (value === 'bearish') return 'bearish';
  return 'netral';
}

function timeframeName(interval) {
  return ({ '1min': 'M1', '15min': 'M15', '1h': 'H1', '1day': 'D1' })[interval] || interval;
}

function sessionAt(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Makassar',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date).split(':').map(Number);
    const minutes = parts[0] * 60 + parts[1];
    if (minutes >= 6 * 60 && minutes < 14 * 60) return 'Asia';
    if (minutes >= 14 * 60 && minutes < 20 * 60) return 'London';
    if (minutes >= 20 * 60 || minutes < 1 * 60) return 'New York';
    return 'transisi/off-session';
  } catch (_) {
    return 'tidak diketahui';
  }
}

function summarizeSeries(candles = [], interval = '') {
  const valid = candles.filter(candle =>
    [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
  );
  if (!valid.length) return null;

  const latest = valid.at(-1);
  const previous = valid.at(-2) || latest;
  const sample = valid.slice(-20);
  const first = sample[0] || latest;
  const recentHigh = Math.max(...sample.map(candle => candle.high));
  const recentLow = Math.min(...sample.map(candle => candle.low));
  const changePct = first.close ? ((latest.close - first.close) / first.close) * 100 : 0;
  const candleDirection = latest.close > latest.open ? 'bullish' : latest.close < latest.open ? 'bearish' : 'neutral';
  const trend = changePct > 0.08 ? 'bullish' : changePct < -0.08 ? 'bearish' : 'sideways';
  const averageBody = sample.reduce((sum, candle) => sum + Math.abs(candle.close - candle.open), 0) / sample.length;
  const latestBody = Math.abs(latest.close - latest.open);

  return {
    interval,
    timeframe: timeframeName(interval),
    open: latest.open,
    high: latest.high,
    low: latest.low,
    close: latest.close,
    previousClose: previous.close,
    range: latest.high - latest.low,
    body: latestBody,
    averageBody,
    displacement: averageBody > 0 && latestBody >= averageBody * 1.5,
    candleDirection,
    trend,
    changePct,
    recentHigh,
    recentLow,
    midpoint: (recentHigh + recentLow) / 2
  };
}

function atr(candles = [], period = 14) {
  const valid = candles.slice(-(period + 1));
  if (valid.length < 2) return 0;
  const ranges = [];
  for (let index = 1; index < valid.length; index += 1) {
    const current = valid[index];
    const previous = valid[index - 1];
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    ));
  }
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function detectFvg(candles = []) {
  for (let index = candles.length - 1; index >= 2; index -= 1) {
    const left = candles[index - 2];
    const right = candles[index];
    if (right.low > left.high) {
      return { direction: 'bullish', bottom: left.high, top: right.low };
    }
    if (right.high < left.low) {
      return { direction: 'bearish', bottom: right.high, top: left.low };
    }
  }
  return null;
}

function detectSweep(candles = []) {
  if (candles.length < 12) return null;
  const latest = candles.at(-1);
  const prior = candles.slice(-11, -1);
  const priorHigh = Math.max(...prior.map(candle => candle.high));
  const priorLow = Math.min(...prior.map(candle => candle.low));
  if (latest.high > priorHigh && latest.close < priorHigh) {
    return { side: 'BSL', level: priorHigh, status: 'reclaimed' };
  }
  if (latest.low < priorLow && latest.close > priorLow) {
    return { side: 'SSL', level: priorLow, status: 'reclaimed' };
  }
  return null;
}

export function buildMarketContext(seriesByInterval, now = new Date()) {
  const summaries = {};
  for (const [interval, candles] of Object.entries(seriesByInterval || {})) {
    summaries[interval] = summarizeSeries(candles, interval);
  }

  const primary = summaries['1min'] || summaries['15min'] || summaries['1h'] || summaries['1day'];
  if (!primary) throw new Error('Market context kosong');

  const dailyCandles = seriesByInterval?.['1day'] || [];
  const structuralCandles = seriesByInterval?.['15min'] || seriesByInterval?.['1h'] || [];
  const daily = summaries['1day'];

  return Object.freeze({
    symbol: 'XAU/USD',
    price: primary.close,
    session: sessionAt(now),
    summaries,
    dailyAtr14: atr(dailyCandles, 14),
    dailyPosition: daily && daily.range > 0 ? (daily.close - daily.low) / daily.range : 0.5,
    fvg: detectFvg(structuralCandles),
    sweep: detectSweep(structuralCandles),
    generatedAt: now.toISOString()
  });
}

function baseFacts(context) {
  const daily = context.summaries['1day'];
  return [
    `XAU/USD ${price(context.price)}`,
    `Sesi ${context.session}`,
    daily ? `D1 ${directionLabel(daily.candleDirection)} (${percent(daily.changePct)})` : 'D1 belum tersedia'
  ];
}

function buildByGroup(route, context) {
  const topicName = humanizeTopic(route.topic);
  const m1 = context.summaries['1min'];
  const m15 = context.summaries['15min'];
  const h1 = context.summaries['1h'];
  const d1 = context.summaries['1day'];
  const structural = m15 || h1 || d1 || m1;

  switch (route.group) {
    case 'trading_basics':
      return `Pada contoh nyata **${topicName}**, XAU/USD sedang berada di **$${price(context.price)}**. Dibanding open harian **$${price(d1?.open)}**, harga sekarang ${context.price >= number(d1?.open) ? 'lebih tinggi' : 'lebih rendah'}. Ini menunjukkan inti trading: keputusan dibuat dari perubahan harga dan risiko, bukan menebak hasil secara pasti.`;
    case 'instruments':
      return `Untuk materi **${topicName}**, Amy FX memakai Gold/XAUUSD sebagai contoh. Harga saat ini **$${price(context.price)}**, dengan rentang harian **$${price(d1?.range)}** dari **$${price(d1?.low)}** sampai **$${price(d1?.high)}**. Setiap instrumen memiliki karakter volatilitas berbeda, jadi aturan lot dan jarak stop tidak boleh disalin mentah.`;
    case 'order_math':
      return `Contoh **${topicName}**: XAU/USD bergerak dari open D1 **$${price(d1?.open)}** ke **$${price(context.price)}**, selisih **$${price(context.price - number(d1?.open))}**. Posisi Buy mendapat keuntungan ketika selisihnya positif, sedangkan Sell mendapat keuntungan ketika selisihnya negatif; hasil uang tetap bergantung pada lot dan biaya broker.`;
    case 'risk':
      return `Untuk **${topicName}**, ATR(14) harian XAU/USD sekitar **$${price(context.dailyAtr14)}** dan range hari berjalan **$${price(d1?.range)}**. Stop loss sebaiknya mengikuti invalidasi struktur dan volatilitas, lalu ukuran lot disesuaikan agar nominal risiko tetap—bukan memperbesar lot karena merasa setup pasti menang.`;
    case 'candle':
      return `Pada **${structural?.timeframe || 'M15'}**, candle terbaru XAU/USD bersifat **${directionLabel(structural?.candleDirection)}**, open **$${price(structural?.open)}**, high **$${price(structural?.high)}**, low **$${price(structural?.low)}**, dan close **$${price(structural?.close)}**. Inilah data OHLC nyata yang dipakai untuk membaca **${topicName}**.`;
    case 'timeframe':
      return `Contoh **${topicName}**: M15 sedang **${m15?.trend || 'belum tersedia'}**, sedangkan H1 **${h1?.trend || 'belum tersedia'}**. Bila arah timeframe berbeda, trader sebaiknya menunggu sinkronisasi atau memperjelas apakah entry yang dicari adalah continuation atau reversal.`;
    case 'trend':
      return `Untuk **${topicName}**, struktur M15 saat ini **${m15?.trend || 'belum tersedia'}** dengan high 20-candle **$${price(m15?.recentHigh)}** dan low **$${price(m15?.recentLow)}**. Candle terbaru ${m15?.displacement ? 'memiliki displacement di atas rata-rata body' : 'belum menunjukkan displacement kuat'}, sehingga break level belum otomatis berarti perubahan struktur valid.`;
    case 'support_resistance':
      return `Pada contoh **${topicName}**, area referensi M15 berada di high terbaru **$${price(m15?.recentHigh)}** dan low terbaru **$${price(m15?.recentLow)}**. Harga **$${price(context.price)}** berada ${context.price >= number(m15?.midpoint) ? 'di atas' : 'di bawah'} titik tengah range **$${price(m15?.midpoint)}**; level tetap perlu reaksi candle, bukan dipakai sebagai garis pasti memantul.`;
    case 'liquidity':
      return context.sweep
        ? `Untuk **${topicName}**, engine menemukan sweep **${context.sweep.side}** pada sekitar **$${price(context.sweep.level)}** dan harga kembali menutup melewati level tersebut. Ini adalah contoh pengambilan likuiditas yang sudah memiliki reclaim, tetapi tetap bukan perintah Buy/Sell.`
        : `Untuk **${topicName}**, belum ada sweep terkonfirmasi pada sampel candle terbaru. Pool likuiditas terdekat tetap high **$${price(structural?.recentHigh)}** dan low **$${price(structural?.recentLow)}**; keduanya adalah target potensial, bukan jaminan arah.`;
    case 'imbalance':
      return context.fvg
        ? `Pada **${topicName}**, terdeteksi FVG **${context.fvg.direction}** di ${structural?.timeframe || 'M15'} antara **$${price(context.fvg.bottom)}–$${price(context.fvg.top)}**. Zona ini menunjukkan ketidakseimbangan delivery; validitasnya tetap harus dinilai bersama struktur dan likuiditas.`
        : `Untuk **${topicName}**, tidak ada FVG aktif yang terdeteksi pada sampel ${structural?.timeframe || 'M15'} terbaru. Tidak adanya imbalance adalah informasi valid—trader tidak perlu memaksakan zona.`;
    case 'order_block':
      return `Contoh **${topicName}** memakai struktur ${structural?.timeframe || 'M15'}: range aktif **$${price(structural?.recentLow)}–$${price(structural?.recentHigh)}** dan candle terbaru ${structural?.displacement ? 'menunjukkan displacement' : 'belum menunjukkan displacement kuat'}. Order Block baru layak dipertimbangkan bila candle asal terkait langsung dengan break struktur dan belum kehilangan invalidasinya.`;
    case 'session':
      return `Saat materi **${topicName}** dibaca, sesi WITA berada pada **${context.session}**. Range M15 terbaru **$${price(m15?.recentLow)}–$${price(m15?.recentHigh)}**. Perilaku harga harus dibaca sesuai sesi karena volatilitas Asia, London, dan New York tidak identik.`;
    case 'volatility':
      return `Untuk **${topicName}**, ATR(14) D1 sekitar **$${price(context.dailyAtr14)}**, sedangkan range hari ini **$${price(d1?.range)}**. Hari ini telah memakai sekitar **${context.dailyAtr14 > 0 ? Math.round((number(d1?.range) / context.dailyAtr14) * 100) : 0}%** ATR; semakin besar persentasenya, semakin hati-hati mengejar harga.`;
    case 'momentum':
      return `Contoh **${topicName}**: perubahan 20 candle M15 adalah **${percent(m15?.changePct)}**, sementara H1 **${percent(h1?.changePct)}**. Momentum searah pada dua timeframe lebih kuat daripada sinyal indikator tunggal; divergence harus dikonfirmasi struktur.`;
    case 'premium_discount':
      return `Untuk **${topicName}**, dealing range M15 berada di **$${price(m15?.recentLow)}–$${price(m15?.recentHigh)}** dengan equilibrium **$${price(m15?.midpoint)}**. Harga saat ini **$${price(context.price)}** berada di area **${context.price >= number(m15?.midpoint) ? 'premium' : 'discount'}** relatif terhadap range tersebut.`;
    case 'news':
      return `Pada **${topicName}**, harga XAU/USD berada di **$${price(context.price)}** dan range M1 terbaru **$${price(m1?.range)}**. Engine hanya menunjukkan reaksi harga; penyebab fundamental harus dikonfirmasi dari kalender ekonomi resmi dan hasil aktual, bukan ditebak dari candle saja.`;
    case 'psychology':
      return `Contoh **${topicName}**: harga sekarang **$${price(context.price)}**, tetapi tidak ada kewajiban untuk entry. Data live dipakai untuk melatih keputusan objektif—menunggu setup valid juga merupakan keputusan trading, terutama saat emosi mendorong FOMO atau revenge trade.`;
    case 'backtest':
      return `Untuk **${topicName}**, kondisi live saat ini dicatat sebagai M15 **${m15?.trend || 'belum tersedia'}**, H1 **${h1?.trend || 'belum tersedia'}**, sesi **${context.session}**, dan ATR D1 **$${price(context.dailyAtr14)}**. Variabel seperti ini perlu disimpan konsisten agar hasil backtest dapat dibandingkan, bukan hanya mencatat menang atau kalah.`;
    case 'trade_management':
      return `Contoh **${topicName}**: harga **$${price(context.price)}**, high D1 **$${price(d1?.high)}**, low D1 **$${price(d1?.low)}**, dan ATR **$${price(context.dailyAtr14)}**. Partial, break-even, atau trailing sebaiknya dipicu aturan struktur/target, bukan rasa takut ketika posisi mulai bergerak.`;
    case 'structural_fallback':
      return `Untuk materi struktural **${topicName}**, M15 saat ini **${m15?.trend || 'belum tersedia'}** dalam range **$${price(m15?.recentLow)}–$${price(m15?.recentHigh)}**. Gunakan data ini sebagai contoh kontekstual; aturan validasi spesifik materi tetap harus dipenuhi sebelum menarik kesimpulan.`;
    case 'management_fallback':
      return `Untuk materi manajemen **${topicName}**, range D1 saat ini **$${price(d1?.range)}** dibanding ATR(14) **$${price(context.dailyAtr14)}**. Angka live ini membantu menyesuaikan risiko dan ekspektasi secara objektif.`;
    default:
      return `Untuk materi **${topicName}**, XAU/USD saat ini **$${price(context.price)}**, sesi **${context.session}**, dan candle D1 **${directionLabel(d1?.candleDirection)}**. Contoh ini memberikan konteks live tanpa mengubahnya menjadi sinyal trading.`;
  }
}

export function buildLearningExample(route, context) {
  if (!route?.topic) throw new Error('Topic wajib diisi');
  if (!context?.summaries) throw new Error('Market context wajib diisi');

  return Object.freeze({
    status: 'ok',
    topic: route.topic,
    category: route.category,
    route: {
      group: route.group,
      intervals: route.intervals
    },
    market: {
      symbol: context.symbol,
      price: context.price,
      session: context.session,
      generatedAt: context.generatedAt
    },
    content: {
      title: `Live Market Example — ${humanizeTopic(route.topic)}`,
      message: buildByGroup(route, context),
      facts: baseFacts(context),
      disclaimer: 'Contoh edukasi rule-based, bukan sinyal Buy/Sell dan bukan keluaran AI.'
    }
  });
}
