/** test_proxy_ssrf.js — isSafeProxyUrl ASLI di server.js (bukan salinan) harus berbasis allowlist host. */
import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
const src = fs.readFileSync(new URL('./server.js', import.meta.url), 'utf8');
const a = src.indexOf('const PROXY_ALLOWED_HOSTS');
const b = src.indexOf('const proxyCache');
assert(a > 0 && b > a, 'allowlist proxy tidak ditemukan di server.js');
const code = src.slice(a, b).replace('export function', 'function');
const sb = { URL }; vm.createContext(sb);
vm.runInContext(code + '\nthis.f = isSafeProxyUrl;', sb);
const ok = sb.f;
let n = 0;
const t = (name, fn) => { try { fn(); console.log('  ✅ [PASS] ' + name); n++; } catch (e) { console.error('  ❌ [FAIL] ' + name + ': ' + e.message); process.exitCode = 1; } };
t('host data yang dipakai klien diizinkan', () => {
  assert(ok('https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?range=1y'));
  assert(ok('https://query2.finance.yahoo.com/v7/finance/quote?symbols=X'));
  assert(ok('https://s.tradingview.com/search'));
});
t('host publik sembarang ditolak (bukan open relay)', () => {
  assert(!ok('https://example.com/'));
  assert(!ok('https://evil.com/?https://query1.finance.yahoo.com'));
  assert(!ok('https://query1.finance.yahoo.com.evil.com/'));
});
t('IP privat, metadata cloud, IPv6-mapped, localhost ditolak', () => {
  ['http://localhost:3000/', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:7f00:1]/', 'http://[::1]/', 'http://0x7f000001/', 'http://2130706433/', 'http://10.0.0.1/'].forEach((u) => assert(!ok(u), u));
});
t('protokol non-http dan kredensial dalam URL ditolak', () => {
  assert(!ok('file:///etc/passwd'));
  assert(!ok('ftp://query1.finance.yahoo.com/'));
  assert(!ok('https://user:pw@query1.finance.yahoo.com/'));
  assert(!ok('bukan url'));
});
console.log(n === 4 ? '🎉 ALL 4/4 PROXY SSRF TESTS PASSED' : '⚠️ ' + n + '/4');
