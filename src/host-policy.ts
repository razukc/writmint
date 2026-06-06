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
