import {
  validateCapabilityManifest,
  hardenManifest,
  type CapabilityManifest,
} from '../../src/index.js';
import { readFileSync } from 'node:fs';
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
  // TS files: cannot evaluate safely — silently pass.
  if (filePath.endsWith('.ts')) {
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

  // False-positive defense: file matched the glob but isn't a manifest.
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('capabilities' in parsed)
  ) {
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

// CLI entry: only runs when invoked directly, not when imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('usage: validate-on-write.ts <file-path>\n');
    process.exit(2);
  }

  let source: string;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    // File doesn't exist yet (new write) — nothing to validate, allow.
    process.exit(0);
  }

  const result = validateProposedManifest(source, filePath);
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

  process.stderr.write(JSON.stringify({ errors: result.errors }, null, 2) + '\n');
  process.exit(1);
}
