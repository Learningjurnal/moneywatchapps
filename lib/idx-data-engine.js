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
  fetchInvezgoBrokerSummaryByBroker,
  fetchInvezgoTradeFlow,
  fetchInvezgoBrokerFlow,
  fetchInvezgoTopMovers,
  fetchInvezgoFinancialStatement,
  fetchInvezgoShareholderNumber,
  fetchInvezgoShareholderKsei,
  fetchInvezgoShareholderClassifyTable,
  fetchInvezgoSectorRotation,
  fetchInvezgoScreener,
  INVEZGO_SCREENER_ALLOWED_FIELDS,
  INVEZGO_KSEI_CATEGORY_LABELS,
  getLatestEodTradingDate
} from './invezgo-client.js';

// ── Master Screener Fase 1 (live, Invezgo /screener/screen) ──
// Hanya 4 field yang sudah terbukti live (lihat komentar di
// fetchInvezgoScreener() di lib/invezgo-client.js): close, pbv, per, roe.
// Field lain (Bandar Value, Foreign Flow streak, Piotroski F-Score, dst dari
// audit Stockbit user) SENGAJA belum ditambahkan — perlu verifikasi live
// dulu, per CLAUDE.md §1/§3 (jangan menebak skema/field API eksternal).
async function generateMasterScreener(formula) {
  const result = await fetchInvezgoScreener(formula);
  if (!result.ok) {
    return { available: false, reason: result.reason, unknownFields: result.unknownFields || [], allowedFields: [...INVEZGO_SCREENER_ALLOWED_FIELDS], rows: [] };
  }
  const universe = loadBaseUniverse();
  const rows = result.matched.map((r) => {
    const meta = universe[r.code] || null;
    return {
      code: r.code,
      name: meta ? meta.name : null,
      sector: meta ? meta.sector : null,
      fields: Object.keys(r).reduce((acc, k) => {
        if (k !== 'code' && k !== 'matched') acc[k] = Number(r[k]);
        return acc;
      }, {})
    };
  });
  return {
    available: true,
    formula: result.formula,
    dataTimestamp: result.quality ? result.quality.dataTimestamp : null,
    allowedFields: [...INVEZGO_SCREENER_ALLOWED_FIELDS],
    count: rows.length,
    rows
  };
}

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
import { getRegulatoryHealthGate } from './regulatory-gate.js';
import {
  ensureIdxSession,
  fetchIdxBrokerSummaryReal,
  fetchIdxStockScreener,
  fetchIdxSpecialNotations,
  IDX_SPECIAL_NOTATION_DICT,
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
  yfStoreGet,
  yfStoreSetEx,
  yfStoreMget,
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
  const prev1 = closes.length >= 2 ? closes[closes.length - 2] : last;
  const prev7 = closes.length >= 6 ? closes[closes.length - 6] : (closes.length >= 2 ? closes[0] : last);
  const chg1d = prev1 > 0 ? Math.round(((last - prev1) / prev1) * 10000) / 100 : 0;
  const chg7d = prev7 > 0 ? Math.round(((last - prev7) / prev7) * 10000) / 100 : 0;

  const ema20 = computeEMA(closes.slice(-40), 20);
  const ema50 = closes.length >= 50 ? computeEMA(closes.slice(-100), 50) : null;
  const rsi14 = computeRSI(closes, 14);
  const rsi50 = closes.length >= 51 ? computeRSI(closes, 50) : null;
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
    rsi50: rsi50 != null ? Math.round(rsi50 * 10) / 10 : null,
    atr14: atr14 != null ? Math.round(atr14 * 100) / 100 : null,
    volRatio: Math.round(volRatio * 100) / 100,
    score: Math.min(100, Math.round(score)),
    barsUsed: points.length,
    chg1d,
    chg7d
  };
}

// ── Wave analysis (Elliott Wave phase / SuperTrend / Fibonacci targets) ──
// (2026-09-18, user-directed: "trade wave masih memiliki screener sendiri,
// pelajari bisakah digabungkan kedalam Screener... kalau tidak
// memungkinkan pindahkan tradewave ke dalam screener saja"). TradeWave's
// own "Wave Scanner" tab (public/js/37-tradewave-engine.js) scanned a
// hardcoded ~40-ticker sample (mixing IDX stocks with crypto/US assets) —
// exactly the "screener LQ45/sampel kecil" pattern CLAUDE.md §2 forbids,
// just never audited because it lived on a different page than the other
// 4 screeners already merged. Ported here (server-side, whole-market,
// cached) instead of extending that client-side per-click scanner — same
// underlying math (twCalcSuperTrend/twAnalyzeWave in that file), crypto/US
// scope dropped per user decision ("buang saja... fokus BEI penuh, crypto
// nanti dibuat terpisah"). RSI here uses this file's own simple
// computeRSI() (not TradeWave's Wilder-smoothed twCalcRsi()) — a minor,
// deliberate formula difference; both are legitimate RSI variants and
// unifying on the one already used elsewhere in this engine avoids a 3rd
// RSI implementation for no behavioral benefit.
function computeSuperTrendSeries(points, period, factor) {
  period = period || 10;
  factor = factor || 3.0;
  const n = points.length;
  const tr = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) tr.push(points[i].h - points[i].l);
    else tr.push(Math.max(points[i].h - points[i].l, Math.abs(points[i].h - points[i - 1].c), Math.abs(points[i].l - points[i - 1].c)));
  }
  const atr = [];
  let sum = 0;
  for (let j = 0; j < n; j++) {
    sum += tr[j];
    if (j < period) atr.push(sum / (j + 1));
    else { sum -= tr[j - period]; atr.push(sum / period); }
  }
  const st = [];
  for (let k = 0; k < n; k++) {
    const hl2 = (points[k].h + points[k].l) / 2;
    const curAtr = atr[k];
    const upper = hl2 + factor * curAtr;
    const lower = hl2 - factor * curAtr;
    const c = points[k].c;
    if (k === 0) { st.push({ dir: 1, upper, lower }); continue; }
    const prevSt = st[k - 1];
    let dir;
    if (c > prevSt.upper) dir = 1;
    else if (c < prevSt.lower) dir = -1;
    else dir = prevSt.dir;
    st.push({ dir, upper, lower });
  }
  return { atr, superTrend: st };
}

function computeWaveAnalysis(points) {
  if (!points || points.length < 30) return null;
  const n = points.length;
  const closes = points.map(p => p.c);
  const cur = points[n - 1];
  const prev = points[n - 2] || cur;

  const ema9 = computeEMA(closes.slice(-18), 9);
  const ema21 = computeEMA(closes.slice(-42), 21);
  const ema50 = closes.length >= 50 ? computeEMA(closes.slice(-100), 50) : ema21;
  const ribbonBullish = ema9 > ema21 && ema21 > ema50;
  const ribbonBearish = ema9 < ema21 && ema21 < ema50;

  const { atr, superTrend } = computeSuperTrendSeries(points, 10, 3.0);
  const curSt = superTrend[n - 1];
  const curAtr = atr[n - 1] || cur.c * 0.02;

  let mfvSum = 0, volSum = 0;
  for (let i = Math.max(0, n - 20); i < n; i++) {
    const p = points[i];
    const mfm = (p.h - p.l) > 0 ? ((p.c - p.l) - (p.h - p.c)) / (p.h - p.l) : 0;
    mfvSum += mfm * (p.v || 0);
    volSum += (p.v || 0);
  }
  const cmf = volSum > 0 ? mfvSum / volSum : 0;

  const chgPct = prev.c > 0 ? ((cur.c - prev.c) / prev.c) * 100 : 0;
  const rsiVal = computeRSI(closes, 14) ?? 50;

  let wavePhase, waveLabel, waveDescription;
  if (ribbonBullish && curSt.dir === 1) {
    if (rsiVal > 72) {
      wavePhase = 'WAVE 5 CLIMAX'; waveLabel = 'Wave 5 Climax / Blow-Off Top';
      waveDescription = 'Puncak gelombang bullish. Waktunya eksekusi take profit bertahap (trailing stop ketat).';
    } else if (cur.c > ema9 && cmf > 0.12) {
      wavePhase = 'WAVE 3 EXTENSION'; waveLabel = 'Wave 3 Impulse Extension';
      waveDescription = 'Fase percepatan momentum dengan aliran dana institusi (Big Money Flow) yang solid.';
    } else {
      wavePhase = 'WAVE 1 BREAKOUT'; waveLabel = 'Wave 1 Initial Breakout';
      waveDescription = 'Awal pembentukan struktur tren bullish baru setelah fase akumulasi dasar.';
    }
  } else if (curSt.dir === 1 && cur.c <= ema21) {
    wavePhase = 'WAVE 4 RETEST'; waveLabel = 'Wave 4 Pullback / Support Retest';
    waveDescription = 'Konsolidasi sehat menguji area support Fibonacci & EMA 50. Ideal untuk akumulasi bertahap.';
  } else if (ribbonBearish) {
    wavePhase = 'CORRECTIVE ABC'; waveLabel = 'Corrective Wave (ABC Downtrend)';
    waveDescription = 'Siklus koreksi tren bearish. Disarankan wait and see atau pasang stop loss disiplin.';
  } else {
    wavePhase = 'WAVE 2 DIP BUY'; waveLabel = 'Wave 2 Healthy Retracement';
    waveDescription = 'Pengujian support 50%-61.8% Fibonacci. Peluang entry dengan risk-to-reward optimal.';
  }

  let swingLow = cur.l, swingHigh = cur.h;
  for (let s = Math.max(0, n - 25); s < n; s++) {
    if (points[s].l < swingLow) swingLow = points[s].l;
    if (points[s].h > swingHigh) swingHigh = points[s].h;
  }
  const swingRange = Math.max(1, swingHigh - swingLow);
  let stopLoss = Math.round(cur.c - curAtr * 1.5);
  if (stopLoss >= cur.c) stopLoss = Math.round(cur.c * 0.95);
  const tp1 = Math.round(cur.c + swingRange * 0.618);
  const tp2 = Math.round(cur.c + swingRange * 1.0);
  const tp3 = Math.round(cur.c + swingRange * 1.618);
  const riskPerUnit = Math.max(1, cur.c - stopLoss);
  const rewardPerUnit = tp2 - cur.c;
  const rrRatio = Math.round((rewardPerUnit / riskPerUnit) * 100) / 100;

  let waveScore = 50;
  if (ribbonBullish) waveScore += 20;
  if (curSt.dir === 1) waveScore += 15;
  if (cmf > 0.05) waveScore += 10;
  if (cmf > 0.15) waveScore += 5;
  if (rsiVal >= 45 && rsiVal <= 68) waveScore += 10;
  if (ribbonBearish) waveScore -= 30;
  waveScore = Math.max(10, Math.min(98, Math.round(waveScore)));

  return {
    wavePhase, waveLabel, waveDescription, waveScore,
    superTrendBullish: curSt.dir === 1,
    cmf: Math.round(cmf * 1000) / 10,
    ema9: Math.round(ema9), ema21: Math.round(ema21), ema50: Math.round(ema50),
    invalidation: stopLoss, tp1, tp2, tp3, riskReward: rrRatio,
    changePct: Math.round(chgPct * 100) / 100
  };
}

// ── Redis-backed cache for computeTechnicalSignal() results (2026-09-18,
// Unified Screener) ──
// Reuses this same pattern as the fundamentals cache (yahoo-client.js): a
// live 958-ticker technical scan on every screener request would mean 958
// fresh fetchYahooHistory('SCAN') calls per request — far too slow. Daily
// bars only change once per trading day, so a 24h positive TTL is safe;
// tickers with insufficient history get a short 10-min negative cache so
// they're retried periodically rather than hammered every request.
// Warmed by warmTechnicalRotating() below via a daily cron, mirroring
// warmRadarFundamentalsRotating() exactly — same rotating-cursor rationale
// (Vercel Hobby: 1 cron/day, 30s maxDuration, full ~958-universe coverage
// reached progressively over several days).
const TECHNICAL_CACHE_TTL_SEC = 24 * 60 * 60;
const TECHNICAL_NEGATIVE_TTL_SEC = 10 * 60;
function _technicalCacheKey(ticker) {
  return 'yahoo:technical:' + ticker;
}

async function fetchAndCacheTechnicalSignal(ticker) {
  const clean = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();
  const cacheKey = _technicalCacheKey(clean);
  const cached = await yfStoreGet(cacheKey);
  if (cached) return cached.data; // may itself be null (cached "insufficient history" miss)
  try {
    const history = await fetchYahooHistory(clean, 'SCAN');
    const tech = computeTechnicalSignal(history?.points);
    if (!tech) throw new Error('Insufficient price history (need 30+ daily bars)');
    // Wave analysis rides the same cache entry (same underlying OHLCV
    // fetch, one Redis write) rather than a second cache — additive field,
    // existing consumers reading tech.trend/tech.score are unaffected.
    tech.wave = computeWaveAnalysis(history?.points);
    await yfStoreSetEx(cacheKey, { isReal: true, data: tech }, TECHNICAL_CACHE_TTL_SEC);
    return tech;
  } catch (err) {
    await yfStoreSetEx(cacheKey, { isReal: false, data: null }, TECHNICAL_NEGATIVE_TTL_SEC);
    return null;
  }
}

async function getCachedTechnicalOnly(ticker) {
  const cached = await yfStoreGet(_technicalCacheKey(ticker));
  if (!cached) return null;
  return cached.data;
}

async function hasTechnicalCacheEntry(ticker) {
  const cached = await yfStoreGet(_technicalCacheKey(ticker));
  return cached !== null && cached !== undefined;
}

// Bulk cache-only read (1 mget) for the Unified Screener's whole-universe
// scoring pass — same rationale as getCachedFundamentalsBulk().
async function getCachedTechnicalBulk(tickers) {
  const keys = tickers.map(_technicalCacheKey);
  const values = await yfStoreMget(keys);
  const result = new Map();
  tickers.forEach((t, i) => {
    const cached = values[i];
    result.set(t, cached ? cached.data : null);
  });
  return result;
}

const TECHNICAL_WARM_CURSOR_KEY = 'technical:warm:cursor';
async function getTechnicalWarmCursor() {
  const v = await yfStoreGet(TECHNICAL_WARM_CURSOR_KEY);
  return Number(v) || 0;
}
async function setTechnicalWarmCursor(idx) {
  await yfStoreSetEx(TECHNICAL_WARM_CURSOR_KEY, idx, 0); // no expiry — rotation runs indefinitely
}

// Cron-triggered rotating warmer for the technical-signal cache — byte-
// identical structure to warmRadarFundamentalsRotating() above (skip
// already-cached tickers, batch concurrency, time-budget guard, persist
// cursor for next run), just pointed at fetchAndCacheTechnicalSignal/
// hasTechnicalCacheEntry instead of the fundamentals equivalents. Kept as a
// separate function (not a generic parameterized helper) because unifying
// them would touch the already-tested fundamentals warmer for no behavior
// change — not worth the regression risk for ~30 duplicated lines.
async function warmTechnicalRotating(timeBudgetMs) {
  const budget = timeBudgetMs || 25000;
  const start = Date.now();
  const universe = loadBaseUniverse();
  const sortedCodes = Object.values(universe).map(s => s.code).sort();
  const total = sortedCodes.length;
  const BATCH = Number(process.env.TECHNICAL_CRON_BATCH_SIZE) || 8;

  const cursorBefore = await getTechnicalWarmCursor();
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
      const already = await hasTechnicalCacheEntry(code);
      if (already) return { skipped: true };
      await fetchAndCacheTechnicalSignal(code);
      return { skipped: false };
    }));
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        if (r.value.skipped) skipped++; else processed++;
      }
    });
  }

  await setTechnicalWarmCursor(idx);

  return { processed, skipped, cursorBefore, cursorAfter: idx, universeSize: total, durationMs: Date.now() - start };
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

  // Dynamic composite weighting:
  // For swing momentum, technical carries 80% and fundamentals 20%.
  // If fundamentals are unverified/unavailable (fund.isReal is false),
  // adaptively rely 100% on technical price action so strong momentum breakouts
  // are not penalized by missing accounting ratios.
  let compositeScore;
  if (!fund.isReal) {
    compositeScore = Math.round(tech.score);
  } else {
    compositeScore = Math.round(tech.score * 0.80 + fund.score * 0.20);
  }

  let signal = 'AVOID';
  if (tech.trend === 'DOWNTREND') {
    signal = compositeScore >= 50 ? 'WATCH' : 'AVOID';
  } else if (compositeScore >= 75) signal = 'STRONG BUY';
  else if (compositeScore >= 60) signal = 'BUY';
  else if (compositeScore >= 45) signal = 'HOLD';
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
    rsi50: tech.rsi50,
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

  if (signal.rsi50 != null) {
    const isSweetSpot = signal.rsi50 >= 50 && signal.rsi50 <= 70;
    const dir = isSweetSpot ? 'BULLISH' : (signal.rsi50 > 70 ? 'BEARISH' : 'NEUTRAL');
    evidence.push({
      group: 'MOMENTUM',
      label: 'RSI-50 Macro Envelope',
      direction: dir,
      detail: `RSI-50 = ${signal.rsi50} (${isSweetSpot ? 'Sweet-spot bullish 50-70' : signal.rsi50 > 70 ? 'Overbought > 70' : 'Momentum di bawah 50'})`,
      weight: 0.6
    });
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
  },
  strat_slow_trading_dual_macd: {
    id: 'strat_slow_trading_dual_macd',
    name: 'SlowTrading RSI + Dual MACD',
    type: 'Momentum / Swing',
    description: 'Beli saat tren menengah bullish (RSI-50 antara 50-70), RSI-14 > 50, MACD (12,26,9) crossover naik dan dikonfirmasi MACD Filter (24,52,18) bullish. Time exit 3 hari atau cut loss 5% dengan proteksi gap down.'
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
  const macd = (fast, slow, signalPeriod) => {
    const fastEma = ema(fast);
    const slowEma = ema(slow);
    const line = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (fastEma[i] != null && slowEma[i] != null) {
        line[i] = fastEma[i] - slowEma[i];
      }
    }
    const kSig = 2 / (signalPeriod + 1);
    const signal = new Array(n).fill(null);
    let sigVal = null;
    for (let i = 0; i < n; i++) {
      if (line[i] != null) {
        sigVal = sigVal == null ? line[i] : line[i] * kSig + sigVal * (1 - kSig);
        signal[i] = sigVal;
      }
    }
    return { line, signal };
  };
  return {
    ema20: ema(20),
    ema50: ema(50),
    rsi14: rsi(14),
    rsi50: rsi(50),
    macdFast: macd(12, 26, 9),
    macdFilter: macd(24, 52, 18),
    atr14: atr(14),
    hh20: highestHigh(20),
    avgVol20: avgVolume(20)
  };
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
      if (bar.l <= sl) {
        // Real-world gap down protection: jika harga Open di bawah stop loss, exit pada harga Open
        exitPrice = (bar.o <= sl) ? bar.o : sl;
        exitReason = 'STOP LOSS';
      } else if (strategyId === 'strat_slow_trading_dual_macd') {
        if (i - entryIdx >= 3) {
          exitPrice = bar.c;
          exitReason = 'TIME EXIT (3 hari)';
        }
      } else {
        if (tp != null && bar.h >= tp) { exitPrice = tp; exitReason = 'TAKE PROFIT'; }
        else if (i - entryIdx >= 20) { exitPrice = bar.c; exitReason = 'TIME EXIT (20 hari)'; }
      }

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
    } else if (strategyId === 'strat_slow_trading_dual_macd') {
      const ruleRSI50 = ind.rsi50[i] != null && ind.rsi50[i] > 50 && ind.rsi50[i] < 70;
      const ruleRSI14 = ind.rsi14[i] != null && ind.rsi14[i] > 50;
      const macdCrossUp = ind.macdFast.line[i] != null && ind.macdFast.signal[i] != null
        && ind.macdFast.line[i - 1] != null && ind.macdFast.signal[i - 1] != null
        && ind.macdFast.line[i - 1] <= ind.macdFast.signal[i - 1]
        && ind.macdFast.line[i] > ind.macdFast.signal[i];
      const ruleMACDFilter = ind.macdFilter.line[i] != null && ind.macdFilter.signal[i] != null
        && ind.macdFilter.line[i] > ind.macdFilter.signal[i];
      shouldEnter = ruleRSI50 && ruleRSI14 && macdCrossUp && ruleMACDFilter;
    }

    if (shouldEnter) {
      if (strategyId === 'strat_slow_trading_dual_macd') {
        // SlowTrading rules: Signal pada Close bar D, entry pada Open bar D+1 (zero lookahead)
        if (i + 1 < points.length) {
          inPosition = true;
          entryIdx = i + 1;
          entryPrice = points[i + 1].o || points[i + 1].c;
          sl = entryPrice * 0.95; // Hard cut loss 5%
          tp = null;
        }
      } else if (ind.atr14[i] != null && ind.atr14[i] > 0) {
        inPosition = true;
        entryIdx = i;
        entryPrice = points[i].c;
        sl = entryPrice - ind.atr14[i] * 1.5;
        tp = entryPrice + ind.atr14[i] * 2.5;
      }
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

// FIX (2026-09-25, audit "cek halaman lain yang masih pakai fetch tanpa
// concurrency limit"): fetchYahooHistory() for a whole ticker list used to
// be fired as one big Promise.all/allSettled(list.map(...)) at 3 call
// sites in this file (runStrategyBacktest, runUnifiedScreenerBacktest,
// resolveScreenerSignalLog) — server-side, so a burst there (up to 360
// simultaneous Yahoo calls for runAllStrategiesBacktest's 8 strategies x
// 45 tickers) risks Yahoo throttling everyone's requests, not just one
// user's. Same root cause and fix shape as perfFetchHoldingsHistory() in
// public/js/21-performance.js (client-side portfolio Beta/Alpha) fixed
// earlier the same day — chunked into fixed-size batches, one batch
// resolved (via Promise.allSettled, so one bad ticker never aborts the
// rest) before the next starts. BATCH=8 matches the constant already used
// for the same purpose by warmRadarFundamentals()/
// warmRadarFundamentalsRotating() above.
async function fetchYahooHistoryBatched(tickers, tf, batchSize) {
  const BATCH = batchSize || 8;
  const results = [];
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(batch.map(t => fetchYahooHistory(t, tf)));
    results.push(...batchResults);
  }
  return results;
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
  const tickerList = Array.isArray(tickers)
    ? tickers
    : (typeof tickers === 'string' ? [tickers] : (tickers ? [tickers] : []));
  const clean = Array.from(new Set(tickerList.map(t => String(t).toUpperCase().replace(/\.JK$/i, '').trim()))).slice(0, 45);
  const histories = await fetchYahooHistoryBatched(clean, 'BACKTEST');

  let allTrades = [];
  histories.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value?.points?.length) return;
    allTrades = allTrades.concat(simulateStrategyOnHistory(strategyId, clean[i], r.value.points));
  });

  allTrades.sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
  const splitIdx = Math.floor(allTrades.length * 0.7);
  const inSample = allTrades.slice(0, splitIdx);
  const outOfSample = allTrades.slice(splitIdx);

  const stats = aggregateBacktestStats(allTrades);
  return {
    strategy: STRATEGY_DEFINITIONS[strategyId],
    strategyId,
    tickersScanned: clean.length,
    overall: stats,
    summary: stats,
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
    totalFrequency += (q.frequency || 0);
  });

  // FIX (2026-09-24, bug audit): this used to multiply the 20-bellwether
  // sample above by arbitrary factors (x20/x18/x15 for breadth, x15/x12/x18
  // for trade totals) to "estimate" the whole ~958-emiten market, then
  // hardcoded ETF/DIRE/Sukuk & Obligasi rows and totalMarketCap as fixed
  // constants that never changed — presented as real market breadth/
  // turnover with no disclosure anywhere. No whole-market real-time feed is
  // integrated in this app (Invezgo's top/accumulation & top/foreign only
  // cover that day's movers, not full breadth; IDX's own GetIndexList
  // response schema is unverified — see docs note on ensureIdxSession()).
  // Per CLAUDE.md Aturan #1/#2/#3: report the real 20-ticker bellwether
  // sample honestly (labeled as a sample, not as full-market breadth), and
  // do not fabricate ETF/DIRE/bond turnover or total market cap.
  const universeSize = Object.keys(loadBaseUniverse()).length;

  const summary = {
    ihsg: ihsgQuote,
    usdidr: usdQuote,
    marketBreadth: {
      advancing: gainers,
      declining: losers,
      unchanged: unchanged,
      totalListed: universeSize,
      sampleSize: validQuotes.length,
      isSample: true,
      sampleNote: `Dihitung dari ${validQuotes.length} saham bellwether (sampel), BUKAN breadth ${universeSize} emiten BEI penuh — belum ada feed breadth whole-market real-time yang terintegrasi.`
    },
    tradeSummary: [
      {
        id: 'Saham (Sampel Bellwether)',
        volume: totalVolume,
        value: totalValue,
        frequency: totalFrequency,
        isSample: true,
        sampleSize: validQuotes.length
      }
    ],
    tradeSummaryNote: `Turnover di atas dijumlahkan dari ${validQuotes.length} saham bellwether saja, bukan seluruh bursa. Baris ETF/DIRE/Sukuk & Obligasi dan total kapitalisasi pasar dihapus dari respons ini karena belum ada sumber data real yang terintegrasi (sebelumnya diisi angka statis karangan) — lihat AGENTS.md.`,
    totalMarketCap: null,
    totalMarketCapAvailable: false,
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
  const latestEod = (typeof getLatestEodTradingDate === 'function') ? getLatestEodTradingDate() : new Date().toISOString().slice(0, 10);
  const to = new Date(latestEod + 'T00:00:00.000Z');
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { fromDate: iso(from), toDate: iso(to), toDateDisplay: iso(to) };
}

async function generateBrokerSummary(ticker, quoteData, timeframe = '1D', investor = 'all', market = 'RG', options = {}) {
  const clean = String(ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();

  // Coba data ASLI dari Invezgo dulu, kalau dikonfigurasi & berhasil. Rentang
  // tanggal sekarang benar-benar mengikuti `timeframe` yang diminta (lihat
  // catatan INV-timeframe-ignored di atas) alih-alih selalu hari-ini saja.
  const { fromDate, toDate, toDateDisplay } = brokerSummaryDateRange(timeframe);
  const invezgo = await fetchInvezgoBrokerSummary(clean, fromDate, toDate, investor, market, options?.refresh);
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
      price: (quoteData && quoteData.price > 0)
        ? quoteData.price
        : (buyers[0]?.avgPrice || sellers[0]?.avgPrice || 0),
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

// Broker Summary by Broker (seluruh saham yang ditransaksikan broker tertentu)
async function getBrokerSummaryByBroker(brokerCode, timeframe = '1D') {
  const clean = String(brokerCode || '').toUpperCase().trim();
  const { fromDate, toDate, toDateDisplay } = brokerSummaryDateRange(timeframe);
  const invezgo = await fetchInvezgoBrokerSummaryByBroker(clean, fromDate, toDate);

  if (invezgo.ok) {
    const universe = loadBaseUniverse();
    const mapStock = (s) => ({
      ...s,
      name: universe[s.ticker]?.name || s.name || s.ticker,
      price: universe[s.ticker]?.price || 0
    });
    return {
      ok: true,
      broker: clean,
      timeframe,
      fromDate,
      toDate: toDateDisplay,
      source: invezgo.source,
      netBuyStocks: (invezgo.netBuyStocks || []).map(mapStock),
      netSellStocks: (invezgo.netSellStocks || []).map(mapStock),
      totalStocksTraded: invezgo.totalStocksTraded,
      quality: invezgo.quality
    };
  }

  return {
    ok: false,
    broker: clean,
    timeframe,
    fromDate,
    toDate: toDateDisplay,
    reason: invezgo.reason || 'UNAVAILABLE',
    netBuyStocks: [],
    netSellStocks: [],
    totalStocksTraded: 0,
    quality: invezgo.quality
  };
}

// ── Bandar Movement Cockpit (Step 6 Aggregator) ──
// Integrates 4 core widgets: Trade Flow, Broker Flow, Broker Summary, and Broker Distribution Sankey
async function generateBandarMovementData(ticker, options = {}) {
  const clean = String(ticker || 'BBCA').trim().toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '');
  if (!clean) return { ok: false, reason: 'INVALID_TICKER' };

  const { date, timeframe = '1D', isBigMoney = false, investor = 'all', market = 'RG', refresh = false } = options;

  // 1. Broker Summary (also supplies data for the Sankey Distribution flow)
  const brokerSummary = await generateBrokerSummary(clean, null, timeframe, investor, market, { refresh });

  // 2. Intraday Trade Flow (HAKA vs HAKI cumulative tape)
  const tradeFlow = await fetchInvezgoTradeFlow(clean, date, isBigMoney);

  // 3. Multi-Broker Cumulative Flow (time series)
  const brokerFlow = await fetchInvezgoBrokerFlow(clean, timeframe, investor, market);

  // 4. Compute Sankey Distribution Links
  let distributionSankey = { buyers: [], sellers: [], links: [], totalBuyVal: 0, totalSellVal: 0 };
  const allBuyers = (brokerSummary && (brokerSummary.topBuyers || brokerSummary.buyers)) || [];
  const allSellers = (brokerSummary && (brokerSummary.topSellers || brokerSummary.sellers)) || [];

  if (brokerSummary) {
    if (!brokerSummary.buyers) brokerSummary.buyers = allBuyers;
    if (!brokerSummary.sellers) brokerSummary.sellers = allSellers;
  }

  if (allBuyers.length > 0 && allSellers.length > 0) {
    const rawBuyers = allBuyers.filter(b => (b.valueRp || 0) > 0).slice(0, 8);
    const rawSellers = allSellers.filter(s => (s.valueRp || 0) > 0).slice(0, 8);

    const totalBuyVal = rawBuyers.reduce((sum, b) => sum + (b.valueRp || 0), 0);
    const totalSellVal = rawSellers.reduce((sum, s) => sum + (s.valueRp || 0), 0);

    const buyerNodes = rawBuyers.map(b => {
      const info = IDX_BROKERS[b.broker] || {};
      const isBUMN = info.category && info.category.toLowerCase().includes('bumn');
      const isForeign = info.type === 'F';
      const catGroup = isBUMN ? 'BUMN' : (isForeign ? 'Foreign' : 'Domestic');
      return {
        id: 'B_' + b.broker,
        code: b.broker,
        name: info.name || b.name || (b.broker + ' Sekuritas'),
        value: b.valueRp,
        volume: b.volumeLot,
        avgPrice: b.avgPrice,
        categoryGroup: catGroup,
        color: isBUMN ? '#10B981' : (isForeign ? '#EF4444' : '#8B5CF6')
      };
    });

    const sellerNodes = rawSellers.map(s => {
      const info = IDX_BROKERS[s.broker] || {};
      const isBUMN = info.category && info.category.toLowerCase().includes('bumn');
      const isForeign = info.type === 'F';
      const catGroup = isBUMN ? 'BUMN' : (isForeign ? 'Foreign' : 'Domestic');
      return {
        id: 'S_' + s.broker,
        code: s.broker,
        name: info.name || s.name || (s.broker + ' Sekuritas'),
        value: s.valueRp,
        volume: s.volumeLot,
        avgPrice: s.avgPrice,
        categoryGroup: catGroup,
        color: isBUMN ? '#10B981' : (isForeign ? '#EF4444' : '#8B5CF6')
      };
    });

    const links = [];
    if (totalBuyVal > 0 && totalSellVal > 0) {
      buyerNodes.forEach(b => {
        const bShare = b.value / totalBuyVal;
        sellerNodes.forEach(s => {
          const flowVal = Math.round(bShare * s.value);
          if (flowVal > 0) {
            links.push({
              source: b.id,
              target: s.id,
              sourceCode: b.code,
              targetCode: s.code,
              value: flowVal,
              buyerCat: b.categoryGroup,
              sellerCat: s.categoryGroup,
              color: b.color
            });
          }
        });
      });
    }

    distributionSankey = {
      buyers: buyerNodes,
      sellers: sellerNodes,
      links,
      totalBuyVal,
      totalSellVal
    };
  }

  return {
    ok: true,
    symbol: clean,
    timeframe,
    date: date || getLatestEodTradingDate(),
    timestamp: new Date().toISOString(),
    brokerSummary,
    tradeFlow,
    brokerFlow,
    distributionSankey
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
  const { search, sector, index, zone, bandarmology, sort, order, limit, offset, excludeFlagged } = params;

  const [calData, regulatoryGate] = await Promise.all([
    getIdxCalendarData(),
    getRegulatoryHealthGate(allList.map(s => s.code))
  ]);
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

    // Regulatory Health Gate: sebuah saham FLAGGED/UNKNOWN/DATA_ERROR
    // TIDAK PERNAH boleh tampil sebagai "BUY ZONE"/"Strong Buy"/dst,
    // terlepas dari skor fundamentalnya (docs/regulatory-health-gate.md
    // §6) — override zone/verdict yang menyiratkan peluang beli, biarkan
    // AVOID/DATA TERBATAS apa adanya (sudah tidak menyiratkan itu).
    const regGate = regulatoryGate.byTicker[code] || { status: 'UNKNOWN', eligible: false, reason: null };
    if (!regGate.eligible && zoneLabel !== 'AVOID' && zoneLabel !== 'DATA TERBATAS') {
      zoneLabel = 'TIDAK LAYAK (REGULASI)';
      zoneClass = 'b-dn';
      verdict = regGate.status === 'FLAGGED' ? 'Notasi Khusus BEI — Hindari' : 'Status Regulasi Belum Terverifikasi';
    }

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
      corporateActions: corpActions,
      regulatoryStatus: regGate.status,
      regulatoryEligible: regGate.eligible,
      regulatoryReason: regGate.reason
    };
  });

  // Apply filters
  let filtered = evaluated;

  // Regulatory Health Gate default: sembunyikan FLAGGED/UNKNOWN/DATA_ERROR
  // dari daftar peluang default (docs/regulatory-health-gate.md §22) —
  // ?excludeFlagged=false menampilkan semua lagi untuk transparansi.
  if (excludeFlagged !== false && excludeFlagged !== 'false') {
    filtered = filtered.filter(item => item.regulatoryEligible);
  }

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
    limitedDataCount: evaluated.filter(x => !x.isRealFundamental).length,
    // Regulatory Health Gate observability (docs/regulatory-health-gate.md §24)
    regulatoryClear: regulatoryGate.summary.clear,
    regulatoryFlagged: regulatoryGate.summary.flagged,
    regulatoryUnknown: regulatoryGate.summary.unknown,
    regulatoryDataError: regulatoryGate.summary.dataError
  };

  return {
    success: true,
    total: total,
    count: paginated.length,
    summary: summary,
    items: paginated,
    regulatoryDataSource: { available: regulatoryGate.dataAvailable, isStale: regulatoryGate.isStale, source: 'BEI (idx.co.id)', checkedAt: regulatoryGate.checkedAt }
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

// FIX (2026-09-26, user-reported: screenshot of "ROTASI MODAL SEKTOR"
// widget's own new diagnostic — added specifically to expose this —
// listed 16 tickers falling into the generic "Lainnya" sector bucket,
// 11 of them warrant codes: CYBR-W, CSIS-W, MGNA-W, PJHB-W, MANG-W,
// PYFA-W, INET-W2, ISAP-W, COCO-W, PEGE-W, KOCI-W). Root cause:
// `universe[item.code]` does an exact-string lookup, and IDX warrant
// tickers append `-W`/`-W2`/... to their underlying stock's code, so
// "CYBR-W" never matches the "CYBR" key even though CYBR itself IS
// correctly mapped (verified: all 11 base tickers above already exist
// in loadBaseUniverse() with a real, non-'Lainnya' sector). A warrant's
// sector/company is by definition its underlying stock's — resolving it
// via the base ticker reuses already-verified data, it does not guess a
// new one. The remaining 5 tickers from that same screenshot (RANS,
// EMMI, JECX, BACH, JELI) are NOT warrants and are not in
// loadBaseUniverse() at all — left alone here; no company/sector data
// for them has been verified from any official source, so per the
// zero-fabrication rule they still fall through to 'Lainnya' honestly.
function resolveUniverseEntryForCode(universe, code) {
  if (universe[code]) return universe[code];
  const warrantMatch = /^(.+?)-W\d*$/.exec(code);
  if (warrantMatch && universe[warrantMatch[1]]) return universe[warrantMatch[1]];
  return null;
}

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
  // Invezgo's own endpoint description) — defaults to TODAY's date;
  // getOrFetch()'s cache key already includes it, so this naturally rotates
  // once per calendar day on its own, same reasoning as
  // brokerSummaryDateRange() above.
  // FIX (2026-09-18, user-reported: "ini seharusnya bisa di pilih
  // tanggalnya, karna kalo cuma hari ini ya percuma, baru keluar datanya
  // di sore hari"): EOD data untuk hari berjalan belum terbit sampai
  // ~17:30 WIB, jadi cek di pagi/siang hari selalu kosong. `params.date`
  // (opsional, format YYYY-MM-DD) sekarang diteruskan ke Invezgo — endpoint
  // /analysis/top/{kind} SUDAH mendukung parameter `date` sejak awal
  // (lihat fetchInvezgoTopMovers()), cuma belum pernah dipakai dari sini.
  const date = params.date || getLatestEodTradingDate();
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

  const mapRow = (item) => {
    const uEntry = resolveUniverseEntryForCode(universe, item.code);
    return {
      ticker: item.code,
      name: item.name || (uEntry && uEntry.name) || item.code,
      sector: (uEntry && uEntry.sector) || '-',
      score: Number(item.calculated_value) || 0,
      avgPrice: Number(item.price) || 0,
      priceChangePct: Number(item.change) || 0,
      volume: Number(item.volume) || 0,
      valueRp: Number(item.value) || 0
    };
  };

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
// FIX (2026-09-18, Unified Screener backtest): `date` param added — was
// hardcoded to today, which meant nothing could ever query a PAST day's
// foreign-flow top movers. `runUnifiedScreenerBacktest()` needs this to
// reconstruct what the whale signal would have looked like on a historical
// date (same pattern getUniverseAccumulationDistribution() already uses).
// Existing callers that don't pass `params` are unaffected (defaults to
// today, byte-identical behavior to before).
async function getUniverseForeignFlow(params = {}) {
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

  const date = params.date || getLatestEodTradingDate();
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

  // FIX (2026-09-25, user-reported: widget menampilkan "+Rp 0 Jt" untuk
  // SEMUA baris — termasuk baris distribusi/net-sell yang seharusnya
  // negatif): komentar sebelumnya di sini MENGKLAIM calculated_value untuk
  // kind='foreign' adalah "nilai net Rupiah asing" — klaim itu TIDAK
  // PERNAH diverifikasi dari dokumentasi Invezgo (user sudah cek langsung,
  // field calculated_value tidak dijelaskan di docs mereka). Respons real
  // yang user tangkap dari /analysis/top/foreign, /analysis/top/retail,
  // DAN /analysis/top/accumulation menunjukkan calculated_value SELALU
  // berupa skor kecil (kadang negatif, sampai puluhan/ratusan, persis
  // titik terakhir dari array `graph` baris itu sendiri) — pola identik di
  // ketiga endpoint, bukan Rupiah sama sekali. Field ini sekarang jujur
  // dinamai `score` (bukan netValueRp) untuk mencegah kode lain menganggap
  // ini angka Rupiah yang bisa dijumlahkan/dibandingkan dengan ambang
  // Rupiah — lihat lib/engine/indicators/foreignFlow.js untuk insiden
  // turunannya (FOREIGN indicator di Strategy Engine V1 dinonaktifkan
  // sementara karena bug yang sama).
  const mapRow = (item) => {
    const uEntry = resolveUniverseEntryForCode(universe, item.code);
    return {
      ticker: item.code,
      name: item.name || (uEntry && uEntry.name) || item.code,
      sector: (uEntry && uEntry.sector) || '-',
      score: Number(item.calculated_value) || 0,
      price: Number(item.price) || 0,
      priceChangePct: Number(item.change) || 0,
      volume: Number(item.volume) || 0,
      valueRp: Number(item.value) || 0
    };
  };

  // 'accum' = top foreign net buy, 'dist' = top foreign net sell — shape
  // sama persis dengan /analysis/top/accumulation (confirmed di
  // fetchInvezgoTopMovers()'s comment). Diurutkan berdasarkan `score`
  // (Invezgo's own ranking), bukan `valueRp` (yang merupakan total nilai
  // transaksi saham itu, bukan porsi asingnya — tidak ada field net-Rupiah
  // asing yang terverifikasi di skema ini).
  const netBuy = (result.accum || []).map(mapRow).sort((a, b) => b.score - a.score);
  const netSell = (result.dist || []).map(mapRow).sort((a, b) => a.score - b.score);

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
// UNIFIED SCREENER — 1 halaman filterable menggantikan Opportunity Radar,
// Market Radar, Smart Money Screener, dan Screener lama (2026-09-18,
// user-directed: "kedepan screener kedepan hanya ada 1 tidak banyak lagi
// dan terpisah pisah").
// ════════════════════════════════════════════════════════════
// Formula desain disetujui user (bobot awal, BOLEH dikalibrasi ulang nanti
// — user eksplisit: "saya setuju karna bisa kalibrasi ulang"). HANYA
// memakai sumber whole-market yang SUDAH real & murah kuota (lihat komentar
// masing-masing fungsi di atas) — sengaja TIDAK memanggil
// fetchInvezgoScreener() (formula custom /screener/screen) otomatis di sini
// (per user: "kalo dianalisa asal akan memakan kuota" — endpoint itu
// throttle ketat & terpisah kuotanya, tetap sebagai filter custom OPSIONAL
// yang user pilih sendiri, bukan bagian dari pass otomatis setiap saham).
//
// A. Skor Whale/Akumulasi — KATEGORIKAL (-3..+4), BUKAN skor 0-100 tunggal:
//    top/accumulation match → +2, top/distribution match → -2,
//    foreign net buy match → +1, foreign net sell match → -1,
//    volRatio>=2x DAN trend teknikal UPTREND → +1 (deviasi kecil dari
//    rancangan awal "harga naik hari itu" — tidak ada field 1-hari-return
//    yang murah di whole-market pass ini; trend UPTREND dari
//    computeTechnicalSignal() sudah real & lebih stabil dari noise 1 hari).
//    PENTING: top/accumulation & top/foreign HANYA berisi saham yang punya
//    aktivitas signifikan hari itu (bukan 958 baris) — saham yang TIDAK
//    muncul mendapat skor 0 dan label "Tidak Ada Sinyal Hari Ini", BUKAN
//    "tidak ada whale" (lihat whaleDataAvailable flag).
// B. Skor Potensi Uptrend (0-100), null kalau data teknikal belum ter-cache:
//    tech.score (computeTechnicalSignal — trend+RSI+volume, sudah real &
//    teruji) *0.7 + valuasi wajar (PER 0-25 → +20, PER>0 lain → +10) +
//    kualitas (ROE>10% → +10, ROE>5% → +5), dibulatkan, cap 100.
async function generateUnifiedScreener(params = {}) {
  const universe = loadBaseUniverse();
  const allList = Object.values(universe);
  const { search, sector, index, whale, minUptrend, maxPer, minRoe, confirmedOnly, wavePhase, sort, order, limit, offset, excludeFlagged } = params;

  // Regulatory Health Gate (docs/regulatory-health-gate.md): 1 panggilan
  // whole-market (fetchIdxSpecialNotations() via getRegulatoryHealthGate()),
  // TIDAK per-ticker — jadi bisa diterapkan ke SELURUH universe tanpa
  // biaya kuota tambahan. FLAGGED/UNKNOWN/DATA_ERROR TIDAK PERNAH
  // dianggap layak jadi "confirmed" opportunity, terlepas dari skor
  // teknikal/whale-nya (lihat forced confirmedUptrendWhale=false di
  // bawah) — bukan strategi investasi, murni saringan regulasi objektif.
  const [accDist, foreignFlow, regulatoryGate] = await Promise.all([
    getUniverseAccumulationDistribution({ date: params.date }),
    getUniverseForeignFlow(),
    getRegulatoryHealthGate(allList.map(s => s.code))
  ]);

  const accByCode = new Map((accDist.accumulation || []).map(r => [r.ticker, r]));
  const distByCode = new Map((accDist.distribution || []).map(r => [r.ticker, r]));
  const netBuyByCode = new Map((foreignFlow.netBuy || []).map(r => [r.ticker, r]));
  const netSellByCode = new Map((foreignFlow.netSell || []).map(r => [r.ticker, r]));

  // Fundamentals: reuse the SAME Redis-backed cache Opportunity Radar warms
  // (LQ45/IDX30 warmed on-demand here too; the rest depend on the daily
  // rotating cron, same "DATA TERBATAS" honesty as Opportunity Radar).
  const priorityTickers = Array.from(new Set(allList.filter(s => s.indexes?.lq45 || s.indexes?.idx30).map(s => s.code)));
  await warmRadarFundamentals(priorityTickers);
  const fundByCode = await getCachedFundamentalsBulk(allList.map(s => s.code));

  // Technical: bulk cache-only read — deliberately NEVER triggers a live
  // fetch here (958 live Yahoo history calls per request would be far too
  // slow). Coverage grows daily via warmTechnicalRotating()'s cron.
  const techByCode = await getCachedTechnicalBulk(allList.map(s => s.code));

  const evaluated = allList.map((stock) => {
    const code = stock.code;
    const fund = fundByCode.get(code) || null;
    const tech = techByCode.get(code) || null;

    let whaleScore = 0;
    let whaleDataAvailable = false;
    const whaleSignals = [];

    if (accByCode.has(code)) {
      whaleScore += 2; whaleDataAvailable = true;
      whaleSignals.push('Akumulasi terdeteksi (Invezgo top movers)');
    } else if (distByCode.has(code)) {
      whaleScore -= 2; whaleDataAvailable = true;
      whaleSignals.push('Distribusi terdeteksi (Invezgo top movers)');
    }

    if (netBuyByCode.has(code)) {
      whaleScore += 1; whaleDataAvailable = true;
      whaleSignals.push('Foreign net buy (Invezgo top movers)');
    } else if (netSellByCode.has(code)) {
      whaleScore -= 1; whaleDataAvailable = true;
      whaleSignals.push('Foreign net sell (Invezgo top movers)');
    }

    if (tech) {
      whaleDataAvailable = true;
      if (tech.volRatio >= 2 && tech.trend === 'UPTREND') {
        whaleScore += 1;
        whaleSignals.push('Volume spike ≥2x + trend UPTREND');
      }
    }

    let whaleLabel;
    if (!whaleDataAvailable) whaleLabel = 'Tidak Ada Sinyal Hari Ini';
    else if (whaleScore >= 3) whaleLabel = 'Akumulasi Kuat';
    else if (whaleScore >= 1) whaleLabel = 'Akumulasi Lemah';
    else if (whaleScore <= -1) whaleLabel = 'Distribusi';
    else whaleLabel = 'Netral';

    let uptrendScore = null;
    if (tech) {
      let s = tech.score * 0.7;
      if (fund && fund.per != null && fund.per > 0) {
        s += fund.per < 25 ? 20 : 10;
      }
      if (fund && fund.roe != null) {
        if (fund.roe > 10) s += 10;
        else if (fund.roe > 5) s += 5;
      }
      uptrendScore = Math.max(0, Math.min(100, Math.round(s)));
    }

    // FIX (2026-09-19, backtest-validated threshold change): "confirmed"
    // now gates on tech.score (the RAW technical score, 0-100 — the exact
    // metric runUnifiedScreenerBacktest()'s `?variants=true` "techScore80"
    // variant tested) >= 80, not the fundamentals-diluted uptrendScore.
    // Of 3 formula tweaks backtested this week (whaleScore>=4, dropping
    // the whale volume-spike double-count, and this one), techScore80 was
    // the ONLY one that held up after removing the 4 mania-stock outliers
    // (ALKA/NICK/EKAD/LIFE) that drove every other backtest result this
    // week: median alpha +0.82% and beat-benchmark 54.3% on N=95 with
    // those outliers excluded — the other two tweaks stayed negative even
    // WITH outliers included. uptrendScore itself (fundamentals-blended,
    // still used for display/sort/`minUptrend` filter) is UNCHANGED —
    // using it here instead of tech.score would test a criterion that was
    // never actually backtested (uptrendScore>=80 is mathematically
    // unreachable for any stock without real fundamentals coverage, since
    // uptrendScore = tech.score*0.7 + bonus, capped at 100).
    // Regulatory Health Gate: FLAGGED/UNKNOWN/DATA_ERROR must NEVER be
    // presented as a confirmed opportunity, regardless of technical/whale
    // quality (docs/regulatory-health-gate.md §6/§23).
    const regGate = regulatoryGate.byTicker[code] || { status: 'UNKNOWN', eligible: false, reason: null };
    const confirmed = tech != null && tech.score >= 80 && whaleScore >= 3;
    // Regulatory Health Gate: FLAGGED/UNKNOWN/DATA_ERROR must NEVER be
    // presented as a confirmed opportunity, regardless of technical/whale
    // quality (docs/regulatory-health-gate.md §6/§23) — applied as a
    // separate AND rather than folded into `confirmed` above so the
    // backtest-validated tech.score>=80/whaleScore>=3 threshold itself
    // (runUnifiedScreenerBacktest()'s exact baseline) stays untouched.
    const regulatoryConfirmed = confirmed && regGate.eligible;

    return {
      ticker: code,
      name: stock.name,
      sector: stock.sector || 'Equities',
      board: stock.board,
      indexes: stock.indexes || {},
      regulatoryStatus: regGate.status,
      regulatoryEligible: regGate.eligible,
      regulatoryReason: regGate.reason,
      price: (fund && fund.price != null) ? fund.price : null,
      chg1d: tech ? tech.chg1d : null,
      chg7d: tech ? tech.chg7d : null,
      per: fund ? fund.per : null,
      pbv: fund ? fund.pbv : null,
      roe: fund ? fund.roe : null,
      isRealFundamental: !!fund,
      trend: tech ? tech.trend : null,
      rsi14: tech ? tech.rsi14 : null,
      ema20: tech ? tech.ema20 : null,
      ema50: tech ? tech.ema50 : null,
      volRatio: tech ? tech.volRatio : null,
      isRealTechnical: !!tech,
      uptrendScore,
      whaleScore,
      whaleLabel,
      whaleSignals,
      whaleDataAvailable,
      confirmedUptrendWhale: regulatoryConfirmed,
      // Wave analysis (Elliott Wave/SuperTrend/Fibonacci, ported from
      // TradeWave's Wave Scanner — see computeWaveAnalysis()). Rides the
      // same technical cache entry, so isRealTechnical also covers this.
      wavePhase: (tech && tech.wave) ? tech.wave.wavePhase : null,
      waveScore: (tech && tech.wave) ? tech.wave.waveScore : null,
      superTrendBullish: (tech && tech.wave) ? tech.wave.superTrendBullish : null,
      cmf: (tech && tech.wave) ? tech.wave.cmf : null,
      waveInvalidation: (tech && tech.wave) ? tech.wave.invalidation : null,
      waveTp1: (tech && tech.wave) ? tech.wave.tp1 : null,
      waveTp2: (tech && tech.wave) ? tech.wave.tp2 : null,
      waveTp3: (tech && tech.wave) ? tech.wave.tp3 : null,
      waveRiskReward: (tech && tech.wave) ? tech.wave.riskReward : null
    };
  });

  let filtered = evaluated;
  // Regulatory Health Gate default: sembunyikan saham FLAGGED/UNKNOWN/
  // DATA_ERROR dari hasil Screener secara default (docs/regulatory-
  // health-gate.md §22 -- Opportunity Radar/Screener beroperasi di atas
  // ELIGIBLE_UNIVERSE, bukan seluruh raw universe begitu saja). TIDAK
  // silently menyembunyikan data selamanya -- ?excludeFlagged=false
  // menampilkan semuanya lagi untuk transparansi kalau user memang mau
  // lihat (konsisten dengan CLAUDE.md #2: jangan sepihak batasi cakupan
  // tanpa opsi eksplisit).
  if (excludeFlagged !== false && excludeFlagged !== 'false') {
    filtered = filtered.filter(item => item.regulatoryEligible);
  }
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
  if (whale === 'ACCUM') filtered = filtered.filter(item => item.whaleScore >= 1);
  else if (whale === 'DIST') filtered = filtered.filter(item => item.whaleScore <= -1);
  if (minUptrend != null && minUptrend !== '') {
    const th = Number(minUptrend);
    filtered = filtered.filter(item => item.uptrendScore != null && item.uptrendScore >= th);
  }
  if (maxPer != null && maxPer !== '') {
    const th = Number(maxPer);
    filtered = filtered.filter(item => item.per != null && item.per > 0 && item.per <= th);
  }
  if (minRoe != null && minRoe !== '') {
    const th = Number(minRoe);
    filtered = filtered.filter(item => item.roe != null && item.roe >= th);
  }
  if (confirmedOnly === true || confirmedOnly === 'true') {
    filtered = filtered.filter(item => item.confirmedUptrendWhale);
  }
  if (wavePhase && wavePhase !== 'ALL') {
    filtered = filtered.filter(item => item.wavePhase === wavePhase);
  }

  const sortField = sort || 'uptrendScore';
  const isDesc = order !== 'asc';
  filtered.sort((a, b) => {
    if (sortField === 'ticker') return isDesc ? b.ticker.localeCompare(a.ticker) : a.ticker.localeCompare(b.ticker);
    const vA = a[sortField] != null ? a[sortField] : -Infinity;
    const vB = b[sortField] != null ? b[sortField] : -Infinity;
    return isDesc ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
  });

  const total = filtered.length;
  const start = parseInt(offset, 10) || 0;
  const pageLimit = parseInt(limit, 10) || total;
  const paginated = filtered.slice(start, start + pageLimit);

  return {
    success: true,
    total,
    count: paginated.length,
    rows: paginated,
    summary: {
      totalUniverse: evaluated.length,
      confirmedCount: evaluated.filter(x => x.confirmedUptrendWhale).length,
      accumulationCount: evaluated.filter(x => x.whaleScore >= 1).length,
      distributionCount: evaluated.filter(x => x.whaleScore <= -1).length,
      technicalCoverage: evaluated.filter(x => x.isRealTechnical).length,
      fundamentalCoverage: evaluated.filter(x => x.isRealFundamental).length,
      waveCoverage: evaluated.filter(x => x.wavePhase != null).length,
      // Regulatory Health Gate observability (docs/regulatory-health-gate.md
      // §24) — nilai runtime asli, bukan contoh yang di-hardcode.
      regulatoryClear: regulatoryGate.summary.clear,
      regulatoryFlagged: regulatoryGate.summary.flagged,
      regulatoryUnknown: regulatoryGate.summary.unknown,
      regulatoryDataError: regulatoryGate.summary.dataError
    },
    dataSources: {
      accumulationDistribution: { isSimulated: accDist.isSimulated, dataSource: accDist.dataSource },
      foreignFlow: { isSimulated: foreignFlow.isSimulated, dataSource: foreignFlow.dataSource },
      regulatory: { available: regulatoryGate.dataAvailable, isStale: regulatoryGate.isStale, source: 'BEI (idx.co.id)', checkedAt: regulatoryGate.checkedAt }
    },
    updatedAt: new Date().toISOString()
  };
}

// ════════════════════════════════════════════════════════════
// UNIFIED SCREENER — WIN RATE VALIDATION (2026-09-18, user-requested:
// "bagaimana agar saya bisa menguji apakah screener benar atau salah")
// ════════════════════════════════════════════════════════════
// Two tracks, both needed because neither alone is trustworthy:
//
// TRACK A — runUnifiedScreenerBacktest(): historical backtest, fast
// (results this session), but can ONLY test the Whale + technical-Uptrend
// components. The valuation component (PER/ROE bonus in
// generateUnifiedScreener()) is DELIBERATELY EXCLUDED here — this app only
// caches the LATEST fundamentals snapshot, never a point-in-time historical
// one, so scoring a 6-month-old signal with TODAY's PER/ROE would be
// look-ahead bias (the backtest would "know" fundamentals it couldn't have
// known then), inflating the win rate dishonestly. Never add a fundamentals
// join to this function without a real point-in-time fundamentals dataset.
//
// TRACK B — logTodaysUnifiedScreenerSignals()/resolveScreenerSignalLog():
// forward paper-trading log, slow (results take horizonDays to mature) but
// tests the FULL live formula (including valuation) with zero look-ahead
// bias by construction — it only ever uses data available at logging time.
async function runUnifiedScreenerBacktest(params = {}) {
  const apiKey = process.env.INVEZGO_API_KEY;
  if (!apiKey) {
    return {
      success: true,
      available: false,
      reason: 'Invezgo API key belum dikonfigurasi — backtest whale/akumulasi butuh data historis top-movers real, tidak bisa disimulasikan secara jujur.',
      datesScanned: 0, totalSignals: 0, winRate: null, signals: []
    };
  }

  // Bounded to keep this runnable within Vercel's 30s function budget —
  // each sampled date costs 2 Invezgo calls (accumulation + foreign, both
  // whole-market in 1 call each, cached 24h via getOrFetch so re-running
  // with an overlapping range is cheap on repeat).
  const lookbackDays = Math.min(Math.max(Number(params.lookbackDays) || 45, 10), 90);
  const forwardDays = Math.min(Math.max(Number(params.forwardDays) || 20, 5), 60);

  const dates = [];
  const today = new Date();
  for (let i = lookbackDays; i >= forwardDays; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip Sat/Sun — a holiday weekday just returns empty data below, handled honestly
    dates.push(d.toISOString().slice(0, 10));
  }

  const perDateResults = await Promise.all(dates.map(async (date) => {
    const [acc, flow] = await Promise.all([
      getUniverseAccumulationDistribution({ date }),
      getUniverseForeignFlow({ date })
    ]);
    return { date, acc, flow };
  }));

  // Candidate universe = any ticker that appeared in top/accumulation on
  // ANY sampled date (that's the only way a whale signal could exist).
  const candidateSet = new Set();
  perDateResults.forEach((r) => (r.acc.accumulation || []).forEach((x) => candidateSet.add(x.ticker)));
  const candidates = Array.from(candidateSet).slice(0, 80); // bound worst-case Yahoo fetch count

  const histories = await fetchYahooHistoryBatched(candidates, 'BACKTEST');
  const historyByTicker = new Map();
  histories.forEach((r, i) => { if (r.status === 'fulfilled') historyByTicker.set(candidates[i], r.value?.points || []); });

  const ihsgHist = await fetchYahooHistory('^JKSE', 'BACKTEST');
  const ihsgPoints = ihsgHist?.points || [];

  function firstIndexAtOrAfter(points, dateStr) {
    const t = new Date(dateStr + 'T00:00:00Z').getTime();
    return points.findIndex((p) => p.t >= t);
  }

  // Candidate pool: computed ONCE per candidate-date pair, unconditionally
  // (no threshold filter applied yet) — both whaleScore variants and the
  // raw techScore are kept so multiple parameter combinations can be
  // evaluated below WITHOUT re-fetching Invezgo/Yahoo data again. This is
  // what lets ?variants=true test several formula tweaks in one HTTP call.
  const candidatePool = [];
  perDateResults.forEach((r) => {
    const accByCode = new Map((r.acc.accumulation || []).map((x) => [x.ticker, x]));
    const netBuyByCode = new Map((r.flow.netBuy || []).map((x) => [x.ticker, x]));

    accByCode.forEach((accRow, ticker) => {
      const points = historyByTicker.get(ticker);
      if (!points || points.length < 60) return;
      const idx = firstIndexAtOrAfter(points, r.date);
      if (idx < 30) return; // not enough real history before this date for a trustworthy technical read

      // No-lookahead guarantee: only bars up to and including the signal
      // date are ever passed to computeTechnicalSignal().
      const pastPoints = points.slice(0, idx + 1);
      const tech = computeTechnicalSignal(pastPoints);
      if (!tech) return;

      // FIX (2026-09-19, user auditing formula strength): whaleScoreFull
      // matches generateUnifiedScreener() exactly, INCLUDING the volume-
      // spike+uptrend +1 bonus — but that same volRatio/trend pair also
      // dominates tech.score's own trend (0-50) and volume (0-25) bands.
      // whaleScoreNoVolSpike drops that bonus so the "variants" comparison
      // below can test whether removing this double-count changes result
      // quality, without re-fetching any data.
      let whaleScoreFull = 2; // accumulation match (same weight as generateUnifiedScreener())
      if (netBuyByCode.has(ticker)) whaleScoreFull += 1;
      const volSpikeBonus = (tech.volRatio >= 2 && tech.trend === 'UPTREND') ? 1 : 0;
      whaleScoreFull += volSpikeBonus;
      const whaleScoreNoVolSpike = whaleScoreFull - volSpikeBonus;

      const techScore = tech.score; // valuation deliberately excluded, see file header comment

      const fwdIdx = idx + forwardDays;
      if (fwdIdx >= points.length) return; // forward window not available yet for this date

      const entryPrice = pastPoints[pastPoints.length - 1].c;
      const exitPrice = points[fwdIdx].c;
      if (!entryPrice || !exitPrice) return;
      const returnPct = Math.round(((exitPrice - entryPrice) / entryPrice) * 10000) / 100;

      let benchmarkReturnPct = null;
      const ihsgIdx = firstIndexAtOrAfter(ihsgPoints, r.date);
      if (ihsgIdx >= 0 && ihsgIdx + forwardDays < ihsgPoints.length) {
        const ihsgEntry = ihsgPoints[ihsgIdx].c;
        const ihsgExit = ihsgPoints[ihsgIdx + forwardDays].c;
        if (ihsgEntry) benchmarkReturnPct = Math.round(((ihsgExit - ihsgEntry) / ihsgEntry) * 10000) / 100;
      }

      candidatePool.push({
        ticker, date: r.date, whaleScoreFull, whaleScoreNoVolSpike, techScore,
        entryPrice: Math.round(entryPrice), exitPrice: Math.round(exitPrice),
        returnPct, benchmarkReturnPct,
        alphaPct: benchmarkReturnPct != null ? Math.round((returnPct - benchmarkReturnPct) * 100) / 100 : null,
        result: returnPct > 0 ? 'WIN' : 'LOSS'
      });
    });
  });

  function summarize(pool, filterFn, label) {
    const signals = pool.filter(filterFn).map((s) => ({
      ticker: s.ticker, date: s.date,
      whaleScore: s.whaleScoreFull, uptrendScoreTechOnly: s.techScore,
      entryPrice: s.entryPrice, exitPrice: s.exitPrice,
      returnPct: s.returnPct, benchmarkReturnPct: s.benchmarkReturnPct,
      alphaPct: s.alphaPct, result: s.result
    }));
    const wins = signals.filter((s) => s.result === 'WIN');
    const withBenchmark = signals.filter((s) => s.alphaPct != null);
    const beatBenchmark = withBenchmark.filter((s) => s.alphaPct > 0);
    return {
      label,
      totalSignals: signals.length,
      winRate: signals.length ? Math.round((wins.length / signals.length) * 1000) / 10 : null,
      avgReturnPct: signals.length ? Math.round((signals.reduce((s, x) => s + x.returnPct, 0) / signals.length) * 100) / 100 : null,
      medianReturnPct: signals.length ? median(signals.map((x) => x.returnPct)) : null,
      avgAlphaPct: withBenchmark.length ? Math.round((withBenchmark.reduce((s, x) => s + x.alphaPct, 0) / withBenchmark.length) * 100) / 100 : null,
      medianAlphaPct: withBenchmark.length ? median(withBenchmark.map((x) => x.alphaPct)) : null,
      beatBenchmarkRate: withBenchmark.length ? Math.round((beatBenchmark.length / withBenchmark.length) * 1000) / 10 : null,
      // FIX (2026-09-19, user auditing formula validity found the detail array
      // silently truncated at 150 of 216 real signals with no explanation —
      // the aggregate stats above were always computed from the FULL array so
      // they were never wrong, but hiding most of the underlying evidence
      // behind a correct-looking summary is exactly the kind of "technically
      // honest number, misleading presentation" CLAUDE.md warns against.
      // Worst case size is bounded anyway: candidatesScanned is capped at 80
      // and lookbackDays at 90, so this can never balloon to a problematic
      // payload size.
      signals
    };
  }

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    return Math.round(m * 100) / 100;
  }

  // FIX (2026-09-19, formula-strength audit result): baseline now mirrors
  // generateUnifiedScreener()'s CURRENT "confirmed" gate (techScore>=80,
  // raised from >=60 — see that function's own comment for the full
  // backtest evidence). This baseline MUST always track whatever
  // generateUnifiedScreener() actually does in production, or this
  // endpoint would silently validate a formula that isn't the live one
  // anymore — exactly the kind of mismatch this week's audit exists to
  // catch. techScore60 is kept as a named variant purely for historical
  // comparison (what production used to require, before this change).
  const baselineFilter = (s) => s.whaleScoreFull >= 3 && s.techScore >= 80;

  // ?variants=true (2026-09-19, user-requested: test formula tweaks found
  // during the strength audit "dalam 1 perintah" instead of one endpoint
  // call per tweak) — reuses this SAME candidatePool (already-fetched
  // Invezgo/Yahoo data) for all comparisons, no extra network calls:
  //   baseline        = current production formula (techScore>=80)
  //   whale4          = stricter conviction gate (whaleScore>=4 instead of >=3)
  //   noDoubleCount   = drops the volume-spike+uptrend whale bonus, which
  //                     the code audit found already double-counted inside
  //                     tech.score's own trend+volume bands
  //   techScore60     = the OLD production threshold, kept for reference
  if (params.variants === true || params.variants === 'true') {
    return {
      success: true,
      available: true,
      methodology: 'Perbandingan varian formula whale+teknikal dari POOL SINYAL YANG SAMA (data Invezgo/Yahoo di-fetch sekali, tidak diulang per varian) — baseline (formula produksi saat ini, techScore>=80), whale4 (ambang whaleScore>=4), noDoubleCount (bonus volume-spike+uptrend dihapus dari whaleScore karena sudah dihitung juga di tech.score), techScore60 (ambang teknikal LAMA sebelum 2026-09-19, disimpan untuk perbandingan historis). Komponen VALUASI (PER/ROE) SENGAJA TIDAK disertakan di semua varian — lihat komentar header fungsi ini.',
      lookbackDays,
      forwardDays,
      datesScanned: dates.length,
      candidatesScanned: candidates.length,
      variants: {
        baseline: summarize(candidatePool, baselineFilter, 'Baseline (whaleScore>=3, techScore>=80) — formula produksi saat ini'),
        whale4: summarize(candidatePool, (s) => s.whaleScoreFull >= 4 && s.techScore >= 80, 'whaleScore>=4 (ambang whale lebih ketat)'),
        noDoubleCount: summarize(candidatePool, (s) => s.whaleScoreNoVolSpike >= 3 && s.techScore >= 80, 'Bonus volume-spike+uptrend dihapus dari whaleScore (anti dobel-hitung)'),
        techScore60: summarize(candidatePool, (s) => s.whaleScoreFull >= 3 && s.techScore >= 60, 'techScore>=60 (ambang LAMA sebelum 2026-09-19, referensi historis)')
      },
      computedAt: new Date().toISOString()
    };
  }

  const baseline = summarize(candidatePool, baselineFilter, 'Baseline');
  return {
    success: true,
    available: true,
    methodology: 'Sinyal = ticker muncul di Invezgo top/accumulation pada tanggal D, DAN whaleScore>=3 (akumulasi+foreign+volume spike, formula sama seperti generateUnifiedScreener()), DAN skor teknikal (computeTechnicalSignal, dihitung HANYA dari bar sampai tanggal D — tidak ada lookahead) >=80 (dinaikkan dari >=60 pada 2026-09-19 setelah backtest menunjukkan ambang lama tidak punya edge di luar outlier ekstrem — lihat generateUnifiedScreener()). Return diukur dari harga tanggal D ke D+forwardDays. Komponen VALUASI (PER/ROE) SENGAJA TIDAK disertakan — tidak ada snapshot fundamental historis per tanggal di aplikasi ini, menyertakannya akan jadi look-ahead bias.',
    lookbackDays,
    forwardDays,
    datesScanned: dates.length,
    candidatesScanned: candidates.length,
    totalSignals: baseline.totalSignals,
    winRate: baseline.winRate,
    avgReturnPct: baseline.avgReturnPct,
    avgAlphaPct: baseline.avgAlphaPct,
    beatBenchmarkRate: baseline.beatBenchmarkRate,
    signals: baseline.signals,
    computedAt: new Date().toISOString()
  };
}

// ── Forward paper-trading log (Track B) ──────────────────────────────
// Persisted as ONE JSON array under a single Redis string key (reusing
// yfStoreGet/yfStoreSetEx — no new Redis primitives needed) rather than a
// Supabase table: this app's Supabase access is ALWAYS client-side/per-user
// (see server.js's ai_signal_log comments — server.js never holds a
// Supabase client), and this log is a market-wide signal, not personal
// advice tied to a user_id, so it doesn't fit that per-user RLS model
// anyway. No new cron slot exists either (Vercel Hobby caps at 2, both
// already used by warm-radar-fundamentals/warm-technical-indicators) — so
// logging piggybacks on the technical-indicators cron (server.js), and
// resolution happens lazily ON READ (same "cache miss triggers a fetch"
// pattern already used throughout this app), not via a 3rd cron.
const SCREENER_SIGNAL_LOG_KEY = 'screener:signallog:entries';
const SCREENER_SIGNAL_LOG_MAX = 500;
const SCREENER_SIGNAL_HORIZON_DAYS = 20;

async function getScreenerSignalLog() {
  const raw = await yfStoreGet(SCREENER_SIGNAL_LOG_KEY);
  return Array.isArray(raw) ? raw : [];
}
async function setScreenerSignalLog(entries) {
  await yfStoreSetEx(SCREENER_SIGNAL_LOG_KEY, entries.slice(-SCREENER_SIGNAL_LOG_MAX), 0); // no expiry — grows/prunes by count
}

// Called once/day (piggybacked on the technical cron) — logs today's
// "confirmed" (Uptrend>=60 + Whale>=3) Unified Screener rows as pending
// forward-test entries. Idempotent: skips if today is already logged.
// FIX (2026-09-18, caught by this feature's own regression test): the
// original idempotency check scanned entries for one dated `today` — but
// on a day with ZERO confirmed signals (the common case), nothing ever
// gets stored with today's date, so that check silently never triggers and
// the cron would re-run generateUnifiedScreener() on every invocation that
// day instead of skipping. Tracked with an explicit separate marker key
// instead of inferring "already ran today" from the entries array's
// contents.
const SCREENER_SIGNAL_LOG_LAST_CHECKED_KEY = 'screener:signallog:lastCheckedDate';

async function logTodaysUnifiedScreenerSignals() {
  const today = new Date().toISOString().slice(0, 10);
  const lastChecked = await yfStoreGet(SCREENER_SIGNAL_LOG_LAST_CHECKED_KEY);
  if (lastChecked === today) {
    const entries = await getScreenerSignalLog();
    return { added: 0, reason: 'already logged today', totalEntries: entries.length };
  }

  const entries = await getScreenerSignalLog();
  const screener = await generateUnifiedScreener({ confirmedOnly: true, limit: 30 });
  const newEntries = (screener.rows || [])
    .filter((r) => r.price != null) // never log a signal without a real, verifiable entry price
    .map((r) => ({
      date: today, ticker: r.ticker,
      whaleScore: r.whaleScore, uptrendScore: r.uptrendScore,
      entryPrice: r.price, horizonDays: SCREENER_SIGNAL_HORIZON_DAYS,
      status: 'pending'
    }));

  const updated = entries.concat(newEntries);
  await setScreenerSignalLog(updated);
  await yfStoreSetEx(SCREENER_SIGNAL_LOG_LAST_CHECKED_KEY, today, 0);
  return { added: newEntries.length, totalEntries: updated.length };
}

// Resolves any pending entry whose horizon has matured, using real Yahoo
// history — never resolves early (a "not matured yet" entry stays pending,
// honestly, rather than being estimated). Called on every read of the log.
async function resolveScreenerSignalLog() {
  const entries = await getScreenerSignalLog();
  const now = Date.now();
  let changed = false;

  const pendingMatured = entries.filter((e) => {
    if (e.status !== 'pending') return false;
    const daysSince = Math.floor((now - new Date(e.date + 'T00:00:00Z').getTime()) / (24 * 60 * 60 * 1000));
    return daysSince >= e.horizonDays;
  });
  if (pendingMatured.length === 0) return entries;

  const tickers = Array.from(new Set(pendingMatured.map((e) => e.ticker)));
  const [histories, ihsgHist] = await Promise.all([
    fetchYahooHistoryBatched(tickers, 'BACKTEST'),
    fetchYahooHistory('^JKSE', 'BACKTEST')
  ]);
  const historyByTicker = new Map();
  histories.forEach((r, i) => { if (r.status === 'fulfilled') historyByTicker.set(tickers[i], r.value?.points || []); });
  const ihsgPoints = ihsgHist?.points || [];

  entries.forEach((e) => {
    if (e.status !== 'pending') return;
    const daysSince = Math.floor((now - new Date(e.date + 'T00:00:00Z').getTime()) / (24 * 60 * 60 * 1000));
    if (daysSince < e.horizonDays) return; // not matured — stays pending, honest

    const points = historyByTicker.get(e.ticker) || [];
    const entryTs = new Date(e.date + 'T00:00:00Z').getTime();
    const targetTs = entryTs + e.horizonDays * 24 * 60 * 60 * 1000;
    const exitPoint = points.find((p) => p.t >= targetTs) || (points.length ? points[points.length - 1] : null);
    if (!exitPoint || !e.entryPrice) return; // can't resolve honestly yet — leave pending, try again next read

    e.exitPrice = exitPoint.c;
    e.returnPct = Math.round(((e.exitPrice - e.entryPrice) / e.entryPrice) * 10000) / 100;

    const ihsgEntryPoint = ihsgPoints.find((p) => p.t >= entryTs);
    const ihsgExitPoint = ihsgEntryPoint ? ihsgPoints.find((p) => p.t >= targetTs) : null;
    if (ihsgEntryPoint && ihsgExitPoint && ihsgEntryPoint.c) {
      e.benchmarkReturnPct = Math.round(((ihsgExitPoint.c - ihsgEntryPoint.c) / ihsgEntryPoint.c) * 10000) / 100;
      e.alphaPct = Math.round((e.returnPct - e.benchmarkReturnPct) * 100) / 100;
    } else {
      e.benchmarkReturnPct = null;
      e.alphaPct = null;
    }
    e.outcome = e.returnPct > 0 ? 'WIN' : 'LOSS';
    e.status = 'resolved';
    e.resolvedAt = new Date().toISOString();
    changed = true;
  });

  if (changed) await setScreenerSignalLog(entries);
  return entries;
}

async function getScreenerSignalLogSummary() {
  const entries = await resolveScreenerSignalLog();
  const resolved = entries.filter((e) => e.status === 'resolved');
  const wins = resolved.filter((e) => e.outcome === 'WIN');
  const withAlpha = resolved.filter((e) => e.alphaPct != null);

  return {
    success: true,
    totalEntries: entries.length,
    pendingCount: entries.filter((e) => e.status === 'pending').length,
    resolvedCount: resolved.length,
    winRate: resolved.length ? Math.round((wins.length / resolved.length) * 1000) / 10 : null,
    avgAlphaPct: withAlpha.length ? Math.round((withAlpha.reduce((s, e) => s + e.alphaPct, 0) / withAlpha.length) * 100) / 100 : null,
    entries: entries.slice(-150).reverse(),
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

// ── Harga Wajar (MoS) auto-fill: ringkasan laporan keuangan real Invezgo ──
// Baris yang dicari by-name (diverifikasi dari 2 contoh JSON real BBCA yang
// diupload user — lihat komentar di fetchInvezgoFinancialStatement()):
//   - Equity: pakai baris ekuitas milik pemilik entitas induk (bukan "Jumlah
//     ekuitas" total yang termasuk kepentingan non-pengendali) supaya basisnya
//     konsisten dengan Net Income & EPS yang juga basis entitas induk.
//   - Net Income: "Laba (rugi) yang dapat diatribusikan ke entitas induk".
//   - EPS: "Laba (rugi) per saham dasar dari operasi yang dilanjutkan", nilai
//     mentah dibagi 1.000.000 (faktor skala BELUM didokumentasikan resmi,
//     disimpulkan dari kewajaran angka — untuk BBCA FY2025 467000000/1e6=467
//     cocok dengan EPS riil BBCA). Diberi label MEDIUM CONFIDENCE di UI.
//   - Shares Outstanding: TIDAK ADA baris langsung di BS maupun IS — di-
//     derive sebagai Net Income ÷ EPS. Diberi label "diturunkan, bukan field
//     langsung" di UI.
//   - DPS: TIDAK ADA baris dividend-per-share sama sekali di kedua laporan
//     ini — selalu null, harus diisi manual oleh user.
const HW_EQUITY_ROW_NAME = 'Jumlah ekuitas yang diatribusikan kepada pemilik entitas induk';
const HW_NET_INCOME_ROW_NAME = 'Laba (rugi) yang dapat diatribusikan ke entitas induk';
const HW_EPS_ROW_NAME = 'Laba (rugi) per saham dasar dari operasi yang dilanjutkan';
const HW_EPS_SCALE_DIVISOR = 1000000;

function hwFindRowValuesByName(rows, name) {
  const row = (rows || []).find(r => r && r.name === name);
  if (!row || !Array.isArray(row.values)) return new Map();
  const byYear = new Map();
  for (const v of row.values) {
    if (v && typeof v.year === 'number' && typeof v.amount === 'number') byYear.set(v.year, v.amount);
  }
  return byYear;
}

async function generateFinancialStatementSummary(ticker) {
  const clean = String(ticker || '').toUpperCase().trim();
  const [bsResult, isResult] = await Promise.all([
    fetchInvezgoFinancialStatement(clean, 'BS', 'FY', 4),
    fetchInvezgoFinancialStatement(clean, 'IS', 'FY', 4)
  ]);

  if (!bsResult.ok || !isResult.ok) {
    return {
      ticker: clean,
      available: false,
      reason: (!bsResult.ok ? bsResult.reason : isResult.reason) || 'UNKNOWN',
      dataSource: 'Invezgo (tidak tersedia)',
      rows: []
    };
  }

  const equityByYear = hwFindRowValuesByName(bsResult.rows, HW_EQUITY_ROW_NAME);
  const netIncomeByYear = hwFindRowValuesByName(isResult.rows, HW_NET_INCOME_ROW_NAME);
  const epsRawByYear = hwFindRowValuesByName(isResult.rows, HW_EPS_ROW_NAME);

  const years = Array.from(new Set([...equityByYear.keys(), ...netIncomeByYear.keys(), ...epsRawByYear.keys()]))
    .sort((a, b) => a - b);

  const rows = [];
  for (const year of years) {
    const equityRaw = equityByYear.get(year);
    const netIncomeRaw = netIncomeByYear.get(year);
    const epsRaw = epsRawByYear.get(year);
    if (equityRaw == null || netIncomeRaw == null || epsRaw == null) continue;

    const eps = epsRaw / HW_EPS_SCALE_DIVISOR;
    if (!eps) continue;
    const equity = equityRaw / 1e9; // Miliar Rp
    const netIncome = netIncomeRaw / 1e9; // Miliar Rp
    const shares = (netIncomeRaw / eps) / 1e6; // Juta lembar (derived)

    rows.push({
      year,
      eps: Number(eps.toFixed(2)),
      equity: Number(equity.toFixed(3)),
      shares: Number(shares.toFixed(0)),
      dps: null,
      per: '',
      netIncome: Number(netIncome.toFixed(3))
    });
  }

  return {
    ticker: clean,
    available: rows.length > 0,
    dataSource: 'Invezgo (Laporan Keuangan Real)',
    rows,
    disclosures: {
      epsScaleAssumption: 'Nilai EPS mentah dari API dibagi 1.000.000 — faktor skala ini disimpulkan dari kewajaran angka (belum didokumentasikan resmi oleh Invezgo). Confidence: MEDIUM.',
      sharesDerived: 'Jumlah saham beredar TIDAK tersedia sebagai field langsung — diturunkan dari Net Income ÷ EPS, bukan data mentah dari API.',
      dpsUnavailable: 'Dividend per Share (DPS) tidak tersedia di endpoint laporan keuangan Invezgo — isi manual jika diperlukan.'
    }
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
  getBrokerSummaryByBroker,
  generateBandarMovementData,
  fetchInvezgoTradeFlow,
  fetchInvezgoBrokerFlow,
  generateShareholderComposition,
  generateSectorRotation,
  generateMasterScreener,
  computeWaveAnalysis,
  generateUnifiedScreener,
  runUnifiedScreenerBacktest,
  logTodaysUnifiedScreenerSignals,
  resolveScreenerSignalLog,
  getScreenerSignalLogSummary,
  warmTechnicalRotating,
  getCachedTechnicalOnly,
  hasTechnicalCacheEntry,
  getCachedTechnicalBulk,
  fetchIdxStockScreener,
  fetchIdxSpecialNotations,
  IDX_SPECIAL_NOTATION_DICT,
  IDX_BROKERS,
  assessDataQuality,
  getDataQualityTelemetry,
  classifyMarketRegime,
  computeConfluence,
  generateTradingHypothesis,
  generateExitHypothesis,
  computeIndicatorSeries,
  generateFinancialStatementSummary
};

