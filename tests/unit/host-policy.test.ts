import { describe, it, expect } from 'vitest';
import { matchesRegistrableDomain, isValidRegistrableDomainEntry } from '../../src/host-policy.js';

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
