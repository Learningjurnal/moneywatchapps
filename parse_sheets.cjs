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
      if (row.length > 0 && row.some(cell => cell !== '')) {
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

const s1 = fs.readFileSync('/tmp/sheet_stock_b.csv', 'utf8');
const s2 = fs.readFileSync('/tmp/sheet_tx.csv', 'utf8');

const rows1 = parseCSV(s1);
const rows2 = parseCSV(s2);

console.log('=== SHEET 1 (SUMMARY / PORTOFOLIO) ===');
console.log('Total rows:', rows1.length);
for (let i = 0; i < Math.min(15, rows1.length); i++) {
  console.log(`Row ${i}:`, JSON.stringify(rows1[i]));
}

console.log('\n=== SHEET 2 (TRANSACTIONS) ===');
console.log('Total rows:', rows2.length);
for (let i = 0; i < Math.min(15, rows2.length); i++) {
  console.log(`Row ${i}:`, JSON.stringify(rows2[i]));
}
