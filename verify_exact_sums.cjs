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
  s = s.replace(/\./g, '').replace(/,/g, '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : (isNegative ? -n : n);
}

let sumMarketValue = 0;
let sumMarginB = 0;
let sumCapGainB = 0;
let sumRealizedB = 0;

for (let r = 5; r <= 104; r++) {
  const row = rows1[r];
  if (!row || !row[2]) continue;
  const ticker = row[2];
  const shares = parseIdr(row[15]); // Col 15: Lembar Saham Stock B
  const marketPrice = parseIdr(row[26]); // Col 26: Price
  const marketVal = shares * marketPrice; // Total Market Value
  const marginB = parseIdr(row[14]); // Col 14: Modal Stock B
  const capGainB = parseIdr(row[18]); // Col 18: Capital Gain Stock B
  const realizedB = parseIdr(row[20]); // Col 20: Realized Gain Stock B

  if (shares > 0) {
    sumMarketValue += marketVal;
    sumMarginB += marginB;
    sumCapGainB += capGainB;
  }
  sumRealizedB += realizedB;
}

console.log('=== EXACT TOTALS FOR STOCK B IN SPREADSHEET ===');
console.log('Total Equity (Stock B Market Value): Rp', sumMarketValue.toLocaleString('id-ID'));
console.log('Total Margin (Stock B Modal/Cost)  : Rp', sumMarginB.toLocaleString('id-ID'));
console.log('Total Capital Gain Stock B (Market): Rp', sumCapGainB.toLocaleString('id-ID'), `(${(sumCapGainB / sumMarginB * 100).toFixed(2)}%)`);
console.log('Exact Difference (Equity - Margin) : Rp', (sumMarketValue - sumMarginB).toLocaleString('id-ID'));
console.log('Total Realized Gain Stock B        : Rp', sumRealizedB.toLocaleString('id-ID'));
