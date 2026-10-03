# MoneyWatch Pro - Custom Project Rules & AI Knowledge Base Guidelines

## 1. Core Architecture & Market Integrity Rules
- **No Synthetic/Dummy Data**: All stock tickers, market flows, and valuation metrics must be tied to real IDX universe data or valid ticker filters (`isValidTicker`). If an unknown ticker is searched, present zero-state warning rather than fake values.
- **Server-Side API Route**: The Gemini AI client runs server-side on Node.js (`server.js`) using `@google/genai` with `gemini-3.7-flash` and structured tool calling loops.
- **Provider Agnostic Data Layer**: Market-data and broker-data providers must be accessed through normalized adapters. Never couple the trading engine directly to a vendor-specific response format.
- **Data Provenance Is Mandatory**: Every market/broker/fundamental dataset used by analysis must retain source, timestamp, freshness/age, status, symbol, timeframe, adjusted/unadjusted state, and error information where applicable.
- **Explicit Data Status**: Use `REAL`, `STALE`, `UNAVAILABLE`, `SIMULATION`, or `INVALID`. `SIMULATION` may be used for research only and must never silently enter a production financial backtest or live-trading decision.
- **No Cross-User State**: Portfolio, cash, equity, positions, P/L, watchlists, AI hypotheses, journal, signals, and autonomous-trading state must be scoped to the authenticated user. Never trust client-supplied UID/email as proof of identity.

## 2. StockChat AI Strategy & Knowledge Base
StockChat AI is equipped with 5 institutional trading and investing frameworks:
1. **Smart Money & Bandarmology Momentum (Swing Trading)**: Focuses on Big Accumulation (Top 3 Broker > 60%), foreign net inflow streaks, and entry near VWAP / Bandar Average Price.
2. **Value Investing & Margin of Safety (Benjamin Graham & DCF)**: Focuses on undervalued stocks with Margin of Safety > 15-20%, ROE > 12%, DER < 1.0x, and PE below 5-year historical average.
3. **Techno-Bandarmology Breakout (Momentum)**: Combines technical chart pattern breakouts with Volume Spike (>2x) and institutional broker accumulation to filter false breakouts.
4. **Dividend Compounder & PMK 18 Tax Exemption**: Identifies cash cows with Dividend Yield > 5-8% and highlights PPh Final 0% tax exemption via 3-year domestic reinvestment.
5. **Institutional Risk Control & Portfolio Allocation**: Enforces 10-15% max position sizing per Big Cap stock, maintaining 15-20% RDN cash buffer, and requiring Risk-Reward Ratio >= 1:2.

---

# 3. AUTONOMOUS AI TRADING ENGINE — OPERATING SPECIFICATION

## 3.1 Mission
The Autonomous AI Trading Engine is a **decision engine**, not a blind prediction engine.

Its job is to:
1. ingest validated market data;
2. detect market regime;
3. generate candidate signals;
4. construct an explicit trading hypothesis;
5. score confluence across independent evidence;
6. calculate entry, stop, target, position size, expected risk and expected reward;
7. reject low-quality or contradictory setups;
8. execute only when all risk and data gates pass;
9. record the complete reasoning/evidence trail;
10. learn from outcomes without rewriting its own rules without validation.

The engine must prefer **NO TRADE** over a low-confidence trade, but it must never use NO TRADE to suppress a necessary risk-management exit for an already-open position.

---

# 4. AUTONOMOUS TRADING DECISION PIPELINE
The engine follows:

```text
DATA INGESTION
    ↓
DATA QUALITY GATE
    ↓
MARKET REGIME
    ↓
UNIVERSE VALIDATION
    ↓
SETUP DETECTION
    ↓
MULTI-FACTOR CONFLUENCE
    ↓
HYPOTHESIS GENERATION
    ↓
RISK / REWARD CALCULATION
    ↓
POSITION SIZING
    ↓
PORTFOLIO EXPOSURE CHECK
    ↓
EXECUTION SAFETY GATE
    ↓
ORDER / PAPER ORDER
    ↓
POSITION MONITORING
    ↓
OUTCOME JOURNAL
    ↓
PERFORMANCE ANALYSIS
```

**Never bypass a previous stage for a NEW ENTRY.** Existing-position emergency/risk exits are governed by the Exit Safety Override in Section 12.

---

# 5. DATA QUALITY GATE
For a **new trade entry**, verify:
- ticker exists in valid IDX universe;
- quote timestamp is available;
- OHLCV history is sufficient;
- timeframe is correct;
- price is positive and internally consistent;
- volume is non-negative;
- no impossible OHLC relationship exists;
- broker data has a known source and timestamp when broker evidence is required by the selected strategy;
- fundamental data has a known reporting period when fundamental evidence is required;
- corporate-action adjustment state is known when relevant;
- data is not beyond the configured freshness threshold.

If a **mandatory entry input** is missing or stale:

```text
NO TRADE / BLOCKED
reason = DATA_QUALITY_FAILURE
```

Do not estimate or invent the missing value.

For an **already-open position**, stale or unavailable data must not automatically force HOLD. The system must enter `RISK_MANAGEMENT_DEGRADED` mode and apply the safest available validated exit/risk controls. If a reliable emergency exit price/order path is unavailable, raise `EXECUTION_RISK` and alert rather than inventing a price.

---

# 6. MARKET REGIME ENGINE
Minimum states:
- BULL_TREND
- BEAR_TREND
- SIDEWAYS
- HIGH_VOLATILITY
- RISK_OFF
- UNKNOWN

Evidence may include IHSG trend, breadth, volatility, market volume, foreign flow, sector rotation, index moving averages, correlation and dispersion.

If regime is `UNKNOWN`, reduce confidence and do not allow aggressive autonomous **new entries**.

```text
MARKET REGIME ≠ STOCK SIGNAL
```

A bullish stock signal inside a risk-off market receives a regime penalty unless evidence justifies the exception.

---

# 7. SIGNAL GENERATION
Candidate signals may use:

### Technical
- trend structure
- EMA/SMA alignment
- RSI
- ATR
- SuperTrend
- VWAP
- support/resistance
- breakout/retest
- volume expansion
- volatility
- momentum
- relative strength

### Broker / Smart Money
- Top 3 broker concentration
- broker accumulation/distribution
- foreign net flow
- foreign inflow streak
- average broker price
- unusual broker activity

### Fundamental
- valuation
- earnings growth
- ROE
- DER
- cash flow
- dividend yield
- margin of safety
- historical valuation range

### Market Context
- IHSG regime
- sector regime
- liquidity
- market breadth
- event/corporate-action risk

No single indicator is sufficient for autonomous **new-entry approval**.

---

# 8. CONFLUENCE ENGINE
The engine scores independent evidence rather than simply counting indicators.

Evidence groups:
```text
TREND
MOMENTUM
VOLUME
PRICE_STRUCTURE
SMART_MONEY
FOREIGN_FLOW
FUNDAMENTAL
MARKET_REGIME
RISK
LIQUIDITY
```

Indicators from the same group should not be treated as fully independent evidence.

Example:
- RSI bullish + MACD bullish = one momentum group, not two independent confirmations.
- Broker accumulation + foreign inflow = stronger separate flow evidence.
- Breakout + volume expansion + broker accumulation = stronger than breakout alone.

Output:
```text
confidenceScore
confluenceScore
evidence[]
contradictions[]
missingEvidence[]
```

---

# 9. TRADING HYPOTHESIS
Every autonomous **new trade candidate** must have a structured, falsifiable hypothesis.

Required fields:
```text
symbol
side
regime
setup
entryReason
bullCase
bearCase
catalyst
invalidation
entryZone
stopLoss
takeProfit
riskPerShare
rewardPerShare
riskReward
positionSize
confidence
confluence
supportingEvidence
contradictingEvidence
dataTimestamp
strategyVersion
```

Bad: `BUY because the stock looks strong.`

Good: `BUY because price reclaimed resistance, volume expanded above baseline, broker accumulation increased, and the setup is invalidated if price closes below the defined support.`

---

# 10. ENTRY RULES
New entry requires:
1. valid ticker;
2. valid and sufficiently fresh data;
3. acceptable liquidity;
4. defined setup;
5. defined entry zone;
6. defined stop loss;
7. defined target;
8. Risk:Reward >= 1:2 unless explicitly configured otherwise;
9. portfolio exposure passes limits;
10. market-regime gate passes;
11. no unresolved critical data contradiction;
12. no duplicate open order/position conflict.

If any mandatory gate fails: `NO TRADE`.

---

# 11. POSITION SIZING & RISK ENGINE
Default controls:
- risk per trade: approximately 1% of trading capital;
- Big Cap single-stock allocation: maximum 10-15% unless strategy configuration explicitly allows another limit;
- RDN cash buffer: 15-20%;
- minimum Risk:Reward: 1:2;
- never increase position size because confidence is emotionally high;
- never average down automatically unless explicitly defined and approved by the risk engine;
- stop loss must be defined before order submission.

Position size is derived from:
```text
allowedRiskCapital ÷ riskPerShare
```
Then constrained by:
```text
cashAvailable
portfolioExposureLimit
symbolExposureLimit
liquidityLimit
strategyLimit
```

All calculations must use the canonical financial engine.

---

# 12. EXIT ENGINE & SAFETY OVERRIDE
The engine manages:
- initial stop loss;
- take profit;
- trailing stop where strategy permits;
- time stop;
- thesis invalidation;
- abnormal volatility;
- trading halt;
- liquidity deterioration;
- market regime deterioration.

A position must be exited when the thesis is invalidated even if the AI still has a bullish narrative.

Do not move a stop loss farther away merely to avoid realizing a loss.

## Exit Safety Override
Risk-management exits for existing positions are **not treated as new trade entries**.

When market/broker/fundamental data becomes stale or unavailable:
1. do not invent a price;
2. do not create a new BUY;
3. continue monitoring the last validated state;
4. use only validated execution/market-status information available;
5. if a predefined stop/target can be safely evaluated and executed, allow it;
6. if execution data is unavailable, mark `EXECUTION_RISK` and alert;
7. never convert missing data into a bullish HOLD decision.

---

# 13. SELL DECISION
SELL decisions must identify a reason:
```text
TARGET_REACHED
STOP_LOSS
THESIS_INVALIDATED
REGIME_CHANGE
RISK_LIMIT
LIQUIDITY_RISK
TIME_STOP
CORPORATE_ACTION
MANUAL_OVERRIDE
```

Never generate an unexplained SELL.

---

# 14. PORTFOLIO-LEVEL AI
Before a new position, check:
- total equity;
- available cash;
- cash buffer;
- sector concentration;
- single-stock concentration;
- correlation between positions;
- unrealized P/L;
- realized P/L;
- portfolio drawdown;
- aggregate risk;
- duplicate exposure;
- liquidity risk.

A good stock setup can still be rejected if the portfolio is already overexposed.

---

# 15. EXECUTION SAFETY
Autonomous execution is disabled by default unless the production gate has explicitly passed.

Modes:
```text
RESEARCH
PAPER
SHADOW
LIVE_GATED
LIVE
```

Default: `PAPER`.

`LIVE_GATED` means live-capable execution remains subject to every server-side safety gate; it is not permission to bypass risk controls.

The AI must never silently transition from PAPER to LIVE or LIVE_GATED.

---

# 16. ORDER SAFETY
Before creating a new order:
- verify authenticated user;
- verify trading mode;
- verify symbol;
- verify current price/data freshness;
- verify available cash;
- verify position limit;
- verify risk limit;
- verify duplicate-order protection;
- verify market status;
- verify tick-size compliance;
- verify quantity is valid;
- verify estimated fees and taxes;
- create idempotency key.

Duplicate order submission must be rejected safely.

---

# 17. FINANCIAL CALCULATION RULE
All fees, taxes, cost basis, realized P/L, unrealized P/L, net worth, position sizing, and performance calculations must use a **single canonical financial engine**.

Never duplicate financial formulas across UI, AI, backtester, broker adapter, portfolio module, or test suite.

The test suite must validate production calculation functions rather than merely reproducing the same formula independently.

---

# 18. BACKTESTING RULES
Backtests must identify:
```text
DATA_SOURCE
DATA_VERSION
DATE_RANGE
TIMEFRAME
ADJUSTMENT_STATE
FEES
TAX
SLIPPAGE
LATENCY_ASSUMPTION
LOOKAHEAD_CHECK
SURVIVORSHIP_BIAS_CHECK
```

Mandatory:
- no look-ahead bias;
- no future data leakage;
- no synthetic data in production-style financial backtests;
- fees and slippage included;
- corporate actions handled consistently;
- train/test separation;
- out-of-sample validation;
- walk-forward validation where appropriate.

Accuracy/AUC alone is insufficient to approve a trading model.

Evaluate at minimum:
- net return;
- CAGR where applicable;
- max drawdown;
- Sharpe/Sortino where appropriate;
- win rate;
- profit factor;
- expectancy;
- average win/loss;
- turnover;
- transaction costs;
- tail losses.

---

# 19. AI / ML MODEL GOVERNANCE
Models such as XGBoost are research components, not unquestionable authorities.

The AI must:
- expose model version;
- expose feature version;
- expose training period;
- expose validation period;
- record threshold used;
- detect missing features;
- reject malformed feature vectors;
- avoid silently using defaults that change model meaning;
- be evaluated out-of-sample;
- be monitored for drift.

A model must not be promoted to autonomous execution based only on historical accuracy.

---

# 20. CONTRADICTION & UNCERTAINTY ENGINE
The AI must explicitly detect conflicting evidence.

Example:
```text
TECHNICAL = BULLISH
BROKER_FLOW = BEARISH
FOREIGN_FLOW = BEARISH
REGIME = RISK_OFF
```

Expected:
- lower confidence;
- identify contradiction;
- avoid forced BUY;
- prefer WAIT/NO_TRADE if risk is not justified.

Unknown is not bullish.
Missing data is not neutral evidence.

---

# 21. EXPLAINABILITY / AUDIT TRAIL
Every autonomous decision must be reproducible from its recorded snapshot.

Store:
```text
decisionId
userId
symbol
time
strategyVersion
modelVersion
dataSnapshotId
marketRegime
signal
confidence
confluence
entry
stop
target
positionSize
risk
reward
evidence
contradictions
dataQuality
executionMode
finalDecision
reason
```

Do not store only the final BUY/SELL result.

The audit trail must explain why the decision happened and what data the AI saw at that time.

---

# 22. LEARNING / JOURNAL ENGINE
After every completed trade, record:
- original hypothesis;
- actual entry;
- actual exit;
- realized P/L;
- maximum favorable excursion;
- maximum adverse excursion;
- holding period;
- original confidence;
- original confluence;
- invalidation status;
- whether execution differed from plan;
- market regime at entry and exit;
- error classification.

Classify mistakes:
```text
DATA_ERROR
SIGNAL_ERROR
TIMING_ERROR
RISK_ERROR
EXECUTION_ERROR
MODEL_ERROR
REGIME_ERROR
DISCIPLINE_ERROR
```

The learning layer may update analytics and recommendations, but must not autonomously rewrite trading rules or production code.

---

# 23. AUTONOMOUS AGENT BEHAVIOUR
The agent operates as:
```text
OBSERVE
→ VALIDATE
→ ANALYZE
→ HYPOTHESIZE
→ SCORE
→ RISK_CHECK
→ DECIDE
→ EXECUTE
→ MONITOR
→ REVIEW
```

Allowed final decisions:
```text
BUY
SELL
HOLD
WAIT
NO_TRADE
BLOCKED
```

`NO_TRADE` is a valid successful decision, not a failure.

For an existing position, risk-management exits take priority over a generic HOLD decision.

---

# 24. TEST HARNESS REQUIREMENTS
Test at least:
- normal market;
- bull market;
- bear market;
- sideways market;
- gap down >= 10%;
- volume spike;
- false breakout;
- trading halt;
- stale market data;
- missing OHLCV;
- invalid ticker;
- broker data unavailable;
- contradictory broker/technical signal;
- insufficient cash;
- position limit reached;
- cash-buffer violation;
- duplicate order;
- partial sell;
- corporate action;
- tick-size violation;
- extreme volatility;
- API timeout;
- provider failure;
- AI signal failure;
- model feature failure;
- existing-position emergency exit during stale/unavailable data.

Critical failures must block autonomous execution.

---

# 25. PRODUCTION GATE
Autonomous LIVE trading must remain BLOCKED until all are true:
- P0 security findings = 0;
- authentication/authorization verified;
- no cross-user data leakage;
- canonical financial engine exists;
- provider adapters conform to normalized contract;
- data freshness/provenance implemented;
- no silent synthetic data in financial backtests;
- backtest leakage checks pass;
- walk-forward/OOS evidence exists;
- trading harness passes critical scenarios;
- CI blocks critical regression;
- duplicate-order protection works;
- risk limits are enforced server-side;
- audit trail is complete;
- API provider passes data-quality acceptance testing;
- paper/shadow performance is monitored before live promotion.

Until then:
```text
PAPER / SHADOW / NO_TRADE
```

---

# 26. CODING AGENT TOKEN-EFFICIENCY PROTOCOL
The coding AI must NOT read the entire repository to solve a local problem.

Use:
```text
1. IDENTIFY TARGET FILE
2. SEARCH TARGET SYMBOL
3. READ LOCAL CONTEXT ONLY
4. TRACE ONLY DIRECT DEPENDENCIES
5. ANALYZE
6. PATCH MINIMAL AREA
7. RUN TARGETED TEST
8. REPORT FILE + FUNCTION + LINE RANGE
9. STOP
```

Default code-reading window:
```text
40–80 lines before target
+
target function
+
40–80 lines after target
```

If more context is required, expand incrementally by another 40–80 lines.

Never dump an entire large file into the AI context when a function-level read is sufficient.

Before opening another file, state why it is a direct dependency.

---

# 27. CHANGE CONTROL
For every modification:
```text
TASK
FILE
FUNCTION / SYMBOL
LINE RANGE INSPECTED
ROOT CAUSE
SEVERITY
MINIMAL FIX
FILES MODIFIED
LINES MODIFIED
TEST EXECUTED
RESULT
REMAINING RISK
NEXT TASK
STOP
```

Do not perform unrelated cleanup during a security or financial-engine task.

Do not combine P0, P1, P2, and P3 changes into one uncontrolled patch.

---

# 28. ABSOLUTE RULES
Never:
- invent stock prices;
- invent broker flow;
- invent market capitalization;
- invent fundamental metrics;
- treat missing data as bullish evidence;
- silently convert real data failure into synthetic data for financial decisions;
- trust client UID/email as authorization;
- allow cross-user portfolio state;
- bypass risk limits because AI confidence is high;
- average down automatically without an approved strategy;
- move a stop loss farther away merely to avoid a loss;
- submit duplicate orders;
- execute live trading before production gates pass;
- promote an ML model based only on accuracy;
- rewrite production strategy rules from a single trade outcome;
- read the entire repository when local code inspection is sufficient;
- perform unrelated refactors during targeted fixes.

The system must always prefer **data integrity, capital preservation, security, and reproducibility over trade frequency**.

---

# 29. CROSS-FILE REFACTOR SAFETY

Added after two real production incidents on 2026-09-10 (see `INCIDENT_LOG.md`): a provider-adapter refactor moved a function into a different file than its caller, without updating the caller's imports — `node --check` and the existing test suite both passed, and it broke live quotes for every ticker in production until a user found it in the logs.

Before merging any change that moves, renames, or splits a function/const across files in `lib/**` or `server.js`:

1. `npm run lint` **must** be run and pass — it now runs `eslint lib server.js` with the `no-undef` rule (see `eslint.config.js`), which statically catches "this name isn't actually imported/declared" without needing a test or a live request to surface it. `node --check` alone is NOT sufficient for this class of bug: it only parses syntax, it does not resolve whether a referenced identifier is actually in scope.
2. This lint rule is deliberately scoped to `lib/**` and `server.js` only (real ES modules with explicit `import`/`export`) — NOT `public/js/**`, whose ~50 files share one implicit browser global scope by design (a function declared in one file is legitimately callable from another via the DOM global object, with no import statement). Do not "fix" this by disabling or loosening the rule for `lib/**`; extend coverage to `public/js/**` only via a separate, explicitly-scoped config block that accounts for that architecture, if that work is ever undertaken.
3. If the change touches provider functions (`lib/providers/**`, `lib/invezgo-client.js`) that have no live-network test coverage, add or extend a case in `test_provider_functions.js` using a mocked `global.fetch` — do not ship a provider-layer change whose only verification was "it parses" and "the unrelated pre-existing tests still pass."

## Self-re-triggering function pattern (the second 2026-09-10 incident)

Any function whose completion callback (`finally`, `.then()`, a promise-chain continuation) triggers a re-render or re-entry into the SAME decision path that called it in the first place is a latent infinite-loop risk — it only takes that decision path failing to reach its "stop" condition (e.g., a cache that never gets populated because the underlying fetch keeps failing) for it to retry itself with no delay, forever, for as long as the page/tab/process stays alive.

Before shipping such a pattern:
- The re-entry's trigger condition must have an explicit cooldown, backoff, or max-attempt cap — not just "not already cached, not already loading." A failure state must count as "already tried recently," not as "safe to retry immediately."
- Prefer extracting the trigger/guard condition into its own small, pure (no DOM, no network) function, exported for direct testing — see `intelShouldAutoFetch()` in `public/js/27-stockintel.js` and its test in `test_provider_functions.js` as the reference pattern.
- Manually verify the loop actually terminates under a sustained-failure scenario (mock the dependency to always fail, simulate N rapid re-entries, assert the call count stays bounded) before considering the fix complete — do not assume a cooldown constant alone is proof; test it the way `test_provider_functions.js`'s INCIDENT #2 case does.

---

# 30. REGULATORY HEALTH GATE (BEI SPECIAL NOTATION)

Added 2026-09-24, implemented in `lib/regulatory-gate.js`. This section is
the operative spec — there is no separate `docs/regulatory-health-gate.md`
file; keep this section as the single source of truth if the gate's rules
change.

## 30.1 Purpose and scope
Yahoo Finance's price/OHLC feed is a **market-data** source — a valid
quote or a clean chart from it is **never** evidence that a stock is
clear of regulatory action. Regulatory status (BEI Special Notation,
Papan Pemantauan Khusus / FCA watchlist, suspension) is sourced separately
and combined from two providers, in priority order (see 30.1.1).

The Gate is a pure regulatory filter. It must **never** be extended with
valuation, fundamental, or technical criteria — that scoring stays in the
analysis layer that runs after the Gate.

### 30.1.1 Source priority (changed 2026-09-24)
1. **Primary: `fetchInvezgoNotation()`** (`lib/invezgo-client.js`) — GET
   `/analysis/notation`, Invezgo's own officially documented notation
   endpoint, whole-market in one parameter-free call, 12h cache. Chosen as
   primary because Invezgo is already proven reachable from this app's
   Vercel deployment (the Strategy Engine cron's first live run processed
   843/958 tickers against it), while `idx.co.id`'s reachability from a
   Vercel serverless IP was never verified — exchange sites commonly block
   datacenter/bot traffic, which would leave the gate (and every feature
   gated by it) permanently `DATA_ERROR`.
   **Provenance caveat, not silently assumed**: the OpenAPI spec's example
   shows one `{code, date, list}` entry per stock; it is unconfirmed
   whether a stock can carry multiple historical entries or always exactly
   one current entry. `lib/regulatory-gate.js`'s normalizer takes the
   entry with the latest `date` per code as current status — documented
   in code, treat as provisional until a live response confirms it.
2. **Fallback: `fetchIdxSpecialNotations()`** (`lib/providers/idx-client.js`)
   — direct `idx.co.id` scrape, used only when Invezgo's call fails. Kept
   as a second independent source (not dropped) per explicit user
   decision, so an Invezgo-side outage doesn't also take the gate down.

`lib/regulatory-gate.js`'s `getCombinedNotationEnvelope()` tries Invezgo
first and only calls the idx.co.id fallback on failure; the returned
envelope's `source` field (and each per-ticker result's `source`) discloses
which one actually answered — `'Invezgo (data notasi resmi BEI)'` or
`'BEI (idx.co.id, fallback — Invezgo gagal)'`.

## 30.2 Classification
`getRegulatoryHealthGate(tickers, forceRefresh?)` classifies every input
ticker into one of four statuses, from a single combined-envelope snapshot
(30.1.1):

| Status | Meaning | `eligible` |
|---|---|---|
| `CLEAR` | Fresh data (Invezgo or idx.co.id fallback) fetched successfully; ticker has no active notation entry | `true` |
| `FLAGGED` | Fresh data; ticker has an active Special Notation / watchlist entry | `false` |
| `UNKNOWN` | Both sources' refresh failed but a prior (stale, past 12h TTL) idx.co.id cache exists | `false` |
| `DATA_ERROR` | Neither source has ever been reached successfully — no cache anywhere | `false` |

Non-negotiable, matching Aturan Wajib CLAUDE.md §5 and the Zero Fabricated
Data principle:
- Yahoo/Invezgo price data ≠ regulatory clearance.
- `UNKNOWN` ≠ `CLEAR`.
- `STALE` ≠ `CLEAR`.
- A regulatory-source API failure (either provider) ≠ `CLEAR`.
- No synthetic/guessed regulatory status.
- No permanent hardcoded "safe stock" list.

`filterEligibleTickers(tickers)` is a convenience wrapper returning only
the tickers whose gate result is `eligible`.

## 30.3 Wired entry points
- `generateUnifiedScreener()` (`lib/idx-data-engine.js`) — every row carries
  `regulatoryStatus`/`regulatoryEligible`/`regulatoryReason`; rows are
  excluded by default (`excludeFlagged` unset or truthy) unless caller
  explicitly passes `excludeFlagged: false`. `confirmedUptrendWhale` uses a
  gate-aware `regulatoryConfirmed` value, never the raw technical
  `confirmed` flag, so a technically-strong but regulator-flagged stock
  never surfaces as "Confirmed".
- `getUniverseOpportunityRadar()` (`lib/idx-data-engine.js`) — same
  `excludeFlagged` contract; a non-eligible ticker can never render as
  `BUY ZONE`/`WATCHLIST` and is relabeled `TIDAK LAYAK (REGULASI)`.
- Both expose `summary.regulatoryClear/Flagged/Unknown/DataError` and a
  `dataSources.regulatory` / `regulatoryDataSource` envelope (`available`,
  `isStale`, `source` — see 30.1.1 for the two possible values, `checkedAt`)
  so the UI can honestly disclose when the whole gate is running in a
  degraded state (e.g. every row hidden because both regulatory sources
  are unreachable) instead of silently returning an empty list. The
  Unified Screener UI (`public/js/48-unified-screener.js`) renders a
  dedicated red banner + a distinct empty-table message when
  `dataSources.regulatory.available` is `false`, so a fully-gated result
  is never mistaken for "no rows match your filter" (fixed 2026-09-24
  after a user report of exactly that confusion).

## 30.4 Extending the gate to a new entry point
Any new whole-market or per-ticker analysis surface (future Screener
variants, StockChat tool calls that recommend a ticker for entry, cron
background jobs) that can result in a BUY/entry-style recommendation must
call `getRegulatoryHealthGate()` (or `filterEligibleTickers()`) before
presenting or scoring candidates, and must default to excluding
non-`CLEAR` tickers — matching the pattern above. It is one whole-market
snapshot, not a per-ticker network call, so there is no quota/perf reason
to skip it.

---

# 31. INDONESIA ECONOMIC DATA ENGINE (BI + BPS) — PLAN, PHASE 1 DONE, BPS STRATEGIC INDICATORS VERIFIED

Ditambahkan 2026-09-28/29. Fase 1 (skeleton) sudah dikerjakan dan di-PR
(learningjurnal/moneywatchapps#238, branch `claude/baca-evaluasi-m2gwto`).
**Update 2026-09-29**: user mengirim URL dokumentasi resmi BPS WebAPI
(`https://webapi.bps.go.id/documentation/`) dan sudah punya `BPS_API_KEY`
sendiri (belum di-set di environment sesi ini). Sandbox sesi ini TETAP
tidak bisa menjangkau `webapi.bps.go.id` (egress diblokir di level proxy,
bukan soal key) — jadi verifikasi dilakukan lewat user mengirim SCREENSHOT
dokumentasi resmi secara langsung (bukan web search/WebFetch, keduanya
diblokir untuk domain ini). Hasil dari proses itu:
1. **Format URL BPS WebAPI dikoreksi**: QUERY-STRING
   (`/v1/api/list/?model=X&domain=Y&lang=ind&key=K`), BUKAN path-segment
   (`model/X/lang/Y/domain/Z/key/K`) seperti yang ditulis di Fase 1 —
   format lama itu tebakan dari web search yang TIDAK terverifikasi dan
   sekarang terbukti salah. Sudah diperbaiki di `checkBpsLiveStatus()` dan
   `bpsListModels()`.
2. **Skema `model=indicators` (Strategic Indicators) SUDAH terverifikasi**
   dari tabel parameter/response resmi (user konfirmasi eksplisit "tidak
   ada filed lain") dan diimplementasikan di
   `fetchBpsStrategicIndicators()` (`bps-client.js`) +
   `getBpsStrategicIndicators()` (`economic-data-engine.js`) + route
   `GET /api/economic/bps/indicators`. Ini SATU-SATUNYA indikator BPS di
   app ini dengan skema respons terverifikasi lengkap — lihat 31.2a untuk
   detail dan gap yang tersisa.
3. Fase 2+ untuk indikator LAIN (inflasi/PDB/ekspor-impor via
   `model=data`, dan seluruh sisi BI) **BELUM dikerjakan** — masih perlu
   discovery/verifikasi per-indikator sendiri, lihat 31.3.

Sesi berikutnya yang melanjutkan harus baca section ini dulu sebelum
menyentuh `lib/economic-data-engine.js` atau
`lib/providers/bi-client.js`/`bps-client.js` lagi.

## 31.1 Kenapa berhenti di skeleton

User minta Economic Data Engine penuh (28 bagian spec: BI + BPS, discovery,
DB, cache, dashboard, test, health check). Audit sebelum coding (lihat PR
#238 untuk detail lengkap) menemukan 2 blocker yang genuinely di luar
kendali sesi manapun tanpa input manusia:

1. **Tidak ada `BPS_API_KEY`** — pendaftaran di `webapi.bps.go.id/developer`
   butuh akun manusia, tidak bisa dilakukan AI.
2. **Egress sandbox pengembangan memblokir `bi.go.id` DAN
   `webapi.bps.go.id`** (403 policy denial, dikonfirmasi via curl langsung)
   — belum diverifikasi apakah ini spesifik sandbox atau juga berlaku di
   production Vercel.

Menulis parser (field mapping BPS JSON, SOAP envelope BI) tanpa respons
real yang terverifikasi = menebak skema API eksternal, dilarang keras oleh
CLAUDE.md Aturan #1. Jadi Fase 1 cuma membangun bagian yang JUJUR bisa
diselesaikan tanpa network: provider architecture, config, health check,
endpoint yang mengembalikan `NOT_CONFIGURED`/`UNAVAILABLE`/`not_verified`
apa adanya.

## 31.2 Yang SUDAH ada (Fase 1, di PR #238)

- `lib/providers/bps-client.js` — config (`BPS_API_KEY`/`BPS_API_BASE_URL`/
  `BPS_TIMEOUT_MS`/`BPS_CACHE_TTL`), `checkBpsLiveStatus()`,
  `bpsListModels()` (dataset discovery, raw response `schemaVerified:false`),
  `fetchBpsStrategicIndicators()` (skema terverifikasi — lihat 31.2a).
- `lib/providers/bi-client.js` — `checkBiLiveStatus()` (probe GET murni,
  bukan panggilan SOAP), `fetchBiJisdor()`/`fetchBiKursTransaksi()` stub
  yang return `access:'not_verified'` (SENGAJA tidak ada SOAPAction/
  envelope tebakan).
- `lib/economic-data-engine.js` — `normalizeEconomicRecord()` (unified
  schema, enum status 5 nilai: `VERIFIED|CACHED|STALE|UNAVAILABLE|ERROR`,
  `value` dipaksa `null` untuk status non-live), `getEconomicHealth()`,
  `getBpsStrategicIndicators()` (wraps `fetchBpsStrategicIndicators()` ke
  `normalizeEconomicRecord()`, period/frequency/geography dibiarkan null
  karena endpoint tidak menyediakannya per-item).
- `server.js` — `GET /api/economic/health`, `/bps/datasets`, `/bi/jisdor`,
  `/bi/exchange-rate`, `/bps/indicators` (baru, skema terverifikasi).
  **Sengaja belum ada** route indikator spesifik lain (`bps/inflation`,
  `bps/gdp`, dst) — lihat 31.1 & 31.3.
- Regression test di `test_suite.js` (cari `Indonesia Economic Data
  Engine` / `StrategicIndicators` untuk lokasinya) + `.env.example`
  terdokumentasi.

## 31.2a BPS Strategic Indicators (`model=indicators`) — skema terverifikasi

Sumber verifikasi: dokumentasi resmi BPS WebAPI (screenshot user dari
`https://webapi.bps.go.id/documentation/#domain`), dikonfirmasi lengkap
oleh user ("tidak ada filed lain"). Detail:

- Request params: `model` (fixed `'indicators'`), `domain` (WAJIB, Number
  4-digit, "central and province domain" per dokumentasi), `var`
  (opsional, Number, filter ID variabel), `page` (opsional), `lang`
  (opsional, default `'ind'`), `key` (wajib).
- Response: `{ status, "data-availability", data: [ {page,pages,
  per_page,count,total}, [ {title,desc,data_source,value,unit}, ... ] ] }`
  — array 2-elemen di bawah `data`: elemen 0 = metadata pagination,
  elemen 1 = array item indikator.
- `fetchBpsStrategicIndicators({domain, lang, varId, page})` di
  `bps-client.js` memetakan ini APA ADANYA (title/desc/dataSource/value/
  unit) — TIDAK menambah field turunan.

**GAP YANG BELUM TERSELESAIKAN — kode domain nasional/pusat**: dokumentasi
Strategic Indicators cuma bilang `domain` itu "central and province
domain" tanpa menyebutkan nilai spesifik untuk level nasional. Sesi ini
belum pernah melihat halaman dokumentasi "Domain" terpisah (yang di-link
lewat anchor `#domain` di URL yang user kirim). Karena itu:
- `fetchBpsStrategicIndicators()` TIDAK punya default `domain` — caller
  wajib mengoper nilai eksplisit, gagal closed ke `DOMAIN_REQUIRED` kalau
  tidak.
- Sesi berikutnya yang mau memanggil endpoint ini secara live HARUS lebih
  dulu minta user isi konten halaman dokumentasi "Domain" (screenshot),
  atau minta user coba panggil endpoint dengan kode yang mereka yakini
  benar dan kirim balik responsnya — JANGAN menebak (mis. `'0000'` dari
  konvensi umum BPS yang tidak terverifikasi di sesi ini).

## 31.3 Rencana Fase 2+ (JANGAN mulai tanpa prasyarat di bawah terpenuhi)

**Prasyarat mutlak sebelum Fase 2 boleh dimulai** (per CLAUDE.md Aturan #1
— jangan mulai coding parser tanpa ini, walau user sudah tidak sabar):
1. User (manusia) sudah daftar `webapi.bps.go.id/developer` dan kirim
   `BPS_API_KEY` yang valid.
2. User sudah kirim minimal 1 contoh respons JSON REAL dari BPS (hasil
   panggilan Postman/browser mereka sendiri, atau dari discovery endpoint
   `GET /api/economic/bps/datasets` yang sudah dibangun di Fase 1 —
   endpoint itu SEKARANG BISA dites begitu key tersedia, tidak perlu
   nunggu sesi AI berikutnya untuk menjalankannya).
3. Untuk BI: contoh respons SOAP real (SoapUI/Postman terhadap WSDL
   `wskursbi.asmx`) untuk operasi JISDOR dan Kurs Transaksi — ATAU
   konfirmasi eksplisit dari user bahwa BI boleh ditunda dulu (BPS lebih
   prioritas karena cakupannya lebih luas: inflasi, PDB, ekspor-impor,
   tenaga kerja, kemiskinan — semua ada di satu WebAPI, sementara BI cuma
   kurs/JISDOR).

**Urutan kerja Fase 2 setelah prasyarat terpenuhi:**

1. **BPS parser pertama (inflasi)** — pilih SATU indikator dulu (inflasi
   paling sering diminta), jalankan discovery real
   (`bpsListModels('data', ...)` / `bpsListModels('subject', ...)`) untuk
   menemukan `dataset_id`/`var` code yang benar dari respons real (BUKAN
   ditebak dari nama variabel yang "kedengarannya benar"). Tulis
   `fetchBpsIndicator(datasetParams)` di `bps-client.js` yang memetakan
   response real ke field asli (bukan tebakan), lalu
   `normalizeEconomicRecord()` untuk keluarannya. Tambah 1 route:
   `GET /api/economic/bps/inflation`.
2. **Ulangi pola yang sama** untuk PDB, ekspor-impor, tenaga kerja,
   kemiskinan — SATU indikator sekaligus, masing-masing lewat discovery
   real dulu, jangan batch semua sekaligus tanpa verifikasi per-indikator
   (BPS bisa saja punya `dataset_id` beda struktur per topik).
3. **BI JISDOR/Kurs Transaksi** — setelah dapat sampel SOAP real, tulis
   parser XML (app ini belum punya dependency XML parser — cek apakah
   Node's built-in cukup untuk respons SOAP BI yang biasanya flat, atau
   perlu tambah dependency ringan; jangan tambah library besar tanpa
   alasan kuat).
4. **Cache Redis per-indikator** — pola sama seperti
   `lib/invezgo-client.js`'s `getOrFetch()`: TTL sesuai frequency data
   asli (BPS bulanan/kuartalan/tahunan — baca dari metadata dataset,
   JANGAN asumsikan semua bulanan; lihat spec asli user §9). BI (kurs
   harian) TTL lebih pendek.
5. **Dashboard UI** — halaman baru "Indonesia Economic Dashboard"
   (sidebar baru ATAU tab di halaman market-wide yang sudah ada — putuskan
   bareng user saat itu, jangan asumsikan sepihak, sama seperti pola
   AskUserQuestion yang dipakai untuk fitur ikon-info/Net Akumulasi
   sebelumnya di sesi ini). Setiap card WAJIB tampilkan Source/Last
   Updated/Status persis seperti spec asli §19 — pola ini SUDAH ada
   presedennya di app ini (lihat kartu-kartu Invezgo yang sudah
   menampilkan dataSource/updatedAt).
6. **Cross-source validation** (spec §20, kalau BI dan BPS pernah
   tumpang-tindih definisi indikator yang sama) — baru relevan kalau
   kedua provider sudah punya data real untuk indikator yang sama.
7. **Health check UI + test lengkap** — perluas test yang sudah ada di
   Fase 1, tambahkan test per-indikator baru mengikuti pola yang sama
   (fail-without-fix → pass-with-fix, functional test via import real).

## 31.4 Yang JANGAN dilakukan di Fase 2

- Jangan buat tabel Supabase server-side baru untuk `economic_data` tanpa
  keputusan ulang dari user — keputusan 2026-09-28 sudah eksplisit pilih
  Redis/Upstash cache-only, konsisten dengan seluruh app ini.
- Jangan tebak `dataset_id`/`var` code BPS dari nama yang "kedengarannya
  benar" — selalu lewat `bpsListModels()` discovery dulu dengan key real.
- Jangan tulis parser SOAP BI tanpa sampel respons real — kalau user belum
  sempat kirim, BPS saja dulu (cakupannya jauh lebih luas).
- Jangan buat route indikator BPS baru tanpa memverifikasi field mapping
  dari respons real masing-masing — satu indikator, satu verifikasi.

# 32. Sapuan Invarian (menemukan bug yang tidak terlihat saat audit)

Audit membaca kode terbukti meleset: hampir semua bug nyata ditemukan lewat (a) gejala di layar, atau (b) data real
dalam jumlah banyak. `scripts/invariants/` mengotomatiskan (b). Jalankan: `npm run check:invariants` (lihat opsi di
header `scripts/invariants/run.mjs`; exit code 1 bila ada ERROR).

- **Harga Wajar** (`harga-wajar.mjs`): jumlah saham stabil antar tahun, BVPS/PER/PBV masuk akal, tanda EPS = tanda laba,
  tidak ada lonjakan ekuitas 1000x, pengungkapan skala EPS ada. Dijalankan atas sampel ticker dari production.
- **Screener** (`screener.mjs`): rank identik di semua sort, urut Uptrend → Whale → ticker, label whale sesuai skor,
  kolom benar-benar terurut. Dijalankan di 4 urutan sort sekaligus.
- **AI Paper** (`ai-paper.mjs`): urutan operasi acak (modal, buka/tutup, gap SL, reset, panggilan bersamaan) lewat
  fungsi ASLI aplikasi di vm Node, dicek terhadap buku bayangan independen. Ikut `npm test`.
- **Portofolio** (`portfolio.mjs`, mesin dimuat oleh `portfolio-sandbox.mjs`): grid fee/pajak semua sekuritas, XIRR/TWR
  (NPV pada rate hasil harus 0), dan urutan acak `addTx`/`addDiv`/`addRdn`/`applyTxEdit`/`removeTxById` dicek terhadap
  model rata-rata tertimbang independen (jumlah saham, biaya pokok, realized, saldo RDN, AUM, idempotensi rekalkulasi).
  `validateStockLedger()` menolak penjualan melebihi kepemilikan di jalur tambah/ubah/hapus/impor. Ikut `npm test`,
  dan detektornya divalidasi dengan bug yang disuntikkan (fee di atas tarif, tanda RDN terbalik, realized melenceng).
  Definisi biaya pokok posisi saham (`getPortfolio()`): `cost`/`avg`/`unreal`/`ret` memakai uang yang benar-benar dibayar
  TERMASUK fee beli (net), sehingga realized + unrealized = PnL arus kas riil; versi tanpa fee ada di `costGross`/`avgGross`.

ERROR = kontradiksi pasti bug; WARN = tidak lazim tapi bisa sah (split, ROE ekstrem) dan perlu dilihat manusia.
Setiap bug baru yang ditemukan SEBAIKNYA ditambahkan sebagai aturan baru di pemeriksa yang relevan, plus fixture bug
aslinya di `test_suite.js`, supaya kelas bug itu tidak bisa kembali.
