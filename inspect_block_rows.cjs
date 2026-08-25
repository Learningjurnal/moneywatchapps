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

console.log('=== BLOCK 1: ASII (Cols 0 to 14) ===');
for (let r = 0; r < Math.min(30, rows2.length); r++) {
  const rowSlice = rows2[r].slice(0, 15);
  if (rowSlice.some(v => v !== '')) {
    console.log(`R${r.toString().padStart(2, '0')}: ` + rowSlice.map((v, c) => `[c${c}:${v}]`).filter(s => !s.endsWith(':]')).join(' '));
  }
}

console.log('\n=== BLOCK 3: GGRM (Cols 30 to 44) ===');
for (let r = 0; r < Math.min(30, rows2.length); r++) {
  const rowSlice = rows2[r].slice(30, 45);
  if (rowSlice.some(v => v !== '')) {
    console.log(`R${r.toString().padStart(2, '0')}: ` + rowSlice.map((v, c) => `[c${c+30}:${v}]`).filter(s => !s.endsWith(':]')).join(' '));
  }
}
