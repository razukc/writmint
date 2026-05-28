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

## What we learned

### 1. The hook gate was broken from ship until pass 04 (commit `6aabac2`)

`exit 1` is non-blocking in Claude Code; only `exit 2` or `exit 0 + JSON deny` block. The original Layer 3 hook used `exit 1`, so structured rejections were generated, stderr was populated, telemetry was appended — but the tool call ran anyway. Pass 01-03's "zero rejections" cannot be cleanly attributed to skill-carry vs silent-gate from the data alone.

**Pass 04** surfaced this by deliberately attempting a wildcard write that should have been blocked. The wildcard manifest landed on disk despite the hook producing the right structured error. WebFetch to the Claude Code hooks docs revealed the contract.

**Pass 04b** is the first dogfood pass in the project's history where the gate is demonstrably live: the wildcard Write was refused, the file was never created, the structured deny payload was visible to the agent as a tool error.

### 2. Under the live gate, the skill carries the load

01b, 02b, 03b all produced **zero hook rejections** authoring against the live gate. The result that was ambiguous in 01-03 (skill or silent-gate?) is now load-bearing: the `writmint-authoring` skill prevents malformed writes upstream.

To verify the skill is doing the work (vs. e.g. the structured-error fix-hints being so good that any agent recovers in one round-trip), a future pass should deliberately **disable** the skill and re-author one of these shapes. The expected count is ≥1 rejection per pass; that experiment is not yet run.

### 3. The approval-layer gate works (and worked even before the hook fix)

Pass 03 and 03b both captured `approval.destructive_required` cleanly. Approval-layer gates throw into the MCP tool call path — that's an in-process error, not an exit-coded hook — so it was unaffected by the hook bug. `fixHint` named the missing parameter literally; both reruns recovered in one round-trip.

### 4. The structured-error shape is the AI-DX product

Every rejection captured across both cohorts had the same form: `{code, where, expected, actual, fixHint}`. In every case the `fixHint` named the exact thing to change, and the `where` JSON pointer landed sharp enough to find the offending field without searching. This is the property the project is selling and it holds.

## Open items for Writmint v0.3

From this dogfood corpus:

1. **`permission.reason.no_action_ref` is too loose.** It accepts a reason naming N-1 of N consuming actions. A stricter `permission.reason.action_ref_incomplete` warning would tighten the forcing function.
2. **No required-distinct constraint between `approvedBy` and `destructiveApprovedBy`.** Both are free-form strings; an opt-in manifest flag (`approval.requireDistinctApprovers`) plus a new error code `approval.destructive.same_approver` would close the two-person-rule design gap.
3. **MCP response shape inconsistency.** Error path returns a bare error object; success path returns `[{type: "text", ...}]`. Robotic callers have to branch on shape. Standardize.
4. **Dynamic-host tension.** Several passes flagged that `hosts[]` is enumerated at author time but actions often take user-supplied URLs. Either per-action `hosts` derived from config, or a separate dynamic-outbound permission type with a different policy.
5. **Skill should mention the destructive-approve-time consequence.** A line like "if any action sets `destructive: true`, approval requires a second approver string" would prevent the surprise at approve time that submit/validate were silent on.

## Open items for the harness itself

1. **Run a skill-disabled pass** to baseline the rejection count without the upstream prevention layer.
2. **Run a multi-error pass** — a manifest with several independent rejection codes (host wildcard + too-short reason + missing field) to verify the deny payload carries all of them, not just the first.
3. **Capture full first-write text** in FINDINGS.md, not just the rejection summary. Useful for understanding how authoring drifts in different shapes.
