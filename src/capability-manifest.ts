export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type PermissionId = string;

export type NetworkPermission = {
  type: 'network';
  id: PermissionId;
  hosts: string[];
  methods?: HttpMethod[];
  reason: string;
};

export type StorageMode = 'read' | 'write' | 'readwrite';

export type StoragePermission = {
  type: 'storage';
  id: PermissionId;
  scope: string;
  mode: StorageMode;
  reason: string;
};

export type UiPermission = {
  type: 'ui';
  id: PermissionId;
  reason: string;
};

export type ClockPermission = {
  type: 'clock';
  id: PermissionId;
  reason: string;
};

export type AuditPermission = {
  type: 'audit';
  id: PermissionId;
  reason: string;
};

export type Permission =
  | NetworkPermission
  | StoragePermission
  | UiPermission
  | ClockPermission
  | AuditPermission;

export type PermissionType = Permission['type'];

export type JSONSchema = {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  const?: unknown;
  description?: string;
  [key: string]: unknown;
};

export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  description: string;
  sensitive?: boolean;
  default?: unknown;
}

export interface ActionManifest {
  id: string;
  description: string;
  input: JSONSchema;
  output: JSONSchema;
  capabilities: PermissionId[];
  destructive?: boolean;
  handler: string;
  redact?: string[];
}

export interface ScreenManifest {
  id: string;
  title: string;
  component: string;
  steps?: string[];
}

export interface CapabilityEvents {
  emits?: string[];
  subscribes?: string[];
}

export interface CapabilityImplementation {
  type: 'module';
  entry: string;
}

export interface CapabilityManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  description: string;
  capabilities: Permission[];
  config?: Record<string, ConfigField>;
  actions: ActionManifest[];
  screens?: ScreenManifest[];
  events?: CapabilityEvents;
  implementation: CapabilityImplementation;
}

export const CAPABILITY_MANIFEST_SCHEMA_VERSION = 1 as const;

export const PERMISSION_TYPES: readonly PermissionType[] = [
  'network',
  'storage',
  'ui',
  'clock',
  'audit',
] as const;

export const HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

export const STORAGE_MODES: readonly StorageMode[] = ['read', 'write', 'readwrite'] as const;

import type { StructuredError } from './errors.js';

export type ManifestError = StructuredError;

export interface ManifestValidationResult {
  valid: boolean;
  errors: ManifestError[];
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const ID_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function validateCapabilityManifest(input: unknown): ManifestValidationResult {
  const errors: ManifestError[] = [];
  const push = (e: ManifestError) => errors.push(e);

  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: [
        {
          code: 'manifest.not_object',
          where: '$',
          expected: 'object',
          actual: typeOf(input),
          fixHint: 'Provide a CapabilityManifest object.',
        },
      ],
    };
  }

  const m = input as Record<string, unknown>;

  if (m.schemaVersion !== CAPABILITY_MANIFEST_SCHEMA_VERSION) {
    push({
      code: 'manifest.schema_version',
      where: '$.schemaVersion',
      expected: String(CAPABILITY_MANIFEST_SCHEMA_VERSION),
      actual: String(m.schemaVersion),
      fixHint: `Set schemaVersion to ${CAPABILITY_MANIFEST_SCHEMA_VERSION}.`,
    });
  }

  requireString(m, 'id', '$.id', push, ID_RE, 'lowercase dot/underscore/hyphen segments, e.g. "ops.fraud.triage"');
  requireSemver(m, 'version', '$.version', push);
  requireString(m, 'title', '$.title', push);
  requireString(m, 'description', '$.description', push);

  const capabilityIds = new Set<string>();
  if (!Array.isArray(m.capabilities)) {
    push({
      code: 'manifest.capabilities.type',
      where: '$.capabilities',
      expected: 'array',
      actual: typeOf(m.capabilities),
      fixHint: 'Set capabilities to an array (use [] if none, but actions cannot reference any).',
    });
  } else {
    m.capabilities.forEach((cap, i) => validatePermission(cap, `$.capabilities[${i}]`, capabilityIds, push));
  }

  if (m.config !== undefined) {
    if (!isPlainObject(m.config)) {
      push({
        code: 'manifest.config.type',
        where: '$.config',
        expected: 'object',
        actual: typeOf(m.config),
        fixHint: 'Set config to an object mapping field names to ConfigField, or omit it.',
      });
    } else {
      for (const [key, field] of Object.entries(m.config)) {
        validateConfigField(field, `$.config.${key}`, push);
      }
    }
  }

  const actionIds = new Set<string>();
  if (!Array.isArray(m.actions)) {
    push({
      code: 'manifest.actions.type',
      where: '$.actions',
      expected: 'array',
      actual: typeOf(m.actions),
      fixHint: 'Set actions to an array of ActionManifest entries.',
    });
  } else if (m.actions.length === 0) {
    push({
      code: 'manifest.actions.empty',
      where: '$.actions',
      expected: 'at least one action',
      actual: 'empty array',
      fixHint: 'A feature must declare at least one action; otherwise it has no behavior.',
    });
  } else {
    m.actions.forEach((a, i) =>
      validateAction(a, `$.actions[${i}]`, actionIds, capabilityIds, push)
    );
  }

  if (m.screens !== undefined) {
    if (!Array.isArray(m.screens)) {
      push({
        code: 'manifest.screens.type',
        where: '$.screens',
        expected: 'array',
        actual: typeOf(m.screens),
        fixHint: 'Set screens to an array of ScreenManifest entries, or omit it.',
      });
    } else {
      const screenIds = new Set<string>();
      m.screens.forEach((s, i) => validateScreen(s, `$.screens[${i}]`, screenIds, push));
    }
  }

  if (m.events !== undefined) {
    if (!isPlainObject(m.events)) {
      push({
        code: 'manifest.events.type',
        where: '$.events',
        expected: 'object',
        actual: typeOf(m.events),
        fixHint: 'Set events to { emits?, subscribes? } or omit it.',
      });
    } else {
      const ev = m.events as Record<string, unknown>;
      validateStringArray(ev.emits, '$.events.emits', push, true);
      validateStringArray(ev.subscribes, '$.events.subscribes', push, true);
    }
  }

  if (!isPlainObject(m.implementation)) {
    push({
      code: 'manifest.implementation.type',
      where: '$.implementation',
      expected: 'object',
      actual: typeOf(m.implementation),
      fixHint: 'Set implementation to { type: "module", entry: "<path>" }.',
    });
  } else {
    const impl = m.implementation as Record<string, unknown>;
    if (impl.type !== 'module') {
      push({
        code: 'manifest.implementation.type_value',
        where: '$.implementation.type',
        expected: '"module"',
        actual: typeOf(impl.type) === 'string' ? `"${String(impl.type)}"` : typeOf(impl.type),
        fixHint: 'Only "module" is supported in schemaVersion 1.',
      });
    }
    requireString(impl, 'entry', '$.implementation.entry', push);
  }

  return { valid: errors.length === 0, errors };
}

function validatePermission(
  cap: unknown,
  where: string,
  seen: Set<string>,
  push: (e: ManifestError) => void
): void {
  if (!isPlainObject(cap)) {
    push({
      code: 'capability.not_object',
      where,
      expected: 'object',
      actual: typeOf(cap),
      fixHint: 'Each capability must be an object with type, id, reason.',
    });
    return;
  }

  const c = cap as Record<string, unknown>;
  const type = c.type;
  if (typeof type !== 'string' || !PERMISSION_TYPES.includes(type as PermissionType)) {
    push({
      code: 'capability.type',
      where: `${where}.type`,
      expected: `one of ${PERMISSION_TYPES.join(', ')}`,
      actual: String(type),
      fixHint: 'Use a supported capability type.',
    });
    return;
  }

  const idOk = requireString(c, 'id', `${where}.id`, push, ID_RE);
  if (idOk && typeof c.id === 'string') {
    if (seen.has(c.id)) {
      push({
        code: 'capability.duplicate_id',
        where: `${where}.id`,
        expected: 'unique capability id',
        actual: `duplicate "${c.id}"`,
        fixHint: 'Each capability id must be unique within the manifest.',
      });
    } else {
      seen.add(c.id);
    }
  }

  requireString(c, 'reason', `${where}.reason`, push);

  if (type === 'network') {
    if (!Array.isArray(c.hosts) || c.hosts.length === 0) {
      push({
        code: 'capability.network.hosts',
        where: `${where}.hosts`,
        expected: 'non-empty string array',
        actual: typeOf(c.hosts),
        fixHint: 'List the hostnames this capability is allowed to reach.',
      });
    } else {
      c.hosts.forEach((h, i) => {
        if (typeof h !== 'string' || h.length === 0) {
          push({
            code: 'capability.network.host_value',
            where: `${where}.hosts[${i}]`,
            expected: 'non-empty string',
            actual: typeOf(h),
            fixHint: 'Each host must be a non-empty string (e.g. "api.example.com").',
          });
        }
      });
    }
    if (c.methods !== undefined) {
      if (!Array.isArray(c.methods)) {
        push({
          code: 'capability.network.methods',
          where: `${where}.methods`,
          expected: 'array of HTTP methods',
          actual: typeOf(c.methods),
          fixHint: `Use a subset of ${HTTP_METHODS.join(', ')}.`,
        });
      } else {
        c.methods.forEach((mm, i) => {
          if (typeof mm !== 'string' || !HTTP_METHODS.includes(mm as HttpMethod)) {
            push({
              code: 'capability.network.method_value',
              where: `${where}.methods[${i}]`,
              expected: `one of ${HTTP_METHODS.join(', ')}`,
              actual: String(mm),
              fixHint: 'Use a supported HTTP method.',
            });
          }
        });
      }
    }
  }

  if (type === 'storage') {
    requireString(c, 'scope', `${where}.scope`, push);
    if (typeof c.mode !== 'string' || !STORAGE_MODES.includes(c.mode as StorageMode)) {
      push({
        code: 'capability.storage.mode',
        where: `${where}.mode`,
        expected: `one of ${STORAGE_MODES.join(', ')}`,
        actual: String(c.mode),
        fixHint: 'Storage mode must be read, write, or readwrite.',
      });
    }
  }
}

function validateAction(
  action: unknown,
  where: string,
  seen: Set<string>,
  capabilityIds: Set<string>,
  push: (e: ManifestError) => void
): void {
  if (!isPlainObject(action)) {
    push({
      code: 'action.not_object',
      where,
      expected: 'object',
      actual: typeOf(action),
      fixHint: 'Each action must be an ActionManifest object.',
    });
    return;
  }

  const a = action as Record<string, unknown>;
  const idOk = requireString(a, 'id', `${where}.id`, push, ID_RE);
  if (idOk && typeof a.id === 'string') {
    if (seen.has(a.id)) {
      push({
        code: 'action.duplicate_id',
        where: `${where}.id`,
        expected: 'unique action id',
        actual: `duplicate "${a.id}"`,
        fixHint: 'Each action id must be unique within the manifest.',
      });
    } else {
      seen.add(a.id);
    }
  }

  requireString(a, 'description', `${where}.description`, push);
  requireString(a, 'handler', `${where}.handler`, push);

  if (!isPlainObject(a.input)) {
    push({
      code: 'action.input.type',
      where: `${where}.input`,
      expected: 'JSON Schema object',
      actual: typeOf(a.input),
      fixHint: 'Provide a JSON Schema describing the action input.',
    });
  }
  if (!isPlainObject(a.output)) {
    push({
      code: 'action.output.type',
      where: `${where}.output`,
      expected: 'JSON Schema object',
      actual: typeOf(a.output),
      fixHint: 'Provide a JSON Schema describing the action output.',
    });
  }

  if (!Array.isArray(a.capabilities)) {
    push({
      code: 'action.capabilities.type',
      where: `${where}.capabilities`,
      expected: 'array of capability ids',
      actual: typeOf(a.capabilities),
      fixHint: 'List the capability ids this action may use (use [] for pure actions).',
    });
  } else {
    a.capabilities.forEach((capId, i) => {
      if (typeof capId !== 'string') {
        push({
          code: 'action.capability_ref.type',
          where: `${where}.capabilities[${i}]`,
          expected: 'string',
          actual: typeOf(capId),
          fixHint: 'Each entry must be a capability id declared in $.capabilities.',
        });
        return;
      }
      if (!capabilityIds.has(capId)) {
        push({
          code: 'action.capability_ref.unknown',
          where: `${where}.capabilities[${i}]`,
          expected: 'a capability id declared in $.capabilities',
          actual: `"${capId}"`,
          fixHint: `Declare a capability with id "${capId}" or remove this reference.`,
        });
      }
    });
  }

  if (a.destructive !== undefined && typeof a.destructive !== 'boolean') {
    push({
      code: 'action.destructive.type',
      where: `${where}.destructive`,
      expected: 'boolean',
      actual: typeOf(a.destructive),
      fixHint: 'destructive must be true/false or omitted (defaults to false).',
    });
  }

  if (a.redact !== undefined) {
    validateStringArray(a.redact, `${where}.redact`, push, true);
  }
}

function validateScreen(
  screen: unknown,
  where: string,
  seen: Set<string>,
  push: (e: ManifestError) => void
): void {
  if (!isPlainObject(screen)) {
    push({
      code: 'screen.not_object',
      where,
      expected: 'object',
      actual: typeOf(screen),
      fixHint: 'Each screen must be a ScreenManifest object.',
    });
    return;
  }
  const s = screen as Record<string, unknown>;
  const idOk = requireString(s, 'id', `${where}.id`, push, ID_RE);
  if (idOk && typeof s.id === 'string') {
    if (seen.has(s.id)) {
      push({
        code: 'screen.duplicate_id',
        where: `${where}.id`,
        expected: 'unique screen id',
        actual: `duplicate "${s.id}"`,
        fixHint: 'Each screen id must be unique within the manifest.',
      });
    } else {
      seen.add(s.id);
    }
  }
  requireString(s, 'title', `${where}.title`, push);
  requireString(s, 'component', `${where}.component`, push);
  if (s.steps !== undefined) {
    validateStringArray(s.steps, `${where}.steps`, push, false);
  }
}

function validateConfigField(
  field: unknown,
  where: string,
  push: (e: ManifestError) => void
): void {
  if (!isPlainObject(field)) {
    push({
      code: 'config.field.not_object',
      where,
      expected: 'object',
      actual: typeOf(field),
      fixHint: 'Each config field must be a ConfigField object.',
    });
    return;
  }
  const f = field as Record<string, unknown>;
  const allowed = ['string', 'number', 'boolean', 'object'];
  if (typeof f.type !== 'string' || !allowed.includes(f.type)) {
    push({
      code: 'config.field.type',
      where: `${where}.type`,
      expected: `one of ${allowed.join(', ')}`,
      actual: String(f.type),
      fixHint: 'Use a supported config field type.',
    });
  }
  requireString(f, 'description', `${where}.description`, push);
  if (f.required !== undefined && typeof f.required !== 'boolean') {
    push({
      code: 'config.field.required.type',
      where: `${where}.required`,
      expected: 'boolean',
      actual: typeOf(f.required),
      fixHint: 'required must be true/false or omitted.',
    });
  }
  if (f.sensitive !== undefined && typeof f.sensitive !== 'boolean') {
    push({
      code: 'config.field.sensitive.type',
      where: `${where}.sensitive`,
      expected: 'boolean',
      actual: typeOf(f.sensitive),
      fixHint: 'sensitive must be true/false or omitted.',
    });
  }
}

function validateStringArray(
  value: unknown,
  where: string,
  push: (e: ManifestError) => void,
  allowEmpty: boolean
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    push({
      code: 'array.string.type',
      where,
      expected: 'string array',
      actual: typeOf(value),
      fixHint: 'Provide an array of strings, or omit it.',
    });
    return;
  }
  if (!allowEmpty && value.length === 0) {
    push({
      code: 'array.string.empty',
      where,
      expected: 'non-empty string array',
      actual: 'empty array',
      fixHint: 'Provide at least one entry or omit the field.',
    });
  }
  value.forEach((v, i) => {
    if (typeof v !== 'string' || v.length === 0) {
      push({
        code: 'array.string.value',
        where: `${where}[${i}]`,
        expected: 'non-empty string',
        actual: typeOf(v),
        fixHint: 'Each entry must be a non-empty string.',
      });
    }
  });
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  where: string,
  push: (e: ManifestError) => void,
  pattern?: RegExp,
  patternHint?: string
): boolean {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    push({
      code: 'string.required',
      where,
      expected: 'non-empty string',
      actual: typeOf(v),
      fixHint: `Set ${where} to a non-empty string.`,
    });
    return false;
  }
  if (pattern && !pattern.test(v)) {
    push({
      code: 'string.pattern',
      where,
      expected: patternHint ?? `string matching ${pattern}`,
      actual: `"${v}"`,
      fixHint: patternHint
        ? `Use ${patternHint}.`
        : `Value must match ${pattern}.`,
    });
    return false;
  }
  return true;
}

function requireSemver(
  obj: Record<string, unknown>,
  key: string,
  where: string,
  push: (e: ManifestError) => void
): void {
  const v = obj[key];
  if (typeof v !== 'string' || !SEMVER_RE.test(v)) {
    push({
      code: 'semver.invalid',
      where,
      expected: 'semver string (e.g. "0.1.0")',
      actual: typeof v === 'string' ? `"${v}"` : typeOf(v),
      fixHint: 'Use semantic versioning: MAJOR.MINOR.PATCH.',
    });
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
