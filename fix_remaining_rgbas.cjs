const fs = require('fs');
const glob = require('fs').readdirSync('js/');

for (const file of glob) {
    if (!file.endsWith('.js')) continue;
    let js = fs.readFileSync('js/' + file, 'utf8');
    
    // Background replacements
    js = js.replace(/background:\s*rgba\(255,255,255,\.\d+\)/g, 'background:var(--bg3)');
    js = js.replace(/background:\s*rgba\(255,255,255,0\.\d+\)/g, 'background:var(--bg3)');
    js = js.replace(/background:\s*linear-gradient\([^)]*rgba\(255,255,255[^)]*\)[^)]*\)/g, 'background:var(--bg3)');
    js = js.replace(/background:\s*linear-gradient\([^)]*\)/g, function(match) {
        if(match.includes('rgba(255,255,255')) return 'background:var(--bg3)';
        return match;
    });

    // Border replacements
    js = js.replace(/border-top:1px solid rgba\(255,255,255,\.?0*\d+\)/g, 'border-top:1px solid var(--border)');
    js = js.replace(/border-bottom:1px solid rgba\(255,255,255,\.?0*\d+\)/g, 'border-bottom:1px solid var(--border)');
    js = js.replace(/border:1px solid rgba\(255,255,255,\.?0*\d+\)/g, 'border:1px solid var(--border)');
    js = js.replace(/border-color:rgba\(255,255,255,\.?0*\d+\)/g, 'border-color:var(--border)');

    fs.writeFileSync('js/' + file, js);
}
console.log('Fixed remaining rgbas');
