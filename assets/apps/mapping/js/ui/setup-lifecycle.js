const LABELS = [
  ['sweep', 'LIQUIDITY SWEEP'],
  ['mss', 'MSS / CHOCH'],
  ['entry', 'FVG / OB'],
  ['trigger', 'ENTRY'],
  ['target', 'TARGET']
];

export function lifecycleState(setupExecution) {
  const se = setupExecution?.setupExecution || setupExecution;
  const stage = String(se?.lifecycleStage || 'WAITING_ENTRY');
  
  let states = ['locked', 'locked', 'locked', 'locked', 'locked'];

  switch (stage) {
    case 'WAITING_ENTRY':
      states = ['confirmed', 'confirmed', 'active', 'locked', 'locked'];
      break;
    case 'ENTRY_ACTIVE':
      states = ['confirmed', 'confirmed', 'confirmed', 'active', 'locked'];
      break;
    case 'TP1_SECURED':
    case 'RUNNER_ACTIVE':
      states = ['confirmed', 'confirmed', 'confirmed', 'confirmed', 'active'];
      break;
    case 'TARGET_HIT':
      states = ['confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed'];
      break;
    case 'STOPPED':
      states = ['confirmed', 'confirmed', 'confirmed', 'invalid', 'invalid'];
      break;
    case 'MISSED_ENTRY':
      states = ['confirmed', 'confirmed', 'confirmed', 'invalid', 'invalid'];
      break;
    case 'EXPIRED':
    case 'DATA_STALE':
    case 'SETUP_REPLACED':
      states = ['confirmed', 'confirmed', 'confirmed', 'invalid', 'invalid'];
      break;
    case 'FORECAST_INVALIDATED':
      states = ['invalid', 'locked', 'locked', 'locked', 'locked'];
      break;
    case 'INVALID_GEOMETRY':
      states = ['confirmed', 'invalid', 'locked', 'locked', 'locked'];
      break;
    default:
      states = ['locked', 'locked', 'locked', 'locked', 'locked'];
      break;
  }

  return LABELS.map((item, index) => ({
    key: item[0],
    label: item[1],
    state: states[index]
  }));
}

export function renderSetupLifecycle(setupExecution) {
  const stages = lifecycleState(setupExecution);
  return `<div class="setup-lifecycle" data-setup-lifecycle>${stages.map(stage => `
    <div class="lifecycle-step ${stage.state}">
      <span>${stage.state === 'confirmed' ? '✓' : stage.state === 'invalid' ? '×' : stage.state === 'active' ? '●' : '○'}</span>
      <small>${stage.label}</small>
    </div>`).join('')}</div>`;
}
