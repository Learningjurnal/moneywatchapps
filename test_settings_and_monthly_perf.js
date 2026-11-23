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

test('35-settings.js defines SETTINGS_TABS and categorizes views strictly matching selected tab', () => {
  const domElements = {};
  function makeEl(id) {
    if (!domElements[id]) {
      domElements[id] = {
        id: id,
        innerHTML: '',
        style: {},
        value: '10',
        checked: true
      };
    }
    return domElements[id];
  }

  const sandbox = {
    document: {
      getElementById: (id) => makeEl(id),
      querySelector: () => null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: () => null,
      setItem: () => null
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
  assert.ok(typeof MW.setTab === 'function', 'MW_SETTINGS.setTab must be a function');
  assert.ok(typeof MW.renderSettingsPage === 'function', 'MW_SETTINGS.renderSettingsPage must be a function');

  // Test 1: Category 'tax'
  MW.setTab('tax');
  let pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('v6-form-tax-settings'), 'Tax menu MUST show tax settings form');
  assert.ok(pageContent.includes('cfg-buyfee'), 'Tax menu MUST show buy fee input');
  assert.ok(!pageContent.includes('v6-form-fire-settings'), 'Tax menu MUST NOT show FIRE form');
  assert.ok(!pageContent.includes('new-v6-bank-name'), 'Tax menu MUST NOT show bank accounts form');
  assert.ok(!pageContent.includes('new-v6-debt-name'), 'Tax menu MUST NOT show debt form');

  // Test 2: Category 'fire'
  MW.setTab('fire');
  pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('v6-form-fire-settings'), 'FIRE menu MUST show FIRE settings form');
  assert.ok(pageContent.includes('cfg-fire-target'), 'FIRE menu MUST show FIRE target input');
  assert.ok(!pageContent.includes('v6-form-tax-settings'), 'FIRE menu MUST NOT show tax form');
  assert.ok(!pageContent.includes('new-v6-bank-name'), 'FIRE menu MUST NOT show bank accounts form');

  // Test 3: Category 'bank'
  MW.setTab('bank');
  pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('new-v6-bank-name'), 'Bank menu MUST show add bank account form');
  assert.ok(!pageContent.includes('v6-form-tax-settings'), 'Bank menu MUST NOT show tax form');
  assert.ok(!pageContent.includes('v6-form-fire-settings'), 'Bank menu MUST NOT show FIRE form');
  assert.ok(!pageContent.includes('new-v6-debt-name'), 'Bank menu MUST NOT show debt form');

  // Test 4: Category 'debt'
  MW.setTab('debt');
  pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('new-v6-debt-name'), 'Debt menu MUST show add debt form');
  assert.ok(!pageContent.includes('new-v6-bank-name'), 'Debt menu MUST NOT show bank form');
  assert.ok(!pageContent.includes('v6-form-tax-settings'), 'Debt menu MUST NOT show tax form');

  // Test 5: Category 'vault'
  MW.setTab('vault');
  pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('exportConsolidatedPortfolioCsv'), 'Vault menu MUST show CSV export');
  assert.ok(pageContent.includes('mwOpenPdfReportModal'), 'Vault menu MUST show PDF report modal button');
  assert.ok(pageContent.includes('exportJsonBackup'), 'Vault menu MUST show JSON export button');
  assert.ok(!pageContent.includes('v6-form-tax-settings'), 'Vault menu MUST NOT show tax form');

  // Test 6: Category 'display'
  MW.setTab('display');
  pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('setViewDensity'), 'Display menu MUST show view density controls');
  assert.ok(pageContent.includes('mwZoom'), 'Display menu MUST show zoom controls');
  assert.ok(pageContent.includes('ticker-wrap'), 'Display menu MUST show ticker toggle');
  assert.ok(!pageContent.includes('v6-form-tax-settings'), 'Display menu MUST NOT show tax form');

  // Test 7: Category 'integrations'
  MW.setTab('integrations');
  pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('quota-invezgo-box'), 'Integrations menu MUST show Invezgo quota widget');
  assert.ok(pageContent.includes('quota-dq-box'), 'Integrations menu MUST show Data Quality widget');
  assert.ok(pageContent.includes('openKseiModal'), 'Integrations menu MUST show KSEI shortcut');
  assert.ok(!pageContent.includes('v6-form-tax-settings'), 'Integrations menu MUST NOT show tax form');

  // Test 8: Category 'all'
  MW.setTab('all');
  pageContent = domElements['page-settings'].innerHTML;
  assert.ok(pageContent.includes('v6-form-tax-settings'), 'All menu MUST contain tax form');
  assert.ok(pageContent.includes('v6-form-fire-settings'), 'All menu MUST contain FIRE form');
  assert.ok(pageContent.includes('new-v6-bank-name'), 'All menu MUST contain bank form');
  assert.ok(pageContent.includes('new-v6-debt-name'), 'All menu MUST contain debt form');
});

console.log('====================================================');
console.log(`TOTAL: ${passedTests} passed, ${totalTests - passedTests} failed, ${totalTests} total`);
console.log('====================================================');
if (totalTests !== passedTests) {
  process.exit(1);
}
