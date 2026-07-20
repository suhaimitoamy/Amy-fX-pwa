import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONCEPT_THRESHOLDS,
  buildConceptLiquidityHierarchy,
  detectMarketConcepts,
  evaluateLiquidityReclaim,
  evaluateZoneLifecycle,
  structureDisplacementMetrics
} from '../app/src/main/assets/apps/mapping/js/engine/concept-engine.js';

const candle = (open, high, low, close, time) => ({ open, high, low, close, time });

test('production thresholds use the validated Mapping reference profile', () => {
  assert.deepEqual({
    fvgMinWidthAtr: CONCEPT_THRESHOLDS.fvgMinWidthAtr,
    fvgBodyLength: CONCEPT_THRESHOLDS.fvgBodyLength,
    fvgBodyRatio: CONCEPT_THRESHOLDS.fvgBodyRatio,
    fvgWickBodyRatio: CONCEPT_THRESHOLDS.fvgWickBodyRatio,
    reclaim: CONCEPT_THRESHOLDS.liquidityReclaimAtr,
    penetration: CONCEPT_THRESHOLDS.structurePenetrationAtr
  }, {
    fvgMinWidthAtr: 0,
    fvgBodyLength: 4,
    fvgBodyRatio: 0.45,
    fvgWickBodyRatio: 0.36,
    reclaim: 0.4,
    penetration: 0.2
  });
});

test('FVG converts to IFVG and confirms only the inverse rejection', () => {
  const candles = [
    candle(102, 102.4, 101.5, 101.8, 0),
    candle(101.8, 101.9, 99.7, 100.2, 1),
    candle(100.2, 100.8, 99.4, 99.6, 2),
    candle(99.6, 100.0, 98.9, 99.2, 3)
  ];
  const result = evaluateZoneLifecycle(candles, {
    kind: 'FVG', direction: 'BULLISH', bottom: 100, top: 101, availableIndex: 0
  }, { breakMode: 'WICK', convertedKind: 'IFVG' });
  assert.equal(result.kind, 'IFVG');
  assert.equal(result.direction, 'BEARISH');
  assert.equal(result.status, 'IFVG_CONFIRMED_REACTION');
  assert.equal(result.inverseConfirmedIndex, 2);
});

test('liquidity and structure confirmations enforce ATR thresholds', () => {
  assert.equal(evaluateLiquidityReclaim('BSL', 100, 99.61, 1).confirmed, false);
  assert.equal(evaluateLiquidityReclaim('BSL', 100, 99.60, 1).confirmed, true);
  const weak = structureDisplacementMetrics(candle(100, 101.2, 99.8, 100.19, 0), 1, 100, 'BULLISH');
  const valid = structureDisplacementMetrics(candle(99.2, 100.3, 99.1, 100.20, 0), 1, 100, 'BULLISH');
  assert.equal(weak.valid, false);
  assert.equal(valid.valid, true);
});

test('liquidity hierarchy is nearest-target context, never directional pressure', () => {
  const hierarchy = buildConceptLiquidityHierarchy([
    { id: 'b', type: 'BSL', subtype: 'SWING', level: 105, status: 'DETECTED', active: true },
    { id: 's', type: 'SSL', subtype: 'EQUAL', level: 98, status: 'DETECTED', active: true },
    { id: 'old', type: 'BSL', subtype: 'SWING', level: 101, status: 'CONFIRMED_REACTION', active: false }
  ], 100, 'BULLISH');
  assert.equal(hierarchy.drawTarget.type, 'SSL');
  assert.equal(hierarchy.directionalUse, false);
  assert.equal(hierarchy.targetRole, 'LIQUIDITY_TARGET_ONLY');
  assert.equal(hierarchy.bsl, 105);
  assert.equal(hierarchy.ssl, 98);
});

test('single market concept engine returns compatible production fields', () => {
  const candles = [];
  let price = 100;
  for (let index = 0; index < 90; index += 1) {
    const drift = Math.sin(index / 4) * 0.8 + (index % 17 === 0 ? 1.2 : 0);
    const open = price;
    const close = open + drift * 0.25;
    const high = Math.max(open, close) + 0.45 + Math.abs(drift) * 0.1;
    const low = Math.min(open, close) - 0.45 - Math.abs(drift) * 0.1;
    candles.push(candle(open, high, low, close, index * 900));
    price = close;
  }
  const result = detectMarketConcepts(candles, { tf: 'M15', currentPrice: price });
  assert.equal(result.source, 'AMY_CONCEPT_ENGINE_V2');
  assert.ok(Array.isArray(result.mappingZones.nearestFairValueGaps));
  assert.ok(Array.isArray(result.mappingZones.nearestOrderBlocks));
  assert.ok(Array.isArray(result.liquidityHierarchy.activeTargets));
  assert.equal(result.structure.source, 'AMY_CONCEPT_ENGINE_V2');
});

test('legacy diagnostic timers and Pine zone source are no longer wired to Mapping', () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(directory, '..');
  const html = fs.readFileSync(path.join(root, 'app/src/main/assets/apps/mapping/index.html'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'app/src/main/assets/apps/mapping/js/mapping-zone-sync.js'), 'utf8');
  for (const name of ['concept-state-sync.js', 'concept-structure-state-sync.js', 'concept-ob-state-sync.js', 'concept-level-state-sync.js', 'concept-view-refresh.js']) {
    assert.equal(html.includes(name), false);
  }
  assert.equal(sync.includes("./zones/indicator-zones.js"), false);
  assert.equal(sync.includes('AMY_CONCEPT_ENGINE_V2'), true);
});
