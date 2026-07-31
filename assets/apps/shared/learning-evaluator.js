/* Amy FX Learning Evaluator — deterministic, offline, lesson-agnostic. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AmyFXLearningEvaluator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const CRITICAL_SCORE_CAP = 49;
  const CORRECT_MIN_SCORE = 80;
  const PARTIAL_MIN_SCORE = 50;

  const TEMPLATE_NAMES = new Set([
    'classification.v1',
    'state-transition.v1',
    'location.v1',
    'sequence.v1',
    'numeric.v1',
    'checklist.v1',
    'decision.v1',
    'manual-review.v1'
  ]);

  const OPERATORS = new Set([
    'eq',
    'notEq',
    'oneOf',
    'exists',
    'notExists',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
    'between',
    'withinTolerance',
    'allOf',
    'anyOf',
    'not',
    'ordered',
    'containsAll'
  ]);

  function own(object, key) {
    return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function getPath(object, path) {
    if (path === '' || path === null || path === undefined) return object;
    if (!object || typeof path !== 'string') return undefined;
    if (own(object, path)) return object[path];

    const parts = path.split('.').filter(Boolean);
    let current = object;
    for (let index = 0; index < parts.length; index += 1) {
      if (current === null || current === undefined) return undefined;
      const remainder = parts.slice(index).join('.');
      if (own(current, remainder)) return current[remainder];
      if (!own(current, parts[index])) return undefined;
      current = current[parts[index]];
    }
    return current;
  }

  function normalizeOperand(spec, fallbackPath, scope) {
    if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
      if (own(spec, 'value')) return spec.value;
      if (typeof spec.path === 'string') return getPath(scope, spec.path);
    }
    if (typeof fallbackPath === 'string') return getPath(scope, fallbackPath);
    return spec;
  }

  function deepEqual(left, right) {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      return deepEqual(leftKeys, rightKeys) && leftKeys.every(key => deepEqual(left[key], right[key]));
    }
    return false;
  }

  function toleranceAmount(tolerance, expected, scope) {
    const config = tolerance && typeof tolerance === 'object' ? tolerance : { type: 'ABSOLUTE', value: tolerance };
    const value = finiteNumber(config.value);
    if (value === null || value < 0) return null;

    switch (String(config.type || 'ABSOLUTE').toUpperCase()) {
      case 'ABSOLUTE':
      case 'POINT':
      case 'PIP':
        return value;
      case 'PERCENT': {
        const target = finiteNumber(expected);
        return target === null ? null : Math.abs(target) * value / 100;
      }
      case 'ATR_FRACTION': {
        const atr = finiteNumber(getPath(scope, config.atrPath || 'facts.volatility.atr'));
        return atr === null ? null : Math.abs(atr) * value;
      }
      default:
        return null;
    }
  }

  function primitiveComparison(operator, actual, expected, assertion, scope) {
    switch (operator) {
      case 'eq':
        return deepEqual(actual, expected);
      case 'notEq':
        return !deepEqual(actual, expected);
      case 'oneOf':
        return Array.isArray(expected) && expected.some(value => deepEqual(actual, value));
      case 'exists':
        return actual !== undefined && actual !== null;
      case 'notExists':
        return actual === undefined || actual === null;
      case 'greaterThan': {
        const left = finiteNumber(actual);
        const right = finiteNumber(expected);
        return left !== null && right !== null && left > right;
      }
      case 'greaterThanOrEqual': {
        const left = finiteNumber(actual);
        const right = finiteNumber(expected);
        return left !== null && right !== null && left >= right;
      }
      case 'lessThan': {
        const left = finiteNumber(actual);
        const right = finiteNumber(expected);
        return left !== null && right !== null && left < right;
      }
      case 'lessThanOrEqual': {
        const left = finiteNumber(actual);
        const right = finiteNumber(expected);
        return left !== null && right !== null && left <= right;
      }
      case 'between': {
        const number = finiteNumber(actual);
        const range = Array.isArray(expected) ? expected : [assertion.min, assertion.max];
        const minimum = finiteNumber(range[0]);
        const maximum = finiteNumber(range[1]);
        return number !== null && minimum !== null && maximum !== null && number >= minimum && number <= maximum;
      }
      case 'withinTolerance': {
        const number = finiteNumber(actual);
        const target = finiteNumber(expected);
        const allowed = toleranceAmount(assertion.tolerance, target, scope);
        return number !== null && target !== null && allowed !== null && Math.abs(number - target) <= allowed;
      }
      case 'ordered':
        return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && actual.every((value, index) => deepEqual(value, expected[index]));
      case 'containsAll':
        return Array.isArray(actual) && Array.isArray(expected) && expected.every(required => actual.some(value => deepEqual(value, required)));
      default:
        return false;
    }
  }

  function evaluateAssertion(assertion, scope) {
    if (!assertion || typeof assertion !== 'object') {
      return { passed: false, missing: false, invalid: true, reasonCode: 'REQUIRED_CONDITION_MISSING' };
    }

    const operator = String(assertion.operator || 'eq');
    if (!OPERATORS.has(operator)) {
      return { passed: false, missing: false, invalid: true, reasonCode: 'REQUIRED_CONDITION_MISSING' };
    }

    if (operator === 'allOf' || operator === 'anyOf') {
      const children = Array.isArray(assertion.assertions) ? assertion.assertions : [];
      const results = children.map(child => evaluateAssertion(child, scope));
      const passed = operator === 'allOf' ? results.length > 0 && results.every(result => result.passed) : results.some(result => result.passed);
      return {
        passed,
        missing: results.some(result => result.missing),
        invalid: results.some(result => result.invalid),
        children,
        reasonCode: passed ? assertion.successReason : (assertion.failureReason || 'REQUIRED_CONDITION_MISSING')
      };
    }

    if (operator === 'not') {
      const child = evaluateAssertion(assertion.assertion, scope);
      return {
        passed: !child.passed,
        missing: child.missing,
        invalid: child.invalid,
        children: [child],
        reasonCode: !child.passed ? assertion.successReason : (assertion.failureReason || 'FORBIDDEN_CONDITION_PRESENT')
      };
    }

    const actual = normalizeOperand(assertion.left, assertion.path, scope);
    const expected = own(assertion, 'right')
      ? normalizeOperand(assertion.right, null, scope)
      : own(assertion, 'valuePath')
        ? getPath(scope, assertion.valuePath)
        : assertion.value;

    const missingActual = actual === undefined && operator !== 'notExists';
    const expectedRequired = !['exists', 'notExists'].includes(operator);
    const missingExpected = expectedRequired && expected === undefined;
    if (missingActual || missingExpected) {
      return {
        passed: false,
        missing: true,
        invalid: false,
        actual,
        expected,
        reasonCode: assertion.missingReason || 'EVIDENCE_MISSING'
      };
    }

    const passed = primitiveComparison(operator, actual, expected, assertion, scope);
    return {
      passed,
      missing: false,
      invalid: false,
      actual,
      expected,
      reasonCode: passed
        ? (assertion.successReason || 'ANSWER_MATCH')
        : (assertion.failureReason || (operator === 'withinTolerance' ? 'OUT_OF_TOLERANCE' : 'ANSWER_MISMATCH'))
    };
  }

  function expectedValue(expected, scope) {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (typeof expected.fromFact === 'string') return getPath(scope, 'facts.' + expected.fromFact);
      if (typeof expected.fromPath === 'string') return getPath(scope, expected.fromPath);
      if (own(expected, 'value')) return expected.value;
    }
    return expected;
  }

  function defaultAssertion(id, path, operator, value, exercise) {
    return {
      id,
      path,
      operator,
      value,
      tolerance: exercise.tolerance,
      weight: 100,
      critical: Boolean(exercise.critical),
      successReason: 'ANSWER_MATCH',
      failureReason: exercise.failureReason || 'ANSWER_MISMATCH'
    };
  }

  function compileTemplate(exercise, scope) {
    if (Array.isArray(exercise.assertions) && exercise.assertions.length) return exercise.assertions;

    const expected = expectedValue(exercise.expectedAnswer || exercise.expectedValue || exercise.expectedSequence, scope);
    switch (exercise.template) {
      case 'classification.v1':
      case 'decision.v1':
        return [defaultAssertion('answer-classification', 'answer.value', 'eq', expected, exercise)];
      case 'state-transition.v1':
        return [defaultAssertion('answer-transition', 'answer.value', 'eq', expected, exercise)];
      case 'location.v1':
        return [defaultAssertion('answer-location', exercise.answerPath || 'answer.value', 'withinTolerance', expected, exercise)];
      case 'sequence.v1':
        return [defaultAssertion('answer-sequence', exercise.answerPath || 'answer.value', 'ordered', expected, exercise)];
      case 'numeric.v1':
        return [defaultAssertion('answer-numeric', exercise.answerPath || 'answer.value', exercise.tolerance ? 'withinTolerance' : 'eq', expected, exercise)];
      case 'checklist.v1':
        return (Array.isArray(exercise.items) ? exercise.items : []).map((item, index) => ({
          id: item.id || 'checklist-' + index,
          path: item.answerPath || 'answer.' + item.id,
          operator: item.operator || 'eq',
          value: own(item, 'expected') ? item.expected : true,
          weight: item.weight,
          critical: Boolean(item.critical),
          successReason: item.successReason,
          failureReason: item.failureReason
        }));
      default:
        return [];
    }
  }

  function validateInput(exercise, evidence) {
    const errors = [];
    if (!exercise || typeof exercise !== 'object') errors.push('INVALID_EXERCISE');
    if (!exercise || !TEMPLATE_NAMES.has(exercise.template)) errors.push('INVALID_TEMPLATE');
    if (!evidence || typeof evidence !== 'object') errors.push('INVALID_EVIDENCE');
    if (evidence && evidence.schemaVersion !== SCHEMA_VERSION) errors.push('INVALID_EVIDENCE_SCHEMA');
    return errors;
  }

  function requiredFactsMissing(exercise, scope) {
    const required = Array.isArray(exercise.requiredFacts) ? exercise.requiredFacts : [];
    return required.filter(path => getPath(scope, path.startsWith('facts.') ? path : 'facts.' + path) === undefined);
  }

  function statusForScore(score) {
    if (score >= CORRECT_MIN_SCORE) return 'CORRECT';
    if (score >= PARTIAL_MIN_SCORE) return 'PARTIAL';
    return 'INCORRECT';
  }

  function unscorable(reasonCodes, extra) {
    return Object.assign({
      schemaVersion: SCHEMA_VERSION,
      status: 'UNSCORABLE',
      score: null,
      rawScore: null,
      reasonCodes: unique(reasonCodes),
      passedAssertions: [],
      failedAssertions: [],
      criticalFailure: false,
      reviewRequired: false
    }, extra || {});
  }

  function evaluate(input) {
    const request = input || {};
    const exercise = request.exercise || {};
    const answer = request.answer || {};
    const evidence = request.evidence || {};
    const errors = validateInput(exercise, evidence);
    if (errors.length) return unscorable(['EVIDENCE_MISSING'], { validationErrors: errors });

    if (exercise.template === 'manual-review.v1') {
      return {
        schemaVersion: SCHEMA_VERSION,
        status: 'REVIEW_REQUIRED',
        score: null,
        rawScore: null,
        reasonCodes: ['MANUAL_REVIEW_REQUIRED'],
        passedAssertions: [],
        failedAssertions: [],
        criticalFailure: false,
        reviewRequired: true
      };
    }

    const scope = {
      answer,
      evidence,
      facts: evidence.facts || {},
      entities: evidence.entities || {},
      freshness: evidence.freshness,
      source: evidence.source,
      symbol: evidence.symbol,
      timeframe: evidence.timeframe
    };

    const missingFacts = requiredFactsMissing(exercise, scope);
    if (missingFacts.length) return unscorable(['EVIDENCE_MISSING'], { missingFacts });

    const gates = Array.isArray(exercise.gates) ? exercise.gates : [];
    const gateResults = gates.map(gate => ({ gate, result: evaluateAssertion(gate, scope) }));
    const failedGates = gateResults.filter(item => !item.result.passed);
    if (failedGates.length) {
      return unscorable(failedGates.map(item => item.result.reasonCode || item.gate.failureReason || 'REQUIRED_CONDITION_MISSING'), {
        failedGates: failedGates.map(item => item.gate.id || null).filter(Boolean)
      });
    }

    const assertions = compileTemplate(exercise, scope);
    if (!assertions.length) return unscorable(['EVIDENCE_MISSING'], { validationErrors: ['NO_ASSERTIONS'] });

    const evaluated = assertions.map((assertion, index) => {
      const result = evaluateAssertion(assertion, scope);
      const weightValue = finiteNumber(assertion.weight);
      return {
        id: assertion.id || 'assertion-' + index,
        weight: weightValue !== null && weightValue > 0 ? weightValue : 1,
        critical: Boolean(assertion.critical),
        result
      };
    });

    if (evaluated.some(item => item.result.missing || item.result.invalid)) {
      return unscorable(evaluated.filter(item => item.result.missing || item.result.invalid).map(item => item.result.reasonCode || 'EVIDENCE_MISSING'), {
        failedAssertions: evaluated.filter(item => item.result.missing || item.result.invalid).map(item => item.id)
      });
    }

    const totalWeight = evaluated.reduce((sum, item) => sum + item.weight, 0);
    const passedWeight = evaluated.filter(item => item.result.passed).reduce((sum, item) => sum + item.weight, 0);
    const rawScore = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;
    const failedCritical = evaluated.filter(item => item.critical && !item.result.passed);
    const criticalFailure = failedCritical.length > 0;
    const score = criticalFailure ? Math.min(rawScore, CRITICAL_SCORE_CAP) : rawScore;
    const status = criticalFailure ? 'INCORRECT' : statusForScore(score);

    return {
      schemaVersion: SCHEMA_VERSION,
      status,
      score,
      rawScore,
      reasonCodes: unique(evaluated.filter(item => !item.result.passed).map(item => item.result.reasonCode)),
      passedAssertions: evaluated.filter(item => item.result.passed).map(item => item.id),
      failedAssertions: evaluated.filter(item => !item.result.passed).map(item => item.id),
      criticalFailure,
      reviewRequired: false
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    CRITICAL_SCORE_CAP,
    CORRECT_MIN_SCORE,
    PARTIAL_MIN_SCORE,
    TEMPLATE_NAMES,
    OPERATORS,
    getPath,
    evaluateAssertion,
    evaluate
  });
});
