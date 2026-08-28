const fs = require('fs');
const path = require('path');

let css = fs.readFileSync('css/main.css', 'utf8');
const tooltipCss = `
/* Custom Glassmorphism Tooltip */
#mw-tooltip {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
  z-index: 10000;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 11px;
  color: #fff;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  max-width: 250px;
  line-height: 1.4;
  transition: opacity 0.2s ease, transform 0.2s ease;
  opacity: 0;
  transform: translateY(4px);
  left: 0;
  top: 0;
}

body.theme-light #mw-tooltip {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #0F172A;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.mw-tt-title {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 2px;
}
.mw-tt-body {
  font-family: var(--font-mono);
  font-weight: 500;
}
.mw-tt-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
`;
if (!css.includes('#mw-tooltip')) {
  css += '\n' + tooltipCss;
  fs.writeFileSync('css/main.css', css);
  console.log('Added tooltip css');
}
