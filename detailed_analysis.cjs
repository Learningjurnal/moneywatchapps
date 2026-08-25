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

console.log('=== SHEET 1 HEADERS (Rows 0 to 8) ===');
for (let i = 0; i < Math.min(10, rows1.length); i++) {
  console.log(`R${i}: ` + rows1[i].map((val, idx) => `[Col ${idx}]: ${val}`).filter(s => !s.endsWith(': ')).join(' | '));
}

console.log('\n=== SHEET 1 SUMMARY / TOTAL ROWS ===');
for (let i = 0; i < rows1.length; i++) {
  const rStr = rows1[i].join(' ');
  if (rStr.includes('Total') || rStr.includes('Equity') || rStr.includes('Margin') || rStr.includes('Capital Gain') || rStr.includes('Stock  B') || rStr.includes('Stock B')) {
    console.log(`R${i}: ` + rows1[i].map((val, idx) => `[C${idx}]: ${val}`).filter(s => !s.endsWith(': ')).join(' | '));
  }
}

console.log('\n=== SHEET 2 HEADERS (Rows 0 to 8) ===');
for (let i = 0; i < Math.min(10, rows2.length); i++) {
  console.log(`R${i}: ` + rows2[i].map((val, idx) => `[Col ${idx}]: ${val}`).filter(s => !s.endsWith(': ')).join(' | '));
}
