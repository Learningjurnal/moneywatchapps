const fs = require('fs');
let css = fs.readFileSync('css/main.css', 'utf8');

const patch = `
body.theme-light .ai-widget,
body.theme-light .st-widget,
body.theme-light .ai-chat-bubble.ai-msg {
  background: var(--bg3) !important;
  border-color: var(--border2) !important;
}

body.theme-light .sh-header-action {
  background: var(--bg3) !important;
  border-color: var(--border) !important;
}
`;
if (!css.includes('body.theme-light .ai-widget')) {
  css += '\n' + patch;
  fs.writeFileSync('css/main.css', css);
  console.log('Fixed more inline rgba with spaces in css');
}
