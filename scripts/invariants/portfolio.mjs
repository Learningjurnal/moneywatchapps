// Invarian matematika portofolio: mesin fee/pajak, posisi saham (rata-rata tertimbang), PnL terealisasi vs arus kas,
// saldo RDN, dividen, dan XIRR/TWR. Semuanya dijalankan lewat fungsi ASLI aplikasi (addTx, addDiv, addRdn,
// reconcileRdnWithTransactions, recalculateAllStoredData, getPortfolio, ...) di vm Node, lalu dibandingkan dengan model
// bayangan yang ditulis ulang secara independen dari maksud perhitungannya (bukan menyalin kode aplikasi).
import { createPortfolioSandbox } from './portfolio-sandbox.mjs';
import { makeRng } from './core.mjs';

const near = (a, b, tol) => Math.abs(a - b) <= tol;

export function checkFeeEngine(sandbox) {
  const out = [];
  const err = (id, msg) => out.push({ sev: 'ERROR', id, msg });
  const warn = (id, msg) => out.push({ sev: 'WARN', id, msg });
  const rng = makeRng(7);
  const grosses = [1, 10, 100, 500, 1000, 5000, 1e4, 5e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10];
  for (let i = 0; i < 150; i++) grosses.push(Math.round(Math.exp(rng() * Math.log(1e10))));
  const sekuritasList = [...Object.keys(sandbox.SEKURITAS), 'SEKURITAS-TIDAK-ADA'];
  for (const sek of sekuritasList) {
    for (const isBuy of [true, false]) {
      let previousFee = null;
      for (const gross of [...grosses].sort((a, b) => a - b)) {
        const c = sandbox.calcTxComponents(gross, isBuy, sek);
        const tag = `${sek} ${isBuy ? 'BUY' : 'SELL'} gross ${gross}`;
        const parts = [c.komisi, c.ppn, c.levy, c.pph, c.serviceFee];
        if (parts.some((p) => !Number.isInteger(p) || p < 0)) { err('KOMPONEN-FEE-TIDAK-VALID', `${tag}: ${JSON.stringify(c)}`); continue; }
        if (c.komisi + c.ppn + c.levy + c.pph + c.serviceFee !== c.totalFee) err('TOTAL-FEE-TAK-SAMA-KOMPONEN', tag);
        if (c.net !== (isBuy ? gross + c.totalFee : gross - c.totalFee)) err('NET-SALAH', `${tag}: net ${c.net}`);
        if (isBuy && c.pph !== 0) err('PPH-DI-TRANSAKSI-BELI', `${tag}: pph ${c.pph}`);
        if (!isBuy && c.pph !== Math.round(gross * sandbox.TAX_SETTINGS.pphJual)) err('PPH-JUAL-SALAH', `${tag}: pph ${c.pph}`);
        if (c.ppn > 0 && !near(c.ppn, c.komisi * sandbox.TAX_SETTINGS.ppn, 1.5)) err('PPN-BUKAN-11-PERSEN-KOMISI', `${tag}: ppn ${c.ppn} vs komisi ${c.komisi}`);
        const allIn = Math.round(gross * c.komisiRate);
        const clamped = c.komisi + c.ppn === 0;
        if (!clamped && !near(c.totalFee, allIn + c.serviceFee, 1.5)) err('TOTAL-FEE-MENYIMPANG-DARI-TARIF-ALL-IN', `${tag}: total ${c.totalFee} vs tarif ${allIn}`);
        if (clamped && c.totalFee > allIn + c.serviceFee + 2) warn('FEE-MELEBIHI-TARIF-ALL-IN-TRANSAKSI-KECIL', `${tag}: total ${c.totalFee} vs tarif all-in ${allIn}`);
        if (previousFee !== null && c.totalFee < previousFee - 1) err('FEE-TURUN-SAAT-NILAI-NAIK', `${tag}: ${previousFee} -> ${c.totalFee}`);
        previousFee = c.totalFee;
        if (gross >= 1e5 && c.totalFee / gross > 0.01) warn('FEE-LEBIH-DARI-1-PERSEN', `${tag}: ${(c.totalFee / gross * 100).toFixed(2)}%`);
      }
    }
  }
  return out;
}

export function checkReturns(sandbox) {
  const out = [];
  const err = (id, msg) => out.push({ sev: 'ERROR', id, msg });
  const rng = makeRng(11);

  const two = sandbox.computeXIRR([{ date: '2024-01-01', amount: -100 }, { date: '2026-01-01', amount: 121 }]);
  if (!near(two.rate, 0.1, 0.002)) err('XIRR-KASUS-BAKU-SALAH', `-100 lalu +121 setelah 2 tahun harusnya 10%/th, hasil ${two.rate}`);

  for (let i = 0; i < 60; i++) {
    const n = 2 + Math.floor(rng() * 5);
    const flows = [{ date: '2024-01-01', amount: -(1000 + rng() * 9000) }];
    let day = 0;
    for (let k = 1; k < n; k++) {
      day += 20 + Math.floor(rng() * 200);
      const date = new Date(Date.UTC(2024, 0, 1) + day * 86400000).toISOString().slice(0, 10);
      flows.push({ date, amount: rng() < 0.3 ? -(200 + rng() * 2000) : 300 + rng() * 6000 });
    }
    const result = sandbox.computeXIRR(flows);
    if (result.rate == null) continue;
    const npv = sandbox.xnpv(result.rate, flows);
    const scale = flows.reduce((sum, f) => sum + Math.abs(f.amount), 0);
    if (Math.abs(npv) > scale * 1e-6) err('XIRR-NPV-TIDAK-NOL', `NPV pada rate ${result.rate.toFixed(4)} = ${npv.toFixed(4)} untuk ${JSON.stringify(flows.map((f) => [f.date, Math.round(f.amount)]))}`);
  }

  const twr = (hist, muts) => {
    sandbox.equityHistorySave(hist);
    return sandbox.computeTWR(muts, hist[hist.length - 1].equity);
  };
  const noFlow = twr([{ date: '2026-01-01', equity: 100 }, { date: '2026-01-02', equity: 110 }], [{ date: '2026-01-01', type: 'SETOR', amount: 100 }]);
  if (!near(noFlow, 10, 0.01)) err('TWR-TANPA-ARUS-KAS-SALAH', `100 -> 110 tanpa arus kas lanjutan harusnya 10%, hasil ${noFlow}`);
  const deposit = twr([{ date: '2026-01-01', equity: 100 }, { date: '2026-01-02', equity: 200 }], [{ date: '2026-01-01', type: 'SETOR', amount: 100 }, { date: '2026-01-02', type: 'SETOR', amount: 100 }]);
  if (!near(deposit, 0, 0.01)) err('TWR-SETORAN-DIHITUNG-SEBAGAI-UNTUNG', `ekuitas naik tepat sebesar setoran harusnya 0%, hasil ${deposit}`);
  const withdrawal = twr([{ date: '2026-01-01', equity: 100 }, { date: '2026-01-02', equity: 40 }], [{ date: '2026-01-01', type: 'SETOR', amount: 100 }, { date: '2026-01-02', type: 'TARIK', amount: -60 }]);
  if (!near(withdrawal, 0, 0.01)) err('TWR-PENARIKAN-DIHITUNG-SEBAGAI-RUGI', `ekuitas turun tepat sebesar penarikan harusnya 0%, hasil ${withdrawal}`);
  return out;
}

// mutate(sandbox): hook uji detektor, menyuntikkan bug ke mesin sebelum simulasi (lihat test_suite.js).
export function runPortfolioProperties({ rootDir, seed = 1, steps = 120, mutate = null }) {
  const { sandbox: S, loadErrors } = createPortfolioSandbox(rootDir);
  if (mutate) mutate(S);
  const out = [];
  let step = 0;
  const err = (id, msg) => out.push({ sev: 'ERROR', id, msg: `seed ${seed} langkah ${step}: ${msg}` });
  const warn = (id, msg) => out.push({ sev: 'WARN', id, msg: `seed ${seed} langkah ${step}: ${msg}` });
  if (loadErrors.length) { err('MESIN-PORTOFOLIO-GAGAL-DIMUAT', loadErrors.join('; ')); return out; }

  const rng = makeRng(seed);
  const TICKERS = ['AAAA', 'BBBB', 'CCCC', 'DDDD'];
  const SEKS = Object.keys(S.SEKURITAS);
  const held = {};
  let date = Date.UTC(2026, 0, 1);
  const nextDate = () => { date += Math.floor(rng() * 3) * 86400000; return new Date(date).toISOString().slice(0, 10); };
  S.transactions.length = 0;
  S.dividends.length = 0;
  S.rdnMutations.length = 0;
  S.activeSekuritas = 'Stockbit';

  const shadow = () => {
    const byTicker = {};
    const sorted = [...S.transactions].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id - b.id));
    for (const tx of sorted) {
      const h = byTicker[tx.ticker] || (byTicker[tx.ticker] = { shares: 0, gross: 0, net: 0, realized: 0, buyNet: 0, sellNet: 0 });
      const shares = tx.lot * 100;
      if (tx.type === 'BUY') {
        h.shares += shares; h.gross += tx.gross; h.net += tx.net; h.buyNet += tx.net;
      } else {
        const avgGross = h.shares > 0 ? h.gross / h.shares : 0;
        const avgNet = h.shares > 0 ? h.net / h.shares : 0;
        h.realized += tx.net - avgNet * shares;
        h.shares = Math.max(0, h.shares - shares);
        h.gross = Math.max(0, h.gross - avgGross * shares);
        h.net = Math.max(0, h.net - avgNet * shares);
        h.sellNet += tx.net;
        if (h.shares === 0) { h.gross = 0; h.net = 0; }
      }
    }
    return byTicker;
  };

  const check = (label) => {
    S._invalidatePortoCache();
    // Jalur inkremental (addTx/addDiv/addRdn/hapus) harus sudah konsisten sebelum rekonsiliasi penuh menghitung ulang dari nol.
    const incrementalBalance = S.rdnBalance;
    const incrementalCount = S.rdnMutations.length;
    S.reconcileRdnWithTransactions(true);
    if (!near(incrementalBalance, S.rdnBalance, 0.5)) err('REKONSILIASI-MENGUBAH-SALDO-RDN', `${label}: saldo inkremental ${Math.round(incrementalBalance)} vs hasil rekonsiliasi ${Math.round(S.rdnBalance)}`);
    if (incrementalCount !== S.rdnMutations.length) err('REKONSILIASI-MENGUBAH-JUMLAH-MUTASI', `${label}: ${incrementalCount} -> ${S.rdnMutations.length} mutasi`);
    const model = shadow();
    const porto = Object.fromEntries(S.getPortfolio().map((p) => [p.ticker, p]));
    const perf = Object.fromEntries(S.getStockPerformanceByTicker().map((p) => [p.ticker, p]));
    const metrics = S.calcChronologicalTxMetrics();

    for (const tx of S.transactions) {
      const parts = tx.komisi + tx.ppn + tx.levy + tx.pph + (tx.serviceFee || 0);
      if (tx.net !== (tx.type === 'BUY' ? tx.gross + parts : tx.gross - parts)) err('NET-TRANSAKSI-TAK-SAMA-KOMPONEN', `${label}: tx ${tx.id}`);
    }

    let sumMv = 0;
    for (const [ticker, h] of Object.entries(model)) {
      const p = porto[ticker];
      const q = perf[ticker];
      if (h.shares > 0) {
        if (!p) { err('POSISI-HILANG', `${label}: ${ticker} seharusnya memegang ${h.shares} lembar`); continue; }
        if (p.shares !== h.shares || p.lot * 100 !== h.shares) err('JUMLAH-SAHAM-SALAH', `${label}: ${ticker} mesin ${p.shares} vs model ${h.shares}`);
        if (!near(p.cost, h.net, 1 + h.net * 1e-9)) err('BIAYA-POKOK-SALAH', `${label}: ${ticker} mesin ${Math.round(p.cost)} vs model termasuk fee beli ${Math.round(h.net)}`);
        if (!near(p.costGross, h.gross, 1 + h.gross * 1e-9)) err('BIAYA-POKOK-TANPA-FEE-SALAH', `${label}: ${ticker} mesin ${Math.round(p.costGross)} vs model ${Math.round(h.gross)}`);
        if (!near(p.avg * p.shares, p.cost, 1)) err('AVG-BELI-TAK-SAMA-MODAL-PER-LEMBAR', `${label}: ${ticker} avg ${p.avg} x ${p.shares} lembar vs modal ${Math.round(p.cost)}`);
        if (!near(p.mv, p.shares * p.mp, 0.5)) err('NILAI-PASAR-SALAH', `${label}: ${ticker}`);
        if (!near(p.unreal, p.mv - p.cost, 0.5)) err('UNREALIZED-SALAH', `${label}: ${ticker}`);
        sumMv += p.mv;
      } else if (p) {
        err('POSISI-PADAHAL-SUDAH-HABIS', `${label}: ${ticker} masih terdaftar dengan ${p.shares} lembar`);
      }
      if (q && Math.abs(q.realized - Math.round(h.realized)) > 1) err('REALIZED-PNL-SALAH', `${label}: ${ticker} mesin ${q.realized} vs model ${Math.round(h.realized)}`);
      const chronoRealized = S.transactions.filter((t) => t.ticker === ticker && t.type === 'SELL').reduce((sum, t) => sum + (metrics[t.id] ? metrics[t.id].pnlNet : 0), 0);
      if (q && Math.abs(chronoRealized - q.realized) > 1 + S.transactions.length * 0.5) err('PNL-KRONOLOGIS-BEDA-DARI-PER-SAHAM', `${label}: ${ticker} kronologis ${Math.round(chronoRealized)} vs per-saham ${q.realized}`);
      if (q && p) {
        const economic = h.sellNet + p.mv - h.buyNet;
        if (Math.abs(economic - q.total) > 2 + Math.abs(economic) * 1e-9) err('PNL-TOTAL-TIDAK-SAMA-ARUS-KAS', `${label}: ${ticker} realized+unrealized ${Math.round(q.total)} vs jual+nilai pasar-beli ${Math.round(economic)} (selisih ${Math.round(q.total - economic)})`);
      }
    }

    const rdnSum = S.rdnMutations.filter((m) => (m.account || 'saham') === 'saham').reduce((sum, m) => sum + m.amount, 0);
    if (!near(S.rdnBalance, rdnSum, 0.5)) err('SALDO-RDN-TAK-SAMA-JUMLAH-MUTASI', `${label}: ${S.rdnBalance} vs ${rdnSum}`);
    const expectedTrade = S.transactions.reduce((sum, t) => sum + (t.type === 'BUY' ? -t.net : t.net), 0)
      + S.dividends.reduce((sum, d) => sum + d.net, 0);
    const expectedManual = S.rdnMutations.filter((m) => !m.linkedTxId).reduce((sum, m) => sum + m.amount, 0);
    if (!near(S.rdnBalance, expectedTrade + expectedManual, 1)) err('SALDO-RDN-TAK-SAMA-ARUS-KAS-TRANSAKSI', `${label}: saldo ${Math.round(S.rdnBalance)} vs setoran/tarikan + transaksi + dividen ${Math.round(expectedTrade + expectedManual)}`);
    for (const tx of S.transactions) {
      const linked = S.rdnMutations.filter((m) => String(m.linkedTxId) === String(tx.id));
      if (linked.length !== 1) err('MUTASI-RDN-TIDAK-TEPAT-SATU', `${label}: tx ${tx.id} punya ${linked.length} mutasi RDN`);
      else if (!near(linked[0].amount, tx.type === 'BUY' ? -tx.net : tx.net, 0.5)) err('MUTASI-RDN-NILAI-SALAH', `${label}: tx ${tx.id} mutasi ${linked[0].amount} vs net ${tx.net}`);
    }
    for (const m of S.rdnMutations) {
      if (m.linkedTxId && !S.transactions.some((t) => String(t.id) === String(m.linkedTxId)) && !S.dividends.some((d) => 'div-' + d.id === String(m.linkedTxId))) err('MUTASI-RDN-YATIM', `${label}: mutasi ${m.id} menaut ke ${m.linkedTxId} yang tidak ada`);
    }

    const aum = S.computeCurrentAUM();
    if (!near(aum, Math.round(sumMv + S.calcRdnBalance('all')), 2)) err('AUM-TAK-SAMA-NILAI-PASAR-PLUS-KAS', `${label}: AUM ${aum} vs ${Math.round(sumMv + S.calcRdnBalance('all'))}`);

    for (const key of ['cost', 'mv', 'unreal', 'ret', 'avg']) {
      for (const p of Object.values(porto)) if (!Number.isFinite(p[key])) err('NILAI-TIDAK-HINGGA', `${label}: ${p.ticker}.${key} = ${p[key]}`);
    }
    if (!Number.isFinite(S.rdnBalance)) err('SALDO-RDN-TIDAK-HINGGA', label);
  };

  const idempotence = (label) => {
    S.recalculateAllStoredData(true);
    const once = JSON.stringify({ t: S.transactions, d: S.dividends, m: S.rdnMutations });
    S.recalculateAllStoredData(true);
    S.reconcileRdnWithTransactions(true);
    S.recalculateAllStoredData(true);
    const twice = JSON.stringify({ t: S.transactions, d: S.dividends, m: S.rdnMutations });
    if (once !== twice) err('REKALKULASI-TIDAK-IDEMPOTEN', `${label}: menjalankan rekalkulasi/rekonsiliasi lagi mengubah data`);
  };

  S.addRdn('2026-01-01', 'SETOR', 'Setoran Awal', 5e9, 'Stockbit');
  S.rdnMutations.forEach((m) => { m.linkedTxId = null; });
  for (const t of TICKERS) { held[t] = 0; S.prices[t] = Math.round(100 + rng() * 9900); }
  check('awal');

  for (step = 1; step <= steps; step++) {
    const roll = rng();
    const ticker = TICKERS[Math.floor(rng() * TICKERS.length)];
    if (roll < 0.40) {
      const lot = 1 + Math.floor(rng() * 300);
      const price = Math.round(50 + rng() * 19950);
      S.addTx(nextDate(), 'BUY', ticker, lot, price, SEKS[Math.floor(rng() * SEKS.length)]);
      held[ticker] += lot;
    } else if (roll < 0.62 && held[ticker] > 0) {
      const lot = 1 + Math.floor(rng() * held[ticker]);
      const price = Math.round(50 + rng() * 19950);
      S.addTx(nextDate(), 'SELL', ticker, lot, price, SEKS[Math.floor(rng() * SEKS.length)]);
      held[ticker] -= lot;
    } else if (roll < 0.75) {
      S.prices[ticker] = Math.max(1, Math.round(S.prices[ticker] * (0.8 + rng() * 0.4)));
    } else if (roll < 0.83 && held[ticker] > 0) {
      S.addDiv(nextDate(), ticker, held[ticker] * 100, Math.round((1 + rng() * 300) * 10) / 10, rng() < 0.5 ? 0 : 0.1);
    } else if (roll < 0.90) {
      const amount = Math.round((1 + rng() * 500) * 1e6);
      S.addRdn(nextDate(), rng() < 0.7 ? 'SETOR' : 'TARIK', 'Mutasi manual', rng() < 0.7 ? amount : -amount, 'Stockbit');
    } else if (roll < 0.93 && S.transactions.length) {
      const target = S.transactions[Math.floor(rng() * S.transactions.length)];
      const before = JSON.stringify(S.transactions);
      const result = S.removeTxById(target.id);
      if (!result.ok && before !== JSON.stringify(S.transactions)) err('HAPUS-DITOLAK-TAPI-DATA-BERUBAH', 'removeTxById menolak tetapi buku transaksi berubah');
    } else if (roll < 0.96 && S.transactions.length) {
      const target = S.transactions[Math.floor(rng() * S.transactions.length)];
      const before = JSON.stringify([S.transactions, S.rdnMutations]);
      const result = S.applyTxEdit(target.id, { date: target.date, type: target.type, ticker: target.ticker, lot: Math.max(1, Math.round(target.lot * (0.5 + rng()))), price: Math.round(50 + rng() * 19950), sekuritas: target.sekuritas });
      if (!result.ok && before !== JSON.stringify([S.transactions, S.rdnMutations])) err('EDIT-DITOLAK-TAPI-DATA-BERUBAH', 'applyTxEdit menolak tetapi transaksi/mutasi RDN berubah');
    } else {
      idempotence('rekalkulasi');
    }
    for (const t of TICKERS) held[t] = S.transactions.filter((x) => x.ticker === t).reduce((sum, x) => sum + (x.type === 'BUY' ? x.lot : -x.lot), 0);
    if (S.validateStockLedger(S.transactions)) err('BUKU-TRANSAKSI-MELANGGAR-KEPEMILIKAN', `buku berisi penjualan tanpa posisi: ${S.validateStockLedger(S.transactions).message}`);
    check('operasi');
  }
  idempotence('akhir');
  check('akhir');
  return out;
}

export function checkLedgerGuards({ rootDir, mutate = null }) {
  const { sandbox: S, loadErrors } = createPortfolioSandbox(rootDir);
  if (mutate) mutate(S);
  const out = [];
  const err = (id, msg) => out.push({ sev: 'ERROR', id, msg });
  if (loadErrors.length) { err('MESIN-PORTOFOLIO-GAGAL-DIMUAT', loadErrors.join('; ')); return out; }
  const fresh = () => { S.transactions.length = 0; S.dividends.length = 0; S.rdnMutations.length = 0; S.nextTxId = 1; S._invalidatePortoCache(); };
  const snapshot = () => JSON.stringify([S.transactions, S.rdnMutations]);

  fresh();
  S.addTx('2026-01-01', 'BUY', 'AAAA', 10, 1000, 'Stockbit');
  let before = snapshot();
  let r = S.addTx('2026-01-05', 'SELL', 'AAAA', 15, 1100, 'Stockbit');
  if (!r || r.ok !== false) err('JUAL-MELEBIHI-KEPEMILIKAN-DITERIMA', 'menjual 15 lot dari 10 lot yang dimiliki diterima: uang masuk ke RDN tanpa biaya pokok');
  if (before !== snapshot()) err('JUAL-DITOLAK-TAPI-DATA-BERUBAH', 'penjualan ditolak tetapi transaksi/mutasi RDN berubah');

  r = S.addTx('2025-12-01', 'SELL', 'AAAA', 1, 1100, 'Stockbit');
  if (!r || r.ok !== false) err('JUAL-SEBELUM-BELI-DITERIMA', 'penjualan bertanggal sebelum pembelian pertama diterima');

  S.addTx('2026-01-10', 'SELL', 'AAAA', 4, 1200, 'Stockbit');
  before = snapshot();
  r = S.removeTxById(S.transactions.find((t) => t.type === 'BUY').id);
  if (r.ok) err('HAPUS-BELI-MENINGGALKAN-JUAL-TANPA-POSISI', 'menghapus pembelian yang masih punya penjualan sesudahnya diterima');
  if (before !== snapshot()) err('HAPUS-DITOLAK-TAPI-DATA-BERUBAH', 'penghapusan ditolak tetapi data berubah');

  const buyTx = S.transactions.find((t) => t.type === 'BUY');
  if (!buyTx) return out;
  const buyId = buyTx.id;
  r = S.applyTxEdit(buyId, { date: '2026-01-01', type: 'BUY', ticker: 'AAAA', lot: 3, price: 1000, sekuritas: 'Stockbit' });
  if (r.ok) err('EDIT-BELI-DI-BAWAH-JUMLAH-JUAL-DITERIMA', 'mengecilkan pembelian jadi 3 lot padahal 4 lot sudah dijual diterima');

  r = S.addTx('2026-01-11', 'SELL', 'AAAA', 6, 1300, 'Stockbit');
  if (!r || r.ok !== true) err('JUAL-SAH-DITOLAK', 'menjual tepat sisa 6 lot ditolak');
  r = S.addTx('2026-01-12', 'BUY', 'AAAA', 5, 1000, 'Stockbit');
  if (!r || r.ok !== true) err('BELI-SAH-DITOLAK', 'pembelian biasa ditolak');
  return out;
}
