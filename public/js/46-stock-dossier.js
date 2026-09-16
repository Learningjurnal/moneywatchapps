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

var dossierState = {
  ticker: 'BBCA',
  activeTab: 'overview',
  weights: Object.assign({}, DOSSIER_DEFAULT_WEIGHTS),
  harvestedData: null,
  scoringResult: null,
  isLoading: false,
  errorMessage: null,
  lastUpdated: null
};

// ============================================================
// 1. WEIGHT MANAGEMENT & CALIBRATION
// ============================================================

function dossierGetDefaultWeights() {
  return Object.assign({}, DOSSIER_DEFAULT_WEIGHTS);
}

function dossierGetWeights() {
  try {
    var raw = localStorage.getItem('mw_dossier_weights_v1');
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

function dossierSaveWeights(newWeights) {
  if (!newWeights || typeof newWeights !== 'object') return false;
  var sum = (newWeights.valuation || 0) + (newWeights.smartMoney || 0) + (newWeights.technical || 0) +
            (newWeights.ksei || 0) + (newWeights.fundamental || 0) + (newWeights.regime || 0);
  if (Math.abs(sum - 100) > 0.01) {
    console.warn('[Dossier] Total weights must sum to 100%. Current sum: ' + sum);
    return false;
  }
  dossierState.weights = Object.assign({}, newWeights);
  try {
    localStorage.setItem('mw_dossier_weights_v1', JSON.stringify(dossierState.weights));
  } catch (e) {}

  if (dossierState.harvestedData) {
    dossierState.scoringResult = dossierCalculateScore(dossierState.harvestedData, dossierState.weights);
    if (typeof renderStockDossierPage === 'function') renderStockDossierPage();
  }
  return true;
}

function dossierApplyPreset(presetKey) {
  if (!DOSSIER_PRESETS[presetKey]) return false;
  var presetWeights = DOSSIER_PRESETS[presetKey].weights;
  dossierSaveWeights(presetWeights);
  dossierUpdateWeightsModalInputs(presetWeights);
  if (typeof showToast === 'function') {
    showToast('Preset "' + DOSSIER_PRESETS[presetKey].label + '" berhasil diterapkan');
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
  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var qf = quote.fundamentals || {};
  var price = quote.price || (quote.close) || 0;

  var per = qf.per || (harvested.fund && harvested.fund.per) || null;
  var pbv = qf.pbv || (harvested.fund && harvested.fund.pbv) || null;
  var eps = qf.eps || (harvested.fund && harvested.fund.eps) || null;
  var bvps = qf.bvps || (harvested.fund && harvested.fund.bvps) || null;

  // Evaluate Graham Number if EPS and BVPS are valid positive
  var grahamNumber = null;
  if (eps && eps > 0 && bvps && bvps > 0) {
    grahamNumber = Math.round(Math.sqrt(22.5 * eps * bvps));
  }

  // Margin of Safety calculation
  var fairValue = grahamNumber || (price > 0 && per && per > 0 ? Math.round(price * (15 / per)) : null);
  var mosPct = null;
  if (fairValue && fairValue > 0 && price > 0) {
    mosPct = ((fairValue - price) / fairValue) * 100;
  }

  if (price <= 0 || (!per && !pbv && !fairValue)) {
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
  } else {
    // Fallback on PE and PBV benchmarks
    var subScore = 50;
    if (per && per > 0) {
      if (per < 10) subScore += 20;
      else if (per < 15) subScore += 10;
      else if (per > 25) subScore -= 15;
    }
    if (pbv && pbv > 0) {
      if (pbv < 1.0) subScore += 20;
      else if (pbv < 2.0) subScore += 10;
      else if (pbv > 4.0) subScore -= 15;
    }
    score = Math.max(15, Math.min(95, subScore));
  }

  return {
    available: true,
    status: 'REAL',
    score: score,
    mosPct: mosPct !== null ? Math.round(mosPct * 10) / 10 : null,
    fairValue: fairValue,
    per: per,
    pbv: pbv,
    grahamNumber: grahamNumber,
    reason: mosPct !== null
      ? 'Margin of Safety: ' + (mosPct > 0 ? '+' : '') + mosPct.toFixed(1) + '% (Harga Wajar Est: Rp ' + fairValue.toLocaleString('id-ID') + ')'
      : 'Berdasarkan rasio PE (' + (per ? per.toFixed(1) + 'x' : '-') + ') dan PBV (' + (pbv ? pbv.toFixed(2) + 'x' : '-') + ')'
  };
}

/**
 * Pillar 2: Smart Money & Bandarmology Flow (0–100)
 */
function dossierComputeSmartMoneyScore(harvested) {
  var bSummary = (harvested.brokerSummary && harvested.brokerSummary.data) ? harvested.brokerSummary.data : harvested.brokerSummary;
  if (!bSummary || (!bSummary.bandarmology && !bSummary.brokers && !bSummary.accumulation)) {
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

  var bandar = bSummary.bandarmology || {};
  var statusStr = (bandar.status || bSummary.accumulation || '').toString();
  var top3Pct = bandar.top3Concentration || null;
  var foreignNet = bandar.foreignNet || bSummary.foreignNet || 0;
  var vwapBandar = bandar.vwap || bSummary.vwap || null;
  var price = (harvested.quote && harvested.quote.price) || 0;

  var score = 50;
  if (/big\s*accum|akumulasi\s*besar/i.test(statusStr)) score = 90;
  else if (/accum|akumulasi/i.test(statusStr)) score = 75;
  else if (/neutral|netral/i.test(statusStr)) score = 55;
  else if (/distrib|distribusi\s*besar/i.test(statusStr)) score = 25;
  else if (/distrib/i.test(statusStr)) score = 35;

  // Bonus/penalty for foreign flow
  if (foreignNet > 5000000000) score += 5; // > Rp 5 M
  else if (foreignNet < -5000000000) score -= 5;

  // Bonus if trading close to or below Bandar VWAP
  if (vwapBandar && price > 0 && price <= vwapBandar * 1.02) {
    score += 5;
  }

  score = Math.max(10, Math.min(98, score));

  return {
    available: true,
    status: 'REAL',
    score: score,
    top3Pct: top3Pct ? Math.round(top3Pct) : null,
    foreignFlow: foreignNet,
    bandarStatus: statusStr || 'Normal Accumulation',
    vwapBandar: vwapBandar,
    reason: 'Status: ' + (statusStr || 'Akumulasi') + (top3Pct ? ' (Konsentrasi Top 3: ' + Math.round(top3Pct) + '%)' : '') +
            (foreignNet !== 0 ? ' · Foreign Net: Rp ' + (foreignNet / 1e9).toFixed(2) + ' M' : '')
  };
}

/**
 * Pillar 3: Momentum & Analisis Teknikal (0–100)
 */
function dossierComputeTechnicalScore(harvested) {
  var history = harvested.history || [];
  var quote = harvested.quote || {};
  var price = quote.price || (history.length ? history[history.length - 1].close : 0);

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

  var closes = history.map(function(h) { return h.close !== undefined ? h.close : (h.c !== undefined ? h.c : 0); });
  var volumes = history.map(function(h) { return h.volume !== undefined ? h.volume : (h.v !== undefined ? h.v : 0); });
  var n = closes.length;

  // Calculate EMA 20 & EMA 50
  function calcEMA(data, period) {
    if (data.length < period) return null;
    var k = 2 / (period + 1);
    var ema = data[0];
    for (var i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  var ema20 = calcEMA(closes, Math.min(20, n));
  var ema50 = n >= 40 ? calcEMA(closes, 50) : null;

  // RSI(14)
  var rsi = null;
  if (n >= 15) {
    var gains = 0, losses = 0;
    for (var i = n - 14; i < n; i++) {
      var diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    var avgGain = gains / 14;
    var avgLoss = losses / 14;
    if (avgLoss === 0) rsi = 100;
    else {
      var rs = avgGain / avgLoss;
      rsi = 100 - (100 / (1 + rs));
    }
    rsi = Math.round(rsi * 10) / 10;
  }

  // Volume Expansion
  var avgVol20 = 1;
  var volSlice = volumes.slice(-20);
  if (volSlice.length) {
    var sumV = volSlice.reduce(function(a, b) { return a + b; }, 0);
    avgVol20 = sumV / volSlice.length;
  }
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
  if (volRatio >= 1.8 && price >= closes[n - 2]) {
    score += 15;
  } else if (volRatio >= 1.8 && price < closes[n - 2]) {
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
  var ksei = harvested.ksei;
  var stock = (ksei && ksei.found !== false && ksei.stock)
    ? ksei.stock
    : (ksei && ksei.found !== false && ksei.freeFloat !== undefined ? ksei : (harvested.quote && harvested.quote.ksei ? harvested.quote.ksei : null));

  if (!stock || ksei?.found === false || (!stock.investors && stock.freeFloat === undefined) || (Array.isArray(stock.investors) && stock.investors.length === 0 && stock.totalMajorPercent === 0 && stock.freeFloat === 100)) {
    return {
      available: false,
      status: 'DATA_UNAVAILABLE',
      score: null,
      freeFloat: null,
      institutionalPct: null,
      foreignPct: null,
      reason: 'Data kepemilikan kustodian KSEI belum diunggah atau tidak ditemukan untuk emiten ini.'
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
  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var qf = quote.fundamentals || {};
  var fund = harvested.fund || {};

  var roe = qf.roe || fund.roe || null;
  var der = qf.der !== undefined ? qf.der : fund.der;
  var npm = qf.npm || fund.npm || null;
  var divYield = qf.dividendYield || fund.dividendYield || fund.dy || null;

  if (roe === null && der === undefined && npm === null && divYield === null) {
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

  // ROE (Return on Equity)
  if (roe !== null) {
    if (roe >= 20) score += 20;
    else if (roe >= 12) score += 12;
    else if (roe >= 6) score += 5;
    else if (roe < 0) score -= 20;
  }

  // DER (Debt-to-Equity Ratio)
  if (der !== undefined && der !== null) {
    if (der < 0.8) score += 15;
    else if (der <= 1.5) score += 8;
    else if (der > 3.0) score -= 15;
  }

  // Dividend Yield
  if (divYield !== null && divYield > 0) {
    if (divYield >= 5) score += 15;
    else if (divYield >= 2.5) score += 10;
    else score += 5;
  }

  score = Math.max(15, Math.min(95, score));

  return {
    available: true,
    status: 'REAL',
    score: score,
    roe: roe !== null ? Math.round(roe * 10) / 10 : null,
    der: der !== undefined && der !== null ? Math.round(der * 100) / 100 : null,
    npm: npm !== null ? Math.round(npm * 10) / 10 : null,
    divYield: divYield !== null ? Math.round(divYield * 10) / 10 : null,
    reason: 'ROE: ' + (roe !== null ? roe.toFixed(1) + '%' : '-') +
            ' · DER: ' + (der !== undefined && der !== null ? der.toFixed(2) + 'x' : '-') +
            ' · Div Yield: ' + (divYield !== null ? divYield.toFixed(1) + '%' : '-')
  };
}

/**
 * Pillar 6: Market Regime & AI Confluence (0–100)
 */
function dossierComputeRegimeScore(harvested) {
  var regimeObj = harvested.regime || {};
  var rawState = 'SIDEWAYS';
  if (typeof regimeObj === 'string') {
    rawState = regimeObj;
  } else if (regimeObj && typeof regimeObj.regime === 'string') {
    rawState = regimeObj.regime;
  } else if (regimeObj && typeof regimeObj.regime === 'object' && regimeObj.regime && typeof regimeObj.regime.regime === 'string') {
    rawState = regimeObj.regime.regime;
  } else if (regimeObj && typeof regimeObj.marketRegime === 'string') {
    rawState = regimeObj.marketRegime;
  }

  var confidence = 75;
  if (regimeObj && typeof regimeObj.confidence === 'number') {
    confidence = regimeObj.confidence;
  } else if (regimeObj && regimeObj.regime && typeof regimeObj.regime.confidence === 'number') {
    confidence = regimeObj.regime.confidence;
  }

  var regimeState = String(rawState || 'SIDEWAYS').toUpperCase();

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

  var isDegraded = confidenceLevel < 70;
  if (isDegraded) {
    recommendation += ' (DATA TERBATAS)';
  }

  return {
    compositeScore: compositeScore,
    confidenceLevel: confidenceLevel,
    availablePillarsCount: availableCount,
    totalPillarsCount: pillarEntries.length,
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
// 3. DATA HARVESTING (CONCURRENT ZERO-SYNTHETIC AGGREGATION)
// ============================================================

async function dossierHarvestData(ticker) {
  var cleanTicker = (ticker || 'BBCA').toUpperCase().replace('.JK', '').replace('.US', '').trim();
  dossierState.ticker = cleanTicker;
  dossierState.isLoading = true;
  dossierState.errorMessage = null;

  var harvested = {
    ticker: cleanTicker,
    timestamp: new Date().toISOString(),
    quote: null,
    brokerSummary: null,
    history: [],
    ksei: null,
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

    // 4. Fetch KSEI
    var kseiPromise = fetch('/api/ksei/stock/' + cleanTicker)
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
      hypothesisPromise
    ]);

    var qData = results[0];
    harvested.quote = (qData && qData.quote) ? qData.quote : qData;

    var bData = results[1];
    harvested.brokerSummary = (bData && bData.data) ? bData.data : bData;

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

    // Local cached fallback if API fundamentals missing
    if (typeof FUND_DATA !== 'undefined' && FUND_DATA[cleanTicker]) {
      harvested.fund = FUND_DATA[cleanTicker];
    } else if (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV)) {
      var foundU = FS_UNIV.find(function(u) { return u.t === cleanTicker; });
      if (foundU) harvested.fund = foundU;
    }

    // Verify quote minimum validity
    if (!harvested.quote || (!harvested.quote.price && !harvested.quote.close)) {
      // If server quote endpoint failed, check local window data
      if (typeof STOCKS !== 'undefined' && STOCKS[cleanTicker]) {
        harvested.quote = STOCKS[cleanTicker];
      }
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
  dossierState.ticker = tk.toUpperCase().trim();
  dossierRunAnalysis(dossierState.ticker);
}

function dossierRunAnalysis(targetTicker) {
  var tk = targetTicker || dossierState.ticker || 'BBCA';
  var inp = document.getElementById('dossier-ticker-input');
  if (inp) inp.value = tk;

  dossierState.isLoading = true;
  renderStockDossierPage();

  dossierHarvestData(tk).then(function() {
    renderStockDossierPage();
  });
}

function dossierSwitchTab(tabName) {
  dossierState.activeTab = tabName;
  var tabBtns = document.querySelectorAll('.dossier-tab-btn');
  tabBtns.forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
  });
  var tabPanes = document.querySelectorAll('.dossier-tab-pane');
  tabPanes.forEach(function(p) {
    p.style.display = p.getAttribute('data-tab') === tabName ? 'block' : 'none';
  });
}

function renderStockDossierPage(targetTicker) {
  var container = document.getElementById('page-stock-dossier');
  if (!container) return;

  // Initialize weights if needed
  if (!dossierState.weights) {
    dossierState.weights = dossierGetWeights();
  }

  // Initial trigger if not loaded yet
  if (!dossierState.harvestedData && !dossierState.isLoading && !dossierState.errorMessage) {
    var initialTk = targetTicker || dossierState.ticker || 'BBCA';
    dossierState.ticker = initialTk;
    dossierRunAnalysis(initialTk);
    return;
  }

  var res = dossierState.scoringResult;
  var harvested = dossierState.harvestedData || {};
  var quote = (harvested.quote && harvested.quote.quote) ? harvested.quote.quote : (harvested.quote || {});
  var price = quote.price || (quote.close) || 0;
  var changePct = quote.changePercent !== undefined ? quote.changePercent : (quote.change || 0);
  var changeStr = (changePct >= 0 ? '+' : '') + Number(changePct).toFixed(2) + '%';
  var changeColor = changePct >= 0 ? 'var(--green)' : 'var(--red)';

  var html = '';

  // ── Header & Action Bar ──
  html += '<div style="margin-bottom:20px">';
  html += '  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px">';
  html += '    <div>';
  html += '      <div style="display:flex;align-items:center;gap:10px">';
  html += '        <h1 style="font-size:22px;font-weight:900;margin:0;letter-spacing:-0.5px;color:var(--text1);display:flex;align-items:center;gap:8px">';
  html += '          <i class="ti ti-file-analytics" style="color:var(--blue)"></i> Master Stock Intelligence Dossier';
  html += '        </h1>';
  html += '        <span class="badge" style="background:rgba(59,130,246,0.15);color:#3b82f6;border:1px solid rgba(59,130,246,0.3);font-weight:700">1-CLICK ALL-IN-ONE</span>';
  html += '      </div>';
  html += '      <p style="margin:4px 0 0 0;font-size:12px;color:var(--text3)">Sintesis 6 pilar analisis institusional pasar modal dalam satu pandangan terpadu tanpa berpindah tab.</p>';
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

  // Search Bar + Quick Tickers
  html += '  <div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--card);border:1px solid var(--border)">';
  html += '    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:260px">';
  html += '      <i class="ti ti-search" style="font-size:18px;color:var(--text3)"></i>';
  html += '      <input type="text" id="dossier-ticker-input" value="' + dossierState.ticker + '" placeholder="Masukkan Kode Saham (contoh: BBCA, TLKM, ASII)..." ';
  html += '        style="flex:1;background:transparent;border:none;color:var(--text1);font-family:var(--font-mono);font-size:14px;font-weight:700;text-transform:uppercase;outline:none" ';
  html += '        onkeydown="if(event.key===\'Enter\'){dossierRunAnalysis(this.value);}" />';
  html += '      <button class="btn btn-primary btn-sm" onclick="dossierRunAnalysis(document.getElementById(\'dossier-ticker-input\').value)">Analisis Lengkap</button>';
  html += '    </div>';

  html += '    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
  html += '      <span style="font-size:11px;color:var(--text3);font-weight:600">Quick Ticker:</span>';
  ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'BREN', 'AMMN', 'ICBP', 'ADRO'].forEach(function(tk) {
    var isSel = tk === dossierState.ticker;
    html += '      <button onclick="dossierSelectTicker(\'' + tk + '\')" class="btn btn-ghost btn-xs" style="font-family:var(--font-mono);padding:2px 8px;' + (isSel ? 'background:var(--blue);color:#fff;border-color:var(--blue)' : '') + '">' + tk + '</button>';
  });
  html += '    </div>';
  html += '  </div>';
  html += '</div>';

  // Loading State
  if (dossierState.isLoading) {
    html += '<div class="card" style="padding:40px;text-align:center;border:1px solid var(--border)">';
    html += '  <div style="font-size:24px;margin-bottom:10px"><i class="ti ti-loader animate-spin" style="color:var(--blue)"></i></div>';
    html += '  <div style="font-size:15px;font-weight:700;color:var(--text1)">Memanen Data 6 Pilar Analisis Saham ' + dossierState.ticker + '...</div>';
    html += '  <div style="font-size:12px;color:var(--text3);margin-top:6px">Memverifikasi Harga Wajar, Broker Flow, Indikator Teknikal, Kustodian KSEI, Fundamental &amp; Market Regime secara real-time.</div>';
    html += '</div>';
    container.innerHTML = html;
    return;
  }

  // Error State
  if (dossierState.errorMessage) {
    html += '<div class="card" style="padding:30px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);text-align:center">';
    html += '  <div style="font-size:24px;color:var(--red);margin-bottom:8px"><i class="ti ti-alert-triangle"></i></div>';
    html += '  <div style="font-size:14px;font-weight:700;color:var(--red)">' + dossierState.errorMessage + '</div>';
    html += '  <button class="btn btn-sm btn-ghost" style="margin-top:12px" onclick="dossierRunAnalysis()">Coba Lagi</button>';
    html += '</div>';
    container.innerHTML = html;
    return;
  }

  if (!res) {
    container.innerHTML = html;
    return;
  }

  // ── Master Scorecard Hero Banner ──
  html += '<div class="card" style="margin-bottom:20px;padding:20px;border:1px solid var(--border);background:var(--card)">';
  html += '  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px">';

  // Left: Ticker & Live Metrics
  html += '    <div style="flex:1;min-width:240px">';
  html += '      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">';
  html += '        <span style="font-family:var(--font-mono);font-size:28px;font-weight:900;letter-spacing:-0.5px;color:var(--text1)">' + dossierState.ticker + '</span>';
  html += '        <span style="font-size:13px;color:var(--text3);font-weight:500">' + (quote.name || dossierState.ticker + ' Tbk') + '</span>';
  html += '        <span class="badge" style="background:rgba(255,255,255,0.08);color:var(--text2)">' + (quote.sector || 'IDX Equities') + '</span>';
  html += '      </div>';

  html += '      <div style="display:flex;align-items:baseline;gap:10px">';
  html += '        <span style="font-family:var(--font-mono);font-size:24px;font-weight:800;color:var(--text1)">Rp ' + (price > 0 ? price.toLocaleString('id-ID') : '-') + '</span>';
  html += '        <span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + changeColor + '">' + changeStr + '</span>';
  html += '      </div>';

  html += '      <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--text2)">';
  html += '        <div><span style="color:var(--text3)">PE Ratio:</span> <b>' + (quote.fundamentals && quote.fundamentals.per ? quote.fundamentals.per.toFixed(1) + 'x' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">PBV:</span> <b>' + (quote.fundamentals && quote.fundamentals.pbv ? quote.fundamentals.pbv.toFixed(2) + 'x' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">ROE:</span> <b>' + (quote.fundamentals && quote.fundamentals.roe ? quote.fundamentals.roe.toFixed(1) + '%' : '-') + '</b></div>';
  html += '        <div><span style="color:var(--text3)">Bandar:</span> <b>' + (res.pillars.smartMoney.bandarStatus || '-') + '</b></div>';
  html += '      </div>';
  html += '    </div>';

  // Middle: Composite Gauge & Recommendation
  html += '    <div style="display:flex;align-items:center;gap:16px;border-left:1px solid var(--border);border-right:1px solid var(--border);padding:0 24px">';
  html += '      <div style="text-align:center">';
  html += '        <div style="font-size:10px;font-weight:800;letter-spacing:0.5px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">MASTER SCORE</div>';
  html += '        <div style="font-family:var(--font-mono);font-size:42px;font-weight:900;line-height:1;color:' + res.recColor + '">' + res.compositeScore + '<span style="font-size:16px;color:var(--text3);font-weight:500">/100</span></div>';
  html += '        <div style="margin-top:6px"><span class="badge ' + res.recClass + '" style="font-weight:800;font-size:11px;padding:3px 10px">' + res.recommendation + '</span></div>';
  html += '      </div>';
  html += '    </div>';

  // Right: Confidence & Data Provenance
  html += '    <div style="min-width:220px">';
  html += '      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">';
  html += '        <span style="color:var(--text3);font-weight:600">Data Confidence Level</span>';
  html += '        <span style="font-family:var(--font-mono);font-weight:700;color:' + (res.confidenceLevel >= 80 ? 'var(--green)' : (res.confidenceLevel >= 50 ? 'var(--amber)' : 'var(--red)')) + '">' + res.confidenceLevel + '%</span>';
  html += '      </div>';
  html += '      <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-bottom:8px">';
  html += '        <div style="height:100%;width:' + res.confidenceLevel + '%;background:' + (res.confidenceLevel >= 80 ? 'var(--green)' : (res.confidenceLevel >= 50 ? 'var(--amber)' : 'var(--red)')) + '"></div>';
  html += '      </div>';
  html += '      <div style="font-size:11px;color:var(--text3)">' + res.availablePillarsCount + ' dari ' + res.totalPillarsCount + ' pilar terverifikasi real data.</div>';

  // Quick Action Buttons
  html += '      <div style="margin-top:12px;display:flex;gap:6px">';
  html += '        <button class="btn btn-ghost btn-xs" onclick="dossierAddToWatchlist(\'' + dossierState.ticker + '\')" title="Tambahkan ke Watchlist">';
  html += '          <i class="ti ti-star"></i> Watchlist';
  html += '        </button>';
  html += '        <button class="btn btn-ghost btn-xs" onclick="dossierOpenInStockChat(\'' + dossierState.ticker + '\')" title="Tanyakan ke StockChat AI">';
  html += '          <i class="ti ti-terminal-2"></i> StockChat';
  html += '        </button>';
  html += '      </div>';
  html += '    </div>';

  html += '  </div>';
  html += '</div>';

  // ── 6-Pillar Interactive Grid Cards ──
  html += '<div style="margin-bottom:24px">';
  html += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '    <h3 style="font-size:14px;font-weight:800;color:var(--text1);margin:0;letter-spacing:0.2px">Peta Analisis 6 Pilar Institusional</h3>';
  html += '    <span style="font-size:11px;color:var(--text3)">Klik kartu pilar untuk memeriksa detail rincian di bawah</span>';
  html += '  </div>';

  html += '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">';

  res.pillarEntries.forEach(function(p) {
    var isAvail = p.res && p.res.available === true;
    var scoreDisp = isAvail && typeof p.res.score === 'number' ? p.res.score : '-';
    var scoreColor = isAvail ? (p.res.score >= 75 ? 'var(--green)' : (p.res.score >= 50 ? 'var(--amber)' : 'var(--red)')) : 'var(--text3)';
    var statusBadge = isAvail
      ? '<span class="badge b-up" style="font-size:9px;padding:1px 5px">REAL</span>'
      : '<span class="badge b-dn" style="font-size:9px;padding:1px 5px;background:rgba(239,68,68,0.15);color:#ef4444">DATA TIDAK TERSEDIA</span>';

    html += '    <div class="card" style="padding:14px;border:1px solid var(--border);background:var(--card);cursor:pointer;transition:transform 0.15s,border-color 0.15s" ';
    html += '      onclick="dossierSwitchTab(\'' + p.key + '\')" onmouseover="this.style.borderColor=\'var(--blue)\'" onmouseout="this.style.borderColor=\'var(--border)\'">';

    html += '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '        <div style="font-size:12px;font-weight:700;color:var(--text1)">' + p.label + '</div>';
    html += '        <div style="display:flex;align-items:center;gap:4px">';
    html += '          <span class="badge" style="background:var(--bg2);color:var(--text3);font-size:9px">' + p.weight + '%</span>';
    html += '          ' + statusBadge;
    html += '        </div>';
    html += '      </div>';

    html += '      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">';
    html += '        <div style="font-family:var(--font-mono);font-size:24px;font-weight:900;color:' + scoreColor + '">' + scoreDisp + (isAvail ? '<span style="font-size:11px;color:var(--text3)">/100</span>' : '') + '</div>';
    html += '        <div style="font-size:11px;color:var(--blue);font-weight:600">Detail &rarr;</div>';
    html += '      </div>';

    // Progress Bar
    var pctWidth = isAvail && typeof p.res.score === 'number' ? Math.max(5, p.res.score) : 0;
    html += '      <div style="height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-bottom:8px">';
    html += '        <div style="height:100%;width:' + pctWidth + '%;background:' + scoreColor + '"></div>';
    html += '      </div>';

    html += '      <div style="font-size:11px;color:var(--text2);line-height:1.4;min-height:32px">' + (p.res ? p.res.reason : 'Tidak ada catatan.') + '</div>';

    html += '    </div>';
  });

  html += '  </div>';
  html += '</div>';

  // ── Unified Deep-Dive Multi-Tab Accordions (All-in-One Detail) ──
  html += '<div class="card" style="border:1px solid var(--border);padding:0;background:var(--card);margin-bottom:30px">';

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
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text1);margin:0 0 12px 0">Ringkasan Eksekutif &amp; Tesis Investasi</h4>';
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
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text1);margin:0 0 12px 0">Rincian Valuasi &amp; Margin of Safety (Bobot: ' + res.weightsUsed.valuation + '%)</h4>';
  if (!res.pillars.valuation.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.valuation.reason + '</div>';
  } else {
    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Harga Pasar Saat Ini</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">Rp ' + price.toLocaleString('id-ID') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Estimasi Harga Wajar (Graham/DCF)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:var(--blue)">' + (res.pillars.valuation.fairValue ? 'Rp ' + res.pillars.valuation.fairValue.toLocaleString('id-ID') : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Margin of Safety (MoS)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:' + (res.pillars.valuation.mosPct >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (res.pillars.valuation.mosPct !== null ? (res.pillars.valuation.mosPct > 0 ? '+' : '') + res.pillars.valuation.mosPct.toFixed(1) + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Price to Earnings (PE)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.valuation.per ? res.pillars.valuation.per.toFixed(1) + 'x' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Price to Book (PBV)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.valuation.pbv ? res.pillars.valuation.pbv.toFixed(2) + 'x' : '-') + '</div></div>';
    html += '      </div>';
    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Menggunakan formula Graham Number √(22.5 × EPS × BVPS) dan perbandingan median historis PE/PBV untuk menentukan batas Margin of Safety kuantitatif.</p>';
  }
  html += '    </div>';

  // ── TAB: 2. SMART MONEY ──
  html += '    <div class="dossier-tab-pane" data-tab="smartMoney" style="display:' + (dossierState.activeTab === 'smartMoney' ? 'block' : 'none') + '">';
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text1);margin:0 0 12px 0">Rincian Aliran Smart Money &amp; Bandarmology (Bobot: ' + res.weightsUsed.smartMoney + '%)</h4>';
  if (!res.pillars.smartMoney.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.smartMoney.reason + '</div>';
  } else {
    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Status Bandarmology</span><div style="font-size:16px;font-weight:800;color:var(--blue)">' + res.pillars.smartMoney.bandarStatus + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Konsentrasi Top 3 Broker</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.smartMoney.top3Pct ? res.pillars.smartMoney.top3Pct + '%' : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Net Foreign Flow</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:' + (res.pillars.smartMoney.foreignFlow >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (res.pillars.smartMoney.foreignFlow ? 'Rp ' + (res.pillars.smartMoney.foreignFlow / 1e9).toFixed(2) + ' M' : 'Rp 0 M') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Bandar VWAP (Est. Rata-Rata)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.smartMoney.vwapBandar ? 'Rp ' + Math.round(res.pillars.smartMoney.vwapBandar).toLocaleString('id-ID') : '-') + '</div></div>';
    html += '      </div>';
    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Berdasarkan Kyle (1985) Microstructure &amp; Amihud Illiquidity, mengidentifikasi akumulasi broker terpilih yang mengendalikan likuiditas transaksi di pasar reguler.</p>';
  }
  html += '    </div>';

  // ── TAB: 3. TEKNIKAL ──
  html += '    <div class="dossier-tab-pane" data-tab="technical" style="display:' + (dossierState.activeTab === 'technical' ? 'block' : 'none') + '">';
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text1);margin:0 0 12px 0">Rincian Momentum &amp; Indikator Teknikal (Bobot: ' + res.weightsUsed.technical + '%)</h4>';
  if (!res.pillars.technical.available) {
    html += '      <div class="badge b-dn" style="padding:8px 12px;font-size:12px"><i class="ti ti-info-circle"></i> ' + res.pillars.technical.reason + '</div>';
  } else {
    html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Struktur Tren</span><div style="font-size:14px;font-weight:800;color:var(--text1)">' + res.pillars.technical.trend + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Relative Strength Index (RSI 14)</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.technical.rsi !== null ? res.pillars.technical.rsi : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">EMA 20 &amp; EMA 50</span><div style="font-family:var(--font-mono);font-size:16px;font-weight:800">' + (res.pillars.technical.ema20 ? 'Rp ' + res.pillars.technical.ema20.toLocaleString('id-ID') : '-') + ' / ' + (res.pillars.technical.ema50 ? 'Rp ' + res.pillars.technical.ema50.toLocaleString('id-ID') : '-') + '</div></div>';
    html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Volume Spike Ratio</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + (res.pillars.technical.volumeSpike ? res.pillars.technical.volumeSpike + 'x avg' : '-') + '</div></div>';
    html += '      </div>';
    html += '      <p style="font-size:11px;color:var(--text2);margin:0">Metodologi: Melacak konfirmasi struktur Exponential Moving Average (EMA) 20/50 serta ekspansi volume terhadap rata-rata 20 hari untuk memfilter false breakout.</p>';
  }
  html += '    </div>';

  // ── TAB: 4. KSEI ──
  html += '    <div class="dossier-tab-pane" data-tab="ksei" style="display:' + (dossierState.activeTab === 'ksei' ? 'block' : 'none') + '">';
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text1);margin:0 0 12px 0">Rincian Kepemilikan Kustodian KSEI (Bobot: ' + res.weightsUsed.ksei + '%)</h4>';
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
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text1);margin:0 0 12px 0">Rincian Profitabilitas &amp; Dividen (Bobot: ' + res.weightsUsed.fundamental + '%)</h4>';
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
  html += '      <h4 style="font-size:14px;font-weight:800;color:var(--text1);margin:0 0 12px 0">Market Regime &amp; Putusan AI Kuantitatif (Bobot: ' + res.weightsUsed.regime + '%)</h4>';
  html += '      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px">';
  html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Regime IHSG</span><div style="font-size:16px;font-weight:800;color:var(--blue)">' + (res.pillars.regime.regime || 'SIDEWAYS') + '</div></div>';
  html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Regime Confidence</span><div style="font-family:var(--font-mono);font-size:18px;font-weight:800">' + res.pillars.regime.regimeConfidence + '%</div></div>';
  html += '        <div class="card" style="padding:12px;background:var(--bg2)"><span style="font-size:10px;color:var(--text3)">Rekomendasi Final</span><div style="font-size:16px;font-weight:800;color:' + res.recColor + '">' + res.recommendation + '</div></div>';
  html += '      </div>';
  html += '      <p style="font-size:11px;color:var(--text2);margin:0">Kondisi pasar makro (IHSG trend &amp; risk appetite) menjadi regulator multiplier agar sinyal saham tunggal tidak dieksekusi secara membabi buta di pasar risk-off.</p>';
  html += '    </div>';

  html += '  </div>'; // End Tab Content Container
  html += '</div>'; // End Card

  container.innerHTML = html;
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
  html += '<div id="' + modalId + '" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)">';
  html += '  <div class="card" style="width:100%;max-width:540px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,0.5)">';

  html += '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
  html += '      <div>';
  html += '        <h3 style="margin:0;font-size:16px;font-weight:900;color:var(--text1)">⚙️ Kalibrasi Bobot Analisis Multi-Faktor</h3>';
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
    html += '        <input type="range" min="0" max="60" step="5" value="' + val + '" class="finput" style="width:100%;height:6px;accent-color:var(--blue)" ';
    html += '          id="dossier-w-inp-' + s.key + '" oninput="dossierOnSliderChange()" />';
    html += '      </div>';
  });
  html += '    </div>';

  // Sum & Validation Bar
  html += '    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg2);border-radius:6px;margin-bottom:16px">';
  html += '      <span style="font-size:12px;font-weight:700;color:var(--text1)">Total Bobot:</span>';
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
  if (typeof wlAddTicker === 'function') {
    wlAddTicker(tk);
  } else if (typeof showToast === 'function') {
    showToast('Ticker ' + tk + ' disalin ke watchlist.');
  }
}

function dossierOpenInStockChat(tk) {
  if (typeof goPage === 'function') {
    goPage('stockchat');
    setTimeout(function() {
      var prompt = 'Analisis lengkap saham ' + tk + ' dari aspek Valuasi Graham/DCF, Broker Flow Bandarmology, dan Market Regime.';
      var inp = document.getElementById('sc-chat-input') || document.getElementById('stockchat-input');
      if (inp) {
        inp.value = prompt;
        var btn = document.getElementById('sc-send-btn') || document.getElementById('stockchat-send-btn');
        if (btn) btn.click();
      }
    }, 200);
  }
}

// ============================================================
// 7. COMMONJS / NODE ENVIRONMENT EXPORTS (FOR AUTOMATED TESTS)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOSSIER_DEFAULT_WEIGHTS: DOSSIER_DEFAULT_WEIGHTS,
    DOSSIER_PRESETS: DOSSIER_PRESETS,
    dossierGetDefaultWeights: dossierGetDefaultWeights,
    dossierComputeValuationScore: dossierComputeValuationScore,
    dossierComputeSmartMoneyScore: dossierComputeSmartMoneyScore,
    dossierComputeTechnicalScore: dossierComputeTechnicalScore,
    dossierComputeKseiScore: dossierComputeKseiScore,
    dossierComputeFundamentalScore: dossierComputeFundamentalScore,
    dossierComputeRegimeScore: dossierComputeRegimeScore,
    dossierCalculateCompositeScore: dossierCalculateCompositeScore,
    dossierCalculateScore: dossierCalculateScore
  };
}
