/* Amy FX Learning Progress — bounded, immutable attempt persistence. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AmyFXLearningProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const PROGRESS_KEY = 'amyfx.learning.progress.v1';
  const DRAFT_KEY = 'amyfx.learning.draft.v1';
  const DEFAULT_MAX_ATTEMPTS = 300;
  const DEFAULT_MAX_ATTEMPT_BYTES = 48 * 1024;

  function emptyProgress() {
    return {
      schemaVersion: SCHEMA_VERSION,
      attempts: [],
      lessonSummary: {},
      lastActivity: null
    };
  }

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getStorage(provided) {
    if (provided) return provided;
    try { return root && root.localStorage ? root.localStorage : null; } catch (_) { return null; }
  }

  function getItem(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try { return storage.getItem(key); } catch (_) { return null; }
  }

  function setItem(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try { storage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function removeItem(storage, key) {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    try { storage.removeItem(key); return true; } catch (_) { return false; }
  }

  function normalizeProgress(value) {
    if (!value || typeof value !== 'object' || value.schemaVersion !== SCHEMA_VERSION) return emptyProgress();
    return {
      schemaVersion: SCHEMA_VERSION,
      attempts: Array.isArray(value.attempts) ? value.attempts.filter(item => item && typeof item === 'object') : [],
      lessonSummary: value.lessonSummary && typeof value.lessonSummary === 'object' && !Array.isArray(value.lessonSummary) ? value.lessonSummary : {},
      lastActivity: value.lastActivity && typeof value.lastActivity === 'object' ? value.lastActivity : null
    };
  }

  function readProgress(options) {
    const storage = getStorage(options && options.localStorage);
    const raw = getItem(storage, PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = safeParse(raw, null);
    if (!parsed) {
      removeItem(storage, PROGRESS_KEY);
      return emptyProgress();
    }
    return normalizeProgress(parsed);
  }

  function writeProgress(progress, options) {
    const storage = getStorage(options && options.localStorage);
    const normalized = normalizeProgress(progress);
    return setItem(storage, PROGRESS_KEY, JSON.stringify(normalized));
  }

  function ownershipOf(value) {
    if (!value || typeof value !== 'object') return null;
    const revision = Number(value.revision);
    if (typeof value.contextId !== 'string' || !value.contextId || !Number.isInteger(revision) || revision < 1 || typeof value.launchNonce !== 'string' || !value.launchNonce) return null;
    return { contextId: value.contextId, revision, launchNonce: value.launchNonce };
  }

  function ownershipMatches(left, right) {
    const a = ownershipOf(left);
    const b = ownershipOf(right);
    return Boolean(a && b && a.contextId === b.contextId && a.revision === b.revision && a.launchNonce === b.launchNonce);
  }

  function containsForbiddenPayload(value, depth) {
    if (depth > 12 || value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.some(item => containsForbiddenPayload(item, depth + 1));
    if (typeof value !== 'object') return false;
    return Object.keys(value).some(key => {
      if (/^(candles|rawCandles|providerResponse|apiResponse|timeSeries)$/i.test(key)) return true;
      return containsForbiddenPayload(value[key], depth + 1);
    });
  }

  function projectedEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object') return null;
    return clone({
      schemaVersion: evidence.schemaVersion,
      evidenceId: evidence.evidenceId || null,
      capturedAt: evidence.capturedAt || null,
      source: evidence.source || null,
      symbol: evidence.symbol || null,
      timeframe: evidence.timeframe || null,
      freshness: evidence.freshness || null,
      facts: evidence.facts && typeof evidence.facts === 'object' ? evidence.facts : {},
      entities: evidence.entities && typeof evidence.entities === 'object' ? evidence.entities : {}
    });
  }

  function normalizeLockedAttempt(input, options) {
    if (!input || typeof input !== 'object') return { ok: false, reason: 'INVALID_ATTEMPT' };
    if (input.locked !== true) return { ok: false, reason: 'ATTEMPT_NOT_LOCKED' };
    if (typeof input.attemptId !== 'string' || !input.attemptId.trim()) return { ok: false, reason: 'INVALID_ATTEMPT_ID' };
    if (typeof input.lessonId !== 'string' || !input.lessonId.trim()) return { ok: false, reason: 'INVALID_LESSON_ID' };
    if (!input.evaluation || typeof input.evaluation !== 'object') return { ok: false, reason: 'INVALID_EVALUATION' };
    if (containsForbiddenPayload(input, 0)) return { ok: false, reason: 'FORBIDDEN_LARGE_PAYLOAD' };

    const lockedAt = Number(input.lockedAt || input.attemptedAt || Date.now());
    const attempt = {
      schemaVersion: SCHEMA_VERSION,
      attemptId: input.attemptId.trim(),
      locked: true,
      contextId: typeof input.contextId === 'string' ? input.contextId : null,
      revision: Number.isInteger(Number(input.revision)) ? Number(input.revision) : null,
      launchNonce: typeof input.launchNonce === 'string' ? input.launchNonce : null,
      lessonId: input.lessonId.trim(),
      lessonTitle: typeof input.lessonTitle === 'string' ? input.lessonTitle : null,
      template: typeof input.template === 'string' ? input.template : null,
      attemptedAt: Number.isFinite(Number(input.attemptedAt)) ? Number(input.attemptedAt) : lockedAt,
      lockedAt: Number.isFinite(lockedAt) ? lockedAt : 0,
      symbol: typeof input.symbol === 'string' ? input.symbol : null,
      timeframe: typeof input.timeframe === 'string' ? input.timeframe : null,
      session: typeof input.session === 'string' ? input.session : null,
      answer: clone(input.answer === undefined ? null : input.answer),
      evidence: projectedEvidence(input.evidence),
      evaluation: clone(input.evaluation)
    };

    const maxBytes = Number(options && options.maxAttemptBytes) > 0 ? Number(options.maxAttemptBytes) : DEFAULT_MAX_ATTEMPT_BYTES;
    if (JSON.stringify(attempt).length > maxBytes) return { ok: false, reason: 'ATTEMPT_TOO_LARGE' };
    return { ok: true, attempt };
  }

  function attemptTime(attempt) {
    const value = Number(attempt && (attempt.lockedAt || attempt.attemptedAt));
    return Number.isFinite(value) ? value : 0;
  }

  function pruneAttempts(attempts, maximum) {
    const limit = Number.isInteger(Number(maximum)) && Number(maximum) > 0 ? Number(maximum) : DEFAULT_MAX_ATTEMPTS;
    return (Array.isArray(attempts) ? attempts : [])
      .slice()
      .sort((left, right) => attemptTime(right) - attemptTime(left))
      .slice(0, limit);
  }

  function updateLessonSummary(summary, attempt) {
    const next = clone(summary && typeof summary === 'object' ? summary : {});
    const current = next[attempt.lessonId] && typeof next[attempt.lessonId] === 'object' ? next[attempt.lessonId] : {
      attemptCount: 0,
      correctCount: 0,
      reviewRequiredCount: 0,
      bestScore: null,
      lastStatus: null,
      lastAttemptAt: null
    };

    const status = attempt.evaluation && attempt.evaluation.status;
    const score = Number(attempt.evaluation && attempt.evaluation.score);
    current.attemptCount = Number(current.attemptCount || 0) + 1;
    if (status === 'CORRECT') current.correctCount = Number(current.correctCount || 0) + 1;
    if (status === 'REVIEW_REQUIRED') current.reviewRequiredCount = Number(current.reviewRequiredCount || 0) + 1;
    if (Number.isFinite(score)) current.bestScore = current.bestScore === null || current.bestScore === undefined ? score : Math.max(Number(current.bestScore), score);
    current.lastStatus = status || null;
    current.lastAttemptAt = attempt.lockedAt;
    next[attempt.lessonId] = current;
    return next;
  }

  function saveLockedAttempt(input, options) {
    const normalized = normalizeLockedAttempt(input, options);
    if (!normalized.ok) return normalized;

    const progress = readProgress(options);
    const existing = progress.attempts.find(item => item.attemptId === normalized.attempt.attemptId);
    if (existing) return { ok: true, duplicate: true, attempt: clone(existing), progress };

    const maximum = Number(options && options.maxAttempts) > 0 ? Number(options.maxAttempts) : DEFAULT_MAX_ATTEMPTS;
    progress.attempts = pruneAttempts(progress.attempts.concat([normalized.attempt]), maximum);
    progress.lessonSummary = updateLessonSummary(progress.lessonSummary, normalized.attempt);
    progress.lastActivity = {
      attemptId: normalized.attempt.attemptId,
      lessonId: normalized.attempt.lessonId,
      status: normalized.attempt.evaluation.status || null,
      at: normalized.attempt.lockedAt
    };

    if (!writeProgress(progress, options)) return { ok: false, reason: 'STORAGE_UNAVAILABLE' };
    return { ok: true, duplicate: false, attempt: clone(normalized.attempt), progress: clone(progress) };
  }

  function getAttempt(attemptId, options) {
    if (typeof attemptId !== 'string') return null;
    const found = readProgress(options).attempts.find(item => item.attemptId === attemptId);
    return found ? clone(found) : null;
  }

  function getLessonSummary(lessonId, options) {
    if (typeof lessonId !== 'string') return null;
    const summary = readProgress(options).lessonSummary[lessonId];
    return summary ? clone(summary) : null;
  }

  function saveDraft(draft, expectedOwnership, options) {
    if (!draft || typeof draft !== 'object') return { ok: false, reason: 'INVALID_DRAFT' };
    if (!ownershipMatches(draft, expectedOwnership)) return { ok: false, reason: 'CONTEXT_SUPERSEDED' };
    const storage = getStorage(options && options.localStorage);
    const payload = clone(Object.assign({}, draft, { locked: false, schemaVersion: SCHEMA_VERSION }));
    if (containsForbiddenPayload(payload, 0)) return { ok: false, reason: 'FORBIDDEN_LARGE_PAYLOAD' };
    if (!setItem(storage, DRAFT_KEY, JSON.stringify(payload))) return { ok: false, reason: 'STORAGE_UNAVAILABLE' };
    return { ok: true, draft: clone(payload) };
  }

  function readDraft(expectedOwnership, options) {
    const storage = getStorage(options && options.localStorage);
    const raw = getItem(storage, DRAFT_KEY);
    if (!raw) return null;
    const draft = safeParse(raw, null);
    if (!draft || draft.locked === true || draft.schemaVersion !== SCHEMA_VERSION || !ownershipMatches(draft, expectedOwnership)) {
      removeItem(storage, DRAFT_KEY);
      return null;
    }
    return clone(draft);
  }

  function clearDraft(expectedOwnership, options) {
    const storage = getStorage(options && options.localStorage);
    if (!expectedOwnership) return removeItem(storage, DRAFT_KEY);
    const draft = readDraft(expectedOwnership, options);
    if (!draft) return false;
    return removeItem(storage, DRAFT_KEY);
  }

  function clearProgress(options) {
    const storage = getStorage(options && options.localStorage);
    return removeItem(storage, PROGRESS_KEY);
  }

  return Object.freeze({
    SCHEMA_VERSION,
    PROGRESS_KEY,
    DRAFT_KEY,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPT_BYTES,
    emptyProgress,
    readProgress,
    writeProgress,
    normalizeLockedAttempt,
    pruneAttempts,
    saveLockedAttempt,
    getAttempt,
    getLessonSummary,
    saveDraft,
    readDraft,
    clearDraft,
    clearProgress
  });
});
