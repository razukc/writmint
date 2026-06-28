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
