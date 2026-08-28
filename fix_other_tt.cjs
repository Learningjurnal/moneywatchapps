const fs = require('fs');

let css = fs.readFileSync('css/main.css', 'utf8');
const extraCss = `
#d3-nw-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 10000;
  background: rgba(15, 23, 42, 0.65) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 10px !important;
  padding: 10px 14px !important;
  font-size: 11px !important;
  color: #fff !important;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3) !important;
}

body.theme-light #d3-nw-tooltip {
  background: rgba(255, 255, 255, 0.75) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  color: #0F172A !important;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1) !important;
}
`;
if (!css.includes('#d3-nw-tooltip')) {
  css += '\n' + extraCss;
  fs.writeFileSync('css/main.css', css);
}
