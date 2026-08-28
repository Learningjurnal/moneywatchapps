const fs = require('fs');
let css = fs.readFileSync('css/main.css', 'utf8');

const patch = `
body.theme-light .sm-brand {
  color: var(--text-main) !important;
  border-bottom-color: var(--border) !important;
}
body.theme-light .sm-nav-item {
  color: var(--text-muted) !important;
}
body.theme-light .sm-nav-item:hover {
  background: var(--bg3) !important;
  color: var(--text-main) !important;
}
body.theme-light .sm-nav-item.active {
  background: var(--accent) !important;
  color: #fff !important;
}
body.theme-light .sm-nav-item.active-tech {
  background: var(--purple) !important;
  color: #fff !important;
}
body.theme-light .sm-top-bar {
  background: var(--bg-card) !important;
  border-bottom: 1px solid var(--border) !important;
}
body.theme-light .sm-content {
  background: var(--bg-main) !important;
}
`;
if (!css.includes('body.theme-light .sm-brand')) {
  css += '\n' + patch;
  fs.writeFileSync('css/main.css', css);
  console.log('Fixed sm components light theme');
}
