export function matchesRegistrableDomain(host: string, domains: readonly string[]): boolean {
  const h = host.toLowerCase();
  for (const raw of domains) {
    const d = raw.toLowerCase();
    if (h === d) return true;
    if (h.endsWith('.' + d)) return true;
  }
  return false;
}
