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
 * STAGE 2 (enforceIdentityStage2, below): the real enforcement. Turns a
 * missing/invalid token (non-demo caller) into a 401, and a verified token
 * that doesn't own the claimed identity into a 403.
 *
 * AUDIT 2026-11-04 (SEC-02, P1): Stage 2 used to be OFF BY DEFAULT behind
 * AUTH_ENFORCE_STAGE2=true, which meant a fresh production deploy answered
 * `GET /api/user-data/load?uid=<another user>` with that user's full
 * portfolio and no login at all (AGENTS.md §25 makes P0/P1 security
 * findings release-blocking). It is now ON BY DEFAULT whenever this process
 * looks like production (`VERCEL`, or `NODE_ENV=production`) and off for
 * local development only, so a dev browser session that has not picked up
 * the client-side `_authHeaders()` rollout keeps working. AUTH_ENFORCE_STAGE2
 * still overrides the default in both directions: "false" keeps production
 * telemetry-only while debugging a rollout problem, "true" enforces locally.
 * See isStage2Enforced() below.
 *
 * TRANSIENT FAILURES (same audit, SEC-02): a Supabase network/backend
 * outage used to be folded into "token invalid" — a 401 telling a real user
 * their session is bad when it actually isn't. Verification results now
 * carry `transient: true` for outages, and enforcement answers
 * 503 AUTH_VERIFICATION_UNAVAILABLE. It is never a silent allow: when we
 * cannot verify, we refuse to serve/attach the request.
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
 * Classifies a Supabase `getUser()` failure as "the auth backend is
 * unreachable / degraded" (transient) rather than "this token is bad"
 * (permanent). Only the former may be reported as a 503 — telling a real
 * user their session is invalid during a Supabase outage is exactly the
 * misleading behavior SEC-02 called out.
 *
 * Thrown errors are transient by construction (see verifySupabaseToken's
 * catch block); for the non-throwing `{ data, error }` path we rely on the
 * error's HTTP status: 0/5xx = backend unavailable, anything else (e.g.
 * 401/403 "invalid JWT") = the token really is bad.
 */
function isTransientAuthFailure(error) {
  if (!error) return false;
  const status = Number(error.status);
  if (Number.isFinite(status) && (status === 0 || status >= 500)) return true;
  const name = String(error.name || '');
  if (name === 'AuthRetryableFetchError' || name === 'AuthRetryableError') return true;
  return false;
}

/**
 * Verifies a raw Supabase access token (JWT) against Supabase Auth.
 *
 * Returns:
 *   { present: false }
 *     — no token supplied.
 *   { present: true, verified: false, error }
 *     — Supabase rejected the token (expired, malformed, revoked).
 *   { present: true, verified: false, error, transient: true }
 *     — verification could not be completed (network/backend outage). The
 *       caller must NOT treat this as "invalid token"; enforcement maps it
 *       to 503 AUTH_VERIFICATION_UNAVAILABLE.
 *   { present: true, verified: true, id, email }
 *     — a real, currently-valid session; `id` is the Supabase auth UUID,
 *       `email` is that session's verified email.
 *
 * Never throws — a Supabase outage or network error degrades to a
 * `transient: true` result instead of propagating.
 */
async function verifySupabaseToken(token) {
  const rawToken = String(token == null ? '' : token).trim();
  if (!rawToken) return { present: false };

  try {
    const client = getServerSupabaseClient();
    const { data, error } = await client.auth.getUser(rawToken);
    if (error || !data || !data.user) {
      const result = {
        present: true,
        verified: false,
        error: (error && error.message) || 'No user returned for token'
      };
      if (isTransientAuthFailure(error)) result.transient = true;
      return result;
    }
    return { present: true, verified: true, id: data.user.id, email: data.user.email || null };
  } catch (err) {
    return { present: true, verified: false, transient: true, error: err && err.message };
  }
}

/**
 * Verifies the `Authorization: Bearer <token>` header on an Express
 * request against Supabase Auth, if present. Thin header-parsing wrapper
 * around verifySupabaseToken() — use that directly for non-header token
 * sources (e.g. the SSE stream's `?token=` query parameter, since
 * EventSource cannot set request headers).
 *
 * Returns the same shape as verifySupabaseToken(), plus { present: false }
 * when no Bearer header is present at all (expected for guest/demo mode).
 */
async function verifySupabaseSession(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return { present: false };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { present: false };
  return verifySupabaseToken(token);
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
      if (result.transient) {
        console.warn(`[AUTH TELEMETRY][MW-P0-001] ${req.method} ${req.path}: verification UNAVAILABLE (transient Supabase error: ${result.error}) for claimed uid=${claimedUid}. Not a token problem — Stage 2 answers this with 503, not 401.`);
        return;
      }
      console.warn(`[AUTH TELEMETRY][MW-P0-001] ${req.method} ${req.path}: token present but INVALID (${result.error}) for claimed uid=${claimedUid}.`);
      return;
    }
    if (!claimedIdentityMatches(claimedUid, claimedEmail, result)) {
      console.warn(`[AUTH TELEMETRY][MW-P0-001] ${req.method} ${req.path}: MISMATCH — verified token belongs to "${result.email}" but request claims uid=${claimedUid} email=${claimedEmail}. Stage 1 does not block this; investigate before Stage 2 enforcement.`);
      return;
    }
    // Verified and consistent — nothing to log; avoids spamming logs on
    // every normal, correctly-authenticated request.
  } catch (err) {
    console.warn('[AUTH TELEMETRY] unexpected error during Stage 1 check:', err && err.message);
  }
}

// AUDIT 2026-10-04: pengecekan Stage 2 lama hanya membandingkan EMAIL yang diklaim — padahal rute /clear, /load
// kadang hanya mengirim uid (tanpa email), sehingga token valid milik siapa pun lolos untuk uid korban. Kini UID yang
// diklaim juga wajib cocok dengan identitas yang diverifikasi. Format uid klien: 'u_' + encodeURIComponent(email),
// atau id Supabase, atau email mentah; server menyimpan dengan normalisasi huruf kecil + [^a-z0-9_] -> '_'.
function normalizeIdentityKey(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_40/g, '_');
}
function verifiedIdentityKeys(verified) {
  const keys = new Set();
  if (verified && verified.email) {
    const email = String(verified.email).toLowerCase();
    keys.add(normalizeIdentityKey(email));
    keys.add(normalizeIdentityKey('u_' + encodeURIComponent(email)));
  }
  if (verified && verified.id) keys.add(normalizeIdentityKey(verified.id));
  return keys;
}
/** true bila SEMUA identitas yang diklaim (uid dan/atau email) cocok dengan sesi terverifikasi; minimal satu harus ada. */
function claimedIdentityMatches(claimedUid, claimedEmail, verified) {
  const keys = verifiedIdentityKeys(verified);
  const hasUid = !!(claimedUid && String(claimedUid).trim());
  const hasEmail = !!(claimedEmail && String(claimedEmail).trim());
  if (!hasUid && !hasEmail) return false;
  if (hasUid && !keys.has(normalizeIdentityKey(claimedUid))) return false;
  if (hasEmail && !(verified && verified.email && String(claimedEmail).trim().toLowerCase() === String(verified.email).toLowerCase())) return false;
  return true;
}

// Stage 2 kill switch — string comparison on purpose (env vars are always
// strings; a bare truthy check on process.env.AUTH_ENFORCE_STAGE2 would
// treat the string "false" as enabled). Read once at module load, not per
// request — a deploy-time decision, not something that should change
// mid-process.
//
// AUDIT 2026-11-04 (SEC-02): DEFAULT CHANGED from OFF to ON in production.
// The old default ('' -> false) meant a production deploy served other
// users' mirror data to an unauthenticated caller unless an operator
// remembered to set the flag (AGENTS.md §25: auth/authorization verified is
// release-blocking). Local dev without VERCEL/NODE_ENV=production keeps the
// old open behavior so existing browser sessions on a dev machine (which may
// still be running a cached client build without `_authHeaders()`) are not
// locked out. The env var itself always wins when explicitly set, so an
// operator can still run production telemetry-only ("false") while
// investigating a rollout problem, or enforce locally ("true").
const STAGE2_ENFORCE = String(
  process.env.AUTH_ENFORCE_STAGE2 ??
    ((process.env.VERCEL || process.env.NODE_ENV === 'production') ? 'true' : 'false')
).toLowerCase() === 'true';

/** true bila penegakan Stage 2 aktif di proses ini (lihat STAGE2_ENFORCE di atas). */
function isStage2Enforced() {
  return STAGE2_ENFORCE;
}

/**
 * Stage 2 enforcement (ON by default in production — see STAGE2_ENFORCE
 * above): actually rejects a request whose Supabase session doesn't back up
 * its claimed identity.
 * Call this AFTER logAuthMismatchTelemetry() so Stage 1's log line still
 * fires even when Stage 2 goes on to reject the same request (keeps the
 * telemetry trail continuous across the flip instead of the switch itself
 * silencing it).
 *
 * Returns `true` if it already sent a 401/403/503 response (caller must
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
  if (result.transient) {
    // SEC-02: verification backend unreachable — fail closed with a
    // distinct, retryable status instead of pretending the token is bad.
    res.status(503).json({
      success: false,
      error: 'Layanan verifikasi sesi sedang tidak tersedia. Coba lagi sebentar lagi.',
      code: 'AUTH_VERIFICATION_UNAVAILABLE',
      retryable: true
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
  if (!claimedIdentityMatches(claimedUid, claimedEmail, result)) {
    res.status(403).json({
      success: false,
      error: 'Identitas pada permintaan ini tidak cocok dengan sesi login yang aktif.',
      code: 'AUTH_IDENTITY_MISMATCH'
    });
    return true;
  }
  return false;
}

export { claimedIdentityMatches, normalizeIdentityKey, verifySupabaseToken, verifySupabaseSession, logAuthMismatchTelemetry, enforceIdentityStage2, isStage2Enforced, getServerSupabaseClient };
