/**
 * test_tradingview_scanner.js — tes untuk lib/providers/tradingview-scanner-client.js
 * Jaringan di-mock; yang diuji adalah logika parse, cache, stale-fallback,
 * dan rekonsiliasi cakupan terhadap universe (kode tak tercakup = jujur).
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TV_COLUMNS,
  parseScanResponse,
  getMarketScan,
  reconcileWithUniverse,
  _resetCacheForTests
} from './lib/providers/tradingview-scanner-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    _resetCacheForTests();
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function makeRow(code, overrides = {}) {
  const d = TV_COLUMNS.map(() => null);
  d[0] = code;
  Object.entries(overrides).forEach(([field, value]) => {
    const i = TV_COLUMNS.findIndex(([f]) => f === field);
    assert(i >= 0, `field tidak dikenal di test: ${field}`);
    d[i] = value;
  });
  return { s: `IDX:${code}`, d };
}

function mockFetch(payloadOrFn) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    const payload = typeof payloadOrFn === 'function' ? payloadOrFn(calls.length) : payloadOrFn;
    if (payload instanceof Error) throw payload;
    return { ok: payload.status ? payload.status < 400 : true, status: payload.status || 200, json: async () => payload.json ?? payload };
  };
  impl.calls = calls;
  return impl;
}

console.log('🧪 TRADINGVIEW SCANNER CLIENT TESTS');

await test('parse: memetakan kolom ke field bernama dan mempertahankan null (tidak diisi tebakan)', () => {
  const rows = parseScanResponse({ data: [makeRow('BBCA', { price: 6100, pe: null, updateMode: 'delayed_streaming_600' })] });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].code, 'BBCA');
  assert.strictEqual(rows[0].price, 6100);
  assert.strictEqual(rows[0].pe, null, 'P/E kosong harus tetap null');
  assert.strictEqual(rows[0].delaySeconds, 600);
  assert.strictEqual(rows[0].symbol, 'IDX:BBCA');
});

await test('parse: baris tanpa kode / bentuk salah dilewati, bukan melempar', () => {
  const rows = parseScanResponse({ data: [null, { s: 'IDX:X' }, { s: 'IDX:Y', d: [] }, makeRow('TLKM')] });
  assert.deepStrictEqual(rows.map(r => r.code), ['TLKM']);
});

await test('parse: respons tanpa array data melempar error jelas', () => {
  assert.throws(() => parseScanResponse({ error: 'x' }), /array "data"/);
});

await test('parse: update_mode tak dikenal => delaySeconds null (tidak menebak)', () => {
  const rows = parseScanResponse({ data: [makeRow('BBRI', { updateMode: 'streaming' })] });
  assert.strictEqual(rows[0].delaySeconds, null);
});

await test('request: kolom & range sesuai TV_COLUMNS; hasil di-cache dalam TTL', async () => {
  const f = mockFetch({ data: [makeRow('BBCA')] });
  const a = await getMarketScan({ fetchImpl: f, now: () => 1000 });
  const b = await getMarketScan({ fetchImpl: f, now: () => 2000 });
  assert.strictEqual(f.calls.length, 1, 'panggilan kedua harus dari cache');
  assert.deepStrictEqual(f.calls[0].body.columns, TV_COLUMNS.map(([, c]) => c));
  assert.deepStrictEqual(f.calls[0].body.range, [0, 2000]);
  assert.strictEqual(a.stale, false);
  assert.strictEqual(b.rows, a.rows);
});

await test('request: permintaan bersamaan digabung jadi 1 panggilan jaringan', async () => {
  const f = mockFetch({ data: [makeRow('BBCA')] });
  await Promise.all([1, 2, 3].map(() => getMarketScan({ fetchImpl: f, now: () => 1000 })));
  assert.strictEqual(f.calls.length, 1);
});

await test('stale: refresh gagal tapi ada cache lama => stale:true + pesan error, bukan melempar', async () => {
  const ok = mockFetch({ data: [makeRow('BBCA', { price: 6100 })] });
  await getMarketScan({ fetchImpl: ok, now: () => 0 });
  const bad = mockFetch({ status: 503, json: {} });
  const r = await getMarketScan({ fetchImpl: bad, now: () => 10 * 60 * 1000 });
  assert.strictEqual(r.stale, true);
  assert.match(r.error, /HTTP 503/);
  assert.strictEqual(r.rows[0].price, 6100);
});

await test('error: gagal tanpa cache => melempar (route akan menjawab 502)', async () => {
  await assert.rejects(() => getMarketScan({ fetchImpl: mockFetch(new Error('timeout')) }), /timeout/);
});

await test('reconcile: kode universe yang tak ada di scanner masuk notCovered; ETF di luar universe tidak masuk rows', () => {
  const scanRows = parseScanResponse({ data: [makeRow('BBCA'), makeRow('TLKM'), makeRow('XGLD')] });
  const universe = { BBCA: {}, TLKM: {}, ADHI: {}, INPS: {} };
  const { rows, coverage } = reconcileWithUniverse(scanRows, universe);
  assert.deepStrictEqual(rows.map(r => r.code).sort(), ['BBCA', 'TLKM']);
  assert.deepStrictEqual(coverage.notCovered, ['ADHI', 'INPS']);
  assert.strictEqual(coverage.universeSize, 4);
  assert.strictEqual(coverage.covered, 2);
  assert.strictEqual(coverage.outsideUniverse, 1);
});

// ── UI: preset strategi (public/js/52-tv-scanner.js, dimuat lewat vm) ─────
const uiSandbox = { window: {}, document: { getElementById: () => null }, AbortSignal, fetch: () => { throw new Error('no network'); }, console };
uiSandbox.window = uiSandbox;
vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'js', '52-tv-scanner.js'), 'utf8'), vm.createContext(uiSandbox));
const ui = uiSandbox;

function uiRow(overrides) {
  return ui.tvsDerive(Object.assign({ code: 'TEST', name: 'Test', sector: 'Finance', price: 1000, valueTraded: 5e9,
    marketCap: 5e12, pe: 10, pb: 1, roe: 15, debtToEquity: 0.5, dividendYield: 6, rsi: 30, adx: 30, perf1M: 1,
    sma50: 900, sma200: 800, high52w: 1020, ratingAll1D: 0.6, ratingAll1W: 0.4 }, overrides));
}
const uiPasses = (presetId, row) => {
  ui.tvsApplyPreset(presetId);
  return ui.tvsFilteredRows.call(null) && ui.tvsRowPasses(row, ui.TVS_STATE.filters, '');
};

await test('ui: kriteria & kunci urut tiap preset mengacu pada filter/kolom yang benar-benar ada', () => {
  const names = new Set([...ui.TVS_FILTER_SPECS, ...ui.TVS_CHECK_SPECS].map(s => s.name));
  const colKeys = new Set(ui.TVS_COLS.map(c => c.key));
  ui.TVS_PRESETS.forEach(p => {
    Object.keys(p.criteria).forEach(k => assert(names.has(k), `preset ${p.id}: filter tak dikenal "${k}"`));
    assert(colKeys.has(p.sort.key), `preset ${p.id}: kunci urut "${p.sort.key}" bukan kolom tabel`);
  });
});

await test('ui: tab dibuka dengan strategi bawaan yang sudah mengisi kolom filter', () => {
  const fresh = vm.createContext(Object.assign({}, uiSandbox, { window: {} }));
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'js', '52-tv-scanner.js'), 'utf8'), fresh);
  assert.strictEqual(fresh.TVS_STATE.presetId, fresh.TVS_DEFAULT_PRESET);
  assert.strictEqual(fresh.TVS_STATE.filters.minRoe, '10');
  assert.strictEqual(fresh.TVS_STATE.filters.minValueTradedB, '1');
});

await test('ui: preset Value Sehat meloloskan emiten yang memenuhi semua kriteria', () => {
  assert.strictEqual(uiPasses('value', uiRow({ pe: 12, pb: 1.2, roe: 12, debtToEquity: 0.8 })), true);
});

await test('ui: nilai kosong pada kolom yang difilter => emiten dikecualikan (bukan dianggap lolos)', () => {
  ['pe', 'pb', 'roe', 'debtToEquity'].forEach(field => {
    assert.strictEqual(uiPasses('value', uiRow({ [field]: null })), false, `${field} kosong seharusnya tidak lolos`);
  });
});

await test('ui: ambang batas dihormati (P/E 15,01 gagal, ROE 9,99 gagal, nilai trx < 1 M gagal)', () => {
  assert.strictEqual(uiPasses('value', uiRow({ pe: 15.01 })), false);
  assert.strictEqual(uiPasses('value', uiRow({ roe: 9.99 })), false);
  assert.strictEqual(uiPasses('value', uiRow({ valueTraded: 9.9e8 })), false);
});

await test('ui: jarak ke High 52M dan harga vs SMA dihitung hanya dari operand nyata', () => {
  assert.strictEqual(uiRow({ high52w: null }).distHigh52w, null);
  assert.strictEqual(uiRow({ sma200: 0 }).distSma200, null);
  assert(Math.abs(uiRow({ price: 1000, high52w: 1050 }).distHigh52w - (-4.7619)) < 0.001);
  assert.strictEqual(uiPasses('nearhigh', uiRow({ price: 1000, high52w: 1050, sma200: 900 })), true);
  assert.strictEqual(uiPasses('nearhigh', uiRow({ price: 1000, high52w: 1060, sma200: 900 })), false, 'lebih dari 5% di bawah High 52M');
});

await test('ui: mengubah filter manual mengubah strategi jadi "kustom"; ringkasan kriteria mengikuti state', () => {
  ui.tvsApplyPreset('value');
  ui.tvsSetFilter('maxPe', '12');
  assert.strictEqual(ui.TVS_STATE.presetId, 'custom');
  const text = ui.tvsCriteriaSummary().join(' | ');
  assert(text.includes('P/E ≤ 12'), text);
  assert(!text.includes('P/E ≤ 15'), 'ringkasan tidak boleh memuat ambang lama');
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} TRADINGVIEW SCANNER TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
