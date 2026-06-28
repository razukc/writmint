import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyManifest, type ManifestVerificationResult } from '../../src/capability-manifest.js';
import type { AttemptResult } from './metrics.js';

export interface AttemptRecord {
  n: number;
  manifest: unknown;
  expected?: { valid: boolean; codes: string[] };
}

export interface Fixture {
  fixtureId: string;
  shape: string;
  skillArm: 'on' | 'off';
  difficulty: string;
  trap: string | null;
  attempts: AttemptRecord[];
}

export interface ReplayResult {
  results: AttemptResult[];
  drift: Array<{
    n: number;
    expected: { valid: boolean; codes: string[] };
    got: { valid: boolean; codes: string[] };
  }>;
}

export function toAttemptResult(v: ManifestVerificationResult): AttemptResult {
  return {
    valid: v.valid,
    errors: v.errors.map((e) => ({ code: e.code, where: e.where })),
  };
}

const sortedCodes = (errs: Array<{ code: string }>) => errs.map((e) => e.code).sort();

export function replayAttempts(attempts: AttemptRecord[]): ReplayResult {
  const results: AttemptResult[] = [];
  const drift: ReplayResult['drift'] = [];
  for (const a of attempts) {
    const v = verifyManifest(a.manifest);
    const r = toAttemptResult(v);
    results.push(r);
    if (a.expected) {
      const got = { valid: r.valid, codes: sortedCodes(r.errors) };
      const exp = { valid: a.expected.valid, codes: [...a.expected.codes].sort() };
      if (got.valid !== exp.valid || JSON.stringify(got.codes) !== JSON.stringify(exp.codes)) {
        drift.push({ n: a.n, expected: exp, got });
      }
    }
  }
  return { results, drift };
}

/** Load a fixture directory containing attempts.json and meta.json. */
export function loadFixture(dir: string): Fixture {
  const attemptsRaw = JSON.parse(readFileSync(join(dir, 'attempts.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  return {
    fixtureId: attemptsRaw.fixtureId,
    shape: meta.shape,
    skillArm: meta.skillArm,
    difficulty: meta.difficulty,
    trap: meta.trap ?? null,
    attempts: attemptsRaw.attempts,
  };
}
