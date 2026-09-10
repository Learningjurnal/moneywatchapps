# MoneyWatchPro — Financial Policy

**Document status:** DRAFT — Financial Owner Approval Required  
**Version:** 1.0.0-draft  
**Scope:** MoneyWatchPro AI analysis, backtesting, paper trading, and future live trading  
**Authority:** Financial Owner / Strategy Owner  

> This document is the single source of truth for financial rules used by the application. Engineering must implement these rules as written and must not silently change financial thresholds. Values marked **PROVISIONAL** are proposed defaults for owner review and are NOT approval to enable live trading.

---

## 1. Core Principles

1. **No fabricated financial data may drive a live financial decision.**
2. REAL, STALE, UNAVAILABLE, SIMULATION, and INVALID data states must remain distinguishable end-to-end.
3. If a decision-critical input is unavailable, the system must prefer **NO_TRADE / BLOCKED** over estimation.
4. Backtests must not silently substitute simulated values for missing market data.
5. All financial calculations must use one canonical implementation shared by UI, AI, backtest, portfolio, and execution layers.
6. Every BUY/SELL decision must be explainable from the data snapshot, strategy rules, risk rules, and model version used at decision time.
7. Risk-management rules take priority over generic HOLD recommendations for existing positions.
8. A model, strategy, or provider must never override hard financial risk limits.

---

## 2. Trading Modes

| Mode | Financial authority | Real order allowed | Synthetic data allowed |
|---|---|---:|---:|
| RESEARCH | Analytics only | No | Yes, explicitly labeled |
| PAPER | Simulated execution | No | Only when explicitly marked |
| SHADOW | Observe live signals | No | No for decision-critical data |
| LIVE_GATED | Live-capable after all gates | Only after server-side gates | No |
| LIVE | Production execution | Yes | No |

**Default mode: PAPER.**

Simulation is permitted for research/testing only. A SIMULATION data object must never reach a LIVE order decision.

---

## 3. Data Quality Policy

### 3.1 Canonical states

- **REAL:** Provider returned validated live/current or valid historical data.
- **STALE:** Previously valid data exists but exceeds the configured freshness threshold.
- **UNAVAILABLE:** Required provider/data could not be obtained.
- **SIMULATION:** Synthetic/generated research data.
- **INVALID:** Data failed schema, ticker, timestamp, numeric, or consistency validation.

### 3.2 Live decision rule

For a **new position entry**:

```text
REAL + VALID + FRESH → eligible for strategy evaluation
STALE              → BLOCKED
UNAVAILABLE        → BLOCKED
SIMULATION         → BLOCKED
INVALID            → BLOCKED
```

For an **existing position**:

```text
REAL + VALID + FRESH → normal risk management
STALE/UNAVAILABLE   → RISK_MANAGEMENT_DEGRADED; no invented price
SIMULATION/INVALID  → BLOCKED from normal pricing; use only validated emergency controls
```

If an emergency exit is required but executable market information cannot be validated, the system must report **EXECUTION_RISK** rather than inventing a price.

---

## 4. Decision-Critical Data by Strategy

| Strategy | Price/OHLCV | Volume | Broker | Foreign Flow | Fundamentals |
|---|---:|---:|---:|---:|---:|
| Technical | REQUIRED | REQUIRED | Optional | Optional | Optional |
| Smart Money / Bandarmology | REQUIRED | REQUIRED | REQUIRED | REQUIRED when strategy rule uses it | Optional |
| Value / Graham / DCF | REQUIRED | Optional | Optional | Optional | REQUIRED |
| Dividend Compounder | REQUIRED | Optional | Optional | Optional | REQUIRED |
| Hybrid AI | REQUIRED | REQUIRED | REQUIRED where selected features require it | REQUIRED where selected features require it | REQUIRED where selected features require it |

If a strategy declares a field REQUIRED and that field is unavailable, the strategy must return **NO_TRADE / BLOCKED**, not a guessed score.

---

## 5. Transaction Fees and Taxes — Indonesia

The canonical trading-cost model is:

### BUY

```text
Buy Cost = Broker Fee
         + Levy (BEI/KPEI/KSEI) 0.043%
         + PPN (11% × Broker Fee)
```

### SELL

```text
Sell Cost = Broker Fee
          + Levy (BEI/KPEI/KSEI) 0.043%
          + PPN (11% × Broker Fee)
          + PPh Final Penjualan Saham 0.1% × Gross Sell Value
```

Broker fee rates are provider/account specific and must be configurable. The application must not hard-code a broker-specific fee as universal market policy.

Dividend tax treatment must be implemented according to the applicable Indonesian tax rules and the user's selected tax/account profile. Do not assume a universal 0% dividend tax treatment without validating the applicable rule.

---

## 6. Order and Lot Rules

1. IDX lot size: **100 shares per lot**, subject to current exchange rules.
2. Quantity submitted for trading must be a valid lot quantity unless the applicable market rule explicitly permits otherwise.
3. Price must comply with the applicable IDX tick-size band.
4. The execution layer must revalidate price, quantity, market status, cash, and position limits immediately before order submission.
5. Duplicate order protection and idempotency are mandatory.

---

## 7. Portfolio Risk Policy

The following are **PROVISIONAL — OWNER APPROVAL REQUIRED**:

| Rule | Proposed default | Owner decision |
|---|---:|---|
| Maximum single Big Cap position | 10–15% | ☐ Approve ☐ Change |
| Minimum RDN/cash buffer | 15–20% | ☐ Approve ☐ Change |
| Minimum Risk:Reward | 1:2 | ☐ Approve ☐ Change |
| Maximum portfolio drawdown gate | 15% | ☐ Approve ☐ Change |
| Maximum concurrent new positions | 10 | ☐ Approve ☐ Change |
| Maximum capital at risk per trade | 1% of portfolio | ☐ Approve ☐ Change |

**Hard limits must be enforced server-side.** AI-generated recommendations cannot override them.

---

## 8. Entry Policy

A BUY signal must pass all applicable gates:

```text
Authenticated user
        ↓
Correct trading mode
        ↓
Market open / executable
        ↓
Valid ticker
        ↓
Required data REAL + FRESH
        ↓
Strategy conditions satisfied
        ↓
No contradiction / fatal data-quality issue
        ↓
Risk:Reward ≥ configured minimum
        ↓
Position concentration within limit
        ↓
Cash/RDN buffer maintained
        ↓
Quantity valid for IDX lot/tick rules
        ↓
Fees/taxes included in expected economics
        ↓
Duplicate/idempotency check passes
        ↓
BUY eligible
```

Failure of any hard gate = **NO_TRADE**.

---

## 9. Exit Policy

For an existing position, the priority order is:

1. Emergency/risk exit
2. Stop-loss / maximum-loss rule
3. Take-profit / strategy exit
4. Thesis invalidation
5. Portfolio risk rebalance
6. Normal HOLD

A generic HOLD response must not suppress a validated risk exit.

---

## 10. AI Signal Policy

AI may:

- analyze market data;
- rank opportunities;
- formulate hypotheses;
- identify contradictions;
- generate explanations;
- propose entries/exits within policy;
- learn from historical outcomes through the approved analytics pipeline.

AI may NOT:

- invent missing prices, broker flow, foreign flow, fundamentals, or portfolio balances;
- bypass risk limits;
- change transaction-cost assumptions silently;
- change production strategy thresholds autonomously;
- promote a model directly into production without the model-governance gate;
- place a live order when a mandatory data/risk gate fails.

---

## 11. Backtest Financial Integrity

Every backtest must record:

- provider/source;
- data timestamp and freshness;
- universe;
- timeframe;
- strategy version;
- model version;
- fee/tax assumptions;
- slippage assumption;
- corporate-action treatment;
- position-sizing rule;
- cash constraints;
- entry/exit rules;
- test period;
- train/validation/test split where applicable.

Backtests must prevent look-ahead bias and data leakage.

A financial backtest must **BLOCK** if required REAL historical data is unavailable rather than silently switching to synthetic values.

---

## 12. ML / AI Model Promotion Policy

Model promotion thresholds below are **PROVISIONAL — OWNER APPROVAL REQUIRED**.

### Minimum proposed gates

| Metric | Proposed gate | Owner decision |
|---|---:|---|
| OOS Profit Factor | ≥ 1.30 | ☐ Approve ☐ Change |
| OOS Win Rate | ≥ 55% | ☐ Approve ☐ Change |
| Maximum Drawdown | ≤ 15% | ☐ Approve ☐ Change |
| Minimum Risk:Reward | ≥ 1:2 | ☐ Approve ☐ Change |
| Minimum OOS trades | ≥ 100 | ☐ Approve ☐ Change |
| Champion improvement | ≥ 0% after costs | ☐ Approve ☐ Change |

Statistical metrics such as accuracy/AUC are supplementary. **Economic performance after fees, taxes, and realistic execution assumptions is mandatory.**

Promotion flow:

```text
Train
  ↓
Leakage / data-quality checks
  ↓
Validation
  ↓
Walk-forward / OOS evaluation
  ↓
Economic backtest after costs
  ↓
Compare Champion vs Challenger
  ↓
Shadow observation
  ↓
Approval gates
  ↓
Promote
```

The retraining workflow must never automatically commit an unvalidated model directly as the production Champion.

---

## 13. NO_TRADE Conditions

The system must return **NO_TRADE / BLOCKED** for a new entry when any applicable condition occurs:

- required market data unavailable;
- required data stale beyond policy threshold;
- simulated data is being used;
- invalid ticker/security;
- market halted or not executable;
- insufficient cash;
- cash buffer violation;
- position concentration violation;
- risk/reward below minimum;
- contradictory/fatal signal state;
- missing required broker/foreign/fundamental data;
- corporate-action state cannot be safely resolved;
- provider/API failure for decision-critical data;
- model/feature validation failure;
- duplicate order detected;
- financial calculation validation failure.

---

## 14. Required Audit Trail

For every generated trading decision, record at minimum:

```text
user_id
mode
symbol
decision
strategy
strategy_version
model_version
data_provider
source_status
source_timestamp
decision_timestamp
price_snapshot
required_data_status
signal_components
risk_checks
fee_assumptions
tax_assumptions
position_before
position_after
cash_before
cash_after
reason_codes
```

The audit trail must be immutable or tamper-evident to the extent supported by the production architecture.

---

## 15. Financial Policy Change Control

Any change to the following requires Financial Owner approval before production deployment:

- fee/tax assumptions;
- risk limits;
- position limits;
- cash buffer;
- entry/exit thresholds;
- strategy requirements;
- model promotion thresholds;
- data-provider hierarchy for decision-critical data;
- definition of REAL/STALE/UNAVAILABLE;
- backtest assumptions;
- slippage assumptions;
- corporate-action treatment.

Engineering may refactor implementation without approval only when the observable financial behavior remains equivalent and automated regression tests prove equivalence.

---

## 16. Owner Approval Checklist

### Financial policy

- [ ] Maximum position size approved
- [ ] RDN/cash buffer approved
- [ ] Maximum capital-at-risk approved
- [ ] Maximum portfolio drawdown approved
- [ ] Risk:Reward minimum approved
- [ ] Maximum concurrent positions approved

### AI / ML

- [ ] Minimum OOS win rate approved
- [ ] Minimum Profit Factor approved
- [ ] Maximum drawdown for model approved
- [ ] Minimum OOS sample size approved
- [ ] Champion-vs-Challenger promotion rule approved

### Data

- [ ] Decision-critical data by strategy approved
- [ ] REAL/STALE/UNAVAILABLE behavior approved
- [ ] Synthetic-data restriction approved
- [ ] Provider hierarchy approved

### Execution

- [ ] Fee/tax model approved
- [ ] Slippage assumption approved
- [ ] IDX lot/tick implementation verified
- [ ] Emergency exit behavior approved

---

## 17. Implementation Requirement

This document must be treated as a **policy contract**, not merely documentation. The production code should expose one canonical financial-policy module and automated tests should verify that the implementation matches this document.

No autonomous LIVE trading should be enabled while any mandatory owner-approved financial policy remains unresolved.

---

**Approval status:** `DRAFT / NOT YET APPROVED FOR LIVE TRADING`
