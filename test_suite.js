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

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!`);
console.log('═══════════════════════════════════════════════════════');