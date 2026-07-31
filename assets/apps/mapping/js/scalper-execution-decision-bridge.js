const AUTHORITY = 'SCALPER_ENGINE_EXECUTION_AUTHORITY';

let lastFingerprint = '';

function syncExecutionDecision() {
  const result = window.state?.result || window.AmyFXMarketState?.result || null;
  const decision = result?.executionDirectionDecision || result?.scalperExecutionAuthority?.directionDecision || null;
  if (!result || decision?.source !== AUTHORITY) return false;

  const fingerprint = JSON.stringify({
    result,
    signal: decision.signal,
    status: decision.status,
    invalidated: decision.invalidated,
  }, (key, value) => key === 'result' ? undefined : value);
  if (lastFingerprint === fingerprint && result.directionDecision === decision) return false;

  if (!result.mappingDirectionDecision) {
    result.mappingDirectionDecision = result.mappingContextBeforeScalper?.directionDecision
      || result.directionDecision
      || null;
  }
  result.directionDecision = decision;
  lastFingerprint = fingerprint;
  return true;
}

function syncAndRender() {
  if (syncExecutionDecision()) window.render?.();
}

window.addEventListener('amyfx:execution-authority-updated', syncAndRender);
window.addEventListener('amyfx:scalper-state-change', () => setTimeout(syncAndRender, 20));
window.addEventListener('amyfx:mapping-state-change', () => setTimeout(syncAndRender, 40));
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAndRender(); });
setInterval(syncExecutionDecision, 1_500);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncAndRender, { once: true });
} else {
  syncAndRender();
}

export { syncExecutionDecision };
