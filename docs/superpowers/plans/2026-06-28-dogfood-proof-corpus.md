# Dogfood Proof Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic harness that replays recorded manifest-authoring attempt sequences through the live `verifyManifest()`, computes per-fixture convergence metrics and a corpus verdict, and writes a committed `RESULTS.md` — built so a disconfirming result surfaces loudly.

**Architecture:** A small pure-function metrics core (convergence, segment breakdown, verdict, corpus kill-condition) that operates on a normalized `AttemptResult[]`, plus a thin replay layer that turns each fixture's recorded manifest drafts into `AttemptResult[]` by calling the real `verifyManifest()` from `src/`. All harness code lives under `fixtures/dogfood-corpus/` (no `src/` changes); unit tests live under `tests/unit/` and import the harness modules directly. The metrics core is the honesty-critical part and is heavily unit-tested before any integration.

**Tech Stack:** TypeScript (ESM), vitest (unit tests), tsx (runner), Node ≥ 22. No new dependencies.

## Global Constraints

Copied from the spec (`docs/superpowers/specs/2026-06-28-dogfood-proof-corpus-design.md`). Every task implicitly includes these:

- **No changes to `src/`.** The harness consumes `verifyManifest()` as a black box. A weak fixHint or validator bug found via a fixture is a finding recorded in `RESULTS.md`, handled as its own separate change — never folded into this work.
- **The metrics layer never relaxes rigor to flatter the thesis.** It must be able to emit a FAIL recorded as a FAIL, and a corpus verdict that says "disconfirmed" when the data says so. No threshold may be softened to make a result pass.
- **Convergence = `verifyManifest()` returns `valid: true` (zero `errors`).** Warnings are tracked and reported but never block convergence.
- **Pre-declared thresholds (un-retrofittable):** PASS ≤ **8** total round-trips; FLAG if converges but > 8; FAIL if never converges OR oscillates (same `(code, where)` recurs **3+** times without the count of distinct outstanding codes strictly decreasing across those recurrences). A FAIL is recorded as FAIL, never retried into a pass.
- **Corpus kill condition:** skill-off median total round-trips ≥ **2×** skill-on median, OR any shape that PASSes skill-on but FAILs skill-off → thesis disconfirmed for that shape/corpus; `RESULTS.md` states it in the summary.
- **Real data only.** Fixture attempt sequences must come from real agent-capture sessions or the migrated 05b transcript. Never fabricate manifest attempts — invented data defeats the corpus. (The single synthetic fixture allowed is the harness self-test in Task 6, explicitly labelled a self-test and excluded from corpus aggregation.)
- **No Anthropic footer in commit messages** (standing user preference).
- **Branch:** all commits land on `feat/dogfood-proof-corpus` (already checked out).

**Key types from `src/` (consume, do not redefine):**
- `verifyManifest(input: unknown): ManifestVerificationResult` — `src/capability-manifest.ts:623`. Import in fixtures as `from '../../src/capability-manifest.js'`.
- `interface ManifestVerificationResult { valid: boolean; errors: ManifestError[]; warnings: ManifestWarning[] }`.
- `ManifestError` / `ManifestWarning` are both `StructuredError = { code: string; where: string; expected: string; actual: string; fixHint: string }` (`src/errors.ts`).

---

## File Structure

- **Create:** `fixtures/dogfood-corpus/metrics.ts` — pure metrics core: `AttemptResult` type, `computeConvergence`, `computeSegments`, `computeVerdict`, `computeCorpusVerdict`. One responsibility: turn result sequences into numbers and verdicts. No I/O, no `src/` imports.
- **Create:** `fixtures/dogfood-corpus/replay.ts` — fixture I/O + live replay: `loadFixture`, `replayFixture` (calls `verifyManifest`), drift detection. The only file that touches the filesystem and `src/`.
- **Create:** `fixtures/dogfood-corpus/run-corpus.ts` — the runner: load all fixtures, replay, aggregate, write `RESULTS.md`. Thin orchestration over the two modules above.
- **Create:** `fixtures/dogfood-corpus/<fixture>/attempts.json`, `meta.json`, `ATTEMPTS.md` — the corpus data (05b migrated in Task 6).
- **Create (generated):** `fixtures/dogfood-corpus/RESULTS.md` — committed metrics snapshot.
- **Create:** `tests/unit/dogfood-corpus-metrics.test.ts` — unit tests for the pure core (Tasks 1–4).
- **Create:** `tests/unit/dogfood-corpus-replay.test.ts` — unit tests for loader + drift (Task 5).
- **Modify:** `package.json` — add `"dogfood:corpus": "tsx fixtures/dogfood-corpus/run-corpus.ts"` to scripts.

Order rationale: the pure metrics core (Tasks 1–4) is honesty-critical and has zero dependencies, so it is built and fully tested first. Replay (Task 5) integrates with `src/`. The runner + real 05b data + the FAIL self-test (Task 6) come last, when every piece it wires already passes its own tests.

---

### Task 1: Metrics core — convergence and round-trip count

**Files:**
- Create: `fixtures/dogfood-corpus/metrics.ts`
- Test: `tests/unit/dogfood-corpus-metrics.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `export interface AttemptResult { valid: boolean; errors: Array<{ code: string; where: string }> }` — the normalized per-attempt result every metrics function operates on.
  - `export interface Convergence { converged: boolean; totalRoundTrips: number | null }`
  - `export function computeConvergence(results: AttemptResult[]): Convergence` — `totalRoundTrips` is the 1-based index of the first `valid:true` attempt (so 05b, accepted on its 5th attempt, yields 5); `converged:false, totalRoundTrips:null` if no attempt is valid.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dogfood-corpus-metrics.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: FAIL — cannot resolve `../../fixtures/dogfood-corpus/metrics.js` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `fixtures/dogfood-corpus/metrics.ts`:

```ts
/**
 * Pure metrics core for the dogfood proof corpus. No I/O, no src/ imports.
 * Operates on normalized AttemptResult sequences so the same logic serves
 * unit tests (synthetic results) and the live runner (verifyManifest output).
 */

export interface AttemptResult {
  valid: boolean;
  errors: Array<{ code: string; where: string }>;
}

export interface Convergence {
  converged: boolean;
  totalRoundTrips: number | null;
}

/**
 * Total round-trips = the 1-based position of the first accepted attempt.
 * 05b accepts on its 5th attempt → 5. Null when nothing converges.
 */
export function computeConvergence(results: AttemptResult[]): Convergence {
  const idx = results.findIndex((r) => r.valid);
  if (idx === -1) return { converged: false, totalRoundTrips: null };
  return { converged: true, totalRoundTrips: idx + 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add fixtures/dogfood-corpus/metrics.ts tests/unit/dogfood-corpus-metrics.test.ts
git commit -m "feat(dogfood-corpus): convergence + round-trip metric"
```

---

### Task 2: Metrics core — segment breakdown by code cluster

**Files:**
- Modify: `fixtures/dogfood-corpus/metrics.ts`
- Test: `tests/unit/dogfood-corpus-metrics.test.ts` (append)

**Interfaces:**
- Consumes: `AttemptResult` (Task 1).
- Produces:
  - `export interface SegmentReport { cluster: string; roundTripsSpent: number; resolvedAtAttempt: number | null }`
  - `export function clusterOf(code: string): string` — the cluster rule (see below).
  - `export function computeSegments(results: AttemptResult[]): SegmentReport[]` — one entry per distinct cluster that ever appears, sorted by first appearance. `roundTripsSpent` = number of attempts (from the cluster's first appearance) in which any code of that cluster is still present. `resolvedAtAttempt` = 1-based index of the first attempt where the cluster has fully disappeared (null if still present in the last attempt).

**Cluster rule (concretizes the spec's "namespace cluster" — deterministic):** `clusterOf(code)` returns the code's **first dotted token**, EXCEPT when the code begins with `permission.network.` or `permission.network-dynamic.`, in which case it returns the **first two tokens** (`permission.network` or `permission.network-dynamic`). This preserves the 05b host-policy signal (`permission.network-dynamic.host_policy` and `permission.network-dynamic.registrable_domain_invalid` cluster together, distinct from generic `permission.type`) while keeping every other family (`manifest`, `string`, `action`, `permission`) as a single first-token cluster.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/dogfood-corpus-metrics.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: FAIL — `clusterOf` / `computeSegments` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `fixtures/dogfood-corpus/metrics.ts`:

```ts
export interface SegmentReport {
  cluster: string;
  roundTripsSpent: number;
  resolvedAtAttempt: number | null;
}

/**
 * Cluster = first dotted token, except the two network sub-namespaces which
 * use their first two tokens so the host-policy lesson stays distinct from
 * generic permission errors.
 */
export function clusterOf(code: string): string {
  const parts = code.split('.');
  if (parts[0] === 'permission' && (parts[1] === 'network' || parts[1] === 'network-dynamic')) {
    return `${parts[0]}.${parts[1]}`;
  }
  return parts[0] ?? code;
}

export function computeSegments(results: AttemptResult[]): SegmentReport[] {
  const clustersByAttempt = results.map(
    (r) => new Set(r.errors.map((e) => clusterOf(e.code)))
  );
  const firstSeen = new Map<string, number>();
  clustersByAttempt.forEach((set, i) => {
    for (const c of set) if (!firstSeen.has(c)) firstSeen.set(c, i);
  });

  const reports: SegmentReport[] = [];
  for (const [cluster, start] of firstSeen) {
    let roundTripsSpent = 0;
    let resolvedAtAttempt: number | null = null;
    for (let i = start; i < clustersByAttempt.length; i++) {
      if (clustersByAttempt[i].has(cluster)) {
        roundTripsSpent++;
      } else {
        resolvedAtAttempt = i + 1;
        break;
      }
    }
    reports.push({ cluster, roundTripsSpent, resolvedAtAttempt });
  }
  // sort by first appearance for stable, readable output
  reports.sort((a, b) => (firstSeen.get(a.cluster)! - firstSeen.get(b.cluster)!));
  return reports;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add fixtures/dogfood-corpus/metrics.ts tests/unit/dogfood-corpus-metrics.test.ts
git commit -m "feat(dogfood-corpus): segment breakdown by code cluster"
```

---

### Task 3: Metrics core — per-fixture verdict and oscillation

**Files:**
- Modify: `fixtures/dogfood-corpus/metrics.ts`
- Test: `tests/unit/dogfood-corpus-metrics.test.ts` (append)

**Interfaces:**
- Consumes: `AttemptResult`, `computeConvergence` (Tasks 1–2).
- Produces:
  - `export type VerdictKind = 'PASS' | 'FLAG' | 'FAIL';`
  - `export interface Verdict { kind: VerdictKind; totalRoundTrips: number | null; reason: string }`
  - `export const ROUND_TRIP_CEILING = 8;`
  - `export function detectOscillation(results: AttemptResult[]): boolean` — true when some `(code, where)` pair appears in **3+** attempts while the count of distinct outstanding `(code, where)` pairs does not strictly decrease across those recurrences (plateau/thrash).
  - `export function computeVerdict(results: AttemptResult[]): Verdict` — FAIL if `detectOscillation` is true or it never converges; else FLAG if `totalRoundTrips > ROUND_TRIP_CEILING`; else PASS.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/dogfood-corpus-metrics.test.ts`:

```ts
import { computeVerdict, detectOscillation, ROUND_TRIP_CEILING } from '../../fixtures/dogfood-corpus/metrics.js';

const err = (code: string, where: string) => ({ valid: false, errors: [{ code, where }] });
const ok = { valid: true, errors: [] };

describe('detectOscillation', () => {
  it('flags the same (code, where) recurring 3+ times without distinct-count dropping', () => {
    const results: AttemptResult[] = [
      err('permission.type', '$.permissions[0].type'),
      err('permission.type', '$.permissions[0].type'),
      err('permission.type', '$.permissions[0].type'),
    ];
    expect(detectOscillation(results)).toBe(true);
  });

  it('does not flag steady progress even if a code repeats twice', () => {
    // 05b: codes change and outstanding count trends down to zero
    const results: AttemptResult[] = [
      { valid: false, errors: [{ code: 'manifest.schema_version', where: '$.schemaVersion' }, { code: 'string.required', where: '$.title' }] },
      { valid: false, errors: [{ code: 'permission.type', where: '$.permissions[0].type' }] },
      ok,
    ];
    expect(detectOscillation(results)).toBe(false);
  });
});

describe('computeVerdict', () => {
  it('PASS when it converges within the ceiling', () => {
    const results = [err('a', '$'), err('b', '$'), ok];
    expect(computeVerdict(results)).toMatchObject({ kind: 'PASS', totalRoundTrips: 3 });
  });

  it('FLAG when it converges but exceeds the ceiling', () => {
    const results: AttemptResult[] = [];
    for (let i = 0; i < ROUND_TRIP_CEILING; i++) results.push(err(`c${i}`, `$.${i}`));
    results.push(ok); // accepts on attempt CEILING+1
    expect(computeVerdict(results)).toMatchObject({ kind: 'FLAG' });
  });

  it('FAIL when it never converges', () => {
    expect(computeVerdict([err('a', '$'), err('b', '$')])).toMatchObject({ kind: 'FAIL' });
  });

  it('FAIL on oscillation even though it could converge later', () => {
    const results = [err('x', '$.p'), err('x', '$.p'), err('x', '$.p'), ok];
    expect(computeVerdict(results)).toMatchObject({ kind: 'FAIL' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: FAIL — `computeVerdict` / `detectOscillation` / `ROUND_TRIP_CEILING` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `fixtures/dogfood-corpus/metrics.ts`:

```ts
export type VerdictKind = 'PASS' | 'FLAG' | 'FAIL';

export interface Verdict {
  kind: VerdictKind;
  totalRoundTrips: number | null;
  reason: string;
}

export const ROUND_TRIP_CEILING = 8;

const keyOf = (e: { code: string; where: string }) => `${e.code} ${e.where}`;

/**
 * Oscillation = a (code, where) pair that recurs in 3+ attempts while the
 * number of distinct outstanding pairs never strictly decreases across those
 * recurrences. That is the thrash/plateau signature: the agent keeps hitting
 * the same rejection without making net progress.
 */
export function detectOscillation(results: AttemptResult[]): boolean {
  const counts = new Map<string, number>();
  for (const r of results) {
    for (const e of r.errors) counts.set(keyOf(e), (counts.get(keyOf(e)) ?? 0) + 1);
  }
  const distinctOutstanding = results.map((r) => new Set(r.errors.map(keyOf)).size);
  for (const [key, n] of counts) {
    if (n < 3) continue;
    // attempts where this key is present
    const present = results
      .map((r, i) => (r.errors.some((e) => keyOf(e) === key) ? i : -1))
      .filter((i) => i >= 0);
    let strictlyDecreased = false;
    for (let j = 1; j < present.length; j++) {
      if (distinctOutstanding[present[j]] < distinctOutstanding[present[j - 1]]) {
        strictlyDecreased = true;
        break;
      }
    }
    if (!strictlyDecreased) return true;
  }
  return false;
}

export function computeVerdict(results: AttemptResult[]): Verdict {
  const { converged, totalRoundTrips } = computeConvergence(results);
  if (detectOscillation(results)) {
    return { kind: 'FAIL', totalRoundTrips, reason: 'oscillation: a rejection recurred without net progress' };
  }
  if (!converged) {
    return { kind: 'FAIL', totalRoundTrips: null, reason: 'never reached an accepted manifest' };
  }
  if ((totalRoundTrips as number) > ROUND_TRIP_CEILING) {
    return { kind: 'FLAG', totalRoundTrips, reason: `converged but exceeded ceiling of ${ROUND_TRIP_CEILING}` };
  }
  return { kind: 'PASS', totalRoundTrips, reason: `converged in ${totalRoundTrips} round-trips` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: PASS (all metrics tests).

- [ ] **Step 5: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add fixtures/dogfood-corpus/metrics.ts tests/unit/dogfood-corpus-metrics.test.ts
git commit -m "feat(dogfood-corpus): per-fixture verdict + oscillation detection"
```

---

### Task 4: Metrics core — corpus aggregation and kill condition

**Files:**
- Modify: `fixtures/dogfood-corpus/metrics.ts`
- Test: `tests/unit/dogfood-corpus-metrics.test.ts` (append)

**Interfaces:**
- Consumes: `Verdict`, `VerdictKind` (Task 3).
- Produces:
  - `export interface FixtureSummary { fixtureId: string; shape: string; skillArm: 'on' | 'off'; verdict: Verdict }`
  - `export interface CorpusVerdict { killConditionFired: boolean; reason: string; skillOnMedian: number | null; skillOffMedian: number | null }`
  - `export function median(xs: number[]): number | null`
  - `export function computeCorpusVerdict(summaries: FixtureSummary[]): CorpusVerdict` — fires the kill condition when skill-off median total round-trips ≥ 2× skill-on median, OR any `shape` that is PASS on skill-on but FAIL on skill-off. Medians use only converged fixtures (numeric `totalRoundTrips`).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/dogfood-corpus-metrics.test.ts`:

```ts
import { computeCorpusVerdict, median, type FixtureSummary } from '../../fixtures/dogfood-corpus/metrics.js';

const summary = (
  fixtureId: string, shape: string, skillArm: 'on' | 'off',
  kind: 'PASS' | 'FLAG' | 'FAIL', totalRoundTrips: number | null
): FixtureSummary => ({ fixtureId, shape, skillArm, verdict: { kind, totalRoundTrips, reason: '' } });

describe('median', () => {
  it('handles odd and even lengths and empty', () => {
    expect(median([5])).toBe(5);
    expect(median([1, 3])).toBe(2);
    expect(median([])).toBe(null);
  });
});

describe('computeCorpusVerdict', () => {
  it('does not fire when skill-off is comparable to skill-on', () => {
    const cv = computeCorpusVerdict([
      summary('net-on', 'network', 'on', 'PASS', 3),
      summary('net-off', 'network', 'off', 'PASS', 4),
    ]);
    expect(cv.killConditionFired).toBe(false);
  });

  it('fires when skill-off median is >= 2x skill-on median', () => {
    const cv = computeCorpusVerdict([
      summary('a-on', 'network', 'on', 'PASS', 2),
      summary('b-off', 'network', 'off', 'PASS', 5),
    ]);
    expect(cv.killConditionFired).toBe(true);
  });

  it('fires when a shape passes skill-on but fails skill-off', () => {
    const cv = computeCorpusVerdict([
      summary('s-on', 'storage', 'on', 'PASS', 3),
      summary('s-off', 'storage', 'off', 'FAIL', null),
    ]);
    expect(cv.killConditionFired).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: FAIL — `computeCorpusVerdict` / `median` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `fixtures/dogfood-corpus/metrics.ts`:

```ts
export interface FixtureSummary {
  fixtureId: string;
  shape: string;
  skillArm: 'on' | 'off';
  verdict: Verdict;
}

export interface CorpusVerdict {
  killConditionFired: boolean;
  reason: string;
  skillOnMedian: number | null;
  skillOffMedian: number | null;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function computeCorpusVerdict(summaries: FixtureSummary[]): CorpusVerdict {
  const rt = (arm: 'on' | 'off') =>
    summaries
      .filter((s) => s.skillArm === arm && typeof s.verdict.totalRoundTrips === 'number')
      .map((s) => s.verdict.totalRoundTrips as number);
  const skillOnMedian = median(rt('on'));
  const skillOffMedian = median(rt('off'));

  // per-shape PASS(on) -> FAIL(off) regression
  const shapes = new Set(summaries.map((s) => s.shape));
  for (const shape of shapes) {
    const on = summaries.find((s) => s.shape === shape && s.skillArm === 'on');
    const off = summaries.find((s) => s.shape === shape && s.skillArm === 'off');
    if (on?.verdict.kind === 'PASS' && off?.verdict.kind === 'FAIL') {
      return {
        killConditionFired: true,
        reason: `shape "${shape}" passes skill-on but FAILs skill-off — value is in the prose skill, not the structured contract`,
        skillOnMedian,
        skillOffMedian,
      };
    }
  }

  if (skillOnMedian !== null && skillOffMedian !== null && skillOffMedian >= 2 * skillOnMedian) {
    return {
      killConditionFired: true,
      reason: `skill-off median (${skillOffMedian}) >= 2x skill-on median (${skillOnMedian}) — thesis disconfirmed for this corpus`,
      skillOnMedian,
      skillOffMedian,
    };
  }

  return {
    killConditionFired: false,
    reason: 'skill-off convergence comparable to skill-on; thesis not disconfirmed by this corpus',
    skillOnMedian,
    skillOffMedian,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts`
Expected: PASS (all metrics tests, Tasks 1–4).

- [ ] **Step 5: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add fixtures/dogfood-corpus/metrics.ts tests/unit/dogfood-corpus-metrics.test.ts
git commit -m "feat(dogfood-corpus): corpus aggregation + kill condition"
```

---

### Task 5: Replay layer — load fixtures and run live verifyManifest with drift detection

**Files:**
- Create: `fixtures/dogfood-corpus/replay.ts`
- Test: `tests/unit/dogfood-corpus-replay.test.ts`

**Interfaces:**
- Consumes: `AttemptResult` (Task 1); `verifyManifest`, `ManifestVerificationResult` from `../../src/capability-manifest.js`.
- Produces:
  - `export interface AttemptRecord { n: number; manifest: unknown; expected?: { valid: boolean; codes: string[] } }` — one recorded draft; `expected` is the outcome captured at recording time, used for drift detection.
  - `export interface Fixture { fixtureId: string; shape: string; skillArm: 'on' | 'off'; difficulty: string; trap: string | null; attempts: AttemptRecord[] }`
  - `export interface ReplayResult { results: AttemptResult[]; drift: Array<{ n: number; expected: { valid: boolean; codes: string[] }; got: { valid: boolean; codes: string[] } }> }`
  - `export function toAttemptResult(v: ManifestVerificationResult): AttemptResult` — narrows verifyManifest output to the metrics core's `{ valid, errors:[{code,where}] }`.
  - `export function replayAttempts(attempts: AttemptRecord[]): ReplayResult` — runs each `manifest` through the live `verifyManifest`, collects `AttemptResult[]`, and records drift wherever a recorded `expected` disagrees with the live result (compared on `valid` and the sorted set of `code`s).

**Note (realizes the spec's drift requirement):** the spec's `attempts.json` schema is extended with an optional `expected` per attempt so drift is machine-checkable — without a recorded outcome there is nothing to detect drift against. Fixtures lacking `expected` simply produce no drift entries.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dogfood-corpus-replay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toAttemptResult, replayAttempts, type AttemptRecord } from '../../fixtures/dogfood-corpus/replay.js';

describe('toAttemptResult', () => {
  it('narrows a verifyManifest result to code+where pairs', () => {
    const v = {
      valid: false,
      errors: [{ code: 'manifest.schema_version', where: '$.schemaVersion', expected: '1', actual: 'undefined', fixHint: 'x' }],
      warnings: [],
    };
    expect(toAttemptResult(v)).toEqual({
      valid: false,
      errors: [{ code: 'manifest.schema_version', where: '$.schemaVersion' }],
    });
  });
});

describe('replayAttempts', () => {
  it('runs drafts through the live validator and converges on a valid manifest', () => {
    // a minimal but actually-valid manifest accepted by the live verifyManifest
    const validManifest = {
      schemaVersion: 1,
      id: 'ops.noop',
      title: 'Noop',
      version: '0.1.0',
      description: 'A pure action that does nothing external at all, for testing.',
      permissions: [],
      actions: [
        {
          id: 'noop',
          description: 'Do nothing and return an empty object, purely for tests.',
          handler: 'noop',
          destructive: false,
          permissions: [],
          input: { type: 'object', properties: {}, required: [] },
          output: { type: 'object', properties: {}, required: [] },
        },
      ],
      implementation: { type: 'module', entry: './impl.js' },
    };
    const attempts: AttemptRecord[] = [
      { n: 1, manifest: { id: 'ops.noop' } }, // structurally incomplete -> refused
      { n: 2, manifest: validManifest },       // -> accepted
    ];
    const { results, drift } = replayAttempts(attempts);
    expect(results[0].valid).toBe(false);
    expect(results[1].valid).toBe(true);
    expect(drift).toEqual([]); // no expected blocks -> no drift
  });

  it('records drift when a recorded expected disagrees with the live result', () => {
    const attempts: AttemptRecord[] = [
      { n: 1, manifest: { id: 'ops.noop' }, expected: { valid: true, codes: [] } }, // lie: it is actually invalid
    ];
    const { drift } = replayAttempts(attempts);
    expect(drift).toHaveLength(1);
    expect(drift[0].n).toBe(1);
    expect(drift[0].got.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dogfood-corpus-replay.test.ts`
Expected: FAIL — `../../fixtures/dogfood-corpus/replay.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `fixtures/dogfood-corpus/replay.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/dogfood-corpus-replay.test.ts`
Expected: PASS (3 tests). If the "valid manifest" test fails because the live validator rejects it, read the reported error codes and adjust the test manifest to satisfy them — the validator is the source of truth, never edit `src/` to make the test pass.

- [ ] **Step 5: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add fixtures/dogfood-corpus/replay.ts tests/unit/dogfood-corpus-replay.test.ts
git commit -m "feat(dogfood-corpus): live-replay layer with drift detection"
```

---

### Task 6: Runner — migrate 05b, emit RESULTS.md, npm script, FAIL self-test

**Files:**
- Create: `fixtures/dogfood-corpus/run-corpus.ts`
- Create: `fixtures/dogfood-corpus/url-health-check-no-skill/attempts.json`, `meta.json`, `ATTEMPTS.md`
- Create: `fixtures/dogfood-corpus/_selftest-never-converges/attempts.json`, `meta.json`
- Create (generated): `fixtures/dogfood-corpus/RESULTS.md`
- Modify: `package.json` (add `dogfood:corpus` script)

**Interfaces:**
- Consumes: everything from Tasks 1–5 (`loadFixture`, `replayAttempts`, `computeVerdict`, `computeSegments`, `computeConvergence`, `computeCorpusVerdict`, `FixtureSummary`).
- Produces: a runnable corpus and a committed `RESULTS.md`. No later task depends on it.

- [ ] **Step 1: Migrate 05b into the corpus**

Create `fixtures/dogfood-corpus/url-health-check-no-skill/attempts.json` by transcribing the five manifest drafts from `fixtures/url-health-check-no-skill-rerun/ATTEMPTS.md` (read that file). Structure:

```json
{
  "fixtureId": "url-health-check-no-skill",
  "attempts": [
    { "n": 1, "manifest": { "id": "ops.url-health-check", "version": "0.1.0", "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.", "capabilities": [ { "kind": "net.http", "reason": "Issue GET requests to user-supplied URLs" }, { "kind": "clock", "reason": "Measure request latency in milliseconds" } ], "actions": [ { "id": "check", "description": "Issue a GET to the supplied URL and return status code and latency in ms", "destructive": false, "input": { "type": "object", "properties": { "url": { "type": "string", "format": "uri" } }, "required": ["url"] }, "output": { "type": "object", "properties": { "status": { "type": "integer" }, "latencyMs": { "type": "number" } }, "required": ["status", "latencyMs"] } } ] } },
    { "n": 2, "manifest": { "schemaVersion": 1, "id": "ops.url-health-check", "title": "URL Health Check", "version": "0.1.0", "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.", "permissions": [ { "id": "http-get", "kind": "net.http", "reason": "Issue GET requests to user-supplied URLs" }, { "id": "clock", "kind": "clock", "reason": "Measure request latency in milliseconds" } ], "actions": [ { "id": "check", "description": "Issue a GET to the supplied URL and return status code and latency in ms", "handler": "checkUrl", "destructive": false, "permissions": ["http-get", "clock"], "input": { "type": "object", "properties": { "url": { "type": "string", "format": "uri" } }, "required": ["url"] }, "output": { "type": "object", "properties": { "status": { "type": "integer" }, "latencyMs": { "type": "number" } }, "required": ["status", "latencyMs"] } } ], "implementation": { "type": "module", "entry": "./impl.js" } } },
    { "n": 3, "manifest": { "schemaVersion": 1, "id": "ops.url-health-check", "title": "URL Health Check", "version": "0.1.0", "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.", "permissions": [ { "id": "http-get", "type": "network-dynamic", "reason": "Issue GET requests to user-supplied URLs provided at call time" }, { "id": "clock", "type": "clock", "reason": "Measure request latency in milliseconds" } ], "actions": [ { "id": "check", "description": "Issue a GET to the supplied URL and return status code and latency in ms", "handler": "checkUrl", "destructive": false, "permissions": ["http-get", "clock"], "input": { "type": "object", "properties": { "url": { "type": "string", "format": "uri" } }, "required": ["url"] }, "output": { "type": "object", "properties": { "status": { "type": "integer" }, "latencyMs": { "type": "number" } }, "required": ["status", "latencyMs"] } } ], "implementation": { "type": "module", "entry": "./impl.js" } } },
    { "n": 4, "manifest": { "schemaVersion": 1, "id": "ops.url-health-check", "title": "URL Health Check", "version": "0.1.0", "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.", "permissions": [ { "id": "http-get", "type": "network-dynamic", "reason": "Issue GET requests to user-supplied URLs provided at call time", "hostPolicy": { "registrableDomain": ["*"] } }, { "id": "clock", "type": "clock", "reason": "Measure request latency in milliseconds" } ], "actions": [ { "id": "check", "description": "Issue a GET to the supplied URL and return status code and latency in ms", "handler": "checkUrl", "destructive": false, "permissions": ["http-get", "clock"], "input": { "type": "object", "properties": { "url": { "type": "string", "format": "uri" } }, "required": ["url"] }, "output": { "type": "object", "properties": { "status": { "type": "integer" }, "latencyMs": { "type": "number" } }, "required": ["status", "latencyMs"] } } ], "implementation": { "type": "module", "entry": "./impl.js" } } },
    { "n": 5, "manifest": { "schemaVersion": 1, "id": "ops.url-health-check", "title": "URL Health Check", "version": "0.1.0", "description": "Checks the health of a user-supplied URL by issuing a GET request and reporting the HTTP status code and elapsed latency in milliseconds.", "permissions": [ { "id": "http-get", "type": "network-dynamic", "reason": "Issue GET requests to user-supplied URLs provided at call time", "hostPolicy": { "registrableDomain": ["example.com"] } }, { "id": "clock", "type": "clock", "reason": "Measure request latency in milliseconds" } ], "actions": [ { "id": "check", "description": "Issue a GET to the supplied URL and return status code and latency in ms", "handler": "checkUrl", "destructive": false, "permissions": ["http-get", "clock"], "input": { "type": "object", "properties": { "url": { "type": "string", "format": "uri" } }, "required": ["url"] }, "output": { "type": "object", "properties": { "status": { "type": "integer" }, "latencyMs": { "type": "number" } }, "required": ["status", "latencyMs"] } } ], "implementation": { "type": "module", "entry": "./impl.js" } } }
  ]
}
```

Create `fixtures/dogfood-corpus/url-health-check-no-skill/meta.json`:

```json
{ "shape": "network-dynamic", "difficulty": "semantic-trap", "skillArm": "off", "trap": "wildcard-domain", "notes": "original dogfood pass 05b, migrated 2026-06-28" }
```

Create `fixtures/dogfood-corpus/url-health-check-no-skill/ATTEMPTS.md` as a one-line pointer (the full transcript already lives in the original fixture):

```markdown
# url-health-check (no-skill) — migrated 05b

Machine-readable drafts in `attempts.json`. Full human transcript with the
structured rejection at each step: `fixtures/url-health-check-no-skill-rerun/ATTEMPTS.md`.
```

Note: `attempts.json` here deliberately carries **no `expected` blocks** — the recorded codes live in the original transcript, and omitting `expected` means the runner reports whatever the *current* validator produces without asserting it matches mid-2026. Convergence (4 refusals → accept = 5) is what this fixture asserts.

- [ ] **Step 2: Create the harness self-test fixture (proves the harness can FAIL)**

Create `fixtures/dogfood-corpus/_selftest-never-converges/attempts.json` — a sequence that never reaches a valid manifest:

```json
{
  "fixtureId": "_selftest-never-converges",
  "attempts": [
    { "n": 1, "manifest": { "id": "broken" } },
    { "n": 2, "manifest": { "id": "broken" } },
    { "n": 3, "manifest": { "id": "broken" } }
  ]
}
```

Create `fixtures/dogfood-corpus/_selftest-never-converges/meta.json`:

```json
{ "shape": "_selftest", "difficulty": "structural", "skillArm": "off", "trap": null, "notes": "harness self-test: must be reported FAIL; excluded from corpus aggregation" }
```

The runner (Step 3) treats any fixture whose directory name starts with `_selftest` as a self-test: it is replayed and its verdict asserted, but it is excluded from `computeCorpusVerdict`.

- [ ] **Step 3: Write the runner**

Create `fixtures/dogfood-corpus/run-corpus.ts`:

```ts
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixture, replayAttempts } from './replay.js';
import {
  computeConvergence,
  computeSegments,
  computeVerdict,
  computeCorpusVerdict,
  type FixtureSummary,
} from './metrics.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function fixtureDirs(): string[] {
  return readdirSync(HERE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(HERE, d.name, 'attempts.json')))
    .map((d) => d.name)
    .sort();
}

function main(): void {
  const corpusSummaries: FixtureSummary[] = [];
  const lines: string[] = [];
  let driftCount = 0;
  let selftestOk = true;

  lines.push('# Dogfood proof corpus — results', '');
  lines.push('Generated by `npm run dogfood:corpus`. Numbers come from the live `verifyManifest()`.', '');

  for (const name of fixtureDirs()) {
    const isSelftest = name.startsWith('_selftest');
    const fx = loadFixture(join(HERE, name));
    const { results, drift } = replayAttempts(fx.attempts);
    const conv = computeConvergence(results);
    const segs = computeSegments(results);
    const verdict = computeVerdict(results);
    driftCount += drift.length;

    lines.push(`## ${fx.fixtureId}${isSelftest ? ' (self-test)' : ''}`);
    lines.push(`- shape: ${fx.shape} · skill: ${fx.skillArm} · difficulty: ${fx.difficulty} · trap: ${fx.trap ?? 'none'}`);
    lines.push(`- verdict: **${verdict.kind}** — ${verdict.reason}`);
    lines.push(`- total round-trips: ${conv.totalRoundTrips ?? 'did not converge'}`);
    lines.push('- segments:');
    for (const s of segs) {
      lines.push(`  - \`${s.cluster}\`: ${s.roundTripsSpent} round-trip(s), resolved at attempt ${s.resolvedAtAttempt ?? 'never'}`);
    }
    if (drift.length > 0) {
      lines.push(`- ⚠️ DRIFT on ${drift.length} attempt(s): the live validator disagrees with the recorded outcome.`);
    }
    lines.push('');

    if (isSelftest) {
      if (verdict.kind !== 'FAIL') selftestOk = false;
    } else {
      corpusSummaries.push({ fixtureId: fx.fixtureId, shape: fx.shape, skillArm: fx.skillArm, verdict });
    }
  }

  const cv = computeCorpusVerdict(corpusSummaries);
  lines.push('## Corpus verdict', '');
  lines.push(`- skill-on median round-trips: ${cv.skillOnMedian ?? 'n/a'}`);
  lines.push(`- skill-off median round-trips: ${cv.skillOffMedian ?? 'n/a'}`);
  lines.push(`- kill condition fired: **${cv.killConditionFired ? 'YES' : 'no'}** — ${cv.reason}`);
  lines.push(`- total drift across corpus: ${driftCount}`);
  lines.push('');

  writeFileSync(join(HERE, 'RESULTS.md'), lines.join('\n'), 'utf8');

  // Console summary + non-zero exit on a broken invariant, so the runner is CI-honest.
  console.log(`Corpus: ${corpusSummaries.length} fixture(s); kill condition ${cv.killConditionFired ? 'FIRED' : 'not fired'}; drift ${driftCount}.`);
  if (!selftestOk) {
    console.error('SELF-TEST FAILED: a _selftest fixture did not report FAIL. The harness cannot be trusted to emit bad results.');
    process.exit(1);
  }
}

main();
```

- [ ] **Step 4: Add the npm script**

In `package.json`, add to the `scripts` block (after the `mcp` line):

```json
    "dogfood:corpus": "tsx fixtures/dogfood-corpus/run-corpus.ts",
```

- [ ] **Step 5: Run the corpus and verify the honest outcome**

Run: `npm run dogfood:corpus`
Expected console output: `Corpus: 1 fixture(s); kill condition not fired; drift <N>.` and exit code 0 (the self-test reported FAIL as required). Then inspect `fixtures/dogfood-corpus/RESULTS.md`:
- `url-health-check-no-skill` verdict is **PASS** with **total round-trips: 5**, and a `permission.network-dynamic` segment resolved at attempt 5.
- `_selftest-never-converges` verdict is **FAIL**.

If `url-health-check-no-skill` does NOT converge at 5 (e.g. the current validator now accepts an earlier attempt, or rejects attempt 5), do NOT adjust the data to force 5 — record the actual number, and note any drift the runner reports. A changed number is a real finding about the validator, exactly what the harness exists to surface. Report it in the task report rather than hiding it.

Run the unit suites too, to confirm nothing regressed:
Run: `npx vitest run tests/unit/dogfood-corpus-metrics.test.ts tests/unit/dogfood-corpus-replay.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Confirm no source code was touched**

```bash
cd C:/code/playground/extensions/runtime
git status --porcelain
git diff --stat HEAD -- src
```
Expected: changes only under `fixtures/dogfood-corpus/`, `tests/unit/`, and `package.json`. No output from the `src` diff.

- [ ] **Step 7: Commit**

```bash
cd C:/code/playground/extensions/runtime
git add fixtures/dogfood-corpus/ package.json
git commit -m "feat(dogfood-corpus): runner, 05b migration, RESULTS.md, FAIL self-test"
```

---

## Out of scope for THIS plan (operational, not code)

Capturing the **breadth × difficulty × skill-arm** fixtures (network, storage, ui, clock, audit, destructive/two-person, multi-permission; plus the copy-paste-example / overscoping / mutually-exclusive-fields traps) requires **real agent-capture sessions** — driving an actual agent against the live validator and recording its genuine attempts. A coding subagent must not fabricate these: invented attempt sequences would make the corpus measure fiction and destroy the honesty premise (Global Constraints: "Real data only"). This plan delivers the measuring instrument, validates it against the one real data point we have (05b), and proves it can emit a FAIL. Populating the full corpus is ongoing operational work, each fixture added via its own capture session in the established `attempts.json` / `meta.json` format.

---

## Self-Review

**1. Spec coverage:**
- Honesty mechanism (replay through live `verifyManifest`, drift) → Task 5 + Task 6 runner.
- Convergence = zero errors → Task 1 (`computeConvergence`), Global Constraints.
- Headline total round-trips → Task 1; segment breakdown by cluster → Task 2.
- Verdict PASS/FLAG/FAIL + oscillation (3+, no distinct-count decrease) → Task 3.
- Corpus kill condition (2× median, or PASS-on→FAIL-off) → Task 4.
- Drift reporting → Task 5 (`replayAttempts`) + runner surfacing.
- File structure (`metrics.ts`, `replay.ts`, `run-corpus.ts`, fixture format, `RESULTS.md`) → Tasks 1–6.
- 05b migrated as fixture #1 → Task 6 Step 1.
- Harness self-test that proves a FAIL can be emitted → Task 6 Step 2 + Step 5 exit-code guard.
- `npm run dogfood:corpus` success criterion → Task 6 Step 4–5.
- "No `src/` changes" → Global Constraints + Task 6 Step 6 guard.
- Breadth/difficulty/skill-arm fixtures → explicitly deferred (Out of scope section), matching the spec's "semi-manually captured … initial fixtures" and the real-data constraint.

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code; every test step shows the actual assertions; the 05b data is given in full. Clear.

**3. Type consistency:** `AttemptResult` (Task 1) is the single input type threaded through Tasks 2–4 and produced by `toAttemptResult` in Task 5. `Verdict`/`VerdictKind` (Task 3) feed `FixtureSummary` (Task 4) used by the runner (Task 6). `ROUND_TRIP_CEILING` defined once (Task 3) and referenced in tests, not re-literal'd. `computeConvergence`/`computeSegments`/`computeVerdict`/`computeCorpusVerdict`/`loadFixture`/`replayAttempts`/`toAttemptResult` names are identical across their definition and call sites. Consistent.

**Note on the drift schema:** the spec's `attempts.json` is `{ fixtureId, attempts:[{n, manifest}] }`; the plan adds an OPTIONAL `expected` per attempt (Task 5) so drift is machine-checkable. This is a strict superset — fixtures without `expected` (like the migrated 05b) behave exactly as the spec describes and simply produce no drift entries. Flagged here as a deliberate concretization of the spec's drift requirement.
