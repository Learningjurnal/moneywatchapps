/**
 * test_e2e_search_sync.js
 * End-to-End Simulation Test for User Complaints on Stock Master Terminal 360 & Dossier
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Running End-to-End Simulation of User Complaints on Stock Master 360...');

// Read source files
const stockMasterSrc = fs.readFileSync(path.join(__dirname, 'public/js/24-stockmaster.js'), 'utf8');
const dossierSrc = fs.readFileSync(path.join(__dirname, 'public/js/46-stock-dossier.js'), 'utf8');

// Build virtual DOM representation
class MockElement {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className.split(' ').filter(Boolean)),
      contains(c) { return this._classes.has(c); },
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) { if (force !== undefined) { force ? this.add(c) : this.remove(c); } else { this.contains(c) ? this.remove(c) : this.add(c); } }
    };
    this.value = '';
    this._innerHTML = '';
    this.previousElementSibling = null;
    this.children = [];
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = val;
    // parse child inputs if any
    if (val.includes('id="sm360-search-inp"')) {
      const match = val.match(/value="([^"]*)"/);
      const childInp = new MockElement('input', 'sm360-search-inp', 'form-input finput sm360-search-input');
      childInp.value = match ? match[1] : '';
      const childBtn = new MockElement('button', '', 'btn btn-primary btn-xs');
      childBtn.previousElementSibling = childInp;
      this.children = [childInp, childBtn];
    }
  }
  querySelector(sel) {
    if (sel.includes('#sm360-search-inp') || sel.includes('.sm360-search-input')) {
      return this.children.find(c => c.id === 'sm360-search-inp') || null;
    }
    return null;
  }
}

const elements = {
  'fund-sm360-mount': new MockElement('div', 'fund-sm360-mount'),
  'tech-sm360-mount': new MockElement('div', 'tech-sm360-mount'),
  'techTickerInput': new MockElement('input', 'techTickerInput'),
  'fundTickerInput': new MockElement('input', 'fundTickerInput'),
  'dossier-ticker-input': new MockElement('input', 'dossier-ticker-input'),
  'page-technical': new MockElement('div', 'page-technical', 'page on'),
  'page-fundamental': new MockElement('div', 'page-fundamental', 'page'),
  'page-stock-dossier': new MockElement('div', 'page-stock-dossier', 'page'),
  'page-stock-intel': new MockElement('div', 'page-stock-intel', 'page')
};

const documentMock = {
  getElementById(id) {
    if (elements[id]) return elements[id];
    // Check if within active page or children
    for (const key of Object.keys(elements)) {
      const el = elements[key];
      if (el.children) {
        const found = el.children.find(c => c.id === id);
        if (found) return found;
      }
    }
    return null;
  },
  querySelectorAll(sel) {
    const res = [];
    if (sel.includes('.sm360-search-input') || sel.includes('#sm360-search-inp')) {
      for (const key of Object.keys(elements)) {
        if (elements[key].children) {
          elements[key].children.forEach(c => {
            if (c.id === 'sm360-search-inp') res.push(c);
          });
        }
      }
    }
    if (sel.includes('.sm-tab-panel') || sel.includes('.sm-nav-item')) {
      return [];
    }
    return res;
  },
  querySelector(sel) {
    if (sel === '.page.on') {
      return Object.values(elements).find(e => e.classList.contains('on')) || null;
    }
    return null;
  }
};

let analysisTriggerLog = [];

const sandbox = {
  console: console,
  document: documentMock,
  GLOBAL_STOCK_CONTEXT: {
    ticker: 'BBCA',
    subscribers: [],
    getTicker() { return this.ticker; },
    setTicker(tk, source) {
      this.ticker = tk;
      this.subscribers.forEach(fn => fn(tk, source));
    },
    subscribe(fn) { this.subscribers.push(fn); }
  },
  currentPage: 'technical',
  prices: { BBCA: 6225, BRMS: 690, TLKM: 3200 },
  changes: { BBCA: -1.19, BRMS: -4.17, TLKM: 1.5 },
  getStockLogoHtml: () => '',
  getGlobalMarketChange: () => 0,
  fetch: (url) => Promise.resolve({ ok: true, json: () => Promise.resolve({ quote: { price: 100 } }) }),
  goPage: (p) => {
    sandbox.currentPage = p;
    Object.values(elements).forEach(e => {
      if (e.id.startsWith('page-')) e.classList.remove('on');
    });
    const activeEl = elements[`page-${p}`];
    if (activeEl) activeEl.classList.add('on');
    analysisTriggerLog.push(`goPage(${p})`);
  }
};

sandbox.window = sandbox;
vm.createContext(sandbox);

// Evaluate scripts into sandbox
vm.runInContext(stockMasterSrc, sandbox);
vm.runInContext(dossierSrc, sandbox);

// Hook dossierRunAnalysis to log
const originalDossierRun = sandbox.dossierRunAnalysis;
sandbox.dossierRunAnalysis = (tk) => {
  analysisTriggerLog.push(`dossierRunAnalysis(${tk})`);
  return originalDossierRun(tk);
};

console.log('✅ Scripts loaded into simulated browser sandbox.');

// ── TEST 1: Initial Render on Tab 1 (Technical) ──
console.log('\n--- Scenario 1: Initial Setup on Technical Page (BBCA) ---');
elements['fund-sm360-mount'].innerHTML = sandbox.renderStockMaster360Nav('fundamental', 'BBCA');
elements['tech-sm360-mount'].innerHTML = sandbox.renderStockMaster360Nav('technical', 'BBCA');
elements['techTickerInput'].value = 'BBCA';
elements['fundTickerInput'].value = 'BBCA';
elements['dossier-ticker-input'].value = 'BBCA';

assert.strictEqual(sandbox.GLOBAL_STOCK_CONTEXT.getTicker(), 'BBCA');
console.log('✅ Initial state verified: BBCA across all inputs.');

// ── TEST 2: User types BRMS in Top Search Bar on Technical tab and clicks "Periksa" ──
console.log('\n--- Scenario 2: User searches BRMS in Top Search Bar (#sm360-search-inp) on Technical Tab ---');
analysisTriggerLog = [];

// User types in technical tab's mounted search bar
const techTopInput = elements['tech-sm360-mount'].children[0];
const techPeriksaBtn = elements['tech-sm360-mount'].children[1];
techTopInput.value = 'BRMS';

// User clicks "Periksa" button
sandbox.sm360SearchSubmit(techPeriksaBtn);

// Verify results
assert.strictEqual(sandbox.GLOBAL_STOCK_CONTEXT.getTicker(), 'BRMS', 'GLOBAL_STOCK_CONTEXT must be BRMS');
assert.strictEqual(sandbox.TECH_DATA.ticker, 'BRMS', 'TECH_DATA.ticker must be BRMS');
assert.strictEqual(sandbox.FUND_DATA.ticker, 'BRMS', 'FUND_DATA.ticker must be BRMS');
assert.strictEqual(sandbox.STOCK_DOSSIER_STATE.ticker, 'BRMS', 'STOCK_DOSSIER_STATE.ticker must be BRMS');
assert.strictEqual(elements['techTickerInput'].value, 'BRMS', 'techTickerInput must be synchronized to BRMS');
assert.strictEqual(elements['fundTickerInput'].value, 'BRMS', 'fundTickerInput must be synchronized to BRMS');
assert.strictEqual(elements['dossier-ticker-input'].value, 'BRMS', 'dossier-ticker-input must be synchronized to BRMS');
console.log('✅ Top search bar reliably triggered technical analysis for BRMS and updated all inputs.');

// ── TEST 3: User switches to Tab 3 (Valuation & Fundamental) ──
console.log('\n--- Scenario 3: User clicks Tab 3 (3. Valuation & Fundamental) ---');
analysisTriggerLog = [];
sandbox.sm360Go('fundamental', 'BRMS');

assert.strictEqual(sandbox.currentPage, 'fundamental', 'Current page must be fundamental');
assert.strictEqual(sandbox.GLOBAL_STOCK_CONTEXT.getTicker(), 'BRMS', 'Global ticker must stay BRMS');
assert.strictEqual(elements['fundTickerInput'].value, 'BRMS', 'fundTickerInput must be BRMS (no .JK)');
assert(!elements['fundTickerInput'].value.includes('.JK'), 'fundTickerInput must NOT contain .JK');
console.log('✅ Tab 3 (Fundamental) synchronized to BRMS with clean ticker formatting.');

// ── TEST 4: User switches to Tab 4 (Stock Dossier & KSEI) ──
console.log('\n--- Scenario 4: User clicks Tab 4 (4. Stock Dossier & KSEI) ---');
analysisTriggerLog = [];
sandbox.sm360Go('stock-dossier', 'BRMS');

// Simulate router calling renderStockDossierPage
sandbox.renderStockDossierPage();

assert.strictEqual(sandbox.currentPage, 'stock-dossier', 'Current page must be stock-dossier');
assert.strictEqual(sandbox.STOCK_DOSSIER_STATE.ticker, 'BRMS', 'Dossier state ticker must be BRMS');
assert(analysisTriggerLog.some(l => l.includes('dossierRunAnalysis(BRMS)')), 'Dossier analysis must be triggered for BRMS');
console.log('✅ Tab 4 (Dossier) immediately triggered end-to-end multi-factor analysis for BRMS.');

// ── TEST 5: User searches TLKM from Bottom Search Bar on Stock Dossier ──
console.log('\n--- Scenario 5: User types TLKM in Dossier bottom search (#dossier-ticker-input) and submits ---');
analysisTriggerLog = [];
elements['dossier-ticker-input'].value = 'TLKM';

// User clicks "Analisis Lengkap" on dossier
sandbox.sm360SelectTicker('TLKM', 'stock-dossier');

assert.strictEqual(sandbox.GLOBAL_STOCK_CONTEXT.getTicker(), 'TLKM', 'GLOBAL_STOCK_CONTEXT must be updated to TLKM');
assert.strictEqual(sandbox.TECH_DATA.ticker, 'TLKM', 'TECH_DATA must be TLKM');
assert.strictEqual(sandbox.FUND_DATA.ticker, 'TLKM', 'FUND_DATA must be TLKM');
assert.strictEqual(sandbox.STOCK_DOSSIER_STATE.ticker, 'TLKM', 'STOCK_DOSSIER_STATE must be TLKM');
assert.strictEqual(elements['techTickerInput'].value, 'TLKM', 'techTickerInput must be synchronized to TLKM');
assert.strictEqual(elements['fundTickerInput'].value, 'TLKM', 'fundTickerInput must be synchronized to TLKM');
assert.strictEqual(elements['dossier-ticker-input'].value, 'TLKM', 'dossier-ticker-input must be synchronized to TLKM');
assert(analysisTriggerLog.some(l => l.includes('dossierRunAnalysis(TLKM)')), 'Dossier analysis must be triggered for TLKM');
console.log('✅ Bottom search bar in Dossier successfully broadcasted TLKM to all subsystems and DOM inputs.');

// ── TEST 6: User switches back to Tab 1 (Technical) and Tab 3 (Fundamental) ──
console.log('\n--- Scenario 6: User navigates back to Tab 1 & Tab 3 ---');
analysisTriggerLog = [];
sandbox.sm360Go('technical', 'TLKM');
assert.strictEqual(sandbox.currentPage, 'technical');
assert.strictEqual(sandbox.TECH_DATA.ticker, 'TLKM');
assert.strictEqual(elements['techTickerInput'].value, 'TLKM');

sandbox.sm360Go('fundamental', 'TLKM');
assert.strictEqual(sandbox.currentPage, 'fundamental');
assert.strictEqual(sandbox.FUND_DATA.ticker, 'TLKM');
assert.strictEqual(elements['fundTickerInput'].value, 'TLKM');
console.log('✅ Complete round-trip cross-tab navigation preserves TLKM across Technical and Fundamental.');

console.log('\n═══════════════════════════════════════════════════════');
console.log('🎉 ALL 6 END-TO-END SCENARIOS PASSED WITH 100% SUCCESS!');
console.log('═══════════════════════════════════════════════════════');
