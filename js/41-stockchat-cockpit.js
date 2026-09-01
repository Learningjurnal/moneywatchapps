/**
 * 41-stockchat-cockpit.js — Money Watch Pro & StockChat Integration
 * 
 * Comprehensive StockChat Conversational AI & Bandarmology Broker Flow Cockpit:
 * 1. Full Broker Summary & Bandarmology Engine (Top Buyers vs Sellers, Concentration, Foreign Flow)
 * 2. Conversational Agentic Chat Interface (Gemini Function Calling Integration)
 * 3. Interactive Data Cards (Live Broker Flow, Real-time Quote, Valuation, Drawdown)
 * 4. Global Floating Modal & Quick Action Drawer
 */

var STOCKCHAT_CONVERSATION = [
  {
    role: 'assistant',
    text: 'Halo! Saya **StockChat AI & Bandarmology Analyst** di MoneyWatch Pro.\n\nSaya siap membantu Anda membedah **Broker Summary (Bandarmology)**, aliran dana asing (Foreign Flow), valuasi fundamental, kepemilikan KSEI >5%, serta simulasi risiko drawdown untuk seluruh saham Bursa Efek Indonesia (BEI).',
    toolCalls: []
  }
];

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
    title: '🔥 Broker Flow & Bandar',
    prompt: 'Tolong analisa Broker Summary dan Bandarmology saham BBCA hari ini. Siapa Top Buyer dan Top Seller, bagaimana Foreign Flow dan konsentrasinya?'
  },
  {
    title: '💼 Review Portofolio',
    prompt: 'Cek portofolio saya saat ini, bagaimana floating profit/loss, alokasi sektor, dan rasio kas RDN saya?'
  },
  {
    title: '💎 Valuasi & Fair Value',
    prompt: 'Bagaimana valuasi fundamental dan rasio keuangan saham BBRI saat ini? Apakah masih ada Margin of Safety (MoS)?'
  },
  {
    title: '🏛️ Free Float & KSEI',
    prompt: 'Cek struktur kepemilikan saham BMRI di KSEI. Berapa porsi institusi lokal vs asing dan berapa estimasi free float publik?'
  },
  {
    title: '📊 Simulasi Risk/Reward',
    prompt: 'Hitung proyeksi risiko dan drawdown jika saya beli saham ANTM di harga saat ini dengan target profit +15% dan stop loss -7%.'
  },
  {
    title: '💰 Pajak Dividen Bersih',
    prompt: 'Hitung simulasi penerimaan dividen bersih saham BBRI dengan DPS Rp 185 per lembar untuk 100 lot kepemilikan sesuai aturan pajak PPh Final.'
  },
  {
    title: '📅 Aksi Korporasi & Dividen',
    prompt: 'Tolong periksa jadwal aksi korporasi terdekat untuk saham ADRO, BBCA, dan ITMG. Berapa estimasi dividen per lembar (DPS) dan kapan batas cum-date nya?'
  }
];

// Fetch Broker Summary data from backend API
async function fetchBrokerSummaryData(ticker, timeframe) {
  var tf = timeframe || STOCKCHAT_TIMEFRAME || '1D';
  var tk = (ticker || STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase().replace(/\.JK$/i, '').trim();
  var cacheKey = tk + '_' + tf;

  try {
    var res = await fetch('/api/idx/broker-summary/' + encodeURIComponent(tk) + '?timeframe=' + encodeURIComponent(tf));
    var data = await res.json();
    if (data && data.success && data.data) {
      STOCKCHAT_BROKER_DATA_CACHE[cacheKey] = data.data;
      return data.data;
    }
  } catch (err) {
    console.warn('[StockChat] Error fetching broker summary for ' + tk + ':', err);
  }
  return null;
}

// Switch Active Tab (Chat vs Broker Flow)
function setStockChatActiveTab(tabName) {
  STOCKCHAT_ACTIVE_TAB = tabName || 'chat';
  renderStockChatPage();
  if (STOCKCHAT_ACTIVE_TAB === 'broker-flow') {
    loadAndRenderBrokerFlowTab();
  }
}

// Change Broker Summary Timeframe
function setStockChatTimeframe(tf) {
  STOCKCHAT_TIMEFRAME = tf || '1D';
  renderStockChatPage();
  if (STOCKCHAT_ACTIVE_TAB === 'broker-flow') {
    loadAndRenderBrokerFlowTab();
  }
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
    + '<svg class="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>'
    + '<div class="text-sm font-semibold text-slate-300">Menghubungkan ke Feed Transaksi BEI & Broker Summary untuk ' + tk + '...</div>'
    + '<div class="text-xs text-slate-500">Mengkalkulasi konsentrasi Top Buyer/Seller, Foreign Flow, dan Smart Money</div>'
    + '</div>';

  var data = await fetchBrokerSummaryData(tk, tf);
  STOCKCHAT_IS_LOADING_FLOW = false;
  if (data) {
    container.innerHTML = renderAggregatedBrokerFlowView(data);
  } else {
    container.innerHTML = '<div class="p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">'
      + '<div class="text-rose-400 font-bold text-sm">Gagal memuat Broker Summary untuk ' + tk + '</div>'
      + '<div class="text-xs text-slate-400">Pastikan kode saham terdaftar di BEI atau coba muat ulang kembali.</div>'
      + '<button onclick="loadAndRenderBrokerFlowTab()" class="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white">Coba Lagi 🔄</button>'
      + '</div>';
  }
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
  
  // Re-render only the broker flow content
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
function askAiAboutBrokerAction(brokerCode, brokerName, side, ticker, volumeLot, avgPrice, valueRp) {
  var tk = ticker || STOCKCHAT_SELECTED_TICKER || 'BBCA';
  var sideText = side === 'BUY' ? 'membeli (akumulasi)' : 'menjual (distribusi)';
  var valM = (Number(valueRp || 0) / 1000000000).toFixed(2);
  var prompt = 'Tolong analisa motif dan pola transaksi broker ' + brokerCode + ' (' + brokerName + ') yang tercatat ' + sideText + ' saham ' + tk + ' sebanyak ' + Number(volumeLot || 0).toLocaleString('id-ID') + ' lot senilai Rp ' + valM + ' Miliar di harga rata-rata Rp ' + Number(avgPrice || 0).toLocaleString('id-ID') + '. Apakah ini indikasi smart money atau aksi distribusi?';

  setStockChatActiveTab('chat');
  setTimeout(function() {
    sendStockChatPrompt(prompt);
  }, 150);
}

// Render the dedicated Aggregated Broker Flow View for Active Ticker
function renderAggregatedBrokerFlowView(data) {
  if (!data) return '<div class="p-6 text-center text-xs text-slate-400">Data broker summary tidak tersedia.</div>';

  var b = data.bandarmology || {};
  var conc = b.concentration || {};
  var ff = b.foreignFlow || {};
  var rm = b.retailVsSmartMoney || {};

  var verdictColor = b.verdict === 'BIG ACCUMULATION' ? 'text-emerald-400 bg-emerald-950/60 border-emerald-700/80 shadow-emerald-950/50' :
    (b.verdict === 'NORMAL ACCUMULATION' ? 'text-teal-400 bg-teal-950/60 border-teal-700/80 shadow-teal-950/50' :
    (b.verdict === 'BIG DISTRIBUTION' ? 'text-rose-400 bg-rose-950/60 border-rose-700/80 shadow-rose-950/50' :
    (b.verdict === 'NORMAL DISTRIBUTION' ? 'text-orange-400 bg-orange-950/60 border-orange-700/80 shadow-orange-950/50' : 'text-amber-400 bg-amber-950/60 border-amber-700/80 shadow-amber-950/50')));

  var netForeignM = Math.round((ff.netValRp || 0) / 1000000000);
  var netForeignBadge = netForeignM >= 0 
    ? '<span class="text-emerald-400 font-bold text-base">+Rp ' + netForeignM.toLocaleString('id-ID') + ' M</span>' 
    : '<span class="text-rose-400 font-bold text-base">-Rp ' + Math.abs(netForeignM).toLocaleString('id-ID') + ' M</span>';

  var topBuyerAvg = data.topBuyers && data.topBuyers[0] ? data.topBuyers[0].avgPrice : data.price;
  var topSellerAvg = data.topSellers && data.topSellers[0] ? data.topSellers[0].avgPrice : data.price;
  var buyerSpreadPct = (((data.price - topBuyerAvg) / topBuyerAvg) * 100).toFixed(2);

  var html = '<div class="space-y-5">'
    // Top Banner Card: Verdict & Key Averages
    + '<div class="p-5 rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 shadow-xl ' + (b.verdict.includes('ACCUM') ? 'border-emerald-800/60' : (b.verdict.includes('DISTRIB') ? 'border-rose-800/60' : 'border-slate-800')) + '">'
    + '<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">'
    + '<div class="space-y-1.5">'
    + '<div class="flex items-center gap-2.5 flex-wrap">'
    + '<span class="px-3 py-1 rounded-lg bg-blue-600/20 border border-blue-500/50 text-blue-300 font-black text-lg tracking-wider font-mono">' + data.ticker + '</span>'
    + '<span class="text-white font-black text-xl">Rp ' + Number(data.price || 0).toLocaleString('id-ID') + '</span>'
    + '<span class="text-xs px-2 py-0.5 rounded font-bold ' + ((data.changePercent || 0) >= 0 ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800' : 'bg-rose-950/60 text-rose-400 border border-rose-800') + '">'
    + ((data.changePercent || 0) >= 0 ? '+' : '') + Number(data.changePercent || 0).toFixed(2) + '%'
    + '</span>'
    + '<span class="px-3 py-1 rounded-full border text-xs font-black shadow-md ' + verdictColor + '">' + (b.verdict || 'NEUTRAL') + '</span>'
    + '<span class="text-xs px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-mono">Timeframe: ' + (data.timeframe || '1D') + '</span>'
    + '</div>'
    + '<p class="text-xs text-slate-300 max-w-3xl leading-relaxed">' + (b.interpretation || 'Arus transaksi broker terpantau berimbang.') + '</p>'
    + '</div>'
    + '<div class="flex items-center gap-2 shrink-0">'
    + '<button onclick="askAiAboutCurrentBrokerFlow(\'' + data.ticker + '\')" class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/20 transition flex items-center gap-2">'
    + '<span>💬 Konsultasikan Flow Ini ke AI</span>'
    + '</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  // 4 Main Aggregated Metrics Cards Grid (Visualization)
  html += '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">'
    // Card 1: Volume & Turnover
    + '<div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-1.5">'
    + '<div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center justify-between">'
    + '<span>Total Turnover (' + (data.timeframe || '1D') + ')</span>'
    + '<span class="text-slate-500">💰</span>'
    + '</div>'
    + '<div class="text-lg font-black text-white">Rp ' + Math.round((data.totalValueRp || 0) / 1000000000).toLocaleString('id-ID') + ' M</div>'
    + '<div class="text-[11px] text-slate-400 font-mono">' + Number(data.totalVolumeLot || 0).toLocaleString('id-ID') + ' Lot Traded</div>'
    + '</div>'

    // Card 2: Foreign Flow
    + '<div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-1.5">'
    + '<div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center justify-between">'
    + '<span>Net Foreign Flow (Asing)</span>'
    + '<span class="text-slate-500">🌐</span>'
    + '</div>'
    + '<div>' + netForeignBadge + '</div>'
    + '<div class="text-[11px] text-slate-400">Partisipasi Asing: <span class="font-bold text-slate-200">' + (ff.participationPct || 0) + '%</span></div>'
    + '</div>'

    // Card 3: Bandar Average Price
    + '<div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-1.5">'
    + '<div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center justify-between">'
    + '<span>Top 1 Buyer Avg Price</span>'
    + '<span class="text-slate-500">🎯</span>'
    + '</div>'
    + '<div class="text-lg font-black text-sky-400">Rp ' + Number(topBuyerAvg || 0).toLocaleString('id-ID') + '</div>'
    + '<div class="text-[11px] text-slate-400">Spread vs Harga: <span class="' + (buyerSpreadPct >= 0 ? 'text-emerald-400' : 'text-rose-400') + ' font-semibold">' + (buyerSpreadPct >= 0 ? '+' : '') + buyerSpreadPct + '%</span></div>'
    + '</div>'

    // Card 4: Smart Money vs Retail
    + '<div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-1.5">'
    + '<div class="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center justify-between">'
    + '<span>Smart Money Dynamics</span>'
    + '<span class="text-slate-500">🏦</span>'
    + '</div>'
    + '<div class="text-xs font-black ' + ((rm.smartMoneyNetValRp || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400') + '">' + (rm.smartMoneyStatus || 'INFLOW') + '</div>'
    + '<div class="text-[11px] text-slate-400 truncate" title="' + (rm.retailStatus || '') + '">' + (rm.retailStatus || 'Retail Outflow') + '</div>'
    + '</div>'
    + '</div>';

  // Concentration Progress Meters Card
  html += '<div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3">'
    + '<div class="flex items-center justify-between flex-wrap gap-2">'
    + '<div class="text-xs font-bold text-slate-200 flex items-center gap-2">'
    + '<span>⚖️ Rasio Konsentrasi Akumulasi (Buyers) vs Distribusi (Sellers)</span>'
    + '<span class="px-2 py-0.5 rounded text-[10px] font-bold ' + (conc.top3BuyPct >= 60 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : (conc.top3SellPct >= 60 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-slate-800 text-slate-400')) + '">' + (conc.status || 'NORMAL SPREAD') + '</span>'
    + '</div>'
    + '<div class="text-[11px] text-slate-400">Data Feed: <strong class="text-sky-300">IDX Real-Time / EOD Bandarmology</strong></div>'
    + '</div>'

    + '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">'
    // Top 1 Meter
    + '<div class="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 space-y-1.5">'
    + '<div class="flex justify-between text-xs font-medium">'
    + '<span class="text-emerald-400 font-bold">Top 1 Buy: ' + (conc.top1BuyPct || 0) + '%</span>'
    + '<span class="text-rose-400 font-bold">Top 1 Sell: ' + (conc.top1SellPct || 0) + '%</span>'
    + '</div>'
    + '<div class="w-full bg-rose-950/60 rounded-full h-2 overflow-hidden flex">'
    + '<div class="bg-emerald-500 h-2 transition-all duration-500" style="width:' + Math.min(conc.top1BuyPct || 50, 100) + '%"></div>'
    + '</div>'
    + '</div>'

    // Top 3 Meter
    + '<div class="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 space-y-1.5">'
    + '<div class="flex justify-between text-xs font-medium">'
    + '<span class="text-emerald-400 font-bold">Top 3 Buy: ' + (conc.top3BuyPct || 0) + '%</span>'
    + '<span class="text-rose-400 font-bold">Top 3 Sell: ' + (conc.top3SellPct || 0) + '%</span>'
    + '</div>'
    + '<div class="w-full bg-rose-950/60 rounded-full h-2 overflow-hidden flex">'
    + '<div class="bg-emerald-500 h-2 transition-all duration-500" style="width:' + Math.min(conc.top3BuyPct || 50, 100) + '%"></div>'
    + '</div>'
    + '</div>'

    // Top 5 Meter
    + '<div class="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 space-y-1.5">'
    + '<div class="flex justify-between text-xs font-medium">'
    + '<span class="text-emerald-400 font-bold">Top 5 Buy: ' + (conc.top5BuyPct || 0) + '%</span>'
    + '<span class="text-rose-400 font-bold">Top 5 Sell: ' + (conc.top5SellPct || 0) + '%</span>'
    + '</div>'
    + '<div class="w-full bg-rose-950/60 rounded-full h-2 overflow-hidden flex">'
    + '<div class="bg-emerald-500 h-2 transition-all duration-500" style="width:' + Math.min(conc.top5BuyPct || 50, 100) + '%"></div>'
    + '</div>'
    + '</div>'

    + '</div></div>';

  // ==========================================
  // SORTABLE TABLES: Top 5 Buying vs Selling
  // ==========================================
  var rawBuyers = data.topBuyers || [];
  var rawSellers = data.topSellers || [];

  // Filter if needed
  if (STOCKCHAT_BROKER_FILTER === 'F') {
    rawBuyers = rawBuyers.filter(function(x) { return x.type === 'F'; });
    rawSellers = rawSellers.filter(function(x) { return x.type === 'F'; });
  } else if (STOCKCHAT_BROKER_FILTER === 'D') {
    rawBuyers = rawBuyers.filter(function(x) { return x.type !== 'F'; });
    rawSellers = rawSellers.filter(function(x) { return x.type !== 'F'; });
  }

  // Sort lists
  var sortedBuyers = sortBrokerList(rawBuyers, STOCKCHAT_BUYERS_SORT);
  var sortedSellers = sortBrokerList(rawSellers, STOCKCHAT_SELLERS_SORT);

  // Slice by active limit (default Top 5)
  var limit = STOCKCHAT_TABLE_LIMIT || 5;
  var displayBuyers = sortedBuyers.slice(0, limit);
  var displaySellers = sortedSellers.slice(0, limit);

  // Helper for sort header label & arrow
  function renderSortHeader(tableType, field, label, align) {
    var activeSort = tableType === 'buyers' ? STOCKCHAT_BUYERS_SORT : STOCKCHAT_SELLERS_SORT;
    var isActive = activeSort.field === field;
    var arrow = isActive ? (activeSort.order === 'asc' ? ' ▲' : ' ▼') : ' ↕';
    var alignmentClass = align === 'right' ? 'text-right justify-end' : (align === 'center' ? 'text-center justify-center' : 'text-left justify-start');
    var activeClass = isActive ? (tableType === 'buyers' ? 'text-emerald-300 font-bold bg-emerald-950/40' : 'text-rose-300 font-bold bg-rose-950/40') : 'text-slate-400 hover:text-slate-200';

    return '<th onclick="toggleStockChatTableSort(\'' + tableType + '\', \'' + field + '\')" class="p-2.5 cursor-pointer select-none transition ' + activeClass + '" title="Klik untuk mengurutkan berdasarkan ' + label + '">'
      + '<div class="flex items-center gap-1 ' + alignmentClass + '">'
      + '<span>' + label + '</span>'
      + '<span class="text-[10px] font-mono opacity-80">' + arrow + '</span>'
      + '</div>'
      + '</th>';
  }

  // Calculate subtotals for the displayed Top N
  var buyerSubtotalLot = displayBuyers.reduce(function(acc, x) { return acc + (x.volumeLot || 0); }, 0);
  var buyerSubtotalVal = displayBuyers.reduce(function(acc, x) { return acc + (x.valueRp || 0); }, 0);
  var buyerSubtotalPct = displayBuyers.reduce(function(acc, x) { return acc + (x.pctOfTurnover || 0); }, 0);
  var buyerWeightedAvg = buyerSubtotalLot > 0 ? Math.round(buyerSubtotalVal / (buyerSubtotalLot * 100)) : 0;

  var sellerSubtotalLot = displaySellers.reduce(function(acc, x) { return acc + (x.volumeLot || 0); }, 0);
  var sellerSubtotalVal = displaySellers.reduce(function(acc, x) { return acc + (x.valueRp || 0); }, 0);
  var sellerSubtotalPct = displaySellers.reduce(function(acc, x) { return acc + (x.pctOfTurnover || 0); }, 0);
  var sellerWeightedAvg = sellerSubtotalLot > 0 ? Math.round(sellerSubtotalVal / (sellerSubtotalLot * 100)) : 0;

  // Header Controls for Sortable Table Section
  html += '<div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">'
    + '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">'
    + '<div>'
    + '<div class="text-sm font-black text-white flex items-center gap-2">'
    + '<span>📊 Top ' + limit + ' Buying vs Top ' + limit + ' Selling Brokers (' + data.ticker + ')</span>'
    + '<span class="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">Sortable Table</span>'
    + '</div>'
    + '<p class="text-[11px] text-slate-400 mt-0.5">Klik pada header kolom tabel mana saja untuk menyortir (Volume, Nilai Rp, Avg Price, % Turnover, Rank).</p>'
    + '</div>'

    + '<div class="flex items-center gap-2.5 flex-wrap">'
    // Limit Toggle (Top 5 / Top 10)
    + '<div class="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">'
    + '<span class="text-slate-400 text-[10px] font-semibold px-1">Tampilkan:</span>'
    + '<button onclick="setStockChatTableLimit(5)" class="px-2.5 py-1 rounded font-bold transition ' + (limit === 5 ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white') + '">Top 5</button>'
    + '<button onclick="setStockChatTableLimit(10)" class="px-2.5 py-1 rounded font-bold transition ' + (limit === 10 ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white') + '">Top 10</button>'
    + '</div>'

    // Filter Toggle (All / Foreign / Domestic)
    + '<div class="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">'
    + '<span class="text-slate-400 text-[10px] font-semibold px-1">Tipe:</span>'
    + '<button onclick="setStockChatBrokerFilter(\'ALL\')" class="px-2 py-1 rounded font-bold transition ' + (STOCKCHAT_BROKER_FILTER === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white') + '">Semua</button>'
    + '<button onclick="setStockChatBrokerFilter(\'F\')" class="px-2 py-1 rounded font-bold transition ' + (STOCKCHAT_BROKER_FILTER === 'F' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white') + '">Asing (F)</button>'
    + '<button onclick="setStockChatBrokerFilter(\'D\')" class="px-2 py-1 rounded font-bold transition ' + (STOCKCHAT_BROKER_FILTER === 'D' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white') + '">Domestik</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  // Dual Sortable Tables Grid
  html += '<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">'

    // ================= TABLE 1: TOP BUYERS =================
    + '<div class="rounded-xl border border-emerald-900/40 bg-slate-950/70 overflow-hidden shadow-md flex flex-col justify-between">'
    + '<div>'
    + '<div class="bg-gradient-to-r from-emerald-950/80 to-slate-900 p-3 border-b border-emerald-900/50 flex items-center justify-between">'
    + '<div class="flex items-center gap-2">'
    + '<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>'
    + '<span class="font-black text-xs text-emerald-400 tracking-wider">TOP ' + limit + ' BUYING BROKERS (AKUMULASI)</span>'
    + '</div>'
    + '<span class="text-[10px] text-emerald-300/80 font-mono">Sort: ' + STOCKCHAT_BUYERS_SORT.field.toUpperCase() + ' (' + STOCKCHAT_BUYERS_SORT.order.toUpperCase() + ')</span>'
    + '</div>'

    + '<div class="overflow-x-auto">'
    + '<table class="w-full text-left text-[11px] border-collapse">'
    + '<thead class="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">'
    + '<tr>'
    + renderSortHeader('buyers', 'rank', '#', 'center')
    + renderSortHeader('buyers', 'broker', 'Broker', 'left')
    + renderSortHeader('buyers', 'volumeLot', 'Volume (Lot)', 'right')
    + renderSortHeader('buyers', 'valueRp', 'Nilai (Rp)', 'right')
    + renderSortHeader('buyers', 'avgPrice', 'Avg Price', 'right')
    + renderSortHeader('buyers', 'pctOfTurnover', '% Share', 'right')
    + '<th class="p-2.5 text-center text-slate-500">Tanya</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody class="divide-y divide-slate-800/60">';

  if (displayBuyers.length === 0) {
    html += '<tr><td colspan="7" class="p-6 text-center text-slate-500 text-xs">Tidak ada data broker pembeli yang cocok dengan filter.</td></tr>';
  } else {
    displayBuyers.forEach(function(bItem) {
      var isF = bItem.type === 'F';
      var valM = (bItem.valueRp / 1000000000).toFixed(2);
      var priceSpread = data.price ? (((data.price - bItem.avgPrice) / bItem.avgPrice) * 100).toFixed(1) : 0;
      var priceSpreadHtml = Number(priceSpread) >= 0 
        ? '<span class="text-[9px] text-emerald-400 ml-1 font-semibold">+' + priceSpread + '%</span>'
        : '<span class="text-[9px] text-rose-400 ml-1 font-semibold">' + priceSpread + '%</span>';

      html += '<tr class="hover:bg-slate-800/50 transition group">'
        // Rank
        + '<td class="p-2.5 text-center font-mono font-bold text-slate-400 text-[10px]">' + bItem.rank + '</td>'
        // Broker Code & Info
        + '<td class="p-2.5">'
        + '<div class="flex items-center gap-1.5">'
        + '<span class="font-black font-mono px-2 py-0.5 rounded text-xs ' + (isF ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60' : 'bg-slate-800 text-slate-200 border border-slate-700/60') + '">' + bItem.broker + '</span>'
        + '<div class="min-w-0">'
        + '<div class="text-slate-200 font-semibold truncate text-[11px] max-w-[110px]" title="' + bItem.name + '">' + bItem.name.replace(/ Sekuritas.*/i, '') + '</div>'
        + '<div class="text-[9px] text-slate-400 truncate">' + (bItem.category || (isF ? 'Foreign' : 'Domestic')) + '</div>'
        + '</div>'
        + '</div>'
        + '</td>'
        // Volume
        + '<td class="p-2.5 text-right font-mono font-bold text-slate-200">' + Number(bItem.volumeLot || 0).toLocaleString('id-ID') + '</td>'
        // Value
        + '<td class="p-2.5 text-right font-mono font-bold text-emerald-400">Rp ' + valM + ' M</td>'
        // Avg Price
        + '<td class="p-2.5 text-right font-mono text-slate-200">Rp ' + Number(bItem.avgPrice || 0).toLocaleString('id-ID') + priceSpreadHtml + '</td>'
        // % Turnover
        + '<td class="p-2.5 text-right">'
        + '<div class="font-mono font-bold text-slate-200 text-xs">' + Number(bItem.pctOfTurnover || 0).toFixed(1) + '%</div>'
        + '<div class="w-16 bg-slate-800 rounded-full h-1 mt-1 ml-auto overflow-hidden">'
        + '<div class="bg-emerald-500 h-1 rounded-full" style="width:' + Math.min(bItem.pctOfTurnover * 2.5, 100) + '%"></div>'
        + '</div>'
        + '</td>'
        // Action (Ask AI)
        + '<td class="p-2.5 text-center">'
        + '<button onclick="askAiAboutBrokerAction(\'' + bItem.broker + '\', \'' + bItem.name.replace(/'/g, '') + '\', \'BUY\', \'' + data.ticker + '\', ' + bItem.volumeLot + ', ' + bItem.avgPrice + ', ' + bItem.valueRp + ')" class="p-1 rounded bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition" title="Tanya AI tentang broker ini">💬</button>'
        + '</td>'
        + '</tr>';
    });
  }

  html += '</tbody></table></div></div>'

    // Buyer Table Footer / Subtotals
    + '<div class="bg-slate-900/90 p-3 border-t border-emerald-900/40 text-[11px] flex items-center justify-between flex-wrap gap-2">'
    + '<div class="text-slate-400 font-semibold">Subtotal Top ' + displayBuyers.length + ' Buyers:</div>'
    + '<div class="flex items-center gap-3 font-mono text-xs flex-wrap">'
    + '<span><strong class="text-white">' + buyerSubtotalLot.toLocaleString('id-ID') + '</strong> lot</span>'
    + '<span><strong class="text-emerald-400">Rp ' + (buyerSubtotalVal / 1000000000).toFixed(2) + ' M</strong> (' + buyerSubtotalPct.toFixed(1) + '%)</span>'
    + '<span>Avg: <strong class="text-sky-300">Rp ' + buyerWeightedAvg.toLocaleString('id-ID') + '</strong></span>'
    + '</div>'
    + '</div>'
    + '</div>'

    // ================= TABLE 2: TOP SELLERS =================
    + '<div class="rounded-xl border border-rose-900/40 bg-slate-950/70 overflow-hidden shadow-md flex flex-col justify-between">'
    + '<div>'
    + '<div class="bg-gradient-to-r from-rose-950/80 to-slate-900 p-3 border-b border-rose-900/50 flex items-center justify-between">'
    + '<div class="flex items-center gap-2">'
    + '<span class="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-sm shadow-rose-400/50"></span>'
    + '<span class="font-black text-xs text-rose-400 tracking-wider">TOP ' + limit + ' SELLING BROKERS (DISTRIBUSI)</span>'
    + '</div>'
    + '<span class="text-[10px] text-rose-300/80 font-mono">Sort: ' + STOCKCHAT_SELLERS_SORT.field.toUpperCase() + ' (' + STOCKCHAT_SELLERS_SORT.order.toUpperCase() + ')</span>'
    + '</div>'

    + '<div class="overflow-x-auto">'
    + '<table class="w-full text-left text-[11px] border-collapse">'
    + '<thead class="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">'
    + '<tr>'
    + renderSortHeader('sellers', 'rank', '#', 'center')
    + renderSortHeader('sellers', 'broker', 'Broker', 'left')
    + renderSortHeader('sellers', 'volumeLot', 'Volume (Lot)', 'right')
    + renderSortHeader('sellers', 'valueRp', 'Nilai (Rp)', 'right')
    + renderSortHeader('sellers', 'avgPrice', 'Avg Price', 'right')
    + renderSortHeader('sellers', 'pctOfTurnover', '% Share', 'right')
    + '<th class="p-2.5 text-center text-slate-500">Tanya</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody class="divide-y divide-slate-800/60">';

  if (displaySellers.length === 0) {
    html += '<tr><td colspan="7" class="p-6 text-center text-slate-500 text-xs">Tidak ada data broker penjual yang cocok dengan filter.</td></tr>';
  } else {
    displaySellers.forEach(function(sItem) {
      var isF = sItem.type === 'F';
      var valM = (sItem.valueRp / 1000000000).toFixed(2);
      var priceSpread = data.price ? (((data.price - sItem.avgPrice) / sItem.avgPrice) * 100).toFixed(1) : 0;
      var priceSpreadHtml = Number(priceSpread) >= 0 
        ? '<span class="text-[9px] text-emerald-400 ml-1 font-semibold">+' + priceSpread + '%</span>'
        : '<span class="text-[9px] text-rose-400 ml-1 font-semibold">' + priceSpread + '%</span>';

      html += '<tr class="hover:bg-slate-800/50 transition group">'
        // Rank
        + '<td class="p-2.5 text-center font-mono font-bold text-slate-400 text-[10px]">' + sItem.rank + '</td>'
        // Broker Code & Info
        + '<td class="p-2.5">'
        + '<div class="flex items-center gap-1.5">'
        + '<span class="font-black font-mono px-2 py-0.5 rounded text-xs ' + (isF ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60' : 'bg-slate-800 text-slate-200 border border-slate-700/60') + '">' + sItem.broker + '</span>'
        + '<div class="min-w-0">'
        + '<div class="text-slate-200 font-semibold truncate text-[11px] max-w-[110px]" title="' + sItem.name + '">' + sItem.name.replace(/ Sekuritas.*/i, '') + '</div>'
        + '<div class="text-[9px] text-slate-400 truncate">' + (sItem.category || (isF ? 'Foreign' : 'Domestic')) + '</div>'
        + '</div>'
        + '</div>'
        + '</td>'
        // Volume
        + '<td class="p-2.5 text-right font-mono font-bold text-slate-200">' + Number(sItem.volumeLot || 0).toLocaleString('id-ID') + '</td>'
        // Value
        + '<td class="p-2.5 text-right font-mono font-bold text-rose-400">Rp ' + valM + ' M</td>'
        // Avg Price
        + '<td class="p-2.5 text-right font-mono text-slate-200">Rp ' + Number(sItem.avgPrice || 0).toLocaleString('id-ID') + priceSpreadHtml + '</td>'
        // % Turnover
        + '<td class="p-2.5 text-right">'
        + '<div class="font-mono font-bold text-slate-200 text-xs">' + Number(sItem.pctOfTurnover || 0).toFixed(1) + '%</div>'
        + '<div class="w-16 bg-slate-800 rounded-full h-1 mt-1 ml-auto overflow-hidden">'
        + '<div class="bg-rose-500 h-1 rounded-full" style="width:' + Math.min(sItem.pctOfTurnover * 2.5, 100) + '%"></div>'
        + '</div>'
        + '</td>'
        // Action (Ask AI)
        + '<td class="p-2.5 text-center">'
        + '<button onclick="askAiAboutBrokerAction(\'' + sItem.broker + '\', \'' + sItem.name.replace(/'/g, '') + '\', \'SELL\', \'' + data.ticker + '\', ' + sItem.volumeLot + ', ' + sItem.avgPrice + ', ' + sItem.valueRp + ')" class="p-1 rounded bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition" title="Tanya AI tentang broker ini">💬</button>'
        + '</td>'
        + '</tr>';
    });
  }

  html += '</tbody></table></div></div>'

    // Seller Table Footer / Subtotals
    + '<div class="bg-slate-900/90 p-3 border-t border-rose-900/40 text-[11px] flex items-center justify-between flex-wrap gap-2">'
    + '<div class="text-slate-400 font-semibold">Subtotal Top ' + displaySellers.length + ' Sellers:</div>'
    + '<div class="flex items-center gap-3 font-mono text-xs flex-wrap">'
    + '<span><strong class="text-white">' + sellerSubtotalLot.toLocaleString('id-ID') + '</strong> lot</span>'
    + '<span><strong class="text-rose-400">Rp ' + (sellerSubtotalVal / 1000000000).toFixed(2) + ' M</strong> (' + sellerSubtotalPct.toFixed(1) + '%)</span>'
    + '<span>Avg: <strong class="text-sky-300">Rp ' + sellerWeightedAvg.toLocaleString('id-ID') + '</strong></span>'
    + '</div>'
    + '</div>'
    + '</div>'

    + '</div></div>';

  // Tactical Bandarmology Takeaways
  html += '<div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md space-y-2">'
    + '<div class="text-xs font-bold text-sky-300 flex items-center gap-2">'
    + '<span>💡 Rekomendasi & Catatan Taktis Bandarmology untuk ' + data.ticker + ':</span>'
    + '</div>'
    + '<ul class="text-xs text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">'
    + '<li>Level harga rata-rata Top Buyer (<strong class="text-white">Rp ' + Number(topBuyerAvg || 0).toLocaleString('id-ID') + '</strong>) dapat dijadikan area support kunci penahan penurunan harga.</li>'
    + '<li>Arus investor asing saat ini mencatatkan ' + (netForeignM >= 0 ? '<strong class="text-emerald-400">Net Buy +Rp ' + netForeignM.toLocaleString('id-ID') + ' M</strong>' : '<strong class="text-rose-400">Net Sell -Rp ' + Math.abs(netForeignM).toLocaleString('id-ID') + ' M</strong>') + ' dengan partisipasi pasar sebesar <strong class="text-white">' + (ff.participationPct || 0) + '%</strong>.</li>'
    + '<li>Karakteristik dominan pergerakan: <strong class="text-white">' + (rm.smartMoneyStatus || 'NORMAL') + '</strong> vs <strong class="text-white">' + (rm.retailStatus || 'NORMAL') + '</strong>.</li>'
    + '</ul>'
    + '</div>';

  html += '</div>';
  return html;
}

// Ask AI specifically about the current broker flow data
function askAiAboutCurrentBrokerFlow(ticker) {
  var tk = ticker || STOCKCHAT_SELECTED_TICKER || 'BBCA';
  setStockChatActiveTab('chat');
  var prompt = 'Tolong analisa mendalam Broker Summary dan Bandarmology saham ' + tk + ' untuk rentang ' + STOCKCHAT_TIMEFRAME + '. Bagaimana potensi support dari harga beli Top Buyer dan risiko tekanan jualnya?';
  setTimeout(function() {
    sendStockChatPrompt(prompt);
  }, 150);
}

// Render Standalone Broker Flow & Bandarmology Card (Embeddable)
function renderBrokerSummaryWidget(data) {
  if (!data) return '<div class="p-4 text-center text-xs text-slate-400">Data broker summary tidak tersedia.</div>';

  var b = data.bandarmology || {};
  var conc = b.concentration || {};
  var ff = b.foreignFlow || {};
  var rm = b.retailVsSmartMoney || {};

  var verdictColor = b.verdict === 'BIG ACCUMULATION' ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800' :
    (b.verdict === 'NORMAL ACCUMULATION' ? 'text-teal-400 bg-teal-950/60 border-teal-800' :
    (b.verdict === 'BIG DISTRIBUTION' ? 'text-rose-400 bg-rose-950/60 border-rose-800' :
    (b.verdict === 'NORMAL DISTRIBUTION' ? 'text-orange-400 bg-orange-950/60 border-orange-800' : 'text-amber-400 bg-amber-950/60 border-amber-800')));

  var netForeignM = Math.round((ff.netValRp || 0) / 1000000000);
  var netForeignBadge = netForeignM >= 0 
    ? '<span class="text-emerald-400 font-semibold">+Rp ' + netForeignM.toLocaleString('id-ID') + ' M</span>' 
    : '<span class="text-rose-400 font-semibold">-Rp ' + Math.abs(netForeignM).toLocaleString('id-ID') + ' M</span>';

  var html = '<div class="rounded-xl border border-slate-700/80 bg-slate-900/90 p-4 shadow-xl text-xs space-y-4 my-2">';
  
  // Header: Ticker, Verdict, Timeframe
  html += '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">'
    + '<div class="flex items-center gap-2">'
    + '<span class="px-2.5 py-1 rounded-md bg-blue-600/20 border border-blue-500/40 text-blue-400 font-black text-sm tracking-wider">' + data.ticker + '</span>'
    + '<span class="text-slate-300 font-bold text-sm">Rp ' + Number(data.price || 0).toLocaleString('id-ID') + '</span>'
    + '<span class="' + ((data.changePercent || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400') + ' font-semibold">(' + ((data.changePercent || 0) >= 0 ? '+' : '') + Number(data.changePercent || 0).toFixed(2) + '%)</span>'
    + '</div>'
    + '<div class="flex items-center gap-2">'
    + '<span class="px-2.5 py-1 rounded-full border text-[11px] font-bold ' + verdictColor + '">' + (b.verdict || 'NEUTRAL') + '</span>'
    + '<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">' + (data.timeframe || '1D') + '</span>'
    + '</div>'
    + '</div>';

  // Bandarmology Highlights Grid
  html += '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">'
    + '<div class="bg-slate-800/60 p-2 rounded-lg border border-slate-700/40">'
    + '<div class="text-[10px] text-slate-400 uppercase tracking-wider">Top 3 Buyer Pct</div>'
    + '<div class="text-emerald-400 font-bold text-sm mt-0.5">' + (conc.top3BuyPct || 0) + '%</div>'
    + '</div>'
    + '<div class="bg-slate-800/60 p-2 rounded-lg border border-slate-700/40">'
    + '<div class="text-[10px] text-slate-400 uppercase tracking-wider">Top 3 Seller Pct</div>'
    + '<div class="text-rose-400 font-bold text-sm mt-0.5">' + (conc.top3SellPct || 0) + '%</div>'
    + '</div>'
    + '<div class="bg-slate-800/60 p-2 rounded-lg border border-slate-700/40">'
    + '<div class="text-[10px] text-slate-400 uppercase tracking-wider">Net Foreign Flow</div>'
    + '<div class="text-sm mt-0.5">' + netForeignBadge + '</div>'
    + '</div>'
    + '<div class="bg-slate-800/60 p-2 rounded-lg border border-slate-700/40">'
    + '<div class="text-[10px] text-slate-400 uppercase tracking-wider">Smart Money</div>'
    + '<div class="text-sky-400 font-bold text-[11px] mt-0.5 truncate">' + (rm.smartMoneyStatus || 'NEUTRAL') + '</div>'
    + '</div>'
    + '</div>';

  // Buyer vs Seller Matrix Table (Top 5)
  var topBuyers = (data.topBuyers || []).slice(0, 5);
  var topSellers = (data.topSellers || []).slice(0, 5);

  html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">'
    // Buyers Column
    + '<div class="space-y-1.5">'
    + '<div class="flex items-center justify-between text-[11px] font-bold text-emerald-400 border-b border-emerald-900/50 pb-1">'
    + '<span>TOP BUYERS (AKUMULASI)</span>'
    + '<span>LOT / AVG</span>'
    + '</div>';

  topBuyers.forEach(function(bItem) {
    var isF = bItem.type === 'F';
    html += '<div class="flex items-center justify-between py-1 border-b border-slate-800/50 text-[11px]">'
      + '<div class="flex items-center gap-1.5">'
      + '<span class="font-bold font-mono px-1.5 py-0.5 rounded ' + (isF ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40' : 'bg-slate-800 text-slate-200') + '">' + bItem.broker + '</span>'
      + '<span class="text-slate-300 truncate max-w-[110px]" title="' + bItem.name + '">' + bItem.name.replace(/ Sekuritas.*/i, '') + '</span>'
      + (isF ? '<span class="text-[9px] px-1 bg-amber-500/20 text-amber-400 rounded">F</span>' : '')
      + '</div>'
      + '<div class="text-right">'
      + '<span class="text-slate-200 font-mono font-medium">' + Number(bItem.volumeLot || 0).toLocaleString('id-ID') + '</span>'
      + '<span class="text-slate-400 text-[10px] ml-1.5">@' + Number(bItem.avgPrice || 0).toLocaleString('id-ID') + '</span>'
      + '</div>'
      + '</div>';
  });

  html += '</div>';

  // Sellers Column
  html += '<div class="space-y-1.5">'
    + '<div class="flex items-center justify-between text-[11px] font-bold text-rose-400 border-b border-rose-900/50 pb-1">'
    + '<span>TOP SELLERS (DISTRIBUSI)</span>'
    + '<span>LOT / AVG</span>'
    + '</div>';

  topSellers.forEach(function(sItem) {
    var isF = sItem.type === 'F';
    html += '<div class="flex items-center justify-between py-1 border-b border-slate-800/50 text-[11px]">'
      + '<div class="flex items-center gap-1.5">'
      + '<span class="font-bold font-mono px-1.5 py-0.5 rounded ' + (isF ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40' : 'bg-slate-800 text-slate-200') + '">' + sItem.broker + '</span>'
      + '<span class="text-slate-300 truncate max-w-[110px]" title="' + sItem.name + '">' + sItem.name.replace(/ Sekuritas.*/i, '') + '</span>'
      + (isF ? '<span class="text-[9px] px-1 bg-amber-500/20 text-amber-400 rounded">F</span>' : '')
      + '</div>'
      + '<div class="text-right">'
      + '<span class="text-slate-200 font-mono font-medium">' + Number(sItem.volumeLot || 0).toLocaleString('id-ID') + '</span>'
      + '<span class="text-slate-400 text-[10px] ml-1.5">@' + Number(sItem.avgPrice || 0).toLocaleString('id-ID') + '</span>'
      + '</div>'
      + '</div>';
  });

  html += '</div></div>';

  // Interpretation Footer
  if (b.interpretation) {
    html += '<div class="p-2.5 rounded-lg bg-blue-950/30 border border-blue-900/40 text-blue-200 text-[11px] leading-relaxed">'
      + '<span class="font-bold text-blue-400">💡 Analisa Bandarmology:</span> ' + b.interpretation
      + '</div>';
  }

  html += '</div>';
  return html;
}

// Render Main StockChat AI Page & Cockpit
function renderStockChatPage(containerId) {
  var target = document.getElementById(containerId || 'page-stockchat');
  if (!target) return;

  var isChatTab = STOCKCHAT_ACTIVE_TAB === 'chat';
  var isFlowTab = STOCKCHAT_ACTIVE_TAB === 'broker-flow';

  var html = '<div class="w-full space-y-5 pb-12 px-1 md:px-2">'
    // Top Bar & Header
    + '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md">'
    + '<div>'
    + '<div class="flex items-center gap-3">'
    + '<div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/20">💬</div>'
    + '<div>'
    + '<h1 class="text-xl font-black tracking-tight text-white flex items-center gap-2">StockChat AI & Bandarmology Cockpit <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">LIVE ENGINE</span></h1>'
    + '<p class="text-xs text-slate-400 mt-0.5">Asisten Analis Broker Summary, Aliran Dana Asing, Valuasi Fundamental, dan Portofolio BEI</p>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="flex items-center gap-2 flex-wrap">'
    + '<button onclick="clearStockChatHistory()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5">'
    + '<span>🔄</span> Sesi Baru'
    + '</button>'
    + '<button onclick="openStockIntelForTicker(STOCKCHAT_SELECTED_TICKER)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md transition flex items-center gap-1.5">'
    + '<span>🔍</span> Stock Intelligence'
    + '</button>'
    + '</div>'
    + '</div>';

  // Navigation Subheader Tabs (Tab 1: Chat AI vs Tab 2: Aggregated Broker Flow)
  html += '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">'
    + '<div class="flex items-center gap-2">'
    + '<button onclick="setStockChatActiveTab(\'chat\')" class="px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ' + (isChatTab ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60') + '">'
    + '<span>💬 StockChat AI Assistant</span>'
    + '</button>'
    + '<button onclick="setStockChatActiveTab(\'broker-flow\')" class="px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ' + (isFlowTab ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60') + '">'
    + '<span>📊 Aggregated Broker Flow: <strong class="font-mono text-amber-300">' + STOCKCHAT_SELECTED_TICKER + '</strong></span>'
    + '<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">BANDAR</span>'
    + '</button>'
    + '</div>'

    // Timeframe & Ticker selector control
    + '<div class="flex items-center gap-2 self-end sm:self-auto">'
    + '<span class="text-[11px] text-slate-400 font-semibold">Rentang:</span>'
    + '<div class="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">'
    + ['1D', '3D', '1W', '1M'].map(function(tf) {
      var isTfActive = STOCKCHAT_TIMEFRAME === tf;
      return '<button onclick="setStockChatTimeframe(\'' + tf + '\')" class="px-2.5 py-1 text-[10px] font-bold rounded-md transition ' + (isTfActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white') + '">' + tf + '</button>';
    }).join('')
    + '</div>'
    + '</div>'
    + '</div>';

  // Ticker Quick Selector Bar
  html += '<div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap">'
    + '<div class="flex items-center gap-2">'
    + '<span class="text-[11px] font-semibold text-slate-400">⚡ Active Ticker:</span>'
    + '<div class="flex items-center gap-1">'
    + ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'ANTM', 'ADRO', 'PTRO', 'TLKM', 'ASII', 'GOTO', 'BREN', 'AMMN'].map(function(tk) {
      var isAct = tk === STOCKCHAT_SELECTED_TICKER;
      return '<button onclick="selectStockChatTicker(\'' + tk + '\')" class="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition ' + (isAct ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50') + '">' + tk + '</button>';
    }).join('')
    + '</div>'
    + '</div>'
    + '<div class="flex items-center gap-1.5">'
    + '<input id="stockchat-custom-ticker" type="text" placeholder="KODE..." maxlength="6" class="w-16 px-2 py-1 text-center uppercase font-mono text-xs rounded bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500" onkeydown="if(event.key===\'Enter\'){selectStockChatTicker(this.value);this.value=\'\';}">'
    + '<button onclick="var el=document.getElementById(\'stockchat-custom-ticker\');if(el&&el.value)selectStockChatTicker(el.value)" class="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">Set</button>'
    + '</div>'
    + '</div>';

  // TAB 1: Chat Assistant View
  if (isChatTab) {
    // Quick Action Matrix Chips
    html += '<div class="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-2.5">'
      + '<div class="text-xs text-slate-400 font-semibold px-1">⚡ Quick Action Prompts untuk ' + STOCKCHAT_SELECTED_TICKER + ':</div>'
      + '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">';

    STOCKCHAT_PROMPT_PRESETS.forEach(function(item, idx) {
      html += '<button onclick="sendStockChatPreset(' + idx + ')" class="p-2.5 text-left rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 transition group hover:border-blue-500/50">'
        + '<div class="font-bold text-[11px] text-slate-200 group-hover:text-blue-400 truncate">' + item.title + '</div>'
        + '<div class="text-[10px] text-slate-400 truncate mt-0.5">' + item.prompt.slice(0, 38) + '...</div>'
        + '</button>';
    });

    html += '</div></div>';

    // Chat History Box
    html += '<div id="stockchat-history-box" class="bg-slate-950/70 rounded-2xl border border-slate-800 p-5 min-h-[420px] max-h-[600px] overflow-y-auto space-y-4 shadow-inner">';

    STOCKCHAT_CONVERSATION.forEach(function(msg, i) {
      var isUser = msg.role === 'user';
      html += '<div class="flex items-start gap-3 ' + (isUser ? 'justify-end' : 'justify-start') + '">'
        + (!isUser ? '<div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-md">AI</div>' : '')
        + '<div class="max-w-2xl rounded-2xl p-4 ' + (isUser ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none') + ' shadow-lg space-y-2">'
        + '<div class="text-xs leading-relaxed">' + formatStockChatMarkdown(msg.text) + '</div>';

      // If tool calls are present, display formatted tool cards or broker summary widget
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach(function(tc) {
          if (tc.toolName === 'cek_broker_summary' && tc.result && !tc.result.error) {
            html += renderBrokerSummaryWidget(tc.result);
          } else {
            html += '<div class="mt-2 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center gap-2">'
              + '<span class="text-blue-400">⚡ Tool Executed:</span> ' + tc.toolName
              + '</div>';
          }
        });
      }

      html += '</div>'
        + (isUser ? '<div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0">YOU</div>' : '')
        + '</div>';
    });

    if (STOCKCHAT_IS_BUSY) {
      html += '<div class="flex items-start gap-3 justify-start">'
        + '<div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-black shrink-0 animate-pulse">AI</div>'
        + '<div class="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-4 text-xs text-blue-400 flex items-center gap-2">'
        + '<svg class="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>'
        + '<span>Memproses kalkulasi Bandarmology, data KSEI & analitik pasar...</span>'
        + '</div>'
        + '</div>';
    }

    html += '</div>';

    // Bottom Input Form
    html += '<form onsubmit="handleStockChatSubmit(event)" class="relative flex items-center gap-2">'
      + '<div class="relative flex-1">'
      + '<input id="stockchat-input-text" type="text" placeholder="Tanyakan apa saja (misal: \'Cek broker summary ' + STOCKCHAT_SELECTED_TICKER + ' hari ini\', \'Review portofolio\', \'Simulasi risk reward\')..."'
      + ' class="w-full pl-4 pr-12 py-3.5 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xl transition">'
      + '</div>'
      + '<button type="submit" ' + (STOCKCHAT_IS_BUSY ? 'disabled' : '') + ' class="px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition flex items-center gap-1.5 shrink-0">'
      + '<span>Kirim</span>'
      + '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>'
      + '</button>'
      + '</form>';
  }

  // TAB 2: Dedicated Aggregated Broker Flow View
  if (isFlowTab) {
    html += '<div id="stockchat-flow-tab-content" class="min-h-[460px]">'
      + '<div class="flex items-center justify-center p-12 text-slate-400 text-xs">Memuat data broker flow...</div>'
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
    if (source !== 'stockchat' && tk && tk !== STOCKCHAT_SELECTED_TICKER) {
      STOCKCHAT_SELECTED_TICKER = tk;
      var elP = document.getElementById('page-stockchat');
      if (elP && elP.classList.contains('on') && typeof renderStockChatPage === 'function') {
        renderStockChatPage();
      }
    }
  });
}

// Preset button handler
function sendStockChatPreset(idx) {
  var p = STOCKCHAT_PROMPT_PRESETS[idx];
  if (!p) return;
  var text = p.prompt.replace(/BBCA/g, STOCKCHAT_SELECTED_TICKER);
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

  // Extract user holdings & balance context
  var porto = (typeof getPortfolio === 'function') ? getPortfolio() : (window.holdings || []);
  var totalAum = (typeof computeCurrentAUM === 'function') ? computeCurrentAUM() : 0;
  var rdn = (typeof calcRdnBalance === 'function') ? calcRdnBalance() : 0;

  var userContext = {
    holdings: porto,
    totalAum: totalAum,
    rdnCash: rdn,
    selectedTicker: STOCKCHAT_SELECTED_TICKER,
    livePrices: window.prices || {}
  };

  try {
    var res = await fetch('/api/ai/agent-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: STOCKCHAT_CONVERSATION.slice(-8),
        userContext: userContext
      })
    });

    var data = await res.json();
    if (data && data.success) {
      STOCKCHAT_CONVERSATION.push({
        role: 'assistant',
        text: data.reply || 'Analisa berhasil diproses.',
        toolCalls: data.toolCalls || []
      });
    } else {
      STOCKCHAT_CONVERSATION.push({
        role: 'assistant',
        text: '⚠️ Terjadi kendala saat memproses analisa: ' + (data.error || 'Server tidak merespons.'),
        toolCalls: []
      });
    }
  } catch (err) {
    console.error('StockChat prompt error:', err);
    STOCKCHAT_CONVERSATION.push({
      role: 'assistant',
      text: '⚠️ Gagal terhubung ke engine StockChat AI. Silakan coba kembali sesaat lagi.',
      toolCalls: []
    });
  } finally {
    STOCKCHAT_IS_BUSY = false;
    renderStockChatPage();
  }
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

// ============================================================
// BANDARMOLOGY COCKPIT SUITE
// 7 Sub-Views: Market Flow, Broker Flow, Foreign Flow, Accumulation,
// Distribution, Smart Money Radar, Broker Trail
// ============================================================

var BANDARMOLOGY_ACTIVE_TAB = 'market-flow';
var BANDARMOLOGY_SELECTED_BROKER = 'YU';
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

window.goBandarmology = function(subTab, btn) {
  BANDARMOLOGY_ACTIVE_TAB = subTab || 'market-flow';
  if (typeof goPage === 'function') {
    goPage('bandarmology', btn);
  }
  renderBandarmologyCockpitPage();
};

window.setBandarmologyTab = function(subTab) {
  BANDARMOLOGY_ACTIVE_TAB = subTab || 'market-flow';
  renderBandarmologyCockpitPage();
};

window.setBandarmologyBroker = function(brokerCode) {
  BANDARMOLOGY_SELECTED_BROKER = brokerCode || 'YU';
  renderBandarmologyCockpitPage();
};

function renderBandarmologyCockpitPage(containerId) {
  var target = document.getElementById(containerId || 'page-bandarmology');
  if (!target) return;

  var tk = (STOCKCHAT_SELECTED_TICKER || 'BBCA').toUpperCase();
  var tabs = [
    { id: 'market-flow', label: 'Market Flow', icon: 'ti-world-download', desc: 'Arus Dana Pasar & IHSG' },
    { id: 'broker-flow', label: 'Broker Flow', icon: 'ti-arrows-diff', desc: 'Top 5/10 Buyer & Seller' },
    { id: 'foreign-flow', label: 'Foreign Flow', icon: 'ti-coin', desc: 'Arus Dana Asing Terkini' },
    { id: 'accumulation', label: 'Accumulation', icon: 'ti-circle-arrow-up', desc: 'Radar Saham Terakumulasi' },
    { id: 'distribution', label: 'Distribution', icon: 'ti-circle-arrow-down', desc: 'Radar Saham Terdistribusi' },
    { id: 'smart-money-radar', label: 'Smart Money Radar', icon: 'ti-radar-2', desc: 'Whale vs Retail Footprint' },
    { id: 'broker-trail', label: 'Broker Trail', icon: 'ti-route', desc: 'Jejak Transaksi Broker' }
  ];

  var html = '<div class="w-full space-y-5 pb-14 px-1 md:px-2">'
    // Header Cockpit
    + '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-md">'
    + '<div class="flex items-center gap-3.5">'
    + '<div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-emerald-600/30">🎯</div>'
    + '<div>'
    + '<h1 class="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">'
    + '<span>BANDARMOLOGY COCKPIT</span>'
    + '<span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">INSTITUTIONAL RADAR</span>'
    + '</h1>'
    + '<p class="text-xs text-slate-400 mt-0.5">Analisis Aliran Dana Bandar, Broker Summary, Foreign Flow, Konsentrasi Akumulasi &amp; Distribusi BEI</p>'
    + '</div>'
    + '</div>'
    + '<div class="flex items-center gap-2 flex-wrap">'
    + '<button onclick="openStockChat(\'' + tk + '\', \'Analisa menyeluruh bandarmology, broker summary dan foreign flow saham ' + tk + '\')" class="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/20 transition flex items-center gap-1.5">'
    + '<i class="ti ti-messages"></i> <span>Tanya StockChat AI</span>'
    + '</button>'
    + '<button onclick="goPage(\'stock-intel\')" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition flex items-center gap-1.5">'
    + '<i class="ti ti-radar"></i> <span>Stock Intelligence</span>'
    + '</button>'
    + '</div>'
    + '</div>';

  // Sub-Navigation Tabs Bar
  html += '<div class="bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-thin">'
    + tabs.map(function(t) {
      var isActive = BANDARMOLOGY_ACTIVE_TAB === t.id;
      return '<button onclick="setBandarmologyTab(\'' + t.id + '\')" class="px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ' + (isActive ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-700/25' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60') + '">'
        + '<i class="ti ' + t.icon + ' text-sm"></i>'
        + '<span>' + t.label + '</span>'
        + '</button>';
    }).join('')
    + '</div>';

  // Ticker Quick Selector Bar (for ticker-dependent tabs)
  if (['broker-flow', 'market-flow', 'foreign-flow', 'smart-money-radar'].includes(BANDARMOLOGY_ACTIVE_TAB)) {
    html += '<div class="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap">'
      + '<div class="flex items-center gap-2">'
      + '<span class="text-[11px] font-semibold text-slate-400">⚡ Fokus Emiten:</span>'
      + '<div class="flex items-center gap-1">'
      + ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'ANTM', 'ADRO', 'PTRO', 'TLKM', 'ASII', 'GOTO', 'BREN', 'AMMN'].map(function(itemTk) {
        var isAct = itemTk === tk;
        return '<button onclick="selectStockChatTicker(\'' + itemTk + '\');renderBandarmologyCockpitPage();" class="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition ' + (isAct ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50') + '">' + itemTk + '</button>';
      }).join('')
      + '</div>'
      + '</div>'
      + '<div class="flex items-center gap-1.5">'
      + '<input id="bandar-custom-ticker" type="text" placeholder="KODE..." maxlength="6" class="w-16 px-2 py-1 text-center uppercase font-mono text-xs rounded bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-emerald-500" onkeydown="if(event.key===\'Enter\'){selectStockChatTicker(this.value);renderBandarmologyCockpitPage();this.value=\'\';}">'
      + '<button onclick="var el=document.getElementById(\'bandar-custom-ticker\');if(el&&el.value){selectStockChatTicker(el.value);renderBandarmologyCockpitPage();}" class="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">Set</button>'
      + '</div>'
      + '</div>';
  }

  // Content Container for Selected Tab
  html += '<div id="bandarmology-tab-content" class="min-h-[460px]">';
  
  if (BANDARMOLOGY_ACTIVE_TAB === 'market-flow') {
    html += renderBandarmologyMarketFlowView(tk);
  } else if (BANDARMOLOGY_ACTIVE_TAB === 'broker-flow') {
    html += '<div id="stockchat-flow-tab-content">'
      + '<div class="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">'
      + '<i class="ti ti-loader animate-spin text-emerald-400 text-lg"></i> Memuat Broker Summary ' + tk + '...'
      + '</div>'
      + '</div>';
    setTimeout(loadAndRenderBrokerFlowTab, 40);
  } else if (BANDARMOLOGY_ACTIVE_TAB === 'foreign-flow') {
    html += renderBandarmologyForeignFlowView(tk);
  } else if (BANDARMOLOGY_ACTIVE_TAB === 'accumulation') {
    html += renderBandarmologyAccumulationView();
  } else if (BANDARMOLOGY_ACTIVE_TAB === 'distribution') {
    html += renderBandarmologyDistributionView();
  } else if (BANDARMOLOGY_ACTIVE_TAB === 'smart-money-radar') {
    html += renderBandarmologySmartMoneyRadarView(tk);
  } else if (BANDARMOLOGY_ACTIVE_TAB === 'broker-trail') {
    html += renderBandarmologyBrokerTrailView();
  }

  html += '</div></div>';

  target.innerHTML = html;
}

// 1. Market Flow View
function renderBandarmologyMarketFlowView(tk) {
  var bigBanks = [
    { ticker: 'BBCA', name: 'Bank Central Asia', flow: '+Rp 284.5 M', status: 'BIG ACCUMULATION', color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800/40', topBuyer: 'AK, ZP, BK' },
    { ticker: 'BBRI', name: 'Bank Rakyat Indonesia', flow: '+Rp 195.2 M', status: 'ACCUMULATION', color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800/40', topBuyer: 'YU, CC, AK' },
    { ticker: 'BMRI', name: 'Bank Mandiri', flow: '+Rp 142.8 M', status: 'NORMAL ACC', color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800/40', topBuyer: 'RX, YU, ZP' },
    { ticker: 'BBNI', name: 'Bank Negara Indonesia', flow: '-Rp 38.6 M', status: 'DISTRIBUTION', color: 'text-rose-400', bg: 'bg-rose-950/40', border: 'border-rose-800/40', topBuyer: 'YP, PD (Retail)' }
  ];

  var sectors = [
    { name: 'Financials (Perbankan)', flowVal: '+Rp 583.9 M', pct: 82, isAcc: true },
    { name: 'Basic Materials (Tambang)', flowVal: '+Rp 192.4 M', pct: 64, isAcc: true },
    { name: 'Energy (Minyak & Batubara)', flowVal: '+Rp 88.7 M', pct: 55, isAcc: true },
    { name: 'Infrastructure (Telko & Toll)', flowVal: '-Rp 64.2 M', pct: 42, isAcc: false },
    { name: 'Consumer Non-Cyclical', flowVal: '-Rp 115.0 M', pct: 35, isAcc: false }
  ];

  var html = '<div class="space-y-4">'
    // Top Summary Metric Cards
    + '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">'
    + '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">'
    + '<div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">IHSG Bandar Pulse</div>'
    + '<div class="text-xl font-black text-emerald-400 mt-1 flex items-center gap-1.5"><i class="ti ti-trending-up"></i> NET ACCUMULATION</div>'
    + '<div class="text-[11px] text-slate-400 mt-0.5">+Rp 786.4 Miliar Net Bandar Inflow</div>'
    + '</div>'
    + '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">'
    + '<div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Foreign Participation</div>'
    + '<div class="text-xl font-black text-sky-400 mt-1">42.8% <span class="text-xs font-normal text-slate-400">of Volume</span></div>'
    + '<div class="text-[11px] text-slate-400 mt-0.5">Institusi Asing Sangat Aktif</div>'
    + '</div>'
    + '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">'
    + '<div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Big 4 Banks Inflow</div>'
    + '<div class="text-xl font-black text-emerald-400 mt-1">+Rp 583.9 M</div>'
    + '<div class="text-[11px] text-slate-400 mt-0.5">74.2% Konsentrasi di Big Banks</div>'
    + '</div>'
    + '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md">'
    + '<div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Smart Money Dominancy</div>'
    + '<div class="text-xl font-black text-indigo-400 mt-1">68 / 100</div>'
    + '<div class="text-[11px] text-slate-400 mt-0.5">Institusional Kontrol Pasar</div>'
    + '</div>'
    + '</div>';

  // Big 4 Banks Flow Section
  html += '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md space-y-3">'
    + '<div class="flex items-center justify-between">'
    + '<h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"><i class="ti ti-building-bank text-emerald-400"></i> Aliran Dana Bandar Big 4 Banks (Motor IHSG)</h3>'
    + '<span class="text-[10px] text-slate-400 font-mono">Live Aggregation</span>'
    + '</div>'
    + '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">';

  bigBanks.forEach(function(b) {
    html += '<div class="p-3 rounded-lg ' + b.bg + ' border ' + b.border + ' space-y-1.5 cursor-pointer hover:opacity-90 transition" onclick="selectStockChatTicker(\'' + b.ticker + '\');setBandarmologyTab(\'broker-flow\');">'
      + '<div class="flex items-center justify-between">'
      + '<span class="font-bold text-white font-mono">' + b.ticker + '</span>'
      + '<span class="text-[10px] font-bold ' + b.color + '">' + b.status + '</span>'
      + '</div>'
      + '<div class="text-lg font-black font-mono ' + b.color + '">' + b.flow + '</div>'
      + '<div class="text-[10px] text-slate-400 flex items-center justify-between">'
      + '<span>Top Buyer:</span>'
      + '<span class="font-mono text-slate-200">' + b.topBuyer + '</span>'
      + '</div>'
      + '</div>';
  });

  html += '</div></div>';

  // Sectoral Flow Breakdown
  html += '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md space-y-3">'
    + '<h3 class="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"><i class="ti ti-layout-grid text-sky-400"></i> Distribusi Arus Dana Smart Money per Sektor</h3>'
    + '<div class="space-y-2.5">';

  sectors.forEach(function(s) {
    var barColor = s.isAcc ? 'bg-emerald-500' : 'bg-rose-500';
    var txtColor = s.isAcc ? 'text-emerald-400' : 'text-rose-400';
    html += '<div class="space-y-1">'
      + '<div class="flex items-center justify-between text-xs">'
      + '<span class="text-slate-300 font-medium">' + s.name + '</span>'
      + '<span class="font-mono font-bold ' + txtColor + '">' + s.flowVal + '</span>'
      + '</div>'
      + '<div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden">'
      + '<div class="' + barColor + ' h-full rounded-full" style="width:' + s.pct + '%"></div>'
      + '</div>'
      + '</div>';
  });

  html += '</div></div></div>';
  return html;
}

// 3. Foreign Flow View
function renderBandarmologyForeignFlowView(tk) {
  var topForeignBuys = [
    { ticker: 'BBCA', netRp: '+Rp 245.8 M', sharesPct: '68%', price: 'Rp 10.250', chg: '+1.48%' },
    { ticker: 'BMRI', netRp: '+Rp 162.3 M', sharesPct: '61%', price: 'Rp 6.850', chg: '+2.24%' },
    { ticker: 'BBRI', netRp: '+Rp 138.9 M', sharesPct: '54%', price: 'Rp 5.125', chg: '+0.98%' },
    { ticker: 'ANTM', netRp: '+Rp 78.4 M', sharesPct: '48%', price: 'Rp 1.620', chg: '+3.18%' },
    { ticker: 'ASII', netRp: '+Rp 45.2 M', sharesPct: '42%', price: 'Rp 5.050', chg: '+0.50%' }
  ];

  var topForeignSells = [
    { ticker: 'TLKM', netRp: '-Rp 82.5 M', sharesPct: '52%', price: 'Rp 3.120', chg: '-1.27%' },
    { ticker: 'GOTO', netRp: '-Rp 48.0 M', sharesPct: '39%', price: 'Rp 54', chg: '-1.82%' },
    { ticker: 'UNVR', netRp: '-Rp 34.6 M', sharesPct: '45%', price: 'Rp 2.450', chg: '-0.81%' },
    { ticker: 'BBNI', netRp: '-Rp 28.3 M', sharesPct: '40%', price: 'Rp 5.350', chg: '-0.46%' }
  ];

  var html = '<div class="space-y-4">'
    + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'
    // Top Foreign Buys
    + '<div class="bg-slate-900/90 p-4 rounded-xl border border-emerald-900/40 shadow-md space-y-3">'
    + '<div class="flex items-center justify-between border-b border-emerald-900/40 pb-2">'
    + '<h3 class="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5"><i class="ti ti-arrow-up-right"></i> Top 5 Foreign Net Buy (Akumulasi Asing)</h3>'
    + '<span class="text-[10px] text-emerald-300/80 font-mono">INFLOW</span>'
    + '</div>'
    + '<div class="divide-y divide-slate-800/60">';

  topForeignBuys.forEach(function(item) {
    html += '<div class="py-2.5 flex items-center justify-between hover:bg-slate-800/40 px-1.5 rounded transition cursor-pointer" onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyTab(\'broker-flow\');">'
      + '<div>'
      + '<div class="flex items-center gap-2">'
      + '<span class="font-bold text-white font-mono">' + item.ticker + '</span>'
      + '<span class="text-[10px] text-emerald-400 font-mono">' + item.chg + '</span>'
      + '</div>'
      + '<div class="text-[10px] text-slate-400">Porsi Asing: ' + item.sharesPct + '</div>'
      + '</div>'
      + '<div class="text-right">'
      + '<div class="font-black font-mono text-emerald-400">' + item.netRp + '</div>'
      + '<div class="text-[10px] text-slate-400 font-mono">' + item.price + '</div>'
      + '</div>'
      + '</div>';
  });

  html += '</div></div>';

  // Top Foreign Sells
  html += '<div class="bg-slate-900/90 p-4 rounded-xl border border-rose-900/40 shadow-md space-y-3">'
    + '<div class="flex items-center justify-between border-b border-rose-900/40 pb-2">'
    + '<h3 class="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5"><i class="ti ti-arrow-down-right"></i> Top Foreign Net Sell (Distribusi Asing)</h3>'
    + '<span class="text-[10px] text-rose-300/80 font-mono">OUTFLOW</span>'
    + '</div>'
    + '<div class="divide-y divide-slate-800/60">';

  topForeignSells.forEach(function(item) {
    html += '<div class="py-2.5 flex items-center justify-between hover:bg-slate-800/40 px-1.5 rounded transition cursor-pointer" onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyTab(\'broker-flow\');">'
      + '<div>'
      + '<div class="flex items-center gap-2">'
      + '<span class="font-bold text-white font-mono">' + item.ticker + '</span>'
      + '<span class="text-[10px] text-rose-400 font-mono">' + item.chg + '</span>'
      + '</div>'
      + '<div class="text-[10px] text-slate-400">Porsi Asing: ' + item.sharesPct + '</div>'
      + '</div>'
      + '<div class="text-right">'
      + '<div class="font-black font-mono text-rose-400">' + item.netRp + '</div>'
      + '<div class="text-[10px] text-slate-400 font-mono">' + item.price + '</div>'
      + '</div>'
      + '</div>';
  });

  html += '</div></div></div></div>';
  return html;
}

// 4. Accumulation View
function renderBandarmologyAccumulationView() {
  var accList = [
    { ticker: 'BBCA', name: 'Bank Central Asia', status: 'BIG ACCUMULATION', concTop3: '74.2%', topBrokers: 'AK, ZP, BK', avgBuyPrice: 'Rp 10.220', lastPrice: 'Rp 10.250', spreadPct: '+0.29%', signal: 'STRONG BUY' },
    { ticker: 'ANTM', name: 'Aneka Tambang', status: 'BIG ACCUMULATION', concTop3: '68.5%', topBrokers: 'YU, CC, RX', avgBuyPrice: 'Rp 1.590', lastPrice: 'Rp 1.620', spreadPct: '+1.89%', signal: 'BREAKOUT ACC' },
    { ticker: 'BMRI', name: 'Bank Mandiri', status: 'ACCUMULATION', concTop3: '62.8%', topBrokers: 'RX, YU, ZP', avgBuyPrice: 'Rp 6.810', lastPrice: 'Rp 6.850', spreadPct: '+0.59%', signal: 'ACCUMULATE' },
    { ticker: 'ADRO', name: 'Adaro Energy', status: 'ACCUMULATION', concTop3: '59.4%', topBrokers: 'BK, AK, NI', avgBuyPrice: 'Rp 3.680', lastPrice: 'Rp 3.720', spreadPct: '+1.08%', signal: 'ACCUMULATE' },
    { ticker: 'PTRO', name: 'Petrosea', status: 'NORMAL ACC', concTop3: '54.1%', topBrokers: 'CC, YU, SQ', avgBuyPrice: 'Rp 18.200', lastPrice: 'Rp 18.450', spreadPct: '+1.37%', signal: 'WATCHLIST' }
  ];

  var html = '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md space-y-3">'
    + '<div class="flex items-center justify-between">'
    + '<div>'
    + '<h3 class="text-sm font-bold text-emerald-400 flex items-center gap-1.5"><i class="ti ti-circle-arrow-up"></i> Radar Saham Terakumulasi Smart Money &amp; Bandar</h3>'
    + '<p class="text-[11px] text-slate-400">Saham dengan dominansi Top Buyer tinggi vs Top Seller yang terpecah (retail fragmentation)</p>'
    + '</div>'
    + '</div>'
    + '<div class="overflow-x-auto">'
    + '<table class="w-full text-xs text-left">'
    + '<thead class="text-[10px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800 font-mono">'
    + '<tr>'
    + '<th class="p-2.5">Emiten</th>'
    + '<th class="p-2.5">Status Bandar</th>'
    + '<th class="p-2.5">Top 3 Konsentrasi</th>'
    + '<th class="p-2.5">Top Broker Akumulator</th>'
    + '<th class="p-2.5">Avg Buy Bandar</th>'
    + '<th class="p-2.5">Harga Terkini</th>'
    + '<th class="p-2.5">Aksi</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody class="divide-y divide-slate-800/60 font-mono">';

  accList.forEach(function(item) {
    html += '<tr class="hover:bg-slate-800/40 transition">'
      + '<td class="p-2.5 font-bold text-white">' + item.ticker + ' <span class="text-[10px] font-normal text-slate-400 font-sans block">' + item.name + '</span></td>'
      + '<td class="p-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">' + item.status + '</span></td>'
      + '<td class="p-2.5 text-emerald-400 font-bold">' + item.concTop3 + '</td>'
      + '<td class="p-2.5 text-slate-200">' + item.topBrokers + '</td>'
      + '<td class="p-2.5 text-slate-300">' + item.avgBuyPrice + '</td>'
      + '<td class="p-2.5 text-white font-bold">' + item.lastPrice + '</td>'
      + '<td class="p-2.5">'
      + '<button onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyTab(\'broker-flow\');" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold font-sans transition">Detail Broker</button>'
      + '</td>'
      + '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

// 5. Distribution View
function renderBandarmologyDistributionView() {
  var distList = [
    { ticker: 'TLKM', name: 'Telkom Indonesia', status: 'BIG DISTRIBUTION', concTop3: '71.5%', topSellers: 'AK, ZP, RX', avgSellPrice: 'Rp 3.140', lastPrice: 'Rp 3.120', warning: 'Heavy Institutional Outflow' },
    { ticker: 'GOTO', name: 'GoTo Gojek Tokopedia', status: 'DISTRIBUTION', concTop3: '65.2%', topSellers: 'BK, YU, ZP', avgSellPrice: 'Rp 56', lastPrice: 'Rp 54', warning: 'Foreign Dumps into Retail' },
    { ticker: 'UNVR', name: 'Unilever Indonesia', status: 'DISTRIBUTION', concTop3: '61.8%', topSellers: 'AK, CC, CS', avgSellPrice: 'Rp 2.480', lastPrice: 'Rp 2.450', warning: 'Sustained Selling Pressure' },
    { ticker: 'KLBF', name: 'Kalbe Farma', status: 'NORMAL DIST', concTop3: '55.0%', topSellers: 'RX, BK, ZP', avgSellPrice: 'Rp 1.480', lastPrice: 'Rp 1.465', warning: 'Profit Taking' }
  ];

  var html = '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md space-y-3">'
    + '<div class="flex items-center justify-between">'
    + '<div>'
    + '<h3 class="text-sm font-bold text-rose-400 flex items-center gap-1.5"><i class="ti ti-circle-arrow-down"></i> Radar Saham Terdistribusi (Peringatan Tekanan Jual)</h3>'
    + '<p class="text-[11px] text-slate-400">Saham dengan tekanan jual institusi/asing terkonsentrasi yang diserap oleh broker retail (YP, PD, XC)</p>'
    + '</div>'
    + '</div>'
    + '<div class="overflow-x-auto">'
    + '<table class="w-full text-xs text-left">'
    + '<thead class="text-[10px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800 font-mono">'
    + '<tr>'
    + '<th class="p-2.5">Emiten</th>'
    + '<th class="p-2.5">Status Bandar</th>'
    + '<th class="p-2.5">Top 3 Seller Share</th>'
    + '<th class="p-2.5">Top Broker Seller</th>'
    + '<th class="p-2.5">Avg Sell Bandar</th>'
    + '<th class="p-2.5">Harga Terkini</th>'
    + '<th class="p-2.5">Peringatan</th>'
    + '<th class="p-2.5">Aksi</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody class="divide-y divide-slate-800/60 font-mono">';

  distList.forEach(function(item) {
    html += '<tr class="hover:bg-slate-800/40 transition">'
      + '<td class="p-2.5 font-bold text-white">' + item.ticker + ' <span class="text-[10px] font-normal text-slate-400 font-sans block">' + item.name + '</span></td>'
      + '<td class="p-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">' + item.status + '</span></td>'
      + '<td class="p-2.5 text-rose-400 font-bold">' + item.concTop3 + '</td>'
      + '<td class="p-2.5 text-slate-200">' + item.topSellers + '</td>'
      + '<td class="p-2.5 text-slate-300">' + item.avgSellPrice + '</td>'
      + '<td class="p-2.5 text-white font-bold">' + item.lastPrice + '</td>'
      + '<td class="p-2.5 text-[10px] text-amber-300 font-sans">' + item.warning + '</td>'
      + '<td class="p-2.5">'
      + '<button onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyTab(\'broker-flow\');" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold font-sans border border-slate-700 transition">Detail Broker</button>'
      + '</td>'
      + '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

// 6. Smart Money Radar View
function renderBandarmologySmartMoneyRadarView(tk) {
  var html = '<div class="space-y-4">'
    + '<div class="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-md space-y-4">'
    + '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">'
    + '<div>'
    + '<h3 class="text-sm font-bold text-white flex items-center gap-2"><i class="ti ti-radar-2 text-indigo-400 text-base"></i> Smart Money vs Retail Footprint: <span class="font-mono text-amber-300">' + tk + '</span></h3>'
    + '<p class="text-xs text-slate-400">Deteksi divergensi akumulasi tersembunyi (silent accumulation) vs jebakan ritel</p>'
    + '</div>'
    + '<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">SMART MONEY SCORE: 84/100</span>'
    + '</div>'
    + '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'
    + '<div class="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1">'
    + '<div class="text-[10px] text-slate-400 uppercase font-mono">1. Dominansi Institusi / Whale</div>'
    + '<div class="text-base font-bold text-emerald-400">WHALE DOMINANT (68%)</div>'
    + '<div class="text-[11px] text-slate-400">Order size rata-rata > 500 lot per transaksi</div>'
    + '</div>'
    + '<div class="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1">'
    + '<div class="text-[10px] text-slate-400 uppercase font-mono">2. Retail Sentiment (YP, PD, XC)</div>'
    + '<div class="text-base font-bold text-amber-400">RETAIL SELLING (58%)</div>'
    + '<div class="text-[11px] text-slate-400">Ritel melakukan cut loss / profit taking dini</div>'
    + '</div>'
    + '<div class="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-1">'
    + '<div class="text-[10px] text-slate-400 uppercase font-mono">3. Divergensi Harga &amp; Volume</div>'
    + '<div class="text-base font-bold text-sky-400">BULLISH DIVERGENCE</div>'
    + '<div class="text-[11px] text-slate-400">Harga stabil di support sementara volume akumulasi naik</div>'
    + '</div>'
    + '</div>'
    + '<div class="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-900/40 text-emerald-200 text-xs leading-relaxed">'
    + '<strong class="text-emerald-400">💡 Kesimpulan Smart Money:</strong> Smart Money terdeteksi melakukan akumulasi konsisten pada saham <strong>' + tk + '</strong> melalui broker asing (AK, ZP, YU) dengan menyerap barang yang dilepas oleh investor ritel. Skenario teknikal mendukung potensi penguatan ke level resistance berikutnya.'
    + '</div>'
    + '</div></div>';
  return html;
}

// 7. Broker Trail View
function renderBandarmologyBrokerTrailView() {
  var bCode = BANDARMOLOGY_SELECTED_BROKER || 'YU';
  var bInfo = BANDARMOLOGY_BROKER_LIST.find(function(b) { return b.code === bCode; }) || BANDARMOLOGY_BROKER_LIST[0];

  var trailData = [
    { ticker: 'BBCA', action: 'NET BUY', netVal: '+Rp 184.2 M', avgPrice: 'Rp 10.210', lots: '180.400 Lot', date: 'Hari Ini' },
    { ticker: 'BMRI', action: 'NET BUY', netVal: '+Rp 96.5 M', avgPrice: 'Rp 6.820', lots: '141.500 Lot', date: 'Hari Ini' },
    { ticker: 'ANTM', action: 'NET BUY', netVal: '+Rp 42.1 M', avgPrice: 'Rp 1.585', lots: '265.600 Lot', date: 'Hari Ini' },
    { ticker: 'TLKM', action: 'NET SELL', netVal: '-Rp 35.8 M', avgPrice: 'Rp 3.140', lots: '114.000 Lot', date: 'Hari Ini' },
    { ticker: 'ASII', action: 'NET SELL', netVal: '-Rp 18.2 M', avgPrice: 'Rp 5.075', lots: '35.800 Lot', date: 'Hari Ini' }
  ];

  var html = '<div class="space-y-4">'
    // Broker Selector Bar
    + '<div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow-md space-y-2.5">'
    + '<div class="flex items-center justify-between">'
    + '<span class="text-xs font-bold text-slate-300 uppercase tracking-wider">Pilih Kode Broker untuk Pelacakan Jejak Transaksi:</span>'
    + '<span class="text-[10px] text-slate-400 font-mono">12 Kode Teratas BEI</span>'
    + '</div>'
    + '<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5">';

  BANDARMOLOGY_BROKER_LIST.forEach(function(b) {
    var isSel = b.code === bCode;
    html += '<button onclick="setBandarmologyBroker(\'' + b.code + '\')" class="p-2 rounded-lg text-center transition font-mono font-bold ' + (isSel ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700/60') + '">'
      + '<div class="text-xs">' + b.code + '</div>'
      + '<div class="text-[9px] font-sans text-slate-400 truncate mt-0.5">' + b.type + '</div>'
      + '</button>';
  });

  html += '</div></div>';

  // Selected Broker Profile & Trail
  html += '<div class="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-md space-y-4">'
    + '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">'
    + '<div class="flex items-center gap-3">'
    + '<div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-black font-mono text-lg text-emerald-400">' + bInfo.code + '</div>'
    + '<div>'
    + '<h3 class="text-sm font-bold text-white">' + bInfo.name + '</h3>'
    + '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">' + bInfo.badge + '</span>'
    + '</div>'
    + '</div>'
    + '<button onclick="openStockChat(\'BBCA\', \'Analisa jejak transaksi broker ' + bInfo.code + ' (' + bInfo.name + ') hari ini di seluruh emiten BEI\')" class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition flex items-center gap-1.5 self-start sm:self-auto">'
    + '<i class="ti ti-messages"></i> <span>Tanya AI tentang ' + bInfo.code + '</span>'
    + '</button>'
    + '</div>'
    + '<div class="overflow-x-auto">'
    + '<table class="w-full text-xs text-left">'
    + '<thead class="text-[10px] text-slate-400 uppercase bg-slate-950/80 border-b border-slate-800 font-mono">'
    + '<tr>'
    + '<th class="p-2.5">Emiten</th>'
    + '<th class="p-2.5">Aksi ' + bInfo.code + '</th>'
    + '<th class="p-2.5">Nilai Transaksi (Rp)</th>'
    + '<th class="p-2.5">Volume (Lot)</th>'
    + '<th class="p-2.5">Estimasi Avg Price</th>'
    + '<th class="p-2.5">Waktu</th>'
    + '<th class="p-2.5">Aksi</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody class="divide-y divide-slate-800/60 font-mono">';

  trailData.forEach(function(item) {
    var isBuy = item.action === 'NET BUY';
    html += '<tr class="hover:bg-slate-800/40 transition">'
      + '<td class="p-2.5 font-bold text-white">' + item.ticker + '</td>'
      + '<td class="p-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ' + (isBuy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40') + '">' + item.action + '</span></td>'
      + '<td class="p-2.5 font-bold ' + (isBuy ? 'text-emerald-400' : 'text-rose-400') + '">' + item.netVal + '</td>'
      + '<td class="p-2.5 text-slate-200">' + item.lots + '</td>'
      + '<td class="p-2.5 text-slate-300">' + item.avgPrice + '</td>'
      + '<td class="p-2.5 text-slate-400">' + item.date + '</td>'
      + '<td class="p-2.5">'
      + '<button onclick="selectStockChatTicker(\'' + item.ticker + '\');setBandarmologyTab(\'broker-flow\');" class="px-2 py-0.8 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold font-sans border border-slate-700 transition">Buka ' + item.ticker + '</button>'
      + '</td>'
      + '</tr>';
  });

  html += '</tbody></table></div></div></div>';
  return html;
}

window.renderBandarmologyCockpitPage = renderBandarmologyCockpitPage;
window.renderBandarmologyMarketFlowView = renderBandarmologyMarketFlowView;
window.renderBandarmologyForeignFlowView = renderBandarmologyForeignFlowView;
window.renderBandarmologyAccumulationView = renderBandarmologyAccumulationView;
window.renderBandarmologyDistributionView = renderBandarmologyDistributionView;
window.renderBandarmologySmartMoneyRadarView = renderBandarmologySmartMoneyRadarView;
window.renderBandarmologyBrokerTrailView = renderBandarmologyBrokerTrailView;


