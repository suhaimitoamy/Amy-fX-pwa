/* Amy FX Trading Practice — pure TIME + PRICE drawing model. */
(function (root) {
  'use strict';

  if (root.AmyPracticeDrawing) return;

  var TYPE_ALIASES = Object.freeze({ zone: 'rectangle' });
  var SINGLE_POINT = Object.freeze(['horizontal', 'horizontalRay', 'entry', 'stop', 'target', 'text', 'note', 'priceNote']);
  var TWO_POINT = Object.freeze(['trend', 'fibonacci', 'priceRange', 'rectangle', 'arrow', 'circle']);
  var THREE_POINT = Object.freeze(['parallelChannel', 'longPosition', 'shortPosition']);
  var SUPPORTED = Object.freeze(SINGLE_POINT.concat(TWO_POINT, THREE_POINT, ['path']));

  function finite(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizePoint(value) {
    if (!value) return null;
    var time = finite(value.time);
    var price = finite(value.price);
    if (time == null || price == null) return null;
    return { time: Math.round(time), price: price };
  }

  function normalizeType(value) {
    var requested = String(value || '');
    var type = TYPE_ALIASES[requested] || requested;
    return SUPPORTED.indexOf(type) >= 0 ? type : null;
  }

  function requiredPoints(type) {
    var normalized = normalizeType(type);
    if (SINGLE_POINT.indexOf(normalized) >= 0) return 1;
    if (TWO_POINT.indexOf(normalized) >= 0) return 2;
    if (THREE_POINT.indexOf(normalized) >= 0) return 3;
    if (normalized === 'path') return 2;
    return 0;
  }

  function identifier() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return 'drawing-' + root.crypto.randomUUID();
    return 'drawing-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeStyle(style) {
    style = style || {};
    return {
      color: /^#[0-9a-f]{6}$/i.test(style.color || '') ? style.color : null,
      width: Number.isFinite(Number(style.width)) ? Math.max(1, Math.min(8, Number(style.width))) : 2,
      opacity: style.opacity != null && Number.isFinite(Number(style.opacity)) ? Math.max(.1, Math.min(1, Number(style.opacity))) : 1
    };
  }

  function normalizeDrawing(input) {
    if (!input) return null;
    var type = normalizeType(input.type);
    if (!type) return null;
    var rawPoints = Array.isArray(input.points) ? input.points : [input.a, input.b, input.c];
    var points = rawPoints.map(normalizePoint).filter(Boolean);
    if (points.length < requiredPoints(type)) return null;
    return {
      id: String(input.id || identifier()),
      type: type,
      points: points,
      style: normalizeStyle(input.style),
      replayCreatedAt: input.replayCreatedAt == null ? null : finite(input.replayCreatedAt),
      text: String(input.text || '').trim().slice(0, 240),
      createdAt: Number(input.createdAt || Date.now())
    };
  }

  function create(type, points, options) {
    options = options || {};
    return normalizeDrawing({
      id: options.id,
      type: type,
      points: points,
      style: options.style,
      replayCreatedAt: options.replayCreatedAt,
      text: options.text,
      createdAt: options.createdAt
    });
  }

  function clone(drawing) {
    var normalized = normalizeDrawing(drawing);
    if (!normalized) return null;
    return {
      id: normalized.id,
      type: normalized.type,
      points: normalized.points.map(function (point) { return { time: point.time, price: point.price }; }),
      style: normalizeStyle(normalized.style),
      replayCreatedAt: normalized.replayCreatedAt,
      text: normalized.text,
      createdAt: normalized.createdAt
    };
  }

  function move(drawing, deltaTime, deltaPrice) {
    var normalized = clone(drawing);
    var time = finite(deltaTime);
    var price = finite(deltaPrice);
    if (!normalized || time == null || price == null) return normalized;
    normalized.points = normalized.points.map(function (point) {
      return { time: Math.round(point.time + time), price: point.price + price };
    });
    return normalized;
  }

  function updatePoint(drawing, index, point) {
    var normalized = clone(drawing);
    var nextPoint = normalizePoint(point);
    var target = Number(index);
    if (!normalized || !nextPoint || !Number.isInteger(target) || target < 0 || target >= normalized.points.length) return normalized;
    normalized.points[target] = nextPoint;
    return normalized;
  }

  function positionStats(drawing) {
    var normalized = normalizeDrawing(drawing);
    if (!normalized || ['longPosition', 'shortPosition'].indexOf(normalized.type) < 0) return null;
    var entry = normalized.points[0].price;
    var target = normalized.points[1].price;
    var stop = normalized.points[2].price;
    var sign = normalized.type === 'longPosition' ? 1 : -1;
    var risk = (entry - stop) * sign;
    var reward = (target - entry) * sign;
    var valid = entry > 0 && target > 0 && stop > 0 && risk > 0 && reward > 0;
    return { entry: entry, target: target, stop: stop, risk: risk, reward: reward, valid: valid, rr: valid ? reward / risk : null };
  }

  root.AmyPracticeDrawing = Object.freeze({
    SUPPORTED: SUPPORTED,
    SINGLE_POINT: SINGLE_POINT,
    TWO_POINT: TWO_POINT,
    THREE_POINT: THREE_POINT,
    normalizeStyle: normalizeStyle,
    normalizePoint: normalizePoint,
    normalizeDrawing: normalizeDrawing,
    normalizeType: normalizeType,
    requiredPoints: requiredPoints,
    create: create,
    clone: clone,
    move: move,
    updatePoint: updatePoint,
    positionStats: positionStats
  });
})(typeof window !== 'undefined' ? window : globalThis);
