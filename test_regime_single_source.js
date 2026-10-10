/**
 * test_regime_single_source.js — regresi 2026-10-04: "Market Regime & Tactical
 * Allocation berbeda dengan Market Regime pada Autonomous AI Trading".
 *
 * Akar masalah: klasifikasi regime tampil di 6 tempat, masing-masing dengan
 * fetch /api/idx/regime sendiri dan tabel label sendiri (RISK OFF / RISK-OFF /
 * Risk-Off; BULLISH vs BULL TREND), Market Pulse menentukan "RISK-ON BULLISH"
 * dari tanda perubahan IHSG hari ini, dan tab AI Trading punya 4 kotak yang
 * permanen kosong serta nilai bawaan 'SIDEWAYS' karangan.
 *
 * Sekarang SATU sumber: public/js/03b-regime-store.js. Tes ini menjaga (1) perilaku
 * store, (2) semua halaman memakai label yang sama, dan (3) duplikat lama tidak kembali.
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS_DIR = path.join(__dirname, 'public', 'js');
const read = (f) => fs.readFileSync(path.join(JS_DIR, f), 'utf8');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}
const flush = () => new Promise(r => setImmediate(r));

function baseSandbox(fetchImpl) {
  const sb = {
    console, AbortSignal, Date, Promise, Math, JSON, Object, Array, String, Number,
    setTimeout: () => 0, clearTimeout() {},
    fetch: fetchImpl,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
    navigator: {}, window: {}
  };
  sb.window = sb;
  return sb;
}
const regimeResponse = (code, extra) => ({ success: true, regime: Object.assign({ regime: code, confidence: 65, ihsg: 6036.89, ihsgChangePct: 0.46, rsi14: 18.9, description: 'deskripsi ' + code, computedAt: '2026-10-03T17:00:00Z' }, extra) });
const okFetch = (payload, counter) => () => { if (counter) counter.n++; return Promise.resolve({ json: async () => payload }); };

function loadStore(fetchImpl) {
  const sb = baseSandbox(fetchImpl);
  const ctx = vm.createContext(sb);
  vm.runInContext(read('03b-regime-store.js'), ctx);
  return { sb, ctx };
}

console.log('🧪 MARKET REGIME — SATU SUMBER UNTUK SELURUH UI');

// ── (1) perilaku store ────────────────────────────────────────────────────
await test('store: lima kode regime server punya label unik; RISK_OFF = "RISK-OFF" (satu ejaan)', () => {
  const { sb } = loadStore(okFetch({}));
  const codes = Object.keys(sb.MW_REGIME_MAP);
  assert.deepStrictEqual(codes.sort(), ['BEAR_TREND', 'BULL_TREND', 'HIGH_VOLATILITY', 'RISK_OFF', 'SIDEWAYS']);
  const labels = codes.map(c => sb.MW_REGIME_MAP[c].label);
  assert.strictEqual(new Set(labels).size, labels.length, 'label harus unik');
  assert.strictEqual(sb.MW_REGIME_MAP.RISK_OFF.label, 'RISK-OFF');
});

await test('store: satu fetch untuk banyak pemanggil bersamaan, lalu dari cache (TTL 5 menit)', async () => {
  const counter = { n: 0 };
  const { sb } = loadStore(okFetch(regimeResponse('RISK_OFF'), counter));
  await Promise.all([sb.mwRegimeEnsure(false), sb.mwRegimeEnsure(false), sb.mwRegimeEnsure(false)]);
  await sb.mwRegimeEnsure(false);
  assert.strictEqual(counter.n, 1, `fetch = ${counter.n}, seharusnya 1 (dulu 6 tempat mengambil sendiri-sendiri)`);
  assert.strictEqual(sb.mwRegimeCode(), 'RISK_OFF');
});

await test('store: gagal => status "tidak tersedia", kode null (bukan nilai bawaan karangan), backoff tanpa loop', async () => {
  const counter = { n: 0 };
  const { sb } = loadStore(() => { counter.n++; return Promise.reject(new Error('429')); });
  await sb.mwRegimeEnsure(false);
  await sb.mwRegimeEnsure(false);
  await sb.mwRegimeEnsure(false);
  assert.strictEqual(counter.n, 1, 'setelah gagal tidak boleh mengulang sebelum jeda');
  assert.strictEqual(sb.mwRegimeCode(), null, 'tanpa data, kode harus null (dulu AI Trading memakai "SIDEWAYS" karangan)');
  const c = sb.mwRegimeClassification();
  assert.strictEqual(c.state, 'unavailable');
  assert.strictEqual(c.status, 'KLASIFIKASI TIDAK TERSEDIA');
  assert.strictEqual(c.equityTarget, '-');
});

await test('store: UNKNOWN dari server => tanpa rekomendasi alokasi; pendengar diberi tahu saat selesai', async () => {
  const { sb } = loadStore(okFetch(regimeResponse('UNKNOWN', { description: 'Data historis IHSG tidak cukup' })));
  let notified = 0;
  sb.mwRegimeSubscribe(() => { notified++; });
  await sb.mwRegimeEnsure(false);
  assert.strictEqual(notified, 1);
  const c = sb.mwRegimeClassification();
  assert.strictEqual(c.state, 'unavailable');
  assert(c.description.includes('tidak cukup'));
});

// ── (2) semua halaman memakai label yang sama ─────────────────────────────
async function renderedLabels(code) {
  const fetchImpl = okFetch(regimeResponse(code));

  // Dashboard (04-render.js)
  const dash = baseSandbox(fetchImpl);
  const els = { 'dash-regime-badge': { style: {}, textContent: '' }, 'dash-regime-confidence': { style: {}, textContent: '' }, 'dash-regime-ihsg': { style: {}, textContent: '' }, 'dash-regime-ihsg-chg': { style: {}, textContent: '' }, 'dash-regime-desc': { style: {}, textContent: '' } };
  dash.el = (id) => els[id] || null;
  const dctx = vm.createContext(dash);
  vm.runInContext(read('03b-regime-store.js'), dctx);
  vm.runInContext(read('04-render.js'), dctx);
  await dash.renderDashboardMarketRegime();

  // Halaman Market Regime (26)
  const page = baseSandbox(fetchImpl);
  const cont = { innerHTML: '' };
  Object.assign(page, { currentPage: 'market-regime', el: () => cont, escapeHtml: String, perfHistCacheKey: () => 'K', rdGetAny: () => [{ close: 6009.5 }, { close: 6036.89 }], rdFetchIhsgDaily: (cb) => cb(), techStdDev: () => 0.82 });
  const pctx = vm.createContext(page);
  vm.runInContext(read('03b-regime-store.js'), pctx);
  vm.runInContext(read('26-commandcenter.js'), pctx);
  page.renderMarketRegimePage();
  await flush(); await flush(); await flush();
  page.renderMarketRegimePage();

  return { dashboard: els['dash-regime-badge'].textContent, page: cont.innerHTML };
}

await test('Dashboard dan halaman Market Regime menampilkan label yang SAMA untuk tiap kode regime', async () => {
  for (const code of ['BULL_TREND', 'SIDEWAYS', 'HIGH_VOLATILITY', 'BEAR_TREND', 'RISK_OFF']) {
    const { sb } = loadStore(okFetch({}));
    const expected = sb.MW_REGIME_MAP[code].label;
    const out = await renderedLabels(code);
    assert.strictEqual(out.dashboard, expected, `Dashboard ${code}: "${out.dashboard}" != "${expected}"`);
    assert(out.page.includes('>' + expected + '<'), `Halaman Market Regime ${code} tidak memuat label "${expected}"`);
  }
});

// ── (3) duplikat lama tidak kembali ───────────────────────────────────────
const allJs = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js'));

await test('hanya store yang mengambil /api/idx/regime di klien (tidak ada fetch regime lain)', () => {
  const offenders = allJs.filter(f => f !== '03b-regime-store.js' && /fetch\(\s*['"]\/api\/idx\/regime/.test(read(f)));
  assert.deepStrictEqual(offenders, [], 'fetch regime terpisah ditemukan di: ' + offenders.join(', '));
});

await test('tabel label/tab/fetch regime lama sudah hilang (DASH_REGIME_DISPLAY, tab AI "Market Regime", fetchAiMarketRegime, ...)', () => {
  const banned = ['DASH_REGIME_DISPLAY', 'REGIME_DISPLAY', 'renderAiMarketRegime', 'fetchAiMarketRegime', 'MR_REGIME_MAP', 'AI_REGIME_LOADING', 'mrClassification', "aiSwitchTab('regime')", 'RISK-ON BULLISH', 'BEARISH CORRECTION'];
  allJs.forEach((f) => {
    const src = read(f);
    banned.forEach((b) => {
      const hit = src.split('\n').some(line => line.includes(b) && !line.trim().startsWith('//') && !line.trim().startsWith('*'));
      assert(!hit, `"${b}" masih ada di ${f}`);
    });
  });
});

await test("AI Trading tidak lagi memakai nilai bawaan karangan 'SIDEWAYS' untuk regime", () => {
  const src = read('38-ai-autonomous-trading.js');
  assert(!/\|\|\s*'SIDEWAYS'/.test(src), "masih ada fallback || 'SIDEWAYS'");
  assert(/mwRegimeCode\(\)/.test(src), 'harus memakai mwRegimeCode() dari store');
});

await test('index.html memuat store SEBELUM semua pemakainya dan sidebar punya entri Market Pulse (Market Regime digabung)', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const pos = (f) => html.indexOf('js/' + f + '?v=');
  const storePos = pos('03b-regime-store.js');
  assert(storePos > 0, 'tag script store tidak ada');
  ['04-render.js', '26-commandcenter.js', '28-decisiontools.js', '38-ai-autonomous-trading.js', '46-stock-dossier.js', '51-market-report.js'].forEach((f) => {
    assert(pos(f) > storePos, `${f} dimuat sebelum store`);
  });
  assert(/goPage\('daily-brief',this\)/.test(html), 'sidebar harus punya entri Market Pulse (daily-brief)');
  assert(!/goPage\('market-regime',this\)/.test(html), 'sidebar tidak boleh lagi punya entri terpisah Market Regime');
});

await test('teks palet perintah tidak lagi mengklaim VIX/suku bunga/yield bond untuk Market Regime', () => {
  const src = read('29-institutional-ui.js');
  const line = src.split('\n').find(l => l.includes("id: 'market-regime'")) || '';
  assert(line && !/VIX|yield bond|suku bunga/i.test(line), 'klaim data yang tidak ada masih tertulis: ' + line.trim());
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} REGIME SINGLE-SOURCE TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
