/**
 * test_strategy_cron_date.js — regresi 2026-10-04: widget "Rekomendasi Harian"
 * TIDAK PERNAH menampilkan hasil ("Belum ada saham STRONG/QUALIFIED").
 *
 * Bukti produksi: SETIAP emiten yang dipindai cron berstatus DATA_INSUFFICIENT.
 * Akar masalah: tanggal data cron = tanggal kalender UTC saat run; GitHub
 * Actions molor ~2,8 jam sehingga tanggalnya jatuh ke Sabtu/pagi pra-buka;
 * Invezgo menjawab HTTP 422 untuk tanggal tanpa data. Juga: throughput hanya
 * ~5-10 emiten per run (berurutan), dan run gagal-ambil-data tetap memajukan
 * kursor + mencemari statistik. Jaringan di-mock; Invezgo hanya memberi data
 * untuk tanggal EOD bursa terakhir (meniru perilaku 422 yang terbukti di produksi).
 */

import assert from 'assert';

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}

const originalFetch = global.fetch;
const originalKey = process.env.INVEZGO_API_KEY;
process.env.INVEZGO_API_KEY = 'mock_test_key';

const { getLatestEodTradingDate, storeSetEx } = await import('./lib/invezgo-client.js');
const engine = await import('./lib/engine/strategy/StrategyEngine.js');
const { STRATEGY_RESULT_STATUS, DATA_STATUS } = await import('./lib/engine/types.js');
const EOD = getLatestEodTradingDate();

// Mock Invezgo: notasi kosong (semua emiten CLEAR); order-book/intraday hanya
// punya data untuk tanggal EOD (selain itu 422, persis perilaku produksi).
function installFetchMock({ dataDate = EOD, delayMs = 20, firstCallDelayMs = null } = {}) {
  const log = { dates: [], inFlight: new Set(), maxDistinctInFlight: 0, active: {}, calls: 0 };
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('idx.co.id')) return { ok: false, status: 500, headers: { getSetCookie: () => [] }, json: async () => ({}) };
    if (u.includes('/analysis/notation')) return { ok: true, status: 200, json: async () => [] };
    const m = u.match(/\/analysis\/(order-book|intraday-data)\/([^?]+)\?(.*)$/);
    if (!m) return { ok: false, status: 500, json: async () => ({}) };
    const code = decodeURIComponent(m[2]);
    const date = new URLSearchParams(m[3]).get('date');
    log.dates.push(m[1] + ':' + (date || ''));
    log.active[code] = (log.active[code] || 0) + 1;
    log.maxDistinctInFlight = Math.max(log.maxDistinctInFlight, Object.keys(log.active).filter(k => log.active[k] > 0).length);
    log.calls++;
    const wait = (firstCallDelayMs != null && log.calls <= 2) ? firstCallDelayMs : delayMs; // 2 panggilan pertama = 1 emiten lambat
    await new Promise(r => setTimeout(r, wait));
    log.active[code]--;
    if (m[1] === 'order-book' && date) return { ok: false, status: 422, json: async () => ({ message: 'no historical order book' }) };
    if (m[1] === 'intraday-data' && date !== dataDate) return { ok: false, status: 422, json: async () => ({ message: 'no data' }) };
    if (m[1] === 'order-book') return { ok: true, status: 200, json: async () => ({ code, bid: [{ bid1price: 100, bid1lot: 5000, bid1freq: 3 }], offer: [{ offer1price: 101, offer1lot: 500, offer1freq: 2 }] }) };
    return { ok: true, status: 200, json: async () => ({ open: 95, high: 105, low: 90, close: 104, avg: 98, volume: 3_000_000, freq: 1500, value: 3_000_000_000, prev: 96 }) };
  };
  return log;
}

// invezgo-client men-cache data per emiten+tanggal dan semua strategi mulai dari kursor 0 (emiten yang
// sama), jadi tiap tes diberi rentang emiten sendiri lewat kursor agar tidak saling memakai cache.
const setCursor = (strategyId, position) => storeSetEx('strategy_engine:warm:cursor:' + strategyId, position, 0);

console.log('🧪 STRATEGY ENGINE CRON — TANGGAL EOD, KONKURENSI, GUARD DATA');

// Urutan penting: tes ini harus jalan sebelum cron apa pun menulis sinyal.
await test('widget kosong: tanggal = EOD bursa terakhir (bukan tanggal kalender), catatan menyebut cakupan nyata', async () => {
  installFetchMock();
  const picks = await engine.getDailyTopPicks(5, true);
  assert.strictEqual(picks.date, EOD, `date=${picks.date}, seharusnya EOD ${EOD}`);
  assert(picks.note && picks.note.includes('Belum ada emiten yang berhasil dipindai'), 'catatan harus menyebut belum ada emiten terpindai: ' + picks.note);
  assert.strictEqual(picks.scanCoverage.scannedPerStrategyMax, 0);
});

// Harus jalan SEBELUM tes yang memindai emiten: invezgo-client men-cache data per emiten+tanggal,
// jadi emiten yang sudah pernah dipindai akan lolos dari mock 422.
await test('run yang SELURUH hasilnya tanpa intraday-data tanggal itu (mis. hari libur bursa): kursor tidak maju dan statistik tidak tercemar', async () => {
  installFetchMock({ dataDate: '1999-01-01' }); // intraday tidak ada untuk tanggal yang diminta (422); order-book terkini tetap ada
  const before = await engine.getStrategyEngineDailyStats('hidden-accumulation', 5);
  const processedBefore = before.days.find(d => d.date === EOD).processed;
  const r = await engine.warmStrategyEngineRotating(800, 'hidden-accumulation', 3);
  assert.strictEqual(r.skipped, 'NO_MARKET_DATA');
  assert.strictEqual(r.processed, 0);
  assert.strictEqual(r.cursorAfter, r.cursorBefore, 'kursor harus tetap agar emiten yang sama dicoba lagi');
  const after = await engine.getStrategyEngineDailyStats('hidden-accumulation', 5);
  assert.strictEqual(after.days.find(d => d.date === EOD).processed, processedBefore, 'statistik harian tidak boleh bertambah');
});


await test('isMarketDataUnavailable: hanya untuk gagal-ambil-data total (bukan vonis, bukan pengecualian regulasi)', () => {
  const U = DATA_STATUS.UNAVAILABLE, V = DATA_STATUS.VALID, DI = STRATEGY_RESULT_STATUS.DATA_INSUFFICIENT;
  const f = engine.isMarketDataUnavailable;
  assert.strictEqual(f({ status: DI, thrown: true, indicators: [] }), true, 'pengecualian saat mengambil data');
  assert.strictEqual(f({ status: DI, indicators: [{ status: U }, { status: U }], marketDataErrors: [{ reason: 'HTTP_422' }] }), true, '0 indikator valid + galat provider');
  assert.strictEqual(f({ status: DI, indicators: [], marketDataErrors: [] }), false, 'pengecualian regulasi (tanpa indikator/galat) bukan gagal data');
  assert.strictEqual(f({ status: STRATEGY_RESULT_STATUS.REJECT, indicators: [{ status: V }], marketDataErrors: [{ field: 'intradayRG', reason: 'HTTP_422' }] }), true, 'intraday-data tanggal itu gagal => bukan vonis yang bisa dipercaya');
  assert.strictEqual(f({ status: STRATEGY_RESULT_STATUS.REJECT, indicators: [{ status: V }], marketDataErrors: [{ field: 'orderBook', reason: 'HTTP_422' }] }), false, 'hanya order-book gagal: intraday ada, tetap vonis sah');
  assert.strictEqual(f({ status: DI, indicators: [{ status: V }, { status: U }], marketDataErrors: [{ reason: 'HTTP_422' }] }), false, 'masih ada indikator valid');
  assert.strictEqual(f({ status: STRATEGY_RESULT_STATUS.REJECT, indicators: [{ status: U }], marketDataErrors: [{ reason: 'x' }] }), false, 'vonis REJECT bukan gagal data');
  assert.strictEqual(f(null), false);
});

await test('cron memindai tanggal EOD bursa terakhir, BUKAN tanggal kalender UTC (akar masalah)', async () => {
  const log = installFetchMock();
  await setCursor('swing-flow', 600);
  const r = await engine.warmStrategyEngineRotating(1500, 'swing-flow', 2);
  assert.strictEqual(r.dataDate, EOD);
  assert(log.dates.length > 0, 'harus ada panggilan order-book/intraday');
  const intraday = log.dates.filter(d => d.startsWith('intraday-data:'));
  const orderBook = log.dates.filter(d => d.startsWith('order-book:'));
  assert(intraday.length > 0 && intraday.every(d => d === 'intraday-data:' + EOD), `intraday-data harus date=${EOD}, ditemukan: ${[...new Set(intraday)].join(',')}`);
  assert(orderBook.length > 0 && orderBook.every(d => d === 'order-book:'), `order-book harus tanpa date (snapshot terkini; date eksplisit => 422), ditemukan: ${[...new Set(orderBook)].join(',')}`);
  assert(r.processed > 0 && !r.skipped, 'dengan data tersedia, run harus memproses emiten');
});

await test('tanggal non-bursa (meniru jadwal molor ke Sabtu/Minggu) tidak lagi dipakai: simulasi data hanya ada di EOD', async () => {
  const sat = getLatestEodTradingDate(new Date('2026-10-03T01:21:00Z')); // jadwal Jumat yang molor ke Sabtu 08:21 WIB
  const sun = getLatestEodTradingDate(new Date('2026-10-04T02:12:00Z'));
  const tueMorning = getLatestEodTradingDate(new Date('2026-10-06T01:30:00Z')); // Selasa 08:30 WIB, pra-buka
  assert.strictEqual(sat, '2026-10-02', 'Sabtu -> Jumat');
  assert.strictEqual(sun, '2026-10-02', 'Minggu -> Jumat');
  assert.strictEqual(tueMorning, '2026-10-05', 'Selasa pra-buka -> Senin');
});

await test('konkurensi: batch paralel terbatas memproses beberapa emiten sekaligus (throughput), batchSize=1 tetap berurutan', async () => {
  const seq = installFetchMock();
  await setCursor('day-trading', 200);
  await engine.warmStrategyEngineRotating(250, 'day-trading', 1);
  const par = installFetchMock();
  await setCursor('momentum-candidate', 400);
  await engine.warmStrategyEngineRotating(250, 'momentum-candidate', 4);
  assert.strictEqual(seq.maxDistinctInFlight, 1, `batchSize=1 harus berurutan, maks emiten bersamaan = ${seq.maxDistinctInFlight}`);
  assert(par.maxDistinctInFlight >= 3, `batchSize=4 harus memproses >=3 emiten bersamaan, maks = ${par.maxDistinctInFlight}`);
});
await test('worker pool: satu emiten lambat tidak menahan emiten lain (tanpa penghalang batch)', async () => {
  installFetchMock({ firstCallDelayMs: 700, delayMs: 15 });
  await setCursor('swing-flow', 800);
  const r = await engine.warmStrategyEngineRotating(300, 'swing-flow', 3);
  // Dengan penghalang batch: batch pertama menunggu emiten lambat (700 ms) lalu anggaran 300 ms habis => 3 emiten.
  // Dengan worker pool: 2 pekerja lain terus maju selama emiten lambat berjalan.
  assert(r.processed >= 8, `worker pool harus memproses >=8 emiten saat 1 emiten lambat, hanya ${r.processed}`);
});

await test('batas emiten per run (proteksi kuota Invezgo): tidak melebihi STRATEGY_ENGINE_CRON_MAX_TICKERS meski anggaran waktu longgar', async () => {
  const before = process.env.STRATEGY_ENGINE_CRON_MAX_TICKERS;
  process.env.STRATEGY_ENGINE_CRON_MAX_TICKERS = '6';
  try {
    installFetchMock({ delayMs: 1 });
    await setCursor('hidden-accumulation', 900);
    const r = await engine.warmStrategyEngineRotating(5000, 'hidden-accumulation', 3);
    assert(r.processed + (r.attempted || 0) <= 6, `diproses ${r.processed}, batas 6`);
    assert(r.processed >= 1 || r.skipped, 'harus memproses atau melapor skip');
  } finally {
    if (before === undefined) delete process.env.STRATEGY_ENGINE_CRON_MAX_TICKERS; else process.env.STRATEGY_ENGINE_CRON_MAX_TICKERS = before;
  }
});

global.fetch = originalFetch;
if (originalKey === undefined) delete process.env.INVEZGO_API_KEY; else process.env.INVEZGO_API_KEY = originalKey;

console.log(passed === total ? `🎉 ALL ${passed}/${total} STRATEGY CRON TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
