// Uji berbasis properti untuk AI Paper Portfolio (public/js/38-ai-autonomous-trading.js), dijalankan di Node lewat vm tanpa browser.
// Operasi acak (ubah modal, buka/tutup posisi, gerak harga, gap SL, reset) dijalankan lewat fungsi ASLI aplikasi, lalu invarian
// dicek setelah tiap langkah terhadap buku bayangan yang dihitung harness secara independen dari kode aplikasi.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { makeRng } from './core.mjs';

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

export function createAiPaperSandbox(rootDir) {
  const source = fs.readFileSync(path.join(rootDir, 'public/js/38-ai-autonomous-trading.js'), 'utf8');
  const store = {};
  const quotes = {};
  const noop = () => {};
  let tick = 0;
  const SimDate = class extends Date { static now() { return 1.79e12 + (++tick); } };
  const element = new Proxy(function () {}, { get: (_t, key) => (key === 'style' ? {} : key === 'classList' ? { add: noop, remove: noop, contains: () => false } : (key === 'innerHTML' || key === 'value' || key === 'textContent') ? '' : noop), set: () => true, apply: () => null });
  const sandbox = {
    console: { log: noop, warn: noop, error: noop, info: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    Date: SimDate, Math, JSON, Number, String, Array, Object, Promise, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Error,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => element, body: element, readyState: 'complete' },
    navigator: {}, location: { href: '' }, alert: noop, confirm: () => true, prompt: () => null,
    prices: {},
    getGlobalMarketPrice: (ticker) => quotes[ticker] || 0,
    showToast: noop,
    fetch: async (url) => {
      const match = /\/api\/idx\/quote\/([^/?]+)/.exec(String(url));
      if (match) {
        const price = quotes[decodeURIComponent(match[1])];
        return { ok: price > 0, json: async () => ({ success: price > 0, quote: { price } }) };
      }
      return { ok: false, json: async () => ({ success: false }) };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // store regime bersama dimuat sebelum 38, seperti urutan <script> di index.html
  vm.runInContext(fs.readFileSync(path.join(rootDir, 'public/js/03b-regime-store.js'), 'utf8'), sandbox, { filename: '03b-regime-store.js' });
  vm.runInContext(source, sandbox, { filename: '38-ai-autonomous-trading.js' });
  return { sandbox, quotes, store };
}

const FRICTION = 0.001;

export async function runAiPaperProperties({ rootDir, seed = 1, steps = 150 }) {
  const { sandbox, quotes, store } = createAiPaperSandbox(rootDir);
  const rng = makeRng(seed);
  const out = [];
  let step = 0;
  const err = (id, msg) => out.push({ sev: 'ERROR', id, msg: `seed ${seed} langkah ${step}: ${msg}` });
  const warn = (id, msg) => out.push({ sev: 'WARN', id, msg: `seed ${seed} langkah ${step}: ${msg}` });
  const P = () => sandbox.AI_TRADE_STATE.paperAccount;
  const TICKERS = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF'];
  let shadowCash = 0;
  let operations = 0;
  let seenTrades = new Set();

  const reset = (amount) => { sandbox.aiResetPaperCapital(amount); shadowCash = amount; operations = 0; seenTrades = new Set(); };

  // Penutupan bisa terjadi di latar belakang (refresh harga otomatis setelah buka posisi), jadi buku bayangan menyerap SEMUA trade baru.
  const absorbClosedTrades = () => {
    for (const trade of P().closedTrades) {
      if (seenTrades.has(trade.id)) continue;
      seenTrades.add(trade.id);
      const shares = trade.lots * 100;
      operations++;
      shadowCash += trade.exitPrice * shares - Math.round((trade.entryPrice + trade.exitPrice) * shares * FRICTION);
    }
  };

  const checkAccount = async (label) => {
    await settle();
    absorbClosedTrades();
    sandbox.syncAiPaperPortfolioLivePrices(false);
    const p = P();
    if (process.env.MW_TRACE && step >= Number(process.env.MW_TRACE)) console.log(`[trace] ${step} ${label} modal=${p.initialCapital} kas=${Math.round(p.cash)} bayangan=${Math.round(shadowCash)} realisasi=${p.realizedPnL} posisi=${p.openPositions.map((x) => x.ticker + ':' + x.shares * x.entryPrice).join(',')}`);
    const tolerance = 2 + operations * 2;
    const ledgerEquity = p.initialCapital + p.realizedPnL + p.unrealizedPnL;
    if (Math.abs(p.totalEquity - ledgerEquity) > tolerance) err('EKUITAS-TIDAK-SAMA-MODAL-PLUS-PNL', `${label}: ekuitas ${p.totalEquity} vs modal+PnL ${ledgerEquity}`);
    const derivedCash = p.initialCapital + p.realizedPnL - p.openPositions.reduce((sum, x) => sum + x.costBasis, 0);
    if (Math.abs(p.cash - derivedCash) > tolerance) err('KAS-TIDAK-SAMA-TURUNAN-BUKU', `${label}: kas ${p.cash} vs modal+PnL-biaya posisi ${Math.round(derivedCash)}`);
    if (p.cash < -1) err('KAS-NEGATIF', `${label}: kas ${p.cash}`);
    if (Math.abs(p.cash - shadowCash) > tolerance) err('KAS-MENYIMPANG-DARI-BUKU-BAYANGAN', `${label}: kas ${p.cash} vs buku independen ${Math.round(shadowCash)}`);
    const netSum = p.closedTrades.reduce((sum, t) => sum + t.netPnL, 0);
    if (Math.abs(p.realizedPnL - netSum) > 1) err('PNL-TEREALISASI-TAK-SAMA-JUMLAH-TRADE', `${label}: ${p.realizedPnL} vs ${netSum}`);
    if (p.totalTrades !== p.closedTrades.length) err('TOTAL-TRADE-SALAH', `${label}: ${p.totalTrades} vs ${p.closedTrades.length}`);
    if (p.winningTrades + p.losingTrades !== p.totalTrades) err('MENANG+KALAH-TAK-SAMA-TOTAL', `${label}`);
    const expectedReturn = p.initialCapital > 0 ? Number((((p.realizedPnL + p.unrealizedPnL) / p.initialCapital) * 100).toFixed(2)) : 0;
    if (Math.abs(p.totalReturnPct - expectedReturn) > 0.011) err('RETURN-PERSEN-SALAH', `${label}: ${p.totalReturnPct}% vs ${expectedReturn}%`);
    if (p.maxDrawdownPct < 0 || p.maxDrawdownPct > 100) err('DRAWDOWN-DI-LUAR-RENTANG', `${label}: ${p.maxDrawdownPct}`);
    const tickers = p.openPositions.map((x) => x.ticker);
    if (new Set(tickers).size !== tickers.length) err('POSISI-GANDA-TICKER-SAMA', `${label}: ${tickers.join(',')}`);
    const ids = [...p.openPositions.map((x) => x.id), ...p.closedTrades.map((x) => x.id)];
    if (new Set(ids).size !== ids.length) err('ID-POSISI-GANDA', `${label}: id terpakai dua kali (trade tercatat ganda)`);
    for (const pos of p.openPositions) {
      if (pos.shares !== pos.lots * 100) err('SAHAM-BUKAN-KELIPATAN-LOT', `${label}: ${pos.ticker}`);
      if (Math.abs(pos.costBasis - pos.shares * pos.entryPrice) > 1) err('COST-BASIS-SALAH', `${label}: ${pos.ticker}`);
      if (Math.abs(pos.unrealizedPnL - (pos.currentValue - pos.costBasis)) > 1) err('PNL-POSISI-SALAH', `${label}: ${pos.ticker}`);
      if (!(pos.sl < pos.entryPrice)) err('SL-TIDAK-DI-BAWAH-ENTRY', `${label}: ${pos.ticker} sl ${pos.sl} entry ${pos.entryPrice}`);
    }
    const saved = JSON.parse(store.mw_ai_paper_v3 || 'null');
    if (saved && (Math.abs(saved.cash - p.cash) > 1 || saved.openPositions.length !== p.openPositions.length)) err('PENYIMPANAN-TIDAK-SAMA-MEMORI', `${label}: localStorage tertinggal dari state`);
  };

  const openPosition = async (ticker, entry) => {
    const slDist = Math.max(1, Math.round(entry * (0.03 + rng() * 0.05)));
    sandbox.AI_UNIVERSE.splice(0, sandbox.AI_UNIVERSE.length, ...sandbox.AI_UNIVERSE.filter((x) => x.ticker !== ticker));
    sandbox.AI_UNIVERSE.push({ ticker, signal: 'STRONG BUY', entry, sl: entry - slDist, tp1: entry + Math.round(slDist * 1.5), tp2: entry + slDist * 3, strategy: 'Sim', thesis: 'sim', confidence: 'High', ev: '+', compositeScore: 80 });
    quotes[ticker] = entry;
    sandbox.syncAiPaperPortfolioLivePrices(false);
    const p = P();
    const equityBefore = p.totalEquity;
    const cashBefore = p.cash;
    const countBefore = p.openPositions.length;
    await sandbox.aiOpenPositionFromSignal(ticker);
    if (p.openPositions.length === countBefore) return null;
    const pos = p.openPositions[p.openPositions.length - 1];
    operations++;
    shadowCash -= pos.shares * pos.entryPrice;
    if (Math.abs(cashBefore - p.cash - pos.shares * pos.entryPrice) > 1) err('KAS-BUKA-POSISI-SALAH', `${ticker}: kas turun ${cashBefore - p.cash} untuk biaya ${pos.shares * pos.entryPrice}`);
    if (pos.shares * pos.entryPrice > equityBefore * 0.15 + 1e-6) err('RISK-GATE-KONSENTRASI-DILANGGAR', `${ticker}: ${(pos.shares * pos.entryPrice / equityBefore * 100).toFixed(1)}% ekuitas dalam satu saham (limit 15%)`);
    if ((pos.entryPrice - pos.sl) * pos.shares > equityBefore * 0.01 + 1e-6) err('RISK-PER-TRADE-DILANGGAR', `${ticker}: risiko ${((pos.entryPrice - pos.sl) * pos.shares / equityBefore * 100).toFixed(2)}% ekuitas (limit 1%)`);
    if (p.cash < equityBefore * 0.2 - 1) err('BUFFER-KAS-DILANGGAR', `${ticker}: kas sisa ${(p.cash / equityBefore * 100).toFixed(1)}% ekuitas (minimal 20%)`);
    return pos;
  };

  const closePosition = async (pos, exitPrice, reason) => {
    const p = P();
    const before = p.closedTrades.length;
    await sandbox.aiClosePosition(pos.id, exitPrice, reason);
    if (p.closedTrades.length === before) return null;
    return p.closedTrades[0];
  };

  reset(750000000);
  await checkAccount('awal');

  for (step = 1; step <= steps; step++) {
    const roll = rng();
    const p = P();
    if (roll < 0.08) {
      const next = Math.round((10 + rng() * 1990) * 1e6);
      sandbox.syncAiPaperPortfolioLivePrices(false);
      const equityBefore = p.totalEquity;
      const capitalBefore = p.initialCapital;
      const cashBeforeConfigure = p.cash;
      const minCapital = p.openPositions.reduce((sum, x) => sum + x.costBasis, 0) - p.realizedPnL;
      sandbox.aiConfigureCapital(next);
      if (next >= minCapital - 1) shadowCash = cashBeforeConfigure + (next - capitalBefore);
      if (next < minCapital - 1) {
        shadowCash = p.cash;
      }
      const staleEquity = p.totalEquity;
      sandbox.syncAiPaperPortfolioLivePrices(false);
      if (p.initialCapital === next && Math.abs(staleEquity - p.totalEquity) > 2) warn('EKUITAS-BASI-SETELAH-UBAH-MODAL', `totalEquity ${staleEquity} sebelum sinkron vs ${p.totalEquity} sesudahnya; sizing risiko bisa memakai ekuitas lama`);
      if (p.initialCapital === next && Math.abs(p.totalEquity - equityBefore - (next - capitalBefore)) > 2) err('UBAH-MODAL-BUKAN-TRANSFER-MURNI', `ekuitas bergeser ${p.totalEquity - equityBefore} padahal modal berubah ${next - capitalBefore}`);
      if (next >= minCapital - 1 && p.initialCapital !== next) err('MODAL-TIDAK-TERSIMPAN', `${p.initialCapital} vs ${next}`);
      if (next < minCapital - 1 && p.initialCapital === next) err('MODAL-DI-BAWAH-POSISI-TERBUKA-DITERIMA', `modal ${next} diterima padahal posisi terbuka menanam ${Math.round(minCapital)}`);
      await checkAccount('ubah modal');
    } else if (roll < 0.40) {
      const ticker = TICKERS[Math.floor(rng() * TICKERS.length)];
      if (!p.openPositions.some((x) => x.ticker === ticker)) await openPosition(ticker, Math.round(50 + rng() * 19950));
      await checkAccount('buka posisi');
    } else if (roll < 0.62 && p.openPositions.length) {
      for (const pos of p.openPositions) quotes[pos.ticker] = Math.max(1, Math.round(pos.entryPrice * (0.85 + rng() * 0.35)));
      await checkAccount('gerak harga');
    } else if (roll < 0.80 && p.openPositions.length) {
      const pos = p.openPositions[Math.floor(rng() * p.openPositions.length)];
      const exit = Math.max(1, Math.round(pos.entryPrice * (0.7 + rng() * 0.6)));
      quotes[pos.ticker] = exit;
      sandbox.syncAiPaperPortfolioLivePrices(false);
      await closePosition(pos, exit, 'MANUAL');
      await checkAccount('tutup manual');
    } else if (roll < 0.92 && p.openPositions.length) {
      const pos = p.openPositions[Math.floor(rng() * p.openPositions.length)];
      const gapPrice = Math.max(1, Math.round(pos.sl * 0.9));
      quotes[pos.ticker] = gapPrice;
      const before = p.closedTrades.length;
      const marketAtRefresh = { ...quotes };
      await new Promise((resolve) => sandbox.aiRefreshPaperPortfolioQuotes(false, resolve));
      await settle();
      for (const trade of p.closedTrades.slice(0, p.closedTrades.length - before)) {
        const market = marketAtRefresh[trade.ticker];
        if (trade.exitReason === 'STOP LOSS' && market != null && trade.exitPrice > market) warn('SL-DIISI-LEBIH-BAIK-DARI-PASAR', `${trade.ticker}: harga pasar ${market}, stop loss diisi di ${trade.exitPrice} (fill optimistis, win rate dan PnL terlalu bagus)`);
      }
      for (const key of Object.keys(quotes)) if (!P().openPositions.some((x) => x.ticker === key)) delete quotes[key];
      await checkAccount('gap stop loss');
    } else if (roll < 0.94) {
      reset(Math.round((10 + rng() * 1990) * 1e6));
      const q = P();
      if (q.cash !== q.initialCapital || q.totalEquity !== q.initialCapital || q.openPositions.length || q.closedTrades.length) err('RESET-TIDAK-BERSIH', `kas ${q.cash}, ekuitas ${q.totalEquity}, posisi ${q.openPositions.length}`);
      Object.keys(quotes).forEach((k) => delete quotes[k]);
      await checkAccount('reset');
    } else {
      await checkAccount('tanpa operasi');
    }
  }

  // Skenario balapan: tombol/siklus ganda saat fetch regime masih berjalan.
  reset(750000000);
  const a = await openPosition('AAAA', 1500);
  const b = await openPosition('BBBB', 2000);
  if (a && b) {
    const before = { count: P().openPositions.length, bTicker: b.ticker };
    quotes.AAAA = 1400;
    sandbox.syncAiPaperPortfolioLivePrices(false);
    await Promise.all([sandbox.aiClosePosition(a.id, 1400, 'STOP LOSS'), sandbox.aiClosePosition(a.id, 1400, 'STOP LOSS')]);
    const p = P();
    const closedForA = p.closedTrades.filter((t) => t.id === a.id).length;
    if (closedForA !== 1) err('TUTUP-GANDA-TRADE-TERCATAT-LEBIH-DARI-SEKALI', `posisi ${a.ticker} tercatat ${closedForA}x di closedTrades (balapan dua pemanggilan tutup)`);
    if (!p.openPositions.some((x) => x.ticker === before.bTicker)) err('TUTUP-GANDA-MENGHAPUS-POSISI-LAIN', `posisi ${before.bTicker} yang tidak ditutup ikut hilang dari openPositions`);
  }
  reset(750000000);
  quotes.AAAA = 1500;
  sandbox.AI_UNIVERSE.splice(0, sandbox.AI_UNIVERSE.length, { ticker: 'AAAA', signal: 'STRONG BUY', entry: 1500, sl: 1418, tp1: 1637, tp2: 1700, strategy: 'Sim', thesis: 'sim', confidence: 'High', ev: '+', compositeScore: 80 });
  sandbox.syncAiPaperPortfolioLivePrices(false);
  await Promise.all([sandbox.aiOpenPositionFromSignal('AAAA'), sandbox.aiOpenPositionFromSignal('AAAA')]);
  const dup = P().openPositions.filter((x) => x.ticker === 'AAAA').length;
  if (dup > 1) err('BUKA-GANDA-POSISI-SAMA', `AAAA dibuka ${dup}x saat dua pemanggilan berjalan bersamaan`);
  return out;
}
