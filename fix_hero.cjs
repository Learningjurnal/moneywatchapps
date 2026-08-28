const fs = require('fs');
let content = fs.readFileSync('moneywatch.html', 'utf8');

content = content.replace(
    '        <div class="glass-panel hero-section" style="background: rgba(255, 255, 255, 0.03);backdrop-filter: blur(20px);-webkit-backdrop-filter: blur(20px);border: 1px solid rgba(255, 255, 255, 0.08);border-radius: 24px;padding: 30px;box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);display: flex;justify-content: space-between;align-items: center;margin-bottom: 30px;position: relative;overflow: hidden; flex-wrap: wrap; gap: 30px;">',
    '        <div class="glass-panel hero-section" onclick="goPage(\'performance\')" style="background: rgba(255, 255, 255, 0.03);backdrop-filter: blur(20px);-webkit-backdrop-filter: blur(20px);border: 1px solid rgba(255, 255, 255, 0.08);border-radius: 24px;padding: 30px;box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);display: flex;justify-content: space-between;align-items: center;margin-bottom: 30px;position: relative;overflow: hidden; flex-wrap: wrap; gap: 30px; cursor: pointer; transition: transform 0.3s ease, border-color 0.3s ease;" onmouseover="this.style.transform=\'translateY(-3px)\';this.style.borderColor=\'rgba(255,255,255,0.2)\'" onmouseout="this.style.transform=\'translateY(0)\';this.style.borderColor=\'rgba(255, 255, 255, 0.08)\'">'
);

fs.writeFileSync('moneywatch.html', content);
