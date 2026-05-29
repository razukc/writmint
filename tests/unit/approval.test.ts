import { describe, it, expect } from 'vitest';
import {
  ApprovalLifecycle,
  ApprovalError,
  MemoryCapabilityStore,
  type ApproveInput,
} from '../../src/approval.js';
import type { CapabilityManifest, ActionManifest } from '../../src/capability-manifest.js';

function baseManifest(actions: Partial<ActionManifest>[] = []): CapabilityManifest {
  return {
    schemaVersion: 1,
    id: 'ops.example',
    version: '0.1.0',
    title: 'Example',
    description: 'An example capability for approval tests.',
    permissions: [
      {
        type: 'storage',
        id: 'store.cache',
        scope: 'example/items',
        mode: 'readwrite',
        reason: 'Used by example.run to read and write cached items.',
      },
    ],
    actions: actions.length
      ? actions.map((a, i) => ({
          id: `example.action_${i}`,
          description: 'Default action used by approval tests.',
          input: { type: 'object' },
          output: { type: 'object' },
          permissions: ['store.cache'],
          handler: 'run',
          ...a,
        }))
      : [
          {
            id: 'example.run',
            description: 'A non-destructive action used by approval tests.',
            input: { type: 'object' },
            output: { type: 'object' },
            permissions: ['store.cache'],
            handler: 'run',
          },
        ],
    implementation: { type: 'module', entry: './impl.js' },
  };
}

function setup(manifest: CapabilityManifest): {
  lifecycle: ApprovalLifecycle;
  versionHash: string;
} {
  const store = new MemoryCapabilityStore();
  const lifecycle = new ApprovalLifecycle(store);
  const submit = lifecycle.submit(manifest);
  return { lifecycle, versionHash: submit.versionHash };
}

describe('ApprovalLifecycle.approve — destructive_required (existing behavior)', () => {
  it('rejects approval of a destructive capability without destructiveApprovedBy', () => {
    const m = baseManifest([
      {
        id: 'example.purge',
        description: 'A destructive action used to test the gate.',
        destructive: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    const input: ApproveInput = {
      capabilityId: m.id,
      versionHash,
      approvedBy: 'alice',
    };
    try {
      lifecycle.approve(input);
      throw new Error('expected approve to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalError);
      const structured = (err as ApprovalError).structured;
      expect(structured.code).toBe('approval.destructive_required');
      expect(structured.where).toBe(`capability[${m.id}].approve`);
      expect(structured.fixHint).toContain('destructiveApprovedBy');
    }
  });

  it('allows approval of a destructive capability when destructiveApprovedBy is provided', () => {
    const m = baseManifest([
      {
        id: 'example.purge',
        description: 'A destructive action used to test the gate.',
        destructive: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    const record = lifecycle.approve({
      capabilityId: m.id,
      versionHash,
      approvedBy: 'alice',
      destructiveApprovedBy: 'bob',
    });
    expect(record.status).toBe('approved');
    expect(record.approvedBy).toBe('alice');
    expect(record.destructiveApprovedBy).toBe('bob');
  });

  it('does not require destructiveApprovedBy when no action is destructive', () => {
    const m = baseManifest();
    const { lifecycle, versionHash } = setup(m);

    const record = lifecycle.approve({
      capabilityId: m.id,
      versionHash,
      approvedBy: 'alice',
    });
    expect(record.status).toBe('approved');
    expect(record.destructiveApprovedBy).toBeNull();
  });
});

describe('ApprovalLifecycle.approve — approval.destructive.same_approver (two-person rule)', () => {
  // Raised by dogfood pass 03b: approvedBy and destructiveApprovedBy are both
  // free-form strings with no required-distinct check. Anyone who knows one
  // string knows the other, defeating the point of a two-person gate. Opt-in
  // via per-action requireDistinctDestructiveApprover so existing carryover
  // capabilities aren't broken.

  it('rejects approval when the flag is set and approvers are identical', () => {
    const m = baseManifest([
      {
        id: 'example.purge',
        description: 'A destructive action that requires distinct approvers.',
        destructive: true,
        requireDistinctDestructiveApprover: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    try {
      lifecycle.approve({
        capabilityId: m.id,
        versionHash,
        approvedBy: 'alice',
        destructiveApprovedBy: 'alice',
      });
      throw new Error('expected approve to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalError);
      const structured = (err as ApprovalError).structured;
      expect(structured.code).toBe('approval.destructive.same_approver');
      expect(structured.where).toBe(`capability[${m.id}].approve`);
      expect(structured.fixHint).toMatch(/different|distinct/i);
    }
  });

  it('allows approval when the flag is set and approvers are distinct', () => {
    const m = baseManifest([
      {
        id: 'example.purge',
        description: 'A destructive action that requires distinct approvers.',
        destructive: true,
        requireDistinctDestructiveApprover: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    const record = lifecycle.approve({
      capabilityId: m.id,
      versionHash,
      approvedBy: 'alice',
      destructiveApprovedBy: 'bob',
    });
    expect(record.status).toBe('approved');
  });

  it('does NOT require distinct approvers when the flag is absent (opt-in semantics)', () => {
    // Pass 03b's case: a destructive capability without the flag still
    // accepts same-value approvers. The carryover-safety guarantee.
    const m = baseManifest([
      {
        id: 'example.purge',
        description: 'A destructive action used to test the gate.',
        destructive: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    const record = lifecycle.approve({
      capabilityId: m.id,
      versionHash,
      approvedBy: 'alice',
      destructiveApprovedBy: 'alice',
    });
    expect(record.status).toBe('approved');
  });

  it('fires destructive_required before same_approver (missing field beats identity check)', () => {
    // If destructiveApprovedBy is missing entirely, the existing
    // destructive_required gate fires first — the same_approver gate only
    // applies when both fields are populated.
    const m = baseManifest([
      {
        id: 'example.purge',
        description: 'A destructive action that requires distinct approvers.',
        destructive: true,
        requireDistinctDestructiveApprover: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    try {
      lifecycle.approve({
        capabilityId: m.id,
        versionHash,
        approvedBy: 'alice',
      });
      throw new Error('expected approve to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalError);
      expect((err as ApprovalError).structured.code).toBe('approval.destructive_required');
    }
  });

  it('only checks the flag on destructive actions (non-destructive flag is ignored)', () => {
    // A non-destructive action with requireDistinctDestructiveApprover: true
    // shouldn't force the rule — destructive: true is the trigger, not the
    // flag alone.
    const m = baseManifest([
      {
        id: 'example.benign',
        description: 'A benign action with the distinct-approver flag set.',
        destructive: false,
        requireDistinctDestructiveApprover: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    const record = lifecycle.approve({
      capabilityId: m.id,
      versionHash,
      approvedBy: 'alice',
    });
    expect(record.status).toBe('approved');
  });

  it('triggers when any destructive action sets the flag (mixed capability)', () => {
    // A capability with one destructive action that sets the flag plus
    // another destructive action that does NOT set the flag should still
    // enforce distinct approvers — any-true is the trigger.
    const m = baseManifest([
      {
        id: 'example.purge',
        description: 'A destructive action that requires distinct approvers.',
        destructive: true,
        requireDistinctDestructiveApprover: true,
      },
      {
        id: 'example.wipe',
        description: 'Another destructive action without the distinct flag.',
        destructive: true,
      },
    ]);
    const { lifecycle, versionHash } = setup(m);

    try {
      lifecycle.approve({
        capabilityId: m.id,
        versionHash,
        approvedBy: 'alice',
        destructiveApprovedBy: 'alice',
      });
      throw new Error('expected approve to throw');
    } catch (err) {
      expect((err as ApprovalError).structured.code).toBe(
        'approval.destructive.same_approver',
      );
    }
  });
});
