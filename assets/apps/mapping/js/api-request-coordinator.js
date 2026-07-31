(function () {
  'use strict';

  if (window.__amyFxRequestCoordinatorInstalled) return;
  window.__amyFxRequestCoordinatorInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const inFlight = new Map();
  const responseCache = new Map();
  const intervalSnapshots = new Map();
  const PRIVATE_MARKET_URL = 'https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/market-candles';
  const MARKET_API_HOSTS = new Set([
    'amy-fx.vercel.app',
    'amy-fx-git-personal-amyfx-private-aplikasi-trading.vercel.app',
    'wliecyxzlwhmtftnfnps.supabase.co'
  ]);
  const LIVE_TTL_MS = 90_000;
  const SHARED_M1_OUTPUT_SIZE = 300;

  function isMarketRequest(input, init) {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET') return false;
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const supportedPath = url.pathname === '/api/twelvedata'
        || url.pathname === '/functions/v1/market-candles';
      return MARKET_API_HOSTS.has(url.hostname) && supportedPath;
    } catch (_) {
      return false;
    }
  }

  function requestInfo(input) {
    const sourceUrl = new URL(input instanceof Request ? input.url : String(input), location.href);
    const interval = String(sourceUrl.searchParams.get('interval') || '1min').toLowerCase();
    const requestedOutputsize = Number(sourceUrl.searchParams.get('outputsize') || 0);
    const outputsize = interval === '1min'
      ? Math.max(requestedOutputsize || 1, SHARED_M1_OUTPUT_SIZE)
      : Math.max(requestedOutputsize || 300, 1);
    const symbol = String(sourceUrl.searchParams.get('symbol') || 'XAU/USD').toUpperCase();

    const url = new URL(PRIVATE_MARKET_URL);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', String(outputsize));

    return {
      key: url.toString(),
      fetchUrl: url.toString(),
      interval,
      outputsize,
      requestedOutputsize,
      symbol,
      snapshotKey: `${symbol}|${interval}`
    };
  }

  function ttlFor({ interval, requestedOutputsize }) {
    if (requestedOutputsize <= 2) return LIVE_TTL_MS;
    const ttl = {
      '1min': 55_000,
      '5min': 240_000,
      '15min': 600_000,
      '30min': 900_000,
      '45min': 1_200_000,
      '1h': 1_800_000,
      '2h': 3_600_000,
      '4h': 7_200_000,
      '1day': 14_400_000,
      '1week': 43_200_000
    };
    return ttl[interval] || 300_000;
  }

  function safeHeaders(headers) {
    return [...headers.entries()].filter(([name]) => ![
      'content-encoding',
      'content-length',
      'transfer-encoding'
    ].includes(String(name).toLowerCase()));
  }

  function normalizeClosedSeries(body) {
    try {
      const data = JSON.parse(body);
      if (data?.closedOnly !== true || !Array.isArray(data.values) || !data.values.length) return body;
      return JSON.stringify({
        ...data,
        values: [{ ...data.values[0], amyfxSyntheticCurrent: true }, ...data.values],
        clientCompatibility: 'CLOSED_SERIES_SENTINEL_V1'
      });
    } catch (_) {
      return body;
    }
  }

  function cloneStored(stored) {
    return new Response(stored.body, {
      status: stored.status,
      statusText: stored.statusText,
      headers: stored.headers
    });
  }

  function validSnapshot(info, now) {
    if (info.requestedOutputsize > 2) return null;
    const snapshot = intervalSnapshots.get(info.snapshotKey);
    if (!snapshot || snapshot.expiresAt <= now) return null;
    const values = Array.isArray(snapshot.data?.values) ? snapshot.data.values : [];
    return values.length ? snapshot : null;
  }

  function snapshotResponse(info, snapshot) {
    const values = snapshot.data.values;
    const requested = Math.max(1, info.requestedOutputsize || 1);
    return new Response(JSON.stringify({
      ...snapshot.data,
      values: values.slice(0, requested),
      source: snapshot.data.source || 'amyfx-shared-cache'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  function rememberSnapshot(info, body, now) {
    try {
      const data = JSON.parse(body);
      if (data?.status !== 'ok' || !Array.isArray(data.values) || !data.values.length) return;
      const previous = intervalSnapshots.get(info.snapshotKey);
      if (previous && previous.storedAt > now) return;
      intervalSnapshots.set(info.snapshotKey, {
        data,
        storedAt: now,
        expiresAt: now + LIVE_TTL_MS
      });
    } catch (_) {}
  }

  function cleanCache(now = Date.now()) {
    for (const [key, value] of responseCache.entries()) {
      if (value.expiresAt <= now) responseCache.delete(key);
    }
    for (const [key, value] of intervalSnapshots.entries()) {
      if (value.expiresAt <= now) intervalSnapshots.delete(key);
    }
    if (responseCache.size <= 30) return;
    [...responseCache.entries()]
      .sort((a, b) => a[1].storedAt - b[1].storedAt)
      .slice(0, responseCache.size - 20)
      .forEach(([key]) => responseCache.delete(key));
  }

  async function coordinatedFetch(input, init) {
    if (!isMarketRequest(input, init)) return nativeFetch(input, init);

    const info = requestInfo(input);
    const now = Date.now();
    cleanCache(now);

    const exactCached = responseCache.get(info.key);
    const sharedSnapshot = validSnapshot(info, now);
    if (sharedSnapshot && (!exactCached || sharedSnapshot.storedAt > exactCached.storedAt)) {
      return snapshotResponse(info, sharedSnapshot);
    }
    if (exactCached && exactCached.expiresAt > now) {
      return cloneStored(exactCached);
    }
    if (sharedSnapshot) return snapshotResponse(info, sharedSnapshot);

    const active = inFlight.get(info.key);
    if (active?.signal?.aborted) inFlight.delete(info.key);
    else if (active) {
      const stored = await active.promise;
      return cloneStored(stored);
    }

    const request = (async () => {
      const canonicalInput = input instanceof Request
        ? new Request(info.fetchUrl, input)
        : info.fetchUrl;
      const response = await nativeFetch(canonicalInput, init);
      const body = normalizeClosedSeries(await response.clone().text());
      const storedAt = Date.now();
      const stored = {
        body,
        status: response.status,
        statusText: response.statusText,
        headers: safeHeaders(response.headers),
        storedAt,
        expiresAt: storedAt + ttlFor(info)
      };
      if (response.ok) {
        responseCache.set(info.key, stored);
        rememberSnapshot(info, body, storedAt);
      }
      return stored;
    })();

    const entry = { promise: request, signal: init?.signal || null };
    inFlight.set(info.key, entry);
    try {
      const stored = await request;
      return cloneStored(stored);
    } finally {
      if (inFlight.get(info.key) === entry) inFlight.delete(info.key);
    }
  }

  window.fetch = coordinatedFetch;
  window.AmyFXRequestCoordinator = Object.freeze({
    privateMarketUrl: PRIVATE_MARKET_URL,
    clear() {
      responseCache.clear();
      intervalSnapshots.clear();
      inFlight.clear();
    },
    stats() {
      return {
        cached: responseCache.size,
        snapshots: intervalSnapshots.size,
        inFlight: inFlight.size
      };
    }
  });
})();
