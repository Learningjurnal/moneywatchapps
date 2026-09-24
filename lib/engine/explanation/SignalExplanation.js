/**
 * lib/engine/explanation/SignalExplanation.js — deterministic, templated
 * explanation of an already-computed StrategyResult. Per spec: "AI must
 * NOT calculate indicators. AI may only explain deterministic engine
 * results after calculation" — this module IS that explanation layer; it
 * does not call any AI/LLM and does not re-derive numbers, it only
 * describes the numbers the engine already produced.
 */
import { STRATEGY_RESULT_STATUS } from '../types.js';

function explainIndicator(result) {
  if (result.status === 'UNAVAILABLE') {
    return `${result.name}: data tidak tersedia (${result.reason || 'UNAVAILABLE'})`;
  }
  const verdict = result.passed ? 'memenuhi' : 'tidak memenuhi';
  return `${result.name}: ${result.value} (threshold ${result.threshold}) — ${verdict} ambang batas, skor ${result.score}`;
}

function explainStrategyResult(strategyResult) {
  const lines = [];
  switch (strategyResult.status) {
    case STRATEGY_RESULT_STATUS.DATA_INSUFFICIENT:
      lines.push(`DATA_INSUFFICIENT: ${strategyResult.reason}`);
      break;
    case STRATEGY_RESULT_STATUS.REJECT:
      lines.push(`REJECT: ${strategyResult.reason || `FinalScore ${strategyResult.finalScore} di bawah ambang batas WATCH`}`);
      break;
    default:
      lines.push(`${strategyResult.status}: FinalScore ${strategyResult.finalScore}${strategyResult.reason ? ' — ' + strategyResult.reason : ''}`);
  }
  (strategyResult.indicators || []).forEach(r => lines.push(explainIndicator(r)));
  return lines;
}

export { explainIndicator, explainStrategyResult };
