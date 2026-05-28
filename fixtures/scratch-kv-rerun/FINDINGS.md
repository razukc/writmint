# Findings from dogfood pass 02b — `ops.scratch-kv` (rerun under fixed hook)

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and the **fixed** PreToolUse Layer 3 hook (commit `6aabac2`).
**Target:** same shape as pass 02 (`ops.scratch-kv`, storage readwrite + clock, two actions `put` and `get`).

## Headline

**Zero hook rejections, zero submit warnings, clean approval on first try.**

- Telemetry diff: 0 new lines across the pass.
- Final hash: `sha256:a9ba9a1efa031ee54f59dfd9eed55bb463063b0b8a7b2b0fd9714c243dcdb529`
- Approver: `dogfood-pass-02b`

## What the subagent observed

Notable instinct-level choices that the skill explicitly steered:

1. Reaching for `permissions[]` not `capabilities[]`.
2. Writing every reason as `` Used by `<action.id>` to <verb> ... `` to dodge the `no_action_ref` warning.
3. Packaging `implementation` as the `{type, entry}` object rather than a bare string.
4. Writing descriptions and reasons at ≥5 words without counting.

All four are points the skill calls out explicitly. Removing the skill from the next pass would surface a worth-knowing baseline rejection count.

## Convention seam observed: shared-permission reason strings

The action-ref convention scales cleanly when one permission serves one action. With a shared permission (both `put` and `get` use the storage one) the natural prose is per-action, but the `no_action_ref` warning is per-permission, so the subagent listed both action IDs in the storage reason and only one in the clock reason. The skill text does not address the shared-permission case. Minor; not a blocker.

This corroborates the pass-02 meta-observation that flagged `permission.reason.no_action_ref` as too loose — accepting a reason that names only N-1 of N consuming actions is the seam this convention rubs against. A stricter `permission.reason.action_ref_incomplete` warning is still a v0.3 candidate.

## Pass 02 vs pass 02b

Same null result, now meaningful. Pass 02 reported zero rejections under a silent gate; pass 02b reproduces zero under a live gate. The skill carries the manifest for this two-action / two-permission shape.
