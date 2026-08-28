const fs = require('fs');
let css = fs.readFileSync('css/main.css', 'utf8');

const patch = `
body.theme-light .logo {
  color: var(--text-main) !important;
}

body.theme-light .nav button:hover {
  color: var(--text-main) !important;
}
body.theme-light .nav button.on {
  color: #fff !important; /* because background is blue */
}
body.theme-light .sh-tab:hover,
body.theme-light .sh-tab.on {
  color: var(--text-main) !important;
}
body.theme-light .finput {
  color: var(--text-main) !important;
  background: #FFFFFF !important;
}
body.theme-light .finput option {
  background: #FFFFFF !important;
  color: var(--text-main) !important;
}
`;
if (!css.includes('body.theme-light .logo')) {
  css += '\n' + patch;
  fs.writeFileSync('css/main.css', css);
  console.log('Fixed more hardcoded whites');
}
