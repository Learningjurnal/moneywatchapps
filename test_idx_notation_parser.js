/**
 * test_idx_notation_parser.js — regresi 2026-10-04: fallback idx.co.id untuk Regulatory Health Gate
 * mengekstrak 0 dari 121 emiten bernotasi khusus dari respons ASLI tetapi tetap melapor "tersedia",
 * sehingga seluruh 965 emiten dianggap CLEAR (fail-OPEN) bila Invezgo gagal/tidak dikonfigurasi.
 * Fixture = respons GetSpecialNotation asli yang ditangkap 2026-10-04 (ResultCount 121).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'idx-special-notation-2026-10-04.json'), 'utf8'));

delete process.env.INVEZGO_API_KEY; // gate harus memakai fallback idx.co.id
const originalFetch = global.fetch;

const idx = await import('./lib/providers/idx-client.js');
const { getRegulatoryHealthGate } = await import('./lib/regulatory-gate.js');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}

// Mock idx.co.id: sesi, notasi, dan watchlist diatur per skenario.
function mockIdx({ notation, watchlist = { status: 403 } }) {
  const respond = (def) => {
    if (def.html) return { ok: def.status ? def.status < 400 : true, status: def.status || 200, headers: { getSetCookie: () => [] }, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); }, text: async () => '<html>' };
    return { ok: def.status ? def.status < 400 : true, status: def.status || 200, headers: { getSetCookie: () => ['sid=1'] }, json: async () => def.json };
  };
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('GetSpecialNotation')) return respond(notation);
    if (u.includes('GetWatchlistStock')) return respond(watchlist);
    return respond({ status: 200, json: {} }); // /id dan GetIndexList (sesi)
  };
}
const fresh = async () => { idx._resetSpecialNotationCacheForTests(); return idx.fetchIdxSpecialNotations(true); };

console.log('🧪 IDX NOTASI KHUSUS — PARSER & FAIL-CLOSED');

await test('respons ASLI (121 emiten): semua terekstrak, termasuk yang bernotasi ganda "E,X" (dulu 0 dari 121)', () => {
  const p = idx.parseIdxNotationPayload(FIXTURE);
  assert.strictEqual(p.recognized, true);
  assert.strictEqual(p.complete, true);
  assert.strictEqual(p.expectedCount, 121);
  const rows = Object.values(p.byTicker);
  assert.strictEqual(rows.length, 121, 'seluruh 121 emiten harus terekstrak');
  assert.strictEqual(rows.filter((r) => r.notations.length > 1).length, 99, '99 emiten bernotasi ganda harus dipecah per huruf');
  const mdrn = p.byTicker.MDRN;
  assert.deepStrictEqual(mdrn.notations, ['E', 'X']);
  assert.strictEqual(mdrn.isWatchlist, true, 'huruf X = Papan Pemantauan Khusus');
  assert.strictEqual(mdrn.isHighRisk, true);
  assert(/ekuitas negatif/i.test(mdrn.details.find((d) => d.notation === 'E').desc), 'deskripsi per huruf harus diambil dari kolom Description');
});

await test('jumlah per huruf notasi sama dengan hitungan independen dari fixture', () => {
  const expected = {};
  FIXTURE.Results.forEach((r) => String(r.Notation).split(/[,\s]+/).filter(Boolean).forEach((c) => { expected[c] = (expected[c] || 0) + 1; }));
  const got = {};
  Object.values(idx.parseIdxNotationPayload(FIXTURE).byTicker).forEach((r) => r.notations.forEach((c) => { got[c] = (got[c] || 0) + 1; }));
  assert.deepStrictEqual(got, expected);
});

await test('bentuk tak dikenali / terpotong tidak dianggap "0 notasi"; daftar kosong yang sah (ResultCount 0) dikenali', () => {
  assert.strictEqual(idx.parseIdxNotationPayload({ foo: 1 }).recognized, false);
  assert.strictEqual(idx.parseIdxNotationPayload(null).recognized, false);
  assert.strictEqual(idx.parseIdxNotationPayload({ Results: [{ Id: 1, Foo: 'x' }] }).recognized, false, 'record tanpa kode emiten = skema tak dikenali');
  const truncated = { ResultCount: 121, Results: FIXTURE.Results.slice(0, 10) };
  const t = idx.parseIdxNotationPayload(truncated);
  assert.strictEqual(t.recognized, true);
  assert.strictEqual(t.complete, false, 'record < ResultCount = terpotong');
  const empty = idx.parseIdxNotationPayload({ ResultCount: 0, Results: [] });
  assert.strictEqual(empty.recognized, true);
  assert.strictEqual(empty.complete, true);
});

await test('fetch: notasi 200 lengkap + watchlist 403 => tersedia dengan 121 emiten', async () => {
  mockIdx({ notation: { json: FIXTURE } });
  const r = await fresh();
  assert.strictEqual(r.available, true);
  assert.strictEqual(Object.keys(r.byTicker).length, 121);
});

await test('fetch FAIL-CLOSED: 200 berisi HTML / skema tak dikenali / terpotong => TIDAK tersedia (bukan "0 notasi")', async () => {
  mockIdx({ notation: { html: true } });
  let r = await fresh();
  assert.strictEqual(r.available, false, '200 HTML harus gagal');
  mockIdx({ notation: { json: { SomethingElse: [] } } });
  r = await fresh();
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.reason, 'IDX_NOTATION_SCHEMA_UNRECOGNIZED');
  mockIdx({ notation: { json: { ResultCount: 121, Results: FIXTURE.Results.slice(0, 10) } } });
  r = await fresh();
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.reason, 'IDX_NOTATION_INCOMPLETE');
});

await test('fetch FAIL-CLOSED: watchlist 200 saja (notasi utama 403) TIDAK cukup menyatakan data tersedia', async () => {
  mockIdx({ notation: { status: 403, json: {} }, watchlist: { json: { Results: [{ EmitenCode: 'MDRN' }] } } });
  const r = await fresh();
  assert.strictEqual(r.available, false, 'watchlist hanya pengayaan; tanpa notasi utama emiten E/B/D/dst. akan lolos');
});

await test('gate: respons asli => MDRN FLAGGED (tidak layak), BBCA CLEAR; respons rusak => semua DATA_ERROR (bukan CLEAR)', async () => {
  mockIdx({ notation: { json: FIXTURE } });
  idx._resetSpecialNotationCacheForTests();
  let g = await getRegulatoryHealthGate(['MDRN', 'BBCA'], true);
  assert.strictEqual(g.dataAvailable, true);
  assert.strictEqual(g.byTicker.MDRN.status, 'FLAGGED');
  assert.strictEqual(g.byTicker.MDRN.eligible, false);
  assert.strictEqual(g.byTicker.BBCA.status, 'CLEAR');

  mockIdx({ notation: { json: { SomethingElse: [] } } });
  idx._resetSpecialNotationCacheForTests();
  g = await getRegulatoryHealthGate(['MDRN', 'BBCA'], true);
  assert.strictEqual(g.dataAvailable, false);
  assert.strictEqual(g.byTicker.MDRN.status, 'DATA_ERROR');
  assert.strictEqual(g.byTicker.BBCA.status, 'DATA_ERROR', 'skema rusak tidak boleh meloloskan emiten sebagai CLEAR');
  assert.strictEqual(g.byTicker.BBCA.eligible, false);
});

global.fetch = originalFetch;
idx._resetSpecialNotationCacheForTests();

console.log(passed === total ? `🎉 ALL ${passed}/${total} IDX NOTATION TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
