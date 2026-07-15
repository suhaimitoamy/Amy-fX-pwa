/**
 * Amy FX — Dynamic Liquidity Heatmap API
 *
 * Sumber: TwelveData M15 candle data.
 * Mesin: swing clustering adaptif, recency weighting, sweep/reclaim,
 * close-break lifecycle, polarity flip, dan active-zone selection.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { symbol = 'XAU/USD', interval = '15min', outputsize = '240' } = req.query;
    const apiKey = process.env.TWELVEDATA_API_KEY || req.query.apikey;

    if (symbol !== 'XAU/USD') {
      return res.status(403).json({ zones: [], error: 'symbol_not_allowed' });
    }
    if (!apiKey) {
      return res.status(400).json({ zones: [], error: 'api_key_required' });
    }

    const safeSize = Math.min(Math.max(parseInt(outputsize, 10) || 240, 80), 500);
    const candles = await fetchCandles(symbol, interval, safeSize, apiKey);
    if (!candles.length) {
      return res.status(200).json({
        symbol,
        interval,
        currentPrice: null,
        updated: new Date().toISOString(),
        sourceCandleTime: null,
        zones: [],
        summary: emptySummary(),
        meta: { candleCount: 0, accuracyProfile: 'BACKTEST_2022_2026' },
        error: 'no_data'
      });
    }

    const { computeDynamicHeatmap } = await import('../lib/heatmap-core.mjs');
    const result = computeDynamicHeatmap(candles, {
      swingWindow: 2,
      maxZonesPerSide: 6
    });
    const summary = precisionSummary(result);

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=20');
    return res.status(200).json({
      symbol,
      interval,
      currentPrice: result.currentPrice,
      updated: new Date().toISOString(),
      sourceCandleTime: result.meta?.sourceCandleTime || candles.at(-1)?.time || null,
      zones: result.zones,
      summary,
      meta: {
        ...result.meta,
        accuracyProfile: 'BACKTEST_2022_2026',
        nearestDrawRole: 'LIQUIDITY_TARGET_ONLY',
        primaryDistanceAtr: 1.5,
        secondaryDistanceAtr: 3
      }
    });
  } catch (error) {
    console.error('heatmap provider failed', error);
    return res.status(502).json({
      currentPrice: null,
      updated: new Date().toISOString(),
      zones: [],
      summary: emptySummary(),
      error: 'provider_failed'
    });
  }
}

function emptySummary() {
  return {
    pressure: 'WAITING DATA',
    liquidityConcentration: 'WAITING DATA',
    directionalSignal: 'NEUTRAL',
    directionalUse: false,
    nearestDraw: null,
    activeZones: 0,
    transitionZones: 0,
    interpretation: 'Heatmap belum memiliki data yang cukup.'
  };
}

function classifyDraw(draw, currentPrice, atr) {
  if (!draw || !Number.isFinite(Number(draw.price))) return null;
  const absoluteDistance = Math.abs(Number(draw.price) - Number(currentPrice));
  const distanceAtr = atr > 0 ? absoluteDistance / atr : null;
  const targetClass = distanceAtr === null
    ? 'CONTEXT_ONLY'
    : distanceAtr <= 1.5 ? 'PRIMARY' : distanceAtr <= 3 ? 'SECONDARY' : 'CONTEXT_ONLY';
  return {
    ...draw,
    absoluteDistance,
    distanceAtr,
    targetClass,
    actionableAsDirection: false,
    useAsLiquidityTarget: targetClass !== 'CONTEXT_ONLY'
  };
}

function precisionSummary(result) {
  const base = result?.summary || {};
  const currentPrice = Number(result?.currentPrice || 0);
  const atr = Number(result?.meta?.atr || 0);
  const concentration = base.pressure || 'BALANCED';
  return {
    ...base,
    pressure: concentration,
    liquidityConcentration: concentration,
    directionalSignal: 'NEUTRAL',
    directionalUse: false,
    nearestDraw: classifyDraw(base.nearestDraw, currentPrice, atr),
    nearestBsl: classifyDraw(base.nearestBsl, currentPrice, atr),
    nearestSsl: classifyDraw(base.nearestSsl, currentPrice, atr),
    interpretation: 'Pressure menunjukkan konsentrasi likuiditas, bukan prediksi arah market.'
  };
}

async function fetchCandles(symbol, interval, size, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${size}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TwelveData HTTP ${response.status}`);
  const data = await response.json();
  if (data?.status === 'error') throw new Error(data.message || 'TwelveData error');

  return (data.values || []).reverse().map(candle => ({
    time: candle.datetime,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close)
  }));
}
