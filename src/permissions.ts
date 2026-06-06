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

export class PermissionError extends Error {
  readonly structured: StructuredError;
  constructor(structured: StructuredError) {
    super(formatStructuredError(structured));
    this.name = 'PermissionError';
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
  readonly permissionId: PermissionId;
  request(input: NetworkRequest): Promise<NetworkResponse>;
}

export interface StorageBroker {
  readonly permissionId: PermissionId;
  readonly mode: StorageMode;
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface ClockBroker {
  readonly permissionId: PermissionId;
  now(): number;
  iso(): string;
}

export interface AuditBroker {
  readonly permissionId: PermissionId;
  emit(event: string, payload?: unknown): void;
}

export interface UiBroker {
  readonly permissionId: PermissionId;
}

export type Broker =
  | NetworkBroker
  | StorageBroker
  | ClockBroker
  | AuditBroker
  | UiBroker;

export interface NetworkTransport {
  request(input: NetworkRequest & { resolvedIp?: string }): Promise<NetworkResponse>;
  resolve?(hostname: string): Promise<string[]>;
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
  emit(event: { permissionId: PermissionId; name: string; payload?: unknown; at: number }): void;
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
  for (const perm of manifest.permissions) {
    byId.set(perm.id, perm);
  }

  const hasDynamic = manifest.permissions.some((p) => p.type === 'network-dynamic');
  if (hasDynamic && !transports.network?.resolve) {
    throw new PermissionError({
      code: 'permission.network.no_resolver',
      where: 'createPermissionRegistry(transports)',
      expected: 'HostTransports.network.resolve(hostname) => Promise<string[]>',
      actual: transports.network ? 'transport.resolve is undefined' : 'transports.network is undefined',
      fixHint:
        'Provide HostTransports.network.resolve(hostname) => Promise<string[]>; required when any type:network-dynamic permission is declared on the manifest.',
    });
  }

  const brokers = new Map<PermissionId, Broker>();
  for (const perm of manifest.permissions) {
    brokers.set(perm.id, buildBroker(perm, transports));
  }

  const actionsById = new Map<string, ActionManifest>();
  for (const a of manifest.actions) actionsById.set(a.id, a);

  return {
    forAction(actionId: string): ActionPermissionScope {
      const action = actionsById.get(actionId);
      if (!action) {
        throw new PermissionError({
          code: 'permission.action.unknown',
          where: `manifest.actions[id=${actionId}]`,
          expected: 'a declared action id',
          actual: actionId,
          fixHint: 'Only actions declared in the manifest can request permissions.',
        });
      }
      const allowed = new Set(action.permissions);
      for (const ref of allowed) {
        if (!byId.has(ref)) {
          throw new PermissionError({
            code: 'permission.action.unknown_ref',
            where: `manifest.actions[id=${actionId}].permissions`,
            expected: 'a permission id declared in $.permissions',
            actual: ref,
            fixHint: `Declare a permission with id "${ref}" or remove the reference.`,
          });
        }
      }

      return {
        has(id: PermissionId): boolean {
          return allowed.has(id) && brokers.has(id);
        },
        cap(id: PermissionId): Broker {
          if (!byId.has(id)) {
            throw new PermissionError({
              code: 'permission.undeclared',
              where: `action[${actionId}].cap("${id}")`,
              expected: 'a permission declared on the manifest',
              actual: `unknown id "${id}"`,
              fixHint: `Add a permission with id "${id}" to the manifest, or use a declared one.`,
            });
          }
          if (!allowed.has(id)) {
            throw new PermissionError({
              code: 'permission.denied',
              where: `action[${actionId}].cap("${id}")`,
              expected: `permission "${id}" declared on this action`,
              actual: `not in action.permissions = [${[...allowed].join(', ') || 'none'}]`,
              fixHint: `Add "${id}" to action "${actionId}".permissions, or call this from a different action.`,
            });
          }
          const broker = brokers.get(id);
          if (!broker) {
            throw new PermissionError({
              code: 'permission.no_broker',
              where: `action[${actionId}].cap("${id}")`,
              expected: 'a broker for this permission',
              actual: 'no broker registered',
              fixHint: 'A host transport for this permission type was not provided to the runtime.',
            });
          }
          return broker;
        },
      };
    },
  };
}

function buildBroker(perm: Permission, transports: HostTransports): Broker {
  switch (perm.type) {
    case 'network':
      return buildNetworkBroker(perm, transports.network);
    case 'network-dynamic':
      throw new PermissionError({
        code: 'permission.network-dynamic.not_implemented',
        where: `permissions[id=${perm.id}]`,
        expected: 'a runtime version that implements network-dynamic brokers',
        actual: 'network-dynamic broker not implemented yet',
        fixHint:
          'network-dynamic brokers are not yet supported by this runtime version; use type:network for now.',
      });
    case 'storage':
      return buildStorageBroker(perm, transports.storage);
    case 'clock':
      return buildClockBroker(perm, transports.clock);
    case 'audit':
      return buildAuditBroker(perm, transports.audit);
    case 'ui':
      return { permissionId: perm.id } satisfies UiBroker;
  }
}

function buildNetworkBroker(perm: NetworkPermission, transport?: NetworkTransport): NetworkBroker {
  const allowedHosts = new Set(perm.hosts);
  const allowedMethods = perm.methods ? new Set(perm.methods) : null;
  const id = perm.id;
  return {
    permissionId: id,
    async request(input: NetworkRequest): Promise<NetworkResponse> {
      if (!transport) {
        throw new PermissionError({
          code: 'permission.network.no_transport',
          where: `cap("${id}").request`,
          expected: 'a network transport provided to the runtime',
          actual: 'undefined',
          fixHint: 'Provide HostTransports.network when constructing the runtime.',
        });
      }
      const host = parseHost(input.url);
      if (host === null) {
        throw new PermissionError({
          code: 'permission.network.bad_url',
          where: `cap("${id}").request.url`,
          expected: 'an absolute URL with a host (https://host/path)',
          actual: input.url,
          fixHint: 'Pass an absolute URL whose host appears in the permission host list.',
        });
      }
      if (!allowedHosts.has(host)) {
        throw new PermissionError({
          code: 'permission.network.host_denied',
          where: `cap("${id}").request.url`,
          expected: `host in [${[...allowedHosts].join(', ')}]`,
          actual: host,
          fixHint: `Either change the URL host to a declared one, or add "${host}" to permission "${id}".hosts.`,
        });
      }
      if (allowedMethods && !allowedMethods.has(input.method)) {
        throw new PermissionError({
          code: 'permission.network.method_denied',
          where: `cap("${id}").request.method`,
          expected: `method in [${[...allowedMethods].join(', ')}]`,
          actual: input.method,
          fixHint: `Use a declared method, or add "${input.method}" to permission "${id}".methods.`,
        });
      }
      return transport.request(input);
    },
  };
}

function buildStorageBroker(perm: StoragePermission, transport?: StorageTransport): StorageBroker {
  const id = perm.id;
  const scope = perm.scope;
  const mode = perm.mode;
  const canRead = mode === 'read' || mode === 'readwrite';
  const canWrite = mode === 'write' || mode === 'readwrite';

  const requireTransport = (): StorageTransport => {
    if (!transport) {
      throw new PermissionError({
        code: 'permission.storage.no_transport',
        where: `cap("${id}")`,
        expected: 'a storage transport provided to the runtime',
        actual: 'undefined',
        fixHint: 'Provide HostTransports.storage when constructing the runtime.',
      });
    }
    return transport;
  };

  const denyRead = (op: string) => {
    throw new PermissionError({
      code: 'permission.storage.read_denied',
      where: `cap("${id}").${op}`,
      expected: `mode "read" or "readwrite"`,
      actual: `mode "${mode}"`,
      fixHint: `Permission "${id}" was declared with mode "${mode}"; reads are not permitted.`,
    });
  };

  const denyWrite = (op: string) => {
    throw new PermissionError({
      code: 'permission.storage.write_denied',
      where: `cap("${id}").${op}`,
      expected: `mode "write" or "readwrite"`,
      actual: `mode "${mode}"`,
      fixHint: `Permission "${id}" was declared with mode "${mode}"; writes are not permitted.`,
    });
  };

  return {
    permissionId: id,
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

function buildClockBroker(perm: Permission, transport?: ClockTransport): ClockBroker {
  const id = perm.id;
  return {
    permissionId: id,
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

function buildAuditBroker(perm: Permission, transport?: AuditTransport): AuditBroker {
  const id = perm.id;
  return {
    permissionId: id,
    emit(event: string, payload?: unknown): void {
      if (!transport) {
        throw new PermissionError({
          code: 'permission.audit.no_transport',
          where: `cap("${id}").emit`,
          expected: 'an audit transport provided to the runtime',
          actual: 'undefined',
          fixHint: 'Provide HostTransports.audit when constructing the runtime; audit must not be silently dropped.',
        });
      }
      transport.emit({ permissionId: id, name: event, payload, at: Date.now() });
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
