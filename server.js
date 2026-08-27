import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Helper formatting function for IDR
function fmtIdr(n) {
  return Math.round(n || 0).toLocaleString('id-ID');
}

// ══════════════════════════════════════════════════════════
// BACKEND RDN SYNCHRONIZATION & RECONCILIATION ENGINE
// ══════════════════════════════════════════════════════════
function reconcileRdnPayload(data) {
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const dividends = Array.isArray(data.dividends) ? data.dividends : [];
  const cryptoTx = Array.isArray(data.cryptoTx) ? data.cryptoTx : [];
  const rdTx = Array.isArray(data.rdTx) ? data.rdTx : [];
  const existingMutations = Array.isArray(data.rdnMutations) ? data.rdnMutations : [];
  const defaultSekuritas = data.activeSekuritas || 'Stockbit';

  // 1. Map existing manual / non-trade mutations (SETOR, TARIK, FEE, BIAYA, ADJUST, etc.)
  const preservedManualMutations = [];
  const existingTradeMutationsByLinkedId = new Map();

  existingMutations.forEach(m => {
    if (!m) return;
    const linkedId = m.linkedTxId != null ? String(m.linkedTxId) : null;
    if (linkedId) {
      existingTradeMutationsByLinkedId.set(linkedId, m);
    } else {
      // Manual deposit, withdrawal, fee, or balance adjustment
      preservedManualMutations.push({
        id: m.id || null,
        date: m.date || new Date().toISOString().split('T')[0],
        type: m.type || (m.amount >= 0 ? 'SETOR' : 'TARIK'),
        ket: m.ket || (m.type === 'SETOR' ? 'Setoran / Top Up Kas' : 'Penarikan Kas'),
        amount: Number(m.amount || 0),
        balance: 0,
        sekuritas: m.sekuritas || defaultSekuritas,
        account: m.account || 'saham',
        linkedTxId: null
      });
    }
  });

  const reconciledList = [...preservedManualMutations];
  let syncedTradesCount = 0;
  let syncedDividendsCount = 0;
  let syncedCryptoCount = 0;
  let syncedRdCount = 0;

  // 2. Reconcile Saham Transactions (BUY/SELL)
  transactions.forEach(tx => {
    if (!tx || !tx.id) return;
    const isBuy = tx.type === 'BUY';
    const gross = Number(tx.gross || (Number(tx.lot || 0) * 100 * Number(tx.price || 0)));
    const net = Number(tx.net || gross);
    const amount = isBuy ? -Math.abs(net) : Math.abs(net);
    const linkedId = String(tx.id);
    const existing = existingTradeMutationsByLinkedId.get(linkedId);

    reconciledList.push({
      id: existing && existing.id ? existing.id : null,
      date: tx.date || (existing && existing.date) || new Date().toISOString().split('T')[0],
      type: tx.type || (isBuy ? 'BUY' : 'SELL'),
      ket: (isBuy ? 'Beli ' : 'Jual ') + (tx.lot || 0) + ' lot ' + (tx.ticker || '') + ' @ Rp ' + fmtIdr(tx.price || 0),
      amount: amount,
      balance: 0,
      sekuritas: tx.sekuritas || defaultSekuritas,
      account: 'saham',
      linkedTxId: tx.id
    });
    syncedTradesCount++;
  });

  // 3. Reconcile Dividends
  dividends.forEach(d => {
    if (!d || !d.id) return;
    const gross = Number(d.gross || (Number(d.shares || 0) * Number(d.dps || 0)));
    const tax = Number(d.tax || (gross * 0.1));
    const net = Number(d.net || (gross - tax));
    const linkedId = 'div-' + d.id;
    const existing = existingTradeMutationsByLinkedId.get(linkedId);

    reconciledList.push({
      id: existing && existing.id ? existing.id : null,
      date: d.date || (existing && existing.date) || new Date().toISOString().split('T')[0],
      type: 'DIVIDEN',
      ket: 'Dividen ' + (d.ticker || '') + ' (' + fmtIdr(d.shares || 0) + ' lbr @ Rp ' + fmtIdr(d.dps || 0) + ')',
      amount: Math.abs(net),
      balance: 0,
      sekuritas: d.sekuritas || defaultSekuritas,
      account: 'saham',
      linkedTxId: linkedId
    });
    syncedDividendsCount++;
  });

  // 4. Reconcile Crypto Transactions
  cryptoTx.forEach(c => {
    if (!c || !c.id) return;
    const isBuy = c.type === 'BUY';
    const total = Number(c.total || (Number(c.qty || 0) * Number(c.priceIdr || 0)));
    const amount = isBuy ? -Math.abs(total) : Math.abs(total);
    const linkedId = 'cr-' + c.id;
    const existing = existingTradeMutationsByLinkedId.get(linkedId) || existingTradeMutationsByLinkedId.get('crypto-' + c.id);

    reconciledList.push({
      id: existing && existing.id ? existing.id : null,
      date: c.date || (existing && existing.date) || new Date().toISOString().split('T')[0],
      type: c.type || (isBuy ? 'BUY' : 'SELL'),
      ket: (isBuy ? 'Beli ' : 'Jual ') + (c.qty || 0) + ' ' + (c.coin || '') + ' @ Rp ' + fmtIdr(Math.round(c.priceIdr || 0)),
      amount: amount,
      balance: 0,
      sekuritas: 'Crypto Exchange',
      account: 'crypto',
      linkedTxId: linkedId
    });
    syncedCryptoCount++;
  });

  // 5. Reconcile Reksa Dana Transactions
  rdTx.forEach(r => {
    if (!r || !r.id) return;
    const isBeli = (r.type === 'BELI' || r.type === 'BUY');
    const amount = isBeli ? -Math.abs(Number(r.amount || 0)) : Math.abs(Number(r.amount || 0));
    const linkedId = 'rd-' + r.id;
    const existing = existingTradeMutationsByLinkedId.get(linkedId);

    reconciledList.push({
      id: existing && existing.id ? existing.id : null,
      date: r.date || (existing && existing.date) || new Date().toISOString().split('T')[0],
      type: isBeli ? 'BUY' : 'SELL',
      ket: (isBeli ? 'Beli RD ' : 'Jual RD ') + (r.code || 'Reksa Dana') + ' (NAB Rp ' + fmtIdr(Math.round(r.nab || 1000)) + ')',
      amount: amount,
      balance: 0,
      sekuritas: 'Platform RD',
      account: 'reksadana',
      linkedTxId: linkedId
    });
    syncedRdCount++;
  });

  // 6. Deterministic Chronological Sorting
  function getPriority(type) {
    if (type === 'SETOR' || type === 'TOPUP') return 10;
    if (type === 'DIVIDEN' || type === 'DIVIDEND') return 20;
    if (type === 'SELL') return 30;
    if (type === 'BUY') return 40;
    if (type === 'TARIK') return 50;
    return 60; // Fees, Adjustments, Others
  }

  reconciledList.sort((a, b) => {
    const dComp = (a.date || '').localeCompare(b.date || '');
    if (dComp !== 0) return dComp;
    const pA = getPriority(a.type);
    const pB = getPriority(b.type);
    if (pA !== pB) return pA - pB;
    return ((a.id || 0) - (b.id || 0));
  });

  // 7. Deterministic Sequential ID Assignment & Running Balance Recalculation
  let currentId = 1;
  let balSaham = 0;
  let balCrypto = 0;
  let balRd = 0;

  reconciledList.forEach(m => {
    m.id = currentId++;
    const amt = Number(m.amount || 0);
    m.amount = amt;
    const acc = m.account || 'saham';
    m.account = acc;

    if (acc === 'crypto') {
      balCrypto += amt;
      m.balance = balCrypto;
    } else if (acc === 'reksadana') {
      balRd += amt;
      m.balance = balRd;
    } else {
      balSaham += amt;
      m.balance = balSaham;
    }
  });

  const totalCashBalance = balSaham + balCrypto + balRd;

  return {
    reconciledMutations: reconciledList,
    stats: {
      totalMutations: reconciledList.length,
      syncedTrades: syncedTradesCount,
      syncedDividends: syncedDividendsCount,
      syncedCrypto: syncedCryptoCount,
      syncedRd: syncedRdCount,
      preservedManual: preservedManualMutations.length,
      balanceSaham: balSaham,
      balanceCrypto: balCrypto,
      balanceRd: balRd,
      totalCashBalance: totalCashBalance
    },
    nextRdnId: currentId
  };
}

// POST endpoint to reconcile RDN mutations against latest app state
app.post('/api/sync/reconcile-rdn', (req, res) => {
  try {
    const data = req.body || {};
    const result = reconcileRdnPayload(data);
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (err) {
    console.error('RDN reconcile error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to reconcile RDN mutations',
      message: err.message
    });
  }
});

// POST endpoint to audit RDN data alignment
app.post('/api/sync/audit-rdn', (req, res) => {
  try {
    const data = req.body || {};
    const currentMutations = Array.isArray(data.rdnMutations) ? data.rdnMutations : [];
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const dividends = Array.isArray(data.dividends) ? data.dividends : [];
    const cryptoTx = Array.isArray(data.cryptoTx) ? data.cryptoTx : [];
    const rdTx = Array.isArray(data.rdTx) ? data.rdTx : [];

    // Find missing and orphan mutations
    const existingLinkedIds = new Set(
      currentMutations
        .filter(m => m && m.linkedTxId != null)
        .map(m => String(m.linkedTxId))
    );

    const missingStockTrades = transactions.filter(t => t && t.id && !existingLinkedIds.has(String(t.id)));
    const missingDividends = dividends.filter(d => d && d.id && !existingLinkedIds.has('div-' + d.id));
    const missingCrypto = cryptoTx.filter(c => c && c.id && !existingLinkedIds.has('cr-' + c.id) && !existingLinkedIds.has('crypto-' + c.id));
    const missingRd = rdTx.filter(r => r && r.id && !existingLinkedIds.has('rd-' + r.id));

    const validParentLinkedIds = new Set([
      ...transactions.map(t => String(t.id)),
      ...dividends.map(d => 'div-' + d.id),
      ...cryptoTx.map(c => 'cr-' + c.id),
      ...cryptoTx.map(c => 'crypto-' + c.id),
      ...rdTx.map(r => 'rd-' + r.id)
    ]);

    const orphanMutations = currentMutations.filter(m => {
      if (!m || m.linkedTxId == null) return false;
      return !validParentLinkedIds.has(String(m.linkedTxId));
    });

    const isFullySynced = (
      missingStockTrades.length === 0 &&
      missingDividends.length === 0 &&
      missingCrypto.length === 0 &&
      missingRd.length === 0 &&
      orphanMutations.length === 0
    );

    return res.json({
      success: true,
      isFullySynced,
      summary: {
        missingStockTradesCount: missingStockTrades.length,
        missingDividendsCount: missingDividends.length,
        missingCryptoCount: missingCrypto.length,
        missingRdCount: missingRd.length,
        orphanMutationsCount: orphanMutations.length,
        totalDiscrepancies: missingStockTrades.length + missingDividends.length + missingCrypto.length + missingRd.length + orphanMutations.length
      },
      discrepancies: {
        missingStockTrades: missingStockTrades.slice(0, 10),
        missingDividends: missingDividends.slice(0, 10),
        missingCrypto: missingCrypto.slice(0, 10),
        missingRd: missingRd.slice(0, 10),
        orphanMutations: orphanMutations.slice(0, 10)
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to audit RDN synchronization',
      message: err.message
    });
  }
});

// Lazy initialize Google GenAI SDK client
let _aiClient = null;
function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!_aiClient) {
    _aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return _aiClient;
}

// Fallback high-impact Indonesian stock market news headlines
function getFallbackHeadlines() {
  return [
    {
      id: 1,
      title: "IHSG Menguat Ditopang Arus Dana Asing (Net Buy) pada Saham Big Cap Perbankan",
      summary: "Indeks Harga Saham Gabungan (IHSG) bergerak positif didorong oleh berlanjutnya akumulasi investor asing pada saham-saham perbankan berkapitalisasi besar seperti BBCA, BBRI, dan BMRI menjelang rilis kinerja kuartalan.",
      source: "CNBC Indonesia",
      url: "https://www.cnbcindonesia.com/market",
      category: "IHSG & Perbankan",
      impact: "BULLISH",
      impactReason: "Foreign Inflow Kuat",
      tickers: ["BBCA", "BBRI", "BMRI"],
      time: "Terbaru"
    },
    {
      id: 2,
      title: "Sektor Energi & Transisi Hijau: PGEO Perluas Ekspansi Kapasitas Pembangkit Geothermal",
      summary: "PT Pertamina Geothermal Energy Tbk (PGEO) mempercepat peningkatan kapasitas terpasang pembangkit listrik tenaga panas bumi guna memenuhi target dekarbonisasi dan meningkatkan pendapatan berulang jangka panjang.",
      source: "Bisnis.com",
      url: "https://market.bisnis.com",
      category: "Energi Baru Terbarukan",
      impact: "BULLISH",
      impactReason: "Ekspansi Kapasitas",
      tickers: ["PGEO"],
      time: "Terbaru"
    },
    {
      id: 3,
      title: "Bank Indonesia Pertahankan BI-Rate, Stabilitas Rupiah dan Kebijakan Makroprudensial Terjaga",
      summary: "Bank Indonesia mempertahankan suku bunga acuan BI-Rate untuk memperkuat stabilisasi nilai tukar Rupiah serta menjaga laju inflasi dalam sasaran target, memberikan sentimen kepastian bagi emiten domestik.",
      source: "Kontan",
      url: "https://investasi.kontan.co.id",
      category: "Makroekonomi & Moneter",
      impact: "NEUTRAL",
      impactReason: "Suku Bunga Stabil",
      tickers: ["TLKM", "ASII", "BBRI"],
      time: "Terbaru"
    }
  ];
}

// News cache (TTL 5 minutes)
let newsCache = {
  data: null,
  grounded: false,
  groundingCount: 0,
  timestamp: 0,
  rateLimitedUntil: 0
};

// Top 3 Trending Indonesian Stock Market News endpoint with Google Search Grounding
app.get('/api/trending-news', async (req, res) => {
  const force = req.query.force === 'true';
  const now = Date.now();
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // If we have valid cache, serve it immediately
  if (!force && newsCache.data && (now - newsCache.timestamp < CACHE_TTL_MS)) {
    return res.json({
      success: true,
      cached: true,
      grounded: newsCache.grounded,
      groundingCount: newsCache.groundingCount,
      timestamp: newsCache.timestamp,
      headlines: newsCache.data
    });
  }

  // If rate limited recently (within backoff window), return cached or fallback news without calling API
  if (now < newsCache.rateLimitedUntil) {
    const fallback = newsCache.data || getFallbackHeadlines();
    return res.json({
      success: true,
      cached: true,
      grounded: false,
      isFallback: true,
      timestamp: now,
      headlines: fallback
    });
  }

  const ai = getAiClient();
  if (!ai) {
    const fallback = getFallbackHeadlines();
    return res.json({
      success: true,
      cached: false,
      grounded: false,
      isFallback: true,
      timestamp: now,
      headlines: fallback
    });
  }

  try {
    const prompt = `Search live Google for the top 3 trending financial and stock market news in Indonesia (Bursa Efek Indonesia / IDX, IHSG, big cap stocks like BBCA, BBRI, BMRI, PGEO, TLKM, ASII, ANTM, corporate actions, energy/commodities, or Bank Indonesia monetary policies).
Select the 3 most important, verified, and impactful stories for stock investors today.
Return a STRICT JSON array containing exactly 3 items. Do NOT wrap in markdown \`\`\`json. Output ONLY raw JSON array:
[
  {
    "id": 1,
    "title": "Clear concise Indonesian headline",
    "summary": "1-2 sentences explaining what happened and the practical impact on Indonesian stocks or investors.",
    "source": "Publisher/media name (e.g. CNBC Indonesia, Bisnis.com, Kontan, Bloomberg Technoz, Reuters)",
    "url": "https://...",
    "category": "e.g. Perbankan / Energi & Komoditas / IHSG & Makro / Korporasi",
    "impact": "BULLISH" or "BEARISH" or "NEUTRAL",
    "impactReason": "Short 2-4 words reason",
    "tickers": ["BBRI", "BMRI"]
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const rawText = response.text || '';
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    let parsed = null;
    try {
      let cleanJson = rawText.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      const firstBracket = cleanJson.indexOf('[');
      const lastBracket = cleanJson.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        cleanJson = cleanJson.substring(firstBracket, lastBracket + 1);
        parsed = JSON.parse(cleanJson);
      }
    } catch (parseErr) {
      console.warn('JSON parse notice on grounded news response:', parseErr.message);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      parsed = getFallbackHeadlines();
    } else {
      parsed = parsed.slice(0, 3).map((item, idx) => {
        if (!item.id) item.id = idx + 1;
        if (!Array.isArray(item.tickers)) item.tickers = [];
        if (!item.impact) item.impact = 'NEUTRAL';
        if (!item.category) item.category = 'Pasar Saham IDX';

        // Enhance with verified grounding chunks if available
        if (groundingChunks[idx] && groundingChunks[idx].web) {
          const web = groundingChunks[idx].web;
          if (!item.url || item.url === '#' || !item.url.startsWith('http')) {
            item.url = web.uri || item.url;
          }
          if (web.title && (!item.source || item.source === 'Media Finansial')) {
            item.source = web.title;
          }
        }
        return item;
      });
    }

    newsCache = {
      data: parsed,
      grounded: groundingChunks.length > 0,
      groundingCount: groundingChunks.length,
      timestamp: now,
      rateLimitedUntil: 0
    };

    return res.json({
      success: true,
      cached: false,
      grounded: true,
      groundingCount: groundingChunks.length,
      timestamp: now,
      headlines: parsed
    });
  } catch (err) {
    const errMessage = (err && err.message) ? err.message : String(err);
    // Backoff 2 minutes on 429 quota exhaustion
    if (errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED') || errMessage.includes('quota')) {
      console.warn('Gemini API notice: Quota limit reached. Serving fallback market news.');
      newsCache.rateLimitedUntil = now + 120000;
    } else {
      console.warn('Gemini grounded news notice:', errMessage);
    }

    const fallback = getFallbackHeadlines();
    newsCache.data = fallback;
    newsCache.timestamp = now;

    return res.json({
      success: true,
      cached: false,
      grounded: false,
      isFallback: true,
      quotaExhausted: errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED'),
      timestamp: now,
      headlines: fallback
    });
  }
});

// In-memory cache for external market data requests (TTL 60s for live quotes, 300s for historical)
const proxyCache = new Map();

// Proxy endpoint for external financial feeds / CORS bypass with server-side caching
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url parameter' });
  }

  // Determine TTL: 5 minutes (300s) for range/daily historical charts, 45s for 1m intraday
  const isHistorical = targetUrl.includes('range=1y') || targetUrl.includes('range=2y') || targetUrl.includes('interval=1d');
  const cacheTtlMs = isHistorical ? 300000 : 45000;
  const now = Date.now();

  const cached = proxyCache.get(targetUrl);
  if (cached && (now - cached.timestamp < cacheTtlMs)) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('X-Cache', 'HIT');
    return res.status(cached.status).send(cached.data);
  }

  try {
    const isYahoo = targetUrl.includes('finance.yahoo.com');
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    };
    if (isYahoo) {
      fetchHeaders['Origin'] = 'https://finance.yahoo.com';
      fetchHeaders['Referer'] = 'https://finance.yahoo.com/';
    }

    let response = await fetch(targetUrl, { headers: fetchHeaders });

    // Jika query1 gagal (404/429/500), coba alihkan otomatis ke query2
    if (!response.ok && targetUrl.includes('query1.finance.yahoo.com')) {
      const altUrl = targetUrl.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com');
      try {
        const altResp = await fetch(altUrl, { headers: fetchHeaders });
        if (altResp.ok) {
          response = altResp;
        }
      } catch (e) {}
    }

    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Cache', 'MISS');

    const text = await response.text();
    if (response.ok) {
      proxyCache.set(targetUrl, {
        data: text,
        contentType,
        status: response.status,
        timestamp: now
      });
      // Limit cache size to prevent memory leaks
      if (proxyCache.size > 500) {
        const firstKey = proxyCache.keys().next().value;
        proxyCache.delete(firstKey);
      }
    }

    return res.status(response.status).send(text);
  } catch (err) {
    // If upstream fetch fails but we have stale cache, return stale as fallback
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('X-Cache', 'STALE');
      return res.status(cached.status).send(cached.data);
    }

    res.status(502).json({
      error: 'Proxy request failed',
      message: err.message
    });
  }
});

// Serve static assets from project root
app.use(express.static(__dirname, {
  extensions: ['html', 'htm']
}));

// Route fallback
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'moneywatch.html'));
});

// Start HTTP server on 0.0.0.0:3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Money Watch Pro server running on http://0.0.0.0:${PORT}`);
});
