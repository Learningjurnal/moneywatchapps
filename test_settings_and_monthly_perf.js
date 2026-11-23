import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('====================================================');
console.log('🧪 TEST: SETTINGS CATEGORIZATION & MONTHLY PERFORMANCE');
console.log('====================================================');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

// 1. Check index.html markup
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

test('index.html contains Performance Bulanan button in sidebar under PORTFOLIO', () => {
  assert.ok(indexHtml.includes("onclick=\"goPage('perf-monthly',this)\""), 'Sidebar must have goPage("perf-monthly",this)');
  assert.ok(indexHtml.includes('Performance Bulanan'), 'Sidebar button label must be Performance Bulanan');
  assert.ok(indexHtml.includes('ti-calendar-stats'), 'Sidebar button icon must be ti-calendar-stats');
});

test('index.html contains perf-monthly-section inside page-performance', () => {
  assert.ok(indexHtml.includes('id="perf-monthly-section"'), 'Page must have perf-monthly-section container');
  assert.ok(indexHtml.includes('id="perfMonthlyChart"'), 'Page must have perfMonthlyChart canvas');
  assert.ok(indexHtml.includes('id="perf-monthly-matrix-wrap"'), 'Page must have perf-monthly-matrix-wrap container');
  assert.ok(indexHtml.includes('id="perf-monthly-table-wrap"'), 'Page must have perf-monthly-table-wrap container');
  assert.ok(indexHtml.includes('id="perf-monthly-kpis"'), 'Page must have perf-monthly-kpis container');
});

// 2. Check 06-analysis-router.js routing
const routerJs = fs.readFileSync(path.join(__dirname, 'public', 'js', '06-analysis-router.js'), 'utf8');

test('06-analysis-router.js maps perf-monthly to performance page with scroll', () => {
  assert.ok(routerJs.includes("name === 'perf-monthly' ? 'performance'"), 'Router targetPageName must map perf-monthly to performance');
  assert.ok(routerJs.includes("perf-monthly-section"), 'Router must scroll to perf-monthly-section');
  assert.ok(routerJs.includes("case 'perf-monthly':renderPerformance();break;"), 'Router renderPage must handle case perf-monthly');
});

// 3. Test 21-performance.js monthly calculations
const perfJs = fs.readFileSync(path.join(__dirname, 'public', 'js', '21-performance.js'), 'utf8');

test('21-performance.js defines perfComputeMonthlyBreakdown & perfRenderMonthlyReturn', () => {
  assert.ok(perfJs.includes('function perfComputeMonthlyBreakdown()'), 'Must define perfComputeMonthlyBreakdown');
  assert.ok(perfJs.includes('function perfRenderMonthlyReturn('), 'Must define perfRenderMonthlyReturn');
  assert.ok(perfJs.includes('function perfSetMonthlyYear('), 'Must define perfSetMonthlyYear');
});

test('perfComputeMonthlyBreakdown correctly groups transactions and dividends per month', () => {
  const sandbox = {
    transactions: [
      { id: 1, date: '2026-10-05', ticker: 'BBCA', type: 'BUY', lot: 10, gross: 10000000, net: 10018000 },
      { id: 2, date: '2026-10-20', ticker: 'BBCA', type: 'SELL', lot: 10, gross: 11000000, net: 10969200 },
      { id: 3, date: '2026-11-02', ticker: 'BMRI', type: 'BUY', lot: 20, gross: 14000000, net: 14025200 },
      { id: 4, date: '2026-11-15', ticker: 'BMRI', type: 'SELL', lot: 20, gross: 13000000, net: 12963600 }
    ],
    dividends: [
      { date: '2026-10-25', ticker: 'BBCA', net: 250000 },
      { date: '2026-11-20', ticker: 'BMRI', net: 300000 }
    ],
    rdnMutations: [
      { date: '2026-10-01', type: 'SETOR', amount: 50000000 },
      { date: '2026-11-10', type: 'TARIK', amount: 10000000 }
    ],
    calcChronologicalTxMetrics: () => ({
      2: { pnlNet: 951200 },
      4: { pnlNet: -1061600 }
    }),
    window: {},
    console: console
  };

  const codeToRun = perfJs + `
    var res = perfComputeMonthlyBreakdown();
  `;
  vm.createContext(sandbox);
  vm.runInContext(codeToRun, sandbox);

  const res = sandbox.res;
  assert.strictEqual(res.length, 2, 'Should have exactly 2 months');
  
  // Month 2026-10
  const m10 = res.find(r => r.month === '2026-10');
  assert.ok(m10, 'Must have month 2026-10');
  assert.strictEqual(m10.capitalGain, 951200, 'October capital gain must match metrics pnlNet');
  assert.strictEqual(m10.dividend, 250000, 'October dividend must be 250000');
  assert.strictEqual(m10.totalReturn, 1201200, 'October total return must be 1201200');
  assert.strictEqual(m10.sellTrades, 1);
  assert.strictEqual(m10.winTrades, 1);
  assert.strictEqual(m10.winRate, 100);
  assert.strictEqual(m10.netCashFlow, 50000000);

  // Month 2026-11
  const m11 = res.find(r => r.month === '2026-11');
  assert.ok(m11, 'Must have month 2026-11');
  assert.strictEqual(m11.capitalGain, -1061600, 'November capital gain must match metrics pnlNet');
  assert.strictEqual(m11.dividend, 300000, 'November dividend must be 300000');
  assert.strictEqual(m11.totalReturn, -761600, 'November total return must be -761600');
  assert.strictEqual(m11.sellTrades, 1);
  assert.strictEqual(m11.lossTrades, 1);
  assert.strictEqual(m11.winRate, 0);
  assert.strictEqual(m11.netCashFlow, -10000000);
});

// 4. Test 35-settings.js categorization and feature preservation
const settingsJs = fs.readFileSync(path.join(__dirname, 'public', 'js', '35-settings.js'), 'utf8');

test('35-settings.js defines tab switching and categorizes views strictly matching selected tab', () => {
  const domElements = {};
  const queryList = [];

  function makeEl(id, tagName = 'div', className = '', attrs = {}) {
    const el = {
      id: id || '',
      tagName: tagName.toUpperCase(),
      className: className,
      classList: {
        classes: new Set(className.split(' ').filter(Boolean)),
        add(c) { this.classes.add(c); el.className = Array.from(this.classes).join(' '); },
        remove(c) { this.classes.delete(c); el.className = Array.from(this.classes).join(' '); },
        contains(c) { return this.classes.has(c); }
      },
      style: {},
      attributes: { ...attrs },
      getAttribute(k) { return this.attributes[k] || null; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      innerHTML: '',
      value: '10',
      checked: true
    };
    if (id) domElements[id] = el;
    queryList.push(el);
    return el;
  }

  // Pre-create sections for the categories
  const catNames = ['fundamental', 'tax', 'fire', 'wealth', 'system', 'telemetry'];
  const catSections = catNames.map(cat => {
    const isGrid = (cat === 'wealth' || cat === 'system' || cat === 'telemetry');
    const cls = isGrid ? 'settings-cat-section settings-cat-grid' : 'settings-cat-section';
    const el = makeEl(`cat-sec-${cat}`, 'div', cls, { 'data-cat': cat });
    el.style.display = (cat === 'fundamental') ? 'block' : 'none';
    return el;
  });

  const tabButtons = [...catNames, 'all'].map(tab => {
    const el = makeEl(`tab-btn-${tab}`, 'button', 'settings-tab-btn' + (tab === 'fundamental' ? ' active' : ''), { 'data-tab': tab });
    return el;
  });

  const sandbox = {
    document: {
      getElementById: (id) => domElements[id] || makeEl(id),
      querySelector: (sel) => queryList.find(el => el.id === sel.replace('#', '')),
      querySelectorAll: (sel) => {
        if (sel.includes('.settings-cat-section')) return catSections;
        if (sel.includes('.settings-tab-btn')) return tabButtons;
        return [];
      }
    },
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] || null; },
      setItem(k, v) { this._store[k] = String(v); }
    },
    fmt: (n) => String(n || 0),
    escHtml: (s) => String(s || ''),
    wCalc: () => ({ net: 1000000000, bankTotal: 50000000 }),
    WEALTH: { bank: [{ name: 'BCA', saldo: 50000000, type: 'Tabungan' }], debt: [] },
    TAX_SETTINGS: {},
    SEKURITAS: {},
    window: {},
    console: console,
    fetch: async () => ({ json: async () => ({ success: true }) })
  };

  vm.createContext(sandbox);
  vm.runInContext(settingsJs, sandbox);

  const MW = sandbox.window.MW_SETTINGS;
  assert.ok(MW, 'MW_SETTINGS must be exported to window');
  assert.ok(typeof MW.switchSettingsTab === 'function', 'MW_SETTINGS.switchSettingsTab must be a function');
  assert.ok(typeof MW.setTab === 'function', 'MW_SETTINGS.setTab must be an alias of switchSettingsTab');
  assert.ok(typeof MW.renderSettingsPage === 'function', 'MW_SETTINGS.renderSettingsPage must be a function');

  // Verify renderSettingsPage generates HTML with all preserved features
  MW.renderSettingsPage();
  const pageHtml = domElements['page-settings'] ? domElements['page-settings'].innerHTML : '';
  assert.ok(pageHtml.includes('v6-form-fundamental-override'), 'Preserves fundamental override form');
  assert.ok(pageHtml.includes('v6-form-tax-settings'), 'Preserves tax settings form');
  assert.ok(pageHtml.includes('v6-form-fire-settings'), 'Preserves FIRE settings form');
  assert.ok(pageHtml.includes('new-v6-bank-name'), 'Preserves bank account management');
  assert.ok(pageHtml.includes('new-v6-debt-name'), 'Preserves debt liability management');
  assert.ok(pageHtml.includes('exportJsonBackup'), 'Preserves export backup feature');
  assert.ok(pageHtml.includes('quota-invezgo-box'), 'Preserves Invezgo quota widget');
  assert.ok(pageHtml.includes('quota-dq-box'), 'Preserves Data Quality Gate widget');

  // Helper to check which categories are displayed
  function getVisibleCategories() {
    return catSections.filter(sec => sec.style.display !== 'none').map(sec => sec.getAttribute('data-cat'));
  }

  // Test 1: Category 'tax'
  MW.switchSettingsTab('tax');
  assert.deepStrictEqual(getVisibleCategories(), ['tax'], 'When tax tab is selected, ONLY tax category is visible');

  // Test 2: Category 'fire'
  MW.switchSettingsTab('fire');
  assert.deepStrictEqual(getVisibleCategories(), ['fire'], 'When fire tab is selected, ONLY fire category is visible');

  // Test 3: Category 'wealth' (Bank & Debt)
  MW.switchSettingsTab('wealth');
  assert.deepStrictEqual(getVisibleCategories(), ['wealth'], 'When wealth tab is selected, ONLY wealth category is visible');

  // Test 4: Category 'system' (Tampilan & Backup)
  MW.switchSettingsTab('system');
  assert.deepStrictEqual(getVisibleCategories(), ['system'], 'When system tab is selected, ONLY system category is visible');

  // Test 5: Category 'telemetry' (Kuota & Telemetri)
  MW.switchSettingsTab('telemetry');
  assert.deepStrictEqual(getVisibleCategories(), ['telemetry'], 'When telemetry tab is selected, ONLY telemetry category is visible');

  // Test 6: Category 'fundamental'
  MW.switchSettingsTab('fundamental');
  assert.deepStrictEqual(getVisibleCategories(), ['fundamental'], 'When fundamental tab is selected, ONLY fundamental category is visible');

  // Test 7: Category 'all'
  MW.switchSettingsTab('all');
  assert.strictEqual(getVisibleCategories().length, 6, 'When all tab is selected, ALL categories are visible');
});

console.log('====================================================');
console.log(`TOTAL: ${passedTests} passed, ${totalTests - passedTests} failed, ${totalTests} total`);
console.log('====================================================');
if (totalTests !== passedTests) {
  process.exit(1);
}
