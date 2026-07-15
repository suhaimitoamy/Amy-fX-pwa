const ALLOWED_INTERVALS = new Set([
  '1min', '5min', '15min', '30min', '1h', '4h', '1day', '1week'
]);
const MAX_OUTPUT_SIZE = 500;
const FETCH_TIMEOUT_MS = 12_000;

function normalizeUtcDatetime(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return `${text.replace(' ', 'T')}Z`;
  }
  return text;
}

function parseOutputSize(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(parsed, 1), MAX_OUTPUT_SIZE);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const { symbol = 'XAU/USD', interval, outputsize = '300' } = req.query;
  const targetKey = process.env.TWELVEDATA_API_KEY;

  if (symbol !== 'XAU/USD') {
    return res.status(403).json({ status: 'error', message: 'Hanya XAU/USD yang diizinkan' });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return res.status(400).json({ status: 'error', message: 'Interval tidak didukung' });
  }
  if (!targetKey) {
    return res.status(503).json({ status: 'error', message: 'Market service belum dikonfigurasi' });
  }

  const safeOutputSize = parseOutputSize(outputsize);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const fetchUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${safeOutputSize}&timezone=UTC&apikey=${encodeURIComponent(targetKey)}`;
    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      return res.status(502).json({ status: 'error', message: `TwelveData HTTP ${response.status}` });
    }

    const data = await response.json();
    if (data?.status === 'error') return res.status(502).json(data);

    if (Array.isArray(data?.values)) {
      data.values = data.values.map(item => ({
        ...item,
        datetime: normalizeUtcDatetime(item.datetime)
      }));
    }

    const cacheSeconds = interval === '1min' ? 5 : 15;
    res.setHeader('Cache-Control', `s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`);
    return res.status(200).json(data);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ status: 'error', message: 'Market service timeout' });
    }
    return res.status(502).json({ status: 'error', message: 'Market service unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}
