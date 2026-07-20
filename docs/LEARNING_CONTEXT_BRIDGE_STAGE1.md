# Amy FX Learning Context Bridge — Stage 1 Contract

Status: locked foundation contract for LC-01 through LC-06.

This document defines the deterministic learning-context foundation shared by Tutorial Trading, Mapping, and Market Intel. Stage 1 does not activate any production lesson, does not call AI, and does not change trading or Mapping decisions.

## 1. Scope and non-goals

Stage 1 provides:

- one versioned learning-context schema;
- single-active-context lifecycle and ownership checks;
- safe return navigation metadata;
- normalized evidence schema;
- deterministic, generic evaluation templates;
- weighted scoring with a fixed critical-failure policy;
- immutable attempt persistence and bounded progress storage;
- a central, disabled-by-default lesson registry.

Stage 1 does not provide:

- AI evaluation or AI scoring;
- BUY/SELL generation;
- new market-data requests;
- lesson-specific JavaScript branches;
- activation of production lessons;
- Android version changes.

## 2. Storage keys

All keys are versioned and single-purpose.

| Key | Storage | Purpose |
| --- | --- | --- |
| `amyfx.learning.context.v1` | `localStorage` | Single active learning context |
| `amyfx.learning.launch.v1` | `sessionStorage` | Current page ownership tuple |
| `amyfx.learning.draft.v1` | `localStorage` | One draft owned by the active context |
| `amyfx.learning.progress.v1` | `localStorage` | Locked attempts, summaries, and last activity |

No context stack is permitted in schema version 1.

## 3. Single active context contract

Only one active context may exist. Creating a new context supersedes the previous context.

Ownership is the tuple:

```text
contextId + revision + launchNonce
```

Every mutating operation must verify all three values before it may:

- write a draft;
- lock an answer;
- save progress;
- change lifecycle state;
- mark return navigation.

A stale page whose tuple no longer matches the active context resolves to `SUPERSEDED` and must not overwrite the new context.

### 3.1 Context schema

```json
{
  "schemaVersion": 1,
  "contextId": "ctx_example",
  "revision": 1,
  "launchNonce": "nonce_example",
  "supersedesContextId": null,
  "lifecycle": "ACTIVE",
  "lessonId": "fixture-classification",
  "lessonTitle": "Fixture Classification",
  "destination": "mapping",
  "destinationTab": "Analyze",
  "timeframe": "M15",
  "mode": "practice",
  "returnPath": "/assets/apps/academy/fixtures/classification.html",
  "createdAtWallMs": 1784343600000,
  "expiresAtWallMs": 1784345400000,
  "createdAtElapsedMs": 843522000,
  "maxAgeMs": 1800000,
  "resumeGraceMs": 21600000,
  "hardMaxAgeMs": 86400000
}
```

Required enums:

- `destination`: `mapping`, `market-intel`
- `mode`: `practice`
- `lifecycle`: `ACTIVE`, `RETURNING`, `RETURNED`, `SUPERSEDED`

### 3.2 Supersession

When Context B is created while Context A exists:

- B receives a new `contextId` and `launchNonce`;
- B receives `revision = A.revision + 1`;
- B sets `supersedesContextId = A.contextId`;
- A is no longer writable;
- any draft owned by A is discarded;
- locked attempts from A remain in progress history.

The active-context record is written with one `localStorage.setItem()` operation.

## 4. Time and expiry contract

The preferred age source is Android `SystemClock.elapsedRealtime()` exposed to JavaScript. Wall-clock time is a fallback only.

Context resolution order:

1. Android elapsed realtime;
2. launch tuple in `sessionStorage`;
3. wall-clock timestamps;
4. safe fallback `RESUME_REQUIRED` when time cannot be trusted.

Resolution states:

| State | Meaning | Required behavior |
| --- | --- | --- |
| `ACTIVE` | Context and ownership tuple are valid and within `maxAgeMs` | Show learning UI |
| `RESUME_REQUIRED` | Context may be recoverable but time/session ownership is uncertain | Require explicit resume/restart/close action |
| `STALE` | Older than resume grace but not structurally invalid | Do not auto-activate; permit fresh restart |
| `INVALID` | Corrupt, unsupported, unsafe, or mismatched context | Clear it and open destination normally |
| `SUPERSEDED` | Page tuple does not own the current active context | Disable draft/evaluation writes |
| `MISSING` | No context exists | Open destination normally |

Safe defaults:

- `maxAgeMs`: 1,800,000 ms
- `resumeGraceMs`: 21,600,000 ms
- `hardMaxAgeMs`: 86,400,000 ms

A monotonic clock reset, such as after reboot, is detected when `elapsedNowMs < createdAtElapsedMs`. It resolves to `RESUME_REQUIRED`, not a crash.

If a locked attempt already contains its immutable evidence and evaluation snapshot, reopening it must display the stored result and must not re-evaluate against new market data.

## 5. Return-path and Android Back contract

Only local Academy paths are valid return targets.

A valid return path:

- begins with `/assets/apps/academy/`;
- is parsed against `https://appassets.androidplatform.net`;
- remains on that origin;
- contains no `..` segment;
- is not `javascript:`, `data:`, `intent:`, `http:`, or another external scheme.

Opening a destination uses normal history navigation. Returning uses:

1. `history.back()` when the page owns the launch tuple;
2. `location.replace(safeReturnUrl)` as a fallback.

The return action must never use `location.assign(returnUrl)` because that creates a Mapping–Lesson history loop. Native Android Back remains `webView.goBack()` and is not changed by Stage 1.

## 6. Evidence schema

Evidence Adapters normalize existing Mapping or Market Intel state. They do not fetch data and do not read a separate AI-specific source.

```json
{
  "schemaVersion": 1,
  "evidenceId": "ev_example",
  "capturedAt": 1784343600000,
  "source": "mapping",
  "symbol": "XAU/USD",
  "timeframe": "M15",
  "freshness": "LIVE",
  "facts": {
    "liquidity.primaryEvent": "TESTING_BSL",
    "liquidity.closeConfirmed": false
  },
  "entities": {
    "levels": [],
    "zones": [],
    "events": [],
    "news": []
  }
}
```

Required evidence enums:

- `source`: `mapping`, `market-intel`
- `freshness`: `LIVE`, `STALE`, `OFFLINE`, `UNKNOWN`

Unknown or missing facts are not silently invented. Missing required evidence produces an unscorable result.

## 7. Generic evaluation contract

Evaluation order is fixed:

```text
schema validation
→ gate evaluation
→ assertion evaluation
→ raw weighted score
→ critical cap
→ final status
```

### 7.1 Operators

Schema version 1 supports:

- `eq`
- `notEq`
- `oneOf`
- `exists`
- `notExists`
- `greaterThan`
- `greaterThanOrEqual`
- `lessThan`
- `lessThanOrEqual`
- `between`
- `withinTolerance`
- `allOf`
- `anyOf`
- `not`
- `ordered`
- `containsAll`

### 7.2 Templates

Schema version 1 supports:

- `classification.v1`
- `state-transition.v1`
- `location.v1`
- `sequence.v1`
- `numeric.v1`
- `checklist.v1`
- `decision.v1`
- `manual-review.v1`

No evaluator branch may depend on `lessonId`.

### 7.3 Gate behavior

A failed gate means the attempt cannot be scored. It returns:

```json
{
  "status": "UNSCORABLE",
  "score": null,
  "rawScore": null,
  "criticalFailure": false
}
```

A gate failure is not a wrong user answer.

### 7.4 Critical policy

The critical policy is global and cannot be overridden per lesson.

If one or more `critical: true` assertions fail:

- `status` is always `INCORRECT`;
- `score = min(rawScore, 49)`;
- `rawScore` remains available for diagnostics;
- `criticalFailure` is `true`.

There is no warning-only critical mode and no configurable critical cap in schema version 1.

Without a critical failure:

- `80–100`: `CORRECT`
- `50–79`: `PARTIAL`
- `0–49`: `INCORRECT`

### 7.5 Result schema

```json
{
  "schemaVersion": 1,
  "status": "PARTIAL",
  "score": 60,
  "rawScore": 60,
  "reasonCodes": ["CONFIRMATION_MISSING"],
  "passedAssertions": ["primary-class"],
  "failedAssertions": ["close-confirmation"],
  "criticalFailure": false,
  "reviewRequired": false
}
```

Status enum:

- `CORRECT`
- `PARTIAL`
- `INCORRECT`
- `UNSCORABLE`
- `DATA_UNAVAILABLE`
- `CONTEXT_STALE`
- `REVIEW_REQUIRED`

Reason-code baseline:

- `ANSWER_MATCH`
- `ANSWER_MISMATCH`
- `CONFIRMATION_MISSING`
- `EVIDENCE_MISSING`
- `DATA_STALE`
- `DATA_OFFLINE`
- `OUT_OF_TOLERANCE`
- `SEQUENCE_ERROR`
- `REQUIRED_CONDITION_MISSING`
- `FORBIDDEN_CONDITION_PRESENT`
- `RISK_LIMIT_BREACH`
- `MANUAL_REVIEW_REQUIRED`

`manual-review.v1` always returns `REVIEW_REQUIRED`, `score: null`, and `rawScore: null`.

## 8. Progress contract

Progress schema:

```json
{
  "schemaVersion": 1,
  "attempts": [],
  "lessonSummary": {},
  "lastActivity": null
}
```

Rules:

- locked attempts are immutable;
- drafts are stored separately from attempts;
- duplicate `attemptId` writes are idempotent;
- at most 300 newest attempts are retained;
- lesson summaries survive pruning;
- no full candle history or large provider payload is stored;
- corrupt storage falls back to an empty schema.

## 9. Registry contract

Registry path:

```text
app/src/main/assets/apps/academy/assets/data/market-learning-map.json
```

Registry root:

```json
{
  "schemaVersion": 1,
  "defaults": {
    "maxAgeMs": 1800000,
    "resumeGraceMs": 21600000,
    "hardMaxAgeMs": 86400000,
    "passScore": 80
  },
  "templates": {},
  "lessons": {}
}
```

Stage 1 registry requirements:

- all production lessons remain disabled;
- fixture entries may exist only with `enabled: false`;
- destination is limited to `mapping` or `market-intel`;
- timeframe is limited to `M1`, `M5`, `M15`, `M30`, `H1`, `H4`, `D1`, `W1`;
- auto-evaluated lessons require non-empty `requiredFacts`;
- invalid registry data must cause no CTA to appear;
- no lesson-specific JavaScript is permitted.

## 10. Offline fixture contract

Tests must never call Twelve Data, Gemini, or another network provider.

Reference timestamps:

- wall clock: `1784343600000`
- elapsed realtime: `843522000`

Required fixture groups:

```text
tests/fixtures/learning/
├── manifest.json
├── evidence/
├── contexts/
├── exercises/
├── answers/
└── progress/
```

Required evidence states include:

- Mapping LIVE neutral;
- Mapping LIVE testing BSL;
- Mapping LIVE confirmed sweep;
- Mapping LIVE liquidity run;
- Mapping LIVE confirmed/unconfirmed MSS;
- Mapping STALE;
- Mapping OFFLINE;
- Mapping missing evidence;
- Market Intel LIVE normal/high-risk news;
- Market Intel STALE;
- Market Intel empty news;
- invalid evidence schema.

Required context states include:

- active;
- resume required;
- stale;
- hard expired;
- clock-forward anomaly;
- clock-backward anomaly;
- reboot/monotonic reset;
- invalid return path;
- invalid schema;
- Context B superseding Context A.

Test clocks must be injected as explicit values. Core logic must not hide direct `Date.now()` calls inside deterministic evaluation or lifecycle decisions.

## 11. Stage 1 acceptance rules

LC-01 through LC-06 are acceptable only when:

- main remains unchanged;
- all changes are on `feature/learning-context-stage1`;
- Android version is not bumped;
- no production lesson is enabled;
- evaluator contains no AI call and no `lessonId` branch;
- critical failure always caps final score at 49;
- context storage remains a single active slot;
- unsafe return paths are rejected;
- corrupt storage degrades gracefully;
- offline tests can be added without altering the contracts above.
