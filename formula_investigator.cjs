const fs = require('fs');

function parseCSV(text) {
  const lines = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    
    if (c === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(current.trim());
      if (row.length > 0) {
        lines.push(row);
      }
      row = [];
      current = '';
    } else {
      current += c;
    }
  }
  if (current || row.length > 0) {
    row.push(current.trim());
    lines.push(row);
  }
  return lines;
}

const rows1 = parseCSV(fs.readFileSync('/tmp/sheet_stock_b.csv', 'utf8'));
const rows2 = parseCSV(fs.readFileSync('/tmp/sheet_tx.csv', 'utf8'));

// Extract all tickers from Sheet 1
const tickers = [];
for (let r = 5; r <= 104; r++) {
  if (rows1[r] && rows1[r][2] && rows1[r][2] !== '-' && rows1[r][2] !== '') {
    const ticker = rows1[r][2];
    tickers.push({
      row: r,
      ticker: ticker,
      sector: rows1[r][3],
      type: rows1[r][5],
      // Stock A
      costA: rows1[r][6],
      lotA: rows1[r][7],
      avgA: rows1[r][9],
      glA: rows1[r][10],
      glPctA: rows1[r][11],
      realizedA: rows1[r][12],
      // Stock B
      costB: rows1[r][14], // Modal / Margin Stock B
      lotB: rows1[r][15], // Lot Stock B
      avgB: rows1[r][17], // Avg Buy Stock B
      glB: rows1[r][18], // Capital Gain Stock B (Market)
      glPctB: rows1[r][19], // % Capital Gain Stock B
      realizedB_col20: rows1[r][20],
      realizedB_col21: rows1[r][21],
      realizedB_col22: rows1[r][22],
      // Market Price
      marketPrice: rows1[r][26],
    });
  }
}

console.log(`Extracted ${tickers.length} tickers from Sheet 1.`);
console.log('Sample Active Tickers in Sheet 1:');
tickers.filter(t => t.lotB && t.lotB !== '-' && t.lotB !== '0').forEach(t => {
  console.log(`${t.ticker}: Lot=${t.lotB}, Price=${t.marketPrice}, Modal_B(Margin)=${t.costB}, Avg_B=${t.avgB}, CapGain_B=${t.glB} (${t.glPctB})`);
});
