# Findings from dogfood pass 06 — multi-error payload verification

**Date:** 2026-05-28
**Subject:** general-purpose subagent, deliberately writing a manifest violating 5 orthogonal rules to measure validator behavior.
**Target:** `ops.multi-fail-test` — contrived capability; the violations are the experiment.

## Headline: pipeline-level short-circuit; both stages internally exhaustive

The hook script runs `validateCapabilityManifest()` (structural) and only if that passes runs `hardenManifest()` (semantic rules). Each stage internally collects all violations before returning. The pipeline boundary between them is fail-fast.

**Implication:** an N-violation manifest produces *at most one round-trip per stage* — not N round-trips. A first-draft manifest with 1 structural error and 4 hardening errors costs 2 round-trips (structural-only first, then hardening-only).

## Pass 06: 1 structural + 4 hardening violations → 1 error in deny payload

The manifest violated:
1. `semver.invalid` (structural)
2. `permission.network.host_wildcard` (hardening)
3. `permission.storage.scope_wildcard` (hardening)
4. `permission.reason.too_short` (hardening)
5. `action.description.too_short` (hardening)

Hook returned exactly one error — the structural one. The four hardening violations were not reached because `validateCapabilityManifest` failed first and `tools/dogfood/validate-on-write.ts:75-77` short-circuits the pipeline before hardening runs.

```json
{
  "errors": [
    {
      "code": "semver.invalid",
      "where": "$.version",
      "expected": "semver string (e.g. \"0.1.0\")",
      "actual": "\"1\"",
      "fixHint": "Use semantic versioning: MAJOR.MINOR.PATCH."
    }
  ]
}
```

Telemetry confirms: exactly 1 new line, exactly `semver.invalid`.

## Pass 06b (fast follow-up): 5 hardening-only violations → 5 errors in deny payload

Same fixture pattern but with structurally-valid surrounding fields. The 5 deliberate violations were all hardening rules:

1. `permission.reason.too_short` on permissions[0]
2. `permission.network.host_wildcard` on permissions[0].hosts[0]
3. `permission.reason.too_short` on permissions[1]
4. `permission.storage.scope_wildcard` on permissions[1].scope
5. `action.description.too_short` on actions[0]

Hook returned **all 5** errors in a single deny payload. Telemetry confirms: 5 lines, single timestamp burst.

Ordering is per-target grouped (`permissions[0]` errors, then `permissions[1]` errors, then `actions[0]` errors) — a single traversal pass collecting violations, not five sequential rule passes.

## Cross-reference: pass 05 evidence

Pass 05 (skill-disabled author) saw 8 errors in its round-1 deny payload — every one a structural violation. That corroborates today's finding: the structural validator is internally exhaustive.

## AI-DX implication

For a fresh-draft manifest with N independent violations:
- **All structural:** 1 round-trip (current architecture handles this well).
- **All hardening:** 1 round-trip (also handled well).
- **Mix of K structural + (N-K) hardening:** 2 round-trips minimum (one for each stage).

This is much better than the worst-case fail-fast assumption from pass 06's initial observation. The cost ceiling is 2, not N.

**There's still a small leverage opportunity**: combining the stages so a single Write returns both structural and hardening violations in one payload would drop the ceiling from 2 to 1. The trade-off is that hardening checks assume structural validity, so running hardening on a structurally-broken manifest could raise lower-quality errors (e.g. crash trying to inspect `permissions[0].hosts` on a manifest where `permissions` isn't an array). A safer variant: run hardening on the *structurally-valid subtrees* of the manifest, skipping subtrees that failed structural validation. Implementation cost may not be worth the 1-round-trip improvement; logging here as a v0.3 candidate to consider, not adopt.

## No manifest on disk

Both pass 06 and 06b's deliberately-broken manifests were refused at the hook and never landed on disk — corroborating pass 04b's finding that the live gate truly blocks. The empty fixture directories are the evidence.

## v0.3 candidate (corpus #7)

**Combine structural and hardening into a single error-collection pipeline so a single Write surfaces all violations regardless of which stage they came from.** Optional implementation: run hardening on whichever subtrees survived structural validation. Drops the round-trip ceiling from 2 to 1 for any first-draft manifest. May not be worth the implementation complexity.
