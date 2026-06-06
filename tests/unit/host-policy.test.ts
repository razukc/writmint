import { describe, it, expect } from 'vitest';
import { matchesRegistrableDomain } from '../../src/host-policy.js';

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
