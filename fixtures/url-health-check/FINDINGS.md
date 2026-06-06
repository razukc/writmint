# Findings from dogfood pass 01 — `ops.url-health-check`

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and PreToolUse Layer 3 hook active.
**Target:** `ops.url-health-check.ping` — one network permission, one clock permission, one action.

## Headline

**Zero hook rejections, zero submit warnings, clean approval on first pass.** Final hash:
`sha256:82f7e77962723b32e249f00a5fe6fb57e84f158534f7b9fa97b9ef47137ac2e1`

The skill carried the entire authoring load. Without the skill in front, the subagent estimated 3-4 round-trips on field rename, implementation shape, and reason convention. With the skill: one Write, accepted.

## Subagent's meta-observations

1. **Outer/inner naming collision.** The outer "capability" contains a `permissions[]` array. The inner permissions are not capabilities, but the noun re-use is unintuitive. A sentence in the schema doc framing "the outer thing is the unit of governance, the inner entries are individual permission grants" would land it cleanly.

2. **Dynamic-host tension is unaddressed.** The action takes a user-supplied URL, but `hosts[]` is enumerated at author-time and wildcards are banned. So this fixture is really `ops.status-example-pinger` (one hard-coded host), not a true URL health check. Either need per-action `hosts` derived from config, or a separate permission type with a "validate-at-call-time" policy. The structured error for `host_wildcard` is clear about *what* failed but the `fixHint` could steer authors toward the right pattern: *"If the host is dynamic, model it as config + per-call validation."*

## Harness bug found during the pass

The pass also surfaced a Layer 3 harness bug. Telemetry from the dogfood session shows 4 `manifest.parse_error` entries against `.md` writes (README, MEMORY.md, the skill file). Root cause is the same shape as the earlier discriminator bug: `validateProposedManifest` runs `JSON.parse(source)` *before* checking whether the file looks like a manifest. On any non-JSON write the parse fails and the hook produces a structured rejection.

In this session the hook either didn't block (settings.json restart picked up late) or Claude Code silenced the error — but the telemetry shows the script ran. Fix: short-circuit on file extension before parsing. `.md`/`.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`/etc. all pass silently. Only `.json` (and possibly `.jsonc`) should go through the parse path.

Filed as a follow-up task. Recovery sequence is identical to the prior discriminator fix.

## Update — dynamic-host shape adopted (v0.2.0)

The dynamic-host tension flagged above is closed by the new `type: "network-dynamic"` shape. The manifest now declares `hostPolicy.registrableDomain` rather than a closed `hosts[]` set. The author no longer invents plausible hostnames; the approver sees a policy clause (label-boundary suffix list), and per-call URLs are validated against the policy at the broker, with the resolved IP pinned into the transport request.

Before (v0.1.0): `{ "type": "network", "hosts": ["status.example.com"] }`
After (v0.2.0): `{ "type": "network-dynamic", "hostPolicy": { "registrableDomain": ["status.example.com"] } }`

A wildcard attempt now routes to this shape via the extended `permission.network.host_wildcard` fix-hint, so the redesign is reachable from the rejection alone.
