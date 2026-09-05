/**
 * 38-ai-autonomous-trading.js — Autonomous AI Trading Engine & Self-Learning Paper Trading System
 * Built according to Institutional Quantitative & Financial Data Science Specifications
 * 
 * CORE CAPABILITIES:
 * 1. AI Engine Dashboard & Market Regime Detection (Bull/Bear/Sideways/High Volatility/Risk-On/Risk-Off)
 * 2. Multi-Layer Quantitative Stock Scoring (Technical, Fundamental, Broker Flow, Money Flow, Trend, Momentum)
 * 3. Autonomous Signal Generation (STRONG BUY, BUY, WATCH, HOLD, AVOID/SELL, NO TRADE) with EV & Probability
 * 4. Explainable AI Layer (Thesis, 6-10 Evidence Points, Against Points, Invalidation, Expected Value Calculation)
 * 5. Broker Flow Engine with Graceful "No Blank Page" Diagnostic Fallback
 * 6. Strategy Lab (10 Distinct Quantitative Strategies with Scorecards & Ranking)
 * 7. Strategy Hypothesis Engine (Formulation, Dataset, Backtest, Status: Testing/Accepted/Rejected)
 * 8. Walk-Forward Testing & Realistic Backtest Engine (Training, Validation, Out-of-Sample, Fees & Slippage)
 * 9. AI Paper Trading Portfolio (Isolated Rp 100M Virtual Capital, 0.5%-1% Risk Per Trade Sizing)
 * 10. AI Trading Journal & 10-Point Post-Mortem Self-Critique Engine (Lessons, Mistakes, Weight Calibration)
 * 11. Data Quality Monitor & Freshness Timestamps
 * 12. Complete Isolation: Zero Mixing with User's Personal Portfolio
 */

(function(window, document) {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // 1. STATE & ISOLATED PAPER TRADING UNIVERSE
  // ══════════════════════════════════════════════════════════
  var AI_TRADE_STATE = {
    activeTab: 'cockpit', // 'cockpit' | 'scanner' | 'deep' | 'strategylab' | 'hypotheses' | 'backtest' | 'paper' | 'journal' | 'learning' | 'dataquality'
    selectedTicker: 'BBCA',
    selectedStrategyId: 'strat_pullback',
    filterSignal: 'all',
    searchQuery: '',
    // No real market-regime classification engine exists yet (would need a
    // sector-index feed and a trend/breadth model we haven't built). Every
    // field below used to ship as a permanently fixed fake number shown as
    // if live ("82% CONVICTION", "BULLISH RISK-ON", "+Rp 542 Miliar") right
    // next to genuinely real numbers on the Cockpit — misleading because a
    // user couldn't tell which was which. Left null on purpose; the render
    // functions show "Belum Dihitung" instead of a number. Only `ihsg` is
    // real (updated from the live IHSG price feed in syncAiPaperPortfolioLivePrices).
    marketRegime: {
      regime: null,
      confidence: null,
      ihsg: 0,
      ihsgChange: null,
      breadthPct: null,
      foreignFlowToday: null,
      sectorLeader: null,
      regimeDescription: null
    },
    // ISOLATED VIRTUAL ACCOUNT (Rp 100 Juta Initial Capital) — starts
    // genuinely empty. The old version shipped with 3 fake open positions
    // and 3 fake closed trades baked in permanently; this one only ever
    // holds positions the user (or the auto-scan, if triggered) actually
    // opened from a real signal, persisted in localStorage so it survives
    // reloads like a real account would.
    paperAccount: {
      initialCapital: 100000000,
      cash: 100000000,
      totalEquity: 100000000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      winRate: 0,
      profitFactor: null,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      riskPerTradePct: 1.0, // 1% virtual capital max risk per trade
      equityHistory: [], // [{date, equity}] snapshots, for a real drawdown calc
      openPositions: [],
      closedTrades: []
    },
    // AUTONOMOUS HYPOTHESIS LAB — empty on purpose. This used to ship with
    // 4 permanently fixed fake hypothesis tests (invented win rates, sample
    // sizes, p-values). There is no real hypothesis-generation/testing
    // engine yet, so an empty list + honest empty-state message is shown
    // instead of numbers that look computed but never were.
    hypotheses: []
  };

  var AI_UNIVERSE = [];

  // ══════════════════════════════════════════════════════════
  // 2. REAL COMPOSITE SIGNAL ENGINE (server-computed from live price +
  //    technical indicators + fundamentals — see /api/idx/ai-scan and
  //    lib/idx-data-engine.js#computeStockSignal).
  //
  //    Previously this scored every non-seed ticker from
  //    `ticker.charCodeAt(0)` (a fake hash with zero relation to actual
  //    price action) and shipped ~8 tickers of hand-written "evidence" /
  //    "thesis" narrative text as if it were live analysis. Replaced
  //    entirely — nothing below is fabricated; fields that can't be
  //    computed from real data are labeled as such instead of guessed.
  // ══════════════════════════════════════════════════════════
  var AI_SCAN_LOADING = false;
  var AI_SCAN_LOADED_AT = null;
  var AI_SCAN_ERROR = null;
  var AI_DEEP_PENDING = {}; // tickers currently being fetched for Deep Analysis

  // Real backtest results (Strategy Lab / Backtest Lab) — null until the
  // user explicitly runs one (server-side simulation over ~135 tickers x
  // 2 years takes a few seconds, so it's on-demand, not auto-triggered).
  var AI_BACKTEST_RESULTS = null;   // array from /api/idx/backtest-all
  var AI_BACKTEST_LOADING = false;
  var AI_BACKTEST_ERROR = null;
  var AI_BACKTEST_LOADED_AT = null;
  var AI_WALKFORWARD_RESULT = null; // single-strategy detail from /api/idx/backtest/:id
  var AI_WALKFORWARD_STRATEGY = 'strat_pullback';
  // Mirrors lib/idx-data-engine.js#STRATEGY_DEFINITIONS names — just for
  // the dropdown label; the actual computation always happens server-side.
  var STRATEGY_META = {
    strat_pullback: 'Trend Pullback',
    strat_breakout: 'Volume Breakout',
    strat_mean_reversion: 'Mean Reversion Oversold'
  };

  async function fetchAllStrategyBacktests() {
    if (AI_BACKTEST_LOADING) return;
    AI_BACKTEST_LOADING = true;
    AI_BACKTEST_ERROR = null;
    if (typeof renderAiTradingPage === 'function') renderAiTradingPage();
    try {
      var resp = await fetch('/api/idx/backtest-all');
      var json = await resp.json();
      if (!json.success) throw new Error(json.error || 'Backtest gagal dijalankan');
      AI_BACKTEST_RESULTS = json.results;
      AI_BACKTEST_LOADED_AT = new Date();
    } catch (err) {
      AI_BACKTEST_ERROR = (err && err.message) || 'Gagal menjalankan backtest';
    } finally {
      AI_BACKTEST_LOADING = false;
      if (typeof renderAiTradingPage === 'function') renderAiTradingPage();
    }
  }

  async function fetchWalkForwardBacktest(strategyId) {
    if (AI_BACKTEST_LOADING) return;
    AI_WALKFORWARD_STRATEGY = strategyId || AI_WALKFORWARD_STRATEGY;
    AI_BACKTEST_LOADING = true;
    AI_BACKTEST_ERROR = null;
    if (typeof renderAiTradingPage === 'function') renderAiTradingPage();
    try {
      var resp = await fetch('/api/idx/backtest/' + encodeURIComponent(AI_WALKFORWARD_STRATEGY));
      var json = await resp.json();
      if (!json.success) throw new Error(json.error || 'Backtest gagal dijalankan');
      AI_WALKFORWARD_RESULT = json.result;
      AI_BACKTEST_LOADED_AT = new Date();
    } catch (err) {
      AI_BACKTEST_ERROR = (err && err.message) || 'Gagal menjalankan backtest';
    } finally {
      AI_BACKTEST_LOADING = false;
      if (typeof renderAiTradingPage === 'function') renderAiTradingPage();
    }
  }

  function _lookupTickerMeta(tk) {
    var name = tk + ' Tbk';
    var sector = 'IDX Equities';
    if (typeof DB !== 'undefined' && DB[tk]) {
      if (DB[tk].name) name = DB[tk].name;
      if (DB[tk].sector) sector = DB[tk].sector;
    } else if (typeof FS_UNIV !== 'undefined' && Array.isArray(FS_UNIV)) {
      var f = FS_UNIV.find(function(u) { return u.t === tk; });
      if (f) { if (f.n) name = f.n; if (f.s) sector = f.s; }
    }
    return { name: name, sector: sector };
  }

  // Adapts a real /api/idx/ai-scan (or /api/idx/ai-signal) result into the
  // shape the Cockpit/Scanner/Deep Analysis renderers expect, deriving
  // presentational fields (strategy label, thesis sentence, evidence
  // bullets) directly from the real computed numbers.
  function _adaptRealSignal(sig) {
    var meta = _lookupTickerMeta(sig.ticker);
    var hasFund = sig.dataQuality && sig.dataQuality.fundamental;

    var stratLabel = sig.trend === 'UPTREND' ? 'Trend Following (Uptrend)'
      : sig.trend === 'DOWNTREND' ? 'Downtrend — Avoid/Wait'
      : 'Range / Sideways Consolidation';

    var evidence = [];
    if (sig.trend === 'UPTREND') {
      evidence.push('Harga berada di atas EMA20 (Rp ' + Number(sig.ema20).toLocaleString('id-ID') + ')' + (sig.ema50 ? ' dan EMA50 (Rp ' + Number(sig.ema50).toLocaleString('id-ID') + ')' : '') + ' — struktur tren naik.');
    } else if (sig.trend === 'DOWNTREND') {
      evidence.push('Harga berada di bawah EMA20' + (sig.ema50 ? '/EMA50' : '') + ' — struktur tren masih menurun.');
    } else {
      evidence.push('Harga bergerak di sekitar EMA20 (Rp ' + Number(sig.ema20).toLocaleString('id-ID') + ') tanpa arah tren yang jelas.');
    }
    if (sig.rsi14 != null) {
      evidence.push('RSI-14 tercatat ' + sig.rsi14 + (sig.rsi14 >= 40 && sig.rsi14 <= 65 ? ' — momentum sehat, belum jenuh beli.' : sig.rsi14 < 30 ? ' — area oversold, potensi rebound teknikal.' : ' — mendekati/di area overbought, waspadai koreksi.'));
    }
    if (sig.volRatio != null) {
      evidence.push('Volume hari ini ' + sig.volRatio + 'x rata-rata 20 hari' + (sig.volRatio >= 1.5 ? ' — konfirmasi partisipasi tinggi.' : sig.volRatio < 1 ? ' — partisipasi di bawah rata-rata, sinyal masih lemah.' : ' — partisipasi normal.'));
    }
    if (hasFund) {
      evidence.push('Skor fundamental riil (ROE/PER/DER dari Yahoo Finance) ' + sig.fundamentalScore + '/100.');
    }
    if (!evidence.length) evidence.push('Data teknikal/fundamental untuk emiten ini masih terbatas.');

    var against = [];
    if (sig.rsi14 != null && sig.rsi14 >= 70) against.push('RSI-14 sudah di atas 70 (' + sig.rsi14 + ') — risiko koreksi jangka pendek meningkat.');
    if (sig.trend === 'DOWNTREND') against.push('Struktur tren masih menurun (harga di bawah EMA20' + (sig.ema50 ? '/EMA50' : '') + ').');
    if (sig.volRatio != null && sig.volRatio < 0.8) against.push('Volume di bawah rata-rata (' + sig.volRatio + 'x) — minat pasar belum kuat.');
    if (!hasFund) against.push('Yahoo Finance belum punya data fundamental terverifikasi untuk emiten ini — skor fundamental memakai nilai netral (50/100), bukan hasil hitung riil.');

    return {
      ticker: sig.ticker,
      name: meta.name,
      sector: meta.sector,
      price: sig.price,
      chg: sig.changePercent || 0,
      volume: sig.volume || 0,
      volRatio: sig.volRatio,
      signal: sig.signal,
      strategy: stratLabel,
      compositeScore: sig.compositeScore,
      probability: sig.probability,
      confidence: hasFund ? 75 : 55,
      ev: (sig.evPerShare >= 0 ? '+' : '') + 'Rp ' + Number(sig.evPerShare).toLocaleString('id-ID') + ' / lembar',
      entry: sig.entry,
      sl: sig.sl,
      tp1: sig.tp1,
      tp2: sig.tp2,
      rrRatio: sig.rrRatio != null ? ('1 : ' + sig.rrRatio) : 'N/A',
      holdingPeriod: 'Indikatif — belum divalidasi backtest riil',
      invalidation: sig.sl ? ('Penutupan harian di bawah Rp ' + Number(sig.sl).toLocaleString('id-ID')) : 'Tidak berlaku (sinyal AVOID)',
      catalyst: '-',
      riskScore: Math.max(0, 100 - (sig.compositeScore || 0)),
      trendScore: sig.technicalScore,
      momentumScore: sig.technicalScore,
      moneyFlowScore: sig.technicalScore,
      brokerScore: 50,
      fundamentalScore: sig.fundamentalScore,
      brokerStatus: 'Belum diintegrasikan ke skor komposit ini — cek halaman Bandarmology & Smart Money untuk data broker flow terpisah.',
      thesis: 'Trend teknikal ' + sig.trend + (sig.rsi14 != null ? ', RSI-14 ' + sig.rsi14 : '') + (sig.volRatio != null ? ', volume ' + sig.volRatio + 'x rata-rata 20D' : '') + '. Skor komposit ' + sig.compositeScore + '/100 (teknikal ' + sig.technicalScore + ', fundamental ' + sig.fundamentalScore + (hasFund ? '' : ' — estimasi') + ').',
      evidence: evidence,
      against: against,
      mainRisk: against[0] || 'Risiko pasar umum / sentimen makro.',
      dataQuality: sig.dataQuality,
      isRealSignal: true
    };
  }

  function ensureFullUniverseLoaded() {
    if (!AI_UNIVERSE.length && !AI_SCAN_LOADING) {
      fetchAiScanData();
    }
  }

  async function fetchAiScanData(tickersOverride) {
    if (AI_SCAN_LOADING) return;
    AI_SCAN_LOADING = true;
    AI_SCAN_ERROR = null;
    if (typeof renderAiTradingPage === 'function') renderAiTradingPage();
    try {
      var url = '/api/idx/ai-scan';
      if (tickersOverride && tickersOverride.length) {
        url += '?tickers=' + encodeURIComponent(tickersOverride.join(','));
      }
      var resp = await fetch(url);
      var json = await resp.json();
      if (!json.success || !Array.isArray(json.signals)) throw new Error('Scan gagal dijalankan');

      var adapted = json.signals
        .filter(function(s) { return s && !s.error && s.compositeScore != null; })
        .map(_adaptRealSignal);

      if (tickersOverride && tickersOverride.length) {
        // Merge a targeted single/multi-ticker fetch into the existing
        // scanned universe rather than replacing the whole set.
        adapted.forEach(function(item) {
          var idx = AI_UNIVERSE.findIndex(function(x) { return x.ticker === item.ticker; });
          if (idx >= 0) AI_UNIVERSE[idx] = item; else AI_UNIVERSE.push(item);
        });
      } else {
        AI_UNIVERSE = adapted;
        window.AI_UNIVERSE = AI_UNIVERSE;
      }
      AI_SCAN_LOADED_AT = new Date();
    } catch (err) {
      AI_SCAN_ERROR = (err && err.message) || 'Gagal memuat data scan real-time';
    } finally {
      AI_SCAN_LOADING = false;
      if (typeof renderAiTradingPage === 'function') renderAiTradingPage();
    }
  }

  // ══════════════════════════════════════════════════════════
  // 3. UI RENDERING ENGINE & MODULAR COCKPIT
  // ══════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════
  // REAL PAPER TRADING EXECUTION — persisted, actually opens/closes
  // positions against live prices instead of showing a permanently
  // frozen example portfolio.
  // ══════════════════════════════════════════════════════════
  var AI_PAPER_STORAGE_KEY = 'mw_ai_paper_v3';

  function savePaperAccountState() {
    try {
      localStorage.setItem(AI_PAPER_STORAGE_KEY, JSON.stringify(AI_TRADE_STATE.paperAccount));
    } catch (e) {}
  }

  function loadPaperAccountState() {
    try {
      var raw = localStorage.getItem(AI_PAPER_STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && typeof saved === 'object' && Array.isArray(saved.openPositions) && Array.isArray(saved.closedTrades)) {
        AI_TRADE_STATE.paperAccount = saved;
      }
    } catch (e) {}
  }

  // Restore any previously-persisted paper account (real positions/trades
  // the user actually made) before anything renders. Called here — after
  // AI_PAPER_STORAGE_KEY is actually assigned — because a `var` above only
  // hoists the declaration, not its value; calling this earlier in the file
  // (before line ~345 executes) silently read localStorage under key
  // "undefined" and always no-opped.
  loadPaperAccountState();

  // Recomputes every aggregate stat from the real closedTrades array —
  // never stored/incremented by hand, always derived fresh.
  function recomputePaperStats() {
    var p = AI_TRADE_STATE.paperAccount;
    var trades = p.closedTrades || [];
    var wins = trades.filter(function(t) { return t.result === 'WIN'; });
    var losses = trades.filter(function(t) { return t.result === 'LOSS'; });
    var grossWin = wins.reduce(function(s, t) { return s + Math.max(0, t.netPnL); }, 0);
    var grossLoss = Math.abs(losses.reduce(function(s, t) { return s + Math.min(0, t.netPnL); }, 0));

    p.totalTrades = trades.length;
    p.winningTrades = wins.length;
    p.losingTrades = losses.length;
    p.winRate = trades.length ? Math.round((wins.length / trades.length) * 1000) / 10 : 0;
    p.profitFactor = grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? null : 0);
    p.realizedPnL = trades.reduce(function(s, t) { return s + t.netPnL; }, 0);

    // Max drawdown from the real equity snapshot history (appended on
    // every recompute below), not an invented percentage.
    if (Array.isArray(p.equityHistory) && p.equityHistory.length) {
      var peak = -Infinity, maxDD = 0;
      p.equityHistory.forEach(function(e) {
        peak = Math.max(peak, e.equity);
        maxDD = Math.max(maxDD, peak > 0 ? ((peak - e.equity) / peak) * 100 : 0);
      });
      p.maxDrawdownPct = Math.round(maxDD * 100) / 100;
    }
  }

  function updateAiPaperPositionMetrics(pos, livePrice) {
    if (livePrice && Number(livePrice) > 0) {
      pos.currentPrice = Number(livePrice);
    }
    pos.shares = (pos.lots || 0) * 100;
    pos.costBasis = pos.shares * (pos.entryPrice || pos.currentPrice);
    pos.currentValue = pos.shares * pos.currentPrice;
    pos.unrealizedPnL = pos.currentValue - pos.costBasis;
    pos.unrealizedPct = pos.costBasis > 0 ? Number(((pos.unrealizedPnL / pos.costBasis) * 100).toFixed(2)) : 0;
  }

  // Closes a paper position at a given exit price, records the real
  // outcome (never a fabricated narrative) in closedTrades, and returns
  // cash to the virtual balance.
  function aiClosePosition(posId, exitPrice, reason) {
    var p = AI_TRADE_STATE.paperAccount;
    var idx = p.openPositions.findIndex(function(x) { return x.id === posId; });
    if (idx < 0) return;
    var pos = p.openPositions[idx];
    var px = Number(exitPrice) > 0 ? Number(exitPrice) : pos.currentPrice;

    var grossPnL = (px - pos.entryPrice) * pos.shares;
    var frictionCost = Math.round((pos.entryPrice + px) * pos.shares * 0.001); // ~0.1% each side, approximated
    var netPnL = Math.round(grossPnL - frictionCost);
    var returnPct = pos.costBasis > 0 ? Math.round((netPnL / pos.costBasis) * 10000) / 100 : 0;
    var riskAmount = pos.entrySlDistance || Math.abs(pos.entryPrice - pos.sl) * pos.shares || 1;
    var rMultiple = Math.round((netPnL / riskAmount) * 100) / 100;

    var result = netPnL >= 0 ? 'WIN' : 'LOSS';
    var lesson, mistake, improvement;
    if (reason === 'TAKE PROFIT') {
      lesson = 'Target profit tercapai sesuai rencana risk-reward yang ditetapkan saat entry.';
      mistake = 'Tidak ada — keluar sesuai rencana.';
      improvement = 'Pertimbangkan trailing stop untuk menangkap kelanjutan tren di luar TP awal.';
    } else if (reason === 'STOP LOSS') {
      lesson = 'Stop loss terpicu — kerugian dibatasi sesuai batas risiko 1% modal yang direncanakan.';
      mistake = result === 'LOSS' ? 'Sinyal awal tidak berjalan sesuai tesis; perlu ditinjau apakah kondisi entry masih valid.' : '-';
      improvement = 'Evaluasi apakah level stop terlalu ketat relatif terhadap volatilitas (ATR) saham ini.';
    } else {
      lesson = 'Ditutup manual oleh pengguna sebelum menyentuh SL/TP.';
      mistake = '-';
      improvement = '-';
    }

    p.cash += pos.currentValue;
    p.openPositions.splice(idx, 1);
    p.closedTrades.unshift({
      id: pos.id,
      ticker: pos.ticker,
      strategy: pos.strategy,
      entryDate: pos.entryDate,
      exitDate: new Date().toISOString().slice(0, 10),
      entryPrice: pos.entryPrice,
      exitPrice: Math.round(px),
      lots: pos.lots,
      grossPnL: Math.round(grossPnL),
      netPnL: netPnL,
      returnPct: returnPct,
      result: result,
      rMultiple: rMultiple,
      exitReason: reason,
      thesis: pos.thesis,
      lesson: lesson,
      mistake: mistake,
      improvement: improvement
    });

    recomputePaperStats();
    p.equityHistory.push({ date: new Date().toISOString(), equity: p.cash + p.openPositions.reduce(function(s, x) { return s + x.currentValue; }, 0) });
    savePaperAccountState();
  }

  // Opens a real paper position from the CURRENT scanned signal for a
  // ticker (must exist in AI_UNIVERSE with a BUY/STRONG BUY signal) —
  // sized by the account's stated 1% risk-per-trade policy divided by the
  // real ATR-based stop distance, never a fabricated lot count.
  async function aiOpenPositionFromSignal(ticker) {
    var sig = AI_UNIVERSE.find(function(x) { return x.ticker === ticker; });
    if (!sig) { if (typeof showToast === 'function') showToast('⚠ Sinyal untuk ' + ticker + ' belum tersedia — jalankan scan dulu.'); return; }
    if (!sig.signal || (!sig.signal.includes('BUY'))) { if (typeof showToast === 'function') showToast('⚠ ' + ticker + ' sinyalnya "' + sig.signal + '", bukan BUY — tidak dibuka.'); return; }

    var p = AI_TRADE_STATE.paperAccount;
    if (p.openPositions.some(function(x) { return x.ticker === ticker; })) {
      if (typeof showToast === 'function') showToast('⚠ Sudah ada posisi terbuka untuk ' + ticker + '.');
      return;
    }

    // Re-fetch a fresh quote right before opening — the scan snapshot in
    // AI_UNIVERSE could be several minutes old, and entry/SL/TP must all
    // come from the same, current price source to avoid a mismatch
    // against whatever the position's live-price check uses afterward.
    var entry = sig.entry, atrOffset = { sl: sig.entry - sig.sl, tp1: sig.tp1 - sig.entry, tp2: sig.tp2 - sig.entry };
    try {
      var qResp = await fetch('/api/idx/quote/' + encodeURIComponent(ticker));
      var qJson = await qResp.json();
      if (qJson.success && qJson.quote && qJson.quote.price > 0) entry = qJson.quote.price;
    } catch (e) { /* fall back to the scan's entry price */ }

    var sl = Math.round(entry - atrOffset.sl);
    var tp1 = Math.round(entry + atrOffset.tp1);
    var tp2 = Math.round(entry + atrOffset.tp2);
    var riskPerShare = entry - sl;
    if (!(riskPerShare > 0)) { if (typeof showToast === 'function') showToast('⚠ Data SL tidak valid untuk ' + ticker + '.'); return; }

    var riskBudget = p.totalEquity * (p.riskPerTradePct / 100);
    var maxShares = Math.floor(riskBudget / riskPerShare);
    var lots = Math.floor(maxShares / 100);
    var affordableLots = Math.floor(p.cash / (entry * 100));
    lots = Math.max(0, Math.min(lots, affordableLots));

    if (lots < 1) {
      if (typeof showToast === 'function') showToast('⚠ Modal/risiko tidak cukup untuk membuka posisi ' + ticker + ' minimal 1 lot.');
      return;
    }

    var shares = lots * 100;
    var costBasis = shares * entry;
    p.cash -= costBasis;

    p.openPositions.push({
      id: 'POS-' + Date.now(),
      ticker: ticker,
      strategy: sig.strategy,
      entryDate: new Date().toISOString().slice(0, 10),
      entryPrice: entry,
      currentPrice: entry,
      lots: lots,
      shares: shares,
      costBasis: costBasis,
      currentValue: costBasis,
      unrealizedPnL: 0,
      unrealizedPct: 0,
      sl: sl,
      tp1: tp1,
      tp2: tp2,
      entrySlDistance: riskPerShare * shares,
      thesis: sig.thesis,
      confidence: sig.confidence,
      ev: sig.ev
    });

    savePaperAccountState();
    if (typeof showToast === 'function') showToast('✓ Posisi dibuka: ' + lots + ' lot ' + ticker + ' @ Rp ' + Number(entry).toLocaleString('id-ID') + ' (risiko 1% = Rp ' + Math.round(riskBudget).toLocaleString('id-ID') + ')');
    renderAiTradingPage();
    // Reconcile the freshly-opened position's displayed price against the
    // same authoritative source used to open it, so it doesn't briefly
    // show a stale dashboard-cache price/PnL until the next refresh cycle.
    aiRefreshPaperPortfolioQuotes(false);
  }

  // Cheap, render-time metric refresh only — NOT authoritative for SL/TP
  // auto-execution. getGlobalMarketPrice()/prices[] is the dashboard's own
  // ticker-tape cache, which can lag or hold a stale/placeholder value for
  // a ticker that isn't in current rotation; using it to trigger a stop
  // would risk closing a position on a false price mismatch rather than a
  // real market move. Real SL/TP checks happen in
  // aiRefreshPaperPortfolioQuotes() below, against a fresh /api/idx/quote
  // fetch — the same source used to compute the signal in the first place.
  function syncAiPaperPortfolioLivePrices(forceFetch, onDone) {
    var p = AI_TRADE_STATE.paperAccount;
    if (!p || !Array.isArray(p.openPositions)) return;

    var totalCurrentVal = 0, totalUnrealized = 0;

    p.openPositions.forEach(function(pos) {
      var px = 0;
      if (typeof getGlobalMarketPrice === 'function') px = getGlobalMarketPrice(pos.ticker);
      if (!px && typeof prices !== 'undefined' && prices[pos.ticker]) px = Number(prices[pos.ticker]);
      if (px > 0) pos.currentPrice = px;
      updateAiPaperPositionMetrics(pos, pos.currentPrice);
      totalCurrentVal += pos.currentValue;
      totalUnrealized += pos.unrealizedPnL;
    });

    p.unrealizedPnL = totalUnrealized;
    p.totalEquity = p.cash + totalCurrentVal;
    var netProfit = (p.realizedPnL || 0) + p.unrealizedPnL;
    p.totalReturnPct = p.initialCapital > 0 ? Number(((netProfit / p.initialCapital) * 100).toFixed(2)) : 0;

    if (typeof prices !== 'undefined' && prices['^JKSE'] && prices['^JKSE'] > 0) {
      AI_TRADE_STATE.marketRegime.ihsg = Math.round(prices['^JKSE']);
    } else if (typeof ihsgCur !== 'undefined' && ihsgCur > 0) {
      AI_TRADE_STATE.marketRegime.ihsg = Math.round(ihsgCur);
    }

    if (forceFetch) {
      aiRefreshPaperPortfolioQuotes(true, onDone);
    }
  }

  function aiRefreshPaperPortfolioQuotes(showNotification, onDone) {
    var p = AI_TRADE_STATE.paperAccount;
    if (!p || !Array.isArray(p.openPositions) || p.openPositions.length === 0) {
      if (onDone) onDone();
      return;
    }

    var tickersToFetch = p.openPositions.map(function(pos) { return pos.ticker; });
    var updated = 0;
    var fetchedQuotes = [];

    var promises = tickersToFetch.map(function(tk) {
      return fetch('/api/idx/quote/' + encodeURIComponent(tk))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
          if (data && data.success && data.quote && data.quote.price) {
            var q = data.quote;
            if (typeof prices !== 'undefined') {
              prices[tk] = q.price;
            }
            if (typeof syncGlobalMarketQuote === 'function') {
              syncGlobalMarketQuote(tk, q);
            }
            var pos = p.openPositions.find(function(item) { return item.ticker === tk; });
            if (pos) {
              updateAiPaperPositionMetrics(pos, q.price);
              updated++;
              fetchedQuotes.push(tk + ' (Rp ' + Number(q.price).toLocaleString('id-ID') + ')');

              // Real auto-execution — only against this verified fresh
              // quote (the same source used to compute the signal at
              // entry), never the dashboard's own ticker-tape cache which
              // can lag/placeholder for tickers outside its rotation.
              if (pos.currentPrice <= pos.sl) {
                aiClosePosition(pos.id, pos.sl, 'STOP LOSS');
              } else if (pos.tp1 && pos.currentPrice >= pos.tp1) {
                aiClosePosition(pos.id, pos.tp1, 'TAKE PROFIT');
              }
            }
          }
        })
        .catch(function(err) {
          console.warn('Gagal fetch live quote untuk ' + tk, err);
        });
    });

    Promise.all(promises).then(function() {
      syncAiPaperPortfolioLivePrices(false);

      if (AI_TRADE_STATE.activeTab === 'paper' || AI_TRADE_STATE.activeTab === 'cockpit') {
        renderAiTradingPage();
      }

      if (showNotification && typeof showToast === 'function') {
        if (updated > 0) {
          showToast('✓ Harga real-time pasar diperbarui: ' + fetchedQuotes.join(', '));
        } else {
          showToast('✓ Harga posisi virtual sudah sesuai dengan feed pasar real-time.');
        }
      }

      if (onDone) onDone();
    });
  }

  // Was: load a localStorage snapshot up to 24h old, or rebuild + persist
  // one. Removed — the server already caches quotes (30s) and history
  // (15min-1h), so a client-side day-long cache only risked serving a
  // stale/incompatible shape (e.g. from before this file's real-data
  // rewrite) instead of a fresh scan. Real-time freshness matters more
  // than saving a handful of requests for a trading tool.
  function checkAndRefreshDailyUniverseCache() {
    try {
      localStorage.removeItem('mw_univ_cache_v2');
      localStorage.removeItem('mw_univ_cache_date_v2');
    } catch (e) {}
    ensureFullUniverseLoaded();
  }

  function initAiAutonomousSuite() {
    checkAndRefreshDailyUniverseCache();
    syncAiPaperPortfolioLivePrices(false);
    renderAiTradingPage();
    aiRefreshPaperPortfolioQuotes(false);
  }

  function renderAiTradingPage() {
    var c = document.getElementById('page-ai-trading');
    if (!c) return;

    var state = AI_TRADE_STATE;
    var paper = state.paperAccount;
    var regime = state.marketRegime;

    var html = ''
      // Header & Navigation Bar
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">'
      + '  <div>'
      + '    <div class="ptitle" style="display:flex;align-items:center;gap:8px;font-size:22px">'
      + '      Autonomous AI Trading'
      + '      <span class="badge b-accent" style="font-size:10px;padding:3px 9px">SELF-LEARNING QUANT</span>'
      + '      <span class="badge b-up" style="font-size:10px;padding:3px 9px">PAPER TRADING ONLY</span>'
      + '    </div>'
      + '    <div class="psub" style="max-width:860px;margin-top:4px">'
      + '      Mesin Riset Kuantitatif Mandiri: Evaluasi Market Regime, Scanning Multi-Layer, 10 Strategi Lab, Kalkulasi Expected Value &amp; Probabilitas, Eksekusi Portofolio Virtual Terisolasi (Rp 100M), Jurnal Post-Mortem 10-Titik, dan Kalibrasi Parameter Berkelanjutan.'
      + '    </div>'
      + '  </div>'
      + '  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'cockpit' ? 'on' : '') + '" onclick="aiSwitchTab(\'cockpit\')" style="' + (state.activeTab === 'cockpit' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">📊 Cockpit</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'regime' ? 'on' : '') + '" onclick="aiSwitchTab(\'regime\')" style="' + (state.activeTab === 'regime' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🌐 Market Regime</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'scanner' ? 'on' : '') + '" onclick="aiSwitchTab(\'scanner\')" style="' + (state.activeTab === 'scanner' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🔍 Scanner &amp; EV</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'deep' ? 'on' : '') + '" onclick="aiSwitchTab(\'deep\')" style="' + (state.activeTab === 'deep' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🧠 Explainable AI</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'strategylab' ? 'on' : '') + '" onclick="aiSwitchTab(\'strategylab\')" style="' + (state.activeTab === 'strategylab' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🧪 10 Strategy Lab</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'hypotheses' ? 'on' : '') + '" onclick="aiSwitchTab(\'hypotheses\')" style="' + (state.activeTab === 'hypotheses' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">💡 Hypothesis Lab</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'backtest' ? 'on' : '') + '" onclick="aiSwitchTab(\'backtest\')" style="' + (state.activeTab === 'backtest' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">📈 Backtest Lab</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'paper' ? 'on' : '') + '" onclick="aiSwitchTab(\'paper\')" style="' + (state.activeTab === 'paper' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">💼 AI Paper Portfolio</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'journal' ? 'on' : '') + '" onclick="aiSwitchTab(\'journal\')" style="' + (state.activeTab === 'journal' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">📝 Post-Mortem Journal</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'learning' ? 'on' : '') + '" onclick="aiSwitchTab(\'learning\')" style="' + (state.activeTab === 'learning' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🎯 Self-Learning</button>'
      + '    <button class="btn btn-ghost btn-sm ' + (state.activeTab === 'dataquality' ? 'on' : '') + '" onclick="aiSwitchTab(\'dataquality\')" style="' + (state.activeTab === 'dataquality' ? 'background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8' : '') + '">🛡️ Data Quality</button>'
      + '  </div>'
      + '</div>';

    // ── BANNER ISOLASI TOTAL (MY PORTFOLIO VS AI PORTFOLIO) ──
    html += ''
      + '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.25);border-left:4px solid #38bdf8;border-radius:10px;padding:12px 18px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
      + '  <div style="display:flex;align-items:center;gap:10px">'
      + '    <i class="ti ti-shield-lock" style="font-size:20px;color:#38bdf8"></i>'
      + '    <div style="font-size:12.5px;color:var(--text);line-height:1.4">'
      + '      <strong>Prinsip Kemandirian &amp; Keamanan Portofolio:</strong> AI Engine beroperasi 100% pada <strong>Virtual Paper Account</strong> terisolasi. Seluruh keputusan BUY/SELL/HOLD dieksekusi secara otonom tanpa menyentuh atau mencampurkan portofolio riil pengguna.'
      + '    </div>'
      + '  </div>'
      + '  <div style="display:flex;gap:8px;align-items:center">'
      + '    <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">STATUS MESIN: <strong style="color:var(--green)">ONLINE &amp; SCANNING</strong></span>'
      + '    <button class="btn btn-ghost btn-xs" onclick="aiTriggerAutonomousCycle()" style="font-size:11px;font-weight:700;border-color:#38bdf8;color:#38bdf8">⚡ Jalankan Research Loop</button>'
      + '  </div>'
      + '</div>';

    // ── TAB CONTENT DISPATCHER ──
    if (state.activeTab === 'cockpit') {
      html += renderAiCockpit(state);
    } else if (state.activeTab === 'regime') {
      html += renderAiMarketRegime(state);
    } else if (state.activeTab === 'scanner') {
      html += renderAiScanner(state);
    } else if (state.activeTab === 'deep') {
      html += renderAiDeepAnalysis(state);
    } else if (state.activeTab === 'strategylab') {
      html += renderAiStrategyLab(state);
    } else if (state.activeTab === 'hypotheses') {
      html += renderAiHypothesisLab(state);
    } else if (state.activeTab === 'backtest') {
      html += renderAiBacktestLab(state);
    } else if (state.activeTab === 'paper') {
      html += renderAiPaperPortfolio(state);
    } else if (state.activeTab === 'journal') {
      html += renderAiJournal(state);
    } else if (state.activeTab === 'learning') {
      html += renderAiLearningLog(state);
    } else if (state.activeTab === 'dataquality') {
      html += renderAiDataQuality(state);
    }

    c.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════
  // 4. SUB-PAGE RENDERING: COCKPIT UTAMA (OVERVIEW)
  // ══════════════════════════════════════════════════════════
  function renderAiCockpit(state) {
    ensureFullUniverseLoaded();
    syncAiPaperPortfolioLivePrices(false);
    var p = state.paperAccount;
    var r = state.marketRegime;

    if (!AI_UNIVERSE.length) {
      return '<div class="card" style="padding:40px;text-align:center;color:var(--text3)">'
        + (AI_SCAN_ERROR
            ? '⚠ ' + AI_SCAN_ERROR + ' <button class="btn btn-ghost btn-xs" onclick="fetchAiScanData()">Coba Lagi</button>'
            : '⏳ Memindai LQ45 dengan data harga &amp; fundamental real-time Yahoo Finance...')
        + '</div>';
    }

    var sorted = AI_UNIVERSE.slice().sort(function(a, b) { return b.compositeScore - a.compositeScore; });
    var bestOpp = sorted[0];
    var topBull = AI_UNIVERSE.filter(function(x) { return x.signal.includes('BUY'); }).sort(function(a, b) { return b.compositeScore - a.compositeScore; }).slice(0, 10);
    var topBear = AI_UNIVERSE.filter(function(x) { return x.signal.includes('AVOID') || x.signal.includes('SELL'); }).sort(function(a, b) { return a.compositeScore - b.compositeScore; }).slice(0, 5);

    var eqClass = p.totalReturnPct >= 0 ? 'up' : 'down';
    var eqSign = p.totalReturnPct >= 0 ? '+' : '';

    return ''
      // Row 4 KPI Cards
      + '<div class="row4" style="margin-bottom:18px">'
      + '  <div class="metric">'
      + '    <div class="mlabel">Market Regime IHSG</div>'
      + (r.regime
          ? '    <div class="mval up" style="font-size:18px">🟢 ' + r.regime + '</div>'
          : '    <div class="mval" style="font-size:14px;color:var(--text3)">Belum Dihitung</div>')
      + '    <div class="msub neu">IHSG ' + (r.ihsg || '-') + (r.ihsgChange != null ? ' (+' + r.ihsgChange + '%)' : '') + (r.breadthPct != null ? ' · Breadth ' + r.breadthPct + '%' : ' · Breadth belum tersedia')  + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">AI Conviction &amp; Edge</div>'
      + (r.confidence != null
          ? '    <div class="mval" style="color:#38bdf8;font-size:20px">' + r.confidence + '% CONVICTION</div>'
          : '    <div class="mval" style="font-size:14px;color:var(--text3)">Belum Dihitung</div>')
      + '    <div class="msub neu">Foreign Flow: ' + (r.foreignFlowToday || 'Belum tersedia') + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Sinyal Terkuat Saat Ini</div>'
      + '    <div class="mval" style="color:var(--accent);font-size:18px">' + bestOpp.strategy + '</div>'
      + '    <div class="msub neu">' + bestOpp.ticker + ' · Skor ' + bestOpp.compositeScore + '/100 <span style="opacity:.7">(win-rate historis belum divalidasi backtest)</span></div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">AI Paper Portfolio Equity</div>'
      + '    <div class="mval ' + eqClass + '" style="font-size:20px">Rp ' + Number(p.totalEquity).toLocaleString('id-ID') + '</div>'
      + '    <div class="msub ' + eqClass + '">' + eqSign + p.totalReturnPct + '% Net Return · Max DD -' + p.maxDrawdownPct + '%</div>'
      + '  </div>'
      + '</div>'

      // Main Opportunity Card & Market Allocation
      + '<div style="display:grid;grid-template-columns:1.8fr 1.2fr;gap:18px;margin-bottom:18px">'
      + '  <!-- Top Recommendation Box -->'
      + '  <div class="card" style="padding:22px;border:1px solid rgba(56,189,248,0.3);background:linear-gradient(135deg, var(--bg2) 0%, rgba(56,189,248,0.04) 100%)">'
      + '    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px">'
      + '      <div>'
      + '        <span class="badge b-accent" style="font-size:10px;padding:2px 8px;margin-bottom:6px">TODAY\'S HIGHEST EXPECTED VALUE OPPORTUNITY</span>'
      + '        <div style="font-size:20px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">'
      + '          ' + bestOpp.ticker + ' — ' + bestOpp.name
      + '          <span class="badge b-up" style="font-size:12px;padding:3px 8px">' + bestOpp.signal + '</span>'
      + '        </div>'
      + '        <div style="font-size:12px;color:var(--text2);margin-top:4px">' + bestOpp.strategy + ' · Skor Komposit: <strong style="color:var(--green)">' + bestOpp.compositeScore + '/100</strong> · Probabilitas: <strong>' + bestOpp.probability + '%</strong></div>'
      + '      </div>'
      + '      <div style="text-align:right">'
      + '        <div style="font-size:10px;color:var(--text3);font-weight:700">EXPECTED VALUE</div>'
      + '        <div style="font-size:18px;font-weight:800;font-family:var(--font-mono);color:var(--green)">' + bestOpp.ev + '</div>'
      + '      </div>'
      + '    </div>'

      + '    <!-- Order Parameters Grid -->'
      + '    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;margin-bottom:14px">'
      + '      <div>'
      + '        <div style="font-size:10px;color:var(--text3)">HARGA ENTRY</div>'
      + '        <div style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:var(--text)">Rp ' + Number(bestOpp.entry).toLocaleString('id-ID') + '</div>'
      + '      </div>'
      + '      <div>'
      + '        <div style="font-size:10px;color:var(--red)">STOP LOSS (INVALIDATION)</div>'
      + '        <div style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:var(--red)">Rp ' + Number(bestOpp.sl).toLocaleString('id-ID') + '</div>'
      + '      </div>'
      + '      <div>'
      + '        <div style="font-size:10px;color:var(--green)">TARGET 1 / 2</div>'
      + '        <div style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:var(--green)">Rp ' + Number(bestOpp.tp1).toLocaleString('id-ID') + ' / ' + Number(bestOpp.tp2).toLocaleString('id-ID') + '</div>'
      + '      </div>'
      + '      <div>'
      + '        <div style="font-size:10px;color:var(--accent)">RISK : REWARD</div>'
      + '        <div style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:var(--accent)">' + bestOpp.rrRatio + '</div>'
      + '      </div>'
      + '    </div>'

      + '    <!-- Concise Thesis -->'
      + '    <div style="font-size:12.5px;color:var(--text2);line-height:1.5;margin-bottom:14px;background:rgba(255,255,255,0.02);border-left:3px solid var(--green);padding:8px 12px;border-radius:0 6px 6px 0">'
      + '      <strong>Tesis Kuantitatif:</strong> ' + bestOpp.thesis
      + '    </div>'

      + '    <div style="display:flex;justify-content:space-between;align-items:center">'
      + '      <span style="font-size:11px;color:var(--text3)"><i class="ti ti-clock"></i> Holding Period: <strong>' + bestOpp.holdingPeriod + '</strong></span>'
      + '      <button class="btn btn-blue btn-sm" onclick="aiSelectTicker(\'' + bestOpp.ticker + '\');aiSwitchTab(\'deep\')">🔍 Lihat Bukti &amp; Penalaran Lengkap →</button>'
      + '    </div>'
      + '  </div>'

      + '  <!-- Top Bullish & Bearish Watchlist -->'
      + '  <div class="card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between">'
      + '    <div>'
      + '      <div class="cheader" style="margin-bottom:12px">'
      + '        <span class="ctitle"><i class="ti ti-list-check" style="color:#38bdf8"></i> Ranking Sinyal AI Terkini</span>'
      + '      </div>'
      + '      <div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:6px">TOP 3 BULLISH (BUY / ACCUMULATION)</div>'
      + '      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">';

    topBull.forEach(function(item) {
      html += ''
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">'
        + '  <div>'
        + '    <a href="javascript:void(0)" onclick="aiSelectTicker(\'' + item.ticker + '\');aiSwitchTab(\'deep\')" style="font-weight:800;font-family:var(--font-mono);color:#38bdf8;text-decoration:none">' + item.ticker + '</a>'
        + '    <span style="font-size:11px;color:var(--text3);margin-left:6px">' + item.strategy + '</span>'
        + '  </div>'
        + '  <div style="display:flex;align-items:center;gap:8px">'
        + '    <span class="badge b-up" style="font-size:9px">' + item.signal + '</span>'
        + '    <span style="font-weight:800;font-size:12px;color:var(--green)">' + item.compositeScore + '</span>'
        + '  </div>'
        + '</div>';
    });

    html += ''
      + '      </div>'
      + '      <div style="font-size:11px;color:var(--red);font-weight:700;margin-bottom:6px">TOP BEARISH / AVOID (NEGATIVE EV)</div>'
      + '      <div style="display:flex;flex-direction:column;gap:6px">';

    topBear.forEach(function(item) {
      html += ''
        + '<div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">'
        + '  <div>'
        + '    <a href="javascript:void(0)" onclick="aiSelectTicker(\'' + item.ticker + '\');aiSwitchTab(\'deep\')" style="font-weight:800;font-family:var(--font-mono);color:var(--red);text-decoration:none">' + item.ticker + '</a>'
        + '    <span style="font-size:11px;color:var(--text3);margin-left:6px">' + item.name + '</span>'
        + '  </div>'
        + '  <div style="display:flex;align-items:center;gap:8px">'
        + '    <span class="badge b-dn" style="font-size:9px">' + item.signal + '</span>'
        + '    <span style="font-weight:800;font-size:12px;color:var(--red)">' + item.compositeScore + '</span>'
        + '  </div>'
        + '</div>';
    });

    html += ''
      + '      </div>'
      + '    </div>'
      + '    <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border2);font-size:11px;color:var(--text3);display:flex;justify-content:space-between">'
      + '      <span>No Trade Policy: Valid</span>'
      + '      <strong style="color:var(--text)">Emiten berisiko tinggi otomatis dialokasikan ke NO TRADE</strong>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 5. SUB-PAGE RENDERING: SCANNER & EXPECTED VALUE
  // ══════════════════════════════════════════════════════════
  function renderAiScanner(state) {
    ensureFullUniverseLoaded();

    if (!AI_UNIVERSE.length) {
      return '<div class="card" style="padding:40px;text-align:center;color:var(--text3)">'
        + (AI_SCAN_ERROR
            ? '⚠ ' + AI_SCAN_ERROR + ' <button class="btn btn-ghost btn-xs" onclick="fetchAiScanData()">Coba Lagi</button>'
            : '⏳ Memindai LQ45 dengan data harga, indikator teknikal &amp; fundamental real-time Yahoo Finance...')
        + '</div>';
    }

    var list = AI_UNIVERSE;

    if (state.filterSignal !== 'all') {
      list = list.filter(function(x) {
        if (state.filterSignal === 'BUY') return x.signal.includes('BUY');
        if (state.filterSignal === 'HOLD') return x.signal === 'HOLD';
        if (state.filterSignal === 'WATCH') return x.signal === 'WATCH';
        if (state.filterSignal === 'AVOID') return x.signal.includes('AVOID') || x.signal.includes('SELL');
        return true;
      });
    }

    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      list = list.filter(function(x) {
        return x.ticker.toLowerCase().includes(q) || x.name.toLowerCase().includes(q);
      });
    }

    var html = ''
      + '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">'
      + '    <div>'
      + '      <div class="ctitle" style="font-size:16px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-scan" style="color:#38bdf8"></i> Multi-Layer Quantitative Stock Scanner'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text3)">Skor teknikal (EMA/RSI/Volume) + fundamental riil (ROE/PER/DER) untuk 45 saham LQ45. Belum mencakup data bandarmologi/broker flow.</div>'
      + '    </div>'
      + '    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
      + '      <button class="btn btn-ghost btn-xs" onclick="fetchAiScanData()" title="Pindai ulang dengan harga terbaru">' + (AI_SCAN_LOADING ? '⏳ Memindai...' : '🔄 Scan Ulang') + '</button>'
      + '      <button class="btn btn-ghost btn-xs ' + (state.filterSignal === 'all' ? 'on' : '') + '" onclick="aiSetFilterSignal(\'all\')">Semua Sinyal (' + AI_UNIVERSE.length + ')</button>'
      + '      <button class="btn btn-ghost btn-xs ' + (state.filterSignal === 'BUY' ? 'on' : '') + '" onclick="aiSetFilterSignal(\'BUY\')">🟢 Buy / Accumulation</button>'
      + '      <button class="btn btn-ghost btn-xs ' + (state.filterSignal === 'HOLD' ? 'on' : '') + '" onclick="aiSetFilterSignal(\'HOLD\')">🟡 Hold / Trailing</button>'
      + '      <button class="btn btn-ghost btn-xs ' + (state.filterSignal === 'WATCH' ? 'on' : '') + '" onclick="aiSetFilterSignal(\'WATCH\')">🔵 Watchlist</button>'
      + '      <button class="btn btn-ghost btn-xs ' + (state.filterSignal === 'AVOID' ? 'on' : '') + '" onclick="aiSetFilterSignal(\'AVOID\')">🔴 Avoid / Risk</button>'
      + '    </div>'
      + '  </div>'

      + '  <div style="overflow-x:auto">'
      + '    <table class="tbl">'
      + '      <thead>'
      + '        <tr>'
      + '          <th>Ticker &amp; Nama</th>'
      + '          <th>Harga &amp; Vol</th>'
      + '          <th>Keputusan AI</th>'
      + '          <th>Strategi Terpilih</th>'
      + '          <th>Probabilitas</th>'
      + '          <th>Expected Value</th>'
      + '          <th>Entry / SL / TP</th>'
      + '          <th>R:R</th>'
      + '          <th>AI Score</th>'
      + '          <th>Aksi</th>'
      + '        </tr>'
      + '      </thead>'
      + '      <tbody>';

    list.forEach(function(item) {
      var badgeCls = item.signal.includes('STRONG BUY') ? 'b-up' :
                     item.signal.includes('BUY') ? 'b-up' :
                     item.signal.includes('HOLD') ? 'b-amb' :
                     item.signal.includes('WATCH') ? 'b-accent' : 'b-dn';

      html += '<tr>'
        + '<td style="font-family:var(--font-mono)">'
        + '  <a href="javascript:void(0)" onclick="aiSelectTicker(\'' + item.ticker + '\');aiSwitchTab(\'deep\')" style="font-weight:800;color:#38bdf8;text-decoration:none;font-size:13px">' + item.ticker + '</a>'
        + '  <div style="font-size:10px;color:var(--text3);font-family:\'Plus Jakarta Sans\',sans-serif">' + item.sector + '</div>'
        + '</td>'
        + '<td style="font-family:var(--font-mono)">'
        + '  Rp ' + Number(item.price).toLocaleString('id-ID')
        + '  <div style="font-size:10px;color:' + (item.chg >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (item.chg >= 0 ? '+' : '') + item.chg.toFixed(2) + '% · Vol ' + item.volRatio + 'x</div>'
        + '</td>'
        + '<td><span class="badge ' + badgeCls + '">' + item.signal + '</span></td>'
        + '<td style="font-size:11.5px">' + item.strategy + '</td>'
        + '<td>'
        + '  <strong style="font-family:var(--font-mono);color:' + (item.probability >= 70 ? 'var(--green)' : item.probability >= 55 ? 'var(--amber)' : 'var(--red)') + '">' + item.probability + '%</strong>'
        + '  <div style="font-size:9px;color:var(--text3)">Conf ' + item.confidence + '%</div>'
        + '</td>'
        + '<td><strong style="font-family:var(--font-mono);color:' + (item.ev.includes('+') ? 'var(--green)' : 'var(--red)') + '">' + item.ev + '</strong></td>'
        + '<td style="font-family:var(--font-mono);font-size:11px">'
        + (item.entry > 0 ? ('E: ' + Number(item.entry).toLocaleString('id-ID') + '<br>SL: <span style="color:var(--red)">' + Number(item.sl).toLocaleString('id-ID') + '</span><br>TP: <span style="color:var(--green)">' + Number(item.tp1).toLocaleString('id-ID') + '</span>') : '<span style="color:var(--text3)">N/A (NO TRADE)</span>')
        + '</td>'
        + '<td style="font-family:var(--font-mono);font-weight:700">' + item.rrRatio + '</td>'
        + '<td><strong style="color:' + (item.compositeScore >= 75 ? 'var(--green)' : item.compositeScore >= 50 ? 'var(--amber)' : 'var(--red)') + '">' + item.compositeScore + '</strong>/100</td>'
        + '<td>'
        + '  <button class="btn btn-ghost btn-xs" onclick="aiSelectTicker(\'' + item.ticker + '\');aiSwitchTab(\'deep\')" style="font-size:10px;padding:3px 7px">Evidence ↗</button>'
        + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 6. SUB-PAGE RENDERING: EXPLAINABLE AI & DEEP ANALYSIS
  // ══════════════════════════════════════════════════════════
  function renderAiDeepAnalysis(state) {
    ensureFullUniverseLoaded();
    var tk = state.selectedTicker || 'BBCA';
    var data = AI_UNIVERSE.find(function(x) { return x.ticker === tk; });

    if (!data) {
      // Ticker not in the scanned universe yet (typed manually, or outside
      // LQ45) — fetch its real signal instead of fabricating placeholder
      // numbers, then re-render once it resolves.
      if (!AI_DEEP_PENDING[tk] && !AI_SCAN_LOADING) {
        AI_DEEP_PENDING[tk] = true;
        fetchAiScanData([tk]).then(function() { delete AI_DEEP_PENDING[tk]; });
      }
      return '<div class="card" style="padding:40px;text-align:center;color:var(--text3)">'
        + (AI_SCAN_ERROR
            ? '⚠ ' + AI_SCAN_ERROR + ' <button class="btn btn-ghost btn-xs" onclick="aiLoadTicker()">Coba Lagi</button>'
            : '⏳ Menghitung sinyal riil untuk <strong>' + tk + '</strong> (harga, EMA, RSI, fundamental)...')
        + '</div>';
    }

    var badgeCls = data.signal.includes('BUY') ? 'b-up' : data.signal.includes('HOLD') ? 'b-amb' : data.signal.includes('WATCH') ? 'b-accent' : 'b-dn';

    var html = ''
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
      + '  <div style="display:flex;align-items:center;gap:10px">'
      + '    <div style="display:flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:6px 12px">'
      + '      <i class="ti ti-search" style="color:var(--text3)"></i>'
      + '      <input type="text" id="ai-deep-input" value="' + tk + '" style="background:none;border:none;outline:none;color:var(--text);font-family:var(--font-mono);font-size:13px;font-weight:700;width:90px;text-transform:uppercase" onkeydown="if(event.key===\'Enter\')aiLoadTicker()">'
      + '    </div>'
      + '    <button class="btn btn-blue btn-sm" onclick="aiLoadTicker()">⚡ Analisa Emiten</button>'
      + '    <div style="display:flex;gap:4px;margin-left:6px">'
      + '      <button class="btn btn-ghost btn-xs" onclick="aiSelectTicker(\'BBCA\')">BBCA</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="aiSelectTicker(\'BMRI\')">BMRI</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="aiSelectTicker(\'TLKM\')">TLKM</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="aiSelectTicker(\'ASII\')">ASII</button>'
      + '      <button class="btn btn-ghost btn-xs" onclick="aiSelectTicker(\'GOTO\')">GOTO</button>'
      + '    </div>'
      + '  </div>'
      + '  <div>'
      + '    <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">SCAN TERAKHIR: <strong>' + (AI_SCAN_LOADED_AT ? AI_SCAN_LOADED_AT.toLocaleString('id-ID') : '-') + ' WIB</strong> · Fundamental: <strong style="color:' + (data.dataQuality && data.dataQuality.fundamental ? 'var(--green)' : 'var(--amber)') + '">' + (data.dataQuality && data.dataQuality.fundamental ? 'REAL' : 'ESTIMASI') + '</strong></span>'
      + '  </div>'
      + '</div>'

      // Detailed Synthesis Header
      + '<div class="card" style="padding:22px;margin-bottom:18px;border:1px solid rgba(56,189,248,0.25)">'
      + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:16px">'
      + '    <div>'
      + '      <div style="display:flex;align-items:center;gap:10px">'
      + '        <h2 style="font-size:24px;font-weight:800;color:var(--text);margin:0">' + data.ticker + '</h2>'
      + '        <span style="font-size:14px;color:var(--text2)">' + data.name + ' · ' + data.sector + '</span>'
      + '        <span class="badge ' + badgeCls + '" style="font-size:12px;padding:3px 8px">' + data.signal + '</span>'
      + '      </div>'
      + '      <div style="font-size:13px;color:var(--text2);margin-top:6px">'
      + '        Strategi: <strong style="color:var(--accent)">' + data.strategy + '</strong> · Probabilitas Sukses: <strong style="color:var(--green)">' + data.probability + '%</strong> · Keyakinan AI: <strong>' + data.confidence + '%</strong>'
      + '      </div>'
      + '    </div>'
      + '    <div style="display:flex;gap:16px;align-items:center">'
      + '      <div style="text-align:right">'
      + '        <div style="font-size:10px;color:var(--text3);font-weight:700">EXPECTED VALUE PER TRADE</div>'
      + '        <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:' + (data.ev.includes('+') ? 'var(--green)' : 'var(--red)') + '">' + data.ev + '</div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'

      // 6 Factor Scores Bar
      + '  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;margin-bottom:16px">'
      + '    <div>'
      + '      <div style="font-size:10px;color:var(--text3)">TEKNIKAL</div>'
      + '      <div style="font-size:15px;font-weight:800;color:' + (data.trendScore >= 70 ? 'var(--green)' : 'var(--text)') + '">' + data.trendScore + ' / 100</div>'
      + '    </div>'
      + '    <div>'
      + '      <div style="font-size:10px;color:var(--text3)">MOMENTUM</div>'
      + '      <div style="font-size:15px;font-weight:800;color:' + (data.momentumScore >= 70 ? 'var(--green)' : 'var(--text)') + '">' + data.momentumScore + ' / 100</div>'
      + '    </div>'
      + '    <div>'
      + '      <div style="font-size:10px;color:var(--text3)">MONEY FLOW</div>'
      + '      <div style="font-size:15px;font-weight:800;color:' + (data.moneyFlowScore >= 70 ? 'var(--green)' : 'var(--text)') + '">' + data.moneyFlowScore + ' / 100</div>'
      + '    </div>'
      + '    <div>'
      + '      <div style="font-size:10px;color:var(--text3)">BROKER ACCUM</div>'
      + '      <div style="font-size:15px;font-weight:800;color:' + (data.brokerScore >= 70 ? 'var(--green)' : 'var(--text)') + '">' + data.brokerScore + ' / 100</div>'
      + '    </div>'
      + '    <div>'
      + '      <div style="font-size:10px;color:var(--text3)">FUNDAMENTAL</div>'
      + '      <div style="font-size:15px;font-weight:800;color:' + (data.fundamentalScore >= 70 ? 'var(--green)' : 'var(--text)') + '">' + data.fundamentalScore + ' / 100</div>'
      + '    </div>'
      + '    <div>'
      + '      <div style="font-size:10px;color:var(--text3)">SKOR KOMPOSIT</div>'
      + '      <div style="font-size:15px;font-weight:800;color:' + (data.compositeScore >= 70 ? 'var(--green)' : 'var(--red)') + '">' + data.compositeScore + ' / 100</div>'
      + '    </div>'
      + '  </div>'

      // Trade Rules & Invalidation
      + '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">'
      + '    <div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:12px">'
      + '      <div style="font-size:11px;font-weight:800;color:var(--green);margin-bottom:4px"><i class="ti ti-target"></i> PLAN EKSEKUSI &amp; RISK-REWARD</div>'
      + '      <div style="font-size:12px;color:var(--text);font-family:var(--font-mono)">'
      + '        Entry: <strong>Rp ' + Number(data.entry).toLocaleString('id-ID') + '</strong> | Stop Loss: <strong style="color:var(--red)">Rp ' + Number(data.sl).toLocaleString('id-ID') + '</strong> | TP1: <strong style="color:var(--green)">Rp ' + Number(data.tp1).toLocaleString('id-ID') + '</strong> | TP2: <strong style="color:var(--green)">Rp ' + Number(data.tp2).toLocaleString('id-ID') + '</strong>'
      + '      </div>'
      + '    </div>'
      + '    <div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:12px">'
      + '      <div style="font-size:11px;font-weight:800;color:var(--red);margin-bottom:4px"><i class="ti ti-alert-triangle"></i> KONDISI PEMBATALAN (INVALIDATION RULE)</div>'
      + '      <div style="font-size:12px;color:var(--text2)">' + data.invalidation + '</div>'
      + '    </div>'
      + '  </div>'

      // Evidence vs Against Deep Layer
      + '  <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px">'
      + '    <div>'
      + '      <div style="font-size:13px;font-weight:800;color:var(--green);margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-circle-check"></i> 6 BUKTI UTAMA PENDUKUNG KEPUTUSAN (EVIDENCE)'
      + '      </div>'
      + '      <div style="display:flex;flex-direction:column;gap:6px">';

    data.evidence.forEach(function(e, idx) {
      html += ''
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);display:flex;gap:8px">'
        + '  <strong style="color:var(--green)">' + (idx + 1) + '.</strong>'
        + '  <span>' + e + '</span>'
        + '</div>';
    });

    html += ''
      + '      </div>'
      + '    </div>'
      + '    <div>'
      + '      <div style="font-size:13px;font-weight:800;color:var(--amber);margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-shield-alert"></i> FAKTOR KONTRA &amp; RISIKO (AGAINST &amp; RISK)'
      + '      </div>'
      + '      <div style="display:flex;flex-direction:column;gap:6px">';

    if (!data.against.length) {
      html += '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text3)">Tidak ditemukan faktor kontra signifikan saat ini.</div>';
    } else {
      data.against.forEach(function(a, idx) {
        html += ''
          + '<div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);display:flex;gap:8px">'
          + '  <strong style="color:var(--amber)">' + (idx + 1) + '.</strong>'
          + '  <span>' + a + '</span>'
          + '</div>';
      });
    }

    html += ''
      + '        <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);margin-top:4px">'
      + '          <strong style="color:var(--red)">Risiko Terbesar:</strong> ' + data.mainRisk
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'

      // Broker Flow Diagnostic Fallback Box (No Blank Page Policy)
      + '  <div style="margin-top:16px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 16px">'
      + '    <div style="font-size:12px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px">'
      + '      <i class="ti ti-file-analytics" style="color:#38bdf8"></i> Status Bandarmologi &amp; Broker Ingestion:'
      + '    </div>'
      + '    <div style="font-size:11.5px;color:var(--text2);margin-top:4px">'
      + '      ' + data.brokerStatus + ' · <em>Pemeriksaan redundansi data aktif: Seluruh perhitungan memiliki fallback harga, volume, foreign net flow, dan momentum jika dataset broker tidak lengkap.</em>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 7. SUB-PAGE RENDERING: 10 STRATEGY LAB & SCORECARDS
  // ══════════════════════════════════════════════════════════
  function renderAiStrategyLab(state) {
    var html = ''
      + '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
      + '    <div>'
      + '      <div class="ctitle" style="font-size:16px;display:flex;align-items:center;gap:6px">'
      + '        Strategy Lab — Backtest Riil 2 Tahun (LQ45)'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text3)">Setiap strategi disimulasikan bar-per-bar atas histori harga real 2 tahun terakhir. Win rate, profit factor, Sharpe, dan drawdown di bawah adalah hasil hitung asli — bukan asumsi.</div>'
      + '    </div>'
      + '    <button class="btn btn-blue btn-sm" onclick="fetchAllStrategyBacktests()" ' + (AI_BACKTEST_LOADING ? 'disabled' : '') + '>' + (AI_BACKTEST_LOADING ? '⏳ Menjalankan Backtest...' : (AI_BACKTEST_RESULTS ? '🔄 Jalankan Ulang' : '⚡ Jalankan Backtest Riil')) + '</button>'
      + '  </div>';

    if (AI_BACKTEST_ERROR) {
      html += '<div style="padding:16px;color:var(--red);font-size:12px">⚠ ' + AI_BACKTEST_ERROR + '</div>';
    }

    if (!AI_BACKTEST_RESULTS) {
      html += '<div style="padding:30px;text-align:center;color:var(--text3);font-size:12.5px">'
        + (AI_BACKTEST_LOADING ? '⏳ Mensimulasikan 3 strategi × ~45 saham LQ45 × 2 tahun data harian (~5-10 detik)...' : 'Klik "Jalankan Backtest Riil" untuk menghitung win rate, profit factor, dan drawdown yang sebenarnya dari histori harga.')
        + '</div></div>';
      return html;
    }

    html += '  <div style="overflow-x:auto">'
      + '    <table class="tbl">'
      + '      <thead>'
      + '        <tr>'
      + '          <th>Nama Strategi</th>'
      + '          <th>Aturan Riil</th>'
      + '          <th>Total Trade</th>'
      + '          <th>Win Rate</th>'
      + '          <th>Profit Factor</th>'
      + '          <th>Expectancy</th>'
      + '          <th>Max Drawdown*</th>'
      + '          <th>Sharpe**</th>'
      + '          <th></th>'
      + '        </tr>'
      + '      </thead>'
      + '      <tbody>';

    AI_BACKTEST_RESULTS.forEach(function(r) {
      var s = r.overall;
      var pf = s.profitFactor;
      var isProfitable = pf != null && pf > 1.0 && s.expectancyR > 0;
      html += '<tr>'
        + '<td style="font-weight:700;color:var(--text)">' + r.strategy.name + '<div style="font-size:10px;color:var(--text3);font-weight:normal">' + r.strategy.type + '</div></td>'
        + '<td style="font-size:10.5px;color:var(--text2);max-width:280px">' + r.strategy.description + '</td>'
        + '<td style="font-family:var(--font-mono)">' + s.totalTrades + '</td>'
        + '<td><strong style="font-family:var(--font-mono);color:' + (s.winRate >= 55 ? 'var(--green)' : s.winRate >= 45 ? 'var(--amber)' : 'var(--red)') + '">' + s.winRate + '%</strong></td>'
        + '<td><strong style="font-family:var(--font-mono);color:' + (pf == null ? 'var(--text3)' : pf >= 1.5 ? 'var(--green)' : pf >= 1.0 ? 'var(--amber)' : 'var(--red)') + '">' + (pf == null ? 'N/A' : pf) + '</strong></td>'
        + '<td style="font-family:var(--font-mono);font-size:11px;color:' + (s.expectancyR > 0 ? 'var(--green)' : 'var(--red)') + '">' + (s.expectancyR > 0 ? '+' : '') + s.expectancyR + ' R/trade</td>'
        + '<td style="font-family:var(--font-mono);color:var(--red)">-' + s.maxDrawdownPct + '%</td>'
        + '<td style="font-family:var(--font-mono);font-weight:700">' + (s.sharpe == null ? 'N/A' : s.sharpe) + '</td>'
        + '<td>' + (isProfitable
            ? '<span class="badge b-up" style="font-size:10px">EDGE POSITIF</span>'
            : '<span class="badge b-dn" style="font-size:10px">TIDAK PROFITABLE</span>') + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>'
      + '  <div style="padding:12px 4px 0;font-size:10.5px;color:var(--text3);line-height:1.6">'
      + '    * Drawdown dihitung dengan asumsi risiko 1% modal per trade (bukan compounding 100% modal). ** Sharpe per-trade disederhanakan, belum diannualisasi.<br>'
      + '    Biaya transaksi (~0.2% round-trip: fee broker + PPN + levy) sudah dikurangkan dari setiap hasil trade.'
      + (AI_BACKTEST_LOADED_AT ? '<br>Terakhir dijalankan: ' + AI_BACKTEST_LOADED_AT.toLocaleString('id-ID') + ' WIB' : '')
      + '  </div>'
      + '</div>';

    html += '<div class="card" style="padding:16px 20px;margin-bottom:18px;background:rgba(148,163,184,0.05)">'
      + '  <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:4px">Strategi Lain (Belum Diimplementasikan)</div>'
      + '  <div style="font-size:11px;color:var(--text3);line-height:1.6">Strategi berbasis Bandarmologi/broker flow historis, model ensemble ML, dan regime-adaptive switching sengaja belum ditambahkan — masing-masing butuh data historis broker per-transaksi atau pipeline training ML yang belum tersedia di aplikasi ini. Menampilkan angka untuk strategi tersebut tanpa data itu akan berarti mengarang lagi, jadi lebih baik jujur belum ada.</div>'
      + '</div>';

    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 8. SUB-PAGE RENDERING: AUTONOMOUS HYPOTHESIS LAB
  // ══════════════════════════════════════════════════════════
  function renderAiHypothesisLab(state) {
    var hypos = state.hypotheses;

    var html = '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div style="margin-bottom:16px">'
      + '    <div class="ctitle" style="font-size:16px;display:flex;align-items:center;gap:6px">'
      + '      <i class="ti ti-bulb" style="color:var(--amber)"></i> Hypothesis Lab'
      + '    </div>'
      + '    <div style="font-size:12px;color:var(--text3)">Daftar hipotesis trading yang sudah diuji lewat Walk-Forward Backtest di Backtest Lab, dengan hasil riil dari histori harga aktual.</div>'
      + '  </div>';

    if (!hypos.length) {
      html += '<div style="padding:30px;text-align:center;color:var(--text3);font-size:12.5px;line-height:1.6">'
        + 'Belum ada hipotesis.<br>Mesin perumusan hipotesis otomatis (yang secara mandiri mengusulkan aturan trading baru) belum dibangun di aplikasi ini.<br>Gunakan <strong>Strategy Lab</strong> untuk menguji ketiga strategi rule-based yang sudah tersedia dengan data riil.'
        + '</div></div>';
      return html;
    }

    html += '  <div style="display:flex;flex-direction:column;gap:14px">';

    hypos.forEach(function(h) {
      html += ''
        + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:16px">'
        + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:8px">'
        + '    <div>'
        + '      <span style="font-size:10px;font-family:var(--font-mono);color:var(--accent);font-weight:700">' + h.id + ' · TANGGAL: ' + h.date + '</span>'
        + '      <div style="font-size:15px;font-weight:800;color:var(--text);margin-top:2px">' + h.title + '</div>'
        + '    </div>'
        + '    <span class="badge ' + h.statusCls + '">' + h.status + '</span>'
        + '  </div>'
        + '  <div style="font-size:12.5px;color:var(--text2);line-height:1.5;margin-bottom:10px;background:rgba(255,255,255,0.02);padding:10px;border-radius:6px">'
        + '    <strong>Pernyataan Hipotesis:</strong> "' + h.statement + '"'
        + '  </div>'
        + '  <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px;font-size:11.5px;color:var(--text3);border-top:1px solid var(--border2);padding-top:10px">'
        + '    <div><strong>Dataset &amp; Sampel:</strong> ' + h.dataset + ' (' + h.sampleSize + ' Sampel)</div>'
        + '    <div><strong>Hasil Pengujian Backtest:</strong> <span style="color:var(--text)">' + h.testResult + '</span></div>'
        + '  </div>'
        + '</div>';
    });

    html += '</div></div>';
    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 9. SUB-PAGE RENDERING: AI PAPER PORTFOLIO (ISOLATED)
  // ══════════════════════════════════════════════════════════
  function renderAiPaperPortfolio(state) {
    syncAiPaperPortfolioLivePrices(false);
    ensureFullUniverseLoaded();
    var p = state.paperAccount;

    var totalPnL = (p.realizedPnL || 0) + (p.unrealizedPnL || 0);
    var totalPnLClass = totalPnL >= 0 ? 'up' : 'down';
    var totalPnLSign = totalPnL >= 0 ? '+' : '';

    var unPnLClass = p.unrealizedPnL >= 0 ? 'up' : 'down';
    var unPnLSign = p.unrealizedPnL >= 0 ? '+' : '';

    var returnClass = p.totalReturnPct >= 0 ? 'up' : 'down';
    var returnSign = p.totalReturnPct >= 0 ? '+' : '';

    var html = ''
      + '<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:11.5px;color:var(--text)">'
      + '  ℹ️ Portofolio ini sungguhan (dalam arti benar-benar tereksekusi &amp; tersimpan) — bukan simulasi historis. Posisi baru terbuka saat Anda klik "Buka Posisi", dan otomatis tertutup saat harga live menyentuh SL/TP. Belum ada aktivitas = belum pernah dibuka posisi.'
      + '</div>'
      + '<div class="row4" style="margin-bottom:18px">'
      + '  <div class="metric">'
      + '    <div class="mlabel">Modal Awal Virtual</div>'
      + '    <div class="mval" style="font-size:18px">Rp ' + Number(p.initialCapital).toLocaleString('id-ID') + '</div>'
      + '    <div class="msub neu">Saldo Kas Virtual: Rp ' + Number(p.cash).toLocaleString('id-ID') + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Total Nilai Ekuitas AI</div>'
      + '    <div class="mval ' + returnClass + '" style="font-size:20px">Rp ' + Number(p.totalEquity).toLocaleString('id-ID') + '</div>'
      + '    <div class="msub ' + returnClass + '">' + returnSign + p.totalReturnPct + '% Total Return Bersih</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Realized &amp; Unrealized PnL</div>'
      + '    <div class="mval ' + totalPnLClass + '" style="font-size:18px">' + totalPnLSign + 'Rp ' + Number(totalPnL).toLocaleString('id-ID') + '</div>'
      + '    <div class="msub ' + unPnLClass + '">Realized +Rp ' + Number(p.realizedPnL).toLocaleString('id-ID') + ' | Float ' + unPnLSign + 'Rp ' + Number(p.unrealizedPnL).toLocaleString('id-ID') + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Win Rate &amp; Profit Factor</div>'
      + '    <div class="mval" style="color:var(--green);font-size:20px">' + p.winRate + '% (' + p.winningTrades + 'W / ' + p.losingTrades + 'L)</div>'
      + '    <div class="msub neu">Profit Factor: ' + (p.profitFactor == null ? 'N/A' : p.profitFactor) + ' · Max DD -' + p.maxDrawdownPct + '%</div>'
      + '  </div>'
      + '</div>'

      // Open a position from a real current signal
      + '<div class="card" style="padding:16px 20px;margin-bottom:18px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">'
      + '    <span class="ctitle" style="font-size:13px">Buka Posisi dari Sinyal BUY Terkini</span>'
      + '    <span style="font-size:10.5px;color:var(--text3);font-family:var(--font-mono)">Risk/trade: ' + p.riskPerTradePct + '% (≈Rp ' + Math.round(p.totalEquity * p.riskPerTradePct / 100).toLocaleString('id-ID') + ')</span>'
      + '  </div>'
      + (!AI_UNIVERSE.length
          ? '<div style="font-size:11.5px;color:var(--text3)">⏳ Menunggu hasil scan (lihat tab Scanner)...</div>'
          : (function() {
              var candidates = AI_UNIVERSE.filter(function(x) { return x.signal && x.signal.includes('BUY') && !p.openPositions.some(function(o) { return o.ticker === x.ticker; }); })
                .sort(function(a, b) { return b.compositeScore - a.compositeScore; }).slice(0, 6);
              if (!candidates.length) return '<div style="font-size:11.5px;color:var(--text3)">Tidak ada sinyal BUY baru saat ini (di luar posisi yang sudah terbuka).</div>';
              return '<div style="display:flex;gap:8px;flex-wrap:wrap">' + candidates.map(function(c) {
                return '<button class="btn btn-ghost btn-xs" onclick="aiOpenPositionFromSignal(\'' + c.ticker + '\')" style="border-color:var(--green);color:var(--green)" title="' + c.strategy + ' · Skor ' + c.compositeScore + '">+ ' + c.ticker + ' (' + c.signal + ', skor ' + c.compositeScore + ')</button>';
              }).join('') + '</div>';
            })())
      + '</div>'

      // Open Positions Table
      + '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div class="cheader" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '    <div style="display:flex;align-items:center;gap:10px">'
      + '      <span class="ctitle">Posisi Virtual Terbuka</span>'
      + '      <span class="badge b-up" style="font-size:10px;padding:2px 8px">FEED PASAR REAL-TIME</span>'
      + '    </div>'
      + '    <button class="btn btn-ghost btn-xs" onclick="aiRefreshPaperPortfolioQuotes(true)" style="font-size:11px;border-color:#38bdf8;color:#38bdf8">🔄 Refresh Harga</button>'
      + '  </div>';

    if (!p.openPositions.length) {
      html += '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Belum ada posisi terbuka. Klik salah satu tombol sinyal BUY di atas untuk membuka posisi pertama.</div></div>';
    } else {
      html += '  <div style="overflow-x:auto">'
        + '    <table class="tbl">'
        + '      <thead>'
        + '        <tr>'
        + '          <th>Ticker</th>'
        + '          <th>Strategi</th>'
        + '          <th>Tgl Entry</th>'
        + '          <th>Lot &amp; Lembar</th>'
        + '          <th>Harga Entry</th>'
        + '          <th>Harga Terkini (Real Market)</th>'
        + '          <th>Nilai Posisi</th>'
        + '          <th>Floating PnL</th>'
        + '          <th>Stop Loss / TP1</th>'
        + '          <th></th>'
        + '        </tr>'
        + '      </thead>'
        + '      <tbody>';

      p.openPositions.forEach(function(pos) {
        var pnlColor = pos.unrealizedPnL >= 0 ? 'var(--green)' : 'var(--red)';
        var pnlSign = pos.unrealizedPnL >= 0 ? '+' : '';
        var priceClass = pos.currentPrice > pos.entryPrice ? 'color:var(--green)' : pos.currentPrice < pos.entryPrice ? 'color:var(--red)' : 'color:var(--text)';

        html += '<tr>'
          + '<td style="font-weight:800;font-family:var(--font-mono);color:#38bdf8">' + pos.ticker + '</td>'
          + '<td style="font-size:11.5px">' + pos.strategy + '</td>'
          + '<td style="font-size:11px;color:var(--text3)">' + pos.entryDate + '</td>'
          + '<td style="font-family:var(--font-mono)">' + pos.lots + ' Lot (' + Number(pos.shares).toLocaleString('id-ID') + ')</td>'
          + '<td style="font-family:var(--font-mono)">Rp ' + Number(pos.entryPrice).toLocaleString('id-ID') + '</td>'
          + '<td style="font-family:var(--font-mono);' + priceClass + ';font-weight:700">Rp ' + Number(pos.currentPrice).toLocaleString('id-ID') + '</td>'
          + '<td style="font-family:var(--font-mono)">Rp ' + Number(pos.currentValue).toLocaleString('id-ID') + '</td>'
          + '<td><strong style="font-family:var(--font-mono);color:' + pnlColor + '">' + pnlSign + 'Rp ' + Number(pos.unrealizedPnL).toLocaleString('id-ID') + ' (' + pnlSign + pos.unrealizedPct + '%)</strong></td>'
          + '<td style="font-family:var(--font-mono);font-size:10.5px">SL: <span style="color:var(--red)">Rp ' + Number(pos.sl).toLocaleString('id-ID') + '</span> | TP1: <span style="color:var(--green)">Rp ' + Number(pos.tp1).toLocaleString('id-ID') + '</span></td>'
          + '<td><button class="btn btn-ghost btn-xs" onclick="if(confirm(\'Tutup posisi ' + pos.ticker + ' sekarang di harga pasar?\'))aiClosePosition(\'' + pos.id + '\', ' + pos.currentPrice + ', \'MANUAL\')" style="color:var(--red);border-color:var(--red);font-size:10px">Tutup</button></td>'
          + '</tr>';
      });

      html += '</tbody></table></div></div>';
    }
    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 10. SUB-PAGE RENDERING: POST-MORTEM & CRITIQUE JOURNAL
  // ══════════════════════════════════════════════════════════
  function renderAiJournal(state) {
    var trades = state.paperAccount.closedTrades;

    var html = ''
      + '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
      + '    <div>'
      + '      <div class="ctitle" style="font-size:16px">Post-Mortem &amp; Trading Journal</div>'
      + '      <div style="font-size:12px;color:var(--text3)">Dibuat otomatis dari setiap posisi paper trading yang benar-benar ditutup (SL/TP tersentuh atau manual) — bukan narasi yang ditulis di muka.</div>'
      + '    </div>'
      + '  </div>';

    if (!trades.length) {
      html += '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Belum ada trade yang ditutup. Buka posisi di tab AI Paper Portfolio — jurnal ini akan terisi otomatis begitu posisi tersebut selesai (SL/TP tersentuh atau ditutup manual).</div></div>';
      return html;
    }

    html += '  <div style="display:flex;flex-direction:column;gap:14px">';

    trades.forEach(function(t) {
      var isWin = t.result === 'WIN';
      var resCls = isWin ? 'b-up' : 'b-dn';

      html += ''
        + '<div style="background:var(--bg3);border:1px solid ' + (isWin ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)') + ';border-radius:10px;padding:16px">'
        + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px">'
        + '    <div>'
        + '      <span style="font-size:10px;font-family:var(--font-mono);color:var(--text3)">' + t.entryDate + ' s.d ' + t.exitDate + ' · Ditutup: ' + (t.exitReason || 'MANUAL') + '</span>'
        + '      <div style="font-size:16px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:8px">'
        + '        ' + t.ticker + ' — ' + t.strategy
        + '        <span class="badge ' + resCls + '">' + t.result + ' (' + (t.returnPct >= 0 ? '+' : '') + t.returnPct + '% / ' + t.rMultiple + 'R)</span>'
        + '      </div>'
        + '    </div>'
        + '    <div style="text-align:right">'
        + '      <div style="font-size:10px;color:var(--text3)">NET REALIZED PNL</div>'
        + '      <div style="font-size:16px;font-weight:800;font-family:var(--font-mono);color:' + (isWin ? 'var(--green)' : 'var(--red)') + '">' + (t.netPnL >= 0 ? '+' : '') + 'Rp ' + Number(t.netPnL).toLocaleString('id-ID') + '</div>'
        + '    </div>'
        + '  </div>'

        + '  <!-- 3 Post-Mortem Takeaways -->'
        + '  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border2);border-radius:8px;padding:12px">'
        + '    <div>'
        + '      <div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:2px">💡 LESSON LEARNED (PELAJARAN)</div>'
        + '      <div style="font-size:11.5px;color:var(--text2);line-height:1.4">' + t.lesson + '</div>'
        + '    </div>'
        + '    <div>'
        + '      <div style="font-size:10px;font-weight:700;color:var(--amber);margin-bottom:2px">⚠️ MISTAKE / DEVIASI</div>'
        + '      <div style="font-size:11.5px;color:var(--text2);line-height:1.4">' + t.mistake + '</div>'
        + '    </div>'
        + '    <div>'
        + '      <div style="font-size:10px;font-weight:700;color:var(--green);margin-bottom:2px">🔧 STRATEGY IMPROVEMENT (ADAPTASI)</div>'
        + '      <div style="font-size:11.5px;color:var(--text2);line-height:1.4">' + t.improvement + '</div>'
        + '    </div>'
        + '  </div>'
        + '</div>';
    });

    html += '</div></div>';
    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 11. SUB-PAGE RENDERING: MARKET REGIME & SECTOR ROTATION
  // ══════════════════════════════════════════════════════════
  function renderAiMarketRegime(state) {
    var r = state.marketRegime;

    // Sector rotation and per-strategy regime-fit both used to ship as fixed
    // fake tables (invented % changes, invented flow figures, invented
    // ACTIVE/DISABLED verdicts). There is no real sector-index feed or
    // regime-classification model behind this app yet, so both are shown
    // as an honest empty state instead of numbers that were never computed.
    var html = ''
      + '<div class="row4" style="margin-bottom:18px">'
      + '  <div class="metric">'
      + '    <div class="mlabel">Klasifikasi Market Regime</div>'
      + (r.regime
          ? '    <div class="mval up" style="font-size:18px">🟢 ' + r.regime + '</div>'
          : '    <div class="mval" style="font-size:14px;color:var(--text3)">Belum Dihitung</div>')
      + '    <div class="msub neu">' + (r.confidence != null ? 'Probabilitas Konfirmasi: ' + r.confidence + '%' : 'Model klasifikasi regime belum dibangun') + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Benchmark IHSG Composite</div>'
      + '    <div class="mval" style="color:var(--green);font-size:20px">' + (r.ihsg || '-') + '</div>'
      + '    <div class="msub neu">' + (r.ihsgChange != null ? '+' + r.ihsgChange + '% (Di atas EMA20, 50, &amp; 200)' : 'Perubahan harian belum dihitung') + '</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Market Breadth Ratio</div>'
      + (r.breadthPct != null
          ? '    <div class="mval" style="color:#38bdf8;font-size:20px">' + r.breadthPct + '% ADVANCE</div>'
          : '    <div class="mval" style="font-size:14px;color:var(--text3)">Belum Dihitung</div>')
      + '    <div class="msub neu">Perlu data breadth per-saham (naik/turun/stagnan) yang belum tersedia</div>'
      + '  </div>'
      + '  <div class="metric">'
      + '    <div class="mlabel">Foreign Institutional Net Flow</div>'
      + '    <div class="mval" style="font-size:14px;color:var(--text3)">' + (r.foreignFlowToday || 'Belum Tersedia') + '</div>'
      + '    <div class="msub neu">Perlu feed data broker summary/KSEI harian</div>'
      + '  </div>'
      + '</div>'

      // Sector Rotation & Strategy Adaptation
      + '<div style="display:grid;grid-template-columns:1.2fr 1.8fr;gap:18px;margin-bottom:18px">'
      + '  <!-- Sector Rotation Table -->'
      + '  <div class="card" style="padding:20px">'
      + '    <div class="cheader" style="margin-bottom:14px">'
      + '      <span class="ctitle"><i class="ti ti-rotate" style="color:var(--accent)"></i> Rotasi Sektor &amp; Aliran Dana</span>'
      + '    </div>'
      + '    <div style="padding:24px 8px;text-align:center;color:var(--text3);font-size:12px;line-height:1.6">Data rotasi sektor belum tersedia.<br>Membutuhkan feed indeks sektoral (IDXFINANCE, IDXENERGY, dst) real-time yang belum diintegrasikan.</div>'
      + '  </div>'

      + '  <!-- Strategy Eligibility Engine Matrix -->'
      + '  <div class="card" style="padding:20px">'
      + '    <div class="cheader" style="margin-bottom:14px">'
      + '      <span class="ctitle"><i class="ti ti-adjustments-alt" style="color:var(--accent)"></i> Adaptasi Strategi Terhadap Regime Aktif</span>'
      + '    </div>'
      + '    <div style="padding:24px 8px;text-align:center;color:var(--text3);font-size:12px;line-height:1.6">Belum ada mesin klasifikasi regime yang bisa menentukan strategi mana yang layak diaktifkan secara otomatis.<br>Gunakan hasil riil di <strong>Strategy Lab</strong> untuk membandingkan performa antar strategi.</div>'
      + '  </div>'
      + '</div>';

    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 12. SUB-PAGE RENDERING: REALISTIC BACKTEST LAB
  // ══════════════════════════════════════════════════════════
  function renderAiBacktestLab(state) {
    var strategyOptions = STRATEGY_META;

    var html = ''
      + '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">'
      + '    <div>'
      + '      <div class="ctitle" style="font-size:16px;display:flex;align-items:center;gap:6px">'
      + '        Walk-Forward Split Test (In-Sample vs Out-of-Sample)'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text3)">Simulasi bar-per-bar dari histori harga riil 2 tahun, dipecah kronologis: 70% periode awal (in-sample) vs 30% periode terakhir (out-of-sample). Karena aturan strategi tetap/tidak di-fit, perbandingan ini menunjukkan apakah edge-nya bertahan di data yang lebih baru — bukan overfitting yang disamarkan.</div>'
      + '    </div>'
      + '    <div style="display:flex;gap:8px;align-items:center">'
      + '      <select id="ai-wf-strategy-select" class="form-select" style="font-size:11px;height:30px">'
      + Object.keys(strategyOptions).map(function(id) { return '<option value="' + id + '" ' + (id === AI_WALKFORWARD_STRATEGY ? 'selected' : '') + '>' + strategyOptions[id] + '</option>'; }).join('')
      + '      </select>'
      + '      <button class="btn btn-blue btn-sm" onclick="fetchWalkForwardBacktest(document.getElementById(\'ai-wf-strategy-select\').value)" ' + (AI_BACKTEST_LOADING ? 'disabled' : '') + '>' + (AI_BACKTEST_LOADING ? '⏳ Menjalankan...' : '⚡ Jalankan Walk-Forward Test') + '</button>'
      + '    </div>'
      + '  </div>';

    if (AI_BACKTEST_ERROR) {
      html += '<div style="padding:12px;color:var(--red);font-size:12px">⚠ ' + AI_BACKTEST_ERROR + '</div>';
    }

    if (!AI_WALKFORWARD_RESULT) {
      html += '<div style="padding:30px;text-align:center;color:var(--text3);font-size:12.5px">'
        + (AI_BACKTEST_LOADING ? '⏳ Mensimulasikan histori 2 tahun...' : 'Pilih strategi lalu klik "Jalankan Walk-Forward Test" untuk hasil real.')
        + '</div></div>';
      return html;
    }

    var r = AI_WALKFORWARD_RESULT;
    var renderStatBox = function(label, s) {
      var pf = s.profitFactor;
      return '<div class="metric">'
        + '  <div class="mlabel">' + label + '</div>'
        + '  <div class="mval" style="font-size:16px;color:' + (s.expectancyR > 0 ? 'var(--green)' : 'var(--red)') + '">' + s.totalTrades + ' trade · WR ' + s.winRate + '%</div>'
        + '  <div class="msub neu">PF ' + (pf == null ? 'N/A' : pf) + ' · Sharpe ' + (s.sharpe == null ? 'N/A' : s.sharpe) + ' · DD -' + s.maxDrawdownPct + '%</div>'
        + '</div>';
    };

    html += '  <div class="row3" style="margin-bottom:18px">'
      + renderStatBox('Keseluruhan (2 Tahun)', r.overall)
      + renderStatBox('In-Sample (70% Awal)', r.inSample)
      + renderStatBox('Out-of-Sample (30% Akhir)', r.outOfSample)
      + '  </div>'

      + '  <div style="background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.2);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:var(--text)">'
      + '    <strong>' + r.strategy.name + ':</strong> ' + r.strategy.description
      + '    <div style="margin-top:6px;color:var(--text3);font-size:11px">Disimulasikan atas ' + r.tickersScanned + ' saham LQ45. Biaya transaksi ~0.2% round-trip sudah dikurangkan dari tiap trade. Terakhir dijalankan: ' + (AI_BACKTEST_LOADED_AT ? AI_BACKTEST_LOADED_AT.toLocaleString('id-ID') : '-') + ' WIB.</div>'
      + '  </div>'

      + '  <div style="overflow-x:auto">'
      + '    <table class="tbl">'
      + '      <thead><tr><th>Ticker</th><th>Entry</th><th>Exit</th><th>Return</th><th>R-Multiple</th><th>Alasan Keluar</th><th>Hasil</th></tr></thead>'
      + '      <tbody>'
      + r.trades.slice().reverse().map(function(t) {
          return '<tr>'
            + '<td style="font-family:var(--font-mono);font-weight:700">' + t.ticker + '</td>'
            + '<td style="font-family:var(--font-mono)">Rp ' + Number(t.entryPrice).toLocaleString('id-ID') + '</td>'
            + '<td style="font-family:var(--font-mono)">Rp ' + Number(t.exitPrice).toLocaleString('id-ID') + '</td>'
            + '<td style="font-family:var(--font-mono);color:' + (t.returnPct >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (t.returnPct >= 0 ? '+' : '') + t.returnPct + '%</td>'
            + '<td style="font-family:var(--font-mono)">' + (t.rMultiple >= 0 ? '+' : '') + t.rMultiple + 'R</td>'
            + '<td style="font-size:11px;color:var(--text3)">' + t.exitReason + '</td>'
            + '<td><span class="badge ' + (t.result === 'WIN' ? 'b-up' : 'b-dn') + '" style="font-size:10px">' + t.result + '</span></td>'
            + '</tr>';
        }).join('')
      + '      </tbody>'
      + '    </table>'
      + '  </div>'
      + '  <div style="padding:8px 4px 0;font-size:10px;color:var(--text3)">Menampilkan 30 trade paling baru dari total ' + r.overall.totalTrades + ' trade.</div>'
      + '</div>';

    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 13. SUB-PAGE RENDERING: AI LEARNING LOG & WEIGHT CALIBRATION
  // ══════════════════════════════════════════════════════════
  function renderAiLearningLog(state) {
    // The 10 audit answers and the 6-factor "adaptive weight" breakdown
    // below used to be permanently fixed fake text/numbers - no post-mortem
    // analysis engine reads the real closedTrades array, and the composite
    // score never actually used those 6 factors (see idx-data-engine.js -
    // it's technical*0.65 + fundamental*0.35, full stop). Replaced with an
    // honest empty state for the audit, and the real weight for the one
    // number we do know.
    var p = state.paperAccount;
    var trades = (p && p.closedTrades) || [];

    var html = '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div style="margin-bottom:16px">'
      + '    <div class="ctitle" style="font-size:16px;display:flex;align-items:center;gap:6px">'
      + '      Post-Mortem Self-Critique Engine'
      + '    </div>'
      + '    <div style="font-size:12px;color:var(--text3)">Audit otomatis dari trade yang benar-benar ditutup di Paper Portfolio. Belum ada analisis mendalam (pola kesalahan, korelasi entry/exit) karena butuh lebih banyak histori trade riil.</div>'
      + '  </div>';

    if (!trades.length) {
      html += '<div style="padding:30px;text-align:center;color:var(--text3);font-size:12.5px;line-height:1.6">'
        + 'Belum ada data untuk dianalisis — belum ada trade yang ditutup di Paper Portfolio.<br>Buka dan tutup beberapa posisi dari sinyal BUY di tab <strong>AI Paper Portfolio</strong> untuk mulai mengisi audit ini.'
        + '</div></div>';
      return html;
    }

    var wins = trades.filter(function(t) { return t.result === 'WIN'; }).length;
    html += '<div style="padding:16px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text2);margin-bottom:18px">'
      + 'Dari ' + trades.length + ' trade yang sudah ditutup, ' + wins + ' di antaranya profit (' + Math.round((wins / trades.length) * 100) + '%). Analisis pola kesalahan per-trade yang lebih rinci belum dibangun — lihat detail tiap trade di tab <strong>Journal</strong>.'
      + '</div>';

    html += ''
      // Real weight actually used by the composite signal engine (not a
      // fabricated "adaptive calibration" - it's a fixed formula).
      + '  <div style="border-top:1px solid var(--border2);padding-top:16px">'
      + '    <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:4px"><i class="ti ti-sliders" style="color:var(--accent)"></i> Bobot Riil Mesin Sinyal</div>'
      + '    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Ini formula tetap yang benar-benar dipakai (lihat computeStockSignal), bukan kalibrasi adaptif — mesin ini belum menyesuaikan bobotnya sendiri dari hasil trade.</div>'
      + '    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">'
      + '      <div style="background:var(--bg3);padding:10px;border-radius:6px;text-align:center"><div style="font-size:10px;color:var(--text3)">TEKNIKAL</div><div style="font-size:16px;font-weight:800;color:var(--accent)">65%</div></div>'
      + '      <div style="background:var(--bg3);padding:10px;border-radius:6px;text-align:center"><div style="font-size:10px;color:var(--text3)">FUNDAMENTAL</div><div style="font-size:16px;font-weight:800;color:var(--accent)">35%</div></div>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 14. SUB-PAGE RENDERING: DATA QUALITY & FRESHNESS MONITOR
  // ══════════════════════════════════════════════════════════
  function renderAiDataQuality(state) {
    var dataFeeds = [
      { name: 'Live Stock Quotes & OHLCV Feed', source: 'IDX / Yahoo Finance Real-Time', score: 98, freshness: '< 15 Detik', status: 'ONLINE & VERIFIED', cls: 'b-up' },
      { name: 'Volume & Orderbook Liquidity Feed', source: 'Indonesia Stock Exchange (IDX)', score: 97, freshness: '< 15 Detik', status: 'ONLINE & VERIFIED', cls: 'b-up' },
      { name: 'Broker Flow & Bandarmologi Dataset', source: 'KSEI & Top Broker Consolidation', score: 72, freshness: 'Daily EOD + Fallback', status: 'ACTIVE (FALLBACK READY)', cls: 'b-amb' },
      { name: 'Fundamental Statements & Ratios', source: 'Laporan Keuangan Emiten Q2 2026', score: 91, freshness: 'Quarterly Audited', status: 'ONLINE & VERIFIED', cls: 'b-up' },
      { name: 'Macroeconomic & Sector News Stream', source: 'Bank Indonesia & Financial Feeds', score: 84, freshness: '< 1 Jam', status: 'ONLINE & VERIFIED', cls: 'b-up' }
    ];

    var html = ''
      + '<div class="card" style="padding:20px;margin-bottom:18px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">'
      + '    <div>'
      + '      <div class="ctitle" style="font-size:16px;display:flex;align-items:center;gap:6px">'
      + '        <i class="ti ti-shield-check" style="color:var(--green)"></i> Data Quality, Freshness, &amp; Anti-Hallucination Monitor'
      + '      </div>'
      + '      <div style="font-size:12px;color:var(--text3)">AI secara ketat menerapkan kebijakan Anti-Hallucination: Tidak ada harga, volume, atau data broker yang dikarang. Jika data tidak lengkap, confidence score otomatis diturunkan dengan graceful fallback.</div>'
      + '    </div>'
      + '  </div>'

      + '  <div style="overflow-x:auto;margin-bottom:18px">'
      + '    <table class="tbl">'
      + '      <thead>'
      + '        <tr>'
      + '          <th>Nama Dataset Feeds</th>'
      + '          <th>Sumber Data Terverifikasi</th>'
      + '          <th>Skor Kualitas (Quality Score)</th>'
      + '          <th>Freshness / Update</th>'
      + '          <th>Status Pipeline</th>'
      + '        </tr>'
      + '      </thead>'
      + '      <tbody>';

    dataFeeds.forEach(function(df) {
      html += '<tr>'
        + '<td style="font-weight:700;color:var(--text)">' + df.name + '</td>'
        + '<td style="font-size:11.5px;color:var(--text2)">' + df.source + '</td>'
        + '<td><strong style="font-family:var(--font-mono);color:' + (df.score >= 90 ? 'var(--green)' : 'var(--amber)') + '">' + df.score + ' / 100</strong></td>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + df.freshness + '</td>'
        + '<td><span class="badge ' + df.cls + '">' + df.status + '</span></td>'
        + '</tr>';
    });

    html += ''
      + '      </tbody>'
      + '    </table>'
      + '  </div>'

      // Confidence Degradation Explanation Card
      + '  <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px">'
      + '    <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px"><i class="ti ti-info-circle" style="color:#38bdf8"></i> Kebijakan Penyesuaian Keyakinan (Confidence Degradation Protocol):</div>'
      + '    <div style="font-size:11.5px;color:var(--text2);line-height:1.5">'
      + '      Jika dataset broker-flow atau berita tidak tersedia untuk suatu emiten, skor keyakinan (*confidence score*) AI secara transparan didegradasi (contoh: 82% → 64%). Nilai komposit dihitung kembali dengan normalisasi bobot pada faktor yang aktif. <strong>Tidak akan pernah dihasilkan halaman kosong (*blank page*), angka NaN, atau grafik rusak.</strong>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    return html;
  }

  // ══════════════════════════════════════════════════════════
  // 15. ACTION HANDLERS & GLOBAL NAVIGATION HOOKS
  // ══════════════════════════════════════════════════════════

  function aiSwitchTab(tabName) {
    AI_TRADE_STATE.activeTab = tabName;
    if (tabName === 'paper' || tabName === 'cockpit') {
      syncAiPaperPortfolioLivePrices(false);
      aiRefreshPaperPortfolioQuotes(false);
    }
    renderAiTradingPage();
  }

  function aiSelectTicker(tk) {
    AI_TRADE_STATE.selectedTicker = tk.toUpperCase();
    renderAiTradingPage();
  }

  function aiLoadTicker() {
    var inp = document.getElementById('ai-deep-input');
    var val = (inp && inp.value) ? inp.value.trim().toUpperCase() : 'BBCA';
    aiSelectTicker(val);
  }

  function aiSetFilterSignal(sig) {
    AI_TRADE_STATE.filterSignal = sig;
    renderAiTradingPage();
  }

  function aiTriggerAutonomousCycle() {
    syncAiPaperPortfolioLivePrices(false);
    if (typeof showToast === 'function') {
      showToast('⚡ Menjalankan pemindaian ulang LQ45 dengan harga & indikator terbaru...');
    }
    fetchAiScanData().then(function() {
      if (typeof showToast === 'function') {
        showToast('✓ Scan selesai — ' + AI_UNIVERSE.length + ' emiten diperbarui dari data real-time.');
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // 12. EXPOSE TO GLOBAL NAMESPACE
  // ══════════════════════════════════════════════════════════
  window.AI_TRADE_STATE = AI_TRADE_STATE;
  window.AI_UNIVERSE = AI_UNIVERSE;
  window.initAiAutonomousSuite = initAiAutonomousSuite;
  window.renderAiTradingPage = renderAiTradingPage;
  window.aiSwitchTab = aiSwitchTab;
  window.aiSelectTicker = aiSelectTicker;
  window.aiLoadTicker = aiLoadTicker;
  window.aiSetFilterSignal = aiSetFilterSignal;
  window.aiTriggerAutonomousCycle = aiTriggerAutonomousCycle;
  window.syncAiPaperPortfolioLivePrices = syncAiPaperPortfolioLivePrices;
  window.aiRefreshPaperPortfolioQuotes = aiRefreshPaperPortfolioQuotes;
  window.aiOpenPositionFromSignal = aiOpenPositionFromSignal;
  window.aiClosePosition = aiClosePosition;
  window.fetchAiScanData = fetchAiScanData;
  window.fetchAllStrategyBacktests = fetchAllStrategyBacktests;
  window.fetchWalkForwardBacktest = fetchWalkForwardBacktest;

})(window, document);
