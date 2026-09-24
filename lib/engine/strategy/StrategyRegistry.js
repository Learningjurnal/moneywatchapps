/**
 * lib/engine/strategy/StrategyRegistry.js — loads strategy JSON definitions
 * (strategies/*.json) and validates them at load time (never at score
 * time — a bad weight sum should fail loudly at startup, not silently
 * mis-score every result).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateStrategyDefinition } from './StrategyValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STRATEGIES_DIR = path.join(__dirname, '..', '..', '..', 'strategies');

let _cache = null;

function loadStrategyRegistry() {
  if (_cache) return _cache;
  const files = fs.readdirSync(STRATEGIES_DIR).filter(f => f.endsWith('.json'));
  const registry = {};
  files.forEach(file => {
    const full = path.join(STRATEGIES_DIR, file);
    const def = JSON.parse(fs.readFileSync(full, 'utf8'));
    const validation = validateStrategyDefinition(def);
    if (!validation.valid) {
      throw new Error(`Strategy definition invalid (${file}): ${validation.errors.join('; ')}`);
    }
    registry[def.id] = def;
  });
  _cache = registry;
  return registry;
}

function getStrategyById(id) {
  const registry = loadStrategyRegistry();
  return registry[id] || null;
}

function listStrategies() {
  return Object.values(loadStrategyRegistry());
}

// Test-only: allow re-reading strategies/*.json after a fixture edit,
// without needing to spawn a fresh process.
function __resetRegistryCacheForTests() {
  _cache = null;
}

export { loadStrategyRegistry, getStrategyById, listStrategies, __resetRegistryCacheForTests };
