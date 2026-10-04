/** test_flowscan_realbars.js — fsGenData() tidak boleh mengarang bar "hari ini" (volume rekaan) dari harga live. */
import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
const src = fs.readFileSync(new URL('./public/js/07-flowscan.js', import.meta.url), 'utf8').split('\r\n').join('\n');
const a = src.indexOf('function fsGenData(tk,days){');
const b = src.indexOf('\n}\n', a) + 3;
assert(a > 0 && b > a, 'fsGenData tidak ditemukan');
const day = (n) => new Date(Date.UTC(2026, 8, n)).toISOString().slice(0, 10);
const mkRows = (n, lastDate) => Array.from({ length: n }, (_, i) => ({ date: i === n - 1 ? lastDate : day(1 + i), open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 5_000_000 + i }));
const run = (rows, livePx) => {
  const sb = { rdGetAny: () => rows, getGlobalMarketPrice: () => livePx, Date, Math, Number, isValidStockTicker: () => true, FS_LAST_SIMULATED: {}, console };
  vm.createContext(sb);
  vm.runInContext(src.slice(a, b) + '\nthis.out = fsGenData("BBCA", 60);', sb);
  return sb.out;
};
let n = 0, total = 0;
const t = (name, fn) => { total++; try { fn(); console.log('  ✅ [PASS] ' + name); n++; } catch (e) { console.error('  ❌ [FAIL] ' + name + ': ' + e.message); process.exitCode = 1; } };
t('bar terakhir BUKAN hari ini: tidak ada bar sintetis ditambahkan, cache tidak dimutasi', () => {
  const rows = mkRows(30, '2020-01-01'); // jelas bukan hari ini
  const before = rows.length;
  const out = run(rows, 140);
  assert.strictEqual(rows.length, before, 'cache RD_STORE bersama tidak boleh ditambah bar');
  assert.strictEqual(out.length, 30);
  assert(out.every((r) => r.v !== 1000000), 'tidak boleh ada volume rekaan 1.000.000');
  assert.strictEqual(out[out.length - 1].c, 101 + 29, 'close bar nyata terakhir tidak diubah oleh harga live');
  assert.strictEqual(out.simulated, false);
});
t('bar terakhir ADALAH hari ini: close disinkronkan dengan harga live', () => {
  const d0 = new Date(); const today = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
  const out = run(mkRows(30, today), 150);
  assert.strictEqual(out[out.length - 1].c, 150);
});
console.log(n === total ? `🎉 ALL ${n}/${total} FLOWSCAN REAL BARS TESTS PASSED` : `⚠️ ${n}/${total}`);
