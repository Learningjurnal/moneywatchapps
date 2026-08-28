const fs = require('fs');

let engine = fs.readFileSync('js/03-engine.js', 'utf8');

engine = engine.replace(
    'const colors = tooltipModel.labelColors[i];',
    'const colors = (tooltipModel.labelColors && tooltipModel.labelColors[i]) ? tooltipModel.labelColors[i] : {backgroundColor: "var(--accent)", borderColor: "var(--accent)"};'
);

fs.writeFileSync('js/03-engine.js', engine);
