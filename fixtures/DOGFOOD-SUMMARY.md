# Writmint dogfood passes — consolidated summary

Two cohorts of four passes each. The first cohort (01-04) ran under a broken hook (exit 1 = non-blocking; see commit `6aabac2`). The second cohort (01b-04b) reran each scenario under the fixed hook (exit 0 + `permissionDecision: "deny"` JSON on stdout).

## Cross-pass results

| Pass | Target | Shape | Gate | Hook rejections | Submit warnings | Approval rejections | Hash |
|---|---|---|---|---|---|---|---|
| 01 | `ops.url-health-check` | 1 action, network + clock | silent | 0 (ambiguous) | 0 | 0 | `82f7e779…ac2e1` |
| 01b | `ops.url-health-check` | (same) | **live** | 0 (verified clean) | 0 | 0 | — |
| 02 | `ops.scratch-kv` | 2 actions, storage + clock | silent | 0 (ambiguous) | 0 | 0 | `4205177b…7adf3` |
| 02b | `ops.scratch-kv` | (same) | **live** | 0 (verified clean) | 0 | 0 | `a9ba9a1e…dcdb529` |
| 03 | `ops.scratch-purge` | 2 actions (1 destructive), storage | silent | 0 (ambiguous) | 0 | 1 (intentional) | `e0c6af40…ab7a854` |
| 03b | `ops.scratch-purge` | (same) | **live** | 0 (verified clean) | 0 | 1 (intentional) | `6f9be1b6…6ea03de` |
| 04 | `ops.webhook-cache` | 1 action, network + storage, **deliberate wildcard** | silent | 0 reported, 1 in telemetry, write landed anyway | 0 | 0 | `99204b66…f0968b09` |
| 04b | `ops.webhook-cache` | (same, deliberate wildcard) | **live** | **1 (gate held; write refused)** | 0 | 0 | `b085e4d4…0c73e68` |
| 05 | `ops.url-health-check` | (same as 01/01b), **skill disabled** | **live** | **4 round-trips, 16 codes** | 2 (unfixed) | 0 | `e8762610…751b7bcd76` |
| 06 | `ops.multi-fail-test` | 1 structural + 4 hardening violations | **live** | 1 error in deny payload | — | — | n/a (measurement only, not approved) |
| 06b | `ops.multi-fail-hardening` | 5 hardening-only violations | **live** | 5 errors in deny payload | — | — | n/a (measurement only) |

## What we learned

### 1. The hook gate was broken from ship until pass 04 (commit `6aabac2`)

`exit 1` is non-blocking in Claude Code; only `exit 2` or `exit 0 + JSON deny` block. The original Layer 3 hook used `exit 1`, so structured rejections were generated, stderr was populated, telemetry was appended — but the tool call ran anyway. Pass 01-03's "zero rejections" cannot be cleanly attributed to skill-carry vs silent-gate from the data alone.

**Pass 04** surfaced this by deliberately attempting a wildcard write that should have been blocked. The wildcard manifest landed on disk despite the hook producing the right structured error. WebFetch to the Claude Code hooks docs revealed the contract.

**Pass 04b** is the first dogfood pass in the project's history where the gate is demonstrably live: the wildcard Write was refused, the file was never created, the structured deny payload was visible to the agent as a tool error.

### 2. Under the live gate, the skill carries the load — measured

01b, 02b, 03b all produced **zero hook rejections** authoring against the live gate. The result that was ambiguous in 01-03 (skill or silent-gate?) is now load-bearing: the `writmint-authoring` skill prevents malformed writes upstream.

**Pass 05 measures the skill's value directly.** Same target as 01/01b (`ops.url-health-check`), same live gate, skill explicitly disabled (agent forbidden from reading SKILL.md, src/, CLAUDE.md, or fixtures). Result: **4 round-trips, 16 distinct error codes, then accepted.** The skill converts a 4-round-trip recovery loop into a zero-round-trip clean author for this shape. The structured-error contract is robust enough to *recover* from any reasonable prior — every rejection except `host_wildcard` was mechanically fixable from the payload — but the skill is the accelerator that prevents the loop entirely.

### 3. The approval-layer gate works (and worked even before the hook fix)

Pass 03 and 03b both captured `approval.destructive_required` cleanly. Approval-layer gates throw into the MCP tool call path — that's an in-process error, not an exit-coded hook — so it was unaffected by the hook bug. `fixHint` named the missing parameter literally; both reruns recovered in one round-trip.

### 4. The structured-error shape is the AI-DX product

Every rejection captured across both cohorts had the same form: `{code, where, expected, actual, fixHint}`. In every case the `fixHint` named the exact thing to change, and the `where` JSON pointer landed sharp enough to find the offending field without searching. This is the property the project is selling and it holds.

## Open items for Writmint v0.3

From this dogfood corpus:

1. ~~**`permission.reason.no_action_ref` is too loose.**~~ — **shipped** as `permission.reason.action_ref_incomplete`. The two rules now partition the failure space: `0/N` mentioned → `no_action_ref`, `1..N-1/N` → `action_ref_incomplete`, `N/N` → clean. The new rule only fires when `N >= 2`. `actual` reports `"mentions K of N (a, b); missing: c, d"` so the agent can fix without rewriting the whole reason. Warning, not error — matches `no_action_ref`'s strictness. 5 new tests pin the rule.
2. ~~**No required-distinct constraint between `approvedBy` and `destructiveApprovedBy`**~~ — **shipped**. `ActionManifest` now carries `requireDistinctDestructiveApprover?: boolean`; setting it true on any destructive action makes `approve()` reject identical `approvedBy` and `destructiveApprovedBy` with `approval.destructive.same_approver`. Opt-in so carryover capabilities still work; per-action so the flag is hash-bound. 9 new approval tests (the gate also had zero prior coverage).
3. ~~**MCP response shape inconsistency.**~~ — **shipped** in v0.3.2 as a tagged-union wire envelope. Every handler's text body now follows `{ok:true, data}` or `{ok:false, errors:[...]}`; the MCP-level `isError` flag mirrors the inner `ok` and the two never disagree. Callers branch once on either channel. `validate_manifest` no longer rides a success envelope with `ok:false` (the old "findings, not failures" exception), and the error path is no longer a bare `StructuredError` — every handler reaches the same shape on both paths. Breaking change at the wire boundary; documented in CHANGELOG v0.3.2. `RuntimeError.allErrors` added at the same time so any single throw can surface batched violations through `wrapStructured` without further plumbing.
4. ~~**Dynamic-host tension.**~~ — **shipped** as `type: "network-dynamic"`. A second network-permission shape for actions that take user-supplied URLs: `hostPolicy` declares a `registrableDomain` suffix list (label-boundary match, wildcards still banned) plus optional `scheme`/`port`/`pathPrefix` narrowing and a default-on `denyPrivate`. The broker resolves the hostname once per action scope via `NetworkTransport.resolve()`, rejects private/loopback/link-local/CGNAT answers, and pins the resolved IP into the request (DNS-rebinding defense; conformance contract on the transport). New `network.resolve` tape event; `network`-only tapes unchanged. The `host_wildcard` fixHint now routes authors at the new shape, so the redesign is reachable from the rejection alone. `fixtures/url-health-check` migrated (manifest v0.2.0); rerun of pass 05's host-policy segment pending (target ≤2 round-trips / ≤4 codes — see that fixture's FINDINGS). 21 new error codes, ~130 new tests.
5. ~~**Skill should mention the destructive-approve-time consequence.**~~ — **shipped** alongside the two-person rule. SKILL.md now has a `## Destructive actions` section spelling out that `destructive: true` makes `approve()` require `destructiveApprovedBy` — silent at `submit()`/`validate()`, surfaces only at approve time as `approval.destructive_required`. The same section documents the new `requireDistinctDestructiveApprover` opt-in. Closes the "silent at submit, fires at approve" surprise that pass 03b documented.
6. ~~**Reject unknown fields at the structural validator**~~ — **shipped**. `manifest.unknown_field` is now a hardening WARNING at the manifest top-level, per-permission (by type), and per-action boundaries. JSONSchema bodies are not checked (additionalProperties etc. are legitimate JSONSchema fields). Re-running pass 05's fixture surfaces three previously-silent stray fields (`kind` on both permissions, `title` on the action). 7 unit tests pin the rule.
7. ~~**Combine structural and hardening into one error-collection pipeline**~~ — **shipped** as `verifyManifest()`. New combined entry point runs structural exhaustively, marks broken subtrees, then runs hardening on whatever survived. The MCP `validate_manifest` handler and the Layer 3 hook script now call it. `ApprovalError` grew a parallel `allErrors` field so `submit()`-time rejections also surface every violation rather than just the first. Reproducing pass 06's fixture (1 structural + 4 hardening) now returns 5 errors in one rejection instead of 1. 9 new `verifyManifest` tests + 1 new `submit() allErrors` test pin the contract. Round-trip ceiling: **2 → 1**.

## Open items for the harness itself

1. **Run a skill-disabled pass** to baseline the rejection count without the upstream prevention layer.
2. **Run a multi-error pass** — a manifest with several independent rejection codes (host wildcard + too-short reason + missing field) to verify the deny payload carries all of them, not just the first.
3. **Capture full first-write text** in FINDINGS.md, not just the rejection summary. Useful for understanding how authoring drifts in different shapes.
