import {
  buildLearningExample,
  buildMarketContext
} from '../lib/learning-live-engine.js';
import {
  classifyLearningTopic,
  normalizeTopic
} from '../lib/learning-topic-router.js';

const FETCH_TIMEOUT_MS = 12_000;
const MARKET_PROXY_URL = process.env.AMYFX_MARKET_PROXY_URL
  || 'https://amy-fx.vercel.app/api/twelvedata';
const INTERVAL_OUTPUT_SIZE = Object.freeze({
  '1min': 5,
  '15min': 120,
  '1h': 120,
  '1day': 30
});
const ALLOWED_CATEGORIES = new Set(['basics', 'structural', 'management']);

function normalizeUtcDatetime(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return `${text.replace(' ', 'T')}Z`;
  }
  return text;
}

function normalizeCandles(data) {
  return (Array.isArray(data?.values) ? data.values : [])
    .slice()
    .reverse()
    .map(item => ({
      time: Date.parse(normalizeUtcDatetime(item.datetime)) / 1000,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close)
    }))
    .filter(candle =>
      Number.isFinite(candle.time)
      && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      && candle.high >= Math.max(candle.open, candle.close, candle.low)
      && candle.low <= Math.min(candle.open, candle.close, candle.high)
    );
}

function providerUrl(interval, outputsize, apiKey) {
  const params = new URLSearchParams({
    symbol: 'XAU/USD',
    interval,
    outputsize: String(outputsize)
  });

  if (apiKey) {
    params.set('timezone', 'UTC');
    params.set('apikey', apiKey);
    return `https://api.twelvedata.com/time_series?${params}`;
  }
  return `${MARKET_PROXY_URL}?${params}`;
}

async function fetchSeries(interval, apiKey, signal) {
  const outputsize = INTERVAL_OUTPUT_SIZE[interval];
  if (!outputsize) throw new Error(`Interval ${interval} tidak didukung`);

  const response = await fetch(providerUrl(interval, outputsize, apiKey), {
    signal,
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Market provider HTTP ${response.status}`);

  const data = await response.json();
  if (data?.status === 'error') throw new Error(data.message || 'Market provider gagal');
  const candles = normalizeCandles(data);
  if (!candles.length) throw new Error(`Candle ${interval} kosong`);
  return candles;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const topic = normalizeTopic(req.query?.topic);
  const requestedCategory = normalizeTopic(req.query?.category || 'basics');
  const category = ALLOWED_CATEGORIES.has(requestedCategory) ? requestedCategory : 'basics';
  if (!topic || topic === 'index') {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter topic wajib dan harus spesifik'
    });
  }

  const route = classifyLearningTopic(topic, category);
  const apiKey = process.env.TWELVEDATA_API_KEY || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const entries = await Promise.all(
      route.intervals.map(async interval => [
        interval,
        await fetchSeries(interval, apiKey, controller.signal)
      ])
    );
    const marketContext = buildMarketContext(Object.fromEntries(entries), new Date());
    const payload = buildLearningExample(route, marketContext);

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');
    return res.status(200).json(payload);
  } catch (error) {
    const timeoutError = error?.name === 'AbortError';
    return res.status(timeoutError ? 504 : 502).json({
      status: 'error',
      topic,
      category,
      route: { group: route.group },
      message: timeoutError
        ? 'Learning market service timeout'
        : 'Learning market service unavailable'
    });
  } finally {
    clearTimeout(timeout);
  }
}
