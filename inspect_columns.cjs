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

console.log('=== SHEET 1 FIRST 40 COLUMNS OF ROWS 0..5 ===');
for (let r = 0; r < Math.min(6, rows1.length); r++) {
  console.log(`\n--- ROW ${r} ---`);
  for (let c = 0; c < Math.min(45, rows1[r].length); c++) {
    if (rows1[r][c]) {
      console.log(`  Col ${c}: "${rows1[r][c]}"`);
    }
  }
}
