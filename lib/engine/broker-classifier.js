/**
 * lib/engine/broker-classifier.js — Canonical Broker Profile & Cohort Flow Classifier
 *
 * SPECIFICATION & GOVERNANCE:
 * - AGENTS.md §2 (StockChat AI Strategy & Bandarmology Momentum)
 * - AGENTS.md §7 (Signal Generation: Smart Money / Top 3 Concentration / Flow)
 * - AGENTS.md §8 (Confluence Engine: SMART_MONEY and FOREIGN_FLOW)
 * - FINANCIAL_POLICY.md §4 (Decision-Critical Data: Smart Money Broker Data)
 *
 * MISSION:
 * Mengklasifikasikan kode broker Bursa Efek Indonesia (BEI) ke dalam kelompok kohort:
 * 1. Asing / Global Bulge Bracket (AK, BK, RX, ZP, CS, KZ, MS, CG, LG, DB, dll.)
 * 2. Institusi Domestik / BUMN (CC, OD, NI, DX, SQ, HP, DR, dll.)
 * 3. Ritel Domestik Dominan (YP, PD, XC, XL, KK, CP, GR, EP, AT, AZ, KI, dll.)
 *
 * Serta menghitung:
 * - Smart Money Net Flow vs Retail Net Flow
 * - Rasio Retail Capitulation (Smart Money menyerap jualan ritel)
 * - Rasio Retail FOMO / Chasing (Institusi distribusi barang ke ritel)
 * - Anchored Bandar VWAP berbasis Smart Money
 */

export const BROKER_CATEGORIES = Object.freeze({
  FOREIGN_INSTITUTION: 'FOREIGN_INSTITUTION',
  DOMESTIC_INSTITUTION: 'DOMESTIC_INSTITUTION',
  RETAIL: 'RETAIL',
  OTHER: 'OTHER'
});

export const BROKER_REGISTRY = Object.freeze({
  // ── 1. ASING / FOREIGN BULGE BRACKET & INSTITUSI GLOBAL ─────────────
  AK: { name: 'UBS Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Bulge' },
  BK: { name: 'J.P. Morgan Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Bulge' },
  RX: { name: 'Macquarie Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Quant' },
  ZP: { name: 'Maybank Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Regional' },
  CS: { name: 'Credit Suisse Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Bulge' },
  KZ: { name: 'CLSA Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Institusi' },
  MS: { name: 'Morgan Stanley Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Bulge' },
  CG: { name: 'CGS-CIMB Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Regional' },
  LG: { name: 'Trimegah Sekuritas (Foreign Desk)', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Institusi' },
  DB: { name: 'Deutsche Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Bulge' },
  YU: { name: 'CIMB Sekuritas Indonesia', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Regional' },
  IF: { name: 'Samuel Sekuritas (Foreign)', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Institusi' },
  AI: { name: 'UOB Kay Hian Sekuritas', category: BROKER_CATEGORIES.FOREIGN_INSTITUTION, isForeign: true, badge: 'Asing / Regional' },

  // ── 2. INSTITUSI DOMESTIK / BUMN / ASSET MANAGEMENT ─────────────────
  CC: { name: 'Mandiri Sekuritas', category: BROKER_CATEGORIES.DOMESTIC_INSTITUTION, isForeign: false, badge: 'BUMN / Institusi' },
  OD: { name: 'BRI Danareksa Sekuritas', category: BROKER_CATEGORIES.DOMESTIC_INSTITUTION, isForeign: false, badge: 'BUMN / Institusi' },
  NI: { name: 'BNI Sekuritas', category: BROKER_CATEGORIES.DOMESTIC_INSTITUTION, isForeign: false, badge: 'BUMN / Institusi' },
  DX: { name: 'Bahana Sekuritas', category: BROKER_CATEGORIES.DOMESTIC_INSTITUTION, isForeign: false, badge: 'BUMN / Institusi' },
  SQ: { name: 'BCA Sekuritas (Institusi)', category: BROKER_CATEGORIES.DOMESTIC_INSTITUTION, isForeign: false, badge: 'Domestik / Institusi' },
  HP: { name: 'Henan Putihrai Sekuritas', category: BROKER_CATEGORIES.DOMESTIC_INSTITUTION, isForeign: false, badge: 'Domestik / Institusi' },
  DR: { name: 'RHB Sekuritas Indonesia', category: BROKER_CATEGORIES.DOMESTIC_INSTITUTION, isForeign: false, badge: 'Domestik / Institusi' },

  // ── 3. RETAIL DOMESTIK DOMINAN ─────────────────────────────────────
  YP: { name: 'Mirae Asset Sekuritas Indonesia', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail Heavy' },
  PD: { name: 'Indo Premier Sekuritas (IPOT)', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail Heavy' },
  XC: { name: 'Ajaib Sekuritas Asia', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail Dominan' },
  XL: { name: 'Stockbit Sekuritas', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail Dominan' },
  KK: { name: 'Phillip Sekuritas Indonesia', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' },
  CP: { name: 'KB Valbury Sekuritas', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' },
  GR: { name: 'Panin Sekuritas', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' },
  EP: { name: 'MNC Sekuritas', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' },
  AT: { name: 'Phintraco Sekuritas', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' },
  AZ: { name: 'Sucor Sekuritas', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail & HNWI' },
  KI: { name: 'Ciptadana Sekuritas Asia', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' },
  TF: { name: 'Universal Broker Indonesia', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' },
  SF: { name: 'Surya Fajar Sekuritas', category: BROKER_CATEGORIES.RETAIL, isForeign: false, badge: 'Retail' }
});

/**
 * Mengklasifikasikan kode broker ke dalam profil dan kategori.
 * @param {string} code
 * @returns {{ code: string, name: string, category: string, isSmartMoney: boolean, isRetail: boolean, isForeign: boolean, badge: string }}
 */
export function classifyBroker(code) {
  const clean = String(code || '').toUpperCase().trim();
  const found = BROKER_REGISTRY[clean];
  if (found) {
    const isSmartMoney = found.category === BROKER_CATEGORIES.FOREIGN_INSTITUTION || found.category === BROKER_CATEGORIES.DOMESTIC_INSTITUTION;
    const isRetail = found.category === BROKER_CATEGORIES.RETAIL;
    return {
      code: clean,
      name: found.name,
      category: found.category,
      isSmartMoney,
      isRetail,
      isForeign: !!found.isForeign,
      badge: found.badge
    };
  }

  return {
    code: clean,
    name: `Broker ${clean}`,
    category: BROKER_CATEGORIES.OTHER,
    isSmartMoney: false,
    isRetail: false,
    isForeign: false,
    badge: 'Unclassified'
  };
}

/**
 * Menganalisis perputaran modal kohort Smart Money vs Ritel dari daftar pembeli dan penjual.
 *
 * @param {Array<object>} topBuyers
 * @param {Array<object>} topSellers
 * @returns {object} Analisis kohort Smart Money vs Ritel
 */
export function analyzeBrokerCohortFlow(topBuyers = [], topSellers = []) {
  const buyers = Array.isArray(topBuyers) ? topBuyers : [];
  const sellers = Array.isArray(topSellers) ? topSellers : [];

  let smartMoneyBuyVal = 0;
  let smartMoneySellVal = 0;
  let retailBuyVal = 0;
  let retailSellVal = 0;
  let totalBuyVal = 0;
  let totalSellVal = 0;

  buyers.forEach(b => {
    const code = b.brokerCode || b.code || b.broker || '';
    const val = Number(b.valueRp || b.value || (b.avgBuyPrice * b.buyVolumeLot * 100) || 0);
    totalBuyVal += val;
    const info = classifyBroker(code);
    if (info.isSmartMoney) smartMoneyBuyVal += val;
    if (info.isRetail) retailBuyVal += val;
  });

  sellers.forEach(s => {
    const code = s.brokerCode || s.code || s.broker || '';
    const val = Number(s.valueRp || s.value || (s.avgSellPrice * s.sellVolumeLot * 100) || 0);
    totalSellVal += val;
    const info = classifyBroker(code);
    if (info.isSmartMoney) smartMoneySellVal += val;
    if (info.isRetail) retailSellVal += val;
  });

  const smartMoneyNet = smartMoneyBuyVal - smartMoneySellVal;
  const retailNet = retailBuyVal - retailSellVal;
  const totalMarketVal = totalBuyVal + totalSellVal;

  const smartMoneyParticipationPct = totalMarketVal > 0 ? Math.round(((smartMoneyBuyVal + smartMoneySellVal) / totalMarketVal) * 100) : 0;
  const retailParticipationPct = totalMarketVal > 0 ? Math.round(((retailBuyVal + retailSellVal) / totalMarketVal) * 100) : 0;

  // Sinyal Khusus
  const retailCapitulation = retailNet < 0 && smartMoneyNet > 0;
  const retailChasing = retailNet > 0 && smartMoneyNet < 0;

  let verdict = 'NEUTRAL_ROTATION';
  let interpretation = 'Rotasi aliran modal antara institusi dan ritel berlangsung seimbang.';

  if (retailCapitulation) {
    verdict = 'SMART_MONEY_ABSORPTION';
    interpretation = 'Institusi menyerap secara agresif tekanan jual akun ritel (Bullish Smart Money Absorption).';
  } else if (retailChasing) {
    verdict = 'DISTRIBUTION_TO_RETAIL';
    interpretation = 'Institusi melakukan distribusi profit taking saat akun ritel sedang agresif membeli (Bearish Distribution).';
  } else if (smartMoneyNet > 0 && retailNet >= 0) {
    verdict = 'CONFLUENCE_ACCUMULATION';
    interpretation = 'Akumulasi serentak dari institusi dan pelaku pasar domestik.';
  } else if (smartMoneyNet < 0 && retailNet <= 0) {
    verdict = 'CONFLUENCE_DISTRIBUTION';
    interpretation = 'Tekanan jual terjadi serentak dari institusi maupun ritel.';
  }

  return {
    smartMoneyBuyVal,
    smartMoneySellVal,
    smartMoneyNet,
    retailBuyVal,
    retailSellVal,
    retailNet,
    smartMoneyParticipationPct,
    retailParticipationPct,
    retailCapitulation,
    retailChasing,
    verdict,
    interpretation
  };
}

/**
 * Menghitung Anchored Bandar VWAP dengan memprioritaskan broker Smart Money.
 *
 * @param {Array<object>} topBuyers
 * @param {number} currentPrice
 * @returns {object} Hasil perhitungan Bandar VWAP & evaluasi zona harga
 */
export function calculateAnchoredBandarVwap(topBuyers = [], currentPrice = 0) {
  const buyers = Array.isArray(topBuyers) ? topBuyers : [];
  if (!buyers.length) {
    return { available: false, vwap: 0, spreadPct: 0, zone: 'UNKNOWN', zoneLabel: 'Data Tidak Tersedia', topBrokers: [] };
  }

  // 1. Filter broker Smart Money yang valid (Foreign + Domestic Institution)
  const smartMoneyBuyers = buyers.filter(b => {
    const code = b.brokerCode || b.code || b.broker || '';
    const info = classifyBroker(code);
    const p = Number(b.avgBuyPrice || b.avgPrice || b.price || 0);
    return info.isSmartMoney && p > 0;
  });

  // Jika ada Smart Money buyers, pakai mereka; jika tidak ada, fallback ke Top 3 buyers umum
  const candidateBuyers = smartMoneyBuyers.length >= 2 ? smartMoneyBuyers : buyers.slice(0, 3).filter(b => Number(b.avgBuyPrice || b.avgPrice || b.price || 0) > 0);

  if (!candidateBuyers.length) {
    return { available: false, vwap: 0, spreadPct: 0, zone: 'NO_DATA', zoneLabel: 'Broker Summary Kosong', topBrokers: [] };
  }

  let totalValue = 0;
  let totalVol = 0;
  const brokerCodes = [];

  candidateBuyers.forEach(b => {
    const p = Number(b.avgBuyPrice || b.avgPrice || b.price || 0);
    const v = Number(b.buyVolumeLot ?? b.volumeLot ?? b.volume ?? 0);
    const code = b.brokerCode || b.code || b.broker || '?';
    if (p > 0 && v > 0) {
      brokerCodes.push(code);
      totalValue += (p * v);
      totalVol += v;
    }
  });

  const vwap = totalVol > 0 ? Math.round(totalValue / totalVol) : 0;
  if (vwap <= 0) {
    return { available: false, vwap: 0, spreadPct: 0, zone: 'NO_DATA', zoneLabel: 'Harga Modal 0', topBrokers: [] };
  }

  const curPrice = currentPrice > 0 ? currentPrice : vwap;
  const spreadPct = Number((((curPrice - vwap) / vwap) * 100).toFixed(2));

  let zone = 'OPTIMAL_ACCUMULATION';
  let zoneLabel = 'Zona Akumulasi Ideal';
  let zoneBadge = 'b-up';

  if (spreadPct <= -3.0) {
    zone = 'DISCOUNT_ABSORPTION';
    zoneLabel = 'Zona Diskon / Smart Money Absorption';
    zoneBadge = 'b-up';
  } else if (spreadPct <= 4.0) {
    zone = 'OPTIMAL_ACCUMULATION';
    zoneLabel = 'Zona Akumulasi Ideal (Dekat Modal Bandar)';
    zoneBadge = 'b-up';
  } else if (spreadPct <= 12.0) {
    zone = 'MARKUP_ZONE';
    zoneLabel = 'Zona Markup (Sedang Didorong)';
    zoneBadge = 'b-amb';
  } else {
    zone = 'DISTRIBUTION_RISK';
    zoneLabel = 'Zona Rawan Distribusi (Jauh di Atas Modal)';
    zoneBadge = 'b-dn';
  }

  return {
    available: true,
    vwap,
    currentPrice: curPrice,
    spreadPct,
    zone,
    zoneLabel,
    zoneBadge,
    topBrokers: brokerCodes,
    buyerCount: candidateBuyers.length,
    isSmartMoneyFiltered: smartMoneyBuyers.length >= 2
  };
}
