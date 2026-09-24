/**
 * lib/engine/strategy/StrategyValidator.js — structural validation for a
 * strategy JSON definition. Enforces: weights present, every weight key is
 * a known indicator, weights sum to EXACTLY 1.0 (within floating-point
 * tolerance), and every mandatory condition references a weighted
 * indicator.
 */

const KNOWN_INDICATORS = Object.freeze([
  'HIGH_BID_OFFER', 'HIGH_ATS', 'NO_SELL', 'CLOSE_HIGH', 'HIGH_NON_REGULAR', 'FOREIGN', 'VOLUME', 'FREQUENCY'
]);

const WEIGHT_SUM_TOLERANCE = 1e-6;

function validateStrategyDefinition(def) {
  const errors = [];
  if (!def || typeof def !== 'object') return { valid: false, errors: ['Definition is not an object'] };
  if (!def.id || typeof def.id !== 'string') errors.push('Missing string field "id"');
  if (!def.name || typeof def.name !== 'string') errors.push('Missing string field "name"');
  if (!def.version || typeof def.version !== 'string') errors.push('Missing string field "version"');
  if (!def.weights || typeof def.weights !== 'object') {
    errors.push('Missing "weights" object');
  } else {
    const keys = Object.keys(def.weights);
    if (keys.length === 0) errors.push('"weights" is empty');
    keys.forEach(k => {
      if (!KNOWN_INDICATORS.includes(k)) errors.push(`Unknown indicator in weights: "${k}"`);
      if (typeof def.weights[k] !== 'number' || def.weights[k] < 0) errors.push(`Weight for "${k}" must be a non-negative number`);
    });
    const sum = keys.reduce((acc, k) => acc + (Number(def.weights[k]) || 0), 0);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      errors.push(`Weights must sum to exactly 1.0, got ${sum}`);
    }
  }
  if (def.mandatoryConditions) {
    if (!Array.isArray(def.mandatoryConditions)) {
      errors.push('"mandatoryConditions" must be an array');
    } else {
      def.mandatoryConditions.forEach(m => {
        if (!def.weights || !(m in def.weights)) errors.push(`Mandatory condition "${m}" is not a weighted indicator in this strategy`);
      });
    }
  }
  if (!def.scoreBands || typeof def.scoreBands !== 'object') {
    errors.push('Missing "scoreBands" object');
  } else {
    ['strong', 'qualified', 'watch'].forEach(band => {
      if (typeof def.scoreBands[band] !== 'number') errors.push(`Missing numeric scoreBands.${band}`);
    });
  }
  return { valid: errors.length === 0, errors };
}

export { validateStrategyDefinition, KNOWN_INDICATORS, WEIGHT_SUM_TOLERANCE };
