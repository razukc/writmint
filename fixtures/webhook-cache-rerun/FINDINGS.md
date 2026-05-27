# Findings from dogfood pass 04b — `ops.webhook-cache` (rerun under fixed hook)

**Date:** 2026-05-27
**Subject:** general-purpose subagent, with `writmint-authoring` skill loaded and the **fixed** PreToolUse Layer 3 hook active (commit `6aabac2`: exit-0 + `permissionDecision: "deny"`).
**Target:** same shape as pass 04 (`ops.webhook-cache`, network + storage, one fetch action), authored fresh into a new directory.

## Headline: the gate is now real.

The wildcard Write was **blocked**, the file was **never created on disk**, and the deny payload was **visible to the agent as a tool error** with the full structured-error array as content.

### The deny payload, verbatim (as seen by the agent on the Write tool result)

```json
{
  "errors": [
    {
      "code": "permission.network.host_wildcard",
      "where": "$.permissions[0].hosts[0]",
      "expected": "exact hostname (no wildcards)",
      "actual": "\"*.partner.example.com\"",
      "fixHint": "List each allowed hostname explicitly; wildcards make the call surface impossible to audit."
    }
  ]
}
```

### Disk check

`Read` on the target path after the rejected Write returned "File does not exist." Zero bytes written. The gate held.

### Telemetry confirmation

One new line in `writmint-errors.jsonl` during the pass:
```json
{"ts":"2026-05-27T11:55:45.354Z","layer":"hook","code":"permission.network.host_wildcard","where":"$.permissions[0].hosts[0]"}
```

Hook fired, denied, blocked, telemetry written, agent recovered — all four surfaces aligned for the first time across the four passes.

## Rest of the pass

- Corrected Write (`hooks.partner.example.com`): succeeded, no hook rejection.
- `validate_manifest`: ok, warnings `[]`.
- `submit_manifest`: state `submitted`, warnings `[]`.
- `approve_manifest` (approver `dogfood-pass-04b`): state `approved`.
- Final hash: `sha256:b085e4d4421191f4332152193716b2ba05ed7cd26fe482623fd3de82a0c73e68`

## Pass 04 vs pass 04b contrast

| | Pass 04 (exit 1, broken gate) | Pass 04b (exit 0 + JSON deny, fixed gate) |
|---|---|---|
| Hook fired | yes (telemetry line) | yes (telemetry line) |
| Hook produced structured error | yes (stderr) | yes (stdout permissionDecisionReason) |
| Claude Code surfaced error to agent | **no** (exit 1 = non-blocking, message swallowed) | **yes** (deny → tool error) |
| File landed on disk after wildcard Write | **yes** (Write succeeded silently) | **no** (Write refused) |
| Agent recovery loop | **didn't trigger** — agent diagnosed "hook didn't run" | **triggered cleanly** — branched off code + where, fixed, retried |

The pass-04 subagent's diagnosis was understandable but incorrect: the hook *had* run, it had just emitted a non-blocking exit code. The visible symptom — "no rejection in my tool result" — was identical to "no hook installed." That ambiguity is exactly why this rerun matters.

## What this confirms

**Pass 04b is the first dogfood pass in the project's history where the Layer 3 gate has demonstrably worked end-to-end.** Passes 01–03's zero-rejection counts are still unreliable signals — they show the skill carrying the load *or* the gate being silent, and we cannot distinguish from the data we have. If accurate cross-pass rejection counts matter for the harness narrative, those three passes need rerunning under the fixed hook.

Otherwise, the harness premise is now provably live: write a bad manifest, get a structured rejection at the moment of authoring, recover off the structured payload, retry, ship.
