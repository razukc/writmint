import {
  validateCapabilityManifest,
  hardenManifest,
  type CapabilityManifest,
} from '../../src/index.js';

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
