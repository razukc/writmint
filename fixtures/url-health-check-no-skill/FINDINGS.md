# Findings from dogfood pass 05 — `ops.url-health-check` (skill-disabled)

**Date:** 2026-05-28
**Subject:** general-purpose subagent with the **live** Layer 3 hook active and **the `writmint-authoring` skill explicitly forbidden**. The agent was instructed not to read SKILL.md, src/, CLAUDE.md, or fixtures. Allowed input: structured rejections from the runtime itself (hook + validator).
**Target:** same shape as pass 01b (`ops.url-health-check`, network + clock, one ping action). A/B comparison: same target, same gate, only difference is skill access.

## Headline: N = 4

Pass 01b under the same conditions plus the skill: **0 hook rejections**.
Pass 05 without the skill: **4 hook rejections (16 individual error codes)**, then a 5th Write accepted.

**N = 4 round-trips is the measurable value of the `writmint-authoring` skill on this shape.**

The skill converts a 4-round-trip recovery loop into a zero-round-trip clean author. Combined hash from the recovered final manifest:
`sha256:e87626102dd60ff81c58623df3badd2153b9d2feec89415edb04ee751b7bcd76`

## Round-by-round rejection log

Telemetry confirms the four-round-trip count (16 error lines, clustered in four timestamp windows: `22:37`, `22:46`, `22:58`, `23:09`).

### Round 1 — initial guess (8 errors)

The subagent's prior of "what a manifest looks like" produced:
- `manifest.schema_version @ $.schemaVersion` — missing.
- `string.required @ $.id` — agent had `name`.
- `string.required @ $.title` — missing entirely.
- `manifest.permissions.type @ $.permissions` — agent placed permissions per-action, not top-level.
- `string.required @ $.actions[0].handler` — missing.
- `action.permission_ref.type @ $.actions[0].permissions[0]` and `[1]` — agent put inline permission objects in the action's permissions array instead of string refs.
- `manifest.implementation.type @ $.implementation` — agent had a string `"./impl.js"`, schema wants `{type, entry}`.

### Round 2 (4 errors)

After restructuring:
- `permission.type @ $.permissions[0].type` and `[1].type` — agent had to discover the enumerated set (`network, storage, ui, clock, audit`). The `expected` field in the error supplied it.
- `action.permission_ref.unknown @ $.actions[0].permissions[*]` — cascade from above; resolved as side-effect of fixing the type field.

### Round 3 (3 errors)

After adding `type`:
- `string.required @ $.permissions[*].reason` ×2 — missing.
- `permission.network.hosts @ $.permissions[0].hosts` — agent had `host` (singular).

### Round 4 (1 error)

After fixing the above:
- `permission.network.host_wildcard @ $.permissions[0].hosts[0]` — agent had `["*"]`. **This is the only rejection where the fix-hint couldn't fully carry the recovery** — the runtime tells you not to use a wildcard but cannot tell you which concrete hosts the capability should reach. That's a policy decision, not a mechanical one.

### Round 5 — accepted

Concrete hosts (`status.writmint.dev`, `health.writmint.dev`). Write landed. Validator returned `ok: true`. Submit warned twice (`permission.reason.no_action_ref` on both permissions — the action-ref convention from the skill). The subagent left these as warnings, which matches a true skill-disabled flow.

## Recovery loop quality

**Excellent.** Each `fixHint` named exactly what to change, frequently giving the literal value or shape:
- `"Set schemaVersion to 1."`
- `"Set implementation to { type: \"module\", entry: \"<path>\" }."`
- `"one of network, storage, ui, clock, audit"` (in `expected`)

The structured-error contract effectively teaches the schema. Without ever reading docs, the agent converged in 4 writes + 1 host-policy choice.

**One genuine friction point:** `permission.network.host_wildcard`. The fix-hint *should* steer authors toward "list each allowed hostname explicitly" — which it does — but for a capability whose URL is user-supplied at call time, the right concrete hostnames are unknowable from the rejection. The agent had to invent two plausible ones. This is the dynamic-host tension flagged in earlier passes; the structured error gives the *what* and *why* but not the *what to use instead* when the actual usage is dynamic.

## What this confirms

1. **The skill is doing the work it claims to do.** Pass 01b's zero-rejection result was not just-good-fix-hints — it was upstream prevention. Without the skill, the same target produces 4 round-trips.

2. **The structured-error surface is robust enough to author against alone.** N=4 is *recoverable* — the agent did converge — and every rejection except the host-wildcard one was mechanically fixable from the payload. The skill is an accelerator, not a prerequisite. This is the AI-DX product working.

3. **Skill-omitted authoring leaves warnings on the table.** The agent shipped a manifest with two `permission.reason.no_action_ref` warnings unaddressed. Skilled agents fix these; skill-less agents have no model that warnings are even worth chasing. If those warnings are intended to be addressed, they need to be promoted to a stricter form (the `permission.reason.action_ref_incomplete` candidate from pass 02b) or the warning's recovery value needs to be stronger.

4. **The schema is permissive on unknown fields.** The final manifest contains `kind` on permissions, `title` on actions, and `additionalProperties: false` on schemas — none of which exist in the v1 schema. The validator accepted them silently. For an authoring agent, this is a footgun: an unknown field reads as accepted-and-meaningful when it's accepted-and-ignored. Worth a v0.3 hardening rule: reject unknown top-level and per-permission/per-action fields.

## v0.3 candidate raised by this pass

5. **Reject unknown fields at the structural validator** (new — pass 05). Currently `kind`, `title` on actions, `additionalProperties: false`, etc. pass silently. A `manifest.unknown_field` warning (or error) with `where` pointing at the offending field would close the "looks accepted but ignored" footgun.

This is now the **sixth** v0.3 candidate from the dogfood corpus — building on the five in `fixtures/DOGFOOD-SUMMARY.md`.

## Closed: rerun landed as pass 05b (2026-06-07) — see `fixtures/url-health-check-no-skill-rerun/`

The 4-round-trip / 16-code recovery loop documented above hit a wall at `permission.network.host_wildcard`: the fix-hint named the rule but couldn't steer the agent toward a usable shape when the URL is user-supplied at call time — the agent invented hostnames.

After the dynamic-host feature, the rerun (same conditions, skill disabled, live gate) measured: **whole-pass 4 round-trips / 12 codes; host-policy segment 2 round-trips / 2 codes** — segment target (≤2/≤4) met, and **zero invented hostnames**. Notable: routing happened via the `permission.type` enum (`expected: one of network, network-dynamic, …`) in round 2, one layer earlier than the `host_wildcard` tail clause this feature was designed around — the agent never declared `hosts` at all. The wildcard instinct resurfaced as `registrableDomain: ["*"]` and was held by `registrable_domain_invalid`. Full analysis and the complete attempt-by-attempt record (every write + every rejection payload, per harness open item #3) in `fixtures/url-health-check-no-skill-rerun/FINDINGS.md` and `ATTEMPTS.md`.
