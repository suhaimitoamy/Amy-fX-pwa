import { atr } from './math-structure.js';
import { setupObj } from './zones.js';

function findSweepBeforeMss(cs, sw, mss) {
  const bullish = mss.dir === 'BULLISH';
  const candidates = bullish
    ? sw.lows.filter(item => item.index < mss.index - 2)
    : sw.highs.filter(item => item.index < mss.index - 2);

  for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = candidates[candidateIndex];
    for (let index = mss.index - 1; index > candidate.index; index -= 1) {
      const candle = cs[index];
      const valid = bullish
        ? candle.low < candidate.low && candle.close > candidate.low
        : candle.high > candidate.high && candle.close < candidate.high;
      if (valid) {
        return bullish
          ? { type: 'SSL', level: candidate.low, extreme: candle.low, index }
          : { type: 'BSL', level: candidate.high, extreme: candle.high, index };
      }
    }
  }
  return null;
}

export function modelSweepMssFvg(cs, tf, ctx) {
  const mss = ctx.st?.lastConfirmedBreak;
  if (!mss?.valid || mss.failed || mss.breakType !== 'VALID_BREAK') return null;

  const sweep = findSweepBeforeMss(cs, ctx.sw, mss);
  if (!sweep || sweep.index >= mss.index) return null;

  const validFvg = (ctx.fvgs || []).find(zone =>
    zone.type === mss.dir
    && zone.index > mss.index
    && zone.status !== 'BROKEN'
    && zone.status !== 'MITIGATED'
    && (zone.qualityLabel === 'STRONG' || zone.qualityLabel === 'MEDIUM')
  );
  if (!validFvg) return null;

  const bullish = mss.dir === 'BULLISH';
  const currentAtr = Math.max(atr(cs), 0.1);
  const buffer = Math.max(currentAtr * 0.25, 0.2);
  const sl = bullish ? sweep.extreme - buffer : sweep.extreme + buffer;
  const tp1 = bullish ? Math.min(ctx.eq, ctx.bsl) : Math.max(ctx.eq, ctx.ssl);
  const externalTarget = ctx.liquidityHierarchy?.activeTargets?.find(item =>
    item.hierarchy === 'EXTERNAL' && item.type === (bullish ? 'BSL' : 'SSL')
  );
  const tp2 = externalTarget?.level || (bullish ? ctx.bsl : ctx.ssl);

  let score = 85;
  const htfAligned = ctx.htfNarrative?.htfBias === mss.dir;
  const htfConflict = ctx.htfNarrative?.htfBias !== 'NEUTRAL' && !htfAligned;
  if (htfAligned) score += 10;
  if (htfConflict) score -= 15;
  if (validFvg.qualityLabel === 'STRONG') score += 5;
  if (bullish && ctx.dealingRange?.currentZone === 'PREMIUM' && !htfAligned) score -= 15;
  if (!bullish && ctx.dealingRange?.currentZone === 'DISCOUNT' && !htfAligned) score -= 15;
  if (bullish && ctx.dealingRange?.currentZone === 'DISCOUNT') score += 5;
  if (!bullish && ctx.dealingRange?.currentZone === 'PREMIUM') score += 5;

  const direction = bullish ? 'BUY WATCH' : 'SELL WATCH';
  const reason = `Urutan valid: ${sweep.type} disapu pada candle ${sweep.index}, MSS ${mss.dir} terkonfirmasi pada candle ${mss.index}, lalu FVG ${validFvg.qualityLabel} terbentuk pada candle ${validFvg.index}.`;
  return setupObj(
    'SWEEP_MSS_FVG', direction, tf, score, ctx.price,
    validFvg.bottom, validFvg.top, sl, tp1, tp2, reason,
    {
      qualityLabel: validFvg.qualityLabel,
      qualityScore: validFvg.qualityScore,
      status: validFvg.status,
      components: {
        model: 'Sweep → MSS → FVG',
        sweep: sweep.type,
        sweepLevel: sweep.level,
        sweepIndex: sweep.index,
        mss: 'Valid',
        mssIndex: mss.index,
        fvgIndex: validFvg.index,
        entry: `FVG ${validFvg.qualityLabel}`,
        htf: htfAligned ? 'aligned' : htfConflict ? 'conflict' : 'neutral'
      }
    }
  );
}
