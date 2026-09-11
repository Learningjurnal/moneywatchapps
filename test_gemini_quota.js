/**
 * test_gemini_quota.js — lib/gemini-quota.js contract + wiring regression
 * guard.
 *
 * Added alongside GET /api/ai/gemini-status (mirrors the already-existing
 * GET /api/idx/invezgo-status for Invezgo) — see lib/gemini-quota.js's file
 * header for why this exists and why it deliberately never blocks a call.
 *
 * Runs against the REAL module (direct ESM import, not a vm sandbox) — same
 * pattern test_financial_policy.js already uses for assessDataQuality()
 * from lib/idx-data-engine.js. No UPSTASH_REDIS_REST_URL/TOKEN is set in
 * this test environment, so the module's own documented in-memory fallback
 * is exercised — which is fine for testing the counting/limit LOGIC (the
 * Redis-vs-memory choice is a storage-layer detail this file doesn't need
 * to duplicate-test; invezgo-client.js's existing tests already cover that
 * same fallback shape).
 *
 * Also covers the UI side of the same change: public/js/35-settings.js's
 * "API Quota Monitor" widget pair (Invezgo + Gemini, added together in the
 * same commit so both endpoints — the pre-existing invezgo-status one and
 * this file's new gemini-status one — actually get looked at, not just
 * built and forgotten like invezgo-status was before this). Checked
 * statically (grep on source text), same technique
 * test_security_regressions.js uses, rather than a full vm-sandboxed DOM/
 * fetch mock — proportional to what's being guarded (that the wiring
 * exists and doesn't silently regress), not a UI behavior test.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  GEMINI_FALLBACK_MODELS,
  recordGeminiAttempt,
  recordGeminiOutcome,
  getGeminiQuotaStatus
} from './lib/gemini-quota.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════');
console.log('📊 GEMINI QUOTA OBSERVABILITY TESTS');
console.log('═══════════════════════════════════════════════════════');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

test('GEMINI_FALLBACK_MODELS is a non-empty, de-duplicated list of model ids', () => {
  assert(Array.isArray(GEMINI_FALLBACK_MODELS) && GEMINI_FALLBACK_MODELS.length > 0, 'must export a non-empty array');
  const unique = new Set(GEMINI_FALLBACK_MODELS);
  assert.strictEqual(unique.size, GEMINI_FALLBACK_MODELS.length, 'no duplicate model ids');
  GEMINI_FALLBACK_MODELS.forEach(m => assert(typeof m === 'string' && m.length > 0, 'every model id must be a non-empty string'));
});

// REGRESSION GUARD: server.js must call ai.models.generateContent() using
// the model list IMPORTED from lib/gemini-quota.js, not a second hardcoded
// copy of the array. A duplicate copy would silently drift from the real
// call path the moment either one is edited — exactly the kind of gap this
// file exists to prevent (the endpoint would report quota for models the
// app doesn't actually call, or miss ones it does).
test('REGRESSION GUARD: server.js must import GEMINI_FALLBACK_MODELS from lib/gemini-quota.js, not hardcode its own model array', () => {
  const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(
    /import\s*\{[^}]*GEMINI_FALLBACK_MODELS[^}]*\}\s*from\s*['"]\.\/lib\/gemini-quota\.js['"]/.test(serverText),
    'server.js no longer imports GEMINI_FALLBACK_MODELS from ./lib/gemini-quota.js'
  );
  assert(
    /const fallbackModels\s*=\s*GEMINI_FALLBACK_MODELS/.test(serverText),
    'callGeminiWithRetryAndFallback() no longer assigns fallbackModels from the imported GEMINI_FALLBACK_MODELS — check it has not reverted to a hardcoded array'
  );
});

// REGRESSION GUARD: the Gemini call path must record BOTH the attempt
// (before the call, for RPD/RPM visibility even on eventual failure) and
// the outcome (after, for success/rate_limited/error breakdown) — losing
// either call would make GET /api/ai/gemini-status silently go stale or
// undercount without any test noticing until a real quota surprise.
test('REGRESSION GUARD: server.js must call recordGeminiAttempt() and recordGeminiOutcome() around the real generateContent() call', () => {
  const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/recordGeminiAttempt\(candidateModel\)/.test(serverText), 'recordGeminiAttempt(candidateModel) call is missing from callGeminiWithRetryAndFallback()');
  assert(/recordGeminiOutcome\(['"]success['"]\)/.test(serverText), "recordGeminiOutcome('success') call is missing on the happy path");
  assert(/recordGeminiOutcome\(isRateLimited/.test(serverText), 'recordGeminiOutcome() call on the error path is missing (or no longer distinguishes rate_limited from a generic error)');
});

await asyncTest('getGeminiQuotaStatus() returns one entry per GEMINI_FALLBACK_MODELS, with dailyLimit:null when GEMINI_RPD_LIMITS is unset', async () => {
  delete process.env.GEMINI_RPD_LIMITS;
  const status = await getGeminiQuotaStatus();
  assert.strictEqual(status.models.length, GEMINI_FALLBACK_MODELS.length, 'must return exactly one entry per fallback model');
  status.models.forEach(m => {
    assert.strictEqual(m.dailyLimit, null, `${m.model}: dailyLimit must be null (not guessed) when GEMINI_RPD_LIMITS is unset`);
    assert.strictEqual(m.usagePct, null, `${m.model}: usagePct must be null without a configured limit — a % of an unknown limit is meaningless, not zero`);
    assert.strictEqual(m.alert80, false, `${m.model}: alert80 must not fire without a configured limit`);
    assert.strictEqual(m.alert90, false, `${m.model}: alert90 must not fire without a configured limit`);
    assert.strictEqual(m.limitConfigured, false);
  });
  assert.strictEqual(status.anyLimitConfigured, false);
});

await asyncTest('recordGeminiAttempt() increments usedToday for that specific model only, visible via getGeminiQuotaStatus()', async () => {
  const targetModel = GEMINI_FALLBACK_MODELS[0];
  const before = await getGeminiQuotaStatus();
  const beforeCount = before.models.find(m => m.model === targetModel).usedToday;

  await recordGeminiAttempt(targetModel);
  await recordGeminiAttempt(targetModel);

  const after = await getGeminiQuotaStatus();
  const afterEntry = after.models.find(m => m.model === targetModel);
  assert.strictEqual(afterEntry.usedToday, beforeCount + 2, 'two recordGeminiAttempt() calls for the same model must increase usedToday by exactly 2');

  // A different model in the same list must be unaffected — proves the
  // counter is keyed per-model, not a single shared total that would make
  // every model's number meaningless.
  if (GEMINI_FALLBACK_MODELS.length > 1) {
    const otherModel = GEMINI_FALLBACK_MODELS[1];
    const otherBefore = before.models.find(m => m.model === otherModel).usedToday;
    const otherAfter = after.models.find(m => m.model === otherModel).usedToday;
    assert.strictEqual(otherAfter, otherBefore, `recordGeminiAttempt('${targetModel}') must not affect '${otherModel}'s counter`);
  }
});

await asyncTest('getGeminiQuotaStatus() computes usagePct/alert80/alert90 correctly once GEMINI_RPD_LIMITS is configured', async () => {
  const targetModel = GEMINI_FALLBACK_MODELS[0];
  const beforeCount = (await getGeminiQuotaStatus()).models.find(m => m.model === targetModel).usedToday;
  // Configure a small limit relative to current usage so a handful of
  // recorded attempts land cleanly below, then at/above, the 80%/90% marks.
  process.env.GEMINI_RPD_LIMITS = JSON.stringify({ [targetModel]: beforeCount + 5 });

  await recordGeminiAttempt(targetModel); // used = before+1, limit = before+5 -> 20%
  let status = await getGeminiQuotaStatus();
  let entry = status.models.find(m => m.model === targetModel);
  assert.strictEqual(entry.limitConfigured, true);
  assert.strictEqual(entry.dailyLimit, beforeCount + 5);
  assert.strictEqual(entry.usedToday, beforeCount + 1);
  assert.strictEqual(entry.remaining, (beforeCount + 5) - (beforeCount + 1));
  assert(entry.usagePct > 0 && entry.usagePct < 80, `expected a low usagePct, got ${entry.usagePct}`);
  assert.strictEqual(entry.alert80, false);
  assert.strictEqual(entry.alert90, false);

  // Push usage to >=90% of the configured limit.
  for (let i = 0; i < 4; i++) await recordGeminiAttempt(targetModel); // used = before+5 == limit -> 100%
  status = await getGeminiQuotaStatus();
  entry = status.models.find(m => m.model === targetModel);
  assert(entry.usagePct >= 90, `expected usagePct >= 90 after reaching the configured limit, got ${entry.usagePct}`);
  assert.strictEqual(entry.alert80, true);
  assert.strictEqual(entry.alert90, true);
  assert.strictEqual(status.anyLimitConfigured, true);

  delete process.env.GEMINI_RPD_LIMITS; // don't leak into later tests in this file/process
});

await asyncTest("recordGeminiOutcome() increments today's aggregate success/rate_limited/error counters independently", async () => {
  const before = (await getGeminiQuotaStatus()).today;
  await recordGeminiOutcome('success');
  await recordGeminiOutcome('rate_limited');
  await recordGeminiOutcome('rate_limited');
  await recordGeminiOutcome('error');
  const after = (await getGeminiQuotaStatus()).today;
  assert.strictEqual(after.gemini_success_total, (before.gemini_success_total || 0) + 1);
  assert.strictEqual(after.gemini_rate_limited_total, (before.gemini_rate_limited_total || 0) + 2);
  assert.strictEqual(after.gemini_error_total, (before.gemini_error_total || 0) + 1);
});

test('REGRESSION GUARD: 35-settings.js must fetch both /api/idx/invezgo-status and /api/ai/gemini-status and render into the quota widget boxes', () => {
  const settingsText = fs.readFileSync(path.join(__dirname, 'public/js/35-settings.js'), 'utf8');
  assert(/fetch\(\s*['"]\/api\/idx\/invezgo-status['"]\s*\)/.test(settingsText), 'the Invezgo quota widget no longer fetches /api/idx/invezgo-status');
  assert(/fetch\(\s*['"]\/api\/ai\/gemini-status['"]\s*\)/.test(settingsText), 'the Gemini quota widget no longer fetches /api/ai/gemini-status');
  assert(/getElementById\(\s*['"]quota-invezgo-box['"]\s*\)/.test(settingsText), 'quota-invezgo-box target element lookup is missing');
  assert(/getElementById\(\s*['"]quota-gemini-box['"]\s*\)/.test(settingsText), 'quota-gemini-box target element lookup is missing');
});

test('REGRESSION GUARD: renderSettingsPage() must call loadApiQuotaWidgets() after setting the page HTML, or the quota boxes stay stuck on "Memuat data kuota…"', () => {
  const settingsText = fs.readFileSync(path.join(__dirname, 'public/js/35-settings.js'), 'utf8');
  const renderFnMatch = settingsText.match(/function renderSettingsPage\(\)\s*\{[\s\S]*?\n  \}/);
  assert(renderFnMatch, 'could not locate renderSettingsPage() — has it moved/been renamed?');
  assert(/loadApiQuotaWidgets\(\)/.test(renderFnMatch[0]), 'renderSettingsPage() no longer calls loadApiQuotaWidgets()');
});

console.log('═══════════════════════════════════════════════════════');
if (passedTests === totalTests) {
  console.log(`🎉 ALL ${passedTests}/${totalTests} GEMINI QUOTA TESTS PASSED`);
} else {
  console.log(`⚠️  ${passedTests}/${totalTests} passed — see failures above.`);
}
console.log('═══════════════════════════════════════════════════════');
