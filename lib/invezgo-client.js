/**
 * lib/invezgo-client.js
 * Invezgo API access layer — shared quota manager, cache, concurrency
 * limiter and retry/backoff, sitting BETWEEN idx-data-engine.js and the raw
 * Invezgo HTTP endpoint.
 *
 * WHY THIS FILE EXISTS (deployment context):
 * This app runs as a Vercel serverless function (vercel.json → api/index.js).
 * Every request can land on a fresh cold-start instance, and concurrent
 * requests can run on separate instances simultaneously. A quota counter or
 * cache kept in a plain in-process object (as idx-data-engine.js already
 * does for quotes/universe data) is NOT safe for Invezgo: the whole
 * "Advance plan, 30,000 requests/month, 250 req/min" budget can only be
 * enforced if the counter is shared across instances — otherwise usage is
 * silently undercounted and the account can be rate-limited or suspended
 * without any of the observability this module is meant to provide.
 *
 * So quota + cache state here live in Upstash Redis (REST API, works from
 * any serverless runtime, no persistent TCP connection needed). If Redis
 * env vars are not configured, this module degrades to an in-process Map —
 * clearly logged as NOT SAFE for production quota enforcement, useful only
 * for local dev without an Upstash account.
 *
 * Canonical data-quality contract (per audit doc
 * MoneyWatchPro_Invezgo_Integration_Audit_v1): every payload leaving this
 * module carries status REAL|STALE|UNAVAILABLE|SIMULATION|INVALID plus
 * source/provider/retrievedAt/dataTimestamp/freshnessSeconds/requestId.
 * Never invents price/volume/broker/foreign-flow/order-book values.
 */

import crypto from 'crypto';
import { Redis } from '@upstash/redis';

// ── Redis (Upstash REST) — lazy singleton, with an explicit in-memory ──
// fallback for local dev only. The fallback is NOT safe for production
// quota enforcement on serverless (counters don't survive cold starts and
// aren't shared across concurrent instances) — it exists purely so the app
// doesn't crash before an Upstash account is provisioned.
let _memoryStore = null;
let _warnedNoRedis = false;

const _redisClient = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

function getRedis() {
  if (_redisClient) return _redisClient;
  if (!_warnedNoRedis) {
    _warnedNoRedis = true;
    console.warn('[invezgo-client] UPSTASH_REDIS_REST_URL/TOKEN tidak diset — quota manager & cache Invezgo memakai in-memory fallback (TIDAK aman untuk production di serverless: counter tidak konsisten lintas instance/cold start). Set kedua env var ini sebelum production_trading dianggap READY.');
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
async function memSet(key, value, ttlSec) {
  _memoryStore.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
}
async function memIncr(key) {
  const cur = (await memGet(key)) || 0;
  const next = cur + 1;
  await memSet(key, next, null);
  return next;
}

async function storeGet(key) {
  const redis = getRedis();
  if (redis) return redis.get(key);
  return memGet(key);
}
async function storeSetEx(key, value, ttlSec) {
  const redis = getRedis();
  if (redis) return redis.set(key, value, { ex: ttlSec });
  return memSet(key, value, ttlSec);
}
async function storeIncr(key) {
  const redis = getRedis();
  if (redis) return redis.incr(key);
  return memIncr(key);
}

// ── Quota manager ───────────────────────────────────────────────────────
// Budget per audit doc: 30,000 requests/month on the Invezgo Advance plan.
// Counter key rolls over automatically by calendar month (UTC).
const MONTHLY_QUOTA = Number(process.env.INVEZGO_MONTHLY_QUOTA || 30000);
const QUOTA_WARN_80 = 0.8;
const QUOTA_WARN_90 = 0.9;

function currentMonthKey() {
  const d = new Date();
  return `invezgo:quota:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getQuotaUsage() {
  const key = currentMonthKey();
  const used = Number((await storeGet(key)) || 0);
  return { used, quota: MONTHLY_QUOTA, remaining: Math.max(0, MONTHLY_QUOTA - used), pct: MONTHLY_QUOTA > 0 ? used / MONTHLY_QUOTA : 0 };
}

// Reserves one unit of quota BEFORE making the HTTP call. Returns
// {allowed, usage}. When the budget is exhausted, callers must not call
// Invezgo — surface UNAVAILABLE (never fabricate) instead.
async function reserveQuota() {
  const key = currentMonthKey();
  const usage = await getQuotaUsage();
  if (usage.used >= MONTHLY_QUOTA) {
    return { allowed: false, usage };
  }
  const used = await storeIncr(key);
  // TTL not strictly required (key naturally rolls over by name each
  // month) but set a generous expiry so stale monthly keys don't linger
  // forever in Redis.
  try { const redis = getRedis(); if (redis) await redis.expire(key, 60 * 60 * 24 * 40); } catch (_) {}
  await recordMetric('invezgo_requests_total');
  if (used / MONTHLY_QUOTA >= QUOTA_WARN_90) await recordMetric('quota_alert_90');
  else if (used / MONTHLY_QUOTA >= QUOTA_WARN_80) await recordMetric('quota_alert_80');
  return { allowed: true, usage: { used, quota: MONTHLY_QUOTA, remaining: Math.max(0, MONTHLY_QUOTA - used), pct: used / MONTHLY_QUOTA } };
}

// ── Metrics (lightweight counters, per audit `observability.metrics`) ──
async function recordMetric(name) {
  try {
    const key = `invezgo:metric:${name}:${new Date().toISOString().slice(0, 10)}`;
    await storeIncr(key);
  } catch (_) { /* metrics must never break the request path */ }
}

async function getMetricsToday() {
  const day = new Date().toISOString().slice(0, 10);
  const names = ['invezgo_requests_total', 'invezgo_success_total', 'invezgo_error_total', 'invezgo_429_total', 'cache_hits', 'cache_misses', 'simulation_blocked'];
  const out = {};
  for (const n of names) out[n] = Number((await storeGet(`invezgo:metric:${n}:${day}`)) || 0);
  return out;
}

// ── Cache (with request coalescing per-instance) ───────────────────────
const _inFlight = new Map(); // per-instance dedup for concurrent identical requests

function cacheKey(endpoint, params) {
  const sorted = Object.keys(params || {}).sort().map(k => `${k}=${params[k]}`).join('&');
  return `invezgo:cache:${endpoint}:${sorted}`;
}

/**
 * getOrFetch — cache-first with request coalescing + quota gate.
 * `fetcher` is only invoked on a real cache miss, and only after a quota
 * unit is successfully reserved. Never caches a non-REAL result (per audit
 * rule: "Cache only valid real responses").
 */
async function getOrFetch(endpoint, params, ttlSec, fetcher) {
  const key = cacheKey(endpoint, params);

  const cached = await storeGet(key);
  if (cached) {
    await recordMetric('cache_hits');
    return { ...cached, _cacheHit: true };
  }
  await recordMetric('cache_misses');

  if (_inFlight.has(key)) return _inFlight.get(key);

  const promise = (async () => {
    try {
      const reservation = await reserveQuota();
      if (!reservation.allowed) {
        return {
          status: 'UNAVAILABLE',
          reason: 'QUOTA_EXHAUSTED',
          source: 'invezgo_quota_guard',
          provider: 'Invezgo',
          retrievedAt: new Date().toISOString(),
          dataTimestamp: null,
          freshnessSeconds: null,
          requestId: null,
          quota: reservation.usage
        };
      }
      const result = await fetcher();
      if (result && result.status === 'REAL') {
        await storeSetEx(key, result, ttlSec);
        await recordMetric('invezgo_success_total');
      } else if (result && result.status === 'INVALID') {
        await recordMetric('invezgo_error_total');
      }
      return result;
    } finally {
      _inFlight.delete(key);
    }
  })();

  _inFlight.set(key, promise);
  return promise;
}

// ── Concurrency limiter (per audit rate_limiting.client.max_concurrency=5) ──
let _activeRequests = 0;
const _waitQueue = [];
const MAX_CONCURRENCY = Number(process.env.INVEZGO_MAX_CONCURRENCY || 5);

function acquireSlot() {
  if (_activeRequests < MAX_CONCURRENCY) {
    _activeRequests++;
    return Promise.resolve();
  }
  return new Promise(resolve => _waitQueue.push(resolve));
}
function releaseSlot() {
  const next = _waitQueue.shift();
  if (next) next();
  else _activeRequests = Math.max(0, _activeRequests - 1);
}

// ── HTTP with retry/backoff (429/502/503/504, exponential + jitter, ──
// respects Retry-After per audit rate_limiting.client) ──
const RETRY_CODES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = Number(process.env.INVEZGO_MAX_RETRIES || 3);

async function invezgoFetch(url, options = {}) {
  await acquireSlot();
  try {
    let lastResp = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(url, options);
      lastResp = resp;
      if (resp.status === 429) await recordMetric('invezgo_429_total');
      if (!RETRY_CODES.has(resp.status) || attempt === MAX_RETRIES) return resp;

      const retryAfterHeader = resp.headers.get('retry-after');
      let delayMs;
      if (retryAfterHeader) {
        const asSeconds = Number(retryAfterHeader);
        delayMs = Number.isFinite(asSeconds) ? asSeconds * 1000 : 1000;
      } else {
        const base = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s
        const jitter = Math.random() * base * 0.3;
        delayMs = base + jitter;
      }
      await new Promise(r => setTimeout(r, Math.min(delayMs, 15000)));
    }
    return lastResp;
  } finally {
    releaseSlot();
  }
}

// ── Canonical envelope builder ──────────────────────────────────────────
function makeRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

function freshnessSecondsFrom(dataTimestamp) {
  if (!dataTimestamp) return null;
  const t = new Date(dataTimestamp).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

export {
  getRedis,
  getQuotaUsage,
  reserveQuota,
  recordMetric,
  getMetricsToday,
  getOrFetch,
  invezgoFetch,
  makeRequestId,
  freshnessSecondsFrom,
  MONTHLY_QUOTA,
  MAX_CONCURRENCY
};
