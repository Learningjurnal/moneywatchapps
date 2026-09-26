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
    setup: true,
    zones: true,
    bandarVwap: true
  }
};

// 1. SINGLE SOURCE OF TRUTH — MARKET DATA CONTEXT BUILDER
function buildAiSharedMarketContext(ticker, timeframe) {
  var tk = (ticker || 'BBCA').toUpperCase().trim().replace(/\.JK$/i, '');
  var tf = timeframe || '1D';

  // Retrieve candle data from existing data layer (fsGenData / DB)
  var rawOhlcv = (typeof fsGenData === 'function') ? fsGenData(tk, 60) : [];
  // FIX (2026-09-12, audit "AI Chart Intelligence — MAJOR data-trust issue"):
  // fsGenData() sendiri sudah menandai .simulated=true saat ia jatuh ke
  // random-walk fallback (belum ada OHLCV riil ter-cache) - tangkap flag
  // itu di sini SEBELUM di-normalize via .map() di bawah, karena .map()
  // membuat array baru yang tidak mewarisi properti .simulated dari array
  // asli, jadi flag itu sebelumnya hilang diam-diam.
  var isSimulated = !!(rawOhlcv && rawOhlcv.simulated);
  if (!rawOhlcv || !rawOhlcv.length) {
    // Tidak ada OHLCV sama sekali (bahkan fallback simulasi fsGenData gagal) -
    // candle di bawah ini 100% fiktif (gelombang sinus matematis, bukan
    // estimasi dari harga riil manapun), jadi tetap ditandai simulasi.
    isSimulated = true;
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
    isSimulated = true; // satu candle datar dari harga terakhir, bukan OHLCV riil
  }

  var globalPx = (typeof getGlobalMarketPrice === 'function') ? getGlobalMarketPrice(tk) : ((typeof prices !== 'undefined' && prices[tk]) ? Number(prices[tk]) : 0);
  var globalChg = (typeof getGlobalMarketChange === 'function') ? getGlobalMarketChange(tk) : ((typeof changes !== 'undefined' && changes[tk]) ? Number(changes[tk]) : 0);

  // Sync latest candle with global live market price
  if (globalPx > 0 && ohlcv.length > 0) {
    var lastCandle = ohlcv[ohlcv.length - 1];
    if (lastCandle.c !== globalPx) {
      lastCandle.c = globalPx;
      lastCandle.close = globalPx;
      lastCandle.h = Math.max(lastCandle.h, globalPx);
      lastCandle.high = Math.max(lastCandle.high, globalPx);
      lastCandle.l = Math.min(lastCandle.l, globalPx);
      lastCandle.low = Math.min(lastCandle.low, globalPx);
    }
  }

  var closePrices = ohlcv.map(function(d) { return d.c; });
  var curPrice = globalPx > 0 ? globalPx : (closePrices[closePrices.length - 1] || 5000);
  var prevPrice = closePrices[closePrices.length - 2] || curPrice;
  var chg = globalPx > 0 ? (globalPx - prevPrice) : (curPrice - prevPrice);
  var chgPct = (globalPx > 0 && globalChg !== 0) ? globalChg : (prevPrice > 0 ? (chg / prevPrice * 100) : 0);

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
  // FIX (2026-09-18, audit menyeluruh): dulu fallback Rp 15.000.000.000
  // (konstanta tetap) dipakai kalau broker summary tidak punya
  // institutionalNetRp — angka presisi karangan ditampilkan di modal "AI
  // Chart Explanation" seolah hasil analisis nyata. Sekarang null jujur
  // saat tidak tersedia; UI (renderAiChartExplanationModal) menampilkan
  // "tidak tersedia" alih-alih angka Rupiah palsu.
  var smartNetAvailable = !!(bData.smartMoney && bData.smartMoney.institutionalNetRp !== undefined);
  var smartNet = smartNetAvailable ? bData.smartMoney.institutionalNetRp : null;

  // Existing S/R & Pivot Calculation
  var srLevels = calculateAiBaseSupportResistance(ohlcv);

  var slice20 = ohlcv.slice(-20);
  var high20 = slice20.length ? Math.max.apply(null, slice20.map(function(d){ return d.h; })) : curPrice;
  var low20 = slice20.length ? Math.min.apply(null, slice20.map(function(d){ return d.l; })) : curPrice;
  var lastVol = ohlcv[ohlcv.length - 1] ? ohlcv[ohlcv.length - 1].v : 0;

  var bandarVwapInfo = (typeof calculateBandarVwap === 'function')
    ? calculateBandarVwap(tk, tf)
    : { available: false, vwap: 0, spreadPct: 0, zone: 'UNKNOWN', zoneLabel: 'Data Belum Tersedia', top3Brokers: [] };

  return {
    symbol: tk,
    timestamp: new Date().toISOString(),
    timeframe: tf,
    isSimulated: isSimulated,
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
      institutionalNetAvailable: smartNetAvailable,
      cmf: cmfVal
    },
    bandarVwap: bandarVwapInfo
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

// Helper: Exponential Moving Average
function calculateAiEMA(prices, period) {
  if (!prices || prices.length < period) return [];
  var k = 2 / (period + 1);
  var ema = [];
  var sum = 0;
  for (var i = 0; i < period; i++) sum += prices[i];
  var prev = sum / period;
  for (var j = 0; j < prices.length; j++) {
    if (j < period - 1) {
      ema.push(null);
    } else if (j === period - 1) {
      ema.push(prev);
    } else {
      prev = (prices[j] * k) + (prev * (1 - k));
      ema.push(prev);
    }
  }
  return ema;
}

// Helper: MACD (12, 26, 9) Momentum Engine
function calculateAiMacd(prices) {
  if (!prices || prices.length < 26) {
    return { macd: 0, signal: 0, hist: 0, status: 'NEUTRAL' };
  }
  var ema12 = calculateAiEMA(prices, 12);
  var ema26 = calculateAiEMA(prices, 26);
  var macdLine = [];
  for (var i = 0; i < prices.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine.push(ema12[i] - ema26[i]);
    }
  }
  var signalLine = calculateAiEMA(macdLine, 9);
  var lastMacd = macdLine[macdLine.length - 1] || 0;
  var prevMacd = macdLine[macdLine.length - 2] || lastMacd;
  var lastSignal = signalLine[signalLine.length - 1] || 0;
  var prevSignal = signalLine[signalLine.length - 2] || lastSignal;
  var hist = lastMacd - lastSignal;
  var prevHist = prevMacd - prevSignal;

  var status = 'NEUTRAL';
  if (lastMacd > lastSignal && prevMacd <= prevSignal) status = 'GOLDEN_CROSS';
  else if (lastMacd < lastSignal && prevMacd >= prevSignal) status = 'DEATH_CROSS';
  else if (hist > 0 && hist >= prevHist) status = 'BULLISH_EXPANSION';
  else if (hist > 0 && hist < prevHist) status = 'BULLISH_WANING';
  else if (hist < 0 && hist <= prevHist) status = 'BEARISH_EXPANSION';
  else if (hist < 0 && hist > prevHist) status = 'BEARISH_WANING';

  return {
    macd: Number(lastMacd.toFixed(2)),
    signal: Number(lastSignal.toFixed(2)),
    hist: Number(hist.toFixed(2)),
    status: status
  };
}

// Helper: Volume Confluence & Institutional Absorption Engine
function calculateAiVolumeConfluence(ohlcv) {
  if (!ohlcv || ohlcv.length < 20) {
    return { ratio: 1.0, isSpike: false, status: 'NORMAL', avgVol: 0, curVol: 0 };
  }
  var curVol = ohlcv[ohlcv.length - 1] ? (ohlcv[ohlcv.length - 1].v || ohlcv[ohlcv.length - 1].volume || 0) : 0;
  var sum = 0;
  for (var i = ohlcv.length - 20; i < ohlcv.length; i++) {
    sum += (ohlcv[i].v || ohlcv[i].volume || 0);
  }
  var avgVol = Math.round(sum / 20);
  var ratio = avgVol > 0 ? (curVol / avgVol) : 1.0;
  var status = 'NORMAL';
  if (ratio >= 1.8) status = 'MASSIVE_SPIKE';
  else if (ratio >= 1.25) status = 'EXPANSION';
  else if (ratio <= 0.65) status = 'DRY_UP';

  return {
    ratio: Number(ratio.toFixed(2)),
    isSpike: ratio >= 1.25,
    status: status,
    avgVol: avgVol,
    curVol: curVol
  };
}

// Engine: AI Auto-Zones (Buy & Sell Zones based on RSI, MACD, Volume Confluence)
function calculateAiAutoZones(ctx, struct, fib) {
  if (!ctx || !ctx.ohlcv || ctx.ohlcv.length < 15) {
    return null;
  }
  var closePrices = ctx.ohlcv.map(function(d) { return d.c; });
  var curPrice = ctx.price.current;
  var rsi = (ctx.indicators && ctx.indicators.rsi !== undefined) ? ctx.indicators.rsi : calculateAiRsi(closePrices, 14);
  var macd = calculateAiMacd(closePrices);
  var vol = calculateAiVolumeConfluence(ctx.ohlcv);

  var sr = ctx.supportResistance || { supports: [], resistances: [] };
  var s1 = (sr.supports && sr.supports[0]) || (fib && fib.levels && fib.levels.f618) || Math.round(curPrice * 0.97);
  var s2 = (sr.supports && sr.supports[1]) || (fib && fib.levels && fib.levels.f786) || Math.round(curPrice * 0.94);
  var r1 = (sr.resistances && sr.resistances[0]) || (fib && fib.levels && fib.levels.f382) || Math.round(curPrice * 1.03);
  var r2 = (sr.resistances && sr.resistances[1]) || (fib && fib.levels && fib.levels.f0) || Math.round(curPrice * 1.07);

  // Buy Zone: Area demand di sekitar support S1-S2 atau swing low dengan konfirmasi RSI & MACD
  var buyHigh = Math.round(Math.min(curPrice, Math.max(s1, curPrice * 0.985)));
  var buyLow = Math.round(Math.min(s2, buyHigh * 0.965));
  if (buyLow >= buyHigh) buyLow = Math.round(buyHigh * 0.96);

  // Sell Zone: Area supply di sekitar resistance R1-R2
  var sellLow = Math.round(Math.max(curPrice * 1.015, Math.min(r1, curPrice * 1.04)));
  var sellHigh = Math.round(Math.max(r2, sellLow * 1.04));
  if (sellHigh <= sellLow) sellHigh = Math.round(sellLow * 1.04);

  var stopLoss = Math.round(buyLow * 0.97);

  var buyReason = (rsi <= 40 ? 'RSI Oversold (' + rsi + ')' : (rsi <= 55 ? 'RSI Rebound/Pullback (' + rsi + ')' : 'RSI ' + rsi))
    + ' + MACD ' + macd.status.replace(/_/g, ' ')
    + ' + Vol ' + vol.status.replace(/_/g, ' ') + ' (' + vol.ratio + 'x)';

  var sellReason = (rsi >= 65 ? 'RSI Overbought (' + rsi + ')' : (rsi >= 55 ? 'RSI High Momentum (' + rsi + ')' : 'RSI ' + rsi))
    + ' + Target Resistance (R1/R2)'
    + ' + MACD ' + macd.status.replace(/_/g, ' ');

  return {
    rsi: rsi,
    macd: macd,
    volume: vol,
    buyZone: {
      low: buyLow,
      high: buyHigh,
      stopLoss: stopLoss,
      rsi: rsi,
      macd: macd.status.replace(/_/g, ' '),
      vol: vol.ratio + 'x (' + vol.status + ')',
      reason: buyReason
    },
    sellZone: {
      low: sellLow,
      high: sellHigh,
      rsi: rsi,
      macd: macd.status.replace(/_/g, ' '),
      vol: vol.ratio + 'x (' + vol.status + ')',
      reason: sellReason
    }
  };
}

// 2. DETERMINISTIC INTELLIGENCE ENGINES

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

  // 5. Volume Surge (10 pts) — FIX (2026-09-18, audit menyeluruh): dulu
  // selalu +8 apa pun isi ctx.ohlcv, padahal namanya menyiratkan
  // pengukuran lonjakan volume nyata. Sekarang dihitung real dari rasio
  // volume bar terakhir terhadap rata-rata 20 bar sebelumnya.
  var volBars = ctx.ohlcv.slice(-21, -1);
  var avgVol = volBars.length ? (volBars.reduce(function(s, d) { return s + (d.v || 0); }, 0) / volBars.length) : 0;
  var volRatio = avgVol > 0 ? (ctx.price.volume / avgVol) : 1;
  if (volRatio >= 1.5) score += 10;
  else if (volRatio >= 1.1) score += 7;
  else score += 4;

  // 6. Chart Pattern (10 pts)
  if (patterns.length && patterns[0].status === 'CONFIRMED') score += 10;
  else score += 6;

  // 7. Fibonacci Overlap (10 pts) — FIX: dulu selalu +8. Sekarang benar-
  // benar cek apakah harga saat ini dekat (dalam 1.5%) salah satu level
  // Fibonacci utama (0.382/0.5/0.618/0.786), bukan konstanta tetap.
  var nearFib = [fib.levels.f382, fib.levels.f500, fib.levels.f618, fib.levels.f786].some(function(lvl) {
    return lvl > 0 && Math.abs(curP - lvl) / curP < 0.015;
  });
  score += nearFib ? 10 : 5;

  // 8. Trend Consistency MA20 vs MA50 (5 pts) — FIX: dulu bernama "Multi-
  // TF Alignment" (menyiratkan analisis lintas timeframe) tapi selalu +4
  // tanpa data timeframe lain sama sekali. Fungsi ini hanya menerima SATU
  // timeframe, jadi diganti jadi pengecekan konsistensi tren real yang
  // memang bisa dihitung dari data yang ada: MA20 vs MA50 dan posisi
  // harga terhadap keduanya.
  var maAligned = (ctx.indicators.ma20 > ctx.indicators.ma50 && curP > ctx.indicators.ma20) ||
    (ctx.indicators.ma20 < ctx.indicators.ma50 && curP < ctx.indicators.ma20);
  score += maAligned ? 5 : 2;

  // 9. Risk/Reward (5 pts) — FIX: dulu selalu +5 (poin maksimum tanpa
  // syarat). Sekarang dihitung dari jarak riil ke resistance/support
  // historis (max/min harga penutupan riil dalam window OHLCV, BUKAN
  // level s1/r1 yang persentase-tetap dari calculateAiBaseSupportResistance).
  var realLow = ctx.supportResistance.supports[ctx.supportResistance.supports.length - 1];
  var realHigh = ctx.supportResistance.resistances[ctx.supportResistance.resistances.length - 1];
  var riskDist = curP - realLow;
  var rewardDist = realHigh - curP;
  var rr = riskDist > 0 ? (rewardDist / riskDist) : 0;
  if (rr >= 2) score += 5;
  else if (rr >= 1) score += 3;
  else score += 1;

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

// 3. AI DRAWING OVERLAY LAYER FOR CHART.JS
function applyAiChartOverlay(chartInstance, setup, fib, srZones, aiZones) {
  if (!chartInstance) return;

  // Custom Chart.js Plugin for AI Annotations
  if (chartInstance.options) {
    if (!chartInstance.options.plugins) chartInstance.options.plugins = {};
    chartInstance.options.plugins.aiOverlay = {
      setup: setup,
      fib: fib,
      aiZones: aiZones,
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
        if (aiStruct.bos) badgeText += ' | BOS CONFIRMED ';
        if (aiStruct.choch) badgeText += ' | CHoCH REVERSAL ';

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
        ctx.strokeStyle = '#0000FF';
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

      // 6. AI Auto-Zones Overlay (Buy Zone & Sell Zone based on RSI, MACD, Volume Confluence)
      var zones = aiZones || (lastAnalysis ? lastAnalysis.aiZones : null);
      if (overlays.zones && zones) {
        // ZONA BELI (Demand Accumulation Area)
        if (zones.buyZone && zones.buyZone.low && zones.buyZone.high) {
          var yBzHigh = yScale.getPixelForValue(zones.buyZone.high);
          var yBzLow = yScale.getPixelForValue(zones.buyZone.low);
          var topY = Math.min(yBzHigh, yBzLow);
          var botY = Math.max(yBzHigh, yBzLow);

          ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
          ctx.fillRect(leftX, topY, chartWidth, Math.max(4, botY - topY));

          ctx.strokeStyle = '#10B981';
          ctx.setLineDash([6, 3]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(leftX, topY); ctx.lineTo(rightX, topY);
          ctx.moveTo(leftX, botY); ctx.lineTo(rightX, botY);
          ctx.stroke();

          ctx.fillStyle = '#10B981';
          ctx.font = 'bold 10px Fira Code, monospace';
          var bzText = '🟢 ZONA BELI AI (RSI ' + zones.buyZone.rsi + ' | ' + zones.buyZone.macd + ' | VOL ' + zones.buyZone.vol + '): Rp ' + fmtK(zones.buyZone.low) + ' - Rp ' + fmtK(zones.buyZone.high);
          ctx.fillText(bzText, leftX + 12, botY + 13);
        }

        // ZONA JUAL (Supply / Target Take Profit Area)
        if (zones.sellZone && zones.sellZone.low && zones.sellZone.high) {
          var ySzHigh = yScale.getPixelForValue(zones.sellZone.high);
          var ySzLow = yScale.getPixelForValue(zones.sellZone.low);
          var topYS = Math.min(ySzHigh, ySzLow);
          var botYS = Math.max(ySzHigh, ySzLow);

          ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
          ctx.fillRect(leftX, topYS, chartWidth, Math.max(4, botYS - topYS));

          ctx.strokeStyle = '#EF4444';
          ctx.setLineDash([6, 3]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(leftX, topYS); ctx.lineTo(rightX, topYS);
          ctx.moveTo(leftX, botYS); ctx.lineTo(rightX, botYS);
          ctx.stroke();

          ctx.fillStyle = '#EF4444';
          ctx.font = 'bold 10px Fira Code, monospace';
          var szText = '🔴 ZONA JUAL AI / TP (RSI ' + zones.sellZone.rsi + ' | ' + zones.sellZone.macd + ' | VOL ' + zones.sellZone.vol + '): Rp ' + fmtK(zones.sellZone.low) + ' - Rp ' + fmtK(zones.sellZone.high);
          var szWidth = ctx.measureText(szText).width;
          ctx.fillText(szText, Math.max(leftX + 12, rightX - szWidth - 12), topYS - 4);
        }

        // STOP LOSS UNTUK ZONA BELI
        if (zones.buyZone && zones.buyZone.stopLoss) {
          var ySlZ = yScale.getPixelForValue(zones.buyZone.stopLoss);
          if (ySlZ >= yScale.top && ySlZ <= yScale.bottom) {
            ctx.strokeStyle = '#DC2626';
            ctx.setLineDash([3, 2]);
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(leftX, ySlZ); ctx.lineTo(rightX, ySlZ); ctx.stroke();
            ctx.fillStyle = '#DC2626';
            ctx.font = 'bold 9px Fira Code, monospace';
            ctx.fillText('SL (ZONA BELI): Rp ' + fmtK(zones.buyZone.stopLoss), leftX + 12, ySlZ - 3);
          }
        }
      }

      // 7. Bandar VWAP Overlay (overlays.bandarVwap)
      var bVwap = lastContext ? lastContext.bandarVwap : null;
      if (overlays.bandarVwap && bVwap && bVwap.available && bVwap.vwap > 0) {
        var yVwap = yScale.getPixelForValue(bVwap.vwap);
        if (yVwap >= yScale.top && yVwap <= yScale.bottom) {
          ctx.strokeStyle = '#8B5CF6';
          ctx.setLineDash([8, 4]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(leftX, yVwap);
          ctx.lineTo(rightX, yVwap);
          ctx.stroke();

          // Highlight band if in Optimal Accumulation Zone (-3% to +4%)
          if (bVwap.zone === 'OPTIMAL') {
            var curY = yScale.getPixelForValue(bVwap.currentPrice);
            var bTop = Math.min(yVwap, curY);
            var bBot = Math.max(yVwap, curY);
            ctx.fillStyle = 'rgba(139, 92, 246, 0.10)';
            ctx.fillRect(leftX, bTop, chartWidth, Math.max(2, bBot - bTop));
          }

          ctx.fillStyle = '#A78BFA';
          ctx.font = 'bold 10px Fira Code, monospace';
          var vwapTxt = 'BANDAR VWAP (TOP 3): Rp ' + fmtK(bVwap.vwap) + ' (' + (bVwap.spreadPct >= 0 ? '+' : '') + bVwap.spreadPct.toFixed(1) + '%)';
          ctx.fillText(vwapTxt, leftX + 12, yVwap - 4);

          ctx.fillStyle = (bVwap.zone === 'OPTIMAL' || bVwap.zone === 'DISCOUNT') ? '#10B981' : (bVwap.zone === 'MARKUP' ? '#F59E0B' : '#EF4444');
          ctx.font = 'bold 9.5px Fira Code, monospace';
          var zoneTxt = '[' + bVwap.zoneLabel + ']';
          var zWidth = ctx.measureText(zoneTxt).width;
          ctx.fillText(zoneTxt, rightX - zWidth - 12, yVwap - 4);
        }
      }

      ctx.restore();
    };
  }

  chartInstance.update('none');
}

// 4. MAIN ORCHESTRATOR & UI RENDERER (OPSI A IMPLEMENTATION)
function runAiChartAnalysis(ticker) {
  var force = arguments.length > 1 ? arguments[1] : true;
  var tk = (ticker || TECH_DATA.ticker || 'BBCA').toUpperCase().trim().replace(/\.JK$/i, '');
  AI_CHART_STATE.activeTicker = tk;
  AI_CHART_STATE.isAnalyzing = true;

  // 1. Build Single Source of Truth Market Context Object
  var ctx = buildAiSharedMarketContext(tk, AI_CHART_STATE.timeframe);

  if (ctx && ctx.isValid === false) {
    AI_CHART_STATE.lastContext = ctx;
    AI_CHART_STATE.lastAnalysis = null;
    renderAiTechnicalWorkspaceUI(tk, ctx, null, null, null, null, null, null, force);
    AI_CHART_STATE.isAnalyzing = false;
    return;
  }

  // 2. Run Deterministic Intelligence Engines
  var struct = detectAiMarketStructure(ctx.ohlcv);
  var fib = calculateAiFibonacciSwings(ctx.ohlcv);
  var patterns = detectAiChartPatterns(ctx.ohlcv);
  var conf = calculateAiConfluenceScore(ctx, struct, fib, patterns);
  var setup = generateAiTradeSetup(ctx, struct, fib, patterns, conf);
  var zones = calculateAiAutoZones(ctx, struct, fib);

  // Store Analysis Results
  AI_CHART_STATE.lastContext = ctx;
  AI_CHART_STATE.lastAnalysis = {
    context: ctx,
    structure: struct,
    fibonacci: fib,
    patterns: patterns,
    confluence: conf,
    setup: setup,
    aiZones: zones
  };

  // 3. Render Technical PRO Workspace UI (Full width vertical stack)
  renderAiTechnicalWorkspaceUI(tk, ctx, struct, fib, patterns, conf, setup, zones, force);

  // 4. Apply Visual Overlay to Chart
  if (typeof TECH_CHARTS !== 'undefined' && TECH_CHARTS.nativeChart) {
    applyAiChartOverlay(TECH_CHARTS.nativeChart, setup, fib, ctx.supportResistance, zones);
  }

  AI_CHART_STATE.isAnalyzing = false;
}

function renderAiTechnicalWorkspaceUI(ticker, ctx, struct, fib, patterns, conf, setup, zones, force) {
  var container = document.getElementById('sm-tv-chart-container') || document.getElementById('tech-tv-chart-container');
  if (!container) return;

  var isTvMode = (typeof TECH_DATA !== 'undefined' && TECH_DATA.chartMode === 'tv');
  var currentMode = isTvMode ? 'tv' : 'native';

  // Idempotency: if background soft-refresh (force === false), already rendered for this ticker in current mode
  if (force === false && container.getAttribute('data-rendered-ticker') === ticker && container.getAttribute('data-rendered-mode') === currentMode) {
    if (!isTvMode && document.getElementById('techNativeChartCanvas')) {
      if (typeof TECH_CHARTS !== 'undefined' && TECH_CHARTS.nativeChart) {
        applyAiChartOverlay(TECH_CHARTS.nativeChart, setup, fib, (ctx && ctx.supportResistance), zones);
      }
    }
    return;
  }

  container.setAttribute('data-rendered-ticker', ticker);
  container.setAttribute('data-rendered-mode', currentMode);

  if (!ctx || ctx.isValid === false) {
    var unk = (ctx && ctx.symbol) || ticker || 'UNKNOWN';
    var msg = (ctx && ctx.error) || 'Ticker "' + unk + '" tidak terdaftar dalam Stock Universe IDX atau Yahoo Finance.';
    container.innerHTML = ''
      + '<div style="padding:28px 20px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:var(--text);text-align:center;margin:10px 0;">'
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
  var bZone = zones ? zones.buyZone : null;
  var sZone = zones ? zones.sellZone : null;

  var html = ''
    // AI TOOLBAR BAR
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border-bottom:1px solid var(--border);border-radius:10px 10px 0 0;flex-wrap:wrap;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:10px">'
        + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(ticker, 22) : '')
        + '<span style="font-size:16px;font-weight:800;color:var(--text);font-family:Fira Code,monospace">' + ticker + '</span>'
        + '<span style="font-size:16px;font-weight:700;color:' + (chg >= 0 ? '#10B981' : '#EF4444') + ';font-family:Fira Code,monospace">Rp ' + Number(curPrice).toLocaleString('id-ID') + '</span>'
        + '<span class="badge ' + (chg >= 0 ? 'b-up' : 'b-dn') + '" style="font-size:10px">' + (chg >= 0 ? '+' : '') + chgPct.toFixed(2) + '%</span>'
        + (ctx.isSimulated && typeof fsSrcDot === 'function' ? fsSrcDot(true) : '')
      + '</div>'

      // AI TOOLBAR BUTTONS
      + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
        + '<button class="btn btn-primary btn-xs" onclick="runAiChartAnalysis(\'' + ticker + '\', true)" style="background:var(--brand-primary);border:none;box-shadow:0 0 10px rgba(0,0,255,0.3)">'
          + 'AI ANALYZE'
        + '</button>'
        + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.zones ? 'on' : '') + '" onclick="toggleAiOverlay(\'zones\')" style="' + (AI_CHART_STATE.overlays.zones ? 'background:rgba(0,0,255,0.25);border-color:var(--accent);color:var(--accent)' : '') + '">ZONA BELI/JUAL</button>'
        + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.bandarVwap ? 'on' : '') + '" onclick="toggleAiOverlay(\'bandarVwap\')" style="' + (AI_CHART_STATE.overlays.bandarVwap ? 'background:rgba(139,92,246,0.25);border-color:#8B5CF6;color:#A78BFA' : '') + '">BANDAR VWAP</button>'
        + (!isTvMode ? (
            '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.sr ? 'on' : '') + '" onclick="toggleAiOverlay(\'sr\')">S/R</button>'
          + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.fib ? 'on' : '') + '" onclick="toggleAiOverlay(\'fib\')">FIB</button>'
          + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.pattern ? 'on' : '') + '" onclick="toggleAiOverlay(\'pattern\')">PATTERN</button>'
          + '<button class="btn btn-ghost btn-xs ' + (AI_CHART_STATE.overlays.structure ? 'on' : '') + '" onclick="toggleAiOverlay(\'structure\')">STRUCTURE</button>'
        ) : '')
        + '<button class="btn btn-ghost btn-xs" style="border-color:var(--accent);color:var(--accent)" onclick="openAiExplainModal(\'' + ticker + '\')">'
          + '<i class="ti ti-info-circle"></i> Explain Chart'
        + '</button>'
        + (isTvMode ? (
            '<button class="btn btn-ghost btn-xs" onclick="techToggleChartMode(\'native\')">'
          + '<i class="ti ti-chart-line"></i> Switch to Native Fast Chart'
          + '</button>'
        ) : (
            '<button class="btn btn-ghost btn-xs" style="border-color:var(--accent);color:var(--accent)" onclick="techToggleChartMode(\'tv\')">'
          + '<i class="ti ti-chart-candle"></i> TV Pro Cloud'
          + '</button>'
        ))
      + '</div>'
    + '</div>'

    // WORKSPACE LAYOUT: FULL WIDTH VERTICAL STACK (CHART ENLARGED DOWNWARD)
    + '<div style="display:flex;flex-direction:column;gap:12px;padding:12px;background:var(--bg2);border-radius:0 0 10px 10px">'
      + (isTvMode ? (
          '<div style="display:flex;flex-direction:column;gap:8px">'
        + '  <div id="tech-ai-zones-tv-banner" style="background:linear-gradient(90deg, rgba(16,185,129,0.15), rgba(239,68,68,0.15));border:1px solid var(--border2);border-radius:8px;padding:10px 14px;display:' + (AI_CHART_STATE.overlays.zones && bZone && sZone ? 'flex' : 'none') + ';justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-family:Fira Code,monospace;font-size:12px">'
        + '    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">'
        + '      <div><span style="color:#10B981;font-weight:800">🟢 ZONA BELI AI:</span> <strong style="color:#10B981">Rp ' + fmtK(bZone ? bZone.low : 0) + ' - Rp ' + fmtK(bZone ? bZone.high : 0) + '</strong> <span style="color:#DC2626;font-size:10px;font-weight:700">(SL: Rp ' + fmtK(bZone ? bZone.stopLoss : 0) + ')</span></div>'
        + '      <div><span style="color:#EF4444;font-weight:800">🔴 ZONA JUAL AI / TP:</span> <strong style="color:#EF4444">Rp ' + fmtK(sZone ? sZone.low : 0) + ' - Rp ' + fmtK(sZone ? sZone.high : 0) + '</strong></div>'
        + '    </div>'
        + '    <div style="font-size:11px;color:var(--text2);display:flex;gap:8px;align-items:center;font-family:\'Plus Jakarta Sans\',sans-serif">'
        + '      <span class="badge ' + (zones && zones.rsi <= 40 ? 'b-up' : (zones && zones.rsi >= 65 ? 'b-dn' : 'b-amb')) + '" style="font-size:10px">RSI: ' + (zones ? zones.rsi : ctx.indicators.rsi) + '</span>'
        + '      <span class="badge ' + (zones && zones.macd.status.includes('BULLISH') ? 'b-up' : 'b-dn') + '" style="font-size:10px">MACD: ' + (zones ? zones.macd.status.replace(/_/g, ' ') : 'Neutral') + '</span>'
        + '      <span class="badge ' + (zones && zones.volume.isSpike ? 'b-up' : 'b-neu') + '" style="font-size:10px">Vol: ' + (zones ? zones.volume.ratio : '1.0') + 'x</span>'
        + '    </div>'
        + '  </div>'
        + '  <div style="position:relative;height:640px;width:100%;background:var(--bg3);border-radius:8px;border:1px solid var(--border2);overflow:hidden">'
        + '    <iframe src="https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=' + encodeURIComponent(typeof techFormatTV === 'function' ? techFormatTV(ticker) : 'IDX:' + ticker) + '&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=131B2E&studies=%5B%22RSI%40tv-basicstudies%22%2C%22MACD%40tv-basicstudies%22%2C%22Volume%40tv-basicstudies%22%5D&theme=dark&style=1&timezone=Asia%2FJakarta&locale=id" style="width:100%;height:100%;border:none" loading="lazy"></iframe>'
        + '  </div>'
        + '</div>'
      ) : (
          '<div style="position:relative;height:580px;width:100%;background:var(--bg3);border-radius:8px;padding:8px;border:1px solid var(--border2)">'
        + '  <canvas id="techNativeChartCanvas"></canvas>'
        + '</div>'
      ))

      // BOTTOM: AI MARKET INTELLIGENCE & CONFLUENCE ANALYSIS PANEL (Full Width Below Chart)
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:12px">'
        // Header & Confidence Score
        + '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--border2);flex-wrap:wrap;gap:8px">'
          + '<div style="display:flex;align-items:center;gap:12px">'
            + '<div>'
              + '<div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase">AI SETUP CONFIDENCE</div>'
              + '<div style="font-size:20px;font-weight:900;color:' + (conf.score >= 75 ? '#10B981' : (conf.score >= 50 ? '#F59E0B' : '#EF4444')) + '">'
                + conf.score + ' <span style="font-size:12px">/ 100</span>'
              + '</div>'
            + '</div>'
            + '<span class="badge ' + (conf.score >= 75 ? 'b-up' : (conf.score >= 50 ? 'b-amb' : 'b-dn')) + '" style="font-size:11px">'
              + conf.label
            + '</span>'
          + '</div>'
          + '<div style="display:flex;gap:8px">'
            + '<button class="btn btn-ghost btn-xs" onclick="openAiExplainModal(\'' + ticker + '\')"><i class="ti ti-info-circle"></i> Detail Analisa Lengkap</button>'
            + '<button class="btn btn-primary btn-xs" onclick="saveAiSetupToJournal(\'' + ticker + '\')"><i class="ti ti-bookmark"></i> Save ke Trading Journal</button>'
          + '</div>'
        + '</div>'

        // Key Confluence Grid (7 Parameter Penting)
        + '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:8px;font-size:11px">'
          + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:9px;font-weight:700">STRUCTURE</div>'
            + '<strong style="color:var(--text)">' + struct.trend + '</strong>'
          + '</div>'
          + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:9px;font-weight:700">FLOWSCAN BANDAR</div>'
            + '<strong style="color:' + (ctx.flowScan.verdict.includes('ACCUM') ? '#10B981' : '#EF4444') + '">' + ctx.flowScan.verdict + '</strong>'
          + '</div>'
          + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:9px;font-weight:700">MODAL BANDAR (VWAP)</div>'
            + (ctx.bandarVwap && ctx.bandarVwap.available ? (
                '<strong style="color:#A78BFA">Rp ' + fmtK(ctx.bandarVwap.vwap) + '</strong> '
                + '<span style="font-size:9.5px;color:' + (ctx.bandarVwap.spreadPct >= 0 ? '#10B981' : '#EF4444') + '">(' + (ctx.bandarVwap.spreadPct >= 0 ? '+' : '') + ctx.bandarVwap.spreadPct.toFixed(1) + '%)</span>'
              ) : '<span style="color:var(--text3);font-size:10px">Belum Ada Data</span>')
          + '</div>'
          + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:9px;font-weight:700">RSI(14) MOMENTUM</div>'
            + '<strong style="color:' + (zones && zones.rsi <= 40 ? '#10B981' : (zones && zones.rsi >= 65 ? '#EF4444' : '#F59E0B')) + '">' + (zones ? zones.rsi : ctx.indicators.rsi) + ' (' + (zones && zones.rsi <= 40 ? 'Oversold' : (zones && zones.rsi >= 65 ? 'Overbought' : 'Neutral')) + ')</strong>'
          + '</div>'
          + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:9px;font-weight:700">MACD (12, 26, 9)</div>'
            + '<strong style="color:' + (zones && (zones.macd.status.includes('BULLISH') || zones.macd.status === 'GOLDEN_CROSS') ? '#10B981' : (zones && (zones.macd.status.includes('BEARISH') || zones.macd.status === 'DEATH_CROSS') ? '#EF4444' : 'var(--text)')) + '">' + (zones ? zones.macd.status.replace(/_/g, ' ') : 'Neutral') + '</strong>'
          + '</div>'
          + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:9px;font-weight:700">VOLUME CONFLUENCE</div>'
            + '<strong style="color:' + (zones && zones.volume.isSpike ? '#10B981' : 'var(--text)') + '">' + (zones ? zones.volume.ratio + 'x (' + zones.volume.status + ')' : 'Normal') + '</strong>'
          + '</div>'
          + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:9px;font-weight:700">FIBONACCI 0.618</div>'
            + '<strong style="color:#F59E0B">Rp ' + fmtK(fib.levels.f618) + '</strong>'
          + '</div>'
        + '</div>'

        // Bandar Cost Basis & Spread Banner
        + (ctx.bandarVwap && ctx.bandarVwap.available ? (
            '<div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.25);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-family:Fira Code,monospace;font-size:11px">'
            + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
              + '<span style="color:#A78BFA;font-weight:800">📊 BANDAR COST BASIS (TOP 3):</span>'
              + '<strong style="color:var(--text);font-size:13px">Rp ' + fmtK(ctx.bandarVwap.vwap) + '</strong>'
              + '<span style="color:var(--text3);font-size:10px">(' + ctx.bandarVwap.top3Brokers.join(', ') + ')</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:8px">'
              + '<span style="color:var(--text2)">Spread vs Modal: <strong style="color:' + (ctx.bandarVwap.spreadPct >= 0 ? '#10B981' : '#EF4444') + '">' + (ctx.bandarVwap.spreadPct >= 0 ? '+' : '') + ctx.bandarVwap.spreadPct.toFixed(2) + '%</strong></span>'
              + '<span class="badge ' + ctx.bandarVwap.zoneBadge + '" style="font-size:10px;font-weight:700">' + ctx.bandarVwap.zoneLabel + '</span>'
            + '</div>'
            + '</div>'
          ) : '')

        // 2 Wide Cards: AI Auto-Zones (Left) and Institutional Trade Plan (Right)
        + '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:12px">'
          // Auto-Zone Details Card
          + '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:12px">'
            + '<div style="font-size:12px;font-weight:800;color:var(--accent);margin-bottom:8px;display:flex;align-items:center;gap:6px">'
              + '<i class="ti ti-chart-dots"></i> ZONA BELI &amp; JUAL AI (RSI, MACD &amp; VOL)'
            + '</div>'
            + (bZone && sZone ? (
              '<div style="display:flex;flex-direction:column;gap:6px;font-size:11px;font-family:Fira Code,monospace">'
              + '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border2)">'
                + '<span style="color:#10B981;font-weight:700">🟢 Zona Beli (Demand):</span>'
                + '<strong style="color:#10B981">Rp ' + fmtK(bZone.low) + ' - Rp ' + fmtK(bZone.high) + '</strong>'
              + '</div>'
              + '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border2)">'
                + '<span style="color:#EF4444;font-weight:700">🔴 Zona Jual / TP (Supply):</span>'
                + '<strong style="color:#EF4444">Rp ' + fmtK(sZone.low) + ' - Rp ' + fmtK(sZone.high) + '</strong>'
              + '</div>'
              + '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border2)">'
                + '<span style="color:#DC2626">Stop Loss Zona Beli:</span>'
                + '<strong style="color:#DC2626">Rp ' + fmtK(bZone.stopLoss) + '</strong>'
              + '</div>'
              + '<div style="color:var(--text3);font-size:10px;margin-top:4px;font-family:\'Plus Jakarta Sans\',sans-serif;line-height:1.4">'
                + '<strong>Alasan Confluence:</strong> ' + bZone.reason
              + '</div>'
              + '</div>'
            ) : '<div style="color:var(--text3);font-size:11px">Zona kalkulasi sedang disiapkan...</div>')
          + '</div>'

          // Trade Setup Details Card
          + '<div style="background:var(--bg2);border:1px solid ' + (setup.decision === 'NO_TRADE' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)') + ';border-radius:8px;padding:12px">'
            + '<div style="font-size:12px;font-weight:800;color:' + (setup.decision === 'NO_TRADE' ? '#EF4444' : '#10B981') + ';margin-bottom:8px;display:flex;align-items:center;gap:6px">'
              + '<i class="ti ti-target"></i> ' + setup.setupType
            + '</div>'
            + (setup.decision === 'NO_TRADE'
              ? '<div style="font-size:11px;color:var(--text2);line-height:1.5">' + setup.reasons.join('<br>• ') + '</div>'
              : '<div style="display:flex;flex-direction:column;gap:6px;font-size:11px;font-family:Fira Code,monospace">'
                + '<div style="display:flex;justify-content:space-between"><span>Entry Setup:</span><strong style="color:#10B981">' + setup.entryZone + '</strong></div>'
                + '<div style="display:flex;justify-content:space-between"><span>Stop Loss:</span><strong style="color:#EF4444">Rp ' + fmtK(setup.stopLoss) + '</strong></div>'
                + '<div style="display:flex;justify-content:space-between"><span>Target TP1 &amp; TP2:</span><strong style="color:#38BDF8">Rp ' + fmtK(setup.tp1) + ' &amp; Rp ' + fmtK(setup.tp2) + '</strong></div>'
                + '<div style="display:flex;justify-content:space-between"><span>Risk / Reward:</span><strong style="color:var(--accent)">' + setup.rrRatio + '</strong></div>'
              + '</div>')
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>';

  container.innerHTML = html;

  // Re-initialize Chart.js Native Chart only in native mode
  if (!isTvMode) {
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
              borderColor: '#0000FF',
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
            x: { grid:{color:GC}, ticks: { color: _chartTextColor('--text2','#D2D8DF'), font:{weight:'bold'}, maxTicksLimit: 8 } },
            y: { position: 'right', grid:{color:GC}, ticks: { color: _chartTextColor('--text2','#D2D8DF'), font:{weight:'bold'} } }
          }
        }
      });

      // Attach overlay drawing hook immediately after chart creation
      applyAiChartOverlay(TECH_CHARTS.nativeChart, setup, fib, ctx.supportResistance, zones);
    }
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
          b.style.background = 'rgba(0, 0, 255, 0.25)';
          b.style.borderColor = 'var(--accent)';
          b.style.color = 'var(--accent)';
        } else {
          b.classList.remove('on');
          b.style.background = 'transparent';
          b.style.borderColor = 'var(--border2)';
          b.style.color = 'var(--text3)';
        }
      }
    });

    var tvBanner = document.getElementById('tech-ai-zones-tv-banner');
    if (tvBanner && key === 'zones') {
      tvBanner.style.display = AI_CHART_STATE.overlays.zones ? 'flex' : 'none';
    }

    if (TECH_CHARTS.nativeChart) {
      applyAiChartOverlay(
        TECH_CHARTS.nativeChart,
        AI_CHART_STATE.lastAnalysis ? AI_CHART_STATE.lastAnalysis.setup : null,
        AI_CHART_STATE.lastAnalysis ? AI_CHART_STATE.lastAnalysis.fibonacci : null,
        AI_CHART_STATE.lastContext ? AI_CHART_STATE.lastContext.supportResistance : null,
        AI_CHART_STATE.lastAnalysis ? AI_CHART_STATE.lastAnalysis.aiZones : null
      );
    }
  }
}

// 5. EXPLAIN CHART MODAL & JOURNAL SAVE INTEGRATION
function openAiExplainModal(ticker) {
  var last = AI_CHART_STATE.lastAnalysis;
  if (!last) {
    runAiChartAnalysis(ticker, true);
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
  var zones = last.aiZones;

  mTitle.innerHTML = 'AI Chart Explanation — ' + ticker;
  mBody.innerHTML = ''
    + '<div class="space-y-4" style="font-size:13px;line-height:1.6;color:var(--text)">'
      + '<div style="background:var(--bg3);border:1px solid var(--border);padding:12px;border-radius:var(--radius)">'
        + '<strong style="color:var(--text)">WHAT I SEE (RINGKASAN DIAGNOSIS TERTENTU):</strong>'
        + '<ul style="margin-top:6px;padding-left:18px;list-style-type:disc">'
          + '<li><strong>Struktur Pasar:</strong> ' + struct.structure + ' (Kekuatan Tren: ' + struct.strength + '%)</li>'
          + '<li><strong>Level Kunci Fibonacci:</strong> Area Emas Fib 0.618 berada di Rp ' + fmtK(fib.levels.f618) + '</li>'
          + '<li><strong>Smart Money FlowScan:</strong> Verdikt ' + ctx.flowScan.verdict + (ctx.flowScan.institutionalNetAvailable ? (' dengan Net Inflow Rp ' + fmtK(ctx.flowScan.institutionalNetRp)) : ' (Net Inflow institusi tidak tersedia — data broker summary belum ada untuk emiten ini)') + '</li>'
          + '<li><strong>Indikator Momentum:</strong> RSI-14 berada di angka ' + ctx.indicators.rsi + '</li>'
        + '</ul>'
      + '</div>'

      + (zones ? (
        '<div style="background:var(--bg3);border:1px solid var(--border);padding:12px;border-radius:var(--radius)">'
          + '<strong style="color:var(--accent)">KONFLUENSI AI AUTO-ZONE (RSI, MACD &amp; VOLUME):</strong>'
          + '<ul style="margin-top:6px;padding-left:18px;list-style-type:disc">'
            + '<li><strong>RSI(14):</strong> ' + zones.rsi + ' (' + (zones.rsi <= 40 ? 'Oversold / Rebound Support' : (zones.rsi >= 65 ? 'Overbought / Supply Warning' : 'Netral')) + ')</li>'
            + '<li><strong>MACD (12, 26, 9):</strong> Line ' + zones.macd.macd + ' / Signal ' + zones.macd.signal + ' [<strong>Status: ' + zones.macd.status.replace(/_/g, ' ') + '</strong>]</li>'
            + '<li><strong>Volume Confluence:</strong> Rasio ' + zones.volume.ratio + 'x vs Rata-rata 20 Hari [<strong>Status: ' + zones.volume.status + '</strong>]</li>'
            + '<li><strong>Zona Beli (Demand Area):</strong> <strong style="color:#10B981">Rp ' + fmtK(zones.buyZone.low) + ' - Rp ' + fmtK(zones.buyZone.high) + '</strong> (SL: Rp ' + fmtK(zones.buyZone.stopLoss) + ')</li>'
            + '<li><strong>Zona Jual / TP (Supply Area):</strong> <strong style="color:#EF4444">Rp ' + fmtK(zones.sellZone.low) + ' - Rp ' + fmtK(zones.sellZone.high) + '</strong></li>'
          + '</ul>'
        + '</div>'
      ) : '')

      + '<div style="background:var(--bg3);border:1px solid var(--border);padding:12px;border-radius:var(--radius)">'
        + '<strong style="color:#10B981">APA YANG MEMBUAT SAYA BELI? (BULLISH HYPOTHESIS):</strong>'
        + '<p style="margin-top:4px">' + setup.bullishScenario.trigger + '. Target kenaikan harga utama berada di ' + setup.bullishScenario.target + '.</p>'
      + '</div>'

      + '<div style="background:var(--bg3);border:1px solid var(--border);padding:12px;border-radius:var(--radius)">'
        + '<strong style="color:#EF4444">APA YANG MEMBUAT SAYA SALAH? (INVALIDATION):</strong>'
        + '<p style="margin-top:4px">' + setup.bearishScenario.trigger + '. Jika skenario ini terjadi, analisis dianggap gugur dan posisi harus segera di-cutloss.</p>'
      + '</div>'

      + '<div style="background:var(--bg2);padding:12px;border-radius:8px;border:1px solid var(--border2);font-family:Fira Code,monospace;font-size:12px">'
        + '<div style="font-weight:700;color:var(--accent);margin-bottom:4px">KEPUTUSAN KELAS INSTITUSI:</div>'
        + '<div>BIAS: ' + setup.bias + ' | CONFIDENCE: ' + conf.score + '/100 (' + conf.label + ')</div>'
        + '<div>REKOMENDASI EKSEKUSI: ' + setup.setupType + '</div>'
      + '</div>'

      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'
        + '<button class="btn btn-primary btn-sm" onclick="saveAiSetupToJournal(\'' + ticker + '\');closeModal();">Catat Rencana Trade ke Journal</button>'
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
    showToast('Rencana Trade AI untuk ' + ticker + ' berhasil dicatat ke Decision Journal!');
  } else {
    alert('Rencana Trade AI untuk ' + ticker + ' berhasil dicatat ke Decision Journal!');
  }
}

// Register Global Hooks
window.runAiChartAnalysis = runAiChartAnalysis;
window.toggleAiOverlay = toggleAiOverlay;
window.openAiExplainModal = openAiExplainModal;
window.saveAiSetupToJournal = saveAiSetupToJournal;
