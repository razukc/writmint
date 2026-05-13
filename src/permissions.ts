import type {
  Permission,
  PermissionId,
  HttpMethod,
  NetworkPermission,
  StoragePermission,
  StorageMode,
  ActionManifest,
  CapabilityManifest,
} from './capability-manifest.js';
import { formatStructuredError, type StructuredError } from './errors.js';

export type { StructuredError };

export class CapabilityError extends Error {
  readonly structured: StructuredError;
  constructor(structured: StructuredError) {
    super(formatStructuredError(structured));
    this.name = 'CapabilityError';
    this.structured = structured;
  }
}

export interface NetworkRequest {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface NetworkResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface NetworkBroker {
  readonly capabilityId: PermissionId;
  request(input: NetworkRequest): Promise<NetworkResponse>;
}

export interface StorageBroker {
  readonly capabilityId: PermissionId;
  readonly mode: StorageMode;
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface ClockBroker {
  readonly capabilityId: PermissionId;
  now(): number;
  iso(): string;
}

export interface AuditBroker {
  readonly capabilityId: PermissionId;
  emit(event: string, payload?: unknown): void;
}

export interface UiBroker {
  readonly capabilityId: PermissionId;
}

export type Broker =
  | NetworkBroker
  | StorageBroker
  | ClockBroker
  | AuditBroker
  | UiBroker;

export interface NetworkTransport {
  request(input: NetworkRequest): Promise<NetworkResponse>;
}

export interface StorageTransport {
  get(scope: string, key: string): Promise<unknown>;
  put(scope: string, key: string, value: unknown): Promise<void>;
  delete(scope: string, key: string): Promise<void>;
  list(scope: string, prefix?: string): Promise<string[]>;
}

export interface ClockTransport {
  now(): number;
}

export interface AuditTransport {
  emit(event: { capabilityId: PermissionId; name: string; payload?: unknown; at: number }): void;
}

export interface HostTransports {
  network?: NetworkTransport;
  storage?: StorageTransport;
  clock?: ClockTransport;
  audit?: AuditTransport;
}

export interface ActionPermissionScope {
  cap(id: PermissionId): Broker;
  has(id: PermissionId): boolean;
}

export interface PermissionRegistry {
  forAction(actionId: string): ActionPermissionScope;
}

export function createPermissionRegistry(
  manifest: CapabilityManifest,
  transports: HostTransports
): PermissionRegistry {
  const byId = new Map<PermissionId, Permission>();
  for (const cap of manifest.capabilities) {
    byId.set(cap.id, cap);
  }

  const brokers = new Map<PermissionId, Broker>();
  for (const cap of manifest.capabilities) {
    brokers.set(cap.id, buildBroker(cap, transports));
  }

  const actionsById = new Map<string, ActionManifest>();
  for (const a of manifest.actions) actionsById.set(a.id, a);

  return {
    forAction(actionId: string): ActionPermissionScope {
      const action = actionsById.get(actionId);
      if (!action) {
        throw new CapabilityError({
          code: 'capability.action.unknown',
          where: `manifest.actions[id=${actionId}]`,
          expected: 'a declared action id',
          actual: actionId,
          fixHint: 'Only actions declared in the manifest can request capabilities.',
        });
      }
      const allowed = new Set(action.capabilities);
      for (const ref of allowed) {
        if (!byId.has(ref)) {
          throw new CapabilityError({
            code: 'capability.action.unknown_ref',
            where: `manifest.actions[id=${actionId}].capabilities`,
            expected: 'a capability id declared in $.capabilities',
            actual: ref,
            fixHint: `Declare a capability with id "${ref}" or remove the reference.`,
          });
        }
      }

      return {
        has(id: PermissionId): boolean {
          return allowed.has(id) && brokers.has(id);
        },
        cap(id: PermissionId): Broker {
          if (!byId.has(id)) {
            throw new CapabilityError({
              code: 'capability.undeclared',
              where: `action[${actionId}].cap("${id}")`,
              expected: 'a capability declared on the manifest',
              actual: `unknown id "${id}"`,
              fixHint: `Add a capability with id "${id}" to the manifest, or use a declared one.`,
            });
          }
          if (!allowed.has(id)) {
            throw new CapabilityError({
              code: 'capability.denied',
              where: `action[${actionId}].cap("${id}")`,
              expected: `capability "${id}" declared on this action`,
              actual: `not in action.capabilities = [${[...allowed].join(', ') || 'none'}]`,
              fixHint: `Add "${id}" to action "${actionId}".capabilities, or call this from a different action.`,
            });
          }
          const broker = brokers.get(id);
          if (!broker) {
            throw new CapabilityError({
              code: 'capability.no_broker',
              where: `action[${actionId}].cap("${id}")`,
              expected: 'a broker for this capability',
              actual: 'no broker registered',
              fixHint: 'A host transport for this capability type was not provided to the runtime.',
            });
          }
          return broker;
        },
      };
    },
  };
}

function buildBroker(cap: Permission, transports: HostTransports): Broker {
  switch (cap.type) {
    case 'network':
      return buildNetworkBroker(cap, transports.network);
    case 'storage':
      return buildStorageBroker(cap, transports.storage);
    case 'clock':
      return buildClockBroker(cap, transports.clock);
    case 'audit':
      return buildAuditBroker(cap, transports.audit);
    case 'ui':
      return { capabilityId: cap.id } satisfies UiBroker;
  }
}

function buildNetworkBroker(cap: NetworkPermission, transport?: NetworkTransport): NetworkBroker {
  const allowedHosts = new Set(cap.hosts);
  const allowedMethods = cap.methods ? new Set(cap.methods) : null;
  const id = cap.id;
  return {
    capabilityId: id,
    async request(input: NetworkRequest): Promise<NetworkResponse> {
      if (!transport) {
        throw new CapabilityError({
          code: 'capability.network.no_transport',
          where: `cap("${id}").request`,
          expected: 'a network transport provided to the runtime',
          actual: 'undefined',
          fixHint: 'Provide HostTransports.network when constructing the runtime.',
        });
      }
      const host = parseHost(input.url);
      if (host === null) {
        throw new CapabilityError({
          code: 'capability.network.bad_url',
          where: `cap("${id}").request.url`,
          expected: 'an absolute URL with a host (https://host/path)',
          actual: input.url,
          fixHint: 'Pass an absolute URL whose host appears in the capability host list.',
        });
      }
      if (!allowedHosts.has(host)) {
        throw new CapabilityError({
          code: 'capability.network.host_denied',
          where: `cap("${id}").request.url`,
          expected: `host in [${[...allowedHosts].join(', ')}]`,
          actual: host,
          fixHint: `Either change the URL host to a declared one, or add "${host}" to capability "${id}".hosts.`,
        });
      }
      if (allowedMethods && !allowedMethods.has(input.method)) {
        throw new CapabilityError({
          code: 'capability.network.method_denied',
          where: `cap("${id}").request.method`,
          expected: `method in [${[...allowedMethods].join(', ')}]`,
          actual: input.method,
          fixHint: `Use a declared method, or add "${input.method}" to capability "${id}".methods.`,
        });
      }
      return transport.request(input);
    },
  };
}

function buildStorageBroker(cap: StoragePermission, transport?: StorageTransport): StorageBroker {
  const id = cap.id;
  const scope = cap.scope;
  const mode = cap.mode;
  const canRead = mode === 'read' || mode === 'readwrite';
  const canWrite = mode === 'write' || mode === 'readwrite';

  const requireTransport = (): StorageTransport => {
    if (!transport) {
      throw new CapabilityError({
        code: 'capability.storage.no_transport',
        where: `cap("${id}")`,
        expected: 'a storage transport provided to the runtime',
        actual: 'undefined',
        fixHint: 'Provide HostTransports.storage when constructing the runtime.',
      });
    }
    return transport;
  };

  const denyRead = (op: string) => {
    throw new CapabilityError({
      code: 'capability.storage.read_denied',
      where: `cap("${id}").${op}`,
      expected: `mode "read" or "readwrite"`,
      actual: `mode "${mode}"`,
      fixHint: `Capability "${id}" was declared with mode "${mode}"; reads are not permitted.`,
    });
  };

  const denyWrite = (op: string) => {
    throw new CapabilityError({
      code: 'capability.storage.write_denied',
      where: `cap("${id}").${op}`,
      expected: `mode "write" or "readwrite"`,
      actual: `mode "${mode}"`,
      fixHint: `Capability "${id}" was declared with mode "${mode}"; writes are not permitted.`,
    });
  };

  return {
    capabilityId: id,
    mode,
    async get(key: string): Promise<unknown> {
      if (!canRead) denyRead('get');
      return requireTransport().get(scope, key);
    },
    async put(key: string, value: unknown): Promise<void> {
      if (!canWrite) denyWrite('put');
      return requireTransport().put(scope, key, value);
    },
    async delete(key: string): Promise<void> {
      if (!canWrite) denyWrite('delete');
      return requireTransport().delete(scope, key);
    },
    async list(prefix?: string): Promise<string[]> {
      if (!canRead) denyRead('list');
      return requireTransport().list(scope, prefix);
    },
  };
}

function buildClockBroker(cap: Permission, transport?: ClockTransport): ClockBroker {
  const id = cap.id;
  return {
    capabilityId: id,
    now(): number {
      if (transport) return transport.now();
      return Date.now();
    },
    iso(): string {
      const t = transport ? transport.now() : Date.now();
      return new Date(t).toISOString();
    },
  };
}

function buildAuditBroker(cap: Permission, transport?: AuditTransport): AuditBroker {
  const id = cap.id;
  return {
    capabilityId: id,
    emit(event: string, payload?: unknown): void {
      if (!transport) {
        throw new CapabilityError({
          code: 'capability.audit.no_transport',
          where: `cap("${id}").emit`,
          expected: 'an audit transport provided to the runtime',
          actual: 'undefined',
          fixHint: 'Provide HostTransports.audit when constructing the runtime; audit must not be silently dropped.',
        });
      }
      transport.emit({ capabilityId: id, name: event, payload, at: Date.now() });
    },
  };
}

function parseHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
