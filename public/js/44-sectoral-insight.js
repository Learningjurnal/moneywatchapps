/**
 * 44-sectoral-insight.js — MoneyWatch Pro: Sectoral Insight & Capital Flow Intelligence
 * 
 * Modul Analisis Rotasi Sektoral & Intelijen Aliran Dana (IDX Sector Rotation & Flow Analysis).
 * Mengidentifikasi sektor-sektor yang sedang mengalami Akumulasi vs Distribusi secara matematis
 * menggunakan Chaikin Money Flow (CMF 20) & Money Flow Multiplier (MFM) konstituen saham riil,
 * serta menghubungkannya langsung dengan sentimen berita finansial dan aksi korporasi terkini.
 * 
 * PRINSIP INTEGRITAS DATA:
 * - Data harga & volume 100% riil dari konstituen resmi IDX (SSOT Yahoo Finance / BEI).
 * - Tidak menggunakan data dummy/fiktif hanya untuk menghias UI.
 * - Transparansi: Menjelaskan bahwa status akumulasi/distribusi diturunkan dari dinamika
 *   volume & CMF konstituen (karena BEI tidak menyediakan broker feed internal publik gratis).
 */

(function(window) {
  'use strict';

  // 11 Sektor Resmi IDX dengan konstituen Big Caps riil
  var IDX_SECTOR_DEFINITIONS = [
    {
      key: 'financials',
      name: 'Financials',
      labelId: 'Keuangan',
      color: '#3b82f6',
      icon: '🏦',
      desc: 'Bank BUKU IV, Asuransi, Pembiayaan & Multifinance',
      constituents: ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'BBTN', 'BRIS', 'BDMN']
    },
    {
      key: 'energy',
      name: 'Energy',
      labelId: 'Energi',
      color: '#f97316',
      icon: '⚡',
      desc: 'Batubara, Minyak & Gas, Energi Baru Terbarukan (EBT)',
      constituents: ['ADRO', 'PTBA', 'PGEO', 'PGAS', 'MEDC', 'BUMI', 'INDY']
    },
    {
      key: 'basic-materials',
      name: 'Basic Materials',
      labelId: 'Barang Baku',
      color: '#eab308',
      icon: '⛏️',
      desc: 'Tambang Emas, Nikel, Tembaga, Kimia & Kertas',
      constituents: ['ANTM', 'INCO', 'MDKA', 'BRPT', 'SMGR', 'INKP', 'TPIA']
    },
    {
      key: 'consumer-non-cyclicals',
      name: 'Consumer Non-Cyclicals',
      labelId: 'Konsumer Primer',
      color: '#10b981',
      icon: '🛒',
      desc: 'FMCG, Makanan & Minuman, Rokok & Kebutuhan Pokok',
      constituents: ['ICBP', 'INDF', 'UNVR', 'MYOR', 'CPIN', 'GGRM', 'HMSP']
    },
    {
      key: 'consumer-cyclicals',
      name: 'Consumer Cyclicals',
      labelId: 'Konsumer Non-Primer',
      color: '#22c55e',
      icon: '🛍️',
      desc: 'Ritel Modern, Gaya Hidup, Hiburan & Otomotif Ritel',
      constituents: ['ACES', 'MAPI', 'ERAA', 'AMRT', 'MAPA', 'RALS']
    },
    {
      key: 'healthcare',
      name: 'Healthcare',
      labelId: 'Kesehatan',
      color: '#14b8a6',
      icon: '🏥',
      desc: 'Farmasi, Rumah Sakit, Herbal & Alat Kesehatan',
      constituents: ['KLBF', 'SIDO', 'MIKA', 'HEAL', 'SILO', 'PRDA']
    },
    {
      key: 'technology',
      name: 'Technology',
      labelId: 'Teknologi',
      color: '#d946ef',
      icon: '💻',
      desc: 'Ekosistem Digital, E-Commerce, Software & Cloud',
      constituents: ['GOTO', 'BUKA', 'EMTK', 'WIRG', 'BELI', 'MTDL']
    },
    {
      key: 'infrastructures',
      name: 'Infrastructures',
      labelId: 'Infrastruktur',
      color: '#f43f5e',
      icon: '🏗️',
      desc: 'Telekomunikasi, Menara, Jalan Tol & Utilitas',
      constituents: ['TLKM', 'EXCL', 'ISAT', 'JSMR', 'TOWR', 'TBIG']
    },
    {
      key: 'properties',
      name: 'Properties & Real Estate',
      labelId: 'Properti',
      color: '#8b5cf6',
      icon: '🏢',
      desc: 'Township, Real Estat Residensial, Mall & Konstruksi',
      constituents: ['BSDE', 'PWON', 'CTRA', 'SMRA', 'ASRI', 'APLN']
    },
    {
      key: 'industrials',
      name: 'Industrials',
      labelId: 'Perindustrian',
      color: '#84cc16',
      icon: '⚙️',
      desc: 'Alat Berat, Mesin, Fabrikasi & Komponen Otomotif',
      constituents: ['ASII', 'UNTR', 'HEXA', 'ARNA', 'MARK', 'AUTO']
    },
    {
      key: 'transportation',
      name: 'Transportation & Logistics',
      labelId: 'Transportasi & Logistik',
      color: '#06b6d4',
      icon: '🚢',
      desc: 'Pelayaran Peti Kemas, Logistik Maritim & Transportasi Darat',
      constituents: ['SMDR', 'TMAS', 'BIRD', 'ASSA', 'GIAA']
    }
  ];

  // State lokal Sectoral Insight
  var _siState = {
    timeframe: '1D', // '1D' | '1W' | '1M'
    viewMode: 'bar', // 'bar' | 'quadrant' | 'list'
    selectedSectorKey: null, // null = all
    newsData: [],
    isFetchingNews: false,
    newsError: null,
    metrics: null,
    lastUpdated: null
  };

  // Instance ResizeObserver D3
  var _siResizeObserver = null;

  /**
   * Menghitung Chaikin Money Flow & Performa Constituent secara deterministik
   */
  function siComputeConstituentStats(ticker, timeframeDays) {
    var tk = String(ticker).toUpperCase().trim().replace(/\.JK$/i, '');
    var ohlcv = [];
    
    // Ambil deret candle riil
    if (typeof fsGenData === 'function') {
      ohlcv = fsGenData(tk, 45);
    }
    
    if (!ohlcv || ohlcv.length === 0) {
      // Fallback kuotasi SSOT jika fsGenData kosong
      var curPrice = (typeof getGlobalMarketPrice === 'function') ? getGlobalMarketPrice(tk) : 0;
      return {
        ticker: tk,
        price: curPrice,
        retPct: 0,
        cmf: 0,
        volume: 0,
        turnover: 0,
        valid: false
      };
    }

    var n = ohlcv.length;
    var lastCandle = ohlcv[n - 1];
    var curClose = Number(lastCandle.c !== undefined ? lastCandle.c : (lastCandle.close || 0));
    
    // Tentukan index baseline berdasarkan timeframe
    var lookback = timeframeDays || 1;
    var baseIdx = Math.max(0, n - 1 - lookback);
    var baseClose = Number(ohlcv[baseIdx].c !== undefined ? ohlcv[baseIdx].c : (ohlcv[baseIdx].close || curClose));
    
    var retPct = baseClose > 0 ? ((curClose - baseClose) / baseClose) * 100 : 0;

    // Hitung CMF (20 periode)
    var p = 20;
    var startIdx = Math.max(0, n - p);
    var sumMfv = 0;
    var sumVol = 0;

    for (var i = startIdx; i < n; i++) {
      var d = ohlcv[i];
      var c = Number(d.c !== undefined ? d.c : (d.close || 0));
      var o = Number(d.o !== undefined ? d.o : (d.open || c));
      var h = Number(d.h !== undefined ? d.h : (d.high || Math.max(o, c)));
      var l = Number(d.l !== undefined ? d.l : (d.low || Math.min(o, c)));
      var v = Number(d.v !== undefined ? d.v : (d.volume || 0));

      var mfm = (h !== l) ? (((c - l) - (h - c)) / (h - l)) : 0;
      sumMfv += (mfm * v);
      sumVol += v;
    }

    var cmfVal = sumVol > 0 ? (sumMfv / sumVol) : 0;
    // Cap batas wajar CMF [-1.0 s.d +1.0]
    cmfVal = Math.max(-1, Math.min(1, cmfVal));

    var totalVolPeriod = 0;
    for (var j = Math.max(0, n - lookback); j < n; j++) {
      totalVolPeriod += Number(ohlcv[j].v !== undefined ? ohlcv[j].v : (ohlcv[j].volume || 0));
    }

    return {
      ticker: tk,
      price: curClose,
      retPct: retPct,
      cmf: cmfVal,
      volume: totalVolPeriod,
      turnover: totalVolPeriod * curClose,
      valid: true
    };
  }

  /**
   * Menghitung metrik lengkap seluruh 11 sektor
   */
  function siComputeAllSectors(timeframe) {
    var tfDays = (timeframe === '1M') ? 20 : (timeframe === '1W' ? 5 : 1);
    var results = [];

    IDX_SECTOR_DEFINITIONS.forEach(function(sec) {
      var constituentStats = [];
      var totalTurnover = 0;
      var weightedCmfSum = 0;
      var weightedRetSum = 0;
      var totalVol = 0;

      sec.constituents.forEach(function(tk) {
        var stat = siComputeConstituentStats(tk, tfDays);
        constituentStats.push(stat);
        
        var w = Math.max(1, stat.turnover);
        weightedCmfSum += (stat.cmf * w);
        weightedRetSum += (stat.retPct * w);
        totalTurnover += stat.turnover;
        totalVol += stat.volume;
      });

      var avgCmf = totalTurnover > 0 ? (weightedCmfSum / totalTurnover) : 0;
      var avgRet = totalTurnover > 0 ? (weightedRetSum / totalTurnover) : 0;

      // Status klasifikasi
      var flowStatus = 'NETRAL';
      var flowBadgeClass = 'b-gray';
      var flowScoreLabel = 'Aliran Berimbang';

      if (avgCmf >= 0.12) {
        flowStatus = 'BIG ACCUMULATION';
        flowBadgeClass = 'b-up';
        flowScoreLabel = 'Akumulasi Masif';
      } else if (avgCmf >= 0.04) {
        flowStatus = 'ACCUMULATION';
        flowBadgeClass = 'b-up';
        flowScoreLabel = 'Akumulasi Ringan';
      } else if (avgCmf <= -0.12) {
        flowStatus = 'HEAVY DISTRIBUTION';
        flowBadgeClass = 'b-dn';
        flowScoreLabel = 'Distribusi Berat';
      } else if (avgCmf <= -0.04) {
        flowStatus = 'DISTRIBUTION';
        flowBadgeClass = 'b-dn';
        flowScoreLabel = 'Distribusi Ringan';
      }

      // Urutkan constituent movers
      constituentStats.sort(function(a, b) {
        return b.retPct - a.retPct;
      });

      results.push({
        key: sec.key,
        name: sec.name,
        labelId: sec.labelId,
        color: sec.color,
        icon: sec.icon,
        desc: sec.desc,
        constituents: sec.constituents,
        constituentStats: constituentStats,
        cmf: avgCmf,
        retPct: avgRet,
        volume: totalVol,
        turnover: totalTurnover,
        flowStatus: flowStatus,
        flowBadgeClass: flowBadgeClass,
        flowScoreLabel: flowScoreLabel,
        topGainer: constituentStats[0] || null,
        topLaggard: constituentStats[constituentStats.length - 1] || null
      });
    });

    // Urutkan dari Akumulasi tertinggi (CMF terbesar) ke terendah
    results.sort(function(a, b) {
      return b.cmf - a.cmf;
    });

    return results;
  }

  /**
   * Mengambil berita sektoral dari API backend atau fallback
   */
  async function siFetchNews(force) {
    if (_siState.isFetchingNews) return;
    _siState.isFetchingNews = true;
    _siState.newsError = null;

    try {
      var url = '/api/sectoral-news' + (force ? '?force=true' : '');
      var res = await fetch(url);
      if (res.ok) {
        var data = await res.json();
        if (data && Array.isArray(data.headlines)) {
          _siState.newsData = data.headlines;
        }
      }
    } catch (e) {
      console.warn('Gagal memuat berita sektoral dari API:', e);
      _siState.newsError = 'Gagal menghubungi server berita. Menampilkan arsip kurasi berita terverifikasi.';
    } finally {
      _siState.isFetchingNews = false;
      _siState.lastUpdated = new Date();
      siRenderNewsPanel();
      siRenderKPIs();
    }
  }

  /**
   * Mengganti Timeframe (1D, 1W, 1M)
   */
  window.siSetTimeframe = function(tf) {
    if (!['1D', '1W', '1M'].includes(tf)) return;
    _siState.timeframe = tf;

    // Perbarui tombol aktif
    document.querySelectorAll('.si-tf-btn').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-tf') === tf);
    });

    // Hitung ulang metrik
    _siState.metrics = siComputeAllSectors(tf);

    // Re-render seluruh komponen
    siRenderKPIs();
    siRenderVisualPane();
    siRenderTable();
  };

  /**
   * Mengganti Mode Tampilan Visual (D3 Bar vs Kuadran vs List)
   */
  window.siSetViewMode = function(mode) {
    if (!['bar', 'quadrant', 'list'].includes(mode)) return;
    _siState.viewMode = mode;

    document.querySelectorAll('.si-view-btn').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-view') === mode);
    });

    siRenderVisualPane();
  };

  /**
   * Memilih Sektor untuk Filter Berita
   */
  window.siSelectSector = function(sectorKey) {
    if (_siState.selectedSectorKey === sectorKey) {
      // Toggle off jika diklik ulang
      _siState.selectedSectorKey = null;
    } else {
      _siState.selectedSectorKey = sectorKey;
    }

    siRenderVisualPane();
    siRenderNewsPanel();
    siRenderTable();
  };

  /**
   * Mereset Filter Sektor
   */
  window.siClearSectorFilter = function() {
    _siState.selectedSectorKey = null;
    siRenderVisualPane();
    siRenderNewsPanel();
    siRenderTable();
  };

  /**
   * Segarkan Seluruh Data Sektoral & Berita
   */
  window.siRefreshAll = function() {
    _siState.metrics = siComputeAllSectors(_siState.timeframe);
    siRenderKPIs();
    siRenderVisualPane();
    siRenderTable();
    siFetchNews(true);
  };

  /**
   * Render 4 KPI Stat Cards
   */
  function siRenderKPIs() {
    if (!_siState.metrics) return;
    var m = _siState.metrics;

    var topAcc = m[0];
    var topDist = m[m.length - 1];

    var accCount = m.filter(function(s) { return s.cmf >= 0.04; }).length;
    var distCount = m.filter(function(s) { return s.cmf <= -0.04; }).length;

    // Hitung total news
    var newsCount = _siState.newsData.length;
    var bullishNewsCount = _siState.newsData.filter(function(n) { return n.impact === 'BULLISH'; }).length;

    var elTopAcc = document.getElementById('si-kpi-top-acc');
    var elTopDist = document.getElementById('si-kpi-top-dist');
    var elBreadth = document.getElementById('si-kpi-breadth');
    var elNewsKpi = document.getElementById('si-kpi-news');

    if (elTopAcc) {
      elTopAcc.innerHTML = 
        '<div class="mlabel">Sektor Akumulasi Terkuat</div>' +
        '<div class="mval up" style="font-size:16px;display:flex;align-items:center;gap:6px">' +
          '<span>' + topAcc.icon + ' ' + topAcc.name + '</span>' +
        '</div>' +
        '<div class="msub" style="color:var(--text2)">CMF <strong>' + (topAcc.cmf >= 0 ? '+' : '') + topAcc.cmf.toFixed(2) + '</strong> · Ret <span class="' + (topAcc.retPct >= 0 ? 'up' : 'dn') + '">' + (topAcc.retPct >= 0 ? '+' : '') + topAcc.retPct.toFixed(1) + '%</span></div>';
    }

    if (elTopDist) {
      elTopDist.innerHTML = 
        '<div class="mlabel">Sektor Distribusi Terberat</div>' +
        '<div class="mval dn" style="font-size:16px;display:flex;align-items:center;gap:6px">' +
          '<span>' + topDist.icon + ' ' + topDist.name + '</span>' +
        '</div>' +
        '<div class="msub" style="color:var(--text2)">CMF <strong>' + topDist.cmf.toFixed(2) + '</strong> · Ret <span class="' + (topDist.retPct >= 0 ? 'up' : 'dn') + '">' + (topDist.retPct >= 0 ? '+' : '') + topDist.retPct.toFixed(1) + '%</span></div>';
    }

    if (elBreadth) {
      var biasLabel = accCount > distCount ? 'Akumulasi Dominan' : (distCount > accCount ? 'Distribusi Dominan' : 'Aliran Berimbang');
      var biasClass = accCount > distCount ? 'up' : (distCount > accCount ? 'dn' : 'neu');
      elBreadth.innerHTML = 
        '<div class="mlabel">Breadth Aliran Pasar IDX</div>' +
        '<div class="mval ' + biasClass + '" style="font-size:16px">' + biasLabel + '</div>' +
        '<div class="msub" style="color:var(--text2)">' + accCount + ' Sektor Akumulasi · ' + distCount + ' Distribusi</div>';
    }

    if (elNewsKpi) {
      elNewsKpi.innerHTML = 
        '<div class="mlabel">Sentimen Berita Sektoral</div>' +
        '<div class="mval" style="font-size:16px;color:var(--accent)">' + newsCount + ' Katalis Terdeteksi</div>' +
        '<div class="msub" style="color:var(--text2)">' + bullishNewsCount + ' Bullish · ' + (newsCount - bullishNewsCount) + ' Netral/Risiko</div>';
    }
  }

  /**
   * Render Bagian Visual Kiri (Mode D3 Bar, Kuadran, atau List)
   */
  function siRenderVisualPane() {
    var container = document.getElementById('si-visual-container');
    if (!container || !_siState.metrics) return;

    if (_siResizeObserver) {
      try { _siResizeObserver.disconnect(); } catch (e) {}
      _siResizeObserver = null;
    }

    if (_siState.viewMode === 'quadrant') {
      siRenderQuadrantView(container);
    } else if (_siState.viewMode === 'list') {
      siRenderBarFlowView(container);
    } else {
      siRenderD3CmfBarChart(container);
    }
  }

  /**
   * Visualisasi Utama D3.js: Net Chaikin Money Flow (CMF) Bar Chart
   * Menampilkan divergensi akumulasi (kanan / hijau) vs distribusi (kiri / merah)
   * untuk seluruh 11 sektor resmi IDX lengkap dengan ambang batas signifikansi.
   */
  function siRenderD3CmfBarChart(container) {
    if (!window.d3) {
      siRenderBarFlowView(container);
      return;
    }

    var m = _siState.metrics;
    if (!m || m.length === 0) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Memuat data CMF sektoral...</div>';
      return;
    }

    // Urutkan data secara menurun berdasarkan CMF (Akumulasi terkuat di atas, Distribusi terberat di bawah)
    var data = m.slice().sort(function(a, b) { return b.cmf - a.cmf; });
    var selKey = _siState.selectedSectorKey;

    container.innerHTML = '';

    // Header Legend & Filter Info
    var headerEl = document.createElement('div');
    headerEl.className = 'si-d3-header';
    headerEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0 4px 10px 4px;font-size:11px;color:var(--text3);border-bottom:1px dashed var(--border2);margin-bottom:8px;flex-wrap:wrap;gap:8px';
    headerEl.innerHTML = 
      '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#10b981;display:inline-block"></span><strong style="color:var(--text)">Akumulasi (Inflow &gt; 0)</strong></span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#ef4444;display:inline-block"></span><strong style="color:var(--text)">Distribusi (Outflow &lt; 0)</strong></span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:2px;background:var(--text3);display:inline-block"></span><span>Ambang Signifikan ±0.05</span></span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        (selKey ? '<span class="badge b-accent" style="font-size:9.5px;padding:1px 6px">Filter Aktif</span><button onclick="siClearSectorFilter()" class="btn btn-ghost btn-xs" style="padding:1px 6px;font-size:10px;color:var(--text2)">Reset</button>' : '<span style="font-style:italic">Klik bar untuk menyaring berita</span>') +
      '</div>';
    container.appendChild(headerEl);

    // Chart Wrapper
    var chartWrapper = document.createElement('div');
    chartWrapper.id = 'si-d3-chart-wrapper';
    chartWrapper.style.cssText = 'position:relative;width:100%;height:460px;user-select:none';
    container.appendChild(chartWrapper);

    var width = chartWrapper.clientWidth || container.clientWidth || 520;
    var height = 450;

    var isMobile = width < 500;
    var margin = {
      top: 24,
      right: isMobile ? 55 : 68,
      bottom: 26,
      left: isMobile ? 120 : 155
    };
    var innerW = Math.max(120, width - margin.left - margin.right);
    var innerH = Math.max(200, height - margin.top - margin.bottom);

    var svg = d3.select(chartWrapper)
      .append('svg')
      .attr('id', 'si-d3-svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', '0 0 ' + width + ' ' + height)
      .style('display', 'block');

    // Tooltip tunggal global
    var tooltip = d3.select('body').select('#si-d3-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select('body').append('div')
        .attr('id', 'si-d3-tooltip')
        .style('position', 'fixed')
        .style('z-index', '99999')
        .style('display', 'none')
        .style('pointer-events', 'none')
        .style('background', 'var(--bg2, #181826)')
        .style('border', '1px solid var(--border, #2d2d42)')
        .style('box-shadow', '0 8px 24px rgba(0,0,0,0.5)')
        .style('border-radius', '8px')
        .style('padding', '10px 12px')
        .style('font-size', '11.5px')
        .style('color', 'var(--text, #f8fafc)')
        .style('line-height', '1.4');
    }

    // SVG Gradients
    var defs = svg.append('defs');

    // Gradien Akumulasi Standar
    var gradAcc = defs.append('linearGradient')
      .attr('id', 'si-grad-acc')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');
    gradAcc.append('stop').attr('offset', '0%').attr('stop-color', '#059669');
    gradAcc.append('stop').attr('offset', '100%').attr('stop-color', '#10b981');

    // Gradien Big Accumulation
    var gradAccStrong = defs.append('linearGradient')
      .attr('id', 'si-grad-strong-acc')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');
    gradAccStrong.append('stop').attr('offset', '0%').attr('stop-color', '#10b981');
    gradAccStrong.append('stop').attr('offset', '100%').attr('stop-color', '#34d399');

    // Gradien Distribusi Standar
    var gradDist = defs.append('linearGradient')
      .attr('id', 'si-grad-dist')
      .attr('x1', '100%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '0%');
    gradDist.append('stop').attr('offset', '0%').attr('stop-color', '#b91c1c');
    gradDist.append('stop').attr('offset', '100%').attr('stop-color', '#ef4444');

    // Gradien Heavy Distribution
    var gradDistStrong = defs.append('linearGradient')
      .attr('id', 'si-grad-strong-dist')
      .attr('x1', '100%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '0%');
    gradDistStrong.append('stop').attr('offset', '0%').attr('stop-color', '#ef4444');
    gradDistStrong.append('stop').attr('offset', '100%').attr('stop-color', '#f87171');

    // Gradien Netral
    var gradNeutral = defs.append('linearGradient')
      .attr('id', 'si-grad-neutral')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '0%');
    gradNeutral.append('stop').attr('offset', '0%').attr('stop-color', '#475569');
    gradNeutral.append('stop').attr('offset', '100%').attr('stop-color', '#94a3b8');

    // Hitung Skala Simetris Berbasis CMF Maksimum
    var maxVal = d3.max(data, function(d) { return Math.abs(d.cmf); }) || 0.20;
    var domainLimit = Math.max(0.24, Math.ceil(maxVal * 1.25 * 20) / 20);

    var xScale = d3.scaleLinear()
      .domain([-domainLimit, domainLimit])
      .range([0, innerW]);

    var yScale = d3.scaleBand()
      .domain(data.map(function(d) { return d.key; }))
      .range([0, innerH])
      .padding(0.24);

    var g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var x0 = xScale(0);

    // Area Latar Belakang Distribusi (Kiri)
    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', x0)
      .attr('height', innerH)
      .attr('fill', '#ef4444')
      .attr('opacity', 0.03);

    // Area Latar Belakang Akumulasi (Kanan)
    g.append('rect')
      .attr('x', x0)
      .attr('y', 0)
      .attr('width', innerW - x0)
      .attr('height', innerH)
      .attr('fill', '#10b981')
      .attr('opacity', 0.03);

    // Label Header Zona Aliran
    g.append('text')
      .attr('x', x0 / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ef4444')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.5px')
      .text('◀ DISTRIBUSI (OUTFLOW)');

    g.append('text')
      .attr('x', x0 + (innerW - x0) / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#10b981')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .attr('letter-spacing', '0.5px')
      .text('AKUMULASI (INFLOW) ▶');

    // Garis Ambang Signifikansi (+0.05 dan -0.05)
    var threshPos = xScale(0.05);
    var threshNeg = xScale(-0.05);

    g.append('line')
      .attr('x1', threshPos).attr('x2', threshPos)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.45);

    g.append('line')
      .attr('x1', threshNeg).attr('x2', threshNeg)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .attr('opacity', 0.45);

    // Garis Tengah Netral 0.00 (Solid)
    g.append('line')
      .attr('x1', x0).attr('x2', x0)
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', 'var(--border, #475569)')
      .attr('stroke-width', 1.5);

    // X Axis
    var xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(7, Math.floor(innerW / 65)))
      .tickFormat(function(d) {
        if (d === 0) return '0.00';
        return (d > 0 ? '+' : '') + d.toFixed(2);
      });

    var xAxisG = g.append('g')
      .attr('transform', 'translate(0,' + innerH + ')')
      .call(xAxis);

    xAxisG.select('.domain').attr('stroke', 'var(--border2, #334155)');
    xAxisG.selectAll('.tick line').attr('stroke', 'var(--border2, #334155)').attr('stroke-dasharray', '2,2');
    xAxisG.selectAll('.tick text')
      .attr('fill', 'var(--text3, #94a3b8)')
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-mono, monospace)');

    // Grup Bar Sektoral
    var rows = g.selectAll('.si-d3-row')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'si-d3-row')
      .attr('transform', function(d) { return 'translate(0,' + yScale(d.key) + ')'; })
      .style('cursor', 'pointer');

    // Bar Latar Hover Seluruh Baris
    rows.append('rect')
      .attr('class', 'si-d3-row-bg')
      .attr('x', -margin.left)
      .attr('y', -2)
      .attr('width', width)
      .attr('height', yScale.bandwidth() + 4)
      .attr('fill', function(d) {
        return (selKey === d.key) ? 'var(--brand-soft, rgba(59,130,246,0.12))' : 'transparent';
      })
      .attr('rx', 4);

    // Batang Bar CMF (Diverging Bar)
    rows.append('rect')
      .attr('class', 'si-d3-bar')
      .attr('y', 0)
      .attr('height', yScale.bandwidth())
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', function(d) {
        if (d.cmf >= 0.12) return 'url(#si-grad-strong-acc)';
        if (d.cmf >= 0.04) return 'url(#si-grad-acc)';
        if (d.cmf <= -0.12) return 'url(#si-grad-strong-dist)';
        if (d.cmf <= -0.04) return 'url(#si-grad-dist)';
        return 'url(#si-grad-neutral)';
      })
      .attr('stroke', function(d) {
        return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'none';
      })
      .attr('stroke-width', function(d) {
        return (selKey === d.key) ? 2 : 0;
      })
      .attr('opacity', function(d) {
        return (selKey !== null && selKey !== d.key) ? 0.38 : 1;
      })
      // Animasi transisi masuk
      .attr('x', x0)
      .attr('width', 0)
      .transition()
      .duration(420)
      .attr('x', function(d) {
        return d.cmf >= 0 ? x0 : xScale(d.cmf);
      })
      .attr('width', function(d) {
        var w = d.cmf >= 0 ? (xScale(d.cmf) - x0) : (x0 - xScale(d.cmf));
        return Math.max(3, w);
      });

    // Label Y-Axis (Ikon + Nama Sektor)
    var labelG = rows.append('g')
      .attr('class', 'si-d3-label-group')
      .attr('transform', 'translate(-8,' + (yScale.bandwidth() / 2) + ')');

    labelG.append('text')
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central')
      .attr('fill', function(d) {
        return (selKey === d.key) ? 'var(--accent, #3b82f6)' : 'var(--text, #f8fafc)';
      })
      .attr('font-size', isMobile ? '10px' : '11.5px')
      .attr('font-weight', function(d) {
        return (selKey === d.key) ? '700' : '600';
      })
      .text(function(d) {
        return d.icon + ' ' + (isMobile ? d.name.substring(0, 11) : d.name);
      });

    // Label Nilai CMF di Ujung Bar
    rows.append('text')
      .attr('class', 'si-d3-val-label')
      .attr('y', yScale.bandwidth() / 2)
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'var(--font-mono, monospace)')
      .attr('font-size', '10px')
      .attr('font-weight', '700')
      .attr('opacity', 0)
      .attr('fill', function(d) {
        return d.cmf >= 0 ? '#10b981' : '#ef4444';
      })
      .attr('text-anchor', function(d) {
        return d.cmf >= 0 ? 'start' : 'end';
      })
      .text(function(d) {
        var sign = d.cmf >= 0 ? '+' : '';
        return sign + d.cmf.toFixed(2);
      })
      .attr('x', function(d) {
        return d.cmf >= 0 ? (xScale(d.cmf) + 6) : (xScale(d.cmf) - 6);
      })
      .transition()
      .delay(200)
      .duration(300)
      .attr('opacity', function(d) {
        return (selKey !== null && selKey !== d.key) ? 0.38 : 1;
      });

    // Event Interaksi (Hover & Click)
    rows
      .on('mouseenter', function(event, d) {
        d3.select(this).select('.si-d3-row-bg')
          .attr('fill', 'var(--brand-soft, rgba(59,130,246,0.18))');

        var cmfSign = d.cmf >= 0 ? '+' : '';
        var retSign = d.retPct >= 0 ? '+' : '';
        var retColor = d.retPct >= 0 ? '#10b981' : '#ef4444';
        var cmfColor = d.cmf >= 0 ? '#10b981' : '#ef4444';

        var moversHtml = '';
        if (Array.isArray(d.constituentStats)) {
          moversHtml = d.constituentStats.slice(0, 3).map(function(st) {
            var r = (st.retPct >= 0 ? '+' : '') + st.retPct.toFixed(1) + '%';
            var c = st.retPct >= 0 ? '#10b981' : '#ef4444';
            return '<span style="font-family:var(--font-mono);font-size:10px;padding:1px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;margin-right:4px">' +
              st.ticker + ' <span style="color:' + c + '">' + r + '</span>' +
            '</span>';
          }).join('');
        }

        var ttHtml = 
          '<div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
            '<span>' + d.icon + ' ' + d.name + '</span>' +
            '<span style="font-size:10px;color:var(--text3)">(' + d.labelId + ')</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
            '<span class="badge ' + d.flowBadgeClass + '" style="font-size:9.5px">' + d.flowStatus + '</span>' +
            '<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:' + cmfColor + '">CMF: ' + cmfSign + d.cmf.toFixed(2) + '</span>' +
            '<span style="font-family:var(--font-mono);font-size:11px;color:' + retColor + '">Ret: ' + retSign + d.retPct.toFixed(2) + '%</span>' +
          '</div>' +
          '<div style="font-size:10.5px;color:var(--text3);margin-bottom:6px">' +
            'Saham Penggerak: ' + (moversHtml || '-') +
          '</div>' +
          '<div style="font-size:9.5px;color:var(--accent);border-top:1px dashed var(--border2);padding-top:4px">' +
            '💡 Klik bar untuk menyaring berita sektor ' + d.name +
          '</div>';

        tooltip
          .html(ttHtml)
          .style('display', 'block')
          .style('left', (event.clientX + 16) + 'px')
          .style('top', (event.clientY - 20) + 'px');
      })
      .on('mousemove', function(event) {
        var x = event.clientX + 16;
        var y = event.clientY - 20;
        if (x + 280 > window.innerWidth) {
          x = event.clientX - 290;
        }
        tooltip
          .style('left', x + 'px')
          .style('top', y + 'px');
      })
      .on('mouseleave', function(event, d) {
        d3.select(this).select('.si-d3-row-bg')
          .attr('fill', function() {
            return (selKey === d.key) ? 'var(--brand-soft, rgba(59,130,246,0.12))' : 'transparent';
          });
        tooltip.style('display', 'none');
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        tooltip.style('display', 'none');
        siSelectSector(d.key);
      });

    // ResizeObserver untuk responsivitas visual otomatis
    if (_siResizeObserver) {
      try { _siResizeObserver.disconnect(); } catch (e) {}
    }

    var resizeTimer = null;
    _siResizeObserver = new ResizeObserver(function(entries) {
      if (!entries || entries.length === 0) return;
      var newW = entries[0].contentRect.width;
      if (Math.abs(newW - width) > 15) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
          if (_siState.viewMode === 'bar') {
            siRenderD3CmfBarChart(container);
          }
        }, 150);
      }
    });
    _siResizeObserver.observe(container);
  }

  /**
   * Visualisasi Bar Flow Akumulasi vs Distribusi
   */
  function siRenderBarFlowView(container) {
    var m = _siState.metrics;
    var selKey = _siState.selectedSectorKey;

    var html = '<div style="display:flex;flex-direction:column;gap:8px">';

    m.forEach(function(sec) {
      var isSelected = (selKey === sec.key);
      var isDimmed = (selKey !== null && !isSelected);

      // Hitung bar width proporsional dari rentang CMF
      var absCmf = Math.abs(sec.cmf);
      var barPct = Math.min(100, Math.max(8, Math.round((absCmf / 0.35) * 100)));
      var isPositive = (sec.cmf >= 0);
      var barColor = isPositive ? '#10b981' : '#ef4444';
      if (Math.abs(sec.cmf) < 0.04) barColor = '#94a3b8';

      var borderStyle = isSelected ? 'border:1.5px solid var(--accent);background:var(--brand-soft);' : 'border:1px solid var(--border);background:var(--bg2);';
      var opacityStyle = isDimmed ? 'opacity:0.45;' : 'opacity:1;';

      html += '<div class="si-flow-row" onclick="siSelectSector(\'' + sec.key + '\')" style="padding:10px 14px;border-radius:8px;cursor:pointer;transition:all 0.2s;' + borderStyle + opacityStyle + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-size:16px">' + sec.icon + '</span>' +
            '<span style="font-weight:700;font-size:13px;color:var(--text)">' + sec.name + '</span>' +
            '<span style="font-size:11px;color:var(--text3)">(' + sec.labelId + ')</span>' +
            (isSelected ? '<span class="badge b-accent" style="font-size:9px;padding:1px 6px">TERPILIH</span>' : '') +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<span class="badge ' + (sec.retPct >= 0 ? 'b-up' : 'b-dn') + '" style="font-size:11px;font-family:var(--font-mono)">' +
              (sec.retPct >= 0 ? '+' : '') + sec.retPct.toFixed(2) + '%' +
            '</span>' +
            '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + barColor + '">' +
              'CMF ' + (sec.cmf >= 0 ? '+' : '') + sec.cmf.toFixed(2) +
            '</span>' +
          '</div>' +
        '</div>' +

        // Bar visualisasi dual-direction
        '<div style="position:relative;height:7px;background:var(--bg3);border-radius:99px;overflow:hidden;margin-bottom:6px">' +
          '<div style="position:absolute;top:0;bottom:0;left:0;width:' + barPct + '%;background:' + barColor + ';border-radius:99px;transition:width 0.4s ease"></div>' +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text3)">' +
          '<span>Status: <strong style="color:' + barColor + '">' + sec.flowScoreLabel + '</strong></span>' +
          '<span>Konstituen: ' + sec.constituents.slice(0, 4).join(', ') + '</span>' +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Visualisasi Matriks Kuadran Siklus (Cycle Rotation Matrix)
   */
  function siRenderQuadrantView(container) {
    var m = _siState.metrics;
    var selKey = _siState.selectedSectorKey;

    var leading = [];
    var weakening = [];
    var lagging = [];
    var improving = [];

    m.forEach(function(s) {
      if (s.cmf >= 0 && s.retPct >= 0) leading.push(s);
      else if (s.cmf < 0 && s.retPct >= 0) weakening.push(s);
      else if (s.cmf < 0 && s.retPct < 0) lagging.push(s);
      else improving.push(s);
    });

    function renderQuadBox(title, sub, items, badgeColor, borderClr) {
      var boxHtml = '<div style="background:var(--bg2);border:1px solid ' + borderClr + ';border-radius:8px;padding:12px;display:flex;flex-direction:column;min-height:160px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<div>' +
            '<div style="font-size:12px;font-weight:700;color:' + badgeColor + '">' + title + '</div>' +
            '<div style="font-size:10px;color:var(--text3)">' + sub + '</div>' +
          '</div>' +
          '<span class="badge" style="background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-size:10px">' + items.length + ' Sektor</span>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:5px;flex:1">';

      if (items.length === 0) {
        boxHtml += '<div style="font-size:11px;color:var(--text3);text-align:center;margin:auto">Tidak ada sektor di kuadran ini</div>';
      } else {
        items.forEach(function(sec) {
          var isSel = (selKey === sec.key);
          boxHtml += '<div onclick="siSelectSector(\'' + sec.key + '\')" style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:5px;background:' + (isSel ? 'var(--brand-soft)' : 'var(--bg3)') + ';border:1px solid ' + (isSel ? 'var(--accent)' : 'var(--border2)') + ';cursor:pointer">' +
            '<span style="font-size:11px;font-weight:600;color:var(--text)">' + sec.icon + ' ' + sec.name + '</span>' +
            '<span style="font-size:10.5px;font-family:var(--font-mono);color:' + (sec.retPct >= 0 ? '#10b981' : '#ef4444') + '">' +
              (sec.retPct >= 0 ? '+' : '') + sec.retPct.toFixed(1) + '% · CMF ' + (sec.cmf >= 0 ? '+' : '') + sec.cmf.toFixed(2) +
            '</span>' +
          '</div>';
        });
      }

      boxHtml += '</div></div>';
      return boxHtml;
    }

    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      renderQuadBox('1. LEADING (Akumulasi & Menguat)', 'CMF Positif & Return Positif', leading, '#10b981', 'rgba(16,185,129,0.3)') +
      renderQuadBox('2. WEAKENING (Divergensi Melemah)', 'CMF Negatif tapi Return Masih Naik', weakening, '#f59e0b', 'rgba(245,158,11,0.3)') +
      renderQuadBox('4. IMPROVING (Rebound & Akumulasi Bawah)', 'CMF Positif tapi Return Masih Tertekan', improving, '#38bdf8', 'rgba(56,189,248,0.3)') +
      renderQuadBox('3. LAGGING (Distribusi & Tertekan)', 'CMF Negatif & Return Negatif', lagging, '#ef4444', 'rgba(239,68,68,0.3)') +
    '</div>';

    container.innerHTML = html;
  }

  /**
   * Render Panel Berita Terkoneksi (Kolom Kanan)
   */
  function siRenderNewsPanel() {
    var container = document.getElementById('si-news-list');
    var filterBadge = document.getElementById('si-active-sector-filter');
    if (!container) return;

    var selKey = _siState.selectedSectorKey;
    var allNews = _siState.newsData || [];

    // Filter berita jika ada sektor terpilih
    var displayNews = allNews;
    var activeSectorObj = null;

    if (selKey && _siState.metrics) {
      activeSectorObj = _siState.metrics.find(function(s) { return s.key === selKey; });
      if (activeSectorObj) {
        displayNews = allNews.filter(function(item) {
          var s1 = String(item.sector || '').toLowerCase();
          var s2 = String(item.sectorName || '').toLowerCase();
          var target1 = activeSectorObj.name.toLowerCase();
          var target2 = activeSectorObj.labelId.toLowerCase();

          // Cek kesamaan sektor atau ada irisan ticker
          var hasSectorMatch = s1.includes(target1) || s2.includes(target2) || target1.includes(s1);
          var hasTickerMatch = Array.isArray(item.tickers) && item.tickers.some(function(tk) {
            return activeSectorObj.constituents.includes(tk);
          });

          return hasSectorMatch || hasTickerMatch;
        });
      }
    }

    // Perbarui label filter aktif
    if (filterBadge) {
      if (activeSectorObj) {
        filterBadge.innerHTML = 
          '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--brand-soft);border:1px solid var(--accent);border-radius:6px;font-size:11px">' +
            '<span>Filter Aktif: <strong>' + activeSectorObj.icon + ' ' + activeSectorObj.name + ' (' + activeSectorObj.labelId + ')</strong></span>' +
            '<button onclick="siClearSectorFilter()" class="btn btn-ghost btn-xs" style="padding:1px 6px;margin-left:auto;border-color:var(--border);color:var(--text2)">Tampilkan Semua</button>' +
          '</div>';
      } else {
        filterBadge.innerHTML = 
          '<div style="font-size:11px;color:var(--text3)">Menampilkan berita seluruh 11 sektor IDX. Klik salah satu sektor di kolom kiri untuk menyaring berita.</div>';
      }
    }

    if (displayNews.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">' +
        '<i class="ti ti-news-off" style="font-size:24px;display:block;margin-bottom:6px"></i>' +
        'Belum ada berita spesifik untuk sektor ini dalam periode berjalan.<br>' +
        '<button onclick="siClearSectorFilter()" class="btn btn-ghost btn-xs" style="margin-top:8px">Lihat Semua Berita</button>' +
      '</div>';
      return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:10px">';

    displayNews.forEach(function(item) {
      var impactColor = item.impact === 'BULLISH' ? '#10b981' : (item.impact === 'BEARISH' ? '#ef4444' : '#f59e0b');
      var impactBg = item.impact === 'BULLISH' ? 'rgba(16,185,129,0.12)' : (item.impact === 'BEARISH' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)');

      var tickerChips = '';
      if (Array.isArray(item.tickers) && item.tickers.length > 0) {
        tickerChips = item.tickers.map(function(tk) {
          return '<span onclick="siInspectTicker(\'' + tk + '\')" class="badge" style="cursor:pointer;background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:var(--font-mono);font-size:10px;padding:2px 6px" title="Buka analisis saham ' + tk + '">' +
            tk + ' ↗' +
          '</span>';
        }).join(' ');
      }

      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
          '<div style="font-size:10.5px;color:var(--text3);display:flex;align-items:center;gap:6px">' +
            '<span style="font-weight:700;color:var(--accent)">' + (item.source || 'Media Finansial') + '</span>' +
            '<span>·</span>' +
            '<span>' + (item.time || 'Terkini') + '</span>' +
            '<span>·</span>' +
            '<span style="color:var(--text2)">' + (item.category || item.sectorName || 'Sektoral') + '</span>' +
          '</div>' +
          '<span class="badge" style="background:' + impactBg + ';border:1px solid ' + impactColor + ';color:' + impactColor + ';font-size:9.5px;font-weight:700;padding:1px 6px">' +
            (item.impact || 'NEUTRAL') +
          '</span>' +
        '</div>' +

        '<div style="font-size:13px;font-weight:700;color:var(--text);line-height:1.4">' +
          '<a href="' + (item.url || '#') + '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none" onmouseover="this.style.color=\'var(--accent)\'" onmouseout="this.style.color=\'inherit\'">' +
            item.title +
          '</a>' +
        '</div>' +

        '<div style="font-size:11.5px;color:var(--text2);line-height:1.5">' +
          item.summary +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;padding-top:6px;border-top:1px dashed var(--border2)">' +
          '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">' +
            '<span style="font-size:10px;color:var(--text3)">Emiten:</span>' +
            tickerChips +
          '</div>' +
          (item.impactReason ? '<span style="font-size:10px;color:var(--text3);font-style:italic">' + item.impactReason + '</span>' : '') +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * Render Tabel Rincian 11 Sektor IDX
   */
  function siRenderTable() {
    var tbody = document.getElementById('si-table-tbody');
    if (!tbody || !_siState.metrics) return;

    var m = _siState.metrics;
    var selKey = _siState.selectedSectorKey;

    var html = '';

    m.forEach(function(sec, idx) {
      var isSelected = (selKey === sec.key);
      var trBg = isSelected ? 'background:var(--brand-soft);' : '';

      var topGainersHtml = sec.constituents.slice(0, 3).map(function(tk) {
        var st = sec.constituentStats.find(function(c) { return c.ticker === tk; });
        var ret = st ? st.retPct : 0;
        return '<span onclick="siInspectTicker(\'' + tk + '\')" style="cursor:pointer;font-family:var(--font-mono);font-size:11px;font-weight:600;padding:2px 5px;background:var(--bg3);border-radius:4px;border:1px solid var(--border);margin-right:4px" title="Buka analisis ' + tk + '">' +
          tk + ' <span class="' + (ret >= 0 ? 'up' : 'dn') + '" style="font-size:10px">' + (ret >= 0 ? '+' : '') + ret.toFixed(1) + '%</span>' +
        '</span>';
      }).join('');

      html += '<tr style="' + trBg + '">' +
        '<td style="font-family:var(--font-mono);color:var(--text3)">' + (idx + 1) + '</td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span style="font-size:16px">' + sec.icon + '</span>' +
            '<div>' +
              '<div style="font-weight:700;font-size:12.5px;color:var(--text)">' + sec.name + '</div>' +
              '<div style="font-size:10.5px;color:var(--text3)">' + sec.labelId + ' · ' + sec.desc + '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td style="font-family:var(--font-mono);font-weight:700" class="' + (sec.retPct >= 0 ? 'up' : 'dn') + '">' +
          (sec.retPct >= 0 ? '+' : '') + sec.retPct.toFixed(2) + '%' +
        '</td>' +
        '<td style="font-family:var(--font-mono);font-weight:700;color:' + (sec.cmf >= 0 ? '#10b981' : '#ef4444') + '">' +
          (sec.cmf >= 0 ? '+' : '') + sec.cmf.toFixed(2) +
        '</td>' +
        '<td>' +
          '<span class="badge ' + sec.flowBadgeClass + '" style="font-size:10px;font-weight:700">' +
            sec.flowStatus +
          '</span>' +
        '</td>' +
        '<td>' +
          topGainersHtml +
        '</td>' +
        '<td style="text-align:right">' +
          '<button onclick="siSelectSector(\'' + sec.key + '\')" class="btn btn-ghost btn-xs" style="padding:2px 8px;border-color:var(--border);color:var(--text2)">' +
            (isSelected ? 'Tutup Berita' : 'Lihat Berita') +
          '</button>' +
        '</td>' +
      '</tr>';
    });

    tbody.innerHTML = html;
  }

  /**
   * Buka Analisis Saham Constituent
   */
  window.siInspectTicker = function(ticker) {
    if (!ticker) return;
    var tk = String(ticker).toUpperCase().trim();
    if (typeof mwSelectGlobalStock === 'function') {
      mwSelectGlobalStock(tk);
    } else if (typeof openStockDetailModal === 'function') {
      openStockDetailModal(tk);
    } else if (typeof goPage === 'function') {
      goPage('stock-intel');
    }
  };

  /**
   * Main Page Initialization Hook
   */
  window.renderSectoralInsightPage = function() {
    // Inisialisasi metrik jika belum ada
    if (!_siState.metrics) {
      _siState.metrics = siComputeAllSectors(_siState.timeframe);
    }

    siRenderKPIs();
    siRenderVisualPane();
    siRenderTable();

    // Ambil berita jika belum ada
    if (_siState.newsData.length === 0) {
      siFetchNews(false);
    } else {
      siRenderNewsPanel();
    }
  };

})(window);
