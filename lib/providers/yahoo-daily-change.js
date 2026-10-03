/**
 * lib/providers/yahoo-daily-change.js
 * Perubahan harian (vs penutupan hari bursa sebelumnya) dari respons
 * Yahoo Finance chart v8 — fungsi murni, bisa diuji tanpa jaringan.
 *
 * FIX (2026-10-04): getIdxMarketSummary() memakai `meta.chartPreviousClose`
 * sebagai "penutupan kemarin". Itu SALAH untuk query range=5d: di sana
 * chartPreviousClose = penutupan SEBELUM bar pertama dalam rentang
 * (bukan kemarin). Terbukti dari respons nyata ^JKSE 2026-10-03: harga
 * 6036.89, chartPreviousClose 6147.86 (penutupan 2026-09-28, 4 hari bursa
 * sebelumnya) => perubahan terlapor -1.81%, padahal perubahan harian riil
 * +0.46% (vs 6009.50 pada 2026-10-01). Penutupan sebelumnya yang benar
 * diambil dari deret `close` harian itu sendiri.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {object} result  chart.result[0] dari Yahoo (meta, timestamp, indicators)
 * @returns {{price:number, previous:number, change:number, changePercent:number}|null}
 *   null bila data tidak cukup — pemanggil harus menandainya tidak tersedia,
 *   bukan mengisi angka pengganti.
 */
function computeYahooDailyChange(result) {
  const meta = result && result.meta;
  if (!meta || !isNum(meta.regularMarketPrice)) return null;

  const closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
  const stamps = result.timestamp || [];
  const bars = [];
  stamps.forEach((t, i) => {
    if (isNum(t) && isNum(closes[i])) bars.push({ t, c: closes[i] });
  });
  if (bars.length === 0) return null;

  // Hari bursa lokal (gmtoffset) dari bar terakhir vs waktu harga terakhir.
  const offset = isNum(meta.gmtoffset) ? meta.gmtoffset : 0;
  const dayKey = (sec) => Math.floor((sec + offset) / 86400);
  const last = bars[bars.length - 1];
  const priceTime = isNum(meta.regularMarketTime) ? meta.regularMarketTime : last.t;

  // Bar terakhir = hari ini (sesi berjalan/baru tutup) => pembanding adalah bar
  // sebelumnya. Bar terakhir lebih tua dari hari ini => itu sendiri penutupan terakhir.
  const prevBar = dayKey(last.t) === dayKey(priceTime) ? bars[bars.length - 2] : last;
  if (!prevBar || !isNum(prevBar.c) || prevBar.c <= 0) return null;

  const price = meta.regularMarketPrice;
  const change = Math.round((price - prevBar.c) * 100) / 100;
  return {
    price,
    previous: prevBar.c,
    change,
    changePercent: Math.round(((price - prevBar.c) / prevBar.c) * 10000) / 100
  };
}

export { computeYahooDailyChange };
