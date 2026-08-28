const fs = require('fs');

const jsFiles = fs.readdirSync('js/').filter(f => f.endsWith('.js'));

for (const file of jsFiles) {
  let content = fs.readFileSync('js/' + file, 'utf8');
  let original = content;

  // Replace hardcoded dark backgrounds in inline HTML strings
  content = content.replace(/background:\s*#131B2E/g, 'background:var(--bg2)');
  content = content.replace(/background:\s*#1A233A/g, 'background:var(--bg3)');
  content = content.replace(/background:\s*#101726/g, 'background:var(--bg)');
  content = content.replace(/background:\s*#0B0F19/g, 'background:var(--bg)');
  content = content.replace(/background:\s*#0B1121/g, 'background:var(--bg)');
  content = content.replace(/background:\s*#0E1422/g, 'background:var(--bg3)');
  content = content.replace(/border(-[a-z]+)?:\s*1px\s+solid\s+#232F4D/g, 'border$1:1px solid var(--border)');
  content = content.replace(/border(-[a-z]+)?:\s*1px\s+solid\s+#2E3E66/g, 'border$1:1px solid var(--border)');
  content = content.replace(/color:\s*#F1F5F9/g, 'color:var(--text)');
  content = content.replace(/color:\s*#CBD5E1/g, 'color:var(--text2)');
  content = content.replace(/color:\s*#94A3B8/g, 'color:var(--text3)');

  if (content !== original) {
    fs.writeFileSync('js/' + file, content);
    console.log('Patched colors in js/' + file);
  }
}
