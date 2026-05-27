# Findings from dogfood pass 04 — `ops.webhook-cache`

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and PreToolUse Layer 3 hook active.
**Target:** `ops.webhook-cache` — network + storage shape, deliberately exercising the host-wildcard hardening rule on first write.

## Headline: the harness has been broken since Layer 3 shipped

The pass surfaced a **harness-layer reporting bug** that retroactively invalidates the rejection counts from passes 01-03.

What happened: subagent wrote a manifest with `hosts: ["*.partner.example.com"]`. The hook script ran (telemetry confirms: one new line, `permission.network.host_wildcard`, exactly the right `where`), exited non-zero, structured error on stderr. **But Claude Code accepted the Write anyway** and the subagent's tool result reported success.

Root cause, found via WebFetch to https://code.claude.com/docs/en/hooks:

> Only exit code 2 blocks the action. Claude Code treats exit code 1 as a non-blocking error and proceeds with the action, even though 1 is the conventional Unix failure code. If your hook is meant to enforce a policy, use `exit 2`.

> JSON output is only processed on exit 0.

The hook script used `exit 1`. That writes telemetry and produces structured errors on stderr but **does not block the tool call**. It has been a no-op gate since commit `308bf8d` (Layer 3 ship). Pass 01-03's "zero rejections" results reflect the skill carrying the authoring load, not the gate doing its job — but we cannot distinguish skill-carry from no-gate from the prior data.

Subagent diagnosed this as "hook didn't run" but the more precise read (confirmed by CLI repro and telemetry diff) is "hook ran, exited 1, was treated as non-blocking by Claude Code, write landed anyway." Two adjacent bugs with the same observable.

## The structured error itself (verbatim from `mcp__writmint__validate_manifest`)

```json
{
  "code": "permission.network.host_wildcard",
  "where": "$.permissions[0].hosts[0]",
  "expected": "exact hostname (no wildcards)",
  "actual": "\"*.partner.example.com\"",
  "fixHint": "List each allowed hostname explicitly; wildcards make the call surface impossible to audit."
}
```

The hardening rule is intact end-to-end through the validator. Only the hook's reporting surface was broken.

## Subagent's meta-observations on the host-wildcard path

1. **`fixHint` is excellent.** "List each allowed hostname explicitly; wildcards make the call surface impossible to audit" gives both the mechanical fix and the why. An author who reads it learns the design principle, not just the workaround.

2. **`where` pointer is sharp enough.** `$.permissions[0].hosts[0]` indexes both the permission and the offending host string. Even with multiple network permissions or multiple hosts per permission, this pinpoints exactly which token to change. No grep needed.

3. **Network-permission dynamic-host tension didn't fire here.** This action takes a *path* parameter; the host is fixed. The wildcard temptation was purely "future-flexibility" — exactly the auditability anti-pattern the rule targets. Rule is correctly aimed.

4. **Network + storage cross-pattern.** No interaction friction. Each permission validates independently; the action's `permissions: [...]` array ties them together cleanly. Minor visual duplication when both reasons name the same single consuming action.

## Final approval

Once the manifest was rewritten with the exact host:

- Hash: `sha256:99204b662d5fc1a60c147afc090ee14a63eca2ec9902bfb613cfd367f0968b09`
- submit() warnings: `[]`
- Approver: `dogfood-pass-04`

## Headline fix (next commit)

Switch the hook from `exit 1` to `exit 0 + permissionDecision: "deny"` JSON on stdout. Per docs, this gives finer-grained control (allow/deny/ask/defer) plus the `permissionDecisionReason` payload Claude surfaces back to the agent — matching Writmint's structured-error spirit better than raw stderr.

## Pass summary across all four passes

| Pass | Shape | Hook rejections claimed | Hook actually blocked? | Submit warnings | Approval rejections |
|---|---|---|---|---|---|
| 01 | 1a / 1 net + 1 clock | 0 | unknown (gate broken; no test data) | 0 | 0 |
| 02 | 2a / 1 storage + 1 clock | 0 | unknown (gate broken) | 0 | 0 |
| 03 | 2a (1 destructive) / 1 storage | 0 | unknown (gate broken) | 0 | 1 (intentional, approval layer — that gate WORKS, errors throw not exit-coded) |
| 04 | 1a / 1 net + 1 storage | 0 claimed by agent; 1 in telemetry | **NO** — wildcard write landed | 0 | 0 |

The approval-layer gate (pass 03's `approval.destructive_required`) works because it throws into the MCP tool path — that's an in-process error, not an exit code. Only the PreToolUse hook layer was broken. Layer 3 needs a rerun of every pass after the fix to get honest rejection counts.
