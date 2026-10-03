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
  assert.strictEqual(state.contextFetches, 2, `fetch konteks = ${state.contextFetches}, seharusnya 2 (breadth + tv-scan, masing-masing sekali)`);
  assert(state.container.innerHTML.includes('Gagal memuat breadth pasar'), 'pilar 3 tidak jujur saat gagal');
});

await test('tanpa data, pilar Foreign Flow tetap jujur (tidak ada angka karangan)', () => {
  const { sandbox, state } = makeSandbox();
  sandbox.renderMarketRegimePage();
  const html = state.container.innerHTML;
  assert(html.includes('FOREIGN CAPITAL FLOW') && html.includes('Belum Tersedia'));
  assert(html.includes('skor peringkat'), 'alasan harus akurat: sumber hanya memberi skor peringkat, bukan Rupiah');
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} MARKET REGIME TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
