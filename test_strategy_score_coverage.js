/**
 * test_strategy_score_coverage.js — regresi 2026-10-04: skor Strategy Engine
 * dinormalkan ke bobot yang tersedia TANPA batas minimum, sehingga satu
 * indikator valid (bobot 20%) yang lolos ambang menghasilkan "STRONG 100"
 * dan tampil sebagai rekomendasi #1 di produksi (ASDM, day-trading).
 *
 * Aturan baru (keputusan pengguna): STRONG/QUALIFIED mensyaratkan cakupan
 * bobot >= 50%; di bawah itu status dibatasi ke WATCH, skor mentah tetap
 * dilaporkan (rawStatus/evidenceCapped). Juga: teks alasan tidak lagi
 * menampilkan "FinalScore undefined".
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

const { scoreStrategy, MIN_WEIGHT_COVERAGE_FOR_SIGNAL } = await import('./lib/engine/scoring/ScoreEngine.js');
const { STRATEGY_RESULT_STATUS: S, DATA_STATUS } = await import('./lib/engine/types.js');
const { getStrategyById } = await import('./lib/engine/strategy/StrategyRegistry.js');
const engine = await import('./lib/engine/strategy/StrategyEngine.js');
const { getLatestEodTradingDate, storeSetEx } = await import('./lib/invezgo-client.js');

const valid = (name, score) => ({ name, status: DATA_STATUS.VALID, score, passed: true, value: 1, threshold: 1 });
const unavailable = (name) => ({ name, status: DATA_STATUS.UNAVAILABLE, reason: 'ROLLING_BASELINE_INSUFFICIENT (1 hari terekam)' });
const strategyDef = (weights) => ({ id: 't', version: '1', weights, mandatoryConditions: [], scoreBands: { strong: 80, qualified: 70, watch: 55 } });

console.log('🧪 STRATEGY ENGINE — CAKUPAN BOBOT MINIMUM 50%');

await test('ambang bawaan = 50%', () => {
  assert.strictEqual(MIN_WEIGHT_COVERAGE_FOR_SIGNAL, 0.5);
});

await test('1 indikator valid (bobot 20%) skor 100 => BUKAN STRONG: dibatasi WATCH, skor mentah tetap dilaporkan', () => {
  const r = scoreStrategy(strategyDef({ A: 0.2, B: 0.25, C: 0.25, D: 0.15, E: 0.15 }),
    [valid('A', 100), unavailable('B'), unavailable('C'), unavailable('D'), unavailable('E')]);
  assert.strictEqual(r.status, S.WATCH);
  assert.strictEqual(r.rawStatus, S.STRONG);
  assert.strictEqual(r.evidenceCapped, true);
  assert.strictEqual(r.finalScore, 100, 'skor mentah tidak disembunyikan');
  assert(r.reason.includes('20%') && r.reason.includes('Bukti kurang'), r.reason);
});

await test('batas inklusif: cakupan tepat 50% tetap STRONG; 49% dibatasi (termasuk bobot desimal)', () => {
  const at50 = scoreStrategy(strategyDef({ A: 0.25, B: 0.25, C: 0.5 }), [valid('A', 100), valid('B', 100), unavailable('C')]);
  assert.strictEqual(at50.status, S.STRONG, 'tepat 50% harus lolos');
  assert.strictEqual(at50.evidenceCapped, false);
  const at50dec = scoreStrategy(strategyDef({ A: 0.15, B: 0.35, C: 0.5 }), [valid('A', 100), valid('B', 100), unavailable('C')]);
  assert.strictEqual(at50dec.status, S.STRONG, 'jumlah desimal 0,15+0,35 harus dianggap 50%');
  const at49 = scoreStrategy(strategyDef({ A: 0.49, B: 0.51 }), [valid('A', 100), unavailable('B')]);
  assert.strictEqual(at49.status, S.WATCH);
  assert.strictEqual(at49.evidenceCapped, true);
});

await test('QUALIFIED dengan bukti tipis juga dibatasi; cakupan penuh tidak berubah', () => {
  const thinQ = scoreStrategy(strategyDef({ A: 0.3, B: 0.7 }), [valid('A', 75), unavailable('B')]);
  assert.strictEqual(thinQ.rawStatus, S.QUALIFIED);
  assert.strictEqual(thinQ.status, S.WATCH);
  const full = scoreStrategy(strategyDef({ A: 0.5, B: 0.5 }), [valid('A', 90), valid('B', 90)]);
  assert.strictEqual(full.status, S.STRONG);
  assert.strictEqual(full.evidenceCapped, false);
  assert.strictEqual(full.reason, null);
});

await test('bukti tipis dengan skor rendah tidak dianggap "dibatasi" (WATCH/REJECT apa adanya)', () => {
  const w = scoreStrategy(strategyDef({ A: 0.2, B: 0.8 }), [valid('A', 60), unavailable('B')]);
  assert.strictEqual(w.status, S.WATCH);
  assert.strictEqual(w.evidenceCapped, false);
  const rj = scoreStrategy(strategyDef({ A: 0.2, B: 0.8 }), [valid('A', 10), unavailable('B')]);
  assert.strictEqual(rj.status, S.REJECT);
  assert.strictEqual(rj.evidenceCapped, false);
});

await test('skenario ASDM (day-trading nyata): hanya HIGH_BID_OFFER valid => WATCH, bukan STRONG', () => {
  const def = getStrategyById('day-trading');
  const r = scoreStrategy(def, [valid('HIGH_BID_OFFER', 100), unavailable('VOLUME'), unavailable('FREQUENCY'), unavailable('HIGH_ATS'), unavailable('CLOSE_HIGH')]);
  assert.strictEqual(r.status, S.WATCH);
  assert.strictEqual(r.rawStatus, S.STRONG);
  assert.strictEqual(Math.round(r.weightCoverage * 100), 20);
});

// Mock Invezgo: order-book ada, intraday 422 (baseline & intraday tidak tersedia) => 1 indikator valid.
function installThinMock(delayMs = 0) {
  global.fetch = async (url) => {
    const u = String(url);
    if (delayMs && (u.includes('/analysis/order-book/') || u.includes('/analysis/intraday-data/'))) await new Promise(r => setTimeout(r, delayMs));
    if (u.includes('idx.co.id')) return { ok: false, status: 500, headers: { getSetCookie: () => [] }, json: async () => ({}) };
    if (u.includes('/analysis/notation')) return { ok: true, status: 200, json: async () => [] };
    if (u.includes('/analysis/order-book/')) return { ok: true, status: 200, json: async () => ({ code: 'TSTA', bid: [{ bid1price: 100, bid1lot: 5000, bid1freq: 3 }], offer: [{ offer1price: 101, offer1lot: 500, offer1freq: 2 }] }) };
    return { ok: false, status: 422, json: async () => ({}) };
  };
}

await test('hasil lengkap: finalScore/weightCoverage/evidenceCapped ada dan teks alasan tidak memuat "undefined"', async () => {
  installThinMock();
  const r = await engine.runStrategyForTicker('TSTA', 'day-trading', { date: getLatestEodTradingDate(), regulatoryEligible: true });
  assert.strictEqual(r.status, S.WATCH, 'bukti tipis => WATCH');
  assert.strictEqual(r.evidenceCapped, true);
  assert.strictEqual(r.rawStatus, S.STRONG);
  assert.strictEqual(typeof r.finalScore, 'number');
  assert(r.weightCoverage > 0 && r.weightCoverage < 0.5);
  assert(!r.explanations.join(' ').includes('undefined'), 'teks mengandung "undefined": ' + r.explanations[0]);
});

await test('pick tersimpan dari aturan lama (STRONG bukti tipis) divalidasi ulang dan tidak lagi tampil sebagai rekomendasi', async () => {
  installThinMock();
  const eod = getLatestEodTradingDate();
  await storeSetEx('strategy_engine:signal_log:day-trading:' + eod, [{ ticker: 'TSTA', status: 'STRONG', score: 100 }], 3600);
  const picks = await engine.getDailyTopPicks(5, true);
  assert.strictEqual(picks.date, eod);
  assert(!picks.picks.some(p => p.ticker === 'TSTA'), 'sinyal bukti tipis tidak boleh jadi rekomendasi');
  assert.strictEqual(picks.count, 0);
});

await test('validasi ulang pick berjalan paralel: banyak kandidat + emiten lambat tetap selesai jauh di bawah batas fungsi 30 dtk', async () => {
  installThinMock(400); // tiap panggilan 400 ms; berurutan 14 kandidat ~5,6 dtk, paralel (4) ~1,6 dtk
  const eod = getLatestEodTradingDate();
  const candidates = Array.from({ length: 14 }, (_, i) => ({ ticker: 'TS' + String(i + 10), status: 'STRONG', score: 99 - i }));
  await storeSetEx('strategy_engine:signal_log:momentum-candidate:' + eod, candidates, 3600);
  const t0 = Date.now();
  const picks = await engine.getDailyTopPicks(10, true);
  const elapsed = Date.now() - t0;
  assert(elapsed < 3500, `validasi ulang terlalu lambat (${elapsed} ms) — kemungkinan masih berurutan`);
  assert(Array.isArray(picks.picks));
});

// ── Pemanasan cache daily-picks (2026-10-04) ──────────────────────────────
await test('TTL cache bertingkat: lama hanya untuk hasil sehat (ada pick & tak ada yang gagal diverifikasi)', () => {
  const ttl = engine.pickDailyPicksCacheTtl;
  assert.strictEqual(ttl({ count: 10, unverified: 0 }), 48 * 3600, 'sehat => 48 jam');
  assert.strictEqual(ttl({ count: 10, unverified: 1 }), 120, 'ada yang tak terverifikasi => singkat, jangan tahan hasil cacat');
  assert.strictEqual(ttl({ count: 0, unverified: 0 }), 600, 'kosong => 10 menit (cron berikutnya menambah sinyal)');
  assert.strictEqual(ttl({ count: 0, unverified: 3 }), 120);
});

await test('hasil dengan validasi ulang tak terverifikasi (data pasar gagal) di-cache singkat, dan cache dipakai tanpa force', async () => {
  installThinMock(); // intraday 422 => validasi ulang tanpa data tanggal itu => tak terverifikasi
  const eod = getLatestEodTradingDate();
  await storeSetEx('strategy_engine:signal_log:day-trading:' + eod, [{ ticker: 'TSTA', status: 'STRONG', score: 100 }], 3600);
  const first = await engine.getDailyTopPicks(10, true);
  assert(first.revalidationUnverified >= 1, 'harus tercatat tak terverifikasi: ' + first.revalidationUnverified);
  assert(first.cacheTtlSec <= 300, 'TTL harus singkat, bukan ' + first.cacheTtlSec);
  const second = await engine.getDailyTopPicks(10, false);
  assert.strictEqual(second.generatedAt, first.generatedAt, 'tanpa force harus membaca cache, bukan menghitung ulang');
});

await test('route cron pemanas ada, dijaga CRON_SECRET, dan memaksa hitung ulang limit=10 (sama dengan widget)', async () => {
  const fsMod = await import('fs');
  const src = fsMod.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
  const route = src.match(/app\.get\('\/api\/cron\/warm-daily-picks'[\s\S]*?\n\}\);/);
  assert(route, 'route /api/cron/warm-daily-picks tidak ditemukan');
  assert(/Bearer \$\{secret\}/.test(route[0]) && /403/.test(route[0]), 'route harus dijaga CRON_SECRET (403)');
  assert(/getDailyTopPicks\(10, true\)/.test(route[0]), 'harus getDailyTopPicks(10, true)');
  const widget = fsMod.readFileSync(new URL('./public/js/49-strategy-engine.js', import.meta.url), 'utf8');
  assert(/daily-picks\?limit=10/.test(widget), 'widget harus tetap meminta limit=10 agar cocok dengan cache yang dihangatkan');
});

await test('workflow cron: langkah pemanas cache berjalan SETELAH scan, non-fatal, dan memanggil endpoint yang benar', async () => {
  const fsMod = await import('fs');
  const y = fsMod.readFileSync(new URL('./.github/workflows/strategy-engine-cron.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const scanIdx = y.indexOf('/api/cron/warm-strategy-engine?strategy=');
  const warmIdx = y.indexOf('/api/cron/warm-daily-picks');
  assert(scanIdx > 0 && warmIdx > scanIdx, 'langkah pemanas harus setelah langkah scan');
  const step = y.slice(y.indexOf('- name: Hangatkan cache Rekomendasi Harian'));
  assert(/if: success\(\)/.test(step) && /continue-on-error: true/.test(step), 'harus jalan hanya bila scan sukses dan non-fatal');
  assert(/Authorization: Bearer/.test(step));
});

await test('regime dinamis: BEAR_TREND atau RISK_OFF membatasi status STRONG ke WATCH', () => {
  const rBear = scoreStrategy(
    strategyDef({ A: 0.5, B: 0.5 }),
    [valid('A', 100), valid('B', 100)],
    { marketRegime: 'BEAR_TREND', regimeMultiplier: 0.7 }
  );
  assert.strictEqual(rBear.status, S.WATCH, 'BEAR_TREND harus membatasi ke WATCH');
  assert.strictEqual(rBear.rawStatus, S.STRONG);
  assert.strictEqual(rBear.regimeCapped, true);
  assert.strictEqual(rBear.adaptedScore, 70); // 100 * 0.7 = 70
  assert(rBear.reason.includes('Market Regime (BEAR_TREND)'));

  const rBull = scoreStrategy(
    strategyDef({ A: 0.5, B: 0.5 }),
    [valid('A', 100), valid('B', 100)],
    { marketRegime: 'BULL_TREND', regimeMultiplier: 1.1 }
  );
  assert.strictEqual(rBull.status, S.STRONG, 'BULL_TREND tidak membatasi');
  assert.strictEqual(rBull.regimeCapped, false);
  assert.strictEqual(rBull.adaptedScore, 100); // clamped at 100
});

await test('kontradiksi harga: SBMA (-14.58%) pada momentum-candidate ditolak ke REJECT demi pelestarian modal', () => {
  const momDef = { id: 'momentum-candidate', weights: { HIGH_BID_OFFER: 0.375, NO_SELL: 0.3125, CLOSE_HIGH: 0.1875, VOLUME: 0.125 }, mandatoryConditions: ['HIGH_BID_OFFER', 'NO_SELL'], scoreBands: { strong: 80, qualified: 70, watch: 55 } };
  // Skenario SBMA: HIGH_BID_OFFER 92.8, NO_SELL 79.8, CLOSE_HIGH 87.8, VOLUME unavailable => finalScore 87.1
  const indicators = [valid('HIGH_BID_OFFER', 92.8), valid('NO_SELL', 79.8), valid('CLOSE_HIGH', 87.8), unavailable('VOLUME')];

  const rSbma = scoreStrategy(momDef, indicators, { changePct: -14.58 });
  assert.strictEqual(rSbma.rawStatus, S.STRONG, 'skor mentah tetap 87.1 (STRONG)');
  assert.strictEqual(rSbma.status, S.REJECT, 'status akhir HARUS REJECT karena return -14.58%');
  assert.strictEqual(rSbma.priceRejected, true);
  assert.strictEqual(rSbma.priceChangePct, -14.58);
  assert(rSbma.adaptedScore <= 40, 'adaptedScore harus dipangkas ke <= 40');
  assert(rSbma.reason.includes('Kontradiksi Momentum: Return harga negatif (-14.58%)'), 'alasan harus mencantumkan kontradiksi');

  // Penurunan minor (-1.0%) pada momentum-candidate: dibatasi ke WATCH (bukan STRONG/QUALIFIED)
  const rMinor = scoreStrategy(momDef, indicators, { changePct: -1.0 });
  assert.strictEqual(rMinor.status, S.WATCH, 'penurunan minor dibatasi ke WATCH');
  assert.strictEqual(rMinor.priceCapped, true);
  assert(rMinor.adaptedScore <= 65);

  // Kenaikan positif (+2.5%): tetap STRONG tanpa intervensi harga
  const rPos = scoreStrategy(momDef, indicators, { changePct: 2.5 });
  assert.strictEqual(rPos.status, S.STRONG, 'return positif tetap STRONG');
  assert.strictEqual(rPos.priceRejected, false);
  assert.strictEqual(rPos.priceCapped, false);

  // Strategi lain (swing-flow) pada loss besar (-5.0%): REJECT
  const swingDef = { id: 'swing-flow', weights: { A: 0.5, B: 0.5 }, mandatoryConditions: [], scoreBands: { strong: 80, qualified: 70, watch: 55 } };
  const rSwingLoss = scoreStrategy(swingDef, [valid('A', 90), valid('B', 90)], { changePct: -5.0 });
  assert.strictEqual(rSwingLoss.status, S.REJECT, 'loss >= 3% pada swing-flow harus REJECT');
  assert.strictEqual(rSwingLoss.priceRejected, true);
});

await test('CLOSE_HIGH: candle merah (close < open) atau hari negatif (close < prev) digugurkan dan dipotong penalti', async () => {
  const { computeCloseHigh } = await import('./lib/engine/indicators/closeHigh.js');

  // Green candle, positive day -> lolos normal
  const rNormal = computeCloseHigh({ ohlc: { open: 100, high: 110, low: 90, close: 108, prev: 99 } }, 0.80);
  assert.strictEqual(rNormal.passed, true);
  assert.strictEqual(rNormal.score, 90);
  assert.strictEqual(rNormal.reason, null);

  // Red candle (close 102 < open 105), meskipun closePosition = (102-90)/(105-90) = 12/15 = 0.80 -> digugurkan
  const rRed = computeCloseHigh({ ohlc: { open: 105, high: 105, low: 90, close: 102, prev: 99 } }, 0.80);
  assert.strictEqual(rRed.passed, false, 'red candle tidak boleh lolos CLOSE_HIGH');
  assert(rRed.score < 80, 'skor harus dipotong penalti');
  assert(rRed.reason.includes('BEARISH_CONTRADICTION'));

  // Negative day (close 168 < prev 197), closePosition = (168-160)/(170-160) = 0.80 -> digugurkan
  const rDown = computeCloseHigh({ ohlc: { open: 165, high: 170, low: 160, close: 168, prev: 197 } }, 0.80);
  assert.strictEqual(rDown.passed, false, 'hari negatif tidak boleh lolos CLOSE_HIGH');
  assert(rDown.score < 80);
  assert(rDown.reason.includes('close < prev'));
});

global.fetch = originalFetch;
if (originalKey === undefined) delete process.env.INVEZGO_API_KEY; else process.env.INVEZGO_API_KEY = originalKey;

console.log(passed === total ? `🎉 ALL ${passed}/${total} STRATEGY SCORE COVERAGE TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
