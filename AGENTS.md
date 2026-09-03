# MoneyWatch Pro - Custom Project Rules & AI Knowledge Base Guidelines

## 1. Core Architecture & Market Integrity Rules
- **No Synthetic/Dummy Data**: All stock tickers, market flows, and valuation metrics must be tied to real IDX universe data or valid ticker filters (`isValidTicker`). If an unknown ticker is searched, present zero-state warning rather than fake values.
- **Server-Side API Route**: The Gemini AI client runs server-side on Node.js (`server.js`) using `@google/genai` with `gemini-3.7-flash` and structured tool calling loops.

## 2. StockChat AI Strategy & Knowledge Base
StockChat AI is equipped with 5 institutional trading and investing frameworks:
1. **Smart Money & Bandarmology Momentum (Swing Trading)**: Focuses on Big Accumulation (Top 3 Broker > 60%), foreign net inflow streaks, and entry near VWAP / Bandar Average Price.
2. **Value Investing & Margin of Safety (Benjamin Graham & DCF)**: Focuses on undervalued stocks with Margin of Safety > 15-20%, ROE > 12%, DER < 1.0x, and PE below 5-year historical average.
3. **Techno-Bandarmology Breakout (Momentum)**: Combines technical chart pattern breakouts with Volume Spike (>2x) and institutional broker accumulation to filter false breakouts.
4. **Dividend Compounder & PMK 18 Tax Exemption**: Identifies cash cows with Dividend Yield > 5-8% and highlights PPh Final 0% tax exemption via 3-year domestic reinvestment.
5. **Institutional Risk Control & Portfolio Allocation**: Enforces 10-15% max position sizing per Big Cap stock, maintaining 15-20% RDN cash buffer, and requiring Risk-Reward Ratio >= 1:2.
