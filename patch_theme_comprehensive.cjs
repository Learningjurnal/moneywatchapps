const fs = require('fs');

let css = fs.readFileSync('css/main.css', 'utf8');

// Ensure theme-light has exhaustive, complete styling for all elements
const comprehensiveThemeLight = `
/* ══════════════════════════════════════════════════════════════
   COMPREHENSIVE LIGHT THEME ENGINE (MoneyWatch Pro V6)
   ══════════════════════════════════════════════════════════════ */
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
  
  --bg-darker: #F1F5F9;
  --bg-surface: #FFFFFF;
  --bg-elevated: #F8FAFC;
  
  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-focus: #2563EB;
  --accent: #2563EB;
  --accent2: #1D4ED8;
  --accent-blue: #2563EB;
  
  background: #F1F5F9 !important;
  color: #0F172A !important;
}

/* Base Body & App Container */
body.theme-light .app {
  background: #F1F5F9 !important;
  color: #0F172A !important;
}

body.theme-light .main-row {
  background: #F1F5F9 !important;
}

body.theme-light .page {
  background: #F1F5F9 !important;
  color: #0F172A !important;
}

/* TOPBAR & TICKER TAPE */
body.theme-light .topbar {
  background: #FFFFFF !important;
  border-bottom: 1px solid #E2E8F0 !important;
  color: #0F172A !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
}

body.theme-light .topbar .logo {
  color: #0F172A !important;
}

body.theme-light .ihsg-bar {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light .ibar-val {
  color: #0F172A !important;
}

body.theme-light .rdn-bar {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light .rdn-label {
  color: #64748B !important;
}

body.theme-light .rdn-val {
  color: #0F172A !important;
}

body.theme-light #btn-settings-hub {
  background: #EFF6FF !important;
  border-color: #BFDBFE !important;
  color: #1D4ED8 !important;
}

body.theme-light #session-info {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
  color: #334155 !important;
}

body.theme-light #session-user {
  color: #0F172A !important;
}

body.theme-light #clock {
  color: #64748B !important;
}

body.theme-light .ticker-wrap {
  background: #F8FAFC !important;
  border-bottom: 1px solid #E2E8F0 !important;
}

body.theme-light .ticker-wrap::before {
  background: linear-gradient(90deg, #F8FAFC, transparent) !important;
}

body.theme-light .ticker-wrap::after {
  background: linear-gradient(270deg, #F8FAFC, transparent) !important;
}

body.theme-light .tick-item {
  border-right: 1px solid #E2E8F0 !important;
}

body.theme-light .tick-sym {
  color: #0F172A !important;
}

body.theme-light .tick-val {
  color: #334155 !important;
}

/* SIDEBAR & NAVIGATION */
body.theme-light .sidebar,
body.theme-light .side-nav {
  background: #FFFFFF !important;
  border-right: 1px solid #E2E8F0 !important;
}

body.theme-light .side-nav button {
  color: #475569 !important;
}

body.theme-light .side-nav button:hover {
  background: #F1F5F9 !important;
  color: #0F172A !important;
}

body.theme-light .side-nav button.on {
  background: #EFF6FF !important;
  color: #2563EB !important;
  font-weight: 700 !important;
}

body.theme-light .side-label {
  color: #334155 !important;
}

body.theme-light .side-search-input {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light .side-cat-head {
  color: #64748B !important;
}

/* HERO CARD & DONUT CHART */
body.theme-light .hero-balance p { color: #64748B !important; }
body.theme-light .hero-balance h2 { color: #0F172A !important; }
body.theme-light .card-title { color: #0F172A !important; }
body.theme-light .card-amount { color: #0F172A !important; }

body.theme-light .donut-inner,
body.theme-light #hub-donut .donut-inner {
  background: #FFFFFF !important;
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.06) !important;
}

body.theme-light .donut-chart,
body.theme-light #hub-donut {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06) !important;
}

body.theme-light .legend {
  background: #F8FAFC !important;
  border: 1px solid #E2E8F0 !important;
}

body.theme-light .legend-item {
  color: #0F172A !important;
}

/* CARDS & PANELS */
body.theme-light .card,
body.theme-light .metric,
body.theme-light .kpi-exec-card,
body.theme-light .glass-panel,
body.theme-light .asset-card {
  background: #FFFFFF !important;
  border: 1px solid #E2E8F0 !important;
  color: #0F172A !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
}

body.theme-light .card *,
body.theme-light .metric *,
body.theme-light .glass-panel * {
  text-shadow: none !important;
}

body.theme-light .ctitle,
body.theme-light .card-title {
  color: #0F172A !important;
}

body.theme-light .cheader {
  background: #F8FAFC !important;
  border-bottom: 1px solid #E2E8F0 !important;
  color: #0F172A !important;
}

body.theme-light .mlabel {
  color: #64748B !important;
}

body.theme-light .mval {
  color: #0F172A !important;
}

body.theme-light .msub {
  color: #64748B !important;
}

body.theme-light .ptitle {
  color: #0F172A !important;
}

body.theme-light .psub {
  color: #64748B !important;
}

/* ALL BUTTONS - COMPREHENSIVE CONTRAST & VISIBILITY */
body.theme-light .btn {
  background: #FFFFFF !important;
  color: #0F172A !important;
  border: 1px solid #CBD5E1 !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
}

body.theme-light .btn:hover {
  background: #F1F5F9 !important;
  color: #0F172A !important;
  border-color: #94A3B8 !important;
}

body.theme-light .btn-outline {
  background: #FFFFFF !important;
  color: #0F172A !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .btn-outline:hover {
  background: #F1F5F9 !important;
  border-color: #94A3B8 !important;
}

body.theme-light .btn-primary,
body.theme-light .btn-blue {
  background: #2563EB !important;
  color: #FFFFFF !important;
  border: 1px solid #2563EB !important;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2) !important;
}

body.theme-light .btn-primary:hover,
body.theme-light .btn-blue:hover {
  background: #1D4ED8 !important;
  color: #FFFFFF !important;
  border-color: #1D4ED8 !important;
}

body.theme-light .btn-ghost {
  background: transparent !important;
  color: #334155 !important;
  border: 1px solid #CBD5E1 !important;
  box-shadow: none !important;
}

body.theme-light .btn-ghost:hover {
  background: #F1F5F9 !important;
  color: #0F172A !important;
}

body.theme-light .btn-secondary {
  background: #F1F5F9 !important;
  color: #0F172A !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .btn-secondary:hover {
  background: #E2E8F0 !important;
}

body.theme-light .btn-bb {
  background: #EFF6FF !important;
  color: #2563EB !important;
  border: 1px solid #BFDBFE !important;
}

body.theme-light .btn-bb:hover {
  background: #DBEAFE !important;
}

body.theme-light .btn-green {
  background: #DCFCE7 !important;
  color: #15803D !important;
  border: 1px solid #86EFAC !important;
}

body.theme-light .btn-green:hover {
  background: #BBF7D0 !important;
}

body.theme-light .btn-red {
  background: #FEE2E2 !important;
  color: #B91C1C !important;
  border: 1px solid #FCA5A5 !important;
}

body.theme-light .btn-red:hover {
  background: #FECACA !important;
}

body.theme-light .btn-amber {
  background: #FEF3C7 !important;
  color: #B45309 !important;
  border: 1px solid #FCD34D !important;
}

body.theme-light .btn-amber:hover {
  background: #FDE68A !important;
}

body.theme-light .btn-purple {
  background: #F3E8FF !important;
  color: #7E22CE !important;
  border: 1px solid #D8B4FE !important;
}

body.theme-light .btn-purple:hover {
  background: #E9D5FF !important;
}

body.theme-light .pbtn {
  background: #F1F5F9 !important;
  color: #0F172A !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .pbtn.on {
  background: #2563EB !important;
  color: #FFFFFF !important;
  border-color: #2563EB !important;
}

/* FORMS, INPUTS, SELECTS */
body.theme-light input,
body.theme-light select,
body.theme-light textarea,
body.theme-light .fin,
body.theme-light .finput {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light input:focus,
body.theme-light select:focus,
body.theme-light textarea:focus,
body.theme-light .fin:focus,
body.theme-light .finput:focus {
  border-color: #2563EB !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
}

body.theme-light input::placeholder,
body.theme-light textarea::placeholder,
body.theme-light .fin::placeholder,
body.theme-light .finput::placeholder {
  color: #94A3B8 !important;
}

body.theme-light select option {
  background: #FFFFFF !important;
  color: #0F172A !important;
}

body.theme-light .flabel {
  color: #334155 !important;
}

body.theme-light .fhint {
  color: #64748B !important;
}

/* TABLES & LISTS */
body.theme-light .table,
body.theme-light .tbl,
body.theme-light table {
  color: #0F172A !important;
}

body.theme-light .table th,
body.theme-light .tbl th,
body.theme-light table th {
  background: #F1F5F9 !important;
  color: #0F172A !important;
  border-bottom: 1px solid #CBD5E1 !important;
}

body.theme-light .table td,
body.theme-light .tbl td,
body.theme-light table td {
  border-bottom: 1px solid #E2E8F0 !important;
  color: #0F172A !important;
}

body.theme-light .table tbody tr:hover,
body.theme-light .tbl tbody tr:hover {
  background: #F8FAFC !important;
}

body.theme-light .table-wrap,
body.theme-light .table-responsive {
  background: #FFFFFF !important;
  border: 1px solid #E2E8F0 !important;
  border-radius: 8px;
}

/* AI COPILOT & CHAT */
body.theme-light .copilot-container {
  background: #FFFFFF !important;
  border: 1px solid #E2E8F0 !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05) !important;
}

body.theme-light .copilot-history {
  background: #F8FAFC !important;
}

body.theme-light .copilot-bubble {
  color: #0F172A !important;
}

body.theme-light .bubble-assistant {
  background: #FFFFFF !important;
  border: 1px solid #E2E8F0 !important;
  color: #0F172A !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
}

body.theme-light .bubble-assistant .cb-role {
  color: #2563EB !important;
  font-weight: 700 !important;
}

body.theme-light .bubble-assistant table {
  color: #0F172A !important;
}

body.theme-light .bubble-assistant th {
  background: #F1F5F9 !important;
  color: #0F172A !important;
  border-bottom: 1px solid #CBD5E1 !important;
}

body.theme-light .bubble-assistant td {
  border-bottom: 1px solid #E2E8F0 !important;
  color: #0F172A !important;
}

body.theme-light .bubble-assistant strong,
body.theme-light .bubble-assistant b {
  color: #0F172A !important;
}

body.theme-light .bubble-assistant code {
  background: #E2E8F0 !important;
  color: #0F172A !important;
  border-radius: 4px;
  padding: 2px 5px;
}

body.theme-light .bubble-user {
  background: #2563EB !important;
  color: #FFFFFF !important;
}

body.theme-light .copilot-chips-wrap {
  background: #FFFFFF !important;
  border-top: 1px solid #E2E8F0 !important;
}

body.theme-light .copilot-input-bar {
  background: #FFFFFF !important;
  border-top: 1px solid #E2E8F0 !important;
}

/* STOCKMASTER PRO & TECHNICAL PRO */
body.theme-light .sm-container {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05) !important;
}

body.theme-light .sm-aside {
  background: #F8FAFC !important;
  border-right: 1px solid #CBD5E1 !important;
}

body.theme-light .sm-brand {
  color: #0F172A !important;
  border-bottom: 1px solid #E2E8F0 !important;
}

body.theme-light .sm-nav-cat {
  color: #64748B !important;
}

body.theme-light .sm-nav-item {
  color: #334155 !important;
}

body.theme-light .sm-nav-item:hover {
  background: #E2E8F0 !important;
  color: #0F172A !important;
}

body.theme-light .sm-nav-item.active {
  background: #2563EB !important;
  color: #FFFFFF !important;
}

body.theme-light .sm-nav-item.active-tech {
  background: #7C3AED !important;
  color: #FFFFFF !important;
}

body.theme-light .sm-main {
  background: #FFFFFF !important;
}

body.theme-light .sm-top-bar {
  background: #F8FAFC !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .sm-input-group label {
  color: #64748B !important;
}

body.theme-light .sm-input {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light .sm-chip {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
  color: #334155 !important;
}

body.theme-light .sm-chip:hover {
  background: #EFF6FF !important;
  color: #2563EB !important;
  border-color: #2563EB !important;
}

body.theme-light .sm-card {
  background: #F8FAFC !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light .sm-card-fill {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .sm-stat-box {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .sm-stat-label {
  color: #64748B !important;
}

body.theme-light .sm-stat-val {
  color: #0F172A !important;
}

body.theme-light .sm-table th {
  background: #F1F5F9 !important;
  color: #0F172A !important;
  border-bottom: 1px solid #CBD5E1 !important;
}

body.theme-light .sm-table td {
  border-bottom: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light .sm-check-item {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light #sm-tv-chart-container > div:first-child {
  background: #F8FAFC !important;
  border-bottom: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light #sm-tv-chart-container > div:last-child {
  background: #FFFFFF !important;
}

body.theme-light #sm-tv-gauge-container {
  background: #FFFFFF !important;
}

/* SETTINGS HUB & MODALS */
body.theme-light #settings-hub-modal > div {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light #settings-hub-modal > div > div:first-child {
  background: #F8FAFC !important;
  border-bottom: 1px solid #CBD5E1 !important;
}

body.theme-light #sh-tabs {
  background: #F8FAFC !important;
  border-right: 1px solid #CBD5E1 !important;
}

body.theme-light #sh-content {
  background: #FFFFFF !important;
}

body.theme-light .modal {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

body.theme-light .mhead {
  background: #F8FAFC !important;
  border-bottom: 1px solid #CBD5E1 !important;
}

body.theme-light .mtitle {
  color: #0F172A !important;
}

body.theme-light .mbody {
  background: #FFFFFF !important;
}

body.theme-light .mfoot {
  background: #F8FAFC !important;
  border-top: 1px solid #CBD5E1 !important;
}

body.theme-light .modal-box {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  color: #0F172A !important;
}

/* COMMAND PALETTE */
body.theme-light #cmd-palette-overlay {
  background: rgba(15, 23, 42, 0.45) !important;
}

body.theme-light .cmd-palette-container {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.15) !important;
  color: #0F172A !important;
}

body.theme-light .cmd-search-header {
  background: #F8FAFC !important;
  border-bottom: 1px solid #CBD5E1 !important;
}

body.theme-light .cmd-search-input {
  color: #0F172A !important;
}

body.theme-light .cmd-search-input::placeholder {
  color: #94A3B8 !important;
}

body.theme-light .cmd-kbd-badge {
  background: #E2E8F0 !important;
  border: 1px solid #CBD5E1 !important;
  color: #334155 !important;
}

body.theme-light .cmd-item:hover,
body.theme-light .cmd-item.active {
  background: #EFF6FF !important;
}

body.theme-light .cmd-item-icon {
  background: #F1F5F9 !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .cmd-item-title {
  color: #0F172A !important;
}

body.theme-light .cmd-item-sub {
  color: #64748B !important;
}

body.theme-light .cmd-footer {
  background: #F8FAFC !important;
  border-top: 1px solid #CBD5E1 !important;
  color: #64748B !important;
}

/* WEALTH & INSIGHTS */
body.theme-light .w-insight {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
}

body.theme-light .w-mini {
  border-bottom: 1px solid #E2E8F0 !important;
}

body.theme-light .w-bank-card {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
}

/* BADGES */
body.theme-light .badge {
  font-weight: 700 !important;
}

body.theme-light .b-up {
  background: #DCFCE7 !important;
  color: #15803D !important;
  border: 1px solid #86EFAC !important;
}

body.theme-light .b-dn {
  background: #FEE2E2 !important;
  color: #B91C1C !important;
  border: 1px solid #FCA5A5 !important;
}

body.theme-light .b-amb {
  background: #FEF3C7 !important;
  color: #B45309 !important;
  border: 1px solid #FCD34D !important;
}

body.theme-light .b-neu {
  background: #F1F5F9 !important;
  color: #334155 !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .b-accent {
  background: #EFF6FF !important;
  color: #2563EB !important;
  border: 1px solid #BFDBFE !important;
}

/* HARGA WAJAR & METRIC CARDS */
body.theme-light .hw-card,
body.theme-light .hw-panel {
  background: #FFFFFF !important;
  border: 1px solid #CBD5E1 !important;
}

body.theme-light .hw-metric-box {
  background: #F8FAFC !important;
  border: 1px solid #CBD5E1 !important;
}
`;

// Replace or append comprehensive theme light rules
const lightIdx = css.indexOf('/* ================= LIGHT THEME ================= */');
if (lightIdx !== -1) {
  css = css.substring(0, lightIdx) + comprehensiveThemeLight;
} else {
  css += '\n' + comprehensiveThemeLight;
}

fs.writeFileSync('css/main.css', css);
console.log('Successfully written comprehensive theme-light CSS rules.');
