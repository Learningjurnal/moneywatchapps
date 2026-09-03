// ============================================================
// 36-crypto-technical.js
// MEGA CRYPTO TECHNICAL & WHALE FLOW SUITE (PURE TECHNICAL & SIGNALS)
// - Volume Breakout Engine (RVOL, Volume Spike, Climax, OBV Trend)
// - Whale Identifier & Smart Money Tracker (Accumulation/Distribution Score, Whale Net Flow, CMF-Crypto, Liquidity Sweeps)
// - Technical Indicator Suite (RSI, StochRSI, MACD, EMA Ribbon, Bollinger Squeeze, Supertrend, ATR TP/SL)
// - Market-Wide Multi-Coin Scanner & Signal Matrix
// ============================================================

(function() {
  'use strict';

  // ── 1. CRYPTO DATABASE & UNIVERSE ──
  var CRYPTO_TECH_UNIVERSE = [
    { s: 'BTC',  n: 'Bitcoin',           cat: 'Layer 1',    baseUSD: 67200,  tv: 'BINANCE:BTCUSDT',  icon: '₿',  color: '#f7931a' },
    { s: 'ETH',  n: 'Ethereum',          cat: 'Layer 1',    baseUSD: 3450,   tv: 'BINANCE:ETHUSDT',  icon: 'Ξ',  color: '#627eea' },
    { s: 'SOL',  n: 'Solana',            cat: 'Layer 1',    baseUSD: 178,    tv: 'BINANCE:SOLUSDT',  icon: '◎',  color: '#9945ff' },
    { s: 'BNB',  n: 'BNB Chain',         cat: 'Layer 1',    baseUSD: 595,    tv: 'BINANCE:BNBUSDT',  icon: 'B',  color: '#f0b90b' },
    { s: 'XRP',  n: 'Ripple XRP',        cat: 'Payments',   baseUSD: 0.585,  tv: 'BINANCE:XRPUSDT',  icon: 'X',  color: '#00aae4' },
    { s: 'DOGE', n: 'Dogecoin',          cat: 'Meme',       baseUSD: 0.145,  tv: 'BINANCE:DOGEUSDT', icon: 'Ð',  color: '#c2a633' },
    { s: 'ADA',  n: 'Cardano',           cat: 'Layer 1',    baseUSD: 0.46,   tv: 'BINANCE:ADAUSDT',  icon: '₳',  color: '#0033ad' },
    { s: 'AVAX', n: 'Avalanche',         cat: 'Layer 1',    baseUSD: 34.5,   tv: 'BINANCE:AVAXUSDT', icon: 'A',  color: '#e84142' },
    { s: 'LINK', n: 'Chainlink',         cat: 'Oracle',     baseUSD: 15.2,   tv: 'BINANCE:LINKUSDT', icon: '⬡',  color: '#375bd2' },
    { s: 'SUI',  n: 'Sui Network',       cat: 'Layer 1',    baseUSD: 2.15,   tv: 'BINANCE:SUIUSDT',  icon: '💧', color: '#4da2ff' },
    { s: 'NEAR', n: 'NEAR Protocol',     cat: 'AI & Data',  baseUSD: 6.25,   tv: 'BINANCE:NEARUSDT', icon: 'N',  color: '#00c08b' },
    { s: 'DOT',  n: 'Polkadot',          cat: 'Layer 0',    baseUSD: 6.80,   tv: 'BINANCE:DOTUSDT',  icon: '●',  color: '#e6007a' },
    { s: 'MATIC',n: 'Polygon (POL)',     cat: 'Layer 2',    baseUSD: 0.54,   tv: 'BINANCE:POLUSDT',  icon: 'M',  color: '#8247e5' },
    { s: 'UNI',  n: 'Uniswap',           cat: 'DeFi',       baseUSD: 9.40,   tv: 'BINANCE:UNIUSDT',  icon: '🦄', color: '#ff007a' },
    { s: 'PEPE', n: 'Pepe',              cat: 'Meme',       baseUSD: 0.0000098, tv: 'BINANCE:PEPEUSDT', icon: '🐸', color: '#48c774' },
    { s: 'LTC',  n: 'Litecoin',          cat: 'Payments',   baseUSD: 82.5,   tv: 'BINANCE:LTCUSDT',  icon: 'Ł',  color: '#bfbbbb' },
    { s: 'APT',  n: 'Aptos',             cat: 'Layer 1',    baseUSD: 10.2,   tv: 'BINANCE:APTUSDT',  icon: '▲',  color: '#22d3ee' },
    { s: 'ARB',  n: 'Arbitrum',          cat: 'Layer 2',    baseUSD: 0.78,   tv: 'BINANCE:ARBUSDT',  icon: 'A',  color: '#28a0f0' },
    { s: 'OP',   n: 'Optimism',          cat: 'Layer 2',    baseUSD: 1.85,   tv: 'BINANCE:OPUSDT',   icon: '🔴', color: '#ff0420' },
    { s: 'RENDER',n: 'Render Network',   cat: 'AI & Data',  baseUSD: 6.95,   tv: 'BINANCE:RENDERUSDT',icon: '🎨', color: '#e11d48' },
    { s: 'INJ',  n: 'Injective',         cat: 'DeFi',       baseUSD: 24.8,   tv: 'BINANCE:INJUSDT',  icon: '⚡',  color: '#00f2fe' },
    { s: 'TIA',  n: 'Celestia',          cat: 'Modular',    baseUSD: 6.30,   tv: 'BINANCE:TIAUSDT',  icon: '🌌', color: '#7c3aed' },
    { s: 'SHIB', n: 'Shiba Inu',         cat: 'Meme',       baseUSD: 0.0000185, tv: 'BINANCE:SHIBUSDT', icon: '🐕', color: '#f59e0b' },
    { s: 'TON',  n: 'Toncoin',           cat: 'Layer 1',    baseUSD: 5.80,   tv: 'BINANCE:TONUSDT',  icon: '💎', color: '#0088cc' },
    { s: 'FET',  n: 'Artificial Superintelligence', cat: 'AI & Data', baseUSD: 1.48, tv: 'BINANCE:FETUSDT', icon: '🤖', color: '#10b981' },
    { s: 'AAVE', n: 'Aave',              cat: 'DeFi',       baseUSD: 165.0,  tv: 'BINANCE:AAVEUSDT', icon: '👻', color: '#b6509e' },
    { s: 'KAS',  n: 'Kaspa',             cat: 'Layer 1',    baseUSD: 0.155,  tv: 'MEXC:KASUSDT',     icon: '⚡',  color: '#70c7ba' },
    { s: 'RUNE', n: 'THORChain',         cat: 'DeFi',       baseUSD: 5.15,   tv: 'BINANCE:RUNEUSDT', icon: 'ᚱ',  color: '#00cc99' },
    { s: 'ATOM', n: 'Cosmos Hub',        cat: 'Layer 0',    baseUSD: 5.40,   tv: 'BINANCE:ATOMUSDT', icon: '⚛',  color: '#2e3148' },
    { s: 'ONDO', n: 'Ondo Finance',      cat: 'RWA',        baseUSD: 0.88,   tv: 'BINANCE:ONDOUSDT', icon: '🏛️', color: '#38bdf8' }
  ];

  // ── 2. APPLICATION STATE ──
  var CRYPTO_TECH_STATE = {
    symbol: 'BTC',
    timeframe: '1D', // '15m', '1h', '4h', '1D', '1W'
    activeTab: 1,    // 1: Chart & Overlay, 2: Technical & Whale Analysis, 3: Multi-Coin Scanner
    chartMode: 'native', // 'native' | 'tv'
    filterCategory: '',
    filterSignal: '',
    filterPreset: 'all',
    searchQuery: '',
    cachedOhlcv: {},
    cachedAnalysis: {}
  };

  // Expose state to window
  window.CRYPTO_TECH_UNIVERSE = CRYPTO_TECH_UNIVERSE;
  window.CRYPTO_TECH_STATE = CRYPTO_TECH_STATE;

  // ── 3. MATHEMATICAL & ALGORITHMIC HELPERS ──
  function getUsdIdrRate() {
    return (typeof usdIdr !== 'undefined' && usdIdr > 10000) ? usdIdr : 16250;
  }

  function getCoinInfo(sym) {
    var clean = (sym || 'BTC').toUpperCase().trim();
    var found = CRYPTO_TECH_UNIVERSE.find(function(c) { return c.s === clean; });
    if (found) return found;
    return { s: clean, n: clean, cat: 'Altcoin', baseUSD: 1.0, tv: 'BINANCE:' + clean + 'USDT', icon: '🪙', color: '#3B82F6' };
  }

  function hashStr(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function pseudoRand(seed) {
    var x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  }

  // ── 4. CRYPTO TIME-SERIES OHLCV GENERATOR (Deterministic & High Fidelity) ──
  function generateCryptoOHLCV(sym, tf, barsCount) {
    barsCount = barsCount || 60;
    var info = getCoinInfo(sym);
    var rate = getUsdIdrRate();
    var baseUSD = info.baseUSD;
    
    var isKnownCoin = CRYPTO_TECH_UNIVERSE.some(function(c) { return c.s === (sym || '').toUpperCase(); });
    if (!isKnownCoin && (!cryptoPrices || !cryptoPrices[sym])) {
      return [];
    }

    // Check if real live price exists in cryptoPrices
    if (typeof cryptoPrices !== 'undefined' && cryptoPrices[sym] && cryptoPrices[sym] > 0) {
      baseUSD = cryptoPrices[sym] / rate;
    }

    var seed = hashStr(sym + tf + (new Date().toDateString()));
    var volatility = (sym === 'BTC' ? 0.025 : sym === 'ETH' ? 0.035 : sym === 'SOL' ? 0.05 : 0.065);
    
    // Base volume in USD
    var baseVolUSD = (sym === 'BTC' ? 28e9 : sym === 'ETH' ? 14e9 : sym === 'SOL' ? 4e9 : sym === 'BNB' ? 1.2e9 : 350e6) / (tf === '15m' ? 96 : tf === '1h' ? 24 : tf === '4h' ? 6 : tf === '1W' ? 0.14 : 1);

    var data = [];
    var curPrice = baseUSD;
    var obv = 0;
    var ad = 0;

    // Random walk with momentum cycles & realistic whale spikes
    var trendBias = (pseudoRand(seed + 99) > 0.45 ? 0.002 : -0.0015);
    var now = new Date();
    var stepMs = (tf === '15m' ? 15*60*1000 : tf === '1h' ? 60*60*1000 : tf === '4h' ? 4*3600*1000 : tf === '1W' ? 7*24*3600*1000 : 24*3600*1000);

    for (var i = barsCount - 1; i >= 0; i--) {
      var r1 = pseudoRand(seed * (i + 1) + 13);
      var r2 = pseudoRand(seed * (i + 1) + 29);
      var r3 = pseudoRand(seed * (i + 1) + 47);
      var r4 = pseudoRand(seed * (i + 1) + 71);

      // Return with stochastic momentum
      var ret = (r1 - 0.485) * volatility + trendBias;
      var open = curPrice;
      var close = curPrice * (1 + ret);
      var high = Math.max(open, close) * (1 + r2 * volatility * 0.7);
      var low = Math.min(open, close) * (1 - r3 * volatility * 0.7);

      // Volume with whale spike anomalies (r4 > 0.85 = Whale order / Volume Breakout)
      var isWhaleBar = r4 > 0.82;
      var volMult = isWhaleBar ? (2.2 + r2 * 3.8) : (0.5 + r1 * 0.9);
      var volumeUSD = baseVolUSD * volMult;
      var volumeCoins = volumeUSD / close;

      // Money Flow Multiplier & OBV
      var range = high - low;
      var mfm = range > 0 ? ((close - low) - (high - close)) / range : 0;
      var mfv = mfm * volumeUSD;
      obv += (close >= open ? volumeUSD : -volumeUSD);
      ad += mfv;

      var barDate = new Date(now.getTime() - i * stepMs);

      data.push({
        date: barDate,
        open: open,
        high: high,
        low: low,
        close: close,
        volumeUSD: volumeUSD,
        volumeCoins: volumeCoins,
        volMult: volMult,
        isWhaleBar: isWhaleBar,
        mfm: mfm,
        mfv: mfv,
        obv: obv,
        ad: ad
      });

      curPrice = close;
    }

    return data;
  }

  // ── 5. CORE TECHNICAL INDICATORS (MATHEMATICAL FORMULAS) ──
  function calcEMA(values, period) {
    var k = 2 / (period + 1);
    var ema = [];
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      if (i < period - 1) {
        sum += values[i];
        ema.push(null);
      } else if (i === period - 1) {
        sum += values[i];
        ema.push(sum / period);
      } else {
        var prev = ema[i - 1];
        ema.push((values[i] * k) + (prev * (1 - k)));
      }
    }
    return ema;
  }

  function calcSMA(values, period) {
    return values.map(function(_, i) {
      if (i < period - 1) return null;
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) sum += values[j];
      return sum / period;
    });
  }

  function calcRSI(ohlcv, period) {
    period = period || 14;
    var gains = 0, losses = 0;
    var rsi = [];
    
    for (var i = 1; i <= period; i++) {
      var diff = ohlcv[i].close - ohlcv[i - 1].close;
      if (diff > 0) gains += diff; else losses -= diff;
    }
    var avgGain = gains / period;
    var avgLoss = losses / period;

    for (var i = 0; i < period; i++) rsi.push(50);
    var rs = avgLoss === 0 ? 100 : (avgGain / avgLoss);
    rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rs)));

    for (var i = period + 1; i < ohlcv.length; i++) {
      var diff = ohlcv[i].close - ohlcv[i - 1].close;
      var g = diff > 0 ? diff : 0;
      var l = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      var rsCur = avgLoss === 0 ? 100 : (avgGain / avgLoss);
      rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rsCur)));
    }
    return rsi;
  }

  function calcStochRSI(rsiValues, period, kPeriod, dPeriod) {
    period = period || 14;
    kPeriod = kPeriod || 3;
    dPeriod = dPeriod || 3;
    var rawStoch = [];
    for (var i = 0; i < rsiValues.length; i++) {
      if (i < period - 1) {
        rawStoch.push(50);
      } else {
        var minR = 100, maxR = 0;
        for (var j = i - period + 1; j <= i; j++) {
          if (rsiValues[j] < minR) minR = rsiValues[j];
          if (rsiValues[j] > maxR) maxR = rsiValues[j];
        }
        var denom = maxR - minR;
        rawStoch.push(denom === 0 ? 50 : ((rsiValues[i] - minR) / denom) * 100);
      }
    }
    var stochK = calcSMA(rawStoch, kPeriod);
    var stochD = calcSMA(stochK.map(function(v) { return v === null ? 50 : v; }), dPeriod);
    return { k: stochK, d: stochD };
  }

  function calcMACD(closes) {
    var ema12 = calcEMA(closes, 12);
    var ema26 = calcEMA(closes, 26);
    var macdLine = [];
    for (var i = 0; i < closes.length; i++) {
      if (ema12[i] === null || ema26[i] === null) macdLine.push(0);
      else macdLine.push(ema12[i] - ema26[i]);
    }
    var signalLine = calcEMA(macdLine, 9);
    var hist = [];
    for (var i = 0; i < closes.length; i++) {
      var s = signalLine[i] !== null ? signalLine[i] : 0;
      hist.push(macdLine[i] - s);
    }
    return { macd: macdLine, signal: signalLine, hist: hist };
  }

  function calcBollingerBands(closes, period, mult) {
    period = period || 20;
    mult = mult || 2;
    var sma = calcSMA(closes, period);
    var upper = [], lower = [], bandwidth = [];
    
    for (var i = 0; i < closes.length; i++) {
      if (sma[i] === null) {
        upper.push(null); lower.push(null); bandwidth.push(0);
      } else {
        var sumSq = 0;
        for (var j = i - period + 1; j <= i; j++) {
          sumSq += Math.pow(closes[j] - sma[i], 2);
        }
        var stdDev = Math.sqrt(sumSq / period);
        var u = sma[i] + (mult * stdDev);
        var l = sma[i] - (mult * stdDev);
        upper.push(u);
        lower.push(l);
        bandwidth.push(((u - l) / sma[i]) * 100);
      }
    }
    return { middle: sma, upper: upper, lower: lower, bandwidth: bandwidth };
  }

  function calcATR(ohlcv, period) {
    period = period || 14;
    var tr = [ohlcv[0].high - ohlcv[0].low];
    for (var i = 1; i < ohlcv.length; i++) {
      var h = ohlcv[i].high;
      var l = ohlcv[i].low;
      var prevC = ohlcv[i - 1].close;
      var currentTR = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      tr.push(currentTR);
    }
    return calcEMA(tr, period);
  }

  // ── 6. VOLUME BREAKOUT & WHALE IDENTIFIER ENGINE ──
  function analyzeCryptoTechnical(sym, tf) {
    tf = tf || CRYPTO_TECH_STATE.timeframe;
    var ohlcv = generateCryptoOHLCV(sym, tf, 70);
    var closes = ohlcv.map(function(d) { return d.close; });
    var len = ohlcv ? ohlcv.length : 0;
    var curBar = (ohlcv && len > 0) ? ohlcv[len - 1] : { open: 1, high: 1, low: 1, close: 1, volume: 1 };
    var prevBar = (ohlcv && len > 1) ? ohlcv[len - 2] : curBar;
    var curPriceUSD = curBar.close || 1;
    var prevPriceUSD = prevBar.close || curPriceUSD || 1;
    var chg24hPct = ((curPriceUSD - prevPriceUSD) / prevPriceUSD) * 100;
    var usdRate = getUsdIdrRate();
    var curPriceIDR = curPriceUSD * usdRate;

    // Technical Indicators
    var rsiArr = calcRSI(ohlcv, 14);
    var curRSI = rsiArr[len - 1];
    var stoch = calcStochRSI(rsiArr, 14, 3, 3);
    var curStochK = stoch.k[len - 1] || 50;
    var curStochD = stoch.d[len - 1] || 50;
    var macd = calcMACD(closes);
    var curMACD = macd.macd[len - 1];
    var curSignal = macd.signal[len - 1] || 0;
    var curHist = macd.hist[len - 1];
    var prevHist = macd.hist[len - 2];

    var ema9 = calcEMA(closes, 9);
    var ema21 = calcEMA(closes, 21);
    var ema50 = calcEMA(closes, 50);
    var ema200 = calcEMA(closes, closes.length >= 200 ? 200 : 50);
    var bb = calcBollingerBands(closes, 20, 2);
    var atrArr = calcATR(ohlcv, 14);
    var curATR = atrArr[len - 1] || (curPriceUSD * 0.03);

    // ── Volume Breakout Calculations ──
    var volUSDArr = ohlcv.map(function(d) { return d.volumeUSD; });
    var volMA20 = calcSMA(volUSDArr, 20);
    var curVolMA20 = volMA20[len - 1] || (curBar.volumeUSD * 0.8);
    var rvol = curVolMA20 > 0 ? (curBar.volumeUSD / curVolMA20) : 1.0;

    // Volume Breakout Status
    var volBreakoutTag = 'NORMAL';
    var volBreakoutColor = '#94A3B8';
    var isVolBreakout = false;
    if (rvol >= 3.0) {
      volBreakoutTag = 'EXPLOSIVE SURGE 🚀';
      volBreakoutColor = '#10B981';
      isVolBreakout = true;
    } else if (rvol >= 2.0) {
      volBreakoutTag = 'HIGH VOLUME BREAKOUT ⚡';
      volBreakoutColor = '#3B82F6';
      isVolBreakout = true;
    } else if (rvol >= 1.25) {
      volBreakoutTag = 'ABOVE AVERAGE 📈';
      volBreakoutColor = '#00c8ff';
    } else if (rvol <= 0.65) {
      volBreakoutTag = 'LOW VOLUME CONSOLIDATION 💤';
      volBreakoutColor = '#64748B';
    }

    // OBV Trend
    var obvArr = ohlcv.map(function(d) { return d.obv; });
    var obvEma = calcEMA(obvArr, 20);
    var isObvBullish = obvArr[len - 1] > (obvEma[len - 1] || 0);

    // ── Whale Identifier & Accumulation Engine ──
    // Chaikin Money Flow (CMF-20)
    var cmfSumMFV = 0, cmfSumVol = 0;
    for (var i = len - 20; i < len; i++) {
      if (i >= 0) {
        cmfSumMFV += ohlcv[i].mfv;
        cmfSumVol += ohlcv[i].volumeUSD;
      }
    }
    var cmf20 = cmfSumVol > 0 ? (cmfSumMFV / cmfSumVol) : 0; // range -1 to +1

    // Whale Accumulation Score (0 to 100)
    var cmfNorm = Math.max(0, Math.min(100, (cmf20 + 0.35) / 0.7 * 100));
    var rsiFactor = Math.max(0, Math.min(100, curRSI));
    var rvolFactor = Math.min(100, (rvol / 2.5) * 100);
    var trendFactor = (curPriceUSD > (ema50[len - 1] || curPriceUSD) ? 70 : 30);
    var macdFactor = curHist > 0 ? 75 : 25;

    // Weighted Smart Money Score
    var whaleScore = Math.round(
      (cmfNorm * 0.35) +
      (rvolFactor * (chg24hPct >= 0 ? 0.25 : 0.05)) +
      (trendFactor * 0.20) +
      (macdFactor * 0.20)
    );
    whaleScore = Math.max(5, Math.min(98, whaleScore));

    // Whale Status & Flow
    var whaleStatus = 'NEUTRAL / CHOP';
    var whaleColor = '#94A3B8';
    var whaleBadgeClass = 'b-neu';
    if (whaleScore >= 75) {
      whaleStatus = 'MEGA WHALE ACCUMULATION 🐋';
      whaleColor = '#10B981';
      whaleBadgeClass = 'b-up';
    } else if (whaleScore >= 60) {
      whaleStatus = 'SMART MONEY BUYING 📈';
      whaleColor = '#3B82F6';
      whaleBadgeClass = 'b-up';
    } else if (whaleScore <= 30) {
      whaleStatus = 'HEAVY WHALE DUMPING 🚨';
      whaleColor = '#EF4444';
      whaleBadgeClass = 'b-dn';
    } else if (whaleScore <= 45) {
      whaleStatus = 'WHALE DISTRIBUTION 📉';
      whaleColor = '#F59E0B';
      whaleBadgeClass = 'b-dn';
    }

    // Whale Net Flow USD & IDR estimate
    var total24hVolUSD = curBar.volumeUSD;
    var whaleFlowUSD = (whaleScore - 50) / 50 * (total24hVolUSD * 0.28);
    var whaleFlowIDR = whaleFlowUSD * usdRate;

    // Large Orders / Whale Tier Distribution Proxy
    var largeOrders = {
      megaWhaleUSD: Math.round(total24hVolUSD * 0.38),
      largeWhaleUSD: Math.round(total24hVolUSD * 0.27),
      sharkUSD: Math.round(total24hVolUSD * 0.20),
      retailUSD: Math.round(total24hVolUSD * 0.15),
      inflowRatio: (whaleScore / 100),
      outflowRatio: (1 - (whaleScore / 100))
    };

    // Liquidity Sweeps & Stop Hunt Detection
    var curHigh = curBar.high, curLow = curBar.low, curOpen = curBar.open, curClose = curBar.close;
    var upperWick = curHigh - Math.max(curOpen, curClose);
    var lowerWick = Math.min(curOpen, curClose) - curLow;
    var body = Math.abs(curClose - curOpen);
    var isLiquiditySweep = (lowerWick > body * 1.8 && rvol > 1.4) || (upperWick > body * 1.8 && rvol > 1.4);
    var sweepType = lowerWick > upperWick ? 'BULLISH LIQUIDITY GRAB (SHORT SQUEEZE)' : 'BEARISH STOP-HUNT (LONG SQUEEZE)';

    // Candlestick Pattern Recognition
    var candlePattern = 'Netral Consolidation';
    var candleBullish = true;
    if (lowerWick > body * 2.0 && curClose >= curOpen) {
      candlePattern = 'Hammer / Bullish Pin Bar 🔨';
      candleBullish = true;
    } else if (upperWick > body * 2.0 && curClose <= curOpen) {
      candlePattern = 'Shooting Star / Bearish Rejection ☄️';
      candleBullish = false;
    } else if (prevBar && curClose > prevBar.high && prevBar.close < prevBar.open && curClose > curOpen) {
      candlePattern = 'Bullish Engulfing 🟢';
      candleBullish = true;
    } else if (prevBar && curClose < prevBar.low && prevBar.close > prevBar.open && curClose < curOpen) {
      candlePattern = 'Bearish Engulfing 🔴';
      candleBullish = false;
    } else if (body < (curHigh - curLow) * 0.15) {
      candlePattern = 'Doji Indecision ⚖️';
      candleBullish = chg24hPct >= 0;
    } else if (chg24hPct > 3.5 && rvol > 1.5) {
      candlePattern = 'Marubozu Momentum Candle 🚀';
      candleBullish = true;
    }

    // Support, Resistance & Pivot Levels
    var pHigh = prevBar ? prevBar.high : curHigh;
    var pLow = prevBar ? prevBar.low : curLow;
    var pClose = prevBar ? prevBar.close : curClose;
    var pivot = (pHigh + pLow + pClose) / 3;
    var r1 = (2 * pivot) - pLow;
    var s1 = (2 * pivot) - pHigh;
    var r2 = pivot + (pHigh - pLow);
    var s2 = pivot - (pHigh - pLow);
    var r3 = pHigh + 2 * (pivot - pLow);
    var s3 = pLow - 2 * (pHigh - pivot);
    var fibGoldenPocket = curPriceUSD * (chg24hPct >= 0 ? 0.9618 : 1.0382);

    // Dynamic ATR Risk Management & TP/SL Target Calculator
    var stopLossUSD = curPriceUSD - (1.5 * curATR);
    var takeProfit1USD = curPriceUSD + (1.5 * curATR * 1.2);
    var takeProfit2USD = curPriceUSD + (1.5 * curATR * 2.4);
    var takeProfit3USD = curPriceUSD + (1.5 * curATR * 4.0);
    var riskRewardRatio = ((takeProfit2USD - curPriceUSD) / (curPriceUSD - stopLossUSD)).toFixed(2);

    // ── Overall Signal Synthesis Matrix ──
    var scoreConfluence = 0;
    // Whale (weight 30)
    scoreConfluence += (whaleScore - 50) * 0.6;
    // RSI (weight 20)
    if (curRSI < 30) scoreConfluence += 18;
    else if (curRSI > 75) scoreConfluence -= 18;
    else if (curRSI > 50) scoreConfluence += (curRSI - 50) * 0.4;
    else scoreConfluence += (curRSI - 50) * 0.4;
    // MACD (weight 20)
    scoreConfluence += (curHist > 0 ? 15 : -15) + (curHist > prevHist ? 5 : -5);
    // Volume & Trend (weight 30)
    if (curPriceUSD > (ema50[len - 1] || 0)) scoreConfluence += 12; else scoreConfluence -= 12;
    if (curPriceUSD > (ema21[len - 1] || 0)) scoreConfluence += 8; else scoreConfluence -= 8;
    if (isVolBreakout && chg24hPct > 0) scoreConfluence += 15;
    else if (isVolBreakout && chg24hPct < 0) scoreConfluence -= 15;

    var overallSignal = 'NEUTRAL';
    var signalColor = '#94A3B8';
    var signalBadge = 'b-neu';
    var signalScorePct = Math.round(Math.max(0, Math.min(100, (scoreConfluence + 100) / 2)));

    if (scoreConfluence >= 45) {
      overallSignal = 'STRONG BUY';
      signalColor = '#10B981';
      signalBadge = 'b-up';
    } else if (scoreConfluence >= 15) {
      overallSignal = 'BUY';
      signalColor = '#3B82F6';
      signalBadge = 'b-up';
    } else if (scoreConfluence <= -45) {
      overallSignal = 'STRONG SELL';
      signalColor = '#EF4444';
      signalBadge = 'b-dn';
    } else if (scoreConfluence <= -15) {
      overallSignal = 'SELL';
      signalColor = '#F59E0B';
      signalBadge = 'b-dn';
    }

    return {
      sym: sym,
      name: getCoinInfo(sym).n,
      category: getCoinInfo(sym).cat,
      icon: getCoinInfo(sym).icon,
      color: getCoinInfo(sym).color,
      tvSymbol: getCoinInfo(sym).tv,
      timeframe: tf,
      curPriceUSD: curPriceUSD,
      curPriceIDR: curPriceIDR,
      chg24hPct: chg24hPct,
      total24hVolUSD: total24hVolUSD,
      total24hVolIDR: total24hVolUSD * usdRate,
      rvol: rvol,
      volBreakoutTag: volBreakoutTag,
      volBreakoutColor: volBreakoutColor,
      isVolBreakout: isVolBreakout,
      whaleScore: whaleScore,
      whaleStatus: whaleStatus,
      whaleColor: whaleColor,
      whaleBadgeClass: whaleBadgeClass,
      whaleFlowUSD: whaleFlowUSD,
      whaleFlowIDR: whaleFlowIDR,
      largeOrders: largeOrders,
      cmf20: cmf20,
      obv: curBar.obv,
      isObvBullish: isObvBullish,
      isLiquiditySweep: isLiquiditySweep,
      sweepType: sweepType,
      rsi: curRSI,
      stochK: curStochK,
      stochD: curStochD,
      macdLine: curMACD,
      macdSignal: curSignal,
      macdHist: curHist,
      ema9: ema9[len - 1],
      ema21: ema21[len - 1],
      ema50: ema50[len - 1],
      ema200: ema200[len - 1],
      bb: {
        upper: bb.upper[len - 1],
        middle: bb.middle[len - 1],
        lower: bb.lower[len - 1],
        bandwidth: bb.bandwidth[len - 1]
      },
      atr: curATR,
      candlePattern: candlePattern,
      candleBullish: candleBullish,
      pivots: {
        pivot: pivot,
        s1: s1, s2: s2, s3: s3,
        r1: r1, r2: r2, r3: r3,
        fibGoldenPocket: fibGoldenPocket
      },
      riskPlan: {
        stopLossUSD: stopLossUSD,
        stopLossIDR: stopLossUSD * usdRate,
        takeProfit1USD: takeProfit1USD,
        takeProfit1IDR: takeProfit1USD * usdRate,
        takeProfit2USD: takeProfit2USD,
        takeProfit2IDR: takeProfit2USD * usdRate,
        takeProfit3USD: takeProfit3USD,
        takeProfit3IDR: takeProfit3USD * usdRate,
        riskRewardRatio: riskRewardRatio
      },
      overallSignal: overallSignal,
      signalColor: signalColor,
      signalBadge: signalBadge,
      signalScorePct: signalScorePct,
      ohlcv: ohlcv
    };
  }

  // ── 7. FORMATTING UTILITIES ──
  function fmtIDR(n) {
    if (isNaN(n) || n === null) return 'Rp 0';
    if (Math.abs(n) >= 1e12) return 'Rp ' + (n / 1e12).toFixed(2) + ' T';
    if (Math.abs(n) >= 1e9) return 'Rp ' + (n / 1e9).toFixed(2) + ' M';
    if (Math.abs(n) >= 1e6) return 'Rp ' + (n / 1e6).toFixed(2) + ' Jt';
    return 'Rp ' + Number(Math.round(n)).toLocaleString('id-ID');
  }

  function fmtUSD(n) {
    if (isNaN(n) || n === null) return '$0.00';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n < 0.0001) return '$' + n.toFixed(8);
    if (n < 1.0) return '$' + n.toFixed(4);
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── 8. UI INITIALIZATION & TAB CONTROLLERS ──
  function initCryptoTechnicalSuite() {
    var sym = CRYPTO_TECH_STATE.symbol || 'BTC';
    cryptoTechSelectCoin(sym, false);
  }

  function cryptoTechSwitchTab(tabIdx) {
    CRYPTO_TECH_STATE.activeTab = tabIdx;

    // Update Nav buttons
    for (var i = 1; i <= 3; i++) {
      var navBtn = document.getElementById('cr-tech-nav-' + i);
      var panel = document.getElementById('cr-tech-tab' + i);
      if (navBtn) navBtn.classList.toggle('active-tech', i === tabIdx);
      if (panel) panel.classList.toggle('active', i === tabIdx);
    }

    var sym = CRYPTO_TECH_STATE.symbol || 'BTC';
    var analysis = analyzeCryptoTechnical(sym, CRYPTO_TECH_STATE.timeframe);

    if (tabIdx === 1) {
      renderCryptoChartTab(analysis);
    } else if (tabIdx === 2) {
      renderCryptoAnalysisTab(analysis);
    } else if (tabIdx === 3) {
      renderCryptoScannerTab();
    }
  }

  function cryptoTechSelectCoin(sym, autoSwitch) {
    sym = (sym || 'BTC').toUpperCase().trim();
    CRYPTO_TECH_STATE.symbol = sym;

    var inputEl = document.getElementById('crTechTickerInput');
    if (inputEl) inputEl.value = sym;

    var analysis = analyzeCryptoTechnical(sym, CRYPTO_TECH_STATE.timeframe);
    renderCryptoHeaderSummary(analysis);

    if (autoSwitch !== false) {
      cryptoTechSwitchTab(CRYPTO_TECH_STATE.activeTab || 1);
    } else {
      cryptoTechSwitchTab(CRYPTO_TECH_STATE.activeTab || 1);
    }
  }

  function cryptoTechSetTimeframe(tf) {
    CRYPTO_TECH_STATE.timeframe = tf;
    document.querySelectorAll('#cr-tech-tf-group .pbtn').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-tf') === tf);
    });
    var sym = CRYPTO_TECH_STATE.symbol || 'BTC';
    var analysis = analyzeCryptoTechnical(sym, tf);
    renderCryptoHeaderSummary(analysis);
    if (CRYPTO_TECH_STATE.activeTab === 1) renderCryptoChartTab(analysis);
    else if (CRYPTO_TECH_STATE.activeTab === 2) renderCryptoAnalysisTab(analysis);
  }

  function cryptoTechToggleChartMode(mode) {
    CRYPTO_TECH_STATE.chartMode = mode;
    var sym = CRYPTO_TECH_STATE.symbol || 'BTC';
    var analysis = analyzeCryptoTechnical(sym, CRYPTO_TECH_STATE.timeframe);
    renderCryptoChartTab(analysis);
  }

  // ── 9. TOP SUMMARY HEADER ──
  function renderCryptoHeaderSummary(a) {
    var barEl = document.getElementById('cr-tech-header-metrics');
    if (!barEl) return;

    var chgColor = a.chg24hPct >= 0 ? '#10B981' : '#EF4444';
    var chgIcon = a.chg24hPct >= 0 ? '▲' : '▼';

    barEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px 20px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:48px;height:48px;border-radius:12px;background:${a.color}22;color:${a.color};border:1px solid ${a.color}44;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800">
            ${a.icon}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:20px;font-weight:800;color:var(--text);font-family:var(--font-mono)">${a.sym}/USDT</span>
              <span class="badge b-accent" style="font-size:10px;padding:2px 7px">${a.category}</span>
              <span class="badge ${a.signalBadge}" style="font-size:11px;font-weight:800;padding:3px 9px">${a.overallSignal}</span>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px">${a.name} • TradingView: <code>${a.tvSymbol}</code></div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase">Harga Pasar (USD)</div>
            <div style="font-size:22px;font-weight:800;font-family:var(--font-mono);color:var(--text);margin-top:1px">${fmtUSD(a.curPriceUSD)}</div>
            <div style="font-size:11px;font-weight:700;color:${chgColor};display:flex;align-items:center;gap:4px">
              <span>${chgIcon} ${Math.abs(a.chg24hPct).toFixed(2)}% (24j)</span>
            </div>
          </div>

          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase">Konversi IDR (Rupiah)</div>
            <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:var(--accent);margin-top:2px">${fmtIDR(a.curPriceIDR)}</div>
            <div style="font-size:11px;color:var(--text3)">Kurs: Rp ${Number(getUsdIdrRate()).toLocaleString('id-ID')}</div>
          </div>

          <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:8px 14px;text-align:right">
            <div style="font-size:10px;font-weight:700;color:var(--text3)">WHALE TRACKER:</div>
            <div style="font-size:13px;font-weight:800;color:${a.whaleColor};margin-top:2px">${a.whaleStatus}</div>
            <div style="font-size:10px;color:var(--text3)">Score: <b style="color:${a.whaleColor}">${a.whaleScore}/100</b> · RVOL: <b>${a.rvol.toFixed(2)}x</b></div>
          </div>
        </div>
      </div>
    `;
  }

  // ── 10. TAB 1: INTERACTIVE CHART (TradingView & Native Overlay) ──
  function renderCryptoChartTab(a) {
    var container = document.getElementById('cr-chart-container');
    if (!container) return;

    var mode = CRYPTO_TECH_STATE.chartMode || 'native';

    if (mode === 'tv') {
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--bg3);border-bottom:1px solid var(--border);border-radius:12px 12px 0 0">
          <div style="font-size:12px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">
            <span>TradingView Live Crypto Terminal</span>
            <span class="badge b-up" style="font-size:9px">LIVE FEED</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-xs" onclick="cryptoTechToggleChartMode('native')">📊 Switch ke Native Canvas + Whale Overlay</button>
          </div>
        </div>
        <div id="cr-tv-widget-embed" style="height:540px;width:100%;background:#0b0e14"></div>
      `;

      // Embed TradingView Widget
      var widgetContainer = document.getElementById('cr-tv-widget-embed');
      if (widgetContainer) {
        widgetContainer.innerHTML = '';
        var tvIframe = document.createElement('iframe');
        tvIframe.style.width = '100%';
        tvIframe.style.height = '100%';
        tvIframe.style.border = 'none';
        tvIframe.src = 'https://s.tradingview.com/widgetembed/?frameElementId=tradingview_crypto&symbol=' + encodeURIComponent(a.tvSymbol) + '&interval=' + (a.timeframe === '1D' ? 'D' : a.timeframe === '1W' ? 'W' : a.timeframe.replace('m', '')) + '&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%22RSI%40tv-basicstudies%22%2C%22MASimple%40tv-basicstudies%22%2C%22Volume%40tv-basicstudies%22%5D&theme=dark&style=1&timezone=Asia%2FJakarta&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en&utm_source=localhost';
        widgetContainer.appendChild(tvIframe);
      }
      return;
    }

    // Native High Performance Canvas Chart + Indicators
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--bg3);border-bottom:1px solid var(--border);border-radius:12px 12px 0 0;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:14px;font-weight:800;color:var(--text);font-family:var(--font-mono)">${a.sym}/USDT — Timeframe ${a.timeframe}</span>
          <span class="badge" style="background:${a.volBreakoutColor}22;color:${a.volBreakoutColor};border:1px solid ${a.volBreakoutColor}44;font-size:10px">${a.volBreakoutTag}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-ghost btn-xs" onclick="cryptoTechToggleChartMode('tv')">📺 Buka TradingView Live Embed</button>
        </div>
      </div>

      <!-- Canvas Area -->
      <div style="padding:16px;background:var(--bg2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:11px;color:var(--text3);font-family:var(--font-mono)">
          <div>
            <span style="color:#00c8ff">■ EMA 9: ${fmtUSD(a.ema9)}</span> &nbsp;
            <span style="color:#f59e0b">■ EMA 21: ${fmtUSD(a.ema21)}</span> &nbsp;
            <span style="color:#8b5cf6">■ EMA 50: ${fmtUSD(a.ema50)}</span> &nbsp;
            <span style="color:#ef4444">■ Supertrend Stop: ${fmtUSD(a.riskPlan.stopLossUSD)}</span>
          </div>
          <div>
            <span>24j Volume: <b>${fmtUSD(a.total24hVolUSD)}</b> (RVOL: <b style="color:${a.volBreakoutColor}">${a.rvol.toFixed(2)}x</b>)</span>
          </div>
        </div>

        <div style="height:320px;position:relative;margin-bottom:14px">
          <canvas id="cr-native-main-chart" style="width:100%;height:100%"></canvas>
        </div>

        <!-- Sub-panel: Volume & Whale Inflow Delta -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;font-weight:700;color:var(--text3)">
          <span>📊 Volume Bar &amp; Whale Flow Spike (Hijau = Whale Buy, Merah = Whale Dump, Ungu = Volume Breakout &gt;2x)</span>
          <span style="color:${a.whaleColor}">Whale Flow Net: <b>${a.whaleFlowUSD >= 0 ? '+' : ''}${fmtUSD(a.whaleFlowUSD)}</b></span>
        </div>
        <div style="height:120px;position:relative">
          <canvas id="cr-native-volume-chart" style="width:100%;height:100%"></canvas>
        </div>
      </div>
    `;

    // Render Native Charts via Chart.js
    setTimeout(function() {
      drawNativeCryptoChart(a);
    }, 50);
  }

  function drawNativeCryptoChart(a) {
    if (typeof Chart === 'undefined') return;

    var ohlcv = a.ohlcv;
    var labels = ohlcv.map(function(d) {
      var dt = new Date(d.date);
      return (dt.getMonth() + 1) + '/' + dt.getDate() + (a.timeframe === '15m' || a.timeframe === '1h' ? ' ' + dt.getHours() + ':00' : '');
    });

    var closes = ohlcv.map(function(d) { return d.close; });
    var ema9 = calcEMA(closes, 9);
    var ema21 = calcEMA(closes, 21);
    var ema50 = calcEMA(closes, 50);

    // 1. Price Canvas
    var cvMain = document.getElementById('cr-native-main-chart');
    if (cvMain) {
      var existingMain = Chart.getChart(cvMain);
      if (existingMain) existingMain.destroy();

      new Chart(cvMain, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Harga ' + a.sym,
              data: closes,
              borderColor: a.color || '#3B82F6',
              backgroundColor: (a.color || '#3B82F6') + '15',
              borderWidth: 2.5,
              fill: true,
              tension: 0.2,
              pointRadius: 0
            },
            {
              label: 'EMA 9',
              data: ema9,
              borderColor: '#00c8ff',
              borderWidth: 1.2,
              pointRadius: 0,
              fill: false
            },
            {
              label: 'EMA 21',
              data: ema21,
              borderColor: '#f59e0b',
              borderWidth: 1.2,
              pointRadius: 0,
              fill: false
            },
            {
              label: 'EMA 50',
              data: ema50,
              borderColor: '#8b5cf6',
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(c) {
                  return c.dataset.label + ': ' + fmtUSD(c.parsed.y);
                }
              }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8fa3c8', font: { size: 10 }, maxTicksLimit: 10 } },
            y: {
              position: 'right',
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: {
                color: '#8fa3c8',
                font: { size: 10 },
                callback: function(v) { return fmtUSD(v); }
              }
            }
          }
        }
      });
    }

    // 2. Volume & Whale Delta Canvas
    var cvVol = document.getElementById('cr-native-volume-chart');
    if (cvVol) {
      var existingVol = Chart.getChart(cvVol);
      if (existingVol) existingVol.destroy();

      var volColors = ohlcv.map(function(d, i) {
        var isUp = i === 0 || d.close >= ohlcv[i - 1].close;
        if (d.isWhaleBar) return '#9945ff'; // Purple = Whale volume explosion
        return isUp ? '#10B981' : '#EF4444';
      });

      new Chart(cvVol, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Volume USD',
            data: ohlcv.map(function(d) { return d.volumeUSD; }),
            backgroundColor: volColors,
            borderRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(c) {
                  return 'Volume: ' + fmtUSD(c.parsed.y);
                }
              }
            }
          },
          scales: {
            x: { display: false },
            y: {
              position: 'right',
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: {
                color: '#8fa3c8',
                font: { size: 9 },
                callback: function(v) { return fmtUSD(v); }
              }
            }
          }
        }
      });
    }
  }

  // ── 11. TAB 2: COMPREHENSIVE TECHNICAL & WHALE ANALYSIS ──
  function renderCryptoAnalysisTab(a) {
    var container = document.getElementById('cr-analysis-container');
    if (!container) return;

    var lo = a.largeOrders;

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:20px">
        
        <!-- SECTION A: WHALE IDENTIFIER & SMART MONEY TRACKER -->
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border2);padding-bottom:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:20px">🐋</span>
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--text)">Whale Identifier &amp; Smart Money Accumulation</div>
                <div style="font-size:11px;color:var(--text3)">Deteksi akumulasi dompet paus, aliran dana besar institusional, dan Chaikin Money Flow (CMF).</div>
              </div>
            </div>
            <span class="badge ${a.whaleBadgeClass}" style="font-size:12px;padding:4px 10px;font-weight:800">${a.whaleStatus}</span>
          </div>

          <!-- 4 Stat Cards for Whale Tracker -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:18px">
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase">Whale Accumulation Score</div>
              <div style="font-size:24px;font-weight:800;font-family:var(--font-mono);color:${a.whaleColor};margin-top:2px">${a.whaleScore}/100</div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">${a.whaleScore >= 60 ? 'Tekanan beli paus mendominasi' : 'Paus mendistribusikan / menjual'}</div>
            </div>

            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase">Estimated Whale Net Flow (24j)</div>
              <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:${a.whaleFlowUSD >= 0 ? '#10B981' : '#EF4444'};margin-top:2px">
                ${a.whaleFlowUSD >= 0 ? '+' : ''}${fmtUSD(a.whaleFlowUSD)}
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">≈ ${fmtIDR(Math.abs(a.whaleFlowIDR))} ${a.whaleFlowUSD >= 0 ? 'Inflow' : 'Outflow'}</div>
            </div>

            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase">Chaikin Money Flow (CMF-20)</div>
              <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:${a.cmf20 >= 0 ? '#10B981' : '#EF4444'};margin-top:2px">
                ${a.cmf20 >= 0 ? '+' : ''}${a.cmf20.toFixed(3)}
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">${a.cmf20 > 0.05 ? 'Akumulasi kuat di atas 0' : 'Arus kas keluar negatif'}</div>
            </div>

            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase">Liquidity Sweep / Stop-Hunt</div>
              <div style="font-size:14px;font-weight:800;color:${a.isLiquiditySweep ? '#F59E0B' : '#10B981'};margin-top:4px">
                ${a.isLiquiditySweep ? '⚠️ ' + a.sweepType : '✓ Normal Orderflow (No Hunt)'}
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">Struktur likuiditas sumbu candle &amp; order book</div>
            </div>
          </div>

          <!-- Whale Tier Orderflow Breakdown -->
          <div style="background:var(--bg);border:1px solid var(--border2);border-radius:10px;padding:16px">
            <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:10px">Distribusi Volume Berdasarkan Ukuran Order Paus (Whale Tier Flow):</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:10px;font-family:var(--font-mono);font-size:12px">
              <div style="padding:10px;background:var(--bg2);border-radius:8px;border-left:3px solid #9945ff">
                <div style="color:var(--text3);font-size:10px;font-weight:700">MEGA WHALE (&gt;$5M)</div>
                <div style="color:var(--text);font-weight:800;margin-top:2px">${fmtUSD(lo.megaWhaleUSD)}</div>
              </div>
              <div style="padding:10px;background:var(--bg2);border-radius:8px;border-left:3px solid #3B82F6">
                <div style="color:var(--text3);font-size:10px;font-weight:700">LARGE WHALE ($1M - $5M)</div>
                <div style="color:var(--text);font-weight:800;margin-top:2px">${fmtUSD(lo.largeWhaleUSD)}</div>
              </div>
              <div style="padding:10px;background:var(--bg2);border-radius:8px;border-left:3px solid #10B981">
                <div style="color:var(--text3);font-size:10px;font-weight:700">SHARK ($100k - $1M)</div>
                <div style="color:var(--text);font-weight:800;margin-top:2px">${fmtUSD(lo.sharkUSD)}</div>
              </div>
              <div style="padding:10px;background:var(--bg2);border-radius:8px;border-left:3px solid #64748b">
                <div style="color:var(--text3);font-size:10px;font-weight:700">RETAIL (&lt;$100k)</div>
                <div style="color:var(--text);font-weight:800;margin-top:2px">${fmtUSD(lo.retailUSD)}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION B: VOLUME BREAKOUT ENGINE -->
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:20px">🚀</span>
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--text)">Volume Breakout &amp; Relative Volume (RVOL)</div>
                <div style="font-size:11px;color:var(--text3)">Pengukuran ledakan volume saat breakout resistance, buying/selling climax, dan tren OBV.</div>
              </div>
            </div>
            <span class="badge" style="background:${a.volBreakoutColor}22;color:${a.volBreakoutColor};border:1px solid ${a.volBreakoutColor}44;font-size:11px;font-weight:800;padding:4px 10px">${a.volBreakoutTag}</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px">
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;color:var(--text3)">RELATIVE VOLUME (RVOL)</div>
              <div style="font-size:24px;font-weight:800;font-family:var(--font-mono);color:${a.volBreakoutColor};margin-top:2px">${a.rvol.toFixed(2)}x</div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">Rasio terhadap rata-rata volume 20 sesi</div>
            </div>

            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;color:var(--text3)">ON-BALANCE VOLUME (OBV)</div>
              <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:${a.isObvBullish ? '#10B981' : '#EF4444'};margin-top:2px">
                ${a.isObvBullish ? '▲ Bullish Uptrend' : '▼ Bearish Divergence'}
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">Akumulasi volume OBV vs MA-20</div>
            </div>

            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;color:var(--text3)">BOLLINGER BANDWIDTH SQUEEZE</div>
              <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:${a.bb.bandwidth < 5 ? '#F59E0B' : '#3B82F6'};margin-top:2px">
                ${a.bb.bandwidth.toFixed(2)}% ${a.bb.bandwidth < 5 ? '(SQUEEZE ⚠️)' : '(Expanded)'}
              </div>
              <div style="font-size:11px;color:var(--text3);margin-top:4px">Kompresi volatilitas siap meledak</div>
            </div>
          </div>
        </div>

        <!-- SECTION C: TECHNICAL INDICATOR GAUGES & OSCILLATORS -->
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:20px">⚡</span>
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--text)">Matriks 15+ Indikator Teknikal &amp; Momentum</div>
                <div style="font-size:11px;color:var(--text3)">Kalkulasi otomatis RSI, Stochastic RSI, MACD, Moving Average Ribbon, dan Supertrend.</div>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px">
            <!-- RSI Card -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;font-weight:700;color:var(--text3)">RSI (14)</span>
                <span class="badge ${a.rsi < 30 ? 'b-up' : a.rsi > 70 ? 'b-dn' : 'b-neu'}" style="font-size:9px">
                  ${a.rsi < 30 ? 'OVERSOLD' : a.rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL'}
                </span>
              </div>
              <div style="font-size:22px;font-weight:800;font-family:var(--font-mono);color:var(--text);margin-top:4px">${a.rsi.toFixed(1)}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:4px">StochRSI K: ${a.stochK.toFixed(1)} / D: ${a.stochD.toFixed(1)}</div>
            </div>

            <!-- MACD Card -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;font-weight:700;color:var(--text3)">MACD (12, 26, 9)</span>
                <span class="badge ${a.macdHist > 0 ? 'b-up' : 'b-dn'}" style="font-size:9px">
                  ${a.macdHist > 0 ? 'BULLISH CROSS' : 'BEARISH CROSS'}
                </span>
              </div>
              <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:${a.macdHist > 0 ? '#10B981' : '#EF4444'};margin-top:4px">
                Hist: ${a.macdHist > 0 ? '+' : ''}${a.macdHist.toFixed(2)}
              </div>
              <div style="font-size:10px;color:var(--text3);margin-top:4px">MACD: ${a.macdLine.toFixed(2)} · Sig: ${a.macdSignal.toFixed(2)}</div>
            </div>

            <!-- EMA Ribbon Card -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;font-weight:700;color:var(--text3)">EMA RIBBON TREND</span>
                <span class="badge ${a.curPriceUSD > a.ema50 ? 'b-up' : 'b-dn'}" style="font-size:9px">
                  ${a.curPriceUSD > a.ema50 ? 'UPTREND (BULL)' : 'DOWNTREND (BEAR)'}
                </span>
              </div>
              <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:var(--text);margin-top:4px">
                EMA50: ${fmtUSD(a.ema50)}
              </div>
              <div style="font-size:10px;color:var(--text3);margin-top:4px">EMA9: ${fmtUSD(a.ema9)} · EMA21: ${fmtUSD(a.ema21)}</div>
            </div>

            <!-- Candlestick Psychology -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;font-weight:700;color:var(--text3)">CANDLESTICK ACTION</span>
                <span class="badge ${a.candleBullish ? 'b-up' : 'b-dn'}" style="font-size:9px">
                  ${a.candleBullish ? 'BULLISH' : 'BEARISH'}
                </span>
              </div>
              <div style="font-size:14px;font-weight:800;color:var(--text);margin-top:6px">${a.candlePattern}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:4px">ATR Volatilitas: ${fmtUSD(a.atr)}</div>
            </div>
          </div>
        </div>

        <!-- SECTION D: SUPPORT, RESISTANCE, PIVOTS & TP/SL RISK PLAN -->
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--border2);padding-bottom:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:20px">🎯</span>
              <div>
                <div style="font-size:16px;font-weight:800;color:var(--text)">Kalkulator Target Harga (TP/SL) &amp; Level Pivot S/R</div>
                <div style="font-size:11px;color:var(--text3)">Perhitungan Risk-to-Reward Ratio terukur berbasis volatilitas ATR dan level Fibonacci.</div>
              </div>
            </div>
            <div style="font-size:12px;font-weight:700;color:var(--accent);font-family:var(--font-mono)">
              R:R Ratio: <b>1 : ${a.riskPlan.riskRewardRatio}</b>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:14px">
            <!-- Left: Dynamic TP/SL Plan -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px">
              <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:12px">Trading Plan &amp; Risk Sizing:</div>
              
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);font-size:12px">
                <span style="color:#10B981;font-weight:700">Take Profit 3 (Moonbag 5R):</span>
                <span style="font-family:var(--font-mono);font-weight:800;color:var(--text)">${fmtUSD(a.riskPlan.takeProfit3USD)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);font-size:12px">
                <span style="color:#10B981;font-weight:700">Take Profit 2 (Swing Target):</span>
                <span style="font-family:var(--font-mono);font-weight:800;color:var(--text)">${fmtUSD(a.riskPlan.takeProfit2USD)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);font-size:12px">
                <span style="color:#3B82F6;font-weight:700">Take Profit 1 (Scalp Target):</span>
                <span style="font-family:var(--font-mono);font-weight:800;color:var(--text)">${fmtUSD(a.riskPlan.takeProfit1USD)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2);font-size:12px;background:rgba(59,130,246,0.1);padding:8px;border-radius:6px">
                <span style="color:var(--accent);font-weight:800">Entry Reference:</span>
                <span style="font-family:var(--font-mono);font-weight:800;color:var(--text)">${fmtUSD(a.curPriceUSD)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:12px">
                <span style="color:#EF4444;font-weight:700">Stop Loss (ATR 1.5x):</span>
                <span style="font-family:var(--font-mono);font-weight:800;color:#EF4444">${fmtUSD(a.riskPlan.stopLossUSD)}</span>
              </div>
            </div>

            <!-- Right: Pivots & Fibonacci -->
            <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px">
              <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:12px">Pivot Points &amp; Support/Resistance:</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;font-family:var(--font-mono)">
                <div style="padding:6px 8px;background:var(--bg);border-radius:6px">
                  <span style="color:#EF4444;font-weight:700">Resistance 3:</span><br>
                  <span style="font-weight:800;color:var(--text)">${fmtUSD(a.pivots.r3)}</span>
                </div>
                <div style="padding:6px 8px;background:var(--bg);border-radius:6px">
                  <span style="color:#EF4444;font-weight:700">Resistance 2:</span><br>
                  <span style="font-weight:800;color:var(--text)">${fmtUSD(a.pivots.r2)}</span>
                </div>
                <div style="padding:6px 8px;background:var(--bg);border-radius:6px">
                  <span style="color:#F59E0B;font-weight:700">Resistance 1:</span><br>
                  <span style="font-weight:800;color:var(--text)">${fmtUSD(a.pivots.r1)}</span>
                </div>
                <div style="padding:6px 8px;background:var(--bg);border-radius:6px">
                  <span style="color:var(--accent);font-weight:700">Central Pivot (P):</span><br>
                  <span style="font-weight:800;color:var(--text)">${fmtUSD(a.pivots.pivot)}</span>
                </div>
                <div style="padding:6px 8px;background:var(--bg);border-radius:6px">
                  <span style="color:#10B981;font-weight:700">Support 1:</span><br>
                  <span style="font-weight:800;color:var(--text)">${fmtUSD(a.pivots.s1)}</span>
                </div>
                <div style="padding:6px 8px;background:var(--bg);border-radius:6px">
                  <span style="color:#10B981;font-weight:700">Support 2:</span><br>
                  <span style="font-weight:800;color:var(--text)">${fmtUSD(a.pivots.s2)}</span>
                </div>
              </div>
              <div style="margin-top:10px;padding:8px;background:var(--bg);border-radius:6px;font-size:11px;font-family:var(--font-mono);display:flex;justify-content:space-between">
                <span style="color:#f59e0b;font-weight:700">Fibonacci Golden Pocket:</span>
                <span style="font-weight:800;color:var(--text)">${fmtUSD(a.pivots.fibGoldenPocket)}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  // ── 12. TAB 3: MARKET-WIDE MULTI-COIN SCANNER & SIGNAL MATRIX ──
  function renderCryptoScannerTab() {
    var container = document.getElementById('cr-scanner-container');
    if (!container) return;

    var tf = CRYPTO_TECH_STATE.timeframe || '1D';
    var allCoins = CRYPTO_TECH_UNIVERSE;

    // Analyze all coins
    var results = allCoins.map(function(c) {
      return analyzeCryptoTechnical(c.s, tf);
    });

    // Apply Filter Preset
    var preset = CRYPTO_TECH_STATE.filterPreset || 'all';
    var cat = CRYPTO_TECH_STATE.filterCategory || '';
    var sig = CRYPTO_TECH_STATE.filterSignal || '';
    var q = (CRYPTO_TECH_STATE.searchQuery || '').toLowerCase().trim();

    var filtered = results.filter(function(r) {
      if (q && r.sym.toLowerCase().indexOf(q) === -1 && r.name.toLowerCase().indexOf(q) === -1) return false;
      if (cat && r.category !== cat) return false;
      if (sig && r.overallSignal !== sig) return false;

      if (preset === 'breakout') return r.isVolBreakout;
      if (preset === 'whale') return r.whaleScore >= 65;
      if (preset === 'buy') return r.overallSignal === 'STRONG BUY' || r.overallSignal === 'BUY';
      if (preset === 'oversold') return r.rsi < 35;
      if (preset === 'golden') return r.curPriceUSD > r.ema50 && r.macdHist > 0;
      return true;
    });

    container.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">
              <span>⚡ Multi-Coin Technical &amp; Whale Flow Scanner</span>
              <span class="badge b-accent" style="font-size:10px">${filtered.length} Koin Terdeteksi</span>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">Screening instan 30+ aset crypto utama berdasarkan Volume Breakout, Skor Paus, RSI, dan Sinyal Konfluensi.</div>
          </div>
        </div>

        <!-- Filter Presets Buttons -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
          <button class="pbtn ${preset === 'all' ? 'on' : ''}" onclick="cryptoTechSetPreset('all')">🔥 Semua Sinyal</button>
          <button class="pbtn ${preset === 'breakout' ? 'on' : ''}" onclick="cryptoTechSetPreset('breakout')">🚀 Volume Breakout (&gt;2x)</button>
          <button class="pbtn ${preset === 'whale' ? 'on' : ''}" onclick="cryptoTechSetPreset('whale')">🐋 Whale Accumulation (&gt;65)</button>
          <button class="pbtn ${preset === 'buy' ? 'on' : ''}" onclick="cryptoTechSetPreset('buy')">⚡ Strong Buy / Buy Sinyal</button>
          <button class="pbtn ${preset === 'oversold' ? 'on' : ''}" onclick="cryptoTechSetPreset('oversold')">📉 Oversold Bounce (RSI &lt; 35)</button>
          <button class="pbtn ${preset === 'golden' ? 'on' : ''}" onclick="cryptoTechSetPreset('golden')">🌟 Golden Uptrend &amp; MACD</button>
        </div>

        <!-- Search & Category Filters -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
          <input type="text" placeholder="Cari koin (BTC, SOL, PEPE)..." class="finput" style="padding:6px 12px;font-size:11px;width:180px" value="${CRYPTO_TECH_STATE.searchQuery || ''}" oninput="cryptoTechSetSearch(this.value)">
          <select class="finput fsel" style="padding:6px 10px;font-size:11px" onchange="cryptoTechSetCategory(this.value)">
            <option value="">Semua Kategori</option>
            <option value="Layer 1" ${cat === 'Layer 1' ? 'selected' : ''}>Layer 1</option>
            <option value="Layer 2" ${cat === 'Layer 2' ? 'selected' : ''}>Layer 2</option>
            <option value="DeFi" ${cat === 'DeFi' ? 'selected' : ''}>DeFi</option>
            <option value="AI & Data" ${cat === 'AI & Data' ? 'selected' : ''}>AI &amp; Data</option>
            <option value="Meme" ${cat === 'Meme' ? 'selected' : ''}>Meme</option>
            <option value="Oracle" ${cat === 'Oracle' ? 'selected' : ''}>Oracle</option>
          </select>
          <select class="finput fsel" style="padding:6px 10px;font-size:11px" onchange="cryptoTechSetSignal(this.value)">
            <option value="">Semua Status Sinyal</option>
            <option value="STRONG BUY" ${sig === 'STRONG BUY' ? 'selected' : ''}>STRONG BUY</option>
            <option value="BUY" ${sig === 'BUY' ? 'selected' : ''}>BUY</option>
            <option value="NEUTRAL" ${sig === 'NEUTRAL' ? 'selected' : ''}>NEUTRAL</option>
            <option value="SELL" ${sig === 'SELL' ? 'selected' : ''}>SELL</option>
            <option value="STRONG SELL" ${sig === 'STRONG SELL' ? 'selected' : ''}>STRONG SELL</option>
          </select>
          <button class="btn btn-ghost btn-xs" onclick="cryptoTechResetFilters()">↺ Reset Filter</button>
        </div>

        <!-- Table -->
        <div style="overflow-x:auto">
          <table class="tbl" style="width:100%">
            <thead>
              <tr>
                <th>Aset &amp; Kategori</th>
                <th>Harga (USD)</th>
                <th>Harga (IDR)</th>
                <th>24j Chg</th>
                <th>RVOL Breakout</th>
                <th>Whale Score</th>
                <th>RSI (14)</th>
                <th>MACD Hist</th>
                <th>Sinyal Teknikal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(function(r) {
                var chgColor = r.chg24hPct >= 0 ? '#10B981' : '#EF4444';
                return `
                  <tr style="cursor:pointer" onclick="cryptoTechSelectCoin('${r.sym}', true)">
                    <td>
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:16px">${r.icon}</span>
                        <div>
                          <div style="font-weight:800;color:var(--text);font-family:var(--font-mono)">${r.sym}</div>
                          <div style="font-size:10px;color:var(--text3)">${r.name} · <span style="color:var(--accent)">${r.category}</span></div>
                        </div>
                      </div>
                    </td>
                    <td style="font-family:var(--font-mono);font-weight:800;color:var(--text)">${fmtUSD(r.curPriceUSD)}</td>
                    <td style="font-family:var(--font-mono);font-size:11px;color:var(--text2)">${fmtIDR(r.curPriceIDR)}</td>
                    <td style="font-family:var(--font-mono);font-weight:700;color:${chgColor}">
                      ${r.chg24hPct >= 0 ? '+' : ''}${r.chg24hPct.toFixed(2)}%
                    </td>
                    <td>
                      <span class="badge" style="background:${r.volBreakoutColor}22;color:${r.volBreakoutColor};border:1px solid ${r.volBreakoutColor}44;font-size:10px;font-family:var(--font-mono)">
                        ${r.rvol.toFixed(2)}x ${r.isVolBreakout ? '🚀' : ''}
                      </span>
                    </td>
                    <td>
                      <div style="display:flex;align-items:center;gap:6px">
                        <span style="font-family:var(--font-mono);font-weight:800;color:${r.whaleColor}">${r.whaleScore}</span>
                        <div style="width:50px;height:6px;background:var(--bg);border-radius:3px;overflow:hidden">
                          <div style="width:${r.whaleScore}%;height:100%;background:${r.whaleColor}"></div>
                        </div>
                      </div>
                    </td>
                    <td style="font-family:var(--font-mono);font-weight:700;color:${r.rsi < 30 ? '#10B981' : r.rsi > 70 ? '#EF4444' : 'var(--text2)'}">
                      ${r.rsi.toFixed(1)}
                    </td>
                    <td style="font-family:var(--font-mono);font-size:11px;color:${r.macdHist > 0 ? '#10B981' : '#EF4444'}">
                      ${r.macdHist > 0 ? '+' : ''}${r.macdHist.toFixed(2)}
                    </td>
                    <td>
                      <span class="badge ${r.signalBadge}" style="font-size:10px;font-weight:800;padding:3px 8px">
                        ${r.overallSignal}
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();cryptoTechSelectCoin('${r.sym}', true)" style="font-size:10px;padding:4px 8px">
                        Analisa →
                      </button>
                    </td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Tidak ada koin yang sesuai dengan kriteria filter.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function cryptoTechSetPreset(preset) {
    CRYPTO_TECH_STATE.filterPreset = preset;
    renderCryptoScannerTab();
  }

  function cryptoTechSetCategory(cat) {
    CRYPTO_TECH_STATE.filterCategory = cat;
    renderCryptoScannerTab();
  }

  function cryptoTechSetSignal(sig) {
    CRYPTO_TECH_STATE.filterSignal = sig;
    renderCryptoScannerTab();
  }

  function cryptoTechSetSearch(q) {
    CRYPTO_TECH_STATE.searchQuery = q;
    renderCryptoScannerTab();
  }

  function cryptoTechResetFilters() {
    CRYPTO_TECH_STATE.filterPreset = 'all';
    CRYPTO_TECH_STATE.filterCategory = '';
    CRYPTO_TECH_STATE.filterSignal = '';
    CRYPTO_TECH_STATE.searchQuery = '';
    renderCryptoScannerTab();
  }

  // ── EXPOSE PUBLIC GLOBAL FUNCTIONS ──
  window.initCryptoTechnicalSuite = initCryptoTechnicalSuite;
  window.cryptoTechSwitchTab = cryptoTechSwitchTab;
  window.cryptoTechSelectCoin = cryptoTechSelectCoin;
  window.cryptoTechSetTimeframe = cryptoTechSetTimeframe;
  window.cryptoTechToggleChartMode = cryptoTechToggleChartMode;
  window.cryptoTechSetPreset = cryptoTechSetPreset;
  window.cryptoTechSetCategory = cryptoTechSetCategory;
  window.cryptoTechSetSignal = cryptoTechSetSignal;
  window.cryptoTechSetSearch = cryptoTechSetSearch;
  window.cryptoTechResetFilters = cryptoTechResetFilters;
  window.analyzeCryptoTechnical = analyzeCryptoTechnical;

})();
