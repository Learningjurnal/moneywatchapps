/**
 * test_yahoo_daily_change.js — regresi 2026-10-04: perubahan harian IHSG di
 * GET /api/idx/summary salah (-1,81% padahal riil +0,46%) karena memakai
 * meta.chartPreviousClose, yang untuk range=5d adalah penutupan SEBELUM bar
 * pertama (4 hari bursa lalu), bukan penutupan kemarin.
 *
 * Fixture = respons Yahoo ^JKSE range=5d yang ditangkap nyata pada 2026-10-03
 * (harga, close harian, dan chartPreviousClose adalah nilai asli).
 */

import assert from 'assert';
import { computeYahooDailyChange } from './lib/providers/yahoo-daily-change.js';

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try { fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}

const day = (iso) => Math.floor(Date.parse(iso) / 1000);

// ^JKSE 2026-09-28 .. 2026-10-02 (bar harian pukul 09:00 WIB = 02:00 UTC), WIB = UTC+7.
const JKSE_REAL = {
  meta: { regularMarketPrice: 6036.888, chartPreviousClose: 6147.859, gmtoffset: 25200, regularMarketTime: day('2026-10-02T08:49:00Z') },
  timestamp: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map(d => day(d + 'T02:00:00Z')),
  indicators: { quote: [{ close: [6147.859, 6121.70, 6071.14, 6009.501953125, 6036.888] }] }
};

console.log('🧪 YAHOO DAILY CHANGE (summary IHSG/USDIDR)');

test('IHSG nyata 2026-10-02: +27,39 (+0,46%) vs penutupan 2026-10-01, BUKAN -1,81% vs chartPreviousClose', () => {
  const r = computeYahooDailyChange(JKSE_REAL);
  assert.strictEqual(r.previous, 6009.501953125);
  assert.strictEqual(r.change, 27.39);
  assert.strictEqual(r.changePercent, 0.46);
  const wrong = Math.round(((6036.888 - 6147.859) / 6147.859) * 10000) / 100;
  assert.strictEqual(wrong, -1.81, 'sanity: ini angka salah yang dulu terlapor');
  assert.notStrictEqual(r.changePercent, wrong);
});

test('sesi berjalan: bar terakhir = hari ini (partial) => pembanding adalah penutupan bar sebelumnya', () => {
  const r = computeYahooDailyChange({
    meta: { regularMarketPrice: 6050, gmtoffset: 25200, regularMarketTime: day('2026-10-02T05:00:00Z') },
    timestamp: [day('2026-10-01T02:00:00Z'), day('2026-10-02T02:00:00Z')],
    indicators: { quote: [{ close: [6009.5, 6048.2] }] } // bar hari ini belum final
  });
  assert.strictEqual(r.previous, 6009.5);
  assert.strictEqual(r.change, 40.5);
});

test('akhir pekan: harga terakhir Jumat, bar terakhir Jumat => dibandingkan Kamis', () => {
  const r = computeYahooDailyChange({
    meta: { regularMarketPrice: 6036.888, gmtoffset: 25200, regularMarketTime: day('2026-10-02T08:49:00Z') },
    timestamp: [day('2026-10-01T02:00:00Z'), day('2026-10-02T02:00:00Z')],
    indicators: { quote: [{ close: [6009.5, 6036.888] }] }
  });
  assert.strictEqual(r.previous, 6009.5);
});

test('bar terakhir lebih tua dari waktu harga => bar itu sendiri adalah penutupan terakhir', () => {
  const r = computeYahooDailyChange({
    meta: { regularMarketPrice: 6040, gmtoffset: 25200, regularMarketTime: day('2026-10-05T03:00:00Z') },
    timestamp: [day('2026-10-01T02:00:00Z'), day('2026-10-02T02:00:00Z')],
    indicators: { quote: [{ close: [6009.5, 6036.888] }] }
  });
  assert.strictEqual(r.previous, 6036.888);
});

test('close null (bar belum terbentuk) dilewati, bukan dianggap 0', () => {
  const r = computeYahooDailyChange({
    meta: { regularMarketPrice: 6050, gmtoffset: 25200, regularMarketTime: day('2026-10-02T05:00:00Z') },
    timestamp: [day('2026-10-01T02:00:00Z'), day('2026-10-02T02:00:00Z')],
    indicators: { quote: [{ close: [6009.5, null] }] }
  });
  assert.strictEqual(r.previous, 6009.5, 'bar hari ini tanpa close => bar kemarin sebagai pembanding');
});

test('data tidak cukup => null (pemanggil menandai tidak tersedia), tidak ada angka pengganti', () => {
  assert.strictEqual(computeYahooDailyChange(null), null);
  assert.strictEqual(computeYahooDailyChange({ meta: {} }), null);
  assert.strictEqual(computeYahooDailyChange({ meta: { regularMarketPrice: 100 }, timestamp: [], indicators: { quote: [{ close: [] }] } }), null);
  // hanya 1 bar milik hari ini => tidak ada pembanding
  assert.strictEqual(computeYahooDailyChange({
    meta: { regularMarketPrice: 100, gmtoffset: 0, regularMarketTime: day('2026-10-02T05:00:00Z') },
    timestamp: [day('2026-10-02T02:00:00Z')], indicators: { quote: [{ close: [99] }] }
  }), null);
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} YAHOO DAILY CHANGE TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
