const fs = require('fs');
let code = fs.readFileSync('js/04-render.js', 'utf8');

const startIdx = code.indexOf('function renderDashboard(){');
if (startIdx !== -1) {
    const nextFuncIdx = code.indexOf('function renderRdn(){', startIdx);
    if (nextFuncIdx !== -1) {
        const replacement = `function renderDashboard(){
  if(typeof renderPortfolioHub === 'function') renderPortfolioHub();
}

`;
        code = code.substring(0, startIdx) + replacement + code.substring(nextFuncIdx);
        fs.writeFileSync('js/04-render.js', code);
        console.log('Fixed renderDashboard');
    }
}
