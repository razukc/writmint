import {
  validateCapabilityManifest,
  hardenManifest,
  type CapabilityManifest,
} from '../../src/index.js';
import { readFileSync, readSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appendTelemetry } from './telemetry.js';

export interface StructuredErrorLike {
  code: string;
  where: string;
  expected?: unknown;
  actual?: unknown;
  fixHint?: string;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; errors: StructuredErrorLike[] };

export function validateProposedManifest(
  source: string,
  filePath: string,
): ValidateResult {
  // Extension gate: only .json / .jsonc files can hold a manifest. Anything
  // else (.md, .ts, .js, .png, …) gets a silent pass before we even try to
  // parse — otherwise JSON.parse fails on, say, a markdown write and we
  // emit a structured rejection for a file that was never a manifest
  // candidate.
  const lower = filePath.toLowerCase();
  if (!lower.endsWith('.json') && !lower.endsWith('.jsonc')) {
    return { ok: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          code: 'manifest.parse_error',
          where: filePath,
          actual: err instanceof Error ? err.message : String(err),
          fixHint: 'Fix the JSON syntax error before saving.',
        },
      ],
    };
  }

  // False-positive defense: file matched the matcher but isn't a manifest
  // attempt. We treat the JSON as a manifest attempt if it has *any* of the
  // shape markers a v1 CapabilityManifest carries: schemaVersion,
  // permissions, actions, or implementation. Anything else (package.json,
  // tsconfig, settings.json, random data) gets a silent pass. This catches
  // partial/typo'd manifests — an agent writing `{ id: "x", actions: [] }`
  // gets the same structured rejection as one writing a full broken one,
  // rather than a silent pass that hides the gap.
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: true };
  }
  const looksLikeManifest =
    'schemaVersion' in parsed ||
    'permissions' in parsed ||
    'actions' in parsed ||
    'implementation' in parsed;
  if (!looksLikeManifest) {
    return { ok: true };
  }

  const manifest = parsed as CapabilityManifest;
  const validation = validateCapabilityManifest(manifest);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors as StructuredErrorLike[] };
  }

  const hardening = hardenManifest(manifest);
  if (hardening.errors.length > 0) {
    return { ok: false, errors: hardening.errors as StructuredErrorLike[] };
  }

  return { ok: true };
}

const TELEMETRY_PATH =
  process.env.WRITMINT_DOGFOOD_TELEMETRY ??
  'C:/code/playground/extensions/.local/dogfood/writmint-errors.jsonl';

interface HookEvent {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
  };
}

// Compute the proposed file contents AFTER a Write/Edit lands, without
// actually applying the change. For Write the proposed contents are given
// outright; for Edit we read the file on disk and apply the substitution.
// Returns undefined when there is nothing we can validate (other tool, no
// proposed file path, or a read error that's not ENOENT and we want to
// surface).
export function computeProposedContents(event: HookEvent):
  | { kind: 'validate'; source: string; filePath: string }
  | { kind: 'skip' }
  | { kind: 'io_error'; message: string; filePath: string } {
  const tool = event.tool_name;
  const input = event.tool_input ?? {};
  const filePath = input.file_path;

  if (!filePath) return { kind: 'skip' };

  if (tool === 'Write') {
    return { kind: 'validate', source: input.content ?? '', filePath };
  }

  if (tool === 'Edit') {
    let onDisk: string;
    try {
      onDisk = readFileSync(filePath, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // The file doesn't exist yet — Edit on a missing file is a hook-irrelevant
      // case (Edit would itself fail), so skip rather than block.
      if (code === 'ENOENT') return { kind: 'skip' };
      return {
        kind: 'io_error',
        message: (err as Error).message ?? String(err),
        filePath,
      };
    }
    const oldStr = input.old_string ?? '';
    const newStr = input.new_string ?? '';
    if (oldStr === '') return { kind: 'skip' };
    const proposed = input.replace_all
      ? onDisk.split(oldStr).join(newStr)
      : onDisk.replace(oldStr, newStr);
    return { kind: 'validate', source: proposed, filePath };
  }

  // Not a Write/Edit — nothing to validate.
  return { kind: 'skip' };
}

function readStdinSync(): string {
  // Node's fd 0 read; works on Windows via tsx + Node ≥22.
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(1 << 14);
  for (;;) {
    let n: number;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (err) {
      // Stdin closed without data is fine — return empty.
      if ((err as NodeJS.ErrnoException).code === 'EAGAIN') continue;
      break;
    }
    if (n <= 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

// CLI entry: only runs when invoked directly, not when imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const stdin = readStdinSync();

  let event: HookEvent;
  try {
    event = JSON.parse(stdin) as HookEvent;
  } catch {
    // Not valid JSON on stdin — hook surface drift or invoked outside a hook.
    // Allow the write rather than block on an environmental mismatch.
    process.exit(0);
  }

  const proposed = computeProposedContents(event);
  if (proposed.kind === 'skip') {
    process.exit(0);
  }

  // The PreToolUse contract: exit 0 with hookSpecificOutput.permissionDecision
  // on stdout. "deny" blocks the tool call and surfaces permissionDecisionReason
  // back to the agent. Exit 1 is treated as non-blocking by Claude Code — that
  // is the footgun this code was written into originally; do NOT regress.
  // Reference: https://code.claude.com/docs/en/hooks
  const emitDeny = (errors: StructuredErrorLike[]): never => {
    const reason = JSON.stringify({ errors }, null, 2);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }) + '\n',
    );
    process.exit(0);
  };

  if (proposed.kind === 'io_error') {
    emitDeny([
      {
        code: 'hook.io_error',
        where: proposed.filePath,
        actual: proposed.message,
        fixHint:
          'Hook could not read the file to compute the proposed contents. Check permissions or that the path exists.',
      },
    ]);
  }

  const result = validateProposedManifest(proposed.source, proposed.filePath);
  if (result.ok) {
    process.exit(0);
  }

  for (const error of result.errors) {
    appendTelemetry(TELEMETRY_PATH, {
      layer: 'hook',
      code: error.code,
      where: error.where,
    });
  }

  emitDeny(result.errors);
}
