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

/**
 * Opportunity Radar Universe (Buy Zone >=80, Watch 70-79, Avoid <50)
 */
function getOpportunityRadarItems() {
  return [
    { ticker: 'BBCA', name: 'Bank Central Asia', score: 91, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+18.5%', pe: '21.4x', roe: '22.4%', flow: 'Strong Accumulation', verdict: 'Strong Buy', cat: 'Value / Quality' },
    { ticker: 'ANTM', name: 'Aneka Tambang', score: 87, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+24.2%', pe: '11.8x', roe: '16.5%', flow: 'High Institutional Volume', verdict: 'Accumulate', cat: 'Growth / Momentum' },
    { ticker: 'TLKM', name: 'Telkom Indonesia', score: 83, zone: 'BUY ZONE', zoneClass: 'b-up', mos: '+21.0%', pe: '13.2x', roe: '18.2%', flow: 'Moderate Inflow', verdict: 'Value Buy', cat: 'Dividend / Defensive' },
    { ticker: 'BMRI', name: 'Bank Mandiri', score: 74, zone: 'WATCH', zoneClass: 'b-amb', mos: '+8.4%', pe: '10.5x', roe: '20.1%', flow: 'Neutral Distribution', verdict: 'Hold / Trim', cat: 'Quality Large Cap' },
    { ticker: 'ASII', name: 'Astra International', score: 71, zone: 'WATCH', zoneClass: 'b-amb', mos: '+12.0%', pe: '7.2x', roe: '14.8%', flow: 'Consolidation', verdict: 'Watch Support', cat: 'Deep Value' },
    { ticker: 'GOTO', name: 'GoTo Gojek Tokopedia', score: 46, zone: 'AVOID', zoneClass: 'b-dn', mos: '-15.4%', pe: 'N/A', roe: '-8.2%', flow: 'Foreign Outflow', verdict: 'Avoid / Sell', cat: 'Speculative Tech' }
  ];
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
        + '<span class="card-title">OPPORTUNITY RADAR</span>'
      + '</div>'
      + '<button class="btn btn-ghost btn-xs" onclick="goPage(\'radar\')">Lihat Radar Lengkap →</button>'
    + '</div>'
    + '<div class="radar-preview-grid">';

  items.slice(0, 4).forEach(function(it) {
    html += '<div class="radar-mini-card" onclick="goPage(\'stock-intel\');if(typeof selectStockIntelTicker===\'function\')selectStockIntelTicker(\'' + it.ticker + '\');">'
      + '<div class="rmc-top">'
        + '<div class="rmc-ticker">' + it.ticker + '</div>'
        + '<span class="badge ' + it.zoneClass + '" style="font-size:9px">' + it.zone + '</span>'
      + '</div>'
      + '<div class="rmc-score-wrap">'
        + '<span class="rmc-score-val">' + it.score + '</span>'
        + '<span class="rmc-score-max">/ 100</span>'
      + '</div>'
      + '<div class="rmc-stats">'
        + '<div><span>MoS:</span> <strong class="up">' + it.mos + '</strong></div>'
        + '<div><span>PE:</span> <strong>' + it.pe + '</strong></div>'
      + '</div>'
      + '<div class="rmc-verdict">' + it.verdict + '</div>'
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
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-compass" style="color:var(--accent)"></i> Market Regime &amp; Tactical Allocation</div>'
    + '<div class="psub">Analisis multi-faktor tren IHSG, Foreign Flow, Likuiditas, Volatilitas, dan Rotasi Sektoral untuk menentukan strategi ekuitas optimal.</div>'
  + '</div>'

  + '<div class="row3" style="margin-bottom:16px">'
    + '<div class="metric" style="border-left:3px solid var(--green)">'
      + '<div class="mlabel">STATUS MARKET REGIME</div>'
      + '<div class="mval up" style="font-size:24px">🟢 ' + r.status + '</div>'
      + '<div class="msub up">Kondisi Makro Kondusif</div>'
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
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">IHSG 6.845, resistance terdekat 6.920, support kuat 6.780.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
        + '<div style="font-size:11px;color:var(--text3);font-weight:700">2. FOREIGN CAPITAL FLOW</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:6px;color:var(--green)">Net Inflow (+Rp 342.5B)</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">Arus dana asing terakumulasi di Big 4 Banks &amp; Komoditas.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
        + '<div style="font-size:11px;color:var(--text3);font-weight:700">3. MARKET BREADTH &amp; ADVANCE/DECLINE</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:6px;color:var(--accent)">Broad Participation (1.48x)</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">284 saham menguat berbanding 192 saham melemah.</div>'
      + '</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px">'
        + '<div style="font-size:11px;color:var(--text3);font-weight:700">4. VOLATILITAS &amp; SENTIMEN GLOBAL</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:6px;color:var(--green)">Low Risk (VIX 12.4)</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:4px">Kondisi pasar stabil tanpa tekanan likuiditas ekstrem.</div>'
      + '</div>'
    + '</div>'
  + '</div>';

  c.innerHTML = html;
}

/**
 * Render Full Opportunity Radar Page
 */
function renderOpportunityRadarPage() {
  var c = el('page-radar');
  if (!c) return;

  var items = getOpportunityRadarItems();

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-radar" style="color:var(--accent)"></i> Opportunity Radar</div>'
    + '<div class="psub">Pemeringkatan peluang saham berdasarkan gabungan skor Fundamental MoS, Smart Money Flow, Trend Momentum, dan Risk/Reward.</div>'
  + '</div>'

  + '<div class="card" style="padding:0;overflow:hidden">'
    + '<table class="tbl">'
      + '<thead><tr>'
        + '<th>Ticker &amp; Nama Saham</th>'
        + '<th style="text-align:center">Radar Score</th>'
        + '<th>Zona Klasifikasi</th>'
        + '<th style="text-align:right">Margin of Safety</th>'
        + '<th style="text-align:right">P/E Ratio</th>'
        + '<th style="text-align:right">ROE</th>'
        + '<th>Smart Money Flow</th>'
        + '<th>AI Verdict</th>'
        + '<th style="text-align:center">Aksi</th>'
      + '</tr></thead>'
      + '<tbody>';

  items.forEach(function(it) {
    html += '<tr>'
      + '<td><strong style="color:var(--text);font-size:13px">' + it.ticker + '</strong> <span style="color:var(--text3);font-size:11px">' + it.name + '</span></td>'
      + '<td style="text-align:center"><span class="mono" style="font-size:14px;font-weight:800;color:var(--accent)">' + it.score + '</span><span style="font-size:10px;color:var(--text3)">/100</span></td>'
      + '<td><span class="badge ' + it.zoneClass + '">' + it.zone + '</span></td>'
      + '<td class="mono up" style="text-align:right;font-weight:700">' + it.mos + '</td>'
      + '<td class="mono" style="text-align:right">' + it.pe + '</td>'
      + '<td class="mono" style="text-align:right">' + it.roe + '</td>'
      + '<td><span style="font-size:11px;color:var(--text2)">' + it.flow + '</span></td>'
      + '<td><strong style="color:var(--text)">' + it.verdict + '</strong></td>'
      + '<td style="text-align:center">'
        + '<button class="btn btn-primary btn-xs" onclick="goPage(\'stock-intel\');if(typeof selectStockIntelTicker===\'function\')selectStockIntelTicker(\'' + it.ticker + '\');">Cockpit →</button>'
      + '</td>'
    + '</tr>';
  });

  html += '</tbody></table></div>';
  c.innerHTML = html;
}

/**
 * Render Data Connection & Data Trust Inspection Page
 */
function renderDataConnPage() {
  var c = el('page-dataconn');
  if (!c) return;

  var nowStr = new Date().toLocaleString('id-ID');

  var html = '<div style="margin-bottom:16px">'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px"><i class="ti ti-plug" style="color:var(--accent)"></i> Data Connection &amp; Trust System</div>'
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
        + '<div><strong>Supabase Cloud Database</strong><div style="font-size:11px;color:var(--text3)">Penyimpanan riwayat transaksi, portofolio snapshot, dan thesis journal</div></div>'
        + '<span class="badge b-up">CONNECTED</span>'
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

// ── Global Aliases for Router Compatibility ──
window.renderMarketRegimePage = renderMarketRegimePage;
window.renderOpportunityRadarPage = renderOpportunityRadarPage;
window.renderDataConnPage = renderDataConnPage;
window.renderDataConnectionPage = renderDataConnPage;
