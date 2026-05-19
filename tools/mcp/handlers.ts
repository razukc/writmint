import {
  validateCapabilityManifest,
  hardenManifest,
  hashManifest as hashManifestPillar,
  type CapabilityManifest,
} from '../../src/index.js';
import { wrapStructured } from './errors.js';
import type { CallToolResult } from './errors.js';

interface ManifestInput {
  manifest: CapabilityManifest;
}

export async function validateManifest(args: ManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    const validation = validateCapabilityManifest(args.manifest);
    if (!validation.valid) {
      return { ok: false, errors: validation.errors };
    }
    const hardening = hardenManifest(args.manifest);
    if (hardening.errors.length > 0) {
      return { ok: false, errors: hardening.errors };
    }
    return { ok: true, hardened: { manifest: args.manifest, warnings: hardening.warnings } };
  });
}

export async function hashManifest(args: ManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    return { hash: hashManifestPillar(args.manifest) };
  });
}
