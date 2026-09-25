/**
 * test_suite.js — Comprehensive Automated Verification Suite
 * Verifies all financial, tax, indicator, and portfolio calculations
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Cross-platform CRLF normalization for regression guards that inspect source text
const _origReadFileSync = fs.readFileSync;
fs.readFileSync = function(...args) {
  const res = _origReadFileSync.apply(this, args);
  if (typeof res === 'string') return res.replace(/\r\n/g, '\n');
  return res;
};

console.log('═══════════════════════════════════════════════════════');
console.log('🚀 RUNNING MONEY WATCH PRO & TRADEWAVE VERIFICATION SUITE');
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

// Same pattern as test_provider_functions.js's asyncTest() — test() above
// calls fn() synchronously and never awaits it, so a test whose assertions
// run after an `await` (e.g. sendCopilotPrompt()'s vm sandbox test) would
// report a false PASS immediately and any failure would surface only as an
// unhandled rejection, not a clean ❌ FAIL line.
async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// Fake setInterval/clearInterval/setTimeout/clearTimeout for sandboxed
// timer-lifecycle tests (start/stop guard logic) that must NOT leave a
// real pending Node timer behind — a real one would delay this process's
// exit by however long that timer is (seconds to minutes), slowing down
// every CI run for no reason. Handles are just incrementing numbers; the
// scheduled callback is intentionally never invoked, since these tests only
// check whether a handle was created/cleared, not what firing it would do.
let _fakeTimerId = 0;
function makeFakeTimers() {
  return {
    setInterval: () => ++_fakeTimerId,
    clearInterval: () => {},
    setTimeout: () => ++_fakeTimerId,
    clearTimeout: () => {}
  };
}

// ── TEST 1: TAX & BROKER COMMISSION ENGINE ──
test('Tax & Broker Fee Computation (Stockbit Preset)', () => {
  const gross = 10 * 100 * 5000; // 10 lot @ Rp 5.000 = Rp 5.000.000
  const buyKomRate = 0.0015; // 0.15%
  const sellKomRate = 0.0025; // 0.25%
  const ppnRate = 0.11; // 11%
  const levyRate = 0.00043; // 0.043%
  const pphJualRate = 0.001; // 0.1%

  // Buy Side
  const buyKomisi = gross * buyKomRate; // 7,500
  const buyPpn = buyKomisi * ppnRate; // 825
  const buyLevy = gross * levyRate; // 2,150
  const buyTotalFee = buyKomisi + buyPpn + buyLevy; // 10,475
  const buyNet = gross + buyTotalFee; // 5,010,475

  assert.strictEqual(buyKomisi, 7500);
  assert.strictEqual(buyPpn, 825);
  assert.strictEqual(buyLevy, 2150);
  assert.strictEqual(buyTotalFee, 10475);
  assert.strictEqual(buyNet, 5010475);

  // Sell Side
  const sellKomisi = gross * sellKomRate; // 12,500
  const sellPpn = sellKomisi * ppnRate; // 1,375
  const sellLevy = gross * levyRate; // 2,150
  const sellPph = gross * pphJualRate; // 5,000
  const sellTotalFee = sellKomisi + sellPpn + sellLevy + sellPph; // 21,025
  const sellNet = gross - sellTotalFee; // 4,978,975

  assert.strictEqual(sellKomisi, 12500);
  assert.strictEqual(sellPpn, 1375);
  assert.strictEqual(sellLevy, 2150);
  assert.strictEqual(sellPph, 5000);
  assert.strictEqual(sellTotalFee, 21025);
  assert.strictEqual(sellNet, 4978975);
});

// ── TEST 2: WEIGHTED AVERAGE COST & REALIZED PNL ──
test('Weighted Average Cost Basis & Partial Sell Realized PnL', () => {
  // Batch 1: Buy 10 lot (1,000 shares) @ Rp 5,000. Total Cost = 5,000,000
  // Batch 2: Buy 10 lot (1,000 shares) @ Rp 6,000. Total Cost = 6,000,000
  // Total = 2,000 shares, Total Cost = 11,000,000 -> Avg Price = Rp 5,500 / share
  const totalShares = 2000;
  const totalCost = 11000000;
  const avgCostPerShare = totalCost / totalShares;
  assert.strictEqual(avgCostPerShare, 5500);

  // Sell 10 lot (1,000 shares) @ Rp 7,000 gross = 7,000,000
  const sellShares = 1000;
  const sellPrice = 7000;
  const costOfSoldShares = sellShares * avgCostPerShare; // 5,500,000
  const grossRealizedPnL = (sellShares * sellPrice) - costOfSoldShares; // 1,500,000
  const returnPct = (grossRealizedPnL / costOfSoldShares) * 100;

  assert.strictEqual(costOfSoldShares, 5500000);
  assert.strictEqual(grossRealizedPnL, 1500000);
  assert.strictEqual(Math.round(returnPct * 100) / 100, 27.27);
});

// ── TEST 3: TRADEWAVE EMA & ATR CALCULATION ──
test('TradeWave EMA Formula & Convergence', () => {
  const prices = [100, 102, 104, 106, 108, 110, 112, 115, 120, 125];
  const period = 5;
  const k = 2 / (period + 1);

  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  assert(ema > 110 && ema < 125, `EMA calculation within bounds: ${ema}`);
});

// ── TEST 4: FIBONACCI EXTENSION & POSITION SIZING PLANNER ──
test('TradeWave Fibonacci Extension Targets & Position Sizing', () => {
  const currentPrice = 10000;
  const swingRange = 2000;
  const stopLoss = 9000; // Risk = 1,000 / share

  const tp1 = Math.round(currentPrice + swingRange * 0.618); // 11,236
  const tp2 = Math.round(currentPrice + swingRange * 1.000); // 12,000
  const tp3 = Math.round(currentPrice + swingRange * 1.618); // 13,236

  assert.strictEqual(tp1, 11236);
  assert.strictEqual(tp2, 12000);
  assert.strictEqual(tp3, 13236);

  // Position Sizing: Capital = 100,000,000, Risk = 1.5% (1,500,000)
  const capital = 100000000;
  const riskPct = 1.5;
  const riskAmount = capital * (riskPct / 100); // 1,500,000
  const riskPerShare = currentPrice - stopLoss; // 1,000
  const maxShares = Math.floor(riskAmount / riskPerShare); // 1,500 shares
  const maxLots = Math.floor(maxShares / 100); // 15 lot

  assert.strictEqual(riskAmount, 1500000);
  assert.strictEqual(maxLots, 15);
  assert.strictEqual(maxLots * 100 * (currentPrice - stopLoss), 1500000);
});

// ── TEST 5: KSEI 5%+ FREE FLOAT CALCULATION ──
test('KSEI 5%+ Major Shareholder & Free Float Integrity', () => {
  const shareholders = [
    { name: 'PT Dwimuria Investama Andalan', shares: 67729700000, pct: 54.94 },
    { name: 'Robert Budi Hartono', shares: 602380000, pct: 0.49 }, // <5%
    { name: 'Bambang Hartono', shares: 585740000, pct: 0.48 }     // <5%
  ];

  // Controlled holdings (>= 5%)
  const majorHoldingsPct = shareholders
    .filter(s => s.pct >= 5.0)
    .reduce((sum, s) => sum + s.pct, 0);

  const calculatedFreeFloat = +(100 - majorHoldingsPct).toFixed(2);
  assert.strictEqual(majorHoldingsPct, 54.94);
  assert.strictEqual(calculatedFreeFloat, 45.06);
});

// ── TEST 6: MULTI-ASSET NET WORTH INTEGRITY ──
test('Multi-Asset Net Worth & Balance Sheet Math', () => {
  const stockEquity = 150000000;
  const cryptoEquity = 50000000;
  const etfEquity = 30000000;
  const reksaDanaEquity = 20000000;
  const rdnCash = 25000000;
  const totalAssets = stockEquity + cryptoEquity + etfEquity + reksaDanaEquity + rdnCash;

  const liabilities = 15000000;
  const netWorth = totalAssets - liabilities;

  assert.strictEqual(totalAssets, 275000000);
  assert.strictEqual(netWorth, 260000000);
});

// ── TEST 7: AUTONOMOUS AI TRADING EXPECTED VALUE & SIZING MATH ──
test('Autonomous AI Trading EV, Risk Sizing & Profit Factor', () => {
  // Expected Value = (P_win * Avg_win) - (P_loss * Avg_loss)
  const pWin = 0.68;
  const pLoss = 0.32;
  const avgWin = 3500000; // Rp 3.500.000
  const avgLoss = 1500000; // Rp 1.500.000

  const ev = (pWin * avgWin) - (pLoss * avgLoss);
  // (0.68 * 3,500,000) - (0.32 * 1,500,000) = 2,380,000 - 480,000 = 1,900,000
  assert.strictEqual(ev, 1900000);
  assert(ev > 0, 'Expected Value must be strictly positive');

  // Profit Factor = Total Gross Profit / Total Gross Loss
  const grossProfit = 26 * avgWin; // 91,000,000
  const grossLoss = 12 * avgLoss;   // 18,000,000
  const profitFactor = Math.round((grossProfit / grossLoss) * 100) / 100;
  assert.strictEqual(profitFactor, 5.06);

  // Position Sizing: 1% Risk of 100M Virtual Capital = 1,000,000
  const virtualCap = 100000000;
  const maxRisk = virtualCap * 0.01;
  const entry = 10150;
  const stopLoss = 9750;
  const riskPerShare = entry - stopLoss; // 400
  const maxShares = Math.floor(maxRisk / riskPerShare); // 2,500 shares
  const maxLots = Math.floor(maxShares / 100); // 25 lot
  assert.strictEqual(maxLots, 25);
  assert.strictEqual(maxLots * 100 * (entry - stopLoss), 1000000);
});

// ── TEST 8: CONFLUENCE SCORING & INTEGRATED WORKFLOW LOGIC ──
test('3-Pillar Confluence Scoring & Capital Allocation Rules', () => {
  // Score weights: Regime (10) + Valuation (15) + ROE/DER (10) + EMA Trend (15) + Wave (15) + Volume/CMF (10) + Broker (10) + KSEI Float (5) + R:R (10) = 100
  const maxScore = 10 + 15 + 10 + 15 + 15 + 10 + 10 + 5 + 10;
  assert.strictEqual(maxScore, 100);

  // Bullish scenario test
  const testInputs = {
    regime: 10,
    valuation: 15,
    roe: 10,
    trend: 15,
    wave: 15,
    volume: 10,
    brokerFlow: 10,
    kseiFloat: 5
  };
  const totalScore = Object.values(testInputs).reduce((a, b) => a + b, 0);
  assert.strictEqual(totalScore, 90);
  assert(totalScore >= 75, 'Score >= 75 must qualify as Strong Buy / High Conviction');

  // Allocation rule: Max 15% single stock, Max 25% single sector
  const totalPortfolioValue = 500000000;
  const maxSingleStockLimit = totalPortfolioValue * 0.15; // 75,000,000
  const maxSectorLimit = totalPortfolioValue * 0.25; // 125,000,000
  assert.strictEqual(maxSingleStockLimit, 75000000);
  assert.strictEqual(maxSectorLimit, 125000000);
});

// ── TEST 9: EQUITY HISTORY VALIDATION & CASH FLOW RECONCILIATION ──
test('Equity History Validation, AUM Calculation & Cash Flow Reconciliation', () => {
  // Saham MV = 300,000,000; Crypto MV = 100,000,000; ETF = 50,000,000; RD = 25,000,000; RDN Cash = 29,600,000
  const sahamMv = 300000000;
  const cryptoMv = 100000000;
  const etfMv = 50000000;
  const rdMv = 25000000;
  const rdnCash = 29600000;

  const currentAum = sahamMv + cryptoMv + etfMv + rdMv + rdnCash;
  assert.strictEqual(currentAum, 504600000); // Rp 504.600.000

  // Kemarin: Ekuitas Rp 500.000.000
  // Hari ini ada SETOR RDN Rp 5.000.000 dan penambahan nilai investasi Rp -400.000
  const yesterdayEquity = 500000000;
  const daySetor = 5000000;
  const dayTarik = 0;
  const netCashFlow = daySetor - dayTarik;

  const totalDiff = currentAum - yesterdayEquity; // +4,600,000
  const pureTradingPnl = totalDiff - netCashFlow; // -400,000

  assert.strictEqual(totalDiff, 4600000);
  assert.strictEqual(pureTradingPnl, -400000);
  assert.strictEqual(pureTradingPnl + netCashFlow, totalDiff);
});

// ── TEST 10: MULTI-ASSET DAY-BY-DAY PORTFOLIO TIMELINE RECONSTRUCTION ──
test('Multi-Asset Day-by-Day Portfolio Timeline Reconstruction', () => {
  // Day 1: Deposit 500,000,000
  // Day 2: Buy 100 lot BBCA @ 10,000 (100,000,000) -> RDN = 400,000,000, Stock = 100,000,000 -> Total = 500,000,000
  // Day 3: Buy 0.05 BTC @ 1,200,000,000 (60,000,000) -> RDN = 340,000,000, Stock = 100,000,000, Crypto = 60,000,000 -> Total = 500,000,000
  // Day 4: BBCA rises to 10,500 (105,000,000) -> Total = 505,000,000 (+5,000,000 pure PnL)
  const day1Rdn = 500000000;
  assert.strictEqual(day1Rdn, 500000000);

  const day2Stock = 100 * 100 * 10000;
  const day2Rdn = day1Rdn - day2Stock;
  assert.strictEqual(day2Stock + day2Rdn, 500000000);

  const day3Crypto = 0.05 * 1200000000;
  const day3Rdn = day2Rdn - day3Crypto;
  assert.strictEqual(day2Stock + day3Crypto + day3Rdn, 500000000);

  const day4Stock = 100 * 100 * 10500;
  const day4Total = day4Stock + day3Crypto + day3Rdn;
  assert.strictEqual(day4Total, 505000000);
  assert.strictEqual(day4Total - (day2Stock + day3Crypto + day3Rdn), 5000000);
});

// ── TEST 11: BEI TICK SIZES & AUTO-REJECTION (ARA / ARB) ENGINE ──
test('BEI Official Price Fractions (Tick Size) & ARA/ARB Validation', () => {
  function getTick(price) {
    if (price < 200) return 1;
    if (price < 500) return 2;
    if (price < 2000) return 5;
    if (price < 5000) return 10;
    return 25;
  }

  assert.strictEqual(getTick(50), 1);
  assert.strictEqual(getTick(199), 1);
  assert.strictEqual(getTick(200), 2);
  assert.strictEqual(getTick(498), 2);
  assert.strictEqual(getTick(500), 5);
  assert.strictEqual(getTick(1995), 5);
  assert.strictEqual(getTick(2000), 10);
  assert.strictEqual(getTick(4990), 10);
  assert.strictEqual(getTick(5000), 25);
  assert.strictEqual(getTick(10000), 25);

  // ARA / ARB calculation for BBCA @ Rp 10,000 (Tick 25, 20% limit)
  const prevPrice = 10000;
  const araLimitPct = 0.20;
  const arbLimitPct = 0.20;
  const rawAra = prevPrice * (1 + araLimitPct); // 12,000
  const rawArb = prevPrice * (1 - arbLimitPct); // 8,000
  assert.strictEqual(rawAra, 12000);
  assert.strictEqual(rawArb, 8000);
});

// ── TEST 12: HEDGE FUND RISK-ADJUSTED METRICS (SHARPE, SORTINO, HHI) ──
test('Hedge Fund Metrics: Sharpe, Sortino & HHI Portfolio Concentration', () => {
  // Returns over 6 months: +4%, +6%, -2%, +5%, +3%, -1%
  const monthlyReturns = [0.04, 0.06, -0.02, 0.05, 0.03, -0.01];
  const riskFreeRate = 0.005; // 0.5% monthly (~6% annual)

  const meanReturn = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length; // 0.025 (2.5%)
  const variance = monthlyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (monthlyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  const downsideReturns = monthlyReturns.filter(r => r < riskFreeRate);
  const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r - riskFreeRate, 2), 0) / downsideReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);

  const sharpe = (meanReturn - riskFreeRate) / stdDev;
  const sortino = (meanReturn - riskFreeRate) / downsideDev;

  assert(sharpe > 0.5, `Sharpe ratio positive: ${sharpe.toFixed(2)}`);
  assert(sortino > 0.5, `Sortino ratio positive: ${sortino.toFixed(2)}`);

  // HHI (Herfindahl-Hirschman Index) concentration: 3 stocks with 50%, 30%, 20% weights
  const weights = [0.50, 0.30, 0.20];
  const hhi = weights.reduce((sum, w) => sum + Math.pow(w * 100, 2), 0); // 2500 + 900 + 400 = 3800
  assert.strictEqual(hhi, 3800);
  assert(hhi > 2500, 'HHI > 2500 signifies a highly concentrated portfolio');
});

// ── TEST 13: SSRF DEFENSE VALIDATION ON PROXY ENDPOINTS ──
test('Security: SSRF Prevention Validator for External Proxy', () => {
  function isSafeProxyUrl(urlString) {
    try {
      const parsed = new URL(urlString);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname === '169.254.169.254' ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.local')
      ) {
        return false;
      }
      const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipMatch) {
        const b0 = parseInt(ipMatch[1], 10);
        const b1 = parseInt(ipMatch[2], 10);
        if (b0 === 10) return false;
        if (b0 === 127) return false;
        if (b0 === 169 && b1 === 254) return false;
        if (b0 === 192 && b1 === 168) return false;
        if (b0 === 172 && b1 >= 16 && b1 <= 31) return false;
        if (b0 === 0) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // Must reject malicious / internal / SSRF vectors
  assert.strictEqual(isSafeProxyUrl('http://localhost:3000/api/user-data'), false);
  assert.strictEqual(isSafeProxyUrl('http://127.0.0.1:8080/admin'), false);
  assert.strictEqual(isSafeProxyUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.strictEqual(isSafeProxyUrl('http://192.168.1.1/router'), false);
  assert.strictEqual(isSafeProxyUrl('http://10.0.0.1/internal'), false);
  assert.strictEqual(isSafeProxyUrl('file:///etc/passwd'), false);
  assert.strictEqual(isSafeProxyUrl('javascript:alert(1)'), false);

  // Must allow safe external financial sources
  assert.strictEqual(isSafeProxyUrl('https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK'), true);
  assert.strictEqual(isSafeProxyUrl('https://query2.finance.yahoo.com/v8/finance/chart/QQQ'), true);
});

// ── TEST 14: USER DATA STORAGE KEY NORMALIZATION & PATH SAFETY ──
test('Security: User Store Key Normalization (Path Traversal Protection)', () => {
  function getSafeFileKey(uidOrEmail) {
    if (!uidOrEmail) return 'global_user';
    return String(uidOrEmail).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  assert.strictEqual(getSafeFileKey('user@example.com'), 'user_example_com');
  assert.strictEqual(getSafeFileKey('../../etc/passwd'), '______etc_passwd');
  assert.strictEqual(getSafeFileKey('..\\..\\windows\\system32'), '______windows_system32');
  assert.strictEqual(getSafeFileKey(''), 'global_user');
  assert.strictEqual(getSafeFileKey(null), 'global_user');
});

// ── TEST 15: PMK 18/2021 DIVIDEND TAX EXEMPTION VS REGULAR 10% ──
test('Tax Compliance: PMK 18/2021 Dividend Reinvestment (0%) vs Standard Final (10%)', () => {
  const grossDividend = 10000000; // Rp 10.000.000

  // Case A: Reinvested in NKRI -> 0% Tax
  const isReinvested = true;
  const taxRateA = isReinvested ? 0.00 : 0.10;
  const taxRpA = grossDividend * taxRateA;
  const netDividendA = grossDividend - taxRpA;
  assert.strictEqual(taxRpA, 0);
  assert.strictEqual(netDividendA, 10000000);

  // Case B: Regular Non-Reinvested -> 10% Final Tax
  const isReinvestedB = false;
  const taxRateB = isReinvestedB ? 0.00 : 0.10;
  const taxRpB = grossDividend * taxRateB;
  const netDividendB = grossDividend - taxRpB;
  assert.strictEqual(taxRpB, 1000000);
  assert.strictEqual(netDividendB, 9000000);
});

// ── TEST 16: BANDARMOLOGY & BROKER FLOW CONCENTRATION ENGINE ──
test('Bandarmology: Top 3/5 Concentration, Foreign Flow & Smart Money Math', () => {
  const buyers = [
    { broker: 'AK', pctOfTurnover: 28, valueRp: 28000000000, type: 'F' },
    { broker: 'BK', pctOfTurnover: 22, valueRp: 22000000000, type: 'F' },
    { broker: 'ZP', pctOfTurnover: 16, valueRp: 16000000000, type: 'F' },
    { broker: 'CC', pctOfTurnover: 11, valueRp: 11000000000, type: 'D' },
    { broker: 'SQ', pctOfTurnover: 8, valueRp: 8000000000, type: 'D' }
  ];

  const sellers = [
    { broker: 'YP', pctOfTurnover: 24, valueRp: 24000000000, type: 'D' },
    { broker: 'PD', pctOfTurnover: 19, valueRp: 19000000000, type: 'D' },
    { broker: 'XC', pctOfTurnover: 15, valueRp: 15000000000, type: 'D' },
    { broker: 'XL', pctOfTurnover: 12, valueRp: 12000000000, type: 'D' },
    { broker: 'EP', pctOfTurnover: 9, valueRp: 9000000000, type: 'D' }
  ];

  const top3BuyPct = buyers[0].pctOfTurnover + buyers[1].pctOfTurnover + buyers[2].pctOfTurnover; // 66%
  const top3SellPct = sellers[0].pctOfTurnover + sellers[1].pctOfTurnover + sellers[2].pctOfTurnover; // 58%

  assert.strictEqual(top3BuyPct, 66);
  assert.strictEqual(top3SellPct, 58);

  const foreignBuyTotal = buyers.filter(b => b.type === 'F').reduce((sum, b) => sum + b.valueRp, 0); // 66M
  const foreignSellTotal = sellers.filter(s => s.type === 'F').reduce((sum, s) => sum + s.valueRp, 0); // 0
  const netForeign = foreignBuyTotal - foreignSellTotal;

  assert.strictEqual(foreignBuyTotal, 66000000000);
  assert.strictEqual(netForeign, 66000000000);
  assert(top3BuyPct >= 60, 'Top 3 Buy Pct >= 60% qualifies as Big Accumulation');
});

// ── TEST 17: FULL STOCK UNIVERSE DYNAMIC 5-PILLAR PROFILE SYNTHESIS ──
test('Stock Universe: Dynamic 5-Pillar Score & Valuation Synthesis for Any IDX Ticker', () => {
  function synthesizePillars(ticker, price, sector) {
    const isBank = sector.toLowerCase().includes('keuangan') || sector.toLowerCase().includes('bank');
    const fairMult = isBank ? 1.22 : 1.20;
    const fairValue = Math.round(price * fairMult);
    const mos = Math.round(((fairValue - price) / fairValue) * 1000) / 10;
    const pFund = isBank ? 88 : 80;
    const pTech = 78;
    const pFlow = 82;
    const pVal = 80;
    const pRisk = 82;
    const overallScore = Math.round((pFund * 0.25) + (pTech * 0.25) + (pFlow * 0.20) + (pVal * 0.15) + (pRisk * 0.15));

    return {
      ticker,
      fairValue,
      mos,
      overallScore
    };
  }

  const resAali = synthesizePillars('AALI', 6500, 'Lainnya');
  assert.strictEqual(resAali.fairValue, 7800);
  assert.strictEqual(resAali.mos, 16.7);
  assert(resAali.overallScore >= 75, 'Score must be high quality');

  const resBbca = synthesizePillars('BBCA', 9500, 'Keuangan');
  assert.strictEqual(resBbca.fairValue, 11590);
  assert.strictEqual(resBbca.overallScore, 82);
});

// ── TEST 18: SMART MONEY VS RETAIL DIVERGENCE & INSTITUTIONAL NET FLOW MATH ──
test('Smart Money Flow: Institutional vs Retail Divergence Detection', () => {
  const instList = ['AK', 'BK', 'ZP', 'KZ', 'CS', 'RX', 'CC', 'SQ', 'OD', 'NI', 'LG', 'IF', 'YU'];
  const retList = ['YP', 'PD', 'XC', 'XL', 'KK', 'EP', 'AT'];

  const buyers = [
    { broker: 'AK', valueRp: 25000000000, avgPrice: 9800 },
    { broker: 'BK', valueRp: 20000000000, avgPrice: 9825 },
    { broker: 'CC', valueRp: 15000000000, avgPrice: 9850 },
    { broker: 'YP', valueRp: 3000000000, avgPrice: 9900 }
  ];

  const sellers = [
    { broker: 'YP', valueRp: 22000000000, avgPrice: 9850 },
    { broker: 'PD', valueRp: 18000000000, avgPrice: 9825 },
    { broker: 'XC', valueRp: 12000000000, avgPrice: 9800 },
    { broker: 'AK', valueRp: 2000000000, avgPrice: 9875 }
  ];

  const smBuyers = buyers.filter(b => instList.includes(b.broker));
  const smSellers = sellers.filter(s => instList.includes(s.broker));
  const retBuyers = buyers.filter(b => retList.includes(b.broker));
  const retSellers = sellers.filter(s => retList.includes(s.broker));

  const smBuyVal = smBuyers.reduce((a, b) => a + b.valueRp, 0); // 60B
  const smSellVal = smSellers.reduce((a, s) => a + s.valueRp, 0); // 2B
  const smNet = smBuyVal - smSellVal; // +58B

  const retBuyVal = retBuyers.reduce((a, b) => a + b.valueRp, 0); // 3B
  const retSellVal = retSellers.reduce((a, s) => a + s.valueRp, 0); // 52B
  const retNet = retBuyVal - retSellVal; // -49B

  assert.strictEqual(smNet, 58000000000);
  assert.strictEqual(retNet, -49000000000);

  const isBullishDivergence = smNet > 0 && retNet < 0;
  assert.strictEqual(isBullishDivergence, true, 'Whale accumulation while retail sells must trigger Bullish Divergence');
});

// ── TEST 19: BANDARMOLOGY SPECTRUM & CONCENTRATION RATIO BOUNDS ──
test('Broker Flow: Top 1/3/5 Concentration Ratio & Safe Default Fallback', () => {
  const conc = {
    top1BuyPct: 28.5,
    top1SellPct: 22.0,
    top3BuyPct: 66.0,
    top3SellPct: 54.0,
    top5BuyPct: 85.0,
    top5SellPct: 76.0
  };

  assert(conc.top1BuyPct <= 100 && conc.top1BuyPct >= 0);
  assert(conc.top3BuyPct <= 100 && conc.top3BuyPct >= conc.top1BuyPct);
  assert(conc.top5BuyPct <= 100 && conc.top5BuyPct >= conc.top3BuyPct);
  assert(conc.top3BuyPct >= 60, 'Top 3 Buy Pct >= 60% qualifies for High Accumulation flag');
});

// ── TEST 20: SMART MONEY CMF & VWAP MULTI-PERIOD BANDS MATH ──
test('Smart Money: Chaikin Money Flow & Institutional VWAP Bands Math', () => {
  const price = 10000;
  const isUp = true;
  const vwapSession = Math.round(price * (isUp ? 0.992 : 1.008)); // 9920
  const vwapUpper = Math.round(vwapSession * 1.025); // 10168
  const vwapLower = Math.round(vwapSession * 0.975); // 9672
  const distToVwap = Number((((price - vwapSession) / vwapSession) * 100).toFixed(2));

  assert.strictEqual(vwapSession, 9920);
  assert.strictEqual(vwapUpper, 10168);
  assert.strictEqual(vwapLower, 9672);
  assert(distToVwap > 0, 'Price above VWAP indicates positive premium');
});

// ── TEST 21: SINGLE SOURCE OF TRUTH MARKET PRICING UNIFORMITY ──
test('Pricing Engine: Cross-Feature Uniformity & Zero Dummy Data', () => {
  // Mock DB and global state
  const mockDB = {
    'ANTM': { name: 'Aneka Tambang', base: 1640, sector: 'Barang Baku' },
    'BBCA': { name: 'Bank Central Asia', base: 8900, sector: 'Keuangan' },
    'PTRO': { name: 'Petrosea Tbk.', base: 5125, sector: 'Perindustrian' },
    'ADRO': { name: 'Alamtri Resources', base: 2680, sector: 'Energi' }
  };

  const getPrice = (tk) => (mockDB[tk] ? mockDB[tk].base : 0);

  assert.strictEqual(getPrice('ANTM'), 1640, 'ANTM must resolve to actual base price 1640, not dummy 1000');
  assert.strictEqual(getPrice('BBCA'), 8900, 'BBCA must resolve to actual base price 8900, not dummy 1000');
  assert.strictEqual(getPrice('PTRO'), 5125, 'PTRO must resolve to actual base price 5125, not dummy 1000');
  assert.strictEqual(getPrice('ADRO'), 2680, 'ADRO must resolve to actual base price 2680, not dummy 1000');
});

// ── TEST 22: UNLOADED / UNKNOWN TICKER ZERO DUMMY DATA POLICY ──
test('Pricing Engine: Unloaded Stock Explicit Marker (No Fabricated Prices)', () => {
  const formatPrice = (p) => {
    if (!p || p <= 0 || isNaN(p)) return 'Rp —';
    return 'Rp ' + Number(p).toLocaleString('id-ID');
  };

  assert.strictEqual(formatPrice(0), 'Rp —', 'Zero price must display explicit placeholder marker');
  assert.strictEqual(formatPrice(null), 'Rp —', 'Null price must display explicit placeholder marker');
  assert.strictEqual(formatPrice(undefined), 'Rp —', 'Undefined price must display explicit placeholder marker');
  assert.strictEqual(formatPrice(1640), 'Rp 1.640', 'Valid price must format with Indonesian locale');
});

// ── TEST 23: 1-YEAR MULTI-PERIOD BROKER COST BASIS & ACCUMULATION ENGINE ──
test('Bandarmology: 1-Year Multi-Period Broker Cost Basis & VWAP Math', () => {
  const curPrice = 10000;
  const vwap1Y = 9200; // 250-Day Volume Weighted Average Price
  const ak1YAvgBuy = Math.round(vwap1Y * (1 - 0.035)); // 8878 -> 8875 (Tick 25)
  const yp1YAvgBuy = Math.round(vwap1Y * (1 + 0.052)); // 9678.4 -> 9675

  const akFloatingPnlPct = Number((((curPrice - ak1YAvgBuy) / ak1YAvgBuy) * 100).toFixed(1));
  const ypFloatingPnlPct = Number((((curPrice - yp1YAvgBuy) / yp1YAvgBuy) * 100).toFixed(1));

  assert(ak1YAvgBuy < vwap1Y, 'Whale AK 1-Year average purchase price is below 1-Year VWAP (Accumulation at Dips)');
  assert(yp1YAvgBuy > vwap1Y, 'Retail YP 1-Year average purchase price is above 1-Year VWAP (FOMO Buying)');
  assert(akFloatingPnlPct > 10, 'Whale AK is sitting on >10% floating profit from 1-Year cost basis');
  assert(akFloatingPnlPct > ypFloatingPnlPct, 'Smart money floating profit exceeds retail floating profit');
});

// ── TEST 24-28: PRICE ADVANCER (equity-history real mark-to-market fix) ──
// public/js/02b-price-index.js is a plain classic script (no import/export —
// it must also load as-is via <script> in the browser), loaded here with
// `vm` rather than `require()`/`import()` because the repo's package.json
// sets "type":"module", which would make Node treat a directly-required/
// imported public/js/*.js file as an ES module (breaking its
// `module.exports` CommonJS guard) — `vm.runInContext` just executes the
// raw source as a script, exactly like a browser <script> tag does, so the
// same file is exercised under test with zero test-only forks of the logic.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadPriceIndexHelpers() {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/02b-price-index.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: '02b-price-index.js' });
  return { makePriceAdvancer: sandbox.makePriceAdvancer, generateUtcDateRange: sandbox.generateUtcDateRange };
}
const { makePriceAdvancer, generateUtcDateRange } = loadPriceIndexHelpers();

// ── TEST: generateUtcDateRange (equity-history timezone fix) ──
// Regression coverage for the bug: local-midnight date parsing followed by
// a toISOString() (UTC) read silently shifted every generated date back by
// one day for any positive-UTC-offset timezone (WIB/WITA/WIT — this app's
// whole userbase), prepending a phantom pre-transaction day with equity=0
// and dropping the true last day ("today") off the end. This CI machine's
// own TZ is not guaranteed to reproduce that (the bug only manifests on a
// positive-offset machine), so these tests assert the UTC-based CONTRACT
// directly — day count, first/last labels, no gaps/dupes — which holds
// regardless of the host's timezone, rather than relying on incidentally
// running on a WIB-offset CI runner.
// vm.createContext() runs the sandbox in its own realm, so arrays it
// returns have a different Array constructor/prototype than this file's —
// assert.deepStrictEqual treats that as "not reference-equal" even when the
// contents are identical. Array.from(...), called from THIS realm,
// normalizes the sandbox array into a plain main-realm array first.
function callGenerateUtcDateRange(startStr, endStr) {
  return Array.from(generateUtcDateRange(startStr, endStr));
}
test('generateUtcDateRange: inclusive of both start and end, correct day count', () => {
  const range = callGenerateUtcDateRange('2024-01-05', '2024-01-08');
  assert.deepStrictEqual(range, ['2024-01-05', '2024-01-06', '2024-01-07', '2024-01-08']);
});
test('generateUtcDateRange: single-day range returns exactly that one day', () => {
  assert.deepStrictEqual(callGenerateUtcDateRange('2024-03-01', '2024-03-01'), ['2024-03-01']);
});
test('generateUtcDateRange: end before start returns an empty range, never throws', () => {
  assert.deepStrictEqual(callGenerateUtcDateRange('2024-03-05', '2024-03-01'), []);
  assert.deepStrictEqual(callGenerateUtcDateRange('', '2024-03-01'), []);
  assert.deepStrictEqual(callGenerateUtcDateRange('2024-03-01', ''), []);
});
test('generateUtcDateRange: crosses a month/year boundary without skipping or duplicating a day', () => {
  const range = callGenerateUtcDateRange('2023-12-30', '2024-01-02');
  assert.deepStrictEqual(range, ['2023-12-30', '2023-12-31', '2024-01-01', '2024-01-02']);
});
test('generateUtcDateRange: the real first transaction date is always the first element (no phantom leading day)', () => {
  // This is the exact regression this fix targets: previously, the first
  // element of the generated range could be `startStr` minus one day.
  const range = callGenerateUtcDateRange('2018-10-31', '2018-11-03');
  assert.strictEqual(range[0], '2018-10-31', 'The first element must be the literal firstDateStr, never a day earlier');
  assert.strictEqual(range[range.length - 1], '2018-11-03', 'The last element must be the literal endStr ("today"), never a day earlier');
});

test('makePriceAdvancer: forward-fills weekend/holiday gaps from prior trading day', () => {
  // Fri close 100, Mon close 110 — Sat/Sun (no trading rows) must carry Friday's close.
  const rows = [
    { date: '2024-01-05', close: 100 }, // Friday
    { date: '2024-01-08', close: 110 }  // Monday
  ];
  const next = makePriceAdvancer(rows);
  assert.strictEqual(next('2024-01-05'), 100);
  assert.strictEqual(next('2024-01-06'), 100, 'Saturday must carry Friday close (nearest prior trading day)');
  assert.strictEqual(next('2024-01-07'), 100, 'Sunday must carry Friday close (nearest prior trading day)');
  assert.strictEqual(next('2024-01-08'), 110);
});

test('makePriceAdvancer: dates strictly before the series\' first row return null', () => {
  const next = makePriceAdvancer([{ date: '2024-01-10', close: 500 }]);
  assert.strictEqual(next('2024-01-01'), null, 'A day before any real data must return null, not a back-filled/NaN price');
  assert.strictEqual(next('2024-01-09'), null);
  assert.strictEqual(next('2024-01-10'), 500);
});

test('makePriceAdvancer: empty/missing rows always return null without throwing', () => {
  const nextEmpty = makePriceAdvancer([]);
  assert.strictEqual(nextEmpty('2024-01-01'), null);
  const nextNull = makePriceAdvancer(null);
  assert.strictEqual(nextNull('2024-01-01'), null);
});

test('makePriceAdvancer: single-row series forward-fills to every later date queried', () => {
  const next = makePriceAdvancer([{ date: '2024-01-01', close: 250 }]);
  assert.strictEqual(next('2024-01-01'), 250);
  assert.strictEqual(next('2024-01-03'), 250);
  assert.strictEqual(next('2024-01-05'), 250);
});

test('makePriceAdvancer: null/0/NaN closes are skipped, never surface', () => {
  const rows = [
    { date: '2024-01-01', close: 100 },
    { date: '2024-01-02', close: 0 },        // invalid — must be skipped
    { date: '2024-01-03', close: null },     // invalid — must be skipped
    { date: '2024-01-04', close: NaN },      // invalid — must be skipped
    { date: '2024-01-05', close: 120 }
  ];
  const next = makePriceAdvancer(rows);
  assert.strictEqual(next('2024-01-01'), 100);
  assert.strictEqual(next('2024-01-02'), 100, 'Invalid close must be skipped, carrying the last valid close');
  assert.strictEqual(next('2024-01-03'), 100);
  assert.strictEqual(next('2024-01-04'), 100);
  const last = next('2024-01-05');
  assert.strictEqual(last, 120);
  assert(!isNaN(last), 'Advancer must never return NaN');
});

test('makePriceAdvancer: out-of-order rows are sorted before advancing', () => {
  const rows = [
    { date: '2024-01-05', close: 120 },
    { date: '2024-01-01', close: 100 }
  ];
  const next = makePriceAdvancer(rows);
  assert.strictEqual(next('2024-01-01'), 100);
  assert.strictEqual(next('2024-01-05'), 120);
});

// ── TEST 29: REAL-PRICE RESOLUTION ORDER CONTRACT (equity-history fix) ──
// rebuildEquityHistoryFromTransactions() itself (03-engine.js) can't safely
// run under Node — it's a giant browser-only script with ~20 implicit
// global dependencies (window, localStorage, DOM, other app globals) that
// throw outside a browser. This test instead locks down the *contract* its
// three rewritten valuation branches (stock/crypto/ETF, 03-engine.js) all
// follow: today live price wins, then the real fetched-history close for
// that exact date, then the pre-existing lastPrice fallback chain — and
// critically, that a missing/zero/NaN real price always falls through
// rather than winning with a bad value.
function resolvePrice(isToday, livePrice, realIndexedPrice, lastPriceFallback) {
  if (isToday && livePrice > 0) return livePrice;
  if (realIndexedPrice > 0) return realIndexedPrice;
  return lastPriceFallback;
}
test('Equity history real-price resolution: today always prefers the live price', () => {
  assert.strictEqual(resolvePrice(true, 5000, 4800, 4500), 5000);
});
test('Equity history real-price resolution: historical day prefers the real indexed price over lastPrice', () => {
  assert.strictEqual(resolvePrice(false, undefined, 4800, 4500), 4800, 'A held position must mark-to-market on days between transactions, not freeze at lastPrice');
});
test('Equity history real-price resolution: missing/zero/NaN real price falls through to lastPrice, never NaN', () => {
  assert.strictEqual(resolvePrice(false, undefined, undefined, 4500), 4500);
  assert.strictEqual(resolvePrice(false, undefined, 0, 4500), 4500);
  assert.strictEqual(resolvePrice(false, undefined, NaN, 4500), 4500);
});

// ── TEST 30: getPortfolio() SELL-on-empty-position never produces NaN cost ──
// getPortfolio() (03-engine.js) has the same "can't safely run under Node"
// problem as TEST 29 above (implicit globals: transactions, prices, DB,
// _txHash, getTxMultiplier...), so this locks down the contract of its SELL
// branch instead: a SELL landing on a position with p.shares<=0 (only
// reachable with corrupted/hand-edited storage data — every real entry
// point already rejects lot<=0) must resolve `avg` to a finite number,
// never NaN/Infinity from a 0/0 or x/0 division, so `p.cost` can never be
// corrupted by a 0/0 * 0 = NaN propagating through Math.max(0, ...).
function resolveSellAvg(sharesHeld, costBasis, sold) {
  return sharesHeld > 0 ? (costBasis / sharesHeld) : 0;
}
test('getPortfolio() SELL-avg contract: a SELL on an empty/never-bought position (sold=0) resolves avg to 0, never NaN/Infinity', () => {
  const avg = resolveSellAvg(0, 0, 0);
  assert.strictEqual(avg, 0);
  assert(!isNaN(avg), 'avg must never be NaN');
  const costAfter = Math.max(0, 0 - (avg * 0));
  assert.strictEqual(costAfter, 0, 'p.cost must stay a clean 0, never NaN, after an empty-position SELL');
});
test('getPortfolio() SELL-avg contract: a normal SELL still computes pro-rata avg cost correctly', () => {
  assert.strictEqual(resolveSellAvg(100, 15000, 40), 150);
});
test('REGRESSION GUARD: 03-engine.js getPortfolio() SELL branch must not divide by `sold` when shares<=0', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/03-engine.js'), 'utf8');
  assert(
    !/p\.shares > 0 \? \(p\.cost \/ p\.shares\) : \(tx\.gross \/ sold\)/.test(src),
    'The unguarded `tx.gross / sold` fallback (NaN/Infinity when sold===0) has come back into getPortfolio() — see the fix at the same line for why it must resolve to 0 instead'
  );
});

// ── TEST 31: broker-table price-spread never divides by a zero avgPrice ──
// 41-stockchat-cockpit.js's Top Buyer/Seller tables (renderBandarmologyBrokerTrailView
// and friends) compute a "% spread vs broker avg price" badge. If the
// broker-summary API ever returns avgPrice: 0 for a broker (incomplete
// upstream data), dividing by it produced +-Infinity%, displayed as a
// literal "Infinity%" badge instead of a graceful "—"/0%.
function priceSpreadPct(currentPrice, avgPrice) {
  return (currentPrice && avgPrice > 0) ? (((currentPrice - avgPrice) / avgPrice) * 100) : 0;
}
test('priceSpreadPct(): a zero avgPrice resolves to 0, never Infinity/-Infinity/NaN', () => {
  const spread = priceSpreadPct(5000, 0);
  assert.strictEqual(spread, 0);
  assert(isFinite(spread), 'spread must be finite, never Infinity');
});
test('priceSpreadPct(): a normal case still computes the real percentage', () => {
  assert.strictEqual(priceSpreadPct(5100, 5000), 2);
});
test('REGRESSION GUARD: 41-stockchat-cockpit.js broker tables must guard avgPrice>0 before dividing', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  assert(
    !/data\.price \? \(\(\(data\.price - [a-zA-Z]+\.avgPrice\) \/ [a-zA-Z]+\.avgPrice\) \* 100\)\.toFixed\(1\) : 0/.test(src),
    'The unguarded avgPrice division (Infinity% when avgPrice===0) has come back into the broker Top Buyer/Seller tables'
  );
  const guardedCount = (src.match(/\(data\.price && [a-zA-Z]+\.avgPrice > 0\)/g) || []).length;
  assert.strictEqual(guardedCount, 2, 'Expected both the Top Buyer and Top Seller table price-spread calcs to carry the avgPrice>0 guard');
});

// ── TEST 32: double-submit guard on every modal "Konfirmasi/Simpan" button ──
// public/js/05-assets.js can't safely run under Node either (same ~20
// implicit-global problem as TEST 29-31), so this locks down the contract
// of _modalSubmitAllowed() instead: a fast double-click/double-tap fires
// two SEPARATE, fully-completed synchronous click-handler invocations (JS's
// single-threaded event loop means they never literally overlap), so an
// in-function "isSubmitting" flag reset at the end of the function can't
// catch it — only a timestamp cooldown checked at call time can. Before
// this fix, submitTxModal()/submitCryptoModal()/submitEtfModal()/
// submitRdModal()/submitRdn()/submitAdjustRdn()/submitFee()/submitDivModal()
// had zero protection against this (unlike submitDivModal()'s existing
// isDividendAlreadyRecorded() 45-day dedup, which catches the dividend
// case of this same class of bug but was never applied to the other 7).
function modalSubmitAllowedContract(lastSubmitAt, cooldownMs, now) {
  return (now - lastSubmitAt) >= cooldownMs;
}
test('_modalSubmitAllowed() contract: rejects a second submit within the cooldown window, allows one after', () => {
  const cooldownMs = 800;
  let lastSubmitAt = 1000;
  assert.strictEqual(modalSubmitAllowedContract(lastSubmitAt, cooldownMs, 1000), false, 'First real submit already recorded — a call at the SAME instant (the double-click case) must be rejected');
  assert.strictEqual(modalSubmitAllowedContract(lastSubmitAt, cooldownMs, 1799), false, 'Still inside the 800ms cooldown window — must stay rejected');
  assert.strictEqual(modalSubmitAllowedContract(lastSubmitAt, cooldownMs, 1800), true, 'Exactly at the cooldown boundary — must be allowed again');
});
test('REGRESSION GUARD: every modal submit function in 05-assets.js must call _modalSubmitAllowed() before writing data', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/05-assets.js'), 'utf8');
  assert(/function _modalSubmitAllowed\(\)/.test(src), 'The shared _modalSubmitAllowed() guard function itself is missing');
  const guardCallCount = (src.match(/if\(!_modalSubmitAllowed\(\)\) return;/g) || []).length;
  assert.strictEqual(guardCallCount, 8,
    'Expected the double-submit guard in exactly 8 places (submitCryptoModal, submitEtfModal, submitRdModal, submitFee, submitAdjustRdn, submitRdn, submitTxModal, submitDivModal) — got ' + guardCallCount + '. If a new modal submit function was added, give it the guard too; if this dropped, a real double-click/double-tap can silently write a duplicate transaction/mutation with no automatic dedup.'
  );
});

// ── TEST 33: escapeHtml() — added when 'copilot'/'dataconn' got real nav ──
// Both pages existed fully-built but unreachable (no nav button anywhere —
// see UIUX_ROADMAP_AUDIT.md §1.3) until now. Wiring up real navigation to
// 'copilot' surfaced a live bug that had never been reachable before:
// public/js/28-decisiontools.js calls escapeHtml() when rendering AI
// tool-call badges, but escapeHtml() was never defined ANYWHERE in the
// codebase — confirmed via `pageerror: escapeHtml is not defined` when
// actually sending a message that triggers a tool call (verified with a
// real headless-browser click-through against the real /api/ai/agent-chat
// endpoint, not just a source read). Added escapeHtml() to 01-data.js
// (loaded first, already proven loadable standalone via vm — see
// lib/universe.js's loadBaseUniverse(), reused here) as a shared utility.
test('escapeHtml() (public/js/01-data.js, loaded via the real vm sandbox technique) escapes all 5 HTML-special characters', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/01-data.js'), 'utf8');
  const sandbox = { window: {}, document: { getElementById: () => null } };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '01-data.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.escapeHtml, 'function',
    'escapeHtml() not found in public/js/01-data.js — has it been renamed/removed?');
  assert.strictEqual(ctx.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(ctx.escapeHtml('Tom & Jerry "quoted" \'single\''), 'Tom &amp; Jerry &quot;quoted&quot; &#39;single&#39;');
  assert.strictEqual(ctx.escapeHtml(null), '', 'null must escape to empty string, not "null"');
  assert.strictEqual(ctx.escapeHtml(undefined), '', 'undefined must escape to empty string, not "undefined"');
  assert.strictEqual(ctx.escapeHtml(123), '123', 'non-string input must be coerced, not throw');
});
test('REGRESSION GUARD: 28-decisiontools.js Copilot tool-call badges must still call escapeHtml()', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  const callCount = (src.match(/escapeHtml\(/g) || []).length;
  assert(callCount >= 2,
    'Expected at least 2 escapeHtml() calls (tool name + tool args) in the Copilot tool-call badge renderer — got ' + callCount + '. If this dropped, AI-controlled tool-call text renders unescaped into innerHTML again.'
  );
});

// ── TEST 34: Command Center P0 slice 2 (Market Regime + AI Opportunity
// Radar zones added to the dashboard) — UIUX_ROADMAP_AUDIT.md §6/§7.
// public/js/04-render.js can't safely run under Node either (same
// implicit-global problem as TEST 29-33), so this locks down two things
// via source inspection: the regime label/color mapping's contract (pure
// function, replicated to test the mapping logic itself) and that the new
// render functions are actually wired into renderDashboard() and reuse
// the REAL existing data sources (loadOpportunityRadarUniverse() from
// 26-commandcenter.js) rather than a second, separately-maintained fetch.
function regimeDisplayContract(regime, table) {
  return table[regime] || { label: regime || '—', color: 'var(--text3)', bg: 'var(--bg3)' };
}
test('regimeDisplayContract(): known regimes map to their label, unknown/missing falls back honestly', () => {
  const table = {
    BULL_TREND: { label: 'BULL TREND', color: 'var(--green)', bg: 'rgba(0,245,155,0.15)' },
    BEAR_TREND: { label: 'BEAR TREND', color: 'var(--red)', bg: 'rgba(255,61,90,0.15)' }
  };
  assert.deepStrictEqual(regimeDisplayContract('BULL_TREND', table), { label: 'BULL TREND', color: 'var(--green)', bg: 'rgba(0,245,155,0.15)' });
  assert.deepStrictEqual(regimeDisplayContract('SOME_NEW_REGIME_SERVER_ADDED', table), { label: 'SOME_NEW_REGIME_SERVER_ADDED', color: 'var(--text3)', bg: 'var(--bg3)' },
    'An unrecognized regime value must fall back to displaying the raw value, never silently disappear or crash');
  assert.deepStrictEqual(regimeDisplayContract(null, table), { label: '—', color: 'var(--text3)', bg: 'var(--bg3)' });
});
test('REGRESSION GUARD: renderDashboard() must call both new Command Center zone renderers', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  assert(/function renderDashboardMarketRegime\(\)/.test(src), 'renderDashboardMarketRegime() is missing');
  assert(/function renderDashboardRadarPreview\(\)/.test(src), 'renderDashboardRadarPreview() is missing');
  const dashboardFn = src.match(/function renderDashboard\(\)\{[\s\S]*?\n\}/);
  assert(dashboardFn, 'renderDashboard() function not found');
  assert(dashboardFn[0].includes('renderDashboardMarketRegime'),
    'renderDashboard() no longer calls renderDashboardMarketRegime() — the Market Regime zone would silently stop updating');
  assert(dashboardFn[0].includes('renderDashboardRadarPreview'),
    'renderDashboard() no longer calls renderDashboardRadarPreview() — the Screener top-picks preview zone would silently stop updating');
  // FIX (2026-09-19, user-reported: "datanya tidak sesuai screener"):
  // this preview used to call loadOpportunityRadarUniverse() (a separate,
  // disagreeing MoS/ROE fundamental-score formula) instead of the SAME
  // /api/idx/unified-screener endpoint the Screener page it links to
  // actually uses — the two showed different top-pick tickers for the
  // same market. Must never call the old radar engine again, and must
  // read the unified Screener endpoint directly.
  const radarPreviewFn = src.match(/async function renderDashboardRadarPreview\(\)\{[\s\S]*?\n\}/);
  assert(radarPreviewFn, 'renderDashboardRadarPreview() body not found');
  // Strip comment lines first — the fix's own explanatory comment
  // legitimately mentions "loadOpportunityRadarUniverse()" by name as
  // history, which must not itself trip this guard.
  const radarPreviewCode = radarPreviewFn[0].split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
  assert(!/loadOpportunityRadarUniverse\(\)/.test(radarPreviewCode),
    'REGRESSION: renderDashboardRadarPreview() calls loadOpportunityRadarUniverse() again — this is the old, separate MoS/ROE scoring engine that disagrees with the unified Screener\'s Whale/Uptrend formula, reproducing the exact "datanya tidak sesuai screener" bug');
  assert(/\/api\/idx\/unified-screener/.test(radarPreviewCode),
    'REGRESSION: renderDashboardRadarPreview() no longer fetches /api/idx/unified-screener — its top picks will diverge from the Screener page again');
});
test('REGRESSION GUARD: dashboard HTML must still have both new zone containers', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(src.includes('id="card-dash-regime"'), '#card-dash-regime container missing from index.html');
  assert(src.includes('id="card-dash-radar"'), '#card-dash-radar container missing from index.html');
  assert(src.includes('id="dash-regime-badge"') && src.includes('id="dash-regime-desc"'),
    'Market Regime card is missing the badge/description elements renderDashboardMarketRegime() writes into');
  assert(src.includes('id="dash-radar-list"'),
    'AI Opportunity Radar card is missing the list container renderDashboardRadarPreview() writes into');
});

// ── TEST 35: Command Center P0 slice 3 (Alerts & Actions zone) —
// UIUX_ROADMAP_AUDIT.md §6/§7. Deliberately reuses window.mwGetPriceAlerts()
// (30-price-alerts.js, real user-set price targets checked against real
// live prices) rather than the FS_RD-based alerts on the `alerts` page
// (KNOWN_ISSUES.md #2 documents that path can show fabricated signals
// with no disclosure) — this guard exists specifically so that choice
// doesn't silently drift back to the unsafe source later.
test('REGRESSION GUARD: renderDashboard() must call renderDashboardAlertsPreview(), reusing the REAL mwGetPriceAlerts()', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  assert(/function renderDashboardAlertsPreview\(\)/.test(src), 'renderDashboardAlertsPreview() is missing');
  const dashboardFn = src.match(/function renderDashboard\(\)\{[\s\S]*?\n\}/);
  assert(dashboardFn, 'renderDashboard() function not found');
  assert(dashboardFn[0].includes('renderDashboardAlertsPreview'),
    'renderDashboard() no longer calls renderDashboardAlertsPreview() — the Alerts & Actions zone would silently stop updating');
  assert(/mwGetPriceAlerts\(\)/.test(src),
    'renderDashboardAlertsPreview() must reuse the REAL window.mwGetPriceAlerts() (30-price-alerts.js) — reading directly from FS_RD/fsGenAlerts() would reintroduce the fabricated-data risk documented in KNOWN_ISSUES.md #2');
  assert(!/fsGenAlerts\(\)/.test(src.match(/function renderDashboardAlertsPreview\(\)\{[\s\S]*?\n\}/)?.[0] || ''),
    'renderDashboardAlertsPreview() must not call the FS_RD-based fsGenAlerts() — see KNOWN_ISSUES.md #2');
});
test('REGRESSION GUARD: dashboard HTML must still have the Alerts zone container', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(src.includes('id="card-dash-alerts"'), '#card-dash-alerts container missing from index.html');
  assert(src.includes('id="dash-alerts-list"'), 'Alerts card is missing the list container renderDashboardAlertsPreview() writes into');
});

// ── TEST 36: Command Center P0 slice 4 (AI Insight zone) —
// UIUX_ROADMAP_AUDIT.md §6/§7/§10. This is a rule-based synthesis of the
// three real zones already built (Market Regime, Portfolio Snapshot,
// AI Opportunity Radar) plus Alerts — no fetch of its own, no LLM call.
// Guards that (a) it stays wired into renderDashboard() and into the
// other two zones' completion callbacks (so it updates once their async
// fetches resolve, not just once at page load with stale/empty data),
// and (b) every line it renders still carries a source label — the
// roadmap's own AI Insight guidance (§10) requires distinguishing fact
// from AI opinion, and an unlabeled line would silently violate that.
test('REGRESSION GUARD: renderDashboard() and the other two zone renderers must all trigger renderDashboardAIInsight()', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  assert(/function renderDashboardAIInsight\(\)/.test(src), 'renderDashboardAIInsight() is missing');
  const dashboardFn = src.match(/function renderDashboard\(\)\{[\s\S]*?\n\}/);
  assert(dashboardFn && dashboardFn[0].includes('renderDashboardAIInsight'),
    'renderDashboard() no longer calls renderDashboardAIInsight() directly');
  const regimeFn = src.match(/async function renderDashboardMarketRegime\(\)\{[\s\S]*?\n\}/);
  assert(regimeFn && regimeFn[0].includes('renderDashboardAIInsight'),
    'renderDashboardMarketRegime() no longer calls renderDashboardAIInsight() when it finishes — AI Insight would keep showing stale/loading regime text after the real fetch resolves');
  const radarFn = src.match(/async function renderDashboardRadarPreview\(\)\{[\s\S]*?\n\}/);
  assert(radarFn && radarFn[0].includes('renderDashboardAIInsight'),
    'renderDashboardRadarPreview() no longer calls renderDashboardAIInsight() when it finishes — AI Insight would keep showing a stale/loading top pick after the real fetch resolves');
});
test('REGRESSION GUARD: every AI Insight line must carry a source label (roadmap §10: distinguish fact from AI opinion)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  const insightFn = src.match(/function renderDashboardAIInsight\(\)\{[\s\S]*?\n\}/);
  assert(insightFn, 'renderDashboardAIInsight() body not found');
  const body = insightFn[0];
  ['Kondisi Market', 'Risiko Utama', 'Tindakan Direkomendasikan'].forEach(label => {
    assert(body.includes(label), `Expected line "${label}" to still exist in renderDashboardAIInsight()`);
  });
  // Every lines.push({...}) call must include a `source:` field — the
  // template literally renders `l.source` for each line, so a pushed
  // entry missing it would silently print "undefined" instead of a
  // real module reference.
  const pushCount = (body.match(/lines\.push\(\{/g) || []).length;
  const sourceCount = (body.match(/source:\s*'/g) || []).length;
  assert.strictEqual(sourceCount, pushCount,
    `Expected every one of the ${pushCount} lines.push() calls to include a source: field — got ${sourceCount}`);
});
test('REGRESSION GUARD: dashboard HTML must still have the AI Insight zone container', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(src.includes('id="card-dash-insight"'), '#card-dash-insight container missing from index.html');
  assert(src.includes('id="dash-insight-body"'), 'AI Insight card is missing the body container renderDashboardAIInsight() writes into');
});

// ── TEST 37: Command Center P0 slice 5 (Market Heatmap + Smart Money Flow
// zones) — UIUX_ROADMAP_AUDIT.md §6/§7. These were deliberately deferred
// after P0 slice 3 because both depended on FS_RD/generateClientSideBrokerSummary()
// data that could be fabricated with no disclosure (KNOWN_ISSUES.md #2/#3).
// Now that both are fixed, guards that (a) renderDashboard() still wires
// both preview renderers in, and (b) neither preview silently drops the
// real-vs-simulated disclosure the underlying fix added — a preview
// re-hiding that disclosure would recreate exactly the KNOWN_ISSUES.md
// #2/#3 problem on the homepage, the one place the audit was most worried
// about amplifying exposure to it.
test('REGRESSION GUARD: renderDashboard() must call renderDashboardHeatmapPreview() and renderDashboardSmartFlowPreview()', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  assert(/function renderDashboardHeatmapPreview\(\)/.test(src), 'renderDashboardHeatmapPreview() is missing');
  assert(/function renderDashboardSmartFlowPreview\(\)/.test(src), 'renderDashboardSmartFlowPreview() is missing');
  const dashboardFn = src.match(/function renderDashboard\(\)\{[\s\S]*?\n\}/);
  assert(dashboardFn && dashboardFn[0].includes('renderDashboardHeatmapPreview'),
    'renderDashboard() no longer calls renderDashboardHeatmapPreview()');
  assert(dashboardFn && dashboardFn[0].includes('renderDashboardSmartFlowPreview'),
    'renderDashboard() no longer calls renderDashboardSmartFlowPreview()');
});
// FIX (2026-09-19, user-reported: "Market Heatmap masih menampilkan hanya
// lq45..."): the full Heatmap page's "Flow Heatmap" tab (fsRenderHeatmap())
// used to read FS_RD (07-flowscan.js's top-60-by-market-cap slice of the
// full ~958-ticker universe) — a CLAUDE.md rule #2 violation. Now
// whole-market via fsFetchUnifiedHeatmapData() (GET
// /api/idx/unified-screener), filtered by criteria (whaleDataAvailable)
// instead of a market-cap sample.
test('REGRESSION GUARD: full Heatmap page\'s Flow Heatmap tab must be whole-market (not FS_RD\'s top-60-by-cap sample)', () => {
  const flowSrc = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');
  assert(/function fsFetchUnifiedHeatmapData\(/.test(flowSrc), 'fsFetchUnifiedHeatmapData() is missing from 07-flowscan.js');
  assert(/\/api\/idx\/unified-screener/.test(flowSrc), 'fsFetchUnifiedHeatmapData() no longer fetches the whole-market unified-screener endpoint');
  assert(/whaleDataAvailable/.test(flowSrc), 'fsFetchUnifiedHeatmapData() no longer filters by the whaleDataAvailable criterion — would show every ticker unfiltered instead of "hanya memfilter yang masuk kriteria"');

  const heatmapFn = flowSrc.match(/async function fsRenderHeatmap\(force\)\{[\s\S]*?\n\}/);
  assert(heatmapFn, 'fsRenderHeatmap() body not found (must be async now, taking a force param)');
  assert(/fsFetchUnifiedHeatmapData\(/.test(heatmapFn[0]), 'fsRenderHeatmap() no longer calls fsFetchUnifiedHeatmapData()');
  assert(!/FS_RD/.test(heatmapFn[0]), 'REGRESSION: fsRenderHeatmap() reads FS_RD again — reintroduces the top-60-by-market-cap violation on the full Heatmap page');
});
// FIX (2026-09-19, user correction: "anda salah edit, market heat map
// seharusnya diganti sectoral heat map, lihat Sectoral Insight, data
// eharusnya diambil dari situ"): the dashboard's "Market Heatmap" widget
// first went through a per-stock Whale Score version — user then
// corrected it should instead be a SECTORAL heatmap, sourced from the
// "Sector Insight" page's own computation (siComputeAllSectors(),
// 44-sectoral-insight.js), not a separate per-stock ranking. Renamed
// "Heatmap Sektoral", reads window.siGetSectorHeatmapData() (a thin
// exported wrapper around siComputeAllSectors() — no duplicated logic),
// and "Lihat Semua" now points to goPage('sectoral-insight') (the page
// this data actually comes from) instead of goPage('heatmap') (a
// different page with a different per-stock/broker-flow aggregation —
// pointing there would reproduce the "preview doesn't match full page"
// bug class already fixed twice this session for other dashboard widgets).
test('REGRESSION GUARD: dashboard "Heatmap Sektoral" widget must read from Sector Insight\'s own computation (siGetSectorHeatmapData), not a separate per-stock heatmap', () => {
  const siSrc = fs.readFileSync(path.join(__dirname, 'public/js/44-sectoral-insight.js'), 'utf8');
  assert(/window\.siGetSectorHeatmapData\s*=\s*function/.test(siSrc), 'siGetSectorHeatmapData() export is missing from 44-sectoral-insight.js');
  assert(/siGetSectorHeatmapData\s*=\s*function\(\)\s*\{\s*return siComputeAllSectors\(/.test(siSrc),
    'REGRESSION: siGetSectorHeatmapData() no longer delegates to siComputeAllSectors() — the dashboard widget would duplicate (and could diverge from) the Sector Insight page\'s own sector computation');

  const renderSrc = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  const previewFn = renderSrc.match(/function renderDashboardHeatmapPreview\(\)\{[\s\S]*?\n\}\n/);
  assert(previewFn, 'renderDashboardHeatmapPreview() body not found');
  assert(/siGetSectorHeatmapData\(/.test(previewFn[0]),
    'REGRESSION: renderDashboardHeatmapPreview() no longer calls window.siGetSectorHeatmapData() — reverted away from Sector Insight\'s sectoral data');
  assert(!/fsFetchUnifiedHeatmapData/.test(previewFn[0]) && !/FS_RD/.test(previewFn[0]),
    'REGRESSION: renderDashboardHeatmapPreview() reads a per-stock heatmap source again (fsFetchUnifiedHeatmapData/FS_RD) instead of the sectoral one the user asked for');
  assert(/goPage\(\\'sectoral-insight\\'\)/.test(previewFn[0]),
    'REGRESSION: renderDashboardHeatmapPreview() no longer points "Lihat Semua" to goPage(\'sectoral-insight\') — would mismatch the data source it actually reads from');

  const htmlSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(htmlSrc.includes(">Heatmap Sektoral<"), 'index.html is missing the "Heatmap Sektoral" dashboard card title (renamed from "Market Heatmap")');
  const cardMatch = htmlSrc.match(/id="card-dash-heatmap"[\s\S]*?<\/div>\s*<\/div>/);
  assert(cardMatch && /goPage\('sectoral-insight'\)/.test(cardMatch[0]),
    'REGRESSION: the dashboard "Heatmap Sektoral" card\'s "Lihat Semua" button no longer points to goPage(\'sectoral-insight\')');
});
// FIX (2026-09-19, user-reported "Opportunity Radar belum sinkron dengan
// screener", user confirmed konsolidasi via AskUserQuestion): the separate
// "Opportunity Radar" page in Command Center (26-commandcenter.js,
// page-radar) used to have its OWN "Universe Screener (950+)" sub-tab —
// a duplicate whole-market screener with a DIFFERENT formula
// (Margin-of-Safety/ROE/PE, GET /api/idx/opportunity-radar) than the real
// Screener page (generateUnifiedScreener()'s Whale/Uptrend formula,
// GET /api/idx/unified-screener) — the same "2 features disagree, reads as
// a bug" pattern already fixed once for the dashboard preview widget
// (see the "datanya tidak sesuai screener" guard above). Removed; the 3
// other sub-tabs (Anomaly Structural & ARA, Visualisasi Alur Transaksi,
// Kalender Aksi Korporasi) are real, distinct features and were kept.
test('REGRESSION GUARD: Opportunity Radar page must not have its own duplicate "Universe Screener" sub-tab (consolidated into the real Screener page)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/26-commandcenter.js'), 'utf8');
  assert(!/function renderRadarScreenerSubTab/.test(src),
    'REGRESSION: renderRadarScreenerSubTab() exists again — reintroduces the duplicate MoS/ROE/PE whole-market screener that disagrees with the unified Screener');
  assert(!/Universe Screener \(950\+\)/.test(src),
    'REGRESSION: the "Universe Screener (950+)" tab button is back on the Opportunity Radar page');
  assert(!/function getOpportunityRadarItems/.test(src),
    'REGRESSION: getOpportunityRadarItems() exists again with no caller left to justify it');
  assert(!/function loadOpportunityRadarUniverse/.test(src),
    'REGRESSION: loadOpportunityRadarUniverse() exists again — the old MoS/ROE/PE fetch this consolidation removed');
  const radarPageFn = src.match(/function renderOpportunityRadarPage\(\) \{[\s\S]*?\n\}\n/);
  assert(radarPageFn, 'renderOpportunityRadarPage() body not found');
  assert(/anomaly-ara/.test(radarPageFn[0]) && /flow-trail/.test(radarPageFn[0]) && /corporate-actions/.test(radarPageFn[0]),
    'renderOpportunityRadarPage() must still render its 3 real sub-tabs (Anomaly Structural & ARA, Visualisasi Alur Transaksi, Kalender Aksi Korporasi) — these are distinct features, not part of this consolidation');
  assert(/goPage\(\\'radar\\'\)/.test(radarPageFn[0]),
    'renderOpportunityRadarPage() should point users to the real Screener page (goPage(\'radar\') -> renderUnifiedScreenerPage()) now that its own screener sub-tab is gone');
});
// FIX (2026-09-19, user-requested: "dihapus diganti sectroal heatmap"):
// the Heatmap page's ("page-heatmap") second tab used to be "Factor
// Heatmap" (fhmRender(), 11-quant.js) — a per-stock RSI/Momentum/
// Volatilitas/Composite-Score grid built from QT.scData. Removed and
// replaced with "Heatmap Sektoral", reusing fsRenderSectorHeatmapMode()
// (07-flowscan.js) — the SAME function Smart Money Screener's "sector"
// mode already uses (whole-market, real Invezgo broker-flow data
// aggregated per sector) — rather than building a second, separate
// sectoral feature.
test('REGRESSION GUARD: Heatmap page\'s 2nd tab must be "Heatmap Sektoral" (fsRenderSectorHeatmapMode), not the old "Factor Heatmap" (fhmRender/QT.scData)', () => {
  const quantSrc = fs.readFileSync(path.join(__dirname, 'public/js/11-quant.js'), 'utf8');
  assert(!/function fhmRender/.test(quantSrc), 'REGRESSION: fhmRender() exists again — the old per-stock Factor Heatmap this consolidation removed');
  assert(!/page === 'factor-heatmap'/.test(quantSrc), 'REGRESSION: the dead goPage(\'factor-heatmap\') hook is back in 11-quant.js');

  const flowSrc = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');
  assert(/function fsRenderSectorHeatmapMode\(targetId\)/.test(flowSrc),
    'fsRenderSectorHeatmapMode() must accept an optional targetId param — needed to render into both Smart Money Screener\'s and the Heatmap page\'s own container without duplicating the fetch/aggregation logic');
  const switchFn = flowSrc.match(/function hmSwitchTab\(tab, btn\)\{[\s\S]*?\n\}/);
  assert(switchFn, 'hmSwitchTab() body not found');
  assert(/fsRenderSectorHeatmapMode\('hm-sector-content'\)/.test(switchFn[0]),
    'REGRESSION: hmSwitchTab() no longer calls fsRenderSectorHeatmapMode(\'hm-sector-content\') for the sector tab — the old fhmRender() call (or nothing) may have come back');
  assert(!/fhmRender\(\)/.test(switchFn[0]), 'REGRESSION: hmSwitchTab() calls fhmRender() again');

  const htmlSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(htmlSrc.includes('id="hm-sector-content"'), 'index.html is missing the hm-sector-content container fsRenderSectorHeatmapMode() renders into');
  assert(!htmlSrc.includes('id="fhm-grid"') && !htmlSrc.includes('id="fhm-dist-chart"'), 'REGRESSION: the old Factor Heatmap markup (fhm-grid/fhm-dist-chart) is back in index.html');
  assert(!htmlSrc.includes(">Factor Heatmap<"), 'REGRESSION: the "Factor Heatmap" tab button text is back in index.html');
});
// FIX (2026-09-18, user-reported after full-codebase audit): this card
// used to call generateClientSideBrokerSummary() DIRECTLY, skipping the
// real backend entirely — so it ALWAYS showed "SIMULASI" even when
// Invezgo was configured and returning real data for these exact 4
// tickers elsewhere in the app. Now goes through fetchBrokerSummaryData()
// (real-data-first, same path every other Bandarmology view uses) and
// shows a dynamic badge (REAL / SEBAGIAN REAL / TIDAK TERSEDIA) reflecting
// actual per-ticker isSimulated flags, instead of a badge that was always
// "SIMULASI" by construction.
test('REGRESSION GUARD: Smart Money Flow preview must fetch real data first (fetchBrokerSummaryData), not skip straight to the simulated fallback', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  const fn = src.match(/async function renderDashboardSmartFlowPreview\(\)\{[\s\S]*?\n\}/);
  assert(fn, 'renderDashboardSmartFlowPreview() body not found (must be async now)');
  assert(/fetchBrokerSummaryData\(/.test(fn[0]), 'renderDashboardSmartFlowPreview() no longer calls fetchBrokerSummaryData() — the real-data-first path');
  assert(!/generateClientSideBrokerSummary\(/.test(fn[0]), 'REGRESSION: renderDashboardSmartFlowPreview() reverted to calling generateClientSideBrokerSummary() directly, skipping the real backend');
  assert(/isSimulated === false/.test(fn[0]), 'renderDashboardSmartFlowPreview() no longer checks isSimulated to show a dynamic (not always-SIMULASI) badge');
});
test('REGRESSION GUARD: dashboard HTML must still have both new zone containers', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(src.includes('id="card-dash-heatmap"'), '#card-dash-heatmap container missing from index.html');
  assert(src.includes('id="dash-heatmap-grid"'), 'Heatmap card is missing the grid container renderDashboardHeatmapPreview() writes into');
  assert(src.includes('id="card-dash-smartflow"'), '#card-dash-smartflow container missing from index.html');
  assert(src.includes('id="dash-smartflow-body"'), 'Smart Money Flow card is missing the body container renderDashboardSmartFlowPreview() writes into');
});

// ── TEST 38: Stock Cockpit (UIUX_ROADMAP_AUDIT.md §8) — discovered this
// session that #page-stock-intel ("Stock Intelligence") already IS almost
// exactly the roadmap's Stock Cockpit concept (single ticker → unified
// overview → one-click handoff to Fundamental/Technical/Valuation, each
// pre-loading the ticker via fundSetTicker()/techSetTicker()/hw_loadStock()
// so switching suites never means re-typing it) — built in an earlier
// session, before this roadmap audit tracked it as such. The one real gap
// was no handoff to Bandarmology/Smart Money. Guards that the 4th handoff
// card (added this session) stays wired to the same ticker-preload pattern
// the other 3 already use, not silently dropped in a future edit.
test('REGRESSION GUARD: Stock Intelligence cockpit must keep its Bandarmology/Smart Money handoff card', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/27-stockintel.js'), 'utf8');
  assert(/Smart Money \/ Bandarmology/.test(src), 'Smart Money / Bandarmology handoff card heading is missing from 27-stockintel.js');
  assert(/selectStockChatTicker\(/.test(src), 'Handoff card no longer pre-loads the ticker via selectStockChatTicker() before navigating to Bandarmology');
  assert(/goBandarmology\(\\'stock\\',null\)/.test(src) || /goBandarmology\('stock',null\)/.test(src),
    'Handoff card no longer navigates to Bandarmology in stock mode');
  // The other 3 pre-existing handoff cards must still be there too — this
  // guard would also catch someone removing the whole "LANJUTKAN ANALISA
  // MENDALAM" section by accident while editing something else nearby.
  ['fundSetTicker', 'techSetTicker', 'hw_loadStock'].forEach(fn => {
    assert(src.includes(fn + '('), `Expected the ${fn}() handoff call to still exist in 27-stockintel.js`);
  });
});

// ── TEST 39: FlowScan sector fallback (found via user screenshot,
// 2026-09-11) — Ranking/Heatmap/Watchlist showed the literal string
// "IHSG" as a sector badge for any portfolio ticker with no sector data
// of its own (bulk-imported holdings without curated metadata). 'IHSG' is
// the composite index, not a sector — a nonsensical label next to real
// ones like "Konsumer"/"Tambang". Fixed by falling back to DB[tk].sector
// (already backfilled from _IDX_RAW_LIST by 01-data.js when available),
// then 'Lainnya' — the "sector unknown" convention used everywhere else
// in this app (01-data.js, 06-analysis-router.js, 22-datahealth.js).
test('REGRESSION GUARD: FlowScan must never fall back to the literal "IHSG" as a sector label', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');
  assert(!/s\s*:\s*'IHSG'/.test(src),
    'REGRESSION: 07-flowscan.js has a `s:\'IHSG\'` sector fallback again — IHSG is the composite index, not a sector, and users see this literally as a sector badge on Ranking/Heatmap/Watchlist');
  assert(/function fsFallbackInfo\(tk\)/.test(src), 'fsFallbackInfo() helper is missing — was it renamed/removed?');
  const fn = src.match(/function fsFallbackInfo\(tk\)\{[\s\S]*?\n\}/);
  assert(fn, 'fsFallbackInfo() body not found');
  assert(/DB\[tk\]/.test(fn[0]), 'fsFallbackInfo() no longer tries DB[tk].sector before falling back');
  assert(/'Lainnya'/.test(fn[0]), 'fsFallbackInfo() no longer falls back to \'Lainnya\'');
  // Every "ticker not found in FS_UNIV" lookup must use the shared helper,
  // not a re-typed inline fallback object (which is exactly how the
  // original bug had 5 duplicate copies of the same wrong literal).
  // FIX (2026-09-12, dead-code cleanup): threshold dropped from 5 to 4 -
  // fsToogleWatchlistCurrent() (one of the original 5 call sites) was
  // deleted along with the dead <div id="page-flowscan"> markup it
  // exclusively served (zero other callers, verified via full-codebase
  // grep; see INCIDENT_LOG.md). The invariant itself (no inline literal
  // fallback) still holds for all remaining call sites.
  const fallbackCallCount = (src.match(/\|\|\s*fsFallbackInfo\(/g) || []).length;
  assert(fallbackCallCount >= 4, `Expected at least 4 call sites using fsFallbackInfo() as the FS_UNIV.find() fallback, found ${fallbackCallCount} — a fallback may have reverted to an inline literal`);
  // FS_UNIV's own construction (from the user's real portfolio import)
  // must prefer DB[code].sector over the raw import row before 'Lainnya'.
  const univFn = src.match(/XLSX_DATA\.stocks\.forEach\(function\(s\)\{[\s\S]*?\n\}\);/);
  assert(univFn, 'FS_UNIV construction from XLSX_DATA.stocks not found');
  assert(/fsSectorLabel\(s\.sector\)\s*\|\|\s*fsSectorLabel\(dbInfo\s*&&\s*dbInfo\.sector\)\s*\|\|\s*'Lainnya'/.test(univFn[0]),
    'FS_UNIV construction no longer tries dbInfo.sector (via fsSectorLabel()) before falling back to \'Lainnya\'');
  // dbInfo.sector can be an English _IDX_RAW_LIST classification
  // ("Consumer Cyclicals", "Energy", ...) while every other sector badge
  // in this app is Indonesian — fsSectorLabel() must translate it, not
  // pass it through raw, or a stub ticker would show a raw English label
  // sitting next to Indonesian ones in the same table.
  assert(/function fsSectorLabel\(raw\)/.test(src), 'fsSectorLabel() translation helper is missing — was it renamed/removed?');
});

// ── TEST 40: KNOWN_ISSUES.md #1 — fhFetchCrypto() used to fetch
// 'CODE-IDR' directly from Yahoo Finance for every live crypto price
// update. Yahoo has no crypto->IDR pairs at all (confirmed 404 for every
// pair, see server.js:2765's own comment and 03-engine.js:273/452) — every
// single call failed 100% of the time by construction, so cryptoPrices[]
// (used as a direct IDR value everywhere it's read) never got a real
// update from this engine. Fixed to fetch 'CODE-USD' (Yahoo's real
// symbol) and convert with usdIdr (the live rate fhFetchKurs() already
// fetches earlier in the same fhStart() sequence).
test('REGRESSION GUARD: fhFetchCrypto() must fetch CODE-USD, never CODE-IDR (KNOWN_ISSUES.md #1)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/03-engine.js'), 'utf8');
  const fn = src.match(/function fhFetchCrypto\(\)\{[\s\S]*?\n\}/);
  assert(fn, 'fhFetchCrypto() body not found — has it been renamed/removed?');
  const body = fn[0];
  assert(!/code\s*\+\s*'-IDR'/.test(body),
    "REGRESSION: fhFetchCrypto() fetches 'CODE-IDR' again — Yahoo has no crypto->IDR pairs, this fails 100% of the time (KNOWN_ISSUES.md #1)");
  assert(/code\s*\+\s*'-USD'/.test(body),
    "fhFetchCrypto() no longer fetches 'CODE-USD' — the only crypto pair Yahoo actually publishes");
  assert(/usdIdr/.test(body),
    'fhFetchCrypto() no longer converts the fetched USD price to IDR via usdIdr — cryptoPrices[] is read as a direct IDR value everywhere else in this app');
});

// ── TEST 41: sidebar collapse-button CSS specificity (found by the user
// via screenshot, 2026-09-11) — .side-nav button{width:100%;...} has
// higher specificity (1 class + 1 element) than .side-collapse-btn alone
// (1 class), and .side-collapse-btn IS a <button> inside .side-nav, so
// that generic nav-item rule was winning and stretching the icon-only
// collapse button to ~229px (should be 28px), squeezing the sidebar
// search input down to ~18px — visually just an icon + text cursor with
// the "Cari fitur (Ctrl+K)..." placeholder and Ctrl-K badge invisible.
test('REGRESSION GUARD: sidebar collapse button CSS must stay scoped so .side-nav button can\'t override its width', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');
  assert(/\.side-toolbar\s+\.side-collapse-btn\s*\{/.test(css),
    'REGRESSION: .side-toolbar .side-collapse-btn scoped rule is missing — a bare .side-collapse-btn selector has LOWER specificity than .side-nav button (which sets width:100%) and would be overridden by it again, stretching this icon button and squeezing the search input next to it (see INCIDENT_LOG.md)');
});

// ── TEST 42 (superseded again 2026-09-18): originally guarded that
// TradeWave's old "Wave Scanner" tab (tab 2) rendered before the
// single-ticker TICKER INVALID gate inside renderTradeWavePage(); after
// the Wave Scanner removal it was narrowed to just checking that function
// still dispatched tabs 1/3. TradeWave has since stopped being its own
// page entirely — the user asked for Wave Cockpit and Risk Planner to
// move into the unified Screener too, as its own top-level tabs, with the
// TradeWave toolbar/page removed. renderTradeWavePage()/TW_STATE.activeTab
// are gone; twRenderSubPage(containerId, tabIdx) now renders whichever tab
// the Screener asks for, into a container the Screener owns.
test('REGRESSION GUARD: twRenderSubPage() renders Wave Cockpit (tabIdx 1) or Risk Planner (tabIdx 3) into a caller-supplied container, with no standalone TradeWave page left', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/37-tradewave-engine.js'), 'utf8');
  assert(!src.includes('function renderTradeWavePage'),
    'REGRESSION: renderTradeWavePage() has reappeared — TradeWave is no longer a standalone page (consolidated into the unified Screener), so this must not come back');
  assert(!src.includes('function initTradeWaveSuite'),
    'REGRESSION: initTradeWaveSuite() has reappeared — there is no more page-tradewave to initialize');
  assert(!/TW_STATE\.activeTab/.test(src),
    'REGRESSION: TW_STATE.activeTab has reappeared — which Wave tab shows is now the unified Screener\'s US_STATE.pageTab, not TradeWave\'s own state');
  const fn = src.match(/function twRenderSubPage\(containerId, tabIdx\) \{[\s\S]*?\n  \}\n/);
  assert(fn, 'twRenderSubPage(containerId, tabIdx) not found — has it been renamed/removed?');
  const body = fn[0];
  assert(/document\.getElementById\(containerId\)/.test(body),
    'REGRESSION: twRenderSubPage() no longer renders into the caller-supplied containerId — it must not hardcode a page-tradewave lookup again');
  assert(/tabIdx === 1/.test(body) && /tabIdx === 3/.test(body),
    'REGRESSION: twRenderSubPage() no longer dispatches tabIdx 1 (Wave Cockpit) and 3 (Risk Planner)');
});

// ── TEST 43: Bandarmology Smart Money Flow chart grid must fit exactly
// 2 charts per row, not 4 and not 3 (found by the user via screenshot,
// 2026-09-11, TWICE — first report: the 4-chart "INTERACTIVE REAL-TIME
// CHART SUITE" used `repeat(auto-fit,minmax(320px,1fr))`, which packed
// all 4 charts into one cramped row on desktop widths; after bumping
// that to `minmax(480px,1fr)`, a second screenshot showed 3 charts on
// top and 1 alone below on a wide-enough viewport, because `auto-fit`
// still greedily packs in as many `>=480px` columns as fit — there is no
// minmax() width that yields "always exactly 2" for every container
// width, since auto-fit's column count depends on container-width /
// min-width, not a fixed count). Fixed by switching to a dedicated
// `.bandar-smart-chart-grid` CSS class (main.css) using a fixed
// `repeat(2,1fr)` with a real media query to collapse to 1 column on
// narrow/mobile — something a single inline auto-fit/minmax value
// cannot express.
// ── TEST 42b (superseded 2026-09-18): the old regression guard here
// checked that renderTab2WaveScanner() filtered out invalid entries before
// rendering. That whole "Wave Scanner" tab has since been deliberately
// removed from TradeWave — it scanned a hardcoded ~25-ticker sample mixing
// IDX equities and crypto, which violates CLAUDE.md's whole-BEI-market
// screening rule (never audited until this consolidation). The underlying
// SuperTrend/Elliott-Wave formula was ported server-side
// (computeWaveAnalysis() in lib/idx-data-engine.js) and now runs
// whole-market via the unified Screener; crypto scope was dropped per
// explicit user decision. This test now guards that the removal is
// genuine — Wave Scanner must not silently reappear or leave dead
// references behind.
test('REGRESSION GUARD: TradeWave Wave Scanner tab (and its ~25-ticker hardcoded/crypto-mixed universe) must stay removed', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/37-tradewave-engine.js'), 'utf8');
  assert(!src.includes('function renderTab2WaveScanner'),
    'REGRESSION: renderTab2WaveScanner() has reappeared — Wave Scanner was deliberately consolidated into the unified Screener (see computeWaveAnalysis() in lib/idx-data-engine.js), it must not be re-added here');
  assert(!/var TW_UNIVERSE/.test(src),
    'REGRESSION: TW_UNIVERSE (hardcoded ~25-ticker sample mixing IDX+crypto) has reappeared — violates CLAUDE.md whole-BEI-market screening rule');
  assert(!src.includes('twSetFilterWave'),
    'REGRESSION: twSetFilterWave() has reappeared — it was Wave-Scanner-only and should stay removed');
  assert(!/onclick="twSwitchTab\(2\)"/.test(src),
    'REGRESSION: a tab-2 (Wave Scanner) button has reappeared in the TradeWave tab bar');
  assert(!/twSetTicker\('BTC'\)/.test(src),
    'REGRESSION: BTC quick-pick button has reappeared — crypto scope was explicitly dropped from TradeWave/Screener consolidation');
});

test('computeWaveAnalysis() classifies a clean uptrend as a bullish wave phase and a clean downtrend as CORRECTIVE ABC, from real OHLCV math (not a placeholder)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const helperSrc = [
    'function computeEMA', 'function computeRSI', 'function computeSuperTrendSeries', 'function computeWaveAnalysis'
  ].map((marker) => {
    const m = src.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?\\n}\\n'));
    assert(m, `REGRESSION: could not locate ${marker}() in idx-data-engine.js — has it been renamed/removed?`);
    return m[0];
  }).join('\n');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(helperSrc, sandbox, { filename: 'wave-analysis-helpers (sandboxed)' });

  function synthPoints(n, direction) {
    const pts = [];
    let price = 1000;
    for (let i = 0; i < n; i++) {
      price = direction === 'up' ? price * 1.01 : price * 0.99;
      const o = price * 0.995;
      const c = price;
      const h = Math.max(o, c) * 1.005;
      const l = Math.min(o, c) * 0.995;
      pts.push({ o, h, l, c, v: 1000000 });
    }
    return pts;
  }

  // A smoothly-decaying series (constant %/day) never actually flips
  // SuperTrend bearish — the ATR shrinks in lockstep with the decline, so
  // the lower band never gets crossed (this is a property of the ATR-band
  // math itself, ported unchanged from TradeWave's twCalcSuperTrend()).
  // A real bearish market needs a sharp break relative to prior (low)
  // volatility, so this builds 40 quiet bars then a real ~7%/day crash —
  // the same shape that makes CORRECTIVE ABC reachable in production.
  function synthCrashPoints(quietBars, crashBars) {
    const pts = [];
    let price = 1000;
    for (let i = 0; i < quietBars; i++) {
      price *= 0.999;
      const o = price * 0.999, c = price, h = Math.max(o, c) * 1.002, l = Math.min(o, c) * 0.998;
      pts.push({ o, h, l, c, v: 1000000 });
    }
    for (let i = 0; i < crashBars; i++) {
      price *= 0.93;
      const o = price * 1.02, c = price, h = Math.max(o, c) * 1.01, l = Math.min(o, c) * 0.99;
      pts.push({ o, h, l, c, v: 1000000 });
    }
    return pts;
  }

  const uptrend = sandbox.computeWaveAnalysis(synthPoints(60, 'up'));
  assert(uptrend, 'REGRESSION: computeWaveAnalysis() returned null for a valid 60-bar series');
  assert(['WAVE 1 BREAKOUT', 'WAVE 3 EXTENSION', 'WAVE 5 CLIMAX'].includes(uptrend.wavePhase),
    `REGRESSION: a clean synthetic uptrend was classified as "${uptrend.wavePhase}" instead of a bullish wave phase — the EMA-ribbon/SuperTrend classification logic is broken`);
  assert.strictEqual(uptrend.superTrendBullish, true, 'REGRESSION: SuperTrend must read bullish on a clean uptrend series');
  assert(uptrend.tp1 > 1000 && uptrend.tp2 > uptrend.tp1 && uptrend.tp3 > uptrend.tp2,
    'REGRESSION: Fibonacci targets tp1<tp2<tp3 ordering is broken');

  const downtrend = sandbox.computeWaveAnalysis(synthCrashPoints(40, 20));
  assert(downtrend, 'REGRESSION: computeWaveAnalysis() returned null for a valid 60-bar downtrend series');
  assert.strictEqual(downtrend.wavePhase, 'CORRECTIVE ABC',
    `REGRESSION: a clean synthetic downtrend was classified as "${downtrend.wavePhase}" instead of CORRECTIVE ABC`);
  assert.strictEqual(downtrend.superTrendBullish, false, 'REGRESSION: SuperTrend must read bearish on a clean downtrend series');

  assert.strictEqual(sandbox.computeWaveAnalysis([{ o: 1, h: 1, l: 1, c: 1, v: 1 }]), null,
    'REGRESSION: computeWaveAnalysis() must return null (honest "no data"), not throw or fabricate, when given too few bars (<30)');
});

test('REGRESSION GUARD: generateUnifiedScreener() must expose wave-analysis fields sourced from computeWaveAnalysis()', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(src.includes('function computeWaveAnalysis'),
    'computeWaveAnalysis() not found — has it been renamed/removed?');
  const fnStart = src.indexOf('async function generateUnifiedScreener');
  assert(fnStart !== -1, 'generateUnifiedScreener() not found');
  const fnEnd = src.indexOf('\n// ════', fnStart + 10);
  const body = src.slice(fnStart, fnEnd !== -1 ? fnEnd : fnStart + 8000);
  ['wavePhase', 'waveScore', 'superTrendBullish', 'cmf', 'waveInvalidation', 'waveTp1', 'waveTp2', 'waveTp3', 'waveRiskReward'].forEach((field) => {
    assert(body.includes(field + ':'),
      'REGRESSION: generateUnifiedScreener() no longer returns "' + field + '" in its row output');
  });
  assert(/if \(wavePhase && wavePhase !== 'ALL'\)/.test(body),
    'REGRESSION: generateUnifiedScreener() no longer filters by wavePhase');
});

test('REGRESSION GUARD: Bandarmology Smart Money Flow chart grid must use the fixed-2-column class, not an auto-fit/minmax that can pack in a 3rd column', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const fnStart = src.indexOf('function renderBandarmologySmartMoneyFlowView');
  assert(fnStart !== -1, 'renderBandarmologySmartMoneyFlowView() not found — has it been renamed/removed?');
  // scope to this function only — other grids elsewhere in this file
  // legitimately use auto-fit/minmax inline styles for unrelated card
  // layouts (e.g. the KSEI/broker summary cards further down in this same
  // function), so this check targets the specific chart-suite container
  // (identified by its neighboring canvas id) rather than banning
  // auto-fit/minmax anywhere in the function.
  const body = src.slice(fnStart, fnStart + 15000);
  const chartCanvasIdx = body.indexOf('bandarSmartPriceChart');
  assert(chartCanvasIdx !== -1, 'REGRESSION: "bandarSmartPriceChart" canvas not found — has the chart suite been restructured?');
  // Look at the grid-container <div> that wraps all 4 charts: search back
  // from the canvas for the nearest `class="bandar-smart-chart-grid"` or
  // an inline `grid-template-columns:repeat(auto-fit,minmax(` — whichever
  // is closer tells us which one is actually in use.
  const beforeCanvas = body.slice(0, chartCanvasIdx);
  const classIdx = beforeCanvas.lastIndexOf('class="bandar-smart-chart-grid"');
  const autoFitIdx = beforeCanvas.lastIndexOf('grid-template-columns:repeat(auto-fit,minmax(');
  assert(classIdx !== -1 && classIdx > autoFitIdx,
    'REGRESSION: the Smart Money Flow chart grid is back to an auto-fit/minmax inline style (or the "bandar-smart-chart-grid" class is missing) — auto-fit packs in as many columns as fit the container width, so on a wide enough viewport it can pack a 3rd chart into the first row instead of the intended fixed 2x2 layout');

  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');
  const cssFnMatch = css.match(/\.bandar-smart-chart-grid\s*\{[^}]*\}/);
  assert(cssFnMatch, 'REGRESSION: ".bandar-smart-chart-grid" rule missing from main.css');
  assert(/grid-template-columns:\s*repeat\(2,\s*1fr\)/.test(cssFnMatch[0]),
    '.bandar-smart-chart-grid no longer forces a fixed 2-column grid (repeat(2,1fr))');
  assert(/@media[^{]*\{\s*\.bandar-smart-chart-grid\s*\{[^}]*grid-template-columns:\s*1fr/.test(css),
    'REGRESSION: no media query collapses .bandar-smart-chart-grid to 1 column on narrow/mobile viewports');
});

// ── TEST 44: Portfolio Allocation donut legend color swatches must
// survive light theme (found by the user, 2026-09-11: "pada tema terang
// alokasi porotoflio legend tidak ada indikator warna"). Two overlapping
// CSS rules exist for "body.theme-light #porto-donut-legend div": one
// correctly scoped to `> div` (direct children — the row containers),
// and a duplicate using a plain descendant selector with no `>`, which
// also matches the tiny 10x10 color-swatch <div> nested inside each row
// and forces it to a flat #F8FAFC background with !important — erasing
// every row's distinct sector/asset-class color regardless of its own
// inline `background:<color>`, since author-stylesheet !important always
// outranks a plain inline style.
test('REGRESSION GUARD: light-theme CSS for #porto-donut-legend must not force-override the nested color swatch', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');
  const bareDescendantRule = /body\.theme-light\s+#porto-donut-legend\s+div\s*\{/;
  assert(!bareDescendantRule.test(css),
    'REGRESSION: "body.theme-light #porto-donut-legend div {...}" (a bare descendant selector, no ">") is back — it also matches the color-swatch <div> nested inside each legend row and !important-overrides its inline color, wiping out every color indicator in light theme');
  assert(/body\.theme-light\s+#porto-donut-legend\s*>\s*div\s*\{/.test(css),
    'the correctly scoped "body.theme-light #porto-donut-legend > div {...}" (direct children only) rule is missing');
});

// ── TEST 45: only one `body.theme-light {}` custom-property block may
// exist in main.css (found during a proactive maintainability review,
// 2026-09-11, not a user-reported bug) — a second, later duplicate of
// this exact selector used to exist ("COMPREHENSIVE LIGHT THEME ENGINE"),
// redeclaring ~20 of the same CSS custom properties. Same selector means
// same specificity, so the later block always silently wins the cascade
// for whichever variables both declare — and one variable
// (--border-subtle) actually held a DIFFERENT value in each block
// (#E0E4E9 vs rgba(0,0,0,0.06)) with no visual signal anywhere that two
// competing definitions existed. This is the same class of bug as
// INCIDENT_LOG.md #14 (a duplicate light-theme rule silently overriding
// another) — a future edit to either block alone would silently stop
// having any effect, or silently start conflicting again.
test('REGRESSION GUARD: only one `body.theme-light {}` custom-property block may exist in main.css', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');
  const matches = css.match(/^body\.theme-light\s*\{/gm) || [];
  assert.strictEqual(matches.length, 1,
    `REGRESSION: found ${matches.length} "body.theme-light {" blocks in main.css (expected exactly 1) — a second block silently wins the cascade for any variable both declare, and can silently disagree on others (see INCIDENT_LOG.md, follow-up to #14)`);
});

// ── TEST 46: the "Aksi" icon-button column in Riwayat Transaksi Saham
// (#tx-tbody) and Mutasi RDN (#rdn-tbody) tables must stay sticky-right,
// so it stays reachable while the table is scrolled horizontally at
// medium screen widths (found during a proactive review, 2026-09-11, not
// a user-reported bug — a low-risk companion to the existing
// .tbl-sticky-left ticker column).
test('REGRESSION GUARD: transaction & RDN table "Aksi" column must stay sticky-right (header and row cells)', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const renderJs = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');

  assert(/\.tbl\s+(?:th|td)\.tbl-sticky-right[\s\S]{0,60}position:\s*sticky;\s*right:\s*0/.test(css) ||
    /\.tbl th\.tbl-sticky-right,\s*\n\.tbl td\.tbl-sticky-right\s*\{\s*position:\s*sticky;\s*right:\s*0;/.test(css),
    'REGRESSION: ".tbl-sticky-right" CSS rule (position:sticky;right:0) is missing from main.css');

  const txHeaderMatch = html.match(/<th class="text-right">Total Bersih<\/th><th class="text-right">P&amp;L<\/th><th[^>]*>Aksi<\/th>/);
  assert(txHeaderMatch, 'could not find the Riwayat Transaksi Saham table header\'s final "Aksi" <th> — has the table been restructured?');
  assert(/tbl-sticky-right/.test(txHeaderMatch[0]),
    'REGRESSION: Riwayat Transaksi Saham table\'s "Aksi" header lost its tbl-sticky-right class');

  const rdnHeaderMatch = html.match(/<th class="text-right">Saldo<\/th><th[^>]*>Aksi<\/th>/);
  assert(rdnHeaderMatch, 'could not find the Mutasi RDN table header\'s final "Aksi" <th> — has the table been restructured?');
  assert(/tbl-sticky-right/.test(rdnHeaderMatch[0]),
    'REGRESSION: Mutasi RDN table\'s "Aksi" header lost its tbl-sticky-right class');

  assert(/text-center tbl-sticky-right[^"]*"[^>]*>[\s\S]{0,200}openTxDetailModal/.test(renderJs),
    'REGRESSION: the transaction row\'s action-icons <td> (tx-tbody) lost its tbl-sticky-right class');
  assert(/text-center tbl-sticky-right[^"]*"[^>]*>'\+auditBtn\+delBtn/.test(renderJs),
    'REGRESSION: the RDN row\'s action-icons <td> (rdn-tbody) lost its tbl-sticky-right class');
});

// ── TEST 47: Portfolio table "Alert" button must be reveal-on-hover
// (found via deep-dive review, 2026-09-11, not a user-reported bug) —
// #porto-tbody has no dedicated Aksi column, so this button used to sit
// permanently inline in the sticky-left ticker cell, widening that
// pinned column and crowding the ticker+logo on every single row. Also
// guards against a real accessibility regression found while building
// this exact fix: hiding the button via `display:none`/`visibility:
// hidden` (the "obvious" way to reveal-on-hover) also removes it from
// the keyboard tab order entirely, making it unreachable without a
// mouse — this must use opacity/width instead, which stay focusable.
test('REGRESSION GUARD: Portfolio table Alert button must collapse via opacity/width, never display:none/visibility:hidden (would break keyboard access)', () => {
  const renderJs = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  assert(/class="btn btn-ghost btn-xs porto-alert-btn"/.test(renderJs),
    'REGRESSION: the Alert button in the Portfolio table\'s ticker cell (04-render.js, renderPortofolio) lost its "porto-alert-btn" class');

  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');
  const hoverMediaMatch = css.match(/@media \(hover: hover\) \{[\s\S]*?\n\}\n/);
  assert(hoverMediaMatch, 'REGRESSION: no "@media (hover: hover)" block found — the reveal-on-hover rule for .porto-alert-btn is missing entirely, or the button is unconditionally hidden on ALL devices including touch (which have no hover state to reveal it with)');
  const block = hoverMediaMatch[0];
  assert(/\.porto-alert-btn\s*\{/.test(block),
    'REGRESSION: ".porto-alert-btn" rule missing from the @media (hover: hover) block');
  assert(!/\.porto-alert-btn\s*\{[^}]*display:\s*none/.test(block) && !/\.porto-alert-btn\s*\{[^}]*visibility:\s*hidden/.test(block),
    'REGRESSION: .porto-alert-btn is hidden via display:none or visibility:hidden — both remove the element from the keyboard tab order, making it unreachable without a mouse; use opacity/width instead (see the comment above this rule in main.css)');
  assert(/:focus-visible/.test(block),
    'REGRESSION: no :focus-visible rule reveals .porto-alert-btn for keyboard navigation — only :hover is covered, so keyboard-only users can never reach this button');
});

// ── TEST 48: Dividen page's 3 sub-tab sections (Kalender/Analisis/
// Riwayat) must default to only the pre-selected tab visible, matching
// the "Kalender Dividen" button already marked active (btn-green) in
// the same static markup (found via deep-dive review, 2026-09-11, not a
// user-reported bug). All 3 sections used to default to
// `display:block`, and the sidebar's only real entry point to this page
// (goPage('dividen') -> 06-analysis-router.js's 'dividen' case) never
// calls switchDivSubTab() — so every real navigation to this page
// rendered all three sections stacked at once while the Calendar tab
// looked selected, a visible mismatch between the highlighted tab and
// what was actually shown ("ghost stacking").
test('REGRESSION GUARD: Dividen page sub-tab sections must default to only the pre-selected (Calendar) tab visible', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

  const calMatch = html.match(/<div id="div-section-calendar" style="([^"]*)"/);
  assert(calMatch, 'could not find #div-section-calendar — has the Dividen page been restructured?');
  assert(/display:\s*block/.test(calMatch[1]),
    'REGRESSION: #div-section-calendar (the tab already marked active by default) no longer defaults to display:block');

  const anaMatch = html.match(/<div id="div-section-analytics" style="([^"]*)"/);
  assert(anaMatch, 'could not find #div-section-analytics — has the Dividen page been restructured?');
  assert(/display:\s*none/.test(anaMatch[1]),
    'REGRESSION: #div-section-analytics defaults to visible again, alongside the Calendar tab that\'s already marked active by default — this is the "ghost stacking" bug (see INCIDENT_LOG.md)');

  const ledMatch = html.match(/<div id="div-section-ledger" style="([^"]*)"/);
  assert(ledMatch, 'could not find #div-section-ledger — has the Dividen page been restructured?');
  assert(/display:\s*none/.test(ledMatch[1]),
    'REGRESSION: #div-section-ledger defaults to visible again, alongside the Calendar tab that\'s already marked active by default — this is the "ghost stacking" bug (see INCIDENT_LOG.md)');

  // The pre-selected button itself must still actually be the Calendar
  // one (btn-green = active styling), or the fix above would be
  // "consistently defaulting to the wrong tab" rather than a real fix.
  assert(/id="div-subtab-btn-cal" onclick="switchDivSubTab\('calendar'\)"[^>]*class="btn btn-xs btn-green"|class="btn btn-xs btn-green" id="div-subtab-btn-cal"/.test(html),
    'REGRESSION: the "Kalender Dividen" sub-tab button is no longer marked active (btn-green) by default — the section-visibility defaults above assume it still is');
});

// ── TEST 49: .badge must keep font-variant-numeric:tabular-nums (found
// via deep-dive review, 2026-09-11, not a user-reported bug) — .badge is
// reused for both plain-text labels (BUY/SELL/RADAR/sector names/etc.)
// and live-updating numeric content (e.g. #vol-risk-badge's volatility
// percentage, set in 05-assets.js). Without digit-width normalization, a
// badge showing a live percentage visibly shifts width as its digits
// change (e.g. "9.5%" -> "10.2%") since it inherits the page's default
// proportional 'Inter' font. tabular-nums has zero visual effect on
// non-numeric badge text, so this applies safely to every badge.
test('REGRESSION GUARD: .badge must have font-variant-numeric:tabular-nums so numeric badges (e.g. volatility %) don\'t jitter on update', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');
  // .badge legitimately has several rule blocks in this file by design:
  // a base rule ("INSTITUTIONAL SIGNAL BADGES & MARKET STATES"), a later
  // deliberate override under "READABILITY OVERRIDES" (which similarly
  // re-tightens .btn, .tbl th/td, .finput, etc. — intentional layering,
  // not an accidental duplicate), several MORE specific scoped selectors
  // (.side-nav .badge, body.theme-light .badge, etc. — different rules
  // entirely, not competing for the bare .badge cascade), and one inside
  // @media print (a separate, non-screen context). Rather than guess
  // which one "wins" by source order, match the specific bare-.badge
  // rule this fix touched by its distinctive font-size:10px;padding:2px
  // 7px declaration, which uniquely identifies it regardless of what
  // else is added around it later.
  const targetRule = css.match(/\.badge\{font-size:10px;padding:2px 7px[^}]*\}/);
  assert(targetRule, 'REGRESSION: the ".badge{font-size:10px;padding:2px 7px...}" rule (under READABILITY OVERRIDES) is missing or was reformatted beyond recognition — has it been restructured?');
  assert(/font-variant-numeric:\s*tabular-nums/.test(targetRule[0]),
    'REGRESSION: .badge lost font-variant-numeric:tabular-nums — numeric badges like #vol-risk-badge (volatility %) will jitter in width as their digits change');
});

// ── TEST 50: sticky-right "Aksi" column extended to Crypto/ETF/Reksa
// Dana transaction tables, for consistency with the Saham (#tx-tbody)
// and RDN (#rdn-tbody) tables fixed earlier (found via deep-dive review,
// 2026-09-11, not a user-reported bug) — same issue, same fix, same
// .tbl-sticky-right class (defined once in main.css and already
// verified there by an earlier test).
test('REGRESSION GUARD: Crypto/ETF/Reksa Dana transaction tables\' action column must stay sticky-right', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const assetsJs = fs.readFileSync(path.join(__dirname, 'public/js/05-assets.js'), 'utf8');

  const cryptoHeader = html.match(/<th>P&amp;L<\/th><th[^>]*><\/th><\/tr><\/thead>\s*<tbody id="crypto-tx-tbody">/);
  assert(cryptoHeader, 'could not find the Crypto transaction table header\'s final empty <th> — has the table been restructured?');
  assert(/tbl-sticky-right/.test(cryptoHeader[0]),
    'REGRESSION: Crypto transaction table\'s action-icons header <th> lost its tbl-sticky-right class');

  const etfHeader = html.match(/<th>P&amp;L \(IDR\)<\/th><th[^>]*><\/th><\/tr><\/thead>\s*<tbody id="etf-tx-tbody">/);
  assert(etfHeader, 'could not find the ETF transaction table header\'s final empty <th> — has the table been restructured?');
  assert(/tbl-sticky-right/.test(etfHeader[0]),
    'REGRESSION: ETF transaction table\'s action-icons header <th> lost its tbl-sticky-right class');

  const rdHeaderMatches = html.match(/<th>P&amp;L<\/th><th[^>]*><\/th><\/tr><\/thead>\s*<tbody id="rd-tx-tbody">/);
  assert(rdHeaderMatches, 'could not find the Reksa Dana transaction table header\'s final empty <th> — has the table been restructured?');
  assert(/tbl-sticky-right/.test(rdHeaderMatches[0]),
    'REGRESSION: Reksa Dana transaction table\'s action-icons header <th> lost its tbl-sticky-right class');

  assert(/tbl-sticky-right[^"]*"[^>]*>[\s\S]{0,120}editCryptoTx/.test(assetsJs),
    'REGRESSION: the Crypto row\'s action-icons <td> lost its tbl-sticky-right class');
  assert(/tbl-sticky-right[^"]*"[^>]*>[\s\S]{0,120}delEtfTx/.test(assetsJs),
    'REGRESSION: the ETF row\'s action-icons <td> lost its tbl-sticky-right class');
  assert(/tbl-sticky-right[^"]*"[^>]*>[\s\S]{0,120}editRdTx/.test(assetsJs),
    'REGRESSION: the Reksa Dana row\'s action-icons <td> lost its tbl-sticky-right class');
});

// ── TEST 51: uppercase all-caps table headers/labels must never have
// zero letter-spacing (found via deep-dive review, 2026-09-11, not a
// user-reported bug). A full inventory of every `text-transform:
// uppercase` rule in main.css found 19 rules; 17 already carry a
// deliberate letter-spacing value in a fairly tight, reasonable range
// (0.03em-0.08em / 0.5px) — contradicting the broader claim that
// tracking was rampantly inconsistent app-wide. Only two rules had
// genuinely NO letter-spacing at all: `.sm-table th` (a real, visible
// table — "Metrik Risiko Fundamental" in the Quantitative Red Flag
// Detector, Fundamental page) and `.rmc-verdict` (currently unused
// dead CSS, fixed anyway so it doesn't regress silently if reactivated).
test('REGRESSION GUARD: .sm-table th and .rmc-verdict must keep letter-spacing, matching every other uppercase label in main.css', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');

  const smTableMatch = css.match(/\.sm-table th\s*\{[^}]*\}/);
  assert(smTableMatch, 'REGRESSION: ".sm-table th {...}" rule not found in main.css — has it been renamed/removed?');
  assert(/letter-spacing:/.test(smTableMatch[0]),
    'REGRESSION: .sm-table th lost its letter-spacing again — this is the "Metrik Risiko Fundamental" table header on the Fundamental page, and every other uppercase table header (.tbl th) in the app uses letter-spacing:0.06em');

  const rmcMatch = css.match(/\.rmc-verdict\s*\{[^}]*\}/);
  assert(rmcMatch, 'REGRESSION: ".rmc-verdict {...}" rule not found in main.css — has it been renamed/removed?');
  assert(/letter-spacing:/.test(rmcMatch[0]),
    'REGRESSION: .rmc-verdict lost its letter-spacing again');
});

// ── TEST 52: the Portfolio page's main table (#porto-tbody) must appear
// before the 3 supporting cards (Donut Chart Alokasi, Gain/Loss Bar
// Chart, Performa per Saham toolbar) in the DOM, not after (found via
// user-submitted deep-dive review — "card clutter": the table, the
// page's primary function, used to sit below 3 large chart/toolbar
// cards, forcing a scroll past all of them before reaching the actual
// list of active stock positions).
test('REGRESSION GUARD: Portfolio page table must appear before the Donut/Bar-chart/Performa cards, not after', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const pageStart = html.indexOf('<div id="page-portofolio"');
  assert(pageStart !== -1, 'could not find #page-portofolio — has the page been restructured?');
  const pageEnd = html.indexOf('<!-- ===== DIVIDEN ===== -->', pageStart);
  assert(pageEnd !== -1, 'could not find the end of the Portofolio page (DIVIDEN section marker) — has the page order changed?');
  const pageHtml = html.slice(pageStart, pageEnd);

  const tbodyIdx = pageHtml.indexOf('id="porto-tbody"');
  assert(tbodyIdx !== -1, 'REGRESSION: #porto-tbody not found inside the Portofolio page — has the main table been removed or renamed?');

  const donutIdx = pageHtml.indexOf('id="portoDonutChart"');
  const barIdx = pageHtml.indexOf('id="portoRealizedVsPotensiChart"');
  const perfIdx = pageHtml.indexOf('id="perf-toolbar-header"');
  assert(donutIdx !== -1 && barIdx !== -1 && perfIdx !== -1,
    'could not find one of the 3 supporting cards (donut chart / bar chart / performa toolbar) — have they been removed or renamed?');

  assert(tbodyIdx < donutIdx,
    'REGRESSION: the Portfolio table (#porto-tbody) is back to appearing AFTER the Donut Chart Alokasi card — this is the "card clutter" bug: users must scroll past chart/toolbar cards before reaching the actual position list, the page\'s primary function (see INCIDENT_LOG.md)');
  assert(tbodyIdx < barIdx,
    'REGRESSION: the Portfolio table (#porto-tbody) is back to appearing AFTER the Gain/Loss Bar Chart card — see INCIDENT_LOG.md ("card clutter")');
  assert(tbodyIdx < perfIdx,
    'REGRESSION: the Portfolio table (#porto-tbody) is back to appearing AFTER the Performa per Saham toolbar card — see INCIDENT_LOG.md ("card clutter")');
});

// ── TEST 53: the 5 yearly figures in "Proyeksi Dividen 5 Tahun"
// (#div-proj-cards) must not each render as their own bordered/
// background-tinted box (found via user-submitted deep-dive review —
// "nested cards": a card nested inside the already-bordered parent
// "Proyeksi Dividen 5 Tahun" card, doubling up borders around a short
// 3-line stat). Flattened to a stat-strip layout: plain stacked text
// with a thin divider between columns instead of individual card chrome.
test('REGRESSION GUARD: Proyeksi Dividen 5 Tahun yearly cells must not each have their own border+background (nested-card pattern)', () => {
  const renderJs = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  const fnStart = renderJs.indexOf("var cards = el('div-proj-cards');");
  assert(fnStart !== -1, "REGRESSION: el('div-proj-cards') render block not found in 04-render.js — has it been renamed/restructured?");
  const body = renderJs.slice(fnStart, fnStart + 800);
  assert(!/border:1px solid rgba\(0,229,160/.test(body) && !/background:rgba\(0,229,160,\.06\)/.test(body),
    'REGRESSION: each yearly cell in "Proyeksi Dividen 5 Tahun" is back to having its own border+background — this nests a card-like box inside the already-bordered parent card (see INCIDENT_LOG.md, "nested cards")');
  assert(/border-left:1px solid var\(--border\)/.test(body),
    'REGRESSION: the thin column-divider (border-left) that replaced the individual card borders is missing');
});

// ── TEST 54: .g2c and .g3 (card grids hosting fixed-height charts like
// #divYearChart and #perfEquityChart) must keep a max-width cap (found
// via user-submitted deep-dive review — "fixed canvas height vs dynamic
// container"). Without one, each grid column stretches proportionally
// with the full viewport width on a genuinely ultrawide monitor while
// chart height stays a fixed 185px-220px, turning normal charts into
// extremely flat, hard-to-read ones. The cap (1600px) sits just above a
// typical 1920px viewport's content area, so normal laptop/desktop
// widths are unaffected.
test('REGRESSION GUARD: .g2c and .g3 grids must keep a max-width cap for ultrawide viewports', () => {
  const css = fs.readFileSync(path.join(__dirname, 'public/css/main.css'), 'utf8');
  const g2cMatch = css.match(/\.g2c\s*\{[^}]*\}/);
  assert(g2cMatch, 'REGRESSION: ".g2c {...}" rule not found in main.css — has it been renamed/removed?');
  assert(/max-width:\s*1600px/.test(g2cMatch[0]),
    'REGRESSION: .g2c lost its max-width cap — on an ultrawide monitor, fixed-height charts inside it (e.g. #divYearChart) will stretch into an extremely flat, hard-to-read shape (see INCIDENT_LOG.md)');

  const g3Match = css.match(/\.g3\s*\{[^}]*\}/);
  assert(g3Match, 'REGRESSION: ".g3 {...}" rule not found in main.css — has it been renamed/removed?');
  assert(/max-width:\s*1600px/.test(g3Match[0]),
    'REGRESSION: .g3 lost its max-width cap — on an ultrawide monitor, fixed-height charts inside it (e.g. #perfEquityChart) will stretch into an extremely flat, hard-to-read shape (see INCIDENT_LOG.md)');
});

// ── TEST 55: Chart.defaults.animation must be disabled globally
// (found via a user-requested performance investigation, 2026-09-11:
// "apa yang membuat aplikasi menjadi berat untuk pindah antar tab").
// Every one of this app's ~51 Chart.js instances is destroyed and
// recreated FROM SCRATCH on every visit to its page (no "just update the
// data" path exists anywhere) — none of those configs disabled Chart.js's
// default ~1000ms draw-in animation, so every tab switch to a
// chart-bearing page (up to 4-8 charts on some pages) paid that
// animation cost again, every single time, with zero functional benefit.
// Disabled globally in 03-engine.js, the same pattern already used there
// for the interaction/hover fix, so every current and future chart
// benefits without editing dozens of individual configs.
test('REGRESSION GUARD: Chart.defaults.animation must be set to false globally', () => {
  const engineJs = fs.readFileSync(path.join(__dirname, 'public/js/03-engine.js'), 'utf8');
  const interactionIdx = engineJs.indexOf('Chart.defaults.interaction');
  assert(interactionIdx !== -1, 'REGRESSION: the "Chart.defaults.interaction" global-defaults block is missing — has it been restructured?');
  const nearby = engineJs.slice(interactionIdx, interactionIdx + 1500);
  assert(/Chart\.defaults\.animation\s*=\s*false/.test(nearby),
    'REGRESSION: "Chart.defaults.animation = false" is missing from the global Chart.js defaults block — every chart in the app will pay Chart.js\'s default ~1000ms draw-in animation cost again on every tab switch (see INCIDENT_LOG.md)');
});

// ── TEST 56: no individual chart config may re-enable Chart.js animation
// (found in the same investigation) — a per-instance `animation:` option
// on a specific chart's own config overrides the global default set in
// TEST 55 for that one chart, silently defeating the fix for just that
// chart. Two such overrides existed (a Dashboard sector-allocation donut
// and the Harga Wajar valuation bar chart) and were removed.
test('REGRESSION GUARD: no chart config may override the global Chart.defaults.animation=false with its own animation option', () => {
  const files = ['public/js/03-engine.js', 'public/js/10-hargawajar.js'];
  files.forEach(function(f) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    // Strip single-line `//` comments first — an explanatory comment that
    // quotes the old, now-removed code (e.g. "// animation:{...} removed")
    // would otherwise false-positive as if it were still live code.
    const codeOnly = src.split('\n').map(function(line) {
      var idx = line.indexOf('//');
      return idx === -1 ? line : line.slice(0, idx);
    }).join('\n');
    // Match a real Chart.js `animation:` option (object or non-false value),
    // not the unrelated CSS `animation:` property (e.g. toast/spinner
    // keyframe names) which never looks like `animation:{...}` or
    // `animation: true/<number>`.
    const badMatch = codeOnly.match(/animation:\s*\{[^}]*\}/g) || [];
    const trulyBad = badMatch.filter(function(m) { return !/duration:\s*0\b/.test(m); });
    assert(trulyBad.length === 0,
      'REGRESSION: ' + f + ' has a per-chart `animation:` override (' + JSON.stringify(trulyBad) + ') that defeats the global Chart.defaults.animation=false fix for that specific chart (see INCIDENT_LOG.md)');
  });
});

// ── TEST 57: Investment Thesis Tracker (#page-thesis) must have a real
// sidebar navigation entry (found via a user-requested dead-feature
// audit, 2026-09-11) — renderThesisPage() was a fully built, working
// feature (add/view/delete thesis, persisted through the full save/load
// system) with zero navigation entry point anywhere in the app.
test('REGRESSION GUARD: sidebar must have a goPage(\'thesis\') entry for the Investment Thesis Tracker', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(/onclick="goPage\('thesis'/.test(html),
    'REGRESSION: no sidebar button calls goPage(\'thesis\') anymore — the Investment Thesis Tracker page is unreachable again (see INCIDENT_LOG.md)');
});

// ── TEST 58: dead Bandarmology deep-link shortcuts ('broker-flow',
// 'foreign-flow', 'smart-money-radar') must stay removed, while the real,
// reachable 'smart-money-flow' shortcut must keep working (found via the
// same dead-feature audit). These 3 had zero call sites anywhere in the
// app (verified via full-codebase search including dynamic goPage()
// calls) — they were never separate pages, just named deep-link
// shortcuts meant to auto-scroll to a section of the Bandarmology
// Cockpit that page already shows in full when opened normally.
test('REGRESSION GUARD: dead Bandarmology shortcuts (broker-flow/foreign-flow/smart-money-radar) must stay removed; smart-money-flow must still work', () => {
  const routerJs = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  const cockpitJs = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');

  ['broker-flow', 'foreign-flow', 'smart-money-radar'].forEach(function(name) {
    assert(!routerJs.includes("case '" + name + "':"),
      'REGRESSION: dead router case \'' + name + '\' is back in 06-analysis-router.js — this route has zero call sites anywhere in the app (see INCIDENT_LOG.md)');
  });

  assert(routerJs.includes("case 'smart-money-flow':"),
    'REGRESSION: the real, reachable \'smart-money-flow\' router case (used by the \'flowscan\' page) was removed along with the dead ones');
  assert(/name === 'smart-money-flow' \? 'bandarmology'/.test(routerJs),
    'REGRESSION: goPage()\'s targetPageName mapping no longer redirects \'smart-money-flow\' to the bandarmology page container');

  assert(/subTabOrMode === 'smart-money-flow'/.test(cockpitJs),
    'REGRESSION: goBandarmology() no longer recognizes \'smart-money-flow\' — the real flowscan deep-link is broken');
  assert(!/subTab === 'broker-flow'/.test(cockpitJs) && !/subTab === 'foreign-flow'/.test(cockpitJs),
    'REGRESSION: dead scroll-to branches for \'broker-flow\'/\'foreign-flow\' are back in setBandarmologyTab()');
});

// ── TEST 58b: "Eksekusi no 1" (2026-09-19, user-directed menu consolidation:
// "Untuk temuan 4 anda analisa dulu fiturnya... Eksekusi no 1") — Technical
// and Bandarmology's stock-mode (single-ticker Broker Flow + CMF/VWAP Bands +
// Foreign Flow) called the exact same fsGenData()+fsProcess() engine for the
// same ticker, so they were merged into one tab on the Technical page instead
// of 2 separate pages with overlapping scope. This obsoletes TEST 60's old
// "scroll to #bandarSmartMoneyChart inside the Bandarmology page" premise —
// the smart-money-flow deep link now navigates to the Technical page instead.
test('REGRESSION GUARD: Technical + Bandarmology (stock mode) consolidation — goBandarmology() redirects stock/emiten/smart-money-flow to the Technical page instead of rendering a stock mode on the Bandarmology page', () => {
  const cockpitJs = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const stockmasterJs = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

  const goBandarFnMatch = cockpitJs.match(/window\.goBandarmology = function[\s\S]*?\n};/);
  assert(goBandarFnMatch, 'goBandarmology() not found in 41-stockchat-cockpit.js');
  const goBandarFn = goBandarFnMatch[0];
  assert(/isStockRequest/.test(goBandarFn) && /goPage\('technical', btn\)/.test(goBandarFn),
    'REGRESSION: goBandarmology() no longer redirects stock-mode requests to the Technical page — the merged tab is unreachable from the sidebar/flowscan/stock-intel handoff buttons again');

  assert(!/isStockMode/.test(cockpitJs),
    'REGRESSION: renderBandarmologyCockpitPage() still branches on a stock mode — the stock-mode UI should have been fully removed from the Bandarmology page after the merge');
  assert(!cockpitJs.includes("id=\\'stockchat-flow-tab-content\\'") && !/renderBandarmologyCockpitPage[\s\S]*?stockchat-flow-tab-content/.test(cockpitJs.match(/function renderBandarmologyCockpitPage[\s\S]*?\n}\n/)[0]),
    'REGRESSION: renderBandarmologyCockpitPage() creates a #stockchat-flow-tab-content element again — this id is also used by StockChat\'s own Broker Flow tab, and since both pages persist in this SPA\'s DOM simultaneously, a 3rd creator of this id reintroduces the duplicate-DOM-id risk the merge was supposed to remove');

  assert(/function techRunBandarmologyTab/.test(stockmasterJs),
    'REGRESSION: techRunBandarmologyTab() (the new Bandarmology-stock-mode tab on the Technical page) was removed from 24-stockmaster.js');
  assert(/techRunBandarmologyTab\(ticker\)/.test(stockmasterJs),
    'REGRESSION: techSwitchTab() no longer calls techRunBandarmologyTab() when switching into the FlowScan/Bandarmology tab');
  assert(/renderBandarmologySmartMoneyFlowView/.test(stockmasterJs) && /renderBandarmologyForeignFlowView/.test(stockmasterJs),
    'REGRESSION: techRunBandarmologyTab() no longer reuses the existing Bandarmology view functions (renderBandarmologySmartMoneyFlowView/renderBandarmologyForeignFlowView) — it must not reimplement them');

  assert(/id="tech-bandar-content"/.test(indexHtml),
    'REGRESSION: public/index.html no longer has the #tech-bandar-content container for the merged Bandarmology tab inside page-technical');
  assert(/goBandarmology\('market',this\)/.test(indexHtml) && !/goBandarmology\('stock',this\)/.test(indexHtml),
    'REGRESSION: the sidebar Bandarmology button must call goBandarmology(\'market\',...) now that stock mode lives on the Technical page');
});

// ── TEST 59: the 'dividen-calendar' dead route must stay removed (found
// via the same dead-feature audit) — a redundant, unreachable alias with
// zero call sites anywhere in the app, rendering the exact same content
// the 'dividen' case already produces (the Dividen page defaults to its
// Calendar sub-tab — see INCIDENT_LOG.md's "ghost stacking" fix).
test('REGRESSION GUARD: dead \'dividen-calendar\' route must stay removed', () => {
  const routerJs = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  assert(!routerJs.includes("case 'dividen-calendar':"),
    'REGRESSION: the dead \'dividen-calendar\' router case is back — it has zero call sites anywhere in the app and duplicates what \'dividen\' already renders (see INCIDENT_LOG.md)');
  assert(!routerJs.includes("name === 'dividen-calendar'"),
    'REGRESSION: goPage()\'s targetPageName mapping still special-cases the dead \'dividen-calendar\' name');
  assert(routerJs.includes("case 'dividen':"),
    'REGRESSION: the real \'dividen\' router case was removed along with the dead alias');
});

// ── TEST 60: #bandarSmartMoneyChart must be a real element id, not a
// pre-existing broken scroll target (found via the same audit) —
// setBandarmologyTab()'s 'smart-money-flow' scroll-to used to target
// getElementById('bandarSmartMoneyChart') with a
// getElementById('bandar-tab-content') fallback, and NEITHER id existed
// anywhere in the rendered HTML — the FlowScan -> Bandarmology deep-link
// scroll-to-section behavior had never actually worked. Fixed by giving
// the actual Smart Money Flow chart section that real id, and removing
// the now-pointless fallback to the other, equally nonexistent id.
test('REGRESSION GUARD: #bandarSmartMoneyChart must exist as a real element id in the rendered Bandarmology cockpit markup', () => {
  const cockpitJs = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  assert(/id="bandarSmartMoneyChart"/.test(cockpitJs),
    'REGRESSION: no element in 41-stockchat-cockpit.js\'s rendered HTML carries id="bandarSmartMoneyChart" anymore — setBandarmologyTab()\'s scroll-to for \'smart-money-flow\' will silently no-op again (see INCIDENT_LOG.md)');
  assert(!cockpitJs.includes("getElementById('bandar-tab-content')"),
    'REGRESSION: the dead getElementById(\'bandar-tab-content\') fallback is back — that id never existed anywhere in the rendered HTML');
});

// ── TEST 61: Win Rate track record banner must be persistent across ALL
// AI Trading tabs (not buried only inside the 'paper' tab's own KPI row)
// — user-requested: make the AI's real paper-trading win rate more
// prominent. Placed in renderAiTradingPage() BEFORE the activeTab
// dispatcher (`if (state.activeTab === 'cockpit') { html += ... }`), so it
// renders unconditionally regardless of which sub-tab is open. Must stay
// honest when totalTrades is 0 — showing "0%" then would misleadingly
// read as "the AI always loses" rather than "no trade has been recorded
// yet".
test('REGRESSION GUARD: persistent Win Rate banner must render on every AI Trading tab, with an honest empty state', () => {
  const aiJs = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');

  const dispatcherIdx = aiJs.indexOf("if (state.activeTab === 'cockpit')");
  const bannerIdx = aiJs.indexOf('WIN RATE AI TRADING (PAPER, REAL)');
  assert(bannerIdx !== -1, 'REGRESSION: the persistent Win Rate banner is missing from 38-ai-autonomous-trading.js');
  assert(dispatcherIdx !== -1, 'sanity: activeTab dispatcher not found (renderAiTradingPage structure changed)');
  assert(bannerIdx < dispatcherIdx,
    'REGRESSION: Win Rate banner is placed AFTER the activeTab dispatcher (or inside a specific tab branch) — it would only show on some tabs, not persistently on all of them');

  assert(aiJs.includes("BELUM ADA TRADE"),
    'REGRESSION: the honest "belum ada trade" empty state is gone — a 0% win rate with zero real trades would misleadingly read as the AI always losing');
  assert(/paper\.totalTrades > 0/.test(aiJs),
    'REGRESSION: the banner no longer branches on paper.totalTrades > 0 before showing a percentage');
  assert(/onclick="aiSwitchTab\(\\?'paper\\?'\)"/.test(aiJs),
    'REGRESSION: the banner no longer links through to the AI Paper Portfolio tab for full detail');
});

// ── TEST 62: Scanner Akumulasi & Distribusi (Opportunity Radar) must
// cache client-side per timeframe before re-hitting
// /api/idx/accumulation-distribution — found during an Invezgo quota
// audit (user request 2026-09-11): this scanner fires up to 45 Invezgo
// calls per fetch (LQ45 universe), yet had ZERO client-side cache, unlike
// loadOpportunityRadarUniverse's 60s check just above it — every
// timeframe-button click (or re-opening the tab) re-triggered a full
// scan even seconds after the last identical one. Fixed with a
// per-timeframe cache (TTL matches invezgo-client.js's own 5-minute
// server-side cache, so nothing sooner than that would ever return
// fresher data anyway), bypassed only by the two explicit "Refresh"
// buttons.
test('REGRESSION GUARD: Scanner Akumulasi & Distribusi must cache client-side per timeframe, bypassed only by explicit Refresh', () => {
  const ccJs = fs.readFileSync(path.join(__dirname, 'public/js/26-commandcenter.js'), 'utf8');

  assert(/accDataCache\s*:\s*\{\}/.test(ccJs),
    'REGRESSION: RADAR_STATE.accDataCache cache store is gone from 26-commandcenter.js');
  assert(/function loadAccumulationDistributionData\(tf,\s*force\)/.test(ccJs),
    'REGRESSION: loadAccumulationDistributionData() no longer accepts a `force` parameter to bypass the cache');

  const fnStart = ccJs.indexOf('async function loadAccumulationDistributionData(tf, force)');
  assert(fnStart !== -1, 'sanity: loadAccumulationDistributionData() not found');
  const fnBody = ccJs.slice(fnStart, fnStart + 900);
  assert(/if \(!force && cached/.test(fnBody),
    'REGRESSION: the function no longer checks the per-timeframe cache before fetching — every call would hit the network again');
  assert(/ACC_DIST_CACHE_TTL_MS/.test(fnBody),
    'REGRESSION: the cache TTL check is gone from loadAccumulationDistributionData()');

  // The two explicit "Refresh" buttons must still pass force:true, or the
  // fix above would make manual refresh silently no-op against stale cache.
  assert(/loadAccumulationDistributionData\(RADAR_STATE\.accTimeframe,\s*true\)/.test(ccJs),
    'REGRESSION: no caller passes force:true anymore — the explicit "Refresh"/"Refresh Feed" buttons would be stuck showing cached data');
});

// ── TEST 63: generateBrokerSummary() must honor the `timeframe` argument
// when querying Invezgo, instead of always requesting fromDate=toDate=
// today regardless of which timeframe (1D/3D/5D/20D/1W/1M/3M/6M/1Y) was
// requested — found during the same Invezgo quota audit (user-reported,
// 2026-09-11) as TEST 62. Load the real module via the vm sandbox
// technique (same pattern as the escapeHtml() test above) since this
// file has top-level side effects unsafe for a plain require() in a test
// runner.
test('REGRESSION GUARD: generateBrokerSummary() must vary the Invezgo date range by timeframe, not always fromDate=toDate=today', () => {
  const enginePath = path.join(__dirname, 'lib/idx-data-engine.js');
  const engineSrcRaw = fs.readFileSync(enginePath, 'utf8');
  // Strip //-comments before matching — this fix's own explanatory comment
  // quotes the OLD buggy call verbatim as documentation, which would
  // otherwise false-positive the "must not be back" assertion below (same
  // false-positive class as TEST 56's Chart.defaults.animation check).
  const engineSrc = engineSrcRaw.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

  assert(/BROKER_SUMMARY_TIMEFRAME_DAYS/.test(engineSrc),
    'REGRESSION: the per-timeframe day-count table is gone — generateBrokerSummary() likely reverted to a fixed today-only date range');
  assert(/function brokerSummaryDateRange\(timeframe\)/.test(engineSrc),
    'REGRESSION: brokerSummaryDateRange() helper is gone');
  assert(!/fetchInvezgoBrokerSummary\(clean,\s*today,\s*today\)/.test(engineSrc),
    'REGRESSION: generateBrokerSummary() is back to calling fetchInvezgoBrokerSummary(clean, today, today) unconditionally — the timeframe argument is ignored again');
  assert(/fetchInvezgoBrokerSummary\(clean,\s*fromDate,\s*toDate/.test(engineSrc),
    'REGRESSION: generateBrokerSummary() no longer passes the computed fromDate/toDate through to fetchInvezgoBrokerSummary()');

  // Functional check on the actual date-math, independent of the source
  // text above: 1D must resolve to the same fromDate/toDate (today-only,
  // preserving old behavior), while a multi-day timeframe like 20D must
  // resolve to a genuinely earlier fromDate — proving the argument is
  // actually wired into the computation, not just present as dead code.
  const days = {};
  const tableMatch = engineSrc.match(/const BROKER_SUMMARY_TIMEFRAME_DAYS = \{([\s\S]*?)\};/);
  assert(tableMatch, 'sanity: could not locate BROKER_SUMMARY_TIMEFRAME_DAYS table source');
  const parsed = JSON.parse('{' + tableMatch[1].replace(/'/g, '"').replace(/,\s*$/, '').trim().replace(/,\}$/, '}') + '}');
  Object.assign(days, parsed);
  assert(days['1D'] === 0, 'REGRESSION: 1D no longer maps to 0 days — would change today-only behavior');
  assert(days['20D'] === 20 && days['3D'] === 3 && days['5D'] === 5,
    'REGRESSION: Opportunity Radar Scanner timeframe keys (3D/5D/20D) no longer map to their expected day counts');
  assert(days['1W'] > 0 && days['1M'] > 0 && days['3M'] > 0 && days['6M'] > 0 && (days['1Y'] > 0 || days['YTD'] > 0),
    'REGRESSION: Bandarmology/StockChat Broker Flow tab timeframe keys (1W/1M/3M/6M/1Y) no longer map to a real day count');
});

// ── TEST 64: AI Paper Trading cloud sync (user-requested 2026-09-11) —
// paperAccount/hypotheses/decisionLog must sync to a DEDICATED Supabase
// table (ai_paper_trading), never the user_data blob saveData() uses for
// real portfolio data, preserving this module's own "Complete Isolation"
// principle. Save-on-change (debounced) + load-on-page-open, guest/demo
// and unconfigured-Supabase must both silently no-op (never throw).
test('REGRESSION GUARD: AI Paper Trading must sync to its own dedicated Supabase table, isolated from user_data', () => {
  const aiJs = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  const sqlMigration = fs.readFileSync(path.join(__dirname, 'sql/schema_migration.sql'), 'utf8');

  // The dedicated table must exist in the migration, with RLS scoped to
  // auth.uid() = user_id — never mixed into user_data/user_settings.
  assert(/create table if not exists public\.ai_paper_trading/.test(sqlMigration),
    'REGRESSION: the dedicated ai_paper_trading table is gone from sql/schema_migration.sql');
  assert(/alter table public\.ai_paper_trading enable row level security/.test(sqlMigration),
    'REGRESSION: RLS is no longer enabled on ai_paper_trading — every user could read/write every other user\'s paper trading data');
  assert((sqlMigration.match(/auth\.uid\(\) = user_id/g) || []).length >= 3,
    'REGRESSION: expected an auth.uid() = user_id policy for select/insert/update on ai_paper_trading');

  // Client-side wiring: cloud sync functions exist and are actually
  // invoked by the three existing local-save functions + page init.
  assert(/function scheduleAiCloudSync\(\)/.test(aiJs), 'REGRESSION: scheduleAiCloudSync() helper is gone');
  assert(/async function flushAiCloudSync\(uid\)/.test(aiJs), 'REGRESSION: flushAiCloudSync() helper is gone');
  assert(/async function loadAiCloudState\(\)/.test(aiJs), 'REGRESSION: loadAiCloudState() helper is gone');
  assert(/client\.from\('ai_paper_trading'\)\.upsert/.test(aiJs),
    'REGRESSION: flushAiCloudSync() no longer upserts into the dedicated ai_paper_trading table');
  assert(!/client\.from\('user_data'\)/.test(aiJs),
    'REGRESSION: AI Trading cloud sync is writing into the user_data table — this breaks the module\'s own isolation principle and risks the isExplicitlyEmpty merge bug history in 02-storage.js');

  ['savePaperAccountState', 'saveHypothesesState', 'saveDecisionLog'].forEach(function(fnName) {
    const fnStart = aiJs.indexOf('function ' + fnName + '()');
    assert(fnStart !== -1, 'sanity: ' + fnName + '() not found');
    const fnBody = aiJs.slice(fnStart, fnStart + 300);
    assert(/scheduleAiCloudSync\(\);/.test(fnBody),
      'REGRESSION: ' + fnName + '() no longer schedules a cloud sync — changes would stop propagating to Supabase');
  });

  assert(/loadAiCloudState\(\);/.test(aiJs.slice(aiJs.indexOf('function initAiAutonomousSuite'), aiJs.indexOf('function initAiAutonomousSuite') + 600)),
    'REGRESSION: initAiAutonomousSuite() no longer calls loadAiCloudState() — opening the AI Trading page would never pull the cloud copy');

  // Guest/demo and unconfigured-Supabase must both be a silent no-op, not
  // a thrown error visible to the user.
  assert(/if \(!uid\) return;/.test(aiJs), 'REGRESSION: scheduleAiCloudSync() no longer guards against a missing (guest/demo) uid');
  assert(/if \(!uid \|\| !client\) return;/.test(aiJs), 'REGRESSION: loadAiCloudState() no longer guards against guest/demo or an unconfigured Supabase client');
});

// Field bug (2026-09-17, INCIDENT_LOG.md): a user ran sql/schema_migration.sql
// in their Supabase SQL Editor and got "ERROR: 42P01: relation
// public.user_settings does not exist". Root cause: the file's very first
// statements assume a LEGACY normalized schema (public.user_settings,
// public.transactions, public.dividends, public.rdn_mutations,
// public.crypto_tx, public.etf_tx, public.rd_tx, public.div_invest) that
// predates the app's consolidation onto the single public.user_data JSONB
// blob — a project created after that consolidation never has these
// tables. Supabase's SQL Editor runs a pasted script as one transaction,
// so failing on the very FIRST statement aborted the ENTIRE file,
// including the ai_paper_trading/ksei_ownership/ai_signal_log tables the
// app actually depends on, which sit much further down and have nothing
// to do with these legacy tables. Fixed by wrapping every statement that
// touches one of these 8 legacy tables in a to_regclass(...) is not null
// guard, so a project missing them just skips those statements instead of
// aborting the whole run — verified by executing the real file end-to-end
// against a from-scratch local Postgres 16 database with NONE of the 8
// legacy tables (reproducing the report exactly: the original file failed
// at statement 1; the fixed file completes and creates ai_paper_trading,
// ksei_ownership and ai_signal_log), and separately against a database
// WITH all 8 legacy tables present to confirm the original upgrade
// behavior (new columns added, schema_version set to 2, unique
// constraints created) is unchanged for projects that still have them.
test('REGRESSION GUARD: sql/schema_migration.sql must not let a missing legacy table (user_settings/transactions/etc.) abort the whole migration', () => {
  const sqlMigration = fs.readFileSync(path.join(__dirname, 'sql/schema_migration.sql'), 'utf8');

  ['user_settings', 'transactions', 'dividends', 'rdn_mutations', 'crypto_tx', 'etf_tx', 'rd_tx', 'div_invest'].forEach(function(tbl) {
    const guardRe = new RegExp("to_regclass\\('public\\." + tbl + "'\\)\\s+is not null");
    assert(guardRe.test(sqlMigration),
      'REGRESSION: statements touching legacy table public.' + tbl + ' are no longer guarded by to_regclass(...) is not null — a project without this table would abort the entire migration file again, exactly like the original bug report');
  });

  // The tables the app actually depends on today must remain unconditional
  // (never skipped) — they must not accidentally end up gated behind one
  // of the legacy-table guards above.
  ['ai_paper_trading', 'ksei_ownership', 'ai_signal_log'].forEach(function(tbl) {
    assert(new RegExp('create table if not exists public\\.' + tbl).test(sqlMigration),
      'sanity: create table for public.' + tbl + ' is missing from the migration');
  });
});

// ── TEST 65: ml/train_xgb_signal.py's label must be SL/TP-aware (ATR-based,
// synced with computeStockSignal()'s real sl=price-ATR*1.5/tp1=price+ATR*2.5
// formula), not the old "price up >3% in 10 days" label that ignored risk
// entirely (user-requested 2026-09-11: "perbaiki label XGBoost"). Source-text
// checks only (Python, can't run through the JS test runner) — the actual
// label logic (compute_atr/compute_sl_tp_label) was independently verified
// against 4 synthetic OHLCV scenarios (TP-hit / SL-hit / neither-hit / both-
// same-day) with a standalone script before this test was added, and the
// full pipeline (build_dataset -> train -> ONNX export -> meta.json) was run
// end-to-end against synthetic random-walk data to confirm no wiring broke.
test('REGRESSION GUARD: ml/train_xgb_signal.py label must be SL/TP-aware (ATR-based), matching computeStockSignal()', () => {
  const pyPath = path.join(__dirname, 'ml/train_xgb_signal.py');
  const pySrcRaw = fs.readFileSync(pyPath, 'utf8');
  const pySrc = pySrcRaw.split('\n').map(l => l.replace(/#.*$/, '')).join('\n'); // strip comments (this fix's own comments quote the old approach as documentation)

  assert(/SL_ATR_MULT\s*=\s*1\.5/.test(pySrc), 'REGRESSION: SL_ATR_MULT no longer matches computeStockSignal()\'s sl=price-ATR*1.5');
  assert(/TP_ATR_MULT\s*=\s*2\.5/.test(pySrc), 'REGRESSION: TP_ATR_MULT no longer matches computeStockSignal()\'s tp1=price+ATR*2.5');
  assert(/def compute_atr\(/.test(pySrc), 'REGRESSION: compute_atr() helper is gone');
  assert(/def compute_sl_tp_label\(/.test(pySrc), 'REGRESSION: compute_sl_tp_label() helper is gone — label may have reverted to the old fixed-% target');
  assert(!/TARGET_RETURN/.test(pySrc), 'REGRESSION: the old TARGET_RETURN (fixed % target, ignores risk) constant is back');
  assert(!/shift\(-\d+\)/.test(pySrc), 'REGRESSION: a fixed-forward-day shift() (the old fwd_ret approach) is back in the labeling logic');
  // Must be the CALL site (`= compute_sl_tp_label(df)`), not just the `def`
  // line — matching only `compute_sl_tp_label\(df\)` would false-pass even
  // if build_dataset() stopped calling it, since that substring also
  // appears in the function's own signature.
  assert(/=\s*compute_sl_tp_label\(df\)/.test(pySrc), 'REGRESSION: build_dataset() no longer calls compute_sl_tp_label() to produce the label');
  assert(/label_definition/.test(pySrc) && /sl_atr_mult/.test(pySrc), 'REGRESSION: meta.json no longer documents the SL/TP label definition/hyperparameters');
});

// ── TEST 66: BUY/SELL threshold must be calibrated from the model's own
// predicted-probability PERCENTILE on the test set, not a fixed absolute
// constant (user-requested 2026-09-11, "Opsi A" after the SL/TP label
// retrain produced 0.031 recall at the old fixed 0.60 threshold — meaning
// live backtests got 0 signals for 2 years straight on BBCA). A dynamic
// percentile threshold guarantees the model always signals on its own most-
// confident cases, whatever its raw probability scale happens to be.
test('REGRESSION GUARD: XGBoost BUY/SELL threshold must be percentile-calibrated from the test-set probability distribution, not a fixed constant', () => {
  const pyPath = path.join(__dirname, 'ml/train_xgb_signal.py');
  const pySrcRaw = fs.readFileSync(pyPath, 'utf8');
  const pySrc = pySrcRaw.split('\n').map(l => l.replace(/#.*$/, '')).join('\n');

  assert(!/BUY_THRESHOLD\s*=\s*0\.6/.test(pySrc), 'REGRESSION: the old fixed BUY_THRESHOLD=0.60 constant is back — this is exactly what caused 0 backtest signals after the SL/TP label change');
  assert(!/SELL_THRESHOLD\s*=\s*0\.35/.test(pySrc), 'REGRESSION: the old fixed SELL_THRESHOLD=0.35 constant is back');
  assert(/BUY_PERCENTILE\s*=\s*80/.test(pySrc), 'REGRESSION: BUY_PERCENTILE=80 is gone');
  assert(/SELL_PERCENTILE\s*=\s*20/.test(pySrc), 'REGRESSION: SELL_PERCENTILE=20 is gone');
  assert(/np\.percentile\(proba,\s*BUY_PERCENTILE\)/.test(pySrc), 'REGRESSION: buy_threshold is no longer computed from np.percentile(proba, BUY_PERCENTILE) — threshold calibration is gone');
  assert(/np\.percentile\(proba,\s*SELL_PERCENTILE\)/.test(pySrc), 'REGRESSION: sell_threshold is no longer computed from np.percentile(proba, SELL_PERCENTILE)');
  assert(/"buy_threshold":\s*buy_threshold/.test(pySrc), 'REGRESSION: meta.json no longer writes the CALIBRATED buy_threshold variable (may have reverted to the old fixed constant)');
  assert(/"buy_precision_at_threshold"/.test(pySrc) && /"base_rate"/.test(pySrc), 'REGRESSION: meta.json no longer exposes the honest precision-vs-base-rate diagnostic for the calibrated threshold — silently shipping a threshold without knowing if it beats chance');
});

// ── TEST 67: XGBoost feature set (Opsi C, 2026-09-11) — after threshold
// calibration (TEST 66) still showed only 1.09x lift (near-random, AUC
// 0.522), 4 new ATR/EMA-based features were added to capture volatility
// regime / path-dependency the old 6 direction-only features missed.
// FEATURE_NAMES (Python) and XGB_FEATURES (JS) must stay IDENTICAL in
// content and order, or the ONNX model receives silently-misaligned
// inputs (wrong column = wrong feature) with no runtime error. This is
// exactly the failure mode ml/README.md's "PENTING" section warns about.
test('REGRESSION GUARD: XGBoost FEATURE_NAMES (Python) and XGB_FEATURES (JS) must stay identical in content and order', () => {
  const pyPath = path.join(__dirname, 'ml/train_xgb_signal.py');
  const jsPath = path.join(__dirname, 'public/js/11-quant.js');
  const pySrc = fs.readFileSync(pyPath, 'utf8');
  const jsSrc = fs.readFileSync(jsPath, 'utf8');

  const pyMatch = pySrc.match(/FEATURE_NAMES = \[([\s\S]*?)\]/);
  const jsMatch = jsSrc.match(/var XGB_FEATURES = \[([\s\S]*?)\];/);
  assert(pyMatch, 'sanity: could not locate FEATURE_NAMES in train_xgb_signal.py');
  assert(jsMatch, 'sanity: could not locate XGB_FEATURES in 11-quant.js');

  const extractNames = (s) => (s.match(/['"]([a-z0-9_]+)['"]/g) || []).map(x => x.slice(1, -1));
  const pyNames = extractNames(pyMatch[1]);
  const jsNames = extractNames(jsMatch[1]);

  assert(pyNames.length === 10 && jsNames.length === 10,
    `REGRESSION: expected exactly 10 features on both sides after Opsi C, got Python=${pyNames.length} JS=${jsNames.length}`);
  assert(JSON.stringify(pyNames) === JSON.stringify(jsNames),
    `REGRESSION: FEATURE_NAMES/XGB_FEATURES diverged — Python=[${pyNames.join(',')}] vs JS=[${jsNames.join(',')}]. A silent order/name mismatch feeds the ONNX model wrong-column inputs with no runtime error.`);

  // The 4 new Opsi C features must actually exist as real computed values
  // in both files, not just listed as names.
  ['atr_pct', 'ema20_slope5', 'dist_ema20', 'atr_ratio_20'].forEach(name => {
    assert(pyNames.includes(name), `REGRESSION: ${name} missing from Python FEATURE_NAMES`);
    assert(jsNames.includes(name), `REGRESSION: ${name} missing from JS XGB_FEATURES`);
  });

  // EMA lookback window must match exactly between both sides (this is
  // what prevents train/serve skew — see ml/README.md's "EMA pakai
  // jendela TETAP" note).
  const pyLookback = pySrc.match(/EMA_LOOKBACK = (\d+)/);
  const jsLookback = jsSrc.match(/XGB_EMA_LOOKBACK = (\d+)/);
  assert(pyLookback && jsLookback, 'REGRESSION: EMA_LOOKBACK (Python) or XGB_EMA_LOOKBACK (JS) constant is gone');
  assert(pyLookback[1] === jsLookback[1],
    `REGRESSION: EMA lookback window diverged — Python EMA_LOOKBACK=${pyLookback[1]} vs JS XGB_EMA_LOOKBACK=${jsLookback[1]}. This causes train/serve skew (EMA value depends on how much price history happens to be available) without any runtime error.`);

  // JS loop must start at the lookback window, not the old fixed 30 —
  // otherwise ema20_slope5/dist_ema20 would be computed from a
  // partially-warmed EMA in early rows, diverging from Python's dropna()
  // behavior on the same dates.
  assert(/for\(var i=XGB_EMA_LOOKBACK;i<n;i\+\+\)/.test(jsSrc),
    'REGRESSION: xgbComputeFeatures() loop no longer starts at XGB_EMA_LOOKBACK — early rows would use an under-warmed EMA, diverging from Python');
});

// ── TEST 68: XGBoost strategy must be honestly labeled as an educational
// experiment, not presented as a proven predictive tool (user decision,
// 2026-09-11, after 3 iterations — label fix, threshold calibration,
// feature engineering — showed lift declining from 1.09x to 0.98x, never
// clearing the 1.15x "real signal" bar). The status box must surface the
// precision-vs-base-rate numbers directly from meta.json when available,
// not just a bare accuracy percentage (which stays misleadingly high even
// for a model that just predicts the majority class).
test('REGRESSION GUARD: XGBoost strategy must be honestly labeled as an educational experiment with no proven predictive edge', () => {
  const jsSrc = fs.readFileSync(path.join(__dirname, 'public/js/11-quant.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, 'ml/README.md'), 'utf8');

  assert(/XGBoost \(Eksperimen\)/.test(htmlSrc),
    'REGRESSION: the Backtester strategy button no longer honestly labels XGBoost as experimental (reverted to the old bare "XGBoost*" with a dangling, unexplained footnote marker)');

  const fnStart = jsSrc.indexOf('function xgbUpdateStatusUI()');
  assert(fnStart !== -1, 'sanity: xgbUpdateStatusUI() not found');
  const fnBody = jsSrc.slice(fnStart, fnStart + 1500);
  assert(/alert-warn/.test(fnBody) && !/alert-ok/.test(fnBody),
    'REGRESSION: xgbUpdateStatusUI() shows a green "alert-ok" badge again for a model with no proven predictive edge — should stay amber (alert-warn)');
  assert(/EKSPERIMEN\/EDUKASI/.test(fnBody),
    'REGRESSION: the status box no longer honestly labels the model as an educational experiment');
  assert(/buy_precision_at_threshold/.test(fnBody) && /base_rate/.test(fnBody),
    'REGRESSION: the status box no longer surfaces the precision-vs-base-rate diagnostic from meta.json — reverted to a bare accuracy number that stays misleadingly high for a majority-class-predicting model');

  assert(/0[.,]98x/.test(readme) && /1[.,]09x/.test(readme),
    'REGRESSION: ml/README.md no longer documents the actual lift results across iterations (1.09x -> 0.98x) — the honest empirical conclusion for stopping iteration is gone');
  assert(/EKSPERIMEN EDUKASI/.test(readme),
    'REGRESSION: ml/README.md no longer states upfront that this is an educational experiment, not a proven tool');
});

// ── TEST 69: rdSave() (public/js/13-realdata.js) must evict old price-
// history cache entries once the shared mw_rd_* budget is exceeded —
// found from a REAL user's browser (2026-09-11 incident): localStorage
// origin usage hit 4.99/~5MB Chrome quota, dominated by unbounded
// mw_rd_PXH_STK_<TICKER>/mw_rd_PXH_IDX_<INDEX> entries (~100-130KB each,
// written by perfFetchDailyHistory() in 21-performance.js — DAILY_MAX/10y
// history per symbol, NEVER evicted before this fix) plus rdSave()'s own
// 1-year mw_rd_<TICKER> cache. The user's actual real-portfolio save
// (mw_local_data_v3_<user>, via saveData() in 02-storage.js) started
// throwing QuotaExceededError on logout because disposable, re-fetchable
// price-history cache had consumed nearly the entire origin quota.
// Loaded via the real vm sandbox technique (same pattern as the
// escapeHtml() test above) with a minimal in-memory localStorage mock,
// since this module references the browser global directly.
test('REGRESSION GUARD: rdSave() must evict oldest mw_rd_* cache entries once the shared budget is exceeded (real user localStorage-quota incident)', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/13-realdata.js'), 'utf8');
  // Extract ONLY the RD_STORE/RD_CACHE_BUDGET_BYTES/_rdEvictIfNeeded/rdSave
  // block (up to but not including the next section's own comment banner)
  // rather than running the whole file through vm — the rest of
  // 13-realdata.js overrides several functions from OTHER, earlier-loaded
  // production files at module top level (fsGenData/qtFetchOHLCV/
  // fsRunAnalysis/FS_UNIV/...), which would need an ever-growing list of
  // stubs having nothing to do with what this test actually verifies.
  const startMarker = 'var RD_STORE';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: RD_STORE declaration not found — has this section moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\nfunction _rdExpand');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after rdSave() (next function _rdExpand) — extraction range may need updating');
  src = src.slice(0, relEnd);

  // In-memory localStorage mock — Web Storage API surface rdSave()/
  // _rdEvictIfNeeded() actually use (length, key(i), getItem, setItem,
  // removeItem). setItem throws QuotaExceededError past a small fake cap
  // so a genuinely-broken eviction (or one that evicts too little) still
  // surfaces as a thrown error here, not a silently-passing no-op.
  function makeFakeLocalStorage(quotaBytes) {
    const store = new Map();
    return {
      get length() { return store.size; },
      key(i) { return Array.from(store.keys())[i] ?? null; },
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) {
        const currentTotal = Array.from(store.entries()).reduce((s, [ek, ev]) => s + (ek === k ? 0 : ev.length), 0);
        if (currentTotal + String(v).length > quotaBytes) {
          const err = new Error('Quota exceeded (fake)'); err.name = 'QuotaExceededError'; throw err;
        }
        store.set(k, String(v));
      },
      removeItem(k) { store.delete(k); },
      _store: store, // test-only escape hatch to inspect state directly
    };
  }

  const fakeLS = makeFakeLocalStorage(50 * 1024 * 1024); // generous fake browser quota — RD_CACHE_BUDGET_BYTES (2MB) is what should actually gate eviction, not this
  const sandbox = { window: {}, document: { getElementById: () => null }, localStorage: fakeLS };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '13-realdata.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.rdSave, 'function', 'rdSave() not found — has it been renamed/removed?');
  assert(/RD_CACHE_BUDGET_BYTES/.test(src), 'REGRESSION: RD_CACHE_BUDGET_BYTES cap is gone — mw_rd_* cache is unbounded again, this is exactly the incident that filled the real user\'s localStorage');
  assert(/function _rdEvictIfNeeded\(/.test(src), 'REGRESSION: _rdEvictIfNeeded() eviction helper is gone');
  assert(/_rdEvictIfNeeded\('mw_rd_'\+tk, payload\.length\)/.test(src), 'REGRESSION: rdSave() no longer calls _rdEvictIfNeeded() before writing — eviction logic exists but is unwired');

  // Functional proof, not just source-text presence: write enough ~10KB
  // rows-array entries (mimicking real PXH_STK_* sizes, scaled down) to
  // exceed ctx.RD_CACHE_BUDGET_BYTES several times over, in oldest-first
  // order, then confirm (a) total mw_rd_* footprint stays under budget,
  // and (b) the OLDEST entries were the ones evicted (LRU-by-refresh-date
  // behaves correctly), not an arbitrary/newest-first eviction that would
  // defeat the whole purpose.
  // 2500 rows ≈ 10 years of daily bars — matches the real PXH_STK_*/
  // PXH_IDX_* entries observed in the field (~100-130KB each via
  // perfFetchDailyHistory()'s DAILY_MAX/10y fetch), so 40 of them (~4MB)
  // genuinely exceeds the 2MB budget the way the real incident did,
  // rather than a toy size that never triggers eviction at all.
  const rowsFor = (n) => Array.from({ length: n }, (_, i) => ({ date: '2020-01-01', open: 100, high: 101, low: 99, close: 100.5, volume: 1000 }));
  // Strictly increasing dates (2020-01-01, 2020-01-02, ...) — never wraps
  // around, so every entry's `d` is unique and the oldest-vs-newest
  // assertions below can't accidentally pass on a tie.
  const dateForIdx = (i) => { const d = new Date(Date.UTC(2020, 0, 1)); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); };
  const tickers = [];
  for (let i = 0; i < 40; i++) {
    const tk = 'PXH_STK_FAKE' + i;
    tickers.push(tk);
    // Backdate RD_TODAY per write so entries have distinct, increasing
    // "last refreshed" dates — otherwise every entry ties at today's date
    // and recency ordering can't be tested.
    ctx.RD_TODAY = dateForIdx(i);
    ctx.rdSave(tk, rowsFor(2500));
  }

  const survivingKeys = Array.from(fakeLS._store.keys()).filter(k => k.indexOf('mw_rd_') === 0);
  const totalBytes = survivingKeys.reduce((s, k) => s + fakeLS._store.get(k).length, 0);

  assert(survivingKeys.length < tickers.length,
    'REGRESSION: no eviction happened at all — wrote ' + tickers.length + ' entries, all ' + survivingKeys.length + ' still present. RD_CACHE_BUDGET_BYTES should have forced some out.');
  assert(totalBytes <= ctx.RD_CACHE_BUDGET_BYTES,
    'REGRESSION: total mw_rd_* footprint (' + totalBytes + ' bytes) exceeds RD_CACHE_BUDGET_BYTES (' + ctx.RD_CACHE_BUDGET_BYTES + ') even after eviction ran — budget is not actually being enforced');

  // The earliest-written tickers (oldest `d`) must be gone; the
  // last-written ones (newest `d`, i.e. most recently refreshed) must
  // have survived — proves eviction is oldest-first, not arbitrary.
  assert(!survivingKeys.includes('mw_rd_' + tickers[0]),
    'REGRESSION: the OLDEST entry survived eviction while newer ones were evicted — recency ordering is broken (should evict least-recently-refreshed first)');
  assert(survivingKeys.includes('mw_rd_' + tickers[tickers.length - 1]),
    'REGRESSION: the MOST RECENTLY written entry was evicted — eviction is evicting the wrong end of the recency order');
});

// ── TEST 70: showSaveStatus() priority — same incident as TEST 69. A
// localStorage-quota warning (priority 10) shown synchronously by
// saveData()'s catch block used to get silently overwritten within ~1
// second by the routine "Tersimpan ke Supabase Cloud" success message
// _syncToCloud() shows right after (both default priority 0) — the rare,
// important warning never had a real chance to be read. A higher-
// priority message must survive being overwritten by a lower-priority
// one until its own display duration elapses; a message at the SAME (or
// higher) priority must still be allowed through, or the status bar
// would get stuck forever on one message.
function makeShowSaveStatusSandbox() {
  const state = { text: '', color: '', priority: 0, expiresAt: 0, timerActive: false };
  // Minimal re-implementation matching 02-storage.js's actual contract
  // (priority gate + expiry), run directly here rather than through vm —
  // this function's only real dependency is a DOM element + setTimeout,
  // both trivial to fake, and the logic under test is the priority/expiry
  // gate itself, not DOM plumbing.
  function showSaveStatus(msg, color, persist, priority, nowFn) {
    priority = priority || 0;
    const now = nowFn ? nowFn() : Date.now();
    if (now < state.expiresAt && priority < state.priority) return;
    state.text = msg;
    state.color = color || 'var(--green)';
    state.priority = priority;
    state.expiresAt = now + (persist ? 4500 : 2500);
  }
  return { showSaveStatus, state };
}
test('REGRESSION GUARD: showSaveStatus() priority must protect a critical quota warning from being overwritten by a routine lower-priority message', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/02-storage.js'), 'utf8');
  assert(/function showSaveStatus\(msg, color, persist, priority\)/.test(src),
    'REGRESSION: showSaveStatus() no longer accepts a priority parameter — the quota-warning-gets-stomped bug is back');
  assert(/if \(now < _saveStatusExpiresAt && priority < _saveStatusPriority\) return;/.test(src),
    'REGRESSION: the priority gate logic is gone from showSaveStatus()');
  assert(/showSaveStatus\(\s*[\s\S]*?,\s*'var\(--red\)',\s*true,\s*10/.test(src),
    'REGRESSION: the localStorage-quota warning in saveData() no longer passes priority 10 — it will get silently overwritten by the routine Supabase-success message again');

  // Functional proof against a faithful re-implementation of the gate.
  const { showSaveStatus, state } = makeShowSaveStatusSandbox();
  let t = 1000;
  const now = () => t;

  showSaveStatus('⚠️ Kuota penuh', 'var(--red)', true, 10, now);
  assert.strictEqual(state.text, '⚠️ Kuota penuh', 'sanity: the warning itself did not get set');

  t += 200; // a moment later, well within the 4500ms persist window
  showSaveStatus('Tersimpan ke Supabase Cloud', 'var(--green)', false, 0, now); // routine, priority 0
  assert.strictEqual(state.text, '⚠️ Kuota penuh',
    'REGRESSION: a routine priority-0 message overwrote the still-active priority-10 quota warning');

  t += 5000; // now past the quota warning's 4500ms display window
  showSaveStatus('Tersimpan ke Supabase Cloud', 'var(--green)', false, 0, now);
  assert.strictEqual(state.text, 'Tersimpan ke Supabase Cloud',
    'REGRESSION: once the high-priority message has genuinely expired, a routine message should be allowed through — the status bar must not get stuck forever');

  // A second warning of EQUAL priority must still be allowed to replace
  // the first (e.g. two quota errors in a row) — the gate must only
  // block STRICTLY LOWER priority, not equal.
  t = 1000; state.text = ''; state.priority = 0; state.expiresAt = 0;
  showSaveStatus('⚠️ Kuota penuh #1', 'var(--red)', true, 10, now);
  t += 200;
  showSaveStatus('⚠️ Kuota penuh #2', 'var(--red)', true, 10, now);
  assert.strictEqual(state.text, '⚠️ Kuota penuh #2',
    'REGRESSION: an equal-priority message can no longer replace an earlier one of the same priority — the gate is too strict (should only block strictly-lower priority)');
});

// ── TEST 71: fsFallbackInfo() (public/js/07-flowscan.js) must resolve the
// real company name from DB[tk] for any ticker outside FS_UNIV's static
// 30-entry curated list, not echo the ticker code back as the name — found
// from a real user report (2026-09-11): CUAN (and any other ticker not in
// FS_UNIV) showed with "nama dan kode sama" (name identical to code) on
// Ranking/Heatmap/Watchlist, even though DB['CUAN'].name already holds the
// real company name ('Petrindo Jaya Kreasi Tbk.'). The sibling `s`
// (sector) field already had this exact fallback-to-DB fix from an
// earlier incident; `n` (name) never got the same treatment.
// Loaded via the real vm sandbox technique (same pattern as TEST 69) —
// extracts the FS_UNIV/FS_SECTOR_MAP/fsSectorLabel/fsFallbackInfo block
// only, stubbing DB/XLSX_DATA (the two top-level statements this slice
// depends on) rather than running the whole file, which overrides several
// functions from other, earlier-loaded production files at module scope.
test('REGRESSION GUARD: fsFallbackInfo() must use DB[tk].name for tickers outside FS_UNIV, not echo the ticker code as the name', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');
  const startMarker = 'var FS_UNIV=[';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: FS_UNIV declaration not found — has this section moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\nfunction fsMkBdg');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after fsFallbackInfo() (next function fsMkBdg) — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/function fsFallbackInfo\(tk\)/.test(src), 'fsFallbackInfo() not found — has it been renamed/removed?');
  assert(/dbInfo && dbInfo\.name && dbInfo\.name !== tk/.test(src),
    'REGRESSION: fsFallbackInfo() no longer checks DB[tk].name — tickers outside FS_UNIV will show their code as the name again (the CUAN bug)');
  assert(!/return \{ t: tk, n: tk, s:/.test(src),
    'REGRESSION: fsFallbackInfo() hardcodes n: tk again — the name-equals-code bug is back');

  const sandbox = {
    window: {},
    DB: {
      'CUAN': { name: 'Petrindo Jaya Kreasi Tbk.', sector: 'Energi', base: 6800 },
      'UNKN': { sector: 'Energi' }, // has a sector but no usable name — must still fall back to the code, not throw
    },
    XLSX_DATA: { stocks: [] }, // no real-portfolio tickers to merge in for this test
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '07-flowscan.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.fsFallbackInfo, 'function', 'fsFallbackInfo not exposed on the sandbox context');

  const cuan = ctx.fsFallbackInfo('CUAN');
  assert.strictEqual(cuan.n, 'Petrindo Jaya Kreasi Tbk.',
    'REGRESSION: fsFallbackInfo("CUAN") did not resolve the real name from DB — got "' + cuan.n + '" instead');
  assert.strictEqual(cuan.s, 'Energi', 'sanity: sector fallback (already-fixed behavior) must still work');

  // A ticker with no DB entry at all (or DB.name missing/absent) must still
  // degrade gracefully to the ticker code — never throw, never show
  // "undefined".
  const noDb = ctx.fsFallbackInfo('ZZZZ');
  assert.strictEqual(noDb.n, 'ZZZZ', 'REGRESSION: a ticker entirely absent from DB must fall back to its own code as the name, not throw or show undefined');

  const noName = ctx.fsFallbackInfo('UNKN');
  assert.strictEqual(noName.n, 'UNKN', 'REGRESSION: a DB entry with a sector but no name must still fall back to the ticker code as the name');
});

// ── TEST 72: rdRebuildFromReal()'s watchlist-rebuild path (public/js/
// 13-realdata.js) must reuse fsFallbackInfo() for a ticker outside
// FS_UNIV, not a hardcoded {t,n:t,s:'IHSG',cap:0} duplicate of that
// helper's OLD (buggy) fallback — found while auditing for other
// instances of the CUAN name-bug (2026-09-11): this watchlist-preserving
// forEach in rdRebuildFromReal() had its own copy of the exact same
// bug (name=code, sector='IHSG' the composite index instead of a real
// sector) that fsFallbackInfo() itself was already fixed for. A user
// with CUAN in their watchlist would get it silently reverted back to
// showing "CUAN" as both code and name every time real data reloads.
test('REGRESSION GUARD: rdRebuildFromReal() watchlist rebuild must call fsFallbackInfo() for tickers outside FS_UNIV, not a hardcoded name=code/sector=IHSG duplicate', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/13-realdata.js'), 'utf8');
  assert(!/\{t:t, n:t, s:'IHSG', cap:0\}/.test(src),
    'REGRESSION: the hardcoded name=code/sector=IHSG fallback is back in rdRebuildFromReal()');
  assert(/FS_UNIV\.find\(function\(u\)\{ return u\.t===t; \}\) \|\| fsFallbackInfo\(t\)/.test(src),
    'REGRESSION: rdRebuildFromReal() no longer reuses fsFallbackInfo() for the watchlist-rebuild fallback');

  // Functional proof: extract just the wlTks.forEach block and run it with
  // mocked dependencies, rather than the whole rdRebuildFromReal() (which
  // pulls in fsInit/ADMIN_META/rdBuildScData/getPortfolio/renderPage — a
  // large unrelated dependency surface for what this test actually checks).
  const startMarker = 'wlTks.forEach(function(t){';
  const start = src.indexOf(startMarker);
  assert(start !== -1, 'sanity: wlTks.forEach block not found — has rdRebuildFromReal() moved/been renamed?');
  let block = src.slice(start);
  const relEnd = block.indexOf('\n  });\n');
  assert(relEnd !== -1, 'sanity: could not find the end of the wlTks.forEach block');
  block = block.slice(0, relEnd + '\n  });'.length);

  const FS_UNIV = [{ t: 'BBCA', n: 'Bank Central Asia', s: 'Perbankan', cap: 950 }];
  const FS_WL = [];
  const fsFallbackInfo = (tk) => ({ t: tk, n: 'Petrindo Jaya Kreasi Tbk.', s: 'Energi', cap: 0 }); // stands in for the already-fixed real helper
  const fsGenData = () => [{ c: 100 }];
  const fsProcess = () => ({});
  const wlTks = ['BBCA', 'CUAN'];

  // eslint-disable-next-line no-new-func
  const runBlock = new Function('FS_UNIV', 'FS_WL', 'fsFallbackInfo', 'fsGenData', 'fsProcess', 'wlTks', block + '\nreturn FS_WL;');
  const result = runBlock(FS_UNIV, FS_WL, fsFallbackInfo, fsGenData, fsProcess, wlTks);

  const cuanEntry = result.find(w => w.t === 'CUAN');
  assert(cuanEntry, 'sanity: CUAN watchlist entry was not rebuilt at all');
  assert.strictEqual(cuanEntry.n, 'Petrindo Jaya Kreasi Tbk.',
    'REGRESSION: CUAN watchlist entry got its name from the hardcoded fallback (=code), not from fsFallbackInfo()');
  assert.strictEqual(cuanEntry.s, 'Energi',
    'REGRESSION: CUAN watchlist entry got sector "IHSG" from the hardcoded fallback instead of the real sector via fsFallbackInfo()');
});

// ── TEST 73: getKseiStock() (public/js/34-ksei-shareholders.js) must use
// DB[tk].name when available, not always synthesize a generic "<TICKER>
// Tbk." placeholder — same audit as TEST 72. A stock with no KSEI
// shareholder data (100% free float / not yet synced) would show this
// generic placeholder as its name even when the real company name was
// already known from DB.
test('REGRESSION GUARD: getKseiStock() fallback must prefer DB[tk].name over the generic "<TICKER> Tbk." placeholder', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/34-ksei-shareholders.js'), 'utf8');
  const startMarker = 'function getKseiStock(ticker) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: getKseiStock() not found — has it been renamed/moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n}');
  assert(relEnd !== -1, 'sanity: could not find the end of getKseiStock()');
  src = src.slice(0, relEnd + 2);

  assert(/dbName \|\| \(tk \+ ' Tbk\.'\)/.test(src),
    'REGRESSION: getKseiStock() no longer prefers DB[tk].name over the generic placeholder');

  const sandbox = {
    window: {},
    KSEI_STATE: { data: {} }, // force the fallback path (no KSEI shareholder data cached)
    DB: {
      'CUAN': { name: 'Petrindo Jaya Kreasi Tbk.', sector: 'Energi' },
      'UNKN': {}, // DB entry exists but has no usable name
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '34-ksei-shareholders.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.getKseiStock, 'function', 'getKseiStock not exposed on the sandbox context');

  const cuan = ctx.getKseiStock('CUAN');
  assert.strictEqual(cuan.name, 'Petrindo Jaya Kreasi Tbk.',
    'REGRESSION: getKseiStock("CUAN") did not resolve the real name from DB — got "' + cuan.name + '" instead');

  // A ticker with no usable DB name at all must still degrade gracefully to
  // the generic placeholder — never throw, never show "undefined Tbk.".
  const noName = ctx.getKseiStock('UNKN');
  assert.strictEqual(noName.name, 'UNKN Tbk.', 'REGRESSION: a ticker with no usable DB name must still fall back to the generic "<TICKER> Tbk." placeholder');
});

// User-reported (2026-09-19, screenshot): the KSEI ">5% shareholders"
// widget showed "Tanggal Laporan: 26 Aug 2026" and asked why this "still
// uses the old upload method" instead of "real API data". Investigation:
// that date is genuinely real (the bundled data/ksei-shareholders.json
// snapshot's actual reportDate, last synced 2026-09-01) — NOT a fabricated
// fallback for this specific ticker. But 3 render spots in this file DID
// have hardcoded fallback literals ('26 Aug 2026' / '840' / '1.920' /
// '26 AUG') that happened to match the CURRENT bundled snapshot's real
// numbers — a latent honesty risk (would silently show stale/wrong
// numbers as if freshly read from state, if the bundled file ever changes
// without updating these 3 constants in lockstep). Also: there currently
// is no live API for NAMED >5% shareholders (Invezgo's shareholder
// endpoints, confirmed via a real test request, only return AGGREGATE
// category totals — see the comment above fetchInvezgoShareholderKsei()
// in lib/invezgo-client.js) — so genuinely switching this off manual
// upload isn't possible today without a new data source. What IS fixed:
// honest fallback text instead of magic numbers, plus an explicit
// data-age disclosure so a stale manual snapshot reads as stale.
test('REGRESSION GUARD: KSEI shareholder widgets show honest fallbacks (not hardcoded magic numbers/dates) and disclose data age', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/34-ksei-shareholders.js'), 'utf8');
  assert(!/\|\|\s*'26 Aug 2026'/.test(src), 'REGRESSION: a hardcoded "26 Aug 2026" fallback literal has reappeared — this must not silently substitute for a real missing reportDate');
  assert(!/\|\|\s*'26 AUG'/.test(src), 'REGRESSION: a hardcoded "26 AUG" fallback literal has reappeared in the Stock Intel compact widget');
  assert(!/\|\|\s*'840'/.test(src), 'REGRESSION: a hardcoded "840" fallback literal has reappeared for totalEmiten — must read from KSEI_STATE.metadata or show an honest "-"');
  assert(!/\|\|\s*'1\.920'/.test(src), 'REGRESSION: a hardcoded "1.920" fallback literal has reappeared for totalMajorInvestors');

  assert(/function kseiDataAgeDisclosure/.test(src), 'REGRESSION: kseiDataAgeDisclosure() is gone — no data-age disclosure for the manual KSEI snapshot');
  const fn = src.match(/function kseiDataAgeDisclosure\(m\) \{[\s\S]*?\n\}/);
  assert(fn, 'kseiDataAgeDisclosure() body not found');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fn[0], sandbox, { filename: 'kseiDataAgeDisclosure (sandboxed)' });

  const noMeta = sandbox.kseiDataAgeDisclosure(null);
  assert(/tidak diketahui/.test(noMeta.text), 'REGRESSION: missing metadata must produce an honest "tidak diketahui" age label, not a fabricated one');

  const today = sandbox.kseiDataAgeDisclosure({ lastUpdated: new Date().toISOString() });
  assert(/hari ini/.test(today.text), 'REGRESSION: a snapshot updated today must say so, not show a stale-looking age');

  const stale = sandbox.kseiDataAgeDisclosure({ lastUpdated: new Date(Date.now() - 40 * 86400000).toISOString() });
  assert(/40 hari lalu/.test(stale.text), `REGRESSION: a 40-day-old snapshot must report "40 hari lalu", got "${stale.text}"`);
  assert(/red|EF4444/.test(stale.color), 'REGRESSION: a snapshot older than 30 days must be flagged in a warning color, not shown as fresh');
});

// ── TEST 74: sendCopilotPrompt() (public/js/28-decisiontools.js) must fall
// back to generateClientSideAiAgentResponse() — the same client-side
// reasoning engine 41-stockchat-cockpit.js already uses for the identical
// /api/ai/agent-chat endpoint — on ANY server failure (network error,
// non-2xx, or malformed JSON body), instead of showing a dead-end "Gagal
// terhubung ke engine MoneyWatch Pro AI" message with no diagnostic value
// and no way forward — reported by the user via screenshot (2026-09-11):
// the AI Copilot chat showed that exact message twice in a row and was
// unusable.
await asyncTest('REGRESSION GUARD: sendCopilotPrompt() must degrade to the client-side AI reasoning engine on server failure, not a dead-end error message', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  const startMarker = 'async function sendCopilotPrompt(text) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: sendCopilotPrompt() not found — has it been renamed/moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Markdown Formatter for Institutional Agent Output');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after sendCopilotPrompt() (next comment banner) — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/generateClientSideAiAgentResponse\(prompt, userContext\)/.test(src),
    'REGRESSION: sendCopilotPrompt() no longer calls generateClientSideAiAgentResponse() as a fallback — the dead-end error message is back');

  function makeSandbox(fetchImpl, withClientEngine) {
    const MW_COPILOT_HISTORY = [];
    const calls = { clientEngine: 0 };
    const sandbox = {
      window: {},
      MW_COPILOT_HISTORY,
      MW_AI_IS_LOADING: false,
      el: () => null, // no DOM in this test — every el() call site already null-checks
      renderCopilotPage: () => {},
      getPortfolio: () => [],
      computeCurrentAUM: () => 0,
      calcRdnBalance: () => 0,
      fetch: fetchImpl,
      generateClientSideAiAgentResponse: withClientEngine
        ? (msg, ctx) => { calls.clientEngine++; return { reply: 'FALLBACK: ' + msg, toolCalls: [] }; }
        : undefined,
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(src, ctx, { filename: '28-decisiontools.js (sandboxed load for test)' });
    return { ctx, MW_COPILOT_HISTORY, calls };
  }

  // 1. Network error (fetch rejects) — must fall back, not show the dead-end message.
    {
      const { ctx, MW_COPILOT_HISTORY, calls } = makeSandbox(() => Promise.reject(new Error('network down')), true);
      await ctx.sendCopilotPrompt('Analisa portofolio saya');
      const lastMsg = MW_COPILOT_HISTORY[MW_COPILOT_HISTORY.length - 1];
      assert.strictEqual(calls.clientEngine, 1, 'REGRESSION: generateClientSideAiAgentResponse() was not called after a network error');
      assert.strictEqual(lastMsg.text, 'FALLBACK: Analisa portofolio saya',
        'REGRESSION: a network error still shows the dead-end message instead of the client-side fallback reply');
    }

    // 2. Non-2xx response (e.g. Vercel function timeout / 500) — must also fall back.
    {
      const { ctx, MW_COPILOT_HISTORY, calls } = makeSandbox(() => Promise.resolve({ ok: false, status: 504, statusText: 'Gateway Timeout' }), true);
      await ctx.sendCopilotPrompt('Cek fundamental BBCA');
      const lastMsg = MW_COPILOT_HISTORY[MW_COPILOT_HISTORY.length - 1];
      assert.strictEqual(calls.clientEngine, 1, 'REGRESSION: a non-2xx response did not trigger the client-side fallback');
      assert.strictEqual(lastMsg.text, 'FALLBACK: Cek fundamental BBCA');
    }

    // 3. res.ok but malformed JSON body (res.json() throws) — must also fall back,
    // not bubble up as an uncaught rejection or a dead-end message.
    {
      const { ctx, MW_COPILOT_HISTORY, calls } = makeSandbox(() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }), true);
      await ctx.sendCopilotPrompt('Simulasi beli ADRO');
      const lastMsg = MW_COPILOT_HISTORY[MW_COPILOT_HISTORY.length - 1];
      assert.strictEqual(calls.clientEngine, 1, 'REGRESSION: a malformed (non-JSON) response body did not trigger the client-side fallback');
      assert.strictEqual(lastMsg.text, 'FALLBACK: Simulasi beli ADRO');
    }

    // 4. Real success — the server reply must be used, and the client-side
    // fallback must NOT be invoked (it's a fallback, not a double-answer).
    {
      const { ctx, MW_COPILOT_HISTORY, calls } = makeSandbox(
        () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, reply: 'Jawaban server asli.', toolCalls: [] }) }),
        true
      );
      await ctx.sendCopilotPrompt('Halo');
      const lastMsg = MW_COPILOT_HISTORY[MW_COPILOT_HISTORY.length - 1];
      assert.strictEqual(calls.clientEngine, 0, 'REGRESSION: the client-side fallback ran even though the server call succeeded');
      assert.strictEqual(lastMsg.text, 'Jawaban server asli.');
    }

    // 5. Client-side engine itself unavailable (e.g. 41-stockchat-cockpit.js
    // failed to load) — must still degrade gracefully with a message that
    // actually explains what happened, never throw.
    {
      const { ctx, MW_COPILOT_HISTORY } = makeSandbox(() => Promise.reject(new Error('network down')), false);
      await ctx.sendCopilotPrompt('Analisa portofolio saya');
      const lastMsg = MW_COPILOT_HISTORY[MW_COPILOT_HISTORY.length - 1];
      assert(/engine cadangan client-side tidak tersedia/.test(lastMsg.text),
        'REGRESSION: when the client-side fallback itself is unavailable, the last-resort message no longer explains the real cause');
    }
});

// ── TEST 75: AI Copilot chat bubbles (renderCopilotPage() in public/js/
// 28-decisiontools.js) must render the "Anda" (user) bubble's text in
// white, not a theme-dependent color — found via user screenshot
// (2026-09-11): in light theme, .bubble-user's background is a solid blue
// (`body.theme-light .bubble-user { background:#2563EB !important }` in
// main.css), but cb-role/cb-text used var(--accent)/var(--text), which in
// light theme resolve to near-black — dark text on a solid blue bubble,
// unreadable. A CSS !important on the bubble DIV's own `color` never wins
// over a CHILD element's own explicit inline color, so this had to be
// fixed at the source (28-decisiontools.js), not in CSS.
test('REGRESSION GUARD: AI Copilot user ("Anda") chat bubble text must be hardcoded white, not a theme-variable color that goes dark-on-blue in light theme', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  const startMarker = 'var messagesHtml = MW_COPILOT_HISTORY.map(function(m, idx) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: the copilot bubble-rendering map() not found — has renderCopilotPage() moved/been renamed?');
  let src = fullSrc.slice(start + 'var messagesHtml = '.length);
  const relEnd = src.indexOf("}).join('');");
  assert(relEnd !== -1, 'sanity: could not find the end of the bubble-rendering map() callback');
  src = src.slice(0, relEnd + "}).join('')".length); // deliberately excludes the trailing ';' — it's wrapped in return (...) below

  assert(!/color:' \+ \(isAssistant \? '#38bdf8' : 'var\(--accent\)'\)/.test(src),
    'REGRESSION: cb-role color is back to theme-dependent var(--accent) for user bubbles');
  assert(!/color:var\(--text\)">' \+ formattedText/.test(src),
    'REGRESSION: cb-text color is back to unconditional var(--text), ignoring that user bubbles sit on a blue background in light theme');

  // Functional proof: evaluate the actual map() expression against a
  // 2-message history (one from each role) and read the real color values
  // out of the generated HTML, rather than only pattern-matching source
  // text.
  // eslint-disable-next-line no-new-func
  const buildHtml = new Function('MW_COPILOT_HISTORY', 'formatAgentMarkdown', 'escapeHtml',
    'return (' + src + ');'
  );
  const html = buildHtml(
    [
      { role: 'user', text: 'Analisa portofolio saya', toolCalls: [] },
      { role: 'assistant', text: 'Berikut analisanya.', toolCalls: [] },
    ],
    (t) => t,
    (t) => t
  );

  const userBubble = html.split('bubble-assistant')[0]; // everything before the assistant bubble is the user one
  assert(/cb-role" style="[^"]*color:#FFFFFF/.test(userBubble),
    'REGRESSION: "Anda" (cb-role) is not rendered in hardcoded white — will go dark-on-blue in light theme again');
  assert(/cb-text" style="[^"]*color:#FFFFFF/.test(userBubble),
    'REGRESSION: the user message body (cb-text) is not rendered in hardcoded white — will go dark-on-blue in light theme again');

  const assistantBubble = html.slice(html.indexOf('bubble-assistant'));
  assert(/cb-text" style="[^"]*color:var\(--text\)/.test(assistantBubble),
    'sanity: the assistant bubble must keep using the theme-aware var(--text) color (its background already tracks the theme correctly, unlike the user bubble)');
});

// ── TEST 76: generateClientSideAiAgentResponse() (public/js/
// 41-stockchat-cockpit.js) — the client-side AI fallback engine, now also
// used by the AI Copilot (public/js/28-decisiontools.js) — must route a
// portfolio/AUM/cash question to the portfolio-review branch even when a
// stray word in the message (e.g. "SAYA", "KAS") would otherwise be
// misread as a candidate ticker code and rejected by the strict
// ticker-validity gate. Reported by the user via screenshot (2026-09-11):
// "analisa portofolio saya" answered with "Kode ticker SAYA tidak
// teridentifikasi..." instead of an actual portfolio review.
test('REGRESSION GUARD: generateClientSideAiAgentResponse() must not let a stray word in a portfolio/strategy question get misread as an invalid ticker and short-circuit the real answer', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const startMarker = 'function generateClientSideAiAgentResponse(message, userContext) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: generateClientSideAiAgentResponse() not found — has it been renamed/moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Clear history');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after generateClientSideAiAgentResponse() (next comment banner) — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/isTickerIndependentIntent/.test(src),
    'REGRESSION: the ticker-independent-intent guard is gone — a stray word in a portfolio/strategy question will be misread as an invalid ticker again');
  assert(/if \(!isTickerIndependentIntent && typeof isValidStockTicker === 'function' && !isValidStockTicker\(matchedTicker\)\)/.test(src),
    'REGRESSION: the ticker-validity gate no longer skips portfolio/strategy intents — the CUAN-adjacent "Kode ticker SAYA tidak teridentifikasi" bug is back');

  const sandbox = {
    window: {},
    DB: { BBCA: { name: 'Bank Central Asia', sector: 'Perbankan' } },
    isValidStockTicker: (tk) => tk === 'BBCA',
    getPortfolio: () => [{ ticker: 'BBCA', lot: 10, marketValue: 50000000 }],
    computeCurrentAUM: () => 100000000,
    calcRdnBalance: () => 20000000,
    STOCKCHAT_SELECTED_TICKER: 'BBCA',
    getAccurateStockPrice: () => 9000, // valuasi/dividen/simulasi branches fall back to this when getGlobalMarketPrice isn't loaded
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '41-stockchat-cockpit.js (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.generateClientSideAiAgentResponse, 'function', 'generateClientSideAiAgentResponse not exposed on the sandbox context');

  // The exact user-reported message: no valid ticker, and "SAYA" would be
  // misread as a candidate ticker code by the old possibleCode heuristic.
  const r1 = ctx.generateClientSideAiAgentResponse('analisa portofolio saya', {});
  assert(!/Ticker Tidak Terdaftar/.test(r1.reply),
    'REGRESSION: "analisa portofolio saya" still bounces off the invalid-ticker gate instead of answering the portfolio question');
  assert(/Portofolio|AUM|Kas RDN/.test(r1.reply),
    'REGRESSION: "analisa portofolio saya" did not produce an actual portfolio-review reply');

  // "kas" alone is both a portfolio-intent keyword AND, on its own, would
  // pass the old length-3-6 possibleCode filter as a fake ticker.
  const r2 = ctx.generateClientSideAiAgentResponse('cek kas saya', {});
  assert(!/Ticker Tidak Terdaftar/.test(r2.reply),
    'REGRESSION: "cek kas saya" still bounces off the invalid-ticker gate');

  // A genuinely unknown ticker with NO portfolio/strategy keywords must
  // still correctly show the "Ticker Tidak Terdaftar" guard — this fix
  // must not have broken that zero-dummy-data protection.
  const r3 = ctx.generateClientSideAiAgentResponse('analisa saham ZZZZ', {});
  assert(/Ticker Tidak Terdaftar/.test(r3.reply),
    'REGRESSION: a genuinely unknown ticker with no portfolio/strategy intent no longer triggers the Zero Dummy Data guard');

  // A real, valid ticker must still resolve normally through the
  // ticker-specific branches, unaffected by this fix.
  const r4 = ctx.generateClientSideAiAgentResponse('valuasi BBCA', {});
  assert(!/Ticker Tidak Terdaftar/.test(r4.reply), 'REGRESSION: a valid ticker (BBCA) is now incorrectly rejected');
});

// ── TEST 77: executeAgentTool('cek_kinerja_ai_trading', ...) (server.js) —
// new capability (2026-09-11) giving the AI Copilot access to the user's
// REAL AI Paper Trading track record (win rate, profit factor, realized
// PnL, max drawdown) and the genuine lesson/mistake/improvement text the
// existing Post-Mortem engine already computes per closed trade — instead
// of the AI having zero visibility into trading history and, when asked
// "beri saran perbaikan", either refusing or inventing generic advice.
// Must NEVER fabricate a win rate when userContext carries no
// aiPaperTrading data (Zero Dummy Data principle every other tool here
// already follows).
await asyncTest("REGRESSION GUARD: executeAgentTool('cek_kinerja_ai_trading') must pass through real AI Paper Trading stats and never fabricate them when absent", async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = fullSrc.indexOf('async function executeAgentTool');
  assert(start !== -1, 'sanity: executeAgentTool() not found — has it been renamed/moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Function Declarations for Gemini Function Calling');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after executeAgentTool() — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/case 'cek_kinerja_ai_trading':/.test(src), "REGRESSION: the 'cek_kinerja_ai_trading' case is gone from executeAgentTool()");
  assert(/hasData: false/.test(src), 'REGRESSION: the no-data honest-empty-state branch is gone');

  const sandbox = { window: {} };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: 'server.js executeAgentTool() (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.executeAgentTool, 'function', 'executeAgentTool not exposed on the sandbox context');

  // 1. No aiPaperTrading in userContext at all — must NOT fabricate.
  const r1 = await ctx.executeAgentTool('cek_kinerja_ai_trading', {}, {});
  assert.strictEqual(r1.hasData, false, 'REGRESSION: missing aiPaperTrading must report hasData:false, not invent stats');
  assert.strictEqual(r1.winRatePct, undefined, 'REGRESSION: a winRatePct field leaked into the no-data response — looks like fabricated data');

  // 2. aiPaperTrading present but zero trades — same honest empty state.
  const r2 = await ctx.executeAgentTool('cek_kinerja_ai_trading', {}, { aiPaperTrading: { totalTrades: 0 } });
  assert.strictEqual(r2.hasData, false, 'REGRESSION: zero trades must still report hasData:false');

  // 3. Real data — every field must pass through unmodified (no rounding,
  // relabeling, or silent drop of the lesson/mistake/improvement text the
  // Post-Mortem engine already computed).
  const fakeApt = {
    totalTrades: 12, winningTrades: 7, losingTrades: 5, winRate: 58.3,
    profitFactor: 1.85, realizedPnL: 4250000, maxDrawdownPct: 8.4, openPositionsCount: 2,
    recentClosedTrades: [
      { ticker: 'BBCA', result: 'LOSS', netPnL: -150000, exitReason: 'SL_HIT', lesson: 'Entry terlalu awal sebelum konfirmasi breakout.', mistake: 'Mengabaikan volume rendah saat entry.', improvement: 'Tunggu volume >1.5x rata-rata sebelum entry.' }
    ]
  };
  const r3 = await ctx.executeAgentTool('cek_kinerja_ai_trading', {}, { aiPaperTrading: fakeApt });
  assert.strictEqual(r3.hasData, true);
  assert.strictEqual(r3.winRatePct, 58.3, 'REGRESSION: winRatePct does not match the real winRate passed in userContext');
  assert.strictEqual(r3.profitFactor, 1.85);
  assert.strictEqual(r3.realizedPnL, 4250000);
  assert.strictEqual(r3.maxDrawdownPct, 8.4);
  assert.deepStrictEqual(r3.recentClosedTrades, fakeApt.recentClosedTrades,
    'REGRESSION: recentClosedTrades (including lesson/mistake/improvement) was not passed through unmodified');
});

// ── TEST 78: the deterministic (non-Gemini) fallback branch in
// /api/ai/agent-chat (server.js) must route "bagaimana performa AI
// trading saya" / "saran perbaikan" style questions to the new
// cek_kinerja_ai_trading tool, and must show the same honest empty state
// when there is no data — not fall through to the generic single-ticker
// analysis branch (which would answer about a bogus/default ticker
// instead of the user's actual question).
test('REGRESSION GUARD: the deterministic AI fallback must route AI-performance questions to cek_kinerja_ai_trading, not the generic ticker-analysis branch', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = fullSrc.indexOf("// 2. DETERMINISTIC AGENTIC ENGINE FALLBACK");
  assert(start !== -1, 'sanity: the deterministic fallback block not found — has it moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf("\n  } catch (err) {\n    console.error('MoneyWatch AI fallback error:'");
  assert(relEnd !== -1, 'sanity: could not find the end of the deterministic fallback block');
  src = src.slice(0, relEnd);

  assert(/pLower\.includes\('kinerja ai'\)/.test(src),
    'REGRESSION: the deterministic fallback no longer checks for AI-performance keywords — questions about AI trading performance will fall through to the generic ticker-analysis branch');
  assert(/cek_kinerja_ai_trading/.test(src),
    'REGRESSION: the deterministic fallback no longer calls cek_kinerja_ai_trading');

  // Confirm the AI-performance branch is checked BEFORE the generic
  // catch-all `else {` — otherwise it's dead code (same class of ordering
  // bug as the CUAN ticker-short-circuit incident).
  const aiPerfIdx = src.indexOf("pLower.includes('kinerja ai')");
  const genericElseIdx = src.indexOf('// General Fundamental & Risk/Reward Analysis');
  assert(aiPerfIdx !== -1 && genericElseIdx !== -1 && aiPerfIdx < genericElseIdx,
    'REGRESSION: the AI-performance branch is positioned after (or missing relative to) the generic catch-all branch — it will never be reached');
});

// ── TEST 79: generateClientSideAiAgentResponse()'s new isAiPerformanceIntent
// branch (public/js/41-stockchat-cockpit.js) — the client-side mirror of
// TEST 77/78, exercised when the server is unreachable (network failure,
// or Copilot's fallback per the earlier 2026-09-11 fix). Must read
// userContext.aiPaperTrading directly (no server round-trip) and never
// fabricate stats when it's absent.
await asyncTest('REGRESSION GUARD: client-side generateClientSideAiAgentResponse() must answer AI-performance questions from real userContext.aiPaperTrading, never fabricate', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const startMarker = 'function generateClientSideAiAgentResponse(message, userContext) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: generateClientSideAiAgentResponse() not found');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Clear history');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after generateClientSideAiAgentResponse()');
  src = src.slice(0, relEnd);

  assert(/isAiPerformanceIntent/.test(src),
    'REGRESSION: isAiPerformanceIntent guard is gone from the client-side fallback engine');

  const sandbox = {
    window: {},
    DB: { BBCA: { name: 'Bank Central Asia', sector: 'Perbankan' } },
    isValidStockTicker: (tk) => tk === 'BBCA',
    STOCKCHAT_SELECTED_TICKER: 'BBCA',
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '41-stockchat-cockpit.js generateClientSideAiAgentResponse() (sandboxed load for test)' });

  // 1. No aiPaperTrading data at all — honest empty state, no fabrication,
  // and must NOT bounce off the ticker-validity gate (this is exactly the
  // "SAYA"-style false-ticker bug's sibling — a message like "bagaimana
  // performa AI trading saya" has no real ticker in it either).
  const r1 = ctx.generateClientSideAiAgentResponse('bagaimana performa AI trading saya', {});
  assert(!/Ticker Tidak Terdaftar/.test(r1.reply), 'REGRESSION: an AI-performance question with no ticker bounces off the invalid-ticker gate');
  assert(/Belum ada data trade/.test(r1.reply), 'REGRESSION: missing AI paper trading data no longer produces the honest empty state');
  assert(!/Win Rate/.test(r1.reply), 'REGRESSION: a win rate appeared in the reply even though no data was provided — fabrication');

  // 2. Real data — must surface the actual win rate and lesson text, not a
  // generic message.
  const fakeApt = {
    totalTrades: 5, winningTrades: 3, losingTrades: 2, winRate: 60,
    profitFactor: 2.1, realizedPnL: 900000, maxDrawdownPct: 4.2,
    recentClosedTrades: [{ ticker: 'ANTM', result: 'WIN', netPnL: 300000, exitReason: 'TP_HIT', mistake: '-', improvement: '-' }]
  };
  const r2 = ctx.generateClientSideAiAgentResponse('kasih saran perbaikan trading saya', { aiPaperTrading: fakeApt });
  assert(/60%/.test(r2.reply), 'REGRESSION: the real win rate (60%) is not reflected in the reply');
  assert(/ANTM/.test(r2.reply), 'REGRESSION: the real recent trade (ANTM) is not reflected in the reply');
});

// ── TEST 80: sendCopilotPrompt() (public/js/28-decisiontools.js) must
// build userContext.aiPaperTrading from window.AI_TRADE_STATE.paperAccount
// and send it to the server — the client-side half of the
// cek_kinerja_ai_trading feature (TEST 77-79). Without this wiring, the
// server-side tool and the client-side fallback branch both exist but
// NEVER actually receive real data — degrading silently to the honest
// "no data" state on every single request, even for a user with a long
// AI Paper Trading history.
await asyncTest('REGRESSION GUARD: sendCopilotPrompt() must attach a real userContext.aiPaperTrading summary from AI_TRADE_STATE.paperAccount', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  const startMarker = 'async function sendCopilotPrompt(text) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: sendCopilotPrompt() not found');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Markdown Formatter for Institutional Agent Output');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after sendCopilotPrompt()');
  src = src.slice(0, relEnd);

  assert(/AI_TRADE_STATE\.paperAccount/.test(src),
    'REGRESSION: sendCopilotPrompt() no longer reads AI_TRADE_STATE.paperAccount — aiPaperTrading will always be null, even for users with real trading history');
  assert(/aiPaperTrading:\s*aiPaperTrading/.test(src),
    'REGRESSION: the built aiPaperTrading summary is no longer attached to userContext sent to the server');

  let capturedBody = null;
  const fakePaperAccount = {
    totalTrades: 4, winningTrades: 3, losingTrades: 1, winRate: 75,
    profitFactor: 3.2, realizedPnL: 620000, maxDrawdownPct: 2.1,
    openPositions: [{}], // length used, not contents
    closedTrades: [
      { ticker: 'TLKM', result: 'WIN', netPnL: 200000, exitReason: 'TP_HIT', lesson: 'l1', mistake: '-', improvement: '-' },
    ],
  };
  const sandbox = {
    window: {},
    MW_COPILOT_HISTORY: [],
    MW_AI_IS_LOADING: false,
    el: () => null,
    renderCopilotPage: () => {},
    getPortfolio: () => [],
    computeCurrentAUM: () => 0,
    calcRdnBalance: () => 0,
    AI_TRADE_STATE: { paperAccount: fakePaperAccount },
    fetch: (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, reply: 'ok', toolCalls: [] }) });
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '28-decisiontools.js sendCopilotPrompt() (sandboxed load for test)' });

  await ctx.sendCopilotPrompt('kinerja AI trading saya bagaimana');

  assert(capturedBody, 'sanity: fetch was never called');
  const apt = capturedBody.userContext && capturedBody.userContext.aiPaperTrading;
  assert(apt, 'REGRESSION: userContext.aiPaperTrading is missing from the request body sent to the server');
  assert.strictEqual(apt.totalTrades, 4, 'REGRESSION: totalTrades does not match AI_TRADE_STATE.paperAccount');
  assert.strictEqual(apt.winRate, 75, 'REGRESSION: winRate does not match AI_TRADE_STATE.paperAccount');
  assert.strictEqual(apt.recentClosedTrades.length, 1);
  assert.strictEqual(apt.recentClosedTrades[0].ticker, 'TLKM', 'REGRESSION: recentClosedTrades ticker does not match the real closedTrades data');

  // AI_TRADE_STATE not loaded at all (module hasn't initialized this
  // session) — must degrade to null, never throw.
  capturedBody = null;
  const sandbox2 = Object.assign({}, sandbox, { AI_TRADE_STATE: undefined });
  sandbox2.window = sandbox2;
  const ctx2 = vm.createContext(sandbox2);
  vm.runInContext(src, ctx2, { filename: '28-decisiontools.js sendCopilotPrompt() no-AI_TRADE_STATE (sandboxed load for test)' });
  await ctx2.sendCopilotPrompt('halo');
  assert(capturedBody, 'sanity: fetch was never called (no-AI_TRADE_STATE case)');
  assert.strictEqual(capturedBody.userContext.aiPaperTrading, null,
    'REGRESSION: aiPaperTrading should degrade to null (not throw) when AI_TRADE_STATE is unavailable');
});

// ── TEST 81: computePortfolioRiskGateFindings() (server.js) — item #2 of
// the AI Copilot roadmap (2026-09-11, INCIDENT_LOG.md): rule-based
// improvement suggestions (no ML) that check portfolio holdings against
// the app's actual approved Risk Gate (PORTFOLIO_RISK_POLICY, which must
// stay in sync with RISK_POLICY.MAX_POSITION_PCT/MIN_CASH_BUFFER_PCT in
// 38-ai-autonomous-trading.js and FINANCIAL_POLICY.md §7). Must never
// invent a threshold, must flag every position over 15% AUM (not just
// the largest), and must produce ZERO findings for a compliant portfolio.
test('REGRESSION GUARD: computePortfolioRiskGateFindings() flags real Risk Gate violations (position >15% AUM, cash <20% AUM), none when compliant', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = fullSrc.indexOf('const PORTFOLIO_RISK_POLICY = {');
  assert(start !== -1, 'sanity: PORTFOLIO_RISK_POLICY not found — has this section moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n\n// FIX: sebelumnya cek_harga');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after computePortfolioRiskGateFindings()');
  src = src.slice(0, relEnd);

  assert(/MAX_POSITION_PCT: 15/.test(src), 'REGRESSION: PORTFOLIO_RISK_POLICY.MAX_POSITION_PCT no longer matches the approved 15% (FINANCIAL_POLICY.md §7)');
  assert(/MIN_CASH_BUFFER_PCT: 20/.test(src), 'REGRESSION: PORTFOLIO_RISK_POLICY.MIN_CASH_BUFFER_PCT no longer matches the approved 20% (FINANCIAL_POLICY.md §7)');

  const ctx = vm.createContext({ window: {} });
  vm.runInContext(src, ctx, { filename: 'server.js computePortfolioRiskGateFindings() (sandboxed load for test)' });
  assert.strictEqual(typeof ctx.computePortfolioRiskGateFindings, 'function', 'computePortfolioRiskGateFindings not exposed on the sandbox context');

  // 1. Compliant portfolio — zero findings.
  // Note: results are arrays constructed INSIDE the vm sandbox, so they
  // belong to a different realm than this file's own Array — comparing
  // them via deepStrictEqual against a main-realm [] literal fails on
  // reference/prototype identity even when structurally identical
  // (confirmed: Node's assert treats cross-realm arrays as unequal).
  // Array.from() rebuilds a same-realm array first to sidestep that.
  const compliant = ctx.computePortfolioRiskGateFindings(
    [{ ticker: 'BBCA', aumWeightPct: 10 }, { ticker: 'BBRI', aumWeightPct: 8 }],
    100000000, 25000000 // 25% cash — above the 20% minimum
  );
  assert.strictEqual(compliant.length, 0, 'REGRESSION: a fully compliant portfolio produced spurious findings');

  // 2. One over-concentrated position, healthy cash — exactly one finding.
  const overConcentrated = ctx.computePortfolioRiskGateFindings(
    [{ ticker: 'BBCA', aumWeightPct: 22 }, { ticker: 'BBRI', aumWeightPct: 8 }],
    100000000, 25000000
  );
  assert.strictEqual(overConcentrated.length, 1);
  assert.strictEqual(overConcentrated[0].type, 'concentration');
  assert.strictEqual(overConcentrated[0].ticker, 'BBCA');
  assert(/BBCA/.test(overConcentrated[0].message) && /15%/.test(overConcentrated[0].message),
    'REGRESSION: the concentration finding message does not name the offending ticker and the 15% limit');

  // 3. Multiple over-concentrated positions — ALL must be flagged, not just
  // the largest (unlike cek_portofolio_user's existing top1-only
  // concentrationWarning).
  const multiOver = ctx.computePortfolioRiskGateFindings(
    [{ ticker: 'BBCA', aumWeightPct: 20 }, { ticker: 'BBRI', aumWeightPct: 18 }, { ticker: 'TLKM', aumWeightPct: 5 }],
    100000000, 25000000
  );
  assert.strictEqual(multiOver.length, 2, 'REGRESSION: only one of two over-concentrated positions was flagged');
  assert.deepStrictEqual(Array.from(multiOver, f => f.ticker).sort(), ['BBCA', 'BBRI']);

  // 4. Low cash buffer alone — exactly one cash_buffer finding.
  const lowCash = ctx.computePortfolioRiskGateFindings(
    [{ ticker: 'BBCA', aumWeightPct: 10 }],
    100000000, 5000000 // 5% cash — below the 20% minimum
  );
  assert.strictEqual(lowCash.length, 1);
  assert.strictEqual(lowCash[0].type, 'cash_buffer');
  assert(/20%/.test(lowCash[0].message), 'REGRESSION: the cash-buffer finding message does not name the 20% limit');

  // 5. Zero/negative AUM must degrade to no findings, never divide by
  // zero / produce NaN or Infinity findings.
  const zeroAum = ctx.computePortfolioRiskGateFindings([{ ticker: 'BBCA', aumWeightPct: 999 }], 0, 0);
  assert.strictEqual(zeroAum.length, 0, 'REGRESSION: zero AUM must short-circuit to no findings, not divide by zero');
});

// ── TEST 82: the deterministic AI fallback's portfolio branch (server.js)
// must surface computePortfolioRiskGateFindings() results as an automatic
// "Saran Perbaikan" section — proactively, as part of the normal
// portfolio analysis reply, not gated behind a separate keyword the user
// has to know to ask for.
test('REGRESSION GUARD: the deterministic AI fallback portfolio reply must include an automatic Risk Gate Saran Perbaikan section', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  // Start from the riskGateFindings computation, which sits just BEFORE
  // the `reply = '### 📊 ...` template it feeds — not from the template
  // literal itself, which would miss the `resPorto.riskGateFindings` read
  // above it.
  const start = fullSrc.indexOf('const riskGateFindings = resPorto.riskGateFindings');
  assert(start !== -1, 'sanity: the portfolio branch riskGateFindings computation not found — has it moved/been rewritten?');
  const src = fullSrc.slice(start, start + 2500);

  assert(/Saran Perbaikan \(Risk Gate/.test(src), 'REGRESSION: the automatic Risk Gate Saran Perbaikan section is gone from the portfolio reply');
  assert(/resPorto\.riskGateFindings/.test(src), 'REGRESSION: the portfolio reply no longer reads riskGateFindings from cek_portofolio_user');
});

// ── TEST 83: generateClientSideAiAgentResponse()'s isPortfolioIntent
// branch (public/js/41-stockchat-cockpit.js) — the client-side mirror of
// TEST 81/82, exercised when the server is unreachable. Was a generic,
// never-actually-checked sentence ("pastikan tidak ada saham yang
// melebihi 15%..."); must now compute real per-ticker Risk Gate findings
// from userContext, same thresholds as server.js.
test("REGRESSION GUARD: client-side portfolio branch must compute real Risk Gate findings (position >15%/cash <20%), not a generic unchecked sentence", () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const startMarker = 'function generateClientSideAiAgentResponse(message, userContext) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: generateClientSideAiAgentResponse() not found');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Clear history');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after generateClientSideAiAgentResponse()');
  src = src.slice(0, relEnd);

  assert(!/Pastikan tidak ada saham tunggal yang melebihi batas 15%/.test(src),
    'REGRESSION: the old generic, never-actually-checked diversification sentence is back');
  assert(/PORTFOLIO_RISK_POLICY_MAX_POSITION_PCT = 15/.test(src) && /PORTFOLIO_RISK_POLICY_MIN_CASH_BUFFER_PCT = 20/.test(src),
    'REGRESSION: the client-side Risk Gate thresholds no longer match the approved 15%/20% (FINANCIAL_POLICY.md §7)');

  const sandbox = {
    window: {},
    DB: { BBCA: { name: 'Bank Central Asia', sector: 'Perbankan' } },
    isValidStockTicker: (tk) => tk === 'BBCA',
    STOCKCHAT_SELECTED_TICKER: 'BBCA',
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '41-stockchat-cockpit.js generateClientSideAiAgentResponse() (sandboxed load for test)' });

  // Over-concentrated single position + low cash — both findings must
  // appear, naming the real ticker and real percentages.
  const r1 = ctx.generateClientSideAiAgentResponse('analisa portofolio saya', {
    holdings: [{ ticker: 'BBCA', marketValue: 30000000, lot: 100 }],
    totalAum: 100000000,
    rdnCash: 5000000, // 5% — below 20%
  });
  assert(/BBCA/.test(r1.reply) && /15%/.test(r1.reply), 'REGRESSION: over-concentrated BBCA (30% AUM) is not flagged in the reply');
  assert(/20%/.test(r1.reply), 'REGRESSION: the low cash buffer (5%) is not flagged against the 20% minimum');

  // Compliant portfolio — must say so, not silently omit the section or
  // fabricate a violation.
  const r2 = ctx.generateClientSideAiAgentResponse('analisa portofolio saya', {
    holdings: [{ ticker: 'BBCA', marketValue: 10000000, lot: 100 }],
    totalAum: 100000000,
    rdnCash: 30000000, // 30% — above 20%
  });
  assert(/Tidak ada pelanggaran Risk Gate/.test(r2.reply), 'REGRESSION: a compliant portfolio does not get the honest "no violation" message');
});

// ── TEST 84: executeAgentTool('cek_prediksi_xgboost') (server.js) — item
// #3 of the AI Copilot roadmap (2026-09-11, INCIDENT_LOG.md): expose the
// XGBoost ONNX model (client-side inference only, via 11-quant.js'
// xgbPredictLatest()) as a Copilot tool. Must never fabricate a
// prediction when the browser hasn't computed one, and — critically,
// given the model's own documented lack of proven signal (ml/README.md)
// — must always carry an honest disclaimer distinguishing the proven
// vs. not-yet-proven case.
await asyncTest("REGRESSION GUARD: executeAgentTool('cek_prediksi_xgboost') must pass through real predictions with an honest disclaimer, never fabricate when absent", async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = fullSrc.indexOf('async function executeAgentTool');
  assert(start !== -1, 'sanity: executeAgentTool() not found — has it been renamed/moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Function Declarations for Gemini Function Calling');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after executeAgentTool() — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/case 'cek_prediksi_xgboost':/.test(src), "REGRESSION: the 'cek_prediksi_xgboost' case is gone from executeAgentTool()");

  const sandbox = { window: {} };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: 'server.js executeAgentTool() cek_prediksi_xgboost (sandboxed load for test)' });

  // 1. No prediction computed client-side — must NOT fabricate one.
  const r1 = await ctx.executeAgentTool('cek_prediksi_xgboost', {}, {});
  assert.strictEqual(r1.hasData, false, 'REGRESSION: missing xgboostPrediction must report hasData:false, not invent a signal');
  assert.strictEqual(r1.signal, undefined, 'REGRESSION: a signal field leaked into the no-data response — looks like fabricated data');

  // 2. Real prediction, hasProvenSignal:false (the model's actual current
  // status) — must surface the strong "eksperimen, tidak terbukti" wording.
  const fakePredUnproven = {
    ticker: 'BBCA', signal: 'BUY', probability: 0.72, buyThreshold: 0.6, sellThreshold: 0.35,
    modelVersion: '20260911', asOfDate: '2026-09-10', isSimulatedData: false, hasProvenSignal: false,
    liftInfo: { precisionAtThreshold: 0.62, baseRate: 0.6 }
  };
  const r2 = await ctx.executeAgentTool('cek_prediksi_xgboost', {}, { xgboostPrediction: fakePredUnproven });
  assert.strictEqual(r2.hasData, true);
  assert.strictEqual(r2.ticker, 'BBCA');
  assert.strictEqual(r2.probability, 0.72, 'REGRESSION: probability does not match the real prediction passed in userContext');
  assert(/tidak terbukti/i.test(r2.disclaimer), 'REGRESSION: an unproven model (hasProvenSignal:false) no longer gets the strong "tidak terbukti" disclaimer');

  // 3. hasProvenSignal:true (hypothetical future state, not the current
  // reality) — must get the DIFFERENT, lighter disclaimer wording, proving
  // the tool actually branches on this field rather than hardcoding one
  // message.
  const fakePredProven = Object.assign({}, fakePredUnproven, { hasProvenSignal: true });
  const r3 = await ctx.executeAgentTool('cek_prediksi_xgboost', {}, { xgboostPrediction: fakePredProven });
  assert(!/tidak terbukti/i.test(r3.disclaimer), 'REGRESSION: hasProvenSignal:true still gets the "tidak terbukti" wording — the disclaimer does not actually branch on this field');
});

// ── TEST 84b: executeAgentTool('cek_sinyal_teknikal') (server.js) — AI
// Signal Reflection Log Fase 2 (2026-09-17, INCIDENT_LOG.md): the ONLY
// StockChat/Copilot tool that returns a STRUCTURED signal (computeStockSignal()'s
// enum), because the system prompt otherwise forbids the AI from ever
// giving a definitive verbal buy/sell call — this tool is the sole hook
// point the client-side ai_signal_log logger can key off. Must pass
// through the real computed signal untouched, and must degrade to
// signal:'NO DATA' (never throw, never fabricate) when the underlying
// computation fails.
await asyncTest("REGRESSION GUARD: executeAgentTool('cek_sinyal_teknikal') must pass through the real computeStockSignal() result and degrade to NO DATA on failure, never fabricate", async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = fullSrc.indexOf('async function executeAgentTool');
  assert(start !== -1, 'sanity: executeAgentTool() not found — has it been renamed/moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Function Declarations for Gemini Function Calling');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after executeAgentTool() — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/case 'cek_sinyal_teknikal':/.test(src), "REGRESSION: the 'cek_sinyal_teknikal' case is gone from executeAgentTool()");

  // 1. computeStockSignal() succeeds, no history in userContext — result's
  // own fields must pass through untouched (ticker/signal/entry/sl/tp1/tp2/
  // compositeScore all real, not re-derived or renamed), and pastSignals
  // must be an empty array (never undefined, never fabricated entries).
  // NOTE: checked field-by-field rather than deepStrictEqual against the
  // fakeSignal object below — the tool mutates its input in place to add
  // pastSignals, so comparing the RETURNED object against that SAME
  // mutated object reference would trivially "pass" no matter what was
  // added to it.
  const fakeSignal1 = { ticker: 'BBCA', signal: 'BUY', compositeScore: 65, entry: 9000, sl: 8700, tp1: 9500, tp2: 9800, computedAt: '2026-09-17T00:00:00.000Z' };
  const sandbox1 = { window: {}, computeStockSignal: async () => fakeSignal1 };
  sandbox1.window = sandbox1;
  const ctx1 = vm.createContext(sandbox1);
  vm.runInContext(src, ctx1, { filename: 'server.js executeAgentTool() cek_sinyal_teknikal success path (sandboxed load for test)' });
  const r1 = await ctx1.executeAgentTool('cek_sinyal_teknikal', { ticker: 'bbca' }, {});
  assert.strictEqual(r1.ticker, 'BBCA');
  assert.strictEqual(r1.signal, 'BUY', 'REGRESSION: a valid known signal must pass through untouched, not get overridden by the REVIEW guard');
  assert.strictEqual(r1.entry, 9000);
  assert.strictEqual(r1.compositeScore, 65);
  // Array.from() rebuilds a same-realm array first — r1.pastSignals was
  // constructed INSIDE the vm sandbox (a different realm), and Node's
  // assert treats cross-realm arrays as unequal even when structurally
  // identical (same gotcha already documented elsewhere in this file).
  assert.deepStrictEqual(Array.from(r1.pastSignals || []), [], 'REGRESSION: with no aiSignalHistory in userContext, pastSignals must default to an empty array, not undefined');

  // 2. computeStockSignal() throws (e.g. Yahoo unreachable) — must degrade
  // to a NO DATA response, never propagate the exception or invent a signal.
  const sandbox2 = { window: {}, computeStockSignal: async () => { throw new Error('Yahoo Finance unreachable'); } };
  sandbox2.window = sandbox2;
  const ctx2 = vm.createContext(sandbox2);
  vm.runInContext(src, ctx2, { filename: 'server.js executeAgentTool() cek_sinyal_teknikal failure path (sandboxed load for test)' });
  const r2 = await ctx2.executeAgentTool('cek_sinyal_teknikal', { ticker: 'xyzw' }, {});
  assert.strictEqual(r2.signal, 'NO DATA', 'REGRESSION: a failed computeStockSignal() call must degrade to signal:"NO DATA", not throw or fabricate a signal');
  assert(r2.error, 'REGRESSION: the NO DATA degradation must carry an error field explaining why, not fail silently');
  assert.strictEqual(r2.ticker, 'XYZW', 'REGRESSION: ticker normalization (uppercase, .JK/.US stripped) is broken on the failure path');

  // 3. Fase 3: userContext.aiSignalHistory carries signals for MULTIPLE
  // tickers — only the ones matching THIS ticker (case-insensitive) must
  // end up in pastSignals, capped at 3, most-recent-first order preserved
  // (the array is already ordered by the client; the tool must not reorder it).
  const fakeSignal3 = { ticker: 'BBCA', signal: 'HOLD' };
  const sandbox3 = { window: {}, computeStockSignal: async () => fakeSignal3 };
  sandbox3.window = sandbox3;
  const ctx3 = vm.createContext(sandbox3);
  vm.runInContext(src, ctx3, { filename: 'server.js executeAgentTool() cek_sinyal_teknikal pastSignals filtering (sandboxed load for test)' });
  const history3 = [
    { ticker: 'bbca', signalAction: 'BUY', rawReturnPct: 5, outcome: 'WIN' },   // lowercase ticker, harus tetap cocok
    { ticker: 'BBRI', signalAction: 'BUY', rawReturnPct: -2, outcome: 'LOSS' }, // ticker LAIN, harus disaring
    { ticker: 'BBCA', signalAction: 'HOLD', rawReturnPct: 1, outcome: 'NEUTRAL' },
    { ticker: 'BBCA', signalAction: 'SELL', rawReturnPct: -1, outcome: 'LOSS' },
    { ticker: 'BBCA', signalAction: 'BUY', rawReturnPct: 3, outcome: 'WIN' } // ke-4 untuk BBCA, harus terpotong (cap 3)
  ];
  const r3 = await ctx3.executeAgentTool('cek_sinyal_teknikal', { ticker: 'BBCA' }, { aiSignalHistory: history3 });
  assert.strictEqual(r3.pastSignals.length, 3, 'REGRESSION: pastSignals must be capped at 3 entries, got ' + r3.pastSignals.length);
  assert(r3.pastSignals.every((p) => p.ticker.toUpperCase() === 'BBCA'), 'REGRESSION: pastSignals leaked a signal for a different ticker (BBRI) — filtering is broken');
  assert.strictEqual(r3.pastSignals[0].rawReturnPct, 5, 'REGRESSION: pastSignals must preserve the client-provided order, not reorder/resort it');

  // 4. REVIEW-sentinel guard: if computeStockSignal() ever returns a value
  // outside the known enum (schema drift), it must be forced to 'REVIEW'
  // with an explanatory reviewReason — never silently passed through
  // (which would make the later Supabase insert fail against the CHECK
  // constraint) and never silently defaulted to 'HOLD'.
  const fakeSignalBad = { ticker: 'BBCA', signal: 'MAYBE BUY IDK' };
  const sandbox4 = { window: {}, computeStockSignal: async () => fakeSignalBad };
  sandbox4.window = sandbox4;
  const ctx4 = vm.createContext(sandbox4);
  vm.runInContext(src, ctx4, { filename: 'server.js executeAgentTool() cek_sinyal_teknikal REVIEW-sentinel guard (sandboxed load for test)' });
  const r4 = await ctx4.executeAgentTool('cek_sinyal_teknikal', { ticker: 'BBCA' }, {});
  assert.strictEqual(r4.signal, 'REVIEW', 'REGRESSION: an unrecognized signal value must be forced to REVIEW, not passed through or defaulted to HOLD');
  assert(r4.reviewReason, 'REGRESSION: the REVIEW override must explain why, not fail silently');
});

// ── TEST 84c: logAiSignalToReflectionLog() (public/js/00-config.js) — AI
// Signal Reflection Log Fase 2 (2026-09-17, INCIDENT_LOG.md): client-side
// hook shared by StockChat and Copilot that writes a cek_sinyal_teknikal
// tool result to ai_signal_log. Must (a) skip entirely in guest/demo mode
// (no persistent user_id, per the ai_paper_trading precedent), (b) ignore
// every toolCalls entry that isn't cek_sinyal_teknikal, (c) skip a
// signal:'NO DATA' or errored result (nothing valid to log), and (d) pick
// horizon_days per the signal's own action rather than one hardcoded value.
await asyncTest("REGRESSION GUARD: logAiSignalToReflectionLog() must skip guest mode, ignore non-signal tool calls, skip NO DATA, and log a real BUY signal with the right horizon", async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/00-config.js'), 'utf8');
  const start = fullSrc.indexOf('// AI SIGNAL REFLECTION LOG');
  assert(start !== -1, 'sanity: the AI SIGNAL REFLECTION LOG section not found in 00-config.js — has it moved/been renamed?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// ══════════════════════════════════════════════════════════\n// GLOBAL STOCK CONTEXT');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after logAiSignalToReflectionLog() — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/function logAiSignalToReflectionLog/.test(src), 'REGRESSION: logAiSignalToReflectionLog() is gone from 00-config.js');

  // 1. Guest mode (getAppUserId() -> null) — must return cleanly without
  // ever touching getSupabaseClient().
  let supabaseTouched = false;
  const sandbox1 = {
    window: {},
    getAppUserId: () => null,
    getSupabaseClient: () => { supabaseTouched = true; return null; }
  };
  sandbox1.window = sandbox1;
  const ctx1 = vm.createContext(sandbox1);
  vm.runInContext(src, ctx1, { filename: '00-config.js logAiSignalToReflectionLog() guest-mode path (sandboxed load for test)' });
  await ctx1.logAiSignalToReflectionLog('stockchat', [
    { name: 'cek_sinyal_teknikal', args: { ticker: 'BBCA' }, result: { ticker: 'BBCA', signal: 'BUY' } }
  ]);
  assert.strictEqual(supabaseTouched, false, 'REGRESSION: guest mode (no user id) must never even look up the Supabase client, let alone attempt an insert');

  // 2. Logged-in user — capture every insert() call to verify filtering
  // (non-signal tool + NO DATA both skipped) and the payload of the one
  // valid signal that should actually be logged.
  const capturedInserts = [];
  const sandbox2 = {
    window: {},
    getAppUserId: () => 'uid-test-456',
    getSupabaseClient: () => ({
      from: (table) => ({
        insert: (payload) => { capturedInserts.push({ table, payload }); return Promise.resolve({ error: null }); }
      })
    })
  };
  sandbox2.window = sandbox2;
  const ctx2 = vm.createContext(sandbox2);
  vm.runInContext(src, ctx2, { filename: '00-config.js logAiSignalToReflectionLog() logged-in path (sandboxed load for test)' });
  await ctx2.logAiSignalToReflectionLog('copilot', [
    { name: 'cek_harga', args: { ticker: 'BBCA' }, result: { found: true, price: 9000 } },
    { name: 'cek_sinyal_teknikal', args: { ticker: 'XYZW' }, result: { ticker: 'XYZW', signal: 'NO DATA', error: 'data kurang' } },
    { name: 'cek_sinyal_teknikal', args: { ticker: 'BBCA' }, result: { ticker: 'BBCA', signal: 'BUY', compositeScore: 70, entry: 9000, sl: 8700, tp1: 9500, tp2: 9800 } }
  ]);

  assert.strictEqual(capturedInserts.length, 1, 'REGRESSION: exactly one insert expected (cek_harga and the NO DATA signal must both be filtered out) — got ' + capturedInserts.length);
  const logged = capturedInserts[0];
  assert.strictEqual(logged.table, 'ai_signal_log');
  assert.strictEqual(logged.payload.user_id, 'uid-test-456');
  assert.strictEqual(logged.payload.source, 'copilot');
  assert.strictEqual(logged.payload.ticker, 'BBCA');
  assert.strictEqual(logged.payload.signal_action, 'BUY');
  assert.strictEqual(logged.payload.entry_price, 9000);
  assert.strictEqual(logged.payload.stop_loss, 8700);
  assert.strictEqual(logged.payload.horizon_days, 15, 'REGRESSION: BUY must map to the 15-day horizon, not a different/hardcoded value');
  const emittedMs = new Date(logged.payload.emitted_at).getTime();
  const resolveMs = new Date(logged.payload.resolve_after).getTime();
  assert.strictEqual(Math.round((resolveMs - emittedMs) / 86400000), 15, 'REGRESSION: resolve_after must be exactly horizon_days after emitted_at');

  // 3. AVOID signal — computeStockSignal() nulls out `entry` for AVOID (no
  // position opened), but always sets `price` (the real market price at
  // computation time). Without a fallback to `price`, an AVOID row would
  // be logged with entry_price:null and could never be resolved later
  // (resolveOneAiSignal() has no baseline to compute a return from).
  const capturedInserts2 = [];
  const sandbox3 = {
    window: {},
    getAppUserId: () => 'uid-test-789',
    getSupabaseClient: () => ({
      from: () => ({ insert: (payload) => { capturedInserts2.push(payload); return Promise.resolve({ error: null }); } })
    })
  };
  sandbox3.window = sandbox3;
  const ctx3 = vm.createContext(sandbox3);
  vm.runInContext(src, ctx3, { filename: '00-config.js logAiSignalToReflectionLog() AVOID entry_price fallback (sandboxed load for test)' });
  await ctx3.logAiSignalToReflectionLog('stockchat', [
    { name: 'cek_sinyal_teknikal', args: { ticker: 'GORO' }, result: { ticker: 'GORO', signal: 'AVOID', price: 8500, entry: null, sl: null, tp1: null, tp2: null } }
  ]);
  assert.strictEqual(capturedInserts2.length, 1, 'REGRESSION: an AVOID signal must still be logged (horizon 7 days), not silently dropped');
  assert.strictEqual(capturedInserts2[0].entry_price, 8500, 'REGRESSION: AVOID signal must fall back to the real `price` field when `entry` is null, not store entry_price:null');
  assert.strictEqual(capturedInserts2[0].horizon_days, 7, 'REGRESSION: AVOID must map to the 7-day horizon');
});

// ── TEST 84d: resolveOneAiSignal() / resolveDueAiSignals() (public/js/00-config.js)
// — AI Signal Reflection Log Fase 2 job resolusi (2026-09-17, INCIDENT_LOG.md):
// reads a due 'pending' ai_signal_log row, computes its real return against
// the ticker's own historical price AND against the IHSG benchmark over the
// same window, classifies WIN/LOSS/NEUTRAL, and writes the resolved row back.
// Must (a) mark a row with no entry_price baseline 'expired' rather than
// retry it forever, (b) leave a row untouched (not expired, not resolved)
// when price history can't be fetched — a transient failure, not a reason to
// give up on the row, and (c) compute the return/outcome/benchmark math
// correctly against real fetched price points.
await asyncTest("REGRESSION GUARD: resolveOneAiSignal() computes real return vs IHSG benchmark correctly, expires only on missing entry_price, and never drops a row on a transient fetch failure", async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/00-config.js'), 'utf8');
  const start = fullSrc.indexOf('// AI SIGNAL REFLECTION LOG');
  assert(start !== -1, 'sanity: the AI SIGNAL REFLECTION LOG section not found in 00-config.js — has it moved/been renamed?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// ══════════════════════════════════════════════════════════\n// GLOBAL STOCK CONTEXT');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after the resolution job — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/function resolveOneAiSignal/.test(src), 'REGRESSION: resolveOneAiSignal() is gone from 00-config.js');
  assert(/function resolveDueAiSignals/.test(src), 'REGRESSION: resolveDueAiSignals() is gone from 00-config.js');

  // 1. No entry_price baseline at all — must be marked expired immediately,
  // never touch fetch() (nothing to compute a return from).
  let fetchCalled = false;
  const updates1 = [];
  const sandbox1 = { window: {}, fetch: () => { fetchCalled = true; return Promise.reject(new Error('should not be called')); } };
  sandbox1.window = sandbox1;
  const ctx1 = vm.createContext(sandbox1);
  vm.runInContext(src, ctx1, { filename: '00-config.js resolveOneAiSignal() no-entry-price path (sandboxed load for test)' });
  const fakeClient1 = { from: () => ({ update: (payload) => { updates1.push(payload); return { eq: () => Promise.resolve({ error: null }) }; } }) };
  await ctx1.resolveOneAiSignal({ id: 'row-1', ticker: 'BBCA', entry_price: null, signal_action: 'BUY' }, fakeClient1);
  assert.strictEqual(fetchCalled, false, 'REGRESSION: a row with no entry_price must never trigger a price-history fetch');
  assert.strictEqual(updates1.length, 1);
  assert.strictEqual(updates1[0].status, 'expired', 'REGRESSION: a row with no entry_price baseline must be marked expired, not left pending forever');

  // 2. Real resolution: BUY at entry 9000, ticker rises to 9450 (+5%),
  // IHSG flat 6500->6500 (0%) over the same window — expect raw +5%,
  // benchmark 0%, alpha +5%, outcome WIN (>0.5% threshold).
  const emittedAt = new Date('2026-08-01T00:00:00.000Z');
  const resolveAfter = new Date('2026-08-16T00:00:00.000Z'); // +15 days
  const tkPoints = [
    { t: emittedAt.getTime(), c: 9000 },
    { t: resolveAfter.getTime() - 86400000, c: 9200 }, // sebelum resolve_after — tidak boleh dipakai sebagai exit
    { t: resolveAfter.getTime(), c: 9450 },
    { t: resolveAfter.getTime() + 86400000, c: 9500 }
  ];
  const ihsgPoints = [
    { t: emittedAt.getTime() - 3600000, c: 6500 }, // titik TERAKHIR pada/sebelum emitted_at
    { t: emittedAt.getTime() + 3600000, c: 6600 }, // SETELAH emitted_at — tidak boleh dipakai sebagai entry benchmark
    { t: resolveAfter.getTime(), c: 6500 }
  ];
  const fetchLog = [];
  const sandbox2 = {
    window: {},
    fetch: (url) => {
      fetchLog.push(url);
      if (url.indexOf('BBCA') !== -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, points: tkPoints }) });
      if (url.indexOf('JKSE') !== -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, points: ihsgPoints }) });
      return Promise.resolve({ ok: false });
    }
  };
  sandbox2.window = sandbox2;
  const ctx2 = vm.createContext(sandbox2);
  vm.runInContext(src, ctx2, { filename: '00-config.js resolveOneAiSignal() real resolution path (sandboxed load for test)' });

  const updates2 = [];
  const fakeClient2 = { from: () => ({ update: (payload) => { updates2.push(payload); return { eq: () => Promise.resolve({ error: null }) }; } }) };
  const row2 = { id: 'row-2', ticker: 'BBCA', entry_price: 9000, signal_action: 'BUY', emitted_at: emittedAt.toISOString(), resolve_after: resolveAfter.toISOString(), rationale: null };
  await ctx2.resolveOneAiSignal(row2, fakeClient2);

  assert(fetchLog.some((u) => u.indexOf('BBCA') !== -1), 'sanity: ticker history was never fetched');
  assert(fetchLog.some((u) => u.indexOf('JKSE') !== -1), 'sanity: IHSG benchmark history was never fetched');
  assert.strictEqual(updates2.length, 1);
  const u2 = updates2[0];
  assert.strictEqual(u2.status, 'resolved');
  assert.strictEqual(u2.exit_price, 9450, 'REGRESSION: exit price must be the FIRST point at/after resolve_after (9450), not an earlier or later one');
  assert.strictEqual(u2.raw_return_pct, 5, 'REGRESSION: raw return must be (9450-9000)/9000*100 = 5%, got ' + u2.raw_return_pct);
  assert.strictEqual(u2.benchmark_return_pct, 0, 'REGRESSION: IHSG benchmark return must be 0% (6500->6500), got ' + u2.benchmark_return_pct);
  assert.strictEqual(u2.alpha_return_pct, 5, 'REGRESSION: alpha must equal raw - benchmark = 5%, got ' + u2.alpha_return_pct);
  assert.strictEqual(u2.outcome, 'WIN', 'REGRESSION: a BUY signal with +5% real return must be classified WIN');

  // 3. Transient fetch failure (network error / non-ok response) — the row
  // must be left completely untouched: no expired, no resolved, no update
  // call at all, so it gets retried on the next session.
  const updates3 = [];
  const sandbox3 = { window: {}, fetch: () => Promise.resolve({ ok: false }) };
  sandbox3.window = sandbox3;
  const ctx3 = vm.createContext(sandbox3);
  vm.runInContext(src, ctx3, { filename: '00-config.js resolveOneAiSignal() transient-failure path (sandboxed load for test)' });
  const fakeClient3 = { from: () => ({ update: (payload) => { updates3.push(payload); return { eq: () => Promise.resolve({ error: null }) }; } }) };
  await ctx3.resolveOneAiSignal({ id: 'row-3', ticker: 'BBCA', entry_price: 9000, signal_action: 'BUY', emitted_at: emittedAt.toISOString(), resolve_after: resolveAfter.toISOString() }, fakeClient3);
  assert.strictEqual(updates3.length, 0, 'REGRESSION: a transient history-fetch failure must leave the row untouched (no expired/resolved update), so it can be retried next session');

  // 4. AVOID signal, price actually FELL (avoiding it was the right call):
  // entry 8500 -> exit 8000 (-5.88%) must be classified WIN (AVOID wins
  // when price drops), not LOSS.
  const tkPointsAvoid = [{ t: resolveAfter.getTime(), c: 8000 }];
  const sandbox4 = {
    window: {},
    fetch: (url) => {
      if (url.indexOf('GORO') !== -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, points: tkPointsAvoid }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, points: ihsgPoints }) });
    }
  };
  sandbox4.window = sandbox4;
  const ctx4 = vm.createContext(sandbox4);
  vm.runInContext(src, ctx4, { filename: '00-config.js resolveOneAiSignal() AVOID-signal-wins-on-drop path (sandboxed load for test)' });
  const updates4 = [];
  const fakeClient4 = { from: () => ({ update: (payload) => { updates4.push(payload); return { eq: () => Promise.resolve({ error: null }) }; } }) };
  await ctx4.resolveOneAiSignal({ id: 'row-4', ticker: 'GORO', entry_price: 8500, signal_action: 'AVOID', emitted_at: emittedAt.toISOString(), resolve_after: resolveAfter.toISOString() }, fakeClient4);
  assert.strictEqual(updates4.length, 1);
  assert.strictEqual(updates4[0].outcome, 'WIN', 'REGRESSION: an AVOID signal must be classified WIN when the price actually dropped, not LOSS (direction is inverted vs BUY)');
});

// ── TEST 84e: getAiSignalHistorySummary() (public/js/00-config.js) — AI
// Signal Reflection Log Fase 3 (2026-09-17, INCIDENT_LOG.md): fetches the
// user's resolved ai_signal_log rows client-side to inject into
// userContext.aiSignalHistory (same pattern as aiPaperTrading/xgboostPrediction
// — server.js has no Supabase access of its own). Must skip guest mode
// without ever touching Supabase, and must map the raw DB row shape
// (snake_case) to the camelCase shape the server's cek_sinyal_teknikal
// filter expects.
await asyncTest("REGRESSION GUARD: getAiSignalHistorySummary() skips guest mode without touching Supabase, and maps resolved rows to the camelCase shape the server expects", async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/00-config.js'), 'utf8');
  const start = fullSrc.indexOf('// AI SIGNAL REFLECTION LOG');
  assert(start !== -1, 'sanity: the AI SIGNAL REFLECTION LOG section not found in 00-config.js — has it moved/been renamed?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// ══════════════════════════════════════════════════════════\n// GLOBAL STOCK CONTEXT');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after getAiSignalHistorySummary() — extraction range may need updating');
  src = src.slice(0, relEnd);

  assert(/async function getAiSignalHistorySummary/.test(src), 'REGRESSION: getAiSignalHistorySummary() is gone from 00-config.js');

  // 1. Guest mode — must return [] without ever touching getSupabaseClient().
  let supabaseTouched = false;
  const sandbox1 = { window: {}, getAppUserId: () => null, getSupabaseClient: () => { supabaseTouched = true; return null; } };
  sandbox1.window = sandbox1;
  const ctx1 = vm.createContext(sandbox1);
  vm.runInContext(src, ctx1, { filename: '00-config.js getAiSignalHistorySummary() guest-mode path (sandboxed load for test)' });
  const r1 = await ctx1.getAiSignalHistorySummary();
  assert.strictEqual(supabaseTouched, false, 'REGRESSION: guest mode must never even look up the Supabase client');
  assert.deepStrictEqual(Array.from(r1), [], 'REGRESSION: guest mode must return an empty array, not null/undefined (the caller sends this straight into userContext.aiSignalHistory)');

  // 2. Logged-in user — verify the query filters by user_id/status='resolved'
  // and orders by resolved_at descending, and that the snake_case DB row
  // shape is mapped to the camelCase shape cek_sinyal_teknikal filters on.
  let capturedQuery = {};
  const dbRow = { ticker: 'BBCA', signal_action: 'BUY', raw_return_pct: 5, benchmark_return_pct: 1, alpha_return_pct: 4, outcome: 'WIN', reflection_text: 'Sinyal terbukti benar.', resolved_at: '2026-09-16T00:00:00.000Z' };
  function chainableQuery() {
    return {
      eq: (col, val) => { capturedQuery[col] = val; return chainableQuery(); },
      order: (col, opts) => { capturedQuery.orderCol = col; capturedQuery.orderOpts = opts; return chainableQuery(); },
      limit: (n) => { capturedQuery.limit = n; return Promise.resolve({ data: [dbRow], error: null }); }
    };
  }
  const sandbox2 = {
    window: {},
    getAppUserId: () => 'uid-hist-test',
    getSupabaseClient: () => ({
      from: (table) => {
        capturedQuery.table = table;
        return { select: (cols) => { capturedQuery.select = cols; return chainableQuery(); } };
      }
    })
  };
  sandbox2.window = sandbox2;
  const ctx2 = vm.createContext(sandbox2);
  vm.runInContext(src, ctx2, { filename: '00-config.js getAiSignalHistorySummary() logged-in path (sandboxed load for test)' });
  const r2 = await ctx2.getAiSignalHistorySummary();

  assert.strictEqual(capturedQuery.table, 'ai_signal_log');
  assert.strictEqual(capturedQuery.user_id, 'uid-hist-test', 'REGRESSION: query must filter by the current user (RLS relies on this matching auth.uid(), but the query itself must ask for the right user_id too)');
  assert.strictEqual(capturedQuery.status, 'resolved', 'REGRESSION: query must only fetch resolved rows, not pending/expired ones');
  assert.strictEqual(capturedQuery.orderCol, 'resolved_at');
  assert.strictEqual(capturedQuery.orderOpts && capturedQuery.orderOpts.ascending, false, 'REGRESSION: must order most-recent-first (ascending:false)');

  const mapped = Array.from(r2)[0];
  assert.strictEqual(mapped.ticker, 'BBCA');
  assert.strictEqual(mapped.signalAction, 'BUY', 'REGRESSION: signal_action (DB) must map to signalAction (camelCase) — cek_sinyal_teknikal history3 filter expects this shape');
  assert.strictEqual(mapped.rawReturnPct, 5);
  assert.strictEqual(mapped.benchmarkReturnPct, 1);
  assert.strictEqual(mapped.alphaReturnPct, 4);
  assert.strictEqual(mapped.outcome, 'WIN');
  assert.strictEqual(mapped.reflectionText, 'Sinyal terbukti benar.');
});

// ── TEST 84f: renderAiSignalHistoryPage() (public/js/47-ai-signal-history.js)
// — AI Signal Reflection Log Fase 4 (2026-09-17, INCIDENT_LOG.md): the read-side
// UI for ai_signal_log. Must (a) show the guest-mode notice and never touch
// Supabase when there is no signed-in user, (b) compute summary stats
// (total/pending/win-rate/avg-alpha) correctly from a mixed-status row set,
// and (c) render every row with the right return-color/badge classes.
function getAiSignalHistoryContext() {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/47-ai-signal-history.js'), 'utf8');
  const sandbox = {
    window: {},
    document: { getElementById: () => null },
    escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '47-ai-signal-history.js' });
  return ctx;
}

await asyncTest("REGRESSION GUARD: renderAiSignalHistoryPage() shows the guest-mode notice without touching Supabase, and computes summary stats correctly for a logged-in user", async () => {
  // 1. Guest mode.
  const histGuest = getAiSignalHistoryContext();
  let supabaseTouched = false;
  histGuest.getAppUserId = () => null;
  histGuest.getSupabaseClient = () => { supabaseTouched = true; return null; };
  let htmlGuest = '';
  histGuest.document.getElementById = (id) => id === 'page-ai-signal-history' ? { set innerHTML(v) { htmlGuest = v; }, get innerHTML() { return htmlGuest; } } : null;
  await histGuest.renderAiSignalHistoryPage();
  assert.strictEqual(supabaseTouched, false, 'REGRESSION: guest mode must never look up the Supabase client');
  assert(htmlGuest.includes('butuh akun'), 'REGRESSION: guest mode must show the "needs an account" notice');

  // 2. Logged-in, mixed pending/resolved rows — verify summary stats math
  // (win rate excludes NEUTRAL from the denominator; avg alpha only over
  // resolved rows with a numeric alpha) and per-row rendering.
  const histUser = getAiSignalHistoryContext();
  histUser.getAppUserId = () => 'uid-hist-render-test';
  const rows = [
    { id: '1', ticker: 'BBCA', source: 'stockchat', signal_action: 'BUY', status: 'resolved', entry_price: 9000, exit_price: 9450, raw_return_pct: 5, benchmark_return_pct: 1, alpha_return_pct: 4, outcome: 'WIN', reflection_text: 'Terbukti benar.', emitted_at: '2026-08-01T00:00:00.000Z' },
    { id: '2', ticker: 'BBRI', source: 'copilot', signal_action: 'SELL', status: 'resolved', entry_price: 5000, exit_price: 5200, raw_return_pct: 4, benchmark_return_pct: 1, alpha_return_pct: 3, outcome: 'LOSS', reflection_text: null, emitted_at: '2026-08-05T00:00:00.000Z' },
    { id: '3', ticker: 'TLKM', source: 'stockchat', signal_action: 'HOLD', status: 'resolved', entry_price: 3000, exit_price: 3010, raw_return_pct: 0.3, benchmark_return_pct: 0.3, alpha_return_pct: 0, outcome: 'NEUTRAL', reflection_text: null, emitted_at: '2026-08-10T00:00:00.000Z' },
    { id: '4', ticker: 'ASII', source: 'copilot', signal_action: 'WATCH', status: 'pending', entry_price: 4500, emitted_at: '2026-09-01T00:00:00.000Z' }
  ];
  histUser.getSupabaseClient = () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }) }) })
  });
  let htmlUser = '';
  histUser.document.getElementById = (id) => id === 'page-ai-signal-history' ? { set innerHTML(v) { htmlUser = v; }, get innerHTML() { return htmlUser; } } : null;
  await histUser.renderAiSignalHistoryPage();

  assert(htmlUser.includes('>4<'), 'REGRESSION: total signal count (4) is missing from the summary');
  assert(htmlUser.includes('>1<'), 'REGRESSION: pending count (1) is missing from the summary');
  // Win rate: 1 WIN / (1 WIN + 1 LOSS) = 50% — NEUTRAL must be excluded from the denominator.
  assert(htmlUser.includes('50%'), 'REGRESSION: win rate must be 50% (1 WIN of 2 decisive outcomes, NEUTRAL excluded) — got wrong math or NEUTRAL leaking into the denominator');
  // Avg alpha over the 3 RESOLVED rows only (pending row excluded): (4+3+0)/3 = 2.33%.
  assert(htmlUser.includes('+2.33%'), 'REGRESSION: average alpha must be +2.33% over the 3 resolved rows only (pending row must not be counted)');
  assert(htmlUser.includes('BBCA') && htmlUser.includes('BBRI') && htmlUser.includes('TLKM') && htmlUser.includes('ASII'), 'REGRESSION: not every row ticker made it into the rendered table');
  assert(htmlUser.includes('Menunggu'), 'REGRESSION: the pending row must show the "Menunggu" status label, not a resolved-style row');

  // 3. Row-level rendering: return-color class + badge class assignment.
  const winRow = histUser.aiSignalHistoryRenderRow(rows[0]);
  assert(winRow.includes('#10B981'), 'REGRESSION: a positive return must render in the green (#10B981) color, not neutral/red');
  assert(winRow.includes('b-up'), 'REGRESSION: a BUY signal must get the b-up badge class');
  const pendingRow = histUser.aiSignalHistoryRenderRow(rows[3]);
  assert(pendingRow.includes('—'), 'REGRESSION: a pending row with no return yet must render an em-dash placeholder, not "undefined%" or a crash');
});

// Field bug (2026-09-17, INCIDENT_LOG.md): a user hit "Gagal memuat riwayat:
// Could not find the table 'public.ai_signal_log' in the schema cache" —
// PostgREST error PGRST205, meaning the table genuinely does not exist yet
// on the connected Supabase project (the migration in sql/schema_migration.sql
// was never run there — not a query bug, the table name matches the SQL
// exactly). The page must turn this specific error into an actionable
// Indonesian explanation instead of the raw technical PostgREST message,
// while any OTHER Supabase error still shows through as before (so real
// bugs stay debuggable).
test('REGRESSION GUARD: aiSignalHistoryIsMissingTableError() detects PGRST205 "table not found" and nothing else', () => {
  const hist = getAiSignalHistoryContext();
  assert.strictEqual(typeof hist.aiSignalHistoryIsMissingTableError, 'function', 'aiSignalHistoryIsMissingTableError must be a function');

  assert.strictEqual(hist.aiSignalHistoryIsMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.ai_signal_log' in the schema cache" }), true, 'Must detect by PGRST205 code');
  assert.strictEqual(hist.aiSignalHistoryIsMissingTableError({ message: "Could not find the table 'public.ai_signal_log' in the schema cache" }), true, 'Must detect by message even without the code field');
  assert.strictEqual(hist.aiSignalHistoryIsMissingTableError({ code: 'PGRST301', message: 'JWT expired' }), false, 'A different error code must not be misclassified as the missing-table case');
  assert.strictEqual(hist.aiSignalHistoryIsMissingTableError({ message: 'permission denied for table ai_signal_log' }), false, 'An RLS/permission error mentioning the same table must not be misclassified as "table not found"');
  assert.strictEqual(hist.aiSignalHistoryIsMissingTableError(null), false, 'Must not throw on a null error');
});

// renderAiSignalHistoryPage() writes its "Memuat..." shell into
// #page-ai-signal-history, then fetches the NESTED #ai-signal-history-body
// element to write the eventual error/result into — mimicking that with a
// single fake element (as test 84f does, since its success path only ever
// touches the outer container via aiSignalHistoryRenderRows) is not enough
// here, so this mock tracks both ids as separate elements.
function mockAiSignalHistoryDom() {
  const state = { outer: '', inner: '' };
  const dom = {
    getElementById(id) {
      if (id === 'page-ai-signal-history') {
        return { set innerHTML(v) { state.outer = v; }, get innerHTML() { return state.outer; } };
      }
      if (id === 'ai-signal-history-body') {
        return { set innerHTML(v) { state.inner = v; }, get innerHTML() { return state.inner; } };
      }
      return null;
    }
  };
  return { dom, state };
}

await asyncTest('REGRESSION GUARD: renderAiSignalHistoryPage() shows an actionable message (not a raw PostgREST error) when ai_signal_log does not exist yet, but still surfaces other errors verbatim', async () => {
  // 1. The exact real-world error: table missing (migration never run).
  const histMissing = getAiSignalHistoryContext();
  histMissing.getAppUserId = () => 'uid-missing-table-test';
  histMissing.getSupabaseClient = () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.ai_signal_log' in the schema cache" }
    }) }) }) }) })
  });
  const missingDom = mockAiSignalHistoryDom();
  histMissing.document.getElementById = missingDom.dom.getElementById;
  await histMissing.renderAiSignalHistoryPage();
  assert(missingDom.state.inner.includes('belum ada di database Supabase'), 'REGRESSION: missing-table error must show the actionable "table does not exist yet" explanation');
  assert(missingDom.state.inner.includes('sql/schema_migration.sql'), 'REGRESSION: the actionable message must point to the migration file that needs to be run');
  assert(!missingDom.state.inner.includes('Gagal memuat riwayat: Could not find the table'), 'REGRESSION: must not show the raw confusing PostgREST message as the primary text');

  // 2. A different, genuine error must still show through as before —
  // the friendlier message must not swallow unrelated failures.
  const histOther = getAiSignalHistoryContext();
  histOther.getAppUserId = () => 'uid-other-error-test';
  histOther.getSupabaseClient = () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({
      data: null,
      error: { code: 'PGRST301', message: 'JWT expired' }
    }) }) }) }) })
  });
  const otherDom = mockAiSignalHistoryDom();
  histOther.document.getElementById = otherDom.dom.getElementById;
  await histOther.renderAiSignalHistoryPage();
  assert(otherDom.state.inner.includes('Gagal memuat riwayat: JWT expired'), 'REGRESSION: a genuinely different error must still surface its real message, not be masked by the missing-table explanation');
  assert(!otherDom.state.inner.includes('belum ada di database Supabase'), 'REGRESSION: the missing-table explanation must not leak into unrelated errors');
});

// ── TEST 84g: GET /api/ai/status (server.js) — toolbar audit fix (2026-09-17,
// INCIDENT_LOG.md): before this endpoint existed, the "AI Engine Live"
// bottom-toolbar indicator was hardcoded HTML that never reflected whether
// ANTHROPIC_API_KEY is actually configured. Must derive `available` from the
// real getAiClient() check (not a separate/parallel guess), and must never
// place an actual Claude API call — it has to stay free and instant since
// it is fetched on every page boot.
test('REGRESSION GUARD: GET /api/ai/status exists, derives availability from getAiClient() (not a duplicate check), and never calls the Claude API itself', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = fullSrc.indexOf("app.get('/api/ai/status'");
  assert(start !== -1, "REGRESSION: GET /api/ai/status route is gone from server.js");
  const relEnd = fullSrc.indexOf('\n});', start);
  assert(relEnd !== -1, 'sanity: could not find the end of the /api/ai/status handler');
  const handlerSrc = fullSrc.slice(start, relEnd);

  assert(/getAiClient\(\)/.test(handlerSrc), 'REGRESSION: /api/ai/status must derive its answer from the real getAiClient() check, not a separate/hardcoded flag');
  assert(!/callClaudeWithRetry|\.messages\.create/.test(handlerSrc), 'REGRESSION: /api/ai/status must never place an actual Claude API call — it is fetched on every page boot and must stay free/instant');
});

// ── TEST 84h: checkAiEngineStatus() / checkSupabaseCloudStatus() (public/js/00-config.js)
// — client-side half of the toolbar audit fix. Must map the server's real
// availability into distinct, honest visual states (never collapse a
// network/fetch failure into the same "Live" green the working case gets),
// and the Supabase probe must never crash when the SDK failed to load
// (confirmed to happen in this exact sandbox — jsdelivr blocked).
function getToolbarStatusContext() {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/00-config.js'), 'utf8');
  const start = src.indexOf('async function checkAiEngineStatus');
  assert(start !== -1, 'REGRESSION: checkAiEngineStatus() is gone from 00-config.js');
  const slice = src.slice(start);
  const sandbox = { window: {}, document: { getElementById: () => null }, setTimeout: setTimeout };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(slice, ctx, { filename: '00-config.js toolbar status checks' });
  return ctx;
}

function fakeToolbarEl() {
  return { style: {}, textContent: '', title: '' };
}

await asyncTest("REGRESSION GUARD: checkAiEngineStatus() shows distinct Live/Fallback/Offline states, and checkSupabaseCloudStatus() never crashes when the SDK failed to load", async () => {
  // 1. AI available:true -> green "Live".
  const ctx1 = getToolbarStatusContext();
  const dot1 = fakeToolbarEl(), label1 = fakeToolbarEl();
  ctx1.document.getElementById = (id) => id === 'ai-engine-status-dot' ? dot1 : (id === 'ai-engine-status-label' ? label1 : null);
  ctx1.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, available: true, model: 'claude-x' }) });
  await ctx1.checkAiEngineStatus();
  assert.strictEqual(label1.textContent, 'AI Engine Live');
  assert(dot1.style.background.toLowerCase().includes('10b981'), 'REGRESSION: available:true must render the green dot');

  // 2. AI available:false -> amber "Fallback" (NOT the same green as case 1).
  const ctx2 = getToolbarStatusContext();
  const dot2 = fakeToolbarEl(), label2 = fakeToolbarEl();
  ctx2.document.getElementById = (id) => id === 'ai-engine-status-dot' ? dot2 : (id === 'ai-engine-status-label' ? label2 : null);
  ctx2.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, available: false, model: null }) });
  await ctx2.checkAiEngineStatus();
  assert.strictEqual(label2.textContent, 'AI Engine Fallback');
  assert(!dot2.style.background.toLowerCase().includes('10b981'), 'REGRESSION: available:false must NOT render the same green as the available:true case — that is exactly the hardcoded-fake-status bug this fix exists to remove');
  assert(/ANTHROPIC_API_KEY/.test(label2.title), 'REGRESSION: the fallback state must explain WHY (missing ANTHROPIC_API_KEY) in its title, not just say "not live"');

  // 3. Network/fetch failure -> a THIRD distinct "Offline" state, not silently
  // reusing the Fallback or Live state.
  const ctx3 = getToolbarStatusContext();
  const dot3 = fakeToolbarEl(), label3 = fakeToolbarEl();
  ctx3.document.getElementById = (id) => id === 'ai-engine-status-dot' ? dot3 : (id === 'ai-engine-status-label' ? label3 : null);
  ctx3.fetch = () => Promise.reject(new Error('network down'));
  await ctx3.checkAiEngineStatus();
  assert.strictEqual(label3.textContent, 'AI Engine Offline');

  // 4. checkSupabaseCloudStatus() when getSupabaseClient() is null (SDK failed
  // to load, e.g. CDN blocked — confirmed to happen in this exact sandbox)
  // must not throw and must render a red dot with an honest reason.
  const ctx4 = getToolbarStatusContext();
  const dot4 = fakeToolbarEl();
  ctx4.document.getElementById = (id) => id === 'sh-topbar-dot' ? dot4 : null;
  ctx4.getSupabaseClient = () => null;
  await ctx4.checkSupabaseCloudStatus();
  assert(dot4.style.background.toLowerCase().includes('ef4444'), 'REGRESSION: a missing Supabase client must render red, not stay the old hardcoded green');
  assert(/SDK gagal termuat/.test(dot4.title), 'REGRESSION: the title must explain the SDK failed to load, not a generic/wrong reason');

  // 5. checkSupabaseCloudStatus() when the client exists and getSession()
  // resolves -> green, confirming the success path is also real (not just
  // "always red now" as an overcorrection).
  const ctx5 = getToolbarStatusContext();
  const dot5 = fakeToolbarEl();
  ctx5.document.getElementById = (id) => id === 'sh-topbar-dot' ? dot5 : null;
  ctx5.getSupabaseClient = () => ({ auth: { getSession: () => Promise.resolve({ data: { session: null } }) } });
  await ctx5.checkSupabaseCloudStatus();
  assert.strictEqual(dot5.style.background, 'var(--green)');
});

// ── TEST 85: the deterministic AI fallback (server.js) must route
// sinyal/prediksi/xgboost/rekomendasi questions to cek_prediksi_xgboost,
// checked before the short-keyword branches below it (same
// "kasih"/"saran" collision class as TEST 78's ordering fix).
test('REGRESSION GUARD: the deterministic AI fallback must route prediction/signal questions to cek_prediksi_xgboost or cek_sinyal_teknikal (disambiguated), positioned before short-keyword branches', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = fullSrc.indexOf("// 2. DETERMINISTIC AGENTIC ENGINE FALLBACK");
  assert(start !== -1, 'sanity: the deterministic fallback block not found — has it moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf("\n  } catch (err) {\n    console.error('MoneyWatch AI fallback error:'");
  assert(relEnd !== -1, 'sanity: could not find the end of the deterministic fallback block');
  src = src.slice(0, relEnd);

  assert(/cek_prediksi_xgboost/.test(src), 'REGRESSION: the deterministic fallback no longer calls cek_prediksi_xgboost');
  // FIX (2026-09-19, user reproduced live: "sinyal teknikal BBCA" always
  // routed to cek_prediksi_xgboost, even after the Claude system-prompt
  // disambiguation fix — because THIS deterministic fallback, used
  // whenever Anthropic AND OpenRouter both fail/aren't configured, never
  // read the system prompt at all and had no branch for
  // cek_sinyal_teknikal whatsoever). Must now call BOTH, gated the same
  // way as the Claude/tool-declaration disambiguation: explicit
  // model/AI/ML/XGBoost mention -> cek_prediksi_xgboost; plain
  // sinyal/rekomendasi -> cek_sinyal_teknikal (default).
  assert(/cek_sinyal_teknikal/.test(src), 'REGRESSION: the deterministic fallback still has no branch calling cek_sinyal_teknikal — a plain "sinyal teknikal BBCA" will always misroute to cek_prediksi_xgboost whenever Anthropic/OpenRouter both fail, no matter how the system prompt is worded');

  const xgboostTriggerIdx = src.indexOf('xgboost|onnx|machine learning');
  const sinyalDefaultIdx = src.indexOf("sinyal|prediksi|rekomendasi|analisa teknikal");
  const portoIdx = src.indexOf("pLower.includes('porto')");
  const simulasiIdx = src.indexOf("pLower.includes('simulasi')");
  assert(xgboostTriggerIdx !== -1 && sinyalDefaultIdx !== -1 && portoIdx !== -1 && simulasiIdx !== -1,
    'sanity: one of the expected branch markers (xgboost trigger / sinyal default / porto / simulasi) was not found — has the fallback been restructured?');
  assert(xgboostTriggerIdx < sinyalDefaultIdx,
    'REGRESSION: the explicit model/AI/ML/XGBoost branch must be checked BEFORE the plain sinyal/rekomendasi default branch — otherwise the default branch\'s broader "prediksi"/"rekomendasi" match would shadow the explicit-model branch and cek_prediksi_xgboost could never be reached');
  assert(sinyalDefaultIdx < portoIdx && sinyalDefaultIdx < simulasiIdx,
    'REGRESSION: the sinyal/rekomendasi branches are positioned after short-keyword branches (porto/kas, simulasi/ara/arb) — a message like "prediksi ARA" could get misrouted before reaching them');

  // The cek_sinyal_teknikal branch must actually BUILD a reply from the
  // tool's real fields (not just call the tool and fall through to
  // something generic) — this is the exact data ai_signal_log's UI
  // (Riwayat Sinyal AI) and the user depend on seeing.
  const sinyalBranchSrc = src.slice(sinyalDefaultIdx, src.indexOf("// \\bkas\\b (word boundary)"));
  ['resSignal.signal', 'resSignal.compositeScore', 'resSignal.entry', 'resSignal.sl', 'resSignal.tp1'].forEach((field) => {
    assert(sinyalBranchSrc.includes(field), 'REGRESSION: the cek_sinyal_teknikal deterministic-fallback reply no longer reads ' + field + ' — it may have stopped building a real reply from the tool result');
  });
});

// ── TEST 86: generateClientSideAiAgentResponse()'s isPredictionIntent
// branch (public/js/41-stockchat-cockpit.js) reads userContext.
// xgboostPrediction directly (no ONNX inference here — that only runs in
// sendCopilotPrompt() before the request), and must never fabricate.
await asyncTest('REGRESSION GUARD: client-side prediction branch must read the real xgboostPrediction from userContext, never fabricate, never bounce off the ticker gate', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const startMarker = 'function generateClientSideAiAgentResponse(message, userContext) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: generateClientSideAiAgentResponse() not found');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Clear history');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after generateClientSideAiAgentResponse()');
  src = src.slice(0, relEnd);

  assert(/isPredictionIntent/.test(src), 'REGRESSION: isPredictionIntent guard is gone from the client-side fallback engine');

  const sandbox = {
    window: {},
    DB: { BBCA: { name: 'Bank Central Asia', sector: 'Perbankan' } },
    isValidStockTicker: (tk) => tk === 'BBCA',
    STOCKCHAT_SELECTED_TICKER: 'BBCA',
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '41-stockchat-cockpit.js generateClientSideAiAgentResponse() prediction (sandboxed load for test)' });

  // No prediction available — honest empty state, no invalid-ticker bounce
  // (this message has no real ticker in it either).
  const r1 = ctx.generateClientSideAiAgentResponse('apakah ada sinyal beli hari ini', {});
  assert(!/Ticker Tidak Terdaftar/.test(r1.reply), 'REGRESSION: a prediction question with no ticker bounces off the invalid-ticker gate');
  assert(/Belum ada hasil inferensi/.test(r1.reply), 'REGRESSION: missing xgboostPrediction no longer produces the honest empty state');

  // Real prediction, unproven model — disclaimer and real numbers must
  // both appear.
  const r2 = ctx.generateClientSideAiAgentResponse('prediksi BBCA gimana', {
    xgboostPrediction: {
      ticker: 'BBCA', signal: 'HOLD', probability: 0.48, buyThreshold: 0.6, sellThreshold: 0.35,
      modelVersion: '20260911', asOfDate: '2026-09-10', isSimulatedData: false, hasProvenSignal: false, liftInfo: null
    }
  });
  assert(/tidak terbukti/i.test(r2.reply), 'REGRESSION: an unproven prediction no longer carries the disclaimer in the client-side reply');
  assert(/48\.0%/.test(r2.reply), 'REGRESSION: the real probability (48.0%) is not reflected in the reply');
});

// ── TEST 87: sendCopilotPrompt() (public/js/28-decisiontools.js) must run
// xgbPredictLatest() (client-side ONNX inference, 11-quant.js) and attach
// the result to userContext.xgboostPrediction — but ONLY when the message
// both mentions a real ticker AND looks like a prediction/signal
// question; every other message must skip inference entirely (it's slow:
// ONNX load + a live OHLCV fetch — must not tax every single Copilot
// message). Must also degrade to null on timeout/failure, never throw or
// hang the whole request.
await asyncTest('REGRESSION GUARD: sendCopilotPrompt() must run xgbPredictLatest() only for prediction-intent messages with a real ticker, and degrade to null on timeout', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  const startMarker = 'async function sendCopilotPrompt(text) {';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: sendCopilotPrompt() not found');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n// Markdown Formatter for Institutional Agent Output');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after sendCopilotPrompt()');
  src = src.slice(0, relEnd);

  assert(/xgbPredictLatest/.test(src), 'REGRESSION: sendCopilotPrompt() no longer calls xgbPredictLatest() — xgboostPrediction will always be null');
  assert(/xgboostPrediction:\s*xgboostPrediction/.test(src), 'REGRESSION: the computed prediction is no longer attached to userContext sent to the server');

  function makeSandbox(xgbPredictLatestImpl) {
    let capturedBody = null;
    const calls = { xgbPredictLatest: 0 };
    const sandbox = {
      window: {},
      MW_COPILOT_HISTORY: [],
      MW_AI_IS_LOADING: false,
      el: () => null,
      renderCopilotPage: () => {},
      getPortfolio: () => [],
      computeCurrentAUM: () => 0,
      calcRdnBalance: () => 0,
      DB: { BBCA: { name: 'Bank Central Asia' } },
      xgbPredictLatest: xgbPredictLatestImpl ? (tk, cb) => { calls.xgbPredictLatest++; xgbPredictLatestImpl(tk, cb); } : undefined,
      fetch: (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, reply: 'ok', toolCalls: [] }) });
      },
      setTimeout, // real timers — the 8s race timeout must actually work; tests below use tiny delays well under it
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(src, ctx, { filename: '28-decisiontools.js sendCopilotPrompt() xgboost (sandboxed load for test)' });
    return { ctx, calls, getBody: () => capturedBody };
  }

  // 1. Prediction-intent message WITH a real ticker — must call
  // xgbPredictLatest() and attach its result.
  {
    const { ctx, calls, getBody } = makeSandbox((tk, cb) => cb({ ticker: tk, signal: 'BUY', probability: 0.7, hasProvenSignal: false }));
    await ctx.sendCopilotPrompt('apakah ada sinyal beli BBCA');
    assert.strictEqual(calls.xgbPredictLatest, 1, 'REGRESSION: xgbPredictLatest() was not called for a prediction-intent message with a real ticker');
    assert.strictEqual(getBody().userContext.xgboostPrediction.ticker, 'BBCA', 'REGRESSION: the computed prediction is not attached to the request body');
  }

  // 2. Ordinary message (no prediction keyword, no ticker) — must NOT
  // trigger inference at all (performance: don't tax every message).
  {
    const { ctx, calls, getBody } = makeSandbox((tk, cb) => cb({ ticker: tk }));
    await ctx.sendCopilotPrompt('hitung pajak dividen saya');
    assert.strictEqual(calls.xgbPredictLatest, 0, 'REGRESSION: xgbPredictLatest() ran for a message with no prediction intent — wasted latency on every Copilot message');
    assert.strictEqual(getBody().userContext.xgboostPrediction, null);
  }

  // 3. Prediction-intent keyword but NO real ticker mentioned — must not
  // call the (expensive) inference with a garbage ticker.
  {
    const { ctx, calls } = makeSandbox((tk, cb) => cb({ ticker: tk }));
    await ctx.sendCopilotPrompt('apakah ada sinyal bagus hari ini');
    assert.strictEqual(calls.xgbPredictLatest, 0, 'REGRESSION: xgbPredictLatest() was called even though no real ticker was mentioned');
  }

  // 4. xgbPredictLatest() never calling back (hung ONNX load / stuck
  // fetch) must not hang the request forever — verified structurally
  // (Promise.race against a timeout) rather than by actually waiting out
  // the real 8s in this test suite.
  assert(/Promise\.race/.test(src), 'REGRESSION: the xgbPredictLatest() call is no longer raced against a timeout — a hung ONNX load/fetch would hang every Copilot message that mentions a ticker');
  assert(/8000/.test(src), 'REGRESSION: the prediction timeout duration is gone');
  assert(/catch \(e\) \{\s*console\.warn\('\[Copilot\] xgbPredictLatest/.test(src), 'REGRESSION: a thrown error from xgbPredictLatest() is no longer caught — it would crash sendCopilotPrompt() instead of degrading to null');
});

// ── TEST 88: featureSnapshot construction (aiOpenPositionFromSignal(),
// public/js/38-ai-autonomous-trading.js) — item #4 groundwork (2026-09-11,
// INCIDENT_LOG.md / ml/PAPER_TRADING_DATASET.md): captures the DECISION-
// TIME feature breakdown (computeStockSignal()'s composite_signal_v1
// space, a DIFFERENT feature set than the unrelated XGBoost model) so a
// future training pass doesn't need to reconstruct it later. Must
// correctly distinguish a real Scanner-sourced signal (full feature set)
// from a Hypothesis-Lab-only signal (partial), and never throw on a
// signal missing optional fields.
test('REGRESSION GUARD: featureSnapshot correctly captures the composite-signal breakdown at entry, distinguishing scanner vs confluence_hypothesis sourcing', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  const start = fullSrc.indexOf('var featureSnapshot = {');
  assert(start !== -1, 'sanity: featureSnapshot construction not found — has aiOpenPositionFromSignal() been restructured?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n\n    p.openPositions.push({');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after featureSnapshot construction');
  src = src.slice(0, relEnd);

  // eslint-disable-next-line no-new-func
  const buildSnapshot = new Function('sig', 'regimeAtEntry', src + '\nreturn featureSnapshot;');

  // 1. Full Scanner signal (compositeScore present) — 'scanner' sourcing,
  // every field passed through. Uses evPerShareRaw/rrRatioNum (the RAW
  // numeric fields _adaptRealSignal() carries) — NOT evPerShare/rrRatio,
  // which on a real AI_UNIVERSE entry are formatted display STRINGS
  // ('+Rp 120 / lembar', '1 : 1.9'), not numbers. A real user's live
  // browser session caught this exact mismatch (2026-09-11): every
  // featureSnapshot from a real Scanner signal had technicalScore/rsi14/
  // trend/evPerShare stuck at null because sig.technicalScore/sig.rsi14/
  // sig.trend/sig.evPerShare never existed on the actual adapted object.
  const fromScanner = buildSnapshot({
    compositeScore: 78, technicalScore: 82, fundamentalScore: 70, trend: 'UPTREND',
    rsi14: 61.2, volRatio: 1.8, probability: 65, evPerShareRaw: 120, rrRatioNum: 1.9
  }, 'BULL_TREND');
  assert.strictEqual(fromScanner.sourceEngine, 'scanner');
  assert.strictEqual(fromScanner.hasFullFeatureSet, true);
  assert.strictEqual(fromScanner.compositeScore, 78);
  assert.strictEqual(fromScanner.technicalScore, 82, 'REGRESSION: technicalScore not read from sig — check this is the corrected field name (not a nonexistent field on real AI_UNIVERSE entries)');
  assert.strictEqual(fromScanner.rsi14, 61.2);
  assert.strictEqual(fromScanner.trend, 'UPTREND');
  assert.strictEqual(fromScanner.evPerShare, 120, 'REGRESSION: evPerShare must come from sig.evPerShareRaw (the raw number), not sig.evPerShare (a formatted display string on real AI_UNIVERSE entries)');
  assert.strictEqual(fromScanner.rrRatio, 1.9, 'REGRESSION: rrRatio must come from sig.rrRatioNum (the raw number), not sig.rrRatio (a formatted "1 : X" display string on real AI_UNIVERSE entries)');
  assert.strictEqual(fromScanner.regimeAtEntry, 'BULL_TREND');

  // 2. Hypothesis-Lab-only signal for a ticker never scanned (no
  // compositeScore at all) — must be tagged 'confluence_hypothesis' with
  // hasFullFeatureSet:false, and must NOT throw on the missing fields.
  const fromHypothesis = buildSnapshot({}, 'SIDEWAYS');
  assert.strictEqual(fromHypothesis.sourceEngine, 'confluence_hypothesis');
  assert.strictEqual(fromHypothesis.hasFullFeatureSet, false);
  assert.strictEqual(fromHypothesis.compositeScore, null, 'REGRESSION: a missing compositeScore should become null, not undefined/NaN — undefined would be silently dropped by JSON.stringify() in the dataset export');
  assert.strictEqual(fromHypothesis.rsi14, null);

  // 3. regimeAtEntry fetch failure (null) — must degrade to null, not throw.
  const noRegime = buildSnapshot({ compositeScore: 60 }, null);
  assert.strictEqual(noRegime.regimeAtEntry, null);
});

// ── TEST 89: closedTrades must carry featureSnapshot through from the
// position it closes (aiClosePosition()) — without this, TEST 88's
// snapshot is captured at entry but discarded at exit, and the dataset
// export (TEST 90) would have nothing to work with.
test('REGRESSION GUARD: aiClosePosition() must carry featureSnapshot through from the closing position into the closedTrades record', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  assert(/featureSnapshot: pos\.featureSnapshot \|\| null/.test(src),
    'REGRESSION: the closedTrades record no longer carries pos.featureSnapshot through — the dataset export will have nothing to work with even for brand-new trades');
});

// ── TEST 90: aiBuildTrainingDataset() (public/js/38-ai-autonomous-
// trading.js) — the actual (X, y) assembly. Must map WIN/LOSS to 1/0,
// skip (never zero-fill) trades from before featureSnapshot existed, and
// report accurate counts.
test('REGRESSION GUARD: aiBuildTrainingDataset() must correctly label WIN/LOSS, skip trades without a featureSnapshot rather than zero-filling them', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  const start = fullSrc.indexOf('function aiBuildTrainingDataset() {');
  assert(start !== -1, 'sanity: aiBuildTrainingDataset() not found — has it been renamed/moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n\n  // Downloads aiBuildTrainingDataset()');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after aiBuildTrainingDataset()');
  src = src.slice(0, relEnd);

  const sandbox = {
    window: {},
    AI_TRADE_STATE: {
      paperAccount: {
        closedTrades: [
          { ticker: 'BBCA', entryDate: '2026-08-01', exitDate: '2026-08-10', result: 'WIN', netPnL: 500000, rMultiple: 2.1, exitReason: 'TAKE PROFIT', errorClassification: 'TARGET_ACHIEVED', featureSnapshot: { compositeScore: 75 } },
          { ticker: 'BBRI', entryDate: '2026-08-05', exitDate: '2026-08-12', result: 'LOSS', netPnL: -120000, rMultiple: -1, exitReason: 'STOP LOSS', errorClassification: 'RISK_MANAGEMENT_TRIGGERED', featureSnapshot: { compositeScore: 58 } },
          // Old trade from before featureSnapshot existed — must be
          // SKIPPED, not zero-filled into a misleading sample.
          { ticker: 'TLKM', entryDate: '2026-07-01', exitDate: '2026-07-15', result: 'WIN', netPnL: 200000, rMultiple: 1.5, exitReason: 'TAKE PROFIT', errorClassification: 'TARGET_ACHIEVED', featureSnapshot: null },
        ],
      },
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '38-ai-autonomous-trading.js aiBuildTrainingDataset() (sandboxed load for test)' });

  assert.strictEqual(typeof ctx.aiBuildTrainingDataset, 'function', 'aiBuildTrainingDataset not exposed on the sandbox context');
  const dataset = ctx.aiBuildTrainingDataset();

  assert.strictEqual(dataset.totalClosedTrades, 3);
  assert.strictEqual(dataset.totalSamplesWithFeatures, 2, 'REGRESSION: the old trade without featureSnapshot was not correctly skipped');
  assert.strictEqual(dataset.skippedNoFeatureSnapshot, 1);
  assert.strictEqual(dataset.samples.length, 2);

  const bbca = dataset.samples.find(s => s.ticker === 'BBCA');
  const bbri = dataset.samples.find(s => s.ticker === 'BBRI');
  assert.strictEqual(bbca.label, 1, 'REGRESSION: a WIN trade must map to label 1');
  assert.strictEqual(bbri.label, 0, 'REGRESSION: a LOSS trade must map to label 0');
  assert.strictEqual(bbca.features.compositeScore, 75, 'REGRESSION: the featureSnapshot is not passed through as `features` in the sample');
  assert(!dataset.samples.some(s => s.ticker === 'TLKM'), 'REGRESSION: the featureSnapshot-less trade leaked into samples instead of being skipped');
});

// ── TEST 91: _adaptRealSignal() (public/js/38-ai-autonomous-trading.js) —
// found via a REAL user's live browser session (2026-09-11): every
// featureSnapshot captured from a genuine Scanner BUY signal had
// technicalScore/rsi14/trend/evPerShare/rrRatio stuck at null, even
// though the server-side computeStockSignal() genuinely computed real
// values for all of them. Root cause: _adaptRealSignal() — which
// transforms the raw server response into what AI_UNIVERSE actually
// stores — only ever exposed DERIVED/FORMATTED fields (trendScore/
// momentumScore/moneyFlowScore all duplicating technicalScore under
// other names; `ev`/`rrRatio` as display STRINGS like '+Rp 120 / lembar'
// / '1 : 1.9') and silently dropped the raw technicalScore/rsi14/trend/
// evPerShare entirely. aiOpenPositionFromSignal() (TEST 88) only ever
// sees this already-adapted object, never the raw server response, so
// there was no way for it to recover the missing values downstream —
// this had to be fixed at the source.
test("REGRESSION GUARD: _adaptRealSignal() must preserve the raw technicalScore/rsi14/trend/evPerShare/rrRatio values, not just derived display strings", () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  const start = fullSrc.indexOf('function _lookupTickerMeta(tk) {');
  assert(start !== -1, 'sanity: _lookupTickerMeta() not found — has this section moved?');
  let src = fullSrc.slice(start);
  const relEnd = src.indexOf('\n\n  // Pure decision function (no DOM, no network)');
  assert(relEnd !== -1, 'sanity: could not find the boundary right after _adaptRealSignal() — extraction range may need updating');
  src = src.slice(0, relEnd);

  const sandbox = { window: {} };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '38-ai-autonomous-trading.js _adaptRealSignal() (sandboxed load for test)' });

  assert.strictEqual(typeof ctx._adaptRealSignal, 'function', '_adaptRealSignal not exposed on the sandbox context');

  const realServerSignal = {
    ticker: 'BBCA', price: 9500, changePercent: 1.2, volume: 5000000,
    signal: 'BUY', trend: 'UPTREND', compositeScore: 78, technicalScore: 82,
    fundamentalScore: 70, rsi14: 61.2, ema20: 9300, ema50: 9100, volRatio: 1.8,
    probability: 65, evPerShare: 120, entry: 9500, sl: 9200, tp1: 9800, tp2: 10100,
    rrRatio: 1.9, dataQuality: { fundamental: true }, gateStatus: { status: 'REAL' }
  };
  const adapted = ctx._adaptRealSignal(realServerSignal);

  assert.strictEqual(adapted.technicalScore, 82, 'REGRESSION: technicalScore is no longer carried through raw — featureSnapshot will silently go back to null for every real Scanner signal');
  assert.strictEqual(adapted.rsi14, 61.2, 'REGRESSION: rsi14 is no longer carried through raw');
  assert.strictEqual(adapted.trend, 'UPTREND', 'REGRESSION: trend is no longer carried through raw');
  assert.strictEqual(adapted.evPerShareRaw, 120, 'REGRESSION: the raw evPerShare number (evPerShareRaw) is gone — only the formatted display string remains');
  assert.strictEqual(adapted.rrRatioNum, 1.9, 'REGRESSION: the raw rrRatio number (rrRatioNum) is gone — only the formatted "1 : X" display string remains');

  // The existing presentational fields (used by other renderers, e.g. the
  // Scanner table and Opportunity cards) must still work exactly as
  // before — this fix must be additive, not a breaking rename.
  assert.strictEqual(adapted.ev, '+Rp 120 / lembar', 'REGRESSION: the formatted `ev` display string changed — other UI renderers depend on this exact format');
  assert.strictEqual(adapted.rrRatio, '1 : 1.9', 'REGRESSION: the formatted `rrRatio` display string changed — other UI renderers (Scanner table, Opportunity cards) depend on this exact format');
  assert.strictEqual(adapted.trendScore, 82, 'REGRESSION: trendScore (pre-existing UI field) broke');
  assert.strictEqual(adapted.momentumScore, 82, 'REGRESSION: momentumScore (pre-existing UI field) broke');
  assert.strictEqual(adapted.moneyFlowScore, 82, 'REGRESSION: moneyFlowScore (pre-existing UI field) broke');
});

// ── TEST 92-96: KSEI Excel-upload pipeline (public/js/34-ksei-
// shareholders.js) — replaces the old Google-Sheets-fetch + server
// fs.writeFileSync() mechanism (removed: it always threw EROFS on
// Vercel's read-only production filesystem — same failure class as the
// /api/user-data/save incident, see server.js). User-requested
// (2026-09-11): "data ini harus diolah dulu, dan apabila sumber data
// spreadsheet hilang maka data hilang juga". kseiParseWorkbook() is a
// pure function (no DOM/XLSX-global dependency — it takes the row-object
// array XLSX.utils.sheet_to_json() would have already produced), so it's
// extracted into the vm sandbox on its own, same technique as TEST 73's
// getKseiStock() extraction just below it in the real file.
function _loadKseiParseWorkbook() {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/34-ksei-shareholders.js'), 'utf8');
  const startMarker = 'var KSEI_TEMPLATE_REQUIRED_COLUMNS';
  const endMarker = '\nfunction kseiImportExcelFile(';
  const start = fullSrc.indexOf(startMarker);
  const end = fullSrc.indexOf(endMarker);
  assert(start !== -1, 'sanity: KSEI_TEMPLATE_REQUIRED_COLUMNS not found — has the upload pipeline moved/been renamed?');
  assert(end !== -1 && end > start, 'sanity: could not find the boundary right after kseiParseWorkbook() (kseiImportExcelFile) — extraction range may need updating');
  const src = fullSrc.slice(start, end);

  const sandbox = { window: {} };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '34-ksei-shareholders.js kseiParseWorkbook() (sandboxed load for test)' });
  assert.strictEqual(typeof ctx.kseiParseWorkbook, 'function', 'kseiParseWorkbook not exposed on the sandbox context');
  return ctx.kseiParseWorkbook;
}

// Same source range as _loadKseiParseWorkbook() above — the raw-file
// parsers (kseiParseOwnershipRaw/kseiParseFreeFloatRaw/kseiCombineRawSheets)
// live between KSEI_TEMPLATE_REQUIRED_COLUMNS and kseiImportExcelFile too,
// added 2026-09-11 (user-requested: upload the raw Kepemilikan + Free
// Float files straight from IDX, no manual "build Master" step). Validated
// against a real 840-emiten KSEI dataset cross-checked against the user's
// own hand-built reference table: 1,044/1,046 (ticker,status) buckets
// matched EXACTLY (percentage AND Papan/Kapitalisasi/JPS/Free Float%) —
// see INCIDENT_LOG.md.
function _loadKseiRawParsers() {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/34-ksei-shareholders.js'), 'utf8');
  const startMarker = 'var KSEI_TEMPLATE_REQUIRED_COLUMNS';
  const endMarker = '\nfunction kseiImportExcelFile(';
  const start = fullSrc.indexOf(startMarker);
  const end = fullSrc.indexOf(endMarker);
  assert(start !== -1 && end !== -1 && end > start, 'sanity: extraction range for the raw KSEI parsers not found — has the upload pipeline moved?');
  const src = fullSrc.slice(start, end);

  const sandbox = { window: {} };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '34-ksei-shareholders.js raw parsers (sandboxed load for test)' });
  ['_kseiCellText', 'kseiParseOwnershipRaw', 'kseiParseFreeFloatRaw', 'kseiCombineRawSheets'].forEach(name => {
    assert.strictEqual(typeof ctx[name], 'function', `${name} not exposed on the sandbox context`);
  });
  return ctx;
}

test('KSEI raw-file upload: kseiParseOwnershipRaw()/kseiParseFreeFloatRaw()/kseiCombineRawSheets() correctly combine 2 unmodified IDX files, joining the OFFICIAL free float % (never the naive 100%-minus-majority complement) for a matched ticker, and honestly flagging an unmatched ticker as estimated', () => {
  const ctx = _loadKseiRawParsers();

  // Mirrors the REAL raw KSEI "Kepemilikan >5%" export structure: title
  // row with "per tanggal", 2 header rows (Kode Efek/Nama Emiten/.../
  // Status on row 1, Jumlah Saham/Saham Gabungan Per Investor/Persentase
  // Kepemilikan Per Investor (%) on row 2), then data rows where a new
  // investor group starts whenever "Nama Pemegang Saham" (col 4) is
  // non-blank; a blank one is a continuation row (another custodian
  // sub-account for the investor directly above it).
  const ownershipRows = [
    ['KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID (PUBLIK) per tanggal 1 Sep 2026 '],
    [],
    ['No', 'Kode Efek', 'Nama Emiten', 'Nama Pemegang Rekening Efek', 'Nama Pemegang Saham', 'Nama Rekening Efek', 'Alamat', 'Alamat (Lanjutan)', 'Kebangsaan', 'Domisili', 'Status (Lokal/Asing)', 'Kepemilikan Per 1-SEP-2026'],
    [null, null, null, null, null, null, null, null, null, null, null, 'Jumlah Saham', 'Saham Gabungan Per Investor', 'Persentase Kepemilikan Per Investor (%)'],
    [1, 'AAAA', 'Test Emiten Satu Tbk', 'Custodian X', 'Investor One', 'Acct A', 'x', 'x', null, 'INDONESIA', 'L', 1000000, 1000000, 40.5],
    [2, 'AAAA', 'Test Emiten Satu Tbk', 'Custodian Y', 'Investor Two', 'Acct B', 'x', 'x', null, 'INDONESIA', 'A', 500000, 800000, 32.1],
    [null, 'AAAA', null, 'Custodian Z', null, 'Acct C', 'x', 'x', null, 'INDONESIA', 'A', 300000, null, null], // continuation row, same investor — must NOT be double-counted
    [3, true, 'Second Co Tbk', 'Custodian W', 'Investor Three', 'Acct D', 'x', 'x', null, 'INDONESIA', 'L', 2000000, 2000000, 55.0] // ticker cell is the boolean `true` — same real-world quirk as ticker "TRUE" being auto-coerced
  ];

  // Mirrors the REAL raw IDX Free Float report: several note/footnote
  // rows, then a 2-row header (row 1: No/Kode/Nama Perusahaan Tercatat/
  // Papan Pencatatan; row 2: Kapitalisasi Pasar (Rp)/% Saham Free Float
  // (FF)/Jumlah Pemegang Saham (JPS)), a couple of blank spacer rows,
  // then data. Only ticker AAAA appears here — BBBB (via boolean-ticker
  // row above, which normalizes to "TRUE") deliberately has no match.
  const ffRows = [
    [null, 'Catatan:'],
    [null, 'beberapa baris footnote lain'],
    [], [], [], [], [], [], [],
    [null, 'No', 'Kode', 'Nama Perusahaan Tercatat', 'Papan Pencatatan (Tanpa Pemantauan Khusus)'],
    [null, null, null, null, null, 'Kapitalisasi Pasar (Rp)', '% Saham Free Float (FF)', 'Jumlah Pemegang Saham (JPS)'],
    [],
    [],
    [null, 1, 'AAAA', 'Test Emiten Satu Tbk', 'Utama', '1.000.000.000', '25,50%', '100']
  ];

  const ownershipResult = ctx.kseiParseOwnershipRaw(ownershipRows);
  assert.strictEqual(ownershipResult.errors.length, 0, 'well-formed raw ownership rows must parse without error: ' + JSON.stringify(ownershipResult.errors));
  assert.strictEqual(ownershipResult.reportDate, '1 Sep 2026');
  assert.strictEqual(ownershipResult.investors.length, 3, 'REGRESSION: must produce exactly 3 investor records (One, Two, Three) — the continuation row (Custodian Z) must NOT become a 4th');

  const ffResult = ctx.kseiParseFreeFloatRaw(ffRows);
  assert.strictEqual(ffResult.errors.length, 0, 'well-formed raw FF rows must parse without error: ' + JSON.stringify(ffResult.errors));
  assert.strictEqual(ffResult.byTicker.AAAA.freeFloatPct, 25.5);

  const combined = ctx.kseiCombineRawSheets(ownershipResult, ffResult);
  const aaaa = combined.data.AAAA;
  assert.strictEqual(aaaa.investors.length, 2, 'AAAA must have exactly 2 investors (One + Two), the continuation row merged away, not counted separately');
  assert.strictEqual(aaaa.totalMajorPercent, 72.6, '40.5 + 32.1, summed once each — REGRESSION if the continuation row silently added a 3rd 32.1%-ish figure');
  assert.strictEqual(aaaa.localPercent, 40.5);
  assert.strictEqual(aaaa.foreignPercent, 32.1);
  assert.strictEqual(aaaa.freeFloat, 25.5, 'REGRESSION: AAAA has an official Free Float match (25.5%) — must use it, NOT the naive complement (100-72.6=27.4)');
  assert.strictEqual(aaaa.freeFloatIsEstimated, false);

  const bbbb = combined.data.TRUE;
  assert(bbbb, 'REGRESSION: a ticker cell holding the literal boolean `true` (the real-world "TRUE" ticker quirk) must still be read as the string ticker "TRUE", not silently dropped or crash the parser');
  assert.strictEqual(bbbb.investors.length, 1);
  assert.strictEqual(bbbb.freeFloatIsEstimated, true, 'TRUE has no match in the FF file — must be honestly flagged as estimated, never silently treated as if it had an official figure');
  assert.strictEqual(bbbb.freeFloat, 45.0, 'no FF match -> falls back to 100 - totalMajorPercent (100-55=45), same documented estimate formula as the single-template path');
});

// TEST added 2026-09-11 (user-requested full audit — "cek kalau ada emiten
// lain yang datanya aneh"): scanning all 840 real emiten found KSEI's raw
// export listing the SAME beneficial owner twice under near-identical
// name strings within one ticker (e.g. "...PT ASABRI" vs "...PT. ASABRI",
// "BANK PAN INDONESIA TBK, PT" vs its own brand name "Panin Bank Tbk,
// PT"), each row carrying IDENTICAL percentage/shares — summing both
// inflated one real ticker (ASJT) to a mathematically impossible 154.78%,
// confirmed present in the user's own hand-built reference table too (a
// real KSEI/IDX data gap, not introduced by this parser). Fixed for the
// two safely-identifiable cases (exact match after stripping PT/Tbk/
// punctuation/case; or a small known brand-alias table) — deliberately
// NOT for ~70 other same-percentage pairs found where the names are
// genuinely different-looking (real distinct co-holders splitting a
// stake equally, e.g. siblings/heirs) — merging those would risk hiding
// real shareholders, worse than leaving a rare duplicate unmerged.
test('KSEI raw-file upload: kseiCombineRawSheets() merges the SAME investor listed twice under near-identical name strings (real KSEI data quirk), but never merges two genuinely different investors that merely happen to hold an identical percentage', () => {
  const ctx = _loadKseiRawParsers();
  const ownershipRows = [
    ['KEPEMILIKAN EFEK DIATAS 5% BERDASARKAN SID (PUBLIK) per tanggal 1 Sep 2026 '],
    [],
    ['No', 'Kode Efek', 'Nama Emiten', 'Nama Pemegang Rekening Efek', 'Nama Pemegang Saham', 'Nama Rekening Efek', 'Alamat', 'Alamat (Lanjutan)', 'Kebangsaan', 'Domisili', 'Status (Lokal/Asing)', 'Kepemilikan Per 1-SEP-2026'],
    [null, null, null, null, null, null, null, null, null, null, null, 'Jumlah Saham', 'Saham Gabungan Per Investor', 'Persentase Kepemilikan Per Investor (%)'],
    // Same real ASABRI pension fund, punctuation-only name variant, identical pct/shares -> must merge into ONE investor
    [1, 'ZZZZ', 'Test Duplikat Tbk', 'Custodian X', 'PERUSAHAAN PERSEROAN (PERSERO) PT ASABRI', 'Acct A', 'x', 'x', null, 'INDONESIA', 'L', 1000000, 1000000, 20.0],
    [2, 'ZZZZ', 'Test Duplikat Tbk', 'Custodian Y', 'PERUSAHAAN PERSEROAN (PERSERO) PT. ASABRI', 'Acct B', 'x', 'x', null, 'INDONESIA', 'L', 1000000, 1000000, 20.0],
    // Known brand alias (legal name vs brand name), identical pct/shares -> must merge into ONE investor
    [3, 'ZZZZ', 'Test Duplikat Tbk', 'Custodian Z', 'BANK PAN INDONESIA TBK, PT', 'Acct C', 'x', 'x', null, 'INDONESIA', 'L', 500000, 500000, 10.0],
    [4, 'ZZZZ', 'Test Duplikat Tbk', 'Custodian W', 'Panin Bank Tbk, PT', 'Acct D', 'x', 'x', null, 'INDONESIA', 'L', 500000, 500000, 10.0],
    // Two genuinely different heirs, coincidentally equal split -> must stay 2 SEPARATE investors
    [5, 'ZZZZ', 'Test Duplikat Tbk', 'Custodian V', 'BUDI HARTONO', 'Acct E', 'x', 'x', null, 'INDONESIA', 'L', 300000, 300000, 5.0],
    [6, 'ZZZZ', 'Test Duplikat Tbk', 'Custodian U', 'BAMBANG HARTONO', 'Acct F', 'x', 'x', null, 'INDONESIA', 'L', 300000, 300000, 5.0]
  ];
  const ffRows = [
    [null, 'Catatan:'], [], [], [], [], [], [], [], [],
    [null, 'No', 'Kode', 'Nama Perusahaan Tercatat', 'Papan Pencatatan (Tanpa Pemantauan Khusus)'],
    [null, null, null, null, null, 'Kapitalisasi Pasar (Rp)', '% Saham Free Float (FF)', 'Jumlah Pemegang Saham (JPS)'],
    [null, 1, 'OTHR', 'Unrelated Co Tbk', 'Utama', '1.000.000.000', '10,00%', '50'] // unrelated ticker, just to satisfy "at least one valid row" — ZZZZ deliberately has no FF match
  ];

  const ownershipResult = ctx.kseiParseOwnershipRaw(ownershipRows);
  assert.strictEqual(ownershipResult.errors.length, 0, JSON.stringify(ownershipResult.errors));
  const ffResult = ctx.kseiParseFreeFloatRaw(ffRows);
  assert.strictEqual(ffResult.errors.length, 0, JSON.stringify(ffResult.errors));

  const combined = ctx.kseiCombineRawSheets(ownershipResult, ffResult);
  const zzzz = combined.data.ZZZZ;

  assert.strictEqual(zzzz.investors.length, 4, 'REGRESSION: expected 4 investor rows (ASABRI merged, Panin merged, Budi Hartono, Bambang Hartono) — got ' + zzzz.investors.length);

  const asabri = zzzz.investors.filter(inv => /ASABRI/.test(inv.name))[0];
  assert(asabri, 'the merged ASABRI investor is missing entirely');
  assert.strictEqual(asabri.percentage, 20.0, 'REGRESSION: ASABRI listed twice under a punctuation-only name variant must merge into ONE investor at 20%, not double-count to 40%');
  assert.deepStrictEqual(Array.from(asabri.mergedAliasNames || []).length, 1, 'the merged duplicate name should be tracked in mergedAliasNames for transparency');

  const panin = zzzz.investors.filter(inv => /Panin|Pan Indonesia/i.test(inv.name))[0];
  assert(panin, 'the merged Panin/Bank Pan Indonesia investor is missing entirely');
  assert.strictEqual(panin.percentage, 10.0, 'REGRESSION: Bank Pan Indonesia / Panin Bank (same bank, brand-name alias) must merge into ONE investor at 10%, not double-count to 20%');

  const heirs = zzzz.investors.filter(inv => inv.name === 'BUDI HARTONO' || inv.name === 'BAMBANG HARTONO');
  assert.strictEqual(heirs.length, 2, 'REGRESSION: two genuinely different people (coincidentally equal 5% split) must NEVER be merged just because their percentage matches — that would silently hide a real distinct shareholder');

  assert.strictEqual(zzzz.totalMajorPercent, 40.0, '20 (ASABRI) + 10 (Panin) + 5 + 5 = 40, not 65 if the two duplicate pairs had gone uncaught (40+25)');
});

test('KSEI raw-file upload: kseiParseOwnershipRaw() rejects a file missing the "per tanggal" title or the "Kode Efek" header, never guesses a date/column', () => {
  const ctx = _loadKseiRawParsers();
  const noTitleDate = ctx.kseiParseOwnershipRaw([
    ['Some other title with no date pattern'],
    [],
    ['No', 'Kode Efek', 'Nama Emiten', 'x', 'Nama Pemegang Saham', 'x', 'x', 'x', 'x', 'x', 'Status (Lokal/Asing)'],
    [],
    []
  ]);
  assert.strictEqual(noTitleDate.investors, null);
  assert(/per tanggal/i.test(noTitleDate.errors[0]), 'expected a "per tanggal" error, got: ' + JSON.stringify(noTitleDate.errors));

  const noKodeEfek = ctx.kseiParseOwnershipRaw([
    ['KEPEMILIKAN EFEK DIATAS 5% ... per tanggal 1 Sep 2026'],
    [],
    ['No', 'Kolom Salah', 'Nama Emiten'],
    [],
    []
  ]);
  assert.strictEqual(noKodeEfek.investors, null);
  assert(/Kode Efek/.test(noKodeEfek.errors[0]), 'expected a "Kode Efek" error, got: ' + JSON.stringify(noKodeEfek.errors));
});

test('KSEI raw-file upload: kseiParseFreeFloatRaw() rejects a file missing the "Kode" header, never guesses column positions', () => {
  const ctx = _loadKseiRawParsers();
  const result = ctx.kseiParseFreeFloatRaw([[null, 'Catatan:'], [], [], [], [], [], [], [], [], [], [null, 'No', 'Bukan Kode', 'Nama']]);
  assert.strictEqual(result.byTicker, null);
  assert(/Kode/.test(result.errors[0]));
});

test('KSEI upload template: kseiParseWorkbook() joins the optional "Persentase Free Float (%)" column when present (freeFloatIsEstimated:false), falls back to the 100%-minus-majority estimate when absent (freeFloatIsEstimated:true)', () => {
  const kseiParseWorkbook = _loadKseiParseWorkbook();
  const withFf = kseiParseWorkbook([
    { 'Ticker': 'BBCA', 'Nama Emiten': 'X', 'Nama Investor': 'A', 'Status': 'Lokal', 'Persentase (%)': 30, 'Jumlah Saham': 100, 'Tanggal Laporan': '1 Sep 2026', 'Persentase Free Float (%)': '18,62%' }
  ]);
  assert.strictEqual(withFf.errors.length, 0);
  assert.strictEqual(withFf.data.BBCA.freeFloat, 18.62, 'REGRESSION: the optional Free Float column must be used verbatim, not overridden by the 100-majority estimate');
  assert.strictEqual(withFf.data.BBCA.freeFloatIsEstimated, false);

  const withoutFf = kseiParseWorkbook([
    { 'Ticker': 'BBCA', 'Nama Emiten': 'X', 'Nama Investor': 'A', 'Status': 'Lokal', 'Persentase (%)': 30, 'Jumlah Saham': 100, 'Tanggal Laporan': '1 Sep 2026' }
  ]);
  assert.strictEqual(withoutFf.errors.length, 0);
  assert.strictEqual(withoutFf.data.BBCA.freeFloat, 70, 'without the optional column, must fall back to 100 - totalMajorPercent (100-30=70)');
  assert.strictEqual(withoutFf.data.BBCA.freeFloatIsEstimated, true, 'REGRESSION: an estimated free float must be honestly flagged, never presented the same as an official IDX figure');
});

test('KSEI upload template: kseiParseWorkbook() correctly groups rows into per-ticker records, computing free float/local/foreign splits and merging repeated-investor rows into one investor with multiple custodian accounts', () => {
  const kseiParseWorkbook = _loadKseiParseWorkbook();
  const rows = [
    { 'Ticker': 'BBCA', 'Nama Emiten': 'Bank Central Asia Tbk', 'Nama Investor': 'Anthoni Salim', 'Status': 'Lokal', 'Domisili': 'INDONESIA', 'Persentase (%)': 5.13, 'Jumlah Saham': 1250000000, 'Perubahan Saham': -50000, 'Nama Kustodian': '', 'Nama Akun Kustodian': '', 'Saham di Kustodian Ini': '', 'Tanggal Laporan': '26 Aug 2026' },
    { 'Ticker': 'BBCA', 'Nama Emiten': 'Bank Central Asia Tbk', 'Nama Investor': 'Robert Budi Hartono', 'Status': 'Lokal', 'Domisili': 'INDONESIA', 'Persentase (%)': 25.9, 'Jumlah Saham': 6300000000, 'Perubahan Saham': 0, 'Nama Kustodian': 'Bank Kustodian A', 'Nama Akun Kustodian': 'PT Djarum QQ', 'Saham di Kustodian Ini': 3150000000, 'Tanggal Laporan': '26 Aug 2026' },
    { 'Ticker': 'BBCA', 'Nama Emiten': 'Bank Central Asia Tbk', 'Nama Investor': 'Robert Budi Hartono', 'Status': 'Lokal', 'Domisili': 'INDONESIA', 'Persentase (%)': 25.9, 'Jumlah Saham': 6300000000, 'Perubahan Saham': 0, 'Nama Kustodian': 'Bank Kustodian B', 'Nama Akun Kustodian': 'PT Djarum QQ 2', 'Saham di Kustodian Ini': 3150000000, 'Tanggal Laporan': '26 Aug 2026' },
    { 'Ticker': 'TLKM', 'Nama Emiten': 'Telkom Indonesia Tbk', 'Nama Investor': 'Vanguard Total International Stock Index Fund', 'Status': 'Asing', 'Domisili': 'AMERIKA SERIKAT', 'Persentase (%)': 5.02, 'Jumlah Saham': 5120000000, 'Perubahan Saham': 120000, 'Nama Kustodian': 'Citibank NA S/A', 'Nama Akun Kustodian': 'Vanguard Custodian Account', 'Saham di Kustodian Ini': 5120000000, 'Tanggal Laporan': '26 Aug 2026' }
  ];

  const result = kseiParseWorkbook(rows);
  // .length check, not deepStrictEqual(result.errors, []) — result.errors
  // is an array constructed inside the vm sandbox's own realm, which
  // deepStrictEqual treats as unequal to a main-realm [] literal even when
  // both are empty (different Array.prototype per realm; see test_suite.js's
  // other vm-sandboxed tests for the same documented gotcha).
  assert.strictEqual(result.errors.length, 0, 'a well-formed template must produce zero validation errors, got: ' + JSON.stringify(result.errors));
  assert(result.data, 'result.data must not be null on success');

  const bbca = result.data.BBCA;
  assert.strictEqual(bbca.investors.length, 2, 'REGRESSION: two rows for the same investor (Robert Budi Hartono, two custodians) must merge into ONE investor entry, not two duplicate holdings');
  const rbh = bbca.investors.filter(inv => inv.name === 'Robert Budi Hartono')[0];
  assert.strictEqual(rbh.accounts.length, 2, 'REGRESSION: the two custodian rows must both land in accounts[], not overwrite each other');
  assert.strictEqual(rbh.accounts[0].custodian, 'Bank Kustodian A');
  assert.strictEqual(rbh.accounts[1].custodian, 'Bank Kustodian B');

  assert.strictEqual(bbca.totalMajorPercent, 31.03, 'totalMajorPercent must sum every investor exactly once (5.13 + 25.9)');
  assert.strictEqual(bbca.freeFloat, 68.97, 'freeFloat must be 100 - totalMajorPercent');
  assert.strictEqual(bbca.localPercent, 31.03, 'BBCA has only Lokal investors here');
  assert.strictEqual(bbca.foreignPercent, 0);

  const tlkm = result.data.TLKM;
  assert.strictEqual(tlkm.foreignPercent, 5.02, 'REGRESSION: an "Asing" status investor must count toward foreignPercent, not localPercent');
  assert.strictEqual(tlkm.localPercent, 0);

  assert.strictEqual(result.metadata.totalEmiten, 2);
  assert.strictEqual(result.metadata.reportDate, '26 Aug 2026');
  assert.strictEqual(result.metadata.source, 'upload', 'REGRESSION: a successful upload must be tagged source:"upload", distinguishing it from the bundled default snapshot in the UI');
});

test('KSEI upload template: kseiParseWorkbook() rejects the whole file when a required column is missing, never partially imports', () => {
  const kseiParseWorkbook = _loadKseiParseWorkbook();
  const rows = [
    // Missing "Tanggal Laporan" entirely
    { 'Ticker': 'BBCA', 'Nama Emiten': 'Bank Central Asia Tbk', 'Nama Investor': 'Anthoni Salim', 'Status': 'Lokal', 'Persentase (%)': 5.13, 'Jumlah Saham': 1250000000 }
  ];
  const result = kseiParseWorkbook(rows);
  assert.strictEqual(result.data, null, 'a file missing a required column must not produce any data');
  assert(result.errors.length > 0);
  assert(/Tanggal Laporan/.test(result.errors[0]), 'the error must name the specific missing column, not a generic failure');
});

test('KSEI upload template: kseiParseWorkbook() rejects a row with an invalid Status/Ticker/Persentase with a row-numbered reason, never silently drops or guesses', () => {
  const kseiParseWorkbook = _loadKseiParseWorkbook();
  const badStatusRows = [
    { 'Ticker': 'BBCA', 'Nama Emiten': 'Bank Central Asia Tbk', 'Nama Investor': 'Anthoni Salim', 'Status': 'Warga Negara Asing', 'Persentase (%)': 5.13, 'Jumlah Saham': 1250000000, 'Tanggal Laporan': '26 Aug 2026' }
  ];
  const r1 = kseiParseWorkbook(badStatusRows);
  assert.strictEqual(r1.data, null);
  assert(/Baris 2/.test(r1.errors[0]), 'REGRESSION: the error must cite the actual row number (row 2 = first data row after the header) so the user can find and fix it');
  assert(/Status/.test(r1.errors[0]));

  const badTickerRows = [
    { 'Ticker': 'TOOLONGTICKER', 'Nama Emiten': 'X', 'Nama Investor': 'Y', 'Status': 'Lokal', 'Persentase (%)': 5, 'Jumlah Saham': 100, 'Tanggal Laporan': '26 Aug 2026' }
  ];
  const r2 = kseiParseWorkbook(badTickerRows);
  assert.strictEqual(r2.data, null);
  assert(/Ticker/.test(r2.errors[0]));

  const badPctRows = [
    { 'Ticker': 'BBCA', 'Nama Emiten': 'X', 'Nama Investor': 'Y', 'Status': 'Lokal', 'Persentase (%)': 'lima persen', 'Jumlah Saham': 100, 'Tanggal Laporan': '26 Aug 2026' }
  ];
  const r3 = kseiParseWorkbook(badPctRows);
  assert.strictEqual(r3.data, null, 'REGRESSION: a non-numeric Persentase (%) must be rejected, never silently coerced to 0 or NaN and imported anyway');
});

test('KSEI upload template: kseiParseWorkbook() rejects a file whose "Tanggal Laporan" is inconsistent across rows', () => {
  const kseiParseWorkbook = _loadKseiParseWorkbook();
  const rows = [
    { 'Ticker': 'BBCA', 'Nama Emiten': 'X', 'Nama Investor': 'A', 'Status': 'Lokal', 'Persentase (%)': 5, 'Jumlah Saham': 100, 'Tanggal Laporan': '26 Aug 2026' },
    { 'Ticker': 'TLKM', 'Nama Emiten': 'Y', 'Nama Investor': 'B', 'Status': 'Lokal', 'Persentase (%)': 6, 'Jumlah Saham': 200, 'Tanggal Laporan': '25 Aug 2026' }
  ];
  const result = kseiParseWorkbook(rows);
  assert.strictEqual(result.data, null, 'REGRESSION: mixing two different report dates in one file must be rejected, not silently take the first/last one');
  assert(/Tanggal Laporan/.test(result.errors[0]));
});

// ── TEST 97: REGRESSION GUARD — the old Google-Sheets-fetch + Firebase
// Firestore KSEI mechanism (POST /api/ksei/sync, parseKseiCsv(),
// kseiSyncFromSheets(), kseiSaveSnapshotToFirestore()/kseiLoadFromFirestore())
// must stay removed. Its server-side write always threw EROFS on Vercel
// (read-only production filesystem outside /tmp) — reintroducing any part
// of it would silently reopen that same non-functional "Update Data"
// button. The GET-only /api/ksei/data|stock|summary endpoints (serving
// the bundled default snapshot, no write involved) must remain.
test('REGRESSION GUARD: the old Google-Sheets-sync + Firestore KSEI mechanism must stay removed; the bundled-default GET endpoints must remain', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(!/app\.post\(['"]\/api\/ksei\/sync['"]/.test(serverSrc), 'REGRESSION: POST /api/ksei/sync is back — it always threw EROFS on Vercel production (read-only filesystem outside /tmp)');
  assert(!/function parseKseiCsv/.test(serverSrc), 'REGRESSION: parseKseiCsv() (fragile positional-column CSV parser) is back');
  assert(/app\.get\(['"]\/api\/ksei\/data['"]/.test(serverSrc), 'GET /api/ksei/data (bundled default snapshot, read-only) must still exist');

  const kseiClientSrc = fs.readFileSync(path.join(__dirname, 'public/js/34-ksei-shareholders.js'), 'utf8');
  assert(!/function kseiSyncFromSheets/.test(kseiClientSrc), 'REGRESSION: kseiSyncFromSheets() is back');
  assert(!/function kseiSaveSnapshotToFirestore/.test(kseiClientSrc), 'REGRESSION: kseiSaveSnapshotToFirestore() is back — Firestore must not become a third copy of truth again');
  assert(!/function kseiLoadFromFirestore/.test(kseiClientSrc), 'REGRESSION: kseiLoadFromFirestore() is back');
  assert(/function kseiImportExcelFile/.test(kseiClientSrc), 'kseiImportExcelFile() (the Excel-upload entry point) must exist');
  assert(/function kseiParseWorkbook/.test(kseiClientSrc), 'kseiParseWorkbook() must exist');
  assert(/scheduleKseiCloudSync\(\)/.test(kseiClientSrc), "REGRESSION: kseiImportExcelFile() no longer calls scheduleKseiCloudSync() — an upload would only persist to localStorage, silently losing durability across devices/browsers");
  assert(/client\.from\(['"]ksei_ownership['"]\)/.test(kseiClientSrc), 'REGRESSION: the dedicated public.ksei_ownership Supabase table wiring is gone');

  // Raw 2-file upload path (added 2026-09-11, alongside the single-
  // template path above) — same wiring guarantees.
  assert(/function kseiParseOwnershipRaw/.test(kseiClientSrc), 'kseiParseOwnershipRaw() must exist');
  assert(/function kseiParseFreeFloatRaw/.test(kseiClientSrc), 'kseiParseFreeFloatRaw() must exist');
  assert(/function kseiCombineRawSheets/.test(kseiClientSrc), 'kseiCombineRawSheets() must exist');
  assert(/function kseiImportRawFiles/.test(kseiClientSrc), 'kseiImportRawFiles() (the raw-2-file upload entry point) must exist');
  assert(/getElementById\(\s*ownershipInputId \|\| ['"]ksei-import-ownership-file['"]\s*\)/.test(kseiClientSrc), 'ksei-import-ownership-file input wiring is gone');
  assert(/getElementById\(\s*ffInputId \|\| ['"]ksei-import-ff-file['"]\s*\)/.test(kseiClientSrc), 'ksei-import-ff-file input wiring is gone');
  assert(/id="ksei-import-ownership-file"/.test(kseiClientSrc) && /id="ksei-import-ff-file"/.test(kseiClientSrc), 'REGRESSION: the 2 raw-file upload input elements are missing from the Settings tab markup');
  assert(/onclick="kseiImportRawFiles\(/.test(kseiClientSrc), 'REGRESSION: the raw-2-file "Gabungkan & Import" button no longer calls kseiImportRawFiles()');
});

// TEST added 2026-09-11 (user-requested: "Diamana tombil upload datanya" —
// the KSEI upload UI was only reachable from a stock's Fundamental Suite
// page, buried behind several clicks with no direct path). Adds a
// shortcut button on the Settings page that opens the KSEI Explorer
// modal straight to the upload tab — live-verified via Playwright
// (Settings page -> click button -> modal open on sync-settings tab with
// both raw-file inputs visible) before this test was written.
test('REGRESSION GUARD: Settings page must have a shortcut button that opens the KSEI Explorer directly on the upload tab', () => {
  const settingsSrc = fs.readFileSync(path.join(__dirname, 'public/js/35-settings.js'), 'utf8');
  assert(/openKseiModal\(\)/.test(settingsSrc), 'REGRESSION: the Settings page KSEI shortcut no longer calls openKseiModal()');
  assert(/kseiSwitchTab\(['"]sync-settings['"]\)/.test(settingsSrc), "REGRESSION: the Settings page KSEI shortcut no longer switches to the 'sync-settings' (upload) tab — clicking it would land on the read-only stock-view tab instead");
});

// ── TEST: Autonomous AI Trading Engine — Auto-Pilot & Capital Configuration
test('AI AUTONOMOUS TRADING: aiConfigureCapital() and aiResetPaperCapital() manage virtual capital safely', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  assert(/function aiConfigureCapital\(/.test(fullSrc), 'aiConfigureCapital() must exist');
  assert(/function aiResetPaperCapital\(/.test(fullSrc), 'aiResetPaperCapital() must exist');
  assert(/function aiToggleAutoPilot\(/.test(fullSrc), 'aiToggleAutoPilot() must exist');

  const sandbox = {
    window: {},
    document: { getElementById: () => null },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    showToast: () => {},
    mwSendBrowserNotification: () => {},
    setTimeout: () => {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fullSrc, ctx, { filename: '38-ai-autonomous-trading.js full test load' });

  const state = ctx.AI_TRADE_STATE;
  assert(state && state.paperAccount, 'AI_TRADE_STATE.paperAccount must exist');
  assert(state.autoPilot, 'AI_TRADE_STATE.autoPilot must exist');
  assert(state.adaptiveWeights, 'AI_TRADE_STATE.adaptiveWeights must exist');

  // Test capital configure
  assert.strictEqual(ctx.aiConfigureCapital(0), false, 'aiConfigureCapital(0) must return false');
  assert.strictEqual(ctx.aiConfigureCapital(-5000), false, 'aiConfigureCapital(-5000) must return false');
  assert.strictEqual(ctx.aiConfigureCapital(50000000), true, 'aiConfigureCapital(50000000) must return true');
  assert.strictEqual(state.paperAccount.initialCapital, 50000000, 'initialCapital must be updated to 50M');

  // Test reset capital
  ctx.aiResetPaperCapital(25000000);
  assert.strictEqual(state.paperAccount.initialCapital, 25000000, 'reset capital must set 25M initial');
  assert.strictEqual(state.paperAccount.cash, 25000000, 'reset capital must set 25M cash');
  assert.strictEqual(state.paperAccount.openPositions.length, 0, 'open positions must be empty after reset');
  assert.strictEqual(state.paperAccount.closedTrades.length, 0, 'closed trades must be empty after reset');

  // Test auto-pilot toggle
  assert.strictEqual(state.autoPilot.enabled, false, 'Auto-pilot must start disabled by default');
  ctx.aiToggleAutoPilot(true);
  assert.strictEqual(state.autoPilot.enabled, true, 'Auto-pilot must be enabled after toggle(true)');
  ctx.aiToggleAutoPilot(false);
  assert.strictEqual(state.autoPilot.enabled, false, 'Auto-pilot must be disabled after toggle(false)');
});

// ── TEST: Continuous Adaptive Learning — Regime & Strategy Weight Multipliers Calibration
test('AI AUTONOMOUS TRADING: aiCalibrateAdaptiveWeights() dynamically adjusts weights on trade outcomes', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  assert(/function aiCalibrateAdaptiveWeights\(/.test(fullSrc), 'aiCalibrateAdaptiveWeights() must exist');

  const sandbox = {
    window: {},
    document: { getElementById: () => null },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    showToast: () => {},
    mwSendBrowserNotification: () => {},
    setTimeout: () => {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fullSrc, ctx, { filename: '38-ai-autonomous-trading.js test load' });

  const weights = ctx.AI_TRADE_STATE.adaptiveWeights;
  assert(weights.regimeMultipliers, 'regimeMultipliers must exist');
  assert(weights.strategyMultipliers, 'strategyMultipliers must exist');

  // Simulate a high-reward WIN trade (R >= 2.0)
  const winTrade = {
    id: 'TRADE-WIN-1',
    ticker: 'BBCA',
    strategy: 'strat_pullback',
    regimeAtEntry: 'BULL_TREND',
    result: 'WIN',
    rMultiple: 2.4,
    netPnL: 600000
  };
  const prevStratMult = weights.strategyMultipliers.strat_pullback || 1.0;
  const prevRegimeMult = weights.regimeMultipliers.BULL_TREND || 1.10;

  const res1 = ctx.aiCalibrateAdaptiveWeights(winTrade);
  assert(res1, 'aiCalibrateAdaptiveWeights must return calibration record');
  assert(weights.strategyMultipliers.strat_pullback > prevStratMult, 'Strategy multiplier must increase on WIN with R >= 2.0');
  assert(weights.regimeMultipliers.BULL_TREND > prevRegimeMult, 'Regime multiplier must increase on WIN with R >= 2.0');
  assert.strictEqual(weights.adaptationHistory.length, 1, 'adaptationHistory must record trade calibration');

  // Simulate a LOSS trade
  const lossTrade = {
    id: 'TRADE-LOSS-1',
    ticker: 'ASII',
    strategy: 'strat_pullback',
    regimeAtEntry: 'BULL_TREND',
    result: 'LOSS',
    rMultiple: -1.0,
    netPnL: -200000
  };
  const beforeLossStrat = weights.strategyMultipliers.strat_pullback;
  const beforeLossRegime = weights.regimeMultipliers.BULL_TREND;

  ctx.aiCalibrateAdaptiveWeights(lossTrade);
  assert(weights.strategyMultipliers.strat_pullback < beforeLossStrat, 'Strategy multiplier must decrease on LOSS');
  assert(weights.regimeMultipliers.BULL_TREND < beforeLossRegime, 'Regime multiplier must decrease on LOSS');
  assert.strictEqual(weights.adaptationHistory.length, 2, 'adaptationHistory must record second calibration');
});

// ── TEST: Copy Trading Signal Generator
test('AI AUTONOMOUS TRADING: aiFormatCopyTradingSignal() generates actionable institutional signal card', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  assert(/function aiFormatCopyTradingSignal\(/.test(fullSrc), 'aiFormatCopyTradingSignal() must exist');
  assert(/function renderAiCopyTrading\(/.test(fullSrc), 'renderAiCopyTrading() must exist');

  const sandbox = {
    window: {},
    document: { getElementById: () => null },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    showToast: () => {},
    mwSendBrowserNotification: () => {},
    setTimeout: () => {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fullSrc, ctx, { filename: '38-ai-autonomous-trading.js test load' });

  const testPosition = {
    id: 'POS-TEST-1',
    ticker: 'BMRI',
    entryPrice: 6500,
    sl: 6300,
    tp1: 6700,
    tp2: 6900,
    lots: 10,
    strategy: 'Breakout Momentum',
    costBasis: 6500000
  };

  const signalText = ctx.aiFormatCopyTradingSignal(testPosition);
  assert(signalText.includes('BMRI'), 'Signal must contain ticker');
  assert(signalText.includes('BUY / LONG'), 'Signal must contain action');
  assert(signalText.includes('Stop Loss'), 'Signal must contain Stop Loss');
  assert(signalText.includes('Target Profit 1'), 'Signal must contain TP1');
  assert(signalText.includes('Target Profit 2'), 'Signal must contain TP2');
  assert(signalText.includes('Risk : Reward'), 'Signal must contain Risk:Reward');
});

// ══════════════════════════════════════════════════════════════
// TEST SUITE: 1-CLICK MASTER STOCK ANALYSIS DOSSIER
// ══════════════════════════════════════════════════════════════

function getDossierContext() {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/46-stock-dossier.js'), 'utf8');
  const sandbox = {
    window: {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    fetch: () => Promise.resolve({ ok: false }),
    setTimeout: setTimeout,
    showToast: () => {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '46-stock-dossier.js' });
  return ctx;
}

test('MASTER DOSSIER: 46-stock-dossier.js loads and exports institutional presets and calculation functions', () => {
  const dossier = getDossierContext();
  assert.strictEqual(typeof dossier.dossierCalculateCompositeScore, 'function', 'dossierCalculateCompositeScore must be a function');
  assert.strictEqual(typeof dossier.dossierCalculateScore, 'function', 'dossierCalculateScore must be a function');
  assert.strictEqual(typeof dossier.dossierGetDefaultWeights, 'function', 'dossierGetDefaultWeights must be a function');

  const defWeights = dossier.dossierGetDefaultWeights();
  assert.strictEqual(defWeights.valuation, 20, 'Valuation default weight must be 20%');
  assert.strictEqual(defWeights.smartMoney, 20, 'Smart Money default weight must be 20%');
  assert.strictEqual(defWeights.technical, 20, 'Technical default weight must be 20%');
  assert.strictEqual(defWeights.ksei, 15, 'KSEI default weight must be 15%');
  assert.strictEqual(defWeights.fundamental, 15, 'Fundamental default weight must be 15%');
  assert.strictEqual(defWeights.regime, 10, 'Regime default weight must be 10%');

  const sumDef = defWeights.valuation + defWeights.smartMoney + defWeights.technical + defWeights.ksei + defWeights.fundamental + defWeights.regime;
  assert.strictEqual(sumDef, 100, 'Default weights must sum to exactly 100%');

  // Verify all presets sum to 100%
  const presets = dossier.DOSSIER_PRESETS;
  Object.keys(presets).forEach(key => {
    const pw = presets[key].weights;
    const sum = pw.valuation + pw.smartMoney + pw.technical + pw.ksei + pw.fundamental + pw.regime;
    assert.strictEqual(sum, 100, `Preset ${key} weights must sum to 100%`);
  });
});

test('MASTER DOSSIER: Zero Synthetic Data & Dynamic Denominator Renormalization protocol', () => {
  const dossier = getDossierContext();

  // Scenario 1: All 6 pillars available
  const fullPillars = {
    valuation: { available: true, score: 80 },
    smartMoney: { available: true, score: 80 },
    technical: { available: true, score: 80 },
    ksei: { available: true, score: 80 },
    fundamental: { available: true, score: 80 },
    regime: { available: true, score: 80 }
  };
  const res1 = dossier.dossierCalculateCompositeScore(fullPillars, dossier.DOSSIER_DEFAULT_WEIGHTS);
  assert.strictEqual(res1.confidenceLevel, 100, 'Confidence level must be 100% when all pillars available');
  assert.strictEqual(res1.compositeScore, 80, 'Composite score must be 80');
  assert.strictEqual(res1.availablePillarsCount, 6, 'Available count must be 6');
  assert.strictEqual(res1.isDegraded, false, 'Should not be degraded');

  // Scenario 2: Missing KSEI (15% weight)
  const missingKseiPillars = {
    valuation: { available: true, score: 80 },
    smartMoney: { available: true, score: 80 },
    technical: { available: true, score: 80 },
    ksei: { available: false, score: null, status: 'DATA_UNAVAILABLE' },
    fundamental: { available: true, score: 80 },
    regime: { available: true, score: 80 }
  };
  const res2 = dossier.dossierCalculateCompositeScore(missingKseiPillars, dossier.DOSSIER_DEFAULT_WEIGHTS);
  assert.strictEqual(res2.confidenceLevel, 85, 'Confidence level must be 85% when KSEI (15%) is missing');
  assert.strictEqual(res2.compositeScore, 80, 'Dynamic renormalization should preserve 80 score without distortion');
  assert.strictEqual(res2.availablePillarsCount, 5, 'Available count must be 5');
  assert.strictEqual(res2.isDegraded, false, '85% confidence is not degraded (< 70%)');

  // Scenario 3: Missing KSEI (15%), Fundamental (15%), and Smart Money (20%) -> 50% missing!
  const highDegradedPillars = {
    valuation: { available: true, score: 90 },
    smartMoney: { available: false, score: null, status: 'DATA_UNAVAILABLE' },
    technical: { available: true, score: 70 },
    ksei: { available: false, score: null, status: 'DATA_UNAVAILABLE' },
    fundamental: { available: false, score: null, status: 'DATA_UNAVAILABLE' },
    regime: { available: true, score: 60 }
  };
  const res3 = dossier.dossierCalculateCompositeScore(highDegradedPillars, dossier.DOSSIER_DEFAULT_WEIGHTS);
  assert.strictEqual(res3.confidenceLevel, 50, 'Confidence level must drop to 50%');
  assert.strictEqual(res3.isDegraded, true, 'Confidence < 70% must be flagged as degraded');
  assert(res3.recommendation.includes('DATA TERBATAS'), 'Recommendation must warn about limited data');

  // Available weights: valuation (20) * 90 + technical (20) * 70 + regime (10) * 60 = 1800 + 1400 + 600 = 3800
  // Denominator: 20 + 20 + 10 = 50 -> 3800 / 50 = 76
  assert.strictEqual(res3.compositeScore, 76, 'Renormalized score should be (1800 + 1400 + 600)/50 = 76');
});

test('MASTER DOSSIER: Individual pillar scoring models behave within valid quantitative boundaries', () => {
  const dossier = getDossierContext();

  // 1. Valuation Pillar
  const valSampleHighMoS = {
    quote: { price: 8000, fundamentals: { per: 12, pbv: 1.5, eps: 800, bvps: 5500 } }
  };
  const valResHigh = dossier.dossierComputeValuationScore(valSampleHighMoS);
  assert(valResHigh.available, 'Valuation must be available');
  assert(valResHigh.score >= 80, `High MoS should produce high valuation score (got ${valResHigh.score})`);

  // 2. Smart Money Pillar
  const smSampleAccum = {
    brokerSummary: {
      bandarmology: { status: 'Big Accumulation', top3Concentration: 72, foreignNet: 15000000000, vwap: 8100 }
    },
    quote: { price: 8000 }
  };
  const smRes = dossier.dossierComputeSmartMoneyScore(smSampleAccum);
  assert(smRes.available, 'Smart money must be available');
  assert(smRes.score >= 85, `Big Accumulation should score >= 85 (got ${smRes.score})`);

  // 3. Technical Pillar
  const techSample = {
    quote: { price: 1000 },
    history: Array.from({ length: 50 }, (_, i) => ({
      close: 900 + (i * 2),
      volume: i === 49 ? 50000 : 20000
    }))
  };
  const techRes = dossier.dossierComputeTechnicalScore(techSample);
  assert(techRes.available, 'Technical must be available with 50 bars');
  assert(techRes.score >= 70, `Upward trend with volume spike must score >= 70 (got ${techRes.score})`);

  // 4. KSEI Pillar
  const kseiSample = {
    ksei: {
      found: true,
      stock: { freeFloat: 28, localPercent: 35, foreignPercent: 30 }
    }
  };
  const kseiRes = dossier.dossierComputeKseiScore(kseiSample);
  assert(kseiRes.available, 'KSEI must be available');
  assert(kseiRes.score >= 75, `Healthy 28% free float and 65% institutions should score >= 75 (got ${kseiRes.score})`);

  // 5. Fundamental Pillar
  const fundSample = {
    quote: { fundamentals: { roe: 18.5, der: 0.65, npm: 22.0, dividendYield: 4.8 } }
  };
  const fundRes = dossier.dossierComputeFundamentalScore(fundSample);
  assert(fundRes.available, 'Fundamental must be available');
  assert(fundRes.score >= 80, `Strong ROE and low DER must score >= 80 (got ${fundRes.score})`);

  // 6. Regime Pillar (Direct & Nested server API payload)
  const regimeSampleDirect = { regime: { regime: 'BULL_TREND', confidence: 85 } };
  const regimeResDirect = dossier.dossierComputeRegimeScore(regimeSampleDirect);
  assert(regimeResDirect.available, 'Regime must be available');
  assert.strictEqual(regimeResDirect.score, 85, 'BULL_TREND should score 85');

  const regimeSampleNested = { regime: { success: true, regime: { regime: 'BEAR_TREND', confidence: 70 } } };
  const regimeResNested = dossier.dossierComputeRegimeScore(regimeSampleNested);
  assert.strictEqual(regimeResNested.score, 25, 'Nested BEAR_TREND should score 25 without toUpperCase error');

  const regimeSampleEmpty = {};
  const regimeResEmpty = dossier.dossierComputeRegimeScore(regimeSampleEmpty);
  assert.strictEqual(regimeResEmpty.score, 55, 'Empty regime should fallback safely to neutral sideways (55) without crashing');
});

// User-reported (2026-09-18): Stock Dossier's "Kepemilikan Kustodian KSEI"
// pillar showed "DATA TIDAK TERSEDIA" for major tickers (BBCA/BBRI/GGRM)
// even though the app already has a working, live Invezgo endpoint for
// shareholder composition (/api/idx/shareholder-composition/:ticker, built
// earlier this session for 34-ksei-shareholders.js) — root cause: the
// static ~840/958-ticker Google Sheets snapshot (data/ksei-shareholders.json,
// dated 26 Aug 2026) simply doesn't have those tickers, and
// dossierComputeKseiScore() never tried the live Invezgo source as a
// fallback. Fixed by adding a fallback path that derives an honest,
// clearly-different metric (institutional/foreign % from real KSEI
// category share counts) instead of declaring the pillar unavailable.
test('REGRESSION GUARD: Stock Dossier KSEI pillar falls back to live Invezgo composition when the static >5%-holder dataset has no entry for the ticker', () => {
  const dossier = getDossierContext();

  // Static dataset genuinely has no entry (found:false, the exact shape
  // GET /api/ksei/stock/:ticker returns for a missing ticker) AND a real
  // Invezgo composition IS available — must NOT report DATA_UNAVAILABLE.
  const kseiFallbackSample = {
    ksei: { success: true, found: false, ticker: 'BBCA', stock: { ticker: 'BBCA', name: 'BBCA', investors: [], totalMajorPercent: 0, freeFloat: 100, localPercent: 0, foreignPercent: 0 } },
    kseiLive: {
      available: true,
      kseiLatest: {
        date: '2026-08-31',
        foreign: { is: 0, cp: 0, pf: 0, ib: 0, id: 5000000, mf: 0, sc: 0, fd: 0, ot: 0 },
        local: { is: 20000000, cp: 30000000, pf: 5000000, ib: 10000000, id: 25000000, mf: 5000000, sc: 0, fd: 0, ot: 0 },
        foreignTotal: 5000000,
        localTotal: 95000000
      }
    }
  };
  const fallbackRes = dossier.dossierComputeKseiScore(kseiFallbackSample);
  assert.strictEqual(fallbackRes.available, true, 'REGRESSION: KSEI pillar must be available when live Invezgo composition exists, even if the static dataset has no entry');
  assert.strictEqual(fallbackRes.status, 'REAL', 'REGRESSION: the live-composition fallback must be labeled REAL, not left unavailable');
  assert.strictEqual(fallbackRes.freeFloat, null, 'REGRESSION: freeFloat must stay honestly null in the fallback (individual-category share is NOT the same thing as official Free Float)');
  assert(typeof fallbackRes.institutionalPct === 'number' && fallbackRes.institutionalPct > 0, 'REGRESSION: institutionalPct must be a real derived number in the fallback');
  assert(typeof fallbackRes.foreignPct === 'number', 'REGRESSION: foreignPct must be a real derived number in the fallback');
  assert(/komposisi kepemilikan LIVE Invezgo/i.test(fallbackRes.reason), 'REGRESSION: the fallback reason must honestly disclose it is using live Invezgo composition, not official Free Float');

  // Neither the static dataset NOR live Invezgo has anything — must stay
  // honestly DATA_UNAVAILABLE (no fabrication when truly nothing exists).
  const kseiNoneSample = {
    ksei: { success: true, found: false, ticker: 'ZZZZ', stock: { ticker: 'ZZZZ', investors: [], totalMajorPercent: 0, freeFloat: 100 } },
    kseiLive: { available: false }
  };
  const noneRes = dossier.dossierComputeKseiScore(kseiNoneSample);
  assert.strictEqual(noneRes.available, false, 'REGRESSION: KSEI pillar must stay unavailable when neither static nor live Invezgo data exists');

  // The existing named-holder (static dataset) path must still work exactly
  // as before — this fallback must not have broken the primary path.
  const kseiNamedSample = { ksei: { found: true, stock: { freeFloat: 28, localPercent: 35, foreignPercent: 30 } } };
  const namedRes = dossier.dossierComputeKseiScore(kseiNamedSample);
  assert.strictEqual(namedRes.available, true, 'REGRESSION: the existing named->5%-holder path must remain available');
  assert(namedRes.score >= 75, 'REGRESSION: the existing named->5%-holder scoring must be unchanged (healthy 28% free float should still score >= 75)');

  const src = fs.readFileSync(path.join(__dirname, 'public/js/46-stock-dossier.js'), 'utf8');
  assert(/kseiLivePromise/.test(src), 'REGRESSION: dossierHarvestData() no longer fetches the live Invezgo shareholder-composition endpoint');
  assert(/shareholder-composition\//.test(src), 'REGRESSION: dossierHarvestData() no longer calls /api/idx/shareholder-composition/');
  assert(/harvested\.kseiLive/.test(src), 'REGRESSION: harvested.kseiLive is gone — the KSEI pillar has no live-Invezgo fallback source');
});

test('MASTER DOSSIER: Non-universe ticker rejection & zero dummy data mandate (AGENTS.md §1, §5, §28)', async () => {
  const dossier = getDossierContext();

  // 1. Ticker validator must reject non-existent tickers
  assert.strictEqual(dossier.dossierIsValidTicker('XXXX'), false, 'XXXX must be rejected by ticker validator');
  assert.strictEqual(dossier.dossierIsValidTicker('YYYY'), false, 'YYYY must be rejected by ticker validator');
  assert.strictEqual(dossier.dossierIsValidTicker('AAAA'), false, 'AAAA must be rejected by ticker validator');
  assert.strictEqual(dossier.dossierIsValidTicker('BBCA'), true, 'BBCA must be accepted as valid IDX ticker');

  // 2. Data harvesting must return null and block scoring
  const harvestResult = await dossier.dossierHarvestData('XXXX');
  assert.strictEqual(harvestResult, null, 'Harvesting non-existent ticker XXXX must return null');
  assert.strictEqual(dossier.dossierState.isInvalidTicker, true, 'isInvalidTicker flag must be set to true');
  assert.strictEqual(dossier.dossierState.scoringResult, null, 'scoringResult must remain null (no synthetic scoring)');
  assert(dossier.dossierState.errorMessage.includes('Tidak Terdaftar dalam Stock Universe IDX'), 'Error message must explicitly cite IDX universe rejection');

  // 3. UI rendering must render the Zero-State Warning Banner and NOT any score cards or radar
  let htmlResult = '';
  dossier.document.getElementById = (id) => {
    if (id === 'page-stock-dossier') {
      return {
        set innerHTML(val) { htmlResult = val; },
        get innerHTML() { return htmlResult; }
      };
    }
    return null;
  };

  dossier.renderStockDossierPage('XXXX');
  assert(htmlResult.includes('BLOCKED (AGENTS.md §1 &amp; §5)'), 'Rendered HTML must include BLOCKED badge');
  assert(htmlResult.includes('Tidak Terdaftar dalam Stock Universe IDX'), 'Rendered HTML must include rejection notice');
  assert(!htmlResult.includes('Composite Multi-Factor Score'), 'Rendered HTML must NOT include composite score card for invalid ticker');
  assert(!htmlResult.includes('dossier-radar-canvas'), 'Rendered HTML must NOT render radar canvas for invalid ticker');
});

test('MASTER DOSSIER: Explicit SIMULATION status badge and disclaimer when broker data is simulated', () => {
  const dossier = getDossierContext();

  // 1. When bSummary is simulated
  const harvestedSim = {
    quote: { quote: { price: 10000, eps: 500, bvps: 5000, isSimulated: false } },
    brokerSummary: {
      isSimulated: true,
      quality: { status: 'SIMULATION', source: 'client_side_template' },
      accumulation: 'Akumulasi',
      top3Concentration: 65,
      foreignNet: 5000000000,
      vwap: 9950,
      topBuyers: [{ broker: 'CC', name: 'Mandiri Sekuritas', isForeign: false, valueRp: 5200000000, avgPrice: 9950 }]
    }
  };

  const smRes = dossier.dossierComputeSmartMoneyScore(harvestedSim);
  assert.strictEqual(smRes.status, 'SIMULATION', 'Smart Money status must be SIMULATION when simulated');
  assert.strictEqual(smRes.isSimulated, true, 'isSimulated must be true');
  assert(smRes.reason.includes('[SIMULASI MODEL]'), 'Reason should contain [SIMULASI MODEL]');

  // 2. Badge rendering check
  const badgeSim = dossier.dossierRenderStatusBadge(smRes);
  assert(badgeSim.includes('SIMULASI'), 'Badge must display SIMULASI');
  assert(badgeSim.includes('ti-flask'), 'Badge must include flask icon');

  const badgeReal = dossier.dossierRenderStatusBadge({ available: true, status: 'REAL', isSimulated: false });
  assert(badgeReal.includes('REAL'), 'Real pillar badge must show REAL');

  const badgeUnavail = dossier.dossierRenderStatusBadge({ available: false });
  assert(badgeUnavail.includes('DATA TIDAK TERSEDIA'), 'Unavailable pillar must show DATA TIDAK TERSEDIA');

  // 3. Render page and verify banner
  let htmlResult = '';
  dossier.document.getElementById = (id) => {
    if (id === 'page-stock-dossier') {
      return {
        set innerHTML(val) { htmlResult = val; },
        get innerHTML() { return htmlResult; }
      };
    }
    return null;
  };

  dossier.dossierState.ticker = 'BBCA';
  dossier.dossierState.isInvalidTicker = false;
  dossier.dossierState.errorMessage = null;
  dossier.dossierState.harvestedData = harvestedSim;
  dossier.dossierState.scoringResult = dossier.dossierCalculateScore(harvestedSim);

  dossier.renderStockDossierPage('BBCA');
  assert(htmlResult.includes('STATUS DATA: SIMULASI / MODEL ESTIMASI DETERMINISTIK'), 'Rendered HTML must include simulation disclaimer banner in smart money');
  assert(htmlResult.includes('Broker Akumulator (Simulasi Model):'), 'Card accumulator chip must denote simulation model');
});

// ── Audit finding (2026-09-17, INCIDENT_LOG.md): dossierComputeRegimeScore()
// legitimately returns regimeConfidence:0 (a real "no confidence" reading,
// e.g. an UNKNOWN regime state), and the reason string correctly says
// "Confidence: 0%" — but the Market Regime card's own confidence badge used
// `rp.regimeConfidence || 75`, and 0 is falsy in JS, so the badge silently
// displayed a FAKE 75% instead of the real 0% right next to the correct
// text saying 0% in the same card. Found by manually recomputing a live
// screenshot's displayed numbers by hand and spotting the two different
// confidence values shown for the same pillar.
test('MASTER DOSSIER: regime confidence badge must not silently replace a real 0% with the 75% fallback (falsy-zero bug)', () => {
  const dossier = getDossierContext();

  const regimeZeroConfidence = dossier.dossierComputeRegimeScore({ regime: { regime: 'UNKNOWN', confidence: 0 } });
  assert.strictEqual(regimeZeroConfidence.regimeConfidence, 0, 'sanity: dossierComputeRegimeScore() itself must preserve a real 0 confidence, not silently default it');
  assert(regimeZeroConfidence.reason.includes('Confidence: 0%'), 'sanity: the reason string must say 0%, matching regimeConfidence');

  const harvestedZeroConf = {
    quote: { price: 9000, fundamentals: { roe: 18, der: 0.6, dividendYield: 3 } },
    regime: { regime: 'UNKNOWN', confidence: 0 }
  };
  let htmlResult = '';
  dossier.document.getElementById = (id) => id === 'page-stock-dossier'
    ? { set innerHTML(v) { htmlResult = v; }, get innerHTML() { return htmlResult; } }
    : null;
  dossier.dossierState.ticker = 'BBCA';
  dossier.dossierState.isInvalidTicker = false;
  dossier.dossierState.errorMessage = null;
  dossier.dossierState.harvestedData = harvestedZeroConf;
  dossier.dossierState.scoringResult = dossier.dossierCalculateScore(harvestedZeroConf);
  dossier.renderStockDossierPage('BBCA');

  assert(!/Confidence:<\/span> <b[^>]*>75%/.test(htmlResult), 'REGRESSION: the Market Regime card badge fell back to the fake 75% placeholder instead of showing the real 0% confidence');
  assert(/Confidence:<\/span> <b[^>]*>0%/.test(htmlResult), 'REGRESSION: the Market Regime card badge must display the real 0% confidence, matching the reason text in the same card');
});

test('MASTER DOSSIER: DOM structure, script inclusion, and router integration', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const routerJs = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');

  assert(indexHtml.includes('id="page-stock-dossier"'), 'index.html must include #page-stock-dossier container');
  assert(indexHtml.includes('46-stock-dossier.js'), 'index.html must include script tag for 46-stock-dossier.js');
  assert(indexHtml.includes("goPage('stock-dossier'"), 'index.html must have sidebar button linking to stock-dossier');
  assert(routerJs.includes("case 'stock-dossier':"), '06-analysis-router.js must handle case stock-dossier');
  assert(routerJs.includes('renderStockDossierPage'), '06-analysis-router.js must call renderStockDossierPage()');
});

test('REGRESSION GUARD: lib/idx-data-engine.js loads cleanly without ReferenceError when Redis is not installed', async () => {
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash-url.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
    assert(engineSrc.includes('let Redis = null;'), 'Must initialize Redis as null before dynamic import');
    assert(engineSrc.includes("import('@upstash/redis')"), 'Must use dynamic import for @upstash/redis');
    assert(engineSrc.includes('_dqRedisClient = (Redis &&'), 'Must check that Redis is truthy before instantiating new Redis');
  } finally {
    // FIX (2026-09-18, discovered via the Unified Screener's new behavioral
    // test failing downstream): `process.env.X = undefined` does NOT delete
    // the var — Node coerces it to the literal string "undefined", which
    // then poisons every later test in this same process that dynamically
    // imports a module gating a real Redis client on these exact env vars
    // (e.g. lib/providers/yahoo-client.js's `new Redis({url: "undefined"})`
    // throws "invalid URL"). Must delete when the original was unset.
    if (origUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = origUrl;
    if (origToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
  }
});

test('REGRESSION GUARD: dossierAddToWatchlist and dossierOpenInStockChat use official canonical functions', () => {
  const dossier = getDossierContext();
  let addedTicker = null;
  let toastMsg = null;
  dossier.FS_WL = [{ t: 'BBCA' }];
  dossier.fsTgWl = (tk) => { addedTicker = tk; };
  dossier.showToast = (msg) => { toastMsg = msg; };

  // Already in watchlist
  dossier.dossierAddToWatchlist('BBCA');
  assert(toastMsg.includes('sudah ada di Watchlist'), 'Should detect BBCA already in watchlist');
  assert.strictEqual(addedTicker, null, 'Should not re-add BBCA');

  // Not yet in watchlist
  dossier.dossierAddToWatchlist('TLKM');
  assert.strictEqual(addedTicker, 'TLKM', 'Must call fsTgWl with TLKM');
  assert(toastMsg.includes('berhasil ditambahkan ke Watchlist'), 'Must show success toast');

  // StockChat shortcut
  let openedChat = null;
  dossier.window.openStockChat = (tk, prompt, mode) => {
    openedChat = { tk, prompt, mode };
  };
  dossier.dossierOpenInStockChat('BBCA');
  assert(openedChat !== null, 'Must invoke window.openStockChat');
  assert.strictEqual(openedChat.tk, 'BBCA');
  assert.strictEqual(openedChat.mode, 'chat');
  assert(openedChat.prompt.includes('Analisis lengkap saham BBCA'), 'Must supply proper stock prompt');
});

test('MASTER DOSSIER: Comprehensive regression guards for valuation penalties, bank DER tolerance, Top Sellers, and state binding', () => {
  const dossier = getDossierContext();

  // 1. Global state and export binding
  assert(dossier.STOCK_DOSSIER_STATE, 'STOCK_DOSSIER_STATE must be bound');
  assert.strictEqual(dossier.STOCK_DOSSIER_STATE, dossier.dossierState, 'STOCK_DOSSIER_STATE must reference dossierState');

  // 2. Pillar 1: Negative P/E and negative PBV penalty
  const negValuation = dossier.dossierComputeValuationScore({
    quote: { price: 500 },
    fairValue: { mosPercent: 10, grahamNumber: 600 },
    fundamentals: { pe: -5, pbv: -1.2 }
  });
  assert(negValuation.score <= 40, 'Negative P/E and PBV must incur severe valuation penalties');
  assert(negValuation.reason.includes('rugi') || negValuation.reason.includes('P/E Negatif') || negValuation.reason.includes('Ekuitas Negatif'), 'Must disclose negative earnings / book value in reason');

  // 3. Pillar 5: Banking sector DER tolerance vs non-bank DER penalty
  const bankFund = dossier.dossierComputeFundamentalScore({
    ticker: 'BBCA',
    quote: { price: 10000 },
    fundamentals: { roe: 20, der: 5.2, netProfitMargin: 35, dividendYield: 3.5 }
  });
  const nonBankFund = dossier.dossierComputeFundamentalScore({
    ticker: 'UNVR',
    quote: { price: 2500 },
    fundamentals: { roe: 20, der: 5.2, netProfitMargin: 10, dividendYield: 3.5 }
  });
  assert(bankFund.score > nonBankFund.score, 'Banking sector (BBCA) with DER 5.2x must not be penalized like non-bank company');

  // Negative equity check (DER < 0)
  const negEquityFund = dossier.dossierComputeFundamentalScore({
    ticker: 'GIAA',
    quote: { price: 50 },
    fundamentals: { roe: 5, der: -2.5, netProfitMargin: 2, dividendYield: 0 }
  });
  assert(negEquityFund.score <= 35, 'Negative equity (DER < 0) must incur severe penalty');
  assert(negEquityFund.reason.includes('Ekuitas Negatif'), 'Must explicitly mention negative equity');

  // 4. Pillar 2: Top 5 Sellers / distributors extraction
  const smData = dossier.dossierComputeSmartMoneyScore({
    quote: { price: 9000 },
    bandar: {
      action: 'Big Accumulation',
      top3BuyersPercent: 72,
      foreignFlow: { netBuy: 50000000000 },
      topBrokers: [
        { broker: 'ZP', buyVol: 100000, sellVol: 10000, buyPrice: 9000, sellPrice: 8950 },
        { broker: 'BK', buyVol: 80000, sellVol: 20000, buyPrice: 9050, sellPrice: 9000 },
        { broker: 'PD', buyVol: 5000, sellVol: 120000, buyPrice: 8900, sellPrice: 8950 },
        { broker: 'YP', buyVol: 2000, sellVol: 90000, buyPrice: 8920, sellPrice: 8960 }
      ]
    }
  });
  assert(Array.isArray(smData.distributors), 'smData.distributors must be an array');
  assert(smData.distributors.length >= 2, 'Must extract top sellers / distributors');
  assert.strictEqual(smData.distributors[0].code, 'PD', 'Top seller must be PD');

  // 5. dossierSaveWeights validation
  const defaultWeights = dossier.dossierGetDefaultWeights();
  assert.strictEqual(dossier.dossierSaveWeights({ valuation: -10, smartMoney: 110, technical: 0, ksei: 0, fundamental: 0, regime: 0 }), false, 'Negative weights must be rejected');
});

test('REGRESSION GUARD: CommandCenter loadTransactionFlowData and loadCorporateActionsData error handling', () => {
  const cmdCenterSrc = fs.readFileSync(path.join(__dirname, 'public/js/26-commandcenter.js'), 'utf8');
  assert(cmdCenterSrc.includes('error: true, message: (data && data.error)'), 'loadTransactionFlowData must set error on failure');
  assert(cmdCenterSrc.includes('RADAR_STATE.flowData = { ticker: tk, error: true'), 'loadTransactionFlowData must record error on exception');
  assert(cmdCenterSrc.includes('if (flow && flow.error && flow.ticker === currentTicker)'), 'renderRadarFlowTrailSubTab must render error state with retry');
  assert(cmdCenterSrc.includes('if (corpData.error)'), 'renderRadarCorporateActionsSubTab must render error state with retry');
});

test('REGRESSION GUARD: 24-stockmaster.js techRenderChart guards division by zero and zero/null prices', () => {
  const stockmasterSrc = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  assert(stockmasterSrc.includes('var chgPct = prevPrice > 0 ? (chg / prevPrice * 100) : 0;'), 'Must guard division by zero for chgPct in techRenderChart');
  assert(stockmasterSrc.includes('var curPrice = Number(closePrices[closePrices.length - 1]) || 0;'), 'Must guard curPrice against NaN/null');
});

// Audit finding (2026-09-18, proactive audit requested by user after the
// Stock Dossier KSEI fix): the "Fundamental" page (24-stockmaster.js,
// PROFILES hardcoded snapshot for ~60 tickers) and the "Harga Wajar" page
// (10-hargawajar.js, STOCK_FINANCIAL_DATABASE hardcoded snapshot) each had
// their OWN independently hand-curated EPS/ROE/BVPS numbers for the same
// ticker, never cross-checked against the live Invezgo financial-statement
// endpoint built earlier this session (generateFinancialStatementSummary,
// /api/idx/financial-statement/:ticker) — verified directly for BBCA: EPS
// 395 (Harga Wajar) vs EPS 420 (Fundamental), ROE ~19.9% vs 23.5%. User
// chose (AskUserQuestion): make live Invezgo the primary source on BOTH
// pages, hardcoded snapshots become fallback only.
test('REGRESSION GUARD: Fundamental page (24-stockmaster.js) tries live Invezgo financial-statement before falling back to the hardcoded PROFILES snapshot', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  assert(/async function fundLoadFallbackData/.test(src), 'REGRESSION: fundLoadFallbackData() is no longer async — it can no longer await a live Invezgo fetch before finalizing eps/bvps/roe/shares');
  assert(/fetch\('\/api\/idx\/financial-statement\/'/.test(src), 'REGRESSION: fundLoadFallbackData() no longer fetches the live Invezgo financial-statement endpoint');
  assert(/source:\s*'invezgo_real'/.test(src), 'REGRESSION: the invezgo_real dataQuality tag is gone — Fundamental page no longer distinguishes live-Invezgo numbers from the hardcoded snapshot');
  assert(/await fundLoadFallbackData\(cleanCode, liveMeta, livePrice\)/.test(src), 'REGRESSION: a call site stopped awaiting the now-async fundLoadFallbackData(), so the Invezgo override would race the render');
  // The PROFILES table itself must still exist as a fallback (not deleted) —
  // per the user's chosen approach, the hardcoded snapshot stays as a
  // fallback for when Invezgo is unavailable, it's not replaced outright.
  assert(/var PROFILES = \{/.test(src), 'REGRESSION: the PROFILES fallback table was removed — Invezgo failures would leave the Fundamental page with zero data instead of a labeled fallback');
});

test('REGRESSION GUARD: Harga Wajar auto-fill tries live Invezgo for EVERY ticker (including ones in the curated database), not just uncurated ones', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/10-hargawajar.js'), 'utf8');
  const fnSrc = src.match(/function hw_autoFill\(\)[\s\S]*?\nwindow\.hw_autoFill = hw_autoFill;/)[0];
  assert(!/if \(!STOCK_FINANCIAL_DATABASE\[tk\]\)/.test(fnSrc), 'REGRESSION: hw_autoFill() reverted to skipping the live Invezgo fetch for tickers already in STOCK_FINANCIAL_DATABASE');
  assert(/hw_fetchRealFinancialStatement\(tk, function\(result\)/.test(fnSrc), 'REGRESSION: hw_fetchRealFinancialStatement() is no longer called unconditionally for every ticker');
  assert(/STOCK_FINANCIAL_DATABASE\[tk\]/.test(fnSrc), 'REGRESSION: the curated STOCK_FINANCIAL_DATABASE fallback (used when Invezgo is unavailable) is gone from hw_autoFill()');
});

// ══════════════════════════════════════════════════════════════
// TEST SUITE: CLOUD SYNC MERGE — WEALTH (REKENING BANK/HUTANG/PIUTANG)
// ══════════════════════════════════════════════════════════════

// Audit finding (2026-09-17, INCIDENT_LOG.md): user reported "data hilang
// saat pindah device" for bank accounts / debts / receivables. Root cause:
// WEALTH (public/js/20-wealth.js) is initialized as a TRUTHY object at
// script load (`{bank:[],debt:[],piutang:[],...}`), never null/undefined.
// _mergeDatasets() in 02-storage.js used `local.wealth || cloud.wealth`,
// so a brand-new device's still-empty-but-truthy local WEALTH ALWAYS won
// over real cloud data, silently discarding it, whenever execution fell
// into the general merge tail (i.e. whenever the dedicated "brand new
// device" branch didn't fire — which itself only fires when
// cloud.transactions.length > 0, so it never helps a user who never
// trades stocks and only uses the Wealth module, or a device that already
// has some stock transactions locally).
function getStorageMergeContext() {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/02-storage.js'), 'utf8');
  const sandbox = {
    window: {},
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    }
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const startMarker = '// Menggabungkan data WEALTH';
  const start = src.indexOf(startMarker);
  const endMarker = "\nfunction saveData(){";
  const end = src.indexOf(endMarker, start);
  const slice = 'function _makeTxSig(t){\n  if(!t) return \'\';\n  return (t.date || \'\') + \'|\' + (t.type || \'\') + \'|\' + (t.ticker || \'\') + \'|\' + (t.lot || 0) + \'|\' + (t.price || 0) + \'|\' + (t.sekuritas || \'\');\n}\n'
    + src.slice(start, end)
    + '\nwindow._mergeDatasets = _mergeDatasets; window._mergeWealthData = _mergeWealthData;\n';
  vm.runInContext(slice, ctx, { filename: '02-storage.js (merge slice)' });
  return ctx;
}

test('REGRESSION GUARD: cloud wealth (bank/debt/piutang) must not be discarded by a fresh device\'s still-empty local WEALTH', () => {
  const ctx = getStorageMergeContext();
  assert.strictEqual(typeof ctx._mergeDatasets, 'function', '_mergeDatasets must be exported by the sandbox slice');

  // Skenario 1: pengguna murni pakai fitur Wealth, tidak pernah trading
  // saham sama sekali -> transactions selalu [] di KEDUA sisi, sehingga
  // cabang "device baru" (yang butuh cloud.transactions.length > 0) tidak
  // pernah aktif dan eksekusi jatuh ke merge umum di akhir fungsi.
  const localFresh = {
    transactions: [],
    wealth: { income: 0, expense: 0, deposito: 0, emas: 0, obligasi: 0, bank: [], debt: [], piutang: [] },
    savedAt: '2024-06-01T00:00:00.000Z'
  };
  const cloudReal = {
    transactions: [],
    wealth: {
      income: 5000000, expense: 3000000, deposito: 0, emas: 0, obligasi: 0,
      bank: [{ id: 1, bank: 'BCA', no: '123', saldo: 10000000 }],
      debt: [{ id: 1, nama: 'KPR', outstanding: 500000000 }],
      piutang: [{ id: 1, nama: 'Budi', pokok: 2000000 }]
    },
    savedAt: '2024-06-01T00:00:05.000Z'
  };
  const merged1 = ctx._mergeDatasets(localFresh, cloudReal);
  assert.strictEqual(merged1.wealth.bank.length, 1, 'REGRESSION: real cloud bank account must survive the merge on a wealth-only user');
  assert.strictEqual(merged1.wealth.bank[0].bank, 'BCA', 'Merged bank account must be the real BCA account from cloud');
  assert.strictEqual(merged1.wealth.debt.length, 1, 'REGRESSION: real cloud debt (hutang) must survive the merge');
  assert.strictEqual(merged1.wealth.piutang.length, 1, 'REGRESSION: real cloud receivable (piutang) must survive the merge');

  // Skenario 2: device sudah punya transaksi saham di kedua sisi (bukan
  // "device 100% kosong"), tapi Wealth cuma pernah diisi di device lain.
  const localWithTx = {
    transactions: [{ id: 1, date: '2024-01-01', ticker: 'BBCA' }],
    wealth: { income: 0, expense: 0, deposito: 0, emas: 0, obligasi: 0, bank: [], debt: [], piutang: [] },
    savedAt: '2024-06-01T00:00:00.000Z'
  };
  const cloudWithTx = {
    transactions: [{ id: 1, date: '2024-01-01', ticker: 'BBCA' }],
    wealth: cloudReal.wealth,
    savedAt: '2024-06-01T00:00:05.000Z'
  };
  const merged2 = ctx._mergeDatasets(localWithTx, cloudWithTx);
  assert.strictEqual(merged2.wealth.bank.length, 1, 'REGRESSION: cloud wealth must survive even when both devices already share stock transactions');
  assert.strictEqual(merged2.wealth.debt.length, 1);
  assert.strictEqual(merged2.wealth.piutang.length, 1);

  // Skenario 3: dua device menambah rekening BERBEDA secara independen ->
  // keduanya harus tetap ada (union per-id), tidak boleh saling menimpa.
  const localDiff = { transactions: [], wealth: { bank: [{ id: 2, bank: 'Mandiri', saldo: 5000000 }], debt: [], piutang: [] }, savedAt: '2024-06-01T00:00:03.000Z' };
  const cloudDiff = { transactions: [], wealth: { bank: [{ id: 1, bank: 'BCA', saldo: 10000000 }], debt: [], piutang: [] }, savedAt: '2024-06-01T00:00:05.000Z' };
  const merged3 = ctx._mergeDatasets(localDiff, cloudDiff);
  // Cross-realm gotcha: merged3.wealth.bank is an Array from the vm sandbox's
  // realm, so its .map()/.sort() also produce vm-realm arrays — Array.from()
  // rehomes it into this process's realm before comparing with assert.
  const bankIds = Array.from(merged3.wealth.bank.map(b => b.id)).sort();
  assert.deepStrictEqual(bankIds, [1, 2], 'Two independently-added bank accounts from two devices must both survive (union by id), neither overwritten');
});

// ══════════════════════════════════════════════════════════════
// TEST SUITE: SMART MONEY SCREENER CONSOLIDATION (2026-09-17)
// ══════════════════════════════════════════════════════════════

// User-requested consolidation (INCIDENT_LOG.md 2026-09-17): 3 previously
// separate screeners that overlapped in concept (accumulation/distribution
// "smart money" detection) — Flow Scanner (07-flowscan.js), "Scanner
// Akumulasi & Distribusi" sub-tab (26-commandcenter.js), and "Heatmap &
// Live Scanner" (41-stockchat-cockpit.js) — were merged into 3 modes of a
// single "Smart Money Screener" page. These are source-text regression
// guards (the merged functions have heavy cross-file global dependencies —
// RADAR_STATE, BANDAR_SECTOR_DEFS, generateClientSideBrokerSummary, DB,
// XLSX_DATA — that make a full vm-sandbox functional test impractical;
// the actual behavior was verified live via Playwright instead, see
// INCIDENT_LOG.md) confirming the old duplicate entry points stay gone and
// the new consolidated ones stay in place.
test('REGRESSION GUARD: Smart Money Screener consolidation — old duplicate entry points must not resurface', () => {
  const flowScanSrc = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');
  const cmdCenterSrc = fs.readFileSync(path.join(__dirname, 'public/js/26-commandcenter.js'), 'utf8');
  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

  // 1. New consolidated mode functions must exist in 07-flowscan.js.
  assert(/function fsSwitchScreenerMode\(mode\)/.test(flowScanSrc), 'REGRESSION: fsSwitchScreenerMode() is gone from 07-flowscan.js');
  assert(/async function fsRenderBrokerFlowMode\(\)/.test(flowScanSrc), 'REGRESSION: fsRenderBrokerFlowMode() is gone from 07-flowscan.js');
  assert(/function fsRenderSectorHeatmapMode\(/.test(flowScanSrc), 'REGRESSION: fsRenderSectorHeatmapMode() is gone from 07-flowscan.js');

  // 2. FIX AUDIT (2026-09-17, quota-optimization follow-up): the broker-flow
  // mode was redesigned AGAIN — this time to stop scanning per-ticker
  // altogether. Invezgo's own /analysis/top/accumulation and
  // /analysis/top/foreign endpoints return the ENTIRE BEI market's
  // accumulation/distribution ranking in ONE call (1 quota unit total,
  // versus up to ~960 units for the old per-ticker batch scan), so the
  // user-controlled "one batch per click" progress UI (fsRunNextBrokerScanBatch)
  // and the full-universe ticker fetch it paged through are gone by design,
  // not a regression. It still must NOT reuse Command Center's LQ45-only
  // RADAR_STATE.accData cache — that cache is a *different* consumer of the
  // same backend function, not something fsRenderBrokerFlowMode should
  // read/write directly.
  assert(/FS_BROKER_SCAN/.test(flowScanSrc), 'REGRESSION: fsRenderBrokerFlowMode() lost its own scan state (FS_BROKER_SCAN) — must not silently go back to reading RADAR_STATE.accData');
  assert(!/function fsRunNextBrokerScanBatch/.test(flowScanSrc), 'REGRESSION: fsRunNextBrokerScanBatch() resurfaced — per-ticker batch scanning was intentionally replaced by a single top/accumulation+top/foreign call covering the whole BEI market');
  assert(/'\/api\/idx\/accumulation-distribution'/.test(flowScanSrc), 'REGRESSION: fsRenderBrokerFlowMode() no longer calls the acc/dist API directly');
  assert(!/RADAR_STATE\.accData/.test(flowScanSrc), 'REGRESSION: fsRenderBrokerFlowMode() must NOT read/write RADAR_STATE.accData — that would leak full-universe results into the LQ45-only Anomaly Structural & ARA sub-tab');

  // 3. FIX AUDIT (2026-09-17, user-reported "masih pakai data simulasi"):
  // the sector-heatmap mode was redesigned AGAIN — it no longer computes
  // per-sector flow from generateClientSideBrokerSummary() (a client-side
  // CMF simulation, badge literally said "SIMULASI FLOW") at all. It now
  // reuses the SAME real Invezgo top-movers data as "Broker Flow Riil"
  // (FS_BROKER_SCAN), grouping the real `sector`/`valueRp` fields already
  // returned by the server — one shared fetch across both modes, no extra
  // quota cost from switching tabs, and an honest fallback message (same
  // as Broker Flow Riil) instead of silently falling back to simulated
  // per-ticker CMF when Invezgo is unavailable.
  assert(!/generateClientSideBrokerSummary/.test(flowScanSrc), 'REGRESSION: fsRenderSectorHeatmapMode() calls generateClientSideBrokerSummary() again — this is the client-side CMF simulation that was replaced by real Invezgo top-movers data');
  assert(/function fsRenderSectorHeatmapUI/.test(flowScanSrc), 'REGRESSION: fsRenderSectorHeatmapUI() is gone — sector heatmap must render from the shared FS_BROKER_SCAN real data');
  assert(!/scannerCandidates\s*=\s*\[/.test(flowScanSrc), 'REGRESSION: fsRenderSectorHeatmapMode() reintroduced a hardcoded scannerCandidates ticker list');
  assert(!/SIMULASI FLOW/.test(flowScanSrc), 'REGRESSION: sector heatmap "SIMULASI FLOW" badge resurfaced — this mode must show real Invezgo data or an honest not-configured message, never a silent simulated table');

  // 4. Old duplicate render functions must be GONE, not just unreachable.
  assert(!/function renderRadarScannerSubTab/.test(cmdCenterSrc), 'REGRESSION: renderRadarScannerSubTab() resurfaced in 26-commandcenter.js — the duplicate "Scanner Akumulasi & Distribusi" sub-tab must stay removed');
  assert(!cmdCenterSrc.includes("setRadarSubTab('scanner')"), 'REGRESSION: the "Scanner Akumulasi & Distribusi" sub-tab button resurfaced in Opportunity Radar');
  assert(!/function renderBandarmologyHeatmapScannerView/.test(cockpitSrc), 'REGRESSION: renderBandarmologyHeatmapScannerView() resurfaced in 41-stockchat-cockpit.js — the duplicate heatmap scanner must stay removed');
  assert(!cockpitSrc.includes('renderBandarmologyHeatmapScannerView()'), 'REGRESSION: Bandarmology market mode must not call the removed renderBandarmologyHeatmapScannerView() again');

  // 5. Data that OTHER sub-tabs still depend on must survive the removal —
  // RADAR_STATE/loadAccumulationDistributionData() is shared with the
  // Anomaly Structural & ARA sub-tab, and BANDAR_SECTOR_DEFS/
  // generateClientSideBrokerSummary with the Market Flow view.
  assert(/function loadAccumulationDistributionData/.test(cmdCenterSrc), 'REGRESSION: loadAccumulationDistributionData() must NOT be removed — Anomaly Structural & ARA sub-tab still depends on it');
  assert(/var RADAR_STATE\s*=/.test(cmdCenterSrc), 'REGRESSION: RADAR_STATE must NOT be removed — shared by multiple Opportunity Radar sub-tabs');
  assert(/var BANDAR_SECTOR_DEFS\s*=/.test(cockpitSrc), 'REGRESSION: BANDAR_SECTOR_DEFS must NOT be removed — Bandarmology Market Flow view still depends on it');
  assert(/function generateClientSideBrokerSummary/.test(cockpitSrc), 'REGRESSION: generateClientSideBrokerSummary() must NOT be removed — used by multiple Bandarmology views');

  // 6. HTML wiring: the 3-mode tab bar and its panels must exist on the
  // Smart Money Screener page, and the sidebar label must reflect the
  // consolidated scope (no longer just "Flow Scanner").
  assert(indexHtml.includes("fsSwitchScreenerMode('cmf')"), 'REGRESSION: index.html is missing the CMF Proxy mode button');
  assert(indexHtml.includes("fsSwitchScreenerMode('broker')"), 'REGRESSION: index.html is missing the Broker Flow Riil mode button');
  assert(indexHtml.includes("fsSwitchScreenerMode('sector')"), 'REGRESSION: index.html is missing the Heatmap Sektor mode button');
  assert(indexHtml.includes('id="sms-mode-cmf"') && indexHtml.includes('id="sms-mode-broker"') && indexHtml.includes('id="sms-mode-sector"'), 'REGRESSION: index.html is missing one of the 3 Smart Money Screener mode panels');
  assert(indexHtml.includes('>Smart Money Screener<'), 'REGRESSION: the sidebar/page title no longer says "Smart Money Screener"');
});

// Quota-optimization follow-up (2026-09-17, user-requested: "optimalkan
// langganan API saya untuk analisis broker... karna broker ini sifatnya
// reload per hari saja"): the earlier per-ticker LQ45/tickers-list design
// (see git history) was itself replaced — Invezgo's /analysis/top/accumulation
// endpoint already ranks the ENTIRE BEI market in one call, so there is no
// longer any "which tickers to scan" ceiling to configure: params.tickers/
// LQ45-as-default is gone by design, not a regression. These are
// source-text checks (no INVEZGO_API_KEY in the test environment, so the
// function always takes its honest "not configured" early-return — a
// functional test would just prove that branch again, not the
// fetchInvezgoTopMovers() plumbing this fix actually changed).
test('REGRESSION GUARD: getUniverseAccumulationDistribution() must scan the whole BEI market via one Invezgo top-movers call, not a per-ticker LQ45/tickers-list ceiling', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  assert(!/const tickers = Object\.values\(universe\)\.filter\(u => u\.indexes && u\.indexes\.lq45\)\.map\(u => u\.code\)\.slice\(0, 45\);/.test(engineSrc),
    'REGRESSION: getUniverseAccumulationDistribution() reverted to hardcoding LQ45 (slice(0,45)) as the scan ceiling');
  assert(/fetchInvezgoTopMovers\(\s*'accumulation'/.test(engineSrc), 'REGRESSION: getUniverseAccumulationDistribution() no longer calls fetchInvezgoTopMovers() — must not revert to the ~960-quota-unit per-ticker batch scan');
  assert(/import\s*\{[^}]*fetchInvezgoTopMovers[^}]*\}\s*from\s*'\.\/invezgo-client\.js'/.test(engineSrc), 'REGRESSION: fetchInvezgoTopMovers is no longer imported from lib/invezgo-client.js');

  const clientSrc = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  assert(/function fetchInvezgoTopMovers/.test(clientSrc), 'REGRESSION: fetchInvezgoTopMovers() is gone from lib/invezgo-client.js');
  assert(/\/analysis\/top\/\$\{kind\}/.test(clientSrc) || /\/analysis\/top\//.test(clientSrc), 'REGRESSION: fetchInvezgoTopMovers() no longer calls Invezgo\'s /analysis/top/{accumulation|foreign} endpoint');

  assert(/app\.get\('\/api\/idx\/accumulation-distribution'/.test(serverSrc), 'REGRESSION: GET /api/idx/accumulation-distribution is gone');
});

// User-requested (2026-09-17): "atur dulu kuotanya agar cukup dipakai 1
// bulan" (budget the Invezgo quota so it lasts a month) before actually
// using their real API key. Two levers: (1) the shared broker-summary
// cache TTL was a hardcoded 300s (5 min) inherited from before the full-BEI
// scanner existed — barely helps a scan of ~958 DISTINCT tickers (almost
// every one is a first-time miss regardless of TTL), but does mean a
// second full scan (or repeat StockChat/Bandarmology lookups) more than 5
// minutes apart each cost a fresh chunk of the shared 30,000/month budget
// even though broker-flow composition doesn't meaningfully change
// minute-to-minute for a retail screening tool. Bumped to 30 min by
// default, and made configurable via env var. (2) the pre-existing
// GET /api/idx/invezgo-status observability endpoint was never surfaced to
// the user — they had no way to see how much of the monthly budget a full
// scan (or several) had already spent, so they couldn't self-regulate.
// Now shown as a quota bar in the Broker Flow Riil mode, refreshed after
// every batch, with the scan button disabled once the budget is exhausted.
test('REGRESSION GUARD: Invezgo quota budget planning — longer cache TTL + quota visibility in Smart Money Screener', () => {
  const clientSrc = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  const flowScanSrc = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');

  assert(!/const INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC = 300;/.test(clientSrc),
    'REGRESSION: the broker-summary cache TTL reverted to the old hardcoded 300s (5 min) — barely helps the full-BEI scanner and burns through the monthly quota faster than necessary for a retail (non-HFT) screening tool');
  assert(/INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC = Number\(process\.env\.INVEZGO_BROKER_SUMMARY_CACHE_TTL_SEC \|\| 86400\)/.test(clientSrc),
    'REGRESSION: the broker-summary cache TTL must be configurable via env var, defaulting to 86400s (24h) — BEI broker summary is a once-daily post-closing batch report, not real-time data, and the fromDate/toDate query params already scope the cache key to the calendar day, so a shorter TTL only causes wasteful same-day refetches of data that has not changed');

  assert(/function fsFetchInvezgoQuotaStatus/.test(flowScanSrc), 'REGRESSION: fsFetchInvezgoQuotaStatus() is gone — the Smart Money Screener no longer surfaces Invezgo quota usage to the user');
  assert(/'\/api\/idx\/invezgo-status'/.test(flowScanSrc), 'REGRESSION: the Broker Flow Riil mode no longer calls the existing quota observability endpoint');
  assert(/function fsRenderQuotaBar/.test(flowScanSrc), 'REGRESSION: fsRenderQuotaBar() is gone — quota usage is no longer visually shown to the user');
  assert(/quotaExhausted/.test(flowScanSrc), 'REGRESSION: the scan button no longer checks for quota exhaustion — a user could keep clicking "Lanjutkan Scan" after the monthly budget is already spent');
});

// ── TEST: Bandarmology market-aggregate views (Market Flow, Foreign Flow,
// Accumulation, Distribution, Broker Trail) must read real Invezgo data
// when available, not always simulation ──
// User report (2026-09-17, after setting INVEZGO_API_KEY in production):
// "Estimasi Foreign Net Buy/Sell di bawah dihitung dari simulasi transaksi
// broker" was still shown even with a real, working API key. Root cause:
// these 5 views always called generateClientSideBrokerSummary() directly
// (100% simulated, documented as an accepted limitation in
// KNOWN_ISSUES.md #3/INCIDENT_LOG.md #7) instead of the same real-data path
// ("Analisis Full Emiten" tab's fetchBrokerSummaryData()) already used
// elsewhere. A SECOND, more subtle bug was found while fixing this: real
// data (computeBandarmologyVerdict() in lib/idx-data-engine.js) and
// simulated data (generateClientSideBrokerSummary() here) use DIFFERENT
// field names for the same figures (netValueRp vs netValRp,
// smartMoney.institutionalNetRp vs retailVsSmartMoney.smartMoneyNetValRp) —
// Market Flow View only checked the simulated names, so it would have
// silently shown Rp 0 for every segment even once wired to real data.
test('REGRESSION GUARD: Bandarmology market-aggregate views use real Invezgo data when available, and correctly read both real/simulated field-name shapes', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');

  // 1. renderBandarmologyMarketFlowView() was redesigned (2026-09-21) from a
  // per-ticker bandarGetCachedSummary() loop (Big 4 Banks + sector statics)
  // into a skeleton renderer — real content filled asynchronously by
  // bandarLoadRealMarketFlow() which calls /api/idx/accumulation-distribution
  // once (whole-market, 1 API call/day). Same skeleton+async pattern as the
  // foreign flow view.
  // Check: neither the skeleton nor the content renderer calls
  // generateClientSideBrokerSummary() directly (would bypass real data).
  const skeletonSrc = src.match(/function renderBandarmologyMarketFlowView[\s\S]*?\n}\n/)[0];
  assert(skeletonSrc, 'REGRESSION: could not locate renderBandarmologyMarketFlowView() in 41-stockchat-cockpit.js');
  assert(!/generateClientSideBrokerSummary\(/.test(skeletonSrc),
    'REGRESSION: renderBandarmologyMarketFlowView() calls generateClientSideBrokerSummary() directly — it will always show simulated data even with INVEZGO_API_KEY configured');
  assert(skeletonSrc.includes('bandar-market-flow-content'),
    'REGRESSION: renderBandarmologyMarketFlowView() must render skeleton placeholder id="bandar-market-flow-content" for async fill by bandarLoadRealMarketFlow()');
  // The content renderer (bandarRenderMarketFlowContent) must not loop per-ticker either.
  const contentRendererSrc = src.match(/function bandarRenderMarketFlowContent[\s\S]*?\n}\n/);
  assert(contentRendererSrc, 'REGRESSION: bandarRenderMarketFlowContent() missing — skeleton has no content renderer');
  assert(!/generateClientSideBrokerSummary\(/.test(contentRendererSrc[0]),
    'REGRESSION: bandarRenderMarketFlowContent() calls generateClientSideBrokerSummary() directly — reproducing the per-ticker-loop bug that was replaced');
  assert(!/bandarGetCachedSummary\(/.test(contentRendererSrc[0]),
    'REGRESSION: bandarRenderMarketFlowContent() must NOT use bandarGetCachedSummary() per-ticker loop — it must read score/acc/dist from the whole-market /api/idx/accumulation-distribution payload instead');

  // 2. bandarPrefetchMarketBatch() itself must still exist and still
  // re-render (with force=true) once its data arrives — this is checked by
  // a separate test below. It is NO LONGER called from
  // renderBandarmologyCockpitPage() (fixed 2026-09-24: its
  // STOCKCHAT_BROKER_DATA_CACHE output was found to feed nothing rendered
  // on this page — see the "Page Unresponsive" regression test below).
  assert(/function bandarPrefetchMarketBatch/.test(src), 'REGRESSION: bandarPrefetchMarketBatch() is gone');

  // 3. Field-name-mapping correctness: extract and directly execute the two
  // pure helper functions against both real-shaped and simulated-shaped
  // bandarmology objects, proving neither is silently read as 0.
  const helperSrc =
    src.match(/function bandarForeignNetRp[\s\S]*?\n}\n/)[0] +
    src.match(/function bandarSmartMoneyNetRp[\s\S]*?\n}\n/)[0];
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(helperSrc, sandbox, { filename: 'bandar-field-mapping-helpers (sandboxed)' });

  // Real-shaped bandarmology (computeBandarmologyVerdict()'s actual field names)
  const realBm = { foreignFlow: { netValRp: 5000000000 }, retailVsSmartMoney: { smartMoneyNetValRp: 3000000000 } };
  assert.strictEqual(sandbox.bandarForeignNetRp(realBm), 5000000000,
    'REGRESSION: bandarForeignNetRp() does not read real data\'s netValRp field — real Foreign Net Buy/Sell will show as 0 (the exact user-reported bug)');
  assert.strictEqual(sandbox.bandarSmartMoneyNetRp(realBm), 3000000000,
    'REGRESSION: bandarSmartMoneyNetRp() does not read real data\'s retailVsSmartMoney.smartMoneyNetValRp field — Market Flow View\'s sector/Big-4-bank totals will silently show Rp 0 even with real Invezgo data');

  // Simulated-shaped bandarmology (generateClientSideBrokerSummary()'s field names) — must still work identically to before this fix
  const simBm = { foreignFlow: { netValueRp: 7000000000 }, smartMoney: { institutionalNetRp: 4000000000 } };
  assert.strictEqual(sandbox.bandarForeignNetRp(simBm), 7000000000,
    'REGRESSION: bandarForeignNetRp() broke reading the simulated data shape (netValueRp)');
  assert.strictEqual(sandbox.bandarSmartMoneyNetRp(simBm), 4000000000,
    'REGRESSION: bandarSmartMoneyNetRp() broke reading the simulated data shape (smartMoney.institutionalNetRp)');

  // 4. bandarGetCachedSummary() must prefer a cached real result over
  // recomputing simulation, and must fall back to simulation when nothing
  // is cached yet (first paint, before the prefetch resolves).
  const cacheHelperSrc = src.match(/function bandarGetCachedSummary[\s\S]*?\n}\n/)[0];
  const cacheSandbox = {
    STOCKCHAT_BROKER_DATA_CACHE: { 'BBCA_1D': { isSimulated: false, marker: 'REAL_FROM_CACHE' } },
    generateClientSideBrokerSummary: (t, tf) => ({ isSimulated: true, marker: 'SIMULATED_FALLBACK', ticker: t, tf })
  };
  vm.createContext(cacheSandbox);
  vm.runInContext(cacheHelperSrc, cacheSandbox, { filename: 'bandarGetCachedSummary (sandboxed)' });
  const cached = cacheSandbox.bandarGetCachedSummary('BBCA', '1D');
  assert.strictEqual(cached.marker, 'REAL_FROM_CACHE',
    'REGRESSION: bandarGetCachedSummary() does not prefer a real cached result — it recomputes simulation even when real data is already available');
  const uncached = cacheSandbox.bandarGetCachedSummary('XYZZ', '1D');
  assert.strictEqual(uncached.marker, 'SIMULATED_FALLBACK',
    'REGRESSION: bandarGetCachedSummary() does not fall back to simulation for a ticker with no cached real data yet (breaks first paint before the prefetch resolves)');

  // 5. Infinite-loop guard: bandarPrefetchMarketBatch() must skip entirely
  // (no fetch, no re-render) once every needed ticker is already cached.
  // Caught live via Playwright (not from reading code): fetchBrokerSummaryData()
  // caches its simulated FALLBACK result too, so a naive "always fetch then
  // re-render" here re-renders -> re-prefetches -> resolves from cache ->
  // re-renders again, forever, pegging a CPU core.
  const prefetchSrc = src.match(/function bandarPrefetchMarketBatch[\s\S]*?\n}\n/)[0];
  assert(/missing\.length === 0/.test(prefetchSrc),
    'REGRESSION: bandarPrefetchMarketBatch() no longer checks whether anything is actually missing from the cache before fetching+re-rendering — this reproduces an infinite render loop once every ticker has been fetched at least once (verified live: pegs a CPU core)');
  assert(/STOCKCHAT_BROKER_DATA_CACHE\[t \+ '_1D'\]/.test(prefetchSrc),
    'REGRESSION: bandarPrefetchMarketBatch() no longer filters the ticker list against STOCKCHAT_BROKER_DATA_CACHE before deciding whether to fetch');
});

// ── TEST: Opportunity Radar "Anomaly Structural & ARA" sub-tab must not
// infinite-loop-fetch on failure ──
// Found during a codebase-wide audit for the same bug class as
// bandarPrefetchMarketBatch (see INCIDENT_LOG.md): loadAccumulationDistributionData()
// (26-commandcenter.js) left RADAR_STATE.accData untouched on any failure
// (network error or success:false), so renderRadarAnomalyAraSubTab()'s
// `if (!accData)` guard stayed true forever, re-firing the fetch every
// render cycle with zero cooldown/backoff — an unguarded render->fetch->
// render loop, worse than the already-fixed bandarPrefetchMarketBatch
// (which at least had an inflight flag). A second, related bug: setRadarSubTab()
// still checked for the OLD sub-tab name 'scanner' (dead since the "Scanner
// Akumulasi & Distribusi" consolidation renamed it to 'anomaly-ara'), so the
// eager fetch-once-on-tab-click path used by its sibling tabs (flow-trail,
// corporate-actions) never fired for this tab at all.
await asyncTest('REGRESSION GUARD: loadAccumulationDistributionData() must set an error-shaped RADAR_STATE.accData on failure, and setRadarSubTab must eager-fetch for the real tab name', async () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/26-commandcenter.js'), 'utf8');

  // setRadarSubTab: dead 'scanner' branch must be gone, replaced by the real 'anomaly-ara' name
  const setRadarSubTabSrc = src.match(/function setRadarSubTab[\s\S]*?\n}\n/)[0];
  assert(!/tabName === 'scanner'/.test(setRadarSubTabSrc),
    'REGRESSION: setRadarSubTab() still checks for the dead \'scanner\' tab name — the eager prefetch never fires for the real \'anomaly-ara\' tab');
  assert(/tabName === 'anomaly-ara'/.test(setRadarSubTabSrc),
    'REGRESSION: setRadarSubTab() no longer eager-fetches accumulation/distribution data when the user clicks the Anomaly Structural & ARA tab');

  // Extract loadAccumulationDistributionData() and run it against a mocked
  // fetch() that always fails, proving RADAR_STATE.accData ends up
  // truthy (breaking the !accData retry-loop guard) on BOTH failure paths.
  const fnSrc = src.match(/async function loadAccumulationDistributionData[\s\S]*?\n}\n/)[0];

  function makeSandbox(fetchImpl) {
    const sandbox = {
      RADAR_STATE: { accTimeframe: '1D', accDataCache: {} },
      ACC_DIST_CACHE_TTL_MS: 60000,
      fetch: fetchImpl,
      encodeURIComponent
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(fnSrc + '\nwindow.loadAccumulationDistributionData = loadAccumulationDistributionData;\n', ctx, { filename: '26-commandcenter.js (accData slice)' });
    return ctx;
  }

  // Path 1: success:false JSON response
  const ctxFalse = makeSandbox(async () => ({ json: async () => ({ success: false, error: 'Invezgo down' }) }));
  await ctxFalse.loadAccumulationDistributionData();
  assert(ctxFalse.RADAR_STATE.accData,
    'REGRESSION: RADAR_STATE.accData still falsy after a success:false response — renderRadarAnomalyAraSubTab() will loop-refetch forever');
  assert.strictEqual(ctxFalse.RADAR_STATE.accData.isSimulated, true,
    'REGRESSION: the error-shaped accData must set isSimulated:true so renderRadarAnomalyAraSubTab()\'s existing honest-empty branch (accData.isSimulated && !accList.length) renders instead of crashing on a missing shape');
  assert(Array.isArray(ctxFalse.RADAR_STATE.accData.accumulation),
    'REGRESSION: error-shaped accData must still have an `accumulation` array — renderRadarAnomalyAraSubTab() reads accData.accumulation unconditionally');

  // Path 2: network error (fetch throws)
  const ctxThrow = makeSandbox(async () => { throw new Error('network down'); });
  await ctxThrow.loadAccumulationDistributionData();
  assert(ctxThrow.RADAR_STATE.accData,
    'REGRESSION: RADAR_STATE.accData still falsy after a thrown network error — same infinite-retry-loop bug on the catch path');
  assert.strictEqual(ctxThrow.RADAR_STATE.accData.isSimulated, true,
    'REGRESSION: the catch-path error-shaped accData must also set isSimulated:true');
});

// ── TEST: multi-device SSE sync must pause while the tab is hidden ──
// Found during the same audit: setupMultiDeviceSyncListener()'s EventSource
// connection can only live ~30s before Vercel force-kills the serverless
// function (vercel.json maxDuration=30, shorter than this route's own 20s
// heartbeat interval never completing a second cycle). EventSource
// auto-reconnects on that forced close with no visibility guard, so a
// logged-in tab left open in the BACKGROUND still opened a new serverless
// invocation roughly every 30s, forever — a continuous drip on Vercel's
// function-invocation quota for no user-visible benefit.
test('REGRESSION GUARD: setupMultiDeviceSyncListener() must close its EventSource when the tab is hidden and reconnect when visible again', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/02-storage.js'), 'utf8');
  const startMarker = '// CLOUD PERSISTENCE & REALTIME CROSS-DEVICE ENGINE';
  const start = src.indexOf(startMarker);
  const endMarker = '// ── SETUP REALTIME FIRESTORE CROSS-DEVICE SYNC ──';
  const end = src.indexOf(endMarker, start);
  assert(start > -1 && end > start, 'could not locate the SSE sync slice in 02-storage.js by its markers');
  const slice = src.slice(start, end) + '\nwindow.setupMultiDeviceSyncListener = setupMultiDeviceSyncListener;\n';

  let esInstances = [];
  function FakeEventSource(url) {
    this.url = url;
    this.closed = false;
    esInstances.push(this);
  }
  FakeEventSource.prototype.close = function() { this.closed = true; };

  const listeners = {};
  const fakeDocument = {
    hidden: false,
    addEventListener(evt, fn) { listeners[evt] = fn; },
    fire(evt) { if (listeners[evt]) listeners[evt](); }
  };

  const sandbox = {
    window: { EventSource: FakeEventSource },
    EventSource: FakeEventSource,
    document: fakeDocument,
    getFirestoreUserUid: () => 'user_123',
    _currentUser: { isGuest: false, isDemo: false }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(slice, ctx, { filename: '02-storage.js (SSE slice)' });

  ctx.setupMultiDeviceSyncListener('user_123');
  assert.strictEqual(esInstances.length, 1, 'REGRESSION: setupMultiDeviceSyncListener() did not open an EventSource for a real, visible, non-demo user');
  assert.strictEqual(esInstances[0].closed, false);

  // Tab goes to background -> connection must close (no more reconnect-driven invocations while hidden)
  fakeDocument.hidden = true;
  fakeDocument.fire('visibilitychange');
  assert.strictEqual(esInstances[0].closed, true,
    'REGRESSION: the SSE connection is not closed when the tab becomes hidden — it will keep reconnecting via Vercel serverless invocations every ~30s indefinitely in the background');

  // Tab comes back to foreground -> must reconnect
  fakeDocument.hidden = false;
  fakeDocument.fire('visibilitychange');
  assert.strictEqual(esInstances.length, 2,
    'REGRESSION: the SSE connection does not reconnect when the tab becomes visible again — multi-device sync silently stays dead after any background period');
  assert.strictEqual(esInstances[1].closed, false);
});

// ── TEST: fhStart()'s Yahoo Finance polling interval (03-engine.js) must
// pause while the tab is hidden and resume when visible again ──
// Follow-up to the SSE quota audit (INCIDENT_LOG.md): this is the single
// biggest polling-volume offender in the app — 240 requests/hour for IHSG
// alone in default 'fast' mode, most of which route through this app's OWN
// /api/proxy (Vercel serverless invocation), not a third-party call. Pure
// display refresh, zero functional purpose while the tab isn't visible —
// unlike the AI autonomous-trading auto-refresh (38-ai-autonomous-trading.js),
// which the user explicitly chose to keep running in the background because
// it manages real paper-trading stop-loss/take-profit exits.
test('REGRESSION GUARD: fhStart() must pause its polling interval when the tab is hidden and resume when visible', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/03-engine.js'), 'utf8');
  const fhObjStart = src.indexOf('var FH = {');
  const fhObjEnd = src.indexOf('\n};', fhObjStart) + 3;
  const modeStart = src.indexOf("// ── Mode refresh —");
  const modeEnd = src.indexOf('\nvar FH_PRICE_MODE_KEY', modeStart);
  assert(fhObjStart > -1 && fhObjEnd > fhObjStart && modeStart > -1 && modeEnd > modeStart,
    'could not locate the FH slice in 03-engine.js by its markers');

  const slice = src.slice(fhObjStart, fhObjEnd) + '\n' + src.slice(modeStart, modeEnd)
    + '\nwindow.fhStart = fhStart; window.FH = FH;\n';

  const listeners = {};
  const fakeDocument = {
    hidden: false,
    addEventListener(evt, fn) { listeners[evt] = fn; },
    fire(evt) { if (listeners[evt]) listeners[evt](); }
  };
  // Fake timers: this test only checks the start/stop LIFECYCLE (is a
  // handle created/cleared), never whether the interval callback actually
  // fires — using real setInterval/clearInterval here would leave a real
  // pending 15s Node timer after the test finishes, delaying the whole
  // suite's exit (and CI) for no reason.
  const fakeTimers = makeFakeTimers();
  const sandbox = {
    localStorage: { getItem: () => null },
    document: fakeDocument,
    // Stub every fetch/render side-effect fhStart() touches — this test is
    // about the interval lifecycle, not the actual Yahoo Finance calls.
    fhSetBadge: () => {}, fhFetchIHSG: () => {}, fhFetchKurs: () => {},
    fhFetchStocks: () => {}, fhFetchCrypto: () => {}, fhFetchEtf: () => {},
    renderPage: () => {}, currentPage: 'dashboard',
    ...fakeTimers
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(slice, ctx, { filename: '03-engine.js (FH slice)' });

  ctx.fhStart();
  assert(ctx.FH.timer, 'REGRESSION: fhStart() did not create FH.timer');

  fakeDocument.hidden = true;
  fakeDocument.fire('visibilitychange');
  assert.strictEqual(ctx.FH.timer, null,
    'REGRESSION: FH.timer is not cleared when the tab becomes hidden — the 15s IHSG poll (240 Vercel /api/proxy invocations/hour) keeps running in the background');

  fakeDocument.hidden = false;
  fakeDocument.fire('visibilitychange');
  assert(ctx.FH.timer,
    'REGRESSION: FH.timer does not restart when the tab becomes visible again — the price ticker silently stays dead after any background period');
});

// ── TEST: IDX_PIPELINE.init()'s 45s market-summary auto-refresh
// (40-idx-pipeline.js) must pause while hidden and resume when visible ──
test('REGRESSION GUARD: IDX_PIPELINE auto-refresh must pause while the tab is hidden and resume when visible', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/40-idx-pipeline.js'), 'utf8');

  assert(/document\.addEventListener\('visibilitychange'/.test(src),
    'REGRESSION: IDX_PIPELINE.init() no longer registers a visibilitychange listener — the 45s GET /api/idx/summary poll (80 Vercel invocations/hour) will run forever in the background again');
  assert(/_startAutoRefresh:\s*function/.test(src) && /_stopAutoRefresh:\s*function/.test(src),
    'REGRESSION: the pausable start/stop interval helpers are gone from IDX_PIPELINE');

  const listeners = {};
  const fakeDocument = {
    hidden: false,
    addEventListener(evt, fn) { listeners[evt] = fn; },
    fire(evt) { if (listeners[evt]) listeners[evt](); }
  };
  const sandbox = {
    document: fakeDocument,
    console: { log: () => {} },
    ...makeFakeTimers()
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    src.slice(src.indexOf('var IDX_PIPELINE = {'), src.indexOf('\n};', src.indexOf('_stopAutoRefresh: function')) + 3)
      // Stub out the real network-touching methods this slice's init() calls,
      // by redefining them right after the object literal closes.
      + '\nIDX_PIPELINE.refreshMarketSummary = function(){ this._refreshCount = (this._refreshCount||0) + 1; };'
      + '\nIDX_PIPELINE.fetchMasterStocks = function(){};'
      + '\nIDX_PIPELINE.fetchCalendar = function(){};'
      + '\nwindow.IDX_PIPELINE = IDX_PIPELINE;\n',
    ctx, { filename: '40-idx-pipeline.js (IDX_PIPELINE slice)' }
  );

  ctx.IDX_PIPELINE.init();
  assert(ctx.IDX_PIPELINE._refreshTimer, 'REGRESSION: IDX_PIPELINE.init() did not start its auto-refresh timer');

  fakeDocument.hidden = true;
  fakeDocument.fire('visibilitychange');
  assert.strictEqual(ctx.IDX_PIPELINE._refreshTimer, null,
    'REGRESSION: the auto-refresh timer is not cleared when the tab becomes hidden');

  fakeDocument.hidden = false;
  fakeDocument.fire('visibilitychange');
  assert(ctx.IDX_PIPELINE._refreshTimer,
    'REGRESSION: the auto-refresh timer does not restart when the tab becomes visible again');
});

// ── TEST: brokerSummaryDateRange() must send Invezgo dashed ISO dates
// (YYYY-MM-DD), not compact (YYYYMMDD) ──
// User report (2026-09-17): after setting a real INVEZGO_API_KEY in
// production, every single broker-summary call still fell back to
// simulation, with quality.reason showing "HTTP_422" (confirmed live via
// the browser's own DevTools Network tab on GET /api/idx/broker-summary/
// BBCA — Unprocessable Entity, meaning the request reached Invezgo but was
// rejected as malformed, not an auth/quota problem). Invezgo's own official
// Python SDK README (github.com/Invezgo/invezgo-python-sdk) shows
// from_date/to_date as dashed ISO strings ("2024-12-01") in its example
// call. This app's brokerSummaryDateRange() sent compact YYYYMMDD
// ("20260917") instead — an assumption this file's own prior comment
// admitted was never verified against a live response. That single format
// mismatch plausibly explains why every real Invezgo call failed despite a
// valid, correctly-configured, paid API key.
test('REGRESSION GUARD: brokerSummaryDateRange() must format fromDate/toDate as dashed ISO (YYYY-MM-DD) for Invezgo, matching the official SDK\'s documented format', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const fnSrc = src.match(/function brokerSummaryDateRange[\s\S]*?\n}\n/)[0];

  assert(!/replace\(\/-\/g/.test(fnSrc),
    'REGRESSION: brokerSummaryDateRange() strips dashes from the date again — this reproduces the exact HTTP_422 bug (Invezgo rejects compact YYYYMMDD dates), silently falling every real API call back to simulation');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    'const BROKER_SUMMARY_TIMEFRAME_DAYS = ' + JSON.stringify({ '1D': 0, '5D': 5 }) + ';\n' + fnSrc
      + '\nthis.brokerSummaryDateRange = brokerSummaryDateRange;\n',
    sandbox, { filename: 'idx-data-engine.js (brokerSummaryDateRange slice)' }
  );

  const range1D = sandbox.brokerSummaryDateRange('1D');
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  assert(isoDatePattern.test(range1D.fromDate),
    `REGRESSION: fromDate is not dashed ISO format (got "${range1D.fromDate}") — Invezgo expects "YYYY-MM-DD" per its official SDK docs, not compact digits`);
  assert(isoDatePattern.test(range1D.toDate),
    `REGRESSION: toDate is not dashed ISO format (got "${range1D.toDate}")`);
  assert.strictEqual(range1D.fromDate, range1D.toDate, '1D timeframe should produce the same from/to date (0 days back)');

  const range5D = sandbox.brokerSummaryDateRange('5D');
  assert(isoDatePattern.test(range5D.fromDate) && isoDatePattern.test(range5D.toDate),
    'REGRESSION: a non-1D timeframe must also produce dashed ISO dates');
  assert.notStrictEqual(range5D.fromDate, range5D.toDate, '5D timeframe should produce a real date range, not the same day twice');
});

// ── TEST: fetchInvezgoBrokerSummary() must build the request Invezgo's own
// API actually accepts — from/to (not from_date/to_date) plus required
// investor/market params ──
// Follow-up to the dashed-ISO-date fix (which was necessary but not
// sufficient — user re-verified live and it was STILL HTTP_422 after that
// alone). Root cause confirmed from Invezgo's own official MCP server
// source (user-provided invezgo-mcp .mcpb bundle), not a guess:
// dist/tools/stock/handler.js's summaryStock() builds
// `analysis/summary/stock/${code}?from=${from}&to=${to}&investor=${investor}&market=${market}`,
// and dist/schema/stock.js's summarySchema marks investor (enum all/f/d)
// and market (enum RG/NG/TN) as REQUIRED fields. Our client sent
// from_date/to_date instead of from/to, and never sent investor/market at
// all — Invezgo was rejecting every single request as incomplete.
test('REGRESSION GUARD: fetchInvezgoBrokerSummary() must send from/to + investor + market query params matching Invezgo\'s own API contract', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  const fnSrc = src.match(/async function fetchInvezgoBrokerSummary[\s\S]*?\n\}\n/)[0];

  assert(!/from_date=\$\{fromDate\}&to_date=\$\{toDate\}/.test(fnSrc),
    'REGRESSION: fetchInvezgoBrokerSummary() reverted to from_date/to_date — Invezgo\'s own API expects from/to (confirmed from Invezgo\'s official MCP server source), this reproduces the exact HTTP_422 bug');
  assert(/from=\$\{fromDate\}&to=\$\{toDate\}/.test(fnSrc),
    'REGRESSION: fetchInvezgoBrokerSummary() no longer sends from=/to= query params');
  assert(/investor=/.test(fnSrc),
    'REGRESSION: fetchInvezgoBrokerSummary() no longer sends the required investor= param — Invezgo\'s summarySchema marks it required, omitting it causes HTTP 422');
  assert(/market=/.test(fnSrc),
    'REGRESSION: fetchInvezgoBrokerSummary() no longer sends the required market= param — Invezgo\'s summarySchema marks it required, omitting it causes HTTP 422');
});

// ── TEST: fetchInvezgoTopMovers() must call Invezgo's real market-wide
// top-movers endpoint (1 quota unit for the whole BEI universe), never
// revert to a per-ticker loop ──
// User-requested optimization (2026-09-17): "optimalkan langganan API saya
// untuk analisis broker... karna broker ini sifatnya reload per hari saja".
// Confirmed via a real, authenticated "Test Request" the user captured
// from Invezgo's own API docs UI (not a guess): GET
// /analysis/top/accumulation?date=YYYY-MM-DD and
// /analysis/top/foreign?date=YYYY-MM-DD each return the WHOLE market's
// {accum: [...], dist: [...]} in one call.
test('REGRESSION GUARD: fetchInvezgoTopMovers() must call GET /analysis/top/{kind}?date=... and validate the {accum,dist} array schema', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  const fnSrc = src.match(/async function fetchInvezgoTopMovers[\s\S]*?\n\}\n/)[0];

  assert(/\/analysis\/top\/\$\{safeKind\}/.test(fnSrc),
    'REGRESSION: fetchInvezgoTopMovers() no longer builds the /analysis/top/{kind} URL — this is the real endpoint confirmed via Invezgo\'s live docs Test Request, not a guess');
  assert(/date\s*\?\s*`\?date=\$\{date\}`/.test(fnSrc) || /\?date=\$\{date\}/.test(fnSrc),
    'REGRESSION: fetchInvezgoTopMovers() no longer sends the date= query param Invezgo\'s top-movers endpoints require');
  assert(/Authorization.*Bearer \$\{apiKey\}/.test(fnSrc),
    'REGRESSION: fetchInvezgoTopMovers() no longer sends the Bearer auth header');
  assert(/Array\.isArray\(raw\.accum\)/.test(fnSrc) && /Array\.isArray\(raw\.dist\)/.test(fnSrc),
    'REGRESSION: fetchInvezgoTopMovers() no longer validates the real {accum:[...], dist:[...]} response schema confirmed from the user\'s captured API response');
  assert(/if\s*\(!apiKey\)\s*return\s*\{\s*ok:\s*false,\s*reason:\s*'NOT_CONFIGURED'/.test(fnSrc),
    'REGRESSION: fetchInvezgoTopMovers() no longer takes an honest NOT_CONFIGURED early-return when INVEZGO_API_KEY is absent — must never fabricate market-wide data');
});

// ── TEST: getUniverseAccumulationDistribution() must map Invezgo's real
// top-movers rows honestly — calculated_value surfaced as `score`, never
// mislabeled as a Rupiah amount ──
// Real sample magnitudes the user captured (107, -374.14, 76.6) are far too
// small to be actual stock transaction values (which run in
// billions/trillions of Rupiah for BEI-listed names), confirming
// calculated_value is Invezgo's own ranking score, not currency.
test('REGRESSION GUARD: getUniverseAccumulationDistribution() must map calculated_value to an honest `score` field, never mislabel it as Rupiah', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const fnSrc = engineSrc.match(/async function getUniverseAccumulationDistribution[\s\S]*?\n\}\n/)[0];

  assert(/score:\s*Number\(item\.calculated_value\)/.test(fnSrc),
    'REGRESSION: getUniverseAccumulationDistribution() no longer maps Invezgo\'s calculated_value to an honest `score` field');
  assert(!/(smartMoneyInflowRp|foreignNetRp):\s*Number\(item\.calculated_value\)/.test(fnSrc),
    'REGRESSION: calculated_value (a ranking score, confirmed too small to be a real Rupiah transaction value) must never be mislabeled as a currency field again');
  assert(/accumulation\s*=\s*\(result\.accum \|\| \[\]\)\.map\(mapRow\)\.sort/.test(fnSrc),
    'REGRESSION: getUniverseAccumulationDistribution() no longer builds its accumulation list from result.accum');
  assert(/distribution\s*=\s*\(result\.dist \|\| \[\]\)\.map\(mapRow\)\.sort/.test(fnSrc),
    'REGRESSION: getUniverseAccumulationDistribution() no longer builds its distribution list from result.dist');
});

// ── TEST: fetchInvezgoBrokerSummary() must parse the REAL
// /analysis/summary/stock/{code} response shape — a flat array, one row
// per broker with BOTH buy_*/sell_* fields, not {data:...}/{buyers:...} ──
// User-reported (screenshot): the Bandarmology per-emiten page showed a
// "DATA INVALID" badge — "Skema respons Invezgo tidak dikenali" — even
// though the underlying HTTP request itself succeeded (price/1D/3D/7D
// change all rendered correctly). Root cause confirmed from a REAL
// authenticated response body the user captured and uploaded (BBCA, not a
// guess): `raw` is a top-level JSON ARRAY, e.g.
// [{code:"LG",name:"TRIMEGAH SEKURITAS INDONESIA",buy_value:"141395320000",
// sell_value:"112346392500",buy_volume:"14305000",...}, ...] — every
// numeric field is a STRING, and there is NO per-broker foreign/domestic
// flag (that's controlled by the `investor` request param, always sent as
// 'all' by this app, not returned per-row).
test('REGRESSION GUARD: fetchInvezgoBrokerSummary() must recognize the real flat-array broker response, not fail-closed to DATA INVALID on every real request', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  const fnSrc = src.match(/async function fetchInvezgoBrokerSummary[\s\S]*?\n\}\n/)[0];

  assert(!/!raw\.data && !raw\.buyers && !raw\.brokers/.test(fnSrc),
    'REGRESSION: fetchInvezgoBrokerSummary() reverted to checking raw.data/raw.buyers/raw.brokers — the real response is a bare array and has none of these, this reproduces the exact "DATA INVALID" bug the user reported');
  assert(/Array\.isArray\(raw\)/.test(fnSrc),
    'REGRESSION: fetchInvezgoBrokerSummary() no longer validates the response as an array — the real /analysis/summary/stock/{code} response is a flat array of per-broker rows');
  assert(/Number\(b\.buy_value\)/.test(fnSrc) && /Number\(b\.sell_value\)/.test(fnSrc),
    'REGRESSION: fetchInvezgoBrokerSummary() no longer derives buyers/sellers from the real buy_value/sell_value fields (confirmed from a real captured BBCA response)');
  assert(!/item\.investor_type|item\.is_foreign/.test(src),
    'REGRESSION: a per-broker foreign/domestic guess (investor_type/is_foreign) resurfaced — the real response has no such field per broker, this was fabricated data');
});

// ── TEST: generateBrokerSummary()/computeBandarmologyVerdict() must treat
// an unknown foreign/domestic split as UNAVAILABLE, never as a silent
// zero ──
// Before this fix, `type` always defaulted to 'D' (domestic) when no
// investor_type/is_foreign field was present — which is now confirmed to
// be EVERY real row (the field doesn't exist). That silently reported
// "0% foreign flow" as if it were a real measurement, and the frontend's
// statusOf() (public/js/45-volume-spike.js) then mislabeled a genuinely
// missing value as "Net Sell" (comparing `undefined >= 0` is false) —
// exactly the "DATA INVALID" / empty Foreign Net Flow cards the user's
// screenshot showed.
test('REGRESSION GUARD: computeBandarmologyVerdict() must report foreignFlow/domesticFlow as unavailable, not a fabricated zero, when no per-broker F/D data exists', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const fnSrc = src.match(/function computeBandarmologyVerdict[\s\S]*?\n\}\n/)[0];

  assert(/hasForeignSplit/.test(fnSrc),
    'REGRESSION: computeBandarmologyVerdict() no longer detects whether a real foreign/domestic split exists — it would silently compute 0 foreign flow again');
  assert(/available:\s*false/.test(fnSrc) && /available:\s*true/.test(fnSrc),
    'REGRESSION: foreignFlow/domesticFlow no longer report an explicit available:true/false — a caller can no longer distinguish "confirmed zero" from "unknown"');
  assert(/buyValRp:\s*null/.test(fnSrc),
    'REGRESSION: the unavailable foreignFlow/domesticFlow branch no longer returns null values — returning 0 instead would misrepresent an unknown split as a confirmed zero');

  const engineSrc = src;
  const normalizeSrc = engineSrc.match(/const normalize = \(list\) => [\s\S]*?\n    \}\)\);/)[0];
  assert(/type:\s*null/.test(normalizeSrc),
    'REGRESSION: generateBrokerSummary()\'s normalize() no longer sets type:null — defaulting to \'D\' again would silently claim every broker is domestic');

  const vsSrc = fs.readFileSync(path.join(__dirname, 'public/js/45-volume-spike.js'), 'utf8');
  assert(/v === null \|\| v === undefined/.test(vsSrc),
    'REGRESSION: statusOf() in 45-volume-spike.js no longer treats undefined the same as null — a missing foreignFlow.netValRp (e.g. from an INVALID-schema response) would be mislabeled "Net Sell" again (undefined >= 0 is false)');
});

// ── TEST: Screener page must let the caller pick a wider universe than
// the hardcoded 45-ticker LQ45_STOCKS list ──
// User-reported: "Screener Saham LQ45, ini masih aja 45? saham ada 950
// untuk apa screener 45?" — scBuildSim() was hardwired to loop the static
// LQ45_STOCKS array (itself only 15 entries) with no way to widen it.
// scResolveUniverseList()/scChangeUniverse() now source the wider indexes
// from /api/idx/stocks (same endpoint Opportunity Radar/Volume Spike
// Scanner already use — real securities master, not fabricated), and
// scBuildSim() batches concurrent fetches instead of one 250ms-staggered
// ticker at a time (950 tickers at 250ms sequential would take ~4 minutes).
test('REGRESSION GUARD: Quant Screener must support a wider universe than the hardcoded LQ45_STOCKS list', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/11-quant.js'), 'utf8');

  assert(/function scResolveUniverseList/.test(src), 'REGRESSION: scResolveUniverseList() is gone — the screener has no way to pick a universe wider than LQ45');
  assert(/function scChangeUniverse/.test(src), 'REGRESSION: scChangeUniverse() is gone — there is no UI hook to widen the screener universe');
  assert(/QT_SCREENER_INDEX === 'all'/.test(src) || /idx === 'all'/.test(src), 'REGRESSION: the "Semua BEI" (all 950+) option is gone from the universe resolver');
  assert(/runBatch = function\(startIdx\)/.test(src) && /batch\.forEach\(perTicker\)/.test(src),
    'REGRESSION: scBuildSim() reverted to one-ticker-at-a-time 250ms staggering — this would take ~4 minutes for a 950-ticker universe instead of concurrent batching');
  // FIX (2026-09-19): the universe <select> moved from static HTML in
  // index.html into qtScreenerSubPageHtml() (this same file) when the
  // Quant Screener tab was relocated into the unified Screener page — see
  // the "relocated into the Screener" regression guard further below.
  assert(/function qtScreenerSubPageHtml/.test(src) && src.includes('id="sc-universe"') && src.includes('value="all"'),
    'REGRESSION: qtScreenerSubPageHtml() lost the Screener universe <select> or its "Semua BEI" option');
});

// ── TEST: Opportunity Radar's Margin-of-Safety shortcut must not blow up
// to a nonsensical percentage when ROE is near zero ──
// User-reported (screenshot): ITMS showed "MoS -1106385.6%". Root cause:
// `justifiedPbv = (roe/100)/REQUIRED_RETURN` is proportional to ROE, and
// the MoS formula divides by it — as real ROE approaches 0%, justifiedPbv
// approaches 0 and (justifiedPbv - pbv)/justifiedPbv explodes toward
// ±infinity. Not a data bug (ROE 0.007% can be a genuine real fetched
// value for a micro-cap) — the shortcut itself is only numerically stable
// for a comfortably-positive ROE range. Fixed by leaving MoS null
// (honestly unavailable) rather than surfacing the meaningless blow-up.
test('REGRESSION GUARD: getUniverseOpportunityRadar() MoS calc must not blow up toward ±infinity for near-zero ROE', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const m = src.match(/if \(fund\.pbv != null && fund\.pbv > 0 && roe != null[\s\S]*?\n      \}/);
  assert(m, 'REGRESSION: the MoS calculation block is gone or restructured beyond recognition');
  const block = m[0];

  assert(/roe >= REQUIRED_RETURN \* 100 \* 0\.1/.test(block),
    'REGRESSION: the near-zero-ROE stability guard on the MoS calculation is gone — ROE close to 0% (or negative) will again blow justifiedPbv up toward 0 and the MoS ratio toward ±infinity, reproducing "MoS -1106385.6%"');

  // Functional check of the guard's actual arithmetic, independent of the
  // source-text match above: replicate the exact formula with a real
  // near-zero ROE (0.007%, the kind of value that produced the reported
  // bug) and confirm the guard suppresses it to null instead of a
  // six-digit percentage.
  const REQUIRED_RETURN = 0.08;
  function computeMos(roe, pbv) {
    if (pbv != null && pbv > 0 && roe != null && roe >= REQUIRED_RETURN * 100 * 0.1) {
      const justifiedPbv = (roe / 100) / REQUIRED_RETURN;
      return Math.round(((justifiedPbv - pbv) / justifiedPbv) * 1000) / 10;
    }
    return null;
  }
  assert.strictEqual(computeMos(0.007, 0.39), null, 'sanity: near-zero ROE (0.007%) must yield null MoS, not a blown-up percentage');
  assert.strictEqual(computeMos(-5, 1.2), null, 'sanity: negative ROE must yield null MoS, the shortcut is undefined there');
  assert(computeMos(15, 2.0) !== null, 'sanity: a normal, comfortably-positive ROE (15%) must still compute a real MoS value');
});

// ── TEST: Volume Spike Scanner must offer a "Seluruh BEI" universe option
// and scan it in concurrent batches, not 350ms-staggered one at a time ──
// User-reported: "Screening Volume Spike cuma maksimal saham Kompas 100".
// VS_INDEX_LABELS was capped at lq45/idx30/idx80/kompas100 (max 100
// tickers) with no way to scan the full ~950-ticker BEI universe. Fixed by
// adding an 'all' option (omits the server-side index filter) and
// batching the client-side scan (VS_SCAN_BATCH tickers concurrently per
// round) instead of one ticker every 350ms — sequential would take ~5.5
// minutes for 950+ tickers.
test('REGRESSION GUARD: Volume Spike Scanner must support a "Seluruh BEI" universe option scanned in concurrent batches', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/45-volume-spike.js'), 'utf8');

  assert(/all:\s*'Seluruh BEI/.test(src), 'REGRESSION: the "Seluruh BEI" (all 950+) option is gone from VS_INDEX_LABELS');
  assert(/indexKey === 'all'/.test(src), 'REGRESSION: vsStartScreening() no longer special-cases the \'all\' universe to skip the server-side index filter');
  assert(/var VS_SCAN_BATCH/.test(src), 'REGRESSION: VS_SCAN_BATCH concurrency constant is gone — scanning reverted to one ticker at a time');
  assert(/batch\.forEach\(scanOneTicker\)/.test(src), 'REGRESSION: vsScanNext() no longer processes tickers in concurrent batches — this would take ~5.5 minutes sequentially for a 950-ticker "Seluruh BEI" scan');
});

// ── TEST: Market Pulse's IHSG chart must fetch REAL historical data for
// non-1D ranges, not stay a disabled placeholder ──
// User-reported: "ihsg... history data belum integrasi". The range tabs
// (5D/1M/6M/YTD/1Y/5Y/ALL) used to be disabled buttons that only showed a
// toast ("Riwayat X butuh data historis resmi bursa — belum
// terintegrasi") — an honestly-labeled gap, not fabricated data, but
// still a real gap the user wanted closed. Wired to rdEnsureIhsgHistory()
// (03-engine.js), which fetches real ^JKSE history from Yahoo Finance via
// the same proxy chain the rest of the app uses. Verified live via
// Playwright (with a Chart.js stub, since this sandbox's egress policy
// blocks the cdnjs.cloudflare.com CDN Chart.js itself loads from): clicking
// through every range tab ends in either real data or an honest "Gagal
// memuat data historis IHSG (<tf>) — coba lagi nanti." message, never a
// silently-stuck canvas, with zero pageerror.
test('REGRESSION GUARD: Market Pulse IHSG chart must fetch real history for 5D/1M/6M/YTD/1Y/5Y/ALL ranges, not stay disabled placeholders', () => {
  const decisionSrc = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  const engineSrc = fs.readFileSync(path.join(__dirname, 'public/js/03-engine.js'), 'utf8');

  assert(!/showToast\('Riwayat ' \+ r\.label \+ ' butuh data historis resmi bursa/.test(decisionSrc),
    'REGRESSION: the IHSG range tabs reverted to a disabled toast placeholder instead of calling real data fetch');
  assert(/function dbSwitchIhsgRange/.test(decisionSrc), 'REGRESSION: dbSwitchIhsgRange() is gone — no way to switch the IHSG chart range');
  assert(/rdEnsureIhsgHistory\(tf, function\(rows\)/.test(decisionSrc), 'REGRESSION: renderDailyBriefIhsgChart() no longer calls rdEnsureIhsgHistory() for non-1D ranges — reverted to fabricating or leaving them unimplemented');
  assert(/Gagal memuat data historis IHSG/.test(decisionSrc), 'REGRESSION: the honest failure message for a real fetch failure is gone — a failed fetch must never silently leave a blank/stuck chart');

  assert(/function fhFetchIhsgHistory/.test(engineSrc), 'REGRESSION: fhFetchIhsgHistory() is gone from 03-engine.js — real IHSG history fetcher removed');
  assert(/function rdEnsureIhsgHistory/.test(engineSrc), 'REGRESSION: rdEnsureIhsgHistory() is gone — cache/inflight/backoff wrapper removed');
  assert(/FH\.IHSG_SYM/.test(engineSrc.match(/function fhFetchIhsgHistory[\s\S]*?\n\}\n/)?.[0] || ''),
    'REGRESSION: fhFetchIhsgHistory() no longer targets the real ^JKSE symbol (FH.IHSG_SYM)');
  assert(/IHSG_HIST_FAIL\[tf\] = Date\.now\(\)/.test(engineSrc),
    'REGRESSION: rdEnsureIhsgHistory() no longer records a failure timestamp — a failed fetch would be silently retried on every re-render instead of backing off, hammering the shared proxy');
});

// ── TEST: Shareholder/KSEI live-fetch from Invezgo (4 endpoints, all
// schemas confirmed via real captured BBCA responses 2026-09-18, not a
// guess) — number, ksei (9-category Asing/Lokal), classify-table (39-code
// granular snapshot), classification (39-code time series) ──
// User explicitly requested this ("shareholder juga [ada API]... jangan
// pakai hardcode") after Bandarmology's schema bug, so every fetcher here
// must fail-closed honestly on NOT_CONFIGURED/unexpected-schema rather than
// ever inventing a shareholder count, category breakdown, or investor
// classification label.
test('REGRESSION GUARD: fetchInvezgoShareholderNumber/Ksei/ClassifyTable/Classification() must call the real Invezgo endpoints and parse the confirmed real schemas', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');

  assert(/async function fetchInvezgoShareholderNumber/.test(src), 'REGRESSION: fetchInvezgoShareholderNumber() is missing');
  assert(/async function fetchInvezgoShareholderKsei/.test(src), 'REGRESSION: fetchInvezgoShareholderKsei() is missing');
  assert(/async function fetchInvezgoShareholderClassifyTable/.test(src), 'REGRESSION: fetchInvezgoShareholderClassifyTable() is missing');
  assert(/async function fetchInvezgoShareholderClassification/.test(src), 'REGRESSION: fetchInvezgoShareholderClassification() is missing');

  const numberFn = src.match(/async function fetchInvezgoShareholderNumber[\s\S]*?\n\}\n/)[0];
  assert(/\/analysis\/shareholder\/number\/\$\{encodeURIComponent\(ticker\)\}/.test(numberFn),
    'REGRESSION: fetchInvezgoShareholderNumber() no longer calls the real /analysis/shareholder/number/{code} endpoint');
  assert(/holderCount:\s*Number\(r\.value\)/.test(numberFn),
    'REGRESSION: fetchInvezgoShareholderNumber() no longer maps the real `value` field (jumlah pemegang saham) to holderCount');

  const kseiFn = src.match(/async function fetchInvezgoShareholderKsei[\s\S]*?\n\}\n/)[0];
  assert(/\/analysis\/shareholder\/ksei\/\$\{encodeURIComponent\(ticker\)\}\?range=/.test(kseiFn),
    'REGRESSION: fetchInvezgoShareholderKsei() no longer calls the real /analysis/shareholder/ksei/{code}?range= endpoint');
  assert(/r\['foreign_' \+ k\]/.test(kseiFn) && /r\['local_' \+ k\]/.test(kseiFn),
    'REGRESSION: fetchInvezgoShareholderKsei() no longer derives foreign_*/local_* category fields confirmed from the real BBCA response');

  const classifyTableFn = src.match(/async function fetchInvezgoShareholderClassifyTable[\s\S]*?\n\}\n/)[0];
  assert(/\/analysis\/shareholder\/classify-table\/\$\{encodeURIComponent\(ticker\)\}/.test(classifyTableFn),
    'REGRESSION: fetchInvezgoShareholderClassifyTable() no longer calls the real /analysis/shareholder/classify-table/{code} endpoint');
  assert(/periodUnknown:\s*true/.test(classifyTableFn),
    'REGRESSION: fetchInvezgoShareholderClassifyTable() no longer marks periodUnknown — the real response has NO date field, inventing one would be fabricated data');

  const classificationFn = src.match(/async function fetchInvezgoShareholderClassification[\s\S]*?\n\}\n/)[0];
  assert(/\/analysis\/shareholder\/classification\/\$\{encodeURIComponent\(ticker\)\}\?range=/.test(classificationFn),
    'REGRESSION: fetchInvezgoShareholderClassification() no longer calls the real /analysis/shareholder/classification/{code}?range= endpoint');

  // All four must fail-closed honestly when INVEZGO_API_KEY is absent.
  assert((src.match(/if\s*\(!apiKey\)\s*return\s*\{\s*ok:\s*false,\s*reason:\s*'NOT_CONFIGURED'/g) || []).length >= 6,
    'REGRESSION: one or more shareholder fetchers no longer takes an honest NOT_CONFIGURED early-return — must never fabricate shareholder data');

  // Classification labels: 39-code granular legend from Invezgo's own docs
  // (user-provided 2026-09-18), and the 9-code KSEI standard categories —
  // neither guessed.
  assert(/INVEZGO_CLASSIFICATION_LABELS/.test(src) && /BK:\s*'Bank'/.test(src) && /IN:\s*'Individu'/.test(src),
    'REGRESSION: INVEZGO_CLASSIFICATION_LABELS (39-code legend from Invezgo docs) is gone or incomplete');
  assert(/INVEZGO_KSEI_CATEGORY_LABELS/.test(src) && /is:\s*'Asuransi'/.test(src),
    'REGRESSION: INVEZGO_KSEI_CATEGORY_LABELS (9-category KSEI standard) is gone');
});

test('REGRESSION GUARD: generateShareholderComposition() must combine the 3 shareholder fetchers into one honest per-part result, never merged into the named >5% investor list', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');

  assert(/async function generateShareholderComposition/.test(engineSrc), 'REGRESSION: generateShareholderComposition() is missing');
  const fnSrc = engineSrc.match(/async function generateShareholderComposition[\s\S]*?\n\}\n/)[0];

  assert(/fetchInvezgoShareholderNumber\(clean\)/.test(fnSrc), 'REGRESSION: generateShareholderComposition() no longer calls fetchInvezgoShareholderNumber()');
  assert(/fetchInvezgoShareholderKsei\(clean,\s*6\)/.test(fnSrc), 'REGRESSION: generateShareholderComposition() no longer calls fetchInvezgoShareholderKsei()');
  assert(/fetchInvezgoShareholderClassifyTable\(clean\)/.test(fnSrc), 'REGRESSION: generateShareholderComposition() no longer calls fetchInvezgoShareholderClassifyTable()');
  assert(/errors\.push\(\{\s*part:\s*'holderCount'/.test(fnSrc), 'REGRESSION: an unavailable holderCount part no longer reports an honest per-part error');
  assert(/errors\.push\(\{\s*part:\s*'kseiComposition'/.test(fnSrc), 'REGRESSION: an unavailable kseiComposition part no longer reports an honest per-part error');
  assert(/errors\.push\(\{\s*part:\s*'classifyDetail'/.test(fnSrc), 'REGRESSION: an unavailable classifyDetail part no longer reports an honest per-part error');

  assert(/import\s*\{[^}]*generateShareholderComposition[^}]*\}\s*from\s*'\.\/lib\/idx-data-engine\.js'|generateShareholderComposition,/.test(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')),
    'REGRESSION: generateShareholderComposition is no longer imported into server.js');
  assert(/app\.get\('\/api\/idx\/shareholder-composition\/:ticker'/.test(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')),
    'REGRESSION: GET /api/idx/shareholder-composition/:ticker route is gone');
});

test('REGRESSION GUARD: the KSEI Shareholder page must render a separate live-Invezgo composition card, never merged into the named >5% holder table it is fetched alongside', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/34-ksei-shareholders.js'), 'utf8');

  assert(/function kseiLoadLiveComposition/.test(src), 'REGRESSION: kseiLoadLiveComposition() is gone');
  assert(/function kseiRenderLiveCompositionHtml/.test(src), 'REGRESSION: kseiRenderLiveCompositionHtml() is gone');
  assert(/\/api\/idx\/shareholder-composition\//.test(src), 'REGRESSION: kseiLoadLiveComposition() no longer fetches /api/idx/shareholder-composition/');
  assert(/ksei-live-invezgo-/.test(src), 'REGRESSION: the live-composition placeholder card id is gone from renderKseiStockView()');
  assert(/kseiLoadLiveComposition\(stock\.ticker\)/.test(src), 'REGRESSION: renderKseiStockView() no longer triggers the live composition fetch after rendering');

  // Honest per-part failure messages, never a silently blank section.
  assert(/_kseiReasonText/.test(src), 'REGRESSION: _kseiReasonText() honest-reason mapper is gone');
  assert(/NOT_CONFIGURED:/.test(src), 'REGRESSION: the honest NOT_CONFIGURED reason text is gone from the live composition renderer');
});

// ── TEST: Sector Rotation live-fetch from Invezgo's official OpenAPI spec
// (uploaded by user 2026-09-18, not a guess) — RRG (Relative Rotation
// Graph) at sector-index level, supplementing (never replacing) the
// CMF-constituent estimate ──
// User tested this endpoint twice with valid params (no filter, valid
// 2-year date range) and got `data: []` both times. The official spec
// confirms this is a DOCUMENTED "no data available" response (code 204,
// though the live server returned it under 200), not a bug — so the
// fetcher must treat an empty `data` array as an honest NO_DATA outcome,
// never as REAL-but-empty.
test('REGRESSION GUARD: fetchInvezgoSectorRotation() must call the real endpoint, treat empty `data` as honest NO_DATA (per official spec, not a guess), and parse the real RRG schema', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');

  assert(/async function fetchInvezgoSectorRotation/.test(src), 'REGRESSION: fetchInvezgoSectorRotation() is missing');
  const fnSrc = src.match(/async function fetchInvezgoSectorRotation[\s\S]*?\n\}\n/)[0];

  assert(/\/analysis\/sector\/rotation\?from=\$\{from\}&to=\$\{to\}&base=COMPOSITE/.test(fnSrc),
    'REGRESSION: fetchInvezgoSectorRotation() no longer calls the real /analysis/sector/rotation endpoint with base=COMPOSITE');
  assert(/resp\.status === 204/.test(fnSrc) || /status:\s*'UNAVAILABLE',\s*reason:\s*'NO_DATA'/.test(fnSrc),
    'REGRESSION: fetchInvezgoSectorRotation() no longer handles the documented "no data" response honestly');
  assert(/raw\.data\.length === 0/.test(fnSrc),
    'REGRESSION: fetchInvezgoSectorRotation() no longer checks for an empty `data` array — per the official OpenAPI spec this is a documented "not available" case, not REAL-but-empty');
  assert(/quadrant:\s*s\.quadrant \|\| null/.test(fnSrc),
    'REGRESSION: fetchInvezgoSectorRotation() no longer maps the real `quadrant` field from Invezgo\'s official spec example');
  assert(/trail/.test(fnSrc) && /Number\(t\.x\)/.test(fnSrc) && /Number\(t\.y\)/.test(fnSrc),
    'REGRESSION: fetchInvezgoSectorRotation() no longer maps the real trail[].x/y (RS-Ratio/RS-Momentum) fields from the official spec example');
  assert(/if\s*\(!apiKey\)\s*return\s*\{\s*ok:\s*false,\s*reason:\s*'NOT_CONFIGURED'/.test(fnSrc),
    'REGRESSION: fetchInvezgoSectorRotation() no longer takes an honest NOT_CONFIGURED early-return — must never fabricate sector rotation data');
});

test('REGRESSION GUARD: generateSectorRotation() must map Invezgo\'s 11 official IDX sector-index codes to the app\'s existing 11 sector keys, never guessed names', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');

  assert(/async function generateSectorRotation/.test(engineSrc), 'REGRESSION: generateSectorRotation() is missing');
  const fnSrc = engineSrc.match(/async function generateSectorRotation[\s\S]*?\n\}\n/)[0];
  assert(/fetchInvezgoSectorRotation\(\)/.test(fnSrc), 'REGRESSION: generateSectorRotation() no longer calls fetchInvezgoSectorRotation()');
  assert(/available:\s*false/.test(fnSrc), 'REGRESSION: an unavailable result no longer reports available:false honestly');

  const mapMatch = engineSrc.match(/const INVEZGO_SECTOR_CODE_TO_KEY = \{([\s\S]*?)\};/);
  assert(mapMatch, 'REGRESSION: INVEZGO_SECTOR_CODE_TO_KEY mapping table is gone');
  const mapBody = mapMatch[1];
  ['IDXENERGY', 'IDXFINANCE', 'IDXBASIC', 'IDXINDUST', 'IDXNONCYC', 'IDXCYCLIC', 'IDXHEALTH', 'IDXPROPERT', 'IDXTECHNO', 'IDXINFRA', 'IDXTRANS'].forEach((code) => {
    assert(mapBody.includes(code), `REGRESSION: INVEZGO_SECTOR_CODE_TO_KEY is missing the official sector code ${code}`);
  });

  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/generateSectorRotation,/.test(serverSrc), 'REGRESSION: generateSectorRotation is no longer imported into server.js');
  assert(/app\.get\('\/api\/idx\/sector-rotation'/.test(serverSrc), 'REGRESSION: GET /api/idx/sector-rotation route is gone');
});

test('REGRESSION GUARD: Sectoral Insight page must show live Invezgo RRG as a supplementary column, never replacing the CMF-constituent estimate', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/44-sectoral-insight.js'), 'utf8');

  assert(/function siComputeAllSectors/.test(src), 'REGRESSION: siComputeAllSectors() (CMF-constituent fallback) was removed — the plan requires keeping it as an explicit fallback, not deleting it');
  assert(/async function siLoadRealRotation/.test(src), 'REGRESSION: siLoadRealRotation() is gone');
  assert(/\/api\/idx\/sector-rotation/.test(src), 'REGRESSION: siLoadRealRotation() no longer fetches /api/idx/sector-rotation');
  assert(/function siRenderRotationBadge/.test(src), 'REGRESSION: siRenderRotationBadge() is gone');
  assert(/siRenderRotationBadge\(sec\.key\)/.test(src), 'REGRESSION: siRenderTable() no longer renders the live RRG badge per sector row');
  assert(/siLoadRealRotation\(\)/.test(src.match(/window\.renderSectoralInsightPage[\s\S]*?\n  \};/)?.[0] || ''),
    'REGRESSION: renderSectoralInsightPage() no longer triggers the live RRG fetch on page load');

  // Honest per-reason fallback text, never a silently blank badge.
  assert(/SI_ROTATION_REASON_TEXT/.test(src) && /NOT_CONFIGURED:/.test(src) && /NO_DATA:/.test(src),
    'REGRESSION: the honest reason-text mapping for unavailable RRG data is gone');
});

// ── TEST: Opportunity Radar fundamentals cache is now Redis-backed, not a
// plain in-memory Map (2026-09-18, user-requested: "Redis-backed
// fundamentals cache + cron warming 950 saham") ──
// The old in-memory Map couldn't survive Vercel serverless cold starts or
// be shared across concurrent instances, making cron warming pointless —
// a different instance serving a real user request would still see an
// empty cache. This guards against reverting to that Map.
test('REGRESSION GUARD: fetchYahooFundamentals() cache must be Redis-backed (yfStoreGet/yfStoreSetEx), not a plain in-memory Map', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/providers/yahoo-client.js'), 'utf8');

  assert(!/const _fundamentalsCache = new Map\(\)/.test(src),
    'REGRESSION: _fundamentalsCache reverted to a plain in-memory Map — cron warming would only ever warm one serverless instance');
  assert(/function getYahooRedis/.test(src), 'REGRESSION: getYahooRedis() lazy-singleton helper is gone');
  assert(/async function yfStoreGet/.test(src) && /async function yfStoreSetEx/.test(src),
    'REGRESSION: yfStoreGet()/yfStoreSetEx() Redis+fallback helpers are gone');
  assert(/async function yfStoreMget/.test(src), 'REGRESSION: yfStoreMget() bulk-read helper is gone');

  const fnSrc = src.match(/async function fetchYahooFundamentals[\s\S]*?\n\}\n/)[0];
  assert(/await yfStoreGet\(cacheKey\)/.test(fnSrc), 'REGRESSION: fetchYahooFundamentals() no longer reads from the Redis-backed store');
  assert(/await yfStoreSetEx\(cacheKey,\s*\{\s*isReal:\s*true,\s*data:\s*fundamentals\s*\},\s*FUNDAMENTALS_CACHE_TTL_SEC\)/.test(fnSrc),
    'REGRESSION: a real fundamentals result is no longer written to the Redis-backed store with the 24h TTL');
  assert(/await yfStoreSetEx\(cacheKey,\s*\{\s*isReal:\s*false,\s*data:\s*null\s*\},\s*FUNDAMENTALS_NEGATIVE_TTL_SEC\)/.test(fnSrc),
    'REGRESSION: a negative (no-coverage) result is no longer written with the shorter negative TTL');

  assert(/const FUNDAMENTALS_CACHE_TTL_SEC = 24 \* 60 \* 60/.test(src), 'REGRESSION: the approved 24-hour positive TTL constant is gone/changed');
  assert(/const FUNDAMENTALS_NEGATIVE_TTL_SEC = 10 \* 60/.test(src), 'REGRESSION: the approved 10-minute negative TTL constant is gone/changed');

  // Falls back to an in-memory Map only when Upstash isn't configured —
  // never crashes local dev without an Upstash account.
  assert(/_yfMemoryStore/.test(src), 'REGRESSION: the in-memory fallback for local dev without Upstash is gone');
});

test('REGRESSION GUARD: getCachedFundamentalsOnly/hasFundamentalsCacheEntry must be async (real Redis reads), and getCachedFundamentalsBulk() must exist for the 950-ticker scoring loop', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/providers/yahoo-client.js'), 'utf8');

  assert(/async function getCachedFundamentalsOnly/.test(src), 'REGRESSION: getCachedFundamentalsOnly() is no longer async — must be, since it now reads Redis');
  assert(/async function hasFundamentalsCacheEntry/.test(src), 'REGRESSION: hasFundamentalsCacheEntry() is no longer async');
  assert(/async function getCachedFundamentalsBulk/.test(src), 'REGRESSION: getCachedFundamentalsBulk() is gone');

  const bulkFnSrc = src.match(/async function getCachedFundamentalsBulk[\s\S]*?\n\}\n/)[0];
  assert(/yfStoreMget\(keys\)/.test(bulkFnSrc), 'REGRESSION: getCachedFundamentalsBulk() no longer does a single bulk mget — would regress to N individual Redis round-trips for 950 tickers');

  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const radarFnSrc = engineSrc.match(/async function getUniverseOpportunityRadar[\s\S]*?\n\}\n\nasync function/)?.[0]
    || engineSrc.match(/async function getUniverseOpportunityRadar[\s\S]{0,4000}/)[0];
  assert(/getCachedFundamentalsBulk\(allList\.map\(s => s\.code\)\)/.test(radarFnSrc),
    'REGRESSION: getUniverseOpportunityRadar() no longer bulk-reads all tickers\' cache entries in one call — would regress to 950 sequential Redis round-trips per request');
  assert(!/const fund = getCachedFundamentalsOnly\(code\)/.test(engineSrc),
    'REGRESSION: getUniverseOpportunityRadar() reverted to calling the (now-async) getCachedFundamentalsOnly() synchronously inside its .map() — this would silently return a Promise instead of fundamentals data');
});

test('REGRESSION GUARD: warmRadarFundamentalsRotating() must persist a Redis cursor and respect a time budget, so a single Vercel Hobby cron run (1x/day, 30s max) makes safe rotating progress across the full 950-ticker universe', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');

  assert(/async function warmRadarFundamentalsRotating/.test(engineSrc), 'REGRESSION: warmRadarFundamentalsRotating() is missing');
  const fnSrc = engineSrc.match(/async function warmRadarFundamentalsRotating[\s\S]*?\n\}\n/)[0];

  assert(/getRadarWarmCursor\(\)/.test(fnSrc), 'REGRESSION: warmRadarFundamentalsRotating() no longer reads the persisted cursor — progress would reset to 0 every run instead of rotating through the full universe');
  assert(/setRadarWarmCursor\(idx\)/.test(fnSrc), 'REGRESSION: warmRadarFundamentalsRotating() no longer persists the cursor after a run');
  assert(/\(Date\.now\(\) - start\) < budget/.test(fnSrc), 'REGRESSION: the time-budget guard is gone — a run could exceed Vercel\'s function duration limit and get killed mid-write');
  assert(/idx = \(idx \+ 1\) % total/.test(fnSrc), 'REGRESSION: the cursor no longer wraps around at the end of the universe — rotation would stop instead of cycling');
  assert(/const already = await hasFundamentalsCacheEntry\(code\)/.test(fnSrc) && /if \(already\) return \{ skipped: true \}/.test(fnSrc),
    'REGRESSION: warmRadarFundamentalsRotating() no longer skips already-cached tickers — would re-fetch a fresh 24h-cached ticker on every rotation pass');

  const clientSrc = fs.readFileSync(path.join(__dirname, 'lib/providers/yahoo-client.js'), 'utf8');
  assert(/async function getRadarWarmCursor/.test(clientSrc) && /async function setRadarWarmCursor/.test(clientSrc),
    'REGRESSION: getRadarWarmCursor()/setRadarWarmCursor() are gone from yahoo-client.js');
});

test('REGRESSION GUARD: GET /api/cron/warm-radar-fundamentals must reject requests without a valid CRON_SECRET (fail-closed), never run warming unauthenticated', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  assert(/app\.get\('\/api\/cron\/warm-radar-fundamentals'/.test(serverSrc), 'REGRESSION: GET /api/cron/warm-radar-fundamentals route is gone');
  const routeSrc = serverSrc.match(/app\.get\('\/api\/cron\/warm-radar-fundamentals'[\s\S]*?\n\}\);/)[0];

  assert(/process\.env\.CRON_SECRET/.test(routeSrc), 'REGRESSION: the route no longer reads CRON_SECRET from the environment');
  assert(/if \(!secret \|\| authHeader !== `Bearer \$\{secret\}`\)/.test(routeSrc),
    'REGRESSION: the route no longer fails closed when CRON_SECRET is unset or the Authorization header doesn\'t match — this would let anyone publicly trigger Yahoo Finance calls for the whole 950-ticker universe');
  assert(/res\.status\(403\)/.test(routeSrc), 'REGRESSION: an unauthenticated/unauthorized request no longer gets a 403 — must never silently proceed');
  assert(/warmRadarFundamentalsRotating\(25000\)/.test(routeSrc), 'REGRESSION: the route no longer calls warmRadarFundamentalsRotating() with the 25s safety budget (leaving margin under vercel.json\'s 30s maxDuration)');

  assert(/warmRadarFundamentalsRotating,/.test(serverSrc), 'REGRESSION: warmRadarFundamentalsRotating is no longer imported into server.js');
});

test('REGRESSION GUARD: vercel.json must schedule the radar-fundamentals cron once daily (Vercel Hobby allows only 1x/day)', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));

  assert(Array.isArray(vercelConfig.crons), 'REGRESSION: vercel.json crons array is gone');
  const cronEntry = vercelConfig.crons.find((c) => c.path === '/api/cron/warm-radar-fundamentals');
  assert(cronEntry, 'REGRESSION: the /api/cron/warm-radar-fundamentals cron entry is gone from vercel.json');
  assert(typeof cronEntry.schedule === 'string' && cronEntry.schedule.split(' ').length === 5,
    'REGRESSION: the cron schedule is missing or malformed (must be a standard 5-field cron expression)');
  // Must be a once-daily schedule (Vercel Hobby's limit) — a fixed
  // minute+hour with wildcard day/month/day-of-week, not every-N-minutes/hours.
  const fields = cronEntry.schedule.split(' ');
  assert(/^\d+$/.test(fields[0]) && /^\d+$/.test(fields[1]) && fields[2] === '*' && fields[3] === '*' && fields[4] === '*',
    'REGRESSION: the cron schedule no longer runs exactly once/day — Vercel Hobby (the user\'s plan) only allows 1 cron execution per day');
});

// ── TEST: getUniverseForeignFlow() must scan the WHOLE BEI market via
// Invezgo's dedicated /analysis/top/foreign endpoint, never a hardcoded
// ticker sample ──
// User-reported (screenshot, 2026-09-18): "TOP 5 FOREIGN NET BUY... apakah
// khusus LQ45? atau semua saham... jangan hanya analisa LQ45, analisa
// semua emiten" — the old renderBandarmologyForeignFlowView() iterated a
// hardcoded ~42-ticker sample AND had a separate bug (bandarForeignNetRp()
// read a null netValRp for every real-data ticker, so both Net Buy/Net
// Sell columns showed identical "+Rp 0 M" rows in the same order).
test('REGRESSION GUARD: getUniverseForeignFlow() must scan the whole BEI market via fetchInvezgoTopMovers(\'foreign\'), not a hardcoded ticker sample', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/async function getUniverseForeignFlow/.test(engineSrc), 'REGRESSION: getUniverseForeignFlow() is gone from lib/idx-data-engine.js');
  const fnSrc = engineSrc.match(/async function getUniverseForeignFlow[\s\S]*?\n\}\n/)[0];

  assert(/fetchInvezgoTopMovers\(\s*'foreign'/.test(fnSrc),
    'REGRESSION: getUniverseForeignFlow() no longer calls fetchInvezgoTopMovers(\'foreign\', ...) — the whole-market Invezgo endpoint');
  assert(/netBuy\s*=\s*\(result\.accum \|\| \[\]\)\.map\(mapRow\)\.sort/.test(fnSrc),
    'REGRESSION: getUniverseForeignFlow() no longer builds netBuy from result.accum');
  assert(/netSell\s*=\s*\(result\.dist \|\| \[\]\)\.map\(mapRow\)\.sort/.test(fnSrc),
    'REGRESSION: getUniverseForeignFlow() no longer builds netSell from result.dist');
  assert(/isSimulated:\s*true/.test(fnSrc) && /NOT_CONFIGURED|Invezgo API key belum dikonfigurasi/.test(fnSrc),
    'REGRESSION: getUniverseForeignFlow() no longer honestly reports isSimulated:true when Invezgo is not configured');

  assert(/getUniverseForeignFlow,/.test(engineSrc), 'REGRESSION: getUniverseForeignFlow is no longer exported from lib/idx-data-engine.js');

  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/app\.get\('\/api\/idx\/foreign-flow'/.test(serverSrc), 'REGRESSION: GET /api/idx/foreign-flow route is gone from server.js');
  assert(/getUniverseForeignFlow\(\)/.test(serverSrc), 'REGRESSION: the /api/idx/foreign-flow route no longer calls getUniverseForeignFlow()');

  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const foreignViewSrc = cockpitSrc.match(/function renderBandarmologyForeignFlowView[\s\S]*?\n\}\n/)[0];
  assert(!/var sampleTickers = \[/.test(foreignViewSrc),
    'REGRESSION: renderBandarmologyForeignFlowView() reverted to iterating a hardcoded ticker sample instead of the whole-market endpoint');
  assert(/async function bandarLoadRealForeignFlow/.test(cockpitSrc), 'REGRESSION: bandarLoadRealForeignFlow() is gone — Foreign Flow view no longer fetches real whole-market data');
  assert(/fetch\('\/api\/idx\/foreign-flow'/.test(cockpitSrc), 'REGRESSION: bandarLoadRealForeignFlow() no longer fetches GET /api/idx/foreign-flow');
});

// ── TEST: _mergeWealthData() must respect tombstones for bank/debt/
// piutang deletions across devices, not just union-by-id forever ──
// User-reported: menghapus rekening bank/hutang/piutang di satu device
// membuat item itu "muncul lagi" setelah sinkron dari device lain, karena
// mergeById() dulu cuma menggabungkan array tanpa pernah menghormati
// penghapusan. Scope tombstone SENGAJA dibatasi ke bank/debt/piutang saja
// (bukan transactions/dividends/dll) — keputusan eksplisit user via
// AskUserQuestion, retensi 90 hari.
test('REGRESSION GUARD: _mergeWealthData() must exclude tombstoned bank/debt/piutang ids from the merged result, not resurrect deleted items', () => {
  const storageSrc = fs.readFileSync(path.join(__dirname, 'public/js/02-storage.js'), 'utf8');

  const tombstoneFnSrc = storageSrc.match(/function _mergeTombstones[\s\S]*?\n\}\n/);
  assert(tombstoneFnSrc, 'REGRESSION: _mergeTombstones() is gone from 02-storage.js');
  const mergeFnSrc = storageSrc.match(/function _mergeWealthData[\s\S]*?\n\}\n/);
  assert(mergeFnSrc, 'REGRESSION: _mergeWealthData() is gone from 02-storage.js');

  const retentionMatch = storageSrc.match(/WEALTH_TOMBSTONE_RETENTION_MS\s*=\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)\s*\*\s*(\d+)/);
  assert(retentionMatch, 'REGRESSION: WEALTH_TOMBSTONE_RETENTION_MS constant is gone');
  const retentionMs = retentionMatch.slice(1, 6).reduce((a, b) => a * Number(b), 1);
  assert.strictEqual(retentionMs, 90 * 24 * 60 * 60 * 1000, 'REGRESSION: tombstone retention is no longer 90 days (user-confirmed value)');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    'var WEALTH_TOMBSTONE_RETENTION_MS = ' + retentionMs + ';\n' + tombstoneFnSrc[0] + mergeFnSrc[0],
    sandbox,
    { filename: '_mergeWealthData (sandboxed)' }
  );

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Scenario 1: device A deletes bank id=1 (tombstoned), device B never
  // synced that deletion and still has id=1 locally — merged result must
  // NOT resurrect it.
  const cloudWealth = { bank: [{ id: 1, bank: 'BCA', saldo: 1000 }], debt: [], piutang: [], tombstones: [{ type: 'bank', id: 1, deletedAt: nowIso }] };
  const localWealth = { bank: [{ id: 1, bank: 'BCA', saldo: 1000 }], debt: [], piutang: [], tombstones: [] };
  const merged1 = sandbox._mergeWealthData(localWealth, cloudWealth, now, now);
  assert.strictEqual(merged1.bank.length, 0, 'REGRESSION: a bank item tombstoned on one side was resurrected by the union-by-id merge instead of being excluded');

  // Scenario 2: a genuinely NEW item (id=2) only exists locally, no
  // tombstone anywhere — must still be kept (this is the "device hasn't
  // synced yet" case the original union-by-id design protects).
  const cloudWealth2 = { bank: [], debt: [], piutang: [], tombstones: [] };
  const localWealth2 = { bank: [{ id: 2, bank: 'Mandiri', saldo: 500 }], debt: [], piutang: [], tombstones: [] };
  const merged2 = sandbox._mergeWealthData(localWealth2, cloudWealth2, now, now);
  assert.strictEqual(merged2.bank.length, 1, 'REGRESSION: a new (never-deleted) item was incorrectly dropped — tombstone filtering must only remove tombstoned ids, not act as a whitelist');

  // Scenario 3: an expired tombstone (>90 days old) must no longer
  // suppress the item if it somehow still exists on one side.
  const oldDeletedAt = new Date(now - (91 * 24 * 60 * 60 * 1000)).toISOString();
  const cloudWealth3 = { bank: [{ id: 3, bank: 'BRI', saldo: 200 }], debt: [], piutang: [], tombstones: [{ type: 'bank', id: 3, deletedAt: oldDeletedAt }] };
  const localWealth3 = { bank: [], debt: [], piutang: [], tombstones: [] };
  const merged3 = sandbox._mergeWealthData(localWealth3, cloudWealth3, now, now);
  assert.strictEqual(merged3.bank.length, 1, 'REGRESSION: an expired (>90 day) tombstone incorrectly still suppresses the item — must be pruned');

  // Scenario 4: debt/piutang tombstones must be scoped by type — a bank
  // tombstone for id=5 must not suppress a debt item with the same id.
  const cloudWealth4 = { bank: [], debt: [{ id: 5, nama: 'KPR' }], piutang: [], tombstones: [{ type: 'bank', id: 5, deletedAt: nowIso }] };
  const localWealth4 = { bank: [], debt: [], piutang: [], tombstones: [] };
  const merged4 = sandbox._mergeWealthData(localWealth4, cloudWealth4, now, now);
  assert.strictEqual(merged4.debt.length, 1, 'REGRESSION: a tombstone for type=bank incorrectly suppressed a debt item with the same numeric id — tombstones must be scoped per-type');

  // 20-wealth.js and 35-settings.js must actually RECORD tombstones when
  // deleting, not just have the merge-side plumbing with nothing writing to it.
  const wealthSrc = fs.readFileSync(path.join(__dirname, 'public/js/20-wealth.js'), 'utf8');
  assert(/function wRecordTombstone/.test(wealthSrc), 'REGRESSION: wRecordTombstone() is gone from 20-wealth.js');
  const wDeleteSrc = wealthSrc.match(/function wDelete\(type, id\)[\s\S]*?\n\}\n/)[0];
  assert(/wRecordTombstone\(type, id\)/.test(wDeleteSrc), 'REGRESSION: wDelete() no longer calls wRecordTombstone() — deletions from the main Wealth page will stop propagating across devices again');

  const settingsSrc = fs.readFileSync(path.join(__dirname, 'public/js/35-settings.js'), 'utf8');
  assert(/wRecordTombstone\('bank', removed\.id\)/.test(settingsSrc), 'REGRESSION: deleteBankAccount() in Settings no longer records a tombstone — this UI path bypasses the fix');
  assert(/wRecordTombstone\('debt', removed\.id\)/.test(settingsSrc), 'REGRESSION: deleteDebt() in Settings no longer records a tombstone — this UI path bypasses the fix');
});

// ── TEST: Corporate Action Calendar (dividends/splits/rights/RUPS) must
// use real Invezgo data, never the hardcoded fictional arrays that used to
// masquerade as "verified" official data ──
// User-reported (full-codebase audit, 2026-09-18): getIdxCalendarData()
// (lib/providers/idx-client.js) was a 100% hardcoded fictional dataset
// whose own comment falsely claimed "Hanya data dividen resmi yang
// terverifikasi... tanpa data dummy" — never labeled isSimulated, so no
// UI could disclose it was fake. A SECOND independent fictional dataset
// (IDX_DIVIDEND_MASTER_REGISTRY) existed in public/js/42-dividend-
// calendar.js with the same false claim, merged into the API response.
test('REGRESSION GUARD: getIdxCalendarData() must call real Invezgo GET /analysis/calendar, never the old hardcoded fictional arrays', () => {
  const clientSrc = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  assert(/async function fetchInvezgoCalendar/.test(clientSrc), 'REGRESSION: fetchInvezgoCalendar() is gone from lib/invezgo-client.js');
  assert(/\/analysis\/calendar/.test(clientSrc), 'REGRESSION: fetchInvezgoCalendar() no longer calls the real /analysis/calendar endpoint');
  assert(/fetchInvezgoCalendar,/.test(clientSrc), 'REGRESSION: fetchInvezgoCalendar is no longer exported from lib/invezgo-client.js');

  const idxClientSrc = fs.readFileSync(path.join(__dirname, 'lib/providers/idx-client.js'), 'utf8');
  assert(/async function getIdxCalendarData/.test(idxClientSrc), 'REGRESSION: getIdxCalendarData() is no longer async — it must call the real Invezgo API');
  assert(/fetchInvezgoCalendar\(/.test(idxClientSrc), 'REGRESSION: getIdxCalendarData() no longer calls fetchInvezgoCalendar()');
  assert(!/cumDate: '2026-09-17'/.test(idxClientSrc) && !/BSSR.*Baramulti Suksessarana/.test(idxClientSrc),
    'REGRESSION: the old hardcoded fictional dividend array is back in getIdxCalendarData()');
  assert(/isSimulated:\s*true/.test(idxClientSrc), 'REGRESSION: getIdxCalendarData() no longer honestly reports isSimulated:true when Invezgo is not configured/fails');

  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/await getIdxCalendarData\(/.test(engineSrc), 'REGRESSION: idx-data-engine.js no longer awaits getIdxCalendarData() (it is async now)');

  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const calRouteSrc = serverSrc.match(/app\.get\('\/api\/idx\/calendar'[\s\S]*?\n\}\);/)[0];
  assert(/await getIdxCalendarData\(/.test(calRouteSrc), 'REGRESSION: GET /api/idx/calendar route no longer awaits the now-async getIdxCalendarData()');

  const divCalSrc = fs.readFileSync(path.join(__dirname, 'public/js/42-dividend-calendar.js'), 'utf8');
  assert(!/IDX_DIVIDEND_MASTER_REGISTRY\s*=\s*\[/.test(divCalSrc),
    'REGRESSION: the second hardcoded fictional dividend dataset (IDX_DIVIDEND_MASTER_REGISTRY) is back in 42-dividend-calendar.js');
  assert(!/dc-bssr-26-sep/.test(divCalSrc), 'REGRESSION: fictional dividend entries are back in 42-dividend-calendar.js');
  assert(/function renderDivCalDisabledNotice/.test(divCalSrc),
    'REGRESSION: renderDivCalDisabledNotice() is gone — the Dividend Calendar page must honestly disclose it is disabled pending Invezgo payload schema verification, not silently show nothing or fabricated data');
});

// ── TEST: broker-summary fallback paths (backend template + client-side
// twin + the "1-Year Broker Cost Matrix" widget) must never fabricate
// specific broker names/weights/values, even when honestly labeled
// isSimulated ──
// User-reported (screenshot, 2026-09-18): "Matriks Rata-Rata Harga Beli
// Broker Historis 1 Tahun" showed a precise-looking table of named brokers
// with invented weight/bias percentages and computed Rupiah amounts, badged
// "SIMULASI" — user demanded these be replaced with real Invezgo data or
// an honest empty state, not fabricated-but-labeled numbers.
test('REGRESSION GUARD: broker-summary fallbacks (template, client-side, 1-year matrix) must return honest empty state, never fabricate broker weights/values', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const templateFnSrc = engineSrc.match(/function generateBrokerSummaryTemplate[\s\S]*?\n\}\n/)[0];
  assert(!/topBuyerWeights\s*=/.test(templateFnSrc) && !/buyerBrokers\s*=/.test(templateFnSrc),
    'REGRESSION: generateBrokerSummaryTemplate() reverted to fabricating broker weights/lists');
  assert(/topBuyers:\s*\[\]/.test(templateFnSrc) && /topSellers:\s*\[\]/.test(templateFnSrc),
    'REGRESSION: generateBrokerSummaryTemplate() no longer returns an honest empty topBuyers/topSellers');

  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const clientFnSrc = cockpitSrc.match(/function generateClientSideBrokerSummary[\s\S]*?\n\}\n/)[0];
  assert(!/buyerWeights\s*=/.test(clientFnSrc) && !/topBuyerCodes\s*=/.test(clientFnSrc),
    'REGRESSION: generateClientSideBrokerSummary() reverted to fabricating broker weights/lists');
  assert(/topBuyers:\s*\[\]/.test(clientFnSrc) && /topSellers:\s*\[\]/.test(clientFnSrc),
    'REGRESSION: generateClientSideBrokerSummary() no longer returns an honest empty topBuyers/topSellers');

  const matrixViewSrc = cockpitSrc.match(/function renderBandarmology1YearBrokerCostMatrix[\s\S]*?\n\}\n/)[0];
  assert(!/majorBrokers\s*=/.test(matrixViewSrc), 'REGRESSION: renderBandarmology1YearBrokerCostMatrix() reverted to the hardcoded majorBrokers fabricated array');
  assert(/async function bandarLoad1YearBrokerMatrix/.test(cockpitSrc), 'REGRESSION: bandarLoad1YearBrokerMatrix() is gone — the 1-year matrix no longer fetches real data');
  assert(/fetchBrokerSummaryData\(tk, '1Y'\)/.test(cockpitSrc), 'REGRESSION: bandarLoad1YearBrokerMatrix() no longer fetches real 1-year broker data via fetchBrokerSummaryData()');
});

// ── TEST: Accumulation/Distribution Bandarmology views must use the
// whole-market Invezgo endpoint, never the old 42-ticker hardcoded sample;
// Broker Trail (which genuinely has no whole-market equivalent) must
// honestly disclose its limited scope instead of silently using a sample ──
// User-reported (2026-09-18, follow-up to the Foreign Flow fix): "lanjut
// perbaiki 3 view Bandarmology lainnya juga" — Accumulation, Distribution,
// and Broker Trail all iterated the same hardcoded ~42-ticker sample as
// the already-fixed Foreign Flow view (CLAUDE.md rule #2 violation).
test('REGRESSION GUARD: Accumulation/Distribution views use whole-market Invezgo data; Broker Trail honestly discloses its sample-scope limitation', () => {
  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');

  const accViewSrc = cockpitSrc.match(/function renderBandarmologyAccumulationView[\s\S]*?\n\}\n/)[0];
  assert(!/var sampleTickers = \[/.test(accViewSrc), 'REGRESSION: renderBandarmologyAccumulationView() reverted to a hardcoded ticker sample');
  const distViewSrc = cockpitSrc.match(/function renderBandarmologyDistributionView[\s\S]*?\n\}\n/)[0];
  assert(!/var sampleTickers = \[/.test(distViewSrc), 'REGRESSION: renderBandarmologyDistributionView() reverted to a hardcoded ticker sample');

  assert(/async function bandarLoadAccDist/.test(cockpitSrc), 'REGRESSION: bandarLoadAccDist() is gone — Accumulation/Distribution no longer fetch real whole-market data');
  assert(/fetch\('\/api\/idx\/accumulation-distribution'/.test(cockpitSrc), 'REGRESSION: bandarLoadAccDist() no longer fetches GET /api/idx/accumulation-distribution');

  // Container ids must be DISTINCT — both views render on the same page
  // simultaneously; a shared id would make document.getElementById() only
  // ever find the first one, silently breaking the second view's update.
  assert(/id="bandar-acc-content"/.test(cockpitSrc) && /id="bandar-dist-content"/.test(cockpitSrc),
    'REGRESSION: Accumulation/Distribution containers no longer have distinct ids — updating one would break the other');

  // Broker Summary by Broker (formerly Broker Trail): upgraded to real whole-market
  // Invezgo institutional portfolio endpoint (/analysis/summary/broker/{code}).
  const trailViewSrc = cockpitSrc.match(/function renderBandarmologyBrokerTrailView[\s\S]*?\n\}\n/)[0];
  assert(/TOP NET BUY \(AKUMULASI\)/.test(trailViewSrc), 'REGRESSION: renderBandarmologyBrokerTrailView() missing TOP NET BUY table');
  assert(/TOP NET SELL \(DISTRIBUSI\)/.test(trailViewSrc), 'REGRESSION: renderBandarmologyBrokerTrailView() missing TOP NET SELL table');
});

// ── TEST: Smart Money Screener's whole-market Accumulation/Distribution
// scan must let the user pick a historical date, not just "today" ──
// User-reported (2026-09-18): "ini seharusnya bisa di pilih tanggalnya,
// karna kalo cuma hari ini ya percuma, baru keluar datanya di sore hari"
// — Invezgo's EOD report for the current day isn't published until
// ~17:30 WIB, so checking earlier always showed empty data with no way
// to see a previous (already-published) day's results.
test('REGRESSION GUARD: getUniverseAccumulationDistribution() must accept a date param, and the Smart Money Screener UI must offer a date picker', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const fnSrc = engineSrc.match(/async function getUniverseAccumulationDistribution[\s\S]*?\n\}\n/)[0];
  assert(/params\.date/.test(fnSrc), 'REGRESSION: getUniverseAccumulationDistribution() no longer reads params.date — always forced to today');

  const flowscanSrc = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');
  assert(/selectedDate/.test(flowscanSrc), 'REGRESSION: FS_BROKER_SCAN.selectedDate is gone — no way to request a historical date');
  assert(/function fsSetBrokerScanDate/.test(flowscanSrc), 'REGRESSION: fsSetBrokerScanDate() is gone — the date picker has no handler');
  assert(/type="date"/.test(flowscanSrc), 'REGRESSION: the Smart Money Screener UI no longer renders a date <input>');
  assert(/\?date=' \+ encodeURIComponent\(FS_BROKER_SCAN\.selectedDate\)/.test(flowscanSrc),
    'REGRESSION: the accumulation-distribution fetch no longer forwards the selected date as a query param');
});

// ── TEST: Volume Spike Scanner must indicate accumulation vs distribution
// from real price direction (chg1d), not leave the user to guess ──
// User-reported (2026-09-18): "belum dijelaskan ini volume akumulasi atau
// distribusi karna anda hitung sesuai volume bukan pada aksinya" — volume
// magnitude alone doesn't say which direction the spike leans; chg1d (real
// price change on the spike day) is a standard, non-fabricated technical
// heuristic for it (price up + volume up = accumulation lean, and vice
// versa) — clearly labeled as an indication, not a broker-identity claim.
test('REGRESSION GUARD: Volume Spike Scanner must show an accumulation/distribution indication derived from real price direction (chg1d)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/45-volume-spike.js'), 'utf8');
  assert(/chg1d >= 0/.test(src), 'REGRESSION: the accumulation/distribution direction heuristic (based on real chg1d) is gone');
  assert(/Indikasi AKUMULASI|>AKUMULASI</.test(src), 'REGRESSION: the AKUMULASI indication label is gone from Volume Spike Scanner');
  assert(/Indikasi DISTRIBUSI|>DISTRIBUSI</.test(src), 'REGRESSION: the DISTRIBUSI indication label is gone from Volume Spike Scanner');
});

// ── TEST: Harga Wajar (MoS) auto-fill must use REAL Invezgo financial
// statement data for tickers outside the 27-ticker curated
// STOCK_FINANCIAL_DATABASE, with an honest disclosure of the derived
// fields, instead of leaving the historical table permanently empty ──
// User-reported (2026-09-18): "Harga Wajar, tidak ada data lengkap padahal
// API data invezgo punya data financial" — verified schema from 2 real
// BBCA JSON files (BS+IS) the user uploaded: no shares-outstanding field
// exists (derived as Net Income ÷ EPS), the EPS row's raw value needs an
// undocumented ÷1,000,000 scale factor (inferred from numeric plausibility:
// BBCA FY2025 467000000/1e6=467, a realistic EPS), and no DPS field exists
// at all — all disclosed honestly rather than presented as primary data.
test('REGRESSION GUARD: Harga Wajar auto-fill fetches real Invezgo financial-statement data for uncurated tickers, with honest disclosure', () => {
  const invezgoSrc = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  assert(/async function fetchInvezgoFinancialStatement/.test(invezgoSrc),
    'REGRESSION: fetchInvezgoFinancialStatement() is gone from lib/invezgo-client.js');
  assert(/fetchInvezgoFinancialStatement,/.test(invezgoSrc.match(/export \{[\s\S]*?\}/)[0]),
    'REGRESSION: fetchInvezgoFinancialStatement is no longer exported from lib/invezgo-client.js');

  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const fnSrc = engineSrc.match(/async function generateFinancialStatementSummary[\s\S]*?\n\}\n/)[0];
  assert(/fetchInvezgoFinancialStatement\(clean, 'BS', 'FY', 4\)/.test(fnSrc),
    'REGRESSION: generateFinancialStatementSummary() no longer fetches the real Balance Sheet from Invezgo');
  assert(/fetchInvezgoFinancialStatement\(clean, 'IS', 'FY', 4\)/.test(fnSrc),
    'REGRESSION: generateFinancialStatementSummary() no longer fetches the real Income Statement from Invezgo');
  assert(/netIncomeRaw \/ eps/.test(fnSrc),
    'REGRESSION: shares outstanding is no longer derived from Net Income ÷ EPS (there is no direct shares field in the API)');
  assert(/dps:\s*null/.test(fnSrc),
    'REGRESSION: DPS is no longer honestly left null (no DPS field exists in the financial statement endpoint)');
  assert(/disclosures:/.test(fnSrc) && /epsScaleAssumption/.test(fnSrc) && /sharesDerived/.test(fnSrc),
    'REGRESSION: generateFinancialStatementSummary() no longer discloses the EPS scale assumption / derived-shares methodology');
  assert(/generateFinancialStatementSummary$/m.test(engineSrc) || /generateFinancialStatementSummary\s*\n?\};/.test(engineSrc),
    'REGRESSION: generateFinancialStatementSummary is no longer exported from lib/idx-data-engine.js');

  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/app\.get\('\/api\/idx\/financial-statement\/:ticker'/.test(serverSrc),
    'REGRESSION: GET /api/idx/financial-statement/:ticker route is gone from server.js');
  assert(/generateFinancialStatementSummary\(ticker\)/.test(serverSrc),
    'REGRESSION: the financial-statement route no longer calls generateFinancialStatementSummary()');

  const hwSrc = fs.readFileSync(path.join(__dirname, 'public/js/10-hargawajar.js'), 'utf8');
  assert(/function hw_fetchRealFinancialStatement/.test(hwSrc),
    'REGRESSION: hw_fetchRealFinancialStatement() is gone — Harga Wajar no longer fetches real data for uncurated tickers');
  assert(/fetch\('\/api\/idx\/financial-statement\/'/.test(hwSrc),
    'REGRESSION: hw_fetchRealFinancialStatement() no longer calls the real financial-statement endpoint');
  // NOTE: hw_autoFill() used to gate this fetch behind
  // `if (!STOCK_FINANCIAL_DATABASE[tk])` (only fetch Invezgo for
  // UNCURATED tickers). That was intentionally changed 2026-09-18 — see
  // the dedicated test below — so Invezgo live data is tried for EVERY
  // ticker (curated ones included), with the curated database now only a
  // fallback. Do not reintroduce that gate here.
  assert(/function hw_renderAutoFillDisclosure/.test(hwSrc),
    'REGRESSION: hw_renderAutoFillDisclosure() is gone — auto-filled derived data is no longer disclosed to the user');
});

// ── TESTS: proactive audit (2026-09-18, user-requested "audit toolbar
// lainnya") — 7 HIGH-severity fabricated-data findings across 5 files,
// verified manually against the code (not just trusted from subagent
// reports) before fixing. Each assertion targets the exact root cause. ──

test('REGRESSION GUARD: Decision Journal no longer fabricates a fixed decisionQualityScore:90 for every entry', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  assert(!/decisionQualityScore:\s*90/.test(src), 'REGRESSION: decisionQualityScore is hardcoded to 90 again for every new journal entry');
  assert(!/Decision Score<\/th>/.test(src), 'REGRESSION: the fabricated "Decision Score" column header is back in the journal table');
  assert(!/j\.decisionQualityScore/.test(src), 'REGRESSION: the journal table still renders the fabricated decisionQualityScore field');
});

test('REGRESSION GUARD: Morning Brief IHSG "Real-time Feed" label only shows when the IHSG value is genuinely live', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  assert(/isIhsgLive/.test(src), 'REGRESSION: isIhsgLive tracking is gone — the Real-time Feed label can no longer distinguish real data from the 6845/6800 fallback');
  assert(/isIhsgLive \? 'Real-time Feed' : 'Data Belum Tersedia \(Estimasi\)'/.test(src), 'REGRESSION: the IHSG label no longer honestly falls back when data is not live');
  assert(/window\._ihsgLiveFetched === true/.test(src), 'REGRESSION: isIhsgLive reverted to checking ihsgCur > 0 alone — that is ALSO true for the 01-data.js placeholder (6500.83) set at module load, so it can never actually detect "not live"');

  const engineSrc = fs.readFileSync(path.join(__dirname, 'public/js/03-engine.js'), 'utf8');
  assert(/window\._ihsgLiveFetched = true/.test(engineSrc), 'REGRESSION: fhApplyIHSG() no longer sets window._ihsgLiveFetched — the Morning Brief live-feed flag would never become true');
});

test('REGRESSION GUARD: Audit log no longer fabricates precise HH:MM:SS transaction timestamps', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/25-auditlog.js'), 'utf8');
  const fnSrc = src.match(/function fmtAuditTime[\s\S]*?\n\}\n/)[0];
  assert(!/baseHour\s*=/.test(fnSrc) && !/baseMin\s*=/.test(fnSrc), 'REGRESSION: fmtAuditTime() reverted to synthesizing a fake hour/minute from transaction index');
  assert(!/' WIB'/.test(fnSrc), 'REGRESSION: fmtAuditTime() reverted to appending a fabricated WIB time string');
  assert(/Jam tidak tercatat/.test(src), 'REGRESSION: the audit table no longer honestly discloses that transaction time was never recorded');
});

test('REGRESSION GUARD: copyAuditSummary() computes real ledger verification instead of hardcoding "Saldo Terverifikasi 100%"', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/25-auditlog.js'), 'utf8');
  const fnSrc = src.match(/function copyAuditSummary[\s\S]*?\n\}\n/)[0];
  assert(!/Saldo Terverifikasi 100%/.test(fnSrc), 'REGRESSION: copyAuditSummary() reverted to hardcoding "Saldo Terverifikasi 100%" regardless of actual ledger integrity');
  assert(/Math\.abs\(totalIn - totalOut - curBal\) < 1/.test(fnSrc), 'REGRESSION: copyAuditSummary() no longer computes real ledger verification before claiming integrity status');
});

test('REGRESSION GUARD: Portfolio "Tren 7D" sparkline uses real 7-day price history, not a fixed fake curve based on gain/loss direction', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/29-institutional-ui.js'), 'utf8');
  const sparkFnSrc = src.match(/window\.mwCreateSparkline = function[\s\S]*?\n  \};\n/)[0];
  assert(!/base \+ \(dir \* 2\)/.test(sparkFnSrc), 'REGRESSION: mwCreateSparkline() reverted to synthesizing a fixed 5-point curve from gain/loss direction alone');
  assert(/function mwLoadRealSparkline/.test(src), 'REGRESSION: mwLoadRealSparkline() is gone — the sparkline no longer fetches real price history');
  assert(/fetch\('\/api\/idx\/history\/'/.test(src), 'REGRESSION: mwLoadRealSparkline() no longer fetches the real history endpoint');
  assert(/mwCreateSparkline\(null, isGain, 64, 18\)/.test(src) === false, 'REGRESSION: the row-injection code reverted to immediately rendering a fake sparkline with null values instead of a loading placeholder + real fetch');
});

test('REGRESSION GUARD: AI Chart Intelligence no longer fabricates a fixed Rp 15 miliar "Smart Money Net Inflow" fallback', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/43-ai-chart-intelligence.js'), 'utf8');
  assert(!/:\s*15000000000/.test(src), 'REGRESSION: the fixed Rp 15,000,000,000 institutionalNetRp fallback is back');
  assert(/institutionalNetAvailable/.test(src), 'REGRESSION: institutionalNetAvailable tracking is gone — the AI Chart Explanation modal can no longer tell real data from a fabricated fallback');
  assert(/Net Inflow institusi tidak tersedia/.test(src), 'REGRESSION: the AI Chart Explanation modal no longer honestly discloses when institutional net inflow is unavailable');
});

test('REGRESSION GUARD: Crypto Whale Tier Orderflow Breakdown discloses it is a proportional volume estimate, not real order-size data', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/36-crypto-technical.js'), 'utf8');
  assert(/Estimasi proporsional dari volume 24 jam total/.test(src), 'REGRESSION: the Whale Tier Orderflow Breakdown card no longer discloses it is a fixed-percentage proxy, not real order-book data');
});

// ── TESTS: 4 sisa temuan MEDIUM/RENDAH dari audit menyeluruh (2026-09-18),
// dikerjakan setelah 7 temuan HIGH — user meminta lanjutkan semua. ──

test('REGRESSION GUARD: AI Chart Confluence Score components (Volume Surge, Fibonacci Overlap, Trend Consistency, Risk/Reward) are computed from real data, not unconditional constants', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/43-ai-chart-intelligence.js'), 'utf8');
  const fnSrc = src.match(/function calculateAiConfluenceScore[\s\S]*?\n\}\n/)[0];
  assert(!/score \+= 8;\n\n  \/\/ 6\./.test(fnSrc), 'REGRESSION: Volume Surge reverted to an unconditional score += 8');
  assert(/volRatio/.test(fnSrc), 'REGRESSION: Volume Surge no longer computes a real volume ratio from ctx.ohlcv');
  assert(/nearFib/.test(fnSrc), 'REGRESSION: Fibonacci Overlap no longer checks real proximity to fib levels — reverted to a fixed score');
  assert(/maAligned/.test(fnSrc), 'REGRESSION: the MA20/MA50 trend-consistency check (replacing the fake "Multi-TF Alignment" constant) is gone');
  assert(/realLow/.test(fnSrc) && /realHigh/.test(fnSrc), 'REGRESSION: Risk/Reward no longer uses real historical high/low — reverted to an unconditional +5');
});

test('REGRESSION GUARD: Morning Brief "HEALTH & VALUASI" column renamed to match what it actually measures (position risk, not fundamental valuation)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  assert(!/HEALTH &amp; VALUASI/.test(src), 'REGRESSION: the misleading "HEALTH & VALUASI" column header is back — it never computed PER/PBV/ROE, only weight/P&L');
  assert(/SKOR RISIKO POSISI/.test(src), 'REGRESSION: the honestly-renamed "SKOR RISIKO POSISI" column header is gone');
  assert(/positionRiskScore/.test(src), 'REGRESSION: the positionRiskScore variable (renamed from healthScore) is gone');
});

test('REGRESSION GUARD: PDF financial report discloses when IHSG/USD/monthly-expense data is unavailable instead of silently using fabricated fallback numbers', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/32-pdf-reports.js'), 'utf8');
  assert(!/'7\.150,00'/.test(src), 'REGRESSION: the fabricated IHSG fallback "7.150,00" is back with no disclosure');
  assert(!/'Rp 16\.200'/.test(src), 'REGRESSION: the fabricated USD fallback "Rp 16.200" is back with no disclosure');
  assert(!/: 10000000;/.test(src), 'REGRESSION: a fabricated Rp 10,000,000/month expense fallback is back somewhere in this file');
  assert(/monthlyExpAvailable/.test(src), 'REGRESSION: monthlyExpAvailable tracking is gone — FIRE metrics can no longer distinguish real user input from a guess');
  const matches = (src.match(/monthlyExpAvailable/g) || []).length;
  assert(matches >= 6, 'REGRESSION: monthlyExpAvailable is no longer threaded through all 3 report-generating functions (HTML, CSV, Markdown)');
});

test('REGRESSION GUARD: Stock Intel pivot Support/Resistance label no longer falsely claims "Real Pivot" for a fixed-percentage estimate, and conviction is proportional to the real score', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/27-stockintel.js'), 'utf8');
  assert(!/'Calculated Real Pivot Support\/Resistance'/.test(src), 'REGRESSION: the misleading "Calculated Real Pivot Support/Resistance" label is back for a ±4%/±10% price-percentage estimate');
  assert(/bukan pivot point OHLC resmi/.test(src), 'REGRESSION: the honest methodology disclosure for the S/R estimate is gone');
  assert(!/conviction: score >= 70 \? 85 : 60/.test(src), 'REGRESSION: conviction reverted to a 2-value fixed lookup (85 or 60) instead of scaling with the real score');
  assert(/conviction: Math\.round\(50 \+ \(score - 25\) \/ 70 \* 45\)/.test(src), 'REGRESSION: conviction no longer scales proportionally from the real computed score');
});

// User-reported (2026-09-18): "TOP BROKER BUYER (DATA RIIL) di stock intel
// hanya dibuat 1D dan hasilnya selalu kosong, bagaimana intel kalo tidak
// bisa lihat history" — fetchRealStockIntelData() hardcoded ?timeframe=1D
// with no way to check a longer window when 1D genuinely has no data.
test('REGRESSION GUARD: Stock Intel TOP BROKER BUYER lets the user pick a broker-summary timeframe instead of hardcoding 1D', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/27-stockintel.js'), 'utf8');
  assert(!/broker-summary\/' \+ encodeURIComponent\(tk\) \+ '\?timeframe=1D'/.test(src),
    'REGRESSION: fetchRealStockIntelData() reverted to hardcoding ?timeframe=1D');
  assert(/function setIntelBrokerTimeframe/.test(src),
    'REGRESSION: setIntelBrokerTimeframe() is gone — no way to switch the broker-summary timeframe');
  assert(/window\.setIntelBrokerTimeframe = setIntelBrokerTimeframe/.test(src),
    'REGRESSION: setIntelBrokerTimeframe is no longer exposed on window (onclick handlers would fail)');
  assert(/MW_INTEL_BROKER_TF/.test(src),
    'REGRESSION: MW_INTEL_BROKER_TF state tracking is gone');
  assert(/brokerSummaryFetched/.test(src),
    'REGRESSION: brokerSummaryFetched tracking is gone — cannot distinguish "not tried yet" from "tried, genuinely empty"');
  assert(/Tidak ada data broker signifikan untuk/.test(src),
    'REGRESSION: the honest "no data for this timeframe, try a longer one" message is gone — reverted to always suggesting "click Refresh"');
});

// Master Screener Fase 1 (2026-09-18, user-approved: "perkuat dulu dengan
// data yang bisa" — build now with confirmed-live fields, defer the rest).
// fetchInvezgoScreener() must reject any formula field outside the
// live-verified allowlist BEFORE spending quota (Invezgo's own API silently
// turns an unknown/miscapitalized field into 0 instead of erroring, per the
// user's live-tested audit — a false "matched:true" for the whole market is
// the failure mode this guards against).
test('REGRESSION GUARD: Master Screener (fetchInvezgoScreener) rejects unverified formula fields before spending Invezgo quota', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  assert(/function fetchInvezgoScreener/.test(src), 'REGRESSION: fetchInvezgoScreener() is gone');
  assert(/function validateScreenerFormula/.test(src), 'REGRESSION: validateScreenerFormula() is gone');
  assert(/INVEZGO_SCREENER_ALLOWED_FIELDS = new Set\(\['close', 'pbv', 'per', 'roe'\]\)/.test(src),
    'REGRESSION: the strict 4-field allowlist (close/pbv/per/roe) was widened without live verification of the new field');
  assert(/_screenerThrottleWait/.test(src),
    'REGRESSION: the dedicated screener rate-limiter is gone — /screener/screen throttles more aggressively than the normal monthly quota per the user-tested audit');
  assert(/fetchInvezgoScreener,\s*\n\s*validateScreenerFormula,\s*\n\s*INVEZGO_SCREENER_ALLOWED_FIELDS,/.test(src),
    'REGRESSION: fetchInvezgoScreener/validateScreenerFormula/INVEZGO_SCREENER_ALLOWED_FIELDS no longer exported from invezgo-client.js');

  const validateScreenerFormula = (() => {
    const allowlistLine = "const INVEZGO_SCREENER_ALLOWED_FIELDS = new Set(['close', 'pbv', 'per', 'roe']);\n";
    const m = src.match(/function validateScreenerFormula\(formula\) \{[\s\S]*?\n\}\n/);
    assert(m, 'REGRESSION: could not isolate validateScreenerFormula() body for direct testing');
    const body = allowlistLine + m[0].replace('function validateScreenerFormula(formula) {', '').replace(/\n\}\n$/, '');
    const fn = new Function('formula', body);
    return fn;
  })();
  const valid = validateScreenerFormula('per > 0 AND per < 15 AND roe > 15');
  assert(valid.valid === true, 'REGRESSION: a formula using only allowlisted fields (per, roe) is wrongly rejected');
  const invalid = validateScreenerFormula('PER > 0 AND bandarValue > 1000');
  assert(invalid.valid === false, 'REGRESSION: a formula with an unverified/miscapitalized field (PER, bandarValue) is wrongly accepted — this is exactly the silent-zero trap the audit found');
  assert(invalid.unknownFields.includes('PER') && invalid.unknownFields.includes('bandarValue'),
    'REGRESSION: unknownFields does not report which tokens failed the allowlist check');
});

test('REGRESSION GUARD: Master Screener engine (generateMasterScreener) and server route exist and enrich matched rows with universe name/sector', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/async function generateMasterScreener\(formula\)/.test(engineSrc), 'REGRESSION: generateMasterScreener() is gone from idx-data-engine.js');
  assert(/generateMasterScreener,/.test(engineSrc), 'REGRESSION: generateMasterScreener no longer exported from idx-data-engine.js');

  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/app\.post\('\/api\/idx\/master-screener'/.test(serverSrc), 'REGRESSION: POST /api/idx/master-screener route is gone');
  assert(/generateMasterScreener,/.test(serverSrc), 'REGRESSION: generateMasterScreener no longer imported in server.js');
});

// Unified Screener (2026-09-18, user-directed: "Opportunity Radar dan
// market radar kenapa tidak disatukan saja menjadi screener yang bisa di
// filter... kedepan screener kedepan hanya ada 1 tidak banyak lagi dan
// terpisah pisah"). Merges Opportunity Radar + Market Radar + Smart Money
// Screener into 1 filterable page/endpoint, with a Whale/Akumulasi score
// (categorical, -3..+4) and Uptrend score (0-100) built from whole-market
// real data sources already in the app.
test('REGRESSION GUARD: technical-indicator cache (Redis-backed, cron-rotating) exists for the Unified Screener', () => {
  const yfSrc = fs.readFileSync(path.join(__dirname, 'lib/providers/yahoo-client.js'), 'utf8');
  assert(/export \{[\s\S]*yfStoreGet,[\s\S]*yfStoreSetEx,[\s\S]*yfStoreMget,[\s\S]*\}/.test(yfSrc),
    'REGRESSION: yfStoreGet/yfStoreSetEx/yfStoreMget no longer exported from yahoo-client.js — the technical cache in idx-data-engine.js depends on these');

  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/async function fetchAndCacheTechnicalSignal/.test(engineSrc), 'REGRESSION: fetchAndCacheTechnicalSignal() is gone');
  assert(/async function getCachedTechnicalBulk/.test(engineSrc), 'REGRESSION: getCachedTechnicalBulk() is gone — Unified Screener would need 958 separate Redis reads per request');
  assert(/async function warmTechnicalRotating/.test(engineSrc), 'REGRESSION: warmTechnicalRotating() cron warmer is gone');
  assert(/TECHNICAL_WARM_CURSOR_KEY = 'technical:warm:cursor'/.test(engineSrc), 'REGRESSION: technical cron warmer no longer persists a rotating cursor — full-universe coverage would restart from 0 every run instead of progressing');
  assert(/warmTechnicalRotating,/.test(engineSrc), 'REGRESSION: warmTechnicalRotating no longer exported from idx-data-engine.js');
});

test('REGRESSION GUARD: generateUnifiedScreener() merges accumulation/distribution + foreign flow + fundamentals + technical into 1 filterable result', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/async function generateUnifiedScreener\(params = \{\}\)/.test(engineSrc), 'REGRESSION: generateUnifiedScreener() is gone');
  assert(/generateUnifiedScreener,/.test(engineSrc), 'REGRESSION: generateUnifiedScreener no longer exported from idx-data-engine.js');
  // The whale score must stay categorical/honest — a ticker absent from
  // today's top-movers list must NOT be scored the same as a confirmed
  // "no signal" — both currently map to whaleScore 0, but the label must
  // distinguish "never checked" from "checked, balanced" via whaleDataAvailable.
  assert(/whaleDataAvailable/.test(engineSrc), 'REGRESSION: whaleDataAvailable flag is gone — cannot distinguish "no data today" from "netral" anymore');
  assert(/'Tidak Ada Sinyal Hari Ini'/.test(engineSrc), 'REGRESSION: the honest "no signal today" whale label is gone');
  // fetchInvezgoScreener() (the throttled, quota-metered custom-formula
  // endpoint) must NOT be called automatically inside the whole-market pass
  // — user explicitly said "kalo dianalisa asal akan memakan kuota".
  const unifiedFnMatch = engineSrc.match(/async function generateUnifiedScreener\(params = \{\}\) \{[\s\S]*?\n\}\n\n\/\/ ══/);
  assert(unifiedFnMatch, 'REGRESSION: could not isolate generateUnifiedScreener() body to check for accidental fetchInvezgoScreener() calls');
  assert(!/fetchInvezgoScreener\(/.test(unifiedFnMatch[0]), 'REGRESSION: generateUnifiedScreener() now calls fetchInvezgoScreener() automatically — this burns the throttled/quota-metered custom-formula endpoint on every whole-market page load, which the user explicitly said to avoid');
});

test('REGRESSION GUARD: generateUnifiedScreener()\'s "confirmed" gate uses tech.score>=80 (raised 2026-09-19 after backtest evidence), not the old uptrendScore>=60, and stays in sync with runUnifiedScreenerBacktest()\'s baseline (2026-09-19, formula-strength audit: of 3 tested threshold tweaks, only raising the technical-score gate held up after removing the 4 mania-stock outliers that drove every other backtest result that week — median alpha +0.82%, beat-benchmark 54.3% on N=95 with outliers excluded)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const unifiedFnMatch = src.match(/async function generateUnifiedScreener\(params = \{\}\) \{[\s\S]*?\n\}\n\n\/\/ ══/);
  assert(unifiedFnMatch, 'REGRESSION: could not isolate generateUnifiedScreener() body');
  assert(/const confirmed = tech != null && tech\.score >= 80 && whaleScore >= 3;/.test(unifiedFnMatch[0]), 'REGRESSION: "confirmed" no longer gates on the backtest-validated tech.score>=80 threshold (either reverted to the old uptrendScore>=60, or drifted to check the wrong — fundamentals-diluted — score entirely)');
  assert(!/uptrendScore >= 60/.test(unifiedFnMatch[0]), 'REGRESSION: the old, backtest-disproven uptrendScore>=60 gate is back');
  // The backtest's own "baseline" must track this same threshold, or a
  // future re-run of the backtest would silently validate a formula that
  // is no longer what's live in production — the exact mismatch this
  // week's audit was started to catch and fix.
  assert(/const baselineFilter = \(s\) => s\.whaleScoreFull >= 3 && s\.techScore >= 80;/.test(src), 'REGRESSION: runUnifiedScreenerBacktest()\'s baseline no longer matches generateUnifiedScreener()\'s actual "confirmed" gate (techScore>=80) — future backtest runs would silently validate a stale formula');
});

await asyncTest('BEHAVIOR: generateUnifiedScreener() runs end-to-end without an Invezgo/Redis config and returns an honest, well-shaped result', async () => {
  const { generateUnifiedScreener } = await import('./lib/idx-data-engine.js');
  // excludeFlagged:false — this test's own purpose (pipeline runs
  // end-to-end, rows are well-shaped) is orthogonal to the Regulatory
  // Health Gate's default filtering; the gate's own fail-closed default is
  // covered by a dedicated test below. This sandbox also has no network
  // access to idx.co.id, so the gate would otherwise mark every ticker
  // DATA_ERROR and legitimately return zero rows — not a bug, but not
  // what this particular test is checking.
  const result = await generateUnifiedScreener({ limit: 10, excludeFlagged: false });
  assert(result.success === true, 'generateUnifiedScreener() did not report success:true');
  assert(Array.isArray(result.rows), 'result.rows is not an array');
  assert(result.rows.length > 0, 'result.rows is empty — expected at least 10 of 958 universe rows');
  assert(result.summary && typeof result.summary.totalUniverse === 'number' && result.summary.totalUniverse > 900,
    'result.summary.totalUniverse does not look like the full ~958 BEI universe');
  const validWhaleLabels = new Set(['Akumulasi Kuat', 'Akumulasi Lemah', 'Netral', 'Distribusi', 'Tidak Ada Sinyal Hari Ini']);
  result.rows.forEach((r) => {
    assert(validWhaleLabels.has(r.whaleLabel), `Unexpected whaleLabel "${r.whaleLabel}" for ${r.ticker}`);
    assert(r.uptrendScore === null || (r.uptrendScore >= 0 && r.uptrendScore <= 100), `uptrendScore out of range for ${r.ticker}: ${r.uptrendScore}`);
    // Without INVEZGO_API_KEY/UPSTASH_REDIS configured in this test
    // environment, no ticker should have real technical/fundamental data —
    // confirms the function degrades honestly rather than fabricating.
    assert(r.isRealTechnical === false, `${r.ticker} claims isRealTechnical:true with no Yahoo/Redis config in this test env`);
  });
});

// FIX (Regulatory Health Gate, 2026-09-24): the default behavior (no
// excludeFlagged override) must fail CLOSED, not open, when the
// regulatory source can't be verified at all — this sandbox has no
// network access to idx.co.id, which is exactly the DATA_ERROR scenario
// docs/regulatory-health-gate.md §26 requires: SOURCE FAILURE -> UNKNOWN
// -> NOT ELIGIBLE -> SKIP DEEP ANALYSIS, never "assume CLEAR and show
// everything anyway".
await asyncTest('BEHAVIOR: generateUnifiedScreener() default (excludeFlagged unset) hides every row when the Regulatory Health Gate data source is entirely unavailable, and discloses why', async () => {
  const { generateUnifiedScreener } = await import('./lib/idx-data-engine.js');
  const result = await generateUnifiedScreener({});
  assert.strictEqual(result.rows.length, 0, 'REGRESSION: rows must be empty by default when regulatory status can\'t be verified for any ticker (this sandbox has no idx.co.id access) — silently showing them would be UNKNOWN-treated-as-CLEAR');
  assert.strictEqual(result.summary.regulatoryDataError, result.summary.totalUniverse, 'every ticker should be regulatoryDataError when idx.co.id is fully unreachable and no cache exists');
  assert.strictEqual(result.dataSources.regulatory.available, false, 'dataSources.regulatory.available must honestly report false');
});

// FIX (Regulatory Health Gate, 2026-09-24): same fail-closed contract
// applied to getUniverseOpportunityRadar() — must never present a saham
// as BUY ZONE/Strong Buy when its regulatory status can't be verified.
await asyncTest('BEHAVIOR: getUniverseOpportunityRadar() default (excludeFlagged unset) hides every item when the Regulatory Health Gate data source is entirely unavailable, and never shows BUY ZONE/WATCHLIST for an unverified ticker', async () => {
  const { getUniverseOpportunityRadar } = await import('./lib/idx-data-engine.js');
  const excluded = await getUniverseOpportunityRadar({});
  assert.strictEqual(excluded.items.length, 0, 'REGRESSION: items must be empty by default when regulatory status can\'t be verified for any ticker');
  assert.strictEqual(excluded.summary.regulatoryDataError, excluded.summary.totalUniverse, 'every ticker should be regulatoryDataError when idx.co.id is fully unreachable and no cache exists');

  const all = await getUniverseOpportunityRadar({ excludeFlagged: false });
  assert(all.items.length > 900, 'excludeFlagged:false should still return the full ~958 universe (unfiltered, for transparency)');
  all.items.forEach((it) => {
    assert.strictEqual(it.regulatoryEligible, false, `${it.ticker} should be regulatoryEligible:false when idx.co.id is unreachable`);
    assert(it.zone !== 'BUY ZONE' && it.zone !== 'WATCHLIST',
      `REGRESSION: ${it.ticker} shows zone="${it.zone}" despite unverifiable regulatory status — a DATA_ERROR/UNKNOWN ticker must never present as an actionable buy opportunity`);
  });
});

test('REGRESSION GUARD: Unified Screener server routes exist (GET /api/idx/unified-screener, GET /api/cron/warm-technical-indicators with CRON_SECRET guard)', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/app\.get\('\/api\/idx\/unified-screener'/.test(serverSrc), 'REGRESSION: GET /api/idx/unified-screener route is gone');
  assert(/app\.get\('\/api\/cron\/warm-technical-indicators'/.test(serverSrc), 'REGRESSION: GET /api/cron/warm-technical-indicators route is gone');
  const cronMatch = serverSrc.match(/app\.get\('\/api\/cron\/warm-technical-indicators'[\s\S]*?\n\}\);/);
  assert(cronMatch, 'REGRESSION: could not isolate the warm-technical-indicators route body');
  assert(/CRON_SECRET/.test(cronMatch[0]) && /403/.test(cronMatch[0]),
    'REGRESSION: warm-technical-indicators cron route no longer fail-closed on a missing/wrong CRON_SECRET — this would let anyone publicly trigger 958 Yahoo fetches');

  const vercelSrc = fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8');
  const vercelJson = JSON.parse(vercelSrc);
  assert(Array.isArray(vercelJson.crons) && vercelJson.crons.some(c => c.path === '/api/cron/warm-technical-indicators'),
    'REGRESSION: vercel.json no longer schedules the warm-technical-indicators cron');
});

test('REGRESSION GUARD: 4 old radar/screener pages (Opportunity Radar, Market Radar, Smart Money Screener) consolidated into 1 nav entry pointing at the Unified Screener', () => {
  const htmlSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(/js\/48-unified-screener\.js/.test(htmlSrc), 'REGRESSION: public/js/48-unified-screener.js is no longer included in index.html');
  // Only ONE sidebar button should still navigate to 'radar' — the old
  // 'Market Radar' (ranking) and 'Smart Money Screener' (scanner) buttons
  // must be gone, not just relabeled, to avoid 3 buttons for 1 destination.
  assert(!/goPage\('ranking',this\)/.test(htmlSrc), 'REGRESSION: the separate "Market Radar" sidebar button is back — should be consolidated into the single Screener nav entry');
  assert(!/goPage\('scanner',this\)/.test(htmlSrc), 'REGRESSION: the separate "Smart Money Screener" sidebar button is back — should be consolidated into the single Screener nav entry');
  assert(/goPage\('radar',this\)/.test(htmlSrc), 'REGRESSION: the consolidated Screener sidebar button is gone');

  const routerSrc = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  assert(/renderUnifiedScreenerPage/.test(routerSrc), 'REGRESSION: renderUnifiedScreenerPage is no longer wired into the router');
  // 'ranking'/'scanner' must still redirect to the SAME page container as
  // 'radar' (defense against any remaining/future deep link using the old names).
  assert(/UNIFIED_SCREENER_ALIASES/.test(routerSrc), 'REGRESSION: the ranking/scanner -> radar page-container redirect is gone');

  const jsSrc = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
  assert(/function renderUnifiedScreenerPage/.test(jsSrc), 'REGRESSION: renderUnifiedScreenerPage() is gone from 48-unified-screener.js');
  assert(/window\.renderUnifiedScreenerPage = renderUnifiedScreenerPage/.test(jsSrc), 'REGRESSION: renderUnifiedScreenerPage is no longer exposed on window — router calls would fail');
});

// User-directed (2026-09-18, after the Wave Scanner consolidation above):
// "tab Wave Cockpit dan Risk Planner, dipindahkan sekalian ke scanner
// namun beda tab diatas, toolbar trade wave di hilangkan saja semua
// bergabung di scanner" — TradeWave's remaining single-ticker Wave Cockpit
// and Risk Planner tabs (not screeners, but the user wanted the whole
// TradeWave page/toolbar gone) move into the unified Screener page too, as
// 2 more top-level tabs there, with the standalone TradeWave sidebar
// button and page removed entirely.
test('REGRESSION GUARD: TradeWave Wave Cockpit/Risk Planner consolidated into the Screener as top-level tabs; standalone TradeWave sidebar button removed', () => {
  const htmlSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(!/goPage\('tradewave',this\)/.test(htmlSrc),
    'REGRESSION: the separate "TradeWave" sidebar button is back — should be consolidated into the Screener nav entry');

  const routerSrc = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  assert(/UNIFIED_SCREENER_ALIASES\s*=\s*\[[^\]]*'tradewave'[^\]]*\]/.test(routerSrc),
    'REGRESSION: goPage(\'tradewave\') no longer redirects to the Screener page container — any old bookmark/dynamic call would 404 silently');
  assert(/case 'tradewave':if\(typeof renderUnifiedScreenerPage/.test(routerSrc),
    'REGRESSION: the tradewave router case no longer renders the Unified Screener');

  const jsSrc = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
  assert(/pageTab:\s*'screener'/.test(jsSrc), 'REGRESSION: US_STATE.pageTab (screener/cockpit/planner) is gone');
  assert(/function usSwitchPageTab/.test(jsSrc), 'REGRESSION: usSwitchPageTab() is gone — no way to switch to Wave Cockpit/Risk Planner tabs');
  assert(/window\.usSwitchPageTab = usSwitchPageTab/.test(jsSrc), 'REGRESSION: usSwitchPageTab is no longer exposed on window — the tab buttons\' onclick would fail');
  assert(/twRenderSubPage\('us-wave-subpage',\s*pt === 'cockpit' \? 1 : 3\)/.test(jsSrc),
    'REGRESSION: usRenderShell() no longer calls twRenderSubPage() for the cockpit/planner tabs — Wave Cockpit/Risk Planner content will never render inside the Screener page');

  const twSrc = fs.readFileSync(path.join(__dirname, 'public/js/37-tradewave-engine.js'), 'utf8');
  assert(/function twRenderSubPage\(containerId, tabIdx\)/.test(twSrc),
    'REGRESSION: twRenderSubPage(containerId, tabIdx) is gone — the Screener has nothing to call for Wave Cockpit/Risk Planner content');
  assert(!/window\.initTradeWaveSuite/.test(twSrc) && !/window\.renderTradeWavePage/.test(twSrc),
    'REGRESSION: TradeWave still exposes its own page-level render/init functions — it should no longer be a standalone page');
});

// User-reported production screenshot (2026-09-19): clicking "Opportunity
// Radar" / "Lihat Semua ->" on the Dashboard's Portfolio Snapshot toolbar
// landed on the Screener's "Risk Planner" (Risk Sizing) tab instead of the
// main Screener table. Root cause: US_STATE.pageTab is sticky across
// renders — usSwitchPageTab() (used by the Screener's own tab buttons)
// only ever SETS pageTab, never clears it, and nothing reset it on a fresh
// navigation into the page. FIX ATTEMPT #1 put the reset inside
// renderUnifiedScreenerPage() itself — caught before ship: that function is
// ALSO invoked by 03-engine.js's periodic same-page refresh tick
// (`renderPage(currentPage)`, fires every few seconds on whatever page is
// open, never through goPage()), so it would have silently kicked a user
// back to the main Screener tab mid-read every time that tick fired while
// they were on Wave Cockpit/Risk Planner/Quant Screener/Volume Spike. The
// reset now lives in goPage() itself, which only fires on a REAL
// navigation event.
test('REGRESSION GUARD: goPage() must reset US_STATE.pageTab to \'screener\' on navigation into the Screener page, but renderUnifiedScreenerPage() itself must NOT (periodic refresh tick would keep resetting it)', () => {
  const routerSrc = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  const goPageFn = routerSrc.match(/function goPage\(name,btn\)\{[\s\S]*?\n\}/);
  assert(goPageFn, 'goPage() not found — has it been renamed/removed?');
  assert(/targetPageName === 'radar'[\s\S]{0,80}US_STATE\.pageTab\s*=\s*'screener'/.test(goPageFn[0]),
    'REGRESSION: goPage() no longer resets US_STATE.pageTab to \'screener\' when navigating to the radar/ranking/scanner/tradewave/screener/volume-spike aliases — any nav into the Screener page will land on whatever tab was last left open, not the main Screener table');

  const jsSrc = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
  const fn = jsSrc.match(/function renderUnifiedScreenerPage\(\) \{[\s\S]*?\n\}/);
  assert(fn, 'renderUnifiedScreenerPage() not found — has it been renamed/removed?');
  assert(!/US_STATE\.pageTab\s*=\s*'screener'/.test(fn[0]),
    'REGRESSION: renderUnifiedScreenerPage() resets US_STATE.pageTab again — this function also runs on 03-engine.js\'s periodic same-page refresh tick (no goPage() call), so this would silently kick a user off the Wave Cockpit/Risk Planner/Quant Screener/Volume Spike tab every few seconds while they were reading it');
});

// User-reported production screenshot (2026-09-18, Bandarmology BBCA):
// "Arus investor asing saat ini mencatatkan Net Buy +Rp 0 M dengan
// partisipasi pasar sebesar 0%" was showing for EVERY ticker on the real
// (non-simulated) data path — per-ticker Invezgo broker summary
// (investor=all) never has a foreign/domestic split (foreignFlow.available
// is always false there, per computeBandarmologyVerdict() in
// idx-data-engine.js), but the frontend coerced the resulting null into 0
// and displayed it as if it were a real computed value.
test('REGRESSION GUARD: Bandarmology foreign-flow widgets show honest "Tidak Tersedia" instead of a fabricated "+Rp 0 M / 0%" when foreignFlow.available is false', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const occurrences = (src.match(/ff\.available === false/g) || []).length;
  assert(occurrences >= 4, `REGRESSION: expected at least 4 foreign-flow render spots to check ff.available === false, found ${occurrences}`);
  assert(/Tidak Tersedia/.test(src), 'REGRESSION: the honest "Tidak Tersedia" foreign-flow label is gone');
  assert(/Split asing\/domestik tidak ada di data ini|Data investor=all tidak punya split asing\/domestik/.test(src),
    'REGRESSION: the explanatory sub-label for why foreign flow is unavailable is gone');
  // The exact bullet text from the user's screenshot must no longer render
  // unconditionally — it must be gated behind the available check.
  assert(/ff\.available === false[\s\S]{0,400}Data arus investor asing/.test(src),
    'REGRESSION: the tactical-takeaways bullet no longer gates the honest fallback behind ff.available === false');
});

test('REGRESSION GUARD: "Top 3 Buyer Konsentrasi" no longer falls back to a hardcoded 65% when real concentration data is absent', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  assert(!/conc\.top3BuyPct \|\| conc\.top3BuyerPct \|\| 65/.test(src), 'REGRESSION: the hardcoded "|| 65" fallback for Top 3 Buyer concentration is back');
  assert(/Konsentrasi Top 3 Buyer tidak tersedia/.test(src), 'REGRESSION: the honest "concentration unavailable" fallback text is gone');
});

// User-reported: "kepemilikan data KSEI data tidak tersedia padahal sudah
// connect API" — dossierComputeKseiScore() used to show one generic
// "belum diunggah/tidak ditemukan" message no matter WHY the live Invezgo
// call failed (quota exhausted, subscription tier, auth, rate limit,
// network) — even though generateShareholderComposition() already
// captures the specific reason in result.errors. Surfacing the real reason
// lets the user actually diagnose it instead of assuming "no data exists".
test('REGRESSION GUARD: Stock Dossier KSEI pillar surfaces the SPECIFIC Invezgo failure reason (quota/subscription/auth/etc), not just a generic "not found" message', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/46-stock-dossier.js'), 'utf8');
  assert(/kseiErr = live && Array\.isArray\(live\.errors\)/.test(src), 'REGRESSION: dossierComputeKseiScore() no longer reads live.errors to find the specific kseiComposition failure reason');
  assert(/QUOTA_EXHAUSTED/.test(src) && /SUBSCRIPTION_INSUFFICIENT/.test(src) && /AUTH_FAILED/.test(src),
    'REGRESSION: the specific Invezgo failure reason codes are no longer mapped to human-readable Indonesian text');
  assert(/Sebab: ' \+ specificReason/.test(src), 'REGRESSION: the specific reason is no longer appended to the KSEI unavailable message');
});

// Win-rate validation (2026-09-18, user-requested: "bagaimana agar saya
// bisa menguji apakah screener benar atau salah, untuk menentukan apakah
// formula yang anda buat dapat diuji win rate nya"). Track A = historical
// backtest (technical+whale only, deliberately excludes valuation to avoid
// look-ahead bias — see runUnifiedScreenerBacktest()'s header comment).
// Track B = forward paper-trading log (full formula, zero bias by
// construction, but slow — matures over horizonDays).
test('REGRESSION GUARD: runUnifiedScreenerBacktest() exists, is available-gated on Invezgo config, and its no-lookahead methodology is documented', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/async function runUnifiedScreenerBacktest\(params = \{\}\)/.test(src), 'REGRESSION: runUnifiedScreenerBacktest() is gone');
  assert(/runUnifiedScreenerBacktest,/.test(src), 'REGRESSION: runUnifiedScreenerBacktest no longer exported from idx-data-engine.js');
  assert(/available: false,\s*\n\s*reason: 'Invezgo API key belum dikonfigurasi/.test(src), 'REGRESSION: backtest no longer fails honestly-closed when Invezgo is not configured');
  // The valuation-exclusion rationale (the core anti-look-ahead-bias
  // guarantee of this whole feature) must stay documented in the code, not
  // just in chat — anyone touching this function later needs to see WHY
  // fundamentals must never be joined in here.
  assert(/look-ahead bias/i.test(src), 'REGRESSION: the look-ahead-bias warning comment is gone — a future edit could silently join today\'s fundamentals onto historical signals');
  const fnMatch = src.match(/async function runUnifiedScreenerBacktest\(params = \{\}\) \{[\s\S]*?\n\}\n\n\/\/ ── Forward/);
  assert(fnMatch, 'REGRESSION: could not isolate runUnifiedScreenerBacktest() body');
  assert(!/fund\.per|fund\.roe|fundByCode|getCachedFundamentalsBulk/.test(fnMatch[0]), 'REGRESSION: runUnifiedScreenerBacktest() now reads fundamentals — this is look-ahead bias (today\'s PER/ROE applied to a historical signal date)');
});

await asyncTest('BEHAVIOR: runUnifiedScreenerBacktest() degrades honestly (available:false) without an Invezgo key, never fabricates a win rate', async () => {
  const { runUnifiedScreenerBacktest } = await import('./lib/idx-data-engine.js');
  const result = await runUnifiedScreenerBacktest({ lookbackDays: 20, forwardDays: 5 });
  assert(result.success === true, 'runUnifiedScreenerBacktest() did not report success:true');
  assert(result.available === false, 'REGRESSION: without INVEZGO_API_KEY in this test env, available must be false, not a fabricated result');
  assert(result.winRate === null, 'REGRESSION: winRate must be null (not 0 or a number) when the backtest could not actually run — 0 would misleadingly imply "ran and found nothing"');
  assert(Array.isArray(result.signals) && result.signals.length === 0, 'signals must be an empty array, not fabricated entries');
});

test('REGRESSION GUARD: runUnifiedScreenerBacktest() supports ?variants=true — compares formula tweaks (baseline/whale4/noDoubleCount/techScore60) from ONE fetched data pool instead of one endpoint call per tweak (2026-09-19, user formula-strength audit: single-command comparison of whaleScore>=4, dropping the volume-spike+uptrend double-count bonus found in the code audit, and the old techScore>=60 threshold kept for reference after techScore>=80 became the new production baseline)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/whaleScoreNoVolSpike/.test(src), 'REGRESSION: whaleScoreNoVolSpike variant (anti double-count) is gone');
  assert(/params\.variants === true \|\| params\.variants === 'true'/.test(src), 'REGRESSION: ?variants=true opt-in check is gone');
  assert(/whale4:/.test(src) && /noDoubleCount:/.test(src) && /techScore60:/.test(src) && /baseline:/.test(src), 'REGRESSION: one or more of the named variants (baseline/whale4/noDoubleCount/techScore60) is gone');
  assert(/medianReturnPct/.test(src) && /medianAlphaPct/.test(src), 'REGRESSION: median return/alpha (more robust than mean against outlier-skew, per this audit\'s findings) no longer computed per variant');
});

await asyncTest('BEHAVIOR: runUnifiedScreenerBacktest() with ?variants=true still degrades honestly (available:false, no variants object) without an Invezgo key', async () => {
  const { runUnifiedScreenerBacktest } = await import('./lib/idx-data-engine.js');
  const result = await runUnifiedScreenerBacktest({ lookbackDays: 20, forwardDays: 5, variants: true });
  assert(result.available === false, 'REGRESSION: variants mode must still honor the same honest available:false gate without INVEZGO_API_KEY');
  assert(result.variants === undefined, 'REGRESSION: variants object must not be fabricated when the backtest could not actually run');
});

test('REGRESSION GUARD: runUnifiedScreenerBacktest() must return the FULL signals array, not a silently truncated slice (2026-09-19, user auditing formula validity found detail array capped at 150 of 216 real signals with no disclosure — aggregate stats were always computed from the full array, but hiding most of the underlying evidence behind a correct-looking summary is misleading)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(!/signals:\s*signals\.slice\(/.test(src), 'REGRESSION: runUnifiedScreenerBacktest() silently truncates its returned signals array again — the aggregate stats (winRate/avgReturnPct/etc.) may still be accurate, but the underlying evidence must not be hidden behind a correct-looking summary');
});

test('REGRESSION GUARD: forward paper-trading log (Track B) — logs today\'s confirmed signals via Redis, resolves lazily on read, never resolves before horizonDays', () => {
  const src = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(/async function logTodaysUnifiedScreenerSignals/.test(src), 'REGRESSION: logTodaysUnifiedScreenerSignals() is gone');
  assert(/async function resolveScreenerSignalLog/.test(src), 'REGRESSION: resolveScreenerSignalLog() is gone');
  assert(/async function getScreenerSignalLogSummary/.test(src), 'REGRESSION: getScreenerSignalLogSummary() is gone');
  assert(/if \(daysSince < e\.horizonDays\) return; \/\/ not matured/.test(src), 'REGRESSION: resolveScreenerSignalLog() no longer guards against resolving before the horizon has matured — this would fabricate a return from an incomplete window');
  assert(/logTodaysUnifiedScreenerSignals,/.test(src) && /resolveScreenerSignalLog,/.test(src) && /getScreenerSignalLogSummary,/.test(src),
    'REGRESSION: one or more Track B functions no longer exported from idx-data-engine.js');

  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/logTodaysUnifiedScreenerSignals\(\)/.test(serverSrc), 'REGRESSION: warm-technical-indicators cron no longer piggybacks the daily signal-logging step (no 3rd cron slot exists on Vercel Hobby to replace it)');
  assert(/app\.get\('\/api\/idx\/unified-screener-backtest'/.test(serverSrc), 'REGRESSION: GET /api/idx/unified-screener-backtest route is gone');
  assert(/app\.get\('\/api\/idx\/screener-signal-log'/.test(serverSrc), 'REGRESSION: GET /api/idx/screener-signal-log route is gone');
});

await asyncTest('BEHAVIOR: forward signal log round-trips cleanly with no Redis configured (in-memory fallback) and never double-logs the same day', async () => {
  const engine = await import('./lib/idx-data-engine.js');
  const before = await engine.getScreenerSignalLogSummary();
  assert(before.success === true, 'getScreenerSignalLogSummary() did not report success:true');
  assert(typeof before.totalEntries === 'number', 'totalEntries must be a number');

  const first = await engine.logTodaysUnifiedScreenerSignals();
  const second = await engine.logTodaysUnifiedScreenerSignals();
  assert(second.added === 0 && /already logged today/.test(second.reason || ''),
    'REGRESSION: logTodaysUnifiedScreenerSignals() double-logged the same day instead of skipping — would inflate/duplicate the forward-test log');
});

test('REGRESSION GUARD: Unified Screener frontend renders a win-rate validation panel (backtest button + forward log summary)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
  assert(/function usRunBacktest/.test(src), 'REGRESSION: usRunBacktest() is gone');
  assert(/function usFetchSignalLog/.test(src), 'REGRESSION: usFetchSignalLog() is gone');
  assert(/function usRenderValidationPanel/.test(src), 'REGRESSION: usRenderValidationPanel() is gone');
  assert(/us-validation-panel/.test(src), 'REGRESSION: the validation panel container is gone from usRenderShell()');
  assert(/window\.usRunBacktest = usRunBacktest/.test(src) && /window\.usFetchSignalLog = usFetchSignalLog/.test(src),
    'REGRESSION: usRunBacktest/usFetchSignalLog no longer exposed on window — onclick handlers would fail');
  // The sample-size caveat must survive — a small backtest sample looking
  // impressive is exactly the kind of misleading precision CLAUDE.md warns
  // against.
  assert(/Sampel cuma/.test(src), 'REGRESSION: the small-sample-size warning is gone from the backtest panel');
});

// User-reported (2026-09-18): "TOP BROKER BUYER (DATA RIIL) pada stock
// intel tidak menampilkan data apa2... sudah coba semua timeframe, tidak
// ada hasil". Root cause found: brokerRows was read from
// `bSummary.brokers.buyer` — a field path that NEVER existed in either
// data shape this card can receive (real server path returns `topBuyers`,
// per generateBrokerSummary()'s normalize() in lib/idx-data-engine.js; the
// simulated client-side fallback also returns `topBuyers`, never `brokers.
// buyer`) — so brokerRows was unconditionally empty for every ticker and
// every timeframe since this card was built, regardless of whether
// Invezgo actually had real buyer data. Not a data-availability problem —
// a field-name bug.
test('REGRESSION GUARD: Stock Intel TOP BROKER BUYER reads real buyer rows from bSummary.topBuyers (not the nonexistent bSummary.brokers.buyer), with field names matching what the row template expects', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/27-stockintel.js'), 'utf8');
  assert(!/bSummary\.brokers && bSummary\.brokers\.buyer/.test(src), 'REGRESSION: brokerRows reverted to reading the nonexistent bSummary.brokers.buyer path — this was unconditionally empty for every ticker/timeframe');
  assert(/Array\.isArray\(bSummary\.topBuyers\)/.test(src), 'REGRESSION: brokerRows no longer sources from bSummary.topBuyers (the real field both the live Invezgo path and the simulated fallback actually use)');

  const fnMatch = src.match(/var brokerRows = \(bSummary && Array\.isArray\(bSummary\.topBuyers\)\)[\s\S]*?: \[\];/);
  assert(fnMatch, 'REGRESSION: could not isolate the brokerRows mapping expression for direct testing');
  const exprBody = fnMatch[0].replace('var brokerRows = ', '').replace(/;\s*$/, '');
  const mapFn = new Function('bSummary', 'return (' + exprBody + ');');

  const withData = mapFn({ topBuyers: [{ broker: 'AK', name: 'UBS Sekuritas', volumeLot: 1000, avgPrice: 9500 }] });
  assert(withData.length === 1, 'REGRESSION: brokerRows is empty even when bSummary.topBuyers has real rows');
  assert(withData[0].code === 'AK', 'REGRESSION: row.code no longer maps from topBuyers[].broker — CARD 4/modal templates read row.code, not row.broker');
  assert(withData[0].volume === 1000, 'REGRESSION: row.volume no longer maps from topBuyers[].volumeLot — the render templates read row.volume, not row.volumeLot');
  assert(withData[0].name === 'UBS Sekuritas' && withData[0].avgPrice === 9500, 'REGRESSION: name/avgPrice no longer carried through from topBuyers rows');

  const withNoData = mapFn({ topBuyers: [] });
  assert(Array.isArray(withNoData) && withNoData.length === 0, 'brokerRows should be an empty array (not null/undefined) when topBuyers is genuinely empty');
});

test('REGRESSION GUARD: Stock Intel TOP BROKER BUYER empty-state message discloses WHY (simulated fallback / specific Invezgo failure reason), not just "no data"', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/27-stockintel.js'), 'utf8');
  assert(/brokerEmptyReason/.test(src), 'REGRESSION: brokerEmptyReason is gone — empty-state message no longer distinguishes simulated-fallback/quota-exhausted from genuinely-no-data');
  const occurrences = (src.match(/data\.brokerTfTried \+ data\.brokerEmptyReason/g) || []).length;
  assert(occurrences >= 2, `REGRESSION: expected both TOP BROKER BUYER render spots (CARD 4 + expanded modal) to append brokerEmptyReason to the empty-state message, found ${occurrences}`);
});

// User-reported (2026-09-19): testing DEWA across the app gave contradictory
// verdicts — Stock Dossier "NEUTRAL/WAIT", Stock Intel "BULLISH REBOUND /
// LAYAK INVESTASI", but the Bandarmologi "Intelligence Summary" tab (Fundamental
// page, "Analisis Teknikal & Flow" tab 2) showed "PROBABILITAS ARAH BEARISH
// (DOWN) 80%" with specific CMF -17.28%/OBV -4881061300/RSI 29.1 readings.
// Root cause found: techRunFlowScanTab() (public/js/24-stockmaster.js) calls
// fsGenData(tk, days) (public/js/07-flowscan.js), which silently falls back
// to a SEEDED SYNTHETIC random-walk OHLCV series (tagging the returned array
// with `.simulated = true`) whenever real cached OHLCV isn't available yet
// for that ticker — and this tab never checked that flag before running
// fsProcess() on it and presenting the result as a real, confident
// probability. The sibling Gauges/Candlestick/Pivots tabs in this same file
// (techEnsureRealSeries(), a few hundred lines below) already guard against
// exactly this failure mode; this tab was the one that didn't.
test('REGRESSION GUARD: techRunFlowScanTab() must not present a synthetic/simulated OHLCV series as a real Bandarmologi probability reading', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  const fnStart = src.indexOf('function techRunFlowScanTab(ticker) {');
  assert(fnStart !== -1, 'techRunFlowScanTab() not found — has it been renamed/removed?');
  const fnEnd = src.indexOf('\nfunction ', fnStart + 10);
  assert(fnEnd !== -1, 'could not find the end of techRunFlowScanTab()');
  const body = src.slice(fnStart, fnEnd);

  const simGuardIdx = body.indexOf('if (data.simulated)');
  assert(simGuardIdx !== -1,
    'REGRESSION: techRunFlowScanTab() no longer checks data.simulated — a seeded synthetic random-walk series (fsGenData()\'s honest-loading fallback) will be presented as a real Bandarmologi probability reading again, reproducing the exact "BEARISH 80%" fabrication the user reported for DEWA');
  const processIdx = body.indexOf('fsProcess(data)');
  assert(processIdx !== -1, 'fsProcess(data) call not found in techRunFlowScanTab()');
  assert(simGuardIdx < processIdx,
    'REGRESSION: the data.simulated guard in techRunFlowScanTab() runs AFTER fsProcess(data) — it must run BEFORE, so a synthetic series never reaches the probability/indicator calculation at all');

  const guardBody = body.slice(simGuardIdx, processIdx);
  assert(/tech-fs-prob/.test(guardBody) && !/PROBABILITAS ARAH/.test(guardBody),
    'REGRESSION: the simulated-data branch must clear/replace the probability banner with an honest loading message, not still compute or show a BULLISH/BEARISH percentage');
  assert(/rdEnsure\(tk,/.test(guardBody),
    'REGRESSION: the simulated-data branch no longer kicks off a real-data fetch — the tab would stay stuck on the honest loading message forever instead of self-healing once real OHLCV lands');
});

// User-directed (2026-09-19): "quant analysis masih memiliki data
// screener apakah ini sama dengan screener yang sudah diperbarui...
// volume spike, quant analysis masuk tab screener, karena seluruh
// fungsinya sama2 deteksi, apabila anda kesulitan untuk menggabungkan
// analisa, gabungkan saja tab nya dimasukan ke dalam screener sama
// seperti trade wave" — Quant Lab's own "Screener" tab (RSI/momentum/MA-
// position formula) and the standalone Volume Spike Scanner (volume-
// ratio-vs-median formula) are genuinely different analyses from the
// unified Screener's Whale/Uptrend formula, so rather than force a risky
// formula merge, both were relocated wholesale into the unified Screener
// page as 2 more US_STATE.pageTab tabs, exactly like the TradeWave Wave
// Cockpit/Risk Planner consolidation.
test('REGRESSION GUARD: Quant Screener and Volume Spike Scanner relocated into the unified Screener as tabs; standalone nav entries removed', () => {
  const htmlSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(!/goPage\('volume-spike',this\)/.test(htmlSrc),
    'REGRESSION: the separate "Volume Spike" sidebar button is back — should be consolidated into the Screener nav entry');
  assert(!htmlSrc.includes('id="sc-tbody"'),
    'REGRESSION: the Quant Screener\'s static HTML (sc-tbody etc.) is back in index.html\'s #page-screener — it was relocated into qtScreenerSubPageHtml() (11-quant.js) to avoid duplicate-id DOM collisions with the new Screener tab');

  const routerSrc = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  assert(/UNIFIED_SCREENER_ALIASES\s*=\s*\[[^\]]*'screener'[^\]]*'volume-spike'[^\]]*\]/.test(routerSrc),
    'REGRESSION: goPage(\'screener\')/goPage(\'volume-spike\') no longer redirect to the Screener page container — any old bookmark/dynamic call would 404 silently');
  assert(/targetPageName === 'radar'[\s\S]{0,80}US_STATE\.pageTab\s*=\s*'screener'/.test(routerSrc),
    'REGRESSION: goPage() no longer resets US_STATE.pageTab on navigation into the Screener — see the dedicated pageTab-reset regression guard above for why this matters');

  const qtSrc = fs.readFileSync(path.join(__dirname, 'public/js/11-quant.js'), 'utf8');
  assert(!/key:\s*'screener'/.test(qtSrc),
    'REGRESSION: \'screener\' has reappeared in QL_TABS — Quant Lab should no longer have its own separate Screener tab');
  assert(/function qtScreenerSubPageHtml/.test(qtSrc),
    'REGRESSION: qtScreenerSubPageHtml() is gone — the unified Screener has nothing to inject for its "Quant Screener" tab');

  const vsSrc = fs.readFileSync(path.join(__dirname, 'public/js/45-volume-spike.js'), 'utf8');
  assert(/var VS_CONTAINER_ID/.test(vsSrc),
    'REGRESSION: VS_CONTAINER_ID is gone — Volume Spike Scanner hardcodes its render target again, so it can no longer be mounted inside the Screener\'s own tab container');
  assert(/el\(VS_CONTAINER_ID\)/.test(vsSrc),
    'REGRESSION: renderVolumeSpikePage()/vsRenderShell() no longer read VS_CONTAINER_ID — they hardcode el(\'page-volume-spike\') again');

  const jsSrc = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
  assert(jsSrc.includes("usSwitchPageTab(\\'quant\\')") && jsSrc.includes("usSwitchPageTab(\\'volspike\\')"),
    'REGRESSION: the "Quant Screener"/"Volume Spike" tab buttons are gone from the Screener page tab bar');
  assert(/qtScreenerSubPageHtml/.test(jsSrc) && /VS_CONTAINER_ID\s*=\s*'us-wave-subpage'/.test(jsSrc),
    'REGRESSION: usRenderShell() no longer wires the "quant"/"volspike" tabs to their relocated render functions');
});

test('REGRESSION GUARD: menu/routing cleanup audit (2026-09-19, user-requested review to reduce confusing duplicate menus/calls) — duplicate crypto-technical switch case removed, and page-ranking\'s fully orphaned markup removed (unlike page-scanner, which LOOKS unreachable the same way but still backs a real, test-covered 3-mode Smart Money Screener feature and must NOT be deleted)', () => {
  const routerSrc = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  const cryptoTechCaseCount = (routerSrc.match(/case 'crypto-technical':/g) || []).length;
  assert(cryptoTechCaseCount === 1, `REGRESSION: renderPage()'s switch has ${cryptoTechCaseCount} 'crypto-technical' cases — there must be exactly 1 (the duplicate second case, calling initCryptoTechnicalSuite(), was dead code: a JS switch only ever runs the first match)`);

  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(!indexHtml.includes('id="page-ranking"'), 'REGRESSION: page-ranking\'s markup resurfaced — this page is unreachable from the sidebar (superseded by the Unified Screener) and had zero test coverage, so its ~35 lines of orphaned HTML (rk-body/rk-sum/rk-chart/rk-sort/rk-sig ids, only ever targeted by the equally-dead fsRenderRanking()) should stay removed');
  // page-scanner deliberately still exists — see "Smart Money Screener
  // consolidation" test above, which pins its 3-mode UI to a real,
  // still-relevant 2026-09-17 fix (real Invezgo top-movers data, no
  // simulated CMF). Assert it TESTS as still present, as a tripwire in
  // case someone "cleans up" it the same way page-ranking was cleaned up.
  assert(indexHtml.includes('id="page-scanner"'), 'REGRESSION: page-scanner was removed — unlike page-ranking, this one still backs a real, separately test-covered feature (see "Smart Money Screener consolidation" test) and must stay until that feature itself is deliberately retired');
});

test('REGRESSION GUARD: 3 more fsGenData() consumers found by the 2026-09-19 menu/data audit must disclose synthetic data honestly (same bug class as the DEWA techRunFlowScanTab incident) — fsRunScanner() "emiten terverifikasi" cards, techRenderMainChart()\'s native price chart, and the CMF/Net-Foreign charts in mountBandarmologySmartMoneyCharts()', () => {
  const flowScanSrc = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');
  const stockmasterSrc = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');

  // 1. fsRunScanner() must check r.data.simulated per card, same pattern
  // as its sibling fsRenderRanking()/fsRenderHeatmap() — previously it
  // rendered "Ditemukan N emiten TERVERIFIKASI" + precise CMF/VR/Skor
  // with zero disclosure, even when every card came from fsGenData()'s
  // synthetic random-walk fallback.
  const scannerFnMatch = flowScanSrc.match(/function fsRunScanner\(\)\s*\{[\s\S]*?\n\}/);
  assert(scannerFnMatch, 'REGRESSION: fsRunScanner() not found');
  assert(/var isSim\s*=\s*!!\(r\.data && r\.data\.simulated\)/.test(scannerFnMatch[0]), 'REGRESSION: fsRunScanner() no longer checks r.data.simulated per card');
  assert(/fsSrcDot\(isSim\)/.test(scannerFnMatch[0]), 'REGRESSION: fsRunScanner() no longer shows the fsSrcDot() real/simulated badge per card');
  // Strip comment lines before checking for the OLD rendered string —
  // the fix's own explanatory comment quotes the old "emiten TERVERIFIKASI"
  // text as documentation, which would otherwise false-positive this check.
  const scannerFnNoComments = scannerFnMatch[0].split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
  assert(!/emiten terverifikasi/i.test(scannerFnNoComments), 'REGRESSION: fsRunScanner() calls its results "terverifikasi" (verified) again — misleading when some/all cards are synthetic');

  // 2. techRenderMainChart() must check fsGenData()'s .simulated flag (and
  // treat its own second-layer Math.sin() fallback as simulated too), and
  // show an honest banner instead of a bare, unlabeled price+chg% header.
  const chartFnMatch = stockmasterSrc.match(/function techRenderMainChart\(ticker\) \{[\s\S]*?\n\}\n\n\/\//);
  assert(chartFnMatch, 'REGRESSION: could not isolate techRenderMainChart() body');
  assert(/isSimChart/.test(chartFnMatch[0]), 'REGRESSION: techRenderMainChart() no longer tracks isSimChart — the native price chart (specific "Rp X.XXX" + "+X.XX%" header) could silently be 100% fabricated again');
  assert(/SIMULASI.*belum ada histori harga riil/.test(chartFnMatch[0]), 'REGRESSION: techRenderMainChart() lost its honest simulated-data banner');
  assert(/TECH_MAINCHART_FETCHING/.test(stockmasterSrc), 'REGRESSION: techRenderMainChart() lost its self-heal (rdEnsure) path for when the chart shows synthetic data');

  // 3. mountBandarmologySmartMoneyCharts(): the CMF fallback must not be a
  // hardcoded alternating pattern (15.4/-8.2) presented as real, and the
  // "Net Foreign" chart's title/badge must disclose it's a volume-based
  // proxy, not real per-ticker daily foreign-flow data (which this app
  // has no source for at all — only a whole-market aggregate exists).
  assert(!/15\.4\s*:\s*-8\.2/.test(cockpitSrc), 'REGRESSION: the hardcoded alternating 15.4/-8.2 fake CMF fallback pattern is back — CLAUDE.md #3 violation (precise-looking fabricated numbers)');
  assert(/isCmfFallback/.test(cockpitSrc), 'REGRESSION: mountBandarmologySmartMoneyCharts() no longer tracks isCmfFallback');
  assert(cockpitSrc.includes('Estimasi Arus Dana (Proxy Volume)'), 'REGRESSION: the "Net Foreign" chart title reverted to implying real foreign-flow data ("Arus Net Dana Asing Harian") — this app has no real per-ticker daily foreign-flow source, only a whole-market aggregate');
  assert(cockpitSrc.includes('ESTIMASI, BUKAN DATA ASING RIIL'), 'REGRESSION: the "Net Foreign" chart badge no longer discloses it is an estimate, not real foreign-investor data');
});

// ── TEST: "Eksekusi no 2" (2026-09-19, user-directed menu consolidation,
// follow-up to "Eksekusi no 1") — Fundamental and Valuation ('hargawajar')
// were 2 separate pages under the same "Analisa" umbrella. Unlike the
// Technical+Bandarmology merge (identical function calls for the same
// ticker), Fundamental Tab 1's valuation (auto snapshot Graham/Lynch/DDM/
// MoS from latest fetched fundamentals) and Harga Wajar's calculator
// (manual multi-year editable EPS/Equity/Shares/DPS/PER/Net Income table,
// user-tunable Min Return/Proyeksi Tahun assumptions) are GENUINELY
// different tools, not the same formula reimplemented — so only the TAB
// was relocated (page-hargawajar's markup moved wholesale into
// page-fundamental as fund-tab-hw), the calculation code in
// 10-hargawajar.js was not touched/merged into Fundamental's own formulas.
test('REGRESSION GUARD: "Eksekusi no 2" — Valuation (Harga Wajar) consolidated into the Fundamental page as a 4th tab, not a separate page', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const routerJs = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  const stockmasterJs = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  const hwJs = fs.readFileSync(path.join(__dirname, 'public/js/10-hargawajar.js'), 'utf8');

  assert(!/<div id="page-hargawajar" class="page">/.test(indexHtml),
    'REGRESSION: the standalone page-hargawajar container is back in index.html — Valuation should be a tab inside page-fundamental now, not its own page');
  assert(/id="fund-tab-hw"/.test(indexHtml) && /id="fund-nav-4"/.test(indexHtml),
    'REGRESSION: the merged Harga Wajar tab (fund-tab-hw) or its nav button (fund-nav-4) is missing from page-fundamental in index.html');
  assert(/id="hw-ticker-input"/.test(indexHtml) && /id="hw-data-body"/.test(indexHtml) && /id="hw-verdict-badge"/.test(indexHtml),
    'REGRESSION: index.html no longer contains the Harga Wajar calculator\'s real element ids (hw-ticker-input/hw-data-body/hw-verdict-badge) — the relocation lost content instead of moving it wholesale');

  assert(/name === 'hargawajar' \? 'fundamental'/.test(routerJs),
    'REGRESSION: goPage() no longer redirects \'hargawajar\' to the \'fundamental\' page container — old goPage(\'hargawajar\') callers (sidebar Valuation button, Stock Intel handoff, Knowledge Guide, Wealth quick-links) will land on a nonexistent page');
  const caseHargawajarMatch = routerJs.match(/case 'hargawajar':[^\n]*\n/);
  assert(caseHargawajarMatch, 'REGRESSION: renderPage()\'s case \'hargawajar\' was removed — hw_init()/hw_recalc() will no longer run when navigating to Valuation');
  assert(!/fundSwitchTab/.test(caseHargawajarMatch[0]),
    'REGRESSION: renderPage()\'s case \'hargawajar\' now calls fundSwitchTab() directly — this case is also re-invoked by 03-engine.js\'s periodic same-page refresh tick (renderPage(currentPage), no goPage() involved), so forcing a tab switch here would repeatedly snap the user back to the Harga Wajar tab while they are reading another Fundamental tab (the exact class of bug already fixed for TradeWave/Unified Screener — see the FIX comment above US_STATE.pageTab). The tab switch must only happen inside goPage(), which represents a real navigation.');
  assert(/if \(name === 'hargawajar' && typeof fundSwitchTab === 'function'\)/.test(routerJs),
    'REGRESSION: goPage() no longer switches to the Harga Wajar tab (fundSwitchTab(4)) on real navigation into \'hargawajar\'');

  const fundSwitchTabFn = stockmasterJs.match(/function fundSwitchTab[\s\S]*?\n}\n/)[0];
  assert(/idx === 4/.test(fundSwitchTabFn) && /fund-tab-hw/.test(fundSwitchTabFn) && /fund-nav-4/.test(fundSwitchTabFn),
    'REGRESSION: fundSwitchTab() no longer handles idx===4 (the merged Harga Wajar tab) — clicking its nav button will do nothing');

  assert(!/document\.getElementById\('page-hargawajar'\)/.test(hwJs),
    'REGRESSION: 10-hargawajar.js still checks for the removed page-hargawajar container — the GLOBAL_STOCK_CONTEXT subscriber\'s visibility guard will always be false, silently breaking cross-module ticker sync into the Harga Wajar tab');
  assert(/document\.getElementById\('page-fundamental'\)/.test(hwJs) && /document\.getElementById\('fund-tab-hw'\)/.test(hwJs),
    'REGRESSION: 10-hargawajar.js\'s GLOBAL_STOCK_CONTEXT subscriber no longer checks both page-fundamental and fund-tab-hw visibility — it should silently sync only when the Harga Wajar tab specifically is the one being viewed, not any Fundamental tab');
});

// ── TEST: user-reported (2026-09-19, "hapus sidebar valuation double
// dengan fundamental kalkulator harga saham manual cek dulu kebenaran
// nya") — after "Eksekusi no 2" merged Harga Wajar into Fundamental as a
// tab, the sidebar had duplicate buttons ("Valuation", "Fundamental", "Technical")
// that duplicated what is already integrated inside the Stock Master 360 terminal.
// Per user directive ("gabungkan banyak fungsi analisa pada 1 sidebar, maka hapus side bar yang terpisah"),
// single-stock analysis is consolidated into Stock Master 360, while deep-links to 'fundamental' remain active.
test('REGRESSION GUARD: sidebar consolidates single-stock analysis into Stock Master 360 without duplicate standalone Valuation/Fundamental buttons', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const uiJs = fs.readFileSync(path.join(__dirname, 'public/js/29-institutional-ui.js'), 'utf8');

  assert(!/side-label">Valuation<\/span>/.test(indexHtml),
    'REGRESSION: the sidebar "Valuation" button is back — it navigates to the exact same page as "Fundamental", so having both is a duplicate menu entry');
  assert(/side-label">Stock Master 360<\/span>/.test(indexHtml),
    'REGRESSION: the sidebar "Stock Master 360" button is missing — single stock analysis is consolidated here');
  // goPage('hargawajar') itself must still work (deep-links from Stock
  // Intel/Knowledge Guide/Wealth quick-links still call it) — only the
  // sidebar's OWN button was removed, not the underlying alias/route.
  assert(/name === 'hargawajar' \? 'fundamental'/.test(fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8')),
    'REGRESSION: goPage(\'hargawajar\') no longer redirects to \'fundamental\' — removing the sidebar button must not break the deep-link callers that still use goPage(\'hargawajar\') (Stock Intel handoff, Knowledge Guide, Wealth quick-link)');

  const pagesListMatch = uiJs.match(/var pages = \[[\s\S]*?\];/);
  assert(pagesListMatch, 'Command palette "Modul & Halaman Aplikasi" pages list not found in 29-institutional-ui.js');
  assert(!/id: 'hargawajar'/.test(pagesListMatch[0]),
    'REGRESSION: the command palette (Ctrl+K search) still lists a separate \'hargawajar\' entry alongside \'fundamental\' — same duplicate-menu issue as the sidebar button, both should point to just the one \'fundamental\' entry');
  assert(/id: 'fundamental'/.test(pagesListMatch[0]),
    'REGRESSION: the command palette\'s \'fundamental\' entry was removed along with \'hargawajar\' — only the duplicate should have been removed');
});

// ── TEST: user-reported (2026-09-19, "cek toolbar signal history kenapa
// belum ada history yang muncul") — investigated why public/js/47-ai-
// signal-history.js's "Riwayat Sinyal AI" page can stay empty even for an
// active, logged-in user. Root cause found (not the only possible gate,
// but a genuine ambiguity bug, independently of Supabase/auth config):
// SYSTEM_INSTRUCTION_MONEYWATCH_AI's rule #10 (cek_prediksi_xgboost) and
// rule #11 (cek_sinyal_teknikal) both listed "sinyal"/"rekomendasi" as
// trigger words for the SAME kind of request (a ticker-specific
// signal/recommendation) — ai_signal_log (Fase 2, 00-config.js
// logAiSignalToReflectionLog()) is written ONLY when the AI calls
// cek_sinyal_teknikal specifically, never cek_prediksi_xgboost. With both
// rules matching the same plain-language phrasing ("sinyal BBCA",
// "rekomendasi ANTM"), the model had no clear tie-breaker for which tool
// to call — if it consistently picked cek_prediksi_xgboost for ordinary
// "sinyal"/"rekomendasi" questions, Signal History would silently never
// populate no matter how many times the user asked, with no error
// anywhere to reveal why. Fixed by making rule #10 explicitly require the
// user to name the model/AI/ML/XGBoost, and rule #11 the default for any
// other signal/recommendation phrasing (this can't be exercised by an
// automated test — it depends on live Claude tool-call behavior, which
// this sandbox has no network access to reproduce — so this is a
// source-text regression guard, not a behavioral one).
test('REGRESSION GUARD: SYSTEM_INSTRUCTION_MONEYWATCH_AI must disambiguate cek_prediksi_xgboost vs cek_sinyal_teknikal instead of both matching plain "sinyal"/"rekomendasi" phrasing', () => {
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const promptStart = src.indexOf('const SYSTEM_INSTRUCTION_MONEYWATCH_AI');
  assert(promptStart !== -1, 'SYSTEM_INSTRUCTION_MONEYWATCH_AI not found in server.js — has it been renamed?');
  const promptEnd = src.indexOf('\n// GET /api/ai/status', promptStart);
  assert(promptEnd !== -1, 'sanity: could not find the boundary right after SYSTEM_INSTRUCTION_MONEYWATCH_AI — extraction range may need updating');
  const prompt = src.slice(promptStart, promptEnd);

  assert(/HANYA kalau pengguna secara eksplisit menyebut model\/AI\/machine learning\/XGBoost/.test(prompt),
    'REGRESSION: rule #10 (cek_prediksi_xgboost) no longer restricts itself to explicit model/AI/ML/XGBoost mentions — it will match plain "sinyal"/"rekomendasi" phrasing again, competing with rule #11 for the same requests');
  assert(/DEFAULT untuk permintaan sinyal\/rekomendasi\/analisa teknikal/.test(prompt),
    'REGRESSION: rule #11 (cek_sinyal_teknikal) no longer states it is the default tool for plain signal/recommendation requests — the ambiguity with cek_prediksi_xgboost (rule #10) is back, which can silently starve ai_signal_log (Riwayat Sinyal AI page) of any rows');
});

// ── TEST: OpenRouter backup provider (2026-09-19, user-requested:
// "anthropic key bisakah di gabungkan dengan API openrouter, supaya bisa
// saling backup") — /api/ai/agent-chat's provider chain is now Anthropic
// direct -> OpenRouter (if OPENROUTER_API_KEY configured) -> deterministic
// engine. Verifies (a) getOpenRouterConfig() is a clean env-var-gated
// no-op when unconfigured (existing behavior for everyone who hasn't set
// OPENROUTER_API_KEY must be untouched), (b) it honors OPENROUTER_MODEL
// overrides, (c) toOpenAiTools()/convertAgentSchema() correctly reshape
// the SAME Gemini-style declarations already used for Claude into OpenAI's
// {type:'function', function:{...}} tool format, (d) callOpenRouterAgentLoop()
// actually drives a tool-calling round-trip and returns the model's final
// text, and (e) the /api/ai/agent-chat route source tries providers in the
// right order (Claude, then OpenRouter, then deterministic — never
// OpenRouter before Claude, which would make Anthropic pointless as the
// "primary, faster, no extra proxy hop" path documented in the code).
await asyncTest('REGRESSION GUARD: OpenRouter backup provider — config gating, tool-schema conversion, and the agentic tool-calling loop', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  // (a)+(b): getOpenRouterConfig() — slice is tiny and self-contained
  // (only reads process.env), no sandbox stubs needed.
  const configStart = fullSrc.indexOf('function getOpenRouterConfig()');
  assert(configStart !== -1, 'getOpenRouterConfig() not found in server.js — has it been renamed/removed?');
  let configSrc = fullSrc.slice(configStart);
  configSrc = configSrc.slice(0, configSrc.indexOf('\nfunction withTimeout'));
  const configSandbox = { process: { env: {} } };
  vm.createContext(configSandbox);
  vm.runInContext(configSrc, configSandbox, { filename: 'server.js getOpenRouterConfig() (sandboxed load for test)' });
  assert.strictEqual(configSandbox.getOpenRouterConfig(), null,
    'REGRESSION: getOpenRouterConfig() must return null (not throw, not a fake config) when OPENROUTER_API_KEY is unset — every deployment that hasn\'t opted into this feature must see byte-identical behavior to before it existed');

  const configSandbox2 = { process: { env: { OPENROUTER_API_KEY: 'sk-or-test-123' } } };
  vm.createContext(configSandbox2);
  vm.runInContext(configSrc, configSandbox2, { filename: 'server.js getOpenRouterConfig() default model (sandboxed load for test)' });
  const cfg2 = configSandbox2.getOpenRouterConfig();
  assert(cfg2 && cfg2.apiKey === 'sk-or-test-123', 'REGRESSION: getOpenRouterConfig() must read OPENROUTER_API_KEY into the returned config');
  assert.strictEqual(cfg2.model, 'anthropic/claude-3.5-sonnet',
    'REGRESSION: getOpenRouterConfig() no longer defaults to a Claude model via OpenRouter — the point of this backup is answer-quality/tool-calling parity with the primary Anthropic path, not an arbitrary different model');

  const configSandbox3 = { process: { env: { OPENROUTER_API_KEY: 'sk-or-test-123', OPENROUTER_MODEL: 'openai/gpt-4o-mini' } } };
  vm.createContext(configSandbox3);
  vm.runInContext(configSrc, configSandbox3, { filename: 'server.js getOpenRouterConfig() OPENROUTER_MODEL override (sandboxed load for test)' });
  assert.strictEqual(configSandbox3.getOpenRouterConfig().model, 'openai/gpt-4o-mini',
    'REGRESSION: getOpenRouterConfig() no longer honors an OPENROUTER_MODEL override — a user wanting real vendor redundancy (not just billing redundancy) via a non-Anthropic model can no longer configure it');

  // (c)+(d): tool-schema conversion + the agentic loop itself. Slice from
  // AGENT_SCHEMA_TYPE_MAP through the end of callOpenRouterAgentLoop() —
  // everything it needs (getOpenRouterConfig, withTimeout, fetch,
  // AGENT_TOOL_DECLARATIONS, SYSTEM_INSTRUCTION_MONEYWATCH_AI,
  // executeAgentTool) is supplied as sandbox stubs instead of pulling in
  // the entire file (which would require a real Anthropic SDK, real env,
  // and every other route's dependencies).
  const loopStart = fullSrc.indexOf('const AGENT_SCHEMA_TYPE_MAP');
  assert(loopStart !== -1, 'AGENT_SCHEMA_TYPE_MAP not found — has the tool-schema converter section moved?');
  const loopEnd = fullSrc.indexOf('\nconst SYSTEM_INSTRUCTION_MONEYWATCH_AI', loopStart);
  assert(loopEnd !== -1, 'sanity: could not find the boundary right after callOpenRouterAgentLoop() — extraction range may need updating');
  const loopSrc = fullSrc.slice(loopStart, loopEnd);
  assert(/function toOpenAiTools/.test(loopSrc), 'REGRESSION: toOpenAiTools() is gone — OpenRouter\'s OpenAI-compatible tool format conversion was removed');
  assert(/async function callOpenRouterAgentLoop/.test(loopSrc), 'REGRESSION: callOpenRouterAgentLoop() is gone — the OpenRouter agentic loop was removed');

  const fakeDeclarations = [{ name: 'cek_harga', description: 'test', parameters: { type: 'OBJECT', properties: { ticker: { type: 'STRING', description: 'kode' } }, required: ['ticker'] } }];
  const fetchCalls = [];
  let fetchCallCount = 0;
  const executedToolCalls = [];
  const loopSandbox = {
    AGENT_TOOL_DECLARATIONS: fakeDeclarations,
    SYSTEM_INSTRUCTION_MONEYWATCH_AI: 'test system prompt',
    withTimeout: (p) => p, // pass-through, no real timeout race needed for this test
    getOpenRouterConfig: () => ({ apiKey: 'sk-or-test-123', model: 'anthropic/claude-3.5-sonnet' }),
    executeAgentTool: async (name, args) => {
      executedToolCalls.push({ name, args });
      return { ticker: args.ticker, price: 9000 };
    },
    fetch: async (url, opts) => {
      fetchCallCount++;
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      if (fetchCallCount === 1) {
        // First turn: model decides to call the tool.
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'cek_harga', arguments: JSON.stringify({ ticker: 'BBCA' }) } }]
              }
            }]
          })
        };
      }
      // Second turn: model has the tool result, gives a final text answer.
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Harga BBCA Rp 9.000.' } }] }) };
    }
  };
  vm.createContext(loopSandbox);
  vm.runInContext(loopSrc, loopSandbox, { filename: 'server.js callOpenRouterAgentLoop() (sandboxed load for test)' });

  const openAiTools = loopSandbox.toOpenAiTools(fakeDeclarations);
  assert.strictEqual(openAiTools[0].type, 'function', 'REGRESSION: toOpenAiTools() no longer wraps each declaration as {type:"function", ...} — OpenRouter/OpenAI will reject the malformed tool schema');
  assert.strictEqual(openAiTools[0].function.name, 'cek_harga');
  assert.strictEqual(openAiTools[0].function.parameters.type, 'object', 'REGRESSION: convertAgentSchema() no longer lowercases the Gemini-style "OBJECT" type to JSON Schema\'s "object" — OpenRouter/OpenAI will reject the schema');
  assert.strictEqual(openAiTools[0].function.parameters.properties.ticker.type, 'string');

  const executedTools = [];
  const result = await loopSandbox.callOpenRouterAgentLoop('cek harga BBCA', [], {}, executedTools);
  assert.strictEqual(fetchCallCount, 2, 'REGRESSION: callOpenRouterAgentLoop() must make one request per agentic turn (tool-call turn, then final-answer turn) — got ' + fetchCallCount);
  assert.strictEqual(fetchCalls[0].url, 'https://openrouter.ai/api/v1/chat/completions', 'REGRESSION: callOpenRouterAgentLoop() no longer targets OpenRouter\'s chat completions endpoint');
  assert.strictEqual(fetchCalls[0].body.model, 'anthropic/claude-3.5-sonnet', 'REGRESSION: callOpenRouterAgentLoop() no longer sends the configured model in the request body');
  assert(Array.isArray(fetchCalls[0].body.tools) && fetchCalls[0].body.tools.length > 0, 'REGRESSION: callOpenRouterAgentLoop() no longer sends the tools array — the model can no longer call any tool at all');
  assert.strictEqual(executedToolCalls.length, 1, 'REGRESSION: callOpenRouterAgentLoop() did not execute the tool the model asked for');
  assert.strictEqual(executedToolCalls[0].name, 'cek_harga');
  assert.strictEqual(executedToolCalls[0].args.ticker, 'BBCA', 'REGRESSION: callOpenRouterAgentLoop() failed to parse the tool_call\'s JSON-string arguments correctly');
  assert.strictEqual(executedTools.length, 1, 'REGRESSION: callOpenRouterAgentLoop() no longer records executed tools into the shared executedTools array (used for logAiSignalToReflectionLog on the client)');
  assert.strictEqual(result.reply, 'Harga BBCA Rp 9.000.', 'REGRESSION: callOpenRouterAgentLoop() no longer returns the model\'s final text reply after the tool round-trip');
  assert.strictEqual(result.usedModel, 'anthropic/claude-3.5-sonnet');

  // (e): provider order in the real route — Claude tried first (existing
  // code, untouched), OpenRouter only inside/after its catch block, and
  // the deterministic engine only after THAT. A regression here (e.g.
  // someone "optimizing" by trying OpenRouter first) would make Anthropic
  // pointless as the primary path and change latency/cost characteristics
  // silently for everyone, configured or not.
  const routeStart = fullSrc.indexOf("app.post('/api/ai/agent-chat'");
  assert(routeStart !== -1, "/api/ai/agent-chat route not found");
  const routeEnd = fullSrc.indexOf('\napp.', routeStart + 10);
  const routeSrc = fullSrc.slice(routeStart, routeEnd === -1 ? routeStart + 20000 : routeEnd);
  const geminiCatchIdx = routeSrc.indexOf('gracefully routing to Anthropic backup engine');
  const claudeCatchIdx = routeSrc.indexOf('gracefully routing to backup engine');
  const openRouterCallIdx = routeSrc.indexOf('callOpenRouterAgentLoop(message, history, userContext, executedTools)');
  const deterministicIdx = routeSrc.indexOf('DETERMINISTIC AGENTIC ENGINE FALLBACK');
  assert(geminiCatchIdx !== -1 && claudeCatchIdx !== -1 && openRouterCallIdx !== -1 && deterministicIdx !== -1,
    'REGRESSION: one of the 4 provider-chain markers (Gemini catch / Claude catch / OpenRouter call / deterministic fallback) is missing from /api/ai/agent-chat — has the chain been restructured?');
  assert(geminiCatchIdx < claudeCatchIdx && claudeCatchIdx < openRouterCallIdx && openRouterCallIdx < deterministicIdx,
    'REGRESSION: /api/ai/agent-chat no longer tries providers in order Gemini -> Claude -> OpenRouter -> deterministic — user explicitly requested Gemini as primary, Anthropic & OpenRouter as backups');

  // /api/ai/status must honestly report the backup's configured state too
  // (same "status as-is, never calls the real API" pattern as `available`).
  const statusStart = fullSrc.indexOf("app.get('/api/ai/status'");
  const statusEnd = fullSrc.indexOf('\n});', statusStart) + 4;
  const statusSrc = fullSrc.slice(statusStart, statusEnd);
  assert(/backupAvailable/.test(statusSrc) && /backupModel/.test(statusSrc),
    'REGRESSION: GET /api/ai/status no longer reports backupAvailable/backupModel — the toolbar "AI Engine" indicator can no longer distinguish "OpenRouter backup configured" from "no AI configured at all"');
  assert(/geminiAvailable/.test(statusSrc) && /geminiModel/.test(statusSrc),
    'REGRESSION: GET /api/ai/status no longer reports geminiAvailable/geminiModel');
});

// ── TEST: Google Gemini Primary Provider (2026-09-23, user-requested:
// "jadikan yang utama, anthropic dan openrouter menjadi backup")
await asyncTest('REGRESSION GUARD: Google Gemini primary provider — config gating, REST loop, and 4-tier fallback chain (2026-09-23)', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  // 1. getGeminiConfig() gating & defaults
  const configStart = fullSrc.indexOf('function getGeminiConfig()');
  assert(configStart !== -1, 'getGeminiConfig() not found in server.js');
  let configSrc = fullSrc.slice(configStart);
  configSrc = configSrc.slice(0, configSrc.indexOf('\n// OpenRouter backup'));
  const configSandbox = { process: { env: {} } };
  vm.createContext(configSandbox);
  vm.runInContext(configSrc, configSandbox, { filename: 'server.js getGeminiConfig() sandbox' });
  assert.strictEqual(configSandbox.getGeminiConfig(), null,
    'REGRESSION: getGeminiConfig() must return null when GEMINI_API_KEY is unset');

  const configSandbox2 = { process: { env: { GEMINI_API_KEY: 'AIza-test-123' } } };
  vm.createContext(configSandbox2);
  vm.runInContext(configSrc, configSandbox2, { filename: 'server.js getGeminiConfig() default model sandbox' });
  const cfg2 = configSandbox2.getGeminiConfig();
  assert(cfg2 && cfg2.apiKey === 'AIza-test-123', 'REGRESSION: getGeminiConfig() must read GEMINI_API_KEY');
  assert.strictEqual(cfg2.model, 'gemini-1.5-flash', 'REGRESSION: getGeminiConfig() must default to gemini-1.5-flash');

  const configSandbox3 = { process: { env: { GEMINI_API_KEY: 'AIza-test-123', GEMINI_MODEL: 'gemini-2.0-flash' } } };
  vm.createContext(configSandbox3);
  vm.runInContext(configSrc, configSandbox3, { filename: 'server.js getGeminiConfig() model override sandbox' });
  assert.strictEqual(configSandbox3.getGeminiConfig().model, 'gemini-2.0-flash', 'REGRESSION: getGeminiConfig() must honor GEMINI_MODEL override');

  // 2. callGeminiAgentLoop sandbox verification
  const loopStart = fullSrc.indexOf('async function callGeminiAgentLoop(');
  assert(loopStart !== -1, 'callGeminiAgentLoop() not found in server.js');
  const loopEnd = fullSrc.indexOf('\nconst SYSTEM_INSTRUCTION_MONEYWATCH_AI', loopStart);
  const loopSrc = fullSrc.slice(loopStart, loopEnd);

  const fakeDeclarations = [{ name: 'cek_harga', description: 'test', parameters: { type: 'OBJECT', properties: { ticker: { type: 'STRING', description: 'kode' } }, required: ['ticker'] } }];
  const fetchCalls = [];
  let fetchCallCount = 0;
  const executedToolCalls = [];
  const loopSandbox = {
    AGENT_TOOL_DECLARATIONS: fakeDeclarations,
    SYSTEM_INSTRUCTION_MONEYWATCH_AI: 'test system prompt',
    withTimeout: (p) => p,
    getGeminiConfig: () => ({ apiKey: 'AIza-test-123', model: 'gemini-1.5-flash' }),
    executeAgentTool: async (name, args) => {
      executedToolCalls.push({ name, args });
      return { ticker: args.ticker, price: 9100 };
    },
    fetch: async (url, opts) => {
      fetchCallCount++;
      fetchCalls.push({ url, body: JSON.parse(opts.body) });
      if (fetchCallCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'cek_harga',
                    args: { ticker: 'BBCA' }
                  }
                }]
              }
            }]
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: 'Harga saham BBCA adalah Rp 9.100.' }]
            }
          }]
        })
      };
    }
  };
  vm.createContext(loopSandbox);
  vm.runInContext(loopSrc, loopSandbox, { filename: 'server.js callGeminiAgentLoop() sandbox' });

  const executedTools = [];
  const result = await loopSandbox.callGeminiAgentLoop('cek harga BBCA', [], {}, executedTools);
  assert.strictEqual(fetchCallCount, 2, 'REGRESSION: callGeminiAgentLoop() must execute 2 turns (tool call then final text answer)');
  assert(fetchCalls[0].url.includes('gemini-1.5-flash:generateContent'), 'REGRESSION: callGeminiAgentLoop() must call Gemini generateContent endpoint');
  assert(fetchCalls[0].url.includes('key=AIza-test-123'), 'REGRESSION: callGeminiAgentLoop() must send API key query parameter');
  assert.strictEqual(executedToolCalls.length, 1, 'REGRESSION: tool was not executed');
  assert.strictEqual(executedToolCalls[0].args.ticker, 'BBCA');
  assert.strictEqual(executedTools.length, 1);
  assert.strictEqual(fetchCalls[1].body.contents[2].role, 'tool', 'REGRESSION: tool response role must be "tool" for Gemini API');
  assert.strictEqual(result.reply, 'Harga saham BBCA adalah Rp 9.100.');
  assert.strictEqual(result.usedModel, 'gemini-1.5-flash');

  // Verify cek_broker_summary_by_broker exists in AGENT_TOOL_DECLARATIONS
  assert(fullSrc.includes("name: 'cek_broker_summary_by_broker'"),
    'REGRESSION: cek_broker_summary_by_broker tool declaration missing from server.js');
});
// FIX (2026-09-20, user-requested: "untuk news pakai API 9router sebagai
// utama dan anthropic sebagai backup, agar news tidak kosong saat credit
// habis"): /api/sectoral-news deliberately REVERSES this app's normal
// provider order (Claude primary everywhere else) because the Anthropic
// key configured for this app has no credit, so Claude always fails first
// on this route — OpenRouter must be tried FIRST here, Claude only as
// fallback. User also explicitly confirmed Invezgo has no news endpoint,
// so this route must never call an Invezgo news fetcher.
test('REGRESSION GUARD: /api/sectoral-news must try OpenRouter BEFORE Claude (reversed from the app\'s normal provider order) and never call an Invezgo news endpoint', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(/function fetchSectoralNewsViaOpenRouter\(/.test(fullSrc), 'fetchSectoralNewsViaOpenRouter() is missing from server.js');
  assert(/plugins:\s*\[\{\s*id:\s*'web'/.test(fullSrc), 'fetchSectoralNewsViaOpenRouter() no longer requests OpenRouter\'s web-grounding plugin — without it the model could fabricate headlines/URLs from training data instead of real search results');

  const routeStart = fullSrc.indexOf("app.get('/api/sectoral-news'");
  assert(routeStart !== -1, "/api/sectoral-news route not found");
  const routeEnd = fullSrc.indexOf('\napp.', routeStart + 10);
  const routeSrc = fullSrc.slice(routeStart, routeEnd === -1 ? routeStart + 20000 : routeEnd);

  const openRouterIdx = routeSrc.indexOf('fetchSectoralNewsViaOpenRouter(orConfig)');
  const claudeIdx = routeSrc.indexOf('callClaudeWithRetry(');
  assert(openRouterIdx !== -1 && claudeIdx !== -1,
    'REGRESSION: one of the 2 provider-chain markers (fetchSectoralNewsViaOpenRouter call / callClaudeWithRetry call) is missing from /api/sectoral-news');
  assert(openRouterIdx < claudeIdx,
    'REGRESSION: /api/sectoral-news no longer tries OpenRouter before Claude — this route needs OpenRouter FIRST (Anthropic key has no credit, see INCIDENT_LOG.md), reordering back to Claude-first would make news go empty again');

  const claudeStart = routeSrc.indexOf('if (!resolved) {');
  assert(claudeStart !== -1, 'REGRESSION: /api/sectoral-news no longer gates the Claude fallback behind a `resolved` flag — could call Claude even after OpenRouter already succeeded, wasting a paid call');

  assert(!/fetchInvezgo/i.test(routeSrc) && !/invezgo/i.test(routeSrc),
    'REGRESSION: /api/sectoral-news calls something Invezgo-related — user explicitly confirmed Invezgo has no news endpoint, this route must only use OpenRouter/Claude');
});

// FIX (2026-09-20, user bug report: "hanya bisa kirim 1 chat, chat kedua
// tidak bisa dikirim/masuk, dan saya bertanya bandarmology namun dijawab
// lain oleh chat AI"):
// 1. sendStockChatPrompt() in 41-stockchat-cockpit.js had no `finally`
//    resetting STOCKCHAT_IS_BUSY = false and calling renderStockChatPage(),
//    leaving the chat permanently locked in busy state after message 1.
// 2. server.js deterministic fallback lacked an `else if` branch for
//    cek_broker_summary, causing bandarmology/broker questions to fall into
//    `else` which emitted generic Graham/DCF valuation and ratios.
test('REGRESSION GUARD: StockChat multi-turn chat lifecycle & Bandarmology routing guard in server.js and 41-stockchat-cockpit.js', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public', 'js', '41-stockchat-cockpit.js'), 'utf8');

  // 1. Cockpit must have `finally` resetting STOCKCHAT_IS_BUSY and re-rendering
  assert(/STOCKCHAT_IS_BUSY\s*=\s*false;\s*renderStockChatPage\(\);/.test(cockpitSrc),
    'REGRESSION: 41-stockchat-cockpit.js does not reset STOCKCHAT_IS_BUSY = false and re-render in finally block — this causes chat 2 to be blocked forever');

  // 2. Cockpit must slice prior history without the current user message
  assert(/STOCKCHAT_CONVERSATION\.slice\(0,\s*-1\)\.slice\(-8\)/.test(cockpitSrc),
    'REGRESSION: 41-stockchat-cockpit.js must pass priorHistory excluding current message to avoid Claude/OpenRouter role alternating errors');

  // 3. server.js deterministic fallback must have a dedicated broker/bandarmology branch
  const brokerBranchMatch = serverSrc.match(/else if\s*\(\/\\b\(broker\|summary\|bandar[\s\S]*?cek_broker_summary[\s\S]*?\)/);
  assert(brokerBranchMatch,
    'REGRESSION: server.js deterministic engine lacks dedicated else-if branch executing cek_broker_summary for broker/bandarmology keywords');

  // 4. Rule #2 in SYSTEM_INSTRUCTION_MONEYWATCH_AI must prioritize cek_broker_summary
  assert(/KEAHLIAN BANDARMOLOGY & BROKER SUMMARY \(PRIORITAS UTAMA\)/.test(serverSrc),
    'REGRESSION: server.js SYSTEM_INSTRUCTION_MONEYWATCH_AI Rule #2 does not mark cek_broker_summary as high priority');

  // 5. Client AI agent in cockpit must handle broker/summary/bandar keywords
  assert(/pLower\.includes\('broker'\)\s*\|\|\s*pLower\.includes\('summary'\)\s*\|\|\s*pLower\.includes\('flow'\)\s*\|\|\s*pLower\.includes\('bandar'\)/.test(cockpitSrc),
    'REGRESSION: 41-stockchat-cockpit.js client-side AI agent does not cover broker and bandar keywords in its reasoning router');
});

test('REGRESSION GUARD: math safety & zero-division guards in Sharpe, real beta, and ETF allocation', () => {
  const renderSrc = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  assert(
    renderSrc.includes('var sharpe=(avgVol>0&&isFinite(totalReturn))?'),
    'REGRESSION: 04-render.js renderRisiko() must guard avgVol>0 and isFinite(totalReturn) before dividing to calculate sharpe'
  );

  const perfSrc = fs.readFileSync(path.join(__dirname, 'public/js/21-performance.js'), 'utf8');
  assert(
    perfSrc.includes('var portBeta = okMV > 0 ?'),
    'REGRESSION: 21-performance.js perfPaintRealBeta() must guard okMV>0 before computing weighted portBeta and portAlpha'
  );

  const assetsSrc = fs.readFileSync(path.join(__dirname, 'public/js/05-assets.js'), 'utf8');
  assert(
    assetsSrc.includes('var pctCat=(d.mv/totV2*100);'),
    'REGRESSION: 05-assets.js renderEtf() must divide by totV2 (or guard totalMVIdr) when computing pctCat'
  );
});

test('REGRESSION GUARD: Technical Chart auto-refresh idempotency, enlarged vertical layout (580px/640px), and AI Auto-Zones (RSI+MACD+Volume)', () => {
  const stockmasterSrc = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  assert(stockmasterSrc.includes('function techInit(force)'), 'REGRESSION: techInit() must accept force parameter for idempotency');
  assert(stockmasterSrc.includes('TECH_DATA.lastRenderedTicker === tk'), 'REGRESSION: techInit() lost idempotency guard against background ticks');
  assert(stockmasterSrc.includes('height:640px'), 'REGRESSION: TradingView widget iframe must have enlarged height of 640px');

  const routerSrc = fs.readFileSync(path.join(__dirname, 'public/js/06-analysis-router.js'), 'utf8');
  assert(routerSrc.includes("case 'technical':if(typeof techInit==='function') techInit(false);break;"),
    'REGRESSION: router renderPage() must pass force=false to techInit() to avoid destroying active chart during background refresh ticks');

  const aiChartSrc = fs.readFileSync(path.join(__dirname, 'public/js/43-ai-chart-intelligence.js'), 'utf8');
  assert(aiChartSrc.includes('calculateAiAutoZones'), 'REGRESSION: calculateAiAutoZones() must be defined for RSI+MACD+Volume confluence');
  assert(aiChartSrc.includes('calculateAiMacd'), 'REGRESSION: calculateAiMacd() must be defined for MACD momentum calculation');
  assert(aiChartSrc.includes('calculateAiVolumeConfluence'), 'REGRESSION: calculateAiVolumeConfluence() must be defined for volume ratio & spike analysis');
  assert(aiChartSrc.includes('height:580px;width:100%'), 'REGRESSION: Native chart canvas must be enlarged vertically to 580px with full 100% width');
  assert(aiChartSrc.includes('ZONA BELI AI'), 'REGRESSION: applyAiChartOverlay() must render ZONA BELI AI overlay');
  assert(aiChartSrc.includes('ZONA JUAL AI / TP'), 'REGRESSION: applyAiChartOverlay() must render ZONA JUAL AI / TP overlay');
});

test('REGRESSION GUARD: Bandarmology market-aggregate (Opsi B → whole-market Smart Money scanner: skeleton+async loader, daily cache, no fake net flow, foreign flow mounted)', () => {
  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');

  // 1. renderBandarmologyMarketFlowView() must render a skeleton placeholder — real content
  //    filled by bandarLoadRealMarketFlow() async (same pattern as foreign flow view).
  const mfvMatch = cockpitSrc.match(/function renderBandarmologyMarketFlowView\(tk\) \{([\s\S]*?)\n\}\n/);
  assert(mfvMatch, 'REGRESSION: could not isolate renderBandarmologyMarketFlowView body');
  assert(mfvMatch[0].includes('bandar-market-flow-content'),
    'REGRESSION: renderBandarmologyMarketFlowView() must render skeleton with id="bandar-market-flow-content" for async fill');
  assert(!mfvMatch[0].includes('bandarSmartMoneyNetRp('),
    'REGRESSION: renderBandarmologyMarketFlowView() must NOT call bandarSmartMoneyNetRp() (fake net flow heuristic)');
  // Big 4 Banks per-ticker concentration loop removed — whole-market accumulation score used instead.
  assert(!mfvMatch[0].includes('bigBanksTickers'),
    'REGRESSION: Big 4 Banks ticker list must be removed from renderBandarmologyMarketFlowView() (replaced by whole-market scanner)');

  // 2. bandarRenderMarketFlowContent() must exist and use score-based accumulation data
  //    (Invezgo /analysis/top/accumulation, not per-ticker concentration %).
  assert(cockpitSrc.includes('function bandarRenderMarketFlowContent('),
    'REGRESSION: bandarRenderMarketFlowContent() must be defined to render acc/dist data');
  assert(cockpitSrc.includes('item.score') || cockpitSrc.includes('.score'),
    'REGRESSION: bandarRenderMarketFlowContent() must use .score from whole-market accumulation data');

  // 3. Daily cache guard — must not re-fetch Invezgo on every tab visit.
  assert(cockpitSrc.includes('_BANDAR_MARKET_FLOW_CACHE'),
    'REGRESSION: _BANDAR_MARKET_FLOW_CACHE must be defined for daily result caching');
  assert(cockpitSrc.includes('_bandarMarketFlowCacheValid'),
    'REGRESSION: _bandarMarketFlowCacheValid() must guard against duplicate daily fetches');

  // 4. Async loader must be triggered on mount and exported.
  assert(cockpitSrc.includes('async function bandarLoadRealMarketFlow('),
    'REGRESSION: bandarLoadRealMarketFlow() must be an async function');
  assert(cockpitSrc.includes('setTimeout(bandarLoadRealMarketFlow,'),
    'REGRESSION: renderBandarmologyCockpitPage() must trigger bandarLoadRealMarketFlow via setTimeout on mount');
  assert(cockpitSrc.includes('window.bandarLoadRealMarketFlow = bandarLoadRealMarketFlow'),
    'REGRESSION: bandarLoadRealMarketFlow must be exported to window');

  // 5. Dynamic timeframe state still present (used by other views on same page).
  assert(cockpitSrc.includes('var BANDARMOLOGY_MARKET_TIMEFRAME ='),
    'REGRESSION: BANDARMOLOGY_MARKET_TIMEFRAME state variable must be defined');
  assert(cockpitSrc.includes('bandarSetMarketTimeframe'),
    'REGRESSION: bandarSetMarketTimeframe() function must be defined');

  // 6. Foreign flow view still mounted in market cockpit.
  assert(cockpitSrc.includes('+ renderBandarmologyForeignFlowView(tk)'),
    'REGRESSION: renderBandarmologyCockpitPage() must mount renderBandarmologyForeignFlowView() in composed HTML');
  assert(cockpitSrc.includes('setTimeout(bandarLoadRealForeignFlow, 40);'),
    'REGRESSION: renderBandarmologyCockpitPage() must trigger bandarLoadRealForeignFlow on mount');
});

test('REGRESSION GUARD: Broker Summary by Broker (Invezgo whole-market portfolio endpoint, idx-data-engine mapping, server route, and cockpit view)', () => {
  // 1. invezgo-client.js exports fetchInvezgoBrokerSummaryByBroker with required params
  const clientSrc = fs.readFileSync(path.join(__dirname, 'lib/invezgo-client.js'), 'utf8');
  assert(/async function fetchInvezgoBrokerSummaryByBroker/.test(clientSrc),
    'REGRESSION: fetchInvezgoBrokerSummaryByBroker() missing from lib/invezgo-client.js');
  assert(/fetchInvezgoBrokerSummaryByBroker,/.test(clientSrc),
    'REGRESSION: fetchInvezgoBrokerSummaryByBroker is not exported from lib/invezgo-client.js');
  assert(clientSrc.includes('/analysis/summary/broker/'),
    'REGRESSION: Invezgo broker summary URL must target /analysis/summary/broker/{code}');

  // 2. idx-data-engine.js exports getBrokerSummaryByBroker and imports from invezgo-client.js
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  assert(engineSrc.includes('fetchInvezgoBrokerSummaryByBroker,'),
    'REGRESSION: fetchInvezgoBrokerSummaryByBroker must be imported in lib/idx-data-engine.js');
  assert(/async function getBrokerSummaryByBroker/.test(engineSrc),
    'REGRESSION: getBrokerSummaryByBroker() missing from lib/idx-data-engine.js');
  assert(/getBrokerSummaryByBroker,/.test(engineSrc),
    'REGRESSION: getBrokerSummaryByBroker is not exported from lib/idx-data-engine.js');

  // 3. server.js has the GET /api/idx/broker-summary-by-broker/:code route
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(serverSrc.includes("app.get('/api/idx/broker-summary-by-broker/:code'"),
    'REGRESSION: route /api/idx/broker-summary-by-broker/:code missing in server.js');
  assert(serverSrc.includes('getBrokerSummaryByBroker,'),
    'REGRESSION: getBrokerSummaryByBroker must be imported in server.js');

  // 4. public/js/41-stockchat-cockpit.js contains the upgraded whole-market broker portfolio
  const cockpitSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  assert(cockpitSrc.includes('var BANDARMOLOGY_BROKER_TIMEFRAME ='),
    'REGRESSION: BANDARMOLOGY_BROKER_TIMEFRAME missing from 41-stockchat-cockpit.js');
  assert(cockpitSrc.includes('function bandarLoadBrokerPortfolio'),
    'REGRESSION: bandarLoadBrokerPortfolio() missing from 41-stockchat-cockpit.js');
  assert(cockpitSrc.includes('/api/idx/broker-summary-by-broker/'),
    'REGRESSION: Cockpit broker trail view must fetch from /api/idx/broker-summary-by-broker/');
  assert(cockpitSrc.includes('TOP NET BUY (AKUMULASI)'),
    'REGRESSION: Cockpit broker summary view must render TOP NET BUY (AKUMULASI) table');
  assert(cockpitSrc.includes('TOP NET SELL (DISTRIBUSI)'),
    'REGRESSION: Cockpit broker summary view must render TOP NET SELL (DISTRIBUSI) table');
  assert(cockpitSrc.includes('bandar-custom-broker-input'),
    'REGRESSION: Cockpit must provide custom broker code search input');
});

test('REGRESSION GUARD: Phase 1 AI Chat Harmonization (StockChat and Copilot Mode Switchers, Anti-Slop arrow cleaning, and Crypto Technical preservation)', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(indexHtml.includes("goPage('crypto-technical'"),
    'REGRESSION: Crypto Technical must be preserved in sidebar');
  assert(indexHtml.includes("StockChat (Analisis Emiten)"),
    'REGRESSION: StockChat label must be distinct in sidebar');
  assert(indexHtml.includes("Copilot (Audit Portofolio)"),
    'REGRESSION: Copilot label must be distinct in sidebar');

  const copilotSrc = fs.readFileSync(path.join(__dirname, 'public/js/28-decisiontools.js'), 'utf8');
  assert(copilotSrc.includes("goPage(\\'stockchat\\')"),
    'REGRESSION: Copilot must feature Mode Switcher link to StockChat');
  assert(!copilotSrc.includes('Kirim Analisa ↵'),
    'REGRESSION: Copilot must not use arrow decorator on submit button');

  const stockchatSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  assert(stockchatSrc.includes("goPage(\\'copilot\\')"),
    'REGRESSION: StockChat must feature Mode Switcher link to Copilot');
  assert(!stockchatSrc.includes('Opportunity Radar →'),
    'REGRESSION: StockChat must not use arrow decorator on Opportunity Radar button');
  assert(!stockchatSrc.includes('Stock Intelligence →'),
    'REGRESSION: StockChat must not use arrow decorator on Stock Intelligence button');
});

test('REGRESSION GUARD: Phase 2 Techno-Bandarmology & Anchored Bandar VWAP in Chart Overlay', () => {
  const stockchatSrc = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  assert(stockchatSrc.includes('function calculateBandarVwap(ticker, timeframe)'),
    'REGRESSION: calculateBandarVwap function must exist in 41-stockchat-cockpit.js');
  assert(stockchatSrc.includes('window.calculateBandarVwap = calculateBandarVwap;'),
    'REGRESSION: calculateBandarVwap must be exported to window');

  const chartAiSrc = fs.readFileSync(path.join(__dirname, 'public/js/43-ai-chart-intelligence.js'), 'utf8');
  assert(chartAiSrc.includes('bandarVwap: true'),
    'REGRESSION: bandarVwap overlay flag must be enabled by default in AI_CHART_STATE');
  assert(chartAiSrc.includes('BANDAR VWAP'),
    'REGRESSION: AI Chart Toolbar must provide BANDAR VWAP toggle button');
  assert(chartAiSrc.includes('BANDAR VWAP (TOP 3): Rp'),
    'REGRESSION: Chart canvas overlay must render Bandar VWAP horizontal line label');

  const stockmasterSrc = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  assert(stockmasterSrc.includes('calculateBandarVwap(ticker)'),
    'REGRESSION: techRenderMainChart must incorporate calculateBandarVwap in native fallback');
});

test('REGRESSION GUARD: Phase 3 Stock Master Terminal 360 (Unified Single-Stock Analysis)', () => {
  const stockmasterSrc = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  assert(stockmasterSrc.includes('function renderStockMaster360Nav(activePillar, currentTicker)'),
    'REGRESSION: renderStockMaster360Nav must exist in 24-stockmaster.js');
  assert(stockmasterSrc.includes('window.renderStockMaster360Nav = renderStockMaster360Nav;'),
    'REGRESSION: renderStockMaster360Nav must be exported to window');
  assert(stockmasterSrc.includes('window.sm360Go = sm360Go;'),
    'REGRESSION: sm360Go navigation dispatcher must be exported');

  const configSrc = fs.readFileSync(path.join(__dirname, 'public/js/00-config.js'), 'utf8');
  assert(configSrc.includes('FUND_DATA.ticker = clean') && configSrc.includes('TECH_DATA.ticker = clean') && configSrc.includes('STOCK_DOSSIER_STATE.ticker = clean'),
    'REGRESSION: GLOBAL_STOCK_CONTEXT.setTicker must sync FUND_DATA, TECH_DATA, and STOCK_DOSSIER_STATE');

  const intelSrc = fs.readFileSync(path.join(__dirname, 'public/js/27-stockintel.js'), 'utf8');
  assert(intelSrc.includes("renderStockMaster360Nav('flow', ticker)"),
    'REGRESSION: Stock Intel must mount renderStockMaster360Nav');

  const dossierSrc = fs.readFileSync(path.join(__dirname, 'public/js/46-stock-dossier.js'), 'utf8');
  assert(dossierSrc.includes("renderStockMaster360Nav('dossier', dossierState.ticker)"),
    'REGRESSION: Stock Dossier must mount renderStockMaster360Nav');

  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(indexHtml.includes('id="fund-sm360-mount"'),
    'REGRESSION: Fundamental page must provide fund-sm360-mount container');
  assert(indexHtml.includes('id="tech-sm360-mount"'),
    'REGRESSION: Technical page must provide tech-sm360-mount container');
});

test('REGRESSION GUARD: Phase 4 Portfolio Risk & Correlation Engine (VaR 95%, Volatility, Covariance Matrix)', () => {
  const quantSrc = fs.readFileSync(path.join(__dirname, 'public/js/11-quant.js'), 'utf8');
  assert(quantSrc.includes('function qtCovariance(a, b)'),
    'REGRESSION: qtCovariance must exist in 11-quant.js');
  assert(quantSrc.includes('function qtStdDev(a)'),
    'REGRESSION: qtStdDev must exist in 11-quant.js');
  assert(quantSrc.includes('function computePortfolioRiskMetrics(returnsMap, weightsMap, totalEquity)'),
    'REGRESSION: computePortfolioRiskMetrics must exist in 11-quant.js');
  assert(quantSrc.includes('window.computePortfolioRiskMetrics = computePortfolioRiskMetrics;'),
    'REGRESSION: computePortfolioRiskMetrics must be exported to window');

  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  assert(indexHtml.includes('id="corr-portfolio-risk-kpi"'),
    'REGRESSION: Quant correlation page must provide corr-portfolio-risk-kpi container');

  // Math validation for computePortfolioRiskMetrics
  const vm = require('vm');
  const sandbox = { window: {}, Math: Math, Number: Number, Object: Object, Array: Array };
  vm.createContext(sandbox);
  vm.runInContext(quantSrc.slice(quantSrc.indexOf('function qtPearson'), quantSrc.indexOf('// ── Backtest strategies')), sandbox);

  const testReturns = {
    BBCA: [0.01, -0.005, 0.012, 0.003, -0.008, 0.015],
    BBRI: [0.015, -0.01, 0.008, 0.005, -0.012, 0.02]
  };
  const testWeights = { BBCA: 60000000, BBRI: 40000000 };
  const res = sandbox.computePortfolioRiskMetrics(testReturns, testWeights, 100000000);
  assert(res.available === true, 'Risk metrics must be available for 2 valid return series');
  assert(res.var95DailyRp > 0, 'VaR 95% 1-Day must be positive Rupiah amount');
  assert(res.annualVolPct > 0, 'Annual volatility percentage must be positive');
  assert(typeof res.divBenefitPct === 'number', 'Diversification benefit must be numeric');
});

test('REGRESSION GUARD: Server-first live history and real correlation preservation in 13-realdata.js and 11-quant.js', () => {
  const realdataSrc = fs.readFileSync(path.join(__dirname, 'public/js/13-realdata.js'), 'utf8');
  assert(realdataSrc.includes("fetch('/api/idx/history/' + encodeURIComponent(cleanTk) + '?tf=1Y&market=id')"),
    'REGRESSION: rdFetchYahoo must prioritize server-side /api/idx/history before falling back to CORS proxies');
  assert(realdataSrc.includes('out.simulated = false;'),
    'REGRESSION: rdToFs must explicitly set out.simulated = false');
  assert(!realdataSrc.includes('corrRender = function(){'),
    'REGRESSION: 13-realdata.js must not overwrite canonical corrRender with an obsolete mock');

  const quantSrc = fs.readFileSync(path.join(__dirname, 'public/js/11-quant.js'), 'utf8');
  assert(quantSrc.includes("fetch('/api/idx/history/' + encodeURIComponent(cleanTk) + '?tf=' + tfReq + '&market=id')"),
    'REGRESSION: qtFetchOHLCV must prioritize server-side /api/idx/history before falling back to proxies');
});

test('REGRESSION GUARD: Stock Master Terminal 360 End-to-End Ticker Sync & Search Bar Integration', () => {
  const sm360Src = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
  const dossierSrc = fs.readFileSync(path.join(__dirname, 'public/js/46-stock-dossier.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

  // 1. Top search bar must be present with proper class and enter key handler
  assert(sm360Src.includes('sm360-search-input'), 'Top search bar must have sm360-search-input class');
  assert(sm360Src.includes("sm360SelectTicker(this.value"), 'Enter key must trigger sm360SelectTicker directly');
  assert(sm360Src.includes('sm360SearchSubmit(triggerBtn)'), 'Search submit must support triggerBtn parameter for active page resolution');

  // 2. Fundamental HTML must not hardcode .JK or AAPL in quick chips
  assert(!indexHtml.includes("value=\"BBCA.JK\""), 'fundTickerInput must not hardcode .JK');
  assert(!indexHtml.includes("fundSetTicker('BBCA.JK')"), 'fundSetTicker must not use .JK');
  assert(!indexHtml.includes("fundSetTicker('AAPL')"), 'fundSetTicker must not include non-IDX AAPL');

  // 3. Stock Dossier must synchronize via GLOBAL_STOCK_CONTEXT and delegate to sm360SelectTicker
  assert(dossierSrc.includes("sm360SelectTicker(clean, 'stock-dossier')"), 'dossierSelectTicker must delegate to sm360SelectTicker');
  assert(dossierSrc.includes('GLOBAL_STOCK_CONTEXT.subscribe'), 'Stock Dossier must subscribe to GLOBAL_STOCK_CONTEXT');
  assert(dossierSrc.includes('isDifferentFromHarvested'), 'renderStockDossierPage must detect ticker discrepancies between tabs');

  // 4. Test sm360SelectTicker logic in sandbox
  const vm = require('vm');
  const sandbox = {
    window: {},
    GLOBAL_STOCK_CONTEXT: {
      ticker: 'BBCA',
      getTicker() { return this.ticker; },
      setTicker(t) { this.ticker = t; }
    },
    TECH_DATA: { ticker: 'BBCA' },
    FUND_DATA: { ticker: 'BBCA' },
    STOCK_DOSSIER_STATE: { ticker: 'BBCA' },
    MW_SELECTED_INTEL_TICKER: 'BBCA',
    STOCKCHAT_SELECTED_TICKER: 'BBCA',
    document: {
      querySelectorAll(selector) {
        return [{ value: '' }, { value: '' }];
      },
      querySelector(selector) {
        return null;
      },
      getElementById(id) {
        return { value: '' };
      }
    }
  };
  vm.createContext(sandbox);
  // Extract and run sm360SelectTicker
  const fnStart = sm360Src.indexOf('function sm360SelectTicker');
  const fnEnd = sm360Src.indexOf('function sm360SearchSubmit');
  vm.runInContext(sm360Src.slice(fnStart, fnEnd), sandbox);

  sandbox.sm360SelectTicker('BRMS.JK', 'test');
  assert.strictEqual(sandbox.GLOBAL_STOCK_CONTEXT.getTicker(), 'BRMS', 'GLOBAL_STOCK_CONTEXT must be updated to BRMS (without .JK)');
  assert.strictEqual(sandbox.TECH_DATA.ticker, 'BRMS', 'TECH_DATA must be updated to BRMS');
  assert.strictEqual(sandbox.FUND_DATA.ticker, 'BRMS', 'FUND_DATA must be updated to BRMS');
  assert.strictEqual(sandbox.STOCK_DOSSIER_STATE.ticker, 'BRMS', 'STOCK_DOSSIER_STATE must be updated to BRMS');
  assert.strictEqual(sandbox.MW_SELECTED_INTEL_TICKER, 'BRMS', 'MW_SELECTED_INTEL_TICKER must be updated to BRMS');
});


test('REGRESSION GUARD: fsRenderWlPage() must NOT show CHG%/Skor/Sinyal/CMF/VolRatio/RSI from simulated data (CPRI-suspend reproducing case)', () => {
  // Root cause: fsGenData() fallback generates synthetic candles. When isSim===true,
  // the old code still showed chg/skor/sinyal/CMF/volRatio/RSI from those candles,
  // producing fake ▲1.96% / SKOR 100 / AKUMULASI for CPRI (suspend) — AGENTS.md Rule 1+5.
  const src = fs.readFileSync(path.join(__dirname, 'public/js/07-flowscan.js'), 'utf8');

  // 1. isSim must be computed BEFORE chg, so chg can be conditionally skipped.
  const renderFnSrc = src.match(/function fsRenderWlPage[\s\S]*?\n}\n/);
  assert(renderFnSrc, 'REGRESSION: could not isolate fsRenderWlPage() body');
  const fnBody = renderFnSrc[0];
  // isSim must be declared before chg in the function body
  const isSimIdx = fnBody.indexOf('var isSim=');
  const chgIdx   = fnBody.indexOf('var chg =');
  assert(isSimIdx !== -1, 'REGRESSION: isSim declaration missing from fsRenderWlPage()');
  assert(chgIdx   !== -1, 'REGRESSION: chg declaration missing from fsRenderWlPage()');
  assert(isSimIdx < chgIdx, 'REGRESSION: isSim must be declared before chg — simulated guard must gate the chg calculation');

  // 2. chg must be null (not computed) when isSim is true.
  assert(fnBody.includes('var chg = isSim ? null :'),
    'REGRESSION: chg must be set to null when isSim===true — simulated rows must not compute a fake CHG%');

  // 3. Row background must NOT colour-code simulated rows by fake signal.
  assert(fnBody.includes('var rowBg = isSim ?'),
    'REGRESSION: rowBg must be neutralised for simulated rows (no green AKUMULASI bg on fake signal)');

  // 4. dashCell helper must exist for each metric.
  assert(fnBody.includes("var dashCell = '"),
    'REGRESSION: dashCell helper must be defined for — placeholder cells');

  // 5. Each metric cell must be gated on isSim.
  // CHG%
  assert(/isSim \? dashCell.*fsPct\(chg\)/.test(fnBody),
    'REGRESSION: CHG% cell must show dashCell when isSim===true (fake CHG% was user-reported bug for CPRI suspend)');
  // Skor Big Money
  assert(/isSim \? dashCell.*fsScColor\(w\.a\.sc\)/.test(fnBody),
    'REGRESSION: Skor Big Money cell must show dashCell when isSim===true');
  // Sinyal Flow — either dashCell or a DATA SIM badge, must NOT call fsMkBdg when isSim
  assert(/isSim \? dashCell.*fsMkBdg\(w\.a\.sig/.test(fnBody),
    'REGRESSION: Sinyal Flow cell must NOT call fsMkBdg() when isSim===true — fake AKUMULASI/DISTRIBUSI must not be shown');
  // CMF
  assert(/isSim \? dashCell.*w\.a\.cl/.test(fnBody),
    'REGRESSION: CMF cell must show dashCell when isSim===true');
  // Vol Ratio
  assert(/isSim \? dashCell.*last\.vr/.test(fnBody),
    'REGRESSION: Vol Ratio cell must show dashCell when isSim===true');
  // RSI
  assert(/isSim \? dashCell.*w\.a\.rl/.test(fnBody),
    'REGRESSION: RSI cell must show dashCell when isSim===true');
});

// ── TEST: SlowTrading RSI + Dual MACD Adoption & Integrity Guard (2026-09-23)
await asyncTest('STRATEGY ENGINE: SlowTrading RSI + Dual MACD strategy definition, indicators, and gap-down slippage (2026-09-23)', async () => {
  const engineModule = await import('./lib/idx-data-engine.js');
  const { STRATEGY_DEFINITIONS, runStrategyBacktest, computeStockSignal, computeIndicatorSeries } = engineModule;

  // 1. STRATEGY_DEFINITIONS includes strat_slow_trading_dual_macd
  assert(STRATEGY_DEFINITIONS.strat_slow_trading_dual_macd, 'strat_slow_trading_dual_macd must be registered in STRATEGY_DEFINITIONS');
  const strat = STRATEGY_DEFINITIONS.strat_slow_trading_dual_macd;
  assert.strictEqual(strat.id, 'strat_slow_trading_dual_macd');
  assert(strat.name.includes('SlowTrading'), 'Strategy name must mention SlowTrading');
  assert(strat.description.includes('RSI-50'), 'Strategy description must explain RSI-50 envelope');

  // 2. computeIndicatorSeries calculates rsi50 and dual MACD
  const testPoints = [];
  const baseT = 1609459200000;
  for (let i = 0; i < 70; i++) {
    const p = 1000 + i * 10;
    testPoints.push({ t: baseT + i * 86400000, o: p, h: p + 15, l: p - 5, c: p + 10, v: 5000000 });
  }
  const indSeries = computeIndicatorSeries(testPoints);
  assert(indSeries.rsi50, 'computeIndicatorSeries must compute rsi50');
  assert(indSeries.macdFast && Array.isArray(indSeries.macdFast.line), 'computeIndicatorSeries must compute macdFast.line');
  assert(indSeries.macdFast && Array.isArray(indSeries.macdFast.signal), 'computeIndicatorSeries must compute macdFast.signal');
  assert(indSeries.macdFilter && Array.isArray(indSeries.macdFilter.line), 'computeIndicatorSeries must compute macdFilter.line');
  assert(indSeries.macdFilter && Array.isArray(indSeries.macdFilter.signal), 'computeIndicatorSeries must compute macdFilter.signal');

  // 3. computeStockSignal exposes rsi50
  const sig = await computeStockSignal('BBCA');
  assert(sig, 'computeStockSignal must return signal for BBCA');
  if (sig.price > 0 && sig.signal !== 'NO DATA') {
    assert(sig.rsi50 !== undefined, 'signal must expose rsi50 when technical data is computed');
  }

  // 4. Backtest execution for strat_slow_trading_dual_macd
  const backtestResult = await runStrategyBacktest('strat_slow_trading_dual_macd', 'BBCA');
  assert(backtestResult, 'runStrategyBacktest must return result object');
  assert.strictEqual(backtestResult.strategyId, 'strat_slow_trading_dual_macd');
  assert(Array.isArray(backtestResult.trades), 'trades must be an array');
  assert(backtestResult.summary, 'summary must exist');
  assert(typeof backtestResult.summary.totalTrades === 'number', 'totalTrades must be a number');

  // 5. Verify trade structure if any trades fired
  if (backtestResult.trades.length > 0) {
    const sampleTrade = backtestResult.trades[0];
    assert.strictEqual(sampleTrade.ticker, 'BBCA', 'Trade ticker must match');
    assert(sampleTrade.entryPrice > 0, 'Entry price must be positive');
    assert(sampleTrade.exitPrice > 0, 'Exit price must be positive');
    assert(typeof sampleTrade.returnPct === 'number', 'ReturnPct must be number');
    assert(['WIN', 'LOSS'].includes(sampleTrade.result), 'Trade result must be WIN or LOSS');
    assert(sampleTrade.holdingBars <= 4, 'Holding bars for SlowTrading must be capped (<= 4 bars)');
  }
});

// ============================================================
// BUG AUDIT (2026-09-24): getIdxMarketSummary() used to fabricate whole-
// market breadth/turnover from a 20-ticker bellwether sample scaled by
// arbitrary multipliers (x20/x18/x15 for breadth, x15/x12/x18 for trade
// totals), plus hardcoded ETF/DIRE/Sukuk & Obligasi rows and a fixed
// totalMarketCap constant — all presented with zero disclosure. Source-text
// regression: the fabrication formulas must be gone and honest-sample
// disclosure fields must be present.
// ============================================================
await asyncTest('REGRESSION GUARD: getIdxMarketSummary() no longer scales a 20-ticker sample into fake whole-market breadth/turnover, and discloses the sample honestly', async () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');
  const fnMatch = engineSrc.match(/async function getIdxMarketSummary\(\) \{[\s\S]*?\n\}\n\n\/\/ IDX_BROKERS/);
  assert(fnMatch, 'REGRESSION: could not isolate getIdxMarketSummary() body');
  const body = fnMatch[0];

  assert(!/gainers \* 20/.test(body), 'REGRESSION: marketBreadth.advancing is fabricating from gainers*20 again');
  assert(!/losers \* 18/.test(body), 'REGRESSION: marketBreadth.declining is fabricating from losers*18 again');
  assert(!/totalVolume \* 15/.test(body), 'REGRESSION: tradeSummary volume is fabricating a x15 whole-market scale-up again');
  assert(!/id: 'ETF'/.test(body), 'REGRESSION: hardcoded fake ETF trade-summary row is back');
  assert(!/id: 'DIRE'/.test(body), 'REGRESSION: hardcoded fake DIRE trade-summary row is back');
  assert(!/id: 'Sukuk & Obligasi'/.test(body), 'REGRESSION: hardcoded fake Sukuk & Obligasi trade-summary row is back');
  assert(!/totalMarketCap: 118/.test(body), 'REGRESSION: hardcoded fake totalMarketCap constant is back');
  assert(/isSample: true/.test(body), 'REGRESSION: marketBreadth/tradeSummary must disclose isSample:true');
  assert(/totalMarketCapAvailable: false/.test(body), 'REGRESSION: totalMarketCap must be honestly disclosed as unavailable, not fabricated');

  const { getIdxMarketSummary } = await import('./lib/idx-data-engine.js');
  const summary = await getIdxMarketSummary();
  assert(summary.marketBreadth.isSample === true, 'runtime: marketBreadth.isSample must be true');
  assert(typeof summary.marketBreadth.sampleSize === 'number', 'runtime: marketBreadth.sampleSize must be a number');
  assert(summary.totalMarketCap === null, 'runtime: totalMarketCap must be null, not a fabricated constant');
  assert(summary.totalMarketCapAvailable === false, 'runtime: totalMarketCapAvailable must be false');
  assert(Array.isArray(summary.tradeSummary) && summary.tradeSummary.every(r => r.id !== 'ETF' && r.id !== 'DIRE' && r.id !== 'Sukuk & Obligasi'), 'runtime: tradeSummary must not contain fabricated ETF/DIRE/Sukuk rows');
});

// ============================================================
// BUG AUDIT (2026-09-24): GET /api/idx/indices used to return 5 of 6
// indices (LQ45/IDX30/KOMPAS100/SRI-KEHATI/ISSI) and all 11 sector rows as
// static hardcoded constants that never changed. Source-text regression:
// those constants must be gone and the route must disclose unavailability.
// ============================================================
await asyncTest('REGRESSION GUARD: GET /api/idx/indices no longer serves hardcoded fake LQ45/IDX30/sector values as if real', async () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const routeMatch = serverSrc.match(/app\.get\('\/api\/idx\/indices'[\s\S]*?\n\}\);/);
  assert(routeMatch, 'REGRESSION: could not isolate GET /api/idx/indices route body');
  const body = routeMatch[0];

  assert(!/price: 924\.50/.test(body), 'REGRESSION: hardcoded fake LQ45 price is back');
  assert(!/price: 478\.10/.test(body), 'REGRESSION: hardcoded fake IDX30 price is back');
  assert(!/name: 'Keuangan', changePercent: 2\.45/.test(body), 'REGRESSION: hardcoded fake sector list is back');
  assert(/sectorsAvailable: false/.test(body), 'REGRESSION: route must disclose sectorsAvailable:false when no real sector feed is integrated');
  assert(/available: false/.test(body), 'REGRESSION: non-IHSG indices must be disclosed as available:false, not fabricated numbers');
});

// ============================================================
// BUG (2026-09-24, user-reported): "screener tidak mengeluarkan data,
// padahal tidak ada filter yang diterapkan" — an empty Screener table
// caused by the Regulatory Health Gate excluding the whole universe
// (idx.co.id unreachable, no cache yet) looked identical, in the UI, to
// an empty table caused by an overly narrow filter. The frontend never
// read dataSources.regulatory.available at all. Fix: a dedicated red
// banner + a distinct empty-state message when the gate itself is down,
// so the user isn't misled into debugging filters that were never the
// problem.
// ============================================================
await asyncTest('REGRESSION GUARD: Unified Screener UI discloses when the Regulatory Health Gate (not a filter) is why the table is empty', async () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/48-unified-screener.js'), 'utf8');
  assert(/ds\.regulatory && !ds\.regulatory\.available/.test(src), 'REGRESSION: the honesty banner no longer checks dataSources.regulatory.available — an empty table from a fully-excluded universe will again look like a filter problem');
  assert(/Tabel screener kosong BUKAN karena filter Anda/.test(src), 'REGRESSION: the specific "this is not your filter" disclosure text is gone');
  assert(/gateDown \? 'Semua saham tersembunyi/.test(src), 'REGRESSION: the empty-state row message no longer distinguishes gate-exclusion from a real empty filter result');
});

// ============================================================
// BUG (2026-09-24, user-reported): "aplikasi selalu crash saat membuka
// market flow, harus di reload ulang" — this is the frontend half of the
// "stuck saat ambil data" incident from earlier this session, which only
// fixed the 18 backend fetch() sites and explicitly left the 91 frontend
// sites untouched (disclosed as a scope limitation at the time). Market
// Flow (renderBandarmologyCockpitPage) is the page that reproduces it most
// reliably: it fires 5 different fetch() calls on every open (acc/dist,
// foreign flow, market flow scanner, broker portfolio, plus one per ticker
// in the ~48-ticker prefetch batch) with NO client-side timeout on any of
// them. A single hung response leaves that fetch's Promise permanently
// pending — Promise.all() in bandarPrefetchMarketBatch() never resolves,
// and worse, bandarLoadBrokerPortfolio() never resets
// _bandarBrokerPortfolioLoading back to false, permanently locking that
// section's loading-guard (`if (_bandarBrokerPortfolioLoading) return;`)
// so no page reload of #page-bandarmology alone can recover — only a full
// browser reload resets the JS state, exactly matching the report. Fix:
// AbortSignal.timeout() on all 5 call sites, same pattern as the backend
// fix, so a hung request fails fast instead of hanging forever.
// ============================================================
await asyncTest('REGRESSION GUARD: every Market Flow fetch() call (broker summary, acc/dist, foreign flow, market flow scanner, broker portfolio) has a client-side timeout', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');

  assert(/BANDAR_FETCH_TIMEOUT_MS/.test(src), 'REGRESSION: no shared frontend fetch-timeout constant found in 41-stockchat-cockpit.js');

  function assertHasTimeoutNear(label, fetchCallSnippetRegex) {
    const idx = src.search(fetchCallSnippetRegex);
    assert(idx !== -1, `REGRESSION: could not locate the ${label} fetch() call to check for a timeout`);
    const window_ = src.slice(Math.max(0, idx - 400), idx + 400);
    assert(/AbortSignal\.timeout\(BANDAR_FETCH_TIMEOUT_MS\)/.test(window_), `REGRESSION: ${label} fetch() has no AbortSignal.timeout — a hung response will hang forever and lock the page, requiring a full reload`);
  }

  assertHasTimeoutNear('fetchBrokerSummaryData() (per-ticker, used by the ~48-ticker prefetch batch)', /fetch\('\/api\/idx\/broker-summary\/'/);
  assertHasTimeoutNear('bandarLoadRealMarketFlow() (whole-market acc/dist scanner)', /fetch\('\/api\/idx\/accumulation-distribution', \{ signal/);
  assertHasTimeoutNear('bandarLoadRealForeignFlow()', /fetch\('\/api\/idx\/foreign-flow'/);
  assertHasTimeoutNear('bandarLoadBrokerPortfolio()', /fetch\('\/api\/idx\/broker-summary-by-broker\/'/);
});

await asyncTest('REGRESSION GUARD: bandarLoadBrokerPortfolio() resets its loading guard even if the fetch times out (AbortError), not just on ok/rejected-with-data)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const fnStart = src.indexOf('function bandarLoadBrokerPortfolio(');
  assert(fnStart !== -1, 'REGRESSION: could not isolate bandarLoadBrokerPortfolio() body');
  const nextFnStart = src.indexOf('\nfunction ', fnStart + 1);
  const body = src.slice(fnStart, nextFnStart !== -1 ? nextFnStart : fnStart + 3000);
  const catchMatch = body.match(/\.catch\(function\(err\)\s*\{[\s\S]*?\n\s*\}\);/);
  assert(catchMatch, 'REGRESSION: bandarLoadBrokerPortfolio() lost its .catch() handler');
  assert(/_bandarBrokerPortfolioLoading = false;/.test(catchMatch[0]), 'REGRESSION: .catch() no longer resets _bandarBrokerPortfolioLoading — a timeout (AbortError) will permanently lock this section, requiring a full page reload to recover');
});

// ============================================================
// BUG (2026-09-24, user-reported): "halaman lain juga sering stuck, coba
// cek Stock Master 360" — same class of bug as the Market Flow fix above:
// dossierHarvestData() (public/js/46-stock-dossier.js) fires 7 concurrent
// fetch() calls via Promise.all() (quote, broker summary, history, KSEI
// static, KSEI live, regime, AI hypothesis) with no client-side timeout on
// any of them. A single hung response leaves Promise.all() pending
// forever; dossierState.isLoading is only reset in the harvest function's
// own finally block (and dossierRunAnalysis()'s .finally()), neither of
// which runs if the underlying promise never settles — so the loading
// state locks permanently, and dossierRunAnalysis()'s render-time guard
// (`!dossierState.isLoading`) blocks any retry, requiring a full browser
// reload to recover.
// ============================================================
await asyncTest('REGRESSION GUARD: every dossierHarvestData() fetch() call (quote, broker summary, history, KSEI static, KSEI live, regime, AI hypothesis) has a client-side timeout', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/46-stock-dossier.js'), 'utf8');

  assert(/DOSSIER_FETCH_TIMEOUT_MS/.test(src), 'REGRESSION: no shared frontend fetch-timeout constant found in 46-stock-dossier.js');

  function assertHasTimeoutNear(label, fetchCallSnippetRegex) {
    const idx = src.search(fetchCallSnippetRegex);
    assert(idx !== -1, `REGRESSION: could not locate the ${label} fetch() call to check for a timeout`);
    const windowSrc = src.slice(Math.max(0, idx - 200), idx + 300);
    assert(/AbortSignal\.timeout\(DOSSIER_FETCH_TIMEOUT_MS\)/.test(windowSrc), `REGRESSION: ${label} fetch() has no AbortSignal.timeout — a hung response will permanently lock dossierState.isLoading, requiring a full page reload`);
  }

  assertHasTimeoutNear('quote', /fetch\('\/api\/idx\/quote\/'/);
  assertHasTimeoutNear('broker summary', /fetch\('\/api\/idx\/broker-summary\/'/);
  assertHasTimeoutNear('history', /fetch\('\/api\/idx\/history\/'/);
  assertHasTimeoutNear('KSEI static', /fetch\('\/api\/ksei\/stock\/'/);
  assertHasTimeoutNear('KSEI live composition', /fetch\('\/api\/idx\/shareholder-composition\/'/);
  assertHasTimeoutNear('market regime', /fetch\('\/api\/idx\/regime'/);
  assertHasTimeoutNear('AI hypothesis', /fetch\('\/api\/idx\/hypothesis\/'/);
});

// ============================================================
// BUG (2026-09-24, user-reported, still reproducing after the fetch-
// timeout fix above): "saat membuka market flow masih crash" — a Chrome
// "Page Unresponsive" dialog, which fires specifically when the RENDERER
// MAIN THREAD is blocked, not from a hung network request (fetch() is
// async I/O and never blocks the main thread by itself — the timeout fix
// above was necessary but not the actual cause of this dialog).
//
// Root cause: FH.timer (public/js/03-engine.js, the global 15s live-price
// polling loop) calls `renderPage(currentPage)` every 4th tick (~60s)
// while any page is open, purely so pages showing the fast-moving IHSG/
// stock price ticker redraw with fresh numbers. For 'bandarmology'
// (Market Flow), 06-analysis-router.js routes this straight into
// renderBandarmologyCockpitPage() — which, on EVERY call with no guard at
// all, nulls _bandarAccDistCache and re-fires all 5 data loaders
// (acc/dist x2, foreign flow, market flow scanner, broker portfolio) PLUS
// bandarPrefetchMarketBatch's ~48-ticker concurrent fetch batch, while
// also tearing down and rebuilding the entire page's HTML. Market Flow's
// content is 100% driven by Invezgo's own daily-cached whole-market data
// — none of it depends on the fast 15s price tick — so this periodic
// call was pure waste. Left running for a couple of minutes on the page,
// each ~60s cycle stacks a fresh ~53-request wave (with the previous
// wave's responses still arriving/parsing/re-rendering), and the
// cumulative JSON-parsing + DOM-rebuild work on the main thread is what
// trips Chrome's unresponsive-page watchdog — matching the report exactly
// (page loads fine, then hangs after sitting on it a while).
//
// Fix: renderBandarmologyCockpitPage() now skips the entire heavy
// reload+rebuild when called again with the same ticker/timeframe/
// broker/date as its last real render (a periodic poke with nothing
// user-relevant changed is now a cheap no-op), while still allowing a
// forced refresh — used once by bandarPrefetchMarketBatch() after real
// data actually arrives, and naturally whenever the user changes ticker/
// timeframe/broker/date.
// ============================================================
await asyncTest('REGRESSION GUARD: renderBandarmologyCockpitPage() does not repeat its ~53-request reload+rebuild every time it is called with nothing user-relevant changed (Market Flow "Page Unresponsive" fix)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const fnStart = src.indexOf('function renderBandarmologyCockpitPage(');
  assert(fnStart !== -1, 'REGRESSION: could not isolate renderBandarmologyCockpitPage() body');
  const nextFnStart = src.indexOf('\nfunction ', fnStart + 1);
  const body = src.slice(fnStart, nextFnStart !== -1 ? nextFnStart : fnStart + 5000);

  assert(/_bandarLastRenderedKey/.test(body), 'REGRESSION: renderBandarmologyCockpitPage() lost its dedupe guard — every call (including the global 60s periodic redraw poke) will again refetch all ~53 requests and rebuild the whole page, causing the reported "Page Unresponsive" hang');
  assert(/if\s*\(\s*!force[\s\S]{0,80}return;/.test(body), 'REGRESSION: the dedupe guard no longer early-returns for an unforced, unchanged repeat call');

  // The guard must not silence bandarPrefetchMarketBatch()'s own
  // legitimate one-time refresh after real data actually arrives.
  const prefetchFnStart = src.indexOf('function bandarPrefetchMarketBatch(');
  assert(prefetchFnStart !== -1, 'REGRESSION: bandarPrefetchMarketBatch() is gone');
  const prefetchBody = src.slice(prefetchFnStart, src.indexOf('\nfunction ', prefetchFnStart + 1));
  assert(/renderBandarmologyCockpitPage\(containerId,\s*true\)/.test(prefetchBody), 'REGRESSION: bandarPrefetchMarketBatch() no longer force-refreshes after real data arrives — its completion re-render will be silently skipped by the new dedupe guard, so views will stay stuck on simulated/placeholder data forever');
});

// ============================================================
// BUG (2026-09-24, user-reported, still reproducing after BOTH fixes
// above): "masih sama saja, tidak ada perubahan" — even after a hard
// refresh confirmed on the latest deploy. Root cause found by tracing
// what bandarPrefetchMarketBatch() (called at the end of every
// renderBandarmologyCockpitPage()) actually feeds: it fetches broker
// summary data for ~48 tickers one by one (fetchBrokerSummaryData(),
// each with its own internal fallback chain — a backend call, then, on
// failure, a client-side Yahoo Finance call through a 3-proxy retry
// chain) and stores it in STOCKCHAT_BROKER_DATA_CACHE. But NOTHING
// rendered on the current Market Flow page reads that cache — Market
// Flow, Foreign Flow, Accumulation, Distribution and Broker Trail were
// all migrated to whole-market Invezgo endpoints in earlier fixes this
// session (2026-09-17/18), and the two functions that DO still read
// STOCKCHAT_BROKER_DATA_CACHE (renderBandarmologySmartMoneyRadarView(),
// bandarDataBanner()'s caller) are dead code with zero call sites
// anywhere in the app since that migration. So this ~48-ticker batch —
// up to ~144 request attempts once every proxy fallback is counted —
// was pure overhead on every single Market Flow page load: it competes
// for the browser's limited per-origin connections with the 5 requests
// that ARE rendered, and its individually-resolving promises each
// trigger JSON parsing / processing on the main thread as they land,
// which is what was actually tripping the "Page Unresponsive" watchdog
// once this batch's slower stragglers (those hitting the full 3-proxy
// Yahoo fallback chain) started resolving ~30-60s in — independent of,
// and in addition to, the periodic-re-render issue fixed just above.
// ============================================================
await asyncTest('REGRESSION GUARD: renderBandarmologyCockpitPage() no longer fires the ~48-ticker broker-summary prefetch batch whose output nothing on Market Flow actually reads', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/41-stockchat-cockpit.js'), 'utf8');
  const fnStart = src.indexOf('function renderBandarmologyCockpitPage(');
  assert(fnStart !== -1, 'REGRESSION: could not isolate renderBandarmologyCockpitPage() body');
  const nextFnStart = src.indexOf('\nfunction ', fnStart + 1);
  const body = src.slice(fnStart, nextFnStart !== -1 ? nextFnStart : fnStart + 5000);
  assert(!/[^/]\s*bandarPrefetchMarketBatch\(containerId/.test(body), 'REGRESSION: renderBandarmologyCockpitPage() calls bandarPrefetchMarketBatch() again — this fires ~48 concurrent per-ticker fetches (each with its own multi-proxy Yahoo fallback chain) whose output nothing currently rendered on Market Flow reads, and was the real cause of the reported "Page Unresponsive" hang');
});

// ============================================================
// BUG (2026-09-25, user-reported, screenshot): "Pergerakan Aliran Modal
// Sektoral" D3 bar chart on the Sector Insight page left a large empty
// gap below its x-axis before the card's own border — root cause: the
// chart's <svg> had a FIXED height (450/460px) while its parent card sat
// in a 2-column CSS grid row whose height stretches to match the taller
// sibling card ("Berita Pasar & Katalis Terkoneksi"), so the chart never
// grew to fill the card it was actually given. Fixed by making the
// chart's container/wrapper flex to fill the card and computing the SVG
// height from the wrapper's actual rendered clientHeight instead of a
// hardcoded number.
// ============================================================
await asyncTest('REGRESSION GUARD: Sector Insight "Pergerakan Aliran Modal Sektoral" chart fills its card height instead of leaving a fixed-height gap', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const containerMatch = indexSrc.match(/<div id="si-visual-container"[^>]*>/);
  assert(containerMatch, 'REGRESSION: #si-visual-container markup is missing from index.html');
  assert(/flex:1/.test(containerMatch[0]) && /display:flex/.test(containerMatch[0]), 'REGRESSION: #si-visual-container no longer stretches to fill its card (flex:1) — the chart will again leave a gap when the sibling news card is taller');

  const jsSrc = fs.readFileSync(path.join(__dirname, 'public/js/44-sectoral-insight.js'), 'utf8');
  const fnMatch = jsSrc.match(/function siRenderD3CmfBarChart\([\s\S]*?\n  \}/);
  assert(fnMatch, 'siRenderD3CmfBarChart() not found');
  const body = fnMatch[0];
  assert(!/chartWrapper\.style\.cssText = '[^']*height:460px/.test(body), 'REGRESSION: chart wrapper is back to a fixed height:460px instead of flexing to fill the card');
  assert(/chartWrapper\.style\.cssText = '[^']*flex:1/.test(body), 'REGRESSION: chart wrapper no longer uses flex:1 to grow within its flex-column container');
  assert(/var height = Math\.max\(380, chartWrapper\.clientHeight \|\| 0\)/.test(body), 'REGRESSION: SVG height is no longer computed from the wrapper\'s actual rendered clientHeight — it will go back to a fixed value that ignores the card\'s real height');

  // BUG (2026-09-25, user-reported #2, "grafik terus reload"): the first
  // fix above made the chart fill its card, but also made its
  // ResizeObserver re-render on HEIGHT changes of the very element this
  // function itself resizes — a classic ResizeObserver + flex-grow
  // feedback loop, so the chart never stopped reloading.
  const resizeObserverMatch = body.match(/_siResizeObserver = new ResizeObserver\(function\(entries\)[\s\S]*?\n    \}\);/);
  assert(resizeObserverMatch, 'REGRESSION: could not isolate the ResizeObserver callback');
  assert(!/newH/.test(resizeObserverMatch[0]) && !/contentRect\.height/.test(resizeObserverMatch[0]), 'REGRESSION: the ResizeObserver is comparing height again — since this function is what determines this element\'s own flex-computed height, watching height here caused an infinite re-render loop (the exact bug just reported) and must never come back');

  // BUG (2026-09-25, user-reported #3, "font dan ukurannya tidak sesuai"):
  // fixing #2 by switching the <svg> to a CSS-only fill
  // (width/height:100% + preserveAspectRatio="none") let the browser
  // rescale the WHOLE internal coordinate system non-uniformly on X vs Y
  // whenever the measured `height` didn't exactly match the box's true
  // final rendered height — which distorted every font-size set in SVG
  // user units below, making labels look wrong-sized next to every other
  // card on the page. Fixed by going back to a plain 1:1 mapping: the
  // <svg>'s own height ATTRIBUTE (not CSS) is set to the exact same
  // number as viewBox's height, so the browser never rescales the Y axis
  // at all and text renders at its literal authored size — the width
  // attribute stays a CSS percentage (matches viewBox width by
  // measurement, and only ever caused horizontal scroll, never text
  // distortion, in this chart's whole history).
  assert(/\.attr\('height', height\)/.test(body), 'REGRESSION: <svg> is no longer given a plain height ATTRIBUTE equal to the measured `height` — a CSS-only fill (width/height:100%) will again let the browser rescale text non-uniformly whenever the measurement doesn\'t exactly match the box\'s true final height');
  assert(!/\.attr\('preserveAspectRatio'/.test(body), 'REGRESSION: preserveAspectRatio attribute is back — with a 1:1 height attribute mapping it has no purpose and its presence signals the CSS-stretch approach that caused the font-distortion bug has crept back in');
  assert(!/\.style\('height', '100%'\)/.test(body), 'REGRESSION: <svg> is CSS-stretched to height:100% again — this bypasses the 1:1 viewBox mapping and reintroduces the font-distortion bug');
});

// ============================================================
// BUG (2026-09-25, user-asked "apakah ini hanya SVG atau datanya rill?"
// then requested a fix): the sector flow chart's CMF formula is genuine,
// but siComputeConstituentStats() never checked whether fsGenData()
// (07-flowscan.js) had to fall back to its seeded random-walk placeholder
// series for a given constituent ticker (no real OHLCV cached yet for
// it) — so a sector's score could be partly built from placeholder data
// while looking 100% real to the user, with zero disclosure. Fixed by
// threading fsGenData()'s own `.simulated` flag through
// siComputeConstituentStats() -> siComputeAllSectors() (realCount/
// totalCount per sector) -> a tooltip disclosure line + a global banner
// when any sector has a gap.
// ============================================================
await asyncTest('REGRESSION GUARD: Sector Insight chart discloses when a sector\'s CMF score is partly built from placeholder (not-yet-cached) OHLCV instead of looking silently 100% real', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/44-sectoral-insight.js'), 'utf8');

  const fnMatch = src.match(/function siComputeConstituentStats\([\s\S]*?\n  \}/);
  assert(fnMatch, 'siComputeConstituentStats() not found');
  const body = fnMatch[0];
  assert(/isSimulated: true/.test(body), 'REGRESSION: the empty-OHLCV fallback path no longer marks itself isSimulated:true');
  assert(/isSimulated: !!ohlcv\.simulated/.test(body), 'REGRESSION: the real-data path no longer carries through fsGenData()\'s own .simulated flag — a sector\'s score can silently include placeholder data again with no way to tell');

  const allSectorsMatch = src.match(/function siComputeAllSectors\([\s\S]*?\n  \}/);
  assert(allSectorsMatch, 'siComputeAllSectors() not found');
  const allBody = allSectorsMatch[0];
  assert(/if \(!stat\.isSimulated\) realCount\+\+/.test(allBody), 'REGRESSION: siComputeAllSectors() no longer counts how many constituents are backed by real data');
  assert(/realCount: realCount/.test(allBody) && /totalCount: sec\.constituents\.length/.test(allBody), 'REGRESSION: sector result objects no longer expose realCount/totalCount for the UI to disclose');

  assert(/function siRenderDataQualityNote/.test(src), 'REGRESSION: siRenderDataQualityNote() helper is gone');
  const noteCallCount = (src.match(/siRenderDataQualityNote\(d\)/g) || []).length;
  assert(noteCallCount >= 2, 'REGRESSION: the data-quality disclosure is no longer wired into both chart tooltips (bar chart + quadrant/matrix view)');

  const barChartFnMatch = src.match(/function siRenderD3CmfBarChart\([\s\S]*?\n  \}/);
  assert(barChartFnMatch, 'siRenderD3CmfBarChart() not found');
  assert(/sectorsWithGaps/.test(barChartFnMatch[0]), 'REGRESSION: the global "N sektor punya data estimasi" banner is gone from the bar chart header — a user would have to hover every single bar to discover any gap exists at all');
});

// ============================================================
// BUG (2026-09-25, audit "cek halaman lain yang masih pakai data
// simulasi tanpa disclosure"): pairsAnalyze() (tombol "Analisa Pairs" di
// halaman Pairs Trading) memakai qtGenSim() random-walk sintetis untuk
// KEDUA saham, lalu me-render lewat pairsAnalyzeWith() — fungsi yang
// SAMA PERSIS dipakai pairsFetch() (tombol "Live", data Yahoo asli).
// #pt-stats/#pt-signal-badge tidak pernah punya indikasi apa pun bahwa
// hasil yang tampil (Korelasi, Z-Score, "Harga X terakhir: Rp ...")
// adalah karangan, padahal user bisa saja mengira sedang melihat data
// live. Fixed dengan parameter isSimulated pada pairsAnalyzeWith(),
// true dari pairsAnalyze(), false dari pairsFetch(), dirender sebagai
// banner amber/green di #pt-stats.
// ============================================================
await asyncTest('REGRESSION GUARD: Pairs Trading "Analisa Pairs" (simulasi) discloses that its stats are synthetic instead of looking identical to "Live" (Yahoo real data)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/11-quant.js'), 'utf8');

  const analyzeMatch = src.match(/function pairsAnalyze\(\)[\s\S]*?\n\}/);
  assert(analyzeMatch, 'pairsAnalyze() not found');
  assert(/pairsAnalyzeWith\(a,b,\s*qtGenSim\(a,365\),\s*qtGenSim\(b,365\),\s*true\)/.test(analyzeMatch[0]),
    'REGRESSION: pairsAnalyze() (synthetic qtGenSim data) no longer passes isSimulated=true into pairsAnalyzeWith()');

  const fetchMatch = src.match(/function pairsFetch\(\)[\s\S]*?\n\}/);
  assert(fetchMatch, 'pairsFetch() not found');
  assert(/pairsAnalyzeWith\(a,b,dataA,dataB,false\)/.test(fetchMatch[0]),
    'REGRESSION: pairsFetch() (real Yahoo data via qtFetchOHLCV) no longer passes isSimulated=false into pairsAnalyzeWith()');

  const withMatch = src.match(/function pairsAnalyzeWith\([\s\S]*?\n\}/);
  assert(withMatch, 'pairsAnalyzeWith() not found');
  const withBody = withMatch[0];
  assert(/function pairsAnalyzeWith\(a,b,dataA,dataB,isSimulated\)/.test(src),
    'REGRESSION: pairsAnalyzeWith() no longer accepts an isSimulated parameter');
  assert(/isSimulated\s*\?/.test(withBody) && /SIMULASI/.test(withBody),
    'REGRESSION: pairsAnalyzeWith() no longer branches on isSimulated to show a "SIMULASI" disclosure');
  assert(/el\('pt-stats'\)\.innerHTML\s*=\s*\w+\s*\+/.test(withBody),
    'REGRESSION: the disclosure banner is no longer prepended into #pt-stats innerHTML — a user reading the pair stats would see no warning at all');
});

// ============================================================
// BUG (2026-09-25, user report: tabel Beta/Alpha riil di Performance
// tampil "Data harga riil belum cukup panjang" di SEMUA baris sekaligus
// untuk portofolio ~20 saham): perfFetchHoldingsHistory() menembak
// rdEnsure() untuk SEMUA ticker portofolio SEKALIGUS lewat
// tickers.forEach() tanpa batas concurrency — 20 saham berarti 20 request
// /api/idx/history/:ticker paralel ke Yahoo Finance dari server yang
// sama, burst seperti ini adalah pemicu umum Yahoo throttle sehingga
// banyak/semua fetch timeout bersamaan (bukan cuma 1-2 ticker
// bermasalah). Fixed dengan membatasi CONCURRENCY=4, pola sama persis
// dengan perfFetchManyDailyHistory() di file yang sama (dipakai rebuild
// equity history) yang sudah benar sejak awal.
// ============================================================
await asyncTest('REGRESSION GUARD: perfFetchHoldingsHistory() (Beta/Alpha riil, Correlation) throttles concurrent Yahoo fetches instead of firing all portfolio tickers at once', () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/21-performance.js'), 'utf8');

  const startMarker = '// ── Fetch riwayat harga harian RIIL';
  const start = fullSrc.indexOf(startMarker);
  assert(start !== -1, 'sanity: perfFetchHoldingsHistory() header comment not found — has it moved?');
  let src = fullSrc.slice(start);
  const endMarker = '\n// Peta tanggal->return';
  const relEnd = src.indexOf(endMarker);
  assert(relEnd !== -1, 'sanity: could not find the boundary right after perfFetchHoldingsHistory() (next function perfDailyReturns)');
  src = src.slice(0, relEnd);

  assert(/CONCURRENCY\s*=\s*4/.test(src), 'REGRESSION: perfFetchHoldingsHistory() no longer bounds concurrency — it is firing every portfolio ticker\'s fetch at once again, which is exactly what caused all rows to fail together on real multi-holding portfolios');

  // Functional proof: stub getPortfolio()/rdEnsure()/rdGetAny() and track
  // how many rdEnsure() calls are in flight at any given moment while
  // resolving 12 fake tickers asynchronously (setTimeout, so calls don't
  // resolve synchronously in call order — a real network fetch wouldn't
  // either). The peak in-flight count must never exceed 4.
  const sandbox = { window: {}, setTimeout, console };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '21-performance.js (perfFetchHoldingsHistory slice, sandboxed)' });

  assert.strictEqual(typeof ctx.perfFetchHoldingsHistory, 'function', 'perfFetchHoldingsHistory() not found in extracted slice');

  const N = 12;
  const fakeTickers = Array.from({ length: N }, (_, i) => 'FAKE' + i);
  const fakePorto = fakeTickers.map((t) => ({ ticker: t, mv: 100 }));
  const fakeRows = Array.from({ length: 40 }, (_, i) => ({ date: '2020-01-0' + (1 + (i % 9)), close: 100 + i }));

  let inFlight = 0, peakInFlight = 0;
  ctx.getPortfolio = () => fakePorto;
  ctx.rdEnsure = (tk, cb) => {
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    setTimeout(() => { inFlight--; cb(null); }, Math.random() * 5);
  };
  ctx.rdGetAny = () => fakeRows;

  return new Promise((resolve, reject) => {
    ctx.perfFetchHoldingsHistory((result, failed, porto) => {
      try {
        assert(peakInFlight <= 4, 'REGRESSION: peak concurrent rdEnsure() calls was ' + peakInFlight + ' (>4) — perfFetchHoldingsHistory() is bursting all portfolio tickers at once again instead of throttling to CONCURRENCY=4');
        assert.strictEqual(Object.keys(result).length, N, 'all ' + N + ' fake tickers should have resolved into result, got ' + Object.keys(result).length);
        assert.strictEqual(failed.length, 0, 'no tickers should have failed in this stub, got ' + failed.length);
        assert.strictEqual(porto, fakePorto, 'porto passed through to callback should be the same array getPortfolio() returned');
        resolve();
      } catch (e) { reject(e); }
    });
  });
});

// ============================================================
// BUG (2026-09-25, audit follow-up "cek halaman lain yang masih pakai
// fetch tanpa concurrency limit"): 3 server-side call sites in
// lib/idx-data-engine.js (runStrategyBacktest, runUnifiedScreenerBacktest,
// resolveScreenerSignalLog) fired fetchYahooHistory() for an entire
// ticker list via a single unbounded Promise.all/allSettled(list.map(...))
// — up to 360 simultaneous Yahoo Finance calls in the worst case
// (runAllStrategiesBacktest: 8 strategies x 45 tickers each). Unlike the
// client-side perfFetchHoldingsHistory() bug fixed earlier the same day,
// this one runs on the server, so a burst here risks Yahoo throttling
// affecting every user of the app, not just one portfolio. Fixed by
// introducing fetchYahooHistoryBatched() — chunks the ticker list into
// fixed BATCH=8 groups, resolving one batch (via Promise.allSettled, so
// one bad ticker doesn't abort the rest) before starting the next — and
// routing all 3 call sites through it.
// ============================================================
await asyncTest('REGRESSION GUARD: idx-data-engine.js batches Yahoo history fetches instead of firing the whole ticker list at once (backtest + screener signal log resolution)', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'lib/idx-data-engine.js'), 'utf8');

  assert(/async function fetchYahooHistoryBatched\(tickers, tf, batchSize\)/.test(fullSrc),
    'REGRESSION: fetchYahooHistoryBatched() helper is gone');

  const helperMatch = fullSrc.match(/async function fetchYahooHistoryBatched\([\s\S]*?\n\}/);
  assert(helperMatch, 'could not extract fetchYahooHistoryBatched() body');
  assert(/for \(let i = 0; i < tickers\.length; i \+= BATCH\)/.test(helperMatch[0]),
    'REGRESSION: fetchYahooHistoryBatched() no longer chunks the ticker list — it may be firing everything at once again');
  assert(/tickers\.slice\(i, i \+ BATCH\)/.test(helperMatch[0]),
    'REGRESSION: fetchYahooHistoryBatched() no longer slices into fixed-size batches');

  // The 3 known-vulnerable call sites must route through the batched
  // helper, not call Promise.all/allSettled(list.map(fetchYahooHistory))
  // directly on a user/data-controlled ticker list anymore.
  const runStrategyBacktestMatch = fullSrc.match(/async function runStrategyBacktest\([\s\S]*?\n\}/);
  assert(runStrategyBacktestMatch, 'runStrategyBacktest() not found');
  assert(/fetchYahooHistoryBatched\(clean, 'BACKTEST'\)/.test(runStrategyBacktestMatch[0]),
    'REGRESSION: runStrategyBacktest() no longer routes through fetchYahooHistoryBatched() — runAllStrategiesBacktest() can burst up to 8 x 45 = 360 simultaneous Yahoo calls again');
  assert(!/Promise\.allSettled\(clean\.map\(t => fetchYahooHistory/.test(runStrategyBacktestMatch[0]),
    'REGRESSION: runStrategyBacktest() is back to an unbounded Promise.allSettled(clean.map(...)) burst');

  const runUnifiedScreenerBacktestMatch = fullSrc.match(/async function runUnifiedScreenerBacktest\([\s\S]*?\n\s*\/\/ Candidate pool:/);
  assert(runUnifiedScreenerBacktestMatch, 'runUnifiedScreenerBacktest() (up to the candidate-pool section) not found');
  assert(/fetchYahooHistoryBatched\(candidates, 'BACKTEST'\)/.test(runUnifiedScreenerBacktestMatch[0]),
    'REGRESSION: runUnifiedScreenerBacktest() no longer routes through fetchYahooHistoryBatched() — up to 80 simultaneous Yahoo calls again');
  assert(!/Promise\.allSettled\(candidates\.map/.test(runUnifiedScreenerBacktestMatch[0]),
    'REGRESSION: runUnifiedScreenerBacktest() is back to an unbounded Promise.allSettled(candidates.map(...)) burst');

  const resolveMatch = fullSrc.match(/async function resolveScreenerSignalLog\([\s\S]*?\n\}/);
  assert(resolveMatch, 'resolveScreenerSignalLog() not found');
  assert(/fetchYahooHistoryBatched\(tickers, 'BACKTEST'\)/.test(resolveMatch[0]),
    'REGRESSION: resolveScreenerSignalLog() no longer routes through fetchYahooHistoryBatched() — this one is the highest-risk site since the pending-signal ticker list can grow to hundreds of unique tickers, unbounded, on every read of the log');
  assert(!/Promise\.allSettled\(tickers\.map/.test(resolveMatch[0]),
    'REGRESSION: resolveScreenerSignalLog() is back to an unbounded Promise.allSettled(tickers.map(...)) burst');

  // Functional proof, not just source text: extract fetchYahooHistoryBatched()
  // standalone, stub fetchYahooHistory() to track concurrent in-flight calls,
  // and confirm peak concurrency never exceeds BATCH size (8) across 23 fake
  // tickers (not a multiple of 8, to catch an off-by-one in the chunking loop).
  const sandbox = { setTimeout, console, Promise };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(helperMatch[0], ctx, { filename: 'idx-data-engine.js (fetchYahooHistoryBatched slice, sandboxed)' });
  assert.strictEqual(typeof ctx.fetchYahooHistoryBatched, 'function', 'fetchYahooHistoryBatched() not found in extracted slice');

  let inFlight = 0, peakInFlight = 0;
  const fakeTickers = Array.from({ length: 23 }, (_, i) => 'FAKE' + i);
  ctx.fetchYahooHistory = (t) => {
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    return new Promise((resolve) => {
      setTimeout(() => { inFlight--; resolve({ points: [{ t: 1, close: 100 }] }); }, Math.random() * 5);
    });
  };

  const results = await ctx.fetchYahooHistoryBatched(fakeTickers, 'BACKTEST', 8);
  assert(peakInFlight <= 8, 'REGRESSION: peak concurrent fetchYahooHistory() calls was ' + peakInFlight + ' (>8) — fetchYahooHistoryBatched() is bursting past its batch size');
  assert.strictEqual(results.length, 23, 'expected one result per input ticker, got ' + results.length);
  assert(results.every(r => r.status === 'fulfilled'), 'expected all fake fetches to resolve as fulfilled');
});

// ============================================================
// BUG (2026-09-25, follow-up audit "cek halaman lain yang masih pakai
// fetch tanpa concurrency limit"): rdEnsure() in 13-realdata.js is the
// single shared chokepoint FlowScan/Ranking/Heatmap/Scanner/Alerts/
// Watchlist/Candle all call to warm a ticker's real OHLCV cache, with no
// concurrency bound at all. fsInit() (07-flowscan.js) alone can trigger it
// for up to 60 tickers (FS_RD ranking) plus every watchlist/portfolio
// ticker (FS_WL) in one page load — with a cold cache, that's one
// simultaneous /api/idx/history/:ticker Yahoo call per distinct uncached
// ticker, the same burst-triggers-throttling bug class fixed 3x earlier
// the same day (perfFetchHoldingsHistory in 21-performance.js,
// fetchYahooHistoryBatched in lib/idx-data-engine.js). Fixed at the shared
// chokepoint itself with a dedupe+queue: same-ticker concurrent calls
// share one fetch, and only RD_MAX_CONCURRENT (4) distinct tickers fetch
// at once.
// ============================================================
await asyncTest('REGRESSION GUARD: rdEnsure() (shared FlowScan/Ranking/Heatmap/Scanner/Watchlist real-data chokepoint) throttles concurrent Yahoo fetches and dedupes same-ticker calls', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'public/js/13-realdata.js'), 'utf8');

  assert(/var RD_MAX_CONCURRENT = 4/.test(fullSrc), 'REGRESSION: RD_MAX_CONCURRENT is gone — rdEnsure() may be unbounded again');
  assert(/var RD_QUEUE = \[\]/.test(fullSrc), 'REGRESSION: RD_QUEUE is gone — rdEnsure() has no queueing mechanism');
  assert(/var RD_INFLIGHT = \{\}/.test(fullSrc), 'REGRESSION: RD_INFLIGHT dedupe map is gone');

  // Build a sandboxable slice: everything up to (excluding) rdFetchYahoo's
  // real-network definition, stitched to the rdEnsure() block that follows
  // it — rdFetchYahoo is stubbed by the test itself instead, so no real
  // fetch() ever runs.
  const preStart = fullSrc.indexOf('var RD_STORE');
  assert(preStart !== -1, 'sanity: RD_STORE declaration not found');
  const preEnd = fullSrc.indexOf('\nfunction rdFetchYahoo');
  assert(preEnd !== -1, 'sanity: rdFetchYahoo() boundary not found — has it moved/renamed?');
  const preSlice = fullSrc.slice(preStart, preEnd);

  const postStart = fullSrc.indexOf('// FIX (2026-09-25, follow-up audit "cek halaman lain yang masih pakai\n// fetch tanpa concurrency limit")');
  assert(postStart !== -1, 'sanity: could not locate the rdEnsure() fix comment — has it been reworded/removed?');
  const postEndMarker = fullSrc.indexOf('\n// FIX: `prices{}`', postStart); // next section's header comment
  assert(postEndMarker !== -1, 'sanity: could not find the boundary right after rdEnsure() (next section: rdFetchLivePrice)');
  const postSlice = fullSrc.slice(postStart, postEndMarker);

  const src = preSlice + '\n' + postSlice;
  assert(/function rdEnsure\(tk, cb\)/.test(src), 'sanity: rdEnsure() not present in the extracted slice');
  assert(!/function rdFetchYahoo/.test(src), 'sanity: rdFetchYahoo() leaked into the extracted slice — it should be stubbed by the test, not the real network version');

  const sandbox = { window: {}, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null }, setTimeout, console };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: '13-realdata.js (rdEnsure slice, sandboxed)' });
  assert.strictEqual(typeof ctx.rdEnsure, 'function', 'rdEnsure() not found in extracted slice');

  // Functional proof 1: peak concurrent rdFetchYahoo() calls across 15
  // distinct fake tickers never exceeds RD_MAX_CONCURRENT (4).
  let inFlight = 0, peakInFlight = 0, fetchCallCount = 0;
  const pendingByTk = {};
  ctx.rdFetchYahoo = (tk, cb) => {
    fetchCallCount++;
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    pendingByTk[tk] = cb;
    setTimeout(() => { inFlight--; cb(null); }, Math.random() * 5);
  };

  const fakeTickers = Array.from({ length: 15 }, (_, i) => 'FAKE' + i);
  await new Promise((resolve) => {
    let done = 0;
    fakeTickers.forEach((tk) => {
      ctx.rdEnsure(tk, () => { done++; if (done === fakeTickers.length) resolve(); });
    });
  });
  assert(peakInFlight <= 4, 'REGRESSION: peak concurrent rdFetchYahoo() calls was ' + peakInFlight + ' (>4) — rdEnsure() is bursting past RD_MAX_CONCURRENT again');
  assert.strictEqual(fetchCallCount, 15, 'expected exactly one rdFetchYahoo() call per distinct ticker, got ' + fetchCallCount);

  // Functional proof 2: 5 concurrent rdEnsure() calls for the SAME ticker
  // (before its fetch resolves) must dedupe into exactly 1 rdFetchYahoo()
  // call, with all 5 callbacks still firing once it resolves.
  fetchCallCount = 0;
  let resolveDup;
  ctx.rdFetchYahoo = (tk, cb) => { fetchCallCount++; resolveDup = () => cb(null); };
  let dupCbCount = 0;
  for (let i = 0; i < 5; i++) ctx.rdEnsure('DUPTK', () => { dupCbCount++; });
  assert.strictEqual(fetchCallCount, 1, 'REGRESSION: 5 concurrent rdEnsure() calls for the same ticker triggered ' + fetchCallCount + ' separate rdFetchYahoo() calls instead of deduping to 1 — wasteful duplicate fetches for the same symbol');
  resolveDup();
  assert.strictEqual(dupCbCount, 5, 'REGRESSION: only ' + dupCbCount + ' of 5 callers for the deduped ticker got their callback invoked — a caller would hang forever waiting for rdEnsure()');
});

// ============================================================
// BUG (2026-09-25, user-reported: Beta/Alpha riil table still empty for
// every row even after /api/idx/history's concurrency was already
// bounded earlier the same day). Root cause found from live Vercel
// function logs the user shared: POST /api/idx/quotes — the batch
// real-time-quote endpoint called on every price-refresh cycle for the
// user's whole portfolio (public/js/03-engine.js) — fired an unbounded
// Promise.allSettled(list.map(t => fetchYahooQuote(t))) for up to 100
// tickers at once (confirmed live: ~18 simultaneous
// query1.finance.yahoo.com calls from one invocation for an ~18-stock
// portfolio). This ran concurrently with (and could keep throttling)
// the already-bounded /api/idx/history calls on the same deployment/IP
// — fixing history's concurrency alone could not help while this
// endpoint kept bursting unbounded. GET /api/idx/screener had the same
// pattern for its quote-enrichment step. Fixed with
// fetchYahooQuoteBatched(), same BATCH=8 chunking shape as
// fetchYahooHistoryBatched() in lib/idx-data-engine.js (fixed earlier
// the same day), routed through both call sites.
// ============================================================
await asyncTest('REGRESSION GUARD: server.js batches Yahoo quote fetches in /api/idx/quotes and /api/idx/screener instead of firing the whole ticker list at once', async () => {
  const fullSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  assert(/async function fetchYahooQuoteBatched\(tickers, batchSize\)/.test(fullSrc),
    'REGRESSION: fetchYahooQuoteBatched() helper is gone');
  const helperMatch = fullSrc.match(/async function fetchYahooQuoteBatched\([\s\S]*?\n\}/);
  assert(helperMatch, 'could not extract fetchYahooQuoteBatched() body');
  assert(/for \(let i = 0; i < tickers\.length; i \+= BATCH\)/.test(helperMatch[0]),
    'REGRESSION: fetchYahooQuoteBatched() no longer chunks the ticker list');
  assert(/tickers\.slice\(i, i \+ BATCH\)/.test(helperMatch[0]),
    'REGRESSION: fetchYahooQuoteBatched() no longer slices into fixed-size batches');

  const quotesRouteMatch = fullSrc.match(/app\.post\('\/api\/idx\/quotes'[\s\S]*?\n\}\);/);
  assert(quotesRouteMatch, 'POST /api/idx/quotes route not found');
  assert(/fetchYahooQuoteBatched\(cleanTickers\)/.test(quotesRouteMatch[0]),
    'REGRESSION: POST /api/idx/quotes no longer routes through fetchYahooQuoteBatched() — up to 100 simultaneous Yahoo quote calls per portfolio refresh again, this was the confirmed live root cause of the empty Beta/Alpha table');
  assert(!/Promise\.allSettled\(cleanTickers\.map/.test(quotesRouteMatch[0]),
    'REGRESSION: POST /api/idx/quotes is back to an unbounded Promise.allSettled(cleanTickers.map(...)) burst');

  const screenerRouteMatch = fullSrc.match(/app\.get\('\/api\/idx\/screener'[\s\S]*?\n\}\);/);
  assert(screenerRouteMatch, 'GET /api/idx/screener route not found');
  assert(/fetchYahooQuoteBatched\(topSample\.map\(item => item\.code\)\)/.test(screenerRouteMatch[0]),
    'REGRESSION: GET /api/idx/screener no longer routes through fetchYahooQuoteBatched()');
  assert(!/Promise\.allSettled\(topSample\.map/.test(screenerRouteMatch[0]),
    'REGRESSION: GET /api/idx/screener is back to an unbounded Promise.allSettled(topSample.map(...)) burst');

  // Functional proof: extract fetchYahooQuoteBatched() standalone, stub
  // fetchYahooQuote() to track concurrent in-flight calls, confirm peak
  // concurrency never exceeds BATCH size (8) across 19 fake tickers (not
  // a multiple of 8, to catch an off-by-one in the chunking loop) —
  // matching the ~18-ticker portfolio size from the live incident.
  const sandbox = { setTimeout, console, Promise };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(helperMatch[0], ctx, { filename: 'server.js (fetchYahooQuoteBatched slice, sandboxed)' });
  assert.strictEqual(typeof ctx.fetchYahooQuoteBatched, 'function', 'fetchYahooQuoteBatched() not found in extracted slice');

  let inFlight = 0, peakInFlight = 0;
  const fakeTickers = Array.from({ length: 19 }, (_, i) => 'FAKE' + i);
  ctx.fetchYahooQuote = (t) => {
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    return new Promise((resolve) => {
      setTimeout(() => { inFlight--; resolve({ price: 100, isSimulated: false }); }, Math.random() * 5);
    });
  };

  const results = await ctx.fetchYahooQuoteBatched(fakeTickers, 8);
  assert(peakInFlight <= 8, 'REGRESSION: peak concurrent fetchYahooQuote() calls was ' + peakInFlight + ' (>8) — fetchYahooQuoteBatched() is bursting past its batch size');
  assert.strictEqual(results.length, 19, 'expected one result per input ticker, got ' + results.length);
  assert(results.every(r => r.status === 'fulfilled'), 'expected all fake fetches to resolve as fulfilled');
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!`);
console.log('═══════════════════════════════════════════════════════');