export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type PermissionId = string;

export type NetworkPermission = {
  type: 'network';
  id: PermissionId;
  hosts: string[];
  methods?: HttpMethod[];
  reason: string;
};

export type HostPolicy = {
  registrableDomain: string[];
  scheme?: ('http' | 'https')[];
  port?: number[];
  denyPrivate?: boolean;
  pathPrefix?: string[];
};

export type NetworkDynamicPermission = {
  type: 'network-dynamic';
  id: PermissionId;
  hostPolicy: HostPolicy;
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
  | NetworkDynamicPermission
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
  permissions: PermissionId[];
  destructive?: boolean;
  // Opt-in two-person rule: when true on a destructive action, approve()
  // requires approvedBy and destructiveApprovedBy to be distinct values.
  // No-op on non-destructive actions.
  requireDistinctDestructiveApprover?: boolean;
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
  permissions: Permission[];
  config?: Record<string, ConfigField>;
  actions: ActionManifest[];
  screens?: ScreenManifest[];
  events?: CapabilityEvents;
  implementation: CapabilityImplementation;
}

export const CAPABILITY_MANIFEST_SCHEMA_VERSION = 1 as const;

export const PERMISSION_TYPES: readonly PermissionType[] = [
  'network',
  'network-dynamic',
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
import { isValidRegistrableDomainEntry } from './host-policy.js';

export type ManifestError = StructuredError;
export type ManifestWarning = StructuredError;

export interface ManifestValidationResult {
  valid: boolean;
  errors: ManifestError[];
  /**
   * JSON-pointer-style paths whose subtrees were too malformed to be hardened
   * meaningfully (e.g. a `permissions[i]` that wasn't an object, or a top-level
   * `actions` that wasn't an array). Consumers running hardening after
   * structural validation can pass this through `HardenOptions.skipPaths` so
   * hardening still runs on the rest of the manifest. See `verifyManifest`.
   */
  brokenPaths: string[];
}

export interface HardeningResult {
  errors: ManifestError[];
  warnings: ManifestWarning[];
}

export interface HardenOptions {
  /**
   * Skip hardening on these subtree paths. Used by `verifyManifest` to mix
   * structural and hardening errors in one pass without false positives on
   * already-broken subtrees. Accepts JSON-pointer-style paths matching
   * `validateCapabilityManifest`'s `brokenPaths` output.
   */
  skipPaths?: ReadonlySet<string>;
}

export interface ManifestVerificationResult {
  valid: boolean;
  errors: ManifestError[];
  warnings: ManifestWarning[];
}

const MIN_REASON_WORDS = 5;
const MIN_DESCRIPTION_WORDS = 5;

function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

// Canonical key sets for the unknown-field warning. Only structural
// boundaries (manifest, permissions, actions) are checked; JSONSchema
// bodies inside input/output/config are left alone because additionalProperties
// etc. are legitimate JSONSchema fields, not Writmint manifest errors.
const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'title',
  'description',
  'permissions',
  'config',
  'actions',
  'screens',
  'events',
  'implementation',
]);

const COMMON_PERMISSION_KEYS = new Set(['type', 'id', 'reason']);
const PERMISSION_KEYS_BY_TYPE: Record<PermissionType, Set<string>> = {
  network: new Set([...COMMON_PERMISSION_KEYS, 'hosts', 'methods']),
  'network-dynamic': new Set([...COMMON_PERMISSION_KEYS, 'hostPolicy', 'methods']),
  storage: new Set([...COMMON_PERMISSION_KEYS, 'scope', 'mode']),
  ui: new Set(COMMON_PERMISSION_KEYS),
  clock: new Set(COMMON_PERMISSION_KEYS),
  audit: new Set(COMMON_PERMISSION_KEYS),
};

const ACTION_KEYS = new Set([
  'id',
  'description',
  'input',
  'output',
  'permissions',
  'destructive',
  'requireDistinctDestructiveApprover',
  'handler',
  'redact',
]);

function unknownFieldWarning(where: string, key: string): ManifestWarning {
  return {
    code: 'manifest.unknown_field',
    where,
    expected: 'one of the canonical fields for this object',
    actual: `unknown field: ${key}`,
    fixHint:
      'Remove the field if it is not part of the v1 schema, or rename it to a canonical one.',
  };
}

export function hardenManifest(
  m: CapabilityManifest,
  options: HardenOptions = {}
): HardeningResult {
  const errors: ManifestError[] = [];
  const warnings: ManifestWarning[] = [];
  const skip = options.skipPaths ?? new Set<string>();

  // Tolerate partial input: when called from verifyManifest after a structural
  // failure, the runtime shape may not match CapabilityManifest exactly (e.g.
  // m.permissions might be undefined or not-an-array even though the type says
  // otherwise). Cast to a loose shape so the checks here never throw on
  // already-broken input; broken subtrees are skipped via skipPaths.
  const loose = m as unknown as {
    permissions?: unknown;
    actions?: unknown;
  };
  const permissionsArr = Array.isArray(loose.permissions) ? (loose.permissions as Permission[]) : [];
  const actionsArr = Array.isArray(loose.actions) ? (loose.actions as ActionManifest[]) : [];

  for (const key of Object.keys(m)) {
    if (!MANIFEST_KEYS.has(key)) {
      warnings.push(unknownFieldWarning(`$.${key}`, key));
    }
  }

  permissionsArr.forEach((perm, i) => {
    if (skip.has(`$.permissions[${i}]`)) return;
    if (!perm || typeof perm !== 'object') return;
    const allowed = PERMISSION_KEYS_BY_TYPE[perm.type];
    if (allowed) {
      for (const key of Object.keys(perm)) {
        if (!allowed.has(key)) {
          warnings.push(unknownFieldWarning(`$.permissions[${i}].${key}`, key));
        }
      }
    }
  });

  actionsArr.forEach((action, i) => {
    if (skip.has(`$.actions[${i}]`)) return;
    if (!action || typeof action !== 'object') return;
    for (const key of Object.keys(action)) {
      if (!ACTION_KEYS.has(key)) {
        warnings.push(unknownFieldWarning(`$.actions[${i}].${key}`, key));
      }
    }
  });

  permissionsArr.forEach((perm, i) => {
    if (skip.has(`$.permissions[${i}]`)) return;
    if (!perm || typeof perm !== 'object') return;
    const where = `$.permissions[${i}]`;

    if (typeof perm.reason === 'string' && wordCount(perm.reason) < MIN_REASON_WORDS) {
      errors.push({
        code: 'permission.reason.too_short',
        where: `${where}.reason`,
        expected: `reason with at least ${MIN_REASON_WORDS} words`,
        actual: `${wordCount(perm.reason)} word(s)`,
        fixHint:
          'Expand the reason to explain what this permission is used for and which action needs it.',
      });
    }

    if (perm.type === 'network') {
      perm.hosts.forEach((h, hi) => {
        if (typeof h === 'string' && h.includes('*')) {
          errors.push({
            code: 'permission.network.host_wildcard',
            where: `${where}.hosts[${hi}]`,
            expected: 'exact hostname (no wildcards)',
            actual: `"${h}"`,
            fixHint:
              "List each allowed hostname explicitly; wildcards make the call surface impossible to audit. If the URL is supplied at call time (the host isn't known at author time), use type:network-dynamic with hostPolicy.registrableDomain instead.",
          });
        }
      });
      if ((perm as Record<string, unknown>).hostPolicy !== undefined) {
        errors.push({
          code: 'permission.network.host_policy_forbidden',
          where: `${where}.hostPolicy`,
          expected: 'no hostPolicy on type:network',
          actual: 'hostPolicy present',
          fixHint:
            'Use hosts on type:network; hostPolicy is for type:network-dynamic. Change the permission type if the host is supplied at call time.',
        });
      }
    }

    if (perm.type === 'network-dynamic') {
      if ((perm as Record<string, unknown>).hosts !== undefined) {
        errors.push({
          code: 'permission.network-dynamic.hosts_forbidden',
          where: `${where}.hosts`,
          expected: 'no hosts on type:network-dynamic',
          actual: 'hosts present',
          fixHint:
            'Use hostPolicy.registrableDomain on type:network-dynamic; hosts is for type:network. Change the permission type if the host list is fixed at author time.',
        });
      }
      const hp = (perm as Record<string, unknown>).hostPolicy;
      if (isPlainObject(hp) && Array.isArray(hp.registrableDomain)) {
        hp.registrableDomain.forEach((d, di) => {
          if (typeof d === 'string' && !isValidRegistrableDomainEntry(d)) {
            errors.push({
              code: 'permission.network-dynamic.registrable_domain_invalid',
              where: `${where}.hostPolicy.registrableDomain[${di}]`,
              expected: 'a literal registrable domain (no wildcards, no leading/trailing dots)',
              actual: `"${d}"`,
              fixHint:
                'Wildcards are not permitted; list the registrable domain literally (e.g. "acme.com", not "*.acme.com" or ".acme.com").',
            });
          }
        });
      }
    }

    if (perm.type === 'storage') {
      if (typeof perm.scope === 'string' && perm.scope.includes('*')) {
        errors.push({
          code: 'permission.storage.scope_wildcard',
          where: `${where}.scope`,
          expected: 'exact scope (no wildcards)',
          actual: `"${perm.scope}"`,
          fixHint:
            'Name the storage scope explicitly; wildcards expand the blast radius beyond what the manifest declares.',
        });
      }
    }
  });

  actionsArr.forEach((action, i) => {
    if (skip.has(`$.actions[${i}]`)) return;
    if (!action || typeof action !== 'object') return;
    if (typeof action.description === 'string' && wordCount(action.description) < MIN_DESCRIPTION_WORDS) {
      errors.push({
        code: 'action.description.too_short',
        where: `$.actions[${i}].description`,
        expected: `description with at least ${MIN_DESCRIPTION_WORDS} words`,
        actual: `${wordCount(action.description)} word(s)`,
        fixHint:
          'Describe what the action does, what it touches, and any side effects worth flagging to an approver.',
      });
    }
  });

  const referencedBy = new Map<string, string[]>();
  actionsArr.forEach((action, i) => {
    if (skip.has(`$.actions[${i}]`)) return;
    if (!action || typeof action !== 'object') return;
    if (!Array.isArray(action.permissions)) return;
    for (const permId of action.permissions) {
      if (typeof permId !== 'string') continue;
      const list = referencedBy.get(permId) ?? [];
      list.push(action.id);
      referencedBy.set(permId, list);
    }
  });

  permissionsArr.forEach((perm, i) => {
    if (skip.has(`$.permissions[${i}]`)) return;
    if (!perm || typeof perm !== 'object') return;
    const refs = referencedBy.get(perm.id);
    if (!refs || refs.length === 0) return;
    if (typeof perm.reason !== 'string') return;

    // Partition the failure space:
    //   0 of N mentioned  → no_action_ref      (existing rule)
    //   some-but-not-all  → action_ref_incomplete (this is candidate #1)
    //   all N mentioned   → clean
    // action_ref_incomplete only fires when refs.length >= 2: a permission
    // referenced by exactly one action cannot be "partially named", so
    // the 0-of-1 case falls cleanly into no_action_ref's territory.
    const reason = perm.reason;
    const mentioned = refs.filter((actionId) => reason.includes(actionId));
    const missing = refs.filter((actionId) => !reason.includes(actionId));

    if (mentioned.length === 0) {
      warnings.push({
        code: 'permission.reason.no_action_ref',
        where: `$.permissions[${i}].reason`,
        expected: `reason mentions at least one of: ${refs.join(', ')}`,
        actual: `"${perm.reason}"`,
        fixHint:
          'Name the action(s) that use this permission so an approver can trace each grant to a caller.',
      });
    } else if (missing.length > 0 && refs.length >= 2) {
      warnings.push({
        code: 'permission.reason.action_ref_incomplete',
        where: `$.permissions[${i}].reason`,
        expected: `reason mentions all of: ${refs.join(', ')}`,
        actual: `mentions ${mentioned.length} of ${refs.length} (${mentioned.join(', ')}); missing: ${missing.join(', ')}`,
        fixHint:
          'Name every action that uses this permission so an approver sees the full call surface, not just one caller.',
      });
    }
  });

  return { errors, warnings };
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const ID_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function validateCapabilityManifest(input: unknown): ManifestValidationResult {
  const errors: ManifestError[] = [];
  const brokenPaths = new Set<string>();
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
      brokenPaths: ['$'],
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

  const permissionIds = new Set<string>();
  if (!Array.isArray(m.permissions)) {
    push({
      code: 'manifest.permissions.type',
      where: '$.permissions',
      expected: 'array',
      actual: typeOf(m.permissions),
      fixHint: 'Set permissions to an array (use [] if none, but actions cannot reference any).',
    });
    brokenPaths.add('$.permissions');
  } else {
    m.permissions.forEach((p, i) => {
      const where = `$.permissions[${i}]`;
      if (!isPlainObject(p)) brokenPaths.add(where);
      validatePermission(p, where, permissionIds, push);
    });
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
    brokenPaths.add('$.actions');
  } else if (m.actions.length === 0) {
    push({
      code: 'manifest.actions.empty',
      where: '$.actions',
      expected: 'at least one action',
      actual: 'empty array',
      fixHint: 'A capability must declare at least one action; otherwise it has no behavior.',
    });
  } else {
    m.actions.forEach((a, i) => {
      const where = `$.actions[${i}]`;
      if (!isPlainObject(a)) brokenPaths.add(where);
      validateAction(a, where, actionIds, permissionIds, push);
    });
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

  return { valid: errors.length === 0, errors, brokenPaths: Array.from(brokenPaths) };
}

/**
 * Run structural validation and hardening in a single pass, returning the
 * combined errors and warnings. Hardening runs even when structural fails,
 * skipping subtrees that structural marked as too broken to harden
 * meaningfully (e.g. a `permissions[2]` that isn't an object). The result is
 * `valid: true` only when both stages clear; warnings are surfaced regardless.
 *
 * Prefer this over `validateCapabilityManifest` + `hardenManifest` at call
 * sites that want first-pass exhaustiveness. The dogfood pipeline ceiling
 * drops from 2 round-trips to 1 for mixed-error manifests.
 */
export function verifyManifest(input: unknown): ManifestVerificationResult {
  const v = validateCapabilityManifest(input);
  if (!isPlainObject(input)) {
    return { valid: false, errors: v.errors, warnings: [] };
  }
  // Hardening is tolerant of partial shapes (it walks via skipPaths-aware
  // optional access), so a double-cast is safe here even when structural
  // failed — broken subtrees are routed around.
  const h = hardenManifest(input as unknown as CapabilityManifest, {
    skipPaths: new Set(v.brokenPaths),
  });
  return {
    valid: v.valid && h.errors.length === 0,
    errors: [...v.errors, ...h.errors],
    warnings: h.warnings,
  };
}

function validatePermission(
  perm: unknown,
  where: string,
  seen: Set<string>,
  push: (e: ManifestError) => void
): void {
  if (!isPlainObject(perm)) {
    push({
      code: 'permission.not_object',
      where,
      expected: 'object',
      actual: typeOf(perm),
      fixHint: 'Each permission must be an object with type, id, reason.',
    });
    return;
  }

  const p = perm as Record<string, unknown>;
  const type = p.type;
  if (typeof type !== 'string' || !PERMISSION_TYPES.includes(type as PermissionType)) {
    push({
      code: 'permission.type',
      where: `${where}.type`,
      expected: `one of ${PERMISSION_TYPES.join(', ')}`,
      actual: String(type),
      fixHint: 'Use a supported permission type.',
    });
    return;
  }

  const idOk = requireString(p, 'id', `${where}.id`, push, ID_RE);
  if (idOk && typeof p.id === 'string') {
    if (seen.has(p.id)) {
      push({
        code: 'permission.duplicate_id',
        where: `${where}.id`,
        expected: 'unique permission id',
        actual: `duplicate "${p.id}"`,
        fixHint: 'Each permission id must be unique within the manifest.',
      });
    } else {
      seen.add(p.id);
    }
  }

  requireString(p, 'reason', `${where}.reason`, push);

  if (type === 'network') {
    if (!Array.isArray(p.hosts) || p.hosts.length === 0) {
      push({
        code: 'permission.network.hosts',
        where: `${where}.hosts`,
        expected: 'non-empty string array',
        actual: typeOf(p.hosts),
        fixHint: 'List the hostnames this permission is allowed to reach.',
      });
    } else {
      p.hosts.forEach((h, i) => {
        if (typeof h !== 'string' || h.length === 0) {
          push({
            code: 'permission.network.host_value',
            where: `${where}.hosts[${i}]`,
            expected: 'non-empty string',
            actual: typeOf(h),
            fixHint: 'Each host must be a non-empty string (e.g. "api.example.com").',
          });
        }
      });
    }
    validateMethods(p.methods, where, push);
  }

  if (type === 'network-dynamic') {
    if (!isPlainObject(p.hostPolicy)) {
      push({
        code: 'permission.network-dynamic.host_policy',
        where: `${where}.hostPolicy`,
        expected: 'object',
        actual: typeOf(p.hostPolicy),
        fixHint: 'Add a hostPolicy object with at least { registrableDomain: ["example.com"] }.',
      });
    } else {
      const hp = p.hostPolicy as Record<string, unknown>;
      const hpWhere = `${where}.hostPolicy`;

      if (!Array.isArray(hp.registrableDomain) || hp.registrableDomain.length === 0) {
        push({
          code: 'permission.network-dynamic.registrable_domain',
          where: `${hpWhere}.registrableDomain`,
          expected: 'non-empty string array',
          actual: typeOf(hp.registrableDomain),
          fixHint: 'Declare at least one registrable domain (e.g. ["acme.com"]).',
        });
      } else {
        hp.registrableDomain.forEach((d, i) => {
          if (typeof d !== 'string' || d.length === 0) {
            push({
              code: 'permission.network-dynamic.registrable_domain_value',
              where: `${hpWhere}.registrableDomain[${i}]`,
              expected: 'non-empty string',
              actual: typeOf(d),
              fixHint: 'Each entry must be a non-empty string (e.g. "acme.com").',
            });
          }
        });
      }

      if (hp.scheme !== undefined) {
        if (!Array.isArray(hp.scheme)) {
          push({
            code: 'permission.network-dynamic.scheme',
            where: `${hpWhere}.scheme`,
            expected: 'array of "http" | "https"',
            actual: typeOf(hp.scheme),
            fixHint: 'Use an array containing "http" and/or "https", or omit it.',
          });
        } else {
          hp.scheme.forEach((s, i) => {
            if (s !== 'http' && s !== 'https') {
              push({
                code: 'permission.network-dynamic.scheme_value',
                where: `${hpWhere}.scheme[${i}]`,
                expected: '"http" or "https"',
                actual: typeof s === 'string' ? `"${s}"` : typeOf(s),
                fixHint: 'Use "http" or "https"; other schemes are not supported.',
              });
            }
          });
        }
      }

      if (hp.port !== undefined) {
        if (!Array.isArray(hp.port)) {
          push({
            code: 'permission.network-dynamic.port',
            where: `${hpWhere}.port`,
            expected: 'array of port numbers',
            actual: typeOf(hp.port),
            fixHint: 'Use an array of integers in 1..65535, or omit it.',
          });
        } else {
          hp.port.forEach((pn, i) => {
            if (typeof pn !== 'number' || !Number.isInteger(pn) || pn < 1 || pn > 65535) {
              push({
                code: 'permission.network-dynamic.port_value',
                where: `${hpWhere}.port[${i}]`,
                expected: 'integer in 1..65535',
                actual: typeof pn === 'number' ? String(pn) : typeOf(pn),
                fixHint: 'Each port must be an integer between 1 and 65535.',
              });
            }
          });
        }
      }

      if (hp.denyPrivate !== undefined && typeof hp.denyPrivate !== 'boolean') {
        push({
          code: 'permission.network-dynamic.deny_private',
          where: `${hpWhere}.denyPrivate`,
          expected: 'boolean',
          actual: typeOf(hp.denyPrivate),
          fixHint: 'Use true (default) or false; omit to keep the safe default.',
        });
      }

      if (hp.pathPrefix !== undefined) {
        if (!Array.isArray(hp.pathPrefix)) {
          push({
            code: 'permission.network-dynamic.path_prefix',
            where: `${hpWhere}.pathPrefix`,
            expected: 'array of path prefixes',
            actual: typeOf(hp.pathPrefix),
            fixHint: 'Use an array of strings starting with "/", or omit it.',
          });
        } else {
          hp.pathPrefix.forEach((pp, i) => {
            if (typeof pp !== 'string' || !pp.startsWith('/')) {
              push({
                code: 'permission.network-dynamic.path_prefix_value',
                where: `${hpWhere}.pathPrefix[${i}]`,
                expected: 'string starting with "/"',
                actual: typeof pp === 'string' ? `"${pp}"` : typeOf(pp),
                fixHint: 'Each prefix must start with "/" (e.g. "/api/v1/").',
              });
            }
          });
        }
      }
    }

    validateMethods(p.methods, where, push);
  }

  if (type === 'storage') {
    requireString(p, 'scope', `${where}.scope`, push);
    if (typeof p.mode !== 'string' || !STORAGE_MODES.includes(p.mode as StorageMode)) {
      push({
        code: 'permission.storage.mode',
        where: `${where}.mode`,
        expected: `one of ${STORAGE_MODES.join(', ')}`,
        actual: String(p.mode),
        fixHint: 'Storage mode must be read, write, or readwrite.',
      });
    }
  }
}

// Shared by type:network and type:network-dynamic — both constrain HTTP
// methods identically, and both report under the permission.network.* codes
// so a fix learned on one type transfers to the other.
function validateMethods(
  methods: unknown,
  where: string,
  push: (e: ManifestError) => void
): void {
  if (methods === undefined) return;
  if (!Array.isArray(methods)) {
    push({
      code: 'permission.network.methods',
      where: `${where}.methods`,
      expected: 'array of HTTP methods',
      actual: typeOf(methods),
      fixHint: `Use a subset of ${HTTP_METHODS.join(', ')}.`,
    });
    return;
  }
  methods.forEach((mm, i) => {
    if (typeof mm !== 'string' || !HTTP_METHODS.includes(mm as HttpMethod)) {
      push({
        code: 'permission.network.method_value',
        where: `${where}.methods[${i}]`,
        expected: `one of ${HTTP_METHODS.join(', ')}`,
        actual: String(mm),
        fixHint: 'Use a supported HTTP method.',
      });
    }
  });
}

function validateAction(
  action: unknown,
  where: string,
  seen: Set<string>,
  permissionIds: Set<string>,
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

  if (!Array.isArray(a.permissions)) {
    push({
      code: 'action.permissions.type',
      where: `${where}.permissions`,
      expected: 'array of permission ids',
      actual: typeOf(a.permissions),
      fixHint: 'List the permission ids this action may use (use [] for pure actions).',
    });
  } else {
    a.permissions.forEach((permId, i) => {
      if (typeof permId !== 'string') {
        push({
          code: 'action.permission_ref.type',
          where: `${where}.permissions[${i}]`,
          expected: 'string',
          actual: typeOf(permId),
          fixHint: 'Each entry must be a permission id declared in $.permissions.',
        });
        return;
      }
      if (!permissionIds.has(permId)) {
        push({
          code: 'action.permission_ref.unknown',
          where: `${where}.permissions[${i}]`,
          expected: 'a permission id declared in $.permissions',
          actual: `"${permId}"`,
          fixHint: `Declare a permission with id "${permId}" or remove this reference.`,
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
