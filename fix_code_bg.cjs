const fs = require('fs');
let html = fs.readFileSync('moneywatch.html', 'utf8');

html = html.replace('background:rgba(255,255,255,.06);', 'background:var(--bg3);');

fs.writeFileSync('moneywatch.html', html);
console.log('Fixed code bg');
