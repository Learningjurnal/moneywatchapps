/**
 * test_security_regressions.js — MW-P0-001 identity-verification regression guard
 *
 * BACKGROUND: MW-P0-001 from "MoneyWatch Pro — Master Review" (audit basis
 * 10 Sep 2026, see AUDIT_MASTER_REVIEW_2026-09-10_MAPPING.md) — server.js's
 * /api/user-data/* endpoints used to derive the acting user's identity
 * directly from client-supplied req.query.uid / req.body.uid /
 * req.query.email / req.body.email, with no server-side check that the
 * caller was actually authenticated as that user. Any caller who knew or
 * guessed another user's uid/email could read (via /load) or DESTROY (via
 * /clear — it overwrites that user's stored data with an empty record)
 * that user's saved portfolio data.
 *
 * CURRENT STATE (2026-09-11): lib/auth-verify.js now implements a staged
 * rollout —
 *   Stage 1 (logAuthMismatchTelemetry): verifies the caller's Supabase
 *     session token WHEN PRESENT and logs (never blocks) any mismatch
 *     against the claimed uid/email. Live in production now.
 *   Stage 2 (enforceIdentityStage2): the real 401/403 enforcement — fully
 *     implemented, but OFF BY DEFAULT behind the AUTH_ENFORCE_STAGE2 env
 *     var. Turning it on is a deliberate, separate PRODUCTION decision
 *     (not something this repo/test can or should flip on its own) — it
 *     requires reviewing Stage 1's `[AUTH TELEMETRY][MW-P0-001]` logs
 *     first to confirm no real user is hitting an edge case (token-refresh
 *     timing, multi-device sessions, a call site not yet sending a token)
 *     that would lock them out the moment enforcement goes live. See
 *     lib/auth-verify.js's file header for the full rollout rationale.
 * All three /api/user-data/* handlers (save/load/clear) already call both
 * logAuthMismatchTelemetry() and enforceIdentityStage2(). All six client-
 * side call sites (public/js/02-storage.js) already attach the caller's
 * real session token via _authHeaders() — including the /load fallback
 * path that was found missing it during this same audit and fixed
 * alongside wiring this file into `npm test`/CI.
 *
 * WHAT THIS FILE GUARDS AGAINST NOW: not "is MW-P0-001 fixed" (that's a
 * deploy-time decision on AUTH_ENFORCE_STAGE2, not a code-presence fact) —
 * REGRESSION of the verification wiring itself. It would have caught the
 * missing _authHeaders() call site above before it shipped. If someone
 * later removes a logAuthMismatchTelemetry()/enforceIdentityStage2() call
 * from a handler, or a new /api/user-data/* client call site forgets
 * _authHeaders(), this fails loudly instead of silently reopening the gap.
 *
 * WHY THIS IS A STATIC TEST (reads server.js/02-storage.js source text,
 * never boots a real server or makes a network call): importing the real
 * server.js module pulls in Supabase, Upstash Redis, and Google GenAI
 * clients that need real credentials this test environment doesn't have,
 * and app.listen() would bind a real port. A live HTTP regression test
 * (401/403 against a real running server) belongs alongside whatever
 * change actually flips AUTH_ENFORCE_STAGE2 on.
 *
 * NOTE: this file does NOT test whether AUTH_ENFORCE_STAGE2 is actually
 * enabled in production — that's an environment/deploy fact, not
 * something the checked-in source can assert either way. A green run
 * here means the verification machinery is present and wired, not that
 * it's currently blocking anything. Whether/when to set
 * AUTH_ENFORCE_STAGE2=true in production remains the operator's call.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════════════════');
console.log('🔐 MW-P0-001 IDENTITY-VERIFICATION REGRESSION GUARD');
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

const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const storageText = fs.readFileSync(path.join(__dirname, 'public/js/02-storage.js'), 'utf8');

// Extracts one Express route handler's source, from its registration line
// (e.g. "app.post('/api/user-data/save'") to the matching close of that
// same app.get/app.post(...) call — found by counting parenthesis depth
// character-by-character (crossing braces/strings doesn't matter, only
// '(' / ')' do, since every route registration is exactly one call
// expression), not by guessing at a flush-left "});" convention. The
// previous version of this helper matched the FIRST flush-left "});" —
// which is often an inner block (e.g. a `res.status(400).json({...})`
// early-return) closing before the real end of the handler, silently
// truncating the extracted text and missing verification calls that come
// later in the same handler. Caught by GET /api/user-data/load going
// green after this fix (its identity-verification calls sit after an
// early-return whose own closing brace was being mistaken for the end).
function extractRouteHandler(routeRegistrationSubstring) {
  const startCharIdx = serverText.indexOf(routeRegistrationSubstring);
  if (startCharIdx === -1) return null;
  const openParenIdx = serverText.indexOf('(', startCharIdx);
  if (openParenIdx === -1) return null;
  let depth = 0;
  for (let i = openParenIdx; i < serverText.length; i++) {
    const ch = serverText[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return serverText.slice(startCharIdx, i + 1);
    }
  }
  return null; // unbalanced parens — route handler shape changed, re-check manually
}

// Matches the two functions lib/auth-verify.js actually exports for this
// purpose, plus the same generic verification-naming heuristics as before
// (case-insensitive) so a differently-named but sensible real check is
// still detected. Deliberately NOT matching on the raw presence of
// req.query.uid/req.body.uid alone — a correct handler still reads those
// fields, it just won't trust them without checking first.
const VERIFICATION_CALL_PATTERN = /enforceIdentityStage2|logAuthMismatchTelemetry|verifySupabaseSession|verify|authenticate|requireAuth|getAuthenticatedUser|session\.user|req\.user\b|supabase\.auth/i;

// Strips '//' line comments before matching — VERIFICATION_CALL_PATTERN's
// generic words (verify/authenticate/...) can appear in an UNRELATED
// comment (e.g. "// Verify tenant ownership matches requested UID", which
// is about which FILE to read, not who the caller is) and cause a false
// pass even when the real verification CALL has been removed. Found by
// deliberately reverting the /load handler's verification calls while
// developing this test and seeing it still report PASS.
function stripLineComments(src) {
  return src.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
}

function assertHandlerVerifiesIdentity(routeLabel, routeRegistrationSubstring) {
  const handler = extractRouteHandler(routeRegistrationSubstring);
  assert(handler, `Could not find the "${routeRegistrationSubstring}" route in server.js — has it moved or been renamed? Update this test's route string.`);
  const looksVerified = VERIFICATION_CALL_PATTERN.test(stripLineComments(handler));
  assert(
    looksVerified,
    `${routeLabel} no longer contains a server-side identity-verification call ` +
    `(enforceIdentityStage2()/logAuthMismatchTelemetry(), see lib/auth-verify.js) — ` +
    `it would go back to trusting client-supplied req.query.uid/req.body.uid/req.query.email/` +
    `req.body.email blindly (MW-P0-001, AUDIT_MASTER_REVIEW_2026-09-10_MAPPING.md).`
  );
}

test('MW-P0-001: POST /api/user-data/save must call the identity-verification helpers before trusting uid/email', () => {
  assertHandlerVerifiesIdentity('POST /api/user-data/save', "app.post('/api/user-data/save'");
});

test('MW-P0-001: GET /api/user-data/load must call the identity-verification helpers before trusting uid/email', () => {
  assertHandlerVerifiesIdentity('GET /api/user-data/load', "app.get('/api/user-data/load'");
});

test('MW-P0-001: POST /api/user-data/clear must call the identity-verification helpers before trusting uid/email (this one DELETES data, not just reads it)', () => {
  assertHandlerVerifiesIdentity('POST /api/user-data/clear', "app.post('/api/user-data/clear'");
});

// lib/auth-verify.js's exported enforcement function must still exist and
// still be gated behind an explicit env-var check — i.e. Stage 2 must
// remain something a deploy consciously turns on, never something that
// silently activates (a hardcoded `true` here would remove the operator's
// ability to stage the rollout the file itself documents) or silently
// vanishes (removing the gate variable would either always-block real
// users with no rollout control, or the function could be deleted
// entirely, which the handler-level checks above would also catch).
test('MW-P0-001: enforceIdentityStage2() must still exist and stay gated behind an explicit AUTH_ENFORCE_STAGE2 env-var check', () => {
  const authText = fs.readFileSync(path.join(__dirname, 'lib/auth-verify.js'), 'utf8');
  assert(/function enforceIdentityStage2/.test(authText), 'enforceIdentityStage2() is gone from lib/auth-verify.js');
  assert(/process\.env\.AUTH_ENFORCE_STAGE2/.test(authText), 'the AUTH_ENFORCE_STAGE2 env-var gate is gone — Stage 2 rollout is no longer operator-controlled');
});

// Client-side half of the same fix: EVERY fetch('/api/user-data/...')
// call site in 02-storage.js must attach the real session token via
// _authHeaders(), or the server-side checks above have nothing to verify
// against — Stage 1 logs it as "no token" (expected for guest/demo, but a
// false positive for a real user on an unheadered call site) and Stage 2,
// once enabled, would 401 every real user hitting that path. This is
// exactly the gap found and fixed in this same audit (the /load fallback
// call at ~line 1520 was missing this).
test('MW-P0-001: every /api/user-data/* fetch call in public/js/02-storage.js must attach _authHeaders()', () => {
  const lines = storageText.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (!/fetch\(\s*['"]\/api\/user-data\//.test(line)) return;
    // The call may span multiple lines (options object on following
    // lines) — scan forward a few lines for the closing of this fetch()
    // call's options object, same "look nearby" tolerance the rest of
    // this file's handler-extraction already relies on.
    const window = lines.slice(i, i + 6).join('\n');
    if (!/_authHeaders\(/.test(window)) {
      offenders.push(`line ${i + 1}: ${line.trim()}`);
    }
  });
  assert.strictEqual(offenders.length, 0,
    `${offenders.length} /api/user-data/* call site(s) in 02-storage.js do not attach _authHeaders() — ` +
    `these would silently send no identity token, defeating the server-side check:\n` + offenders.join('\n'));
});

console.log('═══════════════════════════════════════════════════════');
if (passedTests === totalTests) {
  console.log(`🎉 ALL ${passedTests}/${totalTests} MW-P0-001 IDENTITY-VERIFICATION CHECKS PASSED`);
} else {
  console.log(`⚠️  ${passedTests}/${totalTests} passed — see failures above.`);
}
console.log('═══════════════════════════════════════════════════════');
