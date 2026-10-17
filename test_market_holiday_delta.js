/**
 * test_market_holiday_delta.js
 * 
 * Verifikasi penanganan portofolio saat pasar libur / tutup:
 * 1. Kalender libur bursa (tanggal merah & hari libur BEI).
 * 2. Deteksi hari perdagangan (isIdxTradingDay & isIdxMarketOpen).
 * 3. Pencegahan pembacaan 2x harga sebelumnya pada akhir pekan/libur di calcPortfolioDayGain.
 * 4. Pencegahan pencatatan ulang snapshot ekuitas (equitySnapshotToday) pada hari libur bursa.
 */
import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import { isIdxMarketOpen, isIdxTradingDay, isIdxHoliday, getIdxHolidayName, IDX_HOLIDAYS } from './lib/engine/autonomous-runner.js';

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: MARKET SCHEDULE, HOLIDAYS & PORTFOLIO DELTA');
console.log('═══════════════════════════════════════════════════════');

// ── 1. KALENDER LIBUR BURSA & TANGGAL MERAH (lib/engine & public/js) ──
test('isIdxHoliday: mendeteksi hari libur nasional & cuti bersama BEI', () => {
  // Libur tahunan tetap
  assert.strictEqual(isIdxHoliday('2026-01-01'), true); // Tahun Baru
  assert.strictEqual(isIdxHoliday('2026-05-01'), true); // Hari Buruh
  assert.strictEqual(isIdxHoliday('2026-06-01'), true); // Hari Lahir Pancasila
  assert.strictEqual(isIdxHoliday('2026-08-17'), true); // HUT RI
  assert.strictEqual(isIdxHoliday('2026-12-25'), true); // Natal
  assert.strictEqual(isIdxHoliday('2026-12-31'), true); // Libur Akhir Tahun Bursa

  // Libur kalender bergerak
  assert.strictEqual(isIdxHoliday('2026-04-03'), true); // Wafat Yesus Kristus
  assert.strictEqual(isIdxHoliday('2026-03-20'), true); // Idul Fitri / Nyepi

  // Hari bursa normal (Senin)
  assert.strictEqual(isIdxHoliday('2026-10-12'), false);
  assert.strictEqual(isIdxHoliday('2026-10-16'), false);
});

test('isIdxTradingDay: membedakan hari perdagangan aktif vs akhir pekan & libur', () => {
  // Sabtu & Minggu
  const sabtu = new Date('2026-10-17T10:00:00+07:00');
  const minggu = new Date('2026-10-18T10:00:00+07:00');
  assert.strictEqual(isIdxTradingDay(sabtu), false, 'Sabtu bukan hari bursa');
  assert.strictEqual(isIdxTradingDay(minggu), false, 'Minggu bukan hari bursa');

  // Tanggal merah di hari kerja (Senin, 17 Agustus 2026)
  const hutRi = new Date('2026-08-17T10:00:00+07:00');
  assert.strictEqual(isIdxTradingDay(hutRi), false, 'HUT RI di hari Senin adalah libur bursa');

  // Hari kerja bursa biasa (Jumat 16 Okt 2026)
  const jumat = new Date('2026-10-16T10:00:00+07:00');
  assert.strictEqual(isIdxTradingDay(jumat), true, 'Jumat biasa adalah hari bursa aktif');
});

test('isIdxMarketOpen: mendeteksi alasan penutupan saat libur bursa / tanggal merah', () => {
  const hutRi = new Date('2026-08-17T10:30:00+07:00');
  const resHut = isIdxMarketOpen(hutRi);
  assert.strictEqual(resHut.isOpen, false);
  assert.strictEqual(resHut.isTradingDay, false);
  assert.strictEqual(resHut.session, 'CLOSED');
  assert.strictEqual(resHut.holidayName, 'Hari Kemerdekaan RI');
  assert.ok(resHut.reason.includes('Hari Libur Bursa'));

  const sabtu = new Date('2026-10-17T11:00:00+07:00');
  const resSabtu = isIdxMarketOpen(sabtu);
  assert.strictEqual(resSabtu.isOpen, false);
  assert.strictEqual(resSabtu.isTradingDay, false);
  assert.ok(resSabtu.reason.includes('Akhir Pekan'));
});

// ── 2. SINGLE CANONICAL ENGINE: calcPortfolioDayGain (03-engine.js) ──
test('calcPortfolioDayGain: menghasilkan dayGain = 0 saat bursa libur/akhir pekan, menyimpan lastTradingDayGain', () => {
  const priceIndexSrc = fs.readFileSync(new URL('./public/js/02b-price-index.js', import.meta.url), 'utf8');
  const engineSrc = fs.readFileSync(new URL('./public/js/03-engine.js', import.meta.url), 'utf8');

  // Ambil potongan fungsi calcPortfolioDayGain dari 03-engine.js
  const fnMatch = engineSrc.match(/function calcPortfolioDayGain\(\)\{[\s\S]*?\n\}/);
  assert(fnMatch, 'calcPortfolioDayGain tidak ditemukan di 03-engine.js');

  const sandbox = {
    prices: { 'BBRI': 3000, 'TLKM': 2800 },
    prevCloses: { 'BBRI': 3200, 'TLKM': 3000 }, // Penurunan sesi sebelumnya: BBRI -200, TLKM -200
    changes: { 'BBRI': -6.25, 'TLKM': -6.67 },
    getPortfolio: () => [
      { ticker: 'BBRI', shares: 10000, lot: 100, mp: 3000, mv: 30000000 },
      { ticker: 'TLKM', shares: 10000, lot: 100, mp: 2800, mv: 28000000 }
    ],
    Math,
    Number
  };

  // Muat modul price index (kalender & isIdxMarketOpen) ke sandbox
  vm.createContext(sandbox);
  vm.runInContext(priceIndexSrc, sandbox);
  vm.runInContext(fnMatch[0], sandbox);

  // Skenario A: Akhir Pekan (Sabtu, 17 Oktober 2026)
  // Simulasi Date di dalam sandbox mengarah ke Sabtu
  sandbox.isIdxTradingDay = () => false;
  sandbox.isIdxMarketOpen = () => ({
    isOpen: false,
    isTradingDay: false,
    session: 'CLOSED',
    reason: 'Akhir Pekan (Sabtu) — Bursa Efek Indonesia Tutup'
  });

  const resSabtu = vm.runInContext('calcPortfolioDayGain()', sandbox);
  // Total penurunan sesi sebelumnya adalah: (-200 * 10000) + (-200 * 10000) = -4,000,000 (-6.45%)
  assert.strictEqual(resSabtu.dayGain, 0, 'Pada hari libur/Sabtu, dayGain hari ini HARUS 0 agar tidak terbaca 2x');
  assert.strictEqual(resSabtu.dayPct, 0, 'Pada hari libur/Sabtu, dayPct hari ini HARUS 0%');
  assert.strictEqual(resSabtu.isTradingDay, false);
  assert.strictEqual(resSabtu.isMarketOpen, false);
  assert.strictEqual(resSabtu.lastTradingDayGain, -4000000, 'Perubahan sesi bursa terakhir tetap tersimpan untuk konteks');
  assert(resSabtu.lastTradingDayPct < 0, 'Persentase sesi terakhir tetap akurat');

  // Skenario B: Hari Kerja Aktif Saat Jam Bursa (Senin 10:30 WIB)
  sandbox.isIdxTradingDay = () => true;
  sandbox.isIdxMarketOpen = () => ({
    isOpen: true,
    isTradingDay: true,
    session: 'SESI_1',
    reason: 'Sesi 1 Perdagangan Berlangsung'
  });

  const resSenin = vm.runInContext('calcPortfolioDayGain()', sandbox);
  assert.strictEqual(resSenin.dayGain, -4000000, 'Saat jam bursa aktif, dayGain mencerminkan pergerakan hari ini');
  assert.strictEqual(resSenin.isTradingDay, true);
  assert.strictEqual(resSenin.isMarketOpen, true);
});

// ── 3. PENCEGAHAN PENCATATAN ULANG SNAPSHOT PADA HARI LIBUR ──
test('equitySnapshotToday: tidak mencatat snapshot baru pada hari libur bursa jika tanpa transaksi baru', () => {
  const engineSrc = fs.readFileSync(new URL('./public/js/03-engine.js', import.meta.url), 'utf8');
  const snapMatch = engineSrc.match(/function equitySnapshotToday\(\)\{[\s\S]*?\n\}/);
  assert(snapMatch, 'equitySnapshotToday tidak ditemukan di 03-engine.js');

  let savedHistory = null;
  const existingFridayHistory = [
    { date: '2026-10-15', equity: 105000000 },
    { date: '2026-10-16', equity: 100000000 } // Jumat penutupan
  ];

  const sandbox = {
    isPortfolioDataReady: () => true,
    transactions: [{ id: 1, date: '2026-10-16', ticker: 'BBRI', type: 'BUY', lot: 10, price: 3000 }],
    rdnMutations: [],
    cryptoTx: [],
    computeCurrentAUM: () => 100000000,
    equityHistoryLoad: () => existingFridayHistory.slice(),
    equityHistorySave: (arr) => { savedHistory = arr; },
    isIdxTradingDay: () => false, // Sabtu / Hari Libur
    Date: class MockDate extends Date {
      toISOString() { return '2026-10-17T10:00:00.000Z'; } // Sabtu
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(snapMatch[0], sandbox);

  const res = vm.runInContext('equitySnapshotToday()', sandbox);
  // Riwayat snapshot TIDAK boleh ketambahan tanggal 2026-10-17
  assert.strictEqual(res.length, 2, 'Snapshot tidak boleh bertambah pada hari libur tanpa transaksi');
  assert.strictEqual(res[res.length - 1].date, '2026-10-16', 'Snapshot terakhir harus tetap tanggal sesi bursa aktif (Jumat)');
});

test('equitySnapshotToday: membersihkan snapshot hari libur tanpa transaksi jika sempat tersimpan sebelumnya', () => {
  const engineSrc = fs.readFileSync(new URL('./public/js/03-engine.js', import.meta.url), 'utf8');
  const snapMatch = engineSrc.match(/function equitySnapshotToday\(\)\{[\s\S]*?\n\}/);
  assert(snapMatch, 'equitySnapshotToday tidak ditemukan di 03-engine.js');

  let savedHistory = null;
  // History yang sempat tercemar snapshot Sabtu (2026-10-17) tanpa transaksi
  const pollutedHistory = [
    { date: '2026-10-16', equity: 100000000 },
    { date: '2026-10-17', equity: 100000000 }
  ];

  const sandbox = {
    isPortfolioDataReady: () => true,
    transactions: [{ id: 1, date: '2026-10-16', ticker: 'BBRI', type: 'BUY', lot: 10, price: 3000 }],
    rdnMutations: [],
    cryptoTx: [],
    computeCurrentAUM: () => 100000000,
    equityHistoryLoad: () => pollutedHistory.slice(),
    equityHistorySave: (arr) => { savedHistory = arr; },
    isIdxTradingDay: () => false, // Sabtu
    Date: class MockDate extends Date {
      toISOString() { return '2026-10-17T10:00:00.000Z'; }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(snapMatch[0], sandbox);

  const res = vm.runInContext('equitySnapshotToday()', sandbox);
  assert.strictEqual(res.length, 1, 'Snapshot redundan di tanggal hari libur harus dipangkas');
  assert.strictEqual(res[0].date, '2026-10-16');
  assert.strictEqual(savedHistory.length, 1);
});

// ── 4. SINKRONISASI DI 28-DECISIONTOOLS.JS ──
test('28-decisiontools.js: menampilkan Rp 0 (0.00%) dan keterangan bursa libur saat market tutup', () => {
  const dtSrc = fs.readFileSync(new URL('./public/js/28-decisiontools.js', import.meta.url), 'utf8');
  assert(dtSrc.includes('dayGainObj = (typeof calcPortfolioDayGain === \'function\') ? calcPortfolioDayGain() : null'),
    '28-decisiontools.js harus memanggil fungsi tunggal kanonikal calcPortfolioDayGain()');
  assert(dtSrc.includes('dayGainObj.marketStatusText'),
    '28-decisiontools.js harus menampilkan status pasar/bursa libur saat market tidak aktif');
});

console.log('═══════════════════════════════════════════════════════');
if (passed === total) {
  console.log(`🎉 ALL ${passed}/${total} MARKET SCHEDULE & HOLIDAY DELTA TESTS PASSED`);
} else {
  console.log(`⚠️ ${passed}/${total} TESTS PASSED`);
}
console.log('═══════════════════════════════════════════════════════');
