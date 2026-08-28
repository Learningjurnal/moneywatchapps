const fs = require('fs');

let css = fs.readFileSync('css/main.css', 'utf8');

const lightThemeCss = `
/* ================= LIGHT THEME ================= */
body.theme-light {
  --bg-main: #F8FAFC;
  --bg-card: #FFFFFF;
  --bg: #F1F5F9;
  --bg2: #FFFFFF;
  --bg3: #E2E8F0;
  --bg4: #CBD5E1;
  --bg5: #94A3B8;
  
  --text-main: #0F172A;
  --text: #0F172A;
  --text2: #334155;
  --text3: #64748B;
  --text-muted: #64748B;
  
  --border: #CBD5E1;
  --border2: #94A3B8;
  
  --bg-darker: #E2E8F0;
  --bg-surface: #F8FAFC;
  --bg-elevated: #FFFFFF;
  
  --border-subtle: rgba(0, 0, 0, 0.1);
  --border-focus: #2563EB;
}

body.theme-light .glass-panel,
body.theme-light .asset-card {
  background: rgba(255, 255, 255, 0.75) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 4px 15px rgba(0,0,0,0.05) !important;
}

body.theme-light .glass-panel *,
body.theme-light .asset-card * {
  text-shadow: none !important;
}

body.theme-light .hero-balance p { color: var(--text-muted) !important; }
body.theme-light .hero-balance h2 { color: var(--text-main) !important; }
body.theme-light .card-title { color: var(--text-main) !important; }
body.theme-light .card-amount { color: var(--text-main) !important; }

body.theme-light .badge-trend {
  background: rgba(5, 150, 105, 0.1) !important;
  color: var(--green) !important;
  border-color: rgba(5, 150, 105, 0.3) !important;
  box-shadow: none !important;
}

body.theme-light .legend-item { color: var(--text-main) !important; }
body.theme-light .legend { background: rgba(255, 255, 255, 0.5) !important; border-color: rgba(0,0,0,0.1) !important; }

body.theme-light .asset-card span[style*="color:rgba(255,255,255,0.5)"],
body.theme-light .asset-card span[style*="color:rgba(255,255,255,0.6)"],
body.theme-light .asset-card div[style*="color:rgba(255,255,255,0.5)"],
body.theme-light .asset-card div[style*="color:rgba(255,255,255,0.6)"] {
  color: var(--text-muted) !important;
}

body.theme-light .sidebar,
body.theme-light .side-nav {
  background: #FFFFFF !important;
  border-right: 1px solid var(--border) !important;
}
body.theme-light .side-label { color: var(--text-main) !important; }
body.theme-light .side-nav button:hover { background: #F1F5F9 !important; }
body.theme-light .side-nav button.on { background: #E2E8F0 !important; }

body.theme-light .cheader {
  background: #F8FAFC !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--text-main) !important;
}

body.theme-light .tbl th {
  background: #F1F5F9 !important;
  color: var(--text-main) !important;
}
body.theme-light .tbl td {
  border-bottom: 1px solid var(--border) !important;
}

body.theme-light .btn-bb { background: #E2E8F0; color: #0F172A; border: 1px solid #CBD5E1; }
body.theme-light .btn-bb:hover { background: #CBD5E1; }

body.theme-light input, 
body.theme-light select, 
body.theme-light textarea {
  background: #FFFFFF !important;
  border: 1px solid var(--border) !important;
  color: var(--text-main) !important;
}
`;

if (!css.includes('body.theme-light')) {
    css = css + '\n' + lightThemeCss;
    fs.writeFileSync('css/main.css', css);
    console.log('Added light theme to css/main.css');
} else {
    console.log('Light theme already exists');
}
