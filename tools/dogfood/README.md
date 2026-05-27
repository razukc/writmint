# Writmint dogfood hook

A Claude Code `PreToolUse` hook that intercepts every `Write` and `Edit` on a Writmint manifest, runs `validateCapabilityManifest()` + `hardenManifest()` against the *proposed* contents, and blocks the write if either fails. The structured error is forwarded back to the agent on stderr; a one-line summary is appended to a JSONL telemetry file so harness passes can be replayed and counted later.

The hook is the verifier you can't talk past. It runs before the file touches disk, every time, against the real runtime — not a snapshot of it.

## What it catches

Anything `validateCapabilityManifest()` or `hardenManifest()` would reject at `submit()` time, on the proposed bytes:

- Missing or wrong-typed top-level fields (`id`, `version`, `title`, `description`, `permissions`, `actions`, `implementation`, `schemaVersion`).
- Invalid semver in `version`.
- Hardening violations: too-short `reason`/`description`, wildcards in network hosts or storage scopes, etc.
- Malformed JSON before any of the above can run.

Files that match the install glob but don't carry any v1 manifest shape marker (`schemaVersion`, `permissions`, `actions`, or `implementation`) are skipped — that's the false-positive defense for repo files (package.json, tsconfig, settings) that happen to be JSON but aren't manifest attempts. A partial/typo'd manifest (e.g. `{ actions: [] }`) still trips the check, so the agent gets feedback on what's missing rather than a silent pass.

Non-JSON files (`.md`, `.ts`, `.tsx`, `.js`, `.mjs`, etc.) bypass JSON.parse entirely via the extension gate, so a markdown write does not emit `manifest.parse_error` telemetry.

## How it works

Claude Code invokes the hook by piping a JSON event to stdin (no `${file_path}` substitution in the command):

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "…", "content": "…" }
}
```

For `Edit` the event carries `old_string` / `new_string` / `replace_all` instead of `content`; the hook reads the file on disk and applies the substitution itself to compute the proposed contents.

The script always exits `0`. On a valid manifest (or non-manifest skip) it prints nothing — Claude Code treats silent exit-0 as "no opinion, proceed." On a block it prints a `hookSpecificOutput` JSON object on stdout with `permissionDecision: "deny"` and the full structured error array as `permissionDecisionReason`. Claude Code surfaces that reason back to the calling agent and refuses the tool call. One telemetry record per error is appended to the JSONL file regardless.

The exit-code path matters. Per the Claude Code hooks docs, **only `exit 2` would block via the exit-code surface — `exit 1` is treated as non-blocking** (the documented footgun). The exit-0 + JSON stdout path is the recommended surface and is what this hook uses.

## Install

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx C:/code/playground/extensions/runtime/tools/dogfood/validate-on-write.ts"
          }
        ]
      }
    ]
  }
}
```

That's the whole install. The matcher fires on every `Edit`/`Write`; the script's own `computeProposedContents()` handles non-manifest paths by skipping (`exit 0`), so there's no per-glob filter to keep in sync.

Restart Claude Code after editing settings.

## Uninstall

Remove the `PreToolUse` entry (or the whole `hooks` block) from `~/.claude/settings.json` and restart Claude Code.

## Telemetry

Each blocking error appends one JSONL line to:

```
C:/code/playground/extensions/.local/dogfood/writmint-errors.jsonl
```

Schema:

```json
{ "ts": "<ISO-8601>", "layer": "hook", "code": "<error code>", "where": "<JSON pointer>" }
```

Override the path with `WRITMINT_DOGFOOD_TELEMETRY=/some/path.jsonl` in the environment. Allowed writes produce no telemetry — the file is a record of *rejections* only.

## Smoke test it locally

```bash
# Write + invalid manifest → exit 1, telemetry appended
echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"/tmp/m.json","content":"{\"capabilities\":[],\"id\":\"\"}"}}' \
  | npx tsx tools/dogfood/validate-on-write.ts; echo "exit=$?"

# Non-manifest JSON → exit 0 (false-positive defense)
echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"/tmp/x.json","content":"{\"name\":\"x\"}"}}' \
  | npx tsx tools/dogfood/validate-on-write.ts; echo "exit=$?"

# Non-Write/Edit tool → exit 0 (skip)
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}' \
  | npx tsx tools/dogfood/validate-on-write.ts; echo "exit=$?"
```

## Failure modes the hook itself surfaces

If the hook can't read the on-disk file to compute Edit's proposed contents (anything other than `ENOENT`, e.g. `EACCES`/`EISDIR`), it blocks the write with a `hook.io_error` structured payload rather than silently passing. `ENOENT` on Edit is treated as "the edit would have failed anyway" and skipped.

If stdin isn't valid JSON the hook exits `0` — that's the environmental-mismatch case (invoked outside a hook, drift in the event shape) and we'd rather not gate writes on a contract we can't parse. Real hook events from Claude Code are always parseable.
