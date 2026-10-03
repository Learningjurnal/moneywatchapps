// Invarian Unified Screener (GET /api/idx/unified-screener). Dijalankan atas beberapa urutan sort sekaligus, karena bug
// "nomor # ikut berubah saat di-sort" hanya terlihat kalau hasil dibandingkan antar sort.

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function whaleLabelFor(row) {
  if (!row.whaleDataAvailable) return 'Tidak Ada Sinyal Hari Ini';
  if (row.whaleScore >= 3) return 'Akumulasi Kuat';
  if (row.whaleScore >= 1) return 'Akumulasi Lemah';
  if (row.whaleScore <= -1) return 'Distribusi';
  return 'Netral';
}

function isSortedBy(rows, valueOf, direction) {
  let previous = null;
  for (const row of rows) {
    const value = valueOf(row);
    if (value == null) continue;
    if (previous !== null && (direction === 'desc' ? value > previous : value < previous)) return false;
    previous = value;
  }
  return true;
}

export function checkScreener(variants) {
  const out = [];
  const err = (id, msg) => out.push({ sev: 'ERROR', id, msg });
  const warn = (id, msg) => out.push({ sev: 'WARN', id, msg });
  const names = Object.keys(variants);

  for (const name of names) {
    const res = variants[name];
    if (!res || res.success === false || !Array.isArray(res.rows)) {
      err('RESPONS-GAGAL', `${name}: ${res && res.error ? res.error : 'tanpa rows'}`);
      return out;
    }
  }

  const base = variants[names[0]];
  const rankOf = new Map(base.rows.map((r) => [r.ticker, r.rank]));

  for (const name of names) {
    const { rows, summary, total } = variants[name];
    const tickers = rows.map((r) => r.ticker);
    if (new Set(tickers).size !== tickers.length) err('TICKER-GANDA', `${name}: ada ticker muncul lebih dari sekali`);
    if (rows.length !== total) warn('TOTAL-TAK-SAMA', `${name}: rows ${rows.length} vs total ${total} (limit memotong hasil, sapuan tidak lengkap)`);

    for (const r of rows) {
      if (rankOf.has(r.ticker) && rankOf.get(r.ticker) !== r.rank) err('RANK-BERUBAH-ANTAR-SORT', `${r.ticker}: rank ${rankOf.get(r.ticker)} (${names[0]}) vs ${r.rank} (${name})`);
      if (r.uptrendScore != null && !(Number.isInteger(r.uptrendScore) && r.uptrendScore >= 0 && r.uptrendScore <= 100)) err('UPTREND-DI-LUAR-RENTANG', `${r.ticker}: ${r.uptrendScore}`);
      if (!Number.isInteger(r.whaleScore) || r.whaleScore < -3 || r.whaleScore > 4) err('WHALE-DI-LUAR-RENTANG', `${r.ticker}: ${r.whaleScore}`);
      if (r.whaleLabel !== whaleLabelFor(r)) err('LABEL-WHALE-SALAH', `${r.ticker}: skor ${r.whaleScore} berlabel "${r.whaleLabel}", seharusnya "${whaleLabelFor(r)}"`);
      if ((r.rank == null) !== (r.uptrendScore == null)) err('RANK-VS-DATA-TEKNIKAL', `${r.ticker}: rank ${r.rank} tetapi uptrendScore ${r.uptrendScore}`);
      if (r.confirmedUptrendWhale && !(r.regulatoryEligible && r.whaleScore >= 3 && r.uptrendScore != null)) err('KONFIRMASI-TANPA-SYARAT', `${r.ticker}: confirmed padahal eligible=${r.regulatoryEligible}, whale=${r.whaleScore}, uptrend=${r.uptrendScore}`);
      if (r.price != null && !(isNum(r.price) && r.price > 0)) err('HARGA-TAK-VALID', `${r.ticker}: ${r.price}`);
      if (r.per != null && !(isNum(r.per) && r.per > 0)) warn('PER-NONPOSITIF', `${r.ticker}: PER ${r.per} tampil di tabel`);
      if (r.chg1d != null && Math.abs(r.chg1d) > 50) warn('CHG1D-EKSTREM', `${r.ticker}: ${r.chg1d}%`);
      if (r.chg7d != null && Math.abs(r.chg7d) > 300) warn('CHG7D-EKSTREM', `${r.ticker}: ${r.chg7d}%`);
    }

    const ranked = rows.filter((r) => r.rank != null);
    if (summary && summary.rankedTotal != null && summary.rankedTotal !== ranked.length && rows.length === total) err('RANKED-TOTAL-SALAH', `${name}: summary.rankedTotal ${summary.rankedTotal} vs ${ranked.length} baris berperingkat`);
  }

  const byRank = variants.byRank || base;
  const ranked = byRank.rows.filter((r) => r.rank != null);
  ranked.forEach((r, i) => { if (r.rank !== i + 1) err('RANK-TIDAK-BERURUT-1-N', `posisi ${i + 1} berperingkat ${r.rank} (${r.ticker})`); });
  for (let i = 1; i < ranked.length; i++) {
    const a = ranked[i - 1];
    const b = ranked[i];
    const aheadOk = a.uptrendScore > b.uptrendScore
      || (a.uptrendScore === b.uptrendScore && a.whaleScore > b.whaleScore)
      || (a.uptrendScore === b.uptrendScore && a.whaleScore === b.whaleScore && a.ticker.localeCompare(b.ticker) < 0);
    if (!aheadOk) err('URUTAN-RANK-TIDAK-KANONIK', `${a.ticker} (up ${a.uptrendScore}, wh ${a.whaleScore}) mendahului ${b.ticker} (up ${b.uptrendScore}, wh ${b.whaleScore})`);
  }
  const trailing = byRank.rows.slice(ranked.length);
  if (trailing.some((r) => r.rank != null)) err('TAK-BERPERINGKAT-HARUS-TERAKHIR', 'ada ticker berperingkat setelah ticker tanpa peringkat saat sort rank');

  const checks = [
    ['by7d', (r) => r.chg7d, 'desc'],
    ['by1dAsc', (r) => r.chg1d, 'asc'],
    ['byUptrend', (r) => r.uptrendScore, 'desc'],
    ['byRank', (r) => r.rank, 'asc']
  ];
  for (const [name, valueOf, direction] of checks) {
    if (variants[name] && !isSortedBy(variants[name].rows, valueOf, direction)) err('SORT-TIDAK-BENAR', `${name}: kolom tidak terurut ${direction}`);
  }
  return out;
}
