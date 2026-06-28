import { describe, it, expect } from 'vitest';
import { computeConvergence, type AttemptResult } from '../../fixtures/dogfood-corpus/metrics.js';

const refused = (...codes: string[]): AttemptResult => ({
  valid: false,
  errors: codes.map((code) => ({ code, where: '$' })),
});
const accepted: AttemptResult = { valid: true, errors: [] };

describe('computeConvergence', () => {
  it('reports the 1-based index of the first accepted attempt as total round-trips', () => {
    // 05b shape: four refusals then accept = 5
    const results = [refused('a'), refused('b'), refused('c'), refused('d'), accepted];
    expect(computeConvergence(results)).toEqual({ converged: true, totalRoundTrips: 5 });
  });

  it('reports non-convergence when no attempt is accepted', () => {
    const results = [refused('a'), refused('a'), refused('a')];
    expect(computeConvergence(results)).toEqual({ converged: false, totalRoundTrips: null });
  });

  it('counts a first-attempt accept as 1 round-trip', () => {
    expect(computeConvergence([accepted])).toEqual({ converged: true, totalRoundTrips: 1 });
  });
});

import { clusterOf, computeSegments } from '../../fixtures/dogfood-corpus/metrics.js';

describe('clusterOf', () => {
  it('uses the first token for ordinary codes', () => {
    expect(clusterOf('manifest.schema_version')).toBe('manifest');
    expect(clusterOf('string.required')).toBe('string');
    expect(clusterOf('action.permission_ref.unknown')).toBe('action');
    expect(clusterOf('permission.type')).toBe('permission');
  });

  it('keeps the two network sub-namespaces distinct', () => {
    expect(clusterOf('permission.network-dynamic.host_policy')).toBe('permission.network-dynamic');
    expect(clusterOf('permission.network-dynamic.registrable_domain_invalid')).toBe('permission.network-dynamic');
    expect(clusterOf('permission.network.host_denied')).toBe('permission.network');
  });
});

describe('computeSegments', () => {
  it('tracks round-trips and resolution per cluster (05b network-dynamic segment)', () => {
    // attempts 3 and 4 carry network-dynamic codes; attempt 5 (accept) clears them
    const results: AttemptResult[] = [
      { valid: false, errors: [{ code: 'permission.network-dynamic.host_policy', where: '$.permissions[0].hostPolicy' }] },
      { valid: false, errors: [{ code: 'permission.network-dynamic.registrable_domain_invalid', where: '$.permissions[0].hostPolicy.registrableDomain[0]' }] },
      { valid: true, errors: [] },
    ];
    const segs = computeSegments(results);
    expect(segs).toEqual([
      { cluster: 'permission.network-dynamic', roundTripsSpent: 2, resolvedAtAttempt: 3 },
    ]);
  });

  it('reports an unresolved cluster as resolvedAtAttempt null', () => {
    const results: AttemptResult[] = [
      { valid: false, errors: [{ code: 'manifest.schema_version', where: '$.schemaVersion' }] },
      { valid: false, errors: [{ code: 'manifest.schema_version', where: '$.schemaVersion' }] },
    ];
    expect(computeSegments(results)).toEqual([
      { cluster: 'manifest', roundTripsSpent: 2, resolvedAtAttempt: null },
    ]);
  });
});
