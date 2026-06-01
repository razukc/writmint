import {
  verifyManifest,
  hashManifest as hashManifestPillar,
  ApprovalLifecycle,
  MemoryCapabilityStore,
  MemoryAuditSink,
  type CapabilityManifest,
  type AuditEvent,
  record as recordPillar,
  replay as replayPillar,
  ReplayDivergenceError,
  RuntimeError,
  type Recording,
  formatStructuredError,
  type StructuredError,
} from '../../src/index.js';
import type { HostTransports } from '../../src/permissions.js';
import { wrapStructured, divergenceToPayload } from './errors.js';
import type { CallToolResult } from './errors.js';
import { buildSyntheticAction, type SyntheticCall } from './synthetic-action.js';

interface ManifestInput {
  manifest: CapabilityManifest;
}

export async function validateManifest(args: ManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    // verifyManifest combines structural + hardening in one pass so a manifest
    // with both kinds of violations returns the full picture in one round-trip.
    // Pre-verifyManifest this short-circuited between stages and cost two
    // round-trips for mixed first-drafts; see dogfood pass 06/06b.
    //
    // On failure we THROW a RuntimeError carrying every violation rather
    // than returning a {ok:false} success-shape from inside this lambda.
    // wrapStructured then emits isError:true with the tagged-union failure
    // envelope, matching every other handler. Pre-v0.3.2 this returned a
    // {ok:false} success which forced callers to branch on inner-text
    // fields even on a "successful" tool call. See v0.3 candidate #3.
    const result = verifyManifest(args.manifest);
    if (!result.valid) {
      throw new RuntimeError(result.errors[0]!, result.errors);
    }
    return { hardened: { manifest: args.manifest, warnings: result.warnings } };
  });
}

export async function hashManifest(args: ManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    return { hash: hashManifestPillar(args.manifest) };
  });
}

type SubmitManifestInput = ManifestInput;

export async function submitManifest(args: SubmitManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    const store = new MemoryCapabilityStore();
    const lifecycle = new ApprovalLifecycle(store);
    const result = lifecycle.submit(args.manifest);
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
}

export async function approveManifest(args: ApproveManifestInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    const store = new MemoryCapabilityStore();
    const lifecycle = new ApprovalLifecycle(store);
    // First submit the manifest
    const submitResult = lifecycle.submit(args.manifest);
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

interface RecordInput {
  manifest: CapabilityManifest;
  actionId: string;
  input: unknown;
  capability_calls: SyntheticCall[];
}

interface ReplayInput extends RecordInput {
  recording: Recording;
}

function inMemoryTransports(): HostTransports {
  const store = new Map<string, unknown>();
  return {
    storage: {
      async get(scope, key) {
        return store.get(`${scope}:${key}`);
      },
      async put(scope, key, value) {
        store.set(`${scope}:${key}`, value);
      },
      async delete(scope, key) {
        store.delete(`${scope}:${key}`);
      },
      async list(scope) {
        const prefix = `${scope}:`;
        return Array.from(store.keys())
          .filter((k) => k.startsWith(prefix))
          .map((k) => k.slice(prefix.length));
      },
    },
    clock: {
      now() {
        return Date.parse('2026-01-01T00:00:00Z');
      },
    },
    audit: {
      emit() {
        /* no-op */
      },
    },
  };
}

export async function record(args: RecordInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    const action = buildSyntheticAction(args.capability_calls);
    const base = inMemoryTransports();
    const { output, recording } = await recordPillar(base, action);
    return { result: output, recording };
  });
}

export async function replay(args: ReplayInput): Promise<CallToolResult> {
  // Replay divergence is a FINDING (the replay successfully detected a
  // mismatch), not a tool failure. It is returned through the success arm
  // of the tagged-union envelope as { ok:true, data:{divergence} } so the
  // caller's branch on `ok` matches the protocol-level `isError` flag:
  // tool succeeded, the data field tells the story. Any other structured
  // error (a real failure path) goes through wrapStructured to the failure
  // arm, matching every other handler.
  return wrapStructured(async () => {
    try {
      const action = buildSyntheticAction(args.capability_calls);
      const { output } = await replayPillar(args.recording, action);
      return { result: output };
    } catch (err) {
      if (err instanceof ReplayDivergenceError) {
        return { divergence: divergenceToPayload(err) };
      }
      throw err;
    }
  });
}

interface FormatErrorInput {
  error: StructuredError;
}

export async function formatError(args: FormatErrorInput): Promise<CallToolResult> {
  return wrapStructured(async () => {
    return { formatted: formatStructuredError(args.error) };
  });
}
