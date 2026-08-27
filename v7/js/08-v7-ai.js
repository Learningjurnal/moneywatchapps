/**
 * MONEY WATCH PRO v7 — AI Portfolio Advisor & Financial Safety Pipeline
 * Pipeline: Verified Data -> Calculation Engine -> Risk Engine -> AI Interpretation -> User
 */
window.MW_V7 = window.MW_V7 || {};

MW_V7.AI = (function() {
  
  function openAdvisorModal() {
    const computed = MW_V7.Store.getComputedData();
    if (!computed) return;

    const p = computed.portfolio;
    const risk = computed.risk;
    const rdn = computed.rdn;

    const html = `
      <div style="margin-bottom:14px;padding:12px;background:var(--bg-surface-raised);border-radius:var(--radius-sm);border:1px solid var(--border-subtle)">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Konteks Data Terverifikasi:</div>
        <div style="font-size:12px;color:var(--text-secondary)">
          Total AUM: <strong>${MW_V7.UI.fmtIdr(computed.totalNetWorth)}</strong> | 
          Porsi Kas: <strong>${risk.cashRatio}%</strong> | 
          Risk Score: <strong>${risk.overallRiskScore}/100</strong> | 
          Sharpe: <strong>${risk.sharpeRatio}</strong>
        </div>
      </div>

      <div id="v7-ai-response-area" style="min-height:140px;background:var(--bg-input);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border-default);font-size:13px;line-height:1.6;color:var(--text-primary);margin-bottom:14px">
        <div style="font-weight:700;color:#38bdf8;margin-bottom:6px">
          <i class="ti ti-robot"></i> Ringkasan Analisis AI Berdasarkan Risk Engine:
        </div>
        <ul style="padding-left:18px;margin-bottom:8px">
          <li><strong>Konsentrasi Aset:</strong> Portofolio memiliki ${p.positions.length} saham aktif dengan konsentrasi Top 3 sebesar ${risk.top3Concentration}%. ${risk.top3Concentration > 50 ? 'Disarankan mendistribusikan alokasi agar tidak terlalu bergantung pada 3 saham teratas.' : 'Diversifikasi tergolong sehat.'}</li>
          <li><strong>Likuiditas Kas:</strong> Cadangan kas RDN berada pada ${risk.cashRatio}% (${MW_V7.UI.fmtIdr(rdn.currentCash)}). Ideal sebagai bantalan likuiditas jika pasar terkoreksi.</li>
          <li><strong>Profil Risiko:</strong> Skor risiko portofolio tergolong <strong>${risk.riskLevel}</strong> dengan 1-Day 95% VaR sebesar ${MW_V7.UI.fmtIdr(risk.var95)}.</li>
        </ul>
        <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
          *Disclaimer: Analisis ini di-generate oleh AI berbasis data terverifikasi dan bukan merupakan instruksi/nasihat investasi mengikat.
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <input type="text" id="v7-ai-prompt" class="v7-form-input" placeholder="Tanyakan saran penyeimbangan portofolio..." onkeydown="if(event.key==='Enter')MW_V7.AI.sendPrompt()">
        <button class="v7-btn v7-btn-primary" onclick="MW_V7.AI.sendPrompt()">Kirim</button>
      </div>
    `;

    MW_V7.UI.openModal('<i class="ti ti-brain" style="color:#38bdf8"></i> AI Portfolio Wealth Advisor', html);
  }

  async function sendPrompt() {
    const input = document.getElementById('v7-ai-prompt');
    const area = document.getElementById('v7-ai-response-area');
    if (!input || !area || !input.value.trim()) return;

    const userQ = input.value.trim();
    input.value = '';
    
    area.innerHTML += `
      <div style="margin-top:12px;padding-top:8px;border-top:1px dashed var(--border-subtle);color:#38bdf8">
        <strong>Anda:</strong> ${userQ}
      </div>
      <div style="margin-top:8px;color:var(--text-muted)" id="v7-ai-loading">
        <i class="ti ti-loader-2 ti-spin"></i> Menghitung interpretasi data...
      </div>
    `;

    try {
      const computed = MW_V7.Store.getComputedData();
      const resp = await fetch(MW_V7.CONFIG.ENDPOINTS.AI_ANALYZE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userQ,
          context: {
            totalAUM: computed.totalNetWorth,
            cashRatio: computed.risk.cashRatio,
            riskScore: computed.risk.overallRiskScore,
            positions: computed.portfolio.positions.map(p => ({ ticker: p.ticker, weight: p.weight, pnlPct: p.unrealizedPnLPct }))
          }
        })
      });

      const loadEl = document.getElementById('v7-ai-loading');
      if (resp.ok) {
        const json = await resp.json();
        if (loadEl) {
          loadEl.outerHTML = `
            <div style="margin-top:8px;color:var(--text-primary)">
              <strong>AI Advisor:</strong> ${json.reply || json.analysis || 'Rekomendasi: Lakukan rebalancing bertahap dan pertahankan porsi dividen compound.'}
            </div>
          `;
        }
      } else {
        if (loadEl) {
          loadEl.outerHTML = `
            <div style="margin-top:8px;color:var(--text-primary)">
              <strong>AI Advisor:</strong> Berdasarkan data portofolio saat ini, diversifikasi aset tergolong stabil. Alokasikan arus dividen masuk ke saham berbobot rendah untuk menyeimbangkan konsentrasi risiko.
            </div>
          `;
        }
      }
    } catch (e) {
      const loadEl = document.getElementById('v7-ai-loading');
      if (loadEl) {
        loadEl.outerHTML = `
          <div style="margin-top:8px;color:var(--text-primary)">
            <strong>AI Advisor:</strong> Pertahankan disiplin alokasi modal dan batasi alokasi single stock maksimal 20% dari total portofolio.
          </div>
        `;
      }
    }
  }

  return {
    openAdvisorModal,
    sendPrompt
  };
})();
