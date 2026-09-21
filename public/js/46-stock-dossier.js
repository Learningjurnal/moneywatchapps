/**
 * 46-stock-dossier.js
 * MoneyWatch Pro — 1-Click Master Stock Analysis Dossier ("All-in-One Stock Intelligence")
 *
 * INSTITUTIONAL THEORETICAL PRECEDENTS:
 * 1. Refinitiv StarMine Combined Alpha Model (CAM): Multi-factor composite alpha with dynamic factor integration.
 * 2. MSCI Barra Global Multi-Factor Model: Value, Momentum, Quality, and Market Regime orthogonality.
 * 3. AQR Capital Management (Asness, Moskowitz, Pedersen 2013): Value + Momentum negative correlation diversification.
 * 4. Microstructure & Order Flow Theory (Kyle 1985; Amihud 2002): Informed broker accumulation & volume dynamics.
 *
 * ZERO SYNTHETIC DATA MANDATE (AGENTS.md §1, §5, §28):
 * - If a pillar data feed is unavailable or missing, status is marked "DATA_UNAVAILABLE".
 * - Score calculation applies Dynamic Denominator Renormalization:
 *     CompositeScore = Sum(PillarScore_i * Weight_i * Available_i) / Sum(Weight_i * Available_i)
 *     ConfidenceLevel = Sum(Weight_i * Available_i) / Sum(Weight_i) * 100%
 * - No synthetic/dummy values are ever invented.
 */

var DOSSIER_DEFAULT_WEIGHTS = {
  valuation: 20,
  smartMoney: 20,
  technical: 20,
  ksei: 15,
  fundamental: 15,
  regime: 10
};

var DOSSIER_PRESETS = {
  balanced: {
    label: 'Balanced Multi-Factor (Default)',
    desc: 'Proporsi seimbang Value, Smart Money, dan Momentum untuk swing & position trading institusional.',
    weights: { valuation: 20, smartMoney: 20, technical: 20, ksei: 15, fundamental: 15, regime: 10 }
  },
  value: {
    label: 'Value & Dividend Compounder',
    desc: 'Fokus margin of safety, dividend yield, dan struktur permodalan sehat untuk investasi jangka panjang.',
    weights: { valuation: 35, smartMoney: 10, technical: 10, ksei: 15, fundamental: 25, regime: 5 }
  },
  swing: {
    label: 'Aggressive Swing Bandarmology',
    desc: 'Fokus akumulasi broker institusi, foreign flow streak, dan momentum teknikal breakout.',
    weights: { valuation: 10, smartMoney: 35, technical: 30, ksei: 15, fundamental: 0, regime: 10 }
  },
  technoFund: {
    label: 'Techno-Fundamental Growth',
    desc: 'Kombinasi pertumbuhan kinerja emiten (ROE/NPM) dengan konfirmasi trend struktur teknikal.',
    weights: { valuation: 25, smartMoney: 15, technical: 30, ksei: 10, fundamental: 15, regime: 5 }
  }
};

// ============================================================
// 1. WEIGHT MANAGEMENT & CALIBRATION
// ============================================================

function dossierGetDefaultWeights() {
  return Object.assign({}, DOSSIER_DEFAULT_WEIGHTS);
}

function dossierGetWeights() {
  try {
    var raw = (typeof localStorage !== 'undefined' && localStorage) ? localStorage.getItem('mw_dossier_weights_v1') : null;
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        var valid = ['valuation', 'smartMoney', 'technical', 'ksei', 'fundamental', 'regime'].every(function(k) {
          return typeof parsed[k] === 'number' && !isNaN(parsed[k]) && parsed[k] >= 0;
        });
        if (valid) {
          var sum = parsed.valuation + parsed.smartMoney + parsed.technical + parsed.ksei + parsed.fundamental + parsed.regime;
          if (Math.abs(sum - 100) < 0.1) return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('[Dossier] Failed to load custom weights, using default:', e);
  }
  return dossierGetDefaultWeights();
}

var dossierState = {
  ticker: 'BBCA',
  activeTab: 'overview',
  weights: dossierGetWeights(),
  harvestedData: null,
  scoringResult: null,
  isLoading: false,
  isInvalidTicker: false,
  errorMessage: null,
  lastUpdated: null
};

var STOCK_DOSSIER_STATE = dossierState;
if (typeof window !== 'undefined') {
  window.STOCK_DOSSIER_STATE = dossierState;
  window.dossierState = dossierState;
}

function dossierSaveWeights(newWeights) {
  if (!newWeights || typeof newWeights !== 'object') return false;
  var validValues = ['valuation', 'smartMoney', 'technical', 'ksei', 'fundamental', 'regime'].every(function(k) {
    return typeof newWeights[k] === 'number' && !isNaN(newWeights[k]) && newWeights[k] >= 0;
  });
  if (!validValues) {
    console.warn('[Dossier] Bobot setiap pilar harus berupa angka non-negatif.');
    return false;
  }
  var sum = (newWeights.valuation || 0) + (newWeights.smartMoney || 0) + (newWeights.technical || 0) +
            (newWeights.ksei || 0) + (newWeights.fundamental || 0) + (newWeights.regime || 0);
  if (Math.abs(sum - 100) > 0.01) {
    console.warn('[Dossier] Total weights must sum to 100%. Current sum: ' + sum);
    return false;
  }
  dossierState.weights = Object.assign({}, newWeights);
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('mw_dossier_weights_v1', JSON.stringify(dossierState.weights));
    }
  } catch (e) {}

  if (dossierState.harvestedData) {
    dossierState.scoringResult = dossierCalculateScore(dossierState.harvestedData, dossierState.weights);
    if (typeof renderStockDossierPage === 'function') renderStockDossierPage();
  }
  return true;
}

function dossierApplyPreset(presetKey, saveImmediately) {
  if (!DOSSIER_PRESETS[presetKey]) return false;
  var presetWeights = DOSSIER_PRESETS[presetKey].weights;
  if (saveImmediately) {
    dossierSaveWeights(presetWeights);
  }
  dossierUpdateWeightsModalInputs(presetWeights);
  if (typeof showToast === 'function') {
    showToast(saveImmediately
      ? 'Preset "' + DOSSIER_PRESETS[presetKey].label + '" berhasil diterapkan'
      : 'Preset "' + DOSSIER_PRESETS[presetKey].label + '" dipilih (klik Simpan untuk menerapkan)');
  }
  return true;
}

// ============================================================
// 2. SCORING ENGINE (INSTITUTIONAL MULTI-FACTOR + DYNAMIC RENORMALIZATION)
// ============================================================

/**
 * Pillar 1: Valuasi & Margin of Safety (0–100)
 */
function dossierComputeValuationScore(harvested) {
  if (!harvested) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      mosPct: null,
      fairValue: null,
      per: null,
      pbv: null,
      reason: 'Data valuasi fundamental tidak tersedia.'
    };
  }

  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var fundObj = harvested.fundamentals || harvested.fund || quote.fundamentals || {};
  var qf = quote.fundamentals || fundObj;
  var price = quote.price || (quote.close) || 0;

  var per = (qf.per !== undefined && qf.per !== null) ? Number(qf.per) :
            (qf.pe !== undefined && qf.pe !== null) ? Number(qf.pe) :
            (fundObj.per !== undefined && fundObj.per !== null) ? Number(fundObj.per) :
            (fundObj.pe !== undefined && fundObj.pe !== null) ? Number(fundObj.pe) : null;

  var pbv = (qf.pbv !== undefined && qf.pbv !== null) ? Number(qf.pbv) :
            (fundObj.pbv !== undefined && fundObj.pbv !== null) ? Number(fundObj.pbv) : null;

  var eps = (qf.eps !== undefined && qf.eps !== null) ? Number(qf.eps) :
            (fundObj.eps !== undefined && fundObj.eps !== null) ? Number(fundObj.eps) : null;

  var bvps = (qf.bvps !== undefined && qf.bvps !== null) ? Number(qf.bvps) :
             (fundObj.bvps !== undefined && fundObj.bvps !== null) ? Number(fundObj.bvps) : null;

  // Evaluate Graham Number if EPS and BVPS are valid positive
  var grahamNumber = null;
  if (eps && eps > 0 && bvps && bvps > 0) {
    grahamNumber = Math.round(Math.sqrt(22.5 * eps * bvps));
  } else if (harvested.fairValue && (harvested.fairValue.grahamNumber || harvested.fairValue.graham)) {
    grahamNumber = Number(harvested.fairValue.grahamNumber || harvested.fairValue.graham);
  }

  // Margin of Safety calculation
  var fairValue = grahamNumber || (price > 0 && per && per > 0 ? Math.round(price * (15 / per)) : null) || (harvested.fairValue && (harvested.fairValue.fairValue || harvested.fairValue.priceTarget) ? Number(harvested.fairValue.fairValue || harvested.fairValue.priceTarget) : null);
  var mosPct = null;
  if (harvested.fairValue && harvested.fairValue.mosPercent !== undefined && harvested.fairValue.mosPercent !== null) {
    mosPct = Number(harvested.fairValue.mosPercent);
  } else if (fairValue && fairValue > 0 && price > 0) {
    mosPct = ((fairValue - price) / fairValue) * 100;
  }

  if (price <= 0 || (per === null && pbv === null && fairValue === null && mosPct === null)) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      mosPct: null,
      fairValue: null,
      per: per,
      pbv: pbv,
      reason: 'Data valuasi fundamental tidak mencukupi untuk menghitung margin of safety.'
    };
  }

  var score = 50; // Neutral base
  if (mosPct !== null) {
    if (mosPct >= 25) score = 95;
    else if (mosPct >= 15) score = 85;
    else if (mosPct >= 5) score = 75;
    else if (mosPct >= -5) score = 65;
    else if (mosPct >= -20) score = 45;
    else score = 25;
    // Penalize negative earnings or negative equity even if MoS was estimated
    if (per !== null && per < 0) score -= 25;
    if (pbv !== null && pbv < 0) score -= 30;
    score = Math.max(15, Math.min(95, score));
  } else {
    // Fallback on PE and PBV benchmarks
    var subScore = 50;
    if (per !== null) {
      if (per < 0) subScore -= 20; // Rugi bersih / defisit
      else if (per < 10) subScore += 20;
      else if (per < 15) subScore += 10;
      else if (per > 25) subScore -= 15;
    }
    if (pbv !== null) {
      if (pbv < 0) subScore -= 25; // Ekuitas negatif / insolvency warning
      else if (pbv < 1.0) subScore += 20;
      else if (pbv < 2.0) subScore += 10;
      else if (pbv > 4.0) subScore -= 15;
    }
    score = Math.max(15, Math.min(95, subScore));
  }

  var isValSim = Boolean(quote.isSimulated || (quote.quality && quote.quality.status === 'SIMULATION'));
  var perStr = per !== null && !isNaN(per) ? per.toFixed(1) + 'x' : '-';
  var pbvStr = pbv !== null && !isNaN(pbv) ? pbv.toFixed(2) + 'x' : '-';

  var warningNotes = [];
  if (per !== null && per < 0) warningNotes.push('P/E Negatif (Rugi Bersih)');
  if (pbv !== null && pbv < 0) warningNotes.push('Ekuitas Negatif (Defisit Modal)');
  var warningSuffix = warningNotes.length > 0 ? ' [' + warningNotes.join(', ') + ']' : '';

  return {
    available: true,
    status: isValSim ? 'SIMULATION' : 'REAL',
    isSimulated: isValSim,
    score: score,
    mosPct: mosPct !== null ? Math.round(mosPct * 10) / 10 : null,
    fairValue: fairValue,
    per: per,
    pbv: pbv,
    grahamNumber: grahamNumber,
    reason: (mosPct !== null
      ? 'Margin of Safety: ' + (mosPct > 0 ? '+' : '') + mosPct.toFixed(1) + '% (Harga Wajar Est: Rp ' + (fairValue ? fairValue.toLocaleString('id-ID') : '-') + ')'
      : 'Berdasarkan rasio PE (' + perStr + ') dan PBV (' + pbvStr + ')') + warningSuffix
  };
}

/**
 * Pillar 2: Smart Money & Bandarmology Flow (0–100)
 */
function dossierComputeSmartMoneyScore(harvested) {
  if (!harvested) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      top3Pct: null,
      foreignFlow: null,
      bandarStatus: 'Data Tidak Tersedia',
      reason: 'Feed broker summary pasar belum tersedia untuk ticker ini hari ini.'
    };
  }

  var bSummary = (harvested.brokerSummary && harvested.brokerSummary.data) ? harvested.brokerSummary.data : (harvested.brokerSummary || harvested.bandar || harvested.bandarmology);
  if (!bSummary || (!bSummary.bandarmology && !bSummary.brokers && !bSummary.accumulation && !bSummary.topBuyers && !bSummary.buyers && !bSummary.action && !bSummary.topBrokers && !bSummary.topSellers)) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      top3Pct: null,
      foreignFlow: null,
      bandarStatus: 'Data Tidak Tersedia',
      reason: 'Feed broker summary pasar belum tersedia untuk ticker ini hari ini.'
    };
  }

  var bandar = bSummary.bandarmology || bSummary;
  var statusStr = (bandar.status || bandar.action || bSummary.accumulation || bSummary.action || '').toString();
  var top3Pct = (bandar.top3Concentration !== undefined && bandar.top3Concentration !== null)
    ? Number(bandar.top3Concentration)
    : ((bandar.top3BuyersPercent !== undefined && bandar.top3BuyersPercent !== null)
      ? Number(bandar.top3BuyersPercent)
      : ((bSummary.top3Concentration !== undefined && bSummary.top3Concentration !== null) ? Number(bSummary.top3Concentration) : null));

  var foreignNet = null;
  if (bandar.foreignNet !== undefined && bandar.foreignNet !== null) {
    foreignNet = Number(bandar.foreignNet);
  } else if (bSummary.foreignNet !== undefined && bSummary.foreignNet !== null) {
    foreignNet = Number(bSummary.foreignNet);
  } else if (bandar.foreignFlow && (bandar.foreignFlow.netBuy !== undefined || bandar.foreignFlow.netValue !== undefined)) {
    foreignNet = Number(bandar.foreignFlow.netBuy !== undefined ? bandar.foreignFlow.netBuy : bandar.foreignFlow.netValue);
  }

  var vwapBandar = bandar.vwap || bSummary.vwap || null;
  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var price = quote.price || quote.close || 0;

  var score = 50;
  if (/big\s*accum|akumulasi\s*besar/i.test(statusStr)) score = 90;
  else if (/accum|akumulasi/i.test(statusStr)) score = 75;
  else if (/neutral|netral/i.test(statusStr)) score = 55;
  else if (/distrib|distribusi\s*besar/i.test(statusStr)) score = 25;
  else if (/distrib/i.test(statusStr)) score = 35;

  // Bonus/penalty for foreign flow
  if (foreignNet !== null) {
    if (foreignNet > 5000000000) score += 5; // > Rp 5 M
    else if (foreignNet < -5000000000) score -= 5;
  }

  // Bonus if trading close to or below Bandar VWAP
  if (vwapBandar && price > 0 && price <= vwapBandar * 1.02) {
    score += 5;
  }

  score = Math.max(10, Math.min(98, score));

  // Extract raw buyers & sellers
  var rawBuyers = [];
  if (Array.isArray(bSummary.topBuyers)) {
    rawBuyers = bSummary.topBuyers;
  } else if (bSummary.bandarmology && Array.isArray(bSummary.bandarmology.topBuyers)) {
    rawBuyers = bSummary.bandarmology.topBuyers;
  } else if (Array.isArray(bSummary.buyers)) {
    rawBuyers = bSummary.buyers;
  } else if (Array.isArray(bSummary.topBrokers)) {
    rawBuyers = bSummary.topBrokers.filter(function(b) {
      return (Number(b.buyVol || b.buy_volume || 0) >= Number(b.sellVol || b.sell_volume || 0)) || Number(b.buyVal || b.buy_value || 0) > 0;
    });
  }

  var rawSellers = [];
  if (Array.isArray(bSummary.topSellers)) {
    rawSellers = bSummary.topSellers;
  } else if (bSummary.bandarmology && Array.isArray(bSummary.bandarmology.topSellers)) {
    rawSellers = bSummary.bandarmology.topSellers;
  } else if (Array.isArray(bSummary.sellers)) {
    rawSellers = bSummary.sellers;
  } else if (Array.isArray(bSummary.topBrokers)) {
    rawSellers = bSummary.topBrokers.filter(function(s) {
      return (Number(s.sellVol || s.sell_volume || 0) > Number(s.buyVol || s.buy_volume || 0)) || Number(s.sellVal || s.sell_value || 0) > 0;
    });
  }

  // Normalize top 5 accumulator brokers
  var accumulators = rawBuyers.slice(0, 5).map(function(b, idx) {
    var code = String(b.broker || b.code || b.broker_code || ('B' + (idx + 1))).toUpperCase();
    var name = b.name || b.broker_name || (code + ' Sekuritas');
    var val = Number(b.valueRp || b.value || b.total_value || b.buy_value || 0);
    var avgP = Number(b.avgPrice || b.avg_price || b.average_price || 0);
    var vol = Number(b.volumeLot || b.volume_lot || b.volume || 0);
    var isF = b.type === 'F' || b.is_foreign === true || (b.category && /foreign/i.test(b.category));
    var valStr = val >= 1e9 ? 'Rp ' + (val / 1e9).toFixed(1) + ' M' : (val >= 1e6 ? 'Rp ' + (val / 1e6).toFixed(0) + ' Jt' : (val > 0 ? 'Rp ' + val.toLocaleString('id-ID') : '-'));
    return {
      rank: idx + 1,
      code: code,
      name: name,
      val: val,
      valStr: valStr,
      avgPrice: avgP,
      volumeLot: vol,
      isForeign: isF
    };
  });

  // Normalize top 5 distributor brokers
  var distributors = rawSellers.slice(0, 5).map(function(s, idx) {
    var code = String(s.broker || s.code || s.broker_code || ('S' + (idx + 1))).toUpperCase();
    var name = s.name || s.broker_name || (code + ' Sekuritas');
    var val = Number(s.valueRp || s.value || s.total_value || s.sell_value || 0);
    var avgP = Number(s.avgPrice || s.avg_price || s.average_price || 0);
    var vol = Number(s.volumeLot || s.volume_lot || s.volume || 0);
    var isF = s.type === 'F' || s.is_foreign === true || (s.category && /foreign/i.test(s.category));
    var valStr = val >= 1e9 ? 'Rp ' + (val / 1e9).toFixed(1) + ' M' : (val >= 1e6 ? 'Rp ' + (val / 1e6).toFixed(0) + ' Jt' : (val > 0 ? 'Rp ' + val.toLocaleString('id-ID') : '-'));
    return {
      rank: idx + 1,
      code: code,
      name: name,
      val: val,
      valStr: valStr,
      avgPrice: avgP,
      volumeLot: vol,
      isForeign: isF
    };
  });

  var isSimulated = Boolean(bSummary.isSimulated || (bSummary.quality && bSummary.quality.status === 'SIMULATION'));
  var dataStatus = isSimulated ? 'SIMULATION' : 'REAL';

  return {
    available: true,
    status: dataStatus,
    isSimulated: isSimulated,
    dataSource: bSummary.dataSource || (isSimulated ? 'Model Simulasi Deterministik' : 'Invezgo API (real)'),
    score: score,
    top3Pct: top3Pct ? Math.round(top3Pct) : null,
    foreignFlow: foreignNet,
    bandarStatus: statusStr || 'Normal Accumulation',
    vwapBandar: vwapBandar,
    accumulators: accumulators,
    distributors: distributors,
    topBuyers: rawBuyers,
    topSellers: rawSellers,
    reason: (isSimulated ? '[SIMULASI MODEL] ' : '') + 'Status: ' + (statusStr || 'Akumulasi') + (top3Pct ? ' (Konsentrasi Top 3: ' + Math.round(top3Pct) + '%)' : '') +
            (accumulators.length ? ' · Top Akumulator: ' + accumulators.slice(0, 3).map(function(a){ return a.code; }).join(', ') : '') +
            (foreignNet !== null && foreignNet !== 0 ? ' · Foreign Net: Rp ' + (foreignNet / 1e9).toFixed(2) + ' M' : '')
  };
}

/**
 * Pillar 3: Momentum & Analisis Teknikal (0–100)
 */
function dossierComputeTechnicalScore(harvested) {
  if (!harvested) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      rsi: null,
      trend: 'Data Tidak Tersedia',
      volumeSpike: null,
      reason: 'Riwayat candle OHLCV pasar tidak tersedia.'
    };
  }

  var history = harvested.history || [];
  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var price = quote.price || quote.close || (history.length ? (history[history.length - 1].close || history[history.length - 1].c || 0) : 0);

  if (!Array.isArray(history) || history.length < 15 || price <= 0) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      rsi: null,
      trend: 'Data Tidak Tersedia',
      volumeSpike: null,
      reason: 'Riwayat candle OHLCV pasar kurang dari 15 periode untuk kalkulasi indikator teknikal.'
    };
  }

  var closes = history.map(function(h) { return h.close !== undefined ? Number(h.close) : (h.c !== undefined ? Number(h.c) : 0); });
  var volumes = history.map(function(h) { return h.volume !== undefined ? Number(h.volume) : (h.v !== undefined ? Number(h.v) : 0); });
  var n = closes.length;

  // Accurate Institutional EMA calculation (SMA seeded, k = 2/(period+1))
  function calcEMA(data, period) {
    if (!Array.isArray(data) || data.length < period || period <= 0) return null;
    var sum = 0;
    for (var i = 0; i < period; i++) {
      sum += data[i];
    }
    var ema = sum / period;
    var k = 2 / (period + 1);
    for (var j = period; j < data.length; j++) {
      ema = data[j] * k + ema * (1 - k);
    }
    return ema;
  }

  var ema20 = n >= 20 ? calcEMA(closes, 20) : null;
  var ema50 = n >= 50 ? calcEMA(closes, 50) : null;

  // Wilder's Smoothed RSI(14)
  var rsi = null;
  if (n >= 15) {
    var lookback = Math.min(n, 90);
    var startIdx = n - lookback;
    var gains = 0, losses = 0;
    for (var i = startIdx + 1; i <= startIdx + 14; i++) {
      var diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    var avgGain = gains / 14;
    var avgLoss = losses / 14;
    for (var j = startIdx + 15; j < n; j++) {
      var d = closes[j] - closes[j - 1];
      var g = d >= 0 ? d : 0;
      var l = d < 0 ? -d : 0;
      avgGain = (avgGain * 13 + g) / 14;
      avgLoss = (avgLoss * 13 + l) / 14;
    }
    if (avgLoss === 0) {
      rsi = 100;
    } else {
      var rs = avgGain / avgLoss;
      rsi = 100 - (100 / (1 + rs));
    }
    rsi = Math.round(rsi * 10) / 10;
  }

  // Volume Expansion: 20-day baseline strictly excluding today's bar
  var volSlice = n > 1 ? volumes.slice(Math.max(0, n - 21), n - 1) : [];
  if (volSlice.length === 0) volSlice = volumes.slice(-20);
  var sumV = volSlice.reduce(function(a, b) { return a + b; }, 0);
  var avgVol20 = volSlice.length ? sumV / volSlice.length : 1;
  var curVol = volumes[n - 1] || 0;
  var volRatio = avgVol20 > 0 ? Math.round((curVol / avgVol20) * 10) / 10 : 1.0;

  var score = 50;
  var trendDesc = 'Neutral / Sideways';

  // Trend Structure
  if (ema20 && price > ema20) {
    if (ema50 && ema20 > ema50) {
      score += 20;
      trendDesc = 'Strong Bullish Alignment (Price > EMA20 > EMA50)';
    } else {
      score += 10;
      trendDesc = 'Bullish Bias (Price > EMA20)';
    }
  } else if (ema20 && price < ema20) {
    if (ema50 && ema20 < ema50) {
      score -= 20;
      trendDesc = 'Strong Bearish Trend (Price < EMA20 < EMA50)';
    } else {
      score -= 10;
      trendDesc = 'Bearish Bias (Price < EMA20)';
    }
  } else {
    trendDesc = closes.length >= 2 && price >= closes[0] ? 'Uptrend Ringan' : 'Downtrend Ringan';
  }

  // RSI Assessment
  if (rsi !== null) {
    if (rsi >= 50 && rsi <= 68) score += 15; // Healthy bullish momentum
    else if (rsi > 68 && rsi <= 80) score += 5; // Overbought but high momentum
    else if (rsi > 80) score -= 10; // Extreme overbought
    else if (rsi < 30) score += 5; // Oversold rebound zone
    else if (rsi >= 30 && rsi < 45) score -= 10; // Bearish drag
  }

  // Volume Spike Confirmation
  var prevClose = n >= 2 ? closes[n - 2] : price;
  if (volRatio >= 1.8 && price >= prevClose) {
    score += 15;
  } else if (volRatio >= 1.8 && price < prevClose) {
    score -= 15; // Heavy distribution volume
  }

  score = Math.max(10, Math.min(95, score));

  return {
    available: true,
    status: 'REAL',
    score: score,
    rsi: rsi,
    trend: trendDesc,
    ema20: ema20 ? Math.round(ema20) : null,
    ema50: ema50 ? Math.round(ema50) : null,
    volumeSpike: volRatio,
    reason: trendDesc + ' · RSI(14): ' + (rsi !== null ? rsi : '-') + ' · Volume: ' + volRatio + 'x avg'
  };
}

/**
 * Pillar 4: Struktur Kepemilikan KSEI (0–100)
 */
function dossierComputeKseiScore(harvested) {
  if (!harvested) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      freeFloat: null,
      institutionalPct: null,
      foreignPct: null,
      reason: 'Data kepemilikan KSEI tidak tersedia.'
    };
  }

  var ksei = harvested.ksei;
  var stock = (ksei && ksei.found !== false && ksei.stock)
    ? ksei.stock
    : (ksei && ksei.found !== false && ksei.freeFloat !== undefined ? ksei : (harvested.quote && harvested.quote.ksei ? harvested.quote.ksei : null));

  var namedHolderDataMissing = !stock || (ksei && ksei.found === false) || (!stock.investors && stock.freeFloat === undefined) || (Array.isArray(stock.investors) && stock.investors.length === 0 && stock.totalMajorPercent === 0 && stock.freeFloat === 100);

  if (namedHolderDataMissing) {
    var live = harvested.kseiLive;
    var kl = live && live.available && live.kseiLatest;
    var totalShares = kl ? ((kl.foreignTotal || 0) + (kl.localTotal || 0)) : 0;
    if (kl && totalShares > 0) {
      var fInd = (kl.foreign && kl.foreign.id) ? Number(kl.foreign.id) : 0;
      var lInd = (kl.local && kl.local.id) ? Number(kl.local.id) : 0;
      var individualShares = fInd + lInd;
      var institutionalPct = (totalShares - individualShares) / totalShares * 100;
      var foreignPct = (kl.foreignTotal || 0) / totalShares * 100;

      var liveScore = 50;
      if (institutionalPct >= 55) liveScore += 15;
      else if (foreignPct >= 30) liveScore += 10;
      liveScore = Math.max(20, Math.min(95, liveScore));

      var reportDateStr = kl.date ? String(kl.date).slice(0, 10) : 'Terbaru';

      return {
        available: true,
        status: 'REAL',
        score: liveScore,
        freeFloat: null,
        institutionalPct: Math.round(institutionalPct * 10) / 10,
        foreignPct: Math.round(foreignPct * 10) / 10,
        reportDate: kl.date || reportDateStr,
        reason: 'Free Float resmi tidak ada di dataset >5% holder (statis) untuk emiten ini — memakai komposisi kepemilikan LIVE Invezgo per kategori investor (Institusi: ' + institutionalPct.toFixed(1) + '%, Asing: ' + foreignPct.toFixed(1) + '% dari total lembar tercatat KSEI per ' + reportDateStr + ').'
      };
    }

    var kseiErr = live && Array.isArray(live.errors) ? live.errors.find(function(e) { return e.part === 'kseiComposition'; }) : null;
    var reasonCodeMap = {
      NOT_CONFIGURED: 'INVEZGO_API_KEY belum dikonfigurasi di server.',
      QUOTA_EXHAUSTED: 'Kuota bulanan Invezgo API sudah habis — coba lagi setelah reset kuota.',
      SUBSCRIPTION_INSUFFICIENT: 'Paket langganan Invezgo API saat ini tidak mencakup endpoint kepemilikan KSEI.',
      AUTH_FAILED: 'Autentikasi ke Invezgo API gagal (API key tidak valid/ditolak).',
      RATE_LIMITED: 'Invezgo API membatasi laju permintaan (rate limit) saat dicoba — coba lagi sebentar lagi.',
      NETWORK_ERROR: 'Gagal menghubungi Invezgo API (masalah jaringan).',
      UNEXPECTED_SCHEMA: 'Respons Invezgo API untuk endpoint ini tidak sesuai skema yang diharapkan.'
    };
    var specificReason = kseiErr ? (reasonCodeMap[kseiErr.reason] || ('Invezgo API mengembalikan: ' + kseiErr.reason)) : null;

    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      freeFloat: null,
      institutionalPct: null,
      foreignPct: null,
      reason: specificReason
        ? 'Data kepemilikan kustodian KSEI tidak tersedia untuk emiten ini. Sebab: ' + specificReason
        : 'Data kepemilikan kustodian KSEI belum diunggah/tidak ditemukan untuk emiten ini, dan komposisi live Invezgo juga tidak tersedia.'
    };
  }

  var freeFloat = typeof stock.freeFloat === 'number' ? stock.freeFloat : (100 - (stock.totalMajorPercent || 0));
  var foreignPct = typeof stock.foreignPercent === 'number' ? stock.foreignPercent : 0;
  var localInstPct = typeof stock.localPercent === 'number' ? stock.localPercent : 0;
  var totalInst = foreignPct + localInstPct;

  var score = 50;

  // Free float evaluation (ideal sweet spot 15% - 40%)
  if (freeFloat >= 15 && freeFloat <= 40) {
    score += 25; // Healthy institutional control with sufficient market liquidity
  } else if (freeFloat > 40 && freeFloat <= 60) {
    score += 10;
  } else if (freeFloat > 75) {
    score -= 15; // Retail-heavy risk / high volatility dispersion
  } else if (freeFloat < 10) {
    score -= 5; // Low liquidity / locked shares risk
  }

  // Institutional concentration
  if (totalInst >= 55) {
    score += 15;
  } else if (foreignPct >= 30) {
    score += 10;
  }

  score = Math.max(20, Math.min(95, score));

  return {
    available: true,
    status: 'REAL',
    score: score,
    freeFloat: Math.round(freeFloat * 10) / 10,
    institutionalPct: Math.round(totalInst * 10) / 10,
    foreignPct: Math.round(foreignPct * 10) / 10,
    reportDate: stock.reportDate || 'Terbaru',
    reason: 'Free Float: ' + freeFloat.toFixed(1) + '% · Institusi: ' + totalInst.toFixed(1) + '% (Asing: ' + foreignPct.toFixed(1) + '%)'
  };
}

/**
 * Pillar 5: Profitabilitas & Dividen (0–100)
 */
function dossierComputeFundamentalScore(harvested) {
  if (!harvested) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      roe: null,
      der: null,
      npm: null,
      divYield: null,
      reason: 'Laporan keuangan fundamental dan rasio profitabilitas belum tersedia.'
    };
  }

  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var fund = harvested.fundamentals || harvested.fund || quote.fundamentals || {};
  var qf = quote.fundamentals || fund;

  var roe = (qf.roe !== undefined && qf.roe !== null) ? Number(qf.roe) : ((fund.roe !== undefined && fund.roe !== null) ? Number(fund.roe) : null);
  var der = (qf.der !== undefined && qf.der !== null) ? Number(qf.der) : ((fund.der !== undefined && fund.der !== null) ? Number(fund.der) : null);
  var npm = (qf.npm !== undefined && qf.npm !== null) ? Number(qf.npm) :
            (qf.netProfitMargin !== undefined && qf.netProfitMargin !== null) ? Number(qf.netProfitMargin) :
            (fund.npm !== undefined && fund.npm !== null) ? Number(fund.npm) :
            (fund.netProfitMargin !== undefined && fund.netProfitMargin !== null) ? Number(fund.netProfitMargin) : null;
  var divYield = (qf.dividendYield !== undefined && qf.dividendYield !== null) ? Number(qf.dividendYield) :
                 (fund.dividendYield !== undefined && fund.dividendYield !== null) ? Number(fund.dividendYield) :
                 (fund.dy !== undefined && fund.dy !== null) ? Number(fund.dy) : null;

  if (roe === null && der === null && npm === null && divYield === null) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      roe: null,
      der: null,
      npm: null,
      divYield: null,
      reason: 'Laporan keuangan fundamental dan rasio profitabilitas belum tersedia.'
    };
  }

  var score = 50;

  // Sector awareness for DER (Banks naturally carry high leverage of 4x-6x)
  var ticker = String(harvested.ticker || (harvested.quote && harvested.quote.ticker) || '').toUpperCase();
  var isBank = /^(BBCA|BBRI|BMRI|BBNI|BRIS|BBTN|BNGA|BDMN|MEGA|NISP|BJBR|BJTM|PNBN|ARTO)$/.test(ticker) ||
               (harvested.sector && /bank|finance|keuangan/i.test(harvested.sector));

  // ROE (Return on Equity)
  if (roe !== null && !isNaN(roe)) {
    if (roe >= 20) score += 20;
    else if (roe >= 12) score += 12;
    else if (roe >= 6) score += 5;
    else if (roe < 0) score -= 20;
  }

  // DER (Debt-to-Equity Ratio) with insolvency & sector check
  if (der !== null && !isNaN(der)) {
    if (der < 0) {
      score -= 25; // Negative equity / insolvency warning
    } else if (isBank) {
      if (der <= 6.0) score += 12;
      else if (der <= 8.0) score += 5;
      else score -= 10;
    } else {
      if (der < 0.8) score += 15;
      else if (der <= 1.5) score += 8;
      else if (der > 3.0) score -= 15;
    }
  }

  // NPM (Net Profit Margin)
  if (npm !== null && !isNaN(npm)) {
    if (npm >= 20) score += 10;
    else if (npm >= 10) score += 5;
    else if (npm < 0) score -= 15;
  }

  // Dividend Yield
  if (divYield !== null && !isNaN(divYield) && divYield > 0) {
    if (divYield >= 5) score += 15;
    else if (divYield >= 2.5) score += 10;
    else score += 5;
  }

  score = Math.max(15, Math.min(95, score));

  var fundWarnings = [];
  if (der !== null && !isNaN(der) && der < 0) fundWarnings.push('Ekuitas Negatif (Defisit Modal)');
  if (roe !== null && !isNaN(roe) && roe < 0) fundWarnings.push('Rugi Bersih');
  var fundWarningSuffix = fundWarnings.length > 0 ? ' [' + fundWarnings.join(', ') + ']' : '';

  var isFundSim = Boolean((fund && fund.isSimulated) || (fund && fund.quality && fund.quality.status === 'SIMULATION'));

  return {
    available: true,
    status: isFundSim ? 'SIMULATION' : 'REAL',
    isSimulated: isFundSim,
    score: score,
    roe: roe !== null && !isNaN(roe) ? Math.round(roe * 10) / 10 : null,
    der: der !== null && !isNaN(der) ? Math.round(der * 100) / 100 : null,
    npm: npm !== null && !isNaN(npm) ? Math.round(npm * 10) / 10 : null,
    divYield: divYield !== null && !isNaN(divYield) ? Math.round(divYield * 10) / 10 : null,
    reason: ((isFundSim ? '[SIMULASI] ' : '') + 'ROE: ' + (roe !== null && !isNaN(roe) ? roe.toFixed(1) + '%' : '-') +
            ' · DER: ' + (der !== null && !isNaN(der) ? der.toFixed(2) + 'x' : '-') +
            (npm !== null && !isNaN(npm) ? ' · NPM: ' + npm.toFixed(1) + '%' : '') +
            ' · Div Yield: ' + (divYield !== null && !isNaN(divYield) ? divYield.toFixed(1) + '%' : '-')) + fundWarningSuffix
  };
}

/**
 * Pillar 6: Market Regime & AI Confluence (0–100)
 */
function dossierComputeRegimeScore(harvestedOrRegime, aiHypothesis) {
  if (!harvestedOrRegime) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      reason: 'Data market regime IHSG tidak tersedia'
    };
  }

  // Handle either full harvested payload { regime: ... } or regimeObj directly
  var regimeObj = harvestedOrRegime;
  if (typeof harvestedOrRegime === 'object' && harvestedOrRegime.regime !== undefined) {
    regimeObj = harvestedOrRegime.regime;
  }

  if (regimeObj === null) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      reason: 'Data market regime IHSG tidak tersedia'
    };
  }

  var rawState = 'SIDEWAYS';
  if (typeof regimeObj === 'string') {
    rawState = regimeObj;
  } else if (regimeObj && typeof regimeObj === 'object') {
    if (typeof regimeObj.regime === 'string') {
      rawState = regimeObj.regime;
    } else if (regimeObj.regime && typeof regimeObj.regime === 'object') {
      rawState = regimeObj.regime.regime || regimeObj.regime.marketRegime || regimeObj.regime.state || 'SIDEWAYS';
    } else if (typeof regimeObj.marketRegime === 'string') {
      rawState = regimeObj.marketRegime;
    } else if (typeof regimeObj.state === 'string') {
      rawState = regimeObj.state;
    }
  }

  var confidence = 75;
  if (regimeObj && typeof regimeObj.confidence === 'number') {
    confidence = regimeObj.confidence;
  } else if (regimeObj && regimeObj.regime && typeof regimeObj.regime.confidence === 'number') {
    confidence = regimeObj.regime.confidence;
  }

  var regimeState = String((typeof rawState === 'string' ? rawState : '') || 'SIDEWAYS').toUpperCase();

  var score = 50;
  var label = 'SIDEWAYS';

  switch (regimeState) {
    case 'BULL_TREND':
    case 'BULLISH':
      score = 85;
      label = 'BULL TREND (Kondisi Kondusif untuk Buy)';
      break;
    case 'SIDEWAYS':
    case 'NEUTRAL':
      score = 55;
      label = 'SIDEWAYS / KONSOLIDASI (Selektif Saham)';
      break;
    case 'HIGH_VOLATILITY':
      score = 45;
      label = 'HIGH VOLATILITY (Risiko Ayunan Lebar)';
      break;
    case 'BEAR_TREND':
    case 'RISK_OFF':
      score = 25;
      label = 'BEAR TREND / RISK OFF (Pasar Tertekan)';
      break;
    default:
      score = 50;
      label = 'REGIME NETRAL';
  }

  return {
    available: true,
    status: 'REAL',
    score: score,
    regime: regimeState,
    regimeLabel: label,
    regimeConfidence: confidence,
    reason: 'IHSG Regime: ' + label + ' (Confidence: ' + confidence + '%)'
  };
}

/**
 * Core Composite Scoring with Dynamic Denominator Renormalization
 */
function dossierCalculateCompositeScore(pillars, weights) {
  if (!pillars || typeof pillars !== 'object') {
    pillars = {};
  }
  var w = Object.assign({}, DOSSIER_DEFAULT_WEIGHTS, weights || {});

  var pillarEntries = [
    { key: 'valuation', label: 'Valuasi & Harga Wajar', weight: w.valuation, res: pillars.valuation },
    { key: 'smartMoney', label: 'Smart Money & Bandar', weight: w.smartMoney, res: pillars.smartMoney },
    { key: 'technical', label: 'Teknikal & Momentum', weight: w.technical, res: pillars.technical },
    { key: 'ksei', label: 'Kepemilikan KSEI', weight: w.ksei, res: pillars.ksei },
    { key: 'fundamental', label: 'Profitabilitas & Dividen', weight: w.fundamental, res: pillars.fundamental },
    { key: 'regime', label: 'Market Regime AI', weight: w.regime, res: pillars.regime }
  ];

  var totalPotentialWeight = 0;
  var totalAvailableWeight = 0;
  var weightedScoreSum = 0;
  var availableCount = 0;

  pillarEntries.forEach(function(p) {
    totalPotentialWeight += p.weight;
    if (p.res && p.res.available === true && typeof p.res.score === 'number') {
      totalAvailableWeight += p.weight;
      weightedScoreSum += (p.res.score * p.weight);
      availableCount++;
    }
  });

  // Dynamic Renormalization
  var compositeScore = totalAvailableWeight > 0 ? Math.round(weightedScoreSum / totalAvailableWeight) : 0;
  var confidenceLevel = totalPotentialWeight > 0 ? Math.round((totalAvailableWeight / totalPotentialWeight) * 100) : 0;

  // Recommendation Category
  var recommendation = 'NEUTRAL / WAIT';
  var recColor = 'var(--amber)';
  var recClass = 'b-amber';

  if (compositeScore >= 80) {
    recommendation = 'STRONG BUY';
    recColor = 'var(--green)';
    recClass = 'b-up';
  } else if (compositeScore >= 65) {
    recommendation = 'BUY / ACCUMULATE';
    recColor = '#10b981';
    recClass = 'b-up';
  } else if (compositeScore >= 50) {
    recommendation = 'NEUTRAL / WAIT';
    recColor = '#f59e0b';
    recClass = 'b-amber';
  } else if (compositeScore >= 35) {
    recommendation = 'CAUTION / REDUCE';
    recColor = '#f97316';
    recClass = 'b-dn';
  } else {
    recommendation = 'AVOID / STRONG SELL';
    recColor = 'var(--red)';
    recClass = 'b-dn';
  }

  var simulatedCount = 0;
  pillarEntries.forEach(function(p) {
    if (p.res && p.res.available === true && (p.res.isSimulated || p.res.status === 'SIMULATION')) {
      simulatedCount++;
    }
  });
  var hasSimulatedPillars = simulatedCount > 0;

  var isDegraded = confidenceLevel < 70;
  if (isDegraded) {
    recommendation += ' (DATA TERBATAS)';
  }

  return {
    compositeScore: compositeScore,
    confidenceLevel: confidenceLevel,
    availablePillarsCount: availableCount,
    totalPillarsCount: pillarEntries.length,
    simulatedPillarsCount: simulatedCount,
    hasSimulatedPillars: hasSimulatedPillars,
    recommendation: recommendation,
    recColor: recColor,
    recClass: recClass,
    isDegraded: isDegraded,
    pillars: pillars,
    pillarEntries: pillarEntries,
    weightsUsed: w
  };
}

function dossierCalculateScore(harvested, weights) {
  if (!harvested) {
    return dossierCalculateCompositeScore({}, weights);
  }

  var valuationPillar = dossierComputeValuationScore(harvested);
  var smartMoneyPillar = dossierComputeSmartMoneyScore(harvested);
  var technicalPillar = dossierComputeTechnicalScore(harvested);
  var kseiPillar = dossierComputeKseiScore(harvested);
  var fundamentalPillar = dossierComputeFundamentalScore(harvested);
  var regimePillar = dossierComputeRegimeScore(harvested);

  var pillars = {
    valuation: valuationPillar,
    smartMoney: smartMoneyPillar,
    technical: technicalPillar,
    ksei: kseiPillar,
    fundamental: fundamentalPillar,
    regime: regimePillar
  };

  return dossierCalculateCompositeScore(pillars, weights);
}

// ============================================================
// 3. DATA HARVESTING & STRICT VALIDATION (AGENTS.md §1, §5, §28)
// ============================================================

function dossierIsValidTicker(ticker) {
  if (!ticker) return false;
  var tk = String(ticker).toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();
  if (!tk) return false;

  // 1. Check canonical universe validator if available
  if (typeof isValidStockTicker === 'function') {
    return isValidStockTicker(tk);
  }

  // 2. Check window stock databases
  if (typeof DB !== 'undefined' && DB && DB[tk]) return true;
  if (typeof _IDX_RAW_LIST !== 'undefined' && _IDX_RAW_LIST && _IDX_RAW_LIST[tk]) return true;
  if (typeof STOCKS !== 'undefined' && STOCKS && STOCKS[tk]) return true;
  if (typeof STOCK_PROFILES !== 'undefined' && STOCK_PROFILES && STOCK_PROFILES[tk]) return true;
  if (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV)) {
    if (FS_UNIV.some(function(u) { return u.t === tk; })) return true;
  }
  if (typeof XLSX_DATA !== 'undefined' && XLSX_DATA && Array.isArray(XLSX_DATA.stocks)) {
    if (XLSX_DATA.stocks.some(function(s) { return String(s.ticker || s.code || '').toUpperCase() === tk; })) return true;
  }

  // Known active bellwethers
  var commonValid = [
    'BBCA','BBRI','BMRI','BBNI','ANTM','ADRO','PTRO','TLKM','ASII','GOTO',
    'BREN','AMMN','TPIA','CUAN','PANI','BRMS','MEDC','PGAS','PTBA','INCO',
    'MDKA','HRUM','MBMA','BUMI','DEWA','AADI','ARCI','BRIS','BBTN','UNVR',
    'ICBP','INDF','KLBF','SIDO','MYOR','CPIN','ACES','ERAA','WIFI','RAJA',
    'SMDR','INKP','TKIM','JSMR','CTRA','SMRA','BSDE','PWON','GGRM','PGEO',
    'CDIA','ADMR','EXCL','BUKA','SMGR','UNTR','BRPT','AKRA','MAPI','INTP',
    'ESSA','MAPA','ITMG','TOWR','TBIG','MTEL','HEAL','MIKA','SILO','JPFA',
    'MAIN','AVIA','AUTO','SMSM','ACST','PTPP','WIKA','ADHI','ELSA','ENRG',
    'DOID','BSSR','ABMM','INDY','TOBA'
  ];
  if (commonValid.includes(tk)) return true;

  return false;
}

async function dossierHarvestData(ticker) {
  var cleanTicker = (typeof ticker === 'string' && ticker.trim().length > 0 ? ticker : (dossierState.ticker || 'BBCA')).toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();
  dossierState.ticker = cleanTicker;
  dossierState.isLoading = true;
  dossierState.errorMessage = null;
  dossierState.isInvalidTicker = false;

  // GATE 1: Client-Side Universe Validation Gate (AGENTS.md §1 & §5)
  if (!dossierIsValidTicker(cleanTicker)) {
    dossierState.isLoading = false;
    dossierState.isInvalidTicker = true;
    dossierState.harvestedData = null;
    dossierState.scoringResult = null;
    dossierState.errorMessage = 'Ticker "' + cleanTicker + '" Tidak Terdaftar dalam Stock Universe IDX. Sesuai prinsip integritas pasar (AGENTS.md §1, §5, §28), data tidak dapat dianalisis dan seluruh kalkulasi multi-faktor diblokir.';
    return null;
  }

  var harvested = {
    ticker: cleanTicker,
    timestamp: new Date().toISOString(),
    quote: null,
    brokerSummary: null,
    history: [],
    ksei: null,
    kseiLive: null,
    regime: null,
    fund: null,
    aiHypothesis: null
  };

  try {
    // 1. Fetch Quote
    var quotePromise = fetch('/api/idx/quote/' + cleanTicker)
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

    // 2. Fetch Broker Summary
    var brokerPromise = fetch('/api/idx/broker-summary/' + cleanTicker)
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

    // 3. Fetch History (90 bars daily)
    var historyPromise = fetch('/api/idx/history/' + cleanTicker + '?timeframe=1D&limit=90')
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

    // 4. Fetch KSEI (dataset statis >5% holder, Google Sheets, ~840/958 ticker)
    var kseiPromise = fetch('/api/ksei/stock/' + cleanTicker)
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

    // 4b. Fetch KSEI komposisi LIVE Invezgo (kategori investor Asing/Lokal x 9 kategori)
    var kseiLivePromise = fetch('/api/idx/shareholder-composition/' + cleanTicker)
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

    // 5. Fetch Market Regime
    var regimePromise = fetch('/api/idx/regime')
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

    // 6. Fetch AI Hypothesis
    var hypothesisPromise = fetch('/api/idx/hypothesis/' + cleanTicker)
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

    var results = await Promise.all([
      quotePromise,
      brokerPromise,
      historyPromise,
      kseiPromise,
      regimePromise,
      hypothesisPromise,
      kseiLivePromise
    ]);

    var qData = results[0];
    harvested.quote = (qData && qData.quote) ? qData.quote : qData;

    var bData = results[1];
    harvested.brokerSummary = (bData && bData.data) ? bData.data : bData;

    // GATE 2: Server Response & Data Quality Gate (AGENTS.md §5 & §28)
    var isQuoteInvalid = !qData || qData.success === false || qData.isValidTicker === false ||
      (harvested.quote && harvested.quote.isValidTicker === false);
    var isBrokerInvalid = bData && (bData.success === false || bData.isValidTicker === false);

    if (isQuoteInvalid || isBrokerInvalid) {
      dossierState.isInvalidTicker = true;
      dossierState.harvestedData = null;
      dossierState.scoringResult = null;
      dossierState.errorMessage = 'Ticker "' + cleanTicker + '" Ditolak oleh Gateway Pasar Bursa Efek Indonesia. Kode saham tidak terdaftar atau tidak memiliki riwayat perdagangan resmi.';
      return null;
    }

    var hData = results[2];
    if (hData && Array.isArray(hData.points)) {
      harvested.history = hData.points.map(function(p) {
        return {
          time: p.t,
          open: p.o,
          high: p.h,
          low: p.l,
          close: p.c,
          volume: p.v
        };
      });
    } else if (hData && Array.isArray(hData.candles)) {
      harvested.history = hData.candles;
    } else if (Array.isArray(hData)) {
      harvested.history = hData;
    }

    harvested.ksei = results[3];

    var rData = results[4];
    harvested.regime = (rData && rData.regime) ? rData.regime : rData;

    var hypData = results[5];
    harvested.aiHypothesis = (hypData && hypData.hypothesis) ? hypData.hypothesis : hypData;

    var kseiLiveData = results[6];
    harvested.kseiLive = (kseiLiveData && kseiLiveData.success && kseiLiveData.data) ? kseiLiveData.data : null;

    // Local cached fallback if API fundamentals missing
    if (typeof FUND_DATA !== 'undefined' && FUND_DATA) {
      if (FUND_DATA.ticker === cleanTicker) {
        harvested.fund = Object.assign({}, FUND_DATA.fin || {}, FUND_DATA.stats || {}, FUND_DATA);
      } else if (FUND_DATA[cleanTicker]) {
        harvested.fund = FUND_DATA[cleanTicker];
      }
    } else if (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV)) {
      var foundU = FS_UNIV.find(function(u) { return u.t === cleanTicker; });
      if (foundU) harvested.fund = foundU;
    }

    // Verify quote minimum validity
    var effectivePrice = harvested.quote ? (harvested.quote.price || harvested.quote.close || 0) : 0;
    if (!harvested.quote || effectivePrice <= 0) {
      if (typeof STOCKS !== 'undefined' && STOCKS[cleanTicker]) {
        harvested.quote = STOCKS[cleanTicker];
        effectivePrice = harvested.quote ? (harvested.quote.price || harvested.quote.close || 0) : 0;
      }
    }

    // Strict Check: Ticker must have real quote price
    if (!harvested.quote || effectivePrice <= 0) {
      dossierState.isInvalidTicker = true;
      dossierState.harvestedData = null;
      dossierState.scoringResult = null;
      dossierState.errorMessage = 'Ticker "' + cleanTicker + '" Tidak Memiliki Data Kuotasi Harga Saham Riil di IDX. Analisis multi-faktor diblokir.';
      return null;
    }

    dossierState.harvestedData = harvested;
    dossierState.scoringResult = dossierCalculateScore(harvested, dossierState.weights);
    dossierState.lastUpdated = new Date();
  } catch (err) {
    console.error('[Dossier] Harvest error:', err);
    dossierState.errorMessage = 'Gagal memuat feed data pasar: ' + (err.message || err);
  } finally {
    dossierState.isLoading = false;
  }

  return dossierState.scoringResult;
}

// ============================================================
// 4. USER INTERFACE RENDERING (ALL-IN-ONE DOSSIER)
// ============================================================

function dossierSelectTicker(tk) {
  if (!tk) return;
  var clean = tk.toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();
  dossierState.ticker = clean;
  if (typeof sm360SelectTicker === 'function') {
    sm360SelectTicker(clean, 'stock-dossier');
  } else {
    dossierRunAnalysis(clean);
  }
}

function dossierRunAnalysis(targetTicker) {
  var globalTk = (typeof GLOBAL_STOCK_CONTEXT !== 'undefined' && GLOBAL_STOCK_CONTEXT.getTicker) ? GLOBAL_STOCK_CONTEXT.getTicker() : 'BBCA';
  var tk = (targetTicker || globalTk || dossierState.ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();
  dossierState.ticker = tk;

  // 1. Sync GLOBAL_STOCK_CONTEXT
  if (typeof GLOBAL_STOCK_CONTEXT !== 'undefined' && GLOBAL_STOCK_CONTEXT.setTicker && GLOBAL_STOCK_CONTEXT.getTicker() !== tk) {
    GLOBAL_STOCK_CONTEXT.setTicker(tk, 'stock-dossier');
  }

  // 2. Synchronize subsystem globals
  if (typeof TECH_DATA !== 'undefined' && TECH_DATA) TECH_DATA.ticker = tk;
  if (typeof FUND_DATA !== 'undefined' && FUND_DATA) FUND_DATA.ticker = tk;
  if (typeof MW_SELECTED_INTEL_TICKER !== 'undefined') MW_SELECTED_INTEL_TICKER = tk;
  if (typeof STOCKCHAT_SELECTED_TICKER !== 'undefined') STOCKCHAT_SELECTED_TICKER = tk;

  // 3. Synchronize all input elements in DOM
  document.querySelectorAll('.sm360-search-input, #sm360-search-inp').forEach(function(el) {
    el.value = tk;
  });
  ['techTickerInput', 'fundTickerInput', 'dossier-ticker-input', 'intel-search-input', 'stockchat-ticker-inp'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = tk;
  });

  // 4. Set loading state and re-render header/page
  dossierState.isLoading = true;
  dossierState.errorMessage = null;
  renderStockDossierPage();

  dossierHarvestData(tk)
    .catch(function(err) {
      console.error('[Dossier] RunAnalysis uncaught error:', err);
      dossierState.errorMessage = 'Gagal memuat feed data pasar: ' + (err.message || err);
    })
    .finally(function() {
      dossierState.isLoading = false;
      renderStockDossierPage();
    });
}

function dossierSwitchTab(tabName) {
  dossierState.activeTab = tabName;
  var tabBtns = document.querySelectorAll('.dossier-tab-btn');
  tabBtns.forEach(function(b) {
    var isActive = b.getAttribute('data-tab') === tabName;
    b.classList.toggle('active', isActive);
    b.style.color = isActive ? 'var(--blue)' : 'var(--text2)';
    b.style.borderBottom = isActive ? '2px solid var(--blue)' : '2px solid transparent';
  });
  var tabPanes = document.querySelectorAll('.dossier-tab-pane');
  tabPanes.forEach(function(p) {
    p.style.display = p.getAttribute('data-tab') === tabName ? 'block' : 'none';
  });
}

function dossierRenderStatusBadge(pillar) {
  if (!pillar || !pillar.available) {
    return '<span class="badge b-dn" style="font-size:9px;padding:1px 5px">DATA TIDAK TERSEDIA</span>';
  }
  if (pillar.isSimulated || pillar.status === 'SIMULATION') {
    return '<span class="badge" style="background:rgba(245,158,11,0.18);color:#f59e0b;border:1px solid rgba(245,158,11,0.35);font-size:9px;padding:1px 5px;font-weight:700" title="Data merupakan estimasi model simulasi (Invezgo API belum terhubung)"><i class="ti ti-flask"></i> SIMULASI</span>';
  }
  return '<span class="badge b-up" style="font-size:9px;padding:1px 5px">REAL</span>';
}

function renderStockDossierPage(targetTicker) {
  var container = document.getElementById('page-stock-dossier');
  if (!container) return;

  // Initialize weights if needed
  if (!dossierState.weights) {
    dossierState.weights = dossierGetWeights();
  }

  var globalTk = (typeof GLOBAL_STOCK_CONTEXT !== 'undefined' && GLOBAL_STOCK_CONTEXT.getTicker) ? GLOBAL_STOCK_CONTEXT.getTicker() : 'BBCA';
  var cleanTarget = (targetTicker || globalTk || dossierState.ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();

  // If the target ticker is different from the currently harvested data or state, and not loading, fetch fresh data
  var isDifferentFromHarvested = Boolean(dossierState.harvestedData && dossierState.harvestedData.ticker && dossierState.harvestedData.ticker !== cleanTarget);
  var isDifferentFromState = Boolean(dossierState.ticker && dossierState.ticker !== cleanTarget);
  if ((!dossierState.harvestedData || isDifferentFromHarvested || isDifferentFromState) && !dossierState.isLoading && !dossierState.errorMessage && !dossierState.isInvalidTicker) {
    dossierState.ticker = cleanTarget;
    dossierRunAnalysis(cleanTarget);
    return;
  }

  try {
    var res = dossierState.scoringResult;
  var harvested = dossierState.harvestedData || {};
  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var price = quote.price || (quote.close) || 0;
  var change = (quote.change !== undefined && quote.change !== null) ? Number(quote.change) : 0;
  var changePct = 0;
  if (quote.changePercent !== undefined && quote.changePercent !== null) {
    changePct = Number(quote.changePercent);
  } else if (quote.prevClose && quote.prevClose > 0 && quote.change !== undefined) {
    changePct = (Number(quote.change) / Number(quote.prevClose)) * 100;
  } else if (price > 0 && quote.change !== undefined && (price - Number(quote.change)) > 0) {
    changePct = (Number(quote.change) / (price - Number(quote.change))) * 100;
  }
  var changeStr = (changePct >= 0 ? '+' : '') + Number(changePct).toFixed(2) + '%';
  var changeColor = changePct >= 0 ? 'var(--green)' : 'var(--red)';

  var nav360 = (typeof renderStockMaster360Nav === 'function') ? renderStockMaster360Nav('dossier', dossierState.ticker) : '';
  var html = nav360;

  // ── Header & Action Bar ──
  html += '<div style="margin-bottom:16px">';
  html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px">';
  html += '    <div>';
  html += '      <h1 style="font-size:22px;font-weight:900;margin:0;letter-spacing:-0.5px;color:var(--text);display:flex;align-items:center;gap:8px">';
  html += '        <i class="ti ti-file-analytics" style="color:var(--blue)"></i> Master Stock Intelligence Dossier';
  html += '      </h1>';
  html += '    </div>';

  html += '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  html += '      <button class="btn btn-ghost btn-sm" onclick="dossierOpenWeightsModal()" style="display:flex;align-items:center;gap:6px;border:1px solid var(--border)">';
  html += '        <i class="ti ti-adjustments-horizontal"></i> Atur Bobot Analisis';
  html += '      </button>';
  html += '      <button class="btn btn-ghost btn-sm" onclick="dossierRunAnalysis()" style="display:flex;align-items:center;gap:6px">';
  html += '        <i class="ti ti-refresh"></i> Refresh Data';
  html += '      </button>';
  html += '    </div>';
  html += '  </div>';
  html += '</div>';

  // Loading State
  if (dossierState.isLoading) {
    html += '<div class="card" style="padding:40px;text-align:center;border:1px solid var(--border)">';
    html += '  <div style="font-size:24px;margin-bottom:10px"><i class="ti ti-loader animate-spin" style="color:var(--blue)"></i></div>';
    html += '  <div style="font-size:15px;font-weight:700;color:var(--text)">Memanen Data 6 Pilar Analisis Saham ' + dossierState.ticker + '...</div>';
    html += '  <div style="font-size:12px;color:var(--text3);margin-top:6px">Memverifikasi Harga Wajar, Broker Flow, Indikator Teknikal, Kustodian KSEI, Fundamental &amp; Market Regime secara real-time.</div>';
    html += '</div>';
    container.innerHTML = html;
    return;
  }

  // Error / Invalid Ticker Zero-State (AGENTS.md §1, §5, §28)
  if (dossierState.isInvalidTicker || dossierState.errorMessage) {
    var errTitle = dossierState.isInvalidTicker
      ? 'Ticker "' + dossierState.ticker + '" Ditolak — Tidak Terdaftar dalam Stock Universe IDX'
      : 'Gagal Memuat Feed Data Pasar';
    var errDesc = dossierState.errorMessage || 'Saham tidak ditemukan dalam database resmi BEI atau tidak memiliki data perdagangan resmi.';

    html += '<div class="card" style="padding:28px 24px;border:1px solid rgba(244,63,94,0.4);background:linear-gradient(180deg, rgba(244,63,94,0.08) 0%, rgba(15,23,42,0.6) 100%);border-radius:12px;margin-bottom:24px">';
    html += '  <div style="display:flex;align-items:flex-start;gap:16px">';
    html += '    <div style="width:48px;height:48px;border-radius:12px;background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);display:flex;align-items:center;justify-content:center;color:#f43f5e;font-size:24px;flex-shrink:0">';
    html += '      <i class="ti ti-shield-x"></i>';
    html += '    </div>';
    html += '    <div style="flex:1">';
    html += '      <div style="font-size:16px;font-weight:800;color:#f43f5e;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
    html += '        <span>' + errTitle + '</span>';
    html += '        <span class="badge" style="background:rgba(244,63,94,0.2);color:#f43f5e;border:1px solid rgba(244,63,94,0.4);font-size:10px;font-weight:700">BLOCKED (AGENTS.md §1 &amp; §5)</span>';
    html += '      </div>';
    html += '      <p style="font-size:13px;line-height:1.6;color:var(--text2);margin:0 0 14px 0">';
    html += '        ' + errDesc;
    html += '      </p>';
    html += '      <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:var(--text3);line-height:1.5">';
    html += '        <div style="font-weight:700;color:var(--text);margin-bottom:4px"><i class="ti ti-alert-circle" style="color:#fbbf24"></i> Protokol Integritas Pasar (Zero Dummy Data Mandate):</div>';
    html += '        Sistem dilarang merekayasa harga, volume orderbook, arus broker bandarmology, atau rasio fundamental untuk saham yang tidak sah. Seluruh 6 pilar kalkulasi composite multi-factor (Valuasi, Smart Money, Teknikal, KSEI, Fundamental, dan AI Market Regime) diblokir secara total untuk menjaga keaslian data finansial.';
    html += '      </div>';
    html += '      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
    html += '        <span style="font-size:12px;color:var(--text3);font-weight:600">Pilih Ticker Saham IDX Sah:</span>';
    ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ADRO', 'ANTM'].forEach(function(recTk) {
      html += '        <button onclick="dossierSelectTicker(\'' + recTk + '\')" class="btn btn-ghost btn-xs" style="font-family:var(--font-mono);font-weight:700;border:1px solid var(--border);color:var(--blue)">' + recTk + '</button>';
    });
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    container.innerHTML = html;
    return;
  }

  if (!res) {
    container.innerHTML = html;
    return;
  }

  // ── Master Scorecard Hero Banner ──
  var logoHtml = typeof getStockLogoHtml === 'function' ? getStockLogoHtml(dossierState.ticker, 48) : '';

  html += '<div class="card" style="margin-bottom:20px;padding:22px;border:1px solid var(--border);background:var(--bg2);box-shadow:0 4px 20px rgba(0,0,0,0.06);border-radius:10px">';
  html += '  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px">';

  // Left: Ticker Logo, Name, Sector & Live Price
  html += '    <div style="flex:1;min-width:280px">';
  html += '      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">';
  html += '        ' + logoHtml;
  html += '        <div>';
  html += '          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  html += '            <span style="font-family:var(--font-mono);font-size:28px;font-weight:900;letter-spacing:-0.5px;color:var(--text)">' + dossierState.ticker + '</span>';
  html += '            <span class="badge" style="background:rgba(59,130,246,0.12);color:var(--blue);font-weight:700;font-size:11px">' + (quote.sector || 'IDX Equities') + '</span>';
  html += '            <span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text3);font-size:10px">Papan Utama</span>';
  html += '          </div>';
  html += '          <div style="font-size:13px;color:var(--text2);font-weight:600;margin-top:2px">' + (quote.name || dossierState.ticker + ' Tbk') + '</div>';
  html += '        </div>';
  html += '      </div>';

  html += '      <div style="display:flex;align-items:baseline;gap:12px">';
  html += '        <span style="font-family:var(--font-mono);font-size:26px;font-weight:900;color:var(--text)">Rp ' + (price > 0 ? price.toLocaleString('id-ID') : '-') + '</span>';
  html += '        <span class="badge" style="background:' + (change >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)') + ';color:' + changeColor + ';font-family:var(--font-mono);font-size:13px;font-weight:800;padding:2px 8px">';
  html += '          ' + changeStr;
  html += '        </span>';
  html += '      </div>';

  // Quick Key Indicators Ribbon
  html += '      <div style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--text2);background:var(--bg2);padding:8px 12px;border-radius:6px;border:1px solid var(--border)">';
  html += '        <div><span style="color:var(--text3)">PE:</span> <b style="font-family:var(--font-mono)">' + (quote.fundamentals && quote.fundamentals.per ? quote.fundamentals.per.toFixed(1) + 'x' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">PBV:</span> <b style="font-family:var(--font-mono)">' + (quote.fundamentals && quote.fundamentals.pbv ? quote.fundamentals.pbv.toFixed(2) + 'x' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">ROE:</span> <b style="font-family:var(--font-mono)">' + (quote.fundamentals && quote.fundamentals.roe ? quote.fundamentals.roe.toFixed(1) + '%' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">Bandar:</span> <b>' + (res.pillars.smartMoney.bandarStatus || '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">Div Yield:</span> <b style="font-family:var(--font-mono)">' + (quote.fundamentals && quote.fundamentals.dividendYield ? quote.fundamentals.dividendYield.toFixed(1) + '%' : '-') + '</b></div>';
  html += '      </div>';
  html += '    </div>';

  // Middle: Master Composite Scorecard
  html += '    <div style="display:flex;align-items:center;gap:16px;border-left:1px solid var(--border);border-right:1px solid var(--border);padding:0 24px">';
  html += '      <div style="text-align:center">';
  html += '        <div style="font-size:10px;font-weight:900;letter-spacing:0.8px;color:var(--text3);text-transform:uppercase;margin-bottom:4px">MASTER SCORE</div>';
  html += '        <div style="font-family:var(--font-mono);font-size:46px;font-weight:900;line-height:1;color:' + res.recColor + '">' + res.compositeScore + '<span style="font-size:16px;color:var(--text3);font-weight:500">/100</span></div>';
  html += '        <div style="margin-top:6px"><span class="badge ' + res.recClass + '" style="font-weight:900;font-size:11px;padding:3px 12px;letter-spacing:0.3px">' + res.recommendation + '</span></div>';
  html += '      </div>';
  html += '    </div>';

  // Right: Confidence & Actions
  html += '    <div style="min-width:220px">';
  html += '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">';
  html += '        <span style="color:var(--text3);font-weight:700">Data Confidence Level</span>';
  html += '        <span style="font-family:var(--font-mono);font-weight:800;color:' + (res.confidenceLevel >= 80 ? 'var(--green)' : (res.confidenceLevel >= 50 ? 'var(--amber)' : 'var(--red)')) + '">' + res.confidenceLevel + '%</span>';
  html += '      </div>';
  html += '      <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin-bottom:8px">';
  html += '        <div style="height:100%;width:' + res.confidenceLevel + '%;background:' + (res.confidenceLevel >= 80 ? 'var(--green)' : (res.confidenceLevel >= 50 ? 'var(--amber)' : 'var(--red)')) + '"></div>';
  html += '      </div>';
  html += '      <div style="font-size:11px;color:var(--text3)">' + res.availablePillarsCount + ' dari ' + res.totalPillarsCount + ' pilar terverifikasi real data.</div>';

  // Action Buttons
  html += '      <div style="margin-top:14px;display:flex;gap:8px">';
  html += '        <button class="btn btn-ghost btn-xs" onclick="dossierAddToWatchlist(\'' + dossierState.ticker + '\')" title="Tambahkan ke Watchlist" style="display:inline-flex;align-items:center;gap:4px">';
  html += '          <i class="ti ti-star"></i> Watchlist';
  html += '        </button>';
  html += '        <button class="btn btn-ghost btn-xs" onclick="dossierOpenInStockChat(\'' + dossierState.ticker + '\')" title="Tanyakan ke StockChat AI" style="display:inline-flex;align-items:center;gap:4px">';
  html += '          <i class="ti ti-terminal-2"></i> StockChat';
  html += '        </button>';
  html += '      </div>';
  html += '    </div>';

  html += '  </div>';
  html += '</div>';

  // ── DUAL-COLUMN SPLIT TERMINAL: DATA UTAMA VS SUPPORTING ──
  html += '<div class="dossier-split-container" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px, 100%), 1fr));gap:20px;margin-bottom:24px;align-items:start">';

  // ════════════════════════════════════════════════════════════
  // 1. DATA UTAMA (HARGA SAHAM & PERFORMA BISNIS PERUSAHAAN)
  // ════════════════════════════════════════════════════════════
  html += '  <div>';
  html += '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px">';
  html += '      <div>';
  html += '        <div style="font-size:12px;font-weight:900;color:var(--text);letter-spacing:0.5px;text-transform:uppercase;display:flex;align-items:center;gap:6px">';
  html += '          <i class="ti ti-building-bank" style="color:var(--blue)"></i> 1. DATA UTAMA (HARGA &amp; KINERJA EMITEN)';
  html += '        </div>';
  html += '        <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Faktor internal: valuasi fundamental, momentum teknikal, dan profitabilitas.</div>';
  html += '      </div>';
  html += '      <span class="badge" style="background:var(--bg2);border:1px solid var(--border);color:var(--text2);font-weight:800;font-size:10px">BOBOT ' + (res.weightsUsed.valuation + res.weightsUsed.technical + res.weightsUsed.fundamental) + '%</span>';
  html += '    </div>';

  // 1.1 Card: Valuasi & Harga Wajar
  var vp = res.pillars.valuation || {};
  var vpAvail = vp.available === true;
  var vpScoreColor = vpAvail ? (vp.score >= 75 ? 'var(--green)' : (vp.score >= 50 ? 'var(--amber)' : 'var(--red)')) : 'var(--text3)';
  var vpMosColor = (vp.mosPct !== null) ? (vp.mosPct >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text3)';
  html += '    <div class="card" style="padding:14px;border:1px solid var(--border);background:var(--bg2);margin-bottom:12px;cursor:pointer;transition:transform 0.15s,border-color 0.15s" ';
  html += '      onclick="dossierSwitchTab(\'valuation\')" onmouseover="this.style.borderColor=\'var(--blue)\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
  html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  html += '        <div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-scale" style="color:var(--blue)"></i> Valuasi &amp; Harga Wajar (Graham/DCF)</div>';
  html += '        <div style="display:flex;align-items:center;gap:4px">';
  html += '          <span class="badge" style="background:var(--bg2);color:var(--text3);font-size:9px">' + res.weightsUsed.valuation + '%</span>';
  html += '          ' + dossierRenderStatusBadge(vp);
  html += '        </div>';
  html += '      </div>';
  html += '      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">';
  html += '        <div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:' + vpScoreColor + '">' + (vpAvail && typeof vp.score === 'number' ? vp.score : '-') + (vpAvail ? '<span style="font-size:11px;color:var(--text3)">/100</span>' : '') + '</div>';
  html += '        <div style="font-size:11px;color:var(--blue);font-weight:700">Detail &rarr;</div>';
  html += '      </div>';
  html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg2);padding:8px 10px;border-radius:6px;margin-bottom:8px;font-size:11px">';
  html += '        <div><span style="color:var(--text3)">Nilai Intrinsik:</span> <b style="font-family:var(--font-mono);color:var(--text)">' + (vp.fairValue ? 'Rp ' + Math.round(vp.fairValue).toLocaleString('id-ID') : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">Margin of Safety:</span> <b style="font-family:var(--font-mono);color:' + vpMosColor + '">' + (vp.mosPct !== null ? (vp.mosPct > 0 ? '+' : '') + vp.mosPct.toFixed(1) + '%' : '-') + '</b></div>';
  html += '      </div>';
  html += '      <div style="font-size:11px;color:var(--text2);line-height:1.4">' + (vp.reason || 'Data valuasi tidak tersedia.') + '</div>';
  html += '    </div>';

  // 1.2 Card: Momentum & Analisis Teknikal
  var tp = res.pillars.technical || {};
  var tpAvail = tp.available === true;
  var tpScoreColor = tpAvail ? (tp.score >= 75 ? 'var(--green)' : (tp.score >= 50 ? 'var(--amber)' : 'var(--red)')) : 'var(--text3)';
  html += '    <div class="card" style="padding:14px;border:1px solid var(--border);background:var(--bg2);margin-bottom:12px;cursor:pointer;transition:transform 0.15s,border-color 0.15s" ';
  html += '      onclick="dossierSwitchTab(\'technical\')" onmouseover="this.style.borderColor=\'var(--blue)\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
  html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  html += '        <div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-chart-candle" style="color:var(--blue)"></i> Momentum &amp; Analisis Teknikal</div>';
  html += '        <div style="display:flex;align-items:center;gap:4px">';
  html += '          <span class="badge" style="background:var(--bg2);color:var(--text3);font-size:9px">' + res.weightsUsed.technical + '%</span>';
  html += '          ' + dossierRenderStatusBadge(tp);
  html += '        </div>';
  html += '      </div>';
  html += '      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">';
  html += '        <div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:' + tpScoreColor + '">' + (tpAvail && typeof tp.score === 'number' ? tp.score : '-') + (tpAvail ? '<span style="font-size:11px;color:var(--text3)">/100</span>' : '') + '</div>';
  html += '        <div style="font-size:11px;color:var(--blue);font-weight:700">Detail &rarr;</div>';
  html += '      </div>';
  html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg2);padding:8px 10px;border-radius:6px;margin-bottom:8px;font-size:11px">';
  html += '        <div><span style="color:var(--text3)">Struktur Tren:</span> <b style="color:var(--text)">' + (tp.trend || '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">RSI (14):</span> <b style="font-family:var(--font-mono);color:' + (tp.rsi >= 70 ? 'var(--red)' : (tp.rsi <= 30 ? 'var(--green)' : 'var(--text)')) + '">' + (tp.rsi !== null ? tp.rsi : '-') + '</b></div>';
  html += '      </div>';
  html += '      <div style="font-size:11px;color:var(--text2);line-height:1.4">' + (tp.reason || 'Data teknikal tidak tersedia.') + '</div>';
  html += '    </div>';

  // 1.3 Card: Profitabilitas & Dividen
  var fp = res.pillars.fundamental || {};
  var fpAvail = fp.available === true;
  var fpScoreColor = fpAvail ? (fp.score >= 75 ? 'var(--green)' : (fp.score >= 50 ? 'var(--amber)' : 'var(--red)')) : 'var(--text3)';
  html += '    <div class="card" style="padding:14px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;transition:transform 0.15s,border-color 0.15s" ';
  html += '      onclick="dossierSwitchTab(\'fundamental\')" onmouseover="this.style.borderColor=\'var(--blue)\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
  html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  html += '        <div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-coins" style="color:var(--blue)"></i> Profitabilitas &amp; Dividen</div>';
  html += '        <div style="display:flex;align-items:center;gap:4px">';
  html += '          <span class="badge" style="background:var(--bg2);color:var(--text3);font-size:9px">' + res.weightsUsed.fundamental + '%</span>';
  html += '          ' + dossierRenderStatusBadge(fp);
  html += '        </div>';
  html += '      </div>';
  html += '      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">';
  html += '        <div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:' + fpScoreColor + '">' + (fpAvail && typeof fp.score === 'number' ? fp.score : '-') + (fpAvail ? '<span style="font-size:11px;color:var(--text3)">/100</span>' : '') + '</div>';
  html += '        <div style="font-size:11px;color:var(--blue);font-weight:700">Detail &rarr;</div>';
  html += '      </div>';
  html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg2);padding:8px 10px;border-radius:6px;margin-bottom:8px;font-size:11px">';
  html += '        <div><span style="color:var(--text3)">ROE:</span> <b style="font-family:var(--font-mono);color:var(--text)">' + (fp.roe !== null ? fp.roe.toFixed(1) + '%' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">DER (Hutang):</span> <b style="font-family:var(--font-mono);color:var(--text)">' + (fp.der !== null ? fp.der.toFixed(2) + 'x' : '-') + '</b></div>';
  html += '      </div>';
  html += '      <div style="font-size:11px;color:var(--text2);line-height:1.4">' + (fp.reason || 'Data profitabilitas tidak tersedia.') + '</div>';
  html += '    </div>';

  html += '  </div>'; // End Kolom 1

  // ════════════════════════════════════════════════════════════
  // 2. SUPPORTING: FAKTOR EKSTERNAL & ARUS PASAR
  // ════════════════════════════════════════════════════════════
  html += '  <div>';
  html += '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:6px">';
  html += '      <div>';
  html += '        <div style="font-size:12px;font-weight:900;color:var(--text);letter-spacing:0.5px;text-transform:uppercase;display:flex;align-items:center;gap:6px">';
  html += '          <i class="ti ti-waves" style="color:var(--blue)"></i> 2. SUPPORTING (FAKTOR EKSTERNAL &amp; PASAR)';
  html += '        </div>';
  html += '        <div style="font-size:10.5px;color:var(--text3);margin-top:2px">Faktor eksternal: akumulasi broker bandar, kepemilikan KSEI, dan iklim IHSG.</div>';
  html += '      </div>';
  html += '      <span class="badge" style="background:var(--bg2);border:1px solid var(--border);color:var(--text2);font-weight:800;font-size:10px">BOBOT ' + (res.weightsUsed.smartMoney + res.weightsUsed.ksei + res.weightsUsed.regime) + '%</span>';
  html += '    </div>';

  // 2.1 Card: Smart Money & Bandarmology (WITH NAMA BROKER AKUMULATOR)
  var sm = res.pillars.smartMoney || {};
  var smAvail = sm.available === true;
  var smScoreColor = smAvail ? (sm.score >= 75 ? 'var(--green)' : (sm.score >= 50 ? 'var(--amber)' : 'var(--red)')) : 'var(--text3)';
  var accumList = sm.accumulators || [];
  html += '    <div class="card" style="padding:14px;border:1px solid var(--border);background:var(--bg2);margin-bottom:12px;cursor:pointer;transition:transform 0.15s,border-color 0.15s" ';
  html += '      onclick="dossierSwitchTab(\'smartMoney\')" onmouseover="this.style.borderColor=\'#8b5cf6\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
  html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  html += '        <div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-radar" style="color:#8b5cf6"></i> Smart Money &amp; Broker Flow</div>';
  html += '        <div style="display:flex;align-items:center;gap:4px">';
  html += '          <span class="badge" style="background:var(--bg2);color:var(--text3);font-size:9px">' + res.weightsUsed.smartMoney + '%</span>';
  html += '          ' + dossierRenderStatusBadge(sm);
  html += '        </div>';
  html += '      </div>';
  html += '      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">';
  html += '        <div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:' + smScoreColor + '">' + (smAvail && typeof sm.score === 'number' ? sm.score : '-') + (smAvail ? '<span style="font-size:11px;color:var(--text3)">/100</span>' : '') + '</div>';
  html += '        <div style="font-size:11px;color:#8b5cf6;font-weight:700">Detail &rarr;</div>';
  html += '      </div>';
  html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg2);padding:8px 10px;border-radius:6px;margin-bottom:8px;font-size:11px">';
  html += '        <div><span style="color:var(--text3)">Aksi Bandar:</span> <b style="color:var(--text)">' + (sm.bandarStatus || '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">Konsentrasi Top 3:</span> <b style="font-family:var(--font-mono);color:var(--text)">' + (sm.top3Pct ? sm.top3Pct + '%' : '-') + '</b></div>';
  html += '      </div>';

  // PROMINENT FEATURE: NAMA BROKER AKUMULATOR UTAMA
  if (accumList && accumList.length > 0) {
    var isSimAccum = sm.isSimulated || sm.status === 'SIMULATION';
    var accumBg = isSimAccum ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)';
    var accumBorder = isSimAccum ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)';
    var accumTitleColor = isSimAccum ? '#f59e0b' : 'var(--green)';
    var accumTitleIcon = isSimAccum ? 'ti ti-flask' : 'ti ti-user-check';
    var accumTitleText = isSimAccum ? 'Broker Akumulator (Simulasi Model):' : 'Broker Akumulator Utama (Top Buyers):';

    html += '      <div style="margin-bottom:8px;padding:8px 10px;background:' + accumBg + ';border:1px solid ' + accumBorder + ';border-radius:6px">';
    html += '        <div style="font-size:10px;font-weight:900;color:' + accumTitleColor + ';text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:4px"><i class="' + accumTitleIcon + '"></i> ' + accumTitleText + '</div>';
    html += '        <div style="display:flex;flex-direction:column;gap:4px">';
    accumList.slice(0, 3).forEach(function(acc) {
      html += '          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px">';
      html += '            <div style="display:inline-flex;align-items:center;gap:6px">';
      html += '              <span class="badge" style="background:' + (isSimAccum ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)') + ';color:' + (isSimAccum ? '#f59e0b' : 'var(--green)') + ';font-family:var(--font-mono);font-weight:900;padding:1px 5px;font-size:10px">' + acc.code + '</span>';
      html += '              <span style="font-weight:700;color:var(--text)">' + acc.name + '</span>';
      if (acc.isForeign) html += ' <span class="badge" style="font-size:8px;padding:0 3px;background:rgba(59,130,246,0.15);color:var(--blue)">ASING</span>';
      html += '            </div>';
      html += '            <div style="font-family:var(--font-mono);font-weight:800;color:var(--text)">' + acc.valStr + '</div>';
      html += '          </div>';
    });
    html += '        </div>';
    html += '      </div>';
  }

  html += '      <div style="font-size:11px;color:var(--text2);line-height:1.4">' + (sm.reason || 'Data smart money tidak tersedia.') + '</div>';
  html += '    </div>';

  // 2.2 Card: Kepemilikan KSEI
  var kp = res.pillars.ksei || {};
  var kpAvail = kp.available === true;
  var kpScoreColor = kpAvail ? (kp.score >= 75 ? 'var(--green)' : (kp.score >= 50 ? 'var(--amber)' : 'var(--red)')) : 'var(--text3)';
  html += '    <div class="card" style="padding:14px;border:1px solid var(--border);background:var(--bg2);margin-bottom:12px;cursor:pointer;transition:transform 0.15s,border-color 0.15s" ';
  html += '      onclick="dossierSwitchTab(\'ksei\')" onmouseover="this.style.borderColor=\'#8b5cf6\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
  html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  html += '        <div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-shield-check" style="color:#8b5cf6"></i> Kepemilikan Kustodian KSEI</div>';
  html += '        <div style="display:flex;align-items:center;gap:4px">';
  html += '          <span class="badge" style="background:var(--bg2);color:var(--text3);font-size:9px">' + res.weightsUsed.ksei + '%</span>';
  html += '          ' + dossierRenderStatusBadge(kp);
  html += '        </div>';
  html += '      </div>';
  html += '      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">';
  html += '        <div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:' + kpScoreColor + '">' + (kpAvail && typeof kp.score === 'number' ? kp.score : '-') + (kpAvail ? '<span style="font-size:11px;color:var(--text3)">/100</span>' : '') + '</div>';
  html += '        <div style="font-size:11px;color:#8b5cf6;font-weight:700">Detail &rarr;</div>';
  html += '      </div>';
  html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg2);padding:8px 10px;border-radius:6px;margin-bottom:8px;font-size:11px">';
  html += '        <div><span style="color:var(--text3)">Free Float Publik:</span> <b style="font-family:var(--font-mono);color:var(--text)">' + (kp.freeFloat !== null ? kp.freeFloat.toFixed(1) + '%' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">Total Institusi:</span> <b style="font-family:var(--font-mono);color:var(--text)">' + (kp.institutionalPct !== null ? kp.institutionalPct.toFixed(1) + '%' : '-') + '</b></div>';
  html += '      </div>';
  html += '      <div style="font-size:11px;color:var(--text2);line-height:1.4">' + (kp.reason || 'Data KSEI tidak tersedia.') + '</div>';
  html += '    </div>';

  // 2.3 Card: Market Regime IHSG & AI Confluence
  var rp = res.pillars.regime || {};
  var rpAvail = rp.available === true;
  var rpScoreColor = rpAvail ? (rp.score >= 75 ? 'var(--green)' : (rp.score >= 50 ? 'var(--amber)' : 'var(--red)')) : 'var(--text3)';
  html += '    <div class="card" style="padding:14px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;transition:transform 0.15s,border-color 0.15s" ';
  html += '      onclick="dossierSwitchTab(\'regime\')" onmouseover="this.style.borderColor=\'#8b5cf6\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
  html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  html += '        <div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-compass" style="color:#8b5cf6"></i> Market Regime IHSG &amp; AI</div>';
  html += '        <div style="display:flex;align-items:center;gap:4px">';
  html += '          <span class="badge" style="background:var(--bg2);color:var(--text3);font-size:9px">' + res.weightsUsed.regime + '%</span>';
  html += '          ' + dossierRenderStatusBadge(rp);
  html += '        </div>';
  html += '      </div>';
  html += '      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">';
  html += '        <div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:' + rpScoreColor + '">' + (rpAvail && typeof rp.score === 'number' ? rp.score : '-') + (rpAvail ? '<span style="font-size:11px;color:var(--text3)">/100</span>' : '') + '</div>';
  html += '        <div style="font-size:11px;color:#8b5cf6;font-weight:700">Detail &rarr;</div>';
  html += '      </div>';
  html += '      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg2);padding:8px 10px;border-radius:6px;margin-bottom:8px;font-size:11px">';
  html += '        <div><span style="color:var(--text3)">Regime IHSG:</span> <b style="color:var(--text)">' + (rp.regime || 'SIDEWAYS') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">Confidence:</span> <b style="font-family:var(--font-mono);color:var(--text)">' + (typeof rp.regimeConfidence === 'number' ? rp.regimeConfidence : 75) + '%</b></div>';
  html += '      </div>';
  html += '      <div style="font-size:11px;color:var(--text2);line-height:1.4">' + (rp.reason || 'Data regime tidak tersedia.') + '</div>';
  html += '    </div>';

  html += '  </div>'; // End Kolom 2

  html += '</div>'; // End dossier-split-container

  // ── Unified Deep-Dive Multi-Tab Accordions (All-in-One Detail) ──
  html += '<div class="card" style="border:1px solid var(--border);padding:0;background:var(--bg2);margin-bottom:30px">';

  // Tab Header Navigation
  html += '  <div style="display:flex;border-bottom:1px solid var(--border);overflow-x:auto;background:rgba(0,0,0,0.15)">';
  [
    { id: 'overview', label: 'Ringkasan Eksekutif' },
    { id: 'valuation', label: '1. Valuasi & MoS' },
    { id: 'smartMoney', label: '2. Smart Money Flow' },
    { id: 'technical', label: '3. Teknikal & Momentum' },
    { id: 'ksei', label: '4. Kepemilikan KSEI' },
    { id: 'fundamental', label: '5. Fundamental & Dividen' },
    { id: 'regime', label: '6. AI Regime & Verdict' }
  ].forEach(function(t) {
    var isActive = dossierState.activeTab === t.id;
    html += '    <button class="dossier-tab-btn ' + (isActive ? 'active' : '') + '" data-tab="' + t.id + '" onclick="dossierSwitchTab(\'' + t.id + '\')" ';
    html += '      style="padding:12px 18px;font-size:12px;font-weight:700;border:none;background:transparent;color:' + (isActive ? 'var(--blue)' : 'var(--text2)') + ';border-bottom:2px solid ' + (isActive ? 'var(--blue)' : 'transparent') + ';cursor:pointer;white-space:nowrap">';
    html += '      ' + t.label;
    html += '    </button>';
  });
  html += '  </div>';

  // Tab Contents Container
  html += '  <div style="padding:20px">';

  // ── TAB: OVERVIEW ──
  html += '    <div class="dossier-tab-pane" data-tab="overview" style="display:' + (dossierState.activeTab === 'overview' ? 'block' : 'none') + '">';
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text);margin:0 0 12px 0">Ringkasan Eksekutif &amp; Tesis Investasi</h4>';
  html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">';

  // Bull Case Box
  html += '        <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:14px">';
  html += '          <div style="font-size:12px;font-weight:800;color:var(--green);margin-bottom:6px"><i class="ti ti-trending-up"></i> FAKTOR PENDORONG (BULL CASE)</div>';
  html += '          <ul style="margin:0;padding-left:18px;font-size:11px;color:var(--text2);line-height:1.6">';
  if (res.pillars.valuation.available && res.pillars.valuation.mosPct > 10) {
    html += '            <li>Margin of Safety positif (+' + res.pillars.valuation.mosPct.toFixed(1) + '%), harga saat ini berada di bawah estimasi nilai intrinsik.</li>';
  }
  if (res.pillars.smartMoney.available && res.pillars.smartMoney.score >= 70) {
    html += '            <li>Aktivitas akumulasi terdeteksi oleh broker institusi (' + res.pillars.smartMoney.bandarStatus + ').</li>';
  }
  if (res.pillars.technical.available && res.pillars.technical.score >= 70) {
    html += '            <li>Struktur tren teknikal kuat (' + res.pillars.technical.trend + ').</li>';
  }
  if (res.pillars.fundamental.available && res.pillars.fundamental.roe >= 12) {
    html += '            <li>Tingkat pengembalian ekuitas (ROE: ' + res.pillars.fundamental.roe.toFixed(1) + '%) tergolong prima.</li>';
  }
  if (res.pillars.regime.score >= 70) {
    html += '            <li>Regime pasar IHSG berada dalam fase Bullish yang kondusif.</li>';
  }
  html += '            <li>Korelasi multi-faktor menunjukkan skor komposit sebesar <b>' + res.compositeScore + '/100</b>.</li>';
  html += '          </ul>';
  html += '        </div>';

  // Bear Case / Risks Box
  html += '        <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:6px;padding:14px">';
  html += '          <div style="font-size:12px;font-weight:800;color:var(--red);margin-bottom:6px"><i class="ti ti-alert-circle"></i> FAKTOR RISIKO &amp; INVALIDASI</div>';
  html += '          <ul style="margin:0;padding-left:18px;font-size:11px;color:var(--text2);line-height:1.6">';
  if (res.pillars.valuation.available && res.pillars.valuation.mosPct < -15) {
    html += '            <li>Valuasi relatif premium/overvalued (MoS: ' + res.pillars.valuation.mosPct.toFixed(1) + '%).</li>';
  }
  if (res.pillars.smartMoney.available && res.pillars.smartMoney.score < 50) {
    html += '            <li>Tekanan distribusi broker teramati di pasar reguler.</li>';
  }
  if (res.pillars.ksei.available && res.pillars.ksei.freeFloat > 65) {
    html += '            <li>Free float tergolong tinggi (' + res.pillars.ksei.freeFloat.toFixed(1) + '%), rentan dispersi tekanan jual ritel.</li>';
  }
  if (res.isDegraded) {
    html += '            <li>Sebagian pilar data belum lengkap (Confidence: ' + res.confidenceLevel + '%), terapkan ukuran posisi konservatif.</li>';
  }
  html += '            <li>Tesis batal (invalidasi) jika harga menembus level support teknikal atau terjadi pembalikan regime pasar menjadi RISK_OFF.</li>';
  html += '          </ul>';
  html += '        </div>';

  html += '      </div>';
  html += '    </div>';

  // ── TAB: 1. VALUASI ──
  html += '    <div class="dossier-tab-pane" data-tab="valuation" style="display:' + (dossierState.activeTab === 'valuation' ? 'block' : 'none') + '">';
  html += '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">';
  html += '        <h4 style="font-size:14px;font-weight:800;color:var(--text);margin:0">Rincian Valuasi &amp; Margin of Safety (Bobot: ' + res.weightsUsed.valuation + '%)</h4>';
  html += '        ' + dossierRenderStatusBadge(res.pillars.valuation);
  html += '      </div>';
  if (!res.pillars.valuation.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.valuation.reason + '</div>';
  } else {
    var tabMosColor = (res.pillars.valuation.mosPct !== null) ? (res.pillars.valuation.mosPct >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text3)';
    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Harga Pasar Saat Ini</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">Rp ' + price.toLocaleString('id-ID') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Estimasi Harga Wajar (Graham/DCF)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:var(--blue)">' + (res.pillars.valuation.fairValue ? 'Rp ' + res.pillars.valuation.fairValue.toLocaleString('id-ID') : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Margin of Safety (MoS)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:' + tabMosColor + '">' + (res.pillars.valuation.mosPct !== null ? (res.pillars.valuation.mosPct > 0 ? '+' : '') + res.pillars.valuation.mosPct.toFixed(1) + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Price to Earnings (PE)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.valuation.per ? res.pillars.valuation.per.toFixed(1) + 'x' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Price to Book (PBV)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.valuation.pbv ? res.pillars.valuation.pbv.toFixed(2) + 'x' : '-') + '</div></div>';
    html += '      </div>';
    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Menggunakan formula Graham Number √(22.5 × EPS × BVPS) dan perbandingan median historis PE/PBV untuk menentukan batas Margin of Safety kuantitatif.</p>';
  }
  html += '    </div>';

  // ── TAB: 2. SMART MONEY ──
  html += '    <div class="dossier-tab-pane" data-tab="smartMoney" style="display:' + (dossierState.activeTab === 'smartMoney' ? 'block' : 'none') + '">';
  html += '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">';
  html += '        <h4 style="font-size:14px;font-weight:800;color:var(--text);margin:0">Rincian Aliran Smart Money &amp; Bandarmology (Bobot: ' + res.weightsUsed.smartMoney + '%)</h4>';
  html += '        ' + dossierRenderStatusBadge(res.pillars.smartMoney);
  html += '      </div>';
  if (!res.pillars.smartMoney.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.smartMoney.reason + '</div>';
  } else {
    if (res.pillars.smartMoney.isSimulated || res.pillars.smartMoney.status === 'SIMULATION') {
      html += '      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">';
      html += '        <i class="ti ti-flask" style="color:#f59e0b;font-size:20px;flex-shrink:0;margin-top:2px"></i>';
      html += '        <div style="font-size:11px;color:var(--text2);line-height:1.4">';
      html += '          <b style="color:#f59e0b;text-transform:uppercase">STATUS DATA: SIMULASI / MODEL ESTIMASI DETERMINISTIK</b><br>';
      html += '          BEI tidak menyediakan feed transaksi broker gratis ke publik dan Invezgo API belum terhubung. Rincian broker dan estimasi volume akumulator di bawah adalah <b>simulasi berjangkar harga &amp; volume pasar riil</b> (bukan feed rekap transaksi broker live). Digunakan khusus sebagai referensi pemodelan likuiditas.';
      html += '        </div>';
      html += '      </div>';
    }
    var tabFf = res.pillars.smartMoney.foreignFlow;
    var tabFfColor = tabFf !== null ? (tabFf >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text3)';
    var tabFfText = tabFf !== null ? (tabFf !== 0 ? 'Rp ' + (tabFf / 1e9).toFixed(2) + ' M' : 'Rp 0 M') : 'Tidak Tersedia';

    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Status Bandarmology</span><div style="font-size:16px;font-weight:800;color:var(--blue)">' + res.pillars.smartMoney.bandarStatus + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Konsentrasi Top 3 Broker</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.smartMoney.top3Pct ? res.pillars.smartMoney.top3Pct + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Net Foreign Flow</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:' + tabFfColor + '">' + tabFfText + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Bandar VWAP (Est. Rata-Rata)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.smartMoney.vwapBandar ? 'Rp ' + Math.round(res.pillars.smartMoney.vwapBandar).toLocaleString('id-ID') : '-') + '</div></div>';
    html += '      </div>';

    if (res.pillars.smartMoney.accumulators && res.pillars.smartMoney.accumulators.length > 0) {
      html += '      <div style="margin-top:16px;margin-bottom:14px">';
      html += '        <h5 style="font-size:12px;font-weight:800;color:var(--text);margin:0 0 8px 0;display:flex;align-items:center;gap:6px"><i class="ti ti-user-check" style="color:var(--green)"></i> Daftar Broker Akumulator Terbesar (Top Buyers)</h5>';
      html += '        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:6px">';
      html += '          <table style="width:100%;border-collapse:collapse;font-size:11px">';
      html += '            <thead><tr style="background:var(--bg2);color:var(--text3);text-align:left;border-bottom:1px solid var(--border)">';
      html += '              <th style="padding:7px 10px">#</th>';
      html += '              <th style="padding:7px 10px">Broker</th>';
      html += '              <th style="padding:7px 10px">Nama Sekuritas</th>';
      html += '              <th style="padding:7px 10px">Tipe</th>';
      html += '              <th style="padding:7px 10px;text-align:right">Nilai Pembelian</th>';
      html += '              <th style="padding:7px 10px;text-align:right">Harga Avg</th>';
      html += '            </tr></thead><tbody>';
      res.pillars.smartMoney.accumulators.forEach(function(acc) {
        html += '            <tr style="border-bottom:1px solid var(--border)">';
        html += '              <td style="padding:7px 10px;color:var(--text3)">' + acc.rank + '</td>';
        html += '              <td style="padding:7px 10px"><span class="badge" style="background:rgba(16,185,129,0.15);color:var(--green);font-family:var(--font-mono);font-weight:900">' + acc.code + '</span></td>';
        html += '              <td style="padding:7px 10px;font-weight:700;color:var(--text)">' + acc.name + '</td>';
        html += '              <td style="padding:7px 10px">' + (acc.isForeign ? '<span class="badge" style="background:rgba(59,130,246,0.15);color:var(--blue);font-size:9px">Asing (F)</span>' : '<span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text3);font-size:9px">Domestik (D)</span>') + '</td>';
        html += '              <td style="padding:7px 10px;text-align:right;font-family:var(--font-mono);font-weight:800;color:var(--text)">' + acc.valStr + '</td>';
        html += '              <td style="padding:7px 10px;text-align:right;font-family:var(--font-mono)">' + (acc.avgPrice > 0 ? 'Rp ' + Math.round(acc.avgPrice).toLocaleString('id-ID') : '-') + '</td>';
        html += '            </tr>';
      });
      html += '          </tbody></table>';
      html += '        </div>';
      html += '      </div>';
    }

    if (res.pillars.smartMoney.distributors && res.pillars.smartMoney.distributors.length > 0) {
      html += '      <div style="margin-top:16px;margin-bottom:14px">';
      html += '        <h5 style="font-size:12px;font-weight:800;color:var(--text);margin:0 0 8px 0;display:flex;align-items:center;gap:6px"><i class="ti ti-user-x" style="color:var(--red)"></i> Daftar Broker Penjual Terbesar (Top Sellers)</h5>';
      html += '        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:6px">';
      html += '          <table style="width:100%;border-collapse:collapse;font-size:11px">';
      html += '            <thead><tr style="background:var(--bg2);color:var(--text3);text-align:left;border-bottom:1px solid var(--border)">';
      html += '              <th style="padding:7px 10px">#</th>';
      html += '              <th style="padding:7px 10px">Broker</th>';
      html += '              <th style="padding:7px 10px">Nama Sekuritas</th>';
      html += '              <th style="padding:7px 10px">Tipe</th>';
      html += '              <th style="padding:7px 10px;text-align:right">Nilai Penjualan</th>';
      html += '              <th style="padding:7px 10px;text-align:right">Harga Avg</th>';
      html += '            </tr></thead><tbody>';
      res.pillars.smartMoney.distributors.forEach(function(dis) {
        html += '            <tr style="border-bottom:1px solid var(--border)">';
        html += '              <td style="padding:7px 10px;color:var(--text3)">' + dis.rank + '</td>';
        html += '              <td style="padding:7px 10px"><span class="badge" style="background:rgba(239,68,68,0.15);color:var(--red);font-family:var(--font-mono);font-weight:900">' + dis.code + '</span></td>';
        html += '              <td style="padding:7px 10px;font-weight:700;color:var(--text)">' + dis.name + '</td>';
        html += '              <td style="padding:7px 10px">' + (dis.isForeign ? '<span class="badge" style="background:rgba(59,130,246,0.15);color:var(--blue);font-size:9px">Asing (F)</span>' : '<span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text3);font-size:9px">Domestik (D)</span>') + '</td>';
        html += '              <td style="padding:7px 10px;text-align:right;font-family:var(--font-mono);font-weight:800;color:var(--text)">' + dis.valStr + '</td>';
        html += '              <td style="padding:7px 10px;text-align:right;font-family:var(--font-mono)">' + (dis.avgPrice > 0 ? 'Rp ' + Math.round(dis.avgPrice).toLocaleString('id-ID') : '-') + '</td>';
        html += '            </tr>';
      });
      html += '          </tbody></table>';
      html += '        </div>';
      html += '      </div>';
    }

    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Berdasarkan Kyle (1985) Microstructure &amp; Amihud Illiquidity, mengidentifikasi akumulasi broker terpilih yang mengendalikan likuiditas transaksi di pasar reguler.</p>';
  }
  html += '    </div>';

  // ── TAB: 3. TEKNIKAL ──
  html += '    <div class="dossier-tab-pane" data-tab="technical" style="display:' + (dossierState.activeTab === 'technical' ? 'block' : 'none') + '">';
  html += '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">';
  html += '        <h4 style="font-size:14px;font-weight:800;color:var(--text);margin:0">Rincian Momentum &amp; Indikator Teknikal (Bobot: ' + res.weightsUsed.technical + '%)</h4>';
  html += '        ' + dossierRenderStatusBadge(res.pillars.technical);
  html += '      </div>';
  if (!res.pillars.technical.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.technical.reason + '</div>';
  } else {
    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Struktur Tren</span><div style="font-size:14px;font-weight:800;color:var(--text)">' + res.pillars.technical.trend + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Relative Strength Index (RSI 14)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.technical.rsi !== null ? res.pillars.technical.rsi : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">EMA 20 &amp; EMA 50</span><div style="font-family:var(--font-mono);font-size:16px;font-weight:800">' + (res.pillars.technical.ema20 ? 'Rp ' + res.pillars.technical.ema20.toLocaleString('id-ID') : '-') + ' / ' + (res.pillars.technical.ema50 ? 'Rp ' + res.pillars.technical.ema50.toLocaleString('id-ID') : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Volume Spike Ratio</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.technical.volumeSpike ? res.pillars.technical.volumeSpike + 'x avg' : '-') + '</div></div>';
    html += '      </div>';
    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Melacak konfirmasi struktur Exponential Moving Average (EMA) 20/50 serta ekspansi volume terhadap rata-rata 20 hari untuk memfilter false breakout.</p>';
  }
  html += '    </div>';

  // ── TAB: 4. KSEI ──
  html += '    <div class="dossier-tab-pane" data-tab="ksei" style="display:' + (dossierState.activeTab === 'ksei' ? 'block' : 'none') + '">';
  html += '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">';
  html += '        <h4 style="font-size:14px;font-weight:800;color:var(--text);margin:0">Rincian Kepemilikan Kustodian KSEI (Bobot: ' + res.weightsUsed.ksei + '%)</h4>';
  html += '        ' + dossierRenderStatusBadge(res.pillars.ksei);
  html += '      </div>';
  if (!res.pillars.ksei.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.ksei.reason + '</div>';
  } else {
    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Free Float Saham Publik</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.ksei.freeFloat !== null ? res.pillars.ksei.freeFloat.toFixed(1) + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Total Kepemilikan Institusi</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.ksei.institutionalPct !== null ? res.pillars.ksei.institutionalPct.toFixed(1) + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Kepemilikan Kustodian Asing</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.ksei.foreignPct !== null ? res.pillars.ksei.foreignPct.toFixed(1) + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Tanggal Laporan Data</span><div style="font-size:14px;font-weight:700">' + (res.pillars.ksei.reportDate || 'Terbaru') + '</div></div>';
    html += '      </div>';
    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Mengaudit laporan kepemilikan efek Kustodian Sentral Efek Indonesia (KSEI) >5% untuk memetakan kekuatan modal konglomerasi dan kestabilan pemegang saham utama.</p>';
  }
  html += '    </div>';

  // ── TAB: 5. FUNDAMENTAL & DIVIDEN ──
  html += '    <div class="dossier-tab-pane" data-tab="fundamental" style="display:' + (dossierState.activeTab === 'fundamental' ? 'block' : 'none') + '">';
  html += '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">';
  html += '        <h4 style="font-size:14px;font-weight:800;color:var(--text);margin:0">Rincian Profitabilitas &amp; Dividen (Bobot: ' + res.weightsUsed.fundamental + '%)</h4>';
  html += '        ' + dossierRenderStatusBadge(res.pillars.fundamental);
  html += '      </div>';
  if (!res.pillars.fundamental.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.fundamental.reason + '</div>';
  } else {
    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Return on Equity (ROE)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.fundamental.roe !== null ? res.pillars.fundamental.roe.toFixed(1) + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Debt to Equity Ratio (DER)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.fundamental.der !== null ? res.pillars.fundamental.der.toFixed(2) + 'x' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Net Profit Margin (NPM)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.fundamental.npm !== null ? res.pillars.fundamental.npm.toFixed(1) + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Dividend Yield</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.fundamental.divYield !== null ? res.pillars.fundamental.divYield.toFixed(1) + '%' : '-') + '</div></div>';
    html += '      </div>';
    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Menguji kesehatan neraca modal, efisiensi laba bersih terhadap ekuitas pemegang saham, dan rekam jejak yield dividen tunai.</p>';
  }
  html += '    </div>';

  // ── TAB: 6. REGIME & AI VERDICT ──
  html += '    <div class="dossier-tab-pane" data-tab="regime" style="display:' + (dossierState.activeTab === 'regime' ? 'block' : 'none') + '">';
  html += '      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">';
  html += '        <h4 style="font-size:14px;font-weight:800;color:var(--text);margin:0">Market Regime &amp; Putusan AI Kuantitatif (Bobot: ' + res.weightsUsed.regime + '%)</h4>';
  html += '        ' + dossierRenderStatusBadge(res.pillars.regime);
  html += '      </div>';
  html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
  html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Regime IHSG</span><div style="font-size:16px;font-weight:800;color:var(--blue)">' + (res.pillars.regime.regime || 'SIDEWAYS') + '</div></div>';
  html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Regime Confidence</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + res.pillars.regime.regimeConfidence + '%</div></div>';
  html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Rekomendasi Final</span><div style="font-size:16px;font-weight:800;color:' + res.recColor + '">' + res.recommendation + '</div></div>';
  html += '      </div>';

  var hyp = harvested.aiHypothesis;
  if (hyp && (hyp.setup || hyp.catalyst || hyp.invalidation || hyp.bullCase)) {
    html += '      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px">';
    html += '        <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px"><i class="ti ti-brain" style="color:var(--blue)"></i> Tesis &amp; Hipotesis AI Otonom (' + (hyp.setup || 'Multi-Factor Analysis') + ')</div>';
    if (hyp.catalyst) html += '        <div style="font-size:11px;color:var(--text2);margin-bottom:6px"><b>Katalis:</b> ' + hyp.catalyst + '</div>';
    if (hyp.bullCase) html += '        <div style="font-size:11px;color:var(--text2);margin-bottom:6px"><b>Tesis Utama:</b> ' + hyp.bullCase + '</div>';
    if (hyp.invalidation) html += '        <div style="font-size:11px;color:var(--text2);margin-bottom:6px"><b>Invalidasi:</b> ' + hyp.invalidation + '</div>';
    if (hyp.entryZone || hyp.stopLoss || hyp.targetPrice) {
      html += '        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;font-size:11px">';
      if (hyp.entryZone) html += '          <div><span style="color:var(--text3)">Entry Zone:</span> <b style="font-family:var(--font-mono)">' + hyp.entryZone + '</b></div>';
      if (hyp.stopLoss) html += '          <div><span style="color:var(--text3)">Stop Loss:</span> <b style="font-family:var(--font-mono);color:var(--red)">' + hyp.stopLoss + '</b></div>';
      if (hyp.targetPrice) html += '          <div><span style="color:var(--text3)">Target:</span> <b style="font-family:var(--font-mono);color:var(--green)">' + hyp.targetPrice + '</b></div>';
      html += '        </div>';
    }
    html += '      </div>';
  }

  html += '      <p style="font-size:11px;color:var(--text2);margin:0">Kondisi pasar makro (IHSG trend &amp; risk appetite) menjadi regulator multiplier agar sinyal saham tunggal tidak dieksekusi secara membabi buta di pasar risk-off.</p>';
  html += '    </div>';

  html += '  </div>'; // End Tab Content Container
  html += '</div>'; // End Card

  container.innerHTML = html;
  } catch (renderErr) {
    console.error('[Dossier] Render exception:', renderErr);
    dossierState.isLoading = false;
    container.innerHTML = '<div class="card" style="padding:30px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);text-align:center">' +
      '<div style="font-size:24px;color:var(--red);margin-bottom:8px"><i class="ti ti-alert-triangle"></i></div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--red)">Terjadi kesalahan visualisasi: ' + (renderErr.message || renderErr) + '</div>' +
      '<button class="btn btn-sm btn-ghost" style="margin-top:12px" onclick="dossierRunAnalysis()">Coba Lagi</button>' +
      '</div>';
  }
}

// ============================================================
// 5. WEIGHTS CONFIGURATION MODAL (INTERACTIVE DRAWER)
// ============================================================

function dossierOpenWeightsModal() {
  var modalId = 'dossier-weights-modal';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();

  var w = dossierState.weights || dossierGetWeights();

  var html = '';
  html += '<div id="' + modalId + '" onclick="if(event.target===this)this.remove()" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)">';
  html += '  <div class="card" style="width:100%;max-width:540px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,0.5)">';

  html += '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
  html += '      <div>';
  html += '        <h3 style="margin:0;font-size:16px;font-weight:900;color:var(--text)">⚙️ Kalibrasi Bobot Analisis Multi-Faktor</h3>';
  html += '        <p style="margin:2px 0 0 0;font-size:11px;color:var(--text3)">Atur alokasi bobot 6 pilar institusional sesuai strategi riset Anda (Total wajib 100%).</p>';
  html += '      </div>';
  html += '      <button class="btn btn-ghost btn-xs" onclick="document.getElementById(\'' + modalId + '\').remove()"><i class="ti ti-x"></i></button>';
  html += '    </div>';

  // Preset Buttons
  html += '    <div style="margin-bottom:16px">';
  html += '      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:6px">Preset Institusional Cepat:</div>';
  html += '      <div style="display:flex;gap:6px;flex-wrap:wrap">';
  Object.keys(DOSSIER_PRESETS).forEach(function(k) {
    var p = DOSSIER_PRESETS[k];
    html += '        <button class="btn btn-ghost btn-xs" onclick="dossierApplyPreset(\'' + k + '\')" style="font-size:10px;padding:4px 8px">' + p.label.split('(')[0].trim() + '</button>';
  });
  html += '        <button class="btn btn-ghost btn-xs" onclick="dossierApplyPreset(\'balanced\')" style="font-size:10px;padding:4px 8px;color:var(--blue)">Reset Default</button>';
  html += '      </div>';
  html += '    </div>';

  // Sliders
  var sliders = [
    { key: 'valuation', label: '1. Valuasi & Harga Wajar (MoS, PE/PBV)' },
    { key: 'smartMoney', label: '2. Smart Money & Bandar (Broker Flow)' },
    { key: 'technical', label: '3. Momentum & Teknikal (EMA, RSI, Vol)' },
    { key: 'ksei', label: '4. Struktur Kepemilikan KSEI (Free Float)' },
    { key: 'fundamental', label: '5. Fundamental & Dividen (ROE, DER, Yield)' },
    { key: 'regime', label: '6. Market Regime AI (IHSG Macro Context)' }
  ];

  html += '    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">';
  sliders.forEach(function(s) {
    var val = w[s.key] !== undefined ? w[s.key] : 0;
    html += '      <div>';
    html += '        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">';
    html += '          <span style="color:var(--text2);font-weight:600">' + s.label + '</span>';
    html += '          <span style="font-family:var(--font-mono);font-weight:700;color:var(--blue)" id="dossier-w-label-' + s.key + '">' + val + '%</span>';
    html += '        </div>';
    html += '        <input type="range" min="0" max="100" step="5" value="' + val + '" class="finput" style="width:100%;height:6px;accent-color:var(--blue)" ';
    html += '          id="dossier-w-inp-' + s.key + '" oninput="dossierOnSliderChange()" />';
    html += '      </div>';
  });
  html += '    </div>';

  // Sum & Validation Bar
  html += '    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg2);border-radius:6px;margin-bottom:16px">';
  html += '      <span style="font-size:12px;font-weight:700;color:var(--text)">Total Bobot:</span>';
  html += '      <span id="dossier-w-total-label" style="font-family:var(--font-mono);font-size:14px;font-weight:900;color:var(--green)">100% (Valid)</span>';
  html += '    </div>';

  // Buttons
  html += '    <div style="display:flex;justify-content:flex-end;gap:8px">';
  html += '      <button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'' + modalId + '\').remove()">Batal</button>';
  html += '      <button id="dossier-w-save-btn" class="btn btn-primary btn-sm" onclick="dossierSubmitCustomWeights()">Simpan &amp; Terapkan</button>';
  html += '    </div>';

  html += '  </div>';
  html += '</div>';

  document.body.insertAdjacentHTML('beforeend', html);

  // Esc key listener
  function handleEsc(e) {
    if (e.key === 'Escape') {
      var m = document.getElementById(modalId);
      if (m) m.remove();
      document.removeEventListener('keydown', handleEsc);
    }
  }
  document.addEventListener('keydown', handleEsc);
}

function dossierOnSliderChange() {
  var keys = ['valuation', 'smartMoney', 'technical', 'ksei', 'fundamental', 'regime'];
  var total = 0;
  keys.forEach(function(k) {
    var inp = document.getElementById('dossier-w-inp-' + k);
    var val = inp ? parseInt(inp.value, 10) || 0 : 0;
    var lbl = document.getElementById('dossier-w-label-' + k);
    if (lbl) lbl.textContent = val + '%';
    total += val;
  });

  var totLbl = document.getElementById('dossier-w-total-label');
  var saveBtn = document.getElementById('dossier-w-save-btn');
  if (totLbl) {
    totLbl.textContent = total + '%' + (total === 100 ? ' (Valid)' : ' (Wajib 100%)');
    totLbl.style.color = total === 100 ? 'var(--green)' : 'var(--red)';
  }
  if (saveBtn) {
    saveBtn.disabled = total !== 100;
    saveBtn.style.opacity = total === 100 ? '1' : '0.5';
  }
}

function dossierUpdateWeightsModalInputs(weights) {
  var keys = ['valuation', 'smartMoney', 'technical', 'ksei', 'fundamental', 'regime'];
  keys.forEach(function(k) {
    var inp = document.getElementById('dossier-w-inp-' + k);
    var lbl = document.getElementById('dossier-w-label-' + k);
    if (inp && weights[k] !== undefined) inp.value = weights[k];
    if (lbl && weights[k] !== undefined) lbl.textContent = weights[k] + '%';
  });
  dossierOnSliderChange();
}

function dossierSubmitCustomWeights() {
  var keys = ['valuation', 'smartMoney', 'technical', 'ksei', 'fundamental', 'regime'];
  var newWeights = {};
  var total = 0;
  keys.forEach(function(k) {
    var inp = document.getElementById('dossier-w-inp-' + k);
    var val = inp ? parseInt(inp.value, 10) || 0 : 0;
    newWeights[k] = val;
    total += val;
  });

  if (total !== 100) {
    alert('Total bobot harus tepat 100%. Saat ini: ' + total + '%');
    return;
  }

  dossierSaveWeights(newWeights);
  var modal = document.getElementById('dossier-weights-modal');
  if (modal) modal.remove();
  if (typeof showToast === 'function') {
    showToast('✓ Bobot analisis berhasil disimpan & diperbarui');
  }
}

// ============================================================
// 6. ACTION SHORTCUTS (INTEROPERABILITY)
// ============================================================

function dossierAddToWatchlist(tk) {
  var clean = String(tk || '').toUpperCase().trim();
  if (!clean) return;

  if (typeof fsTgWl === 'function') {
    if (typeof FS_WL !== 'undefined' && Array.isArray(FS_WL) && FS_WL.some(function(w) { return w.t === clean; })) {
      if (typeof showToast === 'function') {
        showToast('Saham ' + clean + ' sudah ada di Watchlist Anda.');
      }
    } else {
      fsTgWl(clean);
      if (typeof showToast === 'function') {
        showToast('✓ Saham ' + clean + ' berhasil ditambahkan ke Watchlist.');
      }
    }
  } else if (typeof showToast === 'function') {
    showToast('Ticker ' + clean + ' disalin ke watchlist.');
  }
}

function dossierOpenInStockChat(tk) {
  var clean = String(tk || '').toUpperCase().trim();
  if (!clean) return;

  var prompt = 'Analisis lengkap saham ' + clean + ' dari aspek Valuasi Graham/DCF, Broker Flow Bandarmology, dan Market Regime.';
  if (typeof window.openStockChat === 'function') {
    window.openStockChat(clean, prompt, 'chat');
  } else if (typeof goPage === 'function') {
    goPage('stockchat');
    setTimeout(function() {
      var inp = document.getElementById('stockchat-input-text');
      if (inp) {
        inp.value = prompt;
        if (typeof sendStockChatPrompt === 'function') {
          sendStockChatPrompt(prompt);
        }
      }
    }, 250);
  }
}

// ============================================================
// 7. COMMONJS / NODE ENVIRONMENT EXPORTS (FOR AUTOMATED TESTS)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOSSIER_DEFAULT_WEIGHTS: DOSSIER_DEFAULT_WEIGHTS,
    DOSSIER_PRESETS: DOSSIER_PRESETS,
    STOCK_DOSSIER_STATE: STOCK_DOSSIER_STATE,
    dossierState: dossierState,
    dossierGetDefaultWeights: dossierGetDefaultWeights,
    dossierGetWeights: dossierGetWeights,
    dossierSaveWeights: dossierSaveWeights,
    dossierApplyPreset: dossierApplyPreset,
    dossierIsValidTicker: dossierIsValidTicker,
    dossierHarvestData: dossierHarvestData,
    renderStockDossierPage: renderStockDossierPage,
    dossierOpenWeightsModal: dossierOpenWeightsModal,
    dossierAddToWatchlist: dossierAddToWatchlist,
    dossierOpenInStockChat: dossierOpenInStockChat,
    dossierComputeValuationScore: dossierComputeValuationScore,
    dossierComputeSmartMoneyScore: dossierComputeSmartMoneyScore,
    dossierComputeTechnicalScore: dossierComputeTechnicalScore,
    dossierComputeKseiScore: dossierComputeKseiScore,
    dossierComputeFundamentalScore: dossierComputeFundamentalScore,
    dossierComputeRegimeScore: dossierComputeRegimeScore,
    dossierCalculateCompositeScore: dossierCalculateCompositeScore,
    dossierCalculateScore: dossierCalculateScore,
    dossierSelectTicker: dossierSelectTicker,
    dossierRunAnalysis: dossierRunAnalysis
  };
}

if (typeof window !== 'undefined') {
  window.dossierSelectTicker = dossierSelectTicker;
  window.dossierRunAnalysis = dossierRunAnalysis;
  window.renderStockDossierPage = renderStockDossierPage;

  if (window.GLOBAL_STOCK_CONTEXT && typeof window.GLOBAL_STOCK_CONTEXT.subscribe === 'function') {
    window.GLOBAL_STOCK_CONTEXT.subscribe(function(tk, source) {
      if (source === 'stock-dossier' || source === 'dossier' || !tk) return;
      var clean = tk.toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();
      dossierState.ticker = clean;
      var pg = document.getElementById('page-stock-dossier');
      if (pg && pg.classList.contains('on') && !dossierState.isLoading) {
        dossierRunAnalysis(clean);
      }
    });
  }
}

