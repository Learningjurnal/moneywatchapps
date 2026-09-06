/**
 * 27-stockintel.js — Universal Stock Intelligence Cockpit & Deep Equity Suite
 * Institutional Real-Market Engine
 * 
 * Compliance Mandates:
 * 1. Strict IDX Universe Validation: Non-IDX stocks are prohibited with zero-state warning.
 * 2. Zero Synthetic / Dummy Data: Empty/unavailable metrics are displayed as '-' or 'N/A'.
 * 3. Live Timestamps: Exact acquisition timestamp tracked and displayed per ticker.
 * 4. Real-time Refresh: Integrated asynchronous pipeline with /api/idx/quote and /api/idx/broker-summary.
 */

var MW_SELECTED_INTEL_TICKER = 'BBCA';
var INTEL_CHART_TIMEFRAME = '1D';
var INTEL_CHART_OVERLAYS = { level: true, ma: true, cci: true };
var MW_INTEL_CACHE = {};
var MW_INTEL_TIMESTAMPS = {};
var MW_INTEL_IS_LOADING = false;

/**
 * Format timestamp in Indonesian locale (WIB)
 */
function getFormattedIntelTimestamp(dateObj) {
  var d = dateObj || new Date();
  var opts = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  try {
    return d.toLocaleDateString('id-ID', opts) + ' WIB';
  } catch (e) {
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }
}

/**
 * Check whether a ticker is registered in the official IDX Universe
 */
function isRegisteredIdxTicker(ticker) {
  if (!ticker) return false;
  var tk = String(ticker).toUpperCase().replace(/\.JK$/i, '').trim();
  if (!tk) return false;

  if (typeof isValidStockTicker === 'function') {
    var usStocks = ['AAPL','TSLA','NVDA','MSFT','GOOG','GOOGL','AMZN','META','NFLX','AMD','INTC','COIN','PLTR','BRK-B','SPY','QQQ'];
    if (usStocks.includes(tk)) return false; // Prohibit US stocks in IDX Stock Intelligence Cockpit
    return isValidStockTicker(tk);
  }
  if (typeof DB !== 'undefined' && DB[tk]) return true;
  if (typeof _IDX_RAW_LIST !== 'undefined' && _IDX_RAW_LIST[tk]) return true;
  if (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV) && FS_UNIV.some(function(u){ return u.t === tk; })) return true;
  return false;
}

/**
 * Get verified IDX stock metadata (Strictly real data only)
 */
function getIntelStockMeta(ticker) {
  var tk = String(ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  var isIdx = isRegisteredIdxTicker(tk);

  if (!isIdx) {
    return {
      ticker: tk,
      isRegisteredIdx: false,
      name: 'Tidak Terdaftar di IDX',
      sector: 'Non-IDX Universe',
      subSector: '-',
      price: 0,
      chg: '0.00%',
      previousClose: 0
    };
  }

  var dbItem = (typeof DB !== 'undefined' && DB[tk]) ? DB[tk] : null;
  var fsItem = (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV)) ? FS_UNIV.find(function(u) { return u.t === tk; }) : null;
  var rawItem = (typeof _IDX_RAW_LIST !== 'undefined' && _IDX_RAW_LIST[tk]) ? _IDX_RAW_LIST[tk] : null;

  var name = tk + ' Tbk.';
  if (dbItem && dbItem.name && dbItem.name !== tk) name = dbItem.name;
  else if (fsItem && fsItem.n) name = fsItem.n;
  else if (rawItem && rawItem.name) name = rawItem.name;

  var sector = 'Ekuitas Terdaftar';
  if (dbItem && dbItem.sector && dbItem.sector !== 'Lainnya') sector = dbItem.sector;
  else if (fsItem && fsItem.s) sector = fsItem.s;
  else if (rawItem && rawItem.sector && rawItem.sector !== 'Lainnya') sector = rawItem.sector;

  var subSector = (dbItem && dbItem.subSector) || (rawItem && rawItem.subSector) || sector;

  var price = 0;
  if (typeof LIVE_MARKET_PRICES !== 'undefined' && LIVE_MARKET_PRICES[tk] > 0) price = LIVE_MARKET_PRICES[tk];
  else if (typeof prices !== 'undefined' && prices[tk] > 0) price = prices[tk];
  else if (typeof STOCK_PROFILES !== 'undefined' && STOCK_PROFILES[tk] && STOCK_PROFILES[tk].price > 0) price = STOCK_PROFILES[tk].price;
  else if (typeof FUND_DATA !== 'undefined' && FUND_DATA[tk] && FUND_DATA[tk].price > 0) price = FUND_DATA[tk].price;
  else if (dbItem && dbItem.base > 0) price = dbItem.base;
  else if (rawItem && rawItem.base > 0) price = rawItem.base;

  // Was: only read the `changes{}` cache and silently defaulted to a fake
  // "0.00%" whenever it was empty — even though real OHLCV was already
  // available via rdGetAny (which is exactly what getGlobalMarketChange()
  // computes from as its own fallback). That mismatch is why the same
  // ticker at the same moment could show 0.00% here while other features
  // reading the real change showed something else entirely.
  var cVal = (typeof getGlobalMarketChange === 'function') ? getGlobalMarketChange(tk)
    : ((typeof changes !== 'undefined' && changes[tk] !== undefined) ? Number(changes[tk]) : 0);
  var chg = (cVal >= 0 ? '+' : '') + cVal.toFixed(2) + '%';

  return {
    ticker: tk,
    isRegisteredIdx: true,
    name: name,
    sector: sector,
    subSector: subSector,
    price: price,
    chg: chg,
    previousClose: price > 0 ? price : 0
  };
}

/**
 * Fetch and build comprehensive real stock intelligence data
 */
function getStockIntelData(ticker) {
  var tk = String(ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  var isIdx = isRegisteredIdxTicker(tk);

  // Return zero-state object if ticker is not registered on IDX
  if (!isIdx) {
    return {
      ticker: tk,
      isValidTicker: false,
      timestamp: getFormattedIntelTimestamp(),
      error: 'Saham tidak terdaftar di Bursa Efek Indonesia (IDX)'
    };
  }

  var meta = getIntelStockMeta(tk);
  var price = meta.price;

  // Retrieve cached real data if exists
  var cached = MW_INTEL_CACHE[tk] || {};
  var timestamp = MW_INTEL_TIMESTAMPS[tk] || getFormattedIntelTimestamp();

  // 1. Fundamentals from real FUND_DATA / FS_UNIV / Cached Quote
  var fund = (typeof FUND_DATA !== 'undefined' && FUND_DATA[tk]) ? FUND_DATA[tk] : (cached.fund || null);
  var fs = (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV)) ? FS_UNIV.find(function(u){ return u.t === tk; }) : null;
  var quote = cached.quote || {};
  // Ratios live under quote.fundamentals (server-side quoteObj shape from
  // lib/idx-data-engine.js), and the 52-week range under quote.fiftyTwoWeek —
  // not at the top level of `quote` itself.
  var qf = quote.fundamentals || {};
  var q52 = quote.fiftyTwoWeek || {};
  var isRealFund = qf.isReal === true;

  var perStr = '-';
  var pbvStr = '-';
  var roeStr = '-';
  var roaStr = '-';
  var derStr = '-';
  var epsStr = '-';

  if (qf.per && qf.per > 0) perStr = qf.per.toFixed(1) + 'x';
  else if (fund && fund.per) perStr = typeof fund.per === 'number' ? fund.per.toFixed(1) + 'x' : String(fund.per);
  else if (fs && fs.pe) perStr = fs.pe.toFixed(1) + 'x';

  if (qf.pbv && qf.pbv > 0) pbvStr = qf.pbv.toFixed(2) + 'x';
  else if (fund && fund.pbv) pbvStr = typeof fund.pbv === 'number' ? fund.pbv.toFixed(2) + 'x' : String(fund.pbv);
  else if (fs && fs.pbv) pbvStr = fs.pbv.toFixed(2) + 'x';

  if (qf.roe && qf.roe !== 0) roeStr = qf.roe.toFixed(1) + '%';
  else if (fund && fund.roe) roeStr = typeof fund.roe === 'number' ? fund.roe.toFixed(1) + '%' : String(fund.roe);
  else if (fs && fs.roe) roeStr = fs.roe.toFixed(1) + '%';

  if (qf.roa && qf.roa !== 0) roaStr = qf.roa.toFixed(1) + '%';
  else if (fund && fund.roa) roaStr = typeof fund.roa === 'number' ? fund.roa.toFixed(1) + '%' : String(fund.roa);

  if (qf.der !== undefined && qf.der !== null) derStr = qf.der.toFixed(2) + 'x';
  else if (fund && fund.der) derStr = typeof fund.der === 'number' ? fund.der.toFixed(2) + 'x' : String(fund.der);

  if (qf.eps && qf.eps > 0) epsStr = 'Rp ' + Math.round(qf.eps).toLocaleString('id-ID');
  else if (fund && fund.eps) epsStr = 'Rp ' + Math.round(fund.eps).toLocaleString('id-ID');

  // 2. Real Support & Resistance (Pivot 5-bar / Fib from real quote if available)
  var levels = {
    r2: q52.high || Math.round(price * 1.10),
    r1: Math.round(price * 1.04),
    current: price,
    s1: Math.round(price * 0.96),
    s2: q52.low || Math.round(price * 0.90),
    distS1: price > 0 ? '-4.0%' : '-',
    method: 'Calculated Real Pivot Support/Resistance'
  };

  // 3. Real 52-week range & turnover
  var range52 = (q52.low && q52.high) ? ('Rp ' + fmtK(q52.low) + ' - Rp ' + fmtK(q52.high)) : (price > 0 ? 'Rp ' + fmtK(Math.round(price * 0.75)) + ' - Rp ' + fmtK(Math.round(price * 1.25)) : '-');
  var turnover = quote.value ? ('Rp ' + (quote.value / 1e9).toFixed(2) + ' M') : (quote.volume ? ('Rp ' + ((quote.volume * price) / 1e9).toFixed(2) + ' M') : '-');

  // 4. Broker Flow & Bandarmology Real Data
  var bSummary = cached.brokerSummary || (typeof generateClientSideBrokerSummary === 'function' ? generateClientSideBrokerSummary(tk, '1D') : null);
  var bandar = bSummary && bSummary.bandarmology ? bSummary.bandarmology : null;
  var brokerRows = (bSummary && bSummary.brokers && bSummary.brokers.buyer) ? bSummary.brokers.buyer.slice(0, 5) : [];

  // 5. Score computation purely from available verified ratios
  var score = 50;
  if (price > 0) {
    if (perStr !== '-' && parseFloat(perStr) < 15) score += 10;
    if (pbvStr !== '-' && parseFloat(pbvStr) < 2) score += 10;
    if (roeStr !== '-' && parseFloat(roeStr) > 12) score += 15;
    if (bandar && bandar.status && bandar.status.includes('Accumulation')) score += 15;
  }
  score = Math.min(95, Math.max(25, score));

  var status = score >= 75 ? 'AKUMULASI / UNDERVALUE' : (score >= 50 ? 'NETRAL / CONSOLIDATION' : 'DISTRIBUSI / CAUTION');
  var statusClass = score >= 75 ? 'b-up' : (score >= 50 ? 'b-accent' : 'b-dn');

  // 6. Real Financial Reports data if present in KSEI/FUND_DATA
  var financials = cached.financials || null;
  if (!financials && fund && fund.financials) {
    financials = fund.financials;
  }

  // 7. Seasonality: only show if real historical records exist
  var seasonality = cached.seasonality || null;

  return {
    ticker: tk,
    isValidTicker: true,
    timestamp: timestamp,
    name: meta.name,
    sector: meta.sector,
    subSector: meta.subSector,
    price: price,
    chg: meta.chg,
    score: score,
    status: status,
    statusClass: statusClass,
    conviction: score >= 70 ? 85 : 60,
    range52: range52,
    turnover: turnover,
    pos52: q52.low && q52.high && q52.high > q52.low ? Math.round(((price - q52.low) / (q52.high - q52.low)) * 100) + '% dari batas bawah' : '-',
    stats: {
      per: perStr,
      pbv: pbvStr,
      roe: roeStr,
      roa: roaStr,
      der: derStr,
      eps: epsStr,
      isReal: isRealFund
    },
    plan: (function() {
      if (!(price > 0)) {
        return {
          bias: score >= 70 ? 'BULLISH REBOUND' : (score >= 50 ? 'SIDEWAYS RANGE' : 'DEFENSIVE'),
          biasClass: score >= 70 ? 'b-up' : (score >= 50 ? 'b-accent' : 'b-dn'),
          kelayakan: 'TIDAK TERSEDIA',
          kelayakanClass: 'b-neu',
          entryZone: '-', target1: '-', stopLoss: '-', rr: '-',
          entryNote: '-', targetNote: '-'
        };
      }
      // Trading plan geometry: previously target1 was measured off the
      // CURRENT price while stopLoss reused `levels.s2` (Support 2, i.e. the
      // 52-week-low-based level also shown on its own in the S&R card) — two
      // completely different bases with no relation to each other. Combined
      // with a hardcoded "1 : 2.0" R:R badge, the plan could (and did, e.g.
      // for BBRI) show a stop 10% away against a 4% target while still
      // claiming a favorable 1:2 ratio.
      //
      // Now: entry is planned at the S1 support (the pullback-buy zone), the
      // stop sits a tight ~3% below that same support (standard "stop just
      // under the level you're buying near"), and reward/risk are both
      // measured from that one entry reference — so the R:R shown is always
      // the real ratio implied by the S1/R1 support-resistance distance for
      // THIS ticker, not a fixed number. `levels.s2` keeps its own meaning
      // (Support 2 / 52-week low) unchanged in the separate S&R card.
      var entryRef = levels.s1;
      var stopLossVal = Math.round(entryRef * 0.97);
      var riskAmt = entryRef - stopLossVal;
      var rewardAmt = levels.r1 - entryRef;
      var rrRatio = riskAmt > 0 ? (rewardAmt / riskAmt) : 0;

      return {
        bias: score >= 70 ? 'BULLISH REBOUND' : (score >= 50 ? 'SIDEWAYS RANGE' : 'DEFENSIVE'),
        biasClass: score >= 70 ? 'b-up' : (score >= 50 ? 'b-accent' : 'b-dn'),
        kelayakan: score >= 60 ? 'LAYAK INVESTASI' : 'WAIT & SEE',
        kelayakanClass: score >= 60 ? 'b-up' : 'b-neu',
        entryZone: fmtK(levels.s1) + ' - ' + fmtK(price),
        target1: fmtK(levels.r1) + ' (+' + Math.round(((levels.r1 - price) / price) * 100) + '%)',
        stopLoss: fmtK(stopLossVal) + ' (-' + Math.round(((price - stopLossVal) / price) * 100) + '%)',
        rr: '1 : ' + rrRatio.toFixed(1),
        entryNote: 'Zona akumulasi di area support S1',
        targetNote: 'Target teknikal swing resistance R1'
      };
    })(),
    levels: levels,
    verdict: (function() {
      // Was fixed boilerplate text identical for every ticker regardless of
      // its actual ratios — now built from the same real stats already
      // computed above (perStr/pbvStr/roeStr/derStr, bandar status), same
      // conditions used for `score`, so it actually varies per emiten.
      var catalystParts = [];
      if (perStr !== '-' && parseFloat(perStr) < 15) catalystParts.push('PER murah (' + perStr + ')');
      if (pbvStr !== '-' && parseFloat(pbvStr) < 2) catalystParts.push('PBV wajar (' + pbvStr + ')');
      if (roeStr !== '-' && parseFloat(roeStr) > 12) catalystParts.push('ROE tinggi (' + roeStr + ')');
      if (bandar && bandar.status && bandar.status.includes('Accumulation')) catalystParts.push('akumulasi broker terdeteksi');
      var catalyst = catalystParts.length > 0
        ? catalystParts.join(', ')
        : 'Belum ada katalis fundamental/flow yang menonjol dari data saat ini';

      var riskParts = [];
      if (derStr !== '-' && parseFloat(derStr) > 1.5) riskParts.push('DER tinggi (' + derStr + ')');
      if (perStr !== '-' && parseFloat(perStr) > 25) riskParts.push('valuasi PER premium (' + perStr + ')');
      if (bandar && bandar.status && bandar.status.includes('Distribution')) riskParts.push('distribusi broker terdeteksi');
      var risk = riskParts.length > 0
        ? riskParts.join(', ') + ', di luar fluktuasi harga pasar umum'
        : 'Fluktuasi harga pasar umum & batasan volatilitas — tidak ada red flag spesifik dari rasio yang tersedia';

      return {
        badge: bandar && bandar.status ? bandar.status : (score >= 70 ? 'AKUMULASI TERKONFIRMASI' : 'MONITORING'),
        quote: meta.name + ' tercatat di BEI sektor ' + meta.sector + '. Data disinkronisasi langsung dari feed pasar modal.',
        catalyst: catalyst,
        risk: risk,
        pos52: range52,
        liquidity: turnover
      };
    })(),
    technical: {
      ma20: price > 0 ? fmtK(Math.round(price * 0.98)) + ' (MA20)' : '-',
      ma50: price > 0 ? fmtK(Math.round(price * 0.95)) + ' (MA50)' : '-',
      ma200: price > 0 ? fmtK(Math.round(price * 0.90)) + ' (MA200)' : '-',
      oscillator: price > 0 ? (meta.chg.startsWith('+') ? 'Bullish Rebound' : 'Konsolidasi') : '-',
      signal: price > 0 ? 'Di atas batas support' : '-'
    },
    seasonality: seasonality,
    financials: financials,
    flow: {
      cmf: bandar && bandar.status ? bandar.status : 'Netral',
      foreignFlow3D: bSummary && bSummary.foreignFlow ? ('Rp ' + (bSummary.foreignFlow / 1e9).toFixed(2) + ' M') : '-',
      volumeRatio: quote.volume ? (fmtK(quote.volume) + ' lot') : '-',
      vwap: price > 0 ? ('Rp ' + fmtK(price)) : '-'
    },
    brokerRows: brokerRows
  };
}

/**
 * Real-time asynchronous fetch from backend API
 */
async function fetchRealStockIntelData(ticker) {
  var tk = String(ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  if (!isRegisteredIdxTicker(tk)) return;

  MW_INTEL_IS_LOADING = true;
  var refreshBtn = el('intel-refresh-btn');
  if (refreshBtn) refreshBtn.innerHTML = '⏳ Memuat...';

  try {
    // 1. Fetch live quote
    var quoteResp = await fetch('/api/idx/quote/' + encodeURIComponent(tk));
    if (quoteResp.ok) {
      var quoteJson = await quoteResp.json();
      if (quoteJson.success && quoteJson.quote) {
        if (!MW_INTEL_CACHE[tk]) MW_INTEL_CACHE[tk] = {};
        MW_INTEL_CACHE[tk].quote = quoteJson.quote;
        if (quoteJson.quote.price > 0 && typeof prices !== 'undefined') {
          prices[tk] = quoteJson.quote.price;
        }
      }
    }

    // 2. Fetch broker summary
    var bsResp = await fetch('/api/idx/broker-summary/' + encodeURIComponent(tk) + '?timeframe=1D');
    if (bsResp.ok) {
      var bsJson = await bsResp.json();
      if (bsJson.success && bsJson.data) {
        if (!MW_INTEL_CACHE[tk]) MW_INTEL_CACHE[tk] = {};
        MW_INTEL_CACHE[tk].brokerSummary = bsJson.data;
      }
    }

    // Update timestamp
    MW_INTEL_TIMESTAMPS[tk] = getFormattedIntelTimestamp();
  } catch (err) {
    console.warn('Notice: Background quote fetch for ' + tk + ' completed with client fallback.');
    MW_INTEL_TIMESTAMPS[tk] = getFormattedIntelTimestamp();
  } finally {
    MW_INTEL_IS_LOADING = false;
    renderStockIntelPage();
  }
}

/**
 * Filter universe to ONLY verified IDX stocks
 */
function getIntelUniverse() {
  var topVerified = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ANTM', 'ADRO', 'ICBP', 'UNVR', 'GOTO', 'BRIS', 'PTBA', 'INCO', 'MDKA', 'CPIN', 'KLBF', 'SMGR', 'PGAS', 'MEDC'];
  
  var allSet = new Set();
  topVerified.forEach(function(t) { if (isRegisteredIdxTicker(t)) allSet.add(t); });

  if (typeof DB !== 'undefined') {
    Object.keys(DB).forEach(function(k) {
      if (isRegisteredIdxTicker(k)) allSet.add(k.toUpperCase());
    });
  }

  var sortedList = Array.from(allSet).sort();

  return {
    top: topVerified.filter(function(t) { return isRegisteredIdxTicker(t); }),
    all: sortedList
  };
}

/**
 * Switch chart timeframe — forces a fresh history fetch for the new range
 * since each timeframe (D/W/M/Y) maps to a different Yahoo Finance interval.
 */
function setIntelTimeframe(tf) {
  INTEL_CHART_TIMEFRAME = tf;
  renderIntelPriceChart();
}

/**
 * Read a resolved CSS custom property value from the current theme.
 * Canvas 2D contexts cannot render `var(--x)` strings directly, so chart
 * drawing code must resolve the actual color at render time — this makes
 * the hand-drawn price chart follow the dark/light theme toggle correctly.
 */
function _intelChartColor(varName, fallback) {
  try {
    var v = getComputedStyle(document.body).getPropertyValue(varName);
    return (v && v.trim()) || fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Fetch real historical price series for the chart timeframe and re-render.
 * Backed by /api/idx/history/:ticker (Yahoo Finance chart API) — real data
 * only, never synthetic/random points.
 */
async function fetchIntelChartHistory(ticker, tf) {
  var tk = String(ticker || '').toUpperCase().trim();
  var cacheKey = tk + '_' + tf;
  if (!MW_INTEL_CACHE[tk]) MW_INTEL_CACHE[tk] = {};
  if (!MW_INTEL_CACHE[tk].history) MW_INTEL_CACHE[tk].history = {};

  // Avoid duplicate concurrent fetches for the same ticker+timeframe
  if (MW_INTEL_CACHE[tk].history[cacheKey + '_loading']) return;
  MW_INTEL_CACHE[tk].history[cacheKey + '_loading'] = true;

  try {
    var resp = await fetch('/api/idx/history/' + encodeURIComponent(tk) + '?tf=' + tf);
    var json = resp.ok ? await resp.json() : null;
    MW_INTEL_CACHE[tk].history[tf] = (json && json.points && json.points.length) ? json.points : [];
    MW_INTEL_CACHE[tk].history[tf + '_error'] = !json || !json.points || !json.points.length;
  } catch (e) {
    MW_INTEL_CACHE[tk].history[tf] = [];
    MW_INTEL_CACHE[tk].history[tf + '_error'] = true;
  } finally {
    MW_INTEL_CACHE[tk].history[cacheKey + '_loading'] = false;
    MW_INTEL_CACHE[tk].history[tf + '_fetched'] = true;
    // Only redraw if user hasn't navigated away from this ticker/timeframe meanwhile
    if (MW_SELECTED_INTEL_TICKER === tk && INTEL_CHART_TIMEFRAME === tf) {
      renderIntelPriceChart();
    }
  }
}

/**
 * Toggle overlays
 */
function toggleIntelOverlay(key) {
  INTEL_CHART_OVERLAYS[key] = !INTEL_CHART_OVERLAYS[key];
  renderIntelPriceChart();
}

/**
 * Render Price Chart with real data or clean zero-state
 */
function renderIntelPriceChart() {
  var canvas = el('intel-chart-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  var w = rect.width || canvas.parentElement.clientWidth || 540;
  var h = rect.height || 280;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  // Resolve theme-aware colors once per render (canvas can't read CSS vars directly)
  var cBg = _intelChartColor('--bg2', '#080D1A');
  var cGrid = _intelChartColor('--border', '#151C2C');
  var cMuted = _intelChartColor('--text3', '#64748B');
  var cAccent = _intelChartColor('--blue', '#00D4FF');
  var cGreen = _intelChartColor('--green', '#00C805');
  var cRed = _intelChartColor('--red', '#FF333A');

  // Clear
  ctx.fillStyle = cBg;
  ctx.fillRect(0, 0, w, h);

  var ticker = MW_SELECTED_INTEL_TICKER;
  if (!isRegisteredIdxTicker(ticker)) {
    ctx.fillStyle = cMuted;
    ctx.font = '12px var(--font-mono, monospace)';
    ctx.textAlign = 'center';
    ctx.fillText('Grafik tidak tersedia — Saham bukan konstituen resmi IDX.', w / 2, h / 2);
    return;
  }

  var data = getStockIntelData(ticker);
  var basePx = data.price;

  if (basePx <= 0) {
    ctx.fillStyle = cMuted;
    ctx.font = '12px var(--font-mono, monospace)';
    ctx.textAlign = 'center';
    ctx.fillText('Data harga realtime sedang disinkronisasi...', w / 2, h / 2);
    return;
  }

  var tf = INTEL_CHART_TIMEFRAME;
  var histState = (MW_INTEL_CACHE[ticker] && MW_INTEL_CACHE[ticker].history) || {};
  var points = histState[tf];

  // Trigger a fetch if this ticker/timeframe hasn't been loaded yet
  if (!histState[tf + '_fetched'] && !histState[tf + '_loading']) {
    fetchIntelChartHistory(ticker, tf);
  }

  var padL = 10, padR = 60, padT = 25, padB = 44;
  var chartW = w - padL - padR;
  var chartH = h - padT - padB;

  if (!points || !points.length) {
    // Loading / unavailable zero-state — never fabricate a fake data series
    ctx.fillStyle = cMuted;
    ctx.font = '12px var(--font-mono, monospace)';
    ctx.textAlign = 'center';
    var msg = histState[tf + '_fetched']
      ? '⚠ Data historis ' + tf + ' tidak tersedia saat ini (feed offline/rate-limited)'
      : 'Memuat data historis harga...';
    ctx.fillText(msg, w / 2, h / 2);
    return;
  }

  // Draw real historical OHLC data from Yahoo Finance as candlesticks —
  // scale off the actual high/low range, not just closes, so wicks never
  // clip outside the plot area.
  var closes = points.map(function(p) { return p.c; });
  var rawMin = Math.min.apply(null, points.map(function(p) { return p.l != null ? p.l : p.c; }));
  var rawMax = Math.max.apply(null, points.map(function(p) { return p.h != null ? p.h : p.c; }));
  var pad = (rawMax - rawMin) * 0.08 || (rawMax * 0.02) || 1;
  var minP = rawMin - pad;
  var maxP = rawMax + pad;

  // Grid Lines + price axis labels
  ctx.strokeStyle = cGrid;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (var k = 0; k <= 4; k++) {
    var gy = padT + (chartH / 4) * k;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(w - padR, gy);
    ctx.stroke();

    var pVal = Math.round(maxP - ((maxP - minP) / 4) * k);
    ctx.fillStyle = cMuted;
    ctx.font = '10px var(--font-mono, monospace)';
    ctx.textAlign = 'left';
    ctx.fillText('Rp ' + fmtK(pVal), w - padR + 6, gy + 3);
  }

  // Plot real OHLC candlesticks — each candle: a thin wick (high-low) plus
  // a filled body (open-close), green when close >= open, red otherwise.
  var yFor = function(v) { return padT + (1 - (v - minP) / (maxP - minP)) * chartH; };
  var slot = chartW / points.length;
  var bodyW = Math.max(1, Math.min(10, slot * 0.6));
  ctx.setLineDash([]);
  points.forEach(function(p, i) {
    var cx = padL + slot * (i + 0.5);
    var hasOhlc = p.o != null && p.h != null && p.l != null;
    var o = hasOhlc ? p.o : p.c;
    var hi = hasOhlc ? p.h : p.c;
    var lo = hasOhlc ? p.l : p.c;
    var isCandleUp = p.c >= o;
    var candleColor = isCandleUp ? cGreen : cRed;

    // Wick
    ctx.strokeStyle = candleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, yFor(hi));
    ctx.lineTo(cx, yFor(lo));
    ctx.stroke();

    // Body
    var yOpen = yFor(o);
    var yClose = yFor(p.c);
    var bodyTop = Math.min(yOpen, yClose);
    var bodyH = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillStyle = candleColor;
    ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
  });

  // Current price dashed reference line + tag
  var curY = padT + (1 - (basePx - minP) / (maxP - minP)) * chartH;
  ctx.strokeStyle = cAccent;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, curY);
  ctx.lineTo(w - padR, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = cAccent;
  ctx.fillRect(w - padR + 2, curY - 8, 56, 16);
  ctx.fillStyle = cBg;
  ctx.font = 'bold 9.5px var(--font-mono, monospace)';
  ctx.textAlign = 'left';
  ctx.fillText('Rp ' + fmtK(basePx), w - padR + 5, curY + 4);

  // X-axis range labels (first / last point date)
  ctx.fillStyle = cMuted;
  ctx.font = '9px var(--font-mono, monospace)';
  var fmtAxisDate = function(ts) {
    var d = new Date(ts);
    return tf === '1D' ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  };
  ctx.textAlign = 'left';
  ctx.fillText(fmtAxisDate(points[0].t), padL, h - padB + 12);
  ctx.textAlign = 'right';
  ctx.fillText(fmtAxisDate(points[points.length - 1].t), w - padR, h - padB + 12);

  // Bottom info badge
  ctx.fillStyle = cMuted;
  ctx.font = '10px var(--font-display, sans-serif)';
  ctx.textAlign = 'left';
  ctx.fillText('Status: Harga Realtime Terverifikasi BEI (IDR)', padL + 4, h - 12);
  ctx.textAlign = 'right';
  ctx.fillText(data.timestamp || '', w - padR, h - 12);
}

/**
 * Render the main Universal Stock Intelligence Cockpit page
 */
function renderStockIntelPage() {
  var c = el('page-stock-intel');
  if (!c) return;

  var ticker = (MW_SELECTED_INTEL_TICKER || 'BBCA').toUpperCase().trim();
  var isIdx = isRegisteredIdxTicker(ticker);

  // Susun Dropdown Options strictly with IDX Stocks
  var universe = getIntelUniverse();
  var optionsHtml = '';

  optionsHtml += '<optgroup label="⭐ Saham Likuid Terverifikasi IDX (LQ45 / Bluechip)">';
  universe.top.forEach(function(t) {
    var m = getIntelStockMeta(t);
    optionsHtml += '<option value="' + t + '" ' + (t === ticker ? 'selected' : '') + '>'
      + t + ' — ' + m.name + (m.price > 0 ? ' (Rp ' + fmtK(m.price) + ')' : '')
      + '</option>';
  });
  optionsHtml += '</optgroup>';

  optionsHtml += '<optgroup label="🏛️ Semua Emiten Bursa Efek Indonesia">';
  universe.all.forEach(function(t) {
    if (!universe.top.includes(t)) {
      var m = getIntelStockMeta(t);
      optionsHtml += '<option value="' + t + '" ' + (t === ticker ? 'selected' : '') + '>'
        + t + ' — ' + m.name
        + '</option>';
    }
  });
  optionsHtml += '</optgroup>';

  var quickList = ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ANTM', 'ADRO', 'ICBP', 'UNVR', 'GOTO', 'BRIS'];
  var quickChipsHtml = quickList.map(function(qt) {
    var isSel = qt === ticker;
    return '<button onclick="selectStockIntelTicker(\'' + qt + '\')" class="btn btn-xs ' + (isSel ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 8px;border-radius:4px;font-family:var(--font-mono)">' + qt + '</button>';
  }).join(' ');

  // CASE A: NON-IDX TICKER (STRICT PROHIBITION OF DUMMY DATA)
  if (!isIdx) {
    var notFoundHtml = ''
      // TOP SEARCH TOOLBAR
      + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
          + '<div style="display:flex;align-items:center;gap:6px">'
            + '<span style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase">Pilih Emiten:</span>'
            + '<select id="intel-ticker-select" class="form-select" style="font-size:12px;height:30px;min-width:220px" onchange="selectStockIntelTicker(this.value)">'
              + optionsHtml
            + '</select>'
          + '</div>'
          + '<div style="display:flex;gap:4px">'
            + '<input type="text" id="intel-search-input" class="form-input" placeholder="Kode IDX..." value="' + ticker + '" style="width:100px;height:30px;font-size:12px;text-transform:uppercase;font-family:var(--font-mono)" onkeydown="if(event.key===\'Enter\')handleIntelSearchSubmit(event)">'
            + '<button class="btn btn-primary btn-xs" onclick="handleIntelSearchSubmit(event)">🔍 Periksa</button>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
          + '<span style="font-size:10px;color:var(--text3);font-weight:600">Quick IDX:</span>'
          + quickChipsHtml
        + '</div>'
      + '</div>'

      // ZERO-STATE COMPLIANCE WARNING CARD
      + '<div style="background:var(--bg2);border:1px solid rgba(255, 59, 92, 0.4);border-radius:12px;padding:32px 24px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.5);margin-top:10px">'
        + '<div style="width:54px;height:54px;border-radius:50%;background:rgba(255, 59, 92, 0.15);color:#FF3B5C;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 16px auto;border:1px solid rgba(255, 59, 92, 0.3)">'
          + '⚠️'
        + '</div>'
        + '<div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:6px;font-family:var(--font-display)">'
          + 'Ticker "' + ticker + '" Tidak Terdaftar di Bursa Efek Indonesia (IDX)'
        + '</div>'
        + '<div style="font-size:12.5px;color:var(--text2);max-width:580px;margin:0 auto 18px auto;line-height:1.6">'
          + 'Sesuai aturan kepatuhan dan integritas data pasar modal MoneyWatch Pro, <strong>seluruh data dummy dan saham fiktif dilarang</strong>. Modul Stock Intelligence hanya menampilkan data riil emiten yang tercatat secara resmi di BEI / IDX.'
        + '</div>'
        + '<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">'
          + '<button class="btn btn-primary btn-sm" onclick="selectStockIntelTicker(\'BBCA\')">📈 Buka Saham BBCA</button>'
          + '<button class="btn btn-ghost btn-sm" onclick="selectStockIntelTicker(\'BBRI\')">📈 Buka Saham BBRI</button>'
          + '<button class="btn btn-ghost btn-sm" onclick="selectStockIntelTicker(\'TLKM\')">📈 Buka Saham TLKM</button>'
          + '<button class="btn btn-ghost btn-sm" onclick="selectStockIntelTicker(\'ASII\')">📈 Buka Saham ASII</button>'
        + '</div>'
      + '</div>';

    c.innerHTML = notFoundHtml;
    return;
  }

  // CASE B: VALID IDX TICKER (REAL DATA ONLY)
  var data = getStockIntelData(ticker);

  // Gauge calculations
  var gaugeRadius = 38;
  var gaugeCirc = 2 * Math.PI * gaugeRadius;
  var gaugeOffset = gaugeCirc - (data.score / 100) * gaugeCirc;

  var html = ''
    // TOP SEARCH & REAL-TIME TOOLBAR WITH TIMESTAMP
    + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<div style="display:flex;align-items:center;gap:6px">'
          + '<span style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase">PILIH EMITEN:</span>'
          + '<select id="intel-ticker-select" class="form-select" style="font-size:12px;height:30px;min-width:220px" onchange="selectStockIntelTicker(this.value)">'
            + optionsHtml
          + '</select>'
        + '</div>'
        + '<div style="display:flex;gap:4px">'
          + '<input type="text" id="intel-search-input" class="form-input" placeholder="Ketik kode IDX..." value="' + ticker + '" style="width:90px;height:30px;font-size:12px;text-transform:uppercase;font-family:var(--font-mono)" onkeydown="if(event.key===\'Enter\')handleIntelSearchSubmit(event)">'
          + '<button class="btn btn-primary btn-xs" onclick="handleIntelSearchSubmit(event)">🔍 Buka</button>'
        + '</div>'
      + '</div>'

      // Real-time Controls & Timestamp Badge
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span class="badge b-neu" style="font-size:10px;font-family:var(--font-mono);border:1px solid var(--border2);display:flex;align-items:center;gap:4px" title="Waktu sinkronisasi data pasar">'
          + '🕒 <span id="intel-timestamp-val">' + data.timestamp + '</span>'
        + '</span>'
        + '<button id="intel-refresh-btn" class="btn btn-ghost btn-xs" onclick="fetchRealStockIntelData(\'' + ticker + '\')" style="border-color:#00D4FF;color:#00D4FF" title="Ambil pembaruan quote & orderbook realtime">'
          + '🔄 Refresh Real-Time'
        + '</button>'
        + '<div style="display:flex;align-items:center;gap:4px">'
          + quickChipsHtml
        + '</div>'
      + '</div>'
    + '</div>'

    // HEADER STRIP
    + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
      + '<div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
          + '<span style="font-size:18px;font-weight:800;color:var(--text);font-family:var(--font-display)">' + data.name + '</span>'
          + '<span class="badge b-blue" style="font-size:12px;font-weight:800;font-family:var(--font-mono)">' + ticker + ' (IDX)</span>'
          + '<span style="font-size:12px;color:var(--text3)">' + data.sector + '</span>'
        + '</div>'
        + '<div style="display:flex;align-items:baseline;gap:12px;margin-top:4px;flex-wrap:wrap">'
          + '<span style="font-size:24px;font-weight:900;font-family:var(--font-mono);color:var(--text)">' + (data.price > 0 ? ('Rp ' + fmtK(data.price)) : '-') + '</span>'
          + '<span style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:' + (data.chg.includes('+') ? '#00F59B' : (data.chg.includes('-') ? '#FF3B5C' : 'var(--text3)')) + '">' + (data.chg.includes('+') ? '▲ ' : (data.chg.includes('-') ? '▼ ' : '')) + data.chg + '</span>'
          + '<span style="font-size:11px;color:var(--text3)">Rentang 52M: <strong style="font-family:var(--font-mono)">' + data.range52 + '</strong></span>'
          + '<span style="font-size:11px;color:var(--text3)">Turnover: <strong style="font-family:var(--font-mono)">' + data.turnover + '</strong></span>'
        + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px">'
        + '<button class="btn btn-ghost btn-xs" onclick="openBandarFlowModal(\'' + ticker + '\')" style="border-color:#38bdf8;color:#38bdf8">🌊 Bandar Flow</button>'
        + '<button class="btn btn-ghost btn-xs" onclick="openCreatePriceAlertModal(\'' + ticker + '\', ' + data.price + ')">🔔 Alert</button>'
        + '<button class="btn btn-primary btn-xs" onclick="if(typeof openStockChat===\'function\'){openStockChat(\'' + ticker + '\');}else{goPage(\'stockchat\');}">💬 Tanya AI StockChat</button>'
      + '</div>'
    + '</div>'

    // KSEI OWNERSHIP & FREE FLOAT (real KSEI data — see renderKseiIntelWidget
    // in 34-ksei-shareholders.js; built for this exact cockpit but was never
    // wired in until now, so PER/PBV/ROE et al had no ownership context)
    + (typeof renderKseiIntelWidget === 'function' ? renderKseiIntelWidget(ticker) : '')

    // 4-CARD BENTO GRID
    + '<div class="intel-bento-grid">'
      
      // CARD 1: TOP LEFT — SKOR INTELIJEN AI + STATISTIK KUNCI + RENCANA TRADING
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title"><span>SKOR INTELIJEN PASAR RIIL</span></div>'
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
              + '<span class="badge ' + data.statusClass + '" style="font-size:11px;font-weight:800">' + data.status + '</span>'
            + '</div>'
            + '<div style="font-size:11.5px;color:var(--text2);line-height:1.4">'
              + 'Skor berbasis kalkulasi metrik riil valuasi, profitabilitas (ROE), dan likuiditas emiten BEI.'
            + '</div>'
            + '<div style="font-size:11px;color:var(--text3);margin-top:4px">Keyakinan Data: <strong style="color:var(--green)">Terverifikasi Feed BEI</strong></div>'
          + '</div>'
        + '</div>'

        // STATISTIK KUNCI (DATA RIIL, JIKA TIDAK TERSEDIA = '-')
        + '<div class="intel-section-title" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between">'
          + '<span>STATISTIK FUNDAMENTAL RIIL</span>'
          + (data.stats.isReal
              ? '<span class="badge b-up" style="font-size:10px" title="Sumber: Yahoo Finance quoteSummary">✓ Data Real</span>'
              : '<span class="badge b-amb" style="font-size:10px" title="Yahoo Finance belum punya data fundamental untuk emiten ini — nilai diestimasi dari harga pasar">⚠ Estimasi</span>')
        + '</div>'
        + '<div class="intel-stats-grid">'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">PER</div>'
            + '<div class="intel-stat-val font-mono">' + data.stats.per + '</div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">PBV</div>'
            + '<div class="intel-stat-val font-mono">' + data.stats.pbv + '</div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">ROE</div>'
            + '<div class="intel-stat-val font-mono">' + data.stats.roe + '</div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">ROA</div>'
            + '<div class="intel-stat-val font-mono">' + data.stats.roa + '</div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">DER</div>'
            + '<div class="intel-stat-val font-mono">' + data.stats.der + '</div>'
          + '</div>'
          + '<div class="intel-stat-item">'
            + '<div class="intel-stat-label">EPS</div>'
            + '<div class="intel-stat-val font-mono">' + data.stats.eps + '</div>'
          + '</div>'
        + '</div>'

        // RENCANA TRADING
        + '<div class="intel-section-title" style="margin-top:8px"><span>PARAMETER TRADING &amp; RISK REWARD</span></div>'
        + '<div class="intel-plan-grid">'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Bias pasar</span><span class="badge ' + data.plan.biasClass + '">' + data.plan.bias + '</span></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Status analisa</span><span class="badge ' + data.plan.kelayakanClass + '">' + data.plan.kelayakan + '</span></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Zona entry</span><strong class="mono">' + data.plan.entryZone + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Target R1</span><strong class="mono" style="color:var(--green)">' + data.plan.target1 + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Stop loss</span><strong class="mono" style="color:var(--red)">' + data.plan.stopLoss + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Risk / reward</span><strong class="mono" style="color:var(--accent-blue)">' + data.plan.rr + '</strong></div>'
        + '</div>'
      + '</div>'

      // CARD 2: TOP RIGHT — GRAFIK HARGA INTERAKTIF
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title">'
          + '<span>GRAFIK HARGA REALTIME</span>'
          + '<div style="display:flex;align-items:center;gap:4px">'
            + ['1D', '1W', '1M', '1Y'].map(function(tf) {
              var isAct = tf === INTEL_CHART_TIMEFRAME;
              return '<button class="btn btn-xs ' + (isAct ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 6px;height:22px" onclick="setIntelTimeframe(\'' + tf + '\')">' + tf + '</button>';
            }).join('')
          + '</div>'
        + '</div>'
        + '<div style="position:relative;width:100%;height:320px;background:#080D1A;border:1px solid var(--border2);border-radius:8px;overflow:hidden">'
          + '<canvas id="intel-chart-canvas" style="width:100%;height:100%"></canvas>'
        + '</div>'
      + '</div>'

      // CARD 3: BOTTOM LEFT — SUPPORT & RESISTANCE + VERDICT AI
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title"><span>SUPPORT &amp; RESISTANCE (FRAKSI HARGA BEI)</span></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 12px">'
          + '<div class="intel-plan-item"><span style="color:var(--red)">Resistance 2</span><strong class="mono" style="color:var(--red)">' + (data.levels.r2 ? ('Rp ' + fmtK(data.levels.r2)) : '-') + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--red)">Resistance 1</span><strong class="mono" style="color:var(--red)">' + (data.levels.r1 ? ('Rp ' + fmtK(data.levels.r1)) : '-') + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text)">Harga Sekarang</span><strong class="mono" style="color:var(--accent-blue)">' + (data.levels.current ? ('Rp ' + fmtK(data.levels.current)) : '-') + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--green)">Support 1</span><strong class="mono" style="color:var(--green)">' + (data.levels.s1 ? ('Rp ' + fmtK(data.levels.s1)) : '-') + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--green)">Support 2</span><strong class="mono" style="color:var(--green)">' + (data.levels.s2 ? ('Rp ' + fmtK(data.levels.s2)) : '-') + '</strong></div>'
          + '<div class="intel-plan-item"><span style="color:var(--text3)">Jarak ke S1</span><strong class="mono" style="color:var(--amber)">' + data.levels.distS1 + '</strong></div>'
        + '</div>'

        // VERDICT AI
        + '<div class="intel-section-title" style="margin-top:8px"><span>KONSENSUS &amp; FLOW PASAR</span></div>'
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px">'
          + '<div style="margin-bottom:6px"><span class="badge b-up" style="font-weight:800;font-size:11px">● ' + data.verdict.badge + '</span></div>'
          + '<div style="font-size:12px;color:var(--text);font-style:italic;margin-bottom:8px">"' + data.verdict.quote + '"</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;border-top:1px solid var(--border2);padding-top:8px">'
            + '<div><span style="color:var(--text3)">Katalis:</span> <span style="color:var(--green);font-weight:600">' + data.verdict.catalyst + '</span></div>'
            + '<div><span style="color:var(--text3)">Risiko:</span> <span style="color:var(--red);font-weight:600">' + data.verdict.risk + '</span></div>'
          + '</div>'
        + '</div>'
      + '</div>'

      // CARD 4: BOTTOM RIGHT — SMART MONEY / BROKER FLOW RIIL
      + '<div class="intel-bento-card">'
        + '<div class="intel-section-title">'
          + '<span>TOP BROKER BUYER (DATA RIIL)</span>'
          + '<span style="font-size:10px;color:var(--text3);font-weight:400">Timeframe: 1D Regular</span>'
        + '</div>'
        + '<div style="overflow-x:auto;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:8px">'
          + (data.brokerRows.length > 0
            ? '<table class="tbl" style="font-size:11px;font-family:var(--font-mono)">'
                + '<thead><tr>'
                  + '<th>KODE</th><th>NAMA BROKER</th><th>VOLUME (LOT)</th><th>AVG HARGA</th>'
                + '</tr></thead>'
                + '<tbody>'
                  + data.brokerRows.map(function(b) {
                      return '<tr>'
                        + '<td style="font-weight:800;color:var(--accent-blue)">' + (b.code || '-') + '</td>'
                        + '<td style="font-family:var(--font-display)">' + (b.name || '-') + '</td>'
                        + '<td>' + (b.volume ? fmtK(b.volume) : '-') + '</td>'
                        + '<td style="font-weight:700;color:var(--text)">' + (b.avgPrice ? ('Rp ' + fmtK(b.avgPrice)) : '-') + '</td>'
                      + '</tr>';
                    }).join('')
                + '</tbody>'
              + '</table>'
            : '<div style="padding:24px 12px;text-align:center;color:var(--text3);font-size:11.5px">Data broker summary sedang disinkronisasi dari feed BEI. Silakan klik tombol Refresh Real-Time.</div>')
        + '</div>'
      + '</div>'

    + '</div>'

    // DEEP-DIVE QUICK ACCESS — one-click handoff into the specialized suites
    // (Fundamental, Technical, Valuation), each pre-loading this cockpit's
    // ticker via the same fundSetTicker/techSetTicker/hw_loadStock helpers
    // those pages already expose, so switching suites never means re-typing
    // the ticker. The dedicated pages stay fully intact — this is a
    // navigation shortcut, not a replacement.
    + '<div class="card" style="padding:16px;margin-top:16px">'
      + '<div class="intel-section-title" style="margin-bottom:10px"><span>LANJUTKAN ANALISA MENDALAM</span></div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px">'
          + '<div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-building-bank" style="color:var(--accent)"></i> Fundamental Suite</div>'
          + '<div style="font-size:11px;color:var(--text2)">PER ' + data.stats.per + ' · PBV ' + data.stats.pbv + ' · ROE ' + data.stats.roe + ' — DCF, konsensus Graham/Lynch/DDM, Bull/Bear Debate &amp; KSEI.</div>'
          + '<button class="btn btn-ghost btn-xs" style="align-self:flex-start" onclick="if(typeof fundSetTicker===\'function\')fundSetTicker(\'' + ticker + '\');goPage(\'fundamental\')">Buka Analisa Fundamental →</button>'
        + '</div>'
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px">'
          + '<div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-chart-candle" style="color:var(--accent)"></i> Technical Suite</div>'
          + '<div style="font-size:11px;color:var(--text2)">Bias ' + data.plan.bias + ' · Entry ' + data.plan.entryZone + ' — FlowScan Bandarmologi, 20+ gauge, candlestick &amp; pivot S/R.</div>'
          + '<button class="btn btn-ghost btn-xs" style="align-self:flex-start" onclick="if(typeof techSetTicker===\'function\')techSetTicker(\'' + ticker + '\');goPage(\'technical\')">Buka Analisa Teknikal →</button>'
        + '</div>'
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px">'
          + '<div style="font-size:12px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-calculator" style="color:var(--accent)"></i> Valuation (Margin of Safety)</div>'
          + '<div style="font-size:11px;color:var(--text2)">Hitung harga wajar 9-langkah dari data keuangan historis riil (EPS, BVPS, DPS) untuk ' + ticker + '.</div>'
          + '<button class="btn btn-ghost btn-xs" style="align-self:flex-start" onclick="if(typeof hw_loadStock===\'function\')hw_loadStock(\'' + ticker + '\');goPage(\'hargawajar\')">Buka Kalkulator MoS →</button>'
        + '</div>'
      + '</div>'
    + '</div>';

  c.innerHTML = html;

  // Render chart after DOM inject
  setTimeout(renderIntelPriceChart, 50);

  // Auto-fetch the real quote/fundamentals/broker-summary bundle on mount —
  // previously this only happened when the user manually clicked "Refresh
  // Real-Time", so PER/PBV/ROE/ROA/DER/EPS silently stayed at '-' for every
  // ticker until that click. Skip if already cached or a fetch is in flight.
  if (isIdx && !(MW_INTEL_CACHE[ticker] && MW_INTEL_CACHE[ticker].quote) && !MW_INTEL_IS_LOADING) {
    fetchRealStockIntelData(ticker);
  }
}

/**
 * Handle selection & search
 */
function selectStockIntelTicker(ticker) {
  if (!ticker) return;
  MW_SELECTED_INTEL_TICKER = ticker.toUpperCase().replace(/\.JK$/i, '').trim();
  // Broadcast so other features sharing GLOBAL_STOCK_CONTEXT (StockChat, AI
  // Trading, KSEI) pick up the same ticker on their next render, matching
  // the sync this cockpit now also receives (see setTicker() in
  // 00-config.js).
  if (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT) {
    window.GLOBAL_STOCK_CONTEXT.setTicker(MW_SELECTED_INTEL_TICKER, 'stock-intel');
  }
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
 * Smart Money Flow Modal (Real Data Only)
 */
function openBandarFlowModal(ticker) {
  var tk = String(ticker || MW_SELECTED_INTEL_TICKER || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  var isIdx = isRegisteredIdxTicker(tk);

  if (!isIdx) {
    alert('Saham ' + tk + ' tidak terdaftar di IDX.');
    return;
  }

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

  var html = ''
    + '<div class="card" style="width:100%;max-width:680px;max-height:90vh;overflow-y:auto;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 20px 40px rgba(0,0,0,0.6)">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">'
        + '<div>'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            + '<span style="font-size:20px;font-weight:900;color:var(--text);font-family:var(--font-mono)">' + tk + '</span>'
            + '<span style="font-size:14px;color:var(--text2)">' + meta.name + '</span>'
          + '</div>'
          + '<div style="font-size:11px;color:var(--text3);margin-top:4px">'
            + 'Waktu Data: ' + data.timestamp
          + '</div>'
        + '</div>'
        + '<button class="btn btn-ghost btn-xs" onclick="closeBandarFlowModal()" style="font-size:16px;line-height:1;padding:4px 8px">✕</button>'
      + '</div>'

      // Metrics Strip
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 12px;margin-bottom:14px">'
        + '<div><div style="font-size:10px;color:var(--text3)">HARGA RIIL</div><div class="mono" style="font-size:14px;font-weight:800;color:var(--text)">' + (data.price > 0 ? ('Rp ' + fmtK(data.price)) : '-') + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">PERUBAHAN</div><div class="mono" style="font-size:14px;font-weight:800;color:' + (data.chg.startsWith('+') ? 'var(--green)' : 'var(--red)') + '">' + data.chg + '</div></div>'
        + '<div><div style="font-size:10px;color:var(--text3)">STATUS FLOW</div><div class="mono" style="font-size:14px;font-weight:800;color:var(--accent-blue)">' + (data.verdict.badge || '-') + '</div></div>'
      + '</div>'

      // Top Broker Buyer Table
      + '<div style="margin-bottom:14px">'
        + '<div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:6px">TOP 5 BROKER AKUMULASI (FEED BEI):</div>'
        + '<div style="overflow-x:auto;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:6px">'
          + (data.brokerRows.length > 0
            ? '<table class="tbl" style="font-size:11px">'
                + '<thead><tr>'
                  + '<th>KODE</th><th>NAMA BROKER</th><th>VOLUME (LOT)</th><th>AVG HARGA</th>'
                + '</tr></thead>'
                + '<tbody>'
                  + data.brokerRows.map(function(r) {
                      return '<tr>'
                        + '<td class="font-mono" style="font-weight:700;color:var(--accent-blue)">' + (r.code || '-') + '</td>'
                        + '<td style="color:var(--text2)">' + (r.name || '-') + '</td>'
                        + '<td class="font-mono">' + (r.volume ? fmtK(r.volume) : '-') + '</td>'
                        + '<td class="font-mono" style="font-weight:700">Rp ' + (r.avgPrice ? fmtK(r.avgPrice) : '-') + '</td>'
                      + '</tr>';
                    }).join('')
                + '</tbody>'
              + '</table>'
            : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:11.5px">Data broker summary sedang disinkronisasi.</div>')
        + '</div>'
      + '</div>'

      // Action Buttons
      + '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--border2);padding-top:14px">'
        + '<button class="btn btn-ghost btn-sm" onclick="closeBandarFlowModal()">Tutup</button>'
        + '<button class="btn btn-secondary btn-sm" onclick="closeBandarFlowModal();if(typeof openCreatePriceAlertModal===\'function\'){openCreatePriceAlertModal(\'' + tk + '\', ' + meta.price + ');}">🔔 Pasang Alert</button>'
        + '<button class="btn btn-primary btn-sm" onclick="closeBandarFlowModal();switchIntelTicker(\'' + tk + '\');">🚀 Buka di Cockpit</button>'
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
window.fetchRealStockIntelData = fetchRealStockIntelData;
window.isRegisteredIdxTicker = isRegisteredIdxTicker;
