# Findings from dogfood pass 03 — `ops.scratch-purge`

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and PreToolUse Layer 3 hook active.
**Target:** `ops.scratch-purge` — one storage permission (readwrite), one non-destructive action (`count`), one destructive action (`purge`). Pass deliberately exercised the destructive-approval gate.

## Headline

**Zero hook rejections, zero submit warnings, one *intentional* approval rejection captured.** Final hash:
`sha256:e0c6af40f1e4cbab1d4df7bbdf67c1f49113b75118e96447fdb1a8dc7ab7a854`

Telemetry baseline-diff confirms zero hook-layer rejections.

## The destructive-approval rejection (verbatim)

```json
{
  "code": "approval.destructive_required",
  "where": "capability[ops.scratch-purge].approve",
  "expected": "destructiveApprovedBy set (capability has destructive actions)",
  "actual": "destructiveApprovedBy missing",
  "fixHint": "This capability has destructive actions; provide destructiveApprovedBy in addition to approvedBy."
}
```

Actionable on first read. `fixHint` names the missing parameter literally; retry with `destructiveApprovedBy: "dogfood-pass-03"` succeeded.

## Subagent's meta-observations

1. **`destructive: true` has no authoring-side signal.** validate() and submit() pass silently — the gate is only at approve. That's the right enforcement point (approver identities aren't known until approval) but the skill could mention the consequence in one line so the author isn't surprised when the same input that validated cleanly later trips approve.

2. **No required-distinct constraint between `approvedBy` and `destructiveApprovedBy`.** Both are free-form strings; the subagent used `"dogfood-pass-03"` for both and approval accepted it without complaint. If the intent of `destructiveApprovedBy` is a two-person rule (the destructive approver must differ from the regular approver), that constraint is currently absent. Anyone who knows one string knows the other. **This is a Writmint v0.3 design call**, not a harness bug. Candidate: add an opt-in manifest flag (`approval.requireDistinctApprovers: true`) plus a structured error code `approval.destructive.same_approver`.

3. **Granularity mismatch is invisible until you have a mixed capability.** Manifest-side `destructive: true` is per-action, but the approval gate is per-capability ("any action destructive ⇒ both approvers required"). Fine as-is, but the `expected` string ("capability has destructive actions") is the only place that fact is spelled out. One sentence in the skill would resolve it.

4. **Hash stability across destructive approval is correct.** Identical pre/post-approval hash — the destructive-approver string is an out-of-band approver signal, not bound into the manifest bytes. Worth a one-liner in the skill so authors don't expect the approver to fold into the hash.

## Pass 03 vs prior passes

| Pass | Shape | Hook rejections | Submit warnings | Approval rejections |
|---|---|---|---|---|
| 01 | 1 action / 1 net + 1 clock | 0 | 0 | 0 |
| 02 | 2 actions / 1 storage + 1 clock | 0 | 0 | 0 |
| 03 | 2 actions (1 destructive) / 1 storage | 0 | 0 | 1 *(intentional)* |

The harness pipeline (skill → hook → MCP lifecycle) remains stable across all three shapes. The structured-error recovery path was exercised cleanly: one round-trip, `fixHint` named the fix verbatim, retry succeeded.

## Next pass candidate

The harness has now seen: (1) network + clock, (2) storage + clock, (3) storage + destructive. The shape that hasn't surfaced an authoring stumble yet is **network + storage combined with a host wildcard attempt**. The host-wildcard rejection is the structured error class the skill flags most prominently but the harness hasn't actually seen a recovery from. A network+storage capability that tries `hosts: ["*.example.com"]` would round-trip the hardening rule end-to-end.
