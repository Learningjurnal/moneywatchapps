// Memuat mesin portofolio asli (public/js/*.js) ke vm Node tanpa browser, supaya matematika fee/pajak/posisi/PnL/RDN
// bisa diuji dengan urutan transaksi acak lewat fungsi ASLI aplikasi.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const FILES = ['00-config.js', '01-data.js', '02-storage.js', '03-engine.js', '05-assets.js', '21-performance.js'];

function deepStub() {
  const noop = () => {};
  const handler = {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : deepStub()),
    set: () => true,
    apply: () => deepStub(),
    construct: () => deepStub()
  };
  const stub = new Proxy(noop, handler);
  return stub;
}

export function createPortfolioSandbox(rootDir) {
  const store = {};
  const noop = () => {};
  const element = deepStub();
  const sandbox = {
    console: { log: noop, warn: noop, error: noop, info: noop },
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    Date, Math, JSON, Number, String, Array, Object, Promise, RegExp, Error, Map, Set, Symbol, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, Intl,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: () => null, length: 0 },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => element, body: element, documentElement: element, readyState: 'complete', head: element },
    navigator: { userAgent: 'node' }, location: { href: '', hostname: 'localhost', protocol: 'http:' },
    alert: noop, confirm: () => true, prompt: () => null,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addListener: noop }), requestAnimationFrame: noop,
    Chart: deepStub(), XLSX: {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    showSaveStatus: noop, showToast: noop
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const loadErrors = [];
  for (const file of FILES) {
    try {
      vm.runInContext(fs.readFileSync(path.join(rootDir, 'public/js', file), 'utf8'), sandbox, { filename: file });
    } catch (error) {
      loadErrors.push(`${file}: ${error.message}`);
    }
  }
  return { sandbox, store, loadErrors };
}
