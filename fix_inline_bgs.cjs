const fs = require('fs');
const glob = require('fs').readdirSync('js/');

for (const file of glob) {
    if (!file.endsWith('.js')) continue;
    let js = fs.readFileSync('js/' + file, 'utf8');
    
    // Background replacements
    js = js.replace(/background:\s*rgba\(255,255,255,0\.02\)/g, 'background:var(--bg3)');
    js = js.replace(/background:\s*rgba\(255,255,255,\.02\)/g, 'background:var(--bg3)');
    js = js.replace(/background:\s*rgba\(255,255,255,0\.03\)/g, 'background:var(--bg3)');
    js = js.replace(/background:\s*rgba\(255,255,255,\.03\)/g, 'background:var(--bg3)');
    js = js.replace(/background:\s*rgba\(255,255,255,0\.05\)/g, 'background:var(--bg4)');
    js = js.replace(/background:\s*rgba\(255,255,255,\.05\)/g, 'background:var(--bg4)');
    js = js.replace(/background:\s*rgba\(255,255,255,0\.06\)/g, 'background:var(--bg4)');
    js = js.replace(/background:\s*rgba\(255,255,255,\.06\)/g, 'background:var(--bg4)');
    js = js.replace(/background:\s*rgba\(255,255,255,0\.07\)/g, 'background:var(--bg4)');
    js = js.replace(/background:\s*rgba\(255,255,255,\.07\)/g, 'background:var(--bg4)');
    js = js.replace(/background:\s*rgba\(255,255,255,0\.08\)/g, 'background:var(--bg5)');
    js = js.replace(/background:\s*rgba\(255,255,255,\.08\)/g, 'background:var(--bg5)');

    // Border replacements
    js = js.replace(/border-bottom:1px solid rgba\(255,255,255,0\.03\)/g, 'border-bottom:1px solid var(--border)');
    js = js.replace(/border-bottom:1px solid rgba\(255,255,255,\.03\)/g, 'border-bottom:1px solid var(--border)');
    js = js.replace(/border-bottom:1px solid rgba\(255,255,255,0\.05\)/g, 'border-bottom:1px solid var(--border)');
    js = js.replace(/border-bottom:1px solid rgba\(255,255,255,\.05\)/g, 'border-bottom:1px solid var(--border)');
    js = js.replace(/border-color:rgba\(255,255,255,\.06\)/g, 'border-color:var(--border)');

    fs.writeFileSync('js/' + file, js);
}
console.log('Fixed inline bgs');
