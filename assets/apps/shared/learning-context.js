/* Amy FX Learning Context Bridge — deterministic shared runtime. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AmyFXLearningContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const APP_ORIGIN = 'https://appassets.androidplatform.net';
  const ACADEMY_PREFIX = '/assets/apps/academy/';
  const DESTINATION_PATHS = Object.freeze({
    mapping: '/assets/apps/mapping/index.html',
    'market-intel': '/assets/apps/market-intel/index.html'
  });

  const STORAGE_KEYS = Object.freeze({
    context: 'amyfx.learning.context.v1',
    launch: 'amyfx.learning.launch.v1',
    draft: 'amyfx.learning.draft.v1'
  });

  const DEFAULTS = Object.freeze({
    maxAgeMs: 30 * 60 * 1000,
    resumeGraceMs: 6 * 60 * 60 * 1000,
    hardMaxAgeMs: 24 * 60 * 60 * 1000,
    wallClockSkewMs: 5 * 60 * 1000,
    returnFallbackDelayMs: 450
  });

  const DESTINATIONS = new Set(Object.keys(DESTINATION_PATHS));
  const LIFECYCLES = new Set(['ACTIVE', 'RETURNING', 'RETURNED', 'SUPERSEDED']);

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function positiveInteger(value, fallback) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function getStorage(kind, provided) {
    if (provided) return provided;
    try {
      return root && root[kind] ? root[kind] : null;
    } catch (_) {
      return null;
    }
  }

  function storageGet(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      return storage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function storageRemove(storage, key) {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    try {
      storage.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function randomToken(prefix) {
    const bytes = new Uint8Array(12);
    try {
      if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
        root.crypto.getRandomValues(bytes);
        return prefix + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) {}

    const fallback = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return prefix + fallback.slice(0, 24);
  }

  function readNativeElapsedMs() {
    try {
      if (root.Android && typeof root.Android.getElapsedRealtimeMs === 'function') {
        const value = finiteNumber(root.Android.getElapsedRealtimeMs());
        return value !== null && value >= 0 ? value : null;
      }
    } catch (_) {}
    return null;
  }

  function currentClocks(overrides) {
    const explicit = overrides || {};
    const wallNowMs = finiteNumber(explicit.wallNowMs);
    const elapsedNowMs = finiteNumber(explicit.elapsedNowMs);
    return {
      wallNowMs: wallNowMs !== null ? wallNowMs : Date.now(),
      elapsedNowMs: elapsedNowMs !== null ? elapsedNowMs : readNativeElapsedMs()
    };
  }

  function safeLocalPath(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.trim();
    if (/^(javascript|data|intent|file|http):/i.test(raw)) return null;
    if (raw.includes('\\') || raw.split('/').includes('..')) return null;

    try {
      const parsed = new URL(raw, APP_ORIGIN);
      if (parsed.origin !== APP_ORIGIN) return null;
      if (!parsed.pathname.startsWith(ACADEMY_PREFIX)) return null;
      if (parsed.pathname.split('/').includes('..')) return null;
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (_) {
      return null;
    }
  }

  function normalizeOwnership(value) {
    if (!value || typeof value !== 'object') return null;
    const contextId = typeof value.contextId === 'string' ? value.contextId : '';
    const revision = Number(value.revision);
    const launchNonce = typeof value.launchNonce === 'string' ? value.launchNonce : '';
    if (!contextId || !Number.isInteger(revision) || revision < 1 || !launchNonce) return null;
    return { contextId, revision, launchNonce };
  }

  function ownershipOf(context) {
    return normalizeOwnership(context);
  }

  function ownershipMatches(left, right) {
    const a = normalizeOwnership(left);
    const b = normalizeOwnership(right);
    return Boolean(a && b && a.contextId === b.contextId && a.revision === b.revision && a.launchNonce === b.launchNonce);
  }

  function readContext(options) {
    const localStorage = getStorage('localStorage', options && options.localStorage);
    const raw = storageGet(localStorage, STORAGE_KEYS.context);
    if (!raw) return null;
    return safeParse(raw, null);
  }

  function readLaunchSession(options) {
    const sessionStorage = getStorage('sessionStorage', options && options.sessionStorage);
    const raw = storageGet(sessionStorage, STORAGE_KEYS.launch);
    return raw ? safeParse(raw, null) : null;
  }

  function validateContext(context) {
    const errors = [];
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return { valid: false, errors: ['CONTEXT_NOT_OBJECT'] };
    }
    if (context.schemaVersion !== SCHEMA_VERSION) errors.push('UNSUPPORTED_SCHEMA');
    if (!ownershipOf(context)) errors.push('INVALID_OWNERSHIP');
    if (typeof context.lessonId !== 'string' || !context.lessonId.trim()) errors.push('INVALID_LESSON_ID');
    if (typeof context.lessonTitle !== 'string' || !context.lessonTitle.trim()) errors.push('INVALID_LESSON_TITLE');
    if (!DESTINATIONS.has(context.destination)) errors.push('INVALID_DESTINATION');
    if (context.mode !== 'practice') errors.push('INVALID_MODE');
    if (!LIFECYCLES.has(context.lifecycle)) errors.push('INVALID_LIFECYCLE');
    if (!safeLocalPath(context.returnPath)) errors.push('INVALID_RETURN_PATH');

    ['createdAtWallMs', 'expiresAtWallMs', 'maxAgeMs', 'resumeGraceMs', 'hardMaxAgeMs'].forEach(key => {
      if (finiteNumber(context[key]) === null || Number(context[key]) < 0) errors.push('INVALID_' + key.toUpperCase());
    });

    if (context.createdAtElapsedMs !== null && context.createdAtElapsedMs !== undefined) {
      if (finiteNumber(context.createdAtElapsedMs) === null || Number(context.createdAtElapsedMs) < 0) {
        errors.push('INVALID_CREATEDATELAPSEDMS');
      }
    }

    if (finiteNumber(context.maxAgeMs) !== null && finiteNumber(context.resumeGraceMs) !== null && context.resumeGraceMs < context.maxAgeMs) {
      errors.push('INVALID_RESUME_GRACE');
    }
    if (finiteNumber(context.resumeGraceMs) !== null && finiteNumber(context.hardMaxAgeMs) !== null && context.hardMaxAgeMs < context.resumeGraceMs) {
      errors.push('INVALID_HARD_MAX_AGE');
    }

    return { valid: errors.length === 0, errors };
  }

  function assertContextOwnership(expected, options) {
    const active = readContext(options);
    if (!active) return { ok: false, reason: 'CONTEXT_MISSING', active: null };
    const validation = validateContext(active);
    if (!validation.valid) return { ok: false, reason: 'CONTEXT_INVALID', active, errors: validation.errors };
    if (!ownershipMatches(active, expected)) return { ok: false, reason: 'CONTEXT_SUPERSEDED', active };
    return { ok: true, reason: null, active };
  }

  function clearUnownedDraft(activeContext, options) {
    const localStorage = getStorage('localStorage', options && options.localStorage);
    const raw = storageGet(localStorage, STORAGE_KEYS.draft);
    if (!raw) return false;
    const draft = safeParse(raw, null);
    if (!draft || !ownershipMatches(draft, activeContext)) {
      storageRemove(localStorage, STORAGE_KEYS.draft);
      return true;
    }
    return false;
  }

  function readOwnedDraft(expected, options) {
    const localStorage = getStorage('localStorage', options && options.localStorage);
    const raw = storageGet(localStorage, STORAGE_KEYS.draft);
    if (!raw) return null;
    const draft = safeParse(raw, null);
    if (!draft || !ownershipMatches(draft, expected)) {
      storageRemove(localStorage, STORAGE_KEYS.draft);
      return null;
    }
    return draft;
  }

  function supersedeCurrentContext(options) {
    const localStorage = getStorage('localStorage', options && options.localStorage);
    const active = readContext(options);
    if (!active) return null;
    const superseded = Object.assign({}, active, { lifecycle: 'SUPERSEDED' });
    storageSet(localStorage, STORAGE_KEYS.context, JSON.stringify(superseded));
    return superseded;
  }

  function createContext(input, options) {
    const source = input || {};
    const returnPath = safeLocalPath(source.returnPath);
    if (!returnPath) throw new TypeError('Learning context requires a safe Academy returnPath');
    if (!DESTINATIONS.has(source.destination)) throw new TypeError('Unsupported learning destination');
    if (typeof source.lessonId !== 'string' || !source.lessonId.trim()) throw new TypeError('lessonId is required');
    if (typeof source.lessonTitle !== 'string' || !source.lessonTitle.trim()) throw new TypeError('lessonTitle is required');

    const clocks = currentClocks(options && options.clocks);
    const previous = readContext(options);
    const previousRevision = previous && Number.isInteger(Number(previous.revision)) ? Number(previous.revision) : 0;
    const maxAgeMs = positiveInteger(source.maxAgeMs, DEFAULTS.maxAgeMs);
    const resumeGraceMs = Math.max(maxAgeMs, positiveInteger(source.resumeGraceMs, DEFAULTS.resumeGraceMs));
    const hardMaxAgeMs = Math.max(resumeGraceMs, positiveInteger(source.hardMaxAgeMs, DEFAULTS.hardMaxAgeMs));

    const context = {
      schemaVersion: SCHEMA_VERSION,
      contextId: randomToken('ctx_'),
      revision: previousRevision + 1,
      launchNonce: randomToken('nonce_'),
      supersedesContextId: previous && typeof previous.contextId === 'string' ? previous.contextId : null,
      lifecycle: 'ACTIVE',
      lessonId: source.lessonId.trim(),
      lessonTitle: source.lessonTitle.trim(),
      destination: source.destination,
      destinationTab: typeof source.destinationTab === 'string' ? source.destinationTab : null,
      timeframe: typeof source.timeframe === 'string' ? source.timeframe : null,
      mode: 'practice',
      returnPath,
      createdAtWallMs: clocks.wallNowMs,
      expiresAtWallMs: clocks.wallNowMs + maxAgeMs,
      createdAtElapsedMs: clocks.elapsedNowMs,
      maxAgeMs,
      resumeGraceMs,
      hardMaxAgeMs
    };

    const validation = validateContext(context);
    if (!validation.valid) throw new TypeError('Invalid learning context: ' + validation.errors.join(','));

    const localStorage = getStorage('localStorage', options && options.localStorage);
    const sessionStorage = getStorage('sessionStorage', options && options.sessionStorage);
    if (!storageSet(localStorage, STORAGE_KEYS.context, JSON.stringify(context))) {
      throw new Error('Learning context storage is unavailable');
    }

    clearUnownedDraft(context, options);
    storageSet(sessionStorage, STORAGE_KEYS.launch, JSON.stringify(ownershipOf(context)));
    return context;
  }

  function computeAge(context, clocks) {
    const elapsedCreated = finiteNumber(context.createdAtElapsedMs);
    const elapsedNow = finiteNumber(clocks.elapsedNowMs);
    if (elapsedCreated !== null && elapsedNow !== null) {
      if (elapsedNow < elapsedCreated) return { trusted: false, reason: 'MONOTONIC_RESET', ageMs: null };
      return { trusted: true, source: 'elapsed', reason: null, ageMs: elapsedNow - elapsedCreated };
    }

    const wallCreated = finiteNumber(context.createdAtWallMs);
    const wallNow = finiteNumber(clocks.wallNowMs);
    if (wallCreated === null || wallNow === null) return { trusted: false, reason: 'CLOCK_UNAVAILABLE', ageMs: null };
    if (wallNow + DEFAULTS.wallClockSkewMs < wallCreated) return { trusted: false, reason: 'WALL_CLOCK_BACKWARD', ageMs: null };
    return { trusted: true, source: 'wall', reason: null, ageMs: Math.max(0, wallNow - wallCreated) };
  }

  function resolveContextState(contextValue, options) {
    const context = contextValue === undefined ? readContext(options) : contextValue;
    if (!context) return { state: 'MISSING', context: null, reason: 'CONTEXT_MISSING' };

    const validation = validateContext(context);
    if (!validation.valid) return { state: 'INVALID', context, reason: 'CONTEXT_INVALID', errors: validation.errors };

    const expectedOwnership = options && options.ownership ? options.ownership : null;
    if (expectedOwnership && !ownershipMatches(context, expectedOwnership)) {
      return { state: 'SUPERSEDED', context, reason: 'CONTEXT_SUPERSEDED' };
    }
    if (context.lifecycle === 'SUPERSEDED' || context.lifecycle === 'RETURNED') {
      return { state: 'SUPERSEDED', context, reason: 'CONTEXT_' + context.lifecycle };
    }

    const clocks = currentClocks(options && options.clocks);
    const age = computeAge(context, clocks);
    const launch = options && Object.prototype.hasOwnProperty.call(options, 'launchSession')
      ? options.launchSession
      : readLaunchSession(options);

    if (!age.trusted) {
      return { state: 'RESUME_REQUIRED', context, reason: age.reason, ageMs: null };
    }
    if (age.ageMs > context.hardMaxAgeMs || age.ageMs > context.resumeGraceMs) {
      return { state: 'STALE', context, reason: 'CONTEXT_STALE', ageMs: age.ageMs, hardExpired: age.ageMs > context.hardMaxAgeMs };
    }
    if (!ownershipMatches(context, launch)) {
      return { state: 'RESUME_REQUIRED', context, reason: launch ? 'LAUNCH_OWNERSHIP_MISMATCH' : 'LAUNCH_SESSION_MISSING', ageMs: age.ageMs };
    }
    if (age.ageMs > context.maxAgeMs || clocks.wallNowMs > context.expiresAtWallMs + DEFAULTS.wallClockSkewMs) {
      return { state: 'RESUME_REQUIRED', context, reason: 'CONTEXT_EXPIRED', ageMs: age.ageMs };
    }
    return { state: 'ACTIVE', context, reason: null, ageMs: age.ageMs };
  }

  function replaceOwnedContext(expected, updater, options) {
    const ownership = assertContextOwnership(expected, options);
    if (!ownership.ok) return ownership;
    const next = updater(Object.assign({}, ownership.active));
    const validation = validateContext(next);
    if (!validation.valid) return { ok: false, reason: 'CONTEXT_INVALID', errors: validation.errors, active: ownership.active };
    const localStorage = getStorage('localStorage', options && options.localStorage);
    if (!storageSet(localStorage, STORAGE_KEYS.context, JSON.stringify(next))) {
      return { ok: false, reason: 'STORAGE_UNAVAILABLE', active: ownership.active };
    }
    return { ok: true, reason: null, active: next };
  }

  function touchContext(expected, options) {
    const clocks = currentClocks(options && options.clocks);
    return replaceOwnedContext(expected, context => {
      context.lastTouchedAtWallMs = clocks.wallNowMs;
      context.lastTouchedAtElapsedMs = clocks.elapsedNowMs;
      return context;
    }, options);
  }

  function markReturning(expected, options) {
    return replaceOwnedContext(expected, context => {
      context.lifecycle = 'RETURNING';
      return context;
    }, options);
  }

  function finalizeReturn(expected, options) {
    const result = replaceOwnedContext(expected, context => {
      context.lifecycle = 'RETURNED';
      return context;
    }, options);
    if (!result.ok) return result;
    clearContext(options);
    return result;
  }

  function clearContext(options) {
    const localStorage = getStorage('localStorage', options && options.localStorage);
    const sessionStorage = getStorage('sessionStorage', options && options.sessionStorage);
    storageRemove(localStorage, STORAGE_KEYS.context);
    storageRemove(localStorage, STORAGE_KEYS.draft);
    storageRemove(sessionStorage, STORAGE_KEYS.launch);
    return true;
  }

  function destinationUrl(context) {
    const path = context && DESTINATION_PATHS[context.destination];
    if (!path) return null;
    const query = new URLSearchParams({ learn: context.lessonId, contextId: context.contextId, mode: 'practice' });
    return APP_ORIGIN + path + '?' + query.toString();
  }

  function launchDestination(context, options) {
    const validation = validateContext(context);
    if (!validation.valid) return { ok: false, reason: 'CONTEXT_INVALID', errors: validation.errors };
    const locationObject = options && options.location ? options.location : root.location;
    if (!locationObject || typeof locationObject.assign !== 'function') return { ok: false, reason: 'NAVIGATION_UNAVAILABLE' };
    const url = destinationUrl(context);
    locationObject.assign(url);
    return { ok: true, url };
  }

  function returnToSource(expected, options) {
    const ownership = assertContextOwnership(expected, options);
    if (!ownership.ok) return ownership;
    const context = ownership.active;
    const returnPath = safeLocalPath(context.returnPath);
    if (!returnPath) return { ok: false, reason: 'INVALID_RETURN_PATH' };

    const historyObject = options && options.history ? options.history : root.history;
    const locationObject = options && options.location ? options.location : root.location;
    const scheduler = options && options.setTimeout ? options.setTimeout : root.setTimeout;
    const fallbackDelayMs = positiveInteger(options && options.fallbackDelayMs, DEFAULTS.returnFallbackDelayMs);
    markReturning(expected, options);

    if (historyObject && typeof historyObject.back === 'function') {
      let initialHref = null;
      try { initialHref = locationObject && locationObject.href; } catch (_) {}
      if (typeof scheduler === 'function' && locationObject && typeof locationObject.replace === 'function') {
        scheduler(function () {
          try {
            if (!initialHref || locationObject.href === initialHref) locationObject.replace(APP_ORIGIN + returnPath);
          } catch (_) {
            try { locationObject.replace(APP_ORIGIN + returnPath); } catch (_) {}
          }
        }, fallbackDelayMs);
      }
      historyObject.back();
      return { ok: true, method: 'history.back', returnPath };
    }

    if (locationObject && typeof locationObject.replace === 'function') {
      locationObject.replace(APP_ORIGIN + returnPath);
      return { ok: true, method: 'location.replace', returnPath };
    }
    return { ok: false, reason: 'NAVIGATION_UNAVAILABLE' };
  }

  function resolveSupersededState(expected, options) {
    const ownership = assertContextOwnership(expected, options);
    return ownership.ok
      ? { state: 'OWNED', context: ownership.active }
      : { state: ownership.reason === 'CONTEXT_SUPERSEDED' ? 'SUPERSEDED' : 'UNAVAILABLE', context: ownership.active || null, reason: ownership.reason };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    APP_ORIGIN,
    ACADEMY_PREFIX,
    STORAGE_KEYS,
    DEFAULTS,
    safeParse,
    safeLocalPath,
    currentClocks,
    readContext,
    readLaunchSession,
    validateContext,
    ownershipOf,
    ownershipMatches,
    assertContextOwnership,
    createContext,
    supersedeCurrentContext,
    resolveContextState,
    resolveSupersededState,
    touchContext,
    markReturning,
    finalizeReturn,
    clearContext,
    readOwnedDraft,
    clearUnownedDraft,
    destinationUrl,
    launchDestination,
    returnToSource
  });
});
