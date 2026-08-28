const fs = require('fs');

let html = fs.readFileSync('moneywatch.html', 'utf8');

// Replace dark hardcoded colors in HTML inline styles with CSS variables
html = html.replace(/background:#131B2E/g, 'background:var(--bg2)');
html = html.replace(/background:#101726/g, 'background:var(--bg)');
html = html.replace(/background:#0B1121/g, 'background:var(--bg)');
html = html.replace(/background:#0B0F19/g, 'background:var(--bg)');
html = html.replace(/background:#0E1422/g, 'background:var(--bg3)');
html = html.replace(/border:1px solid #232F4D/g, 'border:1px solid var(--border)');
html = html.replace(/border:1px solid #2E3E66/g, 'border:1px solid var(--border)');
html = html.replace(/border-bottom:1px solid #232F4D/g, 'border-bottom:1px solid var(--border)');
html = html.replace(/border-right:1px solid #232F4D/g, 'border-right:1px solid var(--border)');

// Update donut inner background so it adapts
html = html.replace(/background:\s*#0B1121/g, 'background:var(--bg2)');

fs.writeFileSync('moneywatch.html', html);
console.log('Patched moneywatch.html inline styles');
