// Sapuan invarian atas data production (atau --base lain). Pakai: npm run check:invariants -- [opsi]
//   --base URL     alamat aplikasi (default https://moneywatchapps.vercel.app)
//   --sample N     jumlah ticker untuk Harga Wajar (default 120; 0 = semua universe, lambat karena rate limit)
//   --only a,b     subset area: hw, screener, ai
//   --seeds N      jumlah seed simulasi AI Paper (default 5)
//   --steps N      langkah per seed (default 150)
// Exit code 1 bila ada ERROR (kontradiksi pasti bug); WARN hanya untuk ditinjau manusia.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Reporter, fetchJson, mapLimit } from './core.mjs';
import { checkFinancialStatement } from './harga-wajar.mjs';
import { checkScreener } from './screener.mjs';
import { runAiPaperProperties } from './ai-paper.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const base = opt('base', 'https://moneywatchapps.vercel.app').replace(/\/$/, '');
const sample = Number(opt('sample', 120));
const only = new Set(opt('only', 'hw,screener,ai').split(','));
const seeds = Number(opt('seeds', 5));
const steps = Number(opt('steps', 150));
const SENTINELS = ['BBCA', 'AMMN', 'TLKM', 'KEEN', 'PYFA', 'UNVR', 'ASII', 'GOTO', 'SMGR', 'PTRO', 'RAJA', 'ADRO', 'MEDC', 'BBNI', 'PANI'];

const reporter = new Reporter();
let screenerRows = [];

async function runScreener() {
  const q = (params) => fetchJson(`${base}/api/idx/unified-screener?limit=2000&${params}`);
  const variants = {
    byUptrend: await q('sort=uptrendScore&order=desc'),
    by7d: await q('sort=chg7d&order=desc'),
    by1dAsc: await q('sort=chg1d&order=asc'),
    byRank: await q('sort=rank&order=asc')
  };
  reporter.addAll('screener', base, checkScreener(variants));
  screenerRows = (variants.byUptrend && variants.byUptrend.rows) || [];
  console.log(`Screener: ${screenerRows.length} baris diperiksa pada 4 urutan sort.`);
}

async function runHargaWajar() {
  const priceOf = new Map(screenerRows.map((r) => [r.ticker, r.price]));
  const all = screenerRows.map((r) => r.ticker);
  let tickers = all;
  if (sample > 0 && all.length > sample) {
    const stride = all.length / sample;
    tickers = Array.from({ length: sample }, (_, i) => all[Math.floor(i * stride)]);
  }
  tickers = [...new Set([...SENTINELS, ...tickers])];
  if (!tickers.length) tickers = SENTINELS;
  let available = 0;
  await mapLimit(tickers, 2, async (ticker) => {
    const payload = await fetchJson(`${base}/api/idx/financial-statement/${ticker}`);
    if (payload && payload.available) available++;
    reporter.addAll('harga-wajar', ticker, checkFinancialStatement(payload, { price: priceOf.get(ticker) }));
  });
  console.log(`Harga Wajar: ${tickers.length} ticker diperiksa (${available} tersedia, sisanya jujur "tidak tersedia").`);
}

async function runAi() {
  for (let seed = 1; seed <= seeds; seed++) {
    reporter.addAll('ai-paper', `seed ${seed}`, await runAiPaperProperties({ rootDir, seed, steps }));
  }
  console.log(`AI Paper: ${seeds} seed x ${steps} langkah acak + skenario balapan.`);
}

console.log(`Sapuan invarian terhadap ${base}`);
if (only.has('screener') || only.has('hw')) await runScreener();
if (only.has('hw')) await runHargaWajar();
if (only.has('ai')) await runAi();
reporter.print();
process.exit(reporter.count('ERROR') > 0 ? 1 : 0);
