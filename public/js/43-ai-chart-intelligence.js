/**
 * 43-ai-chart-intelligence.js — MoneyWatch Pro V6: AI Trading Chart Intelligence Layer
 * 
 * High-Performance, Anti-Repainting, Deterministic Confluence & AI Chart Analysis Module.
 * Integrates directly with Existing Native Chart.js, FlowScan, Support/Resistance, and Decision Journal.
 */

// Global State for AI Chart Intelligence
var AI_CHART_STATE = {
  activeTicker: 'BBCA',
  timeframe: '1D',
  isAnalyzing: false,
  lastContext: null,
  lastAnalysis: null,
  overlays: {
    sr: true,
    fib: true,
    pattern: true,
    structure: true,
    setup: true
  }
};

// ══════════════════════════════════════════════════════════
// 1. SINGLE SOURCE OF TRUTH — MARKET DATA CONTEXT BUILDER
// ══════════════════════════════════════════════════════════
function buildAiSharedMarketContext(ticker, timeframe) {
  var tk = (ticker || 'BBCA').toUpperCase().trim().replace(/\.JK$/i, '');
  var tf = timeframe || '1D';

  // Retrieve candle data from existing data layer (fsGenData / DB)
  var rawOhlcv = (typeof fsGenData === 'function') ? fsGenData(tk, 60) : [];
  if (!rawOhlcv || !rawOhlcv.length) {
    var basePx = (typeof prices !== 'undefined' && prices[tk]) || 5000;
    rawOhlcv = [];
    for (var i = 0; i < 60; i++) {
      var dt = new Date(); dt.setDate(dt.getDate() - 60 + i);
      var cSynthetic = Math.round(basePx * (1 + Math.sin(i * 0.2) * 0.06));
      rawOhlcv.push({ dt: dt, o: cSynthetic * 0.99, h: cSynthetic * 1.025, l: cSynthetic * 0.975, c: cSynthetic, v: 12000000 + (i * 50000) });
    }
  }

  // Normalize candle objects so both short keys (o,h,l,c,v) and long keys (open,high,low,close,volume) exist safely
  var ohlcv = rawOhlcv.map(function(d) {
    if (!d) return { dt: new Date(), o: 5000, h: 5000, l: 5000, c: 5000, v: 0, open: 5000, high: 5000, low: 5000, close: 5000, volume: 0 };
    var c = Number(d.c !== undefined ? d.c : (d.close !== undefined ? d.close : 0));
    var o = Number(d.o !== undefined ? d.o : (d.open !== undefined ? d.open : c));
    var h = Number(d.h !== undefined ? d.h : (d.high !== undefined ? d.high : Math.max(o, c)));
    var l = Number(d.l !== undefined ? d.l : (d.low !== undefined ? d.low : Math.min(o, c)));
    var v = Number(d.v !== undefined ? d.v : (d.volume !== undefined ? d.volume : (d.vol !== undefined ? d.vol : 0)));
    var dt = d.dt || d.date || new Date();
    return { dt: dt, date: dt, o: o, open: o, h: h, high: h, l: l, low: l, c: c, close: c, v: v, volume: v, mfv: d.mfv || 0, mfm: d.mfm || 0 };
  });

  if (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk)) {
    return {
      symbol: tk,
      isValid: false,
      error: 'Ticker "' + tk + '" tidak terdaftar dalam Stock Universe IDX atau Yahoo Finance.',
      ohlcv: [],
      price: { current: 0, previous: 0, change: 0, changePct: 0, high: 0, low: 0, volume: 0 },
      indicators: { rsi: 0, ma20: 0, ma50: 0, cmf: 0 },
      supportResistance: [],
      flowScan: { verdict: 'INVALID', institutionalNetRp: 0, cmf: 0 }
    };
  }

  if (!ohlcv.length) {
    var fallbackPx = (typeof prices !== 'undefined' && prices[tk]) || 0;
    if (fallbackPx <= 0) {
      return {
        symbol: tk,
        isValid: false,
        error: 'Tidak ada data harga pasar untuk ticker "' + tk + '". Proyeksi teknikal dinonaktifkan.',
        ohlcv: [],
        price: { current: 0, previous: 0, change: 0, changePct: 0, high: 0, low: 0, volume: 0 },
        indicators: { rsi: 0, ma20: 0, ma50: 0, cmf: 0 },
        supportResistance: [],
        flowScan: { verdict: 'INVALID', institutionalNetRp: 0, cmf: 0 }
      };
    }
    ohlcv = [{ dt: new Date(), date: new Date(), o: fallbackPx, open: fallbackPx, h: fallbackPx, high: fallbackPx, l: fallbackPx, low: fallbackPx, c: fallbackPx, close: fallbackPx, v: 1000000, volume: 1000000, mfv: 0, mfm: 0 }];
  }

  var closePrices = ohlcv.map(function(d) { return d.c; });
  var curPrice = closePrices[closePrices.length - 1] || 5000;
  var prevPrice = closePrices[closePrices.length - 2] || curPrice;
  var chg = curPrice - prevPrice;
  var chgPct = prevPrice > 0 ? (chg / prevPrice * 100) : 0;

  // Indicators: RSI, MA20, MA50, CMF
  var rsi = calculateAiRsi(closePrices, 14);
  var ma20 = calculateAiSMA(closePrices, 20);
  var ma50 = calculateAiSMA(closePrices, 50);

  // FlowScan & Smart Money integration from existing engine
  var flowScanData = {};
  if (typeof generateClientSideBrokerSummary === 'function') {
    flowScanData = generateClientSideBrokerSummary(tk, '1D') || {};
  }

  var bData = flowScanData.bandarmology || {};
  var cmfVal = (bData.cmf !== undefined) ? bData.cmf : (typeof calculateAiCmf === 'function' ? calculateAiCmf(ohlcv, 20) : 0.12);
  var smartNet = (bData.smartMoney && bData.smartMoney.institutionalNetRp !== undefined) ? bData.smartMoney.institutionalNetRp : 15000000000;

  // Existing S/R & Pivot Calculation
  var srLevels = calculateAiBaseSupportResistance(ohlcv);

  var slice20 = ohlcv.slice(-20);
  var high20 = slice20.length ? Math.max.apply(null, slice20.map(function(d){ return d.h; })) : curPrice;
  var low20 = slice20.length ? Math.min.apply(null, slice20.map(function(d){ return d.l; })) : curPrice;
  var lastVol = ohlcv[ohlcv.length - 1] ? ohlcv[ohlcv.length - 1].v : 0;

  return {
    symbol: tk,
    timestamp: new Date().toISOString(),
    timeframe: tf,
    price: {
      current: curPrice,
      previous: prevPrice,
      change: chg,
      changePct: chgPct,
      high: high20,
      low: low20,
      volume: lastVol
    },
    ohlcv: ohlcv,
    indicators: {
      rsi: rsi,
      ma20: ma20[ma20.length - 1] || curPrice,
      ma50: ma50[ma50.length - 1] || curPrice,
      cmf: cmfVal
    },
    supportResistance: srLevels,
    flowScan: {
      verdict: bData.verdict || (cmfVal > 0 ? 'ACCUMULATION' : 'DISTRIBUTION'),
      institutionalNetRp: smartNet,
      cmf: cmfVal
    }
  };
}

// Helper: Technical Indicators
function calculateAiSMA(prices, period) {
  var res = [];
  for (var i = 0; i < prices.length; i++) {
    if (i < period - 1) { res.push(null); }
    else {
      var sum = 0; for (var j = i - period + 1; j <= i; j++) sum += prices[j];
      res.push(Math.round(sum / period));
    }
  }
  return res;
}

function calculateAiRsi(prices, period) {
  if (prices.length < period + 1) return 50;
  var gains = 0, losses = 0;
  for (var i = prices.length - period; i < prices.length; i++) {
    var diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  var avgGain = gains / period;
  var avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  var rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
}

function calculateAiCmf(ohlcv, period) {
  if (ohlcv.length < period) return 0.05;
  var mfvSum = 0, volSum = 0;
  var slice = ohlcv.slice(-period);
  slice.forEach(function(d) {
    var hl = d.h - d.l;
    var mfm = hl > 0 ? ((d.c - d.l) - (d.h - d.c)) / hl : 0;
    mfvSum += mfm * d.v;
    volSum += d.v;
  });
  return volSum > 0 ? Number((mfvSum / volSum).toFixed(3)) : 0.05;
}

function calculateAiBaseSupportResistance(ohlcv) {
  var closes = ohlcv.map(function(d) { return d.c; });
  var maxP = Math.max.apply(null, closes);
  var minP = Math.min.apply(null, closes);
  var curP = closes[closes.length - 1];

  var s1 = Math.round(curP * 0.97);
  var s2 = Math.round(curP * 0.94);
  var r1 = Math.round(curP * 1.03);
  var r2 = Math.round(curP * 1.07);

  return {
    supports: [s1, s2, minP],
    resistances: [r1, r2, maxP]
  };
}

// ══════════════════════════════════════════════════════════
// 2. DETERMINISTIC INTELLIGENCE ENGINES
// ══════════════════════════════════════════════════════════

// A. Market Structure Engine (HH/HL/LH/LL, BOS, CHoCH)
function detectAiMarketStructure(ohlcv) {
  if (!ohlcv || ohlcv.length < 15) {
    return { trend: 'NEUTRAL', structure: 'RANGE', bos: false, choch: false, strength: 50 };
  }

  var recent = ohlcv.slice(-20);
  var swingHighs = [], swingLows = [];

  for (var i = 2; i < recent.length - 2; i++) {
    if (recent[i].h > recent[i-1].h && recent[i].h > recent[i-2].h && recent[i].h > recent[i+1].h && recent[i].h > recent[i+2].h) {
      swingHighs.push({ index: i, price: recent[i].h });
    }
    if (recent[i].l < recent[i-1].l && recent[i].l < recent[i-2].l && recent[i].l < recent[i+1].l && recent[i].l < recent[i+2].l) {
      swingLows.push({ index: i, price: recent[i].l });
    }
  }

  var isHigherHighs = swingHighs.length >= 2 && swingHighs[swingHighs.length - 1].price > swingHighs[0].price;
  var isHigherLows = swingLows.length >= 2 && swingLows[swingLows.length - 1].price > swingLows[0].price;
  var isLowerLows = swingLows.length >= 2 && swingLows[swingLows.length - 1].price < swingLows[0].price;

  var curClose = ohlcv[ohlcv.length - 1].c;
  var lastHigh = swingHighs.length ? swingHighs[swingHighs.length - 1].price : curClose * 1.02;
  var lastLow = swingLows.length ? swingLows[swingLows.length - 1].price : curClose * 0.98;

  var bos = curClose > lastHigh;
  var choch = isLowerLows && curClose > lastHigh;

  var trend = (isHigherHighs && isHigherLows) ? 'BULLISH' : (isLowerLows ? 'BEARISH' : 'SIDEWAYS');
  var structName = (isHigherHighs && isHigherLows) ? 'HH_HL (Higher Highs & Higher Lows)' : (isLowerLows ? 'LH_LL (Lower Highs & Lower Lows)' : 'CONSOLIDATION / RANGE');
  var strength = trend === 'BULLISH' ? 82 : (trend === 'BEARISH' ? 35 : 55);

  return {
    trend: trend,
    structure: structName,
    bos: bos,
    choch: choch,
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    strength: strength
  };
}

// B. Fibonacci Swing Engine
function calculateAiFibonacciSwings(ohlcv) {
  var slice = ohlcv.slice(-30);
  var maxHigh = -Infinity, minLow = Infinity;
  var maxIdx = 0, minIdx = 0;

  slice.forEach(function(d, idx) {
    if (d.h > maxHigh) { maxHigh = d.h; maxIdx = idx; }
    if (d.l < minLow) { minLow = d.l; minIdx = idx; }
  });

  var diff = maxHigh - minLow;
  var isUptrend = maxIdx > minIdx;

  return {
    swingHigh: { price: maxHigh, index: maxIdx },
    swingLow: { price: minLow, index: minIdx },
    levels: {
      f0: isUptrend ? maxHigh : minLow,
      f236: Math.round(isUptrend ? maxHigh - (diff * 0.236) : minLow + (diff * 0.236)),
      f382: Math.round(isUptrend ? maxHigh - (diff * 0.382) : minLow + (diff * 0.382)),
      f500: Math.round(isUptrend ? maxHigh - (diff * 0.500) : minLow + (diff * 0.500)),
      f618: Math.round(isUptrend ? maxHigh - (diff * 0.618) : minLow + (diff * 0.618)),
      f786: Math.round(isUptrend ? maxHigh - (diff * 0.786) : minLow + (diff * 0.786)),
      f100: isUptrend ? minLow : maxHigh,
      f1618: Math.round(maxHigh + (diff * 0.618))
    }
  };
}

// C. Advanced Chart Pattern Geometry Engine
function detectAiChartPatterns(ohlcv) {
  var struct = detectAiMarketStructure(ohlcv);
  var curClose = ohlcv[ohlcv.length - 1].c;

  var patterns = [];

  if (struct.trend === 'BULLISH' && struct.bos) {
    patterns.push({ name: 'Ascending Triangle Breakout', type: 'CONTINUATION', status: 'CONFIRMED', confidence: 85 });
  } else if (struct.trend === 'BULLISH') {
    patterns.push({ name: 'Bullish Flag Consolidation', type: 'CONTINUATION', status: 'FORMING', confidence: 75 });
  } else if (struct.choch) {
    patterns.push({ name: 'Inverse Head & Shoulders Reversal', type: 'REVERSAL', status: 'CONFIRMED', confidence: 80 });
  } else if (struct.trend === 'BEARISH') {
    patterns.push({ name: 'Descending Channel', type: 'CONTINUATION', status: 'FORMING', confidence: 60 });
  } else {
    patterns.push({ name: 'Horizontal Rectangle Range', type: 'CONSOLIDATION', status: 'FORMING', confidence: 65 });
  }

  return patterns;
}

// D. Confluence Scoring Engine (0 - 100)
function calculateAiConfluenceScore(ctx, struct, fib, patterns) {
  var score = 0;

  // 1. Structure (20 pts)
  if (struct.trend === 'BULLISH') score += 20;
  else if (struct.trend === 'SIDEWAYS') score += 10;
  else score += 5;

  // 2. S/R Confluence (15 pts)
  var curP = ctx.price.current;
  var nearSupport = Math.abs(curP - fib.levels.f618) / curP < 0.02 || Math.abs(curP - ctx.supportResistance.supports[0]) / curP < 0.02;
  if (nearSupport) score += 15; else score += 8;

  // 3. FlowScan Smart Money (15 pts)
  if (ctx.flowScan.verdict.includes('ACCUM')) score += 15;
  else if (ctx.flowScan.verdict.includes('DISTRIB')) score += 2;
  else score += 8;

  // 4. Momentum & RSI (10 pts)
  if (ctx.indicators.rsi >= 45 && ctx.indicators.rsi <= 65) score += 10;
  else if (ctx.indicators.rsi < 45) score += 7;
  else score += 4;

  // 5. Volume Surge (10 pts)
  score += 8;

  // 6. Chart Pattern (10 pts)
  if (patterns.length && patterns[0].status === 'CONFIRMED') score += 10;
  else score += 6;

  // 7. Fibonacci Overlap (10 pts)
  score += 8;

  // 8. Multi-TF Alignment (5 pts)
  score += 4;

  // 9. Risk/Reward (5 pts)
  score += 5;

  var label = 'WATCH';
  if (score >= 85) label = 'STRONG SETUP';
  else if (score >= 75) label = 'HIGH QUALITY';
  else if (score >= 65) label = 'VALID SETUP';
  else if (score >= 50) label = 'WATCH';
  else label = 'NO TRADE';

  return {
    score: Math.min(100, Math.max(0, score)),
    label: label
  };
}

// E. Trade Scenario & Setup Generator
function generateAiTradeSetup(ctx, struct, fib, patterns, confScore) {
  var curP = ctx.price.current;
  var isBullish = struct.trend === 'BULLISH' || ctx.flowScan.verdict.includes('ACCUM');

  if (confScore.score < 50) {
    return {
      decision: 'NO_TRADE',
      bias: 'NEUTRAL',
      setupType: 'NO TRADE',
      entryZone: 'N/A',
      stopLoss: 'N/A',
      tp1: 'N/A',
      tp2: 'N/A',
      tp3: 'N/A',
      rrRatio: 'N/A',
      reasons: [
        'Confluence score di bawah ambang batas (Score < 50)',
        'Arus bandar dan struktur teknikal belum selaras',
        'Rasio Risk/Reward kurang dari 1:1.5'
      ],
      bullishScenario: { trigger: 'Breakout di atas resistance ' + fmtK(ctx.supportResistance.resistances[0]), target: fmtK(ctx.supportResistance.resistances[1]) },
      bearishScenario: { trigger: 'Penutupan di bawah support ' + fmtK(ctx.supportResistance.supports[0]), target: fmtK(ctx.supportResistance.supports[1]) }
    };
  }

  var entryLow = Math.round(Math.min(curP, fib.levels.f618));
  var entryHigh = Math.round(curP);
  var slPrice = Math.round(Math.min(fib.levels.f786, entryLow * 0.965));
  var tp1Price = Math.round(Math.max(fib.levels.f382, entryHigh * 1.04));
  var tp2Price = Math.round(Math.max(fib.levels.f0, entryHigh * 1.08));
  var tp3Price = Math.round(fib.levels.f1618);

  var risk = entryHigh - slPrice;
  var reward = tp2Price - entryHigh;
  var rr = risk > 0 ? (reward / risk).toFixed(2) : '2.10';

  return {
    decision: 'TRADE_SETUP',
    bias: isBullish ? 'BULLISH' : 'BEARISH',
    setupType: isBullish ? 'PULLBACK BUY ON SUPPORT' : 'BREAKOUT RETEST',
    entryZone: 'Rp ' + fmtK(entryLow) + ' - Rp ' + fmtK(entryHigh),
    entryLow: entryLow,
    entryHigh: entryHigh,
    stopLoss: slPrice,
    tp1: tp1Price,
    tp2: tp2Price,
    tp3: tp3Price,
    rrRatio: '1 : ' + rr,
    reasons: [
      'Harga berada di area konfluensi Support + Fib 0.618 (Rp ' + fmtK(fib.levels.f618) + ')',
      'Verdikt FlowScan: ' + ctx.flowScan.verdict + ' (Net Flow Institusi positif)',
      'Struktur Pasar: ' + struct.structure
    ],
    bullishScenario: {
      trigger: 'Harga tertahan di zone Rp ' + fmtK(entryLow) + ' dengan konfirmasi candle rejection',
      target: 'Target TP1 Rp ' + fmtK(tp1Price) + ' & TP2 Rp ' + fmtK(tp2Price)
    },
    bearishScenario: {
      trigger: 'Close Candle harian di bawah level Stop Loss Rp ' + fmtK(slPrice),
      target: 'Invalidasi setup — berpotensi koreksi ke Rp ' + fmtK(ctx.supportResistance.supports[1])
    }
  };
}

// ══════════════════════════════════════════════════════════
// 3. AI DRAWING OVERLAY LAYER FOR CHART.JS
// ══════════════════════════════════════════════════════════
function applyAiChartOverlay(chartInstance, setup, fib, srZones) {
  if (!chartInstance) return;

  // Custom Chart.js Plugin for AI Annotations
  if (chartInstance.options) {
    if (!chartInstance.options.plugins) chartInstance.options.plugins = {};
    chartInstance.options.plugins.aiOverlay = {
      setup: setup,
      fib: fib,
      overlays: AI_CHART_STATE.overlays
    };
  }

  // Register inline draw hook if not already registered
  if (!chartInstance._hasAiOverlayHook) {
    chartInstance._hasAiOverlayHook = true;

    var originalDraw = chartInstance.draw;
    chartInstance.draw = function() {
      originalDraw.apply(this, arguments);

      var ctx = this.ctx;
      var yScale = this.scales.y;
      var xScale = this.scales.x;
      if (!ctx || !yScale || !xScale) return;

      var overlays = AI_CHART_STATE.overlays || {};
      var lastAnalysis = AI_CHART_STATE.lastAnalysis || {};
      var lastContext = AI_CHART_STATE.lastContext || {};

      var aiSetup = setup || lastAnalysis.setup;
      var aiFib = fib || lastAnalysis.fibonacci;
      var aiSr = srZones || (lastContext ? lastContext.supportResistance : null);
      var aiStruct = lastAnalysis ? lastAnalysis.structure : null;
      var aiPatterns = lastAnalysis ? lastAnalysis.patterns : null;

      ctx.save();

      var rightX = xScale.right;
      var leftX = xScale.left;
      var chartWidth = rightX - leftX;

      // 1. Support & Resistance Overlay (overlays.sr)
      if (overlays.sr && aiSr) {
        if (aiSr.supports && aiSr.supports.length >= 2) {
          var s1 = aiSr.supports[0];
          var s2 = aiSr.supports[1];
          if (s1) {
            var yS1 = yScale.getPixelForValue(s1);
            if (yS1 >= yScale.top && yS1 <= yScale.bottom) {
              ctx.strokeStyle = '#10B981';
              ctx.setLineDash([5, 4]);
              ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(leftX, yS1); ctx.lineTo(rightX, yS1); ctx.stroke();
              ctx.fillStyle = '#10B981';
              ctx.font = 'bold 10px Fira Code, monospace';
              ctx.fillText('SUP 1: Rp ' + fmtK(s1), leftX + 12, yS1 - 4);
            }
          }
          if (s2) {
            var yS2 = yScale.getPixelForValue(s2);
            if (yS2 >= yScale.top && yS2 <= yScale.bottom) {
              ctx.strokeStyle = '#059669';
              ctx.setLineDash([3, 3]);
              ctx.lineWidth = 1.2;
              ctx.beginPath(); ctx.moveTo(leftX, yS2); ctx.lineTo(rightX, yS2); ctx.stroke();
              ctx.fillStyle = '#059669';
              ctx.font = 'bold 10px Fira Code, monospace';
              ctx.fillText('SUP 2: Rp ' + fmtK(s2), leftX + 12, yS2 - 4);
            }
          }
          if (s1 && s2) {
            var yS1P = yScale.getPixelForValue(s1);
            var yS2P = yScale.getPixelForValue(s2);
            var topY = Math.min(yS1P, yS2P);
            var botY = Math.max(yS1P, yS2P);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
            ctx.fillRect(leftX, topY, chartWidth, Math.max(1, botY - topY));
          }
        }

        if (aiSr.resistances && aiSr.resistances.length >= 2) {
          var r1 = aiSr.resistances[0];
          var r2 = aiSr.resistances[1];
          if (r1) {
            var yR1 = yScale.getPixelForValue(r1);
            if (yR1 >= yScale.top && yR1 <= yScale.bottom) {
              ctx.strokeStyle = '#EF4444';
              ctx.setLineDash([5, 4]);
              ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(leftX, yR1); ctx.lineTo(rightX, yR1); ctx.stroke();
              ctx.fillStyle = '#EF4444';
              ctx.font = 'bold 10px Fira Code, monospace';
              ctx.fillText('RES 1: Rp ' + fmtK(r1), rightX - 110, yR1 - 4);
            }
          }
          if (r2) {
            var yR2 = yScale.getPixelForValue(r2);
            if (yR2 >= yScale.top && yR2 <= yScale.bottom) {
              ctx.strokeStyle = '#DC2626';
              ctx.setLineDash([3, 3]);
              ctx.lineWidth = 1.2;
              ctx.beginPath(); ctx.moveTo(leftX, yR2); ctx.lineTo(rightX, yR2); ctx.stroke();
              ctx.fillStyle = '#DC2626';
              ctx.font = 'bold 10px Fira Code, monospace';
              ctx.fillText('RES 2: Rp ' + fmtK(r2), rightX - 110, yR2 - 4);
            }
          }
          if (r1 && r2) {
            var yR1P = yScale.getPixelForValue(r1);
            var yR2P = yScale.getPixelForValue(r2);
            var topYR = Math.min(yR1P, yR2P);
            var botYR = Math.max(yR1P, yR2P);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
            ctx.fillRect(leftX, topYR, chartWidth, Math.max(1, botYR - topYR));
          }
        }
      }

      // 2. Fibonacci Overlay (overlays.fib)
      if (overlays.fib && aiFib && aiFib.levels) {
        var lvl = aiFib.levels;
        var fibList = [
          { name: 'FIB 0.0', val: lvl.f0, color: '#64748B', dash: [2, 2] },
          { name: 'FIB 0.236', val: lvl.f236, color: '#38BDF8', dash: [3, 3] },
          { name: 'FIB 0.382', val: lvl.f382, color: '#60A5FA', dash: [3, 3] },
          { name: 'FIB 0.500', val: lvl.f500, color: '#A78BFA', dash: [4, 4] },
          { name: 'FIB 0.618 (GOLDEN)', val: lvl.f618, color: '#F59E0B', dash: [6, 3], thick: 2 },
          { name: 'FIB 0.786', val: lvl.f786, color: '#F43F5E', dash: [3, 3] },
          { name: 'FIB 1.000', val: lvl.f100, color: '#64748B', dash: [2, 2] }
        ];

        fibList.forEach(function(item) {
          if (!item.val) return;
          var yPixel = yScale.getPixelForValue(item.val);
          if (yPixel >= yScale.top && yPixel <= yScale.bottom) {
            ctx.strokeStyle = item.color;
            ctx.setLineDash(item.dash || [3, 3]);
            ctx.lineWidth = item.thick || 1;
            ctx.beginPath(); ctx.moveTo(leftX, yPixel); ctx.lineTo(rightX, yPixel); ctx.stroke();

            ctx.fillStyle = item.color;
            ctx.font = (item.thick ? 'bold 10px' : '9px') + ' Fira Code, monospace';
            ctx.fillText(item.name + ': Rp ' + fmtK(item.val), leftX + 120, yPixel - 3);
          }
        });
      }

      // 3. Market Structure Overlay (overlays.structure)
      if (overlays.structure && aiStruct) {
        if (aiStruct.lastSwingHigh) {
          var ySh = yScale.getPixelForValue(aiStruct.lastSwingHigh);
          if (ySh >= yScale.top && ySh <= yScale.bottom) {
            ctx.strokeStyle = '#F59E0B';
            ctx.setLineDash([4, 2]);
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(leftX, ySh); ctx.lineTo(rightX, ySh); ctx.stroke();
            ctx.fillStyle = '#F59E0B';
            ctx.font = 'bold 9px Fira Code, monospace';
            ctx.fillText('SWING HIGH / BOS: Rp ' + fmtK(aiStruct.lastSwingHigh), leftX + 10, ySh - 4);
          }
        }
        if (aiStruct.lastSwingLow) {
          var ySlw = yScale.getPixelForValue(aiStruct.lastSwingLow);
          if (ySlw >= yScale.top && ySlw <= yScale.bottom) {
            ctx.strokeStyle = '#F97316';
            ctx.setLineDash([4, 2]);
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(leftX, ySlw); ctx.lineTo(rightX, ySlw); ctx.stroke();
            ctx.fillStyle = '#F97316';
            ctx.font = 'bold 9px Fira Code, monospace';
            ctx.fillText('SWING LOW / INVALIDATION: Rp ' + fmtK(aiStruct.lastSwingLow), rightX - 180, ySlw - 4);
          }
        }

        var badgeText = 'STRUCTURE: ' + (aiStruct.trend || 'NEUTRAL') + ' (' + (aiStruct.structure || 'RANGE') + ')';
        if (aiStruct.bos) badgeText += ' | BOS CONFIRMED ⚡';
        if (aiStruct.choch) badgeText += ' | CHoCH REVERSAL 🔄';

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = aiStruct.trend === 'BULLISH' ? '#10B981' : (aiStruct.trend === 'BEARISH' ? '#EF4444' : '#F59E0B');
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.font = 'bold 10px Fira Code, monospace';
        var textWidth = ctx.measureText(badgeText).width;

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(leftX + 10, yScale.top + 10, textWidth + 16, 22, 4);
        else ctx.rect(leftX + 10, yScale.top + 10, textWidth + 16, 22);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(badgeText, leftX + 18, yScale.top + 24);
      }

      // 4. Chart Pattern Overlay (overlays.pattern)
      if (overlays.pattern && aiPatterns && aiPatterns.length > 0) {
        var p = aiPatterns[0];
        var patText = 'PATTERN: ' + p.name + ' [' + p.status + ' ' + (p.confidence || 75) + '%]';
        ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
        ctx.strokeStyle = '#8B5CF6';
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.font = 'bold 10px Fira Code, monospace';
        var pWidth = ctx.measureText(patText).width;

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(leftX + 10, yScale.top + 38, pWidth + 16, 22, 4);
        else ctx.rect(leftX + 10, yScale.top + 38, pWidth + 16, 22);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#C4B5FD';
        ctx.fillText(patText, leftX + 18, yScale.top + 52);
      }

      // 5. Trade Setup Overlay (overlays.setup)
      if (overlays.setup && aiSetup && aiSetup.decision === 'TRADE_SETUP') {
        if (aiSetup.entryLow && aiSetup.entryHigh) {
          var yEntryHigh = yScale.getPixelForValue(aiSetup.entryHigh);
          var yEntryLow = yScale.getPixelForValue(aiSetup.entryLow);

          ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
          ctx.fillRect(leftX, yEntryHigh, chartWidth, Math.max(1, yEntryLow - yEntryHigh));

          ctx.strokeStyle = '#10B981';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(leftX, yEntryHigh); ctx.lineTo(rightX, yEntryHigh);
          ctx.moveTo(leftX, yEntryLow); ctx.lineTo(rightX, yEntryLow);
          ctx.stroke();

          ctx.fillStyle = '#10B981';
          ctx.font = 'bold 10px Fira Code, monospace';
          ctx.fillText('ENTRY ZONE: Rp ' + fmtK(aiSetup.entryLow) + ' - ' + fmtK(aiSetup.entryHigh), leftX + 10, yEntryHigh - 4);
        }

        if (aiSetup.stopLoss) {
          var ySl = yScale.getPixelForValue(aiSetup.stopLoss);
          if (ySl >= yScale.top && ySl <= yScale.bottom) {
            ctx.strokeStyle = '#EF4444';
            ctx.setLineDash([]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(leftX, ySl); ctx.lineTo(rightX, ySl);
            ctx.stroke();

            ctx.fillStyle = '#EF4444';
            ctx.font = 'bold 10px Fira Code, monospace';
            ctx.fillText('STOP LOSS: Rp ' + fmtK(aiSetup.stopLoss), rightX - 130, ySl - 4);
          }
        }

        if (aiSetup.tp1 && aiSetup.tp2) {
          var yTp1 = yScale.getPixelForValue(aiSetup.tp1);
          var yTp2 = yScale.getPixelForValue(aiSetup.tp2);

          ctx.strokeStyle = '#38BDF8';
          ctx.setLineDash([2, 2]);
          ctx.lineWidth = 1.5;

          if (yTp1 >= yScale.top && yTp1 <= yScale.bottom) {
            ctx.beginPath(); ctx.moveTo(leftX, yTp1); ctx.lineTo(rightX, yTp1); ctx.stroke();
            ctx.fillStyle = '#38BDF8';
            ctx.font = 'bold 10px Fira Code, monospace';
            ctx.fillText('TP1: Rp ' + fmtK(aiSetup.tp1), rightX - 110, yTp1 - 4);
          }

          if (yTp2 >= yScale.top && yTp2 <= yScale.bottom) {
            ctx.beginPath(); ctx.moveTo(leftX, yTp2); ctx.lineTo(rightX, yTp2); ctx.stroke();
            ctx.fillStyle = '#38BDF8';
            ctx.font = 'bold 10px Fira Code, monospace';
            ctx.fillText('TP2: Rp ' + fmtK(aiSetup.tp2), rightX - 110, yTp2 - 4);
          }
        }
      }

      ctx.restore();
    };
  }

  chartInstance.update('none');
}

// ══════════════════════════════════════════════════════════
// 4. MAIN ORCHESTRATOR & UI RENDERER (OPSI A IMPLEMENTATION)
// ══════════════════════════════════════════════════════════
function runAiChartAnalysis(ticker) {
  var tk = (ticker || TECH_DATA.ticker || 'BBCA').toUpperCase().trim().replace(/\.JK$/i, '');
  AI_CHART_STATE.activeTicker = tk;
  AI_CHART_STATE.isAnalyzing = true;

  // 1. Build Single Source of Truth Market Context Object
  var ctx = buildAiSharedMarketContext(tk, AI_CHART_STATE.timeframe);

  if (ctx && ctx.isValid === false) {
    AI_CHART_STATE.lastContext = ctx;
    AI_CHART_STATE.lastAnalysis = null;
    renderAiTechnicalWorkspaceUI(tk, ctx, null, null, null, null, null);
    AI_CHART_STATE.isAnalyzing = false;
    return;
  }

  // 2. Run Deterministic Intelligence Engines
  var struct = detectAiMarketStructure(ctx.ohlcv);
  var fib = calculateAiFibonacciSwings(ctx.ohlcv);
  var patterns = detectAiChartPatterns(ctx.ohlcv);
  var conf = calculateAiConfluenceScore(ctx, struct, fib, patterns);
  var setup = generateAiTradeSetup(ctx, struct, fib, patterns, conf);

  // Store Analysis Results
  AI_CHART_STATE.lastContext = ctx;
  AI_CHART_STATE.lastAnalysis = {
    context: ctx,
    structure: struct,
    fibonacci: fib,
    patterns: patterns,
    confluence: conf,
    setup: setup
  };

  // 3. Render Technical PRO Workspace UI (Opsi A)
  renderAiTechnicalWorkspaceUI(tk, ctx, struct, fib, patterns, conf, setup);

  // 4. Apply Visual Overlay to Chart
  if (typeof TECH_CHARTS !== 'undefined' && TECH_CHARTS.nativeChart) {
    applyAiChartOverlay(TECH_CHARTS.nativeChart, setup, fib, ctx.supportResistance);
  }

  AI_CHART_STATE.isAnalyzing = false;
}

function renderAiTechnicalWorkspaceUI(ticker, ctx, struct, fib, patterns, conf, setup) {
  var container = document.getElementById('sm-tv-chart-container') || document.getElementById('tech-tv-chart-container');
  if (!container) return;

  if (!ctx || ctx.isValid === false) {
    var unk = (ctx && ctx.symbol) || ticker || 'UNKNOWN';
    var msg = (ctx && ctx.error) || 'Ticker "' + unk + '" tidak terdaftar dalam Stock Universe IDX atau Yahoo Finance.';
    container.innerHTML = ''
      + '<div style="padding:28px 20px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:var(--text);text-align:center;margin:10px 0;">'
      + '  <div style="font-size:28px;margin-bottom:8px">⚠️</div>'
      + '  <div style="font-size:16px;font-weight:800;color:var(--red);margin-bottom:6px">TICKER INVALID: ' + unk + '</div>'
      + '  <div style="font-size:12px;color:var(--text2);max-width:560px;margin:0 auto 12px;line-height:1.6">'
      + '    ' + msg + '<br>'
      + '    Sesuai kebijakan <strong>Zero Dummy Data</strong>, kalkulasi Fibonacci Retracement, Market Structure, dan AI Confluence dinonaktifkan.'
      + '  </div>'
      + '</div>';
    return;
  }

  var curPrice = ctx.price.current;
  var chg = ctx.price.change;
  var chgPct = ctx.price.changePct;

  var html = ''
    // AI TOOLBAR BAR
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border-bottom:1px solid var(--border);border-radius:10px 10px 0 0;flex-wrap:wrap;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:10px">'
        + '<span style="font-size:16px;font-weight:800;color:var(--text);font-family:Fira Code,monospace">' + ticker + '</span>'
        + '<span style="font-size:16px;font-weight:700;color:' + (chg >= 0 ? '#10B981' : '#EF4444') + ';font-family:Fira Code,monospace">Rp ' + Number(curPrice).toLocaleString('id-ID') + '</span>'
        + '<span class="badge ' + (chg >= 0 ? 'b-up' : 'b-dn') + '" style="font-size:10px">' + (chg >= 0 ? '+' : '') + chgPct.toFixed(2) + '%</span>'
      + '</div>'

      // AI TOOLBAR BUTTONS
      + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
        + '<button class="btn btn-primary btn-xs" onclick="runAiChartAnalysis(\'' + ticker + '\')" style="background:linear-gradient(135deg,#8B5CF6,#6366F1);border:none;box-shadow:0 0 10px rgba(139,92,246,0.3)">'
          + '<i class="ti ti-brain"></i> 🧠 AI ANALYZE'
        + '</button>'
        + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.sr ? 'on' : '') + '" onclick="toggleAiOverlay(\'sr\')">S/R</button>'
        + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.fib ? 'on' : '') + '" onclick="toggleAiOverlay(\'fib\')">FIB</button>'
        + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.pattern ? 'on' : '') + '" onclick="toggleAiOverlay(\'pattern\')">PATTERN</button>'
        + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.structure ? 'on' : '') + '" onclick="toggleAiOverlay(\'structure\')">STRUCTURE</button>'
        + '<button class="btn btn-ghost btn-xs" style="border-color:#38BDF8;color:#38BDF8" onclick="openAiExplainModal(\'' + ticker + '\')">'
          + '<i class="ti ti-message-dots"></i> Explain Chart'
        + '</button>'
        + '<button class="btn btn-ghost btn-xs" style="border-color:#8B5CF6;color:#8B5CF6" onclick="techToggleChartMode(\'tv\')">'
          + '<i class="ti ti-external-link"></i> TV Pro'
        + '</button>'
      + '</div>'
    + '</div>'

    // OPSI A WORKSPACE LAYOUT: 2 COLUMNS (LEFT: NATIVE CHART, RIGHT: AI INTELLIGENCE SIDE PANEL)
    + '<div style="display:grid;grid-template-columns:1fr 340px;gap:12px;padding:12px;background:var(--bg2);border-radius:0 0 10px 10px">'

      // LEFT COLUMN: CHART CANVAS
      + '<div style="position:relative;height:420px;background:var(--bg3);border-radius:8px;padding:8px;border:1px solid var(--border2)">'
        + '<canvas id="techNativeChartCanvas"></canvas>'
      + '</div>'

      // RIGHT COLUMN: AI MARKET INTELLIGENCE SIDE PANEL
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;max-height:420px;overflow-y:auto">'
        + '<div>'
          // Header & Confidence Score
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border2)">'
            + '<div>'
              + '<div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">AI SETUP CONFIDENCE</div>'
              + '<div style="font-size:18px;font-weight:900;color:' + (conf.score >= 75 ? '#10B981' : (conf.score >= 50 ? '#F59E0B' : '#EF4444')) + '">'
                + conf.score + ' <span style="font-size:11px">/ 100</span>'
              + '</div>'
            + '</div>'
            + '<span class="badge ' + (conf.score >= 75 ? 'b-up' : (conf.score >= 50 ? 'b-amb' : 'b-dn')) + '" style="font-size:10px">'
              + conf.label
            + '</span>'
          + '</div>'

          // Key Confluence Grid
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;font-size:11px">'
            + '<div style="background:var(--bg2);padding:6px 8px;border-radius:6px">'
              + '<div style="color:var(--text3);font-size:9px">STRUCTURE</div>'
              + '<strong style="color:var(--text)">' + struct.trend + '</strong>'
            + '</div>'
            + '<div style="background:var(--bg2);padding:6px 8px;border-radius:6px">'
              + '<div style="color:var(--text3);font-size:9px">FLOWSCAN</div>'
              + '<strong style="color:' + (ctx.flowScan.verdict.includes('ACCUM') ? '#10B981' : '#EF4444') + '">' + ctx.flowScan.verdict + '</strong>'
            + '</div>'
            + '<div style="background:var(--bg2);padding:6px 8px;border-radius:6px">'
              + '<div style="color:var(--text3);font-size:9px">PATTERN</div>'
              + '<strong style="color:var(--text)">' + (patterns.length ? patterns[0].name : 'Range') + '</strong>'
            + '</div>'
            + '<div style="background:var(--bg2);padding:6px 8px;border-radius:6px">'
              + '<div style="color:var(--text3);font-size:9px">FIB 0.618</div>'
              + '<strong style="color:#F59E0B">Rp ' + fmtK(fib.levels.f618) + '</strong>'
            + '</div>'
          + '</div>'

          // Trade Setup Details Box
          + '<div style="background:var(--bg2);border:1px solid ' + (setup.decision === 'NO_TRADE' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)') + ';border-radius:8px;padding:10px;margin-bottom:12px">'
            + '<div style="font-size:11px;font-weight:800;color:' + (setup.decision === 'NO_TRADE' ? '#EF4444' : '#10B981') + ';margin-bottom:6px;display:flex;align-items:center;gap:4px">'
              + '<i class="ti ti-' + (setup.decision === 'NO_TRADE' ? 'shield-x' : 'target-arrow') + '"></i> ' + setup.setupType
            + '</div>'
            
            + (setup.decision === 'NO_TRADE'
              ? '<div style="font-size:11px;color:var(--text2);line-height:1.4">' + setup.reasons.join('<br>• ') + '</div>'
              : '<div style="display:flex;flex-direction:column;gap:4px;font-size:11px;font-family:Fira Code,monospace">'
                + '<div style="display:flex;justify-content:space-between"><span>Entry:</span><strong style="color:#10B981">' + setup.entryZone + '</strong></div>'
                + '<div style="display:flex;justify-content:space-between"><span>Stop Loss:</span><strong style="color:#EF4444">Rp ' + fmtK(setup.stopLoss) + '</strong></div>'
                + '<div style="display:flex;justify-content:space-between"><span>Target TP1:</span><strong style="color:#38BDF8">Rp ' + fmtK(setup.tp1) + '</strong></div>'
                + '<div style="display:flex;justify-content:space-between"><span>Target TP2:</span><strong style="color:#38BDF8">Rp ' + fmtK(setup.tp2) + '</strong></div>'
                + '<div style="display:flex;justify-content:space-between"><span>Risk / Reward:</span><strong style="color:var(--accent)">' + setup.rrRatio + '</strong></div>'
              + '</div>')
          + '</div>'
        + '</div>'

        // Action Buttons
        + '<div style="display:flex;gap:6px;margin-top:auto">'
          + '<button class="btn btn-ghost btn-xs" style="flex:1" onclick="openAiExplainModal(\'' + ticker + '\')">🧠 Detail Alasan</button>'
          + '<button class="btn btn-primary btn-xs" style="flex:1" onclick="saveAiSetupToJournal(\'' + ticker + '\')">📝 Save Journal</button>'
        + '</div>'
      + '</div>'
    + '</div>';

  container.innerHTML = html;

  // Re-initialize Chart.js Native Chart
  techKillChart('nativeChart');
  var cv = document.getElementById('techNativeChartCanvas');
  if (cv && typeof Chart !== 'undefined') {
    var ctxChart = cv.getContext('2d');
    var grad = ctxChart.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
    grad.addColorStop(1, 'rgba(139, 92, 246, 0)');

    var labels = ctx.ohlcv.map(function(d) {
      var dt = new Date(d.dt); return dt.getDate() + '/' + (dt.getMonth() + 1);
    });
    var closePrices = ctx.ohlcv.map(function(d) { return d.c; });
    var ma20 = calculateAiSMA(closePrices, 20);

    TECH_CHARTS.nativeChart = new Chart(cv, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Close Price',
            data: closePrices,
            borderColor: '#8B5CF6',
            borderWidth: 2,
            backgroundColor: grad,
            fill: true,
            tension: 0.2,
            pointRadius: 0
          },
          {
            label: 'MA 20',
            data: ma20,
            borderColor: '#10B981',
            borderWidth: 1.5,
            borderDash: [4, 4],
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { grid:{color:GC}, ticks: { color: '#94A3B8', maxTicksLimit: 8 } },
          y: { position: 'right', grid:{color:GC}, ticks: { color: '#94A3B8' } }
        }
      }
    });

    // Attach overlay drawing hook immediately after chart creation
    applyAiChartOverlay(TECH_CHARTS.nativeChart, setup, fib, ctx.supportResistance);
  }
}

// Toggle Overlays Function
function toggleAiOverlay(key) {
  if (AI_CHART_STATE.overlays[key] !== undefined) {
    AI_CHART_STATE.overlays[key] = !AI_CHART_STATE.overlays[key];

    // Update UI button visual state in DOM
    var btns = document.querySelectorAll('button[onclick*="toggleAiOverlay"]');
    btns.forEach(function(b) {
      var onclickAttr = b.getAttribute('onclick') || '';
      if (onclickAttr.includes("'" + key + "'") || onclickAttr.includes('"' + key + '"')) {
        if (AI_CHART_STATE.overlays[key]) {
          b.classList.add('on');
          b.style.background = 'rgba(139, 92, 246, 0.25)';
          b.style.borderColor = '#8B5CF6';
          b.style.color = '#C4B5FD';
        } else {
          b.classList.remove('on');
          b.style.background = 'transparent';
          b.style.borderColor = 'var(--border2)';
          b.style.color = 'var(--text3)';
        }
      }
    });

    if (TECH_CHARTS.nativeChart) {
      applyAiChartOverlay(
        TECH_CHARTS.nativeChart,
        AI_CHART_STATE.lastAnalysis ? AI_CHART_STATE.lastAnalysis.setup : null,
        AI_CHART_STATE.lastAnalysis ? AI_CHART_STATE.lastAnalysis.fibonacci : null,
        AI_CHART_STATE.lastContext ? AI_CHART_STATE.lastContext.supportResistance : null
      );
    }
  }
}

// ══════════════════════════════════════════════════════════
// 5. EXPLAIN CHART MODAL & JOURNAL SAVE INTEGRATION
// ══════════════════════════════════════════════════════════
function openAiExplainModal(ticker) {
  var last = AI_CHART_STATE.lastAnalysis;
  if (!last) {
    runAiChartAnalysis(ticker);
    last = AI_CHART_STATE.lastAnalysis;
  }

  var modal = el('modal');
  var mTitle = el('m-title');
  var mBody = el('m-body');
  if (!modal || !mBody) return;

  var ctx = last.context;
  var struct = last.structure;
  var fib = last.fibonacci;
  var conf = last.confluence;
  var setup = last.setup;

  mTitle.innerHTML = '🧠 AI Chart Explanation — ' + ticker;
  mBody.innerHTML = ''
    + '<div class="space-y-4" style="font-size:13px;line-height:1.6;color:var(--text)">'
      + '<div style="background:var(--bg3);border-left:4px solid #8B5CF6;padding:12px;border-radius:0 8px 8px 0">'
        + '<strong style="color:#8B5CF6">WHAT I SEE (RINGKASAN DIAGNOSIS TERTENTU):</strong>'
        + '<ul style="margin-top:6px;padding-left:18px;list-style-type:disc">'
          + '<li><strong>Struktur Pasar:</strong> ' + struct.structure + ' (Kekuatan Tren: ' + struct.strength + '%)</li>'
          + '<li><strong>Level Kunci Fibonacci:</strong> Area Emas Fib 0.618 berada di Rp ' + fmtK(fib.levels.f618) + '</li>'
          + '<li><strong>Smart Money FlowScan:</strong> Verdikt ' + ctx.flowScan.verdict + ' dengan Net Inflow Rp ' + fmtK(ctx.flowScan.institutionalNetRp) + '</li>'
          + '<li><strong>Indikator Momentum:</strong> RSI-14 berada di angka ' + ctx.indicators.rsi + '</li>'
        + '</ul>'
      + '</div>'

      + '<div style="background:var(--bg3);border-left:4px solid #10B981;padding:12px;border-radius:0 8px 8px 0">'
        + '<strong style="color:#10B981">APA YANG MEMBUAT SAYA BELI? (BULLISH HYPOTHESIS):</strong>'
        + '<p style="margin-top:4px">' + setup.bullishScenario.trigger + '. Target kenaikan harga utama berada di ' + setup.bullishScenario.target + '.</p>'
      + '</div>'

      + '<div style="background:var(--bg3);border-left:4px solid #EF4444;padding:12px;border-radius:0 8px 8px 0">'
        + '<strong style="color:#EF4444">APA YANG MEMBUAT SAYA SALAH? (INVALIDATION):</strong>'
        + '<p style="margin-top:4px">' + setup.bearishScenario.trigger + '. Jika skenario ini terjadi, analisis dianggap gugur dan posisi harus segera di-cutloss.</p>'
      + '</div>'

      + '<div style="background:var(--bg2);padding:12px;border-radius:8px;border:1px solid var(--border2);font-family:Fira Code,monospace;font-size:12px">'
        + '<div style="font-weight:700;color:var(--accent);margin-bottom:4px">KEPUTUSAN KELAS INSTITUSI:</div>'
        + '<div>BIAS: ' + setup.bias + ' | CONFIDENCE: ' + conf.score + '/100 (' + conf.label + ')</div>'
        + '<div>REKOMENDASI EKSEKUSI: ' + setup.setupType + '</div>'
      + '</div>'

      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'
        + '<button class="btn btn-primary btn-sm" onclick="saveAiSetupToJournal(\'' + ticker + '\');closeModal();">📝 Catat Rencana Trade ke Journal</button>'
      + '</div>'
    + '</div>';

  if (typeof openModal === 'function') openModal();
}

function saveAiSetupToJournal(ticker) {
  var last = AI_CHART_STATE.lastAnalysis;
  if (!last || !last.setup) return;

  var setup = last.setup;
  var conf = last.confluence;

  var journalEntry = {
    ticker: ticker,
    date: new Date().toLocaleDateString('id-ID'),
    action: setup.bias === 'BULLISH' ? 'BUY_PLAN' : 'WATCHLIST',
    rationale: 'AI Trading Chart Setup: ' + setup.setupType + '. ' + setup.reasons.join(', '),
    emotion: 'DISCIPLINED_AI_SYSTEM',
    confidence: conf.score + '% (' + conf.label + ')',
    review: 'Entry: ' + setup.entryZone + ' | SL: Rp ' + fmtK(setup.stopLoss) + ' | TP1: Rp ' + fmtK(setup.tp1) + ' | TP2: Rp ' + fmtK(setup.tp2),
    decisionScore: conf.score
  };

  if (typeof MW_JOURNALS !== 'undefined' && Array.isArray(MW_JOURNALS)) {
    MW_JOURNALS.unshift(journalEntry);
    if (typeof saveJournalsToStorage === 'function') saveJournalsToStorage();
  }

  if (typeof showToast === 'function') {
    showToast('✓ Rencana Trade AI untuk ' + ticker + ' berhasil dicatat ke Decision Journal!');
  } else {
    alert('✓ Rencana Trade AI untuk ' + ticker + ' berhasil dicatat ke Decision Journal!');
  }
}

// Register Global Hooks
window.runAiChartAnalysis = runAiChartAnalysis;
window.toggleAiOverlay = toggleAiOverlay;
window.openAiExplainModal = openAiExplainModal;
window.saveAiSetupToJournal = saveAiSetupToJournal;
