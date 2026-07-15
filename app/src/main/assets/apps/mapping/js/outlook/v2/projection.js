import { atr } from '../../engine/ict-core.js';
import { OUTLOOK_HORIZONS, clamp, collectVotes, configuredHorizon, confirmedBreak, confirmedTrend, contextResult, detectMarketRegime, directionName, localAtr, newsSeverity, num, relevantFreshness, signOf } from './base.js';

function levelStrength(item) {
  let score = 0;
  if (item.hierarchy === 'EXTERNAL') score += 2.2;
  if (item.strength === 'STRONG') score += 1.6;
  if (item.source === 'EQUAL_HIGH' || item.source === 'EQUAL_LOW') score += 0.8;
  return score;
}

function collectLevels(analyses, config, price, atrValue) {
  const merged = [];
  const tolerance = Math.max(0.05, atrValue * 0.025);
  for (const tf of config.levelTfs) {
    const result = analyses?.[tf];
    const raw = result?.liquidityHierarchy?.activeTargets || result?.activeLiquidityTargets || [];
    for (const item of raw) {
      const level = num(item.level);
      if (!Number.isFinite(level) || level <= 0) continue;
      if (item.type === 'BSL' && level <= price) continue;
      if (item.type === 'SSL' && level >= price) continue;
      const candidate = { ...item, level, tf, distance: Math.abs(level - price) };
      const existing = merged.find(value => value.type === candidate.type && Math.abs(value.level - level) <= tolerance);
      if (!existing) merged.push(candidate);
      else if (levelStrength(candidate) > levelStrength(existing)) Object.assign(existing, candidate);
    }
  }
  return merged;
}

function targetScore(level, config, atrValue) {
  const tfPriority = Number(config.weights?.[level.tf] || 0);
  const distanceAtr = atrValue > 0 ? level.distance / atrValue : level.distance;
  const distancePreference = config.id === 'DAILY' ? -Math.min(distanceAtr, 20) * 0.04 : -Math.min(distanceAtr, 12) * 0.1;
  return levelStrength(level) + tfPriority * 4 + distancePreference;
}

function chooseTargets(direction, levels, config, atrValue) {
  const type = direction === 'BULLISH' ? 'BSL' : direction === 'BEARISH' ? 'SSL' : null;
  if (!type) {
    const upper = levels.filter(item => item.type === 'BSL').sort((a, b) => a.distance - b.distance)[0] || null;
    const lower = levels.filter(item => item.type === 'SSL').sort((a, b) => a.distance - b.distance)[0] || null;
    const ordered = [upper, lower].filter(Boolean).sort((a, b) => a.distance - b.distance);
    return { primary: ordered[0] || null, secondary: ordered[1] || null };
  }
  const sorted = levels
    .filter(item => item.type === type)
    .sort((a, b) => targetScore(b, config, atrValue) - targetScore(a, config, atrValue));
  const primary = sorted[0] || null;
  const secondary = sorted.find(item => !primary || Math.abs(item.level - primary.level) > Math.max(0.05, atrValue * 0.03)) || null;
  return { primary, secondary };
}

function chooseInvalidation(direction, levels, context, price, atrValue, config) {
  const minimumDistance = atrValue * (config.id === 'INTRADAY' ? 0.65 : config.id === 'SESSION' ? 0.9 : 1.15);
  if (direction === 'BULLISH' || direction === 'BEARISH') {
    const oppositeType = direction === 'BULLISH' ? 'SSL' : 'BSL';
    const candidates = levels
      .filter(item => item.type === oppositeType && Math.abs(item.level - price) >= minimumDistance)
      .sort((a, b) => targetScore(b, config, atrValue) - targetScore(a, config, atrValue));
    if (candidates[0]) return { value: candidates[0].level, source: `${candidates[0].tf}_${oppositeType}` };

    const range = context?.dealingRange || {};
    const structural = direction === 'BULLISH' ? num(range.low) : num(range.high);
    if (Number.isFinite(structural) && Math.abs(structural - price) >= minimumDistance * 0.6) {
      return { value: structural, source: 'DEALING_RANGE' };
    }
    return {
      value: direction === 'BULLISH' ? price - Math.max(minimumDistance, price * 0.001) : price + Math.max(minimumDistance, price * 0.001),
      source: 'ATR_FALLBACK'
    };
  }

  const lower = levels.filter(item => item.type === 'SSL').sort((a, b) => a.distance - b.distance)[0]?.level;
  const upper = levels.filter(item => item.type === 'BSL').sort((a, b) => a.distance - b.distance)[0]?.level;
  return {
    value: {
      lower: lower || price - Math.max(atrValue, price * 0.001),
      upper: upper || price + Math.max(atrValue, price * 0.001)
    },
    source: 'RANGE_BOUNDARIES'
  };
}

function normalizeProbabilities(raw) {
  const values = [Math.max(0.01, raw.primary), Math.max(0.01, raw.alternative), Math.max(0.01, raw.invalidation)];
  const total = values.reduce((sum, value) => sum + value, 0);
  let primary = values[0] / total * 100;
  let alternative = values[1] / total * 100;
  let invalidation = values[2] / total * 100;

  if (primary > 76) {
    const excess = primary - 76;
    primary = 76;
    const other = alternative + invalidation || 1;
    alternative += excess * alternative / other;
    invalidation += excess * invalidation / other;
  }
  if (primary < 40) {
    const needed = 40 - primary;
    const other = alternative + invalidation || 1;
    primary = 40;
    alternative = Math.max(0, alternative - needed * alternative / other);
    invalidation = Math.max(0, invalidation - needed * invalidation / other);
  }

  const roundedPrimary = Math.round(primary);
  const roundedAlternative = Math.round(alternative);
  const roundedInvalidation = Math.max(0, 100 - roundedPrimary - roundedAlternative);
  return { primary: roundedPrimary, alternative: roundedAlternative, invalidation: roundedInvalidation };
}

function scenarioProbabilities({ direction, votes, regime, newsRisk, freshnessInfo, location, primaryTarget, invalidationSource }) {
  const strength = Math.abs(votes.normalized);
  const disagreement = 1 - votes.consensus;
  const stretched = (direction === 'BULLISH' && location === 'PREMIUM')
    || (direction === 'BEARISH' && location === 'DISCOUNT');
  const news = newsSeverity(newsRisk);
  const dataRisk = freshnessInfo.stale * 0.8 + freshnessInfo.cache * 0.45;

  let primary = 1.4 + strength * 3 + votes.consensus * 1.2 + votes.coverage * 0.6;
  let alternative = 0.7 + (1 - strength) * 1.5 + disagreement * 1.1;
  let invalidation = 0.45 + disagreement * 0.8 + news * 1.1 + dataRisk;

  if (primaryTarget) primary += 0.35;
  else alternative += 0.45;
  if (invalidationSource && invalidationSource !== 'ATR_FALLBACK') primary += 0.25;
  else invalidation += 0.35;
  if (stretched) alternative += 1.05;
  if (regime.id === 'TRENDING') primary += 0.65;
  if (regime.id === 'RANGING') alternative += 0.95;
  if (regime.id === 'TRANSITION') { alternative += 0.7; invalidation += 0.45; }
  if (regime.id === 'HIGH_VOLATILITY') invalidation += 0.8;
  if (regime.id === 'NEWS_DRIVEN') invalidation += 1;
  if (regime.id === 'DATA_RISK') invalidation += 1;

  if (direction === 'RANGE') {
    primary = 1.8 + (1 - strength) * 2.4 + (regime.id === 'RANGING' ? 1.2 : 0);
    alternative = 0.9 + strength * 1.7 + (regime.id === 'TRANSITION' ? 0.6 : 0);
    invalidation = 0.55 + news * 1.1 + dataRisk + (regime.id === 'HIGH_VOLATILITY' ? 0.8 : 0);
  }
  return normalizeProbabilities({ primary, alternative, invalidation });
}

function locationOf(result) {
  return String(result?.dealingRange?.currentZone || result?.premiumDiscountZone || result?.zone || 'EQUILIBRIUM').toUpperCase();
}

function targetLabel(target) {
  return target ? `${target.type} ${target.level.toFixed(2)} (${target.tf})` : 'Belum ada target liquidity aktif';
}

function pathText(direction, price, context, primary, secondary) {
  const equilibrium = num(context?.dealingRange?.equilibrium);
  const parts = [`${price.toFixed(2)}`];
  if (direction === 'BULLISH') {
    if (Number.isFinite(equilibrium) && equilibrium > price && (!primary || equilibrium < primary.level)) parts.push(`EQ ${equilibrium.toFixed(2)}`);
    else if (locationOf(context) === 'PREMIUM') parts.push('pullback / konsolidasi');
  } else if (direction === 'BEARISH') {
    if (Number.isFinite(equilibrium) && equilibrium < price && (!primary || equilibrium > primary.level)) parts.push(`EQ ${equilibrium.toFixed(2)}`);
    else if (locationOf(context) === 'DISCOUNT') parts.push('retracement / konsolidasi');
  } else {
    const low = [primary, secondary].find(item => item?.type === 'SSL');
    const high = [primary, secondary].find(item => item?.type === 'BSL');
    return low && high ? `${low.level.toFixed(2)} ↔ ${high.level.toFixed(2)}` : `${price.toFixed(2)} → konsolidasi hingga struktur memilih sisi`;
  }
  if (primary) parts.push(targetLabel(primary));
  if (secondary) parts.push(targetLabel(secondary));
  return parts.join(' → ');
}

function scenarioText(direction, horizonLabel, target) {
  if (direction === 'BULLISH') return `Struktur pada horizon ${horizonLabel} lebih mendukung kenaikan menuju ${targetLabel(target)} selama invalidasi tidak ditembus.`;
  if (direction === 'BEARISH') return `Struktur pada horizon ${horizonLabel} lebih mendukung penurunan menuju ${targetLabel(target)} selama invalidasi tidak ditembus.`;
  return 'Struktur lintas timeframe belum memiliki dominasi arah; harga lebih mungkin bergerak di dalam range sampai muncul break valid.';
}

function alternativeText(direction, context, target) {
  const equilibrium = num(context?.dealingRange?.equilibrium);
  const eqText = Number.isFinite(equilibrium) ? `equilibrium ${equilibrium.toFixed(2)}` : 'area keseimbangan';
  if (direction === 'BULLISH') return `Alternatifnya, harga lebih dahulu pullback menuju ${eqText} sebelum kembali mencoba ${targetLabel(target)}.`;
  if (direction === 'BEARISH') return `Alternatifnya, harga lebih dahulu retracement menuju ${eqText} sebelum kembali mencoba ${targetLabel(target)}.`;
  return 'Alternatifnya, salah satu batas range ditembus dengan close valid dan market berubah menjadi trending.';
}

function invalidationText(direction, invalidation) {
  if (direction === 'BULLISH') return `Proyeksi bullish batal jika candle konteks menutup tegas di bawah ${num(invalidation).toFixed(2)}.`;
  if (direction === 'BEARISH') return `Proyeksi bearish batal jika candle konteks menutup tegas di atas ${num(invalidation).toFixed(2)}.`;
  return `Proyeksi range batal jika candle konteks menutup di luar ${num(invalidation?.lower).toFixed(2)}–${num(invalidation?.upper).toFixed(2)}.`;
}

function supportingFactors(direction, config, analyses, context, regime, primaryTarget, votes) {
  const desired = signOf(direction);
  const aligned = Object.entries(config.weights)
    .filter(([tf]) => confirmedTrend(analyses?.[tf]) === desired)
    .map(([tf]) => tf);
  const factors = [];
  if (aligned.length) factors.push(`${aligned.join(', ')} mendukung arah ${direction.toLowerCase()}.`);
  if (primaryTarget) factors.push(`${targetLabel(primaryTarget)} aktif dan sesuai horizon.`);
  const breakInfo = confirmedBreak(context);
  if (breakInfo && signOf(breakInfo.dir) === desired) factors.push(`Break struktur valid ${context.tf || config.contextTfs[0]} searah.`);
  if (votes.consensus >= 0.7) factors.push(`Konsensus timeframe ${(votes.consensus * 100).toFixed(0)}%.`);
  if (regime.id === 'TRENDING') factors.push('Regime market sedang trending.');
  return factors.slice(0, 4);
}

function riskFactors(direction, context, regime, newsRisk, freshnessInfo, votes) {
  const risks = [];
  const location = locationOf(context);
  if (direction === 'BEARISH' && location === 'DISCOUNT') risks.push('Harga sudah berada di discount; penurunan dapat didahului retracement.');
  if (direction === 'BULLISH' && location === 'PREMIUM') risks.push('Harga sudah berada di premium; kenaikan dapat didahului pullback.');
  if (votes.consensus < 0.65) risks.push('Konsensus lintas timeframe masih rendah.');
  if (regime.id === 'RANGING') risks.push('Regime ranging meningkatkan risiko false break.');
  if (regime.id === 'TRANSITION') risks.push('Market berada pada fase transisi atau reversal risk.');
  if (regime.id === 'HIGH_VOLATILITY') risks.push('Volatilitas tinggi memperbesar deviasi jalur harga.');
  if (String(newsRisk).toUpperCase() === 'HIGH') risks.push('Risiko berita tinggi dapat mengubah arah secara tiba-tiba.');
  else if (String(newsRisk).toUpperCase() === 'ELEVATED') risks.push('Risiko berita meningkat.');
  if (freshnessInfo.stale) risks.push(`${freshnessInfo.stale} timeframe horizon menggunakan candle stale.`);
  else if (freshnessInfo.cache) risks.push(`${freshnessInfo.cache} timeframe horizon belum terverifikasi penuh.`);
  return risks.slice(0, 4);
}

function horizonAtr(config, candlesByTf) {
  const tf = config.id === 'INTRADAY' ? 'M15' : config.id === 'SESSION' ? 'H1' : 'H4';
  return localAtr(candlesByTf?.[tf] || []) || atr(candlesByTf?.M15 || candlesByTf?.H1 || []) || 0;
}

function directionTolerance(config, price, atrValue) {
  if (config.id === 'INTRADAY') return Math.max(price * 0.0008, atrValue * 0.25, 0.5);
  if (config.id === 'SESSION') return Math.max(price * 0.001, atrValue * 0.3, 0.8);
  return Math.max(price * 0.0015, atrValue * 0.35, 1.2);
}

export function buildMarketOutlooks({
  result,
  analyses = {},
  candlesByTf = {},
  price,
  newsRisk = 'UNKNOWN',
  freshness = {},
  session = {},
  now = Date.now()
} = {}) {
  const currentPrice = num(price || result?.price);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { generatedAt: now, regime: { id: 'WAIT', label: 'WAITING DATA' }, outlooks: [], trackable: false };
  }

  const combinedAnalyses = { ...analyses };
  if (result?.tf && !combinedAnalyses[result.tf]) combinedAnalyses[result.tf] = result;
  const regime = detectMarketRegime({ analyses: combinedAnalyses, candlesByTf, newsRisk, freshness });

  const outlooks = OUTLOOK_HORIZONS.map(base => {
    const config = configuredHorizon(base, session, now);
    const context = contextResult(config, combinedAnalyses);
    const votes = collectVotes(combinedAnalyses, config.weights);
    const direction = directionName(votes.normalized);
    const atrValue = Math.max(horizonAtr(config, candlesByTf), currentPrice * 0.0003);
    const levels = collectLevels(combinedAnalyses, config, currentPrice, atrValue);
    const targets = chooseTargets(direction, levels, config, atrValue);
    const invalidationInfo = chooseInvalidation(direction, levels, context, currentPrice, atrValue, config);
    const freshnessInfo = relevantFreshness(freshness, Object.keys(config.weights));
    const probabilities = scenarioProbabilities({
      direction,
      votes,
      regime,
      newsRisk,
      freshnessInfo,
      location: locationOf(context),
      primaryTarget: targets.primary,
      invalidationSource: invalidationInfo.source
    });

    return {
      id: config.id,
      label: config.label,
      direction,
      probability: probabilities.primary,
      alternativeProbability: probabilities.alternative,
      invalidationProbability: probabilities.invalidation,
      horizonMs: config.horizonMs,
      expiresAt: now + config.horizonMs,
      startPrice: currentPrice,
      primaryTarget: targets.primary?.level || null,
      primaryTargetType: targets.primary?.type || null,
      primaryTargetTf: targets.primary?.tf || null,
      secondaryTarget: targets.secondary?.level || null,
      secondaryTargetType: targets.secondary?.type || null,
      secondaryTargetTf: targets.secondary?.tf || null,
      invalidation: invalidationInfo.value,
      invalidationSource: invalidationInfo.source,
      scenario: scenarioText(direction, config.label, targets.primary),
      alternativeScenario: alternativeText(direction, context, targets.primary),
      invalidationScenario: invalidationText(direction, invalidationInfo.value),
      path: pathText(direction, currentPrice, context, targets.primary, targets.secondary),
      factors: supportingFactors(direction, config, combinedAnalyses, context, regime, targets.primary, votes),
      risks: riskFactors(direction, context, regime, newsRisk, freshnessInfo, votes),
      modelScore: votes.normalized,
      consensus: votes.consensus,
      coverage: votes.coverage,
      regime: regime.label,
      location: locationOf(context),
      contextTf: context?.tf || config.contextTfs.find(tf => combinedAnalyses[tf]) || null,
      directionTolerance: directionTolerance(config, currentPrice, atrValue)
    };
  });

  const coreFreshness = ['M15', 'H1', 'H4'].map(tf => String(freshness?.[tf]?.state || 'CACHE'));
  const trackable = outlooks.length === 3
    && outlooks.every(item => item.contextTf)
    && coreFreshness.every(value => !value.includes('STALE') && !value.includes('CACHE'));

  return {
    generatedAt: now,
    price: currentPrice,
    regime,
    newsRisk,
    outlooks,
    trackable,
    disclaimer: 'Probabilitas membandingkan tiga skenario rule-based yang dihitung dari bukti berbeda; bukan jaminan atau akurasi historis.'
  };
}
