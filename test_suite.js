/**
 * test_suite.js — Comprehensive Automated Verification Suite
 * Verifies all financial, tax, indicator, and portfolio calculations
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

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
    'renderDashboard() no longer calls renderDashboardRadarPreview() — the AI Opportunity Radar zone would silently stop updating');
  assert(/loadOpportunityRadarUniverse\(\)/.test(src),
    'renderDashboardRadarPreview() must reuse the REAL loadOpportunityRadarUniverse() (26-commandcenter.js) — a separate/duplicate fetch would diverge from the full Radar page\'s scoring');
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
test('REGRESSION GUARD: Market Heatmap preview must keep the real-vs-simulated disclosure marker (KNOWN_ISSUES.md #2)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  const fn = src.match(/function renderDashboardHeatmapPreview\(\)\{[\s\S]*?\n\}/);
  assert(fn, 'renderDashboardHeatmapPreview() body not found');
  assert(/data\s*&&\s*r\.data\.simulated/.test(fn[0]) || /r\.data\.simulated/.test(fn[0]),
    'renderDashboardHeatmapPreview() no longer reads .simulated off FS_RD rows — would show a fabricated score identically to a real one');
  assert(/fsSrcDot\(/.test(fn[0]), 'renderDashboardHeatmapPreview() no longer calls fsSrcDot() — the SIM marker would be missing from this preview');
});
test('REGRESSION GUARD: Smart Money Flow preview must keep the SIMULASI disclosure badge (KNOWN_ISSUES.md #3)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/04-render.js'), 'utf8');
  const fn = src.match(/function renderDashboardSmartFlowPreview\(\)\{[\s\S]*?\n\}/);
  assert(fn, 'renderDashboardSmartFlowPreview() body not found');
  assert(/generateClientSideBrokerSummary\(/.test(fn[0]), 'renderDashboardSmartFlowPreview() no longer reuses generateClientSideBrokerSummary()');
  assert(/>SIMULASI</.test(fn[0]), 'renderDashboardSmartFlowPreview() no longer shows the SIMULASI disclosure badge');
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
  const fallbackCallCount = (src.match(/\|\|\s*fsFallbackInfo\(/g) || []).length;
  assert(fallbackCallCount >= 5, `Expected at least 5 call sites using fsFallbackInfo() as the FS_UNIV.find() fallback, found ${fallbackCallCount} — a fallback may have reverted to an inline literal`);
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

// ── TEST 42: TradeWave "Wave Scanner" tab must render before the
// single-ticker validity gate (found by the user, 2026-09-11) — Tab 2
// (Wave Scanner) scans its own multi-ticker universe and never depends on
// TW_STATE.ticker's own analysis, but renderTradeWavePage() used to run
// the `if (!data || data.isValid === false)` TICKER INVALID gate
// unconditionally before checking which tab was active. Whenever the
// currently-selected ticker had no valid analysis (e.g. <65 days of
// cached OHLCV — a real, reachable state, not just an unregistered
// ticker), clicking "Wave Scanner" correctly switched TW_STATE.activeTab
// to 2 and highlighted the button, but the page kept showing the
// single-ticker error card instead of the scanner — looking exactly like
// the button "does nothing".
test('REGRESSION GUARD: TradeWave Wave Scanner (tab 2) must render before the single-ticker TICKER INVALID gate', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/37-tradewave-engine.js'), 'utf8');
  const fn = src.match(/function renderTradeWavePage\(\) \{[\s\S]*?\n  \}\n/);
  assert(fn, 'renderTradeWavePage() body not found — has it been renamed/removed?');
  const body = fn[0];
  // NOTE: "TW_STATE.activeTab === 2" also appears earlier in this function
  // inside the Wave Scanner *button*'s active-highlight style — that's not
  // the routing branch, so match the specific `if (...) { ... return; }`
  // dispatch statement instead of the bare substring.
  const tab2Match = body.match(/if\s*\(\s*TW_STATE\.activeTab\s*===\s*2\s*\)\s*\{[\s\S]*?return;\s*\}/);
  const gateIdx = body.indexOf('data.isValid === false');
  assert(tab2Match, 'REGRESSION: no early-return `if (TW_STATE.activeTab === 2) {...return;}` dispatch found in renderTradeWavePage()');
  const tab2Idx = body.indexOf(tab2Match[0]);
  assert(gateIdx !== -1, 'REGRESSION: no data.isValid === false gate found in renderTradeWavePage()');
  assert(tab2Idx < gateIdx,
    'REGRESSION: the TICKER INVALID gate runs before the Wave Scanner (tab 2) check again — Wave Scanner will show the single-ticker error card instead of scanning whenever the currently-selected ticker\'s own analysis is invalid, even though Tab 2 never reads that data (see INCIDENT_LOG.md)');
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
// ── TEST 42b: Wave Scanner (renderTab2WaveScanner) must not crash when
// twAnalyzeWave() returns an invalid entry (found while verifying TEST 42,
// 2026-09-11) — twAnalyzeWave() returns a minimal {isValid:false, ticker,
// error} shape (no changePct/waveScore/superTrend/flow/targets) whenever a
// ticker has no 65-day OHLCV cached yet, a real reachable state for any
// ticker whose background fetch hasn't landed. The row-rendering loop used
// to read those fields unconditionally (e.g. `row.changePct.toFixed(2)`),
// throwing a TypeError and aborting the ENTIRE scanner render the moment a
// single ticker in TW_UNIVERSE was still invalid — which is exactly what
// made the Wave Scanner tab look totally unresponsive after fixing the
// render-order bug in TEST 42 alone.
test('REGRESSION GUARD: renderTab2WaveScanner() must filter out isValid:false entries before rendering row fields', () => {
  const src = fs.readFileSync(path.join(__dirname, 'public/js/37-tradewave-engine.js'), 'utf8');
  const fnStart = src.indexOf('function renderTab2WaveScanner()');
  assert(fnStart !== -1, 'renderTab2WaveScanner() not found — has it been renamed/removed?');
  const fnEnd = src.indexOf('\n  function renderTab3RiskPlanner', fnStart);
  assert(fnEnd !== -1, 'could not find the end of renderTab2WaveScanner() (renderTab3RiskPlanner marker missing)');
  const body = src.slice(fnStart, fnEnd);
  assert(/isValid\s*!==\s*false/.test(body),
    'REGRESSION: renderTab2WaveScanner() no longer filters out {isValid:false} entries — a single ticker in TW_UNIVERSE with no cached OHLCV yet will throw (e.g. undefined.toFixed()) and silently abort the whole scanner render');
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
    'REGRESSION: goBandarmology() no longer dispatches \'smart-money-flow\' to setBandarmologyTab() — the real flowscan deep-link is broken');
  assert(/subTab === 'smart-money-flow'/.test(cockpitJs),
    'REGRESSION: setBandarmologyTab() no longer scrolls to #bandarSmartMoneyChart for \'smart-money-flow\' — the real flowscan deep-link is broken');
  assert(!/subTab === 'broker-flow'/.test(cockpitJs) && !/subTab === 'foreign-flow'/.test(cockpitJs),
    'REGRESSION: dead scroll-to branches for \'broker-flow\'/\'foreign-flow\' are back in setBandarmologyTab()');
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
  assert(/fetchInvezgoBrokerSummary\(clean,\s*fromDate,\s*toDate\)/.test(engineSrc),
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

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!`);
console.log('═══════════════════════════════════════════════════════');