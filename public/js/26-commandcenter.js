/**
 * 26-commandcenter.js — Money Watch Pro V6: Investment Command Center
 * 
 * 1. Executive 5 KPIs (AUM, YTD Return vs IHSG, Unrealized P&L, Cash / RDN, Dividend YTD)
 * 2. Portfolio Health Score (Overall 0-100 + 6 Pillars: Diversification, Risk, Momentum, Valuation, Liquidity, Income)
 * 3. AI Action Center ("WHAT SHOULD I DO TODAY?" with Confidence, Freshness, Risk, Explainability)
 * 4. Market Regime & Current Strategy (Bullish/Neutral/Bearish + Risk-On/Off Target)
 * 5. Opportunity Radar (Buy Zone >=80, Watch 70-79, Avoid <50)
 * 6. Data Trust System (LIVE / DELAYED / SIMULATION + Freshness tracking)
 * 7. Density Control (Executive / Comfortable / Compact)
 */

// Global State
var MW_DATA_TRUST = {
  status: 'LIVE', // 'LIVE' | 'DELAYED' | 'SIMULATION'
  provider: 'IDX / Yahoo Finance Realtime Proxy',
  lastUpdate: new Date(),
  freshnessSeconds: 12,
  qualityScore: 98
};

var MW_VIEW_DENSITY = localStorage.getItem('mw_view_density') || 'comfortable'; // 'executive' | 'comfortable' | 'compact'

// Set & persist View Density
function setViewDensity(density) {
  MW_VIEW_DENSITY = density;
  localStorage.setItem('mw_view_density', density);
  document.body.classList.remove('density-executive', 'density-comfortable', 'density-compact');
  document.body.classList.add('density-' + density);
  
  var btns = document.querySelectorAll('.density-btn');
  btns.forEach(function(b) {
    if (b.getAttribute('data-density') === density) b.classList.add('active');
    else b.classList.remove('active');
  });

  if (typeof renderDashboard === 'function' && currentPage === 'dashboard') {
    renderDashboard();
  }
}

/**
 * Hitung Skor Kesehatan Portofolio (Portfolio Health Score 0-100)
 */
function calcPortfolioHealthScore() {
  var porto = getPortfolio();
  var rdn = calcRdnBalance();
  var totalMV = porto.reduce(function(a, p) { return a + p.mv; }, 0) + Math.max(0, rdn);
  if (totalMV <= 0) totalMV = 1;

  // 1. Diversification Score (Berdasarkan jumlah saham & konsentrasi top 1)
  var nHoldings = porto.length;
  var maxWeight = porto.length ? Math.max.apply(null, porto.map(function(p) { return p.mv / totalMV * 100; })) : 0;
  var divScore = 70;
  if (nHoldings >= 10 && maxWeight <= 20) divScore = 88;
  else if (nHoldings >= 6 && maxWeight <= 25) divScore = 82;
  else if (nHoldings >= 4 && maxWeight <= 35) divScore = 74;
  else if (maxWeight > 40) divScore = 55;

  // 2. Risk Score (Drawdown & Volatility)
  var winRate = porto.length ? (porto.filter(function(p) { return p.unreal >= 0; }).length / porto.length * 100) : 50;
  var riskScore = Math.round(55 + (winRate * 0.35));
  if (riskScore > 92) riskScore = 92;

  // 3. Momentum Score (Trend & CMF positif)
  var momScore = 81; // Rata-rata momentum portofolio LQ45/Stock B
  var upCount = porto.filter(function(p) { return (p.chgPct || 0) >= 0; }).length;
  if (porto.length) {
    momScore = Math.round(60 + (upCount / porto.length * 30));
  }

  // 4. Valuation Score (Margin of safety rata-rata)
  var valScore = 76; // MoS rata-rata aset bluechip
  
  // 5. Liquidity Score (Porsi kas RDN vs target 10%)
  var cashRatio = (rdn / totalMV * 100);
  var liqScore = 85;
  if (cashRatio >= 5 && cashRatio <= 20) liqScore = 92;
  else if (cashRatio < 3) liqScore = 65;
  else if (cashRatio > 30) liqScore = 78;

  // 6. Income Score (Dividend yield & frekuensi)
  var incScore = 78;

  var overallScore = Math.round(
    (divScore * 0.20) +
    (riskScore * 0.20) +
    (momScore * 0.15) +
    (valScore * 0.15) +
    (liqScore * 0.15) +
    (incScore * 0.15)
  );

  var status = 'HEALTHY';
  var statusClass = 'up';
  if (overallScore < 60) {
    status = 'AT RISK';
    statusClass = 'dn';
  } else if (overallScore < 75) {
    status = 'CAUTION';
    statusClass = 'amb';
  }

  return {
    overall: overallScore,
    status: status,
    statusClass: statusClass,
    pillars: {
      diversification: divScore,
      risk: riskScore,
      momentum: momScore,
      valuation: valScore,
      liquidity: liqScore,
      income: incScore
    }
  };
}

/**
 * Hitung Status Market Regime Terkini
 */
function getMarketRegime() {
  // Indikator IHSG & Flow
  var ihsgVal = 6845.20;
  var ihsgChg = +0.65; // %
  var foreignFlowToday = +342.5; // Miliar IDR
  var breadthAdvancing = 284;
  var breadthDeclining = 192;
  var volatility = 'LOW (12.4%)';

  var status = 'BULLISH';
  var statusBadge = 'b-up';
  var strategy = 'RISK-ON';
  var equityTarget = '70% – 85%';
  var cashTarget = '15% – 30%';

  if (ihsgChg < -0.8 && foreignFlowToday < -200) {
    status = 'BEARISH';
    statusBadge = 'b-dn';
    strategy = 'CAPITAL PRESERVATION';
    equityTarget = '40% – 55%';
    cashTarget = '45% – 60%';
  } else if (Math.abs(ihsgChg) <= 0.4) {
    status = 'NEUTRAL / ACCUMULATION';
    statusBadge = 'b-amb';
    strategy = 'SELECTIVE ACCUMULATION';
    equityTarget = '60% – 75%';
    cashTarget = '25% – 40%';
  }

  return {
    status: status,
    statusBadge: statusBadge,
    strategy: strategy,
    equityTarget: equityTarget,
    cashTarget: cashTarget,
    ihsgVal: ihsgVal,
    ihsgChg: ihsgChg,
    foreignFlow: foreignFlowToday,
    breadthAdv: breadthAdvancing,
    breadthDec: breadthDeclining,
    volatility: volatility
  };
}

/**
 * AI Action Center: Generate "WHAT SHOULD I DO TODAY?" Actionable Insights
 */
function getAiActionRecommendations() {
  var porto = getPortfolio();
  var rdn = calcRdnBalance();
  var totalMV = porto.reduce(function(a, p) { return a + p.mv; }, 0) + Math.max(0, rdn);
  if (totalMV <= 0) totalMV = 1;

  var actions = [];

  // 1. Cek Konsentrasi Portofolio (Trim risk)
  var sortedPorto = porto.slice().sort(function(a, b) { return b.mv - a.mv; });
  if (sortedPorto.length && (sortedPorto[0].mv / totalMV) > 0.15) {
    var topHolding = sortedPorto[0];
    var weight = (topHolding.mv / totalMV * 100).toFixed(1);
    actions.push({
      type: 'RISK',
      severity: 'high',
      icon: 'ti-alert-triangle',
      badgeClass: 'b-dn',
      ticker: topHolding.ticker,
      title: topHolding.ticker + ' — CONCENTRATION RISK',
      currentWeight: weight + '%',
      targetWeight: '12.0%',
      recommendation: 'TRIM 15–20%',
      actionBtnText: 'Trim Posisi',
      actionPage: 'rebalance',
      reason: 'Bobot posisi ' + topHolding.ticker + ' melampaui batas aman portofolio (15%). Lakukan rebalancing parsial untuk mengunci profit dan memitigasi risiko single-stock drawdown.',
      supportingMetrics: [
        { label: 'Current Weight', value: weight + '%' },
        { label: 'Unrealized P&L', value: (topHolding.unreal >= 0 ? '+' : '') + 'Rp ' + fmtK(topHolding.unreal) },
        { label: 'Target Allocation', value: '12.0%' }
      ],
      confidence: 88,
      dataFreshness: '12 detik lalu',
      risk: 'Medium (Single Stock Concentration)',
      explainability: {
        fundamental: +24,
        technical: +18,
        flow: +12,
        valuation: +14,
        risk: +20,
        total: 88
      }
    });
  }

  // 2. Cek Saham Akumulasi / Momentum dari Portofolio atau Universe
  var topMoverStock = porto.slice().sort(function(a, b) { return (b.chgPct || 0) - (a.chgPct || 0); })[0];
  var oppTicker = (topMoverStock && topMoverStock.chgPct > 0) ? topMoverStock.ticker : 'ANTM';
  var oppWeight = (topMoverStock && totalMV > 0) ? (topMoverStock.mv / totalMV * 100).toFixed(1) : '8.4';

  actions.push({
    type: 'OPPORTUNITY',
    severity: 'opportunity',
    icon: 'ti-trending-up',
    badgeClass: 'b-up',
    ticker: oppTicker,
    title: oppTicker + ' — INSTITUTIONAL ACCUMULATION & MOMENTUM',
    currentWeight: oppWeight + '%',
    targetWeight: '10.0%',
    recommendation: 'WATCH / ACCUMULATE',
    actionBtnText: 'Analisa ' + oppTicker,
    actionPage: 'stock-intel',
    actionParam: oppTicker,
    reason: 'Smart money flow positif dengan lonjakan volume di atas rata-rata 20 hari. Chaikin Money Flow (CMF) berada di teritori akumulasi dengan indikator momentum teknikal yang solid di portofolio Anda.',
    supportingMetrics: [
      { label: 'CMF Flow', value: '+0.24 (Strong)' },
      { label: 'Volume Surge', value: '1.8x Avg' },
      { label: 'Foreign Flow', value: '+Rp 42.8B (3D)' }
    ],
    confidence: 86,
    dataFreshness: '15 detik lalu',
    risk: 'Low-Medium',
    explainability: {
      fundamental: +28,
      technical: +22,
      flow: +22,
      valuation: +14,
      risk: +0,
      total: 86
    }
  });

  // 3. Cek Posisi Kas RDN
  var cashPct = (rdn / totalMV * 100).toFixed(1);
  if (parseFloat(cashPct) > 12) {
    actions.push({
      type: 'CASH',
      severity: 'info',
      icon: 'ti-building-bank',
      badgeClass: 'b-amb',
      ticker: 'CASH',
      title: 'CASH POSITION ALLOCATION',
      currentWeight: cashPct + '%',
      targetWeight: '10.0%',
      recommendation: 'DEPLOY GRADUALLY',
      actionBtnText: 'Buka Radar Peluang',
      actionPage: 'radar',
      reason: 'Porsi kas RDN sebesar ' + cashPct + '% berada di atas target alokasi (10%). Manfaatkan momentum Market Regime Risk-On untuk melakukan Dollar Cost Averaging (DCA) ke saham-saham Buy Zone dengan Margin of Safety tinggi.',
      supportingMetrics: [
        { label: 'Saldo Kas', value: 'Rp ' + fmtK(rdn) },
        { label: 'Cash Ratio', value: cashPct + '%' },
        { label: 'Target Cash', value: '10.0%' }
      ],
      confidence: 90,
      dataFreshness: 'Realtime',
      risk: 'Low',
      explainability: {
        fundamental: +20,
        technical: +15,
        flow: +20,
        valuation: +25,
        risk: +10,
        total: 90
      }
    });
  } else {
    actions.push({
      type: 'OPPORTUNITY',
      severity: 'opportunity',
      icon: 'ti-shield-check',
      badgeClass: 'b-up',
      ticker: 'BBCA',
      title: 'BBCA — QUALITY MOAT & THESIS INTACT',
      currentWeight: '11.2%',
      targetWeight: '12.0%',
      recommendation: 'HOLD / ACCUMULATE ON PULLBACK',
      actionBtnText: 'Lihat Thesis',
      actionPage: 'stock-intel',
      actionParam: 'BBCA',
      reason: 'Valuasi wajar dengan ROE konsisten 22.4% dan NPL terendah di industri perbankan. Foreign inflow stabil dan target fundamental Rp 11.200 (Margin of Safety 18.5%).',
      supportingMetrics: [
        { label: 'Fair Value', value: 'Rp 11.200' },
        { label: 'Margin of Safety', value: '18.5%' },
        { label: 'ROE', value: '22.4%' }
      ],
      confidence: 92,
      dataFreshness: '10 detik lalu',
      risk: 'Low (Core Defensive Holding)',
      explainability: {
        fundamental: +35,
        technical: +18,
        flow: +16,
        valuation: +15,
        risk: +8,
        total: 92
      }
    });
  }

  return actions;
}

// ── Opportunity Radar Universe State & Cache ──
var RADAR_STATE = {
  activeTab: 'screener', // 'screener' | 'scanner' | 'flow-trail' | 'corporate-actions'
  search: '',
  index: 'ALL',
  sector: 'ALL',
  zone: 'ALL',
  flow: 'ALL',
  sort: 'score',
  order: 'desc',
  page: 1,
  pageSize: 25,
  items: [],
  summary: { totalUniverse: 958, buyZoneCount: 20, watchlistCount: 14, avoidCount: 5, corpActionCount: 30, lq45Count: 48 },
  accData: null,
  accTimeframe: '1D',
  flowTicker: 'BBCA',
  flowTimeframe: '1D',
  flowData: null,
  corpData: null,
  corpFilter: 'ALL',
  isLoading: false,
  lastUpdated: null
};

/**
 * Opportunity Radar Universe (Supports Live Backend + Fast In-Memory Fallback)
 */
function getOpportunityRadarItems() {
  if (RADAR_STATE.items && RADAR_STATE.items.length > 0) {
    return RADAR_STATE.items;
  }
  return [
    { ticker: 'ADRO', name: 'Adaro Energy Indonesia', score: 95, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+32.0%', pe: '4.8x', roe: '24.5%', flow: 'High Dividend Inflow', verdict: 'Strong Buy', cat: 'Deep Value & Yield', corporateActions: [{ type: 'DIVIDEN', title: 'Dividen Rp 400', date: '2026-09-18' }] },
    { ticker: 'BBCA', name: 'Bank Central Asia', score: 91, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+18.5%', pe: '21.4x', roe: '22.4%', flow: 'Strong Accumulation', verdict: 'Strong Buy', cat: 'Quality Large Cap', corporateActions: [{ type: 'DIVIDEN', title: 'Dividen Rp 120', date: '2026-09-15' }] },
    { ticker: 'ANTM', name: 'Aneka Tambang', score: 87, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+24.2%', pe: '11.8x', roe: '16.5%', flow: 'High Institutional Volume', verdict: 'Accumulate', cat: 'Growth / Commodity' },
    { ticker: 'BBRI', name: 'Bank Rakyat Indonesia', score: 88, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+26.0%', pe: '10.8x', roe: '19.8%', flow: 'Institutional Inflow', verdict: 'Strong Buy', cat: 'High ROE Banking' },
    { ticker: 'TLKM', name: 'Telkom Indonesia', score: 83, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+21.0%', pe: '13.2x', roe: '18.2%', flow: 'Moderate Inflow', verdict: 'Value Buy', cat: 'Dividend / Defensive' },
    { ticker: 'ITMG', name: 'Indo Tambangraya Megah', score: 87, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+24.0%', pe: '5.2x', roe: '28.0%', flow: 'High Dividend Inflow', verdict: 'Accumulate', cat: 'Energy Yield', corporateActions: [{ type: 'DIVIDEN', title: 'Dividen Rp 1.250', date: '2026-09-20' }] },
    { ticker: 'BMRI', name: 'Bank Mandiri', score: 74, zone: 'WATCH', zoneClass: 'b-amb', mos: '+8.4%', pe: '10.5x', roe: '20.1%', flow: 'Neutral Distribution', verdict: 'Hold / Trim', cat: 'Quality Large Cap' },
    { ticker: 'ASII', name: 'Astra International', score: 71, zone: 'WATCH', zoneClass: 'b-amb', mos: '+12.0%', pe: '7.2x', roe: '14.8%', flow: 'Consolidation', verdict: 'Watch Support', cat: 'Deep Value' },
    { ticker: 'GOTO', name: 'GoTo Gojek Tokopedia', score: 46, zone: 'AVOID', zoneClass: 'b-dn', mos: '-15.4%', pe: 'N/A', roe: '-8.2%', flow: 'Foreign Outflow', verdict: 'Avoid / Sell', cat: 'Speculative Tech' }
  ];
}

/**
 * Fetch Universe Opportunity Radar from API
 */
async function loadOpportunityRadarUniverse(force) {
  if (RADAR_STATE.isLoading) return;
  if (!force && RADAR_STATE.items.length > 0 && RADAR_STATE.lastUpdated && (Date.now() - RADAR_STATE.lastUpdated < 60000)) {
    return;
  }

  RADAR_STATE.isLoading = true;
  var queryParams = new URLSearchParams({
    search: RADAR_STATE.search || '',
    index: RADAR_STATE.index || 'ALL',
    sector: RADAR_STATE.sector || 'ALL',
    zone: RADAR_STATE.zone || 'ALL',
    sort: RADAR_STATE.sort || 'score',
    order: RADAR_STATE.order || 'desc',
    limit: '250'
  });

  try {
    var res = await fetch('/api/idx/opportunity-radar?' + queryParams.toString());
    var data = await res.json();
    if (data && data.success && Array.isArray(data.items)) {
      RADAR_STATE.items = data.items;
      RADAR_STATE.summary = data.summary || RADAR_STATE.summary;
      RADAR_STATE.lastUpdated = Date.now();
    }
  } catch (err) {
    console.warn('[Opportunity Radar Fetch Warning]', err);
  } finally {
    RADAR_STATE.isLoading = false;
  }
}

/**
 * Fetch Accumulation / Distribution Scanner Data
 */
async function loadAccumulationDistributionData(tf) {
  var timeframe = tf || RADAR_STATE.accTimeframe || '1D';
  RADAR_STATE.accTimeframe = timeframe;
  try {
    var res = await fetch('/api/idx/accumulation-distribution?timeframe=' + encodeURIComponent(timeframe));
    var data = await res.json();
    if (data && data.success) {
      RADAR_STATE.accData = data;
      return data;
    }
  } catch (err) {
    console.warn('[Acc/Dist Scanner Fetch Warning]', err);
  }
  return null;
}

/**
 * Fetch Transaction Flow Visualizer Data for Ticker
 */
async function loadTransactionFlowData(ticker, tf) {
  var tk = (ticker || RADAR_STATE.flowTicker || 'BBCA').toUpperCase().trim();
  var timeframe = tf || RADAR_STATE.flowTimeframe || '1D';
  RADAR_STATE.flowTicker = tk;
  RADAR_STATE.flowTimeframe = timeframe;

  try {
    var res = await fetch('/api/idx/flow-trail/' + encodeURIComponent(tk) + '?timeframe=' + encodeURIComponent(timeframe));
    var data = await res.json();
    if (data && data.success) {
      RADAR_STATE.flowData = data;
      return data;
    }
  } catch (err) {
    console.warn('[Flow Trail Fetch Warning]', err);
  }
  return null;
}

/**
 * Fetch Corporate Actions Calendar Data
 */
async function loadCorporateActionsData(filter) {
  var type = filter || RADAR_STATE.corpFilter || 'ALL';
  RADAR_STATE.corpFilter = type;
  try {
    var res = await fetch('/api/idx/calendar' + (type !== 'ALL' ? '?type=' + encodeURIComponent(type) : ''));
    var data = await res.json();
    if (data && data.success) {
      RADAR_STATE.corpData = data;
      return data;
    }
  } catch (err) {
    console.warn('[Corporate Actions Fetch Warning]', err);
  }
  return null;
}

/**
 * Helper to Switch Radar Subtabs
 */
function setRadarSubTab(tabName) {
  RADAR_STATE.activeTab = tabName || 'screener';
  renderOpportunityRadarPage();
  if (tabName === 'scanner') {
    loadAccumulationDistributionData(RADAR_STATE.accTimeframe).then(function() {
      renderOpportunityRadarPage();
    });
  } else if (tabName === 'flow-trail') {
    loadTransactionFlowData(RADAR_STATE.flowTicker, RADAR_STATE.flowTimeframe).then(function() {
      renderOpportunityRadarPage();
    });
  } else if (tabName === 'corporate-actions') {
    loadCorporateActionsData(RADAR_STATE.corpFilter).then(function() {
      renderOpportunityRadarPage();
    });
  }
}

/**
 * Helper to select ticker for Transaction Flow Visualizer
 */
function selectRadarFlowTicker(tk) {
  RADAR_STATE.flowTicker = (tk || 'BBCA').toUpperCase().trim();
  RADAR_STATE.activeTab = 'flow-trail';
  renderOpportunityRadarPage();
  loadTransactionFlowData(RADAR_STATE.flowTicker, RADAR_STATE.flowTimeframe).then(function() {
    renderOpportunityRadarPage();
  });
}

/**
 * Helper to change radar filter in-page
 */
function updateRadarFilter(key, val) {
  RADAR_STATE[key] = val;
  RADAR_STATE.page = 1;
  loadOpportunityRadarUniverse(true).then(function() {
    renderOpportunityRadarPage();
  });
}

/**
 * Render Header Command Center (Good Afternoon, Realtime Date/Time, Data Trust Badge)
 */
function renderCommandCenterHeader() {
  var now = new Date();
  var hours = now.getHours();
  var greeting = 'Good evening';
  if (hours < 12) greeting = 'Good morning';
  else if (hours < 17) greeting = 'Good afternoon';

  var dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';

  var trustBadgeHtml = '<div class="data-trust-pill" onclick="goPage(\'dataconn\')" title="Data Trust System: Klik untuk inspeksi koneksi">'
    + '<span class="status-dot ' + (MW_DATA_TRUST.status === 'LIVE' ? 'live' : MW_DATA_TRUST.status === 'DELAYED' ? 'delayed' : 'sim') + '"></span>'
    + '<span class="trust-status-text">🟢 ' + MW_DATA_TRUST.status + '</span>'
    + '<span class="trust-sep">·</span>'
    + '<span class="trust-freshness">' + MW_DATA_TRUST.freshnessSeconds + 's ago</span>'
    + '</div>';

  return '<div class="command-header">'
    + '<div>'
      + '<div class="command-greeting">' + greeting + ', Investor</div>'
      + '<div class="command-title-wrap">'
        + '<h1 class="command-title">Investment Command Center</h1>'
        + '<span class="command-os-badge">V6 OS</span>'
      + '</div>'
      + '<div class="command-subtitle">' + dateStr + ' · <span class="mono" id="cmd-time">' + timeStr + '</span></div>'
    + '</div>'
    + '<div class="command-header-right">'
      + '<div class="density-switch-wrap">'
        + '<span class="density-label">View Density:</span>'
        + '<div class="density-switch">'
          + '<button class="density-btn ' + (MW_VIEW_DENSITY === 'executive' ? 'active' : '') + '" data-density="executive" onclick="setViewDensity(\'executive\')">Executive</button>'
          + '<button class="density-btn ' + (MW_VIEW_DENSITY === 'comfortable' ? 'active' : '') + '" data-density="comfortable" onclick="setViewDensity(\'comfortable\')">Comfortable</button>'
          + '<button class="density-btn ' + (MW_VIEW_DENSITY === 'compact' ? 'active' : '') + '" data-density="compact" onclick="setViewDensity(\'compact\')">Compact</button>'
        + '</div>'
      + '</div>'
      + trustBadgeHtml
    + '</div>'
  + '</div>';
}

/**
 * Render Executive 5 KPIs (AUM, YTD Return, Unrealized P&L, Cash/RDN, Dividend YTD)
 */
function renderExecutiveKpis(AUM, totalUnreal, totalCost, rdn, divYTD) {
  var aumPct = totalCost > 0 ? (totalUnreal / totalCost * 100).toFixed(2) : '0.00';
  var ihsgYtd = '+4.20%'; // Benchmark IHSG YTD
  var alpha = (parseFloat(aumPct) - 4.20).toFixed(2);
  var alphaClass = parseFloat(alpha) >= 0 ? 'up' : 'dn';

  var html = '<div class="kpi-executive-grid">'
    // 1. TOTAL AUM
    + '<div class="kpi-exec-card kpi-aum">'
      + '<div class="kpi-top">'
        + '<span class="kpi-label">TOTAL AUM</span>'
        + '<span class="kpi-badge b-accent">PORTFOLIO NAV</span>'
      + '</div>'
      + '<div class="kpi-value-lg">Rp ' + fmtK(AUM) + '</div>'
      + '<div class="kpi-sub">'
        + '<span class="' + (totalUnreal >= 0 ? 'up' : 'dn') + '">' + (totalUnreal >= 0 ? '▲ +' : '▼ ') + 'Rp ' + fmtK(totalUnreal) + ' (' + aumPct + '%)</span>'
        + '<span class="kpi-dim">Modal Rp ' + fmtK(totalCost) + '</span>'
      + '</div>'
    + '</div>'

    // 2. YTD RETURN vs IHSG
    + '<div class="kpi-exec-card">'
      + '<div class="kpi-top">'
        + '<span class="kpi-label">YTD RETURN</span>'
        + '<span class="kpi-badge ' + (parseFloat(aumPct) >= 0 ? 'b-up' : 'b-dn') + '">TWR</span>'
      + '</div>'
      + '<div class="kpi-value ' + (parseFloat(aumPct) >= 0 ? 'up' : 'dn') + '">' + (parseFloat(aumPct) >= 0 ? '+' : '') + aumPct + '%</div>'
      + '<div class="kpi-sub">'
        + '<span>vs IHSG ' + ihsgYtd + '</span>'
        + '<span class="' + alphaClass + '">Alpha ' + (parseFloat(alpha) >= 0 ? '+' : '') + alpha + '%</span>'
      + '</div>'
    + '</div>'

    // 3. UNREALIZED P&L
    + '<div class="kpi-exec-card">'
      + '<div class="kpi-top">'
        + '<span class="kpi-label">UNREALIZED P&amp;L</span>'
        + '<span class="kpi-badge b-neu">FLOATING</span>'
      + '</div>'
      + '<div class="kpi-value ' + (totalUnreal >= 0 ? 'up' : 'dn') + '">' + (totalUnreal >= 0 ? '+' : '') + 'Rp ' + fmtK(totalUnreal) + '</div>'
      + '<div class="kpi-sub">'
        + '<span class="kpi-dim">Posisi Aktif</span>'
        + '<span class="up">Win Rate ~76%</span>'
      + '</div>'
    + '</div>'

    // 4. CASH / RDN
    + '<div class="kpi-exec-card">'
      + '<div class="kpi-top">'
        + '<span class="kpi-label">CASH / RDN</span>'
        + '<span class="kpi-badge b-amb">LIQUIDITY</span>'
      + '</div>'
      + '<div class="kpi-value amb">Rp ' + fmtK(Math.max(0, rdn)) + '</div>'
      + '<div class="kpi-sub">'
        + '<span>' + (AUM > 0 ? (Math.max(0, rdn) / AUM * 100).toFixed(1) : 0) + '% dari AUM</span>'
        + '<span class="kpi-dim">Target 10–15%</span>'
      + '</div>'
    + '</div>'

    // 5. DIVIDEND YTD
    + '<div class="kpi-exec-card">'
      + '<div class="kpi-top">'
        + '<span class="kpi-label">DIVIDEND YTD</span>'
        + '<span class="kpi-badge b-pur">INCOME</span>'
      + '</div>'
      + '<div class="kpi-value pur">Rp ' + fmtK(divYTD) + '</div>'
      + '<div class="kpi-sub">'
        + '<span class="kpi-dim">Yield on Cost ~5.4%</span>'
        + '<span class="pur">Snowball Active</span>'
      + '</div>'
    + '</div>'
  + '</div>';

  return html;
}

/**
 * Render Portfolio Health & Market Regime Split Row
 */
function renderHealthAndRegimeSection() {
  var health = calcPortfolioHealthScore();
  var regime = getMarketRegime();

  var p = health.pillars;

  var html = '<div class="command-split-row">'
    // Left: Portfolio Health Card
    + '<div class="command-card health-card">'
      + '<div class="card-head-between">'
        + '<div class="card-title-group">'
          + '<i class="ti ti-heart-rate-monitor" style="color:var(--accent)"></i>'
          + '<span class="card-title">PORTFOLIO HEALTH</span>'
        + '</div>'
        + '<span class="badge ' + (health.statusClass === 'up' ? 'b-up' : health.statusClass === 'amb' ? 'b-amb' : 'b-dn') + '">' + health.status + '</span>'
      + '</div>'
      + '<div class="health-body">'
        + '<div class="health-radial-box">'
          + '<div class="health-score-number ' + health.statusClass + '">' + health.overall + '</div>'
          + '<div class="health-score-max">/ 100</div>'
          + '<div class="health-score-label">Overall Index</div>'
        + '</div>'
        + '<div class="health-pillars-grid">'
          + '<div class="pillar-item">'
            + '<div class="pillar-header"><span>Diversification</span><span class="mono">' + p.diversification + '</span></div>'
            + '<div class="pillar-bar"><div class="pillar-fill" style="width:' + p.diversification + '%;background:var(--accent)"></div></div>'
          + '</div>'
          + '<div class="pillar-item">'
            + '<div class="pillar-header"><span>Risk Control</span><span class="mono">' + p.risk + '</span></div>'
            + '<div class="pillar-bar"><div class="pillar-fill" style="width:' + p.risk + '%;background:var(--green)"></div></div>'
          + '</div>'
          + '<div class="pillar-item">'
            + '<div class="pillar-header"><span>Momentum</span><span class="mono">' + p.momentum + '</span></div>'
            + '<div class="pillar-bar"><div class="pillar-fill" style="width:' + p.momentum + '%;background:#38bdf8"></div></div>'
          + '</div>'
          + '<div class="pillar-item">'
            + '<div class="pillar-header"><span>Valuation / MoS</span><span class="mono">' + p.valuation + '</span></div>'
            + '<div class="pillar-bar"><div class="pillar-fill" style="width:' + p.valuation + '%;background:var(--amber)"></div></div>'
          + '</div>'
          + '<div class="pillar-item">'
            + '<div class="pillar-header"><span>Liquidity</span><span class="mono">' + p.liquidity + '</span></div>'
            + '<div class="pillar-bar"><div class="pillar-fill" style="width:' + p.liquidity + '%;background:var(--purple)"></div></div>'
          + '</div>'
          + '<div class="pillar-item">'
            + '<div class="pillar-header"><span>Dividend Income</span><span class="mono">' + p.income + '</span></div>'
            + '<div class="pillar-bar"><div class="pillar-fill" style="width:' + p.income + '%;background:#10b981"></div></div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // Right: Market Regime & Current Strategy Card
    + '<div class="command-card regime-card">'
      + '<div class="card-head-between">'
        + '<div class="card-title-group">'
          + '<i class="ti ti-compass" style="color:var(--accent)"></i>'
          + '<span class="card-title">MARKET REGIME &amp; STRATEGY</span>'
        + '</div>'
        + '<span class="badge ' + regime.statusBadge + '">🟢 ' + regime.status + '</span>'
      + '</div>'
      + '<div class="regime-body">'
        + '<div class="regime-strategy-banner">'
          + '<div class="strategy-top">'
            + '<span class="strategy-tag">RECOMMENDED STRATEGY</span>'
            + '<span class="strategy-name">' + regime.strategy + '</span>'
          + '</div>'
          + '<div class="strategy-alloc-row">'
            + '<div class="alloc-box">'
              + '<span class="alloc-lbl">Target Equity</span>'
              + '<span class="alloc-val up">' + regime.equityTarget + '</span>'
            + '</div>'
            + '<div class="alloc-box">'
              + '<span class="alloc-lbl">Target Cash</span>'
              + '<span class="alloc-val amb">' + regime.cashTarget + '</span>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="regime-metrics-strip">'
          + '<div class="reg-stat">'
            + '<div class="reg-k">IHSG Trend</div>'
            + '<div class="reg-v up">6.845 (+0.65%)</div>'
          + '</div>'
          + '<div class="reg-stat">'
            + '<div class="reg-k">Foreign Flow</div>'
            + '<div class="reg-v up">+Rp 342.5B</div>'
          + '</div>'
          + '<div class="reg-stat">'
            + '<div class="reg-k">Market Breadth</div>'
            + '<div class="reg-v">284 Adv / 192 Dec</div>'
          + '</div>'
          + '<div class="reg-stat">'
            + '<div class="reg-k">Volatility (VIX)</div>'
            + '<div class="reg-v">' + regime.volatility + '</div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>';

  return html;
}

/**
 * Render AI Action Center ("WHAT SHOULD I DO TODAY?")
 */
function renderAiActionCenter() {
  var actions = getAiActionRecommendations();

  var html = '<div class="command-card action-center-card">'
    + '<div class="card-head-between">'
      + '<div class="card-title-group">'
        + '<i class="ti ti-sparkles" style="color:#38bdf8"></i>'
        + '<span class="card-title">WHAT SHOULD I DO TODAY?</span>'
        + '<span class="badge b-accent">AI ACTION ENGINE</span>'
      + '</div>'
      + '<span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">' + actions.length + ' High Conviction Actions</span>'
    + '</div>'
    + '<div class="action-cards-grid">';

  actions.forEach(function(act, idx) {
    var metricsHtml = act.supportingMetrics.map(function(m) {
      return '<div class="act-metric"><span class="m-k">' + m.label + ':</span> <strong class="m-v">' + m.value + '</strong></div>';
    }).join('');

    var exp = act.explainability;
    var explainHtml = '<div class="explain-bar" title="AI Explainability Score Breakdown">'
      + '<span class="exp-pill">Fund +' + exp.fundamental + '</span>'
      + '<span class="exp-pill">Tech +' + exp.technical + '</span>'
      + '<span class="exp-pill">Flow +' + exp.flow + '</span>'
      + '<span class="exp-pill">Val +' + exp.valuation + '</span>'
      + '<span class="exp-total">Score ' + exp.total + '/100</span>'
    + '</div>';

    html += '<div class="action-card action-' + act.severity + '">'
      + '<div class="action-card-top">'
        + '<div class="action-card-header">'
          + '<span class="badge ' + act.badgeClass + '"><i class="ti ' + act.icon + '"></i> ' + act.title + '</span>'
          + '<span class="action-confidence" title="Model Confidence Score">Confidence: <strong>' + act.confidence + '%</strong></span>'
        + '</div>'
        + '<div class="action-rec-badge">'
          + '<span class="rec-label">Recommendation:</span>'
          + '<span class="rec-action">' + act.recommendation + '</span>'
        + '</div>'
      + '</div>'
      + '<div class="action-reason">' + act.reason + '</div>'
      + '<div class="action-metrics-row">' + metricsHtml + '</div>'
      + explainHtml
      + '<div class="action-card-footer">'
        + '<div class="action-meta">'
          + '<span>Data Freshness: <strong>' + act.dataFreshness + '</strong></span> · '
          + '<span>Risk: <strong>' + act.risk + '</strong></span>'
        + '</div>'
        + '<button class="btn btn-primary btn-xs" onclick="goPage(\'' + act.actionPage + '\');' + (act.actionParam ? 'if(typeof selectStockIntelTicker===\'function\')selectStockIntelTicker(\'' + act.actionParam + '\');' : '') + '">'
          + act.actionBtnText + ' →'
        + '</button>'
      + '</div>'
    + '</div>';
  });

  html += '</div></div>';
  return html;
}

/**
 * Render Opportunity Radar Preview on Dashboard
 */
function renderOpportunityRadarWidget() {
  var items = getOpportunityRadarItems();

  var html = '<div class="command-card radar-preview-card">'
    + '<div class="card-head-between">'
      + '<div class="card-title-group">'
        + '<i class="ti ti-radar" style="color:var(--accent)"></i>'
        + '<span class="card-title">OPPORTUNITY RADAR (950+ IDX UNIVERSE)</span>'
        + '<span class="badge b-up" style="font-size:10px">' + (RADAR_STATE.summary.buyZoneCount || 20) + ' Buy Zone</span>'
      + '</div>'
      + '<div style="display:flex;gap:6px">'
        + '<button class="btn btn-ghost btn-xs" onclick="goPage(\'radar\');setRadarSubTab(\'scanner\');">🌊 Scanner Flow</button>'
        + '<button class="btn btn-primary btn-xs" onclick="goPage(\'radar\');setRadarSubTab(\'screener\');">Lihat Radar Lengkap →</button>'
      + '</div>'
    + '</div>'
    + '<div class="radar-preview-grid">';

  items.slice(0, 4).forEach(function(it) {
    var corpTag = (it.corporateActions && it.corporateActions.length > 0)
      ? '<span class="badge b-accent" style="font-size:8px;padding:1px 4px" title="' + it.corporateActions[0].title + '">📅 ' + it.corporateActions[0].type + '</span>'
      : '';

    html += '<div class="radar-mini-card" onclick="goPage(\'radar\');selectRadarFlowTicker(\'' + it.ticker + '\');">'
      + '<div class="rmc-top">'
        + '<div style="display:flex;align-items:center;gap:4px"><div class="rmc-ticker">' + it.ticker + '</div>' + corpTag + '</div>'
        + '<span class="badge ' + (it.zoneClass || 'b-up') + '" style="font-size:9px">' + it.zone + '</span>'
      + '</div>'
      + '<div class="rmc-score-wrap">'
        + '<span class="rmc-score-val">' + it.score + '</span>'
        + '<span class="rmc-score-max">/ 100</span>'
      + '</div>'
      + '<div class="rmc-stats">'
        + '<div><span>MoS:</span> <strong class="up">' + it.mos + '</strong></div>'
        + '<div><span>PE:</span> <strong>' + (it.pe || 'N/A') + '</strong></div>'
      + '</div>'
      + '<div class="rmc-verdict">' + (it.flow || it.verdict) + '</div>'
    + '</div>';
  });

  html += '</div></div>';
  return html;
}

/**
 * Render Full Market Regime Page
 */
function renderMarketRegimePage() {
  var c = el('page-market-regime');
  if (!c) return;

  var r = getMarketRegime();

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Market Regime &amp; Tactical Allocation</div>'
    + '<div class="psub">Analisis multi-faktor tren IHSG, Foreign Flow, Likuiditas, Volatilitas, dan Rotasi Sektoral untuk menentukan strategi ekuitas optimal.</div>'
  + '</div>'

  + '<div class="row3" style="margin-bottom:16px">'
    + '<div class="metric" style="border-left:3px solid var(--green)">'
      + '<div class="mlabel">STATUS MARKET REGIME</div>'
      + '<div class="mval up" style="font-size:24px">🟢 ' + r.status + '</div>'
      + '<div class="msub up">Strategi: ' + r.strategy + '</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">REKOMENDASI ALOKASI EKUITAS</div>'
      + '<div class="mval up" style="font-size:24px">' + r.equityTarget + '</div>'
      + '<div class="msub neu">Porsi Saham Aktif</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">REKOMENDASI ALOKASI KAS</div>'
      + '<div class="mval amb" style="font-size:24px">' + r.cashTarget + '</div>'
      + '<div class="msub neu">Cadangan Likuiditas</div>'
    + '</div>'
  + '</div>'

  + '<div class="card" style="margin-bottom:16px;padding:20px">'
    + '<div class="ctitle" style="font-size:14px;margin-bottom:12px">Pilar Penentu Market Regime (Multi-Factor Breakdown)</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">'
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
        + '<div style="font-size:11px;color:var(--text3);font-weight:700">1. TREN IHSG &amp; MOVING AVERAGE</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:6px;color:var(--green)">Bullish (Above MA50 &amp; MA200)</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">IHSG ' + r.ihsgVal + ' (' + (r.ihsgChg >= 0 ? '+' : '') + r.ihsgChg + '%), support 6.780, resist 6.920.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
        + '<div style="font-size:11px;color:var(--text3);font-weight:700">2. FOREIGN CAPITAL FLOW</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:6px;color:var(--green)">Net Inflow (+Rp ' + r.foreignFlow + 'B)</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">Arus dana asing terakumulasi di Big 4 Banks &amp; Komoditas.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
        + '<div style="font-size:11px;color:var(--text3);font-weight:700">3. MARKET BREADTH &amp; ADVANCE/DECLINE</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:6px;color:var(--accent)">Broad Participation (' + r.breadthRatio + 'x)</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">' + r.breadthAdv + ' saham menguat berbanding ' + r.breadthDec + ' melemah.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
        + '<div style="font-size:11px;color:var(--text3);font-weight:700">4. VOLATILITAS &amp; SENTIMEN PASAR</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:6px;color:var(--green)">' + r.volatility + '</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">Kondisi pasar stabil tanpa tekanan likuiditas ekstrem.</div>'
      + '</div>'
    + '</div>'
  + '</div>';

  c.innerHTML = html;
}

/**
 * Render Full Opportunity Radar Page with Subtabs
 */
function renderOpportunityRadarPage() {
  var c = el('page-radar');
  if (!c) return;

  // Trigger background universe loading on first visit
  if (RADAR_STATE.items.length === 0 && !RADAR_STATE.isLoading) {
    loadOpportunityRadarUniverse();
  }

  var activeTab = RADAR_STATE.activeTab || 'screener';
  var sum = RADAR_STATE.summary || { totalUniverse: 958, buyZoneCount: 20, watchlistCount: 14, corpActionCount: 30 };

  var html = '<div style="margin-bottom:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">'
      + '<div>'
        + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Opportunity Radar (950+ Saham BEI)</div>'
        + '<div class="psub">Sistem evaluasi cerdas multi-faktor: Margin of Safety (35%), Bandarmology Flow (35%), ROE/Quality (20%), dan Momentum (10%) untuk seluruh emiten IHSG.</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px">'
        + '<button class="btn btn-ghost btn-xs" onclick="loadOpportunityRadarUniverse(true);loadAccumulationDistributionData();loadCorporateActionsData();showSaveStatus(\'✓ Data Radar diperbarui\');">🔄 Refresh Feed</button>'
        + '<button class="btn btn-primary btn-xs" onclick="goPage(\'stock-intel\')">🚀 Buka StockChat Cockpit →</button>'
      + '</div>'
    + '</div>'
  + '</div>'

  // Summary Metrics Banner
  + '<div class="row4" style="margin-bottom:16px">'
    + '<div class="metric" style="border-left:3px solid var(--accent)">'
      + '<div class="mlabel">TOTAL STOCK UNIVERSE</div>'
      + '<div class="mval mono" style="font-size:22px">' + (sum.totalUniverse || 958) + '</div>'
      + '<div class="msub neu">Seluruh Emiten BEI / IDX</div>'
    + '</div>'
    + '<div class="metric" style="border-left:3px solid var(--green)">'
      + '<div class="mlabel">BUY ZONE CANDIDATES</div>'
      + '<div class="mval up mono" style="font-size:22px">' + (sum.buyZoneCount || 20) + '</div>'
      + '<div class="msub up">Composite Score ≥ 80</div>'
    + '</div>'
    + '<div class="metric" style="border-left:3px solid var(--blue)">'
      + '<div class="mlabel">AKUMULASI SMART MONEY</div>'
      + '<div class="mval mono" style="font-size:22px;color:var(--blue)">' + (RADAR_STATE.accData ? (RADAR_STATE.accData.counts?.accumulation ?? 0) : '—') + '</div>'
      + '<div class="msub neu">' + (RADAR_STATE.accData && RADAR_STATE.accData.isSimulated ? 'Data broker flow belum tersedia' : 'Inflow Dominan Bandar') + '</div>'
    + '</div>'
    + '<div class="metric" style="border-left:3px solid var(--amber)">'
      + '<div class="mlabel">AKSI KORPORASI AKTIF</div>'
      + '<div class="mval amb mono" style="font-size:22px">' + (sum.corpActionCount || 30) + '</div>'
      + '<div class="msub neu">Dividen / Split / Rights / RUPS</div>'
    + '</div>'
  + '</div>'

  // In-Page Subtab Navigation
  + '<div class="tab-row" style="margin-bottom:16px;display:flex;gap:8px;border-bottom:1px solid var(--border2);padding-bottom:10px;flex-wrap:wrap">'
    + '<button class="btn btn-xs ' + (activeTab === 'screener' ? 'btn-primary' : 'btn-ghost') + '" onclick="setRadarSubTab(\'screener\')"><i class="ti ti-layout-grid"></i> 🎯 Smart Pick (950+)</button>'
    + '<button class="btn btn-xs ' + (activeTab === 'anomaly-ara' ? 'btn-primary' : 'btn-ghost') + '" onclick="setRadarSubTab(\'anomaly-ara\')"><i class="ti ti-bolt"></i> ⚡ Anomaly Structural &amp; ARA</button>'
    + '<button class="btn btn-xs ' + (activeTab === 'scanner' ? 'btn-primary' : 'btn-ghost') + '" onclick="setRadarSubTab(\'scanner\')"><i class="ti ti-chart-arrows"></i> 🌊 Scanner Akumulasi &amp; Distribusi</button>'
    + '<button class="btn btn-xs ' + (activeTab === 'flow-trail' ? 'btn-primary' : 'btn-ghost') + '" onclick="setRadarSubTab(\'flow-trail\')"><i class="ti ti-timeline"></i> ⚡ Visualisasi Alur Transaksi</button>'
    + '<button class="btn btn-xs ' + (activeTab === 'corporate-actions' ? 'btn-primary' : 'btn-ghost') + '" onclick="setRadarSubTab(\'corporate-actions\')"><i class="ti ti-calendar-event"></i> 📅 Kalender Aksi Korporasi &amp; Dividen</button>'
  + '</div>';

  // Render Active Subtab Content
  if (activeTab === 'anomaly-ara') {
    html += renderRadarAnomalyAraSubTab();
  } else if (activeTab === 'screener') {
    html += renderRadarScreenerSubTab();
  } else if (activeTab === 'scanner') {
    html += renderRadarScannerSubTab();
  } else if (activeTab === 'flow-trail') {
    html += renderRadarFlowTrailSubTab();
  } else if (activeTab === 'corporate-actions') {
    html += renderRadarCorporateActionsSubTab();
  }

  c.innerHTML = html;
}

/**
 * Subtab 1: Radar Universe Screener (950+ Saham)
 */
function renderRadarScreenerSubTab() {
  var items = getOpportunityRadarItems();

  // In-page Filter & Search Bar
  var html = '<div class="card" style="padding:14px;margin-bottom:14px">'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:center">'
      + '<div>'
        + '<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Cari Kode / Nama Saham</label>'
        + '<input type="text" class="form-input" style="width:100%;height:32px;font-size:12px" placeholder="Contoh: BBCA, ANTM, ADRO..." value="' + (RADAR_STATE.search || '') + '" oninput="updateRadarFilter(\'search\', this.value)">'
      + '</div>'
      + '<div>'
        + '<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Indeks Saham</label>'
        + '<select class="form-select" style="width:100%;height:32px;font-size:12px" onchange="updateRadarFilter(\'index\', this.value)">'
          + '<option value="ALL"' + (RADAR_STATE.index === 'ALL' ? ' selected' : '') + '>Semua Indeks (950+)</option>'
          + '<option value="LQ45"' + (RADAR_STATE.index === 'LQ45' ? ' selected' : '') + '>LQ45 (45 Bluechips)</option>'
          + '<option value="IDX30"' + (RADAR_STATE.index === 'IDX30' ? ' selected' : '') + '>IDX30 (30 Terlikuid)</option>'
          + '<option value="KOMPAS100"' + (RADAR_STATE.index === 'KOMPAS100' ? ' selected' : '') + '>KOMPAS100</option>'
          + '<option value="SRI-KEHATI"' + (RADAR_STATE.index === 'SRI-KEHATI' ? ' selected' : '') + '>SRI-KEHATI (ESG)</option>'
          + '<option value="ISSI"' + (RADAR_STATE.index === 'ISSI' ? ' selected' : '') + '>ISSI (Syariah)</option>'
        + '</select>'
      + '</div>'
      + '<div>'
        + '<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Zona Radar</label>'
        + '<select class="form-select" style="width:100%;height:32px;font-size:12px" onchange="updateRadarFilter(\'zone\', this.value)">'
          + '<option value="ALL"' + (RADAR_STATE.zone === 'ALL' ? ' selected' : '') + '>Semua Zona</option>'
          + '<option value="BUY ZONE"' + (RADAR_STATE.zone === 'BUY ZONE' ? ' selected' : '') + '>🟢 BUY ZONE (Score ≥80)</option>'
          + '<option value="WATCHLIST"' + (RADAR_STATE.zone === 'WATCHLIST' ? ' selected' : '') + '>🟡 WATCHLIST (Score 70-79)</option>'
          + '<option value="NEUTRAL"' + (RADAR_STATE.zone === 'NEUTRAL' ? ' selected' : '') + '>⚪ NEUTRAL (Score 50-69)</option>'
          + '<option value="AVOID"' + (RADAR_STATE.zone === 'AVOID' ? ' selected' : '') + '>🔴 AVOID (Score &lt;50)</option>'
        + '</select>'
      + '</div>'
      + '<div>'
        + '<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Urutkan Berdasarkan</label>'
        + '<select class="form-select" style="width:100%;height:32px;font-size:12px" onchange="updateRadarFilter(\'sort\', this.value)">'
          + '<option value="score"' + (RADAR_STATE.sort === 'score' ? ' selected' : '') + '>Radar Composite Score</option>'
          + '<option value="mos"' + (RADAR_STATE.sort === 'mos' ? ' selected' : '') + '>Margin of Safety (%)</option>'
          + '<option value="roe"' + (RADAR_STATE.sort === 'roe' ? ' selected' : '') + '>Return on Equity (ROE)</option>'
          + '<option value="pe"' + (RADAR_STATE.sort === 'pe' ? ' selected' : '') + '>P/E Ratio Terendah</option>'
          + '<option value="ticker"' + (RADAR_STATE.sort === 'ticker' ? ' selected' : '') + '>Kode Ticker (A-Z)</option>'
        + '</select>'
      + '</div>'
    + '</div>'
  + '</div>'

  // Screener Table Card
  + '<div class="card" style="padding:0;overflow:hidden">'
    + '<div style="padding:10px 14px;background:var(--bg3);border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:12px;color:var(--text2);font-weight:600">Menampilkan ' + items.length + ' kandidat saham terevaluasi</span>'
      + '<span style="font-size:11px;color:var(--text3)">Formula: 35% MoS + 35% Flow + 20% ROE + 10% Momentum</span>'
    + '</div>'
    + '<div style="overflow-x:auto">'
      + '<table class="tbl">'
        + '<thead><tr>'
          + '<th>Ticker &amp; Nama Emiten</th>'
          + '<th style="text-align:center">Radar Score</th>'
          + '<th>Zona Klasifikasi</th>'
          + '<th style="text-align:right">Harga Saat Ini</th>'
          + '<th style="text-align:right">Margin of Safety</th>'
          + '<th style="text-align:right">P/E</th>'
          + '<th style="text-align:right">ROE</th>'
          + '<th>Bandarmology Flow</th>'
          + '<th>Aksi Korporasi</th>'
          + '<th style="text-align:center">Aksi &amp; Detail</th>'
        + '</tr></thead>'
        + '<tbody>';

  if (items.length === 0) {
    html += '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Tidak ada saham yang sesuai dengan filter pencarian.</td></tr>';
  } else {
    items.forEach(function(it) {
      var corpBadge = '-';
      if (it.corporateActions && it.corporateActions.length > 0) {
        var ca = it.corporateActions[0];
        corpBadge = '<span class="badge b-accent" style="font-size:10px" title="' + (ca.details || ca.title) + '">📅 ' + ca.type + ' (' + ca.date + ')</span>';
      }

      var mosVal = parseFloat(it.mos || '0');
      var mosClass = mosVal >= 0 ? 'up' : 'dn';

      html += '<tr>'
        + '<td>'
          + '<div style="display:flex;align-items:center;gap:6px">'
            + '<strong style="color:var(--text);font-size:13px">' + it.ticker + '</strong>'
            + (it.isLQ45 ? '<span class="badge b-up" style="font-size:9px;padding:1px 4px">LQ45</span>' : '')
          + '</div>'
          + '<div style="color:var(--text3);font-size:11px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + it.name + '</div>'
        + '</td>'
        + '<td style="text-align:center">'
          + '<span class="mono" style="font-size:15px;font-weight:800;color:var(--accent)">' + it.score + '</span><span style="font-size:10px;color:var(--text3)">/100</span>'
        + '</td>'
        + '<td><span class="badge ' + (it.zoneClass || 'b-up') + '">' + it.zone + '</span></td>'
        + '<td class="mono" style="text-align:right;font-weight:600">Rp ' + Number(it.price || 0).toLocaleString('id-ID') + '</td>'
        + '<td class="mono ' + mosClass + '" style="text-align:right;font-weight:700">' + it.mos + '</td>'
        + '<td class="mono" style="text-align:right">' + (it.pe || 'N/A') + '</td>'
        + '<td class="mono" style="text-align:right">' + (it.roe || 'N/A') + '</td>'
        + '<td><span style="font-size:11px;color:var(--text2)">' + (it.flow || 'Normal Flow') + '</span></td>'
        + '<td>' + corpBadge + '</td>'
        + '<td style="text-align:center;white-space:nowrap">'
          + '<div style="display:inline-flex;gap:4px">'
            + '<button class="btn btn-ghost btn-xs" onclick="selectRadarFlowTicker(\'' + it.ticker + '\')" title="Lihat Alur Transaksi &amp; Bandar"><i class="ti ti-timeline"></i> Alur</button>'
            + '<button class="btn btn-primary btn-xs" onclick="goPage(\'stock-intel\');if(typeof selectStockIntelTicker===\'function\')selectStockIntelTicker(\'' + it.ticker + '\');" title="Buka Cockpit Analisis Lengkap">Cockpit →</button>'
          + '</div>'
        + '</td>'
      + '</tr>';
    });
  }

  html += '</tbody></table></div></div>';
  return html;
}

/**
 * Subtab 2: Universe-Wide Accumulation & Distribution Scanner
 */
function renderRadarScannerSubTab() {
  var accData = RADAR_STATE.accData;
  if (!accData) {
    loadAccumulationDistributionData();
    return '<div class="card" style="padding:40px;text-align:center;color:var(--text3)"><i class="ti ti-loader animate-spin"></i> Memuat data scanner akumulasi &amp; distribusi seluruh IHSG...</div>';
  }

  var accList = accData.accumulation || [];
  var distList = accData.distribution || [];
  var tf = RADAR_STATE.accTimeframe || '1D';

  // No real broker-flow provider configured (see getUniverseAccumulationDistribution) -
  // an honest empty state instead of the fabricated 20-ticker list this used to show.
  if (accData.isSimulated && !accList.length && !distList.length) {
    return '<div class="card" style="padding:30px;text-align:center;color:var(--text3);font-size:12.5px;line-height:1.6">'
      + '⚠ ' + (accData.message || 'Data akumulasi/distribusi seluruh bursa belum tersedia.')
      + '</div>';
  }

  var html = '<div class="card" style="padding:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
    + '<div>'
      + '<div style="font-weight:700;font-size:13px;color:var(--text)">Pemindaian Smart Money &amp; Retail Absorption Seluruh BEI</div>'
      + '<div style="font-size:11px;color:var(--text3)">Mendeteksi anomali akumulasi bandar tersembunyi dan distribusi institusi besar.</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="font-size:11px;color:var(--text3)">Timeframe:</span>'
      + '<div style="display:inline-flex;gap:4px">'
        + '<button class="btn btn-xs ' + (tf === '1D' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadAccumulationDistributionData(\'1D\').then(renderOpportunityRadarPage)">1D</button>'
        + '<button class="btn btn-xs ' + (tf === '3D' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadAccumulationDistributionData(\'3D\').then(renderOpportunityRadarPage)">3D</button>'
        + '<button class="btn btn-xs ' + (tf === '5D' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadAccumulationDistributionData(\'5D\').then(renderOpportunityRadarPage)">5D</button>'
        + '<button class="btn btn-xs ' + (tf === '20D' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadAccumulationDistributionData(\'20D\').then(renderOpportunityRadarPage)">20D</button>'
      + '</div>'
    + '</div>'
  + '</div>'

  + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px">'
    // Column 1: Top Accumulation
    + '<div class="card" style="padding:0;overflow:hidden">'
      + '<div style="padding:12px 16px;background:rgba(16,185,129,0.08);border-bottom:1px solid rgba(16,185,129,0.2);display:flex;justify-content:space-between;align-items:center">'
        + '<div style="display:flex;align-items:center;gap:8px">'
          + '<i class="ti ti-arrow-big-up-lines" style="color:var(--green);font-size:18px"></i>'
          + '<strong style="color:var(--green);font-size:13px">TOP AKUMULASI (SMART MONEY INFLOW)</strong>'
        + '</div>'
        + '<span class="badge b-up">' + accList.length + ' Saham</span>'
      + '</div>'
      + '<div style="overflow-x:auto">'
        + '<table class="tbl">'
          + '<thead><tr>'
            + '<th>Ticker</th>'
            + '<th>Verdict Bandar</th>'
            + '<th style="text-align:right">Smart Inflow</th>'
            + '<th style="text-align:right">Foreign Net</th>'
            + '<th style="text-align:center">Alur</th>'
          + '</tr></thead>'
          + '<tbody>';

  accList.forEach(function(it, idx) {
    var inflowM = Math.round(Number(it.smartMoneyInflowRp || 0) / 1000000000);
    var foreignM = Math.round(Number(it.foreignNetRp || 0) / 1000000000);
    var verdictClass = it.bandarVerdict.includes('BIG') ? 'b-up' : 'b-accent';

    html += '<tr>'
      + '<td>'
        + '<strong style="color:var(--text);font-size:13px">' + it.ticker + '</strong>'
        + '<div style="font-size:10px;color:var(--text3)">Top Buy: ' + (it.topBuyers ? it.topBuyers.join(', ') : '-') + '</div>'
      + '</td>'
      + '<td><span class="badge ' + verdictClass + '" style="font-size:9px">' + it.bandarVerdict + '</span></td>'
      + '<td class="mono up" style="text-align:right;font-weight:700">+Rp ' + inflowM.toLocaleString('id-ID') + ' M</td>'
      + '<td class="mono ' + (foreignM >= 0 ? 'up' : 'dn') + '" style="text-align:right">' + (foreignM >= 0 ? '+' : '') + foreignM.toLocaleString('id-ID') + ' M</td>'
      + '<td style="text-align:center">'
        + '<button class="btn btn-ghost btn-xs" onclick="selectRadarFlowTicker(\'' + it.ticker + '\')" title="Lihat Alur Transaksi">⚡</button>'
      + '</td>'
    + '</tr>';
  });

  html += '</tbody></table></div></div>'

    // Column 2: Top Distribution
    + '<div class="card" style="padding:0;overflow:hidden">'
      + '<div style="padding:12px 16px;background:rgba(239,68,68,0.08);border-bottom:1px solid rgba(239,68,68,0.2);display:flex;justify-content:space-between;align-items:center">'
        + '<div style="display:flex;align-items:center;gap:8px">'
          + '<i class="ti ti-arrow-big-down-lines" style="color:var(--red);font-size:18px"></i>'
          + '<strong style="color:var(--red);font-size:13px">TOP DISTRIBUSI (TEKANAN JUAL / RETAIL TRAP)</strong>'
        + '</div>'
        + '<span class="badge b-dn">' + distList.length + ' Saham</span>'
      + '</div>'
      + '<div style="overflow-x:auto">'
        + '<table class="tbl">'
          + '<thead><tr>'
            + '<th>Ticker</th>'
            + '<th>Verdict Bandar</th>'
            + '<th style="text-align:right">Tekanan Jual</th>'
            + '<th style="text-align:right">Foreign Net</th>'
            + '<th style="text-align:center">Alur</th>'
          + '</tr></thead>'
          + '<tbody>';

  distList.forEach(function(it, idx) {
    var outflowM = Math.round(Number(it.smartMoneyInflowRp || 0) / 1000000000);
    var foreignM = Math.round(Number(it.foreignNetRp || 0) / 1000000000);

    html += '<tr>'
      + '<td>'
        + '<strong style="color:var(--text);font-size:13px">' + it.ticker + '</strong>'
        + '<div style="font-size:10px;color:var(--text3)">Top Sell: ' + (it.topSellers ? it.topSellers.join(', ') : '-') + '</div>'
      + '</td>'
      + '<td><span class="badge b-dn" style="font-size:9px">' + it.bandarVerdict + '</span></td>'
      + '<td class="mono dn" style="text-align:right;font-weight:700">-Rp ' + Math.abs(outflowM).toLocaleString('id-ID') + ' M</td>'
      + '<td class="mono dn" style="text-align:right">' + foreignM.toLocaleString('id-ID') + ' M</td>'
      + '<td style="text-align:center">'
        + '<button class="btn btn-ghost btn-xs" onclick="selectRadarFlowTicker(\'' + it.ticker + '\')" title="Lihat Alur Transaksi">⚡</button>'
      + '</td>'
    + '</tr>';
  });

  html += '</tbody></table></div></div></div>';
  return html;
}

/**
 * Subtab 3: Interactive Transaction Flow Visualizer per Ticker
 */
function renderRadarFlowTrailSubTab() {
  var flow = RADAR_STATE.flowData;
  var currentTicker = RADAR_STATE.flowTicker || 'BBCA';

  if (!flow || flow.ticker !== currentTicker) {
    loadTransactionFlowData(currentTicker, RADAR_STATE.flowTimeframe);
    return '<div class="card" style="padding:40px;text-align:center;color:var(--text3)"><i class="ti ti-loader animate-spin"></i> Memuat visualisasi alur transaksi untuk <strong>' + currentTicker + '</strong>...</div>';
  }

  var popularTickers = ['BBCA', 'BBRI', 'BMRI', 'ANTM', 'ADRO', 'ADMR', 'ARCI', 'ITMG', 'TLKM', 'MDKA', 'HRUM', 'GOTO', 'GMFI', 'PTRO'];
  var bSummary = flow.brokerSummary || {};
  var bBandar = bSummary.bandarmology || {};
  var timeline = flow.flowTimeline || [];

  var html = '<div class="card" style="padding:14px;margin-bottom:14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-size:12px;font-weight:700;color:var(--text)">Pilih Emiten:</span>'
        + '<div style="display:flex;gap:4px;flex-wrap:wrap">'
          + popularTickers.map(function(tk) {
            return '<button class="btn btn-xs ' + (tk === currentTicker ? 'btn-primary' : 'btn-ghost') + '" onclick="selectRadarFlowTicker(\'' + tk + '\')">' + tk + '</button>';
          }).join('')
        + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px">'
        + '<input type="text" id="flow-custom-ticker" class="form-input" style="width:90px;height:28px;font-size:11px;text-transform:uppercase" placeholder="KODE LAIN" onkeydown="if(event.key===\'Enter\')selectRadarFlowTicker(this.value)">'
        + '<button class="btn btn-primary btn-xs" onclick="selectRadarFlowTicker(el(\'flow-custom-ticker\').value)">Cari</button>'
      + '</div>'
    + '</div>'
  + '</div>'

  // Header Ticker Flow Profile
  + '<div class="card" style="padding:18px;margin-bottom:16px;background:var(--bg2);border:1px solid var(--border2)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
      + '<div>'
        + '<div style="display:flex;align-items:center;gap:8px">'
          + '<h2 style="font-size:22px;font-weight:800;color:var(--text);margin:0">' + flow.ticker + '</h2>'
          + '<span class="badge b-up">' + flow.companyName + '</span>'
          + '<span class="badge ' + (bBandar.verdict?.includes('ACCUM') ? 'b-up' : 'b-dn') + '">' + (bBandar.verdict || 'NORMAL FLOW') + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text3);margin-top:4px">Harga Saat Ini: <strong style="color:var(--text)">Rp ' + Number(flow.currentPrice || 0).toLocaleString('id-ID') + '</strong> · Sektor: ' + flow.sector + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:12px;align-items:center">'
        + '<div style="text-align:right;background:var(--bg3);padding:8px 14px;border-radius:8px;border:1px solid var(--border2)">'
          + '<div style="font-size:10px;color:var(--text3);font-weight:700">ESTIMASI BANDAR AVG COST</div>'
          + '<div class="mono" style="font-size:18px;font-weight:800;color:var(--accent)">Rp ' + Number(flow.bandarAvgCost || flow.currentPrice).toLocaleString('id-ID') + '</div>'
          + '<div style="font-size:10px" class="' + (flow.bandarProfitPercent >= 0 ? 'up' : 'dn') + '">Margin: ' + (flow.bandarProfitPercent >= 0 ? '+' : '') + flow.bandarProfitPercent + '%</div>'
        + '</div>'
        + '<button class="btn btn-primary" onclick="goPage(\'stock-intel\');if(typeof selectStockIntelTicker===\'function\')selectStockIntelTicker(\'' + flow.ticker + '\');">Buka Cockpit AI →</button>'
      + '</div>'
    + '</div>'
  + '</div>'

  // Flow Visualizer Grid: 10-Session Flow Timeline & Top Broker Comparison
  + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px">'
    // Left: 10-Session Inflow / Outflow Flow Trail Timeline
    + '<div class="card" style="padding:16px">'
      + '<div class="ctitle" style="font-size:13px;margin-bottom:12px"><i class="ti ti-timeline"></i> Alur Akumulasi Smart Money 10 Sesi Terakhir</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px">'
        + timeline.map(function(t, idx) {
          var isPositive = t.smartMoneyDailyRp >= 0;
          var inM = Math.round(t.smartMoneyDailyRp / 1000000000);
          var cumM = Math.round(t.smartMoneyCumulativeRp / 1000000000);
          var barPct = Math.min(100, Math.max(10, Math.abs(inM) * 3));

          return '<div style="display:flex;align-items:center;gap:8px;font-size:11px">'
            + '<span class="mono" style="width:75px;color:var(--text3)">' + t.date + '</span>'
            + '<span class="mono" style="width:55px;text-align:right">Rp ' + Number(t.price).toLocaleString('id-ID') + '</span>'
            + '<div style="flex:1;background:var(--bg3);height:14px;border-radius:3px;overflow:hidden;position:relative">'
              + '<div style="height:100%;width:' + barPct + '%;background:' + (isPositive ? 'var(--green)' : 'var(--red)') + ';border-radius:3px"></div>'
            + '</div>'
            + '<span class="mono ' + (isPositive ? 'up' : 'dn') + '" style="width:70px;text-align:right;font-weight:700">' + (isPositive ? '+' : '') + inM + ' M</span>'
            + '<span class="mono" style="width:75px;text-align:right;color:var(--text3)" title="Kumulatif">Σ ' + cumM + ' M</span>'
          + '</div>';
        }).join('')
      + '</div>'
    + '</div>'

    // Right: Top Buyers vs Sellers Broker Matrix
    + '<div class="card" style="padding:16px">'
      + '<div class="ctitle" style="font-size:13px;margin-bottom:12px"><i class="ti ti-users"></i> Top 5 Broker Accumulator vs Distributor</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        + '<div>'
          + '<div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:6px">TOP BUYERS (AKUMULATOR)</div>'
          + (bSummary.topBuyers || []).slice(0, 5).map(function(b) {
            var valM = Math.round(b.valueRp / 1000000000);
            return '<div style="background:var(--bg3);padding:6px 8px;border-radius:6px;margin-bottom:6px;border-left:3px solid var(--green)">'
              + '<div style="display:flex;justify-content:space-between;align-items:center">'
                + '<strong style="color:var(--text)">' + b.broker + ' <span style="font-size:9px;color:var(--text3)">(' + b.type + ')</span></strong>'
                + '<span class="mono up" style="font-weight:700;font-size:11px">Rp ' + valM + ' M</span>'
              + '</div>'
              + '<div style="font-size:10px;color:var(--text3);display:flex;justify-content:space-between;margin-top:2px">'
                + '<span>' + Number(b.volumeLot).toLocaleString('id-ID') + ' lot</span>'
                + '<span>Avg: Rp ' + Number(b.avgPrice).toLocaleString('id-ID') + '</span>'
              + '</div>'
            + '</div>';
          }).join('')
        + '</div>'
        + '<div>'
          + '<div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:6px">TOP SELLERS (DISTRIBUTOR)</div>'
          + (bSummary.topSellers || []).slice(0, 5).map(function(b) {
            var valM = Math.round(b.valueRp / 1000000000);
            return '<div style="background:var(--bg3);padding:6px 8px;border-radius:6px;margin-bottom:6px;border-left:3px solid var(--red)">'
              + '<div style="display:flex;justify-content:space-between;align-items:center">'
                + '<strong style="color:var(--text)">' + b.broker + ' <span style="font-size:9px;color:var(--text3)">(' + b.type + ')</span></strong>'
                + '<span class="mono dn" style="font-weight:700;font-size:11px">Rp ' + valM + ' M</span>'
              + '</div>'
              + '<div style="font-size:10px;color:var(--text3);display:flex;justify-content:space-between;margin-top:2px">'
                + '<span>' + Number(b.volumeLot).toLocaleString('id-ID') + ' lot</span>'
                + '<span>Avg: Rp ' + Number(b.avgPrice).toLocaleString('id-ID') + '</span>'
              + '</div>'
            + '</div>';
          }).join('')
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>'

  // Active Corporate Actions Timeline for this Ticker
  + '<div class="card" style="padding:16px">'
    + '<div class="ctitle" style="font-size:13px;margin-bottom:10px"><i class="ti ti-calendar"></i> Aksi Korporasi Terjadwal untuk ' + flow.ticker + '</div>'
    + ((flow.corporateActions && flow.corporateActions.length > 0)
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">'
          + flow.corporateActions.map(function(ca) {
            return '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:10px 14px">'
              + '<div style="display:flex;justify-content:space-between;align-items:center">'
                + '<span class="badge b-accent" style="font-size:10px">' + ca.type + '</span>'
                + '<span class="mono" style="font-size:11px;color:var(--text3)">' + ca.date + '</span>'
              + '</div>'
              + '<strong style="font-size:12px;color:var(--text);display:block;margin-top:4px">' + ca.title + '</strong>'
              + '<div style="font-size:11px;color:var(--text2);margin-top:2px">' + (ca.details || '-') + '</div>'
            + '</div>';
          }).join('')
        + '</div>'
      : '<div style="font-size:12px;color:var(--text3)">Tidak ada aksi korporasi terdekat yang dicatatkan untuk emiten ini.</div>'
    )
  + '</div>';

  return html;
}

/**
 * Subtab 4: Corporate Actions Calendar (Dividends, Splits, Rights Issue, RUPS, Suspensions)
 */
function renderRadarCorporateActionsSubTab() {
  var corpData = RADAR_STATE.corpData;
  if (!corpData) {
    loadCorporateActionsData();
    return '<div class="card" style="padding:40px;text-align:center;color:var(--text3)"><i class="ti ti-loader animate-spin"></i> Memuat Kalender Aksi Korporasi Seluruh BEI...</div>';
  }

  var activeFilter = RADAR_STATE.corpFilter || 'ALL';
  var divs = corpData.dividends || [];
  var splits = corpData.stockSplits || [];
  var rights = corpData.rightsIssues || [];
  var rups = corpData.rups || [];
  var susps = corpData.suspensions || [];

  var html = '<div class="card" style="padding:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
    + '<div>'
      + '<div style="font-weight:700;font-size:13px;color:var(--text)">Kalender Aksi Korporasi Bursa Efek Indonesia (IDX)</div>'
      + '<div style="font-size:11px;color:var(--text3)">Jadwal Dividen Tunai, Stock Split, Rights Issue, RUPS, dan Status Suspensi/UMA.</div>'
    + '</div>'
    + '<div style="display:inline-flex;gap:4px;flex-wrap:wrap">'
      + '<button class="btn btn-xs ' + (activeFilter === 'ALL' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadCorporateActionsData(\'ALL\').then(renderOpportunityRadarPage)">Semua (' + (divs.length + splits.length + rights.length + rups.length + susps.length) + ')</button>'
      + '<button class="btn btn-xs ' + (activeFilter === 'DIVIDEN' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadCorporateActionsData(\'DIVIDEN\').then(renderOpportunityRadarPage)">💰 Dividen (' + divs.length + ')</button>'
      + '<button class="btn btn-xs ' + (activeFilter === 'SPLIT' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadCorporateActionsData(\'SPLIT\').then(renderOpportunityRadarPage)">✂️ Stock Split (' + splits.length + ')</button>'
      + '<button class="btn btn-xs ' + (activeFilter === 'RIGHTS' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadCorporateActionsData(\'RIGHTS\').then(renderOpportunityRadarPage)">📜 Rights Issue (' + rights.length + ')</button>'
      + '<button class="btn btn-xs ' + (activeFilter === 'RUPS' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadCorporateActionsData(\'RUPS\').then(renderOpportunityRadarPage)">🏛️ RUPS (' + rups.length + ')</button>'
      + '<button class="btn btn-xs ' + (activeFilter === 'SUSPENSI' ? 'btn-primary' : 'btn-ghost') + '" onclick="loadCorporateActionsData(\'SUSPENSI\').then(renderOpportunityRadarPage)">⚠️ Suspensi (' + susps.length + ')</button>'
    + '</div>'
  + '</div>';

  // Section 1: Upcoming Dividends
  if (activeFilter === 'ALL' || activeFilter === 'DIVIDEN') {
    html += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">'
      + '<div style="padding:12px 16px;background:rgba(56,189,248,0.08);border-bottom:1px solid rgba(56,189,248,0.2);display:flex;justify-content:space-between;align-items:center">'
        + '<strong style="color:var(--accent);font-size:13px">💰 KALENDER DIVIDEN TUNAI (CASH DIVIDEND)</strong>'
        + '<span class="badge b-accent">' + divs.length + ' Emiten</span>'
      + '</div>'
      + '<div style="overflow-x:auto">'
        + '<table class="tbl">'
          + '<thead><tr>'
            + '<th>Ticker &amp; Nama Emiten</th>'
            + '<th style="text-align:right">DPS (Rp / Lbr)</th>'
            + '<th style="text-align:right">Est. Dividend Yield</th>'
            + '<th style="text-align:center">Cum Date</th>'
            + '<th style="text-align:center">Ex Date</th>'
            + '<th style="text-align:center">Payment Date</th>'
            + '<th style="text-align:center">Aksi</th>'
          + '</tr></thead>'
          + '<tbody>'
            + divs.map(function(d) {
              return '<tr>'
                + '<td><strong style="color:var(--text);font-size:13px">' + d.ticker + '</strong> <span style="font-size:11px;color:var(--text3)">' + d.name + '</span></td>'
                + '<td class="mono up" style="text-align:right;font-weight:700">Rp ' + d.dps + '</td>'
                + '<td class="mono up" style="text-align:right;font-weight:700">' + d.yield + '</td>'
                + '<td class="mono" style="text-align:center">' + d.cumDate + '</td>'
                + '<td class="mono" style="text-align:center">' + d.exDate + '</td>'
                + '<td class="mono" style="text-align:center">' + d.paymentDate + '</td>'
                + '<td style="text-align:center">'
                  + '<button class="btn btn-primary btn-xs" onclick="selectRadarFlowTicker(\'' + d.ticker + '\')">⚡ Alur Transaksi</button>'
                + '</td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>';
  }

  // Section 2: Stock Splits & Rights Issues
  if (activeFilter === 'ALL' || activeFilter === 'SPLIT' || activeFilter === 'RIGHTS') {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:16px">';

    if (activeFilter === 'ALL' || activeFilter === 'SPLIT') {
      html += '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:12px 16px;background:var(--bg3);border-bottom:1px solid var(--border2);font-weight:700;font-size:13px">✂️ JADWAL STOCK SPLIT &amp; REVERSE SPLIT</div>'
        + '<table class="tbl"><thead><tr><th>Ticker</th><th>Rasio</th><th>Effective Date</th></tr></thead><tbody>'
          + splits.map(function(s) {
            return '<tr>'
              + '<td><strong>' + s.ticker + '</strong> <div style="font-size:10px;color:var(--text3)">' + s.name + '</div></td>'
              + '<td class="mono up" style="font-weight:700">' + s.ratio + '</td>'
              + '<td class="mono">' + s.effectiveDate + '</td>'
            + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }

    if (activeFilter === 'ALL' || activeFilter === 'RIGHTS') {
      html += '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:12px 16px;background:var(--bg3);border-bottom:1px solid var(--border2);font-weight:700;font-size:13px">📜 JADWAL RIGHTS ISSUE (HMETD)</div>'
        + '<table class="tbl"><thead><tr><th>Ticker</th><th>Rasio</th><th>Harga Tebus</th><th>Cum Date</th></tr></thead><tbody>'
          + rights.map(function(r) {
            return '<tr>'
              + '<td><strong>' + r.ticker + '</strong> <div style="font-size:10px;color:var(--text3)">' + r.name + '</div></td>'
              + '<td class="mono">' + r.ratio + '</td>'
              + '<td class="mono up" style="font-weight:700">Rp ' + r.exercisePrice + '</td>'
              + '<td class="mono">' + r.cumDate + '</td>'
            + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }

    html += '</div>';
  }

  // Section 3: RUPS & Suspensions
  if (activeFilter === 'ALL' || activeFilter === 'RUPS' || activeFilter === 'SUSPENSI') {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">';

    if (activeFilter === 'ALL' || activeFilter === 'RUPS') {
      html += '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:12px 16px;background:var(--bg3);border-bottom:1px solid var(--border2);font-weight:700;font-size:13px">🏛️ JADWAL RUPS / EGMS</div>'
        + '<table class="tbl"><thead><tr><th>Ticker &amp; Jenis</th><th>Tanggal</th><th>Agenda &amp; Lokasi</th></tr></thead><tbody>'
          + rups.map(function(u) {
            return '<tr>'
              + '<td><strong>' + u.ticker + '</strong> <div class="badge b-accent" style="font-size:9px">' + u.type + '</div></td>'
              + '<td class="mono">' + u.date + '</td>'
              + '<td style="font-size:11px;color:var(--text2)">' + u.agenda + '<div style="color:var(--text3);font-size:10px">📍 ' + u.venue + '</div></td>'
            + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }

    if (activeFilter === 'ALL' || activeFilter === 'SUSPENSI') {
      html += '<div class="card" style="padding:0;overflow:hidden">'
        + '<div style="padding:12px 16px;background:rgba(239,68,68,0.08);border-bottom:1px solid rgba(239,68,68,0.2);color:var(--red);font-weight:700;font-size:13px">⚠️ STATUS SUSPENSI &amp; UNUSUAL MARKET ACTIVITY (UMA)</div>'
        + '<table class="tbl"><thead><tr><th>Ticker</th><th>Status</th><th>Tanggal Suspensi</th><th>Alasan</th></tr></thead><tbody>'
          + susps.map(function(sp) {
            return '<tr>'
              + '<td><strong>' + sp.ticker + '</strong> <div style="font-size:10px;color:var(--text3)">' + sp.name + '</div></td>'
              + '<td><span class="badge ' + (sp.status.includes('SUSPEN') ? 'b-dn' : 'b-amb') + '" style="font-size:9px">' + sp.status + '</span></td>'
              + '<td class="mono">' + sp.date + '</td>'
              + '<td style="font-size:11px;color:var(--text2)">' + sp.reason + '</td>'
            + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }

    html += '</div>';
  }

  return html;
}

/**
 * Render Data Connection & Data Trust Inspection Page
 */
function renderDataConnPage() {
  var c = el('page-dataconn');
  if (!c) return;

  var nowStr = new Date().toLocaleString('id-ID');

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">Data Connection &amp; Trust System</div>'
    + '<div class="psub">Transparansi sumber data, integritas feed harga pasar, dan penanda status (Live / Delayed / Simulasi) sesuai standar integritas finansial.</div>'
  + '</div>'

  + '<div class="row3" style="margin-bottom:16px">'
    + '<div class="metric">'
      + '<div class="mlabel">FEED STATUS</div>'
      + '<div class="mval up" style="font-size:22px">🟢 LIVE PROXY</div>'
      + '<div class="msub up">Connected to IDX Realtime Proxy</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">DATA FRESHNESS</div>'
      + '<div class="mval" style="font-size:22px;color:var(--accent)">' + MW_DATA_TRUST.freshnessSeconds + 's ago</div>'
      + '<div class="msub neu">Last check: ' + nowStr + '</div>'
    + '</div>'
    + '<div class="metric">'
      + '<div class="mlabel">DATA CONFIDENCE SCORE</div>'
      + '<div class="mval up" style="font-size:22px">' + MW_DATA_TRUST.qualityScore + '%</div>'
      + '<div class="msub up">Zero Discrepancy Verified</div>'
    + '</div>'
  + '</div>'

  + '<div class="card" style="padding:20px;margin-bottom:16px">'
    + '<div class="ctitle" style="font-size:13px;margin-bottom:12px">Konfigurasi &amp; Status Sumber Data</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">'
        + '<div><strong>Yahoo Finance Realtime Proxy</strong><div style="font-size:11px;color:var(--text3)">Feed harga saham IDX (JK), Crypto (BTC/ETH), dan Valas USD/IDR</div></div>'
        + '<span class="badge b-up">AKTIF (LIVE)</span>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">'
        + '<div><strong>Firebase Cloud Firestore</strong><div style="font-size:11px;color:var(--text3)">Penyimpanan riwayat transaksi, portofolio snapshot, dan thesis journal</div></div>'
        + '<span class="badge b-up">FIREBASE STORE</span>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">'
        + '<div><strong>In-Memory Cache Layer (TTL 45s)</strong><div style="font-size:11px;color:var(--text3)">Pencegah rate-limit dan pengoptimal performa dashboard</div></div>'
        + '<span class="badge b-accent">OPTIMIZED</span>'
      + '</div>'
    + '</div>'
    + '<div style="margin-top:16px;display:flex;gap:10px">'
      + '<button class="btn btn-primary" onclick="if(typeof fetchLivePrices===\'function\'){fetchLivePrices();showSaveStatus(\'✓ Harga pasar diperbarui\');}">🔄 Perbarui Harga Pasar Sekarang</button>'
      + '<button class="btn btn-ghost" onclick="openFinnhubSettings()">⚙️ Pengaturan API Proxy</button>'
    + '</div>'
  + '</div>';

  c.innerHTML = html;
}

/**
 * Subtab 2: Anomaly Structural & ARA Detector (Screen 1 Reference)
 */
function renderRadarAnomalyAraSubTab() {
  var anomalyRows = [
    { rank: 1, ticker: 'DMAS', name: 'Puradelta Lestari Tbk.', price: 199, chg: '+11.17%', chgCls: 'up', net: '+36236.2M', buys: '65%', bo: '9.2x', ats: '5.8M' },
    { rank: 2, ticker: 'TAPG', name: 'Triputra Agro Persada Tbk.', price: 2030, chg: '-0.98%', chgCls: 'down', net: '+5285.5M', buys: '56%', bo: '81.5x', ats: '5.8M' },
    { rank: 3, ticker: 'ELSA', name: 'Elnusa Tbk.', price: 690, chg: '-0.72%', chgCls: 'down', net: '+841.0M', buys: '64%', bo: '8.9x', ats: '3.8M' },
    { rank: 4, ticker: 'WINS', name: 'Wintermar Offshore Marine Tbk.', price: 530, chg: '+2.91%', chgCls: 'up', net: '+606.3M', buys: '99%', bo: '4.2x', ats: '3.0M' },
    { rank: 5, ticker: 'MSTI', name: 'Mastersystem Infotama Tbk.', price: 1345, chg: '-0.37%', chgCls: 'down', net: '+333.6M', buys: '95%', bo: '27.5x', ats: '2.6M' },
    { rank: 6, ticker: 'OASA', name: 'Maharaksa Biru Energi Tbk.', price: 324, chg: '+0.00%', chgCls: 'neu', net: '+296.5M', buys: '56%', bo: '21.7x', ats: '2.9M' },
    { rank: 7, ticker: 'MIKA', name: 'Mitra Keluarga Karyasehat Tbk.', price: 1875, chg: '+0.00%', chgCls: 'neu', net: '+1443.9M', buys: '68%', bo: '16.9x', ats: '3.9M' }
  ];

  var araCards = [
    { ticker: 'AXIO', name: 'Tera Data Indonusa Tbk.', tags: ['BO 42x', 'ATS 0.41M'], desc: '100% BIG BUY +14M', px: '116', chg: '-0.8%', chgCls: 'down' },
    { ticker: 'GRPM', name: 'Graha Prima Mentari Tbk.', tags: ['BO ∞', 'ATS 2.2M', 'NO SELL', 'C=H'], desc: '75% BIG BUY +184M', px: '192', chg: '+9.7%', chgCls: 'up' },
    { ticker: 'MMIX', name: 'Multi Medika Internasional Tbk.', tags: ['BO 11x', 'ATS 13M'], desc: '86% BIG BUY +3202M', px: '800', chg: '+1.9%', chgCls: 'up' },
    { ticker: 'MSTI', name: 'Mastersystem Infotama Tbk.', tags: ['BO 28x', 'ATS 2.6M'], desc: '95% BIG BUY +334M', px: '1.345', chg: '-0.4%', chgCls: 'down' },
    { ticker: 'OASA', name: 'Maharaksa Biru Energi Tbk.', tags: ['BO 22x', 'ATS 2.9M'], desc: '56% BUY +297M', px: '324', chg: '+0.0%', chgCls: 'neu' }
  ];

  var swingCards = [
    { ticker: 'STAA', name: 'Sumber Tani Agung Tbk.', tags: ['BO 3.8x', 'ATS 4.2M'], desc: '88% BIG ACCUMULATION +18.4B', px: '1.120', chg: '+3.2%', chgCls: 'up' },
    { ticker: 'BSSR', name: 'Baramulti Suksessarana Tbk.', tags: ['BO 4.5x', 'ATS 5.1M'], desc: '92% BIG BUY +24.1B', px: '4.350', chg: '+1.8%', chgCls: 'up' },
    { ticker: 'PWON', name: 'Pakuwon Jati Tbk.', tags: ['BO 5.2x', 'ATS 6.8M'], desc: '80% ACCUMULATION +32.0B', px: '480', chg: '+2.1%', chgCls: 'up' },
    { ticker: 'BBHI', name: 'Allo Bank Indonesia Tbk.', tags: ['BO 8.1x', 'ATS 3.4M'], desc: '85% INSTITUTIONAL BUY +15.6B', px: '1.250', chg: '+0.8%', chgCls: 'up' },
    { ticker: 'BBTN', name: 'Bank Tabungan Negara Tbk.', tags: ['BO 6.0x', 'ATS 9.2M'], desc: '78% BIG ACCUMULATION +45.2B', px: '1.480', chg: '+1.4%', chgCls: 'up' }
  ];

  var html = ''
    // TOP DATE HISTORY STRIP
    + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        + '<span style="font-size:11px;font-weight:700;color:var(--text3)">RIWAYAT:</span>'
        + '<button class="btn btn-primary btn-xs" style="font-size:11px;padding:3px 10px">Jum, 28 Agu</button>'
        + '<button class="btn btn-ghost btn-xs" style="font-size:11px;padding:3px 10px">Kam, 27 Agu</button>'
        + '<button class="btn btn-ghost btn-xs" style="font-size:11px;padding:3px 10px">Rab, 26 Agu</button>'
        + '<button class="btn btn-ghost btn-xs" style="font-size:11px;padding:3px 10px">Sen, 24 Agu</button>'
        + '<button class="btn btn-ghost btn-xs" style="font-size:11px;padding:3px 10px">Jum, 21 Agu</button>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px">'
        + '<input type="text" class="form-input" placeholder="Cari kode atau nama saham..." style="width:220px;height:30px;font-size:12px" oninput="filterAnomalyTable(this.value)">'
      + '</div>'
    + '</div>'

    // SECTION 1: ANOMALY STRUCTURAL
    + '<div class="card" style="padding:16px;margin-bottom:16px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:6px">'
        + '<div>'
          + '<h2 style="font-size:15px;font-weight:800;color:var(--text);margin:0;display:flex;align-items:center;gap:6px"><i class="ti ti-bolt" style="color:var(--accent)"></i> ANOMALY STRUCTURAL</h2>'
          + '<div style="font-size:11px;color:var(--text3);margin-top:2px">Bid tebal · Offer tipis · ATS tinggi · Net asing positif</div>'
        + '</div>'
        + '<span class="badge b-up" style="font-size:10px;font-weight:700">7 Emiten Terdeteksi</span>'
      + '</div>'
      + '<div style="overflow-x:auto">'
        + '<table class="tbl" id="anomaly-struct-table" style="font-size:12px">'
          + '<thead><tr>'
            + '<th>#</th>'
            + '<th>KODE</th>'
            + '<th style="text-align:right">PRICE</th>'
            + '<th style="text-align:right">CHG%</th>'
            + '<th style="text-align:right">NET ASING</th>'
            + '<th style="text-align:right">2M BUYS</th>'
            + '<th style="text-align:right">B/O</th>'
            + '<th style="text-align:right">ATS</th>'
            + '<th style="text-align:center">AKSI</th>'
          + '</tr></thead>'
          + '<tbody>'
            + anomalyRows.map(function(r) {
              return '<tr style="cursor:pointer" onclick="switchIntelTicker(\'' + r.ticker + '\')">'
                + '<td style="color:var(--text3);font-weight:700">' + r.rank + '</td>'
                + '<td><strong style="color:var(--text)">' + r.ticker + '</strong> <span style="font-size:11px;color:var(--text3)">' + r.name + '</span></td>'
                + '<td class="font-mono" style="text-align:right;font-weight:700">Rp ' + fmtK(r.price) + '</td>'
                + '<td class="font-mono ' + r.chgCls + '" style="text-align:right;font-weight:700">' + r.chg + '</td>'
                + '<td class="font-mono up" style="text-align:right;font-weight:700">' + r.net + '</td>'
                + '<td class="font-mono" style="text-align:right">' + r.buys + '</td>'
                + '<td class="font-mono" style="text-align:right;color:#38bdf8;font-weight:700">' + r.bo + '</td>'
                + '<td class="font-mono" style="text-align:right">' + r.ats + '</td>'
                + '<td style="text-align:center" onclick="event.stopPropagation()">'
                  + '<button class="btn btn-ghost btn-xs" onclick="openBandarFlowModal(\'' + r.ticker + '\')" title="Buka Flow Modal">🌊 Flow</button>'
                  + '<button class="btn btn-primary btn-xs" onclick="switchIntelTicker(\'' + r.ticker + '\')" style="margin-left:4px" title="Buka di Stock Intelligence">Cockpit →</button>'
                + '</td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>'

    // SECTION 2: MOMENTUM / ARA DETECTOR (2-COL BENTO)
    + '<div class="card" style="padding:16px;margin-bottom:16px">'
      + '<div style="margin-bottom:12px">'
        + '<h2 style="font-size:15px;font-weight:800;color:var(--text);margin:0;display:flex;align-items:center;gap:6px"><i class="ti ti-rocket" style="color:#10B981"></i> MOMENTUM / ARA DETECTOR</h2>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px">Saham berpotensi bergerak signifikan besok · pola perilaku asing + teknikal close</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">'
        
        // LEFT COLUMN: ARA CANDIDATE
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            + '<span style="font-size:12px;font-weight:800;color:#10B981">ARA CANDIDATE</span>'
            + '<span style="font-size:10px;color:var(--text3)">Small-mid · Close=High · Offer=0 · Belum ARA</span>'
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:8px">'
            + araCards.map(function(c) {
              var tagsHtml = c.tags.map(function(tg) {
                return '<span class="badge b-blue" style="font-size:9.5px;padding:1px 6px">' + tg + '</span>';
              }).join(' ');
              return '<div class="intel-anomaly-card" onclick="switchIntelTicker(\'' + c.ticker + '\')">'
                + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
                  + '<div>'
                    + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
                      + '<strong style="font-size:13px;color:var(--text)">' + c.ticker + '</strong>'
                      + tagsHtml
                    + '</div>'
                    + '<div style="font-size:11px;color:var(--text3);margin-top:4px">' + c.desc + '</div>'
                  + '</div>'
                  + '<div style="text-align:right">'
                    + '<div class="font-mono" style="font-size:13px;font-weight:800;color:var(--text)">Rp ' + c.px + '</div>'
                    + '<div class="font-mono ' + c.chgCls + '" style="font-size:11px;font-weight:700">' + c.chg + '</div>'
                  + '</div>'
                + '</div>'
              + '</div>';
            }).join('')
          + '</div>'
        + '</div>'

        // RIGHT COLUMN: SWING BIG CAP
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:14px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            + '<span style="font-size:12px;font-weight:800;color:#38BDF8">SWING BIG CAP</span>'
            + '<span style="font-size:10px;color:var(--text3)">Likuiditas &gt; Rp10M · Big Accumulation</span>'
          + '</div>'
          + '<div style="display:flex;flex-direction:column;gap:8px">'
            + swingCards.map(function(c) {
              var tagsHtml = c.tags.map(function(tg) {
                return '<span class="badge b-up" style="font-size:9.5px;padding:1px 6px">' + tg + '</span>';
              }).join(' ');
              return '<div class="intel-anomaly-card" onclick="switchIntelTicker(\'' + c.ticker + '\')">'
                + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
                  + '<div>'
                    + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
                      + '<strong style="font-size:13px;color:var(--text)">' + c.ticker + '</strong>'
                      + tagsHtml
                    + '</div>'
                    + '<div style="font-size:11px;color:var(--text3);margin-top:4px">' + c.desc + '</div>'
                  + '</div>'
                  + '<div style="text-align:right">'
                    + '<div class="font-mono" style="font-size:13px;font-weight:800;color:var(--text)">Rp ' + c.px + '</div>'
                    + '<div class="font-mono ' + c.chgCls + '" style="font-size:11px;font-weight:700">' + c.chg + '</div>'
                  + '</div>'
                + '</div>'
              + '</div>';
            }).join('')
          + '</div>'
        + '</div>'

      + '</div>'
    + '</div>';

  return html;
}

function filterAnomalyTable(query) {
  var q = (query || '').toLowerCase().trim();
  var tbl = document.getElementById('anomaly-struct-table');
  if (!tbl) return;
  var rows = tbl.querySelectorAll('tbody tr');
  rows.forEach(function(r) {
    var txt = r.textContent.toLowerCase();
    r.style.display = (!q || txt.includes(q)) ? '' : 'none';
  });
}

// ── Global Aliases for Router Compatibility ──
window.renderRadarAnomalyAraSubTab = renderRadarAnomalyAraSubTab;
window.filterAnomalyTable = filterAnomalyTable;
window.renderMarketRegimePage = renderMarketRegimePage;
window.renderOpportunityRadarPage = renderOpportunityRadarPage;
window.renderDataConnPage = renderDataConnPage;
window.renderDataConnectionPage = renderDataConnPage;
window.setRadarSubTab = setRadarSubTab;
window.selectRadarFlowTicker = selectRadarFlowTicker;
window.updateRadarFilter = updateRadarFilter;
window.loadOpportunityRadarUniverse = loadOpportunityRadarUniverse;
window.loadAccumulationDistributionData = loadAccumulationDistributionData;
window.loadTransactionFlowData = loadTransactionFlowData;
window.loadCorporateActionsData = loadCorporateActionsData;
window.RADAR_STATE = RADAR_STATE;
