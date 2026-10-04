/** test_twr.js — computeTWR (public/js/21-performance.js): arus kas di antara dua snapshot tidak boleh hilang. */
import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
const src = fs.readFileSync(new URL('./public/js/21-performance.js', import.meta.url), 'utf8').split('\r\n').join('\n');
const a = src.indexOf('function computeTWR(');
const b = src.indexOf('\n}\n', a) + 3;
assert(a > 0 && b > a, 'computeTWR tidak ditemukan');
const run = (hist, muts, tv) => {
  const sb = { equityHistoryLoad: () => hist, Date, Math, isFinite }; vm.createContext(sb);
  vm.runInContext(src.slice(a, b) + '\nthis.r = computeTWR(' + JSON.stringify(muts) + ',' + tv + ');', sb);
  return sb.r;
};
let n = 0, total = 0;
const t = (name, fn) => { total++; try { fn(); console.log('  ✅ [PASS] ' + name); n++; } catch (e) { console.error('  ❌ [FAIL] ' + name + ': ' + e.message); process.exitCode = 1; } };
t('tanpa arus kas baru: TWR = pertumbuhan ekuitas murni', () => {
  const r = run([{ date: '2026-09-01', equity: 100 }, { date: '2026-09-02', equity: 110 }], [{ date: '2026-08-01', amount: 100 }], 110);
  assert(Math.abs(r - 10) < 1e-9, String(r));
});
t('setoran di antara dua snapshot (tanggal tak persis snapshot) tidak dihitung sebagai laba', () => {
  // Ekuitas 100 -> 200 hanya karena setoran 100 pada 2026-09-02 (snapshot 09-01 dan 09-03): TWR harus 0%.
  const r = run([{ date: '2026-09-01', equity: 100 }, { date: '2026-09-03', equity: 200 }], [{ date: '2026-08-01', amount: 100 }, { date: '2026-09-02', amount: 100 }], 200);
  assert(Math.abs(r) < 1e-9, 'TWR seharusnya 0%, dapat ' + r);
});
t('penarikan di antara snapshot juga diperhitungkan', () => {
  const r = run([{ date: '2026-09-01', equity: 200 }, { date: '2026-09-03', equity: 100 }], [{ date: '2026-08-01', amount: 200 }, { date: '2026-09-02', amount: -100 }], 100);
  assert(Math.abs(r) < 1e-9, 'TWR seharusnya 0%, dapat ' + r);
});
console.log(n === total ? `🎉 ALL ${n}/${total} TWR TESTS PASSED` : `⚠️ ${n}/${total}`);
