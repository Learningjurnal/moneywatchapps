const fs = require('fs');
const glob = require('fs').readdirSync('js/');

for (const file of glob) {
    if (!file.endsWith('.js')) continue;
    let js = fs.readFileSync('js/' + file, 'utf8');
    
    js = js.replace(/grid:\s*\{\s*color:\s*'rgba\(255,255,255,\.04\)'\s*\}/g, 'grid:{color:GC}');
    js = js.replace(/grid:\s*\{\s*color:\s*'rgba\(255,255,255,0\.04\)'\s*\}/g, 'grid:{color:GC}');
    js = js.replace(/grid:\s*\{\s*color:\s*'rgba\(255,255,255,\.05\)'\s*\}/g, 'grid:{color:GC}');
    js = js.replace(/grid:\s*\{\s*color:\s*'rgba\(255,255,255,0\.05\)'\s*\}/g, 'grid:{color:GC}');
    
    fs.writeFileSync('js/' + file, js);
}
console.log('Fixed grids');
