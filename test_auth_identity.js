/** test_auth_identity.js — Stage 2 (AUTH_ENFORCE_STAGE2) harus memeriksa UID yang diklaim, bukan hanya email. */
import assert from 'assert';
process.env.AUTH_ENFORCE_STAGE2 = 'true';
const realFetch = globalThis.fetch;
const SESSIONS = { 'tok-alice': { id: '11111111-aaaa-bbbb-cccc-000000000001', email: 'Alice@Mail.com' } };
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/auth/v1/user')) {
    const tok = String((opts && opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '').replace(/^Bearer\s+/i, '');
    const u = SESSIONS[tok];
    return new Response(JSON.stringify(u ? { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' } : { message: 'invalid JWT' }), { status: u ? 200 : 401, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, opts);
};
const { claimedIdentityMatches, enforceIdentityStage2 } = await import('./lib/auth-verify.js');
const clientUid = (email) => 'u_' + encodeURIComponent(email.toLowerCase()).replace(/[^a-z0-9_]/g, '_');
let n = 0, total = 0;
const t = async (name, fn) => { total++; try { await fn(); console.log('  ✅ [PASS] ' + name); n++; } catch (e) { console.error('  ❌ [FAIL] ' + name + ': ' + e.message); process.exitCode = 1; } };
const run = async (token, uid, email) => {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { method: 'POST', path: '/api/user-data/clear', headers: token ? { authorization: 'Bearer ' + token } : {} };
  const blocked = await enforceIdentityStage2(req, res, uid, email, false);
  return { blocked, code: res.code, body: res.body };
};
const V = SESSIONS['tok-alice'];

await t('claimedIdentityMatches: uid format klien, email mentah, dan id Supabase cocok', () => {
  assert(claimedIdentityMatches(clientUid(V.email), V.email, V));
  assert(claimedIdentityMatches(clientUid(V.email), null, V), 'uid saja (tanpa email) milik sendiri harus lolos');
  assert(claimedIdentityMatches(V.id, null, V));
  assert(claimedIdentityMatches(null, 'ALICE@mail.com', V));
});
await t('claimedIdentityMatches: uid korban dengan token valid milik orang lain DITOLAK (celah lama: uid-only lolos)', () => {
  assert(!claimedIdentityMatches(clientUid('bob@mail.com'), null, V));
  assert(!claimedIdentityMatches(clientUid('bob@mail.com'), V.email, V), 'email sendiri + uid korban tetap ditolak');
  assert(!claimedIdentityMatches(null, null, V));
});
await t('enforce: tanpa token => 401; token tak valid => 401', async () => {
  const a = await run(null, clientUid(V.email), V.email);
  assert(a.blocked && a.code === 401 && a.body.code === 'AUTH_TOKEN_MISSING');
  const b = await run('tok-palsu', clientUid(V.email), V.email);
  assert(b.blocked && b.code === 401 && b.body.code === 'AUTH_TOKEN_INVALID');
});
await t('enforce: pemilik sah lolos (uid-only maupun uid+email)', async () => {
  assert.strictEqual((await run('tok-alice', clientUid(V.email), null)).blocked, false);
  assert.strictEqual((await run('tok-alice', clientUid(V.email), V.email)).blocked, false);
});
await t('enforce: token Alice + uid Bob (tanpa email) => 403 AUTH_IDENTITY_MISMATCH', async () => {
  const r = await run('tok-alice', clientUid('bob@mail.com'), undefined);
  assert(r.blocked && r.code === 403 && r.body.code === 'AUTH_IDENTITY_MISMATCH');
});
await t('enforce: demo/guest tidak diperiksa', async () => {
  const res = { status() { return this; }, json() { return this; } };
  assert.strictEqual(await enforceIdentityStage2({ headers: {} }, res, 'demo_guest_user', '', true), false);
});
globalThis.fetch = realFetch;
console.log(n === total ? `🎉 ALL ${n}/${total} AUTH IDENTITY TESTS PASSED` : `⚠️ ${n}/${total}`);
