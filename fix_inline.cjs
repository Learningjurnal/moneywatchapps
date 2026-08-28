const fs = require('fs');

let cjs = fs.readFileSync('update_dash.cjs', 'utf8');
cjs = cjs.replace(/color: #ffffff/g, 'color: var(--text-main)');
cjs = cjs.replace(/color:#ffffff/g, 'color:var(--text-main)');
cjs = cjs.replace(/color:rgba\(255,255,255,0.5\)/g, 'color:var(--text-muted)');
cjs = cjs.replace(/color:rgba\(255,255,255,0.6\)/g, 'color:var(--text-muted)');
cjs = cjs.replace(/color: rgba\(255, 255, 255, 0.5\)/g, 'color:var(--text-muted)');
cjs = cjs.replace(/color: rgba\(255, 255, 255, 0.6\)/g, 'color:var(--text-muted)');
cjs = cjs.replace(/border-top:1px solid rgba\(255,255,255,0.08\)/g, 'border-top:1px solid var(--border)');
cjs = cjs.replace(/background:rgba\(255,255,255,0.05\)/g, 'background:var(--bg3)');
cjs = cjs.replace(/background: rgba\(255, 255, 255, 0.03\)/g, 'background:var(--bg-elevated)');
cjs = cjs.replace(/border: 1px solid rgba\(255, 255, 255, 0.08\)/g, 'border: 1px solid var(--border)');

// Re-add the goPage('performance') to hero section
cjs = cjs.replace(
    '<div class="glass-panel hero-section" style="background: var(--bg-elevated);backdrop-filter: blur(20px);-webkit-backdrop-filter: blur(20px);border: 1px solid var(--border);border-radius: 24px;padding: 30px;box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);display: flex;justify-content: space-between;align-items: center;margin-bottom: 30px;position: relative;overflow: hidden; flex-wrap: wrap; gap: 30px;">',
    '<div class="glass-panel hero-section" onclick="goPage(\'performance\')" style="background: var(--bg-elevated);backdrop-filter: blur(20px);-webkit-backdrop-filter: blur(20px);border: 1px solid var(--border);border-radius: 24px;padding: 30px;box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);display: flex;justify-content: space-between;align-items: center;margin-bottom: 30px;position: relative;overflow: hidden; flex-wrap: wrap; gap: 30px; cursor: pointer; transition: transform 0.3s ease, border-color 0.3s ease;" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'var(--border-focus)\'" onmouseout="this.style.transform=\'translateY(0)\';this.style.borderColor=\'var(--border)\'">'
);

fs.writeFileSync('update_dash.cjs', cjs);
console.log('Fixed inline colors in update_dash.cjs');
