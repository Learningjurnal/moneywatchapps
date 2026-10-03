/**
 * test_tradingview_scanner.js — tes untuk lib/providers/tradingview-scanner-client.js
 * Jaringan di-mock; yang diuji adalah logika parse, cache, stale-fallback,
 * dan rekonsiliasi cakupan terhadap universe (kode tak tercakup = jujur).
 */

import assert from 'assert';
import {
  TV_COLUMNS,
  parseScanResponse,
  getMarketScan,
  reconcileWithUniverse,
  _resetCacheForTests
} from './lib/providers/tradingview-scanner-client.js';

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

console.log(passed === total ? `🎉 ALL ${passed}/${total} TRADINGVIEW SCANNER TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
