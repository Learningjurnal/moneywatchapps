/**
 * lib/auth-verify.js — Supabase session verification (Stage 1: telemetry-only)
 *
 * Addresses MW-P0-001 from the "MoneyWatch Pro — Master Review" audit
 * (see AUDIT_MASTER_REVIEW_2026-09-10_MAPPING.md): server.js's
 * /api/user-data/* endpoints derived the acting user's identity from
 * client-supplied uid/email fields with no server-side verification.
 *
 * STAGE 1 SCOPE (this file, right now): verify the caller's Supabase
 * session token WHEN PRESENT and report whether it matches the identity
 * the request claims — but never block the request on the result. This
 * is the audit's own recommended migration rule: "Stage JWT enforcement
 * + telemetry; test 401/403/cross-user before hard block" (roadmap item
 * 1, Security P0). The client was, until this same change, never sending
 * a token at all — flipping straight to enforcement in the same change
 * that starts sending the token would risk locking out every real user
 * on any client/server mismatch, with zero observability into why.
 *
 * STAGE 2 (enforceIdentityStage2, below): implemented in this file, but
 * OFF BY DEFAULT — gated behind AUTH_ENFORCE_STAGE2=true. Turns a missing/
 * invalid token (non-demo caller) into a 401, and a verified token whose
 * email doesn't match the request's claimed email into a 403. Deliberately
 * NOT enabled yet: this Stage 1 telemetry only just started running in
 * production and hasn't been observed for even one full traffic cycle —
 * flipping to a hard block before that would risk locking out real users
 * on any client/session edge case the telemetry hasn't had a chance to
 * surface yet (token-refresh timing, multi-device sessions, etc). Enable
 * only after reviewing Stage 1's `[AUTH TELEMETRY][MW-P0-001]` logs and
 * confirming no unexpected mismatches for real (non-demo) users.
 */

import { createClient } from '@supabase/supabase-js';

// Same public project URL + publishable/anon key already hardcoded in
// public/js/00-config.js's getSupabaseClient() — an anon/publishable key
// is meant to be public (it can only do what Supabase's Row Level Security
// policies allow), so hardcoding the same values server-side here follows
// the exact convention already used for FIREBASE_API_KEY et al. in
// .env.example ("Server & Client Safe"). The env vars below let it be
// overridden without a code change if the project is ever rotated.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kpvteaqnjwkxkhenfqyu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IpA86ua5CkZ1UettBXR-tw_LUQFTyu0';

let _client = null;
function getServerSupabaseClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}

/**
 * Verifies the `Authorization: Bearer <token>` header on an Express
 * request against Supabase Auth, if present.
 *
 * Returns:
 *   { present: false }
 *     — no Authorization header at all (expected for guest/demo mode,
 *       and for any real caller until the client-side change in this
 *       same commit rolls out to that user's browser).
 *   { present: true, verified: false, error }
 *     — a token was sent but Supabase rejected it (expired, malformed,
 *       revoked).
 *   { present: true, verified: true, id, email }
 *     — a token was sent and Supabase confirms it belongs to this real,
 *       currently-valid session; `id` is the real Supabase auth UUID,
 *       `email` is that session's verified email.
 *
 * Never throws — a Supabase outage or network error degrades to
 * { present: true, verified: false, error }, exactly like an invalid
 * token, since Stage 1 never blocks on this result anyway.
 */
async function verifySupabaseSession(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return { present: false };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { present: false };

  try {
    const client = getServerSupabaseClient();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data || !data.user) {
      return { present: true, verified: false, error: (error && error.message) || 'No user returned for token' };
    }
    return { present: true, verified: true, id: data.user.id, email: data.user.email || null };
  } catch (err) {
    return { present: true, verified: false, error: err && err.message };
  }
}

/**
 * Stage 1 telemetry: logs (never blocks) when a request's claimed
 * identity doesn't line up with what its Supabase token actually proves.
 * `claimedEmail`/`claimedUid` are whatever the endpoint already derived
 * from body/query before this call — this function does not change that
 * derivation, it only observes it.
 */
async function logAuthMismatchTelemetry(req, claimedUid, claimedEmail, isDemo) {
  if (isDemo) return; // demo/guest mode never has a real session — nothing to check
  try {
    const result = await verifySupabaseSession(req);
    if (!result.present) {
      console.warn(`[AUTH TELEMETRY][MW-P0-001] ${req.method} ${req.path}: no Authorization token present for claimed uid=${claimedUid}. Expected once the client-side rollout of the matching change reaches this user's browser/cached session.`);
      return;
    }
    if (!result.verified) {
      console.warn(`[AUTH TELEMETRY][MW-P0-001] ${req.method} ${req.path}: token present but INVALID (${result.error}) for claimed uid=${claimedUid}.`);
      return;
    }
    if (claimedEmail && result.email && String(claimedEmail).toLowerCase() !== String(result.email).toLowerCase()) {
      console.warn(`[AUTH TELEMETRY][MW-P0-001] ${req.method} ${req.path}: MISMATCH — verified token belongs to "${result.email}" but request claims uid=${claimedUid} email=${claimedEmail}. Stage 1 does not block this; investigate before Stage 2 enforcement.`);
      return;
    }
    // Verified and consistent — nothing to log; avoids spamming logs on
    // every normal, correctly-authenticated request.
  } catch (err) {
    console.warn('[AUTH TELEMETRY] unexpected error during Stage 1 check:', err && err.message);
  }
}

// Stage 2 kill switch — string comparison on purpose (env vars are always
// strings; a bare truthy check on process.env.AUTH_ENFORCE_STAGE2 would
// treat the string "false" as enabled). Read once at module load, not per
// request — a deploy-time decision, not something that should change
// mid-process.
const STAGE2_ENFORCE = String(process.env.AUTH_ENFORCE_STAGE2 || '').toLowerCase() === 'true';

/**
 * Stage 2 (off by default — see STAGE2_ENFORCE above): actually rejects a
 * request whose Supabase session doesn't back up its claimed identity.
 * Call this AFTER logAuthMismatchTelemetry() so Stage 1's log line still
 * fires even when Stage 2 goes on to reject the same request (keeps the
 * telemetry trail continuous across the flip instead of the switch itself
 * silencing it).
 *
 * Returns `true` if it already sent a 401/403 response (caller must
 * `return` immediately without touching `res` again); `false` if the
 * request may proceed — either because Stage 2 is disabled, the caller is
 * demo/guest, or the session checks out.
 */
async function enforceIdentityStage2(req, res, claimedUid, claimedEmail, isDemo) {
  if (!STAGE2_ENFORCE) return false;
  if (isDemo) return false; // guest/demo mode never has a real session to check

  const result = await verifySupabaseSession(req);
  if (!result.present) {
    res.status(401).json({
      success: false,
      error: 'Sesi login tidak ditemukan. Silakan login ulang.',
      code: 'AUTH_TOKEN_MISSING'
    });
    return true;
  }
  if (!result.verified) {
    res.status(401).json({
      success: false,
      error: 'Sesi login tidak valid atau sudah kedaluwarsa. Silakan login ulang.',
      code: 'AUTH_TOKEN_INVALID'
    });
    return true;
  }
  if (claimedEmail && result.email && String(claimedEmail).toLowerCase() !== String(result.email).toLowerCase()) {
    res.status(403).json({
      success: false,
      error: 'Identitas pada permintaan ini tidak cocok dengan sesi login yang aktif.',
      code: 'AUTH_IDENTITY_MISMATCH'
    });
    return true;
  }
  return false;
}

export { verifySupabaseSession, logAuthMismatchTelemetry, enforceIdentityStage2, getServerSupabaseClient };
