import { describe, it, expect } from 'vitest';
import { matchesRegistrableDomain, isValidRegistrableDomainEntry, classifyHost, type HostKind, isPrivateIp } from '../../src/host-policy.js';

describe('matchesRegistrableDomain', () => {
  it('matches an exact domain', () => {
    expect(matchesRegistrableDomain('acme.com', ['acme.com'])).toBe(true);
  });

  it('matches a label-boundary subdomain', () => {
    expect(matchesRegistrableDomain('status.acme.com', ['acme.com'])).toBe(true);
  });

  it('rejects a non-boundary suffix', () => {
    expect(matchesRegistrableDomain('evilacme.com', ['acme.com'])).toBe(false);
  });

  it('rejects a prefix collision', () => {
    expect(matchesRegistrableDomain('xacme.com', ['acme.com'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesRegistrableDomain('STATUS.ACME.COM', ['acme.com'])).toBe(true);
    expect(matchesRegistrableDomain('status.acme.com', ['ACME.COM'])).toBe(true);
  });

  it('returns true if any entry matches', () => {
    expect(matchesRegistrableDomain('status.b.com', ['a.com', 'b.com'])).toBe(true);
  });

  it('returns false on empty list', () => {
    expect(matchesRegistrableDomain('status.acme.com', [])).toBe(false);
  });
});

describe('isValidRegistrableDomainEntry', () => {
  it('accepts a simple hostname', () => {
    expect(isValidRegistrableDomainEntry('acme.com')).toBe(true);
  });

  it('accepts multi-label suffix', () => {
    expect(isValidRegistrableDomainEntry('co.uk')).toBe(true);
  });

  it('rejects wildcard', () => {
    expect(isValidRegistrableDomainEntry('*.acme.com')).toBe(false);
  });

  it('rejects bare wildcard', () => {
    expect(isValidRegistrableDomainEntry('*')).toBe(false);
  });

  it('rejects leading dot', () => {
    expect(isValidRegistrableDomainEntry('.acme.com')).toBe(false);
  });

  it('rejects trailing dot', () => {
    expect(isValidRegistrableDomainEntry('acme.com.')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRegistrableDomainEntry('')).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(isValidRegistrableDomainEntry(' acme.com')).toBe(false);
    expect(isValidRegistrableDomainEntry('acme.com ')).toBe(false);
  });

  it('rejects scheme prefix', () => {
    expect(isValidRegistrableDomainEntry('https://acme.com')).toBe(false);
  });
});

describe('classifyHost', () => {
  it('returns ipv4 for a dotted-quad', () => {
    expect(classifyHost('10.0.0.1')).toEqual<HostKind>({ kind: 'ipv4', ip: '10.0.0.1' });
  });

  it('returns ipv4 for a public dotted-quad', () => {
    expect(classifyHost('8.8.8.8')).toEqual<HostKind>({ kind: 'ipv4', ip: '8.8.8.8' });
  });

  it('returns ipv6 for a bracketed v6 literal', () => {
    expect(classifyHost('[::1]')).toEqual<HostKind>({ kind: 'ipv6', ip: '::1' });
  });

  it('returns ipv6 for a bracketed full v6 literal', () => {
    expect(classifyHost('[2606:4700:4700::1001]')).toEqual<HostKind>({ kind: 'ipv6', ip: '2606:4700:4700::1001' });
  });

  it('returns hostname for a domain name', () => {
    expect(classifyHost('status.acme.com')).toEqual<HostKind>({ kind: 'hostname', host: 'status.acme.com' });
  });

  it('lowercases the hostname', () => {
    expect(classifyHost('Status.Acme.Com')).toEqual<HostKind>({ kind: 'hostname', host: 'status.acme.com' });
  });
});

describe('isPrivateIp', () => {
  it.each([
    ['10.0.0.1',      'rfc1918-10/8'],
    ['10.255.255.255','rfc1918-10/8'],
    ['172.16.0.1',    'rfc1918-172.16/12'],
    ['172.31.255.254','rfc1918-172.16/12'],
    ['192.168.0.1',   'rfc1918-192.168/16'],
    ['127.0.0.1',     'loopback-127/8'],
    ['169.254.0.1',   'link-local-169.254/16'],
    // CGNAT space (RFC 6598) — appears inside some cloud VPCs, incl. the
    // Alibaba metadata endpoint 100.100.100.200.
    ['100.64.0.0',       'cgnat-100.64/10'],
    ['100.100.100.200',  'cgnat-100.64/10'],
    ['100.127.255.255',  'cgnat-100.64/10'],
  ])('rejects IPv4 %s as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  it.each([
    ['8.8.8.8'],
    ['93.184.216.34'],
    ['172.15.0.1'],
    ['172.32.0.1'],
    ['169.253.0.1'],
    ['100.63.255.255'],  // just below CGNAT
    ['100.128.0.0'],     // just above CGNAT
  ])('passes IPv4 %s', (ip) => {
    expect(isPrivateIp(ip)).toEqual({ private: false });
  });

  it.each([
    ['::1',          'loopback-::1'],
    ['fc00::1',      'unique-local-fc00::/7'],
    ['fd12:3456::1', 'unique-local-fc00::/7'],
    ['fe80::1',      'link-local-fe80::/10'],
  ])('rejects IPv6 %s as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  // Non-canonical IPv6 forms — transport resolvers may return expanded,
  // zero-padded, or alternatively-compressed strings. Classification is
  // parser-based (8 hextets), not string-shape-based, so these must all
  // land in the same ranges as their canonical spellings.
  it.each([
    ['0:0:0:0:0:0:0:1',                        'loopback-::1'],
    ['0000:0000:0000:0000:0000:0000:0000:0001', 'loopback-::1'],
    ['::0001',                                  'loopback-::1'],
    ['0::1',                                    'loopback-::1'],
    ['0:0:0:0:0:0:0:0',                         'unspecified-::'],
    ['0::0',                                    'unspecified-::'],
    ['0:0:0:0:0:ffff:7f00:1',                   'loopback-127/8'],
    ['::ffff:0a00:0001',                        'rfc1918-10/8'],
    ['FE80::1',                                 'link-local-fe80::/10'],
    ['FC00::1',                                 'unique-local-fc00::/7'],
    ['0:0:0:0:0:FFFF:7F00:1',                   'loopback-127/8'],
  ])('rejects non-canonical IPv6 %s as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  // Embedded dotted-quad inside expanded v4-mapped forms: the trailing
  // a.b.c.d parses into the last two hextets, then the v4 logic decides.
  it.each([
    ['0:0:0:0:0:ffff:127.0.0.1', 'loopback-127/8'],
    ['0:0:0:0:0:ffff:10.0.0.1',  'rfc1918-10/8'],
  ])('rejects expanded v4-mapped %s with embedded dotted quad as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  it('passes an expanded public IPv6 address', () => {
    expect(isPrivateIp('2606:4700:4700:0:0:0:0:1111')).toEqual({ private: false });
  });

  // Strings that parse as neither IPv4 nor IPv6 are signalled distinctly so
  // the broker can fail closed instead of mistaking garbage for "public".
  it.each([
    ['not-an-ip'],
    ['1:2:3'],          // too few groups, no compression
    ['1::2::3'],        // two compressions
    ['1:2:3:4:5:6:7:8:9'], // too many groups
    ['12345::1'],       // hextet too long
    ['999.1.2.3'],      // out-of-range IPv4 octet
    ['::ffff:1.2.3'],   // malformed embedded dotted quad
    ['fe80::1%eth0'],   // zone index — never expected here
    [''],
  ])('classifies %s as unparseable', (s) => {
    expect(isPrivateIp(s)).toEqual({ private: 'unparseable' });
  });

  it.each([
    ['2606:4700:4700::1001'],
    ['2606:4700:4700::1111'],
  ])('passes IPv6 %s', (ip) => {
    expect(isPrivateIp(ip)).toEqual({ private: false });
  });

  // IPv4-mapped IPv6 — the embedded v4 address decides; the range reported is the v4 range.
  it.each([
    ['::ffff:7f00:1',    'loopback-127/8'],   // hex form of 127.0.0.1
    ['::ffff:127.0.0.1', 'loopback-127/8'],   // dotted form
    ['::ffff:a00:1',     'rfc1918-10/8'],     // hex form of 10.0.0.1
  ])('rejects IPv4-mapped IPv6 %s as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  it.each([
    ['::ffff:808:808'],  // hex form of 8.8.8.8
    ['::ffff:8.8.8.8'],
  ])('passes IPv4-mapped IPv6 %s', (ip) => {
    expect(isPrivateIp(ip)).toEqual({ private: false });
  });

  // Unspecified addresses bind/connect to localhost on Linux/macOS.
  it.each([
    ['0.0.0.0', 'unspecified-0/8'],
    ['0.1.2.3', 'unspecified-0/8'],
  ])('rejects unspecified IPv4 %s as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  it('rejects IPv6 :: as unspecified-::', () => {
    expect(isPrivateIp('::')).toEqual({ private: true, range: 'unspecified-::' });
  });

  // Pins the module precondition: inputs come from new URL().hostname, which
  // normalizes octal/hex/short-form IPv4 before these checks ever see them.
  it('relies on WHATWG URL normalization of octal IPv4 (0177.0.0.1 → 127.0.0.1)', () => {
    const hostname = new URL('http://0177.0.0.1/').hostname;
    expect(hostname).toBe('127.0.0.1');
    expect(isPrivateIp(hostname)).toEqual({ private: true, range: 'loopback-127/8' });
  });

  // Completed deny set (was documented-deferred in v0.5.x): special-purpose
  // IPv4 ranges that are never legitimate public destinations.
  it.each([
    ['192.0.0.0',       'ietf-192.0.0/24'],      // protocol assignments (incl. DS-Lite)
    ['192.0.0.255',     'ietf-192.0.0/24'],
    ['192.0.2.0',       'test-net-192.0.2/24'],  // TEST-NET-1
    ['192.0.2.255',     'test-net-192.0.2/24'],
    ['192.88.99.0',     '6to4-relay-192.88.99/24'],
    ['192.88.99.255',   '6to4-relay-192.88.99/24'],
    ['198.18.0.0',      'benchmark-198.18/15'],
    ['198.19.255.255',  'benchmark-198.18/15'],
    ['198.51.100.0',    'test-net-198.51.100/24'], // TEST-NET-2
    ['198.51.100.255',  'test-net-198.51.100/24'],
    ['203.0.113.0',     'test-net-203.0.113/24'],  // TEST-NET-3
    ['203.0.113.255',   'test-net-203.0.113/24'],
    ['224.0.0.0',       'multicast-224/4'],
    ['224.0.0.251',     'multicast-224/4'],        // mDNS
    ['239.255.255.255', 'multicast-224/4'],
    ['240.0.0.0',       'reserved-240/4'],
    ['255.255.255.255', 'reserved-240/4'],         // broadcast
  ])('rejects special-purpose IPv4 %s as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  // Public neighbors of each new range stay public.
  it.each([
    ['192.0.1.0'],      // between 192.0.0/24 and 192.0.2/24
    ['192.0.3.0'],      // just above TEST-NET-1
    ['192.88.98.255'],  // just below 6to4 relay
    ['192.88.100.0'],   // just above 6to4 relay
    ['198.17.255.255'], // just below benchmarking
    ['198.20.0.0'],     // just above benchmarking
    ['198.51.99.255'],  // just below TEST-NET-2
    ['198.51.101.0'],   // just above TEST-NET-2
    ['203.0.112.255'],  // just below TEST-NET-3
    ['203.0.114.0'],    // just above TEST-NET-3
    ['223.255.255.255'],// just below multicast
  ])('passes boundary-neighbor IPv4 %s', (ip) => {
    expect(isPrivateIp(ip)).toEqual({ private: false });
  });

  // IPv4-mapped IPv6 wrapping the new ranges follows the embedded v4.
  it.each([
    ['::ffff:203.0.113.7', 'test-net-203.0.113/24'],
    ['::ffff:e000:fb',     'multicast-224/4'],     // hex form of 224.0.0.251
  ])('rejects IPv4-mapped IPv6 %s (completed deny set) as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  it('passes IPv4-mapped IPv6 wrapping a public neighbor (::ffff:192.0.1.5)', () => {
    expect(isPrivateIp('::ffff:192.0.1.5')).toEqual({ private: false });
  });

  // IPv6 parity for the completed deny set. Spelling-independent: the
  // classifier works on parsed hextets, so expanded/uppercase forms land in
  // the same ranges as canonical compressions.
  it.each([
    ['ff02::1',                              'multicast-ff00::/8'],   // all-nodes
    ['ff05::2',                              'multicast-ff00::/8'],
    ['FF02:0:0:0:0:0:0:1',                   'multicast-ff00::/8'],   // expanded uppercase
    ['2001:db8::1',                          'documentation-2001:db8/32'],
    ['2001:0db8:0000:0000:0000:0000:0000:1', 'documentation-2001:db8/32'],
    ['100::',                                'discard-100::/64'],     // RFC 6666
    ['100::1',                               'discard-100::/64'],
    ['0100:0:0:0:0:0:0:1',                   'discard-100::/64'],     // expanded
    ['64:ff9b:1::1',                         'nat64-local-64:ff9b:1::/48'], // RFC 8215
  ])('rejects special-purpose IPv6 %s as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  // Public neighbors stay public.
  it.each([
    ['fe00::1'],        // just below multicast (and outside fe80::/10)
    ['2001:db9::1'],    // just above documentation
    ['2001:db7::1'],    // just below documentation
    ['100:0:0:1::1'],   // outside 100::/64 (h[3] nonzero)
    ['101::1'],         // adjacent first hextet
  ])('passes IPv6 boundary-neighbor %s', (ip) => {
    expect(isPrivateIp(ip)).toEqual({ private: false });
  });

  // Tunnel prefixes embedding an IPv4 address: classify the embedded v4 and
  // report its range. Public tunnel targets stay allowed.
  it.each([
    // NAT64 well-known prefix 64:ff9b::/96 — v4 in the last 32 bits.
    ['64:ff9b::a00:1',     'rfc1918-10/8'],          // wraps 10.0.0.1
    ['64:ff9b::7f00:1',    'loopback-127/8'],        // wraps 127.0.0.1
    ['64:ff9b::10.0.0.1',  'rfc1918-10/8'],          // dotted-quad spelling
    // 6to4 2002::/16 — v4 in hextets 1–2.
    ['2002:a00:1::',       'rfc1918-10/8'],          // wraps 10.0.0.1
    ['2002:7f00:1::',      'loopback-127/8'],        // wraps 127.0.0.1
    ['2002:c0a8:101::',    'rfc1918-192.168/16'],    // wraps 192.168.1.1
    // Teredo 2001::/32 — client v4 in the last 32 bits, bit-inverted.
    ['2001::3f57:fefe',    'rfc1918-192.168/16'],    // wraps 192.168.1.1 (inverted)
    ['2001:0:0:0:0:0:3f57:fefe', 'rfc1918-192.168/16'], // expanded spelling
  ])('rejects tunnel form %s embedding a private IPv4 as %s', (ip, range) => {
    expect(isPrivateIp(ip)).toEqual({ private: true, range });
  });

  it.each([
    ['64:ff9b::808:808'],  // NAT64 wrapping 8.8.8.8
    ['64:ff9b::8.8.8.8'],
    ['2002:808:808::'],    // 6to4 wrapping 8.8.8.8
    ['2001::f7f7:f7f7'],   // Teredo wrapping 8.8.8.8 (inverted)
  ])('passes tunnel form %s embedding a public IPv4', (ip) => {
    expect(isPrivateIp(ip)).toEqual({ private: false });
  });
});
