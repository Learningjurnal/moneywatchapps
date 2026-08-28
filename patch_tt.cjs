const fs = require('fs');

let engine = fs.readFileSync('js/03-engine.js', 'utf8');

const newTT = `
function customChartTooltip(context) {
    let tooltipEl = document.getElementById('mw-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'mw-tooltip';
        document.body.appendChild(tooltipEl);
    }
    
    const tooltipModel = context.tooltip;
    if (tooltipModel.opacity === 0) {
        tooltipEl.style.opacity = 0;
        tooltipEl.style.transform = 'translateY(4px)';
        tooltipEl.style.pointerEvents = 'none';
        return;
    }
    
    tooltipEl.classList.remove('above', 'below', 'no-transform');
    if (tooltipModel.yAlign) {
        tooltipEl.classList.add(tooltipModel.yAlign);
    } else {
        tooltipEl.classList.add('no-transform');
    }

    function getBody(bodyItem) {
        return bodyItem.lines;
    }

    if (tooltipModel.body) {
        const titleLines = tooltipModel.title || [];
        const bodyLines = tooltipModel.body.map(getBody);
        let innerHtml = '';

        titleLines.forEach(function(title) {
            innerHtml += '<div class="mw-tt-title">' + title + '</div>';
        });

        bodyLines.forEach(function(body, i) {
            const colors = tooltipModel.labelColors[i];
            let style = 'background:' + colors.backgroundColor + '; border-color:' + colors.borderColor + ';';
            if (!colors.backgroundColor) { style = 'background:var(--accent);'; }
            const span = '<span class="mw-tt-indicator" style="' + style + '"></span>';
            innerHtml += '<div class="mw-tt-body">' + span + body + '</div>';
        });

        tooltipEl.innerHTML = innerHtml;
    }

    const position = context.chart.canvas.getBoundingClientRect();
    let left = position.left + window.pageXOffset + tooltipModel.caretX;
    let top = position.top + window.pageYOffset + tooltipModel.caretY;
    
    // basic overflow prevention
    if (left + 250 > window.innerWidth) left = window.innerWidth - 260;
    if (top + 100 > window.innerHeight) top = top - 80;

    tooltipEl.style.opacity = 1;
    tooltipEl.style.transform = 'translateY(0)';
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
}

var TT = {
    enabled: false,
    external: customChartTooltip
};
`;

engine = engine.replace(/var TT=\{[^;]+\};/, newTT);
fs.writeFileSync('js/03-engine.js', engine);
console.log('Patched TT');
