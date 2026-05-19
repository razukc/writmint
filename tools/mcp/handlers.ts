import {
  validateCapabilityManifest,
  hardenManifest,
  hashManifest as hashManifestPillar,
  ApprovalLifecycle,
  MemoryCapabilityStore,
  MemoryAuditSink,
  type CapabilityManifest,
  type AuditEvent,
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

interface SubmitManifestInput {
  manifest: CapabilityManifest;
  configuredBy?: string;
  note?: string;
}

export async function submitManifest(args: SubmitManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    const store = new MemoryCapabilityStore();
    const lifecycle = new ApprovalLifecycle(store);
    const result = lifecycle.submit(args.manifest, {
      configuredBy: args.configuredBy,
      note: args.note,
    });
    return {
      state: result.status,
      hash: result.versionHash,
      manifestId: result.manifest.id,
      warnings: result.warnings,
    };
  });
}

interface ApproveManifestInput {
  manifest: CapabilityManifest;
  approver: string;
  destructiveApprovedBy?: string;
  note?: string;
}

export async function approveManifest(args: ApproveManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    const store = new MemoryCapabilityStore();
    const lifecycle = new ApprovalLifecycle(store);
    // First submit the manifest
    const submitResult = lifecycle.submit(args.manifest, {
      note: args.note,
    });
    // Then approve it
    const approveResult = lifecycle.approve({
      capabilityId: args.manifest.id,
      versionHash: submitResult.versionHash,
      approvedBy: args.approver,
      destructiveApprovedBy: args.destructiveApprovedBy,
    });
    return {
      state: approveResult.status,
      hash: approveResult.versionHash,
      manifestId: approveResult.manifest.id,
    };
  });
}

interface AuditEventsInput {
  manifest: CapabilityManifest;
}

export async function auditEvents(args: AuditEventsInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    const sink = new MemoryAuditSink();
    return { events: sink.events as AuditEvent[] };
  });
}
