/**
 * MONEY WATCH PRO v7 — Pure Financial Calculation Engine
 * Decoupled from UI rendering, verifiable via unit test assertions.
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.CalcEngine = (function() {
  
  // Calculate dynamic trade breakdown
  function calculateTradeCosts(gross, isBuy, sekuritas, customTaxSettings) {
    const tax = customTaxSettings || {
      buyFee: 0.0015,
      sellFee: 0.0025,
      ppnRate: 0.11,
      pphFinal: 0.001,
      levyRate: 0.00043
    };

    const baseRate = isBuy ? (tax.buyFee || 0.0015) : (tax.sellFee || 0.0025);
    const komisi = gross * baseRate;
    const ppn = komisi * (tax.ppnRate || 0.11);
    const levy = gross * (tax.levyRate || 0.00043);
    const pph = isBuy ? 0 : (gross * (tax.pphFinal || 0.001));
    const totalTax = ppn + levy + pph;

    const net = isBuy 
      ? (gross + komisi + ppn + levy) 
      : (gross - komisi - ppn - levy - pph);

    return {
      gross,
      komisi,
      ppn,
      levy,
      pph,
      totalTax,
      net
    };
  }

  // Calculate positions from transaction history
  function calculatePositions(transactions, livePriceMap) {
    const posMap = {};
    const realizedMap = {};

    // Sort transactions chronologically
    const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(tx => {
      const ticker = (tx.ticker || '').toUpperCase().trim();
      if (!ticker) return;

      if (!posMap[ticker]) {
        posMap[ticker] = {
          ticker: ticker,
          lot: 0,
          shares: 0,
          totalInvested: 0,
          avgPrice: 0,
          currentPrice: 0,
          marketValue: 0,
          unrealizedPnL: 0,
          unrealizedPnLPct: 0,
          weight: 0
        };
      }

      if (!realizedMap[ticker]) {
        realizedMap[ticker] = {
          realizedPnL: 0,
          totalSoldGross: 0,
          totalSoldNet: 0
        };
      }

      const pos = posMap[ticker];
      const lot = Number(tx.lot || 0);
      const shares = lot * 100;
      const net = Number(tx.net || (tx.gross || lot * 100 * tx.price));

      if (tx.type === 'BUY') {
        pos.totalInvested += net;
        pos.shares += shares;
        pos.lot += lot;
        pos.avgPrice = pos.shares > 0 ? (pos.totalInvested / pos.shares) : 0;
      } else if (tx.type === 'SELL') {
        const costBasisSold = pos.avgPrice * shares;
        const pnl = net - costBasisSold;
        realizedMap[ticker].realizedPnL += pnl;
        realizedMap[ticker].totalSoldGross += Number(tx.gross || 0);
        realizedMap[ticker].totalSoldNet += net;

        pos.shares = Math.max(0, pos.shares - shares);
        pos.lot = Math.max(0, pos.lot - lot);
        pos.totalInvested = pos.shares * pos.avgPrice;
      }
    });

    // Compute live valuations
    const activePositions = [];
    let totalPortfolioMarketValue = 0;
    let totalPortfolioInvested = 0;
    let totalUnrealizedPnL = 0;

    Object.keys(posMap).forEach(ticker => {
      const pos = posMap[ticker];
      if (pos.shares > 0) {
        const livePrice = (livePriceMap && livePriceMap[ticker]) ? livePriceMap[ticker].price : pos.avgPrice;
        pos.currentPrice = livePrice;
        pos.marketValue = pos.shares * livePrice;
        pos.unrealizedPnL = pos.marketValue - pos.totalInvested;
        pos.unrealizedPnLPct = pos.totalInvested > 0 ? (pos.unrealizedPnL / pos.totalInvested) * 100 : 0;

        totalPortfolioMarketValue += pos.marketValue;
        totalPortfolioInvested += pos.totalInvested;
        totalUnrealizedPnL += pos.unrealizedPnL;

        activePositions.push(pos);
      }
    });

    // Compute portfolio weights
    activePositions.forEach(p => {
      p.weight = totalPortfolioMarketValue > 0 ? (p.marketValue / totalPortfolioMarketValue) * 100 : 0;
    });

    // Sort by market value descending
    activePositions.sort((a, b) => b.marketValue - a.marketValue);

    let totalRealizedPnL = 0;
    Object.values(realizedMap).forEach(r => {
      totalRealizedPnL += r.realizedPnL;
    });

    return {
      positions: activePositions,
      totalMarketValue: totalPortfolioMarketValue,
      totalInvested: totalPortfolioInvested,
      totalUnrealizedPnL: totalUnrealizedPnL,
      totalUnrealizedPnLPct: totalPortfolioInvested > 0 ? (totalUnrealizedPnL / totalPortfolioInvested) * 100 : 0,
      totalRealizedPnL: totalRealizedPnL,
      positionCount: activePositions.length
    };
  }

  // Calculate RDN cash balance
  function calculateRdnBalance(mutations) {
    let runningBalance = 0;
    const sorted = [...mutations].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sorted.forEach(m => {
      runningBalance += Number(m.amount || 0);
      m.balance = runningBalance;
    });

    return {
      currentCash: runningBalance,
      mutations: sorted
    };
  }

  // Calculate Dividend YTD and totals
  function calculateDividendsSummary(dividends) {
    const currentYear = new Date().getFullYear();
    let totalGross = 0;
    let totalNet = 0;
    let ytdNet = 0;

    dividends.forEach(d => {
      const net = Number(d.netAmount || (d.totalGross ? d.totalGross * 0.9 : 0));
      const gross = Number(d.totalGross || net);
      const dYear = new Date(d.date).getFullYear();

      totalGross += gross;
      totalNet += net;
      if (dYear === currentYear) {
        ytdNet += net;
      }
    });

    return {
      totalGross,
      totalNet,
      ytdNet,
      count: dividends.length
    };
  }

  return {
    calculateTradeCosts,
    calculatePositions,
    calculateRdnBalance,
    calculateDividendsSummary
  };
})();
