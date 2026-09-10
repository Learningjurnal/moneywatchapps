/**
 * test_security_regressions.js — known-vulnerability regression tracker
 *
 * PURPOSE: documents MW-P0-001 from "MoneyWatch Pro — Master Review"
 * (audit basis 10 Sep 2026, see AUDIT_MASTER_REVIEW_2026-09-10_MAPPING.md
 * for the full write-up): server.js's /api/user-data/* endpoints derive
 * the acting user's identity directly from client-supplied
 * req.query.uid / req.body.uid / req.query.email / req.body.email, with
 * no server-side verification that the caller is actually authenticated
 * as that user. Any caller who knows or guesses another user's uid/email
 * can read (via /load) or DESTROY (via /clear — it overwrites that
 * user's stored data with an empty record) that user's saved portfolio
 * data, today, in production.
 *
 * WHY THIS IS A STATIC TEST (reads server.js's source text, never boots
 * a real server or makes a network call): importing the real server.js
 * module pulls in Supabase, Upstash Redis, and Google GenAI clients that
 * need real credentials this test environment doesn't have, and
 * app.listen() would bind a real port. A live HTTP regression test
 * belongs alongside the actual fix (roadmap item B.4: staged JWT/session
 * verification) — this file only documents the gap ahead of that fix.
 *
 * WHY THIS IS NOT WIRED INTO `npm test`: every test below is written to
 * assert the SECURE behavior these endpoints should have, not the
 * current one — they are EXPECTED TO FAIL until MW-P0-001 is actually
 * fixed. Chaining a known-failing file into the default `npm test`
 * would turn the whole suite red and mask any *new* regression in the
 * 37+11 checks that already pass — the opposite of what those checks are
 * for. Run this file on its own via `npm run test:security` to check
 * current status; once the fix lands, promote its passing checks into
 * the main suite (or re-wire this file into `npm test` at that point).
 *
 * IF THIS STARTS PASSING: that means a route handler below now contains
 * something that looks like an identity-verification call (see the
 * regex in `looksVerified`). Read the diff to confirm it's a real fix,
 * not a coincidental keyword match, before treating MW-P0-001 as closed.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════');
console.log('🔓 KNOWN-VULNERABILITY REGRESSION TRACKER (MW-P0-001)');
console.log('   These are EXPECTED TO FAIL until the fix lands — see');
console.log('   file header. Not part of `npm test`.');
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
    console.error(`  ❌ [FAIL — VULNERABILITY STILL PRESENT] ${name}: ${err.message}`);
  }
}

const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extracts one Express route handler's source, from its registration line
// (e.g. "app.post('/api/user-data/save'") down to the first flush-left
// "});" that follows — every handler in this file closes that way (see
// AUDIT_MASTER_REVIEW_2026-09-10_MAPPING.md's MW-P0-001 section for the
// exact line numbers this matches as of the audit). Locating by the route
// string rather than a hardcoded line range keeps this test resilient to
// unrelated edits elsewhere in the file.
function extractRouteHandler(routeRegistrationSubstring) {
  const lines = serverText.split('\n');
  const startIdx = lines.findIndex(l => l.includes(routeRegistrationSubstring));
  if (startIdx === -1) return null;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '});') {
      return lines.slice(startIdx, i + 1).join('\n');
    }
  }
  return null; // no closing "});" found — route handler shape changed, re-check manually
}

// Heuristic for "this handler verifies who the caller actually is before
// trusting a client-supplied identity" — matches common naming for a
// session/JWT verification call. Deliberately permissive (case-insensitive,
// several likely names) so a sensibly-named real fix is detected
// automatically; deliberately NOT matching on the raw presence of
// `req.query.uid`/`req.body.uid` alone, since a fixed handler will still
// read those fields — it just won't trust them without checking first.
const VERIFICATION_CALL_PATTERN = /verify|authenticate|requireAuth|getAuthenticatedUser|session\.user|req\.user\b|supabase\.auth/i;

function assertHandlerVerifiesIdentity(routeLabel, routeRegistrationSubstring) {
  const handler = extractRouteHandler(routeRegistrationSubstring);
  assert(handler, `Could not find the "${routeRegistrationSubstring}" route in server.js — has it moved or been renamed? Update this test's route string.`);
  const looksVerified = VERIFICATION_CALL_PATTERN.test(handler);
  assert(
    looksVerified,
    `${routeLabel} still derives its acting-user identity directly from client-supplied ` +
    `req.query.uid/req.body.uid/req.query.email/req.body.email with no server-side identity ` +
    `verification call found in its handler (see MW-P0-001 in AUDIT_MASTER_REVIEW_2026-09-10_MAPPING.md). ` +
    `Any caller can act as another user by supplying their uid/email in the request.`
  );
}

test('KNOWN VULNERABILITY (MW-P0-001): POST /api/user-data/save must verify caller identity server-side before trusting uid/email', () => {
  assertHandlerVerifiesIdentity('POST /api/user-data/save', "app.post('/api/user-data/save'");
});

test('KNOWN VULNERABILITY (MW-P0-001): GET /api/user-data/load must verify caller identity server-side before trusting uid/email', () => {
  assertHandlerVerifiesIdentity('GET /api/user-data/load', "app.get('/api/user-data/load'");
});

test('KNOWN VULNERABILITY (MW-P0-001): POST /api/user-data/clear must verify caller identity server-side before trusting uid/email (this one DELETES data, not just reads it)', () => {
  assertHandlerVerifiesIdentity('POST /api/user-data/clear', "app.post('/api/user-data/clear'");
});

console.log('═══════════════════════════════════════════════════════');
console.log(`${passedTests}/${totalTests} passed.`);
if (passedTests < totalTests) {
  console.log('⚠️  Failures above are EXPECTED until MW-P0-001 is fixed — this is a known-gap tracker, not a regression in new code.');
} else {
  console.log('🎉 All identity-verification checks passed — if this is unexpected, confirm MW-P0-001 was actually fixed and not a false positive (see file header).');
}
console.log('═══════════════════════════════════════════════════════');
// Deliberately no process.exitCode = 1 on failure — see file header for
// why this must never fail `npm test`. Run `npm run test:security` to
// check status explicitly.
