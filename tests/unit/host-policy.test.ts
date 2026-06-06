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
    expect(classifyHost('[2001:db8::1]')).toEqual<HostKind>({ kind: 'ipv6', ip: '2001:db8::1' });
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
    ['203.0.113.1'],
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
    ['2001:db8::1'],
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
});
