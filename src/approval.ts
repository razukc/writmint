import type { FeatureManifest, ActionManifest } from './feature-manifest.js';
import type {
  HostTransports,
  AuditTransport,
  NetworkTransport,
  StorageTransport,
  ClockTransport,
  NetworkRequest,
  NetworkResponse,
} from './capabilities.js';
import { formatStructuredError, type StructuredError } from './errors.js';

export type FeatureStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'active'
  | 'revoked';

export interface FeatureRecord {
  manifest: FeatureManifest;
  versionHash: string;
  status: FeatureStatus;
  approvedBy: string | null;
  destructiveApprovedBy: string | null;
  approvedAtHash: string | null;
}

export interface FeatureStore {
  put(record: FeatureRecord): void;
  get(featureId: string): FeatureRecord | null;
  list(): FeatureRecord[];
  remove(featureId: string): void;
}

export class MemoryFeatureStore implements FeatureStore {
  private byId = new Map<string, FeatureRecord>();
  put(record: FeatureRecord): void {
    this.byId.set(record.manifest.id, record);
  }
  get(featureId: string): FeatureRecord | null {
    return this.byId.get(featureId) ?? null;
  }
  list(): FeatureRecord[] {
    return [...this.byId.values()];
  }
  remove(featureId: string): void {
    this.byId.delete(featureId);
  }
}

export class ApprovalError extends Error {
  readonly structured: StructuredError;
  constructor(structured: StructuredError) {
    super(formatStructuredError(structured));
    this.name = 'ApprovalError';
    this.structured = structured;
  }
}

export interface ApproveInput {
  featureId: string;
  versionHash: string;
  approvedBy: string;
  destructiveApprovedBy?: string;
}

export class ApprovalLifecycle {
  constructor(private store: FeatureStore) {}

  submit(manifest: FeatureManifest): FeatureRecord {
    const versionHash = hashManifest(manifest);
    const existing = this.store.get(manifest.id);
    if (existing && (existing.status === 'approved' || existing.status === 'active')) {
      if (existing.versionHash !== versionHash) {
        const next: FeatureRecord = {
          manifest,
          versionHash,
          status: 'submitted',
          approvedBy: null,
          destructiveApprovedBy: null,
          approvedAtHash: null,
        };
        this.store.put(next);
        return next;
      }
    }
    const record: FeatureRecord = {
      manifest,
      versionHash,
      status: 'submitted',
      approvedBy: null,
      destructiveApprovedBy: null,
      approvedAtHash: null,
    };
    this.store.put(record);
    return record;
  }

  approve(input: ApproveInput): FeatureRecord {
    const record = this.requireRecord(input.featureId);
    if (record.versionHash !== input.versionHash) {
      throw new ApprovalError({
        code: 'approval.hash_mismatch',
        where: `feature[${input.featureId}].approve`,
        expected: `versionHash ${record.versionHash}`,
        actual: input.versionHash,
        fixHint:
          'The manifest changed since submission; re-submit and approve the new version hash.',
      });
    }
    if (record.status !== 'submitted') {
      throw new ApprovalError({
        code: 'approval.bad_state',
        where: `feature[${input.featureId}].status`,
        expected: 'submitted',
        actual: record.status,
        fixHint: 'Only submitted features can be approved. Submit the manifest first.',
      });
    }
    const hasDestructive = record.manifest.actions.some((a) => a.destructive === true);
    if (hasDestructive && !input.destructiveApprovedBy) {
      throw new ApprovalError({
        code: 'approval.destructive_required',
        where: `feature[${input.featureId}].approve`,
        expected: 'destructiveApprovedBy set (feature has destructive actions)',
        actual: 'destructiveApprovedBy missing',
        fixHint:
          'This feature has destructive actions; provide destructiveApprovedBy in addition to approvedBy.',
      });
    }
    const next: FeatureRecord = {
      ...record,
      status: 'approved',
      approvedBy: input.approvedBy,
      destructiveApprovedBy: input.destructiveApprovedBy ?? null,
      approvedAtHash: record.versionHash,
    };
    this.store.put(next);
    return next;
  }

  activate(featureId: string): FeatureRecord {
    const record = this.requireRecord(featureId);
    if (record.status !== 'approved') {
      throw new ApprovalError({
        code: 'approval.activate_blocked',
        where: `feature[${featureId}].status`,
        expected: 'approved',
        actual: record.status,
        fixHint:
          'Only approved features can be activated. Move the feature through draft → submitted → approved first.',
      });
    }
    const next: FeatureRecord = { ...record, status: 'active' };
    this.store.put(next);
    return next;
  }

  revoke(featureId: string): FeatureRecord {
    const record = this.requireRecord(featureId);
    const next: FeatureRecord = { ...record, status: 'revoked' };
    this.store.put(next);
    return next;
  }

  assertRunnable(featureId: string, action: ActionManifest): FeatureRecord {
    const record = this.requireRecord(featureId);
    if (record.status !== 'active') {
      throw new ApprovalError({
        code: 'approval.not_runnable',
        where: `feature[${featureId}].status`,
        expected: 'active',
        actual: record.status,
        fixHint:
          'Feature is not active. It must be approved and activated before any action can run.',
      });
    }
    if (record.approvedAtHash !== record.versionHash) {
      throw new ApprovalError({
        code: 'approval.stale',
        where: `feature[${featureId}].approvedAtHash`,
        expected: record.versionHash,
        actual: record.approvedAtHash ?? 'null',
        fixHint:
          'The feature has been changed since it was approved. Re-submit and re-approve.',
      });
    }
    if (action.destructive === true && !record.destructiveApprovedBy) {
      throw new ApprovalError({
        code: 'approval.destructive_not_approved',
        where: `feature[${featureId}].action[${action.id}]`,
        expected: 'destructiveApprovedBy set on the approval',
        actual: 'destructiveApprovedBy null',
        fixHint:
          'This action is destructive but the approval did not authorize destructive use. Re-approve with destructiveApprovedBy.',
      });
    }
    return record;
  }

  private requireRecord(featureId: string): FeatureRecord {
    const r = this.store.get(featureId);
    if (!r) {
      throw new ApprovalError({
        code: 'approval.unknown_feature',
        where: `feature[${featureId}]`,
        expected: 'a feature submitted to the store',
        actual: 'no record',
        fixHint: 'Submit the feature manifest before referencing it.',
      });
    }
    return r;
  }
}

export type AuditEventKind =
  | 'capability_call'
  | 'capability_denied'
  | 'lifecycle'
  | 'feature_emit';

export interface AuditEvent {
  at: number;
  featureId: string;
  featureVersionHash: string;
  actionId: string | null;
  capabilityId: string | null;
  kind: AuditEventKind;
  payload: unknown;
  approvedBy: string | null;
}

export interface AuditSink {
  write(event: AuditEvent): void;
}

export class MemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];
  write(event: AuditEvent): void {
    this.events.push(event);
  }
}

export interface AuditingTransports {
  base: HostTransports;
  manifest: FeatureManifest;
  record: FeatureRecord;
  sink: AuditSink;
}

export function buildAuditingTransports({
  base,
  manifest,
  record,
  sink,
}: AuditingTransports): HostTransports {
  const featureId = manifest.id;
  const versionHash = record.versionHash;
  const approvedBy = record.approvedBy;
  const actionsById = new Map<string, ActionManifest>();
  for (const a of manifest.actions) actionsById.set(a.id, a);

  const emit = (event: Omit<AuditEvent, 'featureId' | 'featureVersionHash' | 'approvedBy'>): void => {
    sink.write({
      ...event,
      featureId,
      featureVersionHash: versionHash,
      approvedBy,
    });
  };

  const network: NetworkTransport | undefined = base.network && {
    async request(input: NetworkRequest): Promise<NetworkResponse> {
      try {
        const out = await base.network!.request(input);
        emit({
          at: Date.now(),
          actionId: null,
          capabilityId: null,
          kind: 'capability_call',
          payload: { kind: 'network.request', input: redactNetworkInput(input), status: out.status },
        });
        return out;
      } catch (e) {
        emit({
          at: Date.now(),
          actionId: null,
          capabilityId: null,
          kind: 'capability_denied',
          payload: { kind: 'network.request', input: redactNetworkInput(input), error: String(e) },
        });
        throw e;
      }
    },
  };

  const storage: StorageTransport | undefined = base.storage && {
    async get(scope, key) {
      const out = await base.storage!.get(scope, key);
      emit({
        at: Date.now(),
        actionId: null,
        capabilityId: null,
        kind: 'capability_call',
        payload: { kind: 'storage.get', scope, key },
      });
      return out;
    },
    async put(scope, key, value) {
      await base.storage!.put(scope, key, value);
      emit({
        at: Date.now(),
        actionId: null,
        capabilityId: null,
        kind: 'capability_call',
        payload: { kind: 'storage.put', scope, key },
      });
    },
    async delete(scope, key) {
      await base.storage!.delete(scope, key);
      emit({
        at: Date.now(),
        actionId: null,
        capabilityId: null,
        kind: 'capability_call',
        payload: { kind: 'storage.delete', scope, key },
      });
    },
    async list(scope, prefix) {
      const out = await base.storage!.list(scope, prefix);
      emit({
        at: Date.now(),
        actionId: null,
        capabilityId: null,
        kind: 'capability_call',
        payload: { kind: 'storage.list', scope, prefix },
      });
      return out;
    },
  };

  const clock: ClockTransport | undefined = base.clock;

  const audit: AuditTransport = {
    emit(ev) {
      const action = ev.payload && typeof ev.payload === 'object'
        ? (ev.payload as { actionId?: string }).actionId ?? null
        : null;
      const redacted = redactPayload(ev.payload, action ? actionsById.get(action) : undefined);
      sink.write({
        at: ev.at,
        featureId,
        featureVersionHash: versionHash,
        actionId: action,
        capabilityId: ev.capabilityId,
        kind: 'feature_emit',
        payload: { name: ev.name, payload: redacted },
        approvedBy,
      });
      if (base.audit) base.audit.emit(ev);
    },
  };

  return { network, storage, clock, audit };
}

export function emitLifecycleEvent(
  sink: AuditSink,
  record: FeatureRecord,
  to: FeatureStatus,
  actor: string | null
): void {
  sink.write({
    at: Date.now(),
    featureId: record.manifest.id,
    featureVersionHash: record.versionHash,
    actionId: null,
    capabilityId: null,
    kind: 'lifecycle',
    payload: { transitionedTo: to, actor },
    approvedBy: record.approvedBy,
  });
}

export function redactPayload(payload: unknown, action?: ActionManifest): unknown {
  if (!action || !action.redact || action.redact.length === 0) return payload;
  if (payload === null || typeof payload !== 'object') return payload;
  const cloned = deepClone(payload);
  for (const path of action.redact) {
    redactPath(cloned, path);
  }
  return cloned;
}

function redactPath(target: unknown, path: string): void {
  const segments = path.split('.');
  let cursor: unknown = target;
  for (let i = 0; i < segments.length - 1; i++) {
    if (cursor === null || typeof cursor !== 'object') return;
    cursor = (cursor as Record<string, unknown>)[segments[i]];
  }
  if (cursor !== null && typeof cursor === 'object') {
    const last = segments[segments.length - 1];
    if (last in (cursor as Record<string, unknown>)) {
      (cursor as Record<string, unknown>)[last] = '[REDACTED]';
    }
  }
}

function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(deepClone) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = deepClone(val);
  }
  return out as T;
}

function redactNetworkInput(input: NetworkRequest): unknown {
  const { url, method } = input;
  return { url, method };
}

export function hashManifest(manifest: FeatureManifest): string {
  const canonical = canonicalize(manifest);
  return 'sha256:' + sha256Hex(canonical);
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function utf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0xd800 || code >= 0xe000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return Uint8Array.from(bytes);
}

function sha256Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length % 64 < 56 ? 56 : 120) - (bytes.length % 64);
  const padded = new Uint8Array(bytes.length + padLen + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let chunkStart = 0; chunkStart < padded.length; chunkStart += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(chunkStart + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + mj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + hh) >>> 0;
  }
  const toHex = (n: number): string => n.toString(16).padStart(8, '0');
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}
