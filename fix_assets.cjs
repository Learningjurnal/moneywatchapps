const fs = require('fs');

let code = fs.readFileSync('js/05-assets.js', 'utf8');

const replacement = `
  if(el('hub-tot-val')) el('hub-tot-val').textContent = 'Rp ' + fmt(Math.round(totVal));
  if(el('hub-tot-cost')) el('hub-tot-cost').textContent = 'Rp ' + fmt(Math.round(totCost));
  
  if(el('hub-tot-pnl')) {
    el('hub-tot-pnl').textContent = 'Rp ' + fmt(Math.abs(Math.round(totPnl))) + ' (' + Math.abs(totPct).toFixed(2) + '%)';
    if(el('hub-tot-pnl-icon')) {
       el('hub-tot-pnl-icon').textContent = totPnl >= 0 ? '▲' : '▼';
    }
    if(el('hub-tot-pnl-pill')) {
       el('hub-tot-pnl-pill').style.color = totPnl >= 0 ? '#10B981' : '#EF4444';
       el('hub-tot-pnl-pill').style.background = totPnl >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
       el('hub-tot-pnl-pill').style.borderColor = totPnl >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
       el('hub-tot-pnl-pill').style.boxShadow = totPnl >= 0 ? '0 0 15px rgba(16, 185, 129, 0.2)' : '0 0 15px rgba(239, 68, 68, 0.2)';
    }
  }

  // Update Donut
  var donut = el('hub-donut');
  if(donut && totVal > 0) {
      var pSaham = (sahamMv / totVal) * 100;
      var pCrypto = (cryptoMv / totVal) * 100;
      var pEtf = (etfMv / totVal) * 100;
      var pRd = (rdVal / totVal) * 100;
      
      var c1 = pSaham;
      var c2 = c1 + pCrypto;
      var c3 = c2 + pEtf;
      var c4 = 100;
      
      donut.style.background = 'conic-gradient(#3B82F6 0% ' + c1 + '%, #10B981 ' + c1 + '% ' + c2 + '%, #EF4444 ' + c2 + '% ' + c3 + '%, #8B5CF6 ' + c3 + '% 100%)';
  } else if (donut) {
      donut.style.background = 'conic-gradient(#3B82F6 0% 0%)';
  }
`;

const startIdx = code.indexOf("if(el('hub-tot-val')) el('hub-tot-val').textContent = 'Rp ' + fmt(Math.round(totVal));");
const endIdx = code.indexOf("var barsEl = el('hub-alloc-bars');");

if (startIdx !== -1 && endIdx !== -1) {
    code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
    fs.writeFileSync('js/05-assets.js', code);
    console.log('Fixed js/05-assets.js');
} else {
    console.log('Could not find replace block');
}
