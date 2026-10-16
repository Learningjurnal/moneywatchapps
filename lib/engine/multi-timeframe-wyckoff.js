/**
 * multi-timeframe-wyckoff.js — Multi-Timeframe Alignment & Wyckoff Phase Engine (Phase 3)
 *
 * Mengimplementasikan:
 * 1. Agregasi Bar Mingguan (Weekly OHLCV) dari data harian kanonikal
 * 2. Evaluasi Konfluensi Multi-Timeframe (Weekly Primary Trend + Daily Intermediate Setup)
 * 3. Detektor Siklus Pasar Wyckoff (Accumulation, Markup, Distribution, Markdown)
 *
 * Standar Integritas Data Finansial (AGENTS.md):
 * - Zero fabricated data: tidak mengarang bar harga / volume jika riwayat tidak cukup
 * - Provenance & data status eksplisit
 * - Position sizing multiplier kanonikal (0.0x s.d. 1.0x) untuk kontrol risiko institusi
 */

/**
 * Menghitung tanggal Senin dari objek Date untuk pengelompokan bar mingguan.
 * Menggunakan UTC secara ketat agar invarian terhadap zona waktu server / runner (misal UTC-4/5 di Vercel/GitHub CI).
 */
function getMondayKey(dateStrOrObj) {
  let d;
  if (typeof dateStrOrObj === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStrOrObj)) {
    const parts = dateStrOrObj.slice(0, 10).split('-');
    d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  } else {
    d = new Date(dateStrOrObj);
  }
  if (isNaN(d.getTime())) return null;
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setUTCDate(diff);
  return monday.toISOString().slice(0, 10);
}

/**
 * Mengagregasi deret bar harian (daily OHLCV) menjadi deret bar mingguan (weekly OHLCV).
 *
 * @param {Array<object>} dailyPoints - Array bar harian [{ d, o, h, l, c, v }]
 * @returns {Array<object>} Array bar mingguan terurut kronologis
 */
export function aggregateWeeklyBars(dailyPoints) {
  if (!Array.isArray(dailyPoints) || dailyPoints.length < 5) return [];

  const weeklyGroups = new Map();

  for (const bar of dailyPoints) {
    if (!bar || !bar.d) continue;
    const mondayKey = getMondayKey(bar.d);
    if (!mondayKey) continue;

    if (!weeklyGroups.has(mondayKey)) {
      weeklyGroups.set(mondayKey, []);
    }
    weeklyGroups.get(mondayKey).push(bar);
  }

  const weeklyBars = [];

  for (const [mondayKey, bars] of weeklyGroups.entries()) {
    if (!bars.length) continue;

    const open = Number(bars[0].o || bars[0].c || 0);
    const close = Number(bars[bars.length - 1].c || 0);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const b of bars) {
      const bh = Number(b.h ?? b.c ?? 0);
      const bl = Number(b.l ?? b.c ?? 0);
      const bv = Number(b.v ?? 0);

      if (bh > high) high = bh;
      if (bl < low) low = bl;
      volume += bv;
    }

    if (high === -Infinity) high = close;
    if (low === Infinity) low = close;

    const lastDate = bars[bars.length - 1].d || mondayKey;

    weeklyBars.push({
      d: lastDate,
      weekStart: mondayKey,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume,
      dailyBarsCount: bars.length
    });
  }

  // Urutkan secara kronologis
  return weeklyBars.sort((a, b) => new Date(a.d).getTime() - new Date(b.d).getTime());
}

/**
 * Menghitung Exponential Moving Average (EMA).
 */
export function computeEMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Menghitung Simple Moving Average (SMA).
 */
export function computeSMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Menghitung RSI Wilder-Smoothed.
 */
export function computeRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  gain /= period; loss /= period;
  let rsi = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - (100 / (1 + (gain / loss)));

  for (let j = period + 1; j < closes.length; j++) {
    const ch2 = closes[j] - closes[j - 1];
    const g = ch2 > 0 ? ch2 : 0;
    const l = ch2 < 0 ? -ch2 : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    rsi = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - (100 / (1 + (gain / loss)));
  }
  return rsi;
}

/**
 * Menghitung indikator teknikal bar mingguan (Weekly Trend, EMA, RSI).
 *
 * @param {Array<object>} weeklyBars
 * @returns {object|null}
 */
export function computeWeeklyIndicators(weeklyBars) {
  if (!Array.isArray(weeklyBars) || weeklyBars.length < 10) return null;

  const closes = weeklyBars.map(b => b.c);
  const lastClose = closes[closes.length - 1];
  const ema20 = computeEMA(closes, 20) || computeSMA(closes, Math.min(closes.length, 10));
  const ema50 = computeEMA(closes, 50);
  const rsi14 = computeRSI(closes, 14) ?? 50;

  // Analisis Volume Mingguan (bandingkan volume minggu terakhir dengan rata-rata 4 minggu sebelumnya)
  const vols = weeklyBars.map(b => b.v || 0);
  const lastVol = vols[vols.length - 1] || 0;
  const prev4Vols = vols.slice(-5, -1);
  const avgVol4 = prev4Vols.length ? prev4Vols.reduce((a, b) => a + b, 0) / prev4Vols.length : 1;
  const volRatio = avgVol4 > 0 ? Number((lastVol / avgVol4).toFixed(2)) : 1.0;

  // Klasifikasi Tren Mingguan (Primary Trend)
  let primaryTrend = 'SIDEWAYS';
  if (ema50 != null) {
    if (lastClose > ema20 && ema20 > ema50) primaryTrend = 'UPTREND';
    else if (lastClose < ema20 && ema20 < ema50) primaryTrend = 'DOWNTREND';
  } else if (ema20 != null) {
    if (lastClose > ema20 && rsi14 >= 50) primaryTrend = 'UPTREND';
    else if (lastClose < ema20 && rsi14 < 45) primaryTrend = 'DOWNTREND';
  }

  return {
    barsAvailable: weeklyBars.length,
    lastClose,
    ema20: ema20 ? Math.round(ema20) : null,
    ema50: ema50 ? Math.round(ema50) : null,
    rsi14: Math.round(rsi14 * 10) / 10,
    volRatio,
    primaryTrend
  };
}

/**
 * Konfigurasi Keselarasan Multi-Timeframe (Multi-Timeframe Confluence).
 */
export const MTF_ALIGNMENT = {
  STRONG_BULLISH_CONFLUENCE: 'STRONG_BULLISH_CONFLUENCE',
  PULLBACK_IN_UPTREND: 'PULLBACK_IN_UPTREND',
  COUNTER_TREND_BOUNCE: 'COUNTER_TREND_BOUNCE',
  DISTRIBUTION_BREAKDOWN: 'DISTRIBUTION_BREAKDOWN',
  NEUTRAL_CHOP: 'NEUTRAL_CHOP'
};

/**
 * Mengevaluasi keselarasan antara tren mingguan (Primary Trend) dan setup harian (Intermediate Trend).
 *
 * @param {object} params
 * @param {Array<object>} params.dailyPoints
 * @param {Array<object>} [params.weeklyBars]
 * @param {string} [params.dailySignal]
 * @returns {object} Status keselarasan, skor konfluensi, dan multiplier ukuran posisi
 */
export function evaluateMultiTimeframeConfluence({ dailyPoints, weeklyBars, dailySignal = 'BUY' }) {
  const wBars = Array.isArray(weeklyBars) && weeklyBars.length >= 10
    ? weeklyBars
    : aggregateWeeklyBars(dailyPoints);

  const wInd = computeWeeklyIndicators(wBars);

  if (!wInd) {
    return {
      alignment: MTF_ALIGNMENT.NEUTRAL_CHOP,
      alignmentScore: 50,
      sizeMultiplier: 0.75,
      badge: 'MTF NEUTRAL',
      badgeClass: 'b-neu',
      weeklyTrend: 'UNKNOWN',
      dailySignal,
      guidance: 'Data historis mingguan tidak mencukupi untuk konfluensi penuh. Terapkan alokasi standar terkontrol.'
    };
  }

  const wTrend = wInd.primaryTrend;
  const isDailyBullish = dailySignal.includes('BUY');
  const isDailyBearish = dailySignal === 'AVOID' || dailySignal === 'SELL';

  let alignment = MTF_ALIGNMENT.NEUTRAL_CHOP;
  let alignmentScore = 50;
  let sizeMultiplier = 0.50;
  let badge = 'MTF NETRAL';
  let badgeClass = 'b-neu';
  let guidance = 'Kondisi pasar sideways multi-timeframe. Alokasikan posisi moderat.';

  // 1. Weekly UPTREND + Daily BUY = STRONG BULLISH CONFLUENCE
  if (wTrend === 'UPTREND' && isDailyBullish) {
    alignment = MTF_ALIGNMENT.STRONG_BULLISH_CONFLUENCE;
    alignmentScore = wInd.rsi14 >= 55 ? 95 : 85;
    sizeMultiplier = 1.0; // Ukuran posisi maksimal 100%
    badge = 'KONFLUENSI BULLISH (1.0x)';
    badgeClass = 'b-up';
    guidance = 'Tren primer mingguan dan sinyal harian selaras bullish. Setup prioritas tinggi dengan alokasi penuh.';
  }
  // 2. Weekly UPTREND + Daily Koreksi/Hold = PULLBACK IN UPTREND
  else if (wTrend === 'UPTREND' && !isDailyBullish && !isDailyBearish) {
    alignment = MTF_ALIGNMENT.PULLBACK_IN_UPTREND;
    alignmentScore = 75;
    sizeMultiplier = 0.75;
    badge = 'PULLBACK DALAM TREN NAIK (0.75x)';
    badgeClass = 'b-amb';
    guidance = 'Tren primer mingguan masih bullish kuat saat harga harian pullback sehat. Siapkan order beli bertahap dekat support.';
  }
  // 3. Weekly DOWNTREND + Daily BUY = COUNTER-TREND BOUNCE
  else if (wTrend === 'DOWNTREND' && isDailyBullish) {
    alignment = MTF_ALIGNMENT.COUNTER_TREND_BOUNCE;
    alignmentScore = 45;
    sizeMultiplier = 0.50; // Pangkas ukuran posisi 50%
    badge = 'COUNTER-TREND BOUNCE (0.50x)';
    badgeClass = 'b-amb';
    guidance = 'Sinyal harian berlawanan dengan tren turun mingguan. Batasi posisi 50%, ambil TP cepat, dan pasang stop loss ketat.';
  }
  // 4. Weekly DOWNTREND + Daily Bearish/AVOID = DISTRIBUTION BREAKDOWN
  else if (wTrend === 'DOWNTREND' && isDailyBearish) {
    alignment = MTF_ALIGNMENT.DISTRIBUTION_BREAKDOWN;
    alignmentScore = 15;
    sizeMultiplier = 0.0; // VETO MUTLAK: Jangan beli
    badge = 'BREAKDOWN DISTRIBUSI (0.0x)';
    badgeClass = 'b-dn';
    guidance = 'Tekanan jual terjadi serempak di timeframe harian dan mingguan. Blokir entri baru secara mutlak.';
  }

  return {
    alignment,
    alignmentScore,
    sizeMultiplier,
    badge,
    badgeClass,
    weeklyTrend: wTrend,
    weeklyRsi: wInd.rsi14,
    weeklyEma20: wInd.ema20,
    dailySignal,
    guidance
  };
}

/**
 * Siklus Pasar Wyckoff Kanonikal.
 */
export const WYCKOFF_PHASES = {
  ACCUMULATION: 'ACCUMULATION',
  MARKUP: 'MARKUP',
  DISTRIBUTION: 'DISTRIBUTION',
  MARKDOWN: 'MARKDOWN'
};

/**
 * Detektor Siklus Pasar Wyckoff Berbasis Struktur Harga, Volume Spread & Aliran Broker.
 *
 * @param {object} params
 * @param {Array<object>} params.dailyPoints - Data OHLCV harian (~60 - 250 bar)
 * @param {number} [params.currentPrice] - Harga pasar saat ini
 * @param {object} [params.brokerData] - Data broker summary / top buyers & sellers
 * @returns {object} Fase Wyckoff, sub-fase, skor keyakinan, dan panduan taktis
 */
export function detectWyckoffPhase({ dailyPoints, currentPrice = 0, brokerData = null }) {
  if (!Array.isArray(dailyPoints) || dailyPoints.length < 25) {
    return {
      phase: 'UNKNOWN',
      phaseLabel: 'Data Tidak Mencukupi',
      phaseDetail: 'Membutuhkan minimal 25 bar harian',
      badge: 'UNKNOWN',
      badgeClass: 'b-neu',
      confidence: 0,
      characteristics: [],
      recommendedAction: 'Wait and see hingga riwayat bar harga mencukupi.'
    };
  }

  const closes = dailyPoints.map(p => p.c);
  const n = closes.length;
  const curPrice = currentPrice > 0 ? currentPrice : closes[n - 1];

  // 1. Moving Averages
  const ema20 = computeEMA(closes, 20) || closes[n - 1];
  const ema50 = computeEMA(closes, 50) || closes[n - 1];
  const sma200 = computeSMA(closes, Math.min(n, 200)) || ema50;

  // 2. Rentang Harga 60 Bar Terakhir (Support & Resistance Struktural)
  const windowBars = dailyPoints.slice(-Math.min(n, 60));
  let minLow = Infinity, maxHigh = -Infinity;
  let totalVol = 0;

  for (const b of windowBars) {
    const h = Number(b.h ?? b.c ?? 0);
    const l = Number(b.l ?? b.c ?? 0);
    const v = Number(b.v ?? 0);
    if (h > maxHigh) maxHigh = h;
    if (l < minLow) minLow = l;
    totalVol += v;
  }

  const rangeSpan = Math.max(1, maxHigh - minLow);
  const rangePositionPct = Math.round(((curPrice - minLow) / rangeSpan) * 100);

  // 3. Karakteristik Volume Spread (Volume pada bar naik vs turun)
  let upVol = 0, downVol = 0;
  for (let i = 1; i < windowBars.length; i++) {
    const prev = windowBars[i - 1];
    const curr = windowBars[i];
    const v = Number(curr.v ?? 0);
    if (curr.c >= prev.c) upVol += v;
    else downVol += v;
  }
  const volUpRatio = (upVol + downVol) > 0 ? upVol / (upVol + downVol) : 0.5;

  // 4. Analisis Smart Money / Broker Flow (jika tersedia)
  let isSmartMoneyNetBuy = false;
  let isSmartMoneyNetSell = false;
  if (brokerData && brokerData.bandarmology) {
    const bm = brokerData.bandarmology;
    const v = String(bm.verdict || '').toUpperCase();
    if (v.includes('ACCUM')) isSmartMoneyNetBuy = true;
    if (v.includes('DISTRIB')) isSmartMoneyNetSell = true;
  }

  // 5. Algoritma Klasifikasi 4 Fase Wyckoff
  let phase = WYCKOFF_PHASES.ACCUMULATION;
  let phaseDetail = 'TRADING_RANGE';
  let phaseLabel = 'Fase 1: Akumulasi (Trading Range)';
  let badgeClass = 'b-up';
  let confidence = 70;
  const characteristics = [];
  let recommendedAction = 'Akumulasi bertahap di area support.';

  // FASE 1: ACCUMULATION (Spring Test / Shakeout di batas bawah dengan Smart Money Absorption)
  if ((curPrice <= minLow * 1.05 || rangePositionPct <= 25) && (isSmartMoneyNetBuy || (volUpRatio > 0.52 && curPrice >= minLow))) {
    phase = WYCKOFF_PHASES.ACCUMULATION;
    phaseDetail = 'PHASE_C_SPRING_TEST';
    phaseLabel = 'Fase 1: Akumulasi (Phase C: Spring / Shakeout Test)';
    badgeClass = 'b-up';
    confidence = 85;
    characteristics.push('Spring / Shakeout: Harga menguji batas bawah rentang lalu diserap oleh akumulasi Smart Money.');
    recommendedAction = 'Peluang akumulasi terbaik (risk-reward optimal) dengan stop loss ketat di bawah low.';
  }
  // FASE 2: MARKUP (Tren naik mapan, higher highs, harga di atas moving average)
  else if (curPrice > ema20 && ema20 > ema50 && rangePositionPct >= 65) {
    phase = WYCKOFF_PHASES.MARKUP;
    phaseLabel = 'Fase 2: Markup (Ekspansi Tren Naik)';
    badgeClass = 'b-up';
    confidence = 85;

    if (curPrice > maxHigh * 0.98) {
      phaseDetail = 'SIGN_OF_STRENGTH_BREAKOUT';
      characteristics.push('Breakout resistance dengan pembentukan Higher Highs (Sign of Strength).');
      recommendedAction = 'Manfaatkan momentum breakout; pasang trailing stop dinamis.';
    } else {
      phaseDetail = 'BACK_UP_TO_LPS';
      characteristics.push('Pullback sehat menguji support baru (Last Point of Support / LPS).');
      recommendedAction = 'Beli saat koreksi menyentuh EMA 20 dengan volume mereda.';
    }

    if (volUpRatio > 0.55) characteristics.push('Volume didominasi transaksi beli institusi.');
  }
  // FASE 4: MARKDOWN (Tren turun mapan, lower lows, harga di bawah moving average dan tanpa akumulasi smart money)
  else if (curPrice < ema20 && ema20 < ema50 && rangePositionPct <= 35 && !isSmartMoneyNetBuy) {
    phase = WYCKOFF_PHASES.MARKDOWN;
    phaseLabel = 'Fase 4: Markdown (Tren Turun / Panic Selling)';
    badgeClass = 'b-dn';
    confidence = 85;

    if (curPrice <= minLow * 1.02) {
      phaseDetail = 'SIGN_OF_WEAKNESS_BREAKDOWN';
      characteristics.push('Breakdown support penting mengkonfirmasi dominasi penjual (Sign of Weakness).');
      recommendedAction = 'Hindari total / Cut loss disiplin jika memegang posisi.';
    } else {
      phaseDetail = 'LPSY_RELIEF_RALLY';
      characteristics.push('Pantulan teknikal sementara di bawah resisten (Last Point of Supply).');
      recommendedAction = 'Manfaatkan setiap pantulan untuk mengurangi posisi ke kas tunai.';
    }

    if (volUpRatio < 0.45) characteristics.push('Tekanan jual tinggi pada setiap penurunan harga.');
  }
  // FASE 3: DISTRIBUTION (Di area puncak rentang, volume tinggi tanpa kemajuan harga)
  else if (rangePositionPct >= 70 && (isSmartMoneyNetSell || volUpRatio < 0.48 || curPrice < ema20)) {
    phase = WYCKOFF_PHASES.DISTRIBUTION;
    phaseLabel = 'Fase 3: Distribusi (Smart Money Profit Taking)';
    badgeClass = 'b-dn';
    confidence = 75;

    if (maxHigh > 0 && curPrice < maxHigh * 0.95 && maxHigh >= sma200 * 1.25) {
      phaseDetail = 'UPTHRUST_AFTER_DISTRIBUTION';
      characteristics.push('Upthrust After Distribution (UTAD): Sinyal beli palsu di area puncak diikuti penurunan.');
      recommendedAction = 'Eksekusi take profit bertahap; jangan tergiur buy di harga tinggi.';
    } else {
      phaseDetail = 'CHURNING_CLIMAX';
      characteristics.push('Aktivitas transaksi tinggi tanpa kemajuan kenaikan harga (Churning).');
      recommendedAction = 'Kunci keuntungan modal (take profit) dan hindari akumulasi baru.';
    }
  }
  // FASE 1: ACCUMULATION (Trading range umum)
  else {
    phase = WYCKOFF_PHASES.ACCUMULATION;
    phaseLabel = 'Fase 1: Akumulasi (Penyerapan Modal Bandar)';
    badgeClass = 'b-up';
    confidence = 75;

    if (rangePositionPct >= 40 && rangePositionPct <= 65) {
      phaseDetail = 'PHASE_B_BUILDING_CAUSE';
      characteristics.push('Fase pembentukan dasar (Trading Range) dengan volatilitas menyempit.');
      recommendedAction = 'Akumulasi bertahap dengan porsi kecil (dollar-cost averaging di rentang bawah).';
    } else {
      phaseDetail = 'PHASE_A_STOPPING_VOLUME';
      characteristics.push('Penghentian tren turun awal oleh penyerapan volume pembeli besar.');
      recommendedAction = 'Tunggu konfirmasi pembentukan higher low sebelum entri penuh.';
    }
  }

  return {
    phase,
    phaseDetail,
    phaseLabel,
    phaseName: phaseLabel,
    badge: phase,
    badgeClass,
    confidence,
    rangePositionPct,
    volUpRatio: Math.round(volUpRatio * 100),
    characteristics,
    recommendedAction,
    smartMoneyEvidence: isSmartMoneyNetBuy || isSmartMoneyNetSell
  };
}
