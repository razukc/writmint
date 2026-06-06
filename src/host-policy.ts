/**
 * Host policy checks for outbound network access (SSRF defense).
 *
 * PRECONDITION: All host/IP inputs are expected to be WHATWG-URL-normalized
 * (i.e. taken from `new URL(...).host` / `.hostname`). Raw user strings must
 * not be passed directly: URL normalization resolves octal/hex/short-form
 * IPv4 (e.g. 0177.0.0.1 → 127.0.0.1) which these checks rely on.
 */
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

// `private: 'unparseable'` means the string is neither a valid IPv4 nor a
// valid IPv6 address. Callers classifying transport-resolved strings must
// treat it as a hard failure (fail closed) — never as "public".
export type PrivateIpResult =
  | { private: false }
  | { private: true; range: string }
  | { private: 'unparseable' };

/**
 * Expand an IPv6 string to its 8 hextets. Handles `::` compression at any
 * position, leading-zero/uppercase variation, and an embedded dotted quad in
 * the final position (`::ffff:127.0.0.1`). Returns null on malformed input
 * (zone indexes, too many/few groups, double `::`, oversized hextets).
 */
function parseIpv6(raw: string): number[] | null {
  const parts = raw.toLowerCase().split('::');
  if (parts.length > 2) return null;

  const parseGroups = (str: string, allowDotted: boolean): number[] | null => {
    if (str === '') return [];
    const groups = str.split(':');
    const out: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (allowDotted && i === groups.length - 1 && g.includes('.')) {
        // Embedded dotted quad fills the last two hextets.
        const m = g.match(IPV4_RE);
        if (!m) return null;
        const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
        if (o.some((x) => x > 255)) return null;
        out.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  if (parts.length === 1) {
    const groups = parseGroups(parts[0], true);
    return groups && groups.length === 8 ? groups : null;
  }
  const head = parseGroups(parts[0], false);
  const tail = parseGroups(parts[1], true);
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  // `::` stands for at least one zero group.
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

// Deliberately excluded from the v1 deny set (deferred, not oversights):
// `192.0.0.0/24` (IETF protocol assignments), `198.18.0.0/15` (benchmarking),
// and `224.0.0.0/4` + `240.0.0.0/4` (multicast/reserved). An `IPNet`-style
// policy clause is the planned home for tightening these — consistent with
// the design spec's out-of-scope item on custom range policies.
function classifyV4(a: number, b: number): PrivateIpResult {
  if (a === 0) return { private: true, range: 'unspecified-0/8' };
  if (a === 10) return { private: true, range: 'rfc1918-10/8' };
  // CGNAT space appears inside some cloud VPCs, incl. the Alibaba metadata
  // endpoint 100.100.100.200 — a documented SSRF target.
  if (a === 100 && b >= 64 && b <= 127) return { private: true, range: 'cgnat-100.64/10' };
  if (a === 172 && b >= 16 && b <= 31) return { private: true, range: 'rfc1918-172.16/12' };
  if (a === 192 && b === 168) return { private: true, range: 'rfc1918-192.168/16' };
  if (a === 127) return { private: true, range: 'loopback-127/8' };
  if (a === 169 && b === 254) return { private: true, range: 'link-local-169.254/16' };
  return { private: false };
}

export function isPrivateIp(ip: string): PrivateIpResult {
  // IPv4 dotted-quad
  const v4 = ip.match(IPV4_RE);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a > 255 || b > 255 || Number(v4[3]) > 255 || Number(v4[4]) > 255) {
      return { private: 'unparseable' };
    }
    return classifyV4(a, b);
  }

  // IPv6 — all range checks run against the parsed hextet array, never the
  // string shape: resolvers may return expanded/uncompressed/uppercase forms.
  const h = parseIpv6(ip);
  if (!h) return { private: 'unparseable' };
  if (h.every((x) => x === 0)) return { private: true, range: 'unspecified-::' };
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0) {
    if (h[5] === 0 && h[6] === 0 && h[7] === 1) return { private: true, range: 'loopback-::1' };
    // IPv4-mapped IPv6 (::ffff:0:0/96): the embedded v4 address is what
    // matters — classify the last 32 bits and report the v4 range.
    if (h[5] === 0xffff) return classifyV4(h[6] >> 8, h[6] & 0xff);
  }
  // fc00::/7 covers fc00::/8 and fd00::/8
  if ((h[0] & 0xfe00) === 0xfc00) return { private: true, range: 'unique-local-fc00::/7' };
  // fe80::/10 — first 10 bits are 1111111010
  if ((h[0] & 0xffc0) === 0xfe80) return { private: true, range: 'link-local-fe80::/10' };
  return { private: false };
}
