const fs = require('fs');

function parseCSV(text) {
  const lines = text.split('\n');
  return lines.map(line => {
    const row = [];
    let inQuotes = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i+1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else {
        cell += c;
      }
    }
    row.push(cell.trim());
    return row;
  });
}

const formMos = parseCSV(fs.readFileSync('sheet_Form_Mos.csv', 'utf8'));
const finc = parseCSV(fs.readFileSync('sheet_Finc_state.csv', 'utf8'));
const stockB = parseCSV(fs.readFileSync('sheet_stock_b.csv', 'utf8'));

const indexToTicker = {};
stockB.forEach(r => {
  const idx = (r[0] || '').replace(/[^0-9]/g, '');
  const ticker = (r[2] || '').trim().toUpperCase();
  if (idx && ticker) {
    indexToTicker[idx] = ticker;
  }
});

const formMosColIdx = formMos[0].findIndex(c => c === '12');
const fincColIdx = finc[0].findIndex(c => c === '12');

console.log('BBCA (12) col in formMos:', formMosColIdx, 'in finc:', fincColIdx);

console.log('\n=== FORM MOS FOR BBCA (index 12) ===');
formMos.forEach((r, idx) => {
  const rowLabel = r[0] || '';
  const formulaDesc = r[1] || '';
  const val = r[formMosColIdx] || '';
  if (rowLabel || val) {
    console.log(`Row ${(idx+1)}: [${rowLabel}] (${formulaDesc}) => ${val}`);
  }
});

console.log('\n=== FINC STATE FOR BBCA (index 12) ===');
finc.forEach((r, idx) => {
  const sec = r[0] || '';
  const label = r[2] || '';
  const yr = r[3] || '';
  const val = r[fincColIdx] || '';
  if (label || val) {
    console.log(`Row ${(idx+1)}: [${sec}] ${label} ${yr} => ${val}`);
  }
});
