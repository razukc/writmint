import { describe, it, expect } from 'vitest';
import { matchesRegistrableDomain, isValidRegistrableDomainEntry, classifyHost, type HostKind } from '../../src/host-policy.js';

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
