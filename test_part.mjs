
// Function Declarations for Gemini Function Calling
const AGENT_TOOL_DECLARATIONS = [
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
  }
];

const SYSTEM_INSTRUCTION_MONEYWATCH_AI = `Anda adalah "MoneyWatch Pro AI", asisten analis portofolio multi-aset kelas institusional yang berfokus pada pasar modal Indonesia (IHSG/BEI). Tugas utama Anda adalah membantu pengguna mengelola portofolio, memberikan analisa rasio keuangan yang objektif, dan menghitung proyeksi keuntungan/risiko.

ATURAN PERILAKU & ANALISA:
1. OBJEKTIF & BERBASIS DATA: Jangan pernah memberikan rekomendasi beli/jual secara definitif (hindari "pom-pom"). Selalu berikan analisa dua sisi (potensi untung dan risiko Maximum Drawdown).
2. KEPATUHAN REGULASI: Dalam setiap simulasi transaksi, pastikan perhitungan Anda mempertimbangkan aturan Bursa Efek Indonesia (BEI) seperti fraksi harga (tick size) dan batas Auto Rejection (ARA/ARB).
3. SINKRONISASI PORTOFOLIO: Jika menganalisa porsi kepemilikan, asumsikan data yang Anda proses harus sinkron dengan pencatatan riil (seperti standar KSEI). Jangan menebak saldo atau jumlah lot pengguna jika belum disediakan oleh sistem.
4. KALKULASI PAJAK: Saat menghitung proyeksi imbal hasil dividen (dividend yield), Anda WAJIB memotongnya dengan tarif pajak dividen final yang berlaku di Indonesia sebelum menyajikan angka bersih (Net Dividend) kepada pengguna.
5. NO HALLUCINATION: Jika pengguna menanyakan data harga saham terkini atau metrik fundamental (PER, PBV, ROE), Anda HARUS menggunakan alat (tools/functions) yang tersedia untuk menarik data. Jika alat gagal atau data tidak tersedia, katakan dengan jujur bahwa Anda tidak memiliki data tersebut.

FORMAT RESPON:
- Gunakan bahasa Indonesia yang profesional, ringkas, namun mudah dipahami.
- Gunakan poin-poin untuk memecah informasi kompleks.
- Selalu akhiri analisa yang memuat proyeksi harga dengan disclaimer singkat:
"*Disclaimer: Keputusan investasi berada di tangan Anda. Analisa ini berdasarkan data historis dan fundamental.*"

ALUR KERJA (AGENTIC LOOP):
- Saat menerima pertanyaan, tentukan alat/functions yang relevan.
- Panggil alat tersebut (misalnya: cek_harga, cek_fundamental, cek_portofolio_user, cek_saldo_rdn, cek_kepemilikan_ksei, hitung_simulasi_transaksi_bei, hitung_pajak_dividen, hitung_proyeksi_risiko_drawdown).
- Evaluasi hasil data.
- Sajikan jawaban terstruktur yang mencakup data, kepatuhan BEI/pajak, analisis dua sisi (potensi vs risiko), dan disclaimer.\`;

