const MARKET_API_HOSTS = new Set([
  'amy-fx.vercel.app',
  'amy-fx-git-personal-amyfx-private-aplikasi-trading.vercel.app',
  'wliecyxzlwhmtftnfnps.supabase.co'
]);

function requestUrl(input) {
  try {
    return new URL(input instanceof Request ? input.url : String(input), globalThis.location?.href || 'https://appassets.androidplatform.net/');
  } catch (_) {
    return null;
  }
}

export function isMarketCandleRequest(input, init = {}) {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') return false;
  const url = requestUrl(input);
  if (!url || !MARKET_API_HOSTS.has(url.hostname)) return false;
  return url.pathname === '/api/twelvedata'
    || url.pathname === '/functions/v1/market-candles';
}

function candleTimestamp(value) {
  const numeric = Number(value?.time ?? value?.timestamp ?? value?.open_time);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 100_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  }
  const text = String(value?.datetime || '').trim();
  if (!text) return 0;
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(text)
    ? text
    : `${text.replace(' ', 'T')}Z`;
  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0;
}

function uniqueFallbackKey(value) {
  return JSON.stringify([
    value?.datetime,
    value?.open,
    value?.high,
    value?.low,
    value?.close
  ]);
}

export function sanitizeMarketPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.values)) return payload;

  const seen = new Set();
  const values = [];
  for (const rawValue of payload.values) {
    if (!rawValue || typeof rawValue !== 'object') continue;
    if (rawValue.amyfxSyntheticCurrent === true) continue;

    const timestamp = candleTimestamp(rawValue);
    const key = timestamp > 0 ? `time:${timestamp}` : `fallback:${uniqueFallbackKey(rawValue)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const value = { ...rawValue };
    delete value.amyfxSyntheticCurrent;
    values.push(value);
  }

  const next = { ...payload, values };
  if (next.clientCompatibility === 'CLOSED_SERIES_SENTINEL_V1') {
    delete next.clientCompatibility;
  }
  next.amyfxSanitizedClosedSeries = true;
  next.amyfxRemovedDuplicateCount = Math.max(0, payload.values.length - values.length);
  return next;
}

function responseHeaders(headers) {
  return [...headers.entries()].filter(([name]) => ![
    'content-encoding',
    'content-length',
    'transfer-encoding'
  ].includes(String(name).toLowerCase()));
}

export function installClosedCandleResponseSanitizer(target = globalThis.window) {
  if (!target?.fetch || target.__amyFxClosedCandleSanitizerInstalled) return false;
  target.__amyFxClosedCandleSanitizerInstalled = true;

  const delegatedFetch = target.fetch.bind(target);
  target.fetch = async function amyFxSanitizedFetch(input, init) {
    const response = await delegatedFetch(input, init);
    if (!isMarketCandleRequest(input, init) || !response?.ok) return response;

    try {
      const body = await response.clone().text();
      const payload = JSON.parse(body);
      const sanitized = sanitizeMarketPayload(payload);
      return new Response(JSON.stringify(sanitized), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders(response.headers)
      });
    } catch (_) {
      return response;
    }
  };

  target.AmyFXClosedCandleSanitizer = Object.freeze({
    version: '1.0.0',
    sanitizeMarketPayload,
    isMarketCandleRequest
  });
  return true;
}

if (typeof window !== 'undefined') {
  installClosedCandleResponseSanitizer(window);
}
