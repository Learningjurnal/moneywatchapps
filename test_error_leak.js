/** test_error_leak.js — server.js tidak boleh membocorkan err.message mentah ke klien. */
import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
const src = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
const a = src.indexOf('function publicErrorMessage');
const b = src.indexOf('// API health endpoint');
assert(a > 0 && b > a, 'helper tidak ditemukan');
const logs = [];
const sb = { String, console: { error: (...x) => logs.push(x.join(' ')) } };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + '\nthis.f = publicErrorMessage;', sb);
const f = sb.f;
let n = 0, total = 0;
const t = (name, fn) => { total++; try { fn(); console.log('  ✅ [PASS] ' + name); n++; } catch (e) { console.error('  ❌ [FAIL] ' + name + ': ' + e.message); process.exitCode = 1; } };
t('body upstream / path / kunci tidak ikut ke klien', () => {
  assert.strictEqual(f(new Error('GEMINI_HTTP_403: {"error":"API key AIzaSyXXXX invalid for project 123"}')), 'GEMINI_HTTP_403');
  assert.strictEqual(f(new Error('ENOENT: no such file or directory, open C:\srv\data\secret.json')), 'Terjadi kesalahan pada server. Silakan coba lagi.');
  assert.strictEqual(f(new Error('connect ECONNREFUSED 10.0.0.5:6379'), 'Gagal memuat X'), 'Gagal memuat X');
});
t('kode galat murni tetap diteruskan; null/undefined aman', () => {
  assert.strictEqual(f(new Error('OPENROUTER_EMPTY_RESPONSE')), 'OPENROUTER_EMPTY_RESPONSE');
  assert.strictEqual(f(undefined, 'fb'), 'fb');
  assert.strictEqual(f(null), 'Terjadi kesalahan pada server. Silakan coba lagi.');
});
t('detail lengkap tetap tercatat di log server (dipotong 500 karakter)', () => {
  logs.length = 0; f(new Error('x'.repeat(900)));
  assert(logs.length === 1 && logs[0].length < 530);
});
t('tidak ada lagi "error|message: err.message" mentah di server.js (kecuali validasi 400)', () => {
  const bad = src.split('\n').filter((l) => /\b(error|message): (err|error|e)\??\.message/.test(l) && !/res\.status\(400\)/.test(l));
  assert.strictEqual(bad.length, 0, bad.slice(0, 3).join(' | '));
});
console.log(n === total ? `🎉 ALL ${n}/${total} ERROR LEAK TESTS PASSED` : `⚠️ ${n}/${total}`);
