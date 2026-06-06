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

export type PrivateIpResult = { private: false } | { private: true; range: string };

export function isPrivateIp(ip: string): PrivateIpResult {
  // IPv4 dotted-quad
  const v4 = ip.match(IPV4_RE);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return { private: true, range: 'rfc1918-10/8' };
    if (a === 172 && b >= 16 && b <= 31) return { private: true, range: 'rfc1918-172.16/12' };
    if (a === 192 && b === 168) return { private: true, range: 'rfc1918-192.168/16' };
    if (a === 127) return { private: true, range: 'loopback-127/8' };
    if (a === 169 && b === 254) return { private: true, range: 'link-local-169.254/16' };
    return { private: false };
  }

  // IPv6 — compare lowercased prefix
  const v6 = ip.toLowerCase();
  if (v6 === '::1') return { private: true, range: 'loopback-::1' };
  // fc00::/7 covers fc00::/8 and fd00::/8
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return { private: true, range: 'unique-local-fc00::/7' };
  // fe80::/10 — first 10 bits are 1111111010, i.e. fe80..febf
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return { private: true, range: 'link-local-fe80::/10' };
  return { private: false };
}
