export function matchesRegistrableDomain(host: string, domains: readonly string[]): boolean {
  const h = host.toLowerCase();
  for (const raw of domains) {
    const d = raw.toLowerCase();
    if (h === d) return true;
    if (h.endsWith('.' + d)) return true;
  }
  return false;
}

// A valid entry is a hostname-shaped string: at least one label, no wildcards,
// no leading/trailing dots, no whitespace, no scheme. Conservative; we only
// accept strings that already look like the host part of a URL.
const VALID_ENTRY_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export function isValidRegistrableDomainEntry(entry: string): boolean {
  if (typeof entry !== 'string' || entry.length === 0) return false;
  if (entry.includes('*')) return false;
  return VALID_ENTRY_RE.test(entry);
}

export type HostKind =
  | { kind: 'ipv4'; ip: string }
  | { kind: 'ipv6'; ip: string }
  | { kind: 'hostname'; host: string };

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function classifyHost(raw: string): HostKind {
  // URL.host wraps v6 in brackets; strip them.
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return { kind: 'ipv6', ip: raw.slice(1, -1).toLowerCase() };
  }
  const m = raw.match(IPV4_RE);
  if (m && [m[1], m[2], m[3], m[4]].every((p) => Number(p) >= 0 && Number(p) <= 255)) {
    return { kind: 'ipv4', ip: raw };
  }
  return { kind: 'hostname', host: raw.toLowerCase() };
}
