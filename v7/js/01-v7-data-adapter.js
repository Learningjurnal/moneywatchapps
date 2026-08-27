/**
 * MONEY WATCH PRO v7 — Data Adapter & Seamless Migration from V6
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.DataAdapter = (function() {
  const INITIAL_PORTO_DEFAULT = [
    { ticker: 'BBCA', lot: 68, price: 8116, amount: 55190301 },
    { ticker: 'BBRI', lot: 223, price: 4833, amount: 107776850 },
    { ticker: 'BMRI', lot: 72, price: 6023, amount: 43362552 },
    { ticker: 'BBNI', lot: 73, price: 5243, amount: 38276774 },
    { ticker: 'ADRO', lot: 102, price: 3484.6, amount: 35542862 },
    { ticker: 'PGEO', lot: 823, price: 1521, amount: 125189937 },
    { ticker: 'GGRM', lot: 6, price: 67303, amount: 40381580 },
    { ticker: 'UNVR', lot: 60, price: 5756.8, amount: 34540561 },
    { ticker: 'SIDO', lot: 330, price: 645, amount: 21273844 },
    { ticker: 'SMDR', lot: 710, price: 439, amount: 31180236 },
    { ticker: 'ARCI', lot: 236, price: 1890, amount: 44610655 },
    { ticker: 'ADMR', lot: 203, price: 2062, amount: 41854202 },
    { ticker: 'CDIA', lot: 198, price: 1950, amount: 38608062 },
    { ticker: 'RAJA', lot: 215, price: 1072, amount: 23053923 },
    { ticker: 'ERAA', lot: 415, price: 544.9, amount: 22613284 },
    { ticker: 'BUMI', lot: 523, price: 357, amount: 18682368 },
    { ticker: 'WIFI', lot: 57, price: 3406, amount: 19415886 },
    { ticker: 'MBMA', lot: 92, price: 788, amount: 7248969 },
    { ticker: 'DEWA', lot: 135, price: 474, amount: 6398196 },
    { ticker: 'AADI', lot: 5, price: 10679, amount: 5339594 },
    { ticker: 'PTRO', lot: 5, price: 5619, amount: 2809608 }
  ];

  function loadV6RawState() {
    try {
      const primary = localStorage.getItem(MW_V7.CONFIG.STORAGE_KEYS.PRIMARY);
      if (primary) {
        return JSON.parse(primary);
      }
      const backup = localStorage.getItem(MW_V7.CONFIG.STORAGE_KEYS.BACKUP);
      if (backup) {
        return JSON.parse(backup);
      }
    } catch (e) {
      console.warn('[V7 DataAdapter] Error parsing localStorage:', e);
    }
    return null;
  }

  function normalizeState(raw) {
    if (!raw) {
      return generateDefaultState();
    }

    const state = {
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      rdnMutations: Array.isArray(raw.rdnMutations) ? raw.rdnMutations : [],
      dividends: Array.isArray(raw.dividends) ? raw.dividends : [],
      cryptoTx: Array.isArray(raw.cryptoTx) ? raw.cryptoTx : [],
      etfTx: Array.isArray(raw.etfTx) ? raw.etfTx : [],
      rdTx: Array.isArray(raw.rdTx) ? raw.rdTx : [],
      wealth: raw.wealth || {
        accounts: [
          { id: 'bca_1', name: 'BCA Prioritas', balance: 45000000, category: 'Bank' },
          { id: 'mandiri_1', name: 'Bank Mandiri', balance: 25000000, category: 'Bank' }
        ],
        debts: [],
        receivables: [],
        fireTarget: 2500000000,
        monthlyExpense: 15000000
      },
      cashAccounts: raw.cashAccounts || {},
      taxSettings: raw.taxSettings || {
        buyFee: 0.0015,
        sellFee: 0.0025,
        dividendTax: 0.10,
        ppnRate: 0.11,
        pphFinal: 0.001
      },
      activeSekuritas: raw.activeSekuritas || 'Stockbit',
      savedAt: raw.savedAt || new Date().toISOString()
    };

    if (state.transactions.length === 0) {
      return generateDefaultState();
    }

    return state;
  }

  function generateDefaultState() {
    let nextId = 1;
    const txs = [];
    const muts = [];
    let totalInvested = 0;

    INITIAL_PORTO_DEFAULT.forEach(item => {
      const gross = item.lot * 100 * item.price;
      const fee = gross * 0.0015;
      const net = gross + fee;
      totalInvested += net;
      
      const txId = nextId++;
      txs.push({
        id: txId,
        date: '2026-08-24',
        type: 'BUY',
        ticker: item.ticker,
        lot: item.lot,
        price: item.price,
        gross: gross,
        komisi: fee,
        ppn: 0,
        levy: 0,
        pph: 0,
        tax: 0,
        net: net,
        sekuritas: 'Stockbit'
      });

      muts.push({
        id: nextId++,
        date: '2026-08-24',
        type: 'BUY',
        ket: `Beli ${item.lot} lot ${item.ticker} @ Rp ${item.price.toLocaleString('id-ID')}`,
        amount: -net,
        balance: 0,
        sekuritas: 'Stockbit',
        linkedTxId: txId
      });
    });

    const initialCash = Math.ceil(totalInvested / 50000000) * 50000000 + 15000000;
    muts.unshift({
      id: nextId++,
      date: '2026-08-24',
      type: 'SETOR',
      ket: 'Setoran Awal RDN (Modal Awal)',
      amount: initialCash,
      balance: initialCash,
      sekuritas: 'Stockbit'
    });

    return {
      transactions: txs,
      rdnMutations: muts,
      dividends: [
        { id: 1, ticker: 'BBCA', date: '2026-04-15', dps: 270, totalGross: 1836000, taxRate: 0.1, taxAmount: 183600, netAmount: 1652400, shares: 6800 },
        { id: 2, ticker: 'BBRI', date: '2026-03-28', dps: 345, totalGross: 7693500, taxRate: 0.1, taxAmount: 769350, netAmount: 6924150, shares: 22300 }
      ],
      cryptoTx: [],
      etfTx: [],
      rdTx: [],
      wealth: {
        accounts: [
          { id: 'bca_1', name: 'BCA Prioritas', balance: 50000000, category: 'Bank' },
          { id: 'mandiri_1', name: 'Mandiri Tabungan', balance: 35000000, category: 'Bank' }
        ],
        debts: [],
        receivables: [],
        fireTarget: 2500000000,
        monthlyExpense: 15000000
      },
      cashAccounts: {},
      taxSettings: {
        buyFee: 0.0015,
        sellFee: 0.0025,
        dividendTax: 0.10,
        ppnRate: 0.11,
        pphFinal: 0.001
      },
      activeSekuritas: 'Stockbit',
      savedAt: new Date().toISOString()
    };
  }

  return {
    loadState: function() {
      const raw = loadV6RawState();
      return normalizeState(raw);
    },
    exportJson: function(state) {
      return JSON.stringify(state, null, 2);
    }
  };
})();
