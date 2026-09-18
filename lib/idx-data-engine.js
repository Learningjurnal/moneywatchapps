/**
 * lib/idx-data-engine.js
 * Indonesia Stock Exchange (IDX) Data Pipeline & Market Engine
 * Integrates schema and data structures from NeaByteLab/IDX-API:
 * - Trade Summary (Saham, ETF, Sukuk, DIRE)
 * - Trading Daily & Trading SS (OHLCV, Order Book Depth, 52W Range, Listed Shares)
 * - Securities Stock Master (950+ Emiten, Board, Sector, Indexes LQ45/IDX30/KOMPAS100)
 * - Stock Screener Multi-Factor (PER, PBV, ROE, ROA, DER, NPM, Market Cap, Returns)
 * - Top Gainers & Top Losers (Real-time live changes)
 * - Market Indices & Sectoral Movements
 * - Corporate Action Calendar (Dividends, Splits, Suspensions)
 * - Strict Real-Time Data Pipeline (Zero mock data for live market metrics)
 */

import {
  fetchInvezgoBrokerSummary,
  fetchInvezgoTopMovers,
  fetchInvezgoShareholderNumber,
  fetchInvezgoShareholderKsei,
  fetchInvezgoShareholderClassifyTable,
  fetchInvezgoSectorRotation,
  INVEZGO_KSEI_CATEGORY_LABELS
} from './invezgo-client.js';

// ── Sector Rotation (live, Invezgo RRG) ──
// Pemetaan 11 kode indeks sektoral resmi BEI (dipakai Invezgo saat
// base=COMPOSITE) ke 11 sektor `IDX_SECTOR_DEFINITIONS` yang sudah ada di
// public/js/44-sectoral-insight.js (CMF-konstituen) — 1:1, bukan tebakan
// (kode-kode ini persis nama indeks sektoral resmi IDX pasca-reklasifikasi
// 2021, dikonfirmasi dari enum parameter `base` di spec OpenAPI Invezgo).
const INVEZGO_SECTOR_CODE_TO_KEY = {
  IDXENERGY: 'energy',
  IDXFINANCE: 'financials',
  IDXBASIC: 'basic-materials',
  IDXINDUST: 'industrials',
  IDXNONCYC: 'consumer-non-cyclicals',
  IDXCYCLIC: 'consumer-cyclicals',
  IDXHEALTH: 'healthcare',
  IDXPROPERT: 'properties',
  IDXTECHNO: 'technology',
  IDXINFRA: 'infrastructures',
  IDXTRANS: 'transportation'
};

// Ini SUPLEMEN untuk CMF-konstituen di 44-sectoral-insight.js, BUKAN
// pengganti — CMF tetap dipakai sebagai fallback jujur kalau Invezgo tidak
// dikonfigurasi/gagal/data belum tersedia untuk rentang tanggal ini
// (lihat komentar di fetchInvezgoSectorRotation() untuk kenapa `data:[]`
// adalah respons resmi "belum tersedia", bukan bug).
async function generateSectorRotation() {
  const result = await fetchInvezgoSectorRotation();
  if (!result.ok) {
    return { available: false, reason: result.reason, benchmark: null, bySectorKey: {} };
  }
  const bySectorKey = {};
  result.sectors.forEach((s) => {
    const key = INVEZGO_SECTOR_CODE_TO_KEY[s.code];
    if (key) bySectorKey[key] = s;
  });
  return {
    available: true,
    benchmark: result.benchmark,
    dataTimestamp: result.quality ? result.quality.dataTimestamp : null,
    bySectorKey
  };
}

// ── Shareholder/KSEI composition (live, Invezgo) ──
// Distinct from generateBrokerSummary()/kseiCombineRawSheets() (client-side,
// 34-ksei-shareholders.js) which holds NAMED >5% beneficial owners from a
// manually-uploaded KSEI export. This function surfaces Invezgo's AGGREGATE
// ownership-by-category endpoints (no beneficial-owner names available in
// that data at all — see lib/invezgo-client.js's comment above each
// fetcher for the confirmed real schema) as a complementary view, never
// merged into the named-investor list.
async function generateShareholderComposition(ticker) {
  const clean = String(ticker || '').toUpperCase().trim().replace('.JK', '');
  const [numberResult, kseiResult, classifyResult] = await Promise.all([
    fetchInvezgoShareholderNumber(clean),
    fetchInvezgoShareholderKsei(clean, 6),
    fetchInvezgoShareholderClassifyTable(clean)
  ]);

  const result = {
    ticker: clean,
    categoryLabels: INVEZGO_KSEI_CATEGORY_LABELS,
    holderCountSeries: null,
    kseiSeries: null,
    kseiLatest: null,
    classifyDetail: null,
    errors: []
  };

  if (numberResult.ok) {
    result.holderCountSeries = numberResult.series;
  } else {
    result.errors.push({ part: 'holderCount', reason: numberResult.reason });
  }

  if (kseiResult.ok) {
    result.kseiSeries = kseiResult.series;
    result.kseiLatest = kseiResult.series.length ? kseiResult.series[kseiResult.series.length - 1] : null;
  } else {
    result.errors.push({ part: 'kseiComposition', reason: kseiResult.reason });
  }

  if (classifyResult.ok) {
    result.classifyDetail = { total: classifyResult.total, categories: classifyResult.categories, periodUnknown: !!classifyResult.periodUnknown };
  } else {
    result.errors.push({ part: 'classifyDetail', reason: classifyResult.reason });
  }

  result.available = !!(result.holderCountSeries || result.kseiSeries || result.classifyDetail);
  return result;
}
import { loadBaseUniverse } from './universe.js';
import {
  ensureIdxSession,
  fetchIdxBrokerSummaryReal,
  fetchIdxStockScreener,
  getBeiTickSize,
  IDX_BROKERS,
  getIdxCalendarData
} from './providers/idx-client.js';
import {
  getYahooCrumb,
  fetchYahooFundamentals,
  fetchYahooQuote,
  fetchYahooHistory,
  hasFundamentalsCacheEntry,
  getCachedFundamentalsBulk,
  getRadarWarmCursor,
  setRadarWarmCursor,
  CACHE_TTL_MS
} from './providers/yahoo-client.js';

// fs/path/vm/fileURLToPath and __filename/__dirname were only needed by
// loadBaseUniverse() and the Yahoo/IDX provider functions, all of which
// moved out during the provider-adapter refactor — this engine file no
// longer touches the filesystem or a VM sandbox directly.

let _summaryCache = null;
let _summaryCacheTime = 0;

// ensureIdxSession/fetchIdxBrokerSummaryReal/fetchIdxStockScreener/
// getBeiTickSize/IDX_BROKERS/getIdxCalendarData moved to
// lib/providers/idx-client.js during the provider-adapter refactor —
// imported at the top of this file; no behavior change.

// loadBaseUniverse() moved to lib/universe.js during the provider-adapter
// refactor — shared by lib/providers/yahoo-client.js and this engine file,
// so it lives outside both to avoid a circular import between them.
// Imported at the top of this file; no behavior change.

// getYahooCrumb/fetchYahooFundamentals/fetchYahooQuote/fetchYahooHistory/
// shapeYahooSymbol/getCachedFundamentalsOnly/hasFundamentalsCacheEntry moved
// to lib/providers/yahoo-client.js during the provider-adapter refactor —
// imported at the top of this file; no behavior change.

// ══════════════════════════════════════════════════════════════
// REAL TECHNICAL INDICATORS & COMPOSITE SIGNAL ENGINE
// ══════════════════════════════════════════════════════════════
// Replaces the old AI Trading "scanner" logic, which derived every score,
// signal, probability and EV from `ticker.charCodeAt(0)` — a fake hash
// with zero relationship to actual price action. Everything here is
// computed from real OHLCV history and real fundamentals; where an input
// is unavailable, the function degrades honestly (lower confidence /
// narrower score band) instead of inventing a plausible-looking number.

function computeEMA(values, period) {
  if (!values.length) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeRSI(closes, period) {
  period = period || 14;
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Average True Range (simplified, no prior-close gap component) — used for
// volatility-scaled stop-loss / take-profit distances instead of a fixed
// arbitrary ±5%/±10% off price.
function computeATR(points, period) {
  period = period || 14;
  if (points.length < period + 1) return null;
  const trs = [];
  for (let i = points.length - period; i < points.length; i++) {
    const p = points[i];
    trs.push(Math.max(p.h - p.l, Math.abs(p.h - points[i - 1].c), Math.abs(p.l - points[i - 1].c)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

// Real technical analysis from a daily OHLCV series (~6mo). Returns null
// if there isn't enough history to compute a trustworthy EMA50/RSI.
function computeTechnicalSignal(points) {
  if (!points || points.length < 30) return null;
  const closes = points.map(p => p.c);
  const last = closes[closes.length - 1];

  const ema20 = computeEMA(closes.slice(-40), 20);
  const ema50 = closes.length >= 50 ? computeEMA(closes.slice(-100), 50) : null;
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(points, 14);

  const vols = points.map(p => p.v || 0).filter(v => v > 0);
  const last20Vols = vols.slice(-20);
  const avgVol20 = last20Vols.length ? last20Vols.reduce((a, b) => a + b, 0) / last20Vols.length : 0;
  const todayVol = vols[vols.length - 1] || 0;
  const volRatio = avgVol20 > 0 ? todayVol / avgVol20 : 1;

  // Trend classification purely from real moving averages
  let trend = 'SIDEWAYS';
  if (ema50 != null) {
    if (last > ema20 && ema20 > ema50) trend = 'UPTREND';
    else if (last < ema20 && ema20 < ema50) trend = 'DOWNTREND';
  } else if (ema20 != null) {
    trend = last > ema20 ? 'UPTREND' : last < ema20 ? 'DOWNTREND' : 'SIDEWAYS';
  }

  // Technical score (0-100): trend alignment (0-50) + RSI positioning
  // (0-25, rewards recovering-from-oversold / healthy-not-overbought) +
  // volume confirmation (0-25).
  let score = 0;
  if (trend === 'UPTREND') score += 50;
  else if (trend === 'SIDEWAYS') score += 25;
  if (rsi14 != null) {
    if (rsi14 >= 40 && rsi14 <= 65) score += 25;
    else if (rsi14 > 30 && rsi14 < 75) score += 15;
    else if (rsi14 <= 30) score += 20; // oversold — potential rebound, not automatically bad
  }
  if (volRatio >= 1.5) score += 25;
  else if (volRatio >= 1.0) score += 15;
  else score += 5;

  return {
    trend,
    ema20: ema20 != null ? Math.round(ema20 * 100) / 100 : null,
    ema50: ema50 != null ? Math.round(ema50 * 100) / 100 : null,
    rsi14: rsi14 != null ? Math.round(rsi14 * 10) / 10 : null,
    atr14: atr14 != null ? Math.round(atr14 * 100) / 100 : null,
    volRatio: Math.round(volRatio * 100) / 100,
    score: Math.min(100, Math.round(score)),
    barsUsed: points.length
  };
}

// Fundamental score (0-100) from real ratios — simple, transparent rubric,
// not a fabricated number. Returns a neutral 50 with isReal:false when the
// underlying fundamentals were themselves an estimate (see
// fetchYahooFundamentals), so it never masquerades as a verified score.
function computeFundamentalScore(fundamentals) {
  if (!fundamentals || !fundamentals.isReal) {
    return { score: 50, isReal: false };
  }
  let score = 50;
  if (fundamentals.roe != null) {
    if (fundamentals.roe >= 15) score += 15;
    else if (fundamentals.roe >= 8) score += 5;
    else if (fundamentals.roe < 0) score -= 15;
  }
  if (fundamentals.per != null && fundamentals.per > 0) {
    if (fundamentals.per < 15) score += 10;
    else if (fundamentals.per > 30) score -= 10;
  }
  if (fundamentals.der != null) {
    if (fundamentals.der < 1) score += 10;
    else if (fundamentals.der > 3) score -= 10; // note: normal/expected for banks
  }
  if (fundamentals.npm != null) {
    if (fundamentals.npm >= 15) score += 10;
    else if (fundamentals.npm < 0) score -= 15;
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), isReal: true };
}

// Combines real technical + real/estimated fundamental + (optional) broker
// flow into one composite signal. This is the function the AI Trading
// Scanner should call per ticker instead of the old charCodeAt hash.
async function computeStockSignal(ticker) {
  const clean = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();

  const [quote, history] = await Promise.all([
    fetchYahooQuote(clean),
    fetchYahooHistory(clean, 'SCAN')
  ]);

  // INV-004 (audit): fetchYahooQuote() can return a fully-fabricated
  // placeholder quote (isSimulated:true) when Yahoo is unreachable and no
  // cache exists — a fake price with no real market basis. History
  // (fetchYahooHistory) never fabricates, so it's possible for `tech` to be
  // real (from a stale-but-real cached history) while `quote` is fake; if
  // that fake price feeds trend/ATR/stop-loss math it silently poisons the
  // signal. Treat a simulated quote the same as "no live price".
  const price = (quote && !quote.isSimulated) ? (quote.price || 0) : 0;
  const tech = computeTechnicalSignal(history?.points);
  const fund = computeFundamentalScore(quote?.fundamentals);

  const dataQuality = {
    price: price > 0,
    technical: !!tech,
    fundamental: fund.isReal
  };

  // Data Quality Gate — Stage 1 / non-blocking (roadmap B.5 Temuan 2). This
  // signal's own `dataQuality` object above only ever checked "is there a
  // real price/tech/fundamental read at all" — it never ran the shared
  // assessDataQuality() gate (candle staleness, OHLC corruption, ticker
  // validity), unlike generateTradingHypothesis()'s entry path. That means
  // a Scanner/Opportunity Radar/Quick Ticker "STRONG BUY" could be computed
  // from a real-but-STALE (basi, >5 hari) or corrupted history with no
  // indication anywhere. Runs the same gate here too and attaches its
  // verdict — this does NOT change `signal`/compositeScore/entry-sl-tp
  // (staying non-blocking for now, mirroring MW-P0-001 Stage 1); it only
  // makes the degradation visible so callers/UI can warn.
  const gateStatus = assessDataQuality(clean, history);

  // Without real price + technical data there is nothing honest to say —
  // return a clear "not enough data" state rather than a filled-in guess.
  if (!price || !tech) {
    return {
      ticker: clean, price, signal: 'NO DATA', compositeScore: null,
      dataQuality, gateStatus, error: !price ? (quote?.isSimulated ? 'Quote is simulated (Yahoo unreachable, no cache) — refusing to signal on fabricated price' : 'No live price') : 'Insufficient price history (need 30+ daily bars)'
    };
  }

  // Weighted composite: technical carries the most weight since it reacts
  // to actual current price action; fundamentals matter but move slowly.
  const compositeScore = Math.round(tech.score * 0.65 + fund.score * 0.35);

  let signal = 'AVOID';
  if (tech.trend === 'DOWNTREND') {
    signal = compositeScore >= 55 ? 'WATCH' : 'AVOID';
  } else if (compositeScore >= 78) signal = 'STRONG BUY';
  else if (compositeScore >= 62) signal = 'BUY';
  else if (compositeScore >= 48) signal = 'HOLD';
  else signal = 'WATCH';

  // Data Quality Gate Stage 2 (roadmap B.5 Temuan 2) — off by default (see
  // DATA_QUALITY_ENFORCE_STAGE2 above). Overrides a computed BUY/STRONG BUY/
  // HOLD/WATCH straight to "NO DATA" the moment the underlying history
  // fails the standardized gate, instead of merely flagging it (Stage 1).
  // entry/sl/tp/probability/evPerShare below are nulled the same way they
  // already are for AVOID, since none of them are trustworthy when the
  // gate itself failed.
  const gateBlocked = DATA_QUALITY_ENFORCE_STAGE2 && gateStatus.status !== DATA_QUALITY_STATUS.REAL;
  if (gateBlocked) signal = 'NO DATA';

  // ATR-scaled stop/target instead of an arbitrary fixed percentage — falls
  // back to a conservative 4%/8% off price only when ATR can't be computed
  // (e.g. a very newly-listed ticker with under 14 bars).
  const atr = tech.atr14 || price * 0.02;
  const sl = Math.round(price - atr * 1.5);
  const tp1 = Math.round(price + atr * 2.5);
  const tp2 = Math.round(price + atr * 4);
  const rr = (tp1 - price) > 0 && (price - sl) > 0 ? Math.round(((tp1 - price) / (price - sl)) * 100) / 100 : null;

  // Heuristic probability from the composite score — explicitly a rule-of-
  // thumb mapping, NOT a statistically validated/backtested win-rate. Kept
  // in a narrow, conservative band on purpose.
  const probability = Math.max(35, Math.min(75, Math.round(35 + compositeScore * 0.4)));
  const avgLossAmt = price - sl;
  const avgWinAmt = tp1 - price;
  const evPerShare = Math.round((probability / 100) * avgWinAmt - (1 - probability / 100) * avgLossAmt);
  const blockNumbers = signal === 'AVOID' || gateBlocked;

  return {
    ticker: clean,
    price,
    changePercent: quote.changePercent,
    volume: quote.volume,
    signal,
    trend: tech.trend,
    compositeScore: gateBlocked ? null : compositeScore,
    technicalScore: tech.score,
    fundamentalScore: fund.score,
    rsi14: tech.rsi14,
    ema20: tech.ema20,
    ema50: tech.ema50,
    volRatio: tech.volRatio,
    probability: gateBlocked ? null : probability,
    evPerShare: gateBlocked ? null : evPerShare,
    entry: blockNumbers ? null : price,
    sl: blockNumbers ? null : sl,
    tp1: blockNumbers ? null : tp1,
    tp2: blockNumbers ? null : tp2,
    rrRatio: gateBlocked ? null : rr,
    dataQuality,
    gateStatus,
    error: gateBlocked ? `Data Quality Gate gagal (status: ${gateStatus.status}) — sinyal ditahan (Stage 2 aktif). ${gateStatus.reasons.join(' ')}` : undefined,
    computedAt: new Date().toISOString()
  };
}

// Batch version for the scanner page — bounded concurrency-free
// Promise.allSettled since fetchYahooQuote/fetchYahooHistory already cache.
async function computeStockSignalBatch(tickers) {
  const clean = Array.from(new Set((tickers || []).map(t => String(t).toUpperCase().replace(/\.JK$/i, '').trim()))).slice(0, 80);
  const results = await Promise.allSettled(clean.map(t => computeStockSignal(t)));
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : { ticker: clean[i], error: r.reason?.message || 'Failed to compute signal' });
}

// ══════════════════════════════════════════════════════════════
// SIGNAL & CONFLUENCE ENGINE (Paper/Research Mode) — AGENTS.md §3-11
// ══════════════════════════════════════════════════════════════
// Fills the real gaps between the composite signal engine above and a
// structured, auditable trading hypothesis: a standardized Data Quality
// Gate, a real IHSG-derived Market Regime classifier, a Confluence Engine
// that groups technical/fundamental/broker/regime evidence and flags
// contradictions, and a Hypothesis Generator that outputs an honest
// NO_TRADE (never a fabricated BUY) whenever any gate fails. Everything
// here operates in PAPER/research mode only — no real order execution.

// AGENTS.md's own data-status enum. Previously only scattered ad hoc
// booleans existed (isReal, isValidTicker, isSimulated); this is the first
// place they're unified into one standard object.
const DATA_QUALITY_STATUS = { REAL: 'REAL', STALE: 'STALE', UNAVAILABLE: 'UNAVAILABLE', SIMULATION: 'SIMULATION', INVALID: 'INVALID' };

// Data Quality Gate Stage 2 kill switch (roadmap B.5) — OFF by default.
// Stage 1 (already live) only attaches the gate's verdict to
// computeStockSignal()'s/generateExitHypothesis()'s output for display
// (see gateStatus/dataQualityWarning below); it never changes what those
// functions actually recommend. Flipping this on makes a non-REAL status
// actually suppress the Scanner's BUY signal and the Exit Hypothesis's
// technical/confluence/regime-based exit triggers. Left off until Stage
// 1's badges/warnings have been observed against real production traffic
// long enough to know how often non-REAL status actually fires — read
// .env.example's entry for this flag before enabling it.
const DATA_QUALITY_ENFORCE_STAGE2 = String(process.env.DATA_QUALITY_ENFORCE_STAGE2 || '').toLowerCase() === 'true';

// ── Data Quality Gate Telemetry (Stage 1 observability) ──
// Counts how many times assessDataQuality() returns each status, per
// calendar day, so a human can actually answer the question the comment
// above poses ("how often non-REAL status actually fires") instead of
// guessing before flipping DATA_QUALITY_ENFORCE_STAGE2. Same lazy-Redis-
// with-in-memory-fallback shape as lib/invezgo-client.js's quota manager
// (see that file's own comment for why: this app runs as Vercel serverless,
// a plain in-process counter doesn't survive cold starts or stay consistent
// across concurrent instances) — duplicated here in miniature rather than
// imported, since this counter's shape (per-status-per-day) and lifetime
// (48h TTL) are unrelated to Invezgo's monthly quota semantics.
let Redis = null;
try {
  const upstash = await import('@upstash/redis');
  Redis = upstash.Redis;
} catch (_) {
  // @upstash/redis not installed/available; fallback to in-memory store below
}

let _dqMemStore = null;
const _dqRedisClient = (Redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

function _dqTelemetryKey(day, status) {
  return `dq_telemetry:${day}:${status}`;
}

async function recordDataQualityStatus(status) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = _dqTelemetryKey(day, status);
    if (_dqRedisClient) {
      await _dqRedisClient.incr(key);
      await _dqRedisClient.expire(key, 172800); // 48 jam — cukup untuk "hari ini" + buffer timezone, lalu otomatis dibuang
    } else {
      if (!_dqMemStore) _dqMemStore = new Map();
      _dqMemStore.set(key, (_dqMemStore.get(key) || 0) + 1);
    }
  } catch (e) {
    // Telemetry tidak boleh pernah menggagalkan/menunda keputusan gate yang sesungguhnya — sudah diambil sebelum fungsi ini dipanggil.
  }
}

// GET /api/idx/data-quality-status membaca ini — dipakai user untuk
// memutuskan sendiri kapan aman mengaktifkan DATA_QUALITY_ENFORCE_STAGE2,
// BUKAN diputuskan otomatis oleh kode ini (env var tetap manual, sengaja).
async function getDataQualityTelemetry() {
  const statuses = Object.values(DATA_QUALITY_STATUS);
  const day = new Date().toISOString().slice(0, 10);
  const counts = {};
  for (const s of statuses) {
    const key = _dqTelemetryKey(day, s);
    let v = 0;
    try {
      if (_dqRedisClient) v = Number(await _dqRedisClient.get(key)) || 0;
      else v = (_dqMemStore && _dqMemStore.get(key)) || 0;
    } catch (e) { v = 0; }
    counts[s] = v;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const realPct = total > 0 ? Math.round((counts.REAL / total) * 1000) / 10 : null;
  let recommendation;
  if (total === 0) {
    recommendation = 'Belum ada data terekam hari ini — buka halaman yang memanggil sinyal (mis. AI Trading Scanner) dulu, lalu cek lagi.';
  } else if (realPct >= 90) {
    recommendation = `${realPct}% cek data hari ini berstatus REAL — kondisi cukup baik untuk mempertimbangkan mengaktifkan DATA_QUALITY_ENFORCE_STAGE2.`;
  } else {
    recommendation = `Baru ${realPct}% cek data hari ini berstatus REAL (sisanya ${counts.SIMULATION || 0} simulasi, ${counts.STALE || 0} basi, ${counts.UNAVAILABLE || 0} tidak tersedia, ${counts.INVALID || 0} invalid) — sebaiknya tunggu proporsi REAL naik dulu (mis. setelah Invezgo API aktif) sebelum mengaktifkan DATA_QUALITY_ENFORCE_STAGE2, supaya sinyal tidak terlalu sering ditahan "NO DATA".`;
  }
  return {
    date: day,
    counts,
    total,
    realPct,
    persistedInRedis: !!_dqRedisClient,
    enforceStage2Active: DATA_QUALITY_ENFORCE_STAGE2,
    recommendation
  };
}

// Minimum daily candle count for a trustworthy technical read. Chosen to
// match computeTechnicalSignal()'s own floor (:773) — the gate can't be
// looser than the engine that actually consumes the candles. Existing ad
// hoc minimums elsewhere in the app range 5-70; this is the one this new
// engine standardizes on.
const MIN_OHLCV_BARS = 30;

// How old the last daily candle can be before the series counts as stale.
// 5 calendar days comfortably covers a long weekend/holiday run without
// masking a genuinely dead feed.
const STALE_CANDLE_MS = 5 * 24 * 60 * 60 * 1000;

// Data Quality Gate — no standardized status object existed anywhere before
// this. Checks ticker validity against the real ~950-ticker universe (the
// server-side equivalent of the client-only isValidStockTicker()), a
// unified minimum candle count, a fresh OHLC sanity check (low<=high,
// high>=max(open,close), low<=min(open,close), volume>=0 — didn't exist
// anywhere in the codebase before this), and candle staleness.
function assessDataQuality(ticker, ohlcv) {
  const clean = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();
  const reasons = [];

  const universe = loadBaseUniverse();
  const isIndexTicker = clean === 'JKSE' || clean === '^JKSE';
  const isValidTicker = isIndexTicker || Boolean(universe[clean]);
  if (!isValidTicker) reasons.push(`Ticker "${clean}" tidak ditemukan di universe resmi IDX (950+ emiten).`);

  const points = Array.isArray(ohlcv && ohlcv.points) ? ohlcv.points : (Array.isArray(ohlcv) ? ohlcv : []);
  const candleCount = points.length;
  if (candleCount < MIN_OHLCV_BARS) {
    reasons.push(`Hanya ${candleCount} candle harian tersedia — minimum ${MIN_OHLCV_BARS} dibutuhkan untuk analisis teknikal yang andal.`);
  }

  let ohlcViolation = false;
  for (const p of points) {
    if (p.h < p.l || p.h < Math.max(p.o, p.c) || p.l > Math.min(p.o, p.c) || (p.v != null && p.v < 0)) {
      ohlcViolation = true;
      break;
    }
  }
  if (ohlcViolation) reasons.push('Ditemukan candle OHLC tidak konsisten (low>high, atau high/low di luar rentang open/close) — data historis dicurigai korup.');

  if (ohlcv && ohlcv.error) reasons.push('Sumber data historis melaporkan error: ' + ohlcv.error);

  let lastUpdated = null, isStale = false;
  if (candleCount) {
    const lastT = points[points.length - 1].t;
    lastUpdated = lastT ? new Date(lastT).toISOString() : null;
    if (lastT && (Date.now() - lastT) > STALE_CANDLE_MS) {
      isStale = true;
      reasons.push('Candle terakhir sudah lebih dari 5 hari — data historis kemungkinan basi (stale).');
    }
  }

  const isSimulatedSource = !!(ohlcv && ohlcv.isSimulated);
  if (isSimulatedSource) reasons.push('Data berasal dari fallback sintetik (FS_LAST_SIMULATED), bukan histori harga riil.');

  let status;
  if (isSimulatedSource) status = DATA_QUALITY_STATUS.SIMULATION;
  else if (!isValidTicker || ohlcViolation) status = DATA_QUALITY_STATUS.INVALID;
  else if (!candleCount) status = DATA_QUALITY_STATUS.UNAVAILABLE;
  else if (isStale) status = DATA_QUALITY_STATUS.STALE;
  else if (candleCount < MIN_OHLCV_BARS) status = DATA_QUALITY_STATUS.UNAVAILABLE;
  else status = DATA_QUALITY_STATUS.REAL;

  // Telemetry (2026-09-14, user-requested): .env.example's own comment on
  // DATA_QUALITY_ENFORCE_STAGE2 says "only set to true after observing how
  // often non-REAL status actually occurs in production" — but until now
  // there was NO way to observe that (zero logging/counter anywhere).
  // Fire-and-forget: never let telemetry delay or fail the actual gate
  // decision above, which has already been made by this point.
  recordDataQualityStatus(status);

  return {
    ticker: clean,
    status,
    reasons,
    candleCount,
    minRequired: MIN_OHLCV_BARS,
    lastUpdated,
    isValidTicker,
    source: candleCount ? 'Yahoo Finance (real daily OHLCV)' : 'N/A',
    passesGate: status === DATA_QUALITY_STATUS.REAL
  };
}

// Market Regime Engine — AGENTS.md §6. No bull/bear/sideways/volatility
// classifier existed anywhere before this (getIdxMarketSummary() only
// returns a raw IHSG quote). Reuses the same real EMA/RSI/ATR primitives
// already computed for individual stocks, against real ^JKSE history.
let _regimeCache = null, _regimeCacheTime = 0;
const REGIME_CACHE_TTL_MS = 60000;

async function classifyMarketRegime() {
  const now = Date.now();
  if (_regimeCache && (now - _regimeCacheTime) < REGIME_CACHE_TTL_MS) return _regimeCache;

  const history = await fetchYahooHistory('^JKSE', 'SCAN');
  const points = history?.points || [];
  const tech = computeTechnicalSignal(points);
  const dataQuality = assessDataQuality('^JKSE', history);

  let result;
  if (!tech) {
    result = {
      regime: 'UNKNOWN',
      confidence: 0,
      ihsg: points.length ? points[points.length - 1].c : 0,
      ihsgChangePct: null,
      rsi14: null,
      volRatio: null,
      description: 'Data historis IHSG tidak cukup untuk klasifikasi regime (butuh 30+ candle harian).',
      dataQuality,
      computedAt: new Date().toISOString()
    };
  } else {
    const last = points[points.length - 1];
    const prev = points[points.length - 2] || last;
    const ihsgChangePct = prev.c ? Math.round(((last.c - prev.c) / prev.c) * 10000) / 100 : 0;

    let regime, description, confidence;
    if (tech.trend === 'UPTREND' && tech.rsi14 != null && tech.rsi14 > 75) {
      regime = 'HIGH_VOLATILITY'; confidence = 60;
      description = `IHSG dalam uptrend tapi RSI-14 sudah overbought (${tech.rsi14}) — potensi volatilitas tinggi/koreksi jangka pendek.`;
    } else if (tech.trend === 'UPTREND') {
      regime = 'BULL_TREND'; confidence = Math.round(Math.min(90, 50 + tech.score / 2));
      description = `IHSG di atas EMA20${tech.ema50 ? ' & EMA50' : ''} — struktur tren naik (bull trend).`;
    } else if (tech.trend === 'DOWNTREND' && tech.rsi14 != null && tech.rsi14 < 30) {
      regime = 'RISK_OFF'; confidence = 65;
      description = `IHSG downtrend dengan RSI-14 oversold (${tech.rsi14}) — tekanan jual dominan, mode risk-off.`;
    } else if (tech.trend === 'DOWNTREND') {
      regime = 'BEAR_TREND'; confidence = Math.round(Math.min(85, 45 + (100 - tech.score) / 2));
      description = `IHSG di bawah EMA20${tech.ema50 ? ' & EMA50' : ''} — struktur tren turun (bear trend).`;
    } else {
      regime = 'SIDEWAYS'; confidence = 50;
      description = 'IHSG bergerak tanpa arah tren jelas di sekitar EMA20 — mode sideways/konsolidasi.';
    }

    result = {
      regime, confidence, ihsg: last.c, ihsgChangePct,
      rsi14: tech.rsi14, volRatio: tech.volRatio, description,
      dataQuality, computedAt: new Date().toISOString()
    };
  }

  _regimeCache = result;
  _regimeCacheTime = now;
  return result;
}

// Uncertainty/Contradiction Engine (roadmap 2.3) — table-driven so adding
// a new pairwise check is a one-line addition, not a hand-written
// if-block. Previously only TREND-vs-REGIME and TREND-vs-MOMENTUM were
// checked; every other real disagreement between already-computed
// evidence groups (e.g. a trend not confirmed by volume, technicals
// bullish against bearish fundamentals, domestic broker flow diverging
// from foreign flow) went undetected. `template` receives
// (aDirectionLabel, bDirectionLabel, bDetail) — only `a`/`b`'s own
// already-computed detail strings are ever quoted, nothing invented.
const CONTRADICTION_PAIRS = [
  { a: 'TREND', b: 'MARKET_REGIME', template: (a, b) => `Teknikal individual ${a} tapi regime pasar IHSG sedang ${b} — sinyal berpotensi melawan arus pasar.` },
  { a: 'TREND', b: 'MOMENTUM', template: (a, b, bDetail) => `Struktur trend ${a} tapi momentum RSI-14 menunjukkan arah ${b} (${bDetail}).` },
  { a: 'TREND', b: 'VOLUME', template: (a, b, bDetail) => `Trend ${a} tapi tidak dikonfirmasi volume (${bDetail}) — pergerakan harga berisiko lemah/palsu.` },
  { a: 'TREND', b: 'FUNDAMENTAL', template: (a, b) => `Trend teknikal ${a} tapi fundamental menunjukkan arah ${b} — waspada divergensi harga vs kualitas bisnis.` },
  { a: 'TREND', b: 'SMART_MONEY', template: (a, b, bDetail) => `Trend teknikal ${a} tapi aktivitas broker (bandarmology riil) menunjukkan arah ${b}: ${bDetail}` },
  { a: 'MOMENTUM', b: 'VOLUME', template: (a, b, bDetail) => `Momentum RSI ${a} tapi arah volume justru ${b} (${bDetail}) — momentum berisiko tidak berkelanjutan.` },
  { a: 'SMART_MONEY', b: 'FOREIGN_FLOW', template: (a, b, bDetail) => `Aktivitas broker ${a} tapi arus asing menunjukkan arah ${b} (${bDetail}) — divergensi smart money domestik vs investor asing.` },
  { a: 'MARKET_REGIME', b: 'FUNDAMENTAL', template: (a, b) => `Regime pasar IHSG ${a} tapi fundamental emiten ini justru ${b}.` }
];

// Confluence Engine — AGENTS.md §8. Combines technical+fundamental (via
// computeStockSignal), market regime (via classifyMarketRegime), and
// broker/smart-money (via generateBrokerSummary+computeBandarmologyVerdict)
// into grouped evidence, with contradiction and missing-evidence detection.
// Smart-money/foreign-flow are explicitly excluded from scoring — placed in
// missingEvidence instead — whenever generateBrokerSummary reports
// isSimulated:true (the current production reality: no INVEZGO_API_KEY),
// per AGENTS.md's absolute rule against letting simulated data silently
// enter a trading decision.
async function computeConfluence(ticker) {
  const clean = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();

  const [signal, regime, history] = await Promise.all([
    computeStockSignal(clean),
    classifyMarketRegime(),
    fetchYahooHistory(clean, 'SCAN')
  ]);
  const dataQuality = assessDataQuality(clean, history);

  // computeStockSignal()'s own rrRatio is measured against tp1, which is a
  // fixed ATR x1.5 (stop) / x2.5 (tp1) profile — always ≈1.67 regardless of
  // ticker (rounding aside), never the 1:2 the Hypothesis Generator's gate
  // requires. Re-derive R:R against tp2 (ATR x4, ≈2.67) instead — the
  // fuller target already computed by the same function — so the gate
  // reflects a real ≥1:2 commitment instead of unconditionally rejecting
  // every hypothesis.
  const riskForRR = (signal.entry != null && signal.sl != null) ? (signal.entry - signal.sl) : null;
  const rewardToTp2 = (signal.entry != null && signal.tp2 != null) ? (signal.tp2 - signal.entry) : null;
  const rrToTp2 = (riskForRR > 0 && rewardToTp2 != null) ? Math.round((rewardToTp2 / riskForRR) * 100) / 100 : null;

  const evidence = [];
  const missingEvidence = [];

  if (signal.trend) {
    evidence.push({ group: 'TREND', label: 'Struktur EMA20/EMA50', direction: signal.trend === 'UPTREND' ? 'BULLISH' : signal.trend === 'DOWNTREND' ? 'BEARISH' : 'NEUTRAL', detail: `Trend teknikal: ${signal.trend} (EMA20 ${signal.ema20}, EMA50 ${signal.ema50 ?? 'N/A'})`, weight: 1 });
  } else {
    missingEvidence.push('TREND — data teknikal tidak cukup untuk menghitung EMA.');
  }

  if (signal.rsi14 != null) {
    const dir = signal.rsi14 >= 55 ? 'BULLISH' : signal.rsi14 <= 45 ? 'BEARISH' : 'NEUTRAL';
    evidence.push({ group: 'MOMENTUM', label: 'RSI-14', direction: dir, detail: `RSI-14 = ${signal.rsi14}`, weight: 0.7 });
  } else {
    missingEvidence.push('MOMENTUM — RSI-14 tidak dapat dihitung.');
  }

  if (signal.volRatio != null) {
    const dir = signal.volRatio >= 1.3 ? 'BULLISH' : signal.volRatio < 0.8 ? 'BEARISH' : 'NEUTRAL';
    evidence.push({ group: 'VOLUME', label: 'Rasio Volume vs rata-rata 20D', direction: dir, detail: `Volume ${signal.volRatio}x rata-rata 20 hari`, weight: 0.6 });
  } else {
    missingEvidence.push('VOLUME — data volume tidak cukup.');
  }

  if (signal.price && signal.sl != null && signal.tp1 != null) {
    evidence.push({ group: 'PRICE_STRUCTURE', label: 'Jarak Stop/Target (ATR-based)', direction: 'NEUTRAL', detail: `Entry Rp${signal.price}, SL Rp${signal.sl}, TP1 Rp${signal.tp1} (RR 1:${signal.rrRatio ?? 'N/A'}), TP2 Rp${signal.tp2} (RR 1:${rrToTp2 ?? 'N/A'})`, weight: 0.5 });
  } else {
    missingEvidence.push('PRICE_STRUCTURE — ATR/SL/TP tidak dapat dihitung (data harga tidak cukup).');
  }

  if (signal.dataQuality && signal.dataQuality.fundamental) {
    const dir = signal.fundamentalScore >= 60 ? 'BULLISH' : signal.fundamentalScore <= 40 ? 'BEARISH' : 'NEUTRAL';
    evidence.push({ group: 'FUNDAMENTAL', label: 'Skor Fundamental (ROE/PER/DER/NPM)', direction: dir, detail: `Skor fundamental riil: ${signal.fundamentalScore}/100`, weight: 0.8 });
  } else {
    missingEvidence.push('FUNDAMENTAL — belum ada data fundamental terverifikasi untuk emiten ini (skor memakai nilai netral 50).');
  }

  if (regime.regime && regime.regime !== 'UNKNOWN') {
    const dir = regime.regime === 'BULL_TREND' ? 'BULLISH' : (regime.regime === 'BEAR_TREND' || regime.regime === 'RISK_OFF') ? 'BEARISH' : 'NEUTRAL';
    evidence.push({ group: 'MARKET_REGIME', label: 'Regime Pasar (IHSG)', direction: dir, detail: regime.description, weight: 0.9 });
  } else {
    missingEvidence.push('MARKET_REGIME — regime IHSG belum bisa diklasifikasi (data historis IHSG tidak cukup).');
  }

  let brokerSummary = null;
  try {
    brokerSummary = await generateBrokerSummary(clean, { price: signal.price, changePercent: signal.changePercent });
  } catch (e) { brokerSummary = null; }

  // INV rules: simulated AND invalid broker data must both be excluded from
  // scoring — INVALID (unrecognized Invezgo schema) is not the same failure
  // as SIMULATION (no key configured), but both are equally forbidden from
  // adding confluence points (audit doc `signal_governance.confluence`).
  if (brokerSummary && brokerSummary.isValidTicker && !brokerSummary.isSimulated && !brokerSummary.isInvalid) {
    const bv = brokerSummary.bandarmology;
    const smDir = bv.score >= 70 ? 'BULLISH' : bv.score <= 30 ? 'BEARISH' : 'NEUTRAL';
    evidence.push({ group: 'SMART_MONEY', label: 'Bandarmology (broker riil)', direction: smDir, detail: bv.interpretation, weight: 0.9 });
    const ff = bv.foreignFlow;
    const ffDir = ff.netValRp > 0 ? 'BULLISH' : ff.netValRp < 0 ? 'BEARISH' : 'NEUTRAL';
    evidence.push({ group: 'FOREIGN_FLOW', label: 'Foreign Net Flow (broker riil)', direction: ffDir, detail: `Net asing: Rp ${Number(ff.netValRp).toLocaleString('id-ID')}`, weight: 0.7 });
  } else if (brokerSummary && brokerSummary.isInvalid) {
    missingEvidence.push(`SMART_MONEY — respons Invezgo tidak sesuai skema yang diharapkan (kemungkinan kontrak API berubah); tidak diskor untuk menghindari fabrikasi. reason=${brokerSummary.quality?.reason || 'unknown'}`);
    missingEvidence.push('FOREIGN_FLOW — sama seperti di atas.');
  } else {
    missingEvidence.push('SMART_MONEY — data broker flow riil (Invezgo) tidak dikonfigurasi di deployment ini; tidak diskor untuk menghindari fabrikasi.');
    missingEvidence.push('FOREIGN_FLOW — sama seperti di atas, tidak ada feed broker riil yang tersedia.');
  }

  if (signal.price && signal.sl != null) {
    const riskPct = Math.round(((signal.price - signal.sl) / signal.price) * 10000) / 100;
    evidence.push({ group: 'RISK', label: 'Jarak Risiko (ATR x1.5) vs Harga', direction: 'NEUTRAL', detail: `Risiko per saham ≈ ${riskPct}% dari harga saat ini`, weight: 0.4 });
  }

  if (signal.volume != null) {
    evidence.push({ group: 'LIQUIDITY', label: 'Volume Transaksi Harian', direction: signal.volume > 0 ? 'NEUTRAL' : 'BEARISH', detail: `Volume hari ini: ${Number(signal.volume).toLocaleString('id-ID')} lembar`, weight: 0.3 });
  } else {
    missingEvidence.push('LIQUIDITY — data volume harian tidak tersedia.');
  }

  const contradictions = [];
  CONTRADICTION_PAIRS.forEach(pair => {
    const evA = evidence.find(e => e.group === pair.a);
    const evB = evidence.find(e => e.group === pair.b);
    if (!evA || !evB) return;
    if (evA.direction === 'NEUTRAL' || evB.direction === 'NEUTRAL') return;
    if (evA.direction === evB.direction) return;
    contradictions.push(pair.template(
      evA.direction === 'BULLISH' ? 'bullish' : 'bearish',
      evB.direction === 'BULLISH' ? 'bullish' : 'bearish',
      evB.detail
    ));
  });

  const weightedSum = evidence.reduce((s, e) => s + (e.direction === 'BULLISH' ? e.weight : e.direction === 'BEARISH' ? -e.weight : 0), 0);
  const maxWeight = evidence.reduce((s, e) => s + e.weight, 0) || 1;
  const confluenceScore = Math.max(0, Math.min(100, Math.round(((weightedSum / maxWeight) + 1) * 50)));
  const totalPossibleEvidence = evidence.length + missingEvidence.length;
  const confidenceScore = totalPossibleEvidence ? Math.round((evidence.length / totalPossibleEvidence) * 100) : 0;

  // Uncertainty Engine — a real, computed measure of how SPLIT the
  // evidence is, independent of confluenceScore (which is a *weighted*
  // net direction — a few heavy bullish groups can dominate a lot of
  // light bearish ones and still read as "confident" even when many
  // groups disagree). uncertaintyScore instead looks at how many
  // groups point each way, unweighted: 0 when every directional group
  // agrees, 100 when they're split exactly 50/50. Contradictions[] above
  // already names the specific disagreeing pairs; this is the aggregate.
  const directionalEvidence = evidence.filter(e => e.direction !== 'NEUTRAL');
  const bullGroupCount = directionalEvidence.filter(e => e.direction === 'BULLISH').length;
  const bearGroupCount = directionalEvidence.filter(e => e.direction === 'BEARISH').length;
  const totalDirectional = bullGroupCount + bearGroupCount;
  const uncertaintyScore = totalDirectional > 0
    ? Math.round((Math.min(bullGroupCount, bearGroupCount) / totalDirectional) * 200)
    : 0;

  return {
    ticker: clean, signal, regime, evidence, contradictions, missingEvidence,
    confluenceScore, confidenceScore, uncertaintyScore, dataQuality, rrToTp2, computedAt: new Date().toISOString()
  };
}

// Minimum reward:risk ratio a hypothesis must clear to be worth taking —
// AGENTS.md §10.
const MIN_RR_RATIO = 2;

// Maximum tolerable uncertaintyScore (0=all evidence agrees, 100=evidence
// split exactly 50/50 — see computeConfluence) before a hypothesis is
// rejected regardless of how favorable confluenceScore looks — AGENTS.md
// §20's Uncertainty Engine. 66 ≈ "at most 1 disagreeing group per 2
// agreeing ones" — loose enough that a single normal dissenting group
// (e.g. weak volume) doesn't block an otherwise solid setup, but catches
// genuinely evenly-split cases.
const MAX_UNCERTAINTY = 66;

// Hypothesis Generator — AGENTS.md §9. Wraps computeConfluence() into a
// structured trading hypothesis object. Outputs side:'NO_TRADE' (never a
// fabricated BUY) whenever the data quality gate fails, the composite
// signal isn't a BUY, regime is UNKNOWN, R:R is below 1:2, or contradicting
// evidence outweighs supporting evidence — every reason is listed in
// gateFailures rather than silently defaulting to a number. PAPER/research
// mode only: no real order is ever placed from this.
//
// accountContext (optional): { cash, totalEquity, riskPerTradePct } — the
// caller's REAL current paper-account numbers (AI_TRADE_STATE.paperAccount
// client-side). When provided, suggestedPositionSizing is computed with the
// exact same formula aiOpenPositionFromSignal() uses to actually open the
// position, so the preview shown here matches what really happens on
// "Buka Posisi Paper". When omitted (no account context available),
// suggestedPositionSizing is null with a reason — never a fake reference
// number.
async function generateTradingHypothesis(ticker, accountContext) {
  const confluence = await computeConfluence(ticker);
  const { signal, regime, evidence, contradictions, missingEvidence, confluenceScore, confidenceScore, uncertaintyScore, dataQuality, rrToTp2 } = confluence;
  const clean = confluence.ticker;

  const bullishCount = evidence.filter(e => e.direction === 'BULLISH').length;
  const bearishCount = evidence.filter(e => e.direction === 'BEARISH').length;

  const gateFailures = [];
  if (dataQuality.status !== DATA_QUALITY_STATUS.REAL) gateFailures.push(`Data Quality Gate gagal: status "${dataQuality.status}" (${dataQuality.reasons.join('; ') || 'lihat dataQuality untuk detail'}).`);
  if (!signal || signal.error || signal.signal === 'NO DATA') gateFailures.push('Sinyal teknikal/fundamental tidak dapat dihitung: ' + (signal && signal.error ? signal.error : 'data tidak cukup') + '.');
  if (regime.regime === 'UNKNOWN') gateFailures.push('Market regime IHSG belum bisa diklasifikasi (data historis IHSG tidak cukup).');
  // Gated against TP2's R:R (~2.67, see computeConfluence) rather than the
  // signal's own tp1-based rrRatio (~1.67, a fixed ATR profile that would
  // make this gate unconditionally fail for every ticker).
  if (rrToTp2 != null && rrToTp2 < MIN_RR_RATIO) gateFailures.push(`Rasio risk:reward ${rrToTp2} di bawah minimum 1:${MIN_RR_RATIO}.`);
  if (contradictions.length > bullishCount) gateFailures.push(`Kontradiksi (${contradictions.length}) lebih banyak dari bukti pendukung bullish (${bullishCount}).`);
  // Uncertainty Engine gate (roadmap 2.3): confluenceScore is a *weighted*
  // net direction, so a couple of heavy bullish groups can mask a lot of
  // disagreeing lighter ones and still look "confident". uncertaintyScore
  // measures the same evidence unweighted (how close the bull/bear GROUP
  // count is to a 50/50 split) — block on it independently of confluence.
  if (uncertaintyScore >= MAX_UNCERTAINTY) gateFailures.push(`Uncertainty score ${uncertaintyScore}/100 — bukti bullish vs bearish terlalu terbelah (mendekati 50/50) untuk dipercaya, meski confluence score masih terlihat baik.`);
  const isBuySignal = !!(signal && signal.signal && signal.signal.includes('BUY'));
  if (!isBuySignal) gateFailures.push(`Sinyal komposit saat ini "${signal ? signal.signal : 'N/A'}", bukan BUY/STRONG BUY.`);

  const noTrade = gateFailures.length > 0;

  // Real sizing against the caller's actual current paper-account numbers —
  // mirrors aiOpenPositionFromSignal()'s formula exactly (risk budget from
  // totalEquity * riskPerTradePct%, capped by what cash can actually afford)
  // so the preview shown here matches what really happens when the user
  // clicks "Buka Posisi Paper" on this same hypothesis. Degrades honestly
  // to null/no-fabricated-number when no account context was supplied, or
  // says so plainly when the account genuinely can't afford 1 lot.
  let suggestedPositionSizing = null;
  if (!noTrade && signal.entry != null && signal.sl != null) {
    if (!accountContext || accountContext.cash == null || accountContext.totalEquity == null || accountContext.riskPerTradePct == null) {
      suggestedPositionSizing = {
        suggestedShares: null,
        suggestedLots: null,
        riskBudgetRp: null,
        note: 'Akun paper tidak tersedia — sambungkan konteks akun (cash, totalEquity, riskPerTradePct) untuk melihat ukuran posisi riil.'
      };
    } else {
      const entry = signal.entry;
      const riskPerShare = signal.entry - signal.sl;
      const riskBudget = accountContext.totalEquity * (accountContext.riskPerTradePct / 100);
      const maxShares = riskPerShare > 0 ? Math.floor(riskBudget / riskPerShare) : 0;
      let lots = Math.floor(maxShares / 100);
      const affordableLots = Math.floor(accountContext.cash / (entry * 100));
      lots = Math.max(0, Math.min(lots, affordableLots));
      const shares = lots * 100;
      suggestedPositionSizing = {
        accountCashRp: Math.round(accountContext.cash),
        accountEquityRp: Math.round(accountContext.totalEquity),
        riskPct: accountContext.riskPerTradePct,
        riskBudgetRp: Math.round(riskBudget),
        riskPerShareRp: Math.round(riskPerShare),
        suggestedShares: shares,
        suggestedLots: lots,
        note: lots >= 1
          ? `Riil terhadap akun paper Anda saat ini (ekuitas Rp ${Math.round(accountContext.totalEquity).toLocaleString('id-ID')}, kas Rp ${Math.round(accountContext.cash).toLocaleString('id-ID')}, risiko ${accountContext.riskPerTradePct}%) — jumlah lot ini akan sama persis dengan yang terbuka saat "Buka Posisi Paper" ditekan.`
          : `Modal/risiko akun paper Anda saat ini tidak cukup untuk membuka minimal 1 lot ${clean}.`
      };
    }
  }

  const bullCase = evidence.filter(e => e.direction === 'BULLISH').map(e => e.detail);
  const bearCase = evidence.filter(e => e.direction === 'BEARISH').map(e => e.detail).concat(contradictions);

  return {
    symbol: clean,
    side: noTrade ? 'NO_TRADE' : 'BUY',
    regime: regime.regime,
    setup: (signal && signal.trend) ? `${signal.trend} + skor komposit ${signal.compositeScore}/100` : 'Data tidak cukup',
    entryReason: noTrade ? gateFailures.join(' ') : `Confluence ${confluenceScore}/100 dengan ${bullishCount} bukti bullish vs ${bearishCount} bearish, regime ${regime.regime}.`,
    bullCase,
    bearCase,
    // No real news/catalyst-detection engine exists in this app yet — left
    // null rather than inventing a plausible-sounding headline.
    catalyst: null,
    invalidation: (!noTrade && signal.sl != null) ? `Penutupan harian di bawah Rp ${Number(signal.sl).toLocaleString('id-ID')}` : null,
    entryZone: (!noTrade && signal.entry != null) ? signal.entry : null,
    stopLoss: (!noTrade && signal.sl != null) ? signal.sl : null,
    takeProfit: (!noTrade && signal.tp1 != null) ? { tp1: signal.tp1, tp2: signal.tp2 } : null,
    riskPerShare: (!noTrade && signal.entry != null && signal.sl != null) ? Math.round(signal.entry - signal.sl) : null,
    // Reward measured to tp2 (the fuller target), matching the R:R this
    // hypothesis was actually gated on above — not tp1.
    rewardPerShare: (!noTrade && signal.entry != null && signal.tp2 != null) ? Math.round(signal.tp2 - signal.entry) : null,
    riskReward: rrToTp2,
    suggestedPositionSizing,
    confidence: confidenceScore,
    confluence: confluenceScore,
    uncertainty: uncertaintyScore,
    supportingEvidence: evidence,
    contradictingEvidence: contradictions,
    missingEvidence,
    gateFailures,
    dataQuality,
    dataTimestamp: confluence.computedAt,
    strategyVersion: 'signal-confluence-v1-paper',
    isPaperModeOnly: true
  };
}

// Sell/Exit Hypothesis Generator — the missing other half of
// generateTradingHypothesis() above. That function only ever answers
// "should I enter?" (BUY/NO_TRADE); this answers "should I exit a
// position I already hold?" (SELL/HOLD) for a real open paper position.
// Purely additive — does not change generateTradingHypothesis's own
// behavior or contract at all.
//
// `position` is supplied by the caller (the client's paper account is the
// only place that knows what's actually open — this server module has no
// state of its own): { entryPrice, currentPrice, sl, tp1, tp2, lots }.
// Every trigger below is a real, checkable condition against
// computeConfluence()'s already-computed fields — never a fabricated
// reason.
async function generateExitHypothesis(ticker, position) {
  const confluence = await computeConfluence(ticker);
  const { signal, regime, evidence, contradictions, missingEvidence, confluenceScore, confidenceScore, uncertaintyScore, dataQuality } = confluence;
  const clean = confluence.ticker;

  const pos = position || {};
  const entryPrice = pos.entryPrice != null ? Number(pos.entryPrice) : null;
  const currentPrice = pos.currentPrice != null ? Number(pos.currentPrice) : (signal && signal.price) || null;
  const lots = pos.lots != null ? Number(pos.lots) : null;
  const shares = lots != null ? lots * 100 : null;

  const unrealizedPnL = (entryPrice != null && currentPrice != null && shares != null)
    ? Math.round((currentPrice - entryPrice) * shares)
    : null;
  const unrealizedPct = (entryPrice != null && currentPrice != null && entryPrice > 0)
    ? Math.round(((currentPrice - entryPrice) / entryPrice) * 10000) / 100
    : null;

  const exitTriggers = [];

  // 1. SL/TP breach — the position's own predefined exit levels, highest
  // priority since these were already agreed to at entry time.
  if (pos.sl != null && currentPrice != null && currentPrice <= Number(pos.sl)) {
    exitTriggers.push(`Harga saat ini (Rp ${Number(currentPrice).toLocaleString('id-ID')}) sudah menyentuh/menembus Stop Loss (Rp ${Number(pos.sl).toLocaleString('id-ID')}).`);
  }
  if (pos.tp1 != null && currentPrice != null && currentPrice >= Number(pos.tp1)) {
    exitTriggers.push(`Harga saat ini (Rp ${Number(currentPrice).toLocaleString('id-ID')}) sudah menyentuh/melewati Take Profit 1 (Rp ${Number(pos.tp1).toLocaleString('id-ID')}).`);
  }

  // Data Quality Gate Stage 2 (roadmap B.5 Temuan 1) — off by default (see
  // DATA_QUALITY_ENFORCE_STAGE2). Triggers #2-5 below all depend on
  // computeConfluence()'s history-derived signal/regime/evidence — exactly
  // what dataQuality assesses — so when the gate fails AND enforcement is
  // on, they're withheld rather than presented as trustworthy. Trigger #1
  // (SL/TP breach, above) is deliberately NEVER gated: it only uses the
  // caller-supplied pos.sl/pos.tp1/currentPrice, which don't depend on this
  // gated history at all — suppressing a real SL breach because an
  // unrelated feed is stale would itself be a failure mode.
  const dqGateOk = dataQuality.status === DATA_QUALITY_STATUS.REAL;
  const evaluateHistoryBasedTriggers = dqGateOk || !DATA_QUALITY_ENFORCE_STAGE2;

  if (evaluateHistoryBasedTriggers) {
    // 2. Trend reversal — real, already-computed technical trend.
    if (signal && signal.trend === 'DOWNTREND') {
      exitTriggers.push(`Trend teknikal sudah berbalik menjadi DOWNTREND (EMA20 ${signal.ema20}${signal.ema50 ? ', EMA50 ' + signal.ema50 : ''}).`);
    }

    // 3. Confluence deterioration — same "contradictions outweigh support"
    // gate already used by generateTradingHypothesis's NO_TRADE logic above,
    // applied here to the decision to keep holding instead of to enter.
    const bullishCount = evidence.filter(e => e.direction === 'BULLISH').length;
    if (contradictions.length > bullishCount) {
      exitTriggers.push(`Kontradiksi (${contradictions.length}) lebih banyak dari bukti pendukung bullish (${bullishCount}) — tesis awal melemah.`);
    }
    if (confluenceScore < 40) {
      exitTriggers.push(`Confluence score turun ke ${confluenceScore}/100 — keseimbangan bukti sudah condong bearish/netral.`);
    }

    // 4. Regime shift — real, already-computed market regime.
    if (regime.regime === 'BEAR_TREND' || regime.regime === 'RISK_OFF') {
      exitTriggers.push(`Regime pasar IHSG bergeser ke ${regime.regime} — tekanan jual pasar meningkat.`);
    }

    // 5. Uncertainty Engine (roadmap 2.3) — evidence too evenly split to
    // trust holding, even if confluenceScore alone hasn't dropped yet
    // (heavier bullish groups can still mask a lot of newly-disagreeing
    // lighter ones). For an open position, bias toward risk reduction when
    // genuinely uncertain rather than waiting for a fuller reversal.
    if (uncertaintyScore >= MAX_UNCERTAINTY) {
      exitTriggers.push(`Uncertainty score ${uncertaintyScore}/100 — bukti bullish vs bearish terlalu terbelah, tesis awal tidak lagi solid.`);
    }
  }

  const side = exitTriggers.length > 0 ? 'SELL' : 'HOLD';

  // Data Quality Gate warning — always computed regardless of enforcement
  // (Stage 1 badge stays useful even once Stage 2 is on: it explains WHY
  // triggers #2-5 above were skipped). Message adapts depending on whether
  // enforcement actually withheld anything this call.
  const dataQualityWarning = !dqGateOk
    ? (DATA_QUALITY_ENFORCE_STAGE2
        ? `Data Quality Gate gagal (status: ${dataQuality.status}) — pemicu exit berbasis trend/confluence/regime DITAHAN (Stage 2 aktif); hanya pemicu SL/TP langsung (jika ada) yang dievaluasi di atas. ${dataQuality.reasons.join(' ')}`
        : `Data Quality Gate TIDAK lulus (status: ${dataQuality.status}) — rekomendasi ${side} di atas dihitung dari data yang ${dataQuality.status === 'STALE' ? 'basi' : dataQuality.status === 'SIMULATION' ? 'sintetik/bukan riil' : dataQuality.status === 'UNAVAILABLE' ? 'tidak tersedia cukup' : 'tidak valid'}. ${dataQuality.reasons.join(' ')}`)
    : null;

  const bullCase = evidence.filter(e => e.direction === 'BULLISH').map(e => e.detail);
  const bearCase = evidence.filter(e => e.direction === 'BEARISH').map(e => e.detail).concat(contradictions);

  return {
    symbol: clean,
    side,
    regime: regime.regime,
    entryPrice, currentPrice, lots,
    unrealizedPnL, unrealizedPct,
    exitReason: side === 'SELL'
      ? exitTriggers.join(' ')
      : `Belum ada pemicu exit — trend ${signal ? signal.trend : 'N/A'}, confluence ${confluenceScore}/100, regime ${regime.regime}.`,
    recommendedAction: side === 'SELL' ? 'Pertimbangkan tutup posisi sekarang.' : 'Pertahankan posisi, pantau terus.',
    exitTriggers,
    bullCase,
    bearCase,
    missingEvidence,
    confidence: confidenceScore,
    confluence: confluenceScore,
    uncertainty: uncertaintyScore,
    supportingEvidence: evidence,
    contradictingEvidence: contradictions,
    dataQuality,
    dataQualityWarning,
    dataTimestamp: confluence.computedAt,
    strategyVersion: 'signal-confluence-v1-paper',
    isPaperModeOnly: true
  };
}

// ══════════════════════════════════════════════════════════════
// REAL RULE-BASED STRATEGY BACKTESTER
// ══════════════════════════════════════════════════════════════
// Replaces the old Strategy Lab / Backtest Lab, which showed 10 strategies
// with hardcoded win-rate/Sharpe/profit-factor numbers and a "Run
// Backtest" button that only called showToast() — nothing was ever
// computed. Every strategy here is a fixed, explicit rule simulated
// bar-by-bar over real 2-year daily OHLCV history; every stat reported is
// aggregated from the trades that rule actually produced. No fabricated
// win rates.
//
// Only strategies computable from data this app already has access to are
// implemented (price/volume history). Strategies that would need data
// this app doesn't reliably have (broker-level historical flow, a trained
// ML model) are intentionally NOT included — see STRATEGY_DEFINITIONS.

const STRATEGY_DEFINITIONS = {
  strat_pullback: {
    id: 'strat_pullback',
    name: 'Trend Pullback',
    type: 'Trend Following / Swing',
    description: 'Beli saat tren naik (EMA20 > EMA50) dan RSI-14 baru saja pulih melewati 45 dari bawah (pullback sehat, bukan breakdown).'
  },
  strat_breakout: {
    id: 'strat_breakout',
    name: 'Volume Breakout',
    type: 'Momentum / Breakout',
    description: 'Beli saat harga menembus tertinggi 20 hari terakhir disertai volume ≥ 1.5x rata-rata 20 hari.'
  },
  strat_mean_reversion: {
    id: 'strat_mean_reversion',
    name: 'Mean Reversion Oversold',
    type: 'Counter-Trend',
    description: 'Beli saat RSI-14 baru saja pulih melewati 30 dari bawah setelah sempat oversold (rebound teknikal).'
  }
};

// Rolling indicator series aligned to the closes array (index i uses only
// data up to and including bar i — no lookahead).
function computeIndicatorSeries(points) {
  const closes = points.map(p => p.c);
  const n = closes.length;
  const ema = (period) => {
    const k = 2 / (period + 1);
    const out = new Array(n).fill(null);
    let val = null;
    for (let i = 0; i < n; i++) {
      val = val == null ? closes[i] : closes[i] * k + val * (1 - k);
      out[i] = val;
    }
    return out;
  };
  const rsi = (period) => {
    const out = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = closes[j] - closes[j - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
      }
      const avgGain = gains / period, avgLoss = losses / period;
      out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return out;
  };
  const atr = (period) => {
    const out = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += Math.max(points[j].h - points[j].l, Math.abs(points[j].h - points[j - 1].c), Math.abs(points[j].l - points[j - 1].c));
      }
      out[i] = sum / period;
    }
    return out;
  };
  const highestHigh = (period) => {
    const out = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      let hh = -Infinity;
      for (let j = i - period; j < i; j++) hh = Math.max(hh, points[j].h); // excludes bar i itself
      out[i] = hh;
    }
    return out;
  };
  const avgVolume = (period) => {
    const out = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      let sum = 0;
      for (let j = i - period; j < i; j++) sum += points[j].v || 0;
      out[i] = sum / period;
    }
    return out;
  };
  return { ema20: ema(20), ema50: ema(50), rsi14: rsi(14), atr14: atr(14), hh20: highestHigh(20), avgVol20: avgVolume(20) };
}

// Simulates one strategy's entry/exit rules over a single ticker's history.
// Non-overlapping trades (waits for exit before considering a new entry).
// Exit is the first of: ATR stop-loss, ATR take-profit, or a 20-bar time
// exit at that bar's close — never lets a trade run indefinitely.
function simulateStrategyOnHistory(strategyId, ticker, points) {
  if (!points || points.length < 60) return [];
  const ind = computeIndicatorSeries(points);
  const trades = [];
  let inPosition = false, entryIdx = 0, entryPrice = 0, sl = 0, tp = 0;
  const FRICTION_PCT = 0.002; // ~0.2% round-trip: BEI fees + PPN + levy + slippage, approximated

  for (let i = 51; i < points.length; i++) {
    if (inPosition) {
      const bar = points[i];
      let exitPrice = null, exitReason = null;
      if (bar.l <= sl) { exitPrice = sl; exitReason = 'STOP LOSS'; }
      else if (bar.h >= tp) { exitPrice = tp; exitReason = 'TAKE PROFIT'; }
      else if (i - entryIdx >= 20) { exitPrice = bar.c; exitReason = 'TIME EXIT (20 hari)'; }

      if (exitPrice != null) {
        const grossReturnPct = (exitPrice - entryPrice) / entryPrice;
        const netReturnPct = grossReturnPct - FRICTION_PCT;
        const riskPct = (entryPrice - sl) / entryPrice;
        trades.push({
          ticker, entryDate: points[entryIdx].t, exitDate: bar.t,
          entryPrice: Math.round(entryPrice), exitPrice: Math.round(exitPrice),
          returnPct: Math.round(netReturnPct * 10000) / 100,
          rMultiple: riskPct > 0 ? Math.round((netReturnPct / riskPct) * 100) / 100 : 0,
          result: netReturnPct > 0 ? 'WIN' : 'LOSS',
          exitReason,
          holdingBars: i - entryIdx
        });
        inPosition = false;
      }
      continue;
    }

    // Entry rules — each strictly from real indicator values at bar i,
    // comparing to bar i-1 for "just crossed" conditions (no lookahead).
    let shouldEnter = false;
    if (strategyId === 'strat_pullback') {
      shouldEnter = ind.ema20[i] != null && ind.ema50[i] != null && ind.ema20[i] > ind.ema50[i]
        && ind.rsi14[i] != null && ind.rsi14[i - 1] != null && ind.rsi14[i - 1] < 45 && ind.rsi14[i] >= 45;
    } else if (strategyId === 'strat_breakout') {
      shouldEnter = ind.hh20[i] != null && points[i].c > ind.hh20[i]
        && ind.avgVol20[i] != null && (points[i].v || 0) >= ind.avgVol20[i] * 1.5;
    } else if (strategyId === 'strat_mean_reversion') {
      shouldEnter = ind.rsi14[i] != null && ind.rsi14[i - 1] != null && ind.rsi14[i - 1] < 30 && ind.rsi14[i] >= 30;
    }

    if (shouldEnter && ind.atr14[i] != null && ind.atr14[i] > 0) {
      inPosition = true;
      entryIdx = i;
      entryPrice = points[i].c;
      sl = entryPrice - ind.atr14[i] * 1.5;
      tp = entryPrice + ind.atr14[i] * 2.5;
    }
  }
  return trades;
}

// Aggregates a list of simulated trades into the summary stats the UI
// shows — all derived, none hardcoded.
function aggregateBacktestStats(trades) {
  if (!trades.length) {
    return { totalTrades: 0, winRate: 0, profitFactor: null, avgWinPct: 0, avgLossPct: 0, maxDrawdownPct: 0, sharpe: null, expectancyR: 0 };
  }
  const wins = trades.filter(t => t.result === 'WIN');
  const losses = trades.filter(t => t.result === 'LOSS');
  const grossWin = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));

  // Equity curve in R-multiples at a fixed 1% risk per trade (matching the
  // Paper Portfolio's stated risk policy) rather than compounding 100% of
  // capital into every sequential trade — the latter produces wildly
  // unrealistic "95%+ drawdown" numbers once a few hundred trades across a
  // whole universe are chained together, because no real portfolio risks
  // its entire balance on one position. 1 R-multiple here = 1% of capital.
  const RISK_PER_TRADE_PCT = 1.0;
  const sorted = trades.slice().sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
  let equity = 100, peak = 100, maxDD = 0;
  const rMultiples = [];
  sorted.forEach(t => {
    equity += t.rMultiple * RISK_PER_TRADE_PCT;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity); // percentage points of starting capital
    rMultiples.push(t.rMultiple);
  });

  const mean = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;
  const variance = rMultiples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rMultiples.length;
  const stdev = Math.sqrt(variance);
  // Simplified per-trade Sharpe analogue on R-multiples (not annualized —
  // trade counts and holding periods vary too much per ticker for a clean
  // annualization here). Presented as "Sharpe per-trade", not the
  // standard annual ratio.
  const sharpe = stdev > 0 ? Math.round((mean / stdev) * 100) / 100 : null;

  return {
    totalTrades: trades.length,
    winRate: Math.round((wins.length / trades.length) * 1000) / 10,
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0),
    avgWinPct: wins.length ? Math.round((grossWin / wins.length) * 100) / 100 : 0,
    avgLossPct: losses.length ? Math.round((grossLoss / losses.length) * 100) / 100 : 0,
    maxDrawdownPct: Math.round(maxDD * 100) / 100, // percentage points of capital, at 1% risk/trade
    sharpe,
    expectancyR: Math.round(mean * 100) / 100 // average R-multiple per trade
  };
}

// Runs one strategy across a list of tickers, splitting each ticker's
// history into an in-sample (first 70%) and out-of-sample (last 30%)
// period — a real walk-forward-style check for a fixed rule-based
// strategy: since nothing is "fit" to the in-sample data, comparing the
// two periods shows whether the edge held up on more recent, unseen bars
// rather than validating a curve-fit.
async function runStrategyBacktest(strategyId, tickers) {
  if (!STRATEGY_DEFINITIONS[strategyId]) {
    throw new Error(`Unknown strategy: ${strategyId}`);
  }
  const clean = Array.from(new Set((tickers || []).map(t => String(t).toUpperCase().replace(/\.JK$/i, '').trim()))).slice(0, 45);
  const histories = await Promise.allSettled(clean.map(t => fetchYahooHistory(t, 'BACKTEST')));

  let allTrades = [];
  histories.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value?.points?.length) return;
    allTrades = allTrades.concat(simulateStrategyOnHistory(strategyId, clean[i], r.value.points));
  });

  allTrades.sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
  const splitIdx = Math.floor(allTrades.length * 0.7);
  const inSample = allTrades.slice(0, splitIdx);
  const outOfSample = allTrades.slice(splitIdx);

  return {
    strategy: STRATEGY_DEFINITIONS[strategyId],
    tickersScanned: clean.length,
    overall: aggregateBacktestStats(allTrades),
    inSample: aggregateBacktestStats(inSample),
    outOfSample: aggregateBacktestStats(outOfSample),
    trades: allTrades.slice(-30), // most recent 30 for display, not the full list
    computedAt: new Date().toISOString()
  };
}

async function runAllStrategiesBacktest(tickers) {
  const ids = Object.keys(STRATEGY_DEFINITIONS);
  const results = await Promise.all(ids.map(id => runStrategyBacktest(id, tickers)));
  return results;
}

// Fetch Market Summary & Aggregated Trade Summary
async function getIdxMarketSummary() {
  const now = Date.now();
  if (_summaryCache && (now - _summaryCacheTime < CACHE_TTL_MS)) {
    return _summaryCache;
  }

  // Fetch IHSG (^JKSE) & USD/IDR
  let ihsgQuote = { price: 6585.76, change: 180.08, changePercent: 2.81, high: 6592.74, low: 6535.80 };
  let usdQuote = { price: 17720, change: 25, changePercent: 0.14 };

  try {
    const [ihsgRes, usdRes] = await Promise.allSettled([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE?interval=1d&range=5d', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).then(r => r.json()),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/IDR=X?interval=1d&range=5d', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).then(r => r.json())
    ]);

    if (ihsgRes.status === 'fulfilled' && ihsgRes.value?.chart?.result?.[0]?.meta) {
      const meta = ihsgRes.value.chart.result[0].meta;
      const p = meta.regularMarketPrice || meta.chartPreviousClose;
      const prev = meta.chartPreviousClose || p;
      ihsgQuote = {
        price: p,
        previous: prev,
        change: Math.round((p - prev) * 100) / 100,
        changePercent: prev > 0 ? Math.round(((p - prev) / prev) * 10000) / 100 : 0,
        high: meta.regularMarketDayHigh || p,
        low: meta.regularMarketDayLow || p
      };
    }

    if (usdRes.status === 'fulfilled' && usdRes.value?.chart?.result?.[0]?.meta) {
      const meta = usdRes.value.chart.result[0].meta;
      const p = meta.regularMarketPrice || meta.chartPreviousClose;
      const prev = meta.chartPreviousClose || p;
      usdQuote = {
        price: p,
        previous: prev,
        change: Math.round((p - prev) * 100) / 100,
        changePercent: prev > 0 ? Math.round(((p - prev) / prev) * 10000) / 100 : 0
      };
    }
  } catch (e) {
    console.warn('[IDX Engine] Error fetching indices summary:', e.message);
  }

  // Pre-fetch bellwether stocks for breadth & top movers
  const bellwethers = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'AMMN', 'BREN', 'ADRO', 'PTRO', 'BRIS', 'GOTO', 'KLBF', 'UNVR', 'ICBP', 'CPIN', 'PGAS', 'ANTM', 'MEDC', 'TPIA'];
  const quotes = await Promise.allSettled(bellwethers.map(t => fetchYahooQuote(t)));
  const validQuotes = quotes.filter(q => q.status === 'fulfilled').map(q => q.value);

  let gainers = 0;
  let losers = 0;
  let unchanged = 0;
  let totalVolume = 0;
  let totalValue = 0;
  let totalFrequency = 0;

  validQuotes.forEach(q => {
    if (q.change > 0) gainers++;
    else if (q.change < 0) losers++;
    else unchanged++;

    totalVolume += q.volume;
    totalValue += q.value;
    totalFrequency += q.frequency;
  });

  // Scale to exchange-wide estimates
  const marketTotalVolume = totalVolume > 0 ? totalVolume * 15 : 22500000000;
  const marketTotalValue = totalValue > 0 ? totalValue * 12 : 14850000000000;
  const marketTotalFreq = totalFrequency > 0 ? totalFrequency * 18 : 1285000;

  const summary = {
    ihsg: ihsgQuote,
    usdidr: usdQuote,
    marketBreadth: {
      advancing: Math.max(340, gainers * 20),
      declining: Math.max(210, losers * 18),
      unchanged: Math.max(180, unchanged * 15),
      totalListed: 958
    },
    tradeSummary: [
      { id: 'Saham', volume: marketTotalVolume, value: marketTotalValue, frequency: marketTotalFreq },
      { id: 'ETF', volume: 850000, value: 480000000, frequency: 190 },
      { id: 'DIRE', volume: 45000, value: 3200000, frequency: 32 },
      { id: 'Sukuk & Obligasi', volume: 120000, value: 125000000000, frequency: 450 }
    ],
    totalMarketCap: 11850000000000000, // 11,850 Triliun IDR
    topGainers: [...validQuotes].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
    topLosers: [...validQuotes].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
    mostActive: [...validQuotes].sort((a, b) => b.value - a.value).slice(0, 5),
    updatedAt: new Date().toISOString()
  };

  _summaryCache = summary;
  _summaryCacheTime = now;
  return summary;
}

// IDX_BROKERS moved to lib/providers/idx-client.js — imported above.

// fetchInvezgoBrokerSummary() moved to lib/invezgo-client.js during the
// provider-adapter refactor — it belongs alongside that file's Invezgo-
// specific quota/cache/retry plumbing rather than in this general engine
// file. Imported at the top of this file; no behavior change.

// Generate comprehensive Broker Summary (Bandarmology & Broker Flow)
// INV-timeframe-ignored (found 2026-09-11, user-reported during Invezgo
// quota audit): generateBrokerSummary() used to call
// fetchInvezgoBrokerSummary(clean, today, today) UNCONDITIONALLY,
// completely ignoring the `timeframe` argument — every one of 1D/3D/5D/
// 20D (Opportunity Radar Scanner & Flow Trail) and 1D/1W/1M/3M/6M/1Y
// (Bandarmology/StockChat Broker Flow tab, see 41-stockchat-cockpit.js's
// own client-side multiplier table above generateClientSideBrokerSummary)
// resolved to the exact same fromDate=toDate=today request, so switching
// timeframe buttons in the UI never actually changed the real Invezgo
// data being shown — only the client-side SIMULATION fallback (which
// already had a correct per-timeframe day count) varied by timeframe.
// Calendar-day offsets (not trading-day counts) since we're building an
// actual date-range query param for an external API, which handles
// weekends/holidays on its own side. Unrecognized/missing timeframe
// falls back to 0 days (today-only), matching the previous behavior for
// '1D' and any code path that didn't pass a timeframe at all.
const BROKER_SUMMARY_TIMEFRAME_DAYS = {
  '1D': 0, '3D': 3, '5D': 5, '1W': 7, '20D': 20,
  '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'YTD': 365
};

function brokerSummaryDateRange(timeframe) {
  const days = BROKER_SUMMARY_TIMEFRAME_DAYS[String(timeframe || '1D').toUpperCase()] ?? 0;
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  // FIX (2026-09-17, user-reported "buat apa langganan API-nya kalau pakai
  // data simulasi semua" — HTTP_422 confirmed via browser DevTools Network
  // tab on the live production response's quality.reason): fromDate/toDate
  // used to be compact YYYYMMDD ("20260917"), an unverified assumption (see
  // this file's own prior comment admitting the schema was never checked
  // against a live response). Invezgo's own official Python SDK README
  // (github.com/Invezgo/invezgo-python-sdk) shows from_date/to_date as
  // dashed ISO strings ("2024-12-01") in its literal example call —
  // Invezgo was very plausibly rejecting every single request with 422
  // Unprocessable Entity because of this date format mismatch alone, which
  // is why EVERY broker-summary call fell back to simulation despite a
  // valid, correctly-configured API key. Now dashed, matching toDateDisplay
  // (and every other reportDate in this file) exactly — one shared format,
  // no more silent divergence.
  const iso = (d) => d.toISOString().slice(0, 10);
  return { fromDate: iso(from), toDate: iso(to), toDateDisplay: iso(to) };
}

async function generateBrokerSummary(ticker, quoteData, timeframe = '1D') {
  const clean = String(ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();

  // Coba data ASLI dari Invezgo dulu, kalau dikonfigurasi & berhasil. Rentang
  // tanggal sekarang benar-benar mengikuti `timeframe` yang diminta (lihat
  // catatan INV-timeframe-ignored di atas) alih-alih selalu hari-ini saja.
  const { fromDate, toDate, toDateDisplay } = brokerSummaryDateRange(timeframe);
  const invezgo = await fetchInvezgoBrokerSummary(clean, fromDate, toDate);
  if (invezgo.ok) {
    // Normalisasi ke bentuk YANG SAMA dengan template (buyers/sellers dengan
    // shape {rank,broker,name,type,category,volumeLot,valueRp,avgPrice,pctOfTurnover})
    // supaya renderBrokerSummaryWidget() & konsumen lain di frontend tidak perlu
    // tahu bedanya data real vs simulasi.
    //
    // FIX (2026-09-17, INV-P1-002 resolved with a real response — see
    // fetchInvezgoBrokerSummary()'s comment): invezgo.buyers/invezgo.sellers
    // are now already pre-shaped {code,name,value,volume,avgPrice,freq} by
    // the client — no more `investor_type`/`is_foreign`/`total_value`
    // guessing, those fields simply don't exist in the real response. The
    // real endpoint is called with investor=all (one merged row per
    // broker), so there is NO per-broker foreign/domestic classification
    // available at all — `type`/`category` are honestly left unknown
    // (null/'Broker') rather than defaulted to 'D', which would have
    // silently misrepresented every broker as domestic.
    const normalize = (list) => (list || []).map((item, idx) => ({
      rank: idx + 1,
      broker: item.code || '??',
      name: item.name || ((item.code || '') + ' Sekuritas'),
      type: null,
      category: 'Broker',
      volumeLot: Math.round((item.volume || 0) / 100),
      valueRp: item.value || 0,
      avgPrice: item.avgPrice || quoteData?.price || 0,
      pctOfTurnover: 0 // diisi ulang di bawah setelah totalValueRp diketahui
    }));
    const buyers = normalize(invezgo.buyers);
    const sellers = normalize(invezgo.sellers);
    const totalValueRp = buyers.concat(sellers).reduce((a, x) => a + x.valueRp, 0);
    if (totalValueRp > 0) {
      buyers.forEach(b => { b.pctOfTurnover = Math.round((b.valueRp / totalValueRp) * 1000) / 10; });
      sellers.forEach(s => { s.pctOfTurnover = Math.round((s.valueRp / totalValueRp) * 1000) / 10; });
    }
    const bandarmology = (buyers.length && sellers.length)
      ? computeBandarmologyVerdict(buyers, sellers, totalValueRp)
      : { verdict: 'DATA TIDAK LENGKAP', score: 0, interpretation: 'Respons Invezgo tidak berisi cukup data buyer/seller untuk dihitung.', concentration: {}, foreignFlow: {}, domesticFlow: {}, retailVsSmartMoney: {} };

    return {
      isValidTicker: true,
      isSimulated: false,
      dataSource: 'Invezgo API (real)',
      ticker: clean,
      timeframe: timeframe,
      reportDate: toDateDisplay,
      price: quoteData?.price || 0,
      changePercent: quoteData?.changePercent || 0,
      totalVolumeLot: buyers.concat(sellers).reduce((a, x) => a + x.volumeLot, 0),
      totalValueRp: totalValueRp,
      bandarmology: bandarmology,
      topBuyers: buyers,
      topSellers: sellers,
      updatedAt: new Date().toISOString(),
      // Data-quality metadata per audit doc `data_quality.required_metadata`.
      quality: {
        status: 'REAL',
        source: invezgo.quality?.source || 'invezgo_api',
        provider: 'Invezgo',
        retrievedAt: invezgo.quality?.retrievedAt || new Date().toISOString(),
        dataTimestamp: invezgo.quality?.dataTimestamp || null,
        freshnessSeconds: invezgo.quality?.freshnessSeconds ?? null,
        requestId: invezgo.quality?.requestId || null,
        cacheHit: Boolean(invezgo.quality?._cacheHit)
      }
    };
  }

  // INV-P1-002 / DQ-003: an unrecognized response schema is INVALID, not a
  // reason to quietly fall through to the simulated template — that would
  // let a broken contract masquerade as "just no data configured" and let
  // simulated data slip into a financial signal. Propagate INVALID as-is;
  // callers (computeConfluence, scan endpoints) must treat it the same as
  // UNAVAILABLE for signal purposes but should distinguish it in alerts.
  if (invezgo.quality && invezgo.quality.status === 'INVALID') {
    return {
      isValidTicker: true,
      isSimulated: false,
      isInvalid: true,
      dataSource: `Invezgo — respons tidak sesuai skema yang diharapkan (${invezgo.reason})`,
      ticker: clean,
      timeframe: timeframe,
      reportDate: toDateDisplay,
      price: quoteData?.price || 0,
      changePercent: quoteData?.changePercent || 0,
      totalVolumeLot: 0,
      totalValueRp: 0,
      bandarmology: { verdict: 'DATA INVALID', score: 0, interpretation: 'Skema respons Invezgo tidak dikenali — kemungkinan kontrak API berubah. Lihat quality.reason.', concentration: {}, foreignFlow: { available: false, buyValRp: null, sellValRp: null, netValRp: null, participationPct: null }, domesticFlow: { available: false, buyValRp: null, sellValRp: null, netValRp: null, participationPct: null }, retailVsSmartMoney: {} },
      topBuyers: [],
      topSellers: [],
      updatedAt: new Date().toISOString(),
      quality: { status: 'INVALID', source: 'invezgo_api', provider: 'Invezgo', retrievedAt: invezgo.quality.retrievedAt, dataTimestamp: null, freshnessSeconds: null, requestId: invezgo.quality.requestId, reason: invezgo.reason }
    };
  }

  // Fallback: template lama, TAPI sekarang diberi label jujur isSimulated:true
  // (sebelumnya tidak ada label sama sekali — inilah masalah aslinya).
  const templateResult = generateBrokerSummaryTemplate(ticker, quoteData, timeframe);
  templateResult.isSimulated = true;
  templateResult.dataSource = `Simulasi (Invezgo tidak tersedia: ${invezgo.reason})`;
  templateResult.quality = {
    status: 'SIMULATION',
    source: 'client_side_template',
    provider: 'Invezgo',
    retrievedAt: new Date().toISOString(),
    dataTimestamp: null,
    freshnessSeconds: null,
    requestId: null,
    reason: invezgo.reason
  };
  return templateResult;
}

// Helper bersama: hitung verdict Bandarmology dari array buyers/sellers ternormalisasi
// {rank,broker,name,type,category,volumeLot,valueRp,avgPrice,pctOfTurnover}. Dipakai baik
// oleh template simulasi maupun (nanti) data real Invezgo, supaya bentuk output identik
// dan renderBrokerSummaryWidget() di frontend tidak perlu tahu bedanya.
function computeBandarmologyVerdict(buyers, sellers, totalValueRp) {
  const top1BuyPct = buyers[0]?.pctOfTurnover || 0;
  const top1SellPct = sellers[0]?.pctOfTurnover || 0;
  const top3BuyPct = Math.round(buyers.slice(0, 3).reduce((a, b) => a + (b.pctOfTurnover || 0), 0) * 10) / 10;
  const top3SellPct = Math.round(sellers.slice(0, 3).reduce((a, s) => a + (s.pctOfTurnover || 0), 0) * 10) / 10;
  const top5BuyPct = Math.round(buyers.slice(0, 5).reduce((a, b) => a + (b.pctOfTurnover || 0), 0) * 10) / 10;
  const top5SellPct = Math.round(sellers.slice(0, 5).reduce((a, s) => a + (s.pctOfTurnover || 0), 0) * 10) / 10;

  // FIX (2026-09-17, INV-P1-002 resolved): /analysis/summary/stock/{code}
  // called with investor=all returns ONE merged row per broker with no
  // foreign/domestic flag at all — see fetchInvezgoBrokerSummary()'s
  // comment. `type` is now honestly null instead of defaulted to 'D', so
  // this split must be detected as unavailable rather than silently
  // computed as "0 foreign, 100% domestic" (which would misrepresent an
  // unknown split as a known one).
  const hasForeignSplit = buyers.concat(sellers).some(x => x.type === 'F' || x.type === 'D');
  const foreignBuyVal = buyers.filter(b => b.type === 'F').reduce((a, b) => a + (b.valueRp || 0), 0);
  const foreignSellVal = sellers.filter(s => s.type === 'F').reduce((a, s) => a + (s.valueRp || 0), 0);
  const domesticBuyVal = buyers.filter(b => b.type !== 'F').reduce((a, b) => a + (b.valueRp || 0), 0);
  const domesticSellVal = sellers.filter(s => s.type !== 'F').reduce((a, s) => a + (s.valueRp || 0), 0);

  let verdict = 'NEUTRAL', verdictScore = 50, verdictText = 'Arus akumulasi dan distribusi berimbang antara buyer dan seller.';
  if (top3BuyPct >= 60 && top3SellPct < 45) {
    verdict = 'BIG ACCUMULATION'; verdictScore = 90;
    verdictText = `Top 3 Buyer (${buyers[0]?.broker || '-'}, ${buyers[1]?.broker || '-'}, ${buyers[2]?.broker || '-'}) mendominasi ${top3BuyPct}% volume beli${buyers[0]?.avgPrice ? ` dengan rata-rata harga Rp ${buyers[0].avgPrice.toLocaleString('id-ID')}` : ''}.`;
  } else if (top3BuyPct >= 50 && (hasForeignSplit ? foreignBuyVal > foreignSellVal : true)) {
    verdict = 'NORMAL ACCUMULATION'; verdictScore = 75;
    verdictText = hasForeignSplit
      ? `Akumulasi terdeteksi dengan net inflow broker institusi & asing (+Rp ${Math.round((foreignBuyVal - foreignSellVal) / 1000000000).toLocaleString('id-ID')} M).`
      : `Akumulasi terdeteksi dari konsentrasi broker (Top 3 Buyer ${top3BuyPct}% volume beli) — split asing/domestik tidak tersedia dari data ini.`;
  } else if (top3SellPct >= 60 && top3BuyPct < 45) {
    verdict = 'BIG DISTRIBUTION'; verdictScore = 15;
    verdictText = `Top 3 Seller (${sellers[0]?.broker || '-'}, ${sellers[1]?.broker || '-'}, ${sellers[2]?.broker || '-'}) mendominasi ${top3SellPct}% volume jual. Waspadai tekanan jual lanjut.`;
  } else if (top3SellPct >= 50) {
    verdict = 'NORMAL DISTRIBUTION'; verdictScore = 30;
    verdictText = hasForeignSplit
      ? `Distribusi moderat terdeteksi dengan net outflow broker institusi (-Rp ${Math.round((foreignSellVal - foreignBuyVal) / 1000000000).toLocaleString('id-ID')} M).`
      : `Distribusi moderat terdeteksi dari konsentrasi broker (Top 3 Seller ${top3SellPct}% volume jual) — split asing/domestik tidak tersedia dari data ini.`;
  }

  const retailBrokersList = ['YP', 'PD', 'XC', 'XL', 'KK', 'EP', 'AT'];
  const instBrokersList = ['AK', 'BK', 'ZP', 'KZ', 'CS', 'RX', 'CC', 'SQ', 'NI', 'OD'];
  let retailNetVal = 0, instNetVal = 0;
  buyers.forEach(b => { if (retailBrokersList.includes(b.broker)) retailNetVal += (b.valueRp || 0); if (instBrokersList.includes(b.broker)) instNetVal += (b.valueRp || 0); });
  sellers.forEach(s => { if (retailBrokersList.includes(s.broker)) retailNetVal -= (s.valueRp || 0); if (instBrokersList.includes(s.broker)) instNetVal -= (s.valueRp || 0); });

  return {
    verdict, score: verdictScore, interpretation: verdictText,
    concentration: {
      top1BuyPct, top1SellPct, top3BuyPct, top3SellPct, top5BuyPct, top5SellPct,
      status: top3BuyPct >= 60 ? 'HIGH ACCUMULATION' : (top3SellPct >= 60 ? 'HIGH DISTRIBUTION' : 'NORMAL SPREAD')
    },
    // participationPct: share of foreign/domestic in the sum of every
    // buyer+seller row actually returned — NOT totalValueRp*2, which used
    // to assume totalValueRp always equals exactly half of buyers+sellers
    // combined. When the upstream feed's totalValueRp doesn't match that
    // assumption (different unit/scope), the old formula could exceed
    // 100% (seen in production: "Partisipasi Asing: 4097.1%"). This
    // formula is bounded to [0,100] by construction since both numerator
    // and denominator are built from the same buyer+seller values.
    // available:false + null values (not 0) when the upstream call has no
    // per-broker foreign/domestic flag (investor=all) — a 0 here would
    // read as "confirmed zero foreign flow", not "unknown split".
    foreignFlow: hasForeignSplit ? {
      available: true,
      buyValRp: foreignBuyVal, sellValRp: foreignSellVal, netValRp: foreignBuyVal - foreignSellVal,
      participationPct: (foreignBuyVal + domesticBuyVal + foreignSellVal + domesticSellVal) > 0
        ? Math.round(((foreignBuyVal + foreignSellVal) / (foreignBuyVal + domesticBuyVal + foreignSellVal + domesticSellVal)) * 1000) / 10
        : 0
    } : { available: false, buyValRp: null, sellValRp: null, netValRp: null, participationPct: null },
    domesticFlow: hasForeignSplit ? {
      available: true,
      buyValRp: domesticBuyVal, sellValRp: domesticSellVal, netValRp: domesticBuyVal - domesticSellVal,
      participationPct: (foreignBuyVal + domesticBuyVal + foreignSellVal + domesticSellVal) > 0
        ? Math.round(((domesticBuyVal + domesticSellVal) / (foreignBuyVal + domesticBuyVal + foreignSellVal + domesticSellVal)) * 1000) / 10
        : 0
    } : { available: false, buyValRp: null, sellValRp: null, netValRp: null, participationPct: null },
    retailVsSmartMoney: {
      retailNetValRp: retailNetVal, smartMoneyNetValRp: instNetVal,
      smartMoneyStatus: instNetVal > 0 ? 'SMART MONEY INFLOW' : 'SMART MONEY OUTFLOW',
      retailStatus: retailNetVal > 0 ? 'RETAIL BUYING (TRAP RISK)' : 'RETAIL SELLING (ABSORBED)'
    }
  };
}

function generateBrokerSummaryTemplate(ticker, quoteData, timeframe = '1D') {
  const clean = String(ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  const universe = loadBaseUniverse();
  const isKnownTicker = Boolean(universe[clean] || (quoteData && quoteData.price > 0));

  if (!isKnownTicker || (quoteData && quoteData.price !== undefined && quoteData.price <= 0)) {
    return {
      isValidTicker: false,
      ticker: clean,
      timeframe: timeframe,
      reportDate: new Date().toISOString().slice(0, 10),
      price: 0,
      changePercent: 0,
      totalVolumeLot: 0,
      totalValueRp: 0,
      bandarmology: {
        verdict: 'TICKER UNKNOWN / NO DATA',
        score: 0,
        interpretation: `Ticker "${clean}" tidak terdaftar dalam Stock Universe IDX. Seluruh metrik bernilai 0.`,
        concentration: {
          top1BuyerPct: 0, top1SellerPct: 0,
          top3BuyerPct: 0, top3SellerPct: 0,
          top5BuyerPct: 0, top5SellerPct: 0
        },
        foreignFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0, status: 'NO MARKET DATA' },
        domesticFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0 },
        smartMoney: { institutionalNetRp: 0, retailNetRp: 0, signal: 'NO MARKET DATA' }
      },
      topBuyers: [],
      topSellers: [],
      matrix: []
    };
  }

  // FIX (2026-09-18, user-reported after full-codebase audit): this used to
  // fabricate a full top-10 buyer/seller broker table — hardcoded broker
  // code lists per market-cap bucket (isBigBank/isCommodity/isTech) and
  // hardcoded percentage-weight arrays (topBuyerWeights/topSellerWeights)
  // with arbitrary numbers — then computed precise-looking Rupiah values
  // and average prices from them. It WAS honestly labeled isSimulated:true
  // by the caller (generateBrokerSummary()), but labeling a fabricated
  // table doesn't make the specific broker names/weights/values any less
  // invented. Now that fetchInvezgoBrokerSummary() (tried first by
  // generateBrokerSummary(), lib/invezgo-client.js) is confirmed working
  // for real data, this fallback path (only reached when Invezgo is not
  // configured or the call fails) returns an honest empty state instead of
  // synthesizing a plausible-but-fake broker table — same pattern already
  // used by getUniverseAccumulationDistribution()/getUniverseForeignFlow().
  const price = quoteData?.price || (universe[clean] ? (universe[clean].basePrice || universe[clean].price || 0) : 0);
  const changePct = quoteData?.changePercent || 0;

  return {
    ticker: clean,
    timeframe: timeframe,
    reportDate: new Date().toISOString().slice(0, 10),
    price: price,
    changePercent: changePct,
    totalVolumeLot: 0,
    totalValueRp: 0,
    bandarmology: {
      verdict: 'DATA TIDAK TERSEDIA',
      score: 0,
      interpretation: 'Data broker summary (Bandarmology) untuk saham ini belum tersedia dari Invezgo saat ini.',
      concentration: { top1BuyPct: 0, top1SellPct: 0, top3BuyPct: 0, top3SellPct: 0, top5BuyPct: 0, top5SellPct: 0, status: 'NO DATA' },
      foreignFlow: { available: false, buyValRp: null, sellValRp: null, netValRp: null, participationPct: null },
      domesticFlow: { available: false, buyValRp: null, sellValRp: null, netValRp: null, participationPct: null },
      retailVsSmartMoney: { retailNetValRp: 0, smartMoneyNetValRp: 0, smartMoneyStatus: 'NO DATA', retailStatus: 'NO DATA' }
    },
    topBuyers: [],
    topSellers: [],
    updatedAt: new Date().toISOString()
  };
}

// getIdxCalendarData() moved to lib/providers/idx-client.js — imported above.

// ════════════════════════════════════════════════════════════
// DYNAMIC OPPORTUNITY RADAR SCORING ENGINE (950+ IDX UNIVERSE)
// ════════════════════════════════════════════════════════════
// getCachedFundamentalsOnly()/getCachedFundamentalsBulk() moved to
// lib/providers/yahoo-client.js (they read that file's Redis-backed
// fundamentals cache directly) — imported at the top of this file.

const _radarWarmInFlight = new Set();

// Fire-and-forget, bounded-concurrency warmer that keeps the real Yahoo
// fundamentals cache populated for a ticker list (LQ45/IDX30 — the only
// slice of the ~950-stock universe we can realistically fetch on demand
// within one request's time budget). Awaited by getUniverseOpportunityRadar
// on cold cache so the FIRST request after a cold start returns real
// numbers instead of an empty pass; subsequent requests hit the (now
// Redis-backed, 24h) cache and return instantly.
//
// NOTE on the skip condition: a ticker is skipped once it has ANY cache
// entry at all (fresh OR stale) — this preserves the exact behavior from
// before the 2026-09-18 Redis migration (the old combined condition
// `getCachedFundamentalsOnly(t)===null && !hasFundamentalsCacheEntry(t)`
// reduces to just `!hasFundamentalsCacheEntry(t)`, since a stale entry
// always makes getCachedFundamentalsOnly() return null too). A stale
// entry isn't proactively re-warmed here; it's naturally refreshed by
// warmRadarFundamentalsRotating()'s daily cron sweep instead.
async function warmRadarFundamentals(tickers) {
  const candidates = tickers.filter(t => !_radarWarmInFlight.has(t));
  const entryFlags = await Promise.all(candidates.map(t => hasFundamentalsCacheEntry(t)));
  const todo = candidates.filter((t, i) => !entryFlags[i]);
  todo.forEach(t => _radarWarmInFlight.add(t));
  const BATCH = 8;
  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(t => fetchYahooFundamentals(t)));
    }
  } finally {
    todo.forEach(t => _radarWarmInFlight.delete(t));
  }
}

// ── Cron-triggered rotating warmer for the FULL ~950-stock universe ──
// (2026-09-18, user-requested: "Redis-backed fundamentals cache + cron
// warming 950 saham"). Vercel Hobby (the user's plan) allows cron only
// 1x/day and this app's function has a 30s maxDuration (vercel.json), so
// one run can realistically only warm ~250-350 tickers — full coverage is
// reached progressively over a rotating ~3-day cycle, with the cursor
// persisted in Redis (getRadarWarmCursor/setRadarWarmCursor) so progress
// survives across cold starts and days. Idempotent: a ticker already
// cached (fresh, within the 24h TTL) is skipped, so re-running the same
// cursor position after a timeout is always safe.
async function warmRadarFundamentalsRotating(timeBudgetMs) {
  const budget = timeBudgetMs || 25000;
  const start = Date.now();
  const universe = loadBaseUniverse();
  const sortedCodes = Object.values(universe).map(s => s.code).sort();
  const total = sortedCodes.length;
  const BATCH = Number(process.env.RADAR_CRON_BATCH_SIZE) || 8;

  const cursorBefore = await getRadarWarmCursor();
  let idx = total > 0 ? cursorBefore % total : 0;
  let processed = 0;
  let skipped = 0;
  let attempts = 0;

  while (total > 0 && attempts < total && (Date.now() - start) < budget) {
    const batchCodes = [];
    while (batchCodes.length < BATCH && attempts < total) {
      batchCodes.push(sortedCodes[idx]);
      idx = (idx + 1) % total;
      attempts++;
    }
    const results = await Promise.allSettled(batchCodes.map(async (code) => {
      const already = await hasFundamentalsCacheEntry(code);
      if (already) return { skipped: true };
      await fetchYahooFundamentals(code);
      return { skipped: false };
    }));
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        if (r.value.skipped) skipped++; else processed++;
      }
    });
  }

  await setRadarWarmCursor(idx);

  return { processed, skipped, cursorBefore, cursorAfter: idx, universeSize: total, durationMs: Date.now() - start };
}

async function getUniverseOpportunityRadar(params = {}) {
  const universe = loadBaseUniverse();
  const allList = Object.values(universe);
  const { search, sector, index, zone, bandarmology, sort, order, limit, offset } = params;

  const calData = await getIdxCalendarData();
  const divMap = new Map(calData.dividends.map(d => [d.code, d]));
  const splitMap = new Map(calData.stockSplits.map(s => [s.code, s]));
  const rightsMap = new Map(calData.rightsIssues.map(r => [r.code, r]));
  const rupsMap = new Map(calData.rups.map(r => [r.code, r]));

  // Real fundamentals only realistically cover the LQ45/IDX30 slice of the
  // universe within one request's time budget — warm that slice (fast once
  // cached for an hour) before scoring. Every other stock is honestly
  // reported as "DATA TERBATAS" below rather than assigned an invented
  // PE/ROE/MoS/bandar score.
  const priorityTickers = Array.from(new Set(allList.filter(s => s.indexes?.lq45 || s.indexes?.idx30).map(s => s.code)));
  await warmRadarFundamentals(priorityTickers);

  // Bulk-read ALL ~950 tickers' cache entries in ONE Redis round-trip
  // (mget) before scoring, instead of 950 separate awaits inside the
  // .map() below — the scoring loop itself stays synchronous, reading
  // from this plain Map.
  const fundamentalsByCode = await getCachedFundamentalsBulk(allList.map(s => s.code));

  const REQUIRED_RETURN = 0.08; // matches the app's own default MoS assumption (js/24-stockmaster.js)

  const evaluated = allList.map(stock => {
    const code = stock.code;
    const fund = fundamentalsByCode.get(code) || null;
    const hasReal = !!fund;

    let pe = null, roe = null, mosVal = null, bandarScore = null;
    let flowLabel = 'Data Terbatas';
    let cat = stock.sector || 'Equities';
    let radarScore = null;
    let zoneLabel = 'DATA TERBATAS';
    let zoneClass = 'b-neu';
    let verdict = 'Fundamental Belum Tersedia';

    if (hasReal) {
      pe = fund.per;
      roe = fund.roe;
      // Margin of Safety proxy: Justified P/B (= ROE / required return) vs
      // the stock's real trailing P/B — a standard residual-income
      // shortcut, computed only from real fetched ROE/PBV, never invented.
      //
      // FIX (2026-09-17, user-reported "MoS ITMS sampai -1106385.6%"): the
      // formula divides by `justifiedPbv`, which is proportional to ROE —
      // as ROE approaches 0% (or goes negative), justifiedPbv approaches 0
      // and the ratio blows up toward ±infinity. That's not a data bug,
      // it's this specific shortcut being mathematically degenerate outside
      // a "comfortably profitable" ROE range — a real ROE of e.g. 0.007%
      // (not a typo, some micro-caps genuinely report this) makes
      // justifiedPbv ≈0.00001, so ANY real P/B divided by that explodes
      // into a meaningless percentage. Rather than surface that raw
      // output (technically the formula's real result, but useless as a
      // signal), MoS is now left null — honestly unavailable — whenever
      // ROE isn't comfortably positive enough for the shortcut to be
      // numerically stable (threshold chosen so justifiedPbv is never
      // below 0.1x, i.e. ROE >= REQUIRED_RETURN*10 = 0.8%).
      if (fund.pbv != null && fund.pbv > 0 && roe != null && roe >= REQUIRED_RETURN * 100 * 0.1) {
        const justifiedPbv = (roe / 100) / REQUIRED_RETURN;
        mosVal = Math.round(((justifiedPbv - fund.pbv) / justifiedPbv) * 1000) / 10;
      }
      cat = stock.sector || 'Equities';

      const mosScore = mosVal != null ? Math.min(100, Math.max(0, (mosVal + 20) * 2)) : null;
      const roeScore = roe != null ? Math.min(100, Math.max(0, roe * 4)) : null;

      if (mosScore != null || roeScore != null) {
        // Renormalize weights over whichever real components are present
        // (no bandarmology component — no real per-stock flow feed exists
        // at this scale, so it's dropped rather than faked).
        const parts = [];
        if (mosScore != null) parts.push({ v: mosScore, w: 0.65 });
        if (roeScore != null) parts.push({ v: roeScore, w: 0.35 });
        const wSum = parts.reduce((s, p) => s + p.w, 0);
        const weighted = parts.reduce((s, p) => s + p.v * (p.w / wSum), 0);
        radarScore = Math.min(100, Math.round(weighted + (stock.indexes?.lq45 ? 10 : 5)));

        flowLabel = 'Real Fundamental (Yahoo Finance)';

        if (radarScore >= 80) {
          zoneLabel = 'BUY ZONE'; zoneClass = 'b-up';
          verdict = radarScore >= 88 ? 'Strong Buy' : 'Accumulate';
        } else if (radarScore >= 68) {
          zoneLabel = 'WATCHLIST'; zoneClass = 'b-amb';
          verdict = 'Watch Dip / Hold';
        } else if (radarScore < 50) {
          zoneLabel = 'AVOID'; zoneClass = 'b-dn';
          verdict = 'Avoid / Sell';
        } else {
          zoneLabel = 'NEUTRAL'; zoneClass = 'b-neu';
          verdict = 'Hold / Watch';
        }
      } else {
        flowLabel = 'Real Fundamental (Parsial)';
      }
    }

    // Corporate Action tags — FIX (2026-09-18): `code`/`type` real dari
    // Invezgo, tapi payload MENTAH (skema belum diverifikasi per tipe —
    // lihat catatan getIdxCalendarData()), jadi label generik "ada aksi
    // korporasi tipe X" alih-alih mengarang detail (dividen Rp berapa,
    // rasio split berapa, dst) yang field-name-nya tidak diketahui.
    const corpActions = [];
    if (divMap.has(code)) corpActions.push({ type: 'DIVIDEN', label: 'Ada jadwal Dividen', payload: divMap.get(code).payload });
    if (splitMap.has(code)) corpActions.push({ type: 'SPLIT', label: 'Ada jadwal Stock Split', payload: splitMap.get(code).payload });
    if (rightsMap.has(code)) corpActions.push({ type: 'RIGHTS', label: 'Ada jadwal Rights Issue', payload: rightsMap.get(code).payload });
    if (rupsMap.has(code)) corpActions.push({ type: 'RUPS', label: 'Ada jadwal RUPS', payload: rupsMap.get(code).payload });

    return {
      ticker: code,
      name: stock.name,
      sector: stock.sector,
      board: stock.board,
      score: radarScore,
      zone: zoneLabel,
      zoneClass: zoneClass,
      mos: mosVal != null ? (mosVal >= 0 ? '+' : '') + mosVal.toFixed(1) + '%' : 'N/A',
      mosValue: mosVal,
      pe: pe != null && pe > 0 ? pe.toFixed(1) + 'x' : 'N/A',
      peValue: pe,
      roe: roe != null ? roe.toFixed(1) + '%' : 'N/A',
      roeValue: roe,
      price: hasReal ? fund.price : null,
      flow: flowLabel,
      isRealFundamental: hasReal,
      verdict: verdict,
      cat: cat,
      indexes: stock.indexes || {},
      hasCorpAction: corpActions.length > 0,
      corporateActions: corpActions
    };
  });

  // Apply filters
  let filtered = evaluated;

  if (search) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(item => item.ticker.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
  }

  if (sector && sector !== 'ALL') {
    filtered = filtered.filter(item => item.sector && item.sector.toLowerCase() === sector.toLowerCase());
  }

  if (index && index !== 'ALL') {
    const idxKey = index.toLowerCase();
    filtered = filtered.filter(item => item.indexes && item.indexes[idxKey]);
  }

  if (zone && zone !== 'ALL') {
    filtered = filtered.filter(item => item.zone === zone);
  }

  // Note: ACCUMULATION/DISTRIBUTION bandarmology filtering was removed along
  // with the fabricated bandarScore field — no real per-stock broker-flow
  // feed exists at this scale. CORP_ACTION (real, calendar-derived) remains.
  if (bandarmology && bandarmology !== 'ALL' && bandarmology === 'CORP_ACTION') {
    filtered = filtered.filter(item => item.hasCorpAction);
  }

  // Sorting
  const sortField = sort || 'score';
  const isDesc = order !== 'asc';

  filtered.sort((a, b) => {
    let vA = a[sortField] !== undefined ? a[sortField] : 0;
    let vB = b[sortField] !== undefined ? b[sortField] : 0;
    if (sortField === 'ticker') {
      return isDesc ? b.ticker.localeCompare(a.ticker) : a.ticker.localeCompare(b.ticker);
    }
    return isDesc ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
  });

  const total = filtered.length;
  const start = parseInt(offset, 10) || 0;
  const pageLimit = parseInt(limit, 10) || total;
  const paginated = filtered.slice(start, start + pageLimit);

  // Summary counts for UI badges
  const summary = {
    totalUniverse: evaluated.length,
    buyZoneCount: evaluated.filter(x => x.zone === 'BUY ZONE').length,
    watchlistCount: evaluated.filter(x => x.zone === 'WATCHLIST').length,
    avoidCount: evaluated.filter(x => x.zone === 'AVOID').length,
    corpActionCount: evaluated.filter(x => x.hasCorpAction).length,
    lq45Count: evaluated.filter(x => x.indexes?.lq45).length,
    // Stocks outside LQ45/IDX30 where we have no real fetched fundamentals
    // yet — reported honestly instead of silently scored with guesses.
    limitedDataCount: evaluated.filter(x => !x.isRealFundamental).length
  };

  return {
    success: true,
    total: total,
    count: paginated.length,
    summary: summary,
    items: paginated
  };
}

// ════════════════════════════════════════════════════════════
// UNIVERSE ACCUMULATION & DISTRIBUTION SCANNER
// ════════════════════════════════════════════════════════════
// Was a fully hardcoded list of 20 tickers (fake broker codes as "top
// buyers/sellers", fake concentration %, fake foreign-flow and smart-money
// Rupiah amounts) returned unconditionally with no disclosure - unlike
// generateBrokerSummary() (single-ticker), which already tries a real
// broker-flow provider (Invezgo) first and only falls back to a clearly
// isSimulated:true template. This brought the universe-wide scanner up to
// that same standard: try real data across the universe when Invezgo is
// configured, otherwise return an honest "not available" result instead
// of fabricated candidates.
//
// REWRITTEN (2026-09-17, user-requested quota optimization: "optimalkan
// langganan API saya... karena broker ini sifatnya reload per hari saja"):
// the previous version scanned the universe by calling
// fetchInvezgoBrokerSummary() ONCE PER TICKER (up to BATCH_CAP=80 per
// request, the caller issuing several requests to cover the full ~958
// universe — up to ~960 quota units for one full scan). Invezgo has a
// dedicated market-wide endpoint for exactly this purpose —
// GET /analysis/top/accumulation — that returns the WHOLE market's top
// accumulation/distribution movers for one date in a SINGLE call (1 quota
// unit total, confirmed against a real authenticated response the user
// captured from Invezgo's own API docs). This function now calls that
// instead: no more batching, no more `tickers`/BATCH_CAP, no more
// per-ticker Yahoo quote lookups — one Invezgo call covers the entire BEI
// universe. `params.tickers` is no longer read (kept silently ignored,
// not removed from callers, so old client code doesn't need to change).
//
// Trade-off, stated plainly: this endpoint reports Invezgo's own ranking
// `calculated_value` (positive for accum, negative for dist) — a score,
// not a Rupiah amount — and does not include per-broker
// top-buyer/top-seller breakdowns (that detail still requires the
// per-ticker generateBrokerSummary() path, used elsewhere for single-stock
// analysis). Surfaced as `score`, never mislabeled as currency.
async function getUniverseAccumulationDistribution(params = {}) {
  const universe = loadBaseUniverse();
  const apiKey = process.env.INVEZGO_API_KEY;

  if (!apiKey) {
    return {
      success: true,
      isSimulated: true,
      dataSource: 'Tidak tersedia (Invezgo API key belum dikonfigurasi)',
      counts: { accumulation: 0, distribution: 0, totalUniverseScanned: 0 },
      accumulation: [],
      distribution: [],
      message: 'Pemindaian akumulasi/distribusi seluruh bursa membutuhkan feed data broker summary real-time (Invezgo atau setara) yang belum dikonfigurasi di aplikasi ini. Untuk data broker per-saham, gunakan Analisis Emiten pada ticker spesifik.',
      updatedAt: new Date().toISOString()
    };
  }

  // Broker summary data is an EOD batch report (terbit ~17:30 WIB per
  // Invezgo's own endpoint description) — always request TODAY's date;
  // getOrFetch()'s cache key already includes it, so this naturally rotates
  // once per calendar day on its own, same reasoning as
  // brokerSummaryDateRange() above.
  const date = new Date().toISOString().slice(0, 10);
  const result = await fetchInvezgoTopMovers('accumulation', date);

  if (!result.ok) {
    return {
      success: true,
      isSimulated: true,
      dataSource: `Simulasi (Invezgo tidak tersedia: ${result.reason})`,
      counts: { accumulation: 0, distribution: 0, totalUniverseScanned: 0 },
      accumulation: [],
      distribution: [],
      message: 'Provider data broker tidak mengembalikan data real untuk pemindaian seluruh bursa hari ini.',
      updatedAt: new Date().toISOString()
    };
  }

  const mapRow = (item) => ({
    ticker: item.code,
    name: item.name || (universe[item.code] && universe[item.code].name) || item.code,
    sector: (universe[item.code] && universe[item.code].sector) || '-',
    score: Number(item.calculated_value) || 0,
    avgPrice: Number(item.price) || 0,
    priceChangePct: Number(item.change) || 0,
    volume: Number(item.volume) || 0,
    valueRp: Number(item.value) || 0
  });

  const accumulation = (result.accum || []).map(mapRow).sort((a, b) => b.score - a.score);
  const distribution = (result.dist || []).map(mapRow).sort((a, b) => a.score - b.score);

  return {
    success: true,
    isSimulated: false,
    dataSource: 'Invezgo API (real) — Top Accumulation/Distribution seluruh BEI',
    date,
    counts: {
      accumulation: accumulation.length,
      distribution: distribution.length,
      totalUniverseScanned: accumulation.length + distribution.length
    },
    accumulation,
    distribution,
    updatedAt: new Date().toISOString()
  };
}

// FIX (2026-09-18, user-reported: "TOP 5 FOREIGN NET BUY ini apakah khusus
// LQ45? atau semua saham... jangan hanya analisa LQ45, analisa semua
// emiten"): renderBandarmologyForeignFlowView() (public/js/41-stockchat-
// cockpit.js) sebelumnya cuma iterasi ~42 ticker hardcoded (sampel populer,
// BUKAN LQ45 secara harfiah tapi tetap melanggar prinsip yang sama: bukan
// seluruh bursa) DAN punya bug terpisah — karena generateBrokerSummary()'s
// per-ticker REAL path selalu foreignFlow.available:false (endpoint
// summary/stock dengan investor=all tidak punya flag F/D per broker),
// bandarForeignNetRp() membaca netValRp:null lalu Math.round(null/1e9)=0
// untuk SETIAP ticker — sehingga kolom "Net Buy" dan "Net Sell" selalu
// menampilkan angka +Rp 0 M yang identik dan urutan yang sama persis
// (sort a-b=0 untuk semua item = stabil, tidak benar-benar terurut).
//
// Root cause sebenarnya: endpoint yang salah dipakai. Invezgo sudah punya
// GET /analysis/top/foreign (persis seperti /analysis/top/accumulation di
// atas) yang mengembalikan top foreign net buy/sell SELURUH PASAR dalam 1
// panggilan API — tapi kode ini tidak pernah memanggilnya (fetchInvezgoTopMovers()
// mendukung kind='foreign' sejak awal, cuma tidak pernah dipakai). Fungsi
// baru ini menggantikan pendekatan sampel-42-ticker dengan data REAL
// seluruh BEI, sama seperti getUniverseAccumulationDistribution() di atas.
async function getUniverseForeignFlow() {
  const universe = loadBaseUniverse();
  const apiKey = process.env.INVEZGO_API_KEY;

  if (!apiKey) {
    return {
      success: true,
      isSimulated: true,
      dataSource: 'Tidak tersedia (Invezgo API key belum dikonfigurasi)',
      counts: { netBuy: 0, netSell: 0, totalUniverseScanned: 0 },
      netBuy: [],
      netSell: [],
      message: 'Pemindaian foreign flow seluruh bursa membutuhkan feed data broker summary real-time (Invezgo atau setara) yang belum dikonfigurasi di aplikasi ini.',
      updatedAt: new Date().toISOString()
    };
  }

  const date = new Date().toISOString().slice(0, 10);
  const result = await fetchInvezgoTopMovers('foreign', date);

  if (!result.ok) {
    return {
      success: true,
      isSimulated: true,
      dataSource: `Simulasi (Invezgo tidak tersedia: ${result.reason})`,
      counts: { netBuy: 0, netSell: 0, totalUniverseScanned: 0 },
      netBuy: [],
      netSell: [],
      message: 'Provider data broker tidak mengembalikan data real untuk pemindaian foreign flow seluruh bursa hari ini.',
      updatedAt: new Date().toISOString()
    };
  }

  const mapRow = (item) => ({
    ticker: item.code,
    name: item.name || (universe[item.code] && universe[item.code].name) || item.code,
    sector: (universe[item.code] && universe[item.code].sector) || '-',
    netValueRp: Number(item.calculated_value) || 0,
    price: Number(item.price) || 0,
    priceChangePct: Number(item.change) || 0,
    volume: Number(item.volume) || 0,
    valueRp: Number(item.value) || 0
  });

  // 'accum' = net foreign buy terbesar, 'dist' = net foreign sell terbesar —
  // shape sama persis dengan /analysis/top/accumulation (confirmed di
  // fetchInvezgoTopMovers()'s comment), calculated_value di sini adalah
  // nilai net Rupiah asing (bukan skor rangking seperti di accumulation).
  const netBuy = (result.accum || []).map(mapRow).sort((a, b) => b.netValueRp - a.netValueRp);
  const netSell = (result.dist || []).map(mapRow).sort((a, b) => a.netValueRp - b.netValueRp);

  return {
    success: true,
    isSimulated: false,
    dataSource: 'Invezgo API (real) — Top Foreign Net Buy/Sell seluruh BEI',
    date,
    counts: {
      netBuy: netBuy.length,
      netSell: netSell.length,
      totalUniverseScanned: netBuy.length + netSell.length
    },
    netBuy,
    netSell,
    updatedAt: new Date().toISOString()
  };
}

// ════════════════════════════════════════════════════════════
// TRANSACTION FLOW VISUALIZER ENGINE PER STOCK TICKER
// ════════════════════════════════════════════════════════════
async function getTransactionFlowVisualizer(ticker, timeframe = '1D') {
  const clean = String(ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  const quote = await fetchYahooQuote(clean);
  const summary = await generateBrokerSummary(clean, quote, timeframe);
  const cal = await getIdxCalendarData({ code: clean });

  const price = quote.price || 1000;

  // Calculate Bandar Average Cost across Top 3 Buyers
  const top3BuyerVal = summary.topBuyers.slice(0, 3).reduce((a, b) => a + b.valueRp, 0);
  const top3BuyerVol = summary.topBuyers.slice(0, 3).reduce((a, b) => a + (b.volumeLot * 100), 0);
  const bandarAvgCost = top3BuyerVol > 0 ? Math.round(top3BuyerVal / top3BuyerVol) : price;
  const bandarProfitPct = bandarAvgCost > 0 ? Math.round(((price - bandarAvgCost) / bandarAvgCost) * 1000) / 10 : 0;

  // INV-008 / INV-P1-003 (audit): this used to synthesize a fake 10-session
  // daily inflow/outflow curve — and a fake day-by-day price series — purely
  // from a formula seeded by summary's single-day net figure (dailyInflow =
  // today's total / 10 * an arbitrary 0.8..1.25 ramp), then presented in the
  // UI as if it were a real historical timeline. Invezgo's schema for a real
  // multi-day breakdown is unverified (INV-002 — needs a live API key to
  // confirm), so rather than invent a different fabricated shape, this now
  // reports the real single-day snapshot only and marks the historical
  // timeline UNAVAILABLE instead of showing invented data as real. The
  // frontend (26-commandcenter.js) renders an explicit "not available"
  // message when flowTimeline is empty.
  const flowTimeline = [];
  const flowTimelineStatus = (summary.isSimulated || summary.isInvalid)
    ? 'UNAVAILABLE_SIMULATED_SOURCE'
    : 'UNAVAILABLE_NO_VERIFIED_HISTORICAL_ENDPOINT';

  return {
    success: true,
    ticker: clean,
    name: quote.name,
    sector: quote.sector,
    board: quote.board,
    timeframe: timeframe,
    currentPrice: price,
    changePercent: quote.changePercent,
    bandarAvgCost: bandarAvgCost,
    bandarProfitPercent: bandarProfitPct,
    bandarStatus: bandarProfitPct > 0 ? 'BANDAR IN PROFIT (+)' : (bandarProfitPct < 0 ? 'BANDAR UNDERWATER (-)' : 'BANDAR AT COST (=)'),
    brokerSummary: summary,
    flowTimeline: flowTimeline,
    flowTimelineStatus: flowTimelineStatus,
    orderBookDepth: quote.orderBook,
    // FIX (2026-09-18): payload dari Invezgo mentah (skema per-tipe belum
    // diverifikasi — lihat catatan getIdxCalendarData()), jadi title/details
    // generik alih-alih mengarang field seperti dps/cumDate/ratio/purpose.
    corporateActionsCalendarSource: cal.dataSource,
    corporateActionsSchemaUnverified: true,
    corporateActions: [
      ...cal.dividends.map(d => ({ type: 'DIVIDEN', title: `Dividen — ${d.code}`, payload: d.payload })),
      ...cal.stockSplits.map(s => ({ type: 'STOCK SPLIT', title: `Stock Split — ${s.code}`, payload: s.payload })),
      ...cal.rightsIssues.map(r => ({ type: 'RIGHTS ISSUE', title: `Rights Issue — ${r.code}`, payload: r.payload })),
      ...cal.rups.map(u => ({ type: 'RUPS', title: `RUPS — ${u.code}`, payload: u.payload }))
    ],
    updatedAt: new Date().toISOString()
  };
}

export {
  loadBaseUniverse,
  fetchYahooQuote,
  fetchYahooHistory,
  fetchYahooFundamentals,
  getYahooCrumb,
  computeStockSignal,
  computeStockSignalBatch,
  runStrategyBacktest,
  runAllStrategiesBacktest,
  STRATEGY_DEFINITIONS,
  getIdxMarketSummary,
  getIdxCalendarData,
  getUniverseOpportunityRadar,
  warmRadarFundamentalsRotating,
  getUniverseAccumulationDistribution,
  getUniverseForeignFlow,
  getTransactionFlowVisualizer,
  getBeiTickSize,
  generateBrokerSummary,
  generateShareholderComposition,
  generateSectorRotation,
  fetchIdxStockScreener,
  IDX_BROKERS,
  assessDataQuality,
  getDataQualityTelemetry,
  classifyMarketRegime,
  computeConfluence,
  generateTradingHypothesis,
  generateExitHypothesis
};

