// NextGen Visual Indicators Engine based on AMY_ICT_NextGen.pine
// Deterministic, zero-dependency, safe calculation on closed/active candles.

export function calculateNextGenIndicators(candles = [], options = {}) {
  const safeCandles = Array.isArray(candles) ? candles.filter(c => c && Number.isFinite(c.time) && Number.isFinite(c.close)) : [];
  if (safeCandles.length === 0) {
    return {
      keyLevels: {
        pdh: null, pdl: null, pdhConsumed: false, pdlConsumed: false,
        pwh: null, pwl: null, pwhConsumed: false, pwlConsumed: false,
        asiaHigh: null, asiaLow: null, asiaStart: null, asiaEnd: null, asiaHighConsumed: false, asiaLowConsumed: false,
        pdEq: null, pdHigh: null, pdLow: null,
        trendInvalidation: null, trendInvalidationText: '', trendInvalidationColor: '#ef4444', trend: 'NEUTRAL'
      },
      liquidity: { bsl: [], ssl: [], sweeps: [] },
      structure: { events: [], trend: 'NEUTRAL', invalidation: null },
      poi: { fvg: [], ob: [] }
    };
  }

  const swingLen = options.swingLen || 4;
  const pdLookback = options.pdLookback || 80;
  const obSearchBars = options.obSearchBars || 12;
  const obUseBody = options.obUseBody !== false;
  const context = options.context || {};
  const serverLevels = context?.amy?.levels || {};

  // 1. Dealing Range: 80-bar lookback PD EQ
  const recentSlice = safeCandles.slice(-pdLookback);
  const pdHigh = Math.max(...recentSlice.map(c => c.high));
  const pdLow = Math.min(...recentSlice.map(c => c.low));
  const pdEq = Number.isFinite(pdHigh) && Number.isFinite(pdLow) ? (pdHigh + pdLow) / 2 : null;

// New York 17:00 Close (5:00 PM NY) Trading Day Cutoff for XAU/USD
function getTradingDayKey(timeSec) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(timeSec * 1000));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const hour = Number(p.hour);
    const date = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
    if (hour >= 17) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return date.toISOString().slice(0, 10);
  } catch {
    const shifted = timeSec + 7 * 3600;
    return new Date(shifted * 1000).toISOString().slice(0, 10);
  }
}

  // 2. Calendar groupings for PDH/PDL, PWH/PWL and Asia Session (06:00-14:00 WITA)
  let pdh = null, pdl = null, pdhConsumed = false, pdlConsumed = false;
  let pwh = null, pwl = null, pwhConsumed = false, pwlConsumed = false;
  let asiaHigh = null, asiaLow = null, asiaStart = null, asiaEnd = null;
  let asiaHighConsumed = false, asiaLowConsumed = false;
  const sweeps = [];

  const dayBuckets = new Map();
  const weekBuckets = new Map();
  const asiaBuckets = new Map();

  for (let i = 0; i < safeCandles.length; i++) {
    const c = safeCandles[i];
    // Gold trading day bucket (17:00 NY Close cutoff)
    const tDayStr = getTradingDayKey(c.time);

    // WITA (UTC+8) for local Asia morning session (06:00-14:00 WITA)
    const witaMs = (c.time + 8 * 3600) * 1000;
    const witaDate = new Date(witaMs);
    const minuteOfDay = witaDate.getUTCHours() * 60 + witaDate.getUTCMinutes();
    const isAsia = minuteOfDay >= 360 && minuteOfDay < 840; // 06:00 - 14:00 WITA

    if (!dayBuckets.has(tDayStr)) dayBuckets.set(tDayStr, []);
    dayBuckets.get(tDayStr).push(c);

    if (isAsia) {
      const asiaDateStr = witaDate.toISOString().slice(0, 10);
      if (!asiaBuckets.has(asiaDateStr)) asiaBuckets.set(asiaDateStr, []);
      asiaBuckets.get(asiaDateStr).push(c);
    }

    // Week bucket: ISO week string
    const utcDate = new Date(c.time * 1000);
    const d = new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const weekStr = `${d.getUTCFullYear()}-W${weekNo}`;
    if (!weekBuckets.has(weekStr)) weekBuckets.set(weekStr, []);
    weekBuckets.get(weekStr).push(c);
  }

  // Extract server / context key levels (authoritative D1 Daily source)
  const serverAmyLevels = context?.amy?.levels || {};
  const serverLiq = Array.isArray(context?.liquidity) ? context.liquidity : [];
  const liqPdh = serverLiq.find(l => l.label === 'PDH')?.level;
  const liqPdl = serverLiq.find(l => l.label === 'PDL')?.level;
  const liqPwh = serverLiq.find(l => l.label === 'PWH')?.level;
  const liqPwl = serverLiq.find(l => l.label === 'PWL')?.level;

  const resolvedServerPdh = Number.isFinite(serverAmyLevels.pdh) && serverAmyLevels.pdh > 0
    ? serverAmyLevels.pdh
    : (Number.isFinite(liqPdh) && liqPdh > 0
      ? liqPdh
      : (Number.isFinite(context?.pd?.pdh) && context.pd.pdh > 0
        ? context.pd.pdh
        : (Number.isFinite(context?.levels?.pdh) && context.levels.pdh > 0 ? context.levels.pdh : null)));

  const resolvedServerPdl = Number.isFinite(serverAmyLevels.pdl) && serverAmyLevels.pdl > 0
    ? serverAmyLevels.pdl
    : (Number.isFinite(liqPdl) && liqPdl > 0
      ? liqPdl
      : (Number.isFinite(context?.pd?.pdl) && context.pd.pdl > 0
        ? context.pd.pdl
        : (Number.isFinite(context?.levels?.pdl) && context.levels.pdl > 0 ? context.levels.pdl : null)));

  // Previous Day High / Low from trading day buckets
  const dayKeys = [...dayBuckets.keys()];
  let localPdh = null;
  let localPdl = null;
  if (dayKeys.length >= 2) {
    const prevDayKey = dayKeys[dayKeys.length - 2];
    const prevDayCandles = dayBuckets.get(prevDayKey) || [];
    if (prevDayCandles.length > 0) {
      localPdh = Math.max(...prevDayCandles.map(c => c.high));
      localPdl = Math.min(...prevDayCandles.map(c => c.low));
    }
  }

  // Final resolution: Authoritative Daily D1 preferred, or local NY trading day calculation
  if (Number.isFinite(resolvedServerPdh) && Number.isFinite(resolvedServerPdl)) {
    pdh = Number.isFinite(localPdh) ? Math.max(resolvedServerPdh, localPdh) : resolvedServerPdh;
    pdl = Number.isFinite(localPdl) ? Math.min(resolvedServerPdl, localPdl) : resolvedServerPdl;
  } else if (Number.isFinite(localPdh) && Number.isFinite(localPdl)) {
    pdh = localPdh;
    pdl = localPdl;
  }

  // Check PDH / PDL sweeps and reached status in the latest day
  if (dayKeys.length > 0 && Number.isFinite(pdh) && Number.isFinite(pdl)) {
    const todayCandles = dayBuckets.get(dayKeys[dayKeys.length - 1]) || [];
    for (const c of todayCandles) {
      if (!pdhConsumed && c.high > pdh && c.close < pdh) {
        sweeps.push({ time: c.time, price: c.high, type: 'PDH_SWEEP', side: 'BUY', symbol: '×', color: '#f97316' });
      }
      if (!pdlConsumed && c.low < pdl && c.close > pdl) {
        sweeps.push({ time: c.time, price: c.low, type: 'PDL_SWEEP', side: 'SELL', symbol: '×', color: '#3b82f6' });
      }
      if (c.high >= pdh) pdhConsumed = true;
      if (c.low <= pdl) pdlConsumed = true;
    }
  }

  // Previous Week High / Low
  const weekKeys = [...weekBuckets.keys()];
  let localPwh = null;
  let localPwl = null;
  if (weekKeys.length >= 2) {
    const prevWeekCandles = weekBuckets.get(weekKeys[weekKeys.length - 2]) || [];
    if (prevWeekCandles.length > 0) {
      localPwh = Math.max(...prevWeekCandles.map(c => c.high));
      localPwl = Math.min(...prevWeekCandles.map(c => c.low));
    }
  }

  const resolvedServerPwh = Number.isFinite(serverAmyLevels.pwh) && serverAmyLevels.pwh > 0
    ? serverAmyLevels.pwh
    : (Number.isFinite(liqPwh) && liqPwh > 0
      ? liqPwh
      : (Number.isFinite(context?.amy?.pivots?.W?.R1) ? context.amy.pivots.W.R1 : null));

  const resolvedServerPwl = Number.isFinite(serverAmyLevels.pwl) && serverAmyLevels.pwl > 0
    ? serverAmyLevels.pwl
    : (Number.isFinite(liqPwl) && liqPwl > 0
      ? liqPwl
      : (Number.isFinite(context?.amy?.pivots?.W?.S1) ? context.amy.pivots.W.S1 : null));

  if (Number.isFinite(resolvedServerPwh) && Number.isFinite(resolvedServerPwl)) {
    pwh = Number.isFinite(localPwh) ? Math.max(resolvedServerPwh, localPwh) : resolvedServerPwh;
    pwl = Number.isFinite(localPwl) ? Math.min(resolvedServerPwl, localPwl) : resolvedServerPwl;
  } else if (Number.isFinite(localPwh) && Number.isFinite(localPwl)) {
    pwh = localPwh;
    pwl = localPwl;
  }

  // Check PWH / PWL sweeps
  if (weekKeys.length > 0 && Number.isFinite(pwh) && Number.isFinite(pwl)) {
    const currentWeekCandles = weekBuckets.get(weekKeys[weekKeys.length - 1]) || [];
    for (const c of currentWeekCandles) {
      if (!pwhConsumed && c.high > pwh && c.close < pwh) {
        sweeps.push({ time: c.time, price: c.high, type: 'PWH_SWEEP', side: 'BUY', symbol: '×', color: '#d946ef' });
      }
      if (!pwlConsumed && c.low < pwl && c.close > pwl) {
        sweeps.push({ time: c.time, price: c.low, type: 'PWL_SWEEP', side: 'SELL', symbol: '×', color: '#06b6d4' });
      }
      if (c.high >= pwh) pwhConsumed = true;
      if (c.low <= pwl) pwlConsumed = true;
    }
  }

  // Asia Session High / Low (latest available Asia session)
  const asiaDayKeys = [...asiaBuckets.keys()];
  if (asiaDayKeys.length > 0) {
    const latestAsiaCandles = asiaBuckets.get(asiaDayKeys[asiaDayKeys.length - 1]);
    asiaHigh = Math.max(...latestAsiaCandles.map(c => c.high));
    asiaLow = Math.min(...latestAsiaCandles.map(c => c.low));
    asiaStart = latestAsiaCandles[0].time;
    asiaEnd = latestAsiaCandles[latestAsiaCandles.length - 1].time;

    // Check subsequent candles for Asia sweeps
    const afterAsia = safeCandles.filter(c => c.time > asiaEnd);
    for (const c of afterAsia) {
      if (!asiaHighConsumed && c.high > asiaHigh && c.close < asiaHigh) {
        sweeps.push({ time: c.time, price: c.high, type: 'ASIA_HIGH_SWEEP', side: 'BUY', symbol: '◆', color: '#a855f7' });
      }
      if (!asiaLowConsumed && c.low < asiaLow && c.close > asiaLow) {
        sweeps.push({ time: c.time, price: c.low, type: 'ASIA_LOW_SWEEP', side: 'SELL', symbol: '◆', color: '#a855f7' });
      }
      if (c.high >= asiaHigh) asiaHighConsumed = true;
      if (c.low <= asiaLow) asiaLowConsumed = true;
    }
  } else if (Number.isFinite(serverLevels.asiaHigh) && Number.isFinite(serverLevels.asiaLow)) {
    asiaHigh = serverLevels.asiaHigh;
    asiaLow = serverLevels.asiaLow;
  }

  // 3. Pivots, BSL / SSL, Market Structure (BOS / MSS), Trend Invalidation, FVG, and OB
  const bslLines = [];
  const sslLines = [];
  const structureEvents = [];
  const fvgList = [];
  const obList = [];

  let lastHigh = null;
  let lastLow = null;
  let lastHighTime = null;
  let lastLowTime = null;
  let bslConsumed = false;
  let sslConsumed = false;
  let bslBroken = false;
  let sslBroken = false;
  let trend = 'NEUTRAL';

  // Calculate body moving average for displacement
  const bodies = safeCandles.map(c => Math.abs(c.close - c.open));
  const meanBodies = [];
  for (let i = 0; i < safeCandles.length; i++) {
    if (i < 3) {
      meanBodies.push(bodies[i]);
    } else {
      const slice = bodies.slice(Math.max(0, i - 3), i + 1);
      meanBodies.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
  }

  for (let i = 0; i < safeCandles.length; i++) {
    const c = safeCandles[i];
    const prev = safeCandles[i - 1];

    // Check pivot at i - swingLen
    const k = i - swingLen;
    if (k >= swingLen) {
      const target = safeCandles[k];
      let isPh = true;
      let isPl = true;

      for (let j = k - swingLen; j <= k + swingLen; j++) {
        if (j === k) continue;
        const other = safeCandles[j];
        if (j < k) {
          if (other.high > target.high) isPh = false;
          if (other.low < target.low) isPl = false;
        } else {
          if (other.high >= target.high) isPh = false;
          if (other.low <= target.low) isPl = false;
        }
      }

      if (isPh) {
        lastHigh = target.high;
        lastHighTime = target.time;
        bslConsumed = false;
        bslBroken = false;
        bslLines.push({
          level: lastHigh,
          time: lastHighTime,
          confirmedTime: c.time,
          consumed: false
        });
      }

      if (isPl) {
        lastLow = target.low;
        lastLowTime = target.time;
        sslConsumed = false;
        sslBroken = false;
        sslLines.push({
          level: lastLow,
          time: lastLowTime,
          confirmedTime: c.time,
          consumed: false
        });
      }
    }

    // BSL / SSL Sweeps
    if (!bslConsumed && lastHigh != null && c.high > lastHigh && c.close < lastHigh) {
      bslConsumed = true;
      sweeps.push({ time: c.time, price: c.high, type: 'BSL_SWEEP', side: 'BUY', symbol: '×', color: '#ef4444' });
    }
    if (!sslConsumed && lastLow != null && c.low < lastLow && c.close > lastLow) {
      sslConsumed = true;
      sweeps.push({ time: c.time, price: c.low, type: 'SSL_SWEEP', side: 'SELL', symbol: '×', color: '#22c55e' });
    }

    // Market Structure Breaks: BOS and MSS
    const rawBreakBull = !bslBroken && lastHigh != null && c.close > lastHigh && (prev ? prev.close <= lastHigh : true);
    const rawBreakBear = !sslBroken && lastLow != null && c.close < lastLow && (prev ? prev.close >= lastLow : true);

    const mssBull = rawBreakBull && trend !== 'BULL';
    const mssBear = rawBreakBear && trend !== 'BEAR';
    const bosBull = rawBreakBull && trend === 'BULL';
    const bosBear = rawBreakBear && trend === 'BEAR';

    if (rawBreakBull) {
      trend = 'BULL';
      bslBroken = true;
      structureEvents.push({
        type: mssBull ? 'MSS' : 'BOS',
        side: 'BULL',
        level: lastHigh,
        startTime: lastHighTime,
        endTime: c.time,
        color: '#22c55e'
      });

      // Search back for Order Block (last opposite/down candle before break)
      let obFound = false;
      for (let offset = 1; offset <= obSearchBars && i - offset >= 0; offset++) {
        const candidate = safeCandles[i - offset];
        if (!obFound && candidate.close < candidate.open) {
          obFound = true;
          const top = obUseBody ? Math.max(candidate.open, candidate.close) : candidate.high;
          const bot = obUseBody ? Math.min(candidate.open, candidate.close) : candidate.low;
          obList.push({
            side: 'BUY',
            top,
            bot,
            ce: (top + bot) / 2,
            startTime: candidate.time,
            label: '+OB',
            color: '#3b82f6',
            mitigated: false
          });
        }
      }
    }

    if (rawBreakBear) {
      trend = 'BEAR';
      sslBroken = true;
      structureEvents.push({
        type: mssBear ? 'MSS' : 'BOS',
        side: 'BEAR',
        level: lastLow,
        startTime: lastLowTime,
        endTime: c.time,
        color: '#ef4444'
      });

      // Search back for Order Block (last opposite/up candle before break)
      let obFound = false;
      for (let offset = 1; offset <= obSearchBars && i - offset >= 0; offset++) {
        const candidate = safeCandles[i - offset];
        if (!obFound && candidate.close > candidate.open) {
          obFound = true;
          const top = obUseBody ? Math.max(candidate.open, candidate.close) : candidate.high;
          const bot = obUseBody ? Math.min(candidate.open, candidate.close) : candidate.low;
          obList.push({
            side: 'SELL',
            top,
            bot,
            ce: (top + bot) / 2,
            startTime: candidate.time,
            label: '-OB',
            color: '#ef4444',
            mitigated: false
          });
        }
      }
    }

    // Displacement and FVG check (at 3 consecutive candles: i-2, i-1, i)
    if (i >= 2) {
      const prev2 = safeCandles[i - 2];
      const prev1 = safeCandles[i - 1];

      const b = Math.abs(prev1.close - prev1.open);
      const bRange = Math.max(prev1.high - prev1.low, 0.01);
      const bRatio = b / bRange;
      const mBody = meanBodies[i - 1] || b;
      const compactBody = (prev1.high - Math.max(prev1.close, prev1.open) < b * 0.36) &&
                          (Math.min(prev1.close, prev1.open) - prev1.low < b * 0.36);

      const dispBull = prev1.close > prev1.open && b > mBody && compactBody && bRatio >= 0.45;
      const dispBear = prev1.close < prev1.open && b > mBody && compactBody && bRatio >= 0.45;

      if (dispBull && c.low > prev2.high) {
        fvgList.push({
          side: 'BUY',
          top: c.low,
          bot: prev2.high,
          ce: (c.low + prev2.high) / 2,
          startTime: prev2.time,
          color: '#22c55e',
          tested: false,
          mitigated: false
        });
      }

      if (dispBear && c.high < prev2.low) {
        fvgList.push({
          side: 'SELL',
          top: prev2.low,
          bot: c.high,
          ce: (prev2.low + c.high) / 2,
          startTime: prev2.time,
          color: '#ef4444',
          tested: false,
          mitigated: false
        });
      }
    }

    // Update FVG mitigation / tested state
    for (const fvg of fvgList) {
      if (fvg.mitigated || c.time <= fvg.startTime) continue;
      if (fvg.side === 'BUY') {
        if (c.low < fvg.top) fvg.tested = true;
        if (c.low <= fvg.bot) {
          fvg.mitigated = true;
          fvg.endTime = c.time;
        }
      } else {
        if (c.high > fvg.bot) fvg.tested = true;
        if (c.high >= fvg.top) {
          fvg.mitigated = true;
          fvg.endTime = c.time;
        }
      }
    }

    // Update OB mitigation
    for (const ob of obList) {
      if (ob.mitigated || c.time <= ob.startTime) continue;
      if (ob.side === 'BUY' && c.close < ob.bot) {
        ob.mitigated = true;
        ob.endTime = c.time;
      } else if (ob.side === 'SELL' && c.close > ob.top) {
        ob.mitigated = true;
        ob.endTime = c.time;
      }
    }
  }

  // Trend Invalidation line
  let trendInvalidation = null;
  let trendInvalidationText = '';
  let trendInvalidationColor = '#ef4444';
  let trendInvalidationTime = null;

  if (trend === 'BULL' && Number.isFinite(lastLow)) {
    trendInvalidation = lastLow;
    trendInvalidationText = `BULL INVALID < ${lastLow.toFixed(2)}`;
    trendInvalidationColor = '#ef4444';
    trendInvalidationTime = lastLowTime;
  } else if (trend === 'BEAR' && Number.isFinite(lastHigh)) {
    trendInvalidation = lastHigh;
    trendInvalidationText = `BEAR INVALID > ${lastHigh.toFixed(2)}`;
    trendInvalidationColor = '#f97316';
    trendInvalidationTime = lastHighTime;
  }

  return {
    keyLevels: {
      pdh,
      pdl,
      pdhConsumed,
      pdlConsumed,
      pwh,
      pwl,
      pwhConsumed,
      pwlConsumed,
      asiaHigh,
      asiaLow,
      asiaStart,
      asiaEnd,
      asiaHighConsumed,
      asiaLowConsumed,
      pdEq,
      pdHigh,
      pdLow,
      trendInvalidation,
      trendInvalidationText,
      trendInvalidationColor,
      trend
    },
    liquidity: {
      bsl: bslLines.slice(-options.liquidityHistory || -3),
      ssl: sslLines.slice(-options.liquidityHistory || -3),
      sweeps: sweeps.slice(-20)
    },
    structure: {
      events: structureEvents.slice(-options.structureHistory || -5),
      trend,
      invalidation: trendInvalidation ? {
        level: trendInvalidation,
        text: trendInvalidationText,
        color: trendInvalidationColor,
        time: trendInvalidationTime
      } : null
    },
    poi: {
      fvg: fvgList.filter(z => !z.mitigated).slice(-options.fvgVisible || -4),
      ob: obList.filter(z => !z.mitigated).slice(-options.obVisible || -4)
    }
  };
}
