/**
 * MONEY WATCH PRO v7 — Reactive State Store & Persistence
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.Store = (function() {
  let _state = null;
  let _listeners = [];
  let _currentPillar = 'HOME';
  let _currentMode = 'Pro';

  function init() {
    // 1. Load data via Adapter (reads V6 existing state or initial set)
    _state = MW_V7.DataAdapter.loadState();
    
    // 2. Load mode preference
    const savedMode = localStorage.getItem('mw_v7_user_mode');
    if (savedMode) _currentMode = savedMode;

    console.log('[V7 Store] Initialized with', _state.transactions.length, 'transactions, mode:', _currentMode);
  }

  function getState() {
    return _state;
  }

  function getComputedData() {
    if (!_state) return null;

    const livePrices = MW_V7.MarketData.getPriceCache();
    const portfolio = MW_V7.CalcEngine.calculatePositions(_state.transactions, livePrices);
    const rdn = MW_V7.CalcEngine.calculateRdnBalance(_state.rdnMutations);
    const dividends = MW_V7.CalcEngine.calculateDividendsSummary(_state.dividends);
    const risk = MW_V7.RiskEngine.evaluatePortfolioRisk(portfolio, rdn.currentCash);

    // Wealth computation
    const bankAccountsTotal = (_state.wealth?.accounts || []).reduce((acc, x) => acc + Number(x.balance || 0), 0);
    const debtsTotal = (_state.wealth?.debts || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const receivablesTotal = (_state.wealth?.receivables || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);

    const totalAUM = portfolio.totalMarketValue + rdn.currentCash;
    const totalNetWorth = totalAUM + bankAccountsTotal + receivablesTotal - debtsTotal;

    // Today's P&L calculation
    let todayPnL = 0;
    portfolio.positions.forEach(p => {
      const pData = livePrices[p.ticker];
      if (pData && pData.change) {
        todayPnL += (p.shares * pData.change);
      }
    });
    const todayPnLPct = portfolio.totalMarketValue > 0 ? (todayPnL / (portfolio.totalMarketValue - todayPnL)) * 100 : 0;

    return {
      portfolio,
      rdn,
      dividends,
      risk,
      totalAUM,
      totalNetWorth,
      bankAccountsTotal,
      debtsTotal,
      receivablesTotal,
      todayPnL,
      todayPnLPct
    };
  }

  function subscribe(fn) {
    if (typeof fn === 'function') {
      _listeners.push(fn);
    }
    return () => {
      _listeners = _listeners.filter(l => l !== fn);
    };
  }

  function notify() {
    const computed = getComputedData();
    _listeners.forEach(fn => {
      try {
        fn(_state, computed);
      } catch (e) {
        console.error('[V7 Store notify error]', e);
      }
    });
    persistState();
  }

  function persistState() {
    if (!_state) return;
    try {
      _state.savedAt = new Date().toISOString();
      const payloadStr = JSON.stringify(_state);
      localStorage.setItem(MW_V7.CONFIG.STORAGE_KEYS.PRIMARY, payloadStr);
      localStorage.setItem(MW_V7.CONFIG.STORAGE_KEYS.BACKUP, payloadStr);

      // Async sync to server mirror
      fetch(MW_V7.CONFIG.ENDPOINTS.USER_DATA_SAVE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: 'global_user', data: _state })
      }).catch(err => console.warn('[V7 Server Sync Warn]', err.message));
    } catch (e) {
      console.error('[V7 Store persist error]', e);
    }
  }

  // Mutations
  function addTransaction(txData) {
    const isBuy = txData.type === 'BUY';
    const gross = Number(txData.lot) * 100 * Number(txData.price);
    const costs = MW_V7.CalcEngine.calculateTradeCosts(gross, isBuy, txData.sekuritas, _state.taxSettings);

    const newId = _state.transactions.length > 0 ? Math.max(..._state.transactions.map(t => t.id || 0)) + 1 : 1;
    const newTx = {
      id: newId,
      date: txData.date || new Date().toISOString().split('T')[0],
      type: txData.type,
      ticker: txData.ticker.toUpperCase().trim(),
      lot: Number(txData.lot),
      price: Number(txData.price),
      gross: gross,
      komisi: costs.komisi,
      ppn: costs.ppn,
      levy: costs.levy,
      pph: costs.pph,
      tax: costs.totalTax,
      net: costs.net,
      sekuritas: txData.sekuritas || _state.activeSekuritas || 'Stockbit'
    };

    _state.transactions.push(newTx);

    // Add corresponding RDN cash mutation
    const rdnId = _state.rdnMutations.length > 0 ? Math.max(..._state.rdnMutations.map(m => m.id || 0)) + 1 : 1;
    _state.rdnMutations.push({
      id: rdnId,
      date: newTx.date,
      type: newTx.type,
      ket: `${isBuy ? 'Beli' : 'Jual'} ${newTx.lot} lot ${newTx.ticker} @ Rp ${newTx.price.toLocaleString('id-ID')}`,
      amount: isBuy ? -costs.net : costs.net,
      balance: 0,
      sekuritas: newTx.sekuritas,
      linkedTxId: newId
    });

    notify();
    return newTx;
  }

  function deleteTransaction(txId) {
    _state.transactions = _state.transactions.filter(t => t.id !== txId);
    _state.rdnMutations = _state.rdnMutations.filter(m => m.linkedTxId !== txId);
    notify();
  }

  function addRdnCashMutation(type, amount, ket, date) {
    const rdnId = _state.rdnMutations.length > 0 ? Math.max(..._state.rdnMutations.map(m => m.id || 0)) + 1 : 1;
    const val = Number(amount);
    _state.rdnMutations.push({
      id: rdnId,
      date: date || new Date().toISOString().split('T')[0],
      type: type,
      ket: ket || (type === 'SETOR' ? 'Setoran Dana RDN' : 'Penarikan Dana RDN'),
      amount: type === 'SETOR' ? Math.abs(val) : -Math.abs(val),
      balance: 0,
      sekuritas: _state.activeSekuritas || 'Stockbit'
    });
    notify();
  }

  function addDividend(divData) {
    const gross = Number(divData.totalGross || (divData.dps * divData.shares));
    const tax = gross * (divData.taxRate || 0.1);
    const net = gross - tax;
    const newId = _state.dividends.length > 0 ? Math.max(..._state.dividends.map(d => d.id || 0)) + 1 : 1;

    _state.dividends.push({
      id: newId,
      ticker: divData.ticker.toUpperCase().trim(),
      date: divData.date || new Date().toISOString().split('T')[0],
      dps: Number(divData.dps || 0),
      shares: Number(divData.shares || 0),
      totalGross: gross,
      taxRate: divData.taxRate || 0.1,
      taxAmount: tax,
      netAmount: net
    });

    // Auto-credit to RDN
    const rdnId = _state.rdnMutations.length > 0 ? Math.max(..._state.rdnMutations.map(m => m.id || 0)) + 1 : 1;
    _state.rdnMutations.push({
      id: rdnId,
      date: divData.date || new Date().toISOString().split('T')[0],
      type: 'DIVIDEN',
      ket: `Dividen ${divData.ticker} (${divData.shares?.toLocaleString('id-ID')} lbr @ Rp ${divData.dps})`,
      amount: net,
      balance: 0,
      sekuritas: _state.activeSekuritas || 'Stockbit'
    });

    notify();
  }

  // Configuration & Settings Mutations
  function updateTaxSettings(newTaxSettings, activeSekuritas) {
    if (newTaxSettings) {
      _state.taxSettings = { ..._state.taxSettings, ...newTaxSettings };
    }
    if (activeSekuritas) {
      _state.activeSekuritas = activeSekuritas;
    }
    notify();
  }

  function updateFireSettings(fireTarget, monthlyExpense, emergencyFundTarget, expectedReturn) {
    if (!_state.wealth) _state.wealth = { accounts: [], debts: [], receivables: [] };
    if (fireTarget !== undefined) _state.wealth.fireTarget = Number(fireTarget);
    if (monthlyExpense !== undefined) _state.wealth.monthlyExpense = Number(monthlyExpense);
    if (emergencyFundTarget !== undefined) _state.wealth.emergencyFundTarget = Number(emergencyFundTarget);
    if (expectedReturn !== undefined) _state.wealth.expectedReturn = Number(expectedReturn);
    notify();
  }

  function addBankAccount(name, category, balance) {
    if (!_state.wealth) _state.wealth = { accounts: [], debts: [], receivables: [] };
    if (!_state.wealth.accounts) _state.wealth.accounts = [];
    _state.wealth.accounts.push({
      id: Date.now(),
      name: name || 'Rekening Baru',
      category: category || 'Bank',
      balance: Number(balance || 0)
    });
    notify();
  }

  function deleteBankAccount(idx) {
    if (_state.wealth?.accounts && _state.wealth.accounts[idx] !== undefined) {
      _state.wealth.accounts.splice(idx, 1);
      notify();
    }
  }

  function addDebt(name, category, amount) {
    if (!_state.wealth) _state.wealth = { accounts: [], debts: [], receivables: [] };
    if (!_state.wealth.debts) _state.wealth.debts = [];
    _state.wealth.debts.push({
      id: Date.now(),
      name: name || 'Liabilitas Baru',
      category: category || 'Cicilan',
      amount: Number(amount || 0)
    });
    notify();
  }

  function deleteDebt(idx) {
    if (_state.wealth?.debts && _state.wealth.debts[idx] !== undefined) {
      _state.wealth.debts.splice(idx, 1);
      notify();
    }
  }

  function importStateFromJson(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') throw new Error('Format JSON tidak valid');
      if (!Array.isArray(parsed.transactions)) parsed.transactions = [];
      if (!Array.isArray(parsed.rdnMutations)) parsed.rdnMutations = [];
      if (!Array.isArray(parsed.dividends)) parsed.dividends = [];
      if (!parsed.taxSettings) parsed.taxSettings = { buyFee: 0.0015, sellFee: 0.0025, pphFinal: 0.001, dividendTax: 0.10, ppnFee: 0.11, levy: 0.00043 };
      _state = parsed;
      notify();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function resetStateToDefaults() {
    _state = MW_V7.DataAdapter.loadInitialFallback();
    notify();
  }

  return {
    init,
    getState,
    getComputedData,
    subscribe,
    notify,
    addTransaction,
    deleteTransaction,
    addRdnCashMutation,
    addDividend,
    updateTaxSettings,
    updateFireSettings,
    addBankAccount,
    deleteBankAccount,
    addDebt,
    deleteDebt,
    importStateFromJson,
    resetStateToDefaults,
    getPillar: () => _currentPillar,
    setPillar: (p) => { _currentPillar = p; },
    getMode: () => _currentMode,
    setMode: (m) => { 
      _currentMode = m; 
      localStorage.setItem('mw_v7_user_mode', m);
      notify();
    }
  };
})();
