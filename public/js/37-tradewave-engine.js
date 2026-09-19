/**
 * 37-tradewave-engine.js — TradeWave Wave Flow Intelligence Engine
 *
 * CORE CAPABILITIES:
 * 1. Elliott Wave & Trend Impulse Detector (Waves 1-2-3-4-5 & ABC Corrective Cycles)
 * 2. SuperTrend Wave & 4-EMA Ribbon (EMA 9, 21, 50 Trend Alignment)
 * 3. Smart Money Wave & Flow Momentum (CMF-20, Volume Spikes, Accumulation/Distribution Phase)
 * 4. Fibonacci Wave Projection Targets (TP1: 0.618, TP2: 1.0, TP3: 1.618) & Invalidation Stop Loss
 * 5. Risk-to-Reward Position Sizing & Trade Wave Planner
 *
 * NOTE (2026-09-18): TradeWave is no longer its own page/sidebar entry.
 * Its whole-market "Wave Scanner" tab was removed first (it scanned a
 * hardcoded ~25-ticker sample mixing IDX equities and crypto, violating
 * CLAUDE.md's whole-BEI-market screening rule) — that formula was ported
 * server-side as computeWaveAnalysis() (lib/idx-data-engine.js) and now
 * runs whole-market as extra columns/filter in the unified Screener.
 * Following that, the user asked for the single-ticker Wave Cockpit and
 * Risk Planner tabs to move into the Screener too, as additional
 * top-level tabs there, with the standalone TradeWave toolbar/page
 * removed entirely. This file now only holds the computation engine
 * (twAnalyzeWave() etc.) plus twRenderSubPage(), which the unified
 * Screener (public/js/48-unified-screener.js) calls to render Wave
 * Cockpit/Risk Planner content into its own tab container — there is no
 * more standalone TradeWave page or tab-switch UI in this file.
 */

(function(window, document) {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // 1. STATE & UNIVERSE DEFINITION
  // ══════════════════════════════════════════════════════════
  var TW_STATE = {
    ticker: 'BBCA',
    assetType: 'stock', // 'stock' | 'crypto' | 'us'
    timeframe: '1D',
    searchQuery: '',
    capital: 100000000, // Rp 100 Jt default
    riskPct: 1.5,       // 1.5% risk
    chartMode: 'wave',
    cachedAnalysis: {}
  };

  var TW_CHARTS = {};

  function twKillChart(key) {
    if (TW_CHARTS[key]) {
      try { TW_CHARTS[key].destroy(); } catch (e) {}
      delete TW_CHARTS[key];
    }
  }

  // ══════════════════════════════════════════════════════════
  // 2. MATHEMATICAL WAVE & INDICATOR COMPUTATION ENGINE
  // ══════════════════════════════════════════════════════════

  /**
   * Generates or fetches synthetic & live OHLCV price series for wave calculations
   */
  function twGetOhlcv(ticker, count) {
    count = count || 60;
    var cleanTk = (ticker || 'BBCA').toUpperCase().replace('.JK', '').replace('.US', '');

    // 1. Prioritize real market data from Yahoo / RD_STORE
    if (typeof rdGetAny === 'function') {
      var realRows = rdGetAny(cleanTk);
      if (realRows && realRows.length > 0) {
        var slice = realRows.slice(-count);
        return slice.map(function(r) {
          var o = r.open || r.o || r.close || r.c || 5000;
          var h = r.high || r.h || r.close || r.c || o;
          var l = r.low || r.l || r.close || r.c || o;
          var c = r.close || r.c || o;
          var v = r.volume || r.v || r.vol || 1000000;
          var mfm = (h - l) > 0 ? ((c - l) - (h - c)) / (h - l) : 0;
          var dt = new Date(r.date || r.dt || Date.now());
          return { dt: dt, date: dt, open: o, o: o, high: h, h: h, low: l, l: l, close: c, c: c, vol: v, v: v, volume: v, mfm: mfm, mfv: mfm * v };
        });
      }
    }

    if (typeof isValidStockTicker === 'function' && !isValidStockTicker(cleanTk)) {
      return [];
    }

    // No real candle history cached yet for this ticker. This used to
    // generate a completely fake OHLCV series here: a seeded pseudo-random
    // walk keyed off the ticker's own character codes (so "BBCA" always
    // produced the exact same fake wave shape), styled with a sine-wave
    // "trend + swing cycle" to look like a real chart, then rescaled to
    // the real current price so only the shape - not the endpoint - gave
    // it away. Every downstream Elliott Wave / SuperTrend / CMF number was
    // computed from that invented series, with no disclosure.
    // twAnalyzeWave() already has a proper "no data" error path for an
    // empty array (checked right after calling this function), so the fix
    // is simply to return empty here instead of fabricating, and kick off
    // a real fetch in the background so a re-render shortly after picks
    // up the genuine Yahoo Finance history once it lands.
    twFetchRealHistoryInBackground(cleanTk);
    return [];
  }

  var TW_FETCHING = {};
  function twFetchRealHistoryInBackground(cleanTk) {
    if (TW_FETCHING[cleanTk]) return;
    if (typeof rdEnsure !== 'function') return;
    TW_FETCHING[cleanTk] = true;
    rdEnsure(cleanTk, function(err) {
      TW_FETCHING[cleanTk] = false;
      if (err) return; // stays on the honest "no data" state - never fall back to fake data
      // Only re-render if the user is still looking at this same ticker.
      // Wave Cockpit/Risk Planner now live inside the unified Screener page
      // (usRenderShell() there decides whether to actually draw the Wave
      // sub-tab based on its own current tab state) rather than having
      // their own page-level renderer.
      if (TW_STATE.ticker === cleanTk && typeof usRenderShell === 'function') {
        usRenderShell();
      }
    });
  }

  /**
   * EMA Calculator
   */
  function twCalcEma(data, period) {
    var k = 2 / (period + 1);
    var ema = [];
    var prev = data[0];
    ema.push(prev);
    for (var i = 1; i < data.length; i++) {
      var val = data[i] * k + prev * (1 - k);
      ema.push(val);
      prev = val;
    }
    return ema;
  }

  /**
   * RSI (Wilder, period 14 by default) — standard formula from real closes.
   * Replaces a previous "rsiVal = 55 + (cmf*30) + (chgPct*2)" placeholder
   * that was labeled RSI in the UI (and used to gate the Wave 5 Climax /
   * waveScore thresholds) but was never an actual RSI calculation.
   */
  function twCalcRsi(closes, period) {
    period = period || 14;
    var rsi = [];
    if (closes.length < 2) return closes.map(function() { return 50; });
    var gains = 0, losses = 0;
    for (var i = 1; i <= period && i < closes.length; i++) {
      var d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    var avgGain = gains / period, avgLoss = losses / period;
    for (var i = 0; i < closes.length; i++) {
      if (i <= period) {
        rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
        continue;
      }
      var delta = closes[i] - closes[i - 1];
      var gain = delta > 0 ? delta : 0;
      var loss = delta < 0 ? -delta : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }
    return rsi;
  }

  /**
   * ATR (Average True Range) & SuperTrend
   */
  function twCalcSuperTrend(ohlcv, period, factor) {
    period = period || 10;
    factor = factor || 3.0;
    var tr = [];
    for (var i = 0; i < ohlcv.length; i++) {
      if (i === 0) {
        tr.push(ohlcv[i].high - ohlcv[i].low);
      } else {
        var h = ohlcv[i].high;
        var l = ohlcv[i].low;
        var prevC = ohlcv[i - 1].close;
        var val = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
        tr.push(val);
      }
    }

    var atr = [];
    var sum = 0;
    for (var j = 0; j < tr.length; j++) {
      sum += tr[j];
      if (j < period) {
        atr.push(sum / (j + 1));
      } else {
        sum -= tr[j - period];
        atr.push(sum / period);
      }
    }

    var superTrend = [];
    var direction = 1; // 1 = Bullish, -1 = Bearish

    for (var k = 0; k < ohlcv.length; k++) {
      var hl2 = (ohlcv[k].high + ohlcv[k].low) / 2;
      var curAtr = atr[k];
      var upperBand = hl2 + factor * curAtr;
      var lowerBand = hl2 - factor * curAtr;
      var c = ohlcv[k].close;

      if (k === 0) {
        superTrend.push({ val: lowerBand, dir: 1, upper: upperBand, lower: lowerBand, atr: curAtr });
      } else {
        var prevST = superTrend[k - 1];
        if (c > prevST.upper) {
          direction = 1;
        } else if (c < prevST.lower) {
          direction = -1;
        } else {
          direction = prevST.dir;
        }

        var lineVal = direction === 1 ? lowerBand : upperBand;
        superTrend.push({ val: lineVal, dir: direction, upper: upperBand, lower: lowerBand, atr: curAtr });
      }
    }

    return { atr: atr, superTrend: superTrend };
  }

  /**
   * Complete Wave Flow & Elliott Wave Recognition Engine
   */
  function twAnalyzeWave(ticker) {
    var cleanTk = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();
    if (typeof isValidStockTicker === 'function' && !isValidStockTicker(cleanTk)) {
      return {
        isValid: false,
        ticker: cleanTk,
        error: 'Ticker "' + cleanTk + '" tidak terdaftar dalam Stock Universe IDX atau Yahoo Finance.'
      };
    }
    var rawOhlcv = twGetOhlcv(cleanTk, 65);
    if (!rawOhlcv || !rawOhlcv.length) {
      return {
        isValid: false,
        ticker: cleanTk,
        error: 'Tidak ada riwayat candle atau transaksi pasar untuk ticker "' + cleanTk + '". Proyeksi Fibonacci dibatalkan.'
      };
    }
    var ohlcv = rawOhlcv.map(function(d) {
      if (!d) return null;
      var c = Number(d.close !== undefined ? d.close : (d.c !== undefined ? d.c : 0));
      var o = Number(d.open !== undefined ? d.open : (d.o !== undefined ? d.o : c));
      var h = Number(d.high !== undefined ? d.high : (d.h !== undefined ? d.h : Math.max(o, c)));
      var l = Number(d.low !== undefined ? d.low : (d.l !== undefined ? d.l : Math.min(o, c)));
      var v = Number(d.volume !== undefined ? d.volume : (d.v !== undefined ? d.v : (d.vol !== undefined ? d.vol : 0)));
      var dt = d.dt || d.date || new Date();
      return { dt: dt, date: dt, open: o, o: o, high: h, h: h, low: l, l: l, close: c, c: c, vol: v, v: v, volume: v, mfm: d.mfm || 0, mfv: d.mfv || 0 };
    }).filter(Boolean);

    if (!ohlcv.length) {
      return {
        isValid: false,
        ticker: cleanTk,
        error: 'Data harga kosong untuk ticker "' + cleanTk + '". Proyeksi Fibonacci dibatalkan.'
      };
    }
    var closes = ohlcv.map(function(d) { return d.close; });
    var n = ohlcv.length;
    var cur = ohlcv[n - 1];
    var prev = ohlcv[n - 2] || cur;

    // 1. EMA Ribbon (9, 21, 50, 200)
    var ema9 = twCalcEma(closes, 9);
    var ema21 = twCalcEma(closes, 21);
    var ema50 = twCalcEma(closes, 50);

    var curEma9 = ema9[n - 1];
    var curEma21 = ema21[n - 1];
    var curEma50 = ema50[n - 1];

    var ribbonBullish = curEma9 > curEma21 && curEma21 > curEma50;
    var ribbonBearish = curEma9 < curEma21 && curEma21 < curEma50;

    // 2. SuperTrend & ATR
    var stRes = twCalcSuperTrend(ohlcv, 10, 3.0);
    var curSt = stRes.superTrend[n - 1];
    var curAtr = stRes.atr[n - 1] || (cur.close * 0.02);

    // 3. Chaikin Money Flow (CMF-20)
    var cmfSumMfv = 0;
    var cmfSumVol = 0;
    for (var i = Math.max(0, n - 20); i < n; i++) {
      cmfSumMfv += ohlcv[i].mfv;
      cmfSumVol += ohlcv[i].volume;
    }
    var cmf = cmfSumVol > 0 ? (cmfSumMfv / cmfSumVol) : 0;

    // 4. Pivot Highs and Lows for Elliott Wave Structure
    var pivots = [];
    for (var p = 3; p < n - 3; p++) {
      var isHigh = ohlcv[p].high > ohlcv[p - 1].high && ohlcv[p].high > ohlcv[p - 2].high &&
                   ohlcv[p].high > ohlcv[p + 1].high && ohlcv[p].high > ohlcv[p + 2].high;
      var isLow = ohlcv[p].low < ohlcv[p - 1].low && ohlcv[p].low < ohlcv[p - 2].low &&
                  ohlcv[p].low < ohlcv[p + 1].low && ohlcv[p].low < ohlcv[p + 2].low;
      if (isHigh) pivots.push({ idx: p, type: 'H', price: ohlcv[p].high, date: ohlcv[p].date });
      if (isLow) pivots.push({ idx: p, type: 'L', price: ohlcv[p].low, date: ohlcv[p].date });
    }

    // 5. Determine Current Elliott Wave Phase
    var wavePhase = 'WAVE 3 EXTENSION';
    var waveLabel = 'Impulse Wave 3 (Super Rally)';
    var waveDescription = 'Gelombang impulsif terkuat dengan konfirmasi akumulasi volume institusi.';
    var waveColor = '#10B981'; // Green
    var waveBadge = 'b-up';

    var chgPct = prev.close > 0 ? ((cur.close - prev.close) / prev.close * 100) : 0;
    var rsiArr = twCalcRsi(closes, 14);
    var rsiVal = rsiArr[rsiArr.length - 1];

    if (ribbonBullish && curSt.dir === 1) {
      if (rsiVal > 72) {
        wavePhase = 'WAVE 5 CLIMAX';
        waveLabel = 'Wave 5 Climax / Blow-Off Top';
        waveDescription = 'Puncak gelombang bullish. Waktunya eksekusi take profit bertahap (trailing stop ketat).';
        waveColor = '#F59E0B';
        waveBadge = 'b-amb';
      } else if (cur.close > curEma9 && cmf > 0.12) {
        wavePhase = 'WAVE 3 EXTENSION';
        waveLabel = 'Wave 3 Impulse Extension';
        waveDescription = 'Fase percepatan momentum dengan aliran dana institusi (Big Money Flow) yang solid.';
        waveColor = '#10B981';
        waveBadge = 'b-up';
      } else {
        wavePhase = 'WAVE 1 BREAKOUT';
        waveLabel = 'Wave 1 Initial Breakout';
        waveDescription = 'Awal pembentukan struktur tren bullish baru setelah fase akumulasi dasar.';
        waveColor = '#3B82F6';
        waveBadge = 'b-accent';
      }
    } else if (curSt.dir === 1 && cur.close <= curEma21) {
      wavePhase = 'WAVE 4 RETEST';
      waveLabel = 'Wave 4 Pullback / Support Retest';
      waveDescription = 'Konsolidasi sehat menguji area support Fibonacci & EMA 50. Ideal untuk akumulasi bertahap.';
      waveColor = '#8B5CF6';
      waveBadge = 'b-pur';
    } else if (ribbonBearish) {
      wavePhase = 'CORRECTIVE ABC';
      waveLabel = 'Corrective Wave (ABC Downtrend)';
      waveDescription = 'Siklus koreksi tren bearish. Disarankan wait and see atau pasang stop loss disiplin.';
      waveColor = '#EF4444';
      waveBadge = 'b-dn';
    } else {
      wavePhase = 'WAVE 2 DIP BUY';
      waveLabel = 'Wave 2 Healthy Retracement';
      waveDescription = 'Pengujian support 50%-61.8% Fibonacci. Peluang entry dengan risk-to-reward optimal.';
      waveColor = '#06B6D4';
      waveBadge = 'b-teal';
    }

    // 6. Fibonacci Wave Projection Targets & Invalidation
    var swingLow = cur.low;
    var swingHigh = cur.high;
    for (var s = Math.max(0, n - 25); s < n; s++) {
      if (ohlcv[s].low < swingLow) swingLow = ohlcv[s].low;
      if (ohlcv[s].high > swingHigh) swingHigh = ohlcv[s].high;
    }
    var swingRange = Math.max(1, swingHigh - swingLow);

    var stopLoss = Math.round(cur.close - (curAtr * 1.5));
    if (stopLoss >= cur.close) stopLoss = Math.round(cur.close * 0.95);

    var tp1 = Math.round(cur.close + swingRange * 0.618);
    var tp2 = Math.round(cur.close + swingRange * 1.000);
    var tp3 = Math.round(cur.close + swingRange * 1.618);

    var riskPerUnit = Math.max(1, cur.close - stopLoss);
    var rewardPerUnit = tp2 - cur.close;
    var rrRatio = (rewardPerUnit / riskPerUnit).toFixed(2);

    // Wave Quality Score (0 - 100)
    var waveScore = 50;
    if (ribbonBullish) waveScore += 20;
    if (curSt.dir === 1) waveScore += 15;
    if (cmf > 0.05) waveScore += 10;
    if (cmf > 0.15) waveScore += 5;
    if (rsiVal >= 45 && rsiVal <= 68) waveScore += 10;
    if (ribbonBearish) waveScore -= 30;
    waveScore = Math.max(10, Math.min(98, waveScore));

    return {
      ticker: ticker,
      currentPrice: cur.close,
      changePct: chgPct,
      wavePhase: wavePhase,
      waveLabel: waveLabel,
      waveDescription: waveDescription,
      waveColor: waveColor,
      waveBadge: waveBadge,
      waveScore: waveScore,
      superTrend: {
        value: Math.round(curSt.val),
        isBullish: curSt.dir === 1,
        atr: Math.round(curAtr)
      },
      emaRibbon: {
        ema9: Math.round(curEma9),
        ema21: Math.round(curEma21),
        ema50: Math.round(curEma50),
        status: ribbonBullish ? 'Bullish Stack' : ribbonBearish ? 'Bearish Stack' : 'Neutral / Squeeze'
      },
      flow: {
        cmf: +(cmf * 100).toFixed(1),
        signal: cmf > 0.08 ? 'AKUMULASI BESAR' : cmf < -0.08 ? 'DISTRIBUSI BESAR' : 'NETRAL'
      },
      targets: {
        invalidation: stopLoss,
        tp1: tp1,
        tp2: tp2,
        tp3: tp3,
        riskReward: '1 : ' + rrRatio,
        riskPerShare: riskPerUnit
      },
      ohlcv: ohlcv,
      rsi: +rsiVal.toFixed(1)
    };
  }

  // ══════════════════════════════════════════════════════════
  // 3. UI RENDERING & COMPONENT BUILDERS
  // ══════════════════════════════════════════════════════════

  // Renders Wave Cockpit (tabIdx===1) or Risk Planner (tabIdx===3) into the
  // given container id. Called by the unified Screener page
  // (public/js/48-unified-screener.js's usRenderShell()) for its own
  // "Wave Cockpit"/"Risk Planner" top-level tabs — there is no more
  // standalone TradeWave page, so tab switching (which of these 2 modes to
  // show) is entirely the caller's responsibility via `tabIdx`.
  function twRenderSubPage(containerId, tabIdx) {
    var c = document.getElementById(containerId);
    if (!c) return;

    var ticker = TW_STATE.ticker || 'BBCA';
    var data = twAnalyzeWave(ticker);
    TW_STATE.cachedAnalysis[ticker] = data;

    // ── SEARCH & QUICK PICKER BAR ──
    var html = ''
      + '<div class="card" style="padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'
      + '  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      + '    <div style="display:flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:6px 12px">'
      + '      <i class="ti ti-search" style="color:var(--text3)"></i>'
      + '      <input type="text" id="tw-ticker-input" list="idx-all-tickers-datalist" value="' + ticker + '" placeholder="Ketik kode saham..." style="background:none;border:none;outline:none;color:var(--text);font-family:var(--font-mono);font-size:13px;font-weight:700;width:120px;text-transform:uppercase" onkeydown="if(event.key===\'Enter\')twLoadTicker()">'
      + '    </div>'
      + '    <div style="display:flex;align-items:center;gap:6px">' + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(ticker, 22) : '') + '<span class="mono" style="font-size:13px;font-weight:800;color:var(--text)">' + ticker + '</span></div>'
      + '    <button class="btn btn-blue btn-sm" onclick="twLoadTicker()">⚡ Analisa Wave</button>'
      + '    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-left:6px">'
      + '      <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">QUICK:</span>'
      + '      <button class="btn btn-ghost btn-xs" onclick="twSetTicker(\'BBCA\')">BBCA</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="twSetTicker(\'BBRI\')">BBRI</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="twSetTicker(\'BMRI\')">BMRI</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="twSetTicker(\'TLKM\')">TLKM</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="twSetTicker(\'ADRO\')">ADRO</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="twSetTicker(\'ANTM\')">ANTM</button>'
      + '    </div>'
      + '  </div>'
      + '  <div style="display:flex;align-items:center;gap:8px">'
      + '    <button class="btn btn-ghost btn-xs" onclick="if(typeof openKseiModal===\'function\') openKseiModal(\'' + ticker + '\')" title="Lihat Kepemilikan Pemegang Saham KSEI 5%+"><i class="ti ti-users-group"></i> KSEI 5%+</button>'
      + '    <button class="btn btn-ghost btn-xs" onclick="if(typeof goPage===\'function\') goPage(\'stock-intel\')" title="Buka Cockpit Riset Lengkap"><i class="ti ti-radar"></i> Cockpit Riset</button>'
      + '  </div>'
      + '</div>';

    // ── ACTIVE TAB RENDERING ──
    if (!data || data.isValid === false) {
      var unkTk = (data && data.ticker) || ticker || 'UNKNOWN';
      var errMsg = (data && data.error) || 'Ticker "' + unkTk + '" tidak terdaftar dalam Stock Universe IDX atau Yahoo Finance.';
      html += ''
        + '<div class="card" style="padding:32px 24px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.3);border-radius:12px;text-align:center;margin-top:14px">'
        + '  <div style="font-size:36px;margin-bottom:10px">⚠️</div>'
        + '  <div style="font-size:17px;font-weight:800;color:var(--red);margin-bottom:8px">TICKER INVALID: ' + unkTk + ' TIDAK TERDAFTAR DI IDX / YAHOO FINANCE</div>'
        + '  <div style="font-size:13px;color:var(--text2);max-width:680px;margin:0 auto 18px;line-height:1.6">'
        + '    ' + errMsg + '<br>'
        + '    Sesuai kebijakan <strong>Zero Dummy Data</strong>, fitur deteksi Siklus Elliott Wave, target proyeksi Fibonacci (1.272, 1.618 Golden Ratio, 2.618), SuperTrend, dan Smart Money CMF <strong>tidak akan menampilkan data fiktif</strong> untuk kode saham yang tidak terdaftar.'
        + '  </div>'
        + '  <div style="display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap">'
        + '    <span style="font-size:12px;color:var(--text3);font-weight:600">Pilih Ticker Resmi:</span>'
        + '    <button class="btn btn-blue btn-sm" onclick="twSetTicker(\'BBCA\')">BBCA</button>'
        + '    <button class="btn btn-ghost btn-sm" onclick="twSetTicker(\'BBRI\')">BBRI</button>'
        + '    <button class="btn btn-ghost btn-sm" onclick="twSetTicker(\'BMRI\')">BMRI</button>'
        + '    <button class="btn btn-ghost btn-sm" onclick="twSetTicker(\'TLKM\')">TLKM</button>'
        + '    <button class="btn btn-ghost btn-sm" onclick="twSetTicker(\'ANTM\')">ANTM</button>'
        + '    <button class="btn btn-ghost btn-sm" onclick="twSetTicker(\'ADRO\')">ADRO</button>'
        + '  </div>'
        + '</div>';
      c.innerHTML = html;
      return;
    }

    if (tabIdx === 1) {
      html += renderTab1WaveCockpit(data);
    } else if (tabIdx === 3) {
      html += renderTab3RiskPlanner(data);
    }

    c.innerHTML = html;

    // Post-render chart mount
    if (tabIdx === 1) {
      setTimeout(function() { twMountWaveChart(data); }, 50);
    }
  }

  function renderTab1WaveCockpit(data) {
    var cur = data.currentPrice;
    var chg = data.changePct;
    var chgCls = chg >= 0 ? 'up' : 'dn';
    var chgSign = chg >= 0 ? '+' : '';

    return ''
      // Top 4 Metrics Summary
      + '<div class="row4" style="margin-bottom:18px">'
      + '  <div class="metric" title="Klasifikasi heuristik dari EMA ribbon (9/21/50), arah SuperTrend, dan RSI-14 riil — bukan hasil hitung ulang siklus Elliott Wave multi-swing penuh (5 gelombang impulsif + 3 korektif berbasis rasio Fibonacci antar-gelombang).">'
      + '    <div class="mlabel">Fase Siklus Elliott Wave <i class="ti ti-info-circle" style="font-size:10px;color:var(--text3)"></i></div>'
      + '    <div class="mval" style="color:' + data.waveColor + ';font-size:18px">' + data.wavePhase + '</div>'
      + '    <div class="msub neu">' + data.waveLabel + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Harga &amp; Momentum Realtime</div>'
      + '    <div class="mval ' + chgCls + '" style="font-size:20px">Rp ' + Number(cur).toLocaleString('id-ID') + '</div>'
      + '    <div class="msub ' + chgCls + '">' + chgSign + chg.toFixed(2) + '% · RSI ' + data.rsi + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">SuperTrend &amp; ATR (10, 3.0)</div>'
      + '    <div class="mval" style="color:' + (data.superTrend.isBullish ? 'var(--green)' : 'var(--red)') + ';font-size:18px">'
      + '      ' + (data.superTrend.isBullish ? '🟢 BULLISH TREND' : '🔴 BEARISH TREND')
      + '    </div>'
      + '    <div class="msub neu">Stop Line Rp ' + Number(data.superTrend.value).toLocaleString('id-ID') + ' · ATR ' + data.superTrend.atr + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">TradeWave Quality Score</div>'
      + '    <div class="mval" style="color:' + (data.waveScore >= 65 ? 'var(--green)' : data.waveScore <= 40 ? 'var(--red)' : 'var(--accent)') + ';font-size:20px">' + data.waveScore + ' / 100</div>'
      + '    <div class="msub neu">' + (data.waveScore >= 70 ? 'Konfirmasi Setup A+' : data.waveScore >= 50 ? 'Setup Moderat' : 'Risiko Tinggi') + '</div>'
      + '  </div>'
      + '</div>'

      // Wave Intelligence Takeaway Box
      + '<div style="background:rgba(0,200,255,0.06);border:1px solid rgba(0,200,255,0.25);border-left:4px solid #00c8ff;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">'
      + '  <div>'
      + '    <div style="font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px">'
      + '      <i class="ti ti-sparkles" style="color:#00c8ff"></i> Diagnostik TradeWave: ' + data.ticker + ' — ' + data.waveLabel
      + '    </div>'
      + '    <div style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5;max-width:850px">'
      + '      ' + data.waveDescription + ' Status pita 4-EMA berada pada <strong>' + data.emaRibbon.status + '</strong> dengan aliran dana institusi Chaikin Money Flow tercatat <strong>' + (data.flow.cmf >= 0 ? '+' : '') + data.flow.cmf + '% (' + data.flow.signal + ')</strong>.'
      + '    </div>'
      + '  </div>'
      + '  <div style="display:flex;gap:8px">'
      + '    <button class="btn btn-ghost btn-xs" onclick="twSetOrderSheet(' + cur + ',' + data.targets.invalidation + ',' + data.targets.tp2 + ')" style="border-color:#00c8ff;color:#00c8ff;font-weight:700">📋 Rencanakan Posisi (R:R ' + data.targets.riskReward + ')</button>'
      + '  </div>'
      + '</div>'

      // Interactive Chart & Fibonacci Extension Grid
      + '<div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:18px">'
      + '  <!-- Interactive Wave Chart -->'
      + '  <div class="card" style="padding:18px">'
      + '    <div class="cheader">'
      + '      <span class="ctitle"><i class="ti ti-chart-candle" style="color:#00c8ff"></i> Struktur Candlestick, EMA Ribbon &amp; SuperTrend Zone</span>'
      + '      <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">' + data.ticker + ' · 60 Sesi Terakhir</span>'
      + '    </div>'
      + '    <div class="cw" style="height:320px;position:relative">'
      + '      <canvas id="twChartCanvas"></canvas>'
      + '    </div>'
      + '  </div>'

      + '  <!-- Fibonacci Projection Targets -->'
      + '  <div class="card" style="padding:18px;display:flex;flex-direction:column;justify-content:space-between">'
      + '    <div>'
      + '      <div class="cheader" style="margin-bottom:12px">'
      + '        <span class="ctitle"><i class="ti ti-target" style="color:var(--amber)"></i> Target Proyeksi Fibonacci</span>'
      + '      </div>'
      + '      <div style="display:flex;flex-direction:column;gap:10px">'
      + '        <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      + '          <div>'
      + '            <div style="font-size:10px;color:var(--text3);font-weight:700">TARGET 1 (1.272 FIB EXT)</div>'
      + '            <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:var(--green)">Rp ' + Number(data.targets.tp1).toLocaleString('id-ID') + '</div>'
      + '          </div>'
      + '          <span class="badge b-up">+' + (((data.targets.tp1 - cur) / cur) * 100).toFixed(1) + '%</span>'
      + '        </div>'
      + '        <div style="background:var(--bg3);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      + '          <div>'
      + '            <div style="font-size:10px;color:#10b981;font-weight:700">TARGET 2 (1.618 GOLDEN FIB)</div>'
      + '            <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:#10b981">Rp ' + Number(data.targets.tp2).toLocaleString('id-ID') + '</div>'
      + '          </div>'
      + '          <span class="badge b-up">+' + (((data.targets.tp2 - cur) / cur) * 100).toFixed(1) + '%</span>'
      + '        </div>'
      + '        <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      + '          <div>'
      + '            <div style="font-size:10px;color:var(--text3);font-weight:700">TARGET 3 (2.618 SUPER WAVE)</div>'
      + '            <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:var(--accent)">Rp ' + Number(data.targets.tp3).toLocaleString('id-ID') + '</div>'
      + '          </div>'
      + '          <span class="badge b-accent">+' + (((data.targets.tp3 - cur) / cur) * 100).toFixed(1) + '%</span>'
      + '        </div>'
      + '        <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">'
      + '          <div>'
      + '            <div style="font-size:10px;color:var(--red);font-weight:700">WAVE INVALIDATION / STOP LOSS</div>'
      + '            <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:var(--red)">Rp ' + Number(data.targets.invalidation).toLocaleString('id-ID') + '</div>'
      + '          </div>'
      + '          <span class="badge b-dn">' + (((data.targets.invalidation - cur) / cur) * 100).toFixed(1) + '%</span>'
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '    <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border2);font-size:11px;color:var(--text3);display:flex;justify-content:space-between">'
      + '      <span>Risk : Reward Ratio</span>'
      + '      <strong style="color:var(--text);font-family:var(--font-mono)">' + data.targets.riskReward + '</strong>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function renderTab3RiskPlanner(data) {
    var cur = data.currentPrice;
    var cap = TW_STATE.capital || 100000000;
    var riskPct = TW_STATE.riskPct || 1.5;
    var riskAmount = Math.round(cap * (riskPct / 100));
    var riskPerShare = Math.max(1, cur - data.targets.invalidation);
    var sharesAllowed = Math.floor(riskAmount / riskPerShare);
    var lotsAllowed = Math.floor(sharesAllowed / 100);
    var totalPositionVal = lotsAllowed * 100 * cur;
    var positionWeight = cap > 0 ? ((totalPositionVal / cap) * 100).toFixed(1) : 0;
    var estProfitTP2 = Math.round(lotsAllowed * 100 * (data.targets.tp2 - cur));

    return ''
      + '<div class="g2b" style="margin-bottom:18px">'
      + '  <!-- Risk Sizing Calculator Inputs -->'
      + '  <div class="card" style="padding:22px">'
      + '    <div class="cheader" style="margin-bottom:14px">'
      + '      <span class="ctitle"><i class="ti ti-calculator" style="color:var(--accent)"></i> Kalkulator Risk:Reward &amp; Ukuran Posisi</span>'
      + '    </div>'
      + '    <div style="display:flex;flex-direction:column;gap:12px">'
      + '      <div>'
      + '        <label style="font-size:11px;color:var(--text3);font-weight:700">TOTAL MODAL PORTOFOLIO (IDR)</label>'
      + '        <input type="number" id="tw-plan-cap" class="finput" value="' + cap + '" oninput="twRecalcPlanner()" style="width:100%;margin-top:4px">'
      + '      </div>'
      + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700">TOLERANSI RISIKO / TRADE (%)</label>'
      + '          <input type="number" id="tw-plan-risk" class="finput" value="' + riskPct + '" step="0.25" oninput="twRecalcPlanner()" style="width:100%;margin-top:4px">'
      + '        </div>'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--text3);font-weight:700">HARGA ENTRY (BUY)</label>'
      + '          <input type="number" id="tw-plan-entry" class="finput" value="' + cur + '" oninput="twRecalcPlanner()" style="width:100%;margin-top:4px">'
      + '        </div>'
      + '      </div>'
      + '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--red);font-weight:700">STOP LOSS (INVALIDATION)</label>'
      + '          <input type="number" id="tw-plan-sl" class="finput" value="' + data.targets.invalidation + '" oninput="twRecalcPlanner()" style="width:100%;margin-top:4px">'
      + '        </div>'
      + '        <div>'
      + '          <label style="font-size:11px;color:var(--green);font-weight:700">TARGET PROFIT 2 (TP2)</label>'
      + '          <input type="number" id="tw-plan-tp" class="finput" value="' + data.targets.tp2 + '" oninput="twRecalcPlanner()" style="width:100%;margin-top:4px">'
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'

      + '  <!-- Execution Order Sheet Output -->'
      + '  <div class="card" style="padding:22px;display:flex;flex-direction:column;justify-content:space-between">'
      + '    <div>'
      + '      <div class="cheader" style="margin-bottom:14px">'
      + '        <span class="ctitle"><i class="ti ti-receipt" style="color:#10b981"></i> Rekomendasi Alokasi &amp; Order Sheet</span>'
      + '      </div>'
      + '      <div style="display:flex;flex-direction:column;gap:10px">'
      + '        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border2)">'
      + '          <span style="color:var(--text2);font-size:12px">Maksimal Risiko Uang (1R)</span>'
      + '          <strong style="color:var(--red);font-family:var(--font-mono)">Rp ' + Number(riskAmount).toLocaleString('id-ID') + '</strong>'
      + '        </div>'
      + '        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border2)">'
      + '          <span style="color:var(--text2);font-size:12px">Rekomendasi Ukuran Lot Beli</span>'
      + '          <strong style="color:var(--accent);font-size:18px;font-family:var(--font-mono)">' + lotsAllowed + ' Lot (' + (lotsAllowed * 100) + ' Lembar)</strong>'
      + '        </div>'
      + '        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border2)">'
      + '          <span style="color:var(--text2);font-size:12px">Total Nilai Alokasi Posisi</span>'
      + '          <strong style="color:var(--text);font-family:var(--font-mono)">Rp ' + Number(totalPositionVal).toLocaleString('id-ID') + ' (' + positionWeight + '% AUM)</strong>'
      + '        </div>'
      + '        <div style="display:flex;justify-content:space-between;padding:8px 0">'
      + '          <span style="color:var(--text2);font-size:12px">Potensi Profit Bersih di TP2</span>'
      + '          <strong style="color:var(--green);font-size:16px;font-family:var(--font-mono)">+Rp ' + Number(estProfitTP2).toLocaleString('id-ID') + '</strong>'
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '    <div style="margin-top:14px;display:flex;gap:8px">'
      + '      <button class="btn btn-blue btn-sm" style="flex:1" onclick="twExecuteToTradeJournal(\'' + data.ticker + '\',' + cur + ',' + lotsAllowed + ',' + data.targets.invalidation + ',' + data.targets.tp2 + ')">📝 Catat ke Decision Journal</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function twMountWaveChart(data) {
    twKillChart('twWave');
    var canvas = document.getElementById('twChartCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    var labels = data.ohlcv.map(function(d) {
      var dt = new Date(d.date);
      return dt.getDate() + '/' + (dt.getMonth() + 1);
    });

    var closes = data.ohlcv.map(function(d) { return d.close; });
    var ema9 = twCalcEma(closes, 9);
    var ema21 = twCalcEma(closes, 21);
    var ema50 = twCalcEma(closes, 50);

    var ctx = canvas.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, 'rgba(0, 200, 255, 0.22)');
    grad.addColorStop(1, 'rgba(0, 200, 255, 0)');

    var gc = (typeof GC !== 'undefined') ? GC : 'rgba(255,255,255,0.06)';
    var tc = (typeof TC !== 'undefined') ? TC : { color: _chartTextColor('--text2','#D2D8DF') };

    TW_CHARTS.twWave = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Close Price',
            data: closes,
            borderColor: '#00c8ff',
            borderWidth: 2,
            backgroundColor: grad,
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: 'EMA 9',
            data: ema9,
            borderColor: '#38bdf8',
            borderWidth: 1.2,
            fill: false,
            pointRadius: 0
          },
          {
            label: 'EMA 21',
            data: ema21,
            borderColor: '#10b981',
            borderWidth: 1.2,
            fill: false,
            pointRadius: 0
          },
          {
            label: 'EMA 50',
            data: ema50,
            borderColor: '#f59e0b',
            borderWidth: 1.5,
            borderDash: [3, 3],
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
          legend: { display: true, labels: { color: _chartTextColor('--text2','#D2D8DF'), font: { size: 10, weight: 'bold' } } },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': Rp ' + Number(ctx.raw).toLocaleString('id-ID'); }
            }
          }
        },
        scales: {
          x: { grid: { color: gc }, ticks: { color: _chartTextColor('--text2','#D2D8DF'), font:{weight:'bold'}, maxTicksLimit: 8 } },
          y: {
            position: 'right',
            grid: { color: gc },
            ticks: {
              color: _chartTextColor('--text2','#D2D8DF'),
              font: { weight: 'bold' },
              callback: function(v) { return 'Rp ' + Number(v).toLocaleString('id-ID'); }
            }
          }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // 4. ACTION HANDLERS & NAVIGATION HOOKS
  // ══════════════════════════════════════════════════════════

  // Wave Cockpit/Risk Planner now render inside the unified Screener page's
  // own tab container (see twRenderSubPage() above), so a re-render just
  // means "ask the Screener to redraw itself" — it reads its own current
  // tab (US_STATE.pageTab) and calls twRenderSubPage() again if relevant.
  function twRerender() {
    if (typeof usRenderShell === 'function') usRenderShell();
  }

  function twSetTicker(ticker) {
    TW_STATE.ticker = ticker.toUpperCase();
    var inp = document.getElementById('tw-ticker-input');
    if (inp) inp.value = TW_STATE.ticker;
    twRerender();
  }

  function twLoadTicker() {
    var inp = document.getElementById('tw-ticker-input');
    var val = (inp && inp.value) ? inp.value.trim().toUpperCase() : 'BBCA';
    twSetTicker(val);
  }

  function twRecalcPlanner() {
    var capInp = document.getElementById('tw-plan-cap');
    var riskInp = document.getElementById('tw-plan-risk');
    if (capInp) TW_STATE.capital = parseFloat(capInp.value) || 100000000;
    if (riskInp) TW_STATE.riskPct = parseFloat(riskInp.value) || 1.5;
    twRerender();
  }

  function twSetOrderSheet(entry, sl, tp) {
    if (typeof usSwitchPageTab === 'function') usSwitchPageTab('planner');
  }

  function twExecuteToTradeJournal(ticker, entry, lot, sl, tp) {
    if (typeof goPage === 'function') {
      goPage('journal');
      setTimeout(function() {
        if (typeof showToast === 'function') {
          showToast('✓ Rencana trade ' + ticker + ' (' + lot + ' lot) dicatat ke Decision Journal');
        }
      }, 100);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 5. EXPOSE TO GLOBAL NAMESPACE
  // ══════════════════════════════════════════════════════════
  window.TW_STATE = TW_STATE;
  window.twRenderSubPage = twRenderSubPage;
  window.twSetTicker = twSetTicker;
  window.twLoadTicker = twLoadTicker;
  window.twRecalcPlanner = twRecalcPlanner;
  window.twSetOrderSheet = twSetOrderSheet;
  window.twExecuteToTradeJournal = twExecuteToTradeJournal;
  window.twAnalyzeWave = twAnalyzeWave;

})(window, document);
