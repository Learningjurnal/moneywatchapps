const fs = require('fs');

let html = fs.readFileSync('moneywatch.html', 'utf8');

const toggleBtnHtml = `
  <!-- Theme Toggle Floating Button -->
  <button id="theme-toggle-btn" style="position:fixed;bottom:24px;right:24px;width:48px;height:48px;border-radius:50%;background:var(--accent);color:#fff;border:none;box-shadow:0 4px 15px rgba(0,0,0,0.2);cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;font-size:20px;transition:transform 0.2s;" onclick="toggleTheme()" title="Toggle Light/Dark Theme">
    <i class="ti ti-sun" id="theme-icon"></i>
  </button>
  <script>
    function toggleTheme() {
      document.body.classList.toggle('theme-light');
      const isLight = document.body.classList.contains('theme-light');
      localStorage.setItem('mw_theme', isLight ? 'light' : 'dark');
      document.getElementById('theme-icon').className = isLight ? 'ti ti-moon' : 'ti ti-sun';
    }
    // Load theme on startup
    if(localStorage.getItem('mw_theme') === 'light') {
      document.body.classList.add('theme-light');
      setTimeout(() => {
        const icon = document.getElementById('theme-icon');
        if(icon) icon.className = 'ti ti-moon';
      }, 100);
    }
  </script>
`;

if (!html.includes('id="theme-toggle-btn"')) {
    html = html.replace('</body>', toggleBtnHtml + '\n</body>');
    fs.writeFileSync('moneywatch.html', html);
    console.log('Added theme toggle to moneywatch.html');
} else {
    console.log('Theme toggle already exists');
}
