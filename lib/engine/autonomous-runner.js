/**
 * lib/engine/autonomous-runner.js — Server-Side Autonomous AI Trading Engine Runner
 *
 * SPECIFICATION & GOVERNANCE:
 * - AGENTS.md §3, §4, §5, §11, §12, §16, §21, §22, §28
 * - FINANCIAL_POLICY.md §7: Max single-position 15%, Min cash buffer 20%, 1% risk/trade.
 * - COSTS: buyFee 0.15%, sellFee 0.25% (ROUND_TRIP_COST_PCT 0.40%, lib/backtest/costs.js).
 *
 * MISSION:
 * Menjalankan siklus autonomous trading di sisi server:
 * 1. Jadwal Pasar IDX Resmi (Senin-Jumat 09:00-15:45 WIB dengan waktu istirahat).
 * 2. Monitoring posisi terbuka secara berkala (SL, TP, Trailing Stop, MFE, MAE).
 * 3. Eksekusi posisi baru dengan canonical sizing, regulatory gate, & proteksi idempotensi.
 * 4. Closed-loop feedback: kalibrasi bobot adaptif otomatis pada setiap posisi yang ditutup.
 * 5. State persisten terisolasi (tanpa data sintetis).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  classifyMarketRegime,
  computeStockSignalBatch,
  fetchYahooQuote,
  loadBaseUniverse
} from '../idx-data-engine.js';
import { filterEligibleTickers } from '../regulatory-gate.js';
import { BUY_FEE_PCT, SELL_FEE_PCT } from '../backtest/costs.js';
import { evaluateMetaLabelFilter } from './meta-labeler.js';
import { getQualifyingTickersToday } from './strategy/StrategyEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE_PATH = path.resolve(__dirname, '..', '..', 'data', 'ai_autonomous_state.json');

// CANONICAL RISK & TRADING POLICY CONSTANTS
export const RUNNER_CONFIG = Object.freeze({
  INITIAL_CAPITAL: 100000000,     // Rp 100 Juta modal virtual terisolasi
  MAX_POSITION_PCT: 0.15,         // Maksimal 15% dari total ekuitas per emiten
  MIN_CASH_BUFFER_PCT: 0.20,      // Wajib simpan minimal 20% kas RDN
  RISK_PER_TRADE_PCT: 0.01,       // 1% risiko modal per trade
  MAX_OPEN_POSITIONS: 5,          // Maksimal 5 posisi terbuka simultan
  MIN_SCORE_TO_BUY: 70,           // Ambang batas skor adaptif untuk BUY
  TRAILING_STOP_TRIGGER_PCT: 5.0, // Aktifkan trailing stop saat profit >= +5%
  TRAILING_STOP_GIVEBACK_PCT: 3.0 // Trailing stop mundur 3% dari puncak harga (high water mark)
});

export function getWibDate(date = new Date()) {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  return new Date(utc + (7 * 3600000));
}

export function getWibDateString(date = new Date()) {
  const w = getWibDate(date);
  const y = w.getFullYear();
  const m = String(w.getMonth() + 1).padStart(2, '0');
  const d = String(w.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Memeriksa apakah saat ini berada dalam jam perdagangan resmi Bursa Efek Indonesia (IDX).
 * Waktu dihitung dalam WIB (UTC+7).
 *
 * Jadwal Resmi BEI:
 * - Senin - Kamis: Sesi 1 (09:00 - 11:30), Istirahat (11:30 - 13:30), Sesi 2 (13:30 - 15:45)
 * - Jumat: Sesi 1 (09:00 - 11:30), Istirahat (11:30 - 14:00), Sesi 2 (14:00 - 15:45)
 * - Sabtu & Minggu: Tutup
 *
 * @param {Date} [date=new Date()]
 * @returns {{ isOpen: boolean, session: string, dayName: string, wibTime: string, reason: string }}
 */
export function isIdxMarketOpen(date = new Date()) {
  const wibDate = getWibDate(date);

  const day = wibDate.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  const hours = wibDate.getHours();
  const minutes = wibDate.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = dayNames[day];
  const wibTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      session: 'CLOSED',
      dayName,
      wibTime,
      reason: `Akhir Pekan (${dayName}) — Bursa Efek Indonesia Tutup`
    };
  }

  const isFriday = (day === 5);
  const s1Start = 9 * 60;        // 09:00
  const s1End = 11 * 60 + 30;    // 11:30
  const s2Start = isFriday ? (14 * 60) : (13 * 60 + 30); // Jumat 14:00, Senin-Kamis 13:30
  const s2End = 15 * 60 + 45;    // 15:45

  if (totalMinutes >= s1Start && totalMinutes < s1End) {
    return {
      isOpen: true,
      session: 'SESI_1',
      dayName,
      wibTime,
      reason: 'Sesi 1 Perdagangan Berlangsung'
    };
  }

  if (totalMinutes >= s1End && totalMinutes < s2Start) {
    return {
      isOpen: false,
      session: 'BREAK',
      dayName,
      wibTime,
      reason: isFriday ? 'Istirahat Sholat Jumat / Siang Bursa' : 'Istirahat Siang Bursa'
    };
  }

  if (totalMinutes >= s2Start && totalMinutes < s2End) {
    return {
      isOpen: true,
      session: 'SESI_2',
      dayName,
      wibTime,
      reason: 'Sesi 2 Perdagangan Berlangsung'
    };
  }

  return {
    isOpen: false,
    session: 'CLOSED',
    dayName,
    wibTime,
    reason: totalMinutes < s1Start ? 'Pra-Pembukaan Bursa (Sebelum 09:00 WIB)' : 'Pasca-Penutupan Bursa (Setelah 15:45 WIB)'
  };
}

/**
 * Membuat struktur state baru untuk Virtual Paper Account.
 */
export function createDefaultAccountState() {
  return {
    initialCapital: RUNNER_CONFIG.INITIAL_CAPITAL,
    cash: RUNNER_CONFIG.INITIAL_CAPITAL,
    totalEquity: RUNNER_CONFIG.INITIAL_CAPITAL,
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalReturnPct: 0,
    maxDrawdownPct: 0,
    winRate: 0,
    profitFactor: null,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    riskPerTradePct: 1.0,
    openPositions: [],
    closedTrades: [],
    adaptiveWeights: {
      regimeMultipliers: {
        BULL_TREND: 1.10,
        SIDEWAYS: 0.95,
        BEAR_TREND: 0.70,
        HIGH_VOLATILITY: 0.80,
        RISK_OFF: 0.60,
        UNKNOWN: 0.90
      },
      strategyMultipliers: {},
      adaptationHistory: []
    },
    decisionLog: [],
    processedOrderKeys: {}
  };
}

/**
 * Memuat state akun dari disk dengan fallback ke state default jika belum ada.
 */
export function loadAutonomousAccountState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.openPositions)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Autonomous Runner] Gagal memuat state dari disk, menggunakan default:', err?.message);
  }
  return createDefaultAccountState();
}

/**
 * Menyimpan state akun ke disk secara aman.
 */
export function saveAutonomousAccountState(state) {
  try {
    const dir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Autonomous Runner] Gagal menyimpan state ke disk:', err?.message);
    return false;
  }
}

/**
 * Menghitung ukuran posisi (position sizing) berdasarkan risiko 1% & batasan portofolio.
 */
export function calculatePositionSizing({ equity, cash, entryPrice, stopLoss }) {
  if (entryPrice <= 0 || stopLoss <= 0 || stopLoss >= entryPrice) {
    return { approved: false, shares: 0, lots: 0, reason: 'INVALID_SL_OR_ENTRY' };
  }

  const riskPerShare = entryPrice - stopLoss;
  const allowedRiskCapital = equity * RUNNER_CONFIG.RISK_PER_TRADE_PCT; // 1%
  const unconstrainedShares = Math.floor(allowedRiskCapital / riskPerShare);

  // Batasan IDX: 1 lot = 100 lembar
  let shares = Math.floor(unconstrainedShares / 100) * 100;

  // Batasan alokasi per emiten (15% ekuitas)
  const maxPositionCost = equity * RUNNER_CONFIG.MAX_POSITION_PCT;
  if (shares * entryPrice > maxPositionCost) {
    shares = Math.floor(maxPositionCost / (entryPrice * 100)) * 100;
  }

  // Batasan RDN cash buffer: Sisakan 20% ekuitas dalam bentuk kas tunai
  const minCashBuffer = equity * RUNNER_CONFIG.MIN_CASH_BUFFER_PCT;
  const availableCashForTrade = Math.max(0, cash - minCashBuffer);
  const costWithBuyFee = entryPrice * (1 + (BUY_FEE_PCT / 100));

  if (shares * costWithBuyFee > availableCashForTrade) {
    shares = Math.floor(availableCashForTrade / (costWithBuyFee * 100)) * 100;
  }

  if (shares < 100) {
    return {
      approved: false,
      shares: 0,
      lots: 0,
      reason: 'INSUFFICIENT_CASH_OR_BUFFER_FOR_1_LOT'
    };
  }

  const grossCost = shares * entryPrice;
  const buyFee = Math.round(grossCost * (BUY_FEE_PCT / 100));
  const totalCost = grossCost + buyFee;

  return {
    approved: true,
    shares,
    lots: shares / 100,
    grossCost,
    buyFee,
    totalCost,
    riskAmount: Math.round(shares * riskPerShare)
  };
}

/**
 * Mengkalibrasi bobot adaptif strategi dan regime saat sebuah trade ditutup.
 */
export function calibrateAdaptiveWeights(weights, closedTrade) {
  if (!weights || !closedTrade) return weights;

  const strat = closedTrade.strategy || 'composite_scoring';
  const regime = closedTrade.regimeAtEntry || closedTrade.regimeAtExit || 'UNKNOWN';
  const result = closedTrade.result;
  const rMult = Number(closedTrade.rMultiple) || 0;

  let stratDelta = 0;
  let regimeDelta = 0;

  if (result === 'WIN') {
    if (rMult >= 2.0) {
      stratDelta = 0.05;
      regimeDelta = 0.02;
    } else {
      stratDelta = 0.03;
      regimeDelta = 0.02;
    }
  } else {
    stratDelta = -0.04;
    regimeDelta = -0.03;
  }

  if (!weights.strategyMultipliers[strat]) weights.strategyMultipliers[strat] = 1.0;
  if (!weights.regimeMultipliers[regime]) weights.regimeMultipliers[regime] = 1.0;

  const oldStrat = weights.strategyMultipliers[strat];
  const oldRegime = weights.regimeMultipliers[regime];

  weights.strategyMultipliers[strat] = Math.max(0.60, Math.min(1.40, Number((oldStrat + stratDelta).toFixed(2))));
  weights.regimeMultipliers[regime] = Math.max(0.60, Math.min(1.40, Number((oldRegime + regimeDelta).toFixed(2))));

  const record = {
    timestamp: new Date().toISOString(),
    tradeId: closedTrade.id,
    ticker: closedTrade.ticker,
    result,
    rMultiple: rMult,
    strategy: strat,
    oldStrategyMultiplier: oldStrat,
    newStrategyMultiplier: weights.strategyMultipliers[strat],
    regime,
    oldRegimeMultiplier: oldRegime,
    newRegimeMultiplier: weights.regimeMultipliers[regime],
    note: `Kalibrasi: ${result} (Strategi ${stratDelta > 0 ? '+' : ''}${stratDelta}, Regime ${regimeDelta > 0 ? '+' : ''}${regimeDelta})`
  };

  if (!Array.isArray(weights.adaptationHistory)) weights.adaptationHistory = [];
  weights.adaptationHistory.unshift(record);
  if (weights.adaptationHistory.length > 50) weights.adaptationHistory.length = 50;

  return weights;
}

/**
 * Mengklasifikasikan kesalahan/kualitas eksekusi trade berdasarkan MFE, MAE, R-Multiple, dan regime.
 * Taksonomi standar sesuai AGENTS.md §22:
 * - CLEAN_WIN: Menang bersih dengan MFE capture >= 40%
 * - ACCEPTABLE_WIN: Menang normal
 * - TIMING_ERROR: Greedy exit (MFE >= 5% tapi berakhir loss/breakeven) atau entry di pucuk (MAE anjlok dalam)
 * - REGIME_ERROR: Kerugian saat pasar bergeser ke BEAR_TREND / RISK_OFF
 * - SIGNAL_ERROR: Setup gagal total tanpa pantulan positif (MFE < 1%)
 * - NORMAL_LOSS: Kerugian wajar terkendali dalam batas risiko 1R
 */
export function classifyTradeError(closedTrade) {
  if (!closedTrade) return 'UNKNOWN';
  const result = closedTrade.result;
  const mfe = Number(closedTrade.mfePct) || 0;
  const mae = Number(closedTrade.maePct) || 0;
  const rMult = Number(closedTrade.rMultiple) || 0;
  const exitReason = closedTrade.exitReason;
  const regimeEntry = closedTrade.regimeAtEntry || 'UNKNOWN';
  const regimeExit = closedTrade.regimeAtExit || 'UNKNOWN';

  if (result === 'WIN') {
    if (mfe >= 5 && rMult >= 1.5) return 'CLEAN_WIN';
    return 'ACCEPTABLE_WIN';
  }

  // Kasus Loss / Breakeven
  // 1. Sempat profit tinggi (MFE >= 5%) tapi tidak amankan cuan, akhirnya kena SL
  if (mfe >= 5.0) {
    return 'TIMING_ERROR';
  }

  // 2. Regime bursa memburuk menjadi BEAR_TREND atau RISK_OFF
  if (regimeExit === 'BEAR_TREND' || regimeExit === 'RISK_OFF' || (regimeEntry !== 'BEAR_TREND' && regimeExit === 'BEAR_TREND')) {
    return 'REGIME_ERROR';
  }

  // 3. Sinyal palsu: langsung anjlok tanpa pantulan sama sekali (MFE < 1%)
  if (mfe < 1.0 && exitReason === 'STOP_LOSS') {
    return 'SIGNAL_ERROR';
  }

  // 4. MAE anjlok sangat dalam sejak awal (misal >= 3.5%)
  if (Math.abs(mae) >= 3.5) {
    return 'TIMING_ERROR';
  }

  return 'NORMAL_LOSS';
}

/**
 * Mengevaluasi posisi terbuka terhadap harga pasar terkini (SL, TP, Trailing Stop, MFE, MAE).
 */
export function evaluatePositionExit(position, currentPrice) {
  if (!position || currentPrice <= 0) return { shouldExit: false };

  const entryPrice = position.entryPrice;
  const highWaterMark = Math.max(position.highWaterMark || entryPrice, currentPrice);
  const lowWaterMark = Math.min(position.lowWaterMark || entryPrice, currentPrice);

  position.highWaterMark = highWaterMark;
  position.lowWaterMark = lowWaterMark;

  const mfePct = Number((((highWaterMark - entryPrice) / entryPrice) * 100).toFixed(2));
  const maePct = Number((((lowWaterMark - entryPrice) / entryPrice) * 100).toFixed(2));
  position.mfePct = mfePct;
  position.maePct = maePct;

  // Trailing Stop Dinamis: Jika harga naik >= +5%, pasang trailing stop 3% di bawah harga puncak
  if (mfePct >= RUNNER_CONFIG.TRAILING_STOP_TRIGGER_PCT) {
    const candidateTrailing = Math.round(highWaterMark * (1 - (RUNNER_CONFIG.TRAILING_STOP_GIVEBACK_PCT / 100)));
    position.trailingStop = Math.max(position.trailingStop || 0, candidateTrailing);
  }

  // 1. Cek Stop Loss
  if (currentPrice <= position.stopLoss) {
    return {
      shouldExit: true,
      exitReason: 'STOP_LOSS',
      exitPrice: position.stopLoss,
      mfePct,
      maePct
    };
  }

  // 2. Cek Take Profit
  if (currentPrice >= position.takeProfit) {
    return {
      shouldExit: true,
      exitReason: 'TARGET_REACHED',
      exitPrice: position.takeProfit,
      mfePct,
      maePct
    };
  }

  // 3. Cek Trailing Stop
  if (position.trailingStop && currentPrice <= position.trailingStop) {
    return {
      shouldExit: true,
      exitReason: 'TRAILING_STOP',
      exitPrice: position.trailingStop,
      mfePct,
      maePct
    };
  }

  return { shouldExit: false, mfePct, maePct };
}

/**
 * Menghitung ulang statistik portofolio paper trading.
 */
function recomputeAccountStats(state) {
  const closed = state.closedTrades || [];
  const wins = closed.filter(t => t.result === 'WIN');
  const losses = closed.filter(t => t.result === 'LOSS');

  state.totalTrades = closed.length;
  state.winningTrades = wins.length;
  state.losingTrades = losses.length;
  state.winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;

  const grossWin = wins.reduce((s, t) => s + Math.max(0, t.realizedPnL), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Math.min(0, t.realizedPnL), 0));
  state.profitFactor = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : (grossWin > 0 ? 99.9 : null);

  state.realizedPnL = closed.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const openVal = (state.openPositions || []).reduce((s, p) => s + (p.shares * (p.currentPrice || p.entryPrice)), 0);
  state.totalEquity = Math.round(state.cash + openVal);
  state.totalReturnPct = Number((((state.totalEquity - state.initialCapital) / state.initialCapital) * 100).toFixed(2));
}

/**
 * Menjalankan satu siklus penuh Autonomous Market Cycle:
 * - Validasi jam bursa IDX
 * - Monitoring & exit posisi terbuka
 * - Scan kandidat & filtering regulasi
 * - Eksekusi entri baru dengan proteksi idempotensi
 * - Kalibrasi bobot adaptif berkelanjutan
 *
 * @param {object} [options={}]
 * @param {boolean} [options.force=false] Lewati pemeriksaan jam bursa (untuk testing/cron luar jam)
 * @param {Array<string>} [options.candidateTickers] Daftar ticker khusus (opsional)
 * @param {object} [options.injectedState] State akun yang disuntikkan langsung (opsional)
 * @returns {Promise<object>} Laporan siklus autonomous
 */
export async function runAutonomousMarketCycle(options = {}) {
  const force = Boolean(options.force);
  const schedule = isIdxMarketOpen();

  if (!schedule.isOpen && !force) {
    return {
      success: false,
      skipped: true,
      reason: schedule.reason,
      session: schedule.session,
      wibTime: schedule.wibTime,
      timestamp: new Date().toISOString()
    };
  }

  const state = options.injectedState || loadAutonomousAccountState();
  const currentRegime = (await classifyMarketRegime()).regime || 'UNKNOWN';

  const closedThisCycle = [];
  const openedThisCycle = [];
  const logEntries = [];

  // 1. EVALUASI POSISI TERBUKA
  if (Array.isArray(state.openPositions) && state.openPositions.length > 0) {
    const remainingPositions = [];

    for (const pos of state.openPositions) {
      let quote = null;
      try {
        quote = await fetchYahooQuote(pos.ticker);
      } catch (err) {
        console.warn(`[Autonomous Runner] Gagal fetch quote ${pos.ticker}:`, err?.message);
      }

      const currentPrice = (quote && !quote.isSimulated && quote.price > 0) ? quote.price : pos.entryPrice;
      pos.currentPrice = currentPrice;

      const evalResult = evaluatePositionExit(pos, currentPrice);

      if (evalResult.shouldExit) {
        const exitPrice = evalResult.exitPrice;
        const grossReturn = (exitPrice - pos.entryPrice) * pos.shares;
        const sellFee = Math.round(exitPrice * pos.shares * (SELL_FEE_PCT / 100));
        const realizedPnL = grossReturn - pos.buyFee - sellFee;
        const rMultiple = Number(((exitPrice - pos.entryPrice) / Math.max(1, pos.entryPrice - pos.initialStopLoss)).toFixed(2));
        const result = realizedPnL > 0 ? 'WIN' : 'LOSS';

        const maxPossibleGain = pos.shares * Math.max(0, (pos.highWaterMark || pos.entryPrice) - pos.entryPrice);
        const mfeCapturePct = (maxPossibleGain > 0 && realizedPnL > 0)
          ? Number(((realizedPnL / maxPossibleGain) * 100).toFixed(1))
          : 0;

        const closedRecord = {
          id: pos.id,
          ticker: pos.ticker,
          entryPrice: pos.entryPrice,
          exitPrice,
          shares: pos.shares,
          lots: pos.shares / 100,
          entryDate: pos.entryDate,
          exitDate: new Date().toISOString(),
          initialStopLoss: pos.initialStopLoss,
          takeProfit: pos.takeProfit,
          trailingStop: pos.trailingStop || null,
          exitReason: evalResult.exitReason,
          realizedPnL,
          rMultiple,
          result,
          strategy: pos.strategy,
          regimeAtEntry: pos.regimeAtEntry,
          regimeAtExit: currentRegime,
          mfePct: evalResult.mfePct,
          maePct: evalResult.maePct,
          mfeCapturePct,
          errorClassification: 'PENDING'
        };
        closedRecord.errorClassification = classifyTradeError(closedRecord);

        // Kembalikan kas
        state.cash += Math.round(exitPrice * pos.shares - sellFee);
        if (!Array.isArray(state.closedTrades)) state.closedTrades = [];
        state.closedTrades.unshift(closedRecord);
        closedThisCycle.push(closedRecord);

        // Feedback Loop: Kalibrasi bobot adaptif otomatis
        calibrateAdaptiveWeights(state.adaptiveWeights, closedRecord);

        logEntries.push({
          type: 'POSITION_CLOSED',
          ticker: pos.ticker,
          exitReason: evalResult.exitReason,
          realizedPnL,
          rMultiple,
          result
        });
      } else {
        remainingPositions.push(pos);
      }
    }

    state.openPositions = remainingPositions;
  }

  // 2. PEMINDAIAN KANDIDAT & EKSEKUSI ENTRI BARU
  const availableSlots = RUNNER_CONFIG.MAX_OPEN_POSITIONS - (state.openPositions ? state.openPositions.length : 0);
  const minCashBuffer = state.totalEquity * RUNNER_CONFIG.MIN_CASH_BUFFER_PCT;

  if (availableSlots > 0 && state.cash > minCashBuffer) {
    let candidateTickers = options.candidateTickers;
    if (!candidateTickers || !candidateTickers.length) {
      try {
        const universe = loadBaseUniverse();
        const baseTop = Object.keys(universe).slice(0, 30);
        const stratPicks = await getQualifyingTickersToday().catch(() => ({ tickers: new Set() }));
        const combined = Array.from(new Set([...(stratPicks.tickers || []), ...baseTop]));
        candidateTickers = combined.slice(0, 50);
      } catch (_) {
        candidateTickers = ['BBCA', 'BBRI', 'BMRI', 'ASII', 'TLKM', 'ADRO', 'ICBP'];
      }
    }

    // Filter Regulatory Gate (BEI Special Notation / Suspension)
    const eligibleTickers = await filterEligibleTickers(candidateTickers);

    // Compute Stock Signals
    const batchResults = await computeStockSignalBatch(eligibleTickers);
    const validSignals = batchResults.filter(r => r && r.signal && r.signal.includes('BUY'));

    // Skor Adaptif
    const scoredCandidates = validSignals.map(sig => {
      const rawScore = sig.compositeScore || 60;
      const regMult = state.adaptiveWeights?.regimeMultipliers?.[currentRegime] || 1.0;
      const stratMult = (sig.strategy && state.adaptiveWeights?.strategyMultipliers?.[sig.strategy]) || 1.0;
      const adaptedScore = Math.max(0, Math.min(100, Math.round(rawScore * regMult * stratMult)));

      return {
        ...sig,
        adaptedScore,
        regMult,
        stratMult
      };
    }).filter(c => c.adaptedScore >= RUNNER_CONFIG.MIN_SCORE_TO_BUY && !state.openPositions.some(p => p.ticker === c.ticker))
      .sort((a, b) => b.adaptedScore - a.adaptedScore);

    const todayDateStr = getWibDateString();
    if (!state.processedOrderKeys) state.processedOrderKeys = {};

    for (let i = 0; i < scoredCandidates.length && openedThisCycle.length < availableSlots; i++) {
      const cand = scoredCandidates[i];
      const ticker = cand.ticker;
      const idempotencyKey = `AUTOCYCLE-${todayDateStr}-${ticker}`;

      if (state.processedOrderKeys[idempotencyKey]) {
        continue; // Lewati duplikasi order di hari yang sama
      }

      // Meta-Labeling ML Filter: Deteksi false breakout & probabilitas target sebelum SL
      const metaCheck = evaluateMetaLabelFilter({
        confluenceScore: cand.adaptedScore,
        volumeSurge: cand.volumeSurge || 1.5,
        foreignStreak: cand.foreignStreak || 1,
        regime: currentRegime,
        spreadPct: 0.4,
        atrPct: 2.2
      });

      if (!metaCheck.passed) {
        logEntries.push({
          type: 'VETOED_BY_META_LABELER',
          ticker,
          probability: metaCheck.probability,
          reason: metaCheck.reason
        });
        continue;
      }

      const entryPrice = cand.price;
      const stopLoss = cand.sl || cand.suggestedStopLoss || Math.round(entryPrice * 0.95);
      const takeProfit = cand.tp1 || cand.suggestedTakeProfit || Math.round(entryPrice * 1.10);

      const sizing = calculatePositionSizing({
        equity: state.totalEquity,
        cash: state.cash,
        entryPrice,
        stopLoss
      });

      if (!sizing.approved) {
        continue;
      }

      state.cash -= sizing.totalCost;
      state.processedOrderKeys[idempotencyKey] = new Date().toISOString();

      const newPosition = {
        id: `POS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ticker,
        entryPrice,
        currentPrice: entryPrice,
        shares: sizing.shares,
        lots: sizing.lots,
        entryDate: new Date().toISOString(),
        initialStopLoss: stopLoss,
        stopLoss,
        takeProfit,
        trailingStop: null,
        buyFee: sizing.buyFee,
        grossCost: sizing.grossCost,
        totalCost: sizing.totalCost,
        strategy: cand.strategy || 'composite_scoring',
        regimeAtEntry: currentRegime,
        highWaterMark: entryPrice,
        lowWaterMark: entryPrice,
        mfePct: 0,
        maePct: 0
      };

      state.openPositions.push(newPosition);
      openedThisCycle.push(newPosition);

      logEntries.push({
        type: 'POSITION_OPENED',
        ticker,
        entryPrice,
        lots: sizing.lots,
        totalCost: sizing.totalCost,
        adaptedScore: cand.adaptedScore,
        idempotencyKey
      });
    }
  }

  // Rekalkulasi statistik & ekuitas
  recomputeAccountStats(state);

  // Simpan state persisten
  if (!options.injectedState) {
    saveAutonomousAccountState(state);
  }

  return {
    success: true,
    marketSession: schedule.session,
    marketOpen: schedule.isOpen,
    regime: currentRegime,
    timestamp: new Date().toISOString(),
    closedTradesCount: closedThisCycle.length,
    openedTradesCount: openedThisCycle.length,
    openPositionsCount: state.openPositions.length,
    cash: state.cash,
    totalEquity: state.totalEquity,
    realizedPnL: state.realizedPnL,
    totalReturnPct: state.totalReturnPct,
    closedTrades: closedThisCycle,
    openedTrades: openedThisCycle,
    logEntries
  };
}
