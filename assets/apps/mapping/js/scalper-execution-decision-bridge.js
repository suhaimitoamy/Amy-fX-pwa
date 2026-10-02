const AUTHORITY = 'SCALPER_ENGINE_EXECUTION_AUTHORITY';

let lastFingerprint = '';

function syncExecutionDecision() {
  const result = window.state?.result || window.AmyFXMarketState?.result || null;
  const executionDecision = result?.executionDirectionDecision
    || result?.scalperExecutionAuthority?.directionDecision
    || null;
  if (!result || executionDecision?.source !== AUTHORITY) return false;

  const mappingDecision = result.directionDecision || result.mappingContextBeforeScalper?.directionDecision || null;
  const fingerprint = JSON.stringify({
    executionSignal: executionDecision.signal,
    executionStatus: executionDecision.status,
    executionInvalidated: executionDecision.invalidated,
    mappingSignal: mappingDecision?.signal,
    mappingSource: mappingDecision?.source,
    sourceCandleTime: result?.amySmcD?.sourceCandle?.time || 0
  });
  if (fingerprint === lastFingerprint) return false;

  result.mappingDirectionDecision = mappingDecision;
  result.executionDirectionDecision = executionDecision;
  result.mappingExecutionConsumer = {
    source: AUTHORITY,
    readOnly: true,
    mayOverrideMapping: false,
    mappingSource: mappingDecision?.source || 'AMY_SMC_D_NEXT_MOVE'
  };
  lastFingerprint = fingerprint;
  return true;
}

function scheduleSync() {
  queueMicrotask(syncExecutionDecision);
}

window.addEventListener('amyfx:execution-authority-updated', scheduleSync);
window.addEventListener('amyfx:scalper-state-change', scheduleSync);
window.addEventListener('amyfx:mapping-state-change', scheduleSync);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleSync();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
} else {
  scheduleSync();
}

export { syncExecutionDecision };
