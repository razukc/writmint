# Findings from dogfood pass 02 — `ops.scratch-kv`

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and PreToolUse Layer 3 hook active.
**Target:** `ops.scratch-kv` — one storage permission (readwrite), one clock permission, two actions (`put`, `get`).

## Headline

**Zero hook rejections, zero submit warnings, clean approval on first pass.** Final hash:
`sha256:4205177b6e75fd9d86e07e6ba1100c0a308644d98c20e70c53172d9f4447adf3`

Telemetry baseline-diff confirms zero new lines from this pass.

## Subagent's meta-observations

1. **The two-action shape exposed no new pattern.** Adding a second action only introduces (a) per-action permission re-declaration and (b) how a `reason` reads when two actions share the permission. Both fall out of the skill: the per-action `permissions[]` is a ref list, and the reason convention scales by listing each consuming action.

2. **`permission.reason.no_action_ref` is too loose.** The warning fires only when the reason mentions *at least one* action that consumes the permission. Pass 02 wrote `` Used by `put` ... and by `get` ... `` for a permission both actions consume — clean. But the subagent could have written only one of the two action ids and the warning would still have stayed silent. A stricter form ("every action that lists this permission must appear in the reason") would be a better forcing function for accurate reasons. Worth considering for a v0.3 hardening rule, possibly as a new warning code `permission.reason.action_ref_incomplete`.

3. **Declare-before-reference is invisible in the happy path.** With permissions declared at the top of the file before actions, the convention costs nothing. The cost only kicks in if you start writing actions top-down and discover permissions you didn't declare. Skill ordering (schema → permissions → actions) makes the happy path the obvious one.

4. **No-action-ref warning is unobserved in practice.** The subagent never saw the wire shape of a passing-with-warnings submit. A deliberate misshape on a future pass would (a) verify the warning emits as expected, (b) document the warning's `where` pointer shape, and (c) confirm that warnings don't cause the hook to block (they shouldn't — hook checks errors, warnings are submit-time only).

## Pass 01 vs pass 02

Identical authoring outcome: skill carried the load, zero round-trips, clean approval. Two adjacent capability shapes (1-action/2-permissions vs 2-actions/2-permissions) produced no new bug classes. The harness pipeline (skill → hook → MCP lifecycle) is stable on small capabilities.

Next pass should deliberately step into a *less clean* shape — destructive actions, network + storage combined, or a host wildcard attempt — to exercise the structured-error recovery path that has so far gone untested in the harness loop.
