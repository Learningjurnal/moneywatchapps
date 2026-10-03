/**
 * test_market_regime_loop.js — regresi 2026-10-04: halaman Market Regime
 * ("Market Regime & Tactical Allocation") kosong karena fetch IHSG yang
 * gagal (mis. 429) memicu loop tanpa jeda.
 *
 * Akar masalah: perfFetchDailyHistory() memanggil callback juga saat GAGAL;
 * callback di getMarketRegime() me-render ulang halaman; render ulang
 * memanggil getMarketRegime() lagi yang memulai fetch baru => ribuan request
 * per menit yang menghabiskan rate limiter /api/idx (60/menit/IP) sehingga
 * panel lain ikut 429 dan kosong. File browser dimuat lewat vm dengan jaringan
 * di-stub; yang diuji logika backoff-nya.
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'public', 'js', '26-commandcenter.js'), 'utf8');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}

// Sandbox minimal: fetch IHSG SELALU gagal (callback dipanggil sinkron tanpa data,
// persis perilaku perfFetchDailyHistory saat gagal). Batas 200 panggilan mencegah
// test menggantung kalau loop kembali muncul.
function makeSandbox() {
  const state = { ihsgFetches: 0, contextFetches: 0, container: { innerHTML: '' } };
  const sandbox = {
    console, AbortSignal, setTimeout: () => 0, Date,
    currentPage: 'market-regime',
    el: () => state.container,
    escapeHtml: (s) => String(s),
    perfHistCacheKey: () => 'IHSG_TEST',
    rdGetAny: () => null,
    rdFetchIhsgDaily: (cb) => {
      state.ihsgFetches++;
      if (state.ihsgFetches > 200) throw new Error('LOOP: fetch IHSG diulang tanpa jeda (>200x)');
      cb();
    },
    fetch: () => { state.contextFetches++; return Promise.reject(new Error('429')); },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
    navigator: {},
    window: {}
  };
  sandbox.window = sandbox;
  vm.runInContext(src, vm.createContext(sandbox));
  return { sandbox, state };
}

// Sandbox dengan data IHSG tersedia (+0,46% hari ini) dan respons per-URL.
function makeSandboxWithData(responses) {
  const state = { container: { innerHTML: '' } };
  const rows = [{ close: 6009.5 }, { close: 6036.89 }];
  const sandbox = {
    console, AbortSignal, setTimeout: () => 0, Date, currentPage: 'market-regime',
    el: () => state.container, escapeHtml: (x) => String(x), perfHistCacheKey: () => 'IHSG_TEST',
    rdGetAny: () => rows, rdFetchIhsgDaily: (cb) => cb(), techStdDev: () => 0.82,
    fetch: (url) => {
      const key = Object.keys(responses).find(k => String(url).includes(k));
      if (!key) return Promise.reject(new Error('404'));
      const r = responses[key];
      return r instanceof Error ? Promise.reject(r) : Promise.resolve({ json: async () => r });
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
    navigator: {}, window: {}
  };
  sandbox.window = sandbox;
  vm.runInContext(src, vm.createContext(sandbox));
  return { sandbox, state };
}
const flush = () => new Promise(r => setImmediate(r));
async function renderSettled(responses) {
  const { sandbox, state } = makeSandboxWithData(responses);
  sandbox.renderMarketRegimePage();
  await flush(); await flush(); await flush();
  sandbox.renderMarketRegimePage();
  return state.container.innerHTML;
}
const regimePayload = (regime, extra) => ({ success: true, regime: Object.assign({ regime, confidence: 65, description: 'deskripsi ' + regime, computedAt: '2026-10-03T17:00:00Z' }, extra) });

console.log('🧪 MARKET REGIME — REGRESI LOOP FETCH IHSG');

await test('fetch IHSG yang gagal TIDAK memicu loop: hanya 1 percobaan sampai jeda backoff lewat', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.renderMarketRegimePage();
  assert.strictEqual(state.ihsgFetches, 1, `percobaan fetch IHSG = ${state.ihsgFetches}, seharusnya 1`);
});

await test('setelah gagal, halaman menampilkan status gagal yang jujur (bukan "Memuat…" selamanya)', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.renderMarketRegimePage();
  sandbox.renderMarketRegimePage(); // render berikutnya masih dalam jeda backoff
  assert(state.container.innerHTML.includes('GAGAL MEMUAT DATA IHSG'), 'status gagal tidak tampil');
  assert(state.container.innerHTML.includes('Gagal Dimuat'), 'pilar 1 tidak menandai gagal');
  assert.strictEqual(state.ihsgFetches, 1, 'render ulang dalam jeda backoff tidak boleh fetch lagi');
});

await test('pemuat konteks (breadth/TradingView) yang gagal tidak mengulang tanpa jeda', async () => {
  const { sandbox, state } = makeSandbox();
  sandbox.renderMarketRegimePage();
  await new Promise(r => setImmediate(r)); // biarkan rejection diproses
  sandbox.renderMarketRegimePage();
  await new Promise(r => setImmediate(r));
  sandbox.renderMarketRegimePage();
  assert.strictEqual(state.contextFetches, 3, `fetch konteks = ${state.contextFetches}, seharusnya 3 (breadth + tv-scan + regime, masing-masing sekali)`);
  assert(state.container.innerHTML.includes('Gagal memuat breadth pasar'), 'pilar 3 tidak jujur saat gagal');
});

await test('tanpa data, pilar Foreign Flow tetap jujur (tidak ada angka karangan)', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.renderMarketRegimePage();
  const html = state.container.innerHTML;
  assert(html.includes('FOREIGN CAPITAL FLOW') && html.includes('Belum Tersedia'));
  assert(html.includes('skor peringkat'), 'alasan harus akurat: sumber hanya memberi skor peringkat, bukan Rupiah');
});

await test('status mengikuti klasifikasi server: RISK_OFF + IHSG naik 0,46% hari ini BUKAN "NEUTRAL / ACCUMULATION" (kontradiksi lama)', async () => {
  const html = await renderSettled({ '/api/idx/regime': regimePayload('RISK_OFF'), '/api/idx/summary': Error('x'), '/api/idx/tv-scan': Error('x') });
  assert(html.includes('RISK-OFF'), 'status harus RISK-OFF');
  assert(html.includes('40% – 55%') && html.includes('45% – 60%'), 'alokasi defensif harus tampil');
  assert(!html.includes('NEUTRAL / ACCUMULATION'), 'status lama berbasis 1 hari tidak boleh muncul');
  assert(!html.includes('60% – 75%'), 'alokasi netral tidak boleh muncul saat risk-off');
});

await test('pemetaan regime server -> status & alokasi (BULL_TREND, BEAR_TREND, SIDEWAYS, HIGH_VOLATILITY)', async () => {
  const expectations = [
    ['BULL_TREND', 'BULLISH', '70% – 85%'], ['BEAR_TREND', 'BEARISH', '40% – 55%'],
    ['SIDEWAYS', 'NEUTRAL / ACCUMULATION', '60% – 75%'], ['HIGH_VOLATILITY', 'HIGH VOLATILITY', '60% – 75%']
  ];
  for (const [code, status, equity] of expectations) {
    const html = await renderSettled({ '/api/idx/regime': regimePayload(code), '/api/idx/summary': Error('x'), '/api/idx/tv-scan': Error('x') });
    assert(html.includes(status) && html.includes(equity), code + ' -> ' + status + ' / ' + equity);
  }
});

await test('klasifikasi UNKNOWN atau gagal dimuat => tanpa rekomendasi alokasi (bukan angka tebakan)', async () => {
  for (const regime of [regimePayload('UNKNOWN', { description: 'Data historis IHSG tidak cukup' }), Error('429')]) {
    const html = await renderSettled({ '/api/idx/regime': regime, '/api/idx/summary': Error('x'), '/api/idx/tv-scan': Error('x') });
    assert(html.includes('KLASIFIKASI TIDAK TERSEDIA'), 'status harus jujur tidak tersedia');
    assert(!/d+% – d+%/.test(html), 'tidak boleh ada rentang alokasi tanpa klasifikasi');
  }
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} MARKET REGIME TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
