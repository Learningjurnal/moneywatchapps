/**
 * test_other_strategies_card.js — kartu "Strategi Lain" di Strategy Lab (AI Trading) dan endpoint
 * /api/idx/accumulation-backtest. Dulu kartu statis "Belum Diimplementasikan" dengan alasan yang sebagian
 * keliru; kini status dibaca dari hasil nyata dan jujur "belum tersedia" bila hasil tidak bisa dimuat.
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const aiSrc = read('public/js/38-ai-autonomous-trading.js');
const XGB = JSON.parse(read('public/models/xgb_signal_meta.json'));

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try { fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}

// Ambil blok fungsi kartu dari sumber (di dalam IIFE 38-...js) dan jalankan dengan stub.
function loadCard() {
  const a = aiSrc.indexOf('  var AI_OTHER = {');
  const b = aiSrc.indexOf('  function renderAiStrategyLab(state) {');
  assert(a > 0 && b > a, 'blok kartu tidak ditemukan');
  const sb = {
    console, Math, JSON, Object, Array, String, Number, isFinite, Promise,
    escapeHtml: (x) => String(x),
    uiInfoIcon: (t) => '<i data-tip="' + String(t).slice(0, 40) + '"></i>',
    AI_TRADE_STATE: { activeTab: 'strategylab' },
    renderAiTradingPage: () => {},
    fetch: () => Promise.reject(new Error('no network'))
  };
  const ctx = vm.createContext(sb);
  vm.runInContext(aiSrc.slice(a, b) + '\nthis.__api = { AI_OTHER, aiAccumulationBacktestHtml, aiXgbSummaryHtml, aiOtherStrategiesHtml };', ctx);
  return sb.__api;
}

const variant = (topK, horizon, over) => ({
  variant: { kind: 'accum', topK, horizon }, nSignals: 1200, nDates: 480, meanNetPct: 0.4, medianNetPct: 0.0, medianExcessVsUniversePct: -0.15,
  ci: { low: -0.6, high: 0.5, level: 99.2 }, verdict: 'TIDAK_TERBUKTI', reason: 'x', ...over
});
const BT = {
  available: true, computedAt: '2026-10-04T10:00:00Z', overall: 'TIDAK_TERBUKTI',
  dataRange: { from: '2024-07-30', to: '2026-09-04' },
  coverage: { datesWithData: 480, tickersWithPriceHistory: 880, tickersSeen: 950 },
  primary: [5, 10, 20].flatMap((h) => [10, 30].map((k) => variant(k, h))),
  control: [variant(10, 5), variant(30, 5)], controlOutperformsCount: 0,
  methodology: ['m'], assumptions: ['a'], limitations: ['l']
};

console.log('🧪 KARTU "STRATEGI LAIN" — STATUS JUJUR BERBASIS DATA');

test('kartu statis lama "Belum Diimplementasikan" dan alasan keliru sudah diganti blok dinamis', () => {
  const live = aiSrc.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  assert(!live.some((l) => /Belum Diimplementasikan/.test(l)), 'judul statis lama masih ada');
  assert(!live.some((l) => /butuh data historis broker per-transaksi/.test(l)), 'alasan keliru (butuh data per-transaksi) masih ada');
  assert(live.some((l) => /html \+= aiOtherStrategiesHtml\(\);/.test(l)), 'renderAiStrategyLab harus memakai aiOtherStrategiesHtml()');
});

test('kartu tampil juga saat backtest LQ45 belum dijalankan (jalur return awal renderAiStrategyLab)', () => {
  const i = aiSrc.indexOf('  function renderAiStrategyLab(state) {');
  const from = aiSrc.indexOf('if (!AI_BACKTEST_RESULTS) {', i);
  const to = aiSrc.indexOf('return html;', from);
  assert(from > i && to > from, 'jalur return awal tidak ditemukan');
  assert(aiSrc.slice(from, to).includes('aiOtherStrategiesHtml()'), 'jalur return awal harus menyertakan kartu');
});

test('backtest tersedia: enam varian primer tampil dengan angka, verdict, dan baris kontrol distribusi', () => {
  const api = loadCard();
  const html = api.aiAccumulationBacktestHtml(BT);
  [5, 10, 20].forEach((h) => [10, 30].forEach((k) => assert(html.includes('Top-' + k + ' · ' + h + ' hari'), `varian top${k} h${h} hilang`)));
  assert((html.match(/Keunggulan tidak terbukti/g) || []).length >= 7, 'verdict keseluruhan + 6 baris');
  assert(html.includes('unggul pada 0 dari 2 varian'), 'baris kontrol distribusi');
  assert(html.includes('2024-07-30') && html.includes('2026-09-04') && html.includes('480 tanggal'), 'rentang & cakupan data');
  assert(html.includes('-0,15%'), 'median excess diformat id-ID dengan tanda');
  assert(/Bias penyintas/.test(html), 'keterbatasan bias penyintas harus tampil');
});

test('verdict berbeda dipetakan ke label yang benar (ada indikasi / berkinerja di bawah pasar / data kurang)', () => {
  const api = loadCard();
  assert(api.aiAccumulationBacktestHtml({ ...BT, overall: 'ADA_INDIKASI_EDGE', primary: [variant(10, 10, { verdict: 'EDGE_TERBUKTI' })] }).includes('Ada indikasi keunggulan'));
  assert(api.aiAccumulationBacktestHtml({ ...BT, overall: 'NEGATIF', primary: [variant(10, 10, { verdict: 'NEGATIF' })] }).includes('Berkinerja di bawah pasar'));
  assert(api.aiAccumulationBacktestHtml({ ...BT, overall: 'DATA_KURANG', primary: [variant(10, 10, { verdict: 'DATA_KURANG' })] }).includes('Data belum cukup'));
});

test('hasil tidak tersedia / gagal dimuat => "belum tersedia" (bukan angka)', () => {
  const api = loadCard();
  [null, { available: false, reason: 'Backtest belum dijalankan' }].forEach((bt) => {
    const html = api.aiAccumulationBacktestHtml(bt);
    assert(/belum tersedia/i.test(html), 'harus jujur belum tersedia');
    assert(!/\d+,\d\d%/.test(html), 'tidak boleh ada angka persen karangan');
  });
});

test('ringkasan XGBoost memakai metrik asli (AUC, presisi, base rate) dan menyatakan tidak ada keunggulan bila AUC ~0,5', () => {
  const api = loadCard();
  const html = api.aiXgbSummaryHtml(XGB);
  assert(html.includes(XGB.test_roc_auc.toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })), 'AUC asli harus tampil');
  assert(/setara tebak acak/.test(html) && /tidak ada keunggulan/.test(html));
  assert(html.includes(String(XGB.n_test)), 'jumlah sampel uji');
  const good = api.aiXgbSummaryHtml({ ...XGB, test_roc_auc: 0.64 });
  assert(!/tidak ada keunggulan/.test(good) && !/tebak acak/.test(good), 'AUC 0,64 tidak boleh disebut tanpa keunggulan');
  assert(/belum bisa dimuat/.test(api.aiXgbSummaryHtml(null)), 'metrik gagal dimuat => pesan jujur');
});

test('kartu lengkap: tiga strategi, regime-adaptive dinyatakan BELUM DIUJI beserta alasan', () => {
  const api = loadCard();
  api.AI_OTHER.backtest = BT; api.AI_OTHER.xgb = XGB; api.AI_OTHER.loaded = true;
  const html = api.aiOtherStrategiesHtml();
  ['Bandarmologi / akumulasi bandar', 'Ensemble model ML', 'Regime-adaptive switching'].forEach((t) => assert(html.includes(t), t));
  assert(/Belum diuji/.test(html) && /berganti sangat sering/.test(html) && /±45 emiten/.test(html));
  assert.strictEqual((html.match(/class="card"/g) || []).length, 1, 'satu kartu terpadu (Zero Card Fragmentation)');
});

test('endpoint /api/idx/accumulation-backtest: hanya MEMBACA file hasil, available:false bila belum ada', () => {
  const server = read('server.js');
  const route = server.match(/app\.get\('\/api\/idx\/accumulation-backtest'[\s\S]*?\n\}\);/);
  assert(route, 'route tidak ditemukan');
  assert(/data', 'backtests', 'accumulation-backtest\.json'/.test(route[0]));
  assert(/available: false/.test(route[0]) && !/fetchInvezgo|fetch\(/.test(route[0]), 'route tidak boleh memanggil Invezgo/jaringan');
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} OTHER STRATEGIES CARD TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
