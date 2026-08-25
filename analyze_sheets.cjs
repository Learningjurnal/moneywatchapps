const https = require('https');
const fs = require('fs');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching sheet 1 (Portofolio/Stock B)...');
  const sheet1 = await fetchUrl('https://docs.google.com/spreadsheets/d/1AN1tDkwIdWlf89UV9ZvI73kx_uSyGQ4jqjjr0oppRR4/gviz/tq?tqx=out:csv&gid=560785253');
  fs.writeFileSync('sheet1.csv', sheet1);
  console.log('Sheet 1 saved, length:', sheet1.length);

  console.log('Fetching sheet 2 (Rincian Transaksi)...');
  const sheet2 = await fetchUrl('https://docs.google.com/spreadsheets/d/1AN1tDkwIdWlf89UV9ZvI73kx_uSyGQ4jqjjr0oppRR4/gviz/tq?tqx=out:csv&gid=262781744');
  fs.writeFileSync('sheet2.csv', sheet2);
  console.log('Sheet 2 saved, length:', sheet2.length);

  // Print first 5 lines of each
  console.log('\n--- SHEET 1 HEADER & SAMPLE ---');
  console.log(sheet1.split('\n').slice(0, 10).join('\n'));

  console.log('\n--- SHEET 2 HEADER & SAMPLE ---');
  console.log(sheet2.split('\n').slice(0, 10).join('\n'));
}

main().catch(console.error);
