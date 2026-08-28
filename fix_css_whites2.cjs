const fs = require('fs');
let css = fs.readFileSync('css/main.css', 'utf8');

const patch = `
body.theme-light .mclose:hover {
  background: var(--bg3) !important;
  color: var(--red) !important;
}

body.theme-light .side-nav button:hover {
  color: var(--text-main) !important;
}
body.theme-light .side-nav button.on {
  color: var(--accent) !important; 
}
body.theme-light .side-search-input {
  color: var(--text-main) !important;
}
body.theme-light .side-collapse-btn:hover {
  color: var(--text-main) !important;
}
`;
if (!css.includes('body.theme-light .side-search-input')) {
  css += '\n' + patch;
  fs.writeFileSync('css/main.css', css);
  console.log('Fixed more hardcoded whites 2');
}
