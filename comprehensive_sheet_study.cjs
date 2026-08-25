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

console.log('=== ROW 1 to 4 DETAILS IN SHEET 1 ===');
for (let r = 0; r <= 4; r++) {
  console.log(`R${r}: ` + rows1[r].map((v, c) => v ? `[C${c}: ${v}]` : '').filter(Boolean).join(' | '));
}

console.log('\n=== SHEET 1 ROW SAMPLES (GGRM, BBNI, BBCA, BMRI) ===');
for (let r = 5; r < rows1.length; r++) {
  const code = rows1[r][2];
  if (['GGRM', 'BBNI', 'BBCA', 'BMRI', 'ASII', 'CPRI'].includes(code)) {
    console.log(`\nTicker: ${code} (Row ${r}):`);
    for (let c = 0; c < 37; c++) {
      if (rows1[r][c] && rows1[r][c] !== '-' && rows1[r][c] !== 'Rp -') {
        console.log(`  Col ${c} (${rows1[0][c] || ''} | ${rows1[1][c] || ''} | ${rows1[2][c] || ''} | ${rows1[3][c] || ''}): ${rows1[r][c]}`);
      }
    }
  }
}
