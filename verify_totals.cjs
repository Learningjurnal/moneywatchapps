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

function parseNum(str) {
  if (!str) return 0;
  let clean = str.replace(/Rp|\.|\s/g, '').replace(/▼|▲/g, '').trim();
  if (clean.startsWith('-') || clean.startsWith('(')) {
    clean = clean.replace(/[\(\)]/g, '');
    return -parseFloat(clean.replace(',', '.')) || 0;
  }
  return parseFloat(clean.replace(',', '.')) || 0;
}

let totalMarketValue = 0;
let totalMarginStockB = 0;
let totalCapGainStockB = 0;
let totalRealizedGainStockB = 0;

let totalMarginStockA = 0;
let totalCapGainStockA = 0;
let totalRealizedGainStockA = 0;

const activeHoldings = [];

for (let r = 5; r <= 104; r++) {
  const row = rows1[r];
  if (!row || !row[2]) continue;
  const ticker = row[2];
  const lot = parseNum(row[15]); // Col 15: Lot Stock B
  const marketPrice = parseNum(row[26]); // Col 26: Price
  const marketVal = lot * 100 * marketPrice;
  
  const marginB = parseNum(row[14]); // Col 14: Margin Stock B
  const capGainB = parseNum(row[18]); // Col 18: Capital Gain Stock B
  const realizedB = parseNum(row[20]); // Col 20: Realized Gain Stock B

  const marginA = parseNum(row[6]); // Col 6: Margin Stock A
  const capGainA = parseNum(row[10]); // Col 10: Capital Gain Stock A
  const realizedA = parseNum(row[12]); // Col 12: Realized Gain Stock A

  if (lot > 0) {
    totalMarketValue += marketVal;
    totalMarginStockB += marginB;
    totalCapGainStockB += capGainB;
    totalMarginStockA += marginA;
    totalCapGainStockA += capGainA;
    activeHoldings.push({
      ticker, lot, marketPrice, marketVal, marginB, capGainB, avgB: parseNum(row[17])
    });
  }
  totalRealizedGainStockB += realizedB;
  totalRealizedGainStockA += realizedA;
}

console.log('=== SUMMARY STOCK B FROM SHEET ===');
console.log(`Total Active Stocks: ${activeHoldings.length}`);
console.log(`Total Market Value (Equity Stock B): Rp ${totalMarketValue.toLocaleString('id-ID')}`);
console.log(`Total Margin (Stock B Cost Basis): Rp ${totalMarginStockB.toLocaleString('id-ID')}`);
console.log(`Total Capital Gain Stock B (Unrealized Market): Rp ${totalCapGainStockB.toLocaleString('id-ID')} (${(totalCapGainStockB / totalMarginStockB * 100).toFixed(2)}%)`);
console.log(`Calculated (MarketVal - MarginB): Rp ${(totalMarketValue - totalMarginStockB).toLocaleString('id-ID')}`);
console.log(`Total Realized Gain Stock B: Rp ${totalRealizedGainStockB.toLocaleString('id-ID')}`);

console.log('\n=== SUMMARY STOCK A FROM SHEET ===');
console.log(`Total Margin (Stock A Cost Basis): Rp ${totalMarginStockA.toLocaleString('id-ID')}`);
console.log(`Total Capital Gain Stock A (Unrealized Market): Rp ${totalCapGainStockA.toLocaleString('id-ID')} (${(totalCapGainStockA / totalMarginStockA * 100).toFixed(2)}%)`);
console.log(`Total Realized Gain Stock A: Rp ${totalRealizedGainStockA.toLocaleString('id-ID')}`);
