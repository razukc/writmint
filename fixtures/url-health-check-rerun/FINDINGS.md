# Findings from dogfood pass 01b — `ops.url-health-check` (rerun under fixed hook)

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and the **fixed** PreToolUse Layer 3 hook (commit `6aabac2`: exit-0 + `permissionDecision: "deny"`).
**Target:** same shape as pass 01 (`ops.url-health-check`, network + clock, one ping action), authored fresh into a new directory.

## Headline

**Zero hook rejections, zero submit warnings, clean approval on first try.** Same outcome as pass 01 — but now it's load-bearing.

- Telemetry diff: 0 new lines across the pass.
- The agent's authoring instincts produced no malformed write under the live gate. The skill genuinely carries the manifest.

## Final approval

`sha256:`*(see commit `f27ab33` series; manifest content matches expected v1 schema)*

## Pass 01 vs pass 01b

Pass 01 reported "zero rejections, skill carried the load" — but at that time the gate was silently non-blocking, so the result was ambiguous (skill-carry vs silent-gate; couldn't distinguish). Pass 01b under the live gate confirms it was skill-carry: when the hook is actually wired to block, the same good-faith authoring run still produces zero rejections.

The pass 01 hypothesis is now verified, not just plausible.
