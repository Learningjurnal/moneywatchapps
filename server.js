import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  loadBaseUniverse,
  fetchYahooQuote,
  fetchYahooHistory,
  getYahooCrumb,
  computeStockSignal,
  computeStockSignalBatch,
  runStrategyBacktest,
  runAllStrategiesBacktest,
  STRATEGY_DEFINITIONS,
  getIdxMarketSummary,
  getIdxCalendarData,
  getUniverseOpportunityRadar,
  getUniverseAccumulationDistribution,
  getTransactionFlowVisualizer,
  getBeiTickSize,
  generateBrokerSummary,
  fetchIdxStockScreener,
  IDX_BROKERS,
  generateTradingHypothesis,
  generateExitHypothesis,
  assessDataQuality,
  classifyMarketRegime
} from './lib/idx-data-engine.js';
import { getQuotaUsage, getMetricsToday, MONTHLY_QUOTA } from './lib/invezgo-client.js';
import { logAuthMismatchTelemetry, enforceIdentityStage2 } from './lib/auth-verify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// FIX AUDIT: express.json()'s default body-size limit is 100kb - a
// portfolio with a realistic number of transactions (hundreds to
// thousands, as a multi-year trading history accumulates) easily exceeds
// that, well under the route's own explicit 10MB check further down in
// /api/user-data/save. Express's body-parser middleware rejects the
// request with a 413 BEFORE it ever reaches that route handler, and the
// client's fire-and-forget fetch (no response handling) swallows the
// failure silently - saveData() reports success while nothing was
// actually persisted server-side. Raised to match the route's own
// documented 10MB ceiling.
app.use(express.json({ limit: '10mb' }));

// FIX (bug, bukan keputusan sumber data): endpoint AI (Gemini) sebelumnya
// TANPA rate limiting sama sekali — bisa dipakai membengkakkan biaya API
// tanpa batas kalau ada traffic tinggi/disalahgunakan. Rate limiter
// in-memory sederhana per-IP, tanpa dependency baru (tidak perlu npm
// install tambahan). Reset otomatis tiap window habis.
function createRateLimiter(windowMs, maxRequests) {
  const hits = new Map(); // ip -> { count, resetAt }
  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: `Terlalu banyak permintaan AI. Coba lagi dalam ${retryAfterSec} detik.`
      });
    }
    // Bersihkan entry kedaluwarsa sesekali agar Map tidak bocor memori
    if (hits.size > 5000) {
      for (const [k, v] of hits) { if (now >= v.resetAt) hits.delete(k); }
    }
    next();
  };
}
const aiRateLimiter = createRateLimiter(60 * 1000, 10); // 10 request/menit/IP

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Helper formatting function for IDR
function fmtIdr(n) {
  return Math.round(n || 0).toLocaleString('id-ID');
}

// ══════════════════════════════════════════════════════════
// SERVER-SIDE USER DATA PERSISTENCE MIRROR & RECOVERY
// ══════════════════════════════════════════════════════════
const USER_STORES_DIR = path.join(__dirname, 'data', 'user-stores');
if (!fs.existsSync(USER_STORES_DIR)) {
  try {
    fs.mkdirSync(USER_STORES_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create user-stores dir:', e);
  }
}

function getSafeFileKey(uidOrEmail) {
  if (!uidOrEmail) return 'global_user';
  return String(uidOrEmail).toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

// FIX AUDIT (Firebase→Supabase migration): this file used to also
// replicate every save to a Firestore document via raw REST calls
// (syncRecordToFirestoreCloud, toFirestoreValue/fromFirestoreValue, a
// FIREBASE_CONFIG constant, and a /api/sync/firebase-audit route - all
// removed) against a project the account operating this app never had
// Owner/Editor access to, using a bare PATCH with no updateMask that could
// silently full-replace the document with whatever partial payload
// happened to be in flight. Per-user data now lives in Supabase, written
// directly by the authenticated client (see public/js/02-storage.js's
// fireSaveAllData()) - this server route's job is only the local-disk
// mirror below, which stays database-agnostic.
app.post('/api/user-data/save', async (req, res) => {
  const body = req.body || {};
  const rawPayload = JSON.stringify(body);
  if (rawPayload.length > 10 * 1024 * 1024) {
    return res.status(413).json({ success: false, error: 'Payload exceeds maximum limit (10MB)' });
  }
  const uid = (body.uid || body.email || '').trim();
  if (!uid) {
    return res.status(400).json({ success: false, error: 'User ID (uid) is required to save data' });
  }

  const isDemo = (uid === 'demo_guest_user' || uid === 'guest_user');

  // MW-P0-001 Stage 1 (telemetry only — does not check or block anything
  // here): logs, elsewhere, whether the caller's real Supabase session
  // matches the identity it claims via body.uid/email. See the
  // lib/auth-*.js identity module's file header for the staged-rollout
  // rationale (never trust a keyword match alone — read the code).
  logAuthMismatchTelemetry(req, uid, body.email, isDemo);

  // Stage 2 — off by default (AUTH_ENFORCE_STAGE2 env flag unset); becomes
  // a real 401/403 only once explicitly turned on after reviewing Stage 1's
  // logs above in production. See lib/auth-*.js for the rollout rationale.
  if (await enforceIdentityStage2(req, res, uid, body.email, isDemo)) return;

  const record = {
    uid: uid,
    email: body.email || '',
    savedAt: body.savedAt || new Date().toISOString(),
    serverReceivedAt: new Date().toISOString(),
    data: body.data || body
  };

  // FIX: this handler's on-disk write ALWAYS fails on Vercel — its
  // serverless functions run on a read-only filesystem outside /tmp, so
  // every fs.writeFileSync() call here throws EROFS. The old code let that
  // throw abort the whole handler (including the broadcast below) and
  // still told the client "Data successfully persisted to server mirror"
  // whenever it happened not to throw — meaning the client's "✓ Tersimpan
  // lokal & server" message never actually verified the "server" half.
  // Persisting real per-user server-side storage isn't possible on this
  // platform without a real database, which is exactly what Supabase now
  // is — so this write is now best-effort/diagnostic only, and the
  // response honestly reports whether it actually landed on disk.
  let diskPersisted = false;
  let diskError = null;
  try {
    const safeKey = getSafeFileKey(uid);
    const filePath = path.join(USER_STORES_DIR, `user_${safeKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
    diskPersisted = true;
  } catch (err) {
    diskError = err.message;
  }

  // Broadcast to other connected devices regardless of the disk write's
  // outcome — this is a pure in-memory relay (see broadcastSyncUpdate),
  // it has no dependency on the filesystem and shouldn't be held hostage
  // to a write that structurally can never succeed here.
  if (!isDemo) {
    try {
      broadcastSyncUpdate(uid, record.data, req.headers['x-device-session-id'] || null);
    } catch (err) {
      console.warn('SSE broadcast notice:', err.message);
    }
  }

  const txCount = (record.data && Array.isArray(record.data.transactions)) ? record.data.transactions.length : 0;
  const rdnCount = (record.data && Array.isArray(record.data.rdnMutations)) ? record.data.rdnMutations.length : 0;

  return res.json({
    success: true,
    diskPersisted: diskPersisted,
    diskError: diskError,
    message: diskPersisted
      ? (isDemo ? 'Demo session saved locally to isolated demo store' : 'Data successfully persisted to server mirror')
      : 'Multi-device broadcast sent; on-disk mirror unavailable on this host (Supabase Cloud is the real persistence layer)',
    savedAt: record.savedAt,
    stats: { transactions: txCount, rdnMutations: rdnCount }
  });
});

app.get('/api/user-data/load', async (req, res) => {
  try {
    const uid = (req.query.uid || req.query.email || '').trim();
    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'User ID (uid) is required'
      });
    }

    // MW-P0-001 Stage 1: observe (never blocks) whether the caller's real
    // Supabase session matches the identity it claims via query.uid/email.
    const isDemoLoad = (uid === 'demo_guest_user' || uid === 'guest_user');
    logAuthMismatchTelemetry(req, uid, req.query.email, isDemoLoad);

    // Stage 2 — off by default (AUTH_ENFORCE_STAGE2 env flag unset). See
    // lib/auth-*.js for the rollout rationale.
    if (await enforceIdentityStage2(req, res, uid, req.query.email, isDemoLoad)) return;

    // Demo/Guest account operates strictly in an isolated clean session with 0 initial positions
    if (uid === 'demo_guest_user' || uid === 'guest_user') {
      const demoKey = getSafeFileKey('demo_guest_user');
      const demoPath = path.join(USER_STORES_DIR, `user_${demoKey}.json`);
      if (fs.existsSync(demoPath)) {
        const raw = fs.readFileSync(demoPath, 'utf8');
        const record = JSON.parse(raw);
        return res.json({
          success: true,
          found: true,
          record: record
        });
      }
      return res.json({
        success: true,
        found: false,
        record: null,
        message: 'Demo account operates in isolated clean session'
      });
    }

    let targetPath = null;
    const safeKey = getSafeFileKey(uid);
    const filePath = path.join(USER_STORES_DIR, `user_${safeKey}.json`);
    if (fs.existsSync(filePath)) {
      targetPath = filePath;
    }

    // Check exact normalized key
    if (!targetPath) {
      const altKey = String(uid).toLowerCase().replace(/_40/g, '_').replace(/[^a-z0-9_]/g, '_');
      const altPath = path.join(USER_STORES_DIR, `user_${altKey}.json`);
      if (fs.existsSync(altPath)) {
        targetPath = altPath;
      }
    }

    // CRITICAL SECURITY ENFORCEMENT:
    // NEVER fall back to latest_backup.json or any other user's file.
    if (!targetPath) {
      return res.json({
        success: true,
        found: false,
        record: null,
        message: 'No server persistence record found for this user'
      });
    }

    const raw = fs.readFileSync(targetPath, 'utf8');
    const record = JSON.parse(raw);

    // Verify tenant ownership matches requested UID
    const recordUidNorm = String(record.uid || '').toLowerCase().replace(/_40/g, '_').replace(/[^a-z0-9_]/g, '_');
    const requestedUidNorm = String(uid).toLowerCase().replace(/_40/g, '_').replace(/[^a-z0-9_]/g, '_');
    if (recordUidNorm && recordUidNorm !== requestedUidNorm) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: tenant isolation mismatch'
      });
    }

    return res.json({
      success: true,
      found: true,
      record: record
    });
  } catch (err) {
    console.error('Server load data error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load user data from server',
      message: err.message
    });
  }
});

app.post('/api/user-data/clear', async (req, res) => {
  try {
    const body = req.body || {};
    const uid = (body.uid || body.email || req.query.uid || req.query.email || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    // MW-P0-001 Stage 1: observe (never blocks) whether the caller's real
    // Supabase session matches the identity it claims. /clear is the most
    // dangerous of the three endpoints (it deletes another user's data if
    // uid is spoofed), so this signal matters most here.
    const isDemoClear = (uid === 'demo_guest_user' || uid === 'guest_user');
    logAuthMismatchTelemetry(req, uid, body.email || req.query.email, isDemoClear);

    // Stage 2 — off by default (AUTH_ENFORCE_STAGE2 env flag unset). This
    // is the highest-priority endpoint to eventually enforce on (it
    // DELETES another user's data if uid is spoofed) — see lib/auth-*.js
    // for the rollout rationale on why it isn't flipped on yet.
    if (await enforceIdentityStage2(req, res, uid, body.email || req.query.email, isDemoClear)) return;

    const safeKey = getSafeFileKey(uid);
    const altKey = String(uid).toLowerCase().replace(/_40/g, '_').replace(/[^a-z0-9_]/g, '_');

    if (fs.existsSync(USER_STORES_DIR)) {
      const files = fs.readdirSync(USER_STORES_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        if (file.includes(safeKey) || file.includes(altKey)) {
          try { fs.unlinkSync(path.join(USER_STORES_DIR, file)); } catch(e){}
        }
      }
    }

    // Always ensure latest_backup is removed when clearing
    const backupPath = path.join(USER_STORES_DIR, 'latest_backup.json');
    if (fs.existsSync(backupPath)) {
      try { fs.unlinkSync(backupPath); } catch(e){}
    }

    // Write an explicit empty record file so any fallback reads know transactions are 0
    if (uid) {
      const safeKey = getSafeFileKey(uid);
      const altKey = String(uid).toLowerCase().replace(/_40/g, '_').replace(/[^a-z0-9_]/g, '_');
      const emptyRecord = {
        uid: uid,
        savedAt: new Date().toISOString(),
        clearedAt: new Date().toISOString(),
        data: {
          transactions: [],
          dividends: [],
          rdnMutations: [],
          cryptoTx: [],
          etfTx: [],
          rdTx: [],
          divInvestData: [],
          theses: [],
          journals: [],
          priceAlerts: [],
          wealth: { income: 0, expense: 0, bank: [], debt: [], emas: 0, obligasi: 0, deposito: 0 },
          equityHistory: [],
          rdnBalance: 0,
          cashAccounts: { saham: { balance: 0 }, crypto: { balance: 0 }, reksadana: { balance: 0 } },
          tradeStrategy: {},
          isExplicitlyEmpty: true,
          updatedAt: new Date().toISOString()
        }
      };
      try { fs.writeFileSync(path.join(USER_STORES_DIR, `user_${safeKey}.json`), JSON.stringify(emptyRecord, null, 2), 'utf8'); } catch(e){}
      try { fs.writeFileSync(path.join(USER_STORES_DIR, `user_${altKey}.json`), JSON.stringify(emptyRecord, null, 2), 'utf8'); } catch(e){}
    }

    return res.json({
      success: true,
      message: 'Server storage mirror cleared successfully, transactions set to 0'
    });
  } catch (err) {
    console.error('Server clear data error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to clear user data on server',
      message: err.message
    });
  }
});

// ══════════════════════════════════════════════════════════
// REALTIME MULTI-DEVICE SYNCHRONIZATION BUS (SSE STREAM)
// ══════════════════════════════════════════════════════════
const syncClients = new Map(); // Map<string (clientId), { uid: string, res: Response, deviceId: string }>

function broadcastSyncUpdate(targetUid, dataObj, originDeviceId) {
  if (!targetUid || !dataObj) return;
  // Never broadcast demo data or to demo accounts
  if (targetUid === 'demo_guest_user' || targetUid === 'guest_user') return;

  const normalizedTargetUid = String(targetUid).toLowerCase().replace(/_40/g, '_').replace(/[^a-z0-9_]/g, '_');
  
  const payloadStr = JSON.stringify({
    type: 'PORTFOLIO_SYNC_UPDATE',
    uid: targetUid,
    updatedAt: dataObj.updatedAt || new Date().toISOString(),
    data: dataObj,
    originDeviceId: originDeviceId || null
  });

  let recipientCount = 0;
  for (const [clientId, client] of syncClients.entries()) {
    // STRICT TENANT ISOLATION: client.uid MUST be valid, non-empty, and strictly match targetUid
    if (!client.uid || client.uid === 'demo_guest_user' || client.uid === 'guest_user') {
      continue;
    }
    const clientNormalizedUid = String(client.uid).toLowerCase().replace(/_40/g, '_').replace(/[^a-z0-9_]/g, '_');
    if (clientNormalizedUid === normalizedTargetUid) {
      if (originDeviceId && client.deviceId === originDeviceId) {
        // Skip echo to the exact same device that originated the save
        continue;
      }
      try {
        client.res.write(`data: ${payloadStr}\n\n`);
        recipientCount++;
      } catch (err) {
        console.warn(`Error writing SSE to client ${clientId}:`, err.message);
        try { client.res.end(); } catch (e) {}
        syncClients.delete(clientId);
      }
    }
  }
  if (recipientCount > 0) {
    console.log(`[SSE Sync Bus] Broadcasted portfolio update for ${targetUid} to ${recipientCount} other active device session(s).`);
  }
}

// Server-Sent Events endpoint for multi-device realtime sync
app.get('/api/sync/stream', (req, res) => {
  const uid = (req.query.uid || req.query.email || '').trim();
  const deviceId = req.query.deviceId || req.headers['x-device-session-id'] || 'device_' + Math.random().toString(36).slice(2, 9);
  const clientId = 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders && res.flushHeaders();

  // If unauthenticated or demo account, do not attach to multi-device sync listener
  if (!uid || uid === 'demo_guest_user' || uid === 'guest_user') {
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, deviceId, mode: 'isolated_demo', timestamp: new Date().toISOString() })}\n\n`);
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (err) {
        clearInterval(heartbeatTimer);
      }
    }, 20000);
    req.on('close', () => {
      clearInterval(heartbeatTimer);
      try { res.end(); } catch (e) {}
    });
    return;
  }

  syncClients.set(clientId, { uid, deviceId, res });
  console.log(`[SSE Sync Bus] Device connected: ${clientId} (uid: ${uid}, deviceId: ${deviceId}). Total active: ${syncClients.size}`);

  // Send initial handshake
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, deviceId, timestamp: new Date().toISOString() })}\n\n`);

  // Periodic heartbeat every 20s to keep connection alive through reverse proxies
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (err) {
      clearInterval(heartbeatTimer);
      syncClients.delete(clientId);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    syncClients.delete(clientId);
    console.log(`[SSE Sync Bus] Device disconnected: ${clientId}. Remaining: ${syncClients.size}`);
  });
});

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

// Timeout helper to ensure AI API calls never hang indefinitely
function withTimeout(promise, ms = 15000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI_REQUEST_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// Robust wrapper with exponential backoff & multi-model fallback for high demand (503/429)
async function callGeminiWithRetryAndFallback(ai, requestConfig, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const maxRetries = options.maxRetries ?? 2;
  const primaryModel = requestConfig.model || 'gemini-3.5-flash';
  // List of fallback models if primary model is unavailable
  const fallbackModels = [
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
  ].filter((v, idx, arr) => arr.indexOf(v) === idx);

  let lastError = null;

  for (let modelIdx = 0; modelIdx < fallbackModels.length; modelIdx++) {
    const candidateModel = fallbackModels[modelIdx];
    const candidateConfig = {
      ...requestConfig,
      model: candidateModel
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await withTimeout(
          ai.models.generateContent(candidateConfig),
          timeoutMs
        );
        return { response, usedModel: candidateModel };
      } catch (err) {
        lastError = err;
        const errMsg = String(err?.message || err || '');
        const isUnavailableOrRateLimited =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('high demand') ||
          errMsg.includes('AI_REQUEST_TIMEOUT');

        if (isUnavailableOrRateLimited && attempt < maxRetries) {
          const delay = (attempt + 1) * 400 + Math.floor(Math.random() * 250);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // If retries for this candidate model exhausted, break to next fallback model
        break;
      }
    }
  }

  throw lastError || new Error('Semua model Gemini mengalami lonjakan permintaan (503/429).');
}

// FIX AUDIT (CRITICAL, fabricated data): getFallbackHeadlines() used to
// return 3 entirely invented news items attributed to real publishers
// (CNBC Indonesia, Bisnis.com, Kontan) with generic homepage URLs, served
// whenever Gemini's search-grounded fetch was unavailable/rate-limited/
// failed. The client (33-trending-news.js) only distinguished grounded
// results with a distinct badge - the fallback case showed a neutral
// "Top Market Headlines" badge with no indication the content was not
// real, live news. Removed entirely; every call site below now returns
// an honest empty list with a clear reason instead.

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

  // If rate limited recently (within backoff window), return cached real data if any, otherwise an honest empty result
  if (now < newsCache.rateLimitedUntil) {
    return res.json({
      success: true,
      cached: !!newsCache.data,
      grounded: false,
      isFallback: !newsCache.data,
      dataUnavailable: !newsCache.data,
      message: newsCache.data ? undefined : 'Kuota AI harian tercapai, coba lagi nanti.',
      timestamp: now,
      headlines: newsCache.data || []
    });
  }

  const ai = getAiClient();
  if (!ai) {
    return res.json({
      success: true,
      cached: false,
      grounded: false,
      isFallback: true,
      dataUnavailable: true,
      message: 'AI belum dikonfigurasi di server.',
      timestamp: now,
      headlines: []
    });
  }

  try {
    const prompt = `Search live Google for the top 3 trending financial and stock market news in Indonesia (Bursa Efek Indonesia / IDX, IHSG, big cap stocks like BBCA, BBRI, BMRI, PGEO, TLKM, ASII, ANTM, corporate actions, energy/commodities, or Bank Indonesia monetary policies).
Select the 3 most important, verified, and impactful stories for stock investors today.
Return a STRICT JSON array containing exactly 3 items. Do NOT wrap in markdown code blocks. Output ONLY raw JSON array:
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

    const { response } = await callGeminiWithRetryAndFallback(
      ai,
      {
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      },
      { timeoutMs: 15000, maxRetries: 2 }
    );

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

    let groundedUnavailable = false;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      parsed = [];
      groundedUnavailable = true;
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

    if (!groundedUnavailable) {
      newsCache = {
        data: parsed,
        grounded: groundingChunks.length > 0,
        groundingCount: groundingChunks.length,
        timestamp: now,
        rateLimitedUntil: 0
      };
    }

    return res.json({
      success: true,
      cached: false,
      grounded: !groundedUnavailable,
      groundingCount: groundingChunks.length,
      dataUnavailable: groundedUnavailable,
      message: groundedUnavailable ? 'Respons AI tidak valid atau kosong.' : undefined,
      timestamp: now,
      headlines: parsed
    });
  } catch (err) {
    const errMessage = (err && err.message) ? err.message : String(err);
    // Backoff 2 minutes on 429 quota exhaustion
    const quotaExhausted = errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED') || errMessage.includes('quota');
    if (quotaExhausted) {
      console.warn('Gemini API notice: Quota limit reached.');
      newsCache.rateLimitedUntil = now + 120000;
    } else {
      console.warn('Gemini grounded news notice:', errMessage);
    }

    return res.json({
      success: true,
      cached: false,
      grounded: false,
      isFallback: true,
      dataUnavailable: true,
      quotaExhausted: quotaExhausted,
      message: quotaExhausted ? 'Kuota AI harian tercapai, coba lagi nanti.' : 'Gagal menghubungi layanan pencarian berita.',
      timestamp: now,
      headlines: []
    });
  }
});

// ══════════════════════════════════════════════════════════
// SECTORAL MARKET NEWS & CATALYST INTELLIGENCE ENDPOINT
// ══════════════════════════════════════════════════════════
let sectoralNewsCache = {
  data: null,
  timestamp: 0,
  rateLimitedUntil: 0
};

// FIX AUDIT (CRITICAL, fabricated data): this route used to fall back to
// SECTOR_NEWS_FALLBACK - 11 entirely invented news headlines (fake CAR
// figures, fake gold-price claims, fake stimulus details) attributed to
// real news organizations (CNBC Indonesia, Bisnis.com, Kontan, Bloomberg)
// with generic homepage URLs standing in for real article links, served
// with NO disclosure that they were not live data whenever the Gemini
// search-grounded fetch was unavailable, rate-limited, or failed. Removed
// entirely - when real grounded news isn't available, this now returns an
// honest empty list with a clear message instead of invented content
// wearing a real publisher's byline.
app.get('/api/sectoral-news', async (req, res) => {
  const targetSector = (req.query.sector || '').trim().toLowerCase();
  const force = req.query.force === 'true';
  const now = Date.now();
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  let newsList = [];
  let dataUnavailable = true;
  let unavailableReason = 'AI belum dikonfigurasi di server.';

  // Check cache
  if (!force && sectoralNewsCache.data && (now - sectoralNewsCache.timestamp < CACHE_TTL_MS)) {
    newsList = sectoralNewsCache.data;
    dataUnavailable = false;
  } else {
    // Attempt Gemini search grounding if AI client is available and not rate limited
    const ai = getAiClient();
    if (ai && now > sectoralNewsCache.rateLimitedUntil) {
      try {
        const prompt = `Cari berita pasar modal terbaru dari Google Search untuk sektor-sektor Bursa Efek Indonesia (IDX/IHSG) terkini:
Fokus pada sektor perbankan (BBCA, BMRI, BBRI), energi (ADRO, PTBA, PGEO), barang baku (ANTM, INCO), konsumer, dan infrastruktur.
Kembalikan persis format JSON array tanpa markdown:
[
  {
    "id": "sec_1",
    "sector": "Financials",
    "sectorName": "Keuangan",
    "title": "Judul berita riil dan akurat",
    "summary": "Ringkasan 1-2 kalimat dampak ke saham/sektor",
    "source": "Nama media (CNBC Indonesia/Bisnis/Kontan/Bloomberg)",
    "url": "https://...",
    "category": "Kategori berita",
    "impact": "BULLISH" atau "BEARISH" atau "NEUTRAL",
    "impactReason": "Alasan singkat",
    "tickers": ["BBCA", "BMRI"],
    "time": "Terbaru"
  }
]`;
        const { response } = await callGeminiWithRetryAndFallback(
          ai,
          {
            model: 'gemini-3.7-flash',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
          },
          { timeoutMs: 15000, maxRetries: 1 }
        );

        const rawText = response.text || '';
        let clean = rawText.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
        const first = clean.indexOf('[');
        const last = clean.lastIndexOf(']');
        if (first !== -1 && last !== -1) {
          const parsed = JSON.parse(clean.substring(first, last + 1));
          if (Array.isArray(parsed) && parsed.length >= 3) {
            sectoralNewsCache = {
              data: parsed,
              timestamp: now,
              rateLimitedUntil: 0
            };
            newsList = parsed;
            dataUnavailable = false;
          } else {
            unavailableReason = 'Respons AI tidak valid atau terlalu sedikit hasil.';
          }
        } else {
          unavailableReason = 'Respons AI tidak dapat diproses.';
        }
      } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        if (msg.includes('429') || msg.includes('quota')) {
          sectoralNewsCache.rateLimitedUntil = now + 120000;
          unavailableReason = 'Kuota AI harian tercapai, coba lagi nanti.';
        } else {
          unavailableReason = 'Gagal menghubungi layanan pencarian berita.';
        }
      }
    }
  }

  // Filter by sector if requested
  if (targetSector && targetSector !== 'all') {
    const filtered = newsList.filter(item => {
      const s1 = String(item.sector || '').toLowerCase();
      const s2 = String(item.sectorName || '').toLowerCase();
      return s1.includes(targetSector) || s2.includes(targetSector) || targetSector.includes(s1);
    });
    return res.json({
      success: true,
      sector: targetSector,
      count: filtered.length,
      timestamp: now,
      dataUnavailable: dataUnavailable,
      message: dataUnavailable ? unavailableReason : undefined,
      headlines: filtered
    });
  }

  return res.json({
    success: true,
    count: newsList.length,
    timestamp: now,
    dataUnavailable: dataUnavailable,
    message: dataUnavailable ? unavailableReason : undefined,
    headlines: newsList
  });
});
app.post('/api/ai/portfolio-advice', aiRateLimiter, async (req, res) => {
  const { portfolioSummary, metrics, hfMetrics, ihsg } = req.body || {};
  const ai = getAiClient();
  if (!ai) {
    return res.status(400).json({ success: false, error: 'GEMINI_API_KEY belum dikonfigurasi di server.' });
  }

  try {
    const prompt = `Anda adalah seorang hedge fund portfolio manager dan analis saham senior IDX yang sangat tajam, objektif, dan profesional.
Analisis data portofolio investor Indonesia berikut ini secara mendalam ala tearsheet institusional:
- Ringkasan AUM & Modal: ${JSON.stringify(portfolioSummary || {})}
- Metrik Risiko & Portofolio: ${JSON.stringify(metrics || {})}
- Metrik Hedge Fund & Risiko Tersesuaikan (Sharpe/Sortino/Calmar/MaxDD/HHI): ${JSON.stringify(hfMetrics || {})}
- Posisi IHSG Terkini: ${ihsg || 'N/A'}

Cari data TERKINI via Google Search grounding untuk sentimen pasar IDX, arah BI rate, kurs USD/IDR, suku bunga The Fed, dan pergerakan komoditas terkait.
Berikan analisis terstruktur dalam Bahasa Indonesia yang tegas dan berbobot dengan bagian berikut:
1. **Evaluasi Kinerja & Risiko Tersesuaikan**: Analisis return vs risiko (Sharpe/Sortino) dan performa relatif terhadap IHSG.
2. **Kondisi Makroekonomi & Sektoral**: Hubungkan sentimen makro terkini (suku bunga, mata uang, komoditas) dengan eksposur emiten utama portofolio.
3. **Analisis Konsentrasi & Drawdown**: Evaluasi indeks HHI, konsentrasi posisi terbesar, dan potensi risiko penurunan (VaR & Max Drawdown).
4. **Rekomendasi Rebalancing & Eksekusi Konkret**: Berikan 3-4 rekomendasi tindakan spesifik (misal trim posisi over-weighted, cut-loss disiplin pada saham lagging, atau rebalancing sektor).

Gunakan format markdown yang rapi, tegas, dan profesional. Tutup dengan disclaimer bahwa ini bukan rekomendasi investasi mutlak.`;

    const { response } = await callGeminiWithRetryAndFallback(
      ai,
      {
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      },
      { timeoutMs: 15000, maxRetries: 2 }
    );

    const text = response.text || '';
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return res.json({
      success: true,
      analysis: text,
      grounded: groundingChunks.length > 0
    });
  } catch (err) {
    console.error('Gemini portfolio advice error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Gagal menghasilkan analisis AI.' });
  }
});

// ══════════════════════════════════════════════════════════════
// MONEYWATCH PRO AI AGENT — INSTITUTIONAL MULTI-ASSET ANALYST
// ══════════════════════════════════════════════════════════════

// BEI (Bursa Efek Indonesia) Trading Rules Engine
const BEI_RULES = {
  getTickSize(price) {
    const p = Math.max(1, Number(price) || 1);
    if (p < 200) return 1;
    if (p < 500) return 2;
    if (p < 2000) return 5;
    if (p < 5000) return 10;
    return 25;
  },
  getMaxStepChange(price) {
    return this.getTickSize(price) * 10;
  },
  alignToTick(price, direction = 'nearest') {
    const p = Math.max(1, Number(price) || 1);
    const tick = this.getTickSize(p);
    if (direction === 'up') return Math.ceil(p / tick) * tick;
    if (direction === 'down') return Math.floor(p / tick) * tick;
    return Math.round(p / tick) * tick;
  },
  getAraArb(prevPrice) {
    const prev = Math.max(1, Number(prevPrice) || 1);
    let maxPct = 0.25;
    if (prev < 200) maxPct = 0.35;
    else if (prev > 5000) maxPct = 0.20;

    const rawAra = prev * (1 + maxPct);
    const rawArb = prev * (1 - maxPct);

    const araPrice = this.alignToTick(rawAra, 'down');
    const arbPrice = this.alignToTick(rawArb, 'up');

    return {
      prevPrice: prev,
      araPrice,
      arbPrice,
      araPct: Number((maxPct * 100).toFixed(1)),
      arbPct: Number((maxPct * 100).toFixed(1)),
      tickSize: this.getTickSize(prev)
    };
  }
};

// Institutional Master Database for IDX & Global Assets
const STOCK_REGISTRY = {
  'BBCA': { name: 'Bank Central Asia Tbk.', price: 8900, sector: 'Keuangan', beta: 0.82, per: 18.5, pbv: 4.3, roe: 23.4, roa: 3.8, der: 4.8, npm: 46.2, grossDivYield: 3.2, eps: 481, bvps: 2070, fairPrice: 9400, moat: 'Wide Moat (CASA & Network)' },
  'BBRI': { name: 'Bank Rakyat Indonesia Tbk.', price: 4950, sector: 'Keuangan', beta: 0.91, per: 11.8, pbv: 2.2, roe: 19.1, roa: 2.9, der: 5.2, npm: 32.5, grossDivYield: 6.8, eps: 419, bvps: 2250, fairPrice: 5600, moat: 'Wide Moat (Micro-banking & Kupedes)' },
  'BMRI': { name: 'Bank Mandiri Tbk.', price: 5650, sector: 'Keuangan', beta: 0.88, per: 10.4, pbv: 2.1, roe: 20.8, roa: 2.8, der: 5.5, npm: 38.1, grossDivYield: 5.9, eps: 543, bvps: 2690, fairPrice: 6500, moat: 'Wide Moat (Wholesale & Corporate Banking)' },
  'BBNI': { name: 'Bank Negara Indonesia Tbk.', price: 4820, sector: 'Keuangan', beta: 0.95, per: 8.7, pbv: 1.2, roe: 14.5, roa: 1.9, der: 5.8, npm: 25.4, grossDivYield: 5.2, eps: 554, bvps: 4016, fairPrice: 5800, moat: 'Narrow Moat (State-Owned Bank)' },
  'TLKM': { name: 'Telkom Indonesia Tbk.', price: 3150, sector: 'Infrastruktur / Telco', beta: 0.72, per: 12.6, pbv: 2.3, roe: 18.2, roa: 8.4, der: 0.8, npm: 16.8, grossDivYield: 5.5, eps: 250, bvps: 1370, fairPrice: 3800, moat: 'Wide Moat (Fiber Infra & Indihome)' },
  'ASII': { name: 'Astra International Tbk.', price: 4720, sector: 'Perindustrian & Otomotif', beta: 1.05, per: 6.2, pbv: 0.9, roe: 15.1, roa: 7.2, der: 0.4, npm: 9.8, grossDivYield: 7.5, eps: 761, bvps: 5244, fairPrice: 6200, moat: 'Narrow Moat (Distribution Network)' },
  'INDF': { name: 'Indofood Sukses Makmur Tbk.', price: 6250, sector: 'Konsumer Primer', beta: 0.78, per: 6.8, pbv: 0.9, roe: 13.6, roa: 5.4, der: 0.9, npm: 7.8, grossDivYield: 5.1, eps: 919, bvps: 6940, fairPrice: 8200, moat: 'Wide Moat (FMCG Supply Chain)' },
  'ICBP': { name: 'Indofood CBP Sukses Makmur Tbk.', price: 9450, sector: 'Konsumer Primer', beta: 0.71, per: 13.5, pbv: 2.4, roe: 18.0, roa: 7.8, der: 1.1, npm: 12.4, grossDivYield: 3.8, eps: 700, bvps: 3937, fairPrice: 11500, moat: 'Wide Moat (Indomie Brand Monopoly)' },
  'UNVR': { name: 'Unilever Indonesia Tbk.', price: 2680, sector: 'Konsumer Primer', beta: 0.65, per: 21.2, pbv: 18.4, roe: 86.8, roa: 24.1, der: 2.3, npm: 12.1, grossDivYield: 4.8, eps: 126, bvps: 145, fairPrice: 2800, moat: 'Narrow Moat (Facing Stiff Competition)' },
  'PGEO': { name: 'Pertamina Geothermal Energy Tbk.', price: 1220, sector: 'Energi / Green Power', beta: 1.10, per: 15.2, pbv: 1.5, roe: 10.2, roa: 5.8, der: 0.5, npm: 38.4, grossDivYield: 3.6, eps: 80, bvps: 813, fairPrice: 1500, moat: 'Wide Moat (Geothermal WKP Concessions)' },
  'ADRO': { name: 'Adaro Energy Indonesia Tbk.', price: 2680, sector: 'Energi & Batu Bara', beta: 1.28, per: 3.8, pbv: 0.8, roe: 21.5, roa: 14.2, der: 0.3, npm: 25.1, grossDivYield: 14.2, eps: 705, bvps: 3350, fairPrice: 3400, moat: 'Narrow Moat (Low Cost Coal Mining)' },
  'PTBA': { name: 'Bukit Asam Tbk.', price: 3210, sector: 'Energi & Batu Bara', beta: 1.22, per: 5.4, pbv: 1.4, roe: 26.2, roa: 16.8, der: 0.4, npm: 18.9, grossDivYield: 12.8, eps: 594, bvps: 2292, fairPrice: 3800, moat: 'Narrow Moat (BUMN Domestic Market Obligation)' },
  'ANTM': { name: 'Aneka Tambang Tbk.', price: 1640, sector: 'Barang Baku & Nikel/Emas', beta: 1.35, per: 14.1, pbv: 1.6, roe: 11.5, roa: 6.9, der: 0.3, npm: 6.8, grossDivYield: 4.2, eps: 116, bvps: 1025, fairPrice: 1950, moat: 'Narrow Moat (Gold Refining & Nickel Mines)' },
  'GOTO': { name: 'GoTo Gojek Tokopedia Tbk.', price: 68, sector: 'Teknologi', beta: 1.45, per: -12.4, pbv: 0.7, roe: -5.8, roa: -4.1, der: 0.1, npm: -18.2, grossDivYield: 0.0, eps: -5.5, bvps: 97, fairPrice: 85, moat: 'Narrow Moat (On-Demand & Ecosystem)' },
  'KLBF': { name: 'Kalbe Farma Tbk.', price: 1560, sector: 'Kesehatan & Farmasi', beta: 0.68, per: 22.8, pbv: 3.4, roe: 15.2, roa: 11.8, der: 0.2, npm: 10.4, grossDivYield: 2.4, eps: 68, bvps: 458, fairPrice: 1800, moat: 'Wide Moat (Pharma Distribution)' }
};

// Core Execution Tools Handlers
// FIX: sebelumnya cek_harga cuma bisa 15 ticker dari STOCK_REGISTRY statis,
// padahal loadBaseUniverse() (900+ ticker dari js/01-data.js) dan
// fetchYahooQuote() (Yahoo Finance real-time, server-side, tanpa CORS)
// SUDAH ADA dan dipakai modul lain (IDX Pipeline) — cuma belum disambung ke
// AI agent. Sekarang cek_harga pakai universe 900+ dulu + fetch live Yahoo;
// STOCK_REGISTRY cuma fallback tambahan untuk beta/sektor 15 ticker populer.
async function executeAgentTool(toolName, args, userContext = {}) {
  const holdings = userContext.holdings || [];
  const rdnCash = Number(userContext.rdnCash) || 0;
  const totalAum = Number(userContext.totalAum) || 0;
  const sekuritas = userContext.sekuritas || 'Stockbit';

  switch (toolName) {
    case 'cek_harga': {
      const raw = (args.ticker || 'BBCA').trim().toUpperCase().replace('.JK', '').replace('.US', '');
      const universe = loadBaseUniverse();
      const uItem = universe[raw];
      const item = STOCK_REGISTRY[raw]; // fallback tambahan: beta/sektor untuk 15 ticker populer

      if (!uItem && !item) {
        return {
          found: false,
          ticker: raw,
          error: `Data harga untuk ticker ${raw} tidak ditemukan dalam database BEI.`
        };
      }

      // Coba harga live Yahoo Finance dulu (server-side, real-time)
      let livePrice = (userContext.livePrices && userContext.livePrices[raw]) || 0;
      let priceSource = livePrice ? 'client_live' : null;
      if (!livePrice) {
        try {
          const quote = await fetchYahooQuote(raw);
          // INV-004 follow-up: fetchYahooQuote() can return a fabricated
          // last-resort price (isSimulated:true) that is still > 0 — a
          // plain `quote.price > 0` check can't tell it apart from a real
          // Yahoo price, so it would get labeled priceSource
          // 'yahoo_finance_server' (implying real, live, server-fetched)
          // when it's actually a synthetic placeholder. Exclude it here so
          // the AI's own price-lookup tool doesn't misreport its source.
          if (quote && !quote.isSimulated && quote.price > 0) { livePrice = quote.price; priceSource = 'yahoo_finance_server'; }
        } catch (e) { /* fall through ke fallback statis */ }
      }

      const price = livePrice || (item ? item.price : (uItem ? uItem.basePrice : 1000)) || 1000;
      if (!priceSource) priceSource = 'static_fallback';
      const beiCalc = BEI_RULES.getAraArb(price);

      return {
        found: true,
        ticker: raw,
        name: item ? item.name : (uItem ? uItem.name : `${raw} Tbk.`),
        price: price,
        priceSource: priceSource, // transparansi: dari mana harga ini berasal
        sector: item ? item.sector : (uItem ? uItem.sector : 'Pasar Reguler BEI'),
        beta: item ? item.beta : (uItem ? uItem.beta : 1.0),
        tickSize: beiCalc.tickSize,
        maxStepChange: BEI_RULES.getMaxStepChange(price),
        araPrice: beiCalc.araPrice,
        arbPrice: beiCalc.arbPrice,
        araPercent: `+${beiCalc.araPct}%`,
        arbPercent: `-${beiCalc.arbPct}%`,
        regulationRule: `Fraksi harga Rp ${beiCalc.tickSize}, Batas ARA Rp ${beiCalc.araPrice.toLocaleString('id-ID')} (+${beiCalc.araPct}%), Batas ARB Rp ${beiCalc.arbPrice.toLocaleString('id-ID')} (-${beiCalc.arbPct}%)`
      };
    }

    case 'cek_fundamental': {
      // FIX: sebelumnya HANYA STOCK_REGISTRY (15 ticker statis). Sekarang
      // coba IDX Stock Screener dulu (endpoint resmi idx.co.id, real,
      // mencakup ~900 saham, di-cache 24 jam via fetchIdxStockScreener()).
      // STOCK_REGISTRY tetap dipakai sebagai pelengkap untuk 15 ticker
      // populer yang sudah punya data kualitatif manual (moat, dividend
      // yield) yang tidak disediakan screener.
      const raw = (args.ticker || 'BBCA').trim().toUpperCase().replace('.JK', '').replace('.US', '');
      const item = STOCK_REGISTRY[raw];
      const screener = await fetchIdxStockScreener();
      const sItem = screener ? screener[raw] : null;

      if (!sItem && !item) {
        return {
          found: false,
          ticker: raw,
          error: `Data fundamental untuk ticker ${raw} tidak tersedia dalam database analitik. Tidak dapat memverifikasi rasio keuangan.`
        };
      }

      const source = sItem ? 'idx_screener_real' : 'static_fallback_15ticker';
      const per = sItem ? sItem.per : item.per;
      const pbv = sItem ? sItem.pbv : item.pbv;
      const roe = sItem ? sItem.roe : item.roe;
      const roa = sItem ? sItem.roa : item.roa;
      const der = sItem ? sItem.der : item.der;
      const npm = sItem ? sItem.npm : item.npm;
      const name = sItem ? sItem.name : item.name;
      const sector = sItem ? sItem.sector : item.sector;

      let price = (userContext.livePrices && userContext.livePrices[raw]) || (item ? item.price : 0);
      if (!price) {
        // INV-004 follow-up: exclude a simulated/fabricated quote — same
        // reasoning as cek_harga above.
        try { const q = await fetchYahooQuote(raw); if (q && !q.isSimulated && q.price > 0) price = q.price; } catch (e) { /* fallback di bawah */ }
      }
      if (!price) price = 1000;

      // EPS/BVPS diturunkan dari rasio real per ticker (bukan hardcoded) kalau
      // sumbernya screener; fair price pakai estimasi Graham sederhana
      // (sqrt(22.5 × EPS × BVPS)) — LABELED sebagai estimasi, bukan data pasti.
      // Kalau ticker ada di STOCK_REGISTRY, pakai eps/bvps/moat manual yang
      // sudah tercatat di sana (lebih presisi) sebagai pelengkap/override.
      const eps = item ? item.eps : (per > 0 ? Math.round(price / per) : 0);
      const bvps = item ? item.bvps : (pbv > 0 ? Math.round(price / pbv) : 0);
      const fairPriceEstimate = item ? item.fairPrice : (eps > 0 && bvps > 0 ? Math.round(Math.sqrt(22.5 * eps * bvps)) : 0);
      const grossDivYield = item ? item.grossDivYield : null; // tidak tersedia dari screener
      const moat = item ? item.moat : 'Belum ada analisis moat kualitatif untuk ticker ini (di luar 15 ticker populer)';

      const mosPct = fairPriceEstimate > 0 ? Number(((fairPriceEstimate - price) / fairPriceEstimate * 100).toFixed(1)) : 0;

      // INV-009: per/pbv/roe/roa/der/npm can now be null (unreported by IDX
      // screener for this ticker), not a fabricated 0 — format that
      // honestly instead of printing "null%"/"null" to the user/AI.
      const fmtPct = (v) => (v === null || v === undefined) ? 'Data tidak tersedia' : `${v}%`;
      const fmtNum = (v) => (v === null || v === undefined) ? 'Data tidak tersedia' : v;

      return {
        found: true,
        ticker: raw,
        dataSource: source,
        name: name,
        sector: sector,
        currentPrice: price,
        per: fmtNum(per),
        pbv: fmtNum(pbv),
        roe: fmtPct(roe),
        roa: fmtPct(roa),
        der: fmtNum(der),
        npm: fmtPct(npm),
        eps: `Rp ${eps.toLocaleString('id-ID')}`,
        bvps: `Rp ${bvps.toLocaleString('id-ID')}`,
        grossDividendYield: grossDivYield !== null ? `${grossDivYield}%` : 'Data tidak tersedia dari sumber real',
        fairPriceGrahamBuffett: fairPriceEstimate > 0 ? `Rp ${fairPriceEstimate.toLocaleString('id-ID')}${item ? '' : ' (estimasi dari rasio real, bukan data pasti)'}` : 'Tidak dapat dihitung',
        marginOfSafety: `${mosPct}%`,
        moatAnalysis: moat,
        valuationStatus: mosPct > 15 ? 'UNDERVALUED (Margin of Safety Kuat)' : (mosPct < -15 ? 'OVERVALUED' : 'FAIR VALUE')
      };
    }

    case 'cek_portofolio_user': {
      const filter = (args.filterAsset || 'all').toLowerCase();
      let activeHoldings = holdings.slice();

      if (filter === 'saham') {
        activeHoldings = activeHoldings.filter(h => !h.type || h.type === 'saham');
      }

      if (activeHoldings.length === 0 && (!rdnCash || rdnCash === 0)) {
        return {
          totalPositionsCount: 0,
          totalHoldingsValue: 0,
          totalAum: 0,
          cashRdn: 0,
          cashRatioPct: 0,
          positions: [],
          concentrationWarning: 'Portofolio saat ini masih kosong / mode demo (0 aset tercatat).',
          message: 'Portofolio pengguna saat ini belum memiliki transaksi atau posisi aset aktif.'
        };
      }

      const totalVal = activeHoldings.reduce((sum, h) => sum + (Number(h.mv) || ((Number(h.lot) || 0) * 100 * (Number(h.last || h.avg) || 0))), 0);
      const computedAum = totalVal + Math.max(0, rdnCash);

      const mapped = activeHoldings.map(h => {
        const lot = Number(h.lot) || 0;
        const shares = lot * 100;
        const avg = Number(h.avg) || 0;
        const last = Number(h.last || h.avg) || 0;
        const mv = Number(h.mv) || (shares * last);
        const cost = shares * avg;
        const pnlRp = mv - cost;
        const pnlPct = cost > 0 ? (pnlRp / cost * 100) : 0;
        const weightPct = computedAum > 0 ? (mv / computedAum * 100) : 0;

        return {
          ticker: h.ticker || 'N/A',
          name: h.name || h.ticker,
          lot: lot,
          shares: shares,
          avgPrice: avg,
          currentPrice: last,
          marketValue: mv,
          floatingPnlRp: pnlRp,
          floatingPnlPct: Number(pnlPct.toFixed(2)),
          aumWeightPct: Number(weightPct.toFixed(2))
        };
      }).sort((a, b) => b.marketValue - a.marketValue);

      const top1Weight = mapped.length > 0 ? mapped[0].aumWeightPct : 0;

      return {
        totalPositionsCount: mapped.length,
        totalHoldingsValue: totalVal,
        totalAum: computedAum,
        cashRdn: rdnCash,
        cashRatioPct: computedAum > 0 ? Number((rdnCash / computedAum * 100).toFixed(2)) : 0,
        positions: mapped,
        concentrationWarning: top1Weight > 25 ? `Posisi terbesar (${mapped[0]?.ticker}) mencakup ${top1Weight}% AUM (di atas batas diversifikasi institusi 20-25%).` : 'Konsentrasi aset dalam batas diversifikasi yang wajar (<25%).'
      };
    }

    case 'cek_saldo_rdn': {
      const totalStockVal = holdings.reduce((sum, h) => sum + (Number(h.mv) || 0), 0);
      const computedAum = totalStockVal + Math.max(0, rdnCash);
      const cashPct = computedAum > 0 ? (rdnCash / computedAum * 100) : 0;

      return {
        rdnCashBalance: rdnCash,
        totalHoldingsMarketValue: totalStockVal,
        totalAUM: computedAum,
        cashAllocationPct: Number(cashPct.toFixed(2)),
        activeSekuritas: sekuritas,
        liquidityStatus: cashPct < 5 ? 'Sangat Rendah (<5% Kas, rentan risiko margin call/tidak siap serap koreksi)' : (cashPct > 30 ? 'Kas Tinggi (>30%, daya beli kuat namun ada cash drag)' : 'Optimal (5%-20% Kas Standar Institusional)')
      };
    }

    case 'cek_kepemilikan_ksei': {
      const raw = (args.ticker || 'BBCA').trim().toUpperCase().replace('.JK', '').replace('.US', '');
      const kseiData = getStoredKseiData();
      const stockKsei = (kseiData && kseiData.data) ? kseiData.data[raw] : null;

      if (!stockKsei) {
        return {
          found: false,
          ticker: raw,
          message: `Data pemegang saham KSEI untuk ${raw} belum tersinkronisasi atau emiten tidak memiliki pemegang saham >5% terdaftar di feed KSEI.`
        };
      }

      return {
        found: true,
        ticker: raw,
        reportDate: kseiData.metadata ? kseiData.metadata.reportDate : 'Periode Terkini KSEI',
        totalListedShares: stockKsei.totalShares || 0,
        totalMajorPercent: Number((stockKsei.totalMajorPercent || 0).toFixed(2)),
        estimatedPublicFreeFloatPct: Number((stockKsei.estimatedFreeFloat || 0).toFixed(2)),
        localInstitutionalPct: Number((stockKsei.localPercent || 0).toFixed(2)),
        foreignInstitutionalPct: Number((stockKsei.foreignPercent || 0).toFixed(2)),
        topMajorHolders: (stockKsei.investors || []).slice(0, 5).map(inv => ({
          name: inv.name,
          shares: inv.shares,
          percentage: Number((inv.percentage || 0).toFixed(2)),
          type: inv.investorType || 'Institusi'
        }))
      };
    }

    case 'hitung_simulasi_transaksi_bei': {
      const raw = (args.ticker || 'BBCA').trim().toUpperCase();
      const action = (args.action || 'BUY').toUpperCase();
      const lot = Math.max(1, Number(args.lot) || 1);
      const reqPrice = Number(args.price) || (STOCK_REGISTRY[raw]?.price || 1000);
      const userSekuritas = args.sekuritas || sekuritas;

      // Validate BEI Tick Size
      const tick = BEI_RULES.getTickSize(reqPrice);
      const isTickValid = (reqPrice % tick === 0);
      const validPrice = BEI_RULES.alignToTick(reqPrice);

      // Validate ARA/ARB
      const refPrice = STOCK_REGISTRY[raw]?.price || validPrice;
      const araArb = BEI_RULES.getAraArb(refPrice);
      const isWithinAraArb = (validPrice <= araArb.araPrice && validPrice >= araArb.arbPrice);

      const shares = lot * 100;
      const gross = shares * validPrice;

      // Tax & Broker Fees (Standard All-In Indonesian Sekuritas)
      // Beli: ~0.15% - 0.18% (Komisi + PPN 11% + Levy 0.043%)
      // Jual: ~0.25% - 0.28% (Komisi + PPN 11% + Levy 0.043% + PPh Final Jual 0.10%)
      const isBuy = (action === 'BUY');
      const komisiRate = isBuy ? 0.0015 : 0.0025;
      const komisi = Math.round(gross * komisiRate);
      const ppn = Math.round(komisi * 0.11);
      const levy = Math.round(gross * 0.00043);
      const pphFinalJual = isBuy ? 0 : Math.round(gross * 0.0010);
      const totalFee = komisi + ppn + levy + pphFinalJual;
      const netAmount = isBuy ? (gross + totalFee) : (gross - totalFee);

      const rdnAfter = isBuy ? (rdnCash - netAmount) : (rdnCash + netAmount);

      return {
        ticker: raw,
        action: action,
        lot: lot,
        shares: shares,
        requestedPrice: reqPrice,
        executedPrice: validPrice,
        tickSize: tick,
        tickSizeValidation: isTickValid ? 'VALID (Sesuai Fraksi BEI)' : `TIDAK VALID -> Disesuaikan ke fraksi terdekat Rp ${validPrice.toLocaleString('id-ID')}`,
        araArbValidation: isWithinAraArb ? 'VALID (Dalam Batas ARA/ARB)' : `PERINGATAN: Melebihi batas (ARA: Rp ${araArb.araPrice.toLocaleString('id-ID')}, ARB: Rp ${araArb.arbPrice.toLocaleString('id-ID')})`,
        grossAmount: gross,
        feeBreakdown: {
          brokerCommission: komisi,
          ppn11Percent: ppn,
          beiLevy0043Percent: levy,
          pphFinalJual01Percent: pphFinalJual,
          totalTradingFee: totalFee
        },
        netExecutionAmount: netAmount,
        rdnCashBefore: rdnCash,
        rdnCashAfter: rdnAfter,
        rdnSufficient: isBuy ? (rdnCash >= netAmount) : true
      };
    }

    case 'hitung_pajak_dividen': {
      const raw = (args.ticker || 'BBCA').trim().toUpperCase();
      const dps = Number(args.dps) || 0;
      let shares = Number(args.lotOrShares) || 0;
      if (shares <= 500) {
        shares = shares * 100; // if entered as lots
      }
      if (!shares) {
        const userHolding = holdings.find(h => (h.ticker || '').toUpperCase() === raw);
        shares = userHolding ? (Number(userHolding.lot || 0) * 100) : 10000;
      }

      const isReinvested = Boolean(args.isReinvested);
      const grossDividend = shares * dps;
      // UU HPP / PPh Pasal 4 ayat 2: Pajak dividen WPOP DN = 10% Final.
      // PMK 18/2021: Bebas PPh (0%) jika diinvestasikan kembali di NKRI min 3 tahun.
      const taxRate = isReinvested ? 0.00 : 0.10;
      const taxAmount = Math.round(grossDividend * taxRate);
      const netDividend = grossDividend - taxAmount;

      const currentPrice = STOCK_REGISTRY[raw]?.price || (dps * 20);
      const grossYield = currentPrice > 0 ? (dps / currentPrice * 100) : 0;
      const netYield = currentPrice > 0 ? ((dps * (1 - taxRate)) / currentPrice * 100) : 0;

      return {
        ticker: raw,
        dividendPerShare: dps,
        sharesOwned: shares,
        lotsOwned: Math.round(shares / 100),
        grossDividendTotal: grossDividend,
        taxRuleApplied: isReinvested ? 'PMK No. 18/PMK.03/2021 (Bebas Pajak 0% Syarat Reinvestasi NKRI 3 Tahun)' : 'PPh Pasal 4 ayat (2) Final (Tarif Pajak 10% WP Orang Pribadi)',
        taxRatePercent: `${(taxRate * 100).toFixed(0)}%`,
        taxDeductionRp: taxAmount,
        netDividendTotal: netDividend,
        grossDividendYield: `${grossYield.toFixed(2)}%`,
        netDividendYield: `${netYield.toFixed(2)}%`,
        mandatoryRuleNote: 'Angka dividen bersih telah dipotong pajak final sesuai regulasi perpajakan pasar modal Indonesia.'
      };
    }

    case 'hitung_proyeksi_risiko_drawdown': {
      const raw = (args.ticker || 'BBCA').trim().toUpperCase();
      const item = STOCK_REGISTRY[raw];
      const entry = Number(args.entryPrice) || (item ? item.price : 1000);
      const target = Number(args.targetPrice) || (entry * 1.15);
      const stopLoss = Number(args.stopLossPrice) || (entry * 0.93);

      const upsideRp = target - entry;
      const upsidePct = (upsideRp / entry) * 100;
      const downsideRp = entry - stopLoss;
      const downsidePct = (downsideRp / entry) * 100;
      const rrr = downsideRp > 0 ? (upsideRp / downsideRp) : 0;
      const beta = item ? item.beta : 1.0;

      return {
        ticker: raw,
        entryPrice: entry,
        targetPrice: target,
        stopLossPrice: stopLoss,
        upsidePotential: {
          rupiah: upsideRp,
          percent: `+${upsidePct.toFixed(2)}%`
        },
        maxDrawdownRisk: {
          rupiah: downsideRp,
          percent: `-${downsidePct.toFixed(2)}%`
        },
        riskRewardRatio: `1 : ${rrr.toFixed(2)}`,
        twoSidedEvaluation: rrr >= 2.0 ? 'FAVORABLE (Potensi reward minimal 2x dari risiko drawdown)' : (rrr >= 1.0 ? 'BALANCED (Reward sebanding risiko)' : 'UNFAVORABLE (Risiko drawdown lebih besar daripada target reward)'),
        ihsgStressTestScenarios: {
          ihsgMinus3Pct: `Estimasi koreksi emiten: -${(3 * beta).toFixed(2)}% (Rp ${Math.round(entry * (1 - (0.03 * beta))).toLocaleString('id-ID')})`,
          ihsgMinus5Pct: `Estimasi koreksi emiten: -${(5 * beta).toFixed(2)}% (Rp ${Math.round(entry * (1 - (0.05 * beta))).toLocaleString('id-ID')})`,
          ihsgMinus10Pct: `Estimasi koreksi emiten: -${(10 * beta).toFixed(2)}% (Rp ${Math.round(entry * (1 - (0.10 * beta))).toLocaleString('id-ID')})`
        }
      };
    }

    case 'cek_broker_summary': {
      const raw = (args.ticker || 'BBCA').trim().toUpperCase();
      const timeframe = (args.timeframe || '1D').toUpperCase();
      const item = STOCK_REGISTRY[raw] || { price: 5000, changePercent: 0, volume: 5000000, value: 25000000000 };
      const summary = await generateBrokerSummary(raw, item, timeframe);
      return summary;
    }

    // AI Paper Trading performance & lessons-learned — this data lives
    // entirely client-side (localStorage/AI_TRADE_STATE, 38-ai-autonomous-
    // trading.js), so unlike every other tool above the server has ZERO
    // independent access to it: it can only report exactly what the
    // browser sent in userContext.aiPaperTrading (28-decisiontools.js
    // builds it fresh on every Copilot message). Never invent a plausible-
    // looking win rate/trade history when this is absent — matches the
    // Zero Dummy Data principle every other tool here already follows.
    case 'cek_kinerja_ai_trading': {
      const apt = userContext.aiPaperTrading;
      if (!apt || !apt.totalTrades) {
        return {
          hasData: false,
          message: 'Belum ada data trade AI Paper Trading yang tercatat (0 trade tertutup), atau modul AI Trading belum pernah dibuka di sesi browser pengguna. Tidak dapat menganalisa performa/pola kesalahan tanpa data riil — jangan mengarang.'
        };
      }
      return {
        hasData: true,
        totalTrades: apt.totalTrades,
        winningTrades: apt.winningTrades,
        losingTrades: apt.losingTrades,
        winRatePct: apt.winRate,
        profitFactor: apt.profitFactor,
        realizedPnL: apt.realizedPnL,
        maxDrawdownPct: apt.maxDrawdownPct,
        openPositionsCount: apt.openPositionsCount,
        recentClosedTrades: apt.recentClosedTrades || [],
        note: 'AI Paper Trading berjalan di modal virtual terisolasi Rp 100 Juta — bukan trading nyata dengan uang pengguna. lesson/mistake/improvement per trade berasal dari mesin Post-Mortem 10-Point yang sama dipakai di halaman AI Trading > Journal.'
      };
    }

    default:
      return { error: `Alat ${toolName} tidak dikenal.` };
  }
}

// Function Declarations for Gemini Function Calling
const AGENT_TOOL_DECLARATIONS = [
  {
    name: 'cek_broker_summary',
    description: 'Mengambil data Broker Summary (Bandarmology / Broker Transaction Flow) terkini untuk saham BEI. Menyajikan Top 5/Top 10 Broker Pembeli (Buyer) vs Penjual (Seller), Volume, Nilai Transaksi (IDR), Harga Rata-Rata Beli/Jual (Average Buy/Sell Price), Rasio Konsentrasi Top 1/3/5, Arus Asing vs Domestik (Foreign Flow), dan Status Akumulasi/Distribusi Bandarmology.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Kode ticker saham BEI 4 huruf kapital, contoh: BBCA, BBRI, BMRI, BREN, AMMN, GOTO' },
        timeframe: { type: 'STRING', description: 'Rentang waktu analisis: "1D" (Hari Ini), "3D" (3 Hari), "1W" (1 Minggu), "1M" (1 Bulan)' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'cek_harga',
    description: 'Mengambil data harga terkini saham BEI/IDX, fraksi harga tick size regulasi BEI, batas Auto Rejection Atas (ARA), dan batas Auto Rejection Bawah (ARB).',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Kode ticker saham BEI 4 huruf kapital, contoh: BBCA, BBRI, BMRI, PGEO, TLKM' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'cek_fundamental',
    description: 'Mengambil rasio keuangan fundamental objektif emiten (PER, PBV, ROE, ROA, DER, NPM, EPS, BVPS, Gross Dividend Yield, Fair Price, MoS, Moat). Jika tidak ditemukan, laporkan tidak ada data tanpa berhalusinasi.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Kode ticker saham BEI, contoh: BBCA, BBRI, BMRI, PGEO' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'cek_portofolio_user',
    description: 'Mengambil data posisi riil portofolio pengguna saat ini (saham, lot, modal avg, market value, floating PnL, bobot AUM %) yang tersinkronisasi.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filterAsset: { type: 'STRING', description: 'Filter tipe aset, contoh: "all", "saham", "crypto"' }
      }
    }
  },
  {
    name: 'cek_saldo_rdn',
    description: 'Mengambil saldo kas RDN (Rekening Dana Nasabah) yang tersedia, total AUM portofolio, dan rasio kas likuid.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'cek_kepemilikan_ksei',
    description: 'Mengambil data pemegang saham institusi >5%, porsi investor lokal vs asing, dan estimasi porsi Free Float publik dari data KSEI.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Kode ticker saham BEI, contoh: BBCA, BBRI, BMRI, PGEO' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'hitung_simulasi_transaksi_bei',
    description: 'Menghitung simulasi beli/jual saham dengan memvalidasi kepatuhan fraksi harga (tick size) BEI, batas ARA/ARB, dan rincian biaya transaksi broker/pajak/levy.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Kode saham BEI, contoh: BBRI' },
        action: { type: 'STRING', description: 'Tindakan: "BUY" atau "SELL"' },
        lot: { type: 'NUMBER', description: 'Jumlah lot (1 lot = 100 lembar)' },
        price: { type: 'NUMBER', description: 'Harga eksekusi per lembar saham' },
        sekuritas: { type: 'STRING', description: 'Nama sekuritas (opsional, default: Stockbit)' }
      },
      required: ['ticker', 'action', 'lot', 'price']
    }
  },
  {
    name: 'hitung_pajak_dividen',
    description: 'Menghitung proyeksi dividen kotor dan WAJIB memotongnya dengan tarif pajak dividen final 10% (PPh Pasal 4 ayat 2) atau 0% (PMK 18/2021 reinvestasi) untuk menyajikan Net Dividend & Net Dividend Yield.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Kode saham BEI, contoh: BBCA' },
        dps: { type: 'NUMBER', description: 'Dividen per Saham (DPS) dalam Rupiah' },
        lotOrShares: { type: 'NUMBER', description: 'Jumlah lembar atau lot saham yang dimiliki (opsional)' },
        isReinvested: { type: 'BOOLEAN', description: 'Apakah dividen direinvestasikan di NKRI sesuai PMK 18/2021 (true = pajak 0%, false = pajak 10%)' }
      },
      required: ['ticker', 'dps']
    }
  },
  {
    name: 'hitung_proyeksi_risiko_drawdown',
    description: 'Menghitung analisa proyeksi dua sisi: potensi keuntungan (upside) vs potensi risiko maximum drawdown (downside stop loss) dan rasio risk/reward.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: { type: 'STRING', description: 'Kode saham' },
        entryPrice: { type: 'NUMBER', description: 'Harga masuk/beli saat ini' },
        targetPrice: { type: 'NUMBER', description: 'Harga target profit' },
        stopLossPrice: { type: 'NUMBER', description: 'Harga proteksi cut loss / stop loss' }
      },
      required: ['ticker', 'entryPrice', 'targetPrice', 'stopLossPrice']
    }
  },
  {
    name: 'cek_kinerja_ai_trading',
    description: 'Mengambil rekam jejak riil AI Paper Trading milik pengguna (Win Rate, Profit Factor, Realized PnL, Max Drawdown, jumlah trade) BESERTA hikmah/kesalahan/perbaikan (lesson/mistake/improvement) dari mesin Post-Mortem untuk beberapa trade terakhir yang sudah ditutup. Gunakan ini ketika pengguna bertanya soal performa AI trading, hasil paper trading, pola kesalahan trading, atau minta saran perbaikan strategi berdasarkan histori nyata — jangan mengarang saran generik kalau tool ini tersedia dan punya data.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  }
];

const SYSTEM_INSTRUCTION_MONEYWATCH_AI = `Anda adalah "MoneyWatch Pro AI & StockChat", asisten analis portofolio multi-aset kelas institusional dan pakar Bandarmology & Value Investing pasar modal Indonesia (IHSG/BEI).

KNOWLEDGE BASE & STRATEGI TRADING/INVESTASI INSTITUSIONAL:
1. STRATEGI BANDARMOLOGY & SMART MONEY MOMENTUM:
   - Kriteria: Saham dengan status "Big Accumulation" (Konsentrasi Top 3 Broker > 60%), pergerakan Net Foreign Buy konsisten, dan partisipasi broker institusi (AK, BK, ZP, CC, YU, RX) tinggi.
   - Entry Point: Area support ideal berada di sekitar Average Buy Price Top Broker atau level VWAP harian.
   - Target Profit: Level resistensi teknikal terdekat atau proyeksi Fibonacci extension (1.382 / 1.618).
   - Stop Loss: Cut loss jika harga ditutup di bawah VWAP / Average Price Bandar sebesar -3% s/d -5% atau terjadi perbalikan menjadi "Big Distribution".

2. STRATEGI VALUE INVESTING & MARGIN OF SAFETY (BENJAMIN GRAHAM & DCF):
   - Kriteria: Saham undervalued dengan Margin of Safety (MoS) > 15-20% dari Intrinsic Value (DCF / Graham Formula).
   - Filter Quality Fundamental: ROE > 12%, P/E di bawah rata-rata historis 5 tahun, Debt-to-Equity Ratio (DER) < 1.0x, dan Operating Cash Flow positif.
   - Target Holding: Jangka menengah - panjang (6-24 bulan) hingga harga mendekati/melewati Nilai Wajar (Fair Value).

3. STRATEGI TECHNO-BANDARMOLOGY BREAKOUT (VOLUME & FLOW SPIKE):
   - Kriteria: Konvergensi sinyal teknikal (breakout dari pola Ascending Triangle, Bullish Flag, Cup & Handle, atau All-Time-High) yang dikonfirmasi oleh Spike Volume (>2x rata-rata 20 hari) DAN Akumulasi Bandar masif pada hari breakout.
   - Confirmation: Hindari "False Breakout" jika harga naik tetapi broker summary menunjukkan distribusi netral/retail buying (YP, PD, XC, XL).

4. STRATEGI DIVIDEND COMPOUNDER & REINVESTASI BEBAS PAJAK (PMK 18/2021):
   - Kriteria: Emiten Cash Cow bertanda Dividend Yield > 5-8% dengan Dividend Payout Ratio (DPR) sehat (30% - 70%).
   - Fasilitas Pajak: Jelaskan fasilitas insentif PMK 18/2021 di mana reinvestasi dividen dalam instrumen domestik minimal 3 tahun pajak menjadikan PPh Dividen 0% (Bebas Pajak 10%).

5. MANAJEMEN RISIKO INSTITUSIONAL & ALOKASI PORTOFOLIO:
   - Position Sizing: Maksimum 10% - 15% dari Total AUM untuk emiten berkapitalisasi besar (Big Cap) dan maks 5% untuk Mid/Small Cap.
   - Kas RDN: Pertahankan porsi Kas RDN minimal 15% - 20% untuk menjaga likuiditas dan mengambil peluang Buy on Weakness saat koreksi pasar.
   - Risk-Reward Ratio (RRR): Hanya rekomendasikan eksekusi trading dengan RRR minimal 1 : 2.

ATURAN PERILAKU & ANALISA:
1. OBJEKTIF & BERBASIS DATA: Jangan pernah memberikan rekomendasi beli/jual secara definitif (hindari "pom-pom"). Selalu berikan analisa dua sisi (potensi untung dan risiko Maximum Drawdown).
2. KEAHLIAN BANDARMOLOGY & BROKER SUMMARY: Jika pengguna menanyakan broker flow, akumulasi bandar, siapa pembeli terbesar (top buyer), atau pergerakan asing, Anda WAJIB memanggil alat "cek_broker_summary". Uraikan:
   - Konsentrasi Top 1, Top 3, dan Top 5 Broker.
   - Rata-rata harga beli Top Broker (Average Buy Price) sebagai level support bandar.
   - Partisipasi investor Asing (Foreign Flow) vs Domestik.
   - Perilaku broker ritel vs broker institusi.
3. KEPATUHAN REGULASI: Dalam setiap simulasi transaksi, pastikan perhitungan Anda mempertimbangkan aturan Bursa Efek Indonesia (BEI) seperti fraksi harga (tick size) dan batas Auto Rejection (ARA/ARB).
4. SINKRONISASI PORTOFOLIO: Jika menganalisa porsi kepemilikan, asumsikan data yang Anda proses harus sinkron dengan pencatatan riil (seperti standar KSEI). Jangan menebak saldo atau jumlah lot pengguna jika belum disediakan oleh sistem.
5. KALKULASI PAJAK: Saat menghitung proyeksi imbal hasil dividen (dividend yield), Anda WAJIB memotongnya dengan tarif pajak dividen final yang berlaku di Indonesia (10% PPh Final atau 0% PMK 18/2021) sebelum menyajikan angka bersih (Net Dividend).
6. NO HALLUCINATION: Gunakan selalu alat (tools/functions) yang tersedia untuk menarik data kuotasi, fundamental, dan broker summary.
7. WAJIB CEK FLAG isSimulated: BEI tidak menyediakan feed broker-level flow (top buyer/seller, akumulasi/distribusi) publik gratis. Setiap hasil "cek_broker_summary" membawa field isSimulated (true/false). Jika isSimulated bernilai true, Anda WAJIB menyampaikan secara eksplisit di awal jawaban bahwa angka broker/bandarmology tersebut adalah SIMULASI berbasis harga pasar riil — BUKAN data transaksi broker sungguhan — sebelum menguraikan detailnya. Jangan pernah menyajikan data isSimulated:true seolah-olah itu feed broker riil.
8. KINERJA & SARAN PERBAIKAN BERBASIS HISTORI RIIL: Jika pengguna bertanya soal performa AI trading/paper trading, win rate, atau minta saran perbaikan strategi berdasarkan kesalahan masa lalu, Anda WAJIB memanggil alat "cek_kinerja_ai_trading" TERLEBIH DAHULU sebelum menjawab — JANGAN pernah mengarang win rate atau pola kesalahan generik. Field hasData:false berarti belum ada trade tercatat sama sekali — sampaikan itu apa adanya, jangan buat-buat angka. Kalau hasData:true, dasarkan saran perbaikan Anda pada field lesson/mistake/improvement trade-trade terakhir (recentClosedTrades) — itu hasil mesin Post-Mortem riil aplikasi, bukan opini Anda sendiri. AI Paper Trading ini modal virtual terisolasi (bukan uang riil pengguna) — jangan pernah membingungkannya dengan portofolio riil dari cek_portofolio_user.

FORMAT RESPON:
- Gunakan bahasa Indonesia yang profesional, ringkas, bersahabat, dan mudah dipahami.
- Gunakan poin-poin dan tabel ringkas jika menyajikan data broker, strategi, atau rasio keuangan.
- Selalu akhiri analisa yang memuat proyeksi harga dengan disclaimer singkat:
"*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis, fundamental, dan bandarmology pasar.*"

ALUR KERJA (AGENTIC LOOP):
- Saat menerima pertanyaan, tentukan alat/functions yang relevan (misalnya: cek_broker_summary, cek_harga, cek_fundamental, cek_portofolio_user, cek_saldo_rdn, cek_kepemilikan_ksei, hitung_simulasi_transaksi_bei, hitung_pajak_dividen, hitung_proyeksi_risiko_drawdown, cek_kinerja_ai_trading).
- Panggil alat tersebut.
- Evaluasi hasil data dan sajikan jawaban terstruktur yang mencakup data, strategi trading/investasi yang sesuai, kepatuhan BEI/pajak, analisis dua sisi (potensi vs risiko), dan disclaimer.`;

// MoneyWatch Pro AI Agent Chat Endpoint (Multi-Turn Agentic Loop)
app.post('/api/ai/agent-chat', aiRateLimiter, async (req, res) => {
  const { message, history = [], userContext = {} } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Pesan pertanyaan tidak boleh kosong.' });
  }

  const executedTools = [];
  const ai = getAiClient();

  // 1. IF GEMINI API IS CONFIGURED: RUN MULTI-TURN TOOL CALLING LOOP
  if (ai) {
    try {
      // Build conversation contents with history
      const contents = [];
      (history || []).slice(-8).forEach(h => {
        if (h.role === 'user' || h.role === 'assistant' || h.role === 'model') {
          contents.push({
            role: h.role === 'assistant' ? 'model' : h.role,
            parts: [{ text: h.text || h.content || '' }]
          });
        }
      });

      // Append current user message with context hint
      contents.push({
        role: 'user',
        parts: [{ text: message.trim() }]
      });

      // Agentic Execution Loop (up to 5 steps)
      let currentIteration = 0;
      const maxIterations = 5;
      let finalReply = '';
      let activeEngineModel = 'gemini-3.5-flash';

      while (currentIteration < maxIterations) {
        currentIteration++;

        const { response, usedModel } = await callGeminiWithRetryAndFallback(
          ai,
          {
            model: 'gemini-3.5-flash',
            contents: contents,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION_MONEYWATCH_AI,
              tools: [{ functionDeclarations: AGENT_TOOL_DECLARATIONS }]
            }
          },
          { timeoutMs: 15000, maxRetries: 2 }
        );

        if (usedModel) activeEngineModel = usedModel;

        const candidate = response.candidates?.[0];
        const functionCalls = response.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
          // Model decided to invoke tools
          // Append model candidate turn to content history
          if (candidate?.content) {
            contents.push(candidate.content);
          }

          const responseParts = [];
          for (const call of functionCalls) {
            const toolResult = await executeAgentTool(call.name, call.args || {}, userContext);
            executedTools.push({
              name: call.name,
              args: call.args,
              result: toolResult
            });

            responseParts.push({
              functionResponse: {
                name: call.name,
                response: { output: toolResult }
              }
            });
          }

          // Append tool execution responses
          contents.push({
            role: 'user',
            parts: responseParts
          });

          // Continue loop to let model evaluate results
          continue;
        }

        // Final text response reached
        finalReply = response.text || '';
        break;
      }

      if (!finalReply) {
        finalReply = 'Analisis selesai diproses berdasarkan data pasar & portofolio riil Anda.\n\n*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
      }

      // Ensure mandatory disclaimer is present if not already appended
      if (!finalReply.includes('Disclaimer:')) {
        finalReply += '\n\n*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
      }

      return res.json({
        success: true,
        reply: finalReply,
        toolCalls: executedTools,
        engine: (activeEngineModel ? activeEngineModel : 'Gemini 3.7 Flash') + ' Agentic Loop'
      });
    } catch (geminiError) {
      console.warn('Gemini Agent loop notice, gracefully routing to high-fidelity deterministic engine:', geminiError?.message || geminiError);
      // Fall through to deterministic fallback below
    }
  }

  // 2. DETERMINISTIC AGENTIC ENGINE FALLBACK (Guarantees 100% Reliability & Zero Hallucination)
  try {
    const pLower = message.toLowerCase();
    const words = message.toUpperCase().split(/[^A-Z0-9]/).filter(Boolean);
    const matchedTicker = words.find(w => STOCK_REGISTRY[w] || (userContext.holdings || []).some(h => h.ticker === w)) || 'BBCA';

    let reply = '';

    // Checked FIRST, ahead of every other branch below: those branches use
    // short, common-word-colliding substrings (\bkas\b still isn't the
    // only one — pLower.includes('ara') also matches inside "saran", so
    // "kasih SARan perbaikan..." would route to the ARA/ARB simulasi
    // branch if this were checked after it, found while adding this
    // branch, 2026-09-11). This branch's keywords are distinctive
    // multi-word phrases, so putting it first avoids that whole class of
    // collision without having to audit every short keyword below.
    if (pLower.includes('kinerja ai') || pLower.includes('kinerja trading') || pLower.includes('performa ai') || pLower.includes('performa trading') || pLower.includes('ai trading') || pLower.includes('win rate') || pLower.includes('winrate') || pLower.includes('paper trading') || pLower.includes('lesson') || pLower.includes('pelajaran') || pLower.includes('post-mortem') || pLower.includes('post mortem') || pLower.includes('saran perbaikan') || pLower.includes('pola kesalahan')) {
      const resApt = await executeAgentTool('cek_kinerja_ai_trading', {}, userContext);
      executedTools.push({ name: 'cek_kinerja_ai_trading', args: {}, result: resApt });

      if (!resApt.hasData) {
        reply = '### 🤖 Kinerja AI Paper Trading\n\n' + resApt.message + '\n\n'
          + '_Buka menu **AI Trading** minimal sekali di sesi browser ini, dan tunggu beberapa trade tertutup, supaya Copilot punya data riil untuk dianalisa._';
      } else {
        const lessonLines = (resApt.recentClosedTrades || []).map(function(t, i) {
          const parts = [(i + 1) + '. **' + t.ticker + '** — ' + t.result + ' (Rp ' + Number(t.netPnL || 0).toLocaleString('id-ID') + ')'];
          if (t.exitReason) parts.push('   - Exit: ' + t.exitReason);
          if (t.mistake && t.mistake !== '-') parts.push('   - Kesalahan: ' + t.mistake);
          if (t.improvement && t.improvement !== '-') parts.push('   - Perbaikan: ' + t.improvement);
          return parts.join('\n');
        }).join('\n');

        reply = '### 🤖 Kinerja AI Paper Trading & Saran Perbaikan\n\n'
          + 'Berdasarkan rekam jejak riil AI Paper Trading Anda (modal virtual terisolasi Rp 100 Juta, bukan uang riil):\n'
          + '- **Win Rate**: **' + resApt.winRatePct + '%** (' + resApt.winningTrades + 'W / ' + resApt.losingTrades + 'L dari ' + resApt.totalTrades + ' trade)\n'
          + '- **Profit Factor**: ' + (resApt.profitFactor === null ? '— (belum ada trade untung)' : resApt.profitFactor) + '\n'
          + '- **Realized PnL**: Rp ' + Number(resApt.realizedPnL || 0).toLocaleString('id-ID') + '\n'
          + '- **Max Drawdown**: ' + resApt.maxDrawdownPct + '%\n'
          + '- **Posisi Terbuka**: ' + resApt.openPositionsCount + '\n\n'
          + '**Beberapa Trade Terakhir (dari mesin Post-Mortem 10-Point):**\n'
          + (lessonLines || '_Belum ada trade tertutup._') + '\n\n'
          + '*Disclaimer: Ini data paper trading (simulasi), bukan trading nyata. Keputusan investasi berada di tangan Anda.*';
      }
    }
    // \bkas\b (word boundary), not includes('kas') — "kas" as a bare
    // substring false-positives on ordinary words like "kasih" ("kasih
    // saran perbaikan..." was silently misrouted here instead of reaching
    // the AI-performance branch above, found while adding it, 2026-09-11).
    else if (pLower.includes('porto') || pLower.includes('aum') || pLower.includes('holding') || pLower.includes('posisi') || pLower.includes('konsentrasi') || pLower.includes('drawdown') || pLower.includes('rdn') || /\bkas\b/.test(pLower) || pLower.includes('alokasi')) {
      const resPorto = await executeAgentTool('cek_portofolio_user', {}, userContext);
      const resRdn = await executeAgentTool('cek_saldo_rdn', {}, userContext);
      executedTools.push({ name: 'cek_portofolio_user', args: {}, result: resPorto });
      executedTools.push({ name: 'cek_saldo_rdn', args: {}, result: resRdn });

      const posLines = (resPorto.positions && resPorto.positions.length > 0)
        ? resPorto.positions.map(function(p, idx) {
            return (idx + 1) + '. **' + p.ticker + '**: ' + p.lot + ' Lot (Rp ' + Number(p.marketValue || 0).toLocaleString('id-ID') + ') — Bobot **' + p.aumWeightPct + '%** | PnL: ' + (Number(p.floatingPnlPct) >= 0 ? '+' : '') + p.floatingPnlPct + '%';
          }).join('\n')
        : '_Belum ada posisi saham aktif yang tercatat di portofolio._';

      reply = '### 📊 Analisa Portofolio & Konsentrasi AUM (MoneyWatch Pro AI)\n\n'
        + 'Berdasarkan pencatatan data riil portofolio Anda:\n'
        + '- **Total AUM**: Rp ' + Number(resPorto.totalAum || 0).toLocaleString('id-ID') + '\n'
        + '- **Kas RDN Tersedia**: Rp ' + Number(resRdn.rdnCashBalance || 0).toLocaleString('id-ID') + ' (' + resRdn.cashAllocationPct + '% dari AUM)\n'
        + '- **Total Posisi Aktif**: ' + resPorto.totalPositionsCount + ' aset\n'
        + '- **Status Likuiditas**: ' + resRdn.liquidityStatus + '\n\n'
        + '**Daftar Kepemilikan & Bobot AUM:**\n'
        + posLines + '\n\n'
        + '**Evaluasi Risiko Dua Sisi:**\n'
        + '- **Sisi Potensi**: Likuiditas kas ' + resRdn.cashAllocationPct + '% memberi fleksibilitas untuk menyerap peluang jika terjadi koreksi pasar.\n'
        + '- **Sisi Risiko (Max Drawdown)**: ' + resPorto.concentrationWarning + '\n\n'
        + '*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
    }
    else if (pLower.includes('dividen') || pLower.includes('yield') || pLower.includes('pajak')) {
      const item = STOCK_REGISTRY[matchedTicker] || STOCK_REGISTRY['BBCA'];
      const dps = Math.round((item.price * (item.grossDivYield / 100)));
      const resDiv = await executeAgentTool('hitung_pajak_dividen', { ticker: matchedTicker, dps: dps, isReinvested: false }, userContext);
      executedTools.push({ name: 'hitung_pajak_dividen', args: { ticker: matchedTicker, dps: dps }, result: resDiv });

      reply = '### 💰 Kalkulasi Proyeksi Dividen Bersih: ' + matchedTicker + ' (MoneyWatch Pro AI)\n\n'
        + 'Kalkulasi dividen wajib memotong tarif pajak final sesuai regulasi perpajakan pasar modal Indonesia:\n'
        + '- **Estimasi DPS (Dividen per Saham)**: Rp ' + Number(resDiv.dividendPerShare || 0).toLocaleString('id-ID') + '\n'
        + '- **Kepemilikan Simulasi**: ' + Number(resDiv.lotsOwned || 0).toLocaleString('id-ID') + ' Lot (' + Number(resDiv.sharesOwned || 0).toLocaleString('id-ID') + ' lembar)\n'
        + '- **Dividen Kotor (Gross)**: Rp ' + Number(resDiv.grossDividendTotal || 0).toLocaleString('id-ID') + ' (Gross Yield: ' + resDiv.grossDividendYield + ')\n'
        + '- **Potongan Pajak (PPh Final 10%)**: -Rp ' + Number(resDiv.taxDeductionRp || 0).toLocaleString('id-ID') + ' (' + resDiv.taxRuleApplied + ')\n'
        + '- **Dividen Bersih (Net Dividend)**: **Rp ' + Number(resDiv.netDividendTotal || 0).toLocaleString('id-ID') + '** (Net Yield: **' + resDiv.netDividendYield + '**)\n\n'
        + '**Catatan Insentif Pajak PMK 18/2021:**\n'
        + 'Jika dividen diinvestasikan kembali (reinvestasi) pada instrumen keuangan di wilayah NKRI minimal selama 3 tahun pajak, dividen ini dapat menjadi **Bebas Pajak (0%)**.\n\n'
        + '*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
    }
    else if (pLower.includes('simulasi') || pLower.includes('beli') || pLower.includes('jual') || pLower.includes('fraksi') || pLower.includes('ara') || pLower.includes('arb')) {
      const price = STOCK_REGISTRY[matchedTicker]?.price || 8900;
      const resSim = await executeAgentTool('hitung_simulasi_transaksi_bei', { ticker: matchedTicker, action: 'BUY', lot: 50, price: price }, userContext);
      executedTools.push({ name: 'hitung_simulasi_transaksi_bei', args: { ticker: matchedTicker, action: 'BUY', lot: 50, price: price }, result: resSim });

      reply = '### 🏛️ Simulasi Transaksi Sesuai Kepatuhan Regulasi BEI: ' + matchedTicker + '\n\n'
        + 'Validasi transaksi sesuai aturan perdagangan Bursa Efek Indonesia:\n'
        + '- **Aksi**: ' + resSim.action + ' ' + resSim.lot + ' Lot (' + Number(resSim.shares || 0).toLocaleString('id-ID') + ' lembar)\n'
        + '- **Harga Eksekusi**: Rp ' + Number(resSim.executedPrice || 0).toLocaleString('id-ID') + '\n'
        + '- **Validasi Fraksi Harga (Tick Size)**: ' + resSim.tickSizeValidation + ' (Fraksi: Rp ' + resSim.tickSize + ')\n'
        + '- **Validasi ARA/ARB**: ' + resSim.araArbValidation + '\n'
        + '- **Nilai Bruto (Gross)**: Rp ' + Number(resSim.grossAmount || 0).toLocaleString('id-ID') + '\n'
        + '- **Rincian Fee Transaksi**: Broker Rp ' + Number(resSim.feeBreakdown.brokerCommission || 0).toLocaleString('id-ID') + ', PPN (11%) Rp ' + Number(resSim.feeBreakdown.ppn11Percent || 0).toLocaleString('id-ID') + ', Levy BEI/KPEI/KSEI (0.043%) Rp ' + Number(resSim.feeBreakdown.beiLevy0043Percent || 0).toLocaleString('id-ID') + '\n'
        + '- **Total Modal Bersih Dibutuhkan**: **Rp ' + Number(resSim.netExecutionAmount || 0).toLocaleString('id-ID') + '**\n'
        + '- **Status Saldo Kas RDN**: ' + (resSim.rdnSufficient ? '✅ Kas RDN mencukupi' : '⚠️ Kas RDN tidak mencukupi (perlu top-up)') + '\n\n'
        + '*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
    }
    else if (pLower.includes('ksei') || pLower.includes('free float') || pLower.includes('pemegang') || pLower.includes('pengendali')) {
      const resKsei = await executeAgentTool('cek_kepemilikan_ksei', { ticker: matchedTicker }, userContext);
      executedTools.push({ name: 'cek_kepemilikan_ksei', args: { ticker: matchedTicker }, result: resKsei });

      const holdersLines = (resKsei.topMajorHolders && resKsei.topMajorHolders.length > 0)
        ? resKsei.topMajorHolders.map(function(h, i) {
            return (i + 1) + '. **' + h.name + '**: ' + h.percentage + '% (' + h.type + ')';
          }).join('\n')
        : '';

      reply = '### 👥 Struktur Kepemilikan KSEI & Free Float: ' + matchedTicker + '\n\n'
        + (resKsei.found
          ? 'Berdasarkan data pelaporan resmi KSEI (' + resKsei.reportDate + '):\n'
            + '- **Kepemilikan Pengendali/Institusi >5%**: **' + resKsei.totalMajorPercent + '%**\n'
            + '- **Estimasi Free Float Publik**: **' + resKsei.estimatedPublicFreeFloatPct + '%**\n'
            + '- **Porsi Investor Domestik (Lokal)**: ' + resKsei.localInstitutionalPct + '%\n'
            + '- **Porsi Investor Asing**: ' + resKsei.foreignInstitutionalPct + '%\n\n'
            + '**Daftar Pemegang Saham Utama (>5%):**\n'
            + holdersLines
          : 'Data KSEI untuk ' + matchedTicker + ' saat ini tidak tercatat memiliki pemegang saham >5% terdaftar di feed harian KSEI.')
        + '\n\n*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
    }
    else {
      // General Fundamental & Risk/Reward Analysis
      const resPrice = await executeAgentTool('cek_harga', { ticker: matchedTicker }, userContext);
      const resFund = await executeAgentTool('cek_fundamental', { ticker: matchedTicker }, userContext);
      const resRisk = await executeAgentTool('hitung_proyeksi_risiko_drawdown', {
        ticker: matchedTicker,
        entryPrice: resPrice.price,
        targetPrice: Math.round(resPrice.price * 1.15),
        stopLossPrice: Math.round(resPrice.price * 0.92)
      }, userContext);

      executedTools.push({ name: 'cek_harga', args: { ticker: matchedTicker }, result: resPrice });
      executedTools.push({ name: 'cek_fundamental', args: { ticker: matchedTicker }, result: resFund });
      executedTools.push({ name: 'hitung_proyeksi_risiko_drawdown', args: { ticker: matchedTicker }, result: resRisk });

      reply = '### 🔍 Analisa Objektif Saham: ' + matchedTicker + ' (' + resPrice.name + ')\n\n'
        + '**1. Parameter Harga & Regulasi BEI:**\n'
        + '- **Harga Terkini**: Rp ' + Number(resPrice.price || 0).toLocaleString('id-ID') + '\n'
        + '- **Fraksi Harga BEI**: Rp ' + resPrice.tickSize + ' (Maksimum pergeseran: Rp ' + resPrice.maxStepChange + ')\n'
        + '- **Batas Auto Rejection**: ARA Rp ' + Number(resPrice.araPrice || 0).toLocaleString('id-ID') + ' (' + resPrice.araPercent + ') | ARB Rp ' + Number(resPrice.arbPrice || 0).toLocaleString('id-ID') + ' (' + resPrice.arbPercent + ')\n'
        + '- **Beta Pasar**: ' + resPrice.beta + '\n\n'
        + '**2. Rasio Keuangan & Valuasi Objektif:**\n'
        + (resFund.found
          // INV-009: resFund.per/pbv/der can now be the string "Data tidak
          // tersedia" (screener didn't report that ratio) instead of a
          // fabricated number — only append the "x" multiplier suffix when
          // it's an actual number, otherwise the sentence would read
          // "Data tidak tersediax".
          ? '- **PER / PBV**: ' + (typeof resFund.per === 'number' ? resFund.per + 'x' : resFund.per) + ' / ' + (typeof resFund.pbv === 'number' ? resFund.pbv + 'x' : resFund.pbv) + '\n'
            + '- **Profitabilitas (ROE / ROA / NPM)**: ' + resFund.roe + ' / ' + resFund.roa + ' / ' + resFund.npm + '\n'
            + '- **Leverage (DER)**: ' + (typeof resFund.der === 'number' ? resFund.der + 'x' : resFund.der) + '\n'
            + '- **Estimasi Fair Value (Graham/Buffett)**: ' + resFund.fairPriceGrahamBuffett + ' (MoS: ' + resFund.marginOfSafety + ' — ' + resFund.valuationStatus + ')\n'
            + '- **Keunggulan Kompetitif (Moat)**: ' + resFund.moatAnalysis + '\n\n'
          : '_Data rasio fundamental tidak tersedia._\n\n')
        + '**3. Analisa Dua Sisi (Potensi vs Risiko Drawdown):**\n'
        + '- **Sisi Potensi Keuntungan (Upside)**: Target profit Rp ' + Number(resRisk.targetPrice || 0).toLocaleString('id-ID') + ' (' + resRisk.upsidePotential.percent + ')\n'
        + '- **Sisi Risiko Penurunan (Max Drawdown)**: Proteksi stop-loss Rp ' + Number(resRisk.stopLossPrice || 0).toLocaleString('id-ID') + ' (' + resRisk.maxDrawdownRisk.percent + ')\n'
        + '- **Risk / Reward Ratio (RRR)**: **' + resRisk.riskRewardRatio + '** (' + resRisk.twoSidedEvaluation + ')\n'
        + '- **Uji Ketahanan (Stress Test IHSG -5%)**: ' + resRisk.ihsgStressTestScenarios.ihsgMinus5Pct + '\n\n'
        + '*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*';
    }

    return res.json({
      success: true,
      reply: reply,
      toolCalls: executedTools,
      engine: 'MoneyWatch Pro AI Deterministic Institutional Engine'
    });
  } catch (err) {
    console.error('MoneyWatch AI fallback error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Gagal memproses analisis AI.' });
  }
});


// In-memory cache for external market data requests (TTL 60s for live quotes, 300s for historical)
// Helper: SSRF & URL security guard
export function isSafeProxyUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const b0 = parseInt(ipMatch[1], 10);
      const b1 = parseInt(ipMatch[2], 10);
      if (b0 === 10) return false;
      if (b0 === 127) return false;
      if (b0 === 169 && b1 === 254) return false;
      if (b0 === 192 && b1 === 168) return false;
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return false;
      if (b0 === 0) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

const proxyCache = new Map();

// Proxy endpoint for external financial feeds / CORS bypass with server-side caching & SSRF protection
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url parameter' });
  }

  if (!isSafeProxyUrl(targetUrl)) {
    return res.status(403).json({ error: 'Forbidden: URL is not permitted or violates SSRF protection policy' });
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
    // Yahoo gates these two endpoints behind a session cookie + crumb token
    // (the v8 chart endpoint used for prices stayed open). Any client-side
    // caller routing through this shared proxy — not just our own server
    // code — benefits from the same auth handled once, here.
    const needsCrumb = /\/v10\/finance\/quoteSummary\/|\/v7\/finance\/quote(\?|$)/.test(targetUrl);

    const buildHeaders = (auth) => {
      const h = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      };
      if (isYahoo) {
        h['Origin'] = 'https://finance.yahoo.com';
        h['Referer'] = 'https://finance.yahoo.com/';
      }
      if (auth) h['Cookie'] = auth.cookie;
      return h;
    };

    const withCrumb = (url, crumb) => url + (url.includes('?') ? '&' : '?') + 'crumb=' + encodeURIComponent(crumb);

    let response;
    if (needsCrumb) {
      let auth = await getYahooCrumb(false);
      response = await fetch(withCrumb(targetUrl, auth.crumb), { headers: buildHeaders(auth) });
      if (response.status === 401) {
        auth = await getYahooCrumb(true);
        response = await fetch(withCrumb(targetUrl, auth.crumb), { headers: buildHeaders(auth) });
      }
    } else {
      response = await fetch(targetUrl, { headers: buildHeaders(null) });
    }

    // Jika query1 gagal (404/429/500), coba alihkan otomatis ke query2
    if (!response.ok && targetUrl.includes('query1.finance.yahoo.com')) {
      const altUrl = targetUrl.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com');
      try {
        let altResp;
        if (needsCrumb) {
          const auth = await getYahooCrumb(false); // cached — same session as above
          altResp = await fetch(withCrumb(altUrl, auth.crumb), { headers: buildHeaders(auth) });
        } else {
          altResp = await fetch(altUrl, { headers: buildHeaders(null) });
        }
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

// ══════════════════════════════════════════════════════════
// KSEI 5%+ SHAREHOLDERS & FREE FLOAT INTELLIGENCE ENGINE
// ══════════════════════════════════════════════════════════
const DEFAULT_KSEI_SHEET_ID = '1GYz3TymfqJCITTWm4QKncRaw2uYLPnyq-VlnVyU8Udg';
let _kseiCache = null;

function parseKseiCsv(text, docId, url) {
  function parseCSV(str) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      const next = str[i + 1];
      if (c === "\"" && inQuotes && next === "\"") {
        cell += "\"";
        i++;
      } else if (c === "\"") {
        inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        row.push(cell.trim());
        cell = "";
      } else if ((c === "\r" || c === "\n") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(cell.trim());
        if (row.some(x => x !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += c;
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some(x => x !== "")) rows.push(row);
    }
    return rows;
  }

  const rows = parseCSV(text);
  const title = rows[0] && rows[0][0] ? rows[0][0] : "";
  const dateMatch = title.match(/per tanggal\s+([^\,]+)/i);
  const reportDate = dateMatch ? dateMatch[1].trim() : "26 Aug 2026";

  const prevDateMatch = rows[2] && rows[2][11] ? rows[2][11].match(/Per\s+([^\,]+)/i) : null;
  const prevDate = prevDateMatch ? prevDateMatch[1].trim() : "Periode Lalu";

  const latestDateMatch = rows[2] && rows[2][14] ? rows[2][14].match(/Per\s+([^\,]+)/i) : null;
  const latestDate = latestDateMatch ? latestDateMatch[1].trim() : reportDate;

  const dataByTicker = {};
  let currentTicker = "";
  let currentEmitenName = "";
  let currentInvestor = null;

  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 5) continue;

    const noCol = (r[0] || "").trim();
    const tickerCol = (r[1] || "").trim();
    const emitenCol = (r[2] || "").trim();
    const custodianCol = (r[3] || "").trim();
    const investorCol = (r[4] || "").trim();
    const accNameCol = (r[5] || "").trim();
    const domicileCol = (r[9] || "").trim();
    const statusCol = (r[10] || "L").toUpperCase().startsWith("A") ? "Asing" : "Lokal";

    const sharesSub = parseInt((r[14] || r[11] || "").replace(/,/g, ""), 10) || 0;
    const sharesTotal = parseInt((r[15] || r[12] || "").replace(/,/g, ""), 10) || sharesSub;
    const pctTotal = parseFloat((r[16] || r[13] || "").replace(/,/g, "")) || 0;
    const change = parseInt((r[17] || "").replace(/,/g, ""), 10) || 0;

    if (tickerCol && /^[A-Z0-9]{4,5}$/.test(tickerCol)) {
      currentTicker = tickerCol;
    }
    if (emitenCol) {
      currentEmitenName = emitenCol;
    }

    if (!currentTicker) continue;

    if (!dataByTicker[currentTicker]) {
      dataByTicker[currentTicker] = {
        ticker: currentTicker,
        name: currentEmitenName || currentTicker,
        investors: [],
        totalMajorPercent: 0,
        freeFloat: 100,
        localPercent: 0,
        foreignPercent: 0,
        totalSharesHeld: 0,
        netChangeShares: 0,
        reportDate: reportDate,
        prevDate: prevDate,
        latestDate: latestDate
      };
    }

    if (noCol !== "" || investorCol !== "") {
      const invName = investorCol || (currentInvestor ? currentInvestor.name : "Investor");
      currentInvestor = {
        name: invName,
        percentage: pctTotal,
        shares: sharesTotal,
        change: change,
        status: statusCol,
        domicile: domicileCol || "INDONESIA",
        accounts: []
      };
      if (custodianCol || accNameCol) {
        currentInvestor.accounts.push({
          custodian: custodianCol,
          accountName: accNameCol,
          shares: sharesSub,
          domicile: domicileCol
        });
      }
      dataByTicker[currentTicker].investors.push(currentInvestor);
    } else if (currentInvestor) {
      if (custodianCol || accNameCol) {
        currentInvestor.accounts.push({
          custodian: custodianCol,
          accountName: accNameCol,
          shares: sharesSub,
          domicile: domicileCol || currentInvestor.domicile
        });
      }
    }
  }

  let totalHoldersCount = 0;
  Object.keys(dataByTicker).forEach(t => {
    const item = dataByTicker[t];
    let totPct = 0;
    let locPct = 0;
    let forPct = 0;
    let totShares = 0;
    let totChg = 0;

    item.investors.forEach(inv => {
      totPct += inv.percentage;
      if (inv.status === "Asing") forPct += inv.percentage;
      else locPct += inv.percentage;
      totShares += inv.shares;
      totChg += inv.change;
    });

    item.totalMajorPercent = Math.min(100, Math.round(totPct * 100) / 100);
    item.freeFloat = Math.max(0, Math.round((100 - item.totalMajorPercent) * 100) / 100);
    item.localPercent = Math.round(locPct * 100) / 100;
    item.foreignPercent = Math.round(forPct * 100) / 100;
    item.totalSharesHeld = totShares;
    item.netChangeShares = totChg;
    totalHoldersCount += item.investors.length;
  });

  return {
    metadata: {
      source: "KSEI (Kustodian Sentral Efek Indonesia) via Google Sheets",
      sheetId: docId,
      sheetUrl: url,
      title: title,
      reportDate: reportDate,
      prevDate: prevDate,
      latestDate: latestDate,
      totalEmiten: Object.keys(dataByTicker).length,
      totalMajorInvestors: totalHoldersCount,
      lastUpdated: new Date().toISOString()
    },
    data: dataByTicker
  };
}

function getStoredKseiData() {
  if (_kseiCache && _kseiCache.metadata && _kseiCache.metadata.totalEmiten > 0) return _kseiCache;
  const filePath = path.join(__dirname, 'data', 'ksei-shareholders.json');
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      try {
        _kseiCache = JSON.parse(content);
      } catch (jsonErr) {
        // Sanitize any problematic control characters or escape sequences
        const sanitized = content
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
            if (c === '\n' || c === '\r' || c === '\t') return ' ';
            return '';
          });
        _kseiCache = JSON.parse(sanitized);
      }
      if (_kseiCache && _kseiCache.metadata) {
        return _kseiCache;
      }
    } catch (e) {
      console.warn('[KSEI Cache Warning] Error parsing cached KSEI json:', e.message);
      // If parsing fails, create empty fallback and trigger background sync if possible
      _kseiCache = { metadata: { totalEmiten: 0, reportDate: 'Belum Sinkron' }, data: {} };
    }
  }
  return _kseiCache || { metadata: { totalEmiten: 0, reportDate: 'Belum Sinkron' }, data: {} };
}

// FIX (bug, prioritas sedang): endpoint /api/idx/* dan /api/ksei/* memanggil
// Yahoo Finance & idx.co.id pihak ketiga tanpa batas — trafik tinggi bisa
// membuat IP server ini kena rate-limit/block dari Yahoo/IDX untuk SEMUA
// pengguna aplikasi, bukan cuma yang membuat request tersebut. Limiter lebih
// longgar dari endpoint AI (data harga wajar sering di-load banyak sekaligus
// saat buka Dashboard/Screener), tapi tetap ada batas.
const dataApiRateLimiter = createRateLimiter(60 * 1000, 60); // 60 request/menit/IP
app.use('/api/idx', dataApiRateLimiter);
app.use('/api/ksei', dataApiRateLimiter);

// GET endpoint to return KSEI 5%+ shareholders and Free Float data
app.get('/api/ksei/data', (req, res) => {
  try {
    const ksei = getStoredKseiData();
    if (!ksei) {
      return res.status(404).json({ success: false, error: 'KSEI dataset not yet initialized. Please run sync.' });
    }

    const { search, minFreeFloat, maxFreeFloat, status, sort, limit, offset } = req.query;
    let list = Object.values(ksei.data || {});

    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(item => {
        if (item.ticker.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)) return true;
        return item.investors.some(inv => inv.name.toLowerCase().includes(q));
      });
    }

    if (minFreeFloat !== undefined) {
      list = list.filter(item => item.freeFloat >= parseFloat(minFreeFloat));
    }
    if (maxFreeFloat !== undefined) {
      list = list.filter(item => item.freeFloat <= parseFloat(maxFreeFloat));
    }
    if (status === 'foreign_heavy') {
      list = list.filter(item => item.foreignPercent > item.localPercent);
    } else if (status === 'accumulating') {
      list = list.filter(item => item.netChangeShares > 0);
    } else if (status === 'distributing') {
      list = list.filter(item => item.netChangeShares < 0);
    }

    if (sort === 'freefloat_asc') list.sort((a, b) => a.freeFloat - b.freeFloat);
    else if (sort === 'freefloat_desc') list.sort((a, b) => b.freeFloat - a.freeFloat);
    else if (sort === 'major_desc') list.sort((a, b) => b.totalMajorPercent - a.totalMajorPercent);
    else if (sort === 'foreign_desc') list.sort((a, b) => b.foreignPercent - a.foreignPercent);
    else if (sort === 'change_desc') list.sort((a, b) => b.netChangeShares - a.netChangeShares);
    else list.sort((a, b) => a.ticker.localeCompare(b.ticker));

    const totalCount = list.length;
    const start = parseInt(offset, 10) || 0;
    const pageLimit = parseInt(limit, 10) || list.length;
    const paginated = list.slice(start, start + pageLimit);

    return res.json({
      success: true,
      metadata: ksei.metadata,
      total: totalCount,
      count: paginated.length,
      data: paginated
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET endpoint to return single stock KSEI details
app.get('/api/ksei/stock/:ticker', (req, res) => {
  try {
    const rawTicker = (req.params.ticker || '').toUpperCase().replace('.JK', '').replace('.US', '');
    const ksei = getStoredKseiData();
    if (!ksei || !ksei.data) {
      return res.status(404).json({ success: false, error: 'KSEI dataset not found' });
    }

    const stock = ksei.data[rawTicker];
    if (!stock) {
      return res.json({
        success: true,
        found: false,
        ticker: rawTicker,
        stock: {
          ticker: rawTicker,
          name: rawTicker,
          investors: [],
          totalMajorPercent: 0,
          freeFloat: 100,
          localPercent: 0,
          foreignPercent: 0,
          totalSharesHeld: 0,
          netChangeShares: 0,
          reportDate: ksei.metadata ? ksei.metadata.reportDate : 'Terbaru',
          note: 'Tidak terdapat investor dengan kepemilikan >5% yang tercatat di KSEI (Free float publik mendekati 100% atau pemegang saham tersebar di bawah 5%).'
        }
      });
    }

    return res.json({
      success: true,
      found: true,
      ticker: rawTicker,
      metadata: ksei.metadata,
      stock: stock
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST endpoint to sync / refresh KSEI data directly from Google Sheets
app.post('/api/ksei/sync', async (req, res) => {
  try {
    let sheetId = (req.body && req.body.sheetId) || DEFAULT_KSEI_SHEET_ID;
    const rawUrl = (req.body && req.body.sheetUrl) || '';
    if (rawUrl && rawUrl.includes('/d/')) {
      const match = rawUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) sheetId = match[1];
    }

    const exportUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/export?format=csv';
    console.log('[KSEI Sync] Fetching CSV from ' + exportUrl + '...');

    const response = await fetch(exportUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error('Google Sheets responded with status ' + response.status + ' ' + response.statusText);
    }

    const csvText = await response.text();
    if (!csvText || csvText.length < 500) {
      throw new Error('Retrieved CSV content is too small or invalid');
    }

    const parsed = parseKseiCsv(csvText, sheetId, exportUrl);
    _kseiCache = parsed;

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const targetFile = path.join(dataDir, 'ksei-shareholders.json');
    const tmpFile = path.join(dataDir, 'ksei-shareholders.tmp.json');
    fs.writeFileSync(tmpFile, JSON.stringify(parsed, null, 2), 'utf8');
    fs.renameSync(tmpFile, targetFile);

    console.log('[KSEI Sync] Successfully updated ' + parsed.metadata.totalEmiten + ' emiten, report date: ' + parsed.metadata.reportDate);

    return res.json({
      success: true,
      message: 'KSEI 5%+ Shareholders & Free Float data successfully synced and saved',
      metadata: parsed.metadata,
      stats: {
        totalEmiten: parsed.metadata.totalEmiten,
        totalMajorInvestors: parsed.metadata.totalMajorInvestors,
        reportDate: parsed.metadata.reportDate,
        lastUpdated: parsed.metadata.lastUpdated
      }
    });
  } catch (err) {
    console.error('[KSEI Sync Error]', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync KSEI data from Google Sheets',
      message: err.message
    });
  }
});

// GET endpoint to return high-level summary & radar statistics from KSEI
app.get('/api/ksei/summary', (req, res) => {
  try {
    const ksei = getStoredKseiData();
    if (!ksei || !ksei.data) {
      return res.status(404).json({ success: false, error: 'Dataset not loaded' });
    }

    const all = Object.values(ksei.data);
    const lowestFreeFloat = [...all].filter(x => x.investors.length > 0).sort((a, b) => a.freeFloat - b.freeFloat).slice(0, 10);
    const highestFreeFloat = [...all].filter(x => x.investors.length > 0).sort((a, b) => b.freeFloat - a.freeFloat).slice(0, 10);
    const topForeignHeld = [...all].filter(x => x.foreignPercent > 0).sort((a, b) => b.foreignPercent - a.foreignPercent).slice(0, 10);
    const topAccumulating = [...all].filter(x => x.netChangeShares > 0).sort((a, b) => b.netChangeShares - a.netChangeShares).slice(0, 10);
    const topDistributing = [...all].filter(x => x.netChangeShares < 0).sort((a, b) => a.netChangeShares - b.netChangeShares).slice(0, 10);

    return res.json({
      success: true,
      metadata: ksei.metadata,
      summary: {
        totalEmiten: all.length,
        lowestFreeFloat,
        highestFreeFloat,
        topForeignHeld,
        topAccumulating,
        topDistributing
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// IDX DATA HUB ENDPOINTS (Integrated from NeaByteLab/IDX-API)
// ══════════════════════════════════════════════════════════

// GET /api/idx/summary — High-level trade summary & live breadth
app.get('/api/idx/summary', async (req, res) => {
  try {
    const summary = await getIdxMarketSummary();
    return res.json({ success: true, ...summary });
  } catch (err) {
    console.error('[IDX API Summary Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/stocks — Master directory of 950+ IDX securities
app.get('/api/idx/stocks', (req, res) => {
  try {
    const universe = loadBaseUniverse();
    let list = Object.values(universe);
    const { search, sector, board, index, limit, offset } = req.query;

    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(item => item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
    }

    if (sector && sector !== 'ALL') {
      list = list.filter(item => item.sector && item.sector.toLowerCase() === sector.toLowerCase());
    }

    if (board) {
      list = list.filter(item => item.board && item.board.toLowerCase() === board.toLowerCase());
    }

    if (index) {
      const idxKey = index.toLowerCase();
      list = list.filter(item => item.indexes && item.indexes[idxKey]);
    }

    const total = list.length;
    const start = parseInt(offset, 10) || 0;
    const pageLimit = parseInt(limit, 10) || total;
    const paginated = list.slice(start, start + pageLimit);

    return res.json({
      success: true,
      total: total,
      count: paginated.length,
      data: paginated
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/quote/:ticker — Real-time quote, OHLCV, Orderbook & Fundamentals
app.get('/api/idx/quote/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });

    const quote = await fetchYahooQuote(ticker);
    
    // Connect KSEI ownership if available
    const ksei = getStoredKseiData();
    const cleanTk = ticker.toUpperCase().replace(/\.JK$/i, '').trim();
    const kseiItem = ksei?.data?.[cleanTk] || null;

    return res.json({
      success: true,
      quote: quote,
      ksei: kseiItem ? {
        freeFloat: kseiItem.freeFloat,
        totalMajorPercent: kseiItem.totalMajorPercent,
        localPercent: kseiItem.localPercent,
        foreignPercent: kseiItem.foreignPercent,
        investorsCount: kseiItem.investors?.length || 0,
        topHolders: kseiItem.investors?.slice(0, 5) || []
      } : null
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/history/:ticker?tf=D|W|M|Y|DAILY_MAX&market=id|us|crypto — Real
// price history series. tf maps to Yahoo Finance chart intervals: D=5m/1d,
// W=30m/5d, M=1d/1mo, Y=1wk/1y — used by the Grafik Harga Realtime chart
// (Stock Intelligence Cockpit) — plus DAILY_MAX=1d/10y, used to reconstruct
// real day-by-day portfolio equity across a user's full holding period
// (rebuildEquityHistoryFromTransactions() in public/js/03-engine.js). market
// selects how :ticker is shaped into a Yahoo symbol: 'id' (default) appends
// .JK for Indonesian stocks, 'us' is used raw for US-listed tickers (ETF),
// 'crypto' appends -USD (Yahoo has no historical CODE-IDR chart — confirmed
// 404 for BTC-IDR/ADA-IDR) — callers must convert to IDR themselves using a
// historical USD/IDR series (market=us on 'USDIDR=X'), which is exactly
// what rebuildEquityHistoryFromTransactions() does.
app.get('/api/idx/history/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });
    // Bound the symbol before it reaches the upstream Yahoo URL — this is a
    // user-controlled value on an externally-reachable route. `=` is allowed
    // for FX pairs (e.g. USDIDR=X, used to convert historical crypto/ETF
    // values to IDR).
    if (!/^[A-Z0-9^.=\-]{1,15}$/i.test(ticker)) {
      return res.status(400).json({ success: false, error: 'Invalid ticker format' });
    }
    const tf = ['1D', '1W', '1M', '1Y', 'DAILY_MAX'].includes(req.query.tf) ? req.query.tf : '1D';
    const market = ['id', 'us', 'crypto'].includes(req.query.market) ? req.query.market : 'id';

    const history = await fetchYahooHistory(ticker, tf, market);
    return res.json({ success: !history.error, ...history });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/ai-signal/:ticker — Real composite technical+fundamental
// signal for a single ticker (used by the AI Trading Deep Analysis tab).
app.get('/api/idx/ai-signal/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });
    const signal = await computeStockSignal(ticker);
    return res.json({ success: !signal.error, signal });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET/POST /api/idx/ai-scan — Real composite signals across a list of
// tickers (used by the AI Trading Scanner). Replaces the old client-side
// charCodeAt(0) hash — every field here is computed from real Yahoo
// Finance price history + fundamentals, capped at 80 tickers per request
// (each one costs 2 upstream fetches) so a scan stays responsive; the
// default list is the official LQ45 constituents when none is given.
app.get('/api/idx/ai-scan', async (req, res) => {
  try {
    let tickers = req.query.tickers ? String(req.query.tickers).split(',') : null;
    if (!tickers || !tickers.length) {
      const universe = loadBaseUniverse();
      tickers = Object.values(universe).filter(u => u.indexes && u.indexes.lq45).map(u => u.code);
    }
    const signals = await computeStockSignalBatch(tickers);
    return res.json({ success: true, count: signals.length, signals });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/idx/ai-scan', async (req, res) => {
  try {
    const tickers = Array.isArray(req.body.tickers) ? req.body.tickers : [];
    if (!tickers.length) return res.status(400).json({ success: false, error: 'tickers array required' });
    const signals = await computeStockSignalBatch(tickers);
    return res.json({ success: true, count: signals.length, signals });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/hypothesis/:ticker — Signal & Confluence Engine (Paper/
// Research mode only, see AGENTS.md §3-11). Combines the real composite
// signal, a real IHSG-derived market regime classification, and real
// broker/smart-money evidence (excluded from scoring whenever it's
// simulated) into one structured trading hypothesis. Returns
// side:'NO_TRADE' — never a fabricated BUY — whenever the Data Quality
// Gate, R:R, regime, or contradiction checks fail; every reason is listed
// in the response's gateFailures. No real order is ever placed from this.
//
// Optional ?cash=&equity=&riskPct= query params carry the caller's REAL
// current paper-account numbers (AI_TRADE_STATE.paperAccount client-side)
// through to generateTradingHypothesis() so suggestedPositionSizing in the
// response reflects what would actually happen on "Buka Posisi Paper" —
// not a fabricated reference-account number. Omitted/invalid values are
// left undefined rather than coerced to 0, so the engine's own "account
// unavailable" fallback applies honestly instead of sizing against Rp0.
app.get('/api/idx/hypothesis/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });
    const cash = req.query.cash != null && req.query.cash !== '' ? Number(req.query.cash) : undefined;
    const equity = req.query.equity != null && req.query.equity !== '' ? Number(req.query.equity) : undefined;
    const riskPct = req.query.riskPct != null && req.query.riskPct !== '' ? Number(req.query.riskPct) : undefined;
    const accountContext = (Number.isFinite(cash) && Number.isFinite(equity) && Number.isFinite(riskPct))
      ? { cash, totalEquity: equity, riskPerTradePct: riskPct }
      : undefined;
    const hypothesis = await generateTradingHypothesis(ticker, accountContext);
    return res.json({ success: true, hypothesis });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/exit-hypothesis/:ticker — Sell/Exit Hypothesis for an
// already-open paper position (the other half of /api/idx/hypothesis's
// BUY/NO_TRADE — see generateExitHypothesis in lib/idx-data-engine.js).
// The server has no state of its own about what's open; the caller
// (the client's paper account) supplies the position context via query
// params. currentPrice is re-fetched fresh server-side when not supplied,
// matching the freshness pattern already used when a position is opened.
app.get('/api/idx/exit-hypothesis/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });

    const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v))) ? Number(v) : null;
    let currentPrice = num(req.query.currentPrice);
    if (currentPrice == null) {
      try {
        const q = await fetchYahooQuote(ticker);
        // INV-004 follow-up: a fabricated/simulated quote must not become
        // "currentPrice" for an exit-hypothesis decision on a real open
        // position (SL/TP-hit checks, unrealized P&L) — fall through to no
        // currentPrice instead, same as a hard fetch failure, so
        // generateExitHypothesis degrades honestly rather than deciding
        // off a fake price.
        if (q && !q.isSimulated && q.price > 0) currentPrice = q.price;
      } catch (e) { /* fall back to no currentPrice — generateExitHypothesis degrades honestly */ }
    }

    const position = {
      entryPrice: num(req.query.entry),
      currentPrice,
      sl: num(req.query.sl),
      tp1: num(req.query.tp1),
      tp2: num(req.query.tp2),
      lots: num(req.query.lots)
    };

    const hypothesis = await generateExitHypothesis(ticker, position);
    return res.json({ success: true, hypothesis });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/data-quality/:ticker — real Data Quality Gate status
// (assessDataQuality) for one ticker's OHLCV history, plus the same
// assessment already computed for the IHSG regime feed
// (classifyMarketRegime's ^JKSE history). Backs the Data Quality Monitor
// page, which used to show a fixed 5-row table of fabricated quality
// scores unrelated to any real ticker — this returns the same
// REAL/STALE/UNAVAILABLE/SIMULATION/INVALID status (with reasons) that
// already gates /api/idx/hypothesis/:ticker, without paying for the full
// confluence computation (signal + broker summary) just to read it.
app.get('/api/idx/data-quality/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });
    const [history, regime] = await Promise.all([
      fetchYahooHistory(ticker, 'SCAN'),
      classifyMarketRegime()
    ]);
    const dataQuality = assessDataQuality(ticker, history);
    return res.json({ success: true, dataQuality, ihsgDataQuality: regime.dataQuality });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/regime — real market regime classification (classifyMarketRegime,
// already used server-side by generateTradingHypothesis()/computeConfluence() and
// by /api/idx/data-quality/:ticker above) for the AI Trading page's Market Regime
// tab, which used to only show honest "Belum Dihitung" placeholders because no
// route exposed this classifier to the client.
app.get('/api/idx/regime', async (req, res) => {
  try {
    const regime = await classifyMarketRegime();
    return res.json({ success: true, regime });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function getDefaultLq45Tickers() {
  const universe = loadBaseUniverse();
  return Object.values(universe).filter(u => u.indexes && u.indexes.lq45).map(u => u.code);
}

// GET /api/idx/strategies — list of real (rule-based) backtestable
// strategy definitions (see lib/idx-data-engine.js#STRATEGY_DEFINITIONS).
app.get('/api/idx/strategies', (req, res) => {
  return res.json({ success: true, strategies: Object.values(STRATEGY_DEFINITIONS) });
});

// GET /api/idx/backtest/:strategyId — real walk-forward-style backtest of
// one strategy across a ticker list (defaults to LQ45), simulated
// bar-by-bar over 2 years of real daily OHLCV. Replaces the old "Run
// Backtest" button that only displayed a toast.
app.get('/api/idx/backtest/:strategyId', async (req, res) => {
  try {
    const tickers = req.query.tickers ? String(req.query.tickers).split(',') : getDefaultLq45Tickers();
    const result = await runStrategyBacktest(req.params.strategyId, tickers);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/idx/backtest-all — runs every implemented strategy (used by
// Strategy Lab to show real, freshly-computed stats per strategy).
app.get('/api/idx/backtest-all', async (req, res) => {
  try {
    const tickers = req.query.tickers ? String(req.query.tickers).split(',') : getDefaultLq45Tickers();
    const results = await runAllStrategiesBacktest(tickers);
    return res.json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/broker-summary/:ticker — Comprehensive Broker Flow & Bandarmology
app.get('/api/idx/broker-summary/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    const timeframe = (req.query.timeframe || '1D').toUpperCase();
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });

    const quote = await fetchYahooQuote(ticker);
    const summary = await generateBrokerSummary(ticker, quote, timeframe);

    if (summary.isValidTicker === false || summary.price <= 0) {
      return res.json({
        success: false,
        isValidTicker: false,
        error: `Ticker "${ticker}" tidak terdaftar dalam Stock Universe IDX`,
        data: summary
      });
    }

    return res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/invezgo-status — Quota/cache/error observability for the
// Invezgo integration (audit doc `observability.metrics` + `production_gate.
// operations`: quota telemetry, cache ratio, error rate must be observable).
// Aggregate counters only — no financial/user data exposed.
app.get('/api/idx/invezgo-status', async (req, res) => {
  try {
    const [quota, metrics] = await Promise.all([getQuotaUsage(), getMetricsToday()]);
    const cacheTotal = (metrics.cache_hits || 0) + (metrics.cache_misses || 0);
    return res.json({
      success: true,
      quota: {
        used: quota.used,
        monthlyBudget: MONTHLY_QUOTA,
        remaining: quota.remaining,
        usagePct: Math.round(quota.pct * 1000) / 10,
        alert80: quota.pct >= 0.8,
        alert90: quota.pct >= 0.9
      },
      today: {
        ...metrics,
        cacheHitRatioPct: cacheTotal > 0 ? Math.round((metrics.cache_hits / cacheTotal) * 1000) / 10 : null
      },
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/brokers — Master list of Indonesian brokers
app.get('/api/idx/brokers', (req, res) => {
  try {
    return res.json({
      success: true,
      count: Object.keys(IDX_BROKERS).length,
      brokers: IDX_BROKERS
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/idx/quotes — Batch real-time quotes
app.post('/api/idx/quotes', async (req, res) => {
  try {
    const tickers = req.body.tickers || [];
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ success: false, error: 'Tickers array required' });
    }

    const cleanTickers = tickers.slice(0, 30).map(t => String(t).toUpperCase().replace(/\.JK$/i, '').trim());
    const results = await Promise.allSettled(cleanTickers.map(t => fetchYahooQuote(t)));

    const quotes = {};
    results.forEach((r, idx) => {
      const tk = cleanTickers[idx];
      if (r.status === 'fulfilled') {
        quotes[tk] = r.value;
      }
    });

    return res.json({ success: true, count: Object.keys(quotes).length, quotes });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/screener — Multi-factor screener across IDX universe
app.get('/api/idx/screener', async (req, res) => {
  try {
    const universe = loadBaseUniverse();
    let list = Object.values(universe);
    const { sector, index, minPer, maxPer, minPbv, maxPbv, minRoe, maxDer, minMarketCap, search, sort, order, limit } = req.query;

    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(item => item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
    }

    if (sector && sector !== 'ALL') {
      list = list.filter(item => item.sector && item.sector.toLowerCase() === sector.toLowerCase());
    }

    if (index) {
      const idxKey = index.toLowerCase();
      list = list.filter(item => item.indexes && item.indexes[idxKey]);
    }

    // Sample top tickers for quick fundamental check
    const topSample = list.slice(0, parseInt(limit, 10) || 50);
    const quoteResults = await Promise.allSettled(topSample.map(item => fetchYahooQuote(item.code)));

    const enriched = quoteResults.map((qr, i) => {
      const base = topSample[i];
      const q = qr.status === 'fulfilled' ? qr.value : null;
      return {
        code: base.code,
        name: base.name,
        sector: base.sector,
        board: base.board,
        price: q?.price || base.basePrice || 0,
        changePercent: q?.changePercent || 0,
        // INV-010: no static 5-billion-share default — null when the share
        // count isn't verified, rather than a fabricated market cap.
        marketCap: q?.marketCap ?? (base.shares ? (base.basePrice || 1000) * base.shares : null),
        volume: q?.volume || 0,
        // INV-004/INV-009: when the quote itself is simulated (Yahoo
        // unreachable, no cache — see fetchYahooQuote's isSimulated flag),
        // its fundamentals are fabricated too. Previously this fell back to
        // hardcoded constants (PER 12.5/PBV 1.5/ROE 14.0/DER 0.8/NPM 12.0)
        // indistinguishable from real ratios in a screener result. Null
        // them out instead — isSimulated below tells the caller why.
        per: (q && !q.isSimulated) ? (q.fundamentals?.per ?? null) : null,
        pbv: (q && !q.isSimulated) ? (q.fundamentals?.pbv ?? null) : null,
        roe: (q && !q.isSimulated) ? (q.fundamentals?.roe ?? null) : null,
        der: (q && !q.isSimulated) ? (q.fundamentals?.der ?? null) : null,
        npm: (q && !q.isSimulated) ? (q.fundamentals?.npm ?? null) : null,
        dividendYield: (q && !q.isSimulated) ? (q.fundamentals?.dividendYield ?? null) : null,
        isSimulated: !q || !!q.isSimulated
      };
    });

    // Apply numerical filters
    let filtered = enriched;
    if (minPer !== undefined) filtered = filtered.filter(x => x.per >= parseFloat(minPer));
    if (maxPer !== undefined) filtered = filtered.filter(x => x.per <= parseFloat(maxPer));
    if (minPbv !== undefined) filtered = filtered.filter(x => x.pbv >= parseFloat(minPbv));
    if (maxPbv !== undefined) filtered = filtered.filter(x => x.pbv <= parseFloat(maxPbv));
    if (minRoe !== undefined) filtered = filtered.filter(x => x.roe >= parseFloat(minRoe));
    if (maxDer !== undefined) filtered = filtered.filter(x => x.der <= parseFloat(maxDer));

    // Sort. marketCap (and, in principle, any other field) can now be null
    // (INV-010: unverified share count is never treated as zero) — null
    // always sorts to the bottom regardless of direction, rather than
    // getting coerced to 0 and outranking legitimately low-but-real values.
    const sortField = sort || 'marketCap';
    const isDesc = order !== 'asc';
    filtered.sort((a, b) => {
      const vA = a[sortField];
      const vB = b[sortField];
      if (vA == null && vB == null) return 0;
      if (vA == null) return 1;
      if (vB == null) return -1;
      return isDesc ? (vB > vA ? 1 : -1) : (vA > vB ? 1 : -1);
    });

    return res.json({
      success: true,
      totalUniverse: list.length,
      count: filtered.length,
      results: filtered
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/top-movers — Live Top Gainers, Losers, and Active Stocks
app.get('/api/idx/top-movers', async (req, res) => {
  try {
    const summary = await getIdxMarketSummary();
    return res.json({
      success: true,
      topGainers: summary.topGainers || [],
      topLosers: summary.topLosers || [],
      mostActive: summary.mostActive || [],
      updatedAt: summary.updatedAt
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/indices — Major IDX Indices and Sectoral Performance
app.get('/api/idx/indices', async (req, res) => {
  try {
    const summary = await getIdxMarketSummary();
    const indices = [
      { code: 'IHSG', name: 'Indeks Harga Saham Gabungan', price: summary.ihsg.price, change: summary.ihsg.change, changePercent: summary.ihsg.changePercent },
      { code: 'LQ45', name: 'Indeks LQ45 Terlikuid', price: 924.50, change: 18.20, changePercent: 2.01 },
      { code: 'IDX30', name: 'Indeks IDX30 Bluechip', price: 478.10, change: 9.40, changePercent: 2.01 },
      { code: 'KOMPAS100', name: 'Indeks Kompas 100', price: 1180.40, change: 21.60, changePercent: 1.86 },
      { code: 'SRI-KEHATI', name: 'Indeks SRI-KEHATI ESG', price: 420.15, change: 7.80, changePercent: 1.89 },
      { code: 'ISSI', name: 'Indeks Saham Syariah Indonesia', price: 216.80, change: 3.40, changePercent: 1.59 }
    ];

    const sectors = [
      { name: 'Keuangan', changePercent: 2.45, status: 'up' },
      { name: 'Energi', changePercent: 3.12, status: 'up' },
      { name: 'Barang Baku', changePercent: 1.80, status: 'up' },
      { name: 'Perindustrian', changePercent: 0.95, status: 'up' },
      { name: 'Konsumer Primer', changePercent: 0.40, status: 'up' },
      { name: 'Konsumer Non-Primer', changePercent: -0.25, status: 'down' },
      { name: 'Kesehatan', changePercent: 0.15, status: 'up' },
      { name: 'Properti', changePercent: 1.10, status: 'up' },
      { name: 'Teknologi', changePercent: -1.20, status: 'down' },
      { name: 'Infrastruktur', changePercent: 1.65, status: 'up' },
      { name: 'Transportasi & Logistik', changePercent: 0.85, status: 'up' }
    ];

    return res.json({
      success: true,
      indices: indices,
      sectors: sectors,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/opportunity-radar — Dynamic Opportunity Radar across 950+ IDX Universe
app.get('/api/idx/opportunity-radar', async (req, res) => {
  try {
    const data = await getUniverseOpportunityRadar(req.query);
    return res.json(data);
  } catch (err) {
    console.error('[IDX Opportunity Radar Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/accumulation-distribution — Full Universe Accumulation & Distribution Scanner
app.get('/api/idx/accumulation-distribution', async (req, res) => {
  try {
    const data = await getUniverseAccumulationDistribution(req.query);
    return res.json(data);
  } catch (err) {
    console.error('[IDX Acc/Dist Scanner Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/flow-trail/:ticker — Interactive Transaction Flow Visualizer per Ticker
app.get('/api/idx/flow-trail/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker;
    const timeframe = (req.query.timeframe || '1D').toUpperCase();
    if (!ticker) return res.status(400).json({ success: false, error: 'Ticker required' });

    const data = await getTransactionFlowVisualizer(ticker, timeframe);
    return res.json(data);
  } catch (err) {
    console.error('[IDX Flow Trail Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/idx/calendar — Corporate Actions (Dividends, Splits, Rights Issues, RUPS, Suspensions)
app.get('/api/idx/calendar', (req, res) => {
  try {
    const cal = getIdxCalendarData(req.query);
    return res.json({ success: true, ...cal });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Serve static assets from the public/ directory (client-facing files only —
// keeps data/, lib/, server.js, etc. out of reach when running as a plain
// Node server, matching Vercel's static/function split)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html', 'htm']
}));

// Route fallback for primary app entry point
app.get('/app', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Fallback for HTML5 client-side routing
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start HTTP server on 0.0.0.0:3000 (when not managed by Vercel serverless runtime)
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('Money Watch Pro server running on http://0.0.0.0:' + PORT);
  });
}

export default app;
