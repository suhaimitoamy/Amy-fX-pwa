(function () {
  'use strict';

  if (window.__amyFxRequestCoordinatorInstalled) return;
  window.__amyFxRequestCoordinatorInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const inFlight = new Map();
  const responseCache = new Map();
  const intervalSnapshots = new Map();
  const retryAfter = new Map();
  const PRIVATE_MARKET_URL = 'https://wliecyxzlwhmtftnfnps.supabase.co/functions/v1/market-candles';
  const MARKET_API_HOSTS = new Set([
    'amy-fx.vercel.app',
    'amy-fx-git-personal-amyfx-private-aplikasi-trading.vercel.app',
    'wliecyxzlwhmtftnfnps.supabase.co'
  ]);
  const PERSISTENT_CACHE_KEY = 'amyfx_market_response_cache_v3';
  const PERSISTENT_CACHE_VERSION = 3;
  const PERSISTENT_CACHE_LIMIT = 16;
  const PERSISTENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
  const LIVE_TTL_MS = 90_000;
  const RETRY_COOLDOWN_MS = 60_000;
  const SHARED_M1_OUTPUT_SIZE = 300;
  const BACKGROUND_M1_REFRESH_SECONDS = 300;
  const CLOSE_GRACE_SECONDS = 10;
  const WEEK_SECONDS = 7 * 24 * 60 * 60;
  const MONDAY_UTC_ANCHOR_SECONDS = 4 * 24 * 60 * 60;

  const INTERVAL_SECONDS = Object.freeze({
    '1min': 60,
    '5min': 300,
    '15min': 900,
    '30min': 1_800,
    '45min': 2_700,
    '1h': 3_600,
    '2h': 7_200,
    '4h': 14_400,
    '1day': 86_400,
    '1week': WEEK_SECONDS
  });

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

  function activeMappingTf() {
    return String(window.state?.tf || 'M15').toUpperCase();
  }

  function refreshSecondsFor(info) {
    const seconds = INTERVAL_SECONDS[info.interval] || 300;
    if (info.interval !== '1min') return seconds;
    return activeMappingTf() === 'M1' ? seconds : BACKGROUND_M1_REFRESH_SECONDS;
  }

  function marketReferenceNowMs(nowMs = Date.now()) {
    const now = new Date(nowMs);
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const afterFridayClose = day === 5 && (hour > 22 || (hour === 22 && minute >= 0));
    const beforeSundayOpen = day === 0 && hour < 22;

    if (afterFridayClose) {
      return Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        22, 0, 0, 0
      );
    }

    if (day === 6 || beforeSundayOpen) {
      const daysBack = day === 6 ? 1 : 2;
      return Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysBack,
        22, 0, 0, 0
      );
    }

    return nowMs;
  }

  function expectedClosedOpenTime(info, nowMs = Date.now()) {
    const safeNow = Math.floor(marketReferenceNowMs(nowMs) / 1000) - CLOSE_GRACE_SECONDS;
    if (info.interval === '1week') {
      const currentWeekOpen = Math.floor(
        (safeNow - MONDAY_UTC_ANCHOR_SECONDS) / WEEK_SECONDS
      ) * WEEK_SECONDS + MONDAY_UTC_ANCHOR_SECONDS;
      return currentWeekOpen - WEEK_SECONDS;
    }
    const seconds = refreshSecondsFor(info);
    return Math.floor(safeNow / seconds) * seconds - seconds;
  }

  function parseUtcSeconds(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 100_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const text = String(value || '').trim();
    if (!text) return 0;
    const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(text)
      ? text
      : `${text.replace(' ', 'T')}Z`;
    const milliseconds = Date.parse(normalized);
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0;
  }

  function latestOpenTime(data) {
    const values = Array.isArray(data?.values) ? data.values : [];
    let latest = Number(data?.latestOpenTime || 0);
    for (const value of values) {
      latest = Math.max(latest, parseUtcSeconds(value?.datetime));
    }
    return latest;
  }

  function dataIsCurrent(data, info, now = Date.now()) {
    return latestOpenTime(data) >= expectedClosedOpenTime(info, now);
  }

  function parseStoredData(stored) {
    try {
      return JSON.parse(stored?.body || '');
    } catch (_) {
      return null;
    }
  }

  function storedIsCurrent(stored, info, now = Date.now()) {
    const data = parseStoredData(stored);
    return Boolean(data && dataIsCurrent(data, info, now));
  }

  function normalizeMarketBody(body, info, now = Date.now()) {
    try {
      let data = JSON.parse(body);
      if (data?.closedOnly === true && Array.isArray(data.values) && data.values.length) {
        const first = data.values[0];
        if (!first?.amyfxSyntheticCurrent) {
          data = {
            ...data,
            values: [{ ...first, amyfxSyntheticCurrent: true }, ...data.values],
            clientCompatibility: 'CLOSED_SERIES_SENTINEL_V1'
          };
        }
      }

      const source = String(data?.source || '');
      const cacheState = String(data?.amyfxCacheState || '');
      if (dataIsCurrent(data, info, now) && (/stale/i.test(source) || /stale/i.test(cacheState))) {
        data = {
          ...data,
          source: 'supabase-verified-current',
          amyfxCacheState: 'SUPABASE_VERIFIED_CURRENT',
          amyfxOriginalSource: source,
          amyfxOriginalCacheState: cacheState,
          amyfxProviderDegraded: true
        };
      }

      data.amyfxVerifiedLatestOpenTime = latestOpenTime(data);
      data.amyfxExpectedClosedOpenTime = expectedClosedOpenTime(info, now);
      return JSON.stringify(data);
    } catch (_) {
      return body;
    }
  }

  function normalizeClosedSeries(body, info, now = Date.now()) {
    return normalizeMarketBody(body, info, now);
  }

  function cloneStored(stored) {
    return new Response(stored.body, {
      status: stored.status,
      statusText: stored.statusText,
      headers: stored.headers
    });
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

  function persistentPayload() {
    return {
      version: PERSISTENT_CACHE_VERSION,
      entries: [...responseCache.entries()]
        .sort((a, b) => Number(b[1]?.storedAt || 0) - Number(a[1]?.storedAt || 0))
        .slice(0, PERSISTENT_CACHE_LIMIT)
        .map(([key, value]) => ({ key, value }))
    };
  }

  function persistResponseCache() {
    try {
      localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(persistentPayload()));
    } catch (_) {}
  }

  function restorePersistentCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSISTENT_CACHE_KEY) || '{}');
      if (parsed?.version !== PERSISTENT_CACHE_VERSION || !Array.isArray(parsed.entries)) return;
      const now = Date.now();
      for (const entry of parsed.entries) {
        const key = String(entry?.key || '');
        const stored = entry?.value;
        if (!key || !stored?.body || now - Number(stored.storedAt || 0) > PERSISTENT_RETENTION_MS) continue;
        responseCache.set(key, stored);
        try {
          const url = new URL(key);
          const info = requestInfo(url.toString());
          rememberSnapshot(info, stored.body, Number(stored.storedAt || now));
        } catch (_) {}
      }
    } catch (_) {}
  }

  function cleanCache(now = Date.now()) {
    for (const [key, value] of responseCache.entries()) {
      if (now - Number(value?.storedAt || 0) > PERSISTENT_RETENTION_MS) responseCache.delete(key);
    }
    for (const [key, value] of intervalSnapshots.entries()) {
      if (now - Number(value?.storedAt || 0) > PERSISTENT_RETENTION_MS) intervalSnapshots.delete(key);
    }
    if (responseCache.size > PERSISTENT_CACHE_LIMIT) {
      [...responseCache.entries()]
        .sort((a, b) => Number(a[1]?.storedAt || 0) - Number(b[1]?.storedAt || 0))
        .slice(0, responseCache.size - PERSISTENT_CACHE_LIMIT)
        .forEach(([key]) => responseCache.delete(key));
    }
  }

  function bestReusableCache(info, now = Date.now()) {
    const exact = responseCache.get(info.key);
    if (exact && storedIsCurrent(exact, info, now)) return exact;
    const snapshot = intervalSnapshots.get(info.snapshotKey);
    if (snapshot && dataIsCurrent(snapshot.data, info, now)) {
      const requested = Math.max(1, info.requestedOutputsize || info.outputsize || 1);
      return {
        body: JSON.stringify({ ...snapshot.data, values: snapshot.data.values.slice(0, requested) }),
        status: 200,
        statusText: 'OK',
        headers: [['content-type', 'application/json; charset=utf-8']],
        storedAt: snapshot.storedAt,
        expiresAt: snapshot.expiresAt
      };
    }
    return null;
  }

  function retryResponse(info) {
    return new Response(JSON.stringify({
      status: 'error',
      message: `Pembaruan candle ${info.interval} sedang dijadwalkan ulang agar kuota provider tetap aman.`
    }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  async function coordinatedFetch(input, init) {
    if (!isMarketRequest(input, init)) return nativeFetch(input, init);

    const info = requestInfo(input);
    const now = Date.now();
    cleanCache(now);

    const exactCached = responseCache.get(info.key);
    const sharedSnapshot = intervalSnapshots.get(info.snapshotKey);

    if (sharedSnapshot && dataIsCurrent(sharedSnapshot.data, info, now)
      && (!exactCached || sharedSnapshot.storedAt > exactCached.storedAt)) {
      return snapshotResponse(info, sharedSnapshot);
    }
    if (exactCached && (storedIsCurrent(exactCached, info, now) || exactCached.expiresAt > now)) {
      return cloneStored(exactCached);
    }
    if (sharedSnapshot && (dataIsCurrent(sharedSnapshot.data, info, now) || sharedSnapshot.expiresAt > now)) {
      return snapshotResponse(info, sharedSnapshot);
    }

    const blockedUntil = Number(retryAfter.get(info.key) || 0);
    if (blockedUntil > now) {
      const reusable = bestReusableCache(info, now);
      return reusable ? cloneStored(reusable) : retryResponse(info);
    }

    const active = inFlight.get(info.key);
    if (active?.signal?.aborted) inFlight.delete(info.key);
    else if (active) {
      const stored = await active.promise;
      return cloneStored(stored);
    }

    const request = (async () => {
      try {
        const canonicalInput = input instanceof Request
          ? new Request(info.fetchUrl, input)
          : info.fetchUrl;
        const response = await nativeFetch(canonicalInput, init);
        const rawBody = await response.clone().text();
        const body = normalizeClosedSeries(rawBody, info, Date.now());
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
          retryAfter.delete(info.key);
          persistResponseCache();
          return stored;
        }

        const reusable = bestReusableCache(info, storedAt);
        if (reusable) return reusable;
        retryAfter.set(info.key, storedAt + RETRY_COOLDOWN_MS);
        return stored;
      } catch (error) {
        const failedAt = Date.now();
        retryAfter.set(info.key, failedAt + RETRY_COOLDOWN_MS);
        const reusable = bestReusableCache(info, failedAt);
        if (reusable) return reusable;
        throw error;
      }
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

  restorePersistentCache();
  window.fetch = coordinatedFetch;
  window.AmyFXRequestCoordinator = Object.freeze({
    privateMarketUrl: PRIVATE_MARKET_URL,
    clear() {
      responseCache.clear();
      intervalSnapshots.clear();
      inFlight.clear();
      retryAfter.clear();
      try { localStorage.removeItem(PERSISTENT_CACHE_KEY); } catch (_) {}
    },
    stats() {
      return {
        cached: responseCache.size,
        snapshots: intervalSnapshots.size,
        inFlight: inFlight.size,
        retrying: retryAfter.size,
        persistent: true
      };
    }
  });
})();
