const fs = require('fs');

let cjs = fs.readFileSync('update_dash.cjs', 'utf8');
cjs = cjs.replace('color:var(--text-main);cursor:pointer;">⚡ Refresh Data', 'color:#fff;cursor:pointer;">⚡ Refresh Data');
cjs = cjs.replace('color:var(--text-main)">JD', 'color:var(--text-main)">JD');
fs.writeFileSync('update_dash.cjs', cjs);

let html = fs.readFileSync('moneywatch.html', 'utf8');
html = html.replace('color:var(--text-main);cursor:pointer;">⚡ Refresh Data', 'color:#fff;cursor:pointer;">⚡ Refresh Data');
fs.writeFileSync('moneywatch.html', html);

console.log('Fixed btn');
