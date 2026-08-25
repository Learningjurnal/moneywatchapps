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

const rows2 = parseCSV(fs.readFileSync('/tmp/sheet_tx.csv', 'utf8'));

console.log('=== SHEET 2 TOTAL ROWS & COLUMNS ===');
console.log('Rows:', rows2.length, 'Max cols:', Math.max(...rows2.map(r => r.length)));

for (let r = 0; r < Math.min(10, rows2.length); r++) {
  console.log(`\n--- ROW ${r} ---`);
  for (let c = 0; c < rows2[r].length; c++) {
    if (rows2[r][c]) {
      console.log(`  Col ${c}: "${rows2[r][c]}"`);
    }
  }
}
