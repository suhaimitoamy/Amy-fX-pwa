import {
  closedSourceCandles,
  inspectClosedCandleSource
} from './closed-candle-source-state.js';

export function analyzeTimeframeSafely({
  timeframe,
  candles,
  analyze,
  currentPrice = null,
  htfCandles = {},
  minimumCandles = 30,
  nowMs = Date.now()
}) {
  const values = closedSourceCandles(candles);
  const sourceState = inspectClosedCandleSource(timeframe, values, { nowMs });
  if (values.length < minimumCandles) {
    return {
      status: 'INSUFFICIENT_DATA',
      timeframe,
      candleCount: values.length,
      minimumCandles,
      sourceState,
      result: null,
      error: null
    };
  }
  try {
    const result = analyze(
      values,
      timeframe,
      {},
      currentPrice ?? values.at(-1)?.close,
      htfCandles
    );
    return {
      status: 'READY',
      timeframe,
      candleCount: values.length,
      minimumCandles,
      sourceState,
      result,
      error: null
    };
  } catch (error) {
    return {
      status: 'ANALYSIS_ERROR',
      timeframe,
      candleCount: values.length,
      minimumCandles,
      sourceState,
      result: null,
      error: error?.message || 'Analisis timeframe gagal.'
    };
  }
}

export function timeframeSourceSignature(timeframe, candles) {
  const values = closedSourceCandles(candles);
  const latest = values.at(-1);
  return JSON.stringify({
    timeframe,
    count: values.length,
    time: Number(latest?.time || 0),
    open: Number(latest?.open || 0),
    high: Number(latest?.high || 0),
    low: Number(latest?.low || 0),
    close: Number(latest?.close || 0)
  });
}
