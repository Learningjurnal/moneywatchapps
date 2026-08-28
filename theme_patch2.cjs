const fs = require('fs');
let css = fs.readFileSync('css/main.css', 'utf8');

const extraCss = `
/* Override inline styles for dashboard category cards in light mode */
body.theme-light div[onclick^="goPage('"] {
  background: rgba(255, 255, 255, 0.8) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important;
}
body.theme-light div[onclick^="goPage('"] * {
  text-shadow: none !important;
}
body.theme-light div[onclick^="goPage('"] div {
  color: var(--text-main) !important;
}
body.theme-light div[onclick^="goPage('"] span {
  color: var(--text-muted) !important;
}
body.theme-light div[onclick^="goPage('"] span[style*="color:#60a5fa;font-weight:700"],
body.theme-light div[onclick^="goPage('"] span[style*="color:#34d399;font-weight:700"],
body.theme-light div[onclick^="goPage('"] span[style*="color:#f87171;font-weight:700"],
body.theme-light div[onclick^="goPage('"] span[style*="color:#a78bfa;font-weight:700"] {
  color: var(--accent) !important;
}
`;

css = css + '\n' + extraCss;
fs.writeFileSync('css/main.css', css);
console.log('Appended extra light theme rules');
