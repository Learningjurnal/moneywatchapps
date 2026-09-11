/**
 * lib/gemini-quota.js — Gemini API usage counter (observability only, never
 * blocks a call)
 *
 * WHY THIS EXISTS: server.js's callGeminiWithRetryAndFallback() tries up to
 * 5 model IDs (see GEMINI_FALLBACK_MODELS below) and already retries/falls
 * back reactively on 429/RESOURCE_EXHAUSTED — but until this file, there
 * was ZERO visibility into how close any of those models actually are to
 * Google's free-tier daily/per-minute request caps. The first sign of a
 * problem was always a live 429 in production, with no "you're at 1,400/
 * 1,500 requests today" warning beforehand. Added per user request after
 * observing the same gap already existed (and was already fixed) for
 * Invezgo (lib/invezgo-client.js) — this file mirrors that one's Redis/
 * in-memory-fallback pattern, kept as a separate, independent module
 * (no shared state with Invezgo's quota) since the two are unrelated APIs.
 *
 * IMPORTANT — THIS FILE NEVER BLOCKS A GEMINI CALL. Google's own API
 * already enforces the real limit and already returns 429/RESOURCE_EXHAUSTED
 * when exceeded (server.js already handles that reactively). The exact
 * free-tier RPD/RPM numbers per model are NOT hardcoded here — they change
 * over time and depend on which Gemini plan/project this API key is on;
 * inventing a number and using it to REFUSE a call that Google would have
 * allowed would make the app fail earlier and more often than the real
 * limit requires. Configure real limits via GEMINI_RPD_LIMITS (JSON env
 * var, e.g. '{"gemini-3.6-flash":1500}') after checking the actual
 * per-model quota in Google AI Studio — until set, usagePct/alert flags
 * are simply omitted (limit: null) rather than guessed.
 *
 * Same serverless-safety note as invezgo-client.js: this app runs on
 * Vercel serverless, so counters live in Upstash Redis (shared across
 * instances/cold starts) when configured, degrading to an unsafe
 * in-process Map for local dev only.
 */

import { Redis } from '@upstash/redis';

// The exact model list callGeminiWithRetryAndFallback() (server.js) tries,
// in order. Defined here (not duplicated in server.js) so the quota status
// endpoint and the actual call path can never drift apart.
const GEMINI_FALLBACK_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite'
].filter((v, idx, arr) => arr.indexOf(v) === idx);

let _memoryStore = null;
let _warnedNoRedis = false;

const _redisClient = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

function getRedis() {
  if (_redisClient) return _redisClient;
  if (!_warnedNoRedis) {
    _warnedNoRedis = true;
    console.warn('[gemini-quota] UPSTASH_REDIS_REST_URL/TOKEN tidak diset — counter Gemini memakai in-memory fallback (TIDAK konsisten lintas instance/cold start di serverless, hanya untuk dev lokal).');
  }
  if (!_memoryStore) _memoryStore = new Map();
  return null;
}

async function memGet(key) {
  const rec = _memoryStore.get(key);
  if (!rec) return null;
  if (rec.expiresAt && rec.expiresAt < Date.now()) { _memoryStore.delete(key); return null; }
  return rec.value;
}
async function memIncr(key, ttlSec) {
  const cur = Number((await memGet(key)) || 0);
  const next = cur + 1;
  _memoryStore.set(key, { value: next, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
  return next;
}

async function storeGet(key) {
  const redis = getRedis();
  if (redis) return redis.get(key);
  return memGet(key);
}
// Increments key, setting its TTL only on first creation (so repeated
// increments within the window don't keep pushing the expiry back).
async function storeIncrWithTtl(key, ttlSec) {
  const redis = getRedis();
  if (redis) {
    const val = await redis.incr(key);
    if (val === 1) await redis.expire(key, ttlSec);
    return val;
  }
  return memIncr(key, ttlSec);
}

function utcDateStr(d) { return d.toISOString().slice(0, 10); }
function utcMinuteStr(d) { return `${utcDateStr(d)}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }

// ── Configured limits (operator-supplied, never guessed) ───────────────
// GEMINI_RPD_LIMITS: JSON object mapping model id -> requests/day cap, e.g.
//   {"gemini-3.6-flash":1500,"gemini-flash-latest":1500,"gemini-3.1-flash-lite":1000}
// A model not present in the map (or the var unset/unparseable) reports
// limit:null — "belum dikonfigurasi", not zero and not a guessed default.
function getConfiguredLimits() {
  const raw = process.env.GEMINI_RPD_LIMITS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    console.warn('[gemini-quota] GEMINI_RPD_LIMITS tidak valid JSON, diabaikan:', err.message);
    return {};
  }
}

const QUOTA_WARN_80 = 0.8;
const QUOTA_WARN_90 = 0.9;

/**
 * Records one Gemini API call attempt (call BEFORE ai.models.generateContent,
 * same spot server.js already has a try/catch around). Fire-and-forget —
 * must never throw or delay the real Gemini call on a Redis hiccup.
 */
async function recordGeminiAttempt(model) {
  try {
    const now = new Date();
    await storeIncrWithTtl(`gemini:rpd:${model}:${utcDateStr(now)}`, 60 * 60 * 26); // a bit over 1 day
    await storeIncrWithTtl(`gemini:rpm:${model}:${utcMinuteStr(now)}`, 70); // a bit over 1 minute
  } catch (err) {
    console.warn('[gemini-quota] recordGeminiAttempt gagal (diabaikan, tidak menghambat panggilan Gemini):', err.message);
  }
}

/**
 * Records the outcome of a Gemini call (success / rate_limited / error),
 * aggregated across all models, per UTC day — mirrors invezgo-client.js's
 * recordMetric() pattern. Call AFTER the attempt resolves/rejects.
 */
async function recordGeminiOutcome(outcome) {
  try {
    const day = utcDateStr(new Date());
    const name = outcome === 'success' ? 'gemini_success_total'
      : outcome === 'rate_limited' ? 'gemini_rate_limited_total'
      : 'gemini_error_total';
    await storeIncrWithTtl(`gemini:metric:${name}:${day}`, 60 * 60 * 26);
  } catch (err) {
    console.warn('[gemini-quota] recordGeminiOutcome gagal (diabaikan):', err.message);
  }
}

/**
 * Full status snapshot for every model in GEMINI_FALLBACK_MODELS, plus
 * today's aggregate outcome counters. Never throws — a Redis failure
 * degrades to zeroed/unknown counters rather than breaking the status
 * endpoint (this is observability, it must not become its own incident).
 */
async function getGeminiQuotaStatus() {
  const limits = getConfiguredLimits();
  const now = new Date();
  const day = utcDateStr(now);
  const minute = utcMinuteStr(now);

  const models = await Promise.all(GEMINI_FALLBACK_MODELS.map(async (model) => {
    let usedToday = 0;
    let usedThisMinute = 0;
    try {
      usedToday = Number((await storeGet(`gemini:rpd:${model}:${day}`)) || 0);
      usedThisMinute = Number((await storeGet(`gemini:rpm:${model}:${minute}`)) || 0);
    } catch (_) { /* degrade to 0 rather than fail the whole endpoint */ }

    const limit = (typeof limits[model] === 'number' && limits[model] > 0) ? limits[model] : null;
    const pct = limit ? usedToday / limit : null;
    return {
      model,
      usedToday,
      usedThisMinute,
      dailyLimit: limit,
      remaining: limit !== null ? Math.max(0, limit - usedToday) : null,
      usagePct: pct !== null ? Math.round(pct * 1000) / 10 : null,
      alert80: pct !== null && pct >= QUOTA_WARN_80,
      alert90: pct !== null && pct >= QUOTA_WARN_90,
      limitConfigured: limit !== null
    };
  }));

  let outcomesToday = { gemini_success_total: 0, gemini_rate_limited_total: 0, gemini_error_total: 0 };
  try {
    const entries = await Promise.all(Object.keys(outcomesToday).map(async (name) => [name, Number((await storeGet(`gemini:metric:${name}:${day}`)) || 0)]));
    outcomesToday = Object.fromEntries(entries);
  } catch (_) { /* degrade to zeros */ }

  return {
    models,
    today: outcomesToday,
    anyLimitConfigured: models.some(m => m.limitConfigured),
    updatedAt: now.toISOString()
  };
}

export { GEMINI_FALLBACK_MODELS, recordGeminiAttempt, recordGeminiOutcome, getGeminiQuotaStatus };
