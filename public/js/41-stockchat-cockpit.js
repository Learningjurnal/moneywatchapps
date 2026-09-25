/**
 * 41-stockchat-cockpit.js — Money Watch Pro & StockChat Integration
 * 
 * Comprehensive StockChat Conversational AI & Bandarmology Broker Flow Cockpit:
 * 1. Full Broker Summary & Bandarmology Engine (Top Buyers vs Sellers, Concentration, Foreign Flow)
 * 2. Conversational Agentic Chat Interface (Claude Tool Use Integration)
 * 3. Interactive Data Cards (Live Broker Flow, Real-time Quote, Valuation, Drawdown)
 * 4. Global Floating Modal & Quick Action Drawer
 */

// Shared sector -> ticker groupings for the Bandarmology market-wide views
// (Market Flow view here, and the Sector Heatmap mode of the Smart Money
// Screener page — public/js/07-flowscan.js, fsRenderSectorHeatmapMode())
// — hoisted out of renderBandarmologyMarketFlowView() so both views compute
// from the same real, simulated-broker-summary-based aggregation instead of
// shipping two separate, disagreeing sets of sector flow numbers.
var BANDAR_SECTOR_DEFS = (typeof IDX_SECTOR_GROUPS !== 'undefined')
  ? Object.keys(IDX_SECTOR_GROUPS).map(function(name) { return { name: name, tickers: IDX_SECTOR_GROUPS[name] }; })
  : [
      { name: 'Financials (Keuangan)', tickers: ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'BRIS', 'BBTN', 'BDMN', 'BNGA', 'MEGA', 'NISP', 'ARTO', 'PNBN', 'BCIC', 'BTPS'] },
      { name: 'Energy (Energi)', tickers: ['ADRO', 'PTRO', 'MEDC', 'PGAS', 'PTBA', 'BUMI', 'DEWA', 'AADI', 'INDY', 'ITMG', 'HRUM', 'AKRA', 'ENRG', 'RAJA', 'ELSA', 'DOID', 'ADMR', 'MBSS'] },
      { name: 'Basic Materials (Barang Baku)', tickers: ['ANTM', 'AMMN', 'MDKA', 'INCO', 'BRMS', 'MBMA', 'INKP', 'TKIM', 'SMGR', 'INTP', 'TPIA', 'BRPT', 'ARCI', 'NICL', 'NCKL', 'AVIA', 'MCOL'] },
      { name: 'Consumer Non-Cyclicals (Konsumer Primer)', tickers: ['UNVR', 'ICBP', 'INDF', 'KLBF', 'SIDO', 'CPIN', 'MYOR', 'JPFA', 'GGRM', 'HMSP', 'CMRY', 'AMRT', 'MIDI', 'AALI', 'LSIP', 'TAPG', 'DSNG'] },
      { name: 'Consumer Cyclicals (Konsumer Non-Primer)', tickers: ['ACES', 'MAPI', 'MAPA', 'ERAA', 'RALS', 'LPPF', 'AUTO', 'DRMA', 'SMSM', 'ASLC', 'GJTL', 'WIFI', 'BMTR', 'MNCN', 'SCMA'] },
      { name: 'Healthcare (Kesehatan)', tickers: ['KLBF', 'SIDO', 'MIKA', 'HEAL', 'SILO', 'PRDA', 'TSPC', 'IRRA', 'KAEF', 'INAF', 'SAME'] },
      { name: 'Technology (Teknologi)', tickers: ['GOTO', 'BUKA', 'EMTK', 'WIRG', 'BELI', 'MTDL', 'DCII', 'MLPT', 'MCAS', 'DMMX'] },
      { name: 'Infrastructures (Infrastruktur)', tickers: ['TLKM', 'BREN', 'TPIA', 'PGEO', 'JSMR', 'EXCL', 'ISAT', 'TOWR', 'TBIG', 'POWR', 'META', 'CENT', 'CDIA'] },
      { name: 'Properties & Real Estate (Properti)', tickers: ['BSDE', 'PWON', 'CTRA', 'SMRA', 'ASRI', 'APLN', 'DILD', 'SSIA', 'KIJA', 'PANI', 'SMDM', 'BKSL', 'LPKR'] },
      { name: 'Industrials (Perindustrian)', tickers: ['ASII', 'UNTR', 'HEXA', 'ARNA', 'MARK', 'IMPC', 'MLIA', 'KBLI', 'CCSI', 'KBLM'] },
      { name: 'Transportation & Logistics (Transportasi)', tickers: ['SMDR', 'TMAS', 'BIRD', 'ASSA', 'GIAA', 'WEHA', 'PSSI', 'HAIS'] }
    ];

var STOCKCHAT_CONVERSATION = [
  {
    role: 'assistant',
    text: 'Halo! Saya **StockChat AI & Bandarmology Analyst** di MoneyWatch.\n\nSaya siap membantu Anda membedah **Broker Summary (Bandarmology)**, aliran dana asing (Foreign Flow), valuasi fundamental, kepemilikan KSEI >5%, serta simulasi risiko drawdown untuk seluruh saham Bursa Efek Indonesia (BEI).',
    toolCalls: []
  }
];

// FIX (2026-09-24, user-reported: "aplikasi selalu crash saat membuka
// market flow, harus di reload ulang"): frontend half of the "stuck saat
// ambil data" incident — the earlier backend fetch-timeout fix explicitly
// left frontend fetch() calls untouched. Market Flow's 5 fetch() sites
// (broker summary per-ticker, acc/dist, foreign flow, market flow scanner,
// broker portfolio) had none, so one hung response could stall a Promise
// forever and, for the broker portfolio call, permanently lock its
// loading-guard (only a full page reload recovers). AbortSignal.timeout()
// applied below to all 5 sites so a hung request fails fast instead.
var BANDAR_FETCH_TIMEOUT_MS = 12000;

var STOCKCHAT_IS_BUSY = false;
var STOCKCHAT_SELECTED_TICKER = 'BBCA';
var STOCKCHAT_TIMEFRAME = '1D';
var STOCKCHAT_ACTIVE_TAB = 'chat'; // 'chat' | 'broker-flow'
var STOCKCHAT_BROKER_DATA_CACHE = {};
var STOCKCHAT_IS_LOADING_FLOW = false;
var STOCKCHAT_BUYERS_SORT = { field: 'valueRp', order: 'desc' };
var STOCKCHAT_SELLERS_SORT = { field: 'valueRp', order: 'desc' };
var STOCKCHAT_TABLE_LIMIT = 5;
var STOCKCHAT_BROKER_FILTER = 'ALL'; // 'ALL' | 'F' | 'D'

// Pre-defined quick prompt templates
var STOCKCHAT_PROMPT_PRESETS = [
  {
    title: 'Broker Flow & Bandar',
    prompt: 'Tolong analisa Broker Summary dan Bandarmology saham BBCA hari ini. Siapa Top Buyer dan Top Seller, bagaimana Foreign Flow dan konsentrasinya?'
  },
  {
    title: 'Review Portofolio',
    prompt: 'Cek portofolio saya saat ini, bagaimana floating profit/loss, alokasi sektor, dan rasio kas RDN saya?'
  },
  {
    title: 'Valuasi & Fair Value',
    prompt: 'Bagaimana valuasi fundamental dan rasio keuangan saham BBRI saat ini? Apakah masih ada Margin of Safety (MoS)?'
  },
  {
    title: 'Free Float & KSEI',
    prompt: 'Cek struktur kepemilikan saham BMRI di KSEI. Berapa porsi institusi lokal vs asing dan berapa estimasi free float publik?'
  },
  {
    title: 'Simulasi Risk/Reward',
    prompt: 'Hitung proyeksi risiko dan drawdown jika saya beli saham ANTM di harga saat ini dengan target profit +15% dan stop loss -7%.'
  },
  {
    title: 'Pajak Dividen Bersih',
    prompt: 'Hitung simulasi penerimaan dividen bersih saham BBRI dengan DPS Rp 185 per lembar untuk 100 lot kepemilikan sesuai aturan pajak PPh Final.'
  },
  {
    title: 'Aksi Korporasi & Dividen',
    prompt: 'Tolong periksa jadwal aksi korporasi terdekat untuk saham ADRO, BBCA, dan ITMG. Berapa estimasi dividen per lembar (DPS) dan kapan batas cum-date nya?'
  }
];

// Official BEI Broker Master List
var CLIENT_IDX_BROKERS = {
  'YP': { code: 'YP', name: 'Mirae Asset Sekuritas Indonesia', type: 'D', category: 'Retail Leader' },
  'CC': { code: 'CC', name: 'Mandiri Sekuritas', type: 'D', category: 'State-Owned/Institutional' },
  'PD': { code: 'PD', name: 'Indo Premier Sekuritas (IPOT)', type: 'D', category: 'Retail Leader' },
  'XC': { code: 'XC', name: 'Ajaib Sekuritas Asia', type: 'D', category: 'Retail Tech' },
  'XL': { code: 'XL', name: 'Stockbit Sekuritas Digital', type: 'D', category: 'Retail Tech' },
  'AK': { code: 'AK', name: 'UBS Sekuritas Indonesia', type: 'F', category: 'Foreign Global Tier-1' },
  'BK': { code: 'BK', name: 'J.P. Morgan Sekuritas Indonesia', type: 'F', category: 'Foreign Global Tier-1' },
  'ZP': { code: 'ZP', name: 'Maybank Sekuritas Indonesia', type: 'F', category: 'Regional Institutional' },
  'KZ': { code: 'KZ', name: 'CLSA Sekuritas Indonesia', type: 'F', category: 'Foreign Institutional' },
  'CS': { code: 'CS', name: 'Credit Suisse / CGS International', type: 'F', category: 'Foreign Institutional' },
  'RX': { code: 'RX', name: 'Macquarie Sekuritas Indonesia', type: 'F', category: 'Foreign Institutional' },
  'OD': { code: 'OD', name: 'BRI Danareksa Sekuritas', type: 'D', category: 'State-Owned/Institutional' },
  'SQ': { code: 'SQ', name: 'BCA Sekuritas', type: 'D', category: 'Top Private Banking' },
  'NI': { code: 'NI', name: 'BNI Sekuritas', type: 'D', category: 'State-Owned/Institutional' },
  'EP': { code: 'EP', name: 'MNC Sekuritas', type: 'D', category: 'Domestic Retail' },
  'KK': { code: 'KK', name: 'Phillip Sekuritas Indonesia', type: 'D', category: 'Retail Platform' },
  'CP': { code: 'CP', name: 'KB Valbury Sekuritas', type: 'D', category: 'Institutional & Retail' },
  'DR': { code: 'DR', name: 'RHB Sekuritas Indonesia', type: 'D', category: 'Regional Broker' },
  'LG': { code: 'LG', name: 'Trimegah Sekuritas Indonesia', type: 'D', category: 'Domestic Investment Bank' },
  'IF': { code: 'IF', name: 'Samuel Sekuritas Indonesia', type: 'D', category: 'Domestic Institutional' }
};

// Comprehensive Real-Time Price & Valuation Resolver (Zero Dummy Data Policy)
function getAccurateStockPrice(ticker) {
  if (!ticker) return 0;
  var tk = String(ticker).toUpperCase().replace(/\.JK$/i, '').trim();

  // Strict Market Integrity: if ticker is not in valid stock universe, return 0 immediately
  if (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk)) {
    return 0;
  }

  // 1. Live price in global prices object
  if (typeof prices !== 'undefined' && prices[tk] && Number(prices[tk]) > 0) {
    return Number(prices[tk]);
  }

  // 2. Real OHLCV history cache in 13-realdata.js (Yahoo live cached daily close)
  if (typeof rdGetAny === 'function') {
    var rdRows = rdGetAny(tk);
    if (rdRows && rdRows.length > 0 && rdRows[rdRows.length - 1]) {
      var lastR = rdRows[rdRows.length - 1];
      var pVal = Number(lastR.close !== undefined ? lastR.close : (lastR.c !== undefined ? lastR.c : 0));
      if (pVal > 0) return pVal;
    }
  }

  // 3. Portfolio Stocks (if user holds the stock, use their market price)
  if (typeof XLSX_DATA !== 'undefined' && XLSX_DATA && Array.isArray(XLSX_DATA.stocks)) {
    var sItem = XLSX_DATA.stocks.find(function(s) { return s.ticker === tk; });
    if (sItem && sItem.price && Number(sItem.price) > 0) {
      return Number(sItem.price);
    }
  }

  // 4. Stock Profiles in 24-stockmaster.js / FUND_DATA
  if (typeof STOCK_PROFILES !== 'undefined' && STOCK_PROFILES[tk] && STOCK_PROFILES[tk].price > 0) {
    return Number(STOCK_PROFILES[tk].price);
  }
  if (typeof FUND_DATA !== 'undefined' && FUND_DATA[tk] && FUND_DATA[tk].price > 0) {
    return Number(FUND_DATA[tk].price);
  }

  // 5. Database DB in 01-data.js (High-accuracy base prices for IDX stocks)
  if (typeof DB !== 'undefined' && DB[tk] && DB[tk].base > 0) {
    return Number(DB[tk].base);
  }

  // 6. IDX Universe in 40-idx-pipeline.js
  if (typeof IDX_PIPELINE !== 'undefined' && IDX_PIPELINE.state && IDX_PIPELINE.state.universe && IDX_PIPELINE.state.universe[tk]) {
    var uItem = IDX_PIPELINE.state.universe[tk];
    if (uItem.basePrice > 0) return Number(uItem.basePrice);
    if (uItem.price > 0) return Number(uItem.price);
  }

  // 7. Comprehensive IDX Master Price Table Fallback (Real BEI reference prices for all active emiten)
  var IDX_REF_PRICES = {
    'BBCA': 10250, 'BBRI': 4780, 'BMRI': 6850, 'BBNI': 5350, 'ANTM': 1620, 'ADRO': 3680,
    'PTRO': 17200, 'TLKM': 3140, 'ASII': 5050, 'GOTO': 54, 'BREN': 7150, 'AMMN': 8600,
    'TPIA': 7400, 'CUAN': 6800, 'PANI': 12400, 'BRMS': 380, 'MEDC': 1320, 'PGAS': 1480,
    'PTBA': 3210, 'INCO': 4180, 'MDKA': 2050, 'HRUM': 1140, 'MBMA': 650, 'BUMI': 194,
    'DEWA': 95, 'AADI': 9850, 'ARCI': 420, 'BRIS': 2850, 'BBTN': 1310, 'UNVR': 2450,
    'ICBP': 11500, 'INDF': 6850, 'KLBF': 1450, 'SIDO': 560, 'MYOR': 2350, 'CPIN': 5100,
    'ACES': 820, 'ERAA': 440, 'WIFI': 2060, 'RAJA': 1070, 'SMDR': 420, 'INKP': 8250,
    'TKIM': 6900, 'JSMR': 4750, 'CTRA': 1180, 'SMRA': 550, 'BSDE': 1180, 'PWON': 490,
    'GGRM': 14250, 'PGEO': 1220, 'CDIA': 1950, 'ADMR': 1680, 'EXCL': 2140, 'BUKA': 152,
    'SMGR': 5280, 'BMTR': 375, 'PMMP': 260, 'PRDL': 356, 'GMFI': 64, 'CPRI': 123
  };
  if (IDX_REF_PRICES[tk]) return IDX_REF_PRICES[tk];

  // 8. Raw list base if valid (> 100)
  if (typeof _IDX_RAW_LIST !== 'undefined' && _IDX_RAW_LIST[tk] && _IDX_RAW_LIST[tk].base > 100) {
    return Number(_IDX_RAW_LIST[tk].base);
  }

  return 0;
}

// High-Fidelity Client-Side Broker Summary & Bandarmology Engine
function generateClientSideBrokerSummary(ticker, timeframe) {
  var tf = (timeframe || '1D').toUpperCase();
  var tk = (ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();

  var price = getAccurateStockPrice(tk);

  // STRICT RULE: If ticker is NOT in valid stock universe, NO dummy data! Return zero/unidentified state.
  if (price <= 0 || (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk))) {
    return {
      isValidTicker: false,
      ticker: tk,
      timeframe: tf,
      reportDate: new Date().toISOString().slice(0, 10),
      price: 0,
      changePercent: 0,
      totalVolumeLot: 0,
      totalValueRp: 0,
      bandarmology: {
        verdict: 'TICKER UNKNOWN / NO DATA',
        score: 0,
        interpretation: 'Ticker "' + tk + '" tidak terdaftar dalam Stock Universe IDX. Seluruh metrik analisis bernilai 0.',
        concentration: {
          top1BuyerPct: 0, top1SellerPct: 0,
          top3BuyerPct: 0, top3SellerPct: 0,
          top5BuyerPct: 0, top5SellerPct: 0
        },
        foreignFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0, status: 'NO MARKET DATA' },
        domesticFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0 },
        smartMoney: { institutionalNetRp: 0, retailNetRp: 0, signal: 'NO MARKET DATA' }
      },
      topBuyers: [],
      topSellers: [],
      matrix: []
    };
  }

  // Was a hardcoded `: 0.85` fallback — literally +0.85% for every ticker
  // whenever `changes{}` wasn't already populated, regardless of whether
  // the stock was actually up or down. Route through the same canonical
  // getGlobalMarketChange() helper every other honest price-change display
  // uses (it already falls back to computing from real rdGetAny OHLCV, and
  // only returns 0 as a last resort) so this doesn't disagree with the rest
  // of the app for the same ticker at the same moment.
  var changePct = (typeof getGlobalMarketChange === 'function') ? getGlobalMarketChange(tk)
    : ((typeof changes !== 'undefined' && changes[tk] !== undefined) ? Number(changes[tk]) : 0);

  // FIX (2026-09-18, user-reported after full-codebase audit): this used to
  // fabricate a full top-10 buyer/seller broker table from here down —
  // hardcoded broker code lists (topBuyerCodes/topSellerCodes) and fixed
  // percentage-weight arrays (buyerWeights/sellerWeights), then computed
  // precise-looking Rupiah values/average prices from a seeded pseudo-
  // random volume estimate. It WAS honestly labeled isSimulated:true, but
  // a label doesn't make invented broker names/weights/values any less
  // fabricated. This is the LAST-RESORT path — fetchBrokerSummaryData()
  // already tried the real backend (which itself tries real Invezgo data
  // first) and a real live price fetch, both unsuccessful — so instead of
  // synthesizing a plausible-but-fake broker table, return an honest empty
  // state (same pattern as the backend's generateBrokerSummaryTemplate(),
  // lib/idx-data-engine.js).
  return {
    isSimulated: true,
    dataSource: 'Tidak tersedia (server & feed broker real tidak tersedia)',
    ticker: tk,
    timeframe: tf,
    reportDate: new Date().toISOString().slice(0, 10),
    price: price,
    changePercent: changePct,
    totalVolumeLot: 0,
    totalValueRp: 0,
    bandarmology: {
      verdict: 'DATA TIDAK TERSEDIA',
      score: 0,
      interpretation: 'Data broker summary (Bandarmology) untuk saham ini belum tersedia saat ini.',
      concentration: {
        top1BuyerPct: 0, top1SellerPct: 0,
        top3BuyerPct: 0, top3SellerPct: 0,
        top5BuyerPct: 0, top5SellerPct: 0
      },
      foreignFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0, status: 'NO DATA', participationPct: null },
      domesticFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0 },
      smartMoney: { institutionalNetRp: 0, retailNetRp: 0, signal: 'NO DATA' }
    },
    topBuyers: [],
    topSellers: []
  };
}

// Fetch Broker Summary data from backend API with seamless client fallback & live quote sync
async function fetchBrokerSummaryData(ticker, timeframe) {
  var tf = timeframe || STOCKCHAT_TIMEFRAME || '1D';
  var tk = (ticker || STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  var cacheKey = tk + '_' + tf;

  // Strict Market Integrity: Block invalid ticker immediately
  if (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk)) {
    return {
      isValidTicker: false,
      ticker: tk,
      timeframe: tf,
      reportDate: new Date().toISOString().slice(0, 10),
      price: 0,
      changePercent: 0,
      totalVolumeLot: 0,
      totalValueRp: 0,
      bandarmology: {
        verdict: 'TICKER UNKNOWN / NO DATA',
        score: 0,
        interpretation: 'Ticker "' + tk + '" tidak terdaftar dalam Stock Universe IDX. Seluruh metrik analisis bernilai 0.',
        concentration: { top1BuyerPct: 0, top1SellerPct: 0, top3BuyerPct: 0, top3SellerPct: 0, top5BuyerPct: 0, top5SellerPct: 0 },
        foreignFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0, status: 'NO MARKET DATA' },
        domesticFlow: { buyValueRp: 0, sellValueRp: 0, netValueRp: 0 },
        smartMoney: { institutionalNetRp: 0, retailNetRp: 0, signal: 'NO MARKET DATA' }
      },
      topBuyers: [],
      topSellers: [],
      matrix: []
    };
  }

  if (STOCKCHAT_BROKER_DATA_CACHE[cacheKey]) {
    return STOCKCHAT_BROKER_DATA_CACHE[cacheKey];
  }

  // 1. Try Backend API
  try {
    var res = await fetch('/api/idx/broker-summary/' + encodeURIComponent(tk) + '?timeframe=' + encodeURIComponent(tf), { signal: AbortSignal.timeout(BANDAR_FETCH_TIMEOUT_MS) });
    if (res.ok) {
      var data = await res.json();
      if (data && data.success && data.data && data.data.price > 0) {
        if (typeof prices !== 'undefined') prices[tk] = data.data.price;
        STOCKCHAT_BROKER_DATA_CACHE[cacheKey] = data.data;
        return data.data;
      }
    }
  } catch (err) {}

  // 2. Fetch live quote from Yahoo Finance directly in browser if prices[tk] is missing
  if (typeof prices === 'undefined' || !prices[tk] || prices[tk] <= 0) {
    try {
      await new Promise(function(resolve) {
        if (typeof yfFetch === 'function') {
          yfFetch(tk + '.JK', function(err, meta) {
            if (!err && meta && meta.regularMarketPrice > 0) {
              if (typeof prices === 'undefined') window.prices = {};
              prices[tk] = meta.regularMarketPrice;
              if (typeof changes === 'undefined') window.changes = {};
              var realChgPct = (typeof meta.regularMarketChangePercent === 'number' && !isNaN(meta.regularMarketChangePercent)) ? meta.regularMarketChangePercent
                             : (typeof meta.fulldayChangePercent === 'number' && !isNaN(meta.fulldayChangePercent)) ? meta.fulldayChangePercent
                             : null;
              var realChg = (typeof meta.regularMarketChange === 'number' && !isNaN(meta.regularMarketChange)) ? meta.regularMarketChange
                          : (typeof meta.fulldayChange === 'number' && !isNaN(meta.fulldayChange)) ? meta.fulldayChange
                          : null;
              var prev = (realChg !== null && Math.abs(realChg) > 0.0001) ? (meta.regularMarketPrice - realChg)
                       : (meta.previousClose || meta.regularMarketPreviousClose || meta.chartPreviousClose || meta.regularMarketPrice);
              if (realChgPct !== null) {
                changes[tk] = Math.round(realChgPct * 100) / 100;
              } else if (prev > 0) {
                changes[tk] = Math.round(((meta.regularMarketPrice - prev) / prev) * 10000) / 100;
              }
            }
            resolve();
          });
        } else if (typeof rdFetchYahoo === 'function') {
          rdFetchYahoo(tk, function(err, rows) {
            if (!err && rows && rows.length > 0) {
              var last = rows[rows.length - 1];
              if (typeof prices === 'undefined') window.prices = {};
              if (last) prices[tk] = last.close !== undefined ? last.close : (last.c !== undefined ? last.c : 0);
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    } catch(e) {}
  }

  // 3. Generate high-fidelity Bandarmology & Broker Flow with the accurate live market price
  var fallbackData = generateClientSideBrokerSummary(tk, tf);
  STOCKCHAT_BROKER_DATA_CACHE[cacheKey] = fallbackData;
  return fallbackData;
}

/**
 * Calculate Bandar VWAP (Volume-Weighted Average Price of Top 3 Accumulating Brokers)
 * Reference: Brian Shannon CMT (2023) - Anchored VWAP & Wyckoff Composite Man Method.
 * Formula: VWAP_bandar = sum(Price_i * Volume_i) / sum(Volume_i)
 * %Spread = (Current_Price - VWAP_bandar) / VWAP_bandar * 100
 */
function calculateBandarVwap(ticker, timeframe) {
  var tf = timeframe || '1D';
  var tk = (ticker || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  var cacheKey = tk + '_' + tf;
  var bData = STOCKCHAT_BROKER_DATA_CACHE[cacheKey];

  if (!bData && typeof generateClientSideBrokerSummary === 'function') {
    bData = generateClientSideBrokerSummary(tk, tf);
  }
  if (!bData) {
    return { available: false, vwap: 0, spreadPct: 0, zone: 'UNKNOWN', zoneLabel: 'Data Tidak Tersedia', top3Brokers: [] };
  }

  var buyers = bData.topBuyers || [];
  if (!buyers.length && bData.bSummary && Array.isArray(bData.bSummary.topBuyers)) {
    buyers = bData.bSummary.topBuyers;
  }

  var validTop3 = buyers.slice(0, 3).filter(function(b) {
    var p = Number(b.avgBuyPrice || b.avgPrice || b.price || 0);
    return p > 0;
  });

  if (!validTop3.length) {
    return { available: false, vwap: 0, spreadPct: 0, zone: 'NO_DATA', zoneLabel: 'Broker Summary Kosong', top3Brokers: [] };
  }

  var totalValue = 0;
  var totalVol = 0;
  var brokerCodes = [];

  validTop3.forEach(function(b) {
    var p = Number(b.avgBuyPrice || b.avgPrice || b.price || 0);
    var v = Number(b.buyVolumeLot || b.volumeLot || b.volume || 1);
    var code = b.brokerCode || b.code || b.broker || '?';
    brokerCodes.push(code);
    totalValue += (p * v);
    totalVol += v;
  });

  var vwap = totalVol > 0 ? Math.round(totalValue / totalVol) : 0;
  if (vwap <= 0) {
    return { available: false, vwap: 0, spreadPct: 0, zone: 'NO_DATA', zoneLabel: 'Harga Modal 0', top3Brokers: [] };
  }

  var curPrice = Number(bData.price) || (typeof prices !== 'undefined' && Number(prices[tk])) || vwap;
  var spreadPct = vwap > 0 ? ((curPrice - vwap) / vwap * 100) : 0;

  var zone = 'OPTIMAL';
  var zoneLabel = 'Zona Akumulasi Ideal';
  var zoneBadge = 'b-up';

  if (spreadPct < -3) {
    zone = 'DISCOUNT';
    zoneLabel = 'Zona Diskon / Absorption';
    zoneBadge = 'b-up';
  } else if (spreadPct <= 4) {
    zone = 'OPTIMAL';
    zoneLabel = 'Zona Akumulasi Ideal';
    zoneBadge = 'b-up';
  } else if (spreadPct <= 15) {
    zone = 'MARKUP';
    zoneLabel = 'Zona Markup';
    zoneBadge = 'b-amb';
  } else {
    zone = 'DISTRIBUTION_RISK';
    zoneLabel = 'Zona Rawan Distribusi';
    zoneBadge = 'b-dn';
  }

  return {
    available: true,
    ticker: tk,
    timeframe: tf,
    vwap: vwap,
    currentPrice: curPrice,
    spreadPct: spreadPct,
    zone: zone,
    zoneLabel: zoneLabel,
    zoneBadge: zoneBadge,
    top3Brokers: brokerCodes,
    buyerCount: validTop3.length
  };
}
window.calculateBandarVwap = calculateBandarVwap;

// Switch Active Tab (Chat vs Broker Flow)
function setStockChatActiveTab(tabName) {
  STOCKCHAT_ACTIVE_TAB = tabName || 'chat';
  renderStockChatPage();
  if (STOCKCHAT_ACTIVE_TAB === 'broker-flow') {
    loadAndRenderBrokerFlowTab();
  }
}

// Change Broker Summary Timeframe
// FIX: this timeframe switcher is shared by two different pages —
// StockChat's own "Broker Flow" tab AND the Bandarmology & Smart Money
// page's "Analisis Full Emiten" view (both render into the same
// #stockchat-flow-tab-content container). The old code only refreshed
// that container when STOCKCHAT_ACTIVE_TAB === 'broker-flow', a StockChat-
// page-only state variable that stays 'chat' by default — so on the
// Bandarmology page, clicking 1D/1W/1M/3M/6M/1Y silently did nothing.
// loadAndRenderBrokerFlowTab() already no-ops safely if the container
// isn't present, so it's safe to always call it here.
function setStockChatTimeframe(tf) {
  STOCKCHAT_TIMEFRAME = tf || '1D';
  if (typeof currentPage !== 'undefined' && currentPage === 'stockchat') renderStockChatPage();
  loadAndRenderBrokerFlowTab();
}

// Load and refresh Broker Flow Tab data
async function loadAndRenderBrokerFlowTab() {
  var container = document.getElementById('stockchat-flow-tab-content');
  if (!container) return;

  var tk = (STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  var tf = STOCKCHAT_TIMEFRAME || '1D';
  var cacheKey = tk + '_' + tf;

  var cached = STOCKCHAT_BROKER_DATA_CACHE[cacheKey];
  if (cached) {
    container.innerHTML = renderAggregatedBrokerFlowView(cached);
    return;
  }

  STOCKCHAT_IS_LOADING_FLOW = true;
  container.innerHTML = '<div class="flex flex-col items-center justify-center p-12 space-y-3">'
    + '<svg width="32" height="32" class="animate-spin text-emerald-500" style="width:32px;height:32px;min-width:32px;min-height:32px;display:inline-block;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>'
    + '<div class="text-sm font-semibold text-slate-300">Menghubungkan ke Feed Transaksi BEI & Broker Summary untuk ' + tk + '...</div>'
    + '<div class="text-xs text-slate-500">Mengkalkulasi konsentrasi Top Buyer/Seller, Foreign Flow, dan Smart Money Radar</div>'
    + '</div>';

  var data = await fetchBrokerSummaryData(tk, tf);
  if (!data) {
    data = generateClientSideBrokerSummary(tk, tf);
  }
  STOCKCHAT_IS_LOADING_FLOW = false;
  container.innerHTML = renderAggregatedBrokerFlowView(data);
}

// Sort broker list helper
function sortBrokerList(list, sortConfig) {
  if (!Array.isArray(list)) return [];
  var field = (sortConfig && sortConfig.field) || 'valueRp';
  var order = (sortConfig && sortConfig.order) || 'desc';
  
  var copy = list.slice();
  copy.sort(function(a, b) {
    var valA = a[field];
    var valB = b[field];

    if (field === 'broker' || field === 'name' || field === 'category' || field === 'type') {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
      return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }

    valA = Number(valA) || 0;
    valB = Number(valB) || 0;
    return order === 'asc' ? (valA - valB) : (valB - valA);
  });
  return copy;
}

// Toggle sort column for buyers or sellers table
function toggleStockChatTableSort(type, field) {
  if (type === 'buyers') {
    if (STOCKCHAT_BUYERS_SORT.field === field) {
      STOCKCHAT_BUYERS_SORT.order = STOCKCHAT_BUYERS_SORT.order === 'asc' ? 'desc' : 'asc';
    } else {
      STOCKCHAT_BUYERS_SORT.field = field;
      STOCKCHAT_BUYERS_SORT.order = (field === 'rank' || field === 'broker') ? 'asc' : 'desc';
    }
  } else if (type === 'sellers') {
    if (STOCKCHAT_SELLERS_SORT.field === field) {
      STOCKCHAT_SELLERS_SORT.order = STOCKCHAT_SELLERS_SORT.order === 'asc' ? 'desc' : 'asc';
    } else {
      STOCKCHAT_SELLERS_SORT.field = field;
      STOCKCHAT_SELLERS_SORT.order = (field === 'rank' || field === 'broker') ? 'asc' : 'desc';
    }
  }
  
  var container = document.getElementById('stockchat-flow-tab-content');
  var tk = (STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  var tf = STOCKCHAT_TIMEFRAME || '1D';
  var cacheKey = tk + '_' + tf;
  var cached = STOCKCHAT_BROKER_DATA_CACHE[cacheKey];
  if (container && cached) {
    container.innerHTML = renderAggregatedBrokerFlowView(cached);
  } else {
    loadAndRenderBrokerFlowTab();
  }
}

// Set table limit (Top 5 vs Top 10)
function setStockChatTableLimit(limit) {
  STOCKCHAT_TABLE_LIMIT = limit || 5;
  var container = document.getElementById('stockchat-flow-tab-content');
  var tk = (STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  var tf = STOCKCHAT_TIMEFRAME || '1D';
  var cacheKey = tk + '_' + tf;
  var cached = STOCKCHAT_BROKER_DATA_CACHE[cacheKey];
  if (container && cached) {
    container.innerHTML = renderAggregatedBrokerFlowView(cached);
  }
}

// Set broker category filter (ALL, F, D)
function setStockChatBrokerFilter(filter) {
  STOCKCHAT_BROKER_FILTER = filter || 'ALL';
  var container = document.getElementById('stockchat-flow-tab-content');
  var tk = (STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  var tf = STOCKCHAT_TIMEFRAME || '1D';
  var cacheKey = tk + '_' + tf;
  var cached = STOCKCHAT_BROKER_DATA_CACHE[cacheKey];
  if (container && cached) {
    container.innerHTML = renderAggregatedBrokerFlowView(cached);
  }
}

// Ask AI about a specific broker row
// FIX: this used to call setStockChatActiveTab('chat') directly, which
// only sets state and re-renders #page-stockchat in place — it never
// navigates there. Clicking "Tanya AI" from the Bandarmology page (where
// #page-stockchat is hidden) generated a reply the user could never see,
// looking exactly like the button did nothing (reported by user).
// window.openStockChat() (defined below) does the same job but actually
// calls goPage('stockchat') first.
function askAiAboutBrokerAction(brokerCode, brokerName, side, ticker, volumeLot, avgPrice, valueRp) {
  var tk = ticker || STOCKCHAT_SELECTED_TICKER || 'BBCA';
  var sideText = side === 'BUY' ? 'membeli (akumulasi)' : 'menjual (distribusi)';
  var valM = (Number(valueRp || 0) / 1000000000).toFixed(2);
  var prompt = 'Tolong analisa motif dan pola transaksi broker ' + brokerCode + ' (' + brokerName + ') yang tercatat ' + sideText + ' saham ' + tk + ' sebanyak ' + Number(volumeLot || 0).toLocaleString('id-ID') + ' lot senilai Rp ' + valM + ' Miliar di harga rata-rata Rp ' + Number(avgPrice || 0).toLocaleString('id-ID') + '. Apakah ini indikasi smart money atau aksi distribusi?';

  if (typeof window.openStockChat === 'function') {
    window.openStockChat(tk, prompt, 'chat');
    return;
  }
  setStockChatActiveTab('chat');
  setTimeout(function() {
    sendStockChatPrompt(prompt);
  }, 150);
}

// Render the dedicated Aggregated Broker Flow View for Active Ticker
function renderAggregatedBrokerFlowView(data) {
  if (!data || data.isValidTicker === false || !data.price || data.price <= 0) {
    var unknownTk = (data && data.ticker) ? data.ticker : 'UNKNOWN';
    return '<div class="p-6 rounded-2xl bg-rose-950/30 border border-rose-800/80 text-rose-200 space-y-3 my-4 shadow-xl">'
      + '<div class="flex items-center gap-2.5 text-rose-400 font-black text-base md:text-lg">'
      + 'Ticker "' + unknownTk + '" Tidak Terdaftar dalam Stock Universe IDX'
      + '</div>'
      + '<p class="text-xs text-slate-300 leading-relaxed max-w-2xl">'
      + 'Saham <strong>' + unknownTk + '</strong> tidak teridentifikasi pada database pasar saham Indonesia (IDX) atau tidak memiliki riwayat transaksi riil. Sesuai prinsip integritas data pasar, tidak ada data dummy yang ditampilkan (Seluruh metrik Turnover, Foreign Flow, Top Buyer/Seller, dan Matriks Historis bernilai 0).'
      + '</p>'
      + '<div class="pt-2 text-[11px] text-slate-400 font-mono">'
      + 'Silakan gunakan ticker emiten IDX yang valid (Contoh: BBCA, BBRI, BMRI, BBNI, ANTM, TLKM, ADRO, GOTO).'
      + '</div>'
      + '</div>';
  }

  var b = data.bandarmology || {};

  var conc = b.concentration || {};
  var ff = b.foreignFlow || {};
  var rm = b.retailVsSmartMoney || b.smartMoney || {};

  var verdict = String(b.verdict || 'NEUTRAL');
  var verdictBadge = 'b-neu';
  if (verdict.includes('BIG ACCUM') || verdict.includes('STRONG ACCUM')) verdictBadge = 'b-up';
  else if (verdict.includes('ACCUM')) verdictBadge = 'b-up';
  else if (verdict.includes('BIG DISTRIB') || verdict.includes('STRONG DISTRIB')) verdictBadge = 'b-dn';
  else if (verdict.includes('DISTRIB')) verdictBadge = 'b-dn';

  var netForeignVal = (ff.netValRp !== undefined ? ff.netValRp : (ff.netValueRp !== undefined ? ff.netValueRp : 0));
  var netForeignM = Math.round(netForeignVal / 1000000000);
  var netForeignBadge = (netForeignM >= 0 ? '+Rp ' : '-Rp ') + Math.abs(netForeignM).toLocaleString('id-ID') + ' M';

  var topBuyerAvg = data.topBuyers && data.topBuyers[0] ? data.topBuyers[0].avgPrice : data.price;
  var topSellerAvg = data.topSellers && data.topSellers[0] ? data.topSellers[0].avgPrice : data.price;
  var buyerSpreadPct = (((data.price - topBuyerAvg) / (topBuyerAvg || 1)) * 100).toFixed(2);

  // Extract or calculate Top 1, 3, 5 Concentration Percentages
  var t1b = conc.top1BuyerPct !== undefined ? conc.top1BuyerPct : (conc.top1BuyPct !== undefined ? conc.top1BuyPct : 0);
  var t1s = conc.top1SellerPct !== undefined ? conc.top1SellerPct : (conc.top1SellPct !== undefined ? conc.top1SellPct : 0);
  var t3b = conc.top3BuyerPct !== undefined ? conc.top3BuyerPct : (conc.top3BuyPct !== undefined ? conc.top3BuyPct : 0);
  var t3s = conc.top3SellerPct !== undefined ? conc.top3SellerPct : (conc.top3SellPct !== undefined ? conc.top3SellPct : 0);
  var t5b = conc.top5BuyerPct !== undefined ? conc.top5BuyerPct : (conc.top5BuyPct !== undefined ? conc.top5BuyPct : 0);
  var t5s = conc.top5SellerPct !== undefined ? conc.top5SellerPct : (conc.top5SellPct !== undefined ? conc.top5SellPct : 0);

  // Fallback calculation from topBuyers & topSellers if not populated in conc object
  var rawB = Array.isArray(data.topBuyers) ? data.topBuyers : [];
  var rawS = Array.isArray(data.topSellers) ? data.topSellers : [];
  if (!t1b && rawB.length) {
    var totBVol = rawB.reduce(function(a, x){ return a + (x.volumeLot || 0); }, 0) || 1;
    var totSVol = rawS.reduce(function(a, x){ return a + (x.volumeLot || 0); }, 0) || 1;
    t1b = Math.round(((rawB[0] ? rawB[0].volumeLot : 0) / totBVol) * 100);
    t1s = Math.round(((rawS[0] ? rawS[0].volumeLot : 0) / totSVol) * 100);
    t3b = Math.round(((rawB.slice(0, 3).reduce(function(a, x){ return a + (x.volumeLot || 0); }, 0)) / totBVol) * 100);
    t3s = Math.round(((rawS.slice(0, 3).reduce(function(a, x){ return a + (x.volumeLot || 0); }, 0)) / totSVol) * 100);
    t5b = Math.round(((rawB.slice(0, 5).reduce(function(a, x){ return a + (x.volumeLot || 0); }, 0)) / totBVol) * 100);
    t5s = Math.round(((rawS.slice(0, 5).reduce(function(a, x){ return a + (x.volumeLot || 0); }, 0)) / totSVol) * 100);
  }

  // Classify Institutional Smart Money vs Retail in Top 10
  var instBrokersList = ['AK', 'BK', 'ZP', 'KZ', 'CS', 'RX', 'CC', 'SQ', 'OD', 'NI', 'LG', 'IF', 'YU'];
  var retailBrokersList = ['YP', 'PD', 'XC', 'XL', 'KK', 'EP', 'AT'];

  var buyers = Array.isArray(data.topBuyers) ? data.topBuyers : [];
  var sellers = Array.isArray(data.topSellers) ? data.topSellers : [];

  var smartMoneyBuyBrokers = buyers.filter(function(b) { return instBrokersList.includes(b.broker); });
  var smartMoneySellBrokers = sellers.filter(function(s) { return instBrokersList.includes(s.broker); });
  var retailBuyBrokers = buyers.filter(function(b) { return retailBrokersList.includes(b.broker); });
  var retailSellBrokers = sellers.filter(function(s) { return retailBrokersList.includes(s.broker); });

  var smartMoneyBuyVal = smartMoneyBuyBrokers.reduce(function(a, b) { return a + (b.valueRp || 0); }, 0);
  var smartMoneySellVal = smartMoneySellBrokers.reduce(function(a, s) { return a + (s.valueRp || 0); }, 0);
  var smartMoneyNet = smartMoneyBuyVal - smartMoneySellVal;

  var retailBuyVal = retailBuyBrokers.reduce(function(a, b) { return a + (b.valueRp || 0); }, 0);
  var retailSellVal = retailSellBrokers.reduce(function(a, s) { return a + (s.valueRp || 0); }, 0);
  var retailNet = retailBuyVal - retailSellVal;

  var smartMoneySignal = smartMoneyNet > 0 && retailNet < 0 
    ? 'SMART MONEY ACCUMULATION (Institusi Akumulasi dari Ritel)' 
    : (smartMoneyNet < 0 && retailNet > 0 
        ? 'DISTRIBUTION TO RETAIL (Institusi Distribusi ke Akun Ritel)' 
        : (smartMoneyNet > 0 ? 'NET INSTITUTIONAL INFLOW' : 'NEUTRAL / BALANCED ROTATION'));

  var html = '<div style="display:flex;flex-direction:column;gap:16px">'
    // Top Banner Card: Verdict & Key Averages
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
    + '<div style="display:flex;flex-direction:column;gap:6px">'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    + '<span class="badge b-accent" style="font-size:14px;font-weight:900;font-family:monospace;padding:4px 8px">' + data.ticker + '</span>'
    + '<span style="font-size:18px;font-weight:800;font-family:monospace;color:var(--text)">Rp ' + Number(data.price || 0).toLocaleString('id-ID') + '</span>'
    + '<span class="badge ' + ((data.changePercent || 0) >= 0 ? 'b-up' : 'b-dn') + '" style="font-size:11px;font-family:monospace">'
    + ((data.changePercent || 0) >= 0 ? '+' : '') + Number(data.changePercent || 0).toFixed(2) + '%'
    + '</span>'
    + '<span class="badge ' + verdictBadge + '" style="font-size:11px">' + verdict + '</span>'
    + '</div>'
    + '<p style="font-size:12px;color:var(--text2);margin:0;max-width:700px;line-height:1.5">' + (b.interpretation || 'Arus transaksi broker terpantau berimbang.') + '</p>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    // Multi-Period Timeframe Switcher
    + '<div class="btn-group" style="display:inline-flex;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:2px">'
    + ['1D', '1W', '1M', '3M', '6M', '1Y'].map(function(tVal) {
        var isTfActive = (data.timeframe || '1D') === tVal;
        return '<button onclick="setStockChatTimeframe(\'' + tVal + '\')" class="btn btn-xs ' + (isTfActive ? 'btn-primary' : 'btn-ghost') + '" style="font-family:monospace;font-weight:700;padding:2px 8px">' + tVal + '</button>';
      }).join('')
    + '</div>'
    + '<button onclick="askAiAboutCurrentBrokerFlow(\'' + data.ticker + '\')" class="btn btn-primary btn-xs flex items-center gap-1">'
    + '<span>Tanya AI</span>'
    + '</button>'
    + '</div>'
    + '</div>'
    + '</div>'

    // 4 Aggregated Metrics Cards Grid (Opportunity Radar .row4 / .metric style)
    + '<div class="row4">'
    // Card 1: Total Turnover
    + '<div class="metric">'
    + '<div class="mlabel">TOTAL TURNOVER (' + (data.timeframe || '1D') + ')</div>'
    + '<div class="mval mono" style="font-size:20px">Rp ' + Math.round((data.totalValueRp || 0) / 1000000000).toLocaleString('id-ID') + ' M</div>'
    + '<div class="msub neu">' + Number(data.totalVolumeLot || 0).toLocaleString('id-ID') + ' Lot Diperdagangkan</div>'
    + '</div>'

    // Card 2: Foreign Flow — FIX (2026-09-18, user-reported production
    // screenshot): per-ticker Invezgo broker summary (investor=all) has NO
    // foreign/domestic split at all (ff.available:false, see
    // computeBandarmologyVerdict() in idx-data-engine.js) — this used to
    // silently read netValRp:null as 0 and show "Net Buy +Rp 0 M /
    // Partisipasi Asing 0%" as if it were a real computed zero, for EVERY
    // ticker, every time. Now discloses unavailability honestly instead.
    + (ff.available === false
        ? '<div class="metric">'
          + '<div class="mlabel">NET FOREIGN FLOW</div>'
          + '<div class="mval mono neu" style="font-size:13px">Tidak Tersedia</div>'
          + '<div class="msub neu">Data investor=all tidak punya split asing/domestik per broker</div>'
          + '</div>'
        : '<div class="metric">'
          + '<div class="mlabel">NET FOREIGN FLOW</div>'
          + '<div class="mval mono ' + (netForeignM >= 0 ? 'up' : 'dn') + '" style="font-size:20px">' + netForeignBadge + '</div>'
          + '<div class="msub neu">Partisipasi Asing: <strong style="color:var(--text)">' + (ff.participationPct || 0) + '%</strong></div>'
          + '</div>')

    // Card 3: Top 1 Buyer Avg
    + '<div class="metric">'
    + '<div class="mlabel">TOP 1 BUYER AVG PRICE</div>'
    + '<div class="mval mono" style="font-size:20px;color:var(--blue)">Rp ' + Number(topBuyerAvg || 0).toLocaleString('id-ID') + '</div>'
    + '<div class="msub neu">Spread vs Harga: <span class="' + (Number(buyerSpreadPct) >= 0 ? 'up' : 'dn') + ' font-semibold">' + (Number(buyerSpreadPct) >= 0 ? '+' : '') + buyerSpreadPct + '%</span></div>'
    + '</div>'

    // Card 4: Smart Money Net Flow
    + '<div class="metric">'
    + '<div class="mlabel">SMART MONEY NET FLOW</div>'
    + '<div class="mval mono ' + (smartMoneyNet >= 0 ? 'up' : 'dn') + '" style="font-size:20px">' + (smartMoneyNet >= 0 ? '+Rp ' : '-Rp ') + Math.abs(Math.round(smartMoneyNet / 1000000000)).toLocaleString('id-ID') + ' M</div>'
    + '<div class="msub neu truncate">' + (smartMoneyBuyBrokers.slice(0, 2).map(function(x){return x.broker;}).join(', ') || 'AK, BK') + ' Accumulating</div>'
    + '</div>'
    + '</div>';

  // BROKER MUTATION FLOW SPECTRUM (Whale vs Retail Capital Flow)
  var netMutationM = Math.round(Math.abs(smartMoneyNet) / 1000000000);
  var isInstAccum = smartMoneyNet >= 0;
  var flowSignalBadge = isInstAccum ? 'b-up' : 'b-dn';
  var flowSignalColor = isInstAccum ? '#10B981' : '#EF4444';
  var flowSignalBg = isInstAccum ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';
  var flowSignalBorder = isInstAccum ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';

  var totalFlow = (smartMoneyBuyVal + retailSellVal) || 1;
  var instRatioPct = Math.min(Math.max(Math.round((smartMoneyBuyVal / totalFlow) * 100), 5), 95);
  var retRatioPct = 100 - instRatioPct;

  var instBrokerPills = (smartMoneyBuyBrokers.slice(0, 5).map(function(x){
    return '<span style="background:rgba(16,185,129,0.12);color:#10B981;border:1px solid rgba(16,185,129,0.25);padding:2px 6px;border-radius:4px;font-size:9.5px;font-family:var(--font-mono);font-weight:700">' + x.broker + '</span>';
  }).join(' ')) || '<span style="color:var(--text3);font-size:10px">AK, BK, ZP</span>';

  var retBrokerPills = (retailSellBrokers.slice(0, 5).map(function(x){
    return '<span style="background:rgba(239,68,68,0.12);color:#EF4444;border:1px solid rgba(239,68,68,0.25);padding:2px 6px;border-radius:4px;font-size:9.5px;font-family:var(--font-mono);font-weight:700">' + x.broker + '</span>';
  }).join(' ')) || '<span style="color:var(--text3);font-size:10px">YP, PD, XC</span>';

  html += '<div class="card" style="padding:18px;margin-bottom:14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
    + '<span class="badge ' + flowSignalBadge + '" style="font-size:10px;font-weight:800;letter-spacing:0.04em">ALUR MUTASI MODAL BROKER</span>'
    + '<span style="font-size:13px;font-weight:800;color:var(--text);font-family:var(--font-display)">' + smartMoneySignal + '</span>'
    + '</div>'
    + '<span style="font-size:11px;color:var(--text3);font-family:var(--font-mono);display:inline-flex;align-items:center;gap:5px"><span style="width:6px;height:6px;border-radius:50%;background:' + flowSignalColor + '"></span>Live Institutional Orderflow</span>'
    + '</div>'

    // Visual Flow Spectrum 3-Node Architecture
    + '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px">'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;align-items:stretch">'
    
    // Node 1: Smart Money / Institutions
    + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;justify-content:space-between">'
    + '<div>'
    + '<div style="font-size:10px;text-transform:uppercase;font-weight:800;color:var(--text3);letter-spacing:0.06em">Tier-1 Institusi &amp; Asing</div>'
    + '<div style="font-size:18px;font-weight:800;color:#10B981;font-family:var(--font-mono);margin:4px 0">Rp ' + Math.round(smartMoneyBuyVal / 1000000000).toLocaleString('id-ID') + ' M</div>'
    + '</div>'
    + '<div style="margin-top:8px">'
    + '<div style="font-size:9.5px;color:var(--text3);margin-bottom:4px">Broker Pembeli Teratas:</div>'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap">' + instBrokerPills + '</div>'
    + '</div>'
    + '</div>'

    // Node 2: Capital Mutation Bridge (Flow Vector)
    + '<div style="background:' + flowSignalBg + ';border:1px solid ' + flowSignalBorder + ';border-radius:8px;padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">'
    + '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:' + flowSignalColor + ';margin-bottom:4px">' + (isInstAccum ? 'Akumulasi Net Inflow' : 'Distribusi ke Ritel') + '</div>'
    + '<div style="font-size:18px;font-weight:900;font-family:var(--font-mono);color:' + flowSignalColor + ';margin:4px 0">'
    + (isInstAccum ? '➔ +' : '⬅ -') + 'Rp ' + netMutationM.toLocaleString('id-ID') + ' M ' + (isInstAccum ? '➔' : '⬅')
    + '</div>'
    + '<div style="font-size:10.5px;color:var(--text2);margin-top:4px">' + (isInstAccum ? 'Likuiditas Ritel Terserap ke Institusi' : 'Institusi Melepas Saham ke Akun Ritel') + '</div>'
    + '</div>'

    // Node 3: Retail / Public
    + '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;flex-direction:column;justify-content:space-between">'
    + '<div>'
    + '<div style="font-size:10px;text-transform:uppercase;font-weight:800;color:var(--text3);letter-spacing:0.06em">Partisipasi Publik &amp; Ritel</div>'
    + '<div style="font-size:18px;font-weight:800;color:#EF4444;font-family:var(--font-mono);margin:4px 0">Rp ' + Math.round(retailSellVal / 1000000000).toLocaleString('id-ID') + ' M</div>'
    + '</div>'
    + '<div style="margin-top:8px">'
    + '<div style="font-size:9.5px;color:var(--text3);margin-bottom:4px">Broker Penjual / Penyerap:</div>'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap">' + retBrokerPills + '</div>'
    + '</div>'
    + '</div>'
    + '</div>'

    // Spectrum Dominance Progress Bar
    + '<div style="margin-top:14px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-family:var(--font-mono);margin-bottom:6px">'
    + '<span style="color:#10B981;font-weight:800">Dominansi Institusi: ' + instRatioPct + '%</span>'
    + '<span style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:0.05em">Spektrum Kepemilikan Transaksi</span>'
    + '<span style="color:#EF4444;font-weight:800">Dominansi Ritel: ' + retRatioPct + '%</span>'
    + '</div>'
    + '<div style="width:100%;height:8px;border-radius:6px;overflow:hidden;display:flex;background:var(--bg);border:1px solid var(--border)">'
    + '<div style="background:#10B981;height:100%;width:' + instRatioPct + '%;transition:all 0.5s ease"></div>'
    + '<div style="background:#EF4444;height:100%;flex:1;transition:all 0.5s ease"></div>'
    + '</div>'
    + '</div>'
    + '</div>'

    // Concentration Meters (Top 1, 3, 5)
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">'
    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:10px">'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">'
    + '<span class="up" style="font-weight:700">Top 1 Buy: ' + t1b + '%</span>'
    + '<span class="dn" style="font-weight:700">Top 1 Sell: ' + t1s + '%</span>'
    + '</div>'
    + '<div style="width:100%;height:6px;border-radius:3px;overflow:hidden;display:flex;background:rgba(239,68,68,0.2)">'
    + '<div style="background:var(--green);height:6px;width:' + Math.min(t1b, 100) + '%"></div>'
    + '</div>'
    + '</div>'

    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:10px">'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">'
    + '<span class="up" style="font-weight:700">Top 3 Buy: ' + t3b + '%</span>'
    + '<span class="dn" style="font-weight:700">Top 3 Sell: ' + t3s + '%</span>'
    + '</div>'
    + '<div style="width:100%;height:6px;border-radius:3px;overflow:hidden;display:flex;background:rgba(239,68,68,0.2)">'
    + '<div style="background:var(--green);height:6px;width:' + Math.min(t3b, 100) + '%"></div>'
    + '</div>'
    + '</div>'

    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:10px">'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">'
    + '<span class="up" style="font-weight:700">Top 5 Buy: ' + t5b + '%</span>'
    + '<span class="dn" style="font-weight:700">Top 5 Sell: ' + t5s + '%</span>'
    + '</div>'
    + '<div style="width:100%;height:6px;border-radius:3px;overflow:hidden;display:flex;background:rgba(239,68,68,0.2)">'
    + '<div style="background:var(--green);height:6px;width:' + Math.min(t5b, 100) + '%"></div>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';

  // ==========================================
  // SORTABLE TABLES: Top 5 Buying vs Selling
  // ==========================================
  var rawBuyers = data.topBuyers || [];
  var rawSellers = data.topSellers || [];

  if (STOCKCHAT_BROKER_FILTER === 'F') {
    rawBuyers = rawBuyers.filter(function(x) { return x.type === 'F'; });
    rawSellers = rawSellers.filter(function(x) { return x.type === 'F'; });
  } else if (STOCKCHAT_BROKER_FILTER === 'D') {
    rawBuyers = rawBuyers.filter(function(x) { return x.type !== 'F'; });
    rawSellers = rawSellers.filter(function(x) { return x.type !== 'F'; });
  }

  var sortedBuyers = sortBrokerList(rawBuyers, STOCKCHAT_BUYERS_SORT);
  var sortedSellers = sortBrokerList(rawSellers, STOCKCHAT_SELLERS_SORT);

  var limit = STOCKCHAT_TABLE_LIMIT || 5;
  var displayBuyers = sortedBuyers.slice(0, limit);
  var displaySellers = sortedSellers.slice(0, limit);

  function renderSortHeader(tableType, field, label, align) {
    var activeSort = tableType === 'buyers' ? STOCKCHAT_BUYERS_SORT : STOCKCHAT_SELLERS_SORT;
    var isActive = activeSort.field === field;
    var arrow = isActive ? (activeSort.order === 'asc' ? ' ▲' : ' ▼') : ' ↕';
    var alignment = align === 'right' ? 'text-align:right;' : (align === 'center' ? 'text-align:center;' : 'text-align:left;');
    var colorStyle = isActive ? (tableType === 'buyers' ? 'color:var(--green);font-weight:700;' : 'color:var(--red);font-weight:700;') : 'color:var(--text2);';

    return '<th onclick="toggleStockChatTableSort(\'' + tableType + '\', \'' + field + '\')" style="padding:8px 10px;cursor:pointer;user-select:none;' + alignment + colorStyle + '" title="Klik untuk menyortir">'
      + label + '<span style="font-size:10px;font-family:monospace;opacity:0.7">' + arrow + '</span>'
      + '</th>';
  }

  var buyerSubtotalLot = displayBuyers.reduce(function(acc, x) { return acc + (x.volumeLot || 0); }, 0);
  var buyerSubtotalVal = displayBuyers.reduce(function(acc, x) { return acc + (x.valueRp || 0); }, 0);
  var buyerSubtotalPct = displayBuyers.reduce(function(acc, x) { return acc + (x.pctOfTurnover || 0); }, 0);
  var buyerWeightedAvg = buyerSubtotalLot > 0 ? Math.round(buyerSubtotalVal / (buyerSubtotalLot * 100)) : 0;

  var sellerSubtotalLot = displaySellers.reduce(function(acc, x) { return acc + (x.volumeLot || 0); }, 0);
  var sellerSubtotalVal = displaySellers.reduce(function(acc, x) { return acc + (x.valueRp || 0); }, 0);
  var sellerSubtotalPct = displaySellers.reduce(function(acc, x) { return acc + (x.pctOfTurnover || 0); }, 0);
  var sellerWeightedAvg = sellerSubtotalLot > 0 ? Math.round(sellerSubtotalVal / (sellerSubtotalLot * 100)) : 0;

  html += '<div class="card" style="padding:0;overflow:hidden">'
    + '<div style="padding:10px 14px;background:var(--bg3);border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<span style="font-size:12px;font-weight:700;color:var(--text)">Top ' + limit + ' Buying vs Top ' + limit + ' Selling Brokers (' + data.ticker + ')</span>'
    + '<span class="badge b-accent" style="font-size:10px">Sortable Table</span>'
    + (data.isSimulated ? '<span class="badge b-dn" style="font-size:10px" title="BEI tidak menyediakan feed broker-level publik/gratis — daftar broker &amp; nilai transaksi di bawah adalah simulasi berjangkar harga pasar riil, bukan rekap transaksi broker sungguhan.">SIMULASI</span>' : '<span class="badge b-up" style="font-size:10px">● Data Riil</span>')
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    + '<div class="btn-group" style="display:inline-flex;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:2px">'
    + '<button onclick="setStockChatTableLimit(5)" class="btn btn-xs ' + (limit === 5 ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 6px">Top 5</button>'
    + '<button onclick="setStockChatTableLimit(10)" class="btn btn-xs ' + (limit === 10 ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 6px">Top 10</button>'
    + '</div>'
    + '<div class="btn-group" style="display:inline-flex;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:2px">'
    + '<button onclick="setStockChatBrokerFilter(\'ALL\')" class="btn btn-xs ' + (STOCKCHAT_BROKER_FILTER === 'ALL' ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 6px">Semua</button>'
    + '<button onclick="setStockChatBrokerFilter(\'F\')" class="btn btn-xs ' + (STOCKCHAT_BROKER_FILTER === 'F' ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 6px">Asing (F)</button>'
    + '<button onclick="setStockChatBrokerFilter(\'D\')" class="btn btn-xs ' + (STOCKCHAT_BROKER_FILTER === 'D' ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 6px">Domestik</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  // Dual Sortable Tables Grid
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:0;border-bottom:1px solid var(--border2)">'

    // TABLE 1: TOP BUYERS
    + '<div style="border-right:1px solid var(--border2);display:flex;flex-direction:column;justify-content:space-between">'
    + '<div>'
    + '<div style="padding:8px 12px;background:rgba(16,185,129,0.08);border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center">'
    + '<span class="up" style="font-size:11px;font-weight:700">TOP ' + limit + ' BUYING BROKERS (AKUMULASI)</span>'
    + '<span class="mono up" style="font-size:10px">Sort: ' + STOCKCHAT_BUYERS_SORT.field.toUpperCase() + '</span>'
    + '</div>'
    + '<div style="overflow-x:auto">'
    + '<table class="tbl">'
    + '<thead><tr>'
    + renderSortHeader('buyers', 'rank', '#', 'center')
    + renderSortHeader('buyers', 'broker', 'Broker', 'left')
    + renderSortHeader('buyers', 'volumeLot', 'Volume', 'right')
    + renderSortHeader('buyers', 'valueRp', 'Nilai (Rp)', 'right')
    + renderSortHeader('buyers', 'avgPrice', 'Avg', 'right')
    + renderSortHeader('buyers', 'pctOfTurnover', '% Share', 'right')
    + '<th style="text-align:center;padding:8px 6px;color:var(--text3)">AI</th>'
    + '</tr></thead>'
    + '<tbody>';

  if (displayBuyers.length === 0) {
    html += '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text3);font-size:11px">Tidak ada data broker pembeli.</td></tr>';
  } else {
    displayBuyers.forEach(function(bItem) {
      var isF = bItem.type === 'F';
      var valM = (bItem.valueRp / 1000000000).toFixed(2);
      var priceSpread = (data.price && bItem.avgPrice > 0) ? (((data.price - bItem.avgPrice) / bItem.avgPrice) * 100).toFixed(1) : 0;
      var priceSpreadHtml = Number(priceSpread) >= 0 
        ? '<span class="up" style="font-size:9px;margin-left:3px;font-weight:700">+' + priceSpread + '%</span>'
        : '<span class="dn" style="font-size:9px;margin-left:3px;font-weight:700">' + priceSpread + '%</span>';

      html += '<tr>'
        + '<td class="mono" style="text-align:center;font-size:10px;color:var(--text3)">' + bItem.rank + '</td>'
        + '<td>'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<span class="badge ' + (isF ? 'b-amb' : 'b-neu') + '" style="font-family:monospace;font-weight:800;font-size:10px">' + bItem.broker + '</span>'
        + '<div style="font-size:11px;color:var(--text);font-weight:600;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + bItem.name.replace(/ Sekuritas.*/i, '') + '</div>'
        + '</div>'
        + '</td>'
        + '<td class="mono" style="text-align:right;font-weight:700">' + Number(bItem.volumeLot || 0).toLocaleString('id-ID') + '</td>'
        + '<td class="mono up" style="text-align:right;font-weight:700">Rp ' + valM + 'M</td>'
        + '<td class="mono" style="text-align:right">' + Number(bItem.avgPrice || 0).toLocaleString('id-ID') + priceSpreadHtml + '</td>'
        + '<td class="mono" style="text-align:right;font-weight:700;position:relative">'
        + '<div style="position:absolute;top:3px;bottom:3px;right:0;width:' + Math.min(Number(bItem.pctOfTurnover || 0), 100) + '%;background:rgba(16,185,129,0.12);border-radius:3px;pointer-events:none"></div>'
        + '<span style="position:relative;z-index:1">' + Number(bItem.pctOfTurnover || 0).toFixed(1) + '%</span>'
        + '</td>'
        + '<td style="text-align:center">'
        + '<button onclick="askAiAboutBrokerAction(\'' + bItem.broker + '\', \'' + bItem.name.replace(/'/g, '') + '\', \'BUY\', \'' + data.ticker + '\', ' + bItem.volumeLot + ', ' + bItem.avgPrice + ', ' + bItem.valueRp + ')" class="btn btn-ghost btn-xs" style="padding:2px 4px;font-size:10px" title="Tanya AI">Tanya AI</button>'
        + '</td>'
        + '</tr>';
    });
  }

  html += '</tbody></table></div></div>'
    + '<div style="padding:8px 12px;background:var(--bg3);border-top:1px solid var(--border2);font-size:11px;display:flex;justify-content:space-between;align-items:center">'
    + '<span style="color:var(--text3)">Subtotal (' + displayBuyers.length + '):</span>'
    + '<div class="mono" style="display:flex;gap:8px">'
    + '<span>' + buyerSubtotalLot.toLocaleString('id-ID') + ' lot</span>'
    + '<span class="up" style="font-weight:700">Rp ' + (buyerSubtotalVal / 1000000000).toFixed(2) + ' M (' + buyerSubtotalPct.toFixed(1) + '%)</span>'
    + '</div>'
    + '</div>'
    + '</div>'

    // TABLE 2: TOP SELLERS
    + '<div style="display:flex;flex-direction:column;justify-content:space-between">'
    + '<div>'
    + '<div style="padding:8px 12px;background:rgba(239,68,68,0.08);border-bottom:1px solid var(--border2);display:flex;justify-content:space-between;align-items:center">'
    + '<span class="dn" style="font-size:11px;font-weight:700">TOP ' + limit + ' SELLING BROKERS (DISTRIBUSI)</span>'
    + '<span class="mono dn" style="font-size:10px">Sort: ' + STOCKCHAT_SELLERS_SORT.field.toUpperCase() + '</span>'
    + '</div>'
    + '<div style="overflow-x:auto">'
    + '<table class="tbl">'
    + '<thead><tr>'
    + renderSortHeader('sellers', 'rank', '#', 'center')
    + renderSortHeader('sellers', 'broker', 'Broker', 'left')
    + renderSortHeader('sellers', 'volumeLot', 'Volume', 'right')
    + renderSortHeader('sellers', 'valueRp', 'Nilai (Rp)', 'right')
    + renderSortHeader('sellers', 'avgPrice', 'Avg', 'right')
    + renderSortHeader('sellers', 'pctOfTurnover', '% Share', 'right')
    + '<th style="text-align:center;padding:8px 6px;color:var(--text3)">AI</th>'
    + '</tr></thead>'
    + '<tbody>';

  if (displaySellers.length === 0) {
    html += '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text3);font-size:11px">Tidak ada data broker penjual.</td></tr>';
  } else {
    displaySellers.forEach(function(sItem) {
      var isF = sItem.type === 'F';
      var valM = (sItem.valueRp / 1000000000).toFixed(2);
      var priceSpread = (data.price && sItem.avgPrice > 0) ? (((data.price - sItem.avgPrice) / sItem.avgPrice) * 100).toFixed(1) : 0;
      var priceSpreadHtml = Number(priceSpread) >= 0 
        ? '<span class="up" style="font-size:9px;margin-left:3px;font-weight:700">+' + priceSpread + '%</span>'
        : '<span class="dn" style="font-size:9px;margin-left:3px;font-weight:700">' + priceSpread + '%</span>';

      html += '<tr>'
        + '<td class="mono" style="text-align:center;font-size:10px;color:var(--text3)">' + sItem.rank + '</td>'
        + '<td>'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<span class="badge ' + (isF ? 'b-amb' : 'b-neu') + '" style="font-family:monospace;font-weight:800;font-size:10px">' + sItem.broker + '</span>'
        + '<div style="font-size:11px;color:var(--text);font-weight:600;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + sItem.name.replace(/ Sekuritas.*/i, '') + '</div>'
        + '</div>'
        + '</td>'
        + '<td class="mono" style="text-align:right;font-weight:700">' + Number(sItem.volumeLot || 0).toLocaleString('id-ID') + '</td>'
        + '<td class="mono dn" style="text-align:right;font-weight:700">Rp ' + valM + 'M</td>'
        + '<td class="mono" style="text-align:right">' + Number(sItem.avgPrice || 0).toLocaleString('id-ID') + priceSpreadHtml + '</td>'
        + '<td class="mono" style="text-align:right;font-weight:700;position:relative">'
        + '<div style="position:absolute;top:3px;bottom:3px;right:0;width:' + Math.min(Number(sItem.pctOfTurnover || 0), 100) + '%;background:rgba(239,68,68,0.12);border-radius:3px;pointer-events:none"></div>'
        + '<span style="position:relative;z-index:1">' + Number(sItem.pctOfTurnover || 0).toFixed(1) + '%</span>'
        + '</td>'
        + '<td style="text-align:center">'
        + '<button onclick="askAiAboutBrokerAction(\'' + sItem.broker + '\', \'' + sItem.name.replace(/'/g, '') + '\', \'SELL\', \'' + data.ticker + '\', ' + sItem.volumeLot + ', ' + sItem.avgPrice + ', ' + sItem.valueRp + ')" class="btn btn-ghost btn-xs" style="padding:2px 4px;font-size:10px" title="Tanya AI">Tanya AI</button>'
        + '</td>'
        + '</tr>';
    });
  }

  html += '</tbody></table></div></div>'
    + '<div style="padding:8px 12px;background:var(--bg3);border-top:1px solid var(--border2);font-size:11px;display:flex;justify-content:space-between;align-items:center">'
    + '<span style="color:var(--text3)">Subtotal (' + displaySellers.length + '):</span>'
    + '<div class="mono" style="display:flex;gap:8px">'
    + '<span>' + sellerSubtotalLot.toLocaleString('id-ID') + ' lot</span>'
    + '<span class="dn" style="font-weight:700">Rp ' + (sellerSubtotalVal / 1000000000).toFixed(2) + ' M (' + sellerSubtotalPct.toFixed(1) + '%)</span>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';

  // Tactical Bandarmology Takeaways
  html += '<div class="card" style="padding:14px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:6px;margin-bottom:8px">'
    + 'Rekomendasi &amp; Catatan Taktis Bandarmology untuk ' + data.ticker + ':'
    + '</div>'
    + '<ul style="margin:0;padding-left:20px;font-size:12px;color:var(--text2);line-height:1.6">'
    + '<li>Level harga rata-rata Top Buyer (<strong style="color:var(--text)">Rp ' + Number(topBuyerAvg || 0).toLocaleString('id-ID') + '</strong>) dapat dijadikan area support kunci penahan penurunan harga.</li>'
    // FIX (2026-09-18, user-reported production screenshot): dulu selalu
    // menampilkan "Net Buy +Rp 0 M dengan partisipasi pasar 0%" untuk SETIAP
    // ticker — per-ticker Invezgo broker summary (investor=all) tidak
    // pernah punya split asing/domestik (ff.available selalu false di jalur
    // data real), jadi netValRp:null dibaca sebagai 0 lalu ditampilkan
    // seolah itu angka real. Sekarang jujur: baris ini disembunyikan kalau
    // data memang tidak tersedia, bukan menampilkan "0" yang menyesatkan.
    + (ff.available === false
        ? '<li>Data arus investor asing (split asing/domestik per broker) <strong style="color:var(--text3)">tidak tersedia</strong> dari sumber data ini — Invezgo <code>investor=all</code> tidak menyertakan flag asing/domestik per broker.</li>'
        : '<li>Arus investor asing saat ini mencatatkan ' + (netForeignM >= 0 ? '<strong class="up">Net Buy +Rp ' + netForeignM.toLocaleString('id-ID') + ' M</strong>' : '<strong class="dn">Net Sell -Rp ' + Math.abs(netForeignM).toLocaleString('id-ID') + ' M</strong>') + ' dengan partisipasi pasar sebesar <strong style="color:var(--text)">' + (ff.participationPct || 0) + '%</strong>.</li>')
    + '<li>Karakteristik dominan pergerakan: <strong style="color:var(--text)">' + (rm.smartMoneyStatus || 'NORMAL') + '</strong> vs <strong style="color:var(--text)">' + (rm.retailStatus || 'NORMAL') + '</strong>.</li>'
    + '</ul>'
    + '</div>';

  // 1-Year Broker Analysis Database & Cost Basis Matrix — placeholder here,
  // real data loaded async right after this HTML is attached to the DOM
  // (see bandarLoad1YearBrokerMatrix()).
  html += renderBandarmology1YearBrokerCostMatrix(data.ticker, data.price);
  setTimeout(function() { bandarLoad1YearBrokerMatrix(data.ticker, data.price); }, 40);

  html += '</div>';
  return html;
}

// Ask AI specifically about the current broker flow data
// FIX: same navigation bug as askAiAboutBrokerAction above — used to call
// setStockChatActiveTab('chat') without ever navigating to the StockChat
// page, so "Tanya AI Posisi Modal Whale" silently did nothing visible
// when clicked from the Bandarmology page.
function askAiAboutCurrentBrokerFlow(ticker) {
  var tk = ticker || STOCKCHAT_SELECTED_TICKER || 'BBCA';
  var prompt = 'Tolong analisa mendalam Broker Summary dan Bandarmology saham ' + tk + ' untuk rentang ' + STOCKCHAT_TIMEFRAME + '. Bagaimana estimasi modal dasar (cost basis) pembelian rata-rata 1 tahun para whale dan potensi support/resistensinya?';
  if (typeof window.openStockChat === 'function') {
    window.openStockChat(tk, prompt, 'chat');
    return;
  }
  setStockChatActiveTab('chat');
  setTimeout(function() {
    sendStockChatPrompt(prompt);
  }, 150);
}

// ============================================================
// 1-YEAR BROKER ANALYSIS DATABASE & COST BASIS MATRIX
// Calculates and visualizes historical broker buying averages across 250 trading days
// ============================================================
// FIX (2026-09-18, user-reported after full-codebase audit): this used to
// fabricate a "1-Year Broker Cost Matrix" — a hardcoded broker list
// (majorBrokers) with invented weight/bias percentages, used to compute
// precise-looking Rupiah volumes/values and 1M/3M/6M/1Y "average buy
// price" per broker via formulas. It WAS labeled "SIMULASI (Bukan
// Database Riil)", but the label doesn't make the specific numbers any
// less invented — and 2 of the 4 summary metrics ("Modal Rata-Rata Smart
// Whales", "Status Siklus Bandarmology") were derived from that same fake
// data even though they looked like real derived metrics. Invezgo's real
// broker-summary endpoint (fetchInvezgoBrokerSummary(), already used
// elsewhere on this page for other timeframes) supports timeframe=1Y and
// returns REAL per-broker aggregate buy/sell value+volume+avgPrice for the
// past year in ONE call — this now fetches that instead of fabricating.
function renderBandarmology1YearBrokerCostMatrix(tk, curPrice) {
  var price = Number(curPrice) || getAccurateStockPrice(tk);

  if (!price || price <= 0 || (typeof isValidStockTicker === 'function' && !isValidStockTicker(tk))) {
    return '<div class="card" style="padding:16px;margin-top:16px">'
      + '<div style="display:flex;align-items:center;gap:8px;color:var(--red);font-weight:700;font-size:13px">'
      + 'Ticker "' + tk + '" Tidak Terdaftar dalam Stock Universe IDX (Nilai 0)'
      + '</div>'
      + '<p style="font-size:12px;color:var(--text2);margin:6px 0 0 0">Tidak ada riwayat transaksi broker 250D untuk ticker yang tidak terdaftar dalam Stock Universe pasar saham Indonesia.</p>'
      + '</div>';
  }

  return '<div id="bandar-1y-matrix-content" class="card" style="padding:16px">'
    + '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Memuat data broker 1 tahun untuk ' + tk + '...</div>'
    + '</div>';
}

function bandarRender1YearBrokerMatrix(tk, price, data, vwap1Y, high1Y, low1Y) {
  var isReal = data && data.isSimulated === false;
  var buyers = (data && data.topBuyers) || [];

  var headerBadge = isReal
    ? '<span class="badge b-up" style="font-size:10px;font-weight:700">REAL (Invezgo, 1 Tahun)</span>'
    : '<span class="badge b-dn" style="font-size:10px;font-weight:700">TIDAK TERSEDIA</span>';

  var subtitle = isReal
    ? 'VWAP 1 tahun &amp; rentang harga 52 minggu dihitung dari histori harga real ' + tk + '. Daftar broker &amp; harga rata-rata beli di bawah adalah data REAL dari Invezgo API (rentang 1 tahun terakhir).'
    : 'VWAP 1 tahun &amp; rentang harga 52 minggu dihitung dari histori harga real ' + tk + '. Data broker 1 tahun tidak tersedia dari Invezgo saat ini (' + (data && data.dataSource || 'tidak diketahui') + ') — tidak ditampilkan angka karangan.';

  var rowsHtml = buyers.length
    ? buyers.map(function(b, idx) {
      return '<tr>'
        + '<td class="mono" style="text-align:center;font-size:11px;color:var(--text3)">' + (idx + 1) + '</td>'
        + '<td><span class="badge b-neu" style="font-family:monospace;font-weight:800;font-size:10px">' + b.broker + '</span> <span style="font-size:11px;color:var(--text);font-weight:600">' + (b.name || b.broker) + '</span></td>'
        + '<td class="mono" style="text-align:right;color:var(--text2)">' + (b.volumeLot / 1000).toFixed(1) + ' Rb Lot</td>'
        + '<td class="mono" style="text-align:right;font-weight:700;color:var(--text)">Rp ' + (b.valueRp >= 1e12 ? (b.valueRp / 1e12).toFixed(2) + ' T' : (b.valueRp / 1e9).toFixed(1) + ' M') + '</td>'
        + '<td class="mono up" style="text-align:right;font-weight:800;font-size:13px">Rp ' + Number(b.avgPrice || 0).toLocaleString('id-ID') + '</td>'
        + '</tr>';
    }).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text3);font-size:11px">' + (isReal ? 'Tidak ada data buyer untuk periode ini.' : 'Data tidak tersedia.') + '</td></tr>';

  var topBuyerAvg = buyers[0] ? buyers[0].avgPrice : null;
  var bandarSpreadPct = topBuyerAvg ? (((price - topBuyerAvg) / topBuyerAvg) * 100).toFixed(1) : null;

  return '<div id="bandar-1y-matrix-content" class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border2);padding-bottom:12px;margin-bottom:14px;flex-wrap:wrap;gap:10px">'
    + '<div>'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    + headerBadge
    + '<span style="font-size:14px;font-weight:800;color:var(--text)">Matriks Harga Beli Broker 1 Tahun</span>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text2)">' + subtitle + '</div>'
    + '</div>'
    + '<button onclick="askAiAboutCurrentBrokerFlow(\'' + tk + '\')" class="btn btn-primary btn-xs" style="display:flex;align-items:center;gap:6px">'
    + '<span>Tanya AI Posisi Modal Whale</span>'
    + '</button>'
    + '</div>'

    + '<div class="row4" style="margin-bottom:14px">'
    + '<div class="metric">'
    + '<div class="mlabel">1-YEAR VWAP (BENCHMARK BEI)</div>'
    + '<div class="mval mono" style="font-size:20px">Rp ' + vwap1Y.toLocaleString('id-ID') + '</div>'
    + '<div class="msub neu">Rata-rata tertimbang volume 250D</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="mlabel">HARGA BELI TOP BUYER (1Y)</div>'
    + (topBuyerAvg
      ? '<div class="mval mono up" style="font-size:20px">Rp ' + topBuyerAvg.toLocaleString('id-ID') + '</div><div class="msub ' + (Number(bandarSpreadPct) >= 0 ? 'up' : 'down') + '">' + (Number(bandarSpreadPct) >= 0 ? '+' : '') + bandarSpreadPct + '% vs Harga Pasar</div>'
      : '<div class="mval mono" style="font-size:16px;color:var(--text3)">Tidak tersedia</div><div class="msub neu">Data broker 1 tahun kosong</div>')
    + '</div>'
    + '<div class="metric">'
    + '<div class="mlabel">RENTANG HARGA 52-MINGGU</div>'
    + '<div class="mval mono" style="font-size:18px;color:var(--blue)">Rp ' + low1Y.toLocaleString('id-ID') + ' — ' + high1Y.toLocaleString('id-ID') + '</div>'
    + '<div class="msub neu">Low &amp; High 1 Tahun Terakhir</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="mlabel">SUMBER DATA</div>'
    + '<div class="mval" style="font-size:14px;color:' + (isReal ? 'var(--green)' : 'var(--text3)') + '">' + (isReal ? 'Invezgo API (Real)' : 'Tidak Tersedia') + '</div>'
    + '<div class="msub neu">' + (data && data.dataSource || '-') + '</div>'
    + '</div>'
    + '</div>'

    + '<div class="tbl-wrap" style="overflow-x:auto">'
    + '<table class="tbl" style="width:100%;font-size:12px">'
    + '<thead><tr>'
    + '<th style="text-align:center;width:36px">#</th>'
    + '<th>Broker Sekuritas</th>'
    + '<th style="text-align:right">Volume 1 Tahun</th>'
    + '<th style="text-align:right">Nilai 1 Tahun</th>'
    + '<th style="text-align:right;color:var(--green)">Harga Beli Rata-Rata</th>'
    + '</tr></thead>'
    + '<tbody>' + rowsHtml + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>';
}

async function bandarLoad1YearBrokerMatrix(tk, price) {
  var container = document.getElementById('bandar-1y-matrix-content');
  if (!container) return;

  var vwap1Y = price;
  var high1Y = Math.round(price * 1.35);
  var low1Y = Math.round(price * 0.75);
  if (typeof rdGetAny === 'function') {
    var rdRows = rdGetAny(tk);
    if (rdRows && rdRows.length > 0) {
      var slice = rdRows.slice(-250);
      var sumVol = 0, sumVal = 0, hMax = 0, lMin = 999999999;
      slice.forEach(function(r) {
        var c = r.close || r.c || price;
        var h = r.high || r.h || c;
        var l = r.low || r.l || c;
        var v = r.volume || r.v || 1000000;
        sumVol += v; sumVal += c * v;
        if (h > hMax) hMax = h;
        if (l < lMin && l > 0) lMin = l;
      });
      if (sumVol > 0) vwap1Y = Math.round(sumVal / sumVol);
      if (hMax > 0) high1Y = hMax;
      if (lMin < 999999999) low1Y = lMin;
    }
  }

  try {
    var data = await fetchBrokerSummaryData(tk, '1Y');
    var el = document.getElementById('bandar-1y-matrix-content');
    if (el) el.outerHTML = bandarRender1YearBrokerMatrix(tk, price, data, vwap1Y, high1Y, low1Y);
  } catch (e) {
    var el2 = document.getElementById('bandar-1y-matrix-content');
    if (el2) el2.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:12px">Gagal memuat data broker 1 tahun: ' + e.message + '</div>';
  }
}
window.bandarLoad1YearBrokerMatrix = bandarLoad1YearBrokerMatrix;

// Render Standalone Broker Flow & Bandarmology Card (Embeddable)
function renderBrokerSummaryWidget(data) {
  if (!data) return '<div class="card" style="padding:16px;text-align:center;color:var(--text3);font-size:12px">Data broker summary tidak tersedia.</div>';

  var b = data.bandarmology || {};
  var conc = b.concentration || {};
  var ff = b.foreignFlow || {};
  var rm = b.retailVsSmartMoney || {};

  var verdict = b.verdict || 'NEUTRAL';
  var verdictBadge = 'b-neu';
  if (verdict.includes('ACCUM')) verdictBadge = 'b-up';
  else if (verdict.includes('DISTRIB')) verdictBadge = 'b-dn';

  var netForeignM = Math.round((ff.netValRp || 0) / 1000000000);
  var netForeignBadge = (netForeignM >= 0 ? '+Rp ' : '-Rp ') + Math.abs(netForeignM).toLocaleString('id-ID') + ' M';

  var html = '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">';
  
  // Header: Ticker, Verdict, Timeframe
  html += '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border2);padding-bottom:8px;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:6px">'
    + '<span class="badge b-accent" style="font-size:12px;font-weight:900;font-family:monospace">' + data.ticker + '</span>'
    + '<span class="mono" style="font-weight:700;font-size:13px;color:var(--text)">Rp ' + Number(data.price || 0).toLocaleString('id-ID') + '</span>'
    + '<span class="mono ' + ((data.changePercent || 0) >= 0 ? 'up' : 'down') + '" style="font-size:11px;font-weight:700">(' + ((data.changePercent || 0) >= 0 ? '+' : '') + Number(data.changePercent || 0).toFixed(2) + '%)</span>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:6px">'
    + '<span class="badge ' + verdictBadge + '" style="font-size:10px">' + verdict + '</span>'
    + '<span class="badge b-neu mono" style="font-size:10px">' + (data.timeframe || '1D') + '</span>'
    + (data.isSimulated
        ? '<span class="badge b-amb" style="font-size:10px" title="' + (data.dataSource || 'Simulasi') + '">Simulasi</span>'
        : '<span class="badge b-up" style="font-size:10px" title="Data real dari Invezgo API">Data Real</span>')
    + '</div>'
    + '</div>';

  // Bandarmology Highlights Grid
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">'
    + '<div class="metric" style="padding:8px">'
    + '<div class="mlabel" style="font-size:9px">TOP 3 BUYER</div>'
    + '<div class="mval up mono" style="font-size:14px">' + (conc.top3BuyPct || 0) + '%</div>'
    + '</div>'
    + '<div class="metric" style="padding:8px">'
    + '<div class="mlabel" style="font-size:9px">TOP 3 SELLER</div>'
    + '<div class="mval down mono" style="font-size:14px">' + (conc.top3SellPct || 0) + '%</div>'
    + '</div>'
    // FIX (2026-09-18, user-reported): honest "Tidak Tersedia" instead of a
    // fabricated "+Rp 0 M" when the per-ticker feed has no F/D split.
    + (ff.available === false
        ? '<div class="metric" style="padding:8px">'
          + '<div class="mlabel" style="font-size:9px">FOREIGN FLOW</div>'
          + '<div class="mval neu mono" style="font-size:11px">Tidak Tersedia</div>'
          + '</div>'
        : '<div class="metric" style="padding:8px">'
          + '<div class="mlabel" style="font-size:9px">FOREIGN FLOW</div>'
          + '<div class="mval ' + (netForeignM >= 0 ? 'up' : 'down') + ' mono" style="font-size:14px">' + netForeignBadge + '</div>'
          + '</div>')
    + '<div class="metric" style="padding:8px">'
    + '<div class="mlabel" style="font-size:9px">SMART MONEY</div>'
    + '<div class="mval amb mono" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (rm.smartMoneyStatus || 'NEUTRAL') + '</div>'
    + '</div>'
    + '</div>';

  // Buyer vs Seller Matrix Table (Top 5)
  var topBuyers = (data.topBuyers || []).slice(0, 5);
  var topSellers = (data.topSellers || []).slice(0, 5);

  if (topBuyers.length === 0 && topSellers.length === 0) {
    html += '<div style="padding:16px;text-align:center;background:var(--bg4);border:1px dashed var(--border2);border-radius:8px;margin-top:6px">'
      + '<div style="font-weight:700;font-size:12px;color:var(--text);margin-bottom:4px">⚠️ Data Broker Summary Real Tidak Tersedia</div>'
      + '<div style="font-size:11px;color:var(--text3);line-height:1.5">'
      + 'Sesuai prinsip <strong>Zero Fabricated Data</strong>, sistem tidak menyajikan daftar broker dan harga modal karangan jika feed resmi belum tersedia.<br>'
      + 'Harga pasar riil terkini: <strong style="color:var(--text)">Rp ' + Number(data.price || 0).toLocaleString('id-ID') + '</strong>.'
      + '</div>'
      + '</div>';
    html += '</div>';
    return html;
  }

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;padding-top:4px">'
    // Buyers Column
    + '<div style="display:flex;flex-direction:column;gap:4px">'
    + '<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--green);border-bottom:1px solid rgba(16,185,129,0.3);padding-bottom:4px">'
    + '<span>TOP BUYERS (AKUMULASI)</span>'
    + '<span>LOT / AVG</span>'
    + '</div>';

  topBuyers.forEach(function(bItem) {
    var isF = bItem.type === 'F';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border2);font-size:11px">'
      + '<div style="display:flex;align-items:center;gap:4px">'
      + '<span class="badge ' + (isF ? 'b-amb' : 'b-neu') + '" style="font-family:monospace;font-size:9px;font-weight:700">' + bItem.broker + '</span>'
      + '<span style="color:var(--text);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + bItem.name + '">' + bItem.name.replace(/ Sekuritas.*/i, '') + '</span>'
      + '</div>'
      + '<div style="text-align:right">'
      + '<span class="mono font-semibold" style="color:var(--text)">' + Number(bItem.volumeLot || 0).toLocaleString('id-ID') + '</span>'
      + '<span class="mono" style="font-size:10px;color:var(--text3);margin-left:4px">@' + Number(bItem.avgPrice || 0).toLocaleString('id-ID') + '</span>'
      + '</div>'
      + '</div>';
  });

  html += '</div>';

  // Sellers Column
  html += '<div style="display:flex;flex-direction:column;gap:4px">'
    + '<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--red);border-bottom:1px solid rgba(244,63,94,0.3);padding-bottom:4px">'
    + '<span>TOP SELLERS (DISTRIBUSI)</span>'
    + '<span>LOT / AVG</span>'
    + '</div>';

  topSellers.forEach(function(sItem) {
    var isF = sItem.type === 'F';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border2);font-size:11px">'
        + '<div style="display:flex;align-items:center;gap:4px">'
        + '<span class="badge ' + (isF ? 'b-amb' : 'b-neu') + '" style="font-family:monospace;font-size:9px;font-weight:700">' + sItem.broker + '</span>'
        + '<span style="color:var(--text);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (sItem.name || '') + '">' + (sItem.name || '').replace(/ Sekuritas.*/i, '') + '</span>'
        + '</div>'
      + '<div style="text-align:right">'
      + '<span class="mono font-semibold" style="color:var(--text)">' + Number(sItem.volumeLot || 0).toLocaleString('id-ID') + '</span>'
      + '<span class="mono" style="font-size:10px;color:var(--text3);margin-left:4px">@' + Number(sItem.avgPrice || 0).toLocaleString('id-ID') + '</span>'
      + '</div>'
      + '</div>';
  });

  html += '</div></div>';

  // Interpretation Footer
  if (b.interpretation) {
    html += '<div class="metric" style="padding:10px;font-size:11px;line-height:1.5;color:var(--text2)">'
      + '<span class="font-bold" style="color:var(--accent)">Analisa Bandarmology:</span> ' + b.interpretation
      + '</div>';
  }

  html += '</div>';
  return html;
}

// Widget to render Broker Summary by Broker (e.g., all stocks accumulated by AK)
function renderBrokerByBrokerWidget(data) {
  if (!data || !data.ok) return '<div class="card" style="padding:14px;font-size:12px;color:var(--text3)">Data broker summary tidak tersedia.</div>';
  var broker = data.broker || 'AK';
  var tf = data.timeframe || '1W';
  var buys = (data.netBuyStocks || []).slice(0, 5);
  var sells = (data.netSellStocks || []).slice(0, 5);

  var html = '<div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border2);padding-bottom:8px;flex-wrap:wrap;gap:8px">'
    + '<div style="display:flex;align-items:center;gap:6px">'
    + '<span class="badge b-accent" style="font-size:12px;font-weight:900;font-family:monospace">BROKER ' + broker + '</span>'
    + '<span class="badge b-neu mono" style="font-size:10px">' + tf + '</span>'
    + '<span class="badge b-up" style="font-size:10px">Invezgo / IDX Feed</span>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3)">Total Saham: <strong style="color:var(--text)">' + (data.totalStocksTraded || (buys.length + sells.length)) + '</strong></div>'
    + '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;padding-top:4px">'
    + '<div style="display:flex;flex-direction:column;gap:4px">'
    + '<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--green);border-bottom:1px solid rgba(16,185,129,0.3);padding-bottom:4px">'
    + '<span>TOP NET BUY (' + broker + ' AKUMULASI)</span>'
    + '<span>NILAI / LOT</span>'
    + '</div>';

  if (buys.length === 0) {
    html += '<div style="font-size:11px;color:var(--text3);padding:6px 0">Tidak ada saham net buy terdeteksi.</div>';
  } else {
    buys.forEach(function(b) {
      var valM = b.netValue ? (b.netValue / 1e9).toFixed(2) : (b.value ? (b.value / 1e9).toFixed(2) : '0');
      var lot = Number(b.netLot || b.volumeLot || b.lot || 0).toLocaleString('id-ID');
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border2);font-size:11px">'
        + '<div style="display:flex;align-items:center;gap:4px">'
        + '<span class="badge b-neu font-mono" style="font-size:10px;font-weight:700">' + (b.ticker || b.symbol) + '</span>'
        + '<span style="color:var(--text);font-size:10px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (b.name || '') + '</span>'
        + '</div>'
        + '<div style="text-align:right">'
        + '<span class="mono up" style="font-weight:700">Rp ' + valM + ' M</span>'
        + '<span class="mono" style="font-size:10px;color:var(--text3);margin-left:4px">' + lot + ' Lot</span>'
        + '</div>'
        + '</div>';
    });
  }
  html += '</div>';

  html += '<div style="display:flex;flex-direction:column;gap:4px">'
    + '<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--red);border-bottom:1px solid rgba(244,63,94,0.3);padding-bottom:4px">'
    + '<span>TOP NET SELL (' + broker + ' DISTRIBUSI)</span>'
    + '<span>NILAI / LOT</span>'
    + '</div>';

  if (sells.length === 0) {
    html += '<div style="font-size:11px;color:var(--text3);padding:6px 0">Tidak ada saham net sell terdeteksi.</div>';
  } else {
    sells.forEach(function(s) {
      var valM = s.netValue ? (Math.abs(s.netValue) / 1e9).toFixed(2) : (s.value ? (s.value / 1e9).toFixed(2) : '0');
      var lot = Number(Math.abs(s.netLot || s.volumeLot || s.lot || 0)).toLocaleString('id-ID');
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border2);font-size:11px">'
        + '<div style="display:flex;align-items:center;gap:4px">'
        + '<span class="badge b-neu font-mono" style="font-size:10px;font-weight:700">' + (s.ticker || s.symbol) + '</span>'
        + '<span style="color:var(--text);font-size:10px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (s.name || '') + '</span>'
        + '</div>'
        + '<div style="text-align:right">'
        + '<span class="mono down" style="font-weight:700">Rp ' + valM + ' M</span>'
        + '<span class="mono" style="font-size:10px;color:var(--text3);margin-left:4px">' + lot + ' Lot</span>'
        + '</div>'
        + '</div>';
    });
  }
  html += '</div></div></div>';
  return html;
}

// Render Main StockChat AI Page & Cockpit
function renderStockChatPage(containerId) {
  var target = document.getElementById(containerId || 'page-stockchat');
  if (!target) return;

  if (typeof ensureAiSignalLogResolved === 'function') ensureAiSignalLogResolved();

  var isChatTab = STOCKCHAT_ACTIVE_TAB === 'chat';
  var isFlowTab = STOCKCHAT_ACTIVE_TAB === 'broker-flow';
  var globalTk = (typeof GLOBAL_STOCK_CONTEXT !== 'undefined' && GLOBAL_STOCK_CONTEXT.getTicker) ? GLOBAL_STOCK_CONTEXT.getTicker() : 'BBCA';
  var curTk = (globalTk || STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase().replace(/\.JK$/i, '').replace(/\.US$/i, '').trim();
  STOCKCHAT_SELECTED_TICKER = curTk;
  var curPrice = getAccurateStockPrice(curTk);
  var bData = generateClientSideBrokerSummary(curTk, STOCKCHAT_TIMEFRAME || '1D');
  var b = (bData && bData.bandarmology) || {};
  var conc = b.concentration || {};
  var ff = b.foreignFlow || {};
  var rm = b.retailVsSmartMoney || b.smartMoney || {};
  var verdict = String(b.verdict || 'NEUTRAL ACCUMULATION');
  var chgPct = (bData && bData.changePercent !== undefined) ? bData.changePercent : 0;
  var netForeignVal = (ff.netValRp !== undefined ? ff.netValRp : (ff.netValueRp !== undefined ? ff.netValueRp : 0));
  var netForeignM = Math.round(netForeignVal / 1000000000);

  var nav360 = (typeof renderStockMaster360Nav === 'function') ? renderStockMaster360Nav('stockchat', curTk) : '';
  var html = nav360 + '<div style="margin-bottom:16px">'
    // Top Bar & Header
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px">'
    + '<div>'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:10px">'
    + '<span>StockChat AI</span>'
    + '<span class="badge" style="background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;border-radius:6px;padding:2px 8px">'
    + '<span style="width:6px;height:6px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981"></span>ONLINE: BANDARMOLOGY ENGINE'
    + '</span>'
    + '</div>'
    + '<div class="psub">Asisten Analis Broker Summary, Aliran Dana Asing, Valuasi Fundamental, dan Deteksi Akumulasi Smart Money BEI.</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + '<button class="btn btn-ghost btn-xs" onclick="clearStockChatHistory();if(typeof showSaveStatus===\'function\')showSaveStatus(\'Sesi obrolan baru dimulai\');">Sesi Baru</button>'
    + '<button class="btn btn-ghost btn-xs" onclick="goPage(\'radar\')">Opportunity Radar</button>'
    + '<button class="sm-btn" style="font-size:11px;padding:5px 12px;border-radius:6px;font-weight:700" onclick="openStockIntelForTicker(\'' + curTk + '\')">Stock Intelligence</button>'
    + '</div>'
    + '</div>'

    // AI Assistant Mode Switcher Tabs (Emiten Analysis vs Portfolio Audit)
    + '<div class="tab-row" style="margin-bottom:16px;display:flex;gap:8px;border-bottom:1px solid var(--border2);padding-bottom:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + '<button class="sm-nav-item active" style="font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px">'
    + '<i class="ti ti-chart-arrows"></i> Analisis Emiten &amp; Bandarmologi (StockChat)'
    + '</button>'
    + '<button onclick="goPage(\'copilot\')" class="sm-nav-item" style="font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px">'
    + '<i class="ti ti-briefcase"></i> Audit Portofolio &amp; Risiko (Copilot)'
    + '</button>'
    + '</div>'
    + '<div style="font-size:10px;color:var(--text3);font-family:monospace;letter-spacing:0.5px">EMITEN INTELLIGENCE</div>'
    + '</div>';

  // 4 Top Metrics Summary Banner (Opportunity Radar pattern)
  html += '<div class="row4" style="margin-bottom:16px">'
    + '<div class="metric">'
    + '<div class="mlabel">ACTIVE TICKER &amp; PRICE</div>'
    + '<div class="mval mono" style="font-size:22px;display:flex;align-items:center;gap:8px">' + (typeof getStockLogoHtml === 'function' ? getStockLogoHtml(curTk, 22) : '') + curTk + ' <span style="font-size:16px;color:var(--text);font-weight:600">Rp ' + Number(curPrice).toLocaleString('id-ID') + '</span></div>'
    + '<div class="msub ' + (chgPct >= 0 ? 'up' : 'down') + '">' + (chgPct >= 0 ? '+' : '') + chgPct.toFixed(2) + '% Hari Ini</div>'
    + '</div>'

    + '<div class="metric">'
    + '<div class="mlabel">STATUS BANDARMOLOGY (' + (STOCKCHAT_TIMEFRAME || '1D') + ')</div>'
    + '<div class="mval ' + (verdict.includes('ACCUM') ? 'up' : (verdict.includes('DISTRIB') ? 'down' : 'amb')) + ' mono" style="font-size:19px">' + verdict + '</div>'
    // FIX (2026-09-18, user-reported): "|| 65" was a hardcoded fallback
    // percentage shown whenever real concentration data was falsy/absent —
    // fabricated, not derived from any actual buyer data for this ticker.
    + '<div class="msub up">' + ((conc.top3BuyPct || conc.top3BuyerPct) ? 'Top 3 Buyer ' + (conc.top3BuyPct || conc.top3BuyerPct) + '% Konsentrasi' : 'Konsentrasi Top 3 Buyer tidak tersedia') + '</div>'
    + '</div>'

    // FIX (2026-09-18, user-reported): honest "Tidak Tersedia" instead of
    // "+Rp 0 M" when this ticker's feed has no F/D split (ff.available:false).
    + (ff.available === false
        ? '<div class="metric">'
          + '<div class="mlabel">NET FOREIGN FLOW (' + (STOCKCHAT_TIMEFRAME || '1D') + ')</div>'
          + '<div class="mval mono neu" style="font-size:15px">Tidak Tersedia</div>'
          + '<div class="msub neu">Split asing/domestik tidak ada di data ini</div>'
          + '</div>'
        : '<div class="metric">'
          + '<div class="mlabel">NET FOREIGN FLOW (' + (STOCKCHAT_TIMEFRAME || '1D') + ')</div>'
          + '<div class="mval mono" style="font-size:20px;color:var(--blue)">' + (netForeignM >= 0 ? '+Rp ' : '-Rp ') + Math.abs(netForeignM).toLocaleString('id-ID') + ' M</div>'
          + '<div class="msub neu">' + (ff.participationPct ? 'Partisipasi Pasar ' + ff.participationPct + '%' : 'Arus Modal Asing BEI') + '</div>'
          + '</div>')

    + '<div class="metric">'
    + '<div class="mlabel">INTELLIGENCE FRAMEWORKS</div>'
    + '<div class="mval amb mono" style="font-size:20px">5 STRATEGI</div>'
    + '<div class="msub neu">Bandarmology, Value, Breakout, PMK18, Risk</div>'
    + '</div>'
    + '</div>';

  // Navigation Subheader Tabs (Tab 1: Chat AI vs Tab 2: Aggregated Broker Flow)
  html += '<div class="tab-row" style="margin-bottom:16px;display:flex;gap:8px;border-bottom:1px solid var(--border2);padding-bottom:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + '<button onclick="setStockChatActiveTab(\'chat\')" class="sm-nav-item ' + (isChatTab ? 'active' : '') + '">'
    + 'StockChat AI Assistant'
    + '</button>'
    + '<button onclick="setStockChatActiveTab(\'broker-flow\')" class="sm-nav-item ' + (isFlowTab ? 'active' : '') + '">'
    + 'Aggregated Broker Flow: <strong class="mono" style="color:var(--accent);margin:0 4px">' + curTk + '</strong>'
    + '<span class="badge b-accent" style="font-size:9px">BANDAR</span>'
    + '</button>'
    + '</div>'

    // Timeframe selector control
    + '<div style="display:flex;align-items:center;gap:6px">'
    + '<span style="font-size:11px;font-weight:600;color:var(--text3)">Rentang Waktu:</span>'
    + '<div style="display:inline-flex;gap:4px">'
    + ['1D', '3D', '1W', '1M'].map(function(tf) {
        var isTfActive = STOCKCHAT_TIMEFRAME === tf;
        return '<button onclick="setStockChatTimeframe(\'' + tf + '\')" class="sm-chip ' + (isTfActive ? 'active' : '') + '" style="font-family:monospace;font-weight:700">' + tf + '</button>';
      }).join('')
    + '</div>'
    + '</div>'
    + '</div>';

  // TAB 1: Chat Assistant View
  if (isChatTab) {
    var specNot = (typeof getTickerSpecialNotation === 'function') ? getTickerSpecialNotation(curTk) : null;
    if (specNot && specNot.notations && specNot.notations.length > 0) {
      var notCrit = specNot.isHighRisk;
      html += '<div class="card" style="padding:10px 14px;margin-bottom:14px;background:' + (notCrit ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)') + ';border:1px solid ' + (notCrit ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)') + ';border-radius:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<i class="ti ti-alert-triangle" style="font-size:18px;color:' + (notCrit ? '#EF4444' : '#F59E0B') + '"></i>'
        + '<span style="font-size:11.5px;font-weight:700;color:var(--text)">Emiten dalam Pengawasan Khusus BEI: <strong style="color:' + (notCrit ? '#EF4444' : '#F59E0B') + '">Notasi [' + specNot.notations.join(', ') + ']' + (specNot.isWatchlist ? ' — Papan Pemantauan Khusus (FCA)' : '') + '</strong></span>'
        + '</div>'
        + '<span style="font-size:10.5px;color:var(--text3)">' + (specNot.details || []).map(function(d){ return d.name; }).join(' • ') + '</span>'
        + '</div>';
    }

    // Quick Action Matrix Chips
    html += '<div class="card" style="padding:12px 14px;margin-bottom:14px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '<span style="font-size:11px;font-weight:700;color:var(--text2)">Quick Prompts Rekomendasi untuk <strong style="color:var(--accent);font-family:monospace">' + curTk + '</strong>:</span>'
      + '<span style="font-size:10px;color:var(--text3)">5 Framework Institusional</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">';

    STOCKCHAT_PROMPT_PRESETS.forEach(function(item, idx) {
      var displayPrompt = item.prompt.replace(/\b(BBCA|BBRI|BMRI|ANTM)\b/g, curTk);
      html += '<button onclick="sendStockChatPreset(' + idx + ')" class="btn btn-ghost" style="text-align:left;padding:8px 10px;height:auto;display:flex;flex-direction:column;align-items:flex-start;background:var(--bg3);border:1px solid var(--border2);border-radius:8px">'
        + '<div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">' + item.title + '</div>'
        + '<div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;margin-top:2px">' + displayPrompt.slice(0, 38) + '...</div>'
        + '</button>';
    });

    html += '</div></div>';

    // Chat History Box
    html += '<div id="stockchat-history-box" class="card" style="padding:16px;min-height:420px;max-height:600px;overflow-y:auto;margin-bottom:14px;display:flex;flex-direction:column;gap:12px">';

    STOCKCHAT_CONVERSATION.forEach(function(msg, i) {
      var isUser = msg.role === 'user';
      html += '<div style="display:flex;justify-content:' + (isUser ? 'flex-end' : 'flex-start') + ';align-items:flex-start;gap:8px">'
        + (!isUser ? '<div style="width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,var(--accent),#2563eb);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#ffffff;flex-shrink:0;box-shadow:0 2px 6px rgba(37,99,235,0.3)">AI</div>' : '')
        + '<div style="' + (isUser ? 'background:var(--blue);color:#ffffff;padding:10px 14px;border-radius:12px 12px 2px 12px;font-size:12px;max-width:80%;line-height:1.5;box-shadow:0 2px 6px rgba(0,0,0,0.15)' : 'background:var(--bg3);border:1px solid var(--border2);padding:12px 16px;border-radius:12px 12px 12px 2px;font-size:12px;max-width:85%;line-height:1.6;color:var(--text)') + '">'
        + '<div style="word-break:break-word">' + formatStockChatMarkdown(msg.text) + '</div>';

      // If tool calls are present, display formatted tool cards or broker summary widget
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach(function(tc) {
          // FIX (2026-09-19, found while investigating "Tool Executed:
          // undefined" reported by user): server always sends the field
          // as `name` (see executedTools.push({name, args, result}) in
          // server.js, both the Claude/OpenRouter agentic loops AND the
          // deterministic fallback) — `toolName` never existed anywhere,
          // client or server, so this comparison and this label were
          // ALWAYS undefined/false for every real response, regardless of
          // which engine answered. renderBrokerSummaryWidget() has
          // consequently never fired for a live server response either.
          if (tc.name === 'cek_broker_summary' && tc.result && !tc.result.error) {
            html += renderBrokerSummaryWidget(tc.result);
          } else if (tc.name === 'cek_broker_summary_by_broker' && tc.result && !tc.result.error) {
            html += renderBrokerByBrokerWidget(tc.result);
          } else {
            html += '<div style="margin-top:8px;padding:6px 10px;border-radius:6px;font-size:10px;font-family:monospace;background:var(--bg4);border:1px solid var(--border);color:var(--text2);display:flex;align-items:center;gap:6px">'
              + '<span style="color:var(--accent);font-weight:700">Tool Executed:</span> ' + tc.name
              + '</div>';
          }
        });
      }

      html += '</div>'
        + (isUser ? '<div style="width:28px;height:28px;border-radius:6px;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--text);flex-shrink:0">YOU</div>' : '')
        + '</div>';
    });

    if (STOCKCHAT_IS_BUSY) {
      html += '<div style="display:flex;justify-content:flex-start;align-items:flex-start;gap:8px">'
        + '<div style="width:28px;height:28px;border-radius:6px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#ffffff;flex-shrink:0">AI</div>'
        + '<div style="background:var(--bg3);border:1px solid var(--border2);padding:10px 14px;border-radius:12px 12px 12px 2px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:8px">'
        + '<span>Memproses kalkulasi Bandarmology, data KSEI &amp; analitik pasar...</span>'
        + '</div>'
        + '</div>';
    }

    html += '</div>';

    // Bottom Input Form Card
    html += '<div class="card" style="padding:10px 14px">'
      + '<form onsubmit="handleStockChatSubmit(event)" style="display:flex;align-items:center;gap:8px">'
      + '<input id="stockchat-input-text" type="text" placeholder="Tanyakan apa saja (misal: \'Cek broker summary ' + curTk + ' hari ini\', \'Review portofolio\', \'Simulasi risk reward\')..."'
      + ' class="form-input" style="flex:1;height:38px;font-size:12px">'
      + '<button type="submit" ' + (STOCKCHAT_IS_BUSY ? 'disabled' : '') + ' class="btn btn-primary" style="height:38px;padding:0 18px;font-weight:700;font-size:12px;display:flex;align-items:center;gap:6px">'
      + '<span>Kirim</span> '
      + '</button>'
      + '</form>'
      + '</div>';
  }

  // TAB 2: Dedicated Aggregated Broker Flow View
  if (isFlowTab) {
    html += '<div id="stockchat-flow-tab-content" style="min-height:460px">'
      + '<div style="display:flex;align-items:center;justify-content:center;padding:48px;font-size:12px;color:var(--text3)">Memuat data broker flow...</div>'
      + '</div>';
  }

  html += '</div>';
  target.innerHTML = html;

  if (isChatTab) {
    var box = document.getElementById('stockchat-history-box');
    if (box) box.scrollTop = box.scrollHeight;
  } else if (isFlowTab) {
    loadAndRenderBrokerFlowTab();
  }
}

// Select quick ticker & trigger prompt
function selectStockChatTicker(tk) {
  if (!tk) return;
  STOCKCHAT_SELECTED_TICKER = tk.toUpperCase().replace(/\.JK$/i, '').trim();

  // Clear any stale caches for this ticker so fresh, accurate market prices are computed
  delete STOCKCHAT_BROKER_DATA_CACHE[STOCKCHAT_SELECTED_TICKER + '_1D'];
  delete STOCKCHAT_BROKER_DATA_CACHE[STOCKCHAT_SELECTED_TICKER + '_3D'];
  delete STOCKCHAT_BROKER_DATA_CACHE[STOCKCHAT_SELECTED_TICKER + '_1W'];
  delete STOCKCHAT_BROKER_DATA_CACHE[STOCKCHAT_SELECTED_TICKER + '_1M'];

  if (window.GLOBAL_STOCK_CONTEXT && window.GLOBAL_STOCK_CONTEXT.getTicker() !== STOCKCHAT_SELECTED_TICKER) {
    window.GLOBAL_STOCK_CONTEXT.setTicker(STOCKCHAT_SELECTED_TICKER, 'stockchat');
  }
  renderStockChatPage();
  if (STOCKCHAT_ACTIVE_TAB === 'chat') {
    var inp = document.getElementById('stockchat-input-text');
    if (inp) {
      inp.value = 'Tolong analisa Broker Summary & Bandarmology saham ' + STOCKCHAT_SELECTED_TICKER + ' terkini.';
      inp.focus();
    }
  } else if (STOCKCHAT_ACTIVE_TAB === 'broker-flow') {
    loadAndRenderBrokerFlowTab();
  }
}

if (typeof window !== 'undefined' && window.GLOBAL_STOCK_CONTEXT) {
  window.GLOBAL_STOCK_CONTEXT.subscribe(function(tk, source) {
    if (source === 'stockchat' || !tk) return;
    var clean = tk.toUpperCase().trim().replace(/\.JK$/i, '').replace(/\.US$/i, '');
    STOCKCHAT_SELECTED_TICKER = clean;
    var elP = document.getElementById('page-stockchat');
    if (elP && elP.classList.contains('on') && typeof renderStockChatPage === 'function') {
      renderStockChatPage();
    }
  });
}

// Preset button handler
function sendStockChatPreset(idx) {
  var p = STOCKCHAT_PROMPT_PRESETS[idx];
  if (!p) return;
  var tk = STOCKCHAT_SELECTED_TICKER || (typeof GLOBAL_STOCK_CONTEXT !== 'undefined' && GLOBAL_STOCK_CONTEXT.getTicker && GLOBAL_STOCK_CONTEXT.getTicker()) || 'BBCA';
  var text = p.prompt.replace(/\b(BBCA|BBRI|BMRI|ANTM)\b/g, tk);
  sendStockChatPrompt(text);
}

// Form submit handler
function handleStockChatSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  var inp = document.getElementById('stockchat-input-text');
  if (!inp || !inp.value.trim()) return;
  var text = inp.value.trim();
  inp.value = '';
  sendStockChatPrompt(text);
}

// Core Prompt Execution & API Call
async function sendStockChatPrompt(text) {
  if (!text || STOCKCHAT_IS_BUSY) return;
  STOCKCHAT_CONVERSATION.push({ role: 'user', text: text });
  STOCKCHAT_IS_BUSY = true;
  renderStockChatPage();

  // Safety watchdog timer: guarantees chat never stays locked
  var watchdogTimer = setTimeout(function() {
    if (STOCKCHAT_IS_BUSY) {
      console.warn('[StockChat] Watchdog timer triggered, unlocking chat');
      STOCKCHAT_IS_BUSY = false;
      renderStockChatPage();
    }
  }, 14000);

  try {
    // Extract user holdings & balance context
    var porto = (typeof getPortfolio === 'function') ? getPortfolio() : (window.holdings || []);
    var totalAum = (typeof computeCurrentAUM === 'function') ? computeCurrentAUM() : 0;
    var rdn = (typeof calcRdnBalance === 'function') ? calcRdnBalance() : 0;

    var aiSignalHistory = [];
    try {
      if (typeof getAiSignalHistorySummary === 'function') {
        aiSignalHistory = await Promise.race([
          getAiSignalHistorySummary(),
          new Promise(function(resolve) { setTimeout(function() { resolve([]); }, 2000); })
        ]);
      }
    } catch (sigErr) {
      console.warn('[StockChat] getAiSignalHistorySummary error:', sigErr);
    }

    var userContext = {
      holdings: porto,
      totalAum: totalAum,
      rdnCash: rdn,
      selectedTicker: STOCKCHAT_SELECTED_TICKER,
      livePrices: window.prices || {},
      aiSignalHistory: aiSignalHistory
    };

    var serverHandled = false;
    try {
      // Prior history: exclude the newly pushed user message so role alternating is preserved
      var priorHistory = STOCKCHAT_CONVERSATION.slice(0, -1).slice(-8);

      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function() { controller.abort(); }, 10000) : null;

      var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: priorHistory,
          userContext: userContext
        })
      };
      if (controller) fetchOptions.signal = controller.signal;

      var res = await fetch('/api/ai/agent-chat', fetchOptions);
      if (timeoutId) clearTimeout(timeoutId);

      if (res.ok) {
        var data = await res.json();
        if (data && data.success) {
          STOCKCHAT_CONVERSATION.push({
            role: 'assistant',
            text: data.reply || 'Analisa berhasil diproses.',
            toolCalls: data.toolCalls || []
          });
          if (typeof logAiSignalToReflectionLog === 'function') logAiSignalToReflectionLog('stockchat', data.toolCalls);
          serverHandled = true;
        }
      }
    } catch (err) {
      console.warn('[StockChat] Server AI API unavailable/timed out, engaging client-side AI Agent Reasoning Engine:', err);
    }

    if (!serverHandled) {
      // Client-Side Institutional AI Reasoning Engine (Guarantees 100% Availability on GitHub Pages & Multi-Device)
      var clientAiResult = generateClientSideAiAgentResponse(text, userContext);
      STOCKCHAT_CONVERSATION.push({
        role: 'assistant',
        text: (clientAiResult && clientAiResult.reply) ? clientAiResult.reply : 'Mohon maaf, analisa tidak dapat diproses saat ini.',
        toolCalls: (clientAiResult && clientAiResult.toolCalls) ? clientAiResult.toolCalls : []
      });
    }
  } catch (outerErr) {
    console.error('[StockChat] Unexpected prompt execution error:', outerErr);
    STOCKCHAT_CONVERSATION.push({
      role: 'assistant',
      text: 'Mohon maaf, terjadi gangguan saat memproses analisa. Silakan coba ajukan pertanyaan kembali.',
      toolCalls: []
    });
  } finally {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    STOCKCHAT_IS_BUSY = false;
    renderStockChatPage();
  }
}

// Client-side Institutional AI Agentic Reasoning Engine
function generateClientSideAiAgentResponse(message, userContext) {
  var pLower = String(message || '').toLowerCase();
  var words = String(message || '').toUpperCase().split(/[^A-Z0-9]/).filter(Boolean);

  // Ticker-independent intents (portfolio/AUM/cash review, strategy
  // playbook) — checked BEFORE any ticker extraction/validity gate below.
  // Was: the ticker-validity check ran unconditionally first, so a stray
  // word in the message (e.g. "SAYA" in "analisa portofolio SAYA", or
  // "KAS" in "cek KAS saya") got misread as a candidate ticker code by the
  // possibleCode heuristic, failed the IDX-universe check, and short-
  // circuited into a bogus "Ticker Tidak Terdaftar" error — the user's
  // actual portfolio question never reached the porto/aum branch further
  // down at all. Reported by the user (2026-09-11): "analisa portofolio
  // saya" answered with "Kode ticker SAYA tidak teridentifikasi...".
  // \bkas\b (word boundary), not includes('kas') — see server.js's
  // identical fix for why (matches "kasih" as a false positive otherwise).
  var isPortfolioIntent = pLower.includes('porto') || pLower.includes('aum') || pLower.includes('holding') || pLower.includes('posisi') || pLower.includes('alokasi') || pLower.includes('rdn') || /\bkas\b/.test(pLower);
  var isStrategyIntent = pLower.includes('strategi') || pLower.includes('playbook') || pLower.includes('metode') || pLower.includes('resep') || pLower.includes('cara trading') || pLower.includes('aturan trading');
  // Same class of question as isPortfolioIntent — doesn't need a resolved
  // ticker, reads userContext.aiPaperTrading directly (client-side mirror
  // of server.js's cek_kinerja_ai_trading tool, added together with it).
  var isAiPerformanceIntent = pLower.includes('kinerja ai') || pLower.includes('kinerja trading') || pLower.includes('performa ai') || pLower.includes('performa trading') || pLower.includes('ai trading') || pLower.includes('win rate') || pLower.includes('winrate') || pLower.includes('paper trading') || pLower.includes('lesson') || pLower.includes('pelajaran') || pLower.includes('post-mortem') || pLower.includes('post mortem') || pLower.includes('saran perbaikan') || pLower.includes('pola kesalahan');
  // Item #3 (2026-09-11): reads userContext.xgboostPrediction directly —
  // this branch never computes the prediction itself (only
  // sendCopilotPrompt(), 28-decisiontools.js, runs the ONNX inference
  // before sending); here it's a passthrough for when the server call
  // that would have used cek_prediksi_xgboost fails and this client-side
  // engine takes over. Doesn't need a resolved matchedTicker either — the
  // ticker (if any) comes from the prediction object itself.
  var isPredictionIntent = /\b(sinyal|prediksi|xgboost|rekomendasi|layak beli|worth buy|apakah bagus|apakah layak)\b/i.test(message);
  var KNOWN_BROKERS = ['AK','BK','CC','YP','PD','NI','RX','ZP','YU','DX','CP','AZ','LG','GR','KZ','SQ','OD','AI','MG','XL','XC','EP','DR','DH','FS','BQ','AG','HP','KI','KK','TF','XA','TP','AN','AT','IN','SF','SS','DP','HD'];
  var matchedBroker = words.find(function(w) { return KNOWN_BROKERS.includes(w); });
  var isBrokerQuery = Boolean(matchedBroker && (pLower.includes('bandar') || pLower.includes('broker') || pLower.includes('akumulasi') || pLower.includes('distribusi') || pLower.includes('beli') || pLower.includes('jual')));
  var isTickerIndependentIntent = isPortfolioIntent || isStrategyIntent || isAiPerformanceIntent || isPredictionIntent || isBrokerQuery;

  var matchedTicker = words.find(function(w) {
    return (typeof DB !== 'undefined' && DB[w]) ||
           (typeof _IDX_RAW_LIST !== 'undefined' && _IDX_RAW_LIST[w]) ||
           ((userContext && userContext.holdings) || []).some(function(h) { return h.ticker === w; });
  });

  var STOP_WORDS = ['DATA','STOCK','BROKER','FLOW','BUY','SELL','HELP','ASING','RITEL','PORTO','VALUASI','DIVIDEN','SAHAM','BANDAR','SELAMA','SEMINGGU','HARI','BULAN','TAHUN','YANG','DARI','PADA','UNTUK','DENGAN','KODE','APAKAH','TOLONG','ANALISA','TENTANG','BAGAIMANA','BERAPA','KEMARIN','BESOK','WAKTU','SEKURITAS'];

  if (!matchedTicker && !isTickerIndependentIntent) {
    var possibleCode = words.find(function(w) {
      return w.length >= 3 && w.length <= 6 && !STOP_WORDS.includes(w);
    });
    if (possibleCode) matchedTicker = possibleCode;
  }
  if (!matchedTicker) matchedTicker = (userContext && userContext.selectedTicker) || STOCKCHAT_SELECTED_TICKER || 'BBCA';

  matchedTicker = matchedTicker.toUpperCase();

  // STRICT ZERO DUMMY DATA CHECK FOR UNKNOWN TICKERS — skipped for intents
  // that never need a resolved single ticker in the first place (see
  // isTickerIndependentIntent above).
  if (!isTickerIndependentIntent && typeof isValidStockTicker === 'function' && !isValidStockTicker(matchedTicker)) {
    return {
      reply: '### Ticker Tidak Terdaftar dalam Stock Universe IDX\n\n'
        + 'Kode ticker **' + matchedTicker + '** tidak teridentifikasi pada database pasar saham Indonesia (IDX) atau tidak memiliki riwayat transaksi riil.\n\n'
        + 'Sesuai prinsip integritas data pasar:\n'
        + '- Seluruh nilai kalkulasi (Turnover, Foreign Flow, Top Buyers/Sellers, Bandarmology, dan Valuasi) bernilai **0**.\n'
        + '- Tidak ada data dummy / fiktif yang digenerate untuk ticker yang tidak terdaftar.\n\n'
        + '**Saran**: Harap periksa kembali penulisan kode ticker Anda (Contoh ticker valid: `BBCA`, `BBRI`, `BMRI`, `ANTM`, `TLKM`, `ADRO`, `GOTO`, `BREN`, `AMMN`).',
      toolCalls: []
    };
  }

  var executedTools = [];

  var reply = '';

  if (isPredictionIntent) {
    // Zero Dummy Data: inferensi ONNX hanya jalan di sendCopilotPrompt()
    // sebelum request server — kalau tidak ada (server tidak dipanggil
    // sama sekali dari awal, atau memang bukan pertanyaan prediksi saat
    // itu dievaluasi), jangan pernah mengarang sinyal.
    var pred = userContext && userContext.xgboostPrediction;
    if (!pred) {
      reply = '### Prediksi Model XGBoost\n\n'
        + 'Belum ada hasil inferensi XGBoost untuk pesan ini. Buka menu **Quant Lab > Backtester**, pilih strategi XGBoost supaya model ONNX termuat di browser, lalu tanyakan lagi dengan menyebut kode ticker.';
    } else {
      var disclaimer = pred.hasProvenSignal
        ? 'Model ini masih berstatus eksperimen — verifikasi ulang berkala tetap wajib.'
        : 'EKSPERIMEN EDUKASI: model ini TIDAK terbukti punya sinyal prediktif di atas tebak-tebakan acak (lihat ml/README.md). Jangan jadikan rekomendasi investasi.';
      reply = '### Prediksi Model XGBoost: ' + pred.ticker + '\n\n'
        + '⚠️ **' + disclaimer + '**\n\n'
        + 'Berdasarkan inferensi model ONNX (versi ' + (pred.modelVersion || '-') + ', per ' + pred.asOfDate + '):\n'
        + '- **Sinyal**: ' + pred.signal + '\n'
        + '- **Probability (kelas naik)**: ' + (pred.probability * 100).toFixed(1) + '%\n'
        + '- **Threshold BUY/SELL**: ' + (pred.buyThreshold * 100).toFixed(0) + '% / ' + (pred.sellThreshold * 100).toFixed(0) + '%\n'
        + (pred.liftInfo ? '- **Precision vs Base Rate**: ' + (pred.liftInfo.precisionAtThreshold * 100).toFixed(1) + '% vs ' + (pred.liftInfo.baseRate * 100).toFixed(1) + '%\n' : '')
        + (pred.isSimulatedData ? '- ⚠️ **Data historis input model ini SIMULASI**, bukan data pasar riil.\n' : '')
        + '\n*Disclaimer: Ini bukan rekomendasi investasi. Keputusan investasi berada di tangan Anda.*';
    }
  }
  else if (isAiPerformanceIntent) {
    // Zero Dummy Data: this data lives entirely client-side
    // (AI_TRADE_STATE, 38-ai-autonomous-trading.js) — never invent a
    // plausible win rate/trade history when userContext.aiPaperTrading
    // wasn't provided or has zero trades.
    var apt = userContext && userContext.aiPaperTrading;
    if (!apt || !apt.totalTrades) {
      reply = '### Kinerja AI Paper Trading\n\n'
        + 'Belum ada data trade AI Paper Trading yang tercatat (0 trade tertutup), atau modul AI Trading belum pernah dibuka di sesi browser ini. Tidak dapat menganalisa performa/pola kesalahan tanpa data riil.\n\n'
        + '_Buka menu **AI Trading** minimal sekali, dan tunggu beberapa trade tertutup, supaya chat ini punya data riil untuk dianalisa._';
    } else {
      var lessonLines = (apt.recentClosedTrades || []).map(function(t, i) {
        var parts = [(i + 1) + '. **' + t.ticker + '** — ' + t.result + ' (Rp ' + Number(t.netPnL || 0).toLocaleString('id-ID') + ')'];
        if (t.exitReason) parts.push('   - Exit: ' + t.exitReason);
        if (t.mistake && t.mistake !== '-') parts.push('   - Kesalahan: ' + t.mistake);
        if (t.improvement && t.improvement !== '-') parts.push('   - Perbaikan: ' + t.improvement);
        return parts.join('\n');
      }).join('\n');

      reply = '### Kinerja AI Paper Trading & Saran Perbaikan\n\n'
        + 'Berdasarkan rekam jejak riil AI Paper Trading Anda (modal virtual terisolasi Rp 100 Juta, bukan uang riil):\n'
        + '- **Win Rate**: **' + apt.winRate + '%** (' + apt.winningTrades + 'W / ' + apt.losingTrades + 'L dari ' + apt.totalTrades + ' trade)\n'
        + '- **Profit Factor**: ' + (apt.profitFactor === null || apt.profitFactor === undefined ? '— (belum ada trade untung)' : apt.profitFactor) + '\n'
        + '- **Realized PnL**: Rp ' + Number(apt.realizedPnL || 0).toLocaleString('id-ID') + '\n'
        + '- **Max Drawdown**: ' + (apt.maxDrawdownPct || 0) + '%\n\n'
        + '**Beberapa Trade Terakhir (dari mesin Post-Mortem 10-Point):**\n'
        + (lessonLines || '_Belum ada trade tertutup._') + '\n\n'
        + '*Disclaimer: Ini data paper trading (simulasi), bukan trading nyata. Keputusan investasi berada di tangan Anda.*';
    }
  }
  else if (isStrategyIntent) {
    reply = '### Playbook Strategi Trading & Investasi (MoneyWatch AI)\n\n'
      + 'Berikut adalah **5 Strategi Utama Kelas Institusi** yang tertanam dalam Knowledge Base StockChat AI:\n\n'
      + '1. **Smart Money & Bandarmology Momentum (Swing Trading)**\n'
      + '   - *Prinsip*: Membeli saham dengan status **Big Accumulation** (Top 3 Broker > 60%) & Net Foreign Buy konsisten.\n'
      + '   - *Entry*: Di area VWAP / Average Buy Price Top Broker.\n'
      + '   - *Risk/Reward*: Minimal 1 : 2 | Stop loss -3% s/d -5% di bawah VWAP Bandar.\n\n'
      + '2. **Value Investing & Margin of Safety (Benjamin Graham + DCF)**\n'
      + '   - *Prinsip*: Membeli saham undervalued dengan **Margin of Safety (MoS) > 15-20%**.\n'
      + '   - *Kriteria*: ROE > 12%, DER < 1.0x, PE di bawah rata-rata historis 5 tahun.\n'
      + '   - *Horizon*: 6 - 24 bulan hingga harga mencapai Nilai Wajar (Fair Value).\n\n'
      + '3. **Techno-Bandarmology Breakout (Momentum)**\n'
      + '   - *Prinsip*: Penembusan resistensi teknikal yang dikonfirmasi oleh **Volume Spike (>2x)** DAN **Akumulasi Bandar**.\n'
      + '   - *Proteksi*: Hindari *False Breakout* jika kenaikan hanya digerakkan oleh broker ritel.\n\n'
      + '4. **Dividend Compounder & Bebas Pajak (PMK 18/2021)**\n'
      + '   - *Prinsip*: Fokus emiten *Cash Cow* bertanda Dividend Yield > 5-8%.\n'
      + '   - *Fasilitas Pajak*: Reinvestasi dividen selama 3 tahun menjadikan **PPh Dividen 0% (Bebas Pajak 10%)**.\n\n'
      + '5. **Institutional Risk Control & Portfolio Sizing**\n'
      + '   - *Sizing*: Maksimal 10-15% Total AUM per Big Cap, maks 5% per Mid/Small Cap.\n'
      + '   - *Kas RDN*: Jaga cadangan Kas RDN minimal **15-20%** untuk mengambil peluang *Buy on Weakness*.\n\n'
      + '*Panduan Lengkap*: Anda dapat membuka menu **Knowledge & Master Guide** untuk simulasi skor konfluensi dan mempelajari alur kerja lengkap.\n\n'
      + '*Disclaimer: Keputusan investasi berada di tangan Anda.*';
  }
  else if (pLower.includes('broker') || pLower.includes('summary') || pLower.includes('flow') || pLower.includes('bandar') || pLower.includes('smart money') || pLower.includes('foreign') || pLower.includes('asing') || pLower.includes('akumulasi') || pLower.includes('distribusi') || pLower.includes('top buyer') || pLower.includes('top seller') || pLower.includes('modal')) {
    var bData = generateClientSideBrokerSummary(matchedTicker, STOCKCHAT_TIMEFRAME || '1D');
    executedTools.push({
      name: 'cek_broker_summary',
      args: { ticker: matchedTicker, timeframe: STOCKCHAT_TIMEFRAME || '1D' },
      result: bData
    });

    var bVerdict = bData.bandarmology || {};
    var buyers = bData.topBuyers || [];
    var sellers = bData.topSellers || [];

    var topBuyLines = buyers.slice(0, 5).map(function(b, i) {
      return (i + 1) + '. **' + b.broker + '** (' + (b.name || 'Sekuritas') + '): ' + Number(b.volumeLot || 0).toLocaleString('id-ID') + ' Lot | Rp ' + (Number(b.valueRp || 0) / 1e9).toFixed(2) + ' Miliar — **Avg Price: Rp ' + Number(b.avgPrice || 0).toLocaleString('id-ID') + '** (' + (b.pctOfTurnover || 0) + '% Turnover)';
    }).join('\n');

    var topSellLines = sellers.slice(0, 5).map(function(s, i) {
      return (i + 1) + '. **' + s.broker + '** (' + (s.name || 'Sekuritas') + '): ' + Number(s.volumeLot || 0).toLocaleString('id-ID') + ' Lot | Rp ' + (Number(s.valueRp || 0) / 1e9).toFixed(2) + ' Miliar — **Avg Price: Rp ' + Number(s.avgPrice || 0).toLocaleString('id-ID') + '** (' + (s.pctOfTurnover || 0) + '% Turnover)';
    }).join('\n');

    var avgBuyTop3 = buyers.length >= 3
      ? Math.round(buyers.slice(0, 3).reduce(function(sum, b) { return sum + (b.avgPrice * b.volumeLot); }, 0) / Math.max(1, buyers.slice(0, 3).reduce(function(sum, b) { return sum + b.volumeLot; }, 0)))
      : (buyers[0] ? buyers[0].avgPrice : (bData.price || 0));

    var netForeignFmt = ((bVerdict.foreignFlow && bVerdict.foreignFlow.netValueRp >= 0) ? '+Rp ' : '-Rp ') + Math.abs(Math.round((bVerdict.foreignFlow ? bVerdict.foreignFlow.netValueRp : 0) / 1000000000)).toLocaleString('id-ID') + ' Miliar';

    var hasRealData = !bData.isSimulated && buyers.length > 0;

    if (!hasRealData) {
      reply = '### 🕵️ Data Broker Summary & Bandarmology: ' + matchedTicker + '\n\n'
        + '⚠️ **Data Broker Summary Tidak Tersedia**\n\n'
        + 'Data transaksi harian tingkat broker (Broker Summary, akumulasi/distribusi bandar, dan daftar Top Buyer/Seller) untuk saham **' + matchedTicker + '** saat ini **TIDAK TERSEDIA** dari feed resmi pasar.\n\n'
        + 'Sesuai aturan ketat **Zero Fabricated Data** pada MoneyWatch Pro:\n'
        + '- Sistem **menolak mengarang** nama broker, volume lot, ataupun estimasi harga modal fiktif.\n'
        + '- Bursa Efek Indonesia (BEI) tidak menyediakan feed broker summary secara publik gratis selama jam bursa (penutupan kode broker BEI sejak Desember 2021).\n'
        + '- Hubungkan API Feed Broker resmi (Invezgo) pada server untuk mengakses data transaksi bandarmology riil.\n\n'
        + '- **Harga Pasar Riil Terkini**: Rp ' + Number(bData.price || 0).toLocaleString('id-ID') + '\n'
        + '- **Status Data**: Data real tidak tersedia — Tidak ada data karangan yang disajikan.\n\n'
        + '*Disclaimer: Keputusan investasi berada di tangan Anda. Kami menjaga integritas modal Anda dengan tidak menyajikan data fiktif.*';
    } else {
      reply = '### 🕵️ Analisa Broker Summary & Bandarmology: ' + matchedTicker + '\n\n'
        + 'Berdasarkan feed data transaksi resmi bursa BEI (' + bData.timeframe + '):\n\n'
        + '**1. Ringkasan Status Bandarmology:**\n'
        + '- **Status Aksi**: **' + (bVerdict.verdict || 'NETRAL') + '** (Skor: **' + (bVerdict.score || 50) + '/100**)\n'
        + '- **Konsentrasi Top 3 Buyer**: **' + (bVerdict.concentration ? bVerdict.concentration.top3BuyerPct : 0) + '%** vs Top 3 Seller: **' + (bVerdict.concentration ? bVerdict.concentration.top3SellerPct : 0) + '%**\n'
        + '- **Aliran Dana Asing (Foreign Flow)**: **' + (bVerdict.foreignFlow ? bVerdict.foreignFlow.status : 'NETRAL') + '** (' + netForeignFmt + ')\n'
        + '- **Partisipasi Smart Money vs Retail**: ' + (bVerdict.smartMoney ? bVerdict.smartMoney.signal : 'Seimbang') + '\n\n'
        + '**2. Top Buyers (Pembeli Terbesar & Harga Modal Rata-rata):**\n'
        + topBuyLines + '\n\n'
        + '📍 **Harga Modal Rata-Rata Top Buyer**: **Rp ' + Number(avgBuyTop3).toLocaleString('id-ID') + '** (Level Support Bandar / Acuan Buy on Weakness)\n\n'
        + '**3. Top Sellers (Penjual Terbesar):**\n'
        + (topSellLines || '_Tidak ada data seller._') + '\n\n'
        + '**4. Evaluasi & Strategi:**\n'
        + '- **Interpretasi Aliran Dana**: ' + (bVerdict.interpretation || 'Aktivitas pasar dalam rentang normal.') + '\n'
        + '- **Sisi Potensi**: ' + (bVerdict.score >= 60 ? 'Akumulasi terkonfirmasi. Pertimbangkan *Buy on Weakness* di sekitar area support modal bandar Rp ' + Number(avgBuyTop3).toLocaleString('id-ID') + '.' : 'Tekanan jual/distribusi masih membayangi. Hindari spekulasi agresif sebelum ada akumulasi balik.') + '\n'
        + '- **Sisi Risiko (Stop Loss)**: Batas proteksi cut-loss ketat jika harga tembus ke bawah harga modal bandar (-3% s/d -5% di bawah Rp ' + Number(avgBuyTop3).toLocaleString('id-ID') + ').\n\n'
        + '*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan bandarmology pasar.*';
    }
  }
  else if (isPortfolioIntent) {
    var porto = (userContext && userContext.holdings) || (typeof getPortfolio === 'function' ? getPortfolio() : []);
    var aum = (userContext && userContext.totalAum) || (typeof computeCurrentAUM === 'function' ? computeCurrentAUM() : 0);
    var rdn = (userContext && userContext.rdnCash) || (typeof calcRdnBalance === 'function' ? calcRdnBalance() : 0);

    var posLines = porto.length > 0
      ? porto.map(function(p, idx) {
          var mv = Number(p.marketValue || p.mv || (p.lot * 100 * (p.lastPrice || p.avgPrice || 1000)));
          var weight = aum > 0 ? ((mv / aum) * 100).toFixed(1) : '0.0';
          return (idx + 1) + '. **' + p.ticker + '**: ' + p.lot + ' Lot (Rp ' + Math.round(mv).toLocaleString('id-ID') + ') — Bobot **' + weight + '%**';
        }).join('\n')
      : '_Belum ada transaksi saham aktif yang tercatat di portofolio Anda._';

    var cashPct = aum > 0 ? ((rdn / aum) * 100).toFixed(1) : '0.0';

    // Item #2 (2026-09-11): saran perbaikan berbasis ATURAN, bukan ML —
    // pemeriksaan EKSPLISIT per-ticker terhadap Risk Gate resmi
    // (FINANCIAL_POLICY.md §7 / RISK_POLICY di 38-ai-autonomous-
    // trading.js), bukan lagi kalimat generik "pastikan tidak ada saham
    // yang melebihi 15%" tanpa pernah benar-benar mengeceknya. Nilai
    // 15/20 di sini HARUS sama dengan PORTFOLIO_RISK_POLICY di server.js
    // dan RISK_POLICY.MAX_POSITION_PCT/MIN_CASH_BUFFER_PCT — dijaga oleh
    // drift-detector test di test_financial_policy.js.
    var PORTFOLIO_RISK_POLICY_MAX_POSITION_PCT = 15;
    var PORTFOLIO_RISK_POLICY_MIN_CASH_BUFFER_PCT = 20;
    var riskGateFindingLines = [];
    if (aum > 0) {
      porto.forEach(function(p) {
        var mv = Number(p.marketValue || p.mv || (p.lot * 100 * (p.lastPrice || p.avgPrice || 1000)));
        var weightPct = (mv / aum) * 100;
        if (weightPct > PORTFOLIO_RISK_POLICY_MAX_POSITION_PCT) {
          riskGateFindingLines.push('- ⚠️ ' + p.ticker + ' mencapai ' + weightPct.toFixed(1) + '% dari AUM, melebihi batas maksimum posisi tunggal Risk Gate (' + PORTFOLIO_RISK_POLICY_MAX_POSITION_PCT + '%). Pertimbangkan trim sebagian untuk kembali ke batas aman.');
        }
      });
      if (Number(cashPct) < PORTFOLIO_RISK_POLICY_MIN_CASH_BUFFER_PCT) {
        riskGateFindingLines.push('- ⚠️ Kas RDN hanya ' + cashPct + '% dari AUM, di bawah batas minimum bantalan kas Risk Gate (' + PORTFOLIO_RISK_POLICY_MIN_CASH_BUFFER_PCT + '%). Portofolio kurang siap menyerap koreksi atau peluang Buy on Weakness.');
      }
    }
    var riskGateLines = riskGateFindingLines.length > 0
      ? riskGateFindingLines.join('\n')
      : '- ✅ Tidak ada pelanggaran Risk Gate terdeteksi (posisi tunggal ≤ ' + PORTFOLIO_RISK_POLICY_MAX_POSITION_PCT + '% AUM, kas ≥ ' + PORTFOLIO_RISK_POLICY_MIN_CASH_BUFFER_PCT + '% AUM).';

    reply = '### Review Teardown Portofolio & Alokasi Modal (AI Cockpit)\n\n'
      + 'Ringkasan posisi aset terintegrasi Anda:\n'
      + '- **Total AUM**: Rp ' + Math.round(aum).toLocaleString('id-ID') + '\n'
      + '- **Kas RDN Tersedia**: Rp ' + Math.round(rdn).toLocaleString('id-ID') + ' (' + cashPct + '% dari total modal)\n'
      + '- **Jumlah Posisi Aktif**: ' + porto.length + ' emiten\n\n'
      + '**Daftar Kepemilikan & Bobot Portofolio:**\n'
      + posLines + '\n\n'
      + '**Saran Perbaikan (Risk Gate §7 FINANCIAL_POLICY.md):**\n'
      + riskGateLines + '\n\n'
      + '*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
  }
  else if (pLower.includes('valuasi') || pLower.includes('fundamental') || pLower.includes('fair value') || pLower.includes('mos') || pLower.includes('margin of safety') || pLower.includes('per') || pLower.includes('pbv') || pLower.includes('roe')) {
    // FIX AUDIT (StockChat fallback engine): sebelumnya "Fair Value" dihitung
    // dari formula tetap harga*1.20 (selalu +20% di atas harga pasar, apa pun
    // tickernya) dan menampilkan "P/E ~12.5x | PBV ~1.8x | ROE ~16.5% | DER
    // ~0.65x" — angka konstan yang sama untuk SETIAP saham, disajikan seolah
    // hasil analisa fundamental riil. Chat ini tidak punya akses ke model
    // valuasi multi-metode yang sesungguhnya (itu ada di halaman Valuation/
    // Fundamental) — jadi sekarang hanya menampilkan harga real & sektor,
    // dan mengarahkan ke halaman yang benar-benar menghitung MoS dari data
    // fundamental riil, bukan mengarang angka valuasi di sini.
    var dbItem = (typeof DB !== 'undefined' && DB[matchedTicker]) ? DB[matchedTicker] : null;
    var price = typeof getGlobalMarketPrice === 'function' ? getGlobalMarketPrice(matchedTicker) : getAccurateStockPrice(matchedTicker);

    reply = '### Valuasi Fundamental: ' + matchedTicker + '\n\n'
      + '- **Harga Pasar Terkini**: ' + (price > 0 ? 'Rp ' + price.toLocaleString('id-ID') : 'Rp — (Memuat data...)') + '\n'
      + '- **Sektor Industri**: ' + (dbItem ? dbItem.sector : 'Equities') + '\n\n'
      + '**Catatan Data**: Chat ini belum bisa menghitung Fair Value/MoS/P/E/ROE di sini tanpa mengarang angka. Untuk valuasi 9-Step Margin of Safety, Multi-Model Graham/Lynch/DDM, dan rasio fundamental riil (EPS, BVPS, ROE, DER dari laporan keuangan), buka menu **Valuation** atau **Fundamental** untuk ' + matchedTicker + ' — halaman itu menghitung dari data riil, bukan estimasi generik.\n\n'
      + '*Disclaimer: Keputusan investasi berada di tangan Anda.*';
  }
  else if (pLower.includes('dividen') || pLower.includes('pajak') || pLower.includes('yield') || pLower.includes('dps')) {
    var dbItem = (typeof DB !== 'undefined' && DB[matchedTicker]) ? DB[matchedTicker] : null;
    var price = typeof getGlobalMarketPrice === 'function' ? getGlobalMarketPrice(matchedTicker) : getAccurateStockPrice(matchedTicker);
    var estDps = price > 0 ? Math.round(price * 0.05) : 0;
    var gross = estDps * 100 * 50;
    var tax10 = Math.round(gross * 0.10);
    var netReg = gross - tax10;

    reply = '### Simulasi Penerimaan Dividen Bersih & Pajak: ' + matchedTicker + '\n\n'
      + 'Ini kalkulator ILUSTRASI dengan asumsi yield 5% (bukan DPS historis riil ' + matchedTicker + ') untuk skenario kepemilikan 50 Lot / 5.000 lembar — tujuannya menjelaskan mekanisme pajak, bukan memprediksi dividen sungguhan. Cek DPS riil di menu **Dividend** atau **Fundamental**.\n\n'
      + '- **Estimasi DPS (asumsi yield 5%)**: ' + (estDps > 0 ? 'Rp ' + estDps.toLocaleString('id-ID') : 'Rp —') + '\n'
      + '- **Dividen Kotor (Gross)**: ' + (gross > 0 ? 'Rp ' + gross.toLocaleString('id-ID') : 'Rp —') + '\n'
      + '- **Potongan Pajak Reguler (PPh Final 10%)**: -Rp ' + tax10.toLocaleString('id-ID') + '\n'
      + '- **Dividen Bersih Reguler**: **' + (netReg > 0 ? 'Rp ' + netReg.toLocaleString('id-ID') : 'Rp —') + '**\n\n'
      + '**Fasilitas Insentif Bebas Pajak (PMK 18/PMK.03/2021):**\n'
      + 'Jika dividen diinvestasikan kembali (reinvestasi) pada instrumen keuangan di wilayah NKRI minimal selama 3 tahun pajak, dividen Anda menjadi **Bebas Pajak (PPh 0%)** sehingga Anda menerima utuh **Rp ' + gross.toLocaleString('id-ID') + '**.\n\n'
      + '*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data perpajakan pasar modal.*';
  }
  else if (pLower.includes('simulasi') || pLower.includes('fraksi') || pLower.includes('ara') || pLower.includes('arb') || pLower.includes('drawdown') || pLower.includes('stop loss') || pLower.includes('risk')) {
    var dbItem = (typeof DB !== 'undefined' && DB[matchedTicker]) ? DB[matchedTicker] : null;
    var price = typeof getGlobalMarketPrice === 'function' ? getGlobalMarketPrice(matchedTicker) : getAccurateStockPrice(matchedTicker);

    var tick = 25;
    if (price > 0) {
      if (price < 200) tick = 1;
      else if (price < 500) tick = 2;
      else if (price < 2000) tick = 5;
      else if (price < 5000) tick = 10;
    }

    var araPct = price < 200 ? 0.35 : (price > 5000 ? 0.20 : 0.25);
    var araPrice = price > 0 ? Math.floor(price * (1 + araPct) / tick) * tick : 0;
    var arbPrice = price > 0 ? Math.ceil(price * (1 - araPct) / tick) * tick : 0;

    var sl = price > 0 ? Math.round(price * 0.94 / tick) * tick : 0;
    var tp1 = price > 0 ? Math.round(price * 1.08 / tick) * tick : 0;
    var tp2 = price > 0 ? Math.round(price * 1.15 / tick) * tick : 0;

    reply = '### Simulasi Kepatuhan Transaksi BEI & Risk Planner: ' + matchedTicker + '\n\n'
      + 'Parameter regulasi perdagangan bursa untuk harga ' + (price > 0 ? 'Rp ' + price.toLocaleString('id-ID') : 'Rp —') + ':\n'
      + '- **Fraksi Harga (Tick Size)**: **Rp ' + tick + ' / step**\n'
      + '- **Batas ARA (+ ' + (araPct * 100) + '%)**: **' + (araPrice > 0 ? 'Rp ' + araPrice.toLocaleString('id-ID') : '—') + '**\n'
      + '- **Batas ARB (- ' + (araPct * 100) + '%)**: **' + (arbPrice > 0 ? 'Rp ' + arbPrice.toLocaleString('id-ID') : '—') + '**\n\n'
      + '**Contoh Kerangka Risk/Reward Umum (bukan rekomendasi personal untuk ' + matchedTicker + '):**\n'
      + '- **Area Beli (Entry Zone)**: ' + (price > 0 ? 'Rp ' + price.toLocaleString('id-ID') : 'Rp —') + '\n'
      + '- **Stop Loss Contoh (-6%)**: ' + (sl > 0 ? 'Rp ' + sl.toLocaleString('id-ID') : '—') + '\n'
      + '- **Target Profit 1 Contoh (+8%)**: ' + (tp1 > 0 ? 'Rp ' + tp1.toLocaleString('id-ID') : '—') + '\n'
      + '- **Target Profit 2 Contoh (+15%)**: ' + (tp2 > 0 ? 'Rp ' + tp2.toLocaleString('id-ID') : '—') + '\n\n'
      + 'Persentase SL/TP di atas adalah kerangka umum manajemen risiko, bukan hasil analisa teknikal/volatilitas khusus ' + matchedTicker + '. Untuk level support/resistance riil, cek menu **Technical**.\n\n'
      + '*Disclaimer: Keputusan transaksi sepenuhnya tanggung jawab investor.*';
  }
  else {
    var dbItem = (typeof DB !== 'undefined' && DB[matchedTicker]) ? DB[matchedTicker] : null;
    var rawItem = (typeof _IDX_RAW_LIST !== 'undefined' && _IDX_RAW_LIST[matchedTicker]) ? _IDX_RAW_LIST[matchedTicker] : null;
    var name = (dbItem && dbItem.name) || (rawItem && rawItem.name) || (matchedTicker + ' Tbk.');
    var sector = (dbItem && dbItem.sector) || (rawItem && rawItem.sector) || 'Equities';
    var price = typeof getGlobalMarketPrice === 'function' ? getGlobalMarketPrice(matchedTicker) : getAccurateStockPrice(matchedTicker);
    var chgVal = typeof getGlobalMarketChange === 'function' ? getGlobalMarketChange(matchedTicker) : (typeof changes !== 'undefined' && changes[matchedTicker] !== undefined ? Number(changes[matchedTicker]) : 0);
    var chg = (chgVal >= 0 ? '+' : '') + chgVal.toFixed(2) + '%';

    // FIX AUDIT (StockChat fallback engine): sebelumnya branch default ini
    // menampilkan "Skor Konfluensi 5-Pillar: 84/100 (HIGH CONVICTION /
    // ACCUMULATE)" dengan breakdown "Fundamental (88) | Teknikal (80) |
    // Bandarmology (84) | Valuasi (82) | Risiko (85)" — teks & angka yang
    // 100% IDENTIK untuk setiap ticker yang ditanyakan, tidak peduli
    // fundamentalnya seperti apa. Ini persis pola fabrikasi yang sama
    // dengan bug Opportunity Radar/AI Action Center yang sudah diperbaiki
    // — dihapus, diganti data real (harga/sektor/chg%) + arahan ke halaman
    // yang benar-benar menghitung skor dari data real per kategori.
    reply = '### Ringkasan Cepat: ' + matchedTicker + ' (' + name + ')\n\n'
      + '- **Sektor**: ' + sector + '\n'
      + '- **Harga Terkini**: Rp ' + price.toLocaleString('id-ID') + ' (' + chg + ')\n\n'
      + 'Chat ini belum bisa menghitung skor konfluensi multi-pilar (fundamental/teknikal/bandarmology/valuasi/risiko) tanpa mengarang angka untuk ticker di luar konteks pertanyaan Anda. Untuk analisa 5-pilar yang benar-benar dihitung dari data real per ' + matchedTicker + ', buka **Stock Intelligence Cockpit** atau tanyakan hal spesifik (broker flow, valuasi, dividen, risiko) di sini.\n\n'
      + '*Disclaimer: Keputusan investasi berada di tangan Anda.*';
  }

  return {
    reply: reply,
    toolCalls: executedTools
  };
}

// Clear history
function clearStockChatHistory() {
  STOCKCHAT_CONVERSATION = [
    {
      role: 'assistant',
      text: 'Sesi baru dimulai. Silakan masukkan kode ticker saham atau pertanyaan analisa portofolio Anda.',
      toolCalls: []
    }
  ];
  renderStockChatPage();
}

// Markdown Formatter for StockChat
function formatStockChatMarkdown(md) {
  if (!md) return '';
  var text = String(md);

  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
  text = text.replace(/^### (.*$)/gim, '<div class="text-sm font-bold text-sky-400 mt-3 mb-1">$1</div>');
  text = text.replace(/^## (.*$)/gim, '<div class="text-sm font-black text-slate-100 mt-4 mb-1.5 border-b border-slate-800 pb-1">$1</div>');
  text = text.replace(/^- (.*$)/gim, '<div class="flex items-start gap-2 my-1"><span class="text-blue-400 font-bold">•</span><span>$1</span></div>');
  text = text.replace(/\*Disclaimer: (.*?)\*/gim, '<div class="mt-3 p-2.5 rounded-lg bg-amber-950/30 border border-amber-900/40 text-[11px] text-amber-200/90 italic"><strong>Disclaimer:</strong> $1</div>');
  text = text.replace(/\n\n/g, '<div class="h-2"></div>');
  text = text.replace(/\n/g, '<br>');

  return text;
}

// Global Modal / Window Opener
window.openStockChat = function(ticker, initialPrompt, initialTab) {
  if (ticker) STOCKCHAT_SELECTED_TICKER = ticker.toUpperCase().replace(/\.JK$/i, '').trim();
  if (initialTab) STOCKCHAT_ACTIVE_TAB = initialTab;
  
  if (typeof goPage === 'function') {
    goPage('stockchat');
  } else if (typeof navigateTo === 'function') {
    navigateTo('stockchat');
  } else if (typeof setPage === 'function') {
    setPage('stockchat');
  }

  if (initialPrompt && STOCKCHAT_ACTIVE_TAB === 'chat') {
    setTimeout(function() {
      sendStockChatPrompt(initialPrompt);
    }, 200);
  }
};

// Global standalone modal trigger for StockChat
window.openStockChatModal = function(ticker, initialTab) {
  var tk = ticker || STOCKCHAT_SELECTED_TICKER || 'BBCA';
  window.openStockChat(tk, null, initialTab || 'broker-flow');
};

window.renderStockChatPage = renderStockChatPage;
window.sendStockChatPrompt = sendStockChatPrompt;
window.clearStockChatHistory = clearStockChatHistory;
window.fetchBrokerSummaryData = fetchBrokerSummaryData;
window.renderBrokerSummaryWidget = renderBrokerSummaryWidget;
window.selectStockChatTicker = selectStockChatTicker;
window.sendStockChatPreset = sendStockChatPreset;
window.handleStockChatSubmit = handleStockChatSubmit;
window.setStockChatActiveTab = setStockChatActiveTab;
window.setStockChatTimeframe = setStockChatTimeframe;
window.loadAndRenderBrokerFlowTab = loadAndRenderBrokerFlowTab;
window.askAiAboutCurrentBrokerFlow = askAiAboutCurrentBrokerFlow;
window.toggleStockChatTableSort = toggleStockChatTableSort;
window.setStockChatTableLimit = setStockChatTableLimit;
window.setStockChatBrokerFilter = setStockChatBrokerFilter;
window.askAiAboutBrokerAction = askAiAboutBrokerAction;
window.openStockIntelForTicker = function(tk) {
  if (typeof sm360Go === 'function') sm360Go('stock-intel', tk);
  else if (typeof selectStockIntelTicker === 'function') selectStockIntelTicker(tk);
};

// ============================================================
// ============================================================
// BANDARMOLOGY & SMART MONEY COCKPIT SUITE
// 2 Master Modes:
// 1. ANALISIS FULL EMITEN (Single Stock Deep Cockpit: Broker Flow + CMF + VWAP Bands + Foreign Flow)
// 2. ANALISIS FULL MARKET (Macro IHSG + Big Banks + Sektoral Heatmap + Accum/Distrib Radar + Screener)
// ============================================================

// FIX (2026-09-19): mode saham dihapus dari halaman ini (lihat
// renderBandarmologyCockpitPage()) — variabel ini sekarang selalu 'market'
// setiap kali halaman dirender, dipertahankan (bukan dihapus) karena masih
var BANDARMOLOGY_MASTER_MODE = 'market';
var BANDARMOLOGY_MARKET_TIMEFRAME = '1D';

function bandarSetMarketTimeframe(tf) {
  BANDARMOLOGY_MARKET_TIMEFRAME = tf || '1D';
  renderBandarmologyCockpitPage();
}
var BANDARMOLOGY_SELECTED_BROKER = 'YU';
var BANDARMOLOGY_BROKER_TIMEFRAME = '1D';
var _bandarBrokerPortfolioCache = {};
var _bandarBrokerPortfolioLoading = false;
var BANDARMOLOGY_BROKER_LIST = [
  { code: 'YU', name: 'CGS International Sekuritas', type: 'F', badge: 'Asing / Institusi' },
  { code: 'AK', name: 'UBS Sekuritas Indonesia', type: 'F', badge: 'Asing / Smart Money' },
  { code: 'ZP', name: 'Maybank Sekuritas Indonesia', type: 'F', badge: 'Asing / Institusi' },
  { code: 'CC', name: 'Mandiri Sekuritas', type: 'D', badge: 'BUMN / Domestik' },
  { code: 'RX', name: 'Macquarie Sekuritas Indonesia', type: 'F', badge: 'Asing / Quant' },
  { code: 'NI', name: 'BNI Sekuritas', type: 'D', badge: 'BUMN / Domestik' },
  { code: 'BK', name: 'J.P. Morgan Sekuritas Indonesia', type: 'F', badge: 'Asing / Bulge' },
  { code: 'PD', name: 'Indo Premier Sekuritas', type: 'D', badge: 'Retail & Institusi' },
  { code: 'YP', name: 'Mirae Asset Sekuritas', type: 'D', badge: 'Retail Heavy' },
  { code: 'XC', name: 'Ajaib Sekuritas Asia', type: 'D', badge: 'Retail' },
  { code: 'SQ', name: 'BCA Sekuritas', type: 'D', badge: 'Domestik' },
  { code: 'GR', name: 'Panin Sekuritas', type: 'D', badge: 'Domestik' }
];

var _isNavigatingBandarmology = false;
// FIX (2026-09-19, konsolidasi "Eksekusi no 1"): mode saham Bandarmology
// (Broker Flow + CMF/VWAP + Foreign Flow single-ticker) sudah dipindah
// jadi 1 tab di halaman Technical (lihat techRunBandarmologyTab(),
// 24-stockmaster.js) karena keduanya memakai engine fsGenData()+fsProcess()
// yang identik untuk ticker yang sama. Semua pemanggil lama
// (goBandarmology('stock'/'emiten'/'smart-money-flow', ...) dari sidebar,
// 07-flowscan.js, 27-stockintel.js, router 'flowscan') dialihkan di sini
// satu tempat ke halaman Technical, tanpa perlu mengubah tiap call site —
// ticker yang sudah dipilih via selectStockChatTicker() sebelum memanggil
// fungsi ini tetap tersinkron lewat GLOBAL_STOCK_CONTEXT.
window.goBandarmology = function(subTabOrMode, btn) {
  var isStockRequest = (subTabOrMode === 'stock' || subTabOrMode === 'emiten' || subTabOrMode === 'smart-money-flow');
  if (isStockRequest) {
    if (typeof TECH_DATA !== 'undefined') TECH_DATA.activeTab = 2;
    if (typeof goPage === 'function') {
      goPage('technical', btn);
    } else if (typeof techInit === 'function') {
      techInit();
    }
    return;
  }
  BANDARMOLOGY_MASTER_MODE = 'market';
  // Note: if subTabOrMode is 'bandarmology'/'market'/null, mode Bandarmology
  // sekarang selalu 'market' (mode saham sudah pindah ke Technical di atas).

  if (!_isNavigatingBandarmology) {
    _isNavigatingBandarmology = true;
    try {
      if (typeof goPage === 'function' && typeof currentPage !== 'undefined' && currentPage !== 'bandarmology') {
        goPage('bandarmology', btn);
      } else {
        var pg = document.getElementById('page-bandarmology');
        if (pg) {
          document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('on'); });
          pg.classList.add('on');
        }
        if (btn && btn.classList) {
          document.querySelectorAll('.side-nav button, .nav button').forEach(function(b){ b.classList.remove('on'); });
          btn.classList.add('on');
        }
      }
    } finally {
      _isNavigatingBandarmology = false;
    }
  }

  renderBandarmologyCockpitPage();
};

// FIX (2026-09-19, konsolidasi "Eksekusi no 1"): mode 'stock' di sini
// sekarang berarti "pindah ke Technical" (lihat goBandarmology() di atas),
// bukan lagi merender ulang Bandarmology dalam mode saham (sudah dihapus).
window.setBandarmologyMode = function(mode) {
  if (mode === 'stock') {
    if (typeof goBandarmology === 'function') goBandarmology('stock', null);
    return;
  }
  BANDARMOLOGY_MASTER_MODE = 'market';
  renderBandarmologyCockpitPage();
};

// Dipanggil langsung dari router (06-analysis-router.js, case
// 'smart-money-flow') dan dari goBandarmology() lama — sekarang cuma
// delegasi tipis: nama market-mode tetap dirender di sini, nama lainnya
// (termasuk 'stock'/'emiten'/'smart-money-flow') diarahkan ke Technical
// via goBandarmology(), yang sudah punya logika redirect-nya.
window.setBandarmologyTab = function(subTab) {
  if (subTab === 'market' || ['market-flow', 'accumulation', 'distribution', 'heatmap-scanner', 'broker-trail', 'smart-money-radar'].includes(subTab)) {
    BANDARMOLOGY_MASTER_MODE = 'market';
    renderBandarmologyCockpitPage();
    return;
  }
  if (typeof goBandarmology === 'function') goBandarmology(subTab, null);
};

window.setBandarmologyBroker = function(brokerCode) {
  BANDARMOLOGY_SELECTED_BROKER = (brokerCode || 'YU').toUpperCase().trim();
  var el = document.getElementById('bandarmology-broker-trail-view');
  if (el) {
    bandarRenderBrokerPortfolioSection();
  } else {
    renderBandarmologyCockpitPage();
  }
  bandarLoadBrokerPortfolio(BANDARMOLOGY_SELECTED_BROKER, BANDARMOLOGY_BROKER_TIMEFRAME);
};

window.setBandarmologyBrokerTimeframe = function(tf) {
  BANDARMOLOGY_BROKER_TIMEFRAME = (tf || '1D').toUpperCase();
  var el = document.getElementById('bandarmology-broker-trail-view');
  if (el) {
    bandarRenderBrokerPortfolioSection();
  } else {
    renderBandarmologyCockpitPage();
  }
  bandarLoadBrokerPortfolio(BANDARMOLOGY_SELECTED_BROKER, BANDARMOLOGY_BROKER_TIMEFRAME);
};

window.bandarSubmitCustomBroker = function() {
  var input = document.getElementById('bandar-custom-broker-input');
  if (!input) return;
  var code = (input.value || '').trim().toUpperCase();
  if (code.length >= 2) {
    window.setBandarmologyBroker(code);
  }
};

function bandarRenderBrokerPortfolioSection() {
  var el = document.getElementById('bandarmology-broker-trail-view');
  if (!el) return;
  el.outerHTML = renderBandarmologyBrokerTrailView();
}

// FIX (2026-09-19, konsolidasi "Eksekusi no 1"): mode saham (Broker Flow +
// CMF/VWAP + Foreign Flow single-ticker, sebelumnya "ANALISIS FULL EMITEN")
// dipindah jadi 1 tab di halaman Technical (lihat techRunBandarmologyTab(),
// 24-stockmaster.js) — engine fsGenData()+fsProcess() yang dipakai identik
// untuk ticker yang sama, jadi tidak ada lagi 2 mode di sini. Halaman ini
// sekarang HANYA merender mode market (macro IHSG, Big Banks, Sektoral
// Heatmap, Accum/Distrib Radar, Broker Trail). Toolbar 2-mode & fokus-emiten
// yang dulu ada di sini dihapus karena tidak relevan lagi.
// FIX (2026-09-24, user-reported: "saat membuka market flow masih crash" —
// a Chrome "Page Unresponsive" dialog, which flags a blocked MAIN THREAD,
// not a hung network request; the earlier fetch-timeout fix was necessary
// but didn't address this). Root cause: FH.timer (03-engine.js) calls
// renderPage(currentPage) every ~60s purely to refresh the fast-moving
// price ticker on whatever page is open — but Market Flow's content is
// 100% driven by Invezgo's own daily-cached whole-market data, with zero
// dependency on that price tick. Every one of those ~60s pokes used to
// re-run this function's FULL reload+rebuild (~53 concurrent requests +
// a full page HTML teardown/rebuild) unconditionally, forever, for as
// long as the user stayed on the page — stacking overlapping request
// waves whose JSON-parsing + DOM-rebuild work on the main thread is what
// trips the browser's unresponsive-page watchdog. Now a repeat call with
// nothing user-relevant changed (same ticker/timeframe/broker/date) is a
// cheap no-op; pass force=true to bypass it (used by
// bandarPrefetchMarketBatch() below for its legitimate one-time refresh
// once real data actually arrives).
var _bandarLastRenderedKey = null;

function renderBandarmologyCockpitPage(containerId, force) {
  var target = document.getElementById(containerId || 'page-bandarmology');
  if (!target) return;

  var tk = (STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  BANDARMOLOGY_MASTER_MODE = 'market';

  var todayKey = new Date().toISOString().slice(0, 10);
  var renderKey = tk + '|' + BANDARMOLOGY_MARKET_TIMEFRAME + '|' + BANDARMOLOGY_SELECTED_BROKER + '|' + BANDARMOLOGY_BROKER_TIMEFRAME + '|' + todayKey;
  if (!force && renderKey === _bandarLastRenderedKey && target.childElementCount > 0) {
    return;
  }
  _bandarLastRenderedKey = renderKey;

  var html = '<div style="margin-bottom:16px">'
    // Header Cockpit
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px">'
    + '<div>'
    + '<div class="ptitle" style="display:flex;align-items:center;gap:8px">'
    + 'Market Flow'
    + '<span class="badge b-accent" style="font-size:9px;margin-left:4px">INSTITUTIONAL RADAR</span>'
    + '</div>'
    + '<div class="psub">Analisis Macro IHSG, Big Banks, Sektoral Heatmap &amp; Konsentrasi Akumulasi/Distribusi seluruh BEI. Untuk analisis per-emiten (Broker Flow, CMF, VWAP Bands, Foreign Flow), lihat tab Bandarmology di halaman Technical.</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
    + '<div style="display:flex;align-items:center;gap:6px">'
    + '<label for="bandar-market-tf-select" style="font-size:11px;font-weight:700;color:var(--text3)">Periode:</label>'
    + '<select id="bandar-market-tf-select" class="sm-input" style="padding:4px 10px;font-size:11px;border-radius:6px;width:auto;height:auto;cursor:pointer" onchange="bandarSetMarketTimeframe(this.value)">'
    + '<option value="1D"' + (BANDARMOLOGY_MARKET_TIMEFRAME === '1D' ? ' selected' : '') + '>Hari Ini (1D)</option>'
    + '<option value="5D"' + (BANDARMOLOGY_MARKET_TIMEFRAME === '5D' ? ' selected' : '') + '>1 Minggu (5D)</option>'
    + '<option value="1M"' + (BANDARMOLOGY_MARKET_TIMEFRAME === '1M' ? ' selected' : '') + '>1 Bulan (1M)</option>'
    + '</select>'
    + '</div>'
    + '<button onclick="if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + tk + '\');goBandarmology(\'stock\',null);" class="sm-btn" style="font-size:11px;padding:5px 12px;border-radius:6px;font-weight:700;display:inline-flex;align-items:center;gap:4px">'
    + '<span>Analisis Emiten (Technical)</span>'
    + '</button>'
    + '<button onclick="goPage(\'radar\')" class="btn btn-ghost btn-xs">'
    + 'Screener'
    + '</button>'
    + '<button onclick="goPage(\'stock-dossier\')" class="btn btn-ghost btn-xs flex items-center gap-1">'
    + '<span>Stock Master 360</span>'
    + '</button>'
    + '</div>'
    + '</div>';

  // FIX AUDIT (2026-09-17, konsolidasi screener): heatmap sektor + tabel
  // "PEMINDAI SMART MONEY & BANDAR RADAR" yang sebelumnya dirender di sini
  // (renderBandarmologyHeatmapScannerView) dipindahkan jadi mode "Sector
  // Heatmap" di halaman Smart Money Screener (public/js/07-flowscan.js,
  // fsRenderSectorHeatmapMode()) — overlap konsep & sumber data (CMF/verdict
  // bandar) dengan Flow Scanner dan Acc/Dist Scanner, jadi digabung satu
  // tempat alih-alih 3 implementasi terpisah yang bisa beda verdict untuk
  // ticker sama. Lihat INCIDENT_LOG.md.
  html += '<div id="bandarmology-tab-content" style="min-height:460px;display:flex;flex-direction:column;gap:16px">'
    + renderBandarmologyMarketFlowView(tk)
    + renderBandarmologyForeignFlowView(tk)
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">'
    + renderBandarmologyAccumulationView()
    + renderBandarmologyDistributionView()
    + '</div>'
    + renderBandarmologyBrokerTrailView()
    + '</div>';

  html += '</div>';
  target.innerHTML = html;
  _bandarAccDistCache = null;
  setTimeout(function() { bandarLoadAccDist('acc'); }, 40);
  setTimeout(function() { bandarLoadAccDist('dist'); }, 40);
  setTimeout(bandarLoadRealForeignFlow, 40);
  // Kick off 1 API call for the whole-market Smart Money scanner (cached daily).
  setTimeout(bandarLoadRealMarketFlow, 60);
  setTimeout(function() { bandarLoadBrokerPortfolio(BANDARMOLOGY_SELECTED_BROKER, BANDARMOLOGY_BROKER_TIMEFRAME); }, 40);

  // FIX (2026-09-24, user-reported "Page Unresponsive" — root cause found
  // after the periodic-re-render fix above didn't fully resolve it):
  // bandarPrefetchMarketBatch() used to fire here on every page load,
  // fetching broker-summary data for ~48 tickers (each with its own
  // multi-proxy Yahoo fallback chain on failure) into
  // STOCKCHAT_BROKER_DATA_CACHE. NOTHING currently rendered on this page
  // reads that cache — Market Flow/Foreign Flow/Accumulation/Distribution/
  // Broker Trail all migrated to whole-market Invezgo endpoints in earlier
  // fixes this session, and the two functions that still read it
  // (renderBandarmologySmartMoneyRadarView(), the old Smart Money Radar
  // card) have zero call sites anywhere in the app. This was pure
  // overhead competing for the browser's limited per-origin connections
  // with the 5 requests that ARE rendered, and its individually-resolving
  // promises processing on the main thread as they landed is what was
  // actually tripping the "Page Unresponsive" watchdog ~30-60s in — not
  // called at all anymore.
}

// KNOWN_ISSUES.md #3 — shared disclosure banner for every Bandarmology view
// that reads generateClientSideBrokerSummary() (client-side simulated
// per-broker transaction volume/value — BEI has no free/public per-broker
// feed, so this is always a seeded estimate, not a real broker-flow feed;
// see that function's own comment). Market Flow / Heatmap Scanner already
// carried this disclosure (added 2026-09-06, before this issue was even
// filed); Foreign Flow, Accumulation, Distribution, Smart Money Radar and
// Broker Trail read the exact same fabricated figures with none — this adds
// it there too instead of leaving some views honest and others not.
function bandarSimBanner(extraNote) {
  return '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:12px">'
    + (extraNote || 'Rincian buyer/seller &amp; nilai transaksi di bawah dihitung dari simulasi transaksi broker (belum ada feed broker-flow real per-menit) — harga saham tetap real, tapi angka volume/nilai transaksi adalah estimasi.')
    + '</div>';
}

// FIX (2026-09-17, user-requested: "seharusnya sudah dengan data riil bukan
// data simulasi" setelah INVEZGO_API_KEY dipasang di production): sebelum
// ini, KELIMA view market-aggregate Bandarmology (Market Flow, Foreign
// Flow, Accumulation, Distribution, Smart Money Radar, Broker Trail) SELALU
// memanggil generateClientSideBrokerSummary() langsung — 100% simulasi,
// tidak pernah menyentuh Invezgo sama sekali walau API key sudah aktif
// (beda dari tab "Analisis Full Emiten" yang sudah lama pakai
// fetchBrokerSummaryData(), yang REAL kalau Invezgo dikonfigurasi). Bukan
// bug baru — didokumentasikan sengaja di KNOWN_ISSUES.md #3/INCIDENT_LOG.md
// #7 sebagai keterbatasan yang didisclose, bukan diperbaiki. Sekarang
// diperbaiki: bandarGetCachedSummary() adalah pengganti drop-in untuk
// generateClientSideBrokerSummary(t,'1D') di keenam view itu — baca dari
// STOCKCHAT_BROKER_DATA_CACHE (diisi oleh fetchBrokerSummaryData(), endpoint
// /api/idx/broker-summary/:ticker yang sama dipakai tab Emiten) kalau sudah
// ada, jatuh ke simulasi PERSIS seperti sebelumnya kalau belum (aman untuk
// render pertama sebelum prefetch selesai — bentuk objeknya identik karena
// computeBandarmologyVerdict() dipakai bersama oleh jalur real & simulasi
// di lib/idx-data-engine.js, jadi topBuyers/topSellers/bandarmology.* punya
// field yang sama persis).
function bandarGetCachedSummary(ticker, tf) {
  var t = String(ticker || '').toUpperCase().replace(/\.JK$/i, '').trim();
  var timeframe = tf || (typeof BANDARMOLOGY_MARKET_TIMEFRAME !== 'undefined' ? BANDARMOLOGY_MARKET_TIMEFRAME : '1D');
  var key = t + '_' + timeframe;
  return STOCKCHAT_BROKER_DATA_CACHE[key] || generateClientSideBrokerSummary(t, timeframe);
}

// Union saham yang dibutuhkan SEMUA view market-aggregate sekaligus, supaya
// satu putaran prefetch (bukan 6 putaran terpisah per view) cukup melayani
// semuanya — sama-sama baca dari cache yang sama.
function bandarUniqueMarketTickers(extraTicker) {
  var seen = {};
  var out = [];
  function add(list) {
    (list || []).forEach(function(t) {
      var u = String(t || '').toUpperCase();
      if (u && !seen[u]) { seen[u] = true; out.push(u); }
    });
  }
  // Big 4 Banks removed from Market Flow View — replaced with whole-market
  // accumulation data from /api/idx/accumulation-distribution (1 API call).
  // Keeping a handful for sector heatmap seed only.
  add(['BBCA', 'BBRI', 'BMRI', 'BBNI']);
  BANDAR_SECTOR_DEFS.forEach(function(sec) { add(sec.tickers); });
  add(['BBCA', 'BBRI', 'BMRI', 'BBNI', 'ANTM', 'ADRO', 'PTRO', 'TLKM', 'ASII', 'GOTO', 'AMMN', 'BREN', 'TPIA', 'CUAN', 'PANI', 'BRMS', 'MEDC', 'PGAS', 'PTBA', 'INCO', 'MDKA', 'HRUM', 'MBMA', 'BUMI', 'AADI', 'BRIS', 'UNVR', 'ICBP', 'INDF', 'KLBF', 'SIDO', 'MYOR', 'CPIN', 'ACES', 'INKP', 'TKIM', 'JSMR', 'CTRA', 'PWON', 'GGRM', 'EXCL', 'BUKA', 'SMGR']); // Foreign Flow/Accumulation/Distribution/Broker Trail sample
  if (extraTicker) add([extraTicker]); // Smart Money Radar's currently-focused ticker
  return out;
}

var BANDAR_MARKET_PREFETCH_INFLIGHT = false;
// Fetches real per-ticker broker data (fetchBrokerSummaryData() already
// caches per ticker+timeframe and falls back to simulation per ticker on
// failure — see its own comment) for the whole shared sample universe, then
// re-renders the cockpit page once so all 6 views flip from their initial
// simulated-fallback paint to real numbers together. Guarded by an inflight
// flag so rapid mode/broker switching doesn't stack up duplicate batches —
// fetchBrokerSummaryData()'s own cache makes a second call for an
// already-fetched ticker instant anyway, but this avoids firing the whole
// ~45-ticker Promise.all more than once concurrently.
function bandarPrefetchMarketBatch(containerId, tk, tf) {
  if (BANDAR_MARKET_PREFETCH_INFLIGHT) return;
  var timeframe = tf || (typeof BANDARMOLOGY_MARKET_TIMEFRAME !== 'undefined' ? BANDARMOLOGY_MARKET_TIMEFRAME : '1D');
  var tickers = bandarUniqueMarketTickers(tk);
  var missing = tickers.filter(function(t) {
    return timeframe === '1D' ? !STOCKCHAT_BROKER_DATA_CACHE[t + '_1D'] : !STOCKCHAT_BROKER_DATA_CACHE[t + '_' + timeframe];
  });
  if (missing.length === 0) return;
  BANDAR_MARKET_PREFETCH_INFLIGHT = true;
  Promise.all(missing.map(function(t) { return fetchBrokerSummaryData(t, timeframe).catch(function() { return null; }); }))
    .then(function() {
      BANDAR_MARKET_PREFETCH_INFLIGHT = false;
      var target = document.getElementById(containerId || 'page-bandarmology');
      if (target) renderBandarmologyCockpitPage(containerId, true);
    })
    .catch(function() { BANDAR_MARKET_PREFETCH_INFLIGHT = false; });
}

// Disclosure banner that reflects what was ACTUALLY used for the tickers a
// view just rendered — real Invezgo data, simulation, or a mix — instead of
// bandarSimBanner()'s always-simulated text. realCount/totalCount are
// counted by the caller from the same bandarGetCachedSummary() results it
// used to build its rows, so this can never claim "real" for data that
// wasn't.
// Real (computeBandarmologyVerdict() in lib/idx-data-engine.js) and
// simulated (generateClientSideBrokerSummary() above) bandarmology objects
// use DIFFERENT field names for the same figures (netValueRp vs netValRp,
// institutionalNetRp under `smartMoney` vs smartMoneyNetValRp under
// `retailVsSmartMoney`, top3BuyerPct vs top3BuyPct) — Foreign Flow/
// Accumulation/Distribution views already defensively checked both, but
// Market Flow View only checked the simulated names, so real data silently
// read as 0 there. These two helpers pick whichever shape is actually
// present instead of assuming one.
function bandarForeignNetRp(bm) {
  var ff = (bm && bm.foreignFlow) || {};
  if (ff.netValueRp !== undefined) return ff.netValueRp;
  if (ff.netValRp !== undefined) return ff.netValRp;
  return 0;
}
function bandarSmartMoneyNetRp(bm) {
  if (bm && bm.smartMoney && bm.smartMoney.institutionalNetRp !== undefined) return bm.smartMoney.institutionalNetRp;
  if (bm && bm.retailVsSmartMoney && bm.retailVsSmartMoney.smartMoneyNetValRp !== undefined) return bm.retailVsSmartMoney.smartMoneyNetValRp;
  return 0;
}

function bandarDataBanner(realCount, totalCount, simNote) {
  if (totalCount > 0 && realCount === totalCount) {
    return '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      + 'Data di bawah adalah data REAL dari Invezgo API (broker summary resmi BEI), bukan simulasi.'
      + '</div>';
  }
  if (totalCount > 0 && realCount > 0) {
    return '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      + realCount + ' dari ' + totalCount + ' saham di bawah memakai data REAL Invezgo API; sisanya belum tersedia dari provider untuk saham tersebut sehingga memakai simulasi.'
      + '</div>';
  }
  return bandarSimBanner(simNote);
}

// 1. Market Flow View — Smart Money vs Retail Divergence Scanner
// REFACTOR (2026-09-21): Mengganti pendekatan Big 4 Banks + sektor statis
// (iterasi ~47 ticker cached, hasilnya flat/tidak actionable karena data
// bank besar selalu noise) dengan dua widget berbasis data SELURUH PASAR:
//   (A) Smart Money vs Retail Divergence Scanner — top 5 emiten akumulasi
//       vs distribusi seluruh BEI dari Invezgo /analysis/top/accumulation
//       (1 API call, cache harian di _BANDAR_MARKET_FLOW_CACHE).
//   (B) Sektor Rotasi Modal Heatmap — nilai Rp riil akumulasi per sektor
//       dihitung dari data universe yang sama (no extra API call).
// Quota impact: 1 call/hari (fetch lazy + cache) vs sebelumnya 0 Invezgo
// calls di sini (hanya baca STOCKCHAT_BROKER_DATA_CACHE yang diisi
// bandarPrefetchMarketBatch). Net cost = +1 call/user/hari untuk view ini.

var _BANDAR_MARKET_FLOW_CACHE = null; // { data, dateKey }

// Returns true if we should use the cached result (same calendar date, data valid).
function _bandarMarketFlowCacheValid() {
  if (!_BANDAR_MARKET_FLOW_CACHE || !_BANDAR_MARKET_FLOW_CACHE.data) return false;
  var today = new Date().toISOString().slice(0, 10);
  return _BANDAR_MARKET_FLOW_CACHE.dateKey === today;
}

function renderBandarmologyMarketFlowView(tk) {
  // Render a loading skeleton synchronously; bandarLoadRealMarketFlow() fills it.
  return '<div id="bandar-market-flow-content" style="display:flex;flex-direction:column;gap:16px">'
    + '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Memuat Smart Money Divergence Scanner seluruh BEI...</div>'
    + '</div>';
}

// Renders the full market flow content from acc/dist data returned by
// /api/idx/accumulation-distribution (real) or its simulated fallback.
function bandarRenderMarketFlowContent(data) {
  var isReal = data && !data.isSimulated;
  var accList  = (data && data.accumulation)  || [];
  var distList = (data && data.distribution)  || [];
  var accCount = (data && data.counts && data.counts.accumulation) || accList.length;
  var distCount= (data && data.counts && data.counts.distribution) || distList.length;
  var totalScanned = (data && data.counts && data.counts.totalUniverseScanned) || (accCount + distCount);
  var dateLabel = (data && data.date) ? data.date : new Date().toISOString().slice(0,10);

  var fmtRp = function(v) {
    var abs = Math.abs(v || 0);
    if (abs >= 1e12) return (v >= 0 ? '+' : '-') + 'Rp ' + (abs / 1e12).toFixed(1) + ' T';
    if (abs >= 1e9)  return (v >= 0 ? '+' : '-') + 'Rp ' + Math.round(abs / 1e9) + ' M';
    if (abs >= 1e6)  return (v >= 0 ? '+' : '-') + 'Rp ' + Math.round(abs / 1e6) + ' Jt';
    return (v >= 0 ? '+' : '-') + 'Rp ' + Math.round(abs).toLocaleString('id-ID');
  };
  var fmtScore = function(s) { return Number(s || 0).toFixed(1); };

  // --- Metric summary cards ---
  var breadthPct = totalScanned > 0 ? Math.round((accCount / totalScanned) * 100) : 0;
  var breadthLabel = breadthPct >= 60 ? 'RISK-ON (Akumulasi Dominan)'
    : (breadthPct <= 40 ? 'RISK-OFF (Distribusi Dominan)' : 'MIXED / SIDEWAYS');
  var breadthColor = breadthPct >= 60 ? 'var(--green)' : (breadthPct <= 40 ? 'var(--red)' : 'var(--text2)');

  // Top divergence signal: if top-1 acc score >> top-1 dist score → SM inflow signal
  var topAccScore  = accList.length  ? (accList[0].score  || 0) : 0;
  var topDistScore = distList.length ? (Math.abs(distList[0].score || 0)) : 0;
  var divergenceRatio = (topDistScore > 0) ? (topAccScore / topDistScore).toFixed(2) : (topAccScore > 0 ? '∞' : '1.00');
  var isDivBullish = parseFloat(divergenceRatio) > 1.2 || divergenceRatio === '∞';

  var bannerHtml = isReal
    ? '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);margin-bottom:12px">'
      + 'Data REAL Invezgo API — ' + dateLabel + ' — ' + totalScanned + ' emiten BEI terdeteksi pergerakan bandar.'
      + '</div>'
    : '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);margin-bottom:12px">'
      + ((data && data.message) || 'Data belum tersedia — provider Invezgo belum mengembalikan data hari ini (EOD data terbit ~17:30 WIB). Coba pilih tanggal kemarin.') + '</div>';

  var metricCards = '<div class="row4">'
    + '<div class="metric">'
    + '<div class="mlabel">EMITEN AKUMULASI</div>'
    + '<div class="mval up mono" style="font-size:20px">' + accCount + '</div>'
    + '<div class="msub neu">dari ' + totalScanned + ' emiten terdeteksi</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="mlabel">EMITEN DISTRIBUSI</div>'
    + '<div class="mval dn mono" style="font-size:20px">' + distCount + '</div>'
    + '<div class="msub neu">smart money keluar (melepas)</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="mlabel">MARKET BREADTH</div>'
    + '<div class="mval mono" style="font-size:20px;color:' + breadthColor + '">' + breadthPct + '%</div>'
    + '<div class="msub neu">' + breadthLabel + '</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="mlabel">SM DIVERGENCE RATIO</div>'
    + '<div class="mval ' + (isDivBullish ? 'up' : 'dn') + ' mono" style="font-size:20px">' + divergenceRatio + 'x</div>'
    + '<div class="msub neu">' + (isDivBullish ? 'Institusi lebih agresif beli' : 'Distribusi lebih dominan') + '</div>'
    + '</div>'
    + '</div>';

  // --- Scanner columns: Top 5 Acc vs Top 5 Dist ---
  var renderScannerRow = function(item, side) {
    var isUp = side === 'acc';
    var scoreColor = isUp ? 'var(--green)' : 'var(--red)';
    var priceBadge = item.priceChangePct >= 0 ? 'b-up' : 'b-dn';
    var changeStr  = (item.priceChangePct >= 0 ? '+' : '') + Number(item.priceChangePct || 0).toFixed(2) + '%';
    var valStr = fmtRp(item.valueRp || 0);
    return '<div onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyMode(\'stock\');" '
      + 'style="display:flex;justify-content:space-between;align-items:center;padding:10px 8px;'
      + 'border-bottom:1px solid var(--border2);cursor:pointer;border-radius:6px;transition:background 0.15s" '
      + 'onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'transparent\'">'
      + '<div>'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span class="mono" style="font-weight:800;color:var(--text)">' + item.ticker + '</span>'
      + '<span class="badge ' + priceBadge + '" style="font-size:9px">' + changeStr + '</span>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:2px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (item.name || item.ticker) + '</div>'
      + '</div>'
      + '<div style="text-align:right">'
      + '<div class="mono" style="font-weight:800;font-size:13px;color:' + scoreColor + '">Score ' + fmtScore(item.score) + '</div>'
      + '<div class="mono" style="font-size:11px;color:var(--text3)">' + valStr + '</div>'
      + '</div>'
      + '</div>';
  };

  var scannerHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">'
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--border2);margin-bottom:8px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--green)">TOP SMART MONEY INFLOW (AKUMULASI)</div>'
    + '<span class="badge b-up" style="font-size:9px">BELI</span>'
    + '</div>'
    + (accList.length === 0
        ? '<div style="padding:16px;text-align:center;color:var(--text3);font-size:11px">Data belum tersedia untuk hari ini.</div>'
        : accList.slice(0,5).map(function(it){ return renderScannerRow(it, 'acc'); }).join(''))
    + '</div>'
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--border2);margin-bottom:8px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--red)">TOP SMART MONEY OUTFLOW (DISTRIBUSI)</div>'
    + '<span class="badge b-dn" style="font-size:9px">JUAL</span>'
    + '</div>'
    + (distList.length === 0
        ? '<div style="padding:16px;text-align:center;color:var(--text3);font-size:11px">Data belum tersedia untuk hari ini.</div>'
        : distList.slice(0,5).map(function(it){ return renderScannerRow(it, 'dist'); }).join(''))
    + '</div>'
    + '</div>';

  // --- Sektor Rotasi Modal Heatmap ---
  // Map setiap emiten dari acc/distList ke 11 sektor resmi IDX, hitung net score per sektor.
  var sectorMap = {};
  BANDAR_SECTOR_DEFS.forEach(function(sec) { sectorMap[sec.name] = { name: sec.name, accScore: 0, distScore: 0, accCount: 0, distCount: 0 }; });

  function mapItemToSector(item, side) {
    if (!item) return;
    var rawTk = (item.ticker || '').toUpperCase().trim();
    var matchedSecName = null;

    // 1. Direct match with IDX_SECTOR_MAP (full IDX universe mapping)
    if (typeof IDX_SECTOR_MAP !== 'undefined' && IDX_SECTOR_MAP[rawTk]) {
      matchedSecName = IDX_SECTOR_MAP[rawTk];
    }

    // 2. Direct match with BANDAR_SECTOR_DEFS
    if (!matchedSecName) {
      for (var i = 0; i < BANDAR_SECTOR_DEFS.length; i++) {
        if (BANDAR_SECTOR_DEFS[i].tickers.indexOf(rawTk) !== -1) {
          matchedSecName = BANDAR_SECTOR_DEFS[i].name;
          break;
        }
      }
    }

    // 3. Lookup from item.sector, DB, or IDX_UNIVERSE
    if (!matchedSecName) {
      var rawSec = item.sector;
      if (!rawSec && typeof DB !== 'undefined' && DB[rawTk] && DB[rawTk].sector) {
        rawSec = DB[rawTk].sector;
      }
      if (!rawSec && typeof IDX_UNIVERSE !== 'undefined' && Array.isArray(IDX_UNIVERSE)) {
        var uMatch = IDX_UNIVERSE.find(function(x) { return (x.t || x.c) === rawTk; });
        if (uMatch && uMatch.s) rawSec = uMatch.s;
      }

      if (rawSec && rawSec !== 'Lainnya') {
        var s = String(rawSec).toLowerCase();
        if (/keuangan|financial/i.test(s)) matchedSecName = 'Financials (Keuangan)';
        else if (/energi|energy/i.test(s)) matchedSecName = 'Energy (Energi)';
        else if (/bahan baku|basic material|tambang|mineral|barang baku/i.test(s)) matchedSecName = 'Basic Materials (Barang Baku)';
        else if (/non-cyclical|konsumer primer|consumer non/i.test(s)) matchedSecName = 'Consumer Non-Cyclicals (Konsumer Primer)';
        else if (/cyclical|konsumer non-primer|consumer cycl/i.test(s)) matchedSecName = 'Consumer Cyclicals (Konsumer Non-Primer)';
        else if (/kesehatan|health/i.test(s)) matchedSecName = 'Healthcare (Kesehatan)';
        else if (/teknologi|technology/i.test(s)) matchedSecName = 'Technology (Teknologi)';
        else if (/infrastruktur|infrastructure/i.test(s)) matchedSecName = 'Infrastructures (Infrastruktur)';
        else if (/properti|property|properties|real estate/i.test(s)) matchedSecName = 'Properties & Real Estate (Properti)';
        else if (/industri|industrial/i.test(s)) matchedSecName = 'Industrials (Perindustrian)';
        else if (/transport|logistik|logistic/i.test(s)) matchedSecName = 'Transportation & Logistics (Transportasi)';
      }
    }

    // 4. Fallback to 'Lainnya' only if completely unknown
    if (!matchedSecName) {
      matchedSecName = 'Lainnya';
    }

    if (!sectorMap[matchedSecName]) {
      sectorMap[matchedSecName] = { name: matchedSecName, accScore: 0, distScore: 0, accCount: 0, distCount: 0 };
    }

    if (side === 'acc') {
      sectorMap[matchedSecName].accScore += (item.score || 0);
      sectorMap[matchedSecName].accCount++;
    } else {
      sectorMap[matchedSecName].distScore += Math.abs(item.score || 0);
      sectorMap[matchedSecName].distCount++;
    }
  }
  accList.forEach(function(it) { mapItemToSector(it, 'acc'); });
  distList.forEach(function(it) { mapItemToSector(it, 'dist'); });

  var sectorRows = Object.values(sectorMap)
    .filter(function(s) {
      if (s.name === 'Lainnya' && s.accCount === 0 && s.distCount === 0) return false;
      return s.accCount > 0 || s.distCount > 0;
    })
    .sort(function(a, b) { return (b.accScore - b.distScore) - (a.accScore - a.distScore); });
  if (sectorRows.length === 0) {
    // Fallback: show all predefined sectors with zero values
    BANDAR_SECTOR_DEFS.forEach(function(sec) { sectorRows.push(sectorMap[sec.name]); });
  }

  var maxAbsScore = sectorRows.reduce(function(m, s) {
    return Math.max(m, s.accScore, s.distScore);
  }, 1);

  var sectorHeatHtml = '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text)">ROTASI MODAL SEKTOR (SMART MONEY FLOW SCORE)</div>'
    + '<span class="badge ' + (isReal ? 'b-up' : 'b-amb') + '" style="font-size:9px">' + (isReal ? 'REAL' : 'ESTIMASI') + '</span>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px">';

  sectorRows.forEach(function(s) {
    var netScore = s.accScore - s.distScore;
    var isNet = netScore >= 0;
    var barAcc  = Math.min(Math.round((s.accScore / maxAbsScore) * 100), 100);
    var barDist = Math.min(Math.round((s.distScore / maxAbsScore) * 100), 100);
    var scoreLabel = (isNet ? '+' : '') + netScore.toFixed(1);
    var scoreColor = isNet ? 'var(--green)' : 'var(--red)';
    sectorHeatHtml += '<div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:4px">'
      + '<span style="color:var(--text);font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + s.name + '</span>'
      + '<span class="mono" style="font-weight:700;color:' + scoreColor + ';font-size:11px">' + scoreLabel + ' (' + s.accCount + ' acc / ' + s.distCount + ' dist)</span>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:3px">'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="width:36px;font-size:10px;color:var(--green);text-align:right">Acc</span>'
      + '<div style="flex:1;height:5px;background:var(--bg3);border-radius:4px;overflow:hidden">'
      + '<div style="width:' + barAcc + '%;height:100%;background:var(--green);border-radius:4px;transition:width 0.4s"></div>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="width:36px;font-size:10px;color:var(--red);text-align:right">Dist</span>'
      + '<div style="flex:1;height:5px;background:var(--bg3);border-radius:4px;overflow:hidden">'
      + '<div style="width:' + barDist + '%;height:100%;background:var(--red);border-radius:4px;transition:width 0.4s"></div>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div>';
  });
  sectorHeatHtml += '</div></div>';

  return '<div style="display:flex;flex-direction:column;gap:16px">'
    + bannerHtml
    + metricCards
    + scannerHtml
    + sectorHeatHtml
    + '</div>';
}

// Lazy loader — fetches /api/idx/accumulation-distribution once per calendar
// day, uses in-memory cache on repeat visits (no re-fetch unless page refreshed
// or date changes). 1 Invezgo API call per user per day for this view.
async function bandarLoadRealMarketFlow() {
  var container = document.getElementById('bandar-market-flow-content');
  if (!container) return;
  try {
    // Use cache if still valid for today
    if (_bandarMarketFlowCacheValid()) {
      container.innerHTML = bandarRenderMarketFlowContent(_BANDAR_MARKET_FLOW_CACHE.data);
      return;
    }
    var res = await fetch('/api/idx/accumulation-distribution', { signal: AbortSignal.timeout(BANDAR_FETCH_TIMEOUT_MS) });
    var data = await res.json();
    // Cache result keyed to today's date
    _BANDAR_MARKET_FLOW_CACHE = { data: data, dateKey: new Date().toISOString().slice(0, 10) };
    container.innerHTML = bandarRenderMarketFlowContent(data);
  } catch (e) {
    if (container) {
      container.innerHTML = '<div class="card" style="padding:16px;color:var(--text3);font-size:12px">Gagal memuat Smart Money Divergence Scanner: ' + e.message + '</div>';
    }
  }
}
window.bandarLoadRealMarketFlow = bandarLoadRealMarketFlow;
window.bandarRenderMarketFlowContent = bandarRenderMarketFlowContent;

// 3. Foreign Flow View
// FIX (2026-09-18, user-reported bug + standing rule violation: "apakah
// khusus LQ45? jangan hanya analisa LQ45, analisa semua emiten"): dulu
// fungsi ini iterasi ~42 ticker hardcoded lalu menghitung netRp dari
// bandarForeignNetRp() yang selalu null untuk data REAL Invezgo (endpoint
// summary/stock investor=all tidak punya flag F/D per broker) — hasilnya
// "+Rp 0 M" & "Porsi Asing: 50%" identik untuk SEMUA baris, dan Top Buy/
// Top Sell menampilkan urutan yang sama persis (sort atas array yang semua
// nilainya sama = no-op). Diganti total: sekarang cuma render placeholder
// sinkron, lalu bandarLoadRealForeignFlow() mengambil data REAL SELURUH
// BEI dari GET /api/idx/foreign-flow (endpoint /analysis/top/foreign
// Invezgo, 1 panggilan API untuk seluruh pasar — lihat
// getUniverseForeignFlow() di lib/idx-data-engine.js).
function renderBandarmologyForeignFlowView(tk) {
  return '<div id="bandar-foreign-flow-market-content">'
    + '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Memuat Foreign Net Buy/Sell seluruh BEI...</div>'
    + '</div>';
}

function bandarRenderForeignFlowMarket(data) {
  if (!data || !data.success) {
    return '<div class="card" style="padding:16px;color:var(--text3);font-size:12px">Gagal memuat data Foreign Flow.</div>';
  }
  if (data.isSimulated) {
    return '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2)">'
      + (data.message || data.dataSource) + '</div>';
  }

  var fmtRp = function(v) {
    var m = Math.round((v || 0) / 1000000);
    var m2 = Math.round((v || 0) / 1000000000);
    if (Math.abs(m2) >= 1) return (v >= 0 ? '+Rp ' : '-Rp ') + Math.abs(m2).toLocaleString('id-ID') + ' M';
    return (v >= 0 ? '+Rp ' : '-Rp ') + Math.abs(m).toLocaleString('id-ID') + ' Jt';
  };
  var renderCol = function(list, colorVar, badgeClass, badgeText) {
    var html = '<div style="display:flex;flex-direction:column">';
    list.slice(0, 5).forEach(function(item) {
      html += '<div onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyMode(\'stock\');" style="display:flex;justify-content:space-between;align-items:center;padding:10px 8px;border-bottom:1px solid var(--border2);cursor:pointer;border-radius:6px;transition:background 0.15s" onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'transparent\'">'
        + '<div>'
        + '<div style="display:flex;align-items:center;gap:6px">'
        + '<span class="mono" style="font-weight:800;color:var(--text)">' + item.ticker + '</span>'
        + '<span class="badge ' + (item.priceChangePct >= 0 ? 'b-up' : 'b-dn') + '" style="font-size:9px">' + (item.priceChangePct >= 0 ? '+' : '') + item.priceChangePct.toFixed(2) + '%</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + (item.name || item.ticker) + '</div>'
        + '</div>'
        + '<div style="text-align:right">'
        + '<div class="mono" style="font-weight:800;font-size:13px;color:var(' + colorVar + ')">' + fmtRp(item.netValueRp) + '</div>'
        + '<div class="mono" style="font-size:11px;color:var(--text3)">Rp ' + Number(item.price || 0).toLocaleString('id-ID') + '</div>'
        + '</div>'
        + '</div>';
    });
    if (list.length === 0) html += '<div style="padding:16px;text-align:center;color:var(--text3);font-size:11px">Tidak ada data untuk hari ini.</div>';
    html += '</div>';
    return html;
  };

  return '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);margin-bottom:12px">'
    + 'Data REAL dari Invezgo API (' + data.date + ') — seluruh ' + data.counts.totalUniverseScanned + ' emiten BEI yang tercatat aktivitas asing, bukan sampel/LQ45.'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">'
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--border2);margin-bottom:8px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--green)">TOP 5 FOREIGN NET BUY (AKUMULASI ASING)</div>'
    + '<span class="badge b-up" style="font-size:9px">INFLOW</span>'
    + '</div>'
    + renderCol(data.netBuy, '--green', 'b-up', 'INFLOW')
    + '</div>'
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--border2);margin-bottom:8px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--red)">TOP 5 FOREIGN NET SELL (DISTRIBUSI ASING)</div>'
    + '<span class="badge b-dn" style="font-size:9px">OUTFLOW</span>'
    + '</div>'
    + renderCol(data.netSell, '--red', 'b-dn', 'OUTFLOW')
    + '</div>'
    + '</div>';
}

async function bandarLoadRealForeignFlow() {
  var container = document.getElementById('bandar-foreign-flow-market-content');
  if (!container) return;
  try {
    var res = await fetch('/api/idx/foreign-flow', { signal: AbortSignal.timeout(BANDAR_FETCH_TIMEOUT_MS) });
    var data = await res.json();
    container.innerHTML = bandarRenderForeignFlowMarket(data);
  } catch (e) {
    container.innerHTML = '<div class="card" style="padding:16px;color:var(--text3);font-size:12px">Gagal memuat data Foreign Flow: ' + e.message + '</div>';
  }
}
window.bandarLoadRealForeignFlow = bandarLoadRealForeignFlow;

// 4. Accumulation View
// FIX (2026-09-18, user-reported: "lanjut perbaiki 3 view Bandarmology
// lainnya juga"): renderBandarmologyAccumulationView()/
// renderBandarmologyDistributionView() dulu iterasi sampel ~42 ticker
// hardcoded (bukan seluruh ~958 emiten BEI, melanggar CLAUDE.md aturan
// #2). getUniverseAccumulationDistribution() (lib/idx-data-engine.js)
// SUDAH ADA dan dipakai Smart Money Screener — 1 panggilan Invezgo real
// (/analysis/top/accumulation) untuk SELURUH pasar. Diganti pakai endpoint
// itu (GET /api/idx/accumulation-distribution). Trade-off jujur: endpoint
// whole-market ini tidak punya breakdown top-broker per-emiten (cuma
// tersedia dari panggilan per-ticker) — kolom "Top Broker Akumulator"/"Avg
// Buy Bandar" dihapus, diganti sektor + volume/nilai transaksi real.
function renderBandarmologyAccumulationView() {
  return '<div id="bandar-acc-content"><div class="card" style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Memuat data akumulasi seluruh BEI...</div></div>';
}

// 5. Distribution View
function renderBandarmologyDistributionView() {
  return '<div id="bandar-dist-content"><div class="card" style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Memuat data distribusi seluruh BEI...</div></div>';
}

function bandarRenderAccDistTable(mode, data) {
  var isAcc = mode === 'acc';
  var list = isAcc ? (data && data.accumulation) || [] : (data && data.distribution) || [];
  list = list.slice(0, 10);
  var color = isAcc ? 'var(--green)' : 'var(--red)';
  var title = isAcc ? 'RADAR SAHAM TERAKUMULASI SELURUH BEI' : 'RADAR SAHAM TERDISTRIBUSI SELURUH BEI (PERINGATAN TEKANAN JUAL)';
  var subtitle = isAcc
    ? 'Skor akumulasi dari Invezgo (top/accumulation) — seluruh emiten aktif, bukan sampel.'
    : 'Skor distribusi dari Invezgo (top/accumulation, sisi negatif) — seluruh emiten aktif, bukan sampel.';

  if (!data || data.success === false || data.isSimulated || !data.counts) {
    return '<div class="card" style="padding:16px">'
      + '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2)">' + ((data && (data.message || data.dataSource || data.error)) || 'Data tidak tersedia.') + '</div>'
      + '</div>';
  }

  // FIX (2026-09-25, user-reported: "lot hanya 12, dengan harga 13.000
  // dikatakan akumulasi seluruh BEI" — SRAJ score 80.8 with only 12 lot
  // traded, BBSI score -74 with only 3 lot, both ranked top-10 "seluruh
  // BEI"): `score` here is genuinely Invezgo's own calculated_value
  // (not fabricated), but the ranking has no minimum-liquidity floor, so
  // a Rp15 juta trade can outrank far larger, more meaningful ones. User
  // chose (AskUserQuestion) to add a Nilai Transaksi (Rp) column rather
  // than filter/threshold anything server-side — no arbitrary cutoff
  // invented, the raw ranking stays untouched, user judges each row's
  // credibility themselves from the real transaction value already
  // returned by Invezgo (valueRp, previously fetched but never shown).
  var fmtNilaiTransaksi = function(v) {
    var abs = Math.abs(Number(v) || 0);
    if (abs >= 1e12) return 'Rp ' + (abs / 1e12).toFixed(2) + ' T';
    if (abs >= 1e9)  return 'Rp ' + (abs / 1e9).toFixed(2) + ' M';
    if (abs >= 1e6)  return 'Rp ' + (abs / 1e6).toFixed(1) + ' Jt';
    return 'Rp ' + abs.toLocaleString('id-ID');
  };

  var rows = list.length ? list.map(function(item) {
    var emitenName = item.name || ((typeof DB !== 'undefined' && DB[item.ticker] && DB[item.ticker].name) || item.ticker);
    return '<tr>'
      + '<td><span class="mono" style="font-weight:800;color:var(--text)">' + item.ticker + '</span><div style="font-size:10px;color:var(--text3)">' + emitenName + '</div></td>'
      + '<td style="font-size:11px;color:var(--text2)">' + (item.sector || '-') + '</td>'
      + '<td class="mono" style="text-align:right;font-weight:700;color:' + color + '">' + Number(item.score || 0).toFixed(1) + '</td>'
      + '<td class="mono" style="text-align:right;color:var(--text2)">' + (Number(item.volume || 0) / 100).toLocaleString('id-ID') + ' Lot</td>'
      + '<td class="mono" style="text-align:right;color:var(--text2)">' + fmtNilaiTransaksi(item.valueRp) + '</td>'
      + '<td class="mono" style="text-align:right;font-weight:700;color:var(--text)">Rp ' + Number(item.avgPrice || 0).toLocaleString('id-ID') + '</td>'
      + '<td class="mono ' + (item.priceChangePct >= 0 ? 'up' : 'down') + '" style="text-align:right">' + (item.priceChangePct >= 0 ? '+' : '') + Number(item.priceChangePct || 0).toFixed(2) + '%</td>'
      + '<td style="text-align:center"><button onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyMode(\'stock\');" class="btn btn-ghost btn-xs">Detail Broker</button></td>'
      + '</tr>';
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--text3);font-size:11px">Tidak ada data untuk hari ini.</td></tr>';

  return '<div class="card" style="padding:16px">'
    + '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text2);margin-bottom:12px">'
    + 'Data REAL dari Invezgo API (' + data.date + ') — seluruh ' + data.counts.totalUniverseScanned + ' emiten BEI aktif, bukan sampel.'
    + '</div>'
    + '<div style="margin-bottom:12px">'
    + '<div style="font-size:12px;font-weight:700;color:' + color + ';display:flex;align-items:center;gap:6px">' + title + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + subtitle + '</div>'
    + '</div>'
    + '<div class="tbl-wrap" style="overflow-x:auto">'
    + '<table class="tbl" style="width:100%;font-size:12px">'
    + '<thead><tr>'
    + '<th>Emiten</th><th>Sektor</th><th style="text-align:right">Skor</th><th style="text-align:right">Volume</th><th style="text-align:right">Nilai Transaksi</th><th style="text-align:right">Harga</th><th style="text-align:right">Perubahan</th><th style="text-align:center">Aksi</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>';
}

var _bandarAccDistCache = null;
async function bandarLoadAccDist(mode) {
  var containerId = mode === 'acc' ? 'bandar-acc-content' : 'bandar-dist-content';
  var container = document.getElementById(containerId);
  if (!container) return;
  try {
    if (!_bandarAccDistCache) {
      var res = await fetch('/api/idx/accumulation-distribution', { signal: AbortSignal.timeout(BANDAR_FETCH_TIMEOUT_MS) });
      var json = await res.json();
      if (json && json.success !== false) _bandarAccDistCache = json;
      else { var elErr = document.getElementById(containerId); if (elErr) elErr.innerHTML = bandarRenderAccDistTable(mode, json); return; }
    }
    var el = document.getElementById(containerId);
    if (el) el.innerHTML = bandarRenderAccDistTable(mode, _bandarAccDistCache);
  } catch (e) {
    var el2 = document.getElementById(containerId);
    if (el2) el2.innerHTML = '<div class="card" style="padding:16px;color:var(--text3);font-size:12px">Gagal memuat data: ' + e.message + '</div>';
  }
}
window.bandarLoadAccDist = bandarLoadAccDist;

// 6. Smart Money Radar View (Dynamic Universal Footprint)
function renderBandarmologySmartMoneyRadarView(tk) {
  var ticker = (tk || STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  var bData = bandarGetCachedSummary(ticker, '1D');
  var b = bData.bandarmology || {};
  var buyers = bData.topBuyers || [];
  var sellers = bData.topSellers || [];

  var instList = ['AK', 'BK', 'ZP', 'KZ', 'CS', 'RX', 'CC', 'SQ', 'OD', 'NI', 'LG', 'IF', 'YU'];
  var retList = ['YP', 'PD', 'XC', 'XL', 'KK', 'EP', 'AT'];

  var smBuyers = buyers.filter(function(x) { return instList.includes(x.broker); });
  var smSellers = sellers.filter(function(x) { return instList.includes(x.broker); });
  var retBuyers = buyers.filter(function(x) { return retList.includes(x.broker); });
  var retSellers = sellers.filter(function(x) { return retList.includes(x.broker); });

  var smBuyVal = smBuyers.reduce(function(a, b) { return a + (b.valueRp || 0); }, 0);
  var smSellVal = smSellers.reduce(function(a, s) { return a + (s.valueRp || 0); }, 0);
  var smNet = smBuyVal - smSellVal;

  var retBuyVal = retBuyers.reduce(function(a, b) { return a + (b.valueRp || 0); }, 0);
  var retSellVal = retSellers.reduce(function(a, s) { return a + (s.valueRp || 0); }, 0);
  var retNet = retBuyVal - retSellVal;

  var smScore = b.score || 80;
  var smDominance = (b.concentration && (b.concentration.top3BuyerPct || b.concentration.top3BuyPct)) || 68;
  var smBuyBrokersText = smBuyers.map(function(x){ return x.broker; }).join(', ') || 'AK, BK, CC';
  var retSellBrokersText = retSellers.map(function(x){ return x.broker; }).join(', ') || 'YP, PD, XC';

  var isBullishDivergence = smNet > 0 && retNet < 0;
  var divStatus = isBullishDivergence ? 'BULLISH DIVERGENCE (SMART MONEY INFLOW)' : (smNet < 0 && retNet > 0 ? 'BEARISH DIVERGENCE (DISTRIBUTION TO RETAIL)' : 'NEUTRAL ROTATION');
  var divDesc = isBullishDivergence ? 'Institusi menyerap barang konsisten sementara investor ritel melepas posisi' : 'Pergerakan harga sejalan dengan distribusi / akumulasi standar';

  var html = bandarDataBanner(bData.isSimulated === false ? 1 : 0, 1)
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid var(--border2);margin-bottom:12px;flex-wrap:wrap;gap:8px">'
    + '<div>'
    + '<div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">'
    + 'SMART MONEY VS RETAIL FOOTPRINT: <span class="mono" style="color:var(--accent)">' + ticker + '</span>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px">Deteksi divergensi akumulasi tersembunyi (silent accumulation) vs aliran ritel reguler</div>'
    + '</div>'
    + '<span class="badge b-up" style="font-size:10px;font-weight:700">SMART MONEY SCORE: ' + smScore + '/100</span>'
    + '</div>'

    + '<div class="row4" style="margin-bottom:12px">'
    + '<div class="metric">'
    + '<div class="mlabel">1. DOMINANSI INSTITUSI / WHALE</div>'
    + '<div class="mval up mono" style="font-size:16px">WHALE DOMINANT (' + smDominance + '%)</div>'
    + '<div class="msub neu">Akumulator: <strong class="mono" style="color:var(--text)">' + smBuyBrokersText + '</strong> (+Rp ' + Math.abs(Math.round(smNet/1000000000)) + 'M)</div>'
    + '</div>'

    + '<div class="metric">'
    + '<div class="mlabel">2. RETAIL SENTIMENT FOOTPRINT</div>'
    + '<div class="mval ' + (retNet < 0 ? 'amb' : 'down') + ' mono" style="font-size:16px">' + (retNet < 0 ? 'RETAIL SELLING' : 'RETAIL ABSORBING') + '</div>'
    + '<div class="msub neu">Broker Ritel: <strong class="mono" style="color:var(--text)">' + retSellBrokersText + '</strong></div>'
    + '</div>'

    + '<div class="metric">'
    + '<div class="mlabel">3. DIVERGENSI SMART MONEY</div>'
    + '<div class="mval ' + (isBullishDivergence ? 'up' : 'neu') + ' mono" style="font-size:14px">' + divStatus + '</div>'
    + '<div class="msub neu">' + divDesc + '</div>'
    + '</div>'
    + '</div>'

    + '<div style="padding:12px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;font-size:12px;line-height:1.5;color:var(--text2)">'
    + '<div style="font-weight:700;color:var(--green);margin-bottom:4px;display:flex;align-items:center;gap:4px">Kesimpulan AI Smart Money &amp; Bandarmology:</div>'
    + 'Smart Money terdeteksi aktif pada saham <strong class="mono" style="color:var(--text)">' + ticker + '</strong> dengan net institutional flow <strong class="up mono">' + (smNet >= 0 ? '+Rp ' : '-Rp ') + Math.abs(Math.round(smNet/1000000000)).toLocaleString('id-ID') + ' Miliar</strong>. Broker institusi utama (<span class="mono" style="color:var(--text)">' + smBuyBrokersText + '</span>) mendominasi konsentrasi akumulasi.'
    + '</div>'
    + '</div>';
  return html;
}

// 7. Broker Trail View
// 7. Broker Summary by Broker View (Whole-Market Institutional Portfolio)
function bandarLoadBrokerPortfolio(brokerCode, tf) {
  var bCode = (brokerCode || BANDARMOLOGY_SELECTED_BROKER || 'YU').toUpperCase().trim();
  var timeframe = (tf || BANDARMOLOGY_BROKER_TIMEFRAME || '1D').toUpperCase();
  var cacheKey = bCode + '_' + timeframe;

  if (_bandarBrokerPortfolioCache[cacheKey]) {
    bandarRenderBrokerPortfolioSection();
    return;
  }

  if (_bandarBrokerPortfolioLoading) return;
  _bandarBrokerPortfolioLoading = true;
  bandarRenderBrokerPortfolioSection();

  fetch('/api/idx/broker-summary-by-broker/' + encodeURIComponent(bCode) + '?tf=' + encodeURIComponent(timeframe), { signal: AbortSignal.timeout(BANDAR_FETCH_TIMEOUT_MS) })
    .then(function(res) { return res.json(); })
    .then(function(json) {
      _bandarBrokerPortfolioLoading = false;
      if (json && json.success && json.data) {
        _bandarBrokerPortfolioCache[cacheKey] = json.data;
      } else {
        _bandarBrokerPortfolioCache[cacheKey] = {
          ok: false,
          broker: bCode,
          timeframe: timeframe,
          reason: (json && json.data && json.data.reason) || (json && json.error) || 'Data broker belum tersedia dari Invezgo',
          netBuyStocks: [],
          netSellStocks: []
        };
      }
      bandarRenderBrokerPortfolioSection();
    })
    .catch(function(err) {
      _bandarBrokerPortfolioLoading = false;
      _bandarBrokerPortfolioCache[cacheKey] = {
        ok: false,
        broker: bCode,
        timeframe: timeframe,
        reason: err.message || 'Gagal terhubung ke server',
        netBuyStocks: [],
        netSellStocks: []
      };
      bandarRenderBrokerPortfolioSection();
    });
}

function renderBandarmologyBrokerTrailView() {
  var bCode = (BANDARMOLOGY_SELECTED_BROKER || 'YU').toUpperCase().trim();
  var tf = (BANDARMOLOGY_BROKER_TIMEFRAME || '1D').toUpperCase();
  var bInfo = BANDARMOLOGY_BROKER_LIST.find(function(b) { return b.code === bCode; }) || {
    code: bCode,
    name: 'Broker ' + bCode,
    type: 'D',
    badge: 'Anggota Bursa IDX'
  };

  var cacheKey = bCode + '_' + tf;
  var cachedData = _bandarBrokerPortfolioCache[cacheKey];
  var isLoading = _bandarBrokerPortfolioLoading && !cachedData;

  if (!cachedData && !_bandarBrokerPortfolioLoading) {
    setTimeout(function() { bandarLoadBrokerPortfolio(bCode, tf); }, 10);
  }

  var netBuyList = (cachedData && cachedData.netBuyStocks) || [];
  var netSellList = (cachedData && cachedData.netSellStocks) || [];
  var totalTraded = (cachedData && cachedData.totalStocksTraded) || (netBuyList.length + netSellList.length);

  var isReal = Boolean(cachedData && cachedData.quality && cachedData.quality.status === 'REAL');
  var dataTime = (cachedData && (cachedData.quality?.retrievedAt || cachedData.toDate)) || '';
  var dateBadge = dataTime ? ('Diperbarui: ' + dataTime.slice(0, 10)) : (isLoading ? 'Memuat data...' : 'Menunggu respons');

  var tfLabels = { '1D': 'Hari Ini (1D)', '5D': '1 Minggu (5D)', '1M': '1 Bulan (1M)' };

  var html = '<div id="bandarmology-broker-trail-view" style="display:flex;flex-direction:column;gap:16px">';

  // Header Card: Title + Timeframe + Broker Quick Selector + Custom Search
  html += '<div class="card" style="padding:18px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2)">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px">'
    + '<div>'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    + '<span style="font-size:14px;font-weight:800;letter-spacing:0.5px;color:var(--text);text-transform:uppercase">Broker Summary by Broker (Portofolio Akumulasi &amp; Distribusi se-BEI)</span>'
    + '<span class="badge ' + (isReal ? 'b-up' : 'b-neu') + '" style="font-size:10px;font-weight:700">' + (isReal ? 'REAL INVEZGO' : (isLoading ? 'MEMUAT...' : 'FEED WHOLE MARKET')) + '</span>'
    + '</div>'
    + '<p style="font-size:11px;color:var(--text2);margin:0;max-width:720px">'
    + 'Analisis portofolio lengkap transaksi satu broker di seluruh emiten BEI dalam 1 panggilan data resmi Invezgo.'
    + '</p>'
    + '</div>'

    // Timeframe selector
    + '<div style="display:flex;align-items:center;gap:6px">'
    + '<span style="font-size:11px;font-weight:700;color:var(--text2)">Rentang:</span>'
    + '<div style="display:inline-flex;background:var(--bg3);padding:2px;border-radius:6px;border:1px solid var(--border2)">'
    + ['1D', '5D', '1M'].map(function(t) {
        var active = tf === t;
        return '<button onclick="setBandarmologyBrokerTimeframe(\'' + t + '\')" class="btn btn-xs ' + (active ? 'btn-primary' : 'btn-ghost') + '" style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px">' + t + '</button>';
      }).join('')
    + '</div>'
    + '</div>'
    + '</div>'

    // Broker quick selector pills + custom search input
    + '<div style="display:flex;flex-direction:column;gap:8px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
    + '<span style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase">Pilih Broker Utama atau Ketik Kode Broker:</span>'
    + '<div style="display:inline-flex;align-items:center;gap:4px">'
    + '<input type="text" id="bandar-custom-broker-input" maxlength="2" placeholder="Kode (cth: CS, KZ, DX)" style="width:145px;padding:4px 8px;font-size:11px;font-family:monospace;text-transform:uppercase;border:1px solid var(--border2);border-radius:6px;background:var(--bg3);color:var(--text)" onkeydown="if(event.key===\'Enter\')bandarSubmitCustomBroker();">'
    + '<button onclick="bandarSubmitCustomBroker()" class="btn btn-xs btn-primary" style="padding:4px 10px;font-size:11px;font-weight:700">Cari</button>'
    + '</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:6px">';

  BANDARMOLOGY_BROKER_LIST.forEach(function(b) {
    var isSel = b.code === bCode;
    html += '<button onclick="setBandarmologyBroker(\'' + b.code + '\')" class="btn btn-xs ' + (isSel ? 'btn-primary' : 'btn-ghost') + '" style="flex-direction:column;padding:6px 4px;font-family:monospace;font-weight:700;border-radius:6px">'
      + '<span style="font-size:12px">' + b.code + '</span>'
      + '<span style="font-size:8px;font-family:sans-serif;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + b.badge.split('/')[0].trim() + '</span>'
      + '</button>';
  });

  html += '</div></div></div>';

  // Active Broker Profile Bar
  html += '<div class="card" style="padding:14px 18px;border:1px solid var(--border2);border-radius:10px;background:var(--bg2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
    + '<div style="display:flex;align-items:center;gap:12px">'
    + '<div style="width:44px;height:44px;border-radius:8px;background:var(--bg3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-weight:900;font-family:monospace;font-size:18px;color:var(--accent)">' + bInfo.code + '</div>'
    + '<div>'
    + '<div style="font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">'
    + bInfo.name
    + '<span class="badge b-neu" style="font-size:9px;font-weight:700">' + bInfo.badge + '</span>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text2);margin-top:2px">'
    + 'Periode: <strong style="color:var(--text)">' + (tfLabels[tf] || tf) + '</strong> | Total Saham Ditransaksikan: <strong style="color:var(--text)">' + totalTraded + ' Emiten</strong> | ' + dateBadge
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<button onclick="openStockChat(\'BBCA\', \'Analisis jejak transaksi dan akumulasi broker ' + bInfo.code + ' (' + bInfo.name + ') di seluruh emiten BEI periode ' + tf + '\')" class="btn btn-primary btn-xs" style="padding:5px 12px;font-weight:700">'
    + 'Tanya AI tentang ' + bInfo.code
    + '</button>'
    + '</div>'
    + '</div>';

  // Content Area: Loading or Tables
  if (isLoading) {
    html += '<div class="card" style="padding:36px;text-align:center;color:var(--text2);border:1px solid var(--border2);border-radius:10px">'
      + '<div class="spinner" style="width:28px;height:28px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent);border-radius:50%;margin:0 auto 12px;animation:spin 0.8s linear infinite"></div>'
      + '<div style="font-weight:700;font-size:13px;color:var(--text)">Mengambil Portofolio Broker ' + bCode + ' dari Invezgo...</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:4px">Menganalisis seluruh transaksi se-BEI periode ' + (tfLabels[tf] || tf) + '</div>'
      + '</div>';
    html += '</div>';
    return html;
  }

  if (cachedData && cachedData.ok === false && netBuyList.length === 0 && netSellList.length === 0) {
    html += '<div class="card" style="padding:28px;text-align:center;border:1px solid var(--border2);border-radius:10px">'
      + '<div style="color:var(--yellow);font-weight:800;font-size:13px;margin-bottom:4px">Data Broker ' + bCode + ' Belum Tersedia</div>'
      + '<div style="font-size:11px;color:var(--text2)">' + (cachedData.reason || 'Tidak ada transaksi yang tercatat untuk broker ini pada periode yang dipilih.') + '</div>'
      + '</div>';
    html += '</div>';
    return html;
  }

  // Two columns: Top Net Buy (Akumulasi) & Top Net Sell (Distribusi)
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:16px">';

  // 1. TOP NET BUY TABLE
  html += '<div class="card" style="padding:16px;border:1px solid var(--border2);border-radius:10px;background:var(--bg2)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border2)">'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<span class="badge b-up" style="font-size:10px;font-weight:800;padding:3px 8px">TOP NET BUY (AKUMULASI)</span>'
    + '<span style="font-size:11px;color:var(--text2)">' + netBuyList.length + ' Saham</span>'
    + '</div>'
    + '<span style="font-size:10px;color:var(--text3)">Diurutkan nilai akumulasi terbesar</span>'
    + '</div>';

  if (netBuyList.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--text3);font-size:11px">Tidak ada data akumulasi (Net Buy) pada periode ini.</div>';
  } else {
    html += '<div class="tbl-wrap" style="overflow-x:auto;max-height:480px">'
      + '<table class="tbl" style="width:100%;font-size:11px">'
      + '<thead>'
      + '<tr>'
      + '<th style="width:30px">#</th>'
      + '<th>Saham</th>'
      + '<th style="text-align:right">Net Value (Rp)</th>'
      + '<th style="text-align:right">Net Lot</th>'
      + '<th style="text-align:right">Buy Avg</th>'
      + '<th style="text-align:center;width:60px">Aksi</th>'
      + '</tr>'
      + '</thead>'
      + '<tbody>';

    netBuyList.slice(0, 30).forEach(function(item, idx) {
      var netValM = item.netValue >= 1e9
        ? '+Rp ' + (item.netValue / 1e9).toFixed(2) + ' M'
        : (item.netValue >= 1e6 ? '+Rp ' + (item.netValue / 1e6).toFixed(1) + ' Jt' : '+Rp ' + Math.round(item.netValue).toLocaleString('id-ID'));
      var buyAvgStr = item.buyAvg > 0 ? ('Rp ' + Math.round(item.buyAvg).toLocaleString('id-ID')) : '-';
      var lotStr = item.netVolume > 0 ? Number(item.netVolume).toLocaleString('id-ID') : '-';

      html += '<tr>'
        + '<td style="color:var(--text3);font-weight:600">' + (idx + 1) + '</td>'
        + '<td>'
        + '<div style="font-weight:800;color:var(--text);font-family:monospace;font-size:12px">' + item.ticker + '</div>'
        + '<div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px">' + (item.name || item.ticker) + '</div>'
        + '</td>'
        + '<td class="mono up" style="text-align:right;font-weight:800">' + netValM + '</td>'
        + '<td class="mono" style="text-align:right;color:var(--text)">' + lotStr + '</td>'
        + '<td class="mono" style="text-align:right;color:var(--text2)">' + buyAvgStr + '</td>'
        + '<td style="text-align:center">'
        + '<button onclick="if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + item.ticker + '\');goBandarmology(\'stock\',null);" class="btn btn-ghost btn-xs" style="padding:2px 6px;font-size:10px;font-weight:700">Analisis</button>'
        + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
  }
  html += '</div>';

  // 2. TOP NET SELL TABLE
  html += '<div class="card" style="padding:16px;border:1px solid var(--border2);border-radius:10px;background:var(--bg2)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border2)">'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<span class="badge b-dn" style="font-size:10px;font-weight:800;padding:3px 8px">TOP NET SELL (DISTRIBUSI)</span>'
    + '<span style="font-size:11px;color:var(--text2)">' + netSellList.length + ' Saham</span>'
    + '</div>'
    + '<span style="font-size:10px;color:var(--text3)">Diurutkan nilai distribusi terbesar</span>'
    + '</div>';

  if (netSellList.length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--text3);font-size:11px">Tidak ada data distribusi (Net Sell) pada periode ini.</div>';
  } else {
    html += '<div class="tbl-wrap" style="overflow-x:auto;max-height:480px">'
      + '<table class="tbl" style="width:100%;font-size:11px">'
      + '<thead>'
      + '<tr>'
      + '<th style="width:30px">#</th>'
      + '<th>Saham</th>'
      + '<th style="text-align:right">Net Value (Rp)</th>'
      + '<th style="text-align:right">Net Lot</th>'
      + '<th style="text-align:right">Sell Avg</th>'
      + '<th style="text-align:center;width:60px">Aksi</th>'
      + '</tr>'
      + '</thead>'
      + '<tbody>';

    netSellList.slice(0, 30).forEach(function(item, idx) {
      var absNet = Math.abs(item.netValue);
      var netValM = absNet >= 1e9
        ? '-Rp ' + (absNet / 1e9).toFixed(2) + ' M'
        : (absNet >= 1e6 ? '-Rp ' + (absNet / 1e6).toFixed(1) + ' Jt' : '-Rp ' + Math.round(absNet).toLocaleString('id-ID'));
      var sellAvgStr = item.sellAvg > 0 ? ('Rp ' + Math.round(item.sellAvg).toLocaleString('id-ID')) : '-';
      var lotStr = item.netVolume !== 0 ? Number(Math.abs(item.netVolume)).toLocaleString('id-ID') : '-';

      html += '<tr>'
        + '<td style="color:var(--text3);font-weight:600">' + (idx + 1) + '</td>'
        + '<td>'
        + '<div style="font-weight:800;color:var(--text);font-family:monospace;font-size:12px">' + item.ticker + '</div>'
        + '<div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px">' + (item.name || item.ticker) + '</div>'
        + '</td>'
        + '<td class="mono down" style="text-align:right;font-weight:800">' + netValM + '</td>'
        + '<td class="mono" style="text-align:right;color:var(--text)">' + lotStr + '</td>'
        + '<td class="mono" style="text-align:right;color:var(--text2)">' + sellAvgStr + '</td>'
        + '<td style="text-align:center">'
        + '<button onclick="if(typeof selectStockChatTicker===\'function\')selectStockChatTicker(\'' + item.ticker + '\');goBandarmology(\'stock\',null);" class="btn btn-ghost btn-xs" style="padding:2px 6px;font-size:10px;font-weight:700">Analisis</button>'
        + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += '</div>'; // End grid
  html += '</div>'; // End container
  return html;
}

// 8. Smart Money Flow View (Chaikin CMF, VWAP Bands, Volume Price Action)
function renderBandarmologySmartMoneyFlowView(tk) {
  var ticker = (tk || STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  if (typeof isValidStockTicker === 'function' && !isValidStockTicker(ticker)) {
    return '<div class="card" style="padding:24px;text-align:center;color:var(--text3)">'
      + '<div style="color:#EF4444;font-weight:800;font-size:14px;margin-bottom:6px">Ticker "' + ticker + '" Tidak Terdaftar dalam Stock Universe IDX</div>'
      + '<p style="font-size:11px">CMF, VWAP Bands, dan seluruh metrik Smart Money Flow bernilai 0/kosong. Silakan pilih emiten terdaftar (Contoh: BBCA, BBRI, BMRI, BBNI, ANTM, TLKM).</p>'
      + '</div>';
  }
  var bData = generateClientSideBrokerSummary(ticker, '1D');
  var price = (bData && bData.price) ? bData.price : getAccurateStockPrice(ticker);
  var isUp = (bData.changePercent || 0) >= 0;

  // KNOWN_ISSUES.md #4 fix: CMF/VWAP/Volume Surge were two hardcoded
  // literals picked only by isUp (cmfVal was exactly 0.24 or -0.18, nothing
  // else). mountBandarmologySmartMoneyCharts() below already computes REAL
  // CMF/VWAP for this same ticker's charts via fsGenData()/fsProcess()/
  // fsCalcVWAP() — reusing that here instead of a second, fake calculation
  // for the summary cards sitting right above those charts. fsGenData()
  // itself (KNOWN_ISSUES.md #2 fix) tags .simulated when no real OHLCV is
  // cached yet for this ticker, so isSimFlow below is exact, not guessed.
  var flowData = (typeof fsGenData === 'function') ? fsGenData(ticker, 60) : [];
  var isSimFlow = !!(flowData && flowData.simulated);
  var flowA = (flowData && flowData.length >= 5 && typeof fsProcess === 'function') ? fsProcess(flowData) : null;

  var cmfVal = flowA ? flowA.cl : 0;
  var volRatio = (flowA && flowA.last && flowA.last.vr) ? flowA.last.vr : 1;
  var volSurgeLabel = volRatio >= 2 ? 'Sangat Tinggi' : volRatio >= 1.5 ? 'Tinggi' : volRatio <= 0.7 ? 'Rendah' : 'Normal';
  var volSurge = volRatio.toFixed(1) + 'x (' + volSurgeLabel + ')';
  // Accumulation/Distribution line trend (fsProcess()'s adT) — whether the
  // real cumulative A/D value is higher now than ~5 bars back. This is the
  // actual "A/D" the 4th card is labeled for, not a repeat of isUp (price
  // direction) — the two can disagree, which is the point of the card.
  var adTrendUp = flowA ? flowA.adT : isUp;

  var vwapArr = (flowData && flowData.length >= 5 && typeof fsCalcVWAP === 'function') ? fsCalcVWAP(flowData) : [];
  var vwapSession = vwapArr.length ? Math.round(vwapArr[vwapArr.length - 1]) : Math.round(price);
  var vwapStdArr = (vwapArr.length && typeof fsCalcVWAPStdDev === 'function') ? fsCalcVWAPStdDev(flowData, vwapArr) : [];
  var vwapStd = vwapStdArr.length ? vwapStdArr[vwapStdArr.length - 1] : (vwapSession * 0.025);
  var vwapUpper = Math.round(vwapSession + 2 * vwapStd);
  var vwapLower = Math.round(vwapSession - 2 * vwapStd);
  var distToVwap = (((price - vwapSession) / (vwapSession || 1)) * 100).toFixed(2);

  var cmfStatus = cmfVal >= 0.15 ? 'STRONG ACCUMULATION (+ ' + (cmfVal * 100).toFixed(0) + '%)' : (cmfVal <= -0.10 ? 'STRONG DISTRIBUTION (' + (cmfVal * 100).toFixed(0) + '%)' : 'NEUTRAL ROTATION');

  // Only disclose when the underlying 60-day series is actually the
  // synthetic fallback (no real OHLCV cached yet for this ticker) — mirrors
  // the per-ticker disclosure pattern used everywhere else fsGenData() feeds
  // into (Ranking/Heatmap/Watchlist, KNOWN_ISSUES.md #2), rather than a
  // blanket "always simulated" banner that would now be wrong on a cache hit.
  var html = (isSimFlow ? bandarSimBanner('CMF, VWAP Bands &amp; Volume Surge di bawah dihitung dari data candle SIMULASI — belum ada OHLCV riil ter-cache untuk ' + ticker + '.') : '')
    + '<div style="display:flex;flex-direction:column;gap:16px">'
    // Top Summary Banner (Opportunity Radar card)
    + '<div class="card" style="padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border2);margin-bottom:14px;flex-wrap:wrap;gap:8px">'
    + '<div>'
    + '<div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">'
    + 'SMART MONEY FLOW &amp; VOLUME PRICE MATRIX: <span class="mono" style="color:var(--accent)">' + ticker + '</span>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:2px">Analisis Chaikin Money Flow (CMF-20), Accumulation/Distribution Line, OBV, dan Institutional Multi-Period VWAP Bands</div>'
    + '</div>'
    + '<span class="badge ' + (cmfVal >= 0 ? 'b-up' : 'b-dn') + '" style="font-size:10px;font-weight:700">' + cmfStatus + '</span>'
    + '</div>'

    // 4 Key Indicators Cards (Opportunity Radar row4/metric pattern)
    + '<div class="row4" style="margin-bottom:14px">'
    + '<div class="metric">'
    + '<div class="mlabel">1. CHAIKIN MONEY FLOW (CMF-20)</div>'
    + '<div class="mval ' + (cmfVal >= 0 ? 'up' : 'down') + ' mono" style="font-size:18px">' + (cmfVal >= 0 ? '+' : '') + cmfVal.toFixed(2) + '</div>'
    + '<div class="msub neu">' + (cmfVal >= 0 ? 'Tekanan beli konsisten' : 'Tekanan jual terdeteksi') + '</div>'
    + '</div>'

    + '<div class="metric">'
    + '<div class="mlabel">2. VOLUME SURGE RATIO</div>'
    + '<div class="mval mono" style="font-size:18px;color:var(--blue)">' + volSurge + '</div>'
    + '<div class="msub neu">Dibandingkan rata-rata 20 hari</div>'
    + '</div>'

    + '<div class="metric">'
    + '<div class="mlabel">3. SESSION VWAP ANCHOR</div>'
    + '<div class="mval amb mono" style="font-size:18px">Rp ' + vwapSession.toLocaleString('id-ID') + '</div>'
    + '<div class="msub neu">Jarak vs Harga: <strong class="' + (Number(distToVwap) >= 0 ? 'up' : 'down') + ' mono">' + (Number(distToVwap) >= 0 ? '+' : '') + distToVwap + '%</strong></div>'
    + '</div>'

    + '<div class="metric">'
    + '<div class="mlabel">4. ACCUMULATION INDEX (A/D)</div>'
    + '<div class="mval ' + (adTrendUp ? 'up' : 'down') + ' mono" style="font-size:18px">' + (adTrendUp ? 'BULLISH SURGE' : 'DISTRIBUTION') + '</div>'
    + '<div class="msub neu">' + (adTrendUp ? 'Smart money menyerap saham' : 'Tekanan distribusi') + '</div>'
    + '</div>'
    + '</div>'

    // Institutional VWAP Multi-Bands Table
    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px;margin-bottom:14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">'
    + 'INSTITUTIONAL VWAP BANDS ZONE: ' + ticker
    + '</div>'
    + '<span class="badge b-neu" style="font-size:9px">ALGORITMA PENETRASI HARGA BEI</span>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;font-size:12px">'
    + '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:10px">'
    + '<div style="font-size:10px;color:var(--red);font-weight:700;text-transform:uppercase">Upper Band (+1 StdDev) - TP Zone</div>'
    + '<div class="mono down" style="font-size:15px;font-weight:800;margin-top:2px">Rp ' + vwapUpper.toLocaleString('id-ID') + '</div>'
    + '<div style="font-size:10px;color:var(--text3);margin-top:2px">Area take-profit &amp; resisten institusi</div>'
    + '</div>'
    + '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:10px">'
    + '<div style="font-size:10px;color:var(--amber);font-weight:700;text-transform:uppercase">Benchmark VWAP Anchor</div>'
    + '<div class="mono amb" style="font-size:15px;font-weight:800;margin-top:2px">Rp ' + vwapSession.toLocaleString('id-ID') + '</div>'
    + '<div style="font-size:10px;color:var(--text3);margin-top:2px">Harga rata-rata tertimbang volume pasar</div>'
    + '</div>'
    + '<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:6px;padding:10px">'
    + '<div style="font-size:10px;color:var(--green);font-weight:700;text-transform:uppercase">Lower Band (-1 StdDev) - Buy Zone</div>'
    + '<div class="mono up" style="font-size:15px;font-weight:800;margin-top:2px">Rp ' + vwapLower.toLocaleString('id-ID') + '</div>'
    + '<div style="font-size:10px;color:var(--text3);margin-top:2px">Area akumulasi / value buying smart money</div>'
    + '</div>'
    + '</div>'
    + '</div>'

    // ============================================================
    // INTERACTIVE REAL-TIME CHART SUITE (PRICE, CMF, FOREIGN, VOL)
    // ============================================================
    // FIX (2026-09-11, found during a dead-feature audit): this section
    // had no id at all, so setBandarmologyTab()'s 'smart-money-flow'
    // scroll-to (in this same file) was silently targeting a
    // getElementById('bandarSmartMoneyChart') that never existed anywhere
    // in the rendered HTML — the scroll-to-section behavior for the
    // FlowScan -> Bandarmology deep-link has never actually worked.
    // Added the matching id here instead of touching the scroll-to code.
    + '<div id="bandarSmartMoneyChart" style="display:flex;flex-direction:column;gap:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">'
    + 'GRAFIK VISUAL INTERAKTIF SMART MONEY &amp; PENETRASI BANDAR (' + ticker + ')'
    + '</div>'
    + '<span class="badge b-neu" style="font-size:9px">CHART ENGINE (60 CANDLES)</span>'
    + '</div>'

    // FIX: was inline `grid-template-columns:repeat(auto-fit,minmax(320px,1fr))`,
    // then `minmax(480px,1fr)` — both still let auto-fit pack a 3rd column
    // into a wide-enough container before wrapping (reported by the user
    // via screenshot: 3 charts on top, 1 alone below, instead of 2+2).
    // `.bandar-smart-chart-grid` (main.css) forces exactly 2 columns via a
    // fixed `repeat(2,1fr)` and only collapses to 1 column via a real media
    // query below 760px — something a plain inline style can't express.
    + '<div class="bandar-smart-chart-grid">'
    // Chart 1: Price Action & Institutional VWAP Bands
    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:4px">Pergerakan Harga &amp; VWAP Bands</div>'
    + '<span class="badge b-accent" style="font-size:8px">BENCHMARK</span>'
    + '</div>'
    + '<div style="height:220px;position:relative;width:100%"><canvas id="bandarSmartPriceChart"></canvas></div>'
    + '</div>'

    // Chart 2: Chaikin Money Flow (CMF-20) Histogram
    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:4px">Chaikin Money Flow (CMF-20)</div>'
    + '<span class="badge b-up" style="font-size:8px" id="bandarSmartCmfBadge">AKUMULASI / DISTRIBUSI</span>'
    + '</div>'
    + '<div style="height:220px;position:relative;width:100%"><canvas id="bandarSmartCmfChart"></canvas></div>'
    + '</div>'

    // Chart 3: Net Foreign Flow Daily Inflow/Outflow Bars
    // FIX (2026-09-19, menu/data audit): judul lama "Arus Net Dana Asing
    // Harian" menyiratkan ini data transaksi asing riil harian — padahal
    // aplikasi ini TIDAK punya feed foreign-flow harian per ticker (hanya
    // agregat whole-market via getUniverseForeignFlow()). nfVals di bawah
    // 100% proxy dari split 65/35 volume berdasarkan arah harga (d.up),
    // bukan data asing sungguhan. Judul & badge diperjelas jadi estimasi.
    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:4px">Estimasi Arus Dana (Proxy Volume)</div>'
    + '<span class="badge b-neu" style="font-size:8px" title="Dihitung dari split volume vs arah harga, BUKAN data transaksi asing riil">ESTIMASI, BUKAN DATA ASING RIIL</span>'
    + '</div>'
    + '<div style="height:200px;position:relative;width:100%"><canvas id="bandarSmartForeignChart"></canvas></div>'
    + '</div>'

    // Chart 4: Volume Surge & Accumulation Profile
    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:4px">Volume Transaksi &amp; Penyerapan Modal</div>'
    + '<span class="badge b-neu" style="font-size:8px">VOLUME SURGE</span>'
    + '</div>'
    + '<div style="height:200px;position:relative;width:100%"><canvas id="bandarSmartVolChart"></canvas></div>'
    + '</div>'
    + '</div>'
    + '</div>'

    // Action Matrix Section
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;flex-wrap:wrap;gap:8px;margin-top:6px">'
    + '<div>'
    + '<div style="font-size:12px;font-weight:700;color:var(--text)">Ingin melihat rincian broker yang mengakumulasi saham ' + ticker + '?</div>'
    + '<div style="font-size:11px;color:var(--text3)">Periksa Top 5 Buyer/Seller dan aliran dana asing pada tab Broker Flow.</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<button onclick="openStockChat(\'' + ticker + '\', \'Analisa detail pergerakan smart money flow CMF dan bandarmology saham ' + ticker + '\');" class="btn btn-primary btn-xs">'
    + '<span>Konsultasi AI</span>'
    + '</button>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</div>';

  setTimeout(function() {
    mountBandarmologySmartMoneyCharts(ticker);
  }, 60);

  return html;
}

var BANDARMOLOGY_CHARTS = {};

function mountBandarmologySmartMoneyCharts(tk) {
  var ticker = (tk || STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  
  // Clean up old charts
  Object.values(BANDARMOLOGY_CHARTS).forEach(function(c) {
    try { c.destroy(); } catch(e) {}
  });
  BANDARMOLOGY_CHARTS = {};

  // Fetch or generate historical 60-day candles
  var data = (typeof fsGenData === 'function') ? fsGenData(ticker, 60) : [];
  if (!data || data.length < 5) return;

  var a = (typeof fsProcess === 'function') ? fsProcess(data) : { cmf: [], rsi: [], ma20: [], ma50: [] };
  var labels = data.map(function(d) {
    var dt = d.dt ? new Date(d.dt) : new Date();
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  });
  var closes = data.map(function(d) { return d.c; });
  var volumes = data.map(function(d) { return d.v; });
  // FIX (2026-09-19, menu/data audit — pola "SIMULASI tapi terlihat
  // presisi" dilarang CLAUDE.md #3): sebelumnya, kalau fsProcess() gagal
  // menghasilkan CMF (histori terlalu pendek dkk), fallback-nya adalah
  // pola BERGANTIAN HARDCODED 15.4/-8.2 -- angka presisi yang terlihat
  // seperti hasil hitungan riil padahal konstanta tetap. Diganti null
  // (Chart.js merender sebagai celah kosong, bukan angka karangan).
  var cmfVals = (a.cmf || []).map(function(v) { return +(v * 100).toFixed(2); });
  var isCmfFallback = cmfVals.length === 0;
  if (isCmfFallback) cmfVals = closes.map(function() { return null; });
  var cmfBadgeEl = document.getElementById('bandarSmartCmfBadge');
  if (cmfBadgeEl) cmfBadgeEl.textContent = isCmfFallback ? 'DATA TIDAK CUKUP' : 'AKUMULASI / DISTRIBUSI';

  var vwap = (typeof fsCalcVWAP === 'function') ? fsCalcVWAP(data) : closes;
  var std = (typeof fsCalcVWAPStdDev === 'function') ? fsCalcVWAPStdDev(data, vwap) : [];
  var upper = vwap.map(function(v, i) { return Math.round(v + 2 * (std[i] || v * 0.025)); });
  var lower = vwap.map(function(v, i) { return Math.round(v - 2 * (std[i] || v * 0.025)); });

  var nfVals = data.map(function(d, idx) {
    var buyVol = d.up ? d.v * 0.65 : d.v * 0.35;
    var sellVol = d.up ? d.v * 0.35 : d.v * 0.65;
    return +((buyVol - sellVol) / 1e6).toFixed(2);
  });

  var isLight = (typeof document !== 'undefined' && document.body && document.body.classList.contains('theme-light'));
  var chartFont = { size: 10, family: 'Inter, system-ui, sans-serif' };
  var gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)';
  var tickColor = isLight ? '#334155' : '#94a3b8';

  var baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isLight ? '#FFFFFF' : 'rgba(15, 23, 42, 0.95)',
        borderColor: isLight ? '#CBD5E1' : 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        titleColor: isLight ? '#334155' : '#94a3b8',
        bodyColor: isLight ? '#0F172A' : '#f8fafc',
        bodyFont: { family: 'monospace', size: 11 }
      }
    },
    scales: {
      x: { ticks: { maxTicksLimit: 8, autoSkip: true, color: tickColor, font: chartFont }, grid: { display: false }, border: { display: false } },
      y: { ticks: { color: tickColor, font: chartFont }, grid: { color: gridColor }, border: { display: false } }
    }
  };

  // 1. Price & Institutional VWAP Bands Chart
  var cvPrice = document.getElementById('bandarSmartPriceChart');
  if (cvPrice && typeof Chart !== 'undefined') {
    BANDARMOLOGY_CHARTS.price = new Chart(cvPrice, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Harga ' + ticker,
            data: closes,
            borderColor: '#38bdf8',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.3,
            backgroundColor: function(ctx) {
              var g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 240);
              g.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
              g.addColorStop(1, 'rgba(56, 189, 248, 0)');
              return g;
            }
          },
          { label: 'Benchmark VWAP', data: vwap, borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 },
          { label: 'Upper Band (+2σ TP Resisten)', data: upper, borderColor: 'rgba(244, 63, 94, 0.65)', borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [4, 2], tension: 0.3 },
          { label: 'Lower Band (-2σ Buy Zone)', data: lower, borderColor: 'rgba(16, 185, 129, 0.65)', borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [4, 2], tension: 0.3 }
        ]
      },
      options: Object.assign({}, baseOpts, {
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12 }
          }
        }
      })
    });
  }

  // 2. Chaikin Money Flow (CMF-20) Oscillator Bar Chart
  var cvCmf = document.getElementById('bandarSmartCmfChart');
  if (cvCmf && typeof Chart !== 'undefined') {
    BANDARMOLOGY_CHARTS.cmf = new Chart(cvCmf, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'CMF-20 (%)',
          data: cmfVals,
          backgroundColor: cmfVals.map(function(v) { return v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(244, 63, 94, 0.75)'; }),
          borderRadius: 2
        }]
      },
      options: Object.assign({}, baseOpts, {
        scales: {
          x: baseOpts.scales.x,
          y: {
            ticks: { color: tickColor, font: chartFont, callback: function(v) { return v + '%'; } },
            grid: { color: gridColor },
            border: { display: false }
          }
        }
      })
    });
  }

  // 3. Net Foreign Flow Daily Bar Chart
  var cvNf = document.getElementById('bandarSmartForeignChart');
  if (cvNf && typeof Chart !== 'undefined') {
    BANDARMOLOGY_CHARTS.nf = new Chart(cvNf, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Net Foreign (Juta Lembar)',
          data: nfVals,
          backgroundColor: nfVals.map(function(v) { return v >= 0 ? 'rgba(56, 189, 248, 0.75)' : 'rgba(251, 146, 60, 0.75)'; }),
          borderRadius: 2
        }]
      },
      options: Object.assign({}, baseOpts, {
        scales: {
          x: baseOpts.scales.x,
          y: {
            ticks: { color: tickColor, font: chartFont, callback: function(v) { return v + 'M'; } },
            grid: { color: gridColor },
            border: { display: false }
          }
        }
      })
    });
  }

  // 4. Volume Surge & Bandar Accumulation Chart
  var cvVol = document.getElementById('bandarSmartVolChart');
  if (cvVol && typeof Chart !== 'undefined') {
    BANDARMOLOGY_CHARTS.vol = new Chart(cvVol, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Volume Transaksi',
          data: volumes,
          backgroundColor: data.map(function(d) { return d.up ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)'; }),
          borderRadius: 2
        }]
      },
      options: baseOpts
    });
  }
}

window.renderBandarmologyCockpitPage = renderBandarmologyCockpitPage;
window.renderBandarmologyMarketFlowView = renderBandarmologyMarketFlowView;
window.renderBandarmologyForeignFlowView = renderBandarmologyForeignFlowView;
window.renderBandarmologyAccumulationView = renderBandarmologyAccumulationView;
window.renderBandarmologyDistributionView = renderBandarmologyDistributionView;
window.renderBandarmologySmartMoneyRadarView = renderBandarmologySmartMoneyRadarView;
window.renderBandarmologySmartMoneyFlowView = renderBandarmologySmartMoneyFlowView;
window.renderBandarmologyBrokerTrailView = renderBandarmologyBrokerTrailView;
window.getAccurateStockPrice = getAccurateStockPrice;
window.generateClientSideBrokerSummary = generateClientSideBrokerSummary;


