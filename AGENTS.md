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

The engine must prefer **NO TRADE** over a low-confidence trade.

---

# 4. AUTONOMOUS TRADING DECISION PIPELINE

The engine must follow this order:

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

**Never bypass a previous stage.**

---

# 5. DATA QUALITY GATE

Before generating any BUY/SELL/HOLD decision, verify:

- ticker exists in valid IDX universe;
- quote timestamp is available;
- OHLCV history is sufficient;
- timeframe is correct;
- price is positive and internally consistent;
- volume is non-negative;
- no impossible OHLC relationship exists;
- broker data has a known source and timestamp;
- fundamental data has a known reporting period;
- corporate-action adjustment state is known;
- data is not beyond the configured freshness threshold.

If a required input is missing or stale:

```text
NO TRADE / BLOCKED
reason = DATA_QUALITY_FAILURE
```

Do not estimate or invent the missing value.

---

# 6. MARKET REGIME ENGINE

The AI must classify the current environment before stock-level decisions.

Minimum regime states:
- BULL_TREND
- BEAR_TREND
- SIDEWAYS
- HIGH_VOLATILITY
- RISK_OFF
- UNKNOWN

Regime evidence may include:
- IHSG trend;
- breadth;
- volatility;
- market volume;
- foreign flow;
- sector rotation;
- index moving averages;
- correlation and dispersion.

If regime is `UNKNOWN`, reduce confidence and do not allow aggressive autonomous entries.

The engine must distinguish:

```text
MARKET REGIME
≠
STOCK SIGNAL
```

A bullish stock signal inside a risk-off market must receive a regime penalty unless evidence justifies the exception.

---

# 7. SIGNAL GENERATION

Candidate signals may use:

### Technical
- trend structure;
- EMA/SMA alignment;
- RSI;
- ATR;
- SuperTrend;
- VWAP;
- support/resistance;
- breakout/retest;
- volume expansion;
- volatility;
- momentum;
- relative strength.

### Broker / Smart Money
- Top 3 broker concentration;
- broker accumulation/distribution;
- foreign net flow;
- foreign inflow streak;
- average broker price;
- unusual broker activity.

### Fundamental
- valuation;
- earnings growth;
- ROE;
- DER;
- cash flow;
- dividend yield;
- margin of safety;
- historical valuation range.

### Market Context
- IHSG regime;
- sector regime;
- liquidity;
- market breadth;
- event/corporate-action risk.

No single indicator is sufficient for autonomous trading.

---

# 8. CONFLUENCE ENGINE

The engine must score independent evidence rather than count duplicate indicators.

Suggested evidence groups:

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
- RSI bullish + MACD bullish is not two independent confirmations if both represent momentum.
- Broker accumulation + foreign inflow is stronger as separate flow evidence.
- Breakout + volume expansion + broker accumulation is stronger than breakout alone.

The engine should output:

```text
confidenceScore
confluenceScore
evidence[]
contradictions[]
missingEvidence[]
```

---

# 9. TRADING HYPOTHESIS

Every autonomous trade candidate must have a structured hypothesis.

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

The hypothesis must be falsifiable.

Bad:
`BUY because the stock looks strong.`

Good:
`BUY because price reclaimed resistance, volume expanded above baseline, broker accumulation increased, and the setup is invalidated if price closes below the defined support.`

---

# 10. ENTRY RULES

Do not enter simply because a stock is bullish.

Entry requires:

1. valid ticker;
2. valid and sufficiently fresh data;
3. acceptable liquidity;
4. defined setup;
5. defined entry zone;
6. defined stop loss;
7. defined target;
8. Risk:Reward >= 1:2 unless an explicitly configured strategy says otherwise;
9. portfolio exposure passes limits;
10. market-regime gate passes;
11. no unresolved critical data contradiction;
12. no duplicate open order/position conflict.

If any mandatory gate fails:

`NO TRADE`.

---

# 11. POSITION SIZING & RISK ENGINE

Default institutional controls:

- risk per trade: approximately 1% of trading capital;
- Big Cap single-stock allocation: maximum 10-15% unless strategy configuration explicitly allows another limit;
- RDN cash buffer: 15-20%;
- minimum Risk:Reward: 1:2;
- never increase position size because confidence is emotionally high;
- never average down automatically unless the strategy explicitly defines it and the risk engine approves it;
- stop loss must be defined before order submission.

Position size must be derived from:

```text
allowedRiskCapital
÷
riskPerShare
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

# 12. EXIT ENGINE

The engine must manage:

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

---

# 13. SELL DECISION

SELL decisions must identify the reason:

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

The AI must analyze the portfolio before opening a new position.

Check:
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

Autonomous execution is disabled by default unless the production gate has been explicitly passed.

Supported modes:

```text
RESEARCH
PAPER
SHADOW
LIVE_GATED
LIVE
```

Default mode:
`PAPER`

Transition to `LIVE_GATED` requires all security, data, financial, testing, and risk gates to pass.

The AI must never silently transition from PAPER to LIVE.

---

# 16. ORDER SAFETY

Before creating an order:

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

Never duplicate financial formulas across:
- UI;
- AI;
- backtester;
- broker adapter;
- portfolio module;
- test suite.

The test suite must validate the production calculation functions rather than merely reproduce the same formula independently.

---

# 18. BACKTESTING RULES

Backtests must clearly identify:

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

A model must not be promoted to autonomous execution based only on high historical accuracy.

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

Expected behaviour:
- lower confidence;
- identify contradiction;
- avoid forced BUY;
- prefer WAIT/NO TRADE if risk is not justified.

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

The audit trail must explain **why the decision happened** and **what data the AI saw at that time**.

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

The agent should operate as a finite-state decision system:

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

---

# 24. TEST HARNESS REQUIREMENTS

The autonomous engine must be tested against at least:

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
- model feature failure.

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

Until then, the correct behaviour is:

`PAPER / SHADOW / NO_TRADE`

---

# 26. CODING AGENT TOKEN-EFFICIENCY PROTOCOL

The coding AI must NOT read the entire repository to solve a local problem.

Use this sequence:

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
- remove stop loss to protect a losing trade;
- submit duplicate orders;
- execute live trading before production gates pass;
- promote an ML model based only on accuracy;
- rewrite production strategy rules from a single trade outcome;
- read the entire repository when local code inspection is sufficient;
- perform unrelated refactors during targeted fixes.

The system must always prefer **data integrity, capital preservation, security, and reproducibility over trade frequency**.
