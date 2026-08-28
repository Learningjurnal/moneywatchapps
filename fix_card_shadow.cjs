const fs = require('fs');
let css = fs.readFileSync('css/main.css', 'utf8');

const patch = `
body.theme-light .card {
  box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important;
}
`;
if (!css.includes('body.theme-light .card {')) {
  css += '\n' + patch;
  fs.writeFileSync('css/main.css', css);
  console.log('Fixed card shadow');
}
