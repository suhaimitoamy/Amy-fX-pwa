import { atr, bodyRatio, p2 } from './math-structure.js';
import { setupObj } from './zones.js';
import { modelSweepMssFvg } from './setup-model.js';

function activeConfirmedBreak(ctx) {
  const item = ctx?.st?.lastConfirmedBreak || (ctx?.st?.last?.breakType === 'VALID_BREAK' ? ctx.st.last : null);
  return item?.valid && !item.failed && item.breakType === 'VALID_BREAK' ? item : null;
}

export function detectSetupConflicts(setup, ctx) {
  const conflicts = [];
  const bullish = String(setup.dir || '').includes('BUY');
  const htf = ctx.htfNarrative?.htfBias || 'NEUTRAL';
  if (bullish && htf === 'BEARISH') conflicts.push({ type: 'HTF_CONFLICT', level: 'HIGH', note: 'BUY setup melawan HTF bearish kuat' });
  if (!bullish && htf === 'BULLISH') conflicts.push({ type: 'HTF_CONFLICT', level: 'HIGH', note: 'SELL setup melawan HTF bullish kuat' });
  const zone = ctx.dealingRange?.currentZone;
  if (bullish && zone === 'PREMIUM') conflicts.push({ type: 'PD_CONFLICT', level: 'HIGH', note: 'BUY setup di Premium area' });
  if (!bullish && zone === 'DISCOUNT') conflicts.push({ type: 'PD_CONFLICT', level: 'HIGH', note: 'SELL setup di Discount area' });
  if (zone === 'EQUILIBRIUM') conflicts.push({ type: 'PD_CONFLICT', level: 'MEDIUM', note: 'Setup di Equilibrium area' });
  const drawTarget = ctx.liquidityHierarchy?.drawTarget;
  if (!drawTarget) conflicts.push({ type: 'LIQ_CONFLICT', level: 'MEDIUM', note: 'Tidak ada draw target aktif yang jelas' });
  else if ((bullish && drawTarget.type === 'SSL') || (!bullish && drawTarget.type === 'BSL')) conflicts.push({ type: 'LIQ_CONFLICT', level: 'HIGH', note: `Target berlawanan arah dengan draw utama (${drawTarget.type})` });
  const confirmed = activeConfirmedBreak(ctx);
  if (!confirmed) conflicts.push({ type: 'BREAK_CONFLICT', level: 'FATAL', note: 'MSS/CHOCH belum valid atau break sebelumnya sudah gagal' });
  else if (confirmed.atRisk || confirmed.liveStatus === 'AT_RISK') conflicts.push({ type: 'BREAK_CONFLICT', level: 'FATAL', note: 'Break sedang AT RISK karena harga live kembali melewati level struktur' });
  else if (confirmed.confirmationStage === 'TRANSITION' && setup.type !== 'SWEEP_MSS_FVG') conflicts.push({ type: 'BREAK_CONFLICT', level: 'FATAL', note: 'CHOCH masih internal; tunggu break protected swing atau model Sweep → MSS → FVG lengkap' });
  else if (confirmed.dir !== (bullish ? 'BULLISH' : 'BEARISH')) conflicts.push({ type: 'BREAK_CONFLICT', level: 'HIGH', note: 'Break struktur valid tidak searah setup' });
  const status = String(setup.status || '');
  if (status === 'BROKEN' || status === 'MITIGATED' || status.includes('INVALID')) conflicts.push({ type: 'ENTRY_CONFLICT', level: 'FATAL', note: 'Area entry sudah broken/mitigated' });
  else if (setup.qualityLabel === 'WEAK') conflicts.push({ type: 'ENTRY_CONFLICT', level: 'HIGH', note: 'Kualitas FVG/OB tergolong WEAK' });
  if (ctx.sessionContext?.session === 'OFF_SESSION') conflicts.push({ type: 'SESSION_CONFLICT', level: 'MEDIUM', note: 'Setup muncul di luar jam aktif market' });

  const plannedEntry = bullish ? Math.max(setup.entryLow, setup.entryHigh) : Math.min(setup.entryLow, setup.entryHigh);
  const risk = bullish ? plannedEntry - setup.sl : setup.sl - plannedEntry;
  const mainTarget = bullish ? Math.max(setup.tp1, setup.tp2) : Math.min(setup.tp1, setup.tp2);
  const reward = bullish ? mainTarget - plannedEntry : plannedEntry - mainTarget;
  const rr = risk > 0 ? reward / risk : NaN;
  if (risk <= 0 || !Number.isFinite(rr)) conflicts.push({ type: 'RR_CONFLICT', level: 'FATAL', note: 'SL/TP tidak valid atau tidak logis' });
  else if (rr < 2) conflicts.push({ type: 'RR_CONFLICT', level: 'FATAL', note: `Risk/Reward target utama ${rr.toFixed(2)} di bawah minimum 1:2` });
  const hasFatalConflict = conflicts.some(item => item.level === 'FATAL');
  const hasHighConflict = conflicts.some(item => item.level === 'HIGH');
  const hasMediumConflict = conflicts.some(item => item.level === 'MEDIUM');
  const conflictLevel = hasFatalConflict ? 'FATAL' : hasHighConflict ? 'HIGH' : hasMediumConflict ? 'MEDIUM' : conflicts.length ? 'LOW' : 'NONE';
  const recommendation = conflictLevel === 'FATAL' ? 'INVALID' : conflictLevel === 'HIGH' ? 'WAIT' : conflictLevel === 'MEDIUM' ? 'WATCH' : 'VALID';
  return { hasFatalConflict, conflictLevel, conflicts, recommendation, rr: Number.isFinite(rr) ? rr : 0, plannedEntry, mainTarget };
}

export function buildChecklistScore(setup, ctx) {
  const items = [];
  let score = 0;
  const bullish = String(setup.dir || '').includes('BUY');
  const desired = bullish ? 'BULLISH' : 'BEARISH';
  const htf = ctx.htfNarrative?.htfBias || 'NEUTRAL';
  if (htf === desired) { items.push({ name: 'HTF Bias Aligned', passed: true, score: 20, note: 'Setup searah HTF Narrative' }); score += 20; }
  else if (htf === 'NEUTRAL') { items.push({ name: 'HTF Bias Neutral', passed: true, score: 10, note: 'HTF netral, risiko moderat' }); score += 10; }
  else items.push({ name: 'HTF Bias Conflict', passed: false, score: 0, note: 'Setup berlawanan arus HTF' });
  if (setup.components?.sweep) { items.push({ name: 'Liquidity Swept', passed: true, score: 15, note: `Liquidity ${setup.components.sweep} telah disapu` }); score += 15; }
  else items.push({ name: 'No Liquidity Swept', passed: false, score: 0, note: 'Tidak ada sweep liquidity tegas' });
  const confirmed = activeConfirmedBreak(ctx);
  const validMss = setup.components?.mss === 'Valid' || confirmed?.dir === desired;
  if (validMss) { items.push({ name: 'Valid MSS', passed: true, score: 15, note: 'MSS/CHOCH terkonfirmasi body close' }); score += 15; }
  else items.push({ name: 'No Valid MSS', passed: false, score: 0, note: 'Break hanya wick, gagal, atau tidak ada' });
  if (confirmed?.hasDisplacement) { items.push({ name: 'Displacement', passed: true, score: 10, note: 'Didukung candle impulsif' }); score += 10; }
  else items.push({ name: 'No Displacement', passed: false, score: 0, note: 'Momentum kurang impulsif' });
  if (setup.qualityLabel === 'STRONG') { items.push({ name: 'Entry Quality', passed: true, score: 15, note: 'Area fresh dan kuat' }); score += 15; }
  else if (setup.qualityLabel === 'MEDIUM') { items.push({ name: 'Entry Quality', passed: true, score: 10, note: 'Area valid / tested ringan' }); score += 10; }
  else { items.push({ name: 'Entry Quality', passed: false, score: 5, note: 'Area lemah / berisiko jebol' }); score += 5; }
  const zone = ctx.dealingRange?.currentZone || 'EQUILIBRIUM';
  if ((bullish && zone === 'DISCOUNT') || (!bullish && zone === 'PREMIUM')) { items.push({ name: 'Pricing Zone', passed: true, score: 10, note: `Harga ideal di area ${zone}` }); score += 10; }
  else if (zone === 'EQUILIBRIUM') { items.push({ name: 'Pricing Zone', passed: true, score: 5, note: 'Harga dekat Equilibrium, butuh konfirmasi' }); score += 5; }
  else items.push({ name: 'Pricing Zone', passed: false, score: 0, note: `Posisi kurang ideal (${zone})` });
  if (setup.entryHigh > setup.entryLow && String(setup.status) !== 'BROKEN') { items.push({ name: 'Entry Area Clean', passed: true, score: 5, note: 'Area aktif dan jelas' }); score += 5; }
  else items.push({ name: 'Entry Area', passed: false, score: 0, note: 'Area rusak/invalid' });
  const rr = setup.conflictCheck?.rr || 0;
  if (rr >= 2) { items.push({ name: 'Risk Reward', passed: true, score: 15, note: 'Target profit masuk akal (RR >= 1:2)' }); score += 15; }
  else items.push({ name: 'Risk Reward', passed: false, score: 0, note: 'Ruang gerak sempit atau tidak logis (< 1:2)' });
  const session = ctx.sessionContext || {};
  if (['LONDON_KILLZONE', 'NEW_YORK_KILLZONE', 'SILVER_BULLET'].includes(session.killzone)) { items.push({ name: 'Session Quality', passed: true, score: 10, note: 'Setup berada di Killzone / Silver Bullet' }); score += 10; }
  else if (session.sessionQuality === 'NORMAL' || session.sessionQuality === 'ACTIVE') { items.push({ name: 'Session Quality', passed: true, score: 6, note: 'Sesi aktif di luar Killzone' }); score += 6; }
  else if (session.session === 'ASIA') { items.push({ name: 'Session Quality', passed: true, score: 3, note: 'Sesi Asia (Low Volume)' }); score += 3; }
  else items.push({ name: 'Session Quality', passed: false, score: 0, note: 'Off-Session / Dead Zone' });
  const conflict = setup.conflictCheck;
  if (conflict) {
    const conflictScore = conflict.conflictLevel === 'NONE' ? 10 : conflict.conflictLevel === 'LOW' ? 7 : conflict.conflictLevel === 'MEDIUM' ? 4 : 0;
    items.push({ name: 'Conflict Check', passed: ['NONE', 'LOW'].includes(conflict.conflictLevel), score: conflictScore, note: conflict.conflictLevel === 'NONE' ? 'Tidak ada konflik mayor' : conflict.conflicts.map(item => item.note).join('; ') });
    score += conflictScore;
  }
  let grade = score >= 85 ? 'A+' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'WAIT';
  if (conflict?.conflictLevel === 'FATAL') { score = Math.min(score, 44); grade = 'WAIT'; }
  else if (conflict?.conflictLevel === 'HIGH') { score = Math.min(score, 59); grade = 'C'; }
  else if (conflict?.conflictLevel === 'MEDIUM') { score = Math.min(score, 74); if (grade === 'A+' || grade === 'A') grade = 'B'; }
  if (!setup.components?.sweep && grade === 'A+') grade = 'A';
  if (conflict?.hasFatalConflict || htf === (bullish ? 'BEARISH' : 'BULLISH')) grade = 'WAIT';
  return { total: Math.min(100, score), max: 100, grade, items };
}

export function assignChecklist(setup, ctx) {
  const checklist = buildChecklistScore(setup, ctx);
  setup.score = checklist.total;
  setup.grade = checklist.grade;
  setup.scoreChecklist = checklist.items;
  setup.sessionContext = ctx.sessionContext;
  const sessionQuality = ctx.sessionContext?.sessionQuality || 'LOW';
  if (checklist.grade === 'WAIT') setup.status = 'WAIT';
  else if (checklist.grade === 'A+' || checklist.grade === 'A') setup.status = sessionQuality === 'LOW' && checklist.total < 90 ? 'WATCH SETUP' : 'READY SETUP';
  else if (checklist.grade === 'B') setup.status = sessionQuality === 'LOW' ? 'WAIT' : 'WATCH SETUP';
  else setup.status = 'WAIT';
  const conflict = setup.conflictCheck;
  if (conflict?.recommendation === 'INVALID' || conflict?.hasFatalConflict) setup.status = 'INVALID';
  else if (conflict?.recommendation === 'WAIT') setup.status = 'WAIT';
  else if (conflict?.recommendation === 'WATCH' && setup.status === 'READY SETUP') setup.status = 'WATCH SETUP';
  const bullish = String(setup.dir || '').includes('BUY');
  const plannedEntry = conflict?.plannedEntry ?? (bullish ? Math.max(setup.entryLow, setup.entryHigh) : Math.min(setup.entryLow, setup.entryHigh));
  const risk = bullish ? plannedEntry - setup.sl : setup.sl - plannedEntry;
  if (risk <= 0 || !Number.isFinite(conflict?.rr) || conflict.rr < 2) setup.status = 'INVALID';
  if (setup.status === 'INVALID') setup.grade = 'WAIT';
  const contextOnly = ['STRUCTURE SETUP', 'DISPLACEMENT CANDLE', 'LIQUIDITY SWEEP'].includes(setup.type);
  if (contextOnly && setup.status !== 'INVALID') {
    setup.status = 'WAIT';
    setup.executionMode = 'CONTEXT_ONLY';
    setup.contextNote = 'Sinyal konteks saja belum cukup sebagai trigger entry.';
  } else if (setup.tf !== 'M15' && setup.status !== 'INVALID') {
    setup.status = 'WAIT';
    setup.executionMode = 'CONTEXT_ONLY';
  } else if (setup.status !== 'INVALID' && setup.tf === 'M15') {
    const secureTarget = bullish ? plannedEntry + risk : plannedEntry - risk;
    const mainTarget = conflict?.mainTarget ?? (bullish ? Math.max(setup.tp1, setup.tp2) : Math.min(setup.tp1, setup.tp2));
    setup.originalTp1 = setup.tp1;
    setup.originalTp2 = setup.tp2;
    setup.tp1 = secureTarget;
    setup.tp2 = mainTarget;
    setup.executionMode = 'M15_PRECISION';
    setup.tradeManagement = { tp1R: 1, tp1ClosePercent: 90, moveStopToBreakEven: true, tp2MinimumR: 2, runnerPercent: 10 };
  }
  return setup;
}

export function buildSetups(candles, tf, ctx) {
  const output = [];
  const currentAtr = Math.max(atr(candles), 0.1);
  const price = ctx.price;
  const buffer = Math.max(currentAtr * 0.25, 0.2);
  const model = modelSweepMssFvg(candles, tf, ctx);
  if (model) output.push(model);
  if (ctx.nearOb) {
    const zone = ctx.nearOb;
    const bullish = zone.type === 'BULLISH';
    const direction = bullish ? 'BUY WATCH' : 'SELL WATCH';
    const sl = bullish ? zone.bottom - buffer : zone.top + buffer;
    const tp1 = bullish ? Math.max(ctx.eq, ctx.bsl) : Math.min(ctx.eq, ctx.ssl);
    const tp2 = bullish ? ctx.bsl : ctx.ssl;
    let setupScore = 68 + (ctx.final === (bullish ? 'BULLISH' : 'BEARISH') ? 8 : 0);
    if (zone.qualityLabel === 'STRONG') setupScore += 10;
    if (zone.qualityLabel === 'WEAK') setupScore -= 15;
    output.push(setupObj('ORDER BLOCK', direction, tf, setupScore, price, zone.bottom, zone.top, sl, tp1, tp2, zone.reason, { qualityLabel: zone.qualityLabel, status: zone.status }));
  }
  if (ctx.nearFvg) {
    const zone = ctx.nearFvg;
    const bullish = zone.type === 'BULLISH';
    const direction = bullish ? 'BUY WATCH' : 'SELL WATCH';
    const sl = bullish ? zone.bottom - buffer : zone.top + buffer;
    const tp1 = bullish ? Math.max(ctx.eq, ctx.bsl) : Math.min(ctx.eq, ctx.ssl);
    const tp2 = bullish ? ctx.bsl : ctx.ssl;
    let setupScore = 66 + (ctx.final === (bullish ? 'BULLISH' : 'BEARISH') ? 8 : 0);
    if (zone.qualityLabel === 'STRONG') setupScore += 10;
    if (zone.qualityLabel === 'WEAK') setupScore -= 15;
    output.push(setupObj('FAIR VALUE GAP', direction, tf, setupScore, price, zone.bottom, zone.top, sl, tp1, tp2, zone.reason, { qualityLabel: zone.qualityLabel, status: zone.status, ce: zone.mid }));
  }
  const lastCandle = candles.at(-1);
  const previousHigh = [...ctx.sw.highs].reverse().find(item => item.index < candles.length - 2);
  const previousLow = [...ctx.sw.lows].reverse().find(item => item.index < candles.length - 2);
  if (previousLow && lastCandle.low < previousLow.low && lastCandle.close > previousLow.low) {
    output.push(setupObj('LIQUIDITY SWEEP', 'BUY WATCH', tf, 78, price, previousLow.low, Math.max(lastCandle.close, previousLow.low + buffer), lastCandle.low - buffer, price + (price - (lastCandle.low - buffer)), ctx.bsl, `SSL ${p2(previousLow.low)} disapu lalu candle close kembali di atas level.`, { components: { sweep: 'SSL', sweepLevel: previousLow.low } }));
  }
  if (previousHigh && lastCandle.high > previousHigh.high && lastCandle.close < previousHigh.high) {
    output.push(setupObj('LIQUIDITY SWEEP', 'SELL WATCH', tf, 78, price, Math.min(lastCandle.close, previousHigh.high - buffer), previousHigh.high, lastCandle.high + buffer, price - ((lastCandle.high + buffer) - price), ctx.ssl, `BSL ${p2(previousHigh.high)} disapu lalu candle close kembali di bawah level.`, { components: { sweep: 'BSL', sweepLevel: previousHigh.high } }));
  }
  const confirmed = activeConfirmedBreak(ctx);
  if (confirmed) {
    const bullish = confirmed.dir === 'BULLISH';
    output.push(setupObj('STRUCTURE SETUP', bullish ? 'BUY WATCH' : 'SELL WATCH', tf, confirmed.kind === 'CHOCH' ? 76 : 72, price, bullish ? confirmed.price - buffer : confirmed.price, bullish ? confirmed.price : confirmed.price + buffer, bullish ? ctx.low - buffer : ctx.high + buffer, bullish ? Math.max(ctx.eq, ctx.bsl) : Math.min(ctx.eq, ctx.ssl), bullish ? ctx.bsl : ctx.ssl, `${confirmed.kind} ${confirmed.dir} terkonfirmasi di level ${p2(confirmed.price)}.`));
  }
  const body = Math.abs(lastCandle.close - lastCandle.open);
  if (body >= currentAtr * 1.5 && bodyRatio(lastCandle) >= 0.6) {
    const bullish = lastCandle.close > lastCandle.open;
    const low = Math.min(lastCandle.open, lastCandle.close);
    const high = Math.max(lastCandle.open, lastCandle.close);
    const entryLow = bullish ? low + body * 0.35 : high - body * 0.65;
    const entryHigh = bullish ? low + body * 0.65 : high - body * 0.35;
    const sl = bullish ? lastCandle.low - buffer : lastCandle.high + buffer;
    output.push(setupObj('DISPLACEMENT CANDLE', bullish ? 'BUY WATCH' : 'SELL WATCH', tf, 81, price, Math.min(entryLow, entryHigh), Math.max(entryLow, entryHigh), sl, bullish ? price + (price - sl) : price - (sl - price), bullish ? ctx.bsl : ctx.ssl, `Candle ${bullish ? 'bullish' : 'bearish'} besar dengan body dominan.`));
  }

  const valid = [];
  for (const setup of output) {
    if (![setup.entryLow, setup.entryHigh, setup.sl, setup.tp1, setup.tp2].every(Number.isFinite)) continue;
    const bullish = setup.dir.includes('BUY');
    const entryMax = Math.max(setup.entryLow, setup.entryHigh);
    const entryMin = Math.min(setup.entryLow, setup.entryHigh);
    if (bullish && (setup.tp1 <= entryMax || setup.sl >= entryMin)) continue;
    if (!bullish && (setup.tp1 >= entryMin || setup.sl <= entryMax)) continue;
    if (bullish && setup.tp2 < setup.tp1) [setup.tp1, setup.tp2] = [setup.tp2, setup.tp1];
    if (!bullish && setup.tp2 > setup.tp1) [setup.tp1, setup.tp2] = [setup.tp2, setup.tp1];
    if (Math.abs(setup.tp1 - setup.tp2) < 0.05) { setup.tp2 = setup.tp1; setup.singleTarget = true; }
    setup.conflictCheck = detectSetupConflicts(setup, ctx);
    valid.push(assignChecklist(setup, ctx));
  }
  return valid.sort((a, b) => b.score - a.score);
}
