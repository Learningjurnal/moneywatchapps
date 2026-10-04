/**
 * test_rebalance_merge.js — 2026-10-04 ("periksa semua layout yang double2"):
 * rebalancing punya dua pintu: modal "Smart Rebalancer" (alokasi antar KELAS ASET,
 * dibuka dari halaman Performance) dan halaman Rebalance (bobot antar SAHAM).
 * Kini satu halaman Rebalance dengan tab "Kelas Aset"; modal dihapus.
 */

import assert from 'assert';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); console.log(`  ✅ [PASS] ${name}`); passed++; } catch (err) { console.error(`  ❌ [FAIL] ${name}: ${err.message}`); process.exitCode = 1; }
}

// DOM minimal: elemen berdasarkan id, nilai input mengikuti HTML yang dirender.
function makeEnv({ portfolio = [{ mv: 600 }] } = {}) {
  const els = {};
  const container = { innerHTML: '' };
  const sb = {
    console, Math, JSON, Object, Array, String, Number, Date, parseFloat, parseInt, isFinite,
    fmt: (n) => String(Math.round(n)),
    el: (id) => (id === 'page-rebalance' ? container : null),
    getPortfolio: () => portfolio,
    calcRdnBalance: () => 0,
    // AUM 1000 = saham 600 + RDN 150 + reksa dana 150 + ETF 50 + crypto 50 (dibaca lewat fungsi asli 23-advisor.js)
    computeCurrentAUM: () => 1000,
    rdnBalance: 150,
    getRdPortfolio: () => [{ val: 150 }],
    getEtfPortfolio: () => [{ mvIdr: 50 }],
    getCryptoPortfolio: () => [{ mv: 50 }],
    goPage: (p) => { sb.__went = p; },
    document: {
      getElementById: (id) => {
        if (id.startsWith('reb-t-')) {
          const m = container.innerHTML.match(new RegExp('id="' + id + '" value="([^"]*)"'));
          return m ? { value: m[1] } : null;
        }
        if (!els[id]) els[id] = { textContent: '', className: '', innerHTML: '' };
        return els[id];
      },
      querySelectorAll: () => [], addEventListener() {}
    },
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read('public/js/23-advisor.js'), ctx);
  vm.runInContext(read('public/js/28-decisiontools.js'), ctx);
  return { sb, els, container };
}

console.log('🧪 REBALANCING — SATU HALAMAN (tab Kelas Aset), TANPA MODAL TERPISAH');

await test('modal rebalancing lama dihapus dan tombol Performance membuka halaman Rebalance tab Kelas Aset', () => {
  ['public/js/23-advisor.js', 'public/js/28-decisiontools.js', 'public/index.html'].forEach((f) => {
    assert(!/openRebalancingModal/.test(read(f)), 'openRebalancingModal masih ada di ' + f);
  });
  assert(/onclick="goRebalanceAssetClass\(\)"/.test(read('public/index.html')), 'tombol Smart Rebalancer harus memanggil goRebalanceAssetClass()');
});

await test('goRebalanceAssetClass(): mengaktifkan tab Kelas Aset lalu membuka halaman rebalance', () => {
  const { sb } = makeEnv();
  sb.goRebalanceAssetClass();
  assert.strictEqual(vm.runInContext('_rebalanceMode', vm.createContext(sb)), 'assetclass');
  assert.strictEqual(sb.__went, 'rebalance');
});

await test('tab Kelas Aset tampil walau portofolio saham KOSONG (RDN/reksa dana/ETF/crypto tetap dihitung)', () => {
  const { sb, container, els } = makeEnv({ portfolio: [] });
  vm.runInContext("_rebalanceMode = 'assetclass'", vm.createContext(sb));
  sb.renderRebalancePage();
  assert(container.innerHTML.includes('Target Alokasi vs Alokasi Saat Ini'), 'bagian kelas aset harus tampil');
  assert(!container.innerHTML.includes('Belum Ada Posisi Portofolio Aktif'), 'tidak boleh tertahan kartu "portofolio kosong"');
  ['saham', 'rdn', 'rd', 'etf', 'crypto'].forEach((k) => assert(container.innerHTML.includes('id="reb-t-' + k + '"'), 'input target ' + k + ' hilang'));
  assert(els['reb-instructions-body'].innerHTML.includes('<table'), 'instruksi eksekusi harus dihitung saat render');
});

await test('tiga tab (Equal Weight, Target Kustom, Kelas Aset) ada dan hanya satu yang aktif', () => {
  const { sb, container } = makeEnv({ portfolio: [] });
  vm.runInContext("_rebalanceMode = 'assetclass'", vm.createContext(sb));
  sb.renderRebalancePage();
  const html = container.innerHTML;
  ['Equal Weight', 'Target Kustom', 'Kelas Aset'].forEach((t) => assert(html.includes(t), 'tab ' + t + ' tidak ada'));
  assert.strictEqual((html.match(/sm-nav-item active/g) || []).length, 1, 'tepat satu tab aktif');
  assert(/sm-nav-item active[^>]*setRebalanceMode\('assetclass'\)/.test(html), 'tab aktif harus Kelas Aset');
});

await test('instruksi eksekusi: aset di target = seimbang; selisih besar = beli/jual dengan nilai yang benar', () => {
  const { sb, els } = makeEnv({ portfolio: [{ mv: 600 }] });
  // AUM 1000: saham 600 (target 60) seimbang; RDN 150 (target 15) seimbang; reksa dana 150 (15); ETF 50 (5); crypto 50 (5)
  vm.runInContext("_rebalanceMode = 'assetclass'", vm.createContext(sb));
  sb.renderRebalancePage();
  const bodyHtml = els['reb-instructions-body'].innerHTML;
  assert(bodyHtml.includes('Rp 600') && bodyHtml.includes('Rp 150'), 'nilai aktual harus dibaca dari data (bukan 0): ' + bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 160));
  assert((bodyHtml.match(/Sudah Seimbang/g) || []).length === 5, 'semua aset harus seimbang pada target bawaan');
  vm.runInContext('REBALANCE_TARGETS.saham = 100000', vm.createContext(sb)); // target ekstrem agar selisih > 50.000
  sb.renderRebalancePage();
  assert(/Beli \/ Top-Up Rp/.test(els['reb-instructions-body'].innerHTML), 'selisih positif harus jadi instruksi beli');
});

await test('mode saham (Equal/Custom) tidak berubah: portofolio kosong tetap menampilkan kartu kosong', () => {
  const { sb, container } = makeEnv({ portfolio: [] });
  sb.renderRebalancePage(); // mode bawaan 'equal'
  assert(container.innerHTML.includes('Belum Ada Posisi Portofolio Aktif'));
});

console.log(passed === total ? `🎉 ALL ${passed}/${total} REBALANCE MERGE TESTS PASSED` : `⚠️  ${passed}/${total} PASSED`);
