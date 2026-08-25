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

console.log('=== COLUMN HEADERS (R0 to R4) ===');
for (let c = 0; c < 37; c++) {
  const headerPath = [];
  for (let r = 0; r <= 4; r++) {
    if (rows1[r] && rows1[r][c]) headerPath.push(`R${r}:${rows1[r][c]}`);
  }
  console.log(`Col ${c}: ${headerPath.join(' | ')}`);
}

console.log('\n=== TOTAL / SUMMARY ROW (Last 10 rows of Sheet 1) ===');
for (let r = Math.max(0, rows1.length - 10); r < rows1.length; r++) {
  console.log(`Row ${r}: ` + rows1[r].map((v, c) => `${c}:${v}`).filter(s => !s.endsWith(':') && !s.endsWith(':-')).join(' | '));
}
