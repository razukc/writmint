import { describe, it, expect } from 'vitest';
import { runCorpus, corpusExitDecision } from '../../fixtures/dogfood-corpus/run-corpus.js';
import type { Fixture } from '../../fixtures/dogfood-corpus/replay.js';

// A structurally-incomplete draft the live verifyManifest() refuses. We pair it
// with an `expected: { valid: true }` block that lies — the recorded outcome
// disagrees with the live result, which is exactly what "drift" means.
const driftingFixture: Fixture = {
  fixtureId: 'unit-drift',
  shape: 'network',
  skillArm: 'off',
  difficulty: 'structural',
  trap: null,
  attempts: [
    { n: 1, manifest: { id: 'broken' }, expected: { valid: true, codes: [] } },
  ],
};

const cleanFixture: Fixture = {
  fixtureId: 'unit-clean',
  shape: 'network',
  skillArm: 'off',
  difficulty: 'structural',
  trap: null,
  attempts: [
    // no `expected` block -> no drift possible, regardless of validity
    { n: 1, manifest: { id: 'broken' } },
  ],
};

describe('runCorpus drift guard', () => {
  it('counts drift when a recorded expected disagrees with the live validator', () => {
    const r = runCorpus([driftingFixture]);
    expect(r.driftCount).toBeGreaterThan(0);
    // drift alone must make the run non-green (the spec: non-green until reconciled)
    const decision = corpusExitDecision(r);
    expect(decision.code).toBe(1);
    expect(decision.messages.join('\n')).toContain('DRIFT DETECTED');
    // a drift with no _selftest fixture must NOT be masked as a self-test failure
    expect(r.selftestOk).toBe(true);
    expect(decision.messages.join('\n')).not.toContain('SELF-TEST FAILED');
    // the artifact still records the drift loudly
    expect(r.resultsMarkdown).toContain('DRIFT');
  });

  it('a clean corpus (no drift, no bad self-test) exits zero', () => {
    const r = runCorpus([cleanFixture]);
    expect(r.driftCount).toBe(0);
    expect(r.selftestOk).toBe(true);
    expect(corpusExitDecision(r).code).toBe(0);
  });

  it('reports drift and a passing self-test independently (neither overrides the other)', () => {
    // _selftest that correctly FAILs (never converges) -> selftestOk stays true,
    // while a separate drifting fixture trips the drift guard. Both signals coexist.
    const selftestThatFails: Fixture = {
      fixtureId: '_selftest-never-converges',
      shape: 'n/a',
      skillArm: 'off',
      difficulty: 'structural',
      trap: null,
      attempts: [
        { n: 1, manifest: { id: 'broken' } },
        { n: 2, manifest: { id: 'broken' } },
      ],
    };
    const r = runCorpus([selftestThatFails, driftingFixture]);
    expect(r.selftestOk).toBe(true); // the self-test correctly FAILed
    expect(r.driftCount).toBeGreaterThan(0); // drift still detected
    expect(corpusExitDecision(r).code).toBe(1);
  });
});
