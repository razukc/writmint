# Findings from dogfood pass 05b — `ops.url-health-check` (skill-disabled, rerun)

**Date:** 2026-06-07
**Subject:** general-purpose subagent with the **live** Layer 3 hook active and the `writmint-authoring` skill explicitly forbidden (no reading SKILL.md, src/, dist/, docs/, fixtures/, tests/, tools/, CLAUDE.md, CHANGELOG.md, or `.local/`). Allowed input: this prompt and the structured rejections themselves.
**Target:** same shape as pass 05 (`ops.url-health-check`, one action taking a **user-supplied URL at call time**). A/B against pass 05: same target, same gate, same skill-disabled condition — the only difference is that the runtime now has the `network-dynamic` permission shape and the rerouted fix-hints.
**Experimental record:** `ATTEMPTS.md` in this directory carries the full text of every attempt and every rejection payload, per harness open item #3.

## Headline: the host-policy dead-end is gone

| Metric | Pass 05 (before) | Pass 05b (after) |
|---|---|---|
| Whole-pass round-trips | 4 | **4** |
| Whole-pass error codes | 16 | **12** |
| Host-policy segment round-trips | 1 + policy dead-end | **2** (target ≤2 ✓) |
| Host-policy segment codes | 1 (`host_wildcard`) | **2** (target ≤4 ✓) |
| Invented hostnames | **2** (`status.writmint.dev`, `health.writmint.dev`) | **0** |
| Warnings left unaddressed | 2 | 2 |

The segment target from the original FINDINGS (≤2 round-trips, ≤4 codes from the first host-policy rejection to acceptance) is **met: 2 round-trips, 2 codes**. More importantly, the *quality* of the recovery changed: pass 05 ended with the agent inventing two plausible-looking hostnames no deployment would use, because `network` + `hosts[]` gave a dynamic-URL feature no honest way to express itself. Pass 05b ends with a `hostPolicy.registrableDomain` allowlist — the shape the runtime actually wants for this feature class.

## Round-by-round (telemetry lines 74–85; clusters at `03:45`, `03:46`, `03:47`, `03:48`)

### Round 1 — initial guess (6 codes)

Same prior-mismatch class as pass 05 round 1: missing `schemaVersion`, `title`, top-level `permissions`, `handler`, action `permissions` refs, structured `implementation`. (6 codes vs 8 in pass 05 — this agent's prior happened to include `id` and a JSONSchema-shaped `input`, so the difference is run-to-run prior variance, not a runtime change.)

### Round 2 — `permission.type` discovery (4 codes)

`permission.type @ $.permissions[*]` ×2 plus the `action.permission_ref.unknown` cascade. **This is where the routing actually happened — one round earlier than designed.** The `expected` field now reads `one of network, network-dynamic, storage, ui, clock, audit`; the agent, holding a task description that says "user-supplied URL at call time," picked `network-dynamic` directly off the enum. It never declared `hosts`, never hit `permission.network.host_wildcard`, and the extended `host_wildcard` fix-hint — the hook this feature was designed around — was never exercised. The type enum itself was a sufficient signpost.

### Round 3 — host-policy segment begins (1 code)

`permission.network-dynamic.host_policy @ $.permissions[0].hostPolicy` — missing. The fix-hint supplies the literal shape: `Add a hostPolicy object with at least { registrableDomain: ["example.com"] }`.

### Round 4 — wildcard attempt (1 code)

The agent tried `registrableDomain: ["*"]` — the same "this feature should reach anywhere" instinct that produced pass 05's wildcard. The new hardening caught it: `permission.network-dynamic.registrable_domain_invalid`, with a fix-hint demanding a literal domain. The auditability bar held against the same pressure, one layer deeper.

### Round 5 — accepted

`registrableDomain: ["example.com"]`. Hook passed; `verifyManifest` confirms `{valid: true, errors: []}` with two `permission.reason.no_action_ref` warnings left unaddressed — replicating pass 05 finding #3 exactly (skill-less agents have no model that warnings are worth chasing).

## What this confirms

1. **The dynamic-host redesign is reachable from the rejections alone.** A skill-disabled agent landed on `network-dynamic` + `hostPolicy` without reading a line of documentation. The segment target (≤2/≤4) was met at 2/2.

2. **The routing fired earlier than designed.** The intended path was `hosts: ["*"]` → `host_wildcard` fix-hint → redesign. The actual path was the `permission.type` enum advertising `network-dynamic` in round 2's `expected` field. The enum is the cheaper, earlier signpost; the `host_wildcard` tail clause remains the safety net for agents that pick `network` first. Both layers exist; this run only needed the first.

3. **The wildcard instinct survives one layer deeper, and the bar holds.** Round 4's `registrableDomain: ["*"]` is pass 05 round 4's wildcard reborn inside the new shape. `registrable_domain_invalid` rejected it with the same auditability rationale. Expect this to be the standard second rejection for skill-less authors of dynamic features.

4. **One honest caveat: the accepted policy is the fix-hint's own example.** `example.com` came verbatim from the `host_policy` fix-hint's illustration. The structured error still cannot answer "which registrable domain *should* this feature declare?" — that is a deployment-policy decision no rejection can carry. What changed is the failure mode: pass 05's answer was two fake hostnames wearing a production-looking TLD; pass 05b's is a transparent placeholder that any approver reading the manifest would immediately question. The shape is right; the value still needs a human (or a config-aware author). Approval-layer review remains the backstop, by design.

5. **Whole-pass numbers moved the way the feature predicted.** Schema-discovery rounds (1–2 here, 1–3 in pass 05) are untouched by this feature and dominate the whole-pass count, as the original FINDINGS' scoped target anticipated. The feature's contribution is confined to the segment it redesigned — and there it converted a policy dead-end into a 2-round mechanical recovery.
