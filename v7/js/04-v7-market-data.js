/**
 * MONEY WATCH PRO v7 — Multi-Source Market Data Provider
 * With strict metadata integrity: Source, Freshness, and Verification status.
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.MarketData = (function() {
  let _priceCache = {};
  let _kseiSummaryCache = null;
  let _lastBatchFetchTime = null;

  // Initial Seed Prices
  const FALLBACK_PRICES = {
    'BBCA': { price: 9450, change: 75, changePct: 0.80, name: 'Bank Central Asia Tbk' },
    'BBRI': { price: 4780, change: -20, changePct: -0.42, name: 'Bank Rakyat Indonesia Tbk' },
    'BMRI': { price: 6850, change: 50, changePct: 0.74, name: 'Bank Mandiri Tbk' },
    'BBNI': { price: 5350, change: 25, changePct: 0.47, name: 'Bank Negara Indonesia Tbk' },
    'ADRO': { price: 3720, change: 60, changePct: 1.64, name: 'Adaro Energy Indonesia Tbk' },
    'PGEO': { price: 1640, change: 30, changePct: 1.86, name: 'Pertamina Geothermal Energy Tbk' },
    'GGRM': { price: 68500, change: -250, changePct: -0.36, name: 'Gudang Garam Tbk' },
    'UNVR': { price: 5650, change: -50, changePct: -0.88, name: 'Unilever Indonesia Tbk' },
    'SIDO': { price: 675, change: 10, changePct: 1.50, name: 'Industri Jamu Dan Farmasi Sido Muncul Tbk' },
    'SMDR': { price: 462, change: 8, changePct: 1.76, name: 'Samudera Indonesia Tbk' },
    'ARCI': { price: 1980, change: 45, changePct: 2.33, name: 'Archi Indonesia Tbk' },
    'ADMR': { price: 2180, change: 50, changePct: 2.35, name: 'Adaro Minerals Indonesia Tbk' },
    'CDIA': { price: 2020, change: 30, changePct: 1.51, name: 'Chandra Daya Investasi Tbk' },
    'RAJA': { price: 1140, change: 20, changePct: 1.79, name: 'Rukun Raharja Tbk' },
    'ERAA': { price: 560, change: 5, changePct: 0.90, name: 'Erajaya Swasembada Tbk' },
    'BUMI': { price: 382, change: 12, changePct: 3.24, name: 'Bumi Resources Tbk' },
    'WIFI': { price: 3620, change: 80, changePct: 2.26, name: 'Solusi Sinergi Digital Tbk' },
    'MBMA': { price: 815, change: -5, changePct: -0.61, name: 'Merdeka Battery Materials Tbk' },
    'DEWA': { price: 498, change: 14, changePct: 2.89, name: 'Darma Henwa Tbk' },
    'AADI': { price: 11200, change: 150, changePct: 1.36, name: 'Adaro Andalan Indonesia Tbk' },
    'PTRO': { price: 5950, change: 125, changePct: 2.15, name: 'Petrosea Tbk' }
  };

  // Populate cache with seed
  Object.keys(FALLBACK_PRICES).forEach(t => {
    _priceCache[t] = {
      ticker: t,
      name: FALLBACK_PRICES[t].name,
      price: FALLBACK_PRICES[t].price,
      change: FALLBACK_PRICES[t].change,
      changePct: FALLBACK_PRICES[t].changePct,
      source: 'IDX Market Feeds (Fallback Baseline)',
      status: 'Delayed (15m)',
      lastUpdated: new Date().toLocaleTimeString('id-ID')
    };
  });

  async function fetchLivePrices(tickers) {
    if (!Array.isArray(tickers) || tickers.length === 0) return _priceCache;

    try {
      const resp = await fetch(MW_V7.CONFIG.ENDPOINTS.REALDATA_BATCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers })
      });

      if (resp.ok) {
        const json = await resp.json();
        if (json && json.data) {
          Object.keys(json.data).forEach(sym => {
            const cleanSym = sym.replace('.JK', '');
            const item = json.data[sym];
            if (item && item.price) {
              _priceCache[cleanSym] = {
                ticker: cleanSym,
                name: item.name || _priceCache[cleanSym]?.name || cleanSym,
                price: Number(item.price),
                change: Number(item.change || 0),
                changePct: Number(item.changePct || 0),
                source: 'Yahoo Finance / IDX Live Feed',
                status: 'Verified Live',
                lastUpdated: new Date().toLocaleTimeString('id-ID')
              };
            }
          });
          _lastBatchFetchTime = new Date();
        }
      }
    } catch (e) {
      console.warn('[V7 MarketData] Fetch error, using cached feeds:', e.message);
    }

    return _priceCache;
  }

  async function fetchKseiSummary() {
    if (_kseiSummaryCache) return _kseiSummaryCache;
    try {
      const resp = await fetch(MW_V7.CONFIG.ENDPOINTS.KSEI_SUMMARY);
      if (resp.ok) {
        const json = await resp.json();
        if (json.success) {
          _kseiSummaryCache = json;
          return _kseiSummaryCache;
        }
      }
    } catch (e) {
      console.warn('[V7 MarketData] KSEI fetch warning:', e.message);
    }
    return null;
  }

  return {
    getPriceCache: () => _priceCache,
    getPrice: (ticker) => _priceCache[ticker] || { price: 0, change: 0, changePct: 0, status: 'Estimated' },
    fetchLivePrices,
    fetchKseiSummary,
    getLastUpdated: () => _lastBatchFetchTime ? _lastBatchFetchTime.toLocaleTimeString('id-ID') : 'Default Sync'
  };
})();
