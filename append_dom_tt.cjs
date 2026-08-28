const fs = require('fs');
let engine = fs.readFileSync('js/03-engine.js', 'utf8');

const domTtScript = `
// DOM tooltips for metrics and icons
document.addEventListener('mouseover', function(e) {
  let target = e.target.closest('[title], [data-tooltip]');
  if (!target) return;
  if (target.tagName.toLowerCase() === 'canvas') return;

  if (target.hasAttribute('title')) {
    target.setAttribute('data-tooltip', target.getAttribute('title'));
    target.removeAttribute('title');
  }
  
  let text = target.getAttribute('data-tooltip');
  if (!text) return;

  let tooltipEl = document.getElementById('mw-tooltip');
  if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'mw-tooltip';
      document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = '<div class="mw-tt-body">' + text.replace(/\\n/g, '<br>') + '</div>';
  
  const rect = target.getBoundingClientRect();
  let left = rect.left + window.pageXOffset + (rect.width / 2);
  let top = rect.bottom + window.pageYOffset + 8;

  tooltipEl.style.display = 'flex';
  tooltipEl.style.pointerEvents = 'none';
  
  // Measure after content is set
  let ttRect = tooltipEl.getBoundingClientRect();
  left = left - (ttRect.width / 2);
  
  if (left < 10) left = 10;
  if (left + ttRect.width > window.innerWidth) left = window.innerWidth - ttRect.width - 10;
  
  if (top + ttRect.height > window.innerHeight + window.pageYOffset) {
     top = rect.top + window.pageYOffset - ttRect.height - 8;
  }
  
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
  tooltipEl.style.opacity = 1;
  tooltipEl.style.transform = 'translateY(0)';
  
  target.addEventListener('mouseleave', function onLeave() {
     tooltipEl.style.opacity = 0;
     tooltipEl.style.transform = 'translateY(4px)';
     target.removeEventListener('mouseleave', onLeave);
  });
});
`;

engine += '\n' + domTtScript;
fs.writeFileSync('js/03-engine.js', engine);
console.log('Appended DOM tooltip logic');
