/**
 * lib/economic-data-engine.js
 * Indonesia Economic Data Engine — orchestrates lib/providers/bi-client.js
 * and lib/providers/bps-client.js behind one unified schema, mirroring
 * lib/idx-data-engine.js's role for the IDX/Invezgo/Yahoo side of this app.
 *
 * STATUS (2026-09-28): scaffolding only. No provider below can return
 * verified real economic data yet (see the STATUS notes at the top of
 * bi-client.js and bps-client.js for exactly why — a blocked sandbox
 * proxy and a missing BPS_API_KEY, not a design gap). What's here is
 * genuinely finished and tested: the unified record schema, honest
 * status semantics, and the combined health check — the "data" endpoints
 * built on top (server.js) currently just surface NOT_CONFIGURED/
 * UNAVAILABLE/not_verified, which is the correct behavior until a human
 * supplies real credentials + a captured sample response.
 */

import { checkBiLiveStatus } from './providers/bi-client.js';
import { checkBpsLiveStatus, bpsListModels } from './providers/bps-client.js';

// Unified per-record schema (feature spec §10/§11). `status` is one of:
// VERIFIED | CACHED | STALE | UNAVAILABLE | ERROR — never invented outside
// this set. `value` must be a real number from the source; this function
// does not fill in 0 for missing values — callers must check `status`
// before trusting `value`.
function normalizeEconomicRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('normalizeEconomicRecord(): raw record is required');
  }
  const allowedStatus = ['VERIFIED', 'CACHED', 'STALE', 'UNAVAILABLE', 'ERROR'];
  const status = allowedStatus.includes(raw.status) ? raw.status : 'ERROR';

  return {
    provider: raw.provider || null,
    dataset: raw.dataset || raw.dataset_id || null,
    indicator: raw.indicator || null,
    indicator_code: raw.indicator_code || null,
    value: (status === 'VERIFIED' || status === 'CACHED' || status === 'STALE') ? (typeof raw.value === 'number' ? raw.value : null) : null,
    unit: raw.unit || null,
    period: raw.period || null,
    frequency: raw.frequency || null,
    geography: raw.geography || null,
    source: raw.source || null,
    source_type: raw.source_type || null,
    source_url: raw.source_url || null,
    retrieved_at: raw.retrieved_at || null,
    published_at: raw.published_at || null,
    status
  };
}

// GET /api/economic/health — spec §24. Combines BI + BPS provider health
// (each already returns configured/status/message honestly — see the
// two provider files) plus latency measured here at the orchestration
// layer, since the providers' own checks don't time themselves.
async function getEconomicHealth() {
  const t0 = Date.now();
  const [biResult, bpsResult] = await Promise.allSettled([
    checkBiLiveStatus(),
    checkBpsLiveStatus()
  ]);

  const toHealthEntry = (settled) => {
    if (settled.status !== 'fulfilled') {
      return { status: 'ERROR', last_error: settled.reason ? String(settled.reason.message || settled.reason) : 'unknown error' };
    }
    const r = settled.value;
    return {
      status: r.status,
      source_verified: r.configured === true && (r.status === 'ACTIVE' || r.status === 'REACHABLE'),
      last_error: (r.status === 'UNAVAILABLE' || r.status === 'ERROR') ? r.message : null,
      message: r.message
    };
  };

  return {
    BI: toHealthEntry(biResult),
    BPS: toHealthEntry(bpsResult),
    latency_ms: Date.now() - t0,
    checked_at: new Date().toISOString()
  };
}

// GET /api/economic/bps/datasets — dataset discovery (spec §7). Raw BPS
// response passed through unmodified (schemaVerified:false) — see
// bpsListModels()'s own comment for why no field mapping happens yet.
async function discoverBpsDatasets(model, domain) {
  return bpsListModels(model, domain);
}

export {
  normalizeEconomicRecord,
  getEconomicHealth,
  discoverBpsDatasets
};
