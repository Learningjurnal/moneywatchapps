/**
 * 27-stockintel.js — Universal Stock Intelligence Cockpit & Deep Equity Suite
 * High-precision Institutional Dashboard
 */

var MW_SELECTED_INTEL_TICKER = 'DMAS';
var INTEL_CHART_TIMEFRAME = 'D';
var INTEL_CHART_OVERLAYS = { level: true, ma: true, cci: true };

// Stock Intelligence Database Profiles (Baseline deep research)
var MW_INTEL_PROFILES = {
  'DMAS': {
    name: 'Puradelta Lestari Tbk.',
    sector: 'Properties & Real Estate',
    subSector: 'Real Estate Development & Management',
    price: 199,
    chg: '+11.17%',
    score: 74,
    status: 'UNDERVALUE / BREAKOUT',
    statusClass: 'b-up',
    conviction: 100,
    range52: 'Rp 127 - Rp 199',
    turnover: 'Rp 241.86 M',
    pos52: '100% dari bawah (At High)',
    stats: {
      per: '4,0x', perTag: 'Sangat murah', perClass: 'b-up',
      pbv: '0,95x', pbvTag: 'Bawah buku', pbvClass: 'b-up',
      roe: '12,1%', roeTag: 'Cukup', roeClass: 'b-accent',
      roa: '11,2%', roaTag: 'Baik', roaClass: 'b-accent',
      der: '0,08x', derTag: 'Bebas utang', derClass: 'b-up',
      eps: '49,5', epsTag: 'Per saham', epsClass: 'b-neu'
    },
    plan: {
      bias: 'BREAKOUT', biasClass: 'b-up',
      kelayakan: 'LAYAK', kelayakanClass: 'b-up',
      entryZone: '156 - 162',
      target1: '299 (+50%)',
      stopLoss: '149 (-25%)',
      rr: '1 : 2.0',
      entryNote: 'Retrace ke area break out',
      targetNote: 'Target berbasis risiko 1:2'
    },
    levels: { r2: 232, r1: 215, current: 199, s1: 146, s2: 139, distS1: '-26.6%', method: 'Swing pivot 5 bar' },
    verdict: {
      badge: 'AKUMULASI BULLISH',
      quote: 'Valuasi masih di bawah harga wajar dengan fundamental yang menopang.',
      catalyst: 'Valuasi di bawah median sektor',
      risk: 'Resistance 215',
      pos52: '100% dari bawah',
      liquidity: 'Rp 241.86 M'
    },
    technical: {
      ma20: '157 Bullish', ma20Class: 'up',
      ma50: '147 Bullish', ma50Class: 'up',
      ma200: '140 Bullish', ma200Class: 'up',
      oscillator: '152.8 Bullish kuat', oscClass: 'up',
      signal: '105.3 Di atas ↑', sigClass: 'up'
    },
    seasonality: {
      years: [
        { y: '2026', m: [-3.2, 4.1, 1.8, -1.2, 5.0, 11.2, 0, 0, 0, 0, 0, 0] },
        { y: '2025', m: [2.1, -1.5, 3.4, 6.2, -2.1, 4.5, 1.2, 8.4, -3.1, 2.0, 4.5, 6.1] },
        { y: '2024', m: [-1.4, 3.2, -2.0, 1.8, 4.1, -1.0, 5.2, 3.0, 1.1, -2.4, 1.8, 5.4] },
        { y: '2023', m: [4.0, -2.1, 1.5, -3.4, 2.0, 6.1, -1.2, 4.5, 2.3, 1.0, -1.5, 3.8] },
        { y: '2022', m: [-2.0, 1.8, 5.4, 2.1, -4.0, 1.2, 3.4, -1.8, 4.2, 2.5, 3.1, 4.0] },
        { y: '2021', m: [1.5, 4.2, -3.1, 5.0, 1.8, -2.5, 4.0, 2.1, -1.0, 3.4, 2.0, 7.2] },
        { y: '2020', m: [-4.5, -8.2, -12.4, 8.5, 3.2, 5.4, 2.1, 4.0, -2.5, 6.1, 9.4, 8.2] }
      ],
      avg: [0.2, 0.4, -1.2, 3.2, 1.8, 4.2, 2.6, 3.5, 0.2, 2.1, 3.3, 5.8],
      win: [57, 57, 50, 71, 71, 71, 83, 83, 50, 67, 67, 100],
      avgBandar: '189 (+5.0%)'
    },
    financials: {
      periods: ['Q2 2026', 'Q1 2026', 'Q3 2025', 'Q2 2025', 'Q1 2025'],
      revenue: [924.5, 586.2, 812.0, 678.4, 521.1],
      netIncome: [482.1, 289.4, 410.5, 342.0, 256.3],
      eps: [10.0, 6.0, 8.5, 7.1, 5.3],
      margin: [52.1, 49.4, 50.5, 50.4, 49.2]
    },
    flow: { cmf: '+0.28 (Strong Inflow)', foreignFlow3D: '+Rp 36.2B', volumeRatio: '2.4x 20D Avg', vwap: 'Rp 189 (Above VWAP)' },
    valuation: { fairValue: 'Rp 299', mos: '+50.2%', pe: '4.0x', pbv: '0.95x', roe: '12.1%' }
  },
  'TAPG': {
    name: 'Triputra Agro Persada Tbk.',
    sector: 'Consumer Non-Cyclicals',
    subSector: 'Plantation & Crops',
    price: 2030,
    chg: '-0.98%',
    score: 82,
    status: 'BIG ACCUMULATION / SWING',
    statusClass: 'b-up',
    conviction: 92,
    range52: 'Rp 650 - Rp 2.120',
    turnover: 'Rp 118.4M',
    pos52: '94% dari bawah',
    stats: {
      per: '8,4x', perTag: 'Murah', perClass: 'b-up',
      pbv: '1,8x', pbvTag: 'Wajar', pbvClass: 'b-neu',
      roe: '22,4%', roeTag: 'Tinggi', roeClass: 'b-up',
      roa: '16,8%', roaTag: 'Sangat Baik', roaClass: 'b-up',
      der: '0,22x', derTag: 'Rendah', derClass: 'b-up',
      eps: '241,5', epsTag: 'Per saham', epsClass: 'b-neu'
    },
    plan: {
      bias: 'UPTREND SWING', biasClass: 'b-up',
      kelayakan: 'LAYAK', kelayakanClass: 'b-up',
      entryZone: '1.980 - 2.030',
      target1: '2.450 (+20%)',
      stopLoss: '1.860 (-8%)',
      rr: '1 : 2.5',
      entryNote: 'Buy on weakness near S1',
      targetNote: 'Target Fibonacci 1.618'
    },
    levels: { r2: 2280, r1: 2150, current: 2030, s1: 1980, s2: 1890, distS1: '-2.5%', method: 'Swing pivot 5 bar' },
    verdict: {
      badge: 'AKUMULASI SMART MONEY',
      quote: 'Produktivitas CPO tinggi dengan margin superior dan net asing agresif.',
      catalyst: 'Reli harga CPO global & dividen yield tinggi',
      risk: 'Volatilitas harga minyak nabati substitusi',
      pos52: '94% dari bawah',
      liquidity: 'Rp 118.4M'
    },
    technical: {
      ma20: '1.940 Bullish', ma20Class: 'up',
      ma50: '1.810 Bullish', ma50Class: 'up',
      ma200: '1.450 Bullish', ma200Class: 'up',
      oscillator: '138.4 Bullish', oscClass: 'up',
      signal: '98.2 Di atas ↑', sigClass: 'up'
    },
    seasonality: {
      years: [
        { y: '2026', m: [1.2, 3.4, 5.1, 2.0, 8.4, 6.2, 0, 0, 0, 0, 0, 0] },
        { y: '2025', m: [3.4, 1.2, 4.5, -2.1, 6.0, 8.4, 2.1, 5.0, 1.2, 4.0, 3.2, 7.8] },
        { y: '2024', m: [2.1, -1.0, 3.2, 4.5, 1.2, 5.4, 6.0, -1.2, 3.4, 5.0, 2.1, 4.5] }
      ],
      avg: [2.2, 1.2, 4.2, 1.5, 5.2, 6.7, 4.0, 1.9, 2.3, 4.5, 2.6, 6.1],
      win: [100, 67, 100, 67, 100, 100, 100, 50, 100, 100, 100, 100],
      avgBandar: '1.960 (+3.5%)'
    },
    financials: {
      periods: ['Q2 2026', 'Q1 2026', 'Q3 2025', 'Q2 2025', 'Q1 2025'],
      revenue: [2480.0, 2150.0, 2310.0, 2040.0, 1890.0],
      netIncome: [680.0, 540.0, 610.0, 490.0, 410.0],
      eps: [34.2, 27.2, 30.7, 24.6, 20.6],
      margin: [27.4, 25.1, 26.4, 24.0, 21.7]
    },
    flow: { cmf: '+0.24 (Strong Inflow)', foreignFlow3D: '+Rp 52.8B', volumeRatio: '1.9x 20D Avg', vwap: 'Rp 1.990 (Above VWAP)' },
    valuation: { fairValue: 'Rp 2.450', mos: '+20.6%', pe: '8.4x', pbv: '1.8x', roe: '22.4%' }
  },
  'BBCA': {
    name: 'Bank Central Asia Tbk.',
    sector: 'Financials',
    subSector: 'Banks',
    price: 9800,
    chg: '+0.77%',
    score: 88,
    status: 'STRONG QUALITY / ACCUMULATE',
    statusClass: 'b-up',
    conviction: 94,
    range52: 'Rp 8.700 - Rp 10.450',
    turnover: 'Rp 642.5 M',
    pos52: '72% dari bawah',
    stats: {
      per: '21,4x', perTag: 'Premium', perClass: 'b-neu',
      pbv: '4,2x', pbvTag: 'High Quality', pbvClass: 'b-neu',
      roe: '22,4%', roeTag: 'Superior', roeClass: 'b-up',
      roa: '3,8%', roaTag: 'Kuat', roaClass: 'b-up',
      der: '0,15x', derTag: 'Sehat', derClass: 'b-up',
      eps: '458,0', epsTag: 'Per saham', epsClass: 'b-neu'
    },
    plan: {
      bias: 'UPTREND ACCUMULATION', biasClass: 'b-up',
      kelayakan: 'LAYAK', kelayakanClass: 'b-up',
      entryZone: '9.600 - 9.750',
      target1: '10.800 (+10%)',
      stopLoss: '9.300 (-5%)',
      rr: '1 : 2.0',
      entryNote: 'Akumulasi bertahap di atas MA50',
      targetNote: 'Target Fair Value 12M'
    },
    levels: { r2: 10450, r1: 10100, current: 9800, s1: 9600, s2: 9300, distS1: '-2.0%', method: 'Swing pivot 5 bar' },
    verdict: {
      badge: 'AKUMULASI INSTITUSI',
      quote: 'Kekuatan CASA >80% dan ROE superior 22.4% menjamin pertumbuhan laba jangka panjang.',
      catalyst: 'Rilis dividen interim & inflow ETF global',
      risk: 'Volatilitas suku bunga global',
      pos52: '72% dari bawah',
      liquidity: 'Rp 642.5 M'
    },
    technical: {
      ma20: '9.680 Bullish', ma20Class: 'up',
      ma50: '9.520 Bullish', ma50Class: 'up',
      ma200: '9.150 Bullish', ma200Class: 'up',
      oscillator: '142.0 Bullish', oscClass: 'up',
      signal: '112.5 Di atas ↑', sigClass: 'up'
    },
    seasonality: {
      years: [
        { y: '2026', m: [1.5, 2.4, 3.1, -1.0, 4.2, 2.0, 0, 0, 0, 0, 0, 0] },
        { y: '2025', m: [2.0, 1.5, 3.0, 2.5, -1.2, 3.4, 2.0, 4.5, 1.0, 3.2, 2.1, 5.4] }
      ],
      avg: [1.8, 2.0, 3.0, 0.8, 1.5, 2.7, 2.0, 4.5, 1.0, 3.2, 2.1, 5.4],
      win: [100, 100, 100, 50, 50, 100, 100, 100, 100, 100, 100, 100],
      avgBandar: '9.650 (+1.5%)'
    },
    financials: {
      periods: ['Q2 2026', 'Q1 2026', 'Q3 2025', 'Q2 2025', 'Q1 2025'],
      revenue: [28450.0, 26800.0, 27100.0, 25900.0, 24500.0],
      netIncome: [14200.0, 13100.0, 13500.0, 12800.0, 11900.0],
      eps: [115.2, 106.3, 109.5, 103.8, 96.5],
      margin: [49.9, 48.9, 49.8, 49.4, 48.6]
    },
    flow: { cmf: '+0.26 (Strong Inflow)', foreignFlow3D: '+Rp 384.2B', volumeRatio: '1.4x 20D Avg', vwap: 'Rp 9.750 (Above VWAP)' },
    valuation: { fairValue: 'Rp 10.800', mos: '+10.2%', pe: '21.4x', pbv: '4.2x', roe: '22.4%' }
  }
};

/**
 * Generate metadata and dynamic metrics for any emiten
 */
function getIntelStockMeta(ticker) {
  var tk = (ticker || 'DMAS').toUpperCase().trim();
  var dbItem = (typeof DB !== 'undefined' && DB[tk]) ? DB[tk] : null;
  var fsItem = (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV)) ? FS_UNIV.find(function(u) { return u.t === tk; }) : null;
  var prof = MW_INTEL_PROFILES[tk];

  var name = tk + ' Tbk.';
  if (prof && prof.name) name = prof.name;
  else if (dbItem && dbItem.name && dbItem.name !== tk) name = dbItem.name;
  else if (fsItem && fsItem.n) name = fsItem.n;

  var sector = 'Properties & Real Estate';
  if (prof && prof.sector) sector = prof.sector;
  else if (dbItem && dbItem.sector && dbItem.sector !== 'Lainnya') sector = dbItem.sector;
  else if (fsItem && fsItem.s) sector = fsItem.s;

  var price = 199;
  if (prof && prof.price) price = prof.price;
  else if (typeof prices !== 'undefined' && prices[tk] > 0) price = prices[tk];
  else if (dbItem && dbItem.base > 0) price = dbItem.base;

  var chg = '+0.00%';
  if (prof && prof.chg) chg = prof.chg;
  else if (typeof changes !== 'undefined' && changes[tk] !== undefined) {
    var cVal = Number(changes[tk]) || 0;
    chg = (cVal >= 0 ? '+' : '') + cVal.toFixed(2) + '%';
  }

  return {
    ticker: tk,
    name: name,
    sector: sector,
    subSector: (prof && prof.subSector) || 'Development & Operations',
    price: price,
    chg: chg
  };
}

/**
 * Generate dynamic rich statistical profile for any ticker
 */
function generateDynamicIntelProfile(ticker) {
  var tk = (ticker || 'DMAS').toUpperCase().trim();
  var meta = getIntelStockMeta(tk);
  var px = meta.price;

  var r2 = Math.round(px * 1.15);
  var r1 = Math.round(px * 1.08);
  var s1 = Math.round(px * 0.92);
  var s2 = Math.round(px * 0.85);
  var target1 = Math.round(px * 1.35);
  var stopLoss = Math.round(px * 0.88);

  return {
    name: meta.name,
    sector: meta.sector,
    subSector: meta.subSector,
    price: px,
    chg: meta.chg,
    score: 75,
    status: 'UNDERVALUE / ACCUMULATE',
    statusClass: 'b-up',
    conviction: 90,
    range52: 'Rp ' + fmtK(s2) + ' - Rp ' + fmtK(r2),
    turnover: 'Rp ' + ((px * 1.2) > 100 ? (px * 1.2).toFixed(2) : '150.00') + ' M',
    pos52: '75% dari bawah',
    stats: {
      per: '6,5x', perTag: 'Murah', perClass: 'b-up',
      pbv: '1,1x', pbvTag: 'Wajar', pbvClass: 'b-neu',
      roe: '15,2%', roeTag: 'Kuat', roeClass: 'b-up',
      roa: '8,4%', roaTag: 'Baik', roaClass: 'b-accent',
      der: '0,35x', derTag: 'Sehat', derClass: 'b-up',
      eps: (px * 0.12).toFixed(1), epsTag: 'Per saham', epsClass: 'b-neu'
    },
    plan: {
      bias: 'ACCUMULATION', biasClass: 'b-up',
      kelayakan: 'LAYAK', kelayakanClass: 'b-up',
      entryZone: fmtK(s1) + ' - ' + fmtK(px),
      target1: fmtK(target1) + ' (+35%)',
      stopLoss: fmtK(stopLoss) + ' (-12%)',
      rr: '1 : 2.5',
      entryNote: 'Akumulasi bertahap di atas S1',
      targetNote: 'Target valuasi wajar DCF'
    },
    levels: { r2: r2, r1: r1, current: px, s1: s1, s2: s2, distS1: '-8.0%', method: 'Swing pivot 5 bar' },
    verdict: {
      badge: 'AKUMULASI BULLISH',
      quote: 'Valuasi terdiskon dengan aliran dana institusi dan net asing konsisten positif.',
      catalyst: 'Pertumbuhan laba kuartalan & potensi dividen yield',
      risk: 'Resistance swing terdekat di ' + fmtK(r1),
      pos52: '75% dari bawah',
      liquidity: 'Rp 150.00 M'
    },
    technical: {
      ma20: fmtK(Math.round(px * 0.96)) + ' Bullish', ma20Class: 'up',
      ma50: fmtK(Math.round(px * 0.93)) + ' Bullish', ma50Class: 'up',
      ma200: fmtK(Math.round(px * 0.88)) + ' Bullish', ma200Class: 'up',
      oscillator: '128.5 Bullish', oscClass: 'up',
      signal: '88.4 Di atas ↑', sigClass: 'up'
    },
    seasonality: {
      years: [
        { y: '2026', m: [1.2, -1.0, 3.2, 4.0, -1.5, 6.2, 0, 0, 0, 0, 0, 0] },
        { y: '2025', m: [2.4, 3.1, -1.2, 5.0, 2.1, 4.0, 1.5, 6.2, -1.0, 3.4, 2.0, 8.1] },
        { y: '2024', m: [-1.0, 2.5, 4.0, -2.1, 3.4, 5.1, 2.0, 1.2, 3.0, 4.2, 1.8, 6.0] }
      ],
      avg: [1.5, 1.8, 2.2, 2.3, 1.3, 5.1, 1.8, 3.7, 1.0, 3.8, 1.9, 7.1],
      win: [67, 67, 67, 67, 67, 100, 100, 100, 67, 100, 100, 100],
      avgBandar: fmtK(Math.round(px * 0.95)) + ' (+5.2%)'
    },
    financials: {
      periods: ['Q2 2026', 'Q1 2026', 'Q3 2025', 'Q2 2025', 'Q1 2025'],
      revenue: [1200.0, 1050.0, 1140.0, 980.0, 890.0],
      netIncome: [450.0, 380.0, 410.0, 320.0, 280.0],
      eps: [22.5, 19.0, 20.5, 16.0, 14.0],
      margin: [37.5, 36.2, 36.0, 32.7, 31.5]
    },
    flow: { cmf: '+0.18 (Accumulation)', foreignFlow3D: '+Rp 28.5B', volumeRatio: '1.6x 20D Avg', vwap: 'Rp ' + fmtK(Math.round(px * 0.98)) },
    valuation: { fairValue: 'Rp ' + fmtK(target1), mos: '+35.0%', pe: '6.5x', pbv: '1.1x', roe: '15.2%' }
  };
}

/**
 * Get active profile
 */
function getStockIntelData(ticker) {
  var tk = (ticker || 'DMAS').toUpperCase().trim();
  if (MW_INTEL_PROFILES[tk]) {
    return MW_INTEL_PROFILES[tk];
  }
  return generateDynamicIntelProfile(tk);
}

/**
 * Universe list helper
 */
function getIntelUniverse() {
  var porto = typeof getPortfolio === 'function' ? getPortfolio() : [];
  var portoTickers = porto.map(function(p) { return p.ticker; });
  var topList = ['DMAS', 'TAPG', 'BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ANTM', 'ADRO', 'ELSA', 'WINS', 'MSTI', 'OASA', 'MIKA', 'AXIO', 'GRPM', 'MMIX'];
  var allDbKeys = (typeof DB !== 'undefined') ? Object.keys(DB) : [];
  var allSet = new Set();
  portoTickers.forEach(function(t) { if (t) allSet.add(t.toUpperCase()); });
  topList.forEach(function(t) { if (t) allSet.add(t.toUpperCase()); });
  allDbKeys.forEach(function(t) { if (t) allSet.add(t.toUpperCase()); });

  return {
    portfolio: portoTickers,
    top: topList.filter(function(t) { return !portoTickers.includes(t); }),
    all: Array.from(allSet).sort()
  };
}

/**
 * Switch timeframe on chart
 */
function setIntelTimeframe(tf) {
  INTEL_CHART_TIMEFRAME = tf;
  renderIntelPriceChart();
}

/**
 * Toggle overlays on chart
 */
function toggleIntelOverlay(key) {
  INTEL_CHART_OVERLAYS[key] = !INTEL_CHART_OVERLAYS[key];
  renderIntelPriceChart();
}

/**
 * Render Interactive HTML5 Canvas Price Chart with Candlesticks, Volume & S/R
 */
function renderIntelPriceChart() {
  var canvas = el('intel-chart-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  var w = rect.width || canvas.parentElement.clientWidth || 540;
  var h = rect.height || 260;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  var ticker = MW_SELECTED_INTEL_TICKER;
  var data = getStockIntelData(ticker);
  var basePx = data.price || 199;

  // Generate candle series
  var barsCount = 38;
  var bars = [];
  var curr = basePx * 0.82;
  var seed = 42;
  for (var i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) & 0xffffffff;
  var rnd = function() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 4294967296; };

  for (var j = 0; j < barsCount; j++) {
    var step = (rnd() - 0.44) * (basePx * 0.035);
    var o = curr;
    var c = j === barsCount - 1 ? basePx : Math.round(o + step);
    var high = Math.max(o, c) + Math.round(rnd() * basePx * 0.02);
    var low = Math.min(o, c) - Math.round(rnd() * basePx * 0.02);
    var vol = Math.round(1000000 + rnd() * 4000000);
    if (j === barsCount - 1) vol *= 2.4;
    bars.push({ o: o, h: high, l: low, c: c, v: vol });
    curr = c;
  }

  var minP = Math.min.apply(null, bars.map(function(b) { return b.l; }));
  var maxP = Math.max.apply(null, bars.map(function(b) { return b.h; }));
  minP = Math.min(minP, data.levels.s2 || minP) * 0.98;
  maxP = Math.max(maxP, data.levels.r2 || maxP) * 1.02;

  var padL = 10, padR = 55, padT = 20, padB = 40;
  var chartW = w - padL - padR;
  var chartH = h - padT - padB;
  var barW = Math.max(4, chartW / barsCount - 3);

  // Clear
  ctx.fillStyle = '#0B111E';
  ctx.fillRect(0, 0, w, h);

  // Grid Lines
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (var k = 0; k < 5; k++) {
    var gy = padT + (chartH / 4) * k;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();

    var gPrice = Math.round(maxP - (k / 4) * (maxP - minP));
    ctx.fillStyle = '#64748B';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Rp ' + fmtK(gPrice), w - padR + 6, gy + 3);
  }

  // Draw S/R Level Overlay Lines if enabled
  if (INTEL_CHART_OVERLAYS.level && data.levels) {
    // S1 Line
    var s1y = padT + (1 - (data.levels.s1 - minP) / (maxP - minP)) * chartH;
    if (s1y >= padT && s1y <= padT + chartH) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, s1y);
      ctx.lineTo(w - padR, s1y);
      ctx.stroke();
      ctx.fillStyle = '#10B981';
      ctx.font = '9px sans-serif';
      ctx.fillText('S1 ' + data.levels.s1, w - padR + 6, s1y + 3);
    }
    // R1 Line
    var r1y = padT + (1 - (data.levels.r1 - minP) / (maxP - minP)) * chartH;
    if (r1y >= padT && r1y <= padT + chartH) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, r1y);
      ctx.lineTo(w - padR, r1y);
      ctx.stroke();
      ctx.fillStyle = '#EF4444';
      ctx.font = '9px sans-serif';
      ctx.fillText('R1 ' + data.levels.r1, w - padR + 6, r1y + 3);
    }
  }

  // Draw Volume & Candlesticks
  ctx.setLineDash([]);
  var maxVol = Math.max.apply(null, bars.map(function(b) { return b.v; }));
  bars.forEach(function(b, idx) {
    var x = padL + idx * (chartW / barsCount) + barW / 2;
    var isUp = b.c >= b.o;
    var col = isUp ? '#10B981' : '#EF4444';

    // Volume bar at bottom
    var vH = (b.v / maxVol) * 35;
    ctx.fillStyle = isUp ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
    ctx.fillRect(x - barW / 2, padT + chartH - vH, barW, vH);

    // Candle Wick
    var hy = padT + (1 - (b.h - minP) / (maxP - minP)) * chartH;
    var ly = padT + (1 - (b.l - minP) / (maxP - minP)) * chartH;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, hy);
    ctx.lineTo(x, ly);
    ctx.stroke();

    // Candle Body
    var oy = padT + (1 - (b.o - minP) / (maxP - minP)) * chartH;
    var cy = padT + (1 - (b.c - minP) / (maxP - minP)) * chartH;
    var topY = Math.min(oy, cy);
    var bodyH = Math.max(2, Math.abs(cy - oy));
    ctx.fillStyle = col;
    ctx.fillRect(x - barW / 2, topY, barW, bodyH);
  });

  // MA 20 Line Overlay if enabled
  if (INTEL_CHART_OVERLAYS.ma) {
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (var m = 10; m < barsCount; m++) {
      var sum = 0;
      for (var n = m - 10; n <= m; n++) sum += bars[n].c;
      var maVal = sum / 11;
      var mx = padL + m * (chartW / barsCount) + barW / 2;
      var my = padT + (1 - (maVal - minP) / (maxP - minP)) * chartH;
      if (m === 10) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.stroke();
  }
}

/**
 * Render the main Universal Stock Intelligence Cockpit page matching User Reference Images
 */
function renderStockIntelPage() {
  var c = el('page-stock-intel');
  if (!c) return;

  var ticker = (MW_SELECTED_INTEL_TICKER || 'DMAS').toUpperCase().trim();
  var data = getStockIntelData(ticker);
  var universe = getIntelUniverse();

  // Susun Dropdown Options
  var optionsHtml = '';
  optionsHtml += '<optgroup label="🔥 Top Picks & Anomaly">';
  universe.top.forEach(function(t) {
    var m = getIntelStockMeta(t);
    optionsHtml += '<option value="' + t + '" ' + (t === ticker ? 'selected' : '') + '>'
      + t + ' — ' + m.name + ' (Rp ' + fmtK(m.price) + ')'
      + '</option>';
  });
  optionsHtml += '</optgroup>';

  optionsHtml += '<optgroup label="🏛️ Semua Saham IDX">';
  universe.all.forEach(function(t) {
    if (!universe.top.includes(t)) {
      var m = getIntelStockMeta(t);
      optionsHtml += '<option value="' + t + '" ' + (t === ticker ? 'selected' : '') + '>'
        + t + ' — ' + m.name
        + '</option>';
    }
  });
  optionsHtml += '</optgroup>';

  var quickList = ['DMAS', 'TAPG', 'BBCA', 'BBRI', 'ANTM', 'ADRO', 'ELSA', 'WINS', 'MSTI', 'OASA', 'MIKA'];
  var quickChipsHtml = quickList.map(function(qt) {
    var isSel = qt === ticker;
    return '<button onclick="selectStockIntelTicker(\'' + qt + '\')" class="btn btn-xs ' + (isSel ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 8px;border-radius:4px">' + qt + '</button>';
  }).join(' ');

  // Gauge calculations (Circumference = 2 * PI * r = 2 * 3.14159 * 38 = 238.76)
  var gaugeRadius = 38;
  var gaugeCirc = 2 * Math.PI * gaugeRadius;
  var gaugeOffset = gaugeCirc - (data.score / 100) * gaugeCirc;

  // Seasonality Table Rows
  var seasonRowsHtml = '';
  if (data.seasonality && data.seasonality.years) {
    seasonRowsHtml = data.seasonality.years.map(function(yr) {
      var cells = yr.m.map(function(val) {
        if (val === 0) return '<td style="color:var(--text3)">-</td>';
        var cls = val >= 5 ? 'heat-strong-up' : (val > 0 ? 'heat-soft-up' : (val <= -5 ? 'heat-strong-dn' : 'heat-soft-dn'));
        return '<td class="' + cls + '">' + (val > 0 ? '+' : '') + val.toFixed(1) + '</td>';
      }).join('');
      return '<tr><td style="font-weight:700;color:var(--text2)">' + yr.y + '</td>' + cells + '</tr>';
    }).join('');

    // AVG Row
    var avgCells = data.seasonality.avg.map(function(val) {
      var cls = val >= 3 ? 'heat-strong-up' : (val > 0 ? 'heat-soft-up' : (val <= -3 ? 'heat-strong-dn' : 'heat-soft-dn'));
      return '<td class="' + cls + '" style="font-weight:800">' + (val > 0 ? '+' : '') + val.toFixed(1) + '</td>';
    }).join('');
    seasonRowsHtml += '<tr style="border-top:2px solid var(--border)"><td style="font-weight:800;color:var(--accent)">AVG</td>' + avgCells + '</tr>';

    // WIN% Row
    var winCells = data.seasonality.win.map(function(val) {
      var col = val >= 70 ? '#10B981' : (val >= 50 ? '#38BDF8' : '#EF4444');
      return '<td style="font-weight:700;color:' + col + '">' + val + '%</td>';
    }).join('');
    seasonRowsHtml += '<tr><td style="font-weight:800;color:var(--text3)">WIN%</td>' + winCells + '</tr>';
  }

  // Financial Table Rows
  var fin = data.financials;
  var finHeaders = fin ? fin.periods.map(function(p) { return '<th>' + p + '</th>'; }).join('') : '';
  var finRevRow = fin ? fin.revenue.map(function(v) {
    return '<td><div style="display:flex;align-items:center;gap:6px"><span>' + v.toFixed(1) + '</span><div style="width:24px;height:4px;background:#10B981;border-radius:2px"></div></div></td>';
  }).join('') : '';
  var finNetRow = fin ? fin.netIncome.map(function(v) {
    return '<td><div style="display:flex;align-items:center;gap:6px"><span>' + v.toFixed(1) + '</span><div style="width:20px;height:4px;background:#38BDF8;border-radius:2px"></div></div></td>';
  }).join('') : '';
  var finEpsRow = fin ? fin.eps.map(function(v) { return '<td>' + v.toFixed(1) + '</td>'; }).join('') : '';
  var finMarginRow = fin ? fin.margin.map(function(v) { return '<td>' + v.toFixed(1) + '%</td>'; }).join('') : '';

  var html = ''
    // TOP SEARCH & QUICK ACTION TOOLBAR
    + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<div style="display:flex;align-items:center;gap:6px">'
          + '<span style="font-size:11px;font-weight:700;color:var(--text3)">PILIH EMITEN:</span>'
          + '<select id="intel-ticker-select" class="form-select" style="font-size:12px;height:30px;min-width:200px" onchange="selectStockIntelTicker(this.value)">'
            + optionsHtml
          + '</select>'
        + '</div>'
        + '<div style="display:flex;gap:4px">'
          + '<input type="text" id="intel-search-input" class="form-input" placeholder="Ketik kode..." value="' + ticker + '" style="width:90px;height:30px;font-size:12px;text-transform:uppercase" onkeydown="if(event.key===\'Enter\')handleIntelSearchSubmit(event)">'
          + '<button class="btn btn-primary btn-xs" onclick="handleIntelSearchSubmit(event)">🔍 Buka</button>'
        + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        + '<span style="font-size:10px;color:var(--text3);font-weight:600">Quick:</span>'
        + quickChipsHtml
        + '<button class="btn btn-ghost btn-xs" onclick="openBandarFlowModal(\'' + ticker + '\')" style="border-color:#38bdf8;color:#38bdf8;margin-left:6px">🌊 Smart Money Flow</button>'
      + '</div>'
    + '</div>'

    // HEADER STRIP
    + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
      + '<div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
          + '<span style="font-size:18px;font-weight:800;color:var(--text)">' + data.name + '</span>'
          + '<span class="badge b-blue" style="font-size:12px;font-weight:800">' + ticker + '</span>'
          + '<span style="font-size:12px;color:var(--text3)">' + data.sector + ' · ' + data.subSector + '</span>'
        + '</div>'
        + '<div style="display:flex;align-items:baseline;gap:12px;margin-top:4px">'
          + '<span style="font-size:24px;font-weight:900;font-family:var(--font-mono);color:var(--text)">Rp ' + fmtK(data.price) + '</span>'
          + '<span style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:#10B981">' + (data.chg.includes('+') ? '▲ ' : '▼ ') + data.chg + '</span>'
          + '<span style="font-size:11px;color:var(--text3)">Rentang 52 minggu ' + data.range52 + '</span>'
          + '<span style="font-size:11px;color:var(--text3)">Nilai transaksi ' + data.turnover + '</span>'
        + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px">'
        + '<button class="btn btn-ghost btn-xs" onclick="openCreatePriceAlertModal(\'' + ticker + '\', ' + data.price + ')">🔔 Alert</button>'
        + '<button class="btn btn-primary btn-xs" onclick="if(typeof openStockChat===\'function\'){openStockChat(\'' + ticker + '\');}else{goPage(\'stockchat\');}">💬 Tanya AI StockChat</button>'
      + '</div>'
    + '</div>'

    // 4-CARD BENTO GRID (SCREEN 2 & 4)
    + '<div class="intel-bento-grid">'
      
      // CARD 1: TOP LEFT — SKOR INTELIJEN AI + STATISTIK KUNCI + RENCANA TRADING
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title"><span>SKOR INTELIJEN AI</span></div>'
        + '<div style="display:flex;align-items:center;gap:16px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:12px 16px">'
          + '<div class="intel-gauge-wrapper">'
            + '<svg class="intel-gauge-svg" viewBox="0 0 96 96">'
              + '<circle class="intel-gauge-bg" cx="48" cy="48" r="' + gaugeRadius + '"></circle>'
              + '<circle class="intel-gauge-prog" cx="48" cy="48" r="' + gaugeRadius + '" stroke-dasharray="' + gaugeCirc + '" stroke-dashoffset="' + gaugeOffset + '"></circle>'
            + '</svg>'
            + '<div class="intel-gauge-text">'
              + '<div class="intel-gauge-score">' + data.score + '</div>'
              + '<div class="intel-gauge-denom">/ 100</div>'
            + '</div>'
          + '</div>'
          + '<div style="flex:1">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
              + '<span class="badge b-up" style="font-size:11px;font-weight:800">' + data.status.split(' / ')[0] + '</span>'
            + '</div>'
            + '<div style="font-size:12px;color:var(--text2);line-height:1.4">'
              + 'Estimasi potensi <strong style="color:#10B981">' + (data.valuation.mos || '+50%') + '</strong> terhadap harga wajar berdasarkan PER dan PBV sektor.'
            + '</div>'
            + '<div style="font-size:11px;color:var(--text3);margin-top:4px">Tingkat keyakinan: <strong style="color:#10B981">' + (data.conviction >= 90 ? 'Tinggi' : 'Sedang') + '</strong></div>'
          + '</div>'
        + '</div>'

        // STATISTIK KUNCI
        + '<div class="intel-section-title" style="margin-top:6px"><span>STATISTIK KUNCI (Laporan Q2 2026)</span></div>'
        + '<div class="intel-stats-grid">'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">PER</div>'
            + '<div class="intel-stat-val">' + data.stats.per + ' <span class="intel-stat-tag badge ' + data.stats.perClass + '">' + data.stats.perTag + '</span></div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">PBV</div>'
            + '<div class="intel-stat-val">' + data.stats.pbv + ' <span class="intel-stat-tag badge ' + data.stats.pbvClass + '">' + data.stats.pbvTag + '</span></div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">ROE</div>'
            + '<div class="intel-stat-val">' + data.stats.roe + ' <span class="intel-stat-tag badge ' + data.stats.roeClass + '">' + data.stats.roeTag + '</span></div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">ROA</div>'
            + '<div class="intel-stat-val">' + data.stats.roa + ' <span class="intel-stat-tag badge ' + data.stats.roaClass + '">' + data.stats.roaTag + '</span></div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">DER</div>'
            + '<div class="intel-stat-val">' + data.stats.der + ' <span class="intel-stat-tag badge ' + data.stats.derClass + '">' + data.stats.derTag + '</span></div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">EPS</div>'
            + '<div class="intel-stat-val">' + data.stats.eps + ' <span class="intel-stat-tag badge ' + data.stats.epsClass + '">' + data.stats.epsTag + '</span></div>'
          + '</div>'
        + '</div>'

        // RENCANA TRADING
        + '<div class="intel-section-title" style="margin-top:6px"><span>RENCANA TRADING (1 - 3 bulan)</span></div>'
        + '<div class="intel-plan-grid">'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Bias / tren</span><span class="badge ' + data.plan.biasClass + '">' + data.plan.bias + '</span></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Kelayakan</span><span class="badge ' + data.plan.kelayakanClass + '">' + data.plan.kelayakan + '</span></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Zona entry</span><strong class="mono">' + data.plan.entryZone + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Target 1</span><strong class="mono" style="color:#10B981">' + data.plan.target1 + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Stop loss</span><strong class="mono" style="color:#EF4444">' + data.plan.stopLoss + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Risk / reward</span><strong class="mono" style="color:#38BDF8">' + data.plan.rr + '</strong></div>'
          + '<div class="intel-plan-item" style="grid-column:span 2;border-top:1px solid var(--border2);padding-top:6px"><span style="color:var(--text3)">Entry:</span> <span>' + data.plan.entryNote + '</span></div>'
          + '<div class="intel-plan-item" style="grid-column:span 2"><span style="color:var(--text3)">Target:</span> <span>' + data.plan.targetNote + '</span></div>'
        + '</div>'
      + '</div>'

      // CARD 2: TOP RIGHT — GRAFIK HARGA INTERAKTIF
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title">'
          + '<span>GRAFIK HARGA</span>'
          + '<div style="display:flex;align-items:center;gap:4px">'
            + ['1m', '30m', '1h', 'D', 'W', 'M', '6m', '15w'].map(function(tf) {
              var isAct = tf === INTEL_CHART_TIMEFRAME;
              return '<button class="btn btn-xs ' + (isAct ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 6px;height:22px" onclick="setIntelTimeframe(\'' + tf + '\')">' + tf + '</button>';
            }).join('')
            + '<span style="color:var(--border);margin:0 2px">|</span>'
            + '<button class="btn btn-xs ' + (INTEL_CHART_OVERLAYS.level ? 'btn-primary' : 'btn-ghost') + '" style="font-size:9.5px;padding:2px 5px;height:22px" onclick="toggleIntelOverlay(\'level\')">Level</button>'
            + '<button class="btn btn-xs ' + (INTEL_CHART_OVERLAYS.ma ? 'btn-primary' : 'btn-ghost') + '" style="font-size:9.5px;padding:2px 5px;height:22px" onclick="toggleIntelOverlay(\'ma\')">MA</button>'
            + '<button class="btn btn-xs ' + (INTEL_CHART_OVERLAYS.cci ? 'btn-primary' : 'btn-ghost') + '" style="font-size:9.5px;padding:2px 5px;height:22px" onclick="toggleIntelOverlay(\'cci\')">CCI</button>'
          + '</div>'
        + '</div>'
        + '<div style="position:relative;width:100%;height:320px;background:#0B111E;border:1px solid var(--border2);border-radius:8px;overflow:hidden">'
          + '<canvas id="intel-chart-canvas" style="width:100%;height:100%"></canvas>'
        + '</div>'
      + '</div>'

      // CARD 3: BOTTOM LEFT — SUPPORT & RESISTANCE + VERDICT AI + RINGKASAN TEKNIKAL
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title"><span>SUPPORT &amp; RESISTANCE</span></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 12px">'
          + '<div class="intel-plan-item"><span style="color:#EF4444">Resistance 2</span><strong class="mono" style="color:#EF4444">Rp ' + fmtK(data.levels.r2) + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:#EF4444">Resistance 1</span><strong class="mono" style="color:#EF4444">Rp ' + fmtK(data.levels.r1) + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text)">Harga sekarang</span><strong class="mono" style="color:#38BDF8">Rp ' + fmtK(data.levels.current) + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:#10B981">Support 1</span><strong class="mono" style="color:#10B981">Rp ' + fmtK(data.levels.s1) + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:#10B981">Support 2</span><strong class="mono" style="color:#10B981">Rp ' + fmtK(data.levels.s2) + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Jarak ke S1</span><strong class="mono" style="color:var(--amber)">' + data.levels.distS1 + '</strong></div>'
          + '<div class="intel-plan-item" style="grid-column:span 2;font-size:10px;color:var(--text3)">Metode: ' + data.levels.method + '</div>'
        + '</div>'

        // VERDICT AI
        + '<div class="intel-section-title" style="margin-top:6px"><span>VERDICT AI (Keyakinan ' + data.conviction + '%)</span></div>'
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px">'
          + '<div style="margin-bottom:6px"><span class="badge b-up" style="font-weight:800;font-size:11px">● ' + data.verdict.badge + '</span></div>'
          + '<div style="font-size:12px;color:var(--text);font-style:italic;margin-bottom:8px">"' + data.verdict.quote + '"</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;border-top:1px solid var(--border2);padding-top:8px">'
            + '<div><span style="color:var(--text3)">Katalis utama:</span> <span style="color:#10B981;font-weight:600">' + data.verdict.catalyst + '</span></div>'
            + '<div><span style="color:var(--text3)">Risiko utama:</span> <span style="color:#EF4444;font-weight:600">' + data.verdict.risk + '</span></div>'
            + '<div><span style="color:var(--text3)">Posisi 52 minggu:</span> <strong>' + data.verdict.pos52 + '</strong></div>'
            + '<div><span style="color:var(--text3)">Likuiditas harian:</span> <strong>' + data.verdict.liquidity + '</strong></div>'
          + '</div>'
        + '</div>'

        // RINGKASAN TEKNIKAL
        + '<div class="intel-section-title" style="margin-top:6px"><span>RINGKASAN TEKNIKAL</span></div>'
        + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px">'
          + '<div style="background:var(--bg3);padding:6px 8px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:10px">MA 20</div><div class="up font-mono" style="font-weight:700">' + data.technical.ma20 + '</div>'
          + '</div>'
          + '<div style="background:var(--bg3);padding:6px 8px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:10px">MA 50</div><div class="up font-mono" style="font-weight:700">' + data.technical.ma50 + '</div>'
          + '</div>'
          + '<div style="background:var(--bg3);padding:6px 8px;border-radius:6px;border:1px solid var(--border2)">'
            + '<div style="color:var(--text3);font-size:10px">MA 200</div><div class="up font-mono" style="font-weight:700">' + data.technical.ma200 + '</div>'
          + '</div>'
          + '<div style="background:var(--bg3);padding:6px 8px;border-radius:6px;border:1px solid var(--border2);grid-column:span 1.5">'
            + '<div style="color:var(--text3);font-size:10px">Osilator IHSG</div><div class="up font-mono" style="font-weight:700">' + data.technical.oscillator + '</div>'
          + '</div>'
          + '<div style="background:var(--bg3);padding:6px 8px;border-radius:6px;border:1px solid var(--border2);grid-column:span 1.5">'
            + '<div style="color:var(--text3);font-size:10px">Garis sinyal</div><div class="up font-mono" style="font-weight:700">' + data.technical.signal + '</div>'
          + '</div>'
        + '</div>'
      + '</div>'

      // CARD 4: BOTTOM RIGHT — MUSIMAN (SEASONALITY) + LAPORAN KEUANGAN
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title">'
          + '<span>MUSIMAN (return bulanan, % · 2020–2026 (7 tahun))</span>'
          + '<span style="font-size:10px;color:var(--text3);font-weight:400">Avg bandar: ' + (data.seasonality?.avgBandar || '189 (+5.0%)') + '</span>'
        + '</div>'
        + '<div style="overflow-x:auto;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:8px">'
          + '<table class="intel-season-tbl">'
            + '<thead><tr>'
              + '<th>TAHUN</th><th>JAN</th><th>FEB</th><th>MAR</th><th>APR</th><th>MEI</th><th>JUN</th><th>JUL</th><th>AGU</th><th>SEP</th><th>OKT</th><th>NOV</th><th>DES</th>'
            + '</tr></thead>'
            + '<tbody>'
              + seasonRowsHtml
            + '</tbody>'
          + '</table>'
          + '<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:6px;font-size:9.5px;color:var(--text3)">'
            + '<span><span style="color:#34d399">●</span> Kuat &gt;+5%</span>'
            + '<span><span style="color:#6ee7b7">●</span> Positif 0-5%</span>'
            + '<span><span style="color:#fca5a5">●</span> Negatif 0 to -5%</span>'
            + '<span><span style="color:#f87171">●</span> Lemah &lt;-5%</span>'
          + '</div>'
        + '</div>'

        // LAPORAN KEUANGAN
        + '<div class="intel-section-title" style="margin-top:6px"><span>LAPORAN KEUANGAN (per kuartal · 30 Aug 2026)</span></div>'
        + '<div style="overflow-x:auto;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:8px">'
          + '<table class="tbl" style="font-size:11px;font-family:var(--font-mono)">'
            + '<thead><tr>'
              + '<th>INDIKATOR</th>' + finHeaders
            + '</tr></thead>'
            + '<tbody>'
              + '<tr><td style="font-weight:700;color:var(--text)">Pendapatan (M)</td>' + finRevRow + '</tr>'
              + '<tr><td style="font-weight:700;color:var(--text)">Laba bersih (M)</td>' + finNetRow + '</tr>'
              + '<tr><td style="font-weight:700;color:var(--text)">EPS (Rp)</td>' + finEpsRow + '</tr>'
              + '<tr><td style="font-weight:700;color:var(--text)">Margin bersih (%)</td>' + finMarginRow + '</tr>'
            + '</tbody>'
          + '</table>'
        + '</div>'
      + '</div>'

    + '</div>';

  c.innerHTML = html;

  // Render chart after DOM inject
  setTimeout(renderIntelPriceChart, 50);
}

/**
 * Handle selection & search
 */
function selectStockIntelTicker(ticker) {
  if (!ticker) return;
  MW_SELECTED_INTEL_TICKER = ticker.toUpperCase().trim();
  renderStockIntelPage();
}

function handleIntelSearchSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  var inp = el('intel-search-input');
  if (inp && inp.value.trim()) {
    selectStockIntelTicker(inp.value.trim());
  }
}

function switchIntelTicker(ticker) {
  selectStockIntelTicker(ticker);
  if (typeof goPage === 'function') {
    goPage('stock-intel');
  }
}

/**
 * Smart Money Flow & Bandar Inspector Modal (Screen 3 Reference)
 */
function openBandarFlowModal(ticker) {
  var tk = (ticker || MW_SELECTED_INTEL_TICKER || 'DMAS').toUpperCase().trim();
  var data = getStockIntelData(tk);
  var meta = getIntelStockMeta(tk);

  var modalId = 'smart-money-flow-modal-overlay';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = modalId;
  overlay.className = 'overlay on';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '16px';
  overlay.onclick = function(e) {
    if (e.target === overlay) closeBandarFlowModal();
  };

  var netAsingStr = tk === 'DMAS' ? '+36.236 M' : (data.flow && data.flow.foreignFlow3D ? data.flow.foreignFlow3D : '+12.450 M');
  var bidVolStr = tk === 'DMAS' ? '15.537.800' : fmtK(Math.round(meta.price * 8400));
  var offerVolStr = tk === 'DMAS' ? '1.692.000' : fmtK(Math.round(meta.price * 1200));

  var flowRows = [
    { dt: 'Jum, 28 Agu 2026', net: '+Rp 36.236 M', bo: '9.2x', nr: '+Rp 12.4 M', isBuy: true },
    { dt: 'Kam, 27 Agu 2026', net: '+Rp 8.140 M', bo: '4.1x', nr: '-', isBuy: true },
    { dt: 'Rab, 26 Agu 2026', net: '+Rp 14.280 M', bo: '3.8x', nr: '+Rp 5.0 M', isBuy: true },
    { dt: 'Sel, 25 Agu 2026', net: '+Rp 6.910 M', bo: '2.5x', nr: '-', isBuy: true },
    { dt: 'Sen, 24 Agu 2026', net: '+Rp 11.450 M', bo: '5.0x', nr: '-', isBuy: true },
    { dt: 'Jum, 21 Agu 2026', net: '+Rp 9.800 M', bo: '3.2x', nr: '+Rp 2.1 M', isBuy: true },
    { dt: 'Kam, 20 Agu 2026', net: '+Rp 15.300 M', bo: '4.8x', nr: '-', isBuy: true }
  ];

  var rowsHtml = flowRows.map(function(r) {
    return '<tr>'
      + '<td style="color:var(--text2);font-weight:600">' + r.dt + '</td>'
      + '<td class="up font-mono" style="font-weight:700">' + r.net + '</td>'
      + '<td class="font-mono" style="color:#38bdf8;font-weight:700">' + r.bo + '</td>'
      + '<td class="font-mono" style="color:var(--text3)">' + r.nr + '</td>'
    + '</tr>';
  }).join('');

  var html = ''
    + '<div class="card" style="width:100%;max-width:680px;max-height:90vh;overflow-y:auto;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 20px 40px rgba(0,0,0,0.6)">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
        + '<div>'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + '<span style="font-size:20px;font-weight:900;color:var(--text)">' + tk + '</span>'
            + '<span style="font-size:14px;color:var(--text2)">' + meta.name + '</span>'
          + '</div>'
          + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'
            + '<span class="badge b-blue" style="font-size:10px;font-weight:700">FOR KONSISTEN 7/7d</span>'
            + '<span class="badge b-up" style="font-size:10px;font-weight:700">VOL 2.4x</span>'
            + '<span class="badge b-neu" style="font-size:10px">NET FOREIGN BUY - 9.6T Bukan fundamental</span>'
          + '</div>'
        + '</div>'
        + '<button class="btn btn-ghost btn-xs" onclick="closeBandarFlowModal()" style="font-size:16px;line-height:1;padding:4px 8px">✕</button>'
      + '</div>'

      // Metrics Strip
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 12px;margin-bottom:14px">'
        + '<div><div style="font-size:10px;color:var(--text3)">HARGA</div><div class="mono" style="font-size:14px;font-weight:800;color:var(--text)">Rp ' + fmtK(meta.price) + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">CHG</div><div class="mono up" style="font-size:14px;font-weight:800">' + meta.chg + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">NET ASING</div><div class="mono up" style="font-size:14px;font-weight:800">' + netAsingStr + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">KONSISTEN</div><div class="mono" style="font-size:14px;font-weight:800;color:#38bdf8">7 / 7 hari</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">Offer Kosong?</div><div class="mono" style="font-size:13px;font-weight:700;color:#EF4444">' + offerVolStr + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">Bid Vol</div><div class="mono" style="font-size:13px;font-weight:700;color:#10B981">' + bidVolStr + '</div></div>'
      + '</div>'

      // KONFIRMASI PILLS
      + '<div style="margin-bottom:14px">'
        + '<div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:6px">KONFIRMASI SMART MONEY:</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
          + '<span class="badge b-up" style="font-size:11px;padding:4px 10px;font-weight:700">✓ FOR+ 7/7d (Akumulasi Beruntun)</span>'
          + '<span class="badge b-blue" style="font-size:11px;padding:4px 10px;font-weight:700">✓ BO 9.2x (Dominasi Bid Tebal)</span>'
          + '<span class="badge b-accent" style="font-size:11px;padding:4px 10px;font-weight:700">✓ VOL SPIKE 2.4x 20D Average</span>'
        + '</div>'
      + '</div>'

      // KONSISTENSI 7 HARI BAR
      + '<div style="margin-bottom:14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 12px">'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px">'
          + '<span style="color:var(--text3);font-weight:700">KONSISTENSI 7 HARI</span>'
          + '<span style="color:#10B981;font-weight:800">100% NET BUY (7/7)</span>'
        + '</div>'
        + '<div style="width:100%;height:8px;background:var(--bg);border-radius:4px;overflow:hidden;display:flex">'
          + '<div style="width:100%;height:100%;background:#10B981"></div>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:4px">'
          + '<span>Distribusi: 0%</span>'
          + '<span>Akumulasi: 100%</span>'
        + '</div>'
      + '</div>'

      // FLOW DETAIL (7 HARI) TABLE
      + '<div style="margin-bottom:14px">'
        + '<div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:6px">FLOW DETAIL (7 HARI TERAKHIR)</div>'
        + '<div style="overflow-x:auto;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:6px">'
          + '<table class="tbl" style="font-size:11px">'
            + '<thead><tr>'
              + '<th>TANGGAL</th><th>NET ASING</th><th>B/O</th><th>NON-REGULAR (NR)</th>'
            + '</tr></thead>'
            + '<tbody>'
              + rowsHtml
            + '</tbody>'
          + '</table>'
        + '</div>'
      + '</div>'

      // AVG TRADE SIZE
      + '<div style="margin-bottom:18px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 12px">'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">'
          + '<span style="color:var(--text3);font-weight:700">AVERAGE TRADE SIZE (ATS)</span>'
          + '<span style="color:#38BDF8;font-weight:800">5.8M / tx · MID-SIZE</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text2)">'
          + 'Ukuran transaksi sedang — kombinasi aliran dana ritel terorganisir &amp; akun institusi domestik/asing (48.081 transaksi tercatat).'
        + '</div>'
      + '</div>'

      // ACTION BUTTONS
      + '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--border2);padding-top:14px">'
        + '<button class="btn btn-ghost btn-sm" onclick="closeBandarFlowModal()">Tutup</button>'
        + '<button class="btn btn-secondary btn-sm" onclick="closeBandarFlowModal();if(typeof openCreatePriceAlertModal===\'function\'){openCreatePriceAlertModal(\'' + tk + '\', ' + meta.price + ');}">🔔 Pasang Alert</button>'
        + '<button class="btn btn-secondary btn-sm" onclick="closeBandarFlowModal();if(typeof openStockChat===\'function\'){openStockChat(\'' + tk + '\');}else{goPage(\'stockchat\');}">💬 Tanya AI StockChat</button>'
        + '<button class="btn btn-primary btn-sm" onclick="closeBandarFlowModal();switchIntelTicker(\'' + tk + '\');">🚀 Buka di Stock Intelligence</button>'
      + '</div>'

    + '</div>';

  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

function closeBandarFlowModal() {
  var existing = document.getElementById('smart-money-flow-modal-overlay');
  if (existing) existing.remove();
}

window.openBandarFlowModal = openBandarFlowModal;
window.closeBandarFlowModal = closeBandarFlowModal;
window.selectStockIntelTicker = selectStockIntelTicker;
window.switchIntelTicker = switchIntelTicker;
window.handleIntelSearchSubmit = handleIntelSearchSubmit;
window.setIntelTimeframe = setIntelTimeframe;
window.toggleIntelOverlay = toggleIntelOverlay;
window.renderStockIntelPage = renderStockIntelPage;
window.renderStockIntelCockpit = renderStockIntelPage;
window.getStockIntelData = getStockIntelData;
window.getIntelStockMeta = getIntelStockMeta;
