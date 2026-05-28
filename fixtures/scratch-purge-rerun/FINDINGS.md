# Findings from dogfood pass 03b — `ops.scratch-purge` (rerun under fixed hook)

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and the **fixed** PreToolUse Layer 3 hook (commit `6aabac2`).
**Target:** same shape as pass 03 (`ops.scratch-purge`, one storage permission, one non-destructive action `count` + one destructive action `purge`).

## Headline

**Zero hook rejections, zero submit warnings, one intentional approval rejection (recovered cleanly).**

- Telemetry diff: 0 new lines across the pass.
- submit() warnings: `[]`.
- Final hash: `sha256:6f9be1b6e69117ec133c0d6fcfd6f07d22eea49dd8c9e7c117e4fc6986ea03de`
- Approver: `dogfood-pass-03b`; destructive approver: `dogfood-pass-03b-destructive`.

## Verbatim approval rejection (step 6, destructiveApprovedBy omitted)

```json
{
  "code": "approval.destructive_required",
  "where": "capability[ops.scratch-purge].approve",
  "expected": "destructiveApprovedBy set (capability has destructive actions)",
  "actual": "destructiveApprovedBy missing",
  "fixHint": "This capability has destructive actions; provide destructiveApprovedBy in addition to approvedBy."
}
```

Identical to pass 03's verbatim — the approval layer's rejection contract was already working in pass 03 (it's an MCP-tool-layer throw, not exit-coded) and is unchanged here.

## Why the Layer 3 hook didn't fire on the destructive bytes

The hook isn't *supposed* to fire on `destructive: true`. The manifest layer treats it as pure metadata: no hardening rule, no validator complaint, no hook block. Enforcement happens at `approve()` where the lifecycle layer scans actions for `destructive: true` and demands a distinct second-actor field. That's the right separation of concerns:

- **Manifest / hook layer:** structural shape and hardening rules. Cheap, fast, write-time.
- **Approve layer:** policy gates that need approver identities. Submit-time, with structured throws.

The pass-03b subagent confirmed this is intentional and well-aimed, with one small AI-DX nit: the rejection comes back as a bare error object rather than wrapped in `[{type: "text", ...}]` like the MCP success path. A robotic recovery loop has to handle two response shapes from the same tool. Worth standardizing in v0.3 — either always wrap or always-bare.

## Pass 03 vs pass 03b

| | Pass 03 (silent gate) | Pass 03b (live gate) |
|---|---|---|
| Hook rejections | 0 (ambiguous: skill or no-gate?) | 0 (verified: skill) |
| submit warnings | 0 | 0 |
| Intentional approval rejection | captured | captured (identical shape) |
| Final hash | `e0c6af40…ab7a854` | `6f9be1b6…6ea03de` |

Hashes differ because the rerun manifest's bytes differ from pass 03's (different `title`/`description` wording, same schema). That's expected — the hash binds the canonical bytes.

## Carryover for v0.3

1. **Two-person rule**: same as pass 03 — `approvedBy` and `destructiveApprovedBy` are both free-form strings with no required-distinct check. The pass-03 finding stands.
2. **MCP response shape consistency**: error path returns a bare object; success path returns `[{type: "text", ...}]`. Robotic callers have to branch on shape. Standardize in v0.3.
