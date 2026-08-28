const fs = require('fs');

const htmlContent = `
  <div class="load-banner" id="dash-load-banner"><span class="load-dot"></span><span id="dash-load-text"></span></div>
  <div style="padding-top:16px;">
        <!-- Header -->
        <div class="header" style="display: flex;justify-content: space-between;align-items: center;margin-bottom: 30px;">
            <div style="display:flex; flex-direction:column;">
                <h1 style="font-size: 28px;font-weight: 800;color: #ffffff;letter-spacing:-0.5px;margin-bottom:4px;margin-top:0;">MoneyWatch Pro</h1>
                <div style="font-size:12px;color:rgba(255,255,255,0.6);">Hub Portofolio & Aset Terpadu • Klik card di bawah untuk membuka manajemen detail</div>
            </div>
            <div style="display:flex;gap:12px;align-items:center;">
               <button class="btn btn-blue btn-sm" onclick="if(typeof renderPortfolioHub==='function') renderPortfolioHub();" style="background:linear-gradient(135deg,#3b82f6,#2563eb);border:none;border-radius:10px;padding:8px 14px;font-size:11px;font-weight:700">⚡ Refresh Data</button>
               <div style="width: 48px;height: 48px;border-radius: 50%;background: rgba(255, 255, 255, 0.1);border: 1px solid rgba(255, 255, 255, 0.08);display: flex;align-items: center;justify-content: center;font-weight: 700;backdrop-filter: blur(10px);">JD</div>
            </div>
        </div>

        <!-- Hero Card (Summary) -->
        <div class="glass-panel hero-section" style="background: rgba(255, 255, 255, 0.03);backdrop-filter: blur(20px);-webkit-backdrop-filter: blur(20px);border: 1px solid rgba(255, 255, 255, 0.08);border-radius: 24px;padding: 30px;box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);display: flex;justify-content: space-between;align-items: center;margin-bottom: 30px;position: relative;overflow: hidden; flex-wrap: wrap; gap: 30px;">
            <div style="position: absolute;top: -50%; left: -50%; width: 200%; height: 200%;background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 60%);pointer-events: none;"></div>
            
            <div class="hero-balance" style="position:relative; z-index:2;">
                <p style="font-size: 15px;color: #94A3B8;font-weight: 600;text-transform: uppercase;letter-spacing: 1px;margin-bottom: 10px;margin-top:0;">Total Net Worth (Semua Portofolio)</p>
                <h2 style="font-size: 48px;font-weight: 800;margin-bottom: 15px;letter-spacing: -1px;font-family:var(--font-mono);margin-top:0;" id="hub-tot-val">Rp 0</h2>
                <div class="badge-trend" id="hub-tot-pnl-pill" style="display: inline-flex;align-items: center;gap: 6px;background: rgba(16, 185, 129, 0.15);color: #10B981;padding: 8px 16px;border-radius: 100px;font-weight: 700;font-size: 14px;border: 1px solid rgba(16, 185, 129, 0.3);box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);">
                    <span id="hub-tot-pnl-icon">▲</span> <span id="hub-tot-pnl">Rp 0</span>
                </div>
            </div>
            
            <div class="hero-chart-wrapper" style="display: flex;align-items: center;gap: 30px;position:relative; z-index:2; flex-wrap:wrap;">
                <div class="donut-chart" style="width: 150px;height: 150px;border-radius: 50%;background: conic-gradient(#3B82F6 0% 40%, #10B981 40% 64%, #EF4444 64% 84%, #8B5CF6 84% 100%);position: relative;display: flex;align-items: center;justify-content: center;box-shadow: 0 0 30px rgba(255,255,255,0.05);" id="hub-donut">
                    <div class="donut-inner" style="width: 110px;height: 110px;border-radius: 50%;background: #0B1121;box-shadow: inset 0 0 15px rgba(0,0,0,0.5);"></div>
                </div>
                <div class="legend" style="display: flex;flex-direction: column;gap: 12px; background:rgba(0,0,0,0.25); padding:16px 20px; border-radius:16px; border:1px solid rgba(255,255,255,0.05);">
                    <div class="legend-item" style="display: flex;align-items: center;gap: 10px;font-size: 14px;color: #94A3B8;font-weight: 600;"><div class="dot" style="width: 10px; height: 10px; border-radius: 50%;box-shadow: 0 0 10px currentColor; background: #3B82F6;"></div> <span style="width:100px;">Saham ID</span></div>
                    <div class="legend-item" style="display: flex;align-items: center;gap: 10px;font-size: 14px;color: #94A3B8;font-weight: 600;"><div class="dot" style="width: 10px; height: 10px; border-radius: 50%;box-shadow: 0 0 10px currentColor; background: #10B981;"></div> <span style="width:100px;">Crypto</span></div>
                    <div class="legend-item" style="display: flex;align-items: center;gap: 10px;font-size: 14px;color: #94A3B8;font-weight: 600;"><div class="dot" style="width: 10px; height: 10px; border-radius: 50%;box-shadow: 0 0 10px currentColor; background: #EF4444;"></div> <span style="width:100px;">ETF US</span></div>
                    <div class="legend-item" style="display: flex;align-items: center;gap: 10px;font-size: 14px;color: #94A3B8;font-weight: 600;"><div class="dot" style="width: 10px; height: 10px; border-radius: 50%;box-shadow: 0 0 10px currentColor; background: #8B5CF6;"></div> <span style="width:100px;">Reksa Dana/SBN</span></div>
                </div>
            </div>
        </div>

        <!-- 4 Categories Grid -->
        <div class="cards-grid" style="display: grid;grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));gap: 20px;">
            
            <!-- Saham Card -->
            <div class="asset-card card-blue" onclick="goPage('portofolio')" style="background: rgba(255, 255, 255, 0.03);border-radius: 20px;padding: 25px 20px;position: relative;overflow: hidden;display: flex;flex-direction: column;transition: transform 0.3s ease, box-shadow 0.3s ease;cursor: pointer;border: 1px solid rgba(59, 130, 246, 0.2);" onmouseover="this.style.transform='translateY(-5px)';this.style.boxShadow='0 10px 30px rgba(59, 130, 246, 0.15)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
                <div class="card-header" style="display: flex;justify-content: space-between;align-items: flex-start;margin-bottom: 20px;position: relative;z-index: 2;">
                    <div class="icon-box" style="width: 42px; height: 42px;border-radius: 12px;display: flex; align-items: center; justify-content: center;font-size: 20px; font-weight: 800; background: rgba(59, 130, 246, 0.15); color: #3B82F6;">ID</div>
                    <div class="mini-badge" style="font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 8px; background: rgba(59, 130, 246, 0.1); color: #3B82F6;">Blue Electric</div>
                </div>
                <div class="card-info" style="position: relative; z-index: 2; margin-bottom: 35px;">
                    <div class="card-title" style="font-size: 16px; color: #ffffff; font-weight: 800; margin-bottom: 2px;">Saham Indonesia</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px;" id="hub-saham-count">0 Emiten aktif</div>
                    <div class="card-amount" style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; font-family:var(--font-mono);" id="hub-saham-val">Rp 0</div>
                </div>
                <div style="position: relative; z-index: 2; display:flex; justify-content:space-between; align-items:center; font-size:11px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
                    <span style="color:rgba(255,255,255,0.5)">P&L: <span style="font-weight:700" id="hub-saham-pnl">Rp 0 (0%)</span></span>
                    <span style="color:#3B82F6;font-weight:700">Kelola →</span>
                </div>
                <!-- Smooth Line Chart SVG -->
                <svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" style="position: absolute;bottom: 0; left: 0; width: 100%; height: 60px;z-index: 1;">
                    <defs>
                        <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.3"/>
                            <stop offset="100%" stop-color="#3B82F6" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,40 L0,25 Q10,35 25,20 T50,25 T75,10 T100,15 L100,40 Z" fill="url(#gradBlue)"/>
                    <path d="M0,25 Q10,35 25,20 T50,25 T75,10 T100,15" fill="none" stroke="#3B82F6" stroke-width="2" style="filter: drop-shadow(0px 2px 4px rgba(59,130,246,0.5));"/>
                </svg>
            </div>

            <!-- Crypto Card -->
            <div class="asset-card card-green" onclick="goPage('crypto')" style="background: rgba(255, 255, 255, 0.03);border-radius: 20px;padding: 25px 20px;position: relative;overflow: hidden;display: flex;flex-direction: column;transition: transform 0.3s ease, box-shadow 0.3s ease;cursor: pointer;border: 1px solid rgba(16, 185, 129, 0.2);" onmouseover="this.style.transform='translateY(-5px)';this.style.boxShadow='0 10px 30px rgba(16, 185, 129, 0.15)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
                <div class="card-header" style="display: flex;justify-content: space-between;align-items: flex-start;margin-bottom: 20px;position: relative;z-index: 2;">
                    <div class="icon-box" style="width: 42px; height: 42px;border-radius: 12px;display: flex; align-items: center; justify-content: center;font-size: 20px; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: #10B981;">₿</div>
                    <div class="mini-badge" style="font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); color: #10B981;">Mint Green</div>
                </div>
                <div class="card-info" style="position: relative; z-index: 2; margin-bottom: 35px;">
                    <div class="card-title" style="font-size: 16px; color: #ffffff; font-weight: 800; margin-bottom: 2px;">Crypto Asset</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px;" id="hub-crypto-count">0 Koin aktif</div>
                    <div class="card-amount" style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; font-family:var(--font-mono);" id="hub-crypto-val">Rp 0</div>
                </div>
                <div style="position: relative; z-index: 2; display:flex; justify-content:space-between; align-items:center; font-size:11px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
                    <span style="color:rgba(255,255,255,0.5)">P&L: <span style="font-weight:700" id="hub-crypto-pnl">Rp 0 (0%)</span></span>
                    <span style="color:#10B981;font-weight:700">Kelola →</span>
                </div>
                <svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" style="position: absolute;bottom: 0; left: 0; width: 100%; height: 60px;z-index: 1;">
                    <defs>
                        <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#10B981" stop-opacity="0.3"/>
                            <stop offset="100%" stop-color="#10B981" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,40 L0,30 Q15,10 30,25 T60,5 T80,15 T100,5 L100,40 Z" fill="url(#gradGreen)"/>
                    <path d="M0,30 Q15,10 30,25 T60,5 T80,15 T100,5" fill="none" stroke="#10B981" stroke-width="2" style="filter: drop-shadow(0px 2px 4px rgba(16,185,129,0.5));"/>
                </svg>
            </div>

            <!-- ETF Card -->
            <div class="asset-card card-red" onclick="goPage('etf')" style="background: rgba(255, 255, 255, 0.03);border-radius: 20px;padding: 25px 20px;position: relative;overflow: hidden;display: flex;flex-direction: column;transition: transform 0.3s ease, box-shadow 0.3s ease;cursor: pointer;border: 1px solid rgba(239, 68, 68, 0.2);" onmouseover="this.style.transform='translateY(-5px)';this.style.boxShadow='0 10px 30px rgba(239, 68, 68, 0.15)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
                <div class="card-header" style="display: flex;justify-content: space-between;align-items: flex-start;margin-bottom: 20px;position: relative;z-index: 2;">
                    <div class="icon-box" style="width: 42px; height: 42px;border-radius: 12px;display: flex; align-items: center; justify-content: center;font-size: 20px; font-weight: 800; background: rgba(239, 68, 68, 0.15); color: #EF4444;">US</div>
                    <div class="mini-badge" style="font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: #EF4444;">Global ETFs</div>
                </div>
                <div class="card-info" style="position: relative; z-index: 2; margin-bottom: 35px;">
                    <div class="card-title" style="font-size: 16px; color: #ffffff; font-weight: 800; margin-bottom: 2px;">ETF US & Global</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px;" id="hub-etf-count">0 ETF aktif</div>
                    <div class="card-amount" style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; font-family:var(--font-mono);" id="hub-etf-val">Rp 0</div>
                </div>
                <div style="position: relative; z-index: 2; display:flex; justify-content:space-between; align-items:center; font-size:11px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
                    <span style="color:rgba(255,255,255,0.5)">P&L: <span style="font-weight:700" id="hub-etf-pnl">Rp 0 (0%)</span></span>
                    <span style="color:#EF4444;font-weight:700">Kelola →</span>
                </div>
                <svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" style="position: absolute;bottom: 0; left: 0; width: 100%; height: 60px;z-index: 1;">
                    <defs>
                        <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#EF4444" stop-opacity="0.3"/>
                            <stop offset="100%" stop-color="#EF4444" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,40 L0,15 Q20,30 40,20 T70,35 T100,25 L100,40 Z" fill="url(#gradRed)"/>
                    <path d="M0,15 Q20,30 40,20 T70,35 T100,25" fill="none" stroke="#EF4444" stroke-width="2" style="filter: drop-shadow(0px 2px 4px rgba(239,68,68,0.5));"/>
                </svg>
            </div>

            <!-- Reksadana Card -->
            <div class="asset-card card-purple" onclick="goPage('reksadana')" style="background: rgba(255, 255, 255, 0.03);border-radius: 20px;padding: 25px 20px;position: relative;overflow: hidden;display: flex;flex-direction: column;transition: transform 0.3s ease, box-shadow 0.3s ease;cursor: pointer;border: 1px solid rgba(139, 92, 246, 0.2);" onmouseover="this.style.transform='translateY(-5px)';this.style.boxShadow='0 10px 30px rgba(139, 92, 246, 0.15)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
                <div class="card-header" style="display: flex;justify-content: space-between;align-items: flex-start;margin-bottom: 20px;position: relative;z-index: 2;">
                    <div class="icon-box" style="width: 42px; height: 42px;border-radius: 12px;display: flex; align-items: center; justify-content: center;font-size: 20px; font-weight: 800; background: rgba(139, 92, 246, 0.15); color: #8B5CF6;">Rp</div>
                    <div class="mini-badge" style="font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 8px; background: rgba(139, 92, 246, 0.1); color: #8B5CF6;">Nila Purple</div>
                </div>
                <div class="card-info" style="position: relative; z-index: 2; margin-bottom: 35px;">
                    <div class="card-title" style="font-size: 16px; color: #ffffff; font-weight: 800; margin-bottom: 2px;">Reksa Dana & SBN</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px;" id="hub-rd-count">0 Produk tercatat</div>
                    <div class="card-amount" style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; font-family:var(--font-mono);" id="hub-rd-val">Rp 0</div>
                </div>
                <div style="position: relative; z-index: 2; display:flex; justify-content:space-between; align-items:center; font-size:11px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
                    <span style="color:rgba(255,255,255,0.5)">Modal: <span style="font-weight:700" id="hub-rd-pnl">Rp 0</span></span>
                    <span style="color:#8B5CF6;font-weight:700">Kelola →</span>
                </div>
                <svg class="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" style="position: absolute;bottom: 0; left: 0; width: 100%; height: 60px;z-index: 1;">
                    <defs>
                        <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.3"/>
                            <stop offset="100%" stop-color="#8B5CF6" stop-opacity="0"/>
                        </linearGradient>
                    </defs>
                    <path d="M0,40 L0,20 Q15,30 35,15 T65,25 T100,10 L100,40 Z" fill="url(#gradPurple)"/>
                    <path d="M0,20 Q15,30 35,15 T65,25 T100,10" fill="none" stroke="#8B5CF6" stroke-width="2" style="filter: drop-shadow(0px 2px 4px rgba(139,92,246,0.5));"/>
                </svg>
            </div>

        </div>
  </div>
`;

let content = fs.readFileSync('moneywatch.html', 'utf8');

const startTag = '<div id="page-dashboard" class="page on">';
const endTag = '</div><!-- ===== EXECUTIVE COMMAND CENTER ===== -->';

const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = content.substring(0, startIndex + startTag.length) + htmlContent + content.substring(endIndex);
    fs.writeFileSync('moneywatch.html', newContent);
    console.log('Replaced dashboard content');
} else {
    console.log('Could not find dashboard section');
}
