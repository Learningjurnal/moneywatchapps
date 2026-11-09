/**
 * test_hypothesis_lab.js — Test suite untuk Autonomous Hypothesis Lab Engine
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getHypothesisCatalog,
  INITIAL_HYPOTHESES,
  evaluateHypothesisStatistically
} from './lib/engine/hypothesis-lab.js';

const CATALOG_FILE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data', 'hypotheses_catalog.json');

// Field hasil pengujian yang TIDAK BOLEH berisi angka pada katalog bawaan.
// Semuanya harus null sampai ada evaluasi empiris riil (FAB-01 regression guard).
const FORBIDDEN_INITIAL_STAT_FIELDS = [
  'testedAt',
  'sampleSize',
  'winRatePct',
  'meanExcessReturnPct',
  'lowerConfidenceInterval',
  'upperConfidenceInterval',
  'pValue'
];
const REQUIRED_DEFINITION_FIELDS = ['id', 'title', 'statement', 'strategyRef', 'horizonDays', 'minVolumeRp'];

function assertHonestDefinition(h, label) {
  assert.ok(h && typeof h === 'object', `${label}: entri hipotesis harus objek`);
  REQUIRED_DEFINITION_FIELDS.forEach((field) => {
    const value = h[field];
    assert.ok(value !== undefined && value !== null && value !== '', `${label}: field definisi '${field}' wajib ada`);
  });
  assert.ok(typeof h.statement === 'string' && h.statement.length > 20, `${label}: statement harus berupa kalimat hipotesis yang bisa difalsifikasi`);
  assert.strictEqual(h.status, 'NOT_TESTED', `${label}: katalog bawaan harus berstatus NOT_TESTED (belum pernah dievaluasi dengan data riil)`);
  FORBIDDEN_INITIAL_STAT_FIELDS.forEach((field) => {
    assert.strictEqual(
      h[field],
      null,
      `${label}: '${field}' harus null — angka statistik karangan tidak boleh kembali ke katalog bawaan`
    );
  });
  assert.ok(typeof h.notes === 'string' && h.notes.length > 20, `${label}: notes wajib menjelaskan status & cara evaluasinya`);
  assert.ok(/belum pernah diuji/i.test(h.notes), `${label}: notes harus menyatakan hipotesis belum pernah diuji`);
  assert.ok(!/EDGE TERBUKTI|terbukti signifikan/i.test(h.notes), `${label}: notes tidak boleh mengklaim edge/statistik yang belum diuji`);
}

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 TEST: AUTONOMOUS HYPOTHESIS LAB');
console.log('═══════════════════════════════════════════════════════');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

test('getHypothesisCatalog: hanya definisi hipotesis JUJUR — NOT_TESTED, tanpa angka statistik apa pun', () => {
  // 1) Definisi bawaan yang dikirim aplikasi (fallback katalog) tidak boleh memuat
  //    sampleSize/winRate/CI/pValue/testedAt/klaim "EDGE TERBUKTI" karangan (FAB-01).
  assert.ok(Array.isArray(INITIAL_HYPOTHESES), 'INITIAL_HYPOTHESES harus berupa array');
  assert.ok(INITIAL_HYPOTHESES.length >= 4, 'Minimal 4 definisi hipotesis default institusional');
  INITIAL_HYPOTHESES.forEach((h, i) => assertHonestDefinition(h, `INITIAL_HYPOTHESES[${i}] (${h && h.id})`));

  const ids = INITIAL_HYPOTHESES.map((h) => h.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id hipotesis harus unik agar POST /api/ai/hypotheses/test bisa menargetkan satu hipotesis');
  assert.ok(
    !INITIAL_HYPOTHESES.some((h) => ['ACCEPTED', 'REJECTED'].includes(h.status)),
    'Katalog bawaan tidak boleh berisi status hasil uji (ACCEPTED/REJECTED)'
  );

  // 2) Selama file hasil evaluasi riil belum ada, getHypothesisCatalog() harus
  //    mengembalikan definisi jujur yang sama — bukan angka pengganti.
  if (!fs.existsSync(CATALOG_FILE_PATH)) {
    const catalog = getHypothesisCatalog();
    assert.ok(Array.isArray(catalog), 'Katalog harus berupa array');
    assert.strictEqual(catalog.length, INITIAL_HYPOTHESES.length, 'Tanpa file data, katalog bawaan = definisi hipotesis jujur');
    catalog.forEach((h, i) => assertHonestDefinition(h, `getHypothesisCatalog()[${i}] (${h && h.id})`));
  }
});

test('evaluateHypothesisStatistically: menolak evaluasi jika sampel data < 10', () => {
  const hypo = { id: 'TEST-1', title: 'Test Sample Kecil' };
  const res = evaluateHypothesisStatistically(hypo, [2.0, 3.0, -1.0]);
  assert.strictEqual(res.status, 'DATA_INSUFFICIENT');
  assert.strictEqual(res.sampleSize, 3);
});

test('evaluateHypothesisStatistically: memberi status ACCEPTED bila lower CI > 0 setelah biaya 0.40%', () => {
  const hypo = { id: 'TEST-2', title: 'Test Edge Kuat' };
  // Sampel return positif kuat (semua > +1.5%)
  const returns = [3.5, 4.0, 2.8, 5.1, 3.9, 6.2, 4.4, 3.1, 5.0, 4.2, 3.8, 4.9];
  const res = evaluateHypothesisStatistically(hypo, returns, 0.5);

  assert.strictEqual(res.status, 'ACCEPTED');
  assert.ok(res.meanExcessReturnPct > 0);
  assert.ok(res.lowerConfidenceInterval > 0);
  assert.ok(res.pValue < 0.05);
});

test('evaluateHypothesisStatistically: memberi status REJECTED bila sinyal tergerus biaya transaksi', () => {
  const hypo = { id: 'TEST-3', title: 'Test Tanpa Edge' };
  // Sampel tipis (di bawah 0.40% atau negatif)
  const returns = [0.2, -0.5, 0.1, -1.2, 0.3, -0.4, 0.2, -0.8, 0.0, -0.1, 0.3, -0.2];
  const res = evaluateHypothesisStatistically(hypo, returns, 0.0);

  assert.strictEqual(res.status, 'REJECTED');
  assert.ok(res.lowerConfidenceInterval <= 0);
});

console.log('═══════════════════════════════════════════════════════');
console.log(`🎉 ALL ${passedTests}/${totalTests} HYPOTHESIS LAB TESTS PASSED`);
console.log('═══════════════════════════════════════════════════════');
