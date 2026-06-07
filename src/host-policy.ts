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

// Documented-not-denied (deliberate, not oversights): ORCHIDv2 2001:20::/28
// (overlay identifiers, not routable targets in practice), deprecated
// site-local fec0::/10, and deprecated IPv4-compatible ::x.x.x.x (parses via
// the generic v6 path and classifies public). An `IPNet`-style policy
// clause remains the planned home for *allowing* back into denied space.
function classifyV4(a: number, b: number, c: number): PrivateIpResult {
  if (a === 0) return { private: true, range: 'unspecified-0/8' };
  if (a === 10) return { private: true, range: 'rfc1918-10/8' };
  // CGNAT space appears inside some cloud VPCs, incl. the Alibaba metadata
  // endpoint 100.100.100.200 — a documented SSRF target.
  if (a === 100 && b >= 64 && b <= 127) return { private: true, range: 'cgnat-100.64/10' };
  if (a === 172 && b >= 16 && b <= 31) return { private: true, range: 'rfc1918-172.16/12' };
  if (a === 192 && b === 168) return { private: true, range: 'rfc1918-192.168/16' };
  if (a === 127) return { private: true, range: 'loopback-127/8' };
  if (a === 169 && b === 254) return { private: true, range: 'link-local-169.254/16' };
  // Special-purpose ranges: never legitimate public destinations. A resolver
  // answer here is a misconfiguration or an SSRF probe — fail closed.
  // Blanket /24: the globally-reachable carve-outs (192.0.0.9 PCP, .10 TURN)
  // are intentionally denied — fail closed.
  if (a === 192 && b === 0 && c === 0) return { private: true, range: 'ietf-192.0.0/24' };
  if (a === 192 && b === 0 && c === 2) return { private: true, range: 'test-net-192.0.2/24' };
  if (a === 192 && b === 88 && c === 99) return { private: true, range: '6to4-relay-192.88.99/24' };
  if (a === 198 && (b === 18 || b === 19)) return { private: true, range: 'benchmark-198.18/15' };
  if (a === 198 && b === 51 && c === 100) return { private: true, range: 'test-net-198.51.100/24' };
  if (a === 203 && b === 0 && c === 113) return { private: true, range: 'test-net-203.0.113/24' };
  if (a >= 224 && a <= 239) return { private: true, range: 'multicast-224/4' };
  // 255.255.255.255 (limited broadcast) is its own IANA entry but lands here;
  // same deny outcome, one fewer clause.
  if (a >= 240) return { private: true, range: 'reserved-240/4' };
  return { private: false };
}

export function isPrivateIp(ip: string): PrivateIpResult {
  // IPv4 dotted-quad
  const v4 = ip.match(IPV4_RE);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    if (a > 255 || b > 255 || c > 255 || Number(v4[4]) > 255) {
      return { private: 'unparseable' };
    }
    return classifyV4(a, b, c);
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
    if (h[5] === 0xffff) return classifyV4(h[6] >> 8, h[6] & 0xff, h[7] >> 8);
  }
  // fc00::/7 covers fc00::/8 and fd00::/8
  if ((h[0] & 0xfe00) === 0xfc00) return { private: true, range: 'unique-local-fc00::/7' };
  // fe80::/10 — first 10 bits are 1111111010
  if ((h[0] & 0xffc0) === 0xfe80) return { private: true, range: 'link-local-fe80::/10' };
  // ff00::/8 — all IPv6 multicast.
  if ((h[0] & 0xff00) === 0xff00) return { private: true, range: 'multicast-ff00::/8' };
  // 2001:db8::/32 — documentation (RFC 3849); v6 analogue of TEST-NET.
  if (h[0] === 0x2001 && h[1] === 0xdb8) return { private: true, range: 'documentation-2001:db8/32' };
  // 100::/64 — discard-only (RFC 6666).
  if (h[0] === 0x100 && h[1] === 0 && h[2] === 0 && h[3] === 0) {
    return { private: true, range: 'discard-100::/64' };
  }
  // 64:ff9b:1::/48 — local-use NAT64 (RFC 8215): locally scoped by definition.
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 1) {
    return { private: true, range: 'nat64-local-64:ff9b:1::/48' };
  }
  // Tunnel prefixes embedding an IPv4 address: classify the embedded v4,
  // same as the IPv4-mapped branch above. Public tunnel targets stay allowed.
  // NAT64 well-known prefix 64:ff9b::/96 (RFC 6052) — v4 in the last 32 bits.
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return classifyV4(h[6] >> 8, h[6] & 0xff, h[7] >> 8);
  }
  // 6to4 2002::/16 (RFC 3056) — v4 in hextets 1–2.
  if (h[0] === 0x2002) {
    return classifyV4(h[1] >> 8, h[1] & 0xff, h[2] >> 8);
  }
  // Teredo 2001::/32 (RFC 4380) — client v4 in the last 32 bits, bit-inverted.
  if (h[0] === 0x2001 && h[1] === 0) {
    const v6 = h[6] ^ 0xffff;
    const v7 = h[7] ^ 0xffff;
    return classifyV4(v6 >> 8, v6 & 0xff, v7 >> 8);
  }
  return { private: false };
}
