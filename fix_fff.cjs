const fs = require('fs');

let cjs = fs.readFileSync('update_dash.cjs', 'utf8');
cjs = cjs.replace(/color:#fff/g, 'color:var(--text-main)');
fs.writeFileSync('update_dash.cjs', cjs);

let html = fs.readFileSync('moneywatch.html', 'utf8');
html = html.replace(/color:#fff;/g, 'color:var(--text-main);');
html = html.replace(/color:#fff"/g, 'color:var(--text-main)"');
fs.writeFileSync('moneywatch.html', html);

console.log('Fixed #fff');
