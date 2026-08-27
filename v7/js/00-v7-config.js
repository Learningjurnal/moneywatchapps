/**
 * MONEY WATCH PRO v7 — Config & Environment Setup
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.CONFIG = {
  VERSION: '7.0.0-PROD',
  BUILD_DATE: '2026-08-27',
  APP_NAME: 'Money Watch Pro v7',
  SUBTITLE: 'Personal Wealth Intelligence Platform',
  
  // API Endpoints (BFF)
  ENDPOINTS: {
    REALDATA_BATCH: '/api/realdata/batch',
    REALDATA_SINGLE: '/api/realdata',
    KSEI_SUMMARY: '/api/ksei/summary',
    KSEI_STOCK: '/api/ksei/stock',
    KSEI_DATA: '/api/ksei/data',
    USER_DATA_SAVE: '/api/user-data/save',
    USER_DATA_LOAD: '/api/user-data/load',
    AI_ANALYZE: '/api/ai/advisor-chat',
    EXPORT_PDF: '/api/export/pdf'
  },

  // Storage Keys (Shared with V6 or Isolated)
  STORAGE_KEYS: {
    PRIMARY: 'mw_local_data_v2',
    BACKUP: 'mw_emergency_backup_v2',
    V7_SETTINGS: 'mw_v7_preferences',
    V7_AUDIT: 'mw_v7_audit_trail',
    V7_SECURITY: 'mw_v7_security_state'
  },

  // Active Mode (Simple | Pro | Quant)
  DEFAULT_MODE: 'Pro',

  // Benchmark Tickers
  BENCHMARKS: [
    { ticker: 'IHSG', name: 'Indeks Harga Saham Gabungan', price: 7850, chg: 0.65 },
    { ticker: 'LQ45', name: 'Indeks Likuiditas 45', price: 978, chg: 0.42 },
    { ticker: 'IDX30', name: 'Indeks IDX 30', price: 495, chg: 0.38 },
    { ticker: 'USDIDR', name: 'US Dollar to IDR', price: 15720, chg: -0.15 },
    { ticker: 'BTCIDR', name: 'Bitcoin (IDR)', price: 1045000000, chg: 2.15 },
    { ticker: 'GOLD', name: 'Emas Antam (Gram)', price: 1420000, chg: 0.50 }
  ]
};
