import { clamp, numeric } from './market-math.js';

export const DEFAULT_REGIME_STATE = Object.freeze({
  activeRegime: 'TRANSITION',
  candidateRegime: 'TRANSITION',
  candidateBars: 0,
  activeSince: 0,
  lastCandleTime: 0,
  switches: 0
});

export function stabilizeRegime(raw, previous = DEFAULT_REGIME_STATE, {
  persistenceBars = 2,
  minimumLead = 7,
  emergencyShiftRisk = 72
} = {}) {
  const probabilities = raw?.probabilities || {};
  const rawRegime = String(raw?.regime || 'TRANSITION').toUpperCase();
  const candleTime = numeric(raw?.calculatedAt, 0);
  const prior = { ...DEFAULT_REGIME_STATE, ...(previous || {}) };
  const isFirstObservation = !previous || (!numeric(prior.lastCandleTime, 0) && !numeric(prior.activeSince, 0));
  const isNewCandle = candleTime > numeric(prior.lastCandleTime, 0);
  const sorted = Object.entries(probabilities).sort((a, b) => Number(b[1]) - Number(a[1]));
  const lead = Number(sorted[0]?.[1] || 0) - Number(sorted[1]?.[1] || 0);
  const emergency = Number(raw?.shift?.risk || 0) >= emergencyShiftRisk || raw?.shift?.confirmed;

  let candidateRegime = prior.candidateRegime;
  let candidateBars = prior.candidateBars;
  let activeRegime = isFirstObservation ? rawRegime : prior.activeRegime;
  let activeSince = isFirstObservation ? candleTime : prior.activeSince;
  let switches = prior.switches;

  if (rawRegime === activeRegime) {
    candidateRegime = rawRegime;
    candidateBars = 0;
  } else if (rawRegime !== candidateRegime) {
    candidateRegime = rawRegime;
    candidateBars = isNewCandle ? 1 : 0;
  } else if (isNewCandle) {
    candidateBars += 1;
  }

  const shouldSwitch = emergency
    ? rawRegime === 'TRANSITION' || raw?.shift?.confirmed
    : isNewCandle && candidateBars >= persistenceBars && lead >= minimumLead;

  if (shouldSwitch && activeRegime !== rawRegime) {
    activeRegime = emergency && raw?.shift?.confirmed ? 'TRANSITION' : rawRegime;
    activeSince = candleTime;
    candidateRegime = activeRegime;
    candidateBars = 0;
    switches += 1;
  }

  const transitionPenalty = activeRegime === rawRegime ? 0 : clamp((persistenceBars - candidateBars) / Math.max(1, persistenceBars), 0, 1);
  return {
    activeRegime,
    candidateRegime,
    candidateBars,
    activeSince,
    lastCandleTime: Math.max(numeric(prior.lastCandleTime, 0), candleTime),
    switches,
    rawRegime,
    rawLead: lead,
    transitionPenalty,
    stable: activeRegime === rawRegime,
    switchReason: shouldSwitch ? (emergency ? 'EMERGENCY_SHIFT' : 'PERSISTENCE_CONFIRMED') : 'HOLD'
  };
}
