const CARD_ID = 'amy-entry-watch-card';

let lastSignature = '';

function readCanonical() {
  const state = window.state;
  const result = state?.result;
  if (!result) return null;
  const snapshot = result.mappingSnapshot;
  const scenario = snapshot?.scenario || result.entryMap?.scenario;
  const execution = snapshot?.execution || result.setupExecution;
  if (!scenario) return null;
  return { state, result, snapshot, scenario, execution };
}

function syncEntryWatch() {
  document.getElementById(CARD_ID)?.remove();

  const canonical = readCanonical();
  if (!canonical) {
    lastSignature = '';
    return;
  }

  const signature = JSON.stringify({
    tf: canonical.scenario.tf,
    direction: canonical.scenario.direction,
    status: canonical.scenario.status,
    missing: canonical.scenario.missing,
    setupId: canonical.execution?.setupId,
    stage: canonical.execution?.lifecycleStage
  });
  if (signature === lastSignature) return;
  lastSignature = signature;

  window.dispatchEvent(new CustomEvent('amyfx:entry-watch-updated', {
    detail: {
      watch: canonical.result.entryWatch,
      scenario: canonical.scenario,
      readOnly: true
    }
  }));
}

function start() {
  syncEntryWatch();
  window.addEventListener('amyfx:candles-updated', syncEntryWatch);
  window.addEventListener('amyfx:mapping-state-change', syncEntryWatch);
  window.addEventListener('amyfx:execution-authority-updated', syncEntryWatch);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncEntryWatch();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
