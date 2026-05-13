import type {
  HostTransports,
  NetworkTransport,
  StorageTransport,
  ClockTransport,
  AuditTransport,
  NetworkRequest,
  NetworkResponse,
} from './permissions.js';
import { formatStructuredError, type StructuredError } from './errors.js';

export type BrokerCallKind =
  | 'network.request'
  | 'storage.get'
  | 'storage.put'
  | 'storage.delete'
  | 'storage.list'
  | 'clock.now'
  | 'audit.emit';

export interface BrokerCallEntry {
  index: number;
  kind: BrokerCallKind;
  input: unknown;
  output: unknown;
  threw: boolean;
}

export interface Recording {
  schemaVersion: 1;
  entries: BrokerCallEntry[];
}

export class ReplayDivergenceError extends Error {
  readonly structured: StructuredError;
  constructor(structured: StructuredError) {
    super(formatStructuredError(structured));
    this.name = 'ReplayDivergenceError';
    this.structured = structured;
  }
}

export interface RecordResult<T> {
  output: T;
  recording: Recording;
}

export interface ReplayResult<T> {
  output: T;
  entries: BrokerCallEntry[];
}

export async function record<T>(
  base: HostTransports,
  fn: (recorded: HostTransports) => Promise<T> | T
): Promise<RecordResult<T>> {
  const entries: BrokerCallEntry[] = [];
  const recorded: HostTransports = wrapForRecord(base, entries);
  const output = await fn(recorded);
  return {
    output,
    recording: { schemaVersion: 1, entries },
  };
}

export async function replay<T>(
  recording: Recording,
  fn: (replayed: HostTransports) => Promise<T> | T
): Promise<ReplayResult<T>> {
  const cursor = { i: 0 };
  const replayed: HostTransports = buildReplayTransports(recording, cursor);
  const output = await fn(replayed);
  if (cursor.i < recording.entries.length) {
    const next = recording.entries[cursor.i];
    throw new ReplayDivergenceError({
      code: 'replay.unconsumed_entry',
      where: `recording.entries[${cursor.i}]`,
      expected: 'all recorded entries consumed',
      actual: `capability stopped after ${cursor.i}/${recording.entries.length} entries; next was ${next.kind}`,
      fixHint:
        'The capability made fewer broker calls than the recording. Re-record after the change, or revert the change that removed calls.',
    });
  }
  return { output, entries: recording.entries.slice(0, cursor.i) };
}

function wrapForRecord(base: HostTransports, entries: BrokerCallEntry[]): HostTransports {
  const network: NetworkTransport | undefined = base.network && {
    async request(input: NetworkRequest): Promise<NetworkResponse> {
      const idx = entries.length;
      try {
        const output = await base.network!.request(input);
        entries.push({ index: idx, kind: 'network.request', input, output, threw: false });
        return output;
      } catch (e) {
        entries.push({
          index: idx,
          kind: 'network.request',
          input,
          output: serializeThrown(e),
          threw: true,
        });
        throw e;
      }
    },
  };

  const storage: StorageTransport | undefined = base.storage && {
    async get(scope: string, key: string): Promise<unknown> {
      const idx = entries.length;
      try {
        const output = await base.storage!.get(scope, key);
        entries.push({ index: idx, kind: 'storage.get', input: { scope, key }, output, threw: false });
        return output;
      } catch (e) {
        entries.push({
          index: idx,
          kind: 'storage.get',
          input: { scope, key },
          output: serializeThrown(e),
          threw: true,
        });
        throw e;
      }
    },
    async put(scope: string, key: string, value: unknown): Promise<void> {
      const idx = entries.length;
      try {
        await base.storage!.put(scope, key, value);
        entries.push({
          index: idx,
          kind: 'storage.put',
          input: { scope, key, value },
          output: undefined,
          threw: false,
        });
      } catch (e) {
        entries.push({
          index: idx,
          kind: 'storage.put',
          input: { scope, key, value },
          output: serializeThrown(e),
          threw: true,
        });
        throw e;
      }
    },
    async delete(scope: string, key: string): Promise<void> {
      const idx = entries.length;
      try {
        await base.storage!.delete(scope, key);
        entries.push({
          index: idx,
          kind: 'storage.delete',
          input: { scope, key },
          output: undefined,
          threw: false,
        });
      } catch (e) {
        entries.push({
          index: idx,
          kind: 'storage.delete',
          input: { scope, key },
          output: serializeThrown(e),
          threw: true,
        });
        throw e;
      }
    },
    async list(scope: string, prefix?: string): Promise<string[]> {
      const idx = entries.length;
      try {
        const output = await base.storage!.list(scope, prefix);
        entries.push({
          index: idx,
          kind: 'storage.list',
          input: { scope, prefix },
          output,
          threw: false,
        });
        return output;
      } catch (e) {
        entries.push({
          index: idx,
          kind: 'storage.list',
          input: { scope, prefix },
          output: serializeThrown(e),
          threw: true,
        });
        throw e;
      }
    },
  };

  const clock: ClockTransport | undefined = base.clock && {
    now(): number {
      const idx = entries.length;
      const output = base.clock!.now();
      entries.push({ index: idx, kind: 'clock.now', input: null, output, threw: false });
      return output;
    },
  };

  const audit: AuditTransport | undefined = base.audit && {
    emit(event): void {
      const idx = entries.length;
      base.audit!.emit(event);
      entries.push({
        index: idx,
        kind: 'audit.emit',
        input: { capabilityId: event.capabilityId, name: event.name, payload: event.payload },
        output: undefined,
        threw: false,
      });
    },
  };

  return { network, storage, clock, audit };
}

function buildReplayTransports(
  recording: Recording,
  cursor: { i: number }
): HostTransports {
  const next = (kind: BrokerCallKind, expectedInput: unknown): BrokerCallEntry => {
    if (cursor.i >= recording.entries.length) {
      throw new ReplayDivergenceError({
        code: 'replay.extra_call',
        where: `recording.entries[${cursor.i}]`,
        expected: `no more calls (recording length ${recording.entries.length})`,
        actual: `${kind} ${stringify(expectedInput)}`,
        fixHint:
          'The capability made more broker calls than the recording. Re-record after the change, or revert the change that added calls.',
      });
    }
    const entry = recording.entries[cursor.i];
    if (entry.kind !== kind) {
      throw new ReplayDivergenceError({
        code: 'replay.kind_mismatch',
        where: `recording.entries[${cursor.i}]`,
        expected: `${entry.kind} ${stringify(entry.input)}`,
        actual: `${kind} ${stringify(expectedInput)}`,
        fixHint:
          'Broker call kind does not match the recording at this position. The capability changed; re-record or revert.',
      });
    }
    if (!deepEqual(entry.input, expectedInput)) {
      throw new ReplayDivergenceError({
        code: 'replay.input_mismatch',
        where: `recording.entries[${cursor.i}].input`,
        expected: stringify(entry.input),
        actual: stringify(expectedInput),
        fixHint:
          'Broker input differs from the recording at this position. The capability changed; re-record or revert.',
      });
    }
    cursor.i++;
    return entry;
  };

  const network: NetworkTransport = {
    async request(input: NetworkRequest): Promise<NetworkResponse> {
      const entry = next('network.request', input);
      if (entry.threw) throw rehydrateThrown(entry.output);
      return entry.output as NetworkResponse;
    },
  };

  const storage: StorageTransport = {
    async get(scope, key) {
      const entry = next('storage.get', { scope, key });
      if (entry.threw) throw rehydrateThrown(entry.output);
      return entry.output;
    },
    async put(scope, key, value) {
      const entry = next('storage.put', { scope, key, value });
      if (entry.threw) throw rehydrateThrown(entry.output);
    },
    async delete(scope, key) {
      const entry = next('storage.delete', { scope, key });
      if (entry.threw) throw rehydrateThrown(entry.output);
    },
    async list(scope, prefix) {
      const entry = next('storage.list', { scope, prefix });
      if (entry.threw) throw rehydrateThrown(entry.output);
      return entry.output as string[];
    },
  };

  const clock: ClockTransport = {
    now() {
      const entry = next('clock.now', null);
      return entry.output as number;
    },
  };

  const audit: AuditTransport = {
    emit(event) {
      next('audit.emit', {
        capabilityId: event.capabilityId,
        name: event.name,
        payload: event.payload,
      });
    },
  };

  return { network, storage, clock, audit };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>).sort();
  const bKeys = Object.keys(b as Record<string, unknown>).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) if (aKeys[i] !== bKeys[i]) return false;
  for (const k of aKeys) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

function stringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function serializeThrown(e: unknown): { error: { name: string; message: string } } {
  if (e instanceof Error) return { error: { name: e.name, message: e.message } };
  return { error: { name: 'NonError', message: String(e) } };
}

function rehydrateThrown(serialized: unknown): Error {
  if (
    typeof serialized === 'object' &&
    serialized !== null &&
    'error' in (serialized as Record<string, unknown>)
  ) {
    const e = (serialized as { error: { name?: string; message?: string } }).error;
    const err = new Error(e.message ?? 'replayed error');
    if (e.name) err.name = e.name;
    return err;
  }
  return new Error('replayed error');
}
