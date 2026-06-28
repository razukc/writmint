# Dogfood proof corpus — design

**Date:** 2026-06-28
**Status:** Design — approved in brainstorming, pending written-spec review
**Type:** Measurement harness + fixture corpus (new code: one deterministic harness; no changes to `src/`)

## Problem

The positioning reframe (shipped 2026-06-28, `docs/positioning.md`) rests on a behavioral
premise that is **empirically untested in shipping products**: that an AI agent, given Writmint's
structured rejections, converges on an approvable manifest in a bounded number of round-trips —
without a person writing the manifest. Today the evidence is a single data point, dogfood pass 05b
(`fixtures/url-health-check-no-skill-rerun/`): a skill-disabled agent reached an accepted
`network-dynamic` manifest in 5 total attempts, the hard host-policy segment taking 2–3 of them.

One happy path proves nothing. This corpus turns that anecdote into a measured series whose design
can **disconfirm** the premise as readily as confirm it. That is the entire point.

## Governing principle (non-negotiable)

**The metrics layer never relaxes its rigor to flatter the thesis.** A harness that can only ever
report good numbers proves nothing. The deterministic core must be able to emit a *bad* result
loudly — a FAIL that is recorded as a FAIL, a corpus verdict that says "disconfirmed" when the data
says so. We do not step back from this, because only by keeping it can the corpus actually prove
(or kill) the thesis. Every design choice below serves that.

## Architecture: the honesty mechanism

The harness **does not trust transcribed rejections.** Each fixture stores its attempt sequence as
machine-readable data (`attempts.json`: an ordered array of manifest drafts). At run time the
harness feeds each draft through the **live `verifyManifest()`** (`src/capability-manifest.ts:623`,
signature `verifyManifest(input: unknown): { valid: boolean; errors: ManifestError[]; warnings:
ManifestWarning[] }`) and re-derives the rejection, round-trip count, and error codes from the real
validator — never from what a person wrote down.

This is the strict-replay philosophy of Pillar 4 applied to authoring: a recorded attempt that no
longer reproduces its recorded outcome (because the validator changed) surfaces as **drift**, not a
silent stale pass. It also means the metrics cannot be massaged — the numbers come from the
validator, not the prose. That is what lets the harness emit a bad result loudly.

**Convergence** = `verifyManifest()` returns `valid: true` (zero `errors`). Warnings are tracked
and reported but do **not** block convergence (they are advisory by design in the validator).

## File structure

```
fixtures/dogfood-corpus/
  <fixture-name>/
    attempts.json     # ordered manifest drafts — the data the harness replays
    ATTEMPTS.md       # human-readable transcript (existing 05b convention, kept)
    meta.json         # { shape, difficulty, skillArm, trap, notes }
  run-corpus.ts       # deterministic harness: replays every fixture, emits metrics + verdict
  RESULTS.md          # generated metrics table + corpus verdict (committed artifact)
```

- Runs via `tsx` under `tsconfig.fixtures.json` (the fixtures compiler config), the same way the
  other fixtures and demos run. Add an npm script `dogfood:corpus` → `tsx
  fixtures/dogfood-corpus/run-corpus.ts`.
- `attempts.json` schema (per fixture): `{ fixtureId: string, attempts: Array<{ n: number,
  manifest: unknown }> }`. `manifest` is the raw draft as the agent produced it (may be structurally
  invalid — that is the point).
- `meta.json` schema: `{ shape: string, difficulty: "structural" | "semantic-trap", skillArm:
  "on" | "off", trap: string | null, notes: string }`.
- 05b is migrated in as the first fixture: its five attempts (read verbatim from
  `fixtures/url-health-check-no-skill-rerun/ATTEMPTS.md`) become `attempts.json`; `meta.json` =
  `{ shape: "network-dynamic", difficulty: "semantic-trap", skillArm: "off", trap: "wildcard-domain",
  notes: "original dogfood pass 05b" }`.

## Metrics and verdict logic (pre-declared, un-retrofittable)

Declared here, before any run, so no threshold can be retrofitted to a result.

**Per fixture:**
- **Headline — total round-trips to ACCEPTED:** the count of attempts until the first `valid: true`.
  The un-gameable top-line. (05b = 5.)
- **Segment breakdown:** group each attempt's error codes by namespace cluster (the dotted prefix:
  `manifest.*`, `string.*`, `action.*`, `permission.*`, `permission.network-dynamic.*`, …). A
  segment is "resolved" at the first attempt where every code in its cluster has disappeared. Report
  round-trips spent per cluster, so total convergence decomposes into *where* the effort went
  (structural boilerplate vs. the semantic lesson).

**Per-fixture verdict:**
- **PASS** — converges within **N = 8** total round-trips.
- **FLAG** — converges but exceeds N = 8 round-trips.
- **FAIL** — does not converge by the end of the recorded sequence, OR oscillates: the same
  `(code, where)` pair recurs **3+ times** while the count of distinct outstanding codes does not
  strictly decrease across those recurrences (plateau/thrash). A FAIL is **recorded as a FAIL and
  never retried into a pass.**

**Corpus-level kill condition:**
- If skill-OFF convergence is **materially worse** than skill-ON across the corpus — operationalized
  as: skill-off median total round-trips ≥ 2× skill-on median, OR any shape that PASSes skill-on but
  FAILs skill-off — then the thesis ("the structured contract is the value, not the prose guidance")
  is **disconfirmed for that shape/corpus**, and `RESULTS.md` states it in the summary rather than
  burying it. The skill-off arm is load-bearing; 05b was a skill-off run, which is why it mattered.

**Drift:** if any recorded attempt's re-derived `verifyManifest()` result differs from what the
fixture's `ATTEMPTS.md` recorded (different codes, or accepted-vs-refused flips), the harness reports
**DRIFT** for that fixture and the run is non-green until reconciled. Drift is information (the
validator moved under a recorded run), not a failure to hide.

## Scope (breadth × difficulty × skill-arm)

**Breadth — one fixture per manifest shape the contract supports:**
network · network-dynamic · storage · ui · clock · audit · destructive/two-person · multi-permission.

**Difficulty traps — fixtures deliberately seeded with mistakes the fixHints are meant to catch:**
- wildcard-domain (05b already covers this for network-dynamic)
- copy-paste-the-example (the reason the un-copy-pasteable `<your-domain>` convention exists —
  see [[project_network_dynamic_shipped]])
- overscoping (declaring more than the action uses)
- mutually-exclusive fields (`hosts` vs. `hostPolicy` on the two network shapes)

**Skill arm:** every fixture is captured twice — authoring-skill ON vs. OFF — as separate fixtures
distinguished by `meta.skillArm`. The skill-off arm is the one that can disconfirm the thesis.

## Out of scope (YAGNI)

- **Automated agent-driving.** This spec does NOT build a loop that calls a real agent API against
  the live validator and auto-emits `attempts.json`. That is the "upgrade later" half of hybrid
  approach C. This spec builds the deterministic replay/metrics harness, the fixture format, the 05b
  migration, and the initial fixtures with **semi-manually captured** attempts. The harness is
  designed so an automated driver can later produce `attempts.json` in the same schema **without
  changing what is measured** — the metrics layer is the stable contract.
- **No changes to `src/`.** The harness consumes `verifyManifest()` as a black box. If a fixture
  reveals a weak fixHint or a validator bug, that is a finding recorded in `RESULTS.md` and handled
  as its own change — not folded into this spec.
- No dashboard, no CI gate, no historical trend storage. `RESULTS.md` is a single committed snapshot
  regenerated on demand.

## What a disconfirming result looks like (stated up front)

The corpus is built to make these visible, not to avoid them:
- A shape where total round-trips balloon past N = 8 → a weak or missing fixHint for that shape.
- A trap fixture that converges only by the agent eventually guessing, with the offending code
  recurring → the structured rejection *blocks* but does not *teach*.
- Skill-off materially worse than skill-on → the value is in the prose skill, not the structured
  contract → the positioning's core claim is wrong and must be revisited. We will say so in
  `RESULTS.md` and in memory, not quietly drop it.

## Success criteria

- `npm run dogfood:corpus` replays every fixture through the live `verifyManifest()` and writes a
  `RESULTS.md` whose per-fixture headline, segment breakdown, verdict, and corpus-level skill-delta
  are all derived from the validator, not from transcripts.
- 05b reproduces as a PASS (5 round-trips, network-dynamic, skill-off) — establishing the harness
  agrees with the known anchor before any new fixture is trusted.
- A deliberately broken fixture (a manifest sequence that never reaches `valid: true`) is reported
  as FAIL, proving the harness can emit a bad result. (This is a harness self-test, not a corpus
  member.)
- The corpus verdict section names the kill condition explicitly and reports whether it fired.

## References

- `docs/positioning.md` — the premise this corpus tests ("The premise this rests on").
- `docs/superpowers/specs/2026-06-26-author-time-gate-reframe-design.md` — the reframe that deferred
  this corpus to its own spec.
- Pass 05b: `fixtures/url-health-check-no-skill-rerun/ATTEMPTS.md` (the anchor, migrated in as
  fixture #1).
- `src/capability-manifest.ts:623` — `verifyManifest()`, the replay seam.
- Memory: [[project_positioning_reframe_shipped]], [[project_network_dynamic_shipped]].
