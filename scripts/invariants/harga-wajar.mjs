// Invarian data Harga Wajar (GET /api/idx/financial-statement/:ticker). Tiap aturan lahir dari bug nyata yang pernah ditemukan:
// skala EPS per emiten/tahun, satuan angka 1000x, jangkar harga yang salah, EPS 0 / saham triliunan.

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const ratio = (a, b) => (a > b ? a / b : b / a);

export function checkFinancialStatement(payload, { price = null } = {}) {
  const out = [];
  const err = (id, msg) => out.push({ sev: 'ERROR', id, msg });
  const warn = (id, msg) => out.push({ sev: 'WARN', id, msg });

  if (!payload || payload.success !== true) {
    warn('API-TRANSIEN', `respons gagal: ${payload && payload.error ? payload.error : 'tanpa respons'}`);
    return out;
  }
  if (payload.available === false) {
    if (!payload.reason) err('TANPA-ALASAN', 'available:false tanpa field reason, UI tidak bisa menjelaskan kenapa kosong');
    return out;
  }
  const rows = payload.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    err('BARIS-KOSONG', 'available:true tetapi rows kosong');
    return out;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (const field of ['year', 'eps', 'equity', 'shares', 'netIncome']) {
      if (!finite(r[field])) err('NILAI-TIDAK-VALID', `FY${r.year} ${field}=${r[field]}`);
    }
    if (i > 0 && !(r.year > rows[i - 1].year)) err('TAHUN-TIDAK-URUT', `FY${rows[i - 1].year} diikuti FY${r.year}`);
    if (r.dps !== null && r.dps !== undefined) err('DPS-DIKARANG', `FY${r.year} dps=${r.dps} padahal Invezgo tidak punya DPS`);
  }
  if (out.some((v) => v.id === 'NILAI-TIDAK-VALID')) return out;

  for (const r of rows) {
    if (r.shares <= 0) err('SAHAM-NONPOSITIF', `FY${r.year} shares=${r.shares}`);
    if (Math.sign(r.eps) !== Math.sign(r.netIncome) && r.eps !== 0) err('TANDA-EPS-LABA', `FY${r.year} EPS ${r.eps} vs laba ${r.netIncome} berbeda tanda`);
    if (r.eps === 0) warn('EPS-NOL', `FY${r.year} EPS tampil 0 (laba ${r.netIncome} miliar)`);
    if (r.shares >= 100 && r.eps !== 0) {
      const implied = (r.netIncome * 1e9) / (r.eps * r.shares * 1e6);
      if (Math.abs(implied - 1) > 0.1) err('EPS-SAHAM-LABA-TAK-KONSISTEN', `FY${r.year} laba/(EPS x saham) = ${implied.toFixed(3)}`);
    }
  }

  const shares = rows.map((r) => r.shares).filter((s) => s > 0);
  if (shares.length > 1) {
    const spread = ratio(Math.max(...shares), Math.min(...shares));
    if (spread > 50) err('SKALA-SAHAM-MELEDAK', `jumlah saham antar tahun berselisih ${spread.toFixed(0)}x (${rows.map((r) => r.shares).join('/')}) , tanda skala EPS salah`);
    else if (spread > 6) warn('SAHAM-BERUBAH-BESAR', `jumlah saham berselisih ${spread.toFixed(1)}x antar tahun (split/rights besar atau skala salah)`);
  }

  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.equity > 0 && b.equity > 0 && ratio(a.equity, b.equity) > 20) warn('EKUITAS-LONCAT', `ekuitas FY${a.year}->FY${b.year} berubah ${ratio(a.equity, b.equity).toFixed(0)}x (kemungkinan anomali satuan)`);
    if (a.eps !== 0 && b.eps !== 0 && Math.sign(a.eps) === Math.sign(b.eps) && ratio(Math.abs(a.eps), Math.abs(b.eps)) > 50) warn('EPS-LONCAT', `EPS FY${a.year}->FY${b.year} ${a.eps} -> ${b.eps}`);
  }

  const last = rows[rows.length - 1];
  if (last.equity > 0 && last.shares > 0) {
    const bvps = (last.equity * 1e9) / (last.shares * 1e6);
    if (bvps < 1 || bvps > 5e6) err('BVPS-MUSTAHIL', `BVPS FY${last.year} = ${bvps.toFixed(2)}`);
    else if (bvps < 20) warn('BVPS-RENDAH', `BVPS FY${last.year} = ${bvps.toFixed(1)}`);
    const roe = (last.netIncome / last.equity) * 100;
    if (Math.abs(roe) > 500) err('ROE-MUSTAHIL', `ROE FY${last.year} = ${roe.toFixed(0)}%`);
    else if (Math.abs(roe) > 100) warn('ROE-EKSTREM', `ROE FY${last.year} = ${roe.toFixed(0)}%`);
    if (price > 0) {
      const pbv = price / bvps;
      if (pbv < 0.005 || pbv > 500) err('PBV-MUSTAHIL', `PBV = ${pbv.toFixed(3)} (harga ${price}, BVPS ${bvps.toFixed(1)})`);
      else if (pbv < 0.05 || pbv > 40) warn('PBV-EKSTREM', `PBV = ${pbv.toFixed(2)}`);
    }
  }
  if (price > 0 && last.eps > 0) {
    const per = price / last.eps;
    if (per < 0.05 || per > 20000) err('PER-MUSTAHIL', `PER = ${per.toFixed(2)} (harga ${price}, EPS ${last.eps})`);
    else if (per < 1 || per > 500) warn('PER-EKSTREM', `PER = ${per.toFixed(1)}`);
  }

  const note = payload.disclosures && payload.disclosures.epsScaleAssumption;
  if (!note || !/pembagi/i.test(note)) err('PENGUNGKAPAN-HILANG', 'disclosure skala EPS tidak ada, UI akan menampilkan angka turunan tanpa penjelasan');
  return out;
}
