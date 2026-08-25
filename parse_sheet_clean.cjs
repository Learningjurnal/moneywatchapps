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

function parseIdr(str) {
  if (!str) return 0;
  let s = str.trim();
  const isNegative = s.includes('-') || s.startsWith('(') || s.includes('▼-');
  s = s.replace(/Rp|\s|▼|▲|\+|\-|\(|\)/g, '');
  if (!s || s === '-') return 0;
  // Indonesian: . is thousands separator, , is decimal
  // e.g. 46.478.309 or 600 or 77.464 or 20.125
  s = s.replace(/\./g, '').replace(/,/g, '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : (isNegative ? -n : n);
}

console.log('=== PARSED ACTIVE HOLDINGS FROM SHEET 1 ===');
let sumEquity = 0;
let sumMarginB = 0;
let sumCapGainB = 0;
let sumRealizedB = 0;

for (let r = 5; r <= 104; r++) {
  const row = rows1[r];
  if (!row || !row[2]) continue;
  const ticker = row[2];
  const lot = parseIdr(row[15]); // Col 15: Lot Stock B
  const marketPrice = parseIdr(row[26]); // Col 26: Price
  const marketVal = lot * 100 * marketPrice;
  const marginB = parseIdr(row[14]); // Col 14: Modal Stock B
  const capGainB = parseIdr(row[18]); // Col 18: Capital Gain Stock B
  const realizedB = parseIdr(row[20]); // Col 20: Realized Gain Stock B

  if (lot > 0) {
    sumEquity += marketVal;
    sumMarginB += marginB;
    sumCapGainB += capGainB;
    console.log(`${ticker.padEnd(5)} | Lot: ${lot.toString().padStart(6)} | Price: ${marketPrice.toString().padStart(6)} | Equity: Rp ${marketVal.toLocaleString('id-ID').padStart(12)} | Margin: Rp ${marginB.toLocaleString('id-ID').padStart(12)} | CapGain: Rp ${capGainB.toLocaleString('id-ID').padStart(12)}`);
  }
  sumRealizedB += realizedB;
}

console.log('---------------------------------------------------------------------------------------------------------');
console.log(`TOTAL EQUITY (Market Value)     : Rp ${sumEquity.toLocaleString('id-ID')}`);
console.log(`TOTAL MARGIN (Modal Stock B)   : Rp ${sumMarginB.toLocaleString('id-ID')}`);
console.log(`TOTAL CAPITAL GAIN (Unrealized) : Rp ${sumCapGainB.toLocaleString('id-ID')} (${(sumCapGainB / sumMarginB * 100).toFixed(2)}%)`);
console.log(`CALCULATED (Equity - Margin)    : Rp ${(sumEquity - sumMarginB).toLocaleString('id-ID')}`);
console.log(`TOTAL REALIZED PROFIT (Stock B) : Rp ${sumRealizedB.toLocaleString('id-ID')}`);
