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

// Look at rows 0 to 10 for tickers
console.log('=== FINDING TICKERS IN SHEET 2 ===');
for (let c = 0; c < Math.min(100, rows2[0].length); c++) {
  const colVals = [];
  for (let r = 0; r < 12; r++) {
    if (rows2[r] && rows2[r][c]) colVals.push(`r${r}:${rows2[r][c]}`);
  }
  if (colVals.length > 0) {
    console.log(`Col ${c}: ${colVals.join(' | ')}`);
  }
}
