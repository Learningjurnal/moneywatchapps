/** test_costs_indices.js — biaya transaksi satu sumber (0,4%) + kuotasi indeks LQ45/JII real (bukan karangan). */
import assert from 'assert';
import fs from 'fs';
process.env.UPSTASH_REDIS_REST_URL = ''; process.env.UPSTASH_REDIS_REST_TOKEN = '';
const read = (p) => fs.readFileSync(new URL('./' + p, import.meta.url), 'utf8').split('\r\n').join('\n');
const { ROUND_TRIP_COST_PCT, BUY_FEE_PCT, SELL_FEE_PCT } = await import('./lib/backtest/costs.js');
const { DEFAULT_CONFIG } = await import('./lib/backtest/accumulation-backtest.js');
const eng = await import('./lib/idx-data-engine.js');
let n = 0, total = 0;
const t = async (name, fn) => { total++; try { await fn(); console.log('  ✅ [PASS] ' + name); n++; } catch (e) { console.error('  ❌ [FAIL] ' + name + ': ' + e.message); process.exitCode = 1; } };

await t('biaya = tarif bawaan aplikasi (beli 0,15% + jual 0,25%) = 0,4% dan dipakai kedua backtest', () => {
  assert.strictEqual(BUY_FEE_PCT, 0.15); assert.strictEqual(SELL_FEE_PCT, 0.25);
  assert(Math.abs(ROUND_TRIP_COST_PCT - 0.4) < 1e-12);
  assert.strictEqual(DEFAULT_CONFIG.roundTripCostPct, ROUND_TRIP_COST_PCT);
  const e = read('lib/idx-data-engine.js');
  assert(/FRICTION_PCT = ROUND_TRIP_COST_PCT \/ 100/.test(e), 'backtest strategi harus memakai konstanta bersama');
  assert(!/FRICTION_PCT = 0\.002/.test(e));
});
await t('tarif bawaan di 01-data.js memang 0,15%/0,25% (dasar angka biaya)', () => {
  const d = read('public/js/01-data.js');
  assert(/'Mirae Asset':\s*\{buyFee:0\.0015, sellFee:0\.0025/.test(d));
});
await t('klien: paper trading memakai 0,15%/0,25% dan teks UI menyebut ~0,4% (bukan 0.2%)', () => {
  const c = read('public/js/38-ai-autonomous-trading.js');
  assert(/pos\.entryPrice \* pos\.shares \* 0\.0015 \+ px \* pos\.shares \* 0\.0025/.test(c));
  assert(!/~0\.2% round-trip/.test(c), 'teks lama 0.2% masih ada');
  assert((c.match(/~0,4% round-trip/g) || []).length >= 2);
});
const chart = (closes, price) => ({ chart: { result: [{ meta: { regularMarketPrice: price, regularMarketTime: 1_800_000_000 + closes.length * 86400, gmtoffset: 25200 }, timestamp: closes.map((_, i) => 1_800_000_000 + (i + 1) * 86400), indicators: { quote: [{ close: closes }] } }] } });
const realFetch = globalThis.fetch;
await t('getIdxIndexQuote: kuotasi real dihitung dari deret close; gagal => available:false tanpa angka', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify(chart([590, 592, 594, 595.457], 598.0)), { status: 200 });
  const q = await eng.getIdxIndexQuote('^TEST1');
  assert(q.available && q.price === 598 && q.change === 4 && Math.abs(q.changePercent - 0.67) < 0.01, JSON.stringify(q));
  globalThis.fetch = async () => new Response('{}', { status: 404 });
  const bad = await eng.getIdxIndexQuote('^TEST2');
  assert.deepStrictEqual({ ...bad }, { price: null, change: null, changePercent: null, available: false });
  globalThis.fetch = async () => { throw new Error('network'); };
  assert.strictEqual((await eng.getIdxIndexQuote('^TEST3')).available, false);
  globalThis.fetch = realFetch;
});
await t('route /api/idx/indices: LQ45 dan JII dari getIdxIndexQuote; indeks tanpa sumber tetap available:false; tak ada harga hardcoded', () => {
  const s = read('server.js');
  const body = s.match(/app\.get\('\/api\/idx\/indices'[\s\S]*?\n\}\);/)[0];
  assert(/getIdxIndexQuote\('\^JKLQ45'\)/.test(body) && /getIdxIndexQuote\('\^JKII'\)/.test(body));
  assert(/code: 'LQ45'[^\n]*\.\.\.lq45Quote/.test(body) && /code: 'JII'[^\n]*\.\.\.jiiQuote/.test(body));
  ['IDX30', 'KOMPAS100', 'SRI-KEHATI', 'ISSI'].forEach((c) => assert(new RegExp("code: '" + c + "'[^\n]*available: false").test(body), c));
});
globalThis.fetch = realFetch;
console.log(n === total ? `🎉 ALL ${n}/${total} COSTS & INDICES TESTS PASSED` : `⚠️ ${n}/${total}`);
