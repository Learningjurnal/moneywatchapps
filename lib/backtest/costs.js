/**
 * lib/backtest/costs.js — SATU sumber biaya transaksi untuk semua backtest sisi-server.
 *
 * AUDIT 2026-10-05: backtest strategi lama memakai 0,2% round-trip sedangkan backtest akumulasi 0,4% — tidak
 * konsisten. Angka di sini diturunkan dari tarif bawaan aplikasi sendiri (public/js/01-data.js, tabel sekuritas):
 * buyFee 0,15% + sellFee 0,25% (sisi jual sudah termasuk PPh final 0,1%) = 0,40% round-trip. Slippage TIDAK
 * dimodelkan; itu asumsi optimistis. Klien (38-ai-autonomous-trading.js) memakai angka yang sama — dijaga tes.
 */
const BUY_FEE_PCT = 0.15;
const SELL_FEE_PCT = 0.25;
const ROUND_TRIP_COST_PCT = BUY_FEE_PCT + SELL_FEE_PCT; // 0.40

export { BUY_FEE_PCT, SELL_FEE_PCT, ROUND_TRIP_COST_PCT };
