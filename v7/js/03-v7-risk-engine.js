/**
 * MONEY WATCH PRO v7 — Risk & Quantitative Analytics Engine
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.RiskEngine = (function() {
  
  // Historical volatility benchmarks (Annualized standard deviation)
  const SECTOR_VOLATILITIES = {
    'FINANCE': 0.18,
    'ENERGY': 0.28,
    'BASIC_MATERIALS': 0.26,
    'CONSUMER': 0.14,
    'INFRASTRUCTURE': 0.20,
    'TECH': 0.35,
    'CRYPTO': 0.65,
    'GOLD': 0.12
  };

  function evaluatePortfolioRisk(portfolioData, cashBalance) {
    const positions = portfolioData.positions || [];
    const totalMarketValue = portfolioData.totalMarketValue || 0;
    const totalWealth = totalMarketValue + (cashBalance || 0);

    if (totalWealth <= 0 || positions.length === 0) {
      return {
        overallRiskScore: 0,
        riskLevel: 'KOSONG / KAS PENUH',
        var95: 0,
        var99: 0,
        sharpeRatio: 0,
        portfolioBeta: 0,
        annualizedVolatility: 0,
        top3Concentration: 0,
        hhiIndex: 0,
        maxDrawdown: 0,
        recommendation: 'Belum ada aset aktif dalam portofolio.'
      };
    }

    // 1. Concentration Risk (HHI & Top 3 holdings)
    let sumSquaredWeights = 0;
    let top3Weight = 0;
    
    positions.forEach((p, idx) => {
      const weightFraction = p.marketValue / totalMarketValue;
      sumSquaredWeights += Math.pow(weightFraction * 100, 2);
      if (idx < 3) {
        top3Weight += p.weight;
      }
    });

    // 2. Weighted Volatility & Beta estimation
    let weightedVol = 0;
    let weightedBeta = 0;

    positions.forEach(p => {
      const w = p.marketValue / totalMarketValue;
      // Heuristic beta based on ticker profile
      let beta = 1.0;
      let vol = 0.22;
      
      const t = p.ticker;
      if (['BBCA', 'BBRI', 'BMRI', 'BBNI'].includes(t)) {
        beta = 0.95; vol = 0.17;
      } else if (['ADRO', 'BUMI', 'DEWA', 'PTRO', 'ADMR'].includes(t)) {
        beta = 1.35; vol = 0.32;
      } else if (['UNVR', 'GGRM', 'SIDO', 'ERAA'].includes(t)) {
        beta = 0.75; vol = 0.16;
      } else if (['PGEO', 'ARCI', 'WIFI', 'SMDR'].includes(t)) {
        beta = 1.15; vol = 0.25;
      }

      weightedVol += w * vol;
      weightedBeta += w * beta;
    });

    // Adjust for Cash Drag (Cash lowers portfolio volatility & beta)
    const equityRatio = totalMarketValue / totalWealth;
    const portfolioVol = weightedVol * equityRatio;
    const portfolioBeta = weightedBeta * equityRatio;

    // 3. Parametric Value-at-Risk (1-Day VaR)
    // 95% Z = 1.645, 99% Z = 2.326
    const dailyVol = portfolioVol / Math.sqrt(252);
    const var95 = totalMarketValue * dailyVol * 1.645;
    const var99 = totalMarketValue * dailyVol * 2.326;

    // 4. Sharpe Ratio (Assume Risk-Free Rate = 6.25% BI Rate)
    const expectedReturn = 0.12; // 12% annualized expected market return
    const riskFreeRate = 0.0625;
    const sharpeRatio = portfolioVol > 0 ? (expectedReturn - riskFreeRate) / portfolioVol : 0;

    // 5. Maximum Expected Drawdown (Cornish-Fisher proxy)
    const maxDrawdown = Math.min(65, portfolioVol * 1.8 * 100);

    // 6. Overall Risk Score (0 - 100)
    let score = 0;
    // Factor A: Equity allocation weight (max 40 pts)
    score += equityRatio * 40;
    // Factor B: Concentration weight (max 30 pts)
    if (top3Weight > 70) score += 30;
    else if (top3Weight > 50) score += 20;
    else if (top3Weight > 35) score += 10;
    else score += 5;
    // Factor C: Volatility (max 30 pts)
    score += Math.min(30, (portfolioVol / 0.35) * 30);

    const overallRiskScore = Math.round(score);
    let riskLevel = 'MODERAT';
    if (overallRiskScore < 35) riskLevel = 'KONSERVATIF / AMAN';
    else if (overallRiskScore < 65) riskLevel = 'MODERAT / SEIMBANG';
    else if (overallRiskScore < 85) riskLevel = 'AGRESIF / WASPADA';
    else riskLevel = 'SANGAT TINGGI / EKSTREM';

    return {
      overallRiskScore,
      riskLevel,
      var95,
      var99,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      portfolioBeta: Math.round(portfolioBeta * 100) / 100,
      annualizedVolatility: Math.round(portfolioVol * 1000) / 10,
      top3Concentration: Math.round(top3Weight * 10) / 10,
      hhiIndex: Math.round(sumSquaredWeights),
      maxDrawdown: Math.round(maxDrawdown * 10) / 10,
      equityRatio: Math.round(equityRatio * 100),
      cashRatio: Math.round((1 - equityRatio) * 100)
    };
  }

  return {
    evaluatePortfolioRisk
  };
})();
