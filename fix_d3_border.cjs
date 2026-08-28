const fs = require('fs');
let js = fs.readFileSync('js/31-d3-networth.js', 'utf8');

js = js.replace(/rgba\(255,255,255,\.1\)/g, 'var(--border)');

fs.writeFileSync('js/31-d3-networth.js', js);
console.log('Fixed d3 border');
